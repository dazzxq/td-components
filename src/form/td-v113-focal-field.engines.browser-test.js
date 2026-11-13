import { expect } from '@esm-bundle/chai';
// DOM nodes are compared as booleans (`a === b`): chai serialising DOM nodes on failure hangs the runner.
import './td-media-field.js';
import './td-media-gallery.js';
import { TdMediaPicker } from '../feedback/td-media-picker.js';
import { resolveOptions } from '../utils/media-picker-core.js';
import { createMockAdapter } from '../../test/fixtures/media-adapter.js';
import { serializeFocal } from '../utils/media-field-model.js';

// v0.113.0 (plan docs/internal/plans/v0.113.0-focal-only-mode.md QĐ3 / QĐ3b / QĐ4 / QĐ4a / QĐ4b) — `crop-mode="focal"`
// on <td-media-field> / <td-media-gallery> and `crop: { mode: 'focal' }` of the picker core, in Chromium, Firefox AND
// WebKit: FormData `[crop]` always null + `[focal]` JSON v1 (implied focal-point), an incoming crop ignored (kept on the
// attribute: `box` shows it again), the "Điểm trọng tâm" label, the picker options of the field, no crop preview.
// The picker is STUBBED (TdMediaPicker.open replaced by a controllable deferred). The crop dialog's focal UI is the
// cropper lane's: the re-edit test only reads the dialog's input (title, cropper focal point) and applies through the
// cropper properties, never the pointer UI. Waits are real signals, polled — never a fixed sleep.
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
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };
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
const FOCAL_A = '{"v":1,"x":0.25,"y":0.75}';
const FOCAL_MODE = { name: 'og', usage: true, croppable: true, 'crop-mode': 'focal' };

const box = document.createElement('div');
box.style.width = '600px'; // test page only
document.body.appendChild(box);

function mount(tag, attrs, adapter) {
  const form = document.createElement('form');
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  if (adapter) el.adapter = adapter;
  form.appendChild(el);
  box.appendChild(form);
  const c = { input: 0, change: 0 };
  el.addEventListener('input', () => { c.input++; });
  el.addEventListener('change', () => { c.change++; });
  return { form, el, c };
}
const fd = (form) => [...new FormData(form)].map(([k, v]) => [k, String(v)]);
const entry = (form, k) => fd(form).find(([n]) => n === k)?.[1];
const keys = (form) => fd(form).map(([k]) => k);

const dialogRoots = () => [...document.body.querySelectorAll(':scope > .td-crop-dialog')];
const openDialog = () => dialogRoots().find((r) => r.getAttribute('data-state') === 'open') || null;
const cropperOf = (d) => d.querySelector('td-cropper');
async function dialogReady() {
  const d = await until(() => openDialog(), 4000, 'crop dialog open');
  const cr = cropperOf(d);
  await until(() => cr.getAttribute('data-state') === 'ready' || cr.getAttribute('data-state') === 'error', 4000, 'cropper ready');
  return d;
}
const dialogGone = () => until(() => dialogRoots().length === 0, 4000, 'crop dialog closed');

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
  for (const b of document.body.querySelectorAll(':scope > .td-modal[data-state="open"] .td-modal__close')) b.click();
  await until(() => dialogRoots().length === 0 && !document.body.querySelector(':scope > .td-media-picker'), 4000, 'overlays gone');
});

