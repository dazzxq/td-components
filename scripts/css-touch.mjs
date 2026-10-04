/**
 * Touch CSS lints for scripts/build-css.mjs (ADR 0019, v0.36.2). Pure functions — unit-tested by
 * src/styles/css-touch.test.js.
 *
 * 1. `checkHoverGate(css, file)` — every selector containing `:hover` must sit inside
 *    `@media (hover: hover) and (pointer: fine) { … }` (that exact condition; may be nested in other at-rules such as
 *    `@media (forced-colors: active)`). `:hover` inside `:is()` / `:where()` is an error even in the gate (the focus
 *    half of `:is(:hover, :focus-visible)` must stay outside it). Opt-out: a `hover-exempt: <reason>` comment on the
 *    selector line or the line above (non-empty reason).
 * 2. `checkPressed(entries)` — the interactive controls are (a) the base of every `:hover` selector (the selector up to
 *    the compound holding `:hover`, with the state parts of that compound — pseudo-classes, attribute selectors,
 *    pseudo-elements — dropped) ∪ (b) every selector whose rule sets `cursor: pointer` (same normalisation of its last
 *    compound). Each base needs at least one `<base>:active` (or `[data-td-pressed]`) rule OUTSIDE the hover gate — touch
 *    screens never match the gate. Opt-out: `active-exempt: <reason>` on the selector line or the line above. An
 *    `:active` rule inside the hover gate is an error. Runs over every file at once (a base may get its pressed rule in
 *    another file).
 * 3. `pressedBases(entries)` — the normalised bases that have a pressed rule (src/utils/press.js keeps the same list for
 *    `closest()`; src/styles/css-touch.test.js compares them).
 */
import { matchBrace } from './css-responsive.mjs';

export const HOVER_GATE = '(hover: hover) and (pointer: fine)';

/** Replace comments by spaces of the same length (keeps offsets and line numbers). */
function blankComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

const lineOf = (css, idx) => css.slice(0, idx).split('\n').length;

/**
 * Flat list of style rules with their ancestor at-rule preludes.
 * @param {string} css
 * @returns {{ selector: string, body: string, ancestors: string[], line: number, selStart: number, end: number }[]}
 */
export function parseRules(css) {
  const plain = blankComments(css);
  const out = [];
  const walk = (start, end, ancestors) => {
    let i = start;
    let segStart = start;
    while (i < end) {
      const c = plain[i];
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < end && plain[j] !== c) j += plain[j] === '\\' ? 2 : 1;
        i = j + 1;
        continue;
      }
      if (c === ';' || c === '}') { segStart = i + 1; i++; continue; }
      if (c === '{') {
        const close = matchBrace(plain, i);
        const prelude = plain.slice(segStart, i);
        const trimmed = prelude.trim();
        const lead = segStart + (prelude.length - prelude.trimStart().length);
        if (trimmed.startsWith('@')) {
          if (/^@(media|supports|layer|container|scope|document)\b/.test(trimmed)) walk(i + 1, close, [...ancestors, trimmed]);
          // @keyframes / @font-face / @property …: no selectors to lint
        } else {
          out.push({ selector: trimmed, body: plain.slice(i + 1, close), ancestors, line: lineOf(css, lead), selStart: lead, end: close });
        }
        i = close + 1;
        segStart = i;
        continue;
      }
      i++;
    }
  };
  walk(0, plain.length, []);
  return out;
}

/** Split on top-level commas (parentheses / brackets / strings respected). Each piece keeps its offset. */
export function splitList(sel) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === '"' || c === "'") { let j = i + 1; while (j < sel.length && sel[j] !== c) j += sel[j] === '\\' ? 2 : 1; i = j; }
    else if (c === ',' && depth === 0) { parts.push({ text: sel.slice(from, i), offset: from }); from = i + 1; }
  }
  parts.push({ text: sel.slice(from), offset: from });
  return parts.map((p) => {
    const lead = p.text.length - p.text.trimStart().length;
    return { text: p.text.trim(), offset: p.offset + lead };
  }).filter((p) => p.text);
}

/** Compounds of a complex selector, combinators kept as separate tokens (`>`, `+`, `~`, ` `). */
export function compounds(sel) {
  const out = [];
  let depth = 0;
  let cur = '';
  const flush = () => { if (cur) out.push(cur); cur = ''; };
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (depth === 0 && /[\s>+~]/.test(c)) {
      flush();
      let j = i;
      let comb = ' ';
      while (j < sel.length && /[\s>+~]/.test(sel[j])) { if (sel[j] !== ' ' && !/\s/.test(sel[j])) comb = sel[j]; j++; }
      if (out.length) out.push(comb);
      i = j - 1;
      continue;
    }
    cur += c;
  }
  flush();
  return out;
}

