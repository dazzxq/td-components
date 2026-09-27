import { expect } from '@esm-bundle/chai';
import '../form/td-button.js';
import '../form/td-checkbox.js';
import '../form/td-toggle.js';
import '../display/td-pagination.js';
import '../display/td-empty-state.js';
import '../display/td-table.js';
import { TdLoadingSpinner } from '../feedback/td-loading.js';

// v0.16.0 D2 (--td-accent-fill follows the site accent) + D5 (default-size tokens on :root). td.css only; the site
// overrides are UNLAYERED sheets (adoptedStyleSheets), exactly what a site stylesheet is.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
const host = document.createElement('div');
host.style.setProperty('width', '640px');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html); return host.lastElementChild; };
const html = document.documentElement;

function siteCss(text) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(text);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}
afterEach(() => {
  host.innerHTML = '';
  document.adoptedStyleSheets = [];
  html.removeAttribute('data-td-theme');
});

/** Computed colour string → [r, g, b] 0–255. color-mix() serialises as oklab()/color(): a canvas converts to sRGB. */
const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
function rgb(str) {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000';
  ctx.fillStyle = str;
  ctx.fillRect(0, 0, 1, 1);
  return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
}
const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const near = (a, b, tol = 2) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

/** Resolve a colour token as a background on a probe inside `host` (CSSOM only). */
function tokenColor(name) {
  const probe = mount('<span></span>');
  probe.style.setProperty('background-color', `var(${name})`);
  const c = rgb(getComputedStyle(probe).backgroundColor);
  probe.remove();
  return c;
}
const activePage = () => mount('<td-pagination total-items="50" current-page="1"></td-pagination>')
  .querySelector('.td-pagination__page[aria-current="page"]');

describe('D2 --td-accent-fill', () => {
  it('light: fill = accent; primary button + current page use it; white text ≥ 4.5:1', () => {
    expect(near(tokenColor('--td-accent-fill'), [37, 99, 235])).to.equal(true);
    expect(near(tokenColor('--td-btn-primary-bg'), [37, 99, 235])).to.equal(true);
    const page = activePage();
    const cs = getComputedStyle(page);
    expect(near(rgb(cs.backgroundColor), [37, 99, 235])).to.equal(true);
    expect(ratio(rgb(cs.color), rgb(cs.backgroundColor))).to.be.at.least(4.5);
  });

  it('dark default: 80 % of the dark accent (≈ #2f68c5), white text ≥ 4.5:1 on the current page', () => {
    html.setAttribute('data-td-theme', 'dark');
    const fill = tokenColor('--td-accent-fill');
    expect(near(fill, [47, 104, 197])).to.equal(true);
    expect(near(tokenColor('--td-btn-primary-bg'), fill)).to.equal(true);
    const cs = getComputedStyle(activePage());
    expect(near(rgb(cs.backgroundColor), fill)).to.equal(true);
    expect(ratio(rgb(cs.color), rgb(cs.backgroundColor))).to.be.at.least(4.5);
  });

  it('dark: changing ONE token (--td-accent) moves the primary button + current page', () => {
    html.setAttribute('data-td-theme', 'dark');
    siteCss(':root { --td-accent: #dc2626; }');
    const expected = [220 * 0.8, 38 * 0.8, 38 * 0.8];
    expect(near(tokenColor('--td-btn-primary-bg'), expected)).to.equal(true);
    expect(near(tokenColor('--td-btn-primary-tint'), expected)).to.equal(true);
    expect(near(rgb(getComputedStyle(activePage()).backgroundColor), expected)).to.equal(true);
  });

  it('light: changing --td-accent moves both too; --td-accent-fill alone tunes the fill', () => {
    siteCss(':root { --td-accent: #dc2626; }');
    expect(near(tokenColor('--td-btn-primary-bg'), [220, 38, 38])).to.equal(true);
    expect(near(rgb(getComputedStyle(activePage()).backgroundColor), [220, 38, 38])).to.equal(true);
    host.innerHTML = '';
    siteCss(':root { --td-accent-fill: #7c3aed; }');
    expect(near(tokenColor('--td-btn-primary-bg'), [124, 58, 237])).to.equal(true);
    expect(near(rgb(getComputedStyle(activePage()).backgroundColor), [124, 58, 237])).to.equal(true);
  });
});

