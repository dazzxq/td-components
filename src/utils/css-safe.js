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
 * Return `value` only if it is a safe CSS color (hex, a letter-only named color, or an
 * rgb/rgba/hsl/hsla function with numeric args); otherwise return `fallback`.
 * @param {*} value
 * @param {string} [fallback='']
 * @returns {string}
 */
export function safeColor(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const s = value.trim();
  if (!s) return fallback;
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
