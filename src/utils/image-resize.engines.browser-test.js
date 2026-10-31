import { expect } from '@esm-bundle/chai';
import { optimizeImage, probeOrientation, ImageResizeError } from './image-resize.js';
import { inspectImage, sniffFormat } from './image-bytes.js';
import { assembleJpeg, assemblePng, readMetadataSummary, rewriteJpegLossless, rewritePngLossless } from './image-metadata.js';
import { buildTiff, app1Exif, app1Xmp, app13Iptc } from '../../test/fixtures/image-builders.js';

// v0.90.0 (plan docs/internal/plans/v0.90.0-image-resize.md step 2) — the REAL canvas engine in Chromium, Firefox AND
// WebKit (group `engines`): synthetic canvas images only (no camera files), decoded back with createImageBitmap.

const toBlob = (c, type, q) => new Promise((r) => c.toBlob(r, type, q));
async function canvasImage(w, h, draw, type = 'image/jpeg', q = 0.92) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const blob = await toBlob(c, type, q);
  c.width = 0;
  c.height = 0;
  // WebKit's encoders write their own EXIF / APP13 (JPEG) and eXIf (PNG): strip them so a fixture carries only the
  // metadata the test adds (two EXIF blocks = ambiguous = dropped family).
  const raw = new Uint8Array(await blob.arrayBuffer());
  const ins = inspectImage(raw);
  return (type === 'image/png' ? rewritePngLossless(raw, ins, 'none') : rewriteJpegLossless(raw, ins, 'none')).bytes;
}
const fileOf = (bytes, name = 'photo.jpg', type = 'image/jpeg') => new File([bytes], name, { type });
const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());
async function codeOf(p) {
  try {
    await p;
  } catch (e) {
    return e instanceof ImageResizeError ? e.code : `unexpected ${e && e.name}`;
  }
  return null;
}
/** Decoded pixels of a blob: `{ w, h, at(x, y) → [r, g, b, a] }`. */
async function pixels(blob) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  const w = c.width;
  const h = c.height;
  c.width = 0;
  c.height = 0;
  return { w, h, at: (x, y) => Array.from(data.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)) };
}

const COLOURS = { red: [255, 0, 0], green: [0, 200, 0], blue: [0, 0, 255], yellow: [255, 255, 0] };
const nearest = (p) => Object.entries(COLOURS)
  .map(([name, c]) => [name, (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2])
  .sort((a, b) => a[1] - b[1])[0][0];
/** Stored image: TL red, TR green, BL blue, BR yellow. */
function quadrants(ctx, w, h) {
  const fill = (name, x, y) => {
    ctx.fillStyle = `rgb(${COLOURS[name].join(',')})`;
    ctx.fillRect(x, y, w / 2, h / 2);
  };
  fill('red', 0, 0);
  fill('green', w / 2, 0);
  fill('blue', 0, h / 2);
  fill('yellow', w / 2, h / 2);
}
/** Display (u, v) → stored (su, sv), normalised, per EXIF Orientation 1-8. */
const STORED = {
  1: (u, v) => [u, v], 2: (u, v) => [1 - u, v], 3: (u, v) => [1 - u, 1 - v], 4: (u, v) => [u, 1 - v],
  5: (u, v) => [v, u], 6: (u, v) => [v, 1 - u], 7: (u, v) => [1 - v, 1 - u], 8: (u, v) => [1 - v, u],
};
const storedColour = (su, sv) => (sv < 0.5 ? (su < 0.5 ? 'red' : 'green') : (su < 0.5 ? 'blue' : 'yellow'));
const orientationExif = (o) => app1Exif(buildTiff({ orientation: o, pixel: null }).bytes);

async function expectUpright(blob, orientation) {
  const px = await pixels(blob);
  for (const [u, v] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
    const [su, sv] = STORED[orientation](u, v);
    const got = nearest(px.at(Math.floor(u * px.w), Math.floor(v * px.h)));
    expect(got, `orientation ${orientation} at (${u}, ${v})`).to.equal(storedColour(su, sv));
  }
  return px;
}

describe('image-resize engine — size / MIME / bytes', function () {
  this.timeout(60000);

  it('4000×3000 canvas JPEG → 3 MP / 300 KB: 2000×1500, image/jpeg, ≤ maxBytes', async () => {
    const src = await canvasImage(4000, 3000, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#204080');
      g.addColorStop(1, '#f0c040');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % w, (i * 61) % h, 120, 80);
    });
    const r = await optimizeImage(fileOf(src), { maxPixels: 3e6, maxBytes: 300000 });
    expect(r.kind).to.equal('resized');
    expect(r.file.type).to.equal('image/jpeg');
    expect(r.file.size).to.be.at.most(300000);
    const out = await bytesOf(r.file);
    expect(sniffFormat(out)).to.equal('jpeg');
    const ins = inspectImage(out);
    expect([ins.width, ins.height]).to.deep.equal([2000, 1500]);
    expect(r.optimization.output).to.deep.equal({ type: 'image/jpeg', size: r.file.size, width: 2000, height: 1500 });
    const px = await pixels(r.file);
    expect([px.w, px.h]).to.deep.equal([2000, 1500]);
  });

  it('busy image: quality / size search still lands under maxBytes', async () => {
    const src = await canvasImage(4000, 3000, (ctx, w, h) => {
      let seed = 7;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
      for (let i = 0; i < 6000; i++) {
        ctx.fillStyle = `rgb(${(rnd() * 255) | 0},${(rnd() * 255) | 0},${(rnd() * 255) | 0})`;
        ctx.fillRect(rnd() * w, rnd() * h, 10 + rnd() * 120, 10 + rnd() * 120);
      }
    });
    const r = await optimizeImage(fileOf(src), { maxPixels: 3e6, maxBytes: 300000 });
    expect(r.file.size).to.be.at.most(300000);
    const { width, height } = r.optimization.output;
    expect(width * height).to.be.at.most(3e6);
    expect(Math.abs(width / height - 4 / 3)).to.be.below(0.01);
  });
});

