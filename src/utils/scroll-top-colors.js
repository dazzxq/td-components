/**
 * Per-instance colours of `<td-scroll-top>` (v0.62.0, plan E) — pure, no DOM. The `color` attribute is the button fill, the
 * optional `text-color` its icon. Same trust path as the other colour attributes: `safeColor()` (whitelist: hex, a name,
 * `rgb()`/`rgba()`/`hsl()`/`hsla()`) → `parseColor()` (hex, the 16 basic names, `rgb()`; `hsl()` and other names pass the
 * whitelist but are not readable here → ignored) → OPAQUE only (a floating button over arbitrary content has no defined contrast with a translucent fill).
 *
 * @param {unknown} color      the `color` attribute
 * @param {unknown} [textColor] the `text-color` attribute (only meaningful with a valid `color`)
 * @returns {{ bg: string, fg: string, hover: string, pressed: string, textRejected: boolean } | null}
 *   bg / fg / hover are `#rrggbb`; `pressed` is the overlay colour of the pressed shape (`rgb(R G B / 14%)`, the pole that
 *   lifts the icon contrast); `textRejected` = a `text-color` was given but unusable (translucent, unparsable, or < 3:1 on
 *   `color`) and the automatic black / white icon colour is used instead (>= 4.58:1 on every fill).
 *   null = `color` is absent or unusable (the tokens apply).
 */
import { safeColor } from './css-safe.js';
import { parseColor, pickPole, contrast, toHex } from '../theme/color.js';

/** Minimum contrast of an explicit `text-color` on `color` (non-text, WCAG 1.4.11). */
const TEXT_MIN = 3;
const HOVER_MIX = 0.08;

/** @param {unknown} value @returns {{ r: number, g: number, b: number, a: number } | null} opaque colour or null */
function opaque(value) {
  const c = parseColor(safeColor(value, ''));
  return c && c.a === 1 ? c : null;
}

export function resolveScrollTopColors(color, textColor) {
  const bg = opaque(color);
  if (!bg) return null;
  const auto = parseColor(pickPole(bg, { tie: 'black' }));
  let fg = auto;
  let textRejected = false;
  if (textColor !== undefined && textColor !== null && String(textColor).trim() !== '') {
    const t = opaque(textColor);
    if (t && contrast(t, bg) >= TEXT_MIN) fg = t;
    else textRejected = true;
  }
  const hover = {
    r: bg.r + (fg.r - bg.r) * HOVER_MIX,
    g: bg.g + (fg.g - bg.g) * HOVER_MIX,
    b: bg.b + (fg.b - bg.b) * HOVER_MIX,
  };
  // a light icon sits on a dark fill → darken it further when pressed; a dark icon → lighten (never lowers the icon contrast)
  const lightIcon = contrast(fg, '#000000') > contrast(fg, '#ffffff');
  return {
    bg: toHex(bg),
    fg: toHex(fg),
    hover: toHex(hover),
    pressed: lightIcon ? 'rgb(0 0 0 / 14%)' : 'rgb(255 255 255 / 14%)',
    textRejected,
  };
}
