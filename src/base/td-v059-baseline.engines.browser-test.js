import { expect } from '@esm-bundle/chai';
import { CAPTURES, BASELINE } from './td-v059-baseline.fixture.js';

// v0.59.0 (plan v0.59.0-dsuite-small, acceptance 1): without the new options (`hide-single-page`, Node / array `message`,
// `signed`, `clearable`, `allow-open-end`) every touched component renders EXACTLY the v0.58.0 markup — Chromium, Firefox
// AND WebKit. Strings are compared as booleans + a short diff hint (long strings in a failing chai diff are unreadable).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const firstDiff = (a, b) => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i += 1;
  return `@${i}: …${a.slice(Math.max(0, i - 40), i + 80)}… ≠ …${b.slice(Math.max(0, i - 40), i + 80)}…`;
};

describe('v0.59.0 — no option = the v0.58.0 markup', () => {
  for (const name of Object.keys(CAPTURES)) {
    it(name, async () => {
      const now = await CAPTURES[name]();
      const same = now === BASELINE[name];
      expect(same, same ? '' : firstDiff(now, BASELINE[name])).to.equal(true);
    });
  }
});
