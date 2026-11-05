import { expect } from '@esm-bundle/chai';
import { setViewport, sendKeys } from '@web/test-runner-commands';
import { TdModal } from '../feedback/td-modal.js';
import { TdDatetimeRange } from './td-datetime-range.js';
import './td-datetime-picker.js';

// v0.96.3 (plan docs/internal/plans/v0.96.3-range-calendar.md, dsuite): the range calendar draws ONE continuous band per week
// row (the td background, rounded only at the range ends and the row ends, no hairline / box), weeks are separate bars, and the
// cell state (endpoint fill, hover, today ring, focus ring) is a ::before pill inset 2px, so nothing reaches past the td.
// The single picker keeps its look. Chromium, Firefox AND WebKit. Booleans / strings only in assertions.
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
const day = (iso) => $(`.td-cal__day[data-date="${iso}"]`);
const hover = (iso) => day(iso).dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
const NOW = new Date(2026, 9, 29, 9, 30);
const origNow = TdDatetimeRange.now;
const MD = () => {
  const p = document.createElement('div');
  p.style.width = 'var(--td-radius-md)';
  document.body.appendChild(p);
  const w = getComputedStyle(p).width;
  p.remove();
  return w;
};
/** a token resolved as a background colour inside `scope` */
const tokenBg = (scope, name) => {
  const p = document.createElement('div');
  p.style.background = `var(${name})`;
  scope.appendChild(p);
  const c = getComputedStyle(p).backgroundColor;
  p.remove();
  return c;
};
const radii = (el) => {
  const cs = getComputedStyle(el);
  return { ss: cs.borderStartStartRadius, se: cs.borderStartEndRadius, es: cs.borderEndStartRadius, ee: cs.borderEndEndRadius };
};
const zero = (r) => r === '0px';

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
  document.querySelectorAll('body > .td-modal, body > .td-dtp-pop').forEach((m) => m.remove());
  TdDatetimeRange.now = origNow;
});

