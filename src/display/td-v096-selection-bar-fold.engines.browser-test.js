import { expect } from '@esm-bundle/chai';
import './td-selection-bar.js';
import './td-media-grid.js';

// v0.96.0 (plan docs/internal/plans/v0.96.0-action-fold.md §5 / §10.2) — <td-selection-bar> fold="count" (shared policy
// + step-2 width fold), data-td-tone="primary", data-td-in-menu, surface="glass"; the default (no new attribute) keeps
// the v0.95.0 DOM. Chromium + Firefox + WebKit. Synthetic clicks; waits on rAF-polled conditions.
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

const items = (prefix, n) => Array.from({ length: n }, (_, i) => `<div data-td-media-item data-id="${prefix}${i + 1}">`
  + `<button type="button" data-td-media-open aria-label="${prefix} ${i + 1}"><img src="/test/fixtures/1.svg" alt="" width="120" height="90"></button></div>`).join('');
const V095 = `<button type="button" data-td-action="download" data-td-action-icon="download">Tải về</button>
  <button type="button" data-td-action="tag" data-td-action-icon="tag">Gắn thẻ</button>
  <button type="button" data-td-action="album" data-td-action-icon="folder-plus">Thêm vào album</button>
  <button type="button" data-td-action="delete" data-td-action-icon="trash" data-td-tone="danger">Xoá</button>`;
const COUNT = `<button type="button" data-td-action="download" data-td-action-icon="download">Tải về</button>
  <button type="button" data-td-action="tag" data-td-action-icon="tag">Gắn thẻ</button>
  <button type="button" data-td-action="album" data-td-action-icon="folder-plus">Thêm vào album</button>
  <button type="button" data-td-action="link" data-td-in-menu>Sao chép liên kết</button>
  <button type="button" data-td-action="share" data-td-action-icon="upload" data-td-tone="primary">Chia sẻ</button>`;

async function mount(bar, actions, width = '1000px') {
  root.style.maxInlineSize = width;
  root.innerHTML = `<td-media-grid id="g" label="g" selection-group="v96">${items('g', 3)}</td-media-grid>`
    + `<td-selection-bar group="v96" ${bar}>${actions}</td-selection-bar>`;
  const g = root.querySelector('td-media-grid');
  const b = root.querySelector('td-selection-bar');
  await waitFor(() => b.grids.length === 1, 2000, 'bar attached');
  click(g.querySelector('[data-id="g1"] .td-media-grid__tick'));
  await waitFor(() => !b.hasAttribute('data-empty'), 2000, 'selection');
  await settle();
  return b;
}
const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, ...init }));
const tray = (bar) => bar.querySelector('.td-selection-bar__actions');
const more = (bar) => bar.querySelector('.td-selection-bar__more');
const act = (bar, name) => bar.querySelector(`[data-td-action="${name}"]`);
const shown = (bar) => [...tray(bar).children]
  .filter((el) => !el.hidden && !el.hasAttribute('data-td-overflow'))
  .map((el) => el.getAttribute('data-td-action') || (el === more(bar) ? '…' : el.className));
const resize = async (w) => { root.style.maxInlineSize = w; await settle(); await settle(); };

afterEach(async () => {
  root.innerHTML = '';
  root.style.removeProperty('max-inline-size');
  document.querySelectorAll('.td-menu').forEach((m) => m.remove());
  await settle();
});

describe('td-selection-bar v0.96.0 — default = v0.95.0', () => {
  it('no fold / surface / new tone: same classes, tray order and overflow as v0.95.0', async () => {
    const bar = await mount('', V095);
    expect(bar.fold).to.equal('width');
    expect(bar.surface).to.equal('solid');
    expect(bar.classList.contains('td-selection-bar--glass')).to.equal(false);
    expect(bar.querySelector('.td-selection-bar__panel').className).to.equal('td-selection-bar__panel');
    expect([...tray(bar).children].map((el) => el.getAttribute('data-td-action') || 'more'))
      .to.deep.equal(['download', 'tag', 'album', 'delete', 'more']);
    expect(act(bar, 'download').className).to.equal('td-btn td-btn--ghost td-selection-bar__action td-selection-bar__action--icon');
    expect(act(bar, 'delete').className).to.contain('td-selection-bar__action--danger');
    expect(bar.querySelectorAll('.td-btn--primary, .td-selection-bar__action--primary').length).to.equal(0);
    expect(more(bar).hidden).to.equal(true);
    await resize('300px');
    await waitFor(() => !more(bar).hidden, 2000, '"…" at 300px');
    const over = [...tray(bar).children].filter((el) => el.hasAttribute('data-td-overflow')).map((el) => el.getAttribute('data-td-action'));
    expect(over.length).to.be.greaterThan(0);
    expect(over[over.length - 1]).to.equal('delete'); // from the end, as v0.95.0
  });
});

