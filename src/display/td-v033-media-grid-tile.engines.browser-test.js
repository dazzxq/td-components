import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import './td-media-grid.js';

// v0.33.0 — td-media-grid tile fix (plan v0.33.0 decision 37): the kit owns the opener + image size by CSSOM inline
// !important (with a snapshot of the site's inline values, restored only when the item leaves the grid / the grid
// disconnects); selected = 3px inset ring on the opener (no scale, no fill). Chromium + Firefox + WebKit.
// Waits on real signals (rAF-polled conditions), never fixed sleeps before geometry.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const root = document.createElement('div');
root.style.setProperty('width', '700px');
document.body.appendChild(root);

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const frames = async (n = 2) => { for (let i = 0; i < n; i++) await raf(); };
async function waitFor(cond, timeout = 4000, what = 'condition') {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    if (cond()) return;
    await raf();
  }
  throw new Error(`timeout waiting for ${what}`);
}
const loaded = (img) => (img.complete && img.naturalWidth > 0
  ? Promise.resolve()
  : new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); }));

/** site CSS outside any layer (an unlayered rule beats every @layer rule of the kit) */
let siteStyle = null;
function siteCss(text) {
  siteStyle = document.createElement('style');
  siteStyle.textContent = text;
  document.head.appendChild(siteStyle);
}

function mount(n = 6, { attrs = '', cls = 'x', src = '/test/fixtures/1.svg' } = {}) {
  const items = Array.from({ length: n }, (_, i) => `<div data-td-media-item data-id="t${i + 1}">`
    + `<button type="button" data-td-media-open aria-label="Ảnh ${i + 1}"><img class="demo-img" src="${src}" alt="" width="1200" height="800"></button></div>`).join('');
  root.innerHTML = `<td-media-grid class="${cls}" label="Ô" ${attrs}>${items}</td-media-grid>`;
  return root.firstElementChild;
}
const itemOf = (g, id) => g.querySelector(`[data-id="${id}"]`);
const openOf = (g, id) => itemOf(g, id).querySelector('[data-td-media-open]');
const imgOf = (g, id) => itemOf(g, id).querySelector('img');
const rect = (el) => el.getBoundingClientRect();
const near = (a, b, tol, msg) => expect(Math.abs(a - b), `${msg}: ${a} vs ${b}`).to.be.at.most(tol);

/** the image covers its tile: same box as the opener and as wide as the item */
function fills(g, id, tol = 0.5) {
  const i = rect(imgOf(g, id));
  const o = rect(openOf(g, id));
  const it = rect(itemOf(g, id));
  near(i.width, it.width, tol, `${id} img width = tile width`);
  near(i.width, o.width, tol, `${id} img width = opener width`);
  near(i.height, o.height, tol, `${id} img height = opener height`);
  near(i.left, o.left, tol, `${id} img left`);
  near(i.top, o.top, tol, `${id} img top`);
}

afterEach(() => {
  root.innerHTML = '';
  siteStyle?.remove();
  siteStyle = null;
});

