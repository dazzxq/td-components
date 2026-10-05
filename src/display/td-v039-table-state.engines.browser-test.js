import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import './td-table.js';

// v0.39.0 (plan docs/internal/plans/v0.39.0-filters-range.md QĐ 1–5, M1) — td-table external filter hook + controlled
// mode: `request-change` { state, reason, requestId } in every mode (after sort-change / page-change, before onSort /
// onPageChange), `controlled` (server mode only) = the table never applies a page / sort itself: it asks, shows the
// skeleton (aria-busy), keeps focus on the activated control and waits for `setState()` (atomic, silent; an older
// `requestId` is dropped). `setFilters()` asks for `filters` (page 1). REAL input (sendMouse / sendKeys) in Chromium,
// Firefox and WebKit. Waits on real signals (events, rAF) — no sleeps.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const root = document.createElement('div');
document.body.appendChild(root);
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const frames = async (n = 2) => { for (let i = 0; i < n; i++) await raf(); };
const tick = () => new Promise((r) => queueMicrotask(r));

const warns = [];
const origWarn = console.warn;
beforeEach(() => {
  warns.length = 0;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
});
afterEach(async () => {
  console.warn = origWarn;
  await resetMouse();
  root.innerHTML = '';
});

const ROWS = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, name: `Tên ${String(i + 1).padStart(2, '0')}`, role: i % 2 ? 'B' : 'A' }));
const COLS = [{ key: 'name', label: 'Tên', sortable: true }, { key: 'role', label: 'Vai trò', sortable: true }];

async function mk(attrs = '', { columns = COLS, data = ROWS, setup } = {}) {
  const wrap = document.createElement('div');
  wrap.style.width = '900px';
  wrap.innerHTML = `<td-table ${attrs}></td-table>`;
  root.appendChild(wrap);
  const el = wrap.querySelector('td-table');
  if (setup) setup(el);
  el.columns = columns;
  el.data = data;
  await frames(2);
  return el;
}
const rows = (el) => [...el.querySelectorAll('.td-table__body > .td-table__row')];
const names = (el) => rows(el).map((tr) => tr.querySelector('[data-col="0"]').lastChild?.textContent ?? '');
const sortBtn = (el, ci = 0) => el.querySelector(`.td-table__sort[data-sort-col="${ci}"]`);
const th = (el, ci = 0) => el.querySelector(`.td-table__th[data-col="${ci}"]`);
const pagTop = (el) => el.querySelector('.td-table__header td-pagination');
const pagBottom = (el) => el.querySelector('.td-table__footer td-pagination');
const pageBtn = (p, n) => p.querySelector(`.td-pagination__page[data-page="${n}"]`);
const current = (p) => p.querySelector('.td-pagination__page[aria-current="page"]')?.getAttribute('data-page');
const center = (n) => {
  const r = n.getBoundingClientRect();
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
};
async function click(n) {
  n.scrollIntoView({ block: 'nearest' });
  await raf();
  await sendMouse({ type: 'click', position: center(n) });
  await raf();
}
/** Records the named events (detail) and callback calls on `el`, in order. */
function journal(el, names = ['sort-change', 'page-change', 'request-change']) {
  const log = [];
  for (const n of names) el.addEventListener(n, (e) => log.push([n, e.detail]));
  return log;
}

