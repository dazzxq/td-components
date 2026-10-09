import { expect } from '@esm-bundle/chai';
import { setViewport, sendKeys } from '@web/test-runner-commands';
import { TdModal } from '../feedback/td-modal.js';
import { TdDatetimePicker } from './td-datetime-picker.js';

// v0.63.0 (plan docs/internal/plans/v0.63.0-typed-dates.md M1 — B, D, D2, D3, E, F) — `editable` on <td-datetime-picker> in
// Chromium, Firefox AND WebKit: the typed commit table (Enter AND blur), the host never sees the input's own `input` / `change`,
// the typed error through the error contract (site error wins), min / max without clamping, the calendar opening at the
// typed value + focus back on the input, touch (coarse → readonly, a tap opens), implicit form submission, required + empty,
// Escape, ArrowDown, the attribute toggled at run time, clearable, disabled / fieldset, setValue while focused.
// Booleans / strings in assertions only (DOM nodes in a failing chai assertion hang the runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(r));
const settle = async () => { await raf(); await raf(); };
const until = async (cond, n = 240) => { for (let i = 0; i < n && !cond(); i++) await raf(); return !!cond(); };
const vp = async (size) => {
  await setViewport(size);
  for (let i = 0; i < 120 && window.innerWidth !== size.width; i++) await raf();
  await raf();
};
const host = document.createElement('div');
host.style.cssText = 'width: 480px; padding: 120px 0 0 40px;';
document.body.appendChild(host);

const pop = () => [...document.querySelectorAll('.td-dtp-pop')].find((p) => !p.closest('.td-modal[data-state="closing"]')) || null;
const visible = (el) => !!el && !el.closest('[hidden]') && getComputedStyle(el).display !== 'none';
const calQ = (sel) => [...(pop() ? pop().querySelectorAll(sel) : [])].find(visible) || null;
const active = () => document.activeElement;

let seq = 0;
/** Mount a picker; `rec` counts what reaches the HOST: CustomEvent `change` (detail kept), any detail-less `change`, any `input`. */
function mount(attrs = 'mode="date" editable', wrap = (h) => h) {
  seq += 1;
  host.innerHTML = wrap(`<td-datetime-picker id="ed${seq}" name="d" label="Ngày" ${attrs}></td-datetime-picker>`);
  const el = host.querySelector('td-datetime-picker');
  const rec = { change: [], bare: 0, input: 0 };
  el.addEventListener('change', (e) => {
    if (e instanceof CustomEvent && e.detail) rec.change.push(e.detail);
    else rec.bare += 1;
  });
  el.addEventListener('input', () => { rec.input += 1; });
  return { el, rec, input: el.querySelector('.td-dtp__input'), trigger: el.querySelector('.td-dtp__trigger') };
}

/** Type `text` into the input (focus, select all, real keys), then commit with Enter or blur (Tab). */
async function typeCommit(m, text, how) {
  m.input.focus();
  m.input.select();
  if (text === '') await sendKeys({ press: 'Backspace' });
  else await sendKeys({ type: text });
  if (how === 'enter') await sendKeys({ press: 'Enter' });
  else if (how === 'blur') await sendKeys({ press: 'Tab' });
  await settle();
}
const note = (m) => {
  const n = m.el.querySelector('.td-field-error');
  return n ? n.textContent : null;
};
const invalid = (m) => m.el.querySelector('.td-dtp__input').getAttribute('aria-invalid');

afterEach(async () => {
  TdModal.closeAll();
  host.innerHTML = '';
  await settle();
});

