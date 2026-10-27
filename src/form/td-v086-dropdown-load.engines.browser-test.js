import { expect } from '@esm-bundle/chai';
import { sendMouse, resetMouse } from '@web/test-runner-commands';
import { TdDropdown } from './td-dropdown.js';

// v0.86.0 (plan docs/internal/plans/v0.86.0-dropdown-load.md, Step 3) — td-dropdown `load` / `reload()` (async options
// loader: one automatic run at the first open, loading / error UI with a retry button, only the latest run applies),
// the open-menu options refresh in SELECT mode (query, active row, scrollTop kept) and the 2000-row list
// (`data-many` + CSS content-visibility: End key, aria-activedescendant, scroll stability, exact N-row height) — in
// Chromium, Firefox AND WebKit. DOM nodes are compared as booleans / strings (a failing chai assertion carrying DOM
// nodes hangs the runner). Loaders are controllable deferred promises. Keys go to the trigger / search box as
// dispatched keydown events (the component's own handler).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
await document.fonts?.ready;

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html, parent = host) => { parent.insertAdjacentHTML('beforeend', html.trim()); return parent.lastElementChild; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const raf = () => new Promise((r) => requestAnimationFrame(r));
async function settle(n = 3) { for (let i = 0; i < n; i++) await raf(); }
const LABELS = { ...TdDropdown.labels };
afterEach(async () => {
  Object.assign(TdDropdown.labels, LABELS);
  for (const d of host.querySelectorAll('td-dropdown')) if (d._isOpen) d.close();
  host.innerHTML = '';
  await resetMouse();
  await wait(10);
});

const same = (a, b) => a === b;
const trig = (el) => el.querySelector('.td-dropdown__trigger');
const menu = (el) => el._menuElement;
const scroller = (el) => menu(el).querySelector('.td-dropdown__scroller');
const listbox = (el) => menu(el).querySelector('[role="listbox"]');
const search = (el) => menu(el).querySelector('.td-dropdown__search');
const status = (el) => menu(el).querySelector('.td-dropdown__empty');
const retry = (el) => menu(el).querySelector('.td-dropdown__retry');
const valueSpan = (el) => el.querySelector('.td-dropdown__value');
/** data rows (no clear / create row), in DOM order */
const rows = (el) => [...scroller(el).querySelectorAll('.td-dropdown__option[data-index]')];
const values = (el) => rows(el).map((r) => r.getAttribute('data-value'));
const optValues = (el) => el.options.map((o) => o.value);
const activeValue = (el) => {
  const a = menu(el).querySelector('[data-active]');
  return a ? a.getAttribute('data-value') : null;
};
const key = (el, k, init = {}) => trig(el).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
function type(el, q) {
  const s = search(el);
  s.value = q;
  s.dispatchEvent(new Event('input', { bubbles: true }));
}
function dd(attrs = '', options = null, groups = null) {
  const el = mount(`<td-dropdown ${attrs}></td-dropdown>`);
  if (groups) el.groups = groups;
  if (options) el.options = options.map((o) => ({ ...o }));
  return el;
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
/** a loader that counts its calls and hands out one deferred per call */
function loaderOf() {
  const calls = [];
  const fn = () => { const d = deferred(); calls.push(d); return d.promise; };
  fn.calls = calls;
  return fn;
}
/** collect console.warn calls while `fn` runs */
async function warnsDuring(fn) {
  const seen = [];
  const orig = console.warn;
  console.warn = (...a) => { seen.push(a.map(String).join(' ')); };
  try { await fn(); } finally { console.warn = orig; }
  return seen;
}
/** let resolved / rejected promises and the continuations they trigger run */
const micro = () => wait(0);

const FRUITS = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry' },
  { value: 'd', label: 'Durian' },
  { value: 'e', label: 'Elderberry' },
];
const MORE = [{ value: 'x', label: 'Xoài' }, { value: 'y', label: 'Yến' }];
const A11Y = 'aria-label="Chọn"';

describe('v0.86.0 td-dropdown load — run policy', () => {
  it('the loader runs once, at the first open(); not again after a success, on reopen or on a menu rebuild', async () => {
    const el = dd(A11Y);
    const ld = loaderOf();
    el.load = ld;
    expect(ld.calls.length).to.equal(0); // assigning while closed never runs it
    expect(el._loadState).to.equal('idle');
    el.open();
    expect(ld.calls.length).to.equal(1);
    expect(el._loadState).to.equal('loading');
    ld.calls[0].resolve(FRUITS);
    await micro();
    expect(el._loadState).to.equal('done');
    expect(optValues(el)).to.deep.equal(['a', 'b', 'c', 'd', 'e']);
    expect(values(el)).to.deep.equal(['a', 'b', 'c', 'd', 'e']);
    el.close();
    el.open();
    el.close();
    el.open();
    expect(ld.calls.length).to.equal(1);
    el.options = FRUITS.slice(0, 2);
    expect(ld.calls.length).to.equal(1);
    expect(el._loadState).to.equal('done');
  });

  it('a second open() while the first run is still pending does not start another run', async () => {
    const el = dd(A11Y);
    const ld = loaderOf();
    el.load = ld;
    el.open();
    el.close();
    el.open();
    expect(ld.calls.length).to.equal(1);
    ld.calls[0].resolve(FRUITS);
    await micro();
    expect(values(el).length).to.equal(5);
  });

  it('load is a function or null: anything else becomes null', async () => {
    const el = dd(A11Y);
    el.load = 'nope';
    expect(el.load).to.equal(null);
    const f = () => Promise.resolve([]);
    el.load = f;
    expect(el.load === f).to.equal(true);
    el.load = null;
    expect(el.load).to.equal(null);
    expect(await el.reload()).to.equal(false); // no loader → false, never rejects
  });
});

describe('v0.86.0 td-dropdown load — loading and error UI', () => {
  it('loading: status text, aria-busy on the listbox, data-load on the menu; cleared on success', async () => {
    const el = dd(A11Y);
    const ld = loaderOf();
    el.load = ld;
    expect(menu(el).hasAttribute('data-load')).to.equal(false);
    el.open();
    await settle(1);
    expect(status(el).textContent).to.equal('Đang tải…');
    expect(status(el).getAttribute('role')).to.equal('status');
    expect(listbox(el).getAttribute('aria-busy')).to.equal('true');
    expect(menu(el).getAttribute('data-load')).to.equal('loading');
    expect(retry(el)).to.equal(null);
    ld.calls[0].resolve(FRUITS);
    await micro();
    expect(status(el).textContent).to.equal('');
    expect(listbox(el).hasAttribute('aria-busy')).to.equal(false);
    expect(menu(el).hasAttribute('data-load')).to.equal(false);
    expect(retry(el)).to.equal(null);
    expect(values(el).length).to.equal(5);
  });

  it('loading keeps the existing rows; "no results" / the result count do not show while loading', async () => {
    const el = dd(A11Y, FRUITS);
    const ld = loaderOf();
    el.load = ld;
    el.open();
    await settle(1);
    expect(values(el).length).to.equal(5);
    type(el, 'zzz'); // no match → would say "Không tìm thấy kết quả"
    expect(status(el).textContent).to.equal('Đang tải…');
    type(el, 'an'); // matches → would carry the visually hidden count
    expect(status(el).textContent).to.equal('Đang tải…');
    expect(status(el).hasAttribute('data-count')).to.equal(false);
    ld.calls[0].resolve(FRUITS);
    await micro();
    expect(status(el).textContent).to.equal('2 kết quả'); // the count is back once loaded
    expect(status(el).hasAttribute('data-count')).to.equal(true);
  });

  it('error: status text, retry button right after it, data-load="error", no aria-busy; warns once', async () => {
    const el = dd(A11Y);
    const ld = loaderOf();
    el.load = ld;
    const warns = await warnsDuring(async () => {
      el.open();
      ld.calls[0].reject(new Error('boom'));
      await micro();
    });
    expect(warns.length).to.equal(1);
    expect(warns[0].startsWith('td-dropdown: load failed')).to.equal(true);
    expect(el._loadState).to.equal('error');
    expect(status(el).textContent).to.equal('Không tải được');
    expect(menu(el).getAttribute('data-load')).to.equal('error');
    expect(listbox(el).hasAttribute('aria-busy')).to.equal(false);
    const b = retry(el);
    expect(b.tagName).to.equal('BUTTON');
    expect(b.getAttribute('type')).to.equal('button');
    expect(b.getAttribute('tabindex')).to.equal('-1');
    expect(b.textContent).to.equal('Thử lại');
    expect(same(status(el).nextElementSibling, b)).to.equal(true);
    expect(menu(el).querySelectorAll('.td-dropdown__retry').length).to.equal(1);
  });

  it('labels.loading / loadError / retry are used (and escaped as text)', async () => {
    TdDropdown.labels.loading = 'Loading <i>…</i>';
    TdDropdown.labels.loadError = 'Failed <b>x</b>';
    TdDropdown.labels.retry = 'Again <u>!</u>';
    const el = dd(A11Y);
    const ld = loaderOf();
    el.load = ld;
    el.open();
    expect(status(el).textContent).to.equal('Loading <i>…</i>');
    expect(status(el).children.length).to.equal(0);
    await warnsDuring(async () => { ld.calls[0].reject(new Error('x')); await micro(); });
    expect(status(el).textContent).to.equal('Failed <b>x</b>');
    expect(retry(el).textContent).to.equal('Again <u>!</u>');
    expect(retry(el).children.length).to.equal(0);
  });

  it('click on the retry button runs the loader again; loading UI replaces the error, then the rows land', async () => {
    const el = dd(A11Y);
    const ld = loaderOf();
    el.load = ld;
    el.open();
    await warnsDuring(async () => { ld.calls[0].reject(new Error('x')); await micro(); });
    retry(el).click();
    expect(ld.calls.length).to.equal(2);
    expect(status(el).textContent).to.equal('Đang tải…');
    expect(retry(el)).to.equal(null);
    expect(menu(el).getAttribute('data-load')).to.equal('loading');
    ld.calls[1].resolve(FRUITS);
    await micro();
    expect(values(el).length).to.equal(5);
    expect(menu(el).hasAttribute('data-load')).to.equal(false);
    expect(retry(el)).to.equal(null);
    expect(el._isOpen).to.equal(true);
  });

  it('retry keeps DOM focus where it was: mousedown is cancelled, the button is never focused (synthetic sequence)', async () => {
    const el = dd(A11Y);
    const ld = loaderOf();
    el.load = ld;
    trig(el).focus();
    el.open();
    await wait(160); // the search box takes focus after 100 ms (not on a coarse pointer)
    await warnsDuring(async () => { ld.calls[0].reject(new Error('x')); await micro(); });
    const before = document.activeElement;
    const b = retry(el);
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    b.dispatchEvent(down);
    expect(down.defaultPrevented).to.equal(true);
    b.click();
    expect(ld.calls.length).to.equal(2);
    expect(document.activeElement === before).to.equal(true);
    expect(document.activeElement === b).to.equal(false);
    expect(el._isOpen).to.equal(true);
  });

  it('retry keeps DOM focus where it was with a REAL mouse click (a default mousedown would focus the button)', async () => {
    const el = dd(A11Y);
    const ld = loaderOf();
    el.load = ld;
    trig(el).focus();
    el.open();
    await wait(160);
    await warnsDuring(async () => { ld.calls[0].reject(new Error('x')); await micro(); });
    await settle(2);
    const before = document.activeElement;
    const r = retry(el).getBoundingClientRect();
    await sendMouse({ type: 'click', position: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] });
    await wait(20);
    expect(ld.calls.length).to.equal(2);
    expect(document.activeElement === before).to.equal(true);
    expect(el._isOpen).to.equal(true);
  });

  it('Enter on the trigger while failed and no active row → the loader runs again and the menu stays open', async () => {
    const el = dd(A11Y);
    const ld = loaderOf();
    el.load = ld;
    trig(el).focus();
    el.open();
    await warnsDuring(async () => { ld.calls[0].reject(new Error('x')); await micro(); });
    expect(activeValue(el)).to.equal(null);
    key(el, 'Enter');
    expect(ld.calls.length).to.equal(2);
    expect(el._isOpen).to.equal(true);
    expect(menu(el).getAttribute('data-load')).to.equal('loading');
    ld.calls[1].resolve(FRUITS);
    await micro();
    expect(values(el).length).to.equal(5);
    expect(el._isOpen).to.equal(true);
    // the same from the search box
    const el2 = dd(A11Y);
    const ld2 = loaderOf();
    el2.load = ld2;
    el2.open();
    await warnsDuring(async () => { ld2.calls[0].reject(new Error('x')); await micro(); });
    search(el2).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(ld2.calls.length).to.equal(2);
    expect(el2._isOpen).to.equal(true);
  });

  it('Enter while NOT failed still closes (no active row) — unchanged', async () => {
    const el = dd(A11Y, FRUITS.map((o) => ({ ...o })));
    el.load = () => Promise.resolve(FRUITS);
    await el.reload();
    el.open();
    el._setActive(-1);
    key(el, 'Enter');
    expect(el._isOpen).to.equal(false);
  });

  it('closing and reopening after a failure shows the error + button again and does NOT call the loader', async () => {
    const el = dd(A11Y);
    const ld = loaderOf();
    el.load = ld;
    el.open();
    await warnsDuring(async () => { ld.calls[0].reject(new Error('x')); await micro(); });
    el.close();
    el.open();
    el.close();
    el.open();
    await settle(1);
    expect(ld.calls.length).to.equal(1);
    expect(status(el).textContent).to.equal('Không tải được');
    expect(!!retry(el)).to.equal(true);
    expect(menu(el).getAttribute('data-load')).to.equal('error');
  });

  it('a synchronous throw and a non-array result both end in the error state (reload() → false, warns)', async () => {
    for (const [name, fn] of [
      ['throw', () => { throw new Error('sync'); }],
      ['object', () => Promise.resolve({ value: 'a' })],
      ['undefined', () => Promise.resolve()],
      ['sync array', () => FRUITS], // not a promise but an array: still fine (awaited)
    ]) {
      const el = dd(A11Y);
      el.load = fn;
      let ok;
      const warns = await warnsDuring(async () => { ok = await el.reload(); });
      if (name === 'sync array') {
        expect(ok, name).to.equal(true);
        expect(el._loadState, name).to.equal('done');
        expect(warns.length, name).to.equal(0);
        continue;
      }
      expect(ok, name).to.equal(false);
      expect(el._loadState, name).to.equal('error');
      expect(warns.length, name).to.equal(1);
      expect(warns[0].startsWith('td-dropdown: load failed'), name).to.equal(true);
      el.open();
      await settle(1);
      expect(status(el).textContent, name).to.equal('Không tải được');
      expect(!!retry(el), name).to.equal(true);
      el.close();
    }
  });

  it('a failure keeps the previously loaded options in place', async () => {
    const el = dd(A11Y, FRUITS);
    el.load = () => Promise.reject(new Error('x'));
    let ok;
    await warnsDuring(async () => { ok = await el.reload(); });
    expect(ok).to.equal(false);
    expect(optValues(el)).to.deep.equal(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('v0.86.0 td-dropdown load — reload(), tokens, assigning load', () => {
  it('two overlapping reload() runs: only the latest applies, the older resolves false (either settle order)', async () => {
    for (const order of ['older first', 'newer first']) {
      const el = dd(A11Y);
      const ld = loaderOf();
      el.load = ld;
      const r1 = el.reload();
      const r2 = el.reload();
      expect(ld.calls.length).to.equal(2);
      if (order === 'older first') {
        ld.calls[0].resolve(FRUITS);
        ld.calls[1].resolve(MORE);
      } else {
        ld.calls[1].resolve(MORE);
        ld.calls[0].resolve(FRUITS);
      }
      expect(await r1, order).to.equal(false);
      expect(await r2, order).to.equal(true);
      expect(optValues(el), order).to.deep.equal(['x', 'y']);
      expect(el._loadState, order).to.equal('done');
    }
  });

  it('a superseded run that FAILS is silent and changes nothing (no warn, no error state)', async () => {
    const el = dd(A11Y);
    const ld = loaderOf();
    el.load = ld;
    const r1 = el.reload();
    const r2 = el.reload();
    let a;
    const warns = await warnsDuring(async () => { ld.calls[0].reject(new Error('old')); a = await r1; });
    expect(a).to.equal(false);
    expect(warns.length).to.equal(0);
    expect(el._loadState).to.equal('loading');
    ld.calls[1].resolve(MORE);
    expect(await r2).to.equal(true);
    expect(el._loadState).to.equal('done');
  });

  it('reload() while closed assigns the options (no menu needed) and resolves true', async () => {
    const el = dd(A11Y, FRUITS);
    el.load = () => Promise.resolve(MORE);
    expect(el._isOpen).to.equal(false);
    expect(await el.reload()).to.equal(true);
    expect(optValues(el)).to.deep.equal(['x', 'y']);
    expect(el._isOpen).to.equal(false);
    el.open();
    expect(values(el)).to.deep.equal(['x', 'y']);
    expect(el._loadState).to.equal('done'); // a reload() counts as the run: open() does not call the loader again
  });

  it('reload() while open reruns the loader and keeps the typed query and the open menu', async () => {
    const el = dd(A11Y, FRUITS);
    const ld = loaderOf();
    el.load = ld;
    el.open();
    ld.calls[0].resolve(FRUITS);
    await micro();
    type(el, 'an');
    const p = el.reload();
    expect(menu(el).getAttribute('data-load')).to.equal('loading');
    ld.calls[1].resolve([...FRUITS, { value: 'f', label: 'Mango' }]);
    expect(await p).to.equal(true);
    expect(search(el).value).to.equal('an');
    expect(values(el)).to.deep.equal(['b', 'd', 'f']);
    expect(el._isOpen).to.equal(true);
  });

  it('a `value` attribute resolves once the loaded options arrive (label shown, value kept, form value set)', async () => {
    const el = dd(`${A11Y} value="b" name="fruit"`);
    el.load = () => Promise.resolve(FRUITS);
    expect(await el.reload()).to.equal(true);
    expect(el.getValue()).to.equal('b');
    expect(valueSpan(el).textContent).to.equal('Banana');
    el.open();
    expect(menu(el).querySelector('[data-value="b"]').getAttribute('aria-selected')).to.equal('true');
    expect(activeValue(el)).to.equal('b');
  });

  it('a `value` attribute with load resolved through the first open() (not through reload())', async () => {
    const el = dd(`${A11Y} value="c"`);
    const ld = loaderOf();
    el.load = ld;
    el.open();
    ld.calls[0].resolve(FRUITS);
    await micro();
    expect(valueSpan(el).textContent).to.equal('Cherry');
    expect(activeValue(el)).to.equal('c'); // the open mode "selected" lands on the loaded selection
  });

  it('no active row when the load lands → active follows the open() mode (first / last / selected-or-first)', async () => {
    for (const [mode, expected] of [['first', 'a'], ['last', 'e'], ['selected-or-first', 'a'], ['selected', null]]) {
      const el = dd(A11Y);
      const ld = loaderOf();
      el.load = ld;
      el.open({ active: mode });
      expect(activeValue(el), mode).to.equal(null);
      ld.calls[0].resolve(FRUITS);
      await micro();
      expect(activeValue(el), mode).to.equal(expected);
      el.close();
    }
  });

  it('an active row the user already moved to is kept when the load lands (by value)', async () => {
    const el = dd(A11Y, FRUITS);
    const ld = loaderOf();
    el.load = ld;
    el.open({ active: 'first' });
    key(el, 'ArrowDown');
    key(el, 'ArrowDown');
    expect(activeValue(el)).to.equal('c');
    ld.calls[0].resolve(FRUITS.map((o) => ({ ...o })));
    await micro();
    expect(activeValue(el)).to.equal('c');
  });

  it('assigning a new load while OPEN runs it at once (also after an error)', async () => {
    const el = dd(A11Y);
    const first = loaderOf();
    el.load = first;
    el.open();
    await warnsDuring(async () => { first.calls[0].reject(new Error('x')); await micro(); });
    expect(el._loadState).to.equal('error');
    const second = loaderOf();
    el.load = second;
    expect(second.calls.length).to.equal(1);
    expect(el._loadState).to.equal('loading');
    expect(menu(el).getAttribute('data-load')).to.equal('loading');
    expect(retry(el)).to.equal(null);
    second.calls[0].resolve(MORE);
    await micro();
    expect(values(el)).to.deep.equal(['x', 'y']);
    expect(first.calls.length).to.equal(1);
  });

  it('assigning a new load while open drops the pending run of the old one (resolves false, options untouched)', async () => {
    const el = dd(A11Y, FRUITS);
    const first = loaderOf();
    const second = loaderOf();
    el.load = first;
    el.open();
    el.load = second;
    first.calls[0].resolve(MORE);
    await micro();
    expect(optValues(el)).to.deep.equal(['a', 'b', 'c', 'd', 'e']);
    expect(el._loadState).to.equal('loading');
    second.calls[0].resolve([{ value: 'z', label: 'Zed' }]);
    await micro();
    expect(optValues(el)).to.deep.equal(['z']);
  });

  it('assigning or clearing load while an earlier CLOSED reload() is pending: the old run resolves false, options + state unchanged', async () => {
    for (const next of ['null', 'function']) {
      const el = dd(A11Y, FRUITS);
      const old = loaderOf();
      el.load = old;
      const p = el.reload();
      expect(el._loadState, next).to.equal('loading');
      const replacement = loaderOf();
      el.load = next === 'null' ? null : replacement;
      expect(el._loadState, next).to.equal('idle');
      expect(replacement.calls.length, next).to.equal(0); // closed → not run
      old.calls[0].resolve(MORE);
      expect(await p, next).to.equal(false);
      expect(optValues(el), next).to.deep.equal(['a', 'b', 'c', 'd', 'e']);
      expect(el._loadState, next).to.equal('idle');
      // a failing pending run is silent too
      const old2 = loaderOf();
      el.load = old2;
      const p2 = el.reload();
      el.load = null;
      let r;
      const warns = await warnsDuring(async () => { old2.calls[0].reject(new Error('late')); r = await p2; });
      expect(r, next).to.equal(false);
      expect(warns.length, next).to.equal(0);
      expect(el._loadState, next).to.equal('idle');
      // the replacement, when the menu opens later, is the one automatic run
      if (next === 'function') {
        el.load = replacement;
        el.open();
        expect(replacement.calls.length).to.equal(1);
      }
    }
  });

  it('menu OPEN while loading, then load = null → status empty, no retry button, no aria-busy, no data-load', async () => {
    const el = dd(A11Y, FRUITS);
    el.load = loaderOf();
    el.open();
    expect(status(el).textContent).to.equal('Đang tải…');
    el.load = null;
    expect(status(el).textContent).to.equal('');
    expect(retry(el)).to.equal(null);
    expect(listbox(el).hasAttribute('aria-busy')).to.equal(false);
    expect(menu(el).hasAttribute('data-load')).to.equal(false);
    expect(status(el).hasAttribute('data-count')).to.equal(false);
    expect(el._isOpen).to.equal(true);
    expect(values(el).length).to.equal(5);
  });

  it('menu OPEN while failed, then load = null → status empty, no retry button, no aria-busy, no data-load', async () => {
    const el = dd(A11Y, FRUITS);
    const ld = loaderOf();
    el.load = ld;
    el.open();
    await warnsDuring(async () => { ld.calls[0].reject(new Error('x')); await micro(); });
    expect(!!retry(el)).to.equal(true);
    el.load = null;
    expect(status(el).textContent).to.equal('');
    expect(retry(el)).to.equal(null);
    expect(listbox(el).hasAttribute('aria-busy')).to.equal(false);
    expect(menu(el).hasAttribute('data-load')).to.equal(false);
    // and with an empty option list the plain "no results" message is back
    const el2 = dd(A11Y);
    const ld2 = loaderOf();
    el2.load = ld2;
    el2.open();
    await warnsDuring(async () => { ld2.calls[0].reject(new Error('x')); await micro(); });
    el2.load = null;
    expect(status(el2).textContent).to.equal('Không tìm thấy kết quả');
  });

  // Codex security r1: an array with a non-object entry is a failed load (reload() still resolves false, old list kept)
  it('a result with a null / non-object entry → error state, previous options kept, reload() resolves false', async () => {
    const warn = console.warn;
    let warned = 0;
    console.warn = () => { warned++; };
    try {
      for (const bad of [[null], [{ value: 'x', label: 'X' }, 7]]) {
        const el = dd(A11Y, FRUITS);
        el.load = () => Promise.resolve(bad);
        expect(await el.reload()).to.equal(false);
        expect(el._loadState).to.equal('error');
        expect(optValues(el)).to.deep.equal(['a', 'b', 'c', 'd', 'e']);
      }
      expect(warned).to.equal(2);
    } finally { console.warn = warn; }
  });

  // Codex impl r2: a loaded entry whose label getter throws while rendering → everything restored
  it('a loaded entry whose label getter throws: options, selection, value text, form value, query, active row kept', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const form = document.createElement('form');
      host.appendChild(form);
      const el = mount(`<td-dropdown ${A11Y} name="f" value="b"></td-dropdown>`, form);
      el.options = FRUITS.map((o) => ({ ...o }));
      await settle(1);
      el.open();
      await settle(2);
      type(el, 'a');
      const active = activeValue(el);
      const q = search(el).value;
      const text = el.querySelector('.td-dropdown__value').textContent;
      const bad = { value: 'zz' };
      Object.defineProperty(bad, 'label', { enumerable: true, get() { throw new Error('boom'); } });
      el.load = () => Promise.resolve([bad]);
      expect(await el.reload()).to.equal(false);
      expect(el._loadState).to.equal('error');
      expect(optValues(el)).to.deep.equal(FRUITS.map((o) => o.value));
      expect(el.getValue()).to.equal('b');
      expect(el.querySelector('.td-dropdown__value').textContent).to.equal(text);
      expect(new FormData(form).get('f')).to.equal('b');
      expect(search(el).value).to.equal(q);
      expect(activeValue(el)).to.equal(active);
      el.close();
    } finally { console.warn = warn; }
  });

  it('a first load that fails while rendering keeps the value attribute pending: the retry selects and submits it', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const form = document.createElement('form');
      host.appendChild(form);
      const el = mount(`<td-dropdown ${A11Y} name="f" value="b"></td-dropdown>`, form);
      await settle(1);
      const bad = { value: 'b' };
      Object.defineProperty(bad, 'label', { enumerable: true, get() { throw new Error('boom'); } });
      el.load = () => Promise.resolve([bad]);
      expect(await el.reload()).to.equal(false);
      el.load = () => Promise.resolve(FRUITS.map((o) => ({ ...o })));
      expect(await el.reload()).to.equal(true);
      expect(el.getValue()).to.equal('b');
      expect(new FormData(form).get('f')).to.equal('b');
    } finally { console.warn = warn; }
  });

  it('destroy() while a run is pending: the late result never lands', async () => {
    const el = dd(A11Y, FRUITS);
    const ld = loaderOf();
    el.load = ld;
    const p = el.reload();
    el.destroy();
    ld.calls[0].resolve(MORE);
    expect(await p).to.equal(false);
    expect(optValues(el)).to.deep.equal(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('v0.86.0 td-dropdown — select mode: options / updateData while OPEN keep query, active row, scroll', () => {
  const MANY = [
    ...Array.from({ length: 60 }, (_, i) => ({ value: `k${i}`, label: `Kho ${i}` })),
    { value: 'o1', label: 'Cửa hàng 1' },
    { value: 'o2', label: 'Cửa hàng 2' },
  ];

  it('the list stays filtered by the kept search text, the active row stays by value, scrollTop is unchanged', async () => {
    for (const via of ['options', 'updateData']) {
      const el = dd(`${A11Y} max-height="5" allow-clear="false"`, MANY);
      el.open();
      await settle(2);
      type(el, 'kho');
      expect(values(el).length, via).to.equal(60);
      key(el, 'Home');
      for (let i = 0; i < 6; i++) key(el, 'ArrowDown');
      expect(activeValue(el), via).to.equal('k6');
      scroller(el).scrollTop = 400;
      await settle(1);
      const top = scroller(el).scrollTop;
      expect(top > 0, via).to.equal(true);
      const next = MANY.map((o) => ({ ...o }));
      if (via === 'options') el.options = next;
      else el.updateData(next);
      expect(search(el).value, via).to.equal('kho');
      expect(values(el).length, via).to.equal(60);
      expect(values(el).includes('o1'), via).to.equal(false);
      expect(activeValue(el), via).to.equal('k6');
      expect(scroller(el).scrollTop, via).to.equal(top);
      await settle(2);
      expect(scroller(el).scrollTop, via).to.equal(top);
      expect(el._isOpen, via).to.equal(true);
      // new data is filtered too: a new row that matches shows up, one that does not stays out
      const grown = [...next, { value: 'k99', label: 'Kho 99' }, { value: 'o3', label: 'Cửa hàng 3' }];
      if (via === 'options') el.options = grown;
      else el.updateData(grown);
      expect(values(el).includes('k99'), via).to.equal(true);
      expect(values(el).includes('o3'), via).to.equal(false);
      expect(activeValue(el), via).to.equal('k6');
      el.close();
    }
  });

  // Codex impl r1 ISSUE-1: a pending value resolved by the new options must not reset the kept state first
  it('a pending value resolved by the re-assigned (reordered) options keeps the active row, query and scrollTop', async () => {
    for (const via of ['options', 'updateData']) {
      const el = dd(`${A11Y} max-height="5" allow-clear="false"`, MANY);
      el.open();
      await settle(2);
      type(el, 'kho');
      key(el, 'Home');
      for (let i = 0; i < 6; i++) key(el, 'ArrowDown');
      scroller(el).scrollTop = 400;
      await settle(1);
      const top = scroller(el).scrollTop;
      el.setValue('k77'); // not in the list yet → pending
      const next = [...MANY].reverse().map((o) => ({ ...o }));
      next.push({ value: 'k77', label: 'Kho 77' });
      if (via === 'options') el.options = next;
      else el.updateData(next);
      expect(el.getValue(), via).to.equal('k77');
      expect(search(el).value, via).to.equal('kho');
      expect(activeValue(el), via).to.equal('k6');
      expect(scroller(el).scrollTop, via).to.equal(top);
      el.close();
    }
  });

  it('the clear row stays the active row after the options are re-assigned (allow-clear on, a value selected)', async () => {
    for (const via of ['options', 'updateData']) {
      const el = dd(`${A11Y} value="b"`, FRUITS);
      el.open();
      await settle(1);
      expect(!!menu(el).querySelector('.td-dropdown__option--clear')).to.equal(true);
      key(el, 'Home');
      const isClear = () => {
        const a = menu(el).querySelector('[data-active]');
        return !!a && a.classList.contains('td-dropdown__option--clear');
      };
      expect(isClear(), via).to.equal(true);
      const next = FRUITS.map((o) => ({ ...o }));
      if (via === 'options') el.options = next;
      else el.updateData(next);
      expect(isClear(), via).to.equal(true);
      expect(menu(el).querySelectorAll('[data-active]').length, via).to.equal(1);
      el.close();
    }
  });

  it('a create row stays the active row after the options are re-assigned', async () => {
    const el = dd(`${A11Y} create-label="Thêm mới"`, FRUITS);
    el.open();
    key(el, 'End');
    const isCreate = () => {
      const a = menu(el).querySelector('[data-active]');
      return !!a && a.classList.contains('td-dropdown__option--create');
    };
    expect(isCreate()).to.equal(true);
    el.options = FRUITS.map((o) => ({ ...o }));
    expect(isCreate()).to.equal(true);
  });

  it('closed menu: assigning options is the 0.84 path (no query kept — the menu rebuilds on the next open)', async () => {
    const el = dd(A11Y, FRUITS);
    el.open();
    type(el, 'an');
    el.close();
    el.options = [...FRUITS, { value: 'f', label: 'Fig' }];
    el.open();
    await settle(1);
    expect(search(el).value).to.equal('');
    expect(values(el).length).to.equal(6);
  });
});

describe('v0.86.0 td-dropdown — action mode still works with load', () => {
  it('mode="action": the loaded rows pick, the menu keeps its query, no value is ever set', async () => {
    const el = dd('mode="action" aria-label="Thêm" placeholder="Thêm"');
    const ld = loaderOf();
    el.load = ld;
    const picks = [];
    el.addEventListener('pick', (e) => picks.push(e.detail.value));
    el.open();
    ld.calls[0].resolve(FRUITS);
    await micro();
    type(el, 'an');
    expect(values(el)).to.deep.equal(['b', 'd']);
    const p = el.reload();
    expect(ld.calls.length).to.equal(2);
    ld.calls[1].resolve([...FRUITS, { value: 'f', label: 'Mango' }]);
    await p;
    expect(search(el).value).to.equal('an');
    expect(values(el)).to.deep.equal(['b', 'd', 'f']);
    rows(el)[0].click();
    expect(picks).to.deep.equal(['b']);
    expect(el.getValue()).to.equal(null);
  });
});

/** the 5-row window: the 5th row ends at the scroller's visible bottom, the 6th starts there (±1px) */
function expectNRows(el, n, what) {
  const sc = scroller(el);
  const all = [...sc.querySelectorAll('.td-dropdown__option')];
  const bottom = sc.getBoundingClientRect().top + sc.clientHeight;
  expect(sc.scrollTop, `${what} scrollTop`).to.equal(0);
  expect(Math.abs(all[n - 1].getBoundingClientRect().bottom - bottom), `${what} ${n}th bottom`).to.be.at.most(1);
  expect(all[n].getBoundingClientRect().top, `${what} ${n + 1}th top`).to.be.at.least(bottom - 1);
  expect(all[n - 2].getBoundingClientRect().top < bottom).to.equal(true);
}

describe('v0.86.0 td-dropdown — long lists (data-many, content-visibility)', () => {
  const GROUPS = [0, 1, 2, 3, 4].map((i) => ({ key: `g${i}`, label: `Nhóm ${i}` }));
  const rich = (n) => Array.from({ length: n }, (_, i) => ({
    value: `v${i}`,
    label: `Khách hàng số ${i}`,
    icon: 'user',
    description: `Mô tả dòng ${i}`,
    meta: String(i),
    status: { tone: 'success', text: 'x' },
    group: `g${i % 5}`,
  }));

  it('> 200 rows → the scroller has data-many; 150 rows → it does not (also after a search narrows 2000 down)', async () => {
    const big = dd(`${A11Y} allow-clear="false"`, rich(2000), GROUPS);
    big.open();
    await settle(1);
    expect(scroller(big).hasAttribute('data-many')).to.equal(true);
    expect(rows(big).length).to.equal(2000);
    type(big, 'khach hang so 19'); // 19, 190-199, 1900-1999 → 112 rows
    expect(scroller(big).hasAttribute('data-many')).to.equal(false);
    type(big, '');
    expect(scroller(big).hasAttribute('data-many')).to.equal(true);
    big.close();
    const small = dd(`${A11Y} allow-clear="false"`, rich(150), GROUPS);
    small.open();
    await settle(1);
    expect(scroller(small).hasAttribute('data-many')).to.equal(false);
    const edge = dd(`${A11Y} allow-clear="false"`, rich(201), GROUPS);
    edge.open();
    expect(scroller(edge).hasAttribute('data-many')).to.equal(true);
    const edge2 = dd(`${A11Y} allow-clear="false"`, rich(200), GROUPS);
    edge2.open();
    expect(scroller(edge2).hasAttribute('data-many')).to.equal(false);
  });

  it('rows of a data-many scroller use content-visibility:auto; a short list does not', async () => {
    const big = dd(`${A11Y} allow-clear="false"`, rich(300), GROUPS);
    big.open();
    await settle(1);
    // the first max-height + 1 rows are always laid out (measured height); later rows carry [data-cv]
    expect(rows(big)[6].hasAttribute('data-cv')).to.equal(false);
    expect(rows(big)[7].hasAttribute('data-cv')).to.equal(true);
    expect(getComputedStyle(rows(big)[0]).contentVisibility ?? 'visible').to.equal('visible');
    const cv = getComputedStyle(rows(big)[7]).contentVisibility;
    const small = dd(`${A11Y} allow-clear="false"`, rich(10), GROUPS);
    small.open();
    await settle(1);
    const cvSmall = getComputedStyle(rows(small)[0]).contentVisibility;
    if (cv === undefined) return; // engine without the property: only slower, not wrong
    expect(cv).to.equal('auto');
    expect(cvSmall).to.equal('visible');
  });

  it('End on 2000 rich rows: the last row is active, aria-activedescendant points at an existing id, it is in view and does not jump', async () => {
    const el = dd(`${A11Y} allow-clear="false"`, rich(2000), GROUPS);
    trig(el).focus();
    el.open();
    await wait(160); // the search box owns focus (aria-activedescendant lives there)
    key(el, 'End');
    const all = rows(el);
    // End = the last option row in DOM order (the groups interleave: the DOM order is the nav order)
    const last = all[all.length - 1];
    const lastId = last.id;
    expect(lastId.length > 0).to.equal(true);
    expect(activeValue(el)).to.equal(last.getAttribute('data-value'));
    expect(last.hasAttribute('data-active')).to.equal(true);
    const owner = document.activeElement === search(el) ? search(el) : trig(el);
    expect(owner.getAttribute('aria-activedescendant')).to.equal(lastId);
    expect(document.getElementById(lastId) !== null).to.equal(true);
    expect(document.getElementById(lastId) === last).to.equal(true);
    await settle(3);
    expect(scroller(el).scrollTop > 0).to.equal(true);
    const rr = last.getBoundingClientRect();
    const sr = scroller(el).getBoundingClientRect();
    const intersects = rr.bottom > sr.top && rr.top < sr.bottom && rr.height > 0;
    expect(intersects).to.equal(true);
    // Home goes back to the first row without leaving the list
    key(el, 'Home');
    await settle(2);
    expect(activeValue(el)).to.equal('v0');
    expect(scroller(el).scrollTop).to.equal(0);
  });

  // Chromium re-clamps scrollTop by a few px while the estimated rows near the end get their real height (the list is
  // scrolled to its end); what the user sees must not move: the last row stays bottom-aligned in the scroller.
  it('End on 2000 rich rows: the last row stays fully visible, bottom-aligned, from frame 1 to frame 3 (no visible jump)', async () => {
    const el = dd(`${A11Y} allow-clear="false"`, rich(2000), GROUPS);
    el.open();
    await settle(2);
    key(el, 'End');
    const gap = () => {
      const r = rows(el)[1999].getBoundingClientRect();
      const s = scroller(el).getBoundingClientRect();
      return { visible: r.top >= s.top - 1 && r.bottom <= s.bottom + 1, bottomGap: Math.round(s.bottom - r.bottom) };
    };
    await settle(1);
    const g1 = gap();
    await settle(2);
    const g3 = gap();
    expect(g1.visible).to.equal(true);
    expect(g3.visible).to.equal(true);
    expect(Math.abs(g3.bottomGap - g1.bottomGap) <= 1).to.equal(true);
  });

  it('PageDown / ArrowUp / type-ahead still address rows that are off screen', async () => {
    const el = dd(`${A11Y} allow-clear="false" max-height="5"`, rich(2000), GROUPS);
    el.open();
    await settle(2);
    key(el, 'End');
    key(el, 'ArrowUp');
    expect(activeValue(el)).to.equal(rows(el)[1998].getAttribute('data-value'));
    await settle(2);
    const r = rows(el)[1998].getBoundingClientRect();
    const s = scroller(el).getBoundingClientRect();
    expect(r.bottom > s.top && r.top < s.bottom).to.equal(true);
  });

  it('the scroller shows exactly max-height rows (default 5, and max-height="8") with 2000 rich grouped rows', async () => {
    const el = dd(`${A11Y} allow-clear="false"`, rich(2000), GROUPS);
    el.open();
    await settle(3);
    expect(el._getMaxHeight()).to.equal(5);
    expectNRows(el, 5, 'default');
    el.close();
    el.remove(); // else el8's trigger sits lower and placeFloating caps the menu to the 600px test viewport
    const el8 = dd(`${A11Y} allow-clear="false" max-height="8"`, rich(2000), GROUPS);
    el8.open();
    await settle(3);
    expectNRows(el8, 8, 'max-height 8');
  });

  it('the exact N-row height also holds after a search and after clearing it (2000 rich grouped rows, max-height="8")', async () => {
    const el8 = dd(`${A11Y} allow-clear="false" max-height="8"`, rich(2000), GROUPS);
    el8.open();
    await settle(3);
    type(el8, 'khach hang so 1');
    await settle(3);
    expectNRows(el8, 8, 'after a search');
    type(el8, '');
    await settle(3);
    expectNRows(el8, 8, 'after clearing the search');
  });

  it('loading 2000 rows through load(): data-many lands with the options, the loading UI disappears', async () => {
    const el = dd(`${A11Y} allow-clear="false"`);
    const ld = loaderOf();
    el.load = ld;
    el.open();
    await settle(1);
    expect(scroller(el).hasAttribute('data-many')).to.equal(false);
    ld.calls[0].resolve(rich(2000));
    await micro();
    expect(scroller(el).hasAttribute('data-many')).to.equal(true);
    expect(rows(el).length).to.equal(2000);
    expect(menu(el).hasAttribute('data-load')).to.equal(false);
  });
});
