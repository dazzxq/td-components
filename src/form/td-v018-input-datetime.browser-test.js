import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdModal } from '../feedback/td-modal.js';
import './td-input-field.js';
import { TdDatetimePicker } from './td-datetime-picker.js';

// v0.18.0 — F2 (<td-input-field> month / datetime-local / time) + F3 (<td-datetime-picker> mode + open-at).
// Plan: docs/internal/plans/v0.18.0-135-feedback-2.md.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const settle = async () => { await frame(); await frame(); await frame(); };
const inForm = (inner) => mount(`<form>${inner}</form>`);
/** the browser's own normalisation of `value` for an input of `type` (the F2 contract) */
const nativeValue = (type, value, attrs = {}) => {
  const i = document.createElement('input');
  i.type = type;
  for (const [k, v] of Object.entries(attrs)) i.setAttribute(k, v);
  i.value = value;
  return i.value;
};

const trig = (el) => el.querySelector('.td-dtp__trigger');
const openModal = () => [...document.querySelectorAll('.td-modal')].find((m) => m.getAttribute('data-state') !== 'closing') || null;
const panel = () => { const m = openModal(); return m ? m.querySelector('.td-dtp-panel') : null; };
const field = (part) => panel().querySelector(`.td-dtp-panel__input[data-part="${part}"]`);
const parts = () => [...panel().querySelectorAll('.td-dtp-panel__input')].map((i) => i.getAttribute('data-part'));
const wheels = () => panel().querySelectorAll('.td-dtp-wheel__list').length;
const button = (label) => [...openModal().querySelectorAll('.td-modal__footer .td-btn')].find((b) => b.textContent.trim() === label);
async function open(el) {
  trig(el).click();
  await settle();
  return panel();
}
/** set a panel number field as a user would (input + change) */
function setField(part, v) {
  const i = field(part);
  i.value = String(v);
  i.dispatchEvent(new Event('input', { bubbles: true }));
  i.dispatchEvent(new Event('change', { bubbles: true }));
}
const pad2 = (n) => String(n).padStart(2, '0');

afterEach(async () => {
  TdModal.closeAll();
  host.innerHTML = '';
  document.querySelectorAll('body > .td-modal').forEach((m) => m.remove());
  await wait(0);
});

