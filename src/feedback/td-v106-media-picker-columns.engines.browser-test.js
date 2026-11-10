import { expect } from '@esm-bundle/chai';

// v0.106.0 (plan v0.106.0-media-picker-grid-dedupe, QĐ1-QĐ3) — `columns: 'fixed'`: 8/6/4/3/2/1 columns picked by a
// ResizeObserver on the results area, skeleton = N × 2 cards, token `--td-media-picker-fixed-card-min`, 'auto' unchanged.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { TdMediaPicker } = await import('./td-media-picker.js');
const { TdModal } = await import('./td-modal.js');
const { createMockAdapter } = await import('../../test/fixtures/media-adapter.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
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
const pickerRoot = () => [...document.body.querySelectorAll(':scope > .td-media-picker')].find((r) => r.getAttribute('data-state') !== 'closing') || null;
const q = (sel) => pickerRoot()?.querySelector(sel) || null;
const items = () => [...(pickerRoot()?.querySelectorAll('[data-td-media-item]') || [])];
const results = () => q('.td-media-picker__results');
// the results area is the observed element: pin its OUTER width (content = width - 2rem padding)
const setWidth = async (w) => {
  results().style.setProperty('flex', `0 0 ${w}px`);
  results().style.setProperty('width', `${w}px`);
  await frame();
};
const cols = () => pickerRoot().getAttribute('data-cols');
const tracks = (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length;
const colsOfRows = (els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().left))).size;
async function open(opts = {}, adOpts = {}) {
  const ad = opts.adapter || createMockAdapter(adOpts);
  const promise = TdMediaPicker.open({ autoSelectFirst: false, ...opts, adapter: ad });
  await until(() => pickerRoot()?.getAttribute('data-state') === 'open', 4000, 'open');
  await until(() => getComputedStyle(pickerRoot().querySelector('.td-media-picker__dialog')).transform === 'none', 4000, 'open motion');
  return { ad, promise };
}
const firstPage = () => until(() => items().length > 0, 4000, 'first page');
async function closeAll() {
  for (const h of document.querySelectorAll('td-media-picker')) if (h.isOpen) h.close('programmatic');
  TdModal.closeAll();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-modal'), 4000, 'closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
  document.documentElement.style.removeProperty('--td-media-picker-fixed-card-min');
}
afterEach(closeAll);

describe('v0.106 td-media-picker columns: fixed', () => {
  it('widths → 8/6/4/3/2/1 columns (data-cols, grid tracks, real card positions); every column count divides 24', async () => {
    await open({ columns: 'fixed', pageSize: 24 }, { count: 60 });
    await firstPage();
    expect(pickerRoot().getAttribute('data-columns')).to.equal('fixed');
    // gap 16, card min 135, padding 2 × 16: outer width needed = N*135 + (N-1)*16 + 32 → 8: 1224, 6: 922, 4: 620, 3: 469, 2: 318
    const cases = [[1300, 8], [1230, 8], [1224, 8], [1223, 6], [1000, 6], [922, 6], [921, 4], [800, 4], [620, 4], [619, 3], [500, 3], [400, 2], [318, 2], [317, 1], [250, 1]];
    for (const [w, n] of cases) {
      await setWidth(w);
      expect(cols(), `width ${w}`).to.equal(String(n));
      expect(tracks(q('.td-media-picker__grid')), `grid tracks @${w}`).to.equal(n);
      expect(24 % n).to.equal(0);
    }
    await setWidth(1300);
    const all = items();
    expect(colsOfRows(all.slice(0, 8))).to.equal(8);
    // pageSize 24, 8 columns → exactly 3 full rows
    expect(all.length).to.equal(24);
    const tops = new Set(all.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(tops.size).to.equal(3);
    await setWidth(800);
    expect(new Set(items().map((e) => Math.round(e.getBoundingClientRect().top))).size).to.equal(6);
    await setWidth(500);
    expect(colsOfRows(items().slice(0, 3))).to.equal(3);
    expect(new Set(items().map((e) => Math.round(e.getBoundingClientRect().top))).size).to.equal(8);
  });

  it('skeleton = N × 2 cards with the same column count; follows a width change while it shows; 1 column → 2 cards', async () => {
    const { ad } = await open({ columns: 'fixed' }, { manual: true });
    const sk = () => q('.td-media-picker__skeleton');
    await until(() => !sk().hidden, 4000, 'skeleton');
    await frame();
    await setWidth(1300);
    expect(cols()).to.equal('8');
    expect(sk().childElementCount).to.equal(16);
    expect(tracks(sk())).to.equal(8);
    await setWidth(800);
    expect(sk().childElementCount).to.equal(8);
    expect(tracks(sk())).to.equal(4);
    await setWidth(250);
    expect(cols()).to.equal('1');
    expect(sk().childElementCount).to.equal(2);
    expect(tracks(sk())).to.equal(1);
    await setWidth(500);
    expect(sk().childElementCount).to.equal(6);
    ad.calls.list[0].resolve();
    await firstPage();
  });

  it('token --td-media-picker-fixed-card-min moves the threshold', async () => {
    await open({ columns: 'fixed' });
    await firstPage();
    await setWidth(1000);
    expect(cols()).to.equal('6');
    document.documentElement.style.setProperty('--td-media-picker-fixed-card-min', '200px');
    await setWidth(1001); // any resize re-measures
    expect(cols()).to.equal('4');
    document.documentElement.style.setProperty('--td-media-picker-fixed-card-min', '100px');
    await setWidth(1002);
    expect(cols()).to.equal('8');
  });

  it("'auto' (default) and an unknown value: no data-columns / data-cols, 30 skeleton cards", async () => {
    const warn = console.warn;
    const warns = [];
    console.warn = (m) => warns.push(String(m));
    try {
      await open({}, { manual: true });
      expect(pickerRoot().hasAttribute('data-columns')).to.equal(false);
      expect(q('.td-media-picker__skeleton').childElementCount).to.equal(30);
      await setWidth(800);
      expect(pickerRoot().hasAttribute('data-cols')).to.equal(false);
      await closeAll();
      await open({ columns: 'grid' }, { manual: true });
      expect(pickerRoot().hasAttribute('data-columns')).to.equal(false);
      expect(q('.td-media-picker__skeleton').childElementCount).to.equal(30);
      expect(warns.some((m) => m.includes('options.columns'))).to.equal(true);
    } finally {
      console.warn = warn;
    }
  });
});
