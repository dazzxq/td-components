// v0.59.0 (plan docs/internal/plans/v0.59.0-dsuite-small.md QĐ C1, D2, D3, E1, E2, F) — PHP side:
//   - every new option is ADDITIVE: absent / false → the v0.58.0 bytes (test/php/snapshots.json covers the old calls);
//   - td_number_input `signed`: element mode → host `signed`; native mode ignores it (type=number cannot show a `+`);
//   - td_action_button: an unknown `icon` → one E_USER_WARNING naming the cause (sanitised like the action warning —
//     printable ASCII, `\` / `"` escaped, ≤ 64 characters + the byte length), the markup unchanged;
//   - core icon `price` (alias `banknote`) for Td::icon;
//   - td_datetime_picker / td_date `clearable`: host `clearable`, `div.td-dtp--clearable`, the clear button after the trigger
//     (`hidden` without a value / required / disabled), the same markup <td-datetime-picker> renders;
//   - td_datetime_range `allow_open_end`: host `allow-open-end`, trigger "01/10/2026 – Không hạn", the end native never
//     `required` (required / both → start only).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

/** Calls in ONE php process; each returns { html, warns } (td_ warnings captured). */
function run(calls) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ` $calls = json_decode(${JSON.stringify(JSON.stringify(calls))}, true, 64, JSON_THROW_ON_ERROR); $out = [];`
    + ' foreach ($calls as [$fn, $a]) { $w = []; set_error_handler(function (int $no, string $msg) use (&$w): bool {'
    + " if ($no === E_USER_WARNING && str_starts_with($msg, 'td_')) { $w[] = $msg; return true; } return false; });"
    + ' $html = str_contains($fn, \'::\') ? call_user_func($fn, ...$a) : $fn(...$a);'
    + ' restore_error_handler(); $out[] = [\'html\' => $html, \'warns\' => $w]; }'
    + ' echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}
const one = (fn, ...args) => run([[fn, args]])[0];

describe('php/td.php — v0.59.0 options are additive', opts, () => {
  test('false / absent options print the same bytes', () => {
    const pairs = [
      ['td_number_input', ['n', '300000', { element: true, id: 'n1' }], { signed: false }],
      ['td_number_input', ['n', '300000', { id: 'n2' }], { signed: true }], // native: ignored
      ['td_date', ['d', '2026-06-15', { label: 'Ngày', id: 'd1' }], { clearable: false }],
      ['td_datetime_picker', ['d', '15/06/2026 - 09:30', { id: 'd2' }], { clearable: false }],
      ['td_datetime_range', ['r', '2026-10-01', null, { required: true, id: 'r1' }], { allow_open_end: false }],
    ];
    const res = run(pairs.flatMap(([fn, args, extra]) => {
      const withOpt = structuredClone(args);
      Object.assign(withOpt[withOpt.length - 1], extra);
      return [[fn, args], [fn, withOpt]];
    }));
    for (let i = 0; i < pairs.length; i += 1) assert.equal(res[2 * i + 1].html, res[2 * i].html, JSON.stringify(pairs[i]));
  });
});

describe('php/td.php — v0.59.0 td_number_input signed', opts, () => {
  test('element mode: host `signed`, the inner tree unchanged (canonical value, never pre-formatted)', () => {
    const [plain, signed] = run([
      ['td_number_input', ['delta', '300000', { element: true, min: '-1000000', id: 'n3' }]],
      ['td_number_input', ['delta', '300000', { element: true, min: '-1000000', signed: true, id: 'n3' }]],
    ]);
    assert.match(signed.html, /^<td-number-input [^>]* signed>/);
    assert.equal(signed.html.replace(' signed>', '>'), plain.html);
    assert.ok(!signed.html.includes('+300'));
  });
});

