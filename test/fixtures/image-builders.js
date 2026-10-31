// v0.90.0 (plan docs/internal/plans/v0.90.0-image-resize.md step 1) — synthetic image byte builders for the resize
// tests (node + browser; no Node API). Synthetic JPEGs have valid marker STRUCTURE but are not decodable; PNG chunks
// carry correct CRCs but IDAT is not real zlib unless the caller passes one. No real camera files are committed.

export const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
export const utf8 = (s) => new TextEncoder().encode(s);
export function concat(...parts) {
  const flat = parts.flat();
  let n = 0;
  for (const p of flat) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of flat) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
export const be16 = (v) => Uint8Array.of((v >>> 8) & 0xff, v & 0xff);
export const be32 = (v) => Uint8Array.of(v >>> 24, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);

// ---------------------------------------------------------------------------------------------------------------------
// TIFF / EXIF

const SHORT = 3, LONG = 4, ASCII = 2, UNDEFINED = 7, RATIONAL = 5;
const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 };

/**
 * Generic TIFF writer. `ifds` = { ifd0, exif?, gps?, interop?, ifd1? } each an array of entries
 * `{ tag, type, count?, value }`, value = number | number[] | Uint8Array | { ref: ifdName | blobName }.
 * `blobs` = named byte arrays placed in the data area (thumbnail, MakerNote) and referable as `{ ref }`.
 * Layout: header | ifd0 | exif | interop | gps | ifd1 | out-of-line values | blobs. Returns `{ bytes, at }` with the
 * offset of every IFD / blob (TIFF-relative).
 */
export function writeTiff({ le = false, ifds, blobs = {} }) {
  const order = ['ifd0', 'exif', 'interop', 'gps', 'ifd1'].filter((k) => ifds[k]);
  const at = {};
  let off = 8;
  for (const k of order) {
    at[k] = off;
    off += 2 + 12 * ifds[k].length + 4;
  }
  // value bytes for each entry
  const enc = (type, v) => {
    const vals = Array.isArray(v) ? v : [v];
    const size = TYPE_SIZE[type];
    const out = new Uint8Array(size * vals.length);
    vals.forEach((x, i) => w(out, i * size, type === RATIONAL ? LONG : type, x, le, type === RATIONAL ? [x, 1] : null));
    return out;
  };
  const pending = [];
  for (const k of order) {
    for (const e of ifds[k]) {
      if (e.value && e.value.ref) continue;
      const bytes = e.value instanceof Uint8Array ? e.value : enc(e.type, e.value);
      e._bytes = bytes;
      e._count = e.count ?? bytes.length / TYPE_SIZE[e.type];
      if (bytes.length > 4) {
        e._off = off;
        pending.push([off, bytes]);
        off += bytes.length + (bytes.length & 1);
      }
    }
  }
  for (const [name, b] of Object.entries(blobs)) {
    at[name] = off;
    pending.push([off, b]);
    off += b.length + (b.length & 1);
  }
  const t = new Uint8Array(off);
  t.set(le ? [0x49, 0x49] : [0x4d, 0x4d]);
  w(t, 2, SHORT, 42, le);
  w(t, 4, LONG, 8, le);
  for (const k of order) {
    const list = ifds[k];
    let p = at[k];
    w(t, p, SHORT, list.length, le);
    p += 2;
    for (const e of list) {
      w(t, p, SHORT, e.tag, le);
      w(t, p + 2, SHORT, e.type, le);
      if (e.value && e.value.ref) {
        w(t, p + 4, LONG, e.count ?? 1, le);
        w(t, p + 8, LONG, at[e.value.ref] ?? e.value.ref, le);
      } else {
        w(t, p + 4, LONG, e._count, le);
        if (e._off !== undefined) w(t, p + 8, LONG, e._off, le);
        else t.set(e._bytes, p + 8);
      }
      p += 12;
    }
    w(t, p, LONG, k === 'ifd0' && at.ifd1 ? at.ifd1 : 0, le);
  }
  for (const [o, b] of pending) t.set(b, o);
  return { bytes: t, at };
}

function w(t, o, type, v, le, rational) {
  if (rational) {
    w(t, o, LONG, rational[0], le);
    w(t, o + 4, LONG, rational[1], le);
    return;
  }
  const n = type === SHORT ? 2 : type === LONG ? 4 : 1;
  for (let i = 0; i < n; i++) t[o + (le ? i : n - 1 - i)] = (v >>> (8 * i)) & 0xff;
}