describe('image-resize engine — orientation', function () {
  this.timeout(30000);

  it('JPEG orientation probe passes', async () => {
    expect(await probeOrientation('jpeg')).to.equal(true);
  });

  for (let o = 1; o <= 8; o++) {
    it(`JPEG Orientation ${o} → upright pixels, Orientation 1 in the output`, async () => {
      const raw = await canvasImage(64, 32, quadrants, 'image/jpeg', 1);
      const src = assembleJpeg(raw, [orientationExif(o)]);
      const r = await optimizeImage(fileOf(src), { maxWidth: 16 });
      expect(r.kind).to.equal('resized');
      const swap = o >= 5;
      expect([r.optimization.output.width, r.optimization.output.height]).to.deep.equal(swap ? [16, 32] : [16, 8]);
      const px = await expectUpright(r.file, o);
      expect([px.w, px.h]).to.deep.equal(swap ? [16, 32] : [16, 8]);
      expect(readMetadataSummary(await bytesOf(r.file)).orientation).to.equal(1);
    });
  }

  it('orientation 6: the top-left corner is the stored bottom-left colour', async () => {
    const raw = await canvasImage(64, 32, quadrants, 'image/jpeg', 1);
    const r = await optimizeImage(fileOf(assembleJpeg(raw, [orientationExif(6)])), { maxPixels: 512 });
    const px = await pixels(r.file);
    expect(nearest(px.at(1, 1))).to.equal('blue');
    expect(nearest(px.at(px.w - 2, 1))).to.equal('red');
  });

  it('PNG eXIf orientation 6: upright when the probe passes, else resize-unsupported', async () => {
    const raw = await canvasImage(64, 32, quadrants, 'image/png');
    const src = assemblePng(raw, [{ type: 'eXIf', data: buildTiff({ orientation: 6, pixel: null }).bytes }]);
    const probe = await probeOrientation('png');
    const p = optimizeImage(fileOf(src, 'a.png', 'image/png'), { maxWidth: 16 });
    if (probe) {
      const r = await p;
      expect(r.file.type).to.equal('image/png');
      await expectUpright(r.file, 6);
    } else {
      expect(await codeOf(p)).to.equal('resize-unsupported');
    }
  });
});

describe('image-resize engine — PNG alpha', function () {
  this.timeout(30000);

  it('PNG stays PNG and keeps alpha', async () => {
    const src = await canvasImage(400, 300, (ctx) => {
      ctx.fillStyle = 'rgba(0, 128, 255, 0.5)';
      ctx.fillRect(0, 0, 400, 300);
    }, 'image/png');
    const r = await optimizeImage(fileOf(src, 'a.png', 'image/png'), { maxWidth: 200 });
    expect(r.file.type).to.equal('image/png');
    const out = await bytesOf(r.file);
    expect(sniffFormat(out)).to.equal('png');
    const px = await pixels(r.file);
    expect([px.w, px.h]).to.deep.equal([200, 150]);
    const [, , b, a] = px.at(100, 75);
    expect(Math.abs(a - 128)).to.be.below(16);
    expect(b).to.be.above(200);
  });
});

