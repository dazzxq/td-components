import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdRepeater } from './td-repeater.js';
import './td-input-field.js';
import './td-toggle.js';
import './td-dropdown.js';
import './td-checkbox.js';

// v0.56.0 (plan docs/internal/plans/v0.56.0-repeater-icons-date.md R6–R11, M1) — <td-repeater> `disabled` / `readonly`
// and the ancestor <fieldset disabled> in Chromium, Firefox AND WebKit. DOM nodes are compared as booleans.
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
  rep.addEventListener('rows-change', (e) => rec.push(e.detail.reason));
  return rec;
}
const rowsOf = (rep) => [...rep.children].filter((c) => c.hasAttribute('data-td-row'));
const kitButtons = (rep) => [...rep.querySelectorAll('.td-repeater__btn, .td-repeater__add')].filter((b) => b.closest('td-repeater') === rep);
const addBtn = (rep) => rep.querySelector(':scope > .td-repeater__footer .td-repeater__add');
const formData = (form) => [...new FormData(form).entries()].map(([k, v]) => `${k}=${v}`);
/** Firefox / WebKit keep the focus on a button that BECOMES disabled (Chromium blurs it) — start from the body. */
const focusable = (el) => { document.activeElement?.blur?.(); el.focus(); return document.activeElement === el; };

/** text input + select + td-input-field + td-toggle + td-dropdown + a checkbox, app-named. */
const ROW = (i, v = '') => `<div data-td-row>
  <input data-td-field="name" name="it[${i}][name]" value="${v}" aria-label="Tên">
  <select data-td-field="unit" name="it[${i}][unit]" aria-label="Đơn vị"><option value="a">A</option><option value="b">B</option></select>
  <td-input-field data-td-field="code" name="it[${i}][code]" label="Mã" value="c${i}"></td-input-field>
  <td-toggle data-td-field="on" name="it[${i}][on]" label="Bật" checked></td-toggle>
  <input type="checkbox" data-td-field="gift" name="it[${i}][gift]" checked aria-label="Quà">
  <textarea name="it[${i}][note]" aria-label="Ghi chú">n${i}</textarea>
  <button type="button" class="app-btn">Chọn ảnh</button>
</div>`;
const TPL = `<template>${ROW('x')}</template>`;
const repHtml = (attrs = '') => `<form><td-repeater label="Dòng"${attrs}>${TPL}${ROW(0, 'A')}${ROW(1, 'B')}</td-repeater></form>`;

