/**
 * Theme selector table (v0.42.0, plan "Bảng selector" + ADR 0020) — the ONE source for the kit's own token blocks
 * (scripts/css-theme.mjs checks / generates them) and the palette serializer (serialize.js). Locked by tests.
 *
 * Two specificity tiers, so the cascade never depends on file order between "base" and "variant" blocks:
 *
 * | slot | selector | specificity |
 * |---|---|---|
 * | base (light values, every scope re-resolves them) | `:root, [data-td-theme]` | 0,1,0 |
 * | explicit light / auto (scheme only) | `[data-td-theme="light"], [data-td-theme="auto"]` | 0,1,0 |
 * | variant `x` (dark, a named theme) | `:root[data-td-theme="x"], [data-td-theme][data-td-theme="x"]` | 0,2,0 |
 * | auto under an OS dark preference | the dark variant with `auto`, inside `@media (prefers-color-scheme: dark)` | 0,2,0 |
 *
 * A generated file loaded after td.css (same layer `td.tokens`): its base block beats the kit base (same specificity,
 * later) but never a kit variant (0,2,0); its variant block beats the kit's variant of the same name (later). Without the
 * doubled attribute a generated LIGHT file would have repainted every `[data-td-theme="dark"]` scope light.
 *
 * @module theme/selectors
 */

/** The marked theme scope (anything carrying the attribute, including `<html>`). */
export const SCOPE_ATTR = 'data-td-theme';
export const SCOPE = `[${SCOPE_ATTR}]`;

/** Light values: the page and every marked scope (colour / shadow tokens only — geometry stays on :root, QĐ15). */
export const BASE_SELECTOR = `:root, ${SCOPE}`;

/** Explicit light scopes (and auto under an OS light preference) declare `color-scheme: light`. */
export const LIGHT_SCHEME_SELECTOR = `[${SCOPE_ATTR}="light"], [${SCOPE_ATTR}="auto"]`;

/** Theme names a site may give a generated variant (kit names excluded). */
export const THEME_NAME_RE = /^[a-z][a-z0-9-]{0,31}$/;
export const RESERVED_THEME_NAMES = Object.freeze(['light', 'dark', 'auto']);

/**
 * The variant slot of a theme value (`dark`, `auto`, or a validated site theme name).
 * @param {string} value
 */
export function variantSelector(value) {
  if (!THEME_NAME_RE.test(value)) throw new TypeError('variantSelector: invalid theme value');
  return `:root[${SCOPE_ATTR}="${value}"], ${SCOPE}[${SCOPE_ATTR}="${value}"]`;
}

export const DARK_SELECTOR = variantSelector('dark');
export const AUTO_DARK_SELECTOR = variantSelector('auto');
export const AUTO_DARK_MEDIA = '@media (prefers-color-scheme: dark)';
