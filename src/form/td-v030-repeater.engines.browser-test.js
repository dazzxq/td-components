import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdRepeater } from './td-repeater.js';
import './td-input-field.js';
import './td-dropdown.js';
import './td-toggle.js';
import './td-number-input.js';
import { TdModal } from '../feedback/td-modal.js';

// v0.30.0 (plan docs/internal/plans/v0.30.0-number-repeater.md M5) — <td-repeater> in Chromium, Firefox AND WebKit.
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const extra = [];
afterEach(() => { extra.splice(0).forEach((f) => f()); });

function mount(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  return wrap;
}
function captureWarn() {
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  extra.push(() => { console.warn = orig; });
  return warns;
}
const rowsOf = (rep) => [...rep.children].filter((c) => c.hasAttribute('data-td-row'));
const btn = (row, kind) => row.querySelector(`button.td-repeater__btn--${kind}`);
const addBtn = (rep) => rep.querySelector('.td-repeater__footer .td-repeater__add');
const live = (rep) => rep.querySelector('.td-repeater__footer [role="status"]');
const names = (rep) => rowsOf(rep).map((r) => r.querySelector('input')?.value ?? '');
function record(rep) {
  const rec = [];
  rep.addEventListener('rows-change', (e) => rec.push({ ...e.detail, rows: e.detail.rows.slice() }));
  return rec;
}

const ROW_TPL = '<template><div data-td-row class="box-row"><input class="nm" data-name="items[{i}][name]" aria-label="Tên"></div></template>';
const serverRow = (i, v) => `<div data-td-row class="box-row"><input class="nm" name="items[${i}][name]" data-name="items[{i}][name]" value="${v}" aria-label="Tên"></div>`;