describe('td-selection-bar v0.96.0 — fold="count"', () => {
  it('wide: 2 secondaries, "…", the primary last; data-td-in-menu + the 3rd in "…" (menu order = DOM)', async () => {
    const bar = await mount('fold="count"', COUNT);
    await waitFor(() => shown(bar).join() === 'download,tag,…,share', 2000, `wide plan, got ${shown(bar)}`);
    expect(tray(bar).lastElementChild).to.equal(act(bar, 'share'));
    expect(act(bar, 'share').previousElementSibling).to.equal(more(bar));
    expect(act(bar, 'album').hasAttribute('data-td-overflow')).to.equal(true);
    expect(act(bar, 'link').hasAttribute('data-td-overflow')).to.equal(true);
    click(more(bar));
    await waitFor(() => document.querySelector('.td-menu'), 2000, 'menu');
    const labels = [...document.querySelectorAll('.td-menu [role="menuitem"]')].map((el) => el.textContent.trim());
    expect(labels).to.deep.equal(['Thêm vào album', 'Sao chép liên kết']);
  });

  it('primary tone: solid accent class, never folded, keeps its label when compact', async () => {
    const bar = await mount('fold="count"', COUNT, '400px');
    await waitFor(() => shown(bar).join() === '…,share', 2000, `narrow plan, got ${shown(bar)}`);
    const p = act(bar, 'share');
    expect(p.classList.contains('td-btn--primary')).to.equal(true);
    expect(p.classList.contains('td-btn--ghost')).to.equal(false);
    expect(p.classList.contains('td-selection-bar__action--primary')).to.equal(true);
    expect(bar.hasAttribute('data-compact')).to.equal(true);
    const label = p.querySelector('.td-selection-bar__label');
    expect(getComputedStyle(label).position).to.not.equal('absolute');
    const panel = bar.querySelector('.td-selection-bar__panel');
    expect(panel.scrollWidth).to.be.at.most(panel.clientWidth + 1);
  });

  it('narrow < 480 → primary + "…"; back ≥ 488 → 2 secondaries; no flicker inside the band', async () => {
    const bar = await mount('fold="count"', COUNT, '900px');
    await waitFor(() => shown(bar).join() === 'download,tag,…,share', 2000, 'wide');
    await resize('400px');
    await waitFor(() => shown(bar).join() === '…,share', 2000, 'narrow');
    await resize('484px'); // inside the band (472–488): stays narrow
    expect(shown(bar).join()).to.equal('…,share');
    await resize('900px');
    await waitFor(() => shown(bar).join() === 'download,tag,…,share', 2000, 'wide again');
  });

  it('step 2 (the test viewport is 800px wide): labels at 600px fold the 2nd then the 1st secondary — never the primary; wider → shown again', async () => {
    const long = `<button type="button" data-td-action="a" data-td-action-icon="download">Tải về toàn bộ ảnh</button>
      <button type="button" data-td-action="b" data-td-action-icon="tag">Gắn thẻ cho ảnh</button>
      <button type="button" data-td-action="p" data-td-action-icon="upload" data-td-tone="primary">Chia sẻ album</button>`;
    const bar = await mount('fold="count"', long, '1000px');
    await waitFor(() => shown(bar).join() === 'a,b,p', 2000, `wide, got ${shown(bar)}`);
    await resize('600px'); // ≥ 576 (36rem): not compact, labels shown
    await waitFor(() => !shown(bar).includes('b'), 2000, `b folded, got ${shown(bar)}`);
    expect(shown(bar)).to.include('p');
    expect(shown(bar)).to.include('…');
    const panel = bar.querySelector('.td-selection-bar__panel');
    expect(panel.scrollWidth).to.be.at.most(panel.clientWidth + 1);
    await resize('1000px');
    await waitFor(() => shown(bar).join() === 'a,b,p', 2000, `unfolded, got ${shown(bar)}`);
  });

  it('fold="width" + primary: fitActions never folds the primary; data-td-in-menu always in "…"', async () => {
    const bar = await mount('', COUNT, '330px');
    await waitFor(() => !more(bar).hidden, 2000, '"…"');
    expect(act(bar, 'share').hasAttribute('data-td-overflow')).to.equal(false);
    expect(act(bar, 'link').hasAttribute('data-td-overflow')).to.equal(true);
    await resize('1400px');
    await waitFor(() => !act(bar, 'download').hasAttribute('data-td-overflow'), 2000, 'wide');
    expect(act(bar, 'link').hasAttribute('data-td-overflow')).to.equal(true);
    expect(more(bar).hidden).to.equal(false);
  });

  it('fold changed at runtime: width → count → width', async () => {
    const bar = await mount('', COUNT, '1000px');
    bar.setAttribute('fold', 'count');
    await waitFor(() => shown(bar).join() === 'download,tag,…,share', 2000, `count, got ${shown(bar)}`);
    bar.fold = 'width';
    await waitFor(() => !act(bar, 'album').hasAttribute('data-td-overflow'), 2000, 'width');
    expect(bar.getAttribute('fold')).to.equal('width');
  });
});