describe('v0.63.0 editable picker — markup (plan B)', () => {
  it('editable: input combobox + icon button (same .td-dtp__trigger id), label for the input, no name on the input', async () => {
    const m = mount('mode="date" editable value="15/03/1994" required clearable');
    await settle();
    const box = m.el.querySelector('.td-dtp');
    expect(box.classList.contains('td-dtp--editable')).to.equal(true);
    expect(m.input.getAttribute('type')).to.equal('text');
    expect(m.input.id).to.equal(`${m.el.id}-input`);
    expect(m.input.getAttribute('role')).to.equal('combobox');
    expect(m.input.getAttribute('aria-haspopup')).to.equal('dialog');
    expect(m.input.getAttribute('aria-expanded')).to.equal('false');
    expect(m.input.getAttribute('aria-autocomplete')).to.equal('none');
    expect(m.input.getAttribute('autocomplete')).to.equal('off');
    expect(m.input.getAttribute('spellcheck')).to.equal('false');
    expect(m.input.getAttribute('placeholder')).to.equal('dd/mm/yyyy');
    expect(m.input.getAttribute('aria-required')).to.equal('true');
    expect(m.input.hasAttribute('name')).to.equal(false);
    expect(m.input.value).to.equal('15/03/1994');
    expect(m.el.querySelector('.td-field__label').getAttribute('for')).to.equal(`${m.el.id}-input`);
    expect(m.trigger.classList.contains('td-dtp__trigger--icon')).to.equal(true);
    expect(m.trigger.id).to.equal(`${m.el.id}-trigger`);
    expect(m.trigger.getAttribute('aria-label')).to.equal('Chọn ngày');
    expect(m.trigger.hasAttribute('role')).to.equal(false);
    expect(m.trigger.getAttribute('aria-required')).to.equal(null);
    expect(m.el.querySelector('.td-dtp__value')).to.equal(null);
    expect(!!m.el.querySelector('.td-dtp__clear')).to.equal(true);
  });

  it('the form gets ONE entry, from the host (the input has no name)', async () => {
    const m = mount('mode="date" editable value="15/03/1994"', (h) => `<form>${h}</form>`);
    await settle();
    expect(new FormData(host.querySelector('form')).getAll('d')).to.deep.equal(['1994-03-15']);
    expect(m.el.form === host.querySelector('form')).to.equal(true);
  });

  it('without editable the 0.62 trigger is untouched (no input, combobox button)', async () => {
    const m = mount('mode="date" value="15/03/1994"');
    await settle();
    expect(m.input).to.equal(null);
    expect(m.trigger.getAttribute('role')).to.equal('combobox');
    expect(m.trigger.classList.contains('td-dtp__trigger--icon')).to.equal(false);
    expect(m.el.querySelector('.td-dtp__value').textContent).to.equal('15/03/1994');
  });
});

