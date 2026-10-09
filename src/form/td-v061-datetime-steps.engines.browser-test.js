import { expect } from '@esm-bundle/chai';
import { setViewport, sendKeys } from '@web/test-runner-commands';
import { TdModal } from '../feedback/td-modal.js';
import { TdDatetimeRange } from './td-datetime-range.js';
import { TdDatetimePicker } from './td-datetime-picker.js';

// v0.61.0 (plan docs/internal/plans/v0.61.0-range-calendar.md, "Bổ sung owner 2026-10-09: datetime 2 màn", M1b) — the datetime
// dialogs are TWO screens (date → time) in Chromium, Firefox AND WebKit: <td-datetime-picker mode="datetime"> (popover ≥ 720,
// sheet < 720) and <td-datetime-range mode="datetime">. The transition tables, the confirmation rule ("Chọn" only on the time
// screen; the one exception: a completely empty range draft), TimeStep.show() (every route centres both wheels, focus policy),
// "Bây giờ" out of bounds → back, the footer integration (data-action nodes), one layout scroller. Booleans in assertions.
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
const NOW = new Date(2026, 9, 5, 9, 30);
const origNow = TdDatetimeRange.now;

const livePop = () => [...document.querySelectorAll('.td-dtp-pop')].find((p) => !p.closest('.td-modal[data-state="closing"]')) || null;
const openModal = () => [...document.querySelectorAll('.td-modal')].find((m) => m.getAttribute('data-state') !== 'closing') || null;
const root = () => livePop() || openModal();
const $ = (sel) => root().querySelector(sel);
/** an action button: the popover row OR the sheet / dialog footer (same `data-action`, plan "Tích hợp chân TdModal") */
const act = (name) => {
  const m = openModal();
  return (livePop() && livePop().querySelector(`[data-action="${name}"]`)) || (m && m.querySelector(`.td-modal__footer [data-action="${name}"]`)) || null;
};
const shown = (el) => !!el && !el.hidden && !el.closest('[hidden]') && el.getClientRects().length > 0;
const stepOf = () => (livePop() || openModal().querySelector('.td-dtr-panel')).getAttribute('data-step');
const day = (iso) => root().querySelector(`.td-cal__day[data-date="${iso}"]`);
const wheel = (part) => root().querySelector(`.td-dtp-wheel__list[data-part="${part}"]`);
const wheelValue = (part) => Number(wheel(part).querySelector('[aria-selected="true"]').getAttribute('data-value'));
const offCentre = (list) => {
  const o = list.querySelector('[aria-selected="true"]');
  return Math.abs(o.offsetTop + o.offsetHeight / 2 - list.scrollTop - list.clientHeight / 2);
};
const centred = () => offCentre(wheel('hour')) < 2 && offCentre(wheel('minute')) < 2;
const status = () => root().querySelector('[role="status"]').textContent;
const heading = () => root().querySelector('.td-time-step__heading').textContent;
const tab = (k) => openModal().querySelector(`.td-dtr-panel__tab[data-side="${k}"]`);
const tabs = () => [...openModal().querySelectorAll('.td-dtr-panel__tab-value')].map((t) => t.textContent);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function mountPicker(attrs = '') {
  host.insertAdjacentHTML('beforeend', `<td-datetime-picker name="p" mode="datetime" label="Hẹn" ${attrs}></td-datetime-picker>`);
  return host.lastElementChild;
}
function mountRange(attrs = '') {
  host.insertAdjacentHTML('beforeend', `<form><td-datetime-range name="r" mode="datetime" ${attrs}></td-datetime-range></form>`);
  return host.lastElementChild.querySelector('td-datetime-range');
}
async function openPicker(el) {
  el.querySelector('.td-dtp__trigger').click();
  expect(await until(() => livePop() && (livePop().closest('.td-modal') ? openModal().getAttribute('data-state') === 'open' : livePop().getAttribute('data-state') === 'open')), 'dialog open').to.equal(true);
  await settle();
}
async function openRange(el) {
  el.querySelector('.td-dtr__trigger').click();
  expect(await until(() => openModal() && openModal().getAttribute('data-state') === 'open'), 'modal open').to.equal(true);
  await settle();
}
const counter = (el) => {
  const c = { n: 0, last: null };
  el.addEventListener('change', (e) => { c.n++; c.last = e.detail; });
  return c;
};

