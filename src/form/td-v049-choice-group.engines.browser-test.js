import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import { TdChoiceGroup } from './td-choice-group.js';

// v0.49.0 (plan docs/internal/plans/v0.49.0-choice-stepper.md M2) — <td-choice-group> in Chromium, Firefox AND WebKit with
// real key presses. DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the
// runner. WebKit on macOS moves Tab between text fields only (Safari default) — Option+Tab reaches radios (ADR 0022).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Firefox/.test(navigator.userAgent);
const TAB = WEBKIT ? 'Alt+Tab' : 'Tab';
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
function captureWarn() {
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.map(String).join(' '));
  extra.push(() => { console.warn = orig; });
  return warns;
}
const CAP = [
  { value: '128', label: '128GB', hint: '21.990.000₫' },
  { value: '256', label: '256GB', hint: '24.990.000₫', unavailable: true },
  { value: '512', label: '512GB', disabled: true },
  { value: '1tb', label: '1TB' },
];
const COLORS = [
  { value: 'den', label: 'Titan đen', swatch: '#3b3b3d' },
  { value: 'sa-mac', label: 'Titan sa mạc', image: '/test/fixtures/1.svg', unavailable: true, unavailableLabel: 'Sắp về' },
  { value: 'trang', label: 'Titan trắng', swatch: '#f4f4f2' },
];
function group(attrs = '', options = CAP, wrapForm = false) {
  const w = mount(wrapForm ? `<form><td-choice-group ${attrs}></td-choice-group><input id="after-f" aria-label="sau"></form>`
    : `<input id="before" aria-label="trước"><td-choice-group ${attrs}></td-choice-group><input id="after" aria-label="sau">`);
  const el = w.querySelector('td-choice-group');
  el.options = options;
  return el;
}
const radios = (el) => [...el.querySelectorAll('input.td-choice__input')];
const radio = (el, v) => radios(el).find((r) => r.value === v);
const groupEl = (el) => el.querySelector('[role="radiogroup"]');
const focusedValue = () => (document.activeElement && document.activeElement.classList.contains('td-choice__input') ? document.activeElement.value : null);
function events(el) {
  const rec = { input: [], change: [], log: [] };
  el.addEventListener('input', (e) => { rec.log.push('input'); rec.input.push({ detail: e.detail, target: e.target === el, custom: e instanceof CustomEvent }); });
  el.addEventListener('change', (e) => { rec.log.push('change'); rec.change.push({ detail: e.detail, target: e.target === el, custom: e instanceof CustomEvent }); });
  return rec;
}
async function clickOn(node) {
  const r = node.getBoundingClientRect();
  await sendMouse({ type: 'click', position: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] });
  await wait();
}

