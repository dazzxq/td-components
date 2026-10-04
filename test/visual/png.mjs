/**
 * Minimal PNG decoder (no dependencies, node:zlib only) — 8-bit RGB / RGBA, non-interlaced: exactly what Playwright
 * screenshots emit. Extracted from test/tokens/contrast.spec.mjs (v0.33.0) so the visual gate
 * (test/visual/media-picker.visual.mjs) and the contrast gate share one decoder.
 *
 * decodePng(buf) → { width, height, bpp, data, px(x, y) → [r, g, b] }
 *   data = unfiltered pixel bytes, row-major, `bpp` bytes per pixel (3 = RGB, 4 = RGBA).
 */
import { inflateSync } from 'node:zlib';

export function decodePng(buf) {
  let p = 8;
  let width = 0; let height = 0; let colorType = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c); const pb = Math.abs(a - c); const pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255;
    }
  }
  return { width, height, bpp, data: out, px: (x, y) => { const i = y * stride + x * bpp; return [out[i], out[i + 1], out[i + 2]]; } };
}

/**
 * Per-pixel comparison of two decoded PNGs. A pixel differs when any RGB channel differs by more than `threshold`
 * (alpha ignored). Different dimensions → every pixel of the larger image counts as different.
 * @returns {{ total: number, diff: number, ratio: number, sizeMismatch: boolean }}
 */
export function comparePng(a, b, threshold = 16) {
  if (a.width !== b.width || a.height !== b.height) {
    const total = Math.max(a.width * a.height, b.width * b.height);
    return { total, diff: total, ratio: 1, sizeMismatch: true };
  }
  const total = a.width * a.height;
  let diff = 0;
  for (let i = 0; i < total; i++) {
    const ia = i * a.bpp; const ib = i * b.bpp;
    if (Math.abs(a.data[ia] - b.data[ib]) > threshold
      || Math.abs(a.data[ia + 1] - b.data[ib + 1]) > threshold
      || Math.abs(a.data[ia + 2] - b.data[ib + 2]) > threshold) diff++;
  }
  return { total, diff, ratio: total ? diff / total : 0, sizeMismatch: false };
}
