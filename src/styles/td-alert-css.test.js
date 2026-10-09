// v0.62.0 (plan A): td-alert has no side stripe — a 1px hairline on all four sides, an icon tile tinted from the
// theme-contract tokens (--td-alert-{v}-icon / -bg), the old stripe tokens kept declared but inert. Static checks of the
// CSS source; the rendered pairs (icon on the tile, text, heading) are measured by the contrast gate in the browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./components/alert.css', import.meta.url), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, ''); // comments out
const component = code.slice(code.indexOf('@layer td.component'));
const VARIANTS = ['info', 'success', 'warning', 'danger'];

test('no side stripe: nothing sets border-inline-start / a per-side border, the accent width is not used', () => {
  assert.doesNotMatch(code, /border-(inline|block)-(start|end)\b/);
  assert.doesNotMatch(code, /border-(left|right|top|bottom)\b/);
  assert.doesNotMatch(component, /var\(--td-alert-(accent-width|(info|success|warning|danger)-accent)\)/);
});

test('the border is one 1px hairline on every side, coloured per variant', () => {
  assert.match(component, /\.td-alert\s*\{[^}]*border:\s*1px solid var\(--td-alert-info-border\)/);
  for (const v of ['success', 'warning', 'danger']) {
    assert.match(component, new RegExp(`\\.td-alert--${v}\\s*\\{[^}]*border-color:\\s*var\\(--td-alert-${v}-border\\)`));
  }
});

test('the stripe tokens stay declared (golden + sites that set them) but are documented inert', () => {
  assert.match(code, /--td-alert-accent-width:\s*4px/);
  for (const v of VARIANTS) assert.match(code, new RegExp(`--td-alert-${v}-accent:`));
  assert.match(src, /deprecated|không còn tác dụng|no effect/i);
});

test('icon tile: tokens per variant derived from -icon / -bg inside @supports color-mix, used with a transparent fallback', () => {
  const supports = code.slice(code.indexOf('@supports'));
  for (const v of VARIANTS) {
    assert.match(supports, new RegExp(`--td-alert-${v}-tile:\\s*color-mix\\(in srgb,\\s*var\\(--td-alert-${v}-icon\\)\\s+var\\(--td-alert-tile-mix\\),\\s*var\\(--td-alert-${v}-bg\\)\\)`));
    assert.match(component, new RegExp(`var\\(--td-alert-${v}-tile,\\s*transparent\\)`));
  }
  assert.match(code, /--td-alert-tile-mix:\s*12%/);
  assert.match(code, /--td-alert-icon-box:\s*1\.75rem/);
});

test('the component layer holds no colour literal and no inline-style hook', () => {
  assert.doesNotMatch(component, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(src, /style=/);
});

test('contrast preference and forced colours drop the tile; the close button is placed with logical margins', () => {
  assert.match(component, /@media \(prefers-contrast: more\)[\s\S]*?\.td-alert__icon[\s\S]*?background-color:\s*transparent/);
  assert.match(component, /@media \(forced-colors: active\)[\s\S]*?\.td-alert__icon[\s\S]*?background-color:\s*transparent/);
  const close = component.slice(component.indexOf('.td-alert__close {'), component.indexOf('}', component.indexOf('.td-alert__close {')));
  assert.doesNotMatch(close, /margin:/);
  assert.match(close, /margin-inline:\s*0 -0\.5rem/);
});
