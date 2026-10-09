import { expect } from '@esm-bundle/chai';
import { TdModal } from '../feedback/td-modal.js';
import './td-datetime-picker.js';
import './td-datetime-range.js';

// v0.60.0 (plan docs/internal/plans/v0.60.0-calendar-picker.md B1, B4 — M1a / M2) — the implicit 2000–2099 year window
// is gone: without `min` / `max` every representable date (years 1–9999) is a valid value of <td-datetime-picker> AND
// <td-datetime-range>. Driven through the public API only (setValue / setDBValue / validity / FormData), so the cases
// hold for the old dialog and for the calendar that replaces it. Chromium, Firefox AND WebKit. Booleans in assertions.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(r));
const frames = async (n = 2) => { for (let i = 0; i < n; i++) await raf(); };
const host = document.createElement('div');
host.style.width = '480px';
document.body.appendChild(host);
afterEach(async () => {
  TdModal.closeAll();
  await frames(2);
  host.innerHTML = '';
});

function picker(attrs = '') {
  host.innerHTML = `<form><td-datetime-picker name="d" ${attrs}></td-datetime-picker></form>`;
  return host.querySelector('td-datetime-picker');
}
function range(attrs = '') {
  host.innerHTML = `<form><td-datetime-range name="r" ${attrs}></td-datetime-range></form>`;
  return host.querySelector('td-datetime-range');
}
const entries = (el) => [...new FormData(el.closest('form')).entries()].map(([k, v]) => `${k}=${v}`);
const flags = (el) => ['badInput', 'rangeUnderflow', 'rangeOverflow', 'valueMissing', 'customError'].filter((k) => el.validity[k]);

