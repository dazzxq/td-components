import { expect } from '@esm-bundle/chai';
import { emulateMedia } from '@web/test-runner-commands';
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
// NO static import of the component: <td-rating> is defined LATE (dynamic import below), after the no-JS checks.

// v0.50.0 (plan docs/internal/plans/v0.50.0-rating-carousel.md R1–R13) — <td-rating> + td_rating() (rating@1) in
// Chromium, Firefox AND WebKit. The server markup is EXACTLY what php/td.php prints for test/ssr/rating.fixtures.json
// (test/ssr/fixtures/rating.html, `node test/ssr/build-rating-fixture.mjs`, kept fresh by test/php/td-ssr-rating.test.js).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const SPEC = await (await fetch('/test/ssr/rating.fixtures.json')).json();
const FIXTURE = await (await fetch('/test/ssr/fixtures/rating.html')).text();
const TPL = document.createElement('template');
TPL.innerHTML = FIXTURE;
const hostHtml = (id) => TPL.content.querySelector(`section[data-case="${id}"] > td-rating`).outerHTML;

const root = document.createElement('div');
root.innerHTML = FIXTURE;
document.body.appendChild(root);
const hostOf = (id) => root.querySelector(`section[data-case="${id}"] > td-rating`);

// tampered markup → not adopted, rendered from the attributes
const MM = {
  'mm-fill': hostHtml('r-half').replace('data-fill="50"', 'data-fill="90"'),
  'mm-label': hostHtml('r-half').replace('4,5 trên 5 sao', '5 trên 5 sao'),
  'mm-extra': hostHtml('r-half').replace('<span class="td-sr-only">', '<b onclick="window.__pwned=1">x</b><span class="td-sr-only">'),
  'mm-stars': hostHtml('r-half').replace(/<span class="td-rating__star" data-fill="100">.*?<\/span>/, ''),
  'mm-schema': hostHtml('r-half').replace('rating@1', 'rating@2'),
};
const mismatch = document.createElement('div');
mismatch.innerHTML = Object.entries(MM).map(([id, h]) => h.replace('<td-rating ', `<td-rating id="${id}" `)).join('');
document.body.appendChild(mismatch);

// no-JS state, captured before the module loads
const before = {};
for (const c of SPEC.cases) {
  const host = hostOf(c.id);
  const stars = [...host.querySelectorAll('.td-rating__star')];
  before[c.id] = {
    stars,
    sr: host.querySelector('.td-sr-only'),
    clip: stars.map((s) => getComputedStyle(s.querySelector('.td-rating__on')).clipPath),
    starW: stars[0] ? stars[0].getBoundingClientRect().width : 0,
    box: host.getBoundingClientRect().toJSON(),
  };
}

const warns = [];
const origWarn = console.warn;
console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
const { TdRating } = await import('./td-rating.js');
console.warn = origWarn;

const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const mount = (html) => {
  const w = document.createElement('div');
  w.innerHTML = html;
  document.body.appendChild(w);
  return w.firstElementChild;
};
/** A <td-rating> created by JS with these attributes (the JS side of the parity). */
const jsRating = (attrs) => {
  const r = document.createElement('td-rating');
  for (const [k, v] of Object.entries(attrs)) r.setAttribute(k, v);
  document.body.appendChild(r);
  return r;
};
const sameChildren = (a, b) => a.childNodes.length === b.childNodes.length && [...a.childNodes].every((n, i) => n.isEqualNode(b.childNodes[i]));

describe('td-rating — no JS (PHP markup + td.css only)', () => {
  it('stars are drawn at the icon size; the half star is clipped at 50 % from the inline-start edge', () => {
    expect(Math.round(before['r-half'].starW)).to.equal(20);
    expect(Math.round(before['r-max10'].starW), 'size s').to.equal(16);
    expect(Math.round(before['r-full'].starW), 'size l').to.equal(24);
    expect(before['r-half'].clip[4]).to.match(/^inset\(0px 50% 0px 0px\)$|^inset\(0px 50% 0px 0%?\)$/);
    expect(before['r-half'].clip[0]).to.match(/^inset\(0px 0% 0px 0px\)$|^inset\(0px 0(px|%)?( 0px)?( 0px)?\)$/);
  });

  it('the accessible text is in the markup; stars + shown value are aria-hidden; no-rating cases print text only', () => {
    expect(before['r-half'].sr.textContent).to.equal('4,5 trên 5 sao');
    const h = hostOf('r-none');
    expect(h.querySelector('.td-rating__stars') === null).to.equal(true);
    expect(h.textContent).to.equal('Chưa có đánh giá');
    expect(h.hasAttribute('data-empty')).to.equal(true);
  });
});

