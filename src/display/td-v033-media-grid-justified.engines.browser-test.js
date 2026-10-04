import { expect } from '@esm-bundle/chai';
import { sendKeys, setViewport } from '@web/test-runner-commands';
import './td-media-grid.js';
import './td-sortable.js';
import { packRows, rowStyles } from '../utils/justified.js';

// v0.33.0 — td-media-grid layout="justified" (plan v0.33.0 decisions 32-36). Chromium + Firefox + WebKit.
// Geometry is measured only after real signals (rAF-polled conditions, resize observations, load events) — never after
// fixed sleeps (CI WebKit is slow).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

document.body.style.setProperty('margin', '0');
const root = document.createElement('div');
root.style.setProperty('padding', '0 10px');
document.body.appendChild(root);

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const frames = async (n = 2) => { for (let i = 0; i < n; i++) await raf(); };
async function waitFor(cond, timeout = 4000, what = 'condition') {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    if (cond()) return;
    await raf();
  }
  throw new Error(`timeout waiting for ${what}`);
}

const SRC = {
  portrait: ['/test/fixtures/portrait.svg', 800, 1200],
  square: ['/test/fixtures/square.svg', 1000, 1000],
  land: ['/test/fixtures/1.svg', 1200, 800],
  pano: ['/test/fixtures/panorama.svg', 1800, 600],
};
const MIX = ['land', 'portrait', 'pano', 'square', 'land', 'land', 'portrait', 'portrait', 'square', 'pano', 'land', 'portrait',
  'square', 'land', 'pano', 'portrait', 'land', 'square', 'portrait', 'land', 'land', 'pano', 'portrait', 'square'];

/**
 * One item; ratio given by data-td-ar (every 3rd), else by the <img> width / height attributes.
 * @param {string} kind key of SRC
 */
function itemHtml(id, kind, { sort = false, known = true, i = 0 } = {}) {
  const [src, w, h] = SRC[kind];
  const ar = known && i % 3 === 0 ? ` data-td-ar="${w}/${h}"` : '';
  const dims = known && i % 3 !== 0 ? ` width="${w}" height="${h}"` : '';
  return `<div data-td-media-item data-id="${id}"${sort ? ` data-td-sort-item data-td-sort-label="Ảnh ${id}"` : ''}${ar}>`
    + `<button type="button" data-td-media-open aria-label="Ảnh ${id}"><img src="${src}" alt=""${dims}></button></div>`;
}
const arOfKind = (k) => SRC[k][1] / SRC[k][2];

function mount(kinds = MIX, { sortable = false, attrs = 'layout="justified"' } = {}) {
  const items = kinds.map((k, i) => itemHtml(`p${i + 1}`, k, { sort: sortable, i })).join('');
  root.innerHTML = `<td-media-grid label="Album" ${attrs}>${sortable ? `<td-sortable role="none" label="Sắp xếp">${items}</td-sortable>` : items}</td-media-grid>`;
  const grid = root.querySelector('td-media-grid');
  return { grid, box: sortable ? grid.querySelector('td-sortable') : grid };
}
const itemsOf = (grid) => grid.items;
const gapOf = (box) => parseFloat(getComputedStyle(box).columnGap) || 0;

/** rows by offset top (±1px) → arrays of { el, r } */
function rows(grid) {
  const out = [];
  for (const el of itemsOf(grid)) {
    const r = el.getBoundingClientRect();
    const row = out.find((x) => Math.abs(x.top - r.top) < 1);
    if (row) row.cells.push({ el, r });
    else out.push({ top: r.top, cells: [{ el, r }] });
  }
  return out.sort((a, b) => a.top - b.top).map((x) => x.cells.sort((a, b) => a.r.left - b.r.left));
}

/**
 * Asserts the decision-33 invariants: full rows fill the container ±1px (never exceed it), the short last row ≤
 * container, no horizontal overflow, equal heights per row ±1px, box ratio ≈ item ratio (≤ 1% + the 0.5px slack),
 * every row's height = the height rowStyles() predicts ±1px.
 */
