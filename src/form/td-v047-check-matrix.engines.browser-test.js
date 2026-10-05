import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { MATRIX_CASES, validateMatrix, matrixEntries } from '../utils/check-matrix-model.js';
// NO static import of the component: the pre-define property scenario runs first.

// v0.47.0 (plan docs/internal/plans/v0.47.0-check-matrix.md M3) — <td-check-matrix> core in Chromium, Firefox AND
// WebKit: render from properties (batched) / setData / the `data` attribute, FormData = matrixEntries(), the bulk rules
// (one `change` per action, locked / n/a never move), groups, disabled, reset, restore, fail closed, value API, note
// line, changed marks, XSS. DOM nodes are compared as booleans (a failing chai assertion carrying DOM nodes hangs).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
document.addEventListener('submit', (e) => e.preventDefault(), true);

const COLS = () => [{ key: 'owner', label: 'Chủ cửa hàng', description: 'Toàn quyền' }, { key: 'sales', label: 'Bán hàng' }, { key: 'ship', label: 'Kho' }];
const ROWS = () => [
  { key: 'dash', label: 'Tổng quan' },
  { key: 'cat', label: 'Sản phẩm', rows: [{ key: 'cat.view', label: 'Xem' }, { key: 'cat.edit', label: 'Sửa' }, { key: 'cat.del', label: 'Xoá' }] },
  { key: 'ord', label: 'Đơn', collapsed: true, rows: [{ key: 'ord.list', label: 'Danh sách' }] },
];
const CELLS = () => ({ 'cat.del': { owner: { locked: true, note: 'Không tự sửa role' }, sales: { na: true, note: 'Không áp dụng cho bán hàng' } } });
const VALUE = () => ({ owner: ['cat.del', 'dash'], sales: ['cat.view'] });

// ---------------------------------------------------------------- before define --------------------------------------
const earlyForm = document.createElement('form');
earlyForm.innerHTML = '<td-check-matrix name="early" label="Sớm"></td-check-matrix>';
document.body.appendChild(earlyForm);
const early = earlyForm.firstElementChild;
early.columns = COLS();
early.rows = ROWS();
early.value = { ship: ['dash'] };
const { TdCheckMatrix } = await import('./td-check-matrix.js');

// ---------------------------------------------------------------- helpers -------------------------------------------
const tick = () => new Promise((r) => setTimeout(r, 0));
// budgets are asserted with slack (shared / loaded machines, CI): ×20 unless the page sets window.__TD_PERF_STRICT; the
// QĐ 19 budgets are Chromium's — Firefox / WebKit lay a 2 400-cell table out several times slower (× 4 more)
const ENGINE = /Chrome\//.test(navigator.userAgent) ? 1 : 4;
const PERF_SLACK = (globalThis.__TD_PERF_STRICT ? 1 : 20) * ENGINE;
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const extra = [];
afterEach(() => { extra.splice(0).forEach((f) => f()); });
function mount(attrs = 'name="perms" label="Quyền"', data = { columns: COLS(), rows: ROWS(), cells: CELLS(), value: VALUE() }) {
  const form = document.createElement('form');
  form.innerHTML = `<button type="button" id="before">trước</button><td-check-matrix ${attrs}></td-check-matrix><button type="button" id="after">sau</button>`;
  document.body.appendChild(form);
  extra.push(() => form.remove());
  const el = form.querySelector('td-check-matrix');
  if (data) el.setData(data);
  return { form, el };
}
const fd = (form) => [...new FormData(form)];
const cell = (el, r, c) => el.querySelector(`tr[data-r="${r}"]`).cells[2 + c];
const input = (el, r, c) => cell(el, r, c).querySelector('input');
const bulk = (el, kind, extraSel = '') => el.querySelector(`.td-check-matrix__grid [data-kind="${kind}"]${extraSel}`);
const events = (el, name = 'change') => {
  const list = [];
  el.addEventListener(name, (e) => { if (e instanceof CustomEvent) list.push(e.detail); else list.push('NATIVE'); });
  return list;
};
const warnings = () => {
  const list = [];
  const orig = console.warn;
  console.warn = (...a) => list.push(a.join(' '));
  extra.push(() => { console.warn = orig; });
  return list;
};

