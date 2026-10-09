import { expect } from '@esm-bundle/chai';
import { setViewport, sendKeys } from '@web/test-runner-commands';
import { TdModal } from '../feedback/td-modal.js';
import { TdDatetimeRange } from './td-datetime-range.js';
import { TdDatetimePicker } from './td-datetime-picker.js';

// v0.61.0 (plan docs/internal/plans/v0.61.0-range-calendar.md, M1) — the calendar dialog of <td-datetime-range> in Chromium,
// Firefox AND WebKit: the Từ / Đến selection on one grid (cell roles, aria, preview, max-days dimming), the one dialog draft
// (B8: every transition), the endpoint switch (B9), out-of-bounds opening (B2), bounds changes while open (B7), destroy,
// label isolation (F6). Booleans in assertions (DOM nodes in a failing chai assertion hang the runner).
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
const day = (iso) => $(`.td-cal__day[data-date="${iso}"]`);
const tab = (k) => $(`.td-dtr-panel__tab[data-side="${k}"]`);
const tabs = () => $$('.td-dtr-panel__tab-value').map((t) => t.textContent);
const footer = (label) => $$('.td-modal__footer .td-btn').find((b) => b.textContent.trim() === label);
const roles = (from, to, month = '2026-10') => {
  const out = [];
  for (let n = from; n <= to; n++) out.push(day(`${month}-${String(n).padStart(2, '0')}`).getAttribute('data-range') || '');
  return out;
};
const NOW = new Date(2026, 9, 5, 9, 30);
const origNow = TdDatetimeRange.now;
const hover = (iso) => day(iso).dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
const wheelValue = (part) => Number($(`.td-dtp-wheel__list[data-part="${part}"] [aria-selected="true"]`).getAttribute('data-value'));

function mount(attrs = '') {
  host.insertAdjacentHTML('beforeend', `<td-datetime-range ${attrs}></td-datetime-range>`);
  return host.lastElementChild;
}
async function open(el) {
  el.querySelector('.td-dtr__trigger').click();
  expect(await until(() => openModal() && openModal().getAttribute('data-state') === 'open'), 'modal open').to.equal(true);
  await settle();
}

before(async () => { await setViewport({ width: 1280, height: 800 }); });
beforeEach(() => { TdDatetimeRange.now = () => new Date(NOW.getTime()); });
afterEach(async () => {
  TdModal.closeAll();
  await settle();
  host.innerHTML = '';
  document.querySelectorAll('body > .td-modal').forEach((m) => m.remove());
  TdDatetimeRange.now = origNow;
});

