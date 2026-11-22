import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';

// v0.120.0 (plan docs/internal/plans/v0.120.0-focal-mode-optional.md QĐ2 / QĐ3 / QĐ4 / QĐ5 / QĐ7) — `focal-optional` in focal
// mode: the crop dialog applies a null point, the picker round-trips null (usage.crop and usage.focalPoint null), a seeded
// focalPoint is still pre-placed, and every boundary (core, picker, field picker path, field direct path) forwards the flag.
// DOM nodes are compared as booleans (chai serialising DOM nodes hangs the runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { TdMediaPicker } = await import('./td-media-picker.js');
const { TdModal } = await import('./td-modal.js');
const { openCropDialog } = await import('./crop-dialog.js');
const { TdCropper } = await import('../form/td-cropper.js');
await import('../form/td-media-field.js');
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
const ticked = (id) => item(id)?.querySelector('.td-media-grid__tick')?.getAttribute('aria-pressed') === 'true';
const confirmBtn = () => q('.td-media-picker__confirm');
const cropper = () => q('td-cropper', cropRoot());
const cropConfirm = () => q('.td-crop-dialog__confirm', cropRoot());
const cropMessage = () => q('.td-crop-dialog__message', cropRoot());
const cropTitle = () => q('.td-modal__title', cropRoot())?.textContent || '';
const ratioLabels = () => [...(cropper()?.querySelectorAll('.td-cropper__ratio') || [])].map((b) => b.textContent);
const host = () => document.querySelector('td-media-picker');
const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, ...init }));
const L = TdMediaPicker.labels;
const near = (a, b, eps = 1e-3) => ['x', 'y', 'width', 'height'].every((k) => Math.abs(a[k] - b[k]) <= eps);
/** the crop's natural-pixel ratio (1200 × 800 fixtures) */
const pxRatio = (n) => (n.width * 1200) / (n.height * 800);

const warns = [];
const realWarn = console.warn;
beforeEach(() => {
  warns.length = 0;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
});

/** A derivative adapter method the test settles: `calls[i] = { args, resolve, reject }`. */
function manualDerive() {
  const calls = [];
  const fn = (args) => new Promise((resolve, reject) => { calls.push({ args, resolve, reject }); });
  return { fn, calls };
}
function manualHook() {
  const calls = [];
  const hook = (selection, ctx) => new Promise((resolve, reject) => { calls.push({ selection, signal: ctx.signal, resolve, reject }); });
  return { hook, calls };
}
/** a server-made derivative of `ad`'s asset `src` with the id `id` */
const derivOf = (ad, src, id) => ({ ...JSON.parse(JSON.stringify(ad.db.get(src))), id, name: `${id}.jpg` });

async function openReady(opts = {}, { derive } = {}) {
  const ad = createMockAdapter();
  if (derive) ad.createCropDerivative = derive;
  const promise = TdMediaPicker.open({ autoSelectFirst: false, ...opts, adapter: ad });
  await until(() => items().length > 0, 4000, 'first page');
  const events = [];
  host().addEventListener('confirm', (e) => events.push(e.detail));
  return { ad, promise, events };
}
async function select(id) {
  click(opener(id));
  await until(() => !confirmBtn().hasAttribute('disabled') && ticked(id), 4000, `${id} selected`);
}
async function cropOpen() {
  confirmBtn().click();
  await until(() => cropRoot()?.getAttribute('data-state') === 'open', 4000, 'crop dialog open');
  await until(() => cropper()?.getAttribute('data-state') === 'ready', 4000, 'cropper ready');
}
async function closeAll() {
  for (const h of document.querySelectorAll('td-media-picker')) if (h.isOpen) h.close('programmatic');
  TdModal.closeAll();
  for (const b of document.body.querySelectorAll(':scope > .td-crop-dialog .td-crop-dialog__cancel')) b.click();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-crop-dialog, :scope > .td-modal'), 4000, 'all closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
}
const box = document.createElement('div');
box.style.width = '360px'; // test page only
document.body.appendChild(box);
afterEach(async () => {
  console.warn = realWarn;
  await closeAll();
  box.replaceChildren();
  TdMediaPicker.configureDefaults({});
  _resetCoreWarnings();
});

