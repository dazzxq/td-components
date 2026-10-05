import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { playwrightLauncher, playwright } from '@web/test-runner-playwright';

/**
 * Launch options for Firefox / WebKit (v0.25.0 SSR group): the build pinned by Playwright when installed (CI:
 * `npx playwright-core install`), else TD_FIREFOX_PATH / TD_WEBKIT_PATH, else the newest cached build in
 * ~/Library/Caches/ms-playwright (same fallback as test/tokens/tokens.spec.mjs).
 */
function engineLaunchOptions(name) {
  try {
    if (existsSync(playwright[name].executablePath())) return {};
  } catch { /* unknown → fall back */ }
  const env = { firefox: process.env.TD_FIREFOX_PATH, webkit: process.env.TD_WEBKIT_PATH }[name];
  if (env) return { executablePath: env };
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const rel = { firefox: 'firefox/Nightly.app/Contents/MacOS/firefox', webkit: 'pw_run.sh' }[name];
  if (!rel || !existsSync(cache)) return {};
  const dirs = readdirSync(cache).filter((d) => d.startsWith(`${name}-`))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const exe = join(cache, d, rel);
    if (existsSync(exe)) return { executablePath: exe };
  }
  return {};
}

/** v0.31.0: engines tests driving REAL mouse drags (one group each = own browser instances). */
/** v0.35.0: + td-cropper pointer (real mouse drags, synthetic pinch, wheel). */
const POINTER_FILES = ['src/display/td-v031-sortable.engines.browser-test.js', 'src/form/td-v031-repeater-sortable.engines.browser-test.js',
  'src/form/td-v035-cropper.engines.browser-test.js',
  // v0.36.0: real modifier + mouse clicks on the media grid
  'src/display/td-v036-media-grid-shortcuts.engines.browser-test.js', 'src/feedback/td-v036-media-picker-shortcuts.engines.browser-test.js',
  'src/feedback/td-v036-lightbox-menu-dismiss.engines.browser-test.js',
  // v0.37.0: real (Shift+) clicks on td-table row selection
  'src/display/td-v037-table-selection.engines.browser-test.js',
  // v0.43.0: real mouse drags on the td-media-gallery handles
  'src/form/td-v043-media-gallery-sort.engines.browser-test.js'];

/** All src stories (for src/stories-dom.browser-test.js). */
function storyFiles(dir = 'src', out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) storyFiles(p, out);
    else if (p.endsWith('.stories.js')) out.push(`/${p}`);
  }
  return out;
}

/**
 * Stories import CSS for Storybook (`import './x.css'`); in the test browser such imports load as empty modules
 * (tagged `?td-css-module` so real `<link href="/td.css">` requests are untouched). `/__stories.js` lists them.
 */
const storiesPlugin = {
  name: 'td-stories',
  transformImport({ source }) {
    return source.endsWith('.css') ? `${source}?td-css-module` : undefined;
  },
  serve(ctx) {
    if (ctx.url.includes('?td-css-module')) return { body: 'export {};', type: 'js' };
    if (ctx.path === '/__stories.js') return { body: `export default ${JSON.stringify(storyFiles())};`, type: 'js' };
    return undefined;
  },
};

/**
 * Real-browser test runner (ISSUE-1). The form-association suite needs a REAL
 * browser: `attachInternals()`, native `FormData`, constraint validation,
 * `<fieldset disabled>`, `requestSubmit()`, label association, and
 * `formStateRestoreCallback` cannot be proven by the Node + DOM-shim tests.
 *
 * Browser tests are named `*.browser-test.js` (NOT `*.test.js`) so the `node --test`
 * glob in `npm run test:node` can never load them into Node, where `document` /
 * `customElements` / `attachInternals` do not exist.
 */
export default {
  files: ['src/**/*.browser-test.js', '!src/**/*.scrollbar.browser-test.js', '!src/**/*.ssr.browser-test.js',
    '!src/**/*.engines.browser-test.js'],
  nodeResolve: true,
  plugins: [storiesPlugin],
  browsers: [playwrightLauncher({ product: 'chromium' })],
  // Headless Playwright hides scrollbars (--hide-scrollbars); the scroll-lock gutter suite (v0.22.1) needs a real
  // classic scrollbar to prove the page does not jump sideways, so it runs in its own group with them shown.
  groups: [{
    name: 'scrollbars',
    files: ['src/**/*.scrollbar.browser-test.js'],
    browsers: [playwrightLauncher({ product: 'chromium', launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })],
  }, {
    // v0.25.0 (ADR 0012): SSR hydrate in place must hold in every engine — Chromium, Firefox AND WebKit.
    name: 'ssr',
    files: ['src/**/*.ssr.browser-test.js'],
    browsers: [
      playwrightLauncher({ product: 'chromium' }),
      playwrightLauncher({ product: 'firefox', launchOptions: engineLaunchOptions('firefox') }),
      playwrightLauncher({ product: 'webkit', launchOptions: engineLaunchOptions('webkit') }),
    ],
  }, {
    // v0.27.0: behaviour of the dsuite batch-1 components (td-otp-input, td-drawer, td-copy) in every engine.
    name: 'engines',
    files: ['src/**/*.engines.browser-test.js', ...POINTER_FILES.map((f) => `!${f}`)],
    browsers: [
      playwrightLauncher({ product: 'chromium' }),
      playwrightLauncher({ product: 'firefox', launchOptions: engineLaunchOptions('firefox') }),
      playwrightLauncher({ product: 'webkit', launchOptions: engineLaunchOptions('webkit') }),
    ],
  }, ...POINTER_FILES.map((file, i) => ({
    // v0.31.0: real mouse drags (sendMouse + pointer capture). Firefox routes a mouse release of ANOTHER page of the same
    // browser instance (e.g. its afterEach resetMouse) to the element holding the capture here, so each of these files
    // runs alone in its own browser instances.
    name: `pointer-${i + 1}`,
    files: [file],
    browsers: [
      playwrightLauncher({ product: 'chromium' }),
      playwrightLauncher({ product: 'firefox', launchOptions: engineLaunchOptions('firefox') }),
      playwrightLauncher({ product: 'webkit', launchOptions: engineLaunchOptions('webkit') }),
    ],
  }))],
  testFramework: {
    config: { ui: 'bdd', timeout: '10000' },
  },
};
