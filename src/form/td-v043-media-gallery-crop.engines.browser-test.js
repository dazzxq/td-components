import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
// DOM nodes are compared as booleans (`a === b`): chai serialising DOM nodes on failure hangs the runner.
import { TdMediaGallery } from './td-media-gallery.js';
import { TdMediaPicker } from '../feedback/td-media-picker.js';
import { createMockAdapter } from '../../test/fixtures/media-adapter.js';
import { serializeCrop, parseCrop } from '../utils/media-field-model.js';

// v0.43.0 (plan docs/internal/plans/v0.43.0-media-gallery.md M5, decisions 12, 12b, 13, 18; acceptance 3b, 5, 6) —
// per-tile crop / focal with the REAL crop dialog (src/feedback/crop-dialog.js), the race contract of decision 12b
// (a manual adapter whose get() is settled by hand), the crop preview, the lazy get (≤ 4 at once, aborted, stale results
// never written). Chromium, Firefox AND WebKit. Waits are real signals, polled — never a fixed sleep.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const realOpen = TdMediaPicker.open;
let opens = [];
const stubOpen = (opts) => new Promise((resolve, reject) => { opens.push({ opts, resolve, reject }); });
const warns = [];
const realWarn = console.warn;
const tick = () => new Promise((r) => setTimeout(r, 0));
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
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

const CROP_B = '{"v":1,"x":0.250,"y":0.25,"width":0.50,"height":0.5}'; // other bytes than serializeCrop: kept when unchanged
const box = document.createElement('div');
box.style.width = '600px';
document.body.appendChild(box);

const ITEMS = JSON.stringify([
  { id: 'm1', src: '/test/fixtures/1.svg', name: 'Ảnh 1', crop: CROP_B },
  { id: 'm2', src: '/test/fixtures/2.svg', name: 'Ảnh 2' },
  { id: 'm3', src: '/test/fixtures/3.svg', name: 'Ảnh 3' },
]);
const CROPPABLE = { name: 'g', usage: true, croppable: true, 'focal-point': true, 'aspect-ratio': '3/2' };

function mk(attrs = {}, { adapter = null, items = ITEMS } = {}) {
  const form = document.createElement('form');
  const el = document.createElement('td-media-gallery');
  for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  if (items) el.setAttribute('items', items);
  if (adapter) el.adapter = adapter;
  form.appendChild(el);
  box.appendChild(form);
  const c = { input: 0, change: 0, details: [] };
  el.addEventListener('input', (e) => { c.input++; c.details.push(e.detail); });
  el.addEventListener('change', (e) => { c.change++; c.details.push(e.detail); });
  return { form, el, c };
}
const lis = (el) => [...el.querySelectorAll('.td-media-gallery__list > li')];
const cropBtn = (li) => li.querySelector('.td-media-gallery__crop-btn');
const fd = (form) => [...new FormData(form)].map(([k, v]) => [k, String(v)]);
const entry = (form, k) => fd(form).find(([n]) => n === k)?.[1];

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
async function applyWith(d, normalized) {
  cropperOf(d).crop = { normalized };
  expect(d.querySelector('.td-crop-dialog__confirm').disabled).to.equal(false);
  d.querySelector('.td-crop-dialog__confirm').click();
  await dialogGone();
}

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
  await until(() => dialogRoots().length === 0, 4000, 'overlays gone');
});