describe('v0.61.0 range calendar — date mode selection', () => {
  it('first click = Từ, second = Đến: roles on the cells, aria-selected on the endpoints only, one change on "Chọn"', async () => {
    const el = mount('name="r"');
    const events = [];
    el.addEventListener('change', (e) => events.push(e.detail));
    await open(el);
    day('2026-10-02').click();
    expect(tabs()).to.deep.equal(['02/10/2026', '—']);
    expect(tab('end').getAttribute('aria-pressed')).to.equal('true');
    day('2026-10-06').click();
    expect(roles(1, 7)).to.deep.equal(['', 'start', 'in', 'in', 'in', 'end', '']);
    expect([2, 3, 6].map((n) => day(`2026-10-0${n}`).getAttribute('aria-selected'))).to.deep.equal(['true', 'false', 'true']);
    expect(day('2026-10-03').getAttribute('aria-label')).to.match(/trong khoảng$/);
    expect(day('2026-10-02').getAttribute('aria-label')).to.match(/ngày bắt đầu$/);
    expect(day('2026-10-06').getAttribute('aria-label')).to.match(/ngày kết thúc$/);
    expect(tab('start').getAttribute('aria-pressed')).to.equal('true'); // the next click starts a new range
    expect($('.td-dtr-panel__status').textContent).to.equal('Đã chọn khoảng 02/10/2026 – 06/10/2026, 5 ngày.');
    expect(events.length, 'no change before "Chọn"').to.equal(0);
    footer('Chọn').click();
    expect(await until(() => !openModal())).to.equal(true);
    expect(events.length).to.equal(1);
    expect(events[0].value).to.deep.equal({ start: '02/10/2026', end: '06/10/2026' });
    expect(events[0].preset).to.equal(null);
  });

  it('the day grid is multiselectable (M0.4 outcome); the WAI-ARIA state of a dimmed day stays enabled', async () => {
    const el = mount('name="r" max-days="3"');
    await open(el);
    expect($('.td-cal__grid').getAttribute('aria-multiselectable')).to.equal('true');
    day('2026-10-02').click();
    expect(day('2026-10-09').hasAttribute('aria-disabled')).to.equal(false);
    expect(day('2026-10-09').getAttribute('aria-label')).to.contain('quá 3 ngày');
  });

  it('a one-day range (the same day twice) is "single"', async () => {
    const el = mount('name="r"');
    await open(el);
    day('2026-10-02').click();
    day('2026-10-02').click();
    expect(day('2026-10-02').getAttribute('data-range')).to.equal('single');
    expect(day('2026-10-02').getAttribute('aria-label')).to.match(/ngày bắt đầu và kết thúc$/);
    expect(tabs()).to.deep.equal(['02/10/2026', '02/10/2026']);
  });

  it('tab "Đến" first: an end-only range; "Chọn" commits it', async () => {
    const el = mount('name="r"');
    await open(el);
    tab('end').click();
    day('2026-10-07').click();
    expect(tabs()).to.deep.equal(['—', '07/10/2026']);
    expect(tab('end').getAttribute('aria-pressed')).to.equal('true');
    footer('Chọn').click();
    expect(await until(() => !openModal())).to.equal(true);
    expect(el.getValue()).to.deep.equal({ start: '', end: '07/10/2026' });
  });

  it('a complete range: tab "Đến" + a later day moves only the end; the next click on side Từ restarts', async () => {
    const el = mount('name="r" start="01/10/2026" end="03/10/2026"');
    await open(el);
    tab('end').click();
    day('2026-10-06').click();
    expect(tabs()).to.deep.equal(['01/10/2026', '06/10/2026']);
    day('2026-10-02').click(); // side Từ again → a NEW range
    expect(tabs()).to.deep.equal(['02/10/2026', '—']);
  });

  it('keyboard: arrows + Enter / Space pick; the focus preview shows start..focus and nothing beyond what activation makes', async () => {
    const el = mount('name="r" max-days="4"');
    await open(el);
    const active = () => document.activeElement;
    expect(active().getAttribute('data-date')).to.equal('2026-10-05');
    await sendKeys({ press: 'Enter' }); // start = 05/10, side end
    expect(tabs()).to.deep.equal(['05/10/2026', '—']);
    await sendKeys({ press: 'ArrowRight' });
    await sendKeys({ press: 'ArrowRight' });
    expect(active().getAttribute('data-date')).to.equal('2026-10-07');
    expect([6, 7].map((n) => day(`2026-10-0${n}`).getAttribute('data-preview') || '')).to.deep.equal(['in', 'end']);
    await sendKeys({ press: 'ArrowRight' });
    await sendKeys({ press: 'ArrowRight' }); // 09/10 is past the 4-day limit
    expect(active().getAttribute('data-date')).to.equal('2026-10-09');
    expect($$('.td-cal__day[data-preview]').length, 'no preview for what would restart').to.equal(0);
    await sendKeys({ press: 'ArrowLeft' }); // 08/10 = day 4
    await sendKeys({ press: 'Space' });
    expect(tabs()).to.deep.equal(['05/10/2026', '08/10/2026']);
  });

  it('mouse preview: hover start..d; none for an earlier or an over-limit day; it clears when the pointer leaves', async () => {
    const el = mount('name="r" max-days="5"');
    await open(el);
    day('2026-10-02').click();
    hover('2026-10-05');
    expect([3, 4, 5, 6].map((n) => day(`2026-10-0${n}`).getAttribute('data-preview') || '')).to.deep.equal(['in', 'in', 'end', '']);
    hover('2026-10-12'); // past the limit: activation restarts there
    expect($$('.td-cal__day[data-preview]').length).to.equal(0);
    hover('2026-10-01'); // earlier: restarts
    expect($$('.td-cal__day[data-preview]').length).to.equal(0);
    hover('2026-10-04');
    expect($$('.td-cal__day[data-preview]').length).to.equal(2);
    $('.td-cal__days').dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    expect($$('.td-cal__day[data-preview]').length).to.equal(0);
    hover('2026-10-04'); // a touch / pen pointer never previews
    day('2026-10-06').dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'touch' }));
    expect(day('2026-10-06').hasAttribute('data-preview')).to.equal(false);
  });

  it('max-days: the cell past the limit restarts the range (overLimit), with the note announced and visible', async () => {
    const el = mount('name="r" max-days="3"');
    await open(el);
    day('2026-10-02').click();
    expect($('.td-dtr-panel__status').textContent).to.equal('Đã chọn ngày bắt đầu 02/10/2026. Chọn ngày kết thúc. Tối đa 3 ngày.');
    day('2026-10-04').click(); // day 3: inside
    expect(tabs()).to.deep.equal(['02/10/2026', '04/10/2026']);
    day('2026-10-02').click();
    day('2026-10-10').click(); // over: a new range from 10/10
    expect(tabs()).to.deep.equal(['10/10/2026', '—']);
    expect($('.td-dtr-panel__status').textContent).to.equal('Bắt đầu khoảng mới từ 10/10/2026. Chọn ngày kết thúc. Tối đa 3 ngày.');
    expect($('.td-dtr-panel__hint').hidden).to.equal(false);
    expect(day('2026-10-14').hasAttribute('data-dimmed')).to.equal(true);
    expect(day('2026-10-12').hasAttribute('data-dimmed')).to.equal(false);
    tab('start').click(); // the escape hatch: side Từ → nothing is dimmed
    expect($$('.td-cal__day[data-dimmed]').length).to.equal(0);
    expect($('.td-dtr-panel__hint').hidden).to.equal(true);
  });

  it('no max-days: no cell is ever dimmed, however far the end', async () => {
    const el = mount('name="r"');
    await open(el);
    day('2026-10-02').click();
    expect($$('.td-cal__day[data-dimmed]').length).to.equal(0);
    expect($('.td-dtr-panel__hint').hidden).to.equal(true);
    day('2026-11-05').click(); // an outside-month day of the October grid: it navigates and is the end
    expect(tabs()).to.deep.equal(['02/10/2026', '05/11/2026']);
  });

  it('min / max: cells outside are aria-disabled and ignored; the other cells still work', async () => {
    const el = mount('name="r" min="2026-10-03" max="2026-10-20"');
    await open(el);
    day('2026-10-02').click();
    expect(tabs()).to.deep.equal(['—', '—']);
    day('2026-10-21').click();
    expect(tabs()).to.deep.equal(['—', '—']);
    day('2026-10-03').click();
    expect(tabs()).to.deep.equal(['03/10/2026', '—']);
  });
});

