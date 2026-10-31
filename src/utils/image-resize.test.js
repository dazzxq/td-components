// v0.90.0 (plan docs/internal/plans/v0.90.0-image-resize.md § 2-4, step 2) — resize engine with a FAKE engine (no
// canvas): policy normalisation, target size, every decision branch, quality / size search, processor contract,
// module-global FIFO queue, abort after every await.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeImageResizePolicy, computeTargetSize, optimizeImage, createCanvasEngine, metadataSatisfies,
  IMAGE_RESIZE_DEFAULTS, ImageResizeError,
} from './image-resize.js';
import { inspectImage } from './image-bytes.js';
import { readMetadataSummary, rewriteJpegLossless, rewritePngLossless } from './image-metadata.js';
import {
  ascii, utf8, concat, be32, buildTiff, buildJpeg, buildPng, app0Jfif, app1Exif, app1Xmp, app13Iptc, app2Mpf,
  app11Jumbf, com, segment, chunk, eXIf, acTL, tEXt, resource8bim,
} from '../../test/fixtures/image-builders.js';

// ---------------------------------------------------------------------------------------------------------------------
// helpers

const MiB = 1024 * 1024;
const fileOf = (bytes, name = 'photo.jpg', type = 'image/jpeg') => new File([bytes], name, { type, lastModified: 1234 });
const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());
const codeOf = async (p) => {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof ImageResizeError, `unexpected ${e && e.name}: ${e && e.message}`);
    return e.code;
  }
  return null;
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const until = async (cond) => {
  for (let i = 0; i < 500 && !cond(); i++) await tick();
  assert.ok(cond(), 'condition never became true');
};

/**
 * Synthetic JPEG of (about) `n` bytes. Padding = extra DQT segments (structure, so the engine's encoder-output cleaning
 * keeps them); `extra` = segments an encoder might add (cleaned away).
 */
function jpegOfSize(width, height, n, extra = []) {
  const segs = [app0Jfif(), ...extra];
  let pad = n - buildJpeg({ width, height, segments: segs }).length;
  while (pad >= 4) {
    const k = Math.min(pad - 4, 65533);
    segs.push(segment(0xdb, new Uint8Array(k)));
    pad -= k + 4;
  }
  return buildJpeg({ width, height, segments: segs });
}
function pngOfSize(width, height, n, before = []) {
  const base = buildPng({ width, height, before }).length;
  return buildPng({ width, height, before, after: [chunk('IDAT', new Uint8Array(Math.max(0, n - base - 12)))] });
}

/**
 * Fake engine. `size({ type, quality, width, height })` → byte length of the encoder output. Logs every call.
 * `gate` (optional) → awaited inside `open` (to hold a job running).
 */
function fakeEngine({ size = ({ quality = 1, width, height }) => Math.round(width * height * quality * 0.1) + 400,
  gate = null, blobType = null, nullBlob = false, onOpen = null, onEncode = null, extra = [] } = {}) {
  const log = [];
  const engine = {
    log,
    async open(file, o) {
      log.push({ op: 'open', ...o, signal: undefined });
      if (onOpen) await onOpen(o);
      if (gate) await gate;
      await tick();
      return { width: o.width, height: o.height };
    },
    async encode(handle, o) {
      log.push({ op: 'encode', ...o });
      if (onEncode) await onEncode(o);
      await tick();
      if (nullBlob) return null;
      const n = size(o);
      const bytes = o.type === 'image/png' ? pngOfSize(o.width, o.height, n, extra) : jpegOfSize(o.width, o.height, n, extra);
      return new Blob([bytes], { type: blobType || o.type });
    },
    close() {
      log.push({ op: 'close' });
    },
  };
  return engine;
}
const ops = (eng, op) => eng.log.filter((l) => l.op === op);

const tiff = (o) => buildTiff(o).bytes;
const richJpeg = (o = {}) => buildJpeg({
  width: o.width ?? 4000, height: o.height ?? 3000,
  segments: [app0Jfif(), app1Exif(tiff({ le: true, orientation: o.orientation ?? 1, gps: true, artist: 'Ann', copyright: '(c) Ann' })), app1Xmp(), app13Iptc(), com('hello')],
});

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

let warn;
let warned;
beforeEach(() => {
  warn = console.warn;
  warned = [];
  console.warn = (m) => warned.push(m);
});
afterEach(() => {
  console.warn = warn;
});

// ---------------------------------------------------------------------------------------------------------------------

describe('normalizeImageResizePolicy', () => {
  it('null / undefined → null (feature off)', () => {
    assert.equal(normalizeImageResizePolicy(null), null);
    assert.equal(normalizeImageResizePolicy(undefined), null);
  });

  it('defaults, frozen, idempotent', () => {
    const p = normalizeImageResizePolicy({});
    assert.deepEqual({ ...p }, { ...IMAGE_RESIZE_DEFAULTS });
    assert.equal(p.metadata, 'keep');
    assert.equal(p.quality, 0.9);
    assert.equal(p.minQuality, 0.65);
    assert.equal(p.maxEncodes, 8);
    assert.equal(p.maxInputBytes, 64 * MiB);
    assert.equal(p.maxInputPixels, 64e6);
    assert.equal(p.maxInputSide, 16384);
    assert.equal(p.maxHeaderBytes, MiB);
    assert.ok(Object.isFrozen(p));
    assert.equal(normalizeImageResizePolicy(p), p);
    const q = normalizeImageResizePolicy({ maxBytes: 5 * MiB, maxPixels: 12e6, metadata: 'none' });
    assert.equal(q.maxBytes, 5 * MiB);
    assert.equal(q.maxPixels, 12e6);
    assert.equal(q.metadata, 'none');
  });

  it('only own keys are read (no prototype), unknown keys warn once per name', () => {
    const proto = Object.create({ maxBytes: 5 });
    assert.equal(normalizeImageResizePolicy(proto).maxBytes, null);
    normalizeImageResizePolicy({ maxSize: 1, jpegQuality: 0.8 });
    normalizeImageResizePolicy({ maxSize: 2 });
    assert.equal(warned.filter((m) => m.includes('"maxSize"')).length, 1);
    assert.equal(warned.filter((m) => m.includes('"jpegQuality"')).length, 1);
    assert.ok(!('maxSize' in normalizeImageResizePolicy({ maxSize: 3 })));
  });

  it('valid boundaries', () => {
    assert.doesNotThrow(() => normalizeImageResizePolicy({ maxEncodes: 1 }));
    assert.doesNotThrow(() => normalizeImageResizePolicy({ maxEncodes: 32 }));
    assert.doesNotThrow(() => normalizeImageResizePolicy({ quality: 1, minQuality: 1 }));
    assert.doesNotThrow(() => normalizeImageResizePolicy({ quality: 0.5, minQuality: 0.5 }));
    assert.doesNotThrow(() => normalizeImageResizePolicy({ maxBytes: 1, maxPixels: 1, maxWidth: 1, maxHeight: 1 }));
    assert.doesNotThrow(() => normalizeImageResizePolicy({ maxBytes: null, processor: null }));
    assert.doesNotThrow(() => normalizeImageResizePolicy({ processor: () => null }));
    for (const m of ['keep', 'keep-no-gps', 'copyright', 'none']) assert.doesNotThrow(() => normalizeImageResizePolicy({ metadata: m }));
  });

  it('invalid values of known keys → TypeError', () => {
    const bad = [
      'x', 5, [], () => {},
      { maxBytes: 0 }, { maxBytes: -1 }, { maxBytes: 1.5 }, { maxBytes: '5MB' }, { maxBytes: NaN }, { maxBytes: Infinity },
      { maxBytes: true }, { maxPixels: 0 }, { maxWidth: 10.2 }, { maxHeight: -3 },
      { maxInputBytes: null }, { maxInputBytes: 0 }, { maxInputPixels: 1.5 }, { maxInputSide: '16384' }, { maxHeaderBytes: null },
      { maxEncodes: 0 }, { maxEncodes: 33 }, { maxEncodes: 2.5 }, { maxEncodes: null },
      { quality: 0 }, { quality: 1.01 }, { quality: '0.9' }, { quality: NaN }, { minQuality: 0 }, { minQuality: 2 },
      { quality: 0.7, minQuality: 0.8 }, { quality: 0.6 },
      { metadata: 'strip' }, { metadata: null }, { processor: 'fn' }, { processor: {} },
    ];
    for (const b of bad) assert.throws(() => normalizeImageResizePolicy(b), TypeError, JSON.stringify(b));
  });
});

