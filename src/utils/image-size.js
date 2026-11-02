/**
 * @internal v0.93.1 — read an image's display size from the first bytes of the file (plan v0.93.1-preview-cover).
 *
 * The grid-drop preview decodes once with both resize dimensions bounded (Codex security v0.93.0 SEC-04); to keep the
 * aspect ratio it needs the size first, without a probe decode. Header formats only:
 *
 *   PNG  — IHDR; chunks walked to IDAT; an eXIf chunk with an orientation other than 1 → null (engines differ on PNG
 *          orientation: no guessing; WebKit's canvas writes an eXIf with none)
 *   GIF  — logical screen size
 *   WebP — VP8 / VP8L / VP8X; VP8X with the EXIF flag → null (same reason)
 *   JPEG — SOF size, rotated by the EXIF orientation (APP1, tag 0x0112) — every engine applies it in
 *          createImageBitmap (measured: Chromium 148, Firefox 153, WebKit 26.4); a malformed orientation → null
 *
 * Anything else, a truncated / malformed header or a zero size → null (the caller keeps the kind icon). Every read is
 * bounds-checked; every loop moves forward. Not exported from the public entry.
 */

/** bytes read from the start of the file */
export const IMAGE_HEAD_BYTES = 256 * 1024;

/**
 * @param {Uint8Array} b file head
 * @returns {{ width: number, height: number } | null} display size (EXIF orientation applied)
 */
export function parseImageSize(b) {
  if (!(b instanceof Uint8Array)) return null;
  try {
    const size = png(b) || gif(b) || webp(b) || jpeg(b);
    if (!size || !(size.width >= 1) || !(size.height >= 1)) return null;
    return size;
  } catch {
    return null;
  }
}

/**
 * @param {Blob} file
 * @returns {Promise<{ width: number, height: number } | null>}
 */
export async function readImageSize(file) {
  try {
    const buf = await file.slice(0, IMAGE_HEAD_BYTES).arrayBuffer();
    return parseImageSize(new Uint8Array(buf));
  } catch {
    return null;
  }
}

const u16be = (b, i) => {
  if (i < 0 || i + 2 > b.length) throw new RangeError('head');
  return (b[i] << 8) | b[i + 1];
};
const u16le = (b, i) => {
  if (i < 0 || i + 2 > b.length) throw new RangeError('head');
  return b[i] | (b[i + 1] << 8);
};
const u32be = (b, i) => {
  if (i < 0 || i + 4 > b.length) throw new RangeError('head');
  return ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
};
const u32le = (b, i) => {
  if (i < 0 || i + 4 > b.length) throw new RangeError('head');
  return ((b[i + 3] << 24) >>> 0) + ((b[i + 2] << 16) | (b[i + 1] << 8) | b[i]);
};
const u24le = (b, i) => {
  if (i < 0 || i + 3 > b.length) throw new RangeError('head');
  return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
};
const ascii = (b, i, n) => {
  if (i < 0 || i + n > b.length) return '';
  let s = '';
  for (let k = 0; k < n; k++) s += String.fromCharCode(b[i + k]);
  return s;
};

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function png(b) {
  if (b.length < 24 || PNG_SIG.some((v, i) => b[i] !== v)) return null;
  if (u32be(b, 8) !== 13 || ascii(b, 12, 4) !== 'IHDR') throw new RangeError('png');
  const width = u32be(b, 16);
  const height = u32be(b, 20);
  for (let pos = 8; pos + 8 <= b.length;) {
    const type = ascii(b, pos + 4, 4);
    if (type === 'IEND') throw new RangeError('png');
    // eXIf (raw TIFF): orientation 1 / absent is the same in every engine (WebKit's own canvas PNG carries one); a
    // real rotation → null — engines differ on PNG orientation, no guessing
    if (type === 'eXIf' && exifOrientation(b, pos + 8, Math.min(pos + 8 + u32be(b, pos), b.length)) !== 1) throw new RangeError('png');
    if (type === 'IDAT') return { width, height };
    pos += 12 + u32be(b, pos); // length + type + data + crc: always forward
  }
  throw new RangeError('png'); // no IDAT in the head: an eXIf may still follow
}

function gif(b) {
  const sig = ascii(b, 0, 6);
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null;
  return { width: u16le(b, 6), height: u16le(b, 8) };
}

function webp(b) {
  if (ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) throw new RangeError('webp');
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    if (b.length < 25 || b[20] !== 0x2f) throw new RangeError('webp');
    const [b0, b1, b2, b3] = [b[21], b[22], b[23], b[24]];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  if (chunk === 'VP8X') {
    if (b.length < 30) throw new RangeError('webp');
    if (b[20] & 0x08) throw new RangeError('webp'); // EXIF present: orientation not guessed
    return { width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) };
  }
  throw new RangeError('webp');
}

function jpeg(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let orientation = 1;
  let sawExif = false;
  let pos = 2;
  while (pos < b.length) {
    if (b[pos] !== 0xff) throw new RangeError('jpeg');
    while (pos < b.length && b[pos] === 0xff) pos++; // fill bytes
    if (pos >= b.length) break;
    const marker = b[pos++];
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // no length
    if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS before a frame header
    const len = u16be(b, pos);
    if (len < 2) throw new RangeError('jpeg');
    const end = pos + len;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = u16be(b, pos + 3);
      const width = u16be(b, pos + 5);
      return orientation >= 5 ? { width: height, height: width } : { width, height };
    }
    if (marker === 0xe1 && !sawExif && ascii(b, pos + 2, 6) === 'Exif\0\0') {
      sawExif = true;
      orientation = exifOrientation(b, pos + 8, Math.min(end, b.length));
    }
    pos = end;
  }
  throw new RangeError('jpeg');
}

/**
 * Orientation tag of IFD0 in a TIFF block [start, end); 1 when absent; throws when malformed.
 */
function exifOrientation(b, start, end) {
  const view = b.subarray(start, end);
  const order = ascii(view, 0, 2);
  if (order !== 'II' && order !== 'MM') throw new RangeError('exif');
  const le = order === 'II';
  const r16 = (i) => (le ? u16le(view, i) : u16be(view, i));
  const r32 = (i) => (le ? u32le(view, i) : u32be(view, i));
  if (r16(2) !== 42) throw new RangeError('exif');
  const ifd = r32(4);
  const count = r16(ifd);
  for (let k = 0; k < count; k++) {
    const e = ifd + 2 + k * 12;
    if (r16(e) !== 0x0112) continue;
    const value = r16(e + 8);
    if (r16(e + 2) !== 3 || r32(e + 4) < 1 || value < 1 || value > 8) throw new RangeError('exif');
    return value;
  }
  return 1;
}