describe('v0.61.0 range calendar — the grid selection follows the active endpoint (Codex plan r3 #12)', () => {
  const selectedMonths = () => $$('.td-cal__cell[data-month][aria-selected="true"]').map((c) => c.getAttribute('data-month'));
  const selectedYears = () => $$('.td-cal__cell[data-year][aria-selected="true"]').map((c) => c.getAttribute('data-year'));
  const gridSelected = (el) => (el._grid.selected ? `${el._grid.selected.year}-${el._grid.selected.month}-${el._grid.selected.day}` : null);

  it('after a pick, an automatic end → start, a restart and a side tab, the month / year grids mark the ACTIVE endpoint (null while it is empty)', async () => {
    const el = mount('name="r" start="29/09/2026" end="05/11/2027"');
    await open(el);
    expect(gridSelected(el)).to.equal('2026-9-29'); // side Từ
    day('2026-10-05').click(); // a new range (start 05/10/2026), side → Đến: its end is empty → nothing selected (no stale 29/09)
    expect(gridSelected(el)).to.equal(null);
    $('.td-cal__title[data-pick="month"]').click();
    expect(selectedMonths()).to.deep.equal([]);
    $('.td-cal__title[data-pick="month"]').click(); // back
    day('2026-10-08').click(); // the end → the automatic side Từ: its date is the selection
    expect(gridSelected(el)).to.equal('2026-10-5');
    $('.td-cal__title[data-pick="month"]').click();
    expect(selectedMonths()).to.deep.equal(['10']);
    $('.td-cal__title[data-pick="month"]').click();
    $('.td-cal__title[data-pick="year"]').click();
    expect(selectedYears()).to.deep.equal(['2026']);
    $('.td-cal__title[data-pick="year"]').click();
    tab('end').click(); // a side switch reveals the end's date
    expect(gridSelected(el)).to.equal('2026-10-8');
    day('2026-10-03').click(); // earlier than Từ → restart (Từ 03/10, side Đến, empty)
    expect(gridSelected(el)).to.equal(null);
    day('2026-10-06').click(); // end → side Từ → 03/10
    expect(gridSelected(el)).to.equal('2026-10-3');
    tab('end').click();
    expect(gridSelected(el)).to.equal('2026-10-6');
  });

  it('the overLimit restart updates the selection too', async () => {
    const el = mount('name="r" max-days="2"');
    await open(el);
    day('2026-10-02').click();
    day('2026-10-20').click(); // over the limit: a new range from 20/10, side Đến (empty)
    expect(gridSelected(el)).to.equal(null);
    day('2026-10-21').click();
    expect(gridSelected(el)).to.equal('2026-10-20');
    $('.td-cal__title[data-pick="month"]').click();
    expect(selectedMonths()).to.deep.equal(['10']);
  });
});