describe('td-media-grid tile — the kit owns the image size', () => {
  it('unlayered site CSS (.x img { width: 160px; height: 107px; object-fit: none }) cannot resize the image', async () => {
    siteCss('.x img { width: 160px; height: 107px; object-fit: none; }');
    const g = mount();
    await Promise.all([...g.querySelectorAll('img')].map(loaded));
    await frames();
    for (const id of ['t1', 't3', 't6']) fills(g, id);
    expect(getComputedStyle(imgOf(g, 't1')).objectFit).to.equal('cover');
    expect(Math.abs(rect(imgOf(g, 't1')).width - 160)).to.be.above(5);
  });

  it('… nor the !important variant', async () => {
    siteCss('.x img { width: 160px !important; height: 107px !important; object-fit: none !important; max-width: 50% !important; }');
    const g = mount();
    await Promise.all([...g.querySelectorAll('img')].map(loaded));
    await frames();
    for (const id of ['t1', 't4']) fills(g, id);
    expect(getComputedStyle(imgOf(g, 't1')).objectFit).to.equal('cover');
  });

  it('--td-media-grid-ratio sets the tile ratio; --td-media-grid-fit the fit; the image fills the box', async () => {
    const g = mount(4);
    g.style.setProperty('--td-media-grid-ratio', '1');
    g.style.setProperty('--td-media-grid-fit', 'contain');
    await Promise.all([...g.querySelectorAll('img')].map(loaded));
    await frames();
    const o = rect(openOf(g, 't1'));
    near(o.width, o.height, 0.5, 'square opener');
    fills(g, 't1');
    expect(getComputedStyle(imgOf(g, 't1')).objectFit).to.equal('contain');
  });

  it('default ratio auto: the tile is as tall as the image (width × 800 / 1200)', async () => {
    const g = mount(3);
    await Promise.all([...g.querySelectorAll('img')].map(loaded));
    await frames();
    const i = rect(imgOf(g, 't1'));
    near(i.height, i.width * 800 / 1200, 0.6, 'natural ratio');
    fills(g, 't1');
  });

  it('a <picture> img and a <video> are sized too', async () => {
    root.innerHTML = '<td-media-grid class="x"><div data-td-media-item data-id="p"><button type="button" data-td-media-open aria-label="p">'
      + '<picture><img src="/test/fixtures/1.svg" alt="" width="1200" height="800"></picture></button></div>'
      + '<div data-td-media-item data-id="v"><button type="button" data-td-media-open aria-label="v"><video muted width="1200" height="800"></video></button></div></td-media-grid>';
    siteCss('.x img, .x video { width: 33px; }');
    const g = root.firstElementChild;
    await frames();
    for (const el of [g.querySelector('img'), g.querySelector('video')]) {
      expect(el.style.getPropertyValue('width')).to.equal('100%');
      expect(el.style.getPropertyPriority('width')).to.equal('important');
    }
    fills(g, 'p');
  });
});

describe('td-media-grid tile — snapshot + restore', () => {
  function withSiteInline() {
    const g = mount(3);
    return g;
  }
  /** an item whose img carries site inline styles BEFORE the grid sees it */
  function siteItem() {
    const tpl = document.createElement('template');
    tpl.innerHTML = '<div data-td-media-item data-id="s"><button type="button" data-td-media-open aria-label="s">'
      + '<img src="/test/fixtures/1.svg" alt="" width="1200" height="800"></button></div>';
    const it = tpl.content.firstElementChild;
    const img = it.querySelector('img');
    img.style.setProperty('width', '50px');
    img.style.setProperty('object-fit', 'none', 'important');
    img.style.setProperty('opacity', '0.9');
    return { it, img, open: it.querySelector('button') };
  }
  function expectRestored(img, open) {
    expect(img.style.getPropertyValue('width')).to.equal('50px');
    expect(img.style.getPropertyPriority('width')).to.equal('');
    expect(img.style.getPropertyValue('object-fit')).to.equal('none');
    expect(img.style.getPropertyPriority('object-fit')).to.equal('important');
    expect(img.style.getPropertyValue('height')).to.equal('');
    expect(img.style.getPropertyValue('max-width')).to.equal('');
    expect(img.style.getPropertyValue('opacity')).to.equal('0.9');
    for (const p of ['width', 'height', 'aspect-ratio']) expect(open.style.getPropertyValue(p), `opener ${p}`).to.equal('');
  }

  it('while in the grid the image fills the tile; removing the item restores the site inline values exactly', async () => {
    const g = withSiteInline();
    const { it, img, open } = siteItem();
    g.appendChild(it);
    await waitFor(() => img.style.getPropertyValue('width') === '100%', 4000, 'sized');
    await loaded(img);
    await frames();
    fills(g, 's');
    expect(img.style.getPropertyValue('opacity')).to.equal('0.9');
    it.remove();
    await waitFor(() => img.style.getPropertyValue('width') === '50px', 4000, 'restored');
    expectRestored(img, open);
  });

  it('disconnecting the grid restores at once; reconnecting takes ownership again (fresh snapshot = site values)', async () => {
    const g = withSiteInline();
    const { it, img, open } = siteItem();
    g.appendChild(it);
    await waitFor(() => img.style.getPropertyValue('width') === '100%', 4000, 'sized');
    g.remove();
    expectRestored(img, open);
    root.appendChild(g);
    expect(img.style.getPropertyValue('width')).to.equal('100%');
    g.remove();
    expectRestored(img, open);
  });

  it('replacing the image inside the opener restores the old one', async () => {
    const g = mount(2);
    const old = imgOf(g, 't1');
    expect(old.style.getPropertyValue('width')).to.equal('100%');
    const fresh = document.createElement('img');
    fresh.src = '/test/fixtures/2.svg';
    fresh.alt = '';
    old.replaceWith(fresh);
    await waitFor(() => fresh.style.getPropertyValue('width') === '100%', 4000, 'new img sized');
    expect(old.getAttribute('style') || '').to.equal('');
  });

  it('layout switch justified → default → justified keeps the size (no restore in between, no --td-mg-* in default)', async () => {
    const g = mount(6, { attrs: 'layout="justified"' });
    await Promise.all([...g.querySelectorAll('img')].map(loaded));
    await waitFor(() => itemOf(g, 't1').style.getPropertyValue('--td-mg-w') !== '', 4000, 'justified');
    fills(g, 't1');
    const seen = [];
    const mo = new MutationObserver(() => seen.push(imgOf(g, 't1').style.getPropertyValue('width')));
    mo.observe(imgOf(g, 't1'), { attributes: true, attributeFilter: ['style'] });

    g.removeAttribute('layout');
    await waitFor(() => !g.hasAttribute('data-td-layout'), 4000, 'default');
    await raf();
    for (const id of ['t1', 't2', 't6']) {
      fills(g, id);
      for (const p of ['--td-mg-w', '--td-mg-sub', '--td-mg-k']) expect(itemOf(g, id).style.getPropertyValue(p)).to.equal('');
      expect(imgOf(g, id).style.getPropertyValue('width')).to.equal('100%');
      expect(imgOf(g, id).style.getPropertyPriority('width')).to.equal('important');
    }

    g.setAttribute('layout', 'justified');
    await waitFor(() => g.getAttribute('data-td-layout') === 'justified', 4000, 'justified again');
    await raf();
    for (const id of ['t1', 't2', 't6']) fills(g, id);
    mo.disconnect();
    expect(seen.every((w) => w === '100%'), `img width never left the grid's value: ${seen}`).to.equal(true);
  });
});

