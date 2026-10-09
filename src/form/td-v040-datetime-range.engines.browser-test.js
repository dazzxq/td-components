// v0.40.0 (plan docs/internal/plans/v0.39.0-filters-range.md QĐ 17–25, M2) — <td-datetime-range> in Chromium, Firefox
// AND WebKit with real keys / clicks: opening, presets (+ aria-pressed, announcement), order / span / required errors in
// the dialog, one `change`, FormData (two entries, names, reset, <fieldset disabled>, state restore), validity flags,
// TdFormValidation, the calendar dialog (v0.61.0: one grid + the "Từ | Đến" switch, sheet < 720), the short landscape footer,
// XSS of preset labels.
// Booleans in assertions (DOM nodes in a failing chai assertion hang the runner).
import { expect } from '@esm-bundle/chai';
import { setViewport, sendKeys } from '@web/test-runner-commands';
import { TdModal } from '../feedback/td-modal.js';
import { TdFormValidation } from '../utils/form-validation.js';
import { TdDatetimeRange } from './td-datetime-range.js';

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
const $$ = (sel) => [...openModal().querySelectorAll(sel)];
const rect = (el) => el.getBoundingClientRect();
const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && rect(el).width > 1 && rect(el).height > 1;
const day = (iso) => $(`.td-cal__day[data-date="${iso}"]`);
const tab = (k) => $(`.td-dtr-panel__tab[data-side="${k}"]`);
const footer = (label) => $$('.td-modal__footer .td-btn').find((b) => b.textContent.trim() === label);
const preset = (id) => $(`.td-dtr-panel__preset[data-id="${id}"]`);
const NOW = new Date(2026, 9, 5, 9, 30); // 05/10/2026 09:30 local
const origNow = TdDatetimeRange.now;
const origPresets = TdDatetimeRange.presets;

function mount(attrs = '', inForm = false) {
  host.insertAdjacentHTML('beforeend', inForm
    ? `<form><td-datetime-range ${attrs}></td-datetime-range><button type="submit">Lưu</button></form>`
    : `<td-datetime-range ${attrs}></td-datetime-range>`);
  return host.querySelector('td-datetime-range:last-of-type') || host.lastElementChild.querySelector('td-datetime-range');
}

async function open(el, how = 'click') {
  const trigger = el.querySelector('.td-dtr__trigger');
  if (how === 'click') trigger.click();
  else {
    trigger.focus();
    await sendKeys({ press: how });
  }
  expect(await until(() => openModal() && openModal().getAttribute('data-state') === 'open'), 'modal open').to.equal(true);
  await settle();
}

beforeEach(() => { TdDatetimeRange.now = () => new Date(NOW.getTime()); });
afterEach(async () => {
  TdModal.closeAll();
  await settle();
  host.innerHTML = '';
  document.querySelectorAll('body > .td-modal').forEach((m) => m.remove());
  TdDatetimeRange.now = origNow;
  TdDatetimeRange.presets = origPresets;
});
after(async () => { await setViewport({ width: 800, height: 600 }); });

