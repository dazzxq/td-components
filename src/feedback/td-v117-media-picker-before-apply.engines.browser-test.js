import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';

// v0.117.0 (plan docs/internal/plans/v0.117.0-dcms2-create-row-minsize.md QĐ4) — `beforeApply(selection, { signal })`
// of <td-media-picker> in Chromium, Firefox AND WebKit: called once with the exact final selection (after the crop
// step); false / a throw keeps the picker (or the crop step) open with a message; while it runs "Chèn" is busy and the
// picker is locked; × / Back / close() abort it and a late result is dropped; `confirm` only after success.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { TdMediaPicker } = await import('./td-media-picker.js');
const { TdModal } = await import('./td-modal.js');
const { _resetCoreWarnings } = await import('../utils/media-picker-core.js');
const { createMockAdapter } = await import('../../test/fixtures/media-adapter.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tickTask = () => new Promise((r) => setTimeout(r, 0));
async function until(fn, ms = 4000, what = 'condition') {
  const t0 = performance.now();
  for (;;) {
    let v;
    try { v = fn(); } catch { v = false; }
    if (v) return v;
    if (performance.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await wait(10);
  }
}
const PENDING = Symbol('pending');
const peek = async (p) => Promise.race([p, tickTask().then(() => PENDING)]);
const live = (sel) => [...document.body.querySelectorAll(`:scope > ${sel}`)].find((r) => r.getAttribute('data-state') !== 'closing') || null;
const pickerRoot = () => live('.td-media-picker');
const cropRoot = () => live('.td-crop-dialog');
const anyCropRoot = () => document.body.querySelector(':scope > .td-crop-dialog');
const q = (sel, root = pickerRoot()) => root?.querySelector(sel) || null;
const items = () => [...(pickerRoot()?.querySelectorAll('[data-td-media-item]') || [])];
const item = (id) => items().find((i) => i.getAttribute('data-id') === id) || null;
const opener = (id) => item(id)?.querySelector('[data-td-media-open]') || null;
const confirmBtn = () => q('.td-media-picker__confirm');
const cropper = () => q('td-cropper', cropRoot());
const cropConfirm = () => q('.td-crop-dialog__confirm', cropRoot());
const cropCancel = () => q('.td-crop-dialog__cancel', cropRoot());
const cropMessage = () => q('.td-crop-dialog__message', cropRoot());
const pickerLive = () => q('.td-media-picker__live')?.textContent || '';
const host = () => document.querySelector('td-media-picker');
const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, ...init }));
const L = TdMediaPicker.labels;

/** A hook the test settles: `calls[i] = { selection, signal, resolve, reject }`. */
function manualHook() {
  const calls = [];
  const hook = (selection, ctx) => new Promise((resolve, reject) => { calls.push({ selection, signal: ctx.signal, resolve, reject }); });
  return { hook, calls };
}

async function openReady(opts = {}) {
  const ad = createMockAdapter();
  const promise = TdMediaPicker.open({ autoSelectFirst: false, ...opts, adapter: ad });
  await until(() => items().length > 0, 4000, 'first page');
  const events = [];
  host().addEventListener('confirm', (e) => events.push(e.detail));
  return { ad, promise, events };
}
async function select(id) {
  click(opener(id));
  await until(() => !confirmBtn().hasAttribute('disabled'), 4000, `${id} selected`);
}
const locked = () => ['.td-media-picker__toolbar', '.td-media-picker__results', '.td-media-picker__detail', '.td-media-picker__selbar']
  .every((sel) => q(sel).hasAttribute('inert'));
const unlocked = () => ['.td-media-picker__toolbar', '.td-media-picker__results', '.td-media-picker__detail', '.td-media-picker__selbar']
  .every((sel) => !q(sel).hasAttribute('inert'));
const busy = () => confirmBtn().hasAttribute('loading') && q('.td-media-picker__dialog').getAttribute('aria-busy') === 'true';
const toastText = () => [...document.querySelectorAll('.td-toast')].map((t) => t.textContent).join(' | ');

async function closeAll() {
  for (const h of document.querySelectorAll('td-media-picker')) if (h.isOpen) h.close('programmatic');
  TdModal.closeAll();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-crop-dialog, :scope > .td-modal'), 4000, 'all closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
}
const restore = [];
afterEach(async () => {
  await closeAll();
  restore.splice(0).forEach((f) => f());
  TdMediaPicker.configureDefaults({});
  _resetCoreWarnings();
});