describe('td-media-grid tile — selected ring / focus ring / gaps', () => {
  it('selected ring (opener ::after, inset 0) and the focus ring sit on the image box ±1px', async () => {
    const g = mount(4);
    await Promise.all([...g.querySelectorAll('img')].map(loaded));
    g.select(['t2']);
    await frames();
    const o = openOf(g, 't2');
    const after = getComputedStyle(o, '::after');
    expect(after.position).to.equal('absolute');
    for (const side of ['top', 'right', 'bottom', 'left']) expect(after[side], side).to.equal('0px');
    expect(after.boxShadow).to.match(/inset/);
    const i = rect(imgOf(g, 't2'));
    const r = rect(o);
    for (const k of ['left', 'top', 'width', 'height']) near(r[k], i[k], 1, `opener ${k} = image ${k}`);
    // focus ring: drawn by the opener (outline). Keyboard modality first (WebKit's Tab skips buttons), then focus
    openOf(g, 't1').focus();
    await sendKeys({ press: 'Shift' });
    o.focus();
    await waitFor(() => document.activeElement === o && o.matches(':focus-visible'), 2000, 'focus-visible on t2');
    const cs = getComputedStyle(o);
    expect(cs.outlineStyle).to.equal('solid');
    expect(parseFloat(cs.outlineWidth)).to.equal(2);
  });

  it('gaps stay even with selected tiles (no scale, same tile boxes)', async () => {
    const g = mount(8);
    await Promise.all([...g.querySelectorAll('img')].map(loaded));
    await frames();
    const before = [...g.querySelectorAll('img')].map((el) => rect(el));
    g.select(['t1', 't3', 't4']);
    // the ring fades in (transition) — wait for its final value, then compare boxes
    await waitFor(() => /3px/.test(getComputedStyle(openOf(g, 't1'), '::after').boxShadow), 2000, 'ring');
    const imgs = [...g.querySelectorAll('img')].map((el) => rect(el));
    imgs.forEach((r, k) => {
      near(r.width, before[k].width, 0.5, `img ${k} width unchanged`);
      near(r.left, before[k].left, 0.5, `img ${k} left unchanged`);
    });
    const gap = parseFloat(getComputedStyle(g).columnGap);
    const row = imgs.filter((r) => Math.abs(r.top - imgs[0].top) < 1);
    expect(row.length).to.be.above(2);
    for (let k = 1; k < row.length; k++) near(row[k].left - row[k - 1].right, gap, 0.5, `gap ${k}`);
    expect(getComputedStyle(itemOf(g, 't1')).backgroundColor).to.equal(getComputedStyle(itemOf(g, 't2')).backgroundColor);
  });
});
