import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import '../form/td-button.js';
import '../form/td-input-field.js';
import '../form/td-dropdown.js';
import { tdTooltip } from '../feedback/td-tooltip.js';

// v0.21.0 (plan v0.21.0-pastel-toast-modal, part R1): P1 pastel semantic palette, P2 black primary + tooltip,
// P3 stronger shadows, P7 tooltip text-align, P8 lighter field focus. td.css only; site overrides are UNLAYERED
// sheets (adoptedStyleSheets), exactly what a site stylesheet is.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
host.style.setProperty('width', '640px');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const html = document.documentElement;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

function siteCss(text) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(text);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}
afterEach(async () => {
  tdTooltip.hide();
  host.innerHTML = '';
  document.adoptedStyleSheets = [];
  html.removeAttribute('data-td-theme');
  await resetMouse();
});

/** Computed colour string → [r, g, b, a] 0–255 / 0–1. color-mix() may serialise as oklab()/color(): canvas → sRGB. */
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
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** Resolve a colour token on a probe inside `host` (CSSOM only). */
function tokenColor(name) {
  const probe = mount('<span></span>');
  probe.style.setProperty('background-color', `var(${name})`);
  const c = rgb(getComputedStyle(probe).backgroundColor);
  probe.remove();
  return c;
}
const btn = (attrs) => mount(`<td-button ${attrs}>Lưu</td-button>`).querySelector('button');
async function hover(el) {
  const r = el.getBoundingClientRect();
  await sendMouse({ type: 'move', position: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] });
  await wait(250);
}

const PASTEL = {
  success: ['#dcfce7', '#bbf7d0', '#14532d'],
  danger: ['#fee2e2', '#fecaca', '#7f1d1d'],
  warning: ['#fef3c7', '#fde68a', '#78350f'],
  info: ['#dbeafe', '#bfdbfe', '#1e3a8a'],
};

describe('v0.21.0 P1 — pastel semantic buttons', () => {
  for (const [v, [bg, border, fg]] of Object.entries(PASTEL)) {
    it(`${v}: pastel fill + same-hue ink + -border edge; hover = the ~200 step (solid); ink ≥ 4.7:1 at rest + hover`, async () => {
      expect(near(tokenColor(`--td-pastel-${v}-bg`), hex(bg))).to.equal(true);
      const b = btn(`variant="${v}"`);
      const cs = getComputedStyle(b);
      expect(near(rgb(cs.backgroundColor), hex(bg)), `${v} fill`).to.equal(true);
      expect(near(rgb(cs.borderTopColor), hex(border)), `${v} border`).to.equal(true);
      expect(near(rgb(cs.color), hex(fg)), `${v} ink`).to.equal(true);
      expect(ratio(rgb(cs.color), rgb(cs.backgroundColor))).to.be.at.least(4.7);
      await hover(b);
      const h = getComputedStyle(b);
      expect(near(rgb(h.backgroundColor), hex(border)), `${v} hover fill`).to.equal(true);
      expect(ratio(rgb(h.color), rgb(h.backgroundColor))).to.be.at.least(4.7);
    });
  }

  it('dark: pastel pre-mixed on the dark page (solid), ink ~200 ≥ 4.7:1', async () => {
    html.setAttribute('data-td-theme', 'dark');
    const b = btn('variant="danger"');
    await wait(200); // colour transition
    const cs = getComputedStyle(b);
    expect(near(rgb(cs.backgroundColor), hex('#391a1c'))).to.equal(true);
    expect(near(rgb(cs.color), hex('#fecaca'))).to.equal(true);
    expect(ratio(rgb(cs.color), rgb(cs.backgroundColor))).to.be.at.least(4.7);
  });

  it('a site -bg + -hover pair is honoured', async () => {
    siteCss(':root { --td-btn-success-bg: #15803d; --td-btn-success-fg: #fff; --td-btn-success-border: #15803d; --td-btn-success-hover: #166534; }');
    const b = btn('variant="success"');
    expect(near(rgb(getComputedStyle(b).backgroundColor), hex('#15803d'))).to.equal(true);
    await hover(b);
    expect(near(rgb(getComputedStyle(b).backgroundColor), hex('#166534'))).to.equal(true);
  });

  it('v0.20.0 -tint alias still wins: fill AND edge = the tint, hover = 8 % darker (not the pastel hover)', async () => {
    siteCss('.alias { --td-btn-danger-tint: #b91c1c; }');
    const wrap = mount('<div class="alias"><td-button variant="danger">Xoá</td-button></div>');
    const b = wrap.querySelector('button');
    const cs = getComputedStyle(b);
    expect(near(rgb(cs.backgroundColor), hex('#b91c1c'))).to.equal(true);
    expect(near(rgb(cs.borderTopColor), hex('#b91c1c'))).to.equal(true);
    await hover(b);
    const hv = rgb(getComputedStyle(b).backgroundColor);
    expect(near(hv, hex('#b91c1c').map((c) => c * 0.92), 3), `hover ${hv}`).to.equal(true);
  });

  it('custom colour buttons keep the color-mix hover (not a variant -hover token)', async () => {
    const b = btn('variant="success" color="#2e7d32"');
    await hover(b);
    expect(near(rgb(getComputedStyle(b).backgroundColor), [46 * 0.92, 125 * 0.92, 50 * 0.92], 3)).to.equal(true);
  });

  it('soft badges share the pastel palette', () => {
    const badge = mount('<span class="td-badge td-badge--warning">Chờ</span>');
    expect(near(rgb(getComputedStyle(badge).backgroundColor), hex('#fef3c7'))).to.equal(true);
    expect(near(rgb(getComputedStyle(badge).color), hex('#78350f'))).to.equal(true);
  });
});

