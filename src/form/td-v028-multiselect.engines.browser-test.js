import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
// NO static import of the component: <td-chip-input> is defined LATE (dynamic import below), after the no-JS checks,
// the focused-select scenario and the pre-define property assignment.

// v0.28.0 (plan docs/internal/plans/v0.28.0-multiselect.md) — <td-chip-input> multi-select: selection-only (M1),
// select-all-shown (M2), <select multiple> adoption + groups (M3), form submission (M4), PHP td_multiselect element mode
// (M5, contract chip-input@1). Runs in Chromium, Firefox AND WebKit (web-test-runner group `engines`). The PHP markup is
// EXACTLY what php/td.php prints for test/ssr/multiselect.fixtures.json: test/ssr/fixtures/multiselect.html, generated
// by `node test/ssr/build-multiselect-fixture.mjs` and kept fresh by test/php/td-ssr-multiselect.test.js.
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
document.addEventListener('submit', (e) => e.preventDefault(), true);

const SPEC = await (await fetch('/test/ssr/multiselect.fixtures.json')).json();
const FIXTURE = await (await fetch('/test/ssr/fixtures/multiselect.html')).text();
const root = document.createElement('div');
root.innerHTML = FIXTURE;
document.body.appendChild(root);
const caseForm = (id) => root.querySelector(`form[data-case="${id}"]`);
const caseHost = (id) => caseForm(id).querySelector('td-chip-input');
const entries = (form) => [...new FormData(form)];

// ---------------------------------------------------------------- before define --------------------------------------
// No JS: every form submits its selected values natively (one entry per selected, enabled option, name verbatim).
const noJs = {
  native: Object.fromEntries(SPEC.nativeCases.map((c) => [c.id, entries(caseForm(c.id))])),
  element: Object.fromEntries(SPEC.cases.map((c) => [c.id, entries(caseForm(c.id))])),
  nativeSelectShown: getComputedStyle(caseForm('n-basic').querySelector('select')).display,
  elementMinHeight: getComputedStyle(caseHost('m-basic').querySelector('select')).minHeight,
  elementClass: caseHost('m-basic').querySelector('select').className,
};
// Element mode: the select is focused while the module loads → nothing happens until it blurs (M3).
const focusSelect = caseHost('m-focus').querySelector('select');
focusSelect.focus();
const focusedAtDefine = document.activeElement === focusSelect;
const other = document.createElement('button');
other.type = 'button';
other.textContent = 'other';
document.body.appendChild(other);

// Early JS property (own property before define) beats the host `value` attribute and the live select state.
const earlyWrap = document.createElement('form');
earlyWrap.innerHTML = '<td-chip-input name="e[]" value=\'["b"]\'><select multiple><option value="a" selected>A</option>'
  + '<option value="b">B</option><option value="c">C</option></select></td-chip-input>';
document.body.appendChild(earlyWrap);
earlyWrap.firstElementChild.value = ['c'];

const { TdChipInput } = await import('./td-chip-input.js');

// ---------------------------------------------------------------- helpers -------------------------------------------
const host = document.createElement('div');
document.body.appendChild(host);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = () => new Promise((r) => setTimeout(r, 0));
let cleanup = [];
afterEach(() => {
  cleanup.forEach((f) => f());
  cleanup = [];
  host.replaceChildren();
});

const ROLES = [
  { value: 'admin', label: 'Quản trị' },
  { value: 'editor', label: 'Biên tập' },
  { value: 'viewer', label: 'Người xem' },
  { value: 'guest', label: 'Khách' },
];
function mk(attrs = 'selection-only', options = ROLES, parent = host) {
  parent.insertAdjacentHTML('beforeend', `<td-chip-input aria-label="Vai trò" ${attrs}></td-chip-input>`);
  const el = parent.lastElementChild;
  if (options) el.options = options.map((o) => ({ ...o }));
  return el;
}
const inp = (el) => el.querySelector('.td-chip-input__input');
const list = (el) => el._menuElement.querySelector('[role="listbox"]');
const opts = (el) => [...el._menuElement.querySelectorAll('[role="option"]')];
const leafOpts = (el) => opts(el).filter((o) => !o.classList.contains('td-chip-input__option--all'));
const optByText = (el, t) => opts(el).find((o) => o.querySelector('.td-chip-input__option-label')?.textContent === t);
const allRow = (el) => el._menuElement.querySelector('.td-chip-input__option--all');
const activeEl = (el) => el._menuElement.querySelector('[role="option"][data-active]');
const activeText = (el) => activeEl(el)?.querySelector('.td-chip-input__option-label')?.textContent ?? activeEl(el)?.textContent ?? null;
const vals = (el) => el.getValue().map((i) => String(i.value));
const chipTexts = (el) => [...el.querySelectorAll('.td-chip-input__chip-label')].map((c) => c.textContent);
const isOpen = (el) => !el._menuElement.hidden;
const statusText = (el) => el.querySelector('[role="status"]').textContent.replace(/ $/, '');
const key = (el, k, o = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o });
  inp(el).dispatchEvent(e);
  return e;
};
const type = (el, text) => {
  inp(el).value = text;
  inp(el).dispatchEvent(new Event('input', { bubbles: true }));
};
function spy(el, name) {
  const out = [];
  el.addEventListener(name, (e) => { if (e instanceof CustomEvent) out.push(e.detail); });
  return out;
}
const selState = (el) => leafOpts(el).map((o) => o.getAttribute('aria-selected'));

