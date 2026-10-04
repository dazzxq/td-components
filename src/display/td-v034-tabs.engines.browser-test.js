import { expect } from '@esm-bundle/chai';
import { sendKeys, emulateMedia } from '@web/test-runner-commands';
import './td-tabs.js';

// v0.34.0 (plan docs/internal/plans/v0.34.0-responsive.md QĐ 9, M2) — td-tabs overflow rule in Chromium, Firefox AND
// WebKit: equal slots while the widest tab (active style) fits, else a scrolling row; hysteresis 4px; labels never cut.
// Only real signals (ResizeObserver → rAF → MutationObserver) — no fixed sleeps before geometry.
// DOM nodes are compared as booleans: a failing chai assertion carrying DOM nodes hangs the runner.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(r));
/** RO (frame 1) → mode write in rAF (frame 2) → RO of the resized tabs + indicator (frame 3) → spare */
async function settle(n = 4) { for (let i = 0; i < n; i++) await raf(); }

const host = document.createElement('div');
document.body.appendChild(host);
const roErrors = [];
const onError = (e) => { if (/ResizeObserver/.test(String(e.message))) roErrors.push(e.message); };
window.addEventListener('error', onError);
beforeEach(async () => { await emulateMedia({ reducedMotion: 'reduce' }); }); // indicator rect = target (no transition)
afterEach(async () => {
  host.innerHTML = '';
  expect(roErrors.splice(0)).to.deep.equal([]);
  await emulateMedia({ reducedMotion: 'no-preference' });
});

const SHORT5 = [
  { id: 'a', label: 'Tổng quan' }, { id: 'b', label: 'Đơn hàng' }, { id: 'c', label: 'Khách hàng' },
  { id: 'd', label: 'Sản phẩm' }, { id: 'e', label: 'Báo cáo' },
];
const LONG8 = [
  'Thông tin chung của sản phẩm', 'Thuộc tính và biến thể', 'Hình ảnh minh hoạ', 'Giá bán và khuyến mãi',
  'Tồn kho theo chi nhánh', 'Vận chuyển và đóng gói', 'Tối ưu công cụ tìm kiếm', 'Lịch sử thay đổi',
].map((label, i) => ({ id: `l${i}`, label }));
const ONE_LONG = [{ id: 'x', label: 'Chính sách bảo hành và đổi trả trong ba mươi ngày' },
  ...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((l) => ({ id: l, label: l }))];

function mount(width, tabs, attrs = '') {
  const wrap = document.createElement('div');
  wrap.style.setProperty('width', `${width}px`);
  host.appendChild(wrap);
  wrap.insertAdjacentHTML('beforeend', `<td-tabs ${attrs}></td-tabs>`);
  const el = wrap.firstElementChild;
  el.tabs = tabs;
  return { wrap, el };
}
const list = (el) => el.querySelector('.td-tabs');
const btns = (el) => [...el.querySelectorAll('.td-tabs__tab')];
const isOverflow = (el) => list(el).hasAttribute('data-overflow');

/** the rule's inputs, measured independently of the component (same definition: active style, natural width) */
function metrics(el) {
  const l = list(el);
  l.setAttribute('data-measuring', '');
  const maxOuter = Math.max(...btns(el).map((b) => b.getBoundingClientRect().width));
  l.removeAttribute('data-measuring');
  const cs = getComputedStyle(l);
  const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
    + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
  return { maxOuter, gap: parseFloat(cs.columnGap) || 0, pad, n: btns(el).length };
}
const slotOf = (m, width) => (width - m.pad - m.gap * (m.n - 1)) / m.n;
const widthFor = (m, slot) => slot * m.n + m.gap * (m.n - 1) + m.pad;
/** the approved rule with hysteresis (enter > slot, leave ≤ slot − 4) */
const model = (prev, m, width) => (prev ? m.maxOuter > slotOf(m, width) - 4 : m.maxOuter > slotOf(m, width));
/** too close to an edge for a strict model check (layout rounds to 1/64px) */
const nearEdge = (m, width) => [0, -4].some((d) => Math.abs(m.maxOuter - (slotOf(m, width) + d)) < 0.1);

