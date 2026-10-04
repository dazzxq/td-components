// v0.32.0 (plan docs/internal/plans/v0.32.0-media-picker.md M1, decisions 24-25) — pure model of <td-media-field>,
// shared with the PHP parity table (php/td.php td_media_field mirrors parseAspectRatio / parseCrop / parseKinds).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAspectRatio, parseCrop, fieldEntries, encodeState, decodeState, parseKinds, ASPECT_CASES, CROP_CASES,
  parseFocal, serializeCrop, serializeFocal, parseCropRatio, cropPreviewVars, FOCAL_CASES, CROP_RATIO_CASES,
  CROP_RATIO_MIN, CROP_RATIO_MAX, cropRatioInRange,
} from './media-field-model.js';

describe('parseAspectRatio', () => {
  it('W/H, W:H, a single number', () => {
    assert.deepEqual(parseAspectRatio('3/2'), { w: 3, h: 2, text: '3:2' });
    assert.deepEqual(parseAspectRatio('3:2'), { w: 3, h: 2, text: '3:2' });
    assert.deepEqual(parseAspectRatio(' 16 / 9 '), { w: 16, h: 9, text: '16:9' });
    assert.deepEqual(parseAspectRatio('1.91'), { w: 1.91, h: 1, text: '1.91:1' });
    assert.deepEqual(parseAspectRatio('1'), { w: 1, h: 1, text: '1:1' });
    assert.deepEqual(parseAspectRatio('4.50:3'), { w: 4.5, h: 3, text: '4.5:3' });
  });

  it('invalid → null', () => {
    for (const s of ['0', '-1', 'abc', '1e9', '0/2', '3/0', '1.12345', '3/2/1', '', ' ', null, undefined, 3, '10001',
      '10001/1', 'Infinity', 'NaN', '3//2', '.5', '5.', '+3/2', '3 2']) {
      assert.equal(parseAspectRatio(s), null, String(s));
    }
  });

  it('the shared parity table (PHP runs the same cases)', () => {
    for (const [input, want] of ASPECT_CASES) assert.deepEqual(parseAspectRatio(input), want, String(input));
  });
});

describe('parseCrop', () => {
  it('valid v1 → { raw (byte-identical), crop }', () => {
    const raw = '{"v":1,"x":0.1,"y":0,"width":0.5,"height":1}';
    assert.deepEqual(parseCrop(raw), { raw, crop: { x: 0.1, y: 0, width: 0.5, height: 1 } });
  });

  it('edges: x + width = 1 (± 1e-6) accepted', () => {
    assert.ok(parseCrop('{"v":1,"x":0.5,"y":0.5,"width":0.5,"height":0.5}'));
    assert.ok(parseCrop('{"v":1,"x":0.5,"y":0,"width":0.5000005,"height":1}'));
    assert.ok(parseCrop('{"v":1,"x":0,"y":0,"width":1,"height":1}'));
  });

  it('out of 0..1, broken JSON, missing v, extra keys → null', () => {
    for (const s of ['{"v":1,"x":-0.1,"y":0,"width":0.5,"height":0.5}', '{"v":1,"x":0.6,"y":0,"width":0.5,"height":0.5}',
      '{"v":1,"x":0,"y":0,"width":0,"height":0.5}', '{"v":1,"x":0,"y":0.1,"width":0.5,"height":0.95}',
      '{"x":0,"y":0,"width":0.5,"height":0.5}', '{"v":2,"x":0,"y":0,"width":0.5,"height":0.5}',
      '{"v":1,"x":0,"y":0,"width":0.5,"height":0.5,"z":1}', '{"v":1,"x":"0","y":0,"width":0.5,"height":0.5}',
      '{v:1}', 'null', '', '[]', '[1,2]', 'true', null, 42, `{"v":1,"x":0,"y":0,"width":0.5,"height":0.5${' '.repeat(600)}}`]) {
      assert.equal(parseCrop(s), null, String(s));
    }
  });

  it('the shared parity table', () => {
    for (const [input, ok] of CROP_CASES) assert.equal(!!parseCrop(input), ok, input);
  });
});

