// v0.44.0 (plan v0.44.0-confirm-dirty §A, QĐ 1-11) — TdModal.confirm({ typeToConfirm }) in Chromium, Firefox AND WebKit
// with real keys (sendKeys). DOM nodes are compared as booleans (a failing chai assertion carrying DOM nodes hangs the
// runner). Waits are signals (state / focus / promise), never fixed sleeps.
import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdModal } from './td-modal.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const frames = (n = 2) => new Promise((r) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); });
const until = async (fn, ms = 5000) => {
  const t0 = performance.now();
  while (!fn()) { if (performance.now() - t0 > ms) throw new Error('timeout'); await frames(1); }
};
const top = () => [...document.querySelectorAll('body > .td-modal:not([data-state="closing"])')].pop() || null;
const settledState = (p) => {
  const s = { done: false, value: undefined };
  p.then((v) => { s.done = true; s.value = v; });
  return s;
};

async function open(opts = {}) {
  const p = TdModal.confirm({ title: 'Xoá vĩnh viễn?', message: 'Không thể hoàn tác.', confirmText: 'Xoá', confirmVariant: 'danger', typeToConfirm: 'XOA', ...opts });
  const root = top();
  await until(() => root.getAttribute('data-state') === 'open');
  const input = /** @type {HTMLInputElement} */ (root.querySelector('.td-modal__confirm-field input'));
  if (input) await until(() => document.activeElement === input);
  const buttons = root.querySelectorAll('.td-modal__footer button');
  return { p, root, input, cancel: buttons[0], confirm: /** @type {HTMLButtonElement} */ (buttons[1]), state: settledState(p) };
}

afterEach(async () => {
  TdModal.closeAll();
  await frames(2);
});