describe('v0.40.0 td-datetime-range — host', () => {
  it('combobox trigger; placeholder; "a – b" / "Từ a" / "Đến b"; label names the trigger', async () => {
    const el = mount('label="Khoảng ngày" name="range"');
    const t = el.querySelector('.td-dtr__trigger');
    expect(t.getAttribute('role')).to.equal('combobox');
    expect(t.getAttribute('aria-haspopup')).to.equal('dialog');
    expect(t.getAttribute('aria-labelledby')).to.equal(`${el.id}-label`);
    const v = el.querySelector('.td-dtr__value');
    expect(v.hasAttribute('data-placeholder')).to.equal(true);
    expect(v.textContent).to.equal('dd/mm/yyyy – dd/mm/yyyy');
    el.setAttribute('start', '2026-10-01');
    expect(v.textContent).to.equal('Từ 01/10/2026');
    el.setAttribute('end', '05/10/2026');
    expect(v.textContent).to.equal('01/10/2026 – 05/10/2026');
    el.removeAttribute('start');
    expect(v.textContent).to.equal('Đến 05/10/2026');
    expect(t === el.querySelector('.td-dtr__trigger'), 'updated in place').to.equal(true);
  });

  it('getValue / getDBValue / setValue / setDBValue (silent); mode="month" → date + one warning', async () => {
    const warns = [];
    const ow = console.warn;
    console.warn = (m) => warns.push(String(m));
    try {
      const el = mount('mode="month" name="r"');
      let changes = 0;
      el.addEventListener('change', () => { changes++; });
      el.setValue({ start: '01/10/2026', end: '2026-10-05' });
      expect(el.getValue()).to.deep.equal({ start: '01/10/2026', end: '05/10/2026' });
      expect(el.getDBValue()).to.deep.equal({ start: '2026-10-01', end: '2026-10-05' });
      el.setDBValue({ start: '2026-09-01', end: '' });
      expect(el.getValue()).to.deep.equal({ start: '01/09/2026', end: '' });
      el.setDBValue({ start: 'junk', end: '2026-09-02' }); // malformed → whole call ignored
      expect(el.getValue()).to.deep.equal({ start: '01/09/2026', end: '' });
      el.setValue(null);
      expect(el.getValue()).to.deep.equal({ start: '', end: '' });
      expect(changes).to.equal(0);
      expect(warns.filter((w) => w.includes('mode="month"')).length).to.equal(1);
    } finally {
      console.warn = ow;
    }
  });

  it('datetime mode: values, DB format, mode change converts (end → last minute slot)', async () => {
    const el = mount('mode="datetime" name="r" start="01/10/2026 - 08:00" end="2026-10-05T17:30"');
    expect(el.getValue()).to.deep.equal({ start: '01/10/2026 - 08:00', end: '05/10/2026 - 17:30' });
    expect(el.getDBValue()).to.deep.equal({ start: '2026-10-01 08:00:00', end: '2026-10-05 17:30:00' });
    el.setAttribute('mode', 'date');
    expect(el.getValue()).to.deep.equal({ start: '01/10/2026', end: '05/10/2026' });
    el.setAttribute('minute-step', '15');
    el.setAttribute('mode', 'datetime');
    expect(el.getValue()).to.deep.equal({ start: '01/10/2026 - 00:00', end: '05/10/2026 - 23:45' });
  });
});

