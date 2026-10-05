import { expect } from '@esm-bundle/chai';
import { emulateMedia, setViewport } from '@web/test-runner-commands';
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
// NO static import of the component: <td-carousel> is defined LATE (dynamic import below), after the no-JS checks.

// v0.50.0 (plan docs/internal/plans/v0.50.0-rating-carousel.md C1–C21) — <td-carousel> + td_carousel() (carousel@1) in
// Chromium, Firefox AND WebKit. Server markup = EXACTLY what php/td.php prints for test/ssr/carousel.fixtures.json
// (test/ssr/fixtures/carousel.html, `node test/ssr/build-carousel-fixture.mjs`, kept fresh by test/php/td-ssr-carousel.test.js).
// Scrolling is waited for by POSITION (stable for several frames), never by a fixed sleep: robust on a loaded runner.
await setViewport({ width: 1024, height: 900 });
await emulateMedia({ reducedMotion: 'reduce' }); // instant scrolls for the navigation tests (smooth: its own test)
for (const href of ['/td.css', '/test/fixtures/carousel-page.css']) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
  await new Promise((r) => { link.onload = r; link.onerror = r; });
}

const SPEC = await (await fetch('/test/ssr/carousel.fixtures.json')).json();
const FIXTURE = await (await fetch('/test/ssr/fixtures/carousel.html')).text();
const TPL = document.createElement('template');
TPL.innerHTML = FIXTURE;
const hostHtml = (id) => TPL.content.querySelector(`section[data-case="${id}"] > td-carousel`).outerHTML;

// Chromium: layout shifts of the upgrade (CLS must stay 0 for markup whose prediction is exact)
const shifts = [];
let shiftObs = null;
if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('layout-shift')) {
  shiftObs = new PerformanceObserver((l) => { for (const e of l.getEntries()) shifts.push(e); });
  shiftObs.observe({ type: 'layout-shift', buffered: false });
}

const root = document.createElement('div');
root.style.setProperty('width', '720px');
root.innerHTML = FIXTURE;
document.body.appendChild(root);
const hostOf = (id) => root.querySelector(`section[data-case="${id}"] > td-carousel`);

// hand-written markup (no frame) — wrapped once at the upgrade
const hand = document.createElement('div');
hand.style.setProperty('width', '600px');
hand.innerHTML = '<td-carousel id="hand" label="Viết tay" per-view="2"><div class="h1"><a class="fx-card" href="#h1">1</a></div>'
  + '<div><a class="fx-card" href="#h2">2</a></div><div hidden>ẩn</div><div><img class="fx-img" src="/test/fixtures/1.svg" alt="ảnh" width="400" height="300"></div>'
  + '<div><a class="fx-card" href="#h4">4</a></div></td-carousel>';
document.body.appendChild(hand);

// tampered frames: prev missing, next is a link, an extra node in the controls
const MM = {
  'mm-noprev': hostHtml('c-3').replace(/<button type="button" class="td-carousel__btn" data-td-carousel="prev"[\s\S]*?<\/button>/, ''),
  'mm-link': hostHtml('c-3').replace('<button type="button" class="td-carousel__btn" data-td-carousel="next"', '<a href="javascript:alert(1)" class="td-carousel__btn" data-td-carousel="next"').replace(/<\/svg><\/button><div class="td-carousel__dots"/, '</svg></a><div class="td-carousel__dots"'),
  'mm-extra': hostHtml('c-3').replace('<span class="td-carousel__counter"', '<b onclick="window.__pwned=1">x</b><span class="td-carousel__counter"'),
};
// Codex review S2: frame nodes with the ACCEPTED shape carrying a non-allowlisted attribute → replaced by kit nodes
const c3 = hostHtml('c-3');
const FORBID = {
  'aa-onclick': c3.replace('data-td-carousel="prev"', 'data-td-carousel="prev" onclick="window.__pwned=1"'),
  'aa-form': c3.replace('data-td-carousel="next"', 'data-td-carousel="next" form="f" formaction="https://evil.example/"'),
  'aa-popover': c3.replace('data-td-carousel="prev"', 'data-td-carousel="prev" popovertarget="x"'),
  'aa-style': c3.replace('<span class="td-carousel__counter"', '<span style="position:fixed" class="td-carousel__counter"'),
  'aa-dots': c3.replace('<div class="td-carousel__dots"', '<div onmouseover="window.__pwned=1" class="td-carousel__dots"'),
  'aa-dot': c3.replace('aria-label="Chọn trang"></div>', 'aria-label="Chọn trang"><button type="button" class="td-carousel__dot" onclick="window.__pwned=1"></button><button type="submit" class="td-carousel__dot"></button></div>'),
  'aa-viewport': c3.replace('<div class="td-carousel__viewport">', '<div class="td-carousel__viewport" onscroll="window.__pwned=1">'),
  'aa-track': c3.replace('<div class="td-carousel__track">', '<div class="td-carousel__track" style="display:none">'),
  'aa-status': c3.replace('<p class="td-sr-only" role="status"', '<p class="td-sr-only" role="status" onclick="window.__pwned=1"'),
  'aa-controls': c3.replace('<div class="td-carousel__controls" data-td-js-only>', '<div class="td-carousel__controls" data-td-js-only formaction="x">'),
};
// Codex round 2 (S2 / ISSUE-5): the viewport is validated in EVERY branch, its children are exactly the track
const unwrapTrack = (h) => h.replace('<div class="td-carousel__track">', '').replace('</div></div><div class="td-carousel__controls"', '</div><div class="td-carousel__controls"');
FORBID['vp-notrack-attr'] = unwrapTrack(c3).replace('<div class="td-carousel__viewport">', '<div class="td-carousel__viewport" onclick="window.__pwned=1">');
FORBID['vp-notrack-tag'] = unwrapTrack(c3).replace('<div class="td-carousel__viewport">', '<section class="td-carousel__viewport" onmouseover="window.__pwned=1">')
  .replace('</div><div class="td-carousel__controls"', '</section><div class="td-carousel__controls"');