// ---------------------------------------------------------------- no JS / M5 -----------------------------------------
describe('v0.28.0 td_multiselect — no JS (native <select multiple>)', () => {
  it('native and element-mode selects submit one entry per selected enabled value, name verbatim', () => {
    for (const c of SPEC.nativeCases) expect(noJs.native[c.id], c.id).to.deep.equal(c.submit);
    expect(noJs.element['m-basic']).to.deep.equal([['roles[]', 'editor'], ['roles[]', 'viewer']]);
    expect(noJs.element['m-groups']).to.deep.equal([['cities[]', 'hp']]);
    expect(noJs.element['m-required']).to.deep.equal([]);
    expect(noJs.element['m-disabled']).to.deep.equal([]); // a disabled select submits nothing
    expect(noJs.nativeSelectShown).to.not.equal('none');
  });

  it('element mode: select.td-chip-input__native, min-height = the chip box min-height (less shift on upgrade)', () => {
    expect(noJs.elementClass).to.equal('td-chip-input__native');
    const box = caseHost('m-basic').querySelector('.td-chip-input__box');
    expect(!!box, 'upgraded').to.equal(true);
    expect(noJs.elementMinHeight).to.equal(getComputedStyle(box).minHeight);
    expect(parseFloat(noJs.elementMinHeight)).to.be.greaterThan(30);
  });
});

describe('v0.28.0 M3 — focused <select> at define: deferred until blur (chip-input@1)', () => {
  it('while focused nothing is upgraded; blur → upgraded ONCE with the live choice', async () => {
    expect(focusedAtDefine, 'focused before define').to.equal(true);
    const h = caseHost('m-focus');
    expect(h.querySelector('select') === focusSelect, 'select kept').to.equal(true);
    expect(h.getAttribute('data-td-ssr')).to.equal('chip-input@1');
    expect(h.querySelector('.td-chip-input')).to.equal(null);
    expect(document.activeElement === focusSelect, 'focus kept').to.equal(true);
    // the user changes the choice while focused
    focusSelect.options[0].selected = false;
    focusSelect.options[2].selected = true;
    other.focus();
    await tick();
    expect(h.querySelector('select')).to.equal(null);
    expect(h.hasAttribute('data-td-ssr')).to.equal(false);
    expect(!!h.querySelector('.td-chip-input__input'), 'rendered').to.equal(true);
    expect(vals(h)).to.deep.equal(['c']);
    expect(entries(caseForm('m-focus'))).to.deep.equal([['focus[]', 'c']]);
    expect(document.activeElement === other, 'focus not moved back').to.equal(true);
    // reset → the native defaults (option `selected` attributes)
    caseForm('m-focus').reset();
    expect(vals(h)).to.deep.equal(['a']);
  });
});

