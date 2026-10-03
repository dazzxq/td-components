import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { LAYERS, register as registerLayer } from '../utils/layers.js';
// NO static import of the component: <td-tree-select> is defined LATE (dynamic import below), after the pre-define
// property assignment and the focused-select scenarios.

// v0.29.0 (plan docs/internal/plans/v0.29.0-tree.md M7, with M3 / M4 / M6) — <td-tree-select> in Chromium, Firefox AND
// WebKit (group `engines`): the two ARIA patterns (single = combobox + popup tree with virtual focus, multiple =
// disclosure + roving tree), keyboard, the shared model, early properties, layers, lifecycle, the <select> upgrade,
// locks, accessible names. DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes
// hangs the runner.
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
  { value: 'laptop', label: 'Laptop', children: [{ value: 'dell', label: 'Dell' }] },
  { value: 'acc', label: 'Phụ kiện' },
];

// ---------------------------------------------------------------- before define --------------------------------------
// (1) properties assigned before define: data / loadChildren / value (value beats the attribute AND the select)
const earlyForm = document.createElement('form');
earlyForm.innerHTML = '<td-tree-select name="early" value="acc"><select><option value="laptop" selected>Laptop</option></select></td-tree-select>';
document.body.appendChild(earlyForm);
const early = earlyForm.firstElementChild;
early.data = CATS();
early.loadChildren = async () => [];
early.value = 'dell';
// (2) a FOCUSED select at define: nothing happens until it blurs
const focusForm = document.createElement('form');
focusForm.innerHTML = '<td-tree-select name="f"><select id="fsel"><option value="a">A</option><option value="b" data-level="1">B</option></select></td-tree-select>';
document.body.appendChild(focusForm);
const focusSel = focusForm.querySelector('select');
focusSel.focus();
const focusedAtDefine = document.activeElement === focusSel;

const { TdTreeSelect } = await import('./td-tree-select.js');
// the focused select is still native after define; the user changes it, then leaves it → upgraded once (checked below)
const focusHost = focusForm.querySelector('td-tree-select');
const deferState = { kept: focusHost.querySelector('select') === focusSel, marker: !focusHost.querySelector('.td-tree-select') };
focusSel.value = 'b';
focusSel.blur();
await new Promise((r) => setTimeout(r, 0));
deferState.after = { select: focusHost.querySelector('select'), value: focusHost.value, entries: [...new FormData(focusForm)] };

// ---------------------------------------------------------------- helpers -------------------------------------------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = () => new Promise((r) => setTimeout(r, 0));
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const extra = [];
afterEach(() => {
  extra.splice(0).forEach((f) => f());
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
});

function mount(html) {
  const form = document.createElement('form');
  form.innerHTML = html;
  document.body.appendChild(form);
  extra.push(() => form.remove());
  return form;
}
function ts(attrs = '', data = CATS()) {
  const form = mount(`<td-tree-select ${attrs}></td-tree-select>`);
  const el = form.querySelector('td-tree-select');
  if (data) el.data = data;
  return el;
}
const menu = (el) => el._menuElement;
const treeUl = (el) => menu(el).querySelector('[role="tree"]');
const items = (el) => [...menu(el).querySelectorAll('[role="treeitem"]')];
const labelOf = (li) => li.querySelector(':scope > .td-tree__row > .td-tree__label').textContent;
const item = (el, text) => items(el).find((li) => labelOf(li) === text) || null;
const shownLabels = (el) => items(el).map(labelOf);
const combo = (el) => el.querySelector('[role="combobox"]');
const trigger = (el) => el.querySelector('.td-tree-select__trigger');
const input = (el) => el.querySelector('.td-tree-select__input');
const search = (el) => menu(el).querySelector('.td-tree-select__search');
const isOpen = (el) => !menu(el).hidden;
const activeLi = (el) => menu(el).querySelector('[role="treeitem"][data-active]');
const activeText = (el) => (activeLi(el) ? labelOf(activeLi(el)) : null);
const focusedLabel = () => {
  const li = document.activeElement && document.activeElement.closest && document.activeElement.closest('[role="treeitem"]');
  return li ? labelOf(li) : null;
};
const valueText = (el) => {
  const i = input(el);
  return i ? i.value : el.querySelector('.td-tree-select__value').textContent;
};
const keyOn = (target, k, o = {}) => {
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
/** accessible-name source text of an element: aria-labelledby ids' text, else aria-label */
const nameOf = (node) => {
  const ids = node.getAttribute('aria-labelledby');
  if (ids) return ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent.replace(/\s*\*$/, '').trim() ?? '∅').join(' ');
  return node.getAttribute('aria-label') ?? '';
};

