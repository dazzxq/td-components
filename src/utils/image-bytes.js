/**
 * v0.90.0 (plan docs/internal/plans/v0.90.0-image-resize.md § 3, § 5, step 1) — byte layer of the client image resize:
 * magic-byte sniffing, bounded header inspection (JPEG markers through the entropy data to the primary EOI, PNG chunks,
 * GIF / WebP dimensions) and the EXIF (TIFF) reader the metadata module patches with.
 *
 * Every input here is an UNTRUSTED user file. Rules: every read is bounds-checked before it happens, loops advance or
 * stop, structure counts are capped, and the only exception that escapes is `ImageResizeError` (the EXIF reader returns
 * a typed failure instead, because broken optional metadata never fails the image). Pure functions on `Uint8Array`, no
 * DOM, no Node API.
 *
 * @module utils/image-bytes
 */

/** The one error type of the resize pipeline. `code` is a stable string (`invalid-image`, `header-limit`, …). */
export class ImageResizeError extends Error {
  /** @param {string} code @param {string} [message] */
  constructor(code, message) {
    super(message || code);
    this.name = 'ImageResizeError';
    this.code = code;
  }
}

/** Cap of JPEG marker segments (header + between scans). */
export const MAX_JPEG_SEGMENTS = 4096;
/** Cap of PNG chunks: large PNGs split IDAT into many 8-32 KiB chunks, so this is higher than the JPEG cap. */
export const MAX_PNG_CHUNKS = 65536;
/** Cap of entries in one TIFF IFD. */
export const MAX_IFD_ENTRIES = 512;
/** Default `maxHeaderBytes` (policy default 1 MiB). */
export const DEFAULT_MAX_HEADER_BYTES = 1 << 20;

const fail = (code, message) => {
  throw new ImageResizeError(code, message);
};

// ---------------------------------------------------------------------------------------------------------------------
// Small byte helpers (exported for image-metadata.js; all bounds-checked)