before(async () => { await setViewport({ width: 1280, height: 800 }); });
beforeEach(() => { TdDatetimeRange.now = () => new Date(NOW.getTime()); });
afterEach(async () => {
  document.querySelectorAll('.td-dtp__trigger[aria-expanded="true"]').forEach((t) => t.click());
  TdModal.closeAll();
  await settle();
  host.innerHTML = '';
  document.querySelectorAll('body > .td-modal, body > .td-dtp-pop').forEach((m) => m.remove());
  TdDatetimeRange.now = origNow;
  await setViewport({ width: 1280, height: 800 });
});

for (const [shell, vw, vh] of [['popover', 1280, 800], ['sheet', 393, 852]]) {
  describe(`v0.61.0 picker datetime — two screens (${shell})`, () => {
    before(async () => { await setViewport({ width: vw, height: vh }); });

    it('opens on the DATE screen with the value\'s day focused; the time screen is hidden; only "Hôm nay" is offered', async () => {
      const el = mountPicker('value="15/10/2026 - 09:30"');
      await openPicker(el);
      expect(stepOf()).to.equal('date');
      expect(document.activeElement.getAttribute('data-date')).to.equal('2026-10-15');
      expect(shown($('.td-time-step'))).to.equal(false);
      expect(shown(act('today')) && !shown(act('now')) && !shown(act('confirm'))).to.equal(true);
      expect($('.td-time-step').hasAttribute('hidden')).to.equal(true);
    });

    for (const how of ['click', 'Enter', 'Space']) {
      it(`activating a day (${how}) goes to the TIME screen: no change, the hour wheel focused, heading + announcement, wheels centred`, async () => {
        const el = mountPicker('value="15/10/2026 - 09:30"');
        const c = counter(el);
        await openPicker(el);
        if (how === 'click') day('2026-10-16').click();
        else {
          await sendKeys({ press: 'ArrowRight' });
          await sendKeys({ press: how === 'Space' ? 'Space' : 'Enter' });
        }
        await settle();
        expect(stepOf()).to.equal('time');
        expect(c.n).to.equal(0);
        expect(shown($('.td-time-step')) && !shown($('.td-cal'))).to.equal(true);
        expect(document.activeElement === wheel('hour')).to.equal(true);
        expect(heading()).to.equal('Thứ Sáu, 16/10/2026');
        expect(status()).to.equal('Chọn giờ cho 16/10/2026');
        expect([wheelValue('hour'), wheelValue('minute')]).to.deep.equal([9, 30]);
        expect(centred()).to.equal(true);
        expect(!shown(act('today')) && shown(act('now')) && shown(act('confirm'))).to.equal(true);
      });
    }

    it('"Hôm nay" (date screen) picks today and goes to the time screen', async () => {
      const el = mountPicker('value="15/10/2026 - 09:30"');
      const c = counter(el);
      await openPicker(el);
      act('today').click();
      await settle();
      expect(stepOf()).to.equal('time');
      expect(c.n).to.equal(0);
      const t = new Date();
      expect(status()).to.equal(`Chọn giờ cho ${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${t.getFullYear()}`);
      expect(centred()).to.equal(true);
    });

    it('"‹" and Backspace return to the date screen: the day focused, nothing committed, the draft kept', async () => {
      const el = mountPicker('value="15/10/2026 - 09:30"');
      const c = counter(el);
      await openPicker(el);
      day('2026-10-16').click();
      await settle();
      $('.td-time-step [data-action="back"]').click();
      await settle();
      expect(stepOf()).to.equal('date');
      expect(document.activeElement.getAttribute('data-date')).to.equal('2026-10-16');
      expect(shown($('.td-cal')) && !shown($('.td-time-step'))).to.equal(true);
      day('2026-10-17').click();
      await settle();
      expect(document.activeElement === wheel('hour')).to.equal(true);
      await sendKeys({ press: 'Backspace' });
      await settle();
      expect(stepOf()).to.equal('date');
      expect(document.activeElement.getAttribute('data-date')).to.equal('2026-10-17');
      expect(c.n).to.equal(0);
      expect(el.getAttribute('value')).to.equal('15/10/2026 - 09:30');
    });

    it('wheels (keys) edit the time; "Chọn" (time screen only) commits ONE change and closes once', async () => {
      const el = mountPicker('value="15/10/2026 - 09:30" minute-step="15"');
      const c = counter(el);
      await openPicker(el);
      day('2026-10-16').click();
      await settle();
      await sendKeys({ press: 'ArrowDown' }); // hour 10
      await settle();
      wheel('minute').focus();
      await sendKeys({ press: 'ArrowDown' }); // minute 45
      await settle();
      let closed = 0;
      const mo = new MutationObserver(() => { if (!livePop()) closed++; });
      mo.observe(document.body, { childList: true, subtree: true });
      act('confirm').click();
      expect(await until(() => !livePop() && !openModal())).to.equal(true);
      mo.disconnect();
      expect(c.n).to.equal(1);
      expect(c.last.value).to.equal('16/10/2026 - 10:45');
      expect(el.getAttribute('value')).to.equal('16/10/2026 - 10:45');
      expect(closed <= 2).to.equal(true);
    });

    it('"Bây giờ" stays on the time screen, keeps the focus on itself, and changes date + time to now', async () => {
      const el = mountPicker('value="15/10/2026 - 09:30"');
      const c = counter(el);
      await openPicker(el);
      day('2026-10-16').click();
      await settle();
      act('now').focus();
      act('now').click();
      await settle();
      expect(stepOf()).to.equal('time');
      expect(document.activeElement === act('now')).to.equal(true);
      expect(c.n).to.equal(0);
      const t = new Date();
      expect(heading()).to.contain(`${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${t.getFullYear()}`);
      expect(wheelValue('hour')).to.equal(t.getHours());
      expect(centred()).to.equal(true);
    });

    it('"Bây giờ" outside min–max keeps the invalid draft + the error; "‹" lands on the nearest enabled day; "Chọn" is refused', async () => {
      const el = mountPicker('value="15/10/2026 - 09:30" min="2026-10-01" max="2026-10-20"');
      const c = counter(el);
      await openPicker(el);
      day('2026-10-16').click();
      await settle();
      act('now').click(); // the real now is after max (2026-10-20)? only when the machine date is — force with a past max below
      await settle();
      const err = () => root().querySelector('.td-dtp-pop__error');
      const t = new Date();
      const outside = iso(t) > '2026-10-20' || iso(t) < '2026-10-01';
      if (outside) {
        expect(err().hidden).to.equal(false);
        expect(err().getAttribute('role')).to.equal('alert');
        act('confirm').click();
        await settle();
        expect(!!livePop() || !!openModal(), 'refused: still open').to.equal(true);
        expect(c.n).to.equal(0);
        expect(stepOf()).to.equal('time');
        $('.td-time-step [data-action="back"]').click();
        await settle();
        expect(stepOf()).to.equal('date');
        expect(err().hidden, 'the error stays on the date screen').to.equal(false);
        const f = document.activeElement;
        expect(f.classList.contains('td-cal__day') && f.getAttribute('aria-disabled') !== 'true').to.equal(true);
        const fd = f.getAttribute('data-date');
        expect(fd >= '2026-10-01' && fd <= '2026-10-20', `focus ${fd} clamped into the bounds`).to.equal(true);
      }
    });

    it('Esc closes from either screen without a change', async () => {
      const el = mountPicker('value="15/10/2026 - 09:30"');
      const c = counter(el);
      await openPicker(el);
      await sendKeys({ press: 'Escape' });
      expect(await until(() => !livePop() && !openModal())).to.equal(true);
      await settle();
      await openPicker(el);
      day('2026-10-16').click();
      await settle();
      await sendKeys({ press: 'Escape' });
      expect(await until(() => !livePop() && !openModal())).to.equal(true);
      expect(c.n).to.equal(0);
      expect(el.getAttribute('value')).to.equal('15/10/2026 - 09:30');
    });

    it('every route into the time screen centres both wheels (offCentre < 2)', async () => {
      const el = mountPicker('value="15/10/2026 - 17:45"');
      await openPicker(el);
      const routes = [
        async () => { day('2026-10-16').click(); },
        async () => { day('2026-10-16').focus(); await sendKeys({ press: 'Enter' }); },
        async () => { act('today').click(); },
      ];
      for (const go of routes) {
        await go();
        await settle();
        expect(stepOf()).to.equal('time');
        expect(centred(), 'centred').to.equal(true);
        $('.td-time-step [data-action="back"]').click();
        await settle();
      }
      day('2026-10-16').click();
      await settle();
      act('now').click();
      await settle();
      expect(centred(), 'centred after "Bây giờ"').to.equal(true);
    });

    it('date mode is unchanged: a pick commits at once; the footer offers "Hôm nay" only', async () => {
      host.insertAdjacentHTML('beforeend', '<td-datetime-picker name="d" mode="date" label="Ngày" value="15/10/2026"></td-datetime-picker>');
      const el = host.lastElementChild;
      const c = counter(el);
      await openPicker(el);
      expect(shown(act('today')) && !act('confirm') && !act('now')).to.equal(true);
      day('2026-10-16').click();
      expect(await until(() => !livePop() && !openModal())).to.equal(true);
      expect(c.n).to.equal(1);
    });
  });
}