describe('D5 default-size tokens are overridable from :root (unlayered site CSS)', () => {
  const px = (el, prop) => parseFloat(getComputedStyle(el)[prop]);

  it('--td-checkbox-box (default size); --sm still wins on its element', () => {
    expect(px(mount('<td-checkbox label="a"></td-checkbox>').querySelector('.td-checkbox__mark'), 'width')).to.equal(20);
    siteCss(':root { --td-checkbox-box: 30px; }');
    expect(px(mount('<td-checkbox label="a"></td-checkbox>').querySelector('.td-checkbox__mark'), 'width')).to.equal(30);
    expect(px(mount('<td-checkbox label="a" size="sm"></td-checkbox>').querySelector('.td-checkbox__mark'), 'width')).to.equal(16);
  });

  it('--td-switch-w / -h / -thumb-d (default size); derived pad follows', () => {
    siteCss(':root { --td-switch-w: 60px; --td-switch-h: 30px; --td-switch-thumb-d: 20px; }');
    const t = mount('<td-toggle label="a"></td-toggle>');
    const track = t.querySelector('.td-switch__track');
    expect(px(track, 'width')).to.equal(60);
    expect(px(track, 'height')).to.equal(30);
    expect(px(t.querySelector('.td-switch__thumb'), 'width')).to.equal(20);
    expect(getComputedStyle(t.querySelector('.td-switch')).getPropertyValue('--td-switch-pad').trim()).to.match(/calc\(\(30px - 20px\) \/ 2\)|5px/);
    const sm = mount('<td-toggle label="a" size="sm"></td-toggle>');
    expect(px(sm.querySelector('.td-switch__track'), 'width')).to.equal(36);
  });

  it('--td-spinner-size (md); --lg still wins', () => {
    host.appendChild(TdLoadingSpinner.create());
    expect(px(host.lastElementChild, 'width')).to.equal(32);
    siteCss(':root { --td-spinner-size: 50px; }');
    host.appendChild(TdLoadingSpinner.create());
    expect(px(host.lastElementChild, 'width')).to.equal(50);
    host.appendChild(TdLoadingSpinner.create({ size: 'lg' }));
    expect(px(host.lastElementChild, 'width')).to.equal(48);
  });

  it('--td-empty-state-pad / -gap (md)', () => {
    siteCss(':root { --td-empty-state-pad: 40px; --td-empty-state-gap: 20px; }');
    const el = mount('<td-empty-state></td-empty-state>');
    expect(px(el.querySelector('.td-empty-state'), 'paddingTop')).to.equal(40);
    expect(px(el.querySelector('.td-empty-state__title'), 'marginBottom')).to.equal(18); // gap - 2px
  });

  it('--td-table-cell-px', () => {
    siteCss(':root { --td-table-cell-px: 7px; }');
    const el = mount('<td-table></td-table>');
    el.columns = [{ key: 'a', label: 'A' }];
    el.data = [{ a: 'x' }];
    expect(px(el.querySelector('.td-table__body .td-table__cell'), 'paddingLeft')).to.equal(7);
  });

  it('--td-pagination-item-size', () => {
    siteCss(':root { --td-pagination-item-size: 40px; }');
    expect(px(activePage(), 'height')).to.equal(40);
  });

  it('--td-lb-* reach .td-lightbox; the derived bar height follows', () => {
    siteCss(':root { --td-lb-btn: 50px; --td-lb-bar-pad: 5px; --td-lb-panel-w: 26rem; }');
    const lb = mount('<div class="td-lightbox"><button type="button" class="td-lightbox__btn"></button></div>');
    const cs = getComputedStyle(lb);
    expect(cs.getPropertyValue('--td-lb-panel-w').trim()).to.equal('26rem');
    expect(px(lb.querySelector('.td-lightbox__btn'), 'width')).to.equal(50);
    const probe = mount('<span></span>');
    lb.appendChild(probe);
    probe.style.setProperty('display', 'block');
    probe.style.setProperty('height', 'var(--td-lb-bar-h)');
    expect(px(probe, 'height')).to.equal(62); // 50 + 2 × 5 + 2
  });
});