FORBID['vp-sibling'] = c3.replace('<div class="td-carousel__track">', '<b class="junk" onclick="window.__pwned=1">x</b><div class="td-carousel__track">');
const forbid = document.createElement('div');
forbid.style.setProperty('width', '720px');
forbid.innerHTML = Object.entries(FORBID).map(([id, h]) => h.replace('<td-carousel ', `<td-carousel id="${id}" `)).join('');
document.body.appendChild(forbid);
const forbidBefore = Object.fromEntries(Object.keys(FORBID).map((id) => {
  // (vp-notrack-*: the slides sit straight in the viewport)
  const h = document.getElementById(id);
  return [id, { slides: [...h.querySelectorAll('.td-carousel__slide')], frame: [...h.querySelectorAll('.td-carousel__viewport, .td-carousel__track, .td-carousel__controls, .td-carousel__btn, .td-carousel__counter, .td-carousel__dots, .td-carousel__dot, :scope > p')] }];
}));

const mismatch = document.createElement('div');
mismatch.style.setProperty('width', '720px');
mismatch.innerHTML = Object.entries(MM).map(([id, h]) => h.replace('<td-carousel ', `<td-carousel id="${id}" `)).join('');
document.body.appendChild(mismatch);

// --- before the module: the no-JS state ---
const before = {};
for (const c of SPEC.cases) {
  const host = hostOf(c.id);
  const vp = host.querySelector('.td-carousel__viewport');
  const controls = host.querySelector('.td-carousel__controls');
  before[c.id] = {
    slides: [...host.querySelectorAll('.td-carousel__slide')],
    prev: host.querySelector('[data-td-carousel="prev"]'),
    controls,
    controlsH: controls.getBoundingClientRect().height,
    hostH: host.getBoundingClientRect().height,
    visibility: getComputedStyle(controls).visibility,
    snap: getComputedStyle(vp).scrollSnapType,
    overflow: getComputedStyle(vp).overflowX,
    scrollable: vp.scrollWidth > vp.clientWidth,
    touch: getComputedStyle(vp).touchAction,
  };
}
const handHost = document.getElementById('hand');
const handBefore = {
  kids: [...handHost.children],
  img: handHost.querySelector('img'),
  scrollable: handHost.scrollWidth > handHost.clientWidth,
  snap: getComputedStyle(handHost).scrollSnapType,
};

// C17: the kit never touches image attributes
const imgChanges = [];
const imgMo = new MutationObserver((l) => { for (const m of l) if (m.target.localName === 'img') imgChanges.push(m.attributeName); });
for (const img of document.querySelectorAll('td-carousel img')) {
  imgMo.observe(img, { attributes: true, attributeFilter: ['loading', 'src', 'srcset', 'sizes', 'decoding', 'fetchpriority'] });
}

const events = [];
document.addEventListener('slide-change', (e) => events.push({ id: e.target.id || e.target.closest('section')?.dataset.case, ...e.detail }));
const warns = [];
const origWarn = console.warn;
console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
const t0 = performance.now();
const { TdCarousel } = await import('./td-carousel.js');
console.warn = origWarn;

const raf = () => new Promise((r) => requestAnimationFrame(r));
/** Wait until the viewport's scrollLeft has not moved for 6 frames (max 5 s). */
async function stable(vp) {
  let last = NaN;
  let same = 0;
  const end = performance.now() + 5000;
  while (performance.now() < end) {
    await raf();
    const v = vp.scrollLeft;
    same = Math.abs(v - last) < 0.5 ? same + 1 : 0;
    last = v;
    if (same >= 6) return;
  }
}
/** The logical position (RTL: −scrollLeft). */
const posOf = (vp) => Math.abs(vp.scrollLeft);
const parts = (host) => ({
  vp: host.querySelector('.td-carousel__viewport'),
  prev: host.querySelector('[data-td-carousel="prev"]'),
  next: host.querySelector('[data-td-carousel="next"]'),
  dots: [...host.querySelectorAll('.td-carousel__dot')],
  status: host.querySelector(':scope > p[role="status"]'),
  counter: host.querySelector('.td-carousel__counter'),
  slides: [...host.querySelectorAll('.td-carousel__slide')],
});
const mount = (html, width = '720px', attrs = {}) => {
  const w = document.createElement('div');
  w.style.setProperty('width', width);
  for (const [k, v] of Object.entries(attrs)) w.setAttribute(k, v);
  w.innerHTML = html;
  document.body.appendChild(w);
  return w;
};
/** A fresh copy of a PHP case, mounted (own id). */
const fresh = async (id, newId, width, wrapAttrs) => {
  const w = mount(hostHtml(id).replace('<td-carousel ', `<td-carousel id="${newId}" `), width, wrapAttrs);
  const h = w.querySelector('td-carousel');
  await raf();
  await raf();
  return h;
};

