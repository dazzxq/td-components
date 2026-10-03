import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
// NO static import of the component: <td-tree> is defined LATE (dynamic import below), after the pre-define property
// assignment scenario.

// v0.29.0 (plan docs/internal/plans/v0.29.0-tree.md M2–M6) — <td-tree> in Chromium, Firefox AND WebKit (group
// `engines`): ARIA tree structure, roving tabindex, APG keyboard (+ RTL), selection none / single / multiple / cascade,
// locked nodes, lazy children (latest-request-wins), filtering, events, form participation, XSS, size smoke.
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
document.addEventListener('submit', (e) => e.preventDefault(), true);

const CATS = () => [
  { value: 'phone', label: 'Điện thoại', children: [
    { value: 'apple', label: 'Apple', children: [{ value: 'ip15', label: 'iPhone 15' }, { value: 'ip16', label: 'iPhone 16' }] },
    { value: 'samsung', label: 'Samsung', children: [{ value: 's24', label: 'Galaxy S24' }] },
  ] },
  { value: 'laptop', label: 'Laptop', description: 'Máy tính xách tay', children: [{ value: 'dell', label: 'Dell' }] },
  { value: 'acc', label: 'Phụ kiện' },
];

// ---------------------------------------------------------------- before define --------------------------------------
const early = document.createElement('td-tree');
early.setAttribute('selection', 'multiple');
early.setAttribute('name', 'early[]');
early.setAttribute('value', '["acc"]');
early.data = CATS();
early.loadChildren = async () => [];
early.value = ['dell'];
const earlyForm = document.createElement('form');
earlyForm.appendChild(early);
document.body.appendChild(earlyForm);

const { TdTree } = await import('./td-tree.js');

// ---------------------------------------------------------------- helpers -------------------------------------------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = () => new Promise((r) => setTimeout(r, 0));
const extra = [];
afterEach(() => { extra.splice(0).forEach((f) => f()); });

function mount(html) {
  const wrap = document.createElement('form');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  return wrap;
}
function tree(attrs = '', data = CATS()) {
  const form = mount(`<td-tree aria-label="Danh mục" ${attrs}></td-tree>`);
  const el = form.querySelector('td-tree');
  if (data) el.data = data;
  return el;
}
const list = (el) => el.querySelector('[role="tree"]');
const items = (el) => [...el.querySelectorAll('[role="treeitem"]')];
const labelOf = (li) => li.querySelector(':scope > .td-tree__row > .td-tree__label').textContent;
const shownLabels = (el) => items(el).map(labelOf);
const item = (el, text) => items(el).find((li) => labelOf(li) === text) || null;
const active = (el) => el.querySelector('[role="treeitem"][tabindex="0"]');
const activeLabel = (el) => (active(el) ? labelOf(active(el)) : null);
const key = (el, k, o = {}) => {
  const target = el.querySelector('[role="treeitem"][tabindex="0"]') || list(el);
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o });
  target.dispatchEvent(e);
  return e;
};
function spy(el, name) {
  const out = [];
  el.addEventListener(name, (e) => { if (e instanceof CustomEvent) out.push(e.detail); });
  return out;
}
const entries = (form) => [...new FormData(form)];
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const toggleOf = (li) => li.querySelector(':scope > .td-tree__row > .td-tree__toggle');
const rowOf = (li) => li.querySelector(':scope > .td-tree__row > .td-tree__label');

