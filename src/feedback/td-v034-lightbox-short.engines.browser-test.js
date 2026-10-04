// v0.34.0 (plan docs/internal/plans/v0.34.0-responsive.md overlay table, ADR 0014 `short`) — td-lightbox on a landscape
// phone (max-height: 500px) in Chromium, Firefox AND WebKit: the filmstrip is hidden AND its grid row collapses (the
// stage gets the freed height, no empty band), the toolbar is compacted (gap / padding / top offset) while its buttons
// keep the --td-lb-btn touch size; at 1280×800 the filmstrip is unchanged. Only real signals (animations finished,
// image decoded, rAF) — no fixed sleeps before geometry. Booleans in assertions (DOM nodes in a failing chai assertion
// hang the runner).
import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';
import { TdLightbox } from './td-lightbox.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(r));
const overlay = () => document.querySelector('.td-lightbox');
const $ = (sel) => overlay().querySelector(sel);
const rect = (el) => el.getBoundingClientRect();
const many = (n) => Array.from({ length: n }, (_, i) => `/test/fixtures/${(i % 4) + 1}.svg`);

async function openReady(items, opts) {
  TdLightbox.open(items, opts);
  await raf();
  const img = $('.td-lightbox__img');
  // the viewer sets the src once the preload resolved → wait for a decoded image (rAF-paced, bounded)
  for (let i = 0; i < 300 && !(img.complete && img.naturalWidth > 0); i++) await raf();
  expect(img.naturalWidth > 0, 'image loaded').to.equal(true);
  await img.decode().catch(() => {});
  await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
  await raf();
  await raf();
}

afterEach(async () => {
  TdLightbox.close();
  await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
});
after(async () => { await setViewport({ width: 800, height: 600 }); });

const btnToken = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--td-lb-btn'));

describe('v0.34.0 td-lightbox — short (max-height: 500px)', () => {
  for (const [w, h] of [[844, 390], [932, 430]]) {
    it(`${w}×${h}: filmstrip hidden, its row collapsed, the stage / image take the freed height`, async () => {
      await setViewport({ width: w, height: h });
      await openReady(many(12), { filmstrip: true });
      expect(overlay().hasAttribute('data-filmstrip'), 'filmstrip mode on').to.equal(true);
      expect(getComputedStyle($('.td-lightbox__filmstrip')).display, 'filmstrip display').to.equal('none');
      const rows = getComputedStyle($('.td-lightbox__col')).gridTemplateRows.split(' ').map(parseFloat);
      expect(rows.length, `grid rows ${rows}`).to.equal(3);
      expect(rows[2], `filmstrip row ${rows}`).to.equal(0);
      const stage = rect($('.td-lightbox__stage'));
      const img = rect($('.td-lightbox__img'));
      // no caption on these items → the stage is the whole column (≥ h − 1), the 3:2 image is height-bound
      expect(stage.bottom >= h - 1, `stage bottom ${stage.bottom} ≥ ${h - 1}`).to.equal(true);
      expect(img.bottom >= h - 4 && img.bottom <= h + 0.5, `image bottom ${img.bottom} ≈ ${h}`).to.equal(true);
      expect(img.top >= -0.5, `image top ${img.top}`).to.equal(true);
    });

    it(`${w}×${h}: compact toolbar — buttons keep --td-lb-btn, everything inside the viewport`, async () => {
      await setViewport({ width: w, height: h });
      await openReady(many(12), { filmstrip: true });
      const size = btnToken();
      expect(size >= 40, `--td-lb-btn ${size}`).to.equal(true);
      const bar = $('.td-lightbox__toolbar');
      const cs = getComputedStyle(bar);
      expect(parseFloat(cs.columnGap) <= 2, `toolbar gap ${cs.columnGap} compacted`).to.equal(true);
      expect(parseFloat(cs.paddingTop) <= 4, `toolbar padding ${cs.paddingTop} compacted`).to.equal(true);
      expect(rect(bar).top <= 8.5, `toolbar top ${rect(bar).top} compacted`).to.equal(true);
      const btns = [...bar.querySelectorAll('.td-lightbox__btn')].filter((b) => getComputedStyle(b).display !== 'none');
      expect(btns.length > 0, 'toolbar buttons').to.equal(true);
      for (const b of btns) {
        const r = rect(b);
        expect(r.width >= size - 0.5 && r.height >= size - 0.5, `button ${r.width}×${r.height} ≥ ${size}`).to.equal(true);
      }
      for (const [name, el] of [['toolbar', bar], ['lead', $('.td-lightbox__lead')], ['stage', $('.td-lightbox__stage')]]) {
        const r = rect(el);
        expect(r.left >= -0.5 && r.top >= -0.5 && r.right <= w + 0.5 && r.bottom <= h + 0.5,
          `${name} inside ${w}×${h}: ${r.left},${r.top},${r.right},${r.bottom}`).to.equal(true);
      }
    });
  }

  it('1280×800: the filmstrip is visible and keeps its row (unchanged)', async () => {
    await setViewport({ width: 1280, height: 800 });
    await openReady(many(12), { filmstrip: true });
    const strip = $('.td-lightbox__filmstrip');
    expect(getComputedStyle(strip).display, 'filmstrip display').to.equal('flex');
    const r = rect(strip);
    expect(r.height > 40 && r.bottom <= 800.5, `strip ${r.top}–${r.bottom}`).to.equal(true);
    const rows = getComputedStyle($('.td-lightbox__col')).gridTemplateRows.split(' ').map(parseFloat);
    expect(rows[2] > 40, `filmstrip row ${rows}`).to.equal(true);
    expect(parseFloat(getComputedStyle($('.td-lightbox__toolbar')).columnGap), 'toolbar gap').to.equal(4);
  });
});