describe('td-carousel — no JS (PHP markup + td.css only)', () => {
  it('the viewport is a native scroll-snap strip (x mandatory), scrollable, touch-action auto', () => {
    for (const id of ['c-3', 'c-8', 'c-img']) {
      expect(before[id].overflow, id).to.equal('auto');
      expect(before[id].snap.startsWith('x mandatory') || before[id].snap === 'x mandatory', `${id} ${before[id].snap}`).to.equal(true);
      expect(before[id].scrollable, id).to.equal(true);
      expect(before[id].touch, id).to.equal('auto');
    }
  });

  it('hand-written children before the upgrade: the host itself is the strip', () => {
    expect(handBefore.scrollable).to.equal(true);
    expect(handBefore.snap.startsWith('x mandatory')).to.equal(true);
  });

  it('the JS-only controls are invisible but keep their box (one page → no box at all)', () => {
    for (const c of SPEC.cases) {
      expect(before[c.id].visibility, c.id).to.equal('hidden');
      if (c.expect.hidden) expect(before[c.id].controlsH, c.id).to.equal(0);
      else expect(before[c.id].controlsH > 0, c.id).to.equal(true);
    }
  });
});

describe('td-carousel — upgrade / hydrate (carousel@1)', () => {
  it('PHP frame adopted in place: slides, buttons, controls keep their identity; marker consumed', () => {
    for (const c of SPEC.cases) {
      const host = hostOf(c.id);
      const p = parts(host);
      expect(host.hasAttribute('data-td-ssr'), c.id).to.equal(false);
      expect(p.slides.length === before[c.id].slides.length && p.slides.every((s, i) => s === before[c.id].slides[i]), `${c.id} slides`).to.equal(true);
      expect(p.prev === before[c.id].prev, `${c.id} prev`).to.equal(true);
      expect(host.querySelector('.td-carousel__controls') === before[c.id].controls, c.id).to.equal(true);
    }
  });

  it('CLS 0: the controls block and the host keep their height through the upgrade (predicted pages = measured)', () => {
    for (const c of SPEC.cases.filter((x) => !x.expect.shift)) {
      const host = hostOf(c.id);
      expect(host.getAttribute('data-td-pages'), c.id).to.equal(String(c.expect.pages));
      expect(host.getAttribute('data-td-rows-narrow'), c.id).to.equal(String(c.expect.narrow));
      expect(host.getAttribute('data-td-rows-wide'), c.id).to.equal(String(c.expect.wide));
      const h = host.querySelector('.td-carousel__controls').getBoundingClientRect().height;
      expect(Math.abs(h - before[c.id].controlsH) < 0.5, `${c.id} controls ${before[c.id].controlsH} → ${h}`).to.equal(true);
      expect(Math.abs(host.getBoundingClientRect().height - before[c.id].hostH) < 0.5, `${c.id} host`).to.equal(true);
    }
    if (shiftObs) {
      shiftObs.takeRecords().forEach((e) => shifts.push(e));
      const noShift = (n) => !n.closest?.('section[data-case="c-on17"]') && root.contains(n);
      const ours = shifts.filter((e) => e.startTime >= t0 - 1 && (e.sources || []).some((s) => s.node && noShift(s.node)));
      expect(ours.map((e) => e.value).reduce((a, b) => a + b, 0)).to.equal(0);
    }
  });

  it('Codex review I3: dots="on" ≤ 2 rows reserves its box (no shift); > 2 rows = the documented one-time shift (≤ the extra rows)', () => {
    const one = hostOf('c-img'); // dots="on", 5 pages → inline / 1 row: reserved
    expect(Math.abs(one.querySelector('.td-carousel__controls').getBoundingClientRect().height - before['c-img'].controlsH) < 0.5).to.equal(true);
    const many = hostOf('c-on17'); // dots="on", 17 pages → 3 rows (no CSS reservation beyond 2)
    expect(many.getAttribute('data-td-rows-wide')).to.equal('3');
    const step = matchMedia('(pointer: coarse)').matches ? 44 : 24;
    const grow = many.querySelector('.td-carousel__controls').getBoundingClientRect().height - before['c-on17'].controlsH;
    expect(grow > 0 && grow <= 3 * step + 0.5, `grew ${grow}px`).to.equal(true);
    expect(parts(many).dots.length).to.equal(17);
  });

  it('dots: one per page (kept rows / inline), counter "k / P", one page → controls hidden', () => {
    expect(parts(hostOf('c-3')).dots.length).to.equal(3);
    expect(parts(hostOf('c-12')).dots.length).to.equal(12);
    expect(parts(hostOf('c-13')).dots.length, 'auto, 13 pages, narrow = counter only but wide keeps 2 rows').to.equal(13);
    expect(parts(hostOf('c-step')).dots.length, 'dots="off"').to.equal(0);
    expect(parts(hostOf('c-3')).counter.textContent).to.equal('1 / 3');
    expect(hostOf('c-one').querySelector('.td-carousel__controls').hidden).to.equal(true);
    // the region / slide semantics (D7)
    const h = hostOf('c-3');
    expect([h.getAttribute('role'), h.getAttribute('aria-roledescription'), h.getAttribute('aria-label')]).to.deep.equal(['region', 'băng chuyền', 'Sản phẩm nổi bật']);
    expect(parts(h).slides.map((s) => s.getAttribute('aria-label'))).to.deep.equal(['1 / 6', '2 / 6', '3 / 6', '4 / 6', '5 / 6', '6 / 6']);
    expect(parts(h).dots[0].getAttribute('aria-current')).to.equal('true');
    expect(parts(h).dots[1].getAttribute('aria-label')).to.equal('Trang 2 / 3');
  });

  it('wide inline layout: the dots sit between the buttons in the DOM (visual = Tab order), counter hidden', () => {
    const c = hostOf('c-3').querySelector('.td-carousel__controls');
    expect([...c.children].map((n) => n.className)).to.deep.equal(['td-carousel__btn', 'td-carousel__dots', 'td-carousel__btn', 'td-carousel__counter']);
    expect(getComputedStyle(c.querySelector('.td-carousel__counter')).display).to.equal('none');
    const rows = hostOf('c-12').querySelector('.td-carousel__controls');
    expect([...rows.children].map((n) => n.className)).to.deep.equal(['td-carousel__btn', 'td-carousel__counter', 'td-carousel__btn', 'td-carousel__dots']);
  });

  it('hand-written: the same nodes are moved into the track (hidden child is not a slide); the image is not reloaded', () => {
    const p = parts(handHost);
    expect(p.slides.length).to.equal(4);
    expect(handBefore.kids.every((k) => p.vp.contains(k))).to.equal(true);
    expect(handHost.querySelector('img') === handBefore.img).to.equal(true);
    expect(handBefore.img.complete).to.equal(true);
    expect(p.slides[3].getAttribute('aria-label')).to.equal('4 / 4');
    expect(handHost.querySelector('[hidden]').classList.contains('td-carousel__slide')).to.equal(false);
  });

  it('tampered controls: broken parts replaced by kit buttons, extra nodes dropped, slides untouched', () => {
    for (const id of Object.keys(MM)) {
      const h = document.getElementById(id);
      const p = parts(h);
      expect(p.prev?.localName, id).to.equal('button');
      expect(p.next?.localName, id).to.equal('button');
      expect(h.querySelector('.td-carousel__controls b') === null, id).to.equal(true);
      expect(h.querySelector('a.td-carousel__btn') === null, id).to.equal(true);
      expect(p.slides.length, id).to.equal(6);
    }
    expect(window.__pwned).to.equal(undefined);
  });

  it('Codex review S2: an accepted-shape frame node with onclick / form / formaction / popovertarget / style is REPLACED; slides kept', () => {
    const ALLOW = {
      'td-carousel__viewport': ['class', 'tabindex', 'aria-label'], 'td-carousel__track': ['class'],
      'td-carousel__controls': ['class', 'data-td-js-only', 'hidden'], 'td-carousel__counter': ['class', 'aria-hidden'],
      'td-carousel__btn': ['class', 'type', 'data-td-carousel', 'aria-label', 'aria-disabled', 'data-td-pressed'],
      'td-carousel__dots': ['class', 'role', 'aria-label'], 'td-carousel__dot': ['class', 'type', 'aria-label', 'aria-current', 'data-td-pressed'],
      'td-sr-only': ['class', 'role', 'aria-live', 'aria-atomic'],
    };
    for (const id of Object.keys(FORBID)) {
      const h = document.getElementById(id);
      const frame = [...h.querySelectorAll('.td-carousel__viewport, .td-carousel__track, .td-carousel__controls, .td-carousel__btn, .td-carousel__counter, .td-carousel__dots, .td-carousel__dot, :scope > p')];
      for (const n of frame) {
        const bad = n.getAttributeNames().filter((a) => !ALLOW[n.className].includes(a));
        expect(bad, `${id} ${n.className}`).to.deep.equal([]);
      }
      for (const b of h.querySelectorAll('button')) expect(b.getAttribute('type'), id).to.equal('button');
      const was = forbidBefore[id];
      expect(was.frame.filter((n) => [...n.attributes].some((a) => !ALLOW[n.className]?.includes(a.name)) && h.contains(n)).length, `${id}: a tampered node survived`).to.equal(0);
      const slides = [...h.querySelectorAll('.td-carousel__slide')];
      const extra = id === 'vp-sibling' ? 1 : 0; // the stray viewport child becomes a slide (same rule as stray host children)
      expect(slides.length === 6 + extra && was.slides.every((s) => slides.includes(s)), `${id} slides`).to.equal(true);
      // structure: host > viewport (div, allowlisted) > exactly ONE child, the track; every slide in the track
      const vp = h.querySelector(':scope > .td-carousel__viewport');
      expect(vp.localName === 'div' && vp.children.length === 1 && vp.firstElementChild.className === 'td-carousel__track', `${id} structure`).to.equal(true);
      expect([...vp.childNodes].every((n) => n === vp.firstElementChild), `${id}: only the track inside the viewport`).to.equal(true);
      expect(h.querySelectorAll('.td-carousel__viewport').length, `${id} one viewport`).to.equal(1);
      expect(parts(h).dots.length, `${id} dots`).to.equal(id === 'vp-sibling' ? 4 : 3);
    }
    for (const n of document.querySelectorAll('#aa-onclick button, #aa-dot button, #aa-status p, #vp-notrack-attr .td-carousel__viewport')) n.click();
    // the stray viewport child is SITE content now (a slide, like a stray host child) — never part of the frame
    expect(document.querySelector('#vp-sibling .junk').parentElement.className).to.equal('td-carousel__track');
    expect(document.querySelector('#vp-sibling .junk').classList.contains('td-carousel__slide')).to.equal(true);
    document.querySelector('#vp-notrack-tag .td-carousel__viewport').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    document.querySelector('#aa-viewport .td-carousel__viewport').dispatchEvent(new Event('scroll'));
    expect(window.__pwned).to.equal(undefined);
  });

  it('Codex review S2: tampering while DETACHED is repaired on re-connect; a clean re-connect keeps every node', async () => {
    const h = await fresh('c-3', 'reconn', '720px');
    const parent = h.parentElement;
    const keep = [...h.querySelectorAll('.td-carousel__viewport, .td-carousel__track, .td-carousel__btn, .td-carousel__dot')];
    h.remove();
    parent.appendChild(h);
    await raf();
    expect([...h.querySelectorAll('.td-carousel__viewport, .td-carousel__track, .td-carousel__btn, .td-carousel__dot')].every((n, i) => n === keep[i])).to.equal(true);
    const prev = parts(h).prev;
    const track = h.querySelector('.td-carousel__track');
    h.remove();
    prev.setAttribute('onclick', 'window.__pwned=1');
    track.setAttribute('style', 'display:none');
    parent.appendChild(h);
    await raf();
    expect(parts(h).prev === prev, 'tampered button replaced').to.equal(false);
    expect(h.querySelector('.td-carousel__track') === track, 'tampered track replaced').to.equal(false);
    expect(h.querySelector('[onclick], [style]:not(.td-carousel__slide)') === null).to.equal(true);
    expect(parts(h).slides.length).to.equal(6);
    parts(h).prev.click();
    expect(window.__pwned).to.equal(undefined);
    // round 2: unwrap the track (slides straight in the viewport) + taint the viewport while detached
    const slides = parts(h).slides;
    const vp = h.querySelector('.td-carousel__viewport');
    const tr = h.querySelector('.td-carousel__track');
    h.remove();
    vp.append(...tr.childNodes);
    tr.remove();
    vp.setAttribute('onclick', 'window.__pwned=1');
    parent.appendChild(h);
    await raf();
    const nvp = h.querySelector(':scope > .td-carousel__viewport');
    expect(nvp === vp, 'tainted viewport replaced').to.equal(false);
    expect(nvp.getAttribute('onclick')).to.equal(null);
    expect(nvp.children.length === 1 && nvp.firstElementChild.className === 'td-carousel__track').to.equal(true);
    expect(parts(h).slides.length === 6 && parts(h).slides.every((s, i) => s === slides[i]), 'slides preserved in order').to.equal(true);
    nvp.click();
    expect(window.__pwned).to.equal(undefined);
    expect(h.pageCount).to.equal(3);
    parent.remove();
  });

  it('Codex review I1: disabled controls, hidden inputs, tabindex=-1, inert / hidden content do not count as focusable', async () => {
    const box = mount('<td-carousel id="nofocus" label="Không focus" per-view="2">'
      + '<div><button type="button" disabled>A</button></div><div><a href="#b" tabindex="-1">B</a></div>'
      + '<div><input type="hidden" name="x" value="1"></div><div inert><a href="#d">D</a></div>'
      + '<div><a href="#e" hidden>E</a><span style="visibility:hidden"><a href="#e2">E2</a></span></div></td-carousel>');
    await raf();
    const vp = parts(box.querySelector('td-carousel')).vp;
    expect(vp.getAttribute('tabindex')).to.equal('0');
    // a real focusable element arrives → the viewport is no longer a Tab stop
    box.querySelector('.td-carousel__slide').insertAdjacentHTML('beforeend', '<a href="#ok">OK</a>');
    await raf();
    expect(vp.hasAttribute('tabindex')).to.equal(false);
    box.remove();
  });

  it('viewport is a Tab stop only when no slide holds a focusable element (C10)', () => {
    expect(parts(hostOf('c-img')).vp.getAttribute('tabindex')).to.equal('0');
    expect(parts(hostOf('c-img')).vp.getAttribute('aria-label')).to.equal('Ảnh sản phẩm');
    expect(parts(hostOf('c-3')).vp.hasAttribute('tabindex')).to.equal(false);
  });

  it('no slide-change while upgrading; no warning for labelled markup; image attributes never touched', () => {
    expect(events.filter((e) => !String(e.id).startsWith('aa-')).length).to.equal(0); // aa-*: clicked on purpose by the S2 test
    expect(warns.filter((w) => w.startsWith('td-carousel')).length).to.equal(0);
    expect(imgChanges).to.deep.equal([]);
  });
});

