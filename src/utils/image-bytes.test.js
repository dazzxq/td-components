// v0.90.0 (plan docs/internal/plans/v0.90.0-image-resize.md step 1) — byte layer: sniff, inspect, EXIF reader, fuzz.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ImageResizeError, sniffFormat, inspectImage, readExif, MAX_JPEG_SEGMENTS,
} from './image-bytes.js';
import {
  ascii, concat, be16, be32, buildTiff, buildJpeg, buildPng, app1Exif, app1Xmp, app1XmpExt, app2Mpf, app2Icc, app0Jfif,
  app11Jumbf, app13Iptc, com, segment, xmpPacket, chunk, eXIf, acTL, tEXt, PNG_SIG, ihdr, rng, mutate, fuzzFixtures,
} from '../../test/fixtures/image-builders.js';

const code = (fn) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof ImageResizeError, `unexpected ${e && e.name}: ${e && e.message}`);
    return e.code;
  }
  return null;
};

describe('sniffFormat', () => {
  it('recognises binary magic bytes', () => {
    const riff = (fourcc) => concat(ascii('RIFF'), be32(100), ascii('WEBP'), ascii(fourcc));
    const ftyp = (major, compat = []) => concat(be32(16 + 4 * compat.length), ascii('ftyp'), ascii(major), be32(0), ...compat.map(ascii));
    const bmp = concat(ascii('BM'), new Uint8Array(12), Uint8Array.of(40, 0, 0, 0));
    const cases = [
      [buildJpeg(), 'jpeg'], [buildPng(), 'png'], [ascii('GIF89a\x01\x00\x01\x00'), 'gif'], [ascii('GIF87a....'), 'gif'],
      [riff('VP8 '), 'webp'], [ftyp('avif'), 'avif'], [ftyp('heic'), 'heic'], [ftyp('mif1', ['mif1', 'avif']), 'avif'],
      [ftyp('mif1', ['heic']), 'heic'], [ftyp('mif1', ['miaf']), null], [ftyp('isom'), null], [bmp, 'bmp'],
      [Uint8Array.of(0x49, 0x49, 42, 0, 8, 0, 0, 0), 'tiff'], [Uint8Array.of(0x4d, 0x4d, 0, 42, 0, 0, 0, 8), 'tiff'],
      [Uint8Array.of(0xff, 0x0a, 0, 0), 'jxl'], [concat(be32(12), ascii('JXL \r\n\x87\n')), 'jxl'],
      [ascii('%PDF-1.7\n'), null], [ascii('BMxx'), null], [new Uint8Array(0), null], [Uint8Array.of(0xff), null],
      [Uint8Array.of(0xff, 0xd8), null], [ascii('PK\x03\x04'), null],
    ];
    for (const [b, want] of cases) assert.equal(sniffFormat(b), want, String.fromCharCode(...b.subarray(0, 12)));
    assert.equal(sniffFormat('not bytes'), null);
  });

  it('sniffs SVG conservatively', () => {
    const yes = [
      '<svg xmlns="http://www.w3.org/2000/svg"/>', '  \n<svg>', '﻿<svg/>'.replace('﻿', '\xEF\xBB\xBF'),
      '<?xml version="1.0" encoding="UTF-8"?>\n<svg viewBox="0 0 1 1">',
      '<?xml version="1.0"?><!-- Generator: Adobe Illustrator --><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x"><svg>',
      '<!DOCTYPE svg [ <!ENTITY a "b"> ]><SVG>',
    ];
    const no = [
      '<html><svg>', '<svgfoo>', 'hello <svg>', '<?xml version="1.0"?><root/>', '<!-- never closed <svg>',
      '<?xml version="1.0"', '<sv', '<svg',
    ];
    for (const s of yes) assert.equal(sniffFormat(ascii(s)), 'svg', s);
    for (const s of no) assert.equal(sniffFormat(ascii(s)), null, s);
    // past 4 KiB → not sniffed
    assert.equal(sniffFormat(ascii(`<!--${'x'.repeat(5000)}--><svg>`)), null);
  });
});

