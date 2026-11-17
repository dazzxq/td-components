import { expect } from '@esm-bundle/chai';

// v0.117.0 (plan v0.117.0-dcms2-create-row-minsize QĐ1) — td-chip-input allow-create + create-label: free typing still
// makes a chip, and a pinned external row emits `create` only. Chromium, Firefox AND WebKit.
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
const LABEL = 'Tạo bút danh “{text}”';
function mk(attrs = `allow-create create-label='${LABEL}'`, options = NAMES) {
  host.insertAdjacentHTML('beforeend', `<td-chip-input aria-label="Bút danh" ${attrs}></td-chip-input>`);
  const el = host.lastElementChild;
  if (options) el.options = options.map((o) => ({ ...o }));
  return el;
}
const inp = (el) => el.querySelector('.td-chip-input__input');
const list = (el) => el._menuElement.querySelector('[role="listbox"]');
const opts = (el) => [...el._menuElement.querySelectorAll('[role="option"]')];
const themRow = (el) => el._menuElement.querySelector('.td-chip-input__option--create:not(.td-chip-input__option--external)');
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

describe('td-chip-input allow-create + create-label (v0.117.0)', () => {
  it('attribute matrix: the external row needs allow-create AND a non-empty create-label', async () => {
    const cases = [
      ['', false, false],
      ['allow-create', true, false],
      [`create-label='${LABEL}'`, false, false],
      [`allow-create create-label='${LABEL}'`, true, true],
      [`allow-create create-label=''`, true, false],
    ];
    for (const [attrs, them, ext] of cases) {
      captureWarn();
      const el = mk(attrs);
      inp(el).focus();
      await type(el, 'Lê Dung');
      expect(!!themRow(el), `Thêm row for "${attrs}"`).to.equal(them);
      expect(!!extRow(el), `external row for "${attrs}"`).to.equal(ext);
      host.replaceChildren();
    }
  });

  it('rows: Thêm row first, external row last; label interpolates every {text}, a label without {text} is literal', async () => {
    const el = mk(`allow-create create-label='Tạo “{text}” — {text}'`);
    inp(el).focus();
    await type(el, '  Lê   Dung ');
    const rows = opts(el);
    expect(rows.length).to.equal(2);
    expect(rows[0] === themRow(el)).to.equal(true);
    expect(rows[1] === extRow(el)).to.equal(true);
    expect(rowText(themRow(el))).to.equal('Thêm “Lê Dung”');
    expect(rowText(extRow(el))).to.equal('Tạo “Lê Dung” — Lê Dung');
    expect(extRow(el).id).to.equal(`${el.id}-opt-external`);
    expect(themRow(el).id).to.equal(`${el.id}-opt-create`);
    expect(extRow(el).getAttribute('role')).to.equal('option');
    const lit = mk(`allow-create create-label="Tạo mới"`);
    inp(lit).focus();
    await type(lit, 'Lê Dung');
    expect(rowText(extRow(lit))).to.equal('Tạo mới');
  });

  it('escaping: quotes, <, & and Unicode are text, never HTML (also a literal {text} typed by the user)', async () => {
    const el = mk(`allow-create create-label='Tạo "{text}"'`);
    inp(el).focus();
    await type(el, `<b>"x" & {text} đ</b>`);
    const label = extRow(el).querySelector('.td-chip-input__option-label');
    expect(label.textContent).to.equal('Tạo "<b>"x" & {text} đ</b>"');
    expect(label.querySelector('b')).to.equal(null);
  });

  it('Enter with no active row still makes a plain chip; no create event', async () => {
    const el = mk();
    const created = spy(el, 'create');
    inp(el).focus();
    await type(el, 'Lê Dung');
    expect(inp(el).getAttribute('aria-activedescendant')).to.equal(null);
    key(el, 'Enter');
    await frame();
    expect(el.getValue().map((i) => i.label)).to.deep.equal(['Lê Dung']);
    expect(created.length).to.equal(0);
  });

  it('typing never activates a row; ArrowDown reaches both; Enter on the external row = one create, no chip / change / hook', async () => {
    const el = mk();
    let hook = 0;
    el.create = () => { hook += 1; return null; };
    const created = spy(el, 'create');
    const changes = spy(el, 'change');
    inp(el).focus();
    await type(el, 'Lê Dung');
    expect(opts(el).some((o) => o.getAttribute('aria-selected') === 'true')).to.equal(false);
    key(el, 'ArrowDown');
    expect(opts(el)[0].getAttribute('aria-selected')).to.equal('true');
    expect(inp(el).getAttribute('aria-activedescendant')).to.equal(themRow(el).id);
    key(el, 'ArrowDown');
    expect(extRow(el).getAttribute('aria-selected')).to.equal('true');
    expect(inp(el).getAttribute('aria-activedescendant')).to.equal(extRow(el).id);
    key(el, 'Enter');
    await frame();
    expect(created).to.deep.equal([{ query: 'Lê Dung' }]);
    expect(changes.length).to.equal(0);
    expect(hook).to.equal(0);
    expect(el.getValue()).to.deep.equal([]);
    expect(isOpen(el)).to.equal(false);
    expect(inp(el).value).to.equal('');
  });

  it('the Thêm row still goes through the create(text) hook', async () => {
    const el = mk();
    const hooked = [];
    el.create = (t) => { hooked.push(t); return { value: `n-${t}`, label: t }; };
    const created = spy(el, 'create');
    inp(el).focus();
    await type(el, 'Lê Dung');
    themRow(el).click();
    await frame();
    await frame();
    expect(hooked).to.deep.equal(['Lê Dung']);
    expect(created.length).to.equal(0);
    expect(el.getValue().length).to.equal(1);
  });

  it('click: one create, no chip, the mouse press keeps focus in the input', async () => {
    const el = mk();
    const created = spy(el, 'create');
    const changes = spy(el, 'change');
    inp(el).focus();
    await type(el, 'Lê Dung');
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    extRow(el).dispatchEvent(down);
    expect(down.defaultPrevented).to.equal(true);
    extRow(el).click();
    expect(created).to.deep.equal([{ query: 'Lê Dung' }]);
    expect(changes.length).to.equal(0);
    expect(el.getValue()).to.deep.equal([]);
    expect(document.activeElement === inp(el)).to.equal(true);
  });

  it('visibility: an exact folded label / value match or a selected chip hides both rows; a partial match shows both', async () => {
    const el = mk();
    inp(el).focus();
    await type(el, 'nguyen van an');
    expect(!!themRow(el) || !!extRow(el)).to.equal(false);
    await type(el, 'bi');
    expect(!!themRow(el) && !!extRow(el)).to.equal(true);
    await type(el, 'Nguyễn Văn');
    expect(!!themRow(el) && !!extRow(el)).to.equal(true);
    el.addItem({ value: 'z', label: 'Lê Dung' });
    await type(el, 'le dung');
    expect(!!themRow(el) || !!extRow(el)).to.equal(false);
  });

  it('an empty query (also with show-on-focus) shows no action row', async () => {
    const el = mk(`allow-create create-label='${LABEL}' show-on-focus min-chars="0"`);
    inp(el).focus();
    await frame();
    el.open();
    await frame();
    expect(opts(el).length).to.equal(3);
    expect(!!themRow(el) || !!extRow(el)).to.equal(false);
  });

  it('full / disabled: no rows, no create', async () => {
    const full = mk(`allow-create create-label='${LABEL}' max-items="1"`);
    full.addItem({ value: 'z', label: 'Lê Dung' });
    inp(full).focus();
    await type(full, 'Hoàng');
    expect(!!themRow(full) || !!extRow(full)).to.equal(false);
    const off = mk(`allow-create create-label='${LABEL}' disabled`);
    const created = spy(off, 'create');
    off.open();
    expect(created.length).to.equal(0);
  });

  it('IME composition: Enter does nothing', async () => {
    const el = mk();
    const created = spy(el, 'create');
    inp(el).focus();
    await type(el, 'Lê Dung');
    key(el, 'ArrowDown');
    key(el, 'ArrowDown');
    key(el, 'Enter', { isComposing: true });
    expect(created.length).to.equal(0);
    expect(isOpen(el)).to.equal(true);
  });

  it('async search: a stale result never brings back a suppressed row', async () => {
    const el = mk(`allow-create create-label='${LABEL}'`, null);
    const resolvers = [];
    el.search = () => new Promise((res) => { resolvers.push(res); });
    inp(el).focus();
    await type(el, 'Lê Dung');
    await new Promise((r) => setTimeout(r, 400));
    expect(resolvers.length >= 1).to.equal(true);
    el.addItem({ value: 'z', label: 'Lê Dung' });
    resolvers.forEach((r) => r([]));
    await frame();
    await frame();
    expect(!!themRow(el) || !!extRow(el)).to.equal(false);
  });

  it('pinned look: the external row is the last option, sticky, with the dropdown create ink', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ value: `r${i}`, label: `Nguyễn ${i}` }));
    const el = mk(undefined, many);
    inp(el).focus();
    await type(el, 'Nguyễn');
    expect(list(el).hasAttribute('data-create-row')).to.equal(true);
    expect(getComputedStyle(extRow(el)).position).to.equal('sticky');
    expect(getComputedStyle(themRow(el)).position).to.not.equal('sticky');
  });

  it('selection-only keeps 0.87.0: literal create-label with no / empty query, labels.create without {text} in the label', async () => {
    const warns = captureWarn();
    const el = mk(`selection-only create-label="Tạo vai trò mới" allow-create`);
    inp(el).focus();
    el.open();
    expect(rowText(el._menuElement.querySelector('.td-chip-input__option--create'))).to.equal('Tạo vai trò mới');
    await type(el, 'Kế toán');
    expect(rowText(el._menuElement.querySelector('.td-chip-input__option--create'))).to.equal('Thêm “Kế toán”');
    expect(warns.filter((w) => w.includes('allow-create is ignored')).length).to.equal(1);
  });

  it('selection-only + {text} in the label: interpolated with a query, literal create-label when empty', async () => {
    const el = mk(`selection-only create-label='${LABEL}'`);
    inp(el).focus();
    el.open();
    const row = () => el._menuElement.querySelector('.td-chip-input__option--create');
    expect(rowText(row())).to.equal(LABEL);
    await type(el, 'Kế toán');
    expect(rowText(row())).to.equal('Tạo bút danh “Kế toán”');
    const created = spy(el, 'create');
    row().click();
    expect(created).to.deep.equal([{ query: 'Kế toán' }]);
  });

  it('create-label without allow-create / selection-only warns once with the new text and shows nothing', async () => {
    const warns = captureWarn();
    const el = mk(`create-label='${LABEL}'`);
    inp(el).focus();
    await type(el, 'Lê Dung');
    expect(!!extRow(el)).to.equal(false);
    const w = warns.filter((m) => m.includes('create-label'));
    expect(w.length).to.equal(1);
    expect(w[0]).to.contain('selection-only or allow-create');
  });
  it('local option value not in its label: typing the exact value shows no create rows (Thêm and external)', async () => {
    const el = mk(undefined, [{ value: 'tg-01', label: 'Nguyễn An' }]);
    inp(el).focus();
    await type(el, 'tg-01');
    expect(!!themRow(el) || !!extRow(el)).to.equal(false);
    await type(el, 'TG-0');
    expect(!!themRow(el) && !!extRow(el)).to.equal(true);
  });

  it('remote search: the old rows are dropped as soon as the input changes; a stale row emits nothing', async () => {
    const el = mk(undefined, null);
    el.search = async () => [];
    const created = spy(el, 'create');
    const changes = spy(el, 'change');
    inp(el).focus();
    await type(el, 'Lê Dung');
    await new Promise((r) => setTimeout(r, 450));
    const oldExt = extRow(el);
    const oldThem = themRow(el);
    expect(!!oldExt && !!oldThem).to.equal(true);
    await type(el, 'Lê Dũng B');
    expect(!!themRow(el) || !!extRow(el)).to.equal(false);
    // a stale row (text differs from the current query) does nothing, even if it is still reachable
    el._commit({ ext: 'Lê Dung' });
    el._commit({ create: 'Lê Dung' });
    expect(created.length).to.equal(0);
    expect(changes.length).to.equal(0);
    expect(el.getValue()).to.deep.equal([]);
    oldExt.click();
    key(el, 'Enter');
    await frame();
    expect(created.length).to.equal(0);
  });

  it('remote search: a row whose text still equals the query works; a changed input without a re-render does not', async () => {
    const el = mk(undefined, null);
    el.search = async () => [];
    const created = spy(el, 'create');
    inp(el).focus();
    await type(el, 'Lê Dung');
    await new Promise((r) => setTimeout(r, 450));
    inp(el).value = 'Khác hẳn'; // no input event: the shown rows are stale
    extRow(el).click();
    expect(created.length).to.equal(0);
    inp(el).value = 'Lê Dung';
    extRow(el).click();
    expect(created).to.deep.equal([{ query: 'Lê Dung' }]);
  });
  it('removing allow-create while open drops the create rows; a kept reference does nothing', async () => {
    const el = mk();
    const created = spy(el, 'create');
    const changes = spy(el, 'change');
    inp(el).focus();
    await type(el, 'Lê Dung');
    const ext = extRow(el);
    const them = themRow(el);
    expect(ext).to.exist;
    el.removeAttribute('allow-create');
    await frame();
    expect(isOpen(el)).to.equal(false);
    ext.click();
    them.click();
    el._commit({ ext: 'Lê Dung' });
    el._commit({ create: 'Lê Dung' });
    expect(created.length).to.equal(0);
    expect(changes.length).to.equal(0);
    expect(el.value.length).to.equal(0);
  });
});
