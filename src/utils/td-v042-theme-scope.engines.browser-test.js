// v0.42.0 R2-7 (plan N5 / N6, QĐ15–QĐ16, ADR 0020) — every engine:
//   scopes: a dark section in a light page (and light in dark, nested) re-resolves the semantic AND component tokens,
//   color-scheme per scope; geometry overrides on :root still reach inside; colour overrides on :root do not (opt-in
//   change); a generated light file loaded after td.css never repaints a dark scope; a generated named theme applies.
//   portal bridge: popups opened from inside a scope carry it (dropdown, TdMenu, tooltip, nested popup in a bridged
//   modal), programmatic overlays follow `themeRoot` (TdModal, TdToast, TdLoading, TdMenu), the snapshot is taken from
//   the MARKED scope (an unmarked local override does not travel, an override on the scope does), <html> as the scope
//   bridges nothing, closing leaves no inline value / attribute (reused portal roots too), inline values someone else
//   set survive, the lightbox is never bridged.
import { expect } from '@esm-bundle/chai';
import '../form/td-dropdown.js';
import '../form/td-input-field.js';
import '../form/td-chip-input.js';
import '../form/td-tree-select.js';
import '../feedback/td-drawer.js';
import { TdHovercard } from '../feedback/td-hovercard.js';
import { TdMediaPicker } from '../feedback/td-media-picker.js';
import { createMockAdapter } from '../../test/fixtures/media-adapter.js';
import { TdModal } from '../feedback/td-modal.js';
import { TdToast } from '../feedback/td-toast.js';
import { TdLoading } from '../feedback/td-loading.js';
import { TdMenu } from '../feedback/td-menu.js';
import { tdTooltip } from '../feedback/td-tooltip.js';
import { TdLightbox } from '../feedback/td-lightbox.js';
import { bridgeTheme, BRIDGE_TOKENS } from './layers.js';
import { generatePalette, toCss } from '../theme/index.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const frames = (n = 2) => new Promise((r) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); });
const until = async (fn, ms = 3000) => { const t0 = performance.now(); while (!fn()) { if (performance.now() - t0 > ms) throw new Error('timeout'); await frames(1); } };

/** Any CSS colour → `rgb(r, g, b)` / `rgba(…)` as the engine computes it. */
const probe = document.createElement('span');
document.body.appendChild(probe);
function rgb(value) {
  probe.style.setProperty('color', 'rgb(1, 2, 3)');
  probe.style.setProperty('color', String(value).trim());
  return getComputedStyle(probe).color;
}
const tok = (el, name) => rgb(getComputedStyle(el).getPropertyValue(name));
const DARK = { bg: rgb('#111113'), surface: rgb('#1c1c1e'), text: rgb('#f5f5f7'), accent: rgb('#4b8df8') };
const LIGHT = { bg: rgb('#fbfbfa'), surface: rgb('#ffffff'), text: rgb('#1c1c1e'), accent: rgb('#2563eb') };

let siteSheet = null;
function siteCss(css) {
  siteSheet = new CSSStyleSheet();
  siteSheet.replaceSync(css);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, siteSheet];
}
const inlineTokens = (el) => [...el.style].filter((n) => n.startsWith('--td-') || n === 'color-scheme');

let stage;
beforeEach(() => {
  stage = document.createElement('div');
  document.body.appendChild(stage);
});
afterEach(async () => {
  TdModal.closeAll();
  TdMenu.close();
  TdLoading.hide();
  tdTooltip.hide();
  TdLightbox.close();
  stage.remove();
  document.documentElement.removeAttribute('data-td-theme');
  if (siteSheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== siteSheet);
  siteSheet = null;
  await frames(3);
});

function scope(theme, html = '') {
  const s = document.createElement('section');
  s.setAttribute('data-td-theme', theme);
  s.innerHTML = html;
  stage.appendChild(s);
  return s;
}

