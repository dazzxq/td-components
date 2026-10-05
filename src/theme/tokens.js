/**
 * The theme contract (v0.41.0, plan QĐ17) — the SEMANTIC colour / elevation tokens a theme sets (kit light, kit dark,
 * a palette fixture, R2: a generated file). Component tokens only read these (or other component tokens), never a
 * literal that assumes a white page, so a site that sets this set gets the whole kit.
 *
 * One list for: the golden test, the palette fixtures (test/tokens/palettes/), R2 the generator serializer and the
 * portal bridge allowlist. R1: internal; R2 (v0.42.0): exported through `./theme` (src/theme/index.js).
 *
 * Rule: adding a token = bump THEME_TOKENS_VERSION + CHANGELOG; a new token's default = the current value in light
 * AND dark (golden test).
 *
 * `derived: true` = declared in tokens.css as an alias of another contract token (e.g. --td-control-bg =
 * var(--td-color-surface-raised)): a theme MAY set it to diverge, it does not have to.
 */

export const THEME_TOKENS_VERSION = 1;

/** @type {ReadonlyArray<{ group: string, tokens: ReadonlyArray<string>, derived?: ReadonlyArray<string> }>} */
export const THEME_GROUPS = Object.freeze([
  {
    group: 'surface',
    tokens: ['--td-color-bg', '--td-color-surface', '--td-color-surface-muted', '--td-color-surface-raised',
      '--td-control-bg', '--td-glass-solid', '--td-glass-bg', '--td-glass-bg-strong'],
    derived: ['--td-color-surface-raised', '--td-control-bg', '--td-glass-solid'],
  },
  {
    group: 'ink',
    tokens: ['--td-color-text', '--td-color-text-muted', '--td-color-text-subtle', '--td-color-text-label',
      '--td-control-fg', '--td-glass-fg'],
    derived: ['--td-control-fg'],
  },
  {
    group: 'structure',
    tokens: ['--td-color-border', '--td-color-border-strong', '--td-hairline', '--td-glass-border', '--td-control-border',
      '--td-control-border-strong', '--td-control-border-soft', '--td-control-border-hover', '--td-focus',
      '--td-focus-ring'],
    derived: ['--td-control-border'],
  },
  {
    group: 'interaction',
    tokens: ['--td-color-hover', '--td-color-hover-strong', '--td-color-pressed', '--td-color-skeleton',
      '--td-color-sheen', '--td-color-fill', '--td-color-fill-strong', '--td-color-on-fill'],
  },
  {
    group: 'accent',
    tokens: ['--td-accent', '--td-accent-fill', '--td-accent-contrast'],
  },
  {
    group: 'status',
    tokens: ['--td-color-success', '--td-color-warning', '--td-color-error', '--td-color-info', '--td-color-on-status',
      ...['success', 'danger', 'warning', 'info'].flatMap((v) => ['bg', 'border', 'fg'].map((p) => `--td-pastel-${v}-${p}`)),
      ...['success', 'warning', 'danger', 'info'].flatMap((v) => ['bg', 'border', 'icon'].map((p) => `--td-alert-${v}-${p}`))],
  },
  {
    group: 'button',
    tokens: ['--td-btn-primary-bg', '--td-btn-primary-fg', '--td-btn-primary-hover', '--td-btn-primary-pressed',
      '--td-btn-secondary-hover', '--td-btn-secondary-pressed', '--td-btn-secondary-border',
      '--td-btn-disabled-bg', '--td-btn-disabled-fg', '--td-btn-disabled-border'],
  },
  {
    group: 'elevation',
    tokens: ['--td-shadow-1', '--td-shadow-2', '--td-shadow-3', '--td-glass-shadow', '--td-glass-shadow-lg',
      '--td-btn-lift', '--td-color-overlay', '--td-tooltip-bg', '--td-tooltip-fg', '--td-tooltip-border'],
  },
]);

/** Flat, stable order (group order, then token order). */
export const THEME_TOKENS = Object.freeze(THEME_GROUPS.flatMap((g) => g.tokens));

/** Tokens a theme may leave out: tokens.css declares them as an alias of another contract token. */
export const DERIVED_THEME_TOKENS = Object.freeze(THEME_GROUPS.flatMap((g) => g.derived || []));

/**
 * v0.42.0: what each derived token is an alias OF in tokens.css (`--td-control-bg: var(--td-color-surface-raised)`).
 * The palette serializer leaves a derived token out when its value equals its source's, so the kit alias keeps working
 * (a site overriding the source moves the alias too). Locked against tokens.css by tokens.test.js.
 */
export const DERIVED_ALIASES = Object.freeze({
  '--td-color-surface-raised': '--td-color-surface',
  '--td-control-bg': '--td-color-surface-raised',
  '--td-glass-solid': '--td-color-surface-raised',
  '--td-control-fg': '--td-color-text',
  '--td-control-border': '--td-color-border-strong',
});

/**
 * v0.42.0 (impl review ISSUE-1): COMPONENT colour tokens whose kit value depends on the scheme (the kit sets them again
 * in a `data-td-theme="dark"` rule, or derives them with color-mix()). A generated palette serializes all of them after
 * the contract (static sRGB values computed from the palette), so a dark-scheme palette in the base slot or under a
 * name — where no kit dark rule applies — and a `--mode dark` palette — where the kit's dark literals would assume the
 * kit's dark surfaces — both get colours made for THEIR surfaces, with no color-mix() path. Not part of the contract
 * (sites need not set them; not bridged across portals — the mirrored attribute re-applies a named theme's rule).
 * Locked by src/theme/tokens.test.js: every token a kit dark rule sets is in THEME_TOKENS, here, or dark-invariant.
 */
export const SCHEME_TOKENS = Object.freeze([
  '--td-field-bg-disabled', '--td-field-focus', '--td-field-focus-ring',
  '--td-action-btn-warning-fg', '--td-action-btn-warning-hover-bg', '--td-action-btn-warning-pressed-bg',
  '--td-action-btn-warning-pressed-fg', '--td-action-btn-danger-fg', '--td-action-btn-danger-hover-bg',
  '--td-action-btn-danger-pressed-bg',
  '--td-btn-ghost-hover-fg', '--td-btn-ghost-hover-fg-fallback',
  '--td-slider-track', '--td-slider-disabled',
  '--td-tabs-pill', '--td-tabs-pill-shadow',
  '--td-dropdown-create-fg', '--td-dropdown-create-fg-fallback',
  '--td-table-zebra', '--td-table-row-selected', '--td-table-edge-shadow',
  '--td-form-summary-bg', '--td-form-summary-border', '--td-form-summary-pressed-bg',
  '--td-menu-separator', '--td-chip-remove-hover',
  '--td-hovercard-error-fg', '--td-hovercard-link-fg',
  '--td-dropzone-bg-active', '--td-dropzone-bg-pressed',
  '--td-badge-accent-bg', '--td-badge-accent-fg', '--td-badge-success-ink', '--td-badge-warning-ink',
  '--td-badge-danger-ink', '--td-badge-info-ink',
  '--td-filter-chip-remove-fg',
  '--td-diff-added-bg', '--td-diff-removed-bg', // v0.46.0 td-diff cell tints
]);