describe('v0.96.3 range band (committed 28/10 → 06/11)', () => {
  it('one band per row: band colour on the td, square inside a row, rounded at the range / row ends, no hairline / box', async () => {
    await open(mount('name="r" start="28/10/2026" end="06/11/2026"'));
    const cal = $('.td-cal');
    const band = tokenBg(cal, '--td-cal-range-bg');
    const md = MD();
    const mid = day('2026-10-30');
    const lastCol = day('2026-11-01'); // CN, outside the month, inside the band
    const firstCol = day('2026-11-02'); // T2, outside
    const start = day('2026-10-28');
    const end = day('2026-11-06');
    for (const [n, c] of [['30/10', mid], ['01/11', lastCol], ['02/11', firstCol], ['start', start], ['end', end]]) {
      const cs = getComputedStyle(c);
      expect(cs.backgroundColor, `${n} band colour`).to.equal(band);
      expect(cs.boxShadow, `${n} no hairline`).to.equal('none');
      expect(cs.outlineStyle, `${n} no outline`).to.equal('none');
    }
    expect(Object.values(radii(mid)).every(zero), 'in-row band cell is square').to.equal(true);
    const rl = radii(lastCol);
    expect([rl.se, rl.ee, zero(rl.ss), zero(rl.es)].join(), 'row end: end corners only').to.equal([md, md, true, true].join());
    const rf = radii(firstCol);
    expect([rf.ss, rf.es, zero(rf.se), zero(rf.ee)].join(), 'row start: start corners only').to.equal([md, md, true, true].join());
    const rs = radii(start);
    expect([rs.ss, rs.es, zero(rs.se), zero(rs.ee)].join(), 'range start: start corners only').to.equal([md, md, true, true].join());
    const re = radii(end);
    expect([re.se, re.ee, zero(re.ss), zero(re.es)].join(), 'range end: end corners only').to.equal([md, md, true, true].join());
  });

  it('outside-month days in the band look the same as in-month band days (colour + full ink)', async () => {
    await open(mount('name="r" start="28/10/2026" end="06/11/2026"'));
    const inMonth = getComputedStyle(day('2026-10-30'));
    for (const iso of ['2026-11-01', '2026-11-03', '2026-11-05']) {
      const c = day(iso);
      expect(c.hasAttribute('data-outside'), `${iso} outside`).to.equal(true);
      expect(getComputedStyle(c).backgroundColor, `${iso} band`).to.equal(inMonth.backgroundColor);
      expect(getComputedStyle(c).color, `${iso} full ink`).to.equal(inMonth.color);
    }
  });

  it('week rows do not touch (a gap ≥ 1px between two band rows)', async () => {
    await open(mount('name="r" start="28/10/2026" end="06/11/2026"'));
    const gap = day('2026-11-03').getBoundingClientRect().top - day('2026-10-30').getBoundingClientRect().bottom;
    expect(gap >= 1, `row gap ${gap}`).to.equal(true);
  });

  it('the state is a pill inside the td: endpoints solid, inset ≥ 2px, the td is its containing block', async () => {
    await open(mount('name="r" start="28/10/2026" end="06/11/2026"'));
    const cal = $('.td-cal');
    const sel = tokenBg(cal, '--td-cal-selected-bg');
    for (const iso of ['2026-10-28', '2026-11-06']) {
      const c = day(iso);
      expect(getComputedStyle(c).position, `${iso} td relative`).to.equal('relative');
      const p = getComputedStyle(c, '::before');
      expect(p.position, `${iso} pill absolute`).to.equal('absolute');
      expect(p.backgroundColor, `${iso} pill = selected fill`).to.equal(sel);
      for (const k of ['top', 'right', 'bottom', 'left']) expect(parseFloat(p[k]) >= 2, `${iso} pill ${k} ${p[k]}`).to.equal(true);
    }
    // today (29/10) is a ring on the pill, not on the td
    const today = day('2026-10-29');
    expect(today.getAttribute('aria-current'), 'today').to.equal('date');
    expect(getComputedStyle(today).boxShadow, 'today td no ring').to.equal('none');
    expect(getComputedStyle(today, '::before').boxShadow.includes('inset'), 'today ring on the pill').to.equal(true);
  });

  it('the focus ring is an inset box-shadow on the pill (nothing past the td)', async () => {
    await open(mount('name="r" start="28/10/2026" end="06/11/2026"'));
    day('2026-10-30').focus();
    await sendKeys({ press: 'ArrowRight' });
    await settle();
    const f = openModal().querySelector('.td-cal__day:focus');
    expect(!!f, 'a day has focus').to.equal(true);
    expect(getComputedStyle(f).outlineStyle, 'no td outline').to.equal('none');
    const sh = getComputedStyle(f, '::before').boxShadow;
    expect(sh.includes('inset') && !/,\s*\d/.test(sh.replace(/rgba?\([^)]*\)/g, 'C')), `focus pill ring ${sh}`).to.equal(true);
  });

  it('nothing is clipped at the grid edges (columns 1 / 7 inside the calendar, no sideways scroll)', async () => {
    await open(mount('name="r" start="28/10/2026" end="06/11/2026"'));
    const cal = $('.td-cal').getBoundingClientRect();
    for (const iso of ['2026-11-01', '2026-11-02', '2026-10-26']) {
      const r = day(iso).getBoundingClientRect();
      expect(r.left >= cal.left - 0.5 && r.right <= cal.right + 0.5, `${iso} inside .td-cal`).to.equal(true);
    }
    const panel = $('.td-dtr-panel');
    expect(panel.scrollWidth === panel.clientWidth, 'panel no sideways scroll').to.equal(true);
  });
});