describe('v0.47.0 td-check-matrix — core (M3)', () => {
  it('pre-define properties are replayed and batched; FormData = markers, ticks, sentinel', async () => {
    await tick();
    expect(early.querySelector('[role="grid"]') !== null).to.equal(true);
    expect(fd(earlyForm)).to.deep.equal([['early[owner]', ''], ['early[sales]', ''], ['early[ship]', ''], ['early[ship][]', 'dash'], ['early[_v]', '1']]);
    expect(TdCheckMatrix.labels.rows).to.equal('Mục');
  });

  it('property assignments render ONCE at the next microtask; getters flush a pending assignment', async () => {
    const { el, form } = mount('name="p" label="L"', null);
    let renders = 0;
    const orig = el.render.bind(el);
    el.render = () => { renders++; return orig(); };
    el.columns = COLS();
    el.rows = ROWS();
    el.cells = CELLS();
    el.value = VALUE();
    expect(fd(form)).to.deep.equal([], 'nothing until the microtask');
    expect(el.value).to.deep.equal({ owner: ['dash', 'cat.del'], sales: ['cat.view'], ship: [] }, 'getter flushes');
    await tick();
    expect(renders).to.equal(1);
    expect(fd(form)[0]).to.deep.equal(['p[owner]', '']);
  });

  it('FormData equals matrixEntries() on every valid MATRIX_CASES row', async () => {
    for (const c of MATRIX_CASES.filter((x) => x.reason === null)) {
      const { el, form } = mount('name="p" label="L"', c.data);
      const model = validateMatrix(c.data).model;
      expect(fd(form), c.name).to.deep.equal(matrixEntries('p', model, model.value));
      expect(el.querySelector('[data-state="ready"]') !== null, c.name).to.equal(true);
      el.closest('form').remove();
    }
  });

  it('table role=grid; cells named by row + column headers; locked = disabled input; n/a = no input', () => {
    const { el } = mount();
    const grid = el.querySelector('table');
    expect(grid.getAttribute('role')).to.equal('grid');
    const lab = input(el, 1, 0).getAttribute('aria-labelledby').split(' ');
    expect(lab.map((id) => document.getElementById(id).textContent)).to.deep.equal(['Xem', 'Chủ cửa hàngToàn quyền']);
    expect(input(el, 3, 0).disabled).to.equal(true);
    expect(input(el, 3, 0).checked).to.equal(true);
    expect(cell(el, 3, 1).hasAttribute('data-na')).to.equal(true);
    expect(cell(el, 3, 1).querySelector('input')).to.equal(null);
    expect(el.querySelectorAll('input[name]').length).to.equal(0, 'no named input in JS mode');
  });

  it('a cell click: one change { added, removed, trigger: cell } with app keys; host never sees the native change', async () => {
    const { el, form } = mount();
    const ev = events(el);
    input(el, 1, 1).click(); // cat.view × sales: on → off
    expect(ev).to.deep.equal([{ added: [], removed: [['cat.view', 'sales']], trigger: 'cell' }]);
    input(el, 0, 2).click();
    expect(ev[1]).to.deep.equal({ added: [['dash', 'ship']], removed: [], trigger: 'cell' });
    expect(fd(form).filter(([k]) => k.endsWith('[]'))).to.deep.equal([['perms[owner][]', 'dash'], ['perms[ship][]', 'dash'], ['perms[owner][]', 'cat.del']]);
    expect(el.changedCount).to.equal(2);
    expect(cell(el, 1, 1).hasAttribute('data-changed')).to.equal(true);
  });

  it('bulk: column / row / group / group × column / all — one change each, locked + n/a never move, indeterminate honest', async () => {
    const { el } = mount();
    const ev = events(el);
    const colOwner = bulk(el, 'column', '[data-c="0"]').querySelector('input');
    expect(colOwner.indeterminate).to.equal(true);
    colOwner.click(); // owner: dash ✓, cat.del locked ✓ → tick the free rest
    expect(ev.length).to.equal(1);
    expect(ev[0].trigger).to.equal('column');
    expect(ev[0].added).to.deep.equal([['cat.view', 'owner'], ['cat.edit', 'owner'], ['ord.list', 'owner']]);
    expect(colOwner.checked && !colOwner.indeterminate).to.equal(true);
    colOwner.click(); // all free ticked → untick free only, the locked one stays
    expect(ev[1].removed.length).to.equal(4);
    expect(input(el, 3, 0).checked).to.equal(true, 'locked-ticked kept');
    expect(colOwner.indeterminate).to.equal(true, 'never claims "all" while a locked cell is ticked');
    // group × column (cat × sales): view ✓ edit, del n/a
    const gc = el.querySelector('tbody[data-g="0"] [data-kind="group-column"][data-c="1"] input');
    gc.click();
    expect(ev[2]).to.deep.equal({ added: [['cat.edit', 'sales']], removed: [], trigger: 'group-column' });
    // row
    el.querySelector('tr[data-r="0"] [data-kind="row"] input').click();
    expect(ev[3].trigger).to.equal('row');
    // group (cat: every row × every column)
    el.querySelector('tbody[data-g="0"] [data-kind="group"] input').click();
    expect(ev[4].trigger).to.equal('group');
    expect(input(el, 3, 0).checked).to.equal(true);
    expect(cell(el, 3, 1).querySelector('input')).to.equal(null);
    // all
    bulk(el, 'all').querySelector('input').click();
    expect(ev[5].trigger).to.equal('all');
    expect(ev.length).to.equal(6);
    expect(el.querySelector('[role="status"]').textContent).to.match(/^Đã đổi \d+ ô$/);
  });

  it('a set with no free cell → its bulk input is disabled (state still shown)', () => {
    const { el } = mount('name="p" label="L"', { columns: [{ key: 'a', locked: true }, { key: 'b' }], rows: [{ key: 'r' }], value: { a: ['r'] } });
    const a = bulk(el, 'column', '[data-c="0"]').querySelector('input');
    expect(a.disabled).to.equal(true);
    expect(a.checked).to.equal(true);
  });

  it('groups: the button toggles, aria-expanded + data-collapsed follow, expanded-change once, FormData unchanged', () => {
    const { el, form } = mount();
    const ev = events(el, 'expanded-change');
    const before = fd(form);
    const btn = el.querySelector('tbody[data-g="1"] .td-check-matrix__group-toggle');
    expect(btn.getAttribute('aria-expanded')).to.equal('false');
    expect(btn.getAttribute('aria-controls')).to.equal(`${el.id}-g1`);
    expect(el.querySelector('tr[data-r="4"]').getClientRects().length).to.equal(0, 'collapsed row not rendered');
    btn.click();
    expect(btn.getAttribute('aria-expanded')).to.equal('true');
    expect(ev).to.deep.equal([{ group: 'ord', expanded: true }]);
    expect(el.querySelector('tr[data-r="4"]').getClientRects().length > 0).to.equal(true);
    expect(fd(form)).to.deep.equal(before);
    el.collapse('ord');
    expect(btn.getAttribute('aria-expanded')).to.equal('false');
    el.expandAll();
    expect(el.querySelectorAll('[aria-expanded="false"]').length).to.equal(0);
    expect(ev.length).to.equal(1, 'API calls fire nothing');
  });

  it('disabled attribute and <fieldset disabled>: no entry, every control disabled; back on in place', async () => {
    const { el, form } = mount();
    el.setAttribute('disabled', '');
    expect(fd(form)).to.deep.equal([]);
    expect([...el.querySelectorAll('.td-check-matrix__input')].every((i) => i.disabled)).to.equal(true);
    el.removeAttribute('disabled');
    expect(fd(form).length > 0).to.equal(true);
    expect(input(el, 0, 0).disabled).to.equal(false);
    const fs = document.createElement('fieldset');
    form.insertBefore(fs, el);
    fs.appendChild(el);
    fs.disabled = true;
    await tick();
    expect(fd(form)).to.deep.equal([]);
    fs.disabled = false;
    await tick();
    expect(fd(form).length > 0).to.equal(true);
  });

  it('form.reset(): back to the defaults (native reset agrees) + one change trigger reset', async () => {
    const { el, form } = mount();
    const before = fd(form);
    input(el, 0, 1).click();
    bulk(el, 'column', '[data-c="2"]').querySelector('input').click();
    const ev = events(el);
    form.reset();
    await tick();
    expect(fd(form)).to.deep.equal(before);
    expect(input(el, 0, 1).checked).to.equal(false);
    expect(el.changedCount).to.equal(0);
    expect(el.querySelectorAll('[data-changed]').length).to.equal(0);
    expect(ev.length).to.equal(1);
    expect(ev[0].trigger).to.equal('reset');
    expect(bulk(el, 'column', '[data-c="0"]').querySelector('input').indeterminate).to.equal(true, 'bulk repainted after the native reset');
  });

  it('restore state: applied when it matches the data, dropped as a whole otherwise', () => {
    const { el, form } = mount();
    el.formStateRestoreCallback(JSON.stringify({ v: 1, value: { ship: ['dash'] } }), 'restore');
    expect(fd(form).filter(([k]) => k.endsWith('[]'))).to.deep.equal([['perms[ship][]', 'dash']]);
    const w = warnings();
    el.formStateRestoreCallback(JSON.stringify({ v: 1, value: { ship: ['gone'] } }), 'restore');
    expect(fd(form).filter(([k]) => k.endsWith('[]'))).to.deep.equal([['perms[ship][]', 'dash']]);
    expect(w.length).to.equal(1);
  });

  it('fail closed: invalid data → broken state, no entry, controls gone, one warning without values', async () => {
    const w = warnings();
    const { el, form } = mount('name="perms" label="Quyền"', { columns: COLS(), rows: [{ key: 'SECRET' }, { key: 'SECRET' }] });
    expect(el.querySelector('[data-state="broken"]') !== null).to.equal(true);
    expect(el.querySelector('.td-check-matrix__broken').textContent).to.equal('Không đọc được dữ liệu ma trận');
    expect(el.querySelectorAll('input').length).to.equal(0);
    expect(fd(form)).to.deep.equal([]);
    expect(w.some((x) => x.includes('duplicate-row')) && !w.some((x) => x.includes('SECRET'))).to.equal(true);
    // valid data later → ready again
    el.setData({ columns: COLS(), rows: ROWS() });
    expect(fd(form).length).to.equal(4);
    // re-assigning broken data over valid data → broken again (never "clear all")
    el.rows = [{ key: 'a[b' }];
    await tick();
    expect(fd(form)).to.deep.equal([]);
  });

  it('a name that is empty or ends in [] → broken, nothing submitted', () => {
    warnings();
    const a = mount('name="" label="L"');
    expect(fd(a.form)).to.deep.equal([]);
    expect(a.el.querySelector('[data-state="broken"]') !== null).to.equal(true);
    const b = mount('name="perms[]" label="L"');
    expect(fd(b.form)).to.deep.equal([]);
    const c = mount('label="L"');
    expect(fd(c.form)).to.deep.equal([], 'no name: no form value, the grid still works');
    expect(c.el.querySelector('[data-state="ready"]') !== null).to.equal(true);
  });

  it('value API: silent; an invalid value with data in place is REFUSED (state kept, one warning)', () => {
    const { el, form } = mount();
    const ev = events(el);
    el.setValue({ ship: ['dash', 'cat.view'] });
    expect(el.value).to.deep.equal({ owner: [], sales: [], ship: ['dash', 'cat.view'] });
    expect(ev.length).to.equal(0);
    const w = warnings();
    const before = fd(form);
    el.setValue({ sales: ['cat.del'] }); // n/a
    el.value = { nope: [] };
    expect(el.value.ship).to.deep.equal(['dash', 'cat.view']);
    expect(fd(form)).to.deep.equal(before);
    expect(w.length).to.equal(2);
  });

  it('new rows keep the current ticks of cells that still exist; new data + value in the same tick wins', async () => {
    const { el } = mount();
    input(el, 0, 2).click(); // dash × ship
    el.cells = null; // the old cells name rows that go away (a cell of an unknown row fails closed)
    el.rows = [{ key: 'dash' }, { key: 'new' }];
    await tick();
    expect(el.value).to.deep.equal({ owner: ['dash'], sales: [], ship: ['dash'] });
    el.rows = [{ key: 'dash' }];
    el.value = { sales: ['dash'] };
    await tick();
    expect(el.value).to.deep.equal({ owner: [], sales: ['dash'], ship: [] });
  });

  it('the `data` attribute (JSON v1) is a data input; bad JSON → broken', () => {
    warnings();
    const json = JSON.stringify({ v: 1, columns: COLS(), rows: ROWS(), cells: CELLS(), value: VALUE() });
    const { el, form } = mount(`name="d" label="L" data='${json.replace(/'/g, '&#39;')}'`, null);
    expect(fd(form).filter(([k]) => k.endsWith('[]')).length).to.equal(3);
    el.setAttribute('data', '{"v":1,');
    expect(fd(form)).to.deep.equal([]);
    expect(el.querySelector('[data-state="broken"]') !== null).to.equal(true);
  });

  it('note line: the note of the focused cell (locked cells reachable), aria-describedby on the control', async () => {
    const { el } = mount();
    const noteId = input(el, 3, 0).getAttribute('aria-describedby');
    expect(document.getElementById(noteId).textContent).to.equal('Không tự sửa role');
    cell(el, 3, 0).focus();
    await raf();
    expect(el.querySelector('.td-check-matrix__note').textContent).to.equal('Không tự sửa role');
    cell(el, 3, 1).focus();
    await raf();
    expect(el.querySelector('.td-check-matrix__note').textContent).to.equal('Không áp dụng cho bán hàng');
    expect(cell(el, 3, 0).hasAttribute('data-note')).to.equal(true);
  });

  it('XSS: labels / descriptions / notes / keys stay text; `$&` literal', () => {
    const bad = '<img src=x onerror="window.__cmXss=1">$&';
    const { el } = mount('name="x" label="L"', {
      columns: [{ key: 'a', label: bad, description: bad }], rows: [{ key: 'g', label: bad, rows: [{ key: 'r', label: bad, description: bad }] }],
      cells: { r: { a: { note: bad } } },
    });
    expect(el.querySelectorAll('img').length).to.equal(0);
    expect(window.__cmXss).to.equal(undefined);
    expect(el.querySelector('.td-check-matrix__colhead .td-check-matrix__label').textContent).to.equal(bad);
    expect(el.querySelector('[data-kind="row"] input').getAttribute('aria-label')).to.equal(`Chọn cả hàng ${bad}`);
  });

  it('Space on a focused checkbox toggles it (native) and fires one change', async () => {
    const { el } = mount();
    const ev = events(el);
    input(el, 0, 1).focus();
    await sendKeys({ press: 'Space' });
    expect(ev).to.deep.equal([{ added: [['dash', 'sales']], removed: [], trigger: 'cell' }]);
  });

  it(`200 × 12 within the QĐ 19 budgets (render 150 ms, column 16 ms, cell 4 ms; × ${PERF_SLACK} slack)`, () => {
    const columns = Array.from({ length: 12 }, (_, i) => ({ key: `c${i}`, label: `Vai trò ${i}` }));
    const rows = Array.from({ length: 20 }, (_, g) => ({ key: `g${g}`, label: `Nhóm ${g}`, rows: Array.from({ length: 10 }, (__, k) => ({ key: `p${g}.${k}`, label: `Quyền ${g}.${k}` })) }));
    const { el, form } = mount('name="big" label="Lớn" layout="grid"', null);
    let t0 = performance.now();
    el.setData({ columns, rows });
    document.body.offsetHeight; // layout included
    const render = performance.now() - t0;
    t0 = performance.now();
    bulk(el, 'column', '[data-c="5"]').querySelector('input').click();
    document.body.offsetHeight;
    const column = performance.now() - t0;
    t0 = performance.now();
    input(el, 150, 7).click();
    document.body.offsetHeight;
    const one = performance.now() - t0;
    expect(fd(form).length).to.equal(12 + 200 + 1 + 1);
    expect(render < 150 * PERF_SLACK, `render ${render.toFixed(1)} ms`).to.equal(true);
    expect(column < 16 * PERF_SLACK, `column ${column.toFixed(1)} ms`).to.equal(true);
    expect(one < 4 * PERF_SLACK, `cell ${one.toFixed(1)} ms`).to.equal(true);
  });

  it('data assigned while detached is rendered on the next connect (never a stale grid)', async () => {
    const { el, form } = mount();
    el.remove();
    el.setData({ columns: [{ key: 'z', label: 'Z' }], rows: [{ key: 'only', label: 'Only' }], value: { z: ['only'] } });
    form.appendChild(el);
    expect(el.querySelectorAll('thead th[data-c]').length).to.equal(1);
    expect(fd(form)).to.deep.equal([['perms[z]', ''], ['perms[z][]', 'only'], ['perms[_v]', '1']]);
    input(el, 0, 0).click();
    expect(fd(form)).to.deep.equal([['perms[z]', ''], ['perms[_v]', '1']]);
  });

  it('an early `value` property wins over the `data` attribute; the defaults stay the attribute\'s', async () => {
    const json = JSON.stringify({ v: 1, columns: COLS(), rows: ROWS(), value: { owner: ['dash'] } });
    const tpl = document.createElement('template');
    tpl.innerHTML = `<form><td-check-matrix name="e" label="L" data='${json}'></td-check-matrix></form>`;
    const form = tpl.content.firstElementChild;
    const host = form.firstElementChild;
    host.value = { sales: ['dash'] }; // own property before the element is upgraded (template content is inert)
    document.body.appendChild(document.adoptNode(form));
    extra.push(() => form.remove());
    await tick();
    expect(host.value).to.deep.equal({ owner: [], sales: ['dash'], ship: [] });
    expect(host.changedCount).to.equal(2);
    form.reset();
    await tick();
    expect(host.value.owner).to.deep.equal(['dash']);
  });

  it('review r1 #2: the `data` attribute is limited to 512 KiB of UTF-8 (= PHP): limit ok, limit + 1 → broken', async () => {
    warnings();
    const { denseMatrixData } = await import('../../test/fixtures/check-matrix-dense.js');
    const { MATRIX_LIMITS } = await import('../utils/check-matrix-model.js');
    const ok = denseMatrixData(MATRIX_LIMITS.json);
    const over = denseMatrixData(MATRIX_LIMITS.json + 1);
    expect(ok.json.length < MATRIX_LIMITS.json).to.equal(true, 'code units are under the limit: bytes are what counts');
    const { el, form } = mount('name="z" label="L"', null);
    el.setAttribute('data', ok.json);
    expect(el.querySelector('[data-state="ready"]') !== null).to.equal(true);
    expect(fd(form).length).to.equal(12 + 2 + 1);
    el.setAttribute('data', over.json);
    expect(el.querySelector('[data-state="broken"]') !== null).to.equal(true);
    expect(fd(form)).to.deep.equal([]);
  });

  it('review r1 #1: row / column keys named like Object members render, submit and never touch Object', () => {
    const names = ['constructor', 'toString', 'assign', 'prototype', 'hasOwnProperty'];
    const assign = Object.assign;
    const { el, form } = mount('name="o" label="L"', {
      columns: names.map((key) => ({ key })), rows: names.map((key) => ({ key })),
      cells: Object.fromEntries(names.map((r) => [r, Object.fromEntries(names.map((c) => [c, { note: 'n' }]))])),
      value: Object.fromEntries(names.map((c) => [c, ['constructor']])),
    });
    expect(Object.assign === assign).to.equal(true);
    expect(({}).constructor === Object).to.equal(true);
    expect(fd(form).filter(([k]) => k.endsWith('[]')).length).to.equal(5);
    input(el, 1, 2).click();
    expect(el.value.assign).to.deep.equal(['constructor', 'toString']);
    expect(Object.hasOwn(el.value, 'constructor')).to.equal(true);
  });

  it('review r1 #4: reconnect re-binds in place only while the owned DOM is exactly the current render (+ live state)', async () => {
    const { el, form } = mount();
    // live state that is allowed: ticks, changed marks, roving tabindex, crosshair, a collapsed group, the note line
    input(el, 0, 1).click();
    input(el, 0, 1).focus();
    el.querySelector('tbody[data-g="0"] .td-check-matrix__group-toggle').click();
    cell(el, 3, 0).focus();
    await tick();
    let table = el.querySelector('table');
    el.remove();
    form.appendChild(el);
    expect(el.querySelector('table') === table).to.equal(true, 'clean reconnect keeps the nodes');
    const tamper = {
      'row index': (h) => h.querySelector('tr[data-r="1"]').setAttribute('data-r', '0'),
      'bulk kind': (h) => h.querySelector('[data-kind="row"]').setAttribute('data-kind', 'all'),
      'locked enabled': (h) => h.querySelector('td[data-locked] input').removeAttribute('disabled'),
      'group id': (h) => h.querySelector('tbody[data-g="0"]').id = 'x',
      'aria-controls': (h) => h.querySelector('.td-check-matrix__group-toggle').setAttribute('aria-controls', 'x'),
      'extra attr': (h) => h.querySelector('td.td-check-matrix__cell').setAttribute('data-x', '1'),
      handler: (h) => h.querySelector('td.td-check-matrix__cell input').setAttribute('onclick', 'window.__cmPwn=1'),
      'extra node': (h) => h.querySelector('td.td-check-matrix__cell').append(document.createElement('b')),
      'text changed': (h) => { h.querySelector('.td-check-matrix__rowhead .td-check-matrix__label').textContent = 'X'; },
      'labelledby': (h) => h.querySelector('td.td-check-matrix__cell input').setAttribute('aria-labelledby', 'x'),
    };
    for (const [what, fn] of Object.entries(tamper)) {
      table = el.querySelector('table');
      el.remove();
      fn(el);
      form.appendChild(el);
      expect(el.querySelector('table') === table, what).to.equal(false);
      expect(el.querySelectorAll('[onclick], [data-x], b').length, what).to.equal(0);
      expect(el.querySelector('tr[data-r="1"]') !== null && el.querySelectorAll('[data-kind="row"]').length === 5, what).to.equal(true);
    }
    expect(el.value.sales).to.deep.equal(['dash', 'cat.view'], 'state survives the safe re-render');
  });
});