describe('td-media-gallery — crop / focal per tile (decisions 12, 13)', () => {
  it('"Cắt" exists only with croppable + usage, shown for an image with a source; hidden for video / file / no source', () => {
    const items = JSON.stringify([{ id: 'm1', src: '/test/fixtures/1.svg' }, { id: 'm4', kind: 'video', src: '/test/fixtures/2.svg' },
      { id: 'm11', kind: 'file', name: 'a.pdf' }, { id: 'm9' }]);
    const { el } = mk(CROPPABLE, { items });
    expect(lis(el).map((li) => cropBtn(li).hidden)).to.deep.equal([false, true, true, true]);
    expect(cropBtn(lis(el)[0]).getAttribute('aria-label')).to.equal('Cắt Ảnh 1 trên 4: m1');
    // an adapter is a source for any image id (the get happens on click)
    el.adapter = createMockAdapter({ manual: true });
    expect(cropBtn(lis(el)[3]).hidden).to.equal(false);
    const plain = mk({ name: 'p', croppable: true }, { items });
    expect(plain.el.querySelector('.td-media-gallery__crop-btn')).to.equal(null);
    expect(warns.filter((w) => w.includes('need the usage attribute')).length).to.equal(1);
  });

  it('no adapter → the tile src; "Áp dụng" changed → serializeCrop into THAT item, input + change (reason crop), focus back', async () => {
    const { el, form, c } = mk(CROPPABLE);
    cropBtn(lis(el)[1]).click();
    const d = await dialogReady();
    expect(new URL(cropperOf(d).getAttribute('src'), document.baseURI).pathname).to.equal('/test/fixtures/2.svg');
    expect(cropperOf(d).hasAttribute('natural-width')).to.equal(false);
    const n = { x: 0, y: 0, width: 0.6, height: 0.6 };
    await applyWith(d, n);
    const got = entry(form, 'g[1][crop]');
    expect(parseCrop(got).crop.width).to.be.closeTo(0.6, 0.01);
    expect(got).to.equal(serializeCrop(parseCrop(got).crop));
    expect(entry(form, 'g[0][crop]')).to.equal(CROP_B);
    expect(c.details.map((x) => x.reason)).to.deep.equal(['crop', 'crop']);
    expect(document.activeElement === cropBtn(lis(el)[1])).to.equal(true);
  });

  it('"Huỷ" / unchanged → the original string kept byte-identical, no event', async () => {
    const { el, form, c } = mk(CROPPABLE);
    cropBtn(lis(el)[0]).click();
    const d = await dialogReady();
    d.querySelector('.td-crop-dialog__cancel').click();
    await dialogGone();
    expect(entry(form, 'g[0][crop]')).to.equal(CROP_B);
    expect(c.input + c.change).to.equal(0);
  });

  it('with an adapter: get(id) once (aria-busy meanwhile), the dialog uses urls.preview + natural size', async () => {
    const man = createMockAdapter({ manual: true });
    const { el } = mk(CROPPABLE, { adapter: man });
    expect(man.calls.get.length, 'SSR-like items with src → no lazy get').to.equal(0);
    cropBtn(lis(el)[0]).click();
    expect(man.calls.get.length).to.equal(1);
    expect(cropBtn(lis(el)[0]).getAttribute('aria-busy')).to.equal('true');
    cropBtn(lis(el)[0]).click();
    cropBtn(lis(el)[1]).click();
    expect(man.calls.get.length, 'one flow at a time').to.equal(1);
    man.calls.get[0].resolve();
    const d = await dialogReady();
    expect(cropBtn(lis(el)[0]).hasAttribute('aria-busy')).to.equal(false);
    expect(cropperOf(d).getAttribute('natural-width')).to.equal('1200');
    d.querySelector('.td-crop-dialog__cancel').click();
    await dialogGone();
  });

  it('crop preview: a crop of the tile ratio (± 2 %) → CSSOM vars on the img; another ratio → none', async () => {
    const items = JSON.stringify([
      { id: 'm1', src: '/test/fixtures/1.svg', crop: '{"v":1,"x":0,"y":0,"width":1,"height":1}' }, // 1200×800 = 3:2 = tile
      { id: 'm2', src: '/test/fixtures/1.svg', crop: '{"v":1,"x":0,"y":0,"width":0.5,"height":1}' }, // 600×800
    ]);
    const { el } = mk(CROPPABLE, { items });
    const [a, b] = lis(el).map((li) => li.querySelector('img'));
    await until(() => a.style.getPropertyValue('--_td-mg-crop-w') !== '', 4000, 'vars after load');
    expect(a.style.getPropertyValue('--_td-mg-crop-w').trim()).to.equal('1');
    expect(b.hasAttribute('style')).to.equal(false);
  });
});

