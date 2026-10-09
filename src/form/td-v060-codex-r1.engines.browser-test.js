import { expect } from '@esm-bundle/chai';
import { setViewport, sendKeys } from '@web/test-runner-commands';
import { TdModal } from '../feedback/td-modal.js';
import './td-datetime-picker.js';

// v0.60.0 full-branch Codex r1 (impl) — the regressions found after M6, written before the fixes:
//   #1 setBounds() keeps the DOM focus on a cell that is still enabled; #3 toggling the pressed title returns to the date the
//   returning view had when it was left (arrows / paging / ‹ › in the month / year grid only navigate), a cell ACTIVATION
//   keeps the navigated date; #4 "Bây giờ" puts the REAL now in the draft (only the navigation focus is clamped) and the range
//   error shows. Chromium, Firefox AND WebKit; booleans in assertions.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(r));
const until = async (cond, n = 240) => { for (let i = 0; i < n && !cond(); i++) await raf(); return !!cond(); };
const settle = async () => { await raf(); await raf(); };
const host = document.createElement('div');
host.style.cssText = 'width: 480px; padding: 120px 0 0 40px;';
document.body.appendChild(host);

const pop = () => [...document.querySelectorAll('.td-dtp-pop')].find((p) => !p.closest('.td-modal[data-state="closing"]')) || null;
const visible = (el) => !!el && !el.closest('[hidden]');
const q = (sel) => [...(pop() ? pop().querySelectorAll(sel) : [])].find(visible) || null;
const live = () => pop().querySelector('[aria-live]').textContent;
const active = () => document.activeElement;
const day = (iso) => q(`.td-cal__day[data-date="${iso}"]`);
const vp = async (size) => {
  await setViewport(size);
  for (let i = 0; i < 120 && window.innerWidth !== size.width; i++) await raf();
  await raf();
};

async function open(attrs) {
  host.innerHTML = `<td-datetime-picker name="d" label="Ngày" ${attrs}></td-datetime-picker>`;
  const el = host.querySelector('td-datetime-picker');
  const rec = { change: [] };
  el.addEventListener('change', (e) => rec.change.push(e.detail));
  await settle();
  el.querySelector('.td-dtp__trigger').click();
  expect(await until(() => pop() && pop().querySelector('.td-cal')), 'dialog open').to.equal(true);
  await settle();
  return { el, rec };
}

beforeEach(async () => { await vp({ width: 1280, height: 800 }); });
afterEach(async () => {
  TdModal.closeAll();
  await settle();
  host.innerHTML = '';
  document.querySelectorAll('.td-dtp-pop, body > .td-modal').forEach((n) => n.remove());
});
after(async () => { await setViewport({ width: 800, height: 600 }); });

describe('Codex r1 #1 — a bound moving past the focused cell keeps the focus on an enabled cell', () => {
  it('max below the focused day: the focus lands on the boundary day (not on a now-disabled cell)', async () => {
    const { el } = await open('mode="date" value="15/06/2026"');
    expect(active() === day('2026-06-15')).to.equal(true);
    el.setAttribute('max', '2026-06-10');
    await settle();
    expect(active() === day('2026-06-10'), `active ${active() && active().getAttribute('data-date')}`).to.equal(true);
    expect(day('2026-06-10').getAttribute('tabindex')).to.equal('0');
    expect(active().getAttribute('aria-disabled')).to.equal(null);
  });

  it('min above the focused day: the focus lands on the min day', async () => {
    const { el } = await open('mode="date" value="15/06/2026"');
    el.setAttribute('min', '2026-06-20');
    await settle();
    expect(active() === day('2026-06-20'), `active ${active() && active().getAttribute('data-date')}`).to.equal(true);
  });

  it('a bound that moves to another month brings the view and the focus along; a focus outside the grid is not stolen', async () => {
    const { el } = await open('mode="date" value="15/06/2026"');
    el.setAttribute('max', '2026-03-05');
    await settle();
    expect(live()).to.equal('Tháng 3 năm 2026');
    expect(active() === day('2026-03-05')).to.equal(true);
    const btn = q('[data-dir="prev"]');
    btn.focus();
    el.setAttribute('max', '2026-03-02');
    await settle();
    expect(active() === btn, 'the focus on a header button stays there').to.equal(true);
  });

  it('months grid: min above the focused month keeps the focus on an enabled month', async () => {
    const { el } = await open('mode="month" value="03/2026"');
    el.setAttribute('min', '2026-08-01');
    await settle();
    expect(active() === q('.td-cal__cell[data-month="8"]'), `active ${active() && active().getAttribute('data-month')}`).to.equal(true);
  });
});

