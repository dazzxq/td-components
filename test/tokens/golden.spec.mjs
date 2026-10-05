#!/usr/bin/env node
/**
 * Golden token gate (v0.41.0, plan M0 / QĐ5). Every `--td-*` custom property declared in src/styles (read from the
 * sources, never a hand-kept list) is resolved in Chromium on `:root` and compared with test/tokens/golden.json —
 * captured on v0.40.0 BEFORE any theming change:
 *   - colour tokens → `color: var(--x)` on a probe (a sentinel parent colour detects "not a colour"), normalised through
 *     test/tokens/color-parse.js (`#fff`, `rgb(255 255 255)`, `color(srgb 1 1 1)` compare equal);
 *   - shadow tokens → `box-shadow: var(--x)` on the probe, colours normalised;
 *   - everything else → the computed custom-property value (var() substituted).
 * Modes: `light` = no data-td-theme (MUST equal the baseline — pixel-identical light), `dark` = data-td-theme="dark"
 * (equal to the baseline except the intended `darkDeltas`). New tokens must be listed in `added` with their light and
 * dark values. Consistency (same run): data-td-theme="light" = unset; "auto" under an OS light preference = unset;
 * "auto" under an OS dark preference = dark; root `color-scheme` per QĐ3 (unset → normal, light → light, dark → dark,
 * auto → light / dark by branch); unset / light under a dark OS preference = unset (no flip).
 *
 *   node test/tokens/golden.spec.mjs              (npm run test:golden)
 *   node test/tokens/golden.spec.mjs --capture    rewrite the light / dark baseline (keeps darkDeltas / added) —
 *                                                 only on an UNCHANGED baseline commit
 */
import { chromium } from 'playwright-core';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeColor, normalizeColorsIn } from './color-parse.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GOLDEN = join(ROOT, 'test', 'tokens', 'golden.json');
const ORIGIN = 'http://td-golden.test';
const CAPTURE = process.argv.includes('--capture');

/** Every public `--td-*` name declared in the td.css sources (comments stripped; `--_td-*` private are excluded). */
export async function declaredTokens() {
  const manifest = JSON.parse(await readFile(join(ROOT, 'src', 'styles', 'manifest.json'), 'utf8'));
  const names = new Set();
  for (const file of manifest.files) {
    const css = (await readFile(join(ROOT, 'src', 'styles', file), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/(?<![\w-])(--td-[a-z0-9-]+)\s*:/g)) names.add(m[1]);
  }
  return [...names].sort();
}

const TD_CSS = await readFile(join(ROOT, 'td.css'), 'utf8');
const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><link rel="stylesheet" href="${ORIGIN}/td.css"></head><body></body></html>`;

/** Resolve every token on :root in the current page state → { name: { kind, value } } + '@color-scheme'. */
async function snapshot(page, names) {
  const raw = await page.evaluate((list) => {
    const host = document.createElement('div');
    host.style.setProperty('color', 'rgb(1, 2, 3)'); // sentinel: an invalid var() makes the probe inherit it
    const p = document.createElement('span');
    host.appendChild(p);
    document.body.appendChild(host);
    const root = getComputedStyle(document.documentElement);
    const out = {};
    for (const name of list) {
      p.style.cssText = '';
      p.style.setProperty('color', `var(${name})`);
      const value = root.getPropertyValue(name).trim();
      const c = getComputedStyle(p).color;
      if (value && c !== 'rgb(1, 2, 3)') { out[name] = { kind: 'color', value: c }; continue; }
      p.style.cssText = '';
      p.style.setProperty('box-shadow', `var(${name})`);
      const sh = getComputedStyle(p).boxShadow;
      if (value && sh && sh !== 'none') { out[name] = { kind: 'shadow', value: sh }; continue; }
      out[name] = { kind: 'raw', value };
    }
    host.remove();
    out['@color-scheme'] = { kind: 'raw', value: root.colorScheme || root.getPropertyValue('color-scheme').trim() };
    return out;
  }, names);
  const flat = {};
  for (const [k, { kind, value }] of Object.entries(raw)) {
    flat[k] = kind === 'color' ? normalizeColor(value) : kind === 'shadow' ? normalizeColorsIn(value) : value.replace(/\s+/g, ' ');
  }
  return flat;
}

async function modeSnapshot(browser, names, theme, osScheme = 'light') {
  const context = await browser.newContext({ colorScheme: osScheme });
  const page = await context.newPage();
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/td.css') return route.fulfill({ status: 200, contentType: 'text/css', body: TD_CSS });
    return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE });
  });
  await page.goto(`${ORIGIN}/`);
  if (theme) await page.evaluate((t) => document.documentElement.setAttribute('data-td-theme', t), theme);
  const snap = await snapshot(page, names);
  await context.close();
  return snap;
}

const failures = [];
let checks = 0;
const check = (label, ok, detail = '') => { checks++; if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`); };

