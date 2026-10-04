import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdTable } from './td-table.js';
import { TdButton } from '../form/td-button.js';

// v0.34.0 (plan docs/internal/plans/v0.34.0-responsive.md M3, decisions 14–20) — td-table card mode + layout fixes.
// Card mode is pure CSS on the same DOM, driven by a container query on the host (`container: td-table`), so every
// check sizes a WRAPPER and waits for real signals (rAF / ResizeObserver / events), never fixed sleeps.
// Chromium, Firefox AND WebKit. DOM nodes are compared as booleans (`a === b`).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const frames = (n = 2) => new Promise((r) => { const step = (k) => (k ? requestAnimationFrame(() => step(k - 1)) : r()); step(n); });
/** Wait (frame by frame, max ~2s) until `fn()` is truthy. */
async function until(fn, max = 120) {
  for (let i = 0; i < max; i++) {
    if (fn()) return true;
    await frames(1);
  }
  return !!fn();
}

const extra = [];
afterEach(() => {
  extra.splice(0).reverse().forEach((f) => f());
});

/** A wrapper of `width` px (CSSOM — no style attribute in markup) holding one td-table. */
function frame(width, attrs = '') {
  const wrap = document.createElement('div');
  wrap.style.width = `${width}px`;
  wrap.innerHTML = `<td-table ${attrs}></td-table>`;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  return { wrap, el: wrap.firstElementChild };
}

const COLS = [
  { key: 'code', label: 'Mã đơn', sortable: true },
  { key: 'customer', label: 'Khách hàng', sortable: true },
  { key: 'phone', label: 'Điện thoại' },
  { key: 'total', label: 'Tổng tiền', align: 'right', sortable: true },
  { key: 'date', label: 'Ngày', card: 'meta' },
  { key: 'status', label: 'Trạng thái', card: 'meta' },
];
const ROWS = Array.from({ length: 23 }, (_, i) => ({
  code: `DH${String(i + 1).padStart(4, '0')}`,
  customer: `Khách hàng số ${i + 1}`,
  phone: `09${String(10000000 + i * 7919).slice(0, 8)}`,
  total: `${(1234567 * (i + 1)).toLocaleString('vi-VN')} ₫`,
  date: `0${(i % 9) + 1}/10/2026`,
  status: i % 2 ? 'Đã giao' : 'Đang xử lý',
}));

async function mk(width, attrs = '', { columns = COLS, data = ROWS } = {}) {
  const f = frame(width, attrs);
  f.el.columns = columns;
  if (data) f.el.data = data;
  await frames(2);
  return f;
}

const rows = (el) => [...el.querySelectorAll('.td-table__body > .td-table__row')];
const isCard = (el) => {
  const tr = el.querySelector('.td-table__body > tr');
  return getComputedStyle(tr).display !== 'table-row';
};
const visible = (n) => {
  const cs = getComputedStyle(n);
  const r = n.getBoundingClientRect();
  return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 1 && r.height > 1;
};
/** value text of a body cell (without the aria-hidden card label) */
const val = (td) => [...td.childNodes].filter((n) => !(n.nodeType === 1 && n.classList.contains('td-table__cell-label')))
  .map((n) => n.textContent).join('');
const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