describe('v0.61.0 picker datetime — layout: ONE layout scroller, nothing scrolls (sheet)', () => {
  const scrollers = () => [...openModal().querySelectorAll('.td-modal__dialog *')].filter((e) => !e.classList.contains('td-dtp-wheel__list')
    && ['auto', 'scroll', 'overlay'].includes(getComputedStyle(e).overflowY));
  for (const [w, h] of [[320, 568], [390, 844]]) {
    it(`${w}×${h}: both screens — no nested layout scrollers, nothing scrolls, the actions are inside the viewport`, async () => {
      await setViewport({ width: w, height: h });
      const el = mountPicker('value="15/10/2026 - 09:30"');
      await openPicker(el);
      for (const step of ['date', 'time']) {
        if (step === 'time') { day('2026-10-16').click(); await settle(); }
        const sc = scrollers();
        for (const a of sc) for (const b of sc) if (a !== b) expect(a.contains(b), 'nested layout scrollers').to.equal(false);
        expect(sc.length <= 1, `scrollers ${sc.map((x) => x.className).join()}`).to.equal(true);
        for (const x of sc) expect(x.scrollHeight <= x.clientHeight + 1, `${step}: ${x.className} ${x.scrollHeight}/${x.clientHeight}`).to.equal(true);
        const b = act(step === 'date' ? 'today' : 'confirm').getBoundingClientRect();
        expect(b.top >= 0 && b.bottom <= innerHeight + 0.5, `${step}: action inside the viewport`).to.equal(true);
      }
    });
  }
});