describe('td-choice-group — render (M2)', () => {
  it('button variant: radiogroup named by the label, one radio per option, hint / note, unavailable / disabled states', async () => {
    const el = group('id="cap" name="cap" label="Dung lượng"');
    await wait();
    expect(el instanceof TdChoiceGroup).to.equal(true);
    const g = groupEl(el);
    expect(g.getAttribute('aria-labelledby')).to.equal('cap-label');
    expect(el.querySelector('#cap-label').textContent).to.equal('Dung lượng');
    expect(el.querySelector('.td-choice').classList.contains('td-choice--button')).to.equal(true);
    const rs = radios(el);
    expect(rs.map((r) => r.value)).to.deep.equal(['128', '256', '512', '1tb']);
    // private group, no form owner (ADR 0022)
    const names = new Set(rs.map((r) => r.name));
    expect(names.size).to.equal(1);
    expect([...names][0]).to.match(/^td-choice-\d+$/);
    expect(rs.every((r) => r.getAttribute('form') === '' && r.getAttribute('autocomplete') === 'off')).to.equal(true);
    // name = its own label span only; hint + note in describedby
    const r0 = rs[0];
    const lab0 = document.getElementById(r0.getAttribute('aria-labelledby'));
    expect(lab0.textContent).to.equal('128GB');
    const d0 = r0.getAttribute('aria-describedby').split(' ').map((id) => document.getElementById(id).textContent);
    expect(d0).to.deep.equal(['21.990.000₫']);
    const r1 = rs[1];
    expect(r1.closest('.td-choice__option').hasAttribute('data-unavailable')).to.equal(true);
    const d1 = r1.getAttribute('aria-describedby').split(' ').map((id) => document.getElementById(id).textContent);
    expect(d1).to.deep.equal(['24.990.000₫', 'Hết hàng']);
    expect(rs[2].disabled).to.equal(true);
    expect(rs[3].disabled).to.equal(false);
    // the hint / note are visible in the button variant
    const hint = el.querySelector('.td-choice__hint');
    expect(hint.textContent).to.equal('21.990.000₫');
    expect(hint.classList.contains('td-sr-only')).to.equal(false);
    // unavailable text struck through
    const text1 = r1.closest('.td-choice__option').querySelector('.td-choice__text');
    expect(getComputedStyle(text1).textDecorationLine).to.contain('line-through');
  });

  it('swatch variant: names hidden visually, SVG fill colour, <img> for an image, current choice in the label line', async () => {
    const el = group('id="col" name="color" label="Màu sắc" variant="swatch" value="sa-mac"', COLORS);
    await wait();
    expect(el.querySelector('.td-choice').classList.contains('td-choice--swatch')).to.equal(true);
    const svg = el.querySelector('svg.td-choice__swatch');
    expect(svg.getAttribute('aria-hidden')).to.equal('true');
    expect(svg.querySelector('circle').getAttribute('fill')).to.equal('#3b3b3d');
    const img = el.querySelector('img.td-choice__image');
    expect(img.getAttribute('alt')).to.equal('');
    expect(img.getAttribute('loading')).to.equal('lazy');
    expect(img.getAttribute('decoding')).to.equal('async');
    expect(img.src).to.equal(new URL('/test/fixtures/1.svg', location.href).href);
    expect(el.querySelectorAll('.td-choice__text.td-sr-only').length).to.equal(3);
    const cur = el.querySelector('.td-choice__current');
    expect(cur.getAttribute('aria-hidden')).to.equal('true');
    expect(cur.textContent).to.equal(': Titan sa mạc — Sắp về');
    // the "current" part is not in the group's name: the label element is referenced, the span is aria-hidden
    radio(el, 'den').click();
    await wait();
    expect(cur.textContent).to.equal(': Titan đen');
  });

  it('variant: an unknown value → button; options set before define (and value) are replayed', async () => {
    const w = mount('');
    const el = document.createElement('td-choice-group');
    el.options = CAP;
    el.value = '1tb';
    el.setAttribute('variant', 'bogus');
    w.appendChild(el);
    await wait();
    expect(el.querySelector('.td-choice').classList.contains('td-choice--button')).to.equal(true);
    expect(el.value).to.equal('1tb');
    expect(radio(el, '1tb').checked).to.equal(true);
  });

  it('value attribute before options: kept until the options arrive, then checked', async () => {
    const w = mount('<td-choice-group value="256" name="c"></td-choice-group>');
    const el = w.querySelector('td-choice-group');
    await wait();
    expect(el.value).to.equal('256');
    el.options = CAP;
    expect(radio(el, '256').checked).to.equal(true);
    expect(el.selectedOption.label).to.equal('256GB');
  });
});

