// v0.30.0 (ADR 0012, plan v0.30.0-number-repeater M3) — PHP side of the SSR contract `number-input@1`:
//   - td_number_input(): NATIVE by default (type=number: min implicit 0, step = 10^-decimals, the canonical value —
//     works and submits clean numbers without JS), ELEMENT mode opt-in per call `element` + Td::configure ssr_elements;
//   - td__number_canonical(): the same gate as the component (canonical, ≤ 30 digits, no extra decimals — never rounded);
//     invalid value / min / max / step → dropped + ONE E_USER_WARNING each; step must be > 0;
//   - escaping, owned names reserved in `attrs`.
// Shared fixtures: test/ssr/number.fixtures.json (also consumed by src/form/td-number-input.ssr.engines.browser-test.js
// through test/ssr/fixtures/number.html — this test fails when it is stale: `node test/ssr/build-number-fixture.mjs`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, runPhp, PHP_BIN, ROOT } from './php.mjs';
import { NUMBER_FIXTURES, NUMBER_FIXTURE_FILE, renderNumberFixture } from '../ssr/ssr.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };
const BASE = '/vendor/td/0.30.0';

/** One call in its own php process (generated ids start at 1 every time). */
function one(fn, args, options) {
  const [r] = runPhp([{ fn, args }], options ? { baseUrl: BASE, options } : { baseUrl: BASE });
  assert.equal(r.error, undefined, `${fn}: ${r.message}`);
  return r.out;
}

/** td_number_input with arguments as JSON, capturing stdout + the warnings on stderr (the harness forbids stderr). */
function withWarnings(args) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ` $a = json_decode(${JSON.stringify(JSON.stringify(args))}, true); echo td_number_input(...$a);`;
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return { out: r.stdout, warnings: (r.stderr.match(/Warning: +td_number_input:/g) || []).length, stderr: r.stderr };
}
/** td_number_input with raw PHP argument expressions (floats, INF, NAN — JSON cannot carry them), caller NOT strict_types. */
function rawPhp(argsPhp) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ` echo td_number_input(${argsPhp});`;
  // xdebug (when installed locally) prints call ARGUMENTS in its own trace: off, only the message itself is under test
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout, stderr: r.stderr, warnings: (r.stderr.match(/Warning: +td_number_input:/g) || []).length };
}
const attr = (html, name) => {
  const m = new RegExp(`<input[^>]* ${name}="([^"]*)"`).exec(html);
  return m ? m[1] : null;
};

const STATUS = (b) => `<span class="td-sr-only" id="${b}-status" role="status"></span>`;

