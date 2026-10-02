import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import { TdDropdown } from './td-dropdown.js';
import { TdModal } from '../feedback/td-modal.js';
import { hasActiveAbove, LAYERS } from '../utils/layers.js';

// v0.22.0 (plan docs/internal/plans/v0.22.0-dropdown-create.md): `create-label` → a fixed action row at the bottom of
// the menu that fires `create` { query } — never a value.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

document.addEventListener('submit', (e) => e.preventDefault(), true);
const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html, parent = host) => { parent.insertAdjacentHTML('beforeend', html.trim()); return parent.lastElementChild; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (n = 2) => new Promise((r) => {
  const f = () => (--n <= 0 ? r() : requestAnimationFrame(f));
  requestAnimationFrame(f);
});
/** never hand DOM elements to chai deep asserts (it hangs inspecting them) */
const same = (a, b) => a === b;
const center = (el) => {
  const r = el.getBoundingClientRect();
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
};
const FILMS = [
  { value: 'k', label: 'Kodak Gold' },
  { value: 'f', label: 'Fuji C200' },
  { value: 'i', label: 'Ilford HP5' },
];
const trig = (el) => el.querySelector('.td-dropdown__trigger');
const list = (el) => el._menuElement.querySelector('[role="listbox"]');
const createRow = (el) => el._menuElement.querySelector('.td-dropdown__option--create');
const activeRow = (el) => el._menuElement.querySelector('[data-active]');
const search = (el) => el._menuElement.querySelector('.td-dropdown__search');
function dd(attrs = 'create-label="Thêm film mới"', parent = host, options = FILMS) {
  const el = mount(`<td-dropdown ${attrs}></td-dropdown>`, parent);
  el.options = options.map((o) => ({ ...o }));
  return el;
}
function typeInSearch(el, text) {
  const s = search(el);
  s.value = text;
  s.dispatchEvent(new Event('input', { bubbles: true }));
}
function record(el) {
  const rec = { create: [], change: 0, onCreate: [] };
  el.addEventListener('create', (e) => rec.create.push(e.detail));
  el.addEventListener('change', () => { rec.change++; });
  el.onCreate = (q) => rec.onCreate.push(q);
  return rec;
}

const origLabels = { ...TdDropdown.labels };
afterEach(async () => {
  TdModal.closeAll();
  document.querySelectorAll('td-dropdown').forEach((d) => d.close && d.close());
  host.innerHTML = '';
  Object.assign(TdDropdown.labels, origLabels);
  delete TdDropdown.labels.__x;
  await resetMouse();
  await wait(50);
});

describe('v0.22.0 — create row: rendering', () => {
  it('is the last direct child of the listbox, outside the scroller, with option semantics', () => {
    const el = dd('id="fd" create-label="Thêm film mới"');
    el.open();
    const row = createRow(el);
    expect(row, 'create row rendered').to.not.equal(null);
    expect(same(row.parentElement, list(el)), 'direct child of the listbox').to.equal(true);
    expect(same(list(el).lastElementChild, row), 'last child').to.equal(true);
    const scroller = list(el).querySelector('.td-dropdown__scroller');
    expect(scroller.getAttribute('role')).to.equal('presentation');
    expect(scroller.contains(row)).to.equal(false);
    expect(scroller.querySelectorAll('[role="option"]').length).to.equal(3);
    expect(row.getAttribute('role')).to.equal('option');
    expect(row.getAttribute('aria-selected')).to.equal('false');
    expect(row.hasAttribute('aria-disabled')).to.equal(false);
    expect(row.id).to.equal('fd-opt-create');
    expect(row.textContent).to.equal('Thêm film mới');
    expect(row.querySelector('[data-td-icon="plus"] svg'), 'plus registry icon').to.not.equal(null);
    expect(row.hasAttribute('data-value')).to.equal(false);
  });

  it('no create-label → no row; removing the attribute removes it; createLabel property reflects', () => {
    const el = dd('');
    el.open();
    expect(createRow(el)).to.equal(null);
    el.close();
    el.createLabel = 'Thêm mới';
    expect(el.getAttribute('create-label')).to.equal('Thêm mới');
    el.open();
    expect(createRow(el).textContent).to.equal('Thêm mới');
    el.close();
    el.removeAttribute('create-label');
    el.open();
    expect(createRow(el)).to.equal(null);
    expect(el.createLabel).to.equal('');
  });

  it('is never filtered; the label follows the trimmed query (rendered as text) and back', () => {
    const el = dd();
    el.open();
    typeInSearch(el, 'zzz-no-match');
    expect(createRow(el), 'still there with no result').to.not.equal(null);
    expect(createRow(el).textContent).to.equal('Thêm “zzz-no-match”');
    typeInSearch(el, '  <img src=x onerror="window.__xss=1">  ');
    expect(createRow(el).textContent).to.equal('Thêm “<img src=x onerror="window.__xss=1">”');
    expect(createRow(el).querySelector('img')).to.equal(null);
    expect(window.__xss).to.equal(undefined);
    typeInSearch(el, '   ');
    expect(createRow(el).textContent).to.equal('Thêm film mới');
  });

  it('TdDropdown.labels.createWithQuery is translatable ({query} placeholder, $ patterns kept literally)', () => {
    TdDropdown.labels.createWithQuery = 'Add “{query}” now';
    const el = dd();
    el.open();
    typeInSearch(el, "$& $' kodak");
    expect(createRow(el).textContent).to.equal("Add “$& $' kodak” now");
  });

  it('empty option list still shows the row (with the no-results status above the listbox)', () => {
    const el = dd(undefined, host, []);
    el.open();
    expect(createRow(el)).to.not.equal(null);
    const empty = el._menuElement.querySelector('.td-dropdown__empty');
    expect(empty.textContent).to.equal(TdDropdown.labels.noResults);
    expect(empty.closest('[role="listbox"]')).to.equal(null);
    expect(empty.compareDocumentPosition(list(el)) & Node.DOCUMENT_POSITION_FOLLOWING, 'status before the listbox')
      .to.not.equal(0);
  });
});

describe('v0.22.0 — create row: activation', () => {
  it('click → snapshot query, close, focus trigger, onCreate then create; no value / change / FormData / validity change', async () => {
    const form = mount('<form><td-dropdown name="film" required create-label="Thêm film mới"></td-dropdown></form>');
    const el = form.querySelector('td-dropdown');
    el.options = FILMS.map((o) => ({ ...o }));
    const order = [];
    el.onCreate = (q) => order.push(['onCreate', q, el._isOpen, same(document.activeElement, trig(el))]);
    el.addEventListener('create', (e) => order.push(['create', e.detail.query, e.bubbles, e.composed]));
    let changes = 0;
    el.addEventListener('change', () => { changes++; });
    trig(el).click();
    await wait(150);
    typeInSearch(el, '  Phim Ảnh XYZ  ');
    createRow(el).click();
    expect(order).to.deep.equal([
      ['onCreate', 'Phim Ảnh XYZ', false, true],
      ['create', 'Phim Ảnh XYZ', true, true],
    ]);
    expect(changes).to.equal(0);
    expect(el._isOpen).to.equal(false);
    expect(same(document.activeElement, trig(el))).to.equal(true);
    expect(el.getValue()).to.equal(null);
    expect([...new FormData(form).entries()]).to.deep.equal([]);
    expect(el.validity.valueMissing).to.equal(true);
  });

  it('keeps an existing selection untouched; query is "" without a search box', async () => {
    const el = dd('searchable="false" value="f" create-label="Thêm"');
    const rec = record(el);
    el.open();
    createRow(el).click();
    expect(rec.create).to.deep.equal([{ query: '' }]);
    expect(rec.onCreate).to.deep.equal(['']);
    expect(rec.change).to.equal(0);
    expect(el.getValue()).to.equal('f');
  });

  it('a throwing onCreate is logged; the create event still fires', () => {
    const el = dd();
    const errs = [];
    const orig = console.error;
    console.error = (...a) => errs.push(a);
    let fired = 0;
    el.addEventListener('create', () => { fired++; });
    el.onCreate = () => { throw new Error('boom'); };
    try {
      el.open();
      createRow(el).click();
    } finally {
      console.error = orig;
    }
    expect(fired).to.equal(1);
    expect(errs.length).to.equal(1);
  });

  it('keyboard: ↑ from the first option, End and ↓ reach it; Home leaves it; Enter activates', async () => {
    const el = dd('searchable="false" create-label="Thêm film mới"');
    const rec = record(el);
    trig(el).focus();
    await sendKeys({ press: 'ArrowDown' }); // open, first option
    expect(activeRow(el).getAttribute('data-value')).to.equal('k');
    await sendKeys({ press: 'ArrowUp' }); // wrap → the create row (last)
    expect(same(activeRow(el), createRow(el))).to.equal(true);
    expect(trig(el).getAttribute('aria-activedescendant')).to.equal(createRow(el).id);
    await sendKeys({ press: 'Home' });
    expect(activeRow(el).getAttribute('data-value')).to.equal('k');
    await sendKeys({ press: 'End' });
    expect(same(activeRow(el), createRow(el))).to.equal(true);
    await sendKeys({ press: 'ArrowDown' }); // wrap → first
    expect(activeRow(el).getAttribute('data-value')).to.equal('k');
    await sendKeys({ press: 'End' });
    await sendKeys({ press: 'Enter' });
    expect(rec.create).to.deep.equal([{ query: '' }]);
    expect(rec.change).to.equal(0);
    expect(el._isOpen).to.equal(false);
    expect(same(document.activeElement, trig(el))).to.equal(true);
  });

  it('Enter from the search box on the active create row sends the typed query', async () => {
    const el = dd();
    const rec = record(el);
    trig(el).click();
    await wait(150);
    expect(same(document.activeElement, search(el))).to.equal(true);
    await sendKeys({ type: 'Ilford Delta' }); // no match
    await sendKeys({ press: 'ArrowDown' });
    expect(same(activeRow(el), createRow(el))).to.equal(true);
    expect(search(el).getAttribute('aria-activedescendant')).to.equal(createRow(el).id);
    await sendKeys({ press: 'Enter' });
    expect(rec.create).to.deep.equal([{ query: 'Ilford Delta' }]);
    expect(same(document.activeElement, trig(el))).to.equal(true);
    expect(search(el).value).to.equal('');
  });

  it('typeahead skips the create row', async () => {
    const el = dd('searchable="false" create-label="Thêm film mới"', host, [{ value: 'a', label: 'Agfa' }, { value: 't', label: 'Tmax' }]);
    trig(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ type: 't' }); // "Thêm…" would match t; only Tmax may
    expect(activeRow(el).getAttribute('data-value')).to.equal('t');
    await wait(600);
    await sendKeys({ type: 't' });
    expect(activeRow(el).getAttribute('data-value')).to.equal('t');
  });

  it('disabled dropdown cannot open → the row cannot be activated', async () => {
    const el = dd('disabled create-label="Thêm"');
    const rec = record(el);
    trig(el).click();
    el.open();
    expect(el._isOpen).to.equal(false);
    trig(el).focus();
    await sendKeys({ press: 'End' });
    await sendKeys({ press: 'Enter' });
    expect(rec.create).to.deep.equal([]);
  });

  it('site flow: create → options = [...] + setValue(new) shows the new item (setValue fires no change)', () => {
    const el = dd();
    let changes = 0;
    el.addEventListener('change', () => { changes++; });
    el.addEventListener('create', (e) => {
      el.options = [...el.options, { value: 'n', label: e.detail.query }];
      el.setValue('n');
    });
    el.open();
    typeInSearch(el, 'Lomo 800');
    createRow(el).click();
    expect(el.getValue()).to.equal('n');
    expect(el.querySelector('.td-dropdown__value').textContent).to.equal('Lomo 800');
    expect(changes).to.equal(0);
  });
});