const names = await declaredTokens();
const browser = await chromium.launch();
let light; let dark; let lightAttr; let autoLight; let autoDark; let unsetOsDark; let lightOsDark;
try {
  light = await modeSnapshot(browser, names, null);
  dark = await modeSnapshot(browser, names, 'dark');
  if (!CAPTURE) {
    lightAttr = await modeSnapshot(browser, names, 'light');
    autoLight = await modeSnapshot(browser, names, 'auto', 'light');
    autoDark = await modeSnapshot(browser, names, 'auto', 'dark');
    unsetOsDark = await modeSnapshot(browser, names, null, 'dark');
    lightOsDark = await modeSnapshot(browser, names, 'light', 'dark');
  }
} finally {
  await browser.close();
}

let golden = { light: {}, dark: {}, added: {}, darkDeltas: {} };
try { golden = { ...golden, ...JSON.parse(await readFile(GOLDEN, 'utf8')) }; } catch { /* first capture */ }

if (CAPTURE) {
  const out = {
    $comment: 'v0.41.0 golden tokens (test/tokens/golden.spec.mjs). light / dark = the v0.40.0 baseline, captured before any theming change — never recapture on a changed tree. Intended dark changes: darkDeltas { name: { to, why } }. New tokens: added { name: { light, dark, why } }.',
    baseline: golden.baseline || 'v0.40.0',
    light, dark, added: golden.added, darkDeltas: golden.darkDeltas,
  };
  await writeFile(GOLDEN, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`golden.json captured: ${Object.keys(light).length} light + ${Object.keys(dark).length} dark values.`);
  process.exit(0);
}

const exceptScheme = (k) => k !== '@color-scheme';
for (const k of Object.keys(light)) {
  if (k in golden.light) {
    check(`light ${k} = baseline`, light[k] === golden.light[k], `${light[k]} (baseline ${golden.light[k]})`);
  } else {
    const a = golden.added[k];
    check(`light ${k} is a new token listed in golden.json "added"`, !!a, light[k]);
    if (a) check(`light ${k} = added.light`, light[k] === a.light, `${light[k]} vs ${a.light}`);
  }
  if (k in golden.dark && !(k in golden.added)) {
    const d = golden.darkDeltas[k];
    if (d) check(`dark ${k} = darkDeltas.to (${d.why})`, dark[k] === d.to, `${dark[k]} vs ${d.to}`);
    else check(`dark ${k} = baseline (not an intended delta)`, dark[k] === golden.dark[k], `${dark[k]} (baseline ${golden.dark[k]})`);
  } else if (golden.added[k]) {
    check(`dark ${k} = added.dark`, dark[k] === golden.added[k].dark, `${dark[k]} vs ${golden.added[k].dark}`);
  }
}
for (const k of Object.keys(golden.light)) check(`baseline token ${k} still declared`, k in light);
for (const k of Object.keys(golden.darkDeltas)) {
  check(`darkDelta ${k} really changes the dark value`, golden.dark[k] !== undefined && golden.darkDeltas[k].to !== golden.dark[k], k);
}
// consistency (QĐ3)
for (const k of Object.keys(light).filter(exceptScheme)) {
  check(`data-td-theme="light" ${k} = unset`, lightAttr[k] === light[k], `${lightAttr[k]} vs ${light[k]}`);
  check(`auto (OS light) ${k} = unset`, autoLight[k] === light[k], `${autoLight[k]} vs ${light[k]}`);
  check(`auto (OS dark) ${k} = dark`, autoDark[k] === dark[k], `${autoDark[k]} vs ${dark[k]}`);
  check(`unset under OS dark ${k} = unset (no flip)`, unsetOsDark[k] === light[k], `${unsetOsDark[k]} vs ${light[k]}`);
  check(`light under OS dark ${k} = unset (no flip)`, lightOsDark[k] === light[k], `${lightOsDark[k]} vs ${light[k]}`);
}
check('color-scheme unset = normal', light['@color-scheme'] === 'normal', light['@color-scheme']);
check('color-scheme unset under OS dark = normal', unsetOsDark['@color-scheme'] === 'normal', unsetOsDark['@color-scheme']);
check('color-scheme dark = dark', dark['@color-scheme'] === 'dark', dark['@color-scheme']);
check('color-scheme light = light', lightAttr['@color-scheme'] === 'light', lightAttr['@color-scheme']);
check('color-scheme light under OS dark = light', lightOsDark['@color-scheme'] === 'light', lightOsDark['@color-scheme']);
check('color-scheme auto (OS light) = light', autoLight['@color-scheme'] === 'light', autoLight['@color-scheme']);
check('color-scheme auto (OS dark) = dark', autoDark['@color-scheme'] === 'dark', autoDark['@color-scheme']);

const deltas = Object.keys(golden.darkDeltas).length;
if (failures.length) {
  console.log(`Golden tokens: ${failures.length} failure(s) of ${checks} checks`);
  for (const f of failures.slice(0, 80)) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`Golden tokens: all ${checks} checks passed (${names.length} tokens; light = v0.40 baseline, dark = baseline + ${deltas} intended deltas, ${Object.keys(golden.added).length} added).`);
