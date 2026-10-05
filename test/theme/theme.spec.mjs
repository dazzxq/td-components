#!/usr/bin/env node
/**
 * v0.42.0 theme gate (plan N4 acceptance, R2-6 differential, R2-8 first paint) — `npm run test:theme`.
 *
 * (A) BUILDER FROM THE PACKED PACKAGE: `npm pack` → extracted to a temp folder → served by a plain node:http handler
 *     (files only: no Vite, no transform; CSP `default-src 'self'; style-src 'self'; script-src 'self';
 *     style-src-attr 'none'`) → src/theme/builder/theme-builder.html in Chromium / Firefox / WebKit:
 *       - differential: for each seed set the builder's CSS (textContent) === the PACKED CLI's stdout byte for byte, and
 *         the builder's JSON === toJson(generatePalette()) of the packed module === the CLI's --diagnostics=json;
 *       - the preview scope renders the palette and a popup opened from it is bridged (ADR 0020);
 *       - a dead-band palette: export disabled until "Xuất dù trượt AA", the download = `--allow-aa-failure` output;
 *       - a hostile seed is refused in place (no export); 0 CSP violations.
 *     TD_BUILDER_SHOTS=<dir>: screenshots (390 / 1280 × beige / navy / dead band, Chromium) for review.
 * (B) FIRST PAINT, JavaScript disabled, with a GENERATED file after td.css — light (base slot), dark (`data-td-theme`
 *     dark), auto under an OS dark preference, and a named scope: the first frame already has the generated page
 *     colour; CSP 'self' and nonce-only profiles.
 *
 *   node test/theme/theme.spec.mjs            TD_THEME_ENGINES=chromium (subset)   TD_THEME_PORT=8810
 */
import { chromium, firefox, webkit } from 'playwright-core';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname, normalize, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePng } from '../visual/png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENGINES = (process.env.TD_THEME_ENGINES || 'chromium,firefox,webkit').split(',').map((s) => s.trim());
const PORT = Number(process.env.TD_THEME_PORT || 8810);
const SHOTS = process.env.TD_BUILDER_SHOTS || '';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const CSP_SELF = "default-src 'self'; style-src 'self'; script-src 'self'; style-src-attr 'none'; img-src 'self' data: blob:";

const failures = [];
let checks = 0;
const check = (name, ok, detail = '') => { checks++; if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ''}`); };
const notes = [];

// ---- the packed package -------------------------------------------------------------------------------------------
const TMP = mkdtempSync(join(tmpdir(), 'td-theme-pack-'));
const pack = spawnSync('npm', ['pack', '--pack-destination', TMP, '--ignore-scripts', '--json'], { cwd: ROOT, encoding: 'utf8' });
if (pack.status !== 0) { console.error(pack.stderr); process.exit(1); }
const tarball = join(TMP, JSON.parse(pack.stdout)[0].filename);
const untar = spawnSync('tar', ['-xzf', tarball, '-C', TMP], { encoding: 'utf8' });
if (untar.status !== 0) { console.error(untar.stderr); process.exit(1); }
const PKG = join(TMP, 'package');
const { generatePalette, toCss, toJson } = await import(pathToFileURL(join(PKG, 'src', 'theme', 'index.js')).href);
const cli = (args) => spawnSync(process.execPath, [join(PKG, 'bin', 'td-theme.mjs'), ...args], { encoding: 'utf8' });

/** Extra files served next to the package (first-paint fixtures). */
const extra = new Map();
const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (extra.has(url.pathname)) {
    const e = extra.get(url.pathname);
    res.writeHead(200, { 'content-type': e.type, ...(e.headers || {}) });
    res.end(e.body);
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  const file = join(PKG, rel);
  if (!file.startsWith(PKG + sep) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  const type = MIME[extname(file)] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': type, ...(type.startsWith('text/html') ? { 'content-security-policy': CSP_SELF } : {}) });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${PORT}`;

async function launchOptions(name, launcher) {
  if (existsSync(launcher.executablePath())) return {};
  const env = { firefox: process.env.TD_FIREFOX_PATH, webkit: process.env.TD_WEBKIT_PATH }[name];
  if (env) return { executablePath: env };
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const rel = { firefox: 'firefox/Nightly.app/Contents/MacOS/firefox', webkit: 'pw_run.sh' }[name];
  if (!rel || !existsSync(cache)) return {};
  const dirs = readdirSync(cache).filter((d) => d.startsWith(`${name}-`)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const exe = join(cache, d, rel);
    if (existsSync(exe)) { notes.push(`${name}: using cached build ${d}`); return { executablePath: exe }; }
  }
  return {};
}

const CASES = [
  { id: 'beige', seeds: { bg: '#ece5d8', accent: '#b3261e', surface: '#fff' }, args: ['--bg', '#ece5d8', '--accent', '#b3261e', '--surface', '#fff'] },
  { id: 'navy', seeds: { bg: '#16233a', accent: '#3b82f6' }, mode: 'dark', name: 'navy', args: ['--bg', '#16233a', '--accent', '#3b82f6', '--mode', 'dark', '--name', 'navy'] },
  { id: 'dead-band', seeds: { bg: '#777777', accent: '#b3261e' }, args: ['--bg', '#777777', '--accent', '#b3261e'], failing: true },
];
const FIELDS = { bg: 'bg', accent: 'accent', surface: 'surface', raisedSurface: 'raisedSurface', controlSurface: 'controlSurface' };

