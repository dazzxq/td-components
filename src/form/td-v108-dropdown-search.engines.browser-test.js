import { expect } from '@esm-bundle/chai';
import { TdDropdown } from './td-dropdown.js';

// v0.108.0 — td-dropdown `search` (server search provider): debounce, abort + stale results dropped, no local
// filtering, `min-chars` (hint below it, the empty query included; 0 = search on open), the slow "Đang tìm…" status,
// errors (searchError + retry + `search-error`), select / action (keep-open) picks of results that are not in
// `options`, keyboard, ARIA, close cancelling, `groups` ignored for results, `search` assigned after connect. Without
// `search` the local filter is unchanged (regression test). DOM nodes are compared as booleans / strings (a failing
// chai assertion carrying DOM nodes hangs the runner). Providers are controllable deferred promises.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html, parent = host) => { parent.insertAdjacentHTML('beforeend', html.trim()); return parent.lastElementChild; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const micro = () => wait(0);
const LABELS = { ...TdDropdown.labels };
let warns = [];
const origWarn = console.warn;
beforeEach(() => {
  warns = [];
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
});
afterEach(async () => {
  console.warn = origWarn;
  Object.assign(TdDropdown.labels, LABELS);
  for (const d of host.querySelectorAll('td-dropdown')) if (d._isOpen) d.close();
  host.innerHTML = '';
  await wait(10);
});