// ---------------------------------------------------------------- ARIA -----------------------------------------------
describe('td-tree — ARIA structure (M2)', () => {
  it('tree > treeitem (+ group > treeitem); level / setsize / posinset explicit; aria-labelledby the label span only', () => {
    const el = tree();
    el.expand('phone');
    const ul = list(el);
    expect(ul.localName).to.equal('ul');
    expect(ul.getAttribute('aria-label')).to.equal('Danh mục');
    expect(shownLabels(el)).to.deep.equal(['Điện thoại', 'Apple', 'Samsung', 'Laptop', 'Phụ kiện']);
    const phone = item(el, 'Điện thoại');
    expect(phone.getAttribute('aria-level')).to.equal('1');
    expect(phone.getAttribute('aria-setsize')).to.equal('3');
    expect(phone.getAttribute('aria-posinset')).to.equal('1');
    expect(phone.getAttribute('aria-expanded')).to.equal('true');
    const samsung = item(el, 'Samsung');
    expect(samsung.getAttribute('aria-level')).to.equal('2');
    expect(samsung.getAttribute('aria-setsize')).to.equal('2');
    expect(samsung.getAttribute('aria-posinset')).to.equal('2');
    expect(samsung.getAttribute('aria-expanded')).to.equal('false');
    expect(item(el, 'Phụ kiện').hasAttribute('aria-expanded')).to.equal(false);
    // the name comes from the label span (not the whole li text, which would include the children)
    const lab = document.getElementById(phone.getAttribute('aria-labelledby'));
    expect(!!lab && phone.contains(lab)).to.equal(true);
    expect(lab.textContent).to.equal('Điện thoại');
    // description → aria-describedby
    const laptop = item(el, 'Laptop');
    expect(document.getElementById(laptop.getAttribute('aria-describedby')).textContent).to.equal('Máy tính xách tay');
    // tree / group contain ONLY treeitem / group
    for (const container of el.querySelectorAll('[role="tree"], [role="group"]')) {
      for (const child of container.children) expect(child.getAttribute('role')).to.equal('treeitem');
    }
    for (const li of items(el)) {
      for (const child of li.children) expect(['td-tree__row', 'td-tree__group'].includes(child.className)).to.equal(true);
    }
    // empty message + live region live OUTSIDE the ul, inside the wrapper
    const wrap = el.querySelector('.td-tree');
    const status = el.querySelector('[role="status"]');
    const empty = el.querySelector('.td-tree__empty');
    expect(!!status && !ul.contains(status) && wrap.contains(status)).to.equal(true);
    expect(!!empty && !ul.contains(empty) && wrap.contains(empty)).to.equal(true);
    // ids from counters, never from data
    for (const li of items(el)) expect(/^td-td-tree-\d+-n\d+$/.test(li.id), li.id).to.equal(true);
  });

  it('collapse removes the group from the DOM (only expanded branches are rendered)', () => {
    const el = tree();
    el.expand('phone');
    expect(el.querySelectorAll('[role="group"]').length).to.equal(1);
    el.collapse('phone');
    expect(el.querySelectorAll('[role="group"]').length).to.equal(0);
    expect(items(el).length).to.equal(3);
  });

  it('label attribute → internal label names the tree; multiple → aria-multiselectable', () => {
    const el = tree('label="Chuyên mục" selection="multiple"');
    const ul = list(el);
    const lab = document.getElementById(ul.getAttribute('aria-labelledby'));
    expect(lab.textContent.trim().startsWith('Chuyên mục')).to.equal(true);
    expect(ul.getAttribute('aria-multiselectable')).to.equal('true');
    expect(el.querySelector('.td-tree').getAttribute('data-selection')).to.equal('multiple');
  });
});

