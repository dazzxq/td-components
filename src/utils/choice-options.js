/**
 * v0.49.0 (plan docs/internal/plans/v0.49.0-choice-stepper.md QĐ 8, 9, 12) — the ONE gate for the options of
 * `<td-choice-group>`: the `options` property AND the data read back from server markup on hydrate go through
 * `normalizeOptions()`, so a colour reaching the SVG `fill` sink and a URL reaching `<img src>` are always re-checked.
 * Pure (no DOM): the colour / URL gates are passed in. Internal module (no package subpath).
 *
 * @module utils/choice-options
 */

/**
 * @typedef {Object} ChoiceOption
 * @property {string} value - unique in the group (a finite number is turned into its String())
 * @property {string} label - accessible name (text)
 * @property {string} hint - secondary line ('' = none)
 * @property {string} swatch - a safe colour ('' = none)
 * @property {string} image - a safe, normalised image URL ('' = none); wins over `swatch` when set
 * @property {boolean} disabled - not selectable (a combination that does not exist)
 * @property {boolean} unavailable - selectable, struck through + a note (out of stock)
 * @property {string} unavailableLabel - the note ('' = the component's default message)
 * @property {number} index - position in the normalised list
 */

const describe = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/**
 * v0.49.0 review S1 — the bounded-work limits, shared with php `Td::CHOICE_LIMITS` (test/php/td-ssr-choice.test.js keeps
 * them equal): `candidates` entries inspected at most (the rest is never read), `options` accepted at most, and
 * code-point caps per field — text fields (label / hint / note) are CUT to their cap, a longer value / swatch / image is
 * refused. Checked before any trim / regex, so a huge input costs at most a few times the cap.
 */
export const CHOICE_LIMITS = Object.freeze({ candidates: 400, options: 100, value: 200, label: 200, hint: 200, note: 100, swatch: 128, image: 8192 });

/** First `n` code points of `s` without walking the rest. */
function cpSlice(s, n) {
  if (s.length <= n) return s;
  let out = '';
  let k = 0;
  for (const ch of s) {
    if (k === n) break;
    out += ch;
    k += 1;
  }
  return out;
}

/** Is `s` longer than `n` code points? (a UTF-16 length over 2n answers without counting) */
function cpOver(s, n) {
  if (s.length <= n) return false;
  if (s.length > 2 * n) return true;
  return cpSlice(s, n + 1).length !== cpSlice(s, n).length;
}

// lone surrogate, C0 / DEL / C1 control (\r \n \t included)
const BAD_VALUE = /[\u0000-\u001f\u007f-\u009f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/**
 * v0.49.0 review S2 — the canonical form of an option value (php `td__choice_value`, shared cases
 * test/ssr/choice-value.cases.json): a finite number → `String()`; a string must be 1–200 code points, well-formed
 * (no lone surrogate) and free of C0 / DEL / C1 controls (values are identifiers: `\r` `\n` `\t` refused). Never trimmed.
 * @param {unknown} v
 * @returns {string|null} null = refused
 */
export function canonicalValue(v) {
  let s = null;
  if (typeof v === 'number') s = Number.isFinite(v) ? String(v) : null;
  else if (typeof v === 'string') s = v;
  if (s == null || s === '' || cpOver(s, CHOICE_LIMITS.value) || BAD_VALUE.test(s)) return null;
  return s;
}

/**
 * @param {unknown} raw the caller's list
 * @param {{ safeColor: (v: unknown, fallback?: string) => string, safeMediaUrl: (v: unknown) => string }} gates
 * @returns {{ options: ReadonlyArray<Readonly<ChoiceOption>>, warnings: string[], dropped: number, ignored: number }}
 *   review S1: at most ONE warning, counts only (never a value): `dropped` options (invalid, duplicate, over the limits,
 *   past the inspected window) and `ignored` fields (wrong type, refused colour / URL, text cut to its cap)
 */
export function normalizeOptions(raw, gates) {
  if (!gates || typeof gates.safeColor !== 'function' || typeof gates.safeMediaUrl !== 'function') {
    throw new TypeError('normalizeOptions: the safeColor / safeMediaUrl gates are required');
  }
  const L = CHOICE_LIMITS;
  /** @type {Readonly<ChoiceOption>[]} */
  const options = [];
  let dropped = 0;
  let ignored = 0;
  const done = () => {
    const warnings = dropped || ignored
      ? [`${dropped} option(s) dropped, ${ignored} field(s) ignored or shortened (invalid, duplicate or over the limits: ${L.candidates} inspected, ${L.options} options).`]
      : [];
    return { options: Object.freeze(options), warnings, dropped, ignored };
  };
  if (raw == null) return done();
  if (!Array.isArray(raw)) {
    return { options: Object.freeze(options), warnings: [`options must be an array (got ${describe(raw)}) — no option is shown.`], dropped: 0, ignored: 0 };
  }
  const seen = new Set();
  const n = Math.min(raw.length, L.candidates);
  dropped += raw.length - n; // past the inspected window: never read
  for (let i = 0; i < n; i++) {
    if (options.length === L.options) { dropped += n - i; break; }
    const o = raw[i];
    if (!o || typeof o !== 'object' || Array.isArray(o)) { dropped += 1; continue; }
    const value = canonicalValue(o.value);
    const label = o.label;
    if (value == null || typeof label !== 'string' || seen.has(value)) { dropped += 1; continue; }
    const shortLabel = cpSlice(label, L.label);
    if (!shortLabel.trim()) { dropped += 1; continue; }
    if (shortLabel !== label) ignored += 1;
    seen.add(value);
    const text = (key, cap) => {
      const v = o[key];
      if (v == null || v === '') return '';
      if (typeof v !== 'string') { ignored += 1; return ''; }
      const cut = cpSlice(v, cap);
      if (cut !== v) ignored += 1;
      return cut;
    };
    const gated = (v, cap, gate) => {
      if (v == null || v === '') return '';
      const out = typeof v === 'string' && !cpOver(v, cap) ? gate(v) : '';
      if (!out) ignored += 1;
      return out;
    };
    options.push(Object.freeze({
      value,
      label: shortLabel,
      hint: text('hint', L.hint),
      swatch: gated(o.swatch, L.swatch, (v) => gates.safeColor(v, '')),
      image: gated(o.image, L.image, (v) => gates.safeMediaUrl(v)),
      disabled: o.disabled === true,
      unavailable: o.unavailable === true,
      unavailableLabel: text('unavailableLabel', L.note),
      index: options.length,
    }));
  }
  return done();
}

/**
 * Same `value` list in the same order? (→ the component patches the rendered options in place.)
 * @param {ReadonlyArray<{ value: string }>} a
 * @param {ReadonlyArray<{ value: string }>} b
 */
export function sameValueList(a, b) {
  return a.length === b.length && a.every((o, i) => o.value === b[i].value);
}