describe('v0.21.0 P2 — black primary', () => {
  it('light: #18181b + white label; hover lightens to --td-btn-primary-hover (#3f3f46)', async () => {
    const b = btn('variant="primary"');
    expect(near(rgb(getComputedStyle(b).backgroundColor), [24, 24, 27])).to.equal(true);
    expect(near(rgb(getComputedStyle(b).color), [255, 255, 255])).to.equal(true);
    await hover(b);
    expect(near(rgb(getComputedStyle(b).backgroundColor), hex('#3f3f46'))).to.equal(true);
  });

  it('dark: inverted (#f4f4f5 fill, #18181b label, hover #d4d4d8)', async () => {
    html.setAttribute('data-td-theme', 'dark');
    const b = btn('variant="primary"');
    await wait(200);
    expect(near(rgb(getComputedStyle(b).backgroundColor), hex('#f4f4f5'))).to.equal(true);
    expect(near(rgb(getComputedStyle(b).color), hex('#18181b'))).to.equal(true);
    await hover(b);
    expect(near(rgb(getComputedStyle(b).backgroundColor), hex('#d4d4d8'))).to.equal(true);
  });

  it('a site maps primary back to the accent with -bg + -hover', async () => {
    siteCss(':root { --td-accent: #dc2626; --td-btn-primary-bg: var(--td-accent-fill); --td-btn-primary-hover: #b91c1c; }');
    const b = btn('variant="primary"');
    expect(near(rgb(getComputedStyle(b).backgroundColor), [220, 38, 38])).to.equal(true);
    await hover(b);
    expect(near(rgb(getComputedStyle(b).backgroundColor), hex('#b91c1c'))).to.equal(true);
  });

  it('the accent itself is unchanged (focus ring / checkbox / ghost)', () => {
    expect(near(tokenColor('--td-accent'), [37, 99, 235])).to.equal(true);
  });
});

describe('v0.21.0 P3 — stronger shadows', () => {
  const alphas = (v) => [...String(v).matchAll(/rgba?\(([^)]+)\)/g)].map((m) => {
    const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return n.length > 3 ? n[3] : 1;
  });
  it('button lift 10 % + 12 % (dark × 2); ghost / disabled none', async () => {
    expect(alphas(getComputedStyle(btn('variant="secondary"')).boxShadow)).to.deep.equal([0.1, 0.12]);
    expect(getComputedStyle(btn('variant="ghost"')).boxShadow).to.equal('none');
    expect(getComputedStyle(btn('variant="primary" disabled')).boxShadow).to.equal('none');
    html.setAttribute('data-td-theme', 'dark');
    const d = btn('variant="secondary"');
    await wait(200);
    expect(alphas(getComputedStyle(d).boxShadow)).to.deep.equal([0.2, 0.24]);
  });

  it('surfaces: --td-glass-shadow 6 % + 12 %, -lg 8 % + 18 %', () => {
    const menu = mount('<div class="td-menu td-glass-surface td-glass-surface--strong">m</div>');
    const modal = mount('<div class="td-modal__dialog td-glass-surface td-glass-surface--lg">m</div>');
    expect(alphas(getComputedStyle(menu).boxShadow)).to.deep.equal([0.06, 0.12]);
    expect(alphas(getComputedStyle(modal).boxShadow)).to.deep.equal([0.08, 0.18]);
  });
});

