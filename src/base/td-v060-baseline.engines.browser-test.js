import { expect } from '@esm-bundle/chai';
import { CAPTURES, BASELINE } from './td-v060-baseline.fixture.js';

// v0.60.0 (plan v0.60.0-calendar-picker C1, acceptance 8) + v0.61.0 (plan v0.61.0-range-calendar, acceptance 10) — Chromium,
// Firefox AND WebKit: the closed box of <td-datetime-picker> and of <td-datetime-range> is character-identical to the version
// before the calendar dialogs. (The range DIALOG was compared verbatim in v0.60.0; v0.61.0 redesigned it on purpose — its
// contract is the a11y spec + the selector contract of docs/components/datetime-range.md.)
// Strings are compared as booleans + a short diff hint (long strings in a failing chai diff are unreadable).
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

describe('v0.60.0 / v0.61.0 — the closed picker + range boxes = the previous markup', () => {
  for (const name of Object.keys(CAPTURES)) {
    it(name, async () => {
      const now = await CAPTURES[name]();
      const same = now === BASELINE[name];
      expect(same, same ? '' : firstDiff(now, BASELINE[name])).to.equal(true);
    });
  }
});
