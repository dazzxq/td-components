import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import './td-number-input.js';

// v0.59.0 (plan v0.59.0-dsuite-small §C, QĐ C1–C4) — <td-number-input signed>: "+300.000" / "-300.000" / "0" on screen,
// the canonical number everywhere else (value, FormData, events). Real key presses (sendKeys) in Chromium, Firefox AND
// WebKit: typing from empty, sign replacement at / over the leading sign, Backspace / Delete next to the `+`, paste, ↑ / ↓
// across zero, stepper, clamp message, runtime toggle. SSR adoption: case `n-signed` of test/ssr/number.fixtures.json. DOM nodes compared as booleans.
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
const num = (attrs = '') => mount(`<form><td-number-input name="n" ${attrs}></td-number-input></form>`).querySelector('td-number-input');
const ctl = (el) => el.querySelector('input.td-number__control');
const st = (el) => `${ctl(el).value}|${ctl(el).selectionStart}`;
const fd = (el) => new FormData(el.closest('form')).get('n');
function events(el) {
  const rec = { input: [], change: [] };
  el.addEventListener('input', (e) => rec.input.push(e.detail?.value));
  el.addEventListener('change', (e) => rec.change.push(e.detail?.value));
  return rec;
}
async function at(el, s, e = s) {
  const c = ctl(el);
  c.focus();
  c.setSelectionRange(s, e);
  await wait();
}
function paste(el, text) {
  const ev = new ClipboardEvent('paste', { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
  ev.clipboardData.setData('text/plain', text);
  ctl(el).dispatchEvent(ev);
}

describe('v0.59.0 td-number-input signed — display + value', () => {
  it('positive → "+300.000", negative → "-300.000", 0 → "0", empty → ""; value / FormData canonical; property', async () => {
    const el = num('signed min="-1000000" value="300000"');
    await wait();
    expect(ctl(el).value).to.equal('+300.000');
    expect(el.value).to.equal('300000');
    expect(fd(el)).to.equal('300000');
    expect(el.signed).to.equal(true);
    el.value = '-300000';
    expect(ctl(el).value).to.equal('-300.000');
    expect(fd(el)).to.equal('-300000');
    el.value = '0';
    expect(ctl(el).value).to.equal('0');
    el.value = '';
    expect(ctl(el).value).to.equal('');
  });

  it('without `signed` nothing changes (300.000)', async () => {
    const el = num('value="300000"');
    await wait();
    expect(ctl(el).value).to.equal('300.000');
  });

  it('Codex impl r1 #1: toggling signed while focused keeps the caret / selection at the same digits (and back)', async () => {
    const el = num('value="300000"');
    await wait();
    const c = ctl(el);
    await at(el, 3);
    expect(st(el)).to.equal('300.000|3');
    el.signed = true;
    expect(st(el)).to.equal('+300.000|4');
    el.signed = false;
    expect(st(el)).to.equal('300.000|3');
    c.setSelectionRange(1, 5, 'backward');
    el.signed = true;
    expect([c.value, c.selectionStart, c.selectionEnd, c.selectionDirection]).to.deep.equal(['+300.000', 2, 6, 'backward']);
    el.signed = false;
    expect([c.value, c.selectionStart, c.selectionEnd, c.selectionDirection]).to.deep.equal(['300.000', 1, 5, 'backward']);
  });

  it('runtime toggle re-formats in place, keeps focus + the same control', async () => {
    const el = num('value="1500"');
    await wait();
    const c = ctl(el);
    c.focus();
    el.signed = true;
    expect(ctl(el) === c && document.activeElement === c).to.equal(true);
    expect(c.value).to.equal('+1.500');
    el.removeAttribute('signed');
    expect(c.value).to.equal('1.500');
  });
});

describe('v0.59.0 td-number-input signed — typing (real keys)', () => {
  it('from empty: 5 → "+5|", 0 → "+50|"; input events carry canonical values', async () => {
    const el = num('signed decimals="1" min="-1000000"');
    await wait();
    const rec = events(el);
    await at(el, 0);
    await sendKeys({ type: '5' });
    expect(st(el)).to.equal('+5|2');
    await sendKeys({ type: '0' });
    expect(st(el)).to.equal('+50|3');
    expect(rec.input).to.deep.equal(['5', '50']);
  });

  it('sign replacement: caret 0 types "-" → "-50|1"; caret 1 types "+" → "+50|1"; selecting the sign works too', async () => {
    const el = num('signed min="-1000000" value="50"');
    await wait();
    await at(el, 0);
    await sendKeys({ type: '-' });
    expect(st(el)).to.equal('-50|1');
    expect(el.value).to.equal('-50');
    await sendKeys({ type: '+' });
    expect(st(el)).to.equal('+50|1');
    await at(el, 0, 1);
    await sendKeys({ type: '-' });
    expect(st(el)).to.equal('-50|1');
  });

  it('"-" without negatives (no min) is refused', async () => {
    const el = num('signed value="50"');
    await wait();
    await at(el, 0);
    await sendKeys({ type: '-' });
    expect(st(el)).to.equal('+50|0');
    expect(el.value).to.equal('50');
  });

  it('Backspace right after the + / Delete right before it: nothing changes', async () => {
    const el = num('signed value="50"');
    await wait();
    const rec = events(el);
    await at(el, 1);
    await sendKeys({ press: 'Backspace' });
    expect(st(el)).to.equal('+50|1');
    await at(el, 0);
    await sendKeys({ press: 'Delete' });
    expect(st(el)).to.equal('+50|0');
    expect(rec.input).to.deep.equal([]);
  });

  it('deleting every digit leaves a lone "+" (bad, value ""); a lone + then 7 → "+7"; blur on a lone + → empty', async () => {
    const el = num('signed value="5"');
    await wait();
    await at(el, 2);
    await sendKeys({ press: 'Backspace' });
    expect(st(el)).to.equal('+|1');
    expect(el.value).to.equal('');
    expect(el.validity.badInput).to.equal(true);
    await sendKeys({ type: '7' });
    expect(st(el)).to.equal('+7|2');
    await sendKeys({ press: 'Backspace' });
    ctl(el).blur();
    await wait();
    expect(ctl(el).value).to.equal('');
  });

  it('"+" then "0" → "0|1" (zero has no sign); "," "5" → "+0,5|4"', async () => {
    const el = num('signed decimals="1"');
    await wait();
    await at(el, 0);
    await sendKeys({ type: '+' });
    expect(st(el)).to.equal('+|1');
    await sendKeys({ type: '0' });
    expect(st(el)).to.equal('0|1');
    await sendKeys({ type: ',' });
    await sendKeys({ type: '5' });
    expect(st(el)).to.equal('+0,5|4');
    expect(el.value).to.equal('0.5');
  });

  it('select all + type over; insert in the middle keeps the caret after the digit', async () => {
    const el = num('signed value="5"');
    await wait();
    ctl(el).focus();
    ctl(el).select();
    await sendKeys({ type: '1234' });
    expect(st(el)).to.equal('+1.234|6');
    await at(el, 3);
    await sendKeys({ type: '9' });
    expect(st(el)).to.equal('+19.234|3');
  });

  it('a second + anywhere is refused', async () => {
    const el = num('signed value="5"');
    await wait();
    await at(el, 2);
    await sendKeys({ type: '+' });
    expect(st(el)).to.equal('+5|2');
  });
});

describe('v0.59.0 td-number-input signed — paste, step, stepper, clamp', () => {
  it('paste "+300.000" → 300000; "+-3" refused (live region); copy-paste of the field\'s own text round-trips', async () => {
    const el = num('signed min="-1000000"');
    await wait();
    ctl(el).focus();
    paste(el, '+300.000');
    expect(el.value).to.equal('300000');
    expect(ctl(el).value).to.equal('+300.000');
    paste(el, '+-3');
    expect(el.value).to.equal('300000');
    expect(el.querySelector('[role="status"]').textContent).to.equal('Không dán được: giá trị không hợp lệ');
    el.value = '-1500';
    ctl(el).select();
    paste(el, ctl(el).value);
    expect(el.value).to.equal('-1500');
  });

  it('↑ / ↓ across zero: -1 → 0 → +1', async () => {
    const el = num('signed min="-10" value="-1"');
    await wait();
    ctl(el).focus();
    await sendKeys({ press: 'ArrowUp' });
    expect(ctl(el).value).to.equal('0');
    await sendKeys({ press: 'ArrowUp' });
    expect(ctl(el).value).to.equal('+1');
    expect(el.value).to.equal('1');
  });

  it('stepper + changes show the sign; clamp announces the signed value', async () => {
    const el = num('signed stepper max="5" clamp value="4"');
    await wait();
    el.querySelector('.td-number__step--up').click();
    expect(ctl(el).value).to.equal('+5');
    ctl(el).focus();
    ctl(el).select();
    await sendKeys({ type: '9' });
    ctl(el).blur();
    await wait();
    expect(ctl(el).value).to.equal('+5');
    expect(el.querySelector('[role="status"]').textContent).to.equal('Đã chỉnh về +5');
  });
});