describe('inspectImage — JPEG', () => {
  it('reads SOF size, scans and EOI of a baseline JPEG', () => {
    const j = buildJpeg({ width: 6000, height: 4000 });
    const r = inspectImage(j);
    assert.equal(r.format, 'jpeg');
    assert.deepEqual([r.width, r.height, r.orientation, r.orientedWidth, r.orientedHeight, r.bitDepth], [6000, 4000, 1, 6000, 4000, 8]);
    assert.equal(r.jpeg.scans, 1);
    assert.equal(r.jpeg.eoiOffset, j.length - 2);
    assert.deepEqual(r.special, { mpf: false, gainMap: false, c2pa: false, trailing: false, apng: false, highBitDepth: false });
    const last = r.jpeg.segments[r.jpeg.segments.length - 1];
    assert.equal(last.marker, 0xda);
    assert.equal(r.jpeg.sosOffset, last.start);
    for (const s of r.jpeg.segments) assert.ok(s.start >= 2 && s.end <= j.length && s.payloadStart === s.start + 4);
  });

  it('walks a progressive multi-scan JPEG to the primary EOI', () => {
    const j = buildJpeg({ progressive: true, scans: 5 });
    const r = inspectImage(j);
    assert.equal(r.jpeg.scans, 5);
    assert.equal(r.jpeg.eoiOffset, j.length - 2);
    assert.equal(r.special.trailing, false);
  });

  it('flags trailing data after EOI, but not zero padding', () => {
    assert.equal(inspectImage(buildJpeg({ trailing: buildJpeg() })).special.trailing, true);
    assert.equal(inspectImage(buildJpeg({ trailing: ascii('SAMSUNG trailer') })).special.trailing, true);
    assert.equal(inspectImage(buildJpeg({ trailing: new Uint8Array(64) })).special.trailing, false);
  });

  it('rejects a JPEG truncated anywhere after SOS (no primary EOI)', () => {
    for (const j of [buildJpeg(), buildJpeg({ progressive: true, scans: 3 })]) {
      const sos = inspectImage(j).jpeg.sosOffset;
      for (let n = sos; n < j.length; n++) assert.equal(code(() => inspectImage(j.subarray(0, n))), 'invalid-image', `cut at ${n}`);
      assert.equal(code(() => inspectImage(j)), null);
    }
  });

  it('records and bounds-checks segments between scans; special content there is detected', () => {
    const j = buildJpeg({ progressive: true, scans: 3, interScan: [app1Xmp(), com('x')] });
    const r = inspectImage(j);
    assert.deepEqual(r.jpeg.postScanSegments.map((s) => s.marker), [0xe1, 0xfe, 0xc4, 0xda, 0xc4, 0xda]);
    for (const s of r.jpeg.postScanSegments) assert.ok(s.start > r.jpeg.sosOffset && s.end <= j.length);
    assert.equal(r.jpeg.scans, 3);
    assert.equal(inspectImage(buildJpeg({ progressive: true, interScan: [app2Mpf()] })).special.mpf, true);
    assert.equal(inspectImage(buildJpeg({ progressive: true, interScan: [app11Jumbf()] })).special.c2pa, true);
    assert.equal(inspectImage(buildJpeg({ progressive: true, interScan: [app1Xmp(xmpPacket('<a hdrgm:Version="1"/>'))] })).special.gainMap, true);
    // a between-scans segment whose length runs past the end
    const cut = concat(buildJpeg().subarray(0, -2), Uint8Array.of(0xff, 0xe1, 0x10, 0x00, 1, 2, 3));
    assert.equal(code(() => inspectImage(cut)), 'invalid-image');
  });

  it('detects MPF, gain map XMP, APP11 JUMBF', () => {
    assert.equal(inspectImage(buildJpeg({ segments: [app2Mpf()] })).special.mpf, true);
    assert.equal(inspectImage(buildJpeg({ segments: [app2Icc()] })).special.mpf, false);
    const gm = xmpPacket('<x hdrgm:Version="1.0" xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/"/>');
    assert.equal(inspectImage(buildJpeg({ segments: [app1Xmp(gm)] })).special.gainMap, true);
    assert.equal(inspectImage(buildJpeg({ segments: [app1Xmp()] })).special.gainMap, false);
    assert.equal(inspectImage(buildJpeg({ segments: [app1XmpExt(ascii('hdrgm'))] })).special.gainMap, true);
    assert.equal(inspectImage(buildJpeg({ segments: [app11Jumbf()] })).special.c2pa, true);
  });

  it('reads every SOF flavour', () => {
    for (const m of [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]) {
      const j = buildJpeg({ width: 10, height: 20 });
      const at = j.indexOf(0xc0, 2);
      j[at] = m;
      const r = inspectImage(j);
      assert.deepEqual([r.width, r.height], [10, 20], m.toString(16));
    }
  });

  it('header-limit when SOF lies beyond maxHeaderBytes', () => {
    const big = segment(0xe5, new Uint8Array(60000));
    const j = buildJpeg({ segments: [big, big] });
    assert.equal(code(() => inspectImage(j, { maxHeaderBytes: 50000 })), 'header-limit');
    assert.equal(code(() => inspectImage(j, { maxHeaderBytes: 130000 })), null);
    // SOF starting inside the limit but ending past it
    const sofEnd = inspectImage(j).jpeg.segments.find((s) => s.marker === 0xc0).end;
    assert.equal(code(() => inspectImage(j, { maxHeaderBytes: sofEnd - 1 })), 'header-limit');
    assert.equal(code(() => inspectImage(j, { maxHeaderBytes: sofEnd })), null);
  });

  it('invalid-image on structural errors', () => {
    const j = buildJpeg();
    const sof = inspectImage(j).jpeg.segments.find((s) => s.marker === 0xc0);
    const cases = {
      'truncated before SOF': j.subarray(0, sof.start + 5),
      'garbage instead of marker': concat(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0x12, 0x34), j.subarray(2)),
      'SOS before SOF': concat(Uint8Array.of(0xff, 0xd8), segment(0xda, Uint8Array.of(1, 1, 0, 0, 0x3f, 0)), Uint8Array.of(0xff, 0xd9)),
      'length < 2': concat(Uint8Array.of(0xff, 0xd8, 0xff, 0xe1, 0, 1), j.subarray(2)),
      'segment past end': concat(Uint8Array.of(0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0, 0)),
      'EOI before SOS': Uint8Array.of(0xff, 0xd8, 0xff, 0xd9),
      'zero width': buildJpeg({ width: 0 }),
      'two SOF': buildJpeg({ segments: [segment(0xc0, concat(Uint8Array.of(8), be16(1), be16(1), Uint8Array.of(1, 1, 0x11, 0)))] }),
    };
    for (const [name, b] of Object.entries(cases)) assert.equal(code(() => inspectImage(b)), 'invalid-image', name);
    assert.equal(code(() => inspectImage(new Uint8Array(0))), 'invalid-image');
    assert.equal(code(() => inspectImage(ascii('%PDF-1.4 hello'))), 'invalid-image');
  });

  it('caps the segment count', () => {
    const many = Array.from({ length: MAX_JPEG_SEGMENTS }, () => com('x'));
    assert.equal(code(() => inspectImage(buildJpeg({ segments: many }), { maxHeaderBytes: 1e9 })), 'invalid-image');
    assert.equal(code(() => inspectImage(buildJpeg({ segments: many.slice(0, 100) }))), null);
  });

  it('Orientation 1-8 × II/MM swaps the oriented size for 5-8', () => {
    for (const le of [true, false]) {
      for (let o = 1; o <= 8; o++) {
        const j = buildJpeg({ width: 4000, height: 3000, segments: [app0Jfif(), app1Exif(buildTiff({ le, orientation: o }).bytes)] });
        const r = inspectImage(j);
        assert.equal(r.orientation, o);
        assert.deepEqual([r.orientedWidth, r.orientedHeight], o >= 5 ? [3000, 4000] : [4000, 3000], `${le} ${o}`);
        assert.equal(r.exif.valid, true);
      }
    }
  });

  it('uses the first EXIF APP1 for Orientation and counts EXIF segments', () => {
    const a = app1Exif(buildTiff({ orientation: 6 }).bytes);
    const b = app1Exif(buildTiff({ orientation: 3 }).bytes);
    const r = inspectImage(buildJpeg({ segments: [a, b] }));
    assert.equal(r.orientation, 6);
    assert.equal(r.jpeg.exifCount, 2);
  });

  it('keeps Orientation from IFD0 even when the rest of the EXIF is malformed', () => {
    const r = inspectImage(buildJpeg({ segments: [app1Exif(buildTiff({ orientation: 8, variant: 'cycle' }).bytes)] }));
    assert.equal(r.exif.valid, false);
    assert.equal(r.orientation, 8);
  });
});

