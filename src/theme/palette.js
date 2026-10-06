/**
 * Palette generator (v0.42.0, plan N2 / QĐ10–QĐ14) — PURE (no DOM, no dependency). A site gives a page background +
 * an accent (+ optional surfaces / status colours); the generator returns every token of the theme contract
 * (THEME_TOKENS) as static sRGB values whose mandatory pairs pass WCAG 2.x AA, or a STABLE diagnostic code where the
 * maths cannot (QĐ10: the background is never changed — the best black / white pole is used and
 * TD_THEME_CONTRAST_UNSATISFIABLE is reported).
 *
 *   generatePalette({ bg: '#ece5d8', accent: '#b3261e', surface: '#fff' }, { mode: 'light' })
 *     → { tokens: Map<name, css>, scheme: 'light'|'dark', mode, name, seeds, diagnostics: [...], constraints: [...] }
 *
 * Method (QĐ11): parse → OKLCH (lightness moves, hue kept, chroma reduced only by the sRGB gamut) → sRGB → 8-bit hex
 * (color.js toHex, the one rounding point) → WCAG 2.x tested ON THE ROUNDED COLOUR. An ink is solved against EVERY
 * background it can sit on (surfaces, the hover composites, fills, alert tints): the feasible luminance set is computed
 * exactly (`feasibleY`), the nearest feasible luminance to the design start is realised, an empty set = unsatisfiable.
 *
 * The step sizes / alphas in DESIGN are DESIGN constants (locked by the golden palettes in palette.test.js and reviewed
 * by eye in the builder), not accessibility rules — the rules are GATE (QĐ9).
 *
 * Diagnostics `{ code, severity, token, against, ratio, required }`, severities `error-AA` (the only one that makes the
 * CLI exit 1) · `warn` · `info`:
 *   TD_THEME_CONTRAST_UNSATISFIABLE (error-AA) — no colour reaches `required` against all of `against` (dead band);
 *     the token holds the best pole.
 *   TD_THEME_CONTRAST_MISS (error-AA) — a pair failed although a colour exists (a generator bug; the fuzz test keeps
 *     it at zero).
 *   TD_THEME_PREFERRED_MISS (info) — body text below the preferred 7:1 (the gate is 4.7).
 *   TD_THEME_ACCENT_ADJUSTED (warn) — the accent ink or fill differs from the seed (lightness moved / chroma reduced).
 *   TD_THEME_GAMUT_REDUCED (info) — an adjusted accent / status colour lost chroma to fit sRGB.
 *   TD_THEME_APCA (info) — APCA Lc of body / muted text on the surface (diagnostic only).
 *
 * @module theme/palette
 */
import {
  parseColor, srgbToOklch, srgbToOklab, oklabToSrgb, gamutMap, toHex, toCss, luminance, contrast, composite, apcaLc,
  quantize, MAX_COLOR_INPUT,
} from './color.js';
import { THEME_TOKENS, THEME_TOKENS_VERSION, DERIVED_ALIASES, SCHEME_TOKENS } from './tokens.js';
import { THEME_NAME_RE, RESERVED_THEME_NAMES } from './selectors.js';
import { PRESETS, SCHEME_SHADOWS, FOCUS_RING } from './presets.js';

/** Bump when the same seeds produce different output (the CSS header carries it → stale-file detection). */
export const ALGORITHM_VERSION = 4;
export { THEME_TOKENS_VERSION };

/** WCAG 2.x gate (QĐ9): text 4.7 (a margin over 4.5), icons 3.2, non-text 3.0, disabled 2.2; 7 = preferred body text. */
export const GATE = Object.freeze({ text: 4.7, icon: 3.2, nonText: 3, disabled: 2.2, preferred: 7 });

/** Design constants (not a11y rules). Ratios here are targets the solver aims for; GATE is what is enforced. */
export const DESIGN = Object.freeze({
  margin: 0.1, // aim this far above a gate so engine compositing never lands below it
  surfaceStep: 0.04, // OKLCH ΔL bg → surface: one step LIGHTER (owner 1)
  inkChroma: 0.02, // max chroma of a neutral ink tinted with the surface hue
  textL: { light: 0.22, dark: 0.965 }, // body text starts near the pole, tinted (research §3.3)
  hover: [0.06, 0.1, 0.14], // pole alpha: hover / hover-strong / pressed
  fill: { light: 0.06, dark: 0.08 }, // pole over the surface (switch off, secondary, neutral badge)
  fillStrong: { light: 0.08, dark: 0.14 }, // pole over the control (chip in a field)
  skeleton: 0.07,
  secondary: [0.1, 0.16], // secondary button hover / pressed (pole over the surface)
  disabled: [0.04, 0.1], // disabled button fill / border (pole over the surface)
  glassAlpha: [0.9, 0.94],
  hairline: { light: 0.07, dark: 0.08 },
  glassBorder: { light: 0.07, dark: 0.14 },
  secondaryBorder: 0.12,
  border: 1.35, // decorative border vs the surface
  borderStrong: 1.6,
  softLight: 1.5, // owner v0.14.1: the light control edge stays soft
  hoverLight: 2.2,
  primaryStep: [0.12, 0.2], // primary button hover / pressed: ΔL toward the page
  pastel: { light: [0.14, 0.28], dark: [0.18, 0.3] }, // status over the surface: fill / border
  alert: { light: [0.08, 0.4], dark: [0.12, 0.45] },
  tooltipStepDark: 1.45, // dark tooltip chip vs page + surface
  disabledInk: 2.4,
});

/** Kit status defaults per scheme (the kit's own light / dark inks). */
const STATUS_DEFAULTS = Object.freeze({
  light: { success: '#15803d', warning: '#b45309', danger: '#b91c1c', info: '#1d4ed8' },
  dark: { success: '#22c55e', warning: '#f59e0b', danger: '#f87171', info: '#60a5fa' },
});

/** Overlay + skeleton sheen per scheme (the kit's values). */
const SCHEME_EXTRAS = Object.freeze({
  light: { '--td-color-overlay': 'rgb(10 10 12 / 45%)', '--td-color-sheen': 'rgb(255 255 255 / 60%)' },
  dark: { '--td-color-overlay': 'rgb(0 0 0 / 60%)', '--td-color-sheen': 'rgb(255 255 255 / 8%)' },
});

/** A seed / option the generator refuses (CLI exit 2). The message never repeats the raw input. */
export class ThemeInputError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'ThemeInputError';
    this.code = 'TD_THEME_INPUT';
    this.field = field;
  }
}

/** Seed fields → CLI flag (messages). */
export const SEED_FIELDS = Object.freeze({
  bg: '--bg', accent: '--accent', surface: '--surface', raisedSurface: '--raised-surface',
  controlSurface: '--control-surface', success: '--success', warning: '--warning', danger: '--danger', info: '--info',
});

