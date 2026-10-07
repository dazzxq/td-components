/**
 * Separators of <td-number-input locale> (v0.55.0, plan docs/internal/plans/v0.55.0-affix-number.md QĐ 11, ADR 0028) —
 * pure, no DOM; node tests: src/utils/number-locale.test.js (cases shared with php/td.php: test/ssr/number-locale.cases.json).
 *
 * `locale` only derives the GROUP and DECIMAL separators. The value is still formatted by number-format.js (BigInt,
 * never rounded, never padded): `Intl.NumberFormat` rounds (VND → 0 decimals), pads (USD → 2), skips 4-digit grouping
 * (es), groups by lakh (en-IN) and changes the digits (ar) — none of which a typed value may suffer.
 *
 * 1. The fixed table NUMBER_LOCALES (lower-case BCP 47 tag → [group, decimal]; the SAME table as Td::NUMBER_LOCALES in
 *    php/td.php, so server-rendered markup never depends on the browser's ICU). Looked up on the WHOLE tag, case-insensitive:
 *    a regional tag is listed explicitly or it is not in the table (de-AT is not de — Codex plan r1 #1).
 * 2. JS only, a tag outside the table: derived from `Intl.NumberFormat(tag).formatToParts(1234567.5)` (NBSP / NNBSP → ' '),
 *    accepted when the group is one of GROUPS, the decimal ',' or '.', they differ, and Intl did not fall back to another
 *    language; else null (the caller warns once and keeps the default).
 */

/** Group separators the number rules accept ('' = no grouping). */
export const GROUPS = ['.', ',', ' ', ''];

/** lower-case tag → [group, decimal] — measured with Intl (Node 25 / ICU 78, Chromium, Firefox, WebKit agree). */
export const NUMBER_LOCALES = Object.freeze({
  vi: ['.', ','], 'vi-vn': ['.', ','],
  en: [',', '.'], 'en-us': [',', '.'], 'en-gb': [',', '.'],
  de: ['.', ','], 'de-de': ['.', ','], 'de-at': [' ', ','],
  fr: [' ', ','], 'fr-fr': [' ', ','],
  id: ['.', ','], 'id-id': ['.', ','],
  ja: [',', '.'], 'ja-jp': [',', '.'],
  ko: [',', '.'], 'ko-kr': [',', '.'],
  zh: [',', '.'], 'zh-cn': [',', '.'], 'zh-tw': [',', '.'],
  th: [',', '.'], 'th-th': [',', '.'],
  pt: ['.', ','], 'pt-br': ['.', ','],
  es: ['.', ','], 'es-es': ['.', ','],
  it: ['.', ','], 'it-it': ['.', ','],
  nl: ['.', ','], 'nl-nl': ['.', ','],
  ru: [' ', ','], 'ru-ru': [' ', ','],
  pl: [' ', ','], 'pl-pl': [' ', ','],
});

/** @param {*} locale @returns {string} the trimmed tag ('' when not a usable string) */
const tagOf = (locale) => (typeof locale === 'string' ? locale.trim() : '');

/**
 * The table pair of `locale` (whole tag, case-insensitive), or null.
 * @param {*} locale
 * @returns {[string, string]|null}
 */
export function tableSeparators(locale) {
  const tag = tagOf(locale).toLowerCase();
  const pair = tag && Object.prototype.hasOwnProperty.call(NUMBER_LOCALES, tag) ? NUMBER_LOCALES[tag] : null;
  return pair ? [pair[0], pair[1]] : null;
}

/**
 * The table pair, else (a tag outside the table) the validated Intl pair, else null.
 * @param {*} locale
 * @returns {[string, string]|null}
 */
export function localeSeparators(locale) {
  const fixed = tableSeparators(locale);
  if (fixed) return fixed;
  const tag = tagOf(locale);
  if (!tag || typeof Intl === 'undefined' || typeof Intl.NumberFormat !== 'function') return null;
  let nf;
  try {
    nf = new Intl.NumberFormat(tag);
  } catch {
    return null; // RangeError: not a well-formed tag
  }
  // an unknown language silently falls back to the runtime default (e.g. `xx` → en-US): refuse it
  const lang = (t) => String(t).split('-')[0].toLowerCase();
  if (lang(nf.resolvedOptions().locale) !== lang(tag)) return null;
  const parts = nf.formatToParts(1234567.5);
  const group = (parts.find((p) => p.type === 'group')?.value ?? '').replace(/[  ]/g, ' ');
  const decimal = parts.find((p) => p.type === 'decimal')?.value;
  return GROUPS.includes(group) && (decimal === ',' || decimal === '.') && group !== decimal ? [group, decimal] : null;
}

/** @param {string} g @returns {string} the decimal that goes with group `g` when nothing else says (',' unless g is ',') */
const decimalFor = (g) => (g === ',' ? '.' : ',');

/**
 * Resolve the separators (pairwise — Codex plan r1 #2). `pair` = the locale pair (null = no locale: the v0.54 rules,
 * unchanged). `group` / `decimal` = the explicit host values (null = absent). `invalid` lists what the caller warns about:
 * 'group' / 'decimal' (an explicit value that is not allowed — ignored) and 'clash' (both explicit and equal).
 *   no locale: group = explicit ?? '.'; decimal = explicit when allowed and ≠ group, else decimalFor(group)
 *   locale:    an explicit side wins; the inferred other side moves off it when they would be equal
 *              (group ',' → decimal '.'; group '.' / ' ' / '' → ','; decimal '.' → group ','; decimal ',' → group '.');
 *              both explicit and equal → decimalFor(group) + 'clash' (as without locale)
 * @param {[string, string]|null} pair
 * @param {string|null|undefined} group
 * @param {string|null|undefined} decimal
 * @returns {{ group: string, decimal: string, invalid: string[] }}
 */
export function resolveSeparators(pair, group, decimal) {
  const invalid = [];
  const gx = group == null ? null : (GROUPS.includes(group) ? group : (invalid.push('group'), null));
  const dx = decimal == null ? null : (decimal === ',' || decimal === '.' ? decimal : (invalid.push('decimal'), null));
  if (!pair) {
    const g = gx ?? '.';
    if (dx != null && dx === g) invalid.push('clash');
    return { group: g, decimal: dx != null && dx !== g ? dx : decimalFor(g), invalid };
  }
  const [G, D] = pair;
  if (gx != null && dx != null) {
    if (dx === gx) invalid.push('clash');
    return { group: gx, decimal: dx !== gx ? dx : decimalFor(gx), invalid };
  }
  if (gx != null) return { group: gx, decimal: D !== gx ? D : decimalFor(gx), invalid };
  if (dx != null) return { group: G !== dx ? G : (dx === '.' ? ',' : '.'), decimal: dx, invalid };
  return { group: G, decimal: D, invalid };
}