describe('php/td.php — v0.59.0 td_action_button icon warning + price icon', opts, () => {
  test('unknown icon with a preset → the preset icon, one warning, markup = without the icon', () => {
    const [bad, plain] = run([['td_action_button', ['edit', { icon: 'khong-co' }]], ['td_action_button', ['edit', {}]]]);
    assert.equal(bad.html, plain.html);
    assert.deepEqual(bad.warns, ['td_action_button: unknown icon "khong-co" (8 bytes) — preset icon used']);
  });

  test('unknown icon without a preset (icon + label given) → "" + the icon warning (not "unknown action")', () => {
    const r = one('td_action_button', 'gia', { icon: 'khong-co', label: 'Sửa giá' });
    assert.equal(r.html, '');
    assert.deepEqual(r.warns, ['td_action_button: unknown icon "khong-co" (8 bytes) — nothing rendered']);
  });

  test('the icon name in the warning is sanitised (control bytes / non-ASCII dropped, " and \\ escaped, ≤ 64 chars)', () => {
    const evil = `a"b\\c\n\u2028đ${'x'.repeat(200)}`;
    const r = one('td_action_button', 'edit', { icon: evil });
    assert.equal(r.warns.length, 1);
    const m = /^td_action_button: unknown icon "(.*)" \((\d+) bytes\) — preset icon used$/.exec(r.warns[0]);
    assert.ok(m, r.warns[0]);
    assert.equal(Number(m[2]), Buffer.byteLength(evil.trim()));
    assert.ok(!/[\n\u2028đ]/.test(m[1]));
    assert.ok(m[1].startsWith('a\\"b\\\\c'));
  });

  test('valid icons never warn; unknown action keeps the v0.36 warning', () => {
    assert.deepEqual(one('td_action_button', 'edit', { icon: 'price' }).warns, []);
    assert.deepEqual(one('td_action_button', 'edit', { icon: 'tag' }).warns, []);
    assert.match(one('td_action_button', 'khong-ton-tai', {}).warns[0], /^td_action_button: unknown action "khong-ton-tai"/);
  });

  test('Td::icon("price") / ("banknote") = the banknote geometry with data-icon="price"', () => {
    const [a, b] = run([['TdComponents\\Td::icon', ['price']], ['TdComponents\\Td::icon', ['banknote']]]);
    assert.match(a.html, /data-icon="price"/);
    assert.match(a.html, /<rect width="20" height="12" x="2" y="6" rx="2"/);
    assert.match(a.html, /<circle cx="12" cy="12" r="2"/);
    assert.match(a.html, /<path d="M6 12h\.01M18 12h\.01"/);
    assert.equal(b.html, a.html);
  });
});

describe('php/td.php — v0.59.0 td_datetime_picker clearable', opts, () => {
  const clearRe = /<button type="button" class="td-dtp__clear" aria-label="Xoá ngày"( hidden)?><span class="td-dtp__clear-icon" data-td-icon="close" data-td-icon-size="s" aria-hidden="true"><\/span><\/button><\/div>/;
  test('host `clearable`, .td-dtp--clearable, the button right after the trigger; hidden without a value / required / disabled', () => {
    const [filled, empty, req, dis] = run([
      ['td_date', ['d', '2026-06-15', { clearable: true, label: 'Hạn' }]],
      ['td_date', ['d', null, { clearable: true }]],
      ['td_date', ['d', '2026-06-15', { clearable: true, required: true }]],
      ['td_datetime_picker', ['d', '15/06/2026 - 09:30', { clearable: true, disabled: true }]],
    ]);
    assert.match(filled.html, /^<td-datetime-picker [^>]*\bclearable>/);
    assert.match(filled.html, /<div class="td-dtp td-dtp--clearable" data-state="closed">/);
    assert.match(filled.html, /<\/span><\/button><button type="button" class="td-dtp__clear"/);
    assert.equal(clearRe.exec(filled.html)?.[1], undefined);
    for (const r of [empty, req, dis]) assert.equal(clearRe.exec(r.html)?.[1], ' hidden');
  });

  test('`clearable` is reserved in attrs', () => {
    const r = one('td_date', 'd', '2026-06-15', { attrs: { clearable: '' } });
    assert.ok(!/\bclearable\b/.test(r.html));
  });
});

describe('php/td.php — v0.59.0 td_datetime_range allow_open_end', opts, () => {
  test('host `allow-open-end`; trigger "01/10/2026 – Không hạn"; required → the start native only', () => {
    const r = one('td_datetime_range', 'hl', '2026-10-01', null, { allow_open_end: true, required: true });
    assert.match(r.html, /^<td-datetime-range [^>]*\ballow-open-end[ >]/);
    assert.match(r.html, /<span class="td-dtr__value">01\/10\/2026 – Không hạn<\/span>/);
    assert.match(r.html, /data-part="start" name="hl\[start\]" value="2026-10-01" required/);
    assert.ok(!/data-part="end"[^>]*\brequired\b/.test(r.html));
    assert.match(r.html, /<span class="td-field__required" aria-hidden="true"> \*<\/span>/);
  });

  test('required="end" + allow_open_end → nothing required (no star, no aria-required)', () => {
    const r = one('td_datetime_range', 'hl', '2026-10-01', null, { allow_open_end: true, required: 'end', label: 'X' });
    const natives = r.html.match(/<input class="td-dtr__native"[^>]*>/g);
    assert.equal(natives.length, 2);
    for (const n of natives) assert.ok(!/ required[ >]/.test(n), n);
    assert.ok(!r.html.includes('aria-required'));
    assert.ok(!r.html.includes('td-field__required'));
  });

  test('texts without an open end are unchanged; `allow-open-end` reserved in attrs', () => {
    const [both, endOnly, attr] = run([
      ['td_datetime_range', ['r', '2026-10-01', '2026-10-05', { allow_open_end: true }]],
      ['td_datetime_range', ['r', null, '2026-10-05', { allow_open_end: true }]],
      ['td_datetime_range', ['r', '2026-10-01', null, { attrs: { 'allow-open-end': '' } }]],
    ]);
    assert.match(both.html, />01\/10\/2026 – 05\/10\/2026</);
    assert.match(endOnly.html, />Đến 05\/10\/2026</);
    assert.ok(!attr.html.includes('allow-open-end'));
    assert.match(attr.html, />Từ 01\/10\/2026</);
  });
});