const SEED_FORM_RE = /^(?:#[0-9a-f]{3}|#[0-9a-f]{6}|rgba?\([^()]*\))$/i;

/**
 * One seed colour: `#rgb`, `#rrggbb` or `rgb()` / `rgba()` with no alpha below 1 — at most MAX_COLOR_INPUT characters.
 * @param {string} field key of SEED_FIELDS
 * @param {unknown} value
 * @returns {{ r: number, g: number, b: number, a: 1 }}
 */
export function parseSeed(field, value) {
  const flag = SEED_FIELDS[field] || field;
  if (typeof value !== 'string' || value.length > MAX_COLOR_INPUT) {
    throw new ThemeInputError(field, `${flag}: expected a colour of at most ${MAX_COLOR_INPUT} characters`);
  }
  const s = value.trim();
  const c = SEED_FORM_RE.test(s) ? parseColor(s) : null;
  if (!c) throw new ThemeInputError(field, `${flag}: not a colour (use #rgb, #rrggbb or rgb(r g b))`);
  if (c.a < 1) throw new ThemeInputError(field, `${flag}: a seed must be opaque (no alpha)`);
  return { r: c.r, g: c.g, b: c.b, a: 1 };
}

/** Validate a site theme name (`--name`). */
export function checkThemeName(name) {
  if (typeof name !== 'string' || !THEME_NAME_RE.test(name) || RESERVED_THEME_NAMES.includes(name)) {
    throw new ThemeInputError('name', '--name: use a-z, 0-9 and "-", start with a letter, at most 32 characters, not light / dark / auto');
  }
  return name;
}

// ---- numeric helpers ---------------------------------------------------------------------------------------------

const BLACK = Object.freeze({ r: 0, g: 0, b: 0, a: 1 });
const WHITE = Object.freeze({ r: 1, g: 1, b: 1, a: 1 });
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const alpha = (c, a) => ({ r: c.r, g: c.g, b: c.b, a });
const over = (top, base) => composite(top, base);
const q = (c) => quantize(c);
const floor2 = (x) => Math.floor(x * 100 + 1e-9) / 100;

/** OKLab midpoint of two colours, rounded. */
function mid(a, b, t = 0.5) {
  const A = srgbToOklab(a);
  const B = srgbToOklab(b);
  const m = oklabToSrgb({ l: A.l + (B.l - A.l) * t, a: A.a + (B.a - A.a) * t, b: A.b + (B.b - A.b) * t });
  return q({ r: clamp01(m.r), g: clamp01(m.g), b: clamp01(m.b) });
}

/** The colour at OKLCH lightness `l` with the hue / (max) chroma of `lch`, gamut mapped. */
const atL = (lch, l) => gamutMap({ l: clamp01(l), c: lch.c, h: lch.h });

/** A neutral ink start: lightness `l`, hue of `surface`, small chroma. */
function tinted(surface, l, chroma = DESIGN.inkChroma) {
  const s = srgbToOklch(surface);
  return { l, c: Math.min(s.c, chroma), h: s.h };
}

/**
 * Exact feasible luminance set: every Y in [0, 1] whose WCAG ratio with EACH background luminance is ≥ min.
 * Below all, above all, or (only possible when min² < 21) between two neighbours.
 * @param {number[]} ys
 * @param {number} min
 * @returns {Array<[number, number]>}
 */
export function feasibleY(ys, min) {
  const s = [...ys].sort((a, b) => a - b);
  const out = [];
  const darkHi = (s[0] + 0.05) / min - 0.05;
  if (darkHi >= 0) out.push([0, Math.min(1, darkHi)]);
  for (let i = 0; i < s.length - 1; i++) {
    const lo = min * (s[i] + 0.05) - 0.05;
    const hi = (s[i + 1] + 0.05) / min - 0.05;
    if (lo <= hi && hi >= 0 && lo <= 1) out.push([Math.max(0, lo), Math.min(1, hi)]);
  }
  const lightLo = min * (s[s.length - 1] + 0.05) - 0.05;
  if (lightLo <= 1) out.push([Math.max(0, lightLo), 1]);
  return out;
}

/**
 * Narrowest luminance window treated as reachable: an 8-bit colour steps up to ~0.004 in Y near the top of the scale,
 * so a thinner window (two backgrounds on opposite sides squeezing a 3:1 border) counts as unsatisfiable.
 */
const MIN_WINDOW = 0.004;
const usable = (intervals) => intervals.filter(([lo, hi]) => hi - lo >= MIN_WINDOW || lo === 0 || hi === 1);

const minRatio = (c, bgs) => bgs.reduce((m, b) => Math.min(m, contrast(c, b.color)), Infinity);

/**
 * The pole for an unsatisfiable ink (QĐ10): black or white, whichever reads better on the ink's PRIMARY background
 * (`bgs[0]`: the page for body text, the fill for a fill label…) — in a true dead band the backgrounds are close and
 * this is the best pole for all of them; when seeds conflict (a white control in a dark theme) the page wins.
 */
function bestPole(bgs, prefer) {
  const rb = contrast(BLACK, bgs[0].color);
  const rw = contrast(WHITE, bgs[0].color);
  if (rb > rw) return BLACK;
  if (rw > rb) return WHITE;
  return prefer === 'dark' ? BLACK : WHITE;
}

/**
 * Solve one ink: the colour nearest to `start` (in luminance, moving its OKLCH lightness, hue kept) whose ROUNDED value
 * reaches `min` against every background. Preference: move toward `prefer` (`dark` | `light`), else the other way.
 * @param {{ start: { l: number, c: number, h: number }, bgs: Array<{ name: string, color: object }>, min: number,
 *   prefer: 'dark'|'light' }} o
 * @returns {{ color: object, unsat: boolean, miss: boolean, reduced: boolean }}
 */
function solveInk({ start, bgs, min, prefer }) {
  const ok = (c) => bgs.every((b) => contrast(c, b.color) >= min);
  const startRgb = q(atL(start, start.l).rgb);
  if (ok(startRgb)) return { color: startRgb, unsat: false, miss: false, reduced: false };
  const intervals = usable(feasibleY(bgs.map((b) => luminance(b.color)), min));
  if (!intervals.length) return { color: bestPole(bgs, prefer), unsat: true, miss: false, reduced: false };
  const y0 = luminance(startRgb);
  const targets = intervals.map(([lo, hi]) => {
    const inset = Math.min((hi - lo) / 4, 0.002);
    return Math.min(hi - inset, Math.max(lo + inset, y0));
  });
  const wantDown = prefer === 'dark';
  const preferred = targets.filter((y) => (wantDown ? y <= y0 : y >= y0));
  const pool = preferred.length ? preferred : targets;
  const target = pool.reduce((best, y) => (Math.abs(y - y0) < Math.abs(best - y0) ? y : best), pool[0]);
  const down = target < y0;
  const end = down ? 0 : 1;
  const colorAt = (t) => atL(start, start.l + (end - start.l) * t);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    const y = luminance(colorAt(m).rgb);
    if (down ? y <= target : y >= target) hi = m; else lo = m;
  }
  for (let k = 0; k <= 80; k++) {
    const t = Math.min(1, hi + k * 0.004);
    const g = colorAt(t);
    const c = q(g.rgb);
    if (ok(c)) return { color: c, unsat: false, miss: false, reduced: g.c < start.c - 0.02 };
    if (t === 1) break;
  }
  // a narrow interval the hue cannot hit after rounding: the nearest passing 8-bit grey
  let bestGrey = null;
  for (let v = 0; v <= 255; v++) {
    const g = { r: v / 255, g: v / 255, b: v / 255, a: 1 };
    if (ok(g) && (!bestGrey || Math.abs(luminance(g) - target) < Math.abs(luminance(bestGrey) - target))) bestGrey = g;
  }
  if (bestGrey) return { color: bestGrey, unsat: false, miss: false, reduced: start.c > 0.02 };
  return { color: bestPole(bgs, prefer), unsat: false, miss: true, reduced: false };
}

