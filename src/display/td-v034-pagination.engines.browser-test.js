import { expect } from '@esm-bundle/chai';
import './td-pagination.js';

// v0.34.0 (plan docs/internal/plans/v0.34.0-responsive.md QĐ 8, M2) — td-pagination responsive in Chromium, Firefox AND
// WebKit: the host is a size container; nothing may leave the wrapper on either side; compact form < 480px; status form
// "‹ 57 / 200 ›" < 360px (ADR 0014 amendment: container-only 2xs).
// DOM nodes are compared as booleans: a failing chai assertion carrying DOM nodes hangs the runner.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const host = document.createElement('div');
document.body.appendChild(host);
afterEach(() => { host.innerHTML = ''; });

/** fixed-width wrapper at the top-left of the page (left margin so an element sticking out LEFT stays measurable) */
function mount(width, attrs) {
  const wrap = document.createElement('div');
  wrap.style.setProperty('width', `${width}px`);
  wrap.style.setProperty('margin-left', '40px'); // 40 + 720 stays inside the 800px test viewport (hit-testing)
  host.appendChild(wrap);
  wrap.insertAdjacentHTML('beforeend', `<td-pagination ${attrs}></td-pagination>`);
  return { wrap, el: wrap.firstElementChild };
}

const visible = (node) => node.getClientRects().length > 0 && node.getBoundingClientRect().width > 0;
/** visible page-list sequence ('…' for ellipses) */
const seq = (el) => [...el.querySelectorAll('.td-pagination__pages > li')].filter(visible).map((li) => li.textContent.trim());

/** first / current / last with one ellipsis per side that hides pages */
function compactSeq(cur, last) {
  const out = ['1'];
  if (cur >= 3) out.push('…');
  if (cur !== 1 && cur !== last) out.push(String(cur));
  if (cur <= last - 2) out.push('…');
  if (last !== 1) out.push(String(last));
  return out;
}
/** the ≥ 480 sequence (max-pages 5, unchanged from v0.33) */
function fullSeq(cur, last) {
  if (last <= 5) return Array.from({ length: last }, (_, i) => String(i + 1));
  let start = Math.max(1, Math.min(cur - 2, last - 4));
  const end = start + 4;
  const out = [];
  if (start > 1) { out.push('1'); if (start === 3) out.push('2'); else if (start > 3) out.push('…'); }
  for (let p = start; p <= end; p++) out.push(String(p));
  if (end < last) { if (end === last - 2) out.push(String(last - 1)); else if (end < last - 2) out.push('…'); out.push(String(last)); }
  return out;
}

function expectInside(wrap, el, ctx) {
  const wr = wrap.getBoundingClientRect();
  expect(wrap.scrollWidth, `${ctx}: wrapper scrollWidth`).to.be.at.most(wrap.clientWidth);
  for (const node of [el, ...el.querySelectorAll('*')]) {
    if (!visible(node)) continue;
    const r = node.getBoundingClientRect();
    const name = `${ctx}: ${node.localName}.${node.className.baseVal ?? node.className}`;
    expect(r.left, `${name} left`).to.be.at.least(wr.left - 0.5);
    expect(r.right, `${name} right`).to.be.at.most(wr.right + 0.5);
  }
}

/** visible, inside the wrapper and the topmost element at its centre (= clickable) */
function expectReachable(wrap, btn, ctx) {
  expect(!!btn && visible(btn), `${ctx}: visible`).to.equal(true);
  const r = btn.getBoundingClientRect();
  const wr = wrap.getBoundingClientRect();
  expect(r.left >= wr.left - 0.5 && r.right <= wr.right + 0.5, `${ctx}: inside`).to.equal(true);
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  expect(!!hit && btn.contains(hit), `${ctx}: hit-test`).to.equal(true);
}

const CASES = [
  { total: 2000, cur: 57 },
  { total: 150, cur: 3 },
  { total: 10, cur: 1 },
];
const WIDTHS = [300, 359, 360, 479, 480, 720];

/** visible children of the controls row, by role */
const shownControls = (el) => [...el.querySelectorAll('.td-pagination__controls > *')].filter(visible)
  .map((n) => (n.matches('[data-nav]') ? n.getAttribute('data-nav') : n.classList[0]));