// ─── F2 ────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('v0.18.0 F2 — td-input-field month / datetime-local / time', () => {
  for (const [type, value] of [['month', '2024-06'], ['datetime-local', '2024-06-15T10:30'], ['time', '10:30']]) {
    it(`type="${type}": native control of that type, FormData = the control's value`, () => {
      const form = inForm(`<td-input-field id="f" name="v" type="${type}" value="${value}"></td-input-field>`);
      const el = form.querySelector('td-input-field');
      const control = el.querySelector('input.td-field__control');
      expect(control.type).to.equal(type);
      expect(control.hasAttribute('name')).to.equal(false);
      expect(new FormData(form).get('v')).to.equal(value);
      expect(el.getValue()).to.equal(value);
      expect(el.checkValidity()).to.equal(true);
    });
  }

  it('the form value is the NATIVE normalised value (datetime-local space → T, zero seconds dropped)', () => {
    const form = inForm('<td-input-field id="f" name="v" type="datetime-local"></td-input-field>');
    const el = form.querySelector('td-input-field');
    for (const raw of ['2024-06-15 10:30', '2024-06-15T10:30:00', '2024-06-15T10:30:00.000']) {
      el.setValue(raw);
      expect(new FormData(form).get('v')).to.equal(nativeValue('datetime-local', raw));
      expect(el.value).to.equal(nativeValue('datetime-local', raw));
    }
    expect(nativeValue('datetime-local', '2024-06-15 10:30')).to.equal('2024-06-15T10:30');
  });

  it('step="1": seconds are kept for time + datetime-local (FormData + setValue), fractions too', () => {
    const form = inForm('<td-input-field id="t" name="t" type="time" step="1" value="10:30:15"></td-input-field>'
      + '<td-input-field id="d" name="d" type="datetime-local" step="1"></td-input-field>'
      + '<td-input-field id="x" name="x" type="datetime-local" step="0.001"></td-input-field>');
    const [t, d, x] = form.querySelectorAll('td-input-field');
    expect(new FormData(form).get('t')).to.equal('10:30:15');
    expect(t.querySelector('input').getAttribute('step')).to.equal('1'); // picker shows a seconds field
    d.setValue('2024-06-15T10:30:15');
    expect(d.getValue()).to.equal('2024-06-15T10:30:15');
    expect(new FormData(form).get('d')).to.equal('2024-06-15T10:30:15');
    expect(d.checkValidity()).to.equal(true);
    t.setValue('23:59:59');
    expect(new FormData(form).get('t')).to.equal('23:59:59');
    x.setValue('2024-06-15T10:30:15.5');
    const expected = nativeValue('datetime-local', '2024-06-15T10:30:15.5');
    expect(expected.startsWith('2024-06-15T10:30:15.5')).to.equal(true);
    expect(new FormData(form).get('x')).to.equal(expected);
    expect(x.checkValidity()).to.equal(true);
  });

  it('without step, a value with seconds is a stepMismatch (like native), still submitted verbatim', () => {
    const form = inForm('<td-input-field id="t" name="t" type="time" value="10:30:15"></td-input-field>');
    const t = form.querySelector('td-input-field');
    expect(new FormData(form).get('t')).to.equal('10:30:15');
    expect(t.validity.stepMismatch).to.equal(true);
  });

  it('min / max / step → rangeUnderflow / rangeOverflow / stepMismatch with vi messages; forwarded to the control', () => {
    const m = mount('<td-input-field id="m" type="month" min="2024-03" max="2024-09" step="2"></td-input-field>');
    const control = m.querySelector('input');
    expect(control.getAttribute('min')).to.equal('2024-03');
    expect(control.getAttribute('max')).to.equal('2024-09');
    expect(control.getAttribute('step')).to.equal('2');
    m.setValue('2024-01');
    expect(m.validity.rangeUnderflow).to.equal(true);
    expect(m.validationMessage).to.equal('Giá trị tối thiểu là 2024-03');
    m.setValue('2024-10');
    expect(m.validity.rangeOverflow).to.equal(true);
    expect(m.validationMessage).to.equal('Giá trị tối đa là 2024-09');
    m.setValue('2024-04');
    expect(m.validity.stepMismatch).to.equal(true);
    m.setValue('2024-05');
    expect(m.checkValidity()).to.equal(true);

    const t = mount('<td-input-field id="t" type="time" min="08:00" max="17:00" step="900" value="07:00"></td-input-field>');
    expect(t.validity.rangeUnderflow).to.equal(true);
    t.setValue('10:10');
    expect(t.validity.stepMismatch).to.equal(true);
    t.setValue('10:15');
    expect(t.checkValidity()).to.equal(true);
    t.setAttribute('max', '09:00'); // in place
    expect(t.validity.rangeOverflow).to.equal(true);
    expect(t.querySelector('input').getAttribute('max')).to.equal('09:00');

    const d = mount('<td-input-field id="d" type="datetime-local" min="2024-01-01T08:00" value="2023-12-31T23:59"></td-input-field>');
    expect(d.validity.rangeUnderflow).to.equal(true);
  });

  it('required + empty → valueMissing; an unparsable setValue is sanitised to "" by the control', () => {
    const form = inForm('<td-input-field id="t" name="t" type="time" required></td-input-field>');
    const t = form.querySelector('td-input-field');
    expect(t.validity.valueMissing).to.equal(true);
    t.setValue('abc');
    expect(t.getValue()).to.equal('');
    expect(new FormData(form).get('t')).to.equal('');
    expect(t.validity.valueMissing).to.equal(true);
  });

  it('reset restores the initial value (or empty)', () => {
    const form = inForm('<td-input-field id="a" name="a" type="month" value="2024-06"></td-input-field>'
      + '<td-input-field id="b" name="b" type="time" step="1"></td-input-field>');
    const [a, b] = form.querySelectorAll('td-input-field');
    a.setValue('2025-01');
    b.setValue('11:22:33');
    expect(new FormData(form).get('b')).to.equal('11:22:33');
    form.reset();
    expect(a.getValue()).to.equal('2024-06');
    expect(b.getValue()).to.equal('');
    expect(new FormData(form).get('a')).to.equal('2024-06');
    expect(new FormData(form).get('b')).to.equal('');
  });

  it('user input fires one input event; minlength does not apply', () => {
    const el = mount('<td-input-field id="t" type="time" minlength="10"></td-input-field>');
    let n = 0;
    el.addEventListener('input', () => { n += 1; });
    const control = el.querySelector('input');
    control.value = '09:05';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    expect(n).to.equal(1);
    expect(el.value).to.equal('09:05');
    expect(el.validity.tooShort).to.equal(false);
  });
});

