import { expect } from '@esm-bundle/chai';

// v0.127.0 (plan v0.127.0-chip-input-empty-action) — td-chip-input create-empty-label: a pinned action row on an empty
// query (show-on-focus) emitting `create` { query: '' }. Chromium, Firefox AND WebKit.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

await import('./td-chip-input.js');

const host = document.createElement('div');
document.body.appendChild(host);
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
let cleanup = [];
afterEach(() => {
  cleanup.forEach((f) => f());
  cleanup = [];
  host.replaceChildren();
});

const NAMES = [
  { value: 'a', label: 'Nguyễn Văn An' },
  { value: 'b', label: 'Nguyễn Thị Bình' },
  { value: 'c', label: 'Trần Cường' },
];
function mk(attrs = `show-on-focus create-empty-label="Tạo bút danh mới"`, options = NAMES) {
  host.insertAdjacentHTML('beforeend', `<td-chip-input aria-label="Bút danh" ${attrs}></td-chip-input>`);
  const el = host.lastElementChild;
  if (options) el.options = options.map((o) => ({ ...o }));
  return el;
}
const inp = (el) => el.querySelector('.td-chip-input__input');
const list = (el) => el._menuElement.querySelector('[role="listbox"]');
const opts = (el) => [...el._menuElement.querySelectorAll('[role="option"]')];
const extRow = (el) => el._menuElement.querySelector('.td-chip-input__option--external');
const isOpen = (el) => !el._menuElement.hidden;
const key = (el, k, o = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o });
  inp(el).dispatchEvent(e);
  return e;
};
const type = async (el, text) => {
  inp(el).value = text;
  inp(el).dispatchEvent(new Event('input', { bubbles: true }));
  await frame();
};
function spy(el, name) {
  const out = [];
  el.addEventListener(name, (e) => { if (e instanceof CustomEvent) out.push(e.detail); });
  return out;
}
function captureWarn() {
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.map(String).join(' '));
  cleanup.push(() => { console.warn = orig; });
  return warns;
}


const rowText = (row) => (row.querySelector('.td-chip-input__option-label') || row).textContent;
const actRow = (el) => el._menuElement.querySelector('.td-chip-input__option--external');
const LAB = 'Tạo bút danh mới';
const focusOpen = async (el) => { inp(el).focus(); await frame(); await frame(); };

describe('td-chip-input create-empty-label (v0.127.0)', () => {
  it('focus (show-on-focus) lists the options plus the pinned action row last', async () => {
    const el = mk();
    await focusOpen(el);
    expect(isOpen(el)).to.equal(true);
    const rows = opts(el);
    expect(rows.length).to.equal(NAMES.length + 1);
    const row = actRow(el);
    expect(rows[rows.length - 1] === row).to.equal(true);
    expect(row.className).to.equal('td-chip-input__option td-chip-input__option--create td-chip-input__option--external');
    expect(row.getAttribute('role')).to.equal('option');
    expect(row.id).to.equal(`${el.id}-opt-external`);
    expect(rowText(row)).to.equal(LAB);
    expect(row.querySelector('[data-td-icon="plus"]') !== null).to.equal(true);
    expect(list(el).hasAttribute('data-create-row')).to.equal(true);
  });

  it('Enter on the active row: one create { query: "" }, popup closed, no value change, no change event', async () => {
    const el = mk();
    const created = spy(el, 'create');
    const changes = spy(el, 'change');
    await focusOpen(el);
    key(el, 'ArrowUp');
    expect(actRow(el).getAttribute('aria-selected')).to.equal('true');
    expect(inp(el).getAttribute('aria-activedescendant')).to.equal(actRow(el).id);
    key(el, 'Enter');
    await frame();
    expect(created).to.deep.equal([{ query: '' }]);
    expect(changes.length).to.equal(0);
    expect(el.getValue()).to.deep.equal([]);
    expect(isOpen(el)).to.equal(false);
  });

  it('click on the row: same', async () => {
    const el = mk();
    const created = spy(el, 'create');
    const changes = spy(el, 'change');
    await focusOpen(el);
    actRow(el).click();
    await frame();
    expect(created).to.deep.equal([{ query: '' }]);
    expect(changes.length).to.equal(0);
    expect(el.getValue()).to.deep.equal([]);
    expect(isOpen(el)).to.equal(false);
  });

  it('typing removes the row; allow-create + create-label rows stay as before', async () => {
    const el = mk(`show-on-focus allow-create create-label='Tạo “{text}”' create-empty-label="${LAB}"`);
    await focusOpen(el);
    expect(rowText(actRow(el))).to.equal(LAB);
    await type(el, 'Lê Dung');
    const rows = opts(el);
    expect(rows.map((r) => rowText(r))).to.deep.equal(['Thêm “Lê Dung”', 'Tạo “Lê Dung”']);
    await type(el, '');
    expect(isOpen(el)).to.equal(false); // min-chars 1: clearing the text closes the list (unchanged)
    inp(el).blur();
    await focusOpen(el);
    expect(rowText(actRow(el))).to.equal(LAB);
  });

  it('typed text filters: no action row while a filter is typed', async () => {
    const el = mk();
    await focusOpen(el);
    await type(el, 'Trần');
    expect(actRow(el)).to.equal(null);
  });

  it('full (max-items) → no row; no attribute → no row; selection-only → ignored', async () => {
    const full = mk(`show-on-focus max-items="1" create-empty-label="${LAB}"`);
    full.setValue([{ value: 'a', label: 'Nguyễn Văn An' }]);
    inp(full).focus();
    await frame(); await frame();
    expect(actRow(full)).to.equal(null);
    host.replaceChildren();
    const none = mk('show-on-focus');
    await focusOpen(none);
    expect(actRow(none)).to.equal(null);
    expect(opts(none).length).to.equal(NAMES.length);
    host.replaceChildren();
    const sel = mk(`selection-only show-on-focus create-empty-label="${LAB}"`);
    await focusOpen(sel);
    expect(actRow(sel)).to.equal(null);
  });

  it('no suggestions: the popup holds only the action row, no "no results"', async () => {
    const el = mk(undefined, []);
    await focusOpen(el);
    expect(isOpen(el)).to.equal(true);
    expect(opts(el).length).to.equal(1);
    expect(actRow(el) !== null).to.equal(true);
    expect(el._menuElement.querySelector('.td-chip-input__empty').getAttribute('data-kind')).to.equal(null);
  });

  it('changing / removing the attribute while open closes the popup', async () => {
    const el = mk();
    await focusOpen(el);
    el.setAttribute('create-empty-label', 'Khác');
    expect(isOpen(el)).to.equal(false);
    await focusOpen(el);
    inp(el).blur();
    inp(el).focus();
    await frame(); await frame();
    if (!isOpen(el)) { await type(el, ''); }
    expect(rowText(actRow(el))).to.equal('Khác');
    el.removeAttribute('create-empty-label');
    expect(isOpen(el)).to.equal(false);
  });

  it('createEmptyLabel property mirrors the attribute', () => {
    const el = mk('');
    expect(el.createEmptyLabel).to.equal('');
    el.createEmptyLabel = 'Tạo mới';
    expect(el.getAttribute('create-empty-label')).to.equal('Tạo mới');
    expect(el.createEmptyLabel).to.equal('Tạo mới');
    el.createEmptyLabel = '';
    expect(el.hasAttribute('create-empty-label')).to.equal(false);
  });
});
