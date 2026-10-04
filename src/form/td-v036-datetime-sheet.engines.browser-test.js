// v0.36.0 (plan docs/internal/plans/v0.36.0-polish.md QĐ 61) — td-datetime-picker sheet below 720 px in Chromium, Firefox
// AND WebKit: 3 visible wheel rows, the date legend that repeats a column label is visually hidden (still names the
// fieldset), the preview pill that repeats the value is not rendered → the sheet is ≤ 70 % of the viewport height at
// 360×780 and 390×844 (also with the 44 px coarse-pointer row). Columns keep their accessible names, the keyboard still
// changes values. ≥ 720 unchanged. Only real signals (data-state, getAnimations() finished, rAF) — no fixed sleeps.
// Booleans in assertions (DOM nodes in a failing chai assertion hang the runner).
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
const until = async (cond, n = 300) => { for (let i = 0; i < n && !cond(); i++) await raf(); return cond(); };
const openModal = () => [...document.querySelectorAll('.td-modal')].find((m) => m.getAttribute('data-state') !== 'closing') || null;
const $ = (sel) => openModal().querySelector(sel);
const rect = (el) => el.getBoundingClientRect();
const rendered = (el) => !!el && getComputedStyle(el).display !== 'none' && rect(el).width > 1 && rect(el).height > 1;
const wheel = (part) => $(`.td-dtp-wheel__list[data-part="${part}"]`);
const selectedValue = (list) => Number(list.querySelector('[aria-selected="true"]').getAttribute('data-value'));

async function openPicker(attrs = 'value="04/10/2026 - 23:58"') {
  host.insertAdjacentHTML('beforeend', `<td-datetime-picker label="Ngày đăng" ${attrs}></td-datetime-picker>`);
  const el = host.lastElementChild;
  el.querySelector('.td-dtp__trigger').click();
  expect(await until(() => openModal() && openModal().getAttribute('data-state') === 'open'), 'modal open').to.equal(true);
  await until(() => !el._intro); // opening wheel scroll finished (v0.21.0)
  await settle();
  return el;
}

afterEach(async () => {
  TdModal.closeAll();
  await settle();
  host.innerHTML = '';
  document.querySelectorAll('body > .td-modal').forEach((m) => m.remove());
  document.documentElement.style.removeProperty('--td-dtp-option-h');
});
after(async () => { await setViewport({ width: 800, height: 600 }); });

describe('v0.36.0 td-datetime-picker — compact sheet (QĐ 61)', () => {
  for (const [w, h] of [[360, 780], [390, 844]]) {
    for (const coarse of [false, true]) {
      it(`${w}×${h}${coarse ? ' (44 px rows)' : ''}: sheet ≤ 70 % of innerHeight, 3 wheel rows, no duplicated text`, async () => {
        await setViewport({ width: w, height: h });
        if (coarse) document.documentElement.style.setProperty('--td-dtp-option-h', '44px'); // = the coarse token
        await openPicker();
        const sheet = rect($('.td-modal__dialog'));
        expect(sheet.height <= 0.7 * innerHeight, `sheet ${sheet.height} ≤ 70 % of ${innerHeight}`).to.equal(true);
        expect(sheet.bottom <= innerHeight + 0.5, `sheet inside: bottom ${sheet.bottom}`).to.equal(true);
        const rowH = coarse ? 44 : 40;
        for (const part of ['hour', 'minute']) {
          const list = wheel(part);
          expect(Math.abs(list.clientHeight - 3 * rowH) <= 1, `${part} wheel ${list.clientHeight} = 3 × ${rowH}`).to.equal(true);
        }
        expect(rendered($('fieldset.td-dtp-panel__group > .td-dtp-panel__legend')), 'date legend visually hidden').to.equal(false);
        expect(rendered($('.td-dtp-panel__preview')), 'preview pill not rendered').to.equal(false);
        // the time legend ("Giờ") is not a duplicate of any visible label → stays
        expect(rendered($('[role="group"] > .td-dtp-panel__legend')), 'time legend visible').to.equal(true);
      });
    }
  }

  it('360×780: columns still named (labels visible, fieldset legend in the DOM, wheels aria-label)', async () => {
    await setViewport({ width: 360, height: 780 });
    await openPicker();
    const fs = $('fieldset.td-dtp-panel__group');
    const legend = fs.querySelector(':scope > legend');
    expect(!!legend && legend.textContent === 'Ngày', 'fieldset keeps its legend text').to.equal(true);
    for (const [part, name] of [['day', 'Ngày'], ['month', 'Tháng'], ['year', 'Năm']]) {
      const input = $(`.td-dtp-panel__input[data-part="${part}"]`);
      const lbl = input.labels && input.labels[0];
      expect(!!lbl && lbl.textContent === name, `${part} labelled "${name}"`).to.equal(true);
      expect(rendered(lbl), `${part} label visible`).to.equal(true);
    }
    expect(wheel('hour').getAttribute('aria-label')).to.equal('Giờ');
    expect(wheel('minute').getAttribute('aria-label')).to.equal('Phút');
    const group = $('[role="group"]');
    const time = document.getElementById(group.getAttribute('aria-labelledby'));
    expect(!!time && time.textContent === 'Giờ', 'time group named').to.equal(true);
  });

  it('360×780: the keyboard still changes values (wheels + date field), the band stays centred', async () => {
    await setViewport({ width: 360, height: 780 });
    const el = await openPicker('value="15/06/2026 - 18:45"');
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
    const day = $('.td-dtp-panel__input[data-part="day"]');
    day.focus();
    day.select();
    await sendKeys({ type: '20' });
    expect(el._pending.day, 'typed day').to.equal(20);
    // commit with the footer's primary action → one change, value reflects the keyboard edits
    const confirm = [...openModal().querySelectorAll('.td-modal__footer button')].find((b) => b.textContent.trim() === 'Chọn');
    confirm.click();
    expect(await until(() => el.value === '20/06/2026 - 19:44'), `value ${el.value}`).to.equal(true);
  });

  it('≥ 720 (1024×768): unchanged — 5 wheel rows, legend and preview visible', async () => {
    await setViewport({ width: 1024, height: 768 });
    await openPicker();
    expect(Math.abs(wheel('hour').clientHeight - 5 * 40) <= 1, `wheel ${wheel('hour').clientHeight}`).to.equal(true);
    expect(rendered($('fieldset.td-dtp-panel__group > .td-dtp-panel__legend')), 'date legend visible').to.equal(true);
    expect(rendered($('.td-dtp-panel__preview')), 'preview visible').to.equal(true);
    expect($('.td-dtp-panel__preview').textContent).to.equal('04/10/2026 - 23:58');
  });
});
