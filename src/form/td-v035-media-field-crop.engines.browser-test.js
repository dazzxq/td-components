import { expect } from '@esm-bundle/chai';
// DOM nodes are compared as booleans (`a === b`): chai serialising DOM nodes on failure hangs the runner.
import { TdMediaField } from './td-media-field.js';
import { TdMediaPicker } from '../feedback/td-media-picker.js';
import { createMockAdapter } from '../../test/fixtures/media-adapter.js';
import { serializeCrop, serializeFocal, parseCrop } from '../utils/media-field-model.js';

// v0.35.0 (plan docs/internal/plans/v0.35.0-cropper.md decisions 27-31, Test > Engines "td-v035-media-field-crop") —
// <td-media-field> crop / focal in Chromium, Firefox AND WebKit (group `engines`): every row of the state table 28b
// (one test each: FormData name[crop] / name[focal], getter selection[0].usage.crop / .focalPoint, detail.selection of
// EVERY emitted event == the new state; "không" rows assert no event), the "Cắt ảnh" button + its un-cropped source
// (28a), the picker's `crop` param (always set), FormData shape, crop preview. The picker is STUBBED (TdMediaPicker.open
// replaced by a controllable deferred) except where the real picker is the point (crop param vs site options). The
// crop dialog is the REAL one (src/feedback/crop-dialog.js); waits are real signals (data-state="open", events,
// `load`), polled — never a fixed sleep.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const realOpen = TdMediaPicker.open;
/** @type {Array<{ opts: any, resolve: (o: any) => void, reject: (e: any) => void }>} */
let opens = [];
const stubOpen = (opts) => new Promise((resolve, reject) => { opens.push({ opts, resolve, reject }); });

const warns = [];
const realWarn = console.warn;

