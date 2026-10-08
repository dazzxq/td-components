// v0.36.0 (plan docs/internal/plans/v0.36.0-polish.md QĐ 61) → v0.60.0 (plan v0.60.0-calendar-picker A5 / C6 / M0): the compact
// bottom sheet of td-datetime-picker below 720 px in Chromium, Firefox AND WebKit. The sheet holds the CALENDAR now (no number
// fields, no preview line): 3 visible wheel rows in datetime mode, the actions pinned at the bottom of the sheet (the modal
// body is the scroller), seven ≥ 44 px day cells from 320 px up on a coarse pointer (the sheet's side padding shrinks:
// 4 px at 320, 24 px from 360), nothing wider than the viewport. ≥ 720 the wheels keep 5 rows (popover).
// Only real signals (data-state, getAnimations() finished, rAF) — no fixed sleeps. Booleans in assertions.
import { expect } from '@esm-bundle/chai';
import { setViewport, sendKeys } from '@web/test-runner-commands';
import { TdModal } from '../feedback/td-modal.js';
import './td-datetime-picker.js';

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
const until = async (cond, n = 300) => { for (let i = 0; i < n && !cond(); i++) await raf(); return !!cond(); };
const openModal = () => [...document.querySelectorAll('.td-modal')].find((m) => m.getAttribute('data-state') !== 'closing') || null;
const pop = () => [...document.querySelectorAll('.td-dtp-pop')].find((p) => !p.closest('.td-modal[data-state="closing"]')) || null;
const $ = (sel) => pop().querySelector(sel);
const rect = (el) => el.getBoundingClientRect();
const wheel = (part) => $(`.td-dtp-wheel__list[data-part="${part}"]`);
const selectedValue = (list) => Number(list.querySelector('[aria-selected="true"]').getAttribute('data-value'));
const vp = async (w, h) => {
  await setViewport({ width: w, height: h });
  for (let i = 0; i < 120 && window.innerWidth !== w; i++) await raf();
  await raf();
};

async function openPicker(attrs = 'value="04/10/2026 - 23:58"') {
  host.insertAdjacentHTML('beforeend', `<td-datetime-picker label="Ngày đăng" ${attrs}></td-datetime-picker>`);
  const el = host.lastElementChild;
  el.querySelector('.td-dtp__trigger').click();
  expect(await until(() => openModal() && openModal().getAttribute('data-state') === 'open' && pop()), 'sheet open').to.equal(true);
  await settle();
  return el;
}

afterEach(async () => {
  TdModal.closeAll();
  await settle();
  host.innerHTML = '';
  document.querySelectorAll('body > .td-modal, body > .td-dtp-pop').forEach((m) => m.remove());
  document.documentElement.style.removeProperty('--td-dtp-option-h');
  document.documentElement.style.removeProperty('--td-cal-cell');
});
after(async () => { await setViewport({ width: 800, height: 600 }); });