describe('td-rating — hydrate (rating@1)', () => {
  it('every PHP case is adopted IN PLACE (same star nodes) and equals what JS builds from the same attributes', () => {
    for (const c of SPEC.cases) {
      const host = hostOf(c.id);
      expect(host.hasAttribute('data-td-ssr'), c.id).to.equal(false);
      const stars = [...host.querySelectorAll('.td-rating__star')];
      expect(stars.length === before[c.id].stars.length && stars.every((s, i) => s === before[c.id].stars[i]), `${c.id} identity`).to.equal(true);
      const js = jsRating(c.attrs);
      expect(sameChildren(js, host), `${c.id} JS == PHP`).to.equal(true);
      js.remove();
      expect(host.querySelector('.td-sr-only')?.textContent ?? null, c.id).to.equal(c.expect.label);
      expect(stars.map((s) => Number(s.dataset.fill)), c.id).to.deep.equal(c.expect.fills);
    }
  });

  it('tampered markup is re-rendered from the attributes (no extra node survives, nothing runs)', () => {
    const ref = jsRating({ value: '4.5', max: '5', count: '123' });
    for (const id of Object.keys(MM)) {
      const h = document.getElementById(id);
      expect(sameChildren(ref, h), id).to.equal(true);
    }
    ref.remove();
    document.querySelector('#mm-extra .td-sr-only')?.click();
    expect(window.__pwned).to.equal(undefined);
  });

  it('exact precision: the partly filled star gets the exact CSSOM fill over its 10 % step', async () => {
    const host = hostOf('r-exact');
    const star = host.querySelectorAll('.td-rating__star')[3];
    expect(star.dataset.fill).to.equal('40');
    expect(star.style.getPropertyValue('--_td-rating-fill')).to.equal('37%');
    expect(host.querySelectorAll('.td-rating__star')[2].style.getPropertyValue('--_td-rating-fill')).to.equal('');
    expect(star.hasAttribute('style') && /^--_td-rating-fill:\s*37%;?$/.test(star.getAttribute('style').trim())).to.equal(true);
    expect(getComputedStyle(star.querySelector('.td-rating__on')).clipPath).to.match(/63%/);
  });
});

