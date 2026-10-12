import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';
// DOM nodes are compared as booleans (`a === b`): chai serialising DOM nodes on failure hangs the runner.
import { TdMediaGallery } from './td-media-gallery.js';
import { TdMediaPicker } from '../feedback/td-media-picker.js';
import { createMockAdapter } from '../../test/fixtures/media-adapter.js';

// v0.72.0 (plan docs/internal/plans/v0.72.0-auto-select-single-only.md) — the REAL consumer path of the new `autoSelectFirst` default:
// <td-media-gallery> always opens the real <td-media-picker> in MULTIPLE mode, which no longer pre-selects the first asset by default
// (the owner: "ko nhé"); an explicit `true` (gallery.pickerOptions, or the site-wide configureDefaults written for 0.67.0) still does.
// td-v043-media-gallery.engines.browser-test.js STUBS TdMediaPicker.open (the gallery's contract with it); this file uses the real
// picker, in Chromium, Firefox and WebKit. The single-mode twin is td-v068-media-field-auto-select.engines.browser-test.js.
void TdMediaGallery; // defines <td-media-gallery>
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000, what = 'condition') {
  const t0 = performance.now();
  for (;;) {
    let v;
    try { v = fn(); } catch { v = false; }
    if (v) return v;
    if (performance.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await wait(10);
  }
}
const pickerRoot = () => [...document.body.querySelectorAll(':scope > .td-media-picker')].find((r) => r.getAttribute('data-state') !== 'closing') || null;
const q = (sel) => pickerRoot()?.querySelector(sel) || null;
const grid = () => q('td-media-grid');
const items = () => [...(pickerRoot()?.querySelectorAll('[data-td-media-item]') || [])];
const ticked = () => (grid()?.selectedIds || []).join();
const confirmBtn = () => q('.td-media-picker__confirm');
const confirmDisabled = () => confirmBtn().hasAttribute('disabled');

const box = document.createElement('div');
box.style.width = '600px'; // test page only (the component never writes style)
document.body.appendChild(box);

const defaultsBefore = TdMediaPicker.defaults;
function mk(attrs = {}, adapter = createMockAdapter()) {
  const form = document.createElement('form');
  const el = document.createElement('td-media-gallery');
  for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  if (adapter) el.adapter = adapter;
  form.appendChild(el);
  box.appendChild(form);
  return { form, el };
}
const addBtn = (el) => el.querySelector('button.td-media-gallery__add');
async function openPicker(el) {
  addBtn(el).click();
  await until(() => pickerRoot() && items().length > 0, 3000, 'picker with its first page');
}
async function closeAll() {
  for (const h of document.querySelectorAll('td-media-picker')) {
    if (h.isOpen) h.close('programmatic');
  }
  await until(() => !document.body.querySelector(':scope > .td-media-picker'), 3000, 'picker closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
}

beforeEach(async () => {
  await setViewport({ width: 1280, height: 800 }); // ≥ 720: the detail pane previews the first asset
});
afterEach(async () => {
  await closeAll();
  TdMediaPicker.configureDefaults(defaultsBefore);
  box.replaceChildren();
});

describe('v0.72.0 td-media-gallery with the REAL picker — a multiple picker is OFF by default', () => {
  it('an empty gallery opens the picker with NOTHING selected: "Chèn" disabled, the first asset is only previewed', async () => {
    const { el } = mk({ name: 'images', label: 'Ảnh' });
    await openPicker(el);
    // the opening selection (if any) is made in the same pass that draws the first page, so it is final once the cards exist
    await until(() => q('.td-media-picker__detail-name')?.textContent === 'anh-60.jpg', 3000, 'the first asset is previewed');
    expect(ticked(), 'nothing ticked').to.equal('');
    expect(confirmDisabled(), 'Chèn disabled').to.equal(true);
    expect((confirmBtn().textContent || '').trim()).to.equal('Chèn');
  });

  it('a gallery with one slot left (maxItems 1) is the same: still nothing selected', async () => {
    const { el } = mk({ name: 'images', label: 'Ảnh', max: '2', items: JSON.stringify([{ id: 'm1', src: '/test/fixtures/1.svg', name: 'Ảnh 1' }]) });
    await openPicker(el);
    await until(() => q('.td-media-picker__detail-name')?.textContent === 'anh-60.jpg', 3000, 'the first asset is previewed');
    expect(ticked()).to.equal('');
    expect(confirmDisabled(), 'Chèn disabled').to.equal(true);
  });

  it('the user picks as before: ticking one asset enables "Chèn" and the gallery takes exactly that asset', async () => {
    const { el } = mk({ name: 'images', label: 'Ảnh' });
    await openPicker(el);
    await until(() => q('.td-media-picker__detail-name')?.textContent === 'anh-60.jpg', 3000, 'the first asset is previewed');
    items().find((i) => i.getAttribute('data-id') === 'm59').querySelector('.td-media-grid__tick').dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0 }));
    await until(() => ticked() === 'm59', 3000, 'm59 ticked by the user');
    expect(confirmDisabled(), 'Chèn enabled').to.equal(false);
    confirmBtn().click();
    await until(() => !pickerRoot(), 3000, 'picker closed');
    await until(() => el.value.length === 1, 3000, 'the gallery took the pick');
    expect(el.value, 'only the ticked asset, not m60').to.deep.equal(['m59']);
  });
});

describe('v0.72.0 td-media-gallery with the REAL picker — an explicit true still pre-selects', () => {
  it('gallery.pickerOptions.autoSelectFirst = true: the first asset is selected ("Chèn (1)"), and "Chèn" puts it in the gallery', async () => {
    const { el } = mk({ name: 'images', label: 'Ảnh' });
    el.pickerOptions = { autoSelectFirst: true };
    await openPicker(el);
    await until(() => ticked() === 'm60', 3000, 'm60 pre-selected');
    expect(confirmDisabled(), 'Chèn enabled').to.equal(false);
    expect((confirmBtn().textContent || '').trim()).to.equal('Chèn (1)');
    confirmBtn().click();
    await until(() => !pickerRoot(), 3000, 'picker closed');
    await until(() => el.value.length === 1, 3000, 'the gallery took the pick');
    expect(el.value).to.deep.equal(['m60']);
  });

  it('TdMediaPicker.configureDefaults({ autoSelectFirst: true }) (the 0.67.0 site-wide opt-in) switches the gallery picker ON too', async () => {
    TdMediaPicker.configureDefaults({ ...defaultsBefore, autoSelectFirst: true });
    const { el } = mk({ name: 'images', label: 'Ảnh' });
    await openPicker(el);
    await until(() => ticked() === 'm60', 3000, 'm60 pre-selected from the defaults');
    expect(confirmDisabled()).to.equal(false);
  });

  it('pickerOptions.autoSelectFirst = false over defaults true turns it off for that gallery only', async () => {
    TdMediaPicker.configureDefaults({ ...defaultsBefore, autoSelectFirst: true });
    const { el } = mk({ name: 'images', label: 'Ảnh' });
    el.pickerOptions = { autoSelectFirst: false };
    await openPicker(el);
    await until(() => q('.td-media-picker__detail-name')?.textContent === 'anh-60.jpg', 3000, 'the first asset is previewed');
    expect(ticked()).to.equal('');
    expect(confirmDisabled(), 'Chèn disabled').to.equal(true);
  });
});