describe('v0.61.0 range calendar — datetime: one draft, wheels per endpoint, silent sync (B8 / B9)', () => {
  it('a day pick edits the active endpoint\'s date and keeps its time; the wheels show that endpoint', async () => {
    const el = mount('name="r" mode="datetime" start="01/10/2026 - 08:00" end="05/10/2026 - 17:30"');
    await open(el);
    expect([wheelValue('hour'), wheelValue('minute')]).to.deep.equal([8, 0]);
    day('2026-10-03').click(); // side Từ stays (datetime: no alternation)
    expect(tabs()).to.deep.equal(['03/10/2026 - 08:00', '05/10/2026 - 17:30']);
    expect(tab('start').getAttribute('aria-pressed')).to.equal('true');
    tab('end').click();
    expect([wheelValue('hour'), wheelValue('minute')]).to.deep.equal([17, 30]);
    day('2026-10-09').click();
    expect(tabs()).to.deep.equal(['03/10/2026 - 08:00', '09/10/2026 - 17:30']);
  });

  it('a USER change of the wheel writes to the active endpoint only; switching sides never writes (silent)', async () => {
    const el = mount('name="r" mode="datetime" start="01/10/2026 - 08:00" end="05/10/2026 - 17:30" minute-step="15"');
    await open(el);
    $('.td-dtp-wheel__list[data-part="hour"]').focus();
    await sendKeys({ press: 'ArrowDown' }); // 09
    await settle();
    expect(tabs()).to.deep.equal(['01/10/2026 - 09:00', '05/10/2026 - 17:30']);
    tab('end').click();
    tab('start').click();
    tab('end').click();
    await settle();
    expect(tabs()).to.deep.equal(['01/10/2026 - 09:00', '05/10/2026 - 17:30']); // the sync wrote nothing
    expect([wheelValue('hour'), wheelValue('minute')]).to.deep.equal([17, 30]);
    $('.td-dtp-wheel__list[data-part="minute"]').focus();
    await sendKeys({ press: 'ArrowDown' });
    await settle();
    expect(tabs()).to.deep.equal(['01/10/2026 - 09:00', '05/10/2026 - 17:45']);
    footer('Chọn').click();
    expect(await until(() => !openModal())).to.equal(true);
    expect(el.getValue()).to.deep.equal({ start: '01/10/2026 - 09:00', end: '05/10/2026 - 17:45' });
  });

  it('an empty endpoint gets its default time (Từ 00:00, Đến the last slot) when a date is picked', async () => {
    const el = mount('name="r" mode="datetime" minute-step="15"');
    await open(el);
    day('2026-10-02').click();
    tab('end').click();
    day('2026-10-04').click();
    expect(tabs()).to.deep.equal(['02/10/2026 - 00:00', '04/10/2026 - 23:45']);
  });

  it('the endpoint switch reveals its date, focuses the calendar (grid) and commits nothing', async () => {
    const el = mount('name="r" mode="datetime" start="01/09/2026 - 08:00" end="05/11/2026 - 17:30"');
    let changes = 0;
    el.addEventListener('change', () => { changes++; });
    await open(el);
    tab('end').click();
    expect($('.td-cal__title[data-pick="month"]').textContent).to.equal('Tháng 11');
    expect(document.activeElement.classList.contains('td-cal__day')).to.equal(true);
    expect(document.activeElement.getAttribute('data-date')).to.equal('2026-11-05');
    tab('start').click();
    expect($('.td-cal__title[data-pick="month"]').textContent).to.equal('Tháng 9');
    expect(changes).to.equal(0);
  });

  it('an empty endpoint: the switch moves no month; the focus stays on the roving cell', async () => {
    const el = mount('name="r" mode="datetime" start="01/09/2026 - 08:00"');
    await open(el);
    tab('end').click();
    expect($('.td-cal__title[data-pick="month"]').textContent).to.equal('Tháng 9');
    expect(document.activeElement.classList.contains('td-cal__day')).to.equal(true);
  });

  it('"Xoá" resets the draft (dates, default times, side Từ); a preset sets dates + times and side Từ; the grid follows', async () => {
    const el = mount('name="r" mode="datetime" start="01/10/2026 - 08:00" end="05/10/2026 - 17:30"');
    await open(el);
    tab('end').click();
    footer('Xoá').click();
    expect(tabs()).to.deep.equal(['—', '—']);
    expect(tab('start').getAttribute('aria-pressed')).to.equal('true');
    expect([wheelValue('hour'), wheelValue('minute')]).to.deep.equal([0, 0]);
    expect($$('.td-cal__day[aria-selected="true"]').length).to.equal(0);
    $('.td-dtr-panel__preset[data-id="today"]').click();
    expect(tabs()).to.deep.equal(['05/10/2026 - 00:00', '05/10/2026 - 23:59']);
    expect(tab('start').getAttribute('aria-pressed')).to.equal('true');
    expect($('.td-dtr-panel__status').textContent).to.contain('Đã chọn Hôm nay');
  });

  it('the order / span errors stay for datetime (and name the endpoint with aria-describedby)', async () => {
    const el = mount('name="r" mode="datetime" start="01/10/2026 - 08:00" end="05/10/2026 - 17:30" max-days="3"');
    await open(el);
    expect($('.td-dtr-panel__error').textContent).to.equal('Khoảng tối đa 3 ngày');
    expect(tab('end').getAttribute('aria-describedby')).to.equal($('.td-dtr-panel__error').id);
    day('2026-10-03').click(); // Từ 03/10: 3 days → fine
    expect($('.td-dtr-panel__error').hidden).to.equal(true);
    day('2026-10-09').click(); // Từ after Đến: order
    expect($('.td-dtr-panel__error').textContent).to.equal('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc');
    expect($$('.td-cal__day[data-range="in"]').length, 'a reversed pair draws no band').to.equal(0);
  });
});