// ─── F3 ────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('v0.18.0 F3 — td-datetime-picker modes: value contract', () => {
  it('REGRESSION: default mode (datetime) submits exactly the v0.17.0 ISO string yyyy-mm-ddThh:mm:00', () => {
    const form = inForm('<td-datetime-picker id="p" name="at" value="15/06/2026 - 09:30"></td-datetime-picker>');
    const p = form.querySelector('td-datetime-picker');
    expect(new FormData(form).get('at')).to.equal('2026-06-15T09:30:00');
    expect(p.getValue()).to.equal('15/06/2026 - 09:30');
    expect(p.getDBValue()).to.equal('2026-06-15 09:30:00');
    p.setAttribute('mode', 'datetime');
    expect(new FormData(form).get('at')).to.equal('2026-06-15T09:30:00');
    p.setAttribute('mode', 'bogus'); // unknown → datetime
    expect(new FormData(form).get('at')).to.equal('2026-06-15T09:30:00');
    expect(trig(p).textContent.trim()).to.equal('15/06/2026 - 09:30');
  });

  const table = [
    // mode, display, db, iso, iso input accepted by setValue / attribute
    ['date', '15/06/1985', '1985-06-15', '1985-06-15'],
    ['month', '06/1985', '1985-06', '1985-06'],
    ['year', '1985', '1985', '1985'],
  ];
  for (const [mode, display, db, iso] of table) {
    it(`mode="${mode}": display ${display} / db ${db} / iso ${iso}; setValue, setDBValue, attribute value, formats`, () => {
      const form = inForm(`<td-datetime-picker id="p" name="v" mode="${mode}" min="1900-01-01" value="${display}"></td-datetime-picker>`);
      const p = form.querySelector('td-datetime-picker');
      expect(p.getValue()).to.equal(display);
      expect(p.getDBValue()).to.equal(db);
      expect(new FormData(form).get('v')).to.equal(iso);
      expect(trig(p).textContent.trim()).to.equal(display);
      expect(p.checkValidity()).to.equal(true);
      p.setAttribute('form-value-format', 'display');
      expect(new FormData(form).get('v')).to.equal(display);
      p.setAttribute('form-value-format', 'db');
      expect(new FormData(form).get('v')).to.equal(db);
      p.removeAttribute('form-value-format');

      p.setValue('');
      expect(new FormData(form).get('v')).to.equal(null);
      p.setValue(iso); // the mode's ISO is accepted
      expect(p.getValue()).to.equal(display);
      expect(new FormData(form).get('v')).to.equal(iso);
      p.setValue('');
      p.setDBValue(db);
      expect(p.getValue()).to.equal(display);
      p.setDBValue('garbage');
      expect(p.getValue()).to.equal(display);
      p.setAttribute('value', iso);
      expect(p.getDBValue()).to.equal(db);
      // a datetime-shaped value is malformed for this mode: badInput, submitted raw
      p.setValue('15/06/1985 - 10:00');
      expect(p.getValue()).to.equal('');
      expect(p.validity.badInput).to.equal(true);
    });
  }

  it('placeholder + dialog title / "now" label follow the mode; required message per mode', () => {
    const d = mount('<td-datetime-picker id="d" mode="date" required></td-datetime-picker>');
    const m = mount('<td-datetime-picker id="m" mode="month"></td-datetime-picker>');
    const y = mount('<td-datetime-picker id="y" mode="year"></td-datetime-picker>');
    expect(trig(d).textContent.trim()).to.equal('dd/mm/yyyy');
    expect(trig(m).textContent.trim()).to.equal('mm/yyyy');
    expect(trig(y).textContent.trim()).to.equal('yyyy');
    expect(d.validationMessage).to.equal('Vui lòng chọn ngày');
    y.setAttribute('required', '');
    expect(y.validationMessage).to.equal('Vui lòng chọn năm');
  });

  it('min / max at the mode granularity (month: the month; year: the year) with messages in the mode format', () => {
    const m = mount('<td-datetime-picker id="m" mode="month" min="2024-03-15" max="2024-09-10" value="03/2024"></td-datetime-picker>');
    expect(m.checkValidity()).to.equal(true); // March is allowed although min is the 15th
    m.setValue('09/2024');
    expect(m.checkValidity()).to.equal(true);
    m.setValue('02/2024');
    expect(m.validity.rangeUnderflow).to.equal(true);
    expect(m.validationMessage).to.equal('Không được trước 03/2024');
    m.setValue('10/2024');
    expect(m.validity.rangeOverflow).to.equal(true);
    expect(m.validationMessage).to.equal('Không được sau 09/2024');
    expect(m.getValue()).to.equal('');

    const y = mount('<td-datetime-picker id="y" mode="year" min="1950" max="1999" value="1949"></td-datetime-picker>');
    expect(y.validity.rangeUnderflow).to.equal(true);
    expect(y.validationMessage).to.equal('Không được trước 1950');
    y.setValue('1999');
    expect(y.checkValidity()).to.equal(true);
    y.setValue('2000');
    expect(y.validity.rangeOverflow).to.equal(true);

    const d = mount('<td-datetime-picker id="d" mode="date" max="2026-06-15T08:00" value="15/06/2026"></td-datetime-picker>');
    expect(d.checkValidity()).to.equal(true); // the day of the bound is allowed (no time in date mode)
    d.setValue('16/06/2026');
    expect(d.validity.rangeOverflow).to.equal(true);
    expect(d.validationMessage).to.equal('Không được sau 15/06/2026');
  });

  it('without min/max the default year range 2000–2099 still applies (every mode)', () => {
    const y = mount('<td-datetime-picker id="y" mode="year" value="1985"></td-datetime-picker>');
    expect(y.validity.badInput).to.equal(true);
    y.setValue('2026');
    expect(y.checkValidity()).to.equal(true);
  });

  it('reset after a runtime mode change converts the default into the current mode (review v0.18.0)', () => {
    const form = inForm('<td-datetime-picker id="m" name="m" mode="date" value="15/06/2025"></td-datetime-picker>');
    const el = form.querySelector('td-datetime-picker');
    el.setAttribute('mode', 'month');
    el.setValue('01/2000');
    form.reset();
    expect(el.getValue()).to.equal('06/2025');
    expect(el.validity.badInput).to.equal(false);
    expect(new FormData(form).get('m')).to.equal('2025-06');
    el.setAttribute('mode', 'datetime');
    form.reset();
    expect(el.getValue()).to.equal('15/06/2025 - 00:00');
  });

  it('an incomplete keyboard entry in a native date control is badInput, not empty (review v0.18.0)', async () => {
    const el = mount('<td-input-field type="date" name="d"></td-input-field>');
    const input = el.querySelector('input');
    input.focus();
    await sendKeys({ type: '12' }); // only the first segment
    input.blur();
    await new Promise((r) => setTimeout(r, 50));
    expect(input.value).to.equal('');
    if (!input.validity.badInput) return; // engine keeps partial dates valid-empty: nothing to propagate
    expect(el.validity.badInput).to.equal(true);
    expect(el.checkValidity()).to.equal(false);
  });

  it('reset restores the default value in each mode', () => {
    const form = inForm('<td-datetime-picker id="a" name="a" mode="month" value="06/2026"></td-datetime-picker>'
      + '<td-datetime-picker id="b" name="b" mode="year"></td-datetime-picker>');
    const [a, b] = form.querySelectorAll('td-datetime-picker');
    a.setValue('07/2026');
    b.setValue('2030');
    form.reset();
    expect(a.getValue()).to.equal('06/2026');
    expect(new FormData(form).get('a')).to.equal('2026-06');
    expect(b.getValue()).to.equal('');
    expect(new FormData(form).get('b')).to.equal(null);
  });
});

