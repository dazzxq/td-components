import { expect } from '@esm-bundle/chai';
// DOM nodes are compared as booleans (`a === b`): chai serialising DOM nodes on failure hangs the runner.
import { TdCropper } from './td-cropper.js';
import { TdMediaField } from './td-media-field.js';
import { TdMediaGallery } from './td-media-gallery.js';
import { TdMediaPicker } from '../feedback/td-media-picker.js';
import { TdModal } from '../feedback/td-modal.js';
import { openCropDialog } from '../feedback/crop-dialog.js';
import { createMockAdapter } from '../../test/fixtures/media-adapter.js';

// v0.75.0 (plan docs/internal/plans/v0.73.0-cropper-pan-mode.md M2, "Nơi nhúng (M2)") — `mode` / `shape` reach the
// <td-cropper> of EVERY embed: openCropDialog (= TdCropper.openDialog), <td-media-field crop-mode crop-shape> (its own
// "Cắt ảnh" dialog AND the picker's `crop` param), <td-media-gallery crop-mode crop-shape> and the media picker's crop
// step (`crop.mode` / `crop.shape`). Absent / invalid options ⇒ the cropper carries NO mode / shape attribute (the 0.74
// DOM). Chromium, Firefox AND WebKit; waits are real signals, polled — never a fixed sleep.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const realOpen = TdMediaPicker.open;
/** @type {Array<{ opts: any, resolve: (o: any) => void }>} */
let opens = [];
const stubOpen = (opts) => new Promise((resolve) => { opens.push({ opts, resolve }); });
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

const ad = createMockAdapter();
const box = document.createElement('div');
box.style.width = '360px'; // test page only
document.body.appendChild(box);

const dialogRoots = () => [...document.body.querySelectorAll(':scope > .td-crop-dialog')];
const openDialog = () => dialogRoots().find((r) => r.getAttribute('data-state') === 'open') || null;
const cropperOf = (d) => d.querySelector('td-cropper');
async function dialogReady() {
  const d = await until(() => openDialog(), 4000, 'crop dialog open');
  const cr = cropperOf(d);
  await until(() => cr.getAttribute('data-state') === 'ready' || cr.getAttribute('data-state') === 'error', 4000, 'cropper ready');
  return d;
}
const closeDialog = async () => {
  for (const b of document.body.querySelectorAll(':scope > .td-crop-dialog .td-crop-dialog__cancel')) b.click();
  await until(() => dialogRoots().length === 0, 4000, 'crop dialog closed');
};
/** the cropper's mode / shape as the page sees them: attributes the embed set + the state the cropper derived */
const view = (cr) => ({
  mode: cr.getAttribute('mode'), shape: cr.getAttribute('shape'),
  dataMode: cr.getAttribute('data-mode'), dataShape: cr.getAttribute('data-shape'),
});
const NONE = { mode: null, shape: null, dataMode: null, dataShape: null };

beforeEach(() => {
  opens = [];
  warns.length = 0;
  TdMediaPicker.open = stubOpen;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
});
afterEach(async () => {
  TdMediaPicker.open = realOpen;
  console.warn = realWarn;
  TdMediaPicker.configureDefaults({});
  box.replaceChildren();
  for (const h of document.querySelectorAll('td-media-picker')) if (h.isOpen) h.close('programmatic');
  TdModal.closeAll();
  for (const b of document.body.querySelectorAll(':scope > .td-modal[data-state="open"] .td-modal__close')) b.click();
  await until(() => !document.body.querySelector(':scope > .td-crop-dialog, :scope > .td-media-picker, :scope > .td-modal'), 4000, 'overlays gone').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
});

const SRC = { src: '/test/fixtures/1.svg', naturalWidth: 1200, naturalHeight: 800 };

