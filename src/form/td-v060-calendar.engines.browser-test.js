import { expect } from '@esm-bundle/chai';
import { setViewport, sendKeys } from '@web/test-runner-commands';
import { TdModal } from '../feedback/td-modal.js';
import './td-datetime-picker.js';

// v0.60.0 (plan docs/internal/plans/v0.60.0-calendar-picker.md M1b — C2, C4, D1–D9, F2) — the calendar dialog of
// <td-datetime-picker> in Chromium, Firefox AND WebKit: shells (popover ≥ 720 / sheet < 720), what each activation commits,
// the view-transition table D2 (every row by click AND by Enter / Space), the APG keyboard of the day grid, bounds,
// clear-while-open, attributes changing while open. Booleans in assertions (DOM nodes in a failing chai assertion hang the
// runner). Selectors are the F2 contract: data-date / data-month / data-year / data-view / data-dir / data-pick.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(r));
/** set the viewport and wait until the page really has it (matchMedia is what the picker reads) */
const vp = async (size) => {
  await setViewport(size);
  for (let i = 0; i < 120 && window.innerWidth !== size.width; i++) await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => requestAnimationFrame(r));
};
const until = async (cond, n = 240) => { for (let i = 0; i < n && !cond(); i++) await raf(); return !!cond(); };
const settle = async () => { await raf(); await raf(); };
const host = document.createElement('div');
host.style.cssText = 'width: 480px; padding: 120px 0 0 40px;';
document.body.appendChild(host);

/** the live dialog (a sheet that is fading out after TdModal.closeAll is not it) */
const pop = () => [...document.querySelectorAll('.td-dtp-pop')].find((p) => !p.closest('.td-modal[data-state="closing"]')) || null;
const cal = () => (pop() ? pop().querySelector('.td-cal') : null);
const visible = (el) => !!el && !el.closest('[hidden]') && getComputedStyle(el).display !== 'none';
/** The visible match of `sel` inside the calendar (the three views share one container, hidden ones stay in the DOM). */
const q = (sel) => [...(cal() ? cal().querySelectorAll(sel) : [])].find(visible) || null;
const day = (iso) => q(`[data-date="${iso}"]`);
const view = () => (cal() ? cal().getAttribute('data-view') : null);
const live = () => (cal() ? cal().querySelector('[aria-live]').textContent : null);
const active = () => document.activeElement;
const iso = (y, m, d) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const today = () => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() + 1, day: n.getDate() }; };

let seq = 0;
function mount(attrs = '', wrap = (h) => h) {
  seq += 1;
  host.innerHTML = wrap(`<td-datetime-picker id="cal${seq}" name="d" label="Ngày" ${attrs}></td-datetime-picker>`);
  const el = host.querySelector('td-datetime-picker');
  const rec = { change: [], input: 0 };
  el.addEventListener('change', (e) => rec.change.push(e.detail));
  el.addEventListener('input', () => { rec.input += 1; });
  return { el, rec, trigger: el.querySelector('.td-dtp__trigger') };
}
async function open(attrs, wrap) {
  const m = mount(attrs, wrap);
  await settle();
  m.trigger.click();
  expect(await until(() => pop() && cal()), 'dialog open').to.equal(true);
  await settle();
  return m;
}
const closed = async () => { await settle(); return !pop() && !document.querySelector('.td-modal:not([data-state="closing"])'); };
/** activate `el` the way a user does: pointer click, Enter or Space on the focused element */
async function act(el, how) {
  if (how === 'click') { el.click(); } else {
    el.focus();
    await sendKeys({ press: how });
  }
  await settle();
}

beforeEach(async () => { await vp({ width: 1280, height: 800 }); });
afterEach(async () => {
  TdModal.closeAll();
  await settle();
  host.innerHTML = '';
  document.querySelectorAll('.td-dtp-pop, body > .td-modal').forEach((n) => n.remove());
});
after(async () => { await vp({ width: 800, height: 600 }); });

describe('v0.60.0 calendar — shells (A5)', () => {
  it('≥ 720: a popover dialog on <body>, no modal, the same tree; the page stays interactive (not inert)', async () => {
    const { trigger } = await open('mode="date" value="15/06/2026"');
    const p = pop();
    expect(p.parentElement === document.body).to.equal(true);
    expect(p.getAttribute('role')).to.equal('dialog');
    expect(p.hasAttribute('aria-modal')).to.equal(false);
    expect(!!document.querySelector('.td-modal')).to.equal(false);
    expect(trigger.getAttribute('aria-expanded')).to.equal('true');
    expect(trigger.getAttribute('aria-controls') === p.id && !!p.id).to.equal(true);
    expect(!!trigger.closest('[inert]')).to.equal(false);
    expect(getComputedStyle(p).position).to.equal('fixed');
    expect(p.getBoundingClientRect().width).to.be.greaterThan(250);
  });

  it('< 720: the bottom sheet (TdModal) holds the same calendar; its footer holds the action (v0.61.0: data-action nodes); X present', async () => {
    await vp({ width: 390, height: 844 });
    const { trigger } = await open('mode="date" value="15/06/2026"');
    const m = document.querySelector('.td-modal');
    expect(!!m && m.contains(pop()) && m.contains(cal())).to.equal(true);
    expect(pop().classList.contains('td-dtp-pop--sheet')).to.equal(true);
    expect(!!m.querySelector('.td-modal__close')).to.equal(true);
    const footer = m.querySelector('.td-modal__footer');
    expect(!!footer && !footer.hidden && [...footer.querySelectorAll('[data-action]')].map((b) => b.dataset.action).join()).to.equal('today'); // 0.61.0: the action row is the TdModal footer
    expect(!pop().querySelector('.td-dtp-pop__actions')).to.equal(true);
    expect(trigger.getAttribute('aria-expanded')).to.equal('true');
  });

  it('a click on the sheet backdrop does not close it (ADR 0006); outside pointerdown does close the popover only', async () => {
    await vp({ width: 390, height: 844 });
    const a = await open('mode="date" value="15/06/2026"');
    document.querySelector('.td-modal__backdrop').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await settle();
    expect(!!pop()).to.equal(true);
    expect(a.rec.change.length).to.equal(0);
    TdModal.closeAll();
    await settle();
    await vp({ width: 1280, height: 800 });
    await open('mode="date" value="15/06/2026"');
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(await closed()).to.equal(true);
  });

  it('the dialog follows the host theme scope (data-td-theme) and is removed on close', async () => {
    await open('mode="date" value="15/06/2026"', (h) => `<div data-td-theme="dark">${h}</div>`);
    expect(pop().getAttribute('data-td-theme')).to.equal('dark');
    await sendKeys({ press: 'Escape' });
    expect(await closed()).to.equal(true);
  });
});

