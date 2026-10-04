import { expect } from '@esm-bundle/chai';
import './td-tabs.js';
import './td-table.js';
import { TdPagination } from './td-pagination.js';
import { TdEmptyState } from './td-empty-state.js';

// v0.16.0 group B (plan docs/internal/plans/v0.16.0-backlog.md): B6 guarded callbacks (tabs, table), B7
// TdPagination.labels + TdEmptyState.labels, A7 (pagination part) site inline custom properties survive re-renders.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const PAG_LABELS = { ...TdPagination.labels };
const ES_LABELS = { ...TdEmptyState.labels };
const origError = console.error;
let errors = [];

beforeEach(() => {
  errors = [];
  console.error = (...args) => { errors.push(args); };
});
afterEach(() => {
  console.error = origError;
  Object.assign(TdPagination.labels, PAG_LABELS);
  Object.assign(TdEmptyState.labels, ES_LABELS);
  host.innerHTML = '';
});

describe('B6 tabs onChange is guarded', () => {
  it('a throwing onChange is logged, the tab still switches and tab-change still fires', () => {
    const el = mount('<td-tabs></td-tabs>');
    el.tabs = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
    const events = [];
    el.addEventListener('tab-change', (e) => events.push(e.detail.tabId));
    el.onChange = () => { throw new Error('boom'); };
    el.querySelectorAll('.td-tabs__tab')[1].click();
    expect(events).to.deep.equal(['b']);
    expect(el.querySelectorAll('.td-tabs__tab')[1].getAttribute('aria-selected')).to.equal('true');
    expect(errors).to.have.length(1);
    expect(String(errors[0][0])).to.contain('onChange');
  });
});

describe('B6 table callbacks are guarded', () => {
  const COLS = [{ key: 'id', label: 'ID', sortable: true }, { key: 'name', label: 'Tên' }];
  const ROWS = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `N${i + 1}` }));
  const rows = (el) => [...el.querySelectorAll('.td-table__body > .td-table__row')];

  it('a throwing column render leaves that cell empty; other cells and rows render', () => {
    const el = mount('<td-table></td-table>');
    el.columns = [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Tên', ellipsis: true, render: (row) => { if (row.id === 2) throw new Error('bad'); return `<b>${row.id}</b>`; } },
    ];
    el.data = ROWS.slice(0, 3);
    const trs = rows(el);
    // v0.34.0: every body cell starts with its aria-hidden card label (span.td-table__cell-label) — read the value only
    const value = (td) => [...td.childNodes].filter((n) => !(n.classList && n.classList.contains('td-table__cell-label'))).map((n) => n.textContent).join('');
    const content = (td) => [...td.children].filter((n) => !n.classList.contains('td-table__cell-label'));
    expect(trs).to.have.length(3);
    expect(value(trs[0].children[1])).to.equal('1');
    expect(value(trs[1].children[1])).to.equal('');
    expect(content(trs[1].children[1])).to.have.length(0);
    expect(value(trs[1].children[0])).to.equal('2');
    expect(value(trs[2].children[1])).to.equal('3');
    expect(errors).to.have.length(1);
  });

  it('server mode: a throwing onSort / onPageChange is logged; sort-change fires and the paginations stay in sync', () => {
    const el = mount('<td-table server-mode total-items="23" per-page="5"></td-table>');
    el.columns = COLS.map((c) => ({ ...c }));
    el.data = ROWS.slice(0, 5);
    const sorts = [];
    el.addEventListener('sort-change', (e) => sorts.push(e.detail.direction));
    el.onSort = () => { throw new Error('sort boom'); };
    el.onPageChange = () => { throw new Error('page boom'); };
    el.querySelector('.td-table__sort[data-sort-col="0"]').click();
    expect(sorts).to.deep.equal(['asc']);
    expect(el.querySelector('.td-table__th').getAttribute('aria-sort')).to.equal('ascending');
    el.querySelector('.td-table__footer td-pagination .td-pagination__page[data-page="3"]').click();
    expect(el.getState().page).to.equal(3);
    expect(el.querySelector('.td-table__header td-pagination').getAttribute('current-page')).to.equal('3');
    expect(errors.map((e) => String(e[0]))).to.deep.equal(['td-table: onSort threw', 'td-table: onPageChange threw']);
  });
});