describe('computeTargetSize', () => {
  it('Sony 7008×4672 → 12 MP', () => {
    const t = computeTargetSize(7008, 4672, { maxPixels: 12e6 });
    assert.ok(t.width * t.height <= 12e6);
    assert.equal(t.width, 4242);
    assert.equal(t.height, 2828);
  });
  it('no cap / never upscale', () => {
    assert.deepEqual(computeTargetSize(800, 600, {}), { width: 800, height: 600 });
    assert.deepEqual(computeTargetSize(800, 600, { maxWidth: 4000, maxPixels: 99e6 }), { width: 800, height: 600 });
  });
  it('width / height / pixels: the tightest wins, rounded down', () => {
    assert.deepEqual(computeTargetSize(4000, 3000, { maxWidth: 1000 }), { width: 1000, height: 750 });
    assert.deepEqual(computeTargetSize(4000, 3000, { maxHeight: 1000 }), { width: 1333, height: 1000 });
    assert.deepEqual(computeTargetSize(4000, 3000, { maxPixels: 3e6 }), { width: 2000, height: 1500 });
    assert.deepEqual(computeTargetSize(4000, 3000, { maxPixels: 3e6, maxWidth: 1600 }), { width: 1600, height: 1200 });
    assert.deepEqual(computeTargetSize(3001, 2001, { maxWidth: 1000 }), { width: 1000, height: 666 });
  });
  it('each side ≥ 1 and the area cap still holds for a very thin image', () => {
    const t = computeTargetSize(16384, 1, { maxPixels: 100 });
    assert.ok(t.width * t.height <= 100 && t.height === 1 && t.width >= 1);
    assert.deepEqual(computeTargetSize(10, 10, { maxPixels: 1 }), { width: 1, height: 1 });
    assert.deepEqual(computeTargetSize(5000, 2, { maxWidth: 100 }), { width: 100, height: 1 });
  });
});

