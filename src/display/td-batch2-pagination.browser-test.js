import { expect } from '@esm-bundle/chai';
import './td-pagination.js';
import { TdButton } from '../form/td-button.js';
import { sendKeys } from '@web/test-runner-commands';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
afterEach(() => { host.innerHTML = ''; document.documentElement.removeAttribute('data-td-theme'); });

/* WCAG contrast from computed colours (the background composited over `under`). */
function rgb(str) {
  const m = /rgba?\(([^)]+)\)/.exec(str);
  const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
}
const over = (c, u) => ({ r: c.r * c.a + u.r * (1 - c.a), g: c.g * c.a + u.g * (1 - c.a), b: c.b * c.a + u.b * (1 - c.a) });
const ratioRgb = (a, b) => {
  const [x, y] = [TdButton._luminance(a), TdButton._luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const pages = (el) => [...el.querySelectorAll('.td-pagination__pages > li')].map((li) => li.textContent.trim());
const current = (el) => el.querySelector('.td-pagination__page[aria-current="page"]');

describe('batch 2 — td-pagination', () => {
  it('renders a named nav landmark with focusable page buttons in a list', () => {
    const el = mount('<td-pagination total-items="50" items-per-page="10" current-page="2"></td-pagination>');
    const nav = el.querySelector('nav.td-pagination');
    expect(nav.getAttribute('aria-label')).to.equal('Phân trang');
    const btns = el.querySelectorAll('ul.td-pagination__pages > li > button.td-pagination__page');
    expect(btns.length).to.equal(5);
    btns[0].focus();
    expect(document.activeElement === btns[0]).to.equal(true);
    expect(current(el).textContent).to.equal('2');
    expect(el.querySelectorAll('[aria-current]').length).to.equal(1);
    expect(el.querySelector('.td-pagination__nav--prev svg[data-icon="prev"]') !== null).to.equal(true);
    expect(el.querySelector('.td-pagination__nav--next svg[data-icon="next"]') !== null).to.equal(true);
    expect(el.querySelector('.td-pagination__nav--prev').getAttribute('aria-label')).to.equal('Trang trước');
    expect(el.querySelector('.td-pagination__info').getAttribute('aria-live')).to.equal('polite');
    expect(el.querySelector('[class*="td-pagination-"]')).to.equal(null); // legacy classes gone
  });

  it('host aria-label names the nav (distinct instances) and updates in place', () => {
    const el = mount('<td-pagination total-items="50" aria-label="Phân trang (trên)"></td-pagination>');
    expect(el.querySelector('nav').getAttribute('aria-label')).to.equal('Phân trang (trên)');
    el.setAttribute('aria-label', 'Kết quả');
    expect(el.querySelector('nav').getAttribute('aria-label')).to.equal('Kết quả');
  });

  it('click emits one page-change, updates aria-current + info text and keeps focus on the page', () => {
    const el = mount('<td-pagination total-items="50" items-per-page="10" current-page="1"></td-pagination>');
    const info = el.querySelector('.td-pagination__info');
    const got = [];
    el.addEventListener('page-change', (e) => got.push(e.detail.page));
    const b3 = el.querySelector('[data-page="3"]');
    b3.focus();
    b3.click();
    expect(got).to.deep.equal([3]);
    expect(el.getAttribute('current-page')).to.equal('3');
    expect(current(el).textContent).to.equal('3');
    expect(el.querySelector('.td-pagination__info') === info).to.equal(true); // live region kept
    expect(info.textContent).to.equal('Hiển thị 21-30 / 50 mục');
    expect(document.activeElement.getAttribute('data-page')).to.equal('3');
  });

  it('focus stays on next while it works; moves to the current page when next becomes aria-disabled', async () => {
    const el = mount('<td-pagination total-items="30" items-per-page="10" current-page="1"></td-pagination>');
    el.querySelector('[data-nav="next"]').focus();
    await sendKeys({ press: 'Enter' });
    expect(el.getAttribute('current-page')).to.equal('2');
    expect(document.activeElement.getAttribute('data-nav')).to.equal('next');
    await sendKeys({ press: 'Enter' });
    expect(el.getAttribute('current-page')).to.equal('3');
    const next = el.querySelector('[data-nav="next"]');
    expect(next.getAttribute('aria-disabled')).to.equal('true');
    expect(document.activeElement === current(el)).to.equal(true);
    expect(document.activeElement.textContent).to.equal('3');
  });

  it('aria-disabled nav buttons stay focusable but clicks are guarded', () => {
    const el = mount('<td-pagination total-items="30" current-page="1"></td-pagination>');
    let n = 0;
    el.addEventListener('page-change', () => { n++; });
    const prev = el.querySelector('[data-nav="prev"]');
    expect(prev.getAttribute('aria-disabled')).to.equal('true');
    expect(prev.hasAttribute('disabled')).to.equal(false);
    prev.focus();
    expect(document.activeElement === prev).to.equal(true);
    prev.click();
    expect(n).to.equal(0);
    expect(el.getAttribute('current-page')).to.equal('1');
  });

  it('clamps current-page in render', () => {
    const el = mount('<td-pagination total-items="50" items-per-page="10" current-page="99"></td-pagination>');
    expect(el.querySelector('.td-pagination__info').textContent).to.equal('Hiển thị 41-50 / 50 mục');
    expect(current(el).textContent).to.equal('5');
    expect(el.getState().currentPage).to.equal(5);
    el.setAttribute('current-page', '-3');
    expect(current(el).textContent).to.equal('1');
  });

  it('max-pages is the window size (bug fix)', () => {
    const el = mount('<td-pagination total-items="1000" items-per-page="10" current-page="1" max-pages="3"></td-pagination>');
    expect(pages(el)).to.deep.equal(['1', '2', '3', '…', '100']);
    el.setAttribute('current-page', '50');
    expect(pages(el)).to.deep.equal(['1', '…', '49', '50', '51', '…', '100']);
    el.setAttribute('current-page', '100');
    expect(pages(el)).to.deep.equal(['1', '…', '98', '99', '100']);
    el.setAttribute('max-pages', '5');
    el.setAttribute('current-page', '4');
    expect(pages(el)).to.deep.equal(['1', '2', '3', '4', '5', '6', '…', '100']);
    const few = mount('<td-pagination total-items="30" items-per-page="10"></td-pagination>');
    expect(pages(few)).to.deep.equal(['1', '2', '3']);
    const ell = el.querySelector('.td-pagination__ellipsis');
    expect(ell.getAttribute('aria-hidden')).to.equal('true');
  });

  it('setPage / getState keep the public API', () => {
    const el = mount('<td-pagination total-items="95" items-per-page="10"></td-pagination>');
    const got = [];
    el.addEventListener('page-change', (e) => got.push(e.detail.page));
    el.setPage(20);
    expect(got).to.deep.equal([10]);
    expect(el.getState()).to.deep.equal({ totalItems: 95, itemsPerPage: 10, currentPage: 10, totalPages: 10 });
  });

  it('item-label is escaped (XSS)', () => {
    const el = mount('<td-pagination total-items="5"></td-pagination>');
    window.__pagXss = 0;
    el.setAttribute('item-label', '<img src=x onerror="window.__pagXss=1">');
    expect(el.querySelector('img')).to.equal(null);
    expect(el.querySelector('.td-pagination__info').textContent).to.contain('<img');
    expect(window.__pagXss).to.equal(0);
  });

  it('active-color: host custom property via safeColor; unsafe values ignored', () => {
    const el = mount('<td-pagination total-items="50" active-color="#8b5cf6"></td-pagination>');
    expect(el.style.getPropertyValue('--td-pagination-active')).to.equal('#8b5cf6');
    expect(getComputedStyle(current(el)).backgroundColor).to.equal('rgb(139, 92, 246)');
    el.setAttribute('active-color', 'red;} html{display:none');
    expect(el.style.getPropertyValue('--td-pagination-active')).to.equal('');
    expect(el.hasAttribute('style') ? el.getAttribute('style') : '').to.not.contain('display');
  });

  const contrastOf = (el, under) => {
    const btn = current(el);
    const cs = getComputedStyle(btn);
    const bg = over(rgb(cs.backgroundColor), under);
    return ratioRgb(bg, rgb(cs.color));
  };

  it('default current page ≥ 4.5:1 in light and dark', () => {
    const el = mount('<td-pagination total-items="50" current-page="2"></td-pagination>');
    expect(contrastOf(el, { r: 255, g: 255, b: 255 })).to.be.at.least(4.5);
    document.documentElement.setAttribute('data-td-theme', 'dark');
    expect(contrastOf(el, { r: 17, g: 17, b: 19 })).to.be.at.least(4.5);
  });

  for (const theme of ['light', 'dark']) {
    it(`translucent active-color picks the fg against the composited colour (${theme})`, () => {
      if (theme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
      const surface = theme === 'dark' ? { r: 17, g: 17, b: 19 } : { r: 255, g: 255, b: 255 };
      const wrap = mount(`<div id="pag-bg"></div>`);
      wrap.style.setProperty('background-color', `rgb(${surface.r}, ${surface.g}, ${surface.b})`);
      // A translucent dark blue: over white it reads light-ish (black text), over near-black it is dark (white text).
      for (const color of ['rgba(37, 99, 235, 0.3)', 'rgba(250, 204, 21, 0.4)', '#1d4ed880']) {
        wrap.innerHTML = `<td-pagination total-items="50" current-page="2" active-color="${color}"></td-pagination>`;
        const el = wrap.firstElementChild;
        const r = contrastOf(el, surface);
        expect(r, `${color} on ${theme}`).to.be.at.least(4.5);
      }
    });
  }

  it('translucent active-color composites over the nearest OPAQUE ancestor (through translucent layers)', () => {
    const outer = mount('<div></div>');
    outer.style.setProperty('background-color', 'rgb(0, 0, 0)');
    outer.innerHTML = '<div><td-pagination total-items="50" current-page="1" active-color="rgba(255, 255, 255, 0.2)"></td-pagination></div>';
    outer.firstElementChild.style.setProperty('background-color', 'rgba(0, 0, 0, 0.5)');
    const el = outer.querySelector('td-pagination');
    // white @20 % over black ≈ rgb(51,51,51) → white text wins
    expect(el.style.getPropertyValue('--td-pagination-active-fg')).to.equal('#ffffff');
    expect(contrastOf(el, { r: 0, g: 0, b: 0 })).to.be.at.least(4.5);
  });

  it('coarse pointer / forced colours rules are present in td.css', async () => {
    const css = await (await fetch('/td.css')).text();
    expect(css).to.match(/@media \(pointer: coarse\)\s*{\s*\.td-pagination\s*{\s*--td-pagination-item-size: var\(--td-touch-min\)/);
    expect(css).to.match(/\.td-pagination__page\[aria-current="page"\]\s*{\s*color: HighlightText;\s*background: Highlight;/);
  });

  it('size: page buttons are ≥ 32 px (fine pointer)', () => {
    const el = mount('<td-pagination total-items="50"></td-pagination>');
    const r = current(el).getBoundingClientRect();
    expect(r.height).to.be.at.least(32);
    expect(r.width).to.be.at.least(32);
  });

  it('page-change survives disconnect/reconnect (delegated listener)', () => {
    const el = mount('<td-pagination total-items="50"></td-pagination>');
    const other = mount('<div></div>');
    other.appendChild(el);
    el.querySelector('[data-page="2"]').click();
    expect(el.getAttribute('current-page')).to.equal('2');
  });
});

describe('batch 2 — td-pagination contract', () => {
  const KEEP = ['type', 'role', 'aria-hidden', 'hidden', 'data-td-icon', 'data-icon', 'tabindex', 'aria-live',
    'aria-current', 'aria-disabled', 'aria-label', 'data-page', 'data-nav'];
  function shape(el) {
    const attrs = KEEP.filter((a) => el.hasAttribute(a)).map((a) => `${a}=${el.getAttribute(a)}`);
    const cls = [...el.classList].sort().join('.');
    const kids = el.localName === 'svg' && el.getAttribute('data-icon') ? [] : [...el.children].map(shape);
    return { tag: el.localName, cls, attrs, kids };
  }
  it('test/contracts/pagination.html', async () => {
    const html = await (await fetch('/test/contracts/pagination.html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ts = [...doc.querySelectorAll('template')];
    expect(ts.length).to.be.at.least(2);
    for (const t of ts) {
      host.innerHTML = t.getAttribute('data-markup');
      expect(shape(host.firstElementChild.firstElementChild)).to.deep.equal(shape(t.content.firstElementChild));
    }
  });
});
