// v0.49.0 (ADR 0012 + 0022, plan docs/internal/plans/v0.49.0-choice-stepper.md M4) — PHP side of the SSR contract
// `choice-group@1`:
//   - td_choice_group(): ALWAYS the element + the exact tree <td-choice-group> renders, NATIVE radios with the real name,
//     `required` on every radio, `checked` on the selected one (no-JS form);
//   - escaping; option validation (dropped + ONE E_USER_WARNING naming position / key / type, never the raw value);
//   - swatch colour only through Td::safeColor (→ SVG fill), image only through td__media_url (http: only with
//     Td::allowHttpLinks — test/ssr/media-url.cases.json `php` column);
// Shared fixtures: test/ssr/choice.fixtures.json (also consumed by src/form/td-choice-group.ssr.engines.browser-test.js
// through test/ssr/fixtures/choice.html — this test fails when it is stale: `node test/ssr/build-choice-fixture.mjs`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';
import { CHOICE_FIXTURES, CHOICE_FIXTURE_FILE, renderChoiceFixture } from '../ssr/ssr.mjs';
import { CHOICE_LIMITS } from '../../src/utils/choice-options.js';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

/**
 * td_choice_group calls in ONE php process (ids from 1), each with its own count of td_choice_group warnings and the
 * warning texts (the harness forbids stderr).
 * @param {any[][]} calls
 * @param {{ allowHttp?: boolean }} [o]
 */
function run(calls, { allowHttp = false } = {}) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + (allowHttp ? ' TdComponents\\Td::allowHttpLinks(true);' : '')
    + ` $calls = json_decode(${JSON.stringify(JSON.stringify(calls))}, true, 64, JSON_THROW_ON_ERROR); $out = [];`
    + ' foreach ($calls as $a) { $w = []; set_error_handler(function (int $no, string $msg) use (&$w): bool {'
    + " if ($no === E_USER_WARNING && str_starts_with($msg, 'td_choice_group:')) { $w[] = $msg; return true; } return false; });"
    + ' $html = td_choice_group(...$a); restore_error_handler(); $out[] = [\'html\' => $html, \'warns\' => $w]; }'
    + ' echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}
const one = (...args) => run([args])[0];
const radios = (html) => [...html.matchAll(/<input [^>]*>/g)].map((m) => m[0]);