describe('td-selection-bar v0.96.0 — surface="glass"', () => {
  it('glass classes, radius 20px, a transparent 12/16px gap (in the offset), clicks pass the gap', async () => {
    const bar = await mount('surface="glass"', V095);
    const panel = bar.querySelector('.td-selection-bar__panel');
    expect(bar.classList.contains('td-selection-bar--glass')).to.equal(true);
    expect(panel.classList.contains('td-glass-surface')).to.equal(true);
    expect(panel.classList.contains('td-glass-surface--strong')).to.equal(true);
    expect(getComputedStyle(panel).borderTopLeftRadius).to.equal('20px');
    const gap = parseFloat(getComputedStyle(bar).paddingBlockEnd);
    expect([12, 16]).to.include(gap);
    expect(getComputedStyle(bar).pointerEvents).to.equal('none');
    expect(getComputedStyle(panel).pointerEvents).to.equal('auto');
    await waitFor(() => parseFloat(document.documentElement.style.getPropertyValue('--td-selection-bar-offset')) > 0, 2000, 'offset');
    const offset = parseFloat(document.documentElement.style.getPropertyValue('--td-selection-bar-offset'));
    expect(offset).to.be.closeTo(bar.getBoundingClientRect().height, 1);
    expect(offset).to.be.greaterThan(panel.getBoundingClientRect().height + gap - 1);
    const pr = panel.getBoundingClientRect();
    const br = bar.getBoundingClientRect();
    expect(pr.left).to.be.closeTo(br.left, 0.5);
    expect(pr.right).to.be.closeTo(br.right, 0.5);
  });

  it('surface changed at runtime: glass → solid removes every glass class', async () => {
    const bar = await mount('surface="glass"', V095);
    bar.surface = 'solid';
    await settle();
    const panel = bar.querySelector('.td-selection-bar__panel');
    expect(bar.classList.contains('td-selection-bar--glass')).to.equal(false);
    expect(panel.className).to.equal('td-selection-bar__panel');
    expect(getComputedStyle(bar).paddingBlockEnd).to.equal('0px');
  });
});

