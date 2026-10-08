// v0.60.0 (plan docs/internal/plans/v0.60.0-calendar-picker.md B3, B5, B6 — M1a / M2) — PHP side of the SSR contract
// `datetime-picker@2`:
//   - the implicit 2000–2099 year window is GONE: td_datetime_picker() / td_date() print every representable server value
//     (years 1–9999, zero-padded) and never warn about the year;
//   - the native no-JS input carries no implicit `min`; its `max` is the site's, else `9999-12-31` (`T23:59` for datetime):
//     the limit of what the kit can represent, not a business window — a date input without `max` takes a 6-digit year in
//     Chromium (M0), a value the element could not parse;
//   - the host only ever carries the SITE's min / max;
//   - td_datetime_range() is unchanged (contract `datetime-range@1`, it never had a window in PHP).
// The v0.59.0 output (contract `datetime-picker@1`) stays FROZEN in test/ssr/fixtures/datetime-picker.v1.html and
// test/ssr/fixtures/fouc-datetime-picker.v1.html — this test guards that nobody regenerates them.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';
import { DATETIME_PICKER_FIXTURES, DATETIME_PICKER_FIXTURE_FILE } from '../ssr/ssr.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

/** Calls in ONE php process; each returns { html, warns } (EVERY warning / notice captured — none is expected). */
function run(calls) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ` $calls = json_decode(${JSON.stringify(JSON.stringify(calls))}, true, 64, JSON_THROW_ON_ERROR); $out = [];`
    + ' foreach ($calls as [$fn, $a]) { $w = []; set_error_handler(function (int $no, string $msg) use (&$w): bool { $w[] = $msg; return true; });'
    + ' $html = $fn === \'const\' ? constant(\'TdComponents\\\\Td::\' . $a[0]) : $fn(...$a);'
    + ' restore_error_handler(); $out[] = [\'html\' => $html, \'warns\' => $w]; }'
    + ' echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}
const native = (h) => (/<input class="td-dtp__native"[^>]*>/.exec(h) || [''])[0];
const host = (h) => (/^<td-datetime-picker[^>]*>/.exec(h) || [''])[0];
const attr = (tag, name) => (new RegExp(` ${name}="([^"]*)"`).exec(tag) || [null, null])[1];