/** Big-endian u16 at `o`; throws `code` when out of range. */
export function be16(b, o, code = 'invalid-image') {
  if (!(o >= 0 && o + 2 <= b.length)) fail(code, 'read out of range');
  return (b[o] << 8) | b[o + 1];
}
/** Big-endian u32 at `o`; throws `code` when out of range. */
export function be32(b, o, code = 'invalid-image') {
  if (!(o >= 0 && o + 4 <= b.length)) fail(code, 'read out of range');
  return ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
}
/** True when the ASCII string `s` is at `b[o…]` (false when it would run past the end). */
export function hasAscii(b, o, s) {
  if (!(o >= 0 && o + s.length <= b.length)) return false;
  for (let i = 0; i < s.length; i++) if (b[o + i] !== s.charCodeAt(i)) return false;
  return true;
}
/** First index of ASCII `s` in `b[from, to)`, or -1. Bounded naive search (inputs are ≤ 64 KiB segments). */
export function indexOfAscii(b, s, from = 0, to = b.length) {
  const end = Math.min(to, b.length) - s.length;
  const c0 = s.charCodeAt(0);
  for (let i = Math.max(0, from); i <= end; i++) {
    if (b[i] === c0 && hasAscii(b, i, s)) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------------------------------------------------
// Sniffing

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis']);

function sniffFtyp(b) {
  if (!hasAscii(b, 4, 'ftyp')) return null;
  const major = String.fromCharCode(b[8], b[9], b[10], b[11]);
  if (major === 'avif' || major === 'avis') return 'avif';
  if (HEIC_BRANDS.has(major)) return 'heic';
  if (major !== 'mif1' && major !== 'msf1') return null;
  // Generic HEIF brand: look at the compatible brands inside the (bounded) ftyp box.
  const size = be32(b, 0);
  const end = Math.min(size, b.length, 256);
  let found = null;
  for (let o = 16; o + 4 <= end; o += 4) {
    const brand = String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (HEIC_BRANDS.has(brand)) found = 'heic';
  }
  return found;
}

const isWs = (c) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;

/**
 * Conservative SVG text sniff: optional UTF-8 BOM, then only whitespace, `<?xml …?>`, comments and a DOCTYPE may come
 * before a `<svg` tag. Looks at most at the first 4 KiB; anything else (or running out of bytes) → not SVG.
 */
function sniffSvg(b) {
  const end = Math.min(b.length, 4096);
  let i = 0;
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) i = 3;
  const lower = (o, s) => {
    if (o + s.length > end) return false;
    for (let k = 0; k < s.length; k++) {
      let c = b[o + k];
      if (c >= 0x41 && c <= 0x5a) c += 0x20;
      if (c !== s.charCodeAt(k)) return false;
    }
    return true;
  };
  const skipTo = (from, s) => {
    const at = indexOfAscii(b, s, from, end);
    return at < 0 ? -1 : at + s.length;
  };
  for (let guard = 0; guard < 64 && i < end; guard++) {
    while (i < end && isWs(b[i])) i++;
    if (i >= end) return false;
    if (lower(i, '<svg')) {
      const c = b[i + 4];
      return c === undefined ? false : isWs(c) || c === 0x3e || c === 0x2f;
    }
    if (lower(i, '<?xml')) i = skipTo(i + 5, '?>');
    else if (hasAscii(b, i, '<!--')) i = skipTo(i + 4, '-->');
    else if (lower(i, '<!doctype')) {
      const gt = indexOfAscii(b, '>', i, end);
      const br = indexOfAscii(b, '[', i, end);
      i = br >= 0 && (gt < 0 || br < gt) ? skipTo(br, ']>') : gt < 0 ? -1 : gt + 1;
    } else return false;
    if (i < 0) return false;
  }
  return false;
}

/**
 * Format by magic bytes (never by MIME / extension). `null` = not an image this kit recognises.
 * @param {Uint8Array} b leading bytes of the file (64 is enough for every binary format; SVG behind a long prolog
 *   needs more, up to 4 KiB)
 * @returns {'jpeg'|'png'|'gif'|'webp'|'avif'|'heic'|'svg'|'bmp'|'tiff'|'jxl'|null}
 */
export function sniffFormat(b) {
  if (!(b instanceof Uint8Array) || b.length < 2) return null;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b[0] === 0x89 && hasAscii(b, 1, 'PNG\r\n\x1a\n')) return 'png';
  if (hasAscii(b, 0, 'GIF87a') || hasAscii(b, 0, 'GIF89a')) return 'gif';
  if (hasAscii(b, 0, 'RIFF') && hasAscii(b, 8, 'WEBP')) return 'webp';
  if (b.length >= 12) {
    const f = sniffFtyp(b);
    if (f) return f;
  }
  if (b[0] === 0xff && b[1] === 0x0a) return 'jxl';
  if (b.length >= 12 && b[0] === 0 && b[1] === 0 && b[2] === 0 && b[3] === 0x0c && hasAscii(b, 4, 'JXL \r\n\x87\n')) return 'jxl';
  if (b.length >= 4 && ((hasAscii(b, 0, 'II') && b[2] === 42 && b[3] === 0) || (hasAscii(b, 0, 'MM') && b[2] === 0 && b[3] === 42))) return 'tiff';
  if (b.length >= 18 && hasAscii(b, 0, 'BM')) {
    const dib = b[14] | (b[15] << 8) | (b[16] << 16) | (b[17] << 24);
    if ([12, 40, 52, 56, 64, 108, 124].includes(dib)) return 'bmp';
  }
  if (sniffSvg(b)) return 'svg';
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// EXIF / TIFF reader

/** Byte size of TIFF field types 1-13; 0 = unknown type. */
const TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4];
export const TIFF_SHORT = 3;
export const TIFF_LONG = 4;
export const TIFF_ASCII = 2;

class ExifInvalid extends Error {}
const bad = (why) => {
  throw new ExifInvalid(why);
};
const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1];

