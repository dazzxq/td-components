/**
 * Shared Playwright harness of the v0.44.0 engine specs (type-confirm.spec.mjs, form-dirty.spec.mjs): serves td.css +
 * src/ from the repo on a fake origin, launches Chromium / Firefox / WebKit (pinned build, else env path, else the newest
 * cached build), records checks / failures / notes. Not a spec itself (run.mjs only picks `*.spec.mjs`).
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ORIGIN = 'http://engines.local';
const MIME = { '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.css': 'text/css' };

export function createReport(title) {
  const failures = [];
  const notes = [];
  let checks = 0;
  return {
    notes,
    check(label, ok, detail = '') {
      checks += 1;
      if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    },
    fail(msg) { failures.push(msg); },
    finish() {
      console.log('--- notes ---');
      for (const n of notes) console.log(`  ${n}`);
      if (failures.length) {
        console.log(`--- ${failures.length} FAILURE(S) ---`);
        for (const f of failures) console.log(`  FAIL ${f}`);
        process.exit(1);
      }
      console.log(`${title}: all ${checks} checks passed.`);
    },
  };
}

export async function launchOptions(name, launcher, notes) {
  if (existsSync(launcher.executablePath())) return {};
  const env = { firefox: process.env.TD_FIREFOX_PATH, webkit: process.env.TD_WEBKIT_PATH }[name];
  if (env) return { executablePath: env };
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const rel = { firefox: 'firefox/Nightly.app/Contents/MacOS/firefox', webkit: 'pw_run.sh' }[name];
  if (!rel || !existsSync(cache)) return {};
  const dirs = (await readdir(cache)).filter((d) => d.startsWith(`${name}-`))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const exe = join(cache, d, rel);
    if (existsSync(exe)) { notes.push(`${name}: using cached build ${d}`); return { executablePath: exe }; }
  }
  return {};
}

/**
 * A fresh context + page serving `html` at `${ORIGIN}/` (and `/other` for navigations); waits for window.__ready.
 * @param {import('playwright-core').Browser} browser
 * @param {string} html
 */
export async function freshPage(browser, html) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    if (url.pathname === '/other') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><p id="other">other</p>' });
    if (url.pathname === '/td.css' || (/^\/src\//.test(url.pathname) && !url.pathname.includes('..'))) {
      const ext = url.pathname.slice(url.pathname.lastIndexOf('.'));
      return readFile(join(ROOT, url.pathname))
        .then((body) => route.fulfill({ status: 200, contentType: MIME[ext] || 'application/octet-stream', body }))
        .catch(() => route.fulfill({ status: 404, body: '' }));
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => window.__ready === true);
  return { page, context };
}