describe('php/td.php — datetime-picker@2 (v0.60.0): no 2000–2099 window', opts, () => {
  test('the marker is datetime-picker@2; datetime-range stays @1', () => {
    const [p, r, h] = run([['const', ['SSR_DATETIME_PICKER']], ['const', ['SSR_DATETIME_RANGE']], ['td_date', ['d', null, { id: 'x' }]]]);
    assert.equal(p.html, 'datetime-picker@2');
    assert.equal(r.html, 'datetime-range@1');
    assert.match(host(h.html), /^<td-datetime-picker data-td-ssr="datetime-picker@2" /);
  });

  test('every representable year is printed (host display + native value), zero-padded, without a warning', () => {
    const cases = [
      ['0001-01-01', '01/01/0001', '0001-01-01'],
      ['01/01/0001', '01/01/0001', '0001-01-01'],
      ['0999-03-15', '15/03/0999', '0999-03-15'],
      ['15/03/1999', '15/03/1999', '1999-03-15'],
      ['1900-02-28', '28/02/1900', '1900-02-28'],
      ['0004-02-29', '29/02/0004', '0004-02-29'],
      ['2100-01-01', '01/01/2100', '2100-01-01'],
      ['9999-12-31', '31/12/9999', '9999-12-31'],
    ];
    const out = run(cases.map(([v]) => ['td_date', ['d', v, { id: 'x' }]]));
    cases.forEach(([v, disp, nat], i) => {
      assert.deepEqual(out[i].warns, [], `${v}: no warning`);
      assert.equal(attr(host(out[i].html), 'value'), disp, v);
      assert.equal(attr(native(out[i].html), 'value'), nat, v);
      assert.ok(out[i].html.includes(`<span class="td-dtp__value">${disp}</span>`), `${v}: the trigger text`);
    });
  });

  test('datetime mode: the same, with the time', () => {
    const out = run([
      ['td_datetime_picker', ['d', '1999-03-15 09:30:00', { id: 'x' }]],
      ['td_datetime_picker', ['d', '31/12/9999 - 23:59', { id: 'x' }]],
      ['td_datetime_picker', ['d', '0001-01-01T00:00', { id: 'x' }]],
    ]);
    assert.deepEqual(out.map((o) => o.warns), [[], [], []]);
    assert.deepEqual(out.map((o) => attr(host(o.html), 'value')), ['15/03/1999 - 09:30', '31/12/9999 - 23:59', '01/01/0001 - 00:00']);
    assert.deepEqual(out.map((o) => attr(native(o.html), 'value')), ['1999-03-15T09:30', '9999-12-31T23:59', '0001-01-01T00:00']);
  });

  test('still dropped (silently, as before): year 0, 3- / 5-digit years, impossible dates', () => {
    const bad = ['0000-01-01', '01/01/0000', '999-03-15', '15/3/999', '12026-03-15', '15/03/12026', '1900-02-29', '29/02/1900', '31/04/1999', '202600-03-15'];
    const out = run(bad.map((v) => ['td_date', ['d', v, { id: 'x' }]]));
    bad.forEach((v, i) => {
      assert.deepEqual(out[i].warns, [], v);
      assert.ok(!/ value=/.test(out[i].html), `${v}: dropped`);
      assert.match(out[i].html, /data-placeholder>dd\/mm\/yyyy</, v);
    });
  });

  test('native bounds: no implicit min; max = the site max, else 9999-12-31[T23:59]; the host carries the SITE bounds only', () => {
    const [none, minOnly, maxOnly, both, dt, dtMax, badBounds] = run([
      ['td_date', ['d', null, { id: 'x' }]],
      ['td_date', ['d', null, { id: 'x', min: '1970-01-01' }]],
      ['td_date', ['d', null, { id: 'x', max: '2030-12-31' }]],
      ['td_date', ['d', null, { id: 'x', min: '0001-01-01', max: '9999-12-31' }]],
      ['td_datetime_picker', ['d', null, { id: 'x' }]],
      ['td_datetime_picker', ['d', null, { id: 'x', max: '2030-12-31' }]],
      ['td_date', ['d', null, { id: 'x', min: 'nope', max: '0000-01-01' }]],
    ]);
    const pair = (tag) => [attr(tag, 'min'), attr(tag, 'max')];
    assert.deepEqual([pair(host(none.html)), pair(native(none.html))], [[null, null], [null, '9999-12-31']]);
    assert.deepEqual([pair(host(minOnly.html)), pair(native(minOnly.html))], [['1970-01-01', null], ['1970-01-01', '9999-12-31']]);
    assert.deepEqual([pair(host(maxOnly.html)), pair(native(maxOnly.html))], [[null, '2030-12-31'], [null, '2030-12-31']]);
    assert.deepEqual([pair(host(both.html)), pair(native(both.html))], [['0001-01-01', '9999-12-31'], ['0001-01-01', '9999-12-31']]);
    assert.deepEqual([pair(host(dt.html)), pair(native(dt.html))], [[null, null], [null, '9999-12-31T23:59']]);
    assert.deepEqual([pair(host(dtMax.html)), pair(native(dtMax.html))], [[null, '2030-12-31T23:59'], [null, '2030-12-31T23:59']]);
    assert.deepEqual([pair(host(badBounds.html)), pair(native(badBounds.html))], [[null, null], [null, '9999-12-31']], 'invalid bounds are dropped → the default');
    for (const r of [none, minOnly, maxOnly, both, dt, dtMax, badBounds]) assert.deepEqual(r.warns, []);
  });

  test('the exact @2 markup of a field without bounds (attribute order = what the element gate expects)', () => {
    const [r] = run([['td_date', ['ngay', '1958-07-04', { id: 'd', label: 'Ngày sinh', required: true, clearable: true }]]]);
    assert.deepEqual(r.warns, []);
    assert.equal(r.html,
      '<td-datetime-picker data-td-ssr="datetime-picker@2" id="d" name="ngay" mode="date" value="04/07/1958" label="Ngày sinh" required clearable>'
      + '<div class="td-dtp td-dtp--clearable" data-state="closed">'
      + '<label class="td-field__label" id="d-label" for="d-native">Ngày sinh<span class="td-field__required" aria-hidden="true"> *</span></label>'
      + '<input class="td-dtp__native" type="date" id="d-native" name="ngay" value="1958-07-04" max="9999-12-31" required>'
      + '<button type="button" class="td-dtp__trigger" id="d-trigger" role="combobox" aria-haspopup="dialog" aria-expanded="false" aria-required="true">'
      + '<span class="td-dtp__value">04/07/1958</span><span class="td-dtp__icon" data-td-icon="calendar" aria-hidden="true"></span></button>'
      + '<button type="button" class="td-dtp__clear" aria-label="Xoá ngày" hidden><span class="td-dtp__clear-icon" data-td-icon="close" data-td-icon-size="s" aria-hidden="true"></span></button>'
      + '</div></td-datetime-picker>');
  });

  test('a value outside min / max is still printed (the browser / the element flag the range)', () => {
    const [r] = run([['td_date', ['d', '1999-03-15', { id: 'x', min: '2026-01-01', max: '2026-12-31' }]]]);
    assert.deepEqual(r.warns, []);
    assert.equal(attr(native(r.html), 'value'), '1999-03-15');
    assert.deepEqual([attr(native(r.html), 'min'), attr(native(r.html), 'max')], ['2026-01-01', '2026-12-31']);
  });

  test('td_datetime_range is unchanged: datetime-range@1, natives carry the SITE bounds only (no implicit max)', () => {
    const [r, b] = run([
      ['td_datetime_range', ['r', '1999-03-15', '2100-01-01', { id: 'x' }]],
      ['td_datetime_range', ['r', null, null, { id: 'x', min: '1970-01-01', max: '2030-12-31' }]],
    ]);
    assert.deepEqual([r.warns, b.warns], [[], []]);
    assert.match(r.html, /^<td-datetime-range data-td-ssr="datetime-range@1" /);
    const inputs = [...r.html.matchAll(/<input class="td-dtr__native"[^>]*>/g)].map((m) => m[0]);
    assert.equal(inputs.length, 2);
    assert.deepEqual(inputs.map((i) => attr(i, 'value')), ['1999-03-15', '2100-01-01']);
    assert.ok(inputs.every((i) => !/ min=| max=/.test(i)), 'no implicit bounds on the range natives');
    const bounded = [...b.html.matchAll(/<input class="td-dtr__native"[^>]*>/g)].map((m) => m[0]);
    assert.ok(bounded.every((i) => attr(i, 'min') === '1970-01-01' && attr(i, 'max') === '2030-12-31'));
  });
});