/**
 * Read a TIFF structure (EXIF APP1 body after `Exif\0\0`, or PNG `eXIf` data) in `b[start, end)`. Never throws.
 *
 * Walks IFD0, the Exif IFD (0x8769), its Interop IFD (0xA005), the GPS IFD (0x8825) and IFD1 (thumbnail). Rejects (→
 * `{ valid: false }`) bad byte order / magic, an offset or value range outside the TIFF, IFD cycles (visited set) or
 * overlapping IFD structures, > 512 entries, duplicate tags, wrong type/count on a tag that is patched or followed, a
 * thumbnail range out of bounds, GPS / IFD1 ranges (which get zeroed) overlapping retained structure, and any
 * out-of-line value (MakerNote, ASCII, thumbnail…) overlapping an IFD table.
 *
 * All offsets returned are RELATIVE to `start`, so the same result can patch a copy of the TIFF bytes.
 *
 * @param {Uint8Array} b
 * @param {number} [start]
 * @param {number} [end]
 * @returns {ExifInfo}
 *
 * @typedef {{ at: number, type: number }} Slot  value slot of a SHORT/LONG count-1 tag
 * @typedef {{ at: number, length: number }} ByteRange
 * @typedef {{
 *   valid: boolean, reason?: string, le: boolean, orientation: number,
 *   slots: { orientation: Slot|null, pixelX: Slot|null, pixelY: Slot|null, imageWidth: Slot|null, imageLength: Slot|null },
 *   ifd0NextAt: number, ifd1Ranges: Array<[number, number]>|null,
 *   gps: { ifdStart: number, ifdEnd: number, entryCount: number, ranges: Array<[number, number]> }|null,
 *   hasStrips: boolean, hasMakerNote: boolean, hasExifIfd: boolean, ifd0Tags: number[],
 *   artist: ByteRange|null, copyright: ByteRange|null,
 * }} ExifInfo
 */