describe('v0.39.0 td-table request-change — not controlled (QĐ 2)', () => {
  it('client mode sort: sort-change → request-change; the table sorts itself as before', async () => {
    const el = await mk('per-page="5"');
    const log = journal(el);
    await click(sortBtn(el, 1));
    expect(log.map((x) => x[0])).to.deep.equal(['sort-change', 'request-change']);
    const d = log[1][1];
    expect(d.reason).to.equal('sort');
    expect(d.requestId).to.equal(1);
    expect(d.state.sort).to.deep.equal({ key: 'role', direction: 'asc' });
    expect(d.state.page).to.equal(1);
    expect(d.state.perPage).to.equal(5);
    expect(d.state.filters).to.deep.equal({});
    expect(Object.isFrozen(d.state)).to.equal(true);
    expect(Object.isFrozen(d.state.sort)).to.equal(true);
    expect(Object.isFrozen(d.state.filters)).to.equal(true);
    expect(th(el, 1).getAttribute('aria-sort')).to.equal('ascending');
    expect(rows(el).map((tr) => tr.querySelector('[data-col="1"]').lastChild.textContent)).to.deep.equal(['A', 'A', 'A', 'A', 'A']);
    expect(el.hasAttribute('loading')).to.equal(false);
  });

  it('server mode: sort-change → request-change → onSort; page-change → request-change → onPageChange', async () => {
    const el = await mk('server-mode total-items="23" per-page="5"', { data: ROWS.slice(0, 5) });
    const log = journal(el);
    el.onSort = (d) => log.push(['onSort', d]);
    el.onPageChange = (p) => log.push(['onPageChange', p]);
    await click(sortBtn(el, 0));
    expect(log.map((x) => x[0])).to.deep.equal(['sort-change', 'request-change', 'onSort']);
    expect(log[1][1].state.sort).to.deep.equal({ key: 'name', direction: 'asc' });
    log.length = 0;
    await click(pageBtn(pagBottom(el), 3));
    expect(log.map((x) => x[0])).to.deep.equal(['page-change', 'request-change', 'onPageChange']);
    expect(log[1][1].reason).to.equal('page');
    expect(log[1][1].state.page).to.equal(3);
    expect(log[1][1].requestId).to.equal(2);
    expect(log[2][1]).to.equal(3);
    // not controlled: the table applied the page (old behaviour)
    expect(current(pagTop(el))).to.equal('3');
    expect(el.getState().page).to.equal(3);
  });

  it('page-change listeners on an ancestor run before request-change (the click finished first)', async () => {
    const el = await mk('per-page="5"');
    const log = [];
    root.addEventListener('page-change', () => log.push('page-change@root'));
    root.addEventListener('request-change', () => log.push('request-change@root'));
    await click(pageBtn(pagBottom(el), 2));
    expect(log).to.deep.equal(['page-change@root', 'request-change@root']);
  });

  it('keyboard page change (Enter on a page button) fires request-change once', async () => {
    const el = await mk('per-page="5"');
    const log = journal(el, ['request-change']);
    pageBtn(pagBottom(el), 4).focus();
    await sendKeys({ press: 'Enter' });
    await tick();
    expect(log.length).to.equal(1);
    expect(log[0][1].state.page).to.equal(4);
  });
});