describe('TdModal.confirm typeToConfirm (v0.44.0)', () => {
  it('field + label[for] + attributes; button aria-disabled; focus on the field', async () => {
    const { root, input, confirm } = await open();
    expect(!!input).to.equal(true);
    const label = root.querySelector('.td-modal__confirm-field label');
    expect(label.htmlFor).to.equal(input.id);
    expect(label.querySelector('strong.td-modal__phrase').textContent).to.equal('XOA');
    expect(label.textContent).to.equal('Gõ XOA để xác nhận');
    expect(input.labels.length).to.equal(1);
    expect(input.getAttribute('autocomplete')).to.equal('off');
    expect(input.getAttribute('autocapitalize')).to.equal('none');
    expect(input.getAttribute('autocorrect')).to.equal('off');
    expect(input.getAttribute('spellcheck')).to.equal('false');
    expect(input.getAttribute('enterkeyhint')).to.equal('done');
    expect(input.hasAttribute('maxlength')).to.equal(false);
    const msg = root.querySelector('.td-modal__text');
    expect(input.getAttribute('aria-describedby')).to.equal(msg.id);
    expect(confirm.getAttribute('aria-disabled')).to.equal('true');
    expect(confirm.disabled).to.equal(false);
    expect(root.querySelector('[role="alertdialog"]') !== null).to.equal(true);
    expect(root.querySelector('.td-modal__confirm-status').getAttribute('role')).to.equal('status');
  });

  it('typing unlocks only on the full phrase; status announced once; Backspace locks again', async () => {
    const { root, input, confirm } = await open();
    const status = root.querySelector('.td-modal__confirm-status');
    const announced = [];
    const mo = new MutationObserver(() => { if (status.textContent) announced.push(status.textContent); });
    mo.observe(status, { childList: true, characterData: true, subtree: true });
    await sendKeys({ type: 'XO' });
    await until(() => input.value === 'XO');
    expect(confirm.getAttribute('aria-disabled')).to.equal('true');
    await sendKeys({ type: 'A' });
    await until(() => !confirm.hasAttribute('aria-disabled'));
    await frames(1);
    expect(announced).to.deep.equal(['Đã khớp, có thể xác nhận']);
    await sendKeys({ press: 'Backspace' });
    await until(() => confirm.getAttribute('aria-disabled') === 'true');
    expect(status.textContent).to.equal('');
    mo.disconnect();
  });

  it('click / Enter before a match: no resolve, aria-invalid + text error; typing hides it', async () => {
    const { root, input, confirm, state } = await open();
    await sendKeys({ type: 'xo' });
    await until(() => input.value === 'xo');
    confirm.click();
    const error = root.querySelector('.td-modal__confirm-field .td-field-error');
    expect(error.hidden).to.equal(false);
    expect(error.textContent).to.equal('Chưa khớp — hãy gõ đúng XOA');
    expect(input.getAttribute('aria-invalid')).to.equal('true');
    expect(input.getAttribute('aria-errormessage')).to.equal(error.id);
    expect(input.getAttribute('aria-describedby').split(' ')).to.include(error.id);
    expect(document.activeElement === input).to.equal(true);
    await sendKeys({ press: 'Enter' });
    await frames(2);
    expect(state.done).to.equal(false);
    await sendKeys({ type: 'a' });
    await until(() => error.hidden);
    expect(input.hasAttribute('aria-invalid')).to.equal(false);
    expect(input.getAttribute('aria-describedby').split(' ')).to.not.include(error.id);
    expect(top() === root).to.equal(true);
  });

  it('Enter on a match resolves true', async () => {
    const { p } = await open();
    await sendKeys({ type: 'XOA' });
    await sendKeys({ press: 'Enter' });
    expect(await p).to.equal(true);
  });

  it('Cancel and X still resolve false', async () => {
    let r = await open();
    r.cancel.click();
    expect(await r.p).to.equal(false);
    r = await open();
    r.root.querySelector('.td-modal__close').click();
    expect(await r.p).to.equal(false);
  });

  it('async onConfirm: field readOnly while busy; a rejection reopens it with the value kept', async () => {
    let reject;
    const { input, confirm, root, state } = await open({ onConfirm: () => new Promise((_, rj) => { reject = rj; }) });
    await sendKeys({ type: 'XOA' });
    await until(() => !confirm.hasAttribute('aria-disabled'));
    confirm.click();
    expect(confirm.getAttribute('aria-busy')).to.equal('true');
    expect(input.readOnly).to.equal(true);
    const warn = console.warn;
    console.warn = () => {};
    try {
      reject(new Error('server'));
      await until(() => !input.readOnly);
    } finally { console.warn = warn; }
    expect(input.value).to.equal('XOA');
    expect(confirm.hasAttribute('aria-disabled')).to.equal(false); // still matched → unlocked
    expect(state.done).to.equal(false);
    expect(top() === root).to.equal(true);
  });

  it('paste (insertText) unlocks; NBSP / outer spaces match; lowercase does not', async () => {
    let r = await open();
    r.input.focus();
    document.execCommand('insertText', false, '  XOA  ');
    await until(() => !r.confirm.hasAttribute('aria-disabled'));
    TdModal.closeAll();
    r = await open();
    document.execCommand('insertText', false, 'xoa');
    await frames(2);
    expect(r.confirm.getAttribute('aria-disabled')).to.equal('true');
  });

  it('NFD typed text matches an NFC phrase (Vietnamese accents)', async () => {
    const r = await open({ typeToConfirm: 'XÓA' });
    r.input.focus();
    document.execCommand('insertText', false, 'XÓA');
    await until(() => !r.confirm.hasAttribute('aria-disabled'));
  });

  it('composition: nothing evaluated while composing, Enter while composing confirms nothing, compositionend evaluates', async () => {
    const r = await open();
    const { input } = r;
    input.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
    input.value = 'XOA';
    input.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 'XOA', isComposing: true, bubbles: true }));
    expect(r.confirm.getAttribute('aria-disabled')).to.equal('true');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true }));
    await frames(2);
    expect(r.state.done).to.equal(false);
    expect(r.root.querySelector('.td-field-error').hidden).to.equal(true);
    input.dispatchEvent(new CompositionEvent('compositionend', { data: 'XOA' }));
    expect(r.confirm.hasAttribute('aria-disabled')).to.equal(false);
  });

  it('XSS: a phrase / label template with HTML stays text; no new element, no style attribute', async () => {
    const saved = { ...TdModal.labels };
    TdModal.labels.typeToConfirmLabel = '<b>Gõ</b> {phrase} <img src=x onerror="window.__pwn=1">';
    TdModal.labels.typeToConfirmMismatch = '<i>sai</i> {phrase}';
    try {
      const phrase = '<img src=x onerror="window.__pwn=1">';
      const r = await open({ typeToConfirm: phrase });
      const field = r.root.querySelector('.td-modal__confirm-field');
      expect(field.querySelectorAll('img, b, i').length).to.equal(0);
      expect(field.querySelector('.td-modal__phrase').textContent).to.equal(phrase);
      r.confirm.click();
      expect(field.querySelectorAll('img, b, i').length).to.equal(0);
      expect(field.querySelector('.td-field-error').textContent).to.equal(`<i>sai</i> ${phrase}`);
      expect(r.root.querySelectorAll('[style]:not(.td-modal__dialog)').length).to.equal(0);
      await frames(2);
      expect(window.__pwn).to.equal(undefined);
    } finally { Object.assign(TdModal.labels, saved); }
  });

  it('template without {phrase} appends the phrase; invalid typeToConfirm → plain confirm + one warn; long phrase cut + warn', async () => {
    const saved = TdModal.labels.typeToConfirmLabel;
    TdModal.labels.typeToConfirmLabel = 'Nhập chuỗi:';
    try {
      const r = await open();
      expect(r.root.querySelector('.td-modal__confirm-field label').textContent).to.equal('Nhập chuỗi: XOA');
    } finally { TdModal.labels.typeToConfirmLabel = saved; }
    TdModal.closeAll();
    const warns = [];
    const warn = console.warn;
    console.warn = (...a) => warns.push(a.join(' '));
    try {
      const p = TdModal.confirm({ typeToConfirm: '   ' });
      const root = top();
      expect(root.querySelector('.td-modal__confirm-field')).to.equal(null);
      expect(warns.length).to.equal(1);
      TdModal.closeAll();
      await p;
      TdModal.confirm({ typeToConfirm: 'A'.repeat(130) });
      expect([...top().querySelector('.td-modal__phrase').textContent].length).to.equal(100);
      expect(warns.length).to.equal(2);
    } finally { console.warn = warn; }
  });

  it('without typeToConfirm: DOM and focus as before (no field, Cancel focused, confirm unlocked)', async () => {
    const p = TdModal.confirm({ title: 'T', message: 'M' });
    const root = top();
    await until(() => root.getAttribute('data-state') === 'open');
    const [cancel, confirm] = root.querySelectorAll('.td-modal__footer button');
    await until(() => document.activeElement === cancel);
    expect(root.querySelector('.td-modal__confirm-field')).to.equal(null);
    expect(root.querySelector('.td-modal__body').children.length).to.equal(1);
    expect(confirm.hasAttribute('aria-disabled')).to.equal(false);
    confirm.click();
    expect(await p).to.equal(true);
  });
});
