import { expect } from '@esm-bundle/chai';
import { TdDropdown } from './td-dropdown.js';

// v0.95.0 (plan docs/internal/plans/v0.95.0-small-kit.md §4, K6) — td-dropdown option `image`: a rich row led by
// <img class="td-dropdown__image"> (wins over the dot and the icon tile), the selected option's image on the trigger
// (`td-dropdown__value-image`, off with trigger-icon="none"), the safeMediaUrl gate (same as td-choice-group), escaping,
// the <select data-image> upgrade, the trigger height / one-line label, and the measured 5-row window. Chromium, Firefox
// AND WebKit. DOM nodes are compared as booleans / strings (a failing chai assertion carrying DOM nodes hangs the runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
await document.fonts?.ready;

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const raf = () => new Promise((r) => requestAnimationFrame(r));
async function settle(n = 3) { for (let i = 0; i < n; i++) await raf(); }
afterEach(async () => {
  host.innerHTML = '';
  await wait(10);
});

/** same-origin images: the harness CSP is default-src 'self' and safeMediaUrl refuses data: */
const IMG = (n) => `/test/fixtures/${n}.svg`;
const ABS = (n) => new URL(IMG(n), document.baseURI).href;
const trig = (el) => el.querySelector('.td-dropdown__trigger');
const span = (el) => el.querySelector('.td-dropdown__value');
const menu = (el) => el._menuElement;
const scroller = (el) => menu(el).querySelector('.td-dropdown__scroller');
const rows = (el) => [...scroller(el).querySelectorAll('.td-dropdown__option[data-index]')];
const rowOf = (el, v) => rows(el).find((r) => r.getAttribute('data-value') === v) || null;
const valueImg = (el) => span(el).querySelector(':scope > img.td-dropdown__value-image');
function dd(attrs = '', options = []) {
  const el = mount(`<td-dropdown ${attrs}></td-dropdown>`);
  el.options = options.map((o) => ({ ...o }));
  return el;
}

const ALBUMS = [
  { value: 'a1', label: 'Lễ hội 2026', image: IMG(1), description: '48 ảnh' },
  { value: 'a2', label: 'Ảnh bìa có icon + chấm', image: IMG(2), icon: 'archive', swatch: '#ff0000' },
  { value: 'p', label: 'Không ảnh' },
];