/** Fake MakerNote: a vendor header followed by an internal IFD whose offsets are TIFF-relative (breaks if moved). */
export function fakeMakerNote(size = 64) {
  const m = new Uint8Array(size);
  m.set(ascii('FAKEVNDR\0'));
  for (let i = 9; i < size; i++) m[i] = (i * 7 + 3) & 0xff;
  return m;
}

/** Small fake JPEG thumbnail (SOI … EOI). */
export const fakeThumbnail = (n = 40) => concat(Uint8Array.of(0xff, 0xd8), new Uint8Array(n - 4).fill(0x5a), Uint8Array.of(0xff, 0xd9));

/**
 * EXIF TIFF builder for tests.
 * @param {{ le?: boolean, orientation?: number|null, pixel?: { type: 'short'|'long', x: number, y: number }|null,
 *   imageSize?: { type: 'short'|'long', w: number, h: number }|null, gps?: boolean, makerNote?: Uint8Array|boolean,
 *   artist?: string|null, copyright?: string|null, thumbnail?: Uint8Array|boolean, ifd1Strips?: boolean,
 *   strips?: boolean, description?: string|null,
 *   variant?: 'cycle'|'overlap'|'oob'|'thumb-oob'|'orientation-long'|'duplicate'|'too-many'|'gps-overlap'
 *     |'makernote-overlap'|'ascii-overlap'|null }} [o]
 * @returns {{ bytes: Uint8Array, at: Record<string, number> }}
 */
export function buildTiff(o = {}) {
  const {
    le = false, orientation = 1, pixel = { type: 'long', x: 4000, y: 3000 }, imageSize = null, gps = false,
    makerNote = false, artist = null, copyright = null, thumbnail = false, ifd1Strips = false, strips = false,
    description = null, variant = null,
  } = o;
  const t = (k) => (k === 'short' ? SHORT : LONG);
  const ifd0 = [];
  if (imageSize) ifd0.push({ tag: 0x0100, type: t(imageSize.type), value: imageSize.w }, { tag: 0x0101, type: t(imageSize.type), value: imageSize.h });
  if (description) ifd0.push({ tag: 0x010e, type: ASCII, value: ascii(description + '\0') });
  ifd0.push({ tag: 0x010f, type: ASCII, value: ascii('FakeCam\0') });
  if (strips) ifd0.push({ tag: 0x0111, type: LONG, value: 8 });
  if (orientation != null) {
    if (variant === 'orientation-long') ifd0.push({ tag: 0x0112, type: LONG, value: orientation });
    else ifd0.push({ tag: 0x0112, type: SHORT, value: orientation });
  }
  if (variant === 'duplicate') ifd0.push({ tag: 0x0112, type: SHORT, value: 1 });
  ifd0.push({ tag: 0x011a, type: RATIONAL, value: 72 }, { tag: 0x011b, type: RATIONAL, value: 72 });
  if (artist != null) ifd0.push({ tag: 0x013b, type: ASCII, value: ascii(artist + '\0') });
  if (copyright != null) ifd0.push({ tag: 0x8298, type: ASCII, value: ascii(copyright + '\0') });
  ifd0.push({ tag: 0x8769, type: LONG, value: { ref: 'exif' } });
  if (gps) ifd0.push({ tag: 0x8825, type: LONG, value: { ref: 'gps' } });
  if (variant === 'too-many') for (let i = 0; i < 520; i++) ifd0.push({ tag: 0xc000 + i, type: SHORT, value: i });

  const exif = [{ tag: 0x9000, type: UNDEFINED, value: ascii('0232') }];
  if (pixel) exif.push({ tag: 0xa002, type: t(pixel.type), value: pixel.x }, { tag: 0xa003, type: t(pixel.type), value: pixel.y });
  if (makerNote) {
    const mn = makerNote instanceof Uint8Array ? makerNote : fakeMakerNote();
    exif.push({ tag: 0x927c, type: UNDEFINED, count: mn.length, value: { ref: 'makerNote' } });
  }
  exif.sort((a, b) => a.tag - b.tag);
  ifd0.sort((a, b) => a.tag - b.tag);

  const ifds = { ifd0, exif };
  const blobs = {};
  if (makerNote) blobs.makerNote = makerNote instanceof Uint8Array ? makerNote : fakeMakerNote();
  if (gps) {
    ifds.gps = [
      { tag: 0x0000, type: 1, value: Uint8Array.of(2, 3, 0, 0) },
      { tag: 0x0001, type: ASCII, value: ascii('N\0') },
      { tag: 0x0002, type: RATIONAL, value: [10, 45, 30] },
      { tag: 0x0003, type: ASCII, value: ascii('E\0') },
      { tag: 0x0004, type: RATIONAL, value: [106, 40, 15] },
    ];
  }
  if (thumbnail || ifd1Strips) {
    const th = thumbnail instanceof Uint8Array ? thumbnail : fakeThumbnail();
    blobs.thumb = th;
    ifds.ifd1 = [{ tag: 0x0103, type: SHORT, value: 6 }];
    if (ifd1Strips) {
      ifds.ifd1.push({ tag: 0x0111, type: LONG, value: { ref: 'thumb' } }, { tag: 0x0117, type: LONG, value: th.length });
    } else {
      ifds.ifd1.push({ tag: 0x0201, type: LONG, value: { ref: 'thumb' } }, { tag: 0x0202, type: LONG, value: th.length });
    }
    ifds.ifd1.sort((a, b) => a.tag - b.tag);
  }
  const r = writeTiff({ le, ifds, blobs });
  // structural corruption variants: rewrite one pointer after layout
  const ptrSlot = (ifdName, tag) => {
    const base = r.at[ifdName];
    const n = le ? r.bytes[base] | (r.bytes[base + 1] << 8) : (r.bytes[base] << 8) | r.bytes[base + 1];
    for (let i = 0; i < n; i++) {
      const e = base + 2 + 12 * i;
      const tg = le ? r.bytes[e] | (r.bytes[e + 1] << 8) : (r.bytes[e] << 8) | r.bytes[e + 1];
      if (tg === tag) return e + 8;
    }
    throw new Error('tag not found');
  };
  if (variant === 'cycle') w(r.bytes, ptrSlot('ifd0', 0x8769), LONG, r.at.ifd0, le);
  if (variant === 'overlap') w(r.bytes, ptrSlot('ifd0', 0x8769), LONG, r.at.ifd0 + 12, le);
  if (variant === 'oob') w(r.bytes, ptrSlot('ifd0', 0x8769), LONG, r.bytes.length + 100, le);
  if (variant === 'thumb-oob') w(r.bytes, ptrSlot('ifd1', 0x0202), LONG, 0xfffffff0, le);
  if (variant === 'makernote-overlap') w(r.bytes, ptrSlot('exif', 0x927c), LONG, r.at.ifd0, le); // needs makerNote
  if (variant === 'ascii-overlap') w(r.bytes, ptrSlot('ifd0', 0x013b), LONG, r.at.exif, le); // needs artist > 4 bytes
  if (variant === 'gps-overlap') {
    // a GPS value offset pointing into IFD0 (would zero retained structure)
    w(r.bytes, ptrSlot('gps', 0x0002) , LONG, r.at.ifd0, le);
  }
  return r;
}