// ---------------------------------------------------------------- focus + keyboard ------------------------------------
describe('td-tree — roving tabindex + APG keyboard (M2)', () => {
  it('exactly one tab stop; Tab lands on it', async () => {
    const before = document.createElement('button');
    before.textContent = 'before';
    const el = tree();
    el.parentElement.insertBefore(before, el);
    expect(el.querySelectorAll('[tabindex="0"]').length).to.equal(1);
    expect(activeLabel(el)).to.equal('Điện thoại');
    before.focus();
    await sendKeys({ press: 'Tab' });
    expect(document.activeElement === active(el)).to.equal(true);
    expect(items(el).filter((li) => li.getAttribute('tabindex') === '-1').length).to.equal(2);
  });

  it('↓ ↑ (no wrap), → opens / goes to the first child / nothing on a leaf, ← closes / goes to the parent, Home / End', () => {
    const el = tree();
    active(el).focus();
    key(el, 'ArrowUp');
    expect(activeLabel(el)).to.equal('Điện thoại');
    key(el, 'ArrowRight');
    expect(item(el, 'Điện thoại').getAttribute('aria-expanded')).to.equal('true');
    expect(activeLabel(el)).to.equal('Điện thoại');
    key(el, 'ArrowRight');
    expect(activeLabel(el)).to.equal('Apple');
    expect(document.activeElement === active(el)).to.equal(true);
    key(el, 'ArrowDown');
    expect(activeLabel(el)).to.equal('Samsung');
    key(el, 'ArrowLeft');
    expect(activeLabel(el)).to.equal('Điện thoại');
    key(el, 'ArrowLeft');
    expect(item(el, 'Điện thoại').getAttribute('aria-expanded')).to.equal('false');
    key(el, 'End');
    expect(activeLabel(el)).to.equal('Phụ kiện');
    key(el, 'ArrowRight');
    expect(activeLabel(el)).to.equal('Phụ kiện');
    key(el, 'ArrowDown');
    expect(activeLabel(el)).to.equal('Phụ kiện', 'no wrap');
    key(el, 'Home');
    expect(activeLabel(el)).to.equal('Điện thoại');
  });

  it('type-ahead (diacritic-insensitive), * opens every sibling', async () => {
    const el = tree();
    active(el).focus();
    key(el, 'p');
    expect(activeLabel(el)).to.equal('Phụ kiện');
    await wait(550);
    key(el, 'l');
    expect(activeLabel(el)).to.equal('Laptop');
    key(el, '*');
    expect(item(el, 'Điện thoại').getAttribute('aria-expanded')).to.equal('true');
    expect(item(el, 'Laptop').getAttribute('aria-expanded')).to.equal('true');
  });

  it('RTL: ← opens / → closes', () => {
    const el = tree('dir="rtl"');
    active(el).focus();
    key(el, 'ArrowLeft');
    expect(item(el, 'Điện thoại').getAttribute('aria-expanded')).to.equal('true');
    key(el, 'ArrowRight');
    expect(item(el, 'Điện thoại').getAttribute('aria-expanded')).to.equal('false');
  });

  it('collapsing an ancestor of the focused node moves focus to that ancestor', () => {
    const el = tree();
    el.expand('phone');
    el.expand('apple');
    item(el, 'iPhone 16').focus();
    expect(activeLabel(el)).to.equal('iPhone 16');
    toggleOf(item(el, 'Điện thoại')).click();
    expect(activeLabel(el)).to.equal('Điện thoại');
    expect(document.activeElement === item(el, 'Điện thoại')).to.equal(true);
  });

  it('mouse: the arrow toggles, the row commits (none → activate)', () => {
    const el = tree();
    const acts = spy(el, 'activate');
    const exp = spy(el, 'expanded-change');
    toggleOf(item(el, 'Laptop')).click();
    expect(item(el, 'Laptop').getAttribute('aria-expanded')).to.equal('true');
    expect(exp).to.deep.equal([{ value: 'laptop', expanded: true }]);
    rowOf(item(el, 'Dell')).click();
    expect(acts.length).to.equal(1);
    expect(acts[0].value).to.equal('dell');
    expect(acts[0].node === el.getNode('dell')).to.equal(true);
    expect(activeLabel(el)).to.equal('Dell');
    key(el, 'Enter');
    expect(acts.length).to.equal(2);
  });
});