describe('v0.60.0 calendar — the day grid (D1, C2)', () => {
  it('opens on the committed month; Monday-first; weekday headers have full names; one selected cell, one tab stop', async () => {
    await open('mode="date" value="15/06/2026"');
    expect(view()).to.equal('days');
    const heads = [...cal().querySelectorAll('thead th')];
    expect(heads.length).to.equal(7);
    expect(heads.map((h) => h.textContent)).to.deep.equal(['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']);
    expect(heads[0].getAttribute('abbr')).to.equal('Thứ Hai');
    expect(heads[0].getAttribute('aria-label')).to.equal('Thứ Hai');
    expect(heads[6].getAttribute('abbr')).to.equal('Chủ Nhật');
    const cells = [...cal().querySelectorAll('tbody [data-date]')];
    expect(cells.length).to.equal(42);
    expect(cells[0].getAttribute('data-date')).to.equal('2026-06-01'); // 1 June 2026 is a Monday
    expect(cal().querySelector('table').getAttribute('role')).to.equal('grid');
    expect(cells.every((c) => c.getAttribute('role') === 'gridcell')).to.equal(true);
    expect(cells.filter((c) => c.getAttribute('aria-selected') === 'true').map((c) => c.getAttribute('data-date'))).to.deep.equal(['2026-06-15']);
    expect(cells.filter((c) => c.getAttribute('tabindex') === '0').map((c) => c.getAttribute('data-date'))).to.deep.equal(['2026-06-15']);
    expect(cells.filter((c) => c.hasAttribute('data-outside')).length).to.equal(12);
    expect(day('2026-06-15').getAttribute('aria-label')).to.equal('Thứ Hai, 15 tháng 6 năm 2026');
    expect(live()).to.equal('Tháng 6 năm 2026');
    expect(q('[data-pick="month"]').textContent).to.equal('Tháng 6');
    expect(q('[data-pick="year"]').textContent).to.equal('2026');
  });

  it('the focus starts on the active day', async () => {
    await open('mode="date" value="15/06/2026"');
    expect(active() === day('2026-06-15')).to.equal(true);
  });

  it('empty picker: opens on today; open-at wins; both clamp into min–max', async () => {
    const t = today();
    await open('mode="date"');
    expect(live()).to.match(new RegExp(`^Tháng ${t.month} năm ${t.year}$`));
    expect(cal().querySelector('[aria-current="date"]').getAttribute('data-date')).to.equal(iso(t.year, t.month, t.day));
    expect(cal().querySelectorAll('[aria-current="date"]').length).to.equal(1);
    expect(cal().querySelectorAll('[aria-selected="true"]').length).to.equal(0);
    TdModal.closeAll(); pop()?.remove(); host.innerHTML = '';
    await open('mode="date" open-at="2020-02-10"');
    expect(live()).to.equal('Tháng 2 năm 2020');
    host.innerHTML = ''; pop()?.remove();
    await open('mode="date" min="2030-05-01" max="2030-05-31"');
    expect(live()).to.equal('Tháng 5 năm 2030');
    expect(active() === day('2030-05-01')).to.equal(true);
  });

  it('days outside the month are shown, selectable, and move the view when chosen (datetime opens the time screen; going back shows the new month)', async () => {
    const { el, rec } = await open('mode="datetime" value="15/06/2026 - 10:30"');
    const out = day('2026-07-02');
    expect(out.hasAttribute('data-outside')).to.equal(true);
    out.click();
    await settle();
    expect(pop().getAttribute('data-step')).to.equal('time'); // v0.61.0: a day opens the time screen
    pop().querySelector('[data-action="back"]').click();
    await settle();
    expect(live()).to.equal('Tháng 7 năm 2026');
    expect(day('2026-07-02').getAttribute('aria-selected')).to.equal('true');
    expect(rec.change.length).to.equal(0);
    expect(el.getAttribute('value')).to.equal('15/06/2026 - 10:30');
  });

  it('‹ › move one month, keep the day (clamped to the month end), and do not take the focus', async () => {
    await open('mode="date" value="31/01/2026"');
    const next = q('[data-dir="next"]');
    next.focus();
    next.click();
    await settle();
    expect(live()).to.equal('Tháng 2 năm 2026');
    expect(active() === next).to.equal(true);
    expect(cal().querySelector('[tabindex="0"]').getAttribute('data-date')).to.equal('2026-02-28');
    q('[data-dir="prev"]').click();
    await settle();
    expect(live()).to.equal('Tháng 1 năm 2026');
    expect(cal().querySelector('[tabindex="0"]').getAttribute('data-date')).to.equal('2026-01-28');
  });

  it('the live region changes once per month / view change', async () => {
    await open('mode="date" value="15/06/2026"');
    const log = [];
    const node = cal().querySelector('[aria-live]');
    new MutationObserver(() => log.push(node.textContent)).observe(node, { childList: true, characterData: true, subtree: true });
    q('[data-dir="next"]').click();
    await settle();
    q('[data-dir="next"]').click();
    await settle();
    expect(log).to.deep.equal(['Tháng 7 năm 2026', 'Tháng 8 năm 2026']);
    expect(node.getAttribute('aria-live')).to.equal('polite');
  });
});