for (const how of ['enter', 'blur']) {
  describe(`v0.63.0 editable picker — commit table by ${how} (plan D, D2, D3)`, () => {
    it('criterion 2: 15031994 → 15/03/1994, ONE change { value, dbValue }; the same again → 0 change', async () => {
      const m = mount();
      await settle();
      await typeCommit(m, '15031994', how);
      expect(m.input.value).to.equal('15/03/1994');
      expect(m.el.getAttribute('value')).to.equal('15/03/1994');
      expect(m.rec.change).to.deep.equal([{ value: '15/03/1994', dbValue: '1994-03-15' }]);
      await typeCommit(m, '15/3/1994', how);
      expect(m.input.value).to.equal('15/03/1994');
      await typeCommit(m, '15/03/1994', how);
      expect(m.rec.change.length).to.equal(1);
      expect(m.rec.input).to.equal(0);
      expect(m.rec.bare).to.equal(0);
      expect(m.el.getValue()).to.equal('15/03/1994');
    });

    it('criterion 3: 31/02/1994 / 15/3/94 / abc → the note, aria-invalid on the input, form invalid, 0 change; fixed → 1 change', async () => {
      const m = mount();
      await settle();
      const want = [['31/02/1994', 'Ngày không hợp lệ'], ['15/3/94', 'Định dạng ngày không hợp lệ'], ['abc', 'Định dạng ngày không hợp lệ']];
      for (const [text, msg] of want) {
        await typeCommit(m, text, how);
        expect(note(m), text).to.equal(msg);
        expect(invalid(m), text).to.equal('true');
        expect(m.input.getAttribute('aria-errormessage')).to.equal(`${m.el.id}-error`);
        expect((m.input.getAttribute('aria-describedby') || '').includes(`${m.el.id}-error`)).to.equal(true);
        expect(m.el.checkValidity(), text).to.equal(false);
        expect(m.el.validity.badInput, text).to.equal(true);
        expect(m.input.value, text).to.equal(text); // the raw text stays
        expect(m.el.getAttribute('value')).to.equal(text);
      }
      expect(m.rec.change.length).to.equal(0);
      await typeCommit(m, '28/02/1994', how);
      expect(note(m)).to.equal(null);
      expect(invalid(m)).to.equal(null);
      expect(m.el.checkValidity()).to.equal(true);
      expect(m.rec.change).to.deep.equal([{ value: '28/02/1994', dbValue: '1994-02-28' }]);
      expect(m.rec.input).to.equal(0);
      expect(m.rec.bare).to.equal(0);
    });

    it('criterion 3: a site error (error-text / setError) wins over the typed error', async () => {
      const m = mount('mode="date" editable error-text="Lỗi của site"');
      await settle();
      expect(note(m)).to.equal('Lỗi của site');
      expect(invalid(m)).to.equal('true');
      await typeCommit(m, 'abc', how);
      expect(note(m)).to.equal('Lỗi của site');
      m.el.removeAttribute('error-text');
      await settle();
      expect(note(m)).to.equal('Định dạng ngày không hợp lệ'); // the typed error shows once the site's is gone
      m.el.setError('Lỗi chạy');
      expect(note(m)).to.equal('Lỗi chạy');
      m.el.clearError();
      expect(note(m)).to.equal('Định dạng ngày không hợp lệ');
      expect(m.rec.change.length).to.equal(0);
    });

    it('criterion 4: max 31/12/1999, 01/01/2000 → "Không được sau 31/12/1999", 0 change, not clamped', async () => {
      const m = mount('mode="date" editable max="31/12/1999"');
      await settle();
      await typeCommit(m, '01/01/2000', how);
      expect(note(m)).to.equal('Không được sau 31/12/1999');
      expect(m.el.getAttribute('value')).to.equal('01/01/2000');
      expect(m.input.value).to.equal('01/01/2000');
      expect(m.el.validity.rangeOverflow).to.equal(true);
      expect(invalid(m)).to.equal('true');
      expect(m.rec.change.length).to.equal(0);
      await typeCommit(m, '31121999', how);
      expect(note(m)).to.equal(null);
      expect(m.rec.change).to.deep.equal([{ value: '31/12/1999', dbValue: '1999-12-31' }]);
      // min too
      m.el.setAttribute('min', '01/01/1990');
      await typeCommit(m, '1989-12-31', how);
      expect(note(m)).to.equal('Không được trước 01/01/1990');
      expect(m.el.validity.rangeUnderflow).to.equal(true);
      expect(m.rec.change.length).to.equal(1);
    });

    it('empty: not required → cleared + one change { "", "" } (only when there was a value); required → error, 0 change', async () => {
      const m = mount('mode="date" editable value="15/03/1994"');
      await settle();
      await typeCommit(m, '', how);
      expect(m.el.hasAttribute('value')).to.equal(false);
      expect(m.input.value).to.equal('');
      expect(m.rec.change).to.deep.equal([{ value: '', dbValue: '' }]);
      await typeCommit(m, '   ', how);
      expect(m.rec.change.length).to.equal(1); // nothing to clear
      const r = mount('mode="date" editable required value="15/03/1994"');
      await settle();
      await typeCommit(r, '', how);
      expect(r.el.hasAttribute('value')).to.equal(false);
      expect(note(r)).to.equal('Vui lòng chọn ngày');
      expect(invalid(r)).to.equal('true');
      expect(r.el.validity.valueMissing).to.equal(true);
      expect(r.rec.change.length).to.equal(0);
      await typeCommit(r, '16/03/1994', how);
      expect(note(r)).to.equal(null);
      expect(r.rec.change).to.deep.equal([{ value: '16/03/1994', dbValue: '1994-03-16' }]);
      expect(r.rec.input + r.rec.bare + m.rec.input + m.rec.bare).to.equal(0);
    });

    it('other modes: datetime (incomplete without a time), month, year', async () => {
      const d = mount('editable');
      await settle();
      await typeCommit(d, '15/3/1994 9:05', how);
      expect(d.rec.change).to.deep.equal([{ value: '15/03/1994 - 09:05', dbValue: '1994-03-15 09:05:00' }]);
      await typeCommit(d, '16/03/1994', how);
      expect(note(d)).to.equal('Vui lòng nhập đầy đủ ngày và giờ');
      expect(d.rec.change.length).to.equal(1);
      const mo = mount('mode="month" editable');
      await settle();
      await typeCommit(mo, '031994', how);
      expect(mo.rec.change).to.deep.equal([{ value: '03/1994', dbValue: '1994-03' }]);
      const y = mount('mode="year" editable');
      await settle();
      await typeCommit(y, '94', how);
      expect(note(y)).to.equal('Định dạng năm không hợp lệ');
      await typeCommit(y, '1994', how);
      expect(y.rec.change).to.deep.equal([{ value: '1994', dbValue: '1994' }]);
    });
  });
}

