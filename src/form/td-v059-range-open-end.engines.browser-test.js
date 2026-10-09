import { expect } from '@esm-bundle/chai';
import { TdModal } from '../feedback/td-modal.js';
import { TdDatetimeRange } from './td-datetime-range.js';

// v0.59.0 (plan v0.59.0-dsuite-small §E, QĐ E2 / E2b, Codex plan r1 #2) — <td-datetime-range allow-open-end>: an empty end
// reads "Không hạn" (trigger "01/10/2026 – Không hạn", the end tab, a toggle button in the "Đến" side); the end is never
// required; value / FormData / events unchanged (end ''). Runtime toggles: closed (trigger, aria-required, validity — no
// change event) and open (the button is inserted / removed in place; focus moves to the end day field when the focused
// button goes; the end being edited is kept). Since v0.61.0 the dialog is the calendar: the toggle sits beside the "Từ | Đến" switch.
// Chromium, Firefox AND WebKit. Booleans in assertions.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const raf = () => new Promise((r) => requestAnimationFrame(r));
const settle = async () => {
  await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
  await raf();
  await raf();
};
const until = async (cond, n = 300) => { for (let i = 0; i < n && !cond(); i++) await raf(); return cond(); };
const openModal = () => [...document.querySelectorAll('.td-modal')].find((m) => m.getAttribute('data-state') !== 'closing') || null;
const $ = (sel) => openModal().querySelector(sel);
const day = (iso) => $(`.td-cal__day[data-date="${iso}"]`);
const tab = (k) => $(`.td-dtr-panel__tab[data-side="${k}"]`);
const cellFocus = () => $('.td-cal__day[tabindex="0"]');
const footer = (label) => [...openModal().querySelectorAll('.td-modal__footer .td-btn')].find((b) => b.textContent.trim() === label);
const openEndBtn = () => (openModal() ? openModal().querySelectorAll('.td-dtr-panel__open-end') : []);
const NOW = new Date(2026, 9, 5, 9, 30);
const origNow = TdDatetimeRange.now;
const warns = [];
const origWarn = console.warn;

function mount(attrs = '') {
  host.innerHTML = `<form><td-datetime-range name="r" ${attrs}></td-datetime-range></form>`;
  return host.querySelector('td-datetime-range');
}
const triggerText = (el) => el.querySelector('.td-dtr__value').textContent;
const fd = (el) => { const f = new FormData(el.closest('form')); return [f.get('r[start]'), f.get('r[end]')]; };
async function open(el) {
  el.querySelector('.td-dtr__trigger').click();
  expect(await until(() => openModal() && openModal().getAttribute('data-state') === 'open'), 'modal open').to.equal(true);
  await settle();
}

beforeEach(() => {
  TdDatetimeRange.now = () => new Date(NOW.getTime());
  warns.length = 0;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
});
afterEach(async () => {
  console.warn = origWarn;
  TdModal.closeAll();
  await settle();
  host.innerHTML = '';
  TdDatetimeRange.now = origNow;
});

