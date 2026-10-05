import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import './td-table.js';
import { TdMenu } from '../feedback/td-menu.js';

// v0.39.0 (plan docs/internal/plans/v0.39.0-filters-range.md QĐ 6–10, M2) — td-table column show / hide: `hideable` /
// `hidden` per column, `hiddenColumns` (silent), `columns-change` { hidden, reason } on user changes only, hiding is the
// `hidden` attribute on th / td / skeleton cells (no re-render: focus + v0.37 selection kept), `min-visible`, and the
// `column-menu` button (TdMenu checkbox items + "Khôi phục mặc định"). Real keys (sendKeys) in Chromium, Firefox, WebKit.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const root = document.createElement('div');
document.body.appendChild(root);
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const frames = async (n = 2) => { for (let i = 0; i < n; i++) await raf(); };
const IS_WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|HeadlessChrome/.test(navigator.userAgent);

const warns = [];
const origWarn = console.warn;
beforeEach(() => {
  warns.length = 0;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
});
afterEach(async () => {
  console.warn = origWarn;
  TdMenu.close();
  await resetMouse();
  root.innerHTML = '';
});

const ROWS = [
  { id: 1, name: 'An', role: 'Admin', email: 'an@x.vn', status: 'Hoạt động' },
  { id: 2, name: 'Bình', role: 'Editor', email: 'binh@x.vn', status: 'Khoá' },
  { id: 3, name: 'Chi', role: 'Viewer', email: 'chi@x.vn', status: 'Hoạt động' },
];
const COLS = () => [
  { key: 'name', label: 'Tên', sortable: true },
  { key: 'role', label: 'Vai trò', sortable: true },
  { key: 'email', label: 'Email' },
  { key: 'status', label: 'Trạng thái', hidden: true },
];

async function mk(attrs = 'column-menu', { columns = COLS(), data = ROWS, width = 900, setup } = {}) {
  const wrap = document.createElement('div');
  wrap.style.width = `${width}px`;
  wrap.innerHTML = `<td-table ${attrs}></td-table>`;
  root.appendChild(wrap);
  const el = wrap.querySelector('td-table');
  if (setup) setup(el);
  el.columns = columns;
  el.data = data;
  await frames(2);
  return el;
}
const btn = (el) => el.querySelector('.td-table__header > .td-table__columns');
const menu = () => document.querySelector('body > .td-menu');
const mItems = () => [...(menu()?.querySelectorAll('.td-menu__item') || [])];
const label = (n) => n.querySelector('.td-menu__label').textContent;
const hiddenCols = (el) => [...el.querySelectorAll('.td-table__head .td-table__th[data-col][hidden]')].map((t) => t.getAttribute('data-col-key'));
const cellsHidden = (el, key) => [...el.querySelectorAll(`.td-table__body td[data-col-key="${key}"]`)].map((td) => td.hidden);
const record = (el, name) => {
  const ev = [];
  el.addEventListener(name, (e) => ev.push(e.detail));
  return ev;
};
async function openMenu(el) {
  btn(el).focus();
  await sendKeys({ press: 'Enter' });
  await raf();
}