function checkInvariants(grid, box, ars, label = '') {
  const cw = box.getBoundingClientRect().width;
  const gap = gapOf(box);
  const target = parseFloat(getComputedStyle(itemsOf(grid)[0]).getPropertyValue('--_td-mg-sigma')); // v0.34.0: per grid width
  const expected = rowStyles(packRows(ars, target), target, gap, cw);
  const got = rows(grid);
  expect(got.length, `${label} row count`).to.equal(expected.length);
  expect(box.scrollWidth, `${label} no horizontal overflow`).to.be.at.most(box.clientWidth + 0.5);
  let i = 0;
  got.forEach((cells, ri) => {
    const exp = expected[ri];
    expect(cells.length, `${label} row ${ri} size`).to.equal(exp.cells.length);
    const total = cells.reduce((a, c) => a + c.r.width, 0) + (cells.length - 1) * gap;
    if (exp.full) {
      expect(total, `${label} full row ${ri} width`).to.be.within(cw - 1, cw + 0.01);
    } else {
      expect(total, `${label} short row ${ri} width`).to.be.at.most(cw + 0.01);
    }
    const h0 = cells[0].r.height;
    const hExp = exp.widths[0] * exp.k / exp.cells[0].w;
    expect(Math.abs(h0 - hExp), `${label} row ${ri} height ${h0} vs ${hExp}`).to.be.at.most(1);
    for (const c of cells) {
      expect(Math.abs(c.r.height - h0), `${label} row ${ri} equal heights`).to.be.at.most(1);
      const ar = Math.min(5, Math.max(0.2, ars[i++]));
      const err = Math.abs(c.r.width / c.r.height - ar) / ar;
      expect(err, `${label} ratio of ${c.el.dataset.id}`).to.be.at.most(0.01 + 0.6 / c.r.width);
      // the image fills the cell
      const img = c.el.querySelector('img').getBoundingClientRect();
      expect(Math.abs(img.width - c.r.width), `${label} img width`).to.be.at.most(0.5);
      expect(Math.abs(img.height - c.r.height), `${label} img height`).to.be.at.most(0.5);
    }
  });
  return { got, expected };
}

/** expected ids per row from packRows() (items in DOM order) */
function idsByPackRows(ars, grid) {
  const target = parseFloat(getComputedStyle(itemsOf(grid)[0]).getPropertyValue('--_td-mg-sigma')); // v0.34.0: per grid width
  const ids = itemsOf(grid).map((el) => el.dataset.id);
  let i = 0;
  return packRows(ars, target).map((row) => row.map(() => ids[i++]));
}

const settled = (grid) => itemsOf(grid).every((it) => it.style.getPropertyValue('--td-mg-w') !== '');

/** resolves on the next ResizeObserver callback for `el` (the grid's own observer fired in the same frame) */
const resized = (el) => new Promise((resolve) => {
  let first = true;
  const ro = new ResizeObserver(() => {
    if (first) { first = false; return; } // initial observation
    ro.disconnect();
    resolve();
  });
  ro.observe(el);
});

before(async () => { await setViewport({ width: 1280, height: 900 }); });
after(async () => { await setViewport({ width: 800, height: 600 }); });
afterEach(() => { root.innerHTML = ''; });