export function readExif(b, start = 0, end = b.length) {
  /** @type {ExifInfo} */
  const info = {
    valid: false, le: false, orientation: 1,
    slots: { orientation: null, pixelX: null, pixelY: null, imageWidth: null, imageLength: null },
    ifd0NextAt: -1, ifd1Ranges: null, gps: null,
    hasStrips: false, hasMakerNote: false, hasExifIfd: false, ifd0Tags: [],
    artist: null, copyright: null,
  };
  try {
    if (!(start >= 0 && end <= b.length && end - start >= 8)) bad('short tiff');
    const len = end - start;
    let le;
    if (b[start] === 0x49 && b[start + 1] === 0x49) le = true;
    else if (b[start] === 0x4d && b[start + 1] === 0x4d) le = false;
    else bad('byte order');
    info.le = le;
    const need = (o, n) => {
      if (!(o >= 0 && n >= 0 && o + n <= len)) bad('out of bounds');
    };
    const r16 = (o) => {
      need(o, 2);
      const p = start + o;
      return le ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1];
    };
    const r32 = (o) => {
      need(o, 4);
      const p = start + o;
      return le
        ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16)) + b[p + 3] * 0x1000000
        : b[p] * 0x1000000 + ((b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]);
    };
    if (r16(2) !== 42) bad('magic');

    const visited = new Set();
    /** IFD structure ranges (all IFDs) — must not overlap each other. */
    const structs = [];
    /** Every out-of-line value range of every IFD (+ thumbnail / strip data). */
    const allValues = [];
    const retained = [[0, 8]];

    const readIfd = (off) => {
      if (off < 8 || visited.has(off)) bad('ifd cycle');
      visited.add(off);
      const n = r16(off);
      if (n > MAX_IFD_ENTRIES) bad('too many entries');
      const range = [off, off + 2 + 12 * n + 4];
      need(off, range[1] - off);
      for (const s of structs) if (overlaps(s, range)) bad('ifd overlap');
      structs.push(range);
      const entries = new Map();
      const values = [];
      for (let i = 0; i < n; i++) {
        const e = off + 2 + 12 * i;
        const tag = r16(e);
        const type = r16(e + 2);
        const count = r32(e + 4);
        if (entries.has(tag)) bad('duplicate tag');
        const size = TYPE_SIZE[type] || 0;
        const total = size * count; // ≤ 8 · (2^32 - 1), exact in a double
        let at = e + 8;
        if (size && total > 4) {
          at = r32(e + 8);
          if (at < 8) bad('value offset');
          need(at, total);
          values.push([at, at + total]);
          allValues.push([at, at + total]);
        }
        entries.set(tag, { tag, type, count, at, size, total });
      }
      return { range, entries, values, nextAt: off + 2 + 12 * n, next: r32(off + 2 + 12 * n) };
    };
    const slot = (entries, tag, types) => {
      const e = entries.get(tag);
      if (!e) return null;
      if (!types.includes(e.type) || e.count !== 1) bad(`bad type for tag ${tag}`);
      return { at: e.at, type: e.type };
    };
    const slotValue = (s) => (s.type === TIFF_SHORT ? r16(s.at) : r32(s.at));
    const pointer = (entries, tag) => {
      const e = entries.get(tag);
      if (!e) return 0;
      if ((e.type !== TIFF_LONG && e.type !== 13) || e.count !== 1) bad(`bad pointer ${tag}`);
      return r32(e.at);
    };
    const asciiRange = (entries, tag) => {
      const e = entries.get(tag);
      if (!e || e.type !== TIFF_ASCII || e.count === 0) return null;
      return { at: e.at, length: e.count };
    };
    /** Values of a SHORT/LONG array tag (bounded by MAX_IFD_ENTRIES). */
    const arrayValues = (e) => {
      if ((e.type !== TIFF_SHORT && e.type !== TIFF_LONG) || e.count > MAX_IFD_ENTRIES) bad('bad strip array');
      const out = [];
      for (let i = 0; i < e.count; i++) out.push(e.type === TIFF_SHORT ? r16(e.at + 2 * i) : r32(e.at + 4 * i));
      return out;
    };

    const ifd0 = readIfd(r32(4));
    info.ifd0Tags = [...ifd0.entries.keys()];
    info.ifd0NextAt = ifd0.nextAt;
    retained.push(ifd0.range, ...ifd0.values);
    const s = info.slots;
    s.orientation = slot(ifd0.entries, 0x0112, [TIFF_SHORT]);
    if (s.orientation) {
      const v = slotValue(s.orientation);
      info.orientation = v >= 1 && v <= 8 ? v : 1;
    }
    s.imageWidth = slot(ifd0.entries, 0x0100, [TIFF_SHORT, TIFF_LONG]);
    s.imageLength = slot(ifd0.entries, 0x0101, [TIFF_SHORT, TIFF_LONG]);
    info.hasStrips = ifd0.entries.has(0x0111) || ifd0.entries.has(0x0144);
    info.artist = asciiRange(ifd0.entries, 0x013b);
    info.copyright = asciiRange(ifd0.entries, 0x8298);

    const exifOff = pointer(ifd0.entries, 0x8769);
    if (exifOff) {
      const exif = readIfd(exifOff);
      info.hasExifIfd = true;
      retained.push(exif.range, ...exif.values);
      s.pixelX = slot(exif.entries, 0xa002, [TIFF_SHORT, TIFF_LONG]);
      s.pixelY = slot(exif.entries, 0xa003, [TIFF_SHORT, TIFF_LONG]);
      info.hasMakerNote = exif.entries.has(0x927c);
      const interOff = pointer(exif.entries, 0xa005);
      if (interOff) {
        const inter = readIfd(interOff);
        retained.push(inter.range, ...inter.values);
      }
    }

    const zeroed = [];
    const gpsOff = pointer(ifd0.entries, 0x8825);
    if (gpsOff) {
      const gps = readIfd(gpsOff);
      for (const e of gps.entries.values()) if (!e.size) bad('unknown type in gps');
      info.gps = { ifdStart: gps.range[0], ifdEnd: gps.range[1], entryCount: gps.entries.size, ranges: [gps.range, ...gps.values] };
      zeroed.push(...info.gps.ranges);
    }
    if (ifd0.next) {
      const ifd1 = readIfd(ifd0.next);
      for (const e of ifd1.entries.values()) if (!e.size) bad('unknown type in ifd1');
      const ranges = [ifd1.range, ...ifd1.values];
      const tOff = ifd1.entries.get(0x0201);
      const tLen = ifd1.entries.get(0x0202);
      if (tOff || tLen) {
        if (!tOff || !tLen) bad('thumbnail pair');
        const o = slotValue(slot(ifd1.entries, 0x0201, [TIFF_LONG, TIFF_SHORT]));
        const l = slotValue(slot(ifd1.entries, 0x0202, [TIFF_LONG, TIFF_SHORT]));
        if (o < 8) bad('thumbnail offset');
        need(o, l);
        ranges.push([o, o + l]);
      }
      const sOff = ifd1.entries.get(0x0111);
      const sCnt = ifd1.entries.get(0x0117);
      if (sOff || sCnt) {
        if (!sOff || !sCnt) bad('strip pair');
        const offs = arrayValues(sOff);
        const cnts = arrayValues(sCnt);
        if (offs.length !== cnts.length) bad('strip count');
        offs.forEach((o, i) => {
          if (o < 8) bad('strip offset');
          need(o, cnts[i]);
          ranges.push([o, o + cnts[i]]);
        });
      }
      allValues.push(...ranges.slice(1 + ifd1.values.length));
      info.ifd1Ranges = ranges;
      zeroed.push(...ranges);
    }
    for (const z of zeroed) for (const r of retained) if (z[1] > z[0] && overlaps(z, r)) bad('zero range overlaps retained data');
    // An out-of-line value (MakerNote, ASCII, rationals, thumbnail…) must not overlap any IFD table: patching a slot or
    // zeroing a range would otherwise corrupt the other.
    for (const v of allValues) for (const st of structs) if (v[1] > v[0] && overlaps(v, st)) bad('value overlaps an IFD');
    info.valid = true;
  } catch (err) {
    if (!(err instanceof ExifInvalid)) throw err;
    info.valid = false;
    info.reason = err.message;
  }
  return info;
}

