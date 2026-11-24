import { expect } from '@esm-bundle/chai';
import { TdEmptyState } from './td-empty-state.js';

// v0.124.0 (plan docs/internal/plans/v0.124.0-empty-width-sticky-narrow.md QĐ1, dsuite K-EMPTY-1) — the host is an inline-size
// container, so before 0.124 a parent that centres its children or sizes to content shrank it to ~0 (text broken per word).
// Now: 100% of the parent in block / grid justify-items:center / flex column align-items:center; shares a flex row; a
// shrink-to-fit parent sees --td-empty-state-intrinsic-w (16rem). Real layout, Chromium / Firefox / WebKit.
void TdEmptyState;
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const frames = (n = 2) => new Promise((r) => { const step = (k) => (k ? requestAnimationFrame(() => step(k - 1)) : r()); step(n); });
const box = document.createElement('div');
document.body.appendChild(box);
afterEach(() => { box.replaceChildren(); });

/** A parent styled through CSSOM (test page only) holding one td-empty-state (+ optional sibling). */
async function mk(style, { sibling = null, host = null } = {}) {
  const p = document.createElement('div');
  Object.assign(p.style, style);
  if (sibling) { const s = document.createElement('div'); Object.assign(s.style, sibling); p.appendChild(s); }
  const es = document.createElement('td-empty-state');
  es.setAttribute('title', 'Chưa có dữ liệu hiệu quả');
  es.setAttribute('message', 'Link rút gọn này chưa có lượt nhấp nào trong khoảng thời gian đã chọn.');
  if (host) Object.assign(es.style, host);
  p.appendChild(es);
  box.appendChild(p);
  await frames(2);
  return { p, es, title: es.querySelector('.td-empty-state__title') };
}
const w = (el) => el.getBoundingClientRect().width;
const oneLine = (el) => el.getBoundingClientRect().height < parseFloat(getComputedStyle(el).lineHeight) * 1.6;

describe('v0.124.0 td-empty-state takes its width from the parent (K-EMPTY-1)', () => {
  it('block parent 600px: full width (unchanged)', async () => {
    const { es, title } = await mk({ width: '600px' });
    expect(Math.abs(w(es) - 600)).to.be.below(1);
    expect(oneLine(title)).to.equal(true);
  });

  it('grid justify-items: center, 600px: full width, title on one line', async () => {
    const { es, title } = await mk({ width: '600px', display: 'grid', justifyItems: 'center' });
    expect(Math.abs(w(es) - 600)).to.be.below(1);
    expect(oneLine(title)).to.equal(true);
  });

  it('flex column align-items: center, 600px: full width', async () => {
    const { es, title } = await mk({ width: '600px', display: 'flex', flexDirection: 'column', alignItems: 'center' });
    expect(Math.abs(w(es) - 600)).to.be.below(1);
    expect(oneLine(title)).to.equal(true);
  });

  it('flex row next to a 200px item (gap 16px): shares the row, height not stretched beyond its content', async () => {
    const { es } = await mk({ width: '600px', display: 'flex', gap: '16px', alignItems: 'flex-start' }, { sibling: { width: '200px', height: '600px', flex: 'none' } });
    expect(Math.abs(w(es) - 384)).to.be.below(1);
    expect(es.getBoundingClientRect().height).to.be.below(600);
  });

  it('width: fit-content parent (only child): 16rem, not ~0; title not broken per word', async () => {
    const { p, es } = await mk({ width: 'fit-content' });
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    expect(Math.abs(w(es) - 16 * rem)).to.be.below(1);
    expect(Math.abs(w(p) - 16 * rem)).to.be.below(1);
  });

  it('display: inline-block parent: 16rem', async () => {
    const { es } = await mk({ display: 'inline-block' });
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    expect(Math.abs(w(es) - 16 * rem)).to.be.below(1);
  });

  it('--td-empty-state-intrinsic-w: 0px restores the old shrink-to-fit width (~0)', async () => {
    const { es } = await mk({ width: 'fit-content' }, { host: {} });
    es.style.setProperty('--td-empty-state-intrinsic-w', '0px');
    await frames(2);
    expect(w(es)).to.be.below(2);
  });

  it('narrow 300px frame in a centring grid: actions still stack (container query sees the real width)', async () => {
    const { es } = await mk({ width: '300px', display: 'grid', justifyItems: 'center' });
    es.actions = [{ label: 'Tạo link' }, { label: 'Tải lại' }];
    await frames(2);
    const acts = es.querySelector('.td-empty-state__actions');
    expect(Math.abs(w(es) - 300)).to.be.below(1);
    expect(getComputedStyle(acts).flexDirection).to.equal('column');
  });
});