describe('td-choice-group — keyboard + pointer (M2)', () => {
  it('one Tab stop on the checked radio; arrows move + select (skip disabled, enter unavailable), wrap both ends', async () => {
    const el = group('name="cap" label="Dung lượng" value="128"');
    await wait();
    document.getElementById('before').focus();
    await sendKeys({ press: TAB });
    expect(focusedValue()).to.equal('128');
    const rec = events(el);
    await sendKeys({ press: 'ArrowRight' });
    expect(focusedValue()).to.equal('256'); // unavailable: in the arrow cycle, selectable
    expect(el.value).to.equal('256');
    await sendKeys({ press: 'ArrowDown' });
    expect(focusedValue()).to.equal('1tb'); // 512 disabled → skipped
    expect(el.value).to.equal('1tb');
    await sendKeys({ press: 'ArrowRight' }); // wrap 1tb → 128 (WebKit: done by the component)
    expect(focusedValue()).to.equal('128');
    expect(el.value).to.equal('128');
    await sendKeys({ press: 'ArrowLeft' }); // wrap 128 → 1tb
    expect(focusedValue()).to.equal('1tb');
    expect(el.value).to.equal('1tb');
    await sendKeys({ press: 'ArrowUp' });
    expect(focusedValue()).to.equal('256');
    expect(rec.log.join(',')).to.equal('input,change,input,change,input,change,input,change,input,change');
    expect(rec.change.map((c) => c.detail.value)).to.deep.equal(['256', '1tb', '128', '1tb', '256']);
    await sendKeys({ press: TAB });
    expect(document.activeElement.id).to.equal('after');
  });

  it('unchecked group: Tab → the first enabled radio; Space selects it', async () => {
    const el = group('name="cap"', [{ value: 'x', label: 'X', disabled: true }, ...CAP]);
    await wait();
    document.getElementById('before').focus();
    await sendKeys({ press: TAB });
    expect(focusedValue()).to.equal('128');
    expect(el.value).to.equal('');
    const rec = events(el);
    await sendKeys({ press: 'Space' });
    expect(el.value).to.equal('128');
    expect(rec.log.join(',')).to.equal('input,change');
  });

  it('click on an option: input + change once each, detail { value, option } frozen copy, native events stopped', async () => {
    const el = group('name="cap"');
    await wait();
    const rec = events(el);
    await clickOn(radio(el, '256').closest('.td-choice__option'));
    expect(el.value).to.equal('256');
    expect(rec.input.length).to.equal(1);
    expect(rec.change.length).to.equal(1);
    expect(rec.input[0].target && rec.input[0].custom && rec.change[0].target && rec.change[0].custom).to.equal(true);
    const d = rec.change[0].detail;
    expect(d.value).to.equal('256');
    expect({ ...d.option }).to.deep.equal({ value: '256', label: '256GB', hint: '24.990.000₫', disabled: false, unavailable: true, index: 1 });
    expect(Object.isFrozen(d.option)).to.equal(true);
    // clicking the checked one again: nothing
    await clickOn(radio(el, '256').closest('.td-choice__option'));
    expect(rec.change.length).to.equal(1);
    // a disabled option: nothing
    await clickOn(radio(el, '512').closest('.td-choice__option'));
    expect(el.value).to.equal('256');
    expect(rec.change.length).to.equal(1);
  });

  it('no event for value / setValue / options / reset; setValue unknown → \'\' + warning', async () => {
    const warns = captureWarn();
    const el = group('name="cap" value="128"', CAP, true);
    await wait();
    const rec = events(el);
    el.value = '1tb';
    el.setValue('256');
    el.setAttribute('value', '1tb');
    el.options = CAP.map((o) => ({ ...o, hint: 'x' }));
    el.closest('form').reset();
    expect(rec.log.length).to.equal(0);
    expect(el.value).to.equal('128'); // reset → the default captured at connect (like every td form control)
    el.setValue('nope');
    expect(el.value).to.equal('');
    expect(radios(el).some((r) => r.checked)).to.equal(false);
    expect(warns.some((w) => /td-choice-group/.test(w))).to.equal(true);
  });
});

