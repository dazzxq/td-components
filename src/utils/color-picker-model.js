/**
 * td-color-picker pure model (v0.48.0, plan v0.48.0-color-picker QĐ 1–7, 12–14). No DOM — node tests.
 * Internal module (no package subpath): the element (src/form/td-color-picker.js) is the public API.
 *
 * - `parseColorInput(raw)`: what the user typed / pasted / a preset / the EyeDropper returned → `#rrggbb` (lowercase,
 *   the ONE value shape) or a reason. Every syntax goes through `parseColor()` of src/theme/color.js (anchored, fuzzed
 *   in v0.42); the only addition is a bare hex (`1d4ed8`, `abc` — Figma / Photoshop copy) which gets its `#` first.
 * - HSV state of the popup (`hsvFromHex`, `hexFromHsv`, `stepArea`, `areaFromPoint`): floats, the hex is only an
 *   output (toHex() rounds) — a grey / black keeps the previous hue (and black the previous saturation).
 * - `colorName(hex)`: an APPROXIMATE Vietnamese colour name from OKLCH (screen-reader text; not a stable API).
 */
import { parseColor, toHex, srgbToHsv, hsvToSrgb, srgbToOklch, MAX_COLOR_INPUT } from '../theme/color.js';

/** The value shape: `#rrggbb`, lowercase. The ONLY strings ever written into CSSOM by the picker. */
export const HEX_RE = /^#[0-9a-f]{6}$/;
/** Longest input looked at (= parseColor's cap). */
export { MAX_COLOR_INPUT };
/** At most this many presets (extra entries are dropped with one warning). */
export const MAX_PRESETS = 48;
/** Longest preset label kept (characters). */
export const MAX_PRESET_LABEL = 120;

/** dcms2 dcms-color-picker DEFAULT_PRESETS, lowercased (greys, then the hue wheel). */
export const DEFAULT_PRESETS = Object.freeze([
  '#ffffff', '#e5e7eb', '#9ca3af', '#6b7280', '#374151', '#000000',
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#10b981', '#14b8a6', '#3b82f6', '#6366f1', '#8b5cf6',
]);

const BARE_HEX = /^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * @param {unknown} raw
 * @returns {{ ok: true, hex: string } | { ok: false, reason: 'empty' | 'invalid' | 'alpha' }}
 */
export function parseColorInput(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_COLOR_INPUT) return { ok: false, reason: 'invalid' };
  const s = raw.trim();
  if (!s) return { ok: false, reason: 'empty' };
  const c = parseColor(BARE_HEX.test(s) ? `#${s}` : s);
  if (!c) return { ok: false, reason: 'invalid' };
  if (c.a < 1) return { ok: false, reason: 'alpha' };
  return { ok: true, hex: toHex(c) };
}

/**
 * Presets from the attribute (a string: codes separated by white space / commas) or the property (an array of
 * `string | { value, label }`). Each entry goes through parseColorInput(); invalid / translucent ones are dropped,
 * duplicates keep the first, at most MAX_PRESETS. `null` / `undefined` → DEFAULT_PRESETS; `''` / `[]` → none.
 * @param {unknown} input
 * @returns {{ items: Array<{ hex: string, label: string }>, dropped: number }}
 */
export function parsePresets(input) {
  if (input == null) return { items: DEFAULT_PRESETS.map((hex) => ({ hex, label: '' })), dropped: 0 };
  let list;
  if (typeof input === 'string') list = input.split(/[\s,]+/).filter(Boolean);
  else if (Array.isArray(input)) list = input;
  else return { items: [], dropped: 1 };
  const items = [];
  const seen = new Set();
  let dropped = 0;
  for (const entry of list) {
    let raw = entry;
    let label = '';
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      raw = Object.prototype.hasOwnProperty.call(entry, 'value') ? entry.value : undefined;
      const l = Object.prototype.hasOwnProperty.call(entry, 'label') ? entry.label : undefined;
      if (typeof l === 'string') label = l.trim().slice(0, MAX_PRESET_LABEL);
    }
    const r = parseColorInput(raw);
    if (!r.ok) { dropped += 1; continue; }
    if (seen.has(r.hex)) continue;
    if (items.length >= MAX_PRESETS) { dropped += 1; continue; }
    seen.add(r.hex);
    items.push({ hex: r.hex, label });
  }
  return { items, dropped };
}

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * HSV state for a hex set from outside (typed, preset, `value`): a grey (`s = 0`) keeps the previous hue, black
 * (`v = 0`) keeps the previous hue AND saturation — dragging to black and back never jumps the hue to red.
 * @param {string} hex `#rrggbb`
 * @param {{ h: number, s: number, v: number } | null} [prev]
 * @returns {{ h: number, s: number, v: number }}
 */