describe('td-repeater — upgrade in place (M5)', () => {
  it('server rows are upgraded without moving / re-creating their fields; host group + label; footer with add + live region', () => {
    const w = mount(`<td-repeater label="Hộp gồm">${ROW_TPL}${serverRow(0, 'Sạc')}${serverRow(1, 'Cáp')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    const rows = rowsOf(rep);
    expect(rows.length).to.equal(2);
    const inputs = rows.map((r) => r.querySelector('input'));
    expect(rows[0].querySelector('input') === inputs[0]).to.equal(true);
    expect(rep.getAttribute('role')).to.equal('group');
    const label = rep.querySelector(':scope > .td-repeater__label');
    expect(label.textContent).to.equal('Hộp gồm');
    expect(rep.getAttribute('aria-labelledby')).to.equal(label.id);
    expect(rows.map((r) => r.getAttribute('data-td-index'))).to.deep.equal(['0', '1']);
    expect(rows.map((r) => r.getAttribute('role'))).to.deep.equal(['group', 'group']);
    expect(rows.map((r) => r.getAttribute('aria-label'))).to.deep.equal(['Dòng 1', 'Dòng 2']);
    expect(rows.every((r) => r.classList.contains('td-repeater__row'))).to.equal(true);
    // actions appended at the end of each row (no [data-td-row-actions] given)
    expect(rows[0].lastElementChild.classList.contains('td-repeater__actions')).to.equal(true);
    for (const kind of ['up', 'down', 'remove']) expect(btn(rows[0], kind).type).to.equal('button');
    expect(btn(rows[1], 'up').getAttribute('aria-label')).to.equal('Chuyển dòng 2 lên');
    expect(btn(rows[0], 'up').getAttribute('aria-disabled')).to.equal('true');
    expect(btn(rows[1], 'down').getAttribute('aria-disabled')).to.equal('true');
    expect(btn(rows[0], 'down').hasAttribute('aria-disabled')).to.equal(false);
    const footer = rep.lastElementChild;
    expect(footer.classList.contains('td-repeater__footer')).to.equal(true);
    expect(addBtn(rep).type).to.equal('button');
    expect(addBtn(rep).textContent.trim()).to.equal(TdRepeater.labels.add);
    expect(live(rep).classList.contains('td-sr-only')).to.equal(true);
    expect(rep.rows.length).to.equal(2);
  });

  it('a [data-td-row-actions] slot the app placed receives the buttons', () => {
    const w = mount(`<td-repeater>${ROW_TPL}<div data-td-row><span class="a">x</span><div data-td-row-actions class="mine"></div><span class="b">y</span></div></td-repeater>`);
    const row = rowsOf(w.querySelector('td-repeater'))[0];
    const slot = row.querySelector('.mine');
    expect(!!slot.querySelector('.td-repeater__btn--remove')).to.equal(true);
    const boxes = row.querySelectorAll('.td-repeater__actions');
    expect(boxes.length === 1 && boxes[0] === slot).to.equal(true, 'no extra container: the slot itself');
    expect(row.lastElementChild.classList.contains('b')).to.equal(true);
  });

  it('the app aria-labelledby on a row is kept (no aria-label added)', () => {
    const w = mount(`<td-repeater>${ROW_TPL}<div data-td-row aria-labelledby="t1"><span id="t1">FAQ 1</span></div></td-repeater>`);
    const row = rowsOf(w.querySelector('td-repeater'))[0];
    expect(row.getAttribute('aria-labelledby')).to.equal('t1');
    expect(row.hasAttribute('aria-label')).to.equal(false);
  });

  it('td-input-field inside a server row is not re-connected by the upgrade (value + node kept)', async () => {
    const w = mount(`<td-repeater>${ROW_TPL}<div data-td-row><td-input-field label="Tên" value="A"></td-input-field></div></td-repeater>`);
    const rep = w.querySelector('td-repeater');
    const field = rep.querySelector('td-input-field');
    const ctl = field.querySelector('.td-field__control');
    ctl.value = 'typed';
    ctl.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await wait();
    expect(field.querySelector('.td-field__control') === ctl).to.equal(true);
    expect(field.value).to.equal('typed');
  });

  it('fewer rows than min-rows → template rows appended, one rows-change "init"', () => {
    const w = document.createElement('div');
    w.innerHTML = `<td-repeater min-rows="2">${ROW_TPL}</td-repeater>`;
    const rep = w.querySelector('td-repeater');
    const rec = record(rep);
    document.body.appendChild(w);
    extra.push(() => w.remove());
    expect(rowsOf(rep).length).to.equal(2);
    expect(rec.length).to.equal(1);
    expect(rec[0].reason).to.equal('init');
    expect(rec[0].source).to.equal('api');
    expect(rec[0].rows.length).to.equal(2);
    expect(btn(rowsOf(rep)[0], 'remove').getAttribute('aria-disabled')).to.equal('true');
  });

  it('re-connect does not duplicate buttons / listeners / footer and emits nothing when nothing changed', async () => {
    const w = mount(`<td-repeater label="L">${ROW_TPL}${serverRow(0, 'a')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    const rec = record(rep);
    w.removeChild(rep);
    w.appendChild(rep);
    await wait();
    expect(rep.querySelectorAll('.td-repeater__footer').length).to.equal(1);
    expect(rep.querySelectorAll('.td-repeater__label').length).to.equal(1);
    expect(rep.querySelectorAll('.td-repeater__btn--remove').length).to.equal(1);
    expect(rec.length).to.equal(0);
    addBtn(rep).click();
    expect(rowsOf(rep).length).to.equal(2);
    expect(rec.length).to.equal(1, 'one add per click (listener bound once)');
  });

  it('XSS: label / add-label are text', () => {
    const w = mount(`<td-repeater label="<img src=x onerror=alert(1)>" add-label="<b>x</b>">${ROW_TPL}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    expect(rep.querySelector('img')).to.equal(null);
    expect(rep.querySelector('.td-repeater__label').textContent).to.equal('<img src=x onerror=alert(1)>');
    expect(addBtn(rep).querySelector('b')).to.equal(null);
    expect(addBtn(rep).textContent.trim()).to.equal('<b>x</b>');
  });

  it('attribute changes update in place: label, add-label, max-rows', () => {
    const w = mount(`<td-repeater>${ROW_TPL}${serverRow(0, 'a')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    rep.setAttribute('label', 'Mới');
    expect(rep.querySelector('.td-repeater__label').textContent).to.equal('Mới');
    rep.setAttribute('add-label', 'Thêm FAQ');
    expect(addBtn(rep).textContent.trim()).to.equal('Thêm FAQ');
    rep.setAttribute('max-rows', '1');
    expect(addBtn(rep).getAttribute('aria-disabled')).to.equal('true');
    rep.removeAttribute('label');
    expect(rep.querySelector('.td-repeater__label')).to.equal(null);
    expect(rep.hasAttribute('aria-labelledby')).to.equal(false);
  });
});

describe('td-repeater — min-rows ceiling (security review)', () => {
  it('min-rows="1000000000" → ignored with one warning, no rows cloned, fast', () => {
    const warns = captureWarn();
    const t0 = performance.now();
    const w = mount(`<td-repeater min-rows="1000000000">${ROW_TPL}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    expect(performance.now() - t0 < 1000).to.equal(true);
    expect(rowsOf(rep).length).to.equal(0);
    expect(warns.filter((m) => m.includes('min-rows')).length).to.equal(1);
  });

  it('a later attribute change above the ceiling is ignored too; at the ceiling (200) the fill stops at 200', () => {
    const warns = captureWarn();
    const w = mount(`<td-repeater>${ROW_TPL}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    rep.setAttribute('min-rows', '1e9');
    expect(rowsOf(rep).length).to.equal(0);
    rep.setAttribute('min-rows', '201');
    expect(rowsOf(rep).length).to.equal(0);
    expect(warns.filter((m) => m.includes('min-rows')).length).to.equal(1);
    rep.setAttribute('min-rows', String(TdRepeater.MAX_MIN_ROWS));
    expect(TdRepeater.MAX_MIN_ROWS).to.equal(200);
    expect(rowsOf(rep).length).to.equal(200);
  });
});

describe('td-repeater — template', () => {
  it('a template element without data-td-row gets it on the clone', () => {
    const w = mount('<td-repeater><template><div class="r"><input></div></template></td-repeater>');
    const rep = w.querySelector('td-repeater');
    const row = rep.addRow();
    expect(row.hasAttribute('data-td-row')).to.equal(true);
    expect(row.classList.contains('r')).to.equal(true);
  });

  it('0 or 2 elements in the template → one warning, no error, add aria-disabled, addRow null', () => {
    const warns = captureWarn();
    const w = mount('<td-repeater><template><div></div><div></div></template></td-repeater><td-repeater><template> </template></td-repeater>');
    const [a, b] = w.querySelectorAll('td-repeater');
    expect(warns.filter((m) => m.includes('td-repeater')).length).to.equal(2);
    expect(addBtn(a).getAttribute('aria-disabled')).to.equal('true');
    expect(a.addRow()).to.equal(null);
    expect(b.addRow()).to.equal(null);
    addBtn(a).click();
    expect(rowsOf(a).length).to.equal(0);
  });

  it('cloned rows: every id → {id}--r{n} (counter, never reused), in-row references follow, outside references kept', () => {
    const w = mount(`<span id="outside">o</span><td-repeater><template><div data-td-row>
      <label for="nm">Tên</label><input id="nm" aria-describedby="hint outside" list="dl">
      <span id="hint">h</span><datalist id="dl"></datalist>
      <button type="button" aria-controls="nm" aria-labelledby="outside">x</button>
      <label for="q">SL</label><td-input-field field-id="q" helper-text="h"></td-input-field>
    </div></template></td-repeater>`);
    const rep = w.querySelector('td-repeater');
    const r1 = rep.addRow();
    const r2 = rep.addRow();
    rep.removeRow(r2);
    const r3 = rep.addRow();
    const ids = [...rep.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).to.equal(ids.length);
    expect(r1.querySelector('input:not([class])').id).to.equal('nm--r1');
    expect(r3.querySelector('input:not([class])').id).to.equal('nm--r3');
    const inp = r1.querySelector('input:not([class])');
    expect(r1.querySelector('label').htmlFor).to.equal('nm--r1');
    expect(inp.getAttribute('aria-describedby')).to.equal('hint--r1 outside');
    expect(inp.getAttribute('list')).to.equal('dl--r1');
    const b = r1.querySelector('button[aria-controls]');
    expect(b.getAttribute('aria-controls')).to.equal('nm--r1');
    expect(b.getAttribute('aria-labelledby')).to.equal('outside');
    const field = r1.querySelector('td-input-field');
    expect(field.getAttribute('field-id')).to.equal('q--r1');
    expect(field.querySelector('.td-field__control').id).to.equal('q--r1');
    expect(r1.querySelectorAll('label')[1].htmlFor).to.equal('q--r1');
  });

  it('server rows keep their ids (only clones are renamed)', () => {
    const w = mount(`<td-repeater>${ROW_TPL}<div data-td-row><input id="srv"></div></td-repeater>`);
    expect(!!w.querySelector('#srv')).to.equal(true);
  });
});

describe('td-repeater — add / max', () => {
  it('user add → row at the end, focus on its first field, announce, rows-change add/user', () => {
    const w = mount(`<td-repeater>${ROW_TPL}${serverRow(0, 'a')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    const rec = record(rep);
    addBtn(rep).focus();
    addBtn(rep).click();
    const rows = rowsOf(rep);
    expect(rows.length).to.equal(2);
    expect(document.activeElement === rows[1].querySelector('input')).to.equal(true);
    expect(live(rep).textContent).to.equal('Đã thêm dòng 2. Có 2 dòng.');
    expect(rec.length).to.equal(1);
    expect(rec[0].reason).to.equal('add');
    expect(rec[0].source).to.equal('user');
    expect(rec[0].index).to.equal(1);
    expect(rec[0].row === rows[1]).to.equal(true);
    expect(rec[0].rows.length).to.equal(2);
  });

  it('add up to max-rows: add aria-disabled (keeps focus), click at max = nothing + "full" announced', () => {
    const w = mount(`<td-repeater max-rows="2">${ROW_TPL}${serverRow(0, 'a')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    const rec = record(rep);
    const add = addBtn(rep);
    add.click();
    expect(add.getAttribute('aria-disabled')).to.equal('true');
    expect(add.disabled).to.equal(false);
    add.focus();
    add.click();
    expect(rowsOf(rep).length).to.equal(2);
    expect(rec.length).to.equal(1);
    expect(document.activeElement === add).to.equal(true);
    expect(live(rep).textContent).to.equal('Tối đa 2 dòng.');
  });

  it('addRow({ at }) API: inserts at the index, rows-change source api, null when full', () => {
    const w = mount(`<td-repeater max-rows="3">${ROW_TPL}${serverRow(0, 'a')}${serverRow(1, 'b')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    const rec = record(rep);
    const row = rep.addRow({ at: 0 });
    expect(rowsOf(rep)[0] === row).to.equal(true);
    expect(rowsOf(rep).map((r) => r.getAttribute('data-td-index'))).to.deep.equal(['0', '1', '2']);
    expect(rec[0].source).to.equal('api');
    expect(rec[0].index).to.equal(0);
    expect(rep.addRow()).to.equal(null);
    expect(rec.length).to.equal(1);
  });

  it('td-* inside cloned rows work and submit (input-field, dropdown upgrading a <select>, toggle, number-input)', async () => {
    const w = mount(`<form><td-repeater><template><div data-td-row>
        <td-input-field name="f" label="Tên"></td-input-field>
        <td-dropdown name="d"><select><option value="x">X</option><option value="y" selected>Y</option></select></td-dropdown>
        <td-toggle name="t" checked label="Bật"></td-toggle>
        <td-number-input name="n" label="Giá" value="1500"></td-number-input>
      </div></template></td-repeater></form>`);
    const rep = w.querySelector('td-repeater');
    const row = rep.addRow();
    await wait();
    const field = row.querySelector('td-input-field');
    field.querySelector('.td-field__control').focus();
    await sendKeys({ type: 'Pin' });
    const fd = new FormData(w.querySelector('form'));
    expect(fd.get('f')).to.equal('Pin');
    expect(fd.get('d')).to.equal('y');
    expect(fd.get('t')).to.equal('on');
    expect(fd.get('n')).to.equal('1500');
    expect(row.querySelector('.td-number__control').value).to.equal('1.500');
    expect(row.querySelector('.td-number__control').id.endsWith('-control')).to.equal(true);
    expect(row.querySelector('select')).to.equal(null);
  });
});

describe('td-repeater — remove', () => {
  it('× at min-rows: nothing + "atMin" announced; buttons stay focusable (aria-disabled)', () => {
    const w = mount(`<td-repeater min-rows="1">${ROW_TPL}${serverRow(0, 'a')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    const x = btn(rowsOf(rep)[0], 'remove');
    expect(x.getAttribute('aria-disabled')).to.equal('true');
    x.focus();
    x.click();
    expect(rowsOf(rep).length).to.equal(1);
    expect(document.activeElement === x).to.equal(true);
    expect(live(rep).textContent).to.equal('Cần ít nhất 1 dòng.');
  });

  it('before-remove is cancelable; not cancelled → removed, focus on the × of the row taking its place, announced', () => {
    const w = mount(`<td-repeater>${ROW_TPL}${serverRow(0, 'a')}${serverRow(1, 'b')}${serverRow(2, 'c')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    const rec = record(rep);
    const seen = [];
    let cancel = true;
    rep.addEventListener('before-remove', (e) => { seen.push(e.detail.index); if (cancel) e.preventDefault(); });
    const rows = rowsOf(rep);
    btn(rows[1], 'remove').focus();
    btn(rows[1], 'remove').click();
    expect(rowsOf(rep).length).to.equal(3);
    expect(rec.length).to.equal(0);
    cancel = false;
    btn(rows[1], 'remove').click();
    expect(seen).to.deep.equal([1, 1]);
    expect(names(rep)).to.deep.equal(['a', 'c']);
    expect(rec.length).to.equal(1);
    expect(rec[0].reason).to.equal('remove');
    expect(rec[0].source).to.equal('user');
    expect(rec[0].index).to.equal(1);
    expect(rec[0].row === rows[1]).to.equal(true);
    expect(document.activeElement === btn(rowsOf(rep)[1], 'remove')).to.equal(true);
    expect(live(rep).textContent).to.equal('Đã xoá dòng 2. Còn 2 dòng.');
    expect(rowsOf(rep).map((r) => r.getAttribute('aria-label'))).to.deep.equal(['Dòng 1', 'Dòng 2']);
  });

  it('removing the last row → focus the previous row ×; removing the only row → focus the add button', () => {
    const w = mount(`<td-repeater>${ROW_TPL}${serverRow(0, 'a')}${serverRow(1, 'b')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    btn(rowsOf(rep)[1], 'remove').focus();
    btn(rowsOf(rep)[1], 'remove').click();
    expect(document.activeElement === btn(rowsOf(rep)[0], 'remove')).to.equal(true);
    btn(rowsOf(rep)[0], 'remove').click();
    expect(rowsOf(rep).length).to.equal(0);
    expect(document.activeElement === addBtn(rep)).to.equal(true);
  });

  it('async confirm (TdModal.confirm) → removeRow after the modal returns focus: focus lands right', async () => {
    const w = mount(`<td-repeater>${ROW_TPL}${serverRow(0, 'a')}${serverRow(1, 'b')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    const rec = record(rep);
    let done;
    const finished = new Promise((r) => { done = r; });
    rep.addEventListener('before-remove', async (e) => {
      e.preventDefault();
      const ok = await TdModal.confirm({ message: 'Xoá dòng này?' });
      if (ok) rep.removeRow(e.detail.row);
      done();
    });
    const x = btn(rowsOf(rep)[0], 'remove');
    x.focus();
    x.click();
    await wait(400);
    const confirmBtn = [...document.querySelectorAll('.td-modal button')].find((b) => b.textContent.trim() === (TdModal.labels.confirm || 'Xác nhận'));
    confirmBtn.click();
    await finished;
    await wait(400);
    expect(names(rep)).to.deep.equal(['b']);
    expect(rec.length).to.equal(1);
    expect(rec[0].source).to.equal('api');
    expect(document.activeElement === btn(rowsOf(rep)[0], 'remove')).to.equal(true);
  });

  it('removeRow(index | row) API: no before-remove, respects min, false for unknown', () => {
    const w = mount(`<td-repeater min-rows="1">${ROW_TPL}${serverRow(0, 'a')}${serverRow(1, 'b')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    let before = 0;
    rep.addEventListener('before-remove', () => { before += 1; });
    expect(rep.removeRow(5)).to.equal(false);
    expect(rep.removeRow(document.createElement('div'))).to.equal(false);
    expect(rep.removeRow(0)).to.equal(true);
    expect(rep.removeRow(0)).to.equal(false, 'at min');
    expect(before).to.equal(0);
    expect(names(rep)).to.deep.equal(['b']);
  });
});

describe('td-repeater — move', () => {
  it('↑ moves the row up (its neighbour moves), focus stays on the pressed button, even at the edge', () => {
    const w = mount(`<td-repeater>${ROW_TPL}${serverRow(0, 'a')}${serverRow(1, 'b')}${serverRow(2, 'c')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    const rec = record(rep);
    const rowC = rowsOf(rep)[2];
    const up = btn(rowC, 'up');
    up.focus();
    up.click();
    expect(names(rep)).to.deep.equal(['a', 'c', 'b']);
    expect(document.activeElement === up).to.equal(true);
    expect(rec[0].reason).to.equal('move');
    expect(rec[0].source).to.equal('user');
    expect(rec[0].from).to.equal(2);
    expect(rec[0].to).to.equal(1);
    expect(rec[0].row === rowC).to.equal(true);
    expect(live(rep).textContent).to.equal('Đã chuyển tới vị trí 2 / 3.');
    up.click();
    expect(names(rep)).to.deep.equal(['c', 'a', 'b']);
    expect(up.getAttribute('aria-disabled')).to.equal('true');
    expect(up.getAttribute('aria-label')).to.equal('Chuyển dòng 1 lên');
    up.click(); // at the edge: nothing
    expect(names(rep)).to.deep.equal(['c', 'a', 'b']);
    expect(rec.length).to.equal(2);
    expect(document.activeElement === up).to.equal(true);
    const down = btn(rowC, 'down');
    down.focus();
    down.click();
    expect(names(rep)).to.deep.equal(['a', 'c', 'b']);
    expect(document.activeElement === down).to.equal(true);
    expect(rowsOf(rep).map((r) => r.getAttribute('data-td-index'))).to.deep.equal(['0', '1', '2']);
  });

  it('keyboard: Tab to ↓ and Enter / Space activate it (real buttons, no extra shortcut)', async () => {
    const w = mount(`<td-repeater>${ROW_TPL}${serverRow(0, 'a')}${serverRow(1, 'b')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    const down = btn(rowsOf(rep)[0], 'down');
    down.focus();
    await sendKeys({ press: 'Enter' });
    expect(names(rep)).to.deep.equal(['b', 'a']);
    const up = btn(rowsOf(rep)[1], 'up');
    up.focus();
    await sendKeys({ press: 'Space' });
    expect(names(rep)).to.deep.equal(['a', 'b']);
  });

  it('a moved neighbour row with td-input-field keeps its value', async () => {
    const w = mount(`<td-repeater>${ROW_TPL}<div data-td-row><td-input-field value="A"></td-input-field></div><div data-td-row><td-input-field value="B"></td-input-field></div></td-repeater>`);
    const rep = w.querySelector('td-repeater');
    const [r0, r1] = rowsOf(rep);
    const f0 = r0.querySelector('td-input-field');
    f0.querySelector('.td-field__control').value = 'A-typed';
    f0.querySelector('.td-field__control').dispatchEvent(new InputEvent('input', { bubbles: true }));
    btn(r1, 'up').click(); // r0 (neighbour) moves after r1
    await wait();
    expect(f0.value).to.equal('A-typed');
    expect(rowsOf(rep)[1] === r0).to.equal(true);
  });

  it('moveRow(from, to) API keeps the moved row attached; rows-change source api', () => {
    const w = mount(`<td-repeater>${ROW_TPL}${serverRow(0, 'a')}${serverRow(1, 'b')}${serverRow(2, 'c')}${serverRow(3, 'd')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    const rec = record(rep);
    const inp = rowsOf(rep)[0].querySelector('input');
    inp.focus();
    expect(rep.moveRow(0, 2)).to.equal(true);
    expect(names(rep)).to.deep.equal(['b', 'c', 'a', 'd']);
    expect(document.activeElement === inp).to.equal(true);
    expect(rep.moveRow(3, 0)).to.equal(true);
    expect(names(rep)).to.deep.equal(['d', 'b', 'c', 'a']);
    expect(rep.moveRow(1, 1)).to.equal(false);
    expect(rep.moveRow(0, 9)).to.equal(false);
    expect(rec.map((r) => [r.reason, r.source, r.from, r.to])).to.deep.equal([['move', 'api', 0, 2], ['move', 'api', 3, 0]]);
  });
});

describe('td-repeater — outside changes (MutationObserver → sync)', () => {
  it('app inserts / reorders rows → one rows-change "sync", new rows get buttons, ids untouched', async () => {
    const w = mount(`<td-repeater>${ROW_TPL}${serverRow(0, 'a')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    const rec = record(rep);
    const extraRow = document.createElement('div');
    extraRow.setAttribute('data-td-row', '');
    extraRow.innerHTML = '<input id="mine" value="x">';
    rowsOf(rep)[0].after(extraRow);
    await wait();
    expect(rec.length).to.equal(1);
    expect(rec[0].reason).to.equal('sync');
    expect(rec[0].source).to.equal('api');
    expect(!!btn(extraRow, 'remove')).to.equal(true);
    expect(extraRow.querySelector('input').id).to.equal('mine');
    expect(extraRow.getAttribute('data-td-index')).to.equal('1');
    rowsOf(rep)[0].before(extraRow);
    await wait();
    expect(rec.length).to.equal(2);
    expect(rowsOf(rep).map((r) => r.getAttribute('aria-label'))).to.deep.equal(['Dòng 1', 'Dòng 2']);
  });

  it('kit changes do not produce a second (sync) rows-change', async () => {
    const w = mount(`<td-repeater>${ROW_TPL}${serverRow(0, 'a')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    const rec = record(rep);
    addBtn(rep).click();
    btn(rowsOf(rep)[1], 'up').click();
    btn(rowsOf(rep)[1], 'remove').click();
    await wait();
    expect(rec.map((r) => r.reason)).to.deep.equal(['add', 'move', 'remove']);
  });

  it('app removes rows below min-rows → template rows appended, one rows-change', async () => {
    const w = mount(`<td-repeater min-rows="2">${ROW_TPL}${serverRow(0, 'a')}${serverRow(1, 'b')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    const rec = record(rep);
    rowsOf(rep).forEach((r) => r.remove());
    await wait();
    expect(rowsOf(rep).length).to.equal(2);
    expect(names(rep)).to.deep.equal(['', '']);
    expect(rec.length).to.equal(1);
    expect(rec[0].reason).to.equal('sync');
  });

  it('app inserts rows beyond max-rows → all kept, add aria-disabled, one warning', async () => {
    const warns = captureWarn();
    const w = mount(`<td-repeater max-rows="1">${ROW_TPL}${serverRow(0, 'a')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    const r = document.createElement('div');
    r.setAttribute('data-td-row', '');
    rep.insertBefore(r, addBtn(rep).parentElement);
    const r2 = r.cloneNode();
    rep.insertBefore(r2, addBtn(rep).parentElement);
    await wait();
    expect(rowsOf(rep).length).to.equal(3);
    expect(addBtn(rep).getAttribute('aria-disabled')).to.equal('true');
    expect(warns.filter((m) => m.includes('max-rows')).length).to.equal(1);
  });

  it('server prints more rows than max-rows → kept', () => {
    captureWarn();
    const w = mount(`<td-repeater max-rows="1">${ROW_TPL}${serverRow(0, 'a')}${serverRow(1, 'b')}</td-repeater>`);
    expect(rowsOf(w.querySelector('td-repeater')).length).to.equal(2);
  });
});

describe('td-repeater — API right after a direct DOM change (impl review round 1)', () => {
  it('append a row via DOM, then moveRow / addRow in the same task: the API sees it; one sync, no duplicate later', async () => {
    const w = mount(`<td-repeater>${ROW_TPL}${serverRow(0, 'a')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    const rec = record(rep);
    const x = document.createElement('div');
    x.setAttribute('data-td-row', '');
    x.innerHTML = '<input value="x">';
    rowsOf(rep)[0].after(x);
    expect(rep.moveRow(1, 0)).to.equal(true);
    expect(names(rep)).to.deep.equal(['x', 'a']);
    const added = rep.addRow({ at: 1 });
    expect(rowsOf(rep)[1] === added).to.equal(true);
    await wait();
    expect(rec.map((r) => r.reason)).to.deep.equal(['sync', 'move', 'add']);
    expect(rowsOf(rep).map((r) => r.getAttribute('data-td-index'))).to.deep.equal(['0', '1', '2']);
  });

  it('remove a row via DOM, then removeRow(0): acts on the current rows (min respected), no stale model', async () => {
    const w = mount(`<td-repeater min-rows="1">${ROW_TPL}${serverRow(0, 'a')}${serverRow(1, 'b')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    const rec = record(rep);
    rowsOf(rep)[0].remove();
    expect(rep.removeRow(0)).to.equal(false, 'only one row left = min');
    expect(names(rep)).to.deep.equal(['b']);
    await wait();
    expect(rec.map((r) => r.reason)).to.deep.equal(['sync']);
  });
});

describe('td-repeater — naming recipe from the docs (decision 7)', () => {
  const rename = (rows) => rows.forEach((row, i) => row.querySelectorAll('[data-name]')
    .forEach((el) => el.setAttribute('name', el.dataset.name.replaceAll('{i}', String(i)))));

  it('listener attached AFTER upgrade + initial call: correct names on load, after add / remove / move, server rows reordered', async () => {
    const w = mount(`<form><td-repeater min-rows="1">
      <template><div data-td-row><input data-name="items[{i}][name]"><td-input-field data-name="items[{i}][qty]"></td-input-field></div></template>
      <div data-td-row><input name="items[0][name]" data-name="items[{i}][name]" value="Sạc"><td-input-field name="items[0][qty]" data-name="items[{i}][qty]" value="1"></td-input-field></div>
      <div data-td-row><input name="items[1][name]" data-name="items[{i}][name]" value="Cáp"><td-input-field name="items[1][qty]" data-name="items[{i}][qty]" value="2"></td-input-field></div>
    </td-repeater></form>`);
    const form = w.querySelector('form');
    const rep = w.querySelector('td-repeater');
    await customElements.whenDefined('td-repeater');
    rep.addEventListener('rows-change', (e) => rename(e.detail.rows));
    rename(rep.rows);
    const dump = () => [...new FormData(form).entries()].map(([k, v]) => `${k}=${v}`);
    expect(dump()).to.deep.equal(['items[0][name]=Sạc', 'items[0][qty]=1', 'items[1][name]=Cáp', 'items[1][qty]=2']);
    btn(rowsOf(rep)[1], 'up').click(); // server rows reordered
    expect(dump()).to.deep.equal(['items[0][name]=Cáp', 'items[0][qty]=2', 'items[1][name]=Sạc', 'items[1][qty]=1']);
    const row = rep.addRow({ at: 1 });
    row.querySelector('input').value = 'Ốp';
    await wait();
    row.querySelector('td-input-field').value = '5';
    expect(dump()).to.deep.equal(['items[0][name]=Cáp', 'items[0][qty]=2', 'items[1][name]=Ốp', 'items[1][qty]=5',
      'items[2][name]=Sạc', 'items[2][qty]=1']);
    rep.removeRow(0);
    expect(dump()).to.deep.equal(['items[0][name]=Ốp', 'items[0][qty]=5', 'items[1][name]=Sạc', 'items[1][qty]=1']);
  });
});

describe('td-repeater — fieldset disabled', () => {
  it('an ancestor <fieldset disabled> disables the native buttons', () => {
    const w = mount(`<fieldset disabled><td-repeater>${ROW_TPL}${serverRow(0, 'a')}</td-repeater></fieldset>`);
    const rep = w.querySelector('td-repeater');
    expect(addBtn(rep).matches(':disabled')).to.equal(true);
    expect(btn(rowsOf(rep)[0], 'remove').matches(':disabled')).to.equal(true);
    addBtn(rep).click();
    expect(rowsOf(rep).length).to.equal(1);
  });

  it('buttons never submit the form', () => {
    const w = mount(`<form><td-repeater>${ROW_TPL}${serverRow(0, 'a')}</td-repeater></form>`);
    let submitted = 0;
    w.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); submitted += 1; });
    const rep = w.querySelector('td-repeater');
    addBtn(rep).click();
    btn(rowsOf(rep)[0], 'down').click();
    btn(rowsOf(rep)[0], 'remove').click();
    expect(submitted).to.equal(0);
  });
});