// ---------------------------------------------------------------- selection ------------------------------------------
describe('td-tree — selection (M3)', () => {
  it('single: browsing never selects; Enter / Space / click select; aria-selected; change payload', () => {
    const el = tree('selection="single" name="cat"');
    const ch = spy(el, 'change');
    active(el).focus();
    key(el, 'ArrowDown');
    key(el, 'ArrowDown');
    expect(ch.length).to.equal(0);
    expect(items(el).every((li) => li.getAttribute('aria-selected') === 'false')).to.equal(true);
    key(el, 'Enter');
    expect(ch).to.deep.equal([{ value: 'acc', added: ['acc'], removed: [] }]);
    expect(item(el, 'Phụ kiện').getAttribute('aria-selected')).to.equal('true');
    key(el, 'ArrowUp');
    key(el, ' ');
    expect(ch[1]).to.deep.equal({ value: 'laptop', added: ['laptop'], removed: ['acc'] });
    expect(item(el, 'Phụ kiện').getAttribute('aria-selected')).to.equal('false');
    rowOf(item(el, 'Phụ kiện')).click();
    expect(el.value).to.equal('acc');
    expect(entries(el.form)).to.deep.equal([['cat', 'acc']]);
    expect(list(el).hasAttribute('aria-multiselectable')).to.equal(false);
  });

  it('single: the first render opens the ancestors of the selected node; the tab stop is on it', () => {
    const el = tree('selection="single" value="ip16"');
    expect(shownLabels(el)).to.deep.equal(['Điện thoại', 'Apple', 'iPhone 15', 'iPhone 16', 'Samsung', 'Laptop', 'Phụ kiện']);
    expect(activeLabel(el)).to.equal('iPhone 16');
  });

  it('multiple (independent): aria-checked true / false (no mixed), Space / click toggle, value in preorder', () => {
    const el = tree('selection="multiple" name="cats[]"');
    const ch = spy(el, 'change');
    active(el).focus();
    key(el, 'End');
    key(el, ' ');
    rowOf(item(el, 'Điện thoại')).click();
    expect(item(el, 'Điện thoại').getAttribute('aria-checked')).to.equal('true');
    expect(item(el, 'Laptop').getAttribute('aria-checked')).to.equal('false');
    expect(el.value).to.deep.equal(['phone', 'acc']);
    expect(ch[1]).to.deep.equal({ value: ['phone', 'acc'], added: ['phone'], removed: [] });
    expect(entries(el.form)).to.deep.equal([['cats[]', 'phone'], ['cats[]', 'acc']]);
    key(el, 'Enter'); // active = Điện thoại (clicked)
    expect(el.value).to.deep.equal(['acc']);
    expect(el.querySelectorAll('.td-tree__check').length).to.equal(3);
  });

  it('multiple + cascade: tri-state from the leaves, click a parent checks / unchecks the unlocked leaves', () => {
    const el = tree('selection="multiple" cascade name="p[]"', [
      { value: 'post', label: 'Bài viết', expanded: true, children: [
        { value: 'post.read', label: 'Xem' }, { value: 'post.write', label: 'Sửa' }, { value: 'post.del', label: 'Xoá', disabled: true },
      ] },
    ]);
    const parent = item(el, 'Bài viết');
    rowOf(item(el, 'Xem')).click();
    expect(parent.getAttribute('aria-checked')).to.equal('mixed');
    rowOf(parent).click();
    expect(el.value).to.deep.equal(['post.read', 'post.write']);
    expect(parent.getAttribute('aria-checked')).to.equal('mixed', 'the locked unchecked leaf keeps it mixed');
    rowOf(parent).click();
    expect(el.value).to.deep.equal([]);
    expect(parent.getAttribute('aria-checked')).to.equal('false');
    el.setValue(['post.del']);
    parent.focus();
    key(el, ' ');
    expect(parent.getAttribute('aria-checked')).to.equal('true');
    expect(entries(el.form)).to.deep.equal([['p[]', 'post.read'], ['p[]', 'post.write'], ['p[]', 'post.del']]);
  });

  it('locked nodes: reachable + expandable, never selected (click / Enter / Space), still submitted', () => {
    const el = tree('selection="multiple" name="l[]"', [
      { value: 'sys', label: 'Hệ thống', disabled: true, children: [{ value: 'sys.a', label: 'A' }] },
      { value: 'b', label: 'B' },
    ]);
    el.setValue(['sys.a']);
    const sys = item(el, 'Hệ thống');
    expect(sys.getAttribute('aria-disabled')).to.equal('true');
    rowOf(sys).click();
    sys.focus();
    key(el, ' ');
    key(el, 'Enter');
    expect(sys.getAttribute('aria-checked')).to.equal('false');
    key(el, 'ArrowRight');
    expect(sys.getAttribute('aria-expanded')).to.equal('true');
    key(el, 'ArrowDown');
    expect(activeLabel(el)).to.equal('A');
    key(el, ' ');
    expect(el.value).to.deep.equal(['sys.a']);
    expect(entries(el.form)).to.deep.equal([['l[]', 'sys.a']]);
  });

  it('single with a LOCKED selection: no other node can be picked', () => {
    const el = tree('selection="single" name="s"', [{ value: 'a', label: 'A', disabled: true }, { value: 'b', label: 'B' }]);
    el.value = 'a';
    rowOf(item(el, 'B')).click();
    expect(el.value).to.equal('a');
    expect(item(el, 'B').getAttribute('aria-disabled')).to.equal('true');
    expect(entries(el.form)).to.deep.equal([['s', 'a']]);
  });
});