describe('v0.60.0 picker — no min / max = years 1–9999 (B1)', () => {
  // [mode, display value, DB value, ISO form value]
  const VALID = [
    ['date', '15/03/1999', '1999-03-15', '1999-03-15'],
    ['date', '01/01/0001', '0001-01-01', '0001-01-01'],
    ['date', '31/12/9999', '9999-12-31', '9999-12-31'],
    ['date', '15/03/0999', '0999-03-15', '0999-03-15'],
    ['date', '29/02/0004', '0004-02-29', '0004-02-29'],
    ['date', '01/01/2100', '2100-01-01', '2100-01-01'],
    ['datetime', '15/03/1999 - 09:30', '1999-03-15 09:30:00', '1999-03-15T09:30:00'],
    ['datetime', '31/12/9999 - 23:59', '9999-12-31 23:59:00', '9999-12-31T23:59:00'],
    ['month', '03/1999', '1999-03', '1999-03'],
    ['month', '01/0001', '0001-01', '0001-01'],
    ['year', '1999', '1999', '1999'],
    ['year', '0001', '0001', '0001'],
    ['year', '9999', '9999', '9999'],
  ];
  for (const [mode, display, db, iso] of VALID) {
    it(`${mode} ${display}: valid, formatted in the form, getValue / getDBValue`, () => {
      const el = picker(`mode="${mode}"`);
      el.setValue(display);
      expect(flags(el)).to.deep.equal([]);
      expect(el.checkValidity()).to.equal(true);
      expect(el.getValue()).to.equal(display);
      expect(el.getDBValue()).to.equal(db);
      expect(entries(el)).to.deep.equal([`d=${iso}`]);
      expect(el.querySelector('.td-dtp__value').textContent).to.equal(display);
      expect(el.querySelector('.td-dtp__trigger').hasAttribute('aria-invalid')).to.equal(false);
    });
    it(`${mode} ${db}: setDBValue round-trips`, () => {
      const el = picker(`mode="${mode}"`);
      el.setDBValue(db);
      expect(el.getAttribute('value')).to.equal(display);
      expect(el.getDBValue()).to.equal(db);
      expect(flags(el)).to.deep.equal([]);
    });
  }

  it('the value attribute at load is valid too (ISO of the mode accepted)', async () => {
    const el = picker('mode="date" value="1958-07-04"');
    await frames(1);
    expect(el.getValue()).to.equal('04/07/1958');
    expect(flags(el)).to.deep.equal([]);
    expect(entries(el)).to.deep.equal(['d=1958-07-04']);
  });

  it('form-value-format display / db keep the padded 4-digit year', () => {
    const el = picker('mode="date" form-value-format="display"');
    el.setValue('15/03/0999');
    expect(entries(el)).to.deep.equal(['d=15/03/0999']);
    el.setAttribute('form-value-format', 'db');
    expect(entries(el)).to.deep.equal(['d=0999-03-15']);
  });

  it('still badInput: year 0, 3-digit year, 5-digit year, impossible dates (raw string submitted)', () => {
    for (const [mode, v] of [['date', '15/03/0000'], ['date', '15/3/999'], ['date', '15/03/12026'], ['date', '29/02/1900'], ['date', '31/04/1999'],
      ['year', '0000'], ['month', '13/1999'], ['datetime', '15/03/1999 - 24:00']]) {
      const el = picker(`mode="${mode}"`);
      el.setValue(v);
      expect(flags(el), `${mode} ${v}`).to.deep.equal(['badInput']);
      expect(el.getValue(), `${mode} ${v}`).to.equal('');
      expect(entries(el), `${mode} ${v}`).to.deep.equal([`d=${v}`]);
    }
  });

  it('the year message names the real domain: "Năm phải từ 1 đến 9999"', () => {
    const el = picker('mode="date"');
    el.setValue('15/03/0000');
    expect(el.validationMessage).to.equal('Năm phải từ 1 đến 9999');
  });

  it('min / max still bound it (inclusive, either side optional); the other side stays open to 1 / 9999', () => {
    const a = picker('mode="date" min="1970-01-01"');
    a.setValue('31/12/1969');
    expect(flags(a)).to.deep.equal(['rangeUnderflow']);
    a.setValue('01/01/1970');
    expect(flags(a)).to.deep.equal([]);
    a.setValue('31/12/9999');
    expect(flags(a)).to.deep.equal([]);
    const b = picker('mode="date" max="2030-12-31"');
    b.setValue('01/01/2031');
    expect(flags(b)).to.deep.equal(['rangeOverflow']);
    b.setValue('01/01/0001');
    expect(flags(b)).to.deep.equal([]);
    const c = picker('mode="date" min="2026-01-01" max="2026-12-31"');
    c.setValue('31/12/2026');
    expect(flags(c)).to.deep.equal([]);
    c.setValue('15/03/1999');
    expect(flags(c)).to.deep.equal(['rangeUnderflow']);
  });

  it('removing the bounds re-validates in place (a value outside the old window becomes valid)', () => {
    const el = picker('mode="date" min="2026-01-01"');
    el.setValue('15/03/1999');
    expect(flags(el)).to.deep.equal(['rangeUnderflow']);
    el.removeAttribute('min');
    expect(flags(el)).to.deep.equal([]);
    expect(entries(el)).to.deep.equal(['d=1999-03-15']);
  });

  it('form reset / mode change keep a value outside the old window', () => {
    const el = picker('mode="date" value="15/03/1999"');
    el.setValue('01/01/2026');
    el.closest('form').reset();
    expect(el.getValue()).to.equal('15/03/1999');
    el.setAttribute('mode', 'month');
    expect(el.getValue()).to.equal('03/1999');
    expect(flags(el)).to.deep.equal([]);
  });
});