describe('v0.61.0 range datetime — two screens per endpoint', () => {
  it('Từ: day → time → "Tiếp: Đến" → Đến day → time → "Chọn" = ONE change; "Chọn" only on the time screens', async () => {
    const el = mountRange('start="01/10/2026 - 08:00"');
    const c = counter(el);
    await openRange(el);
    expect(stepOf()).to.equal('date');
    expect(!shown(act('confirm')), '"Chọn" hidden on a non-empty date screen').to.equal(true);
    day('2026-10-02').click();
    await settle();
    expect(stepOf()).to.equal('time');
    expect(c.n).to.equal(0);
    expect(document.activeElement === wheel('hour')).to.equal(true);
    expect(centred()).to.equal(true);
    expect(shown(act('confirm'))).to.equal(true);
    expect(heading()).to.contain('Từ');
    act('next').click();
    await settle();
    expect(stepOf()).to.equal('date');
    expect(tab('end').getAttribute('aria-pressed')).to.equal('true');
    expect(shown(act('confirm'))).to.equal(false);
    // Đến is empty → the focus lands on the clamped day of Từ
    expect(document.activeElement.getAttribute('data-date')).to.equal('2026-10-02');
    day('2026-10-04').click();
    await settle();
    expect(stepOf()).to.equal('time');
    expect([wheelValue('hour'), wheelValue('minute')]).to.deep.equal([23, 59]);
    act('confirm').click();
    expect(await until(() => !openModal())).to.equal(true);
    expect(c.n).to.equal(1);
    expect(c.last.value).to.deep.equal({ start: '02/10/2026 - 08:00', end: '04/10/2026 - 23:59' });
  });

  it('"Tiếp: Đến" is not a time entry: it hides the time screen; Đến\'s own day gets the focus when it has one', async () => {
    const el = mountRange('start="01/10/2026 - 08:00" end="09/10/2026 - 17:30"');
    await openRange(el);
    day('2026-10-02').click();
    await settle();
    act('next').click();
    await settle();
    expect(stepOf()).to.equal('date');
    expect(shown($('.td-time-step'))).to.equal(false);
    expect(tab('end').getAttribute('aria-pressed')).to.equal('true');
    expect(document.activeElement.getAttribute('data-date')).to.equal('2026-10-09');
    expect(status()).to.equal('Đang sửa Đến');
  });

  it('the Từ | Đến tabs keep the screen kind when the target has a date, else open its date screen', async () => {
    const el = mountRange('start="01/10/2026 - 08:00" end="05/10/2026 - 17:30"');
    await openRange(el);
    day('2026-10-02').click();
    await settle();
    tab('end').click();
    await settle();
    expect(stepOf()).to.equal('time');
    expect([wheelValue('hour'), wheelValue('minute')]).to.deep.equal([17, 30]);
    expect(centred()).to.equal(true);
    tab('start').click();
    await settle();
    expect(stepOf()).to.equal('time');
    expect(wheelValue('hour')).to.equal(8);
    footerClear();
    await settle();
    day('2026-10-03').click();
    await settle();
    expect(stepOf()).to.equal('time');
    tab('end').click(); // Đến is empty → its date screen
    await settle();
    expect(stepOf()).to.equal('date');
  });

  it('a preset goes to the time screen of Từ; "Xoá" goes to the date screen where "Chọn" (empty draft) is shown', async () => {
    const el = mountRange('');
    await openRange(el);
    expect(shown(act('confirm')), 'empty draft: "Chọn" on the date screen').to.equal(true);
    openModal().querySelector('.td-dtr-panel__preset[data-id="today"]').click();
    await settle();
    expect(stepOf()).to.equal('time');
    expect(tab('start').getAttribute('aria-pressed')).to.equal('true');
    expect(centred()).to.equal(true);
    footerClear();
    await settle();
    expect(stepOf()).to.equal('date');
    expect(shown(act('confirm'))).to.equal(true);
    day('2026-10-05').click();
    await settle();
    expect(stepOf()).to.equal('time');
  });

  it('saved range → open → "Xoá" → "Chọn" on the date screen → empty: ONE change, FormData empty, attributes removed, closed once', async () => {
    const el = mountRange('start="01/10/2026 - 08:00" end="05/10/2026 - 17:30"');
    const c = counter(el);
    await openRange(el);
    footerClear();
    await settle();
    expect(stepOf()).to.equal('date');
    expect(shown(act('confirm'))).to.equal(true);
    act('confirm').click();
    expect(await until(() => !openModal())).to.equal(true);
    expect(c.n).to.equal(1);
    expect(c.last.value).to.deep.equal({ start: '', end: '' });
    expect(el.hasAttribute('start') || el.hasAttribute('end')).to.equal(false);
    const fd = new FormData(el.closest('form'));
    expect([fd.get('r[start]'), fd.get('r[end]')]).to.deep.equal(['', '']);
  });

  it('"Không hạn" (allow-open-end): empties the end and goes to the time screen of Từ where "Chọn" commits "… – Không hạn"', async () => {
    const el = mountRange('allow-open-end start="01/10/2026 - 08:00" end="05/10/2026 - 17:30"');
    const c = counter(el);
    await openRange(el);
    openModal().querySelector('.td-dtr-panel__open-end').click();
    await settle();
    expect(stepOf()).to.equal('time');
    expect(tab('start').getAttribute('aria-pressed')).to.equal('true');
    expect(tabs()[1]).to.equal('Không hạn');
    act('confirm').click();
    expect(await until(() => !openModal())).to.equal(true);
    expect(c.n).to.equal(1);
    expect(c.last.value.end).to.equal('');
    expect(el.querySelector('.td-dtr__value').textContent).to.equal('01/10/2026 - 08:00 – Không hạn');
  });

  it('a rejected "Chọn": a missing required end → _showSide(end, date, error) (date screen, Đến tab focused); same-day order → time screen, Đến tab focused; it stays open', async () => {
    const el = mountRange('required="end" start="01/10/2026 - 08:00"');
    const c = counter(el);
    await openRange(el);
    day('2026-10-01').click();
    await settle();
    act('confirm').click();
    await settle();
    expect(!!openModal() && c.n === 0).to.equal(true);
    expect(stepOf()).to.equal('date');
    expect(document.activeElement === tab('end')).to.equal(true);
    expect(openModal().querySelector('.td-dtr-panel__error').textContent).to.equal('Vui lòng chọn ngày kết thúc');
    // same-day order: Từ 01/10 08:00, Đến 01/10 07:00
    day('2026-10-01').click();
    await settle();
    expect(stepOf()).to.equal('time');
    wheel('hour').focus();
    for (let i = 0; i < 17; i++) await sendKeys({ press: 'ArrowUp' }); // 23:59 → 06:59 … until before 08:00
    await settle();
    tab('start').click();
    await settle();
    expect(stepOf()).to.equal('time');
    act('confirm').click();
    await settle();
    expect(!!openModal() && c.n === 0).to.equal(true);
    expect(stepOf()).to.equal('time');
    expect(document.activeElement === tab('end')).to.equal(true);
    expect(centred(), 'the wheels are centred on the error route').to.equal(true);
  });

  it('"Chọn" closes exactly once; Đóng / Esc close without a change', async () => {
    const el = mountRange('start="01/10/2026 - 08:00" end="05/10/2026 - 17:30"');
    const c = counter(el);
    await openRange(el);
    day('2026-10-02').click();
    await settle();
    let closes = 0;
    const orig = TdModal.requestClose;
    TdModal.requestClose = (...a) => { closes++; return orig.apply(TdModal, a); };
    try {
      act('confirm').click();
      expect(await until(() => !openModal())).to.equal(true);
    } finally {
      TdModal.requestClose = orig;
    }
    expect(closes).to.equal(1);
    expect(c.n).to.equal(1);
    await settle();
    await openRange(el);
    act('close').click();
    expect(await until(() => !openModal())).to.equal(true);
    expect(c.n).to.equal(1);
    await openRange(el);
    await sendKeys({ press: 'Escape' });
    expect(await until(() => !openModal())).to.equal(true);
    expect(c.n).to.equal(1);
  });

  it('"Bây giờ" (range): per endpoint, stays on the time screen with the focus on it; out of bounds keeps the error and "‹" lands on the clamped day', async () => {
    const el = mountRange('start="01/10/2026 - 08:00" end="05/10/2026 - 17:30" min="2026-10-01" max="2026-10-20"');
    await openRange(el);
    day('2026-10-02').click();
    await settle();
    const now = openModal().querySelector('.td-time-step [data-action="now"]');
    now.focus();
    now.click();
    await settle();
    expect(stepOf()).to.equal('time');
    expect(document.activeElement === now).to.equal(true);
    expect(centred()).to.equal(true);
    const t = new Date();
    if (iso(t) > '2026-10-20' || iso(t) < '2026-10-01') {
      expect(openModal().querySelector('.td-dtr-panel__error').hidden).to.equal(false);
      openModal().querySelector('.td-time-step [data-action="back"]').click();
      await settle();
      expect(stepOf()).to.equal('date');
      expect(openModal().querySelector('.td-dtr-panel__error').hidden).to.equal(false);
      const f = document.activeElement;
      expect(f.classList.contains('td-cal__day') && f.getAttribute('aria-disabled') !== 'true').to.equal(true);
    }
  });

  it('range footer nodes carry data-action (close / clear / confirm); date-mode range keeps "Chọn" always', async () => {
    host.insertAdjacentHTML('beforeend', '<td-datetime-range name="d" mode="date"></td-datetime-range>');
    const el = host.lastElementChild;
    await openRange(el);
    expect(!!act('close') && !!act('clear') && shown(act('confirm'))).to.equal(true);
    day('2026-10-02').click();
    expect(shown(act('confirm'))).to.equal(true);
  });
});

