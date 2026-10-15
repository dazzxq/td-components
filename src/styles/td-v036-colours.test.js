// v0.36.0 (plan QĐ 18–27, M5) — solid semantic colours: token declarations (pure text checks of the shipped CSS).
// Rendered colours / geometry: src/styles/td-v036-solid-colours.engines.browser-test.js; contrast: test/tokens/contrast.spec.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (p) => readFile(join(ROOT, p), 'utf8');
/** v0.42.0 (QĐ15, ADR 0020): light colour tokens moved to the scope block, dark to the scoped dark variant */
const ALIASES = {
  ':root': [':root', ':root, [data-td-theme]'],
  ':root[data-td-theme="dark"]': [':root[data-td-theme="dark"], [data-td-theme][data-td-theme="dark"]'],
};
/** `--name: value;` declarations of the FIRST block matching `selector {` (no nesting inside the block); `:root` and
 * the dark selector also read their v0.42.0 scoped forms (merged, first block of each). */
function decls(raw, selector) {
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, ''); // comments may hold braces / example rules
  const out = {};
  let found = false;
  for (const sel of ALIASES[selector] || [selector]) {
    const i = css.indexOf(`\t${sel} {`);
    if (i < 0) continue;
    found = true;
    const body = css.slice(i, css.indexOf('}', i));
    for (const m of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  }
  assert.ok(found, `block ${selector}`);
  return out;
}

const SOLID = {
  success: { bg: '#15803d', fg: '#fff', hover: '#166534', border: '#166534' },
  danger: { bg: '#dc2626', fg: '#fff', hover: '#b91c1c', border: '#b91c1c' },
  warning: { bg: '#f59e0b', fg: '#18181b', hover: '#d97706', border: '#d97706' },
  info: { bg: '#2563eb', fg: '#fff', hover: '#1d4ed8', border: '#1d4ed8' },
};

test('QĐ 18: --td-solid-{v}-{bg,fg,hover,border} in tokens.css and the SAME values in theme-dark.css', async () => {
  const light = decls(await read('src/styles/tokens.css'), ':root');
  const dark = decls(await read('src/styles/theme-dark.css'), ':root[data-td-theme="dark"]');
  for (const [v, t] of Object.entries(SOLID)) {
    for (const [k, val] of Object.entries(t)) {
      assert.equal(light[`--td-solid-${v}-${k}`], val, `light ${v}-${k}`);
      assert.equal(dark[`--td-solid-${v}-${k}`], val, `dark ${v}-${k}`);
    }
  }
});

