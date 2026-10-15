import { expect } from '@esm-bundle/chai';
import { parseColor } from '../../test/tokens/color-parse.js';

// v0.76.0 (plan docs/internal/plans/v0.76.0-badge-tinted-glass.md) — td-badge in Chromium, Firefox AND WebKit:
//  1. the six variants are TINTED by default (light + dark): fill / label from the plan table, transparent 1px edge, a soft
//     two-layer shadow;
//  2. `--glass` (opt-in): label = --td-badge-{v}-glass-fg, translucent fill (alpha < 1), blur(12px) saturate when the engine
//     supports it, the light edge token; next to --outline / --stamp it does nothing;
//  3. the fallbacks: <html data-td-glass="off"> (all engines), prefers-contrast: more and prefers-reduced-transparency (the
//     media rules of td.css are switched to `all` IN PLACE — web-test-runner's emulateMedia has no such feature; same trick
//     as td-v069-button-plain), forced-colors (real emulation);
//  4. --outline / --stamp are unchanged (transparent, ink, no shadow).
// DOM nodes are never put in a chai assertion (a failing one hangs the runner).
import { emulateMedia } from '@web/test-runner-commands';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(r));
const host = document.createElement('div');
document.body.appendChild(host);
afterEach(async () => {
  host.innerHTML = '';
  document.documentElement.removeAttribute('data-td-theme');
  document.documentElement.removeAttribute('data-td-glass');
  await emulateMedia({ forcedColors: null });
});

