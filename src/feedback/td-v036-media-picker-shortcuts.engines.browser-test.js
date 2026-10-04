import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse, setViewport } from '@web/test-runner-commands';

// v0.36.0 M2 (plan QĐ 6) — media picker selection shortcuts with REAL input (Meta on macOS, Control elsewhere),
// through the picker's model (max, not-ready veto). Chromium + Firefox + WebKit; waits on real signals.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { TdMediaPicker } = await import('./td-media-picker.js');
const { TdModal } = await import('./td-modal.js');
const { createMockAdapter } = await import('../../test/fixtures/media-adapter.js');

const MOD = /Mac/i.test(navigator.platform || navigator.userAgent) ? 'Meta' : 'Control';
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
async function until(fn, ms = 4000, what = 'condition') {
  const t0 = performance.now();
  for (;;) {
    let v;
    try { v = fn(); } catch { v = false; }
    if (v) return v;
    if (performance.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await raf();
  }
}
const pickerRoot = () => [...document.body.querySelectorAll(':scope > .td-media-picker')].find((r) => r.getAttribute('data-state') !== 'closing') || null;
const q = (sel) => pickerRoot()?.querySelector(sel) || null;
const grid = () => q('td-media-grid');
const item = (id) => pickerRoot()?.querySelector(`[data-td-media-item][data-id="${id}"]`) || null;
const opener = (id) => item(id)?.querySelector('[data-td-media-open]') || null;
const host = () => document.querySelector('td-media-picker');

async function clickWith(el, key) {
  el.scrollIntoView({ block: 'nearest' });
  await raf();
  const r = el.getBoundingClientRect();
  if (key) await sendKeys({ down: key });
  try {
    await sendMouse({ type: 'click', position: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] });
  } finally {
    if (key) await sendKeys({ up: key });
  }
  await raf();
}
async function openReady(opts, adOpts = { count: 10 }) {
  const ad = createMockAdapter(adOpts);
  const promise = TdMediaPicker.open({ ...opts, adapter: ad });
  await until(() => pickerRoot()?.getAttribute('data-state') === 'open', 4000, 'open');
  await until(() => item('m10'), 4000, 'first page');
  return { ad, promise };
}

beforeEach(async () => { await setViewport({ width: 1280, height: 800 }); });
afterEach(async () => {
  for (const h of document.querySelectorAll('td-media-picker')) if (h.isOpen) h.close('programmatic');
  TdModal.closeAll();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-modal'), 4000, 'closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
  await resetMouse();
});

describe('v0.36.0 media picker shortcuts (real input)', () => {
  it(`multiple: ${MOD}+click toggles, Shift+click adds the range through the model (processing asset vetoed)`, async () => {
    await openReady({ selection: { mode: 'multiple' } });
    const changes = [];
    host().addEventListener('selection-change', (e) => changes.push(e.detail));
    await clickWith(opener('m9'), MOD);
    await until(() => grid().selectedIds.join() === 'm9', 3000, 'toggle');
    await clickWith(opener('m5'), 'Shift'); // m9..m5, m7 is "processing" → not selectable
    await until(() => grid().selectedIds.length === 4, 3000, 'range');
    expect(grid().selectedIds).to.deep.equal(['m9', 'm8', 'm6', 'm5']);
    expect(changes.length).to.be.greaterThan(0);
    await clickWith(opener('m8'), MOD);
    await until(() => grid().selectedIds.join() === 'm9,m6,m5', 3000, 'untoggle');
  });

  it('multiple: the range stops at maxItems', async () => {
    await openReady({ selection: { mode: 'multiple', maxItems: 3 } });
    await clickWith(opener('m10'), MOD);
    await clickWith(opener('m4'), 'Shift');
    await until(() => grid().selectedIds.length === 3, 3000, 'capped');
    expect(grid().selectedIds).to.deep.equal(['m10', 'm9', 'm8']);
  });

  it(`single: ${MOD}+click and Shift+click select exactly one`, async () => {
    const { promise } = await openReady({ selection: { mode: 'single' } });
    await clickWith(opener('m9'), MOD);
    await until(() => grid().selectedIds.join() === 'm9', 3000, 'one');
    await clickWith(opener('m6'), 'Shift');
    await until(() => grid().selectedIds.join() === 'm6', 3000, 'still one');
    q('.td-media-picker__confirm').click();
    const out = await promise;
    expect(out.selection.map((s) => s.assetId)).to.deep.equal(['m6']);
  });
});