// ---------------------------------------------------------------- lazy -----------------------------------------------
describe('td-tree — lazy children (M4)', () => {
  it('busy while loading, children rendered on resolve; empty array → leaf; error → closed + event + retry', async () => {
    const el = tree('', [{ value: 'r', label: 'Gốc', hasChildren: true }, { value: 'e', label: 'Rỗng', hasChildren: true }]);
    const errs = spy(el, 'load-error');
    let d = deferred();
    el.loadChildren = (node) => (node.value === 'e' ? Promise.resolve([]) : d.promise);
    const r = item(el, 'Gốc');
    expect(r.getAttribute('aria-expanded')).to.equal('false');
    toggleOf(r).click();
    expect(r.getAttribute('aria-busy')).to.equal('true');
    d.resolve([{ value: 'c', label: 'Con' }]);
    await tick();
    expect(r.hasAttribute('aria-busy')).to.equal(false);
    expect(shownLabels(el)).to.deep.equal(['Gốc', 'Con', 'Rỗng']);
    toggleOf(item(el, 'Rỗng')).click();
    await tick();
    expect(item(el, 'Rỗng').hasAttribute('aria-expanded')).to.equal(false);
    // error + retry
    el.data = [{ value: 'x', label: 'X', hasChildren: true }];
    d = deferred();
    toggleOf(item(el, 'X')).click();
    d.reject(new Error('boom'));
    await tick();
    await tick();
    expect(item(el, 'X').getAttribute('aria-expanded')).to.equal('false');
    expect(item(el, 'X').getAttribute('data-load')).to.equal('error');
    expect(errs.length).to.equal(1);
    expect(errs[0].value).to.equal('x');
    expect(errs[0].error.message).to.equal('boom');
    expect(el.querySelector('[role="status"]').textContent.trim()).to.equal(TdTree.labels.loadError);
    d = deferred();
    toggleOf(item(el, 'X')).click();
    d.resolve([{ value: 'y', label: 'Y' }]);
    await tick();
    expect(shownLabels(el)).to.deep.equal(['X', 'Y']);
  });

  it('latest wins: new data while loading / hook ignoring the signal → the late result is dropped', async () => {
    const el = tree('', [{ value: 'r', label: 'R', hasChildren: true }]);
    const ds = [];
    const signals = [];
    el.loadChildren = (node, { signal }) => { const d = deferred(); ds.push(d); signals.push(signal); return d.promise; };
    toggleOf(item(el, 'R')).click();
    el.data = [{ value: 'r2', label: 'R2', hasChildren: true }];
    expect(signals[0].aborted).to.equal(true);
    ds[0].resolve([{ value: 'late', label: 'Late' }]);
    await tick();
    expect(shownLabels(el)).to.deep.equal(['R2']);
    // collapse while loading: the result is cached, the branch stays closed
    toggleOf(item(el, 'R2')).click();
    toggleOf(item(el, 'R2')).click();
    ds[1].resolve([{ value: 'k', label: 'K' }]);
    await tick();
    expect(item(el, 'R2').getAttribute('aria-expanded')).to.equal('false');
    toggleOf(item(el, 'R2')).click();
    expect(ds.length).to.equal(2, 'no second request');
    expect(shownLabels(el)).to.deep.equal(['R2', 'K']);
  });

  it('"Đang tải…" announced only after 400 ms', async () => {
    const el = tree('', [{ value: 'r', label: 'R', hasChildren: true }]);
    const d = deferred();
    el.loadChildren = () => d.promise;
    toggleOf(item(el, 'R')).click();
    const status = el.querySelector('[role="status"]');
    expect(status.textContent.trim()).to.equal('');
    await wait(450);
    expect(status.textContent.trim()).to.equal(TdTree.labels.loading);
    d.resolve([]);
  });
});

