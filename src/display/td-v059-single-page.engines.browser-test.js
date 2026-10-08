import { expect } from '@esm-bundle/chai';
import './td-table.js';
import './td-pagination.js';

// v0.59.0 (plan v0.59.0-dsuite-small §A, QĐ A1–A5) — `hide-single-page` on td-pagination and td-table: ONE page → no page
// controls; td-table keeps ONE count line (the bottom bar, still the live region, same node); a focused control that goes
// hands the focus to that line (never <body>). More pages → as before. Chromium, Firefox AND WebKit. DOM nodes are
// compared as booleans (a failing chai assertion carrying DOM nodes hangs the runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const frames = async (n = 2) => { for (let i = 0; i < n; i++) await raf(); };
const root = document.createElement('div');
root.style.width = '900px';
document.body.appendChild(root);
afterEach(() => { root.innerHTML = ''; });

const COLS = [{ key: 'name', label: 'Tên' }];
const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Hàng ${i + 1}` }));
async function table(attrs, data = rows(4)) {
  root.innerHTML = `<td-table ${attrs}></td-table>`;
  const el = root.querySelector('td-table');
  el.columns = COLS;
  el.data = data;
  await frames(3);
  return el;
}
async function pag(attrs) {
  root.innerHTML = `<td-pagination ${attrs}></td-pagination>`;
  await frames(2);
  return root.querySelector('td-pagination');
}
const topBar = (el) => el.querySelector('.td-table__header > .td-table__pagination');
const bottom = (el) => el.querySelector('.td-table__footer td-pagination');
const controls = (p) => p.querySelector('.td-pagination__controls');
const info = (p) => p.querySelector('.td-pagination__info');
const shown = (n) => !!n && n.getClientRects().length > 0 && !n.closest('[hidden]');

describe('v0.59.0 td-pagination hide-single-page', () => {
  it('one page: controls hidden, nav --single, info kept as the live region; property reflects', async () => {
    const p = await pag('hide-single-page total-items="4" items-per-page="10"');
    expect(controls(p).hidden).to.equal(true);
    expect(p.querySelector('nav').classList.contains('td-pagination--single')).to.equal(true);
    expect(info(p).getAttribute('aria-live')).to.equal('polite');
    expect(info(p).textContent).to.equal('Hiển thị 1-4 / 4 mục');
    expect(shown(info(p))).to.equal(true);
    expect(p.hideSinglePage).to.equal(true);
  });

  for (const [total, per, single] of [[0, 10, true], [10, 10, true], [11, 10, false], [23, 10, false]]) {
    it(`total ${total} / ${per} per page → single = ${single}`, async () => {
      const p = await pag(`hide-single-page total-items="${total}" items-per-page="${per}"`);
      expect(controls(p).hidden).to.equal(single);
      expect(p.querySelector('nav').classList.contains('td-pagination--single')).to.equal(single);
    });
  }

  it('without the attribute one page keeps its controls (v0.58.0)', async () => {
    const p = await pag('total-items="4"');
    expect(controls(p).hidden).to.equal(false);
    expect(p.querySelector('nav').classList.contains('td-pagination--single')).to.equal(false);
  });

  it('in place: 3 pages → 1 page → 3 pages keeps the nav + live region nodes; toggling the attribute', async () => {
    const p = await pag('hide-single-page total-items="23"');
    const nav = p.querySelector('nav');
    const live = info(p);
    expect(controls(p).hidden).to.equal(false);
    p.setAttribute('total-items', '4');
    await frames();
    expect(controls(p).hidden).to.equal(true);
    expect(p.querySelector('nav') === nav && info(p) === live).to.equal(true);
    expect(live.textContent).to.equal('Hiển thị 1-4 / 4 mục');
    p.setAttribute('total-items', '23');
    await frames();
    expect(controls(p).hidden).to.equal(false);
    p.setAttribute('total-items', '4');
    p.hideSinglePage = false;
    await frames();
    expect(controls(p).hidden).to.equal(false);
    p.hideSinglePage = true;
    await frames();
    expect(controls(p).hidden).to.equal(true);
  });

  it('a focused control that goes → the info line holds the focus (tabindex -1 until blur)', async () => {
    const p = await pag('hide-single-page total-items="23" current-page="2"');
    p.querySelector('[data-nav="next"]').focus();
    p.setAttribute('total-items', '4');
    await frames();
    expect(document.activeElement === info(p)).to.equal(true);
    expect(info(p).getAttribute('tabindex')).to.equal('-1');
    info(p).blur();
    expect(info(p).hasAttribute('tabindex')).to.equal(false);
  });

  it('narrow container (< 360 px): the info line of a single page is visible', async () => {
    root.style.width = '300px';
    try {
      const p = await pag('hide-single-page total-items="4"');
      const r = info(p).getBoundingClientRect();
      expect(r.width > 50 && r.height > 10).to.equal(true);
    } finally { root.style.width = '900px'; }
  });
});

describe('v0.59.0 td-table hide-single-page', () => {
  it('client, one page: top bar hidden, header hidden (no title), bottom bar = info only', async () => {
    const el = await table('hide-single-page');
    expect(topBar(el).hidden).to.equal(true);
    expect(el.querySelector('.td-table__header').hidden).to.equal(true);
    expect(el.querySelector('.td-table__footer').hidden).to.equal(false);
    expect(bottom(el).hasAttribute('hide-single-page')).to.equal(true);
    expect(controls(bottom(el)).hidden).to.equal(true);
    expect(info(bottom(el)).textContent).to.equal('Hiển thị 1-4 / 4 mục');
    expect(info(bottom(el)).getAttribute('aria-live')).to.equal('polite');
    expect(el.hideSinglePage).to.equal(true);
  });

  it('title keeps the header; more pages → both bars as before', async () => {
    const el = await table('hide-single-page title="Bảng" per-page="2"', rows(5));
    expect(topBar(el).hidden).to.equal(false);
    expect(controls(bottom(el)).hidden).to.equal(false);
    el.data = rows(2);
    await frames(3);
    expect(topBar(el).hidden).to.equal(true);
    expect(el.querySelector('.td-table__header').hidden).to.equal(false);
    expect(controls(bottom(el)).hidden).to.equal(true);
  });

  it('3 pages → 1 page (data, per-page) keeps the SAME live region node; back again', async () => {
    const el = await table('hide-single-page per-page="2"', rows(5));
    const live = info(bottom(el));
    el.setAttribute('per-page', '10');
    await frames(3);
    expect(topBar(el).hidden).to.equal(true);
    expect(info(bottom(el)) === live).to.equal(true);
    expect(live.textContent).to.equal('Hiển thị 1-5 / 5 mục');
    el.setAttribute('per-page', '2');
    await frames(3);
    expect(topBar(el).hidden).to.equal(false);
    expect(controls(bottom(el)).hidden).to.equal(false);
  });

  it('server mode: total-items decides; missing total-items → both hidden (as before); 0 → empty state', async () => {
    const el = await table('hide-single-page server-mode total-items="3"', rows(3));
    expect(topBar(el).hidden).to.equal(true);
    expect(controls(bottom(el)).hidden).to.equal(true);
    el.setAttribute('total-items', '25');
    await frames(3);
    expect(topBar(el).hidden).to.equal(false);
    expect(controls(bottom(el)).hidden).to.equal(false);
    el.removeAttribute('total-items');
    await frames(3);
    expect(el.querySelector('.td-table__footer').hidden).to.equal(true);
    el.setAttribute('total-items', '0');
    el.data = [];
    await frames(3);
    expect(el.querySelector('.td-table__footer').hidden).to.equal(true);
  });

  it('tree: the v0.57.2 tree text + formatPageInfo on the one remaining line', async () => {
    root.innerHTML = '<td-table tree row-key="id" hide-single-page></td-table>';
    const el = root.querySelector('td-table');
    el.formatPageInfo = (c) => `${c.text} (x)`;
    el.columns = COLS;
    el.data = [{ id: 'a', name: 'A', children: [{ id: 'b', name: 'B' }] }, { id: 'c', name: 'C' }];
    await frames(3);
    expect(topBar(el).hidden).to.equal(true);
    expect(info(bottom(el)).textContent).to.equal('Hiển thị 1-2 / 2 nhóm · 2 dòng (x)');
  });

  it('focus on a top-bar page button when the table becomes one page → the bottom info line', async () => {
    const el = await table('hide-single-page per-page="2"', rows(5));
    topBar(el).querySelector('.td-pagination__page[data-page="2"]').focus();
    el.data = rows(2);
    await frames(3);
    expect(document.activeElement === info(bottom(el))).to.equal(true);
  });

  it('focus on a bottom-bar control when the table becomes one page → the bottom info line', async () => {
    const el = await table('hide-single-page per-page="2"', rows(5));
    bottom(el).querySelector('[data-nav="next"]').focus();
    el.setAttribute('per-page', '10');
    await frames(3);
    expect(document.activeElement === info(bottom(el))).to.equal(true);
  });

  it('runtime toggle of the attribute', async () => {
    const el = await table('');
    expect(topBar(el).hidden).to.equal(false);
    el.hideSinglePage = true;
    await frames(3);
    expect(topBar(el).hidden).to.equal(true);
    expect(controls(bottom(el)).hidden).to.equal(true);
    el.removeAttribute('hide-single-page');
    await frames(3);
    expect(topBar(el).hidden).to.equal(false);
    expect(controls(bottom(el)).hidden).to.equal(false);
  });

  it('card layout in a 300 px container: one visible count line, no horizontal overflow', async () => {
    root.style.width = '300px';
    try {
      const el = await table('hide-single-page');
      const r = info(bottom(el)).getBoundingClientRect();
      expect(r.width > 50 && r.height > 10).to.equal(true);
      expect(el.scrollWidth <= el.clientWidth + 1).to.equal(true);
    } finally { root.style.width = '900px'; }
  });
});
