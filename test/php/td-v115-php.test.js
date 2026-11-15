// v0.115.0 (plan docs/internal/plans/v0.115.0-password-reveal.md QĐ 6, 8) — PHP side of `revealable`:
//   - element mode + type password: host `revealable`, `td-field--affix` box (even without prefix / suffix), the eye
//     button AFTER the suffix and BEFORE the hidden unit span — the exact markup <td-input-field revealable> renders
//     (adoption in Chromium / Firefox / WebKit: src/form/td-v115-password-reveal.engines.browser-test.js);
//   - the button name = TdInputField.messages.reveal;
//   - native mode and other types ignore it: byte-identical to the same call without the option;
//   - test/ssr/fixtures/reveal.html is fresh.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HAS_PHP, ROOT, runPhp } from './php.mjs';
import { REVEAL_FIXTURE_FILE, renderRevealFixture } from '../ssr/ssr.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

const field = (...calls) => runPhp(calls.map((args) => ({ fn: 'td_field', args }))).map((r) => {
  assert.equal(r.error, undefined, r.message);
  return r.out;
});
const noSvg = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '');

describe('php/td.php — v0.115.0 td_field revealable', opts, () => {
  test('element + password: the exact markup (host attribute, box, button after the suffix, before the unit)', () => {
    const [basic, affix] = field(
      ['password', '', { element: true, id: 'pw', type: 'password', label: 'Mật khẩu', autocomplete: 'current-password', revealable: true }],
      ['pin', '', { element: true, id: 'p', type: 'password', suffix: 'số', revealable: true }],
    );
    const btn = (cid) => `<button type="button" class="td-field__reveal" aria-controls="${cid}" aria-pressed="false" aria-label="Hiện mật khẩu">`
      + '<span class="td-field__reveal-icon" data-td-icon="eye" data-td-icon-class="td-field__reveal-svg"></span></button>';
    assert.equal(noSvg(basic), '<td-input-field data-td-ssr="input-field@1" id="pw-host" type="password" size="md" name="password"'
      + ' label="Mật khẩu" revealable field-id="pw" autocomplete="current-password"><div class="td-field td-field--md td-field--affix">'
      + '<label class="td-field__label" id="pw-host-label" for="pw">Mật khẩu</label><div class="td-field__box">'
      + '<input type="password" class="td-field__control" id="pw" name="password" autocomplete="current-password" value="">'
      + `${btn('pw')}</div><div class="td-field__footer" hidden><div class="td-field__note" id="pw-host-note" hidden></div></div></div></td-input-field>`);
    assert.match(basic, /<span class="td-field__reveal-icon" data-td-icon="eye" data-td-icon-class="td-field__reveal-svg"><svg class="td-icon td-icon--m td-field__reveal-svg" data-icon="eye"/);
    assert.ok(noSvg(affix).includes(`<span class="td-field__affix td-field__affix--suffix" aria-hidden="true">số</span>${btn('p')}<span id="p-host-unit" hidden>số</span></div>`));
  });

  test('disabled → the button prints `disabled` (state the component re-applies)', () => {
    const [h] = field(['old', 'x', { element: true, id: 'd', type: 'password', disabled: true, revealable: true }]);
    assert.match(h, /<button type="button" class="td-field__reveal" aria-controls="d" aria-pressed="false" aria-label="Hiện mật khẩu" disabled>/);
  });

  test('the button name = TdInputField.messages.reveal / conceal exist', () => {
    const src = readFileSync(join(ROOT, 'src/form/td-input-field.js'), 'utf8');
    assert.match(src, /\breveal: 'Hiện mật khẩu'/);
    assert.match(src, /\bconceal: 'Ẩn mật khẩu'/);
  });

  test('native mode / other types / falsy: byte-identical to the call without the option', () => {
    const calls = [
      ['password', '', { type: 'password', label: 'Mật khẩu', id: 'n' }],
      ['password', '', { type: 'password', label: 'Mật khẩu', id: 'n', suffix: 'x' }],
      ['user', '', { element: true, id: 'u', label: 'Tên' }],
      ['bio', '', { element: true, id: 'b', type: 'textarea', label: 'Giới thiệu' }],
      ['password', '', { element: true, id: 'e', type: 'password', label: 'Mật khẩu' }],
    ];
    const without = field(...calls);
    // case 4: `revealable => false` on a password field
    const withOpt = field(...calls.map(([n, v, o], i) => [n, v, { ...o, revealable: i !== 4 }]));
    without.forEach((h, i) => {
      if (i === 2 || i === 3) {
        // element mode, another type: only the bare host attribute is added — no box, no button
        assert.match(withOpt[i], /^<td-input-field [^>]* revealable[ >]/, `case ${i}: host attribute`);
        assert.equal(withOpt[i].replace(' revealable', ''), h, `case ${i}`);
      } else {
        assert.equal(withOpt[i], h, `case ${i}: byte-identical`);
      }
      assert.ok(!withOpt[i].includes('td-field__reveal'), `case ${i}: no button`);
    });
  });

  test('test/ssr/fixtures/reveal.html is fresh (node test/ssr/build-reveal-fixture.mjs)', () => {
    assert.equal(readFileSync(REVEAL_FIXTURE_FILE, 'utf8'), renderRevealFixture());
  });
});