describe('openCropDialog / TdCropper.openDialog — mode, shape (v0.75.0)', () => {
  it('mode "pan" + shape "circle" (1:1) → the cropper is a round pan cropper', async () => {
    const p = openCropDialog({ ...SRC, mode: 'pan', shape: 'circle', aspectRatio: 1 });
    const d = await dialogReady();
    const cr = cropperOf(d);
    expect(view(cr)).to.deep.equal({ mode: 'pan', shape: 'circle', dataMode: 'pan', dataShape: 'circle' });
    expect(cr.querySelector('td-slider.td-cropper__zoom') !== null, 'pan zoom slider').to.equal(true);
    await closeDialog();
    expect((await p).status).to.equal('cancelled');
  });

  it('the public door TdCropper.openDialog passes them too', async () => {
    const p = TdCropper.openDialog({ ...SRC, mode: 'pan' });
    const d = await dialogReady();
    expect(view(cropperOf(d))).to.deep.equal({ mode: 'pan', shape: null, dataMode: 'pan', dataShape: null });
    await closeDialog();
    await p;
  });

  it('absent → no attribute at all (the 0.74 DOM, box mode)', async () => {
    const p = openCropDialog({ ...SRC });
    const d = await dialogReady();
    expect(view(cropperOf(d))).to.deep.equal(NONE);
    await closeDialog();
    await p;
  });

  it('box / rect / unknown / non-string values → no attribute (strict allowlist, never copied)', async () => {
    const bad = ['box', 'rect', '', '  ', 'pans', 'p an', 'free', 'x" onclick="1', '<pan>', null, undefined, 0, 1, true, {}, [], ['pan']];
    for (const v of bad) {
      const p = openCropDialog({ ...SRC, mode: v, shape: v });
      const d = await dialogReady();
      expect(view(cropperOf(d)), `value ${JSON.stringify(v)}`).to.deep.equal(NONE);
      await closeDialog();
      await p;
    }
  });

  it('case and whitespace follow the cropper attribute grammar: " PAN\\n" → pan, "\\tCircle " → circle (canonical words only)', async () => {
    const p = openCropDialog({ ...SRC, mode: ' PAN\n', shape: '\tCircle ', aspectRatio: 1 });
    const d = await dialogReady();
    const cr = cropperOf(d);
    expect(cr.getAttribute('mode')).to.equal('pan');
    expect(cr.getAttribute('shape')).to.equal('circle');
    expect(cr.getAttribute('data-shape')).to.equal('circle');
    await closeDialog();
    await p;
  });

  it('shape "circle" without pan, or without a 1:1 lock → ignored by the cropper (as in M1), no dialog error', async () => {
    let p = openCropDialog({ ...SRC, shape: 'circle', aspectRatio: 1 }); // box
    let d = await dialogReady();
    expect(view(cropperOf(d))).to.deep.equal({ mode: null, shape: 'circle', dataMode: null, dataShape: null });
    await closeDialog();
    await p;
    p = openCropDialog({ ...SRC, mode: 'pan', shape: 'circle', aspectRatio: 16 / 9 }); // pan, locked 16:9
    d = await dialogReady();
    expect(view(cropperOf(d))).to.deep.equal({ mode: 'pan', shape: 'circle', dataMode: 'pan', dataShape: null });
    await closeDialog();
    await p;
  });
});