describe('td-media-grid layout="justified" — geometry', () => {
  for (const vw of [360, 768, 1280, 1440]) {
    it(`${vw}px: mixed set and all-portrait set keep every row invariant`, async () => {
      await setViewport({ width: vw, height: 900 });
      await waitFor(() => window.innerWidth === vw, 4000, 'viewport');
      let { grid, box } = mount();
      await waitFor(() => settled(grid), 4000, 'row vars');
      expect(grid.getAttribute('data-td-layout')).to.equal('justified');
      checkInvariants(grid, box, MIX.map(arOfKind), `mixed@${vw}`);
      const portraits = Array(25).fill('portrait');
      ({ grid, box } = mount(portraits));
      await waitFor(() => settled(grid), 4000, 'row vars');
      const { got } = checkInvariants(grid, box, portraits.map(arOfKind), `portraits@${vw}`);
      // 25 portraits: the short last row (1 item, Σ ≤ Σ_prev, n ≤ n_prev) FITS → the height of the full row above ±1px
      // (decision 33), membership = packRows
      const ids = (row) => row.map((c) => c.el.dataset.id);
      expect(got.map(ids)).to.deep.equal(idsByPackRows(portraits.map(arOfKind), grid));
      const last = got[got.length - 1][0].r.height;
      expect(Math.abs(last - got[got.length - 2][0].r.height)).to.be.at.most(1);
      expect(got[got.length - 1].reduce((a, c) => a + c.r.width, 0)).to.be.below(box.getBoundingClientRect().width);
    });
  }

  // Decision 33 contract for a short last row that does NOT fit at the previous height: it stays ≤ the container, keeps
  // packRows()'s membership (no repacking), and its height may differ.
  for (const vw of [1280, 1440]) {
    it(`${vw}px: a short last row that does not fit the previous height stays ≤ container, no item moves`, async () => {
      await setViewport({ width: vw, height: 900 });
      await waitFor(() => window.innerWidth === vw, 4000, 'viewport');
      // Σ target 5.5: [5] closes (5 + 4 = 9 is farther), [4, 1.4] Σ 5.4 < 5.5 → short; at the previous height its width
      // would be 5.4 / 5 × W + gap > W
      const ars = [5, 4, 1.4];
      root.innerHTML = '<td-media-grid label="Album" layout="justified">'
        + ars.map((ar, i) => `<div data-td-media-item data-id="n${i}" data-td-ar="${ar}"><button type="button" data-td-media-open aria-label="Ảnh ${i}"><img src="/test/fixtures/1.svg" alt=""></button></div>`).join('')
        + '</td-media-grid>';
      const grid = root.querySelector('td-media-grid');
      await waitFor(() => settled(grid), 4000, 'row vars');
      expect(getComputedStyle(itemsOf(grid)[0]).getPropertyValue('--_td-mg-sigma').trim()).to.equal('5.5');
      const { got } = checkInvariants(grid, grid, ars, `not-fit@${vw}`);
      const cw = grid.getBoundingClientRect().width;
      const gap = gapOf(grid);
      expect(got.map((row) => row.map((c) => c.el.dataset.id))).to.deep.equal([['n0'], ['n1', 'n2']]);
      const prevH = got[0][0].r.height;
      const atPrev = (4 + 1.4) * prevH + gap; // the short row's width at the previous row's height
      expect(atPrev, 'really does not fit').to.be.above(cw);
      const total = got[1].reduce((a, c) => a + c.r.width, 0) + gap;
      expect(total, 'short row ≤ container').to.be.at.most(cw + 0.01);
      expect(got[1][0].r.height, 'lower than the previous row instead of overflowing').to.be.below(prevH - 1);
    });
  }

  it('Σ target follows the GRID width (v0.34.0 container query: ≥ 1024 5.5 / 720–1023 4 / < 720 2.5), not the viewport', async () => {
    await setViewport({ width: 1280, height: 900 });
    await waitFor(() => window.innerWidth === 1280, 4000, 'viewport');
    const { grid } = mount();
    const sigma = () => getComputedStyle(itemsOf(grid)[0]).getPropertyValue('--_td-mg-sigma').trim();
    for (const [w, t] of [[1100, '5.5'], [1024, '5.5'], [1023, '4'], [720, '4'], [719, '2.5'], [500, '2.5']]) {
      grid.style.setProperty('width', `${w}px`);
      await waitFor(() => Math.round(grid.getBoundingClientRect().width) === w, 4000, `width ${w}`);
      expect(sigma(), `grid ${w}px in a 1280px viewport`).to.equal(t);
    }
    // the rows follow: a 500px grid packs with Σ 2.5
    await waitFor(() => settled(grid), 4000, 'row vars');
    await frames(3);
    checkInvariants(grid, grid, MIX.map(arOfKind), 'grid 500px'); // packs with the item-resolved Σ 2.5
  });
});

