/**
 * v0.96.0 lightbox toggle toolbar buttons (plan docs/internal/plans/v0.96.0-lightbox-toggle.md §4.3) — the STATIC CSS
 * contract of lightbox.css (behaviour needs a DOM: td-v096-lightbox-toggle.engines.browser-test.js). Nothing pure worth
 * extracting from td-lightbox.js (plan §7), so this file guards the stylesheet the behaviour relies on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseRules, pressedBases } from '../../scripts/css-touch.mjs';

const css = await readFile(fileURLToPath(new URL('../styles/components/lightbox.css', import.meta.url)), 'utf8');
const rules = parseRules(css);
const find = (pred) => rules.filter((r) => pred(r.selector.replace(/\s+/g, ' ')));
/** at-rule ancestors other than the cascade layer */
const media = (r) => r.ancestors.map((a) => a.replace(/\s+/g, ' ').trim()).filter((a) => !a.startsWith('@layer'));

test('--td-lb-pressed: one token (lightbox is always dark), used by the "on" colour of [aria-pressed] and legacy [data-on]', () => {
  assert.match(css, /--td-lb-pressed:\s*#ffd60a;/);
  const on = find((s) => s.includes('.td-lightbox__btn[aria-pressed="true"]') && s.includes('.td-lightbox__btn[data-on]'));
  assert.equal(on.length, 1);
  assert.match(on[0].body, /color:\s*var\(--td-lb-pressed\)/);
  assert.doesNotMatch(css, /color:\s*#ffd60a/i, 'no hard-coded on colour left');
});

test('busy: [aria-disabled="true"] dims to 0.5 (after the focus ring rule, so a focused busy button stays dim), progress cursor', () => {
  const dim = find((s) => s === '.td-lightbox__btn[aria-disabled="true"]');
  assert.equal(dim.length, 1);
  assert.equal(media(dim[0]).length, 0);
  assert.match(dim[0].body, /opacity:\s*0\.5/);
  const focus = find((s) => s === '.td-lightbox__btn:focus-visible')[0];
  assert.ok(focus && focus.selStart < dim[0].selStart, 'declared after .td-lightbox__btn:focus-visible');
  assert.match(find((s) => s === '.td-lightbox__btn[aria-busy="true"]')[0].body, /cursor:\s*progress/);
});

test('hover on a busy button only inside the hover gate, and it does not light up', () => {
  const hover = find((s) => s === '.td-lightbox__btn[aria-disabled="true"]:hover');
  assert.equal(hover.length, 1);
  assert.deepEqual(media(hover[0]), ['@media (hover: hover) and (pointer: fine)']);
  assert.match(hover[0].body, /background:\s*transparent/);
  assert.match(hover[0].body, /opacity:\s*0\.5/);
});

test('touch press: a busy button never gets the pressed fill; the press base is unchanged (PRESS_TARGETS)', () => {
  const press = find((s) => s.startsWith('.td-lightbox__btn:is(:active, [data-td-pressed]):not('));
  assert.equal(press.length, 1);
  assert.match(press[0].selector, /:not\(:disabled, \[aria-disabled="true"\]\)/);
  assert.ok(pressedBases([{ css, file: 'lightbox.css' }]).includes('.td-lightbox__btn'));
});

test('forced colours: an "on" toggle carries a Highlight outline (the colour is overridden)', () => {
  const fc = find((s) => s === '.td-lightbox__btn[aria-pressed="true"]')
    .filter((r) => media(r).some((a) => /forced-colors:\s*active/.test(a)));
  assert.equal(fc.length, 1);
  assert.match(fc[0].body, /outline:\s*2px solid Highlight/);
});
