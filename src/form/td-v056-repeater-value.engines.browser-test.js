import { expect } from '@esm-bundle/chai';
import { TdRepeater } from './td-repeater.js';
import './td-input-field.js';
import './td-checkbox.js';
import './td-toggle.js';
import './td-dropdown.js';

// v0.56.0 (plan docs/internal/plans/v0.56.0-repeater-icons-date.md R1–R4, M1) — <td-repeater> `value` get / set in
// Chromium, Firefox AND WebKit. DOM nodes are compared as booleans (a failing chai assertion carrying DOM nodes hangs the
// runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const tick = () => new Promise((r) => setTimeout(r, 0));
const extra = [];
afterEach(() => { extra.splice(0).forEach((f) => f()); });

function mount(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  return wrap;
}
function capture(kind) {
  const out = [];
  const orig = console[kind];
  console[kind] = (...a) => out.push(a.map(String).join(' '));
  extra.push(() => { console[kind] = orig; });
  return out;
}
function record(rep) {
  const rec = [];
  rep.addEventListener('rows-change', (e) => rec.push({ reason: e.detail.reason, source: e.detail.source, n: e.detail.rows.length }));
  return rec;
}
const rowsOf = (rep) => [...rep.children].filter((c) => c.hasAttribute('data-td-row'));
const formData = (form) => [...new FormData(form).entries()].map(([k, v]) => `${k}=${typeof v === 'string' ? v : '[file]'}`);

/** Every field type of the R2 table in one row (names written by the app on rows-change: items[i][key]). */
const ROW = `<div data-td-row>
  <input data-td-field="name" class="f-name" aria-label="Tên">
  <input type="number" data-td-field="qty" aria-label="SL">
  <input type="date" data-td-field="day" aria-label="Ngày">
  <textarea data-td-field="note" aria-label="Ghi chú"></textarea>
  <input type="hidden" data-td-field="id">
  <select data-td-field="unit" aria-label="Đơn vị"><option value="">—</option><option value="cai">Cái</option><option value="hop">Hộp</option></select>
  <select multiple data-td-field="tags" aria-label="Thẻ"><option value="a">A</option><option value="b">B</option><option value="c">C</option></select>
  <input type="checkbox" data-td-field="gift" aria-label="Quà">
  <input type="checkbox" data-td-field="sizes" value="s" aria-label="S"><input type="checkbox" data-td-field="sizes" value="m" aria-label="M"><input type="checkbox" data-td-field="sizes" value="l" aria-label="L">
  <input type="radio" data-td-field="color" value="red" aria-label="Đỏ"><input type="radio" data-td-field="color" value="blue" aria-label="Xanh">
  <td-checkbox data-td-field="vip" label="VIP"></td-checkbox>
  <td-toggle data-td-field="active" label="Bật"></td-toggle>
  <td-input-field data-td-field="code" label="Mã"></td-input-field>
  <input class="plain" value="kept" aria-label="Không có khoá">
</div>`;
const tplOf = (row) => `<template>${row}</template>`;
const EMPTY = { name: '', qty: '', day: '', note: '', id: '', unit: '', tags: [], gift: false, sizes: [], color: null, vip: false, active: false, code: '' };
const FULL = { name: 'Sạc', qty: '2', day: '2026-06-15', note: 'dòng 1\ndòng 2', id: '7', unit: 'hop', tags: ['a', 'c'], gift: true,
  sizes: ['s', 'l'], color: 'blue', vip: true, active: true, code: 'X-1' };

/** the app names fields from data-td-index on every rows-change (the documented recipe) */
function nameRows(rep) {
  rep.addEventListener('rows-change', () => {
    for (const row of rowsOf(rep)) {
      const i = row.getAttribute('data-td-index');
      for (const el of row.querySelectorAll('[data-td-field]')) {
        if (el.closest('[data-td-row]') !== row) continue;
        const key = el.getAttribute('data-td-field');
        el.setAttribute('name', `items[${i}][${key}]${el.multiple || (el.type === 'checkbox' && key === 'sizes') ? '[]' : ''}`);
      }
    }
  });
}

