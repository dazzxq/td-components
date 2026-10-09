import { expect } from '@esm-bundle/chai';
import { TdModal } from '../feedback/td-modal.js';
import './td-datetime-picker.js';

// v0.19.0 — G5 (setDBValue('' | null | undefined) clears) + G6 (default open position = today clamped to min–max).
// Plan: docs/internal/plans/v0.19.0-135-feedback-3.md.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const settle = async () => { await frame(); await frame(); await frame(); };
const trig = (el) => el.querySelector('.td-dtp__trigger');
// v0.60.0: the dialog is the calendar. Where the picker "opens" = the cell that holds the roving tab stop of the view it
// opens on (days for date / datetime, months for month, years for year); `field(part).value` reads it as before.
const panel = () => [...document.querySelectorAll('.td-dtp-pop')].find((p) => !p.closest('.td-modal[data-state="closing"]')) || null;
const wheel = (part) => panel().querySelector(`.td-dtp-wheel__list[data-part="${part}"] [aria-selected="true"]`).getAttribute('data-value');
const focusDate = () => {
  const c = panel().querySelector('.td-cal');
  const v = c.getAttribute('data-view');
  if (v === 'days') {
    const [y, m, d] = c.querySelector('.td-cal__day[tabindex="0"]').getAttribute('data-date').split('-').map(Number);
    return { y, m, d };
  }
  if (v === 'months') {
    return { y: Number(c.querySelector('[aria-live]').textContent.replace(/\D/g, '')), m: Number(c.querySelector('.td-cal__cells[data-kind="months"] [tabindex="0"]').getAttribute('data-month')) };
  }
  return { y: Number(c.querySelector('.td-cal__cells[data-kind="years"] [tabindex="0"]').getAttribute('data-year')) };
};
const field = (part) => ({ get value() { return String(focusDate()[{ year: 'y', month: 'm', day: 'd' }[part]]); } });
async function open(el) {
  trig(el).click();
  await settle();
  return panel();
}
async function close() {
  TdModal.closeAll();
  await wait(0);
}

afterEach(async () => {
  TdModal.closeAll();
  host.innerHTML = '';
  document.querySelectorAll('body > .td-modal, body > .td-dtp-pop').forEach((m) => m.remove());
  await wait(0);
});

describe('v0.19.0 G5 — setDBValue clears on empty / null / undefined', () => {
  const modes = [
    ['datetime', '1985-06-15 10:45:00', '15/06/1985 - 10:45'],
    ['date', '1985-06-15', '15/06/1985'],
    ['month', '1985-06', '06/1985'],
    ['year', '1985', '1985'],
  ];
  for (const [mode, db, display] of modes) {
    for (const empty of ['', null, undefined]) {
      it(`mode="${mode}": setDBValue(${JSON.stringify(empty) ?? 'undefined'}) clears like setValue(null), no change event`, () => {
        const form = mount(`<form><td-datetime-picker id="p" name="v" mode="${mode}" min="1900-01-01"></td-datetime-picker></form>`);
        const p = form.querySelector('td-datetime-picker');
        p.setDBValue(db);
        expect(p.getValue()).to.equal(display);
        expect(new FormData(form).get('v')).to.not.equal(null);
        let changes = 0;
        p.addEventListener('change', () => { changes += 1; });
        p.setDBValue(empty);
        expect(p.getValue()).to.equal('');
        expect(p.getDBValue()).to.equal('');
        expect(p.hasAttribute('value')).to.equal(false);
        expect(new FormData(form).get('v')).to.equal(null);
        expect(trig(p).textContent.trim()).to.not.equal(display);
        expect(changes).to.equal(0);
      });
    }

    it(`mode="${mode}": any other malformed string is still ignored`, () => {
      const p = mount(`<td-datetime-picker id="p" mode="${mode}" min="1900-01-01"></td-datetime-picker>`);
      p.setDBValue(db);
      for (const bad of ['nope', '  ', '1985-13-40', 0]) {
        p.setDBValue(bad);
        expect(p.getValue(), String(bad)).to.equal(display);
      }
    });
  }

  it('required + setDBValue("") → valueMissing', () => {
    const p = mount('<td-datetime-picker id="p" mode="date" required value="15/06/2026"></td-datetime-picker>');
    expect(p.checkValidity()).to.equal(true);
    p.setDBValue('');
    expect(p.validity.valueMissing).to.equal(true);
  });
});

