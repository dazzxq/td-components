import { expect } from '@esm-bundle/chai';
import { sendKeys, emulateMedia } from '@web/test-runner-commands';
import { TdModal } from '../feedback/td-modal.js';
import './td-datetime-picker.js';

// v0.21.0 P6 — the wheels start at the top and smoothly scroll to the value once the dialog has entered (like dcms).
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
const openModal = () => [...document.querySelectorAll('.td-modal')].find((m) => m.getAttribute('data-state') !== 'closing') || null;
const wheel = (part) => openModal().querySelector(`.td-dtp-wheel__list[data-part="${part}"]`);
const selected = (list) => list.querySelector('[aria-selected="true"]');
const selectedValue = (list) => Number(selected(list).getAttribute('data-value'));
const offCentre = (list) => {
  const o = selected(list);
  return Math.abs(o.offsetTop + o.offsetHeight / 2 - list.scrollTop - list.clientHeight / 2);
};
async function introDone(el, ms = 3000) {
  const end = Date.now() + ms;
  while (el._intro && Date.now() < end) await wait(20);
  await wait(30);
}

afterEach(async () => {
  TdModal.closeAll();
  host.innerHTML = '';
  document.querySelectorAll('body > .td-modal').forEach((m) => m.remove());
  await emulateMedia({ reducedMotion: 'no-preference' });
  await wait(0);
});

describe('v0.21.0 P6 — datetime picker opening wheel scroll', () => {
  it('starts at scrollTop 0, waits for the modal entry, then centres the selected option (still selected)', async () => {
    const el = pick('value="15/06/2026 - 18:45"');
    let changes = 0;
    el.addEventListener('change', () => { changes++; });
    el.querySelector('.td-dtp__trigger').click();
    await settle(); // onShow has run: NOT the end of the entry
    const h = wheel('hour');
    const m = wheel('minute');
    expect([h.scrollTop, m.scrollTop]).to.deep.equal([0, 0]);
    expect([selectedValue(h), selectedValue(m)]).to.deep.equal([18, 45]);
    expect(h.getAttribute('aria-activedescendant')).to.equal(selected(h).id);
    await wait(150); // still inside the 260 ms entry transition
    expect(h.scrollTop).to.equal(0);
    // sample every frame while it scrolls: the selection / pending value never move
    const seen = new Set();
    let moved = false;
    const end = Date.now() + 2500;
    while (el._intro && Date.now() < end) {
      if (h.scrollTop > 0 && offCentre(h) > 2) moved = true;
      seen.add(`${selectedValue(h)}:${selectedValue(m)}:${el._pending.hour}:${el._pending.minute}:${h.getAttribute('aria-activedescendant') === selected(h).id}`);
      await frame();
    }
    await wait(50);
    expect(moved, 'smooth (passes intermediate positions)').to.equal(true);
    expect([...seen]).to.deep.equal(['18:45:18:45:true']);
    expect(offCentre(h)).to.be.below(2);
    expect(offCentre(m)).to.be.below(2);
    expect([selectedValue(h), selectedValue(m)]).to.deep.equal([18, 45]);
    expect(changes).to.equal(0);
  });

  it('reduced motion: centred instantly, no intro', async () => {
    await emulateMedia({ reducedMotion: 'reduce' });
    const el = pick('value="15/06/2026 - 18:45"');
    el.querySelector('.td-dtp__trigger').click();
    expect(el._intro).to.equal(null);
    await settle();
    expect(offCentre(wheel('hour'))).to.be.below(2);
    expect(offCentre(wheel('minute'))).to.be.below(2);
  });

  it('an arrow key during the intro scroll wins', async () => {
    const el = pick('value="15/06/2026 - 18:45"');
    el.querySelector('.td-dtp__trigger').click();
    await settle();
    const h = wheel('hour');
    const end = Date.now() + 2000;
    while (h.scrollTop === 0 && Date.now() < end) await frame(); // the intro scroll has started
    expect(h.scrollTop).to.be.above(0);
    h.focus();
    await sendKeys({ press: 'ArrowDown' });
    expect(selectedValue(h)).to.equal(19);
    await introDone(el);
    await wait(600);
    expect(selectedValue(h)).to.equal(19);
    expect(el._pending.hour).to.equal(19);
    expect(offCentre(h)).to.be.below(2);
  });

  it('a wheel / pointer on one list before the start cancels only that list', async () => {
    const el = pick('value="15/06/2026 - 18:45"');
    el.querySelector('.td-dtp__trigger').click();
    await settle();
    wheel('hour').dispatchEvent(new WheelEvent('wheel', { deltaY: 10, bubbles: true }));
    await introDone(el);
    expect(wheel('hour').scrollTop).to.equal(0);
    expect(offCentre(wheel('minute'))).to.be.below(2);
    expect(selectedValue(wheel('hour'))).to.equal(18);
  });

  it('closing before the end cancels the listener and timers', async () => {
    const el = pick('value="15/06/2026 - 18:45"');
    el.querySelector('.td-dtp__trigger').click();
    await settle();
    const h = wheel('hour');
    expect(el._intro).to.not.equal(null);
    TdModal.closeAll();
    expect(el._intro).to.equal(null);
    await wait(500);
    expect(h.scrollTop).to.equal(0);
    expect(el.getAttribute('value')).to.equal('15/06/2026 - 18:45');
  });
});
