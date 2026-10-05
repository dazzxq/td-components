import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import { TdNumberInput } from './td-number-input.js';

// v0.49.0 (plan docs/internal/plans/v0.49.0-choice-stepper.md M3) — `<td-number-input stepper>`: − / + buttons around the
// field, in Chromium, Firefox AND WebKit with real clicks / keys. DOM nodes are compared as booleans (`a === b`).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const extra = [];
afterEach(async () => {
  extra.splice(0).forEach((f) => f());
  await resetMouse();
});
function mount(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  return wrap;
}
const num = (attrs = '') => mount(`<td-number-input ${attrs}></td-number-input>`).querySelector('td-number-input');
const ctl = (el) => el.querySelector('input.td-number__control');
const down = (el) => el.querySelector('button.td-number__step--down');
const up = (el) => el.querySelector('button.td-number__step--up');
const status = (el) => el.querySelector('[role="status"]');
function events(el) {
  const rec = { log: [], values: [] };
  for (const t of ['input', 'change']) {
    el.addEventListener(t, (e) => { rec.log.push(t); if (t === 'change') rec.values.push(e.detail?.value); });
  }
  return rec;
}
async function clickOn(node) {
  const r = node.getBoundingClientRect();
  await sendMouse({ type: 'click', position: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] });
  await wait();
}

describe('td-number-input stepper — markup (M3)', () => {
  it('two real buttons in the box: type=button, out of the Tab order, named "Giảm / Tăng {label}", aria-controls the field', async () => {
    const el = num('name="qty" label="Số lượng" stepper min="1" max="5" value="1" clamp');
    await wait();
    expect(el.querySelector('.td-field').classList.contains('td-number--stepper')).to.equal(true);
    const box = el.querySelector('.td-number__box');
    const kids = [...box.children].map((n) => n.className.split(' ')[0] + (n.classList.contains('td-number__step--down') ? '-down' : n.classList.contains('td-number__step--up') ? '-up' : ''));
    expect(kids).to.deep.equal(['td-number__step-down', 'td-number__control', 'td-number__step-up']);
    for (const b of [down(el), up(el)]) {
      expect(b.getAttribute('type')).to.equal('button');
      expect(b.getAttribute('tabindex')).to.equal('-1');
      expect(b.getAttribute('aria-controls')).to.equal(ctl(el).id);
      expect(b.querySelector('svg') !== null).to.equal(true);
    }
    expect(down(el).getAttribute('aria-label')).to.equal('Giảm Số lượng');
    expect(up(el).getAttribute('aria-label')).to.equal('Tăng Số lượng');
    expect(down(el).getAttribute('aria-disabled')).to.equal('true'); // value = min
    expect(up(el).hasAttribute('aria-disabled')).to.equal(false);
    expect(getComputedStyle(down(el)).touchAction).to.equal('manipulation');
    // a button inside a form never submits
    expect(ctl(el).getAttribute('role')).to.equal(null); // a textbox (v0.30 QĐ 3), not a spinbutton
    const unnamed = num('stepper');
    await wait();
    expect(down(unnamed).getAttribute('aria-label')).to.equal('Giảm');
    expect(up(unnamed).getAttribute('aria-label')).to.equal('Tăng');
    const aria = num('stepper aria-label="Số lượng iPhone"');
    await wait();
    expect(up(aria).getAttribute('aria-label')).to.equal('Tăng Số lượng iPhone');
  });

  it('prefix / suffix sit inside, between the buttons', async () => {
    const el = num('stepper suffix="cái" unit-label="cái"');
    await wait();
    const names = [...el.querySelector('.td-number__box').children].map((n) => n.localName + '.' + [...n.classList].join('.'));
    expect(names[0]).to.contain('td-number__step--down');
    expect(names[names.length - 1]).to.contain('td-number__step--up');
    expect(names.some((n) => n.includes('td-number__affix--suffix'))).to.equal(true);
  });

  it('without stepper the markup is byte-identical to v0.30 (golden)', async () => {
    const el = num('id="g1" name="price" label="Giá" suffix="₫" min="0" max="100" value="5"');
    await wait();
    expect(el.innerHTML).to.equal('<div class="td-field td-field--md td-number"><label class="td-field__label" id="g1-label" for="g1-control">Giá</label>'
      + '<div class="td-number__box"><input type="text" class="td-number__control" id="g1-control" inputmode="numeric" autocomplete="off" spellcheck="false" aria-describedby="g1-unit">'
      + '<span class="td-number__affix td-number__affix--suffix" aria-hidden="true">₫</span><span id="g1-unit" hidden="">₫</span></div>'
      + '<div class="td-field__footer" hidden=""><div class="td-field__note" id="g1-note" hidden=""></div></div>'
      + '<span class="td-sr-only" id="g1-status" role="status"></span></div>');
  });
});