describe('v0.60.0 td-datetime-picker — the calendar bottom sheet', () => {
  for (const [w, h] of [[360, 780], [390, 844]]) {
    for (const coarse of [false, true]) {
      it(`${w}×${h}${coarse ? ' (44 px cells + rows)' : ''}: datetime sheet inside the viewport, 3 wheel rows, actions in view, no horizontal overflow`, async () => {
        await vp(w, h);
        if (coarse) {
          document.documentElement.style.setProperty('--td-dtp-option-h', '44px'); // = the coarse tokens
          document.documentElement.style.setProperty('--td-cal-cell', '44px');
        }
        await openPicker();
        const sheet = rect(openModal().querySelector('.td-modal__dialog'));
        expect(sheet.bottom <= innerHeight + 0.5 && sheet.top >= -0.5, `sheet inside: ${sheet.top}…${sheet.bottom} of ${innerHeight}`).to.equal(true);
        expect(sheet.height <= 0.9 * innerHeight + 1, `sheet ${Math.round(sheet.height)} ≤ 90 % of ${innerHeight}`).to.equal(true);
        const rowH = coarse ? 44 : 40;
        for (const part of ['hour', 'minute']) {
          expect(Math.abs(wheel(part).clientHeight - 3 * rowH) <= 1, `${part} wheel ${wheel(part).clientHeight} = 3 × ${rowH}`).to.equal(true);
        }
        // the actions are pinned inside the sheet and visible
        const confirm = rect($('[data-action="confirm"]'));
        const body = rect(openModal().querySelector('.td-modal__body'));
        expect(confirm.bottom <= body.bottom + 0.5 && confirm.top >= body.top - 0.5, `"Chọn" ${confirm.top}…${confirm.bottom} in the body ${body.top}…${body.bottom}`).to.equal(true);
        expect(document.documentElement.scrollWidth <= innerWidth + 1, 'no horizontal page scroll').to.equal(true);
        expect(openModal().querySelector('.td-modal__body').scrollWidth <= openModal().querySelector('.td-modal__body').clientWidth + 1, 'no horizontal scroll in the sheet').to.equal(true);
      });
    }
  }

  it('date mode: the sheet is ≤ 70 % of the viewport at 360×780 and 390×844 (44 px cells)', async () => {
    for (const [w, h] of [[360, 780], [390, 844]]) {
      await vp(w, h);
      document.documentElement.style.setProperty('--td-cal-cell', '44px');
      await openPicker('mode="date" value="04/10/2026"');
      const sheet = rect(openModal().querySelector('.td-modal__dialog'));
      expect(sheet.height <= 0.7 * innerHeight + 0.5, `${w}×${h}: sheet ${Math.round(sheet.height)} ≤ 70 % of ${innerHeight}`).to.equal(true);
      TdModal.closeAll();
      await settle();
      host.innerHTML = '';
    }
  });

  for (const w of [320, 336, 360, 393]) {
    it(`${w} px wide, coarse: seven day cells are ≥ 43.5 px wide and tall (the sheet padding shrinks to fit)`, async () => {
      await vp(w, 760);
      document.documentElement.style.setProperty('--td-cal-cell', '44px');
      await openPicker('mode="date" value="04/10/2026"');
      const cells = [...pop().querySelectorAll('.td-cal__day[data-date]')].slice(0, 7);
      for (const c of cells) {
        const r = rect(c);
        expect(r.width >= 43.5 && r.height >= 43.5, `${w}: cell ${r.width.toFixed(1)}×${r.height.toFixed(1)}`).to.equal(true);
      }
      const grid = rect($('.td-cal__grid'));
      expect(grid.left >= -0.5 && grid.right <= innerWidth + 0.5, `grid ${grid.left}…${grid.right} in ${innerWidth}`).to.equal(true);
    });
  }

  it('360×780: the dialog and the columns keep their names (Giờ / Phút listboxes, the time group, the weekday heads)', async () => {
    await vp(360, 780);
    await openPicker();
    expect(wheel('hour').getAttribute('aria-label')).to.equal('Giờ');
    expect(wheel('minute').getAttribute('aria-label')).to.equal('Phút');
    const group = $('[role="group"]');
    const time = document.getElementById(group.getAttribute('aria-labelledby'));
    expect(!!time && time.textContent === 'Giờ', 'time group named').to.equal(true);
    expect([...pop().querySelectorAll('thead th')].map((t) => t.getAttribute('aria-label'))[0]).to.equal('Thứ Hai');
    expect(openModal().querySelector('.td-modal__title').textContent).to.equal('Chọn ngày giờ');
    expect(pop().querySelector('.td-dtp-panel__input, .td-dtp-panel__preview') === null, 'no number fields / preview').to.equal(true);
  });

  it('360×780: the keyboard still changes values (wheels + a day), the band stays centred; "Chọn" commits one change', async () => {
    await vp(360, 780);
    const el = await openPicker('value="15/06/2026 - 18:45"');
    let changes = 0;
    el.addEventListener('change', () => { changes += 1; });
    const hour = wheel('hour');
    hour.focus();
    await sendKeys({ press: 'ArrowDown' });
    expect(await until(() => selectedValue(hour) === 19), 'ArrowDown → 19').to.equal(true);
    const opt = hour.querySelector('[aria-selected="true"]');
    expect(hour.getAttribute('aria-activedescendant') === opt.id, 'activedescendant in sync').to.equal(true);
    await until(() => Math.abs(opt.offsetTop + opt.offsetHeight / 2 - hour.scrollTop - hour.clientHeight / 2) < 2);
    expect(Math.abs(opt.offsetTop + opt.offsetHeight / 2 - hour.scrollTop - hour.clientHeight / 2) < 2, 'centred').to.equal(true);
    const minute = wheel('minute');
    minute.focus();
    await sendKeys({ press: 'ArrowUp' });
    expect(await until(() => selectedValue(minute) === 44), 'ArrowUp → 44').to.equal(true);
    $('.td-cal__day[data-date="2026-06-20"]').click();
    expect(changes, 'a day does not commit in datetime mode').to.equal(0);
    $('[data-action="confirm"]').click();
    expect(await until(() => el.value === '20/06/2026 - 19:44'), `value ${el.value}`).to.equal(true);
    expect(changes).to.equal(1);
  });

  it('≥ 720 (1024×768): the popover keeps 5 wheel rows', async () => {
    await vp(1024, 768);
    host.insertAdjacentHTML('beforeend', '<td-datetime-picker label="Ngày đăng" value="04/10/2026 - 23:58"></td-datetime-picker>');
    host.lastElementChild.querySelector('.td-dtp__trigger').click();
    expect(await until(() => pop()), 'popover open').to.equal(true);
    await settle();
    expect(openModal() === null, 'no sheet at ≥ 720').to.equal(true);
    expect(Math.abs(wheel('hour').clientHeight - 5 * 40) <= 1, `wheel ${wheel('hour').clientHeight}`).to.equal(true);
  });
});
