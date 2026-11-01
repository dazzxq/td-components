import { expect } from '@esm-bundle/chai';
import { lockScroll } from './scroll-lock.js';
import { TdModal } from '../feedback/td-modal.js';
import { TdDrawer } from '../feedback/td-drawer.js';
import { TdLoading } from '../feedback/td-loading.js';
import { TdLightbox } from '../feedback/td-lightbox.js';

// v0.91.0 — the reserved scrollbar strip is painted with the topmost overlay scrim composited over the canvas colour
// (utils/scroll-lock.js holdGutterColor). Chromium, Firefox AND WebKit. NO `::-webkit-scrollbar` here (that forces the
// padding path): engines with overlay scrollbars (gap 0 on a tall page) only check "background untouched".

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const root = document.documentElement;
const gap = () => window.innerWidth - root.clientWidth;

const sheet = document.createElement('style');
sheet.textContent = '.sg-tall{height:300vh}';
document.head.appendChild(sheet);
const tall = document.createElement('div');
tall.className = 'sg-tall';
document.body.appendChild(tall);

// same normalisation as the kit: any CSS colour -> sRGBA through a 1x1 canvas
const cv = document.createElement('canvas');
cv.width = 1; cv.height = 1;
const ctx = cv.getContext('2d', { willReadFrequently: true });
function norm(css) {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#010203';
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
}
const rgbOf = (css) => {
  const m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(css);
  return m ? [+m[1], +m[2], +m[3]] : null;
};
/** expected strip colour: scrim over canvas, both normalised */
function expected(scrimEl, canvasCss) {
  const s = norm(getComputedStyle(scrimEl).backgroundColor);
  const c = norm(canvasCss);
  return [[s.r, c.r], [s.g, c.g], [s.b, c.b]].map(([x, y]) => Math.round(s.a * x + (1 - s.a) * y));
}
function near(actualCss, exp, what) {
  const got = rgbOf(actualCss);
  expect(got, `${what}: inline background "${actualCss}"`).to.not.equal(null);
  got.forEach((v, i) => expect(Math.abs(v - exp[i]), `${what} ch${i}: got ${got} expected ${exp}`).to.be.at.most(1));
}
const bg = () => root.style.getPropertyValue('background-color');
const scrimOf = (id) => document.getElementById(id).querySelector('.td-modal__backdrop');

const styleEls = [];
function addStyle(css) {
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
  styleEls.push(s);
}

// Headless Chromium hides scrollbars (web-test-runner.config.js group `scrollbars` shows them: a REAL classic scrollbar,
// the scrollbar-gutter path); Firefox / WebKit on macOS use overlay scrollbars. WebKit can still be given a classic
// one with ::-webkit-scrollbar (that forces the padding path, which paints too); when nothing yields a gap the colour
// cases are skipped and only "background untouched" is asserted.
let forced = false;
if (!(gap() > 0)) {
  const f = document.createElement('style');
  f.textContent = 'html::-webkit-scrollbar{width:15px;height:15px;background:#ddd}html::-webkit-scrollbar-thumb{background:#888}';
  // WebKit picks the scrollbar type when a page first overflows: drop the tall content, add the rule, bring it back
  tall.remove();
  document.head.appendChild(f);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  document.body.appendChild(tall);
  if (gap() > 0) forced = true; else f.remove();
}
const hasGap = gap() > 0;
const engine = /Firefox/.test(navigator.userAgent) ? 'firefox' : /Chrome/.test(navigator.userAgent) ? 'chromium' : 'webkit';
console.log(`[scroll-lock.gutter] ${engine}: ${hasGap ? `classic scrollbar ${gap()}px${forced ? ' (forced with ::-webkit-scrollbar, padding path)' : ' (real, gutter path)'}` : 'OVERLAY scrollbars (gap 0): colour cases skipped'}`);
const colour = (title, fn) => it(title, async function () { if (!hasGap) this.skip(); await fn(); });

