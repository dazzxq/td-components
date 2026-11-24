import { expect } from '@esm-bundle/chai';
import { setViewport, sendMouse, sendKeys, resetMouse } from '@web/test-runner-commands';
import './td-table.js';

// v0.123.0 (plan docs/internal/plans/v0.123.0-table-sticky-column.md) — td-table column `sticky: 'end'`: the LAST column is
// pinned to the inline-end edge of the horizontal scroll frame (th + body cells), solid fill that matches a normal cell of the
// same row (plain / zebra / hover / selected / selected + hover), divider + shadow only while content hides behind it
// (root [data-sticky-covered]), z-order with the sticky header, focus kept clear of the column, hidden column → nothing
// pinned, card mode → no pinning, off → no class / attribute. 1440 and 390 with layout="table". LTR only (owner: no RTL).
// Chromium, Firefox, WebKit. The real :hover rows need a focused page (see POINTER_FILES of web-test-runner.config.js).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const root = document.createElement('div');
document.body.appendChild(root);
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const frames = async (n = 2) => { for (let i = 0; i < n; i++) await raf(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

afterEach(async () => {
  await resetMouse();
  root.innerHTML = '';
});
after(async () => { await setViewport({ width: 800, height: 600 }); });

const ROWS = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, c0: `Dòng ${i + 1}`, c1: 'Giá trị', c2: 'Giá trị', c3: 'Giá trị', c4: 'Giá trị' }));
const btn = (label) => () => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `probe-${label}`;
  b.textContent = label;
  return b;
};
const COLS = (sticky = 'end', extra = {}) => [
  { key: 'c0', label: 'Tên', minWidth: '200px' },
  { key: 'c1', label: 'Cột 1', minWidth: '200px' },
  { key: 'c2', label: 'Cột 2', minWidth: '200px' },
  { key: 'c3', label: 'Cột 3', minWidth: '200px' },
  { key: 'c4', label: 'Cột 4', minWidth: '200px', render: btn('a') },
  { key: 'ops', label: 'Thao tác', minWidth: '120px', render: btn('b'), ...(sticky ? { sticky } : {}), ...extra },
];

async function mk(attrs = 'layout="table"', { columns = COLS(), data = ROWS, width = 700 } = {}) {
  const wrap = document.createElement('div');
  wrap.style.width = `${Math.min(width, window.innerWidth - 24)}px`;
  wrap.innerHTML = `<td-table ${attrs}></td-table>`;
  root.appendChild(wrap);
  const el = wrap.querySelector('td-table');
  el.columns = columns;
  el.data = data;
  await frames(3);
  return el;
}
const scrollOf = (el) => el.querySelector('.td-table__scroll');
const rootOf = (el) => el.querySelector('.td-table');
const pinTh = (el) => el.querySelector('thead .td-table__sticky-end');
const pinTd = (el, i = 0) => el.querySelectorAll('tbody > tr')[i].querySelector('td.td-table__sticky-end');
const frameRight = (s) => s.getBoundingClientRect().left + s.clientLeft + s.clientWidth;
async function scrollTo(s, x, y) {
  s.scrollLeft = x;
  if (y != null) s.scrollTop = y;
  await frames(3);
}

// ---- colour helpers: composite what is really painted (canvas does the blending, whatever syntax the engine serialises) ----
const cv = document.createElement('canvas');
cv.width = 1;
cv.height = 1;
const cx = cv.getContext('2d', { willReadFrequently: true });
function over(layers) { // bottom → top
  cx.clearRect(0, 0, 1, 1);
  for (const c of layers) {
    cx.fillStyle = c;
    cx.fillRect(0, 0, 1, 1);
  }
  const d = cx.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}
