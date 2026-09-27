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
const openModal = () => [...document.querySelectorAll('.td-modal')].find((m) => m.getAttribute('data-state') !== 'closing') || null;
const panel = () => openModal().querySelector('.td-dtp-panel');
const field = (part) => panel().querySelector(`.td-dtp-panel__input[data-part="${part}"]`);
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
  it('max=1990-12-31 alone: a 1985 value is valid and the year field range is possible', async () => {
    const el = pick('value="15/06/1985 - 10:30" max="1990-12-31"');
    expect(el.getValue()).to.equal('15/06/1985 - 10:30');
    await open(el);
    const y = field('year');
    expect(Number(y.min) <= Number(y.max)).to.equal(true);
    expect(Number(y.max)).to.equal(1990);
  });
  it('no bounds: the 2000–2099 default still applies', () => {
    const el = pick('value="15/06/1985 - 10:30"');
    expect(el.getValue()).to.equal('');
  });
});

describe('ISSUE-3 negative date-field values', () => {
  it('-1 in the day field is validated as the day and clamped on change', async () => {
    const el = pick('value="15/06/2026 - 10:30"');
    await open(el);
    const d = field('day');
    d.value = '-1';
    d.dispatchEvent(new Event('input', { bubbles: true }));
    expect(d.getAttribute('aria-invalid')).to.equal('true');
    d.dispatchEvent(new Event('change', { bubbles: true }));
    expect(d.value).to.equal('1');
  });
});

describe('ISSUE-4 label change while the dialog is open keeps focus', () => {
  it('focus lands on the new trigger', async () => {
    const el = pick('value="15/06/2026 - 10:30"');
    await open(el);
    field('day').focus();
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
    TdModal.closeAll();
    await open(el); // the closing dialog is still in the DOM
    const ids = [...document.querySelectorAll('.td-modal [id]')].map((x) => x.id);
    expect(new Set(ids).size).to.equal(ids.length);
  });
});

describe('impl-review round 2', () => {
  it('ISSUE-9: changing max while open updates the year field bounds', async () => {
    const el = pick('value="15/06/2026 - 10:30" max="2030-12-31"');
    await open(el);
    expect(field('year').max).to.equal('2030');
    el.setAttribute('max', '2040-12-31');
    expect(field('year').max).to.equal('2040');
  });
});