describe('v0.63.0 editable picker — typing never leaks (D2)', () => {
  it('typing fires no input / change on the host; the uncommitted text changes nothing', async () => {
    const m = mount();
    await settle();
    m.input.focus();
    await sendKeys({ type: '15/03' });
    await settle();
    expect(m.rec.input).to.equal(0);
    expect(m.rec.bare).to.equal(0);
    expect(m.el.hasAttribute('value')).to.equal(false);
    expect(note(m)).to.equal(null);
  });

  it('a stale error stays while the user types (until the next commit)', async () => {
    const m = mount();
    await settle();
    await typeCommit(m, 'abc', 'blur');
    m.input.focus();
    await sendKeys({ type: 'x' });
    expect(note(m)).to.equal('Định dạng ngày không hợp lệ');
  });
});

describe('v0.63.0 editable picker — Escape / ArrowDown / calendar (plan D, F)', () => {
  beforeEach(async () => { await vp({ width: 1024, height: 768 }); });

  it('Escape (calendar closed) puts the committed text back — no commit, no event', async () => {
    const m = mount('mode="date" editable value="15/03/1994"');
    await settle();
    m.input.focus();
    m.input.select();
    await sendKeys({ type: '01/01/2001' });
    await sendKeys({ press: 'Escape' });
    expect(m.input.value).to.equal('15/03/1994');
    await sendKeys({ press: 'Tab' });
    await settle();
    expect(m.el.getAttribute('value')).to.equal('15/03/1994');
    expect(m.rec.change.length).to.equal(0);
  });

  it('criterion 6: the icon button after typing → commits, the calendar opens on the typed month / year, the day selected', async () => {
    const m = mount();
    await settle();
    m.input.focus();
    await sendKeys({ type: '20031994' });
    m.trigger.click();
    expect(await until(() => !!pop()), 'popover open').to.equal(true);
    await settle();
    expect(m.rec.change).to.deep.equal([{ value: '20/03/1994', dbValue: '1994-03-20' }]);
    const cell = calQ('[data-date="1994-03-20"]');
    expect(!!cell).to.equal(true);
    expect(cell.getAttribute('aria-selected')).to.equal('true');
    expect(m.input.getAttribute('aria-expanded')).to.equal('true');
    expect(m.trigger.getAttribute('aria-expanded')).to.equal('true');
    expect(m.input.getAttribute('aria-controls')).to.equal(pop().id);
    // the popover anchors to the whole box (input + button): its left edge follows the box
    const box = m.el.querySelector('.td-dtp').getBoundingClientRect();
    expect(Math.abs(pop().getBoundingClientRect().left - box.left) < 2).to.equal(true);
    // a pick → one more change, the input shows it, the focus back on the INPUT
    calQ('[data-date="1994-03-22"]').click();
    expect(await until(() => !pop())).to.equal(true);
    expect(m.input.value).to.equal('22/03/1994');
    expect(m.rec.change.length).to.equal(2);
    expect(active() === m.input).to.equal(true);
    expect(m.input.getAttribute('aria-expanded')).to.equal('false');
  });

  it('ArrowDown on the input commits and opens; Escape closes back to the input; Alt+ArrowDown too', async () => {
    const m = mount('mode="date" editable value="15/03/1994"');
    await settle();
    m.input.focus();
    m.input.select();
    await sendKeys({ type: '1994-04-02' });
    await sendKeys({ press: 'ArrowDown' });
    expect(await until(() => !!pop())).to.equal(true);
    await settle();
    expect(m.rec.change).to.deep.equal([{ value: '02/04/1994', dbValue: '1994-04-02' }]);
    expect(calQ('[data-date="1994-04-02"]').getAttribute('aria-selected')).to.equal('true');
    expect(pop().contains(active())).to.equal(true);
    await sendKeys({ press: 'Escape' });
    expect(await until(() => !pop())).to.equal(true);
    expect(active() === m.input).to.equal(true);
    await sendKeys({ press: 'Alt+ArrowDown' });
    expect(await until(() => !!pop())).to.equal(true);
    expect(m.rec.change.length).to.equal(1);
  });

  it('an unreadable typed value opens the calendar like a broken value (today); a click into the input closes the popover', async () => {
    const m = mount();
    await settle();
    m.input.focus();
    await sendKeys({ type: 'abc' });
    m.trigger.click();
    expect(await until(() => !!pop())).to.equal(true);
    await settle();
    expect(note(m)).to.equal('Định dạng ngày không hợp lệ');
    const n = new Date();
    const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    expect(!!calQ(`[data-date="${today}"]`)).to.equal(true);
    m.input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    m.input.focus();
    expect(await until(() => !pop())).to.equal(true);
    expect(m.rec.change.length).to.equal(0);
    expect(m.el.getAttribute('value')).to.equal('abc');
  });

  it('a calendar write clears the typed error', async () => {
    const m = mount('mode="date" editable max="31/12/1999"');
    await settle();
    await typeCommit(m, '01/01/2000', 'blur');
    expect(note(m)).to.equal('Không được sau 31/12/1999');
    m.trigger.click();
    expect(await until(() => !!pop())).to.equal(true);
    await settle();
    calQ('[data-date="1999-12-30"]').click();
    expect(await until(() => !pop())).to.equal(true);
    expect(note(m)).to.equal(null);
    expect(invalid(m)).to.equal(null);
    expect(m.rec.change).to.deep.equal([{ value: '30/12/1999', dbValue: '1999-12-30' }]);
  });
});

