import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdOtpInput } from './td-otp-input.js';

// v0.27.0 (plan v0.27.0-dsuite-p0a §B) — <td-otp-input> in Chromium, Firefox AND WebKit (group `engines`).
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const extra = [];
afterEach(() => { extra.splice(0).forEach((f) => f()); });

function mount(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  return wrap;
}
const otp = (attrs = '') => mount(`<td-otp-input ${attrs}></td-otp-input>`).querySelector('td-otp-input');
const inputOf = (el) => el.querySelector('input.td-otp__input');
const cellsOf = (el) => [...el.querySelectorAll('.td-otp__cell')];
const shown = (el) => cellsOf(el).map((c) => c.textContent).join('');
/** Replace the whole value like a paste / autofill does (one `input` event). */
function fill(el, raw, inputType) {
  const input = inputOf(el);
  input.value = raw;
  input.dispatchEvent(new InputEvent('input', { bubbles: true, ...(inputType ? { inputType } : {}) }));
}
function completes(el) {
  const rec = [];
  el.addEventListener('complete', (e) => rec.push(e.detail.value));
  return rec;
}

describe('td-otp-input — markup (v0.27.0 §B)', () => {
  it('ONE native text input (numeric keyboard, one-time-code) + 6 decorative cells', () => {
    const el = otp('name="code"');
    const inputs = el.querySelectorAll('input');
    expect(inputs.length).to.equal(1);
    const input = inputs[0];
    expect(input.type).to.equal('text');
    expect(input.getAttribute('inputmode')).to.equal('numeric');
    expect(input.getAttribute('autocomplete')).to.equal('one-time-code');
    const cells = el.querySelector('.td-otp__cells');
    expect(cells.getAttribute('aria-hidden')).to.equal('true');
    expect(cellsOf(el).length).to.equal(6);
    expect(TdOtpInput.LENGTH).to.equal(6);
  });

  it('label attribute → a <label for> naming the input; host aria-label otherwise; a default name last', () => {
    const a = otp('label="Mã xác thực"');
    const lab = a.querySelector('label.td-otp__label');
    expect(lab.textContent).to.equal('Mã xác thực');
    expect(lab.htmlFor).to.equal(inputOf(a).id);
    expect(inputOf(a).labels.length).to.equal(1);
    const b = otp('aria-label="Mã 2FA"');
    expect(inputOf(b).getAttribute('aria-label')).to.equal('Mã 2FA');
    const c = otp();
    expect(inputOf(c).getAttribute('aria-label')).to.equal(TdOtpInput.labels.input);
  });
});

describe('td-otp-input — typing, paste, normalisation', () => {
  it('typing keeps ASCII digits only and draws them in the cells', async () => {
    const el = otp();
    inputOf(el).focus();
    await sendKeys({ type: '1a2 3' });
    expect(el.value).to.equal('123');
    expect(inputOf(el).value).to.equal('123');
    expect(shown(el)).to.equal('123');
    expect(cellsOf(el).map((c) => c.getAttribute('data-state'))).to.deep.equal(['filled', 'filled', 'filled', 'empty', 'empty', 'empty']);
  });

  it('paste with spaces / hyphens / too long / letters → the digits, max 6', () => {
    const el = otp();
    fill(el, '12-34 56', 'insertFromPaste');
    expect(el.value).to.equal('123456');
    fill(el, ' 9 8 7 6 5 4 3 2 1', 'insertFromPaste');
    expect(el.value).to.equal('987654');
    fill(el, 'mã: 4x2', 'insertFromPaste');
    expect(el.value).to.equal('42');
  });

  it('full-width and Arabic-Indic digits are normalised to ASCII', () => {
    const el = otp();
    fill(el, '１２３٤٥٦', 'insertFromPaste');
    expect(el.value).to.equal('123456');
    fill(el, '۷۸۹', 'insertFromPaste');
    expect(el.value).to.equal('789');
  });

  it('typing beyond 6 is ignored at the end; inside a full code it overwrites the digit after the caret', async () => {
    const el = otp();
    inputOf(el).focus();
    await sendKeys({ type: '1234567' });
    expect(el.value).to.equal('123456');
    inputOf(el).setSelectionRange(2, 2);
    await sendKeys({ type: '9' });
    expect(el.value).to.equal('129456');
  });

  it('the caret cell is marked while focused (focus ring on the current cell)', async () => {
    const el = otp();
    inputOf(el).focus();
    await sendKeys({ type: '12' });
    await wait(30);
    const active = cellsOf(el).map((c) => c.hasAttribute('data-active'));
    expect(active).to.deep.equal([false, false, true, false, false, false]);
    inputOf(el).blur();
    await wait(30);
    expect(cellsOf(el).some((c) => c.hasAttribute('data-active'))).to.equal(false);
  });
});