describe('v0.60.0 calendar — what commits (C4, D9)', () => {
  for (const how of ['click', 'Enter', 'Space']) {
    it(`date: a day (${how}) → value, ONE change, popover removed, focus on the trigger`, async () => {
      const { el, rec, trigger } = await open('mode="date" value="15/06/2026" clearable', (h) => `<form>${h}</form>`);
      await act(day('2026-06-20'), how);
      expect(await closed()).to.equal(true);
      expect(rec.change).to.deep.equal([{ value: '20/06/2026', dbValue: '2026-06-20' }]);
      expect(rec.input).to.equal(0);
      expect(el.getAttribute('value')).to.equal('20/06/2026');
      expect(el.querySelector('.td-dtp__value').textContent).to.equal('20/06/2026');
      expect(new FormData(el.closest('form')).get('d')).to.equal('2026-06-20');
      expect(active() === trigger).to.equal(true);
      expect(trigger.getAttribute('aria-expanded')).to.equal('false');
      expect(trigger.hasAttribute('aria-controls')).to.equal(false);
    });
  }

  it('date: the same day again closes without a change', async () => {
    const { rec, trigger } = await open('mode="date" value="15/06/2026"');
    day('2026-06-15').click();
    expect(await closed()).to.equal(true);
    expect(rec.change.length).to.equal(0);
    expect(active() === trigger).to.equal(true);
  });

  it('date: "Hôm nay" commits today (one change) — disabled when today is outside min–max', async () => {
    const t = today();
    const a = await open('mode="date" value="01/01/2000"');
    const btn = pop().querySelector('[data-action="today"]');
    expect(btn.textContent).to.equal('Hôm nay');
    btn.click();
    expect(await closed()).to.equal(true);
    expect(a.rec.change).to.deep.equal([{ value: `${String(t.day).padStart(2, '0')}/${String(t.month).padStart(2, '0')}/${t.year}`, dbValue: iso(t.year, t.month, t.day) }]);
    host.innerHTML = '';
    const b = await open('mode="date" value="01/01/2000" max="2001-01-01"');
    const off = pop().querySelector('[data-action="today"]');
    expect(off.getAttribute('aria-disabled')).to.equal('true');
    off.click();
    await settle();
    expect(!!pop() && b.rec.change.length === 0).to.equal(true);
  });

  it('date / month / year have no confirm / close footer; datetime: "Hôm nay" on the date screen, "Bây giờ" + "Chọn" on the time screen (0.61.0)', async () => {
    await open('mode="date" value="15/06/2026"');
    expect(pop().querySelector('[data-action="confirm"]')).to.equal(null);
    expect([...pop().querySelectorAll('.td-dtp-pop__actions button')].map((b) => b.textContent)).to.deep.equal(['Hôm nay']);
    host.innerHTML = ''; pop()?.remove();
    await open('mode="month" value="06/2026"');
    expect([...pop().querySelectorAll('.td-dtp-pop__actions button')].map((b) => b.textContent)).to.deep.equal(['Tháng này']);
    host.innerHTML = ''; pop()?.remove();
    await open('mode="year" value="2026"');
    expect([...pop().querySelectorAll('.td-dtp-pop__actions button')].map((b) => b.textContent)).to.deep.equal(['Năm nay']);
    host.innerHTML = ''; pop()?.remove();
    await open('mode="datetime" value="15/06/2026 - 10:30"');
    const shown = () => [...pop().querySelectorAll('.td-dtp-pop__actions button')].filter((b) => !b.hidden).map((b) => b.textContent);
    expect(shown()).to.deep.equal(['Hôm nay']);
    day('2026-06-15').click();
    await settle();
    expect(shown()).to.deep.equal(['Bây giờ', 'Chọn']);
  });

  it('datetime: a day changes the draft only; the wheels keep the time; "Chọn" commits ONE change', async () => {
    const { el, rec, trigger } = await open('mode="datetime" value="15/06/2026 - 10:30" minute-step="15"');
    day('2026-06-20').click();
    await settle();
    expect(rec.change.length).to.equal(0);
    expect(el.getAttribute('value')).to.equal('15/06/2026 - 10:30');
    const hour = pop().querySelector('.td-dtp-wheel__list[data-part="hour"]');
    const minute = pop().querySelector('.td-dtp-wheel__list[data-part="minute"]');
    expect(hour.querySelector('[aria-selected="true"]').getAttribute('data-value')).to.equal('10');
    expect(minute.querySelector('[aria-selected="true"]').getAttribute('data-value')).to.equal('30');
    minute.focus();
    await sendKeys({ press: 'ArrowDown' });
    expect(minute.querySelector('[aria-selected="true"]').getAttribute('data-value')).to.equal('45');
    pop().querySelector('[data-action="confirm"]').click();
    expect(await closed()).to.equal(true);
    expect(rec.change).to.deep.equal([{ value: '20/06/2026 - 10:45', dbValue: '2026-06-20 10:45:00' }]);
    expect(active() === trigger).to.equal(true);
  });

  it('datetime: "Bây giờ" updates the draft (date + time, minute snapped down) and does not commit', async () => {
    const { el, rec } = await open('mode="datetime" value="01/01/2001 - 00:00" minute-step="15"');
    pop().querySelector('[data-action="now"]').click();
    await settle();
    const t = today();
    expect(rec.change.length).to.equal(0);
    expect(el.getAttribute('value')).to.equal('01/01/2001 - 00:00');
    expect(cal().querySelector('[aria-selected="true"]').getAttribute('data-date')).to.equal(iso(t.year, t.month, t.day));
    const mv = Number(pop().querySelector('.td-dtp-wheel__list[data-part="minute"] [aria-selected="true"]').getAttribute('data-value'));
    expect(mv % 15).to.equal(0);
  });

  it('datetime: "Chọn" with the same draft still emits one change (v0.59 contract); a time outside min / max is refused and the dialog stays', async () => {
    const a = await open('mode="datetime" value="15/06/2026 - 10:30"');
    day('2026-06-15').click();
    await settle();
    pop().querySelector('[data-action="confirm"]').click();
    expect(await closed()).to.equal(true);
    expect(a.rec.change.length).to.equal(1);
    host.innerHTML = '';
    const b = await open('mode="datetime" value="15/06/2026 - 10:30" min="2026-06-15T10:07"');
    day('2026-06-15').click();
    await settle();
    const hour = pop().querySelector('.td-dtp-wheel__list[data-part="hour"]');
    hour.focus();
    await sendKeys({ press: 'ArrowUp' });
    await settle();
    const err = pop().querySelector('.td-dtp-pop__error');
    expect(err.hidden).to.equal(false);
    expect(err.textContent).to.equal('Không được trước 15/06/2026 - 10:07');
    pop().querySelector('[data-action="confirm"]').click();
    await settle();
    expect(!!pop() && b.rec.change.length === 0).to.equal(true);
    expect(active() === hour).to.equal(true);
  });

  it('Esc closes and discards a dirty datetime draft; focus returns to the trigger', async () => {
    const { el, rec, trigger } = await open('mode="datetime" value="15/06/2026 - 10:30"');
    day('2026-06-20').click();
    await sendKeys({ press: 'Escape' });
    expect(await closed()).to.equal(true);
    expect(rec.change.length).to.equal(0);
    expect(el.getAttribute('value')).to.equal('15/06/2026 - 10:30');
    expect(active() === trigger).to.equal(true);
  });

  it('month: opens on the months grid, a month commits at once; year: the years grid, a year commits at once', async () => {
    const a = await open('mode="month" value="06/2026"');
    expect(view()).to.equal('months');
    expect(live()).to.equal('Năm 2026');
    expect(active() === q('[data-month="6"]')).to.equal(true);
    expect(q('[data-month="6"]').getAttribute('aria-selected')).to.equal('true');
    q('[data-month="9"]').click();
    expect(await closed()).to.equal(true);
    expect(a.rec.change).to.deep.equal([{ value: '09/2026', dbValue: '2026-09' }]);
    host.innerHTML = '';
    const b = await open('mode="year" value="2026"');
    expect(view()).to.equal('years');
    expect(live()).to.equal('2017 – 2028');
    expect(q('[data-year="2026"]').getAttribute('aria-selected')).to.equal('true');
    q('[data-year="2020"]').click();
    expect(await closed()).to.equal(true);
    expect(b.rec.change).to.deep.equal([{ value: '2020', dbValue: '2020' }]);
  });

  it('the trigger: Enter / Space / ArrowDown open; a click on the trigger while open closes it (draft dropped, no change)', async () => {
    const { rec, trigger } = mount('mode="datetime" value="15/06/2026 - 10:30"');
    await settle();
    trigger.focus();
    await sendKeys({ press: 'ArrowDown' });
    expect(await until(() => !!pop())).to.equal(true);
    day('2026-06-20').click();
    trigger.click();
    expect(await closed()).to.equal(true);
    expect(rec.change.length).to.equal(0);
    expect(trigger.getAttribute('aria-expanded')).to.equal('false');
    expect(active() === trigger).to.equal(true);
    trigger.focus();
    await sendKeys({ press: 'Enter' });
    expect(await until(() => !!pop())).to.equal(true);
    expect(pop().querySelector('[aria-selected="true"]').getAttribute('data-date')).to.equal('2026-06-15'); // the dropped draft is gone
  });
});