describe('v0.63.0 editable picker — touch (plan E, criterion 7)', () => {
  let real;
  /** a controllable matchMedia: MQ_COARSE answers `coarse.on`, listeners get `change` */
  const coarse = { on: true, listeners: new Set() };
  beforeEach(() => {
    real = window.matchMedia;
    coarse.on = true;
    coarse.listeners.clear();
    window.matchMedia = (q) => {
      if (q !== '(hover: none) and (pointer: coarse)') return real.call(window, q);
      return {
        get matches() { return coarse.on; },
        media: q,
        addEventListener: (t, fn) => { if (t === 'change') coarse.listeners.add(fn); },
        removeEventListener: (t, fn) => { if (t === 'change') coarse.listeners.delete(fn); },
      };
    };
  });
  afterEach(() => { window.matchMedia = real; });

  it('coarse: the input is readonly + inputmode=none; a tap opens the calendar (sheet below 720); hybrid follows live', async () => {
    await vp({ width: 390, height: 800 });
    try {
      const m = mount('mode="date" editable value="15/03/1994"');
      await settle();
      expect(m.input.readOnly).to.equal(true);
      expect(m.input.getAttribute('inputmode')).to.equal('none');
      m.input.focus();
      m.input.click();
      expect(await until(() => !!pop())).to.equal(true);
      expect(!!pop().closest('.td-modal')).to.equal(true); // the sheet
      await settle();
      TdModal.closeAll();
      expect(await until(() => !pop())).to.equal(true);
      // typing cannot change it: nothing is committed on blur
      m.input.blur();
      expect(m.rec.change.length).to.equal(0);
      // the device gets a pointer (hybrid): typing comes back, in place
      coarse.on = false;
      for (const fn of coarse.listeners) fn({ matches: false });
      expect(m.input.readOnly).to.equal(false);
      expect(m.input.hasAttribute('inputmode')).to.equal(false);
      coarse.on = true;
      for (const fn of coarse.listeners) fn({ matches: true });
      expect(m.input.readOnly).to.equal(true);
    } finally {
      await vp({ width: 1024, height: 768 });
    }
  });
});

