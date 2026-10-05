// v0.40.0 (plan v0.39.0-filters-range QĐ 19 / 26, M3) — PHP side of the SSR contract `datetime-range@1`:
//   - td__dtr_required() == src/utils/date-presets.js requiredParts() (the R2-5 table, parity);
//   - td__dtr_parts() == parseBound() + toNativeValue() of the element (formats, calendar checks, date-only bounds);
//   - td_datetime_range(): always the element, natives (names / min / max / per-side required / disabled) + the trigger
//     as their sibling, owned names reserved in `attrs`, escaping.
// Shared fixtures: test/ssr/datetime-range.fixtures.json (also consumed by the SSR browser test through
// test/ssr/fixtures/datetime-range.html — this test fails when it is stale: `node test/ssr/build-datetime-range-fixture.mjs`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HAS_PHP, runPhp } from './php.mjs';
import { requiredParts } from '../../src/utils/date-presets.js';
import { parseBound, formatModeIso } from '../../src/utils/datetime.js';
import { DATETIME_RANGE_FIXTURE_FILE, renderDatetimeRangeFixture } from '../ssr/ssr.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };
const BASE = '/vendor/td/0.40.0';

function one(fn, args) {
  const [r] = runPhp([{ fn, args }], { baseUrl: BASE });
  assert.equal(r.error, undefined, `${fn}: ${r.message}`);
  return r.out;
}

// the element's native value (src/form/td-datetime-range.js toNativeValue) — repeated here: the module defines the element
const pad2 = (n) => String(n).padStart(2, '0');
const nativeOf = (p, mode) => (p ? formatModeIso(p, 'date') + (mode === 'datetime' ? `T${pad2(p.hour)}:${pad2(p.minute)}` : '') : null);

