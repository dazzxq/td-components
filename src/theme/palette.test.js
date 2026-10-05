/* v0.42.0 R2-3 (plan N2): palette.js — golden palettes, dead-band boundaries (4.5 / 4.7 gate / 7), DESIGN steps, owner
 * decisions, hierarchy, determinism, presets = the kit's own values, and a seeded fuzz of ≥ 10 000 seed sets: every
 * token finite + in sRGB, every mandatory pair passes OR carries exactly the TD_THEME_CONTRAST_UNSATISFIABLE code, and
 * no "unsatisfiable" claim is false (an independent luminance grid search finds no colour that would pass).
 *
 * Golden update (after an intended algorithm change — bump ALGORITHM_VERSION too):
 *   TD_UPDATE_PALETTE_GOLDEN=1 node --test src/theme/palette.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  generatePalette, presetPalette, parseSeed, checkThemeName, feasibleY, GATE, DESIGN, ALGORITHM_VERSION, ThemeInputError,
} from './palette.js';
import { toCss, toJson } from './serialize.js';
import { parseColor, contrast, luminance, srgbToOklch, composite } from './color.js';
import { THEME_TOKENS, SCHEME_TOKENS } from './tokens.js';
import { PRESETS } from './presets.js';
import { renderedPairs, OPTION_TOKENS } from '../../test/tokens/rendered-pairs.js';

const PAIRS = renderedPairs();
/** Resolve a rendered pair against a palette token map: [fg colour, composited background]. */
function resolvePair(tokens, p) {
  const get = (n) => parseColor(tokens.get(OPTION_TOKENS[n] || n));
  let base = get(p.layers[p.layers.length - 1]);
  for (let i = p.layers.length - 2; i >= 0; i--) base = composite(get(p.layers[i]), base);
  return [get(p.fg), base];
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GOLDEN_FILE = join(ROOT, 'test', 'tokens', 'palette-golden.json');

const GOLDEN_SEEDS = {
  '135-white-surfaces': [{ bg: '#ece5d8', accent: '#b3261e', surface: '#fff' }, {}],
  '135-default-surfaces': [{ bg: '#ece5d8', accent: '#b3261e' }, {}],
  navy: [{ bg: '#16233a', accent: '#3b82f6' }, {}],
  'kit-dark-seeds': [{ bg: '#111113', accent: '#3b82f6' }, { mode: 'dark' }],
  'teal-light-named': [{ bg: '#f4faf9', accent: '#0f766e', controlSurface: '#fff' }, { name: 'teal' }],
  'dead-band-grey': [{ bg: '#767676', accent: '#b3261e' }, {}],
};

test('golden palettes (design constants locked; review in the builder before updating)', () => {
  const got = Object.fromEntries(Object.entries(GOLDEN_SEEDS).map(([k, [s, o]]) => [k, toJson(generatePalette(s, o))]));
  if (process.env.TD_UPDATE_PALETTE_GOLDEN) writeFileSync(GOLDEN_FILE, `${JSON.stringify({ algorithm: ALGORITHM_VERSION, palettes: got }, null, 1)}\n`);
  const golden = JSON.parse(readFileSync(GOLDEN_FILE, 'utf8'));
  assert.equal(golden.algorithm, ALGORITHM_VERSION, 'output changed → bump ALGORITHM_VERSION and regenerate the golden');
  assert.deepEqual(got, golden.palettes);
});

test('DESIGN steps: surface one OKLCH step lighter than bg; raised = surface; controlSurface #fff forces white', () => {
  assert.equal(DESIGN.surfaceStep, 0.04);
  const r = generatePalette({ bg: '#ece5d8', accent: '#b3261e' });
  const dl = srgbToOklch(parseColor(r.tokens.get('--td-color-surface'))).l - srgbToOklch(parseColor('#ece5d8')).l;
  assert.ok(Math.abs(dl - 0.04) < 0.006, `ΔL ${dl}`);
  assert.equal(r.tokens.get('--td-color-surface-raised'), r.tokens.get('--td-color-surface'), 'raised defaults to surface');
  assert.equal(r.tokens.get('--td-control-bg'), r.tokens.get('--td-color-surface'));
  const m = srgbToOklch(parseColor(r.tokens.get('--td-color-surface-muted'))).l;
  assert.ok(m > srgbToOklch(parseColor('#ece5d8')).l && m < srgbToOklch(parseColor(r.tokens.get('--td-color-surface'))).l, 'muted between bg and surface');
  const w = generatePalette({ bg: '#ece5d8', accent: '#b3261e', controlSurface: '#fff' });
  assert.equal(w.tokens.get('--td-control-bg'), '#ffffff');
  assert.notEqual(w.tokens.get('--td-color-surface-raised'), '#ffffff', 'only the control is forced');
  const raised = generatePalette({ bg: '#16233a', accent: '#3b82f6', raisedSurface: '#2a3c5c' });
  assert.equal(raised.tokens.get('--td-color-surface-raised'), '#2a3c5c');
  assert.equal(raised.tokens.get('--td-glass-solid'), '#2a3c5c');
});

test('dead band at the 4.7 gate (QĐ10): every grey background — unsatisfiable exactly inside (0.1734, 0.185), bg kept', () => {
  const lo = 1.05 / GATE.text - 0.05;
  const hi = GATE.text * 0.05 - 0.05;
  let inside = 0;
  for (let v = 0; v <= 255; v++) {
    const bg = `#${v.toString(16).padStart(2, '0').repeat(3)}`;
    const Y = luminance(parseColor(bg));
    const r = generatePalette({ bg, accent: '#2563eb' });
    assert.equal(r.tokens.get('--td-color-bg'), bg, 'the background is never changed');
    const textUnsat = r.diagnostics.some((d) => d.code === 'TD_THEME_CONTRAST_UNSATISFIABLE' && d.token === '--td-color-text');
    const dead = Y > lo && Y < hi;
    assert.equal(textUnsat, dead, `${bg} Y=${Y.toFixed(4)} dead=${dead}`);
    if (dead) {
      inside++;
      // the best pole is used
      const t = r.tokens.get('--td-color-text');
      assert.ok(t === '#000000' || t === '#ffffff', `${bg}: text ${t} is a pole`);
      assert.ok(contrast(t, bg) >= Math.max(contrast('#000', bg), contrast('#fff', bg)) - 1e-9);
    }
    assert.ok(!r.diagnostics.some((d) => d.code === 'TD_THEME_CONTRAST_MISS'), bg);
  }
  assert.ok(inside >= 3, `${inside} grey(s) in the dead band`);
});

test('dead band boundaries for 4.5 and 7 (feasible luminance sets)', () => {
  // 4.5: black works from Y 0.175, white up to Y 0.1833 — they overlap, every background has a 4.5 pole
  for (const Y of [0.17, 0.1749, 0.175, 0.179, 0.1833, 0.1834, 0.19]) assert.ok(feasibleY([Y], 4.5).length > 0, `4.5 @ ${Y}`);
  // 7: nothing between Y 0.10 and 0.30
  for (const Y of [0.0999, 0.3001, 0.05, 0.9]) assert.ok(feasibleY([Y], 7).length > 0, `7 outside @ ${Y}`);
  for (const Y of [0.1001, 0.15, 0.2, 0.2999]) assert.equal(feasibleY([Y], 7).length, 0, `7 inside @ ${Y}`);
  // the generator reports the preferred miss inside the 7 band, and not for a clearly light / dark page
  for (const bg of ['#7f7f7f', '#8a8a8a', '#6a6a6a']) {
    assert.ok(generatePalette({ bg, accent: '#2563eb' }).diagnostics.some((d) => d.code === 'TD_THEME_PREFERRED_MISS'), bg);
  }
  for (const bg of ['#ffffff', '#fbfbfa', '#111113', '#000000']) {
    assert.ok(!generatePalette({ bg, accent: '#2563eb' }).diagnostics.some((d) => d.code === 'TD_THEME_PREFERRED_MISS'), bg);
  }
});

test('determinism: two runs give identical CSS bytes and JSON', () => {
  for (const [s, o] of Object.values(GOLDEN_SEEDS)) {
    assert.equal(toCss(generatePalette(s, o)), toCss(generatePalette(s, o)));
    assert.deepEqual(toJson(generatePalette(s, o)), toJson(generatePalette(s, o)));
  }
});

test('presets = the kit values rendered by td.css (golden.json light / dark + v0.41 deltas)', () => {
  const g = JSON.parse(readFileSync(join(ROOT, 'test', 'tokens', 'golden.json'), 'utf8'));
  const norm = (v) => {
    const c = parseColor(v);
    return c ? [c.r, c.g, c.b].map((x) => Math.round(x * 255)).concat(Math.round(c.a * 100)).join(',') : v;
  };
  for (const mode of ['light', 'dark']) {
    const eff = { ...g[mode] };
    for (const [k, v] of Object.entries(g[`${mode}Deltas`] || {})) eff[k] = v.to;
    for (const [k, v] of Object.entries(g.added || {})) eff[k] = v[mode];
    for (const t of THEME_TOKENS) {
      assert.ok(typeof PRESETS[mode][t] === 'string', `${mode} ${t}`);
      if (!parseColor(PRESETS[mode][t])) continue; // shadows / ring: same strings as the CSS sources (serialize test)
      assert.equal(norm(PRESETS[mode][t]), norm(eff[t]), `${mode} ${t}`);
    }
  }
  const r = presetPalette('dark', { name: 'night' });
  assert.equal(r.scheme, 'dark');
  assert.equal(r.tokens.get('--td-color-bg'), '#111113');
  assert.deepEqual(r.diagnostics, []);
});

test('seed parsing is strict (hex / rgb only, opaque, capped) and never echoes the input', () => {
  assert.deepEqual(parseSeed('bg', '#fff'), { r: 1, g: 1, b: 1, a: 1 });
  assert.ok(parseSeed('bg', 'rgb(236, 229, 216)'));
  assert.ok(parseSeed('bg', 'rgb(236 229 216)'));
  for (const bad of ['', 'red', 'oklch(0.5 0.1 20)', 'color(srgb 1 0 0)', '#ffff', '#ffffff80', 'rgb(1 2 3 / 50%)',
    'rgba(1, 2, 3, 0.5)', 'rgb(1,2,3);}', '#fff */', '<b>', 'var(--x)', 'url(x)', `#${'a'.repeat(70)}`, '#fff; color: red']) {
    assert.throws(() => parseSeed('bg', bad), (e) => e instanceof ThemeInputError && !e.message.includes(bad.trim() || '\u0000'), JSON.stringify(bad));
  }
  assert.throws(() => parseSeed('bg', 42), ThemeInputError);
  assert.throws(() => generatePalette({ accent: '#000' }), ThemeInputError);
  assert.throws(() => generatePalette({ bg: '#fff' }), ThemeInputError);
  assert.throws(() => generatePalette({ bg: '#fff', accent: '#000', evil: '#000' }), ThemeInputError);
  assert.throws(() => generatePalette({ bg: '#fff', accent: '#000' }, { mode: 'auto' }), ThemeInputError);
  for (const ok of ['beige', 'brand-2', 'a']) assert.equal(checkThemeName(ok), ok);
  for (const bad of ['light', 'dark', 'auto', 'Beige', '2x', 'a"b', 'a]b', 'x'.repeat(33), '', 'a b', '-a']) {
    assert.throws(() => checkThemeName(bad), ThemeInputError, bad);
  }
});

// ---- fuzz --------------------------------------------------------------------------------------------------------

/** mulberry32 — deterministic, seedable. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Independent check of an "unsatisfiable" claim: max over a luminance grid of the minimum ratio stays below `min`. */
function trulyUnsat(bgs, min) {
  const ys = bgs.map((c) => luminance(c));
  for (let i = 0; i <= 4000; i++) {
    const Y = i / 4000;
    let m = Infinity;
    for (const yb of ys) m = Math.min(m, (Math.max(Y, yb) + 0.05) / (Math.min(Y, yb) + 0.05));
    if (m >= min + 0.02) return false;
  }
  return true;
}

/** Background colours of a constraint (`a over b` composites resolved from the token map). */
function bgColour(tokens, name) {
  const parts = name.split(' over ');
  let c = parseColor(tokens.get(parts[parts.length - 1]));
  for (let i = parts.length - 2; i >= 0; i--) c = composite(parseColor(tokens.get(parts[i])), c);
  return c;
}

test('fuzz: 10 000 seeded seed sets — finite in-gamut tokens, pass-or-exact-code, no false claims, hierarchy', () => {
  const N = Number(process.env.TD_PALETTE_FUZZ || 10000);
  const rand = rng(0x7d042);
  const hex = () => `#${[0, 0, 0].map(() => Math.floor(rand() * 256).toString(16).padStart(2, '0')).join('')}`;
  const t0 = Date.now();
  let unsatPalettes = 0;
  for (let i = 0; i < N; i++) {
    const seeds = { bg: hex(), accent: hex() };
    if (rand() < 0.15) seeds.surface = hex();
    if (rand() < 0.1) seeds.controlSurface = rand() < 0.5 ? '#fff' : hex();
    if (rand() < 0.1) seeds.success = hex();
    const mode = rand() < 0.3 ? 'dark' : 'light';
    const r = generatePalette(seeds, { mode });
    const tag = `#${i} ${JSON.stringify(seeds)} ${mode}`;
    for (const t of [...THEME_TOKENS, ...SCHEME_TOKENS]) {
      const v = r.tokens.get(t);
      if (SCHEME_TOKENS.includes(t)) assert.ok(!/var\(|color-mix/.test(String(v)), `${tag} ${t} static: ${v}`);
      assert.equal(typeof v, 'string', `${tag} ${t}`);
      if (/^#/.test(v)) assert.match(v, /^#[0-9a-f]{6}$/, `${tag} ${t}`);
      if (/^(#|rgb)/.test(v)) assert.ok(parseColor(v), `${tag} ${t} parses`);
      assert.ok(!/NaN|undefined|Infinity/.test(v), `${tag} ${t} = ${v}`);
    }
    assert.ok(!r.diagnostics.some((d) => d.code === 'TD_THEME_CONTRAST_MISS'), `${tag}: generator miss ${JSON.stringify(r.diagnostics.filter((d) => d.code === 'TD_THEME_CONTRAST_MISS'))}`);
    const errors = r.diagnostics.filter((d) => d.severity === 'error-AA');
    if (errors.length) unsatPalettes++;
    for (const c of r.constraints) {
      const fg = parseColor(r.tokens.get(c.token));
      const bgs = c.against.map((n) => bgColour(r.tokens, n));
      const ratio = Math.min(...bgs.map((b) => contrast(fg, b)));
      const claim = errors.filter((d) => d.token === c.token && d.against.join('|') === c.against.join('|'));
      if (ratio >= c.min) {
        assert.equal(claim.length, 0, `${tag}: ${c.token} passes (${ratio}) but is reported`);
      } else {
        assert.equal(claim.length, 1, `${tag}: ${c.token} ${ratio.toFixed(3)} < ${c.min} without exactly one code`);
        assert.equal(claim[0].code, 'TD_THEME_CONTRAST_UNSATISFIABLE');
        assert.ok(trulyUnsat(bgs, c.min), `${tag}: ${c.token} claimed unsatisfiable but a colour reaches ${c.min}`);
      }
    }
    // hierarchy text ≥ label ≥ muted ≥ subtle on every surface — also in the dead band (all fall back to the pole).
    // Not promised when the site's own surface seeds sit on opposite sides of the ink (reported as error-AA anyway).
    const conflict = (seeds.surface || seeds.controlSurface)
      && errors.some((d) => /^--td-color-text/.test(d.token));
    for (const s of conflict ? [] : ['--td-color-surface', '--td-color-bg', '--td-color-surface-muted']) {
      const on = (t) => contrast(r.tokens.get(t), r.tokens.get(s));
      const [tx, lb, mu, sb] = ['--td-color-text', '--td-color-text-label', '--td-color-text-muted', '--td-color-text-subtle'].map(on);
      assert.ok(tx >= lb - 1e-9 && lb >= mu - 1e-9 && mu >= sb - 1e-9, `${tag}: hierarchy on ${s}: ${tx} ${lb} ${mu} ${sb}`);
    }
    // round 2: every RENDERED pair of the component CSS passes, or its foreground carries an unsatisfiable code
    for (const p of PAIRS) {
      const [fg, bg] = resolvePair(r.tokens, p);
      const ratio = contrast(fg, bg);
      if (ratio >= p.min) continue;
      assert.ok(errors.some((d) => d.token === p.fg && d.code === 'TD_THEME_CONTRAST_UNSATISFIABLE'),
        `${tag}: rendered pair "${p.id}" ${ratio.toFixed(3)} < ${p.min} with no unsatisfiable code on ${p.fg}`);
    }
    // the site's colours are kept (QĐ10)
    assert.equal(r.tokens.get('--td-color-bg'), seeds.bg);
    if (seeds.surface) assert.equal(r.tokens.get('--td-color-surface'), seeds.surface);
    // dark control edges ≥ 3:1 or a code (QĐ7) — part of the constraints; check they exist
    if (r.scheme === 'dark') assert.ok(r.constraints.some((c) => c.token === '--td-control-border-soft' && c.min === GATE.nonText), tag);
  }
  const secs = (Date.now() - t0) / 1000;
  // Perf guard, not a correctness check: ~15 s on a dev machine; shared CI runners are ~5× slower (75 s seen on
  // GitHub Actions, run 37326386934), so CI gets a wider budget that still catches an order-of-magnitude regression.
  const budget = process.env.CI ? 150 : 30;
  assert.ok(secs < budget, `fuzz took ${secs}s (budget ${budget} s)`);
  assert.ok(unsatPalettes / N < 0.2, `${unsatPalettes}/${N} palettes with a mandatory failure`);
});

test('impl review ISSUE-1: every scheme-dependent component token is generated + serialized, in every slot', () => {
  for (const [seeds, opts] of [[{ bg: '#16233a', accent: '#3b82f6' }, {}], [{ bg: '#16233a', accent: '#3b82f6' }, { name: 'navy' }],
    [{ bg: '#16233a', accent: '#3b82f6' }, { mode: 'dark' }], [{ bg: '#ece5d8', accent: '#b3261e' }, {}]]) {
    const r = generatePalette(seeds, opts);
    const css = toCss(r);
    for (const t of SCHEME_TOKENS) {
      assert.ok(r.tokens.has(t), t);
      assert.ok(css.includes(`\t${t}: ${r.tokens.get(t)};`), `${t} serialized (${JSON.stringify(opts)})`);
    }
  }
  // a dark-scheme palette gets dark-scheme component values, never the kit's light literals
  const navy = generatePalette({ bg: '#16233a', accent: '#3b82f6' }, { name: 'navy' }).tokens;
  for (const t of ['--td-action-btn-warning-hover-bg', '--td-action-btn-danger-pressed-bg', '--td-slider-track', '--td-dropzone-bg-pressed',
    '--td-badge-accent-bg', '--td-form-summary-bg']) {
    assert.ok(contrast(navy.get(t), '#ffffff') > 4, `${t} = ${navy.get(t)} is a dark-scheme fill`);
  }
  for (const preset of ['light', 'dark']) for (const t of SCHEME_TOKENS) assert.equal(typeof PRESETS[preset][t], 'string', `${preset} ${t}`);
});

test('round 2: rendered pairs of the built-in presets — dark gated (v0.42.1), light reported (owner keeps built-in light)', () => {
  const lines = [];
  const darkMisses = [];
  for (const preset of ['light', 'dark']) {
    const tokens = new Map(Object.entries(PRESETS[preset]));
    for (const p of PAIRS) {
      const [fg, bg] = resolvePair(tokens, p);
      const ratio = contrast(fg, bg);
      if (!(ratio >= p.min)) (preset === 'dark' ? darkMisses : lines).push(`${preset}: ${p.id} ${ratio.toFixed(2)} < ${p.min}`);
    }
  }
  if (lines.length) console.log(`built-in light pairs below the rendered-pair gate (reported):\n  ${lines.join('\n  ')}`);
  assert.deepEqual(darkMisses, [], 'built-in dark (= --preset dark = kit dark) passes every rendered pair');
});