/** counts data-overflow writes (any node under the host — the trough may be re-rendered) */
function counter(el, attr = 'data-overflow') {
  const recs = [];
  const mo = new MutationObserver((rs) => recs.push(...rs));
  mo.observe(el, { attributes: true, subtree: true, attributeFilter: [attr] });
  return {
    take() { recs.push(...mo.takeRecords()); return recs.splice(0).length; },
    stop() { mo.disconnect(); },
  };
}

/** no label cut, indicator on the active tab, trough scrolls only in overflow mode */
function checkAll(el, ctx) {
  const l = list(el);
  for (const b of btns(el)) {
    const lab = b.querySelector('.td-tabs__label');
    expect(lab.scrollWidth, `${ctx}: label scrollWidth ≤ clientWidth (${lab.textContent})`).to.be.at.most(lab.clientWidth);
    const br = b.getBoundingClientRect();
    const lr = lab.getBoundingClientRect();
    const cs = getComputedStyle(b);
    expect(lr.left, `${ctx}: label inside its tab (${lab.textContent})`).to.be.at.least(br.left + parseFloat(cs.paddingLeft) - 0.5);
    expect(lr.right, `${ctx}: label inside its tab (${lab.textContent})`).to.be.at.most(br.right - parseFloat(cs.paddingRight) + 0.5);
  }
  const active = btns(el).find((b) => b.getAttribute('aria-selected') === 'true');
  const ar = active.getBoundingClientRect();
  const ir = el.querySelector('.td-tabs__indicator').getBoundingClientRect();
  expect(Math.abs(ir.left - ar.left), `${ctx}: indicator x`).to.be.below(1);
  expect(Math.abs(ir.width - ar.width), `${ctx}: indicator width`).to.be.below(1);
  if (isOverflow(el)) {
    expect(getComputedStyle(l).overflowX, `${ctx}: scrolls`).to.equal('auto');
  } else {
    expect(l.scrollWidth, `${ctx}: equal mode does not overflow`).to.be.at.most(l.clientWidth + 1);
    const widths = btns(el).map((b) => b.getBoundingClientRect().width);
    expect(Math.max(...widths) - Math.min(...widths), `${ctx}: equal slots`).to.be.below(1);
  }
}

async function resizeTo(wrap, width) {
  wrap.style.setProperty('width', `${width}px`);
  await settle();
}

