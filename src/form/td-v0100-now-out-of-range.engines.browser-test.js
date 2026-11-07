import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';
import { TdModal } from '../feedback/td-modal.js';
import { TdDatetimeRange } from './td-datetime-range.js';
import { TdDatetimePicker } from './td-datetime-picker.js';

// v0.100.0 A (roadmap todo since v0.61): "Bây giờ" on the time screen when TODAY is outside min–max, in
// <td-datetime-picker mode="datetime"> and <td-datetime-range mode="datetime"> (both endpoints). Today < min and today > max.
// Contract: the draft takes the REAL now (not clamped), the out-of-range error shows right away (role=alert), "Chọn"
// is refused (dialog stays open, no `change`, value unchanged). The range clock is TdDatetimeRange.now (overridable); the
// picker reads the wall clock, so its bounds are built relative to the real today.
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
const origNow = TdDatetimeRange.now;

const livePop = () => [...document.querySelectorAll('.td-dtp-pop')].find((p) => !p.closest('.td-modal[data-state="closing"]')) || null;
const openModal = () => [...document.querySelectorAll('.td-modal')].find((m) => m.getAttribute('data-state') !== 'closing') || null;
const root = () => livePop() || openModal();
const act = (name) => {
  const m = openModal();
  return (livePop() && livePop().querySelector(`[data-action="${name}"]`)) || (m && m.querySelector(`[data-action="${name}"]`)) || null;
};
const day = (iso) => root().querySelector(`.td-cal__day[data-date="${iso}"]`);
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dmy = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12); return x; };
const counter = (el) => {
  const c = { n: 0 };
  el.addEventListener('change', () => { c.n++; });
  return c;
};
const wheelValue = (part) => Number(root().querySelector(`.td-dtp-wheel__list[data-part="${part}"] [aria-selected="true"]`).getAttribute('data-value'));

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

before(async () => { await setViewport({ width: 1280, height: 800 }); });
afterEach(async () => {
  document.querySelectorAll('.td-dtp__trigger[aria-expanded="true"]').forEach((t) => t.click());
  TdModal.closeAll();
  await settle();
  host.innerHTML = '';
  document.querySelectorAll('body > .td-modal, body > .td-dtp-pop').forEach((m) => m.remove());
  TdDatetimeRange.now = origNow;
});

describe('v0.100.0 picker "Bây giờ" when today is outside min–max', () => {
  const real = new Date();
  const cases = [
    ['today < min', addDays(real, 5), addDays(real, 20)],
    ['today > max', addDays(real, -20), addDays(real, -5)],
  ];
  for (const [name, min, max] of cases) {
    it(`${name}: the draft takes the real now, the error shows at once, "Chọn" is refused, no change`, async () => {
      const inside = addDays(min, 2);
      const value = `${dmy(inside)} - 09:30`;
      host.insertAdjacentHTML('beforeend', `<td-datetime-picker name="p" mode="datetime" label="Hẹn" value="${value}" min="${iso(min)}" max="${iso(max)}"></td-datetime-picker>`);
      const el = host.lastElementChild;
      const c = counter(el);
      await openPicker(el);
      day(iso(inside)).click();
      await settle();
      const err = () => root().querySelector('.td-dtp-pop__error');
      expect(err().hidden, 'no error before "Bây giờ"').to.equal(true);
      act('now').click();
      await settle();
      expect(err().hidden, 'error visible right after "Bây giờ"').to.equal(false);
      expect(err().getAttribute('role')).to.equal('alert');
      expect(err().textContent.length > 0).to.equal(true);
      // the draft is the REAL now (not clamped into the bounds)
      const t = new Date();
      expect(root().querySelector('.td-time-step__heading').textContent).to.contain(dmy(t));
      expect(wheelValue('hour')).to.equal(t.getHours());
      act('confirm').click();
      await settle();
      expect(!!livePop() || !!openModal(), 'refused: still open').to.equal(true);
      expect(c.n).to.equal(0);
      expect(el.getAttribute('value')).to.equal(value);
      expect(el.value).to.equal(value);
    });
  }
});

describe('v0.100.0 range "Bây giờ" when today is outside min–max', () => {
  const cases = [
    ['today < min', new Date(2026, 8, 15, 9, 30)],
    ['today > max', new Date(2026, 10, 8, 9, 30)],
  ];
  for (const side of ['start', 'end']) {
    for (const [name, NOW] of cases) {
      it(`${name} (${side}): the draft takes the real now, the error shows at once, "Chọn" is refused, no change`, async () => {
        TdDatetimeRange.now = () => new Date(NOW.getTime());
        const s = '01/10/2026 - 08:00';
        const e = '05/10/2026 - 17:30';
        host.insertAdjacentHTML('beforeend', `<form><td-datetime-range name="r" mode="datetime" start="${s}" end="${e}" min="2026-10-01" max="2026-10-20"></td-datetime-range></form>`);
        const el = host.querySelector('td-datetime-range');
        const c = counter(el);
        await openRange(el);
        const err = () => openModal().querySelector('.td-dtr-panel__error');
        if (side === 'end') {
          openModal().querySelector('.td-dtr-panel__tab[data-side="end"]').click();
          await settle();
        }
        day(side === 'start' ? '2026-10-02' : '2026-10-06').click();
        await settle();
        expect(err().hidden, 'no error before "Bây giờ"').to.equal(true);
        openModal().querySelector('.td-time-step [data-action="now"]').click();
        await settle();
        expect(err().hidden, 'error visible right after "Bây giờ"').to.equal(false);
        expect(err().textContent.length > 0).to.equal(true);
        expect(openModal().querySelector('.td-time-step__heading').textContent).to.contain(dmy(NOW));
        expect(wheelValue('hour')).to.equal(NOW.getHours());
        const confirm = act('confirm');
        if (confirm) confirm.click();
        await settle();
        expect(!!openModal(), 'refused: still open').to.equal(true);
        expect(c.n).to.equal(0);
        expect(el.getAttribute('start')).to.equal(s);
        expect(el.getAttribute('end')).to.equal(e);
      });
    }
  }
});
