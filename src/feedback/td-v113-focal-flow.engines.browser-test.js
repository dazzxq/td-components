import { expect } from '@esm-bundle/chai';

// v0.113.0 (plan docs/internal/plans/v0.113.0-focal-only-mode.md QĐ2 / QĐ3 / QĐ3b / QĐ4a / QĐ4b) — the REAL focal-only
// chain in Chromium, Firefox AND WebKit: <td-media-picker crop: { mode: 'focal' }> → nested crop dialog (cropper
// mode="focal") → outcome usage { crop: null, focalPoint }; and <td-media-field crop-mode="focal"> → picker → dialog →
// FormData ([crop] null, [focal] JSON v1). No stub: the picker, the dialog and the cropper are the shipped ones.
// Every wait is on a real signal (dialog data-state, cropper data-state, the outcome promise, events).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { TdMediaPicker } = await import('./td-media-picker.js');
const { TdModal } = await import('./td-modal.js');
await import('../form/td-media-field.js');
const { createMockAdapter } = await import('../../test/fixtures/media-adapter.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
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
const live = (sel) => [...document.body.querySelectorAll(`:scope > ${sel}`)].find((r) => r.getAttribute('data-state') !== 'closing') || null;
const pickerRoot = () => live('.td-media-picker');
const cropRoot = () => live('.td-crop-dialog');
const q = (sel, root = pickerRoot()) => root?.querySelector(sel) || null;
const item = (id) => [...(pickerRoot()?.querySelectorAll('[data-td-media-item]') || [])].find((i) => i.getAttribute('data-id') === id) || null;
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0 }));
const confirmBtn = () => q('.td-media-picker__confirm');
const cropper = () => q('td-cropper', cropRoot());
const cropConfirm = () => q('.td-crop-dialog__confirm', cropRoot());

async function select(id) {
  await until(() => item(id), 4000, `${id} listed`);
  click(item(id).querySelector('[data-td-media-open]'));
  await until(() => !confirmBtn().hasAttribute('disabled'), 4000, `${id} selected`);
}
async function openFocalStep() {
  confirmBtn().click();
  await until(() => cropRoot()?.getAttribute('data-state') === 'open', 4000, 'crop dialog open');
  await until(() => cropper()?.getAttribute('data-state') === 'ready', 4000, 'cropper ready');
}

const extra = [];
afterEach(async () => {
  for (const h of document.querySelectorAll('td-media-picker')) if (h.isOpen) h.close('programmatic');
  TdModal.closeAll();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-crop-dialog, :scope > .td-modal'), 4000, 'all closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
  extra.splice(0).forEach((f) => f());
});

describe('td-media-picker crop.mode = focal → dialog → outcome (v0.113.0)', () => {
  it('starts from crop.focalPoint, titled focalTitle, cropper mode focal; a crop set on the cropper never reaches usage.crop', async () => {
    const ad = createMockAdapter();
    const promise = TdMediaPicker.open({ autoSelectFirst: false, adapter: ad, crop: { mode: 'focal', focalPoint: { x: 0.2, y: 0.3 } } });
    await select('m60');
    await openFocalStep();
    expect(q('.td-modal__title', cropRoot()).textContent).to.equal(TdMediaPicker.labels.focalTitle);
    const c = cropper();
    expect(c.getAttribute('data-mode')).to.equal('focal');
    expect(c.focalPoint).to.deep.equal({ x: 0.2, y: 0.3 });
    c.crop = { x: 0.1, y: 0.1, width: 0.4, height: 0.4 }; // ignored in focal mode
    c.focalPoint = { x: 0.7, y: 0.6 };
    await until(() => !cropConfirm().disabled, 4000, 'Chèn enabled');
    cropConfirm().click();
    const out = await promise;
    expect(out.status).to.equal('selected');
    expect(out.selection[0].usage.crop).to.equal(null);
    expect(out.selection[0].usage.focalPoint).to.deep.equal({ x: 0.7, y: 0.6 });
  });

  it('no focalPoint → the centre; Chèn untouched gives usage { crop: null, focalPoint: centre }', async () => {
    const promise = TdMediaPicker.open({ autoSelectFirst: false, adapter: createMockAdapter(), crop: { mode: 'focal' } });
    await select('m60');
    await openFocalStep();
    expect(cropper().focalPoint).to.deep.equal({ x: 0.5, y: 0.5 });
    cropConfirm().click();
    const out = await promise;
    expect(out.selection[0].usage.crop).to.equal(null);
    expect(out.selection[0].usage.focalPoint).to.deep.equal({ x: 0.5, y: 0.5 });
  });
});

describe('td-media-field crop-mode="focal" → picker → dialog → FormData (v0.113.0)', () => {
  it('first pick and reopen: [crop] null, [focal] JSON v1 from the dialog; the reopen starts from the current focal', async () => {
    const ad = createMockAdapter();
    const form = document.createElement('form');
    const el = document.createElement('td-media-field');
    for (const [k, v] of Object.entries({ name: 'og', usage: '', croppable: '', 'crop-mode': 'focal' })) el.setAttribute(k, v);
    el.adapter = ad;
    form.appendChild(el);
    document.body.appendChild(form);
    extra.push(() => form.remove());
    const changes = [];
    el.addEventListener('change', () => changes.push(1));
    const entry = (k) => [...new FormData(form)].find(([n]) => n === k)?.[1];

    el.querySelector('.td-media-field__open').click();
    await until(() => pickerRoot(), 4000, 'picker open');
    await select('m60');
    await openFocalStep();
    expect(cropper().getAttribute('data-mode')).to.equal('focal');
    cropper().focalPoint = { x: 0.25, y: 0.75 };
    cropConfirm().click();
    await until(() => changes.length === 1, 4000, 'change');
    await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-crop-dialog'), 4000, 'closed');
    expect(entry('og[id]')).to.equal('m60');
    expect(entry('og[crop]')).to.equal('null');
    expect(entry('og[focal]')).to.equal('{"v":1,"x":0.25,"y":0.75}');
    expect(el.selection[0].usage.crop).to.equal(null);

    // reopen through the picker: the focal step starts from the field's current focal
    el.querySelector('.td-media-field__open').click();
    await until(() => pickerRoot(), 4000, 'picker reopen');
    await select('m60');
    await openFocalStep();
    expect(cropper().focalPoint).to.deep.equal({ x: 0.25, y: 0.75 });
  });
});