describe('v0.39.0 td-table controlled (QĐ 3–4)', () => {
  const ctl = (setup) => mk('server-mode controlled total-items="23" per-page="5"', { data: ROWS.slice(0, 5), setup });

  it('sort by keyboard: nothing applied, skeleton + aria-busy, focus kept on the sort button; setState applies silently', async () => {
    const el = await ctl();
    const log = journal(el);
    const before = names(el);
    sortBtn(el, 0).focus();
    await sendKeys({ press: 'Enter' });
    expect(log.map((x) => x[0])).to.deep.equal(['sort-change', 'request-change']);
    const { state, requestId } = log[1][1];
    expect(state.sort).to.deep.equal({ key: 'name', direction: 'asc' });
    expect(th(el, 0).hasAttribute('aria-sort')).to.equal(false);
    expect(el.hasAttribute('loading')).to.equal(true);
    expect(el.querySelector('.td-table__table').getAttribute('aria-busy')).to.equal('true');
    expect(el.querySelector('.td-table__row--skeleton')).to.not.equal(null);
    expect(document.activeElement === sortBtn(el, 0), 'focus on the sort button').to.equal(true);
    // paginations stay (focus could be on them) and keep the current page
    expect(el.querySelector('.td-table__footer').hidden).to.equal(false);
    expect(current(pagBottom(el))).to.equal('1');
    expect(el.getState().sort).to.deep.equal({ key: null, direction: null });

    log.length = 0;
    const sorted = ROWS.slice().reverse().slice(0, 5);
    expect(el.setState({ sort: state.sort, page: 1, data: sorted, totalItems: 23, requestId })).to.equal(true);
    expect(log).to.deep.equal([]);
    expect(th(el, 0).getAttribute('aria-sort')).to.equal('ascending');
    expect(el.hasAttribute('loading')).to.equal(false);
    expect(el.querySelector('.td-table__table').hasAttribute('aria-busy')).to.equal(false);
    expect(names(el)).to.deep.equal(sorted.map((r) => r.name));
    expect(names(el)).to.not.deep.equal(before);
    expect(document.activeElement === sortBtn(el, 0), 'focus on the sort button').to.equal(true);
    expect(el.getState().sort).to.deep.equal({ key: 'name', direction: 'asc' });
  });

  it('page by mouse: the pagination keeps the current page until setState moves it', async () => {
    const el = await ctl();
    const log = journal(el);
    const spy = [];
    el.onPageChange = (p) => spy.push(p);
    await click(pageBtn(pagBottom(el), 3));
    expect(log.map((x) => x[0])).to.deep.equal(['page-change', 'request-change']);
    expect(spy).to.deep.equal([3]);
    expect(current(pagBottom(el))).to.equal('1');
    expect(el.hasAttribute('loading')).to.equal(true);
    el.setState({ page: 3, data: ROWS.slice(10, 15), requestId: el.getState().requestId });
    expect(current(pagBottom(el))).to.equal('3');
  });

  it('page by keyboard: the pagination keeps the current page, focus stays on the pressed button; setState moves it', async () => {
    const el = await ctl();
    const log = journal(el);
    const spy = [];
    el.onPageChange = (p) => spy.push(p);
    pageBtn(pagBottom(el), 3).focus();
    await sendKeys({ press: 'Enter' });
    expect(log.map((x) => x[0])).to.deep.equal(['page-change', 'request-change']);
    expect(spy).to.deep.equal([3]);
    expect(log[1][1].state.page).to.equal(3);
    expect(current(pagBottom(el))).to.equal('1');
    expect(current(pagTop(el))).to.equal('1');
    expect(el.getState().page).to.equal(1);
    expect(document.activeElement === pageBtn(pagBottom(el), 3), 'focus on page 3').to.equal(true);
    expect(el.hasAttribute('loading')).to.equal(true);

    log.length = 0;
    el.setState({ page: 3, data: ROWS.slice(10, 15), requestId: el.getState().requestId });
    expect(log).to.deep.equal([]);
    expect(current(pagBottom(el))).to.equal('3');
    expect(current(pagTop(el))).to.equal('3');
    expect(names(el)[0]).to.equal('Tên 11');
    expect(pagBottom(el).contains(document.activeElement)).to.equal(true);
  });

  it('race: an older response arriving after the newest request is dropped (requestId)', async () => {
    const el = await ctl();
    const ids = [];
    el.addEventListener('request-change', (e) => ids.push(e.detail.requestId));
    el.setFilters({ q: 'a' });
    el.setFilters({ q: 'ab' });
    expect(ids).to.deep.equal([1, 2]);
    // response #2 first … then the slow #1
    expect(el.setState({ filters: { q: 'ab' }, page: 1, data: ROWS.slice(0, 2), totalItems: 2, requestId: 2 })).to.equal(true);
    expect(el.setState({ filters: { q: 'a' }, page: 1, data: ROWS.slice(0, 5), totalItems: 9, requestId: 1 })).to.equal(false);
    expect(rows(el).length).to.equal(2);
    expect(el.getState().filters).to.deep.equal({ q: 'ab' });
    expect(el.getState().totalItems).to.equal(2);
    expect(el.hasAttribute('loading')).to.equal(false);
  });

  it('an older response before the newest one keeps the skeleton (still waiting)', async () => {
    const el = await ctl();
    el.setFilters({ q: 'a' });
    el.setFilters({ q: 'ab' });
    expect(el.setState({ data: ROWS.slice(0, 1), requestId: 1 })).to.equal(false);
    expect(el.hasAttribute('loading')).to.equal(true);
    expect(el.querySelector('.td-table__row--skeleton')).to.not.equal(null);
    el.setState({ data: ROWS.slice(0, 3), requestId: 2 });
    expect(el.hasAttribute('loading')).to.equal(false);
    expect(rows(el).length).to.equal(3);
  });

  it('a request made while waiting builds on the one asked for (sort clicked, then a filter typed before the answer)', async () => {
    const el = await ctl();
    const log = journal(el, ['request-change']);
    sortBtn(el, 1).focus();
    await sendKeys({ press: 'Enter' }); // asks role asc
    await sendKeys({ press: 'Enter' }); // cycles from the REQUESTED sort → role desc
    el.setFilters({ q: 'x' });
    expect(log.map((x) => x[1].state.sort)).to.deep.equal([
      { key: 'role', direction: 'asc' }, { key: 'role', direction: 'desc' }, { key: 'role', direction: 'desc' }]);
    expect(log[2][1].state.filters).to.deep.equal({ q: 'x' });
    el.setState({ ...log[2][1].state, data: ROWS.slice(0, 5), requestId: log[2][1].requestId });
    expect(el.getState().sort).to.deep.equal({ key: 'role', direction: 'desc' });
    el.setFilters({ q: 'y' }); // not waiting any more: builds on the applied state
    expect(log[3][1].state.sort).to.deep.equal({ key: 'role', direction: 'desc' });
  });

  it('setFilters: reason filters, page 1, filters copied + frozen; resetPage: false keeps the page', async () => {
    const el = await ctl((t) => t.setState({ page: 3 }));
    expect(el.getState().page).to.equal(3);
    const log = journal(el, ['request-change']);
    const f = { q: 'máy', status: ['new', 'used'], inStock: true };
    el.setFilters(f);
    f.q = 'changed';
    const d = log[0][1];
    expect(d.reason).to.equal('filters');
    expect(d.state.page).to.equal(1);
    expect(d.state.filters.q).to.equal('máy');
    expect(d.state.filters.status).to.deep.equal(['new', 'used']);
    expect(Object.isFrozen(d.state.filters)).to.equal(true);
    // controlled: nothing applied yet
    expect(el.getState().filters).to.deep.equal({});
    // still waiting: builds on the pending request (page 1); answered: on the applied page
    el.setFilters({ q: 'x' }, { resetPage: false });
    expect(log[1][1].state.page).to.equal(1);
    el.setState({ page: 3, data: ROWS.slice(10, 15), requestId: 2 });
    el.setFilters({ q: 'z' }, { resetPage: false });
    expect(log[2][1].state.page).to.equal(3);
  });

  it('not controlled: setFilters applies the filters and page 1 (the kit never filters the rows)', async () => {
    const el = await mk('per-page="5"');
    el.setPage(3);
    el.setFilters({ role: 'A' });
    expect(el.getState().filters).to.deep.equal({ role: 'A' });
    expect(el.getState().page).to.equal(1);
    expect(rows(el).length).to.equal(5);
    expect(el.hasAttribute('loading')).to.equal(false);
  });

  it('controlled without server-mode → one warning, behaves as before (the sort is applied)', async () => {
    const el = await mk('controlled per-page="5"');
    await click(sortBtn(el, 0));
    await click(sortBtn(el, 0));
    expect(th(el, 0).getAttribute('aria-sort')).to.equal('descending');
    expect(el.hasAttribute('loading')).to.equal(false);
    expect(warns.filter((w) => /controlled/.test(w)).length).to.equal(1);
  });

  it('setState: unknown / non-sortable sort key → sort cleared + one warning', async () => {
    const el = await ctl();
    el.setState({ sort: { key: 'name', direction: 'desc' } });
    expect(th(el, 0).getAttribute('aria-sort')).to.equal('descending');
    el.setState({ sort: { key: 'nope', direction: 'asc' } });
    expect(el.getState().sort).to.deep.equal({ key: null, direction: null });
    expect(th(el, 0).hasAttribute('aria-sort')).to.equal(false);
    el.setState({ sort: { key: 'nope', direction: 'asc' } });
    expect(warns.filter((w) => /sort/.test(w)).length).to.equal(1);
  });

  it('getState: filters, totalItems, requestId (+ v0.37 selection kept)', async () => {
    const el = await ctl();
    let s = el.getState();
    expect(s.filters).to.deep.equal({});
    expect(s.totalItems).to.equal(23);
    expect(s.requestId).to.equal(0);
    expect(s.selection).to.deep.equal({ mode: 'none', keys: [] });
    el.setFilters({ q: 'z' });
    el.setState({ filters: { q: 'z' }, totalItems: 4, data: ROWS.slice(0, 4), requestId: 1 });
    s = el.getState();
    expect(s.filters).to.deep.equal({ q: 'z' });
    expect(s.totalItems).to.equal(4);
    expect(s.requestId).to.equal(1);
  });
});