describe('readExif', () => {
  it('locates Orientation / PixelX/Y SHORT and LONG in both byte orders', () => {
    for (const le of [true, false]) {
      for (const type of ['short', 'long']) {
        const { bytes } = buildTiff({ le, orientation: 3, pixel: { type, x: 640, y: 480 }, imageSize: { type, w: 640, h: 480 } });
        const r = readExif(bytes);
        assert.equal(r.valid, true);
        assert.equal(r.le, le);
        assert.equal(r.orientation, 3);
        const size = type === 'short' ? 3 : 4;
        for (const k of ['pixelX', 'pixelY', 'imageWidth', 'imageLength']) assert.equal(r.slots[k].type, size, k);
        const rd = (s) => (s.type === 3 ? (le ? bytes[s.at] | (bytes[s.at + 1] << 8) : (bytes[s.at] << 8) | bytes[s.at + 1])
          : new DataView(bytes.buffer, bytes.byteOffset).getUint32(s.at, le));
        assert.equal(rd(r.slots.pixelX), 640);
        assert.equal(rd(r.slots.imageLength), 480);
      }
    }
  });

  it('missing tags stay null; MakerNote / GPS / IFD1 / strips are reported', () => {
    const none = readExif(buildTiff({ orientation: null, pixel: null }).bytes);
    assert.equal(none.valid, true);
    assert.equal(none.orientation, 1);
    assert.equal(none.slots.orientation, null);
    assert.equal(none.slots.pixelX, null);
    const full = readExif(buildTiff({ gps: true, makerNote: true, thumbnail: true }).bytes);
    assert.equal(full.hasMakerNote, true);
    assert.equal(full.gps.entryCount, 5);
    assert.equal(full.ifd1Ranges.length, 2); // IFD1 structure + thumbnail
    const strips = readExif(buildTiff({ ifd1Strips: true }).bytes);
    assert.equal(strips.valid, true);
    assert.ok(strips.ifd1Ranges.length >= 2);
    assert.equal(readExif(buildTiff({ strips: true }).bytes).hasStrips, true);
  });

  it('rejects malformed structures as a typed failure (never throws)', () => {
    const variants = ['cycle', 'overlap', 'oob', 'orientation-long', 'duplicate', 'too-many', 'gps-overlap'];
    for (const variant of variants) {
      for (const le of [true, false]) {
        const r = readExif(buildTiff({ le, variant, gps: variant === 'gps-overlap' }).bytes);
        assert.equal(r.valid, false, variant);
        assert.ok(r.reason, variant);
      }
    }
    for (const le of [true, false]) {
      assert.equal(readExif(buildTiff({ le, makerNote: true, variant: 'makernote-overlap' }).bytes).valid, false, 'MakerNote over IFD0');
      assert.equal(readExif(buildTiff({ le, artist: 'Long artist name', variant: 'ascii-overlap' }).bytes).valid, false, 'ASCII over Exif IFD');
    }
    const thumbOob = readExif(buildTiff({ thumbnail: true, variant: 'thumb-oob' }).bytes);
    assert.equal(thumbOob.valid, false);
    assert.equal(readExif(ascii('XX\0*\0\0\0\x08')).valid, false);
    assert.equal(readExif(ascii('II*\0')).valid, false);
    assert.equal(readExif(ascii('II+\0\x08\0\0\0\0\0\0\0\0\0')).valid, false);
    // value offset past the end
    const t = buildTiff({ le: true, artist: 'a long artist name' }).bytes;
    assert.equal(readExif(t.subarray(0, t.length - 4)).valid, false);
  });
});