async function openBuilder(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const violations = [];
  await page.exposeBinding('__cspViolation', (_s, v) => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => window.__cspViolation(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${ORIGIN}/src/theme/builder/theme-builder.html`);
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-tb-ready'), null, { timeout: 15000 });
  return { context, page, violations, errors };
}

async function fillCase(page, c) {
  for (const k of ['bg', 'accent', 'surface', 'raisedSurface', 'controlSurface']) {
    await page.fill(`#tb-${FIELDS[k]}`, c.seeds[k] || '');
  }
  await page.selectOption('#tb-mode', c.mode || 'light');
  await page.fill('#tb-name', c.name || '');
}

const text = (page, sel) => page.evaluate((s) => document.querySelector(s).textContent, sel);

async function builderEngine(name, launcher) {
  let browser;
  try { browser = await launcher.launch(await launchOptions(name, launcher)); } catch (e) { failures.push(`${name}: cannot launch (${e.message.split('\n')[0]})`); return; }
  try {
    for (const width of name === 'chromium' ? [1280, 390] : [1280]) {
      const { context, page, violations, errors } = await openBuilder(browser, width);
      const tag = `${name} ${width}`;
      try {
        for (const c of CASES) {
          await fillCase(page, c);
          const opts = { ...(c.mode ? { mode: c.mode } : {}), ...(c.name ? { name: c.name } : {}) };
          const cliOut = cli(c.args);
          const expected = toCss(generatePalette(c.seeds, opts));
          check(`${tag} ${c.id}: packed CLI = packed module`, cliOut.stdout === expected);
          check(`${tag} ${c.id}: CLI exit`, cliOut.status === (c.failing ? 1 : 0), String(cliOut.status));
          try {
            await page.waitForFunction((exp) => document.getElementById('tb-css').textContent === exp, expected, { timeout: 8000 });
            check(`${tag} ${c.id}: builder CSS = CLI bytes`, true);
          } catch {
            const got = await text(page, '#tb-css');
            const i = [...got].findIndex((ch, k) => ch !== expected[k]);
            check(`${tag} ${c.id}: builder CSS = CLI bytes`, false, `first difference at ${i}: ${JSON.stringify(got.slice(Math.max(0, i - 40), i + 40))} vs ${JSON.stringify(expected.slice(Math.max(0, i - 40), i + 40))}`);
          }
          const json = JSON.parse(await text(page, '#tb-json'));
          const want = toJson(generatePalette(c.seeds, opts));
          check(`${tag} ${c.id}: builder JSON = toJson()`, JSON.stringify(json) === JSON.stringify(want));
          const cliJson = JSON.parse(cli([...c.args, '--diagnostics=json']).stderr);
          delete cliJson.exitCode;
          check(`${tag} ${c.id}: CLI JSON = toJson()`, JSON.stringify(cliJson) === JSON.stringify(want));
          const previewBg = await page.evaluate(() => getComputedStyle(document.getElementById('tb-preview')).backgroundColor);
          const wantBg = await page.evaluate((h) => { const p = document.createElement('i'); p.style.color = h; document.body.append(p); const v = getComputedStyle(p).color; p.remove(); return v; }, want.tokens['--td-color-bg']);
          check(`${tag} ${c.id}: preview scope painted with the palette`, previewBg === wantBg, `${previewBg} vs ${wantBg}`);
          const disabled = await page.evaluate(() => document.getElementById('tb-download').disabled);
          if (c.failing) {
            check(`${tag} ${c.id}: export disabled until accepted`, disabled === true && !(await page.evaluate(() => document.getElementById('tb-accept-row').hidden)));
            await page.check('#tb-accept');
            const accepted = cli([...c.args, '--allow-aa-failure']).stdout;
            await page.waitForFunction((exp) => document.getElementById('tb-css').textContent === exp, accepted, { timeout: 5000 }).catch(() => {});
            check(`${tag} ${c.id}: accepted CSS = CLI --allow-aa-failure`, (await text(page, '#tb-css')) === accepted);
            if (name === 'chromium') {
              const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#tb-download')]);
              const body = readFileSync(await dl.path(), 'utf8');
              check(`${tag} ${c.id}: download = accepted CSS`, body === accepted && dl.suggestedFilename() === 'td-theme.css', dl.suggestedFilename());
            }
            await page.uncheck('#tb-accept');
          } else {
            check(`${tag} ${c.id}: export enabled`, disabled === false);
          }
          if (SHOTS && name === 'chromium') {
            mkdirSync(SHOTS, { recursive: true });
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: join(SHOTS, `builder-${c.id}-${width}.png`), fullPage: true });
          }
        }
        // bridged popup from the preview scope
        await fillCase(page, CASES[1]);
        await page.waitForFunction(() => /navy/.test(document.getElementById('tb-css').textContent), null, { timeout: 5000 });
        await page.click('#tb-demo-menu');
        const menuTheme = await page.evaluate(() => document.querySelector('.td-menu')?.getAttribute('data-td-theme'));
        check(`${tag}: a menu opened in the preview is bridged`, menuTheme === 'tb-preview', String(menuTheme));
        if (SHOTS && name === 'chromium') {
          await page.waitForFunction(() => getComputedStyle(document.querySelector('.td-menu')).opacity === '1', null, { timeout: 3000 }).catch(() => {});
          await page.screenshot({ path: join(SHOTS, `builder-navy-menu-${width}.png`) });
        }
        await page.keyboard.press('Escape');
        // hostile input refused in place
        await page.fill('#tb-bg', 'red;}body{x:y}');
        await page.waitForFunction(() => document.getElementById('tb-bg').getAttribute('aria-invalid') === 'true', null, { timeout: 5000 });
        check(`${tag}: hostile seed refused (error shown, export off)`, await page.evaluate(() => !document.getElementById('tb-bg-err').hidden
          && document.getElementById('tb-download').disabled && !document.getElementById('tb-css').textContent.includes('red;}')));
        check(`${tag}: 0 CSP violations`, violations.length === 0, violations.join(' | '));
        check(`${tag}: no page error`, errors.length === 0, errors.join(' | '));
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

// ---- (B) first paint with a generated file, no JS ------------------------------------------------------------------
const GEN = {
  light: toCss(generatePalette({ bg: '#ece5d8', accent: '#b3261e', surface: '#fff' })),
  dark: toCss(generatePalette({ bg: '#16233a', accent: '#3b82f6' }, { mode: 'dark' })),
  named: toCss(generatePalette({ bg: '#f4faf9', accent: '#0f766e' }, { name: 'paper' })),
};
extra.set('/fp/gen.css', { type: 'text/css', body: `${GEN.light}\n${GEN.dark}\n${GEN.named}` });
extra.set('/fp/page.css', { type: 'text/css', body: 'html,body{margin:0;background:var(--td-color-bg)}.box{position:absolute;inset:0 0 auto auto;width:60px;height:60px;background:var(--td-color-bg)}' });
const NONCE = 'tdfp0042';
function paintHtml(theme, profile) {
  const n = profile === 'nonce' ? ` nonce="${NONCE}"` : '';
  return `<!doctype html><html${theme ? ` data-td-theme="${theme}"` : ''}><head><meta charset="utf-8">`
    + `<link rel="stylesheet"${n} href="/td.css"><link rel="stylesheet"${n} href="/fp/gen.css"><link rel="stylesheet"${n} href="/fp/page.css">`
    + '</head><body><div class="box" data-td-theme="paper"></div></body></html>';
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

async function paintEngine(name, launcher) {
  let browser;
  try { browser = await launcher.launch(await launchOptions(name, launcher)); } catch (e) { failures.push(`${name}: cannot launch (${e.message.split('\n')[0]})`); return; }
  try {
    for (const profile of ['self', 'nonce']) {
      for (const [theme, os, want] of [[null, 'light', '#ece5d8'], ['dark', 'light', '#16233a'], ['auto', 'dark', '#16233a'], ['auto', 'light', '#ece5d8']]) {
        const csp = profile === 'nonce' ? `default-src 'self'; style-src 'nonce-${NONCE}'; style-src-attr 'none'` : CSP_SELF;
        const path = `/fp/${profile}-${theme || 'none'}.html`;
        extra.set(path, { type: 'text/html; charset=utf-8', body: paintHtml(theme, profile), headers: { 'content-security-policy': csp } });
        const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: os, viewport: { width: 200, height: 120 }, deviceScaleFactor: 1 });
        const page = await context.newPage();
        await page.goto(`${ORIGIN}${path}`);
        const png = decodePng(await page.screenshot());
        const page1 = png.px(20, 100);
        const box = png.px(170, 30);
        const tag = `${name} ${profile} first paint (no JS) data-td-theme=${theme || '∅'} OS ${os}`;
        check(`${tag}: page = generated ${want}`, page1.slice(0, 3).every((v, i) => Math.abs(v - hex(want)[i]) <= 2), page1.join(','));
        check(`${tag}: named scope "paper" = generated #f4faf9`, box.slice(0, 3).every((v, i) => Math.abs(v - hex('#f4faf9')[i]) <= 2), box.join(','));
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

const launchers = { chromium, firefox, webkit };
const t0 = Date.now();
try {
  for (const e of ENGINES) await builderEngine(e, launchers[e]);
  for (const e of ENGINES) await paintEngine(e, launchers[e]);
} finally {
  server.close();
  rmSync(TMP, { recursive: true, force: true });
}
for (const n of [...new Set(notes)]) console.log(`  ${n}`);
const secs = Math.round((Date.now() - t0) / 1000);
if (failures.length) {
  console.log(`Theme gate: ${failures.length} failure(s) of ${checks} checks (${secs}s)`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`Theme gate: all ${checks} checks passed (${ENGINES.join(', ')}; builder from the packed package, first paint × 2 CSP profiles; ${secs}s).`);