/** Move `base` lightness by up to `dl` toward `end` (0 | 1), keeping `ok`; the largest passing step (rounded). */
function step(base, dl, end, ok) {
  const lch = srgbToOklch(base);
  const at = (d) => q(atL(lch, lch.l + (end > lch.l ? d : -d)).rgb);
  if (ok(at(dl))) return at(dl);
  let lo = 0;
  let hi = dl;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (ok(at(m))) lo = m; else hi = m;
  }
  return at(lo);
}

// ---- the generator -----------------------------------------------------------------------------------------------

/**
 * @param {{ bg: string, accent: string, surface?: string, raisedSurface?: string, controlSurface?: string,
 *   success?: string, warning?: string, danger?: string, info?: string }} seeds
 * @param {{ mode?: 'light'|'dark', name?: string|null }} [options]
 */
export function generatePalette(seeds, options = {}) {
  if (!seeds || typeof seeds !== 'object') throw new ThemeInputError('bg', '--bg and --accent are required');
  for (const k of Object.keys(seeds)) {
    if (!Object.prototype.hasOwnProperty.call(SEED_FIELDS, k)) throw new ThemeInputError(k, 'unknown seed');
  }
  const mode = options.mode === undefined ? 'light' : options.mode;
  if (mode !== 'light' && mode !== 'dark') throw new ThemeInputError('mode', '--mode: light or dark');
  const name = options.name === undefined || options.name === null ? null : checkThemeName(options.name);
  if (seeds.bg === undefined) throw new ThemeInputError('bg', '--bg is required');
  if (seeds.accent === undefined) throw new ThemeInputError('accent', '--accent is required');
  const S = {};
  for (const k of Object.keys(SEED_FIELDS)) if (seeds[k] !== undefined) S[k] = q(parseSeed(k, seeds[k]));

  const bg = S.bg;
  const scheme = contrast(BLACK, bg) >= contrast(WHITE, bg) ? 'light' : 'dark';
  const pole = scheme === 'light' ? BLACK : WHITE;
  const antipole = scheme === 'light' ? WHITE : BLACK;
  const prefer = scheme === 'light' ? 'dark' : 'light';
  const away = prefer === 'dark' ? 'light' : 'dark';

  /*
   * Derived fills never push a background into the ink's dead band: every colour the generator DERIVES (surface step,
   * hover / fill / secondary composites, status tints) keeps the scheme pole ≥ text + margin on it, as long as the
   * site's own colour under it does. A pole composite that would have to fade below half its design alpha flips to
   * the other pole instead (a darker hover on a light-ish dark theme) — the affordance stays visible. The site's
   * background is never touched (QĐ10).
   */
  const SAFE = GATE.text + DESIGN.margin;
  /** A derived colour on `base` keeps the scheme pole at least this readable (never worse than `base` itself). */
  const floorOn = (base) => Math.min(SAFE, contrast(pole, base)) - 1e-12;
  const safeOn = (c, base) => contrast(pole, c) >= floorOn(base);
  /** `top` at alpha `a` over `base`, alpha reduced (or, with `flip`, the other pole) so the result stays safe. */
  const shade = (top, a, base, flip = false) => {
    const c = over(alpha(top, a), base);
    if (safeOn(c, base)) return q(c);
    let lo = 0;
    let hi = a;
    for (let i = 0; i < 24; i++) {
      const m = (lo + hi) / 2;
      if (safeOn(over(alpha(top, m), base), base)) lo = m; else hi = m;
    }
    if (flip && lo < a / 2) return q(over(alpha(antipole, a), base));
    return q(over(alpha(top, lo), base));
  };

  /** @type {Map<string, object|string>} */
  const V = new Map();
  /** @type {Array<{ token: string, against: string[], min: number, kind: string, fg: () => object, bgs: object[] }>} */
  const constraints = [];
  const diagnostics = [];
  const flags = new Map(); // token → { unsat, miss, reduced }
  const named = (n) => ({ name: n, color: V.get(n) });
  const comp = (topName, baseName) => ({ name: `${topName} over ${baseName}`, color: over(V.get(topName), V.get(baseName)) });
  /** A stack of translucent layers over an opaque base (`stack(top, …, base)`), as the component CSS paints it. */
  const stack = (...names) => {
    let color = V.get(names[names.length - 1]);
    for (let i = names.length - 2; i >= 0; i--) color = over(V.get(names[i]), color);
    return { name: names.join(' over '), color };
  };
  const need = (token, bgs, min, kind) => constraints.push({ token, against: bgs.map((b) => b.name), min, kind, bgs });

  /** Solve `token` against `bgs`: aims at each of `mins` in turn (first feasible wins), records the gate. */
  const ink = (token, start, bgs, mins, gate, kind, dir = prefer) => {
    let r = null;
    for (const m of mins) {
      r = solveInk({ start, bgs, min: m, prefer: dir });
      if (!r.unsat && !r.miss) break;
    }
    V.set(token, r.color);
    flags.set(token, r);
    if (gate) need(token, bgs, gate, kind);
    return r.color;
  };
  const textMins = (g) => [g + DESIGN.margin, g];

  // ---- surfaces (owner 1: one step lighter; raised = surface unless seeded; control = raised unless seeded) ----
  const bgL = srgbToOklch(bg);
  V.set('--td-color-bg', bg);
  let surfaceStep = DESIGN.surfaceStep;
  if (!S.surface) {
    // one step lighter (owner 1) — shortened where "lighter" would cross into the dead band (dark scheme only)
    let lo = 0;
    let hi = surfaceStep;
    if (!safeOn(q(atL(bgL, bgL.l + hi).rgb), bg)) {
      for (let i = 0; i < 24; i++) {
        const m = (lo + hi) / 2;
        if (safeOn(q(atL(bgL, bgL.l + m).rgb), bg)) lo = m; else hi = m;
      }
      surfaceStep = lo;
    }
  }
  V.set('--td-color-surface', S.surface || q(atL(bgL, bgL.l + surfaceStep).rgb));
  V.set('--td-color-surface-raised', S.raisedSurface || V.get('--td-color-surface'));
  V.set('--td-color-surface-muted', mid(bg, V.get('--td-color-surface')));
  V.set('--td-control-bg', S.controlSurface || V.get('--td-color-surface-raised'));
  V.set('--td-glass-solid', V.get('--td-color-surface-raised'));
  V.set('--td-glass-bg', alpha(V.get('--td-color-surface-raised'), DESIGN.glassAlpha[0]));
  V.set('--td-glass-bg-strong', alpha(V.get('--td-color-surface-raised'), DESIGN.glassAlpha[1]));
  const surface = V.get('--td-color-surface');
  const surfaces = ['--td-color-bg', '--td-color-surface', '--td-color-surface-muted', '--td-color-surface-raised', '--td-control-bg'].map(named);

  // ---- interaction fills (pole composites; one direction for the translucent hover family) ----
  V.set('--td-color-fill', shade(pole, DESIGN.fill[scheme], surface, true));
  V.set('--td-color-fill-strong', shade(pole, DESIGN.fillStrong[scheme], V.get('--td-control-bg'), true));
  {
    let a = Infinity;
    // round 2: the washes also land on the neutral fills (filter-chip remove pressed over --td-color-fill)
    for (const base of [...surfaces.map((x) => x.color), V.get('--td-color-fill'), V.get('--td-color-fill-strong')]) {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 24; i++) {
        const m = (lo + hi) / 2;
        if (safeOn(over(alpha(pole, m), base), base)) lo = m; else hi = m;
      }
      a = Math.min(a, lo);
    }
    // the strongest stack the kit paints with this family: a pressed tab over the hover trough (tabs.css)
    const stacked = (k) => 1 - (1 - DESIGN.hover[2] * k) * (1 - DESIGN.hover[0] * k);
    let k = 1;
    if (stacked(1) > a) {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (stacked(m) <= a) lo = m; else hi = m; }
      k = lo;
    }
    const ink0 = k >= 0.5 ? pole : antipole;
    if (k < 0.5) k = 1;
    const pct = (x) => Math.floor(x * k * 100) / 100;
    V.set('--td-color-hover', alpha(ink0, pct(DESIGN.hover[0])));
    V.set('--td-color-hover-strong', alpha(ink0, pct(DESIGN.hover[1])));
    V.set('--td-color-pressed', alpha(ink0, pct(DESIGN.hover[2])));
  }
  V.set('--td-color-skeleton', q(over(alpha(pole, DESIGN.skeleton), surface)));
  V.set('--td-btn-secondary-hover', shade(pole, DESIGN.secondary[0], surface, true));
  V.set('--td-btn-secondary-pressed', shade(pole, DESIGN.secondary[1], surface, true));
  V.set('--td-btn-secondary-border', alpha(pole, DESIGN.secondaryBorder));
  V.set('--td-btn-disabled-bg', q(over(alpha(pole, DESIGN.disabled[0]), surface)));
  V.set('--td-btn-disabled-border', q(over(alpha(pole, DESIGN.disabled[1]), surface)));
  V.set('--td-hairline', alpha(pole, DESIGN.hairline[scheme]));
  V.set('--td-glass-border', alpha(pole, DESIGN.glassBorder[scheme]));
  const hovers = ['--td-color-surface', '--td-color-surface-muted', '--td-color-surface-raised', '--td-control-bg', '--td-color-bg']
    .map((s) => comp('--td-color-hover-strong', s));
  const glassOver = ['--td-color-bg', '--td-color-surface'].map((s) => comp('--td-glass-bg-strong', s));

  // ---- status inks, pastels, alert tints ----
  const STATUS = [['success', 'success', 'success'], ['warning', 'warning', 'warning'], ['error', 'danger', 'danger'], ['info', 'info', 'info']];
  const alertBgs = [];
  /** the background set each status ink was solved on (round 2: derived pairs are registered on top of it) */
  const statusSets = {};
  for (const [color, seedKey, role] of STATUS) {
    const seed = S[seedKey] || q(parseSeed(seedKey, STATUS_DEFAULTS[scheme][seedKey]));
    const token = `--td-color-${color}`;
    // every surface + the popups (hovercard error line) + for the error colour the pressed link of the form summary
    const statusBgs0 = [...surfaces, ...glassOver, ...(color === 'error' ? [comp('--td-color-pressed', '--td-color-surface')] : [])];
    const c = ink(token, srgbToOklch(seed), statusBgs0, textMins(GATE.text), GATE.text, 'text');
    statusSets[token] = statusBgs0;
    const [pf, pb] = DESIGN.pastel[scheme];
    const [af, ab] = DESIGN.alert[scheme];
    V.set(`--td-pastel-${role}-bg`, shade(c, pf, surface));
    V.set(`--td-pastel-${role}-border`, shade(c, pb, surface));
    V.set(`--td-alert-${role}-bg`, shade(c, af, surface));
    V.set(`--td-alert-${role}-border`, q(over(alpha(c, ab), surface)));
    alertBgs.push(named(`--td-alert-${role}-bg`));
    ink(`--td-pastel-${role}-fg`, srgbToOklch(c),
      [named(`--td-pastel-${role}-bg`), named(`--td-pastel-${role}-border`), named(`--td-alert-${role}-bg`)],
      textMins(GATE.text), GATE.text, 'text');
    ink(`--td-alert-${role}-icon`, srgbToOklch(c), [named(`--td-alert-${role}-bg`)], textMins(GATE.icon), GATE.icon, 'icon');
  }
  const statusTokens = STATUS.map(([c]) => `--td-color-${c}`);
  {
    const fgCandidates = scheme === 'light' ? [WHITE] : [bg, BLACK];
    const statusBgs = statusTokens.map(named);
    const pick = fgCandidates.find((c) => minRatio(c, statusBgs) >= GATE.text + DESIGN.margin) || bestPole(statusBgs, away);
    V.set('--td-color-on-status', q(pick));
    for (const t of statusTokens) constraints.push({ token: '--td-color-on-status', against: [t], min: GATE.text, kind: 'text', bgs: [named(t)] });
  }

  // ---- ink: text, muted, label, subtle ----
  const fills = ['--td-color-fill', '--td-color-fill-strong', '--td-btn-secondary-hover', '--td-btn-secondary-pressed'].map(named);
  // round 2 (ISSUE-6): the filter-chip remove button paints the chip text on hover-strong / pressed over the chip fill
  const fillWashes = ['--td-color-hover-strong', '--td-color-pressed'].map((w) => comp(w, '--td-color-fill'));
  const textBgs = [...surfaces, ...fills, ...fillWashes, ...hovers, ...glassOver, ...alertBgs];
  {
    // near the pole, tinted, ≥ 7 where possible; where 7 is out of reach the pole itself (the strongest ink — keeps
    // text ≥ label ≥ muted on every background)
    let r = solveInk({ start: tinted(surface, DESIGN.textL[scheme]), bgs: textBgs, min: GATE.preferred, prefer });
    if (r.unsat) {
      for (const m of textMins(GATE.text)) {
        r = solveInk({ start: srgbToOklch(pole), bgs: textBgs, min: m, prefer });
        if (!r.unsat) break;
      }
    }
    V.set('--td-color-text', r.color);
    flags.set('--td-color-text', r);
    need('--td-color-text', textBgs, GATE.text, 'text');
  }
  const text = V.get('--td-color-text');
  // muted: every surface + the hover-strong composites on the surfaces it sits on (not on the bare page: that
  // composite is the darkest in a light theme and would darken muted text everywhere)
  // + the tab trough on the page (tabs.css: --td-tabs-bg = hover; the idle tab label is muted)
  const mutedBgs = [...surfaces, ...hovers.slice(0, 4), comp('--td-color-hover', '--td-color-bg'), ...glassOver];
  const muted = ink('--td-color-text-muted', tinted(surface, bgL.l), mutedBgs, textMins(GATE.text), GATE.text, 'text');
  ink('--td-color-text-label', srgbToOklch(mid(text, muted)), mutedBgs, textMins(GATE.text), GATE.text, 'text');
  ink('--td-color-text-subtle', tinted(surface, bgL.l), surfaces, textMins(GATE.icon), GATE.icon, 'icon');
  V.set('--td-control-fg', text);
  V.set('--td-glass-fg', text);
  ink('--td-color-on-fill', srgbToOklch(V.get('--td-color-text-label')), [named('--td-color-fill'), named('--td-color-fill-strong')],
    textMins(GATE.text), GATE.text, 'text');

  // ---- structure ----
  const surfStart = srgbToOklch(surface);
  ink('--td-color-border', surfStart, [named('--td-color-surface')], [DESIGN.border], 0, 'decorative');
  ink('--td-color-border-strong', surfStart, [named('--td-color-surface')], [DESIGN.borderStrong], 0, 'decorative');
  V.set('--td-control-border', V.get('--td-color-border-strong'));
  const ctrlStart = srgbToOklch(V.get('--td-control-bg'));
  const edgeBgs = [...surfaces, named('--td-color-fill')];
  if (scheme === 'light') {
    ink('--td-control-border-strong', surfStart, edgeBgs, textMins(GATE.nonText), GATE.nonText, 'non-text');
    ink('--td-control-border-soft', ctrlStart, ['--td-control-bg', '--td-color-surface', '--td-color-surface-raised'].map(named),
      [DESIGN.softLight], 0, 'decorative');
    ink('--td-control-border-hover', ctrlStart, [named('--td-control-bg')], [DESIGN.hoverLight], 0, 'decorative');
  } else {
    // QĐ7: dark control edges ≥ 3:1 against every adjacent colour; hover one step further; the strict edge = hover
    const soft = ink('--td-control-border-soft', ctrlStart, edgeBgs, textMins(GATE.nonText), GATE.nonText, 'non-text');
    const softRatio = minRatio(soft, edgeBgs);
    let hover = soft;
    for (const m of [softRatio * 1.35, softRatio * 1.15]) {
      const r = solveInk({ start: srgbToOklch(soft), bgs: edgeBgs, min: m, prefer });
      if (!r.unsat && !r.miss) { hover = r.color; break; }
    }
    V.set('--td-control-border-hover', hover);
    V.set('--td-control-border-strong', V.get('--td-control-border-hover'));
    need('--td-control-border-strong', edgeBgs, GATE.nonText, 'non-text');
  }

  // ---- accent: ink / mark / fill (QĐ: ink ≥ 4.7 on every surface, white-or-black on the fill ≥ 4.7) ----
  const accentSeed = S.accent;
  // every surface + the popups (hovercard link: glass over the page)
  const accentInk = ink('--td-accent', srgbToOklch(accentSeed), [...surfaces, ...glassOver], textMins(GATE.text), GATE.text, 'text');
  // the check mark on the accent ink (and the label on the fill): white when it reads (≥ 3:1 + margin, the kit's
  // convention), else whichever pole is stronger
  const markPole = contrast(WHITE, accentInk) >= GATE.nonText + DESIGN.margin
    || contrast(WHITE, accentInk) >= contrast(BLACK, accentInk) ? WHITE : BLACK;
  V.set('--td-accent-contrast', markPole);
  constraints.push({ token: '--td-accent-contrast', against: ['--td-accent'], min: GATE.nonText, kind: 'non-text', bgs: [named('--td-accent')] });
  const fill = solveInk({ start: srgbToOklch(accentSeed), bgs: [{ name: '--td-accent-contrast', color: markPole }],
    min: GATE.text + DESIGN.margin, prefer: markPole === WHITE ? 'dark' : 'light' });
  V.set('--td-accent-fill', fill.color);
  flags.set('--td-accent-fill', fill);
  constraints.push({ token: '--td-accent-contrast', against: ['--td-accent-fill'], min: GATE.text, kind: 'text', bgs: [named('--td-accent-fill')] });
  ink('--td-focus', srgbToOklch(accentSeed), surfaces, [GATE.nonText + 0.3, ...textMins(GATE.nonText)], GATE.nonText, 'non-text');
  V.set('--td-focus-ring', FOCUS_RING);

  // ---- buttons ----
  V.set('--td-btn-primary-bg', text);
  const primaryFg = contrast(WHITE, text) >= contrast(BLACK, text) ? WHITE : BLACK;
  V.set('--td-btn-primary-fg', primaryFg);
  const fgOk = (c) => contrast(primaryFg, c) >= GATE.text + DESIGN.margin;
  const towardPage = luminance(bg) > luminance(text) ? 1 : 0;
  V.set('--td-btn-primary-hover', step(text, DESIGN.primaryStep[0], towardPage, fgOk));
  V.set('--td-btn-primary-pressed', step(text, DESIGN.primaryStep[1], towardPage, fgOk));
  for (const t of ['--td-btn-primary-bg', '--td-btn-primary-hover', '--td-btn-primary-pressed']) {
    constraints.push({ token: '--td-btn-primary-fg', against: [t], min: GATE.text, kind: 'text', bgs: [named(t)] });
  }
  // v0.52.0 (ALGORITHM_VERSION 4): + the hover trough over the page — a disabled td-choice-group segment paints
  // --td-btn-disabled-fg on --td-color-hover over the page / surface (choice-group.css), ≥ the disabled gate there too
  const troughs = ['--td-color-bg', '--td-color-surface'].map((s) => comp('--td-color-hover', s));
  ink('--td-btn-disabled-fg', tinted(surface, srgbToOklch(V.get('--td-btn-disabled-bg')).l), [named('--td-btn-disabled-bg'), ...troughs],
    [DESIGN.disabledInk, GATE.disabled], GATE.disabled, 'disabled');

  // ---- elevation / tooltip ----
  for (const [k, v] of Object.entries({ ...SCHEME_SHADOWS[scheme], ...SCHEME_EXTRAS[scheme] })) V.set(k, v);
  if (scheme === 'light') {
    V.set('--td-tooltip-bg', text);
    V.set('--td-tooltip-border', 'transparent');
  } else {
    // a lighter chip (kit dark), or a darker one where white text would not read on the lighter one
    const chipBgs = [named('--td-color-bg'), named('--td-color-surface')];
    let r = solveInk({ start: srgbToOklch(surface), bgs: chipBgs, min: DESIGN.tooltipStepDark, prefer: 'light' });
    if (r.unsat || contrast(WHITE, r.color) < SAFE) {
      r = solveInk({ start: srgbToOklch(surface), bgs: chipBgs, min: DESIGN.tooltipStepDark, prefer: 'dark' });
    }
    V.set('--td-tooltip-bg', r.color);
    V.set('--td-tooltip-border', alpha(WHITE, 0.16));
  }
  const tipBg = V.get('--td-tooltip-bg');
  V.set('--td-tooltip-fg', contrast(WHITE, tipBg) >= contrast(BLACK, tipBg) ? WHITE : BLACK);
  constraints.push({ token: '--td-tooltip-fg', against: ['--td-tooltip-bg'], min: GATE.text, kind: 'text', bgs: [named('--td-tooltip-bg')] });

  // ---- scheme-dependent component tokens (impl review ISSUE-1; tokens.js SCHEME_TOKENS) ----
  // Static values computed for THIS palette's surfaces (no color-mix() path), serialized after the contract, so a
  // dark-scheme palette in the base slot / under a name gets them although no kit dark rule applies there.
  {
    const isLight = scheme === 'light';
    const ctrl = V.get('--td-control-bg');
    const muted = V.get('--td-color-surface-muted');
    const accent = V.get('--td-accent');
    const warn = V.get('--td-color-warning');
    const err = V.get('--td-color-error');
    const focus = V.get('--td-focus');
    /** largest alpha ≤ a of `c` over `base` that keeps the result safe for the ink (and `extra(composite)`) */
    const alphaKeep = (c, a, base, extra = () => true) => {
      const ok = (x) => { const k = over(alpha(c, x), base); return safeOn(k, base) && extra(k, x); };
      if (ok(a)) return a;
      let lo = 0;
      let hi = a;
      for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
      return Math.floor(lo * 1000) / 1000;
    };
    const tintKeep = (c, a, base, fg) => q(over(alpha(c, alphaKeep(c, a, base, (k) => contrast(fg, k) >= SAFE)), base));
    const set = (n, v) => V.set(n, v);
    const pct = (x) => Math.floor(x * 100 + 1e-9) / 100; // never round an alpha UP past what was checked
    set('--td-field-bg-disabled', isLight ? V.get('--td-color-fill') : muted);
    set('--td-field-focus', focus);
    set('--td-field-focus-ring', `0 0 0 3px ${toCss(alpha(focus, isLight ? 0.12 : 0.22))}`);
    set('--td-action-btn-warning-fg', warn);
    set('--td-action-btn-warning-hover-bg', tintKeep(warn, isLight ? 0.08 : 0.14, surface, warn));
    set('--td-action-btn-warning-pressed-bg', q(over(alpha(warn, alphaKeep(warn, isLight ? 0.16 : 0.26, surface)), surface)));
    ink('--td-action-btn-warning-pressed-fg', srgbToOklch(warn), [named('--td-action-btn-warning-pressed-bg')],
      textMins(GATE.text), GATE.text, 'text');
    set('--td-action-btn-danger-fg', err);
    set('--td-action-btn-danger-hover-bg', tintKeep(err, isLight ? 0.1 : 0.18, surface, err));
    set('--td-action-btn-danger-pressed-bg', tintKeep(err, isLight ? 0.16 : 0.3, surface, err));
    for (const [fg, bgs] of [['--td-action-btn-warning-fg', ['--td-action-btn-warning-hover-bg']],
      ['--td-action-btn-danger-fg', ['--td-action-btn-danger-hover-bg', '--td-action-btn-danger-pressed-bg']]]) {
      // with the surfaces the status ink was solved against: a derived state is never claimed on its own when the
      // ink already cannot read on its base (seed conflict / dead band)
      need(fg, [...surfaces, ...bgs.map(named)], GATE.text, 'text');
    }
    // ghost button label on its hover AND pressed fill (button.css: same label), over the page, the surface, a popup
    const BASES = ['--td-color-bg', '--td-color-surface', '--td-color-surface-raised'];
    const ghostBgs = ['--td-color-hover', '--td-color-pressed'].flatMap((w) => BASES.map((b) => comp(w, b)));
    const ghost = ink('--td-btn-ghost-hover-fg', srgbToOklch(accent), ghostBgs, textMins(GATE.text), GATE.text, 'text');
    set('--td-btn-ghost-hover-fg-fallback', ghost);
    set('--td-slider-track', q(over(alpha(pole, isLight ? 0.105 : 0.12), surface)));
    set('--td-slider-disabled', q(over(alpha(pole, isLight ? 0.37 : 0.27), surface)));
    const pressedA = V.get('--td-color-pressed');
    const hoverA = V.get('--td-color-hover');
    const textC = V.get('--td-color-text');
    const mutedC = V.get('--td-color-text-muted');
    const readsOn = (fg, ...layers) => { let k = layers[layers.length - 1]; for (let i = layers.length - 2; i >= 0; i--) k = over(layers[i], k); return contrast(fg, k) >= SAFE; };
    // tabs (tabs.css): pill over the trough (= hover) over the page / surface; the selected label (text) also pressed
    if (isLight) set('--td-tabs-pill', surface);
    else {
      let a = 0.14;
      for (const s of [bg, surface]) {
        a = Math.min(a, alphaKeep(pole, 0.14, over(hoverA, s), (k) => readsOn(textC, k) && readsOn(textC, pressedA, k)));
      }
      set('--td-tabs-pill', alpha(pole, Math.floor(a * 100) / 100));
    }
    set('--td-tabs-pill-shadow', isLight ? SCHEME_SHADOWS.light['--td-shadow-1'] : '0 1px 2px rgb(0 0 0 / 40%)');
    // dropdown "create" row: accent label on the popup and on the option hover / active / pressed fills
    const popupBgs = ['--td-color-bg', '--td-color-surface'].flatMap((s) => [stack('--td-glass-bg-strong', s),
      ...['--td-color-hover', '--td-color-hover-strong', '--td-color-pressed'].map((o) => stack(o, '--td-glass-bg-strong', s))]);
    const create = ink('--td-dropdown-create-fg', srgbToOklch(accent), popupBgs, textMins(GATE.text), GATE.text, 'text');
    set('--td-dropdown-create-fg-fallback', create);
    // table rows (table.css): zebra; selected; selected + hover / focus wash — text AND muted (card labels) readable
    const rowOk = (k) => readsOn(textC, k) && readsOn(mutedC, k);
    set('--td-table-zebra', alpha(pole, Math.floor(alphaKeep(pole, isLight ? 0.02 : 0.03, surface, rowOk) * 1000) / 1000));
    set('--td-table-row-selected', alpha(accent, pct(alphaKeep(accent, 0.08, surface, (k) => rowOk(k) && rowOk(over(hoverA, k))))));
    set('--td-table-edge-shadow', isLight ? 'rgb(0 0 0 / 14%)' : 'rgb(0 0 0 / 55%)');
    // form summary (form-validation.css): error-coloured text + its link pressed (--td-form-summary-pressed-bg = this
    // palette's --td-color-pressed, over the box; the box tint is clamped so the pressed link still reads)
    set('--td-form-summary-pressed-bg', pressedA);
    set('--td-form-summary-bg', q(over(alpha(err, alphaKeep(err, isLight ? 0.08 : 0.12, surface,
      (k) => readsOn(err, k) && readsOn(err, pressedA, k))), surface)));
    ink('--td-form-summary-border', srgbToOklch(err), [named('--td-color-surface'), named('--td-form-summary-bg')],
      textMins(GATE.nonText), GATE.nonText, 'non-text');
    set('--td-menu-separator', isLight ? V.get('--td-color-border') : alpha(pole, 0.12));
    // chip-input remove (chip-input.css): the chip text on the wash, and on the wash TWICE when pressed
    const fs = V.get('--td-color-fill-strong');
    set('--td-chip-remove-hover', alpha(pole, pct(alphaKeep(pole, isLight ? 0.08 : 0.16, fs,
      (k, x) => readsOn(textC, k) && readsOn(textC, alpha(pole, x), k)))));
    set('--td-hovercard-error-fg', err);
    set('--td-hovercard-link-fg', accent);
    set('--td-dropzone-bg-active', q(over(alpha(accent, alphaKeep(accent, 0.06, ctrl,
      (k) => contrast(V.get('--td-color-text-muted'), k) >= SAFE && contrast(accent, k) >= GATE.nonText + DESIGN.margin)), ctrl)));
    // pressed zone: a pole step over the field fill, the muted sub-line still readable on it
    set('--td-dropzone-bg-pressed', q(over(alpha(pole, alphaKeep(pole, isLight ? 0.045 : 0.08, ctrl,
      (k) => contrast(V.get('--td-color-text-muted'), k) >= SAFE && contrast(accent, k) >= GATE.nonText + DESIGN.margin)), ctrl)));
    need('--td-color-text-muted', [...mutedBgs, ...['--td-dropzone-bg-active', '--td-dropzone-bg-pressed'].map(named)], GATE.text, 'text');
    set('--td-badge-accent-bg', shade(accent, isLight ? 0.14 : 0.26, surface));
    ink('--td-badge-accent-fg', srgbToOklch(accent), [named('--td-badge-accent-bg')], textMins(GATE.text), GATE.text, 'text');
    set('--td-badge-success-ink', V.get('--td-color-success'));
    set('--td-badge-warning-ink', warn);
    set('--td-badge-danger-ink', err);
    set('--td-badge-info-ink', V.get('--td-color-info'));
    // filter chips (filter-chips.css): the remove × rests in this colour on the chip fill
    ink('--td-filter-chip-remove-fg', srgbToOklch(V.get(isLight ? '--td-color-text-label' : '--td-color-text-muted')),
      [named('--td-color-fill')], textMins(GATE.text), GATE.text, 'text');
    // v0.46.0 td-diff (diff.css): opaque cell tints — success / error over the surface, clamped so the value text, the
    // side labels and the muted notes ([ĐÃ ẨN], —, ⟨U+…⟩) still read on them
    const diffOk = (k) => readsOn(textC, k) && readsOn(mutedC, k) && readsOn(V.get('--td-color-text-label'), k);
    set('--td-diff-added-bg', q(over(alpha(V.get('--td-color-success'), alphaKeep(V.get('--td-color-success'), isLight ? 0.08 : 0.12, surface, diffOk)), surface)));
    set('--td-diff-removed-bg', q(over(alpha(err, alphaKeep(err, isLight ? 0.08 : 0.12, surface, diffOk)), surface)));

    // round 2: every rendered (foreground, background) pair of the component CSS is a registered constraint (the
    // fuzz checks the same pairs independently: test/tokens/rendered-pairs.js). Foregrounds solved against their own
    // set already carry it; the rest are registered with the base set the ink was solved on, so a dead band / seed
    // conflict reports the unsatisfiable base, never a false miss.
    const pageS = ['--td-color-bg', '--td-color-surface'];
    need('--td-color-error', [...statusSets['--td-color-error'], named('--td-form-summary-bg'), stack('--td-form-summary-pressed-bg', '--td-form-summary-bg'),
      ...pageS.map((s) => stack('--td-glass-bg-strong', s))], GATE.text, 'text');
    need('--td-color-text', [...textBgs, stack('--td-table-zebra', '--td-color-surface'), stack('--td-table-row-selected', '--td-color-surface'),
      stack('--td-color-hover', '--td-table-row-selected', '--td-color-surface'), stack('--td-chip-remove-hover', '--td-color-fill-strong'),
      stack('--td-chip-remove-hover', '--td-chip-remove-hover', '--td-color-fill-strong'),
      ...pageS.flatMap((s) => [stack('--td-color-hover', s), stack('--td-color-pressed', '--td-color-hover', s),
        stack('--td-tabs-pill', '--td-color-hover', s), stack('--td-color-pressed', '--td-tabs-pill', '--td-color-hover', s)])],
    GATE.text, 'text');
    need('--td-color-text-muted', [...mutedBgs, stack('--td-table-zebra', '--td-color-surface'),
      stack('--td-table-row-selected', '--td-color-surface'), stack('--td-color-hover', '--td-table-row-selected', '--td-color-surface')],
    GATE.text, 'text');
    // (disabled field text = muted on --td-field-bg-disabled ≥ 2.2: implied — the fill / muted surface is one wash off a
    // surface where muted already reads ≥ 4.7; the fuzz measures the rendered pair)
    // (the dropzone's accent edge ≥ 3 on its active / pressed fills is guaranteed by their alpha clamp above: at alpha 0
    // the fill is the control, where the accent already reads ≥ 4.7)
    need('--td-field-focus', surfaces, GATE.nonText, 'non-text');
    // v0.46.0 td-diff: text / label / muted on the two cell tints (registered with the base set each ink was solved on)
    const diffBgs = ['--td-diff-added-bg', '--td-diff-removed-bg'].map(named);
    need('--td-color-text', [...textBgs, ...diffBgs], GATE.text, 'text');
    need('--td-color-text-label', [...mutedBgs, ...diffBgs], GATE.text, 'text');
    need('--td-color-text-muted', [...mutedBgs, ...diffBgs], GATE.text, 'text');
    // components that paint an alias of a semantic colour carry the claim under their own name too
    need('--td-hovercard-link-fg', [...surfaces, ...glassOver], GATE.text, 'text');
    need('--td-hovercard-error-fg', statusSets['--td-color-error'], GATE.text, 'text');
    for (const [v, c] of [['success', 'success'], ['warning', 'warning'], ['danger', 'error'], ['info', 'info']]) {
      need(`--td-badge-${v}-ink`, statusSets[`--td-color-${c}`], GATE.text, 'text');
    }
  }

  // ---- diagnostics ----
  for (const c of constraints) {
    const fg = V.get(c.token);
    const ratio = minRatio(fg, c.bgs);
    if (ratio >= c.min) continue;
    const unsat = !usable(feasibleY(c.bgs.map((b) => luminance(b.color)), c.min)).length;
    const worst = c.bgs.find((b) => contrast(fg, b.color) === ratio).name;
    diagnostics.push({
      code: unsat ? 'TD_THEME_CONTRAST_UNSATISFIABLE' : 'TD_THEME_CONTRAST_MISS', severity: 'error-AA', token: c.token,
      against: c.against, worst, ratio: floor2(ratio), required: c.min,
    });
  }
  {
    const r = minRatio(text, textBgs);
    if (r < GATE.preferred) {
      diagnostics.push({ code: 'TD_THEME_PREFERRED_MISS', severity: 'info', token: '--td-color-text', against: textBgs.map((b) => b.name),
        worst: textBgs.find((b) => contrast(text, b.color) === r).name, ratio: floor2(r), required: GATE.preferred });
    }
  }
  for (const [token, seed] of [['--td-accent', accentSeed], ['--td-accent-fill', accentSeed]]) {
    if (toHex(V.get(token)) !== toHex(seed)) {
      diagnostics.push({ code: 'TD_THEME_ACCENT_ADJUSTED', severity: 'warn', token, against: [], ratio: null, required: null,
        from: toHex(seed), to: toHex(V.get(token)) });
    }
  }
  for (const token of ['--td-accent', '--td-accent-fill', ...statusTokens]) {
    if (flags.get(token)?.reduced) {
      diagnostics.push({ code: 'TD_THEME_GAMUT_REDUCED', severity: 'info', token, against: [], ratio: null, required: null });
    }
  }
  for (const token of ['--td-color-text', '--td-color-text-muted']) {
    diagnostics.push({ code: 'TD_THEME_APCA', severity: 'info', token, against: ['--td-color-surface'], ratio: null, required: null,
      lc: Math.round(apcaLc(V.get(token), surface) * 10) / 10 });
  }

  /** @type {Map<string, string>} */
  const tokens = new Map();
  for (const t of [...THEME_TOKENS, ...SCHEME_TOKENS]) {
    const v = V.get(t);
    if (v === undefined) throw new Error(`palette: ${t} not generated`); // internal (CLI exit 3)
    tokens.set(t, typeof v === 'string' ? v : toCss(v));
  }
  const seedsOut = {};
  for (const k of Object.keys(SEED_FIELDS)) if (S[k]) seedsOut[k] = toHex(S[k]);
  return {
    algorithm: ALGORITHM_VERSION, tokensVersion: THEME_TOKENS_VERSION, scheme, mode, name, seeds: seedsOut, tokens, diagnostics,
    constraints: constraints.map(({ token, against, min, kind }) => ({ token, against, min, kind })),
  };
}

