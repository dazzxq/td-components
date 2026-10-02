// v0.24.0 — lightbox side navigation, adjacent preload, error state, optional filmstrip, slide transition.
// Plan: docs/internal/plans/v0.24.0-lightbox-nav.md (N1–N5).
import { expect } from '@esm-bundle/chai';
import { setViewport, sendMouse, resetMouse, emulateMedia } from '@web/test-runner-commands';
import { TdLightbox } from './td-lightbox.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const IMG = (n) => `/test/fixtures/${n}.svg`;
const MISSING = '/test/fixtures/missing-v024.svg';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const overlay = () => document.querySelector('.td-lightbox');
const $ = (sel) => overlay().querySelector(sel);
const $$ = (sel) => [...overlay().querySelectorAll(sel)];
const prev = () => $('[data-action="prev"]');
const next = () => $('[data-action="next"]');
const rect = (el) => el.getBoundingClientRect();
const mid = (r) => [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
const key = (k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const near = (a, b, tol, msg) => expect(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`).to.equal(true);
const overlaps = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
const pe = (type, x, y, extra = {}) => new PointerEvent(type, {
  bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 21, pointerType: 'touch', isPrimary: true, ...extra,
});
const many = (n) => Array.from({ length: n }, (_, i) => IMG((i % 4) + 1));

async function openReady(items, opts) {
  const lb = TdLightbox.open(items, opts);
  for (let i = 0; i < 100 && getComputedStyle(overlay()).visibility !== 'visible'; i++) await wait(10);
  await wait(120);
  return lb;
}

const OrigImage = window.Image;
/** Fake Image: records every requested src; loads (async) automatically unless `manual`. */
function fakeImages({ manual = false, fail = () => false } = {}) {
  const made = [];
  window.Image = class {
    constructor() { made.push(this); this._src = ''; this.onload = null; this.onerror = null; }
    set src(v) {
      this._src = v;
      if (!v || manual) return;
      setTimeout(() => { const cb = fail(v) ? this.onerror : this.onload; if (cb) cb(); }, 0);
    }
    get src() { return this._src; }
  };
  return made;
}

afterEach(async () => {
  window.Image = OrigImage;
  TdLightbox.close();
  document.documentElement.removeAttribute('dir');
  await resetMouse();
  await emulateMedia({ reducedMotion: 'no-preference' });
  await setViewport({ width: 800, height: 600 });
  await wait(30);
});

describe('v0.24.0 N1 — side navigation (mouse)', () => {
  it('runs on a fine pointer (precondition)', () => {
    expect(matchMedia('(hover: hover) and (pointer: fine)').matches).to.equal(true);
  });

  for (const w of [800, 1200, 1800]) {
    it(`strip geometry at a ${w}px column: clamp(64px, 15%, 240px), below the toolbar to 56px above the bottom`, async () => {
      await setViewport({ width: w, height: 800 });
      await openReady([IMG(1), IMG(2), IMG(3)]);
      expect(overlay().getAttribute('data-nav')).to.equal('side');
      const col = rect($('.td-lightbox__col'));
      const nav = $('.td-lightbox__nav');
      expect(!!nav && nav.parentElement === $('.td-lightbox__col'), 'nav mount inside the column').to.equal(true);
      expect(prev().parentElement === nav && next().parentElement === nav, 'buttons moved to the nav mount').to.equal(true);
      expect($('.td-lightbox__toolbar').contains(prev()), 'toolbar no longer holds prev').to.equal(false);
      const want = Math.min(240, Math.max(64, col.width * 0.15));
      const p = rect(prev());
      const n = rect(next());
      near(p.width, want, 1, 'prev width');
      near(n.width, want, 1, 'next width');
      near(p.left, col.left, 1, 'prev at the start edge');
      near(n.right, col.right, 1, 'next at the end edge');
      near(p.top, rect($('.td-lightbox__toolbar')).bottom + 8, 1.5, 'top below the toolbar');
      near(p.bottom, col.bottom - 56, 1.5, 'bottom 56px above the column bottom');
    });
  }

  it('a click on the inner / outer edge of each strip navigates (wrapping), never zooms', async () => {
    const lb = await openReady([IMG(1), IMG(2), IMG(3)]);
    const n = rect(next());
    const p = rect(prev());
    const y = Math.round(n.top + n.height / 2);
    await sendMouse({ type: 'click', position: [Math.round(n.right - 3), y] }); // outer edge
    expect(lb.index).to.equal(1);
    await sendMouse({ type: 'click', position: [Math.round(n.left + 3), y] }); // inner edge
    expect(lb.index).to.equal(2);
    await sendMouse({ type: 'click', position: [Math.round(n.left + 3), y] });
    expect(lb.index, 'wraps').to.equal(0);
    await sendMouse({ type: 'click', position: [Math.round(p.left + 3), y] });
    expect(lb.index).to.equal(2);
    await sendMouse({ type: 'click', position: [Math.round(p.right - 3), y] });
    expect(lb.index).to.equal(1);
    expect(overlay().hasAttribute('data-zoomed')).to.equal(false);
    expect(TdLightbox.isOpen).to.equal(true);
  });

  it('a click in the middle of the image zooms 2× (the viewer stays open), a second click zooms out', async () => {
    const lb = await openReady([IMG(1), IMG(2)]);
    const [x, y] = mid(rect($('.td-lightbox__img')));
    await sendMouse({ type: 'click', position: [x, y] });
    expect(overlay().hasAttribute('data-zoomed')).to.equal(true);
    expect($('.td-lightbox__img').style.transform).to.contain('scale(2)');
    expect(TdLightbox.isOpen, 'a real click on the image never closes').to.equal(true);
    await wait(400);
    await sendMouse({ type: 'click', position: [x, y] });
    expect(overlay().hasAttribute('data-zoomed')).to.equal(false);
    expect(lb.index).to.equal(0);
  });

  it('a drag > 8px released inside a strip does not navigate', async () => {
    const lb = await openReady([IMG(1), IMG(2), IMG(3)]);
    const n = rect(next());
    const x = Math.round(n.left + n.width / 2);
    const y = Math.round(n.top + n.height / 2);
    await sendMouse({ type: 'move', position: [x, y] });
    await sendMouse({ type: 'down' });
    await sendMouse({ type: 'move', position: [x, y + 20] });
    await sendMouse({ type: 'up' });
    expect(lb.index).to.equal(0);
  });

  it('zoomed: the strips collapse to 48px discs, hover still pans, a disc click navigates and resets the zoom', async () => {
    const lb = await openReady([IMG(1), IMG(2), IMG(3)]);
    const [x, y] = mid(rect($('.td-lightbox__img')));
    await sendMouse({ type: 'click', position: [x, y] });
    expect(overlay().hasAttribute('data-zoomed')).to.equal(true);
    const d = rect(next());
    near(d.width, 48, 0.5, 'disc width');
    near(d.height, 48, 0.5, 'disc height');
    const col = rect($('.td-lightbox__col'));
    await sendMouse({ type: 'move', position: [Math.round(col.right - 20), Math.round(col.top + 120)] }); // where the strip was
    const t1 = $('.td-lightbox__img').style.transform;
    await sendMouse({ type: 'move', position: [Math.round(col.right - 20), Math.round(col.bottom - 80)] });
    const t2 = $('.td-lightbox__img').style.transform;
    expect(t1 !== t2, `hover pans (${t1} → ${t2})`).to.equal(true);
    await sendMouse({ type: 'click', position: mid(rect(next())) });
    expect(lb.index).to.equal(1);
    expect(overlay().hasAttribute('data-zoomed')).to.equal(false);
  });

  it('touch / pen never activate a side strip; a swipe starting in a strip navigates once; swipe-down closes', async () => {
    const lb = await openReady([IMG(1), IMG(2), IMG(3)]);
    const [x, y] = mid(rect(next()));
    for (const pointerType of ['touch', 'pen']) {
      next().dispatchEvent(pe('pointerdown', x, y, { pointerType }));
      next().dispatchEvent(pe('pointerup', x, y, { pointerType }));
      next().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, clientX: x, clientY: y }));
      expect(lb.index, `${pointerType} tap on the strip`).to.equal(0);
      await wait(350); // two taps in a row would be a double-tap zoom
    }
    next().dispatchEvent(pe('pointerdown', x, y));
    next().dispatchEvent(pe('pointermove', x - 60, y + 2));
    next().dispatchEvent(pe('pointerup', x - 120, y + 2));
    next().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    expect(lb.index, 'swipe = exactly one step').to.equal(1);
    prev().dispatchEvent(pe('pointerdown', x, y - 100));
    prev().dispatchEvent(pe('pointermove', x + 2, y - 40));
    prev().dispatchEvent(pe('pointerup', x + 2, y + 30));
    await wait(260);
    expect(TdLightbox.isOpen).to.equal(false);
  });

  it('keyboard activation of a strip button still navigates', async () => {
    const lb = await openReady([IMG(1), IMG(2)]);
    next().click(); // Enter / Space → click with detail 0
    expect(lb.index).to.equal(1);
  });

  function playerHook(width, delay = 0) {
    return (item, mount) => {
      const make = () => {
        const p = document.createElement('div');
        p.className = 'fake-player';
        p.style.setProperty('width', `${width}px`);
        p.style.setProperty('height', '180px');
        p.style.setProperty('background', '#333');
        mount.appendChild(p);
        return { destroy() { p.remove(); } };
      };
      return delay ? new Promise((r) => setTimeout(() => r(make()), delay)) : make();
    };
  }

  it('video: 48px discs beside the player (never over it); a column too narrow → toolbar', async () => {
    const items = [{ type: 'video', src: '/v.mp4' }, IMG(1)];
    await openReady(items, { video: playerHook(320) });
    expect(overlay().getAttribute('data-nav')).to.equal('side-compact');
    const player = rect($('.fake-player'));
    for (const b of [prev(), next()]) {
      const r = rect(b);
      near(r.width, 48, 0.5, 'disc');
      expect(overlaps(r, player), 'disc never over the player').to.equal(false);
    }
    TdLightbox.close();
    await openReady(items, { video: playerHook(700) });
    expect(overlay().getAttribute('data-nav')).to.equal('toolbar');
    expect($('.td-lightbox__toolbar').contains(next())).to.equal(true);
  });

  it('video: an async player mounted after 300ms (no window resize) switches the mode', async () => {
    await openReady([{ type: 'video', src: '/v.mp4' }, IMG(1)], { video: playerHook(700, 300) });
    expect(overlay().getAttribute('data-nav')).to.equal('side-compact');
    await wait(400);
    await frames();
    expect(overlay().getAttribute('data-nav')).to.equal('toolbar');
  });

  it('panel mode: the strips stay inside the image column', async () => {
    await setViewport({ width: 1280, height: 800 });
    await openReady([IMG(1), IMG(2)], { panel: () => document.createElement('p') });
    const panel = rect($('.td-lightbox__panel'));
    const col = rect($('.td-lightbox__col'));
    expect(rect(next()).right <= panel.left + 0.5).to.equal(true);
    near(rect(prev()).left, col.left, 1, 'prev at the column start');
  });

  it('one item: both hidden; Tab sees exactly one prev and one next (no aria-hidden clones)', async () => {
    await openReady([IMG(1)]);
    expect(prev().hidden && next().hidden).to.equal(true);
    TdLightbox.close();
    await openReady([IMG(1), IMG(2)]);
    expect($$('[data-action="prev"]').length).to.equal(1);
    expect($$('[data-action="next"]').length).to.equal(1);
    expect($$('[aria-label="Ảnh trước"]').length).to.equal(1);
    expect($$('[aria-label="Ảnh sau"]').length).to.equal(1);
    expect(prev().closest('[aria-hidden="true"]')).to.equal(null);
    prev().focus();
    expect(document.activeElement === prev()).to.equal(true);
  });

  it('counter is a polite atomic live region', async () => {
    const lb = await openReady([IMG(1), IMG(2), IMG(3)]);
    const c = $('.td-lightbox__counter');
    expect(c.getAttribute('role')).to.equal('status');
    expect(c.getAttribute('aria-live')).to.equal('polite');
    expect(c.getAttribute('aria-atomic')).to.equal('true');
    lb.next();
    expect(c.textContent).to.equal('2 / 3');
  });

  it('RTL: prev at inline-start (right), next at inline-end (left); ArrowLeft = next', async () => {
    document.documentElement.setAttribute('dir', 'rtl');
    const lb = await openReady([IMG(1), IMG(2), IMG(3)]);
    const col = rect($('.td-lightbox__col'));
    near(rect(prev()).right, col.right, 1, 'prev on the right');
    near(rect(next()).left, col.left, 1, 'next on the left');
    key('ArrowLeft');
    expect(lb.index).to.equal(1);
    key('ArrowRight');
    expect(lb.index).to.equal(0);
  });

  it('a horizontal drag in the filmstrip never moves the gallery (pan-x, excluded from gestures)', async () => {
    const lb = await openReady(many(20), { filmstrip: true });
    const strip = $('.td-lightbox__filmstrip');
    expect(getComputedStyle(strip).touchAction).to.equal('pan-x');
    const [x, y] = mid(rect(strip));
    strip.dispatchEvent(pe('pointerdown', x, y));
    strip.dispatchEvent(pe('pointermove', x - 80, y));
    strip.dispatchEvent(pe('pointerup', x - 160, y));
    strip.dispatchEvent(pe('pointerdown', x, y - 5));
    strip.dispatchEvent(pe('pointermove', x, y + 60));
    strip.dispatchEvent(pe('pointerup', x, y + 140));
    await wait(260);
    expect(TdLightbox.isOpen).to.equal(true);
    expect(lb.index).to.equal(0);
    expect(overlay().hasAttribute('data-dragging')).to.equal(false);
  });
});

describe('v0.24.0 N2 — adjacent preload', () => {
  it('after the current image loads, the previous and next images are requested (wrapping), never a video', async () => {
    const made = fakeImages();
    await openReady([{ type: 'video', src: '/v.mp4', poster: IMG(4) }, IMG(1), IMG(2), IMG(3)], { index: 1, video: () => null });
    const srcs = made.map((i) => i.src);
    expect(srcs).to.include(IMG(2));
    expect(srcs.some((s) => s.includes('v.mp4') || s === IMG(4)), `no video request (${srcs})`).to.equal(false);
    TdLightbox.close();
    made.length = 0;
    await openReady([IMG(1), IMG(2), IMG(3)], { index: 0 });
    const s2 = made.map((i) => i.src);
    expect(s2).to.include(IMG(2));
    expect(s2, 'wraps to the last').to.include(IMG(3));
  });

  it('Save-Data → no preload; close drops the references', async () => {
    Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
    try {
      const made = fakeImages();
      await openReady([IMG(1), IMG(2), IMG(3)], { index: 1 });
      expect(made.map((i) => i.src)).to.deep.equal([IMG(2)]);
    } finally {
      delete navigator.connection;
    }
    const made = fakeImages();
    await openReady([IMG(1), IMG(2), IMG(3)], { index: 1 });
    const pre = made.filter((i) => i.src === IMG(1) || i.src === IMG(3));
    expect(pre.length).to.equal(2);
    TdLightbox.close();
    expect(pre.every((i) => i.src === ''), 'cancelled on close').to.equal(true);
  });
});

describe('v0.24.0 N3 — image error state', () => {
  it('a failed image shows an alert with Retry / Next; Retry reloads; navigating hides it', async () => {
    const made = [];
    window.Image = function Img() { const i = new OrigImage(); made.push(i); return i; };
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); // focus on <body>
    const lb = await openReady([MISSING, IMG(2)]);
    await wait(150);
    const err = $('.td-lightbox__error');
    expect(!!err && !err.hidden, 'error block shown').to.equal(true);
    expect(err.getAttribute('role')).to.equal('alert');
    expect(err.textContent).to.contain('Không tải được ảnh');
    const retry = err.querySelector('[data-action="retry"]');
    const nx = err.querySelector('[data-action="error-next"]');
    expect(retry.textContent).to.equal('Thử lại');
    expect(nx.hidden).to.equal(false);
    expect(nx.textContent).to.equal('Ảnh sau');
    expect(document.activeElement === retry, 'Retry takes focus').to.equal(true);
    const before = made.filter((i) => i.src.includes('missing-v024')).length;
    retry.click();
    await wait(150);
    expect(made.filter((i) => i.src.includes('missing-v024')).length).to.equal(before + 1);
    expect(err.hidden, 'still failing → shown again').to.equal(false);
    nx.click();
    expect(lb.index).to.equal(1);
    expect(err.hidden).to.equal(true);
    await wait(150);
    expect(err.hidden).to.equal(true);
  });

  it('single failed item: no Next; labels are configurable and rendered as text', async () => {
    await openReady([MISSING], { labels: { loadError: '<b>Lỗi</b>', retry: 'Tải lại' } });
    await wait(150);
    const err = $('.td-lightbox__error');
    expect(err.hidden).to.equal(false);
    expect(err.querySelector('[data-action="error-next"]').hidden).to.equal(true);
    expect(err.textContent).to.contain('<b>Lỗi</b>');
    expect(err.querySelector('b')).to.equal(null);
    expect(err.querySelector('[data-action="retry"]').textContent).to.equal('Tải lại');
  });
});

describe('v0.24.0 N4 — filmstrip', () => {
  it('off by default; true → one thumb per item with aria-current, click navigates', async () => {
    await openReady([IMG(1), IMG(2), IMG(3)]);
    const s = $('.td-lightbox__filmstrip');
    expect(!s || s.hidden).to.equal(true);
    expect(overlay().hasAttribute('data-filmstrip')).to.equal(false);
    TdLightbox.close();
    const lb = await openReady([IMG(1), IMG(2), IMG(3)], { filmstrip: true });
    const thumbs = $$('.td-lightbox__thumb');
    expect(thumbs.length).to.equal(3);
    expect(thumbs[0].getAttribute('aria-current')).to.equal('true');
    expect(thumbs[0].getAttribute('aria-label')).to.equal('Ảnh 1');
    expect(thumbs[0].tagName).to.equal('BUTTON');
    expect(thumbs[0].querySelector('img').getAttribute('alt')).to.equal('');
    thumbs[2].click();
    expect(lb.index).to.equal(2);
    expect(thumbs[2].getAttribute('aria-current')).to.equal('true');
    expect(thumbs[0].hasAttribute('aria-current')).to.equal(false);
  });

  it('scrolls the current thumb to the centre of the strip', async () => {
    const lb = await openReady(many(30), { filmstrip: true });
    lb.goTo(20);
    await wait(700);
    const strip = rect($('.td-lightbox__filmstrip'));
    const t = rect($$('.td-lightbox__thumb')[20]);
    near(t.left + t.width / 2, strip.left + strip.width / 2, 40, 'current thumb centred');
  });

  it("'auto': < 8 items → none, ≥ 8 → shown; one item → never; bind() passes the option", async () => {
    await openReady(many(7), { filmstrip: 'auto' });
    expect(overlay().hasAttribute('data-filmstrip')).to.equal(false);
    TdLightbox.close();
    await openReady(many(8), { filmstrip: 'auto' });
    expect(overlay().hasAttribute('data-filmstrip')).to.equal(true);
    TdLightbox.close();
    await openReady([IMG(1)], { filmstrip: true });
    expect(overlay().hasAttribute('data-filmstrip')).to.equal(false);
    TdLightbox.close();
    const host = document.createElement('div');
    host.innerHTML = `<div data-td-lightbox-group><a data-td-lightbox-item href="${IMG(1)}" id="v24a">a</a><a data-td-lightbox-item href="${IMG(2)}">b</a></div>`;
    document.body.appendChild(host);
    const un = TdLightbox.bind(host, { filmstrip: true });
    try {
      document.getElementById('v24a').click();
      expect($$('.td-lightbox__thumb').length).to.equal(2);
    } finally { un(); host.remove(); }
  });

  it('thumb URLs: item.thumb through isAllowedUrl (rejected → src); video → poster + play mark; no poster → placeholder', async () => {
    const isAllowedUrl = (u) => !u.includes('bad');
    await openReady([
      { src: IMG(1), thumb: IMG(3) },
      { src: IMG(2), thumb: '/bad.svg' },
      { type: 'video', src: '/v.mp4', poster: IMG(4) },
      { type: 'video', src: '/w.mp4' },
    ], { filmstrip: true, isAllowedUrl, video: () => null });
    const t = $$('.td-lightbox__thumb');
    expect(t[0].querySelector('img').getAttribute('src')).to.equal(IMG(3));
    expect(t[1].querySelector('img').getAttribute('src')).to.equal(IMG(2));
    expect(t[2].querySelector('img').getAttribute('src')).to.equal(IMG(4));
    expect(!!t[2].querySelector('.td-lightbox__thumb-play')).to.equal(true);
    expect(t[3].querySelector('img')).to.equal(null);
    expect(!!t[3].querySelector('.td-lightbox__thumb-ph .td-lightbox__thumb-play')).to.equal(true);
    expect(t[3].getAttribute('aria-label')).to.equal('Ảnh 4');
    expect(t[3].querySelector('.td-lightbox__thumb-play').getAttribute('aria-hidden')).to.equal('true');
  });

  const cap = 'Một chú thích rất dài để kiểm tra bố cục khi có dải ảnh nhỏ bên dưới. '.repeat(8);
  for (const [w, h, panel] of [[1280, 800, false], [390, 844, false], [1280, 800, true]]) {
    it(`layout ${w}×${h}${panel ? ' panel' : ''}: image, caption and filmstrip never overlap or overflow`, async () => {
      await setViewport({ width: w, height: h });
      const items = many(12).map((src) => ({ src, caption: cap }));
      await openReady(items, { filmstrip: true, panel: panel ? () => document.createElement('p') : undefined });
      await wait(200);
      const img = rect($('.td-lightbox__img'));
      const strip = rect($('.td-lightbox__filmstrip'));
      const capEl = $('.td-lightbox__caption');
      const boxes = [['img', img], ['strip', strip]];
      if (getComputedStyle(capEl).display !== 'none') boxes.push(['caption', rect(capEl)]);
      for (const [name, r] of boxes) {
        expect(r.width > 0 && r.height > 0, `${name} rendered`).to.equal(true);
        expect(r.left >= -0.5 && r.top >= -0.5 && r.right <= w + 0.5 && r.bottom <= h + 0.5, `${name} inside the viewport`).to.equal(true);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlaps(boxes[i][1], boxes[j][1]), `${boxes[i][0]} × ${boxes[j][0]}`).to.equal(false);
        }
      }
      if (panel) expect(strip.right <= rect($('.td-lightbox__panel')).left + 0.5, 'strip in the image column').to.equal(true);
    });
  }
});

describe('v0.24.0 N5 — slide transition', () => {
  function watchSlide() {
    const seen = [];
    const mo = new MutationObserver(() => {
      const v = $('.td-lightbox__stage').getAttribute('data-slide');
      if (v) seen.push(v);
    });
    mo.observe($('.td-lightbox__stage'), { attributes: true, attributeFilter: ['data-slide'] });
    return { seen, stop: () => mo.disconnect() };
  }

  it('direction follows next / prev / keys and the stage slides back to rest', async () => {
    const lb = await openReady([IMG(1), IMG(2), IMG(3)]);
    const w = watchSlide();
    lb.next();
    await wait(80);
    lb.prev();
    await wait(80);
    w.stop();
    expect(w.seen).to.deep.equal(['next', 'prev']);
    await frames();
    expect($('.td-lightbox__stage').hasAttribute('data-slide')).to.equal(false);
  });

  it('starts only when the new image is displayable; 3 fast steps → only the last slides', async () => {
    const lb = await openReady([IMG(1), IMG(2), IMG(3), IMG(4)]);
    const made = fakeImages({ manual: true });
    const w = watchSlide();
    lb.next();
    await frames();
    expect(w.seen.length, 'not while loading').to.equal(0);
    const pre = made.find((i) => i.src === IMG(2));
    pre.onload();
    await Promise.resolve(); // MutationObserver delivery
    expect(w.seen).to.deep.equal(['next']);
    w.seen.length = 0;
    lb.next(); lb.next(); lb.next();
    for (const i of made) if (i.onload && i.src) i.onload();
    await Promise.resolve();
    w.stop();
    expect(w.seen).to.deep.equal(['next']);
    expect($('.td-lightbox__img').getAttribute('src')).to.equal(IMG(1)); // index 4 → wraps to item 0
  });

  it('a thumbnail / goTo backwards → prev (shortest wrapped path)', async () => {
    const lb = await openReady([IMG(1), IMG(2), IMG(3), IMG(4), IMG(1)], { filmstrip: true, index: 3 });
    const w = watchSlide();
    $$('.td-lightbox__thumb')[1].click();
    await wait(80);
    lb.goTo(4); // 1 → 4 forward is 3 steps, backwards (wrapping) 2 → prev
    await wait(80);
    w.stop();
    expect(w.seen).to.deep.equal(['prev', 'prev']);
  });

  it('prefers-reduced-motion → no slide', async () => {
    await emulateMedia({ reducedMotion: 'reduce' });
    const lb = await openReady([IMG(1), IMG(2)]);
    const w = watchSlide();
    lb.next();
    await wait(80);
    w.stop();
    expect(w.seen.length).to.equal(0);
    expect(getComputedStyle($('.td-lightbox__stage')).transitionDuration.split(',').every((d) => parseFloat(d) === 0)).to.equal(true);
  });
});
