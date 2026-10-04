/**
 * Kit breakpoints — ADR 0014 (v0.34.0). ONE set of numbers for viewport `@media` and component `@container` queries.
 *
 *   xs < 480 · sm 480–719 · md 720–1023 · lg 1024–1279 · xl ≥ 1280 · short = height ≤ 500
 *
 * CSS custom properties cannot be used inside query conditions, so these are constants. The CSS side is kept in sync
 * by `scripts/build-css.mjs --check` (only these numbers may appear in a query); JS must not hard-code widths either
 * (`src/utils/breakpoints.test.js` scans `src/` for `innerWidth` / width `matchMedia` outside this file).
 *
 * `@media` conditions use the classic `max-width` / `min-width` form (Chrome 102–103 has no media range syntax) with
 * an upper edge of `N − 0.02px`.
 */

/** Lower edge (px) of each named size. */
export const BREAKPOINTS = Object.freeze({ sm: 480, md: 720, lg: 1024, xl: 1280 });

/** Max viewport height (px) of the `short` band (phones in landscape). */
export const SHORT_MAX = 500;

/** `(hover: none) and (pointer: coarse)` — a touch-first device (phone, tablet without a pointer). */
export const MQ_COARSE = '(hover: none) and (pointer: coarse)';

/** `(max-height: 500px)` — the `short` band. */
export const MQ_SHORT = `(max-height: ${SHORT_MAX}px)`;

function edge(name) {
  const v = BREAKPOINTS[name];
  if (typeof v !== 'number') throw new RangeError(`breakpoints: unknown size "${name}" (sm | md | lg | xl)`);
  return v;
}

/**
 * Media query matching viewports narrower than the named size.
 * @param {'sm'|'md'|'lg'|'xl'} name
 * @returns {string} e.g. `(max-width: 719.98px)`
 */
export function mqBelow(name) {
  return `(max-width: ${edge(name) - 0.02}px)`;
}

/**
 * Media query matching viewports at least as wide as the named size.
 * @param {'sm'|'md'|'lg'|'xl'} name
 * @returns {string} e.g. `(min-width: 720px)`
 */
export function mqAtLeast(name) {
  return `(min-width: ${edge(name)}px)`;
}

/**
 * `matchMedia(query).matches`, false where matchMedia is unavailable (SSR, old shims).
 * @param {string} query
 */
export function matches(query) {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/** @param {'sm'|'md'|'lg'|'xl'} name */
export const matchesBelow = (name) => matches(mqBelow(name));

/** True on touch-first devices — e.g. do not auto-focus a search box (the on-screen keyboard would cover the popup). */
export const isCoarsePointer = () => matches(MQ_COARSE);

/** True in the `short` band (landscape phones). */
export const isShort = () => matches(MQ_SHORT);