function gradientColors(img) { // top → bottom, the first colour of every linear-gradient()
  const out = [];
  let i = 0;
  while ((i = img.indexOf('linear-gradient(', i)) !== -1) {
    let depth = 0;
    let j = i + 'linear-gradient'.length;
    const start = j + 1;
    let end = img.length;
    for (; j < img.length; j++) {
      if (img[j] === '(') depth++;
      else if (img[j] === ')') { depth--; if (!depth) { end = j; break; } }
    }
    const inner = img.slice(start, end);
    let d2 = 0;
    let k = 0;
    for (; k < inner.length; k++) {
      const ch = inner[k];
      if (ch === '(') d2++;
      else if (ch === ')') d2--;
      else if (ch === ',' && !d2) break;
    }
    let seg = inner.slice(0, k).trim();
    const last = seg.lastIndexOf(')');
    if (last >= 0) seg = seg.slice(0, last + 1);
    out.push(seg);
    i = end + 1;
  }
  return out;
}
function paint(el, base) {
  const cs = getComputedStyle(el);
  return over([base, cs.backgroundColor, ...gradientColors(cs.backgroundImage).reverse()]);
}
const near = (a, b, tol = 1) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
/** What the pinned body cell paints vs what a normal cell of the same row paints (the row's own background). */
function paints(el, i) {
  const s = scrollOf(el);
  const base = getComputedStyle(s).backgroundColor;
  const tr = el.querySelectorAll('tbody > tr')[i];
  return { normal: paint(tr, base), pinned: paint(tr.querySelector('td.td-table__sticky-end'), base) };
}
async function hoverRow(el, i) {
  const c = el.querySelectorAll('tbody > tr')[i].querySelector('td[data-col="0"]');
  const r = c.getBoundingClientRect();
  await sendMouse({ type: 'move', position: [Math.round(r.left + 20), Math.round(r.top + r.height / 2)] });
  await sleep(450); // the row background transitions (--td-dur-fast)
}

