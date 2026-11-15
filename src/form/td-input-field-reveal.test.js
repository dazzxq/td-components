// v0.115.0 (plan docs/internal/plans/v0.115.0-password-reveal.md QĐ 2, Tests "Node") — render() of <td-input-field>
// with / without `revealable`, on a stub host (no DOM: render() only reads attributes + state). Behaviour in real
// engines: src/form/td-v115-password-reveal.engines.browser-test.js.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { get: () => undefined, define: () => {} };
const { TdInputField } = await import('./td-input-field.js');

/** A stub host: attributes + state, no rendered control yet (render() reads the `value` attribute). */
function host(attrs, state = {}) {
  const h = Object.create(TdInputField.prototype);
  const a = new Map(Object.entries(attrs));
  Object.assign(h, {
    id: 'h', _revealed: false, _effectiveDisabled: false, _affixSlots: { prefix: [], suffix: [] },
    getAttribute: (n) => a.get(n) ?? null, hasAttribute: (n) => a.has(n), querySelector: () => null,
  }, state);
  return h;
}

// render() of v0.114.1 (before revealable) for the same attributes — must stay byte-identical without the attribute
const BEFORE = {
  password: '<div class="td-field td-field--md"><input type="password" class="td-field__control" id="h-control" value=""><div class="td-field__footer"><div class="td-field__note" id="h-note" hidden></div></div></div>',
  text: '<div class="td-field td-field--md"><input type="text" class="td-field__control" id="h-control" value=""><div class="td-field__footer"><div class="td-field__note" id="h-note" hidden></div></div></div>',
  labelled: '<div class="td-field td-field--md"><label class="td-field__label" id="h-label" for="h-control">Mật khẩu</label><input type="password" class="td-field__control" id="h-control" value=""><div class="td-field__footer"><div class="td-field__note" id="h-note" hidden></div></div></div>',
  floatingAffix: '<div class="td-field td-field--md td-field--affix td-field--floating td-field--always-float td-field--ph-label"><div class="td-field__box"><input type="password" class="td-field__control" id="h-control" value=""><span class="td-field__affix td-field__affix--suffix" aria-hidden="true">x</span><span id="h-unit" hidden>x</span></div><label class="td-field__label" id="h-label" for="h-control">L</label><div class="td-field__footer"><div class="td-field__note" id="h-note" hidden></div></div></div>',
};

const button = (pressed) => `<button type="button" class="td-field__reveal" aria-controls="h-control" aria-pressed="${pressed}"`
  + ` aria-label="${pressed ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}"><span class="td-field__reveal-icon" data-td-icon="${pressed ? 'eye-off' : 'eye'}"`
  + ' data-td-icon-class="td-field__reveal-svg"></span></button>';

describe('td-input-field render() — v0.115.0 revealable', () => {
  it('without `revealable`: byte-identical to v0.114.1 (password, text, label, floating + affix)', () => {
    assert.equal(host({ type: 'password' }).render(), BEFORE.password);
    assert.equal(host({ type: 'text' }).render(), BEFORE.text);
    assert.equal(host({ type: 'password', label: 'Mật khẩu', autocomplete: 'current-password' }).render(), BEFORE.labelled);
    assert.equal(host({ type: 'password', suffix: 'x', label: 'L', 'label-mode': 'floating' }).render(), BEFORE.floatingAffix);
    // a stale `_revealed` without the attribute never changes the markup
    assert.equal(host({ type: 'password' }, { _revealed: true }).render(), BEFORE.password);
  });

  it('revealable + password: the box with the eye button (hidden state), type="password"', () => {
    assert.equal(host({ type: 'password', revealable: '' }).render(),
      '<div class="td-field td-field--md td-field--affix"><div class="td-field__box"><input type="password" class="td-field__control" id="h-control" value="">'
      + `${button(false)}</div><div class="td-field__footer"><div class="td-field__note" id="h-note" hidden></div></div></div>`);
  });

  it('revealable + affix: the button after the suffix, before the hidden unit', () => {
    const html = host({ type: 'password', revealable: '', suffix: 'số' }).render();
    assert.ok(html.includes(`<span class="td-field__affix td-field__affix--suffix" aria-hidden="true">số</span>${button(false)}<span id="h-unit" hidden>số</span></div>`));
  });

  it('revealable on another type renders nothing extra', () => {
    assert.equal(host({ type: 'text', revealable: '' }).render(), BEFORE.text);
    assert.ok(!host({ type: 'textarea', revealable: '' }).render().includes('td-field__reveal'));
    assert.ok(!host({ type: 'contenteditable', revealable: '' }).render().includes('td-field__reveal'));
  });

  it('a structural re-render keeps the shown state (type="text", pressed, eye-off, conceal name)', () => {
    const html = host({ type: 'password', revealable: '', label: 'Mật khẩu' }, { _revealed: true }).render();
    assert.ok(html.includes(`<input type="text" class="td-field__control" id="h-control" value="">${button(true)}`), html);
  });

  it('disabled: hidden state + `disabled` on the button', () => {
    const html = host({ type: 'password', revealable: '', disabled: '' }, { _revealed: true, _effectiveDisabled: true }).render();
    assert.ok(html.includes('<input type="password"'));
    assert.ok(html.includes('aria-pressed="false" aria-label="Hiện mật khẩu" disabled>'));
  });

  it('messages override the button name; the names are escaped', () => {
    const saved = { ...TdInputField.messages };
    try {
      Object.assign(TdInputField.messages, { reveal: 'Show "it" <now>' });
      assert.ok(host({ type: 'password', revealable: '' }).render().includes('aria-label="Show &quot;it&quot; &lt;now&gt;"'));
    } finally {
      Object.assign(TdInputField.messages, saved);
    }
  });

  it('`revealable` is observed, boolean and structural', () => {
    assert.ok(TdInputField.observedAttributes.includes('revealable'));
    assert.ok(TdInputField.booleanAttributes.includes('revealable'));
    assert.ok(TdInputField._structural.has('revealable'));
    assert.equal(TdInputField.messages.reveal, 'Hiện mật khẩu');
    assert.equal(TdInputField.messages.conceal, 'Ẩn mật khẩu');
  });
});