// ---------------------------------------------------------------------------------------------------------------------
// Inspection

export const XMP_STD_SIG = 'http://ns.adobe.com/xap/1.0/\0';
export const XMP_EXT_SIG = 'http://ns.adobe.com/xmp/extension/\0';
export const EXIF_SIG = 'Exif\0\0';
export const PHOTOSHOP_SIG = 'Photoshop 3.0\0';

const isSof = (m) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
const isRst = (m) => m >= 0xd0 && m <= 0xd7;

/** What kind of APPn / metadata a header segment is (`null` = not metadata). */
export function jpegSegmentKind(b, seg) {
  const p = seg.payloadStart;
  const end = seg.end;
  const at = (s) => p + s.length <= end && hasAscii(b, p, s);
  switch (seg.marker) {
    case 0xe0: return at('JFIF\0') ? 'jfif' : at('JFXX\0') ? 'jfxx' : 'app';
    case 0xe1: return at(EXIF_SIG) ? 'exif' : at(XMP_STD_SIG) ? 'xmp' : at(XMP_EXT_SIG) ? 'xmp-ext' : 'app';
    case 0xe2: return at('ICC_PROFILE\0') ? 'icc' : at('MPF\0') ? 'mpf' : 'app';
    case 0xeb: return at('JP') ? 'jumbf' : 'app';
    case 0xed: return at(PHOTOSHOP_SIG) ? 'photoshop' : 'app';
    case 0xee: return at('Adobe') ? 'adobe' : 'app';
    case 0xfe: return 'com';
    default: return seg.marker >= 0xe0 && seg.marker <= 0xef ? 'app' : null;
  }
}

