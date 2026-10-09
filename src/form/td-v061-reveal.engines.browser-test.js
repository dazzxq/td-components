import { expect } from '@esm-bundle/chai';
import { setViewport, sendKeys } from '@web/test-runner-commands';
import { TdModal } from '../feedback/td-modal.js';
import './td-datetime-picker.js';

// v0.62.1: in the datetime popover (date screen) the keyboard must keep the active day inside the visible part of the scroll region
// at short heights with a COARSE (44 px) cell — also when the cell size / paddings are FRACTIONAL (the CI failure: "844x400 coarse dt
// top: keyboard focus left the visible scroll region at 2026-06-29", WebKit on Ubuntu). Two causes: (1) the reveal's own scroll
// reached the window's capture scroll listener, which re-placed the popover and clamped the region's scrollTop (the cell went back
// out of view, every engine); (2) scrollHeight / clientHeight / WebKit's scrollTop are integers, rects are fractional: the reveal
// rounds its step up and settles in a second pass.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
host.style.cssText = 'position: fixed; left: 24px; top: 8px; width: 240px;';
document.body.appendChild(host);
const raf = () => new Promise((r) => requestAnimationFrame(r));
const settle = async () => { await raf(); await raf(); };
const pop = () => document.querySelector('.td-dtp-pop');
const root = document.documentElement;

afterEach(async () => {
  document.querySelectorAll('.td-dtp__trigger[aria-expanded="true"]').forEach((t) => t.click());
  TdModal.closeAll();
  host.innerHTML = '';
  document.querySelectorAll('body > .td-dtp-pop').forEach((n) => n.remove());
  for (const v of ['--td-cal-cell', '--td-cal-pad', '--td-dtp-option-h']) root.style.removeProperty(v);
  await settle();
});

const KEYS = ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'Home', 'ArrowDown', 'ArrowDown', 'PageUp', 'PageDown', 'End'];

for (const [w, h] of [[720, 400], [844, 400], [720, 480]]) {
  for (const cell of ['44px', '43.6px', '43.2px', '44.7px']) {
    for (const pad of ['0.75rem', '11.3px']) {
      it(`${w}×${h}, cell ${cell}, padding ${pad}: every key leaves the active day inside the scroll region (≤ 0.5 px)`, async () => {
        await setViewport({ width: w, height: h });
        root.style.setProperty('--td-cal-cell', cell);
        root.style.setProperty('--td-cal-pad', pad);
        root.style.setProperty('--td-dtp-option-h', '44px');
        host.innerHTML = '<td-datetime-picker mode="datetime" label="Giờ" value="15/06/2026 - 10:30"></td-datetime-picker>';
        host.firstElementChild.querySelector('.td-dtp__trigger').click();
        for (let i = 0; i < 30 && !pop(); i++) await raf();
        await settle();
        const scroll = pop().querySelector('.td-dtp-pop__scroll');
        scroll.scrollTop = 0;
        for (const key of KEYS) {
          await sendKeys({ press: key });
          await settle();
          const a = document.activeElement;
          expect(a.classList.contains('td-cal__day'), `${key}: focus on a day`).to.equal(true);
          const sr = scroll.getBoundingClientRect();
          const ar = a.getBoundingClientRect();
          expect(ar.top >= sr.top - 0.5 && ar.bottom <= sr.bottom + 0.5,
            `${key} → ${a.getAttribute('data-date')}: cell ${ar.top.toFixed(2)}…${ar.bottom.toFixed(2)} vs region ${sr.top.toFixed(2)}…${sr.bottom.toFixed(2)}`).to.equal(true);
        }
      });
    }
  }
}