describe('optimizeImage — decision flow', () => {
  const run = (bytes, policy, opts = {}, name, type) => optimizeImage(fileOf(bytes, name, type), policy, opts);

  it('policy is validated synchronously (TypeError, nothing queued)', () => {
    assert.throws(() => optimizeImage(fileOf(buildJpeg()), { maxBytes: 'big' }), TypeError);
    assert.throws(() => optimizeImage(fileOf(buildJpeg()), null), TypeError);
    assert.throws(() => optimizeImage('nope', {}), TypeError);
  });

  it('empty file → empty-file', async () => {
    assert.equal(await codeOf(run(new Uint8Array(0), {})), 'empty-file');
  });

  it('non-image (magic bytes, not MIME) → not-image, same file, engine untouched, no input caps', async () => {
    const eng = fakeEngine();
    const pdf = fileOf(concat(ascii('%PDF-1.7\n'), new Uint8Array(5000)), 'a.jpg', 'image/jpeg');
    const r = await optimizeImage(pdf, { maxBytes: 10, maxInputBytes: 100 }, { engine: eng });
    assert.equal(r.kind, 'not-image');
    assert.equal(r.file, pdf);
    assert.equal(r.optimization, null);
    assert.equal(eng.log.length, 0);
  });

  it('JPEG with an empty / wrong MIME is still a JPEG', async () => {
    const f = fileOf(buildJpeg({ width: 100, height: 100 }), 'x.pdf', '');
    const r = await optimizeImage(f, {});
    assert.equal(r.kind, 'original');
    assert.equal(r.file, f);
  });

  it('input-too-large / invalid-image / header-limit / input-dimensions-too-large', async () => {
    const jpeg = buildJpeg({ width: 100, height: 100 });
    assert.equal(await codeOf(run(jpeg, { maxInputBytes: jpeg.length - 1 })), 'input-too-large');
    assert.equal(await codeOf(run(jpeg.subarray(0, 40), {})), 'invalid-image');
    const fat = buildJpeg({ segments: [segment(0xe5, new Uint8Array(4000))] });
    assert.equal(await codeOf(run(fat, { maxHeaderBytes: 1024 })), 'header-limit');
    assert.equal(await codeOf(run(buildJpeg({ width: 20000, height: 100 }), {})), 'input-dimensions-too-large');
    assert.equal(await codeOf(run(buildJpeg({ width: 9000, height: 8000 }), {})), 'input-dimensions-too-large');
    assert.equal(await codeOf(run(buildJpeg({ width: 300, height: 300 }), { maxInputPixels: 89999 })), 'input-dimensions-too-large');
    const gif = concat(ascii('GIF89a'), Uint8Array.of(0x00, 0x50, 0x10, 0x00), new Uint8Array(20)); // 20480×16
    assert.equal(await codeOf(run(gif, {}, {}, 'a.gif', 'image/gif')), 'input-dimensions-too-large');
  });

  it('compliant + keep → the SAME File object, no read beyond inspection, exact metadata', async () => {
    const eng = fakeEngine();
    const f = fileOf(richJpeg());
    const r = await optimizeImage(f, { maxBytes: 10 * MiB, maxPixels: 20e6 }, { engine: eng });
    assert.equal(r.kind, 'original');
    assert.equal(r.file, f);
    assert.equal(eng.log.length, 0);
    const o = r.optimization;
    assert.equal(o.changed, false);
    assert.deepEqual(o.reasons, []);
    assert.deepEqual(o.original, { name: 'photo.jpg', type: 'image/jpeg', size: f.size, width: 4000, height: 3000 });
    assert.deepEqual(o.metadata, { mode: 'keep', exif: 'exact', xmp: 'exact', iptc: 'exact', gpsPresent: true, contentCredentials: false });
  });

  it('compliant + keep-no-gps → lossless rewrite (bytes from SOS identical, GPS gone)', async () => {
    const src = richJpeg();
    const r = await run(src, { maxPixels: 20e6, metadata: 'keep-no-gps' });
    assert.equal(r.kind, 'rewritten');
    assert.deepEqual(r.optimization.reasons, ['metadata']);
    assert.equal(r.file.type, 'image/jpeg');
    assert.equal(r.file.name, 'photo.jpg');
    const out = await bytesOf(r.file);
    const a = inspectImage(src).jpeg.sosOffset;
    const b = inspectImage(out).jpeg.sosOffset;
    assert.deepEqual(out.subarray(b), src.subarray(a));
    const s = readMetadataSummary(out);
    assert.equal(s.exifGps, false);
    assert.equal(s.hasXmp, false);
    assert.equal(r.optimization.metadata.exif, 'patched');
    assert.equal(r.optimization.metadata.gpsPresent, false);
  });

  it('compliant + none, nothing to remove → original File kept (kind original)', async () => {
    const f = fileOf(buildJpeg({ width: 100, height: 100 }));
    const r = await optimizeImage(f, { metadata: 'none' });
    assert.equal(r.kind, 'original');
    assert.equal(r.file, f);
  });

  it('compliant special JPEG / other format, selective mode → metadata-policy-unsupported', async () => {
    const mpf = buildJpeg({ width: 100, height: 100, segments: [app2Mpf()] });
    assert.equal(await codeOf(run(mpf, { metadata: 'none' })), 'metadata-policy-unsupported');
    const gif = concat(ascii('GIF89a'), Uint8Array.of(10, 0, 10, 0), new Uint8Array(20));
    assert.equal(await codeOf(run(gif, { metadata: 'copyright' }, {}, 'a.gif', 'image/gif')), 'metadata-policy-unsupported');
    const keep = fileOf(gif, 'a.gif', 'image/gif');
    const r = await optimizeImage(keep, { maxPixels: 1000 });
    assert.equal(r.file, keep);
    assert.equal(r.optimization.original.width, 10);
    assert.equal(r.optimization.metadata.gpsPresent, 'unknown');
  });

  it('over-cap JPEG → decode at the display-oriented target, encode JPEG, metadata spliced, Orientation 1', async () => {
    const eng = fakeEngine();
    const src = richJpeg({ orientation: 6 }); // stored 4000×3000, displayed 3000×4000
    const r = await run(src, { maxPixels: 3e6 }, { engine: eng });
    assert.equal(r.kind, 'resized');
    const open = ops(eng, 'open')[0];
    assert.equal(open.width, 1500);
    assert.equal(open.height, 2000);
    assert.equal(open.orientation, 6);
    assert.equal(open.orientedWidth, 3000);
    assert.equal(open.decodeUnsupported, false);
    assert.equal(ops(eng, 'encode').length, 1);
    assert.equal(ops(eng, 'encode')[0].quality, 0.9);
    assert.equal(ops(eng, 'close').length, 1);
    const o = r.optimization;
    assert.equal(o.changed, true);
    assert.deepEqual(o.reasons, ['pixels']);
    assert.deepEqual(o.original, { name: 'photo.jpg', type: 'image/jpeg', size: src.length, width: 3000, height: 4000 });
    assert.deepEqual(o.output, { type: 'image/jpeg', size: r.file.size, width: 1500, height: 2000 });
    const out = await bytesOf(r.file);
    const s = readMetadataSummary(out);
    assert.equal(s.orientation, 1);
    assert.equal(s.exifGps, true);
    assert.equal(s.hasXmp, true);
    assert.equal(s.hasIptc, true);
    assert.equal(o.metadata.exif, 'patched');
    assert.equal(o.metadata.xmp, 'verbatim');
    assert.equal(o.metadata.iptc, 'rebuilt');
    assert.equal(inspectImage(out).width, 1500);
    assert.equal(r.file.lastModified, 1234);
  });

  it('reasons: bytes / width / height (+ metadata when the mode is not keep)', async () => {
    const r = await run(jpegOfSize(400, 300, 3000), { maxBytes: 1000, maxWidth: 200, maxHeight: 100, metadata: 'none' },
      { engine: fakeEngine({ size: () => 300 }) });
    assert.deepEqual(r.optimization.reasons, ['bytes', 'width', 'height', 'metadata']);
    assert.deepEqual([r.optimization.output.width, r.optimization.output.height], [133, 100]);
  });

  it('over-cap special JPEG (MPF / C2PA / trailing) → special-content-transform-required, nothing decoded', async () => {
    for (const src of [
      buildJpeg({ segments: [app2Mpf()] }),
      buildJpeg({ segments: [app11Jumbf()] }),
      buildJpeg({ trailing: ascii('tail') }),
    ]) {
      const eng = fakeEngine();
      assert.equal(await codeOf(run(src, { maxPixels: 1e6 }, { engine: eng })), 'special-content-transform-required');
      assert.equal(eng.log.length, 0);
    }
  });

  it('12-bit / arithmetic JPEG is flagged decodeUnsupported for the engine', async () => {
    const src = buildJpeg({ width: 400, height: 300 });
    const sof = src.indexOf(0xc0, 2); // first SOF0 marker byte
    const twelve = src.slice();
    twelve[sof + 3] = 12;
    const eng = fakeEngine();
    await run(twelve, { maxPixels: 1000 }, { engine: eng });
    assert.equal(ops(eng, 'open')[0].decodeUnsupported, true);
  });

  it('PNG 8-bit over cap → PNG out (one encode per size); 16-bit / APNG → special-content-transform-required', async () => {
    const eng = fakeEngine();
    const r = await run(buildPng({ width: 400, height: 300, before: [tEXt('Author', 'Ann'), tEXt('Comment', 'x')] }),
      { maxWidth: 200, metadata: 'copyright' }, { engine: eng }, 'a.png', 'image/png');
    assert.equal(r.kind, 'resized');
    assert.equal(r.file.type, 'image/png');
    assert.equal(ops(eng, 'encode')[0].quality, undefined);
    const s = readMetadataSummary(await bytesOf(r.file));
    assert.deepEqual(s.textKeywords, ['Author']);
    assert.equal(await codeOf(run(buildPng({ bitDepth: 16 }), { maxWidth: 100 }, { engine: fakeEngine() })), 'special-content-transform-required');
    assert.equal(await codeOf(run(buildPng({ before: [acTL()] }), { maxWidth: 100 }, { engine: fakeEngine() })), 'special-content-transform-required');
  });

  it('GIF / WebP sizes are read; over cap → format-not-transformable', async () => {
    const gif = concat(ascii('GIF89a'), Uint8Array.of(0x20, 0x03, 0x58, 0x02), new Uint8Array(20)); // 800×600
    assert.equal(await codeOf(run(gif, { maxWidth: 500 }, {}, 'a.gif', 'image/gif')), 'format-not-transformable');
    const r = await run(gif, { maxWidth: 800, maxPixels: 480000 }, {}, 'a.gif', 'image/gif');
    assert.equal(r.kind, 'original');
    assert.equal(r.optimization.original.height, 600);
    const vp8x = concat(ascii('RIFF'), be32(0), ascii('WEBPVP8X'), be32(10), new Uint8Array(4), Uint8Array.of(0x1f, 0x03, 0, 0x57, 0x02, 0), new Uint8Array(8));
    assert.equal(await codeOf(run(vp8x, { maxPixels: 100 }, {}, 'a.webp', 'image/webp')), 'format-not-transformable');
    const ok = await run(vp8x, { maxPixels: 480000 }, {}, 'a.webp', 'image/webp');
    assert.deepEqual([ok.optimization.original.width, ok.optimization.original.height], [800, 600]);
  });

  it('AVIF / HEIC (size not read): passthrough only without a dimension cap', async () => {
    const avif = concat(be32(24), ascii('ftypavif'), be32(0), ascii('mif1avif'), new Uint8Array(40));
    assert.equal(await codeOf(run(avif, { maxPixels: 12e6 }, {}, 'a.avif', 'image/avif')), 'format-not-transformable');
    const f = fileOf(avif, 'a.avif', 'image/avif');
    const r = await optimizeImage(f, { maxBytes: 1000 });
    assert.equal(r.file, f);
    assert.equal(r.optimization.original.width, null);
    assert.equal(await codeOf(run(avif, { maxBytes: 10 }, {}, 'a.avif', 'image/avif')), 'format-not-transformable');
  });

  it('SVG: byte cap only (no pixel cap), sniffed behind a long prolog (> 64 bytes)', async () => {
    const svg = utf8(`<?xml version="1.0"?>\n<!-- ${'x'.repeat(600)} -->\n<svg xmlns="http://www.w3.org/2000/svg" width="9000" height="9000"/>`);
    const f = fileOf(svg, 'a.svg', 'image/svg+xml');
    const r = await optimizeImage(f, { maxPixels: 100, maxWidth: 10 });
    assert.equal(r.kind, 'original');
    assert.equal(r.file, f);
    assert.equal(await codeOf(run(svg, { maxBytes: 100 }, {}, 'a.svg', 'image/svg+xml')), 'format-not-transformable');
    assert.equal(await codeOf(run(svg, { metadata: 'none' }, {}, 'a.svg', 'image/svg+xml')), 'metadata-policy-unsupported');
  });
});

