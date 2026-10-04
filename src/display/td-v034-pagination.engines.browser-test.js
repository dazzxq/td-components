import { expect } from '@esm-bundle/chai';
import './td-pagination.js';

// v0.34.0 (plan docs/internal/plans/v0.34.0-responsive.md QĐ 8, M2) — td-pagination responsive in Chromium, Firefox AND
// WebKit: the host is a size container; nothing may leave the wrapper on either side; compact form < 480px.
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
const WIDTHS = [300, 360, 479, 480, 720];

describe('v0.34.0 td-pagination responsive (QĐ 8)', () => {
  for (const { total, cur } of CASES) {
    for (const w of WIDTHS) {
      it(`${total} items, page ${cur}, container ${w}px: inside, reachable, ${w < 480 ? 'compact' : 'full'} sequence`, async () => {
        const { wrap, el } = mount(w, `total-items="${total}" items-per-page="10" current-page="${cur}"`);
        await frame();
        const last = Math.ceil(total / 10);
        const ctx = `${total}/${cur}@${w}`;
        expectInside(wrap, el, ctx);
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
    wrap.style.setProperty('width', '320px');
    await frame();
    expect(seq(el)).to.deep.equal(compactSeq(57, 200));
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

  it('even a 120px container never overflows (controls wrap as the last resort)', async () => {
    const { wrap, el } = mount(120, 'total-items="2000" items-per-page="10" current-page="57"');
    await frame();
    expectInside(wrap, el, '120');
    expectReachable(wrap, el.querySelector('[data-nav="prev"]'), '120 prev');
    expectReachable(wrap, el.querySelector('[data-nav="next"]'), '120 next');
  });
});