describe('td-choice-group — form (M2)', () => {
  it('FormData: one entry when selected, none when not; no td-choice-* leak', async () => {
    const el = group('name="cap"', CAP, true);
    await wait();
    const form = el.closest('form');
    expect([...new FormData(form).keys()]).to.deep.equal([]);
    radio(el, '1tb').click();
    const entries = [...new FormData(form).entries()];
    expect(entries).to.deep.equal([['cap', '1tb']]);
    expect([...form.elements].some((e) => e.localName === 'input' && e.type === 'radio')).to.equal(false);
  });

  it('required: valueMissing + aria-required on the radiogroup; selecting fixes it; aria-invalid on the group with an error', async () => {
    const el = group('name="cap" label="Dung lượng" required', CAP, true);
    await wait();
    const g = groupEl(el);
    expect(g.getAttribute('aria-required')).to.equal('true');
    expect(el.checkValidity()).to.equal(false);
    expect(el.validity.valueMissing).to.equal(true);
    expect(el.validationMessage).to.equal(TdChoiceGroup.messages.valueMissing);
    expect(el.querySelector('#' + el.id + '-label .td-field__required') !== null).to.equal(true);
    el.setError(el.validationMessage);
    expect(g.getAttribute('aria-invalid')).to.equal('true');
    expect(g.getAttribute('aria-errormessage')).to.equal(`${el.id}-error`);
    expect(g.getAttribute('aria-describedby').split(' ')).to.include(`${el.id}-error`);
    radio(el, '128').click();
    expect(el.checkValidity()).to.equal(true);
    expect(g.hasAttribute('aria-invalid')).to.equal(false); // a shown valueMissing error clears on selection
  });

  it('required + every option disabled (and empty options): valid, submits, no aria-required, valueMissing error cleared; comes back', async () => {
    const el = group('name="cap" required', CAP, true);
    await wait();
    const form = el.closest('form');
    el.setError(TdChoiceGroup.messages.valueMissing);
    el.options = CAP.map((o) => ({ ...o, disabled: true }));
    const g = groupEl(el);
    expect(el.checkValidity()).to.equal(true);
    expect(g.hasAttribute('aria-required')).to.equal(false);
    expect(el.errorMessage).to.equal('');
    let submitted = 0;
    form.addEventListener('submit', (e) => { e.preventDefault(); submitted += 1; });
    form.requestSubmit();
    expect(submitted).to.equal(1);
    expect([...new FormData(form).keys()]).to.deep.equal([]);
    // patch one option back to enabled → required applies again (no error shown until the next check)
    el.options = CAP.map((o, i) => ({ ...o, disabled: i !== 1 }));
    expect(el.checkValidity()).to.equal(false);
    expect(g.getAttribute('aria-required')).to.equal('true');
    expect(el.errorMessage).to.equal('');
    for (let i = 0; i < 3; i++) {
      el.options = CAP.map((o) => ({ ...o, disabled: true }));
      expect(el.checkValidity()).to.equal(true);
      el.options = CAP;
      expect(el.checkValidity()).to.equal(false);
    }
    el.options = [];
    expect(el.checkValidity()).to.equal(true);
    expect(groupEl(el).hasAttribute('aria-required')).to.equal(false);
  });

  it('unavailable counts as selectable for required; a selected option turned disabled keeps its value (no event)', async () => {
    const el = group('name="cap" required value="128"', CAP, true);
    await wait();
    const rec = events(el);
    el.options = CAP.map((o) => ({ ...o, disabled: o.value === '128' || o.value === '512' }));
    expect(el.value).to.equal('128');
    expect(radio(el, '128').checked).to.equal(true);
    expect(rec.log.length).to.equal(0);
    el.options = [{ value: 'a', label: 'A', unavailable: true }];
    expect(el.value).to.equal(''); // the selected option is gone → ''
    expect(el.checkValidity()).to.equal(false);
  });

  it('form.reset → default; formStateRestoreCallback; fieldset disabled + host disabled lock every radio in place', async () => {
    const w = mount('<form><fieldset><td-choice-group name="cap" value="256"></td-choice-group></fieldset></form>');
    const el = w.querySelector('td-choice-group');
    el.options = CAP;
    await wait();
    radio(el, '1tb').click();
    w.querySelector('form').reset();
    expect(el.value).to.equal('256');
    expect(radio(el, '256').checked).to.equal(true);
    el.formStateRestoreCallback('1tb', 'restore');
    expect(el.value).to.equal('1tb');
    const before = radio(el, '128');
    w.querySelector('fieldset').disabled = true;
    await wait();
    expect(radios(el).every((r) => r.matches(':disabled'))).to.equal(true);
    expect(radio(el, '128') === before).to.equal(true);
    w.querySelector('fieldset').disabled = false;
    await wait();
    expect(radio(el, '128').disabled).to.equal(false);
    expect(radio(el, '512').disabled).to.equal(true);
    el.setAttribute('disabled', '');
    expect(radios(el).every((r) => r.disabled)).to.equal(true);
    expect(radio(el, '128') === before).to.equal(true);
    el.removeAttribute('disabled');
    expect(radio(el, '128').disabled).to.equal(false);
    expect(radio(el, '512').disabled).to.equal(true);
  });

  it('reportValidity anchors on the first enabled radio; focus() → the Tab stop; external <label for> focuses it', async () => {
    const w = mount('<label for="cg-x">Chọn</label><td-choice-group id="cg-x" name="cap" required></td-choice-group>');
    const el = w.querySelector('td-choice-group');
    el.options = [{ value: 'x', label: 'X', disabled: true }, ...CAP];
    await wait();
    el.focus();
    expect(focusedValue()).to.equal('128');
    el.value = '1tb';
    el.focus();
    expect(focusedValue()).to.equal('1tb');
    document.body.focus();
    w.querySelector('label').click();
    expect(focusedValue()).to.equal('1tb');
    expect(groupEl(el).getAttribute('aria-labelledby')).to.match(/^td-lbl-\d+$/);
  });
});

