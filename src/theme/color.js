/**
 * Colour core (v0.42.0, plan N1 / QĐ11) — PURE: no DOM, no dependency, same results in Node and every browser engine.
 * One home for what the kit used to compute in four places (dom-utils, td-button, td-tooltip, td-pagination) and for the
 * palette generator (palette.js):
 *
 * - `parseColor(str)` → `{ r, g, b, a }` (sRGB channels 0..1, alpha 0..1) or `null`. Accepts ONLY `#rgb`, `#rgba`,
 *   `#rrggbb`, `#rrggbbaa`, `rgb()` / `rgba()` (comma or space syntax, numbers or percentages), `color(srgb …)`,
 *   `oklch()` and the 16 CSS basic colour names (+ `transparent`). Anything else — other functions, `var()`, comments,
 *   `;`, `}`, strings longer than MAX_COLOR_INPUT — is `null`. Anchored regular expressions, no `eval`, no DOM parsing.
 * - OKLab / OKLCH conversion (Björn Ottosson's matrices, as CSS Color 4), `gamutMap()` (reduce chroma at constant
 *   lightness + hue until the colour fits sRGB — CSS Color 4 §13.2 without the ΔE shortcut), `toHex()` (the ONE place a
 *   colour is rounded to 8 bits: Math.round per channel).
 * - WCAG 2.x `luminance()` / `contrast()` (the 0.03928 linearisation threshold of WCAG 2.x, as the legacy helpers),
 *   `composite()`, `pickPole()` (black or white text), `apcaLc()` (APCA 0.0.98G-4g — a diagnostic, never a gate, QĐ9).
 *
 * @module theme/color
 */

/** Longest colour string parseColor() looks at (CLI / builder seed cap). */
export const MAX_COLOR_INPUT = 64;

const NUM = '[+-]?(?:\\d{1,10}(?:\\.\\d{1,10})?|\\.\\d{1,10})(?:e[+-]?\\d{1,3})?';
const NP = `(?:${NUM}%?)`;
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_COMMA_RE = new RegExp(`^rgba?\\(\\s*(${NP})\\s*,\\s*(${NP})\\s*,\\s*(${NP})\\s*(?:,\\s*(${NP})\\s*)?\\)$`, 'i');
const RGB_SPACE_RE = new RegExp(`^rgba?\\(\\s*(${NP})\\s+(${NP})\\s+(${NP})\\s*(?:\\/\\s*(${NP})\\s*)?\\)$`, 'i');
const SRGB_RE = new RegExp(`^color\\(\\s*srgb\\s+(${NP})\\s+(${NP})\\s+(${NP})\\s*(?:\\/\\s*(${NP})\\s*)?\\)$`, 'i');
const OKLCH_RE = new RegExp(`^oklch\\(\\s*(${NP})\\s+(${NP})\\s+(${NUM})(?:deg)?\\s*(?:\\/\\s*(${NP})\\s*)?\\)$`, 'i');

