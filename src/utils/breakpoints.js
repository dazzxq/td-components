/**
 * Kit breakpoints — public API `@dazzxq/td-components/breakpoints` (ADR 0014, v0.34.0).
 *
 *   xs < 480 · sm 480–719 · md 720–1023 · lg 1024–1279 · xl ≥ 1280 · short = height ≤ 500
 *
 * Exactly the names of plan v0.34.0 (review #6 — no wider public surface): BREAKPOINTS, SHORT_MAX, mqBelow(name),
 * matchesBelow(name), isCoarsePointer(), isShort(). Implementation + internal helpers: ./breakpoints-internal.js.
 */
export { BREAKPOINTS, SHORT_MAX, mqBelow, matchesBelow, isCoarsePointer, isShort } from './breakpoints-internal.js';
