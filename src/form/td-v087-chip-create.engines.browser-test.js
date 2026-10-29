import { expect } from '@esm-bundle/chai';

// v0.87.0 (plan docs/internal/plans/v0.87.0-p3-tiles-chip-create-render-option.md B) — td-chip-input selection-only +
// create-label: the pinned create row, in Chromium, Firefox AND WebKit.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { TdChipInput } = await import('./td-chip-input.js');

const host = document.createElement('div');
document.body.appendChild(host);
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
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
];
function mk(attrs = 'selection-only create-label="Tạo vai trò mới"', options = ROLES, parent = host) {
  parent.insertAdjacentHTML('beforeend', `<td-chip-input aria-label="Vai trò" ${attrs}></td-chip-input>`);
  const el = parent.lastElementChild;
  if (options) el.options = options.map((o) => ({ ...o }));
  return el;
}
const inp = (el) => el.querySelector('.td-chip-input__input');
const list = (el) => el._menuElement.querySelector('[role="listbox"]');
const opts = (el) => [...el._menuElement.querySelectorAll('[role="option"]')];
const createRow = (el) => el._menuElement.querySelector('.td-chip-input__option--create');
const activeEl = (el) => el._menuElement.querySelector('[role="option"][data-active]');
const isOpen = (el) => !el._menuElement.hidden;
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
function captureWarn() {
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.map(String).join(' '));
  cleanup.push(() => { console.warn = orig; });
  return warns;
}

describe('td-chip-input selection-only create-label (v0.87.0)', () => {
  it('the create row is the last option: plus icon, create-label text, no check mark, never selected / locked', () => {
    const el = mk();
    el.open();
    const rows = opts(el);
    const row = createRow(el);
    expect(rows[rows.length - 1] === row).to.equal(true);
    expect(row.id).to.equal(`${el.id}-opt-create`);
    expect(row.getAttribute('aria-selected')).to.equal('false');
    expect(row.hasAttribute('aria-disabled')).to.equal(false);
    expect(row.querySelector('.td-chip-input__option-label').textContent).to.equal('Tạo vai trò mới');
    expect(!!row.querySelector('.td-chip-input__create-icon svg')).to.equal(true);
    expect(row.querySelector('.td-chip-input__check')).to.equal(null);
    expect(list(el).hasAttribute('data-create-row')).to.equal(true);
    const plain = mk('selection-only');
    plain.open();
    expect(list(plain).hasAttribute('data-create-row')).to.equal(false);
    expect(getComputedStyle(list(plain)).scrollPaddingBottom).to.be.oneOf(['auto', '0px']);
  });

  it('typed text: "Thêm “{text}”" (text node, cleaned); 0 results keeps the row + "no results"; no options keeps it too', async () => {
    const el = mk();
    el.open();
    type(el, '  <b>Kế   toán</b> ');
    await frame();
    expect(isOpen(el)).to.equal(true);
    const label = createRow(el).querySelector('.td-chip-input__option-label');
    expect(label.textContent).to.equal('Thêm “<b>Kế toán</b>”');
    expect(label.querySelector('b')).to.equal(null);
    expect(opts(el).length).to.equal(1);
    const bare = mk('selection-only create-label="Tạo mới"', []);
    bare.open();
    expect(isOpen(bare)).to.equal(true);
    expect(opts(bare).length).to.equal(1);
  });

  it('keyboard: ArrowUp from the first row wraps to it; End in the input does not move the highlight', async () => {
    const el = mk();
    inp(el).focus();
    el.open();
    key(el, 'ArrowDown');
    expect(activeEl(el)?.getAttribute('data-value')).to.equal('admin');
    key(el, 'End');
    expect(activeEl(el)?.getAttribute('data-value')).to.equal('admin');
    key(el, 'ArrowUp');
    expect(activeEl(el) === createRow(el)).to.equal(true);
    expect(inp(el).getAttribute('aria-activedescendant')).to.equal(createRow(el).id);
  });

  it('Enter on it: popup closes, the filter is cleared, focus stays in the input, create { query } — no change', async () => {
    const el = mk();
    const created = spy(el, 'create');
    const changes = spy(el, 'change');
    inp(el).focus();
    el.open();
    type(el, 'Kế toán');
    await frame();
    key(el, 'ArrowUp');
    expect(activeEl(el) === createRow(el)).to.equal(true);
    key(el, 'Enter');
    expect(created).to.deep.equal([{ query: 'Kế toán' }]);
    expect(changes.length).to.equal(0);
    expect(isOpen(el)).to.equal(false);
    expect(inp(el).value).to.equal('');
    expect(document.activeElement === inp(el)).to.equal(true);
    expect(el.getValue()).to.deep.equal([]);
  });

  it('click with no text → { query: "" }; a full list (max-items) still runs it', () => {
    const el = mk('selection-only create-label="Tạo mới" max-items="1"');
    el.value = ['admin'];
    const created = spy(el, 'create');
    el.open();
    createRow(el).click();
    expect(created).to.deep.equal([{ query: '' }]);
  });

  it('pinned: a long list scrolled to the middle keeps the create row inside the list box; the last active row is not hidden', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ value: `r${i}`, label: `Vai trò ${i}` }));
    const el = mk(undefined, many);
    inp(el).focus();
    el.open();
    await frame();
    const lb = list(el);
    expect(lb.scrollHeight > lb.clientHeight).to.equal(true);
    for (const top of [lb.scrollHeight / 2, lb.scrollHeight]) {
      lb.scrollTop = top;
      await frame();
      const a = lb.getBoundingClientRect();
      const r = createRow(el).getBoundingClientRect();
      expect(r.top >= a.top - 1 && r.bottom <= a.bottom + 1).to.equal(true);
    }
    lb.scrollTop = 0;
    key(el, 'ArrowUp'); // → create row
    key(el, 'ArrowUp'); // → the last option
    await frame();
    const last = activeEl(el).getBoundingClientRect();
    const pin = createRow(el).getBoundingClientRect();
    expect(last.bottom <= pin.top + 1).to.equal(true);
  });

  it('without selection-only: no row + one warning; removing the attribute drops the row; createLabel mirrors it', () => {
    const warns = captureWarn();
    const plain = mk('create-label="Tạo mới"');
    plain.setAttribute('create-label', 'Khác');
    expect(warns.filter((m) => m.includes('create-label applies only with selection-only')).length).to.equal(1);
    const el = mk();
    expect(el.createLabel).to.equal('Tạo vai trò mới');
    el.createLabel = '';
    expect(el.hasAttribute('create-label')).to.equal(false);
    el.open();
    expect(createRow(el)).to.equal(null);
    expect(customElements.get('td-chip-input')).to.equal(TdChipInput);
  });
});
