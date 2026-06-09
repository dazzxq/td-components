import { playwrightLauncher } from '@web/test-runner-playwright';

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
  files: ['src/**/*.browser-test.js'],
  nodeResolve: true,
  browsers: [playwrightLauncher({ product: 'chromium' })],
  testFramework: {
    config: { ui: 'bdd', timeout: '10000' },
  },
};