// ---------------------------------------------------------------------------------------------------------------------
// JPEG segments

export function segment(marker, payload) {
  return concat(Uint8Array.of(0xff, marker), be16(payload.length + 2), payload);
}
export const app1Exif = (tiff) => segment(0xe1, concat(ascii('Exif\0\0'), tiff));
export const XMP_NS = 'http://ns.adobe.com/xap/1.0/\0';
export const XMP_EXT_NS = 'http://ns.adobe.com/xmp/extension/\0';
export function xmpPacket(inner = '<dc:creator>Duyệt</dc:creator>') {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">${inner}</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
}
/** APP1 Standard XMP. `body` string (UTF-8) or raw bytes. */
export const app1Xmp = (body = xmpPacket()) => segment(0xe1, concat(ascii(XMP_NS), typeof body === 'string' ? utf8(body) : body));
/** APP1 Extended XMP chunk. */
export const app1XmpExt = (data = utf8('<rdf:Description/>')) =>
  segment(0xe1, concat(ascii(XMP_EXT_NS), ascii('0123456789ABCDEF0123456789ABCDEF'), be32(data.length), be32(0), data));
/** UTF-16BE (no BOM) encoding of a string. */
export function utf16be(s) {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    out[2 * i] = s.charCodeAt(i) >>> 8;
    out[2 * i + 1] = s.charCodeAt(i) & 0xff;
  }
  return out;
}
export const app2Mpf = () => segment(0xe2, concat(ascii('MPF\0'), ascii('MM'), Uint8Array.of(0, 42, 0, 0, 0, 8), new Uint8Array(16)));
export const app2Icc = (n = 32) => segment(0xe2, concat(ascii('ICC_PROFILE\0'), Uint8Array.of(1, 1), new Uint8Array(n).fill(0x11)));
export const app0Jfif = () => segment(0xe0, concat(ascii('JFIF\0'), Uint8Array.of(1, 1, 1, 0, 72, 0, 72, 0, 0)));
export const app14Adobe = () => segment(0xee, concat(ascii('Adobe'), Uint8Array.of(0, 100, 0, 0, 0, 0, 1)));
export const app11Jumbf = () => segment(0xeb, concat(ascii('JP'), Uint8Array.of(0, 1, 0, 0, 0, 1), be32(24), ascii('jumb'), be32(16), ascii('jumdc2pa'), new Uint8Array(4)));
export const app5Private = () => segment(0xe5, ascii('PRIVATE vendor blob'));
export const com = (text = 'a comment') => segment(0xfe, ascii(text));