describe('v0.39.0 td-table columns — state + DOM (QĐ 6–8)', () => {
  it('hidden: true → th + every td carry `hidden`, display none; hiddenColumns lists the key', async () => {
    const el = await mk('');
    expect(hiddenCols(el)).to.deep.equal(['status']);
    expect(cellsHidden(el, 'status')).to.deep.equal([true, true, true]);
    expect(getComputedStyle(el.querySelector('.td-table__th[data-col-key="status"]')).display).to.equal('none');
    expect(el.hiddenColumns).to.deep.equal(['status']);
    expect(btn(el)).to.equal(null); // no column-menu → no button
  });

  it('hiddenColumns set BEFORE connect applies on the first render (no flash); set later = silent, in place', async () => {
    const el = document.createElement('td-table');
    el.hiddenColumns = ['email', 'role'];
    el.columns = COLS();
    el.data = ROWS;
    const ev = record(el, 'columns-change');
    root.appendChild(el);
    expect(hiddenCols(el)).to.deep.equal(['role', 'email']); // synchronously after connect
    expect(el.hiddenColumns).to.deep.equal(['role', 'email']);
    const tbody = el.querySelector('.td-table__body');
    const firstRow = tbody.firstElementChild;
    el.hiddenColumns = ['status'];
    expect(hiddenCols(el)).to.deep.equal(['status']);
    expect(tbody.firstElementChild === firstRow, 'rows kept (no re-render)').to.equal(true);
    expect(ev).to.deep.equal([]);
    el.hiddenColumns = null; // back to the `hidden` flags of columns
    expect(el.hiddenColumns).to.deep.equal(['status']);
  });

  it('a11y: hidden cells are display:none (out of the accessibility tree; ariaSnapshot in test:responsive)', async () => {
    const el = await mk('');
    const hiddenNodes = [...el.querySelectorAll('[data-col-key="status"]')];
    expect(hiddenNodes.length).to.equal(4);
    expect(hiddenNodes.every((n) => getComputedStyle(n).display === 'none' && !n.getClientRects().length)).to.equal(true);
    const shown = [...el.querySelectorAll('[data-col-key="email"]')];
    expect(shown.every((n) => getComputedStyle(n).display !== 'none')).to.equal(true);
  });

  it('skeleton + empty state follow the hidden columns', async () => {
    const el = await mk('loading');
    const sk = el.querySelector('.td-table__row--skeleton');
    expect([...sk.querySelectorAll('[data-col]')].map((td) => td.hidden)).to.deep.equal([false, false, false, true]);
    el.removeAttribute('loading');
    el.data = [];
    await raf();
    expect(el.querySelector('.td-table__empty').getAttribute('colspan')).to.equal('3');
  });

  it('defaults: primary + actions columns are not hideable; hideable: false wins; duplicate key → not hideable + one warning', async () => {
    const cols = [
      { key: 'name', label: 'Tên' },
      { key: 'x', label: 'X1' },
      { key: 'x', label: 'X2' },
      { key: 'role', label: 'Vai trò', hideable: false },
      { key: 'act', label: 'Thao tác', actions: [{ id: 'e', label: 'Sửa' }] },
      { key: 'email', label: 'Email' },
    ];
    const el = await mk('column-menu', { columns: cols, setup: (t) => { t.hiddenColumns = ['name', 'x', 'role', 'act', 'email']; } });
    expect(el.hiddenColumns).to.deep.equal(['email']);
    expect(warns.filter((w) => /unique/.test(w)).length).to.equal(1);
    await openMenu(el);
    expect(mItems().map(label)).to.deep.equal(['Email', 'Khôi phục mặc định']);
  });

  it('fixed layout is computed on the visible columns (QĐ 8)', async () => {
    const cols = [
      { key: 'name', label: 'Tên', widthType: 'fixed', width: '200px' },
      { key: 'role', label: 'Vai trò', widthType: 'fixed', width: '120px' },
      { key: 'note', label: 'Ghi chú' },
    ];
    const el = await mk('', { columns: cols });
    const root2 = el.querySelector('.td-table');
    expect(root2.classList.contains('td-table--fixed')).to.equal(false);
    el.hiddenColumns = ['note'];
    expect(root2.classList.contains('td-table--fixed')).to.equal(true);
    el.hiddenColumns = [];
    expect(root2.classList.contains('td-table--fixed')).to.equal(false);
  });

  it('a sorted column hidden then shown keeps aria-sort; v0.37 selection survives toggling', async () => {
    const el = await mk('selectable row-key="id"');
    el.querySelector('.td-table__sort[data-sort-col="1"]').click();
    el.select([2]);
    el.hiddenColumns = ['role'];
    expect(el.getState().sort).to.deep.equal({ key: 'role', direction: 'asc' });
    el.hiddenColumns = [];
    const th = el.querySelector('.td-table__th[data-col="1"]');
    expect(th.hidden).to.equal(false);
    expect(th.getAttribute('aria-sort')).to.equal('ascending');
    expect(el.selectedKeys).to.deep.equal([2]);
    expect(el.querySelector('.td-table__th--select').hidden).to.equal(false);
  });

  it('min-visible: never fewer visible columns than the minimum (programmatic set clipped + one warning)', async () => {
    const el = await mk('min-visible="3"');
    el.hiddenColumns = ['role', 'email', 'status'];
    expect(el.querySelectorAll('.td-table__head .td-table__th[data-col]:not([hidden])').length).to.equal(3);
    expect(warns.filter((w) => /min-visible/.test(w)).length).to.equal(1);
  });
});

