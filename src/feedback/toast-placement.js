/**
 * Pure helpers of TdToast placement (v0.36.0, plan v0.36.0-polish QĐ 28–37, ADR 0016). No DOM: td-toast.js reads the
 * computed legacy anchor tokens and the active toasts, these functions only decide.
 */

/** The six logical placements (no physical left / right, no aliases). */
export const PLACEMENTS = Object.freeze(['top-start', 'top-center', 'top-end', 'bottom-start', 'bottom-center', 'bottom-end']);

/** Placement used when nothing (call, configure, customised legacy tokens) decides. */
export const DEFAULT_PLACEMENT = 'top-end';

/** Stack key of toasts positioned by the pre-0.36 anchor tokens (CSS + append order exactly as v0.35). */
export const LEGACY = 'legacy';

/** The six legacy anchor tokens and the values td.css ships (computed, trimmed). */
export const LEGACY_TOKEN_DEFAULTS = Object.freeze({
  '--td-toast-top': '5rem',
  '--td-toast-bottom': 'auto',
  '--td-toast-inline-start': 'auto',
  '--td-toast-inline-end': '1rem',
  '--td-toast-shift': '0%',
  '--td-toast-align': 'flex-end',
});

/**
 * @param {unknown} v
 * @returns {boolean} whether `v` is one of the six placements
 */
export function isPlacement(v) {
  return typeof v === 'string' && PLACEMENTS.includes(v);
}

/**
 * Whether a site changed any of the six legacy anchor tokens. An empty / missing value counts as the default (td.css
 * not loaded yet → nothing customised); values compare trimmed, case-insensitive, whitespace collapsed.
 * @param {Record<string, string>|null|undefined} tokens computed values keyed by token name
 * @returns {boolean}
 */
export function legacyCustomized(tokens) {
  if (!tokens) return false;
  const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return Object.keys(LEGACY_TOKEN_DEFAULTS).some((k) => {
    const v = norm(tokens[k]);
    return v !== '' && v !== norm(LEGACY_TOKEN_DEFAULTS[k]);
  });
}

/**
 * Precedence: the call's placement > TdToast.configure() > customised legacy tokens (→ LEGACY) > DEFAULT_PLACEMENT.
 * An invalid value at a level is reported through `onInvalid(value, level)` and the next level decides.
 * `null` / `undefined` at a level = not set (no report).
 * @param {unknown} call `options.placement` of the show() call
 * @param {unknown} configured the configure() value
 * @param {Record<string, string>|null|undefined} legacyTokens computed anchor tokens (see legacyCustomized)
 * @param {(value: unknown, level: 'call'|'configure') => void} [onInvalid]
 * @returns {string} one of PLACEMENTS or LEGACY
 */
export function resolvePlacement(call, configured, legacyTokens, onInvalid) {
  for (const [v, level] of [[call, 'call'], [configured, 'configure']]) {
    if (v == null) continue;
    if (isPlacement(v)) return /** @type {string} */ (v);
    if (onInvalid) onInvalid(v, /** @type {'call'|'configure'} */ (level));
  }
  return legacyCustomized(legacyTokens) ? LEGACY : DEFAULT_PLACEMENT;
}

/**
 * Sequence numbers to mark `data-td-toast-older` (short viewports show only the `keep` newest toasts, globally).
 * @param {number[]} seqs sequence numbers of the active toasts (any order)
 * @param {number} [keep=2]
 * @returns {Set<number>} every seq except the `keep` largest
 */
export function olderSet(seqs, keep = 2) {
  const sorted = [...seqs].sort((a, b) => b - a);
  return new Set(sorted.slice(Math.max(0, keep)));
}

/**
 * Normalise the third argument of TdToast.show / success / error / warning / info: `number | numeric string |
 * { duration?, placement? }`. A missing duration takes the function's default.
 * @param {unknown} arg
 * @param {number} def default duration of the calling function
 * @returns {{ duration: unknown, placement: unknown }}
 */
export function toastOptions(arg, def) {
  if (arg && typeof arg === 'object') {
    const o = /** @type {{duration?: unknown, placement?: unknown}} */ (arg);
    return { duration: o.duration == null ? def : o.duration, placement: o.placement ?? null };
  }
  return { duration: arg === undefined ? def : arg, placement: null };
}

/**
 * @param {string} placement one of PLACEMENTS
 * @returns {'top'|'bottom'} the lane (block edge) of a placement
 */
export function edgeOf(placement) {
  return placement.startsWith('bottom') ? 'bottom' : 'top';
}