for (const vw of [1440, 390]) {
  describe(`td-table sticky end — viewport ${vw}, layout="table"`, () => {
    before(async () => { await setViewport({ width: vw, height: 800 }); });

    it('pins the last column to the inline-end edge at the start, the middle and the end of the scroll; the root flag follows', async () => {
      const el = await mk();
      const s = scrollOf(el);
      expect(s.scrollWidth).to.be.greaterThan(s.clientWidth + 100);
      expect(rootOf(el).classList.contains('td-table--sticky-end')).to.equal(true);
      for (const [x, covered] of [[0, true], [Math.round((s.scrollWidth - s.clientWidth) / 2), true], [s.scrollWidth - s.clientWidth, false]]) {
        await scrollTo(s, x);
        for (const cell of [pinTh(el), pinTd(el, 0), pinTd(el, 7)]) {
          expect(cell.getBoundingClientRect().right, `pinned cell right at scrollLeft ${x}`).to.be.closeTo(frameRight(s), 1.01);
        }
        expect(rootOf(el).hasAttribute('data-sticky-covered'), `covered at scrollLeft ${x}`).to.equal(covered);
      }
    });

    it('the divider is transparent at rest and --td-table-border while covered; the shadow sits outside the inline-start edge', async () => {
      const el = await mk();
      const s = scrollOf(el);
      await scrollTo(s, 0);
      const td = pinTd(el, 1);
      const w = (cell) => getComputedStyle(cell).borderInlineStartWidth;
      expect(w(td)).to.equal('1px');
      expect(getComputedStyle(td).borderInlineStartColor).to.not.equal('rgba(0, 0, 0, 0)');
      const after = getComputedStyle(td, '::after');
      expect(after.position).to.equal('absolute');
      expect(after.pointerEvents).to.equal('none');
      expect(after.backgroundImage).to.contain('linear-gradient');
      await scrollTo(s, s.scrollWidth - s.clientWidth);
      expect(getComputedStyle(td).borderInlineStartColor).to.equal('rgba(0, 0, 0, 0)');
      expect(w(td)).to.equal('1px'); // no layout jump
    });

    it('the body cell paints the same colour as a normal cell of the row: plain, zebra, hover, selected, selected + hover', async () => {
      const el = await mk('layout="table" zebra selectable row-key="id"');
      const s = scrollOf(el);
      await scrollTo(s, 0);
      el.selectedKeys = [3];
      await sleep(450); // the row background transitions (--td-dur-fast)
      const rows = el.querySelectorAll('tbody > tr');
      expect(rows[3].hasAttribute('data-selected')).to.equal(false);
      expect(rows[2].hasAttribute('data-selected')).to.equal(true);
      const check = (i, label) => {
        const { normal, pinned } = paints(el, i);
        expect(pinned[3], `${label}: pinned fill is opaque`).to.equal(255);
        expect(near(normal, pinned), `${label}: normal ${normal} vs pinned ${pinned}`).to.equal(true);
      };
      check(0, 'plain (odd row)');
      check(1, 'zebra (even row)');
      check(2, 'selected');
      await hoverRow(el, 0);
      expect(rows[0].matches(':hover'), 'row 0 is really hovered').to.equal(true);
      check(0, 'hover');
      await hoverRow(el, 2);
      expect(rows[2].matches(':hover')).to.equal(true);
      check(2, 'selected + hover');
      // the tint really differs between the states (the check above is not vacuous)
      const sel = paints(el, 2).normal;
      const plain = paints(el, 4).normal;
      expect(near(sel, plain, 1)).to.equal(false);
      // the header cell is the opaque sticky header fill, whatever the head tint
      expect(paint(pinTh(el), 'rgb(255, 255, 255)')[3]).to.equal(255);
      expect(getComputedStyle(pinTh(el)).backgroundColor).to.equal(getComputedStyle(el.querySelector('thead th[data-col="0"]')).backgroundColor);
    });

    it('scroll-padding-inline-end follows the pinned header width', async () => {
      const el = await mk();
      const s = scrollOf(el);
      const w = pinTh(el).offsetWidth;
      expect(w).to.be.greaterThan(60);
      expect(s.style.getPropertyValue('--td-table-sticky-end-w')).to.equal(`${w}px`);
      expect(parseFloat(getComputedStyle(s).scrollPaddingRight)).to.be.closeTo(w, 0.5);
    });

    it('with max-height: corner z-index > other headers > pinned body cells; the corner wins hit testing when scrolled both ways', async () => {
      const el = await mk('layout="table" max-height="260px"');
      const s = scrollOf(el);
      expect(s.scrollHeight).to.be.greaterThan(s.clientHeight + 40);
      await scrollTo(s, Math.round((s.scrollWidth - s.clientWidth) / 2), 60);
      const z = (n) => Number(getComputedStyle(n).zIndex);
      const corner = pinTh(el);
      const otherTh = el.querySelector('thead th[data-col="1"]');
      expect(z(corner)).to.be.greaterThan(z(otherTh));
      expect(z(otherTh)).to.be.greaterThan(z(pinTd(el, 0)));
      const r = corner.getBoundingClientRect();
      expect(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2).closest('th')).to.equal(corner);
      const o = otherTh.getBoundingClientRect();
      const f = s.getBoundingClientRect();
      if (o.right > f.left && o.left < f.right - r.width) {
        const x = Math.max(o.left, f.left) + 4;
        expect(document.elementFromPoint(x, o.top + o.height / 2).closest('th')).to.not.equal(null);
      }
      // a pinned body cell passing under the sticky header stays below the corner
      const td = pinTd(el, 1).getBoundingClientRect();
      expect(td.right).to.be.closeTo(frameRight(s), 1.01);
    });

    it('without max-height: pinned th and td are both z-index 1', async () => {
      const el = await mk();
      expect(getComputedStyle(pinTh(el)).zIndex).to.equal('1');
      expect(getComputedStyle(pinTd(el, 0)).zIndex).to.equal('1');
      expect(getComputedStyle(el.querySelector('thead th[data-col="1"]')).zIndex).to.equal('auto');
    });

    it('Tab to the button of the column before the pinned one, while it is covered: it ends up clear of the pinned column', async () => {
      const el = await mk();
      const s = scrollOf(el);
      const a = el.querySelector('tbody > tr .probe-a');
      const pin = () => pinTh(el).getBoundingClientRect();
      // scroll so the button of the last-but-one column sits half under the pinned column
      await scrollTo(s, 0);
      const ar = a.getBoundingClientRect();
      const want = Math.min(ar.left + ar.width / 2 - pin().left, s.scrollWidth - s.clientWidth - 40);
      await scrollTo(s, Math.max(0, want));
      expect(a.getBoundingClientRect().right, 'precondition: the button is (half) covered').to.be.greaterThan(pin().left + 1);
      expect(a.getBoundingClientRect().left, 'precondition: its start is not covered').to.be.lessThan(pin().left);
      // the scroll frame itself is the first tab stop (it overflows); the next Tab lands on the covered button
      s.focus();
      await sendKeys({ press: 'Tab' });
      await frames(3);
      expect(document.activeElement).to.equal(a);
      expect(a.getBoundingClientRect().right).to.be.at.most(pin().left + 1.01);
      expect(a.getBoundingClientRect().left).to.be.at.least(s.getBoundingClientRect().left - 1);
      expect(pinTd(el, 0).getBoundingClientRect().right).to.be.closeTo(frameRight(s), 1.01); // the pinned one never moved
    });

    it('focusing the button INSIDE the pinned column keeps it at the edge (the fallback never shifts for a pinned target)', async () => {
      const el = await mk();
      const s = scrollOf(el);
      await scrollTo(s, 100);
      const b = el.querySelector('tbody > tr .probe-b');
      b.focus();
      await frames(3);
      expect(document.activeElement).to.equal(b);
      expect(b.getBoundingClientRect().right).to.be.at.most(frameRight(s) + 1.01);
      expect(b.getBoundingClientRect().right).to.be.greaterThan(frameRight(s) - pinTh(el).offsetWidth);
    });

    it('hiding the pinned column: the width variable is 0 and nothing is covered / pinned', async () => {
      const el = await mk('layout="table"', { columns: COLS('end', { hideable: true }) });
      const s = scrollOf(el);
      await scrollTo(s, 0);
      expect(rootOf(el).hasAttribute('data-sticky-covered')).to.equal(true);
      el.hiddenColumns = ['ops'];
      await frames(3);
      expect(parseFloat(s.style.getPropertyValue('--td-table-sticky-end-w'))).to.equal(0);
      expect(rootOf(el).hasAttribute('data-sticky-covered')).to.equal(false);
      expect(pinTh(el).hidden).to.equal(true);
      // the column before it is NOT pinned instead
      expect(getComputedStyle(el.querySelector('thead th[data-col="4"]')).position).to.equal('static');
      el.hiddenColumns = [];
      await frames(3);
      expect(parseFloat(s.style.getPropertyValue('--td-table-sticky-end-w'))).to.equal(pinTh(el).offsetWidth);
      expect(rootOf(el).hasAttribute('data-sticky-covered')).to.equal(s.scrollWidth - s.clientWidth - s.scrollLeft > 1);
    });

    it('off: no class, no attribute, no variable; scrolling changes nothing', async () => {
      const el = await mk('layout="table"', { columns: COLS(null) });
      const s = scrollOf(el);
      expect(el.querySelector('.td-table--sticky-end, .td-table__sticky-end')).to.equal(null);
      await scrollTo(s, 150);
      await scrollTo(s, s.scrollWidth);
      expect(rootOf(el).hasAttribute('data-sticky-covered')).to.equal(false);
      expect(s.style.getPropertyValue('--td-table-sticky-end-w')).to.equal('');
      expect(getComputedStyle(el.querySelector('thead th[data-col="5"]')).position).to.equal('static');
    });

    it('a column that is not the last: ignored (one warning), nothing pinned', async () => {
      const warns = [];
      const orig = console.warn;
      console.warn = (...a) => { warns.push(a.join(' ')); };
      try {
        const cols = COLS(null);
        cols[2] = { ...cols[2], sticky: 'end' };
        const el = await mk('layout="table"', { columns: cols });
        expect(el.querySelector('.td-table__sticky-end')).to.equal(null);
        expect(warns.filter((m) => m.includes('LAST column')).length).to.equal(1);
      } finally {
        console.warn = orig;
      }
    });
  });
}

describe('td-table sticky end — card mode', () => {
  before(async () => { await setViewport({ width: 390, height: 800 }); });

  it('layout auto at 390: the table is cards and the pinned cell is a plain, static field', async () => {
    const el = await mk('', { columns: COLS('end') });
    const td = pinTd(el, 0);
    expect(getComputedStyle(td).position).to.equal('static');
    expect(getComputedStyle(td).backgroundImage).to.equal('none');
    expect(getComputedStyle(td).borderInlineStartWidth).to.equal('0px');
    expect(getComputedStyle(td, '::after').display).to.equal('none');
    expect(td.getBoundingClientRect().right).to.be.at.most(scrollOf(el).getBoundingClientRect().right + 1);
  });

  it('layout="cards" forced at 1440: same', async () => {
    await setViewport({ width: 1440, height: 800 });
    const el = await mk('layout="cards"', { columns: COLS('end') });
    expect(getComputedStyle(pinTd(el, 0)).position).to.equal('static');
    expect(getComputedStyle(pinTd(el, 0), '::after').display).to.equal('none');
  });
});
