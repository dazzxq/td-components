import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';

// v0.119.0 (plan docs/internal/plans/v0.119.0-crop-output.md, dcms2 item 6) — the crop step's round-trip (`crop.initial`
// with the asset identity guard), the optional focal point pass-through, per-call presets / ratioLabel, and
// `crop.output: 'new-asset'` (adapter.createCropDerivative inside the apply gate: busy, reject + retry, abort, the
// transaction with beforeApply, the selection swap, `usage.derivedFromAssetId`) — picker, crop dialog and media field,
// in Chromium, Firefox AND WebKit. DOM nodes are compared as booleans (chai serialising DOM nodes hangs the runner).
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

describe('v0.119.0 QĐ1 — crop.initial round-trip', () => {
  it('(1) picker box and pan: the cropper starts at crop.initial of the preselected asset', async () => {
    const initial = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
    let r = await openReady({ selection: { mode: 'single', initialIds: ['m1'] }, crop: { enabled: true, initial: { normalized: initial } } });
    await until(() => !confirmBtn().hasAttribute('disabled'), 4000, 'preselected');
    await cropOpen();
    expect(near(cropper().crop.normalized, initial), JSON.stringify(cropper().crop.normalized)).to.equal(true);
    cropConfirm().click();
    const out = await r.promise;
    expect(near(out.selection[0].usage.crop.normalized, initial)).to.equal(true);
    await closeAll();
    const pan = { x: 0.2, y: 0.125, width: 0.5, height: 0.75 }; // 600 × 600 px
    r = await openReady({ selection: { mode: 'single', initialIds: ['m1'] }, crop: { enabled: true, mode: 'pan', aspectRatio: 1, initial: pan } });
    await until(() => !confirmBtn().hasAttribute('disabled'), 4000, 'preselected');
    await cropOpen();
    expect(cropper().getAttribute('mode')).to.equal('pan');
    expect(near(cropper().crop.normalized, pan), JSON.stringify(cropper().crop.normalized)).to.equal(true);
  });

  it('(1) field with a stored crop + focal: the picker reopens it; an unchanged apply emits nothing', async () => {
    const ad = createMockAdapter();
    const { el, form, c } = field({ value: 'm1', crop: CROP_B, 'focal-point': true, focal: FOCAL_B }, ad);
    await fieldPicker(el);
    await cropOpen();
    expect(near(cropper().crop.normalized, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 })).to.equal(true);
    expect(cropper().focalPoint).to.deep.equal({ x: 0.5, y: 0.5 });
    cropConfirm().click();
    await until(() => !pickerRoot() && !cropRoot(), 4000, 'closed');
    await tickTask();
    expect(c.input).to.equal(0);
    expect(c.change).to.equal(0);
    expect(fd(form, 'og[crop]')).to.equal(CROP_B, 'kept byte-identical');
  });

  it('(9) asset switch: a stored crop / focal never seeds another asset', async () => {
    const ad = createMockAdapter();
    const { el, c } = field({ value: 'm1', crop: CROP_B, 'focal-point': true, focal: FOCAL_B }, ad);
    await fieldPicker(el);
    await select('m59');
    await cropOpen();
    expect(near(cropper().crop.normalized, { x: 0, y: 0, width: 1, height: 1 }), 'the default (whole image)').to.equal(true);
    expect(cropper().focalPoint).to.equal(null);
    cropConfirm().click();
    await until(() => c.change === 1, 4000, 'committed');
    expect(el.value).to.equal('m59');
    // the picker alone: initial applies only to its single preselected asset
    await closeAll();
    await openReady({ selection: { mode: 'single', initialIds: ['m1'] },
      crop: { enabled: true, allowFocalPoint: true, initial: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, focalPoint: { x: 0.2, y: 0.2 } } });
    await until(() => !confirmBtn().hasAttribute('disabled'), 4000, 'preselected');
    await select('m58');
    await cropOpen();
    expect(near(cropper().crop.normalized, { x: 0, y: 0, width: 1, height: 1 })).to.equal(true);
    expect(cropper().focalPoint).to.equal(null);
  });

  it('invalid crop.initial → ignored + one warning', async () => {
    await openReady({ selection: { mode: 'single', initialIds: ['m1'] }, crop: { enabled: true, initial: { x: 2, y: 0, width: 1, height: 1 } } });
    await until(() => !confirmBtn().hasAttribute('disabled'), 4000, 'preselected');
    await cropOpen();
    expect(near(cropper().crop.normalized, { x: 0, y: 0, width: 1, height: 1 })).to.equal(true);
    expect(warns.filter((w) => w.includes('crop.initial')).length).to.equal(1);
  });
});