describe('td-carousel — navigation (LTR)', () => {
  it('next / prev move exactly one page; ends are aria-disabled (focus stays); live region after a button', async () => {
    const h = await fresh('c-3', 'nav', '720px');
    const p = parts(h);
    expect(p.prev.getAttribute('aria-disabled')).to.equal('true');
    expect(p.next.hasAttribute('aria-disabled')).to.equal(false);
    const vpW = p.vp.clientWidth;
    p.next.focus();
    p.next.click();
    await stable(p.vp);
    const slideW = p.slides[0].getBoundingClientRect().width;
    const gap = p.slides[1].getBoundingClientRect().left - p.slides[0].getBoundingClientRect().right;
    expect(Math.abs(posOf(p.vp) - 2 * (slideW + gap)) <= 1, `pos ${posOf(p.vp)} slide ${slideW} gap ${gap} vp ${vpW}`).to.equal(true);
    expect(h.index).to.equal(2);
    expect(h.page).to.equal(1);
    expect(document.activeElement === p.next).to.equal(true);
    await raf();
    expect(p.status.textContent).to.equal('Mục 3–4 / 6');
    expect(p.dots[1].getAttribute('aria-current')).to.equal('true');
    expect(p.counter.textContent).to.equal('2 / 3');
    p.next.click();
    await stable(p.vp);
    expect(p.next.getAttribute('aria-disabled')).to.equal('true');
    expect(document.activeElement === p.next, 'aria-disabled, not disabled: focus kept').to.equal(true);
    const at = posOf(p.vp);
    p.next.click(); // ignored at the end
    await stable(p.vp);
    expect(posOf(p.vp)).to.equal(at);
    p.prev.click();
    await stable(p.vp);
    expect(h.index).to.equal(2);
    const ev = events.filter((e) => e.id === 'nav');
    expect(ev.map((e) => [e.index, e.page, e.pageCount, e.reason])).to.deep.equal([[2, 1, 3, 'button'], [4, 2, 3, 'button'], [2, 1, 3, 'button']]);
    h.parentElement.remove();
  });

  it('dots and API: dot 3 → last page (reason dot); goTo / next / prev (reason api); goTo clamps', async () => {
    const h = await fresh('c-8', 'dots', '720px');
    const p = parts(h);
    p.dots[2].click();
    await stable(p.vp);
    expect(h.index).to.equal(4);
    expect(p.dots[2].getAttribute('aria-current')).to.equal('true');
    h.goTo(99);
    await stable(p.vp);
    expect(h.index).to.equal(14);
    expect(p.next.getAttribute('aria-disabled')).to.equal('true');
    h.prev();
    await stable(p.vp);
    expect(h.index).to.equal(12);
    h.goTo(-3);
    await stable(p.vp);
    expect(h.index).to.equal(0);
    const ev = events.filter((e) => e.id === 'dots').map((e) => `${e.index}:${e.reason}`);
    expect(ev).to.deep.equal(['4:dot', '14:api', '12:api', '0:api']);
    h.parentElement.remove();
  });

  it('user scroll settles → slide-change reason scroll, live region stays silent', async () => {
    const h = await fresh('c-3', 'user', '720px');
    const p = parts(h);
    const w = p.slides[2].getBoundingClientRect().left - p.slides[0].getBoundingClientRect().left;
    p.vp.scrollLeft = w;
    await stable(p.vp);
    // the settle signal: scrollend, or the scroll-idle fallback of engines without it — wait for the EVENT (max 5 s)
    const end = performance.now() + 5000;
    while (!events.some((e) => e.id === 'user') && performance.now() < end) await raf();
    for (let i = 0; i < 10; i++) await raf(); // a second (wrong) event would arrive within these frames
    expect(events.filter((e) => e.id === 'user').map((e) => `${e.index}:${e.reason}`)).to.deep.equal(['2:scroll']);
    expect(p.status.textContent).to.equal('');
    h.parentElement.remove();
  });

  it('step="slide": next moves one slide', async () => {
    const h = await fresh('c-step', 'step', '720px');
    const p = parts(h);
    h.next();
    await stable(p.vp);
    expect(h.index).to.equal(1);
    expect(h.pageCount).to.equal(3);
    h.parentElement.remove();
  });

  it('reduced motion → behavior auto; no-preference → smooth (and the move still lands)', async () => {
    const h = await fresh('c-3', 'motion', '720px');
    const p = parts(h);
    const seen = [];
    const orig = p.vp.scrollTo.bind(p.vp);
    p.vp.scrollTo = (o) => { seen.push(o.behavior); orig(o); };
    h.next();
    await stable(p.vp);
    await emulateMedia({ reducedMotion: 'no-preference' });
    try {
      h.next();
      // smooth: wait for the settled index (scrollend / idle), not for a few still frames before the animation starts
      const end = performance.now() + 5000;
      while (h.index !== 4 && performance.now() < end) await raf();
      expect(h.index).to.equal(4);
    } finally {
      await emulateMedia({ reducedMotion: 'reduce' });
    }
    expect(seen).to.deep.equal(['auto', 'smooth']);
    h.parentElement.remove();
  });
});