describe('v0.61.0 range datetime — layout (320×568, 390×844)', () => {
  const scrollers = () => [...openModal().querySelectorAll('.td-modal__dialog *')].filter((e) => !e.classList.contains('td-dtp-wheel__list')
    && ['auto', 'scroll', 'overlay'].includes(getComputedStyle(e).overflowY));
  for (const [w, h] of [[320, 568], [390, 844]]) {
    it(`${w}×${h}: at most ONE layout scroller (the body), never nested; the footer actions that are shown stay inside the viewport`, async () => {
      await setViewport({ width: w, height: h });
      const el = mountRange('allow-open-end start="01/10/2026 - 08:00" end="05/10/2026 - 17:30"');
      await openRange(el);
      for (const step of ['date', 'time']) {
        if (step === 'time') { day('2026-10-02').click(); await settle(); }
        const sc = scrollers();
        expect(sc.length <= 1, `${step}: scrollers ${sc.map((x) => x.className).join()}`).to.equal(true);
        const body = openModal().querySelector('.td-modal__body');
        for (const side of ['top', 'bottom']) {
          body.scrollTop = side === 'top' ? 0 : body.scrollHeight;
          await raf();
          for (const b of openModal().querySelectorAll('.td-modal__footer .td-btn')) {
            if (!shown(b)) continue;
            const r = b.getBoundingClientRect();
            expect(r.top >= 0 && r.bottom <= innerHeight + 0.5, `${step}/${side}: ${b.dataset.action} inside`).to.equal(true);
            if (b.dataset.action === 'confirm') expect(r.top >= body.getBoundingClientRect().bottom - 1, 'confirm does not overlay the body').to.equal(true);
          }
        }
      }
    });
  }
});

function footerClear() {
  const b = act('clear');
  b.click();
}
void TdDatetimePicker;