function inspectJpeg(b, maxHeaderBytes) {
  const segments = [];
  let sof = null;
  let pos = 2;
  for (;;) {
    if (!sof && pos >= maxHeaderBytes) fail('header-limit', 'no SOF within maxHeaderBytes');
    if (pos >= b.length || b[pos] !== 0xff) fail('invalid-image', 'expected a marker');
    while (pos < b.length && b[pos] === 0xff) pos++;
    if (pos >= b.length) fail('invalid-image', 'truncated marker');
    const m = b[pos];
    const start = pos - 1;
    pos++;
    if (m === 0x01 || isRst(m)) continue; // standalone marker, tolerated
    if (m === 0x00 || m === 0xd8 || m === 0xd9) fail('invalid-image', 'unexpected marker before SOS');
    const length = be16(b, pos);
    if (length < 2) fail('invalid-image', 'segment length');
    const end = pos + length;
    if (end > b.length) fail('invalid-image', 'truncated segment');
    if (segments.length >= MAX_JPEG_SEGMENTS) fail('invalid-image', 'too many segments');
    const seg = { marker: m, start, length, payloadStart: pos + 2, end };
    segments.push(seg);
    if (isSof(m)) {
      if (sof) fail('invalid-image', 'second SOF');
      if (length < 8) fail('invalid-image', 'short SOF');
      if (end > maxHeaderBytes) fail('header-limit', 'SOF beyond maxHeaderBytes');
      sof = { precision: b[pos + 2], height: be16(b, pos + 3), width: be16(b, pos + 5) };
      if (!sof.width || !sof.height) fail('invalid-image', 'zero dimension (DNL unsupported)');
    }
    pos = end;
    if (m === 0xda) break;
  }
  if (!sof) fail('invalid-image', 'SOS before SOF');

  // Entropy walk: FF00 stuffing, RST0-7, fill bytes, further marker segments / scans, up to the primary EOI. Every
  // segment after the first SOS (DHT, further SOS, but also APPn / COM a writer may slip between scans) is recorded and
  // bounds-checked: metadata there must not ride along in a lossless rewrite. No EOI → truncated → invalid-image.
  let scans = 1;
  let eoiOffset = -1;
  const postScanSegments = [];
  let p = pos;
  while (p < b.length) {
    p = b.indexOf(0xff, p);
    if (p < 0 || p + 1 >= b.length) break;
    const n = b[p + 1];
    if (n === 0x00 || n === 0x01 || isRst(n)) { p += 2; continue; }
    if (n === 0xff) { p += 1; continue; }
    if (n === 0xd9) { eoiOffset = p; break; }
    if (n === 0xd8) fail('invalid-image', 'SOI inside scan data');
    if (p + 4 > b.length) fail('invalid-image', 'truncated segment');
    const length = be16(b, p + 2);
    if (length < 2) fail('invalid-image', 'segment length');
    const end = p + 2 + length;
    if (end > b.length) fail('invalid-image', 'truncated segment');
    if (segments.length + postScanSegments.length >= MAX_JPEG_SEGMENTS) fail('invalid-image', 'too many segments');
    postScanSegments.push({ marker: n, start: p, length, payloadStart: p + 4, end });
    if (n === 0xda) scans++;
    p = end;
  }
  if (eoiOffset < 0) fail('invalid-image', 'no EOI (truncated JPEG)');
  // Zero padding after EOI is common and harmless; any other byte counts as trailing content.
  let trailing = false;
  for (let i = eoiOffset + 2; i < b.length; i++) if (b[i] !== 0) { trailing = true; break; }

  let mpf = false, gainMap = false, c2pa = false;
  const exifSegments = [];
  for (const seg of [...segments, ...postScanSegments]) {
    const kind = jpegSegmentKind(b, seg);
    if (kind === 'mpf') mpf = true;
    else if (kind === 'jumbf') c2pa = true;
    else if (kind === 'exif' && seg.start < pos) exifSegments.push(seg);
    else if ((kind === 'xmp' || kind === 'xmp-ext') && indexOfAscii(b, 'hdrgm', seg.payloadStart, seg.end) >= 0) gainMap = true;
  }
  const exif = exifSegments.length ? readExif(b, exifSegments[0].payloadStart + EXIF_SIG.length, exifSegments[0].end) : null;
  return {
    format: 'jpeg', width: sof.width, height: sof.height, bitDepth: sof.precision,
    orientation: exif ? exif.orientation : 1,
    special: { mpf, gainMap, c2pa, trailing, apng: false, highBitDepth: false },
    exif,
    jpeg: { segments, postScanSegments, sosOffset: segments[segments.length - 1].start, eoiOffset, scans, exifCount: exifSegments.length },
    png: null,
  };
}

const isLetter = (c) => (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);

/** Parse the PNG chunk list (signature already sniffed). Lengths bounds-checked; CRCs are not verified. */
export function pngChunks(b) {
  const chunks = [];
  let pos = 8;
  let iend = false;
  while (pos < b.length) {
    const length = be32(b, pos);
    if (length > 0x7fffffff) fail('invalid-image', 'chunk length');
    if (pos + 8 > b.length) fail('invalid-image', 'truncated chunk');
    for (let i = 4; i < 8; i++) if (!isLetter(b[pos + i])) fail('invalid-image', 'chunk type');
    const type = String.fromCharCode(b[pos + 4], b[pos + 5], b[pos + 6], b[pos + 7]);
    const end = pos + 12 + length;
    if (end > b.length) fail('invalid-image', 'truncated chunk');
    if (chunks.length >= MAX_PNG_CHUNKS) fail('invalid-image', 'too many chunks');
    chunks.push({ type, start: pos, length, dataStart: pos + 8, end });
    pos = end;
    if (type === 'IEND') {
      if (length !== 0) fail('invalid-image', 'IEND length');
      iend = true;
      break;
    }
  }
  if (!iend) fail('invalid-image', 'no IEND');
  return chunks;
}

