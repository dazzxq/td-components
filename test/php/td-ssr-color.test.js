// v0.48.0 (plan v0.48.0-color-picker QĐ 1, 19, 19b, M2) — PHP side of the SSR contract `color-picker@1`:
//   - td_color_value(): the ONE server normalisation (#rgb / #rrggbb, `#` optional, trimmed → #rrggbb lowercase; '' / null
//     → ''; anything else → null = the site answers 422), agreeing with the JS parseColorInput() on every hex input;
//   - td_color_picker(): NATIVE by default (a text input with pattern #RRGGBB — works without JS, never type=color), ELEMENT
//     mode opt-in (<td-color-picker data-td-ssr="color-picker@1"> + the same field); value / presets normalised through
//     td_color_value() (an unparsable value is kept + ONE warning, a bad preset dropped + ONE warning); owned names and
//     data-td-* reserved in `attrs`; escaping.
// Shared fixtures: test/ssr/color-picker.fixtures.json (also consumed by the SSR browser test through
// test/ssr/fixtures/color-picker.html — this test fails when it is stale: `node test/ssr/build-color-picker-fixture.mjs`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';
import { parseColorInput, parsePresets as parsePresetsJs } from '../../src/utils/color-picker-model.js';
import { COLOR_PICKER_FIXTURE_FILE, renderColorPickerFixture } from '../ssr/ssr.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

/**
 * Calls in ONE php process, each with its own td_color_picker warnings (the harness forbids stderr).
 * @param {Array<[string, any[]]>} calls
 * @returns {Array<{ out: any, warns: string[] }>}
 */
function run(calls) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ` $calls = json_decode(${JSON.stringify(JSON.stringify(calls))}, true, 64, JSON_THROW_ON_ERROR); $res = [];`
    + ' foreach ($calls as [$fn, $a]) { $w = []; set_error_handler(function (int $no, string $msg) use (&$w): bool {'
    + " if ($no === E_USER_WARNING && str_starts_with($msg, 'td_color_picker:')) { $w[] = $msg; return true; } return false; });"
    + ' $out = $fn(...$a); restore_error_handler(); $res[] = [\'out\' => $out, \'warns\' => $w]; }'
    + ' echo json_encode($res, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}
const one = (fn, ...args) => run([[fn, args]])[0];

const FIXED = 'inputmode="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="64" placeholder="#000000"';
const NOJS = 'pattern="#[0-9a-fA-F]{6}" title="Dạng #RRGGBB, ví dụ #1d4ed8"';
const SWATCH = '<span class="td-color__swatch" aria-hidden="true"></span>';

/** [input, td_color_value() result] — plan M2 table + extras */
export const COLOR_VALUE_CASES = [
  ['#AABBCC', '#aabbcc'], ['abc', '#aabbcc'], [' #AbC ', '#aabbcc'], ['#1d4ed8', '#1d4ed8'], ['1D4ED8', '#1d4ed8'],
  ['\t#fff\n', '#ffffff'], ['', ''], [null, ''], ['   ', ''],
  ['#abcd', null], ['#aabbccdd', null], ['rgb(0,0,0)', null], ['red', null], ['#ggg', null], ['##abc', null], ['#ab', null],
  ['#abc\u0000', null], ['#abc;', null], [['#abc'], null], [123, null], [0xabcdef, null], [true, null], [{ v: '#abc' }, null],
  [`#${'a'.repeat(64)}`, null], [`${' '.repeat(62)}abc`, null],
];

