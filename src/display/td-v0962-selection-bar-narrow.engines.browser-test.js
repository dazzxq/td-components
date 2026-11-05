import { expect } from '@esm-bundle/chai';
import { TdSelectionBar } from './td-selection-bar.js';
import './td-media-grid.js';

// v0.96.2 (dwp 05/11): a narrow fold="count" bar never lets the tray run over the count. dwp repro: bar ~327px, one
// primary with a long label ("Thêm vào album") + "…" — the "…" sat on top of "N đã chọn". Now, when the full count does not
// fit, its words leave the screen whole (data-td-count-short; the number stays, the words stay for assistive tech), then
// the primary label takes an ellipsis. Chromium + Firefox + WebKit.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const root = document.createElement('div');
document.body.appendChild(root);

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const settle = async () => { await Promise.resolve(); await raf(); await raf(); await raf(); };
async function waitFor(cond, timeout = 3000, what = 'condition') {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    if (cond()) return;
    await raf();
  }
  throw new Error(`timeout waiting for ${what}`);
}
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0 }));
const items = (n) => Array.from({ length: n }, (_, i) => `<div data-td-media-item data-id="n${i + 1}">`
  + `<button type="button" data-td-media-open aria-label="n ${i + 1}"><img src="/test/fixtures/1.svg" alt="" width="120" height="90"></button></div>`).join('');
const ACTIONS = `<button type="button" data-td-action="download" data-td-action-icon="download">Tải về</button>
  <button type="button" data-td-action="album" data-td-action-icon="folder-plus" data-td-tone="primary">Thêm vào album</button>`;

async function mount(width, actions = ACTIONS, picks = 1) {
  root.style.inlineSize = width;
  root.innerHTML = `<td-media-grid id="g" label="g" selection-group="v962">${items(12)}</td-media-grid>`
    + `<td-selection-bar group="v962" fold="count">${actions}</td-selection-bar>`;
  const g = root.querySelector('td-media-grid');
  const b = root.querySelector('td-selection-bar');
  await waitFor(() => b.grids.length === 1, 2000, 'bar attached');
  for (let i = 1; i <= picks; i++) click(g.querySelector(`[data-id="n${i}"] .td-media-grid__tick`));
  await waitFor(() => !b.hasAttribute('data-empty'), 2000, 'selection');
  await settle();
  await settle();
  return b;
}

const box = (el) => el.getBoundingClientRect();
const short = (bar) => bar.hasAttribute('data-td-count-short');
const overlaps = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5;
/** the visible pieces of the bar, left to right: × , the count number, the count words, the tray's shown buttons */
function pieces(bar) {
  const q = (s) => bar.querySelector(s);
  const list = [['clear', q('.td-selection-bar__clear')], ['n', q('.td-selection-bar__count-n')]];
  if (!short(bar)) for (const t of bar.querySelectorAll('.td-selection-bar__count-text')) list.push(['words', t]);
  for (const el of q('.td-selection-bar__actions').children) {
    if (el.hidden || el.hasAttribute('data-td-overflow') || box(el).width === 0) continue;
    list.push([el.getAttribute('data-td-action') || '…', el]);
  }
  return list;
}
function expectNoOverlap(bar) {
  const p = pieces(bar);
  const panel = box(bar.querySelector('.td-selection-bar__panel'));
  for (let i = 0; i < p.length; i++) {
    const a = box(p[i][1]);
    expect(a.left, `${p[i][0]} inside the panel (start)`).to.be.at.least(panel.left - 0.5);
    expect(a.right, `${p[i][0]} inside the panel (end)`).to.be.at.most(panel.right + 0.5);
    for (let j = i + 1; j < p.length; j++) {
      expect(overlaps(a, box(p[j][1])), `${p[i][0]} overlaps ${p[j][0]}`).to.equal(false);
    }
  }
}

describe('v0.96.2 td-selection-bar fold="count" narrow: no overlap', () => {
  afterEach(() => { root.innerHTML = ''; root.style.inlineSize = ''; });

  it('dwp repro (327px, long primary + "…"): nothing overlaps, the number stays whole', async () => {
    const bar = await mount('327px');
    expect(bar.hasAttribute('data-td-narrow')).to.equal(true);
    expect(bar.querySelector('.td-selection-bar__more').hidden).to.equal(false);
    expectNoOverlap(bar);
    const n = bar.querySelector('.td-selection-bar__count-n');
    expect(n.textContent).to.equal('1');
    expect(n.scrollWidth).to.be.at.most(Math.ceil(box(n).width) + 1);
    expect(bar.querySelector('.td-selection-bar__count').textContent).to.equal(TdSelectionBar.labels.count.replace('{n}', '1'));
  });

  it('tighter (260px, two-digit count): the words give way first, then the primary label ellipsizes', async () => {
    const bar = await mount('260px', ACTIONS, 12);
    expectNoOverlap(bar);
    expect(bar.querySelector('.td-selection-bar__count-n').textContent).to.equal('12');
    const label = bar.querySelector('[data-td-action="album"] .td-selection-bar__label');
    expect(label.scrollWidth, 'primary label truncated').to.be.greaterThan(label.clientWidth);
    const words = bar.querySelector('.td-selection-bar__count-text');
    expect(short(bar), 'count words gone (whole) before the label truncates').to.equal(true);
    expect(box(words).width, 'no stub of the words left').to.be.at.most(1);
    expect(words.textContent.trim(), 'the words stay for assistive tech').to.not.equal('');
  });

  it('room enough (440px): full count text and full primary label, still narrow', async () => {
    const bar = await mount('440px');
    expect(bar.hasAttribute('data-td-narrow')).to.equal(true);
    expectNoOverlap(bar);
    expect(short(bar), 'full count words').to.equal(false);
    const label = bar.querySelector('[data-td-action="album"] .td-selection-bar__label');
    expect(label.scrollWidth).to.be.at.most(label.clientWidth + 1);
  });

  it('wide (800px): not narrow, never short', async () => {
    const bar = await mount('800px');
    expect(bar.hasAttribute('data-td-narrow')).to.equal(false);
    expect(short(bar)).to.equal(false);
    expectNoOverlap(bar);
  });

  it('back from narrow to wide: the primary keeps its natural width (no stale shrunk measurement)', async () => {
    const bar = await mount('300px');
    expect(bar.hasAttribute('data-td-narrow')).to.equal(true);
    expect(short(bar)).to.equal(true);
    root.style.inlineSize = '900px';
    await waitFor(() => !bar.hasAttribute('data-td-narrow'), 2000, 'leave narrow');
    expect(short(bar), 'short state cleared with narrow').to.equal(false);
    await settle();
    const label = bar.querySelector('[data-td-action="album"] .td-selection-bar__label');
    expect(label.scrollWidth).to.be.at.most(label.clientWidth + 1);
    expectNoOverlap(bar);
  });

  it('fold="width" (default) never gets the narrow state', async () => {
    root.style.inlineSize = '327px';
    root.innerHTML = `<td-media-grid id="g" label="g" selection-group="v962w">${items(2)}</td-media-grid>`
      + `<td-selection-bar group="v962w">${ACTIONS}</td-selection-bar>`;
    const b = root.querySelector('td-selection-bar');
    await waitFor(() => b.grids.length === 1, 2000, 'bar attached');
    click(root.querySelector('[data-id="n1"] .td-media-grid__tick'));
    await waitFor(() => !b.hasAttribute('data-empty'), 2000, 'selection');
    await settle();
    expect(b.hasAttribute('data-td-narrow')).to.equal(false);
  });
});
