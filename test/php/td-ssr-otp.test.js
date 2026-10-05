// v0.36.0 (plan v0.36.0-polish QĐ 42–48) — PHP side of the additive otp-input@1 options length / charset / case:
//   - td__otp_value() == src/utils/otp.js otpNormalize() on OTP_CASES (parity), length parsing == OTP_LENGTH_CASES;
//   - invalid length / charset / case → the default + ONE E_USER_WARNING each;
//   - the 6-digit numeric markup is byte-identical to v0.35 (golden), 8 digits / 5 alphanumerics carry data-length,
//     host length / charset, letter input attributes, maxlength / pattern per charset.
// The browser side (adoption of these fixtures in three engines) is src/form/td-otp-input.ssr.engines.browser-test.js
// + src/form/td-v036-otp.engines.browser-test.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';
import { OTP_CASES, OTP_LENGTH_CASES, otpNormalize, otpPattern } from '../../src/utils/otp.js';
// Wall-clock budgets guard against super-linear blow-ups, not micro-speed: on a shared host (CI, several suites at
// once) they get 20× slack, which still catches quadratic behaviour; TD_PERF_STRICT=1 enforces the raw budget.
const PERF_SLACK = process.env.TD_PERF_STRICT ? 1 : 20;

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

/**
 * Calls in ONE php process, each with its own count of td_otp_input warnings (the harness forbids stderr).
 * @param {Array<[string, any[]]>} calls [function, args]
 * @returns {Array<{ out: any, warns: string[] }>}
 */
function run(calls) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ` $calls = json_decode(${JSON.stringify(JSON.stringify(calls))}, true, 64, JSON_THROW_ON_ERROR); $res = [];`
    + ' foreach ($calls as [$fn, $a]) { $w = []; set_error_handler(function (int $no, string $msg) use (&$w): bool {'
    + " if ($no === E_USER_WARNING && str_starts_with($msg, 'td_otp_input:')) { $w[] = $msg; return true; } return false; });"
    + ' $out = $fn(...$a); restore_error_handler(); $res[] = [\'out\' => $out, \'warns\' => $w]; }'
    + ' echo json_encode($res, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}

const CELLS = (n) => `<span class="td-otp__cells" aria-hidden="true">${'<span class="td-otp__cell"></span>'.repeat(n)}</span>`;

