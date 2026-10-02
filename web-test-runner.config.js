import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { playwrightLauncher } from '@web/test-runner-playwright';

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
  files: ['src/**/*.browser-test.js', '!src/**/*.scrollbar.browser-test.js'],
  nodeResolve: true,
  plugins: [storiesPlugin],
  browsers: [playwrightLauncher({ product: 'chromium' })],
  // Headless Playwright hides scrollbars (--hide-scrollbars); the scroll-lock gutter suite (v0.22.1) needs a real
  // classic scrollbar to prove the page does not jump sideways, so it runs in its own group with them shown.
  groups: [{
    name: 'scrollbars',
    files: ['src/**/*.scrollbar.browser-test.js'],
    browsers: [playwrightLauncher({ product: 'chromium', launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })],
  }],
  testFramework: {
    config: { ui: 'bdd', timeout: '10000' },
  },
};