/** CSS basic colour keywords (CSS Color 4 §6.1, the 16 HTML 4 names) — sRGB 0..255. */
const NAMED = Object.freeze({
  black: [0, 0, 0], silver: [192, 192, 192], gray: [128, 128, 128], grey: [128, 128, 128], white: [255, 255, 255],
  maroon: [128, 0, 0], red: [255, 0, 0], purple: [128, 0, 128], fuchsia: [255, 0, 255], green: [0, 128, 0],
  lime: [0, 255, 0], olive: [128, 128, 0], yellow: [255, 255, 0], navy: [0, 0, 128], blue: [0, 0, 255],
  teal: [0, 128, 128], aqua: [0, 255, 255],
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** A number or percentage token (a percentage is a fraction of `pctScale`). */
const val = (tok, pctScale) => (tok.endsWith('%') ? (Number(tok.slice(0, -1)) / 100) * pctScale : Number(tok));
/** Every channel token parsed to a finite number (`1e999` → Infinity is refused, not clamped). */
const finite = (nums, alphaTok) => nums.every(Number.isFinite)
  && (alphaTok === undefined || Number.isFinite(Number(alphaTok.replace(/%$/, ''))));
const alphaOf = (tok) => (tok === undefined ? 1 : clamp01(tok.endsWith('%') ? Number(tok.slice(0, -1)) / 100 : Number(tok)));

/**
 * Parse one CSS colour string (strict subset, see module doc).
 * @param {unknown} str
 * @returns {{ r: number, g: number, b: number, a: number } | null} channels 0..1
 */
export function parseColor(str) {
  if (typeof str !== 'string' || str.length > MAX_COLOR_INPUT) return null;
  const s = str.trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (Object.prototype.hasOwnProperty.call(NAMED, lower)) {
    const [r, g, b] = NAMED[lower];
    return { r: r / 255, g: g / 255, b: b / 255, a: 1 };
  }
  let m = HEX_RE.exec(s);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
  }
  m = RGB_COMMA_RE.exec(s) || RGB_SPACE_RE.exec(s);
  if (m) {
    const raw = [m[1], m[2], m[3]].map((tok) => (tok.endsWith('%') ? Number(tok.slice(0, -1)) / 100 : Number(tok) / 255));
    return finite(raw, m[4]) ? { r: clamp01(raw[0]), g: clamp01(raw[1]), b: clamp01(raw[2]), a: alphaOf(m[4]) } : null;
  }
  m = SRGB_RE.exec(s);
  if (m) {
    const raw = [m[1], m[2], m[3]].map((tok) => (tok.endsWith('%') ? Number(tok.slice(0, -1)) / 100 : Number(tok)));
    return finite(raw, m[4]) ? { r: clamp01(raw[0]), g: clamp01(raw[1]), b: clamp01(raw[2]), a: alphaOf(m[4]) } : null;
  }
  m = OKLCH_RE.exec(s);
  if (m) {
    const raw = [val(m[1], 1), val(m[2], 0.4), Number(m[3])];
    if (!finite(raw, m[4])) return null;
    const l = clamp01(raw[0]);
    const c = Math.max(0, raw[1]);
    const h = raw[2];
    const { rgb } = gamutMap({ l, c, h });
    return { ...rgb, a: alphaOf(m[4]) };
  }
  return null;
}

// ---- sRGB ↔ linear ↔ OKLab ↔ OKLCH -------------------------------------------------------------------------------

/** sRGB transfer (CSS Color 4: 0.04045). */
const toLinear = (c) => {
  const a = Math.abs(c);
  return a <= 0.04045 ? c / 12.92 : Math.sign(c) * ((a + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c) => {
  const a = Math.abs(c);
  return a <= 0.0031308 ? c * 12.92 : Math.sign(c) * (1.055 * a ** (1 / 2.4) - 0.055);
};

/** @param {{ r: number, g: number, b: number }} c sRGB 0..1 → OKLab */
export function srgbToOklab({ r, g, b }) {
  const lr = toLinear(r); const lg = toLinear(g); const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    l: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
}

/** OKLab → sRGB 0..1 (NOT clamped: out-of-gamut channels fall outside 0..1). */
export function oklabToSrgb({ l, a, b }) {
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s1 = (l - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return {
    r: fromLinear(4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1),
    g: fromLinear(-1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1),
    b: fromLinear(-0.0041960863 * l1 - 0.7034186147 * m1 + 1.7076147010 * s1),
  };
}

/** @param {{ r: number, g: number, b: number }} c → `{ l, c, h }` (h in degrees 0..360; 0 for greys) */
export function srgbToOklch(c) {
  const { l, a, b } = srgbToOklab(c);
  const chroma = Math.sqrt(a * a + b * b);
  let h = chroma < 1e-7 ? 0 : (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l, c: chroma < 1e-7 ? 0 : chroma, h };
}

/** OKLCH → sRGB 0..1, not clamped. */
export function oklchToSrgb({ l, c, h }) {
  const rad = (h * Math.PI) / 180;
  return oklabToSrgb({ l, a: c * Math.cos(rad), b: c * Math.sin(rad) });
}

// ---- sRGB ↔ HSV (v0.48.0: the 2-D area of td-color-picker — x = saturation, y = value) ----------------------------

/**
 * sRGB 0..1 → HSV (`h` degrees 0..360, `s` / `v` 0..1). Greys (`s = 0`) and black (`v = 0`) have `h = 0`: a caller that
 * must keep a hue across them (the picker) keeps its own.
 * @param {{ r: number, g: number, b: number }} c
 * @returns {{ h: number, s: number, v: number }}
 */
export function srgbToHsv({ r, g, b }) {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/**
 * HSV → sRGB 0..1 (`h` wraps, `s` / `v` clamped to 0..1). Not rounded: toHex() is the one rounding point.
 * @param {{ h: number, s: number, v: number }} hsv
 * @returns {{ r: number, g: number, b: number }}
 */
export function hsvToSrgb({ h, s, v }) {
  const hh = (((Number(h) || 0) % 360) + 360) % 360;
  const ss = clamp01(Number(s) || 0);
  const vv = clamp01(Number(v) || 0);
  const c = vv * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vv - c;
  const i = Math.floor(hh / 60);
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][i];
  return { r: r + m, g: g + m, b: b + m };
}

const GAMUT_EPS = 1e-6;
/** @param {{ r: number, g: number, b: number }} c */
export const inGamut = (c) => [c.r, c.g, c.b].every((v) => v >= -GAMUT_EPS && v <= 1 + GAMUT_EPS);
const clampRgb = (c) => ({ r: clamp01(c.r), g: clamp01(c.g), b: clamp01(c.b) });

/**
 * Fit an OKLCH colour into sRGB: lightness and hue kept, chroma reduced (bisection, 32 steps) until every channel is in
 * 0..1; L ≤ 0 → black, L ≥ 1 → white.
 * @param {{ l: number, c: number, h: number }} lch
 * @returns {{ rgb: { r: number, g: number, b: number }, c: number, reduced: boolean }}
 */
export function gamutMap({ l, c, h }) {
  if (l >= 1) return { rgb: { r: 1, g: 1, b: 1 }, c: 0, reduced: c > 0 };
  if (l <= 0) return { rgb: { r: 0, g: 0, b: 0 }, c: 0, reduced: c > 0 };
  const direct = oklchToSrgb({ l, c, h });
  if (inGamut(direct)) return { rgb: clampRgb(direct), c, reduced: false };
  let lo = 0;
  let hi = c;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToSrgb({ l, c: mid, h }))) lo = mid; else hi = mid;
  }
  return { rgb: clampRgb(oklchToSrgb({ l, c: lo, h })), c: lo, reduced: true };
}

// ---- output -----------------------------------------------------------------------------------------------------

const byte = (v) => Math.round(clamp01(v) * 255);
const hex2 = (n) => n.toString(16).padStart(2, '0');

/**
 * The ONE rounding point: sRGB 0..1 → `#rrggbb` (lowercase). Alpha is ignored (see toCss()).
 * @param {{ r: number, g: number, b: number }} c
 */
export function toHex(c) {
  return `#${hex2(byte(c.r))}${hex2(byte(c.g))}${hex2(byte(c.b))}`;
}

/** Re-read a colour through toHex() (8-bit quantised, opaque). */
export const quantize = (c) => parseColor(toHex(c));

/**
 * CSS text for a colour: `#rrggbb` when opaque, else `rgb(R G B / P%)` (8-bit channels, whole-percent alpha).
 * @param {{ r: number, g: number, b: number, a?: number }} c
 */
export function toCss(c) {
  const a = c.a === undefined ? 1 : clamp01(c.a);
  if (a >= 1) return toHex(c);
  return `rgb(${byte(c.r)} ${byte(c.g)} ${byte(c.b)} / ${Math.round(a * 100)}%)`;
}

// ---- WCAG 2.x / APCA --------------------------------------------------------------------------------------------

/** @param {string | { r: number, g: number, b: number, a?: number }} c */
const asColor = (c) => (typeof c === 'string' ? parseColor(c) : c);

/**
 * WCAG 2.x relative luminance (linearisation threshold 0.03928, as WCAG 2.x and the pre-0.42 helpers).
 * @param {string | { r: number, g: number, b: number }} color sRGB 0..1 object or CSS string
 */
export function luminance(color) {
  const c = asColor(color);
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/**
 * Composite a (translucent) colour over an opaque one.
 * @returns {{ r: number, g: number, b: number, a: 1 } | null}
 */
export function composite(top, base) {
  const t = asColor(top);
  const b = asColor(base);
  if (!t || !b) return null;
  const a = t.a === undefined ? 1 : t.a;
  return { r: t.r * a + b.r * (1 - a), g: t.g * a + b.g * (1 - a), b: t.b * a + b.b * (1 - a), a: 1 };
}

/**
 * WCAG 2.x contrast ratio (1..21). A translucent `fg` is composited over the (opaque) `bg` first. 0 when unparsable.
 */
export function contrast(fg, bg) {
  const b = asColor(bg);
  const f = b ? composite(fg, b) : null;
  if (!f || !b) return 0;
  const l1 = luminance(f);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * Black or white text for an (opaque) background, whichever has the higher WCAG contrast; an exact tie goes to `tie`
 * (the legacy helpers differ: td-tooltip / dom-utils → white, td-button / td-pagination → black).
 * @param {string | { r: number, g: number, b: number }} bg
 * @param {{ tie?: 'white' | 'black' }} [o]
 * @returns {'#000000' | '#ffffff'}
 */
export function pickPole(bg, { tie = 'white' } = {}) {
  const L = luminance(bg);
  const withBlack = (L + 0.05) / 0.05;
  const withWhite = 1.05 / (L + 0.05);
  if (withBlack > withWhite) return '#000000';
  if (withWhite > withBlack) return '#ffffff';
  return tie === 'black' ? '#000000' : '#ffffff';
}

/**
 * APCA lightness contrast Lc (0.0.98G-4g constants) of `text` on `bg` — positive for dark text on light, negative for
 * light on dark. Diagnostic only (QĐ9); WCAG 2.x is the gate.
 */
export function apcaLc(text, bg) {
  const t = asColor(text);
  const b = asColor(bg);
  if (!t || !b) return 0;
  const y = (c) => {
    const v = 0.2126729 * c.r ** 2.4 + 0.7151522 * c.g ** 2.4 + 0.0721750 * c.b ** 2.4;
    return v < 0.022 ? v + (0.022 - v) ** 1.414 : v;
  };
  const yt = y(composite(t, b));
  const yb = y(b);
  if (Math.abs(yb - yt) < 0.0005) return 0;
  if (yb > yt) {
    const sapc = (yb ** 0.56 - yt ** 0.57) * 1.14;
    return sapc < 0.1 ? 0 : (sapc - 0.027) * 100;
  }
  const sapc = (yb ** 0.65 - yt ** 0.62) * 1.14;
  return sapc > -0.1 ? 0 : (sapc + 0.027) * 100;
}