describe('td-otp-input — `complete` (once per generation, never submits)', () => {
  it('fires once when the 6th digit is typed; more input does not fire again; deleting re-arms', async () => {
    const el = otp();
    const rec = completes(el);
    inputOf(el).focus();
    await sendKeys({ type: '123456' });
    expect(rec).to.deep.equal(['123456']);
    await sendKeys({ type: '7' });
    expect(rec.length).to.equal(1);
    await sendKeys({ press: 'Backspace' });
    expect(el.value).to.equal('12345');
    await sendKeys({ type: '0' });
    expect(rec).to.deep.equal(['123456', '123450']);
  });

  it('paste-then-delete right away does not fire twice (dcms2 race)', async () => {
    const el = otp();
    const rec = completes(el);
    fill(el, '246810', 'insertFromPaste');
    fill(el, '24681', 'deleteContentBackward');
    await wait(200);
    expect(rec).to.deep.equal(['246810']);
  });

  it('autofill / SMS one-time-code (one input event, whole value) fires once', () => {
    const el = otp();
    const rec = completes(el);
    fill(el, '654321');
    expect(rec).to.deep.equal(['654321']);
  });

  it('reset() clears and re-arms; programmatic value never fires `complete`', () => {
    const el = otp();
    const rec = completes(el);
    el.value = '111111';
    expect(el.value).to.equal('111111');
    expect(rec.length).to.equal(0);
    el.reset();
    expect(el.value).to.equal('');
    fill(el, '111111', 'insertFromPaste');
    expect(rec).to.deep.equal(['111111']);
  });

  it('does not submit the form on its own', async () => {
    const wrap = mount('<form><td-otp-input name="code"></td-otp-input></form>');
    let submits = 0;
    wrap.querySelector('form').addEventListener('submit', (e) => { submits++; e.preventDefault(); });
    fill(wrap.querySelector('td-otp-input'), '123456', 'insertFromPaste');
    await wait(200);
    expect(submits).to.equal(0);
  });

  it('the native `input` event still reaches the page', () => {
    const el = otp();
    let n = 0;
    el.addEventListener('input', () => { n++; });
    fill(el, '12', 'insertText');
    expect(n).to.equal(1);
  });
});

describe('td-otp-input — form association', () => {
  it('one FormData entry under `name`; required: empty → valueMissing, partial → invalid, full → valid', () => {
    const wrap = mount('<form><td-otp-input name="otp_code" required></td-otp-input></form>');
    const form = wrap.querySelector('form');
    const el = wrap.querySelector('td-otp-input');
    expect(el.checkValidity()).to.equal(false);
    expect(el.validity.valueMissing).to.equal(true);
    fill(el, '123', 'insertText');
    expect(el.checkValidity()).to.equal(false);
    fill(el, '123456', 'insertFromPaste');
    expect(el.checkValidity()).to.equal(true);
    expect(new FormData(form).getAll('otp_code')).to.deep.equal(['123456']);
    expect(inputOf(el).hasAttribute('name'), 'the inner input never submits itself').to.equal(false);
  });

  it('form reset → default value; disabled → input disabled + not submitted; readonly', () => {
    const wrap = mount('<form><td-otp-input name="c" value="000111"></td-otp-input></form>');
    const form = wrap.querySelector('form');
    const el = wrap.querySelector('td-otp-input');
    fill(el, '9', 'insertText');
    form.reset();
    expect(el.value).to.equal('000111');
    el.setAttribute('disabled', '');
    expect(inputOf(el).disabled).to.equal(true);
    expect(new FormData(form).has('c')).to.equal(false);
    el.removeAttribute('disabled');
    el.setAttribute('readonly', '');
    expect(inputOf(el).readOnly).to.equal(true);
  });

  it('error state: error-text / setError → aria-invalid + note; the cells take the error colour', async () => {
    const el = otp('error-text="Mã không đúng"');
    await wait(250); // border-color transition
    expect(inputOf(el).getAttribute('aria-invalid')).to.equal('true');
    expect(el.querySelector('.td-field-error').textContent).to.equal('Mã không đúng');
    const cell = cellsOf(el)[0];
    const errBorder = getComputedStyle(cell).borderTopColor;
    el.clearError();
    expect(inputOf(el).hasAttribute('aria-invalid')).to.equal(false);
    await wait(250);
    expect(getComputedStyle(cell).borderTopColor).to.not.equal(errBorder);
    el.setError('Hết hạn');
    expect(el.querySelector('.td-field-error').textContent).to.equal('Hết hạn');
  });

  it('a label click focuses the input', () => {
    const wrap = mount('<label for="otp-l">Mã</label><td-otp-input id="otp-l"></td-otp-input>');
    wrap.querySelector('label').click();
    expect(document.activeElement === inputOf(wrap.querySelector('td-otp-input'))).to.equal(true);
  });
});

describe('td-otp-input — layout inside a flex row (demo v0.30 finding)', () => {
  it('keeps its full 6-cell width as a flex item (no cyclic % collapse), and still shrinks in a narrow box', async () => {
    const wrap = mount('<td-otp-input label="Mã"></td-otp-input>');
    wrap.style.display = 'flex'; // CSSOM (CSP-safe)
    const el = wrap.querySelector('td-otp-input');
    await wait(0);
    const box = el.querySelector('.td-otp__box');
    const cell = parseFloat(getComputedStyle(el.querySelector('.td-otp')).getPropertyValue('--td-otp-cell-w')) || 2.75;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const full = 6 * cell * rem + 5 * 0.5 * rem;
    expect(Math.abs(box.getBoundingClientRect().width - full) < 1, `box ${box.getBoundingClientRect().width} ≈ ${full}`).to.equal(true);
    wrap.style.width = '160px';
    wrap.style.display = 'block';
    expect(box.getBoundingClientRect().width <= 160.5, 'narrow container → shrinks').to.equal(true);
  });
});
