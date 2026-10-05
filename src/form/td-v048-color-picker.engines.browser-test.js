// v0.48.0 (plan docs/internal/plans/v0.48.0-color-picker.md, M1) — <td-color-picker> in Chromium, Firefox AND WebKit:
// form value (one shape `#rrggbb`, badInput for unparsable / translucent text, valueMissing, reset, <fieldset disabled>),
// one host `change` per commit (no native event leaks), the popup (open by click / Enter / Alt+↓, focus on the thumb, Tab
// cycle, Escape restores, outside click keeps, preset picks + closes, above a TdModal), the area keyboard, a synthetic
// pointer drag (≤ 1 input per frame, one change, cancel keeps, hue kept across black), the theme bridge, XSS (labels
// text-only, raw text never in CSSOM) and the EyeDropper (stubbed). Booleans in assertions (DOM nodes hang the runner).
import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdModal } from '../feedback/td-modal.js';
import { TdColorPicker } from './td-color-picker.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const raf = () => new Promise((r) => requestAnimationFrame(r));
const until = async (cond, n = 300) => { for (let i = 0; i < n && !cond(); i++) await raf(); return cond(); };
const panel = () => document.querySelector('body > .td-color-panel');
const thumb = () => panel()?.querySelector('.td-color-panel__thumb');
const active = () => document.activeElement;

/** mount `<td-color-picker>` (in a form named f when `form`), record host events + leaked native events */
function mount(attrs = '', { form = true } = {}) {
  host.innerHTML = form
    ? `<form id="f"><td-color-picker name="c" ${attrs}></td-color-picker><button type="submit">Lưu</button></form>`
    : `<td-color-picker name="c" ${attrs}></td-color-picker>`;
  const el = host.querySelector('td-color-picker');
  const log = { input: [], change: [], native: 0 };
  el.addEventListener('input', (e) => { if (e instanceof CustomEvent) log.input.push(e.detail.value); else log.native += 1; });
  el.addEventListener('change', (e) => { if (e instanceof CustomEvent) log.change.push(e.detail.value); else log.native += 1; });
  return { el, log, input: el.querySelector('.td-color__input'), trigger: el.querySelector('.td-color__trigger'), form: host.querySelector('form') };
}

const fd = (form) => new FormData(form).getAll('c');

async function typeInto(input, text) {
  input.focus();
  input.select();
  await sendKeys({ type: text });
}

afterEach(() => {
  for (const el of document.querySelectorAll('td-color-picker')) el.close?.({ focus: false });
  host.innerHTML = '';
  for (const p of document.querySelectorAll('.td-color-panel')) p.remove();
});