describe('td-repeater disabled (R7)', () => {
  it('like <fieldset disabled>: kit buttons + every row control disabled, host aria-disabled, nothing submitted; unlock restores exactly', async () => {
    const w = mount(repHtml(' sortable'));
    const rep = /** @type {any} */ (w.querySelector('td-repeater'));
    const form = w.querySelector('form');
    await tick();
    const before = formData(form);
    expect(before.length).to.be.greaterThan(4);
    rep.disabled = true;
    expect(rep.hasAttribute('disabled')).to.equal(true);
    await tick();
    expect(rep.getAttribute('aria-disabled')).to.equal('true');
    expect(kitButtons(rep).every((b) => b.disabled)).to.equal(true);
    const row = rowsOf(rep)[0];
    for (const sel of ['input[data-td-field="name"]', 'select', 'td-input-field', 'td-toggle', 'input[type=checkbox]', 'textarea', '.app-btn']) {
      expect(row.querySelector(sel).hasAttribute('disabled'), sel).to.equal(true);
    }
    expect(formData(form)).to.deep.equal([]);
    expect(kitButtons(rep).some((b) => focusable(b))).to.equal(false);
    rep.disabled = false;
    await tick();
    expect(rep.hasAttribute('aria-disabled')).to.equal(false);
    expect(kitButtons(rep).some((b) => b.disabled)).to.equal(false);
    expect(rep.querySelectorAll('[disabled]').length).to.equal(0);
    expect(formData(form)).to.deep.equal(before);
  });

  it('a control the APP disabled before keeps `disabled` when the lock goes', async () => {
    const w = mount(repHtml());
    const rep = /** @type {any} */ (w.querySelector('td-repeater'));
    const app = rowsOf(rep)[1].querySelector('textarea');
    app.disabled = true;
    rep.setAttribute('disabled', '');
    rep.removeAttribute('disabled');
    expect(app.disabled).to.equal(true);
    expect(rowsOf(rep)[0].querySelector('textarea').disabled).to.equal(false);
  });

  it('clicks do nothing (no add / remove / move, no announcement); API add / remove / move / value still work', async () => {
    const w = mount(repHtml(' disabled'));
    const rep = /** @type {any} */ (w.querySelector('td-repeater'));
    await tick();
    const rec = record(rep);
    // a click dispatched on a disabled button does not run; force the delegate anyway (target inside the host)
    rowsOf(rep)[0].querySelector('.td-repeater__btn--remove').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    addBtn(rep).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(rec).to.deep.equal([]);
    expect(rep.querySelector('[role="status"]').textContent).to.equal('');
    const added = rep.addRow();
    expect(!!added).to.equal(true);
    expect(rep.moveRow(0, 1)).to.equal(true);
    expect(rep.removeRow(2)).to.equal(true);
    rep.value = [{ name: 'X' }, { name: 'Y' }, { name: 'Z' }];
    expect(rec).to.deep.equal(['add', 'move', 'remove', 'set']);
  });

  it('new rows (addRow / outside insert → sync / value) are locked at once; repeated toggles are idempotent', async () => {
    const w = mount(repHtml(' disabled'));
    const rep = /** @type {any} */ (w.querySelector('td-repeater'));
    await tick();
    const added = rep.addRow();
    expect(added.querySelector('input').disabled).to.equal(true);
    const tmp = document.createElement('div');
    tmp.innerHTML = ROW(9, 'O');
    rep.insertBefore(tmp.firstElementChild, rep.querySelector('.td-repeater__footer'));
    await tick();
    expect(rowsOf(rep)[3].querySelector('input').disabled).to.equal(true);
    rep.value = [{}, {}, {}, {}, {}];
    expect(rowsOf(rep)[4].querySelector('select').disabled).to.equal(true);
    const snap = rep.innerHTML;
    rep.setAttribute('disabled', '');
    rep.disabled = true;
    expect(rep.innerHTML === snap).to.equal(true);
    for (let k = 0; k < 3; k += 1) { rep.disabled = false; rep.disabled = true; }
    rep.disabled = false;
    expect(rep.querySelectorAll('[disabled], [aria-disabled="true"][data-td-repeater-action="add"]').length).to.equal(0);
  });
});

describe('td-repeater readonly (R8)', () => {
  it('structure locked (kit buttons hidden), capable fields readonly / locked, everything still submitted; a warning names the rest', async () => {
    const warns = capture('warn');
    const w = mount(repHtml(' sortable'));
    const rep = /** @type {any} */ (w.querySelector('td-repeater'));
    const form = w.querySelector('form');
    await tick();
    const before = formData(form);
    rep.readonly = true;
    await tick();
    expect(rep.hasAttribute('readonly')).to.equal(true);
    expect(kitButtons(rep).every((b) => b.hidden)).to.equal(true);
    expect(kitButtons(rep).every((b) => getComputedStyle(b).display === 'none')).to.equal(true);
    const row = rowsOf(rep)[0];
    expect(row.querySelector('input[data-td-field="name"]').readOnly).to.equal(true);
    expect(row.querySelector('textarea').readOnly).to.equal(true);
    expect(row.querySelector('td-input-field').hasAttribute('readonly')).to.equal(true);
    expect(row.querySelector('td-toggle').hasAttribute('locked')).to.equal(true);
    expect(row.querySelector('select').hasAttribute('readonly')).to.equal(false);
    expect(row.querySelector('.app-btn').hidden).to.equal(false);
    expect(formData(form)).to.deep.equal(before);
    const w1 = warns.filter((m) => /td-repeater/.test(m) && /readonly/.test(m));
    expect(w1.length).to.equal(1);
    expect(/select/.test(w1[0]) && /checkbox/.test(w1[0])).to.equal(true);
    expect(/td-input-field|td-toggle|textarea/.test(w1[0])).to.equal(false);
    rep.readonly = false;
    await tick();
    expect(rep.querySelectorAll('[readonly], [locked]').length).to.equal(0);
    expect(kitButtons(rep).some((b) => b.hidden)).to.equal(false);
  });

  it('an empty action cluster / footer collapses (no gap left)', async () => {
    const w = mount(repHtml(' readonly'));
    const rep = /** @type {any} */ (w.querySelector('td-repeater'));
    await tick();
    const box = rowsOf(rep)[0].querySelector('.td-repeater__actions');
    expect(getComputedStyle(box).display).to.equal('none');
    expect(parseFloat(getComputedStyle(rep.querySelector('.td-repeater__footer')).paddingTop)).to.equal(0);
  });

  it('TdRepeater.lockField(el, mode) — a site hook takes over a field the kit cannot lock; called with null on unlock', async () => {
    const orig = TdRepeater.lockField;
    extra.push(() => { TdRepeater.lockField = orig; });
    const calls = [];
    TdRepeater.lockField = (el, mode) => {
      if (el.localName !== 'select') return false;
      calls.push(mode);
      el.toggleAttribute('data-site-locked', mode !== null);
      return true;
    };
    const warns = capture('warn');
    const w = mount(repHtml());
    const rep = /** @type {any} */ (w.querySelector('td-repeater'));
    rep.readonly = true;
    expect(rowsOf(rep).every((r) => r.querySelector('select').hasAttribute('data-site-locked'))).to.equal(true);
    rep.readonly = false;
    expect(rep.querySelectorAll('[data-site-locked]').length).to.equal(0);
    expect(calls.includes(null)).to.equal(true);
    expect(warns.filter((m) => /select/.test(m)).length).to.equal(0);
  });
});