describe('Codex r1 #3 — toggling the pressed title returns to the date the returning view was left on', () => {
  it('months grid: arrows + PageDown only navigate; the month button back → days on the ORIGINAL date', async () => {
    await open('mode="date" value="15/06/2026"');
    q('[data-pick="month"]').click();
    await settle();
    await sendKeys({ press: 'ArrowRight' });
    await sendKeys({ press: 'ArrowRight' });
    await sendKeys({ press: 'PageDown' });
    expect(live()).to.equal('Năm 2027');
    q('[data-pick="month"]').click(); // pressed: back without choosing
    await settle();
    expect(live()).to.equal('Tháng 6 năm 2026');
    expect(active() === day('2026-06-15')).to.equal(true);
  });

  it('years grid: paging + ‹ › only navigate; the year button back → the ORIGINAL view and date (days and months)', async () => {
    await open('mode="date" value="15/06/2026"');
    q('[data-pick="year"]').click();
    await settle();
    await sendKeys({ press: 'PageDown' });
    await sendKeys({ press: 'ArrowRight' });
    q('[data-dir="next"]').click();
    q('[data-pick="year"]').click();
    await settle();
    expect(live()).to.equal('Tháng 6 năm 2026');
    expect(active() === day('2026-06-15')).to.equal(true);
    // via the months grid: days → months → (navigate) → years → (navigate) → back → months at ITS date → back → days
    q('[data-pick="month"]').click();
    await settle();
    await sendKeys({ press: 'ArrowLeft' }); // month 5
    q('[data-pick="year"]').click();
    await settle();
    await sendKeys({ press: 'PageUp' });
    q('[data-pick="year"]').click();
    await settle();
    expect(live()).to.equal('Năm 2026'); // the months grid as it was left (May selected-focus)
    expect(active() === q('.td-cal__cell[data-month="5"]')).to.equal(true);
    q('[data-pick="month"]').click();
    await settle();
    expect(live()).to.equal('Tháng 6 năm 2026');
    expect(active() === day('2026-06-15')).to.equal(true);
  });

  it('ACTIVATING a month cell after navigating keeps the navigated date (August of the original year)', async () => {
    await open('mode="date" value="15/06/2026"');
    q('[data-pick="month"]').click();
    await settle();
    await sendKeys({ press: 'ArrowRight' });
    await sendKeys({ press: 'ArrowRight' });
    await sendKeys({ press: 'Enter' });
    await settle();
    expect(live()).to.equal('Tháng 8 năm 2026');
    expect(active() === day('2026-08-15')).to.equal(true);
  });

  it('ACTIVATING a year cell keeps the navigated year; the month grid it returns to shows that year', async () => {
    await open('mode="date" value="15/06/2026"');
    q('[data-pick="year"]').click();
    await settle();
    await sendKeys({ press: 'ArrowLeft' });
    await sendKeys({ press: 'ArrowLeft' }); // 2024
    await sendKeys({ press: 'Space' });
    await settle();
    expect(live()).to.equal('Tháng 6 năm 2024');
    expect(active() === day('2024-06-15')).to.equal(true);
  });
});

describe('Codex r1 #4 — "Bây giờ" drafts the real now; only the navigation is clamped; the range error shows', () => {
  const next = new Date().getFullYear() + 1;
  const prev = new Date().getFullYear() - 1;

  it('now BEFORE min (future min): the draft is now, "Không được trước …" shows, "Chọn" is refused, the view sits on min', async () => {
    const { el, rec } = await open(`value="01/01/2001 - 00:00" min="${next}-03-04T10:07"`);
    pop().querySelector('[data-action="now"]').click();
    await settle();
    const err = pop().querySelector('.td-dtp-pop__error');
    expect(err.hidden, 'range error shown').to.equal(false);
    expect(err.textContent.startsWith('Không được trước ')).to.equal(true);
    const hour = Number(pop().querySelector('.td-dtp-wheel__list[data-part="hour"] [aria-selected="true"]').getAttribute('data-value'));
    expect(hour, 'the wheels hold the real now (not min 10:07)').to.equal(new Date().getHours());
    expect(live()).to.equal(`Tháng 3 năm ${next}`);
    pop().querySelector('[data-action="confirm"]').click();
    await settle();
    expect(!!pop() && rec.change.length === 0, 'refused, dialog still open').to.equal(true);
    expect(el.getAttribute('value')).to.equal('01/01/2001 - 00:00');
  });

  it('now AFTER max (past max): the draft is now, "Không được sau …" shows, "Chọn" is refused', async () => {
    const { rec } = await open(`value="01/01/2001 - 00:00" max="${prev}-03-04T10:07"`);
    pop().querySelector('[data-action="now"]').click();
    await settle();
    const err = pop().querySelector('.td-dtp-pop__error');
    expect(err.hidden).to.equal(false);
    expect(err.textContent.startsWith('Không được sau ')).to.equal(true);
    expect(live()).to.equal(`Tháng 3 năm ${prev}`);
    pop().querySelector('[data-action="confirm"]').click();
    await settle();
    expect(!!pop() && rec.change.length === 0).to.equal(true);
  });

  it('now inside the bounds: no error, "Chọn" commits now (minute snapped down)', async () => {
    const { el, rec } = await open('value="01/01/2001 - 00:00" minute-step="15"');
    pop().querySelector('[data-action="now"]').click();
    await settle();
    expect(pop().querySelector('.td-dtp-pop__error').hidden).to.equal(true);
    pop().querySelector('[data-action="confirm"]').click();
    await settle();
    expect(rec.change.length).to.equal(1);
    const n = new Date();
    expect(el.getAttribute('value').startsWith(`${String(n.getDate()).padStart(2, '0')}/${String(n.getMonth() + 1).padStart(2, '0')}/${n.getFullYear()} - ${String(n.getHours()).padStart(2, '0')}:`)).to.equal(true);
    expect(Number(el.getAttribute('value').slice(-2)) % 15).to.equal(0);
  });
});