describe('v0.40.0 td-datetime-range — dialog (the calendar since v0.61.0)', () => {
  before(async () => { await setViewport({ width: 1280, height: 800 }); });

  it('opens with Enter and with ArrowDown (real keys); the "Từ | Đến" switch; presets group "Chọn nhanh"; focus in the calendar', async () => {
    const el = mount('label="Ngày" name="r"');
    await open(el, 'Enter');
    expect(el.querySelector('.td-dtr__trigger').getAttribute('aria-expanded')).to.equal('true');
    expect($$('.td-dtr-panel__tab .td-dtr-panel__tab-label').map((l) => l.textContent)).to.deep.equal(['Từ', 'Đến']);
    expect($$('.td-dtr-panel fieldset').length, 'no fieldset editors any more').to.equal(0);
    expect($('.td-dtr-panel__presets').getAttribute('role')).to.equal('group');
    expect($('.td-dtr-panel__presets').getAttribute('aria-label')).to.equal('Chọn nhanh');
    expect($$('.td-dtr-panel__preset').map((b) => b.textContent)).to.deep.equal(['Hôm nay', '7 ngày qua', '30 ngày qua', 'Tháng này']);
    expect(document.activeElement === $('.td-cal__day[tabindex="0"]'), 'focus on the active calendar cell').to.equal(true);
    expect($$('.td-dtr-panel__tab-value').map((t) => t.textContent)).to.deep.equal(['—', '—']); // an empty side opens empty
    await sendKeys({ press: 'Escape' });
    expect(await until(() => !openModal())).to.equal(true);
    await settle();
    await open(el, 'ArrowDown');
    expect(!!openModal()).to.equal(true);
  });

  it('≥ 720 (1280): ONE calendar, the switch shows in both modes, the presets are a column left of it', async () => {
    for (const mode of ['date', 'datetime']) {
      const el = mount(`name="r" mode="${mode}"`);
      await open(el);
      expect($$('.td-cal').length).to.equal(1);
      expect(shown($('.td-dtr-panel__switch')), `${mode}: switch`).to.equal(true);
      expect(rect($('.td-dtr-panel__presets')).right <= rect($('.td-cal')).left, `${mode}: presets left of the calendar`).to.equal(true);
      if (mode === 'datetime') expect(shown($('.td-time-step')), 'datetime: the time screen is a second screen (hidden on the date screen)').to.equal(false);
      TdModal.closeAll();
      await settle();
      host.innerHTML = '';
    }
  });

  it('preset fills both sides + aria-pressed + announcement; picking a day clears pressed; Chọn → one change with preset', async () => {
    const el = mount('name="r"');
    const events = [];
    el.addEventListener('change', (e) => events.push(e.detail));
    await open(el);
    preset('last7').click();
    expect($$('.td-dtr-panel__tab-value').map((t) => t.textContent)).to.deep.equal(['29/09/2026', '05/10/2026']);
    expect(preset('last7').getAttribute('aria-pressed')).to.equal('true');
    expect(preset('today').getAttribute('aria-pressed')).to.equal('false');
    expect($('.td-dtr-panel__status').getAttribute('role')).to.equal('status');
    expect($('.td-dtr-panel__status').textContent).to.equal('Đã chọn 7 ngày qua: 29/09/2026 – 05/10/2026');
    expect(!!openModal(), 'a preset does not close').to.equal(true);
    day('2026-09-30').click(); // side = start → a new range
    expect(preset('last7').getAttribute('aria-pressed')).to.equal('false');
    day('2026-09-29').click();
    day('2026-10-05').click();
    expect(preset('last7').getAttribute('aria-pressed')).to.equal('true');
    footer('Chọn').click();
    expect(await until(() => !openModal())).to.equal(true);
    expect(events.length).to.equal(1);
    expect(events[0]).to.deep.equal({ value: { start: '29/09/2026', end: '05/10/2026' }, dbValue: { start: '2026-09-29', end: '2026-10-05' }, preset: 'last7' });
    expect(el.querySelector('.td-dtr__value').textContent).to.equal('29/09/2026 – 05/10/2026');
    await settle();
    expect(document.activeElement === el.querySelector('.td-dtr__trigger'), 'focus back on the trigger').to.equal(true);
  });

  it('datetime presets: 00:00 → 23:45 with minute-step 15 (the wheels follow the active endpoint)', async () => {
    const el = mount('name="r" mode="datetime" minute-step="15"');
    await open(el);
    preset('today').click();
    const sel = (part) => $(`.td-dtp-wheel__list[data-part="${part}"] [aria-selected="true"]`).getAttribute('data-value');
    expect([sel('hour'), sel('minute')]).to.deep.equal(['0', '0']);
    tab('end').click();
    expect([sel('hour'), sel('minute')]).to.deep.equal(['23', '45']);
    footer('Chọn').click();
    expect(await until(() => !openModal())).to.equal(true);
    expect(el.getValue()).to.deep.equal({ start: '05/10/2026 - 00:00', end: '05/10/2026 - 23:45' });
  });

  it('start > end (attributes): "Chọn" stays open, the order error shows in role=alert, focus + describedby on the "Đến" tab', async () => {
    const el = mount('name="r" start="10/10/2026" end="05/10/2026"');
    let changes = 0;
    el.addEventListener('change', () => { changes++; });
    await open(el);
    const line = $('.td-dtr-panel__error');
    expect(line.getAttribute('role')).to.equal('alert');
    expect(line.hidden).to.equal(false);
    expect(line.textContent).to.equal('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc');
    footer('Chọn').click();
    await settle();
    expect(!!openModal(), 'still open').to.equal(true);
    expect(changes).to.equal(0);
    expect(document.activeElement === tab('end'), 'focus on the Đến tab').to.equal(true);
    expect(tab('end').getAttribute('aria-pressed')).to.equal('true');
    expect((tab('end').getAttribute('aria-describedby') || '').split(' ').includes(line.id)).to.equal(true);
    day('2026-10-12').click(); // side = end, start 10/10: a day after it is the new end
    expect(line.hidden).to.equal(true);
    expect(tab('end').hasAttribute('aria-describedby')).to.equal(false);
  });

  it('date mode: a second day EARLIER than Từ starts a new range (no error, no order message)', async () => {
    const el = mount('name="r"');
    await open(el);
    day('2026-10-05').click();
    day('2026-10-02').click();
    expect($('.td-dtr-panel__error').hidden).to.equal(true);
    expect($$('.td-dtr-panel__tab-value').map((t) => t.textContent)).to.deep.equal(['02/10/2026', '—']);
    expect(tab('end').getAttribute('aria-pressed')).to.equal('true');
    day('2026-10-04').click();
    expect($$('.td-dtr-panel__tab-value').map((t) => t.textContent)).to.deep.equal(['02/10/2026', '04/10/2026']);
  });

  it('one side empty is valid without required; "Xoá" empties both; Chọn commits the empty sides', async () => {
    const el = mount('name="r" start="01/10/2026" end="05/10/2026"');
    const events = [];
    el.addEventListener('change', (e) => events.push(e.detail));
    await open(el);
    day('2026-10-01').click(); // a new range with only a start
    footer('Chọn').click();
    expect(await until(() => !openModal())).to.equal(true);
    expect(el.getValue()).to.deep.equal({ start: '01/10/2026', end: '' });
    expect(el.querySelector('.td-dtr__value').textContent).to.equal('Từ 01/10/2026');
    await settle();
    await open(el);
    footer('Xoá').click();
    expect(!!openModal(), 'Xoá keeps the dialog open').to.equal(true);
    expect($$('.td-dtr-panel__tab-value').map((t) => t.textContent)).to.deep.equal(['—', '—']);
    footer('Chọn').click();
    expect(await until(() => !openModal())).to.equal(true);
    expect(el.getValue()).to.deep.equal({ start: '', end: '' });
    expect(events.map((e) => e.preset)).to.deep.equal([null, null]);
  });

  it('required="end": Chọn with an empty end → "Vui lòng chọn ngày kết thúc", the Đến tab is active + focused', async () => {
    const el = mount('name="r" required="end"');
    await open(el);
    footer('Chọn').click();
    await settle();
    expect(!!openModal()).to.equal(true);
    expect($('.td-dtr-panel__error').textContent).to.equal('Vui lòng chọn ngày kết thúc');
    expect(document.activeElement === tab('end')).to.equal(true);
    expect(tab('end').getAttribute('aria-pressed')).to.equal('true');
  });

  it('max-days: a preset beyond it → span error in the dialog and customError on the host', async () => {
    const el = mount('name="r" max-days="7"');
    await open(el);
    preset('last30').click();
    expect($('.td-dtr-panel__error').textContent).to.equal('Khoảng tối đa 7 ngày');
    footer('Chọn').click();
    await settle();
    expect(!!openModal()).to.equal(true);
    preset('last7').click();
    expect($('.td-dtr-panel__error').hidden).to.equal(true);
    footer('Chọn').click();
    expect(await until(() => !openModal())).to.equal(true);
    el.setAttribute('start', '01/09/2026');
    expect(el.validity.customError).to.equal(true);
    expect(el.validationMessage).to.equal('Khoảng tối đa 7 ngày');
  });

  it('max-days (date): the end past the limit is DIMMED but enabled; activating it starts a new range with the note', async () => {
    const el = mount('name="r" max-days="3"');
    await open(el);
    day('2026-10-05').click();
    expect(day('2026-10-07').hasAttribute('data-dimmed')).to.equal(false); // 5, 6, 7 = 3 days
    expect(day('2026-10-08').hasAttribute('data-dimmed')).to.equal(true);
    expect(day('2026-10-08').hasAttribute('aria-disabled'), 'dimmed ≠ disabled').to.equal(false);
    expect($('.td-dtr-panel__hint').hidden).to.equal(false);
    expect($('.td-dtr-panel__hint').textContent).to.equal('Tối đa 3 ngày');
    day('2026-10-08').click();
    expect($$('.td-dtr-panel__tab-value').map((t) => t.textContent)).to.deep.equal(['08/10/2026', '—']);
    expect(tab('end').getAttribute('aria-pressed')).to.equal('true');
    expect($('.td-dtr-panel__status').textContent).to.contain('Tối đa 3 ngày');
    expect($('.td-dtr-panel__error').hidden).to.equal(true);
  });

  it('min / max clamp presets; a preset entirely outside → aria-disabled (no click effect)', async () => {
    const el = mount('name="r" min="01/10/2026" max="2026-10-03"');
    await open(el);
    preset('last7').click();
    expect($$('.td-dtr-panel__tab-value').map((t) => t.textContent)).to.deep.equal(['01/10/2026', '03/10/2026']);
    expect(preset('today').getAttribute('aria-disabled')).to.equal('true');
    preset('today').click();
    expect($$('.td-dtr-panel__tab-value').map((t) => t.textContent)).to.deep.equal(['01/10/2026', '03/10/2026']);
    expect(day('2026-10-04').getAttribute('aria-disabled')).to.equal('true'); // the cells follow min / max
    expect(day('2026-09-30').getAttribute('aria-disabled')).to.equal('true');
  });

  it('presets = [] hides the row; presets assigned before the upgrade are used; XSS label stays text', async () => {
    const a = mount('name="a"');
    a.presets = [];
    await open(a);
    expect(openModal().querySelector('.td-dtr-panel__presets')).to.equal(null);
    TdModal.closeAll();
    await settle();
    const b = document.createElement('div');
    b.innerHTML = '<td-datetime-range name="b"></td-datetime-range>';
    const el = b.firstElementChild;
    Object.defineProperty(el, 'presets', { value: [{ id: 'x', label: '<img src=x onerror="window.__dtrXss=1">Quý', resolve: (n) => ({ start: n, end: n }) }], writable: true, configurable: true, enumerable: true });
    host.appendChild(b);
    await open(el);
    const btn = preset('x');
    expect(btn.textContent).to.equal('<img src=x onerror="window.__dtrXss=1">Quý');
    expect(openModal().querySelector('.td-dtr-panel__presets img')).to.equal(null);
    expect(window.__dtrXss).to.equal(undefined);
  });

  it('a throwing / invalid preset is disabled with ONE console.error', async () => {
    const errs = [];
    const oe = console.error;
    console.error = (m) => errs.push(String(m));
    try {
      TdDatetimeRange.presets = [{ id: 'boom', label: 'Boom', resolve() { throw new Error('x'); } }, { id: 'bad', label: 'Bad', resolve: () => ({ start: 'x', end: 'y' }) }];
      const el = mount('name="r"');
      await open(el);
      expect(preset('boom').getAttribute('aria-disabled')).to.equal('true');
      expect(preset('bad').getAttribute('aria-disabled')).to.equal('true');
      TdModal.closeAll();
      await settle();
      await open(el);
      expect(errs.length).to.equal(2);
    } finally {
      console.error = oe;
    }
  });
});