describe('td-media-picker — beforeApply (v0.117.0 QĐ4)', () => {
  it('absent: "Chèn" finishes at once (the old path)', async () => {
    const { promise } = await openReady();
    await select('m60');
    confirmBtn().click();
    const out = await promise;
    expect(out.status).to.equal('selected');
  });

  it('true / undefined → proceed; called once with the exact selection and a signal', async () => {
    for (const v of [true, undefined]) {
      const calls = [];
      const { promise, events } = await openReady({ beforeApply: (sel, ctx) => { calls.push([sel, ctx]); return v; } });
      await select('m60');
      confirmBtn().click();
      const out = await promise;
      expect(out.status).to.equal('selected');
      expect(calls.length).to.equal(1);
      expect(calls[0][0]).to.deep.equal(out.selection);
      expect(calls[0][0][0].assetId).to.equal('m60');
      expect(calls[0][1].signal).to.be.instanceOf(AbortSignal);
      expect(calls[0][1].signal.aborted).to.equal(false);
      expect(events.length, 'confirm after success').to.equal(1);
      await closeAll();
    }
  });

  it('configureDefaults({ beforeApply }) is used too', async () => {
    let n = 0;
    TdMediaPicker.configureDefaults({ beforeApply: () => { n += 1; return false; } });
    const { promise } = await openReady();
    await select('m60');
    confirmBtn().click();
    await until(() => pickerLive().includes(L.applyRejected), 4000, 'rejected');
    expect(n).to.equal(1);
    expect(await peek(promise)).to.equal(PENDING);
  });

  it('false → stays open, unlocked, applyRejected shown; a retry calls it again and can succeed', async () => {
    const { hook, calls } = manualHook();
    const { promise, events } = await openReady({ beforeApply: hook });
    await select('m60');
    confirmBtn().click();
    await until(() => calls.length === 1, 4000, 'called');
    calls[0].resolve(false);
    await until(() => pickerLive().includes('Không thể chèn mục đã chọn'), 4000, 'applyRejected');
    await until(() => toastText().includes(L.applyRejected), 4000, 'toast');
    expect(await peek(promise)).to.equal(PENDING);
    expect(unlocked()).to.equal(true);
    expect(confirmBtn().hasAttribute('loading')).to.equal(false);
    expect(q('.td-media-picker__dialog').hasAttribute('aria-busy')).to.equal(false);
    expect(events.length).to.equal(0);
    confirmBtn().click();
    await until(() => calls.length === 2, 4000, 'called again');
    calls[1].resolve(true);
    const out = await promise;
    expect(out.status).to.equal('selected');
    expect(events.length).to.equal(1);
  });

  it('a throw with userMessage → that text; any other error → console.error + applyFailed (raw text never shown)', async () => {
    const errors = [];
    const orig = console.error;
    console.error = (...a) => errors.push(a);
    restore.push(() => { console.error = orig; });
    let mode = 'user';
    const { promise } = await openReady({
      beforeApply: async () => {
        if (mode === 'user') throw Object.assign(new Error('raw 409'), { userMessage: 'Tên này đã có' });
        throw new Error('SQLSTATE secret');
      },
    });
    await select('m60');
    confirmBtn().click();
    await until(() => pickerLive().includes('Tên này đã có'), 4000, 'userMessage');
    expect(errors.length).to.equal(0);
    mode = 'other';
    confirmBtn().click();
    await until(() => pickerLive().includes('Không kiểm tra được, thử lại sau'), 4000, 'applyFailed');
    expect(errors.length).to.equal(1);
    expect(document.body.textContent.includes('SQLSTATE')).to.equal(false);
    expect(await peek(promise)).to.equal(PENDING);
  });

  it('AbortError → silent (no message), unlocked', async () => {
    const { promise } = await openReady({
      beforeApply: () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })),
    });
    await select('m60');
    const before = pickerLive();
    const toasts0 = document.querySelectorAll('.td-toast').length;
    confirmBtn().click();
    await until(unlocked, 4000, 'unlocked');
    await tickTask();
    await tickTask();
    expect(pickerLive()).to.equal(before);
    expect(document.querySelectorAll('.td-toast').length, 'no new toast').to.be.at.most(toasts0);
    expect(await peek(promise)).to.equal(PENDING);
  });

  it('while it runs: "Chèn" busy, the picker aria-busy + locked; a double click calls it once', async () => {
    const { hook, calls } = manualHook();
    const { promise } = await openReady({ beforeApply: hook });
    await select('m60');
    confirmBtn().click();
    await until(() => calls.length === 1, 4000, 'called');
    expect(busy()).to.equal(true);
    expect(locked()).to.equal(true);
    confirmBtn().click();
    confirmBtn().querySelector('button')?.click();
    await tickTask();
    expect(calls.length, 'single-flight').to.equal(1);
    // the selection is what it was when "Chèn" was pressed
    calls[0].resolve(true);
    const out = await promise;
    expect(out.selection.map((x) => x.assetId)).to.deep.equal(['m60']);
  });

  it('× during the call aborts the signal, resolves cancelled, fires no confirm; a late true is ignored', async () => {
    const { hook, calls } = manualHook();
    const { promise, events } = await openReady({ beforeApply: hook });
    await select('m60');
    confirmBtn().click();
    await until(() => calls.length === 1, 4000, 'called');
    q('.td-modal__close').click();
    const out = await promise;
    expect(out.status).to.equal('cancelled');
    expect(calls[0].signal.aborted).to.equal(true);
    calls[0].resolve(true); // the hook ignored the signal
    await tickTask();
    await tickTask();
    expect(events.length).to.equal(0);
  });

  it('close() during the call aborts it; Back (header) aborts it and unlocks the picker', async () => {
    const { hook, calls } = manualHook();
    let r = await openReady({ beforeApply: hook });
    await select('m60');
    confirmBtn().click();
    await until(() => calls.length === 1, 4000, 'called');
    host().close();
    expect((await r.promise).status).to.equal('cancelled');
    expect(calls[0].signal.aborted).to.equal(true);
    await closeAll();
    r = await openReady({ beforeApply: hook });
    await select('m60');
    confirmBtn().click();
    await until(() => calls.length === 2, 4000, 'called');
    q('.td-media-picker__back').click();
    expect(calls[1].signal.aborted).to.equal(true);
    await until(unlocked, 4000, 'unlocked');
    expect(confirmBtn().hasAttribute('loading')).to.equal(false);
    calls[1].resolve(true); // late
    await tickTask();
    await tickTask();
    expect(await peek(r.promise)).to.equal(PENDING);
    expect(r.events.length).to.equal(0);
  });
});