describe('v0.61.0 range calendar — out-of-bounds values and bounds changes while open (B2 / B7)', () => {
  it('a value outside min–max in ANOTHER month / year: the error shows, the focus is clamped, nothing is painted out of month', async () => {
    const el = mount('name="r" min="2026-10-01" max="2026-10-31" start="15/03/2019" end="20/03/2019"');
    await open(el);
    expect($('.td-dtr-panel__error').textContent).to.equal('Không được trước 01/10/2026');
    expect(tabs()).to.deep.equal(['15/03/2019', '20/03/2019']);
    const focus = $('.td-cal__day[tabindex="0"]').getAttribute('data-date');
    expect(focus >= '2026-10-01' && focus <= '2026-10-31', `focus ${focus} inside the bounds`).to.equal(true);
    expect($('.td-cal__title[data-pick="month"]').textContent).to.equal('Tháng 10');
    expect($$('.td-cal__day[data-range]').length, 'the 2019 endpoints are not in the rendered month').to.equal(0);
    footer('Chọn').click();
    await settle();
    expect(!!openModal(), 'refused').to.equal(true);
    expect(document.activeElement === tab('start')).to.equal(true);
    day('2026-10-02').click(); // a new range: both 2019 values are replaced (Từ 02/10, Đến empty), the error is gone
    expect($('.td-dtr-panel__error').hidden).to.equal(true);
    expect(tabs()).to.deep.equal(['02/10/2026', '—']);
    tab('end').click();
    footer('Chọn').click();
    expect(await until(() => !openModal())).to.equal(true);
    expect(el.getValue()).to.deep.equal({ start: '02/10/2026', end: '' });
  });

  it('a value after max in a later year: the focus is clamped DOWN to max', async () => {
    const el = mount('name="r" max="2026-10-10" start="02/01/2030"');
    await open(el);
    const focus = $('.td-cal__day[tabindex="0"]').getAttribute('data-date');
    expect(focus <= '2026-10-10', `focus ${focus}`).to.equal(true);
    expect($('.td-dtr-panel__error').textContent).to.equal('Không được sau 10/10/2026');
  });

  it('min / max / max-days changed while open: cells + flags follow, the draft is untouched', async () => {
    const el = mount('name="r"');
    await open(el);
    day('2026-10-02').click();
    expect($$('.td-cal__day[data-dimmed]').length).to.equal(0);
    el.setAttribute('max-days', '3');
    expect(day('2026-10-09').hasAttribute('data-dimmed')).to.equal(true);
    expect(day('2026-10-04').hasAttribute('data-dimmed')).to.equal(false);
    el.setAttribute('max', '2026-10-20');
    expect(day('2026-10-21').getAttribute('aria-disabled')).to.equal('true');
    expect(tabs()).to.deep.equal(['02/10/2026', '—']);
    el.removeAttribute('max-days');
    expect($$('.td-cal__day[data-dimmed]').length).to.equal(0);
    expect($('.td-dtr-panel__hint').hidden).to.equal(true);
  });
});