// --- media field helpers ---
const CROP_B = '{"v":1,"x":0.250,"y":0.25,"width":0.50,"height":0.5}';
const FOCAL_B = '{"v":1,"x":0.50,"y":0.5}';
function field(attrs, adapter) {
  const form = document.createElement('form');
  const el = document.createElement('td-media-field');
  for (const [k, v] of Object.entries({ name: 'og', usage: true, croppable: true, ...attrs })) {
    if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  el.adapter = adapter;
  form.appendChild(el);
  box.appendChild(form);
  const c = { input: 0, change: 0, details: [] };
  el.addEventListener('input', (e) => { c.input++; c.details.push(e.detail); });
  el.addEventListener('change', (e) => { c.change++; c.details.push(e.detail); });
  return { el, form, c };
}
const fd = (form, k) => [...new FormData(form)].filter(([n]) => n === k).map(([, v]) => String(v))[0];
/** the field's picker (real) → its preselected value selected */
async function fieldPicker(el) {
  el.querySelector('.td-media-field__open').click();
  await until(() => items().length > 0 && confirmBtn() && !confirmBtn().hasAttribute('disabled'), 4000, 'field picker ready');
}


const FOC = '.td-cropper__focal';
const unsetMark = () => cropper().querySelector(FOC).classList.contains('td-cropper__focal--unset');
const FOCAL_A = '{"v":1,"x":0.2,"y":0.7}';

describe('v0.120.0 — crop dialog, focal mode + focalPointOptional (QĐ2 / QĐ5)', () => {
  const dlg = (o) => openCropDialog({ src: '/test/fixtures/1.svg', naturalWidth: 1200, naturalHeight: 800, mode: 'focal', ...o });
  const dReady = async () => {
    await until(() => cropRoot()?.getAttribute('data-state') === 'open' && cropper()?.getAttribute('data-state') === 'ready', 4000, 'dialog ready');
  };

  it('with the flag: the attribute is set without allowFocalPoint, a null point applies as null, unchanged', async () => {
    const p = dlg({ focalPointOptional: true });
    await dReady();
    expect(cropper().hasAttribute('focal-optional')).to.equal(true);
    expect(cropper().focalPoint).to.equal(null);
    expect(unsetMark()).to.equal(true);
    expect(cropConfirm().disabled).to.equal(false);
    cropConfirm().click();
    expect(await p).to.deep.equal({ status: 'applied', crop: null, focalPoint: null, changed: false });
  });

  it('with the flag: a seeded point is pre-placed; clearing it applies null with changed true', async () => {
    const p = dlg({ focalPointOptional: true, focalPoint: { x: 0.2, y: 0.7 } });
    await dReady();
    expect(cropper().focalPoint).to.deep.equal({ x: 0.2, y: 0.7 });
    q('.td-cropper__focal-clear', cropRoot()).click();
    cropConfirm().click();
    expect(await p).to.deep.equal({ status: 'applied', crop: null, focalPoint: null, changed: true });
  });

  it('without the flag: unchanged — the centre is auto-placed, no attribute, applies the centre', async () => {
    const p = dlg({});
    await dReady();
    expect(cropper().hasAttribute('focal-optional')).to.equal(false);
    expect(cropper().focalPoint).to.deep.equal({ x: 0.5, y: 0.5 });
    cropConfirm().click();
    const r = await p;
    expect(r.focalPoint).to.deep.equal({ x: 0.5, y: 0.5 });
    expect(r.crop).to.equal(null);
  });
});

describe('v0.120.0 — picker focal mode + focalPointOptional (QĐ3 / QĐ7a / QĐ7b)', () => {
  it('null round-trip: the unset marker, usage.crop null and usage.focalPoint null', async () => {
    const r = await openReady({ crop: { mode: 'focal', focalPointOptional: true } });
    await select('m60');
    await cropOpen();
    expect(cropper().hasAttribute('focal-optional')).to.equal(true);
    expect(cropper().focalPoint).to.equal(null);
    expect(unsetMark()).to.equal(true);
    cropConfirm().click();
    const out = await r.promise;
    expect(out.status).to.equal('selected');
    expect(out.selection[0].usage.crop).to.equal(null);
    expect(out.selection[0].usage.focalPoint).to.equal(null);
  });

  it('a seeded crop.focalPoint is still pre-placed and returned', async () => {
    const r = await openReady({ crop: { mode: 'focal', focalPointOptional: true, focalPoint: { x: 0.2, y: 0.7 } } });
    await select('m60');
    await cropOpen();
    expect(cropper().focalPoint).to.deep.equal({ x: 0.2, y: 0.7 });
    expect(unsetMark()).to.equal(false);
    cropConfirm().click();
    const out = await r.promise;
    expect(out.selection[0].usage.crop).to.equal(null);
    expect(out.selection[0].usage.focalPoint).to.deep.equal({ x: 0.2, y: 0.7 });
  });

  it('without the flag: the centre is auto-placed (unchanged)', async () => {
    const r = await openReady({ crop: { mode: 'focal' } });
    await select('m60');
    await cropOpen();
    expect(cropper().hasAttribute('focal-optional')).to.equal(false);
    cropConfirm().click();
    const out = await r.promise;
    expect(out.selection[0].usage.focalPoint).to.deep.equal({ x: 0.5, y: 0.5 });
    expect(out.selection[0].usage.crop).to.equal(null);
  });
});

describe('v0.120.0 — media field crop-mode="focal" + focal-optional (QĐ4 / QĐ7c / QĐ7d)', () => {
  const standalone = async (el) => {
    const btn = () => el.querySelector('.td-media-field__crop-btn');
    await until(() => btn() && !btn().hidden, 4000, 'crop button');
    btn().click();
    await until(() => cropRoot()?.getAttribute('data-state') === 'open' && cropper()?.getAttribute('data-state') === 'ready', 4000, 'standalone open');
  };

  it('picker path: the flag reaches the cropper without focal-point; an unchanged apply emits nothing', async () => {
    const ad = createMockAdapter();
    const { el, form, c } = field({ value: 'm1', 'crop-mode': 'focal', 'focal-optional': true }, ad);
    await fieldPicker(el);
    await cropOpen();
    expect(cropper().getAttribute('mode')).to.equal('focal');
    expect(cropper().hasAttribute('focal-optional')).to.equal(true);
    expect(cropper().focalPoint).to.equal(null);
    cropConfirm().click();
    await until(() => !pickerRoot() && !cropRoot(), 4000, 'closed');
    await tickTask();
    expect([c.input, c.change]).to.deep.equal([0, 0]);
    expect(fd(form, 'og[crop]')).to.equal('null');
  });

  it('picker path: clearing a stored focal commits once with an empty focal; the crop is never set', async () => {
    const ad = createMockAdapter();
    const { el, form, c } = field({ value: 'm1', 'crop-mode': 'focal', 'focal-optional': true, focal: FOCAL_A }, ad);
    await fieldPicker(el);
    await cropOpen();
    expect(cropper().focalPoint).to.deep.equal({ x: 0.2, y: 0.7 });
    q('.td-cropper__focal-clear', cropRoot()).click();
    cropConfirm().click();
    await until(() => !pickerRoot() && !cropRoot(), 4000, 'closed');
    await tickTask();
    expect([c.input, c.change]).to.deep.equal([1, 1]);
    expect(fd(form, 'og[focal]')).to.equal('null');
    expect(fd(form, 'og[crop]')).to.equal('null');
  });

  it('direct path: the flag reaches the cropper; unchanged emits nothing; clear commits once; crop never set', async () => {
    const ad = createMockAdapter();
    const a = field({ value: 'm1', 'crop-mode': 'focal', 'focal-optional': true }, ad);
    await standalone(a.el);
    expect(cropper().hasAttribute('focal-optional')).to.equal(true);
    expect(cropper().focalPoint).to.equal(null);
    cropConfirm().click();
    await until(() => !anyCropRoot(), 4000, 'closed');
    await tickTask();
    expect([a.c.input, a.c.change]).to.deep.equal([0, 0]);
    box.replaceChildren();
    const b = field({ value: 'm1', 'crop-mode': 'focal', 'focal-optional': true, focal: FOCAL_A }, ad);
    await standalone(b.el);
    expect(cropper().focalPoint).to.deep.equal({ x: 0.2, y: 0.7 });
    q('.td-cropper__focal-clear', cropRoot()).click();
    cropConfirm().click();
    await until(() => !anyCropRoot(), 4000, 'closed');
    await tickTask();
    expect([b.c.input, b.c.change]).to.deep.equal([1, 1]);
    expect(fd(b.form, 'og[focal]')).to.equal('null');
    expect(fd(b.form, 'og[crop]')).to.equal('null');
  });

  it('without the flag: focal mode keeps the mandatory, auto-centred point', async () => {
    const ad = createMockAdapter();
    const { el } = field({ value: 'm1', 'crop-mode': 'focal' }, ad);
    await standalone(el);
    expect(cropper().hasAttribute('focal-optional')).to.equal(false);
    expect(cropper().focalPoint).to.deep.equal({ x: 0.5, y: 0.5 });
  });
});