describe('inspectImage — PNG / GIF / WebP / others', () => {
  it('reads IHDR, bit depth, APNG and eXIf orientation', () => {
    const p = buildPng({ width: 800, height: 600 });
    const r = inspectImage(p);
    assert.deepEqual([r.format, r.width, r.height, r.bitDepth, r.special.apng, r.special.highBitDepth], ['png', 800, 600, 8, false, false]);
    assert.equal(r.png.chunks[0].type, 'IHDR');
    assert.equal(r.png.chunks.at(-1).type, 'IEND');
    assert.equal(inspectImage(buildPng({ bitDepth: 16 })).special.highBitDepth, true);
    assert.equal(inspectImage(buildPng({ before: [acTL()] })).special.apng, true);
    assert.equal(inspectImage(buildPng({ after: [acTL()] })).special.apng, false);
    assert.equal(inspectImage(buildPng({ before: [chunk('caBX', ascii('jumb'))] })).special.c2pa, true);
    for (const le of [true, false]) {
      const o = inspectImage(buildPng({ width: 800, height: 600, before: [eXIf(buildTiff({ le, orientation: 6 }).bytes)] }));
      assert.deepEqual([o.orientation, o.orientedWidth, o.orientedHeight], [6, 600, 800]);
    }
    const prefixed = inspectImage(buildPng({ before: [eXIf(concat(ascii('Exif\0\0'), buildTiff({ orientation: 7 }).bytes))] }));
    assert.equal(prefixed.orientation, 7);
  });

  it('invalid-image on broken PNG structure', () => {
    const p = buildPng();
    const cases = {
      'no IEND': p.subarray(0, p.length - 12),
      'chunk past end': p.subarray(0, p.length - 3),
      'IHDR not first': concat(PNG_SIG, tEXt('a', 'b'), p.subarray(8)),
      'bad chunk type': concat(PNG_SIG, ihdr(), concat(be32(0), ascii('ID1T'), be32(0)), p.subarray(33)),
      'huge length': concat(PNG_SIG, ihdr(), concat(be32(0xfffffff0), ascii('tEXt')), p.subarray(33)),
      'no IDAT': concat(PNG_SIG, ihdr(), chunk('IEND')),
      'zero width': buildPng({ width: 0 }),
      'signature only': PNG_SIG,
    };
    for (const [name, b] of Object.entries(cases)) assert.equal(code(() => inspectImage(b)), 'invalid-image', name);
  });

  it('GIF logical screen and WebP VP8 / VP8L / VP8X sizes', () => {
    assert.deepEqual(pick(inspectImage(concat(ascii('GIF89a'), Uint8Array.of(0x20, 0x03, 0x58, 0x02), new Uint8Array(10)))), ['gif', 800, 600]);
    const riff = (fourcc, body) => concat(ascii('RIFF'), be32(0), ascii('WEBP'), ascii(fourcc), be32(body.length), body);
    // VP8: frame tag (3) + start code + 14-bit w/h (LE)
    const vp8 = riff('VP8 ', concat(Uint8Array.of(0, 0, 0, 0x9d, 0x01, 0x2a, 0x20, 0x03, 0x58, 0x02), new Uint8Array(10)));
    assert.deepEqual(pick(inspectImage(vp8)), ['webp', 800, 600]);
    // VP8L: 0x2f + 14 bits (w-1) + 14 bits (h-1)
    const bits = (799) | (599 << 14);
    const vp8l = riff('VP8L', concat(Uint8Array.of(0x2f, bits & 0xff, (bits >>> 8) & 0xff, (bits >>> 16) & 0xff, (bits >>> 24) & 0xff), new Uint8Array(10)));
    assert.deepEqual(pick(inspectImage(vp8l)), ['webp', 800, 600]);
    // VP8X: flags(4) + 24-bit (w-1) + 24-bit (h-1)
    const vp8x = riff('VP8X', concat(Uint8Array.of(0, 0, 0, 0, 0x1f, 0x4e, 0x00, 0x0f, 0x27, 0x00), new Uint8Array(10)));
    assert.deepEqual(pick(inspectImage(vp8x)), ['webp', 20000, 10000]);
    assert.equal(code(() => inspectImage(riff('VP8 ', new Uint8Array(20)))), 'invalid-image');
    assert.equal(code(() => inspectImage(riff('ALPH', new Uint8Array(20)))), 'invalid-image');
    assert.equal(code(() => inspectImage(ascii('GIF89a'))), 'invalid-image');
  });

  it('other recognised formats report null dimensions', () => {
    const avif = concat(be32(16), ascii('ftyp'), ascii('avif'), be32(0));
    const r = inspectImage(avif);
    assert.deepEqual([r.format, r.width, r.height, r.orientation], ['avif', null, null, 1]);
    assert.equal(inspectImage(ascii('<svg/>')).format, 'svg');
  });
});

