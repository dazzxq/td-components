// v0.114.0 (plan docs/internal/plans/v0.114.0-lightbox-fill-sheet.md) — td-lightbox `fit: 'fill'`, `sheet: 'stack'`,
// handle.setSheet(open) / handle.sheetOpen, item.width / item.height, in Chromium, Firefox AND WebKit.
// Only real signals (image decoded, animations finished, rAF). Booleans in assertions (DOM nodes in a failing chai
// assertion hang the runner). Pointer input is synthetic (this file runs in the shared engines group).
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
const SMALL = '/test/fixtures/small.svg'; // 120 × 80 (3:2)
const PORTRAIT = '/test/fixtures/portrait.svg'; // 800 × 1200 (2:3)
const PANORAMA = '/test/fixtures/panorama.svg'; // 1800 × 600 (3:1)
const smalls = (n) => Array.from({ length: n }, (_, i) => ({ src: SMALL, caption: `Ảnh ${i + 1}` }));
const longPanel = () => { const d = document.createElement('div'); d.className = 'info'; d.textContent = 'Thông tin ảnh '.repeat(300); return d; };
const shortPanel = () => { const d = document.createElement('p'); d.textContent = 'Thông tin ảnh'; return d; };

async function until(cond, n = 240) {
  for (let i = 0; i < n && !cond(); i++) await raf();
  return cond();
}
const img = () => $('.td-lightbox__img');
const loaded = (src) => { const i = img(); return !i.hasAttribute('data-loading') && i.complete && i.naturalWidth > 0 && (!src || i.src.endsWith(src)); };
async function waitImage(src) {
  await until(() => loaded(src), 400);
  await img().decode().catch(() => {});
  // the slide-in (data-slide → removed two frames later → a transform transition) must be over before measuring
  await until(() => !$('.td-lightbox__stage').hasAttribute('data-slide'));
  await raf();
  await settle();
}
/** the RO → rAF refit has landed: one side touches the stage and the box has the image ratio */
const refitted = (ratio) => () => {
  const s = $('.td-lightbox__stage');
  const r = rect(img());
  return (Math.abs(r.width - s.clientWidth) <= 1 || Math.abs(r.height - s.clientHeight) <= 1)
    && Math.abs(r.width - r.height * ratio) <= 1 + ratio;
};
async function openReady(list, opts = {}) {
  const lb = TdLightbox.open(list, opts);
  await raf();
  await waitImage();
  await until(() => overlay().getAttribute('data-state') === 'open', 300);
  await settle();
  return lb;
}

/** the img fills the stage along one axis (±1 px), keeps `ratio` (±1 px), sits inside the stage and below the toolbar */
function expectFilled(ratio, label = '') {
  const s = $('.td-lightbox__stage');
  const sr = rect(s);
  const r = rect(img());
  const W = s.clientWidth;
  const H = s.clientHeight;
  const touches = Math.abs(r.width - W) <= 1 || Math.abs(r.height - H) <= 1;
  expect(touches, `${label} touches one side: img ${r.width}×${r.height} in ${W}×${H}`).to.equal(true);
  expect(Math.abs(r.width - r.height * ratio) <= 1 + ratio, `${label} ratio ${r.width}/${r.height} ≈ ${ratio}`).to.equal(true);
  expect(r.left >= sr.left - 1 && r.right <= sr.right + 1 && r.top >= sr.top - 1 && r.bottom <= sr.bottom + 1,
    `${label} img inside the stage`).to.equal(true);
  expect(r.top >= rect($('.td-lightbox__toolbar')).bottom - 0.5, `${label} below the toolbar`).to.equal(true);
  expect(r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.top >= -0.5 && r.bottom <= innerHeight + 0.5, `${label} in viewport`).to.equal(true);
  return r;
}

function press(el, x, y) {
  const o = { bubbles: true, cancelable: true, composed: true, pointerId: 3, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: 1 };
  el.dispatchEvent(new PointerEvent('pointerdown', o));
  el.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
  el.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0, detail: 1 }));
}

const errors = [];
const onError = (e) => { errors.push(String((e && e.message) || e)); };
window.addEventListener('error', onError);