describe('v0.119.0 QĐ2 — focal-optional pass-through', () => {
  it('(2) picker / field set focal-optional on the cropper; a null focal round-trips as null; focal mode too since v0.120.0', async () => {
    let r = await openReady({ crop: { enabled: true, allowFocalPoint: true, focalPointOptional: true } });
    await select('m60');
    await cropOpen();
    expect(cropper().hasAttribute('focal-optional')).to.equal(true);
    expect(cropper().hasAttribute('focal-point')).to.equal(true);
    cropConfirm().click();
    const out = await r.promise;
    expect(out.selection[0].usage.focalPoint).to.equal(null);
    await closeAll();
    // without allowFocalPoint: no attribute
    r = await openReady({ crop: { enabled: true, focalPointOptional: true } });
    await select('m60');
    await cropOpen();
    expect(cropper().hasAttribute('focal-optional')).to.equal(false);
    await closeAll();
    r = await openReady({ crop: { mode: 'focal', focalPointOptional: true } });
    await select('m60');
    await cropOpen();
    expect(cropper().getAttribute('mode')).to.equal('focal');
    expect(cropper().hasAttribute('focal-optional')).to.equal(true); // v0.120.0 (QĐ2 / QĐ7)
    await closeAll();
    // the field: both paths
    const ad = createMockAdapter();
    const { el, c } = field({ value: 'm1', 'focal-point': true, 'focal-optional': true }, ad);
    await fieldPicker(el);
    await cropOpen();
    expect(cropper().hasAttribute('focal-optional')).to.equal(true);
    await closeAll();
    el.querySelector('.td-media-field__crop-btn').click();
    await until(() => cropRoot()?.getAttribute('data-state') === 'open' && cropper()?.getAttribute('data-state') === 'ready', 4000, 'standalone open');
    expect(cropper().hasAttribute('focal-optional')).to.equal(true);
    expect(c.change).to.equal(0);
  });
});