describe('v0.39.0 td-table restore from the URL (QĐ 4)', () => {
  const state = { page: 2, perPage: 5, sort: { key: 'role', direction: 'desc' }, filters: { q: 'Tên' }, totalItems: 23 };

  it('setState BEFORE connect: first render already shows page 2, the sort and the filters', async () => {
    const el = document.createElement('td-table');
    el.setAttribute('server-mode', '');
    el.setAttribute('controlled', '');
    el.columns = COLS;
    el.setState({ ...state, data: ROWS.slice(5, 10) });
    const log = journal(el);
    root.appendChild(el);
    await frames(2);
    expect(log).to.deep.equal([]);
    expect(current(pagBottom(el))).to.equal('2');
    expect(th(el, 1).getAttribute('aria-sort')).to.equal('descending');
    expect(el.getState().filters).to.deep.equal({ q: 'Tên' });
    expect(el.getState().perPage).to.equal(5);
    expect(names(el)[0]).to.equal('Tên 06');
    expect(el.hasAttribute('loading')).to.equal(false);
  });

  it('setState before the columns are known: the sort key resolves when they arrive', async () => {
    const el = document.createElement('td-table');
    el.setAttribute('server-mode', '');
    el.setState({ ...state, data: ROWS.slice(5, 10) });
    root.appendChild(el);
    el.columns = COLS;
    await frames(1);
    expect(th(el, 1).getAttribute('aria-sort')).to.equal('descending');
    expect(warns.filter((w) => /sort/.test(w)).length).to.equal(0);
  });

  it('setState AFTER connect (popstate): applied atomically, no event', async () => {
    const el = await mk('server-mode controlled total-items="23" per-page="10"', { data: ROWS.slice(0, 10) });
    const log = journal(el);
    el.setState({ ...state, data: ROWS.slice(5, 10) });
    expect(log).to.deep.equal([]);
    expect(current(pagTop(el))).to.equal('2');
    expect(el.getState().perPage).to.equal(5);
    expect(rows(el).length).to.equal(5);
    expect(th(el, 1).getAttribute('aria-sort')).to.equal('descending');
  });
});