describe('scroll lock paints the reserved gutter strip (v0.91.0)', () => {
  afterEach(async () => {
    TdLightbox.close();
    TdLoading.hide();
    TdModal.closeAll();
    document.querySelectorAll('td-drawer').forEach((d) => d.remove());
    document.querySelectorAll('.td-drawer-root').forEach((d) => d.remove());
    styleEls.splice(0).forEach((s) => s.remove());
    document.querySelectorAll('.sg-scope').forEach((e) => e.remove());
    root.removeAttribute('data-td-theme');
    root.style.removeProperty('background-color');
    root.style.removeProperty('scrollbar-gutter');
    tall.className = 'sg-tall';
    await wait(30);
  });

  it('no gap (page does not scroll, host keeps no gutter) -> background untouched', async () => {
    tall.className = '';
    expect(gap()).to.equal(0);
    root.style.setProperty('background-color', 'rgb(1, 2, 3)', 'important');
    TdModal.show({ title: 'x', body: '<p>b</p>' });
    expect(root.style.getPropertyValue('background-color')).to.equal('rgb(1, 2, 3)');
    TdModal.closeAll();
    expect(root.style.getPropertyValue('background-color')).to.equal('rgb(1, 2, 3)');
    expect(root.style.getPropertyPriority('background-color')).to.equal('important');
  });

  it('overlay-scrollbar engine: background untouched on a tall page', async () => {
    if (hasGap) return;
    TdModal.show({ title: 'x', body: '<p>b</p>' });
    expect(bg()).to.equal('');
  });

  colour('tall page: modal paints scrim over canvas, restored on close', async () => {
    addStyle('html{background-color:rgb(240,235,230)}');
    const id = TdModal.show({ title: 'x', body: '<p>b</p>' });
    near(bg(), expected(scrimOf(id), 'rgb(240,235,230)'), 'modal');
    TdModal.closeAll();
    await wait(30);
    expect(bg()).to.equal('');
  });

  colour('html transparent + body coloured -> canvas = body colour', async () => {
    addStyle('html{background-color:transparent}body{background-color:rgb(10,200,40)}');
    const id = TdModal.show({ title: 'x', body: '<p>b</p>' });
    near(bg(), expected(scrimOf(id), 'rgb(10,200,40)'), 'body canvas');
  });

  colour('html and body transparent -> white canvas', async () => {
    addStyle('html{background-color:transparent}body{background-color:transparent}');
    const id = TdModal.show({ title: 'x', body: '<p>b</p>' });
    near(bg(), expected(scrimOf(id), 'rgb(255,255,255)'), 'white canvas');
  });

  colour('pre-existing inline background-color (incl. !important) is restored exactly', async () => {
    root.style.setProperty('background-color', 'rgb(9, 8, 7)', 'important');
    TdModal.show({ title: 'x', body: '<p>b</p>' });
    expect(bg()).to.not.equal('rgb(9, 8, 7)');
    TdModal.closeAll();
    await wait(30);
    expect(root.style.getPropertyValue('background-color')).to.equal('rgb(9, 8, 7)');
    expect(root.style.getPropertyPriority('background-color')).to.equal('important');
    root.style.setProperty('background-color', 'rgb(4, 5, 6)');
    TdModal.show({ title: 'x', body: '<p>b</p>' });
    TdModal.closeAll();
    await wait(30);
    expect(root.style.getPropertyValue('background-color')).to.equal('rgb(4, 5, 6)');
    expect(root.style.getPropertyPriority('background-color')).to.equal('');
  });

  it('host scrollbar-gutter: stable on a NON-overflowing page still paints', async () => {
    tall.className = '';
    root.style.setProperty('scrollbar-gutter', 'stable');
    if (!(gap() > 0)) { console.log('[scroll-lock.gutter] scrollbar-gutter: stable reserves nothing here (overlay scrollbars): skipped'); return; }
    addStyle('html{background-color:rgb(250,250,250)}');
    const id = TdModal.show({ title: 'x', body: '<p>b</p>' });
    near(bg(), expected(scrimOf(id), 'rgb(250,250,250)'), 'stable gutter, no overflow');
  });

  colour('tall page + host html { scrollbar-gutter: stable } paints', async () => {
    root.style.setProperty('scrollbar-gutter', 'stable');
    addStyle('html{background-color:rgb(250,250,250)}');
    const id = TdModal.show({ title: 'x', body: '<p>b</p>' });
    near(bg(), expected(scrimOf(id), 'rgb(250,250,250)'), 'host stable gutter');
    TdModal.closeAll();
    await wait(30);
    expect(bg()).to.equal('');
    expect(root.style.getPropertyValue('scrollbar-gutter')).to.equal('stable'); // the host's own value comes back
  });

  colour('modal -> lightbox -> modal, out-of-order closes: always the topmost colour', async () => {
    addStyle('html{background-color:rgb(255,255,255)}'
      + '.td-lightbox__backdrop{--td-lb-backdrop:rgb(0 0 0 / 0.9) !important}');
    const dark = document.createElement('div');
    dark.className = 'sg-scope';
    dark.setAttribute('data-td-theme', 'dark');
    document.body.appendChild(dark);
    const canvasCss = 'rgb(255,255,255)';
    const id1 = TdModal.show({ title: 'one', body: '<p>1</p>' });
    const c1 = expected(scrimOf(id1), canvasCss);
    near(bg(), c1, 'modal 1');
    TdLightbox.open([{ src: '/test/fixtures/1.svg' }]);
    const lbScrim = document.querySelector('.td-lightbox__backdrop');
    const cLb = expected(lbScrim, canvasCss);
    near(bg(), cLb, 'lightbox on top');
    expect(Math.abs(cLb[0] - c1[0])).to.be.greaterThan(5); // really different from the modal's
    const id2 = TdModal.show({ title: 'two', body: '<p>2</p>', themeRoot: dark }); // dark scope -> a different scrim
    const c2 = expected(scrimOf(id2), canvasCss);
    near(bg(), c2, 'modal 2 on top');
    expect(c2).to.not.deep.equal(c1);
    expect(c2).to.not.deep.equal(cLb);
    // close the lightbox (not the topmost): modal 2 still wins
    TdLightbox.close();
    await wait(30);
    near(bg(), c2, 'modal 2 after the lightbox closed');
    // close modal 2 -> modal 1
    TdModal.closeById(id2);
    await wait(30);
    near(bg(), c1, 'back to modal 1');
    TdModal.closeAll();
    await wait(30);
    expect(bg()).to.equal('');
  });

  colour('lightbox opened over a modal then modal closed first: lightbox colour stays', async () => {
    addStyle('html{background-color:rgb(255,255,255)}.td-lightbox__backdrop{--td-lb-backdrop:rgb(0 0 0 / 0.9) !important}');
    const id1 = TdModal.show({ title: 'one', body: '<p>1</p>' });
    TdLightbox.open([{ src: '/test/fixtures/1.svg' }]);
    const cLb = expected(document.querySelector('.td-lightbox__backdrop'), 'rgb(255,255,255)');
    TdModal.closeById(id1);
    await wait(30);
    near(bg(), cLb, 'lightbox only');
    TdLightbox.close();
    await wait(30);
    expect(bg()).to.equal('');
  });

  colour('two modals with different themeRoot: topmost wins (dark scope vs light)', async () => {
    addStyle('html{background-color:rgb(255,255,255)}');
    const dark = document.createElement('div');
    dark.className = 'sg-scope';
    dark.setAttribute('data-td-theme', 'dark');
    document.body.appendChild(dark);
    const idLight = TdModal.show({ title: 'l', body: '<p>l</p>' });
    const cLight = expected(scrimOf(idLight), 'rgb(255,255,255)');
    near(bg(), cLight, 'light modal');
    const idDark = TdModal.show({ title: 'd', body: '<p>d</p>', themeRoot: dark });
    const cDark = expected(scrimOf(idDark), 'rgb(255,255,255)');
    near(bg(), cDark, 'dark modal on top');
    expect(cDark).to.not.deep.equal(cLight);
    TdModal.closeById(idDark);
    await wait(30);
    near(bg(), cLight, 'light again');
  });

  colour('scrim override with oklch() alpha and color(display-p3) alpha', async () => {
    addStyle('html{background-color:rgb(255,255,255)}:root{--td-glass-scrim:oklch(0.5 0.12 250 / 0.5)}');
    let id = TdModal.show({ title: 'o', body: '<p>o</p>' });
    near(bg(), expected(scrimOf(id), 'rgb(255,255,255)'), 'oklch');
    TdModal.closeAll();
    await wait(30);
    addStyle(':root{--td-glass-scrim:color(display-p3 0.9 0.2 0.1 / 0.5)}');
    id = TdModal.show({ title: 'p', body: '<p>p</p>' });
    near(bg(), expected(scrimOf(id), 'rgb(255,255,255)'), 'display-p3');
  });

  colour('scrim and canvas equal to #010203 / black still paint (no sentinel collision)', async () => {
    addStyle('html{background-color:#010203}:root{--td-glass-scrim:rgb(1 2 3 / 0.5)}');
    let id = TdModal.show({ title: 's', body: '<p>s</p>' });
    expect(bg(), 'painted').to.not.equal('');
    near(bg(), [1, 2, 3], 'sentinel colour');
    TdModal.closeAll();
    await wait(30);
    addStyle('html{background-color:rgb(255,255,255)}:root{--td-glass-scrim:#000}');
    id = TdModal.show({ title: 'b', body: '<p>b</p>' });
    near(bg(), [0, 0, 0], 'opaque black scrim');
    TdModal.closeById(id);
  });

  colour('drawer paints and restores', async () => {
    addStyle('html{background-color:rgb(255,255,255)}');
    const h = TdDrawer.open({ title: 'd', body: document.createElement('p') });
    const scrim = document.querySelector('.td-drawer__backdrop');
    near(bg(), expected(scrim, 'rgb(255,255,255)'), 'drawer');
    await h.close();
    await wait(30);
    expect(bg()).to.equal('');
  });

  colour('td-loading paints and restores', async () => {
    addStyle('html{background-color:rgb(255,255,255)}');
    TdLoading.show('x');
    near(bg(), expected(document.getElementById('td-loading'), 'rgb(255,255,255)'), 'loading');
    TdLoading.hide();
    expect(bg()).to.equal('');
  });

  colour('padding fallback path (no scrollbar-gutter support) also paints', async () => {
    addStyle('html{background-color:rgb(255,255,255)}');
    const supports = CSS.supports;
    CSS.supports = (...a) => (/^\s*\(?\s*scrollbar-gutter/.test(String(a[0])) ? false : supports.apply(CSS, a));
    try {
      const id = TdModal.show({ title: 'x', body: '<p>b</p>' });
      expect(root.style.paddingInlineEnd).to.not.equal('');
      near(bg(), expected(scrimOf(id), 'rgb(255,255,255)'), 'padding path');
      TdModal.closeAll();
      await wait(30);
      expect(bg()).to.equal('');
    } finally {
      CSS.supports = supports;
    }
  });

});