describe('td-media-field — crop-mode / crop-shape (v0.75.0)', () => {
  const FIELD = { name: 'avatar', usage: true, croppable: true, value: 'm1', 'preview-src': '/test/fixtures/1.svg' };
  function mk(attrs = {}) {
    const form = document.createElement('form');
    const el = document.createElement('td-media-field');
    for (const [k, v] of Object.entries({ ...FIELD, ...attrs })) if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    el.adapter = ad;
    form.appendChild(el);
    box.appendChild(form);
    return el;
  }
  const cropBtn = (el) => el.querySelector('.td-media-field__crop-btn');
  const openBtn = (el) => el.querySelector('.td-media-field__open');

  it('the "Cắt ảnh" dialog: crop-mode="pan" crop-shape="circle" + crop-ratio="1" → a round pan cropper', async () => {
    const el = mk({ 'crop-mode': 'pan', 'crop-shape': 'circle', 'crop-ratio': '1' });
    cropBtn(el).click();
    const d = await dialogReady();
    expect(view(cropperOf(d))).to.deep.equal({ mode: 'pan', shape: 'circle', dataMode: 'pan', dataShape: 'circle' });
    await closeDialog();
  });

  it('the attribute is read when the dialog opens (changed at runtime → the next dialog follows)', async () => {
    const el = mk({ 'crop-ratio': '1' });
    cropBtn(el).click();
    expect(view(cropperOf(await dialogReady()))).to.deep.equal(NONE);
    await closeDialog();
    el.setAttribute('crop-mode', 'pan');
    el.setAttribute('crop-shape', 'circle');
    cropBtn(el).click();
    expect(view(cropperOf(await dialogReady()))).to.deep.equal({ mode: 'pan', shape: 'circle', dataMode: 'pan', dataShape: 'circle' });
    await closeDialog();
    el.removeAttribute('crop-mode');
    el.removeAttribute('crop-shape');
    cropBtn(el).click();
    expect(view(cropperOf(await dialogReady()))).to.deep.equal(NONE);
    await closeDialog();
  });

  it('absent / invalid values → no attribute on the cropper', async () => {
    for (const [m, s] of [[null, null], ['box', 'rect'], ['', ''], ['pans', 'circles'], ['x" onclick="1', '<circle>']]) {
      box.replaceChildren();
      const el = mk({ 'crop-mode': m, 'crop-shape': s });
      cropBtn(el).click();
      expect(view(cropperOf(await dialogReady())), `${m} / ${s}`).to.deep.equal(NONE);
      await closeDialog();
    }
  });

  it('the picker\'s `crop` param carries the resolved mode / shape (always set, over site pickerOptions)', async () => {
    const el = mk({ 'crop-mode': ' Pan ', 'crop-shape': 'CIRCLE', 'crop-ratio': '1' });
    el.pickerOptions = { crop: { enabled: true, mode: 'box', shape: 'rect' } };
    openBtn(el).click();
    await until(() => opens.length === 1, 4000, 'picker open');
    expect(opens[0].opts.crop).to.deep.equal({ enabled: true, aspectRatio: 1, allowFocalPoint: false, mode: 'pan', shape: 'circle' });
    opens[0].resolve({ status: 'cancelled' });
  });

  it('the picker\'s `crop` param without the attributes: exactly the 0.74 object (no mode / shape keys); a field that is not croppable → { enabled: false }', async () => {
    const el = mk();
    openBtn(el).click();
    await until(() => opens.length === 1, 4000, 'picker open');
    expect(opens[0].opts.crop).to.deep.equal({ enabled: true, aspectRatio: null, allowFocalPoint: false });
    opens[0].resolve({ status: 'cancelled' });
    await tick();
    const plain = mk({ croppable: false, 'crop-mode': 'pan', 'crop-shape': 'circle' });
    openBtn(plain).click();
    await until(() => opens.length === 2, 4000, 'second picker open');
    expect(opens[1].opts.crop).to.deep.equal({ enabled: false });
    opens[1].resolve({ status: 'cancelled' });
  });

  it('without usage the attributes are ignored with ONE warning (no crop at all)', async () => {
    const el = mk({ usage: false, croppable: true, 'crop-mode': 'pan', 'crop-shape': 'circle' });
    openBtn(el).click();
    await until(() => opens.length === 1, 4000, 'picker open');
    expect(opens[0].opts.crop).to.deep.equal({ enabled: false });
    opens[0].resolve({ status: 'cancelled' });
    expect(warns.filter((w) => w.includes('need the usage attribute')).length).to.equal(1);
    expect(TdMediaField).to.be.a('function');
  });
});

describe('td-media-gallery — crop-mode / crop-shape (v0.75.0)', () => {
  const ITEMS = JSON.stringify([{ id: 'm1', src: '/test/fixtures/1.svg', name: 'Ảnh 1' }, { id: 'm2', src: '/test/fixtures/2.svg', name: 'Ảnh 2' }]);
  function mk(attrs = {}) {
    const form = document.createElement('form');
    const el = document.createElement('td-media-gallery');
    for (const [k, v] of Object.entries({ name: 'g', usage: true, croppable: true, 'aspect-ratio': '1', ...attrs })) {
      if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    }
    el.setAttribute('items', ITEMS);
    form.appendChild(el);
    box.appendChild(form);
    return el;
  }
  const cropBtn = (el, i = 0) => el.querySelectorAll('.td-media-gallery__list > li')[i].querySelector('.td-media-gallery__crop-btn');

  it('crop-mode="pan" crop-shape="circle" on a 1:1 gallery → every tile\'s dialog is a round pan cropper', async () => {
    const el = mk({ 'crop-mode': 'pan', 'crop-shape': 'circle' });
    for (const i of [0, 1]) {
      cropBtn(el, i).click();
      expect(view(cropperOf(await dialogReady()))).to.deep.equal({ mode: 'pan', shape: 'circle', dataMode: 'pan', dataShape: 'circle' });
      await closeDialog();
    }
  });

  it('runtime change is picked up by the next dialog; absent / invalid → no attribute', async () => {
    const el = mk();
    cropBtn(el).click();
    expect(view(cropperOf(await dialogReady()))).to.deep.equal(NONE);
    await closeDialog();
    el.setAttribute('crop-mode', 'PAN');
    cropBtn(el).click();
    expect(view(cropperOf(await dialogReady()))).to.deep.equal({ mode: 'pan', shape: null, dataMode: 'pan', dataShape: null });
    await closeDialog();
    for (const [m, s] of [['box', 'rect'], ['', ''], ['pans', 'round'], ['x" onclick="1', '<circle>']]) {
      el.setAttribute('crop-mode', m);
      el.setAttribute('crop-shape', s);
      cropBtn(el).click();
      expect(view(cropperOf(await dialogReady())), `${m} / ${s}`).to.deep.equal(NONE);
      await closeDialog();
    }
    expect(TdMediaGallery).to.be.a('function');
  });

  it('without usage: ignored (no crop button) with ONE warning', () => {
    const el = mk({ usage: false, 'crop-mode': 'pan', 'crop-shape': 'circle' });
    expect(el.querySelector('.td-media-gallery__crop-btn')).to.equal(null);
    expect(warns.filter((w) => w.includes('need the usage attribute')).length).to.equal(1);
  });
});