describe('v0.60.0 calendar — clear while the popover is open (C4, Codex plan r3)', () => {
  it('date: the clear button → draft dropped, value cleared, EXACTLY one change, popover removed, focus on the trigger', async () => {
    const { el, rec, trigger } = await open('mode="date" value="15/06/2026" clearable', (h) => `<form>${h}</form>`);
    const order = [];
    el.addEventListener('change', () => order.push(`change:${document.activeElement === trigger ? 'trigger' : 'elsewhere'}`));
    trigger.addEventListener('focusin', () => order.push('trigger-focusin'));
    el.querySelector('.td-dtp__clear').click();
    expect(await closed()).to.equal(true);
    expect(rec.change).to.deep.equal([{ value: '', dbValue: '' }]);
    expect(el.hasAttribute('value')).to.equal(false);
    expect(new FormData(el.closest('form')).has('d')).to.equal(false);
    expect(active() === trigger).to.equal(true);
    expect(trigger.getAttribute('aria-expanded')).to.equal('false');
    expect(el.querySelector('.td-dtp__clear').hidden).to.equal(true);
    expect(order.indexOf('trigger-focusin')).to.be.greaterThan(order.findIndex((s) => s.startsWith('change:')), `no focus move before the change: ${order}`);
  });

  it('datetime with a DIRTY draft: the draft never reaches the value, the text or the event', async () => {
    const { el, rec } = await open('mode="datetime" value="15/06/2026 - 10:30" clearable');
    day('2026-06-20').click();
    pop().querySelector('.td-dtp-wheel__list[data-part="hour"]').focus();
    await sendKeys({ press: 'ArrowDown' });
    el.querySelector('.td-dtp__clear').click();
    expect(await closed()).to.equal(true);
    expect(rec.change).to.deep.equal([{ value: '', dbValue: '' }]);
    expect(el.hasAttribute('value')).to.equal(false);
    expect(el.querySelector('.td-dtp__value').hasAttribute('data-placeholder')).to.equal(true);
  });

  it('an empty value: the clear button is hidden; _clearByUser() only closes and focuses the trigger — no change', async () => {
    const { el, rec, trigger } = await open('mode="date" clearable');
    expect(el.querySelector('.td-dtp__clear').hidden).to.equal(true);
    day(iso(today().year, today().month, today().day)).focus();
    el._clearByUser();
    expect(await closed()).to.equal(true);
    expect(rec.change.length).to.equal(0);
    expect(active() === trigger).to.equal(true);
  });

  it('the sheet is modal: the clear button is inert and a click at its coordinates does nothing', async () => {
    await vp({ width: 390, height: 844 });
    const { el, rec } = await open('mode="date" value="15/06/2026" clearable');
    const btn = el.querySelector('.td-dtp__clear');
    expect(!!btn.closest('[inert]')).to.equal(true);
    const r = btn.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (hit) hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
    expect(rec.change.length).to.equal(0);
    expect(!!pop()).to.equal(true);
  });
});

