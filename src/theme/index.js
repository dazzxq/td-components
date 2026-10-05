/**
 * `@dazzxq/td-components/theme` (v0.42.0, plan N2) — the palette generator + serializer, pure (no DOM, no custom
 * element, no side effect): usable in Node (the `td-theme` CLI), the builder page and a site's own build.
 *
 *   import { generatePalette, toCss } from '@dazzxq/td-components/theme';
 *   const css = toCss(generatePalette({ bg: '#ece5d8', accent: '#b3261e', surface: '#fff' }));
 *
 * @module theme
 */
export {
  generatePalette, presetPalette, parseSeed, checkThemeName, hasAaFailure, ThemeInputError, GATE, DESIGN, ALGORITHM_VERSION,
} from './palette.js';
export { toCss, toJson, formatDiagnostics } from './serialize.js';
export { parseColor, contrast, luminance, apcaLc, pickPole, toHex } from './color.js';
export { THEME_TOKENS, THEME_TOKENS_VERSION, THEME_GROUPS } from './tokens.js';
export { PRESETS } from './presets.js';