describe('parseKinds', () => {
  it('list → unique valid kinds; empty / unknown only → image', () => {
    assert.deepEqual(parseKinds('image'), ['image']);
    assert.deepEqual(parseKinds('video, image video'), ['video', 'image']);
    assert.deepEqual(parseKinds('FILE'), ['file']);
    assert.deepEqual(parseKinds(''), ['image']);
    assert.deepEqual(parseKinds(null), ['image']);
    assert.deepEqual(parseKinds('pdf audio'), ['image']);
    assert.deepEqual(parseKinds(['video', 'x']), ['video']);
  });
});

describe('fieldEntries', () => {
  it('reference: name=id (empty → name=)', () => {
    assert.deepEqual(fieldEntries('hero', { id: 'a1', alt: 'x', cropRaw: null }, false), [['hero', 'a1']]);
    assert.deepEqual(fieldEntries('hero', { id: '', alt: '', cropRaw: null }, false), [['hero', '']]);
    assert.deepEqual(fieldEntries('gallery[]', { id: 'a1' }, false), [['gallery[]', 'a1']]);
  });

  it('usage: always the three entries; crop raw kept, null otherwise', () => {
    const raw = '{"v":1,"x":0,"y":0,"width":1,"height":0.5}';
    assert.deepEqual(fieldEntries('og', { id: 'a1', alt: 'Ảnh', cropRaw: raw }, true),
      [['og[id]', 'a1'], ['og[alt]', 'Ảnh'], ['og[crop]', raw]]);
    assert.deepEqual(fieldEntries('og', { id: '', alt: '', cropRaw: null }, true),
      [['og[id]', ''], ['og[alt]', ''], ['og[crop]', 'null']]);
  });

  it('usage + name ending in [] → null (fail closed); no name → null', () => {
    assert.equal(fieldEntries('og[]', { id: 'a1' }, true), null);
    assert.equal(fieldEntries('', { id: 'a1' }, false), null);
    assert.equal(fieldEntries(null, { id: 'a1' }, true), null);
  });
});

describe('form state v1 (review SEC-1: id + alt + validated crop only)', () => {
  const raw = '{"v":1,"x":0,"y":0,"width":1,"height":1}';
  const state = { id: 'a1', alt: 'Mô tả', cropRaw: raw, focalRaw: null };

  it('encodes ONLY v / id / alt / crop / focal — never a preview URL or server labels, even when given', () => {
    const s = encodeState({ ...state, preview: { src: 'https://cdn.test/signed?token=SECRET', alt: 'server name', kind: 'video' } });
    assert.deepEqual(Object.keys(JSON.parse(s)).sort(), ['alt', 'crop', 'focal', 'id', 'v']);
    assert.ok(!s.includes('SECRET') && !s.includes('server name') && !s.includes('cdn.test'));
  });

  it('round trip', () => {
    assert.deepEqual(decodeState(encodeState(state)), state);
  });

  it('a preview inside an old / forged state is ignored', () => {
    const s = JSON.stringify({ v: 1, id: 'a1', alt: 'x', crop: null, preview: { src: 'javascript:alert(1)', alt: 'y', kind: 'video' } });
    assert.deepEqual(decodeState(s), { id: 'a1', alt: 'x', cropRaw: null, focalRaw: null });
  });

  it('v:2, broken JSON, wrong types → null; bad crop → null crop', () => {
    assert.equal(decodeState(JSON.stringify({ v: 2, id: 'a', alt: '', crop: null })), null);
    assert.equal(decodeState('{'), null);
    assert.equal(decodeState(JSON.stringify({ v: 1, id: 5 })), null);
    assert.equal(decodeState(null), null);
    assert.equal(decodeState(JSON.stringify({ v: 1, id: 'a', alt: 'x', crop: '{bad' })).cropRaw, null);
  });
});

