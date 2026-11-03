// v0.95.0 (dwp request) — lightbox `preload: { ahead, behind, allowCrossOrigin }`, in-flight requests cancelled when
// they leave the window, a preload in flight taken over by the main load (and a main load of a passed slide kept as a
// preload), Save-Data, bind(). Plan: docs/internal/plans/v0.95.0-small-kit.md §6. A fake Image (the kit's contract:
// `new Image()`, `.src`, `.onload` / `.onerror`, `.referrerPolicy`) records every request; `manual` keeps them in flight.
// Chromium + Firefox + WebKit, no real mouse.
import { expect } from '@esm-bundle/chai';
import { TdLightbox } from './td-lightbox.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

/** distinct same-origin URLs (a query string makes each position its own src) */
const U = (i) => `/test/fixtures/${(i % 4) + 1}.svg?v095=${i}`;
const A = (i) => new URL(U(i), document.baseURI).href;
const gallery = (n) => Array.from({ length: n }, (_, i) => U(i));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const overlay = () => document.querySelector('.td-lightbox');
const $ = (sel) => overlay().querySelector(sel);

async function openReady(items, opts) {
  const lb = TdLightbox.open(items, opts);
  for (let i = 0; i < 100 && getComputedStyle(overlay()).visibility !== 'visible'; i++) await wait(10);
  await wait(120);
  return lb;
}

const OrigImage = window.Image;
/** Fake Image: records every request; loads (async) automatically unless `manual`. */
function fakeImages({ manual = false } = {}) {
  const made = [];
  window.Image = class {
    constructor() { made.push(this); this._src = ''; this.requested = ''; this.onload = null; this.onerror = null; this.referrerPolicy = ''; }
    set src(v) {
      this._src = v;
      if (v) this.requested = v;
      if (!v || manual) return;
      setTimeout(() => { if (this.onload) this.onload(); }, 0);
    }
    get src() { return this._src; }
  };
  return made;
}
/** speculative requests (no Referer), in request order */
const speculative = (made) => made.filter((i) => i.referrerPolicy === 'no-referrer').map((i) => i.requested);
/** every Image ever created for `src` */
const imagesFor = (made, src) => made.filter((i) => i.requested === src);
/** the one in-flight Image for `src` (fails the test when there is not exactly one) */
function live(made, src) {
  const list = made.filter((i) => i.src === src);
  expect(list.length, `in-flight Images for ${src}`).to.equal(1);
  return list[0];
}

afterEach(async () => {
  window.Image = OrigImage;
  TdLightbox.close();
  await wait(30);
});