const ad = createMockAdapter();
const asset = (id) => JSON.parse(JSON.stringify(ad.db.get(id)));
const tick = () => new Promise((r) => setTimeout(r, 0));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
async function until(fn, ms = 4000, what = 'condition') {
  const t0 = performance.now();
  for (;;) {
    let v;
    try { v = fn(); } catch { v = false; }
    if (v) return v;
    if (performance.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

const CROP_A = '{"v":1,"x":0.1,"y":0,"width":0.5,"height":1}';
/** same numbers as …x 0.25…, other bytes (trailing zeros): kept byte-identical when unchanged */
const CROP_B = '{"v":1,"x":0.250,"y":0.25,"width":0.50,"height":0.5}';
const FOCAL_A = '{"v":1,"x":0.25,"y":0.75}';
const FOCAL_B = '{"v":1,"x":0.50,"y":0.5}';
const N = (raw) => (raw ? { normalized: parseCrop(raw).crop } : null);
const F = (raw) => (raw ? (({ x, y }) => ({ x, y }))(JSON.parse(raw)) : null);

/** A picker outcome selecting `id` with a crop step result. */
const picked = (id, { crop = null, focalPoint = null, altText } = {}) => ({
  status: 'selected',
  selection: [{ assetId: id, asset: asset(id), usage: { altText: altText ?? asset(id).defaultAltText, crop, focalPoint } }],
});

const box = document.createElement('div');
box.style.width = '360px'; // test page only (the component never writes style except the crop preview vars)
document.body.appendChild(box);

/** A form with one field built from `attrs` (+ an adapter unless `adapter: null`). */
function mk(attrs = {}, { adapter = ad } = {}) {
  const form = document.createElement('form');
  const el = document.createElement('td-media-field');
  for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  if (adapter) el.adapter = adapter;
  form.appendChild(el);
  box.appendChild(form);
  return { form, el, c: counter(el) };
}
const q = (el, sel) => el.querySelector(sel);
const openBtn = (el) => q(el, '.td-media-field__open');
const cropBtn = (el) => q(el, '.td-media-field__crop-btn');
function counter(el) {
  const c = { input: 0, change: 0, details: [] };
  el.addEventListener('input', (e) => { c.input++; c.details.push(e.detail); });
  el.addEventListener('change', (e) => { c.change++; c.details.push(e.detail); });
  return c;
}
const fd = (form) => [...new FormData(form)].map(([k, v]) => [k, String(v)]);
const entry = (form, k) => {
  const all = fd(form).filter(([n]) => n === k);
  return all.length ? all[0][1] : undefined;
};

/**
 * The state after a row: FormData name[crop] (+ name[focal] when `focal` is given, else absent), the getter, and the
 * detail.selection of every event (= the new state); `events` 0 → none, 1 → exactly one input + one change.
 */
function expectState({ el, form, c }, name, { crop, focal, events }) {
  expect(entry(form, `${name}[crop]`), 'name[crop]').to.equal(crop ?? 'null');
  if (focal === undefined) expect(entry(form, `${name}[focal]`), 'no name[focal]').to.equal(undefined);
  else expect(entry(form, `${name}[focal]`), 'name[focal]').to.equal(focal ?? 'null');
  const sel = el.selection;
  if (el.value) {
    expect(sel[0].usage.crop, 'selection crop').to.deep.equal(N(crop));
    expect(sel[0].usage.focalPoint, 'selection focal').to.deep.equal(focal === undefined ? null : F(focal));
  } else {
    expect(sel).to.deep.equal([]);
  }
  expect(c.input, 'input events').to.equal(events);
  expect(c.change, 'change events').to.equal(events);
  for (const d of c.details) {
    expect(d.value).to.equal(el.value);
    expect(d.selection, 'detail.selection == the new state').to.deep.equal(sel);
  }
}

// --- the real crop dialog (lane B: src/feedback/crop-dialog.js) ---
const dialogRoots = () => [...document.body.querySelectorAll(':scope > .td-crop-dialog')];
const openDialog = () => dialogRoots().find((r) => r.getAttribute('data-state') === 'open') || null;
const cropperOf = (d) => d.querySelector('td-cropper');
const titleOf = (d) => d.querySelector('.td-modal__title').textContent;
/** The open dialog once its cropper reports `image-ready` (or the timeout). */
async function dialogReady() {
  const d = await until(() => openDialog(), 4000, 'crop dialog open');
  const cr = cropperOf(d);
  await until(() => cr.getAttribute('data-state') === 'ready' || cr.getAttribute('data-state') === 'error', 4000, 'cropper ready');
  return d;
}
const applyBtn = (d) => d.querySelector('.td-crop-dialog__confirm');
const cancelBtn = (d) => d.querySelector('.td-crop-dialog__cancel');
const dialogGone = () => until(() => dialogRoots().length === 0, 4000, 'crop dialog closed');
/** Click "Cắt ảnh", wait for the dialog + its image. */
async function openCrop(el) {
  cropBtn(el).click();
  return dialogReady();
}
/** Move the crop (and focal) in the open dialog, as a user would, then "Áp dụng". */
async function applyWith(d, normalized, focalPoint) {
  const cr = cropperOf(d);
  if (normalized !== undefined) cr.crop = normalized ? { normalized } : null;
  if (focalPoint !== undefined) cr.focalPoint = focalPoint;
  expect(applyBtn(d).disabled, 'Áp dụng enabled').to.equal(false);
  applyBtn(d).click();
  await dialogGone();
}
const near6 = (raw, n) => {
  const c = parseCrop(raw).crop;
  return ['x', 'y', 'width', 'height'].every((k) => Math.abs(c[k] - n[k]) <= 1e-3);
};

beforeEach(() => {
  opens = [];
  warns.length = 0;
  TdMediaPicker.open = stubOpen;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
});
afterEach(async () => {
  TdMediaPicker.open = realOpen;
  console.warn = realWarn;
  box.replaceChildren();
  // a failed test may leave an overlay open: close it (never cascades into the next test)
  for (const b of document.body.querySelectorAll(':scope > .td-modal[data-state="open"] .td-modal__close')) b.click();
  await until(() => dialogRoots().length === 0 && !document.body.querySelector(':scope > .td-media-picker'), 4000, 'overlays gone');
});

const CROPPABLE = { name: 'og', usage: true, croppable: true, 'focal-point': true, 'aspect-ratio': '3/2' };

describe('td-media-field v0.35 — table 28b (one test per row)', () => {
  it('row 1: picker → NEW asset, croppable → serializeCrop(usage.crop.normalized) + serializeFocal(usage.focalPoint); input + change', async () => {
    const t = mk({ ...CROPPABLE, value: 'm1', crop: CROP_A, focal: FOCAL_A, 'preview-src': '/test/fixtures/1.svg' });
    q(t.el, '.td-media-field__replace').click();
    const normalized = { x: 0.1234567891, y: 0.2, width: 0.5, height: 0.5 };
    opens[0].resolve(picked('m2', { crop: { normalized, pixels: { x: 148, y: 160, width: 600, height: 400 }, aspectRatio: 1.5 }, focalPoint: { x: 0.3333333333, y: 0.5 } }));
    await until(() => t.el.value === 'm2');
    expectState(t, 'og', { crop: serializeCrop(normalized), focal: serializeFocal({ x: 0.3333333333, y: 0.5 }), events: 1 });
    expect(entry(t.form, 'og[crop]')).to.equal('{"v":1,"x":0.123457,"y":0.2,"width":0.5,"height":0.5}');
  });

  it('row 1b: picker → new asset, croppable, crop step gave none (whole image) → null / null; input + change', async () => {
    const t = mk({ ...CROPPABLE, value: 'm1', crop: CROP_A, focal: FOCAL_A, 'preview-src': '/test/fixtures/1.svg' });
    q(t.el, '.td-media-field__replace').click();
    opens[0].resolve(picked('m3'));
    await until(() => t.el.value === 'm3');
    expectState(t, 'og', { crop: null, focal: null, events: 1 });
  });

  it('row 2: picker → new asset, NOT croppable → crop null (v0.34) even if the outcome carries one; focal null; input + change', async () => {
    const t = mk({ name: 'og', usage: true, 'focal-point': true, value: 'm1', crop: CROP_A, focal: FOCAL_A, 'preview-src': '/test/fixtures/1.svg' });
    q(t.el, '.td-media-field__replace').click();
    expect(opens[0].opts.crop).to.deep.equal({ enabled: false });
    opens[0].resolve(picked('m2', { crop: { normalized: { x: 0, y: 0, width: 0.5, height: 0.5 } }, focalPoint: { x: 0.5, y: 0.5 } }));
    await until(() => t.el.value === 'm2');
    expectState(t, 'og', { crop: null, focal: null, events: 1 });
  });

  it('row 3: picker → SAME asset, croppable, other crop / focal → asset + preview refreshed, new crop / focal; input + change', async () => {
    const t = mk({ ...CROPPABLE, value: 'm1', crop: CROP_A, focal: FOCAL_A, 'preview-src': '/test/fixtures/3.svg', 'preview-alt': 'cũ' });
    q(t.el, '.td-media-field__replace').click();
    expect(opens[0].opts.selection.initialIds).to.deep.equal(['m1']);
    const normalized = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    opens[0].resolve(picked('m1', { crop: { normalized, aspectRatio: 1.5 }, focalPoint: { x: 0.1, y: 0.9 } }));
    await until(() => t.c.change === 1);
    expect(t.el.selection[0].asset.id).to.equal('m1');
    expect(q(t.el, 'img').getAttribute('src')).to.equal(new URL(asset('m1').urls.preview, document.baseURI).href);
    expect(q(t.el, '.td-sr-only').textContent).to.equal(`Đã chọn: ${asset('m1').name}`);
    expectState(t, 'og', { crop: serializeCrop(normalized), focal: serializeFocal({ x: 0.1, y: 0.9 }), events: 1 });
  });

  it('row 3b: picker → same asset, croppable, identical crop + focal (± 1e-6) → no event, raw strings kept byte-identical', async () => {
    const t = mk({ ...CROPPABLE, value: 'm1', crop: CROP_B, focal: FOCAL_B, 'preview-src': '/test/fixtures/3.svg', 'preview-alt': 'cũ' });
    q(t.el, '.td-media-field__replace').click();
    opens[0].resolve(picked('m1', { crop: { normalized: { x: 0.2500004, y: 0.25, width: 0.5, height: 0.4999996 } }, focalPoint: { x: 0.5, y: 0.5000003 } }));
    await until(() => q(t.el, '.td-sr-only').textContent === `Đã chọn: ${asset('m1').name}`);
    await tick();
    expectState(t, 'og', { crop: CROP_B, focal: FOCAL_B, events: 0 });
    expect(t.el.selection[0].asset.id, 'asset refreshed').to.equal('m1');
  });

  it('row 4: picker → same asset, NOT croppable → v0.34: preview refreshed, crop / focal kept, no event', async () => {
    const t = mk({ name: 'og', usage: true, 'focal-point': true, value: 'm1', crop: CROP_B, focal: FOCAL_B, 'preview-alt': 'cũ' });
    q(t.el, '.td-media-field__replace').click();
    opens[0].resolve(picked('m1', { crop: { normalized: { x: 0, y: 0, width: 0.5, height: 0.5 } }, focalPoint: { x: 0, y: 0 } }));
    await until(() => q(t.el, '.td-sr-only').textContent === `Đã chọn: ${asset('m1').name}`);
    await tick();
    expectState(t, 'og', { crop: CROP_B, focal: FOCAL_B, events: 0 });
  });

  it('row 7: "Gỡ" → crop null, focal null; input + change (v0.34)', () => {
    const t = mk({ ...CROPPABLE, value: 'm1', crop: CROP_A, focal: FOCAL_A, 'preview-src': '/test/fixtures/1.svg' });
    q(t.el, '.td-media-field__remove').click();
    expect(t.el.value).to.equal('');
    expectState(t, 'og', { crop: null, focal: null, events: 1 });
    expect(t.c.details[1].selection).to.deep.equal([]);
  });

  it('row 8: .value = id (code) → crop null, focal null, no event', () => {
    const t = mk({ ...CROPPABLE, value: 'm1', crop: CROP_A, focal: FOCAL_A, 'preview-src': '/test/fixtures/1.svg' });
    t.el.value = 'm2';
    expectState(t, 'og', { crop: null, focal: null, events: 0 });
  });

  it('row 9: setSelection(sel) → crop = v0.34 JSON.stringify path (never re-rounded, ≠ serializeCrop), focal the same way; no event', () => {
    const t = mk({ ...CROPPABLE });
    const n = { x: 0.1234567891, y: 0.0000001, width: 0.3333333333333333, height: 0.5 };
    const v034 = JSON.stringify({ v: 1, x: n.x, y: n.y, width: n.width, height: n.height });
    const fp = { x: 0.1111111111, y: 1 };
    t.el.setSelection({ assetId: 'm2', asset: asset('m2'), usage: { altText: 'X', crop: { normalized: n }, focalPoint: fp } });
    expect(v034).to.not.equal(serializeCrop(n));
    expectState(t, 'og', { crop: v034, focal: JSON.stringify({ v: 1, x: fp.x, y: fp.y }), events: 0 });
    expect(t.el.selection[0].usage.focalPoint).to.deep.equal(fp);
    expect(fd(t.form)).to.deep.equal([['og[id]', 'm2'], ['og[alt]', 'X'], ['og[crop]', v034], ['og[focal]', '{"v":1,"x":0.1111111111,"y":1}']]);
  });

  it('row 9 (no focal-point): setSelection → FormData exactly the three v0.34 entries, getter focalPoint null', () => {
    const t = mk({ name: 'og', usage: true, croppable: true });
    t.el.setSelection({ assetId: 'm2', asset: asset('m2'), usage: { altText: 'X', crop: { normalized: { x: 0, y: 0, width: 1, height: 1 } }, focalPoint: { x: 0.5, y: 0.5 } } });
    expect(fd(t.form)).to.deep.equal([['og[id]', 'm2'], ['og[alt]', 'X'], ['og[crop]', '{"v":1,"x":0,"y":0,"width":1,"height":1}']]);
    expectState(t, 'og', { crop: '{"v":1,"x":0,"y":0,"width":1,"height":1}', events: 0 });
  });

  it('row 10: setSelection(null) / setSelection([]) → crop null, focal null, no event', () => {
    const t = mk({ ...CROPPABLE, value: 'm1', crop: CROP_A, focal: FOCAL_A });
    t.el.setSelection(null);
    expectState(t, 'og', { crop: null, focal: null, events: 0 });
    t.el.setSelection({ assetId: 'm1', usage: { crop: { normalized: { x: 0, y: 0, width: 1, height: 1 } }, focalPoint: { x: 0, y: 0 } } });
    t.el.setSelection([]);
    expectState(t, 'og', { crop: null, focal: null, events: 0 });
  });

  it('row 11: crop / focal attribute changes → the live state from the attribute (invalid → null + one warning), no event', () => {
    const t = mk({ ...CROPPABLE, value: 'm1' });
    t.el.setAttribute('crop', CROP_B);
    t.el.setAttribute('focal', FOCAL_B);
    expectState(t, 'og', { crop: CROP_B, focal: FOCAL_B, events: 0 });
    t.el.setAttribute('focal', '{"v":1,"x":2,"y":0}');
    expectState(t, 'og', { crop: CROP_B, focal: null, events: 0 });
    expect(warns.filter((w) => w.includes('focal is not')).length).to.equal(1);
    t.el.removeAttribute('crop');
    expectState(t, 'og', { crop: null, focal: null, events: 0 });
  });

  it('row 12: value attribute change → crop / focal null unless crop / focal change too (v0.34); no event', () => {
    const t = mk({ ...CROPPABLE, value: 'm1', 'preview-src': '/test/fixtures/1.svg' });
    t.el.setSelection({ assetId: 'm1', usage: { crop: { normalized: { x: 0, y: 0, width: 0.5, height: 0.5 } }, focalPoint: { x: 0.5, y: 0.5 } } });
    t.el.setAttribute('value', 'm2');
    expectState(t, 'og', { crop: null, focal: null, events: 0 });
    t.el.setAttribute('crop', CROP_A);
    t.el.setAttribute('focal', FOCAL_A);
    t.el.setAttribute('value', 'm3');
    expectState(t, 'og', { crop: CROP_A, focal: FOCAL_A, events: 0 });
  });

  it('row 13: form.reset() → the crop / focal attributes (byte-identical), no event', async () => {
    const t = mk({ ...CROPPABLE, value: 'm1', crop: CROP_B, focal: FOCAL_B, 'preview-src': '/test/fixtures/1.svg' });
    q(t.el, '.td-media-field__replace').click();
    opens[0].resolve(picked('m2', { crop: { normalized: { x: 0, y: 0, width: 0.5, height: 0.5 } }, focalPoint: { x: 0.2, y: 0.2 } }));
    await until(() => t.el.value === 'm2');
    t.c.input = 0; t.c.change = 0; t.c.details.length = 0;
    t.form.reset();
    expect(t.el.value).to.equal('m1');
    expectState(t, 'og', { crop: CROP_B, focal: FOCAL_B, events: 0 });
  });

  it('row 14: form state restore → state.crop / state.focal (missing / invalid → null), no event', () => {
    const t = mk({ ...CROPPABLE }, { adapter: null });
    const st = (o) => JSON.stringify({ v: 1, id: 'm9', alt: 'khôi phục', crop: CROP_B, ...o });
    t.el.formStateRestoreCallback(st({ focal: FOCAL_B }), 'restore');
    expectState(t, 'og', { crop: CROP_B, focal: FOCAL_B, events: 0 });
    t.el.formStateRestoreCallback(st({}), 'restore'); // a v0.34 state: no focal key
    expectState(t, 'og', { crop: CROP_B, focal: null, events: 0 });
    t.el.formStateRestoreCallback(st({ crop: '{"v":1,"x":0.9,"y":0,"width":0.5,"height":1}', focal: '{"v":1,"x":0.5,"y":0.5,"z":1}' }), 'restore');
    expectState(t, 'og', { crop: null, focal: null, events: 0 });
  });

  it('restore state encodes focal: {"v":1,"id","alt","crop","focal"}', () => {
    const states = [];
    const real = ElementInternals.prototype.setFormValue;
    ElementInternals.prototype.setFormValue = function (v, s) { states.push(s); return real.call(this, v, s); };
    try {
      mk({ ...CROPPABLE, value: 'm1', crop: CROP_B, focal: FOCAL_B });
    } finally {
      ElementInternals.prototype.setFormValue = real;
    }
    expect(JSON.parse(states.at(-1))).to.deep.equal({ v: 1, id: 'm1', alt: '', crop: CROP_B, focal: FOCAL_B });
  });
});

describe('td-media-field v0.35 — picker `crop` param (decision 28, review R2 #7)', () => {
  it('croppable → { enabled: true, aspectRatio, allowFocalPoint } (crop-ratio > aspect-ratio > free) over pickerOptions.crop', () => {
    const a = mk({ ...CROPPABLE }).el;
    a.pickerOptions = { crop: { enabled: false } };
    openBtn(a).click();
    expect(opens[0].opts.crop).to.deep.equal({ enabled: true, aspectRatio: 1.5, allowFocalPoint: true });
    const b = mk({ name: 'b', usage: true, croppable: true, 'aspect-ratio': '3/2', 'crop-ratio': '1.91' }).el;
    openBtn(b).click();
    expect(opens[1].opts.crop).to.deep.equal({ enabled: true, aspectRatio: 1.91, allowFocalPoint: false });
    const c = mk({ name: 'c', usage: true, croppable: true, 'aspect-ratio': '3/2', 'crop-ratio': 'free' }).el;
    openBtn(c).click();
    expect(opens[2].opts.crop).to.deep.equal({ enabled: true, aspectRatio: null, allowFocalPoint: false });
    const d = mk({ name: 'd', usage: true, croppable: true, 'crop-ratio': 'nope' }).el;
    openBtn(d).click();
    expect(opens[3].opts.crop).to.deep.equal({ enabled: true, aspectRatio: null, allowFocalPoint: false });
    expect(warns.filter((w) => w.includes('crop-ratio must be')).length).to.equal(1);
    expect(warns.some((w) => w.includes('nope')), 'bounded: the value is not echoed').to.equal(false);
    // review R1 #5: [0.01, 100] — the boundaries pass, outside is rejected (warned, falls back to aspect-ratio / free)
    const e = mk({ name: 'e', usage: true, croppable: true, 'crop-ratio': '100' }).el;
    openBtn(e).click();
    expect(opens[4].opts.crop.aspectRatio).to.equal(100);
    const f = mk({ name: 'f', usage: true, croppable: true, 'aspect-ratio': '3/2', 'crop-ratio': '100.01' }).el;
    openBtn(f).click();
    expect(opens[5].opts.crop.aspectRatio, 'rejected → the frame ratio').to.equal(1.5);
    const g = mk({ name: 'g', usage: true, croppable: true, 'aspect-ratio': '200/1' }).el;
    openBtn(g).click();
    expect(opens[6].opts.crop.aspectRatio, 'frame ratio outside the crop range → free').to.equal(null);
    expect(warns.filter((w) => w.includes('[0.01, 100]')).length).to.be.at.least(2);
  });

  it('not croppable → crop: { enabled: false } always (also with pickerOptions.crop.enabled)', () => {
    const { el } = mk({ name: 'h', usage: true });
    el.pickerOptions = { crop: { enabled: true, aspectRatio: 2 } };
    openBtn(el).click();
    expect(opens[0].opts.crop).to.deep.equal({ enabled: false });
  });

  for (const via of ['pickerOptions', 'configureDefaults']) {
    it(`REAL picker, not croppable + ${via} crop.enabled = true → "Chèn" finishes at once, no crop dialog, open() got crop { enabled: false }`, async () => {
      const seen = [];
      TdMediaPicker.open = (o) => { seen.push(o); return realOpen.call(TdMediaPicker, o); };
      const before = TdMediaPicker.defaults;
      if (via === 'configureDefaults') TdMediaPicker.configureDefaults({ ...before, crop: { enabled: true, aspectRatio: 1.5 } });
      try {
        const t = mk({ name: 'og', usage: true, value: 'm1', 'preview-src': '/test/fixtures/1.svg' });
        if (via === 'pickerOptions') t.el.pickerOptions = { crop: { enabled: true, aspectRatio: 1.5, allowFocalPoint: true } };
        q(t.el, '.td-media-field__replace').click();
        expect(seen[0].crop).to.deep.equal({ enabled: false });
        const root = () => document.body.querySelector(':scope > .td-media-picker[data-state="open"]') || document.body.querySelector(':scope > .td-media-picker');
        const item = (id) => root()?.querySelector(`[data-td-media-item][data-id="${id}"] [data-td-media-open]`);
        await until(() => item('m59'), 4000, 'picker grid');
        item('m59').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
        const confirm = () => root()?.querySelector('.td-media-picker__confirm');
        await until(() => confirm() && !confirm().hasAttribute('disabled'), 4000, 'confirm enabled');
        confirm().click();
        expect(dialogRoots().length, 'no crop dialog').to.equal(0);
        await until(() => t.el.value === 'm59', 4000, 'outcome applied');
        expect(dialogRoots().length, 'no crop dialog').to.equal(0);
        expectState(t, 'og', { crop: null, events: 1 });
      } finally {
        TdMediaPicker.configureDefaults(before);
      }
    });
  }
});

describe('td-media-field v0.35 — attributes, button, FormData shape, preview', () => {
  it('croppable / focal-point / crop-ratio / focal without usage → ONE warning, ignored (no button, reference shape)', () => {
    const { el, form } = mk({ name: 'h', croppable: true, 'focal-point': true, 'crop-ratio': '1/1', focal: FOCAL_A, value: 'm1', 'preview-src': '/test/fixtures/1.svg' });
    expect(cropBtn(el)).to.equal(null);
    expect(q(el, '.td-media-field__status')).to.equal(null);
    expect(fd(form)).to.deep.equal([['h', 'm1']]);
    expect(el.selection[0].usage.focalPoint).to.equal(null);
    openBtn(el).click();
    expect(opens[0].opts.crop).to.deep.equal({ enabled: false });
    expect(warns.filter((w) => w.includes('need the usage attribute')).length).to.equal(1);
  });

  it('FormData: three entries without focal-point = byte-identical v0.34; four with (order id, alt, crop, focal)', () => {
    const three = mk({ name: 'og', usage: true, croppable: true, value: 'm1', alt: 'A', crop: CROP_B, focal: FOCAL_A });
    expect(fd(three.form)).to.deep.equal([['og[id]', 'm1'], ['og[alt]', 'A'], ['og[crop]', CROP_B]]);
    const v034 = mk({ name: 'og', usage: true, value: 'm1', alt: 'A', crop: CROP_B });
    expect(fd(v034.form)).to.deep.equal(fd(three.form));
    const four = mk({ name: 'og', usage: true, 'focal-point': true, value: 'm1', alt: 'A', crop: CROP_B, focal: FOCAL_A });
    expect(fd(four.form)).to.deep.equal([['og[id]', 'm1'], ['og[alt]', 'A'], ['og[crop]', CROP_B], ['og[focal]', FOCAL_A]]);
    const empty = mk({ name: 'og', usage: true, 'focal-point': true });
    expect(fd(empty.form)).to.deep.equal([['og[id]', ''], ['og[alt]', ''], ['og[crop]', 'null'], ['og[focal]', 'null']]);
    // focal-point without croppable: round-trip only (no button)
    expect(cropBtn(four.el)).to.equal(null);
    expect(four.el.selection[0].usage.focalPoint).to.deep.equal({ x: 0.25, y: 0.75 });
  });

  it('"Cắt ảnh": between Đổi and Gỡ, aria-haspopup=dialog; only croppable + usage + value + image + a source (adapter or preview-src)', () => {
    const shown = mk({ ...CROPPABLE, value: 'm1', 'preview-src': '/test/fixtures/1.svg' }, { adapter: null }).el;
    const btns = [...q(shown, '.td-media-field__actions').children];
    expect(btns.map((b) => b.className.split(' ').at(-1))).to.deep.equal(['td-media-field__replace', 'td-media-field__crop-btn', 'td-media-field__remove']);
    expect(cropBtn(shown).textContent).to.equal(TdMediaField.labels.crop);
    expect(TdMediaField.labels.crop).to.equal('Cắt ảnh');
    expect(cropBtn(shown).getAttribute('aria-haspopup')).to.equal('dialog');
    expect(cropBtn(shown).hidden).to.equal(false);
    expect(getComputedStyle(cropBtn(shown)).display).to.not.equal('none');
    // no source: no adapter + no preview-src → hidden; an adapter appears → shown
    const noSrc = mk({ ...CROPPABLE, value: 'm1' }, { adapter: null }).el;
    expect(cropBtn(noSrc).hidden).to.equal(true);
    expect(getComputedStyle(cropBtn(noSrc)).display).to.equal('none');
    noSrc.adapter = createMockAdapter({ manual: true });
    expect(cropBtn(noSrc).hidden).to.equal(false);
    noSrc.adapter = null;
    expect(cropBtn(noSrc).hidden).to.equal(true);
    // video / file → hidden; empty → hidden; not croppable → none
    expect(cropBtn(mk({ ...CROPPABLE, value: 'm4', kind: 'video', 'preview-src': '/test/fixtures/2.svg', 'accept-kind': 'video' }).el).hidden).to.equal(true);
    const empty = mk({ ...CROPPABLE }).el;
    expect(cropBtn(empty).hidden).to.equal(true);
    expect(cropBtn(mk({ name: 'x', usage: true, value: 'm1', 'preview-src': '/test/fixtures/1.svg' }).el)).to.equal(null);
    // value set by code → the button follows
    empty.setSelection({ assetId: 'm2', asset: asset('m2') });
    expect(cropBtn(empty).hidden).to.equal(false);
    empty.setAttribute('disabled', '');
    expect(cropBtn(empty).disabled).to.equal(true);
  });

  it('crop preview: croppable + ratio + a crop of the same pixel ratio → the image rect shows exactly the crop (± 1 px); else cover', async () => {
    const { el } = mk({ ...CROPPABLE, value: 'm1', crop: '{"v":1,"x":0.25,"y":0.25,"width":0.5,"height":0.5}', 'preview-src': '/test/fixtures/1.svg' }, { adapter: null });
    const img = q(el, 'img');
    await until(() => img.complete && img.naturalWidth > 0, 4000, 'img decoded');
    await until(() => img.style.getPropertyValue('--_td-mf-crop-w') !== '', 4000, 'preview vars');
    await frame();
    const rect = () => {
      const b = openBtn(el).getBoundingClientRect();
      const r = img.getBoundingClientRect();
      return { b, r };
    };
    let { b, r } = rect();
    const near = (x, y) => Math.abs(x - y) <= 1;
    // crop x .25 w .5 → the image is 2× the frame, shifted by half the frame
    expect(near(r.width, b.width * 2) && near(r.height, b.height * 2), `${r.width}×${r.height} vs ${b.width}×${b.height}`).to.equal(true);
    expect(near(r.left, b.left - b.width * 0.5) && near(r.top, b.top - b.height * 0.5)).to.equal(true);
    expect([...img.style].sort()).to.deep.equal(['--_td-mf-crop-h', '--_td-mf-crop-w', '--_td-mf-crop-x', '--_td-mf-crop-y']);
    // a crop whose pixel ratio is off the frame's by > 2 % → cover (vars removed, no style attribute left)
    el.setAttribute('crop', '{"v":1,"x":0,"y":0,"width":0.5,"height":1}');
    expect(img.hasAttribute('style')).to.equal(false);
    ({ b, r } = rect());
    expect(near(r.width, b.width) && near(r.height, b.height) && near(r.left, b.left)).to.equal(true);
    expect(getComputedStyle(img).objectFit).to.equal('cover');
    // not croppable: never (v0.34 display)
    const plain = mk({ name: 'p', usage: true, 'aspect-ratio': '3/2', value: 'm1', crop: '{"v":1,"x":0.25,"y":0.25,"width":0.5,"height":0.5}', 'preview-src': '/test/fixtures/1.svg' }).el;
    expect(q(plain, 'img').hasAttribute('style')).to.equal(false);
  });

  it('crop preview uses asset.width/height when known (picker outcome), vars removed on disconnect, back on re-connect', async () => {
    const t = mk({ ...CROPPABLE });
    openBtn(t.el).click();
    opens[0].resolve(picked('m2', { crop: { normalized: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 } } }));
    await until(() => t.el.value === 'm2');
    const img = q(t.el, 'img');
    expect(img.style.getPropertyValue('--_td-mf-crop-x').trim()).to.equal('0.5');
    const form = t.form;
    t.el.remove();
    expect(img.hasAttribute('style')).to.equal(false);
    form.appendChild(t.el);
    expect(q(t.el, 'img') === img, 'same img (re-bound in place)').to.equal(true);
    expect(img.style.getPropertyValue('--_td-mf-crop-x').trim()).to.equal('0.5');
  });
});

describe('td-media-field v0.35 — "Cắt ảnh" dialog rows (table 28b rows 5, 6)', () => {
  it('row 5: dialog "Áp dụng", changed → serializeCrop / serializeFocal FIRST, then input + change; focus back on "Cắt ảnh"; title has the ratio once', async () => {
    const t = mk({ ...CROPPABLE, value: 'm1', crop: CROP_A, focal: FOCAL_A, 'preview-src': '/test/fixtures/1.svg' }, { adapter: null });
    let stateAtEvent = null;
    t.el.addEventListener('input', () => { stateAtEvent = fd(t.form); });
    const d = await openCrop(t.el);
    expect(titleOf(d)).to.equal('Cắt ảnh · 3:2');
    expect(titleOf(d).split('3:2').length - 1, 'ratio once').to.equal(1);
    const cr = cropperOf(d);
    expect(cr.getAttribute('aspect-ratio')).to.equal('3/2');
    expect(cr.hasAttribute('focal-point')).to.equal(true);
    expect(cr.focalPoint).to.deep.equal({ x: 0.25, y: 0.75 });
    await applyWith(d, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, { x: 0.1, y: 0.2 });
    await until(() => t.c.change === 1, 4000, 'change');
    const crop = entry(t.form, 'og[crop]');
    expect(near6(crop, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }), crop).to.equal(true);
    expect(crop, 'UI path = serializeCrop format').to.equal(serializeCrop(parseCrop(crop).crop));
    expectState(t, 'og', { crop, focal: serializeFocal({ x: 0.1, y: 0.2 }), events: 1 });
    expect(stateAtEvent, 'state updated before the event').to.deep.equal(fd(t.form));
    expect(document.activeElement === cropBtn(t.el), 'focus on Cắt ảnh').to.equal(true);
  });

  it('row 5b: "Áp dụng" on the whole image (free ratio) → crop null; focal off → name[focal] absent; input + change', async () => {
    const t = mk({ name: 'og', usage: true, croppable: true, 'crop-ratio': 'free', 'aspect-ratio': '3/2', value: 'm1', crop: CROP_A, 'preview-src': '/test/fixtures/1.svg' }, { adapter: null });
    const d = await openCrop(t.el);
    expect(titleOf(d)).to.equal('Cắt ảnh');
    expect(cropperOf(d).hasAttribute('aspect-ratio')).to.equal(false);
    await applyWith(d, { x: 0, y: 0, width: 1, height: 1 });
    await until(() => t.c.change === 1, 4000, 'change');
    expectState(t, 'og', { crop: null, events: 1 });
  });

  it('row 6: "Huỷ" → nothing (raw bytes kept, no event); unchanged "Áp dụng" → nothing either', async () => {
    const t = mk({ ...CROPPABLE, value: 'm1', crop: CROP_B, focal: FOCAL_B, 'preview-src': '/test/fixtures/1.svg' }, { adapter: null });
    let d = await openCrop(t.el);
    cancelBtn(d).click();
    await dialogGone();
    expectState(t, 'og', { crop: CROP_B, focal: FOCAL_B, events: 0 });
    d = await openCrop(t.el);
    applyBtn(d).click();
    await dialogGone();
    await tick();
    expectState(t, 'og', { crop: CROP_B, focal: FOCAL_B, events: 0 });
    // Escape = cancel too
    d = await openCrop(t.el);
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await dialogGone();
    expectState(t, 'og', { crop: CROP_B, focal: FOCAL_B, events: 0 });
  });

  it('double-open lock shared with the picker; field removed while the dialog is open → dialog closed, no event', async () => {
    const t = mk({ ...CROPPABLE, value: 'm1', crop: CROP_B, 'preview-src': '/test/fixtures/1.svg' }); // adapter: the picker could open
    const d = await openCrop(t.el);
    cropBtn(t.el).click();
    q(t.el, '.td-media-field__replace').click();
    openBtn(t.el).click();
    expect(opens.length, 'picker not opened while cropping').to.equal(0);
    expect(dialogRoots().length).to.equal(1);
    cropperOf(d).crop = { normalized: { x: 0, y: 0, width: 0.5, height: 0.5 } };
    t.el.remove();
    await dialogGone();
    for (let i = 0; i < 5; i++) await tick();
    expect(t.c.input + t.c.change).to.equal(0);
    expect(t.el.selection[0].usage.crop).to.deep.equal(N(CROP_B));
  });
});

describe('td-media-field v0.35 — un-cropped source of the crop dialog (decision 28a)', () => {
  it('adapter + SSR field (no asset yet) → get(value) exactly once (aria-busy meanwhile), dialog uses urls.preview + natural-* (not preview-src)', async () => {
    const man = createMockAdapter({ manual: true });
    const t = mk({ ...CROPPABLE, value: 'm1', crop: CROP_B, 'preview-src': '/test/fixtures/3.svg' }, { adapter: man });
    expect(man.calls.get.length, 'SSR preview → no lazy get').to.equal(0);
    cropBtn(t.el).click();
    expect(man.calls.get.length).to.equal(1);
    expect(man.calls.get[0].args[0]).to.equal('m1');
    expect(cropBtn(t.el).getAttribute('aria-busy')).to.equal('true');
    cropBtn(t.el).click(); // while waiting: no second get
    expect(man.calls.get.length).to.equal(1);
    man.calls.get[0].resolve();
    const d = await dialogReady();
    expect(cropBtn(t.el).hasAttribute('aria-busy')).to.equal(false);
    const cr = cropperOf(d);
    const abs = (u) => new URL(u, document.baseURI).href;
    expect(abs(cr.getAttribute('src'))).to.equal(abs(asset('m1').urls.preview));
    expect(abs(cr.getAttribute('src'))).to.not.equal(abs('/test/fixtures/3.svg'));
    expect(cr.getAttribute('natural-width')).to.equal('1200');
    expect(cr.getAttribute('natural-height')).to.equal('800');
    cancelBtn(d).click();
    await dialogGone();
    expect(t.el.selection[0].asset.id, 'the fetched asset is kept').to.equal('m1');
    cropBtn(t.el).click(); // asset with width / height now → no second get
    const d2 = await dialogReady();
    expect(man.calls.get.length).to.equal(1);
    cancelBtn(d2).click();
    await dialogGone();
    expectState(t, 'og', { crop: CROP_B, focal: null, events: 0 });
  });

  it('get rejects → no dialog; the error is TEXT in the status region (userMessage, else the label); retry possible', async () => {
    const man = createMockAdapter({ manual: true });
    const t = mk({ ...CROPPABLE, value: 'm1', 'preview-src': '/test/fixtures/1.svg' }, { adapter: man });
    cropBtn(t.el).click();
    const msg = '<img src=x onerror="window.__mfCropXss=1">Không có quyền';
    man.calls.get[0].reject(Object.assign(new Error('secret tok_123'), { code: 'forbidden', userMessage: msg }));
    const status = q(t.el, '.td-media-field__status');
    await until(() => status.textContent !== '', 4000, 'status text');
    expect(status.getAttribute('role')).to.equal('status');
    expect(status.textContent).to.equal(msg);
    expect(status.children.length).to.equal(0);
    expect(dialogRoots().length).to.equal(0);
    expect(cropBtn(t.el).hasAttribute('aria-busy')).to.equal(false);
    expect(warns.some((w) => w.includes('tok_123'))).to.equal(false);
    cropBtn(t.el).click();
    expect(status.textContent, 'cleared on retry').to.equal('');
    man.calls.get[1].reject(new Error('x'));
    await until(() => status.textContent === TdMediaField.labels.cropError, 4000, 'label');
    expect(dialogRoots().length).to.equal(0);
    expect(window.__mfCropXss).to.equal(undefined);
    expectState(t, 'og', { crop: null, focal: null, events: 0 });
  });

  it('value changes while get is pending → aborted (signal), lock released, no dialog — even if the adapter ignores the signal', async () => {
    const man = createMockAdapter({ manual: true });
    man.ignoreSignal = true;
    const t = mk({ ...CROPPABLE, value: 'm1', 'preview-src': '/test/fixtures/1.svg' }, { adapter: man });
    cropBtn(t.el).click();
    t.el.value = 'm2';
    expect(man.calls.get[0].signal.aborted).to.equal(true);
    expect(cropBtn(t.el).hasAttribute('aria-busy')).to.equal(false);
    man.calls.get[0].resolve();
    for (let i = 0; i < 5; i++) await tick();
    expect(dialogRoots().length).to.equal(0);
    // the lock is free again: the picker opens
    q(t.el, '.td-media-field__replace').click();
    expect(opens.length).to.equal(1);
    expectState(t, 'og', { crop: null, focal: null, events: 0 });
  });

  it('field disconnected while get is pending → aborted, no dialog', async () => {
    const man = createMockAdapter({ manual: true });
    const t = mk({ ...CROPPABLE, value: 'm1', 'preview-src': '/test/fixtures/1.svg' }, { adapter: man });
    cropBtn(t.el).click();
    t.el.remove();
    expect(man.calls.get[0].signal.aborted).to.equal(true);
    for (let i = 0; i < 5; i++) await tick();
    expect(dialogRoots().length).to.equal(0);
  });

  it('no adapter → preview-src, NO natural size (result without pixels: only normalized is submitted)', async () => {
    const t = mk({ ...CROPPABLE, value: 'm1', 'preview-src': '/test/fixtures/2.svg' }, { adapter: null });
    const d = await openCrop(t.el);
    const cr = cropperOf(d);
    expect(new URL(cr.getAttribute('src'), document.baseURI).pathname).to.equal('/test/fixtures/2.svg');
    expect(cr.hasAttribute('natural-width') || cr.hasAttribute('natural-height')).to.equal(false);
    expect(cr.getResult().crop.pixels).to.equal(undefined);
    await applyWith(d, { x: 0, y: 0.5, width: 0.5, height: 0.5 });
    await until(() => t.c.change === 1);
    const crop = entry(t.form, 'og[crop]');
    expect(near6(crop, { x: 0, y: 0.5, width: 0.5, height: 0.5 }), crop).to.equal(true);
    expect(Object.keys(JSON.parse(crop))).to.deep.equal(['v', 'x', 'y', 'width', 'height']);
  });

  it('known size + a preview of another ratio (pre-cropped) → dialog error "ratio", "Áp dụng" disabled; Huỷ keeps the raw bytes', async () => {
    const square = {
      list: ad.list,
      get: (id, o) => ad.get(id, o).then((a) => ({ ...a, urls: { thumbnail: '/test/fixtures/square.svg', preview: '/test/fixtures/square.svg' } })),
    };
    const t = mk({ ...CROPPABLE, value: 'm1', crop: CROP_B, 'preview-src': '/test/fixtures/1.svg' }, { adapter: square });
    const d = await openCrop(t.el);
    const cr = cropperOf(d);
    expect(cr.getAttribute('data-state')).to.equal('error');
    expect(cr.getAttribute('data-error')).to.equal('ratio');
    expect(applyBtn(d).disabled).to.equal(true);
    applyBtn(d).click();
    expect(dialogRoots().length).to.equal(1);
    cancelBtn(d).click();
    await dialogGone();
    expectState(t, 'og', { crop: CROP_B, focal: null, events: 0 });
  });
});

describe('td-media-field v0.35 — REAL picker + crop step on the same asset', () => {
  it('re-pick the same asset via the picker, crop in its step (croppable) → asset / preview refreshed, new crop + focal; input + change', async () => {
    const t = mk({ ...CROPPABLE, value: 'm59', crop: CROP_B, focal: FOCAL_B, 'preview-src': '/test/fixtures/1.svg', 'preview-alt': 'cũ' });
    TdMediaPicker.open = realOpen;
    q(t.el, '.td-media-field__replace').click();
    const root = () => document.body.querySelector(':scope > .td-media-picker');
    const confirm = () => root()?.querySelector('.td-media-picker__confirm');
    await until(() => confirm() && !confirm().hasAttribute('disabled'), 4000, 'm59 preselected');
    confirm().click();
    const d = await dialogReady();
    expect(d.classList.contains('td-crop-dialog--nested')).to.equal(true);
    expect(titleOf(d).split('3:2').length - 1).to.equal(1);
    await applyWith(d, { x: 0, y: 0, width: 0.5, height: 0.5 }, { x: 0.4, y: 0.6 });
    await until(() => t.c.change === 1, 4000, 'change');
    expect(q(t.el, 'img').getAttribute('src')).to.equal(new URL(asset('m59').urls.preview, document.baseURI).href);
    expect(q(t.el, '.td-sr-only').textContent).to.equal(`Đã chọn: ${asset('m59').name}`);
    const crop = entry(t.form, 'og[crop]');
    expect(near6(crop, { x: 0, y: 0, width: 0.5, height: 0.5 }), crop).to.equal(true);
    expectState(t, 'og', { crop, focal: serializeFocal({ x: 0.4, y: 0.6 }), events: 1 });
  });
});

// Codex review v0.35 round 1: #2 (SEC medium, TOCTOU — a cached asset / an open crop dialog of an OLD adapter or context
// must never feed the crop dialog after a source change) and #3 (same asset: null crop ≡ whole image).
describe('td-media-field v0.35 — review R1 #2: crop source provenance (adapter / context / source generation)', () => {
  /** crop click → get resolves → dialog → Huỷ: the field now caches the asset (with width / height). */
  async function cacheAsset(t, man) {
    cropBtn(t.el).click();
    man.calls.get[man.calls.get.length - 1].resolve();
    const d = await dialogReady();
    cancelBtn(d).click();
    await dialogGone();
  }

  it('context change after the asset is cached → the next "Cắt ảnh" calls get() again with the new context', async () => {
    const man = createMockAdapter({ manual: true });
    const t = mk({ ...CROPPABLE, value: 'm1', crop: CROP_B, 'preview-src': '/test/fixtures/3.svg' }, { adapter: man });
    t.el.pickerOptions = { context: 'tenant-a' };
    await cacheAsset(t, man);
    expect(man.calls.get.length).to.equal(1);
    t.el.pickerOptions = { context: 'tenant-b' };
    cropBtn(t.el).click();
    expect(man.calls.get.length, 'cached asset of the old context is not reused').to.equal(2);
    expect(man.calls.get[1].args[1].context).to.equal('tenant-b');
    man.calls.get[1].resolve();
    const d = await dialogReady();
    cancelBtn(d).click();
    await dialogGone();
    expectState(t, 'og', { crop: CROP_B, focal: null, events: 0 });
  });

  it('adapter change after the asset is cached → get() on the NEW adapter, never the cached asset of the old one', async () => {
    const a1 = createMockAdapter({ manual: true });
    const a2 = createMockAdapter({ manual: true });
    const t = mk({ ...CROPPABLE, value: 'm1', 'preview-src': '/test/fixtures/3.svg' }, { adapter: a1 });
    await cacheAsset(t, a1);
    t.el.adapter = a2;
    cropBtn(t.el).click();
    expect(a1.calls.get.length).to.equal(1);
    expect(a2.calls.get.length).to.equal(1);
    a2.calls.get[0].resolve();
    const d = await dialogReady();
    cancelBtn(d).click();
    await dialogGone();
  });

  it('source change while the crop dialog is OPEN → the dialog closes, lock released, no event', async () => {
    const man = createMockAdapter({ manual: true });
    const t = mk({ ...CROPPABLE, value: 'm1', crop: CROP_B, 'preview-src': '/test/fixtures/3.svg' }, { adapter: man });
    cropBtn(t.el).click();
    man.calls.get[0].resolve();
    const d = await dialogReady();
    cropperOf(d).crop = { normalized: { x: 0, y: 0, width: 0.5, height: 0.5 } };
    t.el.pickerOptions = { context: 'other' };
    await dialogGone();
    q(t.el, '.td-media-field__replace').click();
    expect(opens.length, 'double-open lock released').to.equal(1);
    expectState(t, 'og', { crop: CROP_B, focal: null, events: 0 });
  });

  it('old adapter IGNORING its abort signal resolves after a context change → no dialog; the next click fetches again', async () => {
    const man = createMockAdapter({ manual: true });
    man.ignoreSignal = true;
    const t = mk({ ...CROPPABLE, value: 'm1', 'preview-src': '/test/fixtures/3.svg' }, { adapter: man });
    cropBtn(t.el).click();
    t.el.pickerOptions = { context: 'other' };
    man.calls.get[0].resolve();
    for (let i = 0; i < 5; i++) await tick();
    expect(dialogRoots().length).to.equal(0);
    cropBtn(t.el).click();
    expect(man.calls.get.length, 'the late result was not cached as the crop source').to.equal(2);
    expect(man.calls.get[1].args[1].context).to.equal('other');
    man.calls.get[1].resolve();
    const d = await dialogReady();
    cancelBtn(d).click();
    await dialogGone();
  });
});

describe('td-media-field v0.35 — review R1 #3: same asset, null crop ≡ whole image', () => {
  const WHOLE = '{"v":1,"x":0,"y":0,"width":1,"height":1}';
  it('field crop null + picker returns the whole image {0,0,1,1} → no event, crop stays null', async () => {
    const t = mk({ ...CROPPABLE, value: 'm1', 'preview-src': '/test/fixtures/3.svg' });
    q(t.el, '.td-media-field__replace').click();
    opens[0].resolve(picked('m1', { crop: { normalized: { x: 0, y: 0, width: 1, height: 1 }, aspectRatio: 1.5 } }));
    await until(() => q(t.el, '.td-sr-only').textContent === `Đã chọn: ${asset('m1').name}`);
    await tick();
    expectState(t, 'og', { crop: null, focal: null, events: 0 });
  });

  it('field crop = whole image (server bytes) + picker returns null → no event, the raw string kept byte-identical', async () => {
    const t = mk({ ...CROPPABLE, value: 'm1', crop: WHOLE, 'preview-src': '/test/fixtures/3.svg' });
    q(t.el, '.td-media-field__replace').click();
    opens[0].resolve(picked('m1', { crop: null }));
    await until(() => q(t.el, '.td-sr-only').textContent === `Đã chọn: ${asset('m1').name}`);
    await tick();
    expectState(t, 'og', { crop: WHOLE, focal: null, events: 0 });
  });
});

// Codex security review v0.35 round 2 (TOCTOU, medium): path 1 — a preview URL produced by an adapter that is no longer
// the source must never become the no-adapter crop source; path 2 — a picker opened under an old adapter / context can
// never commit.
describe('td-media-field v0.35 — review R2 path 1: adapter-derived preview vs the explicit preview-src', () => {
  const abs = (u) => new URL(u, document.baseURI).href;

  it('adapter A fills the preview (no preview-src) → adapter removed → no crop source at all (A’s URL is not trusted)', async () => {
    const a = createMockAdapter({ manual: true });
    const t = mk({ ...CROPPABLE, value: 'm1' }, { adapter: a });
    await until(() => a.calls.get.length === 1, 4000, 'lazy get');
    a.calls.get[0].resolve();
    await until(() => q(t.el, 'img'), 4000, 'preview from A');
    expect(cropBtn(t.el).hidden).to.equal(false);
    t.el.adapter = null;
    expect(cropBtn(t.el).hidden, 'no adapter + no explicit preview-src → no crop source').to.equal(true);
    cropBtn(t.el).click();
    for (let i = 0; i < 5; i++) await tick();
    expect(dialogRoots().length).to.equal(0);
    expect(q(t.el, 'img'), 'A’s preview cleared').to.equal(null);
  });

  it('explicit preview-src + adapter A → crop get swaps in A’s urls.preview → adapter removed → the dialog uses preview-src again', async () => {
    const a = createMockAdapter({ manual: true });
    const t = mk({ ...CROPPABLE, value: 'm1', 'preview-src': '/test/fixtures/3.svg' }, { adapter: a });
    cropBtn(t.el).click();
    a.calls.get[0].resolve();
    const d = await dialogReady();
    expect(abs(cropperOf(d).getAttribute('src'))).to.equal(abs(asset('m1').urls.preview));
    cancelBtn(d).click();
    await dialogGone();
    t.el.adapter = null;
    expect(abs(q(t.el, 'img').getAttribute('src')), 'explicit preview restored').to.equal(abs('/test/fixtures/3.svg'));
    const d2 = await openCrop(t.el);
    expect(abs(cropperOf(d2).getAttribute('src'))).to.equal(abs('/test/fixtures/3.svg'));
    expect(cropperOf(d2).hasAttribute('natural-width'), 'no natural size from the invalidated adapter').to.equal(false);
    cancelBtn(d2).click();
    await dialogGone();
  });

  it('defaults adapter → defaults removed → the same rule (explicit preview-src only)', async () => {
    const a = createMockAdapter({ manual: true });
    TdMediaPicker.configureDefaults({ adapter: a });
    try {
      const t = mk({ ...CROPPABLE, value: 'm1', 'preview-src': '/test/fixtures/2.svg' }, { adapter: null });
      cropBtn(t.el).click();
      a.calls.get[0].resolve();
      const d = await dialogReady();
      cancelBtn(d).click();
      await dialogGone();
      TdMediaPicker.configureDefaults({});
      const d2 = await openCrop(t.el);
      expect(abs(cropperOf(d2).getAttribute('src'))).to.equal(abs('/test/fixtures/2.svg'));
      cancelBtn(d2).click();
      await dialogGone();
    } finally {
      TdMediaPicker.configureDefaults({});
    }
  });
});

describe('td-media-field v0.35 — review R2 path 2: a picker of an old source never commits', () => {
  for (const [what, change] of [['context', (el) => { el.pickerOptions = { context: 'other' }; }],
    ['adapter', (el) => { el.adapter = createMockAdapter(); }]]) {
    it(`${what} change while the field's picker is open → the old outcome is ignored (field unchanged, no event)`, async () => {
      const t = mk({ ...CROPPABLE, value: 'm1', crop: CROP_B, 'preview-src': '/test/fixtures/3.svg' });
      q(t.el, '.td-media-field__replace').click();
      expect(opens.length).to.equal(1);
      change(t.el);
      opens[0].resolve(picked('m2', { crop: { normalized: { x: 0, y: 0, width: 0.5, height: 0.5 } } }));
      for (let i = 0; i < 5; i++) await tick();
      expect(t.el.value).to.equal('m1');
      expectState(t, 'og', { crop: CROP_B, focal: null, events: 0 });
      q(t.el, '.td-media-field__replace').click();
      expect(opens.length, 'lock released').to.equal(2);
    });
  }

  it('REAL picker: a source change closes the open picker (cancelled / programmatic), the field is unchanged', async () => {
    TdMediaPicker.open = realOpen;
    const t = mk({ ...CROPPABLE, value: 'm1', crop: CROP_B, 'preview-src': '/test/fixtures/3.svg' });
    q(t.el, '.td-media-field__replace').click();
    await until(() => document.querySelector('body > .td-media-picker[data-state="open"]'), 4000, 'picker open');
    t.el.pickerOptions = { context: 'other' };
    await until(() => !document.querySelector('body > .td-media-picker'), 4000, 'picker closed');
    expectState(t, 'og', { crop: CROP_B, focal: null, events: 0 });
  });
});

// Codex security review v0.35 round 3: no interactive picker of an old source may stay open.
describe('td-media-field v0.35 — review R3: the field’s picker never outlives its source', () => {
  const pickerGone = () => until(() => !document.querySelector('body > .td-media-picker') && !document.querySelector('body > td-media-picker'),
    4000, 'picker closed');

  it('field removed while a REAL picker is open → the picker is closed (no old-context picker left)', async () => {
    TdMediaPicker.open = realOpen;
    const t = mk({ ...CROPPABLE, value: 'm1', 'preview-src': '/test/fixtures/3.svg' });
    q(t.el, '.td-media-field__replace').click();
    await until(() => document.querySelector('body > .td-media-picker[data-state="open"]'), 4000, 'picker open');
    t.form.remove();
    await pickerGone();
  });

  for (const [what, trigger] of [
    ['field.adapter swap', (el) => { el.adapter = createMockAdapter(); }],
    ['configureDefaults', () => { TdMediaPicker.configureDefaults({ context: 'switched' }); }],
  ]) {
    it(`adapter list() synchronously changing the source during picker startup (${what}) → picker closed at once, no commit`, async () => {
      TdMediaPicker.open = realOpen;
      const base = createMockAdapter();
      let fired = false;
      let el;
      const reentrant = {
        ...base,
        list: (req) => {
          if (!fired) { fired = true; trigger(el); }
          return base.list(req);
        },
        get: (id, o) => base.get(id, o),
      };
      try {
        const t = mk({ ...CROPPABLE, value: 'm1', crop: CROP_B, 'preview-src': '/test/fixtures/3.svg' }, { adapter: reentrant });
        el = t.el;
        q(t.el, '.td-media-field__replace').click();
        expect(fired, 'list() ran during open()').to.equal(true);
        await pickerGone();
        expectState(t, 'og', { crop: CROP_B, focal: null, events: 0 });
        expect(t.el.value).to.equal('m1');
      } finally {
        TdMediaPicker.configureDefaults({});
      }
    });
  }
});

// Codex impl re-review v0.35 round 3, ISSUE-9: the crop image may never change under an open crop dialog.
describe('td-media-field v0.35 — ISSUE-9: a change of the effective crop image closes the crop dialog', () => {
  const abs = (u) => new URL(u, document.baseURI).href;
  async function expectClosedThenReusable(t) {
    await dialogGone();
    expectState(t, 'og', { crop: CROP_B, focal: null, events: 0 });
    const d = await openCrop(t.el); // lock released: the dialog opens again, on the NEW image
    cancelBtn(d).click();
    await dialogGone();
    return d;
  }

  it('no adapter: preview-src mutated while the dialog is open → dialog closes, nothing commits, lock released', async () => {
    const t = mk({ ...CROPPABLE, value: 'm1', crop: CROP_B, 'preview-src': '/test/fixtures/2.svg' }, { adapter: null });
    const d = await openCrop(t.el);
    cropperOf(d).crop = { normalized: { x: 0, y: 0, width: 0.5, height: 0.5 } };
    t.el.setAttribute('preview-src', '/test/fixtures/3.svg');
    const d2 = await expectClosedThenReusable(t);
    expect(abs(cropperOf(d2).getAttribute('src'))).to.equal(abs('/test/fixtures/3.svg'));
  });

  it('same-ID setSelection() replacement (other preview) while the dialog is open → dialog closes, nothing commits', async () => {
    const t = mk({ ...CROPPABLE, value: 'm1', crop: CROP_B, 'preview-src': '/test/fixtures/2.svg' }, { adapter: null });
    const d = await openCrop(t.el);
    cropperOf(d).crop = { normalized: { x: 0, y: 0, width: 0.5, height: 0.5 } };
    const a = asset('m1');
    a.urls.preview = '/test/fixtures/4.svg';
    t.el.setSelection([{ assetId: 'm1', asset: a, usage: { altText: '', crop: parseCrop(CROP_B).crop, focalPoint: null } }]);
    await dialogGone();
    expect(t.c.input + t.c.change, 'no event').to.equal(0);
    expect(dialogRoots().length).to.equal(0);
    const d2 = await openCrop(t.el);
    expect(abs(cropperOf(d2).getAttribute('src'))).to.equal(abs('/test/fixtures/4.svg'));
    cancelBtn(d2).click();
    await dialogGone();
  });
});