describe('v0.28.0 M5 — td_multiselect element mode adopted through the <select multiple> path', () => {
  for (const c of SPEC.cases.filter((x) => x.browser !== 'focus')) {
    it(`${c.id}: options, selection, name / required / disabled / label lifted, select removed, selection-only`, () => {
      const h = caseHost(c.id);
      const ex = c.expect;
      expect(h.querySelector('select'), 'select removed').to.equal(null);
      expect(h.hasAttribute('data-td-ssr')).to.equal(false);
      expect(h.hasAttribute('selection-only')).to.equal(true);
      expect(h.getAttribute('name')).to.equal(ex.name);
      expect(vals(h)).to.deep.equal(ex.values);
      expect(entries(caseForm(c.id))).to.deep.equal(ex.disabled === true ? [] : ex.values.map((v) => [ex.name, v]));
      expect(h.hasAttribute('required')).to.equal(!!ex.required);
      if (ex.disabled === true) expect(inp(h).disabled).to.equal(true);
      if (ex.maxItems) expect(h.getAttribute('max-items')).to.equal(ex.maxItems);
      if (ex.placeholder) expect(inp(h).placeholder).to.equal(ex.placeholder);
      if (ex.ariaLabel) expect(inp(h).getAttribute('aria-label')).to.equal(ex.ariaLabel);
      if (ex.label) expect(h.querySelector('.td-field__label').textContent.replace(/ \*$/, '')).to.equal(ex.label);
      expect(h.hasAttribute('select-all')).to.equal(!!ex.selectAll);
      expect(h.hasAttribute('close-on-select')).to.equal(!!ex.closeOnSelect);
      if (ex.required) expect(h.validity.valueMissing).to.equal(ex.values.length === 0);
      for (const bad of c.dropped || []) expect(h.hasAttribute(bad), bad).to.equal(false);
      if (ex.disabled !== true) {
        h.open();
        expect(leafOpts(h).length).to.equal(ex.leaves);
        const groups = [...list(h).querySelectorAll('[role="group"]')]
          .map((g) => document.getElementById(g.getAttribute('aria-labelledby')).textContent);
        expect(groups).to.deep.equal(ex.groups || []);
        if (ex.disabled) {
          const off = leafOpts(h).filter((o) => o.getAttribute('aria-disabled') === 'true').map((o) => o.getAttribute('data-value'));
          expect(off).to.deep.equal(ex.disabled);
        }
        h.close();
      }
    });
  }

  it('m-groups: descriptions kept (data-description), labels from the options', () => {
    const h = caseHost('m-groups');
    h.open();
    expect(optByText(h, 'Huế').querySelector('.td-chip-input__option-desc').textContent).to.equal('Cố đô');
    expect(chipTexts(h)).to.deep.equal(['Hải Phòng']);
    h.close();
  });
});

