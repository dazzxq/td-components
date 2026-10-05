/**
 * Theme CSS tooling for scripts/build-css.mjs (v0.41.0 plan QĐ3 / QĐ4; v0.42.0 QĐ15 + ADR 0020). Pure functions —
 * unit-tested by src/styles/css-theme.test.js. Selectors come from src/theme/selectors.js (the one table the palette
 * serializer uses too).
 *
 * `expandAutoTheme(css, file)` — `data-td-theme="auto"` follows the OS with CSS only (no JS, no flash): after EVERY
 * rule whose selector is exactly the dark variant `:root[data-td-theme="dark"], [data-td-theme][data-td-theme="dark"]`
 * (top level, inside `@layer`, or nested in `@supports`), emit the same declarations under the OS dark preference:
 *
 *   <dark variant> { … }
 *   / * td: generated auto theme (QĐ4) * /
 *   @media (prefers-color-scheme: dark) {
 *     :root[data-td-theme="auto"], [data-td-theme][data-td-theme="auto"] { … }
 *   }
 *
 * The copy sits right after its source, so it keeps the same layer, `@supports` condition and cascade position. The
 * source must never hold its own auto rules (they would drift): a selector mentioning `data-td-theme="auto"` is an
 * error, except the light-scheme rule `[data-td-theme="light"], [data-td-theme="auto"] { color-scheme: light }`
 * (theme-dark.css); a dark selector of any other shape (`html[data-td-theme=dark]`, the v0.41 `:root[...]`-only form, a
 * descendant) is an error because it would not be copied / would not scope. Idempotent: generated blocks are
 * recognised by their marker and regenerated.
 *
 * `checkThemeScope(entries)` (v0.42.0, QĐ15) — across every source file: colour / shadow tokens are declared in theme
 * scope blocks (`:root, [data-td-theme]`, re-resolved in each `[data-td-theme]` scope) and ONLY there for the base
 * slot; geometry / type / spacing / radius / z-index / motion tokens stay on `:root` (a site's unlayered `:root`
 * override must keep reaching inside scopes). A token is "colour" when one of its declarations holds a colour literal,
 * references a colour token, or is set by a dark rule. Not themed on purpose (stay on `:root`): the grey ramp
 * (primitives a theme maps from), lightbox `--td-lb-*` and `--td-glass-clear-*` (always dark over a photo, QĐ18), and
 * private `--_td-*`.
 */
import { matchBrace } from './css-responsive.mjs';
import {
  BASE_SELECTOR, DARK_SELECTOR, AUTO_DARK_SELECTOR, AUTO_DARK_MEDIA, LIGHT_SCHEME_SELECTOR,
} from '../src/theme/selectors.js';

export const AUTO_MARK = '/* td: generated auto theme (QĐ4) */';
export { BASE_SELECTOR, DARK_SELECTOR, AUTO_DARK_SELECTOR, LIGHT_SCHEME_SELECTOR };

/** Replace comments by spaces of the same length (offsets kept). */
const blank = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
const lineOf = (css, idx) => css.slice(0, idx).split('\n').length;
const norm = (sel) => sel.replace(/\s+/g, ' ').trim();

/** Remove previously generated auto blocks (marker + the @media block after it). */
function stripGenerated(css) {
  let out = css;
  for (let i = out.indexOf(AUTO_MARK); i >= 0; i = out.indexOf(AUTO_MARK)) {
    const lineStart = out.lastIndexOf('\n', i) + 1;
    const open = out.indexOf('{', i);
    const close = matchBrace(out, open);
    const end = out[close + 1] === '\n' ? close + 2 : close + 1;
    out = out.slice(0, lineStart) + out.slice(end);
  }
  return out;
}

/**
 * @param {string} css
 * @param {string} file (error messages)
 * @returns {string}
 */