/** the summary line is visually hidden (clip, 1px box) but NOT display:none — it stays the live region */
function expectInfoVisuallyHidden(el, ctx) {
  const info = el.querySelector('.td-pagination__info');
  const cs = getComputedStyle(info);
  expect(cs.display, `${ctx}: info display`).to.not.equal('none');
  expect(cs.visibility, `${ctx}: info visibility`).to.equal('visible');
  const r = info.getBoundingClientRect();
  expect(r.width <= 1 && r.height <= 1, `${ctx}: info visually hidden (${r.width}x${r.height})`).to.equal(true);
}

describe('v0.34.0 td-pagination responsive (QĐ 8)', () => {
  for (const { total, cur } of CASES) {
    for (const w of WIDTHS.filter((x) => x < 360)) {
      it(`${total} items, page ${cur}, container ${w}px: status form "‹ ${cur} / ${Math.ceil(total / 10)} ›"`, async () => {
        const { wrap, el } = mount(w, `total-items="${total}" items-per-page="10" current-page="${cur}"`);
        await frame();
        const last = Math.ceil(total / 10);
        const ctx = `${total}/${cur}@${w}`;
        expectInside(wrap, el, ctx);
        expect(shownControls(el), `${ctx}: only prev / status / next`).to.deep.equal(['prev', 'td-pagination__status', 'next']);
        expect(seq(el), `${ctx}: no page buttons / ellipses`).to.deep.equal([]);
        const status = el.querySelector('.td-pagination__status');
        expect(!!status, `${ctx}: status element`).to.equal(true);
        expect(status.textContent, ctx).to.equal(`${cur} / ${last}`);
        expect(status.getAttribute('aria-hidden'), `${ctx}: status is not a 2nd announcement`).to.equal('true');
        expect(status.hasAttribute('aria-live'), ctx).to.equal(false);
        for (const dir of ['prev', 'next']) {
          const b = el.querySelector(`[data-nav="${dir}"]`);
          expectReachable(wrap, b, `${ctx} ${dir}`);
          const r = b.getBoundingClientRect();
          expect(r.height, `${ctx} ${dir} height`).to.be.at.least(24);
          expect(r.width, `${ctx} ${dir} width`).to.be.at.least(24);
        }
        // one row: prev, status, next vertically aligned
        const mid = (n) => { const r = n.getBoundingClientRect(); return (r.top + r.bottom) / 2; };
        expect(Math.abs(mid(status) - mid(el.querySelector('[data-nav="prev"]'))), `${ctx}: same row`).to.be.below(2);
        expectInfoVisuallyHidden(el, ctx);
        expect(el.querySelectorAll('[aria-live]').length, `${ctx}: one live region`).to.equal(1);
        const currents = el.querySelectorAll('[aria-current="page"]');
        expect(currents.length).to.equal(1);
        expect(currents[0].getAttribute('data-page')).to.equal(String(cur));
      });
    }
    for (const w of WIDTHS.filter((x) => x >= 360)) {
      it(`${total} items, page ${cur}, container ${w}px: inside, reachable, ${w < 480 ? 'compact' : 'full'} sequence`, async () => {
        const { wrap, el } = mount(w, `total-items="${total}" items-per-page="10" current-page="${cur}"`);
        await frame();
        const last = Math.ceil(total / 10);
        const ctx = `${total}/${cur}@${w}`;
        expectInside(wrap, el, ctx);
        const st = el.querySelector('.td-pagination__status');
        expect(!!st && visible(st), `${ctx}: status form off`).to.equal(false);
        expectReachable(wrap, el.querySelector('[data-nav="prev"]'), `${ctx} prev`);
        expectReachable(wrap, el.querySelector('[data-nav="next"]'), `${ctx} next`);
        expectReachable(wrap, el.querySelector('.td-pagination__page[data-page="1"]'), `${ctx} first`);
        expectReachable(wrap, el.querySelector(`.td-pagination__page[data-page="${last}"]`), `${ctx} last`);
        expect(seq(el), ctx).to.deep.equal(w < 480 ? compactSeq(cur, last) : fullSeq(cur, last));
        // aria-current / live region / labels unchanged
        const currents = el.querySelectorAll('[aria-current="page"]');
        expect(currents.length).to.equal(1);
        expect(currents[0].getAttribute('data-page')).to.equal(String(cur));
        expect(visible(currents[0])).to.equal(true);
        expect(el.querySelector('.td-pagination__info').getAttribute('aria-live')).to.equal('polite');
        expect(el.querySelector('[data-nav="prev"]').getAttribute('aria-label')).to.equal('Trang trước');
        // summary row: own full-width row below 480; next to the controls at 720
        const nav = el.querySelector('.td-pagination').getBoundingClientRect();
        const info = el.querySelector('.td-pagination__info').getBoundingClientRect();
        const controls = el.querySelector('.td-pagination__controls').getBoundingClientRect();
        if (w < 480) {
          expect(Math.abs(info.width - nav.width), `${ctx}: info full width`).to.be.below(1);
          expect(info.bottom, `${ctx}: info above controls`).to.be.at.most(controls.top + 0.5);
        } else if (w >= 720) {
          expect(Math.abs((info.top + info.bottom) / 2 - (controls.top + controls.bottom) / 2), `${ctx}: same row`).to.be.below(2);
          expect(info.right, `${ctx}: info before controls`).to.be.at.most(controls.left + 0.5);
        }
      });
    }
  }

  it('compact form (360px): clicking visible items still changes the page', async () => {
    const { wrap, el } = mount(360, 'total-items="2000" items-per-page="10" current-page="57"');
    await frame();
    const got = [];
    el.addEventListener('page-change', (e) => got.push(e.detail.page));
    el.querySelector('.td-pagination__page[data-page="200"]').click();
    expect(el.getAttribute('current-page')).to.equal('200');
    await frame();
    expect(seq(el)).to.deep.equal(['1', '…', '200']);
    el.querySelector('[data-nav="prev"]').click();
    await frame();
    expect(seq(el)).to.deep.equal(['1', '…', '199', '200']);
    expectReachable(wrap, el.querySelector('.td-pagination__page[data-page="199"]'), 'after prev');
    el.querySelector('.td-pagination__page[data-page="1"]').click();
    await frame();
    expect(seq(el)).to.deep.equal(['1', '…', '200']);
    el.querySelector('[data-nav="next"]').click();
    await frame();
    expect(seq(el)).to.deep.equal(['1', '2', '…', '200']);
    expect(got).to.deep.equal([200, 199, 1, 2]);
    expectInside(wrap, el, 'after clicks');
  });

  it('the compact form follows the CONTAINER, not the viewport (wide page, narrow column) and back', async () => {
    const { wrap, el } = mount(720, 'total-items="2000" items-per-page="10" current-page="57"');
    await frame();
    expect(seq(el)).to.deep.equal(fullSeq(57, 200));
    wrap.style.setProperty('width', '400px');
    await frame();
    expect(seq(el)).to.deep.equal(compactSeq(57, 200));
    expectInside(wrap, el, '400');
    wrap.style.setProperty('width', '320px');
    await frame();
    expect(shownControls(el)).to.deep.equal(['prev', 'td-pagination__status', 'next']);
    expectInside(wrap, el, '320');
    wrap.style.setProperty('width', '720px');
    await frame();
    expect(seq(el)).to.deep.equal(fullSeq(57, 200));
  });

  it('data-rel marks every item; regular ellipses always show, gap ellipses only compact', async () => {
    const { el } = mount(720, 'total-items="150" items-per-page="10" current-page="3"');
    await frame();
    const rels = [...el.querySelectorAll('.td-pagination__pages > li')].map((li) => `${li.textContent.trim()}:${li.getAttribute('data-rel')}`);
    expect(rels).to.deep.equal(['1:edge', '…:gap', '2:adjacent', '3:current', '4:adjacent', '5:far', '…:ellipsis', '15:edge']);
  });

  it('status form (359px): next → page 58, status follows, the live region announces once; 360px = compact', async () => {
    const { wrap, el } = mount(359, 'total-items="2000" items-per-page="10" current-page="57"');
    await frame();
    const info = el.querySelector('.td-pagination__info');
    const got = [];
    el.addEventListener('page-change', (e) => got.push(e.detail.page));
    const records = [];
    const mo = new MutationObserver((r) => records.push(...r));
    mo.observe(info, { childList: true, characterData: true, subtree: true });
    el.querySelector('[data-nav="next"]').focus();
    el.querySelector('[data-nav="next"]').click();
    await frame();
    records.push(...mo.takeRecords());
    mo.disconnect();
    expect(got).to.deep.equal([58]);
    expect(el.getAttribute('current-page')).to.equal('58');
    const status = el.querySelector('.td-pagination__status');
    expect(!!status && status.textContent).to.equal('58 / 200');
    expect(el.querySelector('.td-pagination__info') === info, 'same live region node').to.equal(true);
    expect(info.getAttribute('aria-live')).to.equal('polite');
    expect(info.textContent).to.equal('Hiển thị 571-580 / 2000 mục');
    expect(records.length, 'one live-region text change').to.equal(1);
    expect(el.querySelectorAll('[aria-live]').length).to.equal(1);
    const cur = el.querySelectorAll('[aria-current="page"]');
    expect(cur.length).to.equal(1);
    expect(cur[0].getAttribute('data-page')).to.equal('58');
    expect(document.activeElement === el.querySelector('[data-nav="next"]'), 'focus stays on next').to.equal(true);
    expectInside(wrap, el, 'after next');
    el.querySelector('[data-nav="prev"]').click();
    await frame();
    expect(el.querySelector('.td-pagination__status').textContent).to.equal('57 / 200');
    expect(got).to.deep.equal([58, 57]);
    // 360 = the 360–479 compact form
    wrap.style.setProperty('width', '360px');
    await frame();
    expect(visible(el.querySelector('.td-pagination__status'))).to.equal(false);
    expect(seq(el)).to.deep.equal(compactSeq(57, 200));
    expect(info.getBoundingClientRect().width, 'info back on its own row').to.be.above(100);
  });

  it('status form: next to the LAST page keeps focus on the (now aria-disabled) next button, not <body>', async () => {
    const { el } = mount(300, 'total-items="2000" items-per-page="10" current-page="199"');
    await frame();
    const next = el.querySelector('[data-nav="next"]');
    next.focus();
    next.click();
    await frame();
    expect(el.querySelector('.td-pagination__status').textContent).to.equal('200 / 200');
    const now = el.querySelector('[data-nav="next"]');
    expect(now.getAttribute('aria-disabled')).to.equal('true');
    expect(document.activeElement === now, 'focus on next').to.equal(true);
  });

  for (const [label, attrs, text, prevOff, nextOff] of [
    ['one page', 'total-items="5" items-per-page="10" current-page="1"', '1 / 1', true, true],
    ['no items', 'total-items="0" items-per-page="10"', '1 / 1', true, true],
    ['first page', 'total-items="2000" items-per-page="10" current-page="1"', '1 / 200', true, false],
    ['last page', 'total-items="2000" items-per-page="10" current-page="200"', '200 / 200', false, true],
  ]) {
    it(`status form edge case: ${label} → "${text}", prev ${prevOff ? 'disabled' : 'enabled'}, next ${nextOff ? 'disabled' : 'enabled'}`, async () => {
      const { wrap, el } = mount(300, attrs);
      await frame();
      const status = el.querySelector('.td-pagination__status');
      expect(!!status && status.textContent).to.equal(text);
      expect(shownControls(el)).to.deep.equal(['prev', 'td-pagination__status', 'next']);
      const prev = el.querySelector('[data-nav="prev"]');
      const next = el.querySelector('[data-nav="next"]');
      expect(prev.getAttribute('aria-disabled') === 'true').to.equal(prevOff);
      expect(next.getAttribute('aria-disabled') === 'true').to.equal(nextOff);
      const got = [];
      el.addEventListener('page-change', (e) => got.push(e.detail.page));
      if (prevOff) prev.click();
      if (nextOff) next.click();
      await frame();
      expect(got, 'disabled ends do nothing').to.deep.equal([]);
      expect(el.querySelector('.td-pagination__status').textContent).to.equal(text);
      expectInside(wrap, el, label);
    });
  }

  it('even a 120px container never overflows (controls wrap as the last resort)', async () => {
    const { wrap, el } = mount(120, 'total-items="2000" items-per-page="10" current-page="57"');
    await frame();
    expectInside(wrap, el, '120');
    expectReachable(wrap, el.querySelector('[data-nav="prev"]'), '120 prev');
    expectReachable(wrap, el.querySelector('[data-nav="next"]'), '120 next');
  });
});
