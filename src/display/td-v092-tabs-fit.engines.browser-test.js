import { expect } from '@esm-bundle/chai';
import { emulateMedia } from '@web/test-runner-commands';
import './td-tabs.js';

// v0.92.0 (plan docs/internal/plans/v0.92.0-tabs-fit-layout.md) — td-tabs `layout="fit"` in Chromium, Firefox AND WebKit:
// natural-width tabs in a fit-content trough at the start of the row; `equal` (default / unknown value) unchanged; overflow
// decided from the HOST width (need = Σ natural widths + gaps, enter > avail + 1, leave ≤ avail − 4) — including the exit
// once the trough has shrunk to fit-content (Codex plan r1 #1); runtime equal ↔ fit in place (same nodes, focus kept);
// link mode; the --td-tabs-tab-px token. Only real signals (ResizeObserver → rAF). DOM nodes are compared as booleans (a
// failing chai assertion carrying DOM nodes hangs the runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
await document.fonts?.ready;

const raf = () => new Promise((r) => requestAnimationFrame(r));
/** RO (frame 1) → mode write in rAF (frame 2) → RO of the resized tabs + indicator (frame 3) → spare */
async function settle(n = 4) { for (let i = 0; i < n; i++) await raf(); }

const host = document.createElement('div');
document.body.appendChild(host);
const roErrors = [];
window.addEventListener('error', (e) => { if (/ResizeObserver/.test(String(e.message))) roErrors.push(e.message); });
beforeEach(async () => { await emulateMedia({ reducedMotion: 'reduce' }); }); // indicator rect = target (no transition)
afterEach(async () => {
  host.innerHTML = '';
  document.adoptedStyleSheets = [];
  expect(roErrors.splice(0)).to.deep.equal([]);
  await emulateMedia({ reducedMotion: 'no-preference' });
});

const TWO = [{ id: 'info', label: 'Thông tin phiếu' }, { id: 'history', label: 'Lịch sử' }];
const FIVE = [
  { id: 'a', label: 'Tổng quan' }, { id: 'b', label: 'Đơn hàng' }, { id: 'c', label: 'Khách hàng' },
  { id: 'd', label: 'Sản phẩm' }, { id: 'e', label: 'Báo cáo' },
];
/** sum fits a 700px row, but the widest tab does not fit an equal slot → equal overflows, fit does not */
const ONE_LONG = [{ id: 'x', label: 'Chính sách bảo hành và đổi trả trong ba mươi ngày' },
  ...['A', 'B', 'C', 'D', 'E', 'F'].map((l) => ({ id: l, label: l }))];

async function mount(width, tabs, attrs = {}) {
  const wrap = document.createElement('div');
  wrap.style.setProperty('width', `${width}px`);
  host.appendChild(wrap);
  const el = document.createElement('td-tabs');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.tabs = tabs;
  wrap.appendChild(el);
  await settle();
  return { wrap, el };
}
const list = (el) => el.querySelector(':scope > .td-tabs');
const btns = (el) => [...el.querySelectorAll('.td-tabs__tab')];
const isOverflow = (el) => list(el).hasAttribute('data-overflow');
const rect = (n) => n.getBoundingClientRect();
async function resizeTo(wrap, width) {
  wrap.style.setProperty('width', `${width}px`);
  await settle();
}

/** the fit rule's inputs, measured independently (same definition: active style, natural width) */
function fitMetrics(el) {
  const l = list(el);
  l.setAttribute('data-measuring', '');
  const sum = btns(el).reduce((s, b) => s + rect(b).width, 0);
  l.removeAttribute('data-measuring');
  const cs = getComputedStyle(l);
  const edge = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
    + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
  const gap = parseFloat(cs.columnGap) || 0;
  const n = btns(el).length;
  return { need: sum + gap * (n - 1), edge };
}
/** host width (block host = wrap width) at which avail = need + d */
const hostFor = (m, d) => m.need + m.edge + d;

function counter(el) {
  const recs = [];
  const mo = new MutationObserver((rs) => recs.push(...rs));
  mo.observe(el, { attributes: true, subtree: true, attributeFilter: ['data-overflow'] });
  return {
    take() { recs.push(...mo.takeRecords()); return recs.splice(0).length; },
    stop() { mo.disconnect(); },
  };
}

function checkIndicator(el, ctx) {
  const active = btns(el).find((b) => b.getAttribute('aria-selected') === 'true' || b.getAttribute('aria-current') === 'page');
  const ar = rect(active);
  const ir = rect(el.querySelector('.td-tabs__indicator'));
  expect(Math.abs(ir.left - ar.left), `${ctx}: indicator x`).to.be.below(1);
  expect(Math.abs(ir.width - ar.width), `${ctx}: indicator width`).to.be.below(1);
}