describe('v0.21.0 P2 + P7 — black tooltip, text alignment', () => {
  const show = async (attrs) => {
    const b = mount(`<button type="button" data-tooltip="Một dòng chữ khá dài để chip phải xuống dòng khi hiển thị" ${attrs}>x</button>`);
    tdTooltip.show(b);
    await frames();
    return tdTooltip.tooltip;
  };

  it('default chip: black #18181b, white text, no blur, centred', async () => {
    const t = await show('');
    const cs = getComputedStyle(t);
    expect(near(rgb(cs.backgroundColor), [24, 24, 27])).to.equal(true);
    expect(near(rgb(cs.color), [255, 255, 255])).to.equal(true);
    expect(cs.backdropFilter === 'none' || !cs.backdropFilter).to.equal(true);
    expect(cs.textAlign).to.equal('center');
    expect(t.hasAttribute('data-align')).to.equal(false);
  });

  it('dark: still black, faint light edge', async () => {
    html.setAttribute('data-td-theme', 'dark');
    const cs = getComputedStyle(await show(''));
    expect(near(rgb(cs.backgroundColor), [24, 24, 27])).to.equal(true);
    expect(cs.borderTopColor).to.match(/0\.12\)$/);
  });

  for (const [value, align] of [['start', 'start'], ['center', 'center'], ['end', 'end']]) {
    it(`data-tooltip-align="${value}" → chip data-align + text-align ${align}`, async () => {
      const t = await show(`data-tooltip-align="${value}"`);
      expect(t.getAttribute('data-align')).to.equal(value);
      expect(getComputedStyle(t).textAlign).to.equal(align);
    });
  }

  it('unknown value ignored (token default); the next trigger without the attribute resets it', async () => {
    let t = await show('data-tooltip-align="justify"');
    expect(t.hasAttribute('data-align')).to.equal(false);
    expect(getComputedStyle(t).textAlign).to.equal('center');
    t = await show('data-tooltip-align="start"');
    expect(t.getAttribute('data-align')).to.equal('start');
    t = await show('');
    expect(t.hasAttribute('data-align')).to.equal(false);
  });

  it('--td-tooltip-text-align is overridable by the site', async () => {
    siteCss(':root { --td-tooltip-text-align: start; }');
    expect(getComputedStyle(await show('')).textAlign).to.equal('start');
  });
});

describe('v0.21.0 P8 — lighter field focus', () => {
  it('input-field: border = accent 85 % toward white (≥ 3:1), faint 3px accent halo (~12 %)', async () => {
    const el = mount('<td-input-field label="Tên"></td-input-field>');
    const input = el.querySelector('.td-field__control');
    input.focus();
    await sendKeys({ press: 'a' }); // keyboard → :focus-visible
    await wait(250);
    const cs = getComputedStyle(input);
    const border = rgb(cs.borderTopColor);
    expect(near(border, [37 * 0.85 + 255 * 0.15, 99 * 0.85 + 255 * 0.15, 235 * 0.85 + 255 * 0.15], 3), `${border}`).to.equal(true);
    expect(ratio(border, [255, 255, 255])).to.be.at.least(3);
    expect(cs.boxShadow).to.match(/0px 0px 0px 3px/);
    const m = cs.boxShadow.match(/^(.*?\)) 0px 0px 0px 3px/);
    const ring = m[1];
    // halo alpha ≈ 12 % (serialised as rgba(...) or color(srgb ... / 0.12))
    expect(Number(ring.match(/([\d.]+)\)$/)[1])).to.be.closeTo(0.12, 0.02);
  });

  it('follows the site accent', async () => {
    siteCss(':root { --td-accent: #7c3aed; }');
    const el = mount('<td-input-field label="Tên"></td-input-field>');
    const input = el.querySelector('.td-field__control');
    input.focus();
    await wait(250);
    const border = rgb(getComputedStyle(input).borderTopColor);
    expect(near(border, [124 * 0.85 + 38.25, 58 * 0.85 + 38.25, 237 * 0.85 + 38.25], 3), `${border}`).to.equal(true);
  });

  const tabTo = async (target) => {
    const sentinel = document.createElement('button');
    sentinel.type = 'button';
    sentinel.textContent = 's';
    target.before(sentinel);
    sentinel.focus();
    await sendKeys({ press: 'Tab' }); // keyboard → :focus-visible
    await wait(250);
    sentinel.remove();
    return document.activeElement === target;
  };

  it('dropdown trigger focus-visible uses the same lighter ring', async () => {
    const dd = mount('<td-dropdown label="Chọn"><option value="a">A</option></td-dropdown>');
    const trigger = dd.querySelector('.td-dropdown__trigger');
    expect(await tabTo(trigger)).to.equal(true);
    const sh = getComputedStyle(trigger).boxShadow;
    expect(sh).to.match(/0px 0px 0px 3px/);
    expect(sh).to.not.match(/0\.35\)/); // not the strong --td-focus-ring
  });

  it('buttons keep the strong --td-focus-ring', async () => {
    const b = btn('variant="secondary"');
    expect(await tabTo(b)).to.equal(true);
    expect(getComputedStyle(b).boxShadow).to.match(/0\.35\)/);
  });
});