describe('frozen datetime-picker@1 fixtures (never regenerated)', () => {
  const v1 = readFileSync(join(ROOT, 'test/ssr/fixtures/datetime-picker.v1.html'), 'utf8');
  const fouc1 = readFileSync(join(ROOT, 'test/ssr/fixtures/fouc-datetime-picker.v1.html'), 'utf8');

  test('datetime-picker.v1.html: one @1 host per case of the fixture spec, the v0.59.0 implicit domain, no @2 anywhere', () => {
    const hosts = [...v1.matchAll(/<form class="ssr-case" data-case="([^"]+)"[^>]*><td-datetime-picker data-td-ssr="(datetime-picker@\d+)"/g)];
    assert.deepEqual(hosts.map((m) => m[1]), DATETIME_PICKER_FIXTURES.cases.map((c) => c.id));
    assert.ok(hosts.every((m) => m[2] === 'datetime-picker@1'));
    assert.ok(!v1.includes('datetime-picker@2') && !v1.includes('9999-12-31'));
    const noBounds = /<form class="ssr-case" data-case="p-date"[\s\S]*?<\/form>/.exec(v1)[0];
    assert.match(noBounds, /<input class="td-dtp__native" type="date" id="p-date-native" name="ngay" value="2026-06-15" min="2000-01-01" max="2099-12-31">/);
    // php v0.59.0 dropped the 1990 value of p-old
    assert.ok(!/ value=/.test(/<form class="ssr-case" data-case="p-old"[\s\S]*?<\/form>/.exec(v1)[0]));
    assert.match(v1, /^<!-- FROZEN /);
  });

  test('fouc-datetime-picker.v1.html: the dtp1-* sections, all @1', () => {
    const ids = [...fouc1.matchAll(/<section class="fouc-case" data-case="([^"]+)" data-kind="[a-z]+" data-module="datetime-picker" data-width="\d+" data-tag="td-datetime-picker"><td-datetime-picker data-td-ssr="(datetime-picker@\d+)"/g)];
    assert.equal(ids.length, 11);
    assert.ok(ids.every((m) => m[1].startsWith('dtp1-') && m[2] === 'datetime-picker@1'));
    assert.ok(!fouc1.includes('datetime-picker@2'));
    assert.match(fouc1, /^<!-- FROZEN /);
  });

  test('the generated fixture is @2 (it must differ from the frozen one)', opts, () => {
    const gen = readFileSync(DATETIME_PICKER_FIXTURE_FILE, 'utf8');
    assert.ok(gen.includes('datetime-picker@2') && !gen.includes('datetime-picker@1'));
    assert.ok(!gen.includes('2099-12-31'), 'no implicit 2000–2099 domain in the generated markup');
  });
});
