// v0.96.0 (plan v0.96.0-modal-wp §5.4): static checks of the opt-in frosted surface of td-modal / td-drawer — tokens
// only, specificity 0,3,0 over glass.css's opaque group, every fallback still routed through the private
// --_td-glass-* tokens (no accessibility block rewritten), no !important. Rendering: src/feedback/
// td-v096-modal-glass.engines.browser-test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const modal = read('./components/modal.css');
const drawer = read('./components/drawer.css');
const glass = read('./glass.css');

/** The body of the rule whose selector is exactly `sel` (first match). */
function ruleBody(css, sel) {
  const i = css.indexOf(`${sel} {`);
  assert.ok(i >= 0, `rule ${sel} exists`);
  const open = css.indexOf('{', i);
  return css.slice(open + 1, css.indexOf('}', open));
}

/** Class / attribute / pseudo-class count of a simple compound selector list (no :is / :where here). */
const classes = (sel) => (sel.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;

const VARIANTS = [
  { css: modal, sel: '.td-modal--glass .td-modal__dialog.td-glass-surface', bg: '--td-modal-glass-bg', blur: '--td-modal-glass-blur' },
  { css: drawer, sel: '.td-drawer-root--glass .td-drawer__panel.td-glass-surface', bg: '--td-drawer-glass-bg', blur: '--td-drawer-glass-blur' },
];

for (const v of VARIANTS) {
  test(`${v.sel}: 0,3,0, tokens only, fallbacks through --_td-glass-*`, () => {
    assert.equal(classes(v.sel), 3, 'beats the opaque group :is(…).td-glass-surface (0,2,0) and --strong (0,1,0)');
    const body = ruleBody(v.css, v.sel);
    assert.match(body, new RegExp(`background-color:\\s*var\\(--_td-glass-fill,\\s*var\\(${v.bg}\\)\\)`));
    assert.match(body, new RegExp(`(?<!-)backdrop-filter:\\s*var\\(--_td-glass-filter,\\s*var\\(${v.blur}\\)\\)`));
    assert.match(body, new RegExp(`-webkit-backdrop-filter:\\s*var\\(--_td-glass-filter,\\s*var\\(${v.blur}\\)\\)`));
    assert.doesNotMatch(body, /!important/);
    assert.doesNotMatch(body, /#[0-9a-f]{3,8}\b|rgb\(|hsl\(|blur\(/i, 'no literal colour / blur: tokens only');
  });

  test(`${v.bg} / ${v.blur} default to the shared glass tokens; the fill is re-resolved in theme scopes`, () => {
    assert.match(v.css, new RegExp(`:root, \\[data-td-theme\\] \\{[^}]*${v.bg}:\\s*var\\(--td-glass-bg-strong\\)`));
    assert.match(v.css, new RegExp(`${v.blur}:\\s*var\\(--td-glass-blur\\)`));
  });
}

test('the default (solid) stays: the opaque group of glass.css still lists the dialog and the panel', () => {
  const sel = ':is(.td-modal__dialog, .td-drawer__panel, .td-loading__card, .td-tooltip, .td-scroll-top).td-glass-surface';
  const body = ruleBody(glass, sel);
  assert.match(body, /background-color:\s*var\(--_td-glass-fill,\s*var\(--td-glass-solid\)\)/);
  assert.match(body, /(?<!-)backdrop-filter:\s*none/);
});

test('glass.css fallbacks are untouched: every branch still forces the private tokens', () => {
  for (const q of ['@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))',
    '@media (prefers-reduced-transparency: reduce)', '@media (prefers-contrast: more)', '@media (forced-colors: active)']) {
    assert.ok(glass.includes(q), `${q} present`);
  }
  assert.match(glass, /:root\[data-td-glass="off"\] :is\(\.td-glass-surface, \.td-glass-tint\) \{[^}]*--_td-glass-filter: none !important/);
  assert.match(glass, /prefers-reduced-transparency: reduce\) \{\s*\.td-glass-surface,[^}]*--_td-glass-filter: none !important/);
});
