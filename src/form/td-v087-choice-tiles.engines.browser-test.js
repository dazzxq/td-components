import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import { TdChoiceGroup } from './td-choice-group.js';

// v0.87.0 (plan docs/internal/plans/v0.87.0-p3-tiles-chip-create-render-option.md A) — <td-choice-group variant="tiles">
// in Chromium, Firefox AND WebKit with real keys. DOM nodes are compared as booleans (a failing chai assertion carrying DOM
// nodes hangs the runner). WebKit on macOS: Option+Tab reaches radios (ADR 0023).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Firefox/.test(navigator.userAgent);
const TAB = WEBKIT ? 'Alt+Tab' : 'Tab';
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const cleanup = [];
afterEach(async () => {
  cleanup.splice(0).forEach((f) => f());
  await resetMouse();
});
function mount(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  cleanup.push(() => wrap.remove());
  return wrap;
}
function captureWarn() {
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.map(String).join(' '));
  cleanup.push(() => { console.warn = orig; });
  return warns;
}
const THEME = [
  { value: 'auto', label: 'Tự động', icon: 'monitor' },
  { value: 'light', label: 'Sáng', icon: 'sun' },
  { value: 'dark', label: 'Tối', icon: 'moon' },
];
function group(attrs, options = THEME, form = false) {
  const w = mount(form ? `<form><td-choice-group ${attrs}></td-choice-group></form>`
    : `<input id="before" aria-label="trước"><td-choice-group ${attrs}></td-choice-group><input id="after" aria-label="sau">`);
  const el = w.querySelector('td-choice-group');
  el.options = options;
  return el;
}
const radios = (el) => [...el.querySelectorAll('input.td-choice__input')];
const faces = (el) => [...el.querySelectorAll('.td-choice__face')];
const focusedValue = () => (document.activeElement?.classList.contains('td-choice__input') ? document.activeElement.value : null);
const ICONS = [
  { value: 'gift', label: 'Quà tặng', icon: 'star', hint: 'Tặng kèm' },
  { value: 'card', label: 'Trả góp', icon: 'price' },
  { value: 'tag', label: 'Giảm giá', icon: 'category', unavailable: true },
  { value: 'truck', label: 'Giao hàng miễn phí toàn quốc trong ngày', icon: 'send' },
  { value: 'star', label: 'Ưu đãi', icon: 'brand' },
  { value: 'x', label: 'Khác', icon: 'more', disabled: true },
];

describe('td-choice-group variant="tiles" (v0.87.0)', () => {
  it('a grid of square tiles: icon above the label, ≥ 2 columns at 400px, every tile square (long label too)', async () => {
    const w = mount('<div><td-choice-group id="tg" aria-label="Biểu tượng" variant="tiles"></td-choice-group></div>');
    w.firstElementChild.style.width = '400px'; // CSSOM (the test page has no CSP)
    const el = w.querySelector('td-choice-group');
    el.options = ICONS;
    await wait(50);
    expect(el.querySelector('.td-choice').classList.contains('td-choice--tiles')).to.equal(true);
    expect(getComputedStyle(el.querySelector('.td-choice__options')).display).to.equal('grid');
    const rects = faces(el).map((f) => f.getBoundingClientRect());
    rects.forEach((r) => expect(Math.abs(r.width - r.height)).to.be.at.most(1));
    const cols = new Set(rects.map((r) => Math.round(r.top))).size < rects.length;
    expect(cols).to.equal(true);
    const f0 = faces(el)[0];
    const icon = f0.querySelector('.td-choice__icon').getBoundingClientRect();
    const text = f0.querySelector('.td-choice__text').getBoundingClientRect();
    expect(icon.bottom <= text.top + 1).to.equal(true);
    expect(!!f0.querySelector('.td-choice__icon svg')).to.equal(true);
  });

  it('hint / note are descriptions only (sr-only + aria-describedby); no bold-width placeholder', async () => {
    const el = group('id="th" aria-label="X" variant="tiles"', ICONS);
    await wait();
    const r0 = radios(el)[0];
    const hint = el.querySelector(`#${r0.getAttribute('aria-describedby')}`);
    expect(hint.classList.contains('td-sr-only')).to.equal(true);
    expect(hint.textContent).to.equal('Tặng kèm');
    const note = el.querySelector(`#${radios(el)[2].getAttribute('aria-describedby')}`);
    expect(note.classList.contains('td-choice__note') && note.classList.contains('td-sr-only')).to.equal(true);
    expect(el.querySelector('.td-choice__text').hasAttribute('data-label')).to.equal(false);
    expect(radios(el)[5].disabled).to.equal(true);
  });

  it('keyboard = radio group: arrows move + select (wrap, skip disabled), one change each', async () => {
    const el = group('id="tk" name="t" aria-label="X" variant="tiles" value="star"', ICONS);
    await wait();
    const log = [];
    el.addEventListener('change', (e) => log.push(e.detail.value));
    document.getElementById('before').focus();
    await sendKeys({ press: TAB });
    expect(focusedValue()).to.equal('star');
    await sendKeys({ press: 'ArrowRight' }); // skips the disabled one, wraps
    expect(el.value).to.equal('gift');
    await sendKeys({ press: 'ArrowLeft' });
    expect(el.value).to.equal('star');
    expect(log).to.deep.equal(['gift', 'star']);
  });

  it('form-associated + click picks; size / icon-only / stretch are ignored; swatch / image warn once', async () => {
    const warns = captureWarn();
    const el = group('id="tf" name="kind" aria-label="X" variant="tiles" size="sm" icon-only stretch required',
      [...ICONS, { value: 'red', label: 'Đỏ', swatch: '#f00' }], true);
    await wait();
    const root = el.querySelector('.td-choice');
    expect(root.className).to.equal('td-field td-choice td-choice--tiles');
    expect(el.querySelector('.td-choice__text.td-sr-only')).to.equal(null);
    const form = el.closest('form');
    expect(form.checkValidity()).to.equal(false);
    faces(el)[1].click();
    await wait();
    expect(new FormData(form).getAll('kind')).to.deep.equal(['card']);
    expect(warns.filter((m) => m.includes('not shown by the tiles variant')).length).to.equal(1);
    expect(warns.some((m) => m.includes('icon(s) ignored'))).to.equal(false);
  });

  it('button variant still warns about icons (now "segmented" / "tiles")', async () => {
    const warns = captureWarn();
    group('id="tb" aria-label="X"', ICONS);
    await wait();
    expect(warns.some((m) => m.includes('icons show only in variant="segmented" / "tiles"'))).to.equal(true);
  });

  it('TdChoiceGroup is the registered class', () => {
    expect(customElements.get('td-choice-group')).to.equal(TdChoiceGroup);
  });
});