describe('v0.60.0 calendar — view transitions (D2)', () => {
  const HOWS = ['click', 'Enter', 'Space'];

  for (const mode of ['date', 'datetime']) {
    const value = mode === 'date' ? '15/06/2026' : '15/06/2026 - 10:30';
    for (const how of HOWS) {
      describe(`${mode}, ${how}`, () => {
        it('days → [month button] → months; the active month cell has the focus; no change', async () => {
          const { rec } = await open(`mode="${mode}" value="${value}"`);
          await act(q('[data-pick="month"]'), how);
          expect(view()).to.equal('months');
          expect(q('[data-pick="month"]').getAttribute('aria-pressed')).to.equal('true');
          expect(live()).to.equal('Năm 2026');
          expect(active() === q('[data-month="6"]')).to.equal(true);
          expect(rec.change.length).to.equal(0);
          expect(!!pop()).to.equal(true);
        });

        it('days → [year button] → years (page 2017–2028); the active year has the focus; the year button is pressed', async () => {
          await open(`mode="${mode}" value="${value}"`);
          await act(q('[data-pick="year"]'), how);
          expect(view()).to.equal('years');
          expect(q('[data-pick="year"]').getAttribute('aria-pressed')).to.equal('true');
          expect(live()).to.equal('2017 – 2028');
          expect(active() === q('[data-year="2026"]')).to.equal(true);
        });

        it('months → choose a month → DAYS (not a commit): no change, still open, the day has the focus', async () => {
          const { rec } = await open(`mode="${mode}" value="${value}"`);
          await act(q('[data-pick="month"]'), 'click');
          await act(q('[data-month="3"]'), how);
          expect(view()).to.equal('days');
          expect(live()).to.equal('Tháng 3 năm 2026');
          expect(active() === day('2026-03-15')).to.equal(true);
          expect(rec.change.length).to.equal(0);
          expect(!!pop()).to.equal(true);
        });

        it('months → [month button, pressed] → back to days without choosing', async () => {
          await open(`mode="${mode}" value="${value}"`);
          await act(q('[data-pick="month"]'), 'click');
          await act(q('[data-pick="month"]'), how);
          expect(view()).to.equal('days');
          expect(live()).to.equal('Tháng 6 năm 2026');
          expect(active() === day('2026-06-15')).to.equal(true);
        });

        it('months → [year button] → years; choosing a year returns to MONTHS (the view that opened the year grid)', async () => {
          const { rec } = await open(`mode="${mode}" value="${value}"`);
          await act(q('[data-pick="month"]'), 'click');
          await act(q('[data-pick="year"]'), how);
          expect(view()).to.equal('years');
          await act(q('[data-year="2024"]'), how);
          expect(view()).to.equal('months');
          expect(live()).to.equal('Năm 2024');
          expect(active() === q('[data-month="6"]')).to.equal(true);
          expect(rec.change.length).to.equal(0);
        });

        it('days → years → choose a year returns to DAYS (same month, new year; no change, still open)', async () => {
          const { rec } = await open(`mode="${mode}" value="${value}"`);
          await act(q('[data-pick="year"]'), 'click');
          q('[data-dir="prev"]').click();
          q('[data-dir="prev"]').click();
          await settle();
          expect(live()).to.equal('1993 – 2004');
          await act(q('[data-year="1999"]'), how);
          expect(view()).to.equal('days');
          expect(live()).to.equal('Tháng 6 năm 1999');
          expect(active() === day('1999-06-15')).to.equal(true);
          expect(rec.change.length).to.equal(0);
          expect(!!pop()).to.equal(true);
        });

        it('years → [year button, pressed] → back to where the grid was opened, without choosing', async () => {
          await open(`mode="${mode}" value="${value}"`);
          await act(q('[data-pick="year"]'), 'click');
          await act(q('[data-pick="year"]'), how);
          expect(view()).to.equal('days');
          expect(live()).to.equal('Tháng 6 năm 2026');
        });

        it('Esc closes the whole dialog from every view — no change, focus on the trigger', async () => {
          for (const prepare of [async () => {}, async () => act(q('[data-pick="month"]'), 'click'), async () => act(q('[data-pick="year"]'), 'click')]) {
            host.innerHTML = '';
            const m = await open(`mode="${mode}" value="${value}"`);
            await prepare();
            await sendKeys({ press: 'Escape' });
            expect(await closed()).to.equal(true);
            expect(m.rec.change.length).to.equal(0);
            expect(active() === m.trigger).to.equal(true);
          }
        });
      });
    }
  }

  for (const how of HOWS) {
    it(`date: days → choose a day (${how}) commits + closes (the only committing row)`, async () => {
      const { rec } = await open('mode="date" value="15/06/2026"');
      await act(day('2026-06-18'), how);
      expect(rec.change.length).to.equal(1);
      expect(!!pop()).to.equal(false);
    });

    it(`datetime: choose a day (${how}) → the time screen: no change, still open, the hour wheel has the focus`, async () => {
      const { rec } = await open('mode="datetime" value="15/06/2026 - 10:30"');
      await act(day('2026-06-18'), how);
      await settle();
      expect(rec.change.length).to.equal(0);
      expect(!!pop()).to.equal(true);
      expect(pop().getAttribute('data-step')).to.equal('time'); // v0.61.0: the day opens the time screen (no commit)
      expect(active() === pop().querySelector('.td-dtp-wheel__list[data-part="hour"]')).to.equal(true);
      expect(pop().querySelector('.td-cal__day[data-date="2026-06-18"]').getAttribute('aria-selected')).to.equal('true');
    });

    it(`month mode: choose a month (${how}) commits; the year button → years → choose a year → back to MONTHS without a change`, async () => {
      const a = await open('mode="month" value="06/2026"');
      await act(q('[data-pick="year"]'), how);
      expect(view()).to.equal('years');
      await act(q('[data-year="2022"]'), how);
      expect(view()).to.equal('months');
      expect(live()).to.equal('Năm 2022');
      expect(active() === q('[data-month="6"]')).to.equal(true);
      expect(a.rec.change.length).to.equal(0);
      expect(q('[data-pick="month"]')).to.equal(null); // no month button in month mode
      await act(q('[data-month="11"]'), how);
      expect(await closed()).to.equal(true);
      expect(a.rec.change).to.deep.equal([{ value: '11/2022', dbValue: '2022-11' }]);
    });

    it(`year mode: choose a year (${how}) commits and closes`, async () => {
      const { rec } = await open('mode="year" value="2026"');
      await act(q('[data-year="2019"]'), how);
      expect(await closed()).to.equal(true);
      expect(rec.change).to.deep.equal([{ value: '2019', dbValue: '2019' }]);
    });
  }

  it('the dsuite recipe (plan F2): 15/03/1999 from a dialog opened at 10/2026, step by step', async () => {
    const { rec } = await open('mode="date" open-at="2026-10-09"');
    q('[data-pick="year"]').click();
    await settle();
    expect(view()).to.equal('years');
    expect(live()).to.equal('2017 – 2028');
    q('[data-dir="prev"]').click();
    q('[data-dir="prev"]').click();
    await settle();
    expect(live()).to.equal('1993 – 2004');
    q('[data-year="1999"]').click();
    await settle();
    expect(view()).to.equal('days');
    expect(live()).to.equal('Tháng 10 năm 1999');
    expect(q('[data-month="3"]')).to.equal(null); // the months grid is not showing (the common mistake)
    q('[data-pick="month"]').click();
    await settle();
    q('[data-month="3"]').click();
    await settle();
    expect(live()).to.equal('Tháng 3 năm 1999');
    expect(rec.change.length).to.equal(0);
    day('1999-03-15').click();
    expect(await closed()).to.equal(true);
    expect(rec.change).to.deep.equal([{ value: '15/03/1999', dbValue: '1999-03-15' }]);
  });
});