export function hsvFromHex(hex, prev = null) {
  const c = parseColor(hex);
  if (!c) return prev ? { ...prev } : { h: 0, s: 0, v: 0 };
  const hsv = srgbToHsv(c);
  if (prev) {
    if (hsv.v === 0) return { h: prev.h, s: prev.s, v: 0 };
    if (hsv.s === 0) return { h: prev.h, s: 0, v: hsv.v };
  }
  return hsv;
}

/** @param {{ h: number, s: number, v: number }} hsv @returns {string} `#rrggbb` */
export const hexFromHsv = (hsv) => toHex(hsvToSrgb(hsv));

/** The pure hue colour (`s = v = 1`) of `h`, for the area's background. @param {number} h */
export const hueHex = (h) => toHex(hsvToSrgb({ h, s: 1, v: 1 }));

/**
 * Keyboard reducer of the 2-D area (QĐ 12): ←/→ saturation ±1 %, ↑/↓ value ±1 %, Shift ×10, PageUp / PageDown value
 * ±10 %, Home / End saturation 0 / 100 %. Computed on the float state, clamped to 0..1. Unknown key → null.
 * @param {{ h: number, s: number, v: number }} state
 * @param {string} key KeyboardEvent.key
 * @param {boolean} [shift]
 * @returns {{ h: number, s: number, v: number } | null}
 */
export function stepArea(state, key, shift = false) {
  const d = shift ? 0.1 : 0.01;
  const next = { ...state };
  switch (key) {
    case 'ArrowLeft': next.s = clamp01(state.s - d); break;
    case 'ArrowRight': next.s = clamp01(state.s + d); break;
    case 'ArrowUp': next.v = clamp01(state.v + d); break;
    case 'ArrowDown': next.v = clamp01(state.v - d); break;
    case 'PageUp': next.v = clamp01(state.v + 0.1); break;
    case 'PageDown': next.v = clamp01(state.v - 0.1); break;
    case 'Home': next.s = 0; break;
    case 'End': next.s = 1; break;
    default: return null;
  }
  return next;
}

/**
 * A point (client coordinates) on the area → saturation (x) / value (y, top = 1), clamped to the rectangle.
 * @param {{ left: number, top: number, width: number, height: number }} rect
 * @param {number} x
 * @param {number} y
 * @returns {{ s: number, v: number }}
 */
export function areaFromPoint(rect, x, y) {
  const s = rect.width > 0 ? clamp01((x - rect.left) / rect.width) : 0;
  const v = rect.height > 0 ? clamp01(1 - (y - rect.top) / rect.height) : 0;
  return { s, v };
}

/** OKLCH hue ranges → Vietnamese names (QĐ 13; ranges in degrees, [from, to)). */
const HUES = [
  [15, 40, 'đỏ'], [40, 75, 'cam'], [75, 115, 'vàng'], [115, 160, 'xanh lá'], [160, 200, 'xanh ngọc'],
  [200, 245, 'xanh lơ'], [245, 285, 'xanh dương'], [285, 330, 'tím'],
];

/**
 * Approximate Vietnamese colour name of `#rrggbb` (QĐ 13) — a DESCRIPTION for screen readers (always read next to
 * the hex), not a stable API: thresholds may be tuned. Greys by OKLCH lightness; else the hue range + `nhạt` (light,
 * low chroma) / `đậm` (dark). '' for an unparsable input.
 * @param {string} hex
 * @returns {string}
 */
export function colorName(hex) {
  const c = parseColor(hex);
  if (!c) return '';
  const { l, c: chroma, h } = srgbToOklch(c);
  if (chroma < 0.035) {
    if (l > 0.95) return 'trắng';
    if (l < 0.18) return 'đen';
    return l > 0.8 ? 'xám nhạt' : l < 0.45 ? 'xám đậm' : 'xám';
  }
  let name = 'hồng';
  for (const [a, b, n] of HUES) if (h >= a && h < b) name = n;
  if (name === 'cam' && l < 0.55) return l < 0.35 ? 'nâu đậm' : 'nâu';
  if (l > 0.8 && chroma < 0.15) return `${name} nhạt`;
  if (l < 0.45) return `${name} đậm`;
  return name;
}

/** Fill `{name}` placeholders (unknown ones are left as is). @param {string} tpl @param {Object<string, *>} vars */
export function fill(tpl, vars) {
  return String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/**
 * `aria-valuetext` of the area thumb: "Bão hoà 62 %, độ sáng 40 % — xanh dương đậm, #1d4ed8" (template overridable).
 * @param {{ s: number, v: number }} state
 * @param {string} hex
 * @param {string} name
 * @param {string} [tpl]
 */
export function areaValueText(state, hex, name, tpl = 'Bão hoà {s} %, độ sáng {v} % — {name}, {hex}') {
  return fill(tpl, { s: Math.round(state.s * 100), v: Math.round(state.v * 100), name, hex });
}