describe('v0.18.0 F3 — td-datetime-picker modes: dialog', () => {
  it('each mode renders only its fields / wheels, and the preview in the mode format', async () => {
    const expectParts = { datetime: ['day', 'month', 'year'], date: ['day', 'month', 'year'], month: ['month', 'year'], year: ['year'] };
    for (const mode of ['datetime', 'date', 'month', 'year']) {
      host.innerHTML = '';
      const p = mount(`<td-datetime-picker id="p" mode="${mode}" value="${{ datetime: '15/06/2026 - 09:30', date: '15/06/2026', month: '06/2026', year: '2026' }[mode]}"></td-datetime-picker>`);
      await open(p);
      expect(parts()).to.deep.equal(expectParts[mode]);
      expect(wheels()).to.equal(mode === 'datetime' ? 2 : 0);
      expect(panel().getAttribute('data-mode')).to.equal(mode);
      const preview = panel().querySelector('.td-dtp-panel__preview').textContent;
      expect(preview).to.equal({ datetime: '15/06/2026 - 09:30', date: '15/06/2026', month: '06/2026', year: '2026' }[mode]);
      expect(openModal().querySelector('.td-modal__title, h2')?.textContent.trim())
        .to.equal({ datetime: 'Chọn ngày giờ', date: 'Chọn ngày', month: 'Chọn tháng', year: 'Chọn năm' }[mode]);
      TdModal.closeAll();
      await wait(0);
    }
  });

  for (const [mode, set, display, db, iso] of [
    ['date', { day: 3, month: 2, year: 2027 }, '03/02/2027', '2027-02-03', '2027-02-03'],
    ['month', { month: 11, year: 2027 }, '11/2027', '2027-11', '2027-11'],
    ['year', { year: 2031 }, '2031', '2031', '2031'],
  ]) {
    it(`mode="${mode}": choosing commits ${display}; change detail { value, dbValue } in the mode format; FormData ${iso}`, async () => {
      const form = inForm(`<td-datetime-picker id="p" name="v" mode="${mode}"></td-datetime-picker>`);
      const p = form.querySelector('td-datetime-picker');
      const details = [];
      p.addEventListener('change', (e) => details.push(e.detail));
      await open(p);
      for (const [k, v] of Object.entries(set)) setField(k, v);
      button('Chọn').click();
      await settle();
      expect(details.length).to.equal(1);
      expect(details[0].value).to.equal(display);
      expect(details[0].dbValue).to.equal(db);
      expect(p.getAttribute('value')).to.equal(display);
      expect(new FormData(form).get('v')).to.equal(iso);
    });
  }

  it('"Hôm nay" / "Tháng này" / "Năm nay" set the pending value to now (mode components only)', async () => {
    const now = new Date();
    const p = mount('<td-datetime-picker id="p" mode="month"></td-datetime-picker>');
    await open(p);
    button('Tháng này').click();
    expect(field('month').value).to.equal(String(now.getMonth() + 1));
    expect(field('year').value).to.equal(String(now.getFullYear()));
    button('Chọn').click();
    await settle();
    expect(p.getValue()).to.equal(`${pad2(now.getMonth() + 1)}/${now.getFullYear()}`);
  });

  it('month: an empty month field → incomplete message on that field; out of range refuses "Chọn"', async () => {
    const p = mount('<td-datetime-picker id="p" mode="month" min="2024-03" max="2024-09"></td-datetime-picker>');
    await open(p);
    setField('month', '');
    const err = panel().querySelector('.td-dtp-panel__error');
    expect(err.hidden).to.equal(false);
    expect(err.textContent).to.equal('Vui lòng nhập đầy đủ tháng, năm');
    expect(field('month').getAttribute('aria-invalid')).to.equal('true');
    setField('month', 2);
    expect(err.textContent).to.equal('Không được trước 03/2024');
    button('Chọn').click();
    await settle();
    expect(panel()).to.not.equal(null);
    expect(p.getValue()).to.equal('');
  });
});