describe('v0.19.0 G6 — default open position = today clamped to min–max', () => {
  const today = new Date();
  const Y = String(today.getFullYear());
  const M = String(today.getMonth() + 1);
  const D = String(today.getDate());

  it('min="1950-01-01" without open-at opens at today (the 0.18.0 "min < 2000" rule is gone)', async () => {
    const p = mount('<td-datetime-picker id="p" mode="date" min="1950-01-01"></td-datetime-picker>');
    await open(p);
    expect({ y: field('year').value, m: field('month').value, d: field('day').value }).to.deep.equal({ y: Y, m: M, d: D });
  });

  it('every mode opens at today without open-at (min before 2000)', async () => {
    for (const mode of ['datetime', 'date', 'month', 'year']) {
      host.innerHTML = '';
      const p = mount(`<td-datetime-picker id="p" mode="${mode}" min="1900-01-01"></td-datetime-picker>`);
      await open(p);
      expect(field('year').value, mode).to.equal(Y);
      await close();
    }
  });

  it('open-at="min" still opens at min', async () => {
    const p = mount('<td-datetime-picker id="p" mode="date" min="1950-01-01" open-at="min"></td-datetime-picker>');
    await open(p);
    expect({ y: field('year').value, m: field('month').value, d: field('day').value }).to.deep.equal({ y: '1950', m: '1', d: '1' });
  });

  it('today outside [min, max] is clamped (below min → min, above max → max)', async () => {
    const next = today.getFullYear() + 1;
    const p = mount(`<td-datetime-picker id="p" mode="date" min="${next}-03-04" max="${next + 2}-01-01"></td-datetime-picker>`);
    await open(p);
    expect({ y: field('year').value, m: field('month').value, d: field('day').value }).to.deep.equal({ y: String(next), m: '3', d: '4' });
    await close();
    host.innerHTML = '';
    const q = mount('<td-datetime-picker id="q" mode="date" min="1950-01-01" max="1960-12-31"></td-datetime-picker>');
    await open(q);
    expect({ y: field('year').value, m: field('month').value, d: field('day').value }).to.deep.equal({ y: '1960', m: '12', d: '31' });
  });

  it('an invalid open-at falls back to today (clamped)', async () => {
    const p = mount('<td-datetime-picker id="p" mode="date" min="1950-06-01" open-at="garbage"></td-datetime-picker>');
    await open(p);
    expect(field('year').value).to.equal(Y);
  });

  it('minute-step: the default open never lands before min (snaps up, carrying into the next hour)', async () => {
    const next = today.getFullYear() + 1;
    const p = mount(`<td-datetime-picker id="p" min="${next}-03-04T10:07" minute-step="5"></td-datetime-picker>`);
    await open(p);
    expect({ h: wheel('hour'), mi: wheel('minute') }).to.deep.equal({ h: '10', mi: '10' });
    await close();
    host.innerHTML = '';
    const q = mount(`<td-datetime-picker id="q" min="${next}-03-04T10:58" minute-step="5"></td-datetime-picker>`);
    await open(q);
    expect({ d: field('day').value, h: wheel('hour'), mi: wheel('minute') }).to.deep.equal({ d: '4', h: '11', mi: '0' });
  });

  it('date / month modes ignore the minute snap (a bound near midnight / month end stays on its day / month)', async () => {
    const next = today.getFullYear() + 1;
    const p = mount(`<td-datetime-picker id="p" mode="date" min="${next}-03-31T23:58" minute-step="5"></td-datetime-picker>`);
    await open(p);
    expect({ m: field('month').value, d: field('day').value }).to.deep.equal({ m: '3', d: '31' });
    await close();
    host.innerHTML = '';
    const q = mount(`<td-datetime-picker id="q" mode="month" min="${next}-12-31T23:58" minute-step="5"></td-datetime-picker>`);
    await open(q);
    expect({ y: field('year').value, m: field('month').value }).to.deep.equal({ y: String(next), m: '12' });
  });
});