describe('v0.119.0 QĐ4 — crop.output: new-asset (picker)', () => {
  it('(3) success: busy, the payload, the selection swapped, usage.derivedFromAssetId', async () => {
    const d = manualDerive();
    const { ad, promise, events } = await openReady({ crop: { enabled: true, aspectRatio: 1, output: 'new-asset' } }, { derive: d.fn });
    await select('m60');
    await cropOpen();
    cropConfirm().click();
    await until(() => d.calls.length === 1, 4000, 'called');
    expect(cropConfirm().getAttribute('aria-busy')).to.equal('true');
    expect(cropper().hasAttribute('disabled')).to.equal(true);
    expect(q('.td-crop-dialog__dialog', cropRoot()).getAttribute('aria-busy')).to.equal('true');
    expect(cropMessage()?.textContent).to.equal(L.cropDerivativeBusy);
    const a = d.calls[0].args;
    expect(a.sourceAssetId).to.equal('m60');
    expect(Object.keys(a.crop)).to.deep.equal(['normalized']);
    expect(pxRatio(a.crop.normalized)).to.be.closeTo(1, 0.01);
    expect(a.focalPoint).to.equal(null);
    expect(a.signal).to.be.instanceOf(AbortSignal);
    d.calls[0].resolve(derivOf(ad, 'm60', 'd60'));
    const out = await promise;
    expect(out.status).to.equal('selected');
    expect(out.selection.length).to.equal(1);
    expect(out.selection[0].assetId).to.equal('d60');
    expect(out.selection[0].asset.id).to.equal('d60');
    expect(out.selection[0].usage).to.deep.equal({ altText: 'Ảnh mẫu 60', crop: null, focalPoint: null, derivedFromAssetId: 'm60' });
    expect(events.length).to.equal(1);
  });

  it('(4) reject → the dialog stays with the crop + footer message; the retry calls the adapter again', async () => {
    const d = manualDerive();
    const { ad, promise } = await openReady({ crop: { enabled: true, output: 'new-asset' } }, { derive: d.fn });
    await select('m60');
    await cropOpen();
    q('.td-cropper__box', cropper()).focus();
    await sendKeys({ press: '+' });
    await until(() => cropper().crop.normalized.width < 1, 4000, 'zoomed');
    const crop0 = JSON.stringify(cropper().crop);
    cropConfirm().click();
    await until(() => d.calls.length === 1, 4000, 'called');
    d.calls[0].reject(Object.assign(new Error('raw 503'), { userMessage: 'Máy chủ bận' }));
    await until(() => cropMessage()?.textContent === 'Máy chủ bận', 4000, 'err.userMessage');
    expect(cropConfirm().hasAttribute('aria-busy')).to.equal(false);
    expect(cropper().hasAttribute('disabled')).to.equal(false);
    expect(JSON.stringify(cropper().crop)).to.equal(crop0);
    expect(await peek(promise)).to.equal(PENDING);
    cropConfirm().click();
    await until(() => d.calls.length === 2, 4000, 'retry');
    d.calls[1].resolve({ id: 5 }); // not a valid asset → the label
    await until(() => cropMessage()?.textContent === L.cropDerivativeError, 4000, 'label');
    cropConfirm().click();
    await until(() => d.calls.length === 3, 4000, 'retry 2');
    d.calls[2].reject('nope'); // not an Error → the label
    await until(() => cropMessage()?.textContent === L.cropDerivativeError && !cropConfirm().hasAttribute('aria-busy'), 4000, 'label 2');
    cropConfirm().click();
    await until(() => d.calls.length === 4, 4000, 'retry 3');
    d.calls[3].resolve(derivOf(ad, 'm60', 'd60'));
    const out = await promise;
    expect(out.selection[0].assetId).to.equal('d60');
  });

  it('(5) Escape during a pending derivative: signal aborted, the late result ignored, a single finish', async () => {
    const d = manualDerive();
    const { ad, promise, events } = await openReady({ crop: { enabled: true, output: 'new-asset' } }, { derive: d.fn });
    await select('m60');
    await cropOpen();
    cropConfirm().click();
    await until(() => d.calls.length === 1, 4000, 'called');
    q('.td-crop-dialog__dialog', cropRoot()).focus();
    await sendKeys({ press: 'Escape' });
    await until(() => anyCropRoot() === null, 4000, 'crop dialog removed');
    expect(d.calls[0].args.signal.aborted).to.equal(true);
    d.calls[0].resolve(derivOf(ad, 'm60', 'd60'));
    await tickTask();
    await tickTask();
    expect(await peek(promise)).to.equal(PENDING);
    expect(events.length).to.equal(0);
    expect(ticked('m60'), 'the source still selected').to.equal(true);
    // the next "Chèn" runs a fresh gate
    await cropOpen();
    cropConfirm().click();
    await until(() => d.calls.length === 2, 4000, 'fresh call');
    d.calls[1].resolve(derivOf(ad, 'm60', 'd61'));
    const out = await promise;
    expect(out.selection[0].assetId).to.equal('d61');
    expect(events.length).to.equal(1);
  });

  it('(6) adapter without createCropDerivative: one warning, metadata outcome', async () => {
    const { promise } = await openReady({ crop: { enabled: true, aspectRatio: 1, output: 'new-asset' } });
    expect(warns.filter((w) => w.includes('createCropDerivative')).length).to.equal(1);
    await select('m60');
    await cropOpen();
    cropConfirm().click();
    const out = await promise;
    expect(out.selection[0].assetId).to.equal('m60');
    expect(out.selection[0].usage.crop).to.not.equal(null);
    expect('derivedFromAssetId' in out.selection[0].usage).to.equal(false);
  });

  it('(10) derivative ok + beforeApply rejects + retry: the selection stays the source until the approved retry', async () => {
    const d = manualDerive();
    const h = manualHook();
    const { ad, promise, events } = await openReady({ beforeApply: h.hook, crop: { enabled: true, output: 'new-asset' } }, { derive: d.fn });
    await select('m60');
    await cropOpen();
    cropConfirm().click();
    await until(() => d.calls.length === 1, 4000, 'derive 1');
    expect(h.calls.length, 'beforeApply waits for the derivative').to.equal(0);
    d.calls[0].resolve(derivOf(ad, 'm60', 'd60'));
    await until(() => h.calls.length === 1, 4000, 'hook 1');
    expect(h.calls[0].selection[0].assetId).to.equal('d60');
    expect(h.calls[0].selection[0].usage.derivedFromAssetId).to.equal('m60');
    expect(h.calls[0].signal === d.calls[0].args.signal, 'one shared signal').to.equal(true);
    h.calls[0].resolve(false);
    await until(() => cropMessage()?.textContent === L.applyRejected, 4000, 'rejected');
    expect(ticked('m60'), 'still the source').to.equal(true);
    expect(await peek(promise)).to.equal(PENDING);
    cropConfirm().click();
    await until(() => d.calls.length === 2, 4000, 'derive 2 (the adapter again)');
    d.calls[1].resolve(derivOf(ad, 'm60', 'd60'));
    await until(() => h.calls.length === 2, 4000, 'hook 2');
    expect(ticked('m60'), 'still the source while beforeApply runs').to.equal(true);
    h.calls[1].resolve(true);
    const out = await promise;
    expect(out.selection.map((s) => s.assetId)).to.deep.equal(['d60']);
    expect(out.selection).to.deep.equal(h.calls[1].selection);
    expect(events.length).to.equal(1);
  });

  it('(11) a whole-image box sends {0,0,1,1}; focal mode + new-asset → one warning, metadata', async () => {
    const d = manualDerive();
    let r = await openReady({ crop: { enabled: true, output: 'new-asset' } }, { derive: d.fn });
    await select('m60');
    await cropOpen();
    cropConfirm().click();
    await until(() => d.calls.length === 1, 4000, 'called');
    expect(d.calls[0].args.crop).to.deep.equal({ normalized: { x: 0, y: 0, width: 1, height: 1 } });
    d.calls[0].resolve(derivOf(r.ad, 'm60', 'd60'));
    await r.promise;
    await closeAll();
    _resetCoreWarnings();
    warns.length = 0;
    const d2 = manualDerive();
    r = await openReady({ crop: { mode: 'focal', output: 'new-asset' } }, { derive: d2.fn });
    expect(warns.filter((w) => w.includes("'new-asset'")).length).to.equal(1);
    await select('m60');
    await cropOpen();
    cropConfirm().click();
    const out = await r.promise;
    expect(d2.calls.length).to.equal(0);
    expect(out.selection[0]).to.include({ assetId: 'm60' });
    expect(out.selection[0].usage.crop).to.equal(null);
    expect(out.selection[0].usage.focalPoint).to.deep.equal({ x: 0.5, y: 0.5 });
    expect('derivedFromAssetId' in out.selection[0].usage).to.equal(false);
  });
});