function rgb(str) {
  const m = /rgba?\(([^)]+)\)/.exec(str);
  const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r: n[0], g: n[1], b: n[2] };
}
const ratio = (a, b) => {
  const [x, y] = [TdButton._luminance(rgb(a)), TdButton._luminance(rgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('v0.34.0 td-table — auto layout switches by CONTAINER width (QĐ 15)', () => {
  it('360px wrapper → cards: labels visible, no host overflow, no overlapping text in a card', async () => {
    const { el } = await mk(360);
    expect(isCard(el)).to.equal(true);
    expect(getComputedStyle(el).containerType).to.equal('inline-size');
    const tr = rows(el)[0];
    // secondary cells show their label; primary does not
    const phone = tr.querySelector('[data-card="secondary"][data-col-key="phone"] .td-table__cell-label');
    expect(visible(phone)).to.equal(true);
    expect(phone.textContent).to.equal('Điện thoại');
    expect(visible(tr.querySelector('[data-card="primary"] .td-table__cell-label'))).to.equal(false);
    // no horizontal overflow of the host or the scroll wrapper
    const scroll = el.querySelector('.td-table__scroll');
    expect(el.scrollWidth <= el.clientWidth + 1, `host ${el.scrollWidth}/${el.clientWidth}`).to.equal(true);
    expect(scroll.scrollWidth <= scroll.clientWidth + 1, `scroll ${scroll.scrollWidth}/${scroll.clientWidth}`).to.equal(true);
    expect(scroll.hasAttribute('role')).to.equal(false);
    // cells of one card never overlap (2px tolerance) and stay inside the card
    for (const r of rows(el).slice(0, 3)) {
      const box = r.getBoundingClientRect();
      const cells = [...r.children].filter(visible).map((c) => c.getBoundingClientRect());
      expect(cells.length).to.be.above(3);
      for (const c of cells) {
        expect(c.left >= box.left - 1 && c.right <= box.right + 1, 'cell inside card').to.equal(true);
      }
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) expect(overlap(cells[i], cells[j]) <= 2, `cells ${i}/${j}`).to.equal(true);
      }
    }
    // the meta cells share one line, joined by a " · " separator
    const metas = [...tr.querySelectorAll('[data-card="meta"]')].map((c) => c.getBoundingClientRect());
    expect(Math.abs(metas[0].top - metas[1].top) < 2).to.equal(true);
    const sep = getComputedStyle(tr.querySelector('[data-card="meta"] ~ [data-card="meta"]'), '::before').content;
    expect(sep).to.contain('·');
    // primary first, full width, bold
    const primary = tr.querySelector('[data-card="primary"]');
    expect(Number(getComputedStyle(primary).fontWeight)).to.be.at.least(600);
    const firstTop = Math.min(...[...tr.children].filter(visible).map((c) => c.getBoundingClientRect().top));
    expect(Math.abs(primary.getBoundingClientRect().top - firstTop) < 1).to.equal(true);
  });

  it('800px wrapper → table (same DOM, labels hidden)', async () => {
    const { el } = await mk(800);
    expect(isCard(el)).to.equal(false);
    expect(visible(rows(el)[0].querySelector('.td-table__cell-label'))).to.equal(false);
    expect(getComputedStyle(el.querySelector('.td-table__head')).display).to.equal('table-header-group');
  });

  it('resize 800 → 360 → 800 switches without re-rendering (same tr nodes)', async () => {
    const { wrap, el } = await mk(800);
    const before = rows(el);
    expect(isCard(el)).to.equal(false);
    wrap.style.width = '360px';
    expect(await until(() => isCard(el))).to.equal(true);
    const mid = rows(el);
    expect(mid.length === before.length && mid.every((r, i) => r === before[i])).to.equal(true);
    wrap.style.width = '800px';
    expect(await until(() => !isCard(el))).to.equal(true);
    expect(rows(el).every((r, i) => r === before[i])).to.equal(true);
  });

  it('layout="table" at 360 → table, horizontal scroll, focusable named region (old behaviour)', async () => {
    const { el } = await mk(360, 'layout="table" title="Đơn hàng"');
    expect(isCard(el)).to.equal(false);
    const scroll = el.querySelector('.td-table__scroll');
    expect(await until(() => scroll.getAttribute('tabindex') === '0')).to.equal(true);
    expect(scroll.getAttribute('role')).to.equal('region');
    expect(scroll.getAttribute('aria-labelledby')).to.equal(el.querySelector('.td-table__title').id);
    expect(scroll.scrollWidth > scroll.clientWidth).to.equal(true);
    // edge shadows: CSS-only background with local attachment (covers scroll with the content)
    expect(getComputedStyle(scroll).backgroundAttachment).to.contain('local');
  });

  it('layout="cards" at 1280 → cards; secondary pairs in 2 columns (≥ 480)', async () => {
    const { el } = await mk(1280, 'layout="cards"');
    expect(isCard(el)).to.equal(true);
    const [a, b] = [...rows(el)[0].querySelectorAll('[data-card="secondary"]')].map((c) => c.getBoundingClientRect());
    expect(Math.abs(a.top - b.top) < 2, 'two secondaries share a line').to.equal(true);
    expect(b.left > a.right - 1).to.equal(true);
  });

  it('secondary pairs are one column under 480', async () => {
    const { el } = await mk(400, 'layout="cards"');
    const [a, b] = [...rows(el)[0].querySelectorAll('[data-card="secondary"]')].map((c) => c.getBoundingClientRect());
    expect(b.top >= a.bottom - 1).to.equal(true);
  });

  it('card-below: md default (<720), sm (<480), lg (<1024); unknown → md', async () => {
    const cases = [
      [700, '', true], [760, '', false],
      [700, 'card-below="md"', true], [760, 'card-below="md"', false],
      [470, 'card-below="sm"', true], [600, 'card-below="sm"', false],
      [900, 'card-below="lg"', true], [1100, 'card-below="lg"', false],
      [700, 'card-below="xl"', true],
      [700, 'layout="nope"', true],
    ];
    for (const [w, attrs, card] of cases) {
      const { el } = await mk(w, attrs, { data: ROWS.slice(0, 2) });
      expect(isCard(el), `${w} ${attrs}`).to.equal(card);
    }
  });

  it('the forced and the container card rules compute the same (the copies stay in sync)', async () => {
    const forced = (await mk(360, 'layout="cards"', { data: ROWS.slice(0, 2) })).el;
    const autos = [(await mk(360, '', { data: ROWS.slice(0, 2) })).el, (await mk(470, 'card-below="sm"', { data: ROWS.slice(0, 2) })).el,
      (await mk(400, 'card-below="lg"', { data: ROWS.slice(0, 2) })).el];
    const props = ['display', 'paddingTop', 'paddingLeft', 'borderTopWidth', 'borderTopLeftRadius', 'fontWeight', 'color',
      'backgroundColor', 'order', 'flexBasis', 'textAlign', 'justifyContent', 'position'];
    const sels = ['.td-table__table', '.td-table__head', '.td-table__head > tr', '.td-table__th[data-col="0"]',
      '.td-table__th[data-col="2"]', '.td-table__body', '.td-table__body > tr', '.td-table__body > tr > [data-col="0"]',
      '.td-table__body > tr > [data-col="2"]', '.td-table__body > tr > [data-col="4"]',
      '.td-table__body > tr > [data-col="2"] > .td-table__cell-label'];
    const snap = (el) => sels.map((s) => props.map((p) => getComputedStyle(el.querySelector(s))[p]).join('|')).join('\n');
    for (const a of autos) expect(snap(a)).to.equal(snap(forced));
  });
});

describe('v0.34.0 td-table — semantics in both modes (QĐ 17)', () => {
  for (const width of [360, 800]) {
    it(`explicit role tree at ${width}px: table > rowgroup > row > columnheader / cell`, async () => {
      const { el } = await mk(width, '', { data: ROWS.slice(0, 3) });
      const table = el.querySelector('table');
      expect(table.getAttribute('role')).to.equal('table');
      expect(table.querySelector(':scope > thead').getAttribute('role')).to.equal('rowgroup');
      expect(table.querySelector(':scope > tbody').getAttribute('role')).to.equal('rowgroup');
      for (const tr of table.querySelectorAll('tr')) expect(tr.getAttribute('role')).to.equal('row');
      for (const th of table.querySelectorAll('th')) expect(th.getAttribute('role')).to.equal('columnheader');
      for (const td of table.querySelectorAll('td')) expect(td.getAttribute('role')).to.equal('cell');
      // card labels never double the reading (columnheader names the cell)
      for (const lab of table.querySelectorAll('.td-table__cell-label')) expect(lab.getAttribute('aria-hidden')).to.equal('true');
      // non-sortable headers stay in the a11y tree (visually hidden in card mode, never display:none)
      const th = table.querySelector('th[data-col="2"]');
      expect(getComputedStyle(th).display).to.not.equal('none');
    });
  }

  it('card mode: thead is a sort bar — sortable th visible as chips, others visually hidden', async () => {
    const { el } = await mk(360);
    const th = (i) => el.querySelector(`.td-table__th[data-col="${i}"]`);
    expect(visible(th(0))).to.equal(true);
    expect(visible(th(3))).to.equal(true);
    expect(th(2).getBoundingClientRect().width <= 1).to.equal(true);
    expect(getComputedStyle(th(2)).position).to.equal('absolute');
  });

  it('sort through the card bar with Enter / Space: aria-sort, sort-change, focus kept after the re-render', async () => {
    const { el } = await mk(360);
    const events = [];
    el.addEventListener('sort-change', (e) => events.push(e.detail));
    const btn = el.querySelector('.td-table__sort[data-sort-col="1"]');
    btn.focus();
    await sendKeys({ press: 'Enter' });
    expect(btn.closest('th').getAttribute('aria-sort')).to.equal('ascending');
    expect(document.activeElement === btn).to.equal(true);
    await sendKeys({ press: 'Space' });
    expect(btn.closest('th').getAttribute('aria-sort')).to.equal('descending');
    expect(document.activeElement === btn).to.equal(true);
    expect(events).to.deep.equal([{ key: 'customer', direction: 'asc' }, { key: 'customer', direction: 'desc' }]);
    expect(val(rows(el)[0].children[1])).to.equal('Khách hàng số 23'); // vi numeric collator, descending
    expect(isCard(el)).to.equal(true);
  });
});

describe('v0.34.0 td-table — paging, loading, empty in card mode (QĐ 19–20)', () => {
  it('client mode: the paginations page the cards', async () => {
    const { el } = await mk(360, 'per-page="10"');
    el.querySelector('.td-table__footer td-pagination .td-pagination__page[data-page="3"]').click();
    expect(rows(el)).to.have.length(3);
    expect(val(rows(el)[0].children[0])).to.equal('DH0021');
    expect(isCard(el)).to.equal(true);
    expect(visible(el.querySelector('.td-table__footer'))).to.equal(true);
  });

  it('server mode: onPageChange + data keep the page, still cards', async () => {
    const { el } = await mk(360, 'server-mode total-items="23" per-page="10"', { data: ROWS.slice(0, 10) });
    const pages = [];
    el.onPageChange = (p) => { pages.push(p); el.data = ROWS.slice((p - 1) * 10, p * 10); };
    el.querySelector('.td-table__footer td-pagination .td-pagination__page[data-page="2"]').click();
    expect(pages).to.deep.equal([2]);
    expect(val(rows(el)[0].children[0])).to.equal('DH0011');
    expect(el.getState().page).to.equal(2);
    expect(isCard(el)).to.equal(true);
  });

  it('zebra is off in card mode (every card has the same solid fill)', async () => {
    const { el } = await mk(360);
    const [a, b] = rows(el);
    expect(getComputedStyle(a).backgroundColor).to.equal(getComputedStyle(b).backgroundColor);
    expect(rgb(getComputedStyle(b).backgroundColor)).to.deep.equal(rgb(getComputedStyle(el.querySelector('.td-table')).backgroundColor));
    expect(getComputedStyle(a).backdropFilter === 'none' || getComputedStyle(a).backdropFilter === '').to.equal(true);
    expect(getComputedStyle(a).borderTopWidth).to.equal('1px');
  });

  it('loading skeleton renders as cards; the empty state renders', async () => {
    const { el } = await mk(360, 'loading loading-rows="3"', { data: null });
    const sk = el.querySelectorAll('.td-table__row--skeleton');
    expect(sk).to.have.length(3);
    expect(getComputedStyle(sk[0]).display).to.not.equal('table-row');
    expect(visible(sk[0].querySelector('.td-table__skeleton'))).to.equal(true);
    expect(el.scrollWidth <= el.clientWidth + 1).to.equal(true);
    el.removeAttribute('loading');
    el.data = [];
    await frames(2);
    const es = el.querySelector('td-empty-state');
    expect(visible(es)).to.equal(true);
    expect(es.getBoundingClientRect().width).to.be.above(250);
    expect(el.scrollWidth <= el.clientWidth + 1).to.equal(true);
  });

  it('cell labels stay readable (muted text ≥ 4.5:1 on the card)', async () => {
    const { el } = await mk(360);
    const lab = rows(el)[0].querySelector('[data-card="secondary"] .td-table__cell-label');
    expect(ratio(getComputedStyle(lab).color, getComputedStyle(rows(el)[0]).backgroundColor)).to.be.at.least(4.5);
  });
});

describe('v0.34.0 td-table — actions + row-action (QĐ 18)', () => {
  const ACT2 = [{ id: 'edit', label: 'Sửa', icon: 'pencil' }, { id: 'del', label: 'Xoá', variant: 'danger' }];
  const ACT3 = [...ACT2, { id: 'print', label: 'In', hidden: (row) => row.code === 'DH0002' },
    { id: 'ship', label: 'Giao', disabled: (row) => row.status === 'Đã giao' }];
  const cols = (actions) => [COLS[0], COLS[1], { key: 'x', label: 'Thao tác', actions }];

  it('2 actions → inline buttons in both modes; click fires row-action once with { id, row, rowIndex }', async () => {
    const data = ROWS.slice(0, 3);
    const { wrap, el } = await mk(360, '', { columns: cols(ACT2), data });
    const td = rows(el)[1].querySelector('[data-card="actions"]');
    const btns = [...td.querySelectorAll('.td-table__action')];
    expect(btns.map((b) => b.textContent.trim())).to.deep.equal(['Sửa', 'Xoá']);
    expect(btns.every(visible)).to.equal(true);
    expect(td.querySelector('.td-table__actions-menu')).to.equal(null);
    expect(btns[1].classList.contains('td-btn--danger') && btns[0].classList.contains('td-btn--sm')).to.equal(true);
    expect(btns[0].querySelector('svg')).to.not.equal(null);
    const got = [];
    const hook = [];
    el.addEventListener('row-action', (e) => got.push(e.detail));
    el.onRowAction = (d) => hook.push(d);
    btns[1].click();
    expect(got).to.have.length(1);
    expect(got[0].id).to.equal('del');
    expect(got[0].rowIndex).to.equal(1);
    expect(got[0].row === data[1]).to.equal(true);
    expect(hook).to.have.length(1);
    wrap.style.width = '900px';
    expect(await until(() => !isCard(el))).to.equal(true);
    expect([...td.querySelectorAll('.td-table__action')].every(visible)).to.equal(true);
  });

  it('3+ actions: table mode inline, card mode one "Thao tác" menu button (TdMenu); choosing fires once', async () => {
    const data = ROWS.slice(0, 3);
    const { wrap, el } = await mk(900, '', { columns: cols(ACT3), data });
    const td = () => rows(el)[0].querySelector('[data-card="actions"]');
    expect([...td().querySelectorAll('.td-table__action')].filter(visible)).to.have.length(4);
    expect(visible(td().querySelector('.td-table__actions-menu'))).to.equal(false);
    wrap.style.width = '360px';
    expect(await until(() => isCard(el))).to.equal(true);
    expect([...td().querySelectorAll('.td-table__action')].filter(visible)).to.have.length(0);
    const menuBtn = td().querySelector('.td-table__actions-menu');
    expect(visible(menuBtn)).to.equal(true);
    expect(menuBtn.textContent.trim()).to.equal(TdTable.labels.actions);
    expect(menuBtn.getAttribute('aria-haspopup')).to.equal('menu');
    const got = [];
    el.addEventListener('row-action', (e) => got.push(e.detail));
    menuBtn.focus();
    await sendKeys({ press: 'Enter' });
    const menu = document.querySelector('.td-menu[role="menu"]');
    expect(menu).to.not.equal(null);
    expect(menuBtn.getAttribute('aria-expanded')).to.equal('true');
    const items = [...menu.querySelectorAll('.td-menu__item')];
    expect(items.map((i) => i.textContent.trim())).to.deep.equal(['Sửa', 'Xoá', 'In', 'Giao']);
    items[2].click();
    expect(got).to.have.length(1);
    expect(got[0].id).to.equal('print');
    expect(got[0].rowIndex).to.equal(0);
    expect(got[0].row === data[0]).to.equal(true);
    expect(document.querySelector('.td-menu[role="menu"]')).to.equal(null);
    expect(document.activeElement === menuBtn).to.equal(true);
  });

  it('hidden(row) removes an action, disabled(row) disables it (inline and in the menu)', async () => {
    const data = ROWS.slice(0, 3); // DH0002 hides "In"; row 1 (index 1) is "Đã giao" → "Giao" disabled
    const { el } = await mk(900, '', { columns: cols(ACT3), data });
    const td = rows(el)[1].querySelector('[data-card="actions"]');
    expect([...td.querySelectorAll('.td-table__action')].map((b) => b.textContent.trim())).to.deep.equal(['Sửa', 'Xoá', 'Giao']);
    expect(td.querySelector('.td-table__action[data-action-idx="3"]').disabled).to.equal(true);
    const got = [];
    el.addEventListener('row-action', (e) => got.push(e.detail));
    td.querySelector('.td-table__action[data-action-idx="3"]').click();
    expect(got).to.have.length(0);
    const menuBtn = td.querySelector('.td-table__actions-menu');
    menuBtn.click();
    const items = [...document.querySelectorAll('.td-menu[role="menu"] .td-menu__item')];
    expect(items.map((i) => i.textContent.trim())).to.deep.equal(['Sửa', 'Xoá', 'Giao']);
    expect(items[2].getAttribute('aria-disabled')).to.equal('true');
    items[2].click();
    expect(got).to.have.length(0);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    // exactly two visible actions after hidden() → no menu needed in card mode
    const two = await mk(360, '', { columns: cols([...ACT2, { id: 'p', label: 'In', hidden: () => true }]), data });
    expect(rows(two.el)[0].querySelector('.td-table__actions-menu')).to.equal(null);
  });

  it('XSS: column label and action labels are text; no style attribute anywhere', async () => {
    window.__xss = false;
    const pay = '<img src=x onerror="window.__xss=true">';
    const columns = [{ key: 'code', label: pay, sortable: true }, { key: 'customer', label: pay },
      { key: 'x', label: pay, actions: [1, 2, 3].map((i) => ({ id: `a${i}`, label: pay, icon: pay, variant: pay })) }];
    const { el } = await mk(360, '', { columns, data: ROWS.slice(0, 2) });
    expect(el.querySelector('img')).to.equal(null);
    expect(rows(el)[0].querySelector('[data-col="1"] .td-table__cell-label').textContent).to.equal(pay);
    expect(el.querySelector('.td-table__action').textContent.trim()).to.equal(pay);
    expect(el.querySelector('.td-table__action').className).to.not.contain('img');
    el.querySelector('.td-table__actions-menu').click();
    const menu = document.querySelector('.td-menu[role="menu"]');
    expect(menu.querySelector('img')).to.equal(null);
    expect(menu.querySelector('.td-menu__item').textContent.trim()).to.equal(pay);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(el.querySelectorAll('[style]')).to.have.length(0);
    expect(window.__xss).to.equal(false);
  });
});

describe('v0.34.0 td-table — layout fixes in every mode (QĐ 14)', () => {
  it('ellipsis / flexible width no longer force table-layout fixed; truncation via max-inline-size', async () => {
    const long = 'Một ghi chú rất dài cho đơn hàng này '.repeat(8);
    const { el } = await mk(1280, 'layout="table"', {
      columns: [{ key: 'code', label: 'Mã', width: '80px' }, { key: 'note', label: 'Ghi chú', ellipsis: true },
        { key: 'n2', label: 'Ghi chú 2', ellipsis: true, maxWidth: '120px' }],
      data: [{ code: 'DH1', note: long, n2: long }],
    });
    expect(el.querySelector('.td-table').classList.contains('td-table--fixed')).to.equal(false);
    expect(getComputedStyle(el.querySelector('table')).tableLayout).to.equal('auto');
    const [t1, t2] = el.querySelectorAll('.td-table__truncate');
    expect(getComputedStyle(t1).maxWidth).to.equal('288px'); // --td-table-ellipsis-max: 18rem
    expect(t1.getBoundingClientRect().width <= 289).to.equal(true);
    expect(t1.getAttribute('title')).to.equal(long);
    expect(t2.getBoundingClientRect().width <= 121).to.equal(true);
    // every column fixed → fixed layout
    const all = await mk(1280, 'layout="table"', {
      columns: [{ key: 'a', label: 'A', width: '80px', widthType: 'fixed' }, { key: 'b', label: 'B', width: '120px', widthType: 'fixed' }],
      data: [{ a: 1, b: 2 }],
    });
    expect(all.el.querySelector('.td-table').classList.contains('td-table--fixed')).to.equal(true);
    expect(getComputedStyle(all.el.querySelector('table')).tableLayout).to.equal('fixed');
  });

  it('right-aligned columns do not wrap (nowrap default), nowrap: false opts out', async () => {
    const { el } = await mk(520, 'layout="table"', {
      columns: [...COLS.slice(0, 3), { key: 'total', label: 'Tổng', align: 'right' },
        { key: 'total', label: 'Tổng 2', align: 'right', nowrap: false }, { key: 'customer', label: 'Tên 2' }],
      data: ROWS.slice(5, 6),
    });
    const tds = rows(el)[0].children;
    expect(tds[3].classList.contains('td-table__cell--nowrap')).to.equal(true);
    expect(getComputedStyle(tds[3]).whiteSpace).to.equal('nowrap');
    expect(tds[4].classList.contains('td-table__cell--nowrap')).to.equal(false);
    const range = document.createRange();
    range.selectNodeContents(tds[3].lastChild);
    const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
    expect(lines.size).to.equal(1);
  });

  it('coarse pointer: sort buttons get a 44px minimum inline size (stylesheet rule)', () => {
    const sheet = [...document.styleSheets].find((s) => s.href && s.href.endsWith('/td.css'));
    let found = false;
    const walk = (list, coarse) => {
      for (const r of list) {
        const isCoarse = coarse || (r.media && /pointer:\s*coarse/.test(r.media.mediaText));
        if (r.cssRules) walk(r.cssRules, isCoarse);
        if (isCoarse && r.selectorText && /\.td-table__sort\b/.test(r.selectorText) && r.style.minInlineSize) found = true;
      }
    };
    walk(sheet.cssRules, false);
    expect(found).to.equal(true);
  });
});
