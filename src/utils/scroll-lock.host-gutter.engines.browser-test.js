import { expect } from '@esm-bundle/chai';
import { lockScroll } from './scroll-lock.js';
import { TdModal } from '../feedback/td-modal.js';

// v0.99.0 (dsuite bug 07/11): a HOST `html { scrollbar-gutter: stable }`. On a page that does not overflow, Chromium's
// `innerWidth - clientWidth` is 0 (CSSOM subtracts only a drawn scrollbar) while fixed overlays are still narrower by
// the reserved gutter: the strip must be painted all the same. On a tall page the lock must not fall back to padding
// (double gutter). Needs classic scrollbars: the `scrollbars` group (Chromium, --hide-scrollbars dropped) and the
// engines group on Linux CI; overlay-scrollbar engines (macOS headless) leave no strip → the cases skip.

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const root = document.documentElement;

/** width a fixed inset-0 box leaves uncovered (what the user sees as the strip) */
function strip() {
  const p = document.createElement('div');
  for (const [k, v] of [['position', 'fixed'], ['top', '0'], ['right', '0'], ['bottom', '0'], ['left', '0'], ['visibility', 'hidden']]) p.style.setProperty(k, v);
  root.appendChild(p);
  const w = Math.round(window.innerWidth - p.getBoundingClientRect().width);
  p.remove();
  return w;
}

const host = document.createElement('style');
host.textContent = 'html{scrollbar-gutter:stable;background-color:rgb(240,235,230)}body{margin:0}.hg-tall{height:300vh}';
document.head.appendChild(host);
const filler = document.createElement('div');
document.body.appendChild(filler);
await frames();

const hostStrip = strip(); // short page: only the reserved, EMPTY gutter
const engine = /Firefox/.test(navigator.userAgent) ? 'firefox' : /Chrome/.test(navigator.userAgent) ? 'chromium' : 'webkit';
console.log(`[scroll-lock.host-gutter] ${engine}: host gutter strip ${hostStrip}px, clientWidth gap ${window.innerWidth - root.clientWidth}px${hostStrip > 0 ? '' : ' → overlay scrollbars, cases skipped'}`);
const needStrip = (title, fn) => it(title, async function () { if (!(hostStrip > 0)) this.skip(); await fn(); });

// same normalisation as the kit (scroll-lock.gutter.engines.browser-test.js)
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
function expected(scrimEl, canvasCss) {
  const s = norm(getComputedStyle(scrimEl).backgroundColor);
  const c = norm(canvasCss);
  return [[s.r, c.r], [s.g, c.g], [s.b, c.b]].map(([x, y]) => Math.round(s.a * x + (1 - s.a) * y));
}
function near(actualCss, exp, what) {
  const m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(actualCss);
  expect(m, `${what}: inline background "${actualCss}"`).to.not.equal(null);
  [+m[1], +m[2], +m[3]].forEach((v, i) => expect(Math.abs(v - exp[i]), `${what} ch${i}: got ${actualCss} expected ${exp}`).to.be.at.most(1));
}
const bg = () => root.style.getPropertyValue('background-color');

describe('scroll lock under a host scrollbar-gutter: stable (v0.99.0)', () => {
  afterEach(async () => {
    TdModal.closeAll();
    filler.className = '';
    root.style.removeProperty('background-color');
    await wait(30);
  });

  needStrip('short page: the empty reserved gutter is painted with the scrim colour, no padding added', async () => {
    filler.className = '';
    await frames();
    const before = strip();
    expect(before, 'precondition: strip on the short page').to.be.above(0);
    const id = TdModal.show({ title: 'x', body: '<p>b</p>' });
    near(bg(), expected(document.getElementById(id).querySelector('.td-modal__backdrop'), 'rgb(240,235,230)'), 'short page modal');
    expect(root.style.getPropertyValue('padding-inline-end')).to.equal('');
    expect(root.style.getPropertyValue('--td-scroll-lock-gap')).to.equal('');
    expect(strip()).to.equal(before);
    TdModal.closeAll();
    await wait(30);
    expect(bg()).to.equal('');
    expect(root.style.getPropertyValue('scrollbar-gutter')).to.equal('');
    expect(root.style.getPropertyValue('overflow')).to.equal('');
  });

  needStrip('tall page: the gutter holds (no padding fallback = no double gutter), nothing moves', async () => {
    filler.className = 'hg-tall';
    await frames();
    const before = strip();
    const marker = document.createElement('div');
    marker.textContent = 'm';
    document.body.prepend(marker);
    const x0 = marker.getBoundingClientRect().right;
    const release = lockScroll();
    expect(root.style.getPropertyValue('padding-inline-end'), 'no padding fallback').to.equal('');
    expect(root.style.getPropertyValue('--td-scroll-lock-gap')).to.equal('');
    expect(strip()).to.equal(before);
    expect(marker.getBoundingClientRect().right).to.equal(x0);
    release();
    marker.remove();
    expect(root.style.getPropertyValue('scrollbar-gutter')).to.equal('');
    expect(root.style.getPropertyValue('padding-inline-end')).to.equal('');
  });

  it('host gutter removed and page short: nothing reserved, background untouched', async () => {
    host.disabled = true;
    filler.className = '';
    await frames();
    try {
      expect(strip()).to.equal(0);
      TdModal.show({ title: 'x', body: '<p>b</p>' });
      expect(bg()).to.equal('');
      expect(root.style.getPropertyValue('padding-inline-end')).to.equal('');
    } finally {
      TdModal.closeAll();
      host.disabled = false;
      await frames();
    }
  });
});
