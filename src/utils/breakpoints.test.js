// ADR 0014 (v0.34.0): breakpoint constants + no hand-written viewport thresholds in component JS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BREAKPOINTS, SHORT_MAX, mqBelow, isCoarsePointer } from './breakpoints.js';
import { MQ_SHORT, MQ_COARSE, mqAtLeast, matches } from './breakpoints-internal.js';
import { WIDTHS, SHORT_MAX as CSS_SHORT } from '../../scripts/css-responsive.mjs';

test('constants match the CSS lint (one set of numbers)', () => {
  assert.deepEqual(Object.values(BREAKPOINTS), WIDTHS);
  assert.equal(SHORT_MAX, CSS_SHORT);
  assert.ok(Object.isFrozen(BREAKPOINTS));
});

test('query strings', () => {
  assert.equal(mqBelow('sm'), '(max-width: 479.98px)');
  assert.equal(mqBelow('md'), '(max-width: 719.98px)');
  assert.equal(mqBelow('lg'), '(max-width: 1023.98px)');
  assert.equal(mqAtLeast('xl'), '(min-width: 1280px)');
  assert.equal(MQ_SHORT, '(max-height: 500px)');
  assert.equal(MQ_COARSE, '(hover: none) and (pointer: coarse)');
  assert.throws(() => mqBelow('xs'), RangeError);
});

test('matches() is false without matchMedia (node / SSR)', () => {
  assert.equal(matches('(min-width: 1px)'), false);
  assert.equal(isCoarsePointer(), false);
});

/**
 * Component JS must not hard-code viewport thresholds. `innerWidth` / `innerHeight` used to MEASURE (clip rects,
 * scrollbar width, sortable autoscroll) is allowed per file with a reason.
 */
const MEASURE_OK = {
  'src/utils/floating.js': 'clip rect of the viewport for placement',
  'src/utils/scroll-lock.js': 'scrollbar width = innerWidth − clientWidth',
  'src/utils/sortable-controller.js': 'autoscroll clip rect',
  'src/feedback/td-tooltip.js': 'room left/right of the trigger',
  'src/feedback/td-hovercard.js': 'max list height = viewport height − margin',
  'src/feedback/td-menu.js': 'max list height = viewport height − margin',
};

async function jsFiles(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await jsFiles(p, out);
    else if (/\.js$/.test(e.name) && !/\.(test|browser-test|stories)\.js$/.test(e.name)) out.push(p);
  }
  return out;
}

test('no hand-written width/height thresholds in component JS', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const bad = [];
  for (const f of await jsFiles(join(root, 'src'))) {
    const rel = relative(root, f).split('\\').join('/');
    if (rel === 'src/utils/breakpoints.js' || rel === 'src/utils/breakpoints-internal.js') continue;
    const src = await readFile(f, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (/^\s*(\*|\/\/)/.test(line)) return;
      if (/matchMedia\(\s*['"`][^'"`]*\b(min-|max-)?(width|height)\b/.test(line)) bad.push(`${rel}:${i + 1}: width/height matchMedia — use src/utils/breakpoints.js`);
      if (/\binner(Width|Height)\b/.test(line) && !MEASURE_OK[rel]) bad.push(`${rel}:${i + 1}: innerWidth/innerHeight — use src/utils/breakpoints.js`);
      if (/\binner(Width|Height)\s*[<>]=?\s*\d/.test(line)) bad.push(`${rel}:${i + 1}: viewport threshold compare`);
    });
  }
  assert.deepEqual(bad, []);
});

test('public API (review #6): ./breakpoints and the barrel export exactly the plan names', async () => {
  const pub = await import('./breakpoints.js');
  assert.deepEqual(Object.keys(pub).sort(), ['BREAKPOINTS', 'SHORT_MAX', 'isCoarsePointer', 'isShort', 'matchesBelow', 'mqBelow']);
  const src = await readFile(new URL('../../index.js', import.meta.url), 'utf8');
  const block = /export \{([^}]*)\} from '\.\/src\/utils\/breakpoints\.js';/.exec(src);
  assert.ok(block, 'barrel re-exports breakpoints');
  assert.deepEqual(block[1].split(',').map((x) => x.trim()).filter(Boolean).sort(), ['BREAKPOINTS', 'SHORT_MAX', 'isCoarsePointer', 'isShort', 'matchesBelow', 'mqBelow']);
});