describe('v0.18.0 F3 — changing mode with a value', () => {
  it('narrowing: datetime → date drops the time; date → month drops the day; month → year drops the month', () => {
    const form = inForm('<td-datetime-picker id="p" name="v" min="1900-01-01" value="15/06/1985 - 10:45"></td-datetime-picker>');
    const p = form.querySelector('td-datetime-picker');
    let changes = 0;
    p.addEventListener('change', () => { changes += 1; });
    p.setAttribute('mode', 'date');
    expect(p.getAttribute('value')).to.equal('15/06/1985');
    expect(new FormData(form).get('v')).to.equal('1985-06-15');
    p.setAttribute('mode', 'month');
    expect(p.getAttribute('value')).to.equal('06/1985');
    expect(new FormData(form).get('v')).to.equal('1985-06');
    p.setAttribute('mode', 'year');
    expect(p.getAttribute('value')).to.equal('1985');
    expect(new FormData(form).get('v')).to.equal('1985');
    expect(trig(p).textContent.trim()).to.equal('1985');
    expect(changes).to.equal(0);
  });

  it('expanding: new components get month 01 / day 01 / 00:00 (date → datetime = 00:00; year → datetime)', () => {
    const form = inForm('<td-datetime-picker id="p" name="v" mode="date" min="1900-01-01" value="15/06/1985"></td-datetime-picker>');
    const p = form.querySelector('td-datetime-picker');
    let changes = 0;
    p.addEventListener('change', () => { changes += 1; });
    p.setAttribute('mode', 'datetime');
    expect(p.getAttribute('value')).to.equal('15/06/1985 - 00:00');
    expect(new FormData(form).get('v')).to.equal('1985-06-15T00:00:00');
    p.setAttribute('mode', 'year');
    p.setAttribute('mode', 'datetime');
    expect(p.getAttribute('value')).to.equal('01/01/1985 - 00:00');
    p.setAttribute('mode', 'month');
    expect(p.getAttribute('value')).to.equal('01/1985');
    p.setValue('06/1985');
    p.setAttribute('mode', 'date');
    expect(p.getAttribute('value')).to.equal('01/06/1985');
    expect(changes).to.equal(0);
  });

  it('the converted value is clamped into [min, max]; an unusable value is kept verbatim', () => {
    const p = mount('<td-datetime-picker id="p" mode="year" min="2024-03-10" max="2030-01-01" value="2024"></td-datetime-picker>');
    p.setAttribute('mode', 'date'); // 01/01/2024 < min → min
    expect(p.getAttribute('value')).to.equal('10/03/2024');
    expect(p.checkValidity()).to.equal(true);
    p.setValue('nope');
    p.setAttribute('mode', 'month');
    expect(p.getAttribute('value')).to.equal('nope');
    expect(p.validity.badInput).to.equal(true);
  });

  it('a mode change while open closes the dialog', async () => {
    const p = mount('<td-datetime-picker id="p" value="15/06/2026 - 09:30"></td-datetime-picker>');
    await open(p);
    p.setAttribute('mode', 'date');
    await settle();
    expect(panel()).to.equal(null);
    await open(p);
    expect(parts()).to.deep.equal(['day', 'month', 'year']);
    expect(wheels()).to.equal(0);
  });
});