describe('td-media-gallery — the "Cắt" race contract (decision 12b)', () => {
  async function pending(extraAttrs = {}) {
    const man = createMockAdapter({ manual: true });
    const t = mk({ ...CROPPABLE, ...extraAttrs }, { adapter: man });
    cropBtn(lis(t.el)[0]).click();
    expect(man.calls.get.length).to.equal(1);
    return { ...t, man, rec: man.calls.get[0] };
  }

  it('the tile is removed while get waits → aborted, no dialog, the lock is free', async () => {
    const { el, rec, man } = await pending();
    lis(el)[0].querySelector('.td-media-gallery__remove').click();
    expect(rec.signal.aborted).to.equal(true);
    rec.resolve();
    await settle();
    expect(dialogRoots().length).to.equal(0);
    cropBtn(lis(el)[0]).click(); // m2 now first
    expect(man.calls.get.length).to.equal(2);
  });

  it('the adapter changes / configureDefaults() while get waits → aborted, no dialog', async () => {
    const a = await pending();
    a.el.adapter = createMockAdapter({ manual: true });
    expect(a.rec.signal.aborted).to.equal(true);
    a.rec.resolve();
    await settle();
    expect(dialogRoots().length).to.equal(0);
    box.replaceChildren();
    const b = await pending();
    const before = TdMediaPicker.defaults;
    TdMediaPicker.configureDefaults({ context: { tenant: 'x' } });
    try {
      expect(b.rec.signal.aborted).to.equal(true);
      b.rec.resolve();
      await settle();
      expect(dialogRoots().length).to.equal(0);
    } finally {
      TdMediaPicker.configureDefaults(before);
    }
  });

  it('the gallery leaves the page while get waits → aborted, no dialog; back on the page "Cắt" works again', async () => {
    const { el, form, rec, man } = await pending();
    el.remove();
    expect(rec.signal.aborted).to.equal(true);
    rec.resolve();
    await settle();
    expect(dialogRoots().length).to.equal(0);
    form.appendChild(el);
    cropBtn(lis(el)[0]).click();
    expect(man.calls.get.length).to.equal(2);
    man.calls.get[1].resolve();
    const d = await dialogReady();
    d.querySelector('.td-crop-dialog__cancel').click();
    await dialogGone();
  });

  it('a REORDER while get waits does not abort: the dialog opens and the crop lands on the SAME image (not the index)', async () => {
    const { el, form, rec, c } = await pending();
    const li = lis(el)[0];
    li.querySelector('.td-media-gallery__handle').focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'End' });
    await sendKeys({ press: 'Enter' });
    expect(el.value).to.deep.equal(['m2', 'm3', 'm1']);
    expect(rec.signal.aborted).to.equal(false);
    rec.resolve();
    const d = await dialogReady();
    await applyWith(d, { x: 0, y: 0, width: 0.6, height: 0.6 });
    expect(entry(form, 'g[0][crop]')).to.equal('null');
    expect(parseCrop(entry(form, 'g[2][crop]')).crop.width).to.be.closeTo(0.6, 0.01);
    expect(c.details.filter((x) => x.reason === 'crop').length).to.equal(2);
  });

  it('`value =` drops the id while the dialog is open → the dialog closes, nothing applied', async () => {
    const { el, form, rec, c } = await pending();
    rec.resolve();
    const d = await dialogReady();
    cropperOf(d).crop = { normalized: { x: 0, y: 0, width: 0.5, height: 0.5 } };
    el.value = ['m2', 'm3'];
    await dialogGone();
    await settle();
    expect(c.input + c.change).to.equal(0);
    expect(fd(form).filter(([k]) => k.endsWith('[crop]')).map(([, v]) => v)).to.deep.equal(['null', 'null']);
  });

  it('an adapter that ignores the signal and resolves late after an abort → no effect; reopening works at once', async () => {
    const { el, rec, man } = await pending();
    man.ignoreSignal = true;
    el.adapter = man; // same adapter object again → new source generation: aborted
    expect(rec.signal.aborted).to.equal(true);
    cropBtn(lis(el)[0]).click(); // reopen right after the abort
    expect(man.calls.get.length).to.equal(2);
    rec.resolve(); // the stale one, late
    await settle();
    expect(dialogRoots().length).to.equal(0);
    man.calls.get[1].resolve();
    const d = await dialogReady();
    d.querySelector('.td-crop-dialog__cancel').click();
    await dialogGone();
  });

  it('disabled while get waits → aborted', async () => {
    const { el, rec } = await pending();
    el.setAttribute('disabled', '');
    expect(rec.signal.aborted).to.equal(true);
    rec.resolve();
    await settle();
    expect(dialogRoots().length).to.equal(0);
  });
});