// ---------------------------------------------------------------- M1 -------------------------------------------------
describe('v0.28.0 M1 — selection-only', () => {
  it('typed text never becomes a chip: Enter without an active option does nothing; allow-create ignored + one warning per element', () => {
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => warns.push(a.join(' '));
    cleanup.push(() => { console.warn = orig; });
    const el = mk('selection-only allow-create');
    const ch = spy(el, 'change');
    type(el, 'Không có');
    const e = key(el, 'Enter');
    expect(e.defaultPrevented, 'typed text: no implicit submit').to.equal(true);
    expect(vals(el)).to.deep.equal([]);
    expect(el._menuElement.querySelector('.td-chip-input__option--create')).to.equal(null);
    type(el, 'Biên');
    key(el, 'Enter'); // the exact-match pick of the legacy mode does not apply either
    expect(vals(el)).to.deep.equal([]);
    expect(ch.length).to.equal(0);
    expect(warns.filter((w) => w.includes('allow-create')).length).to.equal(1); // once, however often it is used
    const el2 = mk('selection-only allow-create');
    type(el2, 'x');
    expect(warns.filter((w) => w.includes('allow-create')).length).to.equal(2); // one per element
  });

  it('listbox aria-multiselectable; every option aria-selected true|false = membership; selected rows stay listed with ✓', () => {
    const el = mk();
    el.value = ['editor'];
    el.open();
    expect(list(el).getAttribute('aria-multiselectable')).to.equal('true');
    expect(leafOpts(el).length).to.equal(4);
    expect(selState(el)).to.deep.equal(['false', 'true', 'false', 'false']);
    const check = (o) => getComputedStyle(o.querySelector('.td-chip-input__check')).visibility;
    expect(check(optByText(el, 'Biên tập'))).to.equal('visible');
    expect(check(optByText(el, 'Quản trị'))).to.equal('hidden');
    expect(optByText(el, 'Biên tập').querySelector('.td-chip-input__check').getAttribute('aria-hidden')).to.equal('true');
  });

  it('arrow keys move the highlight (data-active + aria-activedescendant) without changing the selection', () => {
    const el = mk();
    el.value = ['admin'];
    const ch = spy(el, 'change');
    key(el, 'ArrowDown');
    expect(isOpen(el)).to.equal(true);
    expect(activeText(el)).to.equal('Quản trị');
    expect(inp(el).getAttribute('aria-activedescendant')).to.equal(activeEl(el).id);
    key(el, 'ArrowDown');
    expect(activeText(el)).to.equal('Biên tập');
    expect(inp(el).getAttribute('aria-activedescendant')).to.equal(activeEl(el).id);
    expect(el._menuElement.querySelectorAll('[data-active]').length).to.equal(1);
    key(el, 'ArrowUp');
    key(el, 'ArrowUp'); // wraps to the last
    expect(activeText(el)).to.equal('Khách');
    expect(selState(el)).to.deep.equal(['true', 'false', 'false', 'false']);
    expect(vals(el)).to.deep.equal(['admin']);
    expect(ch.length).to.equal(0);
  });

  it('Enter toggles the active option (add, then remove); the popup stays open; one change each', () => {
    const el = mk();
    const ch = spy(el, 'change');
    key(el, 'ArrowDown');
    key(el, 'ArrowDown');
    key(el, 'Enter');
    expect(vals(el)).to.deep.equal(['editor']);
    expect(isOpen(el)).to.equal(true);
    expect(activeText(el), 'highlight kept').to.equal('Biên tập');
    expect(optByText(el, 'Biên tập').getAttribute('aria-selected')).to.equal('true');
    expect(chipTexts(el)).to.deep.equal(['Biên tập']);
    key(el, 'Enter');
    expect(vals(el)).to.deep.equal([]);
    expect(isOpen(el)).to.equal(true);
    expect(optByText(el, 'Biên tập').getAttribute('aria-selected')).to.equal('false');
    expect(ch.length).to.equal(2);
    expect(ch[0].added.value).to.equal('editor');
    expect(ch[1].removed.value).to.equal('editor');
  });

  it('click toggles; the popup stays open; the filter text is kept', () => {
    const el = mk();
    el.open();
    type(el, 'u'); // Quản trị, Người xem
    expect(leafOpts(el).map((o) => o.querySelector('.td-chip-input__option-label').textContent)).to.deep.equal(['Quản trị', 'Người xem']);
    optByText(el, 'Người xem').click();
    expect(vals(el)).to.deep.equal(['viewer']);
    expect(isOpen(el)).to.equal(true);
    expect(inp(el).value).to.equal('u');
    optByText(el, 'Quản trị').click();
    optByText(el, 'Người xem').click();
    expect(vals(el)).to.deep.equal(['admin']);
    expect(isOpen(el)).to.equal(true);
  });

  it('close-on-select: the popup closes after a pick', () => {
    const el = mk('selection-only close-on-select');
    el.open();
    optByText(el, 'Khách').click();
    expect(vals(el)).to.deep.equal(['guest']);
    expect(isOpen(el)).to.equal(false);
  });

  it('Space types a space into the search box and never changes the selection (even with an active option)', async () => {
    const el = mk();
    inp(el).focus();
    await sendKeys({ type: 'Biên' });
    await sendKeys({ press: 'ArrowDown' });
    expect(activeText(el)).to.equal('Biên tập');
    await sendKeys({ press: 'Space' });
    expect(inp(el).value).to.equal('Biên ');
    expect(vals(el)).to.deep.equal([]);
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Space' });
    expect(inp(el).value).to.equal('Biên  ');
    expect(vals(el)).to.deep.equal([]);
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Enter' }); // real Enter toggles
    expect(vals(el)).to.deep.equal(['editor']);
    expect(isOpen(el)).to.equal(true);
  });

  it('Backspace in the empty input keeps the existing behaviour (focus the last chip, nothing removed)', () => {
    const el = mk();
    el.value = ['admin', 'guest'];
    inp(el).focus();
    const e = key(el, 'Backspace');
    expect(e.defaultPrevented).to.equal(true);
    expect(vals(el)).to.deep.equal(['admin', 'guest']);
    const btns = el.querySelectorAll('.td-chip-input__remove');
    expect(document.activeElement === btns[1], 'last chip remove button focused').to.equal(true);
  });

  it('max-items: when full, unselected options are aria-disabled + "Đã đạt tối đa N mục"; selected ones stay deselectable', () => {
    const el = mk('selection-only max-items="2"');
    el.open();
    optByText(el, 'Quản trị').click();
    expect(leafOpts(el).some((o) => o.getAttribute('aria-disabled') === 'true')).to.equal(false);
    optByText(el, 'Khách').click();
    expect(vals(el)).to.deep.equal(['admin', 'guest']);
    expect(isOpen(el), 'stays open when full').to.equal(true);
    expect(statusText(el)).to.include('Đã đạt tối đa 2 mục');
    const dis = leafOpts(el).map((o) => o.getAttribute('aria-disabled'));
    expect(dis).to.deep.equal([null, 'true', 'true', null]);
    // click on a locked row: ignored
    optByText(el, 'Biên tập').click();
    expect(vals(el)).to.deep.equal(['admin', 'guest']);
    // arrows skip the locked rows
    key(el, 'ArrowDown');
    expect(activeText(el)).to.equal('Quản trị');
    key(el, 'ArrowDown');
    expect(activeText(el)).to.equal('Khách');
    key(el, 'ArrowDown');
    expect(activeText(el)).to.equal('Quản trị');
    // Enter on a selected one while full → deselected; the others unlock
    key(el, 'Enter');
    expect(vals(el)).to.deep.equal(['guest']);
    expect(leafOpts(el).every((o) => !o.hasAttribute('aria-disabled'))).to.equal(true);
    // full again → typing / ArrowDown / show-on-focus still open the list (selected rows must stay reachable)
    optByText(el, 'Người xem').click();
    el.close();
    type(el, 'a');
    expect(isOpen(el), 'typing opens when full').to.equal(true);
    el.close();
    key(el, 'ArrowDown');
    expect(isOpen(el), 'ArrowDown opens when full').to.equal(true);
  });

  it('disabled options (own / group) are rejected on every path; selected-then-disabled is deselectable', () => {
    const el = mk('selection-only', [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B', disabled: true },
      { label: 'Nhóm khoá', disabled: true, options: [{ value: 'c', label: 'C' }] },
      { value: 'd', label: 'D' },
    ]);
    const ch = spy(el, 'change');
    el.open();
    expect(leafOpts(el).map((o) => o.getAttribute('aria-disabled'))).to.deep.equal([null, 'true', 'true', null]);
    optByText(el, 'B').click();
    optByText(el, 'C').click();
    expect(vals(el)).to.deep.equal([]);
    key(el, 'ArrowDown');
    expect(activeText(el)).to.equal('A');
    key(el, 'ArrowDown');
    expect(activeText(el)).to.equal('D');
    key(el, 'ArrowDown');
    expect(activeText(el)).to.equal('A');
    key(el, 'ArrowUp');
    expect(activeText(el)).to.equal('D');
    expect(ch.length).to.equal(0);
    // programmatic selection of a disabled item (like a native <option selected disabled>) → still deselectable
    el.value = ['b'];
    el.open();
    expect(optByText(el, 'B').getAttribute('aria-disabled')).to.equal(null);
    optByText(el, 'B').click();
    expect(vals(el)).to.deep.equal([]);
  });

  it('async provider: a stale response never overwrites the newer one (selection-only)', async () => {
    const calls = [];
    const el = mk('selection-only search-delay="0"', null);
    el.search = (q) => new Promise((resolve) => { calls.push({ q, resolve }); });
    type(el, 'a');
    await wait(5);
    type(el, 'ab');
    await wait(5);
    expect(calls.length).to.equal(2);
    calls[1].resolve([{ value: 'ab', label: 'AB mới' }]);
    await tick();
    calls[0].resolve([{ value: 'a', label: 'A cũ' }]);
    await tick();
    expect(leafOpts(el).map((o) => o.querySelector('.td-chip-input__option-label').textContent)).to.deep.equal(['AB mới']);
    optByText(el, 'AB mới').click();
    expect(vals(el)).to.deep.equal(['ab']);
    expect(isOpen(el)).to.equal(true);
  });

  it('without selection-only nothing changes (selected items hidden, aria-selected = highlight, Enter adds + closes)', () => {
    const el = mk('');
    el.value = ['admin'];
    key(el, 'ArrowDown');
    expect(list(el).hasAttribute('aria-multiselectable')).to.equal(false);
    expect(opts(el).length).to.equal(3);
    expect(opts(el)[0].getAttribute('aria-selected')).to.equal('true');
    expect(el._menuElement.querySelector('.td-chip-input__check')).to.equal(null);
    key(el, 'Enter');
    expect(vals(el)).to.deep.equal(['admin', 'editor']);
    expect(isOpen(el)).to.equal(false);
  });
});