/** fit and NOT overflowing: natural-width tabs (label + 2 × tab-px), trough hugging them at the start of the host */
function checkFitHug(el, ctx, px = 12) {
  const l = list(el);
  expect(isOverflow(el), `${ctx}: no data-overflow`).to.equal(false);
  for (const b of btns(el)) {
    const lab = b.querySelector('.td-tabs__label');
    expect(Math.abs(rect(b).width - rect(lab).width - 2 * px), `${ctx}: tab = label + 2 × ${px}px (${lab.textContent})`)
      .to.be.below(1);
  }
  const m = fitMetrics(el);
  expect(Math.abs(rect(l).width - (m.need + m.edge)), `${ctx}: trough = Σ tabs + gaps + padding`).to.be.below(1);
  expect(Math.abs(rect(l).left - rect(el).left), `${ctx}: trough at the start of the row`).to.be.below(0.5);
  expect(l.scrollWidth, `${ctx}: nothing hidden`).to.be.at.most(l.clientWidth + 1);
  checkIndicator(el, ctx);
}

describe('v0.92.0 td-tabs layout="fit"', () => {
  it('default and an unknown layout value = equal: no td-tabs--fit, the class is unchanged, equal slots', async () => {
    for (const attrs of [{}, { layout: 'bogus' }, { layout: 'equal' }]) {
      const { el } = await mount(1000, TWO, attrs);
      const ctx = JSON.stringify(attrs);
      expect(list(el).className, ctx).to.equal('td-tabs td-tabs--md');
      const widths = btns(el).map((b) => rect(b).width);
      expect(Math.abs(widths[0] - widths[1]), `${ctx}: equal slots`).to.be.below(1);
      expect(widths[0], `${ctx}: each tab takes half the row`).to.be.above(450);
      expect(isOverflow(el), ctx).to.equal(false);
      checkIndicator(el, ctx);
      host.innerHTML = '';
    }
  });

  it('fit in a wide host: tabs as wide as their text, the trough hugs them, no overflow; size="sm" keeps the modifier', async () => {
    const { el } = await mount(1000, TWO, { layout: 'fit' });
    expect(list(el).className).to.equal('td-tabs td-tabs--md td-tabs--fit');
    for (const b of btns(el)) expect(rect(b).width, 'a short tab stays narrow').to.be.below(200);
    expect(rect(list(el)).width, 'trough ≪ host').to.be.below(400);
    checkFitHug(el, 'fit wide');
    el.setActiveTab('history');
    await settle();
    checkIndicator(el, 'fit second tab');
    el.setAttribute('size', 'sm');
    await settle();
    expect(list(el).className).to.equal('td-tabs td-tabs--sm td-tabs--fit');
    checkFitHug(el, 'fit sm');
  });

  it('fit narrower than the tabs → data-overflow, trough = host width, scrolls; labels never cut', async () => {
    const probe = await mount(1000, FIVE, { layout: 'fit' });
    const m = fitMetrics(probe.el);
    host.innerHTML = '';
    const width = Math.round(m.need / 2);
    const { el } = await mount(width, FIVE, { layout: 'fit' });
    const l = list(el);
    expect(isOverflow(el)).to.equal(true);
    expect(Math.abs(rect(l).width - width), 'trough clamped to the host').to.be.below(1);
    expect(getComputedStyle(l).overflowX).to.equal('auto');
    expect(l.scrollWidth, 'content wider than the trough').to.be.above(l.clientWidth + 10);
    for (const b of btns(el)) {
      const lab = b.querySelector('.td-tabs__label');
      expect(lab.scrollWidth, `label not cut (${lab.textContent})`).to.be.at.most(lab.clientWidth);
    }
    checkIndicator(el, 'fit overflow');
  });

  it('grow the host → leaves overflow although the trough had shrunk to fit-content; shrink → overflows again (hysteresis)', async () => {
    const { wrap, el } = await mount(1000, FIVE, { layout: 'fit' });
    const m = fitMetrics(el);
    const c = counter(el);
    // [avail − need, expected mode]: enter only > avail + 1, leave only ≤ avail − 4
    const path = [
      [-40, true], // narrow: overflow
      [40, false], // Codex r1 #1 regression: wide again → MUST leave overflow
      [-40, true], // shrink: overflow again
      [2, true], // inside the band from overflow (need > avail − 4): stays
      [5, false], // ≤ avail − 4: leaves
      [0, false], // need = avail from the fit side: stays (enter needs > avail + 1)
      [-3, true], // enters
      [300, false],
    ];
    let prev = false;
    for (const [d, want] of path) {
      await resizeTo(wrap, hostFor(m, d));
      expect(isOverflow(el), `avail − need = ${d}`).to.equal(want);
      expect(c.take(), `writes at ${d}`).to.equal(want === prev ? 0 : 1);
      if (!want) checkFitHug(el, `d=${d}`);
      else checkIndicator(el, `d=${d}`);
      prev = want;
    }
    // holding inside the band (from both sides) for 10 frames: no flip-flop
    await resizeTo(wrap, hostFor(m, 2));
    expect(isOverflow(el), 'band from the fit side').to.equal(false);
    await resizeTo(wrap, hostFor(m, -40));
    await resizeTo(wrap, hostFor(m, 2));
    expect(isOverflow(el), 'band from the overflow side').to.equal(true);
    c.take();
    const cc = counter(el);
    for (let i = 0; i < 10; i++) await raf();
    expect(cc.take()).to.equal(0);
    cc.stop();
    c.stop();
  });

  it('layout changed at runtime (equal ↔ fit): class in place, the same buttons, focus kept, correct overflow decision', async () => {
    const { el } = await mount(700, ONE_LONG);
    expect(isOverflow(el), 'equal: the widest tab does not fit a slot').to.equal(true);
    const before = btns(el);
    const troughBefore = list(el);
    before[2].focus();
    expect(document.activeElement === before[2]).to.equal(true);

    el.setAttribute('layout', 'fit');
    await settle();
    expect(list(el) === troughBefore, 'same trough').to.equal(true);
    expect(btns(el).every((b, i) => b === before[i]), 'same buttons (no re-render)').to.equal(true);
    expect(document.activeElement === before[2], 'focus kept').to.equal(true);
    expect(list(el).className).to.equal('td-tabs td-tabs--md td-tabs--fit');
    expect(isOverflow(el), 'fit: the sum fits').to.equal(false);
    checkFitHug(el, 'switched to fit');

    // fit → equal → fit in a wide host: never a transient data-overflow write (the stale fit-content width is not used)
    el.setAttribute('layout', 'equal');
    await settle();
    expect(list(el).className).to.equal('td-tabs td-tabs--md');
    expect(isOverflow(el), 'equal again: overflow').to.equal(true);
    expect(document.activeElement === before[2], 'focus kept').to.equal(true);
    el.tabs = FIVE;
    await settle();
    const five = btns(el);
    expect(isOverflow(el), 'equal, 5 short tabs fit').to.equal(false);
    const c = counter(el);
    for (const v of ['fit', 'equal', 'fit', 'nope']) {
      el.setAttribute('layout', v);
      await settle();
      expect(isOverflow(el), v).to.equal(false);
    }
    expect(c.take(), 'no data-overflow writes while switching in a wide host').to.equal(0);
    c.stop();
    expect(btns(el).every((b, i) => b === five[i])).to.equal(true);
    expect(list(el).className).to.equal('td-tabs td-tabs--md');
    const widths = btns(el).map((b) => rect(b).width);
    expect(Math.max(...widths) - Math.min(...widths), 'equal slots back').to.be.below(1);
  });

  it('link mode + fit: <nav class="… td-tabs--fit">, hugging links, the current page indicator', async () => {
    const tabs = [
      { id: 'tg', label: 'Telegram', href: '#tg' }, { id: 'sp', label: 'SePay', href: '#sp', count: 3 },
      { id: 'gh', label: 'GHTK', href: '#gh' },
    ];
    const { el } = await mount(1000, tabs, { layout: 'fit', 'active-tab': 'sp' });
    const nav = list(el);
    expect(nav.tagName).to.equal('NAV');
    expect(nav.className).to.equal('td-tabs td-tabs--md td-tabs--fit');
    expect(isOverflow(el)).to.equal(false);
    const m = fitMetrics(el);
    expect(Math.abs(rect(nav).width - (m.need + m.edge)), 'nav hugs the links').to.be.below(1);
    checkIndicator(el, 'link fit');
    el.removeAttribute('layout');
    await settle();
    expect(nav.className).to.equal('td-tabs td-tabs--md');
    expect(Math.abs(rect(nav).width - 1000)).to.be.below(1);
  });

  it('--td-tabs-tab-px on the host sets the tab inline padding (fit and equal, md and sm); default 12px', async () => {
    const { el } = await mount(1000, TWO, { layout: 'fit' });
    expect(getComputedStyle(btns(el)[0]).paddingInlineStart).to.equal('12px');
    el.style.setProperty('--td-tabs-tab-px', '20px');
    await settle();
    for (const [attr, v] of [['layout', 'fit'], ['size', 'sm'], ['layout', 'equal'], ['size', 'md']]) {
      el.setAttribute(attr, v);
      await settle();
      const cs = getComputedStyle(btns(el)[0]);
      expect(cs.paddingInlineStart, `${attr}=${v}`).to.equal('20px');
      expect(cs.paddingInlineEnd, `${attr}=${v}`).to.equal('20px');
    }
    el.setAttribute('layout', 'fit');
    await settle();
    checkFitHug(el, 'tab-px 20', 20);
    expect(getComputedStyle(btns(el)[0]).paddingTop, 'vertical padding unchanged (md)').to.equal('8px');
  });

  it('docs recipe: `td-tabs[layout="fit"] > .td-tabs { margin-inline: auto }` centres the trough', async () => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('td-tabs[layout="fit"] > .td-tabs { margin-inline: auto; }');
    document.adoptedStyleSheets = [sheet];
    const { el } = await mount(1000, TWO, { layout: 'fit' });
    const l = rect(list(el));
    const h = rect(el);
    expect(Math.abs((l.left - h.left) - (h.right - l.right)), 'centred').to.be.below(1);
    expect(isOverflow(el)).to.equal(false);
    checkIndicator(el, 'centred');
  });
});