describe('v0.63.0 editable picker — form (criterion 8)', () => {
  beforeEach(async () => { await vp({ width: 1024, height: 768 }); });

  it('Enter submits the form with the typed value; an invalid typed value blocks the submit', async () => {
    const m = mount('mode="date" editable required', (h) => `<form>${h}<button type="submit">Gửi</button></form>`);
    await settle();
    const form = host.querySelector('form');
    const sent = [];
    form.addEventListener('submit', (e) => { e.preventDefault(); sent.push(new FormData(form).get('d')); });
    form.addEventListener('invalid', (e) => e.preventDefault(), true); // no validation bubble
    await typeCommit(m, '15031994', 'enter');
    expect(sent).to.deep.equal(['1994-03-15']);
    await typeCommit(m, '31/02/1994', 'enter');
    expect(sent.length).to.equal(1);
    expect(note(m)).to.equal('Ngày không hợp lệ');
    await typeCommit(m, '16/03/1994', 'enter');
    expect(sent).to.deep.equal(['1994-03-15', '1994-03-16']);
  });

  it('form reset → the default value, the typed error goes', async () => {
    const m = mount('mode="date" editable value="15/03/1994"', (h) => `<form>${h}</form>`);
    await settle();
    await typeCommit(m, 'abc', 'blur');
    expect(note(m)).to.equal('Định dạng ngày không hợp lệ');
    host.querySelector('form').reset();
    await settle();
    expect(note(m)).to.equal(null);
    expect(m.input.value).to.equal('15/03/1994');
    expect(m.rec.change.length).to.equal(0);
  });
});

describe('v0.63.0 editable picker — programmatic + attributes', () => {
  beforeEach(async () => { await vp({ width: 1024, height: 768 }); });

  it('setValue / setDBValue / the value attribute while focused: the input follows at once, no change, the typed error goes', async () => {
    const m = mount();
    await settle();
    await typeCommit(m, 'abc', 'blur');
    m.input.focus();
    m.el.setValue('01/02/1995');
    expect(m.input.value).to.equal('01/02/1995');
    expect(note(m)).to.equal(null);
    m.el.setDBValue('1996-03-04');
    expect(m.input.value).to.equal('04/03/1996');
    m.el.setAttribute('value', '05/06/1997');
    expect(m.input.value).to.equal('05/06/1997');
    await sendKeys({ press: 'Tab' }); // blur: the text equals the shown value → no commit
    await settle();
    expect(m.rec.change.length).to.equal(0);
  });

  it('editable toggled at run time: the field re-renders, the value stays, the focus follows, the typed error goes', async () => {
    const m = mount('mode="date" value="15/03/1994"');
    await settle();
    m.trigger.focus();
    m.el.setAttribute('editable', '');
    const input = m.el.querySelector('.td-dtp__input');
    expect(!!input).to.equal(true);
    expect(input.value).to.equal('15/03/1994');
    expect(active() === input).to.equal(true);
    await typeCommit({ ...m, input }, 'abc', 'enter');
    expect(note(m)).to.equal('Định dạng ngày không hợp lệ');
    m.el.removeAttribute('editable');
    await settle();
    expect(m.el.querySelector('.td-dtp__input')).to.equal(null);
    expect(note(m)).to.equal(null); // the typed error went with `editable`
    expect(m.el.querySelector('.td-dtp__trigger').getAttribute('role')).to.equal('combobox');
    expect(m.el.querySelector('.td-dtp__value').textContent).to.equal('abc'); // the raw value is still the value (badInput)
    expect(active() === m.el.querySelector('.td-dtp__trigger')).to.equal(true);
    expect(m.rec.change.length).to.equal(0);
  });

  it('clearable: the clear button clears (one change), the typed error goes, the focus lands on the input', async () => {
    const m = mount('mode="date" editable clearable max="31/12/1999"');
    await settle();
    await typeCommit(m, '01/01/2000', 'blur');
    const clear = m.el.querySelector('.td-dtp__clear');
    expect(clear.hidden).to.equal(false);
    clear.click();
    await settle();
    expect(m.input.value).to.equal('');
    expect(note(m)).to.equal(null);
    expect(m.rec.change).to.deep.equal([{ value: '', dbValue: '' }]);
    expect(active() === m.input).to.equal(true);
    expect(clear.hidden).to.equal(true);
  });

  it('disabled and <fieldset disabled>: the input and the button are disabled; nothing commits', async () => {
    const m = mount('mode="date" editable disabled value="15/03/1994"');
    await settle();
    expect(m.input.disabled).to.equal(true);
    expect(m.trigger.disabled).to.equal(true);
    m.el.removeAttribute('disabled');
    expect(m.input.disabled).to.equal(false);
    const f = mount('mode="date" editable', (h) => `<fieldset>${h}</fieldset>`);
    await settle();
    host.querySelector('fieldset').disabled = true;
    await settle();
    expect(f.input.disabled).to.equal(true);
    expect(f.trigger.disabled).to.equal(true);
    host.querySelector('fieldset').disabled = false;
    await settle();
    expect(f.input.disabled).to.equal(false);
  });

  it('labels per mode: the button name follows `mode`; a site override is used', async () => {
    const m = mount('mode="date" editable');
    await settle();
    m.el.setAttribute('mode', 'month');
    expect(m.trigger.getAttribute('aria-label')).to.equal('Chọn tháng');
    expect(m.input.getAttribute('placeholder')).to.equal('mm/yyyy');
    m.el.setAttribute('mode', 'datetime');
    expect(m.trigger.getAttribute('aria-label')).to.equal('Mở lịch');
    const keep = TdDatetimePicker.labels.openCalendarYear;
    TdDatetimePicker.labels.openCalendarYear = 'Lịch năm';
    try {
      const y = mount('mode="year" editable');
      await settle();
      expect(y.trigger.getAttribute('aria-label')).to.equal('Lịch năm');
    } finally {
      TdDatetimePicker.labels.openCalendarYear = keep;
    }
  });
});