describe('php/td.php — td_choice_group (v0.49.0, contract choice-group@1)', opts, () => {
  test('button variant: the exact tree (label + star, radiogroup, native radios with the real name, hint / note, footer)', () => {
    const { html, warns } = one('cap', [
      { value: '128', label: '128GB', hint: '21.990.000₫' },
      { value: '256', label: '256GB', unavailable: true },
      { value: 'x', label: 'X', disabled: true },
    ], '128', { label: 'Dung lượng', required: true });
    assert.deepEqual(warns, []);
    assert.equal(html, '<td-choice-group data-td-ssr="choice-group@1" id="td-cap-1" name="cap" value="128" label="Dung lượng" required>'
      + '<div class="td-field td-choice td-choice--button">'
      + '<div class="td-field__label td-choice__label" id="td-cap-1-label">Dung lượng<span class="td-field__required" aria-hidden="true"> *</span></div>'
      + '<div class="td-choice__options" role="radiogroup" aria-labelledby="td-cap-1-label" aria-required="true">'
      + '<label class="td-choice__option" data-td-value="128"><input type="radio" class="td-choice__input" id="td-cap-1-o0" value="128" name="cap" aria-labelledby="td-cap-1-o0-l" aria-describedby="td-cap-1-o0-h" checked required>'
      + '<span class="td-choice__face"><span class="td-choice__body"><span class="td-choice__text" id="td-cap-1-o0-l">128GB</span><span class="td-choice__hint" id="td-cap-1-o0-h">21.990.000₫</span></span></span></label>'
      + '<label class="td-choice__option" data-td-value="256" data-unavailable><input type="radio" class="td-choice__input" id="td-cap-1-o1" value="256" name="cap" aria-labelledby="td-cap-1-o1-l" aria-describedby="td-cap-1-o1-n" required>'
      + '<span class="td-choice__face"><span class="td-choice__body"><span class="td-choice__text" id="td-cap-1-o1-l">256GB</span><span class="td-choice__note" id="td-cap-1-o1-n">Hết hàng</span></span></span></label>'
      + '<label class="td-choice__option" data-td-value="x" data-disabled><input type="radio" class="td-choice__input" id="td-cap-1-o2" value="x" name="cap" aria-labelledby="td-cap-1-o2-l" required disabled>'
      + '<span class="td-choice__face"><span class="td-choice__body"><span class="td-choice__text" id="td-cap-1-o2-l">X</span></span></span></label>'
      + '</div><div class="td-field__footer" hidden><div class="td-field__note" id="td-cap-1-note" hidden></div></div></div></td-choice-group>');
  });

  test('swatch variant: SVG fill through Td::safeColor, <img> for an image, names td-sr-only, the current choice in the label line', () => {
    const { html, warns } = one('color', [
      { value: 'den', label: 'Titan đen', swatch: '#3b3b3d' },
      { value: 'sa', label: 'Sa mạc', image: 'https://cdn.test/sw.webp', unavailable: true, unavailable_label: 'Sắp về' },
      { value: 'x', label: 'Không màu' },
    ], 'sa', { label: 'Màu sắc', variant: 'swatch', id: 'col' });
    assert.deepEqual(warns, []);
    assert.match(html, /^<td-choice-group data-td-ssr="choice-group@1" id="col" name="color" value="sa" label="Màu sắc" variant="swatch">/);
    assert.ok(html.includes('<span class="td-choice__current" aria-hidden="true">: Sa mạc — Sắp về</span>'));
    assert.ok(html.includes('<svg class="td-choice__swatch" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#3b3b3d"></circle></svg>'));
    assert.ok(html.includes('<img class="td-choice__image" src="https://cdn.test/sw.webp" alt="" width="32" height="32" loading="lazy" decoding="async">'));
    assert.ok(html.includes('<svg class="td-choice__swatch td-choice__swatch--none" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16"></circle></svg>'));
    assert.ok(html.includes('<span class="td-choice__text td-sr-only" id="col-o0-l">Titan đen</span>'));
    assert.ok(html.includes('<span class="td-choice__note td-sr-only" id="col-o1-n" data-td-custom>Sắp về</span>'));
  });

  test('escaping: label / hint / value / group label are text', () => {
    const { html } = one('e"x', [{ value: '"><b>', label: '<img src=x onerror=alert(1)>', hint: 'a & b' }], '"><b>', { label: '<i>n</i>', helper_text: '<s>', error_text: '"q"' });
    assert.ok(!/<img src=x|<b>|<i>n|<s>/.test(html));
    assert.ok(html.includes('value="&quot;&gt;&lt;b&gt;"'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(html.includes('a &amp; b'));
    assert.ok(html.includes('<span class="td-field-error" id="td-ex-1-error" data-for="td-ex-1">&quot;q&quot;</span>'));
    assert.ok(html.includes('aria-invalid="true"') && html.includes('aria-errormessage="td-ex-1-error"'));
  });

  test('required: on every radio (native no-JS validation); host disabled → every radio disabled', () => {
    const { html } = one('s', [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', disabled: true }], null, { required: true, disabled: true });
    const rs = radios(html);
    assert.equal(rs.length, 2);
    assert.ok(rs.every((r) => / required/.test(r) && / disabled/.test(r) && !/ checked/.test(r)));
    assert.ok(/<td-choice-group [^>]* required disabled>/.test(html));
  });

  test('required with every option disabled: no aria-required on the group (valid, like native)', () => {
    const { html } = one('s', [{ value: 'a', label: 'A', disabled: true }], null, { required: true, label: 'L' });
    assert.ok(!html.includes('aria-required'));
  });

  test('review S1: invalid options dropped, ONE aggregate warning (counts only) — never a raw value', () => {
    const { html, warns } = one('w', [
      { value: 'ok', label: 'OK' }, 'SECRET1', { label: 'SECRET2' }, { value: 'SECRET3' }, { value: ['SECRET4'], label: 'x' },
      { value: 'ok', label: 'SECRET5' }, { value: 'b', label: 'B', swatch: 'red;}SECRET6', image: 'javascript:SECRET7', hint: 5 },
    ], 'SECRET8');
    assert.deepEqual(radios(html).map((r) => /value="([^"]*)"/.exec(r)[1]), ['ok', 'b']);
    assert.equal(warns.length, 1);
    assert.match(warns[0], /5 option\(s\) dropped, 3 field\(s\) ignored or shortened.*not one of the options/);
    for (const w of warns) assert.doesNotMatch(w, /SECRET/);
    assert.ok(!html.includes('fill=') && !html.includes('<img'));
  });

  test('int values / numeric labels: int value cast; a numeric label is refused', () => {
    const { html, warns } = one('n', [{ value: 5, label: 'Năm' }, { value: 6, label: 6 }], 5);
    assert.equal(radios(html).length, 1);
    assert.ok(/ checked/.test(radios(html)[0]));
    assert.equal(warns.length, 1);
    assert.match(warns[0], /^td_choice_group: 1 option\(s\) dropped, 0 field/);
  });

  test('swatch image URL — test/ssr/media-url.cases.json (php column), with and without Td::allowHttpLinks', () => {
    const { cases } = JSON.parse(readFileSync(join(ROOT, 'test/ssr/media-url.cases.json'), 'utf8'));
    for (const allowHttp of [false, true]) {
      const list = cases.filter((c) => c.allowHttp === allowHttp);
      const out = run(list.map((c) => ['i', [{ value: 'a', label: 'A', image: c.url }], null, {}]), { allowHttp });
      list.forEach((c, k) => assert.equal(out[k].html.includes('<img ') ? 'keep' : 'refuse', c.php, `${c.url.slice(0, 50)} allowHttp=${allowHttp}`));
    }
  });

  test('nameless group: a private group name + form="" (never submitted), the keyboard group stays native', () => {
    const { html } = one('', [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], null, { id: 'g' });
    assert.ok(radios(html).every((r) => r.includes('name="g-group"') && r.includes('form=""')));
    assert.ok(!/<td-choice-group [^>]*name=/.test(html));
  });

  test('review S1: Td::CHOICE_LIMITS = the JS CHOICE_LIMITS', () => {
    const r = spawnSync(PHP_BIN, ['-r', `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; echo json_encode(TdComponents\\Td::CHOICE_LIMITS);`], { encoding: 'utf8' });
    assert.deepEqual(JSON.parse(r.stdout), { ...CHOICE_LIMITS });
  });

  test('review S1: 100 000 candidates / huge strings → 400 inspected, 100 printed, one warning, bounded time and output', () => {
    const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
      + ' $o = []; for ($i = 0; $i < 100000; $i++) { $o[] = ["value" => "v$i", "label" => "L$i"]; }'
      + ' $o[0] = ["value" => "a", "label" => str_repeat("😀", 300), "hint" => str_repeat("á", 5000000), "unavailable" => true, "unavailable_label" => str_repeat("x", 5000000)];'
      + ' $o[1] = ["value" => str_repeat("x", 5000000), "label" => "V"];'
      + ' $o[2] = ["value" => "b", "label" => "B", "swatch" => "#fff" . str_repeat(" ", 5000000), "image" => "https://cdn.test/" . str_repeat("a", 5000000)];'
      + ' $w = []; set_error_handler(function (int $n, string $m) use (&$w): bool { $w[] = $m; return true; });'
      + ' $t = microtime(true); $h = td_choice_group("big", $o); $ms = (microtime(true) - $t) * 1000;'
      + ' echo json_encode(["ms" => $ms, "len" => strlen($h), "radios" => substr_count($h, "<input "), "w" => $w], JSON_UNESCAPED_UNICODE);';
    const r = spawnSync(PHP_BIN, ['-d', 'memory_limit=512M', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8', maxBuffer: 1 << 26 });
    assert.equal(r.status, 0, r.stderr);
    const o = JSON.parse(r.stdout);
    assert.equal(o.radios, 100);
    assert.equal(o.w.length, 1, o.w.join('\n'));
    assert.match(o.w[0], /99900 option\(s\) dropped, 5 field\(s\)/);
    assert.ok(o.len < 120000, `output ${o.len} bytes`);
    assert.ok(o.ms < 2000 * (process.env.TD_PERF_STRICT ? 1 : 20), `${o.ms} ms`);
  });

  test('review S2: canonical values — test/ssr/choice-value.cases.json (shared + php raw-byte cases)', () => {
    const T = JSON.parse(readFileSync(join(ROOT, 'test/ssr/choice-value.cases.json'), 'utf8'));
    const items = [...T.cases.map((c) => ({ expr: `json_decode(${JSON.stringify(JSON.stringify(c.in))})`, out: c.out, label: JSON.stringify(c.in).slice(0, 30) })),
      ...T.phpOnly.map((c) => ({ expr: `hex2bin('${c.hex}')`, out: c.out, label: c.hex }))];
    const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; echo json_encode([${items.map((x) => `td__choice_value(${x.expr})`).join(', ')}], JSON_UNESCAPED_UNICODE);`;
    const r = spawnSync(PHP_BIN, ['-r', code], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const got = JSON.parse(r.stdout);
    items.forEach((x, i) => assert.equal(got[i], x.out, x.label));
  });

  test('review S2: rejected values (CRLF, NUL, invalid UTF-8) count into the one warning; duplicates compare canonical values', () => {
    const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
      + ' $w = []; set_error_handler(function (int $n, string $m) use (&$w): bool { $w[] = $m; return true; });'
      + ' $h = td_choice_group("v", [["value" => "a\\r\\nb", "label" => "C"], ["value" => "a\\x00", "label" => "N"], ["value" => "x\\xff", "label" => "U"], ["value" => 5, "label" => "five"], ["value" => "5", "label" => "dup"]]);'
      + ' echo json_encode(["h" => $h, "w" => $w]);';
    const r = spawnSync(PHP_BIN, ['-r', code], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const o = JSON.parse(r.stdout);
    assert.deepEqual(radios(o.h).map((x) => /value="([^"]*)"/.exec(x)[1]), ['5']);
    assert.equal(o.w.length, 1);
    assert.match(o.w[0], /4 option\(s\) dropped/);
  });

  test('review r3: label emptiness uses the ECMAScript trim set (Td::JS_WS) — test/ssr/choice-label.cases.json', () => {
    const { cases } = JSON.parse(readFileSync(join(ROOT, 'test/ssr/choice-label.cases.json'), 'utf8'));
    const out = run(cases.map((c) => ['l', [{ value: 'a', label: c.label }], null, {}]));
    cases.forEach((c, i) => assert.equal(radios(out[i].html).length === 1, c.ok, JSON.stringify(c.label)));
  });

  test('test/ssr/fixtures/choice.html is up to date (node test/ssr/build-choice-fixture.mjs)', () => {
    assert.ok(CHOICE_FIXTURES.cases.length >= 8);
    assert.equal(readFileSync(CHOICE_FIXTURE_FILE, 'utf8'), renderChoiceFixture());
  });
});