export function expandAutoTheme(css, file) {
  const src = stripGenerated(css);
  const plain = blank(src);
  const errors = [];
  /** @type {{ end: number, indent: string, body: string }[]} */
  const inserts = [];
  const re = /([^{};]*)\{/g;
  let m;
  while ((m = re.exec(plain))) {
    const selector = norm(m[1]);
    const open = m.index + m[0].length - 1;
    if (selector.startsWith('@')) continue; // at-rule: descend (the regex keeps scanning inside)
    const close = matchBrace(plain, open);
    re.lastIndex = close + 1; // a style rule: skip its body
    if (!/data-td-theme/.test(selector)) continue;
    const at = `${file}:${lineOf(src, m.index + m[1].search(/\S/))}`;
    const body = src.slice(open + 1, close);
    if (/data-td-theme\s*=\s*["']?auto/.test(selector)) {
      const decls = blank(body).split(';').map((d) => d.trim()).filter(Boolean);
      if (selector === LIGHT_SCHEME_SELECTOR && decls.length === 1 && /^color-scheme\s*:\s*light$/.test(decls[0])) continue;
      errors.push(`${at}: hand-written ${selector} — auto rules are generated from the dark ones (scripts/css-theme.mjs)`);
      continue;
    }
    if (/data-td-theme\s*=\s*["']?dark/.test(selector)) {
      if (selector !== DARK_SELECTOR) {
        errors.push(`${at}: dark selector "${selector}" — use exactly ${DARK_SELECTOR} (only that form scopes and gets its auto copy)`);
        continue;
      }
      const lineStart = src.lastIndexOf('\n', m.index + m[1].search(/\S/)) + 1;
      const indent = src.slice(lineStart).match(/^[\t ]*/)[0];
      inserts.push({ end: close + 1, indent, body });
      continue;
    }
    if (selector !== BASE_SELECTOR && selector !== LIGHT_SCHEME_SELECTOR) {
      errors.push(`${at}: theme selector "${selector}" — the kit uses only ${BASE_SELECTOR} / ${DARK_SELECTOR} / ${LIGHT_SCHEME_SELECTOR}`);
    }
  }
  if (errors.length) throw new Error(`Theme (QĐ4 / QĐ15):\n  ${errors.join('\n  ')}`);
  let out = src;
  for (const { end, indent, body } of inserts.reverse()) {
    const inner = body.replace(/\n/g, '\n\t');
    const block = `\n${indent}${AUTO_MARK}\n${indent}${AUTO_DARK_MEDIA} {\n${indent}\t${AUTO_DARK_SELECTOR} {${inner}}\n${indent}}`;
    out = out.slice(0, end) + block + out.slice(end);
  }
  return out;
}

const COLOUR_RE = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|color-mix\(|oklch\(|\bcolor\(|\btransparent\b|currentcolor|\b(?:white|black)\b/i;
/** Colour tokens that stay on :root on purpose (see the module doc). */
export const UNSCOPED_COLOUR_RE = /^--td-(?:gray-\d|lb-|glass-clear-)|^--_td-/;

/** Every style rule with custom-property declarations: `{ file, line, selector, decls: [[name, value]] }`. */
function tokenRules(css, file) {
  const src = stripGenerated(css);
  const plain = blank(src);
  const out = [];
  const re = /([^{};]*)\{/g;
  let m;
  while ((m = re.exec(plain))) {
    const selector = norm(m[1]);
    const open = m.index + m[0].length - 1;
    if (selector.startsWith('@')) continue;
    const close = matchBrace(plain, open);
    re.lastIndex = close + 1;
    const decls = [...plain.slice(open + 1, close).matchAll(/(--[a-z0-9_-]+)\s*:\s*([^;]+);/gi)].map((d) => [d[1], d[2].trim()]);
    if (decls.length) out.push({ file, line: lineOf(src, m.index + m[1].search(/\S/)), selector, decls });
  }
  return out;
}

/**
 * QĐ15 lint over all source files.
 * @param {{ css: string, file: string }[]} entries
 * @returns {string[]} errors
 */
export function checkThemeScope(entries) {
  const rules = entries.flatMap(({ css, file }) => tokenRules(css, file));
  const colour = new Set();
  for (const r of rules) if (r.selector === DARK_SELECTOR) for (const [n] of r.decls) colour.add(n);
  const all = rules.flatMap((r) => r.decls);
  for (let changed = true; changed;) {
    changed = false;
    for (const [n, v] of all) {
      if (colour.has(n)) continue;
      if (COLOUR_RE.test(v) || [...v.matchAll(/var\(\s*(--[a-z0-9_-]+)/gi)].some((x) => colour.has(x[1]))) {
        colour.add(n);
        changed = true;
      }
    }
  }
  const scoped = (n) => colour.has(n) && !UNSCOPED_COLOUR_RE.test(n);
  const errors = [];
  for (const r of rules) {
    const at = `${r.file}:${r.line}`;
    if (r.selector === ':root') {
      const bad = r.decls.filter(([n]) => scoped(n)).map(([n]) => n);
      if (bad.length) errors.push(`${at}: colour token(s) on :root only — declare them on ${BASE_SELECTOR} so theme scopes re-resolve them: ${bad.join(', ')}`);
    } else if (r.selector === BASE_SELECTOR) {
      const bad = r.decls.filter(([n]) => !scoped(n)).map(([n]) => n);
      if (bad.length) errors.push(`${at}: non-colour token(s) in a theme scope block — keep them on :root (a site's :root override must reach inside scopes): ${bad.join(', ')}`);
    }
  }
  return errors;
}
