// v0.41.0 (plan M1, QĐ17): the theme contract is complete and consistent with the CSS sources.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { THEME_TOKENS, THEME_GROUPS, DERIVED_THEME_TOKENS, THEME_TOKENS_VERSION } from './tokens.js';
import { matchBrace } from '../../scripts/css-responsive.mjs';

const STYLES = join(dirname(fileURLToPath(import.meta.url)), '..', 'styles');
const manifest = JSON.parse(readFileSync(join(STYLES, 'manifest.json'), 'utf8'));

/** Declarations (name → value) of every block whose selector is exactly `sel`, at any nesting depth. */
function declarations(sel) {
  const out = new Map();
  for (const file of manifest.files) {
    const css = readFileSync(join(STYLES, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    const re = /([^{};]+)\{/g;
    let m;
    while ((m = re.exec(css))) {
      const open = m.index + m[0].length - 1;
      if (m[1].replace(/\s+/g, ' ').trim() !== sel) continue;
      const body = css.slice(open + 1, matchBrace(css, open));
      for (const d of body.matchAll(/(--td-[a-z0-9-]+)\s*:\s*([^;]+);/g)) out.set(d[1], d[2].trim());
    }
  }
  return out;
}

// v0.42.0 (QĐ15): light colour tokens live on the scope block, geometry on :root — the contract reads both
const light = new Map([...declarations(':root'), ...declarations(':root, [data-td-theme]')]);
const dark = declarations(':root[data-td-theme="dark"], [data-td-theme][data-td-theme="dark"]');

/** Same value in both themes by design (reason kept next to each). */
const THEME_INVARIANT = new Map([
  ['--td-accent-contrast', 'white on the accent fill in both themes (dark re-declares it anyway)'],
  ['--td-tooltip-fg', 'white on the tooltip chip in both themes'],
]);

test('contract: version, no duplicate names, stable groups', () => {
  assert.equal(THEME_TOKENS_VERSION, 1);
  assert.equal(new Set(THEME_TOKENS).size, THEME_TOKENS.length, 'duplicate token in THEME_TOKENS');
  assert.deepEqual(THEME_GROUPS.map((g) => g.group),
    ['surface', 'ink', 'structure', 'interaction', 'accent', 'status', 'button', 'elevation']);
  for (const d of DERIVED_THEME_TOKENS) assert.ok(THEME_TOKENS.includes(d), `derived ${d} not in the contract`);
  for (const t of THEME_TOKENS) assert.match(t, /^--td-[a-z0-9-]+$/);
});

test('every contract token is declared on :root (light) in the CSS sources', () => {
  const missing = THEME_TOKENS.filter((t) => !light.has(t));
  assert.deepEqual(missing, [], `not declared on :root: ${missing.join(', ')}`);
});

test('every contract token has a dark value: declared in a dark block, derived by alias, or theme-invariant', () => {
  const missing = THEME_TOKENS.filter((t) => !dark.has(t) && !DERIVED_THEME_TOKENS.includes(t) && !THEME_INVARIANT.has(t));
  assert.deepEqual(missing, [], `no dark value: ${missing.join(', ')}`);
});

test('derived tokens are aliases of another contract token on :root and are not re-declared in dark', () => {
  for (const t of DERIVED_THEME_TOKENS) {
    const v = light.get(t);
    const ref = /^var\((--td-[a-z0-9-]+)\)$/.exec(v || '');
    assert.ok(ref && THEME_TOKENS.includes(ref[1]), `${t}: ${v} is not var(<contract token>)`);
    assert.ok(!dark.has(t), `${t} is derived but re-declared in a dark block (the alias already follows the theme)`);
  }
});

test('v0.42.0: DERIVED_ALIASES names exactly the derived tokens and matches their alias in tokens.css', async () => {
  const { DERIVED_ALIASES } = await import('./tokens.js');
  assert.deepEqual(Object.keys(DERIVED_ALIASES).sort(), [...DERIVED_THEME_TOKENS].sort());
  for (const [t, src] of Object.entries(DERIVED_ALIASES)) {
    assert.equal(light.get(t), `var(${src})`, `${t} in tokens.css`);
    assert.ok(THEME_TOKENS.includes(src), `${src} is a contract token`);
  }
});

test('v0.42.0: preset shadows / focus ring are the CSS source strings (light: tokens.css, dark: theme-dark.css)', async () => {
  const { PRESETS } = await import('./presets.js');
  for (const t of ['--td-shadow-1', '--td-shadow-2', '--td-shadow-3', '--td-glass-shadow', '--td-glass-shadow-lg', '--td-btn-lift', '--td-focus-ring']) {
    assert.equal(PRESETS.light[t], light.get(t), `light ${t}`);
    assert.equal(PRESETS.dark[t], dark.get(t), `dark ${t}`);
  }
});

/**
 * v0.42.0 impl review ISSUE-1: a generated palette with a dark scheme in the base slot or under a name does not get the
 * kit's dark blocks — so EVERY token a kit dark rule sets must reach a generated palette some other way: it is in the
 * contract (THEME_TOKENS), or the generator serializes it (SCHEME_TOKENS), or it is the same in both themes on purpose.
 */
const DARK_INVARIANT = new Map([
  ...['success', 'danger', 'warning', 'info'].flatMap((v) => ['bg', 'fg', 'hover', 'border'].map((p) => [`--td-solid-${v}-${p}`,
    'solid status buttons: the same values in both themes (white / dark label measured on the fill only)'])),
]);

test('v0.42.0 ISSUE-1: every token a kit dark rule sets is a contract token, a generated scheme token, or dark-invariant', async () => {
  const { SCHEME_TOKENS } = await import('./tokens.js');
  const uncovered = [...dark.keys()].filter((t) => !THEME_TOKENS.includes(t) && !SCHEME_TOKENS.includes(t) && !DARK_INVARIANT.has(t));
  assert.deepEqual(uncovered, [], `dark-only component colours a generated palette would miss: ${uncovered.join(', ')}`);
  for (const t of SCHEME_TOKENS) assert.ok(light.has(t), `${t} declared on the scope block (light)`);
  assert.equal(new Set(SCHEME_TOKENS).size, SCHEME_TOKENS.length);
  for (const t of SCHEME_TOKENS) assert.ok(!THEME_TOKENS.includes(t), `${t} is not also a contract token`);
});

test('v0.42.0 ISSUE-1: dark-invariant tokens really have the same value in both themes', () => {
  for (const t of DARK_INVARIANT.keys()) if (dark.has(t)) assert.equal(dark.get(t), light.get(t), t);
});