describe('v0.119.0 QĐ3 — locked extreme ratios, presets / ratioLabel per call', () => {
  it('(8) 14:1, 28:2, 64:9, 9:16 open, keep the ratio on resize + keyboard zoom, and round-trip', async () => {
    for (const [r, want] of [[14, 14], [28 / 2, 14], [64 / 9, 64 / 9], [9 / 16, 9 / 16]]) {
      const p = openCropDialog({ src: '/test/fixtures/1.svg', naturalWidth: 1200, naturalHeight: 800, aspectRatio: r });
      await until(() => cropRoot()?.getAttribute('data-state') === 'open' && cropper()?.getAttribute('data-state') === 'ready', 4000, `open ${r}`);
      expect(cropper().getAttribute('aspect-ratio')).to.not.equal(null);
      expect(pxRatio(cropper().crop.normalized), `start ${r}`).to.be.closeTo(want, want * 0.01);
      q('.td-cropper__handle--corner[data-handle="se"]', cropper()).focus();
      await sendKeys({ press: 'ArrowLeft' });
      await sendKeys({ press: 'ArrowUp' });
      expect(pxRatio(cropper().crop.normalized), `resize ${r}`).to.be.closeTo(want, want * 0.01);
      q('.td-cropper__box', cropper()).focus();
      await sendKeys({ press: '+' });
      await sendKeys({ press: 'ArrowRight' });
      const n = cropper().crop.normalized;
      expect(pxRatio(n), `nudge ${r}`).to.be.closeTo(want, want * 0.01);
      cropConfirm().click();
      const res = await p;
      expect(res.status).to.equal('applied');
      expect(near(res.crop.normalized, n, 1e-6)).to.equal(true);
      await until(() => !anyCropRoot(), 4000, 'closed');
      const p2 = openCropDialog({ src: '/test/fixtures/1.svg', naturalWidth: 1200, naturalHeight: 800, aspectRatio: r, crop: res.crop.normalized });
      await until(() => cropRoot()?.getAttribute('data-state') === 'open' && cropper()?.getAttribute('data-state') === 'ready', 4000, `reopen ${r}`);
      expect(near(cropper().crop.normalized, n, 1.3e-3), `round-trip ${r} ${JSON.stringify([cropper().crop.normalized, n])}`).to.equal(true);
      cropConfirm().click();
      expect((await p2).changed, `unchanged ${r}`).to.equal(false);
      await until(() => !anyCropRoot(), 4000, 'closed');
    }
  });

  it('(12) presets per call: given in order and selectable; empty → the global default; locked + ratioLabel → the title', async () => {
    const presets = [{ label: 'Banner', ratio: 14 }, { label: 'Dọc', ratio: 9 / 16 }, { label: 'Tự do', ratio: null }];
    let r = await openReady({ crop: { enabled: true, presets } });
    await select('m60');
    await cropOpen();
    expect(ratioLabels()).to.deep.equal(['Banner', 'Dọc', 'Tự do']);
    click(cropper().querySelectorAll('.td-cropper__ratio')[0]);
    await until(() => Math.abs(pxRatio(cropper().crop.normalized) - 14) < 0.14, 4000, 'Banner applied');
    click(cropper().querySelectorAll('.td-cropper__ratio')[1]);
    await until(() => Math.abs(pxRatio(cropper().crop.normalized) - 9 / 16) < 0.01, 4000, 'Dọc applied');
    cropConfirm().click();
    const out = await r.promise;
    expect(pxRatio(out.selection[0].usage.crop.normalized)).to.be.closeTo(9 / 16, 0.01);
    await closeAll();
    r = await openReady({ crop: { enabled: true, presets: [] } });
    await select('m60');
    await cropOpen();
    expect(ratioLabels()).to.deep.equal(TdCropper.presets.map((p) => p.label));
    await closeAll();
    r = await openReady({ crop: { enabled: true, aspectRatio: 14, ratioLabel: 'Banner 14:1' } });
    await select('m60');
    await cropOpen();
    expect(cropTitle()).to.equal(`${L.cropTitle} · Banner 14:1`);
    await closeAll();
    r = await openReady({ crop: { enabled: true, aspectRatio: 14 } });
    await select('m60');
    await cropOpen();
    expect(cropTitle(), 'default suffix').to.equal(`${L.cropTitle} · 14:1`);
  });
});