describe('v0.60.0 calendar — keyboard (APG date picker dialog, D3 / D4)', () => {
  const focusIs = (iso8) => active() === day(iso8);

  it('arrows ±1 day / ±1 week (across the month edge)', async () => {
    await open('mode="date" value="30/06/2026"');
    await sendKeys({ press: 'ArrowRight' });
    expect(focusIs('2026-07-01') && live() === 'Tháng 7 năm 2026').to.equal(true);
    await sendKeys({ press: 'ArrowLeft' });
    expect(focusIs('2026-06-30')).to.equal(true);
    await sendKeys({ press: 'ArrowDown' });
    expect(focusIs('2026-07-07')).to.equal(true);
    await sendKeys({ press: 'ArrowUp' });
    expect(focusIs('2026-06-30')).to.equal(true);
  });

  it('Home / End = Monday / Sunday of the week', async () => {
    await open('mode="date" value="17/06/2026"'); // a Wednesday
    await sendKeys({ press: 'Home' });
    expect(focusIs('2026-06-15')).to.equal(true);
    await sendKeys({ press: 'End' });
    expect(focusIs('2026-06-21')).to.equal(true);
  });

  it('PageUp / PageDown = ±1 month (day clamped), Shift+PageUp / PageDown = ±1 year (29/02 → 28/02)', async () => {
    await open('mode="date" value="31/01/2026"');
    await sendKeys({ press: 'PageDown' });
    expect(focusIs('2026-02-28')).to.equal(true);
    await sendKeys({ press: 'PageUp' });
    expect(focusIs('2026-01-28')).to.equal(true);
    host.innerHTML = ''; pop()?.remove();
    await open('mode="date" value="29/02/2024"');
    await sendKeys({ press: 'Shift+PageDown' });
    expect(focusIs('2025-02-28')).to.equal(true);
    await sendKeys({ press: 'Shift+PageUp' });
    expect(focusIs('2024-02-28')).to.equal(true);
  });

  it('Enter / Space select the focused day; there is ONE tab stop (the active day); roving follows the focus', async () => {
    const { rec } = await open('mode="datetime" value="15/06/2026 - 10:30"');
    await sendKeys({ press: 'ArrowRight' });
    expect(cal().querySelectorAll('tbody [tabindex="0"]').length).to.equal(1);
    expect(day('2026-06-16').getAttribute('tabindex')).to.equal('0');
    expect(day('2026-06-15').getAttribute('tabindex')).to.equal('-1');
    await sendKeys({ press: 'Enter' });
    await settle();
    expect(pop().getAttribute('data-step')).to.equal('time'); // v0.61.0
    await sendKeys({ press: 'Backspace' }); // back to the date screen, the day has the focus
    await settle();
    expect(day('2026-06-16').getAttribute('aria-selected')).to.equal('true');
    expect(active() === day('2026-06-16')).to.equal(true);
    await sendKeys({ press: 'ArrowRight' });
    await sendKeys({ press: 'Space' });
    await settle();
    await sendKeys({ press: 'Backspace' });
    await settle();
    expect(day('2026-06-17').getAttribute('aria-selected')).to.equal('true');
    expect(rec.change.length).to.equal(0);
  });

  it('a navigation key never scrolls the page', async () => {
    await open('mode="date" value="15/06/2026"');
    const y = window.scrollY;
    for (const k of ['ArrowDown', 'PageDown', 'End', 'Home', 'PageUp']) await sendKeys({ press: k });
    expect(window.scrollY).to.equal(y);
  });

  it('months grid: ← → ±1, ↑ ↓ ±3, Home / End = row ends, PageUp / PageDown = ±1 year', async () => {
    await open('mode="month" value="06/2026"');
    await sendKeys({ press: 'ArrowRight' });
    expect(active() === q('[data-month="7"]')).to.equal(true);
    await sendKeys({ press: 'ArrowDown' });
    expect(active() === q('[data-month="10"]')).to.equal(true);
    await sendKeys({ press: 'ArrowUp' });
    await sendKeys({ press: 'ArrowUp' });
    expect(active() === q('[data-month="4"]')).to.equal(true);
    await sendKeys({ press: 'Home' });
    expect(active() === q('[data-month="4"]')).to.equal(true);
    await sendKeys({ press: 'End' });
    expect(active() === q('[data-month="6"]')).to.equal(true);
    await sendKeys({ press: 'PageDown' });
    expect(live() === 'Năm 2027' && active() === q('[data-month="6"]')).to.equal(true);
    await sendKeys({ press: 'PageUp' });
    expect(live()).to.equal('Năm 2026');
    await sendKeys({ press: 'ArrowLeft' });
    await sendKeys({ press: 'ArrowLeft' });
    await sendKeys({ press: 'ArrowLeft' });
    await sendKeys({ press: 'ArrowLeft' });
    await sendKeys({ press: 'ArrowLeft' });
    await sendKeys({ press: 'ArrowLeft' });
    expect(live() === 'Năm 2025' && active() === q('[data-month="12"]')).to.equal(true);
  });

  it('years grid: ← → ±1, ↑ ↓ ±3, PageUp / PageDown ±12, Shift+PageUp / PageDown ±120', async () => {
    await open('mode="year" value="2026"');
    await sendKeys({ press: 'ArrowRight' });
    expect(active() === q('[data-year="2027"]')).to.equal(true);
    await sendKeys({ press: 'ArrowDown' });
    expect(active() === q('[data-year="2030"]')).to.equal(true);
    expect(live()).to.equal('2029 – 2040');
    await sendKeys({ press: 'PageUp' });
    expect(active() === q('[data-year="2018"]')).to.equal(true);
    await sendKeys({ press: 'Shift+PageDown' });
    expect(active() === q('[data-year="2138"]')).to.equal(true);
    await sendKeys({ press: 'Shift+PageUp' });
    expect(active() === q('[data-year="2018"]')).to.equal(true);
  });

  it('Tab leaves the grid (one stop) and cycles inside the dialog; Esc closes', async () => {
    const { trigger } = await open('mode="date" value="15/06/2026"');
    const seen = new Set();
    for (let i = 0; i < 14; i++) {
      await sendKeys({ press: 'Tab' });
      expect(pop().contains(active()), `Tab ${i} stays in the dialog`).to.equal(true);
      seen.add(active().getAttribute('data-date') || active().getAttribute('data-dir') || active().getAttribute('data-pick') || active().getAttribute('data-action'));
    }
    expect(seen.has('prev') && seen.has('next') && seen.has('today')).to.equal(true);
    expect([...seen].filter((s) => /^\d{4}-/.test(s || '')).length).to.equal(1); // the grid is a single stop
    await sendKeys({ press: 'Escape' });
    expect(await closed()).to.equal(true);
    expect(active() === trigger).to.equal(true);
  });
});

