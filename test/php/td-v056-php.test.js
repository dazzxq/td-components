// v0.56.0 (plan docs/internal/plans/v0.56.0-repeater-icons-date.md D1–D9) — PHP side of the SSR contract
// `datetime-picker@1` (v0.56–v0.59; `@2` since v0.60.0): td_datetime_picker() / td_date() always print the element <td-datetime-picker
// data-td-ssr="datetime-picker@2"> + a native <input type="date|datetime-local"> (the no-JS fallback) + the trigger as its
// sibling; values / bounds parsed like td_datetime_range (td__dtr_parts), helper_text (ADR 0027), escaping, owned names
// reserved. v0.60.0 (plan v0.60.0-calendar-picker B3 / B5): the contract is `datetime-picker@2` — the 2000–2099 year window
// is gone (no value dropped, no implicit native min; the native max is 9999-12-31 unless the site sets one). The @2-only
// cases live in td-v060-php.test.js.
// Shared fixtures: test/ssr/datetime-picker.fixtures.json (SSR browser test via test/ssr/fixtures/datetime-picker.html —
// this test fails when it is stale: `node test/ssr/build-datetime-picker-fixture.mjs`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';
import { DATETIME_PICKER_FIXTURE_FILE, renderDatetimePickerFixture } from '../ssr/ssr.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

/** Calls in ONE php process; each returns { html, warns } (td_ E_USER_WARNINGs captured, anything else fails). */
function run(calls) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ` $calls = json_decode(${JSON.stringify(JSON.stringify(calls))}, true, 64, JSON_THROW_ON_ERROR); $out = [];`
    + ' foreach ($calls as [$fn, $a]) { $w = []; set_error_handler(function (int $no, string $msg) use (&$w): bool {'
    + " if ($no === E_USER_WARNING && str_starts_with($msg, 'td_')) { $w[] = $msg; return true; } return false; });"
    + ' $html = $fn === \'const\' ? constant(\'TdComponents\\\\Td::\' . $a[0]) : $fn(...$a);'
    + ' restore_error_handler(); $out[] = [\'html\' => $html, \'warns\' => $w]; }'
    + ' echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}
const one = (fn, ...args) => run([[fn, args]])[0];
const html = (fn, ...args) => {
  const r = one(fn, ...args);
  assert.deepEqual(r.warns, [], `${fn}: unexpected warnings`);
  return r.html;
};
const native = (h) => (/<input class="td-dtp__native"[^>]*>/.exec(h) || [''])[0];
const host = (h) => (/^<td-datetime-picker[^>]*>/.exec(h) || [''])[0];