describe('v0.42.0 theme scopes (N5)', () => {
  it('a dark section in a light page re-resolves semantic + component tokens and the rendered colours', async () => {
    const s = scope('dark', '<td-input-field label="Tên"></td-input-field><span class="x">t</span>');
    const outside = document.createElement('td-input-field');
    stage.appendChild(outside);
    await frames();
    const inner = s.querySelector('.x');
    expect(tok(inner, '--td-color-text')).to.equal(DARK.text);
    expect(tok(inner, '--td-accent')).to.equal(DARK.accent);
    expect(tok(inner, '--td-checkbox-color')).to.equal(DARK.accent, 'component token re-resolved in the scope');
    expect(getComputedStyle(s.querySelector('.td-field__control')).backgroundColor).to.equal(DARK.surface);
    expect(getComputedStyle(outside.querySelector('.td-field__control')).backgroundColor).to.equal(LIGHT.surface);
    expect(getComputedStyle(s).colorScheme).to.equal('dark');
    expect(getComputedStyle(stage).colorScheme).to.equal('normal', 'no attribute → no color-scheme (unchanged)');
  });

  it('light inside dark, and nested dark > light > dark', async () => {
    document.documentElement.setAttribute('data-td-theme', 'dark');
    const l = scope('light', '<div data-td-theme="dark"><span class="d">x</span></div><span class="l">x</span>');
    await frames();
    expect(tok(stage, '--td-color-text')).to.equal(DARK.text);
    expect(tok(l.querySelector('.l'), '--td-color-text')).to.equal(LIGHT.text);
    expect(getComputedStyle(l).colorScheme).to.equal('light');
    expect(tok(l.querySelector('.d'), '--td-color-text')).to.equal(DARK.text);
    expect(tok(l.querySelector('.d'), '--td-checkbox-color')).to.equal(DARK.accent);
  });

  it('geometry overrides on :root reach inside a scope; colour overrides on :root do not (set them on the scope)', async () => {
    siteCss(':root { --td-radius-lg: 3px; --td-checkbox-box: 30px; --td-accent: rgb(200, 0, 0); }');
    const s = scope('dark', '<span class="x">x</span>');
    const light = scope('light', '<span class="y">y</span>');
    await frames();
    const x = s.querySelector('.x');
    expect(getComputedStyle(x).getPropertyValue('--td-radius-lg').trim()).to.equal('3px');
    expect(getComputedStyle(x).getPropertyValue('--td-checkbox-box').trim()).to.equal('30px');
    expect(tok(stage, '--td-accent')).to.equal('rgb(200, 0, 0)', 'page');
    expect(tok(x, '--td-accent')).to.equal(DARK.accent, 'not into a dark scope');
    expect(tok(light.querySelector('.y'), '--td-accent')).to.equal(LIGHT.accent, 'not into an explicit light scope either');
    siteCss('[data-td-theme="dark"] { --td-accent: rgb(0, 150, 0); }');
    await frames();
    expect(tok(x, '--td-accent')).to.equal('rgb(0, 150, 0)');
    expect(tok(x, '--td-checkbox-color')).to.equal('rgb(0, 150, 0)', 'component tokens follow an override on the scope');
  });

  it('a generated light file (base slot) never repaints a dark scope; a generated named theme applies to its scope', async () => {
    const light = toCss(generatePalette({ bg: '#ece5d8', accent: '#b3261e', surface: '#fff' }));
    const paper = toCss(generatePalette({ bg: '#f4faf9', accent: '#0f766e' }, { name: 'paper' }));
    siteCss(`${light}\n${paper}`);
    const d = scope('dark', '<span class="x">x</span>');
    const p = scope('paper', '<span class="x">x</span>');
    await frames();
    expect(tok(stage, '--td-color-bg')).to.equal(rgb('#ece5d8'), 'the page takes the generated light file');
    expect(tok(d.querySelector('.x'), '--td-color-bg')).to.equal(DARK.bg, 'kit dark scope kept (0,2,0 > 0,1,0)');
    expect(tok(p.querySelector('.x'), '--td-color-bg')).to.equal(rgb('#f4faf9'));
    expect(tok(p.querySelector('.x'), '--td-checkbox-color')).to.equal(tok(p, '--td-accent'));
  });
});