describe('image-resize engine — metadata', function () {
  this.timeout(30000);

  let source;
  before(async () => {
    const raw = await canvasImage(800, 600, quadrants);
    const tiff = buildTiff({ le: true, gps: true, makerNote: true, artist: 'Ann', copyright: '(c) Ann', pixel: { type: 'long', x: 800, y: 600 } }).bytes;
    source = assembleJpeg(raw, [app1Exif(tiff), app1Xmp(), app13Iptc()]);
  });

  const MODES = {
    keep: (s) => {
      expect(s.hasExif).to.equal(true);
      expect(s.exifGps).to.equal(true);
      expect(s.hasXmp).to.equal(true);
      expect(s.hasIptc).to.equal(true);
      expect(s.iptcDatasets).to.include('2:90');
    },
    'keep-no-gps': (s) => {
      expect(s.hasExif).to.equal(true);
      expect(s.exifGps).to.equal(false);
      expect(s.hasXmp).to.equal(false);
      expect(s.iptcDatasets).to.include('2:80');
      for (const d of ['2:26', '2:27', '2:90', '2:92', '2:95', '2:100', '2:101']) expect(s.iptcDatasets).to.not.include(d);
    },
    copyright: (s) => {
      expect(s.hasExif).to.equal(true);
      expect(s.exifTags.every((t) => t === 0x013b || t === 0x8298)).to.equal(true);
      expect(s.exifGps).to.equal(false);
      expect(s.hasXmp).to.equal(false);
      expect(s.iptcDatasets.every((d) => ['1:90', '2:80', '2:116'].includes(d))).to.equal(true);
      expect(s.iptcDatasets).to.include('2:116');
    },
    none: (s) => {
      expect(s.hasExif).to.equal(false);
      expect(s.hasXmp).to.equal(false);
      expect(s.hasIptc).to.equal(false);
      expect(s.gpsPresent).to.equal(false);
    },
  };

  for (const [metadata, check] of Object.entries(MODES)) {
    it(`resized JPEG, metadata ${metadata}: read back + still decodes`, async () => {
      const r = await optimizeImage(fileOf(source), { maxWidth: 400, metadata });
      expect(r.kind).to.equal('resized');
      expect(r.optimization.metadata.mode).to.equal(metadata);
      check(readMetadataSummary(await bytesOf(r.file)));
      const px = await pixels(r.file);
      expect([px.w, px.h]).to.deep.equal([400, 300]);
    });
  }

  it('compliant JPEG, keep-no-gps: lossless rewrite keeps every byte from SOS, GPS gone, still decodes', async () => {
    const r = await optimizeImage(fileOf(source), { maxWidth: 800, metadata: 'keep-no-gps' });
    expect(r.kind).to.equal('rewritten');
    const out = await bytesOf(r.file);
    const a = source.subarray(inspectImage(source).jpeg.sosOffset);
    const b = out.subarray(inspectImage(out).jpeg.sosOffset);
    expect(a.length).to.equal(b.length);
    expect(a.every((x, i) => x === b[i])).to.equal(true);
    expect(readMetadataSummary(out).exifGps).to.equal(false);
    const px = await pixels(r.file);
    expect([px.w, px.h]).to.deep.equal([800, 600]);
  });
});

describe('image-resize engine — abort', function () {
  this.timeout(30000);

  it('abort mid-way never resolves a file; a queued job aborted never reaches its processor; the queue moves on', async () => {
    const big = await canvasImage(3000, 2000, quadrants);
    const ac = new AbortController();
    const acB = new AbortController();
    let resolvedA = false;
    let processorCalls = 0;
    const a = optimizeImage(fileOf(big), { maxPixels: 1e6 }, {
      signal: ac.signal,
      onStart: () => setTimeout(() => ac.abort(), 0),
    }).then(() => { resolvedA = true; });
    const aCode = codeOf(a);
    const bCode = codeOf(optimizeImage(fileOf(big), { maxPixels: 1e6, processor: () => { processorCalls++; return null; } }, { signal: acB.signal }));
    acB.abort();
    expect(await aCode).to.equal('aborted');
    expect(await bCode).to.equal('aborted');
    const after = await optimizeImage(fileOf(big), { maxPixels: 1e6 });
    expect(after.kind).to.equal('resized');
    expect(resolvedA).to.equal(false);
    expect(processorCalls).to.equal(0);
  });
});