describe('td-color-picker — form value + text input', () => {
  it('renders the field: swatch button + text input; empty → FormData "" ; clear button hidden', () => {
    const { el, input, trigger, form } = mount('label="Màu thương hiệu"');
    expect(!!trigger && trigger.getAttribute('aria-haspopup')).to.equal('dialog');
    expect(trigger.getAttribute('aria-expanded')).to.equal('false');
    expect(input.labels[0].textContent).to.equal('Màu thương hiệu');
    expect(input.getAttribute('autocapitalize')).to.equal('none');
    expect(input.getAttribute('maxlength')).to.equal('64');
    expect(input.hasAttribute('name')).to.equal(false);
    expect(fd(form)).to.deep.equal(['']);
    expect(el.value).to.equal('');
    expect(el.querySelector('.td-color__clear').hidden).to.equal(true);
    expect(el.querySelector('.td-color__swatch').getAttribute('data-state')).to.equal('empty');
  });

  it('value attribute normalised (#ABC → #aabbcc), silent; the swatch colour through CSSOM', () => {
    const { el, input, log, form } = mount('value="#ABC"');
    expect(el.value).to.equal('#aabbcc');
    expect(input.value).to.equal('#aabbcc');
    expect(fd(form)).to.deep.equal(['#aabbcc']);
    expect(el.style.getPropertyValue('--_td-cp-color')).to.equal('#aabbcc');
    expect(el.querySelector('.td-color__swatch').getAttribute('data-state')).to.equal('filled');
    el.value = 'red';
    el.setValue('1d4ed8');
    expect(el.getValue()).to.equal('#1d4ed8');
    expect(log.input.length + log.change.length).to.equal(0);
    expect(el.querySelector('.td-color__clear').hidden).to.equal(false);
  });

  it('typing #ABC: live value while typing (text not rewritten), blur → #aabbcc, ONE change, no native event leaks', async () => {
    const { el, input, log, form } = mount();
    await typeInto(input, '#ABC');
    expect(input.value).to.equal('#ABC');
    expect(el.value).to.equal('#aabbcc');
    expect(log.input.at(-1)).to.equal('#aabbcc');
    input.blur();
    expect(input.value).to.equal('#aabbcc');
    expect(fd(form)).to.deep.equal(['#aabbcc']);
    expect(log.change).to.deep.equal(['#aabbcc']);
    expect(log.native).to.equal(0);
    input.focus();
    input.blur();
    expect(log.change.length, 'no change without a new value').to.equal(1);
  });

  it('Enter commits (normalises) without being prevented', async () => {
    const { input, log } = mount();
    let submitted = 0;
    host.querySelector('form').addEventListener('submit', (e) => { submitted += 1; e.preventDefault(); });
    await typeInto(input, 'abc');
    await sendKeys({ press: 'Enter' });
    expect(input.value).to.equal('#aabbcc');
    expect(log.change).to.deep.equal(['#aabbcc']);
    expect(submitted).to.equal(1);
  });

  it('unparsable text → badInput, form blocked, FormData = the raw text, no input event', async () => {
    const { el, input, log, form } = mount();
    await typeInto(input, 'xyz');
    expect(el.validity.badInput).to.equal(true);
    expect(el.validationMessage).to.equal(TdColorPicker.messages.invalid);
    expect(form.checkValidity()).to.equal(false);
    expect(fd(form)).to.deep.equal(['xyz']);
    expect(el.value).to.equal('xyz');
    expect(log.input.length).to.equal(0);
    input.blur();
    expect(log.change.length).to.equal(0);
    expect(el.querySelector('.td-color__swatch').getAttribute('data-state')).to.equal('invalid');
    expect(el.style.getPropertyValue('--_td-cp-color')).to.equal('');
  });

  it('translucent colour → badInput with the alpha message', async () => {
    const { el, input } = mount();
    await typeInto(input, 'rgb(0 0 0 / 50%)');
    expect(el.validity.badInput).to.equal(true);
    expect(el.validationMessage).to.equal(TdColorPicker.messages.alpha);
  });

  it('required + empty → valueMissing; no clear button when required', () => {
    const { el, form } = mount('required value="#fff"');
    expect(el.querySelector('.td-color__clear').hidden).to.equal(true);
    el.value = '';
    expect(el.validity.valueMissing).to.equal(true);
    expect(el.validationMessage).to.equal(TdColorPicker.messages.valueMissing);
    expect(form.checkValidity()).to.equal(false);
  });

  it('form.reset() → the default (value attribute); formStateRestoreCallback', () => {
    const { el, form } = mount('value="#1D4ED8"');
    el.value = '#ff0000';
    form.reset();
    expect(el.value).to.equal('#1d4ed8');
    el.formStateRestoreCallback('#00ff00', 'restore');
    expect(el.value).to.equal('#00ff00');
  });

  it('the clear button: value "" + one input + one change, focus back in the text input', () => {
    const { el, log, input } = mount('value="#123456"');
    el.querySelector('.td-color__clear').click();
    expect(el.value).to.equal('');
    expect(log.input).to.deep.equal(['']);
    expect(log.change).to.deep.equal(['']);
    expect(active() === input).to.equal(true);
  });

  it('<fieldset disabled>: controls disabled, no FormData entry, an open popup closes', async () => {
    host.innerHTML = '<form><fieldset><td-color-picker name="c" value="#abcdef"></td-color-picker></fieldset></form>';
    const el = host.querySelector('td-color-picker');
    el.open();
    expect(!!panel()).to.equal(true);
    host.querySelector('fieldset').disabled = true;
    await raf();
    expect(el.querySelector('.td-color__trigger').disabled).to.equal(true);
    expect(el.querySelector('.td-color__input').disabled).to.equal(true);
    expect(!!panel()).to.equal(false);
    expect(new FormData(host.querySelector('form')).getAll('c')).to.deep.equal([]);
    el.querySelector('.td-color__trigger').click();
    expect(!!panel()).to.equal(false);
  });

  it('readonly / custom="false": the text is read-only; readonly never opens', () => {
    const { el, input } = mount('readonly value="#000"');
    expect(input.readOnly).to.equal(true);
    el.open();
    expect(!!panel()).to.equal(false);
    const b = mount('custom="false"');
    expect(b.input.readOnly).to.equal(true);
    b.el.open();
    expect(!!panel()).to.equal(true);
    expect(!!panel().querySelector('.td-color-panel__area')).to.equal(false);
    expect(!!panel().querySelector('.td-color-panel__hue')).to.equal(false);
    expect(active().classList.contains('td-color-panel__preset')).to.equal(true);
  });
});

