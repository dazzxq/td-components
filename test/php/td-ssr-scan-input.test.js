// v0.38.0 (plan v0.38.0-scan-input QĐ 19, M3) — PHP side of the SSR contract `scan-input@1`:
//   - td__scan_value() == src/utils/scan-burst.js normalizeScan() on SCAN_NORMALIZE_CASES (parity), td__scan_values() ==
//     normalizeValues();
//   - single: NATIVE by default (works without JS), ELEMENT mode opt-in; multiple: always the element + textarea + list +
//     hidden inputs (same order); owned names reserved in `attrs`; escaping.
// Shared fixtures: test/ssr/scan-input.fixtures.json (also consumed by the SSR browser test through
// test/ssr/fixtures/scan-input.html — this test fails when it is stale: `node test/ssr/build-scan-input-fixture.mjs`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HAS_PHP, runPhp } from './php.mjs';
import { SCAN_NORMALIZE_CASES, normalizeScan, normalizeValues } from '../../src/utils/scan-burst.js';
import { SCAN_INPUT_FIXTURE_FILE, renderScanInputFixture } from '../ssr/ssr.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };
const BASE = '/vendor/td/0.38.0';

function one(fn, args) {
  const [r] = runPhp([{ fn, args }], { baseUrl: BASE });
  assert.equal(r.error, undefined, `${fn}: ${r.message}`);
  return r.out;
}

const FIXED = 'autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done"';

describe('php/td.php — td_scan_input (v0.38.0, contract scan-input@1)', opts, () => {
  test('td__scan_value == normalizeScan on SCAN_NORMALIZE_CASES (parity)', () => {
    const res = runPhp(SCAN_NORMALIZE_CASES.map(([raw, max]) => ({ fn: 'td__scan_value', args: [raw, max] })), { baseUrl: BASE });
    SCAN_NORMALIZE_CASES.forEach(([raw, max, want], i) => {
      assert.equal(res[i].out, want, `php ${JSON.stringify(raw)}`);
      assert.equal(normalizeScan(raw, max), want, `js ${JSON.stringify(raw)}`);
    });
  });

  test('td__scan_values == normalizeValues (strings / ints, empty + duplicates dropped, non-array → [])', () => {
    const lists = [[' A ', 'B', 'A', '', '\x1D', 'C', 7], 'A', [['x'], null, true, 'ok']];
    const res = runPhp(lists.map((l) => ({ fn: 'td__scan_values', args: [l] })), { baseUrl: BASE });
    assert.deepEqual(res[0].out, normalizeValues(lists[0]));
    assert.deepEqual(res[1].out, []);
    assert.deepEqual(res[2].out, ['ok']);
  });

  test('single native (default): a plain field that works without JS', () => {
    assert.equal(one('td_scan_input', ['order', {}]),
      `<div class="td-scan"><div class="td-scan__box"><input type="text" class="td-scan__input" id="td-order-1-input" ${FIXED} name="order" aria-label="Mã quét"></div></div>`);
    assert.equal(one('td_scan_input', ['order', { id: 'o', label: 'Mã <đơn>', value: ' DH\x1D1 ', required: true, error: 'Sai "mã"', class: 'x', placeholder: 'Quét', inputmode: 'none' }]),
      '<div class="td-scan x"><label class="td-scan__label" for="o">Mã &lt;đơn&gt;</label><div class="td-scan__box">'
      + `<input type="text" class="td-scan__input" id="o" ${FIXED} inputmode="none" placeholder="Quét" name="order" value="DH1" required`
      + ' aria-invalid="true" aria-errormessage="o-error" aria-describedby="o-error"></div>'
      + '<span class="td-field-error" id="o-error" data-for="o">Sai &quot;mã&quot;</span></div>');
  });

  test('single element mode: host + the same field; host carries the component attributes', () => {
    assert.equal(one('td_scan_input', ['code', { element: true, id: 's', label: 'Mã', value: 'A1', min_length: 6, beep: true, required: true }]),
      '<td-scan-input data-td-ssr="scan-input@1" id="s-host" name="code" value="A1" label="Mã" min-length="6" beep required>'
      + '<div class="td-scan"><label class="td-scan__label" for="s">Mã</label><div class="td-scan__box">'
      + `<input type="text" class="td-scan__input" id="s" ${FIXED} name="code" value="A1" required></div></div></td-scan-input>`);
  });

  test('multiple: always the element — input without name, textarea[name], li per value, hidden per value (same order)', () => {
    const out = one('td_scan_input', ['imei[]', { multiple: true, id: 'm', values: ['A1', '<b>', 'A1'], max: 3, disabled: true }]);
    assert.equal(out, '<td-scan-input data-td-ssr="scan-input@1" id="m-host" name="imei[]" max="3" multiple disabled>'
      + '<div class="td-scan" data-mode="multiple"><div class="td-scan__box">'
      + `<input type="text" class="td-scan__input" id="m" ${FIXED} disabled aria-label="Mã quét"></div>`
      + '<textarea class="td-scan__fallback" name="imei[]" rows="3" aria-label="Nhập tay, mỗi dòng một mã" disabled></textarea>'
      + '<ul class="td-scan__list" aria-label="Mã đã quét">'
      + '<li class="td-scan__item" data-value="A1"><span class="td-scan__value">A1</span></li>'
      + '<li class="td-scan__item" data-value="&lt;b&gt;"><span class="td-scan__value">&lt;b&gt;</span></li></ul></div>'
      + '<input type="hidden" class="td-scan__hidden" name="imei[]" value="A1" disabled>'
      + '<input type="hidden" class="td-scan__hidden" name="imei[]" value="&lt;b&gt;" disabled></td-scan-input>');
    // `element => false` cannot turn multiple into a native field (the list needs the element)
    assert.ok(one('td_scan_input', ['c[]', { multiple: true, element: false }]).startsWith('<td-scan-input data-td-ssr="scan-input@1"'));
  });

  test('attrs: allowlisted on the input; owned names / data-td-* / handlers never printed; invalid options dropped', () => {
    const out = one('td_scan_input', ['c', { element: true, attrs: { 'data-x': '1', onclick: 'x()', Name: 'evil', value: '9', autocomplete: 'on', 'data-td-ssr': 'x', title: 'T' }, inputmode: 'bogus', min_length: 99, max: 3 }]);
    assert.ok(out.includes(' data-x="1"') && out.includes(' title="T"'), out);
    assert.ok(!/onclick|evil|value="9"|autocomplete="on"|data-td-ssr="x"|inputmode|min-length|max=/.test(out), out);
    assert.equal((out.match(/ name="c"/g) || []).length, 2, 'host + input only');
  });

  test('test/ssr/fixtures/scan-input.html (browser fixture) is up to date', () => {
    assert.equal(readFileSync(SCAN_INPUT_FIXTURE_FILE, 'utf8'), renderScanInputFixture(),
      'stale fixture: run `node test/ssr/build-scan-input-fixture.mjs`');
  });
});