describe('v0.60.0 calendar — bounds and the year domain (D6, B1)', () => {
  it('days outside min–max are aria-disabled, inert to a click, skipped by the keyboard (stops at the bound)', async () => {
    const { rec } = await open('mode="date" value="15/06/2026" min="2026-06-10" max="2026-06-20"');
    expect(day('2026-06-09').getAttribute('aria-disabled')).to.equal('true');
    expect(day('2026-06-10').hasAttribute('aria-disabled')).to.equal(false);
    expect(day('2026-06-20').hasAttribute('aria-disabled')).to.equal(false);
    expect(day('2026-06-21').getAttribute('aria-disabled')).to.equal('true');
    day('2026-06-21').click();
    await settle();
    expect(!!pop() && rec.change.length === 0).to.equal(true);
    await sendKeys({ press: 'End' });
    await sendKeys({ press: 'ArrowRight' });
    expect(active() === day('2026-06-20')).to.equal(true);
    await sendKeys({ press: 'ArrowLeft' });
    await sendKeys({ press: 'Home' });
    expect(active() === day('2026-06-15')).to.equal(true);
    for (let i = 0; i < 6; i++) await sendKeys({ press: 'ArrowLeft' }); // 5 steps reach the bound, the 6th stops there
    expect(active() === day('2026-06-10')).to.equal(true);
    await sendKeys({ press: 'PageDown' });
    expect(active() === day('2026-06-20')).to.equal(true);
  });

  it('‹ › are aria-disabled (not disabled: the focus stays) when the neighbour month is out of range; months / years likewise', async () => {
    await open('mode="date" value="15/06/2026" min="2026-06-10" max="2026-06-20"');
    const prev = q('[data-dir="prev"]');
    const next = q('[data-dir="next"]');
    expect(prev.getAttribute('aria-disabled') === 'true' && next.getAttribute('aria-disabled') === 'true').to.equal(true);
    expect(prev.disabled || next.disabled).to.equal(false);
    prev.click();
    await settle();
    expect(live()).to.equal('Tháng 6 năm 2026');
    q('[data-pick="month"]').click();
    await settle();
    expect(q('[data-month="5"]').getAttribute('aria-disabled')).to.equal('true');
    expect(q('[data-month="6"]').hasAttribute('aria-disabled')).to.equal(false);
    q('[data-month="5"]').click();
    await settle();
    expect(view()).to.equal('months');
    q('[data-pick="year"]').click();
    await settle();
    expect(q('[data-year="2025"]').getAttribute('aria-disabled')).to.equal('true');
    expect(q('[data-year="2027"]').getAttribute('aria-disabled')).to.equal('true');
    expect(q('[data-year="2026"]').hasAttribute('aria-disabled')).to.equal(false);
  });

  it('no min / max: any year 1–9999 is reachable (1999 and 2150), 0001 and 9999 are the ends', async () => {
    const a = await open('mode="date" value="15/03/1999"');
    expect(live()).to.equal('Tháng 3 năm 1999');
    expect(a.el.checkValidity()).to.equal(true);
    host.innerHTML = ''; pop()?.remove();
    await open('mode="date" value="01/01/0001"');
    expect(live()).to.equal('Tháng 1 năm 1');
    expect(q('[data-dir="prev"]').getAttribute('aria-disabled')).to.equal('true');
    expect(day('0001-01-01').getAttribute('aria-selected')).to.equal('true');
    await sendKeys({ press: 'ArrowLeft' });
    expect(active() === day('0001-01-01')).to.equal(true);
    host.innerHTML = ''; pop()?.remove();
    await open('mode="date" value="31/12/9999"');
    expect(q('[data-dir="next"]').getAttribute('aria-disabled')).to.equal('true');
    await sendKeys({ press: 'ArrowRight' });
    await sendKeys({ press: 'ArrowDown' });
    expect(active() === day('9999-12-31')).to.equal(true);
    // 31/12/9999 is a Friday: the two cells after it (Sat, Sun) and the whole last row do not exist → no data-date
    expect(cal().querySelectorAll('tbody [data-date]').length).to.be.lessThan(42);
  });

  it('the last year page: 9997–9999 and empty cells', async () => {
    await open('mode="year" value="9999"');
    expect(live()).to.equal('9997 – 9999');
    expect(q('[data-year="9999"]').getAttribute('aria-selected')).to.equal('true');
    expect(q('[data-dir="next"]').getAttribute('aria-disabled')).to.equal('true');
    expect(cal().querySelectorAll('.td-cal__cells[data-kind="years"] [data-year]').length).to.equal(3); // nine empty cells carry no data-year
  });

  it('min / max changing while open re-evaluates the cells in place; a value outside the bounds is shown selected AND disabled', async () => {
    const { el } = await open('mode="date" value="15/06/2026"');
    const cell = day('2026-06-30');
    el.setAttribute('max', '2026-06-20');
    await settle();
    expect(day('2026-06-30') === cell).to.equal(true); // same node: updated in place
    expect(cell.getAttribute('aria-disabled')).to.equal('true');
    el.removeAttribute('max');
    await settle();
    expect(cell.hasAttribute('aria-disabled')).to.equal(false);
    el.setAttribute('min', '2026-06-20');
    await settle();
    expect(day('2026-06-15').getAttribute('aria-selected') === 'true' && day('2026-06-15').getAttribute('aria-disabled') === 'true').to.equal(true);
  });
});