describe('v0.95.0 lightbox preload window', () => {
  it('{ ahead: 2, behind: 1 } → exactly +1, −1, +2 in that order', async () => {
    const made = fakeImages();
    await openReady(gallery(10), { index: 5, preload: { ahead: 2, behind: 1 } });
    expect(speculative(made)).to.deep.equal([A(6), A(4), A(7)]);
  });

  it('no option → exactly ±1 (next first), same as v0.24.0', async () => {
    const made = fakeImages();
    await openReady(gallery(5), { index: 2 });
    expect(speculative(made)).to.deep.equal([A(3), A(1)]);
  });

  it('counts are positions (a video takes its slot), capped at 5; ahead/behind 0 → none', async () => {
    let made = fakeImages();
    const items = gallery(4);
    items[1] = { type: 'video', src: '/v095.mp4', poster: U(1) };
    await openReady(items, { index: 0, preload: { ahead: 2, behind: 0 }, video: () => null });
    expect(speculative(made)).to.deep.equal([A(2)]);
    TdLightbox.close();
    made = fakeImages();
    await openReady(gallery(20), { index: 0, preload: { ahead: 99, behind: 0 } });
    expect(speculative(made)).to.deep.equal([A(1), A(2), A(3), A(4), A(5)]);
    TdLightbox.close();
    made = fakeImages();
    await openReady(gallery(5), { index: 0, preload: { ahead: 0, behind: 0 } });
    expect(speculative(made)).to.deep.equal([]);
  });

  it('allowCrossOrigin(url, item): only the approved origin; the hook sees the canonical URL + item, never same-origin images', async () => {
    const CDN_A = 'http://cdn-a.example/a.svg';
    const CDN_B = 'http://cdn-b.example/b.svg';
    const seen = [];
    const made = fakeImages();
    await openReady([U(0), CDN_A, CDN_B, U(3)], {
      index: 0,
      preload: {
        ahead: 2,
        behind: 1,
        allowCrossOrigin: (url, item) => {
          seen.push([url, item && item.src]);
          return new URL(url).origin === 'http://cdn-a.example';
        },
      },
    });
    const spec = speculative(made);
    expect(spec).to.include(CDN_A);
    expect(spec).to.not.include(CDN_B);
    expect(spec).to.include(A(3));
    expect(seen.length > 0).to.equal(true);
    expect(seen.every(([url, src]) => url === src && (url === CDN_A || url === CDN_B)), JSON.stringify(seen)).to.equal(true);
  });

  it('a throwing hook → no cross-origin request; allowCrossOrigin: true behaves like "all"', async () => {
    const CROSS = 'http://cross.example/far.svg';
    let made = fakeImages();
    await openReady([U(0), CROSS, U(2)], { preload: { allowCrossOrigin: () => { throw new Error('boom'); } } });
    expect(speculative(made)).to.not.include(CROSS);
    expect(speculative(made)).to.include(A(2));
    TdLightbox.close();
    made = fakeImages();
    await openReady([U(0), CROSS, U(2)], { preload: { allowCrossOrigin: true } });
    expect(speculative(made)).to.include.members([CROSS, A(2)]);
  });

  it('fast swiping (requests in flight): neighbours that left the window are cancelled, no src is requested twice', async () => {
    const made = fakeImages({ manual: true });
    const lb = await openReady(gallery(10), { index: 0 });
    live(made, A(0)).onload(); // the first image loads → ±1 preloads in flight
    expect(speculative(made)).to.deep.equal([A(1), A(9)]);
    const pre9 = live(made, A(9));
    for (let k = 0; k < 4; k++) { lb.next(); await wait(10); }
    expect(lb.index).to.equal(4);
    expect(pre9.src, 'the old −1 left the window → cancelled').to.equal('');
    for (const i of [1, 2]) {
      expect(imagesFor(made, A(i)).every((im) => im.src === ''), `passed slide ${i} out of the window → cancelled`).to.equal(true);
    }
    expect(live(made, A(3)).src, 'the slide just passed is still in the window (behind 1) → kept').to.equal(A(3));
    live(made, A(4));
    for (const i of [0, 1, 2, 3, 4, 9]) expect(imagesFor(made, A(i)).length, `requests of ${i}`).to.equal(1);
  });

  it('finished preloads are never cancelled when leaving the window, and never requested again', async () => {
    const made = fakeImages();
    const lb = await openReady(gallery(10), { index: 0 });
    const done9 = live(made, A(9));
    for (let k = 0; k < 3; k++) { lb.next(); await wait(30); }
    expect(done9.src).to.equal(A(9));
    for (let k = 0; k < 3; k++) { lb.prev(); await wait(30); }
    const spec = speculative(made);
    for (const i of [1, 2, 3, 9]) expect(spec.filter((s) => s === A(i)).length, `preloads of ${i}`).to.equal(1);
  });

  it('preload → main: moving to an image being preloaded reuses that request; its load shows the image', async () => {
    const made = fakeImages({ manual: true });
    const lb = await openReady(gallery(5), { index: 0 });
    live(made, A(0)).onload();
    const pre1 = live(made, A(1));
    expect(pre1.referrerPolicy).to.equal('no-referrer');
    lb.next();
    await wait(10);
    expect(imagesFor(made, A(1)).length, 'no second request').to.equal(1);
    expect($('.td-lightbox__img').hasAttribute('data-loading')).to.equal(true);
    pre1.onload();
    await wait(10);
    expect($('.td-lightbox__img').getAttribute('src')).to.equal(A(1));
    expect($('.td-lightbox__img').hasAttribute('data-loading')).to.equal(false);
    // the finished record is kept: going away and back never requests it again as a preload
    expect(speculative(made).filter((s) => s === A(1)).length).to.equal(1);
  });

  it('preload → main, failing: ONE retry with a normal (Referer) request, a second failure shows the error box', async () => {
    const made = fakeImages({ manual: true });
    const lb = await openReady(gallery(5), { index: 0 });
    live(made, A(0)).onload();
    const pre1 = live(made, A(1));
    lb.next();
    await wait(10);
    pre1.onerror();
    await wait(10);
    const tries = imagesFor(made, A(1));
    expect(tries.length, 'exactly one retry').to.equal(2);
    expect(tries[1].referrerPolicy, 'retry carries the default Referer').to.equal('');
    expect($('.td-lightbox__error').hidden).to.equal(true);
    tries[1].onerror();
    await wait(10);
    expect($('.td-lightbox__error').hidden).to.equal(false);
    expect(imagesFor(made, A(1)).length, 'no third request').to.equal(2);
  });

  it('main → preload: the main load of a slide passed by, still in the window, is kept (not re-requested) and never cancelled once done', async () => {
    const made = fakeImages({ manual: true });
    const lb = await openReady(gallery(6), { index: 0 });
    const main0 = live(made, A(0));
    lb.next();
    await wait(10);
    expect(main0.src, 'slide 0 is the −1 neighbour → kept').to.equal(A(0));
    expect(imagesFor(made, A(0)).length).to.equal(1);
    main0.onload(); // finishes as a preload: the viewer (on slide 1) is untouched
    await wait(10);
    expect($('.td-lightbox__img').getAttribute('src')).to.not.equal(A(0));
    const main1 = live(made, A(1));
    lb.next();
    await wait(10);
    lb.next();
    await wait(10);
    expect(lb.index).to.equal(3);
    expect(main0.src, 'done → kept even out of the window').to.equal(A(0));
    expect(main1.src, 'the unfinished main load of slide 1 is out of the window → cancelled').to.equal('');
  });

  it('Save-Data + object option → no preload at all', async () => {
    Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
    try {
      const made = fakeImages();
      await openReady(gallery(6), { index: 2, preload: { ahead: 3, behind: 3, allowCrossOrigin: true } });
      expect(made.map((i) => i.requested)).to.deep.equal([A(2)]);
    } finally {
      delete navigator.connection;
    }
  });

  it('bind(root, { preload: {…} }) passes the object through', async () => {
    const made = fakeImages();
    const host = document.createElement('div');
    host.innerHTML = `<div data-td-lightbox-group>${gallery(5).map((u, i) => `<a data-td-lightbox-item href="${u}"${i === 0 ? ' id="v095p"' : ''}>${i}</a>`).join('')}</div>`;
    document.body.appendChild(host);
    const un = TdLightbox.bind(host, { preload: { ahead: 2, behind: 0 } });
    try {
      document.getElementById('v095p').click();
      await wait(150);
      expect(speculative(made)).to.deep.equal([A(1), A(2)]);
    } finally { un(); host.remove(); }
  });
});