describe('v0.35 focal (decision 29) — parseFocal / serializeFocal / FOCAL_CASES', () => {
  it('valid v1 → { raw (byte-identical), focal }', () => {
    const raw = '{"v":1,"x":0.25,"y":1}';
    assert.deepEqual(parseFocal(raw), { raw, focal: { x: 0.25, y: 1 } });
  });
  it('invalid → null', () => {
    for (const s of [null, undefined, 5, '', 'null', '{', '{"v":1,"x":0.5,"y":2}', '{"v":1,"x":0.5,"y":NaN}',
      `{"v":1,"x":0.5,"y":0.5${' '.repeat(120)}}`]) assert.equal(parseFocal(s), null, String(s));
  });
  it('the shared parity table (PHP runs the same cases)', () => {
    for (const [input, ok] of FOCAL_CASES) assert.equal(!!parseFocal(input), ok, input);
  });
  it('serializeFocal: keys v,x,y, 6 decimals, clamped; invalid → null', () => {
    assert.equal(serializeFocal({ x: 0.1234567, y: 0.5 }), '{"v":1,"x":0.123457,"y":0.5}');
    assert.equal(serializeFocal({ x: -1, y: 2 }), '{"v":1,"x":0,"y":1}');
    assert.equal(serializeFocal({ x: NaN, y: 0 }), null);
    assert.equal(serializeFocal(null), null);
  });
});

describe('v0.35 serializeCrop (decision 29 — only the crop UI writes through it)', () => {
  it('fixed key order, 6 decimals, x + width ≤ 1', () => {
    assert.equal(serializeCrop({ x: 0.1, y: 0.2, width: 0.5, height: 0.25 }), '{"v":1,"x":0.1,"y":0.2,"width":0.5,"height":0.25}');
    assert.equal(serializeCrop({ x: 0.3333333, y: 0, width: 0.6666667, height: 1 }),
      '{"v":1,"x":0.333333,"y":0,"width":0.666667,"height":1}');
    assert.equal(serializeCrop({ x: 0.5, y: 0, width: 0.5000004, height: 1 }), '{"v":1,"x":0.5,"y":0,"width":0.5,"height":1}');
    assert.equal(serializeCrop({ x: NaN, y: 0, width: 1, height: 1 }), null);
    assert.equal(serializeCrop(null), null);
    assert.equal(serializeCrop({ x: 0, y: 0, width: 0, height: 1 }), null);
  });
  it('fuzz: every serialised crop passes parseCrop', () => {
    let seed = 7;
    const r = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let i = 0; i < 5000; i++) {
      const x = r();
      const y = r();
      const s = serializeCrop({ x, y, width: Math.max(1e-6, (1 - x) * r() + 1e-7), height: Math.max(1e-6, (1 - y) * r() + 1e-7) });
      if (s !== null) assert.ok(parseCrop(s), s);
    }
  });
});

describe('v0.35 fieldEntries + focal (decision 29)', () => {
  const raw = '{"v":1,"x":0,"y":0,"width":1,"height":1}';
  it('without focal: exactly the v0.34 three entries', () => {
    const v34 = [['og[id]', 'a1'], ['og[alt]', 'Ảnh'], ['og[crop]', raw]];
    assert.deepEqual(fieldEntries('og', { id: 'a1', alt: 'Ảnh', cropRaw: raw, focalRaw: '{"v":1,"x":0.5,"y":0.5}' }, true), v34);
    assert.deepEqual(fieldEntries('og', { id: 'a1', alt: 'Ảnh', cropRaw: raw }, true, { focal: false }), v34);
  });
  it('with focal: a fourth entry, order id, alt, crop, focal; null → "null"', () => {
    assert.deepEqual(fieldEntries('og', { id: 'a1', alt: '', cropRaw: null, focalRaw: '{"v":1,"x":0.5,"y":0.5}' }, true, { focal: true }),
      [['og[id]', 'a1'], ['og[alt]', ''], ['og[crop]', 'null'], ['og[focal]', '{"v":1,"x":0.5,"y":0.5}']]);
    assert.deepEqual(fieldEntries('og', { id: '', alt: '', cropRaw: null, focalRaw: null }, true, { focal: true })[3], ['og[focal]', 'null']);
    assert.deepEqual(fieldEntries('og', { id: 'a1' }, false, { focal: true }), [['og', 'a1']], 'reference mode never has focal');
  });
  it('state: focal round-trips; missing focal (pre-v0.35 state) → null; bad focal → null', () => {
    const st = { id: 'a1', alt: 'x', cropRaw: raw, focalRaw: '{"v":1,"x":0.1,"y":0.9}' };
    assert.deepEqual(decodeState(encodeState(st)), st);
    assert.equal(decodeState(JSON.stringify({ v: 1, id: 'a', alt: '', crop: null })).focalRaw, null);
    assert.equal(decodeState(JSON.stringify({ v: 1, id: 'a', alt: '', crop: null, focal: '{"v":1,"x":3,"y":0}' })).focalRaw, null);
  });
});

