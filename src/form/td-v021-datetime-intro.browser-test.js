import { expect } from '@esm-bundle/chai';
import { sendKeys, emulateMedia } from '@web/test-runner-commands';
import { TdModal } from '../feedback/td-modal.js';
import './td-datetime-picker.js';
import './td-datetime-range.js';

// v0.21.0 P6 — the wheels started at the top and smoothly scrolled to the value once the dialog had entered (like dcms).
// v0.60.0 (plan v0.60.0-calendar-picker D / Drop): <td-datetime-picker> NO LONGER animates — its wheels (src/form/time-wheels.js)
// are centred at once, with or without reduced motion. v0.61.0: <td-datetime-range> uses the same wheels — the opening scroll
// is gone there too (the last describe).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const settle = async () => { await frame(); await frame(); await frame(); };
const pick = (attrs) => { host.insertAdjacentHTML('beforeend', `<td-datetime-picker ${attrs}></td-datetime-picker>`); return host.lastElementChild; };
const range = (attrs) => { host.insertAdjacentHTML('beforeend', `<td-datetime-range name="r" ${attrs}></td-datetime-range>`); return host.lastElementChild; };
const openModal = () => [...document.querySelectorAll('.td-modal')].find((m) => m.getAttribute('data-state') !== 'closing') || null;
const livePop = () => [...document.querySelectorAll('.td-dtp-pop')].find((p) => !p.closest('.td-modal[data-state="closing"]')) || null;
const selected = (list) => list.querySelector('[aria-selected="true"]');
const selectedValue = (list) => Number(selected(list).getAttribute('data-value'));
const offCentre = (list) => {
  const o = selected(list);
  return Math.abs(o.offsetTop + o.offsetHeight / 2 - list.scrollTop - list.clientHeight / 2);
};

afterEach(async () => {
  TdModal.closeAll();
  host.innerHTML = '';
  document.querySelectorAll('body > .td-modal, body > .td-dtp-pop').forEach((m) => m.remove());
  await emulateMedia({ reducedMotion: 'no-preference' });
  await wait(0);
});

describe('v0.60.0 — the picker wheels are centred at once (no opening animation)', () => {
  for (const reduced of [false, true]) {
    it(`${reduced ? 'reduced motion' : 'default motion'}: right after the TIME screen shows both wheels are centred on the value, nothing is scrolled in (0.61.0: two screens)`, async () => {
      if (reduced) await emulateMedia({ reducedMotion: 'reduce' });
      const el = pick('value="15/06/2026 - 18:45"');
      let changes = 0;
      el.addEventListener('change', () => { changes++; });
      el.querySelector('.td-dtp__trigger').click();
      await frame();
      livePop().querySelector('.td-cal__day[tabindex="0"]').click(); // the day → the time screen
      await frame();
      const h = livePop().querySelector('.td-dtp-wheel__list[data-part="hour"]');
      const m = livePop().querySelector('.td-dtp-wheel__list[data-part="minute"]');
      expect(offCentre(h)).to.be.below(2);
      expect(offCentre(m)).to.be.below(2);
      expect([selectedValue(h), selectedValue(m)]).to.deep.equal([18, 45]);
      expect(el._intro).to.equal(undefined); // the intro machinery is gone from the picker
      await wait(400);
      expect(offCentre(h)).to.be.below(2);
      expect([selectedValue(h), selectedValue(m)]).to.deep.equal([18, 45]);
      expect(changes).to.equal(0);
    });
  }

  it('an arrow key on a wheel still wins and the new selection stays centred', async () => {
    const el = pick('value="15/06/2026 - 18:45"');
    el.querySelector('.td-dtp__trigger').click();
    await settle();
    livePop().querySelector('.td-cal__day[tabindex="0"]').click(); // the time screen
    await settle();
    const h = livePop().querySelector('.td-dtp-wheel__list[data-part="hour"]');
    h.focus();
    await sendKeys({ press: 'ArrowDown' });
    expect(selectedValue(h)).to.equal(19);
    await wait(600);
    expect(selectedValue(h)).to.equal(19);
    expect(offCentre(h)).to.be.below(2);
  });
});

// v0.61.0 (plan v0.61.0-range-calendar B8 / B9): <td-datetime-range> uses the same wheels — centred at once on open and when the
// endpoint switch swaps the time; the opening scroll "from 00" is gone for it too (the v0.21.0 range cases were removed).
describe('v0.61.0 — the RANGE wheels are centred at once (no opening scroll)', () => {
  const wheel = (part) => openModal().querySelector(`.td-dtp-wheel__list[data-part="${part}"]`);

  for (const reduced of [false, true]) {
    it(`${reduced ? 'reduced motion' : 'default motion'}: the time screen centres the start time; switching to Đến centres its time at once; nothing is committed`, async () => {
      if (reduced) await emulateMedia({ reducedMotion: 'reduce' });
      const el = range('mode="datetime" start="15/06/2026 - 18:45" end="16/06/2026 - 08:00"');
      let changes = 0;
      el.addEventListener('change', () => { changes += 1; });
      el.querySelector('.td-dtr__trigger').click();
      await settle();
      await wait(450);
      openModal().querySelector('.td-cal__day[tabindex="0"]').click(); // a day → the TIME screen (0.61.0: two screens)
      await settle();
      const h = wheel('hour');
      const m = wheel('minute');
      expect([selectedValue(h), selectedValue(m)]).to.deep.equal([18, 45]);
      expect(offCentre(h)).to.be.below(2);
      expect(offCentre(m)).to.be.below(2);
      openModal().querySelector('.td-dtr-panel__tab[data-side="end"]').click();
      await settle();
      expect([selectedValue(h), selectedValue(m)]).to.deep.equal([8, 0]);
      expect(offCentre(h)).to.be.below(2); // at once: no smooth scroll to wait for
      expect(offCentre(m)).to.be.below(2);
      expect(changes).to.equal(0);
    });
  }

  it('closing right after opening leaves the attributes alone and releases the wheels', async () => {
    const el = range('mode="datetime" start="15/06/2026 - 18:45" end="16/06/2026 - 08:00"');
    el.querySelector('.td-dtr__trigger').click();
    await settle();
    TdModal.closeAll();
    await wait(300);
    expect(el.getAttribute('start')).to.equal('15/06/2026 - 18:45');
    expect(el._timeStep).to.equal(null);
  });
});
