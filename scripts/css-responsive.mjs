/**
 * Responsive CSS tooling for scripts/build-css.mjs (ADR 0014, v0.34.0). Pure functions — unit-tested by
 * scripts/css-responsive.test.js.
 *
 * 1. `checkBreakpoints(css, file)` — every `@media` / `@container` size condition must use a kit breakpoint:
 *    widths 480 / 720 / 1024 / 1280 (`min-width: N` or `max-width: N − 0.02`; container range form `width < N` /
 *    `width >= N`), height `max-height: 500px`. `@media` must use the classic min-/max- form (Chrome 102–103 has no
 *    media range syntax). A condition may opt out with a `bp-exception: <reason>` comment on the same line or the line
 *    above.
 * 2. `addContainerFallbacks(css, file)` — after every `@container td-<name> (width < N) { … }` block, emit the same
 *    rules as a viewport fallback for engines without container queries:
 *      @supports not (container-type: inline-size) { @media (max-width: N − 0.02px) { … } }
 *    (`width >= N` → `min-width: N`). The support contract is Chrome/Edge 102+; container queries arrived in 105.
 *    Only named `td-*` containers with ONE width condition are allowed (anything else throws — keeps the generator
 *    trivially correct).
 */

export const WIDTHS = [480, 720, 1024, 1280];
export const SHORT_MAX = 500;
const FALLBACK_MARK = '/* td: generated container fallback (ADR 0014) */';

/**
 * Index of the `}` closing the block whose `{` is at `open`, skipping comments and strings.
 * @param {string} css
 * @param {number} open
 */
export function matchBrace(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end < 0) throw new Error('unterminated comment');
      i = end + 1;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== c) j += css[j] === '\\' ? 2 : 1;
      i = j;
    } else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error('unbalanced braces');
}

/** Replace comments by spaces of the same length (keeps offsets, removes `@media` mentions inside comments). */
function blankComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

const lineOf = (css, idx) => css.slice(0, idx).split('\n').length;

/**
 * @param {string} css
 * @param {string} file
 * @returns {string[]} errors (`file:line: message`)
 */
export function checkBreakpoints(css, file) {
  const errors = [];
  const plain = blankComments(css);
  const lines = css.split('\n');
  const re = /@(media|container)\b([^{;]*)\{/g;
  let m;
  while ((m = re.exec(plain))) {
    const kind = m[1];
    const prelude = m[2];
    const line = lineOf(css, m.index);
    const near = `${lines[line - 2] || ''}\n${lines[line - 1] || ''}`;
    if (/bp-exception:/.test(near)) continue;
    const err = (msg) => errors.push(`${file}:${line}: ${msg} — @${kind}${prelude.trimEnd()}`);
    // classic form
    for (const [, mm, axis, num] of prelude.matchAll(/\b(min|max)-(width|height)\s*:\s*([\d.]+)px/g)) {
      const n = Number(num);
      if (axis === 'height') {
        if (!(mm === 'max' && n === SHORT_MAX)) err(`height breakpoint must be max-height: ${SHORT_MAX}px`);
      } else if (mm === 'min' ? !WIDTHS.includes(n) : !WIDTHS.some((w) => Math.abs(w - 0.02 - n) < 1e-9)) {
        err(`width breakpoint ${n}px is not a kit breakpoint (min-width: ${WIDTHS.join('|')} / max-width: N−0.02)`);
      }
    }
    // range form
    for (const [, axis, , num] of prelude.matchAll(/\(\s*(width|height)\s*(<=|>=|<|>)\s*([\d.]+)px\s*\)/g)) {
      if (kind === 'media') {
        err('use min-width / max-width in @media (no range syntax before Chrome 104)');
        continue;
      }
      const n = Number(num);
      if (axis === 'height' || !WIDTHS.includes(n)) err(`container condition ${n}px is not a kit breakpoint`);
    }
    if (/\b(min-|max-)?(width|height)\s*:\s*[\d.]+(em|rem|vw|vh)/.test(prelude)) err('breakpoints are px');
  }
  return errors;
}

/**
 * @param {string} css
 * @param {string} file
 * @returns {string} css with generated fallbacks
 */
export function addContainerFallbacks(css, file) {
  const plain = blankComments(css);
  const re = /@container\b([^{;]*)\{/g;
  const inserts = [];
  let m;
  while ((m = re.exec(plain))) {
    const prelude = m[1].trim();
    const line = lineOf(css, m.index);
    const cm = /^(td-[a-z0-9-]+)\s+\(\s*width\s*(<|>=)\s*(\d+)px\s*\)$/.exec(prelude);
    if (!cm) throw new Error(`${file}:${line}: @container must be "td-<name> (width < N)" or "(width >= N)", got "${prelude}"`);
    const n = Number(cm[3]);
    if (!WIDTHS.includes(n)) throw new Error(`${file}:${line}: container condition ${n}px is not a kit breakpoint`);
    const open = m.index + m[0].length - 1;
    const close = matchBrace(css, open);
    const body = css.slice(open, close + 1);
    const media = cm[2] === '<' ? `(max-width: ${n - 0.02}px)` : `(min-width: ${n}px)`;
    const lineStart = css.lastIndexOf('\n', m.index) + 1;
    const indent = /^[ \t]*/.exec(css.slice(lineStart, m.index))[0];
    inserts.push({
      at: close + 1,
      text: `\n\n${indent}${FALLBACK_MARK}\n${indent}@supports not (container-type: inline-size) {\n${indent}\t@media ${media} ${body.replace(/\n/g, '\n\t')}\n${indent}}`,
    });
  }
  let out = css;
  for (const ins of inserts.reverse()) out = out.slice(0, ins.at) + ins.text + out.slice(ins.at);
  return out;
}

export { FALLBACK_MARK };
