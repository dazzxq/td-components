import { expect } from '@esm-bundle/chai';
import { TdModal } from '../feedback/td-modal.js';
import './td-datetime-picker.js';
import { normalizeMinuteStep } from '../utils/datetime.js';

// v0.10.0 impl-review round 1 regressions (td-datetime-picker). td.css only.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r)); };
let n = 0;
const pick = (attrs = '') => {
  const d = document.createElement('div');
  d.innerHTML = `<td-datetime-picker id="rv${++n}" aria-label="Thời gian" ${attrs}></td-datetime-picker>`;
  document.body.appendChild(d);
  return d.firstElementChild;
};
// v0.60.0: the dialog is the calendar; `calendar-day` = a cell of the day grid
const panel = () => [...document.querySelectorAll('.td-dtp-pop')].find((p) => !p.closest('.td-modal[data-state="closing"]')) || null;
const calendarMonth = () => panel().querySelector('[aria-live]').textContent;
async function open(el) { el.querySelector('.td-dtp__trigger').click(); await frames(); }

afterEach(async () => { TdModal.closeAll(); await wait(260); document.querySelectorAll('td-datetime-picker').forEach((p) => p.parentElement.remove()); });

describe('ISSUE-1 getters return "" when out of min/max', () => {
  it('rangeOverflow value → getValue/getDBValue ""', () => {
    const el = pick('value="15/06/2026 - 10:30" max="2026-01-01"');
    expect(el.getValue()).to.equal('');
    expect(el.getDBValue()).to.equal('');
    el.setAttribute('max', '2027-01-01');
    expect(el.getValue()).to.equal('15/06/2026 - 10:30');
  });
});

describe('ISSUE-2 one-sided bound outside 2000–2099', () => {
  it('max=1990-12-31 alone: a 1985 value is valid, the calendar opens on it and next-month stops at the bound', async () => {
    const el = pick('value="15/06/1985 - 10:30" max="1990-12-31"');
    expect(el.getValue()).to.equal('15/06/1985 - 10:30');
    await open(el);
    expect(calendarMonth()).to.equal('Tháng 6 năm 1985');
    panel().querySelector('[data-pick="year"]').click();
    expect(panel().querySelector('.td-cal__cells[data-kind="years"] [data-year="1991"]').getAttribute('aria-disabled')).to.equal('true');
    expect(panel().querySelector('.td-cal__cells[data-kind="years"] [data-year="1990"]').hasAttribute('aria-disabled')).to.equal(false);
  });
  it('v0.60.0: no bounds = every year 1–9999 (the 2000–2099 default is gone); the calendar opens on the value', async () => {
    const el = pick('value="15/06/1985 - 10:30"');
    expect(el.getValue()).to.equal('15/06/1985 - 10:30');
    expect(el.checkValidity()).to.equal(true);
    await open(el);
    expect(calendarMonth()).to.equal('Tháng 6 năm 1985');
    expect(panel().querySelector('[data-dir="prev"]').hasAttribute('aria-disabled')).to.equal(false);
  });
});

// ISSUE-3 (negative values typed in the day field) is gone with the typed fields: the calendar can only offer real days
// (td-v060-calendar: bounds D6, year 0001 / 9999 ends).

describe('ISSUE-4 label change while the dialog is open keeps focus', () => {
  it('focus lands on the new trigger', async () => {
    const el = pick('value="15/06/2026 - 10:30"');
    await open(el);
    panel().querySelector('.td-cal__day[tabindex="0"]').focus();
    el.setAttribute('label', 'Mới');
    await frames();
    expect(document.activeElement === el.querySelector('.td-dtp__trigger')).to.equal(true);
  });
});

describe('ISSUE-5 minute-step parsing', () => {
  it('fractional / trailing junk → 1; valid integers kept', () => {
    expect(normalizeMinuteStep('5.5')).to.equal(1);
    expect(normalizeMinuteStep('5junk')).to.equal(1);
    expect(normalizeMinuteStep('15')).to.equal(15);
    expect(normalizeMinuteStep(' 10 ')).to.equal(10);
  });
});

describe('ISSUE-7 rapid reopen: unique control ids', () => {
  it('close then reopen within the exit delay → no duplicate ids', async () => {
    const el = pick('value="15/06/2026 - 10:30"');
    await open(el);
    el.querySelector('.td-dtp__trigger').click(); // closes (the trigger toggles)
    await open(el); // opens again at once
    const ids = [...document.querySelectorAll('.td-dtp-pop [id]')].map((x) => x.id);
    expect(new Set(ids).size).to.equal(ids.length);
  });
});

describe('impl-review round 2', () => {
  it('ISSUE-9: changing max while open re-evaluates the cells in place', async () => {
    const el = pick('value="15/06/2026 - 10:30" max="2030-12-31"');
    await open(el);
    panel().querySelector('[data-pick="year"]').click();
    const cell = (y) => panel().querySelector(`.td-cal__cells[data-kind="years"] [data-year="${y}"]`);
    expect(cell(2028).hasAttribute('aria-disabled')).to.equal(false);
    el.setAttribute('max', '2026-12-31');
    expect(cell(2028).getAttribute('aria-disabled')).to.equal('true');
    el.setAttribute('max', '2040-12-31');
    expect(cell(2028).hasAttribute('aria-disabled')).to.equal(false);
  });
});