describe('td-carousel — layout', () => {
  it('per-view attribute: 2 slides fill the viewport (gap between); token per-view-md responsive; slide-size', async () => {
    const h = await fresh('c-3', 'pv', '720px');
    const p = parts(h);
    const gap = parseFloat(getComputedStyle(p.vp.firstElementChild).columnGap);
    const w = p.slides[0].getBoundingClientRect().width;
    expect(Math.abs(w - (p.vp.clientWidth - gap) / 2) < 1, `w ${w}`).to.equal(true);
    h.style.setProperty('--td-carousel-per-view-md', '3');
    await raf();
    expect(Math.abs(p.slides[0].getBoundingClientRect().width - (p.vp.clientWidth - 2 * gap) / 3) < 1).to.equal(true);
    await raf();
    expect(h.pageCount, 'a token change re-measures (slides observed)').to.equal(2);
    h.parentElement.style.setProperty('width', '400px'); // < 720 container → the base per-view (2) again
    await raf();
    expect(Math.abs(p.slides[0].getBoundingClientRect().width - (p.vp.clientWidth - gap) / 2) < 1).to.equal(true);
    h.style.setProperty('--td-carousel-slide-size', '150px');
    await raf();
    expect(Math.round(p.slides[0].getBoundingClientRect().width)).to.equal(150);
    h.parentElement.remove();
  });

  it('resize keeps the first slide in view; MutationObserver: an added slide is labelled and counted', async () => {
    const h = await fresh('c-8', 'rs', '720px');
    const p = parts(h);
    h.goTo(6);
    await stable(p.vp);
    expect(h.index).to.equal(6);
    h.parentElement.style.setProperty('width', '500px');
    await raf();
    await raf();
    await stable(p.vp);
    const first = p.slides.findIndex((s) => s.getBoundingClientRect().left >= p.vp.getBoundingClientRect().left - 1);
    expect(first).to.equal(6);
    const s = document.createElement('div');
    s.innerHTML = '<a class="fx-card" href="#n">Mới</a>';
    h.querySelector('.td-carousel__track').appendChild(s);
    await raf();
    expect(s.getAttribute('aria-label')).to.equal('17 / 17');
    expect(p.slides[0].getAttribute('aria-label')).to.equal('1 / 17');
    expect(h.pageCount).to.equal(9);
    expect(parts(h).dots.length).to.equal(9);
    h.parentElement.remove();
  });

  it('dots removed while one holds focus → focus goes to the last remaining dot', async () => {
    const h = await fresh('c-8', 'df', '720px');
    const p = parts(h);
    p.dots[7].focus();
    const track = h.querySelector('.td-carousel__track');
    for (let i = 0; i < 6; i++) track.lastElementChild.remove();
    await raf();
    const dots = parts(h).dots;
    expect(dots.length).to.equal(5);
    expect(document.activeElement === dots[4]).to.equal(true);
    h.parentElement.remove();
  });

  it('hidden panel: nothing measured while display:none, measured once shown', async () => {
    const w = mount('', '720px');
    w.style.setProperty('display', 'none');
    w.innerHTML = hostHtml('c-3').replace('<td-carousel ', '<td-carousel id="panel" ');
    const h = w.querySelector('td-carousel');
    await raf();
    w.style.removeProperty('display');
    await raf();
    await raf();
    expect(h.pageCount).to.equal(3);
    expect(parts(h).dots.length).to.equal(3);
    w.remove();
  });

  it('absolutely positioned content inside slides never widens the page (the viewport is a containing block)', async () => {
    const before = document.documentElement.scrollWidth;
    const h = await fresh('c-8', 'abs', '720px');
    for (const sl of parts(h).slides) sl.insertAdjacentHTML('beforeend', '<span class="td-sr-only">ẩn</span>');
    await raf();
    expect(document.documentElement.scrollWidth <= Math.max(before, document.documentElement.clientWidth), `${document.documentElement.scrollWidth}`).to.equal(true);
    h.parentElement.remove();
  });

  it('no periodic timer: idle carousels schedule nothing', async () => {
    const h = await fresh('c-8', 'idle', '720px');
    await stable(parts(h).vp);
    const calls = [];
    const si = window.setInterval;
    const st = window.setTimeout;
    window.setInterval = (...a) => { calls.push('interval'); return si(...a); };
    window.setTimeout = (...a) => { calls.push('timeout'); return st(...a); };
    try {
      for (let i = 0; i < 30; i++) await raf();
    } finally {
      window.setInterval = si;
      window.setTimeout = st;
    }
    expect(calls).to.deep.equal([]);
    h.parentElement.remove();
  });

  it('R13: TdCarousel.labels changed → frame labels rewritten, slides keep identity (and their own label)', async () => {
    const saved = { ...TdCarousel.labels };
    Object.assign(TdCarousel.labels, { prev: 'Previous', next: 'Next', slide: 'Slide {n} of {total}', roleCarousel: 'carousel' });
    try {
      const w = mount(hostHtml('c-3').replace('<td-carousel ', '<td-carousel id="r13" ').replace('aria-label="2 / 6"', 'aria-label="Ốp lưng"'));
      const h = w.querySelector('td-carousel');
      const p = parts(h);
      expect(p.prev.getAttribute('aria-label')).to.equal('Previous');
      expect(h.getAttribute('aria-roledescription')).to.equal('carousel');
      expect(p.slides[0].getAttribute('aria-label')).to.equal('Slide 1 of 6');
      expect(p.slides[1].getAttribute('aria-label'), 'a site label is kept').to.equal('Ốp lưng');
      w.remove();
    } finally {
      Object.assign(TdCarousel.labels, saved);
    }
  });

  it('missing label → default region name + one warning', () => {
    const w = [];
    const ow = console.warn;
    console.warn = (...a) => w.push(a.join(' '));
    const box = mount('<td-carousel><div>a</div><div>b</div></td-carousel>');
    console.warn = ow;
    expect(box.querySelector('td-carousel').getAttribute('aria-label')).to.equal('Băng chuyền');
    expect(w.filter((x) => x.startsWith('td-carousel: give')).length).to.equal(1);
    box.remove();
  });

  it('children appended after the upgrade become slides (JS-built carousel)', async () => {
    const box = mount('<td-carousel label="JS"></td-carousel>');
    const h = box.querySelector('td-carousel');
    for (let i = 0; i < 4; i++) {
      const d = document.createElement('div');
      d.innerHTML = `<a class="fx-card" href="#j${i}">${i}</a>`;
      h.appendChild(d);
    }
    await raf();
    await raf();
    expect(parts(h).slides.length).to.equal(4);
    expect(h.querySelector('.td-carousel__track').children.length).to.equal(4);
    box.remove();
  });
});

