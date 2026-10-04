// v0.36.0 (owner bug + Codex think-about) — a MOUSE press outside a lightbox-internal menu (Download variants, "Thêm")
// only dismisses the menu: no zoom, no pan, no close; focus back on the menu's trigger; the next click works as usual.
// Another popup trigger still opens in ONE press; touch stays pass-through; TdMenu's default (D5) is unchanged.
// Chromium + Firefox + WebKit, real mouse (sendMouse); waits on real signals.
import { expect } from '@esm-bundle/chai';
import { sendMouse, resetMouse, setViewport } from '@web/test-runner-commands';
import { TdLightbox } from './td-lightbox.js';
import { TdMenu } from './td-menu.js';

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
async function until(cond, n = 180) {
  for (let i = 0; i < n && !cond(); i++) await raf();
  return cond();
}
const overlay = () => document.querySelector('.td-lightbox');
const $ = (sel) => overlay().querySelector(sel);
const menuOpen = () => document.querySelector('.td-menu[data-state="open"]');
const IMG = (n) => `/test/fixtures/${n}.svg`;
const mid = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
async function clickAt([x, y]) {
  await sendMouse({ type: 'click', position: [x, y] });
  await raf();
}
async function openReady() {
  TdLightbox.open([{ src: IMG(1) }, { src: IMG(2) }], {
    downloads: (item) => [{ label: 'Gốc', url: item.src }, { label: 'Nhỏ', url: item.src }],
    toolbar: [{ id: 'more-x', label: 'Chia sẻ', icon: 'link', onClick: (ctx, b) => TdMenu.open(b, [{ label: 'Copy link' }]) }],
  });
  const img = $('.td-lightbox__img');
  for (let i = 0; i < 300 && !(img.complete && img.naturalWidth > 0); i++) await raf();
  await img.decode().catch(() => {});
  await until(() => overlay().getAttribute('data-state') === 'open', 300);
  await settle();
}

before(async () => { await setViewport({ width: 1280, height: 800 }); });
afterEach(async () => {
  TdMenu.close();
  TdLightbox.close();
  await resetMouse();
  await settle();
});

describe('v0.36.0 lightbox menus: an outside mouse press only dismisses', () => {
  it('Download menu open → click on the image: menu closed, NOT zoomed, focus on the trigger; the next click zooms', async () => {
    await openReady();
    const dl = $('[data-action="downloads"]');
    await clickAt(mid(dl));
    await until(() => menuOpen());
    expect(!!menuOpen(), 'menu open').to.equal(true);
    await clickAt(mid($('.td-lightbox__img')));
    await until(() => !menuOpen());
    for (let i = 0; i < 6; i++) await raf();
    expect(!!menuOpen()).to.equal(false);
    expect(overlay().hasAttribute('data-zoomed'), 'no zoom from the dismissing press').to.equal(false);
    expect(overlay().getAttribute('data-state'), 'viewer still open').to.equal('open');
    expect(document.activeElement === dl, 'focus back on the trigger').to.equal(true);
    await clickAt(mid($('.td-lightbox__img')));
    expect(await until(() => overlay().hasAttribute('data-zoomed')), 'the next click zooms').to.equal(true);
  });

  it('Download menu open → click on another popup trigger (an extra button that opens a menu): switches in one press', async () => {
    await openReady();
    await clickAt(mid($('[data-action="downloads"]')));
    await until(() => menuOpen());
    const other = $('[data-extra="more-x"]');
    other.setAttribute('aria-haspopup', 'menu'); // a popup trigger (its click opens a TdMenu)
    await clickAt(mid(other));
    expect(await until(() => menuOpen() && menuOpen().textContent.includes('Copy link')), 'the other menu opened').to.equal(true);
  });

  it('touch: a tap outside closes the menu and the press passes through (unchanged)', async () => {
    await openReady();
    await clickAt(mid($('[data-action="downloads"]')));
    await until(() => menuOpen());
    const target = $('.td-lightbox__col');
    let reached = false;
    target.addEventListener('pointerdown', () => { reached = true; }, { once: true });
    const [x, y] = mid($('.td-lightbox__img'));
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, pointerId: 31,
      pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
    target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, composed: true, pointerId: 31,
      pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
    await raf();
    expect(!!menuOpen()).to.equal(false);
    expect(reached, 'pass-through').to.equal(true);
  });

  it('TdMenu default (outside the lightbox) keeps D5: the press continues', async () => {
    const b = document.createElement('button');
    b.textContent = 'M';
    const out = document.createElement('button');
    out.textContent = 'Ngoài';
    document.body.append(b, out);
    let clicked = false;
    out.addEventListener('click', () => { clicked = true; });
    try {
      TdMenu.open(b, [{ label: 'A' }]);
      await until(() => menuOpen());
      await clickAt(mid(out));
      expect(!!menuOpen()).to.equal(false);
      expect(clicked, 'D5: the outside click still happens').to.equal(true);
    } finally {
      b.remove();
      out.remove();
    }
  });
});