describe('optimizeImage — quality / size search', () => {
  const src = () => buildJpeg({ width: 4000, height: 3000 });
  const qualities = (eng) => ops(eng, 'encode').map((e) => e.quality);

  it('first encode at quality fits → one encode', async () => {
    const eng = fakeEngine({ size: () => 1000 });
    const r = await optimizeImage(fileOf(src()), { maxPixels: 3e6, maxBytes: 5000 }, { engine: eng });
    assert.deepEqual(qualities(eng), [0.9]);
    assert.ok(r.file.size <= 5000);
  });

  it('too big → bisect downward in [minQuality, quality], stop at the first compliant encode', async () => {
    // bytes fall with quality; only q ≤ 0.72 fits
    const eng = fakeEngine({ size: ({ quality }) => (quality <= 0.72 ? 4000 : 9000) });
    const r = await optimizeImage(fileOf(src()), { maxPixels: 3e6, maxBytes: 5000 }, { engine: eng });
    assert.deepEqual(qualities(eng), [0.9, 0.775, 0.713]);
    assert.ok(r.file.size <= 5000);
    assert.deepEqual([r.optimization.output.width, r.optimization.output.height], [2000, 1500]);
  });

  it('never returns a non-compliant encode; the kept candidate is the smallest compliant one', async () => {
    // non-monotonic encoder: 0.775 is too big, 0.713 fits
    const sizes = { 0.9: 9000, 0.775: 9500, 0.713: 4500 };
    const eng = fakeEngine({ size: ({ quality }) => sizes[quality] ?? 9999 });
    const r = await optimizeImage(fileOf(src()), { maxPixels: 3e6, maxBytes: 5000 }, { engine: eng });
    const out = await bytesOf(r.file);
    assert.ok(out.length <= 5000);
    assert.equal(ops(eng, 'encode').at(-1).quality, 0.713);
  });

  it('still too big at minQuality → shrink × sqrt(budget/bytes) × 0.95, then go on at minQuality', async () => {
    const eng = fakeEngine({ size: ({ width, height }) => (width * height > 1e6 ? 20000 : 3000) });
    const r = await optimizeImage(fileOf(src()), { maxPixels: 3e6, maxBytes: 5000 }, { engine: eng });
    const enc = ops(eng, 'encode');
    assert.deepEqual(enc.slice(0, 4).map((e) => e.quality), [0.9, 0.775, 0.713, 0.65]);
    assert.equal(enc.length, 5);
    assert.equal(enc[4].quality, 0.65);
    const s = Math.sqrt(5000 / 20000) * 0.95;
    assert.deepEqual([enc[4].width, enc[4].height], [Math.floor(2000 * s), Math.floor(1500 * s)]);
    assert.ok(r.file.size <= 5000);
    assert.deepEqual([r.optimization.output.width, r.optimization.output.height], [enc[4].width, enc[4].height]);
  });

  it('total encodes ≤ maxEncodes, then cannot-satisfy-limits; engine closed', async () => {
    for (const maxEncodes of [1, 3, 8]) {
      const eng = fakeEngine({ size: () => 100000 });
      const code = await codeOf(optimizeImage(fileOf(src()), { maxPixels: 3e6, maxBytes: 5000, maxEncodes }, { engine: eng }));
      assert.equal(code, 'cannot-satisfy-limits');
      assert.equal(ops(eng, 'encode').length, maxEncodes);
      assert.equal(ops(eng, 'close').length, 1);
    }
  });

  it('PNG: one encode per size, then shrink', async () => {
    const eng = fakeEngine({ size: ({ width }) => (width > 300 ? 50000 : 2000) });
    const r = await optimizeImage(fileOf(pngOfSize(800, 600, 20000), 'a.png', 'image/png'), { maxBytes: 10000 }, { engine: eng });
    const enc = ops(eng, 'encode');
    assert.ok(enc.length >= 2);
    assert.deepEqual([enc[0].width, enc[0].height], [800, 600]);
    assert.ok(enc[1].width < 800);
    assert.ok(r.file.size <= 10000);
    assert.deepEqual(r.optimization.reasons, ['bytes']);
    assert.equal(r.file.type, 'image/png');
  });

  it("the encoder's own metadata never ships (WebKit APP1 Exif / APP13, COM; PNG eXIf / private chunks)", async () => {
    const extra = [app1Exif(tiff({ gps: true })), app13Iptc(), com('encoder')];
    const r = await optimizeImage(fileOf(richJpeg()), { maxPixels: 3e6, metadata: 'none' }, { engine: fakeEngine({ extra }) });
    const out = await bytesOf(r.file);
    const s = readMetadataSummary(out);
    assert.equal(s.hasExif, false);
    assert.equal(s.hasIptc, false);
    assert.ok(!inspectImage(out).jpeg.segments.some((g) => g.marker === 0xfe));
    assert.ok(inspectImage(out).jpeg.segments.some((g) => g.marker === 0xe0), 'encoder JFIF kept');
    const keep = await optimizeImage(fileOf(richJpeg()), { maxPixels: 3e6 }, { engine: fakeEngine({ extra }) });
    assert.equal(readMetadataSummary(await bytesOf(keep.file)).exifCount, 1);
    const pngExtra = [eXIf(tiff({ gps: true })), chunk('deBG', ascii('x')), chunk('sRGB', Uint8Array.of(0))];
    const p = await optimizeImage(fileOf(pngOfSize(800, 600, 20000), 'a.png', 'image/png'), { maxWidth: 400, metadata: 'none' },
      { engine: fakeEngine({ extra: pngExtra }) });
    const types = inspectImage(await bytesOf(p.file)).png.chunks.map((c) => c.type);
    assert.ok(!types.includes('eXIf') && !types.includes('deBG') && types.includes('sRGB'), types.join());
  });

  it('metadata bytes count toward maxBytes', async () => {
    const big = buildJpeg({ segments: [app1Exif(tiff({ makerNote: new Uint8Array(3000).fill(7) }))] });
    const meta = 3200;
    // the image alone (4500) fits 6000, but not with ~3.2 KB of EXIF: must keep searching
    const eng = fakeEngine({ size: ({ quality }) => (quality <= 0.72 ? 2000 : 4500) });
    const r = await optimizeImage(fileOf(big), { maxPixels: 3e6, maxBytes: 6000 }, { engine: eng });
    assert.ok(r.file.size <= 6000);
    assert.ok(r.file.size > 2000 + meta - 400);
    assert.ok(ops(eng, 'encode').length > 1);
  });

  it('metadata alone ≥ maxBytes → metadata-too-large before any decode', async () => {
    const big = buildJpeg({ segments: [app1Exif(tiff({ makerNote: new Uint8Array(30000).fill(7) }))] });
    const eng = fakeEngine();
    assert.equal(await codeOf(optimizeImage(fileOf(big), { maxPixels: 3e6, maxBytes: 20000 }, { engine: eng })), 'metadata-too-large');
    assert.equal(eng.log.length, 0);
  });

  it('image fits alone but never next to its metadata → metadata-too-large (not silently dropped)', async () => {
    const big = buildJpeg({ segments: [app1Exif(tiff({ makerNote: new Uint8Array(30000).fill(7) }))] });
    const eng = fakeEngine({ size: () => 15000 });
    assert.equal(await codeOf(optimizeImage(fileOf(big), { maxPixels: 3e6, maxBytes: 40000 }, { engine: eng })), 'metadata-too-large');
    assert.equal(ops(eng, 'encode').length, 8);
  });

  it('no metadata: maxBytes is the image budget exactly (no +2 slack), never metadata-too-large', async () => {
    const bare = buildJpeg({ width: 4000, height: 3000, segments: [app0Jfif()] });
    const exact = await optimizeImage(fileOf(bare), { maxPixels: 3e6, maxBytes: 5000, metadata: 'none' },
      { engine: fakeEngine({ size: () => 5000 }) });
    assert.equal(exact.file.size, 5000);
    assert.equal(await codeOf(optimizeImage(fileOf(bare), { maxPixels: 3e6, maxBytes: 1, metadata: 'none' }, { engine: fakeEngine() })),
      'cannot-satisfy-limits');
    assert.equal(await codeOf(optimizeImage(fileOf(bare), { maxPixels: 3e6, maxBytes: 4999, metadata: 'none' },
      { engine: fakeEngine({ size: () => 5000 }) })), 'cannot-satisfy-limits');
  });

  it('metadata at exactly the boundary: meta + image = maxBytes fits; meta = maxBytes → metadata-too-large', async () => {
    const withExif = buildJpeg({ width: 4000, height: 3000, segments: [app1Exif(tiff({ copyright: '(c) Ann' }))] });
    const probe = await optimizeImage(fileOf(withExif), { maxPixels: 3e6, metadata: 'copyright' }, { engine: fakeEngine({ size: () => 3000 }) });
    const meta = probe.file.size - 3000;
    assert.ok(meta > 0);
    const fit = await optimizeImage(fileOf(withExif), { maxPixels: 3e6, maxBytes: meta + 3000, metadata: 'copyright' },
      { engine: fakeEngine({ size: () => 3000 }) });
    assert.equal(fit.file.size, meta + 3000);
    const eng = fakeEngine();
    assert.equal(await codeOf(optimizeImage(fileOf(withExif), { maxPixels: 3e6, maxBytes: meta, metadata: 'copyright' }, { engine: eng })),
      'metadata-too-large');
    assert.equal(eng.log.length, 0);
  });

  it('encoder null → encode-failed; wrong blob type → output-type-mismatch; engine closed both times', async () => {
    let eng = fakeEngine({ nullBlob: true });
    assert.equal(await codeOf(optimizeImage(fileOf(src()), { maxPixels: 3e6 }, { engine: eng })), 'encode-failed');
    assert.equal(ops(eng, 'close').length, 1);
    eng = fakeEngine({ blobType: 'image/png' });
    assert.equal(await codeOf(optimizeImage(fileOf(src()), { maxPixels: 3e6 }, { engine: eng })), 'output-type-mismatch');
    assert.equal(ops(eng, 'close').length, 1);
  });

  it('engine errors propagate with their code (resize-unsupported from the probe)', async () => {
    const engine = createCanvasEngine({ probe: async () => false });
    const src6 = richJpeg({ orientation: 6 });
    assert.equal(await codeOf(optimizeImage(fileOf(src6), { maxPixels: 3e6 }, { engine })), 'resize-unsupported');
  });
});