describe('td-carousel — RTL (every engine)', () => {
  for (const where of ['page', 'host']) {
    it(`dir="rtl" on the ${where}: slide 1 at the right edge, next scrolls LEFT one page, ends, dots, goTo, read-back`, async () => {
      const html = where === 'host' ? hostHtml('c-3').replace('<td-carousel ', `<td-carousel id="rtl-${where}" dir="rtl" `)
        : hostHtml('c-3').replace('<td-carousel ', `<td-carousel id="rtl-${where}" `);
      const w = mount(html, '720px', where === 'page' ? { dir: 'rtl' } : {});
      const h = w.querySelector('td-carousel');
      await raf();
      const p = parts(h);
      const vr = () => p.vp.getBoundingClientRect();
      expect(Math.abs(p.slides[0].getBoundingClientRect().right - vr().right) <= 1, 'slide 1 at the right edge').to.equal(true);
      expect(p.prev.getAttribute('aria-disabled')).to.equal('true');
      p.next.click();
      await stable(p.vp);
      expect(p.vp.scrollLeft < 0, `standard RTL scrollLeft ${p.vp.scrollLeft}`).to.equal(true);
      expect(Math.abs(p.slides[2].getBoundingClientRect().right - vr().right) <= 1, 'slide 3 at the right edge').to.equal(true);
      expect(h.index).to.equal(2);
      expect(p.prev.hasAttribute('aria-disabled')).to.equal(false);
      p.dots[2].click();
      await stable(p.vp);
      expect(h.index).to.equal(4);
      expect(p.next.getAttribute('aria-disabled')).to.equal('true');
      expect(Math.abs(p.slides[5].getBoundingClientRect().left - vr().left) <= 1, 'last slide flush left').to.equal(true);
      h.goTo(2);
      await stable(p.vp);
      expect(h.index).to.equal(2);
      expect(h.page).to.equal(1);
      // resize keeps the first slide (RTL)
      w.style.setProperty('width', '560px');
      await raf();
      await raf();
      await stable(p.vp);
      expect(Math.abs(p.slides[2].getBoundingClientRect().right - vr().right) <= 1, 'slide 3 still first after resize').to.equal(true);
      // the chevrons follow the direction
      expect(getComputedStyle(p.next.querySelector('svg')).transform).to.match(/matrix\(-1, 0, 0, 1, 0, 0\)/);
      w.remove();
    });
  }
});
