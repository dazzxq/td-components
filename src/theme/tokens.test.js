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
      if (m[1].trim() !== sel) continue;
      const body = css.slice(open + 1, matchBrace(css, open));
      for (const d of body.matchAll(/(--td-[a-z0-9-]+)\s*:\s*([^;]+);/g)) out.set(d[1], d[2].trim());
    }
  }
  return out;
}

const light = declarations(':root');
const dark = declarations(':root[data-td-theme="dark"]');

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
