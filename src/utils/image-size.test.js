import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { parseImageSize, readImageSize, IMAGE_HEAD_BYTES } = await import('./image-size.js');

const bytes = (...parts) => new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const be16 = (n) => [(n >> 8) & 255, n & 255];
const le16 = (n) => [n & 255, (n >> 8) & 255];
const be32 = (n) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const le24 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];

// --- PNG ---
const chunk = (type, data = []) => [...be32(data.length), ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ihdr = (w, h) => chunk('IHDR', [...be32(w), ...be32(h), 8, 6, 0, 0, 0]);
const png = (w, h, ...extra) => bytes(SIG, ihdr(w, h), ...extra, chunk('IDAT', [1, 2, 3]), chunk('IEND'));

// --- JPEG ---
const seg = (marker, data) => [0xff, marker, ...be16(data.length + 2), ...data];
const sof = (marker, w, h) => seg(marker, [8, ...be16(h), ...be16(w), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
const exif = (orientation, { le = false, type = 3, tag = 0x0112 } = {}) => {
  const u16 = le ? le16 : be16;
  const u32 = (n) => (le ? be32(n).reverse() : be32(n));
  const tiff = [...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(1),
    ...u16(tag), ...u16(type), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)];
  return seg(0xe1, [...'Exif'].map((c) => c.charCodeAt(0)).concat([0, 0], tiff));
};
const jpeg = (...segs) => bytes([0xff, 0xd8], ...segs, seg(0xda, [1, 1, 0, 0, 0x3f, 0]), [0xff, 0xd9]);

describe('parseImageSize', () => {
  it('PNG: IHDR size', () => {
    assert.deepEqual(parseImageSize(png(200, 100)), { width: 200, height: 100 });
    assert.deepEqual(parseImageSize(png(3000000000, 7)), { width: 3000000000, height: 7 });
  });
  it('PNG: ancillary chunks before IDAT are walked', () => {
    assert.deepEqual(parseImageSize(png(10, 20, chunk('tEXt', [...'k\0v'].map((c) => c.charCodeAt(0))), chunk('pHYs', Array(9).fill(0)))),
      { width: 10, height: 20 });
  });
  const tiffO = (o) => [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0, 0, 0, 0, 0];
  it('PNG: eXIf with orientation 6 / malformed → null', () => {
    assert.equal(parseImageSize(png(200, 100, chunk('eXIf', tiffO(6)))), null);
    assert.equal(parseImageSize(png(200, 100, chunk('eXIf', [0x4d, 0x4d, 0, 42]))), null);
  });
  it('PNG: eXIf with orientation 1 or no orientation tag (WebKit canvas) → size as stored', () => {
    assert.deepEqual(parseImageSize(png(200, 100, chunk('eXIf', tiffO(1)))), { width: 200, height: 100 });
    assert.deepEqual(parseImageSize(png(200, 100, chunk('eXIf', [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 0]))), { width: 200, height: 100 });
  });
  it('PNG: no IDAT in the head / IEND first / bad IHDR → null', () => {
    assert.equal(parseImageSize(bytes(SIG, ihdr(200, 100))), null);
    assert.equal(parseImageSize(bytes(SIG, ihdr(200, 100), chunk('IEND'))), null);
    assert.equal(parseImageSize(bytes(SIG, chunk('IHDX', Array(13).fill(1)), chunk('IDAT'))), null);
    assert.equal(parseImageSize(png(0, 100)), null);
  });
  it('PNG: huge chunk length does not loop', () => {
    assert.equal(parseImageSize(bytes(SIG, ihdr(5, 5), [0xff, 0xff, 0xff, 0xff], 'tEXt')), null);
  });

  it('GIF', () => {
    assert.deepEqual(parseImageSize(bytes('GIF89a', le16(320), le16(48), [0, 0, 0])), { width: 320, height: 48 });
    assert.deepEqual(parseImageSize(bytes('GIF87a', le16(1), le16(2))), { width: 1, height: 2 });
    assert.equal(parseImageSize(bytes('GIF89a', [1])), null);
  });

  it('WebP VP8 (lossy)', () => {
    const b = bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8 ', [0, 0, 0, 0], [0, 0, 0], [0x9d, 0x01, 0x2a], le16(640), le16(480));
    assert.deepEqual(parseImageSize(b), { width: 640, height: 480 });
    const bad = bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8 ', [0, 0, 0, 0], [0, 0, 0], [0, 0, 0], le16(640), le16(480));
    assert.equal(parseImageSize(bad), null);
  });
  it('WebP VP8L (lossless)', () => {
    const w = 1000;
    const h = 300;
    const bits = (w - 1) | ((h - 1) << 14);
    const b = bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8L', [0, 0, 0, 0], [0x2f], [bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >>> 24) & 255]);
    assert.deepEqual(parseImageSize(b), { width: 1000, height: 300 });
  });
  it('WebP VP8X (extended); EXIF flag → null', () => {
    const vp8x = (flags) => bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8X', [10, 0, 0, 0], [flags, 0, 0, 0], le24(4095), le24(2047));
    assert.deepEqual(parseImageSize(vp8x(0x10)), { width: 4096, height: 2048 });
    assert.equal(parseImageSize(vp8x(0x08)), null);
  });

  it('JPEG without EXIF: SOF0 / SOF2', () => {
    assert.deepEqual(parseImageSize(jpeg(seg(0xe0, [...'JFIF'].map((c) => c.charCodeAt(0)).concat([0])), sof(0xc0, 200, 100))),
      { width: 200, height: 100 });
    assert.deepEqual(parseImageSize(jpeg(sof(0xc2, 4032, 3024))), { width: 4032, height: 3024 });
  });
  it('JPEG: DHT / DAC / JPG markers are not frame headers', () => {
    assert.deepEqual(parseImageSize(jpeg(seg(0xc4, [0, 1, 2]), seg(0xcc, [0, 1]), sof(0xc1, 30, 40))), { width: 30, height: 40 });
  });
  it('JPEG EXIF orientation 6 (MM and II) swaps; 3 does not', () => {
    assert.deepEqual(parseImageSize(jpeg(exif(6), sof(0xc0, 200, 100))), { width: 100, height: 200 });
    assert.deepEqual(parseImageSize(jpeg(exif(6, { le: true }), sof(0xc0, 200, 100))), { width: 100, height: 200 });
    assert.deepEqual(parseImageSize(jpeg(exif(8, { le: true }), sof(0xc0, 200, 100))), { width: 100, height: 200 });
    assert.deepEqual(parseImageSize(jpeg(exif(3), sof(0xc0, 200, 100))), { width: 200, height: 100 });
  });
  it('JPEG: EXIF without an orientation tag → as stored', () => {
    assert.deepEqual(parseImageSize(jpeg(exif(6, { tag: 0x010f }), sof(0xc0, 200, 100))), { width: 200, height: 100 });
  });
  it('JPEG: malformed orientation → null', () => {
    assert.equal(parseImageSize(jpeg(exif(9), sof(0xc0, 200, 100))), null);
    assert.equal(parseImageSize(jpeg(exif(6, { type: 4 }), sof(0xc0, 200, 100))), null);
  });
  it('JPEG: large APPn segments before SOF, fill bytes, RST markers', () => {
    const big = seg(0xe2, Array(60000).fill(7));
    assert.deepEqual(parseImageSize(jpeg(big, big, [0xff, 0xff], [0xff, 0xd0], sof(0xc0, 12, 34))), { width: 12, height: 34 });
  });
  it('JPEG: SOS before SOF / segment length < 2 / truncated / not FF → null', () => {
    assert.equal(parseImageSize(jpeg()), null);
    assert.equal(parseImageSize(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 1, 0xff, 0xc0])), null);
    assert.equal(parseImageSize(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0])), null);
    assert.equal(parseImageSize(bytes([0xff, 0xd8], sof(0xc0, 10, 10).slice(0, 6))), null);
    assert.equal(parseImageSize(bytes([0xff, 0xd8, 0x00, 0x11])), null);
  });
  it('JPEG: IFD offset / count outside the segment → null', () => {
    const tiff = [0x4d, 0x4d, 0, 42, 0x7f, 0xff, 0xff, 0xff];
    const s = seg(0xe1, [...'Exif'].map((c) => c.charCodeAt(0)).concat([0, 0], tiff));
    assert.equal(parseImageSize(jpeg(s, sof(0xc0, 1, 1))), null);
    const many = [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0xff, 0xff];
    const s2 = seg(0xe1, [...'Exif'].map((c) => c.charCodeAt(0)).concat([0, 0], many));
    assert.equal(parseImageSize(jpeg(s2, sof(0xc0, 1, 1))), null);
  });

  it('unknown / empty / not bytes → null', () => {
    assert.equal(parseImageSize(bytes('BM', [0, 0, 0, 0])), null);
    assert.equal(parseImageSize(new Uint8Array()), null);
    assert.equal(parseImageSize(null), null);
    assert.equal(parseImageSize([0xff, 0xd8]), null);
  });
  it('random bytes never throw', () => {
    let x = 12345;
    const rnd = () => ((x = (x * 1103515245 + 12345) >>> 0) >>> 16) & 255;
    for (let k = 0; k < 2000; k++) {
      const head = [[0xff, 0xd8], SIG, [...'GIF89a'].map((c) => c.charCodeAt(0)), [...'RIFF\0\0\0\0WEBPVP8X'].map((c) => c.charCodeAt(0))][k % 4];
      const b = new Uint8Array(head.length + (rnd() % 64));
      b.set(head);
      for (let i = head.length; i < b.length; i++) b[i] = rnd();
      const r = parseImageSize(b);
      assert.ok(r === null || (r.width >= 1 && r.height >= 1));
    }
  });
});

describe('readImageSize', () => {
  it('reads only the head of the blob', async () => {
    let asked = null;
    const blob = { slice(a, b) { asked = [a, b]; return new Blob([png(64, 32)]); } };
    assert.deepEqual(await readImageSize(blob), { width: 64, height: 32 });
    assert.deepEqual(asked, [0, IMAGE_HEAD_BYTES]);
  });
  it('a failing blob → null', async () => {
    assert.equal(await readImageSize({ slice() { throw new Error('x'); } }), null);
    assert.equal(await readImageSize(null), null);
  });
});