describe('td-media-field crop-mode="focal" (v0.113.0)', () => {
  const field = (attrs = {}, adapter = ad) => mount('td-media-field', { ...FOCAL_MODE, 'preview-src': '/test/fixtures/1.svg', ...attrs }, adapter);
  const cropBtn = (el) => el.querySelector('.td-media-field__crop-btn');
  const img = (el) => el.querySelector('img.td-media-field__img');

  it('FormData: [crop] null + [focal] JSON v1 without the focal-point attribute; the incoming crop is ignored', async () => {
    const t = field({ value: 'm1', crop: CROP_A, focal: FOCAL_A });
    await settle();
    expect(keys(t.form)).to.deep.equal(['og[id]', 'og[alt]', 'og[crop]', 'og[focal]']);
    expect(entry(t.form, 'og[crop]')).to.equal('null');
    expect(entry(t.form, 'og[focal]')).to.equal(FOCAL_A);
    expect(t.el.selection[0].usage.crop).to.equal(null);
    expect(t.el.selection[0].usage.focalPoint).to.deep.equal({ x: 0.25, y: 0.75 });
    expect(t.el.getAttribute('crop'), 'the attribute is never deleted').to.equal(CROP_A);
    expect(warns).to.deep.equal([]);
  });

  it('no focal yet → [focal] null', async () => {
    const t = field({ value: 'm1' });
    await settle();
    expect(entry(t.form, 'og[crop]')).to.equal('null');
    expect(entry(t.form, 'og[focal]')).to.equal('null');
  });

  it('the crop button reads "Điểm trọng tâm"; switching back to box restores "Cắt ảnh", the crop and drops the implied [focal]', async () => {
    const t = field({ value: 'm1', crop: CROP_A, focal: FOCAL_A });
    await settle();
    const b = cropBtn(t.el);
    expect(!!b).to.equal(true);
    expect(b.title).to.equal('Điểm trọng tâm');
    expect(b.querySelector('.td-sr-only').textContent).to.equal('Điểm trọng tâm');
    t.el.setAttribute('crop-mode', 'box');
    expect(cropBtn(t.el) === b, 'repainted in place').to.equal(true);
    expect(b.title).to.equal('Cắt ảnh');
    expect(b.querySelector('.td-sr-only').textContent).to.equal('Cắt ảnh');
    expect(entry(t.form, 'og[crop]')).to.equal(CROP_A);
    expect(keys(t.form)).to.deep.equal(['og[id]', 'og[alt]', 'og[crop]']);
    t.el.setAttribute('crop-mode', ' FOCAL ');
    expect(b.title).to.equal('Điểm trọng tâm');
    expect(entry(t.form, 'og[crop]')).to.equal('null');
    expect(entry(t.form, 'og[focal]')).to.equal(FOCAL_A);
    expect(t.c.input + t.c.change, 'attribute changes are silent').to.equal(0);
  });

  it('no crop preview: the <img> carries no crop vars and no view wrapper, even with a crop attribute', async () => {
    const t = field({ value: 'm1', crop: CROP_A, focal: FOCAL_A });
    await until(() => img(t.el) && img(t.el).complete, 4000, 'preview loaded');
    await settle();
    expect(t.el.querySelector('.td-media-field__view')).to.equal(null);
    expect(img(t.el).style.getPropertyValue('--_td-mf-crop-w')).to.equal('');
    t.el.setAttribute('crop-mode', 'box');
    await until(() => img(t.el).style.getPropertyValue('--_td-mf-crop-w') !== '', 4000, 'box → crop preview back');
  });

  it('pickerOptions: { enabled, mode: focal, allowFocalPoint, focalPoint = the current focal } (no ratio / shape)', async () => {
    const t = field({ value: 'm1', focal: FOCAL_A, 'aspect-ratio': '3/2', 'crop-ratio': '16/9', 'crop-shape': 'circle' });
    await settle();
    t.el.querySelector('.td-media-field__open').click();
    expect(opens.length).to.equal(1);
    expect(opens[0].opts.crop).to.deep.equal({ enabled: true, mode: 'focal', allowFocalPoint: true, focalPoint: { x: 0.25, y: 0.75 } });
    const r = resolveOptions({ adapter: ad }, opts(opens[0].opts)).cropResolved;
    expect(r).to.deep.equal({ aspectRatio: null, allowFocalPoint: true, mode: 'focal', shape: 'rect', focalPoint: { x: 0.25, y: 0.75 } });
    opens[0].resolve({ status: 'cancelled' });
  });

  it('pickerOptions without a focal → no focalPoint key; not croppable → { enabled: false }', async () => {
    const t = field({ value: 'm1' });
    await settle();
    t.el.querySelector('.td-media-field__open').click();
    expect(opens[0].opts.crop).to.deep.equal({ enabled: true, mode: 'focal', allowFocalPoint: true });
    opens[0].resolve({ status: 'cancelled' });
    await settle();
    const u = field({ value: 'm1', croppable: false });
    await settle();
    u.el.querySelector('.td-media-field__open').click();
    expect(opens[1].opts.crop).to.deep.equal({ enabled: false });
    expect(entry(u.form, 'og[focal]'), 'focal-point still implied').to.equal('null');
    opens[1].resolve({ status: 'cancelled' });
  });

  it('a picker outcome cannot set a crop: new asset → [crop] null + the new focal; input + change', async () => {
    const t = field({ value: 'm1', crop: CROP_A, focal: FOCAL_A });
    await settle();
    t.el.querySelector('.td-media-field__open').click();
    opens[0].resolve({
      status: 'selected',
      selection: [{ assetId: 'm2', asset: asset('m2'), usage: { altText: '', crop: { normalized: { x: 0, y: 0, width: 0.5, height: 0.5 } }, focalPoint: { x: 0.1, y: 0.2 } } }],
    });
    await until(() => t.el.value === 'm2');
    expect(entry(t.form, 'og[crop]')).to.equal('null');
    expect(entry(t.form, 'og[focal]')).to.equal(serializeFocal({ x: 0.1, y: 0.2 }));
    expect(t.el.selection[0].usage.crop).to.equal(null);
    expect([t.c.input, t.c.change]).to.deep.equal([1, 1]);
  });

  it('a picker outcome on the SAME asset with only a crop → nothing changes (no event)', async () => {
    const t = field({ value: 'm1', focal: FOCAL_A });
    await settle();
    t.el.querySelector('.td-media-field__open').click();
    opens[0].resolve({
      status: 'selected',
      selection: [{ assetId: 'm1', asset: asset('m1'), usage: { altText: '', crop: { normalized: { x: 0, y: 0, width: 0.5, height: 0.5 } }, focalPoint: { x: 0.25, y: 0.75 } } }],
    });
    await until(() => t.el.selection[0]?.asset?.id === 'm1');
    await settle();
    expect(entry(t.form, 'og[crop]')).to.equal('null');
    expect(entry(t.form, 'og[focal]')).to.equal(FOCAL_A);
    expect([t.c.input, t.c.change]).to.deep.equal([0, 0]);
  });

  it('setSelection with a usage.crop → selection / FormData crop stay null', async () => {
    const t = field({ value: 'm1' });
    await settle();
    t.el.setSelection({ assetId: 'm2', asset: asset('m2'), usage: { altText: 'a', crop: { normalized: { x: 0, y: 0, width: 0.5, height: 0.5 } }, focalPoint: { x: 0.5, y: 0.5 } } });
    expect(t.el.selection[0].usage.crop).to.equal(null);
    expect(entry(t.form, 'og[crop]')).to.equal('null');
    expect(entry(t.form, 'og[focal]')).to.equal('{"v":1,"x":0.5,"y":0.5}');
  });

  it('re-edit: the dialog opens titled "Chọn điểm trọng tâm" from the current focal; applying sets [focal], never [crop]', async () => {
    const t = field({ value: 'm1', crop: CROP_A, focal: FOCAL_A }, null);
    await settle();
    cropBtn(t.el).click();
    const d = await dialogReady();
    expect(d.querySelector('.td-modal__title').textContent).to.equal('Chọn điểm trọng tâm');
    const cr = cropperOf(d);
    expect(cr.focalPoint).to.deep.equal({ x: 0.25, y: 0.75 });
    cr.focalPoint = { x: 0.5, y: 0.4 };
    const ok = d.querySelector('.td-crop-dialog__confirm');
    await until(() => !ok.disabled, 4000, 'Áp dụng enabled');
    ok.click();
    await dialogGone();
    await until(() => t.c.change === 1, 4000, 'change');
    expect(entry(t.form, 'og[focal]')).to.equal('{"v":1,"x":0.5,"y":0.4}');
    expect(entry(t.form, 'og[crop]')).to.equal('null');
    expect(t.el.getAttribute('crop')).to.equal(CROP_A);
  });
});

