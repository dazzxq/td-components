// v0.62.0 (plan A, risk 1): the alert icon tile is color-mix(icon 12 %, bg) (src/styles/components/alert.css). The generator
// guarantees the icon on the alert FILL (palette.js: ink(--td-alert-{v}-icon) >= GATE.icon); the tile is a little further from
// the icon, so this seeded fuzz measures icon-on-TILE over generated palettes (kit presets included). Floor: WCAG non-text 3:1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePalette, presetPalette, GATE } from './index.js';
import { parseColor, contrast } from './color.js';

const MIX = 0.12;
const ROLES = ['info', 'success', 'warning', 'danger'];

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

/** sRGB-space mix like `color-mix(in srgb, icon 12%, bg)` (8-bit rounded, as the engines paint it). */
function tile(icon, bg) {
  const q = (v) => Math.round(v * 255) / 255;
  return { r: q(icon.r * MIX + bg.r * (1 - MIX)), g: q(icon.g * MIX + bg.g * (1 - MIX)), b: q(icon.b * MIX + bg.b * (1 - MIX)), a: 1 };
}

function worstOf(tokens) {
  let worst = Infinity;
  for (const v of ROLES) {
    const icon = parseColor(tokens.get(`--td-alert-${v}-icon`));
    const bg = parseColor(tokens.get(`--td-alert-${v}-bg`));
    worst = Math.min(worst, contrast(icon, tile(icon, bg)));
  }
  return worst;
}

test('the kit light / dark presets: icon on the tile >= 3:1', () => {
  for (const mode of ['light', 'dark']) {
    const p = presetPalette(mode);
    assert.ok(worstOf(p.tokens) >= GATE.nonText, `${mode} preset icon-on-tile ${worstOf(p.tokens).toFixed(2)}`);
  }
});

test('fuzz: generated palettes keep the icon >= 3:1 on the tile', () => {
  const N = Number(process.env.TD_ALERT_TILE_FUZZ || 3000);
  const rand = rng(0x62a1e47);
  const hex = () => `#${[0, 0, 0].map(() => Math.floor(rand() * 256).toString(16).padStart(2, '0')).join('')}`;
  let worst = Infinity;
  let bad = null;
  for (let i = 0; i < N; i++) {
    const seeds = { bg: hex(), accent: hex() };
    if (rand() < 0.2) seeds.danger = hex();
    if (rand() < 0.2) seeds.warning = hex();
    const mode = rand() < 0.4 ? 'dark' : 'light';
    const r = generatePalette(seeds, { mode });
    const w = worstOf(r.tokens);
    if (w < worst) { worst = w; bad = `${JSON.stringify(seeds)} ${mode}`; }
  }
  assert.ok(worst >= GATE.nonText, `worst icon-on-tile ${worst.toFixed(3)} (< ${GATE.nonText}) for ${bad} — lower --td-alert-tile-mix, or register the tile in palette.js (bump ALGORITHM_VERSION)`);
});