describe('php/td.php — td_otp_input v0.36.0 (length / charset / case, otp-input@1 additive)', opts, () => {
  test('td__otp_value == otpNormalize on OTP_CASES (parity)', () => {
    const calls = OTP_CASES.map(([raw, o]) => ['td__otp_value', [raw, o.length || 6, o.charset || 'numeric', o.case || 'upper']]);
    const out = run(calls);
    OTP_CASES.forEach(([raw, o, want], i) => {
      assert.equal(out[i].out, want, `php ${raw} ${JSON.stringify(o)}`);
      assert.equal(otpNormalize(raw, o), want, `js ${raw}`);
    });
  });

  test('length parsing == OTP_LENGTH_CASES: valid → that many cells; invalid → 6 + one warning', () => {
    const calls = OTP_LENGTH_CASES.map(([raw]) => ['td_otp_input', ['c', raw === null ? { element: true } : { element: true, length: raw }]]);
    const out = run(calls);
    OTP_LENGTH_CASES.forEach(([raw, len, valid], i) => {
      const cells = (out[i].out.match(/class="td-otp__cell"/g) || []).length;
      assert.equal(cells, len, `cells for ${JSON.stringify(raw)}`);
      assert.equal(out[i].warns.length, valid ? 0 : 1, `warnings for ${JSON.stringify(raw)}: ${out[i].warns}`);
      assert.ok(out[i].out.includes(`maxlength="${len}"`), out[i].out);
    });
  });

  test('invalid charset / case → numeric / upper + one warning each', () => {
    const [a, b, c] = run([
      ['td_otp_input', ['c', { charset: 'hex' }]],
      ['td_otp_input', ['c', { charset: 'alpha', case: 'UPPER' }]],
      ['td_otp_input', ['c', { charset: 'alpha', case: 'lower', length: 3 }]],
    ]);
    assert.equal(a.warns.length, 1);
    assert.ok(a.out.includes('inputmode="numeric"') && a.out.includes('pattern="[0-9]{6}"'), a.out);
    assert.equal(b.warns.length, 1);
    assert.ok(b.out.includes('autocapitalize="characters"'), b.out);
    assert.equal(c.warns.length, 0);
    assert.ok(c.out.includes('autocapitalize="none"') && c.out.includes('pattern="[A-Za-z]{3}"'), c.out);
  });

  test('golden: 6-digit numeric markup is byte-identical to v0.35 (native + element)', () => {
    const [n, e] = run([['td_otp_input', ['otp_code', {}]], ['td_otp_input', ['code', { element: true, id: 'g', value: '42' }]]]);
    assert.equal(n.out, '<div class="td-otp"><div class="td-otp__box"><input type="text" class="td-otp__input" id="td-otp_code-1-input"'
      + ' inputmode="numeric" autocomplete="one-time-code" name="otp_code" maxlength="6" pattern="[0-9]{6}" aria-label="Mã xác thực"></div></div>');
    assert.equal(e.out, '<td-otp-input data-td-ssr="otp-input@1" id="g-host" name="code" value="42"><div class="td-otp"><div class="td-otp__box">'
      + '<input type="text" class="td-otp__input" id="g" inputmode="numeric" autocomplete="one-time-code" name="code" maxlength="6"'
      + ` pattern="[0-9]{6}" value="42" aria-label="Mã xác thực">${CELLS(6)}</div></div></td-otp-input>`);
  });

  test('8 digits: data-length, host length, 8 cells, maxlength / pattern 8', () => {
    const [r] = run([['td_otp_input', ['code', { element: true, id: 'e8', length: 8, value: '1234-5678 9' }]]]);
    assert.equal(r.out, '<td-otp-input data-td-ssr="otp-input@1" id="e8-host" name="code" value="12345678" length="8">'
      + '<div class="td-otp" data-length="8"><div class="td-otp__box"><input type="text" class="td-otp__input" id="e8" inputmode="numeric"'
      + ' autocomplete="one-time-code" name="code" maxlength="8" pattern="[0-9]{8}" value="12345678" aria-label="Mã xác thực">'
      + `${CELLS(8)}</div></div></td-otp-input>`);
  });

  test('Steam-like 5 alphanumerics: host charset, letter input attributes, pattern, value upper-cased', () => {
    const [el, nat] = run([
      ['td_otp_input', ['code', { element: true, id: 's', length: 5, charset: 'alphanumeric', value: 'wm-x7q' }]],
      ['td_otp_input', ['code', { id: 'sn', length: 5, charset: 'alphanumeric', case: 'preserve', class: 'x' }]],
    ]);
    assert.equal(el.out, '<td-otp-input data-td-ssr="otp-input@1" id="s-host" name="code" value="WMX7Q" length="5" charset="alphanumeric">'
      + '<div class="td-otp" data-length="5"><div class="td-otp__box"><input type="text" class="td-otp__input" id="s" inputmode="text"'
      + ' autocomplete="one-time-code" autocapitalize="characters" autocorrect="off" spellcheck="false" name="code" maxlength="5"'
      + ` pattern="${otpPattern('alphanumeric', 5)}" value="WMX7Q" aria-label="Mã xác thực">${CELLS(5)}</div></div></td-otp-input>`);
    assert.equal(nat.out, '<div class="td-otp x" data-length="5"><div class="td-otp__box"><input type="text" class="td-otp__input" id="sn"'
      + ' inputmode="text" autocomplete="one-time-code" autocapitalize="none" autocorrect="off" spellcheck="false" name="code"'
      + ' maxlength="5" pattern="[A-Za-z0-9]{5}" aria-label="Mã xác thực"></div></div>');
  });

  test('owned letter attributes cannot be overridden through attrs', () => {
    const [r] = run([['td_otp_input', ['c', { charset: 'alpha', attrs: { autocorrect: 'on', spellcheck: 'true', autocapitalize: 'none', 'data-x': '1' } }]]]);
    assert.ok(r.out.includes(' autocorrect="off"') && !r.out.includes('autocorrect="on"'), r.out);
    assert.equal((r.out.match(/spellcheck=/g) || []).length, 1);
    assert.equal((r.out.match(/autocapitalize=/g) || []).length, 1);
    assert.ok(r.out.includes(' data-x="1"'), r.out);
  });
});

describe('SEC-01 (v0.36.0 review): huge OTP input is rejected before normalisation, bounded time / memory', opts, () => {
  test('a 4 MB string with no valid character → "" quickly in PHP; JS otpNormalize mirrors the 256-byte cap', () => {
    const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))};`
      + ' $big = str_repeat("\u{3042}-x ", 400000); $t = microtime(true); $m0 = memory_get_usage();'
      + ' $a = td__otp_value($big, 6, "alphanumeric", "upper");'
      + ' $b = td__otp_value(str_repeat("1", 257), 6); $c = td__otp_value(str_repeat("1", 256), 6);'
      + ' echo json_encode([$a, $b, $c, microtime(true) - $t, memory_get_usage() - $m0]);';
    const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const [a, b, c, secs, mem] = JSON.parse(r.stdout);
    assert.equal(a, '');
    assert.equal(b, '', '> 256 bytes → empty');
    assert.equal(c, '111111', '≤ 256 bytes → normal');
    assert.ok(secs < 0.5 * PERF_SLACK, `bounded time (${secs}s)`);
    assert.ok(mem < 1024 * 1024, `no per-character array (${mem} bytes)`);
    assert.equal(otpNormalize('1'.repeat(257)), '');
    assert.equal(otpNormalize('1'.repeat(256)), '111111');
    assert.equal(otpNormalize('\u3042'.repeat(86) + '12'), '', '86 × 3 bytes + 2 = 260 bytes → empty');
    const t0 = performance.now();
    assert.equal(otpNormalize('x-'.repeat(2e6), { charset: 'numeric' }), '');
    assert.ok(performance.now() - t0 < 200 * PERF_SLACK);
  });
});