describe('td-media-grid layout="justified" — reflow', () => {
  // Root cause of the CI WebKit failures (Linux WebKit 26.4, rev 2287): with align-items: stretch, WebKit caches the
  // flex line's cross size and does not recompute it when the items' aspect-ratio heights change (percentage width on
  // resize, new --td-mg-w / --td-mg-k), so every cell kept the old height. No cell may stretch: each height must come
  // from its own aspect-ratio (the last cell of a full row is then ≤ 0.5px / ratio shorter — the width slack).
  it('no cell stretches to the line (WebKit stale flex-line guard): the row aligns cells to flex-start', async () => {
    const { grid, box } = mount(MIX.slice(0, 6));
    await waitFor(() => settled(grid), 4000, 'row vars');
    expect(getComputedStyle(box).alignItems).to.be.oneOf(['flex-start', 'start']);
    // computed align-self stays `auto` (= the container's align-items) unless a cell overrides it — none may stretch
    for (const it of itemsOf(grid)) expect(getComputedStyle(it).alignSelf, it.dataset.id).to.be.oneOf(['auto', 'flex-start', 'start']);
  });

  it('resize within a breakpoint does not rebuild; crossing one does (once)', async () => {
    await setViewport({ width: 1280, height: 900 });
    await waitFor(() => window.innerWidth === 1280, 4000, 'viewport');
    const { grid, box } = mount();
    await waitFor(() => settled(grid), 4000, 'row vars');
    await frames(3);
    let count = 0;
    const orig = grid._relayout;
    grid._relayout = function spy(...a) { count++; return orig.apply(this, a); };

    let seen = resized(grid);
    await setViewport({ width: 1180, height: 900 });
    await seen;
    await frames(3);
    expect(count, 'same breakpoint').to.equal(0);
    checkInvariants(grid, box, MIX.map(arOfKind), 'after 1180');

    seen = resized(grid);
    await setViewport({ width: 900, height: 900 });
    await seen;
    await waitFor(() => count >= 1, 4000, 'relayout across 1024px');
    await frames(3);
    expect(count, 'crossing 1024px').to.equal(1);
    checkInvariants(grid, box, MIX.map(arOfKind), 'after 900');
    await setViewport({ width: 1280, height: 900 });
  });

  it('unknown ratio: fallback 1.5 first, then exactly one rebuild when the image loads', async () => {
    await setViewport({ width: 1280, height: 900 });
    const u = `/test/fixtures/portrait.svg?u=${Math.random().toString(36).slice(2)}`;
    root.innerHTML = '<td-media-grid layout="justified">'
      + MIX.slice(0, 6).map((k, i) => itemHtml(`k${i}`, k, { i })).join('')
      + `<div data-td-media-item data-id="unk"><button type="button" data-td-media-open aria-label="?"><img src="${u}" alt=""></button></div>`
      + '</td-media-grid>';
    const grid = root.firstElementChild;
    const unk = grid.querySelector('[data-id="unk"]');
    const img = unk.querySelector('img');
    let count = 0;
    const orig = grid._relayout;
    grid._relayout = function spy(...a) { count++; return orig.apply(this, a); };
    const ratio = () => parseFloat(unk.style.getPropertyValue('--td-mg-w')) / parseFloat(unk.style.getPropertyValue('--td-mg-k'));
    expect(img.complete && img.naturalWidth > 0, 'not loaded yet').to.equal(false);
    expect(Math.abs(ratio() - 1.5)).to.be.below(0.01);
    if (!(img.complete && img.naturalWidth > 0)) await new Promise((r) => img.addEventListener('load', r, { once: true }));
    await waitFor(() => count >= 1, 4000, 'rebuild after load');
    await frames(3);
    expect(count).to.equal(1);
    expect(Math.abs(ratio() - 2 / 3) / (2 / 3)).to.be.below(0.01);
    checkInvariants(grid, grid, [...MIX.slice(0, 6).map(arOfKind), 2 / 3], 'after load');
  });

  it('a data-td-ar change rebuilds the rows', async () => {
    const { grid, box } = mount(MIX.slice(0, 8));
    await waitFor(() => settled(grid), 4000, 'row vars');
    const it0 = itemsOf(grid)[0];
    it0.setAttribute('data-td-ar', '3:1');
    await waitFor(() => Math.abs(parseFloat(it0.style.getPropertyValue('--td-mg-w')) / parseFloat(it0.style.getPropertyValue('--td-mg-k')) - 3) < 0.03, 4000, 'new ratio');
    checkInvariants(grid, box, [3, ...MIX.slice(1, 8).map(arOfKind)], 'after data-td-ar');
  });
});

describe('td-media-grid layout="justified" — items / selection / layout switch', () => {
  it('add / remove items: rows rebuilt; selection, Space, Enter → activate still work', async () => {
    const { grid, box } = mount(MIX.slice(0, 10));
    await waitFor(() => settled(grid), 4000, 'row vars');
    grid.select(['p2', 'p5']);
    const acts = [];
    grid.addEventListener('activate', (e) => { e.preventDefault(); acts.push(e.detail.id); });
    const tpl = document.createElement('template');
    tpl.innerHTML = itemHtml('p11', 'pano', { i: 1 }) + itemHtml('p12', 'portrait', { i: 2 });
    grid.append(...tpl.content.childNodes);
    itemsOf(grid)[0].remove();
    const kinds = [...MIX.slice(1, 10), 'pano', 'portrait'];
    await waitFor(() => settled(grid) && itemsOf(grid).length === 11, 4000, 'new items laid out');
    await frames(2);
    checkInvariants(grid, box, kinds.map(arOfKind), 'after add/remove');
    expect(grid.selectedIds).to.deep.equal(['p2', 'p5']);
    grid.querySelector('[data-id="p11"] [data-td-media-open]').focus();
    await sendKeys({ press: 'Space' });
    expect(grid.selectedIds).to.deep.equal(['p2', 'p5', 'p11']);
    await sendKeys({ press: 'Enter' });
    expect(acts).to.deep.equal(['p11']);
  });

  it('removing layout drops every row var + the host flag; setting it again rebuilds', async () => {
    const { grid } = mount(MIX.slice(0, 8));
    await waitFor(() => settled(grid), 4000, 'row vars');
    grid.removeAttribute('layout');
    await waitFor(() => !grid.hasAttribute('data-td-layout'), 4000, 'flag removed');
    for (const it of itemsOf(grid)) {
      for (const p of ['--td-mg-w', '--td-mg-sub', '--td-mg-k']) expect(it.style.getPropertyValue(p), p).to.equal('');
    }
    expect(getComputedStyle(grid).display).to.equal('grid');
    grid.setAttribute('layout', 'justified');
    await waitFor(() => settled(grid), 4000, 'row vars again');
    expect(getComputedStyle(grid).display).to.equal('flex');
  });

  it('disconnect removes the row vars; reconnect lays out again', async () => {
    const { grid } = mount(MIX.slice(0, 6));
    await waitFor(() => settled(grid), 4000, 'row vars');
    const kept = itemsOf(grid);
    grid.remove();
    for (const it of kept) expect(it.style.getPropertyValue('--td-mg-w')).to.equal('');
    expect(grid.hasAttribute('data-td-layout')).to.equal(false);
    root.appendChild(grid);
    await waitFor(() => settled(grid), 4000, 'row vars after reconnect');
  });
});

