// v0.43.0 (plan docs/internal/plans/v0.43.0-media-gallery.md M1, decisions 14-17) — the pure model of
// <td-media-gallery>: FormData entries (two shapes), the one validation path (validateItems), the `items` attribute
// parser, the restore state, and the parity table GALLERY_CASES shared with php/td.php td__media_gallery_items()
// (test/php/td-ssr-media-gallery.test.js runs the same cases).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  galleryEntries, validateItems, parseItems, encodeGalleryState, decodeGalleryState, GALLERY_CASES, GALLERY_MAX_ITEMS,
  GALLERY_ITEMS_MAX_LEN,
} from './media-field-model.js';

const CROP = '{"v":1,"x":0.1,"y":0,"width":0.5,"height":1}';
const FOCAL = '{"v":1,"x":0.25,"y":0.75}';
const it3 = [
  { id: 'm1', alt: 'Một', cropRaw: CROP, focalRaw: FOCAL },
  { id: 'm2', alt: '', cropRaw: null, focalRaw: null },
  { id: 'm3', alt: 'Ba "x"', cropRaw: null, focalRaw: null },
];

describe('galleryEntries (decision 14 — the public form shape)', () => {
  it('reference: name[]=<id> per item in order; empty → exactly one name=', () => {
    assert.deepEqual(galleryEntries('images', it3), [['images[]', 'm1'], ['images[]', 'm2'], ['images[]', 'm3']]);
    assert.deepEqual(galleryEntries('images', []), [['images', '']]);
  });

  it('usage: name[i][id], [alt], [crop] in this key order, i = 0…n-1; crop null → "null"', () => {
    assert.deepEqual(galleryEntries('g', it3.slice(0, 2), { usage: true }), [
      ['g[0][id]', 'm1'], ['g[0][alt]', 'Một'], ['g[0][crop]', CROP],
      ['g[1][id]', 'm2'], ['g[1][alt]', ''], ['g[1][crop]', 'null'],
    ]);
    assert.deepEqual(galleryEntries('g', [], { usage: true }), [['g', '']]);
  });

  it('usage + focal: a fourth key [focal] (JSON v1 or "null")', () => {
    assert.deepEqual(galleryEntries('g', it3.slice(0, 2), { usage: true, focal: true }), [
      ['g[0][id]', 'm1'], ['g[0][alt]', 'Một'], ['g[0][crop]', CROP], ['g[0][focal]', FOCAL],
      ['g[1][id]', 'm2'], ['g[1][alt]', ''], ['g[1][crop]', 'null'], ['g[1][focal]', 'null'],
    ]);
  });

  it('a nested name is valid (product[gallery][0][id]); no name / a name ending in [] → null (both shapes)', () => {
    assert.deepEqual(galleryEntries('product[gallery]', it3.slice(0, 1), { usage: true })[0], ['product[gallery][0][id]', 'm1']);
    assert.deepEqual(galleryEntries('product[gallery]', it3.slice(0, 1))[0], ['product[gallery][]', 'm1']);
    for (const n of ['images[]', 'a[b][]', '', null, undefined, 42]) {
      assert.equal(galleryEntries(n, it3), null, String(n));
      assert.equal(galleryEntries(n, it3, { usage: true }), null, String(n));
      assert.equal(galleryEntries(n, []), null, String(n));
    }
  });
});