// ---------------------------------------------------------------- ARIA patterns ------------------------------------
describe('td-tree-select — two ARIA patterns (M7)', () => {
  it('single + searchable (default): ONE combobox = the input (aria-haspopup tree), virtual focus, focus never leaves it', async () => {
    const el = ts('label="Danh mục"');
    expect(el.querySelectorAll('[role="combobox"]').length + menu(el).querySelectorAll('[role="combobox"]').length).to.equal(1);
    const c = combo(el);
    expect(c === input(el)).to.equal(true);
    expect(c.getAttribute('aria-haspopup')).to.equal('tree');
    expect(c.getAttribute('aria-expanded')).to.equal('false');
    expect(c.getAttribute('aria-controls')).to.equal(treeUl(el).id);
    c.focus();
    keyOn(c, 'ArrowDown');
    expect(isOpen(el)).to.equal(true);
    expect(c.getAttribute('aria-expanded')).to.equal('true');
    expect(c.getAttribute('aria-activedescendant')).to.equal(activeLi(el).id);
    expect(activeText(el)).to.equal('Điện thoại');
    keyOn(c, 'ArrowDown');
    expect(c.getAttribute('aria-activedescendant')).to.equal(item(el, 'Laptop').id);
    expect(document.activeElement === c).to.equal(true);
    expect(items(el).every((li) => !li.hasAttribute('tabindex'))).to.equal(true);
    rowOf(item(el, 'Phụ kiện')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(document.activeElement === c).to.equal(true);
  });

  it('single + searchable="false": the combobox is the button', () => {
    const el = ts('searchable="false"');
    const c = combo(el);
    expect(c === trigger(el)).to.equal(true);
    expect(input(el)).to.equal(null);
    expect(c.getAttribute('aria-haspopup')).to.equal('tree');
    expect(c.getAttribute('aria-controls')).to.equal(treeUl(el).id);
  });

  it('multiple: disclosure button (no combobox anywhere), aria-controls the popup, focus into the search box, multiselectable tree', () => {
    const el = ts('multiple label="Chuyên mục"');
    expect(el.querySelector('[role="combobox"]')).to.equal(null);
    expect(menu(el).querySelector('[role="combobox"]')).to.equal(null);
    const t = trigger(el);
    expect(t.getAttribute('aria-expanded')).to.equal('false');
    expect(t.getAttribute('aria-controls')).to.equal(menu(el).id);
    t.focus();
    t.click();
    expect(isOpen(el)).to.equal(true);
    expect(t.getAttribute('aria-expanded')).to.equal('true');
    expect(document.activeElement === search(el)).to.equal(true);
    expect(treeUl(el).getAttribute('aria-multiselectable')).to.equal('true');
    expect(search(el).getAttribute('aria-label')).to.equal(TdTreeSelect.labels.search);
    keyOn(search(el), 'ArrowDown');
    expect(focusedLabel()).to.equal('Điện thoại');
  });
});

// ---------------------------------------------------------------- keyboard ---------------------------------------
describe('td-tree-select — keyboard (M7)', () => {
  it('single button: ↓ opens, ↑↓ / Home / End / → ← on the tree, Enter selects + closes + keeps focus', () => {
    const el = ts('searchable="false" name="c"');
    const ch = spy(el, 'change');
    const c = combo(el);
    c.focus();
    keyOn(c, 'ArrowDown');
    expect(isOpen(el)).to.equal(true);
    keyOn(c, 'End');
    expect(activeText(el)).to.equal('Phụ kiện');
    keyOn(c, 'Home');
    expect(activeText(el)).to.equal('Điện thoại');
    keyOn(c, 'ArrowRight');
    expect(item(el, 'Điện thoại').getAttribute('aria-expanded')).to.equal('true');
    keyOn(c, 'ArrowRight');
    expect(activeText(el)).to.equal('Apple');
    keyOn(c, 'ArrowLeft');
    expect(activeText(el)).to.equal('Điện thoại');
    keyOn(c, 'ArrowDown');
    keyOn(c, 'ArrowDown');
    expect(activeText(el)).to.equal('Samsung');
    keyOn(c, 'Enter');
    expect(isOpen(el)).to.equal(false);
    expect(document.activeElement === c).to.equal(true);
    expect(ch).to.deep.equal([{ value: 'samsung', added: ['samsung'], removed: [] }]);
    expect(valueText(el)).to.equal('Samsung');
    expect(entries(el.form)).to.deep.equal([['c', 'samsung']]);
    // reopen: the active node is the selected one (ancestors revealed)
    keyOn(c, 'ArrowDown');
    expect(activeText(el)).to.equal('Samsung');
  });

  it('single button: Space keydown → keyup → click(detail 0) selects ONCE and closes (never reopens)', () => {
    const el = ts('searchable="false"');
    const ch = spy(el, 'change');
    const c = combo(el);
    c.focus();
    keyOn(c, 'ArrowDown');
    keyOn(c, 'End');
    keyOn(c, ' ');
    c.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
    expect(ch.length).to.equal(1);
    expect(ch[0].value).to.equal('acc');
    expect(isOpen(el)).to.equal(false);
  });

  it('single input: typing filters in place, ← → act on the tree ONLY when the box is empty, Space types, Enter picks', async () => {
    const el = ts();
    const c = combo(el);
    c.focus();
    keyOn(c, 'ArrowDown');
    expect(c.value).to.equal('');
    keyOn(c, 'ArrowRight');
    expect(item(el, 'Điện thoại').getAttribute('aria-expanded')).to.equal('true', 'empty box → tree key');
    c.value = 'iph';
    c.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(220);
    expect(shownLabels(el)).to.deep.equal(['Điện thoại', 'Apple', 'iPhone 15', 'iPhone 16']);
    const e = keyOn(c, 'ArrowLeft');
    expect(e.defaultPrevented).to.equal(false, 'caret movement');
    expect(keyOn(c, ' ').defaultPrevented).to.equal(false, 'Space types');
    expect(keyOn(c, 'Home').defaultPrevented).to.equal(false, 'Home = caret');
    keyOn(c, 'ArrowDown');
    keyOn(c, 'ArrowDown');
    keyOn(c, 'ArrowDown');
    expect(activeText(el)).to.equal('iPhone 16');
    keyOn(c, 'Enter');
    expect(isOpen(el)).to.equal(false);
    expect(c.value).to.equal('iPhone 16', 'closed: the selected label');
    expect(el.value).to.equal('ip16');
  });

  it('multiple: Space / Enter on a treeitem toggle, the popup stays open; Escape closes + focuses the trigger', () => {
    const el = ts('multiple name="cats[]"');
    const ch = spy(el, 'change');
    trigger(el).focus();
    trigger(el).click();
    keyOn(search(el), 'ArrowDown');
    keyOn(document.activeElement, ' ');
    keyOn(document.activeElement, 'ArrowDown');
    keyOn(document.activeElement, 'Enter');
    expect(isOpen(el)).to.equal(true);
    expect(el.value).to.deep.equal(['phone', 'laptop']);
    expect(ch.length).to.equal(2);
    expect(valueText(el)).to.equal('Điện thoại, Laptop');
    expect(entries(el.form)).to.deep.equal([['cats[]', 'phone'], ['cats[]', 'laptop']]);
    keyOn(document.activeElement, 'Escape');
    expect(isOpen(el)).to.equal(false);
    expect(document.activeElement === trigger(el)).to.equal(true);
  });

  it('multiple: Tab from the popup closes it and returns to the trigger; summary "A, B +n"', async () => {
    const el = ts('multiple');
    el.value = ['ip15', 'ip16', 's24', 'dell', 'acc'];
    expect(valueText(el)).to.equal(`iPhone 15, iPhone 16 ${TdTreeSelect.labels.selectedCount.replace('{n}', '3')}`);
    trigger(el).focus();
    trigger(el).click();
    keyOn(search(el), 'ArrowDown');
    expect(!!focusedLabel()).to.equal(true);
    await sendKeys({ press: 'Tab' });
    expect(isOpen(el)).to.equal(false);
    expect(document.activeElement === trigger(el)).to.equal(true);
  });

  it('single: Tab closes and moves on; Escape closes and keeps the focus on the combobox', async () => {
    const el = ts('searchable="false"');
    const after = document.createElement('input'); // WebKit: buttons are not in the Tab order by default
    after.setAttribute('aria-label', 'after');
    el.parentElement.appendChild(after);
    combo(el).focus();
    keyOn(combo(el), 'ArrowDown');
    keyOn(combo(el), 'Escape');
    expect(isOpen(el)).to.equal(false);
    expect(document.activeElement === combo(el)).to.equal(true);
    keyOn(combo(el), 'ArrowDown');
    await sendKeys({ press: 'Tab' });
    expect(isOpen(el)).to.equal(false);
    expect(document.activeElement === after).to.equal(true);
  });
});

// ---------------------------------------------------------------- contract --------------------------------------------
describe('td-tree-select — contract (M7 / M6)', () => {
  it('data / loadChildren / value set BEFORE define apply; the early value beats the attribute and the select', () => {
    expect(early instanceof TdTreeSelect).to.equal(true);
    expect(early.value).to.equal('dell');
    expect(entries(earlyForm)).to.deep.equal([['early', 'dell']]);
    expect(typeof early.loadChildren).to.equal('function');
    expect(early.querySelector('select')).to.equal(null);
  });

  it('ONE model: a branch loaded in the popup resolves the trigger label (value-label replaced), no change event', async () => {
    const el = ts('searchable="false" value="deep" value-label="Đang chọn: sâu"', null);
    const ch = spy(el, 'change');
    const d = deferred();
    el.loadChildren = () => d.promise;
    el.data = [{ value: 'r', label: 'Gốc', hasChildren: true }];
    expect(valueText(el)).to.equal('Đang chọn: sâu');
    expect(entries(el.form)).to.deep.equal([], 'no name');
    el.setAttribute('name', 'n');
    expect(entries(el.form)).to.deep.equal([['n', 'deep']], 'unresolved value still submitted');
    combo(el).focus();
    keyOn(combo(el), 'ArrowDown');
    keyOn(combo(el), 'ArrowRight');
    expect(item(el, 'Gốc').getAttribute('aria-busy')).to.equal('true');
    d.resolve([{ value: 'deep', label: 'Nhánh sâu' }]);
    await tick();
    expect(valueText(el)).to.equal('Nhánh sâu');
    expect(item(el, 'Nhánh sâu').getAttribute('aria-selected')).to.equal('true');
    expect(ch.length).to.equal(0);
  });

  it('value-labels (multiple) for unresolved values; invalid JSON ignored', () => {
    const el = ts('multiple value=\'["x","y"]\' value-labels=\'{"x":"Ích"}\'', null);
    el.loadChildren = async () => [];
    el.data = [{ value: 'r', label: 'R', hasChildren: true }];
    expect(valueText(el)).to.equal('Ích, y');
    const bad = ts('multiple value=\'["x"]\' value-labels="{oops"', null);
    bad.loadChildren = async () => [];
    bad.data = [{ value: 'r', label: 'R', hasChildren: true }];
    expect(valueText(bad)).to.equal('x');
  });

  it('display="path"', () => {
    const el = ts('display="path" value="ip15" searchable="false"');
    expect(valueText(el)).to.equal('Điện thoại › Apple › iPhone 15');
  });

  it('placeholder when empty; allow-clear clears (event) and never removes a locked value', () => {
    const el = ts('allow-clear placeholder="Chọn danh mục" multiple name="m[]"', [
      { value: 'a', label: 'A', disabled: true }, { value: 'b', label: 'B' },
    ]);
    expect(valueText(el)).to.equal('Chọn danh mục');
    expect(el.querySelector('.td-tree-select__value').hasAttribute('data-placeholder')).to.equal(true);
    const clear = el.querySelector('.td-tree-select__clear');
    expect(clear.hidden).to.equal(true);
    el.value = ['a', 'b'];
    expect(clear.hidden).to.equal(false);
    expect(clear.getAttribute('aria-label')).to.equal(TdTreeSelect.labels.clear);
    const ch = spy(el, 'change');
    clear.click();
    expect(el.value).to.deep.equal(['a']);
    expect(ch).to.deep.equal([{ value: ['a'], added: [], removed: ['b'] }]);
    expect(clear.hidden).to.equal(true);
    expect(entries(el.form)).to.deep.equal([['m[]', 'a']]);
  });

  it('single with a LOCKED selection: no other pick, no clear', () => {
    const el = ts('allow-clear searchable="false" name="s"', [{ value: 'a', label: 'A', disabled: true }, { value: 'b', label: 'B' }]);
    el.value = 'a';
    expect(el.querySelector('.td-tree-select__clear').hidden).to.equal(true);
    combo(el).focus();
    keyOn(combo(el), 'ArrowDown');
    rowOf(item(el, 'B')).click();
    keyOn(combo(el), 'End');
    keyOn(combo(el), 'Enter');
    expect(el.value).to.equal('a');
    expect(entries(el.form)).to.deep.equal([['s', 'a']]);
  });

  it('events of the popup tree are re-fired on the host only (never bubble twice to the document)', async () => {
    const el = ts('searchable="false"', [{ value: 'r', label: 'R', hasChildren: true }, { value: 'x', label: 'X' }]);
    el.loadChildren = () => Promise.reject(new Error('nope'));
    const docChanges = [];
    const onDoc = (e) => { if (e instanceof CustomEvent) docChanges.push(e.type); };
    for (const t of ['change', 'expanded-change', 'load-error']) document.addEventListener(t, onDoc);
    extra.push(() => { for (const t of ['change', 'expanded-change', 'load-error']) document.removeEventListener(t, onDoc); });
    const exp = spy(el, 'expanded-change');
    const errs = spy(el, 'load-error');
    combo(el).focus();
    keyOn(combo(el), 'ArrowDown');
    keyOn(combo(el), 'ArrowRight');
    await tick();
    await tick();
    expect(exp).to.deep.equal([{ value: 'r', expanded: true }]);
    expect(errs.length).to.equal(1);
    expect(errs[0].value).to.equal('r');
    keyOn(combo(el), 'End');
    keyOn(combo(el), 'Enter');
    expect(docChanges).to.deep.equal(['expanded-change', 'load-error', 'change']);
  });
});

// ---------------------------------------------------------------- layers + lifecycle -------------------------------
describe('td-tree-select — layers + lifecycle (M7)', () => {
  it('inside a modal-level boundary: Escape closes only the popup; a newer modal covers it (closed, no focus)', () => {
    const el = ts('searchable="false"');
    let modalEsc = 0;
    const modal = registerLayer({ layer: LAYERS.modal, element: el.parentElement, blocking: true, keyboard: 'boundary', onEscape: () => { modalEsc++; return true; } });
    extra.push(() => modal.release());
    combo(el).focus();
    keyOn(combo(el), 'ArrowDown');
    expect(isOpen(el)).to.equal(true);
    keyOn(combo(el), 'Escape');
    expect(isOpen(el)).to.equal(false);
    expect(modalEsc).to.equal(0);
    keyOn(combo(el), 'ArrowDown');
    const box = document.createElement('div');
    document.body.appendChild(box);
    extra.push(() => box.remove());
    const top = registerLayer({ layer: LAYERS.modal, element: box, blocking: true, keyboard: 'boundary' });
    extra.push(() => top.release());
    expect(isOpen(el)).to.equal(false);
  });

  it('trigger hidden → closes', async () => {
    const el = ts('searchable="false"');
    combo(el).focus();
    keyOn(combo(el), 'ArrowDown');
    el.hidden = true;
    el.style.setProperty('display', 'none');
    await frame();
    await wait(50);
    expect(isOpen(el)).to.equal(false);
  });

  it('disconnect while open + lazy pending: portal gone, layer released, late result dropped; reconnect reloads, value kept', async () => {
    const el = ts('multiple name="v[]"', [{ value: 'r', label: 'R', hasChildren: true }, { value: 'x', label: 'X' }]);
    el.value = ['x'];
    const ds = [];
    el.loadChildren = () => { const d = deferred(); ds.push(d); return d.promise; };
    trigger(el).focus();
    trigger(el).click();
    keyOn(search(el), 'ArrowDown');
    keyOn(document.activeElement, 'ArrowRight');
    expect(ds.length).to.equal(1);
    const id = el.id;
    const parent = el.parentElement;
    const menusBefore = document.querySelectorAll('.td-tree-select__menu').length;
    el.remove();
    expect(document.getElementById(`${id}-menu`)).to.equal(null);
    expect(document.querySelectorAll('.td-tree-select__menu').length).to.equal(menusBefore - 1);
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(esc);
    expect(esc.defaultPrevented).to.equal(false, 'no layer left');
    ds[0].resolve([{ value: 'late', label: 'Late' }]);
    await tick();
    parent.appendChild(el);
    expect(el.value).to.deep.equal(['x']);
    expect(entries(parent)).to.deep.equal([['v[]', 'x']]);
    trigger(el).focus();
    trigger(el).click();
    expect(isOpen(el)).to.equal(true);
    expect(shownLabels(el)).to.deep.equal(['R', 'X']);
    keyOn(search(el), 'ArrowDown');
    keyOn(document.activeElement, 'ArrowRight');
    expect(ds.length).to.equal(2, 'reloaded');
    ds[1].resolve([{ value: 'k', label: 'K' }]);
    await tick();
    expect(shownLabels(el)).to.deep.equal(['R', 'K', 'X']);
    keyOn(document.activeElement, 'Escape');
  });
});

// ---------------------------------------------------------------- <select> upgrade --------------------------------
describe('td-tree-select — <select> upgrade (M7)', () => {
  it('preorder + data-level (jump clamped, warned), data-label, NBSP indent trimmed, data-description, placeholder skipped', () => {
    const warn = console.warn;
    const warns = [];
    console.warn = (...a) => warns.push(a.join(' '));
    extra.push(() => { console.warn = warn; });
    const form = mount('<label for="sel1">Cha</label><td-tree-select><select id="sel1" name="parent" required>'
      + '<option value="">— Chọn —</option>'
      + '<option value="phone" data-label="Điện thoại">Điện thoại</option>'
      + '<option value="apple" data-level="1">  Apple</option>'
      + '<option value="ip" data-level="3" data-description="Mới">    iPhone</option>'
      + '<optgroup label="G"><option value="acc">Phụ kiện</option></optgroup>'
      + '</select></td-tree-select>');
    const el = form.querySelector('td-tree-select');
    expect(el.querySelector('select')).to.equal(null);
    expect(el.getAttribute('name')).to.equal('parent');
    expect(el.hasAttribute('required')).to.equal(true);
    expect(el.getAttribute('placeholder')).to.equal('— Chọn —');
    expect(warns.some((w) => /data-level/.test(w))).to.equal(true);
    expect(form.querySelector('label').htmlFor).to.equal(el.id);
    expect(el.value).to.equal('');
    expect(el.checkValidity()).to.equal(false);
    combo(el).focus();
    keyOn(combo(el), 'ArrowDown');
    keyOn(combo(el), 'ArrowRight');
    keyOn(combo(el), 'ArrowDown');
    keyOn(combo(el), 'ArrowRight');
    expect(shownLabels(el)).to.deep.equal(['Điện thoại', 'Apple', 'iPhone', 'Phụ kiện']);
    expect(item(el, 'iPhone').getAttribute('aria-level')).to.equal('3', 'jump > +1 clamped');
    expect(item(el, 'iPhone').querySelector('.td-tree__desc').textContent).to.equal('Mới');
    expect(nameOf(combo(el))).to.equal('Cha');
    keyOn(combo(el), 'Escape');
  });

  it('live selection (multiple), data-locked / disabled → locked, disabled data-native-only → not locked, hidden locked inputs', () => {
    const form = mount('<td-tree-select><select multiple name="perm[]">'
      + '<option value="post" disabled data-native-only>Bài viết</option>'
      + '<option value="read" data-level="1" selected>Xem</option>'
      + '<option value="del" data-level="1" disabled selected data-locked>Xoá</option>'
      + '<option value="old" disabled>Cũ</option>'
      + '</select><input type="hidden" class="td-tree-select__locked" name="perm[]" value="del"></td-tree-select>');
    const el = form.querySelector('td-tree-select');
    expect(el.hasAttribute('multiple')).to.equal(true);
    expect(el.querySelector('input[type="hidden"]')).to.equal(null);
    expect(el.value).to.deep.equal(['read', 'del']);
    expect(entries(form)).to.deep.equal([['perm[]', 'read'], ['perm[]', 'del']]);
    trigger(el).focus();
    trigger(el).click();
    keyOn(search(el), 'ArrowDown');
    keyOn(document.activeElement, 'ArrowRight');
    expect(item(el, 'Bài viết').hasAttribute('aria-disabled')).to.equal(false, 'data-native-only: not locked');
    expect(item(el, 'Xoá').getAttribute('aria-disabled')).to.equal('true');
    expect(item(el, 'Cũ').getAttribute('aria-disabled')).to.equal('true', 'hand-written disabled → locked');
    keyOn(document.activeElement, 'Escape');
    form.reset();
    expect(el.value).to.deep.equal(['read', 'del'], 'reset = the native defaults');
  });

  it('single with only a locked selected option stays locked after the upgrade', () => {
    const form = mount('<td-tree-select allow-clear><select name="cat">'
      + '<option value="a" disabled data-native-only>A</option>'
      + '<option value="b" selected data-locked>B</option>'
      + '</select></td-tree-select>');
    const el = form.querySelector('td-tree-select');
    expect(el.value).to.equal('b');
    expect(el.querySelector('.td-tree-select__clear').hidden).to.equal(true);
    combo(el).focus();
    keyOn(combo(el), 'ArrowDown');
    rowOf(item(el, 'A')).click();
    expect(el.value).to.equal('b');
    expect(entries(form)).to.deep.equal([['cat', 'b']]);
    keyOn(combo(el), 'Escape');
  });

  it('a select focused at define is upgraded on its blur, with the choice made meanwhile', async () => {
    expect(focusedAtDefine).to.equal(true);
    expect(deferState.kept, 'select kept while focused').to.equal(true);
    expect(deferState.marker, 'nothing rendered while focused').to.equal(true);
    expect(deferState.after.select).to.equal(null);
    expect(deferState.after.value).to.equal('b');
    expect(deferState.after.entries).to.deep.equal([['f', 'b']]);
  });

  it('value attribute beats the live select state', () => {
    const form = mount('<td-tree-select value="b"><select name="x"><option value="a" selected>A</option><option value="b">B</option></select></td-tree-select>');
    expect(form.querySelector('td-tree-select').value).to.equal('b');
  });
});

// ---------------------------------------------------------------- accessible names ----------------------------------
describe('td-tree-select — accessible name (M7)', () => {
  for (const mode of ['', 'multiple']) {
    it(`${mode || 'single'}: label attribute / external <label for> / aria-label / fallback — control and tree share it`, () => {
      const cases = [
        [`<td-tree-select ${mode} label="Nhãn trong"></td-tree-select>`, 'Nhãn trong'],
        [`<label for="ext-${mode || 's'}">Nhãn ngoài</label><td-tree-select id="ext-${mode || 's'}" ${mode}></td-tree-select>`, 'Nhãn ngoài'],
        [`<td-tree-select ${mode} aria-label="Nhãn aria"></td-tree-select>`, 'Nhãn aria'],
        [`<td-tree-select ${mode}></td-tree-select>`, TdTreeSelect.labels.tree],
      ];
      for (const [html, want] of cases) {
        const form = mount(html);
        const el = form.querySelector('td-tree-select');
        el.data = CATS();
        const control = mode ? trigger(el) : combo(el);
        expect(nameOf(control)).to.equal(want, html);
        expect(nameOf(treeUl(el))).to.equal(want, `tree: ${html}`);
      }
      const form = mount(`<td-tree-select ${mode} aria-label="A"></td-tree-select>`);
      const el = form.querySelector('td-tree-select');
      el.setAttribute('aria-label', 'B');
      expect(nameOf(treeUl(el))).to.equal('B', 'kept in sync');
    });
  }
});
