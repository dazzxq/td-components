// v0.51.0 (plan docs/internal/plans/v0.51.0-gallery-caption.md M1, QĐ 3 / 7–9 / 14–16) — the caption + length-limit
// model of <td-media-gallery>: normCaption / captionValue / limitCount / limitState / parseLimit (shared case tables
// test/ssr/media-text.cases.json + media-limit.cases.json, also run by test/php/td-ssr-media-gallery.test.js), the
// `[caption]` FormData entry and the restore state with / without the caption feature.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normCaption, captionValue, limitCount, limitState, parseLimit, galleryEntries, validateItems, encodeGalleryState,
  decodeGalleryState, GALLERY_CAPTION_MAX, GALLERY_ALT_MAX, GALLERY_CASES,
} from './media-field-model.js';

const TEXT = JSON.parse(readFileSync(new URL('../../test/ssr/media-text.cases.json', import.meta.url), 'utf8')).cases;
const LIMIT = JSON.parse(readFileSync(new URL('../../test/ssr/media-limit.cases.json', import.meta.url), 'utf8')).cases;
const CROP = '{"v":1,"x":0.1,"y":0,"width":0.5,"height":1}';

describe('normCaption / captionValue / limitCount (QĐ 3, 9 — media-text.cases.json)', () => {
  it('every JS case: the normalised caption, the line projection, the three counts', () => {
    let n = 0;
    for (const c of TEXT) {
      if (c.php_hex) continue;
      const tag = JSON.stringify(c.input);
      assert.equal(normCaption(c.input), c.norm, `norm ${tag}`);
      assert.equal(captionValue(c.norm, 'line'), c.line, `line ${tag}`);
      assert.equal(captionValue(c.norm, 'multiline'), c.norm, `multiline ${tag}`);
      assert.equal(limitCount(c.input), c.count, `count ${tag}`);
      assert.equal(limitCount(c.norm), c.countNorm, `countNorm ${tag}`);
      assert.equal(limitCount(c.line), c.countLine, `countLine ${tag}`);
      n += 1;
    }
    assert.ok(n >= 15);
  });

  it('not a string → ""; the hard ceiling cuts at 1000 code points (astral = 1), never refuses', () => {
    for (const v of [null, undefined, 7, true, [], {}]) assert.equal(normCaption(v), '');
    assert.equal(GALLERY_CAPTION_MAX, 1000);
    assert.equal(GALLERY_ALT_MAX, 500);
    assert.equal(normCaption('ả'.repeat(1100)), 'ả'.repeat(1000));
    assert.equal(normCaption('😀'.repeat(1001)), '😀'.repeat(1000));
    // controls are dropped BEFORE the cut: 1500 NULs + 1000 letters keep the 1000 letters
    assert.equal(normCaption(`${'\u0000'.repeat(1500)}${'x'.repeat(1000)}`), 'x'.repeat(1000));
  });
});

describe('limitState (QĐ 10 — shown from ≥ 80 %, integer maths)', () => {
  it('boundaries ± 1 for 5, 10, 255, 500, 1000', () => {
    for (const max of [5, 10, 255, 500, 1000]) {
      const edge = Math.ceil((max * 4) / 5);
      assert.deepEqual(limitState(edge - 1, max), { shown: false, state: null }, `${max} below`);
      assert.deepEqual(limitState(edge, max), { shown: true, state: max === edge ? 'limit' : null }, `${max} edge`);
      assert.deepEqual(limitState(max, max), { shown: true, state: 'limit' }, `${max} at`);
      assert.deepEqual(limitState(max + 1, max), { shown: true, state: 'over' }, `${max} over`);
    }
    assert.deepEqual(limitState(10, null), { shown: false, state: null });
    assert.deepEqual(limitState(0, 1), { shown: false, state: null });
  });
});