describe('td-media-gallery — lazy get (decision 18, acceptance 6)', () => {
  const noSrc = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: `m${i + 1}` })));

  it('only items without a preview; at most 4 at once; each result fills its own tile', async () => {
    const man = createMockAdapter({ manual: true });
    const items = JSON.stringify([{ id: 'm1', src: '/test/fixtures/1.svg' }, ...JSON.parse(noSrc(7)).slice(1)]);
    const { el } = mk({ name: 'g' }, { adapter: man, items });
    expect(man.calls.get.map((r) => r.args[0])).to.deep.equal(['m2', 'm3', 'm4', 'm5']);
    man.calls.get[1].resolve(); // m3
    await until(() => man.calls.get.length === 5);
    expect(man.calls.get[4].args[0]).to.equal('m6');
    await until(() => !!lis(el)[2].querySelector('img'));
    expect(new URL(lis(el)[2].querySelector('img').getAttribute('src')).pathname).to.equal(man.db.get('m3').urls.preview);
    expect(lis(el)[1].querySelector('img')).to.equal(null);
    expect(lis(el)[2].querySelector('.td-media-gallery__handle').getAttribute('aria-label')).to.equal('Sắp xếp Ảnh 3 trên 7: anh-3.jpg');
  });

  it('a new adapter aborts every pending get; an old result arriving late never overwrites', async () => {
    const man = createMockAdapter({ manual: true });
    man.ignoreSignal = true;
    const { el } = mk({ name: 'g' }, { adapter: man, items: noSrc(2) });
    const old = man.calls.get.slice();
    const man2 = createMockAdapter({ manual: true });
    el.adapter = man2;
    expect(old.every((r) => r.signal.aborted)).to.equal(true);
    old[0].resolve(); // late, stale
    await settle();
    expect(lis(el)[0].querySelector('img')).to.equal(null);
    expect(man2.calls.get.length).to.equal(2);
    man2.calls.get[0].resolve();
    await until(() => !!lis(el)[0].querySelector('img'));
  });

  it('a failed get → "Không có ảnh xem trước", the console has the code only, no retry loop', async () => {
    const man = createMockAdapter({ manual: true });
    const { el } = mk({ name: 'g' }, { adapter: man, items: noSrc(1) });
    man.calls.get[0].reject(Object.assign(new Error('secret tok_9'), { code: 'not-found' }));
    await settle();
    expect(man.calls.get.length).to.equal(1);
    expect(lis(el)[0].querySelector('.td-media-gallery__name').textContent).to.equal('Không có ảnh xem trước');
    expect(warns.some((w) => w.includes('tok_9'))).to.equal(false);
  });

  it('the gallery leaves the page → pending gets aborted', async () => {
    const man = createMockAdapter({ manual: true });
    const { el } = mk({ name: 'g' }, { adapter: man, items: noSrc(3) });
    el.remove();
    expect(man.calls.get.every((r) => r.signal.aborted)).to.equal(true);
    expect(TdMediaGallery.LAZY_CONCURRENCY).to.equal(4);
  });
});
