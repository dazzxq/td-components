import { expect } from '@esm-bundle/chai';
import './td-table.js';
import './td-pagination.js';

// v0.59.2 (bug from site 135, regression of v0.59.0 `hide-single-page`) — card mode with the top bar hidden: the sort bar
// keeps the inset the top bar gave the first content (~17 px from the table's top edge, not 5 px). The inset sits on the
// chips (margin), so a cards table with NO chip keeps its thin band (no empty strip). Table layout unchanged.
// Chromium, Firefox AND WebKit; real layout, rAF waits.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
if (document.fonts && document.fonts.ready) await document.fonts.ready;

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const frames = async (n = 3) => { for (let i = 0; i < n; i++) await raf(); };
const extra = [];
afterEach(() => { extra.splice(0).forEach((f) => f()); });

const SORT = [{ key: 'name', label: 'Tên', sortable: true }, { key: 'code', label: 'Mã', sortable: true }];
const PLAIN = [{ key: 'name', label: 'Tên' }, { key: 'code', label: 'Mã' }];
const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Hàng ${i + 1}`, code: `C${i + 1}` }));

async function mk(attrs, { width = 390, columns = SORT, data = rows(6) } = {}) {
  const wrap = document.createElement('div');
  wrap.style.width = `${width}px`;
  wrap.innerHTML = `<td-table ${attrs}></td-table>`;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  const el = wrap.firstElementChild;
  el.columns = columns;
  el.data = data;
  await frames();
  return el;
}
const box = (el) => el.querySelector('.td-table');
const header = (el) => el.querySelector('.td-table__header');
const isCard = (el) => getComputedStyle(el.querySelector('.td-table__body > tr')).display !== 'table-row';
/** Top of the first visible sort chip, from the table container's top edge. */
const chipTop = (el) => {
  const chip = el.querySelector('.td-table__th--sortable');
  return chip.getBoundingClientRect().top - box(el).getBoundingClientRect().top;
};
/** Top of the first content of the top bar (title or pagination), from the container's top edge. */
const headerContentTop = (el) => header(el).firstElementChild.getBoundingClientRect().top - box(el).getBoundingClientRect().top;
const firstCardTop = (el) => el.querySelector('.td-table__body > .td-table__row').getBoundingClientRect().top
  - box(el).getBoundingClientRect().top;

describe('v0.59.2 td-table cards — sort bar inset with the top bar hidden', () => {
  it('390 px, hide-single-page, one page: the first chip sits ≥ 14 px down and matches the visible top bar (±2 px)', async () => {
    const hidden = await mk('per-page="25" hide-single-page');
    expect(isCard(hidden)).to.equal(true);
    expect(header(hidden).hidden).to.equal(true);
    const off = chipTop(hidden);
    expect(off).to.be.at.least(14);
    // same table, top bar shown (more than one page): where its first content starts
    const shown = await mk('per-page="5" hide-single-page');
    expect(header(shown).hidden).to.equal(false);
    const ref = headerContentTop(shown);
    expect(Math.abs(off - ref), `chip ${off} vs top bar content ${ref}`).to.be.at.most(2);
  });

  it('the bottom inset of the sort bar is unchanged (first card distance from the chip bottom)', async () => {
    const hidden = await mk('per-page="25" hide-single-page');
    const shown = await mk('per-page="5" hide-single-page');
    const gap = (el) => el.querySelector('.td-table__body > .td-table__row').getBoundingClientRect().top
      - el.querySelector('.td-table__th--sortable').getBoundingClientRect().bottom;
    expect(Math.abs(gap(hidden) - gap(shown))).to.be.at.most(0.5);
  });

  it('header hidden for another reason (no pagination: empty table) gets the same inset', async () => {
    const el = await mk('per-page="25"', { data: [] });
    expect(header(el).hidden).to.equal(true);
    const ref = await mk('per-page="25" hide-single-page');
    expect(Math.abs(chipTop(el) - chipTop(ref))).to.be.at.most(0.5);
  });

  it('a title keeps the top bar (and the old chip position below it)', async () => {
    const el = await mk('per-page="25" hide-single-page title="Danh sách"');
    expect(header(el).hidden).to.equal(false);
    const hb = header(el).getBoundingClientRect().bottom - box(el).getBoundingClientRect().top;
    // chip = header bottom + 2xs padding (4 px), no extra inset
    expect(Math.abs(chipTop(el) - hb - 4)).to.be.at.most(1);
  });

  it('no sortable column + hidden top bar: no empty band (first card where it was before the fix)', async () => {
    const el = await mk('per-page="25" hide-single-page', { columns: PLAIN });
    expect(header(el).hidden).to.equal(true);
    const tr = el.querySelector('.td-table__head > tr');
    const pad = parseFloat(getComputedStyle(tr).paddingTop) + parseFloat(getComputedStyle(tr).paddingBottom);
    // the row is only its padding (no chip): 2 × 2xs
    expect(Math.abs(tr.getBoundingClientRect().height - pad)).to.be.at.most(0.5);
    expect(pad).to.be.at.most(8.5);
    expect(firstCardTop(el)).to.be.at.most(20);
  });

  it('selectable, no sortable column: the "select all" chip (first chip) gets the same inset', async () => {
    const el = await mk('selectable row-key="id" per-page="25" hide-single-page', { columns: PLAIN });
    expect(header(el).hidden).to.equal(true);
    const all = el.querySelector('.td-table__th--select-all');
    const top = all.getBoundingClientRect().top - box(el).getBoundingClientRect().top;
    const ref = await mk('per-page="25" hide-single-page');
    expect(Math.abs(top - chipTop(ref))).to.be.at.most(0.5);
  });

  it('tree table in cards: same inset', async () => {
    const data = [{ id: 'a', name: 'A', code: 'C1', children: [{ id: 'a1', name: 'A1', code: 'C2' }] }, { id: 'b', name: 'B', code: 'C3' }];
    const el = await mk('tree row-key="id" per-page="25" hide-single-page', { data });
    expect(isCard(el)).to.equal(true);
    expect(header(el).hidden).to.equal(true);
    const ref = await mk('per-page="25" hide-single-page');
    expect(Math.abs(chipTop(el) - chipTop(ref))).to.be.at.most(0.5);
  });

  it('table layout (1280 px) unchanged: header hidden → the head row starts at the container top', async () => {
    const el = await mk('per-page="25" hide-single-page', { width: 1280 });
    expect(isCard(el)).to.equal(false);
    expect(header(el).hidden).to.equal(true);
    const th = el.querySelector('.td-table__th--sortable');
    expect(parseFloat(getComputedStyle(th).marginTop)).to.equal(0);
    const top = el.querySelector('.td-table__head').getBoundingClientRect().top - box(el).getBoundingClientRect().top;
    expect(top).to.be.at.most(1.5);
  });
});