describe('v0.40.0 td-datetime-range — sheet < 720 and short landscape (the calendar since v0.61.0)', () => {
  it('393×852: the switch shows both endpoints; a day opens the time screen, "Tiếp: Đến" / the Đến tab move between endpoints (the wheels swap)', async () => {
    await setViewport({ width: 393, height: 852 });
    const el = mount('name="r" mode="datetime" start="01/10/2026 - 08:00" end="05/10/2026 - 17:30"');
    await open(el);
    const tabs = $$('.td-dtr-panel__tab');
    expect(shown($('.td-dtr-panel__switch'))).to.equal(true);
    expect(tabs.map((t) => t.getAttribute('aria-pressed'))).to.deep.equal(['true', 'false']);
    expect(tabs[0].querySelector('.td-dtr-panel__tab-value').textContent).to.equal('01/10/2026 - 08:00');
    expect(tabs[1].querySelector('.td-dtr-panel__tab-value').textContent).to.equal('05/10/2026 - 17:30');
    expect(shown($('.td-dtr-panel__next')), '"Tiếp: Đến" belongs to the time screen').to.equal(false);
    day('2026-10-01').click(); // a day → the TIME screen of Từ
    await settle();
    const hour = () => $('.td-dtp-wheel__list[data-part="hour"] [aria-selected="true"]').getAttribute('data-value');
    expect(hour()).to.equal('8');
    expect(shown($('.td-dtr-panel__next')), '"Tiếp: Đến" while editing Từ on the time screen').to.equal(true);
    expect(document.activeElement === $('.td-dtp-wheel__list[data-part="hour"]'), 'focus on the hour wheel').to.equal(true);
    tabs[1].click(); // Đến has a date → the screen kind (time) is kept
    await settle();
    expect(tabs.map((t) => t.getAttribute('aria-pressed'))).to.deep.equal(['false', 'true']);
    expect(hour()).to.equal('17');
    expect(shown($('.td-dtr-panel__next')), 'hidden while editing Đến').to.equal(false);
    tabs[0].click();
    await settle();
    $('.td-dtr-panel__next').click(); // "Tiếp: Đến" → the DATE screen of Đến
    await settle();
    expect(tabs.map((t) => t.getAttribute('aria-pressed'))).to.deep.equal(['false', 'true']);
    expect(shown($('.td-cal')) && !shown($('.td-time-step'))).to.equal(true);
    expect(document.activeElement.getAttribute('data-date')).to.equal('2026-10-05');
  });

  it('393×852: a rejected "Chọn" activates the Đến endpoint and focuses its tab', async () => {
    await setViewport({ width: 393, height: 852 });
    const el = mount('name="r" start="10/10/2026" end="05/10/2026"');
    await open(el);
    footer('Chọn').click();
    await settle();
    expect(tab('end').getAttribute('aria-pressed')).to.equal('true');
    expect(document.activeElement === tab('end')).to.equal(true);
  });

  it('844×390 (short): presets on one scrolling row, "Chọn" inside the viewport', async () => {
    await setViewport({ width: 844, height: 390 });
    const el = mount('name="r" mode="datetime"');
    await open(el);
    const row = $('.td-dtr-panel__presets');
    expect(getComputedStyle(row).flexWrap).to.equal('nowrap');
    const b = rect(footer('Chọn'));
    expect(b.bottom <= innerHeight + 0.5 && b.top >= 0, `Chọn in viewport (${b.top}–${b.bottom} of ${innerHeight})`).to.equal(true);
    expect(document.documentElement.scrollWidth <= innerWidth, 'no page overflow').to.equal(true);
  });

  after(async () => { await setViewport({ width: 1280, height: 800 }); });
});