describe('php/td.php — td_datetime_range (v0.40.0, contract datetime-range@1)', opts, () => {
  test('td__dtr_required == requiredParts (strings); true → both, false / null → none', () => {
    const strings = ['', 'required', 'true', 'both', ' Both ', 'start', 'END', 'false', 'startend', '0'];
    const res = runPhp(strings.map((v) => ({ fn: 'td__dtr_required', args: [v] })), { baseUrl: BASE });
    strings.forEach((v, i) => assert.deepEqual(res[i].out.parts, requiredParts(v).parts, JSON.stringify(v)));
    const [t, f, n] = runPhp([true, false, null].map((v) => ({ fn: 'td__dtr_required', args: [v] })), { baseUrl: BASE });
    assert.deepEqual(t.out, { attr: true, parts: ['start', 'end'] });
    assert.deepEqual(f.out, { attr: null, parts: [] });
    assert.deepEqual(n.out, { attr: null, parts: [] });
    assert.deepEqual(one('td__dtr_required', ['start']), { attr: 'start', parts: ['start'] });
  });

  test('td__dtr_parts == parseBound + native value (both modes, both sides); DB form accepted by PHP only', () => {
    const inputs = ['01/10/2026', '1/2/2026', '01/10/2026 - 08:05', '2026-10-01', '2026-10-01T08:05', '2026-10-01T08:05:59',
      '29/02/2028', '29/02/2026', '31/04/2026', '2026-13-01', '25:00', '01/10/2026 - 24:00', 'junk', '', '0000-01-01'];
    const calls = [];
    for (const v of inputs) for (const mode of ['date', 'datetime']) for (const side of ['start', 'end']) calls.push({ v, mode, side });
    const res = runPhp(calls.map((c) => ({ fn: 'td__dtr_parts', args: [c.v, c.mode, c.side] })), { baseUrl: BASE });
    calls.forEach((c, i) => {
      const php = res[i].out;
      const js = parseBound(c.v, c.side === 'start' ? 'min' : 'max');
      const phpNative = php ? `${String(php[0]).padStart(4, '0')}-${pad2(php[1])}-${pad2(php[2])}${c.mode === 'datetime' ? `T${pad2(php[3])}:${pad2(php[4])}` : ''}` : null;
      assert.equal(phpNative, nativeOf(js, c.mode), JSON.stringify(c));
    });
    assert.deepEqual(one('td__dtr_parts', ['2026-10-01 08:30:00', 'datetime', 'start']), [2026, 10, 1, 8, 30]);
    assert.deepEqual(one('td__dtr_parts', ['2026-10-01 08:30:00', 'date', 'end']), [2026, 10, 1, 0, 0]);
  });

  test('date mode: element + label + natives (names, values, min / max, required="start") + the trigger as their sibling', () => {
    assert.equal(one('td_datetime_range', ['range', '2026-10-01', '05/10/2026', { id: 'r', label: 'Khoảng <ngày>', required: 'start', min: '01/01/2026' }]),
      '<td-datetime-range data-td-ssr="datetime-range@1" id="r" name="range" mode="date" start="01/10/2026" end="05/10/2026"'
      + ' label="Khoảng &lt;ngày&gt;" min="2026-01-01" required="start"><div class="td-dtr" data-state="closed">'
      + '<span class="td-field__label td-dtr__label" id="r-label">Khoảng &lt;ngày&gt;<span class="td-field__required" aria-hidden="true"> *</span></span>'
      + '<div class="td-dtr__natives" role="group" aria-labelledby="r-label">'
      + '<label class="td-dtr__native-label" for="r-start">Từ</label><input class="td-dtr__native" type="date" id="r-start" data-part="start" name="range[start]" value="2026-10-01" min="2026-01-01" required>'
      + '<label class="td-dtr__native-label" for="r-end">Đến</label><input class="td-dtr__native" type="date" id="r-end" data-part="end" name="range[end]" value="2026-10-05" min="2026-01-01">'
      + '</div><button type="button" class="td-dtr__trigger" id="r-trigger" role="combobox" aria-haspopup="dialog" aria-expanded="false" aria-labelledby="r-label" aria-required="true">'
      + '<span class="td-dtr__value">01/10/2026 – 05/10/2026</span><span class="td-dtr__icon" data-td-icon="calendar" aria-hidden="true"></span></button></div></td-datetime-range>');
  });

  test('datetime mode: datetime-local, date-only max → 23:59, start_name / end_name, error + disabled on both natives, placeholder', () => {
    const out = one('td_datetime_range', ['p', null, null, { id: 'p', mode: 'datetime', max: '2026-12-31', start_name: 'from', end_name: 'to', error: 'Sai "khoảng"', disabled: true, placeholder: 'Chọn <khung>' }]);
    assert.equal(out, '<td-datetime-range data-td-ssr="datetime-range@1" id="p" name="p" mode="datetime" start-name="from" end-name="to"'
      + ' placeholder="Chọn &lt;khung&gt;" max="2026-12-31T23:59" disabled error-text="Sai &quot;khoảng&quot;"><div class="td-dtr" data-state="closed">'
      + '<div class="td-dtr__natives" role="group">'
      + '<label class="td-dtr__native-label" for="p-start">Từ</label><input class="td-dtr__native" type="datetime-local" id="p-start" data-part="start" name="from" max="2026-12-31T23:59" disabled aria-invalid="true" aria-describedby="p-error">'
      + '<label class="td-dtr__native-label" for="p-end">Đến</label><input class="td-dtr__native" type="datetime-local" id="p-end" data-part="end" name="to" max="2026-12-31T23:59" disabled aria-invalid="true" aria-describedby="p-error">'
      + '</div><button type="button" class="td-dtr__trigger" id="p-trigger" role="combobox" aria-haspopup="dialog" aria-expanded="false" disabled>'
      + '<span class="td-dtr__value" data-placeholder>Chọn &lt;khung&gt;</span><span class="td-dtr__icon" data-td-icon="calendar" aria-hidden="true"></span></button></div>'
      + '<span class="td-field-error" id="p-error" data-for="p">Sai &quot;khoảng&quot;</span></td-datetime-range>');
  });

  test('required: true / both → bare on the host + both natives; end → only the end input; trigger text "Từ …" / "Đến …"', () => {
    const both = one('td_datetime_range', ['r', null, null, { required: true }]);
    assert.match(both, /<td-datetime-range [^>]* required>/);
    assert.equal((both.match(/<input [^>]* required>/g) || []).length, 2);
    const end = one('td_datetime_range', ['r', null, '2026-10-05', { required: 'end' }]);
    assert.match(end, / required="end">/);
    assert.match(end, /data-part="end" name="r\[end\]" value="2026-10-05" required>/);
    assert.doesNotMatch(end, /data-part="start"[^>]*required/);
    assert.match(end, /<span class="td-dtr__value">Đến 05\/10\/2026<\/span>/);
    assert.match(one('td_datetime_range', ['r', '2026-10-01', null, {}]), /<span class="td-dtr__value">Từ 01\/10\/2026<\/span>/);
    assert.doesNotMatch(one('td_datetime_range', ['r', null, null, { required: false }]), /required/);
  });

  test('attrs on the host: owned names reserved (start, name, data-td-*), on* dropped; invalid values / bounds dropped', () => {
    const out = one('td_datetime_range', ['a', '31/02/2026', 'junk', { id: 'a', min: 'nope', max_days: '0', minute_step: 7, form_value_format: 'x',
      attrs: { 'data-x': '1', onclick: 'alert(1)', start: '01/01/2000', Name: 'evil', 'data-td-ssr': 'x', title: 'Gợi ý' } }]);
    assert.match(out, /^<td-datetime-range data-td-ssr="datetime-range@1" id="a" name="a" mode="date" data-x="1" title="Gợi ý">/);
    assert.doesNotMatch(out, /onclick|evil|01\/01\/2000|value=|min=|max-days|minute-step|form-value-format/);
    assert.match(one('td_datetime_range', ['a', null, null, { max_days: 92, minute_step: '15', form_value_format: 'db', mode: 'datetime' }]),
      / max-days="92" minute-step="15" form-value-format="db">/);
  });

  test('fixture html is fresh (node test/ssr/build-datetime-range-fixture.mjs)', () => {
    assert.equal(readFileSync(DATETIME_RANGE_FIXTURE_FILE, 'utf8'), renderDatetimeRangeFixture());
  });
});