describe('v0.119.0 — td-media-field: crop-output, crop-presets, crop-ratio-label', () => {
  const PRESETS = '[{"label":"Banner","ratio":14},{"label":"Vuông","ratio":1},{"label":"x","ratio":-1}]';

  it('(7) picker path: crop-output="new-asset" → the value becomes the derived id, input + change with derivedFromAssetId', async () => {
    const ad = createMockAdapter();
    const d = manualDerive();
    ad.createCropDerivative = d.fn;
    const { el, form, c } = field({ value: 'm1', alt: 'Alt đang sửa', crop: CROP_B, 'crop-output': 'new-asset' }, ad);
    await fieldPicker(el);
    await cropOpen();
    cropConfirm().click();
    await until(() => d.calls.length === 1, 4000, 'called');
    expect(d.calls[0].args.sourceAssetId).to.equal('m1');
    expect(near(d.calls[0].args.crop.normalized, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 })).to.equal(true);
    d.calls[0].resolve(derivOf(ad, 'm1', 'd1'));
    await until(() => c.change === 1, 4000, 'committed');
    expect(el.value).to.equal('d1');
    expect(c.input).to.equal(1);
    expect(fd(form, 'og[crop]')).to.equal('null');
    expect(fd(form, 'og[alt]'), 'the alt of the current value kept').to.equal('Alt đang sửa');
    for (const det of c.details) {
      expect(det.value).to.equal('d1');
      expect(det.selection[0].usage.derivedFromAssetId).to.equal('m1');
      expect(det.selection[0].usage.crop).to.equal(null);
    }
    expect('derivedFromAssetId' in el.selection[0].usage, 'provenance is not field state').to.equal(false);
  });

  it('(7) standalone "Cắt ảnh": commits once (value, preview, usage cleared); reject / abort / beforeApply false leave it untouched', async () => {
    const ad = createMockAdapter();
    const d = manualDerive();
    ad.createCropDerivative = d.fn;
    const { el, form, c } = field({ value: 'm1', crop: CROP_B, 'focal-point': true, focal: FOCAL_B, 'crop-output': 'new-asset' }, ad);
    const btn = () => el.querySelector('.td-media-field__crop-btn');
    const openStandalone = async () => {
      await until(() => btn() && !btn().hidden, 4000, 'crop button');
      btn().click();
      await until(() => cropRoot()?.getAttribute('data-state') === 'open' && cropper()?.getAttribute('data-state') === 'ready', 4000, 'standalone open');
    };
    await openStandalone();
    expect(near(cropper().crop.normalized, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 })).to.equal(true);
    // reject → stays, message; then cancel → untouched
    cropConfirm().click();
    await until(() => d.calls.length === 1, 4000, 'called');
    expect(cropMessage()?.textContent).to.equal(el.constructor.labels.cropDerivativeBusy);
    d.calls[0].reject(new Error('raw: Lỗi máy chủ'));
    await until(() => cropMessage()?.textContent === el.constructor.labels.cropDerivativeError, 4000, 'label, never the raw message');
    q('.td-crop-dialog__cancel', cropRoot()).click();
    await until(() => !anyCropRoot(), 4000, 'closed');
    expect([el.value, fd(form, 'og[crop]'), fd(form, 'og[focal]'), c.change]).to.deep.equal(['m1', CROP_B, FOCAL_B, 0]);
    // abort (Escape) during the call → untouched, the late result ignored
    await openStandalone();
    cropConfirm().click();
    await until(() => d.calls.length === 2, 4000, 'called 2');
    q('.td-crop-dialog__dialog', cropRoot()).focus();
    await sendKeys({ press: 'Escape' });
    await until(() => !anyCropRoot(), 4000, 'closed');
    expect(d.calls[1].args.signal.aborted).to.equal(true);
    d.calls[1].resolve(derivOf(ad, 'm1', 'd1'));
    await tickTask();
    expect([el.value, c.change]).to.deep.equal(['m1', 0]);
    // beforeApply false (pickerOptions) → untouched
    el.pickerOptions = { beforeApply: () => false };
    await openStandalone();
    cropConfirm().click();
    await until(() => d.calls.length === 3, 4000, 'called 3');
    d.calls[2].resolve(derivOf(ad, 'm1', 'd1'));
    await until(() => cropMessage()?.textContent === L.applyRejected, 4000, 'rejected');
    q('.td-crop-dialog__cancel', cropRoot()).click();
    await until(() => !anyCropRoot(), 4000, 'closed');
    expect([el.value, fd(form, 'og[crop]'), c.change]).to.deep.equal(['m1', CROP_B, 0]);
    // success → one commit
    const seen = [];
    el.pickerOptions = { beforeApply: (sel) => { seen.push(sel); return true; } };
    await openStandalone();
    cropConfirm().click();
    await until(() => d.calls.length === 4, 4000, 'called 4');
    d.calls[3].resolve({ ...derivOf(ad, 'm1', 'd1'), urls: { thumbnail: '/test/fixtures/2.svg', preview: '/test/fixtures/2.svg' } });
    await until(() => c.change === 1, 4000, 'committed');
    expect(seen[0][0].assetId).to.equal('d1');
    expect(seen[0][0].usage.derivedFromAssetId).to.equal('m1');
    expect(el.value).to.equal('d1');
    expect(c.input).to.equal(1);
    expect(fd(form, 'og[crop]')).to.equal('null');
    expect(fd(form, 'og[focal]')).to.equal('null');
    expect(el.querySelector('.td-media-field__img')?.getAttribute('src')).to.include('/test/fixtures/2.svg');
    for (const det of c.details) {
      expect(det.value).to.equal('d1');
      expect(det.selection[0].usage).to.deep.include({ crop: null, focalPoint: null, derivedFromAssetId: 'm1' });
    }
    expect('derivedFromAssetId' in el.selection[0].usage).to.equal(false);
  });

  it('focalOptional property is a boolean attribute (true sets, false removes)', async () => {
    const f = document.createElement('td-media-field');
    document.body.append(f);
    try {
      f.focalOptional = true;
      expect(f.hasAttribute('focal-optional')).to.equal(true);
      f.focalOptional = false;
      expect(f.hasAttribute('focal-optional')).to.equal(false);
    } finally { f.remove(); }
  });

  it('(7) no method → one warning, metadata on both paths', async () => {
    const ad = createMockAdapter();
    const { el, c } = field({ value: 'm1', 'crop-output': 'new-asset' }, ad);
    await until(() => el.querySelector('.td-media-field__crop-btn') && !el.querySelector('.td-media-field__crop-btn').hidden, 4000, 'btn');
    el.querySelector('.td-media-field__crop-btn').click();
    await until(() => cropper()?.getAttribute('data-state') === 'ready', 4000, 'standalone open');
    q('.td-cropper__box', cropper()).focus();
    await sendKeys({ press: '+' });
    await until(() => cropper().crop.normalized.width < 1, 4000, 'zoomed');
    cropConfirm().click();
    await until(() => c.change === 1, 4000, 'metadata commit');
    expect(el.value).to.equal('m1');
    expect(el.selection[0].usage.crop).to.not.equal(null);
    expect(warns.filter((w) => w.includes('createCropDerivative')).length).to.equal(1);
  });

  it('(13) crop-presets / crop-ratio-label reach both paths; invalid crop-presets JSON → one warning', async () => {
    const ad = createMockAdapter();
    const { el } = field({ value: 'm1', 'crop-presets': PRESETS }, ad);
    await fieldPicker(el);
    await cropOpen();
    expect(ratioLabels()).to.deep.equal(['Banner', 'Vuông']);
    await closeAll();
    el.querySelector('.td-media-field__crop-btn').click();
    await until(() => cropper()?.getAttribute('data-state') === 'ready', 4000, 'standalone open');
    expect(ratioLabels()).to.deep.equal(['Banner', 'Vuông']);
    await closeAll();
    const locked = field({ value: 'm1', 'crop-ratio': '14/1', 'crop-ratio-label': 'Banner 14:1' }, ad).el;
    await fieldPicker(locked);
    await cropOpen();
    expect(cropTitle()).to.equal(`${L.cropTitle} · Banner 14:1`);
    await closeAll();
    locked.querySelector('.td-media-field__crop-btn').click();
    await until(() => cropper()?.getAttribute('data-state') === 'ready', 4000, 'standalone open');
    expect(cropTitle()).to.equal(`${locked.constructor.labels.crop} · Banner 14:1`);
    await closeAll();
    const bad = field({ value: 'm1', 'crop-presets': '[{bad json' }, ad).el;
    bad.querySelector('.td-media-field__crop-btn').click();
    await until(() => cropper()?.getAttribute('data-state') === 'ready', 4000, 'standalone open');
    expect(ratioLabels()).to.deep.equal(TdCropper.presets.map((p) => p.label));
    await closeAll();
    await fieldPicker(bad);
    expect(warns.filter((w) => w.includes('crop-presets')).length).to.equal(1);
  });
});