const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const VARIANTS = ['neutral', 'accent', 'success', 'warning', 'danger', 'info'];
const mount = (cls, text = 'Đã duyệt') => { host.insertAdjacentHTML('beforeend', `<span class="td-badge ${cls}">${text}</span>`); return host.lastElementChild; };
const alphaOf = (c) => parseColor(c).a;
/** same colour whatever the serialisation (rgb() / color(srgb …)) */
const sameColour = (a, b, what) => {
  const x = parseColor(a); const y = parseColor(b);
  const d = Math.max(Math.abs(x.r - y.r), Math.abs(x.g - y.g), Math.abs(x.b - y.b), Math.abs(x.a - y.a) * 255);
  expect(d, `${what || ''} ${a} vs ${b}`).to.be.below(1.5);
};
const filterOf = (el) => {
  const cs = getComputedStyle(el);
  return cs.backdropFilter || cs.webkitBackdropFilter || 'none';
};
const CAN_BLUR = !!(window.CSS && (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)')));
const CAN_MIX = !!(window.CSS && CSS.supports('color', 'color-mix(in srgb, red 50%, blue)'));
const GLASS_ON = CAN_BLUR && CAN_MIX;

// plan table (light bg / label, dark bg / label); accent is static only when color-mix() is missing, so it is measured as
// the token's own computed value instead
const LIGHT = { neutral: ['#e4e4e7', '#3f3f46'], success: ['#bbf7d0', '#166534'], warning: ['#fed7aa', '#9a3412'], danger: ['#fecaca', '#991b1b'], info: ['#bfdbfe', '#1e40af'] };
const DARK = { neutral: ['#3f3f46', '#e4e4e7'], success: ['#14532d', '#bbf7d0'], warning: ['#7c2d12', '#fed7aa'], danger: ['#7f1d1d', '#fecaca'], info: ['#1e3a8a', '#bfdbfe'] };
const GLASS_FG_LIGHT = { neutral: '#27272a', success: '#14532d', warning: '#7c2d12', danger: '#7f1d1d', info: '#1e3a8a' };
const GLASS_FG_DARK = { neutral: '#f4f4f5', success: '#dcfce7', warning: '#ffedd5', danger: '#fee2e2', info: '#dbeafe' };

/** the computed colour of `var(name)` on a probe in the current theme */
function tokenColour(name) {
  const p = document.createElement('span');
  p.style.setProperty('color', `var(${name})`);
  host.appendChild(p);
  const c = getComputedStyle(p).color;
  p.remove();
  return c;
}

/** Switch every td.css media rule matching `mediaRe` that carries a child rule accepted by `hasSelector` to `all`, in place. */
function switchMedia(mediaRe, hasSelector) {
  const sheet = [...document.styleSheets].find((x) => x.href && x.href.endsWith('/td.css'));
  const rules = [];
  const walk = (list) => {
    for (const r of list) {
      if (r.media && mediaRe.test(r.media.mediaText) && [...r.cssRules].some((x) => hasSelector(x.selectorText || ''))) rules.push(r);
      else if (r.cssRules) walk(r.cssRules);
    }
  };
  walk(sheet.cssRules);
  const orig = rules.map((r) => r.media.mediaText);
  rules.forEach((r) => { r.media.mediaText = 'all'; });
  return { count: rules.length, restore: () => rules.forEach((r, i) => { r.media.mediaText = orig[i]; }) };
}

describe('v0.76.0 td-badge default = tinted', () => {
  for (const theme of ['light', 'dark']) {
    for (const v of VARIANTS) {
      it(`${theme} ${v}: tint fill + label, transparent edge (1px kept), soft two-layer shadow`, () => {
        if (theme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
        const b = mount(`td-badge--${v}`);
        const cs = getComputedStyle(b);
        if (v === 'accent') {
          expect(cs.backgroundColor).to.equal(tokenColour('--td-badge-accent-bg'));
          expect(cs.color).to.equal(tokenColour('--td-badge-accent-fg'));
        } else {
          const [bg, fg] = (theme === 'dark' ? DARK : LIGHT)[v];
          expect(cs.backgroundColor).to.equal(rgb(bg));
          expect(cs.color).to.equal(rgb(fg));
        }
        expect(cs.borderTopWidth).to.equal('1px');
        expect(cs.borderTopStyle).to.equal('solid');
        expect(cs.borderTopColor).to.equal('rgba(0, 0, 0, 0)');
        expect(cs.boxShadow).to.not.equal('none');
        expect(cs.boxShadow.split('rgba(').length - 1, 'two shadow layers').to.equal(2);
        expect(cs.backdropFilter || 'none').to.equal('none');
      });
    }
  }

  it('the default (no variant class) is the neutral tint', () => {
    const b = mount('');
    expect(getComputedStyle(b).backgroundColor).to.equal(rgb('#e4e4e7'));
    expect(getComputedStyle(b).color).to.equal(rgb('#3f3f46'));
  });
});

describe('v0.76.0 td-badge --glass', () => {
  for (const theme of ['light', 'dark']) {
    for (const v of VARIANTS) {
      it(`${theme} ${v}: label = --td-badge-${v}-glass-fg${GLASS_ON ? ', translucent fill, blur(12px), edge token' : ' (blur / color-mix unsupported: opaque tint)'}`, () => {
        if (theme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
        const b = mount(`td-badge--${v} td-badge--glass`);
        const cs = getComputedStyle(b);
        expect(cs.color).to.equal(tokenColour(`--td-badge-${v}-glass-fg`));
        if (v !== 'accent') expect(cs.color).to.equal(rgb((theme === 'dark' ? GLASS_FG_DARK : GLASS_FG_LIGHT)[v]));
        const tint = tokenColour(`--td-badge-${v}-bg`);
        if (GLASS_ON) {
          const a = alphaOf(cs.backgroundColor);
          expect(a, `fill alpha ${cs.backgroundColor}`).to.be.within(0.84, 0.86);
          const t = parseColor(tint);
          const f = parseColor(cs.backgroundColor);
          for (const k of ['r', 'g', 'b']) expect(Math.abs(f[k] - t[k]), `${k} of the tint kept`).to.be.below(2);
          expect(filterOf(b)).to.contain('blur(12px)');
          expect(filterOf(b)).to.contain('saturate');
          expect(cs.borderTopColor).to.equal(tokenColourEdge());
          expect(cs.boxShadow).to.contain('inset');
        } else {
          sameColour(cs.backgroundColor, tint, 'tint');
          expect(filterOf(b)).to.equal('none');
        }
      });
    }
  }

  it('--glass next to --outline / --stamp has no effect (no blur, transparent fill, no shadow, ink colour)', () => {
    for (const mod of ['outline', 'stamp']) {
      const b = mount(`td-badge--success td-badge--glass td-badge--${mod}`);
      const cs = getComputedStyle(b);
      expect(filterOf(b), mod).to.equal('none');
      expect(cs.backgroundColor, mod).to.equal('rgba(0, 0, 0, 0)');
      expect(cs.boxShadow, mod).to.equal('none');
      expect(cs.color, mod).to.equal(rgb('#15803d')); // -ink, not the glass-fg
      expect(cs.borderTopColor, mod).to.equal(cs.color);
    }
  });

  it('the alpha / blur tokens drive the glass', function () {
    if (!GLASS_ON) this.skip();
    document.documentElement.style.setProperty('--td-badge-glass-alpha', '50%');
    document.documentElement.style.setProperty('--td-badge-glass-blur', '4px');
    try {
      const b = mount('td-badge--info td-badge--glass');
      expect(alphaOf(getComputedStyle(b).backgroundColor)).to.be.within(0.49, 0.51);
      expect(filterOf(b)).to.contain('blur(4px)');
    } finally {
      document.documentElement.style.removeProperty('--td-badge-glass-alpha');
      document.documentElement.style.removeProperty('--td-badge-glass-blur');
    }
  });
});

function tokenColourEdge() {
  return tokenColour('--td-badge-glass-edge');
}

describe('v0.76.0 td-badge --glass fallbacks → the opaque tint, no blur', () => {
  function expectSolid(v, what) {
    const b = mount(`td-badge--${v} td-badge--glass`);
    const cs = getComputedStyle(b);
    expect(alphaOf(cs.backgroundColor), `${what}: fill opaque ${cs.backgroundColor}`).to.equal(1);
    expect(filterOf(b), `${what}: no blur`).to.equal('none');
    expect(cs.color, `${what}: label stays the glass label`).to.equal(tokenColour(`--td-badge-${v}-glass-fg`));
    return cs;
  }

  it('<html data-td-glass="off"> (every engine; the only switch on WebKit)', () => {
    document.documentElement.setAttribute('data-td-glass', 'off');
    for (const v of VARIANTS) {
      const cs = expectSolid(v, `off ${v}`);
      sameColour(cs.backgroundColor, tokenColour(`--td-badge-${v}-bg`), `off ${v}`);
      expect(cs.borderTopColor).to.equal('rgba(0, 0, 0, 0)');
    }
  });

  it('prefers-contrast: more → opaque tint, no blur, currentColor edge, no shadow', async function () {
    const sw = switchMedia(/prefers-contrast:\s*more/, (sel) => sel === '.td-badge--glass' || sel === '.td-badge');
    try {
      expect(sw.count, 'the increased-contrast rules of .td-badge were found in td.css').to.be.at.least(2);
      await raf();
      const cs = expectSolid('warning', 'contrast');
      expect(cs.borderTopColor).to.equal(cs.color);
      const colours = [...cs.boxShadow.matchAll(/rgba?\([^)]*\)/g)].map((m) => m[0]);
      expect(colours.length).to.be.greaterThan(0);
      for (const c of colours) expect(alphaOf(c), `shadow colour ${c} is invisible`).to.equal(0);
    } finally {
      sw.restore();
    }
  });

  it('prefers-reduced-transparency: reduce → opaque tint, no blur', async function () {
    const sw = switchMedia(/prefers-reduced-transparency:\s*reduce/, (sel) => sel === '.td-badge--glass');
    try {
      expect(sw.count, 'the reduced-transparency rule of .td-badge--glass was found in td.css').to.be.at.least(1);
      await raf();
      const cs = expectSolid('danger', 'reduced transparency');
      sameColour(cs.backgroundColor, tokenColour('--td-badge-danger-bg'), 'reduced');
    } finally {
      sw.restore();
    }
  });

  it('forced-colors: active → system colours, opaque, no blur', async () => {
    await emulateMedia({ forcedColors: 'active' });
    await raf(); await raf();
    const b = mount('td-badge--success td-badge--glass');
    expect(filterOf(b)).to.equal('none');
    expect(getComputedStyle(b).color).to.equal(getComputedStyle(mount('')).color);
  });
});

describe('v0.76.0 --outline / --stamp unchanged', () => {
  it('transparent fill, -ink colour, currentColor edge, no shadow (light + dark ink)', () => {
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
      for (const [v, ink] of Object.entries({ success: theme === 'dark' ? '#86efac' : '#15803d', warning: theme === 'dark' ? '#fcd34d' : '#b45309',
        danger: theme === 'dark' ? '#fca5a5' : '#b91c1c', info: theme === 'dark' ? '#93c5fd' : '#2563eb' })) {
        for (const mod of ['outline', 'stamp']) {
          const cs = getComputedStyle(mount(`td-badge--${v} td-badge--${mod}`));
          expect(cs.backgroundColor, `${theme} ${v} ${mod}`).to.equal('rgba(0, 0, 0, 0)');
          expect(cs.color, `${theme} ${v} ${mod}`).to.equal(rgb(ink));
          expect(cs.boxShadow).to.equal('none');
          expect(cs.borderTopColor).to.equal(cs.color);
        }
      }
      host.innerHTML = '';
    }
  });
});