// ---------------------------------------------------------------- M2 -------------------------------------------------
describe('v0.28.0 M2 — select-all (shown results)', () => {
  it('first row, role=option, "Chọn tất cả (N)" with N = shown enabled leaves after the filter', () => {
    const el = mk('selection-only select-all', [...ROLES, { value: 'x', label: 'Khoá', disabled: true }]);
    el.open();
    const row = allRow(el);
    expect(!!row).to.equal(true);
    expect(opts(el)[0] === row, 'first option').to.equal(true);
    expect(row.getAttribute('role')).to.equal('option');
    expect(row.textContent).to.equal('Chọn tất cả (4)');
    type(el, 'u');
    expect(allRow(el).textContent).to.equal('Chọn tất cả (2)');
    type(el, 'zzz');
    expect(allRow(el)).to.equal(null); // no result → no row
  });

  it('keyboard reachable; select → every shown unselected leaf added (one change); again → shown ones removed', () => {
    const el = mk('selection-only select-all');
    el.value = ['guest'];
    const ch = spy(el, 'change');
    el.open();
    type(el, 'u'); // Quản trị, Người xem
    key(el, 'ArrowDown');
    expect(activeEl(el) === allRow(el), 'select-all row active').to.equal(true);
    key(el, 'Enter');
    expect(vals(el)).to.deep.equal(['guest', 'admin', 'viewer']);
    expect(isOpen(el)).to.equal(true);
    expect(allRow(el).textContent).to.equal('Bỏ chọn tất cả (2)');
    expect(allRow(el).getAttribute('aria-selected')).to.equal('true');
    expect(statusText(el)).to.include('2');
    expect(ch.length).to.equal(1);
    expect(ch[0].addedItems.map((i) => i.value)).to.deep.equal(['admin', 'viewer']);
    key(el, 'Enter');
    expect(vals(el)).to.deep.equal(['guest']); // only the SHOWN ones are removed
    expect(allRow(el).textContent).to.equal('Chọn tất cả (2)');
    expect(ch[1].removedItems.map((i) => i.value)).to.deep.equal(['admin', 'viewer']);
  });

  it('respects max-items (stops, announces) and skips disabled leaves', () => {
    const el = mk('selection-only select-all max-items="2"', [
      { value: 'a', label: 'A' }, { value: 'b', label: 'B', disabled: true }, { value: 'c', label: 'C' }, { value: 'd', label: 'D' },
    ]);
    el.open();
    expect(allRow(el).textContent).to.equal('Chọn tất cả (3)');
    allRow(el).click();
    expect(vals(el)).to.deep.equal(['a', 'c']);
    expect(statusText(el)).to.include('Đã đạt tối đa 2 mục');
    // full: the row now removes the shown selected ones
    expect(allRow(el).textContent).to.equal('Bỏ chọn tất cả (3)');
    allRow(el).click();
    expect(vals(el)).to.deep.equal([]);
  });

  it('select-all without selection-only → no row', () => {
    const el = mk('select-all');
    el.open();
    expect(allRow(el)).to.equal(null);
  });
});