describe('v0.95.0 td-dropdown option image — rows', () => {
  it('a row with a valid image: rich, <img> with the normalised href, alt="", 32×32 lazy; no dot / icon tile', async () => {
    expect(customElements.get('td-dropdown')).to.equal(TdDropdown);
    const el = dd('', ALBUMS);
    el.open();
    await settle();
    const r1 = rowOf(el, 'a1');
    expect(r1.classList.contains('td-dropdown__option--rich')).to.equal(true);
    const img = r1.querySelector(':scope > img.td-dropdown__image');
    expect(!!img).to.equal(true);
    expect(img.getAttribute('src')).to.equal(ABS(1));
    expect(img.getAttribute('alt')).to.equal('');
    expect(img.getAttribute('width')).to.equal('32');
    expect(img.getAttribute('height')).to.equal('32');
    expect(img.getAttribute('loading')).to.equal('lazy');
    expect(img.getAttribute('decoding')).to.equal('async');
    expect(img.hasAttribute('style')).to.equal(false);
    expect(img.hasAttribute('referrerpolicy')).to.equal(false); // D9: parity with td-choice-group
    // the image wins: no dot svg, no icon tile in the row that also has icon + swatch
    const r2 = rowOf(el, 'a2');
    expect(!!r2.querySelector(':scope > img.td-dropdown__image')).to.equal(true);
    expect(r2.querySelector('svg.td-dropdown__swatch')).to.equal(null);
    expect(r2.querySelector('.td-dropdown__icon')).to.equal(null);
    // the accessible name stays the label text
    expect(r2.querySelector('.td-dropdown__option-label').textContent).to.equal('Ảnh bìa có icon + chấm');
    const box = img.getBoundingClientRect();
    expect(Math.round(box.width)).to.equal(32);
    expect(Math.round(box.height)).to.equal(32);
  });

  it('a host reset (img { max-width: 100%; height: auto }) does not change the image box', async () => {
    const sheet = new CSSStyleSheet();
    // the plan's reset (Tailwind v3 preflight, UNLAYERED → it beats every td.component rule by design, ADR 0008): the box
    // must hold through the fixed width + the width/height attributes, not by out-ranking the host
    sheet.replaceSync('img { max-width: 100%; height: auto; }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    try {
      const el = dd('', ALBUMS);
      el.setValue('a1');
      el.open();
      await settle();
      const b = rowOf(el, 'a1').querySelector('img').getBoundingClientRect();
      expect([Math.round(b.width), Math.round(b.height)]).to.deep.equal([32, 32]);
      const t = valueImg(el).getBoundingClientRect();
      expect([Math.round(t.width), Math.round(t.height)]).to.deep.equal([20, 20]);
    } finally {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
    }
  });

  it('a refused image (javascript:, data:, blob:, non-string, > 8 KiB) draws nothing and the row still renders', async () => {
    const bad = [
      { value: 'j', label: 'J', image: 'javascript:alert(1)' },
      { value: 'd', label: 'D', image: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>' },
      { value: 'b', label: 'B', image: 'blob:http://x.example/1' },
      { value: 'n', label: 'N', image: 42 },
      { value: 'l', label: 'L', image: `/a.png?${'x'.repeat(9000)}` },
      { value: 'i', label: 'I', image: 'javascript:alert(1)', icon: 'star' },
    ];
    const el = dd('', bad);
    el.open();
    await settle();
    expect(rows(el).length).to.equal(6);
    expect(scroller(el).querySelector('img')).to.equal(null);
    // without a valid image: the plain row (0.83.0) unless another rich field — the icon tile comes back
    expect(rowOf(el, 'j').classList.contains('td-dropdown__option--rich')).to.equal(false);
    expect(!!rowOf(el, 'i').querySelector('.td-dropdown__icon')).to.equal(true);
    el.setValue('i');
    expect(valueImg(el)).to.equal(null);
    expect(!!span(el).querySelector('.td-dropdown__value-icon')).to.equal(true);
  });

  it('a quote-breaking image string never makes markup (escaped attribute)', async () => {
    const el = dd('', [{ value: 'x', label: 'X', image: '/a.svg?"><svg onload=alert(1)>' }]);
    el.setValue('x');
    el.open();
    await settle();
    const row = rowOf(el, 'x');
    // the only svg allowed is the selected row's check icon (td-icon fills span[data-td-icon]); nothing parsed from the string
    expect(row.querySelectorAll('[onload]').length).to.equal(0);
    expect([...row.querySelectorAll('svg')].every((s) => !!s.closest('.td-dropdown__check[data-td-icon]'))).to.equal(true);
    expect(row.querySelectorAll('img').length).to.equal(1);
    expect(row.querySelector('img').getAttribute('src').includes('%22%3E%3Csvg')).to.equal(true);
    expect(span(el).querySelectorAll('svg, [onload]').length).to.equal(0);
  });

  it('image is never searched (URL and alt are not matched)', async () => {
    const el = dd('', [{ value: 'a', label: 'Alpha', image: '/test/fixtures/zebra.svg' }, { value: 'b', label: 'Zebra' }]);
    el.open();
    await settle();
    // the JS component shows the search box by default at any option count (the ≤ 8 rule is PHP-only)
    const s = menu(el).querySelector('.td-dropdown__search');
    expect(s, 'search box').to.not.equal(null);
    expect(rowOf(el, 'a').querySelector('img.td-dropdown__image').getAttribute('alt')).to.equal('');
    const search = async (q) => {
      s.value = q;
      s.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
      return rows(el).map((r) => r.getAttribute('data-value'));
    };
    expect(await search('zebra')).to.deep.equal(['b']); // the label of b only, not a's image file name
    expect(await search('fixtures')).to.deep.equal([]); // a path segment of the image URL
    expect(await search('svg')).to.deep.equal([]);
    expect(await search('alpha')).to.deep.equal(['a']);
  });
});

describe('v0.95.0 td-dropdown option image — trigger', () => {
  it('the selected option image leads the trigger (render + update paths), replaces dot + icon, gone when cleared', async () => {
    const el = dd('value="a2"', ALBUMS);
    await settle(1);
    expect(!!valueImg(el)).to.equal(true); // render() path
    expect(valueImg(el).getAttribute('src')).to.equal(ABS(2));
    expect(valueImg(el).getAttribute('alt')).to.equal('');
    expect(span(el).querySelector('svg.td-dropdown__swatch')).to.equal(null);
    expect(span(el).querySelector('.td-dropdown__value-icon')).to.equal(null);
    expect(span(el).textContent).to.equal('Ảnh bìa có icon + chấm');
    el.setValue('p'); // _updateValueText path
    expect(valueImg(el)).to.equal(null);
    el.setValue('a1');
    expect(valueImg(el).getAttribute('src')).to.equal(ABS(1));
    el.setValue(null);
    expect(valueImg(el)).to.equal(null);
    expect(span(el).hasAttribute('data-placeholder')).to.equal(true);
  });

  it('trigger-icon="none|off|false" hides the image on the trigger (first render too); rows keep it', async () => {
    const el = dd('value="a1"', ALBUMS);
    await settle(1);
    for (const off of ['none', 'off', 'false']) {
      el.setAttribute('trigger-icon', off);
      expect(valueImg(el), off).to.equal(null);
      expect(span(el).querySelector('svg.td-dropdown__swatch'), off).to.equal(null);
      expect(span(el).textContent).to.equal('Lễ hội 2026');
      el.removeAttribute('trigger-icon');
      expect(!!valueImg(el)).to.equal(true);
    }
    const el2 = dd('trigger-icon="none" value="a1"', ALBUMS);
    await settle(1);
    expect(valueImg(el2)).to.equal(null);
    el2.open();
    await settle();
    expect(!!rowOf(el2, 'a1').querySelector('img.td-dropdown__image')).to.equal(true);
  });

  it('mode="action": the trigger never shows an image', async () => {
    const el = dd('mode="action" placeholder="Thêm album"', ALBUMS);
    await settle(1);
    expect(span(el).querySelector('img')).to.equal(null);
    el.open();
    await settle();
    expect(!!rowOf(el, 'a1').querySelector('img.td-dropdown__image')).to.equal(true);
  });

  it('the trigger height is the same with / without an image; a long label stays on one line with an ellipsis', async () => {
    const long = 'Album ảnh lễ hội mùa xuân năm 2026 tại quảng trường trung tâm thành phố';
    const withImg = dd('value="x"', [{ value: 'x', label: long, image: IMG(1) }]);
    const without = dd('value="x"', [{ value: 'x', label: long }]);
    withImg.style.width = '220px'; // test-only sizing via CSSOM
    without.style.width = '220px';
    await settle();
    const h1 = trig(withImg).getBoundingClientRect().height;
    const h2 = trig(without).getBoundingClientRect().height;
    expect(Math.abs(h1 - h2), `${h1} vs ${h2}`).to.be.at.most(0.5);
    const s = span(withImg);
    expect(getComputedStyle(s).textOverflow).to.equal('ellipsis');
    expect(s.scrollWidth > s.clientWidth).to.equal(true);
    const text = [...s.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
    const range = document.createRange();
    range.selectNodeContents(text);
    const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
    expect(lines.size, 'one line').to.equal(1);
    const ir = valueImg(withImg).getBoundingClientRect();
    const tr = range.getBoundingClientRect();
    expect(ir.right <= tr.left + 1, 'the label follows the image on the same line').to.equal(true);
    expect(Math.abs((ir.top + ir.bottom) / 2 - (tr.top + tr.bottom) / 2), 'vertically centred together').to.be.at.most(4);
    expect(getComputedStyle(valueImg(withImg)).marginInlineStart).to.equal('1px');
  });
});

describe('v0.95.0 td-dropdown option image — upgrade + height', () => {
  it('<select> <option data-image> upgrades to item.image (raw, gated at render)', async () => {
    const el = mount(`<td-dropdown><select>
      <option value="">— Chọn album —</option>
      <option value="a" data-image="${IMG(3)}" selected>Album A</option>
      <option value="b" data-image="javascript:alert(1)">Album B</option>
      <option value="c">Album C</option>
    </select></td-dropdown>`);
    await settle(1);
    expect(el.options.map((o) => ({ ...o }))).to.deep.equal([
      { value: 'a', label: 'Album A', image: IMG(3) },
      { value: 'b', label: 'Album B', image: 'javascript:alert(1)' },
      { value: 'c', label: 'Album C' },
    ]);
    expect(valueImg(el).getAttribute('src')).to.equal(ABS(3));
    el.open();
    await settle();
    expect(!!rowOf(el, 'a').querySelector('img')).to.equal(true);
    expect(rowOf(el, 'b').querySelector('img')).to.equal(null);
  });

  /** the 5-row window: the 5th row ends at the scroller's visible bottom, the 6th starts there (±1px) */
  function expectFiveRows(el, what) {
    const sc = scroller(el);
    const all = [...sc.querySelectorAll('.td-dropdown__option')];
    const bottom = sc.getBoundingClientRect().top + sc.clientHeight;
    expect(sc.scrollTop, `${what} scrollTop`).to.equal(0);
    expect(Math.abs(all[4].getBoundingClientRect().bottom - bottom), `${what} 5th bottom`).to.be.at.most(1);
    expect(all[5].getBoundingClientRect().top, `${what} 6th top`).to.be.at.least(bottom - 1);
  }

  it('max-height="5" shows exactly 5 image rows (measured, taller than 40px); a long list (data-many) too', async () => {
    const list = Array.from({ length: 9 }, (_, i) => ({ value: `v${i}`, label: `Album ${i}`, image: IMG((i % 4) + 1) }));
    const el = dd('max-height="5" allow-clear="false"', list);
    el.open();
    await settle();
    expect(rows(el)[0].getBoundingClientRect().height > 40).to.equal(true);
    expectFiveRows(el, 'image rows');
    el.close();
    const many = Array.from({ length: 250 }, (_, i) => ({ value: `m${i}`, label: `Album ${i}`, image: IMG((i % 4) + 1) }));
    const big = dd('max-height="5" allow-clear="false"', many);
    big.open();
    await settle();
    expect(scroller(big).hasAttribute('data-many')).to.equal(true);
    expectFiveRows(big, 'data-many');
  });
});