test('QĐ 19 + 25: semantic buttons read the solid tokens; the pastel palette stays declared (deprecated)', async () => {
  const light = decls(await read('src/styles/tokens.css'), ':root');
  for (const v of Object.keys(SOLID)) {
    for (const k of ['bg', 'fg', 'border', 'hover']) assert.equal(light[`--td-btn-${v}-${k}`], `var(--td-solid-${v}-${k})`, `btn ${v}-${k}`);
    for (const k of ['bg', 'border', 'fg']) assert.match(light[`--td-pastel-${v}-${k}`] || '', /^#[0-9a-f]{6}$/, `pastel ${v}-${k} kept`);
  }
});

test('v0.76.0 (supersedes QĐ 21–22): badge TINTED fill + label, transparent edge, two-layer shadow, glass tokens, -ink kept', async () => {
  const css = await read('src/styles/components/badge.css');
  const t = decls(css, ':root');
  const d = decls(css, ':root[data-td-theme="dark"]');
  const INK = { success: 'var(--td-color-success)', danger: 'var(--td-color-error)', warning: 'var(--td-color-warning)', info: '#2563eb' };
  const LIGHT = { neutral: ['#e4e4e7', '#3f3f46'], success: ['#bbf7d0', '#166534'], warning: ['#fed7aa', '#9a3412'], danger: ['#fecaca', '#991b1b'], info: ['#bfdbfe', '#1e40af'] };
  const DARK = { neutral: ['#3f3f46', '#e4e4e7'], success: ['#14532d', '#bbf7d0'], warning: ['#7c2d12', '#fed7aa'], danger: ['#7f1d1d', '#fecaca'], info: ['#1e3a8a', '#bfdbfe'] };
  const GLASS_L = { neutral: '#27272a', accent: '#172554', success: '#14532d', warning: '#7c2d12', danger: '#7f1d1d', info: '#1e3a8a' };
  const GLASS_D = { neutral: '#f4f4f5', accent: '#dbeafe', success: '#dcfce7', warning: '#ffedd5', danger: '#fee2e2', info: '#dbeafe' };
  for (const [v, [bg, fg]] of Object.entries(LIGHT)) {
    assert.equal(t[`--td-badge-${v}-bg`], bg, `${v}-bg`);
    assert.equal(t[`--td-badge-${v}-fg`], fg, `${v}-fg`);
  }
  for (const [v, [bg, fg]] of Object.entries(DARK)) {
    assert.equal(d[`--td-badge-${v}-bg`], bg, `dark ${v}-bg`);
    assert.equal(d[`--td-badge-${v}-fg`], fg, `dark ${v}-fg`);
  }
  assert.equal(t['--td-badge-accent-bg'], '#cfe0fd');
  assert.equal(t['--td-badge-accent-fg'], '#1e3f8f');
  assert.equal(d['--td-badge-accent-bg'], '#1e3a8a');
  assert.equal(d['--td-badge-accent-fg'], '#bfdbfe');
  for (const [v, ink] of Object.entries(INK)) assert.equal(t[`--td-badge-${v}-ink`], ink, `${v}-ink`);
  for (const v of ['neutral', 'accent', 'success', 'warning', 'danger', 'info']) {
    assert.equal(t[`--td-badge-${v}-border`], 'transparent', `${v}-border`);
    assert.equal(t[`--td-badge-${v}-glass-fg`], GLASS_L[v], `${v}-glass-fg`);
    assert.equal(d[`--td-badge-${v}-glass-fg`], GLASS_D[v], `dark ${v}-glass-fg`);
  }
  assert.equal(t['--td-badge-shadow'], '0 1px 2px rgb(0 0 0 / 10%), 0 2px 6px -1px rgb(0 0 0 / 10%)');
  assert.equal(d['--td-badge-shadow'], '0 1px 2px rgb(0 0 0 / 50%), 0 2px 6px -1px rgb(0 0 0 / 45%)');
  // alpha / blur are non-colour tokens: they stay on the plain :root block (a site :root override reaches inside scopes)
  const root = decls(css, ':root');
  assert.equal(root['--td-badge-glass-alpha'], '85%');
  assert.equal(root['--td-badge-glass-blur'], '12px');
  assert.equal(t['--td-badge-glass-edge'], 'rgb(255 255 255 / 55%)');
  assert.equal(d['--td-badge-glass-edge'], 'rgb(255 255 255 / 16%)');
  assert.equal(t['--td-badge-glass-highlight'], 'rgb(255 255 255 / 60%)');
  assert.equal(d['--td-badge-glass-highlight'], 'rgb(255 255 255 / 12%)');
  for (const [k, val] of Object.entries(t)) {
    if (/-(border|ink|shadow)$/.test(k)) assert.ok(!/color-mix/.test(val), `${k} must not need color-mix (Chrome 102)`);
  }
  assert.match(css, /@media \(prefers-contrast: more\)\s*\{\s*\.td-badge\s*\{[^}]*border-color:\s*currentcolor;[^}]*box-shadow:\s*none;/);
  // --glass fallbacks reuse the glass.css contract (reduced transparency, data-td-glass="off", contrast, forced colours)
  assert.match(css, /prefers-reduced-transparency: reduce/);
  assert.match(css, /:root\[data-td-glass="off"\] \.td-badge--glass/);
  assert.match(css, /@supports \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\) and \(color: color-mix/);
});

test('QĐ 26 (stripe superseded in 0.62.0): alert accent tokens stay declared but inert, stronger border (~300)', async () => {
  const css = await read('src/styles/components/alert.css');
  const t = decls(css, ':root');
  assert.equal(t['--td-alert-info-accent'], 'var(--td-solid-info-bg)');
  assert.equal(t['--td-alert-success-accent'], 'var(--td-solid-success-bg)');
  assert.equal(t['--td-alert-danger-accent'], 'var(--td-solid-danger-bg)');
  assert.equal(t['--td-alert-warning-accent'], 'var(--td-solid-warning-border)'); // amber-500 is < 3:1 on the light fill
  assert.equal(t['--td-alert-warning-icon'], 'var(--td-color-warning)'); // v0.41.0: = #b45309 (golden.json)
  for (const [v, hex] of Object.entries({ info: '#93c5fd', success: '#86efac', warning: '#fcd34d', danger: '#fca5a5' })) {
    assert.equal(t[`--td-alert-${v}-border`], hex, `${v}-border`);
  }
  // v0.62.0 (plan A, ADR 0033): the 4px bar is gone — the tokens above are kept for golden / sites, nothing paints them
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /border-inline-start/);
});