describe('td-repeater value — read (R1, R2)', () => {
  it('reads every field kind of the R2 table by data-td-field; fields without the key are ignored', async () => {
    const w = mount(`<td-repeater>${tplOf(ROW)}${ROW}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    await tick();
    expect(rep.value).to.deep.equal([EMPTY]);
    const row = rowsOf(rep)[0];
    row.querySelector('.f-name').value = 'Cáp';
    row.querySelector('[data-td-field="unit"]').value = 'cai';
    row.querySelectorAll('[data-td-field="tags"] option')[1].selected = true;
    row.querySelector('[data-td-field="gift"]').checked = true;
    row.querySelectorAll('[data-td-field="sizes"]')[1].checked = true;
    row.querySelectorAll('[data-td-field="color"]')[0].checked = true;
    row.querySelector('td-checkbox').checked = true;
    row.querySelector('td-input-field').value = 'Y';
    const v = rep.value;
    expect(v[0].name).to.equal('Cáp');
    expect(v[0].unit).to.equal('cai');
    expect(v[0].tags).to.deep.equal(['b']);
    expect(v[0].gift).to.equal(true);
    expect(v[0].sizes).to.deep.equal(['m']);
    expect(v[0].color).to.equal('red');
    expect(v[0].vip).to.equal(true);
    expect(v[0].active).to.equal(false);
    expect(v[0].code).to.equal('Y');
    expect(Object.keys(v[0])).to.not.include('plain');
  });

  it('returns a NEW array (and new row objects) on every read', async () => {
    const rep = mount(`<td-repeater>${tplOf(ROW)}${ROW}</td-repeater>`).querySelector('td-repeater');
    await tick();
    const a = rep.value;
    const b = rep.value;
    expect(a === b).to.equal(false);
    expect(a[0] === b[0]).to.equal(false);
    a[0].name = 'changed';
    expect(rep.value[0].name).to.equal('');
  });

  it('a field belongs to its nearest row: a nested repeater is one field (its own value array), its rows are not read by the outer one', async () => {
    const inner = '<div data-td-row><input data-td-field="part" aria-label="Phần"></div>';
    const outer = `<div data-td-row><input data-td-field="title" aria-label="Tên">
      <td-repeater data-td-field="parts">${tplOf(inner)}${inner.replace('aria-label', 'value="p1" aria-label')}</td-repeater></div>`;
    const rep = mount(`<td-repeater id="outer">${tplOf(outer)}${outer.replace('aria-label="Tên"', 'value="A" aria-label="Tên"')}</td-repeater>`).querySelector('#outer');
    await tick();
    expect(rep.value).to.deep.equal([{ title: 'A', parts: [{ part: 'p1' }] }]);
  });

  it('input[type=file] is skipped with ONE warning', async () => {
    const warns = capture('warn');
    const row = '<div data-td-row><input data-td-field="a" aria-label="A"><input type="file" data-td-field="f" aria-label="Tệp"></div>';
    const rep = mount(`<td-repeater>${tplOf(row)}${row}${row}</td-repeater>`).querySelector('td-repeater');
    await tick();
    expect(rep.value).to.deep.equal([{ a: '' }, { a: '' }]);
    void rep.value;
    expect(warns.filter((m) => /file/.test(m)).length).to.equal(1);
  });

  it('a "__proto__" key is a plain own property (no prototype change)', async () => {
    const row = '<div data-td-row><input data-td-field="__proto__" value="x" aria-label="P"></div>';
    const rep = mount(`<td-repeater>${tplOf(row)}${row}</td-repeater>`).querySelector('td-repeater');
    await tick();
    const v = rep.value[0];
    expect(Object.getPrototypeOf(v) === Object.prototype).to.equal(true);
    expect(Object.prototype.hasOwnProperty.call(v, '__proto__')).to.equal(true);
    expect(Object.getOwnPropertyDescriptor(v, '__proto__').value).to.equal('x');
    rep.value = [JSON.parse('{"__proto__":"y"}')];
    expect(rowsOf(rep)[0].querySelector('input').value).to.equal('y');
  });
});

describe('td-repeater value — write (R3)', () => {
  it('round-trip: rep.value = rep.value changes neither the DOM nor the FormData', async () => {
    const w = mount(`<form>${'<td-repeater>'}${tplOf(ROW)}${ROW}${ROW}</td-repeater></form>`);
    const rep = w.querySelector('td-repeater');
    nameRows(rep);
    rep.value = [FULL, { ...EMPTY, name: 'B' }];
    const form = w.querySelector('form');
    const html = rep.innerHTML;
    const fd = formData(form);
    rep.value = rep.value;
    expect(rep.innerHTML === html).to.equal(true);
    expect(formData(form)).to.deep.equal(fd);
    expect(rep.value).to.deep.equal([FULL, { ...EMPTY, name: 'B' }]);
  });

  it('writes every kind; absent keys become the empty value of their kind; one rows-change {reason:set, source:api}', async () => {
    const rep = mount(`<td-repeater>${tplOf(ROW)}${ROW}</td-repeater>`).querySelector('td-repeater');
    await tick();
    rep.value = [FULL];
    const rec = record(rep);
    rep.value = [{ name: 'only' }];
    expect(rep.value).to.deep.equal([{ ...EMPTY, name: 'only' }]);
    expect(rec).to.deep.equal([{ reason: 'set', source: 'api', n: 1 }]);
  });

  it('reuses rows BY POSITION (same nodes, focus kept), adds from the template, removes the extra rows from the end', async () => {
    const row = '<div data-td-row><input data-td-field="a" aria-label="A"><td-input-field data-td-field="b" label="B"></td-input-field></div>';
    const rep = mount(`<td-repeater>${tplOf(row)}${row}${row}</td-repeater>`).querySelector('td-repeater');
    await tick();
    const [r0, r1] = rowsOf(rep);
    const tf = r0.querySelector('td-input-field');
    r0.querySelector('input').focus();
    const rec = record(rep);
    rep.value = [{ a: '1', b: 'x' }, { a: '2' }, { a: '3' }];
    const rows = rowsOf(rep);
    expect(rows.length).to.equal(3);
    expect(rows[0] === r0 && rows[1] === r1).to.equal(true);
    expect(r0.querySelector('td-input-field') === tf).to.equal(true);
    expect(document.activeElement === r0.querySelector('input')).to.equal(true);
    expect(rows[2].querySelector('.td-repeater__actions') !== null).to.equal(true); // upgraded like any new row
    expect(rep.value).to.deep.equal([{ a: '1', b: 'x' }, { a: '2', b: '' }, { a: '3', b: '' }]);
    rep.value = [{ a: 'z' }];
    expect(rowsOf(rep).length).to.equal(1);
    expect(rowsOf(rep)[0] === r0).to.equal(true);
    expect(rec.map((r) => r.reason)).to.deep.equal(['set', 'set']);
    expect(rep.rows.length).to.equal(1); // the model follows
    expect(rowsOf(rep).map((r) => r.getAttribute('data-td-index'))).to.deep.equal(['0']);
  });

  it('min-rows pads with empty template rows; max-rows truncates (one warning); rows-change fires even when the count is unchanged', async () => {
    const warns = capture('warn');
    const row = '<div data-td-row><input data-td-field="a" aria-label="A"></div>';
    const rep = mount(`<td-repeater min-rows="2" max-rows="3">${tplOf(row)}${row}${row}</td-repeater>`).querySelector('td-repeater');
    await tick();
    const rec = record(rep);
    rep.value = [];
    expect(rep.value).to.deep.equal([{ a: '' }, { a: '' }]);
    rep.value = [{ a: '1' }, { a: '2' }, { a: '3' }, { a: '4' }, { a: '5' }];
    expect(rep.value).to.deep.equal([{ a: '1' }, { a: '2' }, { a: '3' }]);
    rep.value = [{ a: '1' }, { a: '2' }, { a: '3' }, { a: '4' }];
    expect(warns.filter((m) => /max-rows|rows/.test(m) && /td-repeater/.test(m)).length).to.equal(1);
    expect(rec.map((r) => `${r.reason}:${r.n}`)).to.deep.equal(['set:2', 'set:3', 'set:3']);
  });

  it('without max-rows the ceiling is TdRepeater.MAX_VALUE_ROWS (1000)', async () => {
    expect(TdRepeater.MAX_VALUE_ROWS).to.equal(1000);
    const warns = capture('warn');
    const row = '<div data-td-row><input data-td-field="a" aria-label="A"></div>';
    const rep = mount(`<td-repeater>${tplOf(row)}</td-repeater>`).querySelector('td-repeater');
    await tick();
    rep.value = Array.from({ length: 1003 }, (_, i) => ({ a: String(i) }));
    expect(rowsOf(rep).length).to.equal(1000);
    expect(warns.some((m) => /1000/.test(m))).to.equal(true);
  });

  it('a key with no field: ignored + ONE warning per instance; a non-array: one warning, nothing changes, no throw', async () => {
    const warns = capture('warn');
    const row = '<div data-td-row><input data-td-field="a" aria-label="A"></div>';
    const rep = mount(`<td-repeater>${tplOf(row)}${row}</td-repeater>`).querySelector('td-repeater');
    await tick();
    rep.value = [{ a: '1', zzz: 'x' }];
    rep.value = [{ a: '2', zzz: 'y' }];
    expect(warns.filter((m) => /zzz/.test(m)).length).to.equal(1);
    const rec = record(rep);
    for (const bad of [null, 'x', { a: 1 }, 5]) rep.value = bad;
    expect(rec.length).to.equal(0);
    expect(rep.value).to.deep.equal([{ a: '2' }]);
    expect(warns.filter((m) => /array/i.test(m)).length).to.be.at.least(1);
  });

  it('values written from code fire no input / change on the fields', async () => {
    const rep = mount(`<td-repeater>${tplOf(ROW)}${ROW}</td-repeater>`).querySelector('td-repeater');
    await tick();
    const seen = [];
    for (const t of ['input', 'change']) rep.addEventListener(t, (e) => seen.push(`${t}:${e.target.localName}`), true);
    rep.value = [FULL];
    rep.value = [EMPTY];
    expect(seen).to.deep.equal([]);
  });

  it('a nested repeater field gets its array; absent → []', async () => {
    const inner = '<div data-td-row><input data-td-field="part" aria-label="Phần"></div>';
    const outer = `<div data-td-row><input data-td-field="title" aria-label="Tên"><td-repeater data-td-field="parts">${tplOf(inner)}</td-repeater></div>`;
    const rep = mount(`<td-repeater id="o2">${tplOf(outer)}</td-repeater>`).querySelector('#o2');
    await tick();
    rep.value = [{ title: 'A', parts: [{ part: '1' }, { part: '2' }] }, { title: 'B' }];
    expect(rep.value).to.deep.equal([{ title: 'A', parts: [{ part: '1' }, { part: '2' }] }, { title: 'B', parts: [] }]);
  });
});

describe('td-repeater value — hooks readRow / writeRow (R2)', () => {
  it('replace the default per instance; the default is passed as the last argument; a throwing hook → console.error + default', async () => {
    const errors = capture('error');
    const row = '<div data-td-row><input data-td-field="a" aria-label="A"><div class="editor" data-x=""></div></div>';
    const rep = mount(`<td-repeater>${tplOf(row)}${row}</td-repeater>`).querySelector('td-repeater');
    await tick();
    expect(rep.readRow).to.equal(null);
    expect(rep.writeRow).to.equal(null);
    rep.readRow = (r, read) => ({ ...read(r), html: r.querySelector('.editor').getAttribute('data-x') });
    rep.writeRow = (r, data, write) => { write(r, data); r.querySelector('.editor').setAttribute('data-x', data.html ?? ''); };
    rep.value = [{ a: '1', html: '<b>x</b>' }];
    expect(rowsOf(rep)[0].querySelector('.editor').getAttribute('data-x')).to.equal('<b>x</b>');
    expect(rep.value).to.deep.equal([{ a: '1', html: '<b>x</b>' }]);
    rep.readRow = () => { throw new Error('boom'); };
    rep.writeRow = () => { throw new Error('boom'); };
    rep.value = [{ a: '2' }];
    expect(rep.value).to.deep.equal([{ a: '2' }]);
    expect(errors.length).to.be.at.least(2);
    rep.readRow = 'not a function';
    expect(rep.readRow).to.equal(null);
  });
});

describe('td-repeater value — before / after the upgrade (R4, P1)', () => {
  const row = '<div data-td-row><input data-td-field="a" aria-label="A"></div>';

  it('(a) upgraded but NOT connected (customElements.upgrade): getter reads the rows; the setter writes them; after disconnect too', async () => {
    const tpl = document.createElement('template');
    tpl.innerHTML = `<td-repeater>${tplOf(row)}${row.replace('aria-label', 'value="s" aria-label')}</td-repeater>`;
    const rep = /** @type {any} */ (document.importNode(tpl.content, true).firstElementChild);
    customElements.upgrade(rep);
    expect(rep instanceof TdRepeater).to.equal(true);
    expect(rep.value).to.deep.equal([{ a: 's' }]);
    rep.value = [{ a: '1' }, { a: '2' }];
    expect(rep.value).to.deep.equal([{ a: '1' }, { a: '2' }]);
    const rec = record(rep);
    const w = mount('');
    w.append(rep);
    await tick();
    expect(rec.map((r) => r.reason)).to.deep.equal(['init']); // one init, no set
    expect(rep.value).to.deep.equal([{ a: '1' }, { a: '2' }]);
    rep.remove();
    expect(rep.value).to.deep.equal([{ a: '1' }, { a: '2' }]);
    rep.value = [{ a: '9' }];
    expect(rep.value).to.deep.equal([{ a: '9' }]);
  });

  it('(b) assigned on a <template> clone before the upgrade: applied on connect, no own property left, ONE init and no set', async () => {
    const tpl = document.createElement('template');
    tpl.innerHTML = `<td-repeater>${tplOf(row)}</td-repeater>`;
    const frag = tpl.content.cloneNode(true);
    const rep = /** @type {any} */ (frag.firstElementChild);
    expect(rep instanceof TdRepeater).to.equal(false);
    const hook = (r, read) => read(r);
    rep.value = [{ a: 'x' }, { a: 'y' }];
    rep.readRow = hook;
    const rec = [];
    rep.addEventListener('rows-change', (e) => rec.push(e.detail.reason));
    mount('').append(frag);
    await tick();
    expect(rep instanceof TdRepeater).to.equal(true);
    for (const p of ['value', 'readRow']) {
      const d = Object.getOwnPropertyDescriptor(rep, p);
      expect(!d || !('value' in d), `${p}: no own data property`).to.equal(true);
    }
    expect(rep.readRow === hook).to.equal(true);
    expect(rep.value).to.deep.equal([{ a: 'x' }, { a: 'y' }]);
    expect(rec).to.deep.equal(['init']);
  });

  it('(b2) createElement before define (late subclass tag): the early value reaches the setter', async () => {
    const tag = `td-repeater-v056-${Math.random().toString(36).slice(2, 8)}`;
    const w = mount(`<${tag}>${tplOf(row)}</${tag}>`);
    const rep = /** @type {any} */ (w.firstElementChild);
    rep.remove();
    rep.value = [{ a: 'late' }];
    w.append(rep);
    customElements.define(tag, class extends TdRepeater {});
    await tick();
    expect(rep.value).to.deep.equal([{ a: 'late' }]);
  });

  it('(c) read before define: no promise — a plain HTMLElement has no rows value (undefined)', () => {
    const tag = `td-repeater-v056-${Math.random().toString(36).slice(2, 8)}`;
    const el = /** @type {any} */ (document.createElement(tag));
    expect(el.value).to.equal(undefined);
  });
});