// ---------------------------------------------------------------- filter ---------------------------------------------
describe('td-tree — filter (M5)', () => {
  it('search box: matches + ancestors, setsize among shown, live region count, ↓ → first item, clear restores', async () => {
    const el = tree('searchable');
    el.expand('laptop');
    const search = el.querySelector('input.td-tree__search');
    expect(search.type).to.equal('search');
    expect(search.getAttribute('aria-controls')).to.equal(list(el).id);
    expect(search.getAttribute('aria-label')).to.equal(TdTree.labels.search);
    search.value = 'iphone';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(220);
    expect(shownLabels(el)).to.deep.equal(['Điện thoại', 'Apple', 'iPhone 15', 'iPhone 16']);
    expect(item(el, 'Apple').getAttribute('aria-setsize')).to.equal('1');
    expect(el.querySelector('[role="status"]').textContent.trim()).to.equal(TdTree.labels.results.replace('{n}', '2'));
    search.focus();
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(document.activeElement === item(el, 'Điện thoại')).to.equal(true);
    search.value = 'zzz';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(220);
    expect(items(el).length).to.equal(0);
    const empty = el.querySelector('.td-tree__empty');
    expect(empty.hidden).to.equal(false);
    expect(empty.textContent).to.equal(TdTree.labels.noResults);
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(220);
    expect(shownLabels(el)).to.deep.equal(['Điện thoại', 'Laptop', 'Dell', 'Phụ kiện']);
    expect(empty.hidden).to.equal(true);
  });

  it('filter(query) API; a matched parent shows ALL its children when opened', () => {
    const el = tree();
    el.filter('dien');
    expect(shownLabels(el)).to.deep.equal(['Điện thoại']);
    toggleOf(item(el, 'Điện thoại')).click();
    expect(shownLabels(el)).to.deep.equal(['Điện thoại', 'Apple', 'Samsung']);
    el.filter('');
    expect(shownLabels(el)).to.deep.equal(['Điện thoại', 'Laptop', 'Phụ kiện']);
  });
});

// ---------------------------------------------------------------- events + API ----------------------------------------
describe('td-tree — events + API', () => {
  it('programmatic setValue / data / expand never fire events', () => {
    const el = tree('selection="multiple"');
    const evs = [...spy(el, 'change'), ...spy(el, 'expanded-change')];
    const ch = spy(el, 'change');
    const ex = spy(el, 'expanded-change');
    el.setValue(['acc']);
    el.value = ['dell'];
    el.data = CATS();
    el.expand('phone');
    el.expandAll();
    el.collapseAll();
    expect(ch.length + ex.length + evs.length).to.equal(0);
    expect(el.getValue()).to.deep.equal(['dell']);
    expect(el.getNode('dell').label).to.equal('Dell');
    expect(el.getNode('nope')).to.equal(null);
  });

  it('expandAll / collapseAll (loaded nodes)', () => {
    const el = tree();
    el.expandAll();
    expect(items(el).length).to.equal(9);
    el.collapseAll();
    expect(items(el).length).to.equal(3);
  });
});

// ---------------------------------------------------------------- form -----------------------------------------------
describe('td-tree — form (M6)', () => {
  it('name verbatim, one entry per value, preorder, reset to the default, required, fieldset disabled, restore', () => {
    const form = mount('<fieldset><td-tree selection="multiple" name="perms[]" required value=\'["acc","dell"]\'></td-tree></fieldset>');
    const el = form.querySelector('td-tree');
    el.data = CATS();
    expect(entries(form)).to.deep.equal([['perms[]', 'dell'], ['perms[]', 'acc']]);
    expect(el.checkValidity()).to.equal(true);
    el.setValue([]);
    expect(entries(form)).to.deep.equal([]);
    expect(el.checkValidity()).to.equal(false);
    expect(el.validity.valueMissing).to.equal(true);
    form.reset();
    expect(el.value).to.deep.equal(['dell', 'acc']);
    form.querySelector('fieldset').disabled = true;
    expect(entries(form)).to.deep.equal([]);
    form.querySelector('fieldset').disabled = false;
    el.formStateRestoreCallback('["phone"]', 'restore');
    expect(el.value).to.deep.equal(['phone']);
  });

  it('early properties (set before define) apply: data, loadChildren, value wins over the attribute', () => {
    expect(early instanceof TdTree).to.equal(true);
    expect(early.value).to.deep.equal(['dell']);
    expect(entries(earlyForm)).to.deep.equal([['early[]', 'dell']]);
    expect(typeof early.loadChildren).to.equal('function');
    expect(items(early).length).to.equal(3);
  });
});