describe('v0.39.0 td-table column menu (QĐ 9–10)', () => {
  it('button "Cột" in the header (also without title / pagination): ghost td-btn, menu button ARIA, icon', async () => {
    const el = await mk('column-menu', { data: ROWS.slice(0, 1) });
    const b = btn(el);
    expect(el.querySelector('.td-table__header').hidden).to.equal(false);
    expect(b.localName).to.equal('button');
    expect(b.getAttribute('type')).to.equal('button');
    expect(b.classList.contains('td-btn')).to.equal(true);
    expect(b.classList.contains('td-btn--ghost')).to.equal(true);
    expect(b.getAttribute('aria-haspopup')).to.equal('menu');
    expect(b.getAttribute('aria-expanded')).to.equal('false');
    expect(b.textContent.trim()).to.equal('Cột');
    expect(b.querySelector('[data-td-icon="columns"] svg')).to.not.equal(null);
  });

  it('Enter opens; Space toggles in place (menu stays open, one columns-change each); focus stays in the menu', async () => {
    const el = await mk();
    const ev = record(el, 'columns-change');
    await openMenu(el);
    expect(btn(el).getAttribute('aria-expanded')).to.equal('true');
    let its = mItems();
    expect(its.map(label)).to.deep.equal(['Vai trò', 'Email', 'Trạng thái', 'Khôi phục mặc định']);
    expect(its.slice(0, 3).map((n) => n.getAttribute('role'))).to.deep.equal(['menuitemcheckbox', 'menuitemcheckbox', 'menuitemcheckbox']);
    expect(its.slice(0, 3).map((n) => n.getAttribute('aria-checked'))).to.deep.equal(['true', 'true', 'false']);
    expect(document.activeElement === its[0]).to.equal(true);
    await sendKeys({ press: 'Space' }); // hide "Vai trò"
    expect(menu()).to.not.equal(null);
    expect(ev).to.deep.equal([{ hidden: ['role', 'status'], reason: 'toggle' }]);
    expect(hiddenCols(el)).to.deep.equal(['role', 'status']);
    expect(document.activeElement === its[0]).to.equal(true);
    // the table updating while the menu is open does not move focus
    el.data = ROWS.slice().reverse();
    await raf();
    expect(document.activeElement === its[0]).to.equal(true);
    expect(cellsHidden(el, 'role')).to.deep.equal([true, true, true]);
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Space' }); // show "Trạng thái"
    expect(ev.length).to.equal(2);
    expect(ev[1]).to.deep.equal({ hidden: ['role'], reason: 'toggle' });
    its = mItems();
    expect(its[2].getAttribute('aria-checked')).to.equal('true');
  });

  it('min-visible: the last allowed item locks (aria-disabled + hint) and unlocks while the menu is open', async () => {
    const el = await mk('column-menu min-visible="2"');
    const ev = record(el, 'columns-change');
    await openMenu(el);
    const its = mItems();
    await sendKeys({ press: 'Space' }); // hide role → visible: name, email (= 2)
    expect(its[1].getAttribute('aria-disabled')).to.equal('true');
    expect(its[1].querySelector('.td-menu__hint').textContent).to.equal('Cần ít nhất 2 cột');
    expect(its[2].hasAttribute('aria-disabled')).to.equal(false); // hidden items can always be shown
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Space' }); // locked: nothing
    expect(its[1].getAttribute('aria-checked')).to.equal('true');
    expect(ev.length).to.equal(1);
    await sendKeys({ press: 'ArrowUp' });
    await sendKeys({ press: 'Space' }); // show role again → unlocked
    expect(its[1].hasAttribute('aria-disabled')).to.equal(false);
    expect(its[1].querySelector('.td-menu__hint')).to.equal(null);
    expect(menu()).to.not.equal(null);
  });

  it('"Khôi phục mặc định" → the `hidden` flags of columns, reason reset, menu closes, focus back on "Cột"', async () => {
    const el = await mk('column-menu', { setup: (t) => { t.hiddenColumns = ['email']; } });
    const ev = record(el, 'columns-change');
    await openMenu(el);
    await sendKeys({ press: 'End' });
    expect(label(document.activeElement)).to.equal('Khôi phục mặc định');
    await sendKeys({ press: 'Enter' });
    expect(menu()).to.equal(null);
    expect(ev).to.deep.equal([{ hidden: ['status'], reason: 'reset' }]);
    expect(hiddenCols(el)).to.deep.equal(['status']);
    expect(document.activeElement === btn(el)).to.equal(true);
  });

  it('card mode (container 360): hidden fields leave the card; the sort chip of a hidden column goes too', async () => {
    const el = await mk('column-menu', { width: 360, setup: (t) => { t.hiddenColumns = ['role', 'status']; } });
    const card = el.querySelector('.td-table__body > .td-table__row');
    expect(getComputedStyle(card).display).to.equal('flex');
    const roleTd = card.querySelector('[data-col-key="role"]');
    expect(getComputedStyle(roleTd).display).to.equal('none');
    expect(getComputedStyle(card.querySelector('[data-col-key="email"]')).display).to.not.equal('none');
    expect(getComputedStyle(el.querySelector('.td-table__th[data-col-key="role"]')).display).to.equal('none');
    expect(btn(el).getClientRects().length).to.be.greaterThan(0);
    expect(document.documentElement.scrollWidth).to.be.at.most(window.innerWidth);
    await openMenu(el);
    expect(mItems().length).to.equal(4);
    if (!IS_WEBKIT) expect(document.activeElement === mItems()[0]).to.equal(true);
  });

  it('mouse: clicking an item toggles it (menu stays open)', async () => {
    const el = await mk();
    btn(el).click();
    await raf();
    const it0 = mItems()[1];
    const r = it0.getBoundingClientRect();
    await sendMouse({ type: 'click', position: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] });
    expect(menu()).to.not.equal(null);
    expect(hiddenCols(el)).to.deep.equal(['email', 'status']);
  });
});
