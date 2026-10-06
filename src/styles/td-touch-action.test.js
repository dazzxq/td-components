// v0.36.2 (ADR 0019, plan QĐ 13–14): the kit's touch-action table. Every touch-action declaration in the CSS sources
// must be in this table with the same value — a new one (above all a new `none`, which blocks scrolling / zooming
// from that element) is a reviewed change to this list and to docs/internal/design/touch.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { touchActions } from '../../scripts/css-touch.mjs';

const TABLE = {
  // cropper: direct manipulation of the crop box (pinch / drag) — WCAG 2.5.7 essential, keyboard alternative
  '.td-cropper__stage': 'none',
  // slider: the native range keeps tap-to-set + thumb drag; a vertical swipe starting on it does not scroll the page
  '.td-slider__input': 'none',
  // sortable: ONLY the handles (the item body scrolls normally)
  '.td-sortable__handle, td-sortable button[data-td-sort-handle], td-repeater button[data-td-sort-handle]': 'none',
  // lightbox: the stage owns pinch / pan / swipe; the side columns own the swipe too
  '.td-lightbox__stage': 'none',
  '.td-lightbox__nav > .td-lightbox__btn': 'none',
  '.td-lightbox[data-nav="rail"] .td-lightbox__rail > .td-lightbox__btn': 'manipulation',
  '.td-lightbox__filmstrip': 'pan-x',
  // v0.48.0 colour picker: the 2-D area is a direct drag (keyboard, text input and presets are the alternatives) and the
  // hue is a native range like td-slider — a vertical swipe starting on either does not scroll the page
  '.td-color-panel__area': 'none',
  '.td-color-panel__hue': 'none',
};

test('touch-action declarations = the reviewed table (no new none, nothing on html / body)', async () => {
  const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8'));
  const entries = [];
  for (const f of manifest.files) entries.push({ css: await readFile(new URL(`./${f}`, import.meta.url), 'utf8'), file: f });
  const found = touchActions(entries);
  const got = Object.fromEntries(found.map((t) => [t.selector, t.value]));
  assert.deepEqual(got, TABLE);
  for (const t of found) assert.ok(!/(^|[\s,>])(html|body|:root)\b/.test(t.selector), `${t.file}:${t.line} ${t.selector}`);
});

test('td.css (generated) carries the same touch-action values', async () => {
  const css = await readFile(new URL('../../td.css', import.meta.url), 'utf8');
  const values = [...css.matchAll(/touch-action\s*:\s*([^;}]+)/g)].map((m) => m[1].trim());
  assert.ok(values.length >= Object.keys(TABLE).length);
  for (const v of values) assert.ok(Object.values(TABLE).includes(v), v);
});