afterEach(async () => {
  TdLightbox.close();
  await settle();
});
after(async () => {
  window.removeEventListener('error', onError);
  await setViewport({ width: 800, height: 600 });
});

describe('v0.114.0 td-lightbox fit', () => {
  it('default (no fit): a small image keeps its natural 120 × 80 (unchanged behaviour)', async () => {
    await setViewport({ width: 1280, height: 800 });
    await openReady([SMALL]);
    const r = rect(img());
    expect(Math.round(r.width) === 120 && Math.round(r.height) === 80, `${r.width}×${r.height}`).to.equal(true);
    expect(overlay().hasAttribute('data-fit') || overlay().hasAttribute('data-fit-active')).to.equal(false);
    expect(img().style.getPropertyValue('--td-lb-fit-w')).to.equal('');
  });

  it("fit: 'fill' at 1280 × 800: the small image is scaled up to touch the image area, 3:2, below the toolbar", async () => {
    await setViewport({ width: 1280, height: 800 });
    await openReady([SMALL], { fit: 'fill' });
    expect(overlay().getAttribute('data-fit')).to.equal('fill');
    expect(overlay().hasAttribute('data-fit-active')).to.equal(true);
    const r = expectFilled(1.5);
    expect(r.width > 600, 'scaled up').to.equal(true);
    // whole px, written through CSSOM custom properties
    expect(/^\d+px$/.test(img().style.getPropertyValue('--td-lb-fit-w').trim())).to.equal(true);
    expect(img().style.width).to.equal(''); // no plain width property, only the custom properties
  });

  it("'FILL ' (any case, trimmed) is fill; another value is contain", async () => {
    await setViewport({ width: 1280, height: 800 });
    await openReady([SMALL], { fit: ' FILL ' });
    expect(overlay().getAttribute('data-fit')).to.equal('fill');
    TdLightbox.close();
    await settle();
    await openReady([SMALL], { fit: 'cover' });
    expect(overlay().hasAttribute('data-fit')).to.equal(false);
    expect(overlay().hasAttribute('data-fit-active')).to.equal(false);
  });

  it('fill + filmstrip: above the strip', async () => {
    await setViewport({ width: 1280, height: 800 });
    await openReady(smalls(4), { fit: 'fill', filmstrip: true });
    const r = expectFilled(1.5, 'filmstrip');
    expect(r.bottom <= rect($('.td-lightbox__filmstrip')).top + 0.5).to.equal(true);
  });

  it('fill + panel ≥ 1024: never into the panel column', async () => {
    await setViewport({ width: 1280, height: 800 });
    await openReady(smalls(2), { fit: 'fill', panel: shortPanel });
    const r = expectFilled(1.5, 'panel');
    expect(r.right <= rect($('.td-lightbox__panel')).left + 0.5).to.equal(true);
  });

  it('fill + phone rail at 390 × 844: above the rail', async () => {
    await setViewport({ width: 390, height: 844 });
    await openReady(smalls(3), { fit: 'fill' });
    await until(() => overlay().getAttribute('data-nav') === 'rail');
    await settle();
    const r = expectFilled(1.5, 'rail');
    expect(Math.abs(r.width - 390) <= 1, `full width ${r.width}`).to.equal(true);
    expect(r.bottom <= rect($('.td-lightbox__rail')).top + 0.5).to.equal(true);
  });

  it('fill + overlay sheet below 1024: above the closed grabber', async () => {
    await setViewport({ width: 800, height: 600 });
    await openReady([SMALL], { fit: 'fill', panel: shortPanel });
    const r = expectFilled(1.5, 'overlay sheet');
    expect(r.bottom <= rect($('.td-lightbox__grab')).top + 0.5).to.equal(true);
  });

  it('fill on a short screen (844 × 390)', async () => {
    await setViewport({ width: 844, height: 390 });
    await openReady(smalls(3), { fit: 'fill', filmstrip: true });
    expectFilled(1.5, 'short');
  });

  it('a click on the letterbox closes, a click on the image does not; zoom base = the fill size, pan clamped', async () => {
    await setViewport({ width: 1280, height: 800 });
    await openReady([SMALL], { fit: 'fill' });
    const s = $('.td-lightbox__stage');
    const r = rect(img());
    const sr = rect(s);
    expect(sr.width - r.width > 40, 'there is a side letterbox').to.equal(true);
    // the image: a click zooms (2×), never closes
    press(img(), r.left + r.width * 0.9, r.top + r.height * 0.9);
    await raf();
    expect(TdLightbox.isOpen).to.equal(true);
    expect(overlay().hasAttribute('data-zoomed')).to.equal(true);
    expect(Math.abs(img().offsetWidth - r.width) <= 1, 'zoom base = fill size').to.equal(true);
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(img().style.transform);
    const maxX = Math.max(0, (img().offsetWidth * 2 - sr.width) / 2);
    const maxY = Math.max(0, (img().offsetHeight * 2 - sr.height) / 2);
    expect(!!m && Math.abs(Number(m[1])) <= maxX + 0.5 && Math.abs(Number(m[2])) <= maxY + 0.5, `pan ${img().style.transform}`).to.equal(true);
    press(img(), r.left + r.width / 2, r.top + r.height / 2); // zoom out
    await settle();
    expect(overlay().hasAttribute('data-zoomed')).to.equal(false);
    // the letterbox (the stage beside the image) closes
    press(s, sr.left + 10, sr.top + sr.height / 2);
    await raf();
    expect(TdLightbox.isOpen).to.equal(false);
  });

  it('viewport resize → fits again; no "ResizeObserver loop" error', async () => {
    errors.length = 0;
    await setViewport({ width: 1280, height: 800 });
    await openReady([SMALL], { fit: 'fill' });
    const a = expectFilled(1.5, 'before');
    await setViewport({ width: 700, height: 900 });
    await until(refitted(1.5));
    await settle();
    const b = expectFilled(1.5, 'after');
    expect(b.width < a.width).to.equal(true);
    expect(Math.abs(b.width - 700) <= 1, `width-bound ${b.width}`).to.equal(true);
    await setViewport({ width: 1100, height: 500 });
    await until(refitted(1.5));
    await settle();
    expectFilled(1.5, 'again');
    expect(errors.filter((m) => /ResizeObserver/i.test(m))).to.deep.equal([]);
  });

  it('item.width / height size the frame before the image loads; the natural size wins once loaded', async () => {
    await setViewport({ width: 1280, height: 800 });
    // 4:1 declared, the file is 3:2 — checked synchronously after open(): the load cannot have completed yet
    TdLightbox.open([{ src: SMALL, width: 400, height: 100 }], { fit: 'fill' });
    expect(img().hasAttribute('data-loading'), 'still loading').to.equal(true);
    const w = parseFloat(img().style.getPropertyValue('--td-lb-fit-w'));
    const h = parseFloat(img().style.getPropertyValue('--td-lb-fit-h'));
    expect(w > 0 && Math.abs(w - h * 4) <= 4, `frame ${w}×${h} is 4:1`).to.equal(true);
    expect(Math.abs(rect(img()).width - w) <= 1, 'the img box has that size').to.equal(true);
    await waitImage();
    expectFilled(1.5, 'natural wins');
  });

  it('bind(): data-td-lightbox-width / -height reach the item', async () => {
    await setViewport({ width: 1280, height: 800 });
    const root = document.createElement('div');
    root.innerHTML = `<div data-td-lightbox-group><a href="#" data-td-lightbox-item data-td-lightbox-src="${SMALL}" data-td-lightbox-width="1200" data-td-lightbox-height="800">a</a><a href="#" data-td-lightbox-item data-td-lightbox-src="${SMALL}" data-td-lightbox-width="x">b</a></div>`;
    document.body.appendChild(root);
    let detail = null;
    const on = (e) => { detail = e.detail; };
    document.addEventListener('td-lightbox-open', on);
    const unbind = TdLightbox.bind(root, { fit: 'fill' });
    try {
      root.querySelector('a').click();
      expect(!!detail).to.equal(true);
      expect(detail.item.width === 1200 && detail.item.height === 800).to.equal(true);
      TdLightbox.close();
      detail = null;
      root.querySelectorAll('a')[1].click();
      expect(!!detail && !('width' in detail.item) && !('height' in detail.item)).to.equal(true);
      expect(overlay().getAttribute('data-fit')).to.equal('fill');
    } finally {
      unbind();
      document.removeEventListener('td-lightbox-open', on);
      root.remove();
    }
  });

  it('a fill session with a video slide and an error slide: those are laid out as contain; back to an image → fill', async () => {
    await setViewport({ width: 1280, height: 800 });
    const lb = await openReady([SMALL, { type: 'video', src: '/test/fixtures/clip.mp4' }, '/test/fixtures/missing-v114.svg'], { fit: 'fill' });
    expectFilled(1.5, 'image');
    lb.next();
    await until(() => !$('.td-lightbox__video').hidden);
    expect(overlay().hasAttribute('data-fit-active'), 'video: not active').to.equal(false);
    expect(img().style.getPropertyValue('--td-lb-fit-w')).to.equal('');
    const st = getComputedStyle($('.td-lightbox__stage'));
    expect(st.maxWidth !== '100%' || st.overflow !== 'hidden').to.equal(true);
    lb.next();
    await until(() => !$('.td-lightbox__error').hidden);
    expect(overlay().hasAttribute('data-fit-active'), 'error: not active').to.equal(false);
    expect(img().style.getPropertyValue('--td-lb-fit-w')).to.equal('');
    lb.next();
    await waitImage();
    expect(overlay().hasAttribute('data-fit-active')).to.equal(true);
    expectFilled(1.5, 'back to the image');
  });

  it('fast switching between a portrait and a panorama: the final size matches the final image', async () => {
    await setViewport({ width: 1280, height: 800 });
    const lb = await openReady([PORTRAIT, PANORAMA], { fit: 'fill' });
    expectFilled(2 / 3, 'portrait');
    lb.next();
    lb.next();
    lb.next(); // → the panorama
    await waitImage(PANORAMA);
    await raf();
    expectFilled(3, 'panorama');
    lb.next(); // → the portrait, sized from ITS preload (never the img still showing the panorama)
    await waitImage(PORTRAIT);
    expectFilled(2 / 3, 'portrait again');
  });
});

