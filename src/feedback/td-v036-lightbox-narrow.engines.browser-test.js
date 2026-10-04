// v0.36.0 (plan docs/internal/plans/v0.36.0-polish.md QĐ 59) — td-lightbox below 480 px in Chromium, Firefox AND WebKit:
// (revised 2026-10-05: ‹ › + the counter move to the bottom rail — td-v036-lightbox-rail) the toolbar moves fullscreen +
// unpinned extras into a "Thêm" menu
// button (TdMenu, APG menu button); download, close and the first `pinned: true` extra (panel toggle) stay. Geometry
// gate: the lead (back + counter) and the toolbar never intersect at 360 / 393 / 430 / 768, the counter is visible and
// not covered. ≥ 480 unchanged (no "Thêm", every control in the toolbar). Only real signals (image decoded, animations
// finished, rAF) — no fixed sleeps. Booleans in assertions (DOM nodes in a failing chai assertion hang the runner).
import { expect } from '@esm-bundle/chai';
import { setViewport, sendKeys } from '@web/test-runner-commands';
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
const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
const overlaps = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
const IMG = (n) => `/test/fixtures/${n}.svg`;
const menu = () => document.querySelector('.td-menu[data-state="open"]');
const key = (k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

async function openReady(items, opts) {
  const lb = TdLightbox.open(items, opts);
  await raf();
  const img = $('.td-lightbox__img');
  for (let i = 0; i < 300 && !(img.complete && img.naturalWidth > 0); i++) await raf();
  await img.decode().catch(() => {});
  for (let i = 0; i < 300 && overlay().getAttribute('data-state') !== 'open'; i++) await raf();
  await settle();
  return lb;
}

/** The demo / audit setup: panel on + pinned panel toggle + one plain extra + download, 4 (or n) captioned items. */
function panelSetup(n = 4) {
  const info = (ctx) => {
    const p = document.createElement('p');
    p.textContent = `Ảnh ${ctx.index + 1}`;
    return p;
  };
  let on = true;
  const items = Array.from({ length: n }, (_, i) => ({ src: IMG((i % 4) + 1), caption: `Ảnh mẫu ${i + 1}` }));
  return [items, {
    panel: info,
    download: (item) => item.src,
    toolbar: [
      { id: 'info', label: 'Bật/tắt thông tin', icon: 'info', pinned: true,
        onClick: (ctx) => { on = !on; ctx.handle.setPanel(on ? info : false); } },
      { id: 'cover', label: 'Đặt làm ảnh bìa', icon: 'star', onClick: (ctx, b) => b.toggleAttribute('data-on') },
    ],
  }];
}

/** Waits (rAF-paced, bounded) until `cond()` holds. */
async function until(cond, n = 120) {
  for (let i = 0; i < n && !cond(); i++) await raf();
  return cond();
}

afterEach(async () => {
  if (menu()) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  TdLightbox.close();
  document.documentElement.style.removeProperty('--td-lb-btn');
  await settle();
});
after(async () => { await setViewport({ width: 800, height: 600 }); });

describe('v0.36.0 td-lightbox — narrow toolbar ("Thêm" overflow, QĐ 59)', () => {
  for (const [w, h] of [[360, 780], [393, 852], [430, 932], [768, 1024]]) {
    it(`${w}×${h} panel: lead ∩ toolbar = ∅, counter visible and not covered, toolbar inside the viewport`, async () => {
      await setViewport({ width: w, height: h });
      await openReady(...panelSetup());
      const lead = $('.td-lightbox__lead');
      const bar = $('.td-lightbox__toolbar');
      const counter = $('.td-lightbox__counter');
      expect(overlay().hasAttribute('data-panel'), 'panel mode').to.equal(true);
      expect(shown($('.td-lightbox__back')), 'back button shown').to.equal(true);
      const L = rect(lead);
      const T = rect(bar);
      expect(overlaps(L, T), `lead ${L.left}–${L.right} vs toolbar ${T.left}–${T.right}`).to.equal(false);
      expect(T.left >= -0.5 && T.right <= w + 0.5, `toolbar inside: ${T.left}–${T.right}`).to.equal(true);
      expect(shown(counter) && counter.textContent === '1 / 4', `counter "${counter.textContent}"`).to.equal(true);
      const c = rect(counter);
      const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
      expect(!!hit && counter.contains(hit), 'counter not covered').to.equal(true);
    });
  }

  it('360 with touch-size buttons (44) and a long counter ("12 / 20"): still no intersection', async () => {
    await setViewport({ width: 360, height: 780 });
    document.documentElement.style.setProperty('--td-lb-btn', '44px'); // = the (pointer: coarse) token value
    const [items, opts] = panelSetup(20);
    await openReady(items, { ...opts, index: 11 });
    expect($('.td-lightbox__counter').textContent).to.equal('12 / 20');
    const L = rect($('.td-lightbox__lead'));
    const T = rect($('.td-lightbox__toolbar'));
    expect(overlaps(L, T), `lead ${L.left}–${L.right} vs toolbar ${T.left}–${T.right}`).to.equal(false);
    expect(rect($('[data-action="more"]')).width >= 43.5, '"Thêm" keeps the touch size').to.equal(true);
  });

  it('< 480: toolbar = pinned panel toggle + download + "Thêm" + close; fullscreen / other extras in "Thêm" (‹ › are in the rail)', async () => {
    await setViewport({ width: 360, height: 780 });
    await openReady(...panelSetup());
    const more = $('[data-action="more"]');
    expect(shown(more), '"Thêm" shown').to.equal(true);
    expect(more.getAttribute('aria-label'), 'Vietnamese label').to.equal('Thêm');
    expect(more.getAttribute('aria-haspopup'), 'APG menu button').to.equal('menu');
    expect(more.getAttribute('aria-expanded'), 'collapsed').to.equal('false');
    expect(shown($('[data-extra="info"]')), 'pinned panel toggle stays').to.equal(true);
    expect(shown($('[data-action="download"]')), 'download stays').to.equal(true);
    expect(shown($('[data-action="close"]')), 'close stays').to.equal(true);
    expect(shown($('[data-extra="cover"]')), 'unpinned extra moved to the menu').to.equal(false);
    expect(shown($('[data-action="fullscreen"]')), 'fullscreen moved to the menu').to.equal(false);
    const order = [...$('.td-lightbox__toolbar').children].filter(shown).map((b) => b.dataset.action || b.dataset.extra);
    expect(order.join(','), 'toolbar order').to.equal('download,info,more,close');
    // arrow keys navigate too
    key('ArrowRight');
    expect(await until(() => $('.td-lightbox__counter').textContent === '2 / 4'), 'ArrowRight → 2 / 4').to.equal(true);
  });

  it('< 480: ‹ › are never hidden — the phone rail holds them (revised QĐ 59), even on a video slide', async () => {
    await setViewport({ width: 360, height: 780 });
    await openReady([{ src: IMG(1) }, { src: IMG(2) }, { src: IMG(3) }]);
    await until(() => overlay().getAttribute('data-nav') === 'rail');
    for (const a of ['prev', 'next']) {
      const b = $(`[data-action="${a}"]`);
      expect(b.parentElement === $('.td-lightbox__rail'), `${a} in the rail`).to.equal(true);
      expect(shown(b), `${a} shown`).to.equal(true);
    }
  });

  for (const [k, label] of [['Enter', 'Enter'], [' ', 'Space']]) {
    it(`< 480: "Thêm" opens with ${label}; its items name the overflowed controls and activate them`, async () => {
      await setViewport({ width: 360, height: 780 });
      await openReady(...panelSetup());
      const more = $('[data-action="more"]');
      more.focus();
      await sendKeys({ press: label === 'Space' ? 'Space' : 'Enter' });
      expect(await until(() => !!menu()), `menu opened by ${label}`).to.equal(true);
      expect(more.getAttribute('aria-expanded'), 'expanded').to.equal('true');
      const m = menu();
      expect(m.getAttribute('role')).to.equal('menu');
      const labels = [...m.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent.trim());
      const expected = (document.fullscreenEnabled ? ['Toàn màn hình'] : []).concat('Đặt làm ảnh bìa');
      expect(labels.join('|'), 'overflow items in toolbar order').to.equal(expected.join('|'));
      expect(m.contains(document.activeElement), 'focus moved into the menu').to.equal(true);
      // walk to "Đặt làm ảnh bìa" with the keyboard and activate it with the same key
      for (let i = 0; i < 5 && document.activeElement.textContent.trim() !== 'Đặt làm ảnh bìa'; i++) {
        await sendKeys({ press: 'ArrowDown' });
      }
      await sendKeys({ press: label === 'Space' ? 'Space' : 'Enter' });
      expect(await until(() => !menu()), 'menu closed after selecting').to.equal(true);
      expect($('[data-extra="cover"]').hasAttribute('data-on'), 'the extra ran (toggled on)').to.equal(true);
      expect(document.activeElement === more, 'focus back on "Thêm"').to.equal(true);
      expect(TdLightbox.isOpen, 'viewer still open').to.equal(true);
    });
  }

  it('< 480: no extras and no fullscreen → "Thêm" hidden (nothing to offer)', async () => {
    await setViewport({ width: 360, height: 780 });
    await openReady([IMG(1), IMG(2)]);
    expect(shown($('[data-action="more"]')), '"Thêm" shown').to.equal(document.fullscreenEnabled);
  });

  it('≥ 480 (768): unchanged — no "Thêm", fullscreen + every extra in the toolbar', async () => {
    await setViewport({ width: 768, height: 1024 });
    await openReady(...panelSetup());
    expect(shown($('[data-action="more"]')), '"Thêm" hidden').to.equal(false);
    expect(shown($('[data-extra="cover"]')) && shown($('[data-extra="info"]')), 'extras shown').to.equal(true);
    expect(shown($('[data-action="fullscreen"]')), 'fullscreen as before').to.equal(document.fullscreenEnabled);
    // shrinking below 480 while open switches the toolbar (pure CSS, no reopen)
    await setViewport({ width: 400, height: 800 });
    expect(await until(() => !shown($('[data-extra="cover"]'))), 'cover moved to the menu at 400').to.equal(true);
    expect(shown($('[data-action="more"]')), '"Thêm" shown at 400').to.equal(true);
  });
});