function inspectPng(b) {
  const chunks = pngChunks(b);
  const ihdr = chunks[0];
  if (ihdr.type !== 'IHDR' || ihdr.length !== 13) fail('invalid-image', 'IHDR first');
  const width = be32(b, ihdr.dataStart);
  const height = be32(b, ihdr.dataStart + 4);
  if (!width || !height || width > 0x7fffffff || height > 0x7fffffff) fail('invalid-image', 'IHDR dimensions');
  const bitDepth = b[ihdr.dataStart + 8];
  let apng = false, c2pa = false, idat = false;
  const exifChunks = [];
  for (const c of chunks) {
    if (c.type === 'IDAT') idat = true;
    else if (c.type === 'acTL' && !idat) apng = true;
    else if (c.type === 'caBX') c2pa = true;
    else if (c.type === 'eXIf') exifChunks.push(c);
  }
  if (!idat) fail('invalid-image', 'no IDAT');
  // Zero padding after IEND is harmless; any other byte (e.g. an appended second file) counts as trailing content.
  let trailing = false;
  for (let i = chunks[chunks.length - 1].end; i < b.length; i++) if (b[i] !== 0) { trailing = true; break; }
  let exif = null;
  if (exifChunks.length) {
    const c = exifChunks[0];
    const s = hasAscii(b, c.dataStart, EXIF_SIG) ? c.dataStart + 6 : c.dataStart;
    exif = readExif(b, s, c.dataStart + c.length);
  }
  return {
    format: 'png', width, height, bitDepth,
    orientation: exif ? exif.orientation : 1,
    special: { mpf: false, gainMap: false, c2pa, trailing, apng, highBitDepth: bitDepth > 8 },
    exif,
    jpeg: null,
    png: { chunks, colorType: b[ihdr.dataStart + 9], exifCount: exifChunks.length },
  };
}

function webpSize(b) {
  if (b.length < 30) fail('invalid-image', 'short webp');
  if (hasAscii(b, 12, 'VP8 ')) {
    if (!(b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a)) fail('invalid-image', 'VP8 start code');
    return [(b[26] | (b[27] << 8)) & 0x3fff, (b[28] | (b[29] << 8)) & 0x3fff];
  }
  if (hasAscii(b, 12, 'VP8L')) {
    if (b[20] !== 0x2f) fail('invalid-image', 'VP8L signature');
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
  }
  if (hasAscii(b, 12, 'VP8X')) {
    return [(b[24] | (b[25] << 8) | (b[26] << 16)) + 1, (b[27] | (b[28] << 8) | (b[29] << 16)) + 1];
  }
  fail('invalid-image', 'unknown webp chunk');
}

/**
 * Inspect a whole image file (bounded work, never reads outside `bytes`).
 *
 * JPEG: SOF (0-3, 5-7, 9-11, 13-15) must END within `maxHeaderBytes` (else `header-limit`); the marker walk continues
 * through every scan (stuffing, RST, multi-scan progressive) to the primary EOI to detect trailing content; segments
 * between scans are bounds-checked and listed in `jpeg.postScanSegments`. No EOI (truncated) → `invalid-image`. PNG: IHDR first, chunk walk to IEND (required). GIF / WebP: canvas
 * size. Other recognised formats: `width`/`height` null. Unknown bytes → `invalid-image`.
 *
 * @param {Uint8Array} bytes
 * @param {{ maxHeaderBytes?: number }} [opts]
 */
export function inspectImage(bytes, { maxHeaderBytes = DEFAULT_MAX_HEADER_BYTES } = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) fail('invalid-image', 'empty input');
  const format = sniffFormat(bytes);
  let r;
  if (format === 'jpeg') r = inspectJpeg(bytes, maxHeaderBytes);
  else if (format === 'png') r = inspectPng(bytes);
  else {
    if (!format) fail('invalid-image', 'unrecognised format');
    let wh = [null, null];
    if (format === 'gif') {
      if (bytes.length < 10) fail('invalid-image', 'short gif');
      wh = [bytes[6] | (bytes[7] << 8), bytes[8] | (bytes[9] << 8)];
    } else if (format === 'webp') wh = webpSize(bytes);
    if (wh[0] === 0 || wh[1] === 0) fail('invalid-image', 'zero dimension');
    r = {
      format, width: wh[0], height: wh[1], bitDepth: null, orientation: 1,
      special: { mpf: false, gainMap: false, c2pa: false, trailing: false, apng: false, highBitDepth: false },
      exif: null, jpeg: null, png: null,
    };
  }
  const swap = r.orientation >= 5;
  r.orientedWidth = swap ? r.height : r.width;
  r.orientedHeight = swap ? r.width : r.height;
  return r;
}