describe('v0.63.0 editable picker — SSR (plan A: markup unchanged, safe render)', () => {
  // exactly what php td_date('d', '1994-03-15', ['id' => …, 'label' => 'Ngày', 'editable' => true]) prints (minus the host attribute)
  const php = (id, editable) => `<td-datetime-picker data-td-ssr="datetime-picker@2" id="${id}" name="d" mode="date" value="15/03/1994" label="Ngày"${editable ? ' editable' : ''}>`
    + `<div class="td-dtp" data-state="closed"><label class="td-field__label" id="${id}-label" for="${id}-native">Ngày</label>`
    + `<input class="td-dtp__native" type="date" id="${id}-native" name="d" value="1994-03-15" max="9999-12-31">`
    + `<button type="button" class="td-dtp__trigger" id="${id}-trigger" role="combobox" aria-haspopup="dialog" aria-expanded="false">`
    + '<span class="td-dtp__value">15/03/1994</span><span class="td-dtp__icon" data-td-icon="calendar" aria-hidden="true"></span></button></div>'
    + '</td-datetime-picker>';
  /** insert server markup with a LIVE (dirty) native value, like a user who typed before the script ran */
  const insert = (html, live) => {
    const form = document.createElement('form');
    form.innerHTML = html; // parsed detached: upgraded only when connected
    form.querySelector('.td-dtp__native').value = live;
    const trigger = form.querySelector('.td-dtp__trigger');
    host.appendChild(form);
    return { form, el: form.querySelector('td-datetime-picker'), trigger };
  };

  it('without editable the same markup is ADOPTED (control) — with editable it is safe-rendered, the live native value kept', async () => {
    seq += 1;
    const a = insert(php(`ssa${seq}`, false), '1994-03-16');
    await settle();
    expect(a.el.querySelector('.td-dtp__trigger') === a.trigger).to.equal(true); // adopted in place
    const b = insert(php(`ssb${seq}`, true), '1994-03-17');
    await settle();
    const input = b.el.querySelector('.td-dtp__input');
    expect(!!input).to.equal(true);
    expect(b.el.querySelector('.td-dtp__native')).to.equal(null);
    expect(b.el.querySelector('.td-dtp__trigger') === b.trigger).to.equal(false); // re-rendered
    expect(input.value).to.equal('17/03/1994');
    expect(b.el.getAttribute('value')).to.equal('17/03/1994');
    expect(new FormData(b.form).getAll('d')).to.deep.equal(['1994-03-17']);
    expect(b.el.hasAttribute('data-td-ssr')).to.equal(false);
  });
});

