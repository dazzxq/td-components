// v0.27.0 (ADR 0012, plan v0.27.0-dsuite-p0a §B + §D) — PHP side of the SSR contracts `otp-input@1` and `copy@1`:
//   - td_otp_input(): NATIVE by default (works without JS: maxlength / pattern / inputmode / one-time-code), ELEMENT mode
//     opt-in per call `element` + global Td::configure(..., ['ssr_elements' => true]); digit normalisation shared with
//     the component; owned names reserved in `attrs`; escaping.
//   - td_copy(): always the element, the server-authored `<code class="td-copy__source">` + the icon button + the status
//     region, exactly as <td-copy> renders them; escaping / reservation.
// Shared fixtures: test/ssr/otp.fixtures.json + copy.fixtures.json (also consumed by the SSR browser tests through
// test/ssr/fixtures/otp.html + copy.html — this test fails when they are stale: `node test/ssr/build-otp-copy-fixture.mjs`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HAS_PHP, runPhp } from './php.mjs';
import {
  OTP_FIXTURES, OTP_FIXTURE_FILE, renderOtpFixture, COPY_FIXTURES, COPY_FIXTURE_FILE, renderCopyFixture,
} from '../ssr/ssr.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };
const BASE = '/vendor/td/0.27.0';

/** htmlspecialchars(ENT_QUOTES | ENT_SUBSTITUTE) as Td::e() prints it. */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

/** One call in its own php process (generated ids start at 1 every time). */
function one(fn, args, options) {
  const [r] = runPhp([{ fn, args }], options ? { baseUrl: BASE, options } : { baseUrl: BASE });
  assert.equal(r.error, undefined, `${fn}: ${r.message}`);
  return r.out;
}

const CELLS = `<span class="td-otp__cells" aria-hidden="true">${'<span class="td-otp__cell"></span>'.repeat(6)}</span>`;
const OTP_IN = (rest) => `<input type="text" class="td-otp__input" ${rest}>`;

describe('php/td.php — td_otp_input (v0.27.0, contract otp-input@1)', opts, () => {
  test('native (default): a plain OTP field that works without JS', () => {
    assert.equal(one('td_otp_input', ['otp_code', {}]),
      '<div class="td-otp"><div class="td-otp__box">'
      + OTP_IN('id="td-otp_code-1-input" inputmode="numeric" autocomplete="one-time-code" name="otp_code" maxlength="6" pattern="[0-9]{6}" aria-label="Mã xác thực"')
      + '</div></div>');
    assert.equal(one('td_otp_input', ...OTP_FIXTURES.nativeCases.filter((c) => c.id === 'n-full').map((c) => c.args).slice(0, 1)),
      '<div class="td-otp x"><label class="td-otp__label" for="otp">Mã xác thực</label><div class="td-otp__box">'
      + OTP_IN('id="otp" inputmode="numeric" autocomplete="one-time-code" name="otp_code" maxlength="6" pattern="[0-9]{6}" value="1234" required autofocus aria-invalid="true" aria-errormessage="otp-error" aria-describedby="otp-error"')
      + '</div><span class="td-field-error" id="otp-error" data-for="otp">Sai mã</span></div>');
  });

  test('element mode: host + the same field + 6 decorative cells; error note after the field', () => {
    assert.equal(one('td_otp_input', ['code', { element: true, id: 'my-otp', label: 'Mã', required: true, error: 'Sai', value: '42' }]),
      '<td-otp-input data-td-ssr="otp-input@1" id="my-otp-host" name="code" value="42" label="Mã" required error-text="Sai">'
      + '<div class="td-otp"><label class="td-otp__label" for="my-otp">Mã</label><div class="td-otp__box">'
      + OTP_IN('id="my-otp" inputmode="numeric" autocomplete="one-time-code" name="code" maxlength="6" pattern="[0-9]{6}" value="42" required aria-invalid="true" aria-errormessage="my-otp-host-error" aria-describedby="my-otp-host-error"')
      + CELLS + '</div></div><span class="td-field-error" id="my-otp-host-error" data-for="my-otp-host">Sai</span></td-otp-input>');
    assert.equal(one('td_otp_input', ['otp_code', { element: true, aria_label: 'Mã 2FA', disabled: true, readonly: true }]),
      '<td-otp-input data-td-ssr="otp-input@1" id="td-otp_code-1" name="otp_code" disabled readonly aria-label="Mã 2FA">'
      + '<div class="td-otp"><div class="td-otp__box">'
      + OTP_IN('id="td-otp_code-1-input" inputmode="numeric" autocomplete="one-time-code" name="otp_code" maxlength="6" pattern="[0-9]{6}" disabled readonly aria-label="Mã 2FA"')
      + CELLS + '</div></div></td-otp-input>');
  });

  test('mode: global ssr_elements off/on × per call absent/false/true', () => {
    for (const mode of OTP_FIXTURES.modes) {
      const args = mode.call === 'absent' ? ['c', {}] : ['c', { element: mode.call }];
      const out = one('td_otp_input', args, mode.global ? { ssr_elements: true } : undefined);
      assert.equal(out.startsWith('<td-otp-input data-td-ssr="otp-input@1"'), mode.element, `${JSON.stringify(mode)}: ${out.slice(0, 60)}`);
      if (!mode.element) assert.ok(out.startsWith('<div class="td-otp">'), out);
    }
  });

  test('value: full-width / Arabic-Indic digits → ASCII, other characters dropped, max 6 (same rule as the component)', () => {
    const cases = { '１２3-45６789': '123456', '٤٥٦ ۷۸': '45678', 'abc': '', '12 34': '1234', '0000000': '000000' };
    const out = runPhp(Object.keys(cases).map((v) => ({ fn: 'td_otp_input', args: ['c', { value: v }] })), { baseUrl: BASE });
    Object.values(cases).forEach((want, i) => {
      const m = /value="([^"]*)"/.exec(out[i].out);
      assert.equal(m ? m[1] : '', want, Object.keys(cases)[i]);
    });
  });

  test('reservation: owned names in attrs never reach the input (case-insensitive), data-td-* blocked, unsafe names dropped', () => {
    const c = OTP_FIXTURES.cases.find((x) => x.id === 'o-attrs');
    const out = one('td_otp_input', c.args);
    const input = /<input[^>]*>/.exec(out)[0];
    assert.ok(input.includes(' data-x="1"') && input.includes(' title="Gợi ý"'), input);
    assert.ok(!/onclick|evil|999999|data-td-x/i.test(out), out);
    assert.equal((input.match(/\sname=/g) || []).length, 1);
    assert.ok(out.startsWith('<td-otp-input data-td-ssr="otp-input@1" id="td-code-1" class="a b" name="code">'), out);
  });

  test('escaping: every value is escaped (XSS case)', () => {
    const c = OTP_FIXTURES.cases.find((x) => x.id === 'o-xss');
    const out = one('td_otp_input', c.args);
    assert.ok(out.includes(`id="${esc('x"id')}-host"`), out);
    assert.ok(out.includes(`name="${esc('x"y')}"`), out);
    assert.ok(out.includes(`>${esc('<img src=x onerror=alert(1)>')}</label>`), out);
    assert.ok(out.includes(`>${esc('<b>lỗi</b>')}</span>`), out);
    assert.ok(!/<img|<b>/i.test(out), out);
  });

  test('test/ssr/fixtures/otp.html (browser fixture) is up to date', () => {
    assert.equal(readFileSync(OTP_FIXTURE_FILE, 'utf8'), renderOtpFixture(), 'stale fixture: run `node test/ssr/build-otp-copy-fixture.mjs`');
  });
});

