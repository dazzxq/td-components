// v0.36.0 (plan QĐ 59 revised 2026-10-05, owner + Codex think-about) — td-lightbox phone rail + gesture fixes in
// Chromium, Firefox AND WebKit. Below 480 px the SAME prev / next buttons and the SAME counter (one polite live region)
// are moved into a persistent bottom rail "‹ 3 / 12 ›" (≥ 44 px, inside the viewport, above the filmstrip and the closed
// sheet's grabber); taps navigate; one item → no rail. RTL swipe direction, edge-start swipes ignored, the sheet moves
// only from its grabber. Real signals only (image decoded, animations finished, rAF).
import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';
import { TdLightbox } from './td-lightbox.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(r));
const settle = async () => {
  await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
  await raf();
  await raf();
};
const overlay = () => document.querySelector('.td-lightbox');
const $ = (sel) => overlay().querySelector(sel);
const rect = (el) => el.getBoundingClientRect();
const overlaps = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
const IMG = (n) => `/test/fixtures/${n}.svg`;
const items = (n) => Array.from({ length: n }, (_, i) => ({ src: IMG((i % 4) + 1), caption: `Ảnh ${i + 1}` }));
async function until(cond, n = 180) {
  for (let i = 0; i < n && !cond(); i++) await raf();
  return cond();
}
async function openReady(list, opts = {}) {
  const lb = TdLightbox.open(list, opts);
  await raf();
  const img = $('.td-lightbox__img');
  for (let i = 0; i < 300 && !(img.complete && img.naturalWidth > 0); i++) await raf();
  await img.decode().catch(() => {});
  await until(() => overlay().getAttribute('data-state') === 'open', 300);
  await settle();
  return lb;
}
const counterText = () => $('.td-lightbox__counter').textContent.trim();
/** a touch tap on a button: pointer events (touch) then the click the browser would fire */
function tap(el) {
  const r = rect(el);
  const o = { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'touch', isPrimary: true,
    clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
  el.dispatchEvent(new PointerEvent('pointerdown', o));
  el.dispatchEvent(new PointerEvent('pointerup', o));
  el.dispatchEvent(new PointerEvent('click', { ...o, detail: 1 }));
}
/** a touch swipe on the column from (x0, y) to (x1, y) */
async function swipe(x0, x1, y) {
  const col = $('.td-lightbox__col');
  const at = (x, type) => col.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9,
    pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0 }));
  at(x0, 'pointerdown');
  for (let k = 1; k <= 6; k++) { at(x0 + ((x1 - x0) * k) / 6, 'pointermove'); await raf(); }
  at(x1, 'pointerup');
  await raf();
}

afterEach(async () => {
  TdLightbox.close();
  document.documentElement.removeAttribute('dir');
  await settle();
});
after(async () => { await setViewport({ width: 800, height: 600 }); });

describe('v0.36.0 td-lightbox phone rail (< 480)', () => {
  for (const [w, h] of [[360, 780], [390, 844], [479, 900]]) {
    for (const variant of ['plain', 'filmstrip', 'panel']) {
      it(`${w}×${h} ${variant}: rail ‹ counter › inside the viewport, ≥ 44 px, never over the filmstrip / grabber`, async () => {
        await setViewport({ width: w, height: h });
        const opts = variant === 'filmstrip' ? { filmstrip: true } : variant === 'panel' ? { panel: true } : {};
        await openReady(items(12), opts);
        await until(() => overlay().getAttribute('data-nav') === 'rail');
        expect(overlay().getAttribute('data-nav')).to.equal('rail');
        const rail = $('.td-lightbox__rail');
        const prev = $('[data-action="prev"]');
        const next = $('[data-action="next"]');
        const counter = $('.td-lightbox__counter');
        expect(prev.parentElement === rail && next.parentElement === rail && counter.parentElement === rail, 'moved, not cloned').to.equal(true);
        expect(document.querySelectorAll('.td-lightbox [data-action="prev"]').length).to.equal(1);
        expect(document.querySelectorAll('.td-lightbox [role="status"][aria-live]').length, 'one live region').to.equal(1);
        const r = rect(rail);
        expect(r.left >= -0.5 && r.right <= w + 0.5 && r.top >= 0 && r.bottom <= h + 0.5, 'rail inside the viewport').to.equal(true);
        for (const b of [prev, next]) {
          const br = rect(b);
          expect(br.width >= 43.5 && br.height >= 43.5, `target ${br.width}×${br.height}`).to.equal(true);
          expect(getComputedStyle(b).visibility).to.equal('visible');
        }
        // order: ‹ counter › along the inline axis
        expect(rect(prev).right <= rect(counter).left + 0.5 && rect(counter).right <= rect(next).left + 0.5).to.equal(true);
        if (variant === 'filmstrip') expect(overlaps(r, rect($('.td-lightbox__filmstrip'))), 'rail ∩ filmstrip').to.equal(false);
        if (variant === 'panel') expect(overlaps(r, rect($('.td-lightbox__grab'))), 'rail ∩ grabber').to.equal(false);
        expect(overlaps(r, rect($('.td-lightbox__toolbar')))).to.equal(false);
      });
    }
  }

  it('a touch tap on › / ‹ navigates; the counter (the same live region) updates; focus survives a relocation', async () => {
    await setViewport({ width: 390, height: 844 });
    await openReady(items(5));
    await until(() => overlay().getAttribute('data-nav') === 'rail');
    expect(counterText()).to.equal('1 / 5');
    tap($('[data-action="next"]'));
    await until(() => counterText() === '2 / 5');
    expect(counterText()).to.equal('2 / 5');
    tap($('[data-action="prev"]'));
    await until(() => counterText() === '1 / 5');
    expect(counterText()).to.equal('1 / 5');
    // relocation keeps focus (rail ↔ toolbar / side discs)
    $('[data-action="next"]').focus();
    await setViewport({ width: 900, height: 700 });
    await until(() => overlay().getAttribute('data-nav') !== 'rail');
    expect(document.activeElement && document.activeElement.getAttribute('data-action')).to.equal('next');
    expect($('.td-lightbox__counter').parentElement === $('.td-lightbox__lead')).to.equal(true);
    expect($('.td-lightbox__rail').hidden).to.equal(true);
  });

  it('one item → no rail (as before: no counter, no ‹ ›)', async () => {
    await setViewport({ width: 360, height: 780 });
    await openReady(items(1));
    expect($('.td-lightbox__rail').hidden).to.equal(true);
    expect(overlay().getAttribute('data-nav')).to.not.equal('rail');
  });
});

