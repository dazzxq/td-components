import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdNumberInput } from './td-number-input.js';

// v0.30.0 (plan docs/internal/plans/v0.30.0-number-repeater.md M2) — <td-number-input> in Chromium, Firefox AND WebKit
// with real key presses. DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes
// hangs the runner.
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
  console.warn = (...a) => warns.push(a.map(String).join(' '));
  extra.push(() => { console.warn = orig; });
  return warns;
}
const num = (attrs = '') => mount(`<td-number-input ${attrs}></td-number-input>`).querySelector('td-number-input');
const ctl = (el) => el.querySelector('input.td-number__control');
const status = (el) => el.querySelector('[role="status"]');
function events(el) {
  const rec = { input: [], change: [] };
  el.addEventListener('input', (e) => rec.input.push({ value: e.detail?.value, target: e.target === el, custom: e instanceof CustomEvent }));
  el.addEventListener('change', (e) => rec.change.push({ value: e.detail?.value, target: e.target === el, custom: e instanceof CustomEvent }));
  return rec;
}
async function focusAt(el, pos) {
  const c = ctl(el);
  c.focus();
  c.setSelectionRange(pos, pos);
  await wait();
  return c;
}
function paste(el, text) {
  // Firefox copies an init DataTransfer into an EMPTY one for a synthetic event: set the data on the event's own
  const ev = new ClipboardEvent('paste', { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
  ev.clipboardData.setData('text/plain', text);
  ctl(el).dispatchEvent(ev);
  return ev;
}
const formOf = (html) => mount(`<form>${html}</form>`).querySelector('form');

describe('td-number-input — markup + typing (M2)', () => {
  it('textbox (no spinbutton) with field classes; typing 12990000 → 12.990.000, FormData 12990000', async () => {
    const form = formOf('<td-number-input name="price" label="Giá bán" suffix="₫"></td-number-input>');
    const el = form.querySelector('td-number-input');
    const c = ctl(el);
    expect(c.type).to.equal('text');
    expect(c.hasAttribute('role')).to.equal(false);
    expect(c.getAttribute('autocomplete')).to.equal('off');
    expect(el.querySelector('.td-field.td-field--md.td-number > .td-number__box') !== null).to.equal(true);
    expect(el.querySelector('.td-number__affix--suffix').textContent).to.equal('₫');
    expect(el.querySelector('.td-number__affix--suffix').getAttribute('aria-hidden')).to.equal('true');
    c.focus();
    await sendKeys({ type: '12990000' });
    expect(c.value).to.equal('12.990.000');
    expect(c.selectionStart).to.equal(10);
    expect(el.value).to.equal('12990000');
    expect(new FormData(form).get('price')).to.equal('12990000');
  });

  it('typing in the middle of a group keeps the caret after the typed digit', async () => {
    const el = num('value="12990000"');
    const c = await focusAt(el, 4); // 12.9|90.000
    await sendKeys({ type: '5' });
    expect(c.value).to.equal('129.590.000');
    expect(c.selectionStart).to.equal(5);
    expect(el.value).to.equal('129590000');
  });

  it('Backspace right after a group separator deletes the digit before it (no "stuck" caret)', async () => {
    const el = num('value="12990"');
    const c = await focusAt(el, 3); // 12.|990
    await sendKeys({ press: 'Backspace' });
    expect(c.value).to.equal('1.990');
    expect(el.value).to.equal('1990');
    expect(c.selectionStart).to.equal(1);
  });

  it('Delete right before a group separator deletes the digit after it', async () => {
    const el = num('value="12990"');
    const c = await focusAt(el, 2); // 12|.990
    await sendKeys({ press: 'Delete' });
    expect(c.value).to.equal('1.290');
    expect(el.value).to.equal('1290');
    expect(c.value.slice(0, c.selectionStart).replace(/\./g, '')).to.equal('12');
  });

  it('plain Backspace inside digits works and re-groups', async () => {
    const el = num('value="1000"');
    const c = await focusAt(el, 5); // 1.000|
    await sendKeys({ press: 'Backspace' });
    expect(c.value).to.equal('100');
    expect(el.value).to.equal('100');
  });

  it('rejected keys leave the field unchanged and fire no input: letter, 2nd decimal, "-" when min ≥ 0, decimal digit past `decimals`, 31st digit', async () => {
    const a = num('value="12"');
    const ra = events(a);
    const ca = await focusAt(a, 2);
    await sendKeys({ type: 'x' });
    await sendKeys({ type: '-' });
    expect(ca.value).to.equal('12');
    expect(ra.input.length).to.equal(0);
    const b = num('decimals="2" value="1.25"');
    const rb = events(b);
    const cb = await focusAt(b, 4); // 1,25|
    await sendKeys({ type: ',' });
    await sendKeys({ type: '3' });
    expect(cb.value).to.equal('1,25');
    expect(b.value).to.equal('1.25');
    expect(rb.input.length).to.equal(0);
    const d30 = '1'.repeat(30);
    const c = num(`value="${d30}"`);
    const cc = await focusAt(c, ctl(c).value.length);
    const before = cc.value;
    await sendKeys({ type: '9' });
    expect(cc.value).to.equal(before);
    expect(c.value).to.equal(d30);
  });

  it('negative only when min < 0; inputmode text then', async () => {
    const el = num('min="-1000"');
    expect(ctl(el).getAttribute('inputmode')).to.equal('text');
    const c = await focusAt(el, 0);
    await sendKeys({ type: '-500' });
    expect(c.value).to.equal('-500');
    expect(el.value).to.equal('-500');
  });

  it('inputmode: numeric (decimals 0, no negatives) / decimal (decimals > 0) / text (negatives) / a valid host value wins', () => {
    expect(ctl(num()).getAttribute('inputmode')).to.equal('numeric');
    expect(ctl(num('decimals="2"')).getAttribute('inputmode')).to.equal('decimal');
    expect(ctl(num('decimals="2" min="-1"')).getAttribute('inputmode')).to.equal('text');
    expect(ctl(num('inputmode="tel"')).getAttribute('inputmode')).to.equal('tel');
    expect(ctl(num('inputmode="bogus"')).getAttribute('inputmode')).to.equal('numeric');
  });

  it('NumpadDecimal types the decimal separator at the selection (decimals > 0); ignored with decimals = 0', async () => {
    const el = num('decimals="2"');
    const c = await focusAt(el, 0);
    await sendKeys({ type: '12' });
    await sendKeys({ press: 'NumpadDecimal' });
    await sendKeys({ type: '5' });
    expect(c.value).to.equal('12,5');
    expect(el.value).to.equal('12.5');
    expect(c.selectionStart).to.equal(4);
    const z = num();
    const cz = await focusAt(z, 0);
    await sendKeys({ type: '12' });
    await sendKeys({ press: 'NumpadDecimal' });
    expect(cz.value).to.equal('12');
  });

  it('decimals=2 + group-separator="," → decimal "." (vi default would collide)', async () => {
    const el = num('decimals="2" group-separator=","');
    const c = await focusAt(el, 0);
    await sendKeys({ type: '1234.5' });
    expect(c.value).to.equal('1,234.5');
    expect(el.value).to.equal('1234.5');
  });

  it('group-separator " " and "" (none)', () => {
    expect(ctl(num('group-separator=" " value="1234567"')).value).to.equal('1 234 567');
    expect(ctl(num('group-separator="" value="1234567"')).value).to.equal('1234567');
  });

  it('commit on blur: "12," → 12, lone "-" → empty', async () => {
    const el = num('decimals="2" min="-5"');
    const c = await focusAt(el, 0);
    await sendKeys({ type: '12,' });
    expect(c.value).to.equal('12,');
    c.blur();
    expect(c.value).to.equal('12');
    expect(el.value).to.equal('12');
    c.focus();
    c.select();
    await sendKeys({ type: '-' });
    expect(el.validity.badInput).to.equal(true);
    c.blur();
    expect(c.value).to.equal('');
    expect(el.value).to.equal('');
    expect(el.validity.badInput).to.equal(false);
  });

  it('a 25-digit value stays exact (BigInt path, never Number)', async () => {
    const v = '1234567890123456789012345';
    const form = formOf(`<td-number-input name="n" value="${v}"></td-number-input>`);
    const el = form.querySelector('td-number-input');
    expect(ctl(el).value).to.equal('1.234.567.890.123.456.789.012.345');
    expect(new FormData(form).get('n')).to.equal(v);
    expect(el.valueAsNumber).to.be.a('number');
    ctl(el).focus();
    await sendKeys({ press: 'ArrowUp' });
    expect(el.value).to.equal('1234567890123456789012346');
  });
});

describe('td-number-input — events', () => {
  it('one host input per value change (detail clean, target host), one change on blur only when changed since focus', async () => {
    const el = num('name="x"');
    const rec = events(el);
    const c = await focusAt(el, 0);
    await sendKeys({ type: '1234' });
    expect(rec.input.map((r) => r.value)).to.deep.equal(['1', '12', '123', '1234']);
    expect(rec.input.every((r) => r.target && r.custom)).to.equal(true);
    expect(rec.change.length).to.equal(0);
    c.blur();
    expect(rec.change.length).to.equal(1);
    expect(rec.change[0].value).to.equal('1234');
    expect(rec.change[0].target && rec.change[0].custom).to.equal(true);
    c.focus();
    c.blur();
    expect(rec.change.length).to.equal(1);
  });

  it('setValue / value property fire nothing', () => {
    const el = num();
    const rec = events(el);
    el.value = '5000';
    el.setValue('6000');
    expect(rec.input.length + rec.change.length).to.equal(0);
    expect(ctl(el).value).to.equal('6.000');
    expect(el.getValue()).to.equal('6000');
  });
});

describe('td-number-input — paste (M1 table)', () => {
  const ROWS = [
    ['1.234.567', '1234567', '1234567'], ['1,234,567', '1234567', '1234567'], ['1.234,5', null, '1234.5'],
    ['1,234.50', null, '1234.50'], ['12 990 000 ₫', '12990000', '12990000'], ['1.234', '1234', '1234'],
    ['1,234', '1234', '1234'], ['1,5', null, '1.5'], ['1.5', null, '1.5'], ['1.23.456', null, null],
    ['12abc', null, null], ['1e5', null, null], ['-1.000', null, null], ['１２３', '123', '123'],
  ];
  for (const [text, d0, d2] of ROWS) {
    it(`paste ${JSON.stringify(text)}`, async () => {
      for (const [dec, want] of [[0, d0], [2, d2]]) {
        const el = num(`decimals="${dec}" value="7"`);
        const rec = events(el);
        const c = await focusAt(el, 0);
        c.setSelectionRange(0, c.value.length);
        const ev = paste(el, text);
        expect(ev.defaultPrevented).to.equal(true);
        if (want == null) {
          expect(el.value).to.equal('7', `d${dec}`);
          expect(ctl(el).value).to.equal('7');
          expect(status(el).textContent).to.equal(TdNumberInput.messages.pasteRejected);
          expect(rec.input.length).to.equal(0);
        } else {
          expect(el.value).to.equal(want, `d${dec}`);
          expect(rec.input.length).to.equal(1);
        }
      }
    });
  }

  it('digits only: inserted at the selection (30 digits OK, past 30 after replacing the selection → unchanged + pasteRejected)', async () => {
    const e1 = num();
    await focusAt(e1, 0);
    paste(e1, '1'.repeat(30));
    expect(e1.value).to.equal('1'.repeat(30));
    const e2 = num();
    await focusAt(e2, 0);
    paste(e2, '1'.repeat(31));
    expect(e2.value).to.equal('');
    expect(status(e2).textContent).to.equal(TdNumberInput.messages.pasteRejected);
    const v25 = '1234567890123456789012345';
    const e3 = num(`value="${v25}"`);
    const c3 = await focusAt(e3, 2); // after "1."
    paste(e3, '999999');
    expect(e3.value).to.equal(v25);
    c3.setSelectionRange(2, 2);
    paste(e3, '99999');
    expect(e3.value).to.equal(`1${'99999'}${v25.slice(1)}`);
    // replacing a selection: 30 digits again is fine
    const e4 = num(`value="${v25}"`);
    const c4 = await focusAt(e4, 0);
    c4.setSelectionRange(0, c4.value.length);
    paste(e4, '1'.repeat(30));
    expect(e4.value).to.equal('1'.repeat(30));
  });

  it('digits only after the decimal: fraction past `decimals` → unchanged + pasteRejected', async () => {
    const el = num('decimals="2" value="1.5"');
    const c = await focusAt(el, 3);
    paste(el, '25');
    expect(el.value).to.equal('1.5');
    c.setSelectionRange(3, 3);
    paste(el, '2');
    expect(el.value).to.equal('1.52');
  });

  it('drop is blocked', () => {
    const el = num();
    const dt = new DataTransfer();
    dt.setData('text/plain', '123');
    const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
    ctl(el).dispatchEvent(ev);
    expect(ev.defaultPrevented).to.equal(true);
  });

  it('autofill (insertReplacementText / no inputType) → parseLoose of the whole value; refused → previous value', () => {
    const el = num('value="5"');
    const c = ctl(el);
    c.value = '1.234.000 ₫';
    c.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
    expect(el.value).to.equal('1234000');
    expect(c.value).to.equal('1.234.000');
    c.value = 'abc';
    c.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(el.value).to.equal('1234000');
    expect(c.value).to.equal('1.234.000');
  });
});

describe('td-number-input — keyboard steps', () => {
  it('↑ / ↓ = step (default 1), PageUp / PageDown = ×10, clamped to [min, max]; empty → clamp(0)', async () => {
    const el = num('min="1000" max="1050" step="10"');
    const rec = events(el);
    const c = await focusAt(el, 0);
    await sendKeys({ press: 'ArrowUp' });
    expect(el.value).to.equal('1000');
    await sendKeys({ press: 'ArrowUp' });
    expect(el.value).to.equal('1010');
    await sendKeys({ press: 'PageUp' });
    expect(el.value).to.equal('1050');
    await sendKeys({ press: 'ArrowDown' });
    expect(el.value).to.equal('1040');
    await sendKeys({ press: 'PageDown' });
    expect(el.value).to.equal('1000');
    expect(c.value).to.equal('1.000');
    expect(rec.input.map((r) => r.value)).to.deep.equal(['1000', '1010', '1050', '1040', '1000']);
    await sendKeys({ press: 'ArrowDown' }); // at min: unchanged → no event
    expect(rec.input.length).to.equal(5);
  });

  it('misaligned value snaps to the next step (like native stepUp); readonly / disabled: no change', async () => {
    const el = num('value="1501" step="500"');
    await focusAt(el, 0);
    await sendKeys({ press: 'ArrowUp' });
    expect(el.value).to.equal('2000');
    const ro = num('value="5" readonly');
    await focusAt(ro, 0);
    await sendKeys({ press: 'ArrowUp' });
    expect(ro.value).to.equal('5');
  });

  it('wheel never changes the value', async () => {
    const el = num('value="5"');
    const c = await focusAt(el, 0);
    c.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    expect(el.value).to.equal('5');
  });

  it('step="0" / step="-1" are dropped (one warning): no stepMismatch, ↑ uses 1', async () => {
    const warns = captureWarn();
    for (const s of ['0', '-1']) {
      const el = num(`step="${s}" value="5"`);
      expect(el.validity.stepMismatch).to.equal(false);
      await focusAt(el, 0);
      await sendKeys({ press: 'ArrowUp' });
      expect(el.value).to.equal('6');
    }
    expect(warns.filter((w) => w.includes('step')).length).to.equal(2);
  });
});

describe('td-number-input — impl review round 1', () => {
  it('↑ / PageUp never produce a 31-digit value: unchanged, no input event (like a typed 31st digit)', async () => {
    const d30 = '9'.repeat(30);
    const el = num(`value="${d30}"`);
    const rec = events(el);
    await focusAt(el, 0);
    await sendKeys({ press: 'ArrowUp' });
    await sendKeys({ press: 'PageUp' });
    expect(el.value).to.equal(d30);
    expect(rec.input.length).to.equal(0);
    await sendKeys({ press: 'ArrowDown' });
    expect(el.value).to.equal(`${'9'.repeat(29)}8`);
  });

  it('PageUp / PageDown on a misaligned value move 10 steps (not 1)', async () => {
    const el = num('value="1501" step="500"');
    await focusAt(el, 0);
    await sendKeys({ press: 'PageUp' });
    expect(el.value).to.equal('6500');
    el.value = '6501';
    await sendKeys({ press: 'PageDown' });
    expect(el.value).to.equal('2000');
  });

  it('reset restores the captured default even after decimals were reduced (kept, badInput), no event', () => {
    captureWarn();
    const form = formOf('<td-number-input name="p" decimals="2" value="12.5"></td-number-input>');
    const el = form.querySelector('td-number-input');
    const rec = events(el);
    el.setAttribute('decimals', '0');
    el.value = '3';
    form.reset();
    expect(el.value).to.equal('12.5');
    expect(ctl(el).value).to.equal('12,5');
    expect(el.validity.badInput).to.equal(true);
    expect(new FormData(form).get('p')).to.equal('12.5');
    expect(rec.input.length + rec.change.length).to.equal(0);
  });
});

describe('td-number-input — validity + range', () => {
  it('empty ≠ 0: FormData has name="" (never 0), required → valueMissing', () => {
    const form = formOf('<td-number-input name="a"></td-number-input><td-number-input name="b" required></td-number-input><td-number-input name="c" value="0"></td-number-input>');
    const fd = new FormData(form);
    expect(fd.get('a')).to.equal('');
    expect(fd.get('c')).to.equal('0');
    const b = form.querySelectorAll('td-number-input')[1];
    expect(b.validity.valueMissing).to.equal(true);
    expect(b.validationMessage).to.equal(TdNumberInput.messages.valueMissing);
    expect(Number.isNaN(form.querySelector('td-number-input').valueAsNumber)).to.equal(true);
  });

  it('out of range → rangeUnderflow / rangeOverflow with the formatted bound + unit (typing is never blocked by min)', async () => {
    const el = num('min="1000" max="15000000" suffix="₫"');
    const c = await focusAt(el, 0);
    await sendKeys({ type: '5' });
    expect(c.value).to.equal('5');
    expect(el.validity.rangeUnderflow).to.equal(true);
    expect(el.validationMessage).to.equal('Giá trị tối thiểu là 1.000 ₫');
    await sendKeys({ type: '0000000' });
    expect(el.validity.rangeOverflow).to.equal(true);
    expect(el.validationMessage).to.equal('Giá trị tối đa là 15.000.000 ₫');
    c.blur();
    expect(el.value).to.equal('50000000', 'default: reported, never fixed silently');
  });

  it('min absent = implicit floor 0: a negative set by code is reported (rangeUnderflow), never fixed', () => {
    const el = num();
    el.value = '-5';
    expect(el.value).to.equal('-5');
    expect(el.validity.rangeUnderflow).to.equal(true);
    expect(el.validationMessage).to.equal('Giá trị tối thiểu là 0');
  });

  it('clamp (opt-in): clamped on blur + announced', async () => {
    const el = num('min="0" max="10000000" clamp suffix="₫"');
    const rec = events(el);
    const c = await focusAt(el, 0);
    await sendKeys({ type: '15000000' });
    c.blur();
    expect(el.value).to.equal('10000000');
    expect(c.value).to.equal('10.000.000');
    expect(status(el).textContent).to.equal('Đã chỉnh về 10.000.000 ₫');
    expect(rec.change.length).to.equal(1);
    expect(rec.change[0].value).to.equal('10000000');
  });

  it('stepMismatch only with a step attribute; badInput for a lone decimal', async () => {
    const el = num('step="500" value="1200"');
    expect(el.validity.stepMismatch).to.equal(true);
    expect(el.validationMessage).to.equal(TdNumberInput.messages.stepMismatch.replace('{step}', '500'));
    expect(num('value="1201"').validity.stepMismatch).to.equal(false);
    const d = num('decimals="2"');
    const c = await focusAt(d, 0);
    await sendKeys({ type: ',' });
    expect(d.validity.badInput).to.equal(true);
    expect(d.value).to.equal('');
    expect(c.value).to.equal(',');
  });

  it('validate-on="blur" shows the constraint message as the error', async () => {
    const el = num('min="1000" validate-on="blur"');
    const c = await focusAt(el, 0);
    await sendKeys({ type: '5' });
    expect(el.errorMessage).to.equal('');
    c.blur();
    expect(el.errorMessage).to.equal('Giá trị tối thiểu là 1.000');
    expect(c.getAttribute('aria-invalid')).to.equal('true');
  });
});

describe('td-number-input — precision (decimals)', () => {
  it('value / min / max / step with more decimals than `decimals` are dropped + warned (never rounded)', () => {
    const warns = captureWarn();
    const el = num('decimals="2" value="1.234" min="0.001" max="9.999" step="0.005"');
    expect(el.value).to.equal('');
    el.value = '-0.5';
    expect(el.validity.rangeUnderflow).to.equal(true, 'min dropped → implicit 0');
    el.value = '99999';
    expect(el.validity.rangeOverflow).to.equal(false, 'max dropped');
    expect(warns.length >= 4).to.equal(true);
  });

  it('setValue("1.234") with decimals=2 → empty + warning; numbers: safe ones accepted', () => {
    const warns = captureWarn();
    const el = num('decimals="2"');
    el.setValue('1.234');
    expect(el.value).to.equal('');
    expect(warns.length).to.equal(1);
    el.setValue(12.5);
    expect(el.value).to.equal('12.5');
    el.setValue(1e21);
    expect(el.value).to.equal('');
    el.setValue(2 ** 60); // String(n) has no exponent → accepted as written (plan M1: String(n), not the exact 2^60)
    expect(el.value).to.equal(String(2 ** 60));
    el.setValue(Number.NaN);
    expect(el.value).to.equal('');
  });

  it('decimals 2 → 0 while holding 12.5: value kept, badInput (tooManyDecimals), FormData 12.5, bounds re-checked', () => {
    const warns = captureWarn();
    const form = formOf('<td-number-input name="p" decimals="2" value="12.5" step="0.5"></td-number-input>');
    const el = form.querySelector('td-number-input');
    el.setAttribute('decimals', '0');
    expect(el.value).to.equal('12.5');
    expect(ctl(el).value).to.equal('12,5');
    expect(el.validity.badInput).to.equal(true);
    expect(el.validationMessage).to.equal('Tối đa 0 chữ số thập phân');
    expect(new FormData(form).get('p')).to.equal('12.5');
    expect(el.validity.stepMismatch).to.equal(false, 'step 0.5 now invalid → dropped');
    expect(warns.some((w) => w.includes('step'))).to.equal(true);
  });
});

describe('td-number-input — form + lifecycle', () => {
  it('reset → default value; restore (formStateRestoreCallback) = canonical string', async () => {
    const form = formOf('<td-number-input name="p" value="1500"></td-number-input>');
    const el = form.querySelector('td-number-input');
    const c = await focusAt(el, 0);
    c.select();
    await sendKeys({ type: '99' });
    expect(el.value).to.equal('99');
    form.reset();
    expect(el.value).to.equal('1500');
    expect(c.value).to.equal('1.500');
    el.formStateRestoreCallback('2500', 'restore');
    expect(el.value).to.equal('2500');
  });

  it('fieldset disabled: control disabled, nothing submitted, no step', async () => {
    const form = formOf('<fieldset disabled><td-number-input name="p" value="5"></td-number-input></fieldset>');
    const el = form.querySelector('td-number-input');
    expect(ctl(el).disabled).to.equal(true);
    expect(new FormData(form).has('p')).to.equal(false);
    form.querySelector('fieldset').disabled = false;
    expect(ctl(el).disabled).to.equal(false);
  });

  it('value property assigned before upgrade wins over the attribute', async () => {
    const tpl = document.createElement('template');
    tpl.innerHTML = '<td-number-input value="1"></td-number-input>';
    const el = /** @type {any} */ (tpl.content.firstElementChild);
    el.value = '777000';
    document.adoptNode(el);
    const w = mount('');
    w.appendChild(el);
    expect(customElements.get('td-number-input') !== undefined).to.equal(true);
    expect(el.value).to.equal('777000');
    expect(ctl(el).value).to.equal('777.000');
  });

  it('label / host aria-label / external label name the control; aria-describedby has the unit, error (v0.54.0: the note leaves while an error shows)', () => {
    const el = num('label="Giá bán" suffix="₫" unit-label="đồng" helper-text="Đã gồm VAT" error-text="Sai"');
    const c = ctl(el);
    expect(c.labels.length).to.equal(1);
    expect(c.labels[0].textContent).to.contain('Giá bán');
    const ids = c.getAttribute('aria-describedby').split(' ');
    const unit = el.querySelector(`#${CSS.escape(`${el.id}-unit`)}`);
    expect(unit.textContent).to.equal('đồng');
    expect(unit.hidden).to.equal(true);
    for (const id of [`${el.id}-unit`, `${el.id}-error`]) expect(ids.includes(id)).to.equal(true, id);
    expect(ids.includes(`${el.id}-note`)).to.equal(false);
    el.clearError();
    expect(c.getAttribute('aria-describedby').split(' ')).to.include(`${el.id}-note`);
    const b = num('aria-label="Giá vốn" prefix="$"');
    expect(ctl(b).getAttribute('aria-label')).to.equal('Giá vốn');
    expect(b.querySelector(`#${CSS.escape(`${b.id}-unit`)}`).textContent).to.equal('$');
    const w = mount('<label for="ext-n">Hoàn tiền</label><td-number-input id="ext-n"></td-number-input>');
    const ext = w.querySelector('td-number-input');
    expect(ctl(ext).getAttribute('aria-labelledby')).to.equal(w.querySelector('label').id);
  });

  it('required star + aria-required update in place', () => {
    const el = num('label="Giá" required');
    expect(!!el.querySelector('.td-field__required')).to.equal(true);
    expect(ctl(el).getAttribute('aria-required')).to.equal('true');
    el.removeAttribute('required');
    expect(el.querySelector('.td-field__required')).to.equal(null);
  });

  it('XSS: label / prefix / suffix / unit-label / helper-text are text', () => {
    const p = '<img src=x onerror=alert(1)>';
    const el = num(`label="${p}" prefix="${p}" suffix="${p}" unit-label="${p}" helper-text="${p}" placeholder="${p}"`);
    expect(el.querySelector('img')).to.equal(null);
    expect(el.querySelector('.td-field__label').textContent).to.contain('<img');
    expect(el.querySelector('.td-number__affix--prefix').textContent).to.equal(p);
  });

  it('re-connect keeps the value; disabled / readonly attributes update in place', async () => {
    const el = num('value="4200"');
    const parent = el.parentElement;
    parent.removeChild(el);
    parent.appendChild(el);
    await wait();
    expect(el.value).to.equal('4200');
    expect(ctl(el).value).to.equal('4.200');
    const c = ctl(el);
    el.setAttribute('readonly', '');
    expect(c.readOnly).to.equal(true);
    expect(ctl(el) === c).to.equal(true);
  });
});
