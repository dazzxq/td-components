import { expect } from '@esm-bundle/chai';
// DOM nodes are compared as booleans (`a === b`): chai serialising DOM nodes on failure hangs the runner.
import { TdMediaField } from './td-media-field.js';
import { TdMediaPicker } from '../feedback/td-media-picker.js';
import { createMockAdapter } from '../../test/fixtures/media-adapter.js';

// v0.68.0 (plan docs/internal/plans/v0.68.0-auto-select-default-on.md) — the REAL consumer path of `autoSelectFirst` (ON by default):
// an EMPTY <td-media-field> opens the real <td-media-picker> with the first asset already selected, "Chèn" enabled; a field that
// already has a value keeps its own asset (selection.initialIds wins); `pickerOptions.autoSelectFirst = false` and
// `TdMediaPicker.configureDefaults({ autoSelectFirst: false })` turn it off. td-media-field.engines.browser-test.js STUBS
// TdMediaPicker.open (the field's contract with it); this file uses the real picker, in Chromium, Firefox and WebKit.
void TdMediaField; // defines <td-media-field>
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
const confirmDisabled = () => q('.td-media-picker__confirm').hasAttribute('disabled');
const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, composed: true }));

const box = document.createElement('div');
box.style.width = '360px'; // test page only (the component never writes style)
document.body.appendChild(box);

const defaultsBefore = TdMediaPicker.defaults;
function mk(attrs = {}, adapter = createMockAdapter()) {
  const form = document.createElement('form');
  const el = document.createElement('td-media-field');
  for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  if (adapter) el.adapter = adapter;
  form.appendChild(el);
  box.appendChild(form);
  return { form, el };
}
const openBtn = (el) => el.querySelector('.td-media-field__open');
async function openPicker(el) {
  openBtn(el).click();
  await until(() => pickerRoot() && items().length > 0, 3000, 'picker with its first page');
}
async function closeAll() {
  for (const h of document.querySelectorAll('td-media-picker')) {
    if (h.isOpen) h.close('programmatic');
  }
  await until(() => !document.body.querySelector(':scope > .td-media-picker'), 3000, 'picker closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
}

afterEach(async () => {
  await closeAll();
  TdMediaPicker.configureDefaults(defaultsBefore);
  box.replaceChildren();
});

describe('v0.68.0 td-media-field with the REAL picker — autoSelectFirst is ON by default', () => {
  it('an EMPTY field opens the picker with the first asset selected and "Chèn" enabled; "Chèn" puts it in the field', async () => {
    const { form, el } = mk({ name: 'hero' });
    expect(el.value, 'the field starts empty').to.equal('');
    await openPicker(el);
    await until(() => ticked() === 'm60', 3000, 'm60 pre-selected');
    expect(confirmDisabled(), 'Chèn enabled').to.equal(false);
    q('.td-media-picker__confirm').click();
    await until(() => el.value === 'm60', 3000, 'the field took m60');
    expect([...new FormData(form)].map(([k, v]) => [k, String(v)])).to.deep.equal([['hero', 'm60']]);
  });

  it('closing with Escape after the pre-selection leaves the field empty (a cancelled outcome carries no selection)', async () => {
    const { el } = mk({ name: 'hero' });
    await openPicker(el);
    await until(() => ticked() === 'm60', 3000, 'm60 pre-selected');
    key(q('.td-media-picker__dialog'), 'Escape');
    await until(() => !pickerRoot(), 3000, 'picker closed');
    expect(el.value, 'still empty').to.equal('');
  });

  it('a field that ALREADY has an image keeps its own asset: nothing else is pre-selected (initialIds wins)', async () => {
    const { el } = mk({ name: 'hero', value: 'm5' });
    await openPicker(el);
    // the field's asset is loaded through get(); m5 is not on the first page, so the grid ticks nothing and m60 is NOT selected
    await until(() => !q('.td-media-picker__loading-note') || q('.td-media-picker__loading-note').hidden, 3000, 'initialIds settled');
    expect(ticked(), 'the first asset was not pre-selected').to.equal('');
    expect(confirmDisabled(), 'Chèn enabled for the field\'s own asset').to.equal(false);
    q('.td-media-picker__confirm').click();
    await until(() => !pickerRoot(), 3000, 'picker closed');
    expect(el.value, 'the value is the field\'s own asset, not m60').to.equal('m5');
  });
});

describe('v0.68.0 td-media-field with the REAL picker — turning it off', () => {
  it('pickerOptions.autoSelectFirst = false: nothing selected, "Chèn" disabled', async () => {
    const { el } = mk({ name: 'hero' });
    el.pickerOptions = { autoSelectFirst: false };
    await openPicker(el);
    await wait(150); // a pre-selection would have landed with the first page
    expect(ticked()).to.equal('');
    expect(confirmDisabled(), 'Chèn disabled').to.equal(true);
  });

  it('TdMediaPicker.configureDefaults({ autoSelectFirst: false }) turns it off for every field', async () => {
    TdMediaPicker.configureDefaults({ ...defaultsBefore, autoSelectFirst: false });
    const { el } = mk({ name: 'hero' });
    await openPicker(el);
    await wait(150);
    expect(ticked()).to.equal('');
    expect(confirmDisabled(), 'Chèn disabled').to.equal(true);
  });

  it('pickerOptions.autoSelectFirst = true over defaults false turns it back on for that field only', async () => {
    TdMediaPicker.configureDefaults({ ...defaultsBefore, autoSelectFirst: false });
    const { el } = mk({ name: 'hero' });
    el.pickerOptions = { autoSelectFirst: true };
    await openPicker(el);
    await until(() => ticked() === 'm60', 3000, 'm60 pre-selected');
    expect(confirmDisabled()).to.equal(false);
  });
});