describe('td-choice-group — options update (M2)', () => {
  it('same value list → patched in place: radio nodes kept, focus kept, no event; states + texts updated', async () => {
    const el = group('name="cap" value="128"');
    await wait();
    const nodes = radios(el);
    radio(el, '128').focus();
    const rec = events(el);
    el.options = [
      { value: '128', label: '128 GB', hint: '20.990.000₫', unavailable: true, unavailableLabel: 'Hết' },
      { value: '256', label: '256GB' },
      { value: '512', label: '512GB' },
      { value: '1tb', label: '1TB', disabled: true },
    ];
    const now = radios(el);
    expect(now.every((r, i) => r === nodes[i])).to.equal(true);
    expect(focusedValue()).to.equal('128');
    expect(rec.log.length).to.equal(0);
    expect(radio(el, '512').disabled).to.equal(false);
    expect(radio(el, '1tb').disabled).to.equal(true);
    expect(radio(el, '128').closest('.td-choice__option').hasAttribute('data-unavailable')).to.equal(true);
    expect(radio(el, '256').closest('.td-choice__option').hasAttribute('data-unavailable')).to.equal(false);
    expect(document.getElementById(radio(el, '128').getAttribute('aria-labelledby')).textContent).to.equal('128 GB');
    const d = radio(el, '128').getAttribute('aria-describedby').split(' ').map((id) => document.getElementById(id).textContent);
    expect(d).to.deep.equal(['20.990.000₫', 'Hết']);
    expect(radio(el, '256').hasAttribute('aria-describedby')).to.equal(false);
  });

  it('different value list → re-render; focus follows the value; the focused value gone → the Tab stop', async () => {
    const warns = captureWarn();
    const el = group('name="cap" value="256"');
    await wait();
    radio(el, '1tb').focus();
    const old = radios(el);
    el.options = [{ value: '1tb', label: '1TB' }, { value: '256', label: '256GB' }];
    expect(radios(el)[0] === old[3]).to.equal(false);
    expect(focusedValue()).to.equal('1tb');
    expect(el.value).to.equal('256');
    el.options = [{ value: '256', label: '256GB' }, { value: '2tb', label: '2TB' }, { value: 'x', label: 'X' }];
    expect(focusedValue()).to.equal('256'); // tab stop = the checked one
    el.options = [{ value: '2tb', label: '2TB' }, { value: 'x', label: 'X' }];
    expect(el.value).to.equal(''); // selected option gone → '' (+ warning)
    expect(focusedValue()).to.equal('2tb');
    expect(warns.some((w) => /td-choice-group/.test(w))).to.equal(true);
  });

  it('invalid options: dropped with warnings; options getter returns normalised frozen copies', async () => {
    const warns = captureWarn();
    const el = group('name="cap"', [{ value: 'a', label: 'A' }, { value: 'a', label: 'dup' }, { label: 'no value' }, 'x']);
    await wait();
    expect(radios(el).map((r) => r.value)).to.deep.equal(['a']);
    expect(warns.length).to.be.greaterThan(0);
    const got = el.options;
    expect(got.length).to.equal(1);
    expect(Object.isFrozen(got[0])).to.equal(true);
    expect(el.selectedOption).to.equal(null);
  });
});

describe('td-choice-group — XSS (M2)', () => {
  it('label / hint / unavailableLabel / value are text; bad colours never reach fill; bad URLs never reach <img>', async () => {
    window.__xss = 0;
    const evil = '<img src=x onerror="window.__xss++">';
    const el = group(`name="x" label='${'&lt;b&gt;'}' variant="swatch"`, [
      { value: '"><img src=x onerror="window.__xss++">', label: evil, hint: evil, unavailable: true, unavailableLabel: evil, swatch: 'red;} body{display:none}' },
      { value: 'b', label: 'B', swatch: 'url(javascript:alert(1))' },
      { value: 'c', label: 'C', image: 'javascript:alert(1)' },
      { value: 'd', label: 'D', image: 'data:image/svg+xml,<svg/onload=alert(1)>' },
    ]);
    el.setAttribute('variant', 'button');
    await wait(50);
    expect(window.__xss).to.equal(0);
    expect(el.querySelectorAll('img').length).to.equal(0);
    expect([...el.querySelectorAll('circle')].every((c) => c.getAttribute('fill') == null)).to.equal(true);
    expect(el.querySelector('.td-choice__text').textContent).to.equal(evil);
    expect(radios(el)[0].value).to.equal('"><img src=x onerror="window.__xss++">');
    expect(el.querySelector('#' + el.id + '-label').textContent).to.equal('<b>');
  });
});