describe('v0.60.0 range — no min / max = years 1–9999 (B4)', () => {
  it('both sides outside the old window: valid, two formatted entries', () => {
    const el = range();
    el.setValue({ start: '15/03/1999', end: '01/01/2100' });
    expect(flags(el)).to.deep.equal([]);
    expect(el.getValue()).to.deep.equal({ start: '15/03/1999', end: '01/01/2100' });
    expect(el.getDBValue()).to.deep.equal({ start: '1999-03-15', end: '2100-01-01' });
    expect(entries(el)).to.deep.equal(['r[start]=1999-03-15', 'r[end]=2100-01-01']);
  });

  it('the limits 01/01/0001 – 31/12/9999 and a zero-padded year', () => {
    const el = range();
    el.setValue({ start: '01/01/0001', end: '31/12/9999' });
    expect(flags(el)).to.deep.equal([]);
    expect(entries(el)).to.deep.equal(['r[start]=0001-01-01', 'r[end]=9999-12-31']);
    el.setDBValue({ start: '0999-03-15', end: '0999-03-16' });
    expect(el.getValue()).to.deep.equal({ start: '15/03/0999', end: '16/03/0999' });
    expect(flags(el)).to.deep.equal([]);
  });

  it('datetime mode too', () => {
    const el = range('mode="datetime"');
    el.setValue({ start: '15/03/1999 - 08:00', end: '15/03/1999 - 17:30' });
    expect(flags(el)).to.deep.equal([]);
    expect(entries(el)).to.deep.equal(['r[start]=1999-03-15T08:00:00', 'r[end]=1999-03-15T17:30:00']);
  });

  it('still invalid: year 0 (badInput, "Năm phải từ 1 đến 9999"), order, min / max', () => {
    const el = range();
    el.setValue({ start: '15/03/0000', end: '16/03/1999' });
    expect(flags(el)).to.deep.equal(['badInput']);
    expect(el.validationMessage).to.equal('Năm phải từ 1 đến 9999');
    el.setValue({ start: '16/03/1999', end: '15/03/1999' });
    expect(flags(el)).to.deep.equal(['customError']);
    const b = range('min="1970-01-01" max="2030-12-31"');
    b.setValue({ start: '31/12/1969', end: '01/01/1970' });
    expect(flags(b)).to.deep.equal(['rangeUnderflow']);
    b.setValue({ start: '01/01/1970', end: '01/01/2031' });
    expect(flags(b)).to.deep.equal(['rangeOverflow']);
    b.setValue({ start: '01/01/1970', end: '31/12/2030' });
    expect(flags(b)).to.deep.equal([]);
  });

  it('max-days counts across the old window edge (29/12/1999 → 02/01/2000 = 5 days)', () => {
    const el = range('max-days="5"');
    el.setValue({ start: '29/12/1999', end: '02/01/2000' });
    expect(flags(el)).to.deep.equal([]);
    el.setValue({ start: '29/12/1999', end: '03/01/2000' });
    expect(flags(el)).to.deep.equal(['customError']);
  });

  it('the dialog of a range without bounds shows a year outside the old window and "Chọn" commits it (v0.61.0: through the calendar)', async () => {
    const el = range();
    el.setValue({ start: '15/03/1999', end: '20/03/1999' });
    await frames(1);
    el.querySelector('.td-dtr__trigger').click();
    await frames(3);
    const modal = [...document.querySelectorAll('body > .td-modal')].pop();
    expect([...modal.querySelectorAll('[role="alert"]')].every((n) => n.hidden)).to.equal(true);
    expect(modal.querySelector('.td-cal__title[data-pick="year"]').textContent).to.equal('1999');
    expect(modal.querySelector('.td-cal__day[data-date="1999-03-15"]').getAttribute('data-range')).to.equal('start');
    let detail = null;
    el.addEventListener('change', (e) => { detail = e.detail; });
    [...modal.querySelectorAll('.td-modal__footer button')].pop().click();
    await frames(3);
    expect(!!detail).to.equal(true);
    expect(detail.dbValue).to.deep.equal({ start: '1999-03-15', end: '1999-03-20' });
    expect(flags(el)).to.deep.equal([]);
  });
});
});