describe('v0.22.0 — sticky bottom layout + far-scrolled rows (data-nav mapping)', () => {
  const MANY = Array.from({ length: 30 }, (_, i) => ({ value: String(i), label: `Mục ${i}` }));
  const inside = (inner, outer) => inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5;

  it('30 options: the scroller scrolls, the create row stays inside the menu at its bottom', async () => {
    const el = dd('searchable="false" max-height="5" create-label="Thêm mục"', host, MANY);
    el.open();
    await frames();
    const scroller = list(el).querySelector('.td-dropdown__scroller');
    expect(getComputedStyle(list(el)).overflowY).to.equal('visible');
    expect(scroller.style.getPropertyValue('max-height')).to.equal('200px');
    expect(scroller.scrollHeight).to.be.greaterThan(scroller.clientHeight);
    for (const top of [scroller.scrollHeight, 0, 400]) {
      scroller.scrollTop = top;
      await frames(1);
      const menu = el._menuElement.getBoundingClientRect();
      const row = createRow(el).getBoundingClientRect();
      expect(inside(row, menu), `row inside the menu at scrollTop ${top}`).to.equal(true);
      expect(row.top).to.be.at.least(scroller.getBoundingClientRect().bottom - 0.5);
      expect(menu.bottom - row.bottom).to.be.below(20);
      expect(same(createRow(el).parentElement, list(el))).to.equal(true);
    }
  });

  it('no results: the status is above, the create row at the bottom of the menu', async () => {
    const el = dd(undefined, host, MANY);
    el.open();
    await wait(150);
    typeInSearch(el, 'không có');
    await frames();
    const empty = el._menuElement.querySelector('.td-dropdown__empty').getBoundingClientRect();
    const row = createRow(el).getBoundingClientRect();
    const menu = el._menuElement.getBoundingClientRect();
    expect(empty.height).to.be.greaterThan(0);
    expect(empty.bottom).to.be.at.most(row.top + 0.5);
    expect(inside(row, menu)).to.equal(true);
    expect(menu.bottom - row.bottom).to.be.below(20);
  });

  it('click / hover / keyboard on a far-scrolled option and on the create row', async () => {
    const el = dd('searchable="false" max-height="5" create-label="Thêm mục"', host, MANY);
    const rec = record(el);
    const changes = [];
    el.addEventListener('change', (e) => changes.push(e.detail.value));
    trig(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    for (let i = 0; i < 24; i++) await sendKeys({ press: 'ArrowDown' }); // → Mục 24, scrolled into view
    expect(activeRow(el).getAttribute('data-value')).to.equal('24');
    const scroller = list(el).querySelector('.td-dropdown__scroller');
    expect(scroller.scrollTop).to.be.greaterThan(0);
    const far = el._menuElement.querySelector('[data-value="22"]');
    await sendMouse({ type: 'move', position: center(far) });
    expect(activeRow(el).getAttribute('data-value'), 'hover maps to the right row').to.equal('22');
    await sendMouse({ type: 'move', position: center(createRow(el)) });
    expect(same(activeRow(el), createRow(el)), 'hover on the create row').to.equal(true);
    await sendMouse({ type: 'move', position: center(far) });
    await sendMouse({ type: 'click', position: center(far) });
    expect(changes).to.deep.equal(['22']);
    expect(el.getValue()).to.equal('22');
    // re-open: the clear row now exists (index shift) — keyboard Enter on a far option
    trig(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Enter' });
    expect(changes).to.deep.equal(['22', '24']);
    // click the create row with the list scrolled far
    el.open();
    await frames();
    scroller.scrollTop = scroller.scrollHeight;
    await frames(1);
    await sendMouse({ type: 'click', position: center(createRow(el)) });
    expect(rec.create).to.deep.equal([{ query: '' }]);
    expect(changes).to.deep.equal(['22', '24']);
    expect(el.getValue()).to.equal('24');
  });
});

describe('v0.22.0 — stacked modal integration', () => {
  it('create inside a TdModal opens a second modal on top; save → new item shown in the lower modal', async () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<td-dropdown name="film" create-label="Thêm film mới"></td-dropdown>';
    const el = wrap.querySelector('td-dropdown');
    TdModal.show({ title: 'Phiếu', body: wrap });
    el.options = FILMS.map((o) => ({ ...o }));
    await wait(400);
    let upperId = null;
    const seen = {};
    el.addEventListener('create', (e) => {
      seen.open = el._isOpen;
      seen.layerReleased = el._layer === null && !hasActiveAbove(LAYERS.modal);
      const input = document.createElement('input');
      input.className = 'new-film';
      input.value = e.detail.query;
      upperId = TdModal.show({ title: 'Thêm film', body: input });
    });
    trig(el).click();
    await wait(150);
    typeInSearch(el, 'Portra 400');
    createRow(el).click();
    expect(seen).to.deep.equal({ open: false, layerReleased: true });
    expect(upperId).to.not.equal(null);
    await wait(400);
    const upper = document.getElementById(upperId);
    const input = upper.querySelector('.new-film');
    expect(input.value).to.equal('Portra 400');
    expect(upper.contains(document.activeElement), 'focus inside the new modal').to.equal(true);
    expect(same(document.elementFromPoint(...center(input)), input), 'new modal on top + interactive').to.equal(true);
    // simulate save
    el.options = [...el.options, { value: 'p4', label: input.value }];
    el.setValue('p4');
    TdModal.closeById(upperId);
    await wait(400);
    expect(TdModal._isOpen(upperId)).to.equal(false);
    expect(el.getValue()).to.equal('p4');
    expect(el.querySelector('.td-dropdown__value').textContent).to.equal('Portra 400');
    expect(wrap.isConnected, 'lower modal still open').to.equal(true);
  });
});