describe("v0.114.0 td-lightbox sheet: 'stack' + handle.setSheet / sheetOpen", () => {
  it('390 × 844: closed = peek; setSheet(true) opens it below the image (never over it), image ≥ 40 % of the height', async () => {
    await setViewport({ width: 390, height: 844 });
    const lb = await openReady(smalls(3), { sheet: 'stack', panel: longPanel });
    expect(overlay().getAttribute('data-sheet-mode')).to.equal('stack');
    const panel = $('.td-lightbox__panel');
    const grab = $('.td-lightbox__grab');
    expect(Math.abs(rect(panel).height - rect(grab).height) <= 1, `closed ${rect(panel).height} vs grab ${rect(grab).height}`).to.equal(true);
    expect(Math.abs(rect(panel).bottom - 844) <= 1, 'at the bottom').to.equal(true);
    expect(lb.sheetOpen).to.equal(false);
    expect(overlaps(rect(img()), rect(panel))).to.equal(false);
    lb.setSheet(true);
    expect(lb.sheetOpen).to.equal(true);
    await settle();
    const pr = rect(panel);
    expect(pr.height > 200, `open ${pr.height}`).to.equal(true);
    expect(overlaps(rect(img()), pr), 'image ∩ panel').to.equal(false);
    expect(overlaps(rect($('.td-lightbox__col')), pr), 'column ∩ panel').to.equal(false);
    expect(rect($('.td-lightbox__col')).height >= 0.4 * 844 - 1, `image area ${rect($('.td-lightbox__col')).height}`).to.equal(true);
    // the panel is its own scrollport
    expect(panel.scrollHeight > panel.clientHeight).to.equal(true);
    panel.scrollTop = 80;
    expect(panel.scrollTop > 0).to.equal(true);
    // the grabber toggles it
    grab.click();
    expect(lb.sheetOpen).to.equal(false);
    await settle();
    expect(Math.abs(rect(panel).height - rect(grab).height) <= 1).to.equal(true);
    grab.click();
    expect(lb.sheetOpen).to.equal(true);
    lb.setSheet(false);
    expect(lb.sheetOpen).to.equal(false);
  });

  it('fill + stack: the image fits again after opening / closing the sheet', async () => {
    await setViewport({ width: 390, height: 844 });
    const lb = await openReady([PORTRAIT, SMALL], { fit: 'fill', sheet: 'stack', panel: longPanel });
    const a = expectFilled(2 / 3, 'closed');
    lb.setSheet(true);
    await settle();
    await until(refitted(2 / 3));
    const b = expectFilled(2 / 3, 'open');
    expect(b.height < a.height - 50, `shrunk ${a.height} → ${b.height}`).to.equal(true);
    expect(overlaps(b, rect($('.td-lightbox__panel')))).to.equal(false);
    lb.setSheet(false);
    await settle();
    await until(refitted(2 / 3));
    const c = expectFilled(2 / 3, 'closed again');
    expect(Math.abs(c.height - a.height) <= 1).to.equal(true);
  });

  it('a slide without a panel ↔ with a panel, setPanel(null) / setPanel(fn): data-sheet-mode follows; scrollTop back to 0', async () => {
    await setViewport({ width: 390, height: 844 });
    const panelFn = (ctx) => (ctx.index === 0 ? null : longPanel());
    const lb = await openReady(smalls(3), { sheet: 'stack', panel: panelFn });
    expect(overlay().hasAttribute('data-sheet-mode')).to.equal(false);
    lb.setSheet(true); // no panel → no-op
    expect(lb.sheetOpen).to.equal(false);
    lb.next();
    await waitImage();
    expect(overlay().getAttribute('data-sheet-mode')).to.equal('stack');
    lb.setSheet(true);
    await settle();
    const panel = $('.td-lightbox__panel');
    panel.scrollTop = 120;
    expect(panel.scrollTop > 0).to.equal(true);
    lb.next();
    await waitImage();
    expect(panel.scrollTop).to.equal(0);
    expect(overlaps(rect(img()), rect(panel))).to.equal(false);
    lb.setPanel(null);
    expect(overlay().hasAttribute('data-sheet-mode') || overlay().hasAttribute('data-panel')).to.equal(false);
    expect(lb.sheetOpen).to.equal(false);
    lb.setPanel(panelFn);
    expect(overlay().getAttribute('data-sheet-mode')).to.equal('stack');
    expect(lb.sheetOpen, 're-enabled → closed').to.equal(false);
    await settle();
    expect(overlaps(rect(img()), rect(panel))).to.equal(false);
  });

  it('≥ 1024: stack has no effect (the panel column as before)', async () => {
    await setViewport({ width: 1280, height: 800 });
    await openReady(smalls(2), { sheet: 'stack', panel: shortPanel });
    const pr = rect($('.td-lightbox__panel'));
    expect(Math.abs(pr.height - 800) <= 1 && pr.left > 800).to.equal(true);
  });

  it('default sheet (overlay) unchanged: the open sheet covers the image area; setSheet / sheetOpen work there too', async () => {
    await setViewport({ width: 390, height: 844 });
    const lb = await openReady(smalls(3), { panel: longPanel });
    expect(overlay().hasAttribute('data-sheet-mode')).to.equal(false);
    lb.setSheet(true);
    expect(lb.sheetOpen).to.equal(true);
    expect($('.td-lightbox__panel').getAttribute('data-sheet')).to.equal('open');
    await settle();
    expect(overlaps(rect($('.td-lightbox__col')), rect($('.td-lightbox__panel'))), 'overlay sheet over the column').to.equal(true);
    lb.setSheet(false);
    expect(lb.sheetOpen).to.equal(false);
  });

  it('dead handle: sheetOpen false, setSheet never throws; no panel: setSheet(true) does nothing', async () => {
    await setViewport({ width: 390, height: 844 });
    const lb = await openReady(smalls(2));
    lb.setSheet(true);
    expect(lb.sheetOpen).to.equal(false);
    expect($('.td-lightbox__panel').hasAttribute('data-sheet')).to.equal(false);
    const dead = await openReady(smalls(2), { panel: shortPanel });
    dead.setSheet(true);
    expect(dead.sheetOpen).to.equal(true);
    TdLightbox.close();
    expect(dead.sheetOpen).to.equal(false);
    expect(() => dead.setSheet(true)).to.not.throw();
    expect(lb.sheetOpen).to.equal(false);
  });
});