describe('v0.35 parseCropRatio / cropPreviewVars (decisions 27, 30)', () => {
  it('free, ratios, invalid', () => {
    assert.equal(parseCropRatio('free'), 'free');
    assert.equal(parseCropRatio(' FREE '), 'free');
    assert.equal(parseCropRatio('16:9'), 16 / 9);
    assert.equal(parseCropRatio('1.91'), 1.91);
    assert.equal(parseCropRatio('3/2'), 1.5);
    for (const s of [null, undefined, '', 'abc', '0', '-1/2']) assert.equal(parseCropRatio(s), null, String(s));
  });
  it('matching ratio (≤ 2 %) → unitless vars; off → null', () => {
    const c = { x: 0.1, y: 0.2, width: 0.5, height: 0.5 };
    assert.deepEqual(cropPreviewVars(c, { W: 1600, H: 900, frameRatio: 16 / 9 }), { x: 0.1, y: 0.2, w: 0.5, h: 0.5 });
    assert.ok(cropPreviewVars(c, { W: 1600, H: 900, frameRatio: (16 / 9) * 1.019 }));
    assert.equal(cropPreviewVars(c, { W: 1600, H: 900, frameRatio: (16 / 9) * 1.021 }), null);
    assert.equal(cropPreviewVars(c, { W: 1600, H: 900, frameRatio: null }), null);
    assert.equal(cropPreviewVars(null, { W: 1600, H: 900, frameRatio: 1 }), null);
    assert.equal(cropPreviewVars(c, { W: 0, H: 900, frameRatio: 1 }), null);
  });
});

describe('v0.35 review R1 #5: public crop ratio range [0.01, 100]', () => {
  it('bounds + boundaries (0.01, 100 in; 0.0099, 100.01 out)', () => {
    assert.equal(CROP_RATIO_MIN, 0.01);
    assert.equal(CROP_RATIO_MAX, 100);
    for (const r of [0.01, 1, 100, 1 / 3]) assert.equal(cropRatioInRange(r), true, String(r));
    for (const r of [0.0099, 100.01, 0, -1, NaN, Infinity, '2']) assert.equal(cropRatioInRange(r), false, String(r));
    assert.equal(parseCropRatio('0.01'), 0.01);
    assert.equal(parseCropRatio('100'), 100);
    assert.equal(parseCropRatio('1:100'), 0.01);
    assert.equal(parseCropRatio('100/1'), 100);
    assert.equal(parseCropRatio('0.0099'), null);
    assert.equal(parseCropRatio('100.01'), null);
    assert.equal(parseCropRatio('1:101'), null);
    assert.equal(parseCropRatio('10000/1'), null, 'a valid frame aspect-ratio, but outside the crop range');
  });
  it('the shared parity table (PHP runs the same cases)', () => {
    for (const [input, want] of CROP_RATIO_CASES) assert.equal(parseCropRatio(input), want, String(input));
  });
});
