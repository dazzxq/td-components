import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import { TdChoiceGroup } from './td-choice-group.js';

// v0.52.0 (plan docs/internal/plans/v0.52.0-toggle-tone-segmented.md M4) — <td-choice-group variant="segmented"> in
// Chromium, Firefox AND WebKit with real keys. DOM nodes are compared as booleans (a failing chai assertion carrying DOM
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
const nameOf = (r) => (r.getAttribute('aria-labelledby') || '').split(' ').map((id) => document.getElementById(id)?.textContent).join(' ');

describe('td-choice-group variant="segmented" (v0.52 M4)', () => {
  it('icon + label per segment, radiogroup semantics, name = the label, hint only as a description', async () => {
    const el = group('id="th" name="theme" aria-label="Giao diện" variant="segmented" value="auto"',
      [...THEME.slice(0, 2), { ...THEME[2], hint: 'Đỡ chói' }]);
    await wait();
    expect(el instanceof TdChoiceGroup).to.equal(true);
    expect(el.querySelector('.td-choice').classList.contains('td-choice--segmented')).to.equal(true);
    expect(el.querySelector('[role="radiogroup"]').getAttribute('aria-label')).to.equal('Giao diện');
    const rs = radios(el);
    expect(rs.length).to.equal(3);
    expect(rs.map(nameOf)).to.deep.equal(['Tự động', 'Sáng', 'Tối']);
    const icons = faces(el).map((f) => f.querySelector('.td-choice__icon')?.getAttribute('data-td-icon'));
    expect(icons).to.deep.equal(['monitor', 'sun', 'moon']);
    expect(faces(el).every((f) => f.querySelector('.td-choice__icon svg') && f.querySelector('.td-choice__icon').getAttribute('aria-hidden') === 'true')).to.equal(true);
    const hint = el.querySelector('#th-o2-h');
    expect(hint.classList.contains('td-sr-only')).to.equal(true);
    expect(rs[2].getAttribute('aria-describedby')).to.equal('th-o2-h');
    expect(el.querySelectorAll('.td-choice__swatch, .td-choice__image').length).to.equal(0);
    expect(rs[0].checked).to.equal(true);
  });

  it('equal-width segments (±1px), the bold selected label does not move the segments', async () => {
    const el = group('id="eq" aria-label="Chế độ" variant="segmented" value="auto"',
      [{ value: 'a', label: 'Tự động', icon: 'monitor' }, { value: 'b', label: 'Sáng', icon: 'sun' }, { value: 'c', label: 'Rất rất tối', icon: 'moon' }]);
    await wait();
    const widths = () => [...el.querySelectorAll('.td-choice__option')].map((o) => o.getBoundingClientRect().width);
    const w0 = widths();
    expect(Math.max(...w0) - Math.min(...w0) <= 1).to.equal(true);
    const xs0 = [...el.querySelectorAll('.td-choice__option')].map((o) => Math.round(o.getBoundingClientRect().left));
    el.value = 'c';
    await wait();
    const xs1 = [...el.querySelectorAll('.td-choice__option')].map((o) => Math.round(o.getBoundingClientRect().left));
    expect(xs1).to.deep.equal(xs0);
  });

  it('selected = pill (control bg) + 1px ring + semibold text; idle = muted text on the fill trough', async () => {
    const el = group('id="pl" aria-label="X" variant="segmented" value="light"');
    await wait();
    const [idle, sel] = faces(el);
    const cs = getComputedStyle(sel);
    expect(cs.boxShadow.includes('inset')).to.equal(true);
    expect(Number(getComputedStyle(sel.querySelector('.td-choice__text')).fontWeight) >= 600).to.equal(true);
    expect(getComputedStyle(idle).backgroundColor === cs.backgroundColor).to.equal(false);
  });

  it('keyboard = radio group: one Tab stop, arrows move + select (wrap, skip disabled), input + change once each', async () => {
    const el = group('id="kb" name="t" aria-label="X" variant="segmented" value="auto"',
      [...THEME, { value: 'x', label: 'Khác', icon: 'more', disabled: true }]);
    await wait();
    const log = [];
    el.addEventListener('input', (e) => log.push(`input:${e.detail.value}`));
    el.addEventListener('change', (e) => log.push(`change:${e.detail.value}`));
    document.getElementById('before').focus();
    await sendKeys({ press: TAB });
    expect(focusedValue()).to.equal('auto');
    await sendKeys({ press: 'ArrowRight' });
    expect(el.value).to.equal('light');
    await sendKeys({ press: 'ArrowRight' });
    await sendKeys({ press: 'ArrowRight' }); // skips the disabled one, wraps
    expect(el.value).to.equal('auto');
    expect(focusedValue()).to.equal('auto');
    await sendKeys({ press: TAB });
    expect(document.activeElement?.id).to.equal('after');
    expect(log).to.deep.equal(['input:light', 'change:light', 'input:dark', 'change:dark', 'input:auto', 'change:auto']);
  });

  it('form-associated: FormData / required / reset like every variant', async () => {
    const el = group('id="fm" name="theme" aria-label="X" variant="segmented" required', THEME, true);
    await wait();
    const form = el.closest('form');
    expect(form.checkValidity()).to.equal(false);
    radios(el)[2].click();
    await wait();
    expect(new FormData(form).getAll('theme')).to.deep.equal(['dark']);
    form.reset();
    await wait();
    expect(el.value).to.equal('');
  });

  it('icon-only: labels hidden visually (still the names); an option without a valid icon shows its label + a warning', async () => {
    const warns = captureWarn();
    const el = group('id="io" aria-label="Giao diện" variant="segmented" icon-only',
      [...THEME, { value: 'z', label: 'Không icon' }, { value: 'q', label: 'Sai icon', icon: 'not-an-icon' }]);
    await wait();
    const texts = [...el.querySelectorAll('.td-choice__text')];
    expect(texts.slice(0, 3).every((t) => t.classList.contains('td-sr-only'))).to.equal(true);
    expect(texts.slice(3).some((t) => t.classList.contains('td-sr-only'))).to.equal(false);
    expect(radios(el).map(nameOf)).to.deep.equal(['Tự động', 'Sáng', 'Tối', 'Không icon', 'Sai icon']);
    expect(warns.length >= 1).to.equal(true);
    expect(warns.some((w) => w.includes('not-an-icon'))).to.equal(false);
  });

  it('swatch / image ignored with one warning; icon ignored outside segmented (warning)', async () => {
    const warns = captureWarn();
    const el = group('id="sw" aria-label="X" variant="segmented"', [{ value: 'a', label: 'A', swatch: '#f00', icon: 'sun' }]);
    const b = group('id="bt" aria-label="Y"', [{ value: 'a', label: 'A', icon: 'sun' }]);
    await wait();
    expect(el.querySelector('svg.td-choice__swatch')).to.equal(null);
    expect(b.querySelector('.td-choice__icon')).to.equal(null);
    expect(warns.filter((w) => w.includes('segmented')).length).to.equal(2);
  });

  it('sizes sm / md / lg → segment heights grow; unknown → md', async () => {
    const hs = {};
    for (const s of ['sm', 'md', 'lg', 'xx']) {
      const el = group(`id="sz-${s}" aria-label="X" variant="segmented" size="${s}"`);
      await wait();
      hs[s] = faces(el)[0].getBoundingClientRect().height;
    }
    expect(hs.sm < hs.md && hs.md < hs.lg).to.equal(true);
    expect(Math.abs(hs.xx - hs.md) <= 0.5).to.equal(true);
  });

  it('variant / size / icon-only changes at runtime: value + focus kept', async () => {
    const el = group('id="rt" aria-label="X" variant="segmented" value="dark"');
    await wait();
    radios(el)[2].focus();
    el.setAttribute('icon-only', '');
    await wait();
    expect(focusedValue()).to.equal('dark');
    el.setAttribute('size', 'sm');
    await wait();
    expect(el.querySelector('.td-choice').classList.contains('td-choice--sm')).to.equal(true);
    el.setAttribute('variant', 'button');
    await wait();
    expect(focusedValue()).to.equal('dark');
    expect(el.value).to.equal('dark');
    expect(el.querySelector('.td-choice__icon')).to.equal(null);
  });

  it('same value list re-assigned → patched in place (radio nodes kept), icons updated', async () => {
    const el = group('id="pt" aria-label="X" variant="segmented" value="auto"');
    await wait();
    const before = radios(el);
    el.options = THEME.map((o) => ({ ...o, icon: o.value === 'auto' ? 'sun' : o.icon }));
    await wait();
    expect(radios(el).every((r, i) => r === before[i])).to.equal(true);
    expect(faces(el)[0].querySelector('.td-choice__icon').getAttribute('data-td-icon')).to.equal('sun');
    expect(faces(el)[0].querySelector('.td-choice__icon svg')?.getAttribute('data-icon')).to.equal('sun');
  });

  it('a click on a segment selects it (mouse)', async () => {
    const el = group('id="ck" aria-label="X" variant="segmented" value="auto"');
    await wait();
    const r = faces(el)[2].getBoundingClientRect();
    await sendMouse({ type: 'click', position: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] });
    await wait();
    expect(el.value).to.equal('dark');
  });

  it('unavailable: struck label + note; icon-only → the diagonal mark', async () => {
    const el = group('id="un" aria-label="X" variant="segmented" icon-only', [...THEME.slice(0, 2), { ...THEME[2], unavailable: true }]);
    await wait();
    const opt = el.querySelectorAll('.td-choice__option')[2];
    expect(opt.hasAttribute('data-unavailable')).to.equal(true);
    expect(getComputedStyle(opt.querySelector('.td-choice__icon'), '::after').content).to.not.equal('none');
    expect(radios(el)[2].getAttribute('aria-describedby')).to.equal('un-o2-n');
  });
});