describe('php/td.php — td_number_input (v0.30.0, contract number-input@1)', opts, () => {
  test('native (default): type=number with the canonical value, implicit min 0, step 1, unit read through aria-describedby', () => {
    assert.equal(one('td_number_input', ['price', '12990000', { label: 'Giá bán', suffix: '₫', required: true }]),
      '<div class="td-field td-field--md td-number"><label class="td-field__label" id="td-price-1-label" for="td-price-1-control">Giá bán'
      + '<span class="td-field__required" aria-hidden="true"> *</span></label><div class="td-number__box">'
      + '<input type="number" class="td-number__control" id="td-price-1-control" inputmode="numeric" autocomplete="off" spellcheck="false"'
      + ' name="price" value="12990000" min="0" step="1" required aria-required="true" aria-describedby="td-price-1-unit">'
      + '<span class="td-number__affix td-number__affix--suffix" aria-hidden="true">₫</span><span id="td-price-1-unit" hidden>₫</span></div>'
      + '<div class="td-field__footer" hidden><div class="td-field__note" id="td-price-1-note" hidden></div></div>'
      + `${STATUS('td-price-1')}</div>`);
  });

  test('element mode: host with the component attributes + the same tree (canonical value, never pre-formatted)', () => {
    assert.equal(one('td_number_input', ['p', 5000, { element: true, id: 'cost', label: 'Giá vốn', prefix: '$', decimals: 2, min: '-5', hint: 'H', error: 'E', clamp: true }]),
      '<td-number-input data-td-ssr="number-input@1" id="cost-host" name="p" value="5000" label="Giá vốn" helper-text="H" error-text="E"'
      + ' min="-5" decimals="2" prefix="$" clamp><div class="td-field td-field--md td-number">'
      + '<label class="td-field__label" id="cost-host-label" for="cost">Giá vốn</label><div class="td-number__box">'
      + '<span class="td-number__affix td-number__affix--prefix" aria-hidden="true">$</span>'
      + '<input type="number" class="td-number__control" id="cost" inputmode="text" autocomplete="off" spellcheck="false" name="p" value="5000"'
      + ' min="-5" step="0.01" aria-describedby="cost-host-unit cost-host-note cost-host-error" aria-invalid="true" aria-errormessage="cost-host-error">'
      + '<span id="cost-host-unit" hidden>$</span></div><div class="td-field__footer"><span class="td-field-error" id="cost-host-error" data-for="cost-host">E</span>'
      + '<div class="td-field__note" id="cost-host-note">H</div></div>'
      + `${STATUS('cost-host')}</div></td-number-input>`);
  });

  test('mode: global ssr_elements off/on × per call absent/false/true', () => {
    for (const mode of NUMBER_FIXTURES.modes) {
      const args = mode.call === 'absent' ? ['c', null, {}] : ['c', null, { element: mode.call }];
      const out = one('td_number_input', args, mode.global ? { ssr_elements: true } : undefined);
      assert.equal(out.startsWith('<td-number-input data-td-ssr="number-input@1"'), mode.element, `${JSON.stringify(mode)}: ${out.slice(0, 60)}`);
      if (!mode.element) assert.ok(out.startsWith('<div class="td-field td-field--md td-number">'), out);
    }
  });

  test('step: given → kept; absent → 10^-decimals; inputmode: numeric / decimal / text (negatives)', () => {
    const out = runPhp([
      { fn: 'td_number_input', args: ['a', null, {}] },
      { fn: 'td_number_input', args: ['a', null, { decimals: 2 }] },
      { fn: 'td_number_input', args: ['a', null, { decimals: 3, step: '0.005' }] },
      { fn: 'td_number_input', args: ['a', null, { step: '500', min: '-1000' }] },
    ], { baseUrl: BASE }).map((r) => r.out);
    assert.deepEqual(out.map((h) => attr(h, 'step')), ['1', '0.01', '0.005', '500']);
    assert.deepEqual(out.map((h) => attr(h, 'inputmode')), ['numeric', 'decimal', 'decimal', 'text']);
    assert.deepEqual(out.map((h) => attr(h, 'min')), ['0', '0', '0', '-1000']);
  });

  test('values through the canonical gate: int → string, -0 → 0; extra decimals / bad forms / 31 digits dropped + one warning each', () => {
    assert.equal(attr(withWarnings(['a', 5000, {}]).out, 'value'), '5000');
    assert.equal(attr(withWarnings(['a', '-0', { min: '-5' }]).out, 'value'), '0');
    assert.equal(attr(withWarnings(['a', '12.50', { decimals: 2 }]).out, 'value'), '12.50');
    for (const [args, n] of [
      [['a', '1.234', { decimals: 2 }], 1],
      [['a', '1.5', {}], 1],
      [['a', '12.990.000', {}], 1],
      [['a', '1e5', {}], 1],
      [['a', '1'.repeat(31), {}], 1],
      [['a', '7', { min: '0.5', max: 'abc' }], 2],
    ]) {
      const r = withWarnings(args);
      assert.equal(r.warnings, n, `${JSON.stringify(args)}: ${r.stderr}`);
      if (args[1] !== '7') assert.equal(attr(r.out, 'value'), null, JSON.stringify(args));
    }
    const r = withWarnings(['a', '7', { min: '0.5', max: 'abc' }]);
    assert.equal(attr(r.out, 'min'), '0', 'invalid min → implicit 0');
    assert.equal(attr(r.out, 'max'), null);
  });

  test('step 0 / -1 → dropped (default step printed) + one warning; the element host carries no step', () => {
    for (const s of ['0', '-1', '0.00']) {
      const r = withWarnings(['a', null, { step: s, decimals: 2, element: true }]);
      assert.equal(r.warnings, 1, r.stderr);
      assert.equal(attr(r.out, 'step'), '0.01');
      assert.ok(!/<td-number-input[^>]* step=/.test(r.out), r.out);
    }
  });

  test('separators: valid ones printed on the host; an invalid / colliding decimal separator is dropped', () => {
    const out = one('td_number_input', ['a', null, { element: true, group_separator: ',', decimal_separator: ',' }]);
    assert.ok(out.includes(' group-separator=","'), out);
    assert.ok(!out.includes('decimal-separator'), out);
    const sp = one('td_number_input', ['a', null, { element: true, group_separator: ' ', decimal_separator: '.' }]);
    assert.ok(sp.includes(' group-separator=" " decimal-separator="."'), sp);
    assert.ok(!one('td_number_input', ['a', null, { element: true, group_separator: '_' }]).includes('group-separator'));
  });

  test('reservation: owned names in attrs never reach the control (case-insensitive), data-td-* blocked, unsafe dropped', () => {
    const c = NUMBER_FIXTURES.cases.find((x) => x.id === 'n-attrs');
    const out = one('td_number_input', c.args);
    const input = /<input[^>]*>/.exec(out)[0];
    assert.equal(input, '<input type="number" class="td-number__control" id="n-at" inputmode="numeric" autocomplete="off" spellcheck="false"'
      + ' name="code" value="9" min="0" step="1" data-y="2" title="Gợi ý">');
    for (const bad of ['onclick', 'evil', 'data-td-x', 'alert']) assert.ok(!out.includes(bad), bad);
  });

  test('escaping: label / affixes / unit / hint are text', () => {
    const c = NUMBER_FIXTURES.cases.find((x) => x.id === 'n-xss');
    const out = one('td_number_input', c.args);
    assert.ok(!/<img|<b>|<i>|<svg|<script/i.test(out), out);
    assert.ok(out.includes('&lt;img src=x onerror=alert(1)&gt;'), out);
    assert.ok(out.includes('aria-hidden="true">&quot;&gt;&lt;i&gt;</span>'), out);
  });

  test('test/ssr/fixtures/number.html (browser fixture) is up to date', () => {
    assert.equal(readFileSync(NUMBER_FIXTURE_FILE, 'utf8'), renderNumberFixture(), 'stale fixture: run `node test/ssr/build-number-fixture.mjs`');
  });

  test('security review: $value / min / max / step accept ONLY string and int — float (12.5), INF, NAN, bool, array → rejected + one warning each, never coerced', () => {
    for (const v of ['12.5', 'INF', 'NAN', '-INF', 'true', '[1]', '1.0']) {
      const r = rawPhp(`'p', ${v}`);
      assert.equal(r.status, 0, `${v}: ${r.stderr}`);
      assert.equal(r.warnings, 1, `${v}: ${r.stderr}`);
      assert.equal(attr(r.out, 'value'), null, `${v} must not become a value: ${r.out}`);
    }
    const o = rawPhp(`'p', null, ['min' => 0.5, 'max' => INF, 'step' => NAN]`);
    assert.equal(o.status, 0, o.stderr);
    assert.equal(o.warnings, 3, o.stderr);
    assert.equal(attr(o.out, 'min'), '0');
    assert.equal(attr(o.out, 'max'), null);
    assert.equal(attr(o.out, 'step'), '1');
    assert.equal(attr(rawPhp(`'p', 12`).out, 'value'), '12', 'int still accepted');
  });

  test('security review: warnings never echo the raw value — option name, PHP type, bounded length only', () => {
    const secret = 'SECRET-TOKEN-abc123';
    const r = rawPhp(`'p', '${secret}', ['min' => '${secret}', 'step' => '-${'9'.repeat(5)}']`);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.warnings >= 3, r.stderr);
    assert.ok(!r.stderr.includes(secret) && !r.stderr.includes('SECRET'), r.stderr);
    assert.ok(!r.stderr.includes('99999'), r.stderr);
    assert.match(r.stderr, /td_number_input: value \(string, 19 chars\)/);
    const long = rawPhp(`'p', str_repeat('x', 100000)`);
    assert.ok(long.stderr.length < 400, `bounded: ${long.stderr.length}`);
  });
});