describe('v0.96.3 range band: endpoints without an interval keep a bare pill (Codex ISSUE-1)', () => {
  const clear = 'rgba(0, 0, 0, 0)';
  it('a lone "Đến" has no band', async () => {
    await open(mount('name="r" end="06/11/2026"'));
    const e = day('2026-11-06');
    expect(e.getAttribute('data-range'), 'end role').to.equal('end');
    expect(getComputedStyle(e).backgroundColor, 'no band').to.equal(clear);
  });

  it('a lone "Từ" with no preview has no band (a reversed pair cannot be drafted: the panel clears the other side)', async () => {
    await open(mount('name="r" start="28/10/2026"'));
    const c = day('2026-10-28');
    expect(c.getAttribute('data-range'), 'start role').to.equal('start');
    expect(!!$('.td-cal__day[data-preview]'), 'no preview').to.equal(false);
    expect(getComputedStyle(c).backgroundColor, 'no band').to.equal(clear);
  });

  it('a range that wraps a row: the start on the row end and the end on the next row start both carry the band', async () => {
    await open(mount('name="r" start="01/11/2026" end="02/11/2026"'));
    const band = tokenBg($('.td-cal'), '--td-cal-range-bg');
    expect(getComputedStyle(day('2026-11-01')).backgroundColor, 'start (CN) band').to.equal(band);
    expect(getComputedStyle(day('2026-11-02')).backgroundColor, 'end (T2) band').to.equal(band);
  });
});

describe('v0.96.3 range band (preview 28/10 → pointer on 06/11)', () => {
  it('the preview is the lighter tint only: no hairline, no box; preview end rounded at its end side; the start caps it', async () => {
    const el = mount('name="r" start="28/10/2026"');
    await open(el);
    $('.td-dtr-panel__tab[data-side="end"]').click();
    await settle();
    hover('2026-11-06');
    await settle();
    const cal = $('.td-cal');
    const pv = tokenBg(cal, '--td-cal-preview-bg');
    const md = MD();
    for (const iso of ['2026-10-30', '2026-11-01', '2026-11-03', '2026-11-06']) {
      const c = day(iso);
      expect(c.hasAttribute('data-preview'), `${iso} preview`).to.equal(true);
      const cs = getComputedStyle(c);
      expect(cs.backgroundColor, `${iso} preview tint`).to.equal(pv);
      expect(cs.boxShadow, `${iso} no hairline`).to.equal('none');
      expect(cs.outlineStyle, `${iso} no outline`).to.equal('none');
    }
    const re = radii(day('2026-11-06'));
    expect([re.se, re.ee, zero(re.ss), zero(re.es)].join(), 'preview end: end corners only').to.equal([md, md, true, true].join());
    expect(getComputedStyle(day('2026-10-28')).backgroundColor, 'start caps the preview').to.equal(pv);
  });
});

describe('v0.96.3 single picker unchanged', () => {
  it('selected / today keep the td fill, ring and rounded cell', async () => {
    host.insertAdjacentHTML('beforeend', '<td-datetime-picker mode="date" value="15/10/2026"></td-datetime-picker>');
    const p = host.lastElementChild;
    p.querySelector('.td-dtp__trigger').click();
    expect(await until(() => !!document.querySelector('.td-dtp-pop[data-state="open"]')), 'pop open').to.equal(true);
    await settle();
    const pop = document.querySelector('.td-dtp-pop');
    const sel = pop.querySelector('.td-cal__day[aria-selected="true"]');
    const cs = getComputedStyle(sel);
    expect(cs.backgroundColor, 'td fill').to.equal(tokenBg(pop.querySelector('.td-cal'), '--td-cal-selected-bg'));
    expect(cs.borderStartStartRadius, 'rounded cell').to.equal(MD());
    expect(cs.position, 'static td').to.equal('static');
    expect(getComputedStyle(pop.querySelector('.td-cal__grid')).borderSpacing.replace(/ 0px$/, ''), 'no row gap').to.equal('0px');
  });
});