describe('optimizeImage — processor', () => {
  const over = () => buildJpeg({ width: 4000, height: 3000, segments: [app1Exif(tiff({ gps: true }))] });

  it('replaces the engine on the over-cap branch; receives { policy, signal }; valid result → processed', async () => {
    const eng = fakeEngine();
    let seen = null;
    const processor = async (file, ctx) => {
      seen = { file, ctx };
      return new Blob([buildJpeg({ width: 1000, height: 750 })]);
    };
    const f = fileOf(over());
    const r = await optimizeImage(f, { maxPixels: 1e6, processor }, { engine: eng });
    assert.equal(eng.log.length, 0);
    assert.equal(seen.file, f);
    assert.equal(seen.ctx.policy.maxPixels, 1e6);
    assert.ok(seen.ctx.signal instanceof AbortSignal);
    assert.equal(r.kind, 'processed');
    assert.equal(r.file.type, 'image/jpeg');
    assert.equal(r.file.name, 'photo.jpg');
    assert.deepEqual([r.optimization.output.width, r.optimization.output.height], [1000, 750]);
    assert.equal(r.optimization.metadata.exif, 'dropped');
  });

  it('also replaces the lossless rewrite (compliant + selective mode)', async () => {
    let calls = 0;
    const processor = () => {
      calls++;
      return buildJpeg({ width: 100, height: 100 }) && new Blob([buildJpeg({ width: 100, height: 100 })]);
    };
    const r = await optimizeImage(fileOf(buildJpeg({ width: 100, height: 100, segments: [app1Exif(tiff({ gps: true }))] })), { metadata: 'none', processor });
    assert.equal(calls, 1);
    assert.equal(r.kind, 'processed');
  });

  it("output File keeps an empty name and lastModified 0 (?? not ||)", async () => {
    const f = new File([buildJpeg({ width: 4000, height: 3000 })], '', { type: 'image/jpeg', lastModified: 0 });
    const r = await optimizeImage(f, { maxPixels: 1e6 }, { engine: fakeEngine() });
    assert.equal(r.kind, 'resized');
    assert.equal(r.file.name, '');
    assert.equal(r.file.lastModified, 0);
  });

  it('not called for compliant + keep', async () => {
    let calls = 0;
    await optimizeImage(fileOf(buildJpeg({ width: 100, height: 100 })), { processor: () => { calls++; return null; } });
    assert.equal(calls, 0);
  });

  it('invalid results → processor-invalid-result', async () => {
    const cases = [
      ['other family', () => new Blob([buildPng({ width: 10, height: 10 })])],
      ['over maxBytes', () => new Blob([jpegOfSize(100, 100, 9000)])],
      ['over pixels', () => new Blob([buildJpeg({ width: 3000, height: 3000 })])],
      ['not a Blob', () => 'nope'],
      ['undefined', () => undefined],
      ['empty', () => new Blob([])],
      ['broken JPEG', () => new Blob([buildJpeg({ width: 10, height: 10 }).subarray(0, 50)])],
      ['null but original over cap', () => null],
    ];
    for (const [why, processor] of cases) {
      const code = await codeOf(optimizeImage(fileOf(over()), { maxPixels: 1e6, maxBytes: 8000, processor }));
      assert.equal(code, 'processor-invalid-result', why);
    }
  });

  it('metadata mode is read back: GPS left in keep-no-gps / XMP in none / extra EXIF tags in copyright → invalid', async () => {
    const small = (segs) => () => new Blob([buildJpeg({ width: 100, height: 100, segments: segs })]);
    const cases = [
      ['keep-no-gps', small([app1Exif(tiff({ gps: true }))])],
      ['keep-no-gps', small([app1Xmp()])],
      ['none', small([app1Xmp()])],
      ['none', small([app13Iptc()])],
      ['none', small([app1Exif(tiff({}))])],
      ['copyright', small([app1Exif(tiff({ artist: 'A' }))])], // also Make / Exif IFD pointer
      ['copyright', small([app13Iptc()])],
      ['keep-no-gps', small([app13Iptc()])], // 2:90 city etc.
    ];
    for (const [metadata, processor] of cases) {
      const code = await codeOf(optimizeImage(fileOf(over()), { maxPixels: 1e6, metadata, processor }));
      assert.equal(code, 'processor-invalid-result', metadata);
    }
    const ok = await optimizeImage(fileOf(over()), { maxPixels: 1e6, metadata: 'keep-no-gps', processor: small([app1Exif(tiff({}))]) });
    assert.equal(ok.kind, 'processed');
  });

  it('selective modes: anything the lossless rewrite would still drop → processor-invalid-result', async () => {
    const jpg = (segs) => () => new Blob([buildJpeg({ width: 100, height: 100, segments: segs })]);
    const png = (before) => () => new Blob([buildPng({ width: 100, height: 100, before })]);
    const time = chunk('tIME', Uint8Array.of(7, 0xea, 1, 2, 3, 4, 5));
    const cases = [
      ['none', 'jpeg', jpg([com('hello')])],
      ['copyright', 'jpeg', jpg([com('hello')])],
      ['keep-no-gps', 'jpeg', jpg([com('hello')])],
      ['none', 'jpeg', jpg([segment(0xe5, ascii('vendor blob'))])],
      ['keep-no-gps', 'jpeg', jpg([segment(0xe9, ascii('vendor blob'))])],
      ['copyright', 'jpeg', jpg([app13Iptc({ datasets: [[2, 116, '(c) Ann']], extra: [[0x0425, new Uint8Array(16)]] })])],
      ['keep-no-gps', 'jpeg', jpg([app13Iptc({ datasets: [[2, 80, 'Ann']], extra: [[0x040c, new Uint8Array(32)]] })])],
      ['none', 'png', png([chunk('deBG', ascii('x'))])],
      ['keep-no-gps', 'png', png([chunk('vpAg', new Uint8Array(9))])],
      ['copyright', 'png', png([time])],
      ['none', 'png', png([time])],
    ];
    for (const [metadata, format, processor] of cases) {
      const src = format === 'png' ? fileOf(buildPng({ width: 400, height: 300 }), 'a.png', 'image/png') : fileOf(over());
      const code = await codeOf(optimizeImage(src, { maxPixels: 1e5, metadata, processor }));
      assert.equal(code, 'processor-invalid-result', `${metadata} ${format} ${cases.indexOf(cases.find((c) => c[2] === processor))}`);
    }
    // tIME is kept by keep-no-gps → fine there
    const t = await optimizeImage(fileOf(buildPng({ width: 400, height: 300 }), 'a.png', 'image/png'),
      { maxPixels: 1e5, metadata: 'keep-no-gps', processor: png([time]) });
    assert.equal(t.kind, 'processed');
    // keep: untouched by the check
    const k = await optimizeImage(fileOf(over()), { maxPixels: 1e5, processor: jpg([com('hello'), segment(0xe5, ascii('v'))]) });
    assert.equal(k.kind, 'processed');
  });

  it('selective modes: a properly cleaned result is accepted (step-1 rewrite output, and the kit resize output)', async () => {
    const small = buildJpeg({ width: 100, height: 100, segments: [app0Jfif(),
      app1Exif(tiff({ le: true, gps: true, artist: 'Ann', copyright: '(c) Ann' })), app1Xmp(), app13Iptc(), com('hello')] });
    const smallPng = buildPng({ width: 100, height: 100, before: [eXIf(tiff({ gps: true, artist: 'Ann' })), tEXt('Author', 'Ann'),
      tEXt('Comment', 'x'), chunk('tIME', Uint8Array.of(7, 0xea, 1, 2, 3, 4, 5)), chunk('deBG', ascii('x'))] });
    for (const metadata of ['keep-no-gps', 'copyright', 'none']) {
      const cleanJ = rewriteJpegLossless(small, inspectImage(small), metadata).bytes;
      const r = await optimizeImage(fileOf(over()), { maxPixels: 1e5, metadata, processor: () => new Blob([cleanJ]) });
      assert.equal(r.kind, 'processed', `jpeg ${metadata}`);
      const cleanP = rewritePngLossless(smallPng, inspectImage(smallPng), metadata).bytes;
      const p = await optimizeImage(fileOf(buildPng({ width: 400, height: 300 }), 'a.png', 'image/png'),
        { maxPixels: 1e5, metadata, processor: () => new Blob([cleanP]) });
      assert.equal(p.kind, 'processed', `png ${metadata}`);
      // the kit's own resize output (metadata rebuilt for the mode, encoder output cleaned) passes the same check
      const kit = await optimizeImage(fileOf(richJpeg({ width: 400, height: 300 })), { maxPixels: 1e4, metadata },
        { engine: fakeEngine({ extra: [com('enc'), segment(0xe5, ascii('v'))] }) });
      const kitBytes = await bytesOf(kit.file);
      assert.deepEqual(rewriteJpegLossless(kitBytes, inspectImage(kitBytes), metadata).bytes, kitBytes, `kit ${metadata}`);
      const again = await optimizeImage(fileOf(over()), { maxPixels: 1e5, metadata, processor: () => kit.file });
      assert.equal(again.kind, 'processed', `kit as processor ${metadata}`);
    }
  });

  it('null original under a selective mode must already be clean (COM / APPn / private PNG chunk → invalid)', async () => {
    const withCom = fileOf(buildJpeg({ width: 100, height: 100, segments: [com('hello')] }));
    assert.equal(await codeOf(optimizeImage(withCom, { metadata: 'none', processor: () => null })), 'processor-invalid-result');
    const withApp = fileOf(buildJpeg({ width: 100, height: 100, segments: [segment(0xe5, ascii('v'))] }));
    assert.equal(await codeOf(optimizeImage(withApp, { metadata: 'copyright', processor: () => null })), 'processor-invalid-result');
    const withDebg = fileOf(buildPng({ width: 100, height: 100, before: [chunk('deBG', ascii('x'))] }), 'a.png', 'image/png');
    assert.equal(await codeOf(optimizeImage(withDebg, { metadata: 'keep-no-gps', processor: () => null })), 'processor-invalid-result');
    const clean = fileOf(buildJpeg({ width: 100, height: 100, segments: [app0Jfif()] }));
    assert.equal((await optimizeImage(clean, { metadata: 'none', processor: () => null })).kind, 'original');
  });

  it('the input safety caps bind the result too (maxInputPixels / maxInputSide / maxHeaderBytes / maxInputBytes)', async () => {
    const src = () => fileOf(buildJpeg({ width: 100, height: 100, segments: [com('x')] }));
    const res = (bytes) => () => new Blob([bytes]);
    const lateSof = buildJpeg({ width: 50, height: 50, segments: [app0Jfif(), segment(0xdb, new Uint8Array(2048))] });
    const cases = [
      ['maxInputPixels', { maxInputPixels: 100 * 100 + 1 }, res(buildJpeg({ width: 1000, height: 1000 }))],
      ['maxInputSide', { maxInputSide: 100 }, res(buildJpeg({ width: 101, height: 1 }))],
      ['maxInputSide (height)', { maxInputSide: 100 }, res(buildJpeg({ width: 1, height: 101 }))],
      ['maxHeaderBytes', { maxHeaderBytes: 256 }, res(lateSof)],
      ['maxInputBytes', { maxInputBytes: 2000 }, res(jpegOfSize(50, 50, 3000))],
    ];
    for (const [why, caps, processor] of cases) {
      const code = await codeOf(optimizeImage(src(), { metadata: 'none', ...caps, processor }));
      assert.equal(code, 'processor-invalid-result', why);
    }
    // inside every cap → accepted
    const ok = await optimizeImage(src(), { metadata: 'none', maxInputSide: 100, maxInputPixels: 10000, maxHeaderBytes: 4096,
      processor: res(buildJpeg({ width: 100, height: 100 })) });
    assert.equal(ok.kind, 'processed');
  });

  it('PNG output with a bad chunk CRC → processor-invalid-result', async () => {
    const png = buildPng({ width: 10, height: 10 });
    png[png.length - 13] ^= 0xff; // IDAT CRC byte (IEND is the last 12)
    const code = await codeOf(optimizeImage(fileOf(buildPng({ width: 400, height: 300 }), 'a.png', 'image/png'),
      { maxWidth: 100, processor: () => new Blob([png]) }));
    assert.equal(code, 'processor-invalid-result');
  });

  it('size not readable (AVIF) under a dimension cap → processor-invalid-result', async () => {
    const avif = concat(be32(24), ascii('ftypavif'), be32(0), ascii('mif1avif'), new Uint8Array(40));
    const code = await codeOf(optimizeImage(fileOf(avif, 'a.avif', 'image/avif'), { maxPixels: 1e6, processor: () => new Blob([avif]) }));
    assert.equal(code, 'processor-invalid-result');
  });

  it('throws → processor-failed', async () => {
    const code = await codeOf(optimizeImage(fileOf(over()), { maxPixels: 1e6, processor: () => { throw new Error('boom'); } }));
    assert.equal(code, 'processor-failed');
    const code2 = await codeOf(optimizeImage(fileOf(over()), { maxPixels: 1e6, processor: async () => Promise.reject(new Error('x')) }));
    assert.equal(code2, 'processor-failed');
  });

  it('null = original, valid only when the original already satisfies the whole policy', async () => {
    const f = fileOf(buildJpeg({ width: 100, height: 100 }));
    const r = await optimizeImage(f, { metadata: 'none', processor: () => null });
    assert.equal(r.kind, 'original');
    assert.equal(r.file, f);
    const withGps = fileOf(buildJpeg({ width: 100, height: 100, segments: [app1Exif(tiff({ gps: true }))] }));
    assert.equal(await codeOf(optimizeImage(withGps, { metadata: 'none', processor: () => null })), 'processor-invalid-result');
  });
});