// ---------------------------------------------------------------- M3 -------------------------------------------------
describe('v0.28.0 M3 — <select multiple> adoption', () => {
  const SELECT = '<select multiple name="cities[]" id="sel-1" required>'
    + '<optgroup label="Miền Bắc"><option value="hn" selected>Hà Nội</option><option value="hp">Hải Phòng</option></optgroup>'
    + '<optgroup label="Miền Nam" disabled><option value="hcm">TP HCM</option></optgroup>'
    + '<option value="dn" disabled>Đà Nẵng</option><option value="hue" data-description="Cố đô">Huế</option></select>';

  it('options + optgroups → groups (role=group + aria-labelledby → role=presentation header); disabled inherited', () => {
    host.innerHTML = `<form><label for="sel-1" class="ext">Thành phố</label><td-chip-input>${SELECT}</td-chip-input></form>`;
    const el = host.querySelector('td-chip-input');
    expect(el.querySelector('select')).to.equal(null);
    expect(el.hasAttribute('selection-only')).to.equal(true);
    expect(el.getAttribute('name')).to.equal('cities[]');
    expect(el.hasAttribute('required')).to.equal(true);
    expect(host.querySelector('label.ext').htmlFor).to.equal(el.id);
    expect(vals(el)).to.deep.equal(['hn']);
    expect(chipTexts(el)).to.deep.equal(['Hà Nội']);
    expect(el.options.length).to.equal(4);
    expect(el.options[0].label).to.equal('Miền Bắc');
    expect(el.options[0].options.map((o) => o.value)).to.deep.equal(['hn', 'hp']);
    expect(el.options[1].disabled).to.equal(true);
    el.open();
    const groups = [...list(el).querySelectorAll('[role="group"]')];
    expect(groups.length).to.equal(2);
    const head = document.getElementById(groups[0].getAttribute('aria-labelledby'));
    expect(head.getAttribute('role')).to.equal('presentation');
    expect(head.textContent).to.equal('Miền Bắc');
    expect([...groups[0].querySelectorAll('[role="option"]')].map((o) => o.getAttribute('data-value'))).to.deep.equal(['hn', 'hp']);
    expect(optByText(el, 'TP HCM').getAttribute('aria-disabled')).to.equal('true');
    expect(optByText(el, 'Đà Nẵng').getAttribute('aria-disabled')).to.equal('true');
    expect(optByText(el, 'Huế').querySelector('.td-chip-input__option-desc').textContent).to.equal('Cố đô');
  });

  it('filtering applies to the leaves only (a group label never matches); emptied groups are hidden', () => {
    host.innerHTML = `<td-chip-input>${SELECT}</td-chip-input>`;
    const el = host.querySelector('td-chip-input');
    el.open();
    type(el, 'Miền');
    expect(leafOpts(el).length).to.equal(0);
    type(el, 'hải');
    expect(leafOpts(el).map((o) => o.getAttribute('data-value'))).to.deep.equal(['hp']);
    expect(list(el).querySelectorAll('[role="group"]').length).to.equal(1);
    type(el, 'hue');
    expect(list(el).querySelectorAll('[role="group"]').length).to.equal(0);
    expect(leafOpts(el).map((o) => o.getAttribute('data-value'))).to.deep.equal(['hue']);
  });

  it('arrow navigation walks the enabled leaves only (headers and locked leaves skipped)', () => {
    host.innerHTML = `<td-chip-input>${SELECT}</td-chip-input>`;
    const el = host.querySelector('td-chip-input');
    const seen = [];
    for (let i = 0; i < 4; i++) {
      key(el, 'ArrowDown');
      seen.push(activeEl(el).getAttribute('data-value'));
    }
    expect(seen).to.deep.equal(['hn', 'hp', 'hue', 'hn']);
  });

  it('precedence: early property (pre-define) > host value attribute > live select state', () => {
    const e = earlyWrap.firstElementChild;
    expect(e.querySelector('select')).to.equal(null);
    expect(vals(e)).to.deep.equal(['c']);
    expect(chipTexts(e)).to.deep.equal(['C']);
    // host value attribute beats the live select state
    host.innerHTML = '<td-chip-input value=\'["b"]\'><select multiple><option value="a" selected>A</option><option value="b">B</option></select></td-chip-input>';
    const a = host.querySelector('td-chip-input');
    expect(vals(a)).to.deep.equal(['b']);
    expect(chipTexts(a)).to.deep.equal(['B']);
    // live select state (changed after parse, before connect) beats the `selected` attributes
    const wrap = document.createElement('div');
    wrap.innerHTML = '<td-chip-input name="l[]"><select multiple><option value="a" selected>A</option><option value="b">B</option><option value="c">C</option></select></td-chip-input>';
    const s = wrap.querySelector('select');
    s.options[0].selected = false;
    s.options[2].selected = true;
    s.options[1].selected = true;
    host.appendChild(wrap);
    const l = wrap.querySelector('td-chip-input');
    expect(vals(l)).to.deep.equal(['b', 'c']);
    // property set on the defined element before connect beats the attribute + select too
    const p = document.createElement('td-chip-input');
    p.setAttribute('value', '["a"]');
    p.innerHTML = '<select multiple><option value="a">A</option><option value="b" selected>B</option><option value="c">C</option></select>';
    p.value = ['c', 'a'];
    host.appendChild(p);
    expect(vals(p)).to.deep.equal(['c', 'a']);
    expect(chipTexts(p)).to.deep.equal(['C', 'A']);
    // early options property beats the select options
    const q = document.createElement('td-chip-input');
    q.innerHTML = '<select multiple><option value="a" selected>A</option></select>';
    q.options = [{ value: 'z', label: 'Z' }];
    host.appendChild(q);
    expect(q.options.map((o) => o.value)).to.deep.equal(['z']);
  });

  it('reset → the native defaults (defaultSelected), whatever the live / attribute value; no defaults → empty', () => {
    host.innerHTML = '<form><td-chip-input name="r[]" value=\'["b"]\'><select multiple><option value="a" selected>A</option>'
      + '<option value="b">B</option><option value="c" selected>C</option></select></td-chip-input>'
      + '<td-chip-input name="n[]"><select multiple><option value="x">X</option></select></td-chip-input></form>';
    const [r, n] = host.querySelectorAll('td-chip-input');
    expect(vals(r)).to.deep.equal(['b']);
    n.value = ['x'];
    host.querySelector('form').reset();
    expect(vals(r)).to.deep.equal(['a', 'c']);
    expect(chipTexts(r)).to.deep.equal(['A', 'C']);
    expect(vals(n)).to.deep.equal([]);
  });

  it('select attributes: disabled / aria-label lifted; a host attribute wins; a single <select> is left alone', () => {
    host.innerHTML = '<td-chip-input name="own"><select multiple name="sel" disabled aria-label="Nhãn"><option value="a">A</option></select></td-chip-input>';
    const el = host.querySelector('td-chip-input');
    expect(el.getAttribute('name')).to.equal('own');
    expect(el.hasAttribute('disabled')).to.equal(true);
    expect(inp(el).getAttribute('aria-label')).to.equal('Nhãn');
    // a selected but disabled option (itself / its optgroup) is not a value — exactly like the native submission
    host.innerHTML = '<form><td-chip-input><select multiple name="z[]"><option value="a" selected disabled>A</option>'
      + '<optgroup label="G" disabled><option value="b" selected>B</option></optgroup><option value="c" selected>C</option>'
      + '</select></td-chip-input></form>';
    const z = host.querySelector('td-chip-input');
    expect(vals(z)).to.deep.equal(['c']);
    host.querySelector('form').reset();
    expect(vals(z)).to.deep.equal(['c']);
    host.innerHTML = '<td-chip-input><select name="one"><option value="a">A</option></select></td-chip-input>';
    const s = host.querySelector('td-chip-input');
    expect(s.hasAttribute('selection-only')).to.equal(false);
    expect(s.options).to.deep.equal([]);
  });
});

