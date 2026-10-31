// v0.90.0 (plan docs/internal/plans/v0.90.0-image-resize.md § 5, step 1) — metadata: EXIF patch, GPS zero, XMP
// eligibility, IPTC rebuild, JPEG / PNG assembly, lossless rewrite, summary, fuzz.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ImageResizeError, inspectImage, readExif, jpegSegmentKind } from './image-bytes.js';
import {
  crc32, buildJpegMetadata, assembleJpeg, rewriteJpegLossless, buildPngMetadata, assemblePng, rewritePngLossless,
  readMetadataSummary, xmpEligible, parseIptc, METADATA_MODES, MAX_APP_PAYLOAD,
} from './image-metadata.js';
import {
  ascii, utf8, utf16be, concat, be32, buildTiff, buildJpeg, buildPng, app1Exif, app1Xmp, app1XmpExt, app2Mpf, app2Icc,
  app0Jfif, app14Adobe, app11Jumbf, app5Private, app13Iptc, iimDataset, com, segment, xmpPacket, fakeMakerNote,
  chunk, eXIf, acTL, tEXt, zTXt, iTXt, tIME, crc32ref, rng, mutate, fuzzFixtures, DEFAULT_IPTC,
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
/** Re-encode path: build metadata for a new 1200×900 output and splice it into a fresh synthetic "encoder" JPEG. */
function reencode(src, mode, { width = 1200, height = 900 } = {}) {
  const ins = inspectImage(src);
  const r = buildJpegMetadata(src, ins, { mode, width, height });
  const encoder = buildJpeg({ width, height, segments: [app0Jfif()] });
  const out = assembleJpeg(encoder, r.segments);
  return { ...r, out, ins: inspectImage(out), summary: readMetadataSummary(out) };
}
function exifTiffOf(bytes) {
  const ins = inspectImage(bytes);
  const seg = ins.jpeg.segments.find((s) => jpegSegmentKind(bytes, s) === 'exif');
  return seg ? { seg, tiff: bytes.subarray(seg.payloadStart + 6, seg.end) } : null;
}
const dv = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const slotValue = (tiff, s, le) => (s.type === 3 ? dv(tiff).getUint16(s.at, le) : dv(tiff).getUint32(s.at, le));
const kinds = (bytes) => inspectImage(bytes).jpeg.segments.map((s) => jpegSegmentKind(bytes, s) || s.marker.toString(16));
function app13Resources(bytes) {
  const ins = inspectImage(bytes);
  const seg = ins.jpeg.segments.find((s) => jpegSegmentKind(bytes, s) === 'photoshop');
  if (!seg) return null;
  const ids = [];
  let p = seg.payloadStart + 14;
  while (p + 12 <= seg.end) {
    ids.push((bytes[p + 4] << 8) | bytes[p + 5]);
    const nl = bytes[p + 6];
    const q = p + 6 + ((nl + 2) & ~1);
    const size = dv(bytes).getUint32(q);
    p = q + 4 + size + (size & 1);
  }
  return ids;
}
function pngChunksValid(bytes) {
  const out = [];
  let p = 8;
  while (p < bytes.length) {
    const len = dv(bytes).getUint32(p);
    const type = String.fromCharCode(...bytes.subarray(p + 4, p + 8));
    const crc = dv(bytes).getUint32(p + 8 + len);
    assert.equal(crc, crc32ref(bytes.subarray(p + 4, p + 8 + len)), `CRC of ${type}`);
    assert.equal(crc, crc32(bytes, p + 4, p + 8 + len));
    out.push(type);
    p += 12 + len;
  }
  return out;
}

describe('crc32', () => {
  it('matches the reference vector and the builder table', () => {
    assert.equal(crc32(ascii('123456789')), 0xcbf43926);
    assert.equal(crc32(new Uint8Array(0)), 0);
    const r = rng(7);
    const b = Uint8Array.from({ length: 1000 }, () => Math.floor(r() * 256));
    assert.equal(crc32(b), crc32ref(b));
    assert.equal(crc32(b, 10, 20), crc32ref(b.subarray(10, 20)));
  });
});

describe('EXIF on re-encode', () => {
  it('Orientation 1-8 × II/MM → 1; PixelX/Y patched; APP1 same size; MakerNote untouched in place', () => {
    for (const le of [true, false]) {
      for (let o = 1; o <= 8; o++) {
        const mn = fakeMakerNote(96);
        const t = buildTiff({ le, orientation: o, makerNote: mn, pixel: { type: 'long', x: 6000, y: 4000 } });
        const src = buildJpeg({ width: 6000, height: 4000, segments: [app1Exif(t.bytes)] });
        const r = reencode(src, 'keep', { width: 1200, height: 800 });
        assert.equal(r.metadata.exif, 'patched');
        assert.equal(r.summary.orientation, 1, `${le} ${o}`);
        const { seg, tiff } = exifTiffOf(r.out);
        assert.equal(seg.length, exifTiffOf(src).seg.length);
        const info = readExif(tiff);
        assert.equal(info.valid, true);
        assert.equal(slotValue(tiff, info.slots.pixelX, le), 1200);
        assert.equal(slotValue(tiff, info.slots.pixelY, le), 800);
        assert.deepEqual([...tiff.subarray(t.at.makerNote, t.at.makerNote + mn.length)], [...mn]);
      }
    }
  });

  it('SHORT dims patched; SHORT overflow left as is → partial; missing tags stay missing; ImageWidth/Length patched', () => {
    for (const le of [true, false]) {
      const short = buildTiff({ le, pixel: { type: 'short', x: 6000, y: 4000 }, imageSize: { type: 'short', w: 6000, h: 4000 } });
      const ok = reencode(buildJpeg({ segments: [app1Exif(short.bytes)] }), 'keep', { width: 1200, height: 800 });
      assert.equal(ok.metadata.exif, 'patched');
      let { tiff } = exifTiffOf(ok.out);
      let info = readExif(tiff);
      assert.deepEqual(['pixelX', 'pixelY', 'imageWidth', 'imageLength'].map((k) => slotValue(tiff, info.slots[k], le)), [1200, 800, 1200, 800]);

      const big = reencode(buildJpeg({ segments: [app1Exif(short.bytes)] }), 'keep', { width: 70000, height: 800 });
      assert.equal(big.metadata.exif, 'partial');
      ({ tiff } = exifTiffOf(big.out));
      info = readExif(tiff);
      assert.equal(slotValue(tiff, info.slots.pixelX, le), 6000); // left alone
      assert.equal(slotValue(tiff, info.slots.pixelY, le), 800);

      const missing = reencode(buildJpeg({ segments: [app1Exif(buildTiff({ le, pixel: null, orientation: null }).bytes)] }), 'keep');
      ({ tiff } = exifTiffOf(missing.out));
      info = readExif(tiff);
      assert.equal(info.slots.pixelX, null);
      assert.equal(info.slots.orientation, null);
      assert.equal(missing.metadata.exif, 'exact');
    }
  });

  it('IFD1 disconnected and its thumbnail zeroed in place (JPEG thumbnail and strips)', () => {
    for (const opt of [{ thumbnail: true }, { ifd1Strips: true }]) {
      const t = buildTiff({ le: true, ...opt });
      const src = buildJpeg({ segments: [app1Exif(t.bytes)] });
      const r = reencode(src, 'keep');
      const { tiff } = exifTiffOf(r.out);
      const info = readExif(tiff);
      assert.equal(info.valid, true);
      assert.equal(info.ifd1Ranges, null);
      assert.ok(tiff.subarray(t.at.thumb, t.at.thumb + 40).every((x) => x === 0));
      assert.ok(tiff.subarray(t.at.ifd1, t.at.ifd1 + 6).every((x) => x === 0));
      assert.equal(tiff.length, t.bytes.length);
    }
  });

  it('keep keeps GPS; keep-no-gps zeroes the GPS IFD + values and keeps the pointer', () => {
    for (const le of [true, false]) {
      const t = buildTiff({ le, gps: true });
      const src = buildJpeg({ segments: [app1Exif(t.bytes)] });
      const keep = reencode(src, 'keep');
      assert.equal(keep.metadata.gpsPresent, true);
      assert.equal(keep.summary.exifGps, true);
      const ng = reencode(src, 'keep-no-gps');
      assert.equal(ng.metadata.exif, 'patched');
      assert.equal(ng.metadata.gpsPresent, false);
      assert.equal(ng.summary.exifGps, false);
      const { tiff } = exifTiffOf(ng.out);
      const info = readExif(tiff);
      assert.equal(info.gps.entryCount, 0);
      assert.equal(info.gps.ifdStart, t.at.gps);
      const orig = readExif(t.bytes);
      for (const [s, e] of orig.gps.ranges) assert.ok(tiff.subarray(s, e).every((x) => x === 0));
      // 106° 40' 15" longitude bytes are gone
      assert.equal(indexOfSeq(tiff, be32(106)), -1);
    }
  });

  it('gpsPresent is unknown when an opaque MakerNote is kept without GPS', () => {
    const src = buildJpeg({ segments: [app1Exif(buildTiff({ makerNote: true, gps: true }).bytes)] });
    assert.equal(reencode(src, 'keep-no-gps').metadata.gpsPresent, 'unknown');
    assert.equal(reencode(src, 'keep').metadata.gpsPresent, true);
  });

  it('drops the EXIF family (partial) on strips in IFD0, two EXIF APP1, malformed structure', () => {
    const cases = [
      [app1Exif(buildTiff({ strips: true }).bytes)],
      [app1Exif(buildTiff({ orientation: 6 }).bytes), app1Exif(buildTiff({}).bytes)],
      ...['cycle', 'overlap', 'oob', 'orientation-long', 'duplicate', 'too-many'].map((variant) => [app1Exif(buildTiff({ variant }).bytes)]),
      [app1Exif(buildTiff({ thumbnail: true, variant: 'thumb-oob' }).bytes)],
      [app1Exif(buildTiff({ gps: true, variant: 'gps-overlap' }).bytes)],
      [app1Exif(ascii('garbage!'))],
    ];
    for (const segs of cases) {
      for (const mode of ['keep', 'keep-no-gps', 'copyright']) {
        const r = reencode(buildJpeg({ segments: segs }), mode);
        assert.equal(r.metadata.exif, 'partial', mode);
        assert.equal(r.summary.hasExif, false, mode);
      }
    }
  });

  it('APP1 at the 65533-byte limit is patched without growing', () => {
    const base = buildTiff({ le: true, orientation: 6, makerNote: new Uint8Array(100), thumbnail: true }).bytes.length;
    // TIFF blobs are padded to even sizes, so build 65532 and add one unreferenced trailing byte → 65533 exactly
    const mnSize = 100 + (MAX_APP_PAYLOAD - 1 - 6 - base);
    const t = buildTiff({ le: true, orientation: 6, makerNote: fakeMakerNote(mnSize), thumbnail: true });
    const app1 = app1Exif(concat(t.bytes, Uint8Array.of(0)));
    const payload = app1.length - 4;
    assert.equal(payload, MAX_APP_PAYLOAD);
    const r = reencode(buildJpeg({ segments: [app1] }), 'keep');
    const { seg } = exifTiffOf(r.out);
    assert.equal(seg.length, payload + 2);
    assert.equal(r.summary.orientation, 1);
  });

  it('copyright: fresh minimal EXIF with Artist / Copyright only, no Orientation on re-encode', () => {
    for (const le of [true, false]) {
      const t = buildTiff({ le, orientation: 6, gps: true, makerNote: true, artist: 'Nguyen Van A', copyright: '(c) 2026' });
      const r = reencode(buildJpeg({ segments: [app1Exif(t.bytes)] }), 'copyright');
      assert.equal(r.metadata.exif, 'rebuilt');
      assert.equal(r.metadata.gpsPresent, false);
      assert.deepEqual(r.summary.exifTags, [0x013b, 0x8298]);
      const { tiff } = exifTiffOf(r.out);
      const info = readExif(tiff);
      assert.equal(info.le, le);
      assert.equal(ascii('Nguyen Van A\0').join(), tiff.subarray(info.artist.at, info.artist.at + info.artist.length).join());
      assert.equal(ascii('(c) 2026\0').join(), tiff.subarray(info.copyright.at, info.copyright.at + info.copyright.length).join());
    }
    // short values (≤ 4 bytes, inline) and none at all
    const short = reencode(buildJpeg({ segments: [app1Exif(buildTiff({ artist: 'AB', copyright: 'C' }).bytes)] }), 'copyright');
    assert.equal(readMetadataSummary(short.out).exifTags.length, 2);
    const nothing = reencode(buildJpeg({ segments: [app1Exif(buildTiff({}).bytes)] }), 'copyright');
    assert.equal(nothing.metadata.exif, 'dropped');
    assert.equal(nothing.summary.hasExif, false);
  });

  it('none drops everything; absent families report absent', () => {
    const src = buildJpeg({ segments: [app1Exif(buildTiff({ gps: true, orientation: 6 }).bytes), app1Xmp(), app13Iptc()] });
    const r = reencode(src, 'none');
    assert.deepEqual([r.metadata.exif, r.metadata.xmp, r.metadata.iptc, r.metadata.gpsPresent], ['dropped', 'dropped', 'dropped', false]);
    assert.equal(r.segments.length, 0);
    const bare = reencode(buildJpeg(), 'keep');
    assert.deepEqual([bare.metadata.exif, bare.metadata.xmp, bare.metadata.iptc, bare.metadata.gpsPresent], ['absent', 'absent', 'absent', false]);
  });

  it('refuses special JPEGs', () => {
    for (const extra of [{ segments: [app2Mpf()] }, { segments: [app11Jumbf()] }, { trailing: ascii('x') },
      { segments: [app1Xmp(xmpPacket('<a hdrgm:Version="1"/>'))] }]) {
      const src = buildJpeg(extra);
      assert.equal(code(() => buildJpegMetadata(src, inspectImage(src), { mode: 'keep', width: 1, height: 1 })), 'special-content-transform-required');
    }
  });
});

function indexOfSeq(b, seq) {
  outer: for (let i = 0; i + seq.length <= b.length; i++) {
    for (let k = 0; k < seq.length; k++) if (b[i + k] !== seq[k]) continue outer;
    return i;
  }
  return -1;
}

describe('XMP eligibility', () => {
  it('verbatim only in keep, only one eligible Standard packet', () => {
    const good = app1Xmp();
    const r = reencode(buildJpeg({ segments: [good] }), 'keep');
    assert.equal(r.metadata.xmp, 'verbatim');
    const seg = r.ins.jpeg.segments.find((s) => jpegSegmentKind(r.out, s) === 'xmp');
    assert.deepEqual([...r.out.subarray(seg.start, seg.end)], [...good]);
    for (const mode of ['keep-no-gps', 'copyright', 'none']) {
      const x = reencode(buildJpeg({ segments: [good] }), mode);
      assert.equal(x.metadata.xmp, 'dropped');
      assert.equal(x.summary.hasXmp, false);
    }
  });

  it('drops extended / denylisted / UTF-16 / invalid UTF-8 / HasExtendedXMP / duplicate packets', () => {
    const p = (inner) => app1Xmp(xmpPacket(inner));
    const cases = {
      extended: [app1Xmp(), app1XmpExt()],
      'tiff:Orientation': [p('<tiff:Orientation>6</tiff:Orientation>')],
      'exif:PixelXDimension attr': [p('<rdf:Description exif:PixelXDimension="6000"/>')],
      'xmpMM:DocumentID': [p('<xmpMM:DocumentID>x</xmpMM:DocumentID>')],
      'crs:': [p('<crs:Exposure2012>0</crs:Exposure2012>')],
      HasExtendedXMP: [p('<xmpNote:HasExtendedXMP>ABC</xmpNote:HasExtendedXMP>')],
      'UTF-16 no BOM': [app1Xmp(utf16be(xmpPacket()))],
      'UTF-16 BOM': [app1Xmp(concat(Uint8Array.of(0xfe, 0xff), utf16be(xmpPacket())))],
      'invalid UTF-8': [app1Xmp(concat(utf8(xmpPacket()), Uint8Array.of(0xc3, 0x28)))],
      'two packets': [app1Xmp(), app1Xmp()],
    };
    for (const [name, segs] of Object.entries(cases)) {
      const r = reencode(buildJpeg({ segments: segs }), 'keep');
      assert.equal(r.metadata.xmp, 'dropped', name);
      assert.equal(r.summary.hasXmp, false, name);
    }
    assert.equal(xmpEligible(utf8(xmpPacket('<dc:title>Ảnh đẹp</dc:title>'))), true);
    assert.equal(xmpEligible(utf8('ImageWidth')), false);
  });

  it('XMP with GPS makes gpsPresent true in keep', () => {
    const r = reencode(buildJpeg({ segments: [app1Xmp(xmpPacket('<exif:GPSLatitude>10,45N</exif:GPSLatitude>'))] }), 'keep');
    assert.equal(r.metadata.xmp, 'verbatim');
    assert.equal(r.metadata.gpsPresent, true);
  });
});

describe('IPTC', () => {
  const ds = (summary) => summary.iptcDatasets;
  it('keep rebuilds APP13 with only the 0x0404 resource (thumbnail / ICC resources gone)', () => {
    const src = buildJpeg({ segments: [app13Iptc({ extra: [[0x0409, new Uint8Array(200).fill(9)], [0x040c, new Uint8Array(51)], [0x040f, new Uint8Array(30)]] })] });
    const r = reencode(src, 'keep');
    assert.equal(r.metadata.iptc, 'rebuilt');
    assert.deepEqual(app13Resources(r.out), [0x0404]);
    assert.deepEqual(ds(r.summary), DEFAULT_IPTC.map(([a, b]) => `${a}:${b}`));
  });

  it('keep-no-gps drops location datasets; copyright keeps 2:80 + 2:116 (+ 1:90 charset)', () => {
    const src = buildJpeg({ segments: [app13Iptc()] });
    assert.deepEqual(ds(reencode(src, 'keep-no-gps').summary), ['1:90', '2:5', '2:25', '2:80', '2:116']);
    assert.deepEqual(ds(reencode(src, 'copyright').summary), ['1:90', '2:80', '2:116']);
    const none = reencode(src, 'none');
    assert.equal(none.metadata.iptc, 'dropped');
    assert.equal(none.summary.hasIptc, false);
    const onlyCharset = buildJpeg({ segments: [app13Iptc({ datasets: [[1, 90, Uint8Array.of(0x1b, 0x25, 0x47)], [2, 25, 'k']] })] });
    const c = reencode(onlyCharset, 'copyright');
    assert.equal(c.metadata.iptc, 'dropped');
    assert.equal(c.summary.hasIptc, false);
  });

  it('malformed IPTC → partial, never copied', () => {
    const bad = {
      'extended length': concat(Uint8Array.of(0x1c, 2, 80, 0x80, 0x04), be32(3), ascii('abc')),
      'length past end': concat(Uint8Array.of(0x1c, 2, 80, 0x00, 0x40), ascii('abc')),
      'garbage byte': concat(iimDataset(2, 80, 'A'), Uint8Array.of(0x55)),
      'truncated header': Uint8Array.of(0x1c, 2, 80),
    };
    for (const [name, rawIim] of Object.entries(bad)) {
      const r = reencode(buildJpeg({ segments: [app13Iptc({ rawIim })] }), 'keep');
      assert.equal(r.metadata.iptc, 'partial', name);
      assert.equal(r.summary.hasIptc, false, name);
    }
    const twoApp13 = reencode(buildJpeg({ segments: [app13Iptc(), app13Iptc()] }), 'keep');
    assert.equal(twoApp13.metadata.iptc, 'partial');
    const notBim = segment(0xed, concat(ascii('Photoshop 3.0\0'), ascii('XXXX'), new Uint8Array(20)));
    assert.equal(reencode(buildJpeg({ segments: [notBim] }), 'keep').metadata.iptc, 'partial');
    // zero padding inside the IIM data is fine
    const padded = reencode(buildJpeg({ segments: [app13Iptc({ rawIim: concat(iimDataset(2, 80, 'A'), new Uint8Array(3)) })] }), 'keep');
    assert.equal(padded.metadata.iptc, 'rebuilt');
  });

  it('APP13 without an IPTC resource counts as absent / dropped', () => {
    const seg = segment(0xed, concat(ascii('Photoshop 3.0\0'), ascii('8BIM'), Uint8Array.of(4, 9, 0, 0), be32(2), Uint8Array.of(1, 2)));
    assert.deepEqual(parseIptc(seg, 4, seg.length), { ok: true, datasets: [] });
    assert.equal(reencode(buildJpeg({ segments: [seg] }), 'keep').metadata.iptc, 'absent');
  });
});

describe('assembleJpeg', () => {
  it('SOI + segments + encoder output without its SOI', () => {
    const enc = buildJpeg({ segments: [app0Jfif(), app2Icc(), app14Adobe()] });
    const s1 = app1Exif(buildTiff({}).bytes);
    const out = assembleJpeg(enc, [s1]);
    assert.deepEqual([...out.subarray(0, 2)], [0xff, 0xd8]);
    assert.deepEqual([...out.subarray(2, 2 + s1.length)], [...s1]);
    assert.deepEqual([...out.subarray(2 + s1.length)], [...enc.subarray(2)]);
    assert.deepEqual(kinds(out).slice(0, 4), ['exif', 'jfif', 'icc', 'adobe']);
    assert.equal(code(() => assembleJpeg(buildPng(), [])), 'output-type-mismatch');
    assert.equal(code(() => assembleJpeg(new Uint8Array(0), [])), 'output-type-mismatch');
  });
});

describe('rewriteJpegLossless', () => {
  const full = () => buildJpeg({
    progressive: true, scans: 4,
    segments: [app0Jfif(), app1Exif(buildTiff({ le: true, orientation: 6, gps: true, thumbnail: true, artist: 'A', copyright: 'C2026' }).bytes),
      app1Xmp(), app2Icc(), app5Private(), app13Iptc(), app14Adobe(), com('secret')],
  });

  it('copies SOS..end byte-for-byte and keeps structural segments in order', () => {
    const src = full();
    const ins = inspectImage(src);
    for (const mode of ['keep-no-gps', 'copyright', 'none']) {
      const { bytes, metadata } = rewriteJpegLossless(src, ins, mode);
      const tailLen = src.length - ins.jpeg.sosOffset;
      assert.deepEqual([...bytes.subarray(bytes.length - tailLen)], [...src.subarray(ins.jpeg.sosOffset)], mode);
      const k = kinds(bytes);
      assert.ok(!k.includes('com') && !k.includes('xmp') && !k.includes('app'), `${mode}: ${k}`);
      const order = k.filter((x) => ['jfif', 'exif', 'icc', 'photoshop', 'adobe', 'db', 'c2', 'c4', 'dd', 'da'].includes(x));
      const want = mode === 'none'
        ? ['jfif', 'exif', 'icc', 'adobe', 'db', 'c2', 'c4', 'dd', 'da']
        : ['jfif', 'exif', 'icc', 'photoshop', 'adobe', 'db', 'c2', 'c4', 'dd', 'da'];
      assert.deepEqual(order, want, mode);
      assert.equal(metadata.xmp, 'dropped');
      const out = inspectImage(bytes);
      assert.equal(out.orientation, 6, `${mode} keeps Orientation`);
      assert.equal(out.jpeg.scans, 4);
    }
  });

  it('keep-no-gps: GPS zeroed, thumbnail and Orientation kept, IPTC location gone', () => {
    const src = full();
    const { bytes, metadata } = rewriteJpegLossless(src, inspectImage(src), 'keep-no-gps');
    assert.equal(metadata.exif, 'patched');
    const s = readMetadataSummary(bytes);
    assert.equal(s.exifGps, false);
    assert.equal(s.orientation, 6);
    assert.ok(!s.iptcDatasets.includes('2:90'));
    const { tiff } = exifTiffOf(bytes);
    assert.notEqual(readExif(tiff).ifd1Ranges, null);
    const noGps = buildJpeg({ segments: [app1Exif(buildTiff({}).bytes)] });
    assert.equal(rewriteJpegLossless(noGps, inspectImage(noGps), 'keep-no-gps').metadata.exif, 'exact');
  });

  it('copyright / none keep Orientation ≠ 1 in a minimal EXIF', () => {
    const src = full();
    const c = rewriteJpegLossless(src, inspectImage(src), 'copyright');
    assert.deepEqual(readMetadataSummary(c.bytes).exifTags, [0x0112, 0x013b, 0x8298]);
    const n = rewriteJpegLossless(src, inspectImage(src), 'none');
    assert.equal(n.metadata.exif, 'rebuilt');
    assert.deepEqual(readMetadataSummary(n.bytes).exifTags, [0x0112]);
    // malformed EXIF with Orientation 8 → partial, Orientation survives
    const bad = buildJpeg({ segments: [app1Exif(buildTiff({ orientation: 8, variant: 'cycle' }).bytes)] });
    const b = rewriteJpegLossless(bad, inspectImage(bad), 'keep-no-gps');
    assert.equal(b.metadata.exif, 'partial');
    assert.equal(readMetadataSummary(b.bytes).orientation, 8);
    // Orientation 1 + none → no EXIF at all
    const plain = buildJpeg({ segments: [app1Exif(buildTiff({ orientation: 1 }).bytes)] });
    const p = rewriteJpegLossless(plain, inspectImage(plain), 'none');
    assert.equal(p.metadata.exif, 'dropped');
    assert.equal(readMetadataSummary(p.bytes).hasExif, false);
  });

  it('keep returns an unchanged copy; special JPEGs are refused', () => {
    const src = full();
    const k = rewriteJpegLossless(src, inspectImage(src), 'keep');
    assert.deepEqual([...k.bytes], [...src]);
    assert.notEqual(k.bytes.buffer, src.buffer);
    assert.equal(k.metadata.exif, 'exact');
    for (const extra of [{ segments: [app2Mpf()] }, { segments: [app11Jumbf()] }, { trailing: buildJpeg() }]) {
      const s = buildJpeg(extra);
      assert.equal(code(() => rewriteJpegLossless(s, inspectImage(s), 'none')), 'metadata-policy-unsupported');
    }
    assert.throws(() => rewriteJpegLossless(src, inspectImage(src), 'bogus'), TypeError);
    assert.equal(code(() => rewriteJpegLossless(buildPng(), inspectImage(buildPng()), 'none')), 'invalid-image');
  });
});

describe('PNG', () => {
  const xmpChunk = (inner, opts) => iTXt('XML:com.adobe.xmp', xmpPacket(inner), opts);
  const src = () => buildPng({
    before: [chunk('gAMA', be32(45455)), eXIf(buildTiff({ le: true, orientation: 6, gps: true, makerNote: true, artist: 'A' }).bytes),
      xmpChunk('<dc:title>x</dc:title>'), tEXt('Title', 't'), tEXt('Author', 'a'), tEXt('Description', 'd'), tEXt('Copyright', 'c'),
      tEXt('Location', 'Hanoi'), zTXt('Raw profile type exif'), iTXt('Comment', 'Bình luận'), tIME(), chunk('prVt', ascii('private'))],
  });
  const texts = (b) => readMetadataSummary(b).textKeywords;

  it('re-encode: metadata chunks after IHDR with valid CRCs, per mode', () => {
    const s = src();
    const ins = inspectImage(s);
    const enc = buildPng({ width: 300, height: 400, before: [chunk('sRGB', Uint8Array.of(0))] });
    const want = {
      keep: { types: ['IHDR', 'eXIf', 'iTXt', 'tEXt', 'tEXt', 'tEXt', 'tEXt', 'tEXt', 'zTXt', 'iTXt', 'tIME', 'sRGB', 'IDAT', 'IEND'],
        texts: ['Title', 'Author', 'Description', 'Copyright', 'Location', 'Raw profile type exif', 'Comment'], xmp: 'verbatim', exif: 'patched' },
      'keep-no-gps': { types: ['IHDR', 'eXIf', 'tEXt', 'tEXt', 'tEXt', 'tEXt', 'tIME', 'sRGB', 'IDAT', 'IEND'],
        texts: ['Title', 'Author', 'Description', 'Copyright'], xmp: 'dropped', exif: 'patched' },
      copyright: { types: ['IHDR', 'tEXt', 'tEXt', 'sRGB', 'IDAT', 'IEND'], texts: ['Author', 'Copyright'], xmp: 'dropped', exif: 'dropped' },
      none: { types: ['IHDR', 'sRGB', 'IDAT', 'IEND'], texts: [], xmp: 'dropped', exif: 'dropped' },
    };
    for (const mode of METADATA_MODES) {
      const r = buildPngMetadata(s, ins, { mode, width: 300, height: 400 });
      const out = assemblePng(enc, r.chunks);
      assert.deepEqual(pngChunksValid(out), want[mode].types, mode);
      assert.deepEqual(texts(out), want[mode].texts, mode);
      assert.equal(r.metadata.xmp, want[mode].xmp, mode);
      assert.equal(r.metadata.exif, want[mode].exif, mode);
      const sum = readMetadataSummary(out);
      assert.equal(sum.orientation, 1, mode);
      assert.equal(sum.exifGps, mode === 'keep' ? true : false, mode);
      const o = inspectImage(out);
      assert.deepEqual([o.width, o.height], [300, 400]);
    }
  });

  it('eXIf PixelX/Y patched on re-encode', () => {
    const s = buildPng({ before: [eXIf(buildTiff({ le: false, orientation: 6, pixel: { type: 'short', x: 400, y: 300 } }).bytes)] });
    const r = buildPngMetadata(s, inspectImage(s), { mode: 'keep', width: 150, height: 200 });
    const tiff = r.chunks[0].data;
    const info = readExif(tiff);
    assert.deepEqual([slotValue(tiff, info.slots.pixelX, false), slotValue(tiff, info.slots.pixelY, false), info.orientation], [150, 200, 1]);
  });

  it('compressed / ineligible XMP iTXt dropped in keep', () => {
    for (const c of [xmpChunk('<x/>', { compressed: true }), xmpChunk('<tiff:Orientation>1</tiff:Orientation>')]) {
      const s = buildPng({ before: [c] });
      assert.equal(buildPngMetadata(s, inspectImage(s), { mode: 'keep', width: 1, height: 1 }).metadata.xmp, 'dropped');
    }
  });

  it('lossless rewrite: allowed + filtered chunks, IDAT verbatim, Orientation kept', () => {
    const s = src();
    const ins = inspectImage(s);
    const lossless = {
      'keep-no-gps': ['IHDR', 'gAMA', 'eXIf', 'tEXt', 'tEXt', 'tEXt', 'tEXt', 'tIME', 'IDAT', 'IEND'],
      copyright: ['IHDR', 'gAMA', 'eXIf', 'tEXt', 'tEXt', 'IDAT', 'IEND'],
      none: ['IHDR', 'gAMA', 'eXIf', 'IDAT', 'IEND'],
    };
    for (const [mode, types] of Object.entries(lossless)) {
      const { bytes, metadata } = rewritePngLossless(s, ins, mode);
      assert.deepEqual(pngChunksValid(bytes), types, mode);
      const sum = readMetadataSummary(bytes);
      assert.equal(sum.orientation, 6, mode);
      assert.equal(sum.exifGps, false, mode);
      assert.equal(sum.hasXmp, false, mode);
      if (mode !== 'keep-no-gps') assert.deepEqual(sum.exifTags, [0x0112], mode);
      assert.equal(metadata.exif, mode === 'keep-no-gps' ? 'patched' : 'rebuilt');
      const idat = (b) => { const i = inspectImage(b).png.chunks.find((c) => c.type === 'IDAT'); return [...b.subarray(i.start, i.end)]; };
      assert.deepEqual(idat(bytes), idat(s));
    }
    const k = rewritePngLossless(s, ins, 'keep');
    assert.deepEqual([...k.bytes], [...s]);
    // 16-bit is fine losslessly; zero padding after IEND is not copied (non-zero trailing content is refused, see security r1)
    const deep = concat(buildPng({ bitDepth: 16, before: [tEXt('Author', 'a')] }), new Uint8Array(16));
    const d = rewritePngLossless(deep, inspectImage(deep), 'none');
    assert.deepEqual(pngChunksValid(d.bytes), ['IHDR', 'IDAT', 'IEND']);
    const junk = concat(buildPng({ bitDepth: 16 }), ascii('junk'));
    assert.equal(code(() => rewritePngLossless(junk, inspectImage(junk), 'none')), 'metadata-policy-unsupported');
  });

  it('refusals: unknown critical chunk, APNG, 16-bit / C2PA re-encode, bad encoder output', () => {
    const crit = buildPng({ before: [chunk('XyZw', ascii('?'))] });
    assert.equal(code(() => rewritePngLossless(crit, inspectImage(crit), 'none')), 'invalid-image');
    assert.equal(code(() => buildPngMetadata(crit, inspectImage(crit), { mode: 'keep', width: 1, height: 1 })), 'invalid-image');
    const apng = buildPng({ before: [acTL()] });
    assert.equal(code(() => rewritePngLossless(apng, inspectImage(apng), 'none')), 'metadata-policy-unsupported');
    assert.equal(code(() => buildPngMetadata(apng, inspectImage(apng), { mode: 'keep', width: 1, height: 1 })), 'special-content-transform-required');
    const deep = buildPng({ bitDepth: 16 });
    assert.equal(code(() => buildPngMetadata(deep, inspectImage(deep), { mode: 'keep', width: 1, height: 1 })), 'special-content-transform-required');
    assert.equal(code(() => assemblePng(buildJpeg(), [])), 'output-type-mismatch');
    assert.equal(code(() => assemblePng(concat(buildPng().subarray(0, 8), tEXt('a', 'b')), [])), 'output-type-mismatch');
  });
});

describe('Codex impl review r1 regressions', () => {
  it('ISSUE-1: metadata between scans → lossless rewrite refused; summary sees it', () => {
    for (const inter of [[app1Xmp()], [com('secret')], [app13Iptc()], [app1Exif(buildTiff({ gps: true }).bytes)], [app11Jumbf()], [app2Mpf()]]) {
      const j = buildJpeg({ progressive: true, scans: 3, interScan: inter });
      const ins = inspectImage(j);
      for (const mode of ['keep-no-gps', 'copyright', 'none']) {
        assert.equal(code(() => rewriteJpegLossless(j, ins, mode)), 'metadata-policy-unsupported', `${mode} ${inter[0][1].toString(16)}`);
      }
    }
    const xmp = readMetadataSummary(buildJpeg({ progressive: true, interScan: [app1Xmp(xmpPacket('<exif:GPSLatitude>1</exif:GPSLatitude>'))] }));
    assert.equal(xmp.hasXmp, true);
    assert.equal(xmp.gpsPresent, true);
    assert.equal(readMetadataSummary(buildJpeg({ progressive: true, interScan: [app11Jumbf()] })).contentCredentials, true);
    assert.deepEqual(readMetadataSummary(buildJpeg({ progressive: true, interScan: [app13Iptc()] })).iptcDatasets.slice(0, 2), ['1:90', '2:5']);
    const ex = readMetadataSummary(buildJpeg({ progressive: true, interScan: [app1Exif(buildTiff({}).bytes)] }));
    assert.equal(ex.hasExif, true);
    assert.equal(ex.gpsPresent, 'unknown');
    // tables / scans between scans are fine and copied byte-for-byte
    const ok = buildJpeg({ progressive: true, scans: 4, interScan: [segment(0xdb, concat(Uint8Array.of(1), new Uint8Array(64).fill(2)))] });
    const okIns = inspectImage(ok);
    const r = rewriteJpegLossless(ok, okIns, 'none');
    assert.deepEqual([...r.bytes.subarray(r.bytes.length - (ok.length - okIns.jpeg.sosOffset))], [...ok.subarray(okIns.jpeg.sosOffset)]);
  });

  it('ISSUE-3: a reserved length-bearing marker (0xF0) before SOS is dropped by the lossless rewrite', () => {
    const j = buildJpeg({ segments: [app0Jfif(), segment(0xf0, ascii('reserved payload')), app14Adobe()] });
    const ins = inspectImage(j);
    assert.ok(ins.jpeg.segments.some((s) => s.marker === 0xf0));
    const out = rewriteJpegLossless(j, ins, 'none').bytes;
    const markers = inspectImage(out).jpeg.segments.map((s) => s.marker);
    assert.ok(!markers.includes(0xf0));
    assert.deepEqual(markers, [0xe0, 0xee, 0xdb, 0xc0, 0xc4, 0xdd, 0xda]);
  });

  it('ISSUE-4: out-of-line values overlapping an IFD table invalidate the EXIF family', () => {
    for (const t of [buildTiff({ makerNote: true, variant: 'makernote-overlap' }), buildTiff({ artist: 'Long artist name', variant: 'ascii-overlap' })]) {
      const r = reencode(buildJpeg({ segments: [app1Exif(t.bytes)] }), 'keep');
      assert.equal(r.metadata.exif, 'partial');
      assert.equal(r.summary.hasExif, false);
    }
  });

  it('ISSUE-5: odd-sized 8BIM resource without its pad byte → IPTC partial', () => {
    // even-sized IIM needs no pad byte → valid; odd-sized IIM ending the APP13 without its pad byte → malformed
    const iim = iimDataset(2, 80, 'A');
    assert.equal(iim.length & 1, 0);
    const seg = segment(0xed, concat(ascii('Photoshop 3.0\0'), ascii('8BIM'), Uint8Array.of(4, 4, 0, 0), be32(iim.length), iim));
    const odd = iimDataset(2, 80, 'AB');
    assert.equal(odd.length & 1, 1);
    const bad = segment(0xed, concat(ascii('Photoshop 3.0\0'), ascii('8BIM'), Uint8Array.of(4, 4, 0, 0), be32(odd.length), odd));
    assert.equal(parseIptc(bad, 4, bad.length).ok, false);
    assert.equal(reencode(buildJpeg({ segments: [bad] }), 'keep').metadata.iptc, 'partial');
    assert.equal(parseIptc(seg, 4, seg.length).ok, true);
  });

  it('ISSUE-6: exact keep reports gpsPresent false for valid GPS-free EXIF without MakerNote (JPEG + PNG)', () => {
    const t = buildTiff({ le: true });
    const png = buildPng({ before: [eXIf(t.bytes)] });
    assert.equal(rewritePngLossless(png, inspectImage(png), 'keep').metadata.gpsPresent, false);
    const jpg = buildJpeg({ segments: [app1Exif(t.bytes)] });
    assert.equal(rewriteJpegLossless(jpg, inspectImage(jpg), 'keep').metadata.gpsPresent, false);
    assert.equal(readMetadataSummary(jpg).gpsPresent, false);
    const mn = buildPng({ before: [eXIf(buildTiff({ makerNote: true }).bytes)] });
    assert.equal(rewritePngLossless(mn, inspectImage(mn), 'keep').metadata.gpsPresent, 'unknown');
    const broken = buildPng({ before: [eXIf(buildTiff({ variant: 'cycle' }).bytes)] });
    assert.equal(rewritePngLossless(broken, inspectImage(broken), 'keep').metadata.gpsPresent, 'unknown');
    const gps = buildJpeg({ segments: [app1Exif(buildTiff({ gps: true }).bytes)] });
    assert.equal(rewriteJpegLossless(gps, inspectImage(gps), 'keep').metadata.gpsPresent, true);
    const noExif = buildPng();
    assert.equal(rewritePngLossless(noExif, inspectImage(noExif), 'keep').metadata.gpsPresent, false);
  });
});

describe('readMetadataSummary', () => {
  it('non-JPEG/PNG formats are unsupported, not errors', () => {
    const s = readMetadataSummary(concat(ascii('GIF89a'), new Uint8Array(10)));
    assert.equal(s.format, 'gif');
    assert.equal(s.supported, false);
    assert.equal(readMetadataSummary(ascii('hello')).format, null);
  });

  it('reports C2PA and invalid EXIF as unknown GPS', () => {
    assert.equal(readMetadataSummary(buildJpeg({ segments: [app11Jumbf()] })).contentCredentials, true);
    const s = readMetadataSummary(buildJpeg({ segments: [app1Exif(buildTiff({ variant: 'oob' }).bytes)] }));
    assert.equal(s.exifValid, false);
    assert.equal(s.gpsPresent, 'unknown');
    assert.equal(s.exifGps, 'unknown');
  });
});

describe('fuzz (seeded)', () => {
  it('every metadata entry point on 2500 mutated inputs throws only ImageResizeError', { timeout: 120000 }, () => {
    const rand = rng(0x5eed);
    const fixtures = [
      ...fuzzFixtures(),
      buildJpeg({ segments: [app0Jfif(), app1Exif(buildTiff({ le: false, orientation: 3, gps: true, thumbnail: true, makerNote: true, artist: 'Artist name', copyright: 'Copyright text' }).bytes), app1Xmp(), app13Iptc(), app2Icc(), app14Adobe()] }),
      buildPng({ before: [eXIf(buildTiff({ le: true, gps: true, thumbnail: true }).bytes), tEXt('Author', 'a'), iTXt('XML:com.adobe.xmp', xmpPacket())] }),
    ];
    let ok = 0;
    const guard = (fn) => {
      try {
        const r = fn();
        ok++;
        return r;
      } catch (e) {
        if (!(e instanceof ImageResizeError)) throw e;
        return null;
      }
    };
    for (let i = 0; i < 2500; i++) {
      const b = mutate(fixtures[i % fixtures.length], rand);
      guard(() => readMetadataSummary(b));
      const ins = guard(() => inspectImage(b));
      if (!ins) continue;
      for (const mode of METADATA_MODES) {
        if (ins.format === 'jpeg') {
          const m = guard(() => buildJpegMetadata(b, ins, { mode, width: 640, height: 480 }));
          if (m) {
            for (const s of m.segments) assert.ok(s.length - 4 <= MAX_APP_PAYLOAD && s[0] === 0xff);
            guard(() => readMetadataSummary(assembleJpeg(buildJpeg({ width: 640, height: 480 }), m.segments)));
          }
          const l = guard(() => rewriteJpegLossless(b, ins, mode));
          if (l) assert.deepEqual(l.bytes.subarray(l.bytes.length - (b.length - ins.jpeg.sosOffset)).join(), b.subarray(ins.jpeg.sosOffset).join());
        } else if (ins.format === 'png') {
          const m = guard(() => buildPngMetadata(b, ins, { mode, width: 64, height: 48 }));
          if (m) pngChunksValid(assemblePng(buildPng({ width: 64, height: 48 }), m.chunks));
          const l = guard(() => rewritePngLossless(b, ins, mode));
          if (l) inspectImage(l.bytes); // verbatim chunks keep their (possibly mutated) CRC; structure must stay valid
        }
      }
    }
    assert.ok(ok > 1000, `ok ${ok}`);
  });
});

describe('Codex impl review r2 regressions', () => {
  const gpsXmp = () => app1Xmp(xmpPacket('<exif:GPSLatitude>21,1N</exif:GPSLatitude>'));

  it('ISSUE-8: a DAC (0xCC) segment between arithmetic scans is copied verbatim by the lossless rewrite', () => {
    const j = buildJpeg({ progressive: true, scans: 3, interScan: [segment(0xcc, Uint8Array.of(0x00, 0x10))] });
    const ins = inspectImage(j);
    assert.ok(ins.jpeg.postScanSegments.some((s) => s.marker === 0xcc));
    for (const mode of ['keep-no-gps', 'copyright', 'none']) {
      const r = rewriteJpegLossless(j, ins, mode);
      assert.deepEqual([...r.bytes.subarray(r.bytes.length - (j.length - ins.jpeg.sosOffset))], [...j.subarray(ins.jpeg.sosOffset)], mode);
    }
  });

  it('ISSUE-9: XMP GPS sets gpsPresent=true even with malformed EXIF or a MakerNote, JPEG and PNG', () => {
    const bad = readMetadataSummary(buildJpeg({ segments: [app1Exif(buildTiff({ variant: 'cycle' }).bytes), gpsXmp()] }));
    assert.equal(bad.exifValid, false);
    assert.equal(bad.gpsPresent, true);
    const mn = readMetadataSummary(buildJpeg({ segments: [app1Exif(buildTiff({ makerNote: true }).bytes), gpsXmp()] }));
    assert.equal(mn.hasMakerNote, true);
    assert.equal(mn.gpsPresent, true);
    // without the XMP the same files stay 'unknown'
    assert.equal(readMetadataSummary(buildJpeg({ segments: [app1Exif(buildTiff({ makerNote: true }).bytes)] })).gpsPresent, 'unknown');
    const xmpChunk = iTXt('XML:com.adobe.xmp', xmpPacket('<exif:GPSLatitude>21,1N</exif:GPSLatitude>'));
    const png = readMetadataSummary(buildPng({ before: [xmpChunk] }));
    assert.equal(png.hasXmp, true);
    assert.equal(png.gpsPresent, true);
    assert.equal(readMetadataSummary(buildPng({ before: [iTXt('XML:com.adobe.xmp', xmpPacket())] })).gpsPresent, false);
    // compressed XMP cannot be searched → unknown
    assert.equal(readMetadataSummary(buildPng({ before: [iTXt('XML:com.adobe.xmp', 'x', { compressed: true })] })).gpsPresent, 'unknown');
    // PNG with malformed eXIf + GPS XMP → true
    const pbad = readMetadataSummary(buildPng({ before: [eXIf(buildTiff({ variant: 'cycle' }).bytes), xmpChunk] }));
    assert.equal(pbad.gpsPresent, true);
  });

  it('ISSUE-10: header + inter-scan metadata are classified together (re-encode, lossless keep)', () => {
    // header XMP + inter-scan XMP → not exactly one Standard XMP → dropped
    const twoXmp = buildJpeg({ progressive: true, segments: [app1Xmp()], interScan: [app1Xmp()] });
    assert.equal(reencode(twoXmp, 'keep').metadata.xmp, 'dropped');
    assert.ok(!kinds(reencode(twoXmp, 'keep').out).includes('xmp'));
    // header XMP + inter-scan Extended XMP → dropped
    const ext = buildJpeg({ progressive: true, segments: [app1Xmp()], interScan: [app1XmpExt()] });
    assert.equal(reencode(ext, 'keep').metadata.xmp, 'dropped');
    // header EXIF + inter-scan EXIF → duplicate → partial
    const twoExif = buildJpeg({ progressive: true, segments: [app1Exif(buildTiff({}).bytes)], interScan: [app1Exif(buildTiff({}).bytes)] });
    assert.equal(reencode(twoExif, 'keep').metadata.exif, 'partial');
    // header APP13 + inter-scan APP13 → duplicate → partial
    const twoIptc = buildJpeg({ progressive: true, segments: [app13Iptc()], interScan: [app13Iptc()] });
    assert.equal(reencode(twoIptc, 'keep').metadata.iptc, 'partial');
    // lossless keep reports inter-scan-only families as exact, not absent
    for (const [inter, fam] of [[app1Xmp(), 'xmp'], [app1Exif(buildTiff({}).bytes), 'exif'], [app13Iptc(), 'iptc']]) {
      const j = buildJpeg({ progressive: true, interScan: [inter] });
      const r = rewriteJpegLossless(j, inspectImage(j), 'keep');
      assert.equal(r.metadata[fam], 'exact', fam);
      assert.deepEqual([...r.bytes], [...j]);
    }
    const gps = buildJpeg({ progressive: true, interScan: [gpsXmp()] });
    assert.equal(rewriteJpegLossless(gps, inspectImage(gps), 'keep').metadata.gpsPresent, true);
  });
});

describe('Codex impl review r3 regressions', () => {
  it('ISSUE-11: PNG lossless keep and summary agree on XMP GPS (compressed → unknown, readable proof → true)', () => {
    const gpsText = xmpPacket('<exif:GPSLatitude>21,1N</exif:GPSLatitude>');
    const lossless = (p) => rewritePngLossless(p, inspectImage(p), 'keep').metadata.gpsPresent;
    const summary = (p) => readMetadataSummary(p).gpsPresent;
    // compressed iTXt XMP whose raw bytes happen to contain "GPS" must not be read as proof either way
    const comp = buildPng({ before: [iTXt('XML:com.adobe.xmp', gpsText, { compressed: true })] });
    const plain = buildPng({ before: [iTXt('XML:com.adobe.xmp', xmpPacket())] });
    const gps = buildPng({ before: [iTXt('XML:com.adobe.xmp', gpsText)] });
    const both = buildPng({ before: [iTXt('XML:com.adobe.xmp', 'x', { compressed: true }), iTXt('XML:com.adobe.xmp', gpsText)] });
    const exifGps = buildPng({ before: [eXIf(buildTiff({ gps: true }).bytes), iTXt('XML:com.adobe.xmp', 'x', { compressed: true })] });
    for (const [p, want] of [[comp, 'unknown'], [plain, false], [gps, true], [both, true], [exifGps, true]]) {
      assert.equal(lossless(p), want);
      assert.equal(summary(p), want);
    }
  });
});

describe('Codex impl review r4 regressions', () => {
  it('ISSUE-12: iTXt XMP with flag 0 but compression method 1 is malformed → unknown GPS, dropped on re-encode', () => {
    const text = xmpPacket();
    const bad = buildPng({ before: [chunk('iTXt', concat(ascii('XML:com.adobe.xmp'), Uint8Array.of(0, 0, 1), ascii('vi'), Uint8Array.of(0), Uint8Array.of(0), utf8(text)))] });
    assert.equal(readMetadataSummary(bad).gpsPresent, 'unknown');
    assert.equal(rewritePngLossless(bad, inspectImage(bad), 'keep').metadata.gpsPresent, 'unknown');
    assert.notEqual(buildPngMetadata(bad, inspectImage(bad), { mode: 'keep', width: 200, height: 150 }).metadata.xmp, 'verbatim');
  });
});

describe('Codex security review r1 regressions', () => {
  const gpsPng = () => buildPng({ before: [eXIf(buildTiff({ le: true, gps: true }).bytes), iTXt('XML:com.adobe.xmp', xmpPacket('<exif:GPSLatitude>21,1N</exif:GPSLatitude>'))] });
  it('PNG with a second PNG appended after IEND is flagged trailing and never reported GPS-free', () => {
    for (const tail of [gpsPng(), ascii('arbitrary trailer bytes')]) {
      const p = concat(buildPng(), tail);
      const ins = inspectImage(p);
      assert.equal(ins.special.trailing, true);
      const s = readMetadataSummary(p);
      assert.equal(s.trailing, true);
      assert.equal(s.gpsPresent, 'unknown');
      for (const mode of ['keep', 'keep-no-gps', 'copyright', 'none']) {
        assert.equal(code(() => rewritePngLossless(p, ins, mode)), 'metadata-policy-unsupported');
        assert.equal(code(() => buildPngMetadata(p, ins, { mode, width: 200, height: 150 })), 'special-content-transform-required');
      }
    }
  });
  it('zero padding after IEND is not trailing; non-empty IEND is invalid', () => {
    const p = concat(buildPng(), new Uint8Array(32));
    assert.equal(inspectImage(p).special.trailing, false);
    assert.equal(readMetadataSummary(p).trailing, false);
    const base = buildPng();
    const iendAt = base.length - 12;
    const bad = concat(base.subarray(0, iendAt), chunk('IEND', Uint8Array.of(1, 2, 3)));
    assert.equal(code(() => inspectImage(bad)), 'invalid-image');
  });
});
