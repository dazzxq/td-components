/**
 * Theme CSS tooling for scripts/build-css.mjs (v0.41.0, plan QĐ3 / QĐ4). Pure functions — unit-tested by
 * src/styles/css-theme.test.js.
 *
 * `expandAutoTheme(css, file)` — `data-td-theme="auto"` follows the OS with CSS only (no JS, no flash): after EVERY
 * rule whose selector is exactly `:root[data-td-theme="dark"]` (top level, inside `@layer`, or nested in `@supports`),
 * emit the same declarations under the OS dark preference:
 *
 *   :root[data-td-theme="dark"] { … }
 *   / * td: generated auto theme (QĐ4) * /
 *   @media (prefers-color-scheme: dark) {
 *     :root[data-td-theme="auto"] { … }
 *   }
 *
 * The copy sits right after its source, so it keeps the same layer, `@supports` condition and cascade position. The
 * source must never hold its own auto rules (they would drift): a selector mentioning `data-td-theme="auto"` is an
 * error, except a rule whose only declaration is `color-scheme: light` (the light branch of auto, theme-dark.css), and
 * a dark selector of any other shape (`html[data-td-theme=dark]`, `:root[data-td-theme="dark"] .x`, a selector list)
 * is an error because it would not be copied. Idempotent: generated blocks are recognised by their marker and
 * regenerated.
 */
import { matchBrace } from './css-responsive.mjs';

export const AUTO_MARK = '/* td: generated auto theme (QĐ4) */';
const DARK = ':root[data-td-theme="dark"]';
const AUTO = ':root[data-td-theme="auto"]';

/** Replace comments by spaces of the same length (offsets kept). */
const blank = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
const lineOf = (css, idx) => css.slice(0, idx).split('\n').length;

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
    const selector = m[1].trim();
    const open = m.index + m[0].length - 1;
    if (selector.startsWith('@')) continue; // at-rule: descend (the regex keeps scanning inside)
    const close = matchBrace(plain, open);
    re.lastIndex = close + 1; // a style rule: skip its body
    if (!/data-td-theme/.test(selector)) continue;
    const at = `${file}:${lineOf(src, m.index + m[1].search(/\S/))}`;
    const body = src.slice(open + 1, close);
    if (/data-td-theme\s*=\s*["']?auto/.test(selector)) {
      const decls = blank(body).split(';').map((d) => d.trim()).filter(Boolean);
      if (selector === AUTO && decls.length === 1 && /^color-scheme\s*:\s*light$/.test(decls[0])) continue;
      errors.push(`${at}: hand-written ${selector} — auto rules are generated from the dark ones (scripts/css-theme.mjs)`);
      continue;
    }
    if (/data-td-theme\s*=\s*["']?dark/.test(selector)) {
      if (selector !== DARK) {
        errors.push(`${at}: dark selector "${selector}" — use exactly ${DARK} (only that form gets its auto copy)`);
        continue;
      }
      const lineStart = src.lastIndexOf('\n', m.index + m[1].search(/\S/)) + 1;
      const indent = src.slice(lineStart).match(/^[\t ]*/)[0];
      inserts.push({ end: close + 1, indent, body });
    }
  }
  if (errors.length) throw new Error(`Theme (QĐ4):\n  ${errors.join('\n  ')}`);
  let out = src;
  for (const { end, indent, body } of inserts.reverse()) {
    const inner = body.replace(/\n/g, '\n\t');
    const block = `\n${indent}${AUTO_MARK}\n${indent}@media (prefers-color-scheme: dark) {\n${indent}\t${AUTO} {${inner}}\n${indent}}`;
    out = out.slice(0, end) + block + out.slice(end);
  }
  return out;
}