describe('td-color-picker — popup', () => {
  it('click opens: dialog, aria-expanded / controls, focus on the thumb (slider), presets 16 by default', () => {
    const { el, trigger } = mount('value="#1d4ed8"');
    trigger.click();
    const p = panel();
    expect(!!p).to.equal(true);
    expect(p.getAttribute('role')).to.equal('dialog');
    expect(p.getAttribute('aria-label')).to.equal(TdColorPicker.labels.panel);
    expect(trigger.getAttribute('aria-expanded')).to.equal('true');
    expect(trigger.getAttribute('aria-controls')).to.equal(p.id);
    expect(active() === thumb()).to.equal(true);
    expect(thumb().getAttribute('role')).to.equal('slider');
    expect(p.querySelectorAll('.td-color-panel__preset').length).to.equal(16);
    expect(p.querySelector('.td-color-panel__presets').getAttribute('role')).to.equal('group');
    trigger.click();
    expect(!!panel()).to.equal(false);
    expect(el.value).to.equal('#1d4ed8', 'opening / closing never writes the value');
  });

  it('Enter / Space on the swatch button and Alt+ArrowDown (button or text) open it', async () => {
    const { trigger, input } = mount();
    trigger.focus();
    await sendKeys({ press: 'Enter' });
    expect(!!panel()).to.equal(true);
    await sendKeys({ press: 'Escape' });
    expect(!!panel()).to.equal(false);
    expect(active() === trigger).to.equal(true);
    await sendKeys({ press: 'Space' });
    expect(!!panel()).to.equal(true);
    await sendKeys({ press: 'Escape' });
    await sendKeys({ press: 'Alt+ArrowDown' });
    expect(!!panel()).to.equal(true);
    await sendKeys({ press: 'Escape' });
    input.focus();
    await sendKeys({ press: 'Alt+ArrowDown' });
    expect(!!panel()).to.equal(true);
  });

  it('Tab / Shift+Tab cycle inside the popup', async () => {
    const { trigger } = mount('value="#ffffff"');
    trigger.click();
    const p = panel();
    const seen = new Set();
    for (let i = 0; i < 6; i++) {
      await sendKeys({ press: 'Tab' });
      expect(p.contains(active())).to.equal(true);
      seen.add(active());
    }
    expect(seen.size >= 3).to.equal(true); // thumb, hue, the selected preset, "Xoá màu"
    await sendKeys({ press: 'Shift+Tab' });
    expect(p.contains(active())).to.equal(true);
  });

  it('Escape restores the value at opening, focus on the swatch button, ONE input + ONE change', async () => {
    const { el, trigger, log } = mount('value="#1d4ed8"');
    trigger.click();
    await sendKeys({ press: 'ArrowRight' });
    await sendKeys({ press: 'ArrowUp' });
    expect(el.value).to.not.equal('#1d4ed8');
    const changes = log.change.length;
    log.input.length = 0;
    await sendKeys({ press: 'Escape' });
    expect(!!panel()).to.equal(false);
    expect(el.value).to.equal('#1d4ed8');
    expect(active() === trigger).to.equal(true);
    expect(log.input).to.deep.equal(['#1d4ed8']);
    expect(log.change.length).to.equal(changes + 1);
    // Escape without a change: no event
    trigger.click();
    await sendKeys({ press: 'Escape' });
    expect(log.change.length).to.equal(changes + 1);
  });

  it('review ISSUE-1: popup open + a valid colour typed in the text input (uncommitted) + Escape → restored, ONE input + ONE change, focus on the trigger', async () => {
    const { el, trigger, input, log } = mount('value="#1d4ed8"');
    trigger.click();
    expect(!!panel()).to.equal(true);
    input.focus();
    input.select();
    await sendKeys({ type: '#ff0000' });
    expect(el.value).to.equal('#ff0000');
    expect(log.change.length, 'typing does not commit').to.equal(0);
    expect(!!panel(), 'the popup follows the typing').to.equal(true);
    log.input.length = 0;
    await sendKeys({ press: 'Escape' });
    expect(!!panel()).to.equal(false);
    expect(el.value).to.equal('#1d4ed8');
    expect(input.value).to.equal('#1d4ed8');
    expect(log.input).to.deep.equal(['#1d4ed8']);
    expect(log.change).to.deep.equal(['#1d4ed8']);
    expect(active() === trigger).to.equal(true);
    expect(log.native).to.equal(0);
    // nothing more later (the text input's blur commits nothing new)
    trigger.blur();
    expect(log.change.length).to.equal(1);
  });

  it('review r2 #3: invalid text → open → pick in the area → Escape: the raw text comes back SILENTLY (no input / change), badInput again', async () => {
    const { el, trigger, input, log } = mount();
    await typeInto(input, 'xyz');
    expect(el.validity.badInput).to.equal(true);
    trigger.click();
    await sendKeys({ press: 'End' }); // a pick on the area (commits a colour)
    expect(el.validity.badInput).to.equal(false);
    expect(/^#[0-9a-f]{6}$/.test(el.value)).to.equal(true);
    log.input.length = 0;
    log.change.length = 0;
    await sendKeys({ press: 'Escape' });
    expect(!!panel()).to.equal(false);
    expect(el.value).to.equal('xyz');
    expect(input.value).to.equal('xyz');
    expect(el.validity.badInput).to.equal(true);
    expect(log.input).to.deep.equal([]);
    expect(log.change).to.deep.equal([]);
    expect(active() === trigger).to.equal(true);
    expect(log.native).to.equal(0);
  });

  it('presets property: a 100 000-entry / sparse array is bounded (≤ 192 inspected), one fixed warning', () => {
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => warns.push(String(a[0]));
    try {
      const { el, trigger } = mount();
      const big = Array(100000).fill('#fff');
      big[150] = '#000';
      big[500] = '#123';
      el.presets = big;
      const sparse = [];
      sparse[3] = '#abc';
      sparse.length = 1e7;
      trigger.click();
      expect([...panel().querySelectorAll('.td-color-panel__preset')].map((b) => b.dataset.value)).to.deep.equal(['#ffffff', '#000000']);
      el.close();
      el.presets = sparse;
      expect(el.presets.map((p) => p.value)).to.deep.equal(['#aabbcc']);
    } finally {
      console.warn = orig;
    }
    const mine = warns.filter((w) => w.startsWith('td-color-picker:'));
    expect(mine.length).to.equal(2); // one per assigned source
    expect(new Set(mine).size, 'a fixed text (no input reflected)').to.equal(1);
  });

  it('a click outside closes and KEEPS the value', async () => {
    const { el, trigger } = mount('value="#1d4ed8"');
    trigger.click();
    await sendKeys({ press: 'End' });
    const v = el.value;
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    expect(!!panel()).to.equal(false);
    expect(el.value).to.equal(v);
  });

  it('a preset click picks + closes (one input, one change); aria-pressed + the tick on the selected preset', () => {
    const { el, trigger, log } = mount('presets="#b3261e #1d4ed8 #ffffff"');
    trigger.click();
    const presets = [...panel().querySelectorAll('.td-color-panel__preset')];
    expect(presets.map((b) => b.getAttribute('data-value'))).to.deep.equal(['#b3261e', '#1d4ed8', '#ffffff']);
    presets[1].click();
    expect(el.value).to.equal('#1d4ed8');
    expect(!!panel()).to.equal(false);
    expect(log.input).to.deep.equal(['#1d4ed8']);
    expect(log.change).to.deep.equal(['#1d4ed8']);
    expect(active() === trigger).to.equal(true);
    trigger.click();
    const on = panel().querySelector('.td-color-panel__preset[aria-pressed="true"]');
    expect(on.getAttribute('data-value')).to.equal('#1d4ed8');
    expect(on.tabIndex).to.equal(0);
    expect(on.style.getPropertyValue('--_td-cp-mark')).to.equal('#ffffff');
    expect(getComputedStyle(on.querySelector('.td-check')).visibility).to.equal('visible');
    expect(getComputedStyle(panel().querySelector('.td-color-panel__preset[aria-pressed="false"] .td-check')).visibility).to.equal('hidden');
  });

  it('preset grid: roving tabindex, arrows by the measured columns, Home / End', async () => {
    const { trigger } = mount('custom="false"');
    trigger.click();
    const presets = [...panel().querySelectorAll('.td-color-panel__preset')];
    expect(active() === presets[0]).to.equal(true);
    await sendKeys({ press: 'ArrowRight' });
    expect(active() === presets[1]).to.equal(true);
    const cols = presets.findIndex((b) => b.offsetTop !== presets[0].offsetTop);
    await sendKeys({ press: 'ArrowDown' });
    expect(active() === presets[1 + cols]).to.equal(true);
    await sendKeys({ press: 'End' });
    expect(active() === presets.at(-1)).to.equal(true);
    await sendKeys({ press: 'Home' });
    expect(active() === presets[0]).to.equal(true);
    expect(presets.filter((b) => b.tabIndex === 0).length).to.equal(1);
  });

  it('typing in the text input while open: the popup follows', async () => {
    const { input, trigger } = mount('value="#ffffff"');
    trigger.click();
    await typeInto(input, '#ff0000');
    expect(!!panel()).to.equal(true);
    expect(panel().style.getPropertyValue('--_td-cp-color')).to.equal('#ff0000');
    expect(thumb().getAttribute('aria-valuenow')).to.equal('100');
  });

  it('inside a TdModal: the popup sits above the modal; Escape closes ONLY the popup', async () => {
    const el = document.createElement('td-color-picker');
    el.setAttribute('value', '#1d4ed8');
    TdModal.show({ title: 'Cài đặt', body: el });
    await until(() => document.querySelector('.td-modal')?.getAttribute('data-state') === 'open');
    el.querySelector('.td-color__trigger').click();
    const p = panel();
    expect(!!p).to.equal(true);
    const z = (n) => Number(getComputedStyle(n).zIndex) || 0;
    expect(z(p) > z(document.querySelector('.td-modal'))).to.equal(true);
    await sendKeys({ press: 'Escape' });
    expect(!!panel()).to.equal(false);
    expect(!!document.querySelector('.td-modal')).to.equal(true);
    TdModal.closeAll();
    await until(() => !document.querySelector('.td-modal'));
  });

  it('opened from a data-td-theme="dark" region: the popup carries the region theme (bridgeTheme)', () => {
    host.innerHTML = '<section data-td-theme="dark"><td-color-picker value="#123456"></td-color-picker></section>';
    host.querySelector('.td-color__trigger').click();
    expect(panel().getAttribute('data-td-theme')).to.equal('dark');
    expect(panel().style.getPropertyValue('--td-color-text').trim() !== '').to.equal(true);
  });

  it('contrast: white / black samples + ratio + verdict text', () => {
    const { trigger } = mount('contrast value="#1d4ed8"');
    trigger.click();
    const ratios = [...panel().querySelectorAll('.td-color-panel__ratio')].map((n) => n.textContent);
    expect(ratios[0]).to.equal('Chữ trắng: 6.7:1 · Đạt AA');
    expect(ratios[1]).to.equal('Chữ đen: 3.1:1 · Chưa đạt');
  });
});

describe('td-color-picker — area keyboard + hue', () => {
  it('→ ×5 = saturation +5 %; Shift+↑ = brightness +10 %; Home / End; valuetext; each step is ONE change', async () => {
    const { el, trigger, log } = mount('value="#806040"');
    trigger.click();
    const t = thumb();
    const s0 = Number(t.getAttribute('aria-valuenow'));
    for (let i = 0; i < 5; i++) await sendKeys({ press: 'ArrowRight' });
    expect(Number(t.getAttribute('aria-valuenow'))).to.equal(s0 + 5);
    expect(log.change.length).to.equal(5);
    const v0 = el._hsv.v;
    await sendKeys({ press: 'Shift+ArrowUp' });
    expect(Math.round((el._hsv.v - v0) * 100)).to.equal(10);
    await sendKeys({ press: 'Home' });
    expect(t.getAttribute('aria-valuenow')).to.equal('0');
    await sendKeys({ press: 'End' });
    expect(t.getAttribute('aria-valuenow')).to.equal('100');
    expect(t.getAttribute('aria-valuetext')).to.match(new RegExp(`^Bão hoà 100 %, độ sáng \\d+ % — .+, ${el.value}$`));
    expect(log.native).to.equal(0);
  });

  it('the hue range: ← / → change --_td-cp-hue and the value, aria-valuetext in degrees', async () => {
    const { el, trigger } = mount('value="#ff0000"');
    trigger.click();
    const hue = panel().querySelector('.td-color-panel__hue');
    expect(hue.type).to.equal('range');
    hue.focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(hue.value).to.equal('1');
    expect(hue.getAttribute('aria-valuetext')).to.match(/^1°, /);
    expect(panel().style.getPropertyValue('--_td-cp-hue')).to.equal('#ff0400');
    expect(el.value).to.equal('#ff0400');
  });
});

describe('td-color-picker — pointer drag on the area (synthetic events)', () => {
  const pe = (type, x, y, extra = {}) => new PointerEvent(type, {
    bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, ...extra,
  });

  it('down jumps to the point; moves coalesce to ≤ 1 input per frame; up → ONE change', async () => {
    const { el, trigger, log } = mount('value="#ff0000"');
    trigger.click();
    const area = panel().querySelector('.td-color-panel__area');
    const r = area.getBoundingClientRect();
    area.dispatchEvent(pe('pointerdown', r.left + 1, r.bottom - 1));
    expect(log.input.length).to.equal(1);
    await raf();
    log.input.length = 0;
    for (let i = 0; i < 10; i++) area.dispatchEvent(pe('pointermove', r.left + 10 + i * 5, r.top + 10 + i * 3));
    await raf();
    await raf();
    expect(log.input.length).to.equal(1, 'ten moves in one frame → one input');
    area.dispatchEvent(pe('pointerup', r.right + 5, r.top + r.height / 2));
    expect(log.change).to.deep.equal(['#800000']);
    expect(thumb().getAttribute('aria-valuenow')).to.equal('100');
    expect(el.value).to.equal('#800000');
  });

  it('pointercancel keeps the value reached (no revert) and commits once', async () => {
    const { el, trigger, log } = mount('value="#ffffff"');
    trigger.click();
    const area = panel().querySelector('.td-color-panel__area');
    const r = area.getBoundingClientRect();
    area.dispatchEvent(pe('pointerdown', r.left + r.width / 2, r.top + r.height / 2));
    const mid = el.value;
    area.dispatchEvent(pe('pointercancel', 0, 0));
    expect(el.value).to.equal(mid);
    expect(log.change).to.deep.equal([mid]);
    area.dispatchEvent(pe('pointerup', 0, 0));
    expect(log.change.length, 'nothing after the gesture ended').to.equal(1);
  });

  it('dragging to black (v = 0) and back keeps the hue', async () => {
    const { el, trigger } = mount('value="#2080ff"');
    trigger.click();
    const area = panel().querySelector('.td-color-panel__area');
    const r = area.getBoundingClientRect();
    const h0 = el._hsv.h;
    area.dispatchEvent(pe('pointerdown', r.right - 2, r.bottom + 20));
    expect(el.value).to.equal('#000000');
    area.dispatchEvent(pe('pointerup', r.right - 2, r.top + 2));
    expect(Math.abs(el._hsv.h - h0) < 1e-9).to.equal(true);
    expect(el.value).to.not.equal('#ff0000');
    // a value set to black from outside keeps the hue too
    el.value = '#000000';
    expect(Math.abs(el._hsv.h - h0) < 1e-9).to.equal(true);
  });
});

describe('td-color-picker — XSS + CSSOM', () => {
  it('preset labels are text only (aria-label / title), never markup', () => {
    window.__pwned = 0;
    const { el, trigger } = mount();
    el.presets = [{ value: '#fff', label: '<img src=x onerror="window.__pwned=1">' }, '#000'];
    trigger.click();
    const b = panel().querySelector('.td-color-panel__preset');
    expect(b.getAttribute('aria-label')).to.equal('<img src=x onerror="window.__pwned=1">');
    expect(panel().querySelectorAll('img').length).to.equal(0);
    expect(window.__pwned).to.equal(0);
  });

  it('a hostile value is badInput and never reaches a custom property of any part', async () => {
    for (const bad of ['red;} body{display:none', 'url(javascript:alert(1))', 'var(--x)', '#fff;}']) {
      const { el, trigger } = mount();
      el.value = bad;
      expect(el.validity.badInput).to.equal(true);
      trigger.click();
      const nodes = [el, ...el.querySelectorAll('*'), panel(), ...panel().querySelectorAll('*')];
      for (const n of nodes) {
        for (const name of [...(n.style || [])]) {
          const v = n.style.getPropertyValue(name);
          expect(v.includes('body') || v.includes('url(') || v.includes('var(') || v.includes(';'), `${name}: ${v}`).to.equal(false);
          if (name.startsWith('--_td-cp-')) expect(/^(#[0-9a-f]{6}|[01](\.\d+)?|0\.\d+(e-\d+)?)$/.test(v.trim()), `${name}: ${v}`).to.equal(true);
        }
      }
      el.close();
    }
    expect(getComputedStyle(document.body).display).to.not.equal('none');
  });
});

describe('td-color-picker — EyeDropper (stubbed)', () => {
  let saved;
  beforeEach(() => { saved = Object.getOwnPropertyDescriptor(window, 'EyeDropper'); });
  afterEach(() => {
    if (saved) Object.defineProperty(window, 'EyeDropper', saved);
    else delete window.EyeDropper;
  });
  const stub = (result) => {
    window.EyeDropper = class { open() { return typeof result === 'function' ? result() : Promise.resolve(result); } };
  };

  it('no EyeDropper → no button', () => {
    delete window.EyeDropper;
    const { trigger } = mount();
    trigger.click();
    expect(!!panel().querySelector('.td-color-panel__eyedropper')).to.equal(false);
  });

  it('#FF0000 → #ff0000 + input + change; rgb() result normalised; eyedropper="false" hides it', async () => {
    stub({ sRGBHex: '#FF0000' });
    const { el, trigger, log } = mount();
    trigger.click();
    panel().querySelector('.td-color-panel__eyedropper').click();
    expect(await until(() => el.value === '#ff0000')).to.equal(true);
    expect(log.change).to.deep.equal(['#ff0000']);
    stub({ sRGBHex: 'rgb(1 2 3)' });
    panel().querySelector('.td-color-panel__eyedropper').click();
    expect(await until(() => el.value === '#010203')).to.equal(true);
    const b = mount('eyedropper="false"');
    b.trigger.click();
    expect(!!panel().querySelector('.td-color-panel__eyedropper')).to.equal(false);
  });

  it('AbortError (the user pressed Escape) → nothing changes, no error', async () => {
    const errors = [];
    const onErr = (e) => errors.push(e);
    window.addEventListener('unhandledrejection', onErr);
    stub(() => Promise.reject(new DOMException('aborted', 'AbortError')));
    const { el, trigger, log } = mount('value="#123456"');
    trigger.click();
    panel().querySelector('.td-color-panel__eyedropper').click();
    await raf();
    await raf();
    expect(el.value).to.equal('#123456');
    expect(log.input.length + log.change.length).to.equal(0);
    window.removeEventListener('unhandledrejection', onErr);
    expect(errors.length).to.equal(0);
  });
});
