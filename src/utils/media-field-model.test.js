// v0.32.0 (plan docs/internal/plans/v0.32.0-media-picker.md M1, decisions 24-25) — pure model of <td-media-field>,
// shared with the PHP parity table (php/td.php td_media_field mirrors parseAspectRatio / parseCrop / parseKinds).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAspectRatio, parseCrop, fieldEntries, encodeState, decodeState, parseKinds, ASPECT_CASES, CROP_CASES,
} from './media-field-model.js';
import { safeMediaUrl } from './media-url.js';

const safeUrl = (u) => safeMediaUrl(u, { baseURI: 'https://site.test/', protocol: 'https:' });

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

describe('form state v1', () => {
  const state = { id: 'a1', alt: 'Mô tả', cropRaw: '{"v":1,"x":0,"y":0,"width":1,"height":1}',
    preview: { src: 'https://cdn.test/a.jpg', alt: 'a.jpg', kind: 'image' } };

  it('round trip', () => {
    const s = encodeState(state);
    assert.equal(JSON.parse(s).v, 1);
    assert.deepEqual(decodeState(s, { safeUrl }), state);
  });

  it('unsafe preview URL is dropped (the rest kept)', () => {
    const s = encodeState({ ...state, preview: { ...state.preview, src: 'javascript:alert(1)' } });
    assert.deepEqual(decodeState(s, { safeUrl }).preview, { src: '', alt: 'a.jpg', kind: 'image' });
  });

  it('v:2, broken JSON, wrong types → null; bad crop → null crop; bad kind → image', () => {
    assert.equal(decodeState(JSON.stringify({ ...JSON.parse(encodeState(state)), v: 2 }), { safeUrl }), null);
    assert.equal(decodeState('{', { safeUrl }), null);
    assert.equal(decodeState(JSON.stringify({ v: 1, id: 5 }), { safeUrl }), null);
    assert.equal(decodeState(null, { safeUrl }), null);
    const odd = decodeState(JSON.stringify({ v: 1, id: 'a', alt: 'x', crop: '{bad', preview: { src: '', alt: '', kind: 'zip' } }), { safeUrl });
    assert.equal(odd.cropRaw, null);
    assert.equal(odd.preview.kind, 'image');
  });
});