describe('td-repeater lock transitions (R6)', () => {
  it('disabled → readonly → null and readonly → disabled leave no owned attribute behind', async () => {
    const w = mount(repHtml(' sortable'));
    const rep = /** @type {any} */ (w.querySelector('td-repeater'));
    await tick();
    const clean = rep.innerHTML;
    rep.disabled = true;
    rep.readonly = true; // disabled wins
    expect(rowsOf(rep)[0].querySelector('input').disabled).to.equal(true);
    rep.disabled = false; // → readonly
    expect(rowsOf(rep)[0].querySelector('input').disabled).to.equal(false);
    expect(rowsOf(rep)[0].querySelector('input').readOnly).to.equal(true);
    expect(rep.hasAttribute('aria-disabled')).to.equal(false);
    expect(kitButtons(rep).every((b) => b.hidden && !b.disabled)).to.equal(true);
    rep.disabled = true; // readonly → disabled
    expect(rowsOf(rep)[0].querySelector('input').readOnly).to.equal(false);
    expect(rep.querySelectorAll('[locked], [readonly]:not(td-repeater)').length).to.equal(0);
    expect(kitButtons(rep).every((b) => !b.hidden && b.disabled)).to.equal(true);
    rep.disabled = false;
    rep.readonly = false;
    await tick();
    expect(rep.querySelectorAll('[disabled], [readonly], [locked]').length).to.equal(0);
    expect(kitButtons(rep).some((b) => b.hidden)).to.equal(false);
    expect(rep.innerHTML.length).to.equal(clean.length);
  });

  /** A reference button built by the test at the same place: `:disabled` is the HTML truth. */
  function probeAt(rep) {
    const b = document.createElement('button');
    b.type = 'button';
    rep.before(b);
    extra.push(() => b.remove());
    return b;
  }

  const CASES = [
    ['fieldset disabled', '<fieldset disabled>{R}</fieldset>', true],
    ['fieldset enabled', '<fieldset>{R}</fieldset>', false],
    ['in the FIRST legend', '<fieldset disabled><legend>{R}</legend></fieldset>', false],
    ['in the SECOND legend', '<fieldset disabled><legend>L</legend><legend>{R}</legend></fieldset>', true],
    ['nested: outer disabled, inner enabled', '<fieldset disabled><fieldset>{R}</fieldset></fieldset>', true],
    ['nested: inner in the outer first legend', '<fieldset disabled><legend><fieldset>{R}</fieldset></legend></fieldset>', false],
    ['nested: inner disabled in the outer first legend', '<fieldset disabled><legend><fieldset disabled>{R}</fieldset></legend></fieldset>', true],
  ];
  for (const [name, html, want] of CASES) {
    it(`fieldset: ${name} → ${want ? 'blocked' : 'free'} (same as a reference button), nothing owned is written`, async () => {
      const w = mount(html.replace('{R}', `<td-repeater sortable>${TPL}${ROW(0, 'A')}${ROW(1, 'B')}</td-repeater>`));
      const rep = /** @type {any} */ (w.querySelector('td-repeater'));
      await tick();
      expect(probeAt(rep).matches(':disabled')).to.equal(want);
      expect(rep._blocked()).to.equal(want);
      expect(rep._ctl._enabled()).to.equal(!want);
      expect(rep.hasAttribute('aria-disabled')).to.equal(false);
      expect(kitButtons(rep).some((b) => b.hasAttribute('disabled') || b.hidden)).to.equal(false);
      const rec = record(rep);
      rowsOf(rep)[1].querySelector('.td-repeater__btn--up').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(rec.length).to.equal(want ? 0 : 1);
    });
  }

  it('fieldset on / off: no owned attribute appears, after re-enable the user can act again', async () => {
    const w = mount(`<fieldset>${'<td-repeater>'}${TPL}${ROW(0, 'A')}${ROW(1, 'B')}</td-repeater></fieldset>`);
    const fs = w.querySelector('fieldset');
    const rep = /** @type {any} */ (w.querySelector('td-repeater'));
    await tick();
    fs.disabled = true;
    expect(rep._blocked()).to.equal(true);
    // the td-* fields update themselves (formDisabledCallback); the REPEATER writes nothing
    expect(rep._owned.size).to.equal(0);
    expect(rep.hasAttribute('aria-disabled')).to.equal(false);
    expect(kitButtons(rep).some((b) => b.hasAttribute('disabled') || b.hidden)).to.equal(false);
    expect(rowsOf(rep)[0].querySelector('input').hasAttribute('disabled')).to.equal(false);
    fs.disabled = false;
    const rec = record(rep);
    addBtn(rep).click();
    expect(rec).to.deep.equal(['add']);
  });

  it('host disabled inside a disabled fieldset: off the fieldset → still locked by the host; and the other way round', async () => {
    const w = mount(`<fieldset disabled><td-repeater disabled>${TPL}${ROW(0, 'A')}</td-repeater></fieldset>`);
    const fs = w.querySelector('fieldset');
    const rep = /** @type {any} */ (w.querySelector('td-repeater'));
    await tick();
    fs.disabled = false;
    expect(rep._blocked()).to.equal(true);
    expect(addBtn(rep).disabled).to.equal(true);
    fs.disabled = true;
    rep.disabled = false;
    expect(rep._blocked()).to.equal(true);
    expect(addBtn(rep).hasAttribute('disabled')).to.equal(false); // the fieldset writes nothing
    expect(addBtn(rep).matches(':disabled')).to.equal(true); // … the browser disables it natively
    fs.disabled = false;
    expect(rep._blocked()).to.equal(false);
  });
});

describe('td-repeater lock + sortable (R6)', () => {
  it('disabled / readonly: the controller is off; a keyboard lift in progress is cancelled when the lock arrives', async () => {
    const w = mount(`<td-repeater sortable>${TPL}${ROW(0, 'A')}${ROW(1, 'B')}${ROW(2, 'C')}</td-repeater>`);
    const rep = /** @type {any} */ (w.querySelector('td-repeater'));
    await tick();
    const h = rowsOf(rep)[1].querySelector('.td-sortable__handle');
    h.focus();
    await sendKeys({ press: 'Space' });
    expect(rep._ctl.state).to.not.equal('idle');
    const rec = record(rep);
    rep.readonly = true;
    expect(rep._ctl.state).to.equal('idle');
    expect(rep._ctl._enabled()).to.equal(false);
    rep.readonly = false;
    rep.disabled = true;
    expect(rep._ctl._enabled()).to.equal(false);
    expect(focusable(h)).to.equal(false);
    rep.disabled = false;
    expect(rep._ctl._enabled()).to.equal(true);
    expect(rec.filter((r) => r === 'move').length).to.equal(0);
  });
});