describe('parseLimit (QĐ 8 — media-limit.cases.json)', () => {
  it('strict decimal 1…ceiling; everything else null', () => {
    for (const c of LIMIT) {
      if (c.php_only) continue;
      assert.equal(parseLimit(c.input, c.ceiling), c.expect, JSON.stringify(c.input));
    }
    for (const v of [null, undefined, 255, true]) assert.equal(parseLimit(v, 500), null);
  });
});

describe('caption in the model (QĐ 1, 14–16)', () => {
  const items = [
    { id: 'm1', alt: 'Một', caption: 'a\nb', cropRaw: CROP, focalRaw: null },
    { id: 'm2', alt: '', caption: '', cropRaw: null, focalRaw: null },
  ];

  it('validateItems normalises `caption` on every item (even with the feature off); reasons / ids unchanged', () => {
    const r = validateItems([{ id: 'm1', caption: 'x\r\ny\u0000' }, { id: 'm2', caption: 7 }, { id: 'm3' }]);
    assert.equal(r.ok, true);
    assert.deepEqual(r.items.map((i) => i.caption), ['x\ny', '', '']);
  });

  it('galleryEntries: [caption] right after [alt] (usage only), projected by mode; caption null → the v0.50 bytes', () => {
    const v050 = galleryEntries('g', items, { usage: true });
    assert.deepEqual(galleryEntries('g', items, { usage: true, caption: null }), v050);
    assert.ok(!v050.some(([k]) => k.endsWith('[caption]')));
    assert.deepEqual(galleryEntries('g', items, { usage: true, caption: 'line', focal: true }).map(([k, v]) => `${k}=${v}`), [
      'g[0][id]=m1', 'g[0][alt]=Một', 'g[0][caption]=a b', `g[0][crop]=${CROP}`, 'g[0][focal]=null',
      'g[1][id]=m2', 'g[1][alt]=', 'g[1][caption]=', 'g[1][crop]=null', 'g[1][focal]=null',
    ]);
    assert.equal(galleryEntries('g', items, { usage: true, caption: 'multiline' })[2][1], 'a\nb');
    // reference shape: never a [caption]
    assert.deepEqual(galleryEntries('g', items, { caption: 'line' }), [['g[]', 'm1'], ['g[]', 'm2']]);
    assert.deepEqual(galleryEntries('g', [], { usage: true, caption: 'line' }), [['g', '']]);
  });

  it('restore state: off → the v0.50 bytes (no caption key, even with captions in memory); on → ALWAYS the raw key', () => {
    const v050 = '{"v":1,"items":[{"id":"m1","alt":"Một","crop":"' + CROP.replace(/"/g, '\\"') + '","focal":null},{"id":"m2","alt":"","crop":null,"focal":null}]}';
    assert.equal(encodeGalleryState(items), v050);
    assert.equal(encodeGalleryState(items, { caption: false }), v050);
    const on = encodeGalleryState(items, { caption: true });
    assert.equal(on, v050.replace('"focal":null}', '"focal":null,"caption":"a\\nb"}').replace('"focal":null}]', '"focal":null,"caption":""}]'));
    // r2: present (even "") = that value; absent = undefined (an old / off state); a wrong type = absent
    assert.deepEqual(decodeGalleryState(on).map((x) => x.caption), ['a\nb', '']);
    assert.deepEqual(decodeGalleryState(v050).map((x) => x.caption), [undefined, undefined]);
    assert.ok(!('caption' in decodeGalleryState(v050)[0]));
    assert.equal(decodeGalleryState('{"v":1,"items":[{"id":"m1","alt":"","caption":7}]}')[0].caption, undefined);
  });

  it('GALLERY_CASES: the caption rows hold (cap, CRLF, controls, type)', () => {
    const ids = GALLERY_CASES.map((c) => c.id);
    for (const id of ['caption-crlf', 'caption-controls', 'caption-cap', 'caption-astral-cap', 'caption-type']) assert.ok(ids.includes(id), id);
  });
});