describe('php/td.php — td_copy (v0.27.0, contract copy@1)', opts, () => {
  const svg = () => one('Td::icon', ['copy']);
  const expectCopy = (host, value, name, size = 'md') => `${host}<code class="td-copy__source">${esc(value)}</code>`
    + `<button type="button" class="td-copy td-copy--${size}" aria-label="${esc(name)}" data-tooltip="${esc(name)}">`
    + `<span class="td-copy__icon" data-td-icon="copy" aria-hidden="true">${svg()}</span></button>`
    + '<span class="td-copy__status" role="status"></span></td-copy>';

  test('always the element: source <code> + icon button + status region', () => {
    assert.equal(one('td_copy', ['ABCD-1234', { label: 'Copy mã khôi phục' }]),
      expectCopy('<td-copy data-td-ssr="copy@1" label="Copy mã khôi phục" size="md">', 'ABCD-1234', 'Copy mã khôi phục'));
    assert.equal(one('td_copy', ['evt-42']), expectCopy('<td-copy data-td-ssr="copy@1" size="md">', 'evt-42', 'Copy'));
    assert.equal(one('td_copy', ['S', { size: 'sm', sensitive: true, duration: 1500, id: 'cp', class: 'a b' }]),
      expectCopy('<td-copy data-td-ssr="copy@1" id="cp" class="a b" size="sm" sensitive duration="1500">', 'S', 'Copy', 'sm'));
    // unknown / invalid options are ignored (helper convention): bad size → md, negative duration dropped
    assert.equal(one('td_copy', ['x', { size: 'xl', duration: -5, nope: 1 }]), expectCopy('<td-copy data-td-ssr="copy@1" size="md">', 'x', 'Copy'));
  });

  test('reservation: owned names in attrs never reach the host (case-insensitive), data-td-* blocked, unsafe dropped', () => {
    const c = COPY_FIXTURES.cases.find((x) => x.id === 'c-attrs');
    const out = one('td_copy', c.args);
    assert.ok(out.startsWith('<td-copy data-td-ssr="copy@1" id="cp-1" class="a b" size="md" data-y="2" title="Gợi ý">'), out);
    for (const bad of ['onclick', 'evil', 'data-td-z', ' value=']) assert.ok(!out.includes(bad), bad);
  });

  test('escaping: value and label are escaped (XSS case); whitespace of the value is kept', () => {
    const c = COPY_FIXTURES.cases.find((x) => x.id === 'c-xss');
    const out = one('td_copy', c.args);
    assert.ok(out.includes(`<code class="td-copy__source">${esc(c.args[0])}</code>`), out);
    assert.ok(out.includes(`aria-label="${esc(c.args[1].label)}"`), out);
    assert.ok(!/<script|<img/i.test(out), out);
    assert.ok(one('td_copy', ['  a  b  ']).includes('<code class="td-copy__source">  a  b  </code>'));
  });

  test('test/ssr/fixtures/copy.html (browser fixture) is up to date', () => {
    assert.equal(readFileSync(COPY_FIXTURE_FILE, 'utf8'), renderCopyFixture(), 'stale fixture: run `node test/ssr/build-otp-copy-fixture.mjs`');
  });
});