describe('v0.60.0 calendar — dialog lifecycle', () => {
  it('mode / label / disabled changes close an open dialog (as before); removing the host removes the popover', async () => {
    const a = await open('mode="date" value="15/06/2026"');
    a.el.setAttribute('mode', 'month');
    expect(await closed()).to.equal(true);
    host.innerHTML = '';
    const b = await open('mode="date" value="15/06/2026"');
    b.el.setAttribute('disabled', '');
    expect(await closed()).to.equal(true);
    host.innerHTML = '';
    await open('mode="date" value="15/06/2026"');
    host.innerHTML = '';
    expect(await closed()).to.equal(true);
  });

  it('opening twice leaves exactly one dialog; a second picker opening closes the first popover', async () => {
    const a = await open('mode="date" value="15/06/2026"');
    a.trigger.click(); // toggles closed
    expect(await closed()).to.equal(true);
    a.trigger.click();
    expect(await until(() => !!pop())).to.equal(true);
    expect(document.querySelectorAll('.td-dtp-pop').length).to.equal(1);
  });

  it('each dialog has unique ids per open (labels / live region) and a name', async () => {
    await open('mode="date" value="15/06/2026"');
    const a = pop().getAttribute('aria-label') || pop().getAttribute('aria-labelledby');
    expect(!!a).to.equal(true);
    const ids = [...pop().querySelectorAll('[id]')].map((n) => n.id);
    expect(new Set(ids).size).to.equal(ids.length);
  });
});