describe('td-media-picker — beforeApply in the crop step (v0.117.0 QĐ4)', () => {
  async function cropStep(opts) {
    const r = await openReady({ crop: { enabled: true }, ...opts });
    await select('m60');
    confirmBtn().click();
    await until(() => cropRoot()?.getAttribute('data-state') === 'open', 4000, 'crop dialog open');
    await until(() => cropper()?.getAttribute('data-state') === 'ready', 4000, 'cropper ready');
    const box = q('.td-cropper__box', cropper());
    box.focus();
    await sendKeys({ press: '+' });
    await until(() => cropper().crop && cropper().crop.normalized.width < 1, 4000, 'zoomed');
    return r;
  }

  it('runs after the crop with the final selection; Apply busy + cropper locked; false keeps the dialog + the crop; a retry succeeds', async () => {
    const { hook, calls } = manualHook();
    const { promise, events } = await cropStep({ beforeApply: hook });
    const crop0 = JSON.stringify(cropper().crop);
    cropConfirm().click();
    await until(() => calls.length === 1, 4000, 'called');
    expect(calls[0].selection[0].usage.crop).to.not.equal(null);
    expect(calls[0].selection[0].usage.crop.normalized).to.deep.equal(cropper().crop.normalized);
    expect(cropConfirm().getAttribute('aria-busy')).to.equal('true');
    expect(cropper().hasAttribute('disabled')).to.equal(true);
    expect(q('.td-crop-dialog__dialog', cropRoot()).getAttribute('aria-busy')).to.equal('true');
    cropConfirm().click(); // busy: swallowed
    await tickTask();
    expect(calls.length).to.equal(1);
    calls[0].resolve(false);
    await until(() => cropMessage()?.textContent === L.applyRejected, 4000, 'inline applyRejected');
    expect(cropRoot()).to.not.equal(null);
    expect(cropConfirm().hasAttribute('aria-busy')).to.equal(false);
    expect(cropper().hasAttribute('disabled')).to.equal(false);
    expect(JSON.stringify(cropper().crop), 'the crop is kept').to.equal(crop0);
    expect(await peek(promise)).to.equal(PENDING);
    expect(events.length).to.equal(0);
    cropConfirm().click();
    await until(() => calls.length === 2, 4000, 'retry');
    calls[1].resolve(true);
    const out = await promise;
    expect(out.status).to.equal('selected');
    expect(out.selection).to.deep.equal(calls[1].selection);
    expect(events.length).to.equal(1);
  });

  it('a userMessage shows inline in the crop step', async () => {
    const { promise } = await cropStep({ beforeApply: () => Promise.reject({ userMessage: 'Ảnh đã bị khoá' }) });
    cropConfirm().click();
    await until(() => cropMessage()?.textContent === 'Ảnh đã bị khoá', 4000, 'inline userMessage');
    expect(await peek(promise)).to.equal(PENDING);
  });

  it('closing the crop dialog during the call aborts it; back to the picker, no confirm; a late true is ignored', async () => {
    const { hook, calls } = manualHook();
    const { promise, events } = await cropStep({ beforeApply: hook });
    cropConfirm().click();
    await until(() => calls.length === 1, 4000, 'called');
    cropCancel().click();
    await until(() => anyCropRoot() === null, 4000, 'crop dialog removed');
    expect(calls[0].signal.aborted).to.equal(true);
    calls[0].resolve(true);
    await tickTask();
    await tickTask();
    expect(await peek(promise)).to.equal(PENDING);
    expect(events.length).to.equal(0);
    expect(confirmBtn().hasAttribute('disabled'), 'selection kept').to.equal(false);
  });

  it('close() of the picker during the crop gate aborts it', async () => {
    const { hook, calls } = manualHook();
    const { promise, events } = await cropStep({ beforeApply: hook });
    cropConfirm().click();
    await until(() => calls.length === 1, 4000, 'called');
    host().close();
    expect((await promise).status).to.equal('cancelled');
    expect(calls[0].signal.aborted).to.equal(true);
    calls[0].resolve(true);
    await tickTask();
    expect(events.length).to.equal(0);
  });
});