/** the picker-options layer as the picker receives it (selection / crop / adapter) */
function opts(o) { return { adapter: o.adapter || ad, selection: o.selection, crop: o.crop }; }

describe('td-media-gallery crop-mode="focal" (v0.113.0)', () => {
  const ITEMS = JSON.stringify([
    { id: 'm1', src: '/test/fixtures/1.svg', name: 'Ảnh 1', crop: CROP_A, focal: FOCAL_A },
    { id: 'm2', src: '/test/fixtures/2.svg', name: 'Ảnh 2', crop: CROP_A },
  ]);
  const gallery = (attrs = {}, adapter = null) => mount('td-media-gallery', { ...FOCAL_MODE, name: 'g', items: ITEMS, ...attrs }, adapter);
  const lis = (el) => [...el.querySelectorAll('.td-media-gallery__list > li.td-media-gallery__item')];
  const cropBtn = (li) => li.querySelector('.td-media-gallery__crop-btn');

  it('FormData per tile: [i][crop] null + [i][focal] JSON v1 (implied); items[].crop ignored', async () => {
    const t = gallery();
    await settle();
    expect(keys(t.form)).to.deep.equal(['g[0][id]', 'g[0][alt]', 'g[0][crop]', 'g[0][focal]', 'g[1][id]', 'g[1][alt]', 'g[1][crop]', 'g[1][focal]']);
    expect(entry(t.form, 'g[0][crop]')).to.equal('null');
    expect(entry(t.form, 'g[1][crop]')).to.equal('null');
    expect(entry(t.form, 'g[0][focal]')).to.equal(FOCAL_A);
    expect(entry(t.form, 'g[1][focal]')).to.equal('null');
    expect(t.el.selection.map((s) => s.usage.crop)).to.deep.equal([null, null]);
    expect(t.el.selection[0].usage.focalPoint).to.deep.equal({ x: 0.25, y: 0.75 });
    expect(warns).to.deep.equal([]);
  });

  it('tile labels "Điểm trọng tâm {name}"; box → "Cắt {name}" + the crops back, focal entries gone', async () => {
    const t = gallery();
    await settle();
    const [a, b] = lis(t.el);
    expect(cropBtn(a).getAttribute('aria-label')).to.match(/^Điểm trọng tâm /);
    expect(cropBtn(a).getAttribute('aria-label')).to.include('Ảnh 1');
    expect(cropBtn(b).getAttribute('aria-label')).to.match(/^Điểm trọng tâm .*Ảnh 2/);
    t.el.setAttribute('crop-mode', 'box');
    expect(cropBtn(a).getAttribute('aria-label')).to.match(/^Cắt .*Ảnh 1/);
    expect(entry(t.form, 'g[0][crop]')).to.equal(CROP_A);
    expect(keys(t.form).some((k) => k.endsWith('[focal]'))).to.equal(false);
    t.el.setAttribute('crop-mode', 'focal');
    expect(cropBtn(a).getAttribute('aria-label')).to.match(/^Điểm trọng tâm /);
    expect(entry(t.form, 'g[0][crop]')).to.equal('null');
    expect(t.c.input + t.c.change).to.equal(0);
  });

  it('form-state restore keeps the stored crops: restored in focal, box shows them again (Codex impl r1)', async () => {
    const t = gallery();
    await settle();
    const st = { last: undefined };
    const i = t.el._internals;
    const orig = i.setFormValue.bind(i);
    i.setFormValue = (v, x) => { st.last = x; orig(v, x); };
    t.el.setAttribute('crop-mode', 'box');
    t.el.setAttribute('crop-mode', 'focal');
    expect(typeof st.last).to.equal('string');
    const r = mount('td-media-gallery', { ...FOCAL_MODE, name: 'g' }, null);
    await settle();
    r.el.formStateRestoreCallback(st.last, 'restore');
    await settle();
    expect(entry(r.form, 'g[0][crop]')).to.equal('null');
    r.el.setAttribute('crop-mode', 'box');
    expect(entry(r.form, 'g[0][crop]')).to.equal(CROP_A);
    expect(entry(r.form, 'g[1][crop]')).to.equal(CROP_A);
  });

  it('no crop preview on the tiles', async () => {
    // a 3:2 crop of the 3:2 tile (1200 × 800 image): box mode previews it
    const items = JSON.stringify([{ id: 'm1', src: '/test/fixtures/1.svg', name: 'Ảnh 1', crop: '{"v":1,"x":0,"y":0,"width":0.5,"height":0.5}' }]);
    const t = gallery({ 'aspect-ratio': '3/2', items });
    const im = () => lis(t.el)[0].querySelector('img');
    await until(() => im() && im().complete && im().naturalWidth > 0, 4000, 'tile image');
    await settle();
    for (const v of ['x', 'y', 'w', 'h']) expect(im().style.getPropertyValue(`--_td-mg-crop-${v}`), v).to.equal('');
    t.el.setAttribute('crop-mode', 'box');
    await until(() => im().style.getPropertyValue('--_td-mg-crop-w') !== '', 4000, 'box → crop preview back');
  });

  it('the Add picker stays multiple without a crop step', async () => {
    const t = gallery({}, ad);
    await settle();
    t.el.querySelector('.td-media-gallery__add').click();
    expect(opens.length).to.equal(1);
    expect(opens[0].opts.selection.mode).to.equal('multiple');
    expect(opens[0].opts.crop).to.deep.equal({ enabled: false });
    opens[0].resolve({ status: 'cancelled' });
  });

  it('re-edit a tile: dialog from the tile focal, titled "Chọn điểm trọng tâm"; applying sets [i][focal], never [i][crop]', async () => {
    const t = gallery();
    await settle();
    cropBtn(lis(t.el)[0]).click();
    const d = await dialogReady();
    expect(d.querySelector('.td-modal__title').textContent).to.equal('Chọn điểm trọng tâm');
    const cr = cropperOf(d);
    expect(cr.focalPoint).to.deep.equal({ x: 0.25, y: 0.75 });
    cr.focalPoint = { x: 0.6, y: 0.3 };
    const ok = d.querySelector('.td-crop-dialog__confirm');
    await until(() => !ok.disabled, 4000, 'Áp dụng enabled');
    ok.click();
    await dialogGone();
    await until(() => t.c.change === 1, 4000, 'change');
    expect(entry(t.form, 'g[0][focal]')).to.equal('{"v":1,"x":0.6,"y":0.3}');
    expect(entry(t.form, 'g[0][crop]')).to.equal('null');
    t.el.setAttribute('crop-mode', 'box');
    expect(entry(t.form, 'g[0][crop]'), 'the stored crop survives the focal edit').to.equal(CROP_A);
  });
});

describe('picker resolveOptions crop.mode = focal (v0.113.0)', () => {
  it('focal on without enabled, forced focal point / no ratio / rect, focalPoint clamped; enabled: false still off', () => {
    const r = (crop) => resolveOptions({ adapter: ad }, { selection: { mode: 'single' }, crop }, { warn: (m) => warns.push(m) }).cropResolved;
    expect(r({ mode: 'focal', aspectRatio: 2, shape: 'circle', allowFocalPoint: false, focalPoint: { x: 2, y: 0.5 } }))
      .to.deep.equal({ aspectRatio: null, allowFocalPoint: true, mode: 'focal', shape: 'rect', focalPoint: { x: 1, y: 0.5 } });
    expect(r({ mode: 'focal', focalPoint: 'bad' }).focalPoint).to.equal(null);
    expect(r({ mode: 'focal', enabled: false })).to.equal(null);
    expect(r({ enabled: true, mode: 'pan' })).to.deep.equal({ aspectRatio: null, allowFocalPoint: false, mode: 'pan', shape: 'rect' });
    expect(warns).to.deep.equal([]);
  });
});