describe('v0.61.0 range calendar — lifecycle, labels, performance', () => {
  it('closing destroys the draft, the calendar and the wheels; a re-open starts fresh from the attributes', async () => {
    const el = mount('name="r" mode="datetime" start="01/10/2026 - 08:00"');
    await open(el);
    day('2026-10-09').click();
    expect(!!el._grid && !!el._draft && !!el._wheels).to.equal(true);
    footer('Đóng').click();
    expect(await until(() => !openModal())).to.equal(true);
    expect(el._grid === null && el._draft === null && el._wheels === null).to.equal(true);
    expect(el.getAttribute('start')).to.equal('01/10/2026 - 08:00'); // nothing was committed
    await settle();
    await open(el);
    expect(tabs()[0]).to.equal('01/10/2026 - 08:00');
  });

  it('Esc cancels: no change, the draft is gone', async () => {
    const el = mount('name="r"');
    let changes = 0;
    el.addEventListener('change', () => { changes++; });
    await open(el);
    day('2026-10-02').click();
    await sendKeys({ press: 'Escape' });
    expect(await until(() => !openModal())).to.equal(true);
    expect(changes).to.equal(0);
    expect(el.hasAttribute('start')).to.equal(false);
  });

  it('weekday labels are isolated between the picker and the range (fresh arrays), and the range uses its own', async () => {
    const R = TdDatetimeRange.labels;
    const P = TdDatetimePicker.labels;
    expect(R.weekdaysShort).to.not.equal(P.weekdaysShort);
    expect(R.weekdaysLong).to.not.equal(P.weekdaysLong);
    const r0 = R.weekdaysShort[0];
    const p0 = P.weekdaysShort[0];
    R.weekdaysShort[0] = 'RR';
    expect(P.weekdaysShort[0]).to.equal(p0);
    const el = mount('name="r"');
    await open(el);
    expect($('.td-cal__weekday').textContent).to.equal('RR');
    R.weekdaysShort[0] = r0;
    TdModal.closeAll();
    await settle();
    P.weekdaysLong[1] = 'PP';
    expect(R.weekdaysLong[1]).to.not.equal('PP');
    P.weekdaysLong[1] = 'Thứ Ba';
    // a bad shape falls back to fresh defaults (one warning) without touching the table
    const warns = [];
    const ow = console.warn;
    console.warn = (m) => warns.push(String(m));
    const saved = R.weekdaysLong;
    R.weekdaysLong = ['a'];
    try {
      await open(el);
      expect($('.td-cal__weekday').getAttribute('aria-label')).to.equal('Thứ Hai');
      expect(warns.length).to.equal(1);
    } finally {
      R.weekdaysLong = saved;
      console.warn = ow;
    }
  });

  it('performance: hovering every cell and changing the month create 0 ELEMENTS in the grid; the date dialog stays small', async () => {
    const el = mount('name="r" max-days="9"');
    await open(el);
    day('2026-10-02').click();
    const tbody = $('.td-cal__grid tbody');
    let added = 0;
    const mo = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) added += 1; });
    mo.observe(tbody, { childList: true, subtree: true });
    for (const c of $$('.td-cal__day[data-date]')) c.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    $('.td-cal__nav[data-dir="next"]').click();
    $('.td-cal__nav[data-dir="prev"]').click();
    await raf();
    mo.disconnect();
    expect(added).to.equal(0);
    const nodes = openModal().querySelectorAll('.td-dtr-panel *').length;
    expect(nodes <= 260, `dialog nodes ${nodes}`).to.equal(true);
  });
});