describe('td-rating — behaviour', () => {
  it('attribute / property changes re-render (label, fills, count, empty state)', () => {
    const r = jsRating({ value: '2' });
    expect(r.querySelector('.td-sr-only').textContent).to.equal('2 trên 5 sao');
    r.value = 3.26;
    expect(r.getAttribute('value')).to.equal('3.26');
    expect(r.value).to.equal(3.26);
    expect(r.querySelector('.td-sr-only').textContent).to.equal('3,3 trên 5 sao');
    expect([...r.querySelectorAll('.td-rating__star')].map((s) => s.dataset.fill).join()).to.equal('100,100,100,50,0');
    r.count = 1500;
    expect(r.querySelector('.td-rating__count').textContent).to.equal('(1.500 đánh giá)');
    r.value = null;
    expect(r.hasAttribute('data-empty')).to.equal(true);
    expect(r.querySelector('.td-rating__count') === null).to.equal(true);
    expect(r.textContent).to.equal('Chưa có đánh giá');
    r.value = '5';
    expect(r.hasAttribute('data-empty')).to.equal(false);
    r.remove();
  });

  it('early properties (before define) win; max out of range → 5 + one warning; never focusable', () => {
    const r = document.createElement('td-rating');
    r.setAttribute('max', '11');
    const w = [];
    const ow = console.warn;
    console.warn = (...a) => w.push(a.join(' '));
    document.body.appendChild(r);
    r.value = 4;
    r.setAttribute('value', '3');
    console.warn = ow;
    expect(r.querySelectorAll('.td-rating__star').length).to.equal(5);
    expect(w.filter((x) => x.includes('td-rating: max')).length).to.equal(1);
    expect(r.tabIndex).to.equal(-1);
    expect(r.querySelector('[tabindex], a, button') === null).to.equal(true);
    r.remove();
  });

  it('R13: TdRating.labels changed before the markup upgrades → the PHP texts are replaced by the JS ones', () => {
    const saved = { ...TdRating.labels };
    TdRating.labels.value = '{value}/{max} sao';
    TdRating.labels.count = '{count} lượt';
    try {
      const h = mount(hostHtml('r-half').replace('<td-rating ', '<td-rating id="r13" '));
      expect(h.querySelector('.td-sr-only').textContent).to.equal('4,5/5 sao');
      expect(h.querySelector('.td-rating__count').textContent).to.equal('123 lượt');
      h.parentElement.remove();
    } finally {
      Object.assign(TdRating.labels, saved);
    }
  });

  it('re-connect keeps the nodes while they match', () => {
    const h = mount(hostHtml('r-half').replace('<td-rating ', '<td-rating id="rb" '));
    const star = h.querySelector('.td-rating__star');
    const parent = h.parentElement;
    h.remove();
    parent.appendChild(h);
    expect(h.querySelector('.td-rating__star') === star).to.equal(true);
    parent.remove();
  });

  it('RTL: the fill starts at the right edge (dir on the page and on the host)', async () => {
    const w = mount('<div dir="rtl"><td-rating value="2.5"></td-rating></div>');
    const on = w.querySelectorAll('.td-rating__on')[2];
    expect(getComputedStyle(on).clipPath).to.match(/^inset\(0px 0px 0px 50%\)$/);
    const ltr = mount('<div dir="rtl"><span dir="ltr"><td-rating value="2.5"></td-rating></span></div>');
    expect(getComputedStyle(ltr.querySelectorAll('.td-rating__on')[2]).clipPath).to.match(/^inset\(0px 50% 0px 0px\)$/);
    // the stars line up right-to-left: star 1 is right of star 2
    const s = w.querySelectorAll('.td-rating__star');
    expect(s[0].getBoundingClientRect().left > s[1].getBoundingClientRect().left).to.equal(true);
    w.remove();
    ltr.remove();
  });

  it('one line: the stars never wrap in a narrow column', () => {
    const w = mount('<div><td-rating value="4" max="10" count="99999" show-value></td-rating></div>');
    w.style.width = '60px';
    const stars = [...w.querySelectorAll('.td-rating__star')];
    const tops = new Set(stars.map((s) => Math.round(s.getBoundingClientRect().top)));
    expect(tops.size).to.equal(1);
    w.remove();
  });

  it('colours come from the tokens: filled star = amber fill + warning edge; empty = border-strong', () => {
    const r = jsRating({ value: '1' });
    const on = getComputedStyle(r.querySelector('.td-rating__on'));
    const off = getComputedStyle(r.querySelector('.td-rating__off'));
    expect(on.fill).to.match(/rgb\(245, 158, 11\)/);
    expect(on.stroke).to.match(/rgb\(180, 83, 9\)/);
    expect(off.fill).to.match(/rgb\(212, 212, 216\)/);
    r.remove();
  });

  it('forced colours: filled star CanvasText, empty Canvas with a CanvasText edge (Chromium emulation)', async function () {
    if (!/Chrome/.test(navigator.userAgent)) this.skip();
    await emulateMedia({ forcedColors: 'active' });
    try {
      const r = jsRating({ value: '1' });
      await raf2();
      const on = getComputedStyle(r.querySelector('.td-rating__on'));
      const off = getComputedStyle(r.querySelector('.td-rating__off'));
      expect(on.fill === off.stroke, 'filled = CanvasText = empty edge').to.equal(true);
      expect(on.fill !== off.fill, 'empty fill = Canvas differs').to.equal(true);
      r.remove();
    } finally {
      await emulateMedia({ forcedColors: 'none' });
    }
  });

  it('no warning while adopting valid markup', () => {
    expect(warns.filter((w) => w.startsWith('td-rating')).length).to.equal(0);
  });
});