describe('v0.59.0 td-datetime-range allow-open-end — closed', () => {
  it('trigger "01/10/2026 – Không hạn"; FormData end ""; property; both / none / end-only texts unchanged', async () => {
    const el = mount('allow-open-end start="01/10/2026"');
    await raf();
    expect(triggerText(el)).to.equal('01/10/2026 – Không hạn');
    expect(fd(el)).to.deep.equal(['2026-10-01', '']);
    expect(el.allowOpenEnd).to.equal(true);
    el.setAttribute('end', '05/10/2026');
    expect(triggerText(el)).to.equal('01/10/2026 – 05/10/2026');
    el.removeAttribute('start');
    expect(triggerText(el)).to.equal('Đến 05/10/2026');
    el.removeAttribute('end');
    expect(triggerText(el)).to.equal('dd/mm/yyyy – dd/mm/yyyy');
  });

  it('required / both → only the start is required (silent); required="end" → one warning, end not required', async () => {
    const a = mount('allow-open-end required start="01/10/2026"');
    await raf();
    expect(a.validity.valid).to.equal(true);
    expect(a.querySelector('.td-dtr__trigger').getAttribute('aria-required')).to.equal('true');
    a.removeAttribute('start');
    expect(a.validity.valueMissing).to.equal(true);
    expect(warns.length).to.equal(0);
    const b = mount('allow-open-end required="end"');
    await raf();
    expect(b.validity.valid).to.equal(true);
    expect(b.querySelector('.td-dtr__trigger').hasAttribute('aria-required')).to.equal(false);
    expect(warns.filter((w) => w.includes('allow-open-end')).length).to.equal(1);
  });

  it('runtime toggle while closed: trigger text, aria-required + star, validity; value / FormData kept; no change', async () => {
    const el = mount('label="Hiệu lực" required start="01/10/2026"');
    await raf();
    const changes = [];
    el.addEventListener('change', () => changes.push(1));
    expect(el.validity.valueMissing).to.equal(true);
    expect(triggerText(el)).to.equal('Từ 01/10/2026');
    el.allowOpenEnd = true;
    expect(el.validity.valid).to.equal(true);
    expect(triggerText(el)).to.equal('01/10/2026 – Không hạn');
    expect(el.querySelector('.td-dtr__label .td-field__required') !== null).to.equal(true);
    el.allowOpenEnd = false;
    expect(el.validity.valueMissing).to.equal(true);
    expect(triggerText(el)).to.equal('Từ 01/10/2026');
    el.setAttribute('required', 'end');
    el.allowOpenEnd = true;
    expect(el.querySelector('.td-dtr__trigger').hasAttribute('aria-required')).to.equal(false);
    expect(el.querySelector('.td-dtr__label .td-field__required') === null).to.equal(true);
    expect(fd(el)).to.deep.equal(['2026-10-01', '']);
    expect(changes.length).to.equal(0);
  });
});

describe('v0.59.0 td-datetime-range allow-open-end — dialog', () => {
  it('the "Không hạn" button: next to the switch only with the attribute, aria-pressed = end empty, tab text', async () => {
    const el = mount('allow-open-end start="01/10/2026"');
    await open(el);
    const [b] = openEndBtn();
    expect(openEndBtn().length).to.equal(1);
    expect(b.previousElementSibling === $('.td-dtr-panel__switch') && b.getAttribute('type') === 'button').to.equal(true);
    expect(b.textContent).to.equal('Không hạn');
    expect(b.getAttribute('aria-pressed')).to.equal('true');
    expect($('.td-dtr-panel__tab[data-side="end"] .td-dtr-panel__tab-value').textContent).to.equal('Không hạn');
  });

  it('picking an end un-presses it; pressing it empties the end; pressing again focuses the calendar', async () => {
    const el = mount('allow-open-end start="01/10/2026"');
    await open(el);
    const [b] = openEndBtn();
    tab('end').click();
    day('2026-10-05').click();
    await settle();
    expect(b.getAttribute('aria-pressed')).to.equal('false');
    expect(tab('end').querySelector('.td-dtr-panel__tab-value').textContent).to.equal('05/10/2026');
    b.click();
    await settle();
    expect(b.getAttribute('aria-pressed')).to.equal('true');
    expect(tab('end').querySelector('.td-dtr-panel__tab-value').textContent).to.equal('Không hạn');
    expect(tab('end').getAttribute('aria-pressed')).to.equal('true');
    b.focus();
    b.click();
    expect(document.activeElement === cellFocus()).to.equal(true);
    expect(b.getAttribute('aria-pressed')).to.equal('true');
  });

  it('"Chọn" with an open end → one change with end "", trigger "… – Không hạn"', async () => {
    const el = mount('allow-open-end required start="01/10/2026" end="05/10/2026"');
    const changes = [];
    el.addEventListener('change', (e) => changes.push(e.detail));
    await open(el);
    openEndBtn()[0].click();
    await settle();
    footer('Chọn').click();
    await settle();
    expect(changes.length).to.equal(1);
    expect(changes[0].value).to.deep.equal({ start: '01/10/2026', end: '' });
    expect(triggerText(el)).to.equal('01/10/2026 – Không hạn');
    expect(fd(el)).to.deep.equal(['2026-10-01', '']);
  });

  it('a preset fills both sides → un-pressed', async () => {
    const el = mount('allow-open-end');
    await open(el);
    $('.td-dtr-panel__preset').click();
    await settle();
    expect(openEndBtn()[0].getAttribute('aria-pressed')).to.equal('false');
  });

  it('without the attribute: no button, the end tab shows "—"', async () => {
    const el = mount('start="01/10/2026"');
    await open(el);
    expect(openEndBtn().length).to.equal(0);
    expect($('.td-dtr-panel__tab[data-side="end"] .td-dtr-panel__tab-value').textContent).to.equal('—');
  });
});