describe('v0.40.0 td-datetime-range — form (review R1-2)', () => {
  it('FormData: range[start] / range[end] (empty → ""), start-name / end-name override, runtime name change', async () => {
    const el = mount('name="range" start="01/10/2026"', true);
    const form = el.closest('form');
    let fd = new FormData(form);
    expect(fd.getAll('range[start]')).to.deep.equal(['2026-10-01']);
    expect(fd.getAll('range[end]')).to.deep.equal(['']);
    el.setAttribute('start-name', 'date_from');
    el.setAttribute('end-name', 'date_to');
    fd = new FormData(form);
    expect([fd.get('date_from'), fd.get('date_to'), fd.has('range[start]')]).to.deep.equal(['2026-10-01', '', false]);
    el.removeAttribute('start-name');
    el.removeAttribute('end-name');
    el.setAttribute('name', 'loc');
    fd = new FormData(form);
    expect([fd.get('loc[start]'), fd.get('loc[end]')]).to.deep.equal(['2026-10-01', '']);
    el.setAttribute('form-value-format', 'display');
    expect(new FormData(form).get('loc[start]')).to.equal('01/10/2026');
    el.setAttribute('mode', 'datetime');
    el.setAttribute('form-value-format', 'db');
    expect(new FormData(form).get('loc[start]')).to.equal('2026-10-01 00:00:00');
  });

  it('no name → not submitted + one warning', async () => {
    const warns = [];
    const ow = console.warn;
    console.warn = (m) => warns.push(String(m));
    try {
      const el = mount('start="01/10/2026"', true);
      expect([...new FormData(el.closest('form')).keys()]).to.deep.equal([]);
      el.setAttribute('end', '02/10/2026');
      expect(warns.filter((w) => w.includes('not submitted')).length).to.equal(1);
    } finally {
      console.warn = ow;
    }
  });

  it('form.reset() → the defaults (value + FormData)', async () => {
    const el = mount('name="r" start="01/10/2026" end="05/10/2026"', true);
    const form = el.closest('form');
    el.setValue({ start: '02/10/2026', end: '' });
    form.reset();
    expect(el.getValue()).to.deep.equal({ start: '01/10/2026', end: '05/10/2026' });
    const fd = new FormData(form);
    expect([fd.get('r[start]'), fd.get('r[end]')]).to.deep.equal(['2026-10-01', '2026-10-05']);
  });

  it('<fieldset disabled>: no entries, trigger locked; enabled again → back', async () => {
    host.innerHTML = '<form><fieldset><td-datetime-range name="r" start="01/10/2026"></td-datetime-range></fieldset></form>';
    const el = host.querySelector('td-datetime-range');
    const form = host.querySelector('form');
    const fs = host.querySelector('fieldset');
    fs.disabled = true;
    await raf();
    expect([...new FormData(form).keys()]).to.deep.equal([]);
    expect(el.querySelector('.td-dtr__trigger').disabled).to.equal(true);
    fs.disabled = false;
    await raf();
    expect(el.querySelector('.td-dtr__trigger').disabled).to.equal(false);
    expect(new FormData(form).get('r[start]')).to.equal('2026-10-01');
  });

  it('formStateRestoreCallback: JSON v1 restores; junk / other versions ignored', async () => {
    const el = mount('name="r"', true);
    el.formStateRestoreCallback(JSON.stringify({ v: 1, start: '01/10/2026', end: '03/10/2026' }), 'restore');
    expect(el.getValue()).to.deep.equal({ start: '01/10/2026', end: '03/10/2026' });
    for (const bad of ['{', JSON.stringify({ v: 2, start: 'x', end: 'y' }), JSON.stringify({ v: 1, start: 5, end: '' }), JSON.stringify({ v: 1, start: 'x'.repeat(100), end: '' })]) {
      el.formStateRestoreCallback(bad, 'restore');
      expect(el.getValue()).to.deep.equal({ start: '01/10/2026', end: '03/10/2026' });
    }
  });

  it('validity flags: valueMissing (bare / start / end), badInput, rangeUnderflow / Overflow, customError (order)', async () => {
    const el = mount('name="r" required', true);
    const form = el.closest('form');
    expect(el.validity.valueMissing).to.equal(true);
    expect(el.validationMessage).to.equal('Vui lòng chọn khoảng ngày');
    expect(form.checkValidity()).to.equal(false);
    el.setAttribute('required', 'start');
    el.setAttribute('end', '05/10/2026');
    expect([el.validity.valueMissing, el.validationMessage]).to.deep.equal([true, 'Vui lòng chọn ngày bắt đầu']);
    el.setAttribute('start', '01/10/2026');
    expect(el.validity.valid).to.equal(true);
    el.removeAttribute('start');
    el.setAttribute('required', 'end');
    expect(el.validity.valid, 'required=end: an empty start is fine').to.equal(true);
    el.removeAttribute('required');
    el.setAttribute('start', '31/02/2026');
    expect(el.validity.badInput).to.equal(true);
    expect(new FormData(form).get('r[start]')).to.equal('31/02/2026'); // raw, paired with badInput
    el.setAttribute('min', '01/10/2026');
    el.setAttribute('max', '31/10/2026');
    el.setAttribute('start', '30/09/2026');
    expect(el.validity.rangeUnderflow).to.equal(true);
    el.setAttribute('start', '01/10/2026');
    el.setAttribute('end', '01/11/2026');
    expect(el.validity.rangeOverflow).to.equal(true);
    el.setAttribute('end', '01/10/2026');
    expect(el.validity.valid, 'equal ends are allowed').to.equal(true);
    el.setAttribute('start', '02/10/2026');
    expect([el.validity.customError, el.validationMessage]).to.deep.equal([true, 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc']);
    expect(el.reportValidity()).to.equal(false);
    el.setCustomValidity('Lỗi site');
    el.setAttribute('start', '01/10/2026');
    expect([el.validity.customError, el.validationMessage]).to.deep.equal([true, 'Lỗi site']);
    el.setCustomValidity('');
    expect(el.validity.valid).to.equal(true);
  });

  it('TdFormValidation: required range invalid → error on the host; rules receive { start, end }', async () => {
    const el = mount('name="r" label="Khoảng" required', true);
    const form = el.closest('form');
    let seen = null;
    const res = TdFormValidation.validate(form);
    expect(res.valid).to.equal(false);
    expect(el.errorMessage).to.equal('Vui lòng chọn khoảng ngày');
    expect(el.querySelector('.td-dtr__trigger').getAttribute('aria-invalid')).to.equal('true');
    el.setValue({ start: '01/10/2026', end: '02/10/2026' });
    expect(TdFormValidation.validate(form, { rules: { r: (v) => { seen = v; return v.start && v.end ? '' : 'x'; } } }).valid).to.equal(true);
    expect(seen).to.deep.equal({ start: '01/10/2026', end: '02/10/2026' });
  });
});