describe('php/td.php — td_color_value / td_color_picker (v0.48.0, contract color-picker@1)', opts, () => {
  test('td_color_value: the server normalisation table', () => {
    const out = run(COLOR_VALUE_CASES.map(([v]) => ['td_color_value', [v]]));
    COLOR_VALUE_CASES.forEach(([v, want], i) => assert.equal(out[i].out, want, `php ${JSON.stringify(v)}`));
  });

  test('td_color_value agrees with the JS parseColorInput on every hex-shaped input (and is stricter elsewhere)', () => {
    const out = run(COLOR_VALUE_CASES.map(([v]) => ['td_color_value', [v]]));
    COLOR_VALUE_CASES.forEach(([v], i) => {
      const php = out[i].out;
      const js = parseColorInput(v);
      if (php === '') assert.ok(v == null || js.reason === 'empty', JSON.stringify(v));
      else if (php !== null) assert.deepEqual(js, { ok: true, hex: php }, JSON.stringify(v));
    });
    // random 3 / 6 digit hex, any case, with or without `#`
    let seed = 9;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
    const inputs = Array.from({ length: 200 }, () => {
      const n = rnd() % 2 ? 3 : 6;
      let s = '';
      for (let i = 0; i < n; i++) s += '0123456789abcdefABCDEF'[rnd() % 22];
      return rnd() % 2 ? `#${s}` : s;
    });
    const res = run(inputs.map((s) => ['td_color_value', [s]]));
    inputs.forEach((s, i) => assert.equal(res[i].out, parseColorInput(s).hex, s));
  });

  test('native (default): label + box > grey swatch + text input with the no-JS pattern; never type=color', () => {
    const r = one('td_color_picker', 'brand', {});
    assert.equal(r.out, '<div class="td-color"><div class="td-color__box">' + SWATCH
      + `<input type="text" class="td-color__input" id="td-brand-1-input" ${FIXED} name="brand" ${NOJS} aria-label="Mã màu"></div></div>`);
    assert.deepEqual(r.warns, []);
    const full = one('td_color_picker', 'brand', { id: 'b', label: 'Màu <thương hiệu>', value: '#ABC', required: true, error: 'Sai "màu"', class: 'x', placeholder: '#FFFFFF', readonly: true });
    assert.equal(full.out, '<div class="td-color x"><label class="td-color__label" for="b">Màu &lt;thương hiệu&gt;</label><div class="td-color__box">' + SWATCH
      + `<input type="text" class="td-color__input" id="b" ${FIXED.replace('#000000', '#FFFFFF')} name="brand" value="#aabbcc" ${NOJS} required readonly`
      + ' aria-invalid="true" aria-errormessage="b-error" aria-describedby="b-error"></div>'
      + '<span class="td-field-error" id="b-error" data-for="b">Sai &quot;màu&quot;</span></div>');
    assert.ok(!/type="color"/.test(full.out));
  });

  test('element mode: host (component attributes) + the same field; presets / custom / contrast / eyedropper on the host', () => {
    const r = one('td_color_picker', 'accent', { element: true, id: 'a', label: 'Màu nhấn', value: '1D4ED8', presets: ['#B3261E', 'fff', 'nope', '#fff'],
      custom: false, contrast: true, eyedropper: false, disabled: true });
    assert.equal(r.out, '<td-color-picker data-td-ssr="color-picker@1" id="a-host" name="accent" value="#1d4ed8" label="Màu nhấn"'
      + ' presets="#b3261e #ffffff" custom="false" contrast eyedropper="false" disabled>'
      + '<div class="td-color"><label class="td-color__label" for="a">Màu nhấn</label><div class="td-color__box">' + SWATCH
      + `<input type="text" class="td-color__input" id="a" ${FIXED} name="accent" value="#1d4ed8" ${NOJS} disabled></div></div></td-color-picker>`);
    assert.equal(r.warns.length, 1, 'one warning for the dropped preset');
    const e = one('td_color_picker', 'c', { element: true, presets: [], error: 'Lỗi', aria_label: 'Màu nền' });
    assert.equal(e.out, '<td-color-picker data-td-ssr="color-picker@1" id="td-c-1" name="c" presets="" error-text="Lỗi" aria-label="Màu nền">'
      + '<div class="td-color"><div class="td-color__box">' + SWATCH
      + `<input type="text" class="td-color__input" id="td-c-1-input" ${FIXED} name="c" ${NOJS} aria-label="Màu nền"`
      + ' aria-invalid="true" aria-errormessage="td-c-1-error" aria-describedby="td-c-1-error"></div></div>'
      + '<span class="td-field-error" id="td-c-1-error" data-for="td-c-1">Lỗi</span></td-color-picker>');
  });

  test('an unparsable value is KEPT (escaped) + one warning — the element reports badInput, no server data is lost', () => {
    const r = one('td_color_picker', 'c', { element: true, value: '"><script>x</script>' });
    assert.equal(r.warns.length, 1);
    assert.ok(r.out.includes('value="&quot;&gt;&lt;script&gt;x&lt;/script&gt;"'), r.out);
    assert.ok(!r.out.includes('<script>'));
    const n = one('td_color_picker', 'c', { value: ['#fff'] });
    assert.equal(n.warns.length, 1, 'non-string value → dropped + warning');
    assert.ok(!/ value=/.test(n.out));
  });

  test('attrs: allowlisted on the input; owned names / data-td-* / handlers / form overrides never printed', () => {
    const r = one('td_color_picker', 'c', { element: true, attrs: { 'data-x': '1', onclick: 'x()', Name: 'evil', value: '#000', pattern: '.*',
      type: 'color', formaction: '/evil', 'data-td-ssr': 'x', title: 'T', maxlength: '9', autocomplete: 'on', class: 'z' } });
    assert.ok(r.out.includes(' data-x="1"'), r.out);
    assert.ok(!/onclick|evil|value="#000"|pattern="\.\*"|type="color"|formaction|data-td-ssr="x"|maxlength="9"|autocomplete="on"| title="T"|class="z"/.test(r.out), r.out);
    assert.equal((r.out.match(/ name="c"/g) || []).length, 2, 'host + input only');
  });

  // v0.48.0 Codex review SEC-01: bounded work + no oversized reflection (same caps as src/utils/color-picker-model.js)
  /** Run PHP code fed on stdin (big inputs are built IN php — no huge command line); returns its JSON output. */
  const runCode = (body) => {
    const code = `<?php require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
      + ' $w = 0; set_error_handler(function (int $no, string $msg) use (&$w): bool {'
      + " if ($no === E_USER_WARNING && str_starts_with($msg, 'td_color_picker:')) { $w++; return true; } return false; });"
      + ` $t0 = microtime(true); $out = (function () { ${body} })(); $ms = (microtime(true) - $t0) * 1000;`
      + ' echo json_encode([\'out\' => $out, \'warns\' => $w, \'ms\' => $ms], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
    const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-d', 'memory_limit=512M'], { input: code, encoding: 'utf8', maxBuffer: 64 << 20 });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '', r.stderr);
    return JSON.parse(r.stdout);
  };
  const presetsAttr = (html) => (/ presets="([^"]*)"/.exec(html) || [])[1];
  const SLACK = process.env.TD_PERF_STRICT === '1' ? 1 : 20;

  test('SEC-01: an invalid value longer than 64 is NOT reflected (omitted + one warning); 1 MiB → output stays small', () => {
    const r = runCode("return td_color_picker('c', ['element' => true, 'value' => str_repeat('<x>', 349526)]);");
    assert.equal(r.warns, 1);
    assert.ok(r.out.length < 1000, `output ${r.out.length} bytes`);
    assert.ok(!/ value=/.test(r.out), r.out);
    const n = runCode("return td_color_picker('c', ['value' => str_repeat('x', 65)]);");
    assert.ok(!/ value=/.test(n.out) && n.warns === 1, n.out);
    const short = runCode("return td_color_picker('c', ['value' => str_repeat('x', 64)]);");
    assert.ok(short.out.includes(` value="${'x'.repeat(64)}"`), 'a short invalid value is still kept (escaped)');
  });

  test('SEC-01: presets — huge string rejected before the split, 100 000 duplicates / sparse keys: ≤ 192 inspected', () => {
    const big = runCode("return td_color_picker('c', ['element' => true, 'presets' => str_repeat('#fff ', 1000000)]);");
    assert.equal(presetsAttr(big.out), '');
    assert.equal(big.warns, 1);
    assert.ok(big.ms < 200 * SLACK, `${big.ms} ms`);
    const dup = runCode("return td_color_picker('c', ['element' => true, 'presets' => array_fill(0, 100000, '#fff')]);");
    assert.equal(presetsAttr(dup.out), '#ffffff');
    assert.equal(dup.warns, 1, 'one fixed warning for the capped list');
    const sparse = runCode("return td_color_picker('c', ['element' => true, 'presets' => [0 => '#111', 5000000 => '#222', 9 => 'nope']]);");
    assert.equal(presetsAttr(sparse.out), '#111111 #222222');
    assert.equal(sparse.warns, 1);
  });

  test('SEC-01: JS / PHP parity of the caps (PRESET_CAP_CASES)', async () => {
    const { PRESET_CAP_CASES } = await import('../../src/utils/color-picker-model.js');
    const php = {
      '192 nope + #000 (193rd never inspected)': "array_merge(array_fill(0, 192, 'nope'), ['#000'])",
      '200 distinct codes → first 48': "array_map(fn ($i) => '#' . str_pad(dechex($i), 6, '0', STR_PAD_LEFT), range(0, 199))",
      'string at the byte cap': "str_pad('#abc', 192 * 64, ' ')",
      'string 1 byte over the cap': "str_pad('#abc', 192 * 64 + 1, ' ')",
    };
    for (const [name, make] of PRESET_CAP_CASES) {
      const r = runCode(`return td_color_picker('c', ['element' => true, 'presets' => ${php[name]}]);`);
      const got = (presetsAttr(r.out) || '').split(' ').filter(Boolean);
      const js = parsePresetsJs(make()).items.map((p) => p.hex);
      assert.deepEqual(got, js, name);
    }
  });

  test('test/ssr/fixtures/color-picker.html (browser fixture) is up to date', () => {
    assert.equal(readFileSync(COLOR_PICKER_FIXTURE_FILE, 'utf8'), renderColorPickerFixture(),
      'stale fixture: run `node test/ssr/build-color-picker-fixture.mjs`');
  });
});
