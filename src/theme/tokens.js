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