// v0.96.0 — fold="width" with a forced-menu action: the fit maths must match the real row (no double gap). The tray is
// `justify-content: flex-end`, so the free space of a row that fits is the distance from the tray's start to its first
// visible child. Found by a 1px sweep around the boundary (the fold decision has hysteresis, so each sweep runs in ONE
// direction from a state that was reached the same way).
describe('td-selection-bar v0.96.0 — fold="width" boundary (no double gap)', () => {
  const W3 = `<button type="button" data-td-action="a" data-td-action-icon="download">Tải về ảnh</button>
    <button type="button" data-td-action="b" data-td-action-icon="tag">Gắn thẻ ảnh</button>
    <button type="button" data-td-action="c" data-td-action-icon="folder-plus">Thêm vào album</button>`;
  const W3S = `<button type="button" data-td-action="a" data-td-action-icon="download">Tải</button>
    <button type="button" data-td-action="b" data-td-action-icon="tag">Thẻ</button>
    <button type="button" data-td-action="c" data-td-action-icon="folder-plus">Album</button>`;
  const LINK = '<button type="button" data-td-action="link" data-td-in-menu>Sao chép liên kết</button>';
  const PRIMARY = '<button type="button" data-td-action="share" data-td-action-icon="upload" data-td-tone="primary">Chia sẻ</button>';
  const folded = (bar, name) => act(bar, name).hasAttribute('data-td-overflow');
  const visible = (bar) => [...tray(bar).children].filter((el) => !el.hidden && !el.hasAttribute('data-td-overflow') && el.getBoundingClientRect().width > 0);
  const slack = (bar) => visible(bar)[0].getBoundingClientRect().left - tray(bar).getBoundingClientRect().left;
  const gapOf = (bar) => parseFloat(getComputedStyle(tray(bar)).columnGap);
  // is `name` shown at width `w`? (after settling)
  async function at(bar, w) { await resize(`${w}px`); return !folded(bar, 'c'); }

  /** shrink 16px at a time from 780 until `c` folds, then return to the last width it was shown at and find the exact px */
  async function boundary(bar) {
    const TOP = 780;
    let w = TOP;
    await resize(`${w}px`);
    expect(folded(bar, 'c'), `c fits at ${TOP}`).to.equal(false);
    while (w > 520 && await at(bar, w - 16)) w -= 16;
    expect(w, 'boundary found above the 480px compact threshold').to.be.greaterThan(520);
    await resize(`${TOP}px`);
    await at(bar, w); // same direction as the first sweep: shown here
    expect(folded(bar, 'c')).to.equal(false);
    while (await at(bar, w - 1)) w -= 1;
    return w; // the narrowest width c is still shown at (w - 1 folds it)
  }

  async function check(bar, label) {
    const gap = gapOf(bar);
    expect(gap, 'column gap is big enough for the check to mean something').to.be.at.least(6);
    const wLast = await boundary(bar);
    await resize('780px'); // reach wLast by shrinking (the fold has hysteresis)
    await resize(`${wLast}px`);
    // wLast was reached by shrinking: c still shown and the row really fits
    expect(folded(bar, 'c'), `${label}: c shown at ${wLast}`).to.equal(false);
    const t = tray(bar);
    expect(t.scrollWidth, `${label}: no overflow at ${wLast}`).to.be.at.most(t.clientWidth + 1);
    const s = slack(bar);
    // not pushed early: shown at the last px it fits (hysteresis lets it hang on 1px). A double gap would leave ≥ gap px.
    expect(s, `${label}: slack at the last width c fits (gap ${gap})`).to.be.within(-1.5, 2.5);
    // the gap before "…" is ONE gap
    const lastAction = visible(bar).filter((el) => el !== more(bar)).pop();
    const m = more(bar);
    if (!m.hidden && lastAction && lastAction.compareDocumentPosition(m) & 4) {
      expect(m.getBoundingClientRect().left - lastAction.getBoundingClientRect().right, `${label}: one gap`).to.be.closeTo(gap, 1.5);
    }
    // 1px narrower → c is folded and the row still fits
    await resize(`${wLast - 1}px`);
    expect(folded(bar, 'c'), `${label}: c folded at ${wLast - 1}`).to.equal(true);
    expect(t.scrollWidth, `${label}: no overflow once folded`).to.be.at.most(t.clientWidth + 1);
    expect(folded(bar, 'b'), `${label}: b still fits`).to.equal(false);
    expect(more(bar).hidden, `${label}: "…" shown`).to.equal(false);
    // back up: shown again within the hysteresis band (leave = 4px, + the 1px enter slack)
    let up = wLast - 1;
    while (folded(bar, 'c') && up < wLast + 12) { up += 1; await resize(`${up}px`); }
    expect(folded(bar, 'c'), `${label}: shown again`).to.equal(false);
    expect(up - wLast, `${label}: hysteresis band`).to.be.at.most(7);
    return wLast;
  }

  it('2+ actions + a forced-menu action (no primary): c folds only when it no longer fits; "…" + the item are right', async () => {
    const bar = await mount('', W3 + LINK, '780px');
    await waitFor(() => !more(bar).hidden, 2000, '"…" always shown');
    expect(folded(bar, 'link')).to.equal(true);
    const wl = await check(bar, 'in-menu, no primary');
    // forced item + the folded c: menu order = DOM order
    await resize('780px');
    await resize(`${wl - 1}px`);
    expect(folded(bar, 'c')).to.equal(true);
    click(more(bar));
    await waitFor(() => document.querySelector('.td-menu'), 2000, 'menu');
    expect([...document.querySelectorAll('.td-menu [role="menuitem"]')].map((el) => el.textContent.trim()))
      .to.deep.equal(['Thêm vào album', 'Sao chép liên kết']);
  });

  it('no forced item, no primary: the same boundary (the trailing gap is given back)', async () => {
    const bar = await mount('', W3, '780px');
    expect(more(bar).hidden).to.equal(true);
    await check(bar, 'plain');
  });

  it('forced item + a primary action: the primary is never folded and is not charged twice', async () => {
    const bar = await mount('', W3S + LINK + PRIMARY, '780px');
    await waitFor(() => !more(bar).hidden, 2000, '"…"');
    expect(folded(bar, 'share')).to.equal(false);
    await check(bar, 'in-menu + primary');
    expect(folded(bar, 'share')).to.equal(false);
  });
});
