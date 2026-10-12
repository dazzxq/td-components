import { expect } from '@esm-bundle/chai';
import { TdTable } from './td-table.js';
import { TdButton } from '../form/td-button.js';

// v0.71.0 (plan docs/internal/plans/v0.71.0-field-frame-table-empty.md, K11 of dsuite) — the "no rows" message of a td-table that
// scrolls sideways sits in the VISIBLE area (and stays there while the table scrolls), not centred on the scroll width where a phone
// never sees it. A table that does not scroll, and the card layout, are unchanged. Chromium, Firefox AND WebKit.
// Measures real boxes after real layout; DOM nodes are compared as booleans (`a === b`).
void TdTable; void TdButton;
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const frames = (n = 2) => new Promise((r) => { const step = (k) => (k ? requestAnimationFrame(() => step(k - 1)) : r()); step(n); });

const COLS = [
  { key: 'code', label: 'Mã đơn hàng', sortable: true },
  { key: 'customer', label: 'Khách hàng', sortable: true },
  { key: 'phone', label: 'Điện thoại liên hệ' },
  { key: 'total', label: 'Tổng tiền', align: 'right', sortable: true },
  { key: 'date', label: 'Ngày đặt hàng' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'ship', label: 'Vận chuyển' },
  { key: 'note', label: 'Ghi chú nội bộ' },
];

const box = document.createElement('div');
document.body.appendChild(box);
afterEach(() => { box.replaceChildren(); });

/** A td-table with no rows in a wrapper of `width` px (CSSOM on the test page only). */
async function mk(width, attrs = 'layout="table" title="Đơn hàng"') {
  const wrap = document.createElement('div');
  wrap.style.width = `${width}px`;
  wrap.innerHTML = `<td-table ${attrs}></td-table>`;
  box.appendChild(wrap);
  const el = wrap.firstElementChild;
  el.columns = COLS;
  el.data = [];
  await frames(2);
  return el;
}

function geom(el) {
  const scroll = el.querySelector('.td-table__scroll');
  const es = el.querySelector('td-empty-state');
  return { scroll, es, cell: es.parentElement, s: scroll.getBoundingClientRect(), r: es.getBoundingClientRect() };
}
const inside = (g, tol = 0.5) => g.r.left >= g.s.left - tol && g.r.right <= g.s.right + tol;
// the card has a 1px border each side, so the visible area is 2px narrower than the host the width is taken from: a 1px centre
// offset is by design, anything above 2px is a bug
const centreOff = (g) => Math.abs((g.r.left + g.r.right) / 2 - (g.s.left + g.s.right) / 2);
const note = (g) => `scroll ${g.s.left.toFixed(1)}..${g.s.right.toFixed(1)} · message ${g.r.left.toFixed(1)}..${g.r.right.toFixed(1)}`;

describe('v0.71.0 td-table — the empty message sits in the visible area of a table that scrolls sideways (K11)', () => {
  it('layout="table" at 360px: the table scrolls, the message is fully visible and centred on what is visible', async () => {
    const el = await mk(360);
    const g = geom(el);
    expect(g.scroll.scrollWidth > g.scroll.clientWidth + 20, `precondition: the table scrolls (${g.scroll.scrollWidth} > ${g.scroll.clientWidth})`).to.equal(true);
    expect(inside(g), note(g)).to.equal(true);
    expect(centreOff(g) <= 2, `centre off by ${centreOff(g).toFixed(2)} · ${note(g)}`).to.equal(true);
  });

  it('at 393px (the phone of the report) the same', async () => {
    const el = await mk(393);
    const g = geom(el);
    expect(g.scroll.scrollWidth > g.scroll.clientWidth + 20, 'precondition: the table scrolls').to.equal(true);
    expect(inside(g), note(g)).to.equal(true);
    expect(centreOff(g) <= 2, `centre off by ${centreOff(g).toFixed(2)} · ${note(g)}`).to.equal(true);
  });

  it('it stays in the visible area while the table is scrolled sideways, up to the far end', async () => {
    const el = await mk(360);
    const { scroll } = geom(el);
    const max = scroll.scrollWidth - scroll.clientWidth;
    expect(max > 150, `precondition: there is room to scroll (${max})`).to.equal(true);
    for (const x of [120, 300, scroll.scrollWidth]) {
      scroll.scrollLeft = x;
      await frames(2);
      // prove the scrolling really happened (and was not clamped to 0 or ignored) before measuring anything
      const want = Math.min(x, max);
      expect(scroll.scrollLeft > 0 && Math.abs(scroll.scrollLeft - want) <= 1, `scrollLeft ${scroll.scrollLeft} · requested ${x} · expected ${want}`).to.equal(true);
      const g = geom(el);
      expect(inside(g), `scrollLeft ${scroll.scrollLeft} · ${note(g)}`).to.equal(true);
      expect(centreOff(g) <= 2, `scrollLeft ${scroll.scrollLeft} · centre off by ${centreOff(g).toFixed(2)}`).to.equal(true);
    }
  });

  it('a table that does NOT scroll is unchanged: the message fills the cell content box exactly', async () => {
    const el = await mk(1600);
    const g = geom(el);
    expect(g.scroll.scrollWidth <= g.scroll.clientWidth + 1, 'precondition: no horizontal scroll').to.equal(true);
    const pad = parseFloat(getComputedStyle(g.cell).paddingLeft);
    const cr = g.cell.getBoundingClientRect();
    expect(pad > 0, 'the cell has padding').to.equal(true);
    expect(Math.abs(g.r.left - (cr.left + pad)) <= 0.5, `left ${g.r.left} vs ${cr.left + pad}`).to.equal(true);
    expect(Math.abs(g.r.width - (cr.width - 2 * pad)) <= 0.5, `width ${g.r.width} vs ${cr.width - 2 * pad}`).to.equal(true);
  });

  it('layout="cards" at 360px: no horizontal scroll, the message is inside the frame', async () => {
    const el = await mk(360, 'layout="cards" title="Đơn hàng"');
    const g = geom(el);
    expect(g.scroll.scrollWidth <= g.scroll.clientWidth + 1, 'no horizontal scroll in card mode').to.equal(true);
    expect(inside(g), note(g)).to.equal(true);
    expect(centreOff(g) <= 2, `centre off by ${centreOff(g).toFixed(2)}`).to.equal(true);
  });

  it('the message keeps its content and the narrow (< 480px) layout of td-empty-state applies on the phone', async () => {
    const el = await mk(393);
    const g = geom(el);
    expect(g.es.querySelector('.td-empty-state__title')?.textContent.trim().length > 0, 'title rendered').to.equal(true);
    expect(g.r.width < 480, `the message box is narrower than 480px (${g.r.width.toFixed(1)}) so its container query stacks actions`).to.equal(true);
  });
});