/**
 * A built-in preset as a palette result (no solving — the kit's own values, owner decision), e.g. the kit dark values
 * under a site theme name. Scheme = the preset; diagnostics empty.
 * @param {'light'|'dark'} preset
 * @param {{ mode?: 'light'|'dark', name?: string|null }} [options] mode defaults to the preset
 */
export function presetPalette(preset, options = {}) {
  if (preset !== 'light' && preset !== 'dark') throw new ThemeInputError('preset', '--preset: light or dark');
  const mode = options.mode === undefined ? preset : options.mode;
  if (mode !== 'light' && mode !== 'dark') throw new ThemeInputError('mode', '--mode: light or dark');
  const name = options.name === undefined || options.name === null ? null : checkThemeName(options.name);
  const tokens = new Map([...THEME_TOKENS, ...SCHEME_TOKENS].map((t) => [t, PRESETS[preset][t]]));
  return { algorithm: ALGORITHM_VERSION, tokensVersion: THEME_TOKENS_VERSION, scheme: preset, mode, name, preset,
    seeds: {}, tokens, diagnostics: [], constraints: [] };
}

/** Derived tokens whose value equals their alias source (the serializer leaves them to the kit alias). */
export function redundantAliases(tokens) {
  return new Set(Object.entries(DERIVED_ALIASES).filter(([t, src]) => tokens.get(t) === tokens.get(src)).map(([t]) => t));
}

/** Whether a result carries a mandatory WCAG AA failure (CLI exit 1). */
export const hasAaFailure = (result) => result.diagnostics.some((d) => d.severity === 'error-AA');