describe('v0.34.0 td-tabs overflow rule (QĐ 9)', () => {
  it('800 → 300 → 800 → 300 in 20px steps: correct mode at every step, ≤ 1 data-overflow write per step', async () => {
    const { wrap, el } = mount(800, SHORT5);
    await settle();
    const m = metrics(el);
    let expected = model(false, m, 800);
    expect(isOverflow(el)).to.equal(expected);
    const c = counter(el);
    const path = [];
    for (let w = 780; w >= 300; w -= 20) path.push(w);
    for (let w = 320; w <= 800; w += 20) path.push(w);
    for (let w = 780; w >= 300; w -= 20) path.push(w);
    let flips = 0;
    for (const w of path) {
      await resizeTo(wrap, w);
      const writes = c.take();
      expect(writes, `writes at ${w}`).to.be.at.most(1);
      if (!nearEdge(m, w)) {
        const next = model(expected, m, w);
        expect(isOverflow(el), `mode at ${w}`).to.equal(next);
        expect(writes, `write count at ${w}`).to.equal(next === expected ? 0 : 1);
        if (next !== expected) flips++;
        expected = next;
      } else expected = isOverflow(el);
      checkAll(el, `step ${w}`);
    }
    expect(flips, 'the path crosses the threshold three times').to.equal(3);
    c.stop();
  });

  it('jumps 800 → 300 → 800 → 300: one write per jump', async () => {
    const { wrap, el } = mount(800, SHORT5);
    await settle();
    expect(isOverflow(el)).to.equal(false);
    const c = counter(el);
    for (const [w, want] of [[300, true], [800, false], [300, true], [800, false]]) {
      await resizeTo(wrap, w);
      expect(isOverflow(el), `at ${w}`).to.equal(want);
      expect(c.take(), `writes at ${w}`).to.equal(1);
      checkAll(el, `jump ${w}`);
    }
    c.stop();
  });

  it('holding at slot = maxOuter ± 1, ± 2 (from both sides) for 10 frames → 0 writes', async () => {
    const { wrap, el } = mount(800, SHORT5);
    await settle();
    const m = metrics(el);
    for (const from of [800, 300]) {
      for (const d of [1, -1, 2, -2]) {
        await resizeTo(wrap, from);
        await resizeTo(wrap, widthFor(m, m.maxOuter + d));
        const c = counter(el);
        for (let i = 0; i < 10; i++) await raf();
        expect(c.take(), `from ${from}, slot = maxOuter ${d > 0 ? '+' : ''}${d}`).to.equal(0);
        c.stop();
        // +1 / +2 lie inside the hysteresis band: the mode is the one we came from
        const want = d < 0 ? true : from === 300;
        expect(isOverflow(el), `mode from ${from}, ${d}`).to.equal(want);
        checkAll(el, `hold ${from} ${d}`);
      }
    }
  });

  it('one very long tab + 7 short ones (sum fits, widest does not fit its slot) → overflow, nothing cut', async () => {
    const { wrap, el } = mount(800, ONE_LONG);
    await settle();
    const m = metrics(el);
    const natural = btns(el).map((b) => b.getBoundingClientRect().width); // equal mode → not natural; re-measure below
    expect(natural.length).to.equal(8);
    list(el).setAttribute('data-measuring', '');
    const sum = btns(el).reduce((s, b) => s + b.getBoundingClientRect().width, 0) + m.gap * 7 + m.pad;
    list(el).removeAttribute('data-measuring');
    expect(sum, 'the natural widths fit the trough').to.be.below(wrap.getBoundingClientRect().width);
    expect(m.maxOuter, 'but the widest tab exceeds the equal slot').to.be.above(slotOf(m, 800));
    expect(isOverflow(el)).to.equal(true);
    checkAll(el, 'one long');
  });

  it('changing the active tab at the threshold (slot = maxOuter, +1, −1) by click and arrows → mode unchanged, nothing cut', async () => {
    const { wrap, el } = mount(800, SHORT5, 'activation="auto"');
    await settle();
    const m = metrics(el);
    for (const d of [0, 1, -1]) {
      await resizeTo(wrap, 800);
      await resizeTo(wrap, widthFor(m, m.maxOuter + d));
      const mode = isOverflow(el);
      if (d === -1) expect(mode).to.equal(true);
      if (d === 1) expect(mode).to.equal(false);
      const c = counter(el);
      for (const b of btns(el)) {
        b.click();
        await settle();
        checkAll(el, `click ${b.textContent} at ${d}`);
      }
      btns(el)[0].click();
      btns(el)[0].focus();
      for (let i = 0; i < btns(el).length; i++) {
        await sendKeys({ press: 'ArrowRight' });
        await settle();
        checkAll(el, `arrow ${i} at ${d}`);
      }
      expect(c.take(), `writes while switching tabs at ${d}`).to.equal(0);
      expect(isOverflow(el)).to.equal(mode);
      c.stop();
    }
  });

  it('tabs → long labels enters overflow, short leaves; label / add / remove / size update, never stick', async () => {
    const { el } = mount(600, SHORT5);
    await settle();
    expect(isOverflow(el)).to.equal(false);
    el.tabs = LONG8;
    await settle();
    expect(isOverflow(el), 'long labels').to.equal(true);
    checkAll(el, 'long');
    el.tabs = SHORT5;
    await settle();
    expect(isOverflow(el), 'short again').to.equal(false);
    checkAll(el, 'short');
    // one label grows
    el.tabs = SHORT5.map((t, i) => (i === 2 ? { ...t, label: 'Khách hàng thân thiết lâu năm của cửa hàng' } : t));
    await settle();
    expect(isOverflow(el), 'one long label').to.equal(true);
    checkAll(el, 'one label');
    el.tabs = SHORT5;
    await settle();
    expect(isOverflow(el)).to.equal(false);
    // add tabs until it overflows, then remove them again
    const more = [...SHORT5, ...['Kho', 'Nhân viên', 'Cài đặt', 'Phân quyền', 'Nhật ký'].map((label, i) => ({ id: `m${i}`, label }))];
    el.tabs = more;
    await settle();
    expect(isOverflow(el), '10 tabs in 600px').to.equal(true);
    checkAll(el, 'added');
    el.tabs = more.slice(0, 5);
    await settle();
    expect(isOverflow(el), 'removed').to.equal(false);
    // size change re-measures (data-measuring set + removed once) and stays correct
    const meas = counter(el, 'data-measuring');
    el.setAttribute('size', 'sm');
    expect(meas.take(), 'one measuring pass').to.equal(2);
    await settle();
    expect(isOverflow(el)).to.equal(false);
    checkAll(el, 'size sm');
    meas.stop();
  });

  it('a late web font (document.fonts loadingdone) re-measures once and fixes a stale decision', async () => {
    const { wrap, el } = mount(800, SHORT5);
    await settle();
    const m = metrics(el);
    await resizeTo(wrap, widthFor(m, m.maxOuter + 12));
    expect(isOverflow(el)).to.equal(false);
    // a label gets wider WITHOUT a render (stand-in for a web font swapping in: same nodes, wider glyph run; buttons
    // reset letter-spacing in the UA sheet, so the text itself grows)
    const lab = btns(el)[2].querySelector('.td-tabs__label');
    lab.textContent = `${lab.textContent} thân thiết lâu năm`;
    await settle();
    expect(isOverflow(el), 'stale until a re-measure trigger').to.equal(false);
    const meas = counter(el, 'data-measuring');
    const c = counter(el);
    document.fonts.dispatchEvent(new Event('loadingdone'));
    expect(meas.take(), 'one measuring pass').to.equal(2);
    await settle();
    expect(isOverflow(el), 'overflow after the re-measure').to.equal(true);
    expect(c.take()).to.equal(1);
    checkAll(el, 'font');
    meas.stop();
    c.stop();
  });

  it('a real FontFace loading (data: URL) triggers the same path without errors', async () => {
    const { el } = mount(800, SHORT5);
    await settle();
    const meas = counter(el, 'data-measuring');
    // a broken font still ends the loading cycle (loadingerror) — only check no exception + the rule still holds
    const face = new FontFace('td-test-late', 'url(data:font/woff2;base64,AAAA)');
    document.fonts.add(face);
    try { await face.load(); } catch { /* invalid data is expected */ }
    await settle();
    meas.take();
    document.fonts.delete(face);
    checkAll(el, 'fontface');
    meas.stop();
  });

  it('overflow mode: edge fade attributes follow the scroll; the active tab is scrolled into view', async () => {
    const { el } = mount(320, LONG8);
    await settle();
    const l = list(el);
    expect(isOverflow(el)).to.equal(true);
    expect(l.hasAttribute('data-scroll-start')).to.equal(false);
    expect(l.hasAttribute('data-scroll-end')).to.equal(true);
    expect(getComputedStyle(l).maskImage || getComputedStyle(l).webkitMaskImage).to.match(/gradient/);
    el.setActiveTab('l7');
    await settle();
    const lr = l.getBoundingClientRect();
    const ar = btns(el)[7].getBoundingClientRect();
    expect(ar.left).to.be.at.least(lr.left - 0.5);
    expect(ar.right).to.be.at.most(lr.right + 0.5);
    expect(l.hasAttribute('data-scroll-start')).to.equal(true);
    expect(l.hasAttribute('data-scroll-end')).to.equal(false);
    checkAll(el, 'scrolled to last');
    // the indicator scrolls with the content: scrolling back moves both together
    l.scrollLeft = 0;
    await new Promise((r) => { l.addEventListener('scroll', r, { once: true }); });
    await settle(2);
    expect(l.hasAttribute('data-scroll-start')).to.equal(false);
    expect(l.hasAttribute('data-scroll-end')).to.equal(true);
    checkAll(el, 'scrolled back');
  });

  it('in a 280px grid column the host does not inflate the column', async () => {
    const grid = document.createElement('div');
    // 1fr = minmax(auto, 1fr): a host with a large min-content would widen its column past 280
    for (const [k, v] of [['display', 'grid'], ['grid-template-columns', '1fr 1fr'], ['width', '560px']]) grid.style.setProperty(k, v);
    host.appendChild(grid);
    grid.insertAdjacentHTML('beforeend', '<td-tabs></td-tabs><div></div>');
    const el = grid.firstElementChild;
    el.tabs = LONG8;
    await settle();
    expect(el.getBoundingClientRect().width).to.be.at.most(280.5);
    expect(isOverflow(el)).to.equal(true);
    checkAll(el, 'grid');
  });
});