/** One IIM dataset. */
export function iimDataset(record, dataset, value) {
  const v = typeof value === 'string' ? utf8(value) : value;
  return concat(Uint8Array.of(0x1c, record, dataset), be16(v.length), v);
}
/** One Photoshop image resource block. */
export function resource8bim(id, data, name = '') {
  const nm = concat(Uint8Array.of(name.length), ascii(name));
  const nmPadded = nm.length & 1 ? concat(nm, new Uint8Array(1)) : nm;
  const body = data.length & 1 ? concat(data, new Uint8Array(1)) : data;
  return concat(ascii('8BIM'), be16(id), nmPadded, be32(data.length), body);
}
export const DEFAULT_IPTC = [
  [1, 90, Uint8Array.of(0x1b, 0x25, 0x47)],
  [2, 5, 'Tiêu đề'], [2, 25, 'keyword'], [2, 80, 'Nguyễn Văn A'], [2, 90, 'Hà Nội'], [2, 92, 'Hoàn Kiếm'],
  [2, 95, 'HN'], [2, 100, 'VNM'], [2, 101, 'Việt Nam'], [2, 26, 'loc-code'], [2, 27, 'loc-name'], [2, 116, '© 2026 A'],
];
/**
 * APP13 Photoshop segment. `datasets` = [record, dataset, value][]; `extra` = other resources before the IPTC one
 * (e.g. 0x0409 / 0x040C thumbnail, 0x040F ICC); `rawIim` overrides the IIM bytes (malformed variants).
 */
export function app13Iptc({ datasets = DEFAULT_IPTC, extra = [], rawIim = null } = {}) {
  const iim = rawIim || concat(datasets.map(([r, d, v]) => iimDataset(r, d, v)));
  return segment(0xed, concat(ascii('Photoshop 3.0\0'), ...extra.map(([id, data]) => resource8bim(id, data)), resource8bim(0x0404, iim)));
}

const DQT = segment(0xdb, concat(Uint8Array.of(0), new Uint8Array(64).fill(1)));
const sof = (marker, w, h) => segment(marker, concat(Uint8Array.of(8), be16(h), be16(w), Uint8Array.of(3, 1, 0x22, 0, 2, 0x11, 0, 3, 0x11, 0)));
const DHT = segment(0xc4, concat(Uint8Array.of(0), Uint8Array.of(0, 1), new Uint8Array(14), Uint8Array.of(0)));
const DRI = segment(0xdd, be16(4));
const SOS = segment(0xda, Uint8Array.of(3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0));
/** Entropy bytes with FF00 stuffing and a restart marker. */
export const ENTROPY = Uint8Array.of(0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0x78, 0xff, 0xff, 0x00, 0x9a);

/**
 * Minimal structurally valid JPEG: SOI, `segments`, DQT, SOF0/SOF2, DHT, DRI, SOS, entropy (FF00, RST, fill), EOI.
 * `progressive`: SOF2 and `scans` SOS blocks with a DHT between them. `interScan`: extra segments placed after the
 * first scan's entropy data (before the next DHT / SOS). `trailing`: bytes after EOI.
 */
export function buildJpeg({ segments = [], width = 4000, height = 3000, progressive = false, scans = 3, interScan = [], trailing = null } = {}) {
  const parts = [Uint8Array.of(0xff, 0xd8), ...segments, DQT, sof(progressive ? 0xc2 : 0xc0, width, height), DHT, DRI];
  const n = progressive ? scans : 1;
  for (let i = 0; i < n; i++) {
    if (i > 0) parts.push(DHT);
    parts.push(SOS, ENTROPY);
    if (i === 0) parts.push(...interScan);
  }
  parts.push(Uint8Array.of(0xff, 0xd9));
  if (trailing) parts.push(trailing);
  return concat(parts);
}