describe('v0.53.2 td-lightbox phone: the open info sheet covers the rail', () => {
  for (const [w, h] of [[360, 780], [390, 844]]) {
    it(`${w}×${h}: sheet opened → the ‹ counter › rail is underneath it (the sheet is on top where they overlap)`, async () => {
      await setViewport({ width: w, height: h });
      await openReady(items(12), { panel: () => { const d = document.createElement('div'); d.textContent = 'Thông tin ảnh '.repeat(80); return d; } });
      await until(() => overlay().getAttribute('data-nav') === 'rail');
      $('.td-lightbox__grab').click();
      await until(() => $('.td-lightbox__panel').getAttribute('data-sheet') === 'open');
      await settle();
      const panel = $('.td-lightbox__panel');
      const r = rect($('.td-lightbox__rail'));
      expect(overlaps(r, rect(panel)), 'the open sheet reaches the rail (test precondition)').to.equal(true);
      for (const el of [$('[data-action="prev"]'), $('.td-lightbox__counter'), $('[data-action="next"]')]) {
        const b = rect(el);
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        expect(panel.contains(hit), `${el.className || el.dataset.action}: hit ${hit && hit.className}`).to.equal(true);
      }
      // closing again: the rail is on top / reachable once the sheet is down
      $('.td-lightbox__grab').click();
      await until(() => $('.td-lightbox__panel').getAttribute('data-sheet') !== 'open');
      await settle();
      const nb = rect($('[data-action="next"]'));
      expect($('[data-action="next"]').contains(document.elementFromPoint(nb.left + nb.width / 2, nb.top + nb.height / 2))).to.equal(true);
    });
  }
});

describe('v0.36.0 td-lightbox gestures', () => {
  it('LTR: a leftward swipe = next; RTL: a rightward swipe = next', async () => {
    await setViewport({ width: 390, height: 844 });
    await openReady(items(4));
    await swipe(300, 120, 400);
    await until(() => counterText() === '2 / 4');
    expect(counterText()).to.equal('2 / 4');
    TdLightbox.close();
    await settle();
    document.documentElement.setAttribute('dir', 'rtl');
    await openReady(items(4));
    await swipe(120, 300, 400); // rightward in RTL → next
    await until(() => counterText() === '2 / 4');
    expect(counterText()).to.equal('2 / 4');
  });

  it('a swipe starting within 24 px of the left / right edge is left to the browser (no navigation)', async () => {
    await setViewport({ width: 390, height: 844 });
    await openReady(items(4));
    await swipe(8, 200, 400);
    await swipe(385, 200, 400);
    for (let i = 0; i < 10; i++) await raf();
    expect(counterText()).to.equal('1 / 4');
  });

  it('the sheet moves only from its grabber: a downward drag in the panel content (scrollTop 0) does not collapse it', async () => {
    // engines without constructible Touch / TouchEvent (Firefox desktop; WebKit throws "Illegal constructor") skip
    try { new TouchEvent('touchstart', { touches: [new Touch({ identifier: 0, target: document.body, clientX: 0, clientY: 0 })] }); } catch { return; }
    await setViewport({ width: 390, height: 844 });
    await openReady(items(3), { panel: true });
    $('.td-lightbox__grab').click(); // open the sheet
    await until(() => $('.td-lightbox__panel').getAttribute('data-sheet') === 'open');
    const body = $('.td-lightbox__panel-body');
    const t = (y) => new Touch({ identifier: 1, target: body, clientX: 100, clientY: y });
    body.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t(500)], changedTouches: [t(500)] }));
    body.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [t(620)] }));
    await raf();
    expect($('.td-lightbox__panel').getAttribute('data-sheet')).to.equal('open');
    const g = $('.td-lightbox__grab');
    const tg = (y) => new Touch({ identifier: 2, target: g, clientX: 100, clientY: y });
    g.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [tg(400)], changedTouches: [tg(400)] }));
    g.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [tg(500)] }));
    await raf();
    expect($('.td-lightbox__panel').hasAttribute('data-sheet')).to.equal(false);
  });
});
