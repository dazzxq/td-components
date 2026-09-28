import { expect } from '@esm-bundle/chai';
import { TdScrollTop } from './td-scroll-top.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host; };
const frames = (n = 2) => new Promise((r) => {
  const step = (k) => (k ? requestAnimationFrame(() => step(k - 1)) : r());
  step(n);
});
const labelBackup = TdScrollTop.labels.button;
afterEach(() => {
  host.innerHTML = '';
  window.scrollTo({ top: 0, behavior: 'instant' });
  TdScrollTop.labels.button = labelBackup;
});

/** A page long enough to scroll + the button. */
function page(attrs = '') {
  mount(`<main id="main"><div class="spacer"></div></main><td-scroll-top ${attrs}></td-scroll-top>`);
  host.querySelector('.spacer').style.setProperty('height', '4000px'); // CSSOM (CSP-safe)
  return host.querySelector('td-scroll-top');
}

describe('v0.17.0 E7 — td-scroll-top', () => {
  it('renders a round strong-glass button, hidden (not focusable) at the top', async () => {
    const el = page();
    const btn = el.querySelector('button.td-scroll-top');
    expect(btn.type).to.equal('button');
    expect(btn.classList.contains('td-glass-surface')).to.equal(true);
    expect(btn.classList.contains('td-glass-surface--strong')).to.equal(true);
    expect(btn.getAttribute('aria-label')).to.equal('Lên đầu trang');
    expect(btn.querySelector('svg.td-icon[data-icon="up"]')).to.not.equal(null);
    expect(btn.getAttribute('data-visible')).to.equal('false');
    const cs = getComputedStyle(btn);
    expect(cs.position).to.equal('fixed');
    expect(cs.visibility).to.equal('hidden');
    expect(cs.borderTopLeftRadius).to.equal('50%');
    expect(parseFloat(cs.width)).to.be.at.least(44);
    // Below lightbox / modal / popover.
    const z = Number(cs.zIndex);
    const rootCs = getComputedStyle(document.documentElement);
    for (const t of ['--td-z-lightbox', '--td-z-modal', '--td-z-popover']) {
      expect(z, t).to.be.below(Number(rootCs.getPropertyValue(t)));
    }
  });

  it('shows past the default threshold (400px) and hides again', async () => {
    const el = page();
    const btn = el.querySelector('.td-scroll-top');
    window.scrollTo({ top: 300, behavior: 'instant' });
    await frames(3);
    expect(btn.getAttribute('data-visible')).to.equal('false');
    window.scrollTo({ top: 600, behavior: 'instant' });
    await frames(3);
    expect(btn.getAttribute('data-visible')).to.equal('true');
    expect(getComputedStyle(btn).visibility).to.equal('visible');
    window.scrollTo({ top: 0, behavior: 'instant' });
    await frames(3);
    expect(btn.getAttribute('data-visible')).to.equal('false');
  });

  it('threshold attribute (live) and label attribute / labels', async () => {
    TdScrollTop.labels.button = 'Back to top';
    const el = page('threshold="1000"');
    const btn = el.querySelector('.td-scroll-top');
    expect(btn.getAttribute('aria-label')).to.equal('Back to top');
    window.scrollTo({ top: 600, behavior: 'instant' });
    await frames(3);
    expect(btn.getAttribute('data-visible')).to.equal('false');
    el.setAttribute('threshold', '100');
    expect(btn.getAttribute('data-visible')).to.equal('true');
    el.setAttribute('label', 'Lên trên "đầu"');
    expect(btn.getAttribute('aria-label')).to.equal('Lên trên "đầu"');
    expect(el.querySelectorAll('button').length).to.equal(1); // updated in place, not re-rendered
  });

  it('click scrolls to the top and moves focus to #main (temporary tabindex)', async () => {
    const el = page();
    window.scrollTo({ top: 1500, behavior: 'instant' });
    await frames(3);
    const btn = el.querySelector('.td-scroll-top');
    btn.focus();
    let detail = null;
    el.addEventListener('scroll-top', (e) => { detail = e.detail; });
    btn.click();
    const main = host.querySelector('#main');
    expect(document.activeElement).to.equal(main);
    expect(main.getAttribute('tabindex')).to.equal('-1');
    expect(detail.target).to.equal(main);
    for (let i = 0; i < 100 && window.scrollY > 0; i++) await frames(1);
    expect(window.scrollY).to.equal(0);
    await frames(3);
    expect(btn.getAttribute('data-visible')).to.equal('false');
    main.blur();
    expect(main.hasAttribute('tabindex')).to.equal(false);
  });

  it('target attribute; unknown / invalid selector warns and falls back', async () => {
    const el = page('target="#skip-here"');
    host.insertAdjacentHTML('afterbegin', '<h1 id="skip-here" tabindex="0">Tiêu đề</h1>');
    el.scrollToTop();
    expect(document.activeElement.id).to.equal('skip-here');
    expect(document.activeElement.getAttribute('tabindex')).to.equal('0'); // focusable already: untouched
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => warns.push(a.join(' '));
    try {
      el.setAttribute('target', '[[bad');
      el.scrollToTop();
      expect(document.activeElement.id).to.equal('main');
    } finally { console.warn = orig; }
    expect(warns.length).to.equal(1);
  });

  it('reduced motion → instant jump', async () => {
    const orig = window.matchMedia;
    window.matchMedia = (q) => ({ matches: q.includes('prefers-reduced-motion'), media: q, addEventListener() {}, removeEventListener() {} });
    const origScroll = window.scrollTo;
    const calls = [];
    window.scrollTo = (opts) => { calls.push(opts); };
    try {
      page().scrollToTop();
    } finally {
      window.matchMedia = orig;
      window.scrollTo = origScroll;
    }
    expect(calls).to.deep.equal([{ top: 0, behavior: 'auto' }]);
  });

  it('cleans up scroll listeners on disconnect and re-binds on reconnect', async () => {
    const el = page();
    const btn = () => el.querySelector('.td-scroll-top');
    el.remove();
    window.scrollTo({ top: 900, behavior: 'instant' });
    await frames(3);
    expect(btn().getAttribute('data-visible')).to.equal('false');
    host.appendChild(el);
    await frames(1);
    expect(btn().getAttribute('data-visible')).to.equal('true');
  });
});