describe('B7 TdPagination.labels', () => {
  const info = (el) => el.querySelector('.td-pagination__info').textContent;

  it('defaults keep the previous strings', () => {
    const el = mount('<td-pagination total-items="23" items-per-page="10" current-page="2"></td-pagination>');
    expect(info(el)).to.equal('Hiển thị 11-20 / 23 mục');
    expect(el.querySelector('[data-nav="prev"]').getAttribute('aria-label')).to.equal('Trang trước');
    expect(el.querySelector('[data-nav="next"]').getAttribute('aria-label')).to.equal('Trang sau');
    expect(el.querySelector('.td-pagination__page[data-page="3"]').getAttribute('aria-label')).to.equal('Trang 3');
  });

  it('item-label is still used for {item}', () => {
    const el = mount('<td-pagination total-items="23" item-label="đơn hàng"></td-pagination>');
    expect(info(el)).to.equal('Hiển thị 1-10 / 23 đơn hàng');
  });

  it('overriding info / item / prev / next / page takes effect (escaped)', () => {
    Object.assign(TdPagination.labels, {
      info: 'Showing {from}–{to} of {total} {item}', item: 'rows', prev: 'Previous <i>', next: 'Next', page: 'Page {n}',
    });
    const el = mount('<td-pagination total-items="23" current-page="3"></td-pagination>');
    expect(info(el)).to.equal('Showing 21–23 of 23 rows');
    expect(el.querySelector('[data-nav="prev"]').getAttribute('aria-label')).to.equal('Previous <i>');
    expect(el.querySelector('i')).to.equal(null);
    expect(el.querySelector('[data-nav="next"]').getAttribute('aria-label')).to.equal('Next');
    expect(el.querySelector('.td-pagination__page[data-page="1"]').getAttribute('aria-label')).to.equal('Page 1');
    el.setAttribute('item-label', 'orders');
    expect(info(el)).to.equal('Showing 21–23 of 23 orders');
  });
});

describe('B7 TdEmptyState.labels.action', () => {
  it('an action without label shows "Thực hiện" by default and follows the override', () => {
    const el = mount('<td-empty-state></td-empty-state>');
    el.actions = [{}, { label: 'Tạo mới' }];
    const texts = () => [...el.querySelectorAll('.td-empty-state__actions button')].map((b) => b.textContent);
    expect(texts()).to.deep.equal(['Thực hiện', 'Tạo mới']);
    TdEmptyState.labels.action = 'Do it';
    el.actions = [{ label: '' }];
    expect(texts()).to.deep.equal(['Do it']);
  });
});

describe('A7 pagination keeps site inline custom properties', () => {
  it('a site var set before and after the first render survives renders and active-color changes', () => {
    const el = document.createElement('td-pagination');
    el.setAttribute('total-items', '50');
    el.style.setProperty('--td-pagination-active', 'rgb(1, 2, 3)');
    el.style.setProperty('--td-pagination-item-size', '44px');
    host.appendChild(el);
    // first render without active-color: the site's own values stay
    expect(el.style.getPropertyValue('--td-pagination-active')).to.equal('rgb(1, 2, 3)');
    expect(el.style.getPropertyValue('--td-pagination-item-size')).to.equal('44px');

    el.style.setProperty('--td-pagination-active-fg', 'rgb(4, 5, 6)');
    el.setAttribute('current-page', '3'); // re-render
    el.setAttribute('max-pages', '3');
    expect(el.style.getPropertyValue('--td-pagination-active')).to.equal('rgb(1, 2, 3)');
    expect(el.style.getPropertyValue('--td-pagination-active-fg')).to.equal('rgb(4, 5, 6)');

    // the component's own vars come and go with active-color; unrelated site vars are untouched
    el.setAttribute('active-color', '#ff0000');
    expect(el.style.getPropertyValue('--td-pagination-active')).to.not.equal('rgb(1, 2, 3)');
    expect(el.style.getPropertyValue('--td-pagination-item-size')).to.equal('44px');
    el.removeAttribute('active-color');
    expect(el.style.getPropertyValue('--td-pagination-active')).to.equal('');
    expect(el.style.getPropertyValue('--td-pagination-active-fg')).to.equal('');
    expect(el.style.getPropertyValue('--td-pagination-item-size')).to.equal('44px');

    // a site var set after that is again left alone by later renders
    el.style.setProperty('--td-pagination-active', 'rgb(7, 8, 9)');
    el.setAttribute('current-page', '1');
    el.setAttribute('active-color', 'not a colour');
    expect(el.style.getPropertyValue('--td-pagination-active')).to.equal('rgb(7, 8, 9)');
  });
});