describe('v0.42.0 portal bridge (N6)', () => {
  const makeDropdown = (parent) => {
    const d = document.createElement('td-dropdown');
    d.setAttribute('aria-label', 'Chọn');
    parent.appendChild(d);
    d.options = [{ value: 'a', label: 'Apple' }, { value: 'b', label: 'Banana' }];
    return d;
  };

  it('a dropdown opened in a dark scope renders dark; closing removes exactly what was set', async () => {
    const s = scope('dark');
    const d = makeDropdown(s);
    await frames();
    d.open();
    const menu = d._menuElement;
    expect(menu.parentElement).to.equal(document.body);
    expect(menu.getAttribute('data-td-theme')).to.equal('dark');
    expect(tok(menu, '--td-color-surface')).to.equal(DARK.surface);
    expect(getComputedStyle(menu).colorScheme).to.equal('dark');
    expect(inlineTokens(menu).length).to.be.greaterThan(BRIDGE_TOKENS.length / 2);
    d.close();
    expect(menu.hasAttribute('data-td-theme')).to.equal(false);
    expect(inlineTokens(menu)).to.deep.equal([]);
  });

  it('chip-input, tree-select, drawer, hovercard and the media picker follow their host / themeRoot scope', async () => {
    const s = scope('dark', '<td-chip-input label="Thẻ"></td-chip-input><td-tree-select label="Cây"></td-tree-select>'
      + '<td-drawer title="Ngăn"><p>Ngăn</p></td-drawer><button class="hc">hc</button>');
    const chip = s.querySelector('td-chip-input');
    chip.options = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }];
    const tree = s.querySelector('td-tree-select');
    tree.data = [{ value: '1', label: 'Một' }, { value: '2', label: 'Hai' }];
    await frames();
    chip.open();
    expect(chip._menuElement.getAttribute('data-td-theme')).to.equal('dark');
    chip.close();
    expect(chip._menuElement.hasAttribute('data-td-theme')).to.equal(false);
    tree.open();
    expect(tree._menuElement.getAttribute('data-td-theme')).to.equal('dark');
    expect(tok(tree._menuElement, '--td-tree-row-selected')).to.equal(tok(s, '--td-tree-row-selected'));
    tree.close();
    expect(inlineTokens(tree._menuElement)).to.deep.equal([]);
    const drawer = s.querySelector('td-drawer');
    drawer.show();
    const droot = document.querySelector('.td-drawer-root');
    expect(droot.getAttribute('data-td-theme')).to.equal('dark');
    expect(tok(droot.querySelector('.td-drawer__panel'), '--td-color-surface')).to.equal(DARK.surface);
    drawer.close();
    await until(() => !document.querySelector('.td-drawer-root'));
    const hc = s.querySelector('.hc');
    const content = document.createElement('p');
    content.textContent = 'Thẻ';
    const unbind = TdHovercard.bind(hc, { content: () => content });
    hc.focus();
    await until(() => { const c = document.getElementById('td-hovercard'); return c && !c.hidden; });
    expect(document.getElementById('td-hovercard').getAttribute('data-td-theme')).to.equal('dark');
    unbind();
    expect(document.getElementById('td-hovercard').hasAttribute('data-td-theme')).to.equal(false);
    const picking = TdMediaPicker.open({ adapter: createMockAdapter(), themeRoot: s });
    await until(() => document.querySelector('.td-media-picker'));
    const proot = document.querySelector('.td-media-picker').closest('[data-td-theme]');
    expect(proot && proot.parentElement === document.body).to.equal(true);
    expect(proot.getAttribute('data-td-theme')).to.equal('dark');
    document.querySelector('td-media-picker').close();
    await picking;
  });

  it('snapshot from the MARKED scope: an override on the scope travels, an unmarked local override does not', async () => {
    const s = scope('dark', '<div class="card"></div>');
    s.style.setProperty('--td-accent', 'rgb(0, 150, 0)');
    const card = s.querySelector('.card');
    card.style.setProperty('--td-accent', 'rgb(200, 0, 0)');
    const d = makeDropdown(card);
    await frames();
    d.open();
    expect(tok(d._menuElement, '--td-accent')).to.equal('rgb(0, 150, 0)');
    d.close();
  });

  it('outside any scope, or with <html> as the scope: nothing is bridged (the popup inherits the page)', async () => {
    const d = makeDropdown(stage);
    await frames();
    d.open();
    expect(d._menuElement.hasAttribute('data-td-theme')).to.equal(false);
    expect(inlineTokens(d._menuElement)).to.deep.equal([]);
    d.close();
    document.documentElement.setAttribute('data-td-theme', 'dark');
    d.open();
    expect(d._menuElement.hasAttribute('data-td-theme')).to.equal(false);
    expect(tok(d._menuElement, '--td-color-surface')).to.equal(DARK.surface, 'inherited from <html>');
    d.close();
  });

  it('nested: a dropdown + a TdMenu inside a modal bridged by themeRoot follow the modal', async () => {
    const s = scope('dark');
    const body = document.createElement('div');
    const d = makeDropdown(body);
    const btn = document.createElement('button');
    btn.textContent = 'Menu';
    body.appendChild(btn);
    const id = TdModal.show({ title: 'T', body, themeRoot: s });
    const root = document.getElementById(id) || document.querySelector('.td-modal');
    await frames(3);
    expect(root.getAttribute('data-td-theme')).to.equal('dark');
    expect(tok(root.querySelector('.td-modal__dialog'), '--td-color-surface')).to.equal(DARK.surface);
    d.open();
    expect(d._menuElement.getAttribute('data-td-theme')).to.equal('dark');
    expect(tok(d._menuElement, '--td-color-text')).to.equal(DARK.text);
    d.close();
    const m = TdMenu.open(btn, [{ label: 'Một', value: 1 }]);
    expect(m.element.getAttribute('data-td-theme')).to.equal('dark');
    m.close();
    TdModal.closeAll();
    await until(() => !document.body.contains(root));
    const plain = TdModal.show({ title: 'Plain', body: 'x' });
    const proot = document.getElementById(plain) || [...document.querySelectorAll('.td-modal')].pop();
    expect(proot.hasAttribute('data-td-theme')).to.equal(false, 'no themeRoot → the page theme');
  });

  it('programmatic overlays follow themeRoot: TdToast, TdLoading, TdMenu', async () => {
    const s = scope('dark', '<button class="b">b</button>');
    TdToast.show('Xong', 'success', { duration: 0, themeRoot: s });
    await until(() => document.querySelector('.td-toast--success'));
    const toast = document.querySelector('.td-toast--success');
    expect(toast.getAttribute('data-td-theme')).to.equal('dark');
    expect(tok(toast, '--td-pastel-success-bg')).to.equal(rgb('#143121'));
    TdToast.clear();
    TdLoading.show({ themeRoot: s, maxDuration: false });
    const ov = document.getElementById('td-loading');
    expect(ov.getAttribute('data-td-theme')).to.equal('dark');
    TdLoading.hide();
    expect(ov.hasAttribute('data-td-theme')).to.equal(false);
    expect(inlineTokens(ov)).to.deep.equal([]);
    TdLoading.show({ maxDuration: false });
    expect(ov.hasAttribute('data-td-theme')).to.equal(false, 'a reused root carries nothing over');
    TdLoading.hide();
    const page = document.createElement('button');
    stage.appendChild(page);
    const m = TdMenu.open(page, [{ label: 'x', value: 1 }], { themeRoot: s });
    expect(m.element.getAttribute('data-td-theme')).to.equal('dark');
    m.close();
  });

  it('tooltip: the chip follows the trigger scope and is clean for the next trigger', async () => {
    const s = scope('dark', '<button class="t" data-tooltip="Tối">t</button>');
    const out = document.createElement('button');
    out.setAttribute('data-tooltip', 'Sáng');
    out.textContent = 'o';
    stage.appendChild(out);
    await frames();
    tdTooltip.show(s.querySelector('.t'));
    expect(tdTooltip.tooltip.getAttribute('data-td-theme')).to.equal('dark');
    expect(tok(tdTooltip.tooltip, '--td-tooltip-bg')).to.equal(rgb('#3a3a3e'));
    tdTooltip.show(out);
    expect(tdTooltip.tooltip.hasAttribute('data-td-theme')).to.equal(false);
    expect(inlineTokens(tdTooltip.tooltip).filter((n) => n !== '--td-tooltip-arrow-x' && n !== '--td-tooltip-arrow-y')).to.deep.equal([]);
    expect(tok(tdTooltip.tooltip, '--td-tooltip-bg')).to.equal(rgb('#18181b'));
  });

  it('bridgeTheme leaves inline values it did not set; the lightbox is never bridged', async () => {
    const s = scope('dark');
    const root = document.createElement('div');
    root.style.setProperty('--td-accent', 'rgb(9, 9, 9)');
    document.body.appendChild(root);
    const undo = bridgeTheme(root, null, { themeRoot: s });
    expect(root.style.getPropertyValue('--td-accent')).to.equal('rgb(9, 9, 9)');
    expect(root.style.getPropertyValue('--td-color-text')).to.not.equal('');
    undo();
    expect(root.style.getPropertyValue('--td-accent')).to.equal('rgb(9, 9, 9)');
    expect(root.style.getPropertyValue('--td-color-text')).to.equal('');
    expect(root.hasAttribute('data-td-theme')).to.equal(false);
    root.remove();
    const btn = document.createElement('button');
    s.appendChild(btn);
    btn.focus();
    TdLightbox.open(['/test/fixtures/1.svg']);
    await until(() => document.querySelector('.td-lightbox'));
    expect(document.querySelector('.td-lightbox').hasAttribute('data-td-theme')).to.equal(false);
  });
});
