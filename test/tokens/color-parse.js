/**
 * Colour helpers shared by the token / contrast / page gates (v0.41.0, plan M0). Pure: runs in Node (golden + page
 * gates, unit test) and in the browser (contrast-page.js imports it from `/test/tokens/color-parse.js`).
 *
 * Computed colours come back from engines in several serialisations: `rgb(r, g, b)`, `rgba(r, g, b, a)`, the
 * space form `rgb(r g b / a)` (alpha as a number or a percentage), and — for colours produced by `color-mix(in srgb …)`
 * or written as `color(srgb …)` — `color(srgb r g b / a)` with channels on a 0..1 scale (`none` = 0). The pre-0.41
 * helpers read every number as 0..255, so a `color(srgb …)` badge read as near-black (the two false results of the
 * theming audit).
 */

const NUM = '(?:[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?%?|none)';
const RGB_RE = new RegExp(`^rgba?\\(\\s*(${NUM})\\s*[,\\s]\\s*(${NUM})\\s*[,\\s]\\s*(${NUM})\\s*(?:[,/]\\s*(${NUM})\\s*)?\\)$`, 'i');
const SRGB_RE = new RegExp(`^color\\(\\s*srgb\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s*(?:/\\s*(${NUM})\\s*)?\\)$`, 'i');
const HEX_RE = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const num = (s, scale) => {
  if (s === undefined) return undefined;
  if (s.toLowerCase() === 'none') return 0;
  if (s.endsWith('%')) return (Number(s.slice(0, -1)) / 100) * scale;
  return Number(s);
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Parse one CSS colour → `{ r, g, b, a }` (r/g/b 0..255, a 0..1) or `null`.
 * Accepts `rgb()` / `rgba()` (comma or space syntax, alpha number or %), `color(srgb …)` (0..1 channels, `none`),
 * `#rgb[a]` / `#rrggbb[aa]`, `transparent`. Anything else (named colours, other colour spaces) → `null`.
 * @param {string} str
 */
export function parseColor(str) {
  const s = String(str ?? '').trim();
  if (!s) return null;
  if (s.toLowerCase() === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  let m = RGB_RE.exec(s);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map((x) => clamp(num(x, 255), 0, 255));
    const a = m[4] === undefined ? 1 : clamp(num(m[4], 1), 0, 1);
    return { r, g, b, a };
  }
  m = SRGB_RE.exec(s);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map((x) => clamp(num(x, 1), 0, 1) * 255);
    const a = m[4] === undefined ? 1 : clamp(num(m[4], 1), 0, 1);
    return { r, g, b, a };
  }
  m = HEX_RE.exec(s);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  return null;
}

/** `[r, g, b, a]` (0 for an unparsable string — the legacy helpers' behaviour, kept for the gates). */
export function rgbaArray(str) {
  const c = parseColor(str);
  return c ? [c.r, c.g, c.b, c.a] : [0, 0, 0, 1];
}

/** Composite a (translucent) colour over an opaque base → `{ r, g, b, a: 1 }`. */
export function composite(top, base) {
  const t = typeof top === 'string' ? parseColor(top) : top;
  const b = typeof base === 'string' ? parseColor(base) : base;
  if (!t || !b) return null;
  return { r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 };
}

/** `composite()` serialised as `rgb(r, g, b)` (rounded) — the form the gates pass around as strings. */
export function over(top, base) {
  const c = composite(top, base);
  return c ? `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})` : 'rgb(0, 0, 0)';
}

const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };

/** WCAG 2.x relative luminance of an opaque colour (object or string). */
export function luminance(c) {
  const x = typeof c === 'string' ? parseColor(c) : c;
  return 0.2126 * lin(x.r) + 0.7152 * lin(x.g) + 0.0722 * lin(x.b);
}

/** WCAG 2.x contrast ratio; a translucent `fg` is composited over the (opaque) `bg` first. */
export function contrast(fg, bg) {
  const b = typeof bg === 'string' ? parseColor(bg) : bg;
  const f = composite(fg, b);
  if (!f || !b) return 0;
  const [hi, lo] = [luminance(f), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

/** Canonical string for golden files: `rgb(r, g, b)` / `rgba(r, g, b, a)` with rounded channels, or the input. */
export function normalizeColor(str) {
  const c = parseColor(str);
  if (!c) return String(str).trim();
  const ch = [c.r, c.g, c.b].map((v) => Math.round(v));
  const a = Math.round(c.a * 1000) / 1000;
  return a === 1 ? `rgb(${ch.join(', ')})` : `rgba(${ch.join(', ')}, ${a})`;
}

/** Normalise every colour inside a computed value (box-shadow lists, gradients) — numbers outside colours untouched. */
export function normalizeColorsIn(value) {
  return String(value).replace(/rgba?\([^)]*\)|color\(srgb[^)]*\)/gi, (m) => normalizeColor(m)).replace(/\s+/g, ' ').trim();
}