describe('php/td.php — td_datetime_picker / td_date (v0.56.0; contract datetime-picker@2 since v0.60.0)', opts, () => {
  test('constants: SSR_DATETIME_PICKER, DTP_LABELS = TdDatetimePicker.labels (placeholders)', async () => {
    const [ssr, labels] = run([['const', ['SSR_DATETIME_PICKER']], ['const', ['DTP_LABELS']]]);
    assert.equal(ssr.html, 'datetime-picker@2');
    globalThis.HTMLElement ??= class {};
    globalThis.customElements ??= { get: () => undefined, define: () => {} };
    const src = readFileSync(join(ROOT, 'src/form/td-datetime-picker.js'), 'utf8');
    for (const [k, v] of Object.entries(labels.html)) {
      assert.ok(new RegExp(`\\b${k}: '${v.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}'`).test(src), `${k} = ${v} in TdDatetimePicker.labels`);
    }
    assert.deepEqual(Object.keys(labels.html), ['placeholder', 'placeholderDate', 'clear']); // v0.59.0: + the clear button name
  });

  test('td_date: the exact markup (label, value, min / max, required, helper_text)', () => {
    assert.equal(html('td_date', 'ngay', '2026-06-15', { id: 'd', label: 'Ngày <giao>', min: '01/01/2026', max: '2026-12-31', required: true, helper_text: 'Theo "giờ" VN' }),
      '<td-datetime-picker data-td-ssr="datetime-picker@2" id="d" name="ngay" mode="date" value="15/06/2026" label="Ngày &lt;giao&gt;"'
      + ' min="2026-01-01" max="2026-12-31" required helper-text="Theo &quot;giờ&quot; VN"><div class="td-dtp" data-state="closed">'
      + '<label class="td-field__label" id="d-label" for="d-native">Ngày &lt;giao&gt;<span class="td-field__required" aria-hidden="true"> *</span></label>'
      + '<input class="td-dtp__native" type="date" id="d-native" name="ngay" value="2026-06-15" min="2026-01-01" max="2026-12-31" required aria-describedby="d-note">'
      + '<button type="button" class="td-dtp__trigger" id="d-trigger" role="combobox" aria-haspopup="dialog" aria-expanded="false" aria-required="true">'
      + '<span class="td-dtp__value">15/06/2026</span><span class="td-dtp__icon" data-td-icon="calendar" aria-hidden="true"></span></button></div>'
      + '<div class="td-field__note" id="d-note">Theo &quot;giờ&quot; VN</div></td-datetime-picker>');
  });

  test('td_datetime_picker: default mode datetime (= the element), native max 9999-12-31T23:59 (no min), step = minute_step × 60, error + disabled, placeholder', () => {
    assert.equal(html('td_datetime_picker', 'hen', null, { id: 'p', minute_step: 15, disabled: true, error: 'Sai <giờ>', placeholder: 'Chọn "lúc"', aria_label: 'Giờ hẹn' }),
      '<td-datetime-picker data-td-ssr="datetime-picker@2" id="p" name="hen" mode="datetime" placeholder="Chọn &quot;lúc&quot;" minute-step="15"'
      + ' disabled error-text="Sai &lt;giờ&gt;" aria-label="Giờ hẹn"><div class="td-dtp" data-state="closed">'
      + '<input class="td-dtp__native" type="datetime-local" id="p-native" name="hen" max="9999-12-31T23:59" step="900" disabled'
      + ' aria-label="Giờ hẹn" aria-invalid="true" aria-describedby="p-error">'
      + '<button type="button" class="td-dtp__trigger" id="p-trigger" role="combobox" aria-haspopup="dialog" aria-expanded="false" disabled>'
      + '<span class="td-dtp__value" data-placeholder>Chọn &quot;lúc&quot;</span><span class="td-dtp__icon" data-td-icon="calendar" aria-hidden="true"></span></button></div>'
      + '<span class="td-field-error" id="p-error" data-for="p">Sai &lt;giờ&gt;</span></td-datetime-picker>');
  });

  test('values: dd/mm/yyyy[ - hh:mm], ISO, ISO T, DB; date-only → 00:00, date-only max → 23:59; invalid / impossible dropped', () => {
    const cases = [
      ['td_date', '15/06/2026', {}, 'value="15/06/2026"', 'value="2026-06-15"'],
      ['td_date', '2026-06-15 08:30:00', {}, 'value="15/06/2026"', 'value="2026-06-15"'],
      ['td_datetime_picker', '15/06/2026 - 08:05', {}, 'value="15/06/2026 - 08:05"', 'value="2026-06-15T08:05"'],
      ['td_datetime_picker', '2026-06-15T08:05:59', {}, 'value="15/06/2026 - 08:05"', 'value="2026-06-15T08:05"'],
      ['td_datetime_picker', '2026-06-15 08:05:00', {}, 'value="15/06/2026 - 08:05"', 'value="2026-06-15T08:05"'],
      ['td_datetime_picker', '2026-06-15', {}, 'value="15/06/2026 - 00:00"', 'value="2026-06-15T00:00"'],
    ];
    const out = run(cases.map(([fn, v, o]) => [fn, ['x', v, { id: 'x', ...o }]]));
    cases.forEach(([fn, v, , h, n], i) => {
      assert.deepEqual(out[i].warns, [], v);
      assert.ok(host(out[i].html).includes(` ${h}`), `${fn} ${v}: host ${host(out[i].html)}`);
      assert.ok(native(out[i].html).includes(` ${n}`), `${fn} ${v}: native ${native(out[i].html)}`);
    });
    const max = html('td_datetime_picker', 'x', null, { id: 'x', max: '2026-12-31', min: '2026-01-01' });
    assert.ok(host(max).includes(' min="2026-01-01T00:00" max="2026-12-31T23:59"'), host(max));
    for (const bad of ['31/02/2026', '2026-13-01', 'junk', '25/12/2026 - 24:00', '<script>', '']) {
      const r = one('td_date', 'x', bad, { id: 'x' });
      assert.ok(!/ value=/.test(r.html), `${bad}: dropped`);
      assert.match(r.html, /data-placeholder>dd\/mm\/yyyy</, bad);
    }
    assert.ok(!/ min=| max="2026/.test(host(html('td_date', 'x', null, { id: 'x', min: 'nope', max: '99/99/2026' }))));
  });

  test('v0.60.0 (was D3b): no bound → a value outside 2000–2099 is KEPT, no warning; a bound still works', () => {
    const [low, high, kept, under] = run([
      ['td_date', ['d', '1990-05-01', { id: 'a' }]],
      ['td_date', ['d', '2150-01-01', { id: 'b' }]],
      ['td_date', ['d', '1990-05-01', { id: 'c', min: '1900-01-01' }]],
      ['td_date', ['d', '1899-12-31', { id: 'e', min: '1900-01-01' }]],
    ]);
    for (const [r, disp, nat] of [[low, '01/05/1990', '1990-05-01'], [high, '01/01/2150', '2150-01-01']]) {
      assert.deepEqual(r.warns, []);
      assert.ok(host(r.html).includes(` value="${disp}"`), host(r.html));
      assert.ok(native(r.html).includes(` value="${nat}" max="9999-12-31"`), native(r.html));
      assert.ok(!/ min=/.test(native(r.html)), 'no implicit min');
      assert.ok(!/ min=| max=/.test(host(r.html)), 'the representable limit is never on the host');
    }
    assert.deepEqual(kept.warns, []);
    assert.ok(host(kept.html).includes(' value="01/05/1990"') && host(kept.html).includes(' min="1900-01-01"'));
    assert.ok(native(kept.html).includes(' value="1990-05-01" min="1900-01-01" max="9999-12-31"'), native(kept.html));
    assert.ok(!/ max=/.test(host(kept.html)), 'only the site bound is on the host');
    assert.ok(host(under.html).includes(' value="31/12/1899"') && native(under.html).includes(' value="1899-12-31"'), 'out of min is kept (underflow on both sides)');
  });

  test('mode: month / year → date + one warning; td_date forces date even with mode => datetime; unknown → datetime', () => {
    const [m, y, forced, odd] = run([
      ['td_datetime_picker', ['x', '06/2026', { id: 'x', mode: 'month' }]],
      ['td_datetime_picker', ['x', null, { id: 'x', mode: 'year' }]],
      ['td_date', ['x', '2026-06-15T09:00', { id: 'x', mode: 'datetime' }]],
      ['td_datetime_picker', ['x', null, { id: 'x', mode: 'weekly' }]],
    ]);
    for (const r of [m, y]) {
      assert.equal(r.warns.length, 1);
      assert.match(host(r.html), / mode="date"/);
      assert.match(native(r.html), /type="date"/);
    }
    assert.deepEqual(forced.warns, []);
    assert.match(host(forced.html), / mode="date" value="15\/06\/2026"/);
    assert.match(host(odd.html), / mode="datetime"/);
  });

  test('options: form_value_format, open_at, class, id auto, minute_step invalid dropped, step only in datetime', () => {
    const a = html('td_datetime_picker', 'x', null, { id: 'x', form_value_format: 'db', open_at: 'min', minute_step: 7, class: 'a b' });
    assert.match(host(a), /^<td-datetime-picker data-td-ssr="datetime-picker@2" id="x" class="a b" name="x" mode="datetime" form-value-format="db" open-at="min">$/);
    assert.ok(!/ step=/.test(native(a)));
    const b = html('td_date', 'x', null, { id: 'x', minute_step: 15, open_at: '15/06/2026', form_value_format: 'nope' });
    assert.match(host(b), / minute-step="15" open-at="2026-06-15">$/);
    assert.ok(!/ step=/.test(native(b)), 'date: no step on the native input');
    const c = html('td_date', 'ngay', null, {});
    assert.match(host(c), /^<td-datetime-picker data-td-ssr="datetime-picker@2" id="td-[^"]+" name="ngay" mode="date">$/);
    assert.ok(!/ open-at=/.test(host(html('td_date', 'x', null, { id: 'x', open_at: 'later' }))));
  });

  test('attrs on the host: owned names reserved (value, name, mode, data-td-*), on* dropped; XSS in every text', () => {
    const p = '<img src=x onerror="window.__p=1">';
    const out = html('td_date', 'x"y', '2026-06-15', { id: 'i"d', label: p, placeholder: p, helper_text: p, error: p, aria_label: p,
      attrs: { 'data-x': '1', onclick: 'alert(1)', value: '01/01/2000', Name: 'evil', Mode: 'month', 'data-td-ssr': 'x', title: 'Gợi ý' } });
    assert.ok(!/<img/i.test(out), out);
    assert.ok(!/onclick|evil|01\/01\/2000|mode="month"|data-td-ssr="x"/.test(out), out);
    assert.match(host(out), / data-x="1" title="Gợi ý">$/);
    assert.ok(out.includes('id="i&quot;d"') && out.includes('name="x&quot;y"'), out);
  });

  test('other helpers are unchanged (td_field type=date is still the bare native input)', () => {
    assert.match(html('td_field', 'd', '2026-06-15', { type: 'date', label: 'Ngày', id: 'f' }), /<input[^>]* type="date"/);
  });

  test('fixture html is fresh (node test/ssr/build-datetime-picker-fixture.mjs)', () => {
    assert.equal(readFileSync(DATETIME_PICKER_FIXTURE_FILE, 'utf8'), renderDatetimePickerFixture());
  });
});