describe('v0.18.0 F3 — open-at + year range', () => {
  const today = new Date();

  // v0.19.0 G6: without open-at the picker opens at today (the 0.18.0 "min < 2000 → min" rule is gone) — this case
  // now needs open-at="min"; the default is covered in td-v019-datetime-picker.browser-test.js.
  it('min="1950-01-01" + open-at="min" opens at 1950', async () => {
    const p = mount('<td-datetime-picker id="p" mode="date" min="1950-01-01" open-at="min"></td-datetime-picker>');
    await open(p);
    expect(field('year').value).to.equal('1950');
    expect(field('month').value).to.equal('1');
    expect(field('day').value).to.equal('1');
    expect(field('year').min).to.equal('1950'); // year field covers the range below 2000
    button('Chọn').click();
    await settle();
    expect(p.getValue()).to.equal('01/01/1950');
  });

  it('a min year ≥ 2000 without open-at opens at today (clamped)', async () => {
    const p = mount('<td-datetime-picker id="p" min="2001-01-01"></td-datetime-picker>');
    await open(p);
    expect(field('year').value).to.equal(String(today.getFullYear()));
    TdModal.closeAll();
    await wait(0);
    host.innerHTML = '';
    const q = mount('<td-datetime-picker id="q" mode="date" min="2001-01-01" max="2005-06-30"></td-datetime-picker>');
    await open(q);
    expect(field('year').value).to.equal('2005'); // today clamped to max
    expect(field('month').value).to.equal('6');
    expect(field('day').value).to.equal('30');
  });

  it('open-at="min" / "max" / a date; explicit open-at wins over the default (today)', async () => {
    const cases = [
      ['open-at="max" min="1950-01-01" max="1960-12-31"', { year: '1960', month: '12', day: '31' }],
      ['open-at="min" min="2010-05-20"', { year: '2010', month: '5', day: '20' }],
      ['open-at="1975-08-09" min="1950-01-01" max="1999-12-31"', { year: '1975', month: '8', day: '9' }],
      ['open-at="09/08/1975" min="1950-01-01"', { year: '1975', month: '8', day: '9' }],
      ['open-at="1940-01-01" min="1950-01-01"', { year: '1950', month: '1', day: '1' }], // clamped
      [`open-at="today" min="1950-01-01"`, { year: String(today.getFullYear()), month: String(today.getMonth() + 1), day: String(today.getDate()) }],
      ['open-at="garbage" min="1950-06-01" max="1960-12-31"', { year: '1960', month: '12', day: '31' }], // invalid → today, clamped (v0.19.0)
    ];
    for (const [attrs, want] of cases) {
      host.innerHTML = '';
      const p = mount(`<td-datetime-picker id="p" mode="date" ${attrs}></td-datetime-picker>`);
      await open(p);
      expect({ year: field('year').value, month: field('month').value, day: field('day').value }, attrs).to.deep.equal(want);
      TdModal.closeAll();
      await wait(0);
    }
  });

  it('open-at is ignored when a value is set; year / month modes open at the bound', async () => {
    const p = mount('<td-datetime-picker id="p" mode="year" min="1920" max="1980" open-at="max" value="1955"></td-datetime-picker>');
    await open(p);
    expect(field('year').value).to.equal('1955');
    expect(field('year').min).to.equal('1920');
    expect(field('year').max).to.equal('1980');
    TdModal.closeAll();
    await wait(0);
    p.setValue('');
    await open(p);
    expect(field('year').value).to.equal('1980');
    TdModal.closeAll();
    await wait(0);
    host.innerHTML = '';
    const m = mount('<td-datetime-picker id="m" mode="month" min="1930-04" open-at="min"></td-datetime-picker>');
    await open(m);
    expect(field('month').value).to.equal('4');
    expect(field('year').value).to.equal('1930');
  });

  it('datetime mode: open-at="min" opens at min incl. its time', async () => {
    const p = mount('<td-datetime-picker id="p" min="1960-03-04T07:15" open-at="min"></td-datetime-picker>');
    await open(p);
    expect(field('year').value).to.equal('1960');
    button('Chọn').click();
    await settle();
    expect(p.getValue()).to.equal('04/03/1960 - 07:15');
  });

  it('labels per mode are overridable (fallback to the datetime key)', () => {
    const saved = TdDatetimePicker.labels.placeholderYear;
    TdDatetimePicker.labels.placeholderYear = 'Năm (yyyy)';
    try {
      const y = mount('<td-datetime-picker id="y" mode="year"></td-datetime-picker>');
      expect(trig(y).textContent.trim()).to.equal('Năm (yyyy)');
    } finally {
      TdDatetimePicker.labels.placeholderYear = saved;
    }
  });
});