// ---------------------------------------------------------------- XSS + size ---------------------------------------
describe('td-tree — XSS + size', () => {
  it('labels, descriptions and lazy results are text only', async () => {
    const payload = '<img src=x onerror="window.__treeXss=1">';
    const el = tree('', [{ value: '"><img src=x>', label: payload, description: payload, hasChildren: true }]);
    el.loadChildren = async () => [{ value: 'c', label: payload }];
    toggleOf(items(el)[0]).click();
    await tick();
    await tick();
    expect(el.querySelectorAll('img').length).to.equal(0);
    expect(labelOf(items(el)[1])).to.equal(payload);
    expect(window.__treeXss).to.equal(undefined);
    for (const li of items(el)) expect(/^td-td-tree-\d+-n\d+$/.test(li.id)).to.equal(true);
  });

  it('1 000 visible rows render (smoke, timing logged)', () => {
    const data = Array.from({ length: 1000 }, (_, i) => ({ value: `v${i}`, label: `Mục ${i}` }));
    const t0 = performance.now();
    const el = tree('selection="multiple"', data);
    const ms = performance.now() - t0;
    console.log(`td-tree: 1000 rows in ${ms.toFixed(1)} ms`);
    expect(items(el).length).to.equal(1000);
  });
});

// ---------------------------------------------------------------- review round 1 ---------------------------------
describe('td-tree — review round 1', () => {
  const PERMS = () => [{ value: 'post', label: 'Bài viết', expanded: true, children: [
    { value: 'post.read', label: 'Xem' }, { value: 'post.write', label: 'Sửa' },
  ] }];

  it('ISSUE-1: cascade turned on at runtime → parent value dropped, tri-state shown, form updated', () => {
    const el = tree('selection="multiple" name="p[]"', PERMS());
    el.value = ['post', 'post.read'];
    expect(entries(el.form)).to.deep.equal([['p[]', 'post'], ['p[]', 'post.read']]);
    el.setAttribute('cascade', '');
    expect(el.value).to.deep.equal(['post.read']);
    expect(item(el, 'Bài viết').getAttribute('aria-checked')).to.equal('mixed');
    expect(entries(el.form)).to.deep.equal([['p[]', 'post.read']]);
  });

  it('ISSUE-1: removing loadChildren of an opted-in cascade tree → parent dropped, tri-state, form updated', () => {
    const el = tree('selection="multiple" cascade name="q[]"', null);
    el.loadChildren = async () => [];
    el.data = PERMS();
    el.value = ['post', 'post.read'];
    expect(entries(el.form)).to.deep.equal([['q[]', 'post'], ['q[]', 'post.read']], 'independent while lazy');
    el.loadChildren = null;
    expect(el.value).to.deep.equal(['post.read']);
    expect(item(el, 'Bài viết').getAttribute('aria-checked')).to.equal('mixed');
    expect(entries(el.form)).to.deep.equal([['q[]', 'post.read']]);
  });

  it('ISSUE-2: a click in a nested group\'s whitespace never activates / selects the ancestor', () => {
    const el = tree();
    el.expand('phone');
    const acts = spy(el, 'activate');
    const group = item(el, 'Điện thoại').querySelector(':scope > .td-tree__group');
    group.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(acts.length).to.equal(0);
    const single = tree('selection="single"');
    single.expand('phone');
    const ch = spy(single, 'change');
    item(single, 'Điện thoại').querySelector(':scope > .td-tree__group').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(ch.length).to.equal(0);
    expect(single.value).to.equal('');
  });

  it('S-02: * opens only loaded siblings — loadChildren is never called', () => {
    const el = tree('', [{ value: 'a', label: 'A', hasChildren: true }, { value: 'b', label: 'B', hasChildren: true },
      { value: 'c', label: 'C', children: [{ value: 'c1', label: 'C1' }] }]);
    let calls = 0;
    el.loadChildren = () => { calls++; return new Promise(() => {}); };
    active(el).focus();
    key(el, '*');
    expect(calls).to.equal(0);
    expect(item(el, 'C').getAttribute('aria-expanded')).to.equal('true');
    expect(item(el, 'A').getAttribute('aria-expanded')).to.equal('false');
    expect(item(el, 'A').hasAttribute('aria-busy')).to.equal(false);
  });
});