describe('td-media-grid layout="justified" — td-sortable recipe', () => {
  it('rows are built on the sortable; a keyboard reorder rebuilds them, invariants + selection kept', async () => {
    await setViewport({ width: 1280, height: 900 });
    const kinds = MIX.slice(0, 12);
    const { grid, box } = mount(kinds, { sortable: true });
    await waitFor(() => settled(grid), 4000, 'row vars');
    expect(grid.getAttribute('data-td-layout')).to.equal('justified');
    expect(getComputedStyle(box).display).to.equal('flex');
    checkInvariants(grid, box, kinds.map(arOfKind), 'sortable');
    grid.select(['p1', 'p3']);
    const changes = [];
    grid.addEventListener('select-change', (e) => changes.push(e.detail));
    // p1 (landscape) ↔ p2 (portrait): lift p1, one step forward, drop
    const h = itemsOf(grid)[0].querySelector('.td-sortable__handle');
    const w0 = itemsOf(grid)[0].style.getPropertyValue('--td-mg-w');
    h.focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'ArrowRight' });
    await sendKeys({ press: 'Space' });
    expect(itemsOf(grid).map((el) => el.dataset.id).slice(0, 3)).to.deep.equal(['p2', 'p1', 'p3']);
    const reordered = [kinds[1], kinds[0], ...kinds.slice(2)];
    await waitFor(() => itemsOf(grid)[0].style.getPropertyValue('--td-mg-w') !== w0, 4000, 'rows rebuilt');
    await frames(2);
    checkInvariants(grid, box, reordered.map(arOfKind), 'after reorder');
    expect(grid.selectedIds).to.deep.equal(['p1', 'p3']);
    expect(changes.length).to.equal(0);
  });
});

describe('td-media-grid layout="justified" — unsupported structure', () => {
  async function warnsFor(html) {
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => warns.push(a.map(String).join(' '));
    try {
      root.innerHTML = html;
      const grid = root.firstElementChild;
      await frames(2);
      grid.append(grid.firstElementChild.cloneNode(false)); // another mutation → another frame: no second warning
      await waitFor(() => !grid._raf, 4000, 'frame');
      await frames(2);
      return { grid, warns };
    } finally {
      console.warn = orig;
    }
  }
  const it3 = MIX.slice(0, 3).map((k, i) => itemHtml(`w${i}`, k, { i })).join('');

  it('an arbitrary wrapper div: warns once, default layout, no row vars', async () => {
    const { grid, warns } = await warnsFor(`<td-media-grid layout="justified"><div class="strip">${it3}</div></td-media-grid>`);
    expect(warns.filter((w) => w.includes('td-media-grid')).length).to.equal(1);
    expect(grid.getAttribute('data-td-layout')).to.equal('default');
    expect(getComputedStyle(grid).display).to.equal('grid');
    for (const it of grid.items) expect(it.style.getPropertyValue('--td-mg-w')).to.equal('');
  });

  it('two strips: warns once, default layout', async () => {
    const { grid, warns } = await warnsFor(`<td-media-grid layout="justified"><div>${it3}</div><div>${it3.replaceAll('w', 'v')}</div></td-media-grid>`);
    expect(warns.filter((w) => w.includes('td-media-grid')).length).to.equal(1);
    expect(grid.getAttribute('data-td-layout')).to.equal('default');
  });
});