const pick = (r) => [r.format, r.width, r.height];

function checkInspection(r, len) {
  const inRange = (s, e) => Number.isInteger(s) && Number.isInteger(e) && s >= 0 && s <= e && e <= len;
  for (const k of ['width', 'height', 'orientedWidth', 'orientedHeight']) {
    assert.ok(r[k] === null || (Number.isInteger(r[k]) && r[k] > 0), k);
  }
  assert.ok(Number.isInteger(r.orientation) && r.orientation >= 1 && r.orientation <= 8);
  if (r.jpeg) {
    for (const s of r.jpeg.segments) assert.ok(inRange(s.start, s.end) && s.payloadStart <= s.end);
    for (const s of r.jpeg.postScanSegments) assert.ok(inRange(s.start, s.end) && s.start > r.jpeg.sosOffset);
    assert.ok(inRange(r.jpeg.eoiOffset, r.jpeg.eoiOffset + 2));
  }
  if (r.png) for (const c of r.png.chunks) assert.ok(inRange(c.start, c.end) && c.dataStart + c.length + 4 === c.end);
}

describe('fuzz (seeded)', () => {
  it('inspectImage / readExif / sniffFormat on 3000 mutated inputs', { timeout: 60000 }, () => {
    const rand = rng(0x90090);
    const fixtures = fuzzFixtures();
    let threw = 0;
    for (let i = 0; i < 3000; i++) {
      const b = mutate(fixtures[i % fixtures.length], rand);
      sniffFormat(b);
      try {
        checkInspection(inspectImage(b, { maxHeaderBytes: 1 << 20 }), b.length);
      } catch (e) {
        if (!(e instanceof ImageResizeError)) throw e;
        threw++;
      }
      const t = readExif(b, Math.floor(rand() * b.length), b.length);
      assert.equal(typeof t.valid, 'boolean');
    }
    assert.ok(threw > 0 && threw < 3000, `threw ${threw}`);
  });

  it('readExif on mutated TIFFs never throws and keeps offsets in range', { timeout: 60000 }, () => {
    const rand = rng(42);
    const bases = [true, false].map((le) => buildTiff({ le, orientation: 5, gps: true, makerNote: true, thumbnail: true, artist: 'Artist', copyright: 'Copy' }).bytes);
    for (let i = 0; i < 2000; i++) {
      const b = mutate(bases[i & 1], rand);
      const r = readExif(b);
      if (!r.valid) continue;
      for (const s of Object.values(r.slots)) if (s) assert.ok(s.at >= 0 && s.at + (s.type === 3 ? 2 : 4) <= b.length);
      for (const [s, e] of [...(r.ifd1Ranges || []), ...(r.gps ? r.gps.ranges : [])]) assert.ok(s >= 0 && e <= b.length);
    }
  });
});