/** Keep only the type / class / id parts of one compound (drops pseudo-classes, attribute selectors, pseudo-elements). */
export function stripState(compound) {
  let out = '';
  let i = 0;
  while (i < compound.length) {
    const c = compound[i];
    if (c === '[') { let d = 0; for (; i < compound.length; i++) { if (compound[i] === '[') d++; if (compound[i] === ']' && --d === 0) break; } i++; continue; }
    if (c === ':') {
      i++;
      if (compound[i] === ':') i++;
      while (i < compound.length && /[\w-]/.test(compound[i])) i++;
      if (compound[i] === '(') { let d = 0; for (; i < compound.length; i++) { if (compound[i] === '(') d++; if (compound[i] === ')' && --d === 0) break; } i++; }
      continue;
    }
    const m = compound.slice(i).match(/^([.#]?[\w-]+|\*)/);
    if (m) { out += m[1]; i += m[1].length; continue; }
    i++;
  }
  return out;
}

/** Base selector: compounds up to the first one matching `test`, that compound state-stripped. */
export function baseOf(sel, test) {
  const parts = compounds(sel);
  const out = [];
  for (const p of parts) {
    if (p === ' ' || p === '>' || p === '+' || p === '~') { out.push(p); continue; }
    if (test(p)) {
      out.push(stripState(p));
      return out.join(' ').replace(/\s+/g, ' ').trim();
    }
    out.push(p);
  }
  return null;
}

const isGate = (prelude) => {
  const p = prelude.replace(/\s+/g, ' ').trim();
  if (!p.startsWith('@media ')) return false;
  const cond = p.slice(7).trim();
  return !cond.includes(',') && cond.startsWith(HOVER_GATE);
};
const inGate = (rule) => rule.ancestors.some(isGate);

function exemptAt(css, line, key) {
  const lines = css.split('\n');
  const near = `${lines[line - 2] || ''}\n${lines[line - 1] || ''}`;
  const m = near.match(new RegExp(`${key}:([^*]*)\\*/`));
  if (!m) return null;
  return m[1].trim() ? 'ok' : 'empty';
}

const HOVER_RE = /:hover(?![\w-])/;
const PRESS_RE = /:active(?![\w-])|\[data-td-pressed\]/;

/**
 * @param {string} css
 * @param {string} file
 * @returns {string[]} errors (`file:line: message`)
 */
export function checkHoverGate(css, file) {
  const errors = [];
  for (const rule of parseRules(css)) {
    if (!HOVER_RE.test(rule.selector)) continue;
    for (const piece of splitList(rule.selector)) {
      if (!HOVER_RE.test(piece.text)) continue;
      const line = lineOf(css, rule.selStart + piece.offset);
      const ex = exemptAt(css, line, 'hover-exempt');
      if (ex === 'empty') { errors.push(`${file}:${line}: hover-exempt needs a reason — ${piece.text}`); continue; }
      if (ex === 'ok') continue;
      if (/:(is|where)\([^)]*:hover/.test(piece.text)) {
        errors.push(`${file}:${line}: split :hover out of :is()/:where() (focus / other states stay outside the hover gate) — ${piece.text}`);
        continue;
      }
      if (!inGate(rule)) errors.push(`${file}:${line}: :hover outside @media ${HOVER_GATE} — ${piece.text}`);
    }
  }
  return errors;
}

/** @param {string | {css: string, file: string}[]} entries */
const norm = (entries, file = 'inline.css') => (typeof entries === 'string' ? [{ css: entries, file }] : entries);

/**
 * Interactive bases (with where they came from) and the bases that have a pressed rule.
 * @param {{css: string, file: string}[]} entries
 */
function collect(entries) {
  /** @type {Map<string, {file: string, line: number, exempt: 'ok'|'empty'|null}>} */
  const bases = new Map();
  const pressed = new Set();
  const errors = [];
  for (const { css, file } of entries) {
    for (const rule of parseRules(css)) {
      const pointer = /(^|[;\s])cursor\s*:\s*pointer\b/.test(rule.body);
      for (const piece of splitList(rule.selector)) {
        const line = lineOf(css, rule.selStart + piece.offset);
        if (PRESS_RE.test(piece.text)) {
          if (inGate(rule)) errors.push(`${file}:${line}: pressed state inside the hover gate (touch screens never see it) — ${piece.text}`);
          else {
            const b = baseOf(piece.text, (p) => PRESS_RE.test(p));
            if (b) pressed.add(b);
          }
          continue;
        }
        let b = null;
        if (HOVER_RE.test(piece.text)) b = baseOf(piece.text, (p) => HOVER_RE.test(p));
        else if (pointer) { const cs = compounds(piece.text); b = baseOf(piece.text, (p) => p === cs[cs.length - 1]); }
        if (!b) continue;
        const ex = exemptAt(css, line, 'active-exempt');
        const prev = bases.get(b);
        if (!prev || (ex && !prev.exempt)) bases.set(b, { file, line, exempt: ex });
      }
    }
  }
  return { bases, pressed, errors };
}

/**
 * @param {string | {css: string, file: string}[]} entries
 * @param {string} [file]
 * @returns {string[]} errors
 */
export function checkPressed(entries, file) {
  const { bases, pressed, errors } = collect(norm(entries, file));
  for (const [b, info] of bases) {
    if (info.exempt === 'empty') { errors.push(`${info.file}:${info.line}: active-exempt needs a reason — ${b}`); continue; }
    if (info.exempt === 'ok' || pressed.has(b)) continue;
    errors.push(`${info.file}:${info.line}: interactive control has no :active / [data-td-pressed] rule outside the hover gate — ${b}`);
  }
  return errors;
}

/**
 * Normalised bases with a pressed rule (what src/utils/press.js must match with `closest()`).
 * @param {string | {css: string, file: string}[]} entries
 */
export function pressedBases(entries) {
  return [...collect(norm(entries)).pressed].sort();
}

/** Every `touch-action` declaration: `[{ selector, value, file, line }]` (src/styles/td-touch-action.test.js). */
export function touchActions(entries) {
  const out = [];
  for (const { css, file } of norm(entries)) {
    for (const rule of parseRules(css)) {
      for (const m of rule.body.matchAll(/(?:^|[;\s{])touch-action\s*:\s*([^;}]+)/g)) {
        out.push({ selector: rule.selector.replace(/\s+/g, ' '), value: m[1].trim(), file, line: rule.line, ancestors: rule.ancestors });
      }
    }
  }
  return out;
}