const trig = (el) => el.querySelector('.td-dropdown__trigger');
const menu = (el) => el._menuElement;
const scroller = (el) => menu(el).querySelector('.td-dropdown__scroller');
const listbox = (el) => menu(el).querySelector('[role="listbox"]');
const search = (el) => menu(el).querySelector('.td-dropdown__search');
const status = (el) => menu(el).querySelector('.td-dropdown__empty');
const retry = (el) => menu(el).querySelector('.td-dropdown__retry');
const rows = (el) => [...scroller(el).querySelectorAll('.td-dropdown__option[data-index]')];
const values = (el) => rows(el).map((r) => r.getAttribute('data-value'));
const activeValue = (el) => {
  const a = menu(el).querySelector('[data-active]');
  return a ? a.getAttribute('data-value') : null;
};
const busy = (el) => listbox(el).getAttribute('aria-busy') === 'true';
const keyOn = (target, k, init = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
function type(el, q) {
  const s = search(el);
  s.value = q;
  s.dispatchEvent(new Event('input', { bubbles: true }));
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
/** a provider that records (query, signal) per call and hands out one deferred per call */
function providerOf() {
  const calls = [];
  const fn = (query, opts) => { const d = deferred(); calls.push({ query, signal: opts.signal, ...d }); return d.promise; };
  fn.calls = calls;
  fn.queries = () => calls.map((c) => c.query);
  return fn;
}
function dd(attrs = '', { options = null, groups = null, provider = null } = {}) {
  const el = mount(`<td-dropdown aria-label="Sản phẩm" search-delay="20" ${attrs}></td-dropdown>`);
  if (groups) el.groups = groups;
  if (options) el.options = options.map((o) => ({ ...o }));
  if (provider) el.search = provider;
  return el;
}
/** the control carrying aria-activedescendant points at a row that exists in the listbox */
function adOk(el) {
  const owners = [trig(el), search(el)].filter((n) => n && n.hasAttribute('aria-activedescendant'));
  if (!owners.length) return true;
  if (owners.length > 1) return false;
  const id = owners[0].getAttribute('aria-activedescendant');
  const row = document.getElementById(id);
  return !!row && listbox(el).contains(row) && row.getAttribute('role') === 'option';
}

const RECENT = [{ value: 'r1', label: 'Gần đây 1' }, { value: 'r2', label: 'Gần đây 2' }];
const A_RES = [{ value: 'a1', label: 'Áo thun', meta: 'SKU-A1' }, { value: 'a2', label: 'Áo khoác', meta: 'SKU-A2' }];
const B_RES = [{ value: 'b1', label: 'Bút bi' }];

describe('v0.108.0 td-dropdown search — request lifecycle', () => {
  it('debounce: three fast keystrokes → one call with the last (trimmed) query', async () => {
    const p = providerOf();
    const el = dd('', { provider: p });
    el.open();
    type(el, 'a');
    type(el, 'ab');
    type(el, ' abc ');
    await wait(5);
    expect(p.calls.length).to.equal(0);
    await wait(40);
    expect(p.queries()).to.deep.equal(['abc']);
  });

  it('a new query aborts the request in flight; a late answer of the old one (provider ignored the signal) is dropped', async () => {
    const p = providerOf();
    const el = dd('', { provider: p });
    el.open();
    type(el, 'ao');
    await wait(40);
    expect(p.calls.length).to.equal(1);
    p.calls[0].resolve(A_RES);
    await micro();
    expect(values(el)).to.deep.equal(['a1', 'a2']);
    type(el, 'aoxx');
    await wait(40);
    expect(p.calls.length).to.equal(2);
    type(el, 'but');
    expect(p.calls[1].signal.aborted).to.equal(true);
    // while B waits, the rows of A stay
    expect(values(el)).to.deep.equal(['a1', 'a2']);
    await wait(40);
    expect(p.calls.length).to.equal(3);
    p.calls[2].resolve(B_RES);
    await micro();
    expect(values(el)).to.deep.equal(['b1']);
    p.calls[1].resolve([{ value: 'late', label: 'Muộn' }]); // late, ignored the signal
    await micro();
    expect(values(el)).to.deep.equal(['b1']);
    expect(el._shownQuery).to.equal('but');
  });

  it('no local filtering: rows that do not match the label are shown, in the server order', async () => {
    const p = providerOf();
    const el = dd('', { provider: p, options: RECENT });
    el.open();
    type(el, 'sku-9');
    await wait(40);
    p.calls[0].resolve([{ value: 'z', label: 'Zebra' }, { value: 'm', label: 'Mango' }, { value: 'a', label: 'Apple' }]);
    await micro();
    expect(values(el)).to.deep.equal(['z', 'm', 'a']);
    expect(el.options.map((o) => o.value)).to.deep.equal(['r1', 'r2']); // results never become options
    expect(activeValue(el)).to.equal('z');
  });

  it('below min-chars: the hint (announced), the base list unfiltered, no call — the empty query included', async () => {
    const p = providerOf();
    const el = dd('min-chars="3"', { provider: p, options: RECENT });
    el.open();
    expect(status(el).getAttribute('role')).to.equal('status');
    expect(status(el).textContent).to.equal('Gõ ít nhất 3 ký tự để tìm');
    expect(status(el).hasAttribute('data-count')).to.equal(false);
    expect(values(el)).to.deep.equal(['r1', 'r2']);
    type(el, 'zz'); // does not match the base list: it is still not filtered
    await wait(40);
    expect(p.calls.length).to.equal(0);
    expect(values(el)).to.deep.equal(['r1', 'r2']);
    expect(status(el).textContent).to.equal('Gõ ít nhất 3 ký tự để tìm');
    type(el, 'zzz');
    await wait(40);
    expect(p.queries()).to.deep.equal(['zzz']);
    // back below the threshold: base list + hint again, the request cancelled
    type(el, 'z');
    expect(p.calls[0].signal.aborted).to.equal(true);
    expect(values(el)).to.deep.equal(['r1', 'r2']);
    expect(status(el).textContent).to.equal('Gõ ít nhất 3 ký tự để tìm');
    // no base list: rows empty, the hint only (no "no results")
    const el2 = dd('', { provider: providerOf() });
    el2.open();
    expect(values(el2)).to.deep.equal([]);
    expect(status(el2).textContent).to.equal('Gõ ít nhất 1 ký tự để tìm');
  });

  it('min-chars="0": opening searches the empty query at once (list empty + searching meanwhile)', async () => {
    const p = providerOf();
    const el = dd('min-chars="0"', { provider: p, options: RECENT });
    el.open();
    expect(p.queries()).to.deep.equal(['']);
    expect(values(el)).to.deep.equal([]);
    expect(busy(el)).to.equal(true);
    expect(status(el).textContent).to.equal('Đang tìm…');
    p.calls[0].resolve(A_RES);
    await micro();
    expect(values(el)).to.deep.equal(['a1', 'a2']);
    expect(busy(el)).to.equal(false);
    el.close();
    el.open();
    expect(p.calls.length).to.equal(2);
  });

  it('min-chars="0": close restores the base list; closed-trigger type-ahead runs on it without the server', async () => {
    const p = providerOf();
    const el = dd('min-chars="0"', { provider: p, options: RECENT });
    el.open();
    p.calls[0].resolve(A_RES);
    await micro();
    el.close();
    expect(values(el)).to.deep.equal(['r1', 'r2']);
    trig(el).focus();
    keyOn(trig(el), 'g');
    expect(el._isOpen).to.equal(true);
    expect(p.calls.length).to.equal(1);
    expect(values(el)).to.deep.equal(['r1', 'r2']);
    expect(activeValue(el)).to.equal('r1');
    await wait(60);
    expect(p.calls.length).to.equal(1);
  });

  it('searching status: at once when crossing the threshold; after 400 ms while results are kept on screen', async () => {
    const p = providerOf();
    const el = dd('', { provider: p, options: RECENT });
    el.open();
    type(el, 'ao');
    // just crossed: the base list is never shown as results → empty + busy now
    expect(values(el)).to.deep.equal([]);
    expect(busy(el)).to.equal(true);
    expect(menu(el).getAttribute('data-load')).to.equal('loading');
    expect(status(el).textContent).to.equal('Đang tìm…');
    await wait(40);
    p.calls[0].resolve(A_RES);
    await micro();
    expect(busy(el)).to.equal(false);
    expect(menu(el).hasAttribute('data-load')).to.equal(false);
    expect(status(el).textContent).to.equal('2 kết quả');
    type(el, 'aok');
    await wait(40); // request B running
    expect(values(el)).to.deep.equal(['a1', 'a2']);
    expect(busy(el)).to.equal(false);
    await wait(420);
    expect(busy(el)).to.equal(true);
    expect(status(el).textContent).to.equal('Đang tìm…');
    expect(values(el)).to.deep.equal(['a1', 'a2']);
    p.calls[1].resolve(B_RES);
    await micro();
    expect(busy(el)).to.equal(false);
    expect(values(el)).to.deep.equal(['b1']);
  });

  it('an empty answer → noResults', async () => {
    const p = providerOf();
    const el = dd('', { provider: p });
    el.open();
    type(el, 'qq');
    await wait(40);
    p.calls[0].resolve([]);
    await micro();
    expect(values(el)).to.deep.equal([]);
    expect(status(el).textContent).to.equal('Không tìm thấy kết quả');
  });

  it('error: searchError + retry button (click and Enter run the query again) + search-error { query, error }', async () => {
    const p = providerOf();
    const el = dd('', { provider: p });
    const events = [];
    el.addEventListener('search-error', (e) => events.push(e.detail));
    el.open();
    type(el, 'ao');
    await wait(40);
    const boom = new Error('500');
    p.calls[0].reject(boom);
    await micro();
    expect(menu(el).getAttribute('data-load')).to.equal('error');
    expect(status(el).textContent).to.equal('Không tìm được.');
    expect(!!retry(el)).to.equal(true);
    expect(retry(el).textContent).to.equal('Thử lại');
    expect(events.length).to.equal(1);
    expect(events[0].query).to.equal('ao');
    expect(events[0].error === boom).to.equal(true);
    expect(el._loadState).to.equal('idle'); // the `load` state is never touched
    retry(el).click();
    expect(p.queries()).to.deep.equal(['ao', 'ao']); // no debounce
    expect(busy(el)).to.equal(true);
    expect(!!retry(el)).to.equal(false);
    p.calls[1].resolve('not an array'); // → an error too (warned)
    await micro();
    expect(status(el).textContent).to.equal('Không tìm được.');
    expect(events.length).to.equal(2);
    expect(warns.some((w) => w.includes('search failed'))).to.equal(true);
    keyOn(search(el), 'Enter');
    expect(p.calls.length).to.equal(3);
    expect(el._isOpen).to.equal(true);
    p.calls[2].resolve(A_RES);
    await micro();
    expect(menu(el).hasAttribute('data-load')).to.equal(false);
    expect(values(el)).to.deep.equal(['a1', 'a2']);
  });

  it('close() cancels the request in flight (aborted; a late answer never renders)', async () => {
    const p = providerOf();
    const el = dd('', { provider: p, options: RECENT });
    el.open();
    type(el, 'ao');
    await wait(40);
    el.close();
    expect(p.calls[0].signal.aborted).to.equal(true);
    p.calls[0].resolve(A_RES);
    await micro();
    expect(values(el)).to.deep.equal(['r1', 'r2']);
    expect(el._shownQuery).to.equal(null);
    // a pending debounce is dropped too
    el.open();
    type(el, 'ab');
    el.close();
    await wait(40);
    expect(p.calls.length).to.equal(1);
  });
});

describe('v0.108.0 td-dropdown search — picking', () => {
  it('select mode: a result that is not in options → trigger text + value + form value; kept on reopen', async () => {
    const form = mount('<form></form>');
    const p = providerOf();
    const el = dd('name="sp"', { provider: p, options: RECENT });
    form.appendChild(el);
    const changes = [];
    el.addEventListener('change', (e) => changes.push(e.detail.value));
    el.open();
    type(el, 'ao');
    await wait(40);
    p.calls[0].resolve(A_RES);
    await micro();
    rows(el)[1].click();
    expect(el._isOpen).to.equal(false);
    expect(changes).to.deep.equal(['a2']);
    expect(el.getValue()).to.equal('a2');
    expect(el.querySelector('.td-dropdown__value').textContent).to.equal('Áo khoác');
    expect(new FormData(form).get('sp')).to.equal('a2');
    el.open();
    expect(values(el)).to.deep.equal(['r1', 'r2']); // the base list again
    el.close();
    expect(el.getValue()).to.equal('a2');
    expect(el.querySelector('.td-dropdown__value').textContent).to.equal('Áo khoác');
    expect(new FormData(form).get('sp')).to.equal('a2');
  });

  it('action mode + keep-open: a pick keeps the menu, the query and the results (no new call); disabled rows are shown but never picked', async () => {
    const p = providerOf();
    const el = dd('mode="action" keep-open placeholder="Thêm"', { provider: p });
    const picks = [];
    el.addEventListener('pick', (e) => picks.push(e.detail.value));
    el.open();
    type(el, 'ao');
    await wait(40);
    p.calls[0].resolve([{ value: 'x', label: 'X', disabled: true }, ...A_RES]);
    await micro();
    expect(rows(el)[0].getAttribute('aria-disabled')).to.equal('true');
    expect(activeValue(el)).to.equal('a1'); // the first enabled row
    rows(el)[0].click();
    expect(picks).to.deep.equal([]);
    rows(el)[1].click();
    expect(picks).to.deep.equal(['a1']);
    expect(el._isOpen).to.equal(true);
    expect(search(el).value).to.equal('ao');
    expect(values(el)).to.deep.equal(['x', 'a1', 'a2']);
    expect(activeValue(el)).to.equal('a2');
    keyOn(search(el), 'Enter');
    expect(picks).to.deep.equal(['a1', 'a2']);
    await wait(60);
    expect(p.calls.length).to.equal(1);
  });
});

describe('v0.108.0 td-dropdown search — keep-open marks picked rows', () => {
  it('onPick sets item.disabled = true → the row is aria-disabled at once, active moves to the next enabled row', async () => {
    const p = providerOf();
    const el = dd('mode="action" keep-open placeholder="Thêm"', { provider: p });
    const picks = [];
    el.onPick = (item) => { item.disabled = true; };
    el.addEventListener('pick', (e) => picks.push(e.detail.value));
    el.open();
    type(el, 'ao');
    await wait(40);
    p.calls[0].resolve([
      { value: 'a1', label: 'A1' }, { value: 'a2', label: 'A2', disabled: true }, { value: 'a3', label: 'A3' },
    ]);
    await micro();
    expect(activeValue(el)).to.equal('a1');
    keyOn(search(el), 'Enter');
    expect(picks).to.deep.equal(['a1']);
    expect(el._isOpen).to.equal(true);
    expect(rows(el)[0].getAttribute('aria-disabled')).to.equal('true');
    expect(activeValue(el)).to.equal('a3'); // a2 was already disabled: skipped
    expect(adOk(el)).to.equal(true);
    expect(search(el).value).to.equal('ao');
    expect(values(el)).to.deep.equal(['a1', 'a2', 'a3']);
    rows(el)[2].click();
    expect(picks).to.deep.equal(['a1', 'a3']);
    expect(rows(el)[2].getAttribute('aria-disabled')).to.equal('true');
    expect(activeValue(el)).to.equal(null); // nothing pickable left
    rows(el)[0].click(); // disabled now: never picked again
    expect(picks).to.deep.equal(['a1', 'a3']);
    await wait(60);
    expect(p.calls.length).to.equal(1);
  });
});

describe('v0.108.0 td-dropdown search — keyboard and ARIA', () => {
  it('↑↓ move over the results, Enter picks, Escape closes and returns focus to the trigger', async () => {
    const p = providerOf();
    const el = dd('', { provider: p });
    trig(el).focus();
    el.open();
    search(el).focus();
    type(el, 'ao');
    await wait(40);
    p.calls[0].resolve([...A_RES, ...B_RES]);
    await micro();
    expect(activeValue(el)).to.equal('a1');
    keyOn(search(el), 'ArrowDown');
    expect(activeValue(el)).to.equal('a2');
    keyOn(search(el), 'ArrowDown');
    expect(activeValue(el)).to.equal('b1');
    keyOn(search(el), 'ArrowUp');
    expect(activeValue(el)).to.equal('a2');
    expect(adOk(el)).to.equal(true);
    expect(search(el).getAttribute('aria-activedescendant')).to.equal(menu(el).querySelector('[data-active]').id);
    keyOn(search(el), 'Enter');
    expect(el.getValue()).to.equal('a2');
    expect(el._isOpen).to.equal(false);
    el.open();
    search(el).focus();
    keyOn(search(el), 'Escape');
    expect(el._isOpen).to.equal(false);
    expect(document.activeElement === trig(el)).to.equal(true);
  });

  it('combobox → listbox; aria-activedescendant only on the focused control and valid before / during / after a search', async () => {
    const p = providerOf();
    const el = dd('', { provider: p, options: RECENT });
    el.open();
    search(el).focus();
    const t = trig(el);
    expect(t.getAttribute('role')).to.equal('combobox');
    expect(t.getAttribute('aria-expanded')).to.equal('true');
    const lb = document.getElementById(t.getAttribute('aria-controls'));
    expect(!!lb && lb.getAttribute('role') === 'listbox').to.equal(true);
    expect(search(el).getAttribute('aria-controls')).to.equal(lb.id);
    keyOn(search(el), 'ArrowDown');
    expect(adOk(el)).to.equal(true);
    expect(search(el).hasAttribute('aria-activedescendant')).to.equal(true);
    expect(t.hasAttribute('aria-activedescendant')).to.equal(false);
    type(el, 'ao'); // loading: no rows → no active descendant
    expect(adOk(el)).to.equal(true);
    expect(search(el).hasAttribute('aria-activedescendant')).to.equal(false);
    expect(lb.getAttribute('aria-busy')).to.equal('true');
    await wait(40);
    p.calls[0].resolve(A_RES);
    await micro();
    expect(adOk(el)).to.equal(true);
    expect(search(el).getAttribute('aria-activedescendant')).to.equal(rows(el)[0].id);
    keyOn(search(el), 'ArrowDown');
    expect(adOk(el)).to.equal(true);
    expect(search(el).getAttribute('aria-activedescendant')).to.equal(rows(el)[1].id);
    type(el, 'aok'); // results kept while B runs: the active descendant still points at a real row
    await wait(40);
    expect(adOk(el)).to.equal(true);
    p.calls[1].resolve(B_RES);
    await micro();
    expect(adOk(el)).to.equal(true);
    expect(search(el).getAttribute('aria-activedescendant')).to.equal(rows(el)[0].id);
  });
});

describe('v0.108.0 td-dropdown search — structure', () => {
  it('without search: the local filter is unchanged (regression)', async () => {
    const el = dd('', { options: [{ value: 'a', label: 'Apple' }, { value: 'b', label: 'Banana' }, { value: 'c', label: 'Cherry' }] });
    el.open();
    expect(status(el).textContent).to.equal('');
    type(el, 'an');
    expect(values(el)).to.deep.equal(['b']);
    expect(status(el).textContent).to.equal('1 kết quả');
    type(el, 'zz');
    expect(values(el)).to.deep.equal([]);
    expect(status(el).textContent).to.equal('Không tìm thấy kết quả');
    expect(menu(el).hasAttribute('data-load')).to.equal(false);
    el.close();
    expect(values(el)).to.deep.equal(['a', 'b', 'c']);
  });

  it('groups are ignored for results: flat rows in the server order (the base list stays grouped)', async () => {
    const p = providerOf();
    const groups = [{ key: 'g1', label: 'Nhóm 1' }, { key: 'g2', label: 'Nhóm 2' }];
    const el = dd('', {
      provider: p,
      groups,
      options: [{ value: 'r2', label: 'R2', group: 'g2' }, { value: 'r1', label: 'R1', group: 'g1' }],
    });
    el.open();
    expect(values(el)).to.deep.equal(['r1', 'r2']);
    expect(scroller(el).querySelectorAll('.td-dropdown__group').length).to.equal(2);
    type(el, 'x');
    await wait(40);
    p.calls[0].resolve([
      { value: 'a', label: 'A', group: 'g2' }, { value: 'b', label: 'B', group: 'g1' }, { value: 'c', label: 'C', group: 'g2' },
    ]);
    await micro();
    expect(values(el)).to.deep.equal(['a', 'b', 'c']);
    expect(scroller(el).querySelectorAll('.td-dropdown__group, .td-dropdown__group-label').length).to.equal(0);
    el.groups = groups; // re-assigning groups keeps the results flat
    expect(values(el)).to.deep.equal(['a', 'b', 'c']);
    el.options = [{ value: 'n', label: 'N' }]; // re-assigning options keeps the results on screen
    expect(values(el)).to.deep.equal(['a', 'b', 'c']);
  });

  it('search assigned after connect on searchable="false": the box appears (open menu kept, focus in it); removed → gone', async () => {
    const p = providerOf();
    const el = dd('searchable="false"', { options: RECENT });
    expect(!!search(el)).to.equal(false);
    trig(el).focus();
    el.open();
    el.search = p;
    expect(el._isOpen).to.equal(true);
    expect(!!search(el)).to.equal(true);
    expect(document.activeElement === search(el)).to.equal(true);
    expect(status(el).textContent).to.equal('Gõ ít nhất 1 ký tự để tìm');
    expect(listbox(el).getAttribute('aria-label')).to.equal('Sản phẩm'); // the listbox name is re-applied
    type(el, 'ao');
    await wait(40);
    expect(p.calls.length).to.equal(1);
    el.search = null;
    expect(p.calls[0].signal.aborted).to.equal(true);
    expect(el._isOpen).to.equal(true);
    expect(!!search(el)).to.equal(false);
    expect(document.activeElement === trig(el)).to.equal(true);
    expect(values(el)).to.deep.equal(['r1', 'r2']);
    expect(menu(el).hasAttribute('data-load')).to.equal(false);
    expect(status(el).textContent).to.equal('');
  });

  it('search removed on a searchable dropdown: the typed text filters locally again', async () => {
    const p = providerOf();
    const el = dd('', { provider: p, options: [{ value: 'a', label: 'Apple' }, { value: 'b', label: 'Banana' }] });
    el.open();
    type(el, 'ban');
    await wait(40);
    p.calls[0].resolve([{ value: 'z', label: 'Zed' }]);
    await micro();
    expect(values(el)).to.deep.equal(['z']);
    el.search = null;
    expect(values(el)).to.deep.equal(['b']);
    type(el, 'app');
    expect(values(el)).to.deep.equal(['a']);
    expect(p.calls.length).to.equal(1);
    el.search = 'not a function';
    expect(el.search).to.equal(null);
  });

  it('a pre-upgrade `search` property is replayed; destroy() cancels a running search', async () => {
    const p = providerOf();
    const el = document.createElement('td-dropdown');
    Object.defineProperty(el, 'search', { value: p, writable: true, configurable: true, enumerable: true });
    el.setAttribute('aria-label', 'X');
    el.setAttribute('searchable', 'false');
    el.setAttribute('search-delay', '0');
    host.appendChild(el);
    expect(el.search === p).to.equal(true);
    expect(!!search(el)).to.equal(true);
    el.open();
    type(el, 'q');
    await wait(20);
    expect(p.calls.length).to.equal(1);
    const m = menu(el);
    el.destroy();
    expect(p.calls[0].signal.aborted).to.equal(true);
    p.calls[0].resolve(A_RES);
    await micro();
    expect(m.isConnected).to.equal(false);
  });
});