describe('v0.63.0 editable picker — Codex impl r1 (#1 custom validity, #5 re-check on attribute changes)', () => {
  for (const how of ['enter', 'blur']) {
    it(`#1 a site's setCustomValidity blocks the typed change (${how}); cleared → the next valid commit fires`, async () => {
      const m = mount('mode="date" editable value="10/03/1994"');
      await settle();
      m.el.setCustomValidity('x');
      await typeCommit(m, '15/03/1994', how);
      expect(m.el.getAttribute('value')).to.equal('15/03/1994'); // written
      expect(m.rec.change.length).to.equal(0);
      await typeCommit(m, '', how); // emptied (not required) — no change either while the custom error stands
      expect(m.rec.change.length).to.equal(0);
      m.el.setCustomValidity('');
      await typeCommit(m, '16/03/1994', how);
      expect(m.rec.change).to.deep.equal([{ value: '16/03/1994', dbValue: '1994-03-16' }]);
    });
  }

  it('#1 the calendar path is unchanged: a pick still fires with a custom validity (0.62 behaviour)', async () => {
    await vp({ width: 1024, height: 768 });
    const m = mount('mode="date" value="15/03/1994"');
    await settle();
    m.el.setCustomValidity('x');
    m.trigger.click();
    expect(await until(() => !!pop())).to.equal(true);
    await settle();
    calQ('[data-date="1994-03-16"]').click();
    expect(await until(() => !pop())).to.equal(true);
    expect(m.rec.change.length).to.equal(1);
  });

  it('#5 min / max / required / mode changes re-judge the typed error (gone, or the new message)', async () => {
    const m = mount('mode="date" editable max="31/12/1999"');
    await settle();
    await typeCommit(m, '01/01/2000', 'blur');
    expect(note(m)).to.equal('Không được sau 31/12/1999');
    m.el.setAttribute('max', '31/12/2005');
    expect(note(m)).to.equal(null);
    expect(invalid(m)).to.equal(null);
    m.el.setAttribute('max', '31/12/1990');
    expect(note(m)).to.equal('Không được sau 31/12/1990'); // the value is still the typed one: judged again, new max named
    expect(invalid(m)).to.equal('true');
    m.el.setAttribute('min', '01/01/2001'); // min / max: the first failing rule names it
    m.el.removeAttribute('max');
    expect(note(m)).to.equal('Không được trước 01/01/2001');
    m.el.removeAttribute('min');
    expect(note(m)).to.equal(null);
    // required: an emptied required field loses its error when `required` goes, gets it back when it returns
    const r = mount('mode="date" editable required value="15/03/1994"');
    await settle();
    await typeCommit(r, '', 'blur');
    expect(note(r)).to.equal('Vui lòng chọn ngày');
    r.el.removeAttribute('required');
    expect(note(r)).to.equal(null);
    r.el.setAttribute('required', '');
    expect(note(r)).to.equal('Vui lòng chọn ngày');
    // mode: a raw value kept verbatim is judged by the new mode
    const d = mount('mode="date" editable');
    await settle();
    await typeCommit(d, '31/02/1994', 'blur');
    expect(note(d)).to.equal('Ngày không hợp lệ');
    d.el.setAttribute('mode', 'month');
    expect(note(d)).to.equal('Định dạng tháng không hợp lệ');
    // a calendar write / setValue ends the typed state: later bound changes never raise a typed error
    m.el.setAttribute('max', '31/12/1999');
    m.el.setValue('01/01/2000');
    m.el.setAttribute('max', '31/12/1998');
    expect(note(m)).to.equal(null);
    expect(m.rec.change.length).to.equal(0);
  });
});