describe('td-media-picker — crop.mode / crop.shape (v0.75.0)', () => {
  const pickerRoot = () => [...document.body.querySelectorAll(':scope > .td-media-picker')].find((r) => r.getAttribute('data-state') !== 'closing') || null;
  const items = () => [...(pickerRoot()?.querySelectorAll('[data-td-media-item]') || [])];
  const item = (id) => items().find((i) => i.getAttribute('data-id') === id) || null;
  const confirmBtn = () => pickerRoot()?.querySelector('.td-media-picker__confirm');
  /** open the REAL picker, select m60, "Chèn" → the crop step's cropper */
  async function cropStep(opts) {
    TdMediaPicker.open = realOpen;
    const adapter = createMockAdapter();
    const promise = TdMediaPicker.open({ autoSelectFirst: false, ...opts, adapter });
    await until(() => items().length > 0, 4000, 'first page');
    item('m60').querySelector('[data-td-media-open]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0 }));
    await until(() => !confirmBtn().hasAttribute('disabled'), 4000, 'm60 selected');
    confirmBtn().click();
    const d = await dialogReady();
    return { d, promise };
  }

  it('crop { mode: "pan", shape: "circle", aspectRatio: 1 } → the crop step is a round pan cropper', async () => {
    const { d } = await cropStep({ crop: { enabled: true, aspectRatio: 1, mode: 'pan', shape: 'circle' } });
    expect(d.classList.contains('td-crop-dialog--nested'), 'nested').to.equal(true);
    expect(view(cropperOf(d))).to.deep.equal({ mode: 'pan', shape: 'circle', dataMode: 'pan', dataShape: 'circle' });
  });

  it('absent / invalid crop.mode / crop.shape → no attribute (box)', async () => {
    let { d } = await cropStep({ crop: { enabled: true } });
    expect(view(cropperOf(d))).to.deep.equal(NONE);
    await closeDialog();
    TdModal.closeAll();
    await until(() => !pickerRoot(), 4000, 'picker closed').catch(() => {});
    ({ d } = await cropStep({ crop: { enabled: true, mode: 'pans', shape: ['circle'] } }));
    expect(view(cropperOf(d))).to.deep.equal(NONE);
  });

  it('configureDefaults({ crop }) carries mode / shape; an open() layer overrides the defaults per key', async () => {
    TdMediaPicker.configureDefaults({ crop: { enabled: true, aspectRatio: 1, mode: 'pan', shape: 'circle' } });
    const { d } = await cropStep({});
    // shallow merge per key: `crop` of the open() layer replaces the defaults' `crop` — here there is none
    expect(view(cropperOf(d))).to.deep.equal({ mode: 'pan', shape: 'circle', dataMode: 'pan', dataShape: 'circle' });
  });

  it('through a real <td-media-field crop-mode="pan"> → the picker\'s crop step is a pan cropper', async () => {
    const el = document.createElement('td-media-field');
    for (const [k, v] of Object.entries({ name: 'a', usage: true, croppable: true, 'crop-ratio': '1', 'crop-mode': 'pan', 'crop-shape': 'circle' })) el.setAttribute(k, v === true ? '' : v);
    el.adapter = createMockAdapter();
    box.appendChild(el);
    TdMediaPicker.open = realOpen;
    TdMediaPicker.configureDefaults({ autoSelectFirst: false });
    el.querySelector('.td-media-field__open').click();
    await until(() => items().length > 0, 4000, 'first page');
    item('m60').querySelector('[data-td-media-open]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0 }));
    await until(() => !confirmBtn().hasAttribute('disabled'), 4000, 'm60 selected');
    confirmBtn().click();
    const d = await dialogReady();
    expect(view(cropperOf(d))).to.deep.equal({ mode: 'pan', shape: 'circle', dataMode: 'pan', dataShape: 'circle' });
  });
});
