// v0.36.0 (plan QĐ 18–27, M5) — solid semantic colours: token declarations (pure text checks of the shipped CSS).
// Rendered colours / geometry: src/styles/td-v036-solid-colours.engines.browser-test.js; contrast: test/tokens/contrast.spec.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (p) => readFile(join(ROOT, p), 'utf8');
/** `--name: value;` declarations of the FIRST block matching `selector {` (no nesting inside the block) */
function decls(raw, selector) {
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, ''); // comments may hold braces / example rules
  const i = css.indexOf(`\t${selector} {`);
  assert.ok(i >= 0, `block ${selector}`);
  const body = css.slice(i, css.indexOf('}', i));
  return Object.fromEntries([...body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
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

test('QĐ 21–22: badge solid fill, -ink for outline / stamp, precomputed hex -border, --td-badge-shadow, no color-mix', async () => {
  const css = await read('src/styles/components/badge.css');
  const t = decls(css, ':root');
  const INK = { success: '#15803d', danger: '#b91c1c', warning: '#b45309', info: '#2563eb' };
  const BORDER = { neutral: '#ababac', accent: '#99a4b2', success: '#0f5a2b', danger: '#9a1b1b', warning: '#ac6f08', info: '#1a45a5' };
  for (const v of Object.keys(SOLID)) {
    assert.equal(t[`--td-badge-${v}-bg`], `var(--td-solid-${v}-bg)`, `${v}-bg`);
    assert.equal(t[`--td-badge-${v}-fg`], `var(--td-solid-${v}-fg)`, `${v}-fg`);
    assert.equal(t[`--td-badge-${v}-ink`], INK[v], `${v}-ink`);
  }
  for (const [v, hex] of Object.entries(BORDER)) assert.equal(t[`--td-badge-${v}-border`], hex, `${v}-border`);
  assert.equal(t['--td-badge-shadow'], '0 1px 2px rgb(0 0 0 / 12%)');
  for (const [k, val] of Object.entries(t)) {
    if (/-(border|ink|shadow)$/.test(k)) assert.ok(!/color-mix/.test(val), `${k} must not need color-mix (Chrome 102)`);
  }
  assert.match(css, /@media \(prefers-contrast: more\)\s*\{\s*\.td-badge\s*\{[^}]*border-color:\s*currentcolor;[^}]*box-shadow:\s*none;/);
});

test('QĐ 26: alert accent token per variant, a 4px inline-start bar, stronger border (~300)', async () => {
  const css = await read('src/styles/components/alert.css');
  const t = decls(css, ':root');
  assert.equal(t['--td-alert-info-accent'], 'var(--td-solid-info-bg)');
  assert.equal(t['--td-alert-success-accent'], 'var(--td-solid-success-bg)');
  assert.equal(t['--td-alert-danger-accent'], 'var(--td-solid-danger-bg)');
  assert.equal(t['--td-alert-warning-accent'], 'var(--td-solid-warning-border)'); // amber-500 is < 3:1 on the light fill
  assert.equal(t['--td-alert-warning-icon'], '#b45309');
  for (const [v, hex] of Object.entries({ info: '#93c5fd', success: '#86efac', warning: '#fcd34d', danger: '#fca5a5' })) {
    assert.equal(t[`--td-alert-${v}-border`], hex, `${v}-border`);
  }
  assert.match(css, /border-inline-start:\s*4px solid var\(--td-alert-info-accent\)/);
});