describe('validateItems (decision 15b — the one validation path)', () => {
  const raw = (n, f = (i) => ({ id: `m${i + 1}` })) => Array.from({ length: n }, (_, i) => f(i));

  it('valid → { ok, items } normalised (id, src, previewAlt, kind, alt, cropRaw, focalRaw)', () => {
    const r = validateItems([
      { id: 'm1', src: 'https://cdn.example/1.jpg', name: 'anh-1.jpg', kind: 'image', alt: 'Một', crop: CROP, focal: FOCAL },
      { id: 'm2' },
    ], { max: 10 });
    assert.equal(r.ok, true);
    assert.equal(r.reason, null);
    assert.deepEqual(r.items, [
      { id: 'm1', src: 'https://cdn.example/1.jpg', previewAlt: 'anh-1.jpg', kind: 'image', alt: 'Một', cropRaw: CROP, focalRaw: FOCAL, caption: '' },
      { id: 'm2', src: '', previewAlt: '', kind: 'image', alt: '', cropRaw: null, focalRaw: null, caption: '' },
    ]); // v0.51.0: every normalised item also carries `caption` (QĐ 14)
  });

  it('structure: not an array → type; > 100 → ceiling; an entry not an object → item', () => {
    for (const v of [null, undefined, 'x', 42, {}, { length: 1 }]) assert.equal(validateItems(v).reason, 'type', String(v));
    assert.equal(validateItems(raw(GALLERY_MAX_ITEMS + 1)).reason, 'ceiling');
    assert.equal(validateItems(raw(GALLERY_MAX_ITEMS)).ok, true);
    for (const v of [[null], ['m1'], [[{ id: 'm1' }]], [42]]) assert.equal(validateItems(v).reason, 'item', JSON.stringify(v));
  });

  it('id: empty / not a string (numbers too: PHP normalises its ints first) / 513 code units → id; duplicate → duplicate', () => {
    for (const id of ['', 0, 42, null, undefined, true, ['m1'], { a: 1 }, 'x'.repeat(513)]) {
      assert.equal(validateItems([{ id }]).reason, 'id', JSON.stringify(id));
    }
    assert.equal(validateItems([{ id: 'x'.repeat(512) }]).ok, true);
    assert.equal(validateItems([{ id: 'm1' }, { id: 'm2' }, { id: 'm1' }]).reason, 'duplicate');
    // case-sensitive identity (ids are opaque)
    assert.equal(validateItems([{ id: 'm1' }, { id: 'M1' }]).ok, true);
  });

  it('fields capped, never refused: alt cut to 500 code points, bad crop / focal → null, unsafe src dropped, unknown kind → image', () => {
    const r = validateItems([{
      id: 'm1', alt: '😀'.repeat(600), crop: '{"v":1,"x":0.9,"y":0,"width":0.5,"height":1}', focal: '{"v":1,"x":2,"y":0}',
      src: 'javascript:alert(1)', kind: 'pdf', name: 42,
    }, { id: 'm2', crop: `${CROP}${' '.repeat(600)}`, src: 'data:image/png;base64,AAAA', alt: 7 }]);
    assert.equal(r.ok, true);
    assert.equal([...r.items[0].alt].length, 500);
    assert.deepEqual([r.items[0].cropRaw, r.items[0].focalRaw, r.items[0].src, r.items[0].kind, r.items[0].previewAlt],
      [null, null, '', 'image', '']);
    assert.deepEqual([r.items[1].cropRaw, r.items[1].src, r.items[1].alt], [null, '', '']);
  });

  it('max (≤ 100): more items than max → reason "max" + the normalised items (the caller decides: keep or refuse)', () => {
    const r = validateItems(raw(5), { max: 3 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'max');
    assert.equal(r.items.length, 5);
    assert.equal(validateItems(raw(3), { max: 3 }).ok, true);
    // a structural error wins over max
    assert.equal(validateItems([{ id: 'a' }, { id: 'a' }], { max: 1 }).reason, 'duplicate');
    assert.equal(validateItems([{ id: 'a' }, { id: 'a' }], { max: 1 }).items, null);
  });

  it('a custom safeUrl (the browser resolves relative URLs against the page)', () => {
    const r = validateItems([{ id: 'm1', src: '/media/1.jpg' }], { safeUrl: (u) => u.startsWith('/') });
    assert.equal(r.items[0].src, '/media/1.jpg');
  });
});

describe('parseItems (the `items` attribute — decision 17)', () => {
  it('absent / empty → ok, []', () => {
    for (const s of [null, undefined, '']) assert.deepEqual(parseItems(s), { ok: true, items: [], reason: null });
  });

  it('JSON array → validateItems; broken JSON → json; > 256 KiB → size', () => {
    assert.deepEqual(parseItems('[{"id":"m1"}]').items.map((i) => i.id), ['m1']);
    assert.equal(parseItems('[{"id":"m1"}').reason, 'json');
    assert.equal(parseItems('{"id":"m1"}').reason, 'type');
    assert.equal(parseItems(`[{"id":"m1","alt":"${'a'.repeat(GALLERY_ITEMS_MAX_LEN)}"}]`).reason, 'size');
    assert.equal(parseItems('[{"id":"m1"},{"id":"m2"}]', { max: 1 }).reason, 'max');
  });
});

describe('restore state (decision 16) — id / alt / crop / focal only, never a URL or a server label', () => {
  it('round trip; src / name / kind / asset not written', () => {
    const s = encodeGalleryState([{ ...it3[0], src: 'https://cdn.example/secret.jpg?token=1', previewAlt: 'x', kind: 'image', asset: { id: 'm1' } }, it3[1]]);
    assert.ok(!s.includes('cdn.example') && !s.includes('token') && !s.includes('previewAlt'), s);
    assert.deepEqual(JSON.parse(s), { v: 1, items: [{ id: 'm1', alt: 'Một', crop: CROP, focal: FOCAL }, { id: 'm2', alt: '', crop: null, focal: null }] });
    assert.deepEqual(decodeGalleryState(s), [
      { id: 'm1', alt: 'Một', crop: CROP, focal: FOCAL },
      { id: 'm2', alt: '', crop: null, focal: null },
    ]);
  });

  it('broken / forged state → null; extra keys ignored; the result still goes through validateItems', () => {
    for (const s of [null, 42, '', '{', '{"v":2,"items":[]}', '{"v":1}', '{"v":1,"items":{}}', 'x'.repeat(300000)]) {
      assert.equal(decodeGalleryState(s), null, String(s).slice(0, 30));
    }
    const forged = decodeGalleryState('{"v":1,"items":[{"id":"m1","alt":"a","crop":null,"focal":null,"src":"javascript:alert(1)"}]}');
    assert.deepEqual(forged, [{ id: 'm1', alt: 'a', crop: null, focal: null }]);
    const dup = decodeGalleryState('{"v":1,"items":[{"id":"m1"},{"id":"m1"}]}');
    assert.equal(validateItems(dup).reason, 'duplicate');
  });
});

describe('GALLERY_CASES (parity table, JS ⇔ PHP)', () => {
  it('frozen; every JS expectation holds', () => {
    assert.ok(Object.isFrozen(GALLERY_CASES) && GALLERY_CASES.length >= 12);
    for (const c of GALLERY_CASES) {
      if (c.js === false) continue; // PHP-only input (e.g. an int id)
      const r = validateItems(c.items, { max: c.max ?? GALLERY_MAX_ITEMS });
      const want = c.expect;
      assert.equal(r.reason, want.reason, c.id);
      if (want.ids) assert.deepEqual((r.items || []).map((i) => i.id), want.ids, c.id);
      if (want.items) assert.deepEqual(r.items.map((i) => Object.fromEntries(Object.keys(want.items[0]).map((k) => [k, i[k]]))), want.items, c.id);
    }
  });
});
