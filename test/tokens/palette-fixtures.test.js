// v0.42.0 (plan R2 acceptance): the generated palette fixtures of the full-page gate are exactly the generator's output
// (regenerate: node -e "…toCss(generatePalette(seeds))" — see the seeds below).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generatePalette, toCss } from '../../src/theme/index.js';

const read = (f) => readFileSync(fileURLToPath(new URL(`./palettes/${f}`, import.meta.url)), 'utf8');

test('navy.css + beige-gen.css = toCss(generatePalette(seeds))', () => {
  assert.equal(read('navy.css'), toCss(generatePalette({ bg: '#16233a', accent: '#3b82f6' })));
  assert.equal(read('beige-gen.css'), toCss(generatePalette({ bg: '#ece5d8', accent: '#b3261e', surface: '#fff' })));
});
