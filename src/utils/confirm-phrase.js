/**
 * Type-to-confirm phrase rules (v0.44.0, plan v0.44.0-confirm-dirty QĐ 1 / 4) — pure, no DOM. Used by
 * `TdModal.confirm({ typeToConfirm })` for both the phrase and what the user typed:
 *   String → NFC → trim → every run of Unicode whitespace (\s, incl. NBSP) → one space.
 * Case-sensitive and accent-sensitive (`xoa` ≠ `XOA`, `XOA` ≠ `XÓA`); compared with `===`.
 */

/** Longest phrase in code points (QĐ 1); TdModal.confirm() REJECTS a longer one (`truncated`, review r1 SEC-1). */
export const PHRASE_MAX = 100;

/**
 * @param {unknown} value
 * @returns {string} '' for a non-string
 */
export function normalizePhrase(value) {
  if (typeof value !== 'string') return '';
  let s = value;
  try { s = s.normalize('NFC'); } catch { /* engines without normalize: compare as is */ }
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Whether `typed` matches `phrase` (both normalised); an empty phrase never matches.
 * @param {unknown} typed
 * @param {unknown} phrase
 * @returns {boolean}
 */
export function phraseMatches(typed, phrase) {
  const p = normalizePhrase(phrase);
  return p !== '' && normalizePhrase(typed) === p;
}

/**
 * The phrase a dialog uses: normalised, cut to PHRASE_MAX code points (never inside a surrogate pair).
 * @param {unknown} value
 * @returns {{ phrase: string, truncated: boolean } | null} null → no type-to-confirm (empty / not a string)
 */
export function preparePhrase(value) {
  const p = normalizePhrase(value);
  if (!p) return null;
  const points = Array.from(p);
  if (points.length <= PHRASE_MAX) return { phrase: p, truncated: false };
  return { phrase: points.slice(0, PHRASE_MAX).join('').trim(), truncated: true };
}
