import { expect } from '@esm-bundle/chai';
import './td-scroll-top.js';

// v0.97.0 (plan docs/internal/plans/v0.97.0-scroll-progress-dropdown-font.md §A) — td-scroll-top reading progress:
// progress-target / progressTarget, the ring (dashoffset = 100 × (1 − p) via CSSOM), first visible match, invalid
// selector, update() after a swap, ResizeObserver, completion (event once per element ever, check for 3 s, cleared on
// scroll back), colours, geometry. Chromium, Firefox AND WebKit. Compare DOM nodes as booleans (chai + nodes hangs).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const raf = () => new Promise((r) => requestAnimationFrame(r));
async function settle(n = 3) { for (let i = 0; i < n; i++) await raf(); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
afterEach(async () => {
  host.innerHTML = '';
  window.scrollTo({ top: 0, behavior: 'instant' });
  await settle();
});

/** spacer (600) + article (h) + tail (3000) + the button; heights through CSSOM (CSP-safe) */
function page(attrs = '', h = 3000) {
  host.insertAdjacentHTML('beforeend', '<div class="pre"></div><article id="art" data-read></article><div class="tail"></div>'
    + `<td-scroll-top ${attrs}></td-scroll-top>`);
  host.querySelector('.pre').style.setProperty('height', '600px');
  host.querySelector('#art').style.setProperty('height', `${h}px`);
  host.querySelector('.tail').style.setProperty('height', '3000px');
  return host.querySelector('td-scroll-top');
}
const btnOf = (el) => el.querySelector('button.td-scroll-top');
const offset = (el) => parseFloat(el.querySelector('.td-scroll-top__arc').style.strokeDashoffset);
/** scroll so that the target's progress is p (0..1) */
async function scrollToProgress(target, p) {
  const r = target.getBoundingClientRect();
  const top = r.top + window.scrollY;
  const dist = r.height - window.innerHeight;
  window.scrollTo({ top: Math.round(top + dist * p), behavior: 'instant' });
  await settle();
}

describe('v0.97.0 td-scroll-top reading progress', () => {
  it('no progress-target → no ring shown, the button as before (no data-progress / data-complete)', async () => {
    const el = page();
    await settle();
    const btn = btnOf(el);
    expect(btn.hasAttribute('data-progress')).to.equal(false);
    expect(getComputedStyle(el.querySelector('.td-scroll-top__ring')).display).to.equal('none');
    expect(getComputedStyle(el.querySelector('.td-scroll-top__icon--check')).opacity).to.equal('0');
  });

  it('progress-target selector: ring shown, dashoffset 100 / 50 / 0 at p 0 / .5 / 1 (CSSOM, no style markup)', async () => {
    const el = page('progress-target="#art"');
    await settle();
    expect(btnOf(el).getAttribute('data-progress')).to.equal('true');
    expect(getComputedStyle(el.querySelector('.td-scroll-top__ring')).display).to.equal('block');
    expect(offset(el)).to.equal(100);
    const art = host.querySelector('#art');
    await scrollToProgress(art, 0.5);
    expect(Math.abs(offset(el) - 50)).to.be.below(1);
    await scrollToProgress(art, 1);
    expect(offset(el)).to.equal(0);
    expect(el.innerHTML.includes('style=')).to.equal(true); // CSSOM writes the arc style; the render string has none
    expect(el.constructor.prototype.render.call(el).includes('style=')).to.equal(false);
  });

  it('first match WITH client rects wins (a hidden first match is skipped)', async () => {
    const el = page('progress-target="[data-read]"');
    host.insertAdjacentHTML('afterbegin', '<article id="hidden" data-read hidden></article>');
    el.update();
    await settle();
    expect(btnOf(el).getAttribute('data-progress')).to.equal('true');
    await scrollToProgress(host.querySelector('#art'), 0.5);
    expect(Math.abs(offset(el) - 50)).to.be.below(1);
  });

  it('progressTarget wins over the attribute; null falls back to the (valid) attribute; a non-Element → null', async () => {
    const el = page('progress-target="#art"');
    host.insertAdjacentHTML('afterbegin', '<section id="short"></section>');
    const short = host.querySelector('#short');
    short.style.setProperty('height', '100px'); // fully in view → p = 1
    const art = host.querySelector('#art');
    await settle();
    expect(offset(el)).to.equal(100); // #art not started
    el.progressTarget = short;
    expect(offset(el)).to.equal(0); // the property wins
    el.progressTarget = null;
    expect(offset(el)).to.equal(100); // back to #art through the attribute
    expect(art.isConnected).to.equal(true);
    el.progressTarget = 'x';
    expect(el.progressTarget).to.equal(null);
  });

  it('progressTarget set before define is kept (upgrade)', async () => {
    host.insertAdjacentHTML('beforeend', '<article id="early"></article>');
    host.querySelector('#early').style.setProperty('height', '3000px');
    const st = document.createElement('div');
    st.innerHTML = '<td-scroll-top></td-scroll-top>';
    const t = st.firstElementChild; // upgraded on creation (defined): emulate a pre-define own property
    Object.defineProperty(t, 'progressTarget', { value: host.querySelector('#early'), writable: true, configurable: true, enumerable: true });
    host.appendChild(t);
    await settle();
    expect(t.progressTarget === host.querySelector('#early')).to.equal(true);
    expect(btnOf(t).getAttribute('data-progress')).to.equal('true');
  });

  it('an invalid selector warns once, shows no ring, is not reparsed per frame; a valid one then works', async () => {
    const warn = console.warn;
    const qsa = document.querySelectorAll;
    const msgs = [];
    let calls = 0;
    console.warn = (m) => msgs.push(String(m));
    try {
      const el = page('progress-target="[[bad"');
      await settle();
      document.querySelectorAll = function (...a) { calls++; return qsa.apply(this, a); };
      el.update();
      el.update();
      document.querySelectorAll = qsa;
      expect(calls).to.equal(0);
      expect(btnOf(el).hasAttribute('data-progress')).to.equal(false);
      expect(msgs.filter((m) => m.includes('progress-target')).length).to.equal(1);
      el.setAttribute('progress-target', '#art');
      el.update();
      expect(btnOf(el).getAttribute('data-progress')).to.equal('true');
    } finally { console.warn = warn; document.querySelectorAll = qsa; }
  });

  it('A → B swap between two matching elements: progress follows B, ResizeObserver re-observes B', async () => {
    const el = page('progress-target="[data-cur]"');
    const a = host.querySelector('#art');
    host.insertAdjacentHTML('beforeend', '<section id="b2" data-x></section>');
    const b = host.querySelector('#b2');
    b.style.setProperty('height', '3000px');
    a.setAttribute('data-cur', '');
    await scrollToProgress(a, 0.5);
    expect(Math.abs(offset(el) - 50)).to.be.below(1);
    a.removeAttribute('data-cur');
    b.setAttribute('data-cur', '');
    el.update();
    expect(offset(el)).to.equal(100); // B is below the viewport: not started
    a.style.setProperty('height', '200px'); // A shrinks: B moves up; the observer must be on B now, not A
    b.style.setProperty('height', '200px'); // B fits → read
    await new Promise((r) => setTimeout(r, 50));
    await settle();
    window.scrollTo({ top: b.getBoundingClientRect().top + window.scrollY - 10, behavior: 'instant' });
    await settle();
    expect(offset(el)).to.equal(0);
  });

  it('a completed target hidden → update → shown → update: no second event, no second check', async () => {
    const el = page('progress-target="#art"');
    const art = host.querySelector('#art');
    const got = [];
    host.addEventListener('reading-progress-complete', () => got.push(1));
    await scrollToProgress(art, 1);
    expect(got.length).to.equal(1);
    art.hidden = true;
    el.update();
    expect(btnOf(el).hasAttribute('data-progress')).to.equal(false);
    expect(btnOf(el).hasAttribute('data-complete')).to.equal(false);
    art.hidden = false;
    el.update();
    await scrollToProgress(art, 1);
    expect(got.length).to.equal(1);
    expect(btnOf(el).hasAttribute('data-complete')).to.equal(false);
  });

  it('a swapped target + update() is picked up without a scroll', async () => {
    const el = page('progress-target="[data-cur]"');
    await settle();
    expect(btnOf(el).hasAttribute('data-progress')).to.equal(false);
    host.querySelector('#art').setAttribute('data-cur', '');
    el.update();
    expect(btnOf(el).getAttribute('data-progress')).to.equal('true');
  });

  it('ResizeObserver: the target growing changes the progress without a scroll', async () => {
    const el = page('progress-target="#art"');
    const art = host.querySelector('#art');
    await scrollToProgress(art, 0.5);
    const before = offset(el);
    art.style.setProperty('height', '9000px');
    await wait(50);
    await settle();
    expect(offset(el)).to.be.above(before + 10);
  });

  it('completion: one event per element (also A → B → A), check for 3 s, cleared on scroll back', async () => {
    const el = page('progress-target="[data-cur]"');
    const a = host.querySelector('#art');
    host.insertAdjacentHTML('afterbegin', '<section id="b"></section>');
    const b = host.querySelector('#b');
    b.style.setProperty('height', '100px'); // shorter than the viewport and in view → read at once
    const got = [];
    host.addEventListener('reading-progress-complete', (e) => got.push(e.detail.target.id));
    a.setAttribute('data-cur', '');
    el.update();
    await scrollToProgress(a, 1);
    expect(got).to.deep.equal(['art']);
    expect(btnOf(el).getAttribute('data-complete')).to.equal('true');
    expect(getComputedStyle(el.querySelector('.td-scroll-top__icon--check')).opacity).to.not.equal('0');
    await scrollToProgress(a, 0.5); // scroll back while the check shows → arrow at once
    expect(btnOf(el).hasAttribute('data-complete')).to.equal(false);
    await scrollToProgress(a, 1); // same element again: no second event, no second check
    expect(got).to.deep.equal(['art']);
    expect(btnOf(el).hasAttribute('data-complete')).to.equal(false);
    // A → B (B is read at once) → A
    a.removeAttribute('data-cur');
    b.setAttribute('data-cur', '');
    window.scrollTo({ top: 0, behavior: 'instant' });
    await settle();
    expect(got).to.deep.equal(['art', 'b']);
    b.removeAttribute('data-cur');
    a.setAttribute('data-cur', '');
    await scrollToProgress(a, 1);
    expect(got).to.deep.equal(['art', 'b']);
  });

  it('the check goes back to the arrow after 3 s', async function () {
    this.timeout(8000);
    const el = page('progress-target="#art"');
    await scrollToProgress(host.querySelector('#art'), 1);
    expect(btnOf(el).getAttribute('data-complete')).to.equal('true');
    await wait(3200);
    expect(btnOf(el).hasAttribute('data-complete')).to.equal(false);
  });

  it('colours: arc = icon colour by default and with color=; ring inside the button box', async () => {
    const el = page('progress-target="#art" color="#1e40af"');
    window.scrollTo({ top: 800, behavior: 'instant' });
    await settle();
    const btn = btnOf(el);
    const arc = getComputedStyle(el.querySelector('.td-scroll-top__arc')).stroke;
    expect(arc).to.equal(getComputedStyle(btn).color);
    const rb = btn.getBoundingClientRect();
    const rr = el.querySelector('.td-scroll-top__ring').getBoundingClientRect();
    expect(rr.left >= rb.left - 0.5 && rr.right <= rb.right + 0.5 && rr.top >= rb.top - 0.5 && rr.bottom <= rb.bottom + 0.5).to.equal(true);
    expect(rb.width).to.be.at.least(44);
  });
});