describe('v0.59.0 td-datetime-range allow-open-end — runtime toggle while open (Codex plan r1 #2)', () => {
  it('enable: the button appears, aria-pressed matches the end being edited, focus kept', async () => {
    const el = mount('start="01/10/2026"');
    await open(el);
    cellFocus().focus();
    el.allowOpenEnd = true;
    await settle();
    expect(openEndBtn().length).to.equal(1);
    expect(openEndBtn()[0].getAttribute('aria-pressed')).to.equal('true');
    expect(document.activeElement === cellFocus()).to.equal(true);
    expect($('.td-dtr-panel__tab[data-side="end"] .td-dtr-panel__tab-value').textContent).to.equal('Không hạn');
  });

  it('disable while "Không hạn" has the focus: button removed, focus in the calendar, end still empty, no error yet', async () => {
    const el = mount('allow-open-end required start="01/10/2026"');
    await open(el);
    openEndBtn()[0].focus();
    el.allowOpenEnd = false;
    await settle();
    expect(openEndBtn().length).to.equal(0);
    expect(document.activeElement === cellFocus()).to.equal(true);
    expect($('.td-dtr-panel__tab[data-side="end"] .td-dtr-panel__tab-value').textContent).to.equal('—');
    expect($('.td-dtr-panel__error').hidden).to.equal(true);
    footer('Chọn').click();
    await settle();
    expect($('.td-dtr-panel__error').textContent).to.equal('Vui lòng chọn ngày kết thúc');
    expect(document.activeElement === tab('end')).to.equal(true);
  });

  it('disable without required: "Chọn" commits the empty end; disable with an end date keeps the date', async () => {
    const a = mount('allow-open-end start="01/10/2026"');
    const changes = [];
    a.addEventListener('change', (e) => changes.push(e.detail));
    await open(a);
    a.allowOpenEnd = false;
    await settle();
    footer('Chọn').click();
    await settle();
    expect(changes.length === 1 && changes[0].value.end === '').to.equal(true);
    TdModal.closeAll();
    await settle();
    const b = mount('allow-open-end start="01/10/2026" end="05/10/2026"');
    await open(b);
    b.allowOpenEnd = false;
    await settle();
    expect(openEndBtn().length).to.equal(0);
    expect(tab('end').querySelector('.td-dtr-panel__tab-value').textContent).to.equal('05/10/2026');
  });

  it('datetime, TIME screen: removing "Không hạn" while it has the focus hands the focus to the hour wheel (never outside the modal)', async () => {
    const el = mount('mode="datetime" allow-open-end start="01/10/2026 - 08:00" end="05/10/2026 - 17:30"');
    await open(el);
    day('2026-10-02').click(); // → the time screen (the calendar is hidden)
    await settle();
    expect($('.td-dtr-panel').getAttribute('data-step')).to.equal('time');
    openEndBtn()[0].focus();
    el.allowOpenEnd = false;
    await settle();
    expect(openEndBtn().length).to.equal(0);
    expect(document.activeElement === $('.td-dtp-wheel__list[data-part="hour"]')).to.equal(true);
    expect(openModal().contains(document.activeElement)).to.equal(true);
  });

  it('enable → disable → enable never duplicates the button', async () => {
    const el = mount('start="01/10/2026"');
    await open(el);
    el.allowOpenEnd = true;
    el.allowOpenEnd = false;
    el.allowOpenEnd = true;
    await settle();
    expect(openEndBtn().length).to.equal(1);
  });
});
