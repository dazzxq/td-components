import { expect } from '@esm-bundle/chai';
import { sendKeys, emulateMedia } from '@web/test-runner-commands';
import { TdModal } from '../feedback/td-modal.js';
import './td-datetime-picker.js';
import './td-datetime-range.js';

// v0.21.0 P6 — the wheels started at the top and smoothly scrolled to the value once the dialog had entered (like dcms).
// v0.60.0 (plan v0.60.0-calendar-picker D / Drop): <td-datetime-picker> NO LONGER animates — its wheels (src/form/time-wheels.js)
// are centred at once, with or without reduced motion. The opening scroll lives on only in <td-datetime-range>, whose
// editor (src/form/datetime-panel.js) is unchanged until v0.61.0 — the original cases are kept for it, side "Từ".
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
    it(`${reduced ? 'reduced motion' : 'default motion'}: right after opening both wheels are centred on the value, nothing is scrolled in`, async () => {
      if (reduced) await emulateMedia({ reducedMotion: 'reduce' });
      const el = pick('value="15/06/2026 - 18:45"');
      let changes = 0;
      el.addEventListener('change', () => { changes++; });
      el.querySelector('.td-dtp__trigger').click();
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
    const h = livePop().querySelector('.td-dtp-wheel__list[data-part="hour"]');
    h.focus();
    await sendKeys({ press: 'ArrowDown' });
    expect(selectedValue(h)).to.equal(19);
    await wait(600);
    expect(selectedValue(h)).to.equal(19);
    expect(offCentre(h)).to.be.below(2);
  });
});

// <td-datetime-range> keeps the v0.21.0 opening scroll (its editor is unchanged until v0.61.0)
describe('v0.21.0 P6 — datetime RANGE opening wheel scroll (unchanged editor)', () => {
  const wheel = (part) => openModal().querySelector(`.td-dtr-panel__side[data-side="start"] .td-dtp-wheel__list[data-part="${part}"]`);

  it('starts at scrollTop 0, waits for the modal entry, then centres the selected option (still selected)', async () => {
    const el = range('mode="datetime" start="15/06/2026 - 18:45" end="16/06/2026 - 08:00"');
    let changes = 0;
    el.addEventListener('change', () => { changes++; });
    el.querySelector('.td-dtr__trigger').click();
    await settle();
    const h = wheel('hour');
    const m = wheel('minute');
    expect([h.scrollTop, m.scrollTop]).to.deep.equal([0, 0]);
    expect([selectedValue(h), selectedValue(m)]).to.deep.equal([18, 45]);
    const end = Date.now() + 3000;
    while (el._dps && el._dps.start.intro && Date.now() < end) await wait(20);
    await wait(50);
    expect(offCentre(h)).to.be.below(2);
    expect(offCentre(m)).to.be.below(2);
    expect([selectedValue(h), selectedValue(m)]).to.deep.equal([18, 45]);
    expect(changes).to.equal(0);
  });

  it('reduced motion: centred instantly, no intro', async () => {
    await emulateMedia({ reducedMotion: 'reduce' });
    const el = range('mode="datetime" start="15/06/2026 - 18:45" end="16/06/2026 - 08:00"');
    el.querySelector('.td-dtr__trigger').click();
    expect(el._dps.start.intro).to.equal(null);
    await settle();
    expect(offCentre(wheel('hour'))).to.be.below(2);
    expect(offCentre(wheel('minute'))).to.be.below(2);
  });

  it('closing before the end cancels the listener and timers', async () => {
    const el = range('mode="datetime" start="15/06/2026 - 18:45" end="16/06/2026 - 08:00"');
    el.querySelector('.td-dtr__trigger').click();
    await settle();
    const h = wheel('hour');
    expect(el._dps.start.intro).to.not.equal(null);
    TdModal.closeAll();
    await wait(500);
    expect(h.scrollTop).to.equal(0);
    expect(el.getAttribute('start')).to.equal('15/06/2026 - 18:45');
  });
});