// ---------------------------------------------------------------- M4 -------------------------------------------------
describe('v0.28.0 M4 — form submission', () => {
  it('one FormData entry per selected value, in selection order, the name verbatim (roles[]); none → no entry', () => {
    host.innerHTML = '<form></form>';
    const form = host.firstElementChild;
    const el = mk('selection-only name="roles[]"', ROLES, form);
    expect(entries(form)).to.deep.equal([]);
    el.open();
    optByText(el, 'Khách').click();
    optByText(el, 'Quản trị').click();
    optByText(el, 'Biên tập').click();
    expect(entries(form)).to.deep.equal([['roles[]', 'guest'], ['roles[]', 'admin'], ['roles[]', 'editor']]);
    optByText(el, 'Quản trị').click();
    expect(entries(form)).to.deep.equal([['roles[]', 'guest'], ['roles[]', 'editor']]);
  });

  it('required → valueMissing while empty; reset → the value attribute default', () => {
    host.innerHTML = '<form></form>';
    const form = host.firstElementChild;
    const el = mk('selection-only required name="t" value=\'["viewer"]\'', ROLES, form);
    expect(vals(el)).to.deep.equal(['viewer']);
    expect(chipTexts(el)).to.deep.equal(['Người xem']);
    expect(el.validity.valueMissing).to.equal(false);
    el.open();
    optByText(el, 'Người xem').click();
    expect(el.validity.valueMissing).to.equal(true);
    expect(form.checkValidity()).to.equal(false);
    optByText(el, 'Khách').click();
    form.reset();
    expect(vals(el)).to.deep.equal(['viewer']);
    expect(entries(form)).to.deep.equal([['t', 'viewer']]);
  });
});

describe('v0.28.0 — static API', () => {
  it('labels for the new texts; SSR schema 1', () => {
    expect(TdChipInput.SSR_SCHEMA).to.equal(1);
    expect(TdChipInput.labels.selectAll).to.equal('Chọn tất cả ({n})');
    expect(TdChipInput.labels.deselectAll).to.equal('Bỏ chọn tất cả ({n})');
  });
});
