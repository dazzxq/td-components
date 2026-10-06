/**
 * CSS-context sanitizers. Values that flow into a `<style>` rule or a `style="…"`
 * attribute are in a CSS context, NOT an HTML-text context — `escapeHtml` does NOT
 * make them safe there. An attacker-controlled `color="red;} html{display:none"` or
 * `color='" onmouseover=alert(1) x="'` must never break out of the CSS rule / the
 * style attribute. These helpers WHITELIST safe shapes and fall back otherwise.
 */

// CSS named colors are letter-only identifiers; an unknown ident is simply inert in CSS
// (and contains no `;{}()<>"'`, so it cannot break out of a rule or attribute).
const NAMED = /^[a-z]+$/i;
// #rgb / #rgba / #rrggbb / #rrggbbaa
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
// rgb()/rgba()/hsl()/hsla() — only numbers, separators, %, and the `deg` unit inside.
const FUNC = /^(rgb|rgba|hsl|hsla)\(\s*[0-9.,%/\sdeg]+\)$/i;

/**
 * Return `value` only if it is a safe CSS color (hex, a letter-only named color ≤ 24 letters, or an
 * rgb/rgba/hsl/hsla function with numeric args; at most 64 characters after trimming); otherwise return `fallback`.
 * PHP port: Td::safeColor() (v0.49.0) — same cases.
 * @param {*} value
 * @param {string} [fallback='']
 * @returns {string}
 */
export function safeColor(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const s = value.trim();
  if (!s || s.length > 64) return fallback; // v0.49.0: a colour is short (shared cases test/ssr/safe-color.cases.json)
  if (HEX.test(s)) return s;
  if (FUNC.test(s)) return s;
  if (NAMED.test(s) && s.length <= 24) return s;
  return fallback;
}

/**
 * Return a NORMALIZED 6-digit hex (`#rrggbb`) for a valid hex input, else `fallback`.
 * Use where the consumer string-appends a 2-digit alpha suffix (e.g. `${c}f2`) and so
 * requires a predictable 6-digit hex — named/`rgb()` colors would produce invalid CSS there.
 * @param {*} value
 * @param {string} [fallback='#000000']
 * @returns {string}
 */
export function safeHexColor(value, fallback = '#000000') {
  if (typeof value !== 'string') return fallback;
  const s = value.trim();
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  if (m3) return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}`.toLowerCase();
  const m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(s); // 6 or 8 (alpha dropped)
  if (m) return `#${m[1]}`.toLowerCase();
  return fallback;
}

// A number with an optional CSS length/percentage unit.
const DIMENSION = /^-?\d+(\.\d+)?(px|em|rem|%|vh|vw|ch|fr)?$/;

/**
 * Return `value` only if it is a safe CSS dimension (a number with an optional unit);
 * otherwise return `fallback`. Use for developer-supplied widths/heights.
 * @param {*} value
 * @param {string} [fallback='']
 * @returns {string}
 */
export function safeCssDimension(value, fallback = '') {
  if (value == null) return fallback;
  const s = String(value).trim();
  return DIMENSION.test(s) ? s : fallback;
}

/**
 * Coerce to a finite number and clamp into [min, max]; `fallback` when not numeric.
 * @param {*} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 * @returns {number}
 */
export function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Apply a map of SCALAR styles to an element via CSSOM (`el.style.setProperty`), which
 * is the CSP-allowed replacement for a declarative `style="…"` attribute. Use this in a
 * component's `_applyStyles()` to set per-element state-dependent scalars (color, size,
 * width %, etc.) after each render.
 *
 * Entries whose value is `null` or `undefined` are SKIPPED (so a component can pass a
 * computed map and omit a property by leaving it nullish, rather than writing an empty
 * string). Other values are stringified. Setting via `setProperty` parses each value as a
 * single CSS value, so a stray `;`/`}` cannot inject a second declaration — but values
 * derived from PUBLIC attributes should still be passed through `safeColor` /
 * `safeCssDimension` first. No-op (and never throws) if `el` is null/undefined.
 *
 * @param {Element|null|undefined} el - Target element (e.g. a node from `this.querySelector`).
 * @param {Record<string, string|number|null|undefined>} styles - Map of CSS property → value.
 *   Keys may be standard property names (`'width'`) or custom properties (`'--c'`).
 * @returns {void}
 */
export function applyStyles(el, styles) {
  if (!el || !styles) return;
  for (const prop in styles) {
    const value = styles[prop];
    if (value == null) continue;
    el.style.setProperty(prop, String(value));
  }
}