describe('metadataSatisfies', () => {
  const sum = (segs) => readMetadataSummary(buildJpeg({ width: 10, height: 10, segments: segs }));
  it('keep accepts anything; copyright allows Artist / Copyright EXIF + IPTC 2:80 / 2:116', () => {
    assert.equal(metadataSatisfies(sum([app1Xmp()]), 'keep'), true);
    assert.equal(metadataSatisfies(null, 'keep'), true);
    assert.equal(metadataSatisfies(null, 'none'), false);
    assert.equal(metadataSatisfies(sum([]), 'none'), true);
    assert.equal(metadataSatisfies(sum([app13Iptc({ datasets: [[2, 80, 'A'], [2, 116, 'C']] })]), 'copyright'), true);
    assert.equal(metadataSatisfies(sum([app13Iptc({ datasets: [[2, 80, 'A'], [2, 116, 'C']] })]), 'none'), false);
    const png = readMetadataSummary(buildPng({ before: [eXIf(tiff({ gps: true })), tEXt('Author', 'a')] }));
    assert.equal(metadataSatisfies(png, 'keep-no-gps'), false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------

describe('queue — module-global FIFO, one job at a time', () => {
  it('two jobs never overlap and keep their order', async () => {
    let running = 0;
    let maxRunning = 0;
    const order = [];
    const mk = (name) => fakeEngine({
      onOpen: async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        order.push(`${name}:open`);
        await tick();
        await tick();
      },
      onEncode: async () => {
        order.push(`${name}:encode`);
        await tick();
        running--;
      },
    });
    const started = [];
    const a = optimizeImage(fileOf(buildJpeg()), { maxPixels: 1e6 }, { engine: mk('a'), onStart: () => started.push('a') });
    const b = optimizeImage(fileOf(buildJpeg()), { maxPixels: 1e6 }, { engine: mk('b'), onStart: () => started.push('b') });
    const c = optimizeImage(fileOf(buildJpeg()), { maxPixels: 1e6 }, { engine: mk('c'), onStart: () => started.push('c') });
    await Promise.all([a, b, c]);
    assert.equal(maxRunning, 1);
    assert.deepEqual(started, ['a', 'b', 'c']);
    assert.deepEqual(order, ['a:open', 'a:encode', 'b:open', 'b:encode', 'c:open', 'c:encode']);
  });

  it('abort while queued: removed, rejects aborted at once, never started', async () => {
    const gate = deferred();
    const engA = fakeEngine({ gate: gate.promise });
    const engB = fakeEngine();
    const ac = new AbortController();
    let bStarted = false;
    const a = optimizeImage(fileOf(buildJpeg()), { maxPixels: 1e6 }, { engine: engA });
    const b = optimizeImage(fileOf(buildJpeg()), { maxPixels: 1e6 }, { engine: engB, signal: ac.signal, onStart: () => { bStarted = true; } });
    await tick();
    ac.abort();
    assert.equal(await codeOf(b), 'aborted');
    gate.resolve();
    await a;
    assert.equal(bStarted, false);
    assert.equal(engB.log.length, 0);
  });

  it('already-aborted signal rejects without queueing', async () => {
    const ac = new AbortController();
    ac.abort();
    const eng = fakeEngine();
    assert.equal(await codeOf(optimizeImage(fileOf(buildJpeg()), { maxPixels: 1e6 }, { engine: eng, signal: ac.signal })), 'aborted');
    assert.equal(eng.log.length, 0);
  });

  it('abort while running rejects at once, but the slot is held until the in-flight work settles', async () => {
    const gate = deferred();
    const engA = fakeEngine({ gate: gate.promise });
    const engB = fakeEngine();
    const ac = new AbortController();
    let bStarted = false;
    const a = optimizeImage(fileOf(buildJpeg()), { maxPixels: 1e6 }, { engine: engA, signal: ac.signal });
    const b = optimizeImage(fileOf(buildJpeg()), { maxPixels: 1e6 }, { engine: engB, onStart: () => { bStarted = true; } });
    await until(() => ops(engA, 'open').length === 1);
    ac.abort();
    assert.equal(await codeOf(a), 'aborted');
    await tick();
    assert.equal(bStarted, false, 'B waits for A\'s decode to settle');
    gate.resolve();
    await b;
    assert.equal(bStarted, true);
    assert.equal(ops(engA, 'encode').length, 0, 'no stage after the abort');
    assert.equal(ops(engA, 'close').length, 1, 'opened handle still closed');
  });
});

describe('abort after every await', () => {
  /** File whose reads call `hook(stage)` first. */
  class HookFile extends File {
    constructor(bytes, hook) {
      super([bytes], 'photo.jpg', { type: 'image/jpeg' });
      this.hook = hook;
    }
    async arrayBuffer() {
      await this.hook('full');
      return super.arrayBuffer();
    }
    slice(...args) {
      const blob = super.slice(...args);
      const hook = this.hook;
      blob.arrayBuffer = async function arrayBuffer() {
        await hook('head');
        return Blob.prototype.arrayBuffer.call(this);
      };
      return blob;
    }
  }
  /** Drain the queue: a non-image job resolves only after every earlier job released the slot. */
  const drain = () => optimizeImage(fileOf(ascii('%PDF-1.4 drain')), {});

  for (const stage of ['head', 'full']) {
    it(`abort during the ${stage} read → aborted, nothing decoded`, async () => {
      const ac = new AbortController();
      const eng = fakeEngine();
      const f = new HookFile(buildJpeg(), async (s) => { if (s === stage) ac.abort(); });
      assert.equal(await codeOf(optimizeImage(f, { maxPixels: 1e6 }, { engine: eng, signal: ac.signal })), 'aborted');
      await drain();
      assert.equal(eng.log.length, 0);
    });
  }

  it('abort during open → no encode, handle closed', async () => {
    const ac = new AbortController();
    const eng = fakeEngine({ onOpen: () => ac.abort() });
    assert.equal(await codeOf(optimizeImage(fileOf(buildJpeg()), { maxPixels: 1e6 }, { engine: eng, signal: ac.signal })), 'aborted');
    await drain();
    assert.equal(ops(eng, 'encode').length, 0);
    assert.equal(ops(eng, 'close').length, 1);
  });

  it('abort during an encode → no further encode, handle closed', async () => {
    const ac = new AbortController();
    const eng = fakeEngine({ size: () => 1e6, onEncode: () => ac.abort() });
    assert.equal(await codeOf(optimizeImage(fileOf(buildJpeg()), { maxPixels: 1e6, maxBytes: 5000 }, { engine: eng, signal: ac.signal })), 'aborted');
    await drain();
    assert.equal(ops(eng, 'encode').length, 1);
    assert.equal(ops(eng, 'close').length, 1);
  });

  it('abort while reading the encoder blob → aborted, no second encode', async () => {
    const ac = new AbortController();
    const eng = fakeEngine({ size: () => 1e6 });
    const encode = eng.encode;
    eng.encode = async (h, o) => {
      const blob = await encode(h, o);
      const ab = blob.arrayBuffer.bind(blob);
      blob.arrayBuffer = async () => {
        ac.abort();
        return ab();
      };
      return blob;
    };
    assert.equal(await codeOf(optimizeImage(fileOf(buildJpeg()), { maxPixels: 1e6, maxBytes: 5000 }, { engine: eng, signal: ac.signal })), 'aborted');
    await drain();
    assert.equal(ops(eng, 'encode').length, 1);
  });

  it('abort during the processor → aborted (not processor-failed / invalid), result ignored', async () => {
    const ac = new AbortController();
    let resultRead = false;
    const out = new Blob([buildJpeg({ width: 10, height: 10 })]);
    out.slice = () => {
      resultRead = true;
      return Blob.prototype.slice.call(out);
    };
    const processor = async (_f, { signal }) => {
      ac.abort();
      assert.equal(signal.aborted, true);
      return out;
    };
    assert.equal(await codeOf(optimizeImage(fileOf(buildJpeg()), { maxPixels: 1e6, processor }, { signal: ac.signal })), 'aborted');
    await drain();
    assert.equal(resultRead, false);
    const ac2 = new AbortController();
    const throwing = async () => {
      ac2.abort();
      throw new Error('cancelled');
    };
    assert.equal(await codeOf(optimizeImage(fileOf(buildJpeg()), { maxPixels: 1e6, processor: throwing }, { signal: ac2.signal })), 'aborted');
  });
});