// ---------------------------------------------------------------------------------------------------------------------
// PNG

const CRC = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();
export function crc32ref(bytes) {
  let c = 0xffffffff;
  for (const x of bytes) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function chunk(type, data = new Uint8Array(0)) {
  const td = concat(ascii(type), data);
  return concat(be32(data.length), td, be32(crc32ref(td)));
}
export const PNG_SIG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
export const ihdr = (w = 400, h = 300, bitDepth = 8, colorType = 6) =>
  chunk('IHDR', concat(be32(w), be32(h), Uint8Array.of(bitDepth, colorType, 0, 0, 0)));
export const tEXt = (k, v) => chunk('tEXt', concat(ascii(k), Uint8Array.of(0), ascii(v)));
export const zTXt = (k, compressed = Uint8Array.of(0x78, 0x9c, 3, 0, 0, 0, 0, 1)) => chunk('zTXt', concat(ascii(k), Uint8Array.of(0, 0), compressed));
export const iTXt = (k, text, { compressed = false } = {}) =>
  chunk('iTXt', concat(ascii(k), Uint8Array.of(0, compressed ? 1 : 0, 0), ascii('vi'), Uint8Array.of(0), Uint8Array.of(0), utf8(text)));
export const eXIf = (tiff) => chunk('eXIf', tiff);
export const acTL = () => chunk('acTL', concat(be32(2), be32(0)));
export const tIME = () => chunk('tIME', Uint8Array.of(0x07, 0xea, 10, 31, 12, 0, 0));
export const IDAT_DATA = Uint8Array.of(0x78, 0x9c, 0x63, 0x60, 0, 0, 0, 2, 0, 1);

/** PNG: signature, IHDR, `before` (chunks before IDAT), IDAT, `after`, IEND. */
export function buildPng({ width = 400, height = 300, bitDepth = 8, colorType = 6, before = [], after = [], idat = IDAT_DATA } = {}) {
  return concat(PNG_SIG, ihdr(width, height, bitDepth, colorType), ...before, chunk('IDAT', idat), ...after, chunk('IEND'));
}

// ---------------------------------------------------------------------------------------------------------------------
// Fuzz helpers

/** Seeded PRNG (mulberry32) — no dependency. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


/** Valid JPEG / PNG fixtures the fuzz tests mutate. */
export function fuzzFixtures() {
  const tiff = (o) => buildTiff(o).bytes;
  return [
    buildJpeg({ segments: [app0Jfif(), app1Exif(tiff({ le: true, orientation: 6, gps: true, makerNote: true, thumbnail: true, artist: 'A', copyright: 'C' })), app1Xmp(), app13Iptc(), com()] }),
    buildJpeg({ progressive: true, segments: [app1Exif(tiff({ le: false, pixel: { type: 'short', x: 10, y: 10 }, ifd1Strips: true })), app2Mpf()] }),
    buildJpeg({ segments: [app13Iptc({ extra: [[0x0409, new Uint8Array(30)]] }), app11Jumbf()], trailing: ascii('tail') }),
    buildPng({ before: [eXIf(tiff({ le: true, orientation: 8, gps: true })), tEXt('Author', 'x'), chunk('iTXt', ascii('XML:com.adobe.xmp\0\0\0\0\0<x/>'))] }),
    buildPng({ bitDepth: 16, before: [acTL(), chunk('prVt', ascii('private'))] }),
  ];
}

/** One seeded mutation: truncate, random bytes, 0x00/0xFF extremes, or an injected FF xx pair. */
export function mutate(src, rand) {
  const b = src.slice();
  const kind = Math.floor(rand() * 4);
  if (kind === 0) return b.subarray(0, Math.floor(rand() * b.length)); // truncate
  const n = 1 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const at = Math.floor(rand() * b.length);
    if (kind === 1) b[at] = Math.floor(rand() * 256); // random byte
    else if (kind === 2) b[at] = rand() < 0.5 ? 0xff : 0x00; // extremes (lengths / counts / markers)
    else if (at + 1 < b.length) { b[at] = 0xff; b[at + 1] = Math.floor(rand() * 256); } // inject marker-ish pair
  }
  return b;
}