describe('td-number-input stepper — behaviour (M3)', () => {
  it('+ / − step by `step`, clamp to min / max, empty → min; input + change on every press; live region reads the value', async () => {
    const el = num('name="qty" label="Số lượng" stepper min="1" max="3" suffix="cái"');
    await wait();
    const rec = events(el);
    await clickOn(up(el)); // empty → clamp(0) = 1
    expect(el.value).to.equal('1');
    expect(status(el).textContent).to.equal('1 cái');
    await clickOn(up(el));
    await clickOn(up(el));
    expect(el.value).to.equal('3');
    expect(up(el).getAttribute('aria-disabled')).to.equal('true');
    await clickOn(up(el)); // at max: nothing
    expect(el.value).to.equal('3');
    await clickOn(down(el));
    expect(el.value).to.equal('2');
    expect(rec.log.join(',')).to.equal('input,change,input,change,input,change,input,change');
    expect(rec.values).to.deep.equal(['1', '2', '3', '2']);
    expect(status(el).textContent).to.equal('2 cái');
  });

  it('a press never moves the focus: focused field stays focused (no 2nd change on blur); unfocused stays unfocused', async () => {
    const el = num('stepper min="0" max="10" value="4"');
    await wait();
    document.body.focus();
    await clickOn(up(el));
    expect(document.activeElement === up(el)).to.equal(false);
    expect(el.contains(document.activeElement)).to.equal(false);
    expect(el.value).to.equal('5');
    ctl(el).focus();
    const rec = events(el);
    await clickOn(up(el));
    await clickOn(up(el));
    expect(document.activeElement === ctl(el)).to.equal(true);
    expect(el.value).to.equal('7');
    ctl(el).blur();
    await wait();
    expect(rec.log.join(',')).to.equal('input,change,input,change'); // blur: no second change
  });

  it('aria-disabled at the bounds (not disabled: the pressed button keeps working next time); bounds follow min / max changes', async () => {
    const el = num('stepper min="2" max="4" value="2"');
    await wait();
    expect(down(el).getAttribute('aria-disabled')).to.equal('true');
    expect(down(el).disabled).to.equal(false);
    el.setAttribute('min', '1');
    expect(down(el).hasAttribute('aria-disabled')).to.equal(false);
    el.setAttribute('max', '2');
    expect(up(el).getAttribute('aria-disabled')).to.equal('true');
    el.value = '';
    expect(down(el).hasAttribute('aria-disabled')).to.equal(false);
    expect(up(el).hasAttribute('aria-disabled')).to.equal(false);
    el.value = '1';
    expect(down(el).getAttribute('aria-disabled')).to.equal('true');
  });

  it('keyboard ↑ / ↓ unchanged (same step path), typing still works', async () => {
    const el = num('stepper min="1" max="9" value="5"');
    await wait();
    ctl(el).focus();
    await sendKeys({ press: 'ArrowUp' });
    expect(el.value).to.equal('6');
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'ArrowDown' });
    expect(el.value).to.equal('4');
    ctl(el).select();
    await sendKeys({ type: '8' });
    expect(el.value).to.equal('8');
    expect(up(el).hasAttribute('aria-disabled')).to.equal(false);
  });

  it('disabled / readonly / fieldset disabled → both buttons disabled; enabled again after', async () => {
    const w = mount('<form><fieldset><td-number-input stepper value="3"></td-number-input></fieldset></form>');
    const el = w.querySelector('td-number-input');
    await wait();
    const fs = w.querySelector('fieldset');
    fs.disabled = true;
    await wait();
    expect(down(el).matches(':disabled') && up(el).matches(':disabled')).to.equal(true);
    fs.disabled = false;
    await wait();
    expect(down(el).disabled || up(el).disabled).to.equal(false);
    el.setAttribute('readonly', '');
    expect(down(el).disabled && up(el).disabled).to.equal(true);
    el.removeAttribute('readonly');
    el.setAttribute('disabled', '');
    expect(down(el).disabled && up(el).disabled).to.equal(true);
    el.removeAttribute('disabled');
    expect(down(el).disabled).to.equal(false);
  });

  it('decimals=2 + step=0.5 (BigInt exact); FormData; a press inside a form does not submit', async () => {
    const w = mount('<form><td-number-input name="w" stepper decimals="2" step="0.5" min="0" value="1.25"></td-number-input></form>');
    const el = w.querySelector('td-number-input');
    const form = w.querySelector('form');
    let submitted = 0;
    form.addEventListener('submit', (e) => { e.preventDefault(); submitted += 1; });
    await wait();
    await clickOn(up(el)); // misaligned 1.25 → 1.5
    expect(el.value).to.equal('1.5');
    await clickOn(up(el));
    expect(el.value).to.equal('2');
    await clickOn(down(el));
    expect(el.value).to.equal('1.5');
    expect(ctl(el).value).to.equal('1,5');
    expect([...new FormData(form).entries()]).to.deep.equal([['w', '1.5']]);
    expect(submitted).to.equal(0);
  });

  it('stepper toggled at runtime: re-render keeps the value (and the focus)', async () => {
    const el = num('min="0" value="7"');
    await wait();
    ctl(el).focus();
    el.setAttribute('stepper', '');
    expect(down(el) !== null).to.equal(true);
    expect(el.value).to.equal('7');
    expect(ctl(el).value).to.equal('7');
    expect(document.activeElement === ctl(el)).to.equal(true);
    el.removeAttribute('stepper');
    expect(down(el)).to.equal(null);
    expect(el.value).to.equal('7');
    expect(document.activeElement === ctl(el)).to.equal(true);
  });

  it('the stepper is narrow (token) and usable at 160px', async () => {
    const w = mount('<div id="narrow-x"><td-number-input stepper value="1" min="1"></td-number-input></div>');
    const box = w.querySelector('#narrow-x');
    box.classList.add('td-sr-only-x');
    const el = w.querySelector('td-number-input');
    await wait();
    expect(el.getBoundingClientRect().width).to.be.at.most(9 * 16 + 1);
    const host = w.firstElementChild;
    host.style.setProperty('width', '160px');
    await wait();
    const b = el.querySelector('.td-number__box').getBoundingClientRect();
    expect(b.width).to.be.at.most(161);
    expect(ctl(el).getBoundingClientRect().width).to.be.greaterThan(20);
    expect(TdNumberInput.messages.increase).to.equal('Tăng {label}');
  });
});
