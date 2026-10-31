/**
 * v0.90.0 (plan docs/internal/plans/v0.90.0-image-resize.md § 5, step 1; research image-resize-metadata-codex-r1/r2) —
 * byte-level metadata of the client image resize: patch EXIF in place, zero GPS, write a minimal EXIF, rebuild APP13
 * IPTC, check Standard XMP eligibility, assemble a re-encoded JPEG / PNG and rewrite an already-compliant JPEG / PNG
 * without touching its pixels.
 *
 * No XML parsing, no DOMParser (no Trusted Types sink): XMP is inert bytes, copied verbatim or dropped. Every EXIF edit
 * is in place (same TIFF layout, MakerNote offsets intact) so an APP1 never grows. Malformed OPTIONAL metadata drops
 * that family and reports `partial`; it never fails the image. Structural problems of the container itself throw
 * `ImageResizeError`. `metadata-too-large` (budget vs `maxBytes`) is the engine's call, not this module's.
 *
 * Per-family outcome: `exact` (bytes untouched) | `patched` (EXIF edited in place) | `verbatim` (XMP copied) |
 * `rebuilt` (new EXIF / APP13 written) | `dropped` (present, removed on purpose) | `absent` | `partial` (present but
 * malformed / ambiguous → removed, or kept with a tag left unpatched).
 *
 * @module utils/image-metadata
 */
import {
  ImageResizeError, readExif, inspectImage, sniffFormat, jpegSegmentKind, hasAscii, indexOfAscii, be32,
  EXIF_SIG, XMP_STD_SIG, XMP_EXT_SIG, PHOTOSHOP_SIG, TIFF_SHORT, TIFF_ASCII, DEFAULT_MAX_HEADER_BYTES,
} from './image-bytes.js';

export const METADATA_MODES = Object.freeze(['keep', 'keep-no-gps', 'copyright', 'none']);
/** Largest APPn payload (65535 length field − 2 bytes of the length itself). */
export const MAX_APP_PAYLOAD = 65533;

const fail = (code, message) => {
  throw new ImageResizeError(code, message);
};
const checkMode = (mode) => {
  if (!METADATA_MODES.includes(mode)) throw new TypeError(`image-metadata: unknown mode ${String(mode)}`);
};
const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
function concat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// CRC32 (PNG)

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (ISO-HDLC, as PNG) of `bytes[start, end)`. @returns {number} unsigned 32-bit */
export function crc32(bytes, start = 0, end = bytes.length) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------------------------------------------------
// EXIF (TIFF) edits — all in place on a COPY, offsets relative to the TIFF start (see readExif)

function writeTiff(t, at, type, value, le) {
  if (type === TIFF_SHORT) {
    t[at] = le ? value & 0xff : (value >>> 8) & 0xff;
    t[at + 1] = le ? (value >>> 8) & 0xff : value & 0xff;
  } else {
    for (let i = 0; i < 4; i++) t[at + (le ? i : 3 - i)] = (value >>> (8 * i)) & 0xff;
  }
}
const zero = (t, [s, e]) => t.fill(0, s, e);

/**
 * Edit a TIFF copy in place. `reencode`: Orientation → 1, PixelX/Y + ImageWidth/Length → new size, IFD1 disconnected
 * and zeroed. `keep-no-gps`: GPS IFD emptied (count 0, entries + out-of-line values zeroed; the 0x8825 pointer keeps
 * pointing at the empty IFD). Returns the family outcome, or `null` when the family must be dropped.
 */
function editTiff(tiff, info, { mode, reencode, width, height }) {
  if (!info.valid || info.hasStrips) return null;
  let partial = false;
  let changed = false;
  const s = info.slots;
  if (reencode) {
    if (s.orientation) {
      writeTiff(tiff, s.orientation.at, TIFF_SHORT, 1, info.le);
      changed = true;
    }
    for (const [sl, v] of [[s.pixelX, width], [s.pixelY, height], [s.imageWidth, width], [s.imageLength, height]]) {
      if (!sl) continue;
      if (sl.type === TIFF_SHORT && v > 0xffff) partial = true;
      else {
        writeTiff(tiff, sl.at, sl.type, v, info.le);
        changed = true;
      }
    }
    if (info.ifd1Ranges) {
      writeTiff(tiff, info.ifd0NextAt, 4, 0, info.le);
      for (const r of info.ifd1Ranges) zero(tiff, r);
      changed = true;
    }
  }
  if (mode === 'keep-no-gps' && info.gps && info.gps.entryCount > 0) {
    for (const r of info.gps.ranges) zero(tiff, r);
    // count is already 0 (zeroed) and the next-IFD pointer right after it is 0 too: an empty IFD.
    changed = true;
  }
  return partial ? 'partial' : changed ? 'patched' : 'exact';
}

/**
 * A fresh minimal TIFF (IFD0 only): Orientation (when given and ≠ 1), Artist, Copyright (raw ASCII bytes, NUL added if
 * missing). `null` when there is nothing to write.
 */
function minimalTiff(le, { orientation = 1, artist = null, copyright = null } = {}) {
  const entries = [];
  if (orientation !== 1) entries.push({ tag: 0x0112, type: TIFF_SHORT, count: 1, value: orientation });
  for (const [tag, raw] of [[0x013b, artist], [0x8298, copyright]]) {
    if (!raw || !raw.length) continue;
    const bytes = raw[raw.length - 1] === 0 ? raw : concat([raw, new Uint8Array(1)]);
    entries.push({ tag, type: TIFF_ASCII, count: bytes.length, bytes });
  }
  if (!entries.length) return null;
  const ifdSize = 2 + 12 * entries.length + 4;
  let dataOff = 8 + ifdSize;
  const data = [];
  for (const e of entries) {
    if (e.bytes && e.bytes.length > 4) {
      e.offset = dataOff;
      data.push(e.bytes);
      dataOff += e.bytes.length + (e.bytes.length & 1);
      if (e.bytes.length & 1) data.push(new Uint8Array(1));
    }
  }
  const t = new Uint8Array(dataOff);
  t.set(le ? [0x49, 0x49] : [0x4d, 0x4d], 0);
  writeTiff(t, 2, TIFF_SHORT, 42, le);
  writeTiff(t, 4, 4, 8, le);
  writeTiff(t, 8, TIFF_SHORT, entries.length, le);
  entries.forEach((e, i) => {
    const p = 10 + 12 * i;
    writeTiff(t, p, TIFF_SHORT, e.tag, le);
    writeTiff(t, p + 2, TIFF_SHORT, e.type, le);
    writeTiff(t, p + 4, 4, e.count, le);
    if (e.value !== undefined) writeTiff(t, p + 8, TIFF_SHORT, e.value, le);
    else if (e.offset !== undefined) writeTiff(t, p + 8, 4, e.offset, le);
    else t.set(e.bytes, p + 8);
  });
  let o = 8 + ifdSize;
  for (const d of data) {
    t.set(d, o);
    o += d.length;
  }
  return t;
}

const sliceRange = (tiff, r) => (r ? tiff.slice(r.at, r.at + r.length) : null);

/**
 * Decide the EXIF family for one TIFF body. `tiff` is a mutable copy (edited in place when kept).
 * @returns {{ bytes: Uint8Array|null, outcome: string, gps: boolean, makerNote: boolean }}
 *   `bytes`: TIFF to emit (the edited copy, or a fresh minimal TIFF) or null.
 */
function exifFamily(tiff, count, { mode, reencode, width, height }) {
  if (!count) return { bytes: null, outcome: 'absent', gps: false, makerNote: false };
  const info = readExif(tiff, 0, tiff.length);
  // Orientation must survive a lossless rewrite (pixels untouched) even when the family itself goes.
  const keepOrientation = reencode ? 1 : info.orientation;
  const orientationOnly = (outcome) => {
    const t = minimalTiff(info.le, { orientation: keepOrientation });
    return { bytes: t, outcome: t && outcome === 'dropped' ? 'rebuilt' : outcome, gps: false, makerNote: false };
  };
  if (mode === 'none') return orientationOnly('dropped');
  if (count > 1 || !info.valid || info.hasStrips) return orientationOnly('partial');
  if (mode === 'copyright') {
    const t = minimalTiff(info.le, {
      orientation: keepOrientation, artist: sliceRange(tiff, info.artist), copyright: sliceRange(tiff, info.copyright),
    });
    if (t && t.length + EXIF_SIG.length > MAX_APP_PAYLOAD) return orientationOnly('partial');
    return { bytes: t, outcome: t ? 'rebuilt' : 'dropped', gps: false, makerNote: false };
  }
  const outcome = editTiff(tiff, info, { mode, reencode, width, height });
  if (outcome === null) return orientationOnly('partial');
  const gps = mode === 'keep' && !!info.gps && info.gps.entryCount > 0;
  return { bytes: tiff, outcome, gps, makerNote: info.hasMakerNote };
}

// ---------------------------------------------------------------------------------------------------------------------
// XMP eligibility (keep only)

/** Local names / markers whose presence makes a verbatim XMP copy stale or ambiguous (plan § 5, research r2). */
export const XMP_DENYLIST = Object.freeze([
  'Orientation', 'PixelXDimension', 'PixelYDimension', 'ImageWidth', 'ImageLength', 'XResolution', 'YResolution',
  'ResolutionUnit', 'ColorSpace', 'ICCProfile', 'PhotometricInterpretation', 'BitsPerSample', 'SamplesPerPixel',
  'YCbCrSubSampling', 'CompressedBitsPerPixel', 'NativeDigest', 'LegacyIPTCDigest', 'DocumentID', 'InstanceID',
  'OriginalDocumentID', 'DerivedFrom', 'History', 'MetadataDate', 'ModifyDate', 'camera-raw-settings', 'crs:',
  'HasExtendedXMP',
]);

/**
 * True when an XMP packet (bytes after the namespace header) may be copied verbatim: fatal UTF-8 decode, no U+0000
 * (catches BOM-less UTF-16/32, which decodes as "valid" UTF-8), no denylisted name.
 * @param {Uint8Array} packet
 */
export function xmpEligible(packet) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(packet);
  } catch {
    return false;
  }
  if (text.includes('\u0000')) return false;
  return !XMP_DENYLIST.some((s) => text.includes(s));
}

// ---------------------------------------------------------------------------------------------------------------------
// IPTC (APP13 Photoshop 3.0 → 8BIM 0x0404 IIM)

const NO_GPS_DROP = new Set([26, 27, 90, 92, 95, 100, 101]); // record 2
const COPYRIGHT_KEEP = new Set([80, 116]); // record 2

/**
 * Parse an APP13 payload into IIM datasets of its single 8BIM 0x0404 resource.
 * @returns {{ ok: boolean, datasets: Array<{ record: number, dataset: number, start: number, end: number }> }}
 *   `ok: false` = malformed; `datasets` empty + ok = no IPTC resource.
 */
export function parseIptc(b, payloadStart, end) {
  const no = { ok: false, datasets: [] };
  if (!hasAscii(b, payloadStart, PHOTOSHOP_SIG)) return no;
  let p = payloadStart + PHOTOSHOP_SIG.length;
  let iim = null;
  for (let guard = 0; p < end; guard++) {
    if (guard > 4096) return no;
    if (end - p < 12) {
      for (; p < end; p++) if (b[p] !== 0) return no; // trailing zero padding only
      break;
    }
    if (!hasAscii(b, p, '8BIM')) return no;
    const id = (b[p + 4] << 8) | b[p + 5];
    const nameLen = b[p + 6];
    const namePadded = (1 + nameLen + 1) & ~1;
    let q = p + 6 + namePadded;
    if (q + 4 > end) return no;
    const size = be32(b, q);
    q += 4;
    if (size > end - q) return no;
    if (id === 0x0404) {
      if (iim) return no; // two IPTC resources: ambiguous
      iim = [q, q + size];
    }
    const next = q + size + (size & 1); // odd-sized data carries one pad byte
    if (next > end) return no;
    p = next;
  }
  if (!iim) return { ok: true, datasets: [] };
  const datasets = [];
  for (let d = iim[0]; d < iim[1];) {
    if (b[d] === 0x1c) {
      if (d + 5 > iim[1]) return no;
      const len = (b[d + 3] << 8) | b[d + 4];
      if (len & 0x8000) return no; // extended length not supported
      if (d + 5 + len > iim[1]) return no;
      datasets.push({ record: b[d + 1], dataset: b[d + 2], start: d, end: d + 5 + len });
      d += 5 + len;
    } else {
      for (; d < iim[1]; d++) if (b[d] !== 0) return no;
    }
  }
  return { ok: true, datasets };
}

/** APP13 segment holding only an 8BIM 0x0404 resource with the given dataset bytes, or null when too big / empty. */
function buildApp13(b, datasets) {
  if (!datasets.length) return null;
  const iim = concat(datasets.map((d) => b.subarray(d.start, d.end)));
  const pad = iim.length & 1;
  const head = concat([ascii(PHOTOSHOP_SIG), ascii('8BIM'), Uint8Array.of(0x04, 0x04, 0, 0)]);
  const size = Uint8Array.of(iim.length >>> 24, (iim.length >>> 16) & 0xff, (iim.length >>> 8) & 0xff, iim.length & 0xff);
  const payload = concat([head, size, iim, new Uint8Array(pad)]);
  return payload.length <= MAX_APP_PAYLOAD ? jpegSegment(0xed, payload) : null;
}

/**
 * IPTC family for a JPEG. `segs` = APP13 Photoshop segments of the source.
 * Copyright mode also keeps 1:90 (coded character set): it carries no content, and without it UTF-8 names decode as
 * Latin-1.
 */
function iptcFamily(b, segs, mode) {
  if (!segs.length) return { segment: null, outcome: 'absent' };
  const parsed = segs.length === 1 ? parseIptc(b, segs[0].payloadStart, segs[0].end) : { ok: false, datasets: [] };
  if (!parsed.ok) return { segment: null, outcome: 'partial' };
  if (!parsed.datasets.length) return { segment: null, outcome: mode === 'keep' ? 'absent' : 'dropped' };
  if (mode === 'none') return { segment: null, outcome: 'dropped' };
  const keep = parsed.datasets.filter((d) => {
    if (mode === 'keep-no-gps') return !(d.record === 2 && NO_GPS_DROP.has(d.dataset));
    if (mode === 'copyright') return (d.record === 2 && COPYRIGHT_KEEP.has(d.dataset)) || (d.record === 1 && d.dataset === 90);
    return true;
  });
  const hasContent = keep.some((d) => !(d.record === 1 && d.dataset === 90));
  const segment = hasContent ? buildApp13(b, keep) : null;
  return { segment, outcome: segment ? 'rebuilt' : hasContent ? 'partial' : 'dropped' };
}

// ---------------------------------------------------------------------------------------------------------------------
// JPEG

/** One JPEG marker segment `FF m len payload`. Throws when the payload does not fit a segment. */
export function jpegSegment(marker, payload) {
  if (payload.length > MAX_APP_PAYLOAD) fail('metadata-too-large', 'segment payload > 65533');
  const out = new Uint8Array(4 + payload.length);
  out[0] = 0xff;
  out[1] = marker;
  out[2] = (payload.length + 2) >>> 8;
  out[3] = (payload.length + 2) & 0xff;
  out.set(payload, 4);
  return out;
}
const exifSegment = (tiff) => jpegSegment(0xe1, concat([ascii(EXIF_SIG), tiff]));

function requireJpeg(inspection) {
  if (!inspection || inspection.format !== 'jpeg' || !inspection.jpeg) fail('invalid-image', 'not a JPEG inspection');
}
const isSpecial = (sp) => sp.mpf || sp.gainMap || sp.c2pa || sp.trailing || sp.apng;

/**
 * Group the metadata segments of a JPEG by kind — header AND between-scan segments, so the one-EXIF / one-XMP /
 * no-Extended-XMP / one-APP13 rules and the outcomes see everything the file carries.
 */
const allSegments = (inspection) => [...inspection.jpeg.segments, ...inspection.jpeg.postScanSegments];
function classify(b, segments) {
  const out = { exif: [], xmp: [], xmpExt: [], photoshop: [] };
  for (const seg of segments) {
    const k = jpegSegmentKind(b, seg);
    if (k === 'exif') out.exif.push(seg);
    else if (k === 'xmp') out.xmp.push(seg);
    else if (k === 'xmp-ext') out.xmpExt.push(seg);
    else if (k === 'photoshop') out.photoshop.push(seg);
  }
  return out;
}

function xmpFamily(b, groups, mode) {
  const present = groups.xmp.length + groups.xmpExt.length > 0;
  if (!present) return { segment: null, outcome: 'absent', gps: false };
  if (mode !== 'keep') return { segment: null, outcome: 'dropped', gps: false };
  if (groups.xmp.length !== 1 || groups.xmpExt.length) return { segment: null, outcome: 'dropped', gps: false };
  const seg = groups.xmp[0];
  const packet = b.subarray(seg.payloadStart + XMP_STD_SIG.length, seg.end);
  if (!xmpEligible(packet)) return { segment: null, outcome: 'dropped', gps: false };
  return { segment: b.slice(seg.start, seg.end), outcome: 'verbatim', gps: indexOfAscii(packet, 'GPS') >= 0 };
}

function gpsPresentOf(mode, exif, xmpGps) {
  if (mode === 'none' || mode === 'copyright') return false;
  if (exif.gps || xmpGps) return true;
  return exif.makerNote ? 'unknown' : false;
}

/**
 * Metadata segments for a RE-ENCODED JPEG (plan § 5): `[APP1 EXIF patched, APP1 XMP verbatim, APP13 rebuilt]` (each
 * optional), in that order, to go right after SOI via `assembleJpeg`. `width`/`height` = output size (display
 * orientation; the encoder output is already upright, so Orientation becomes 1).
 *
 * @param {Uint8Array} bytes original file
 * @param {ReturnType<typeof inspectImage>} inspection `inspectImage(bytes)`
 * @param {{ mode: 'keep'|'keep-no-gps'|'copyright'|'none', width: number, height: number }} opts
 * @returns {{ segments: Uint8Array[], metadata: MetadataOutcome }}
 *
 * @typedef {'exact'|'patched'|'verbatim'|'rebuilt'|'dropped'|'absent'|'partial'} FamilyOutcome
 * @typedef {{ mode: string, exif: FamilyOutcome, xmp: FamilyOutcome, iptc: FamilyOutcome,
 *   gpsPresent: boolean|'unknown', contentCredentials: boolean }} MetadataOutcome
 */
export function buildJpegMetadata(bytes, inspection, { mode, width, height }) {
  checkMode(mode);
  requireJpeg(inspection);
  if (isSpecial(inspection.special)) fail('special-content-transform-required', 'special JPEG');
  const groups = classify(bytes, allSegments(inspection));
  const first = groups.exif[0];
  const tiff = first ? bytes.slice(first.payloadStart + EXIF_SIG.length, first.end) : new Uint8Array(0);
  const exif = exifFamily(tiff, groups.exif.length, { mode, reencode: true, width, height });
  const xmp = xmpFamily(bytes, groups, mode);
  const iptc = iptcFamily(bytes, groups.photoshop, mode);
  const segments = [];
  if (exif.bytes) segments.push(exifSegment(exif.bytes));
  if (xmp.segment) segments.push(xmp.segment);
  if (iptc.segment) segments.push(iptc.segment);
  return {
    segments,
    metadata: {
      mode, exif: exif.outcome, xmp: xmp.outcome, iptc: iptc.outcome,
      gpsPresent: gpsPresentOf(mode, exif, xmp.gps), contentCredentials: false,
    },
  };
}

/**
 * SOI + `segments` + the encoder output minus its own SOI (its JFIF / ICC / APP14 / tables / scans stay as they are).
 * @param {Uint8Array} encoderBytes JPEG from `canvas.toBlob`
 * @param {Uint8Array[]} segments from `buildJpegMetadata`
 */
export function assembleJpeg(encoderBytes, segments) {
  if (!(encoderBytes instanceof Uint8Array) || encoderBytes.length < 4 || encoderBytes[0] !== 0xff || encoderBytes[1] !== 0xd8) {
    fail('output-type-mismatch', 'encoder output is not a JPEG');
  }
  return concat([Uint8Array.of(0xff, 0xd8), ...segments, encoderBytes.subarray(2)]);
}

const STRUCTURAL_APP = new Set(['jfif', 'jfxx', 'icc', 'adobe']);
/** Non-APP markers kept before SOS: SOF0-3/5-7/9-11/13-15, DHT, DAC, DQT, DRI, DNL. Anything else (reserved 0xF0…) goes. */
const isStructuralMarker = (m) => (m >= 0xc0 && m <= 0xcf && m !== 0xc8) || m === 0xdb || m === 0xdd || m === 0xdc;
/** Markers allowed between scans in a lossless rewrite (copied verbatim with the scan data): DHT, DAC, DQT, DRI, DNL, SOS. */
const SCAN_MARKERS = new Set([0xc4, 0xcc, 0xdb, 0xdd, 0xdc, 0xda]);

/**
 * Lossless rewrite of an already-compliant ordinary JPEG for a selective mode: header segments are filtered in their
 * original order (every non-APPn/COM marker kept; APP0 JFIF/JFXX, APP2 ICC_PROFILE, APP14 Adobe kept; EXIF / APP13
 * replaced in place per mode; XMP, COM and other APPn dropped), then the bytes from SOS to the end are copied
 * unchanged. EXIF keeps the original Orientation (pixels unchanged); a dropped EXIF family with Orientation ≠ 1
 * becomes a minimal EXIF holding only Orientation. `keep` returns an unchanged copy.
 *
 * @param {Uint8Array} bytes
 * @param {ReturnType<typeof inspectImage>} inspection
 * @param {'keep'|'keep-no-gps'|'copyright'|'none'} mode
 * @returns {{ bytes: Uint8Array, metadata: MetadataOutcome }}
 */
export function rewriteJpegLossless(bytes, inspection, mode) {
  checkMode(mode);
  requireJpeg(inspection);
  if (isSpecial(inspection.special)) fail('metadata-policy-unsupported', 'special JPEG');
  const { segments, sosOffset } = inspection.jpeg;
  const groups = classify(bytes, allSegments(inspection));
  if (mode === 'keep') return { bytes: bytes.slice(), metadata: exactOutcome(mode, groups, inspection, bytes) };
  // SOS..end is copied byte-for-byte, so anything but tables / scans between scans would leak through.
  if (inspection.jpeg.postScanSegments.some((s) => !SCAN_MARKERS.has(s.marker))) {
    fail('metadata-policy-unsupported', 'metadata between scans');
  }
  const first = groups.exif[0];
  const tiff = first ? bytes.slice(first.payloadStart + EXIF_SIG.length, first.end) : new Uint8Array(0);
  const exif = exifFamily(tiff, groups.exif.length, { mode, reencode: false });
  const iptc = iptcFamily(bytes, groups.photoshop, mode);
  const out = [Uint8Array.of(0xff, 0xd8)];
  for (const seg of segments) {
    if (seg.start >= sosOffset) break;
    const kind = jpegSegmentKind(bytes, seg);
    if (kind === null) {
      if (isStructuralMarker(seg.marker)) out.push(bytes.subarray(seg.start, seg.end));
    } else if (STRUCTURAL_APP.has(kind)) out.push(bytes.subarray(seg.start, seg.end));
    else if (seg === first && exif.bytes) out.push(exifSegment(exif.bytes));
    else if (seg === groups.photoshop[0] && iptc.segment) out.push(iptc.segment);
  }
  out.push(bytes.subarray(sosOffset));
  const xmpPresent = groups.xmp.length + groups.xmpExt.length > 0;
  return {
    bytes: concat(out),
    metadata: {
      mode, exif: exif.outcome, xmp: xmpPresent ? 'dropped' : 'absent', iptc: iptc.outcome,
      gpsPresent: gpsPresentOf(mode, exif, false), contentCredentials: false,
    },
  };
}

/**
 * GPS presence of metadata kept byte-for-byte: true = standard EXIF GPS entries (or "GPS" in kept XMP); 'unknown' =
 * malformed EXIF or an opaque MakerNote; false otherwise.
 */
function exactGps(exif, exifCount, xmpGps) {
  if (exifCount && exif && exif.valid && exif.gps && exif.gps.entryCount > 0) return true;
  if (xmpGps) return true;
  if (exifCount && (!exif || !exif.valid || exifCount > 1 || exif.hasMakerNote)) return 'unknown';
  return false;
}
const xmpHasGps = (b, segs, sigLen) => segs.some((s) => indexOfAscii(b, 'GPS', s.payloadStart + sigLen, s.end) >= 0);

function exactOutcome(mode, groups, inspection, bytes) {
  return {
    mode,
    exif: groups.exif.length ? 'exact' : 'absent',
    xmp: groups.xmp.length + groups.xmpExt.length ? 'exact' : 'absent',
    iptc: groups.photoshop.length ? 'exact' : 'absent',
    gpsPresent: exactGps(inspection.exif, groups.exif.length,
      xmpHasGps(bytes, groups.xmp, XMP_STD_SIG.length) || xmpHasGps(bytes, groups.xmpExt, XMP_EXT_SIG.length)),
    contentCredentials: !!inspection.special.c2pa,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// PNG

/** Chunks every mode keeps (rendering / structure). */
export const PNG_ALLOWED = new Set([
  'IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'cICP', 'mDCV', 'cLLI', 'pHYs', 'bKGD',
]);
const PNG_CRITICAL = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND']);
const TEXT_TYPES = new Set(['tEXt', 'zTXt', 'iTXt']);
const XMP_KEYWORD = 'XML:com.adobe.xmp';
const TEXT_KEEP = {
  keep: null, // all
  'keep-no-gps': new Set(['Title', 'Author', 'Description', 'Copyright']),
  copyright: new Set(['Author', 'Copyright']),
  none: new Set(),
};

/** Keyword of a text chunk (1-79 Latin-1 bytes before NUL), or null when malformed. */
function textKeyword(b, c) {
  const nul = b.subarray(c.dataStart, Math.min(c.dataStart + c.length, c.dataStart + 80)).indexOf(0);
  if (nul < 1) return null;
  return String.fromCharCode(...b.subarray(c.dataStart, c.dataStart + nul));
}

/** Uncompressed XMP packet of an `iTXt` chunk with the XMP keyword, or null (compressed / malformed). */
function itxtXmpPacket(b, c) {
  const end = c.dataStart + c.length;
  let p = c.dataStart + XMP_KEYWORD.length + 1;
  if (p + 2 > end || b[p] !== 0 || b[p + 1] !== 0) return null; // compression flag and method must both be 0
  p += 2;
  for (let k = 0; k < 2; k++) {
    const nul = b.subarray(p, end).indexOf(0);
    if (nul < 0) return null;
    p += nul + 1;
  }
  return b.subarray(p, end);
}

/**
 * GPS in the XMP text chunks of a PNG kept byte-for-byte: true when a readable packet mentions GPS; 'unknown' when a
 * packet cannot be searched (zTXt / compressed or malformed iTXt); false otherwise. Shared by lossless keep and summary.
 */
function pngXmpGps(b, chunks) {
  let unknown = false;
  for (const c of chunks) {
    if (!TEXT_TYPES.has(c.type) || textKeyword(b, c) !== XMP_KEYWORD) continue;
    const packet = c.type === 'tEXt' ? b.subarray(c.dataStart + XMP_KEYWORD.length + 1, c.dataStart + c.length)
      : c.type === 'iTXt' ? itxtXmpPacket(b, c) : null;
    if (packet === null) unknown = true;
    else if (indexOfAscii(packet, 'GPS') >= 0) return true;
  }
  return unknown ? 'unknown' : false;
}

/** EXIF GPS rule (`exactGps`) folded with the XMP result: XMP proof → true; unsearchable XMP turns false into unknown. */
function withXmpGps(exifGps, xmpGps) {
  if (xmpGps === true) return true;
  return exifGps === false && xmpGps === 'unknown' ? 'unknown' : exifGps;
}

function requirePng(inspection) {
  if (!inspection || inspection.format !== 'png' || !inspection.png) fail('invalid-image', 'not a PNG inspection');
  for (const c of inspection.png.chunks) {
    const critical = c.type.charCodeAt(0) < 0x61;
    if (critical && !PNG_CRITICAL.has(c.type)) fail('invalid-image', `unknown critical chunk ${c.type}`);
  }
}

/** Serialize one PNG chunk with a fresh CRC. */
export function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const n = data.length;
  out.set([n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff], 0);
  out.set(ascii(type), 4);
  out.set(data, 8);
  const c = crc32(out, 4, 8 + n);
  out.set([c >>> 24, (c >>> 16) & 0xff, (c >>> 8) & 0xff, c & 0xff], 8 + n);
  return out;
}

/**
 * Walk the PNG metadata chunks once for a mode. Returns the per-chunk decisions in original order plus outcomes.
 * Each item: `{ chunk, out: Uint8Array|null }` where `out` is the serialized chunk to emit (null = drop).
 */
function pngPlan(b, inspection, { mode, reencode, width, height }) {
  const chunks = inspection.png.chunks;
  const exifChunks = chunks.filter((c) => c.type === 'eXIf');
  let exif = { bytes: null, outcome: 'absent', gps: false, makerNote: false };
  if (exifChunks.length) {
    const c = exifChunks[0];
    const prefix = hasAscii(b, c.dataStart, EXIF_SIG) ? 6 : 0; // tolerated on input, never written (PNG 1.5 eXIf)
    const tiff = b.slice(c.dataStart + prefix, c.dataStart + c.length);
    // PNG copyright mode drops eXIf (plan § 5 PNG) like `none`; a lossless rewrite still keeps Orientation ≠ 1.
    exif = exifFamily(tiff, exifChunks.length, { mode: mode === 'copyright' ? 'none' : mode, reencode, width, height });
  }
  const xmpChunks = chunks.filter((c) => c.type === 'iTXt' && textKeyword(b, c) === XMP_KEYWORD);
  let xmp = { outcome: xmpChunks.length ? 'dropped' : 'absent', chunk: null, gps: false };
  if (mode === 'keep' && xmpChunks.length === 1) {
    const packet = itxtXmpPacket(b, xmpChunks[0]);
    if (packet && xmpEligible(packet)) xmp = { outcome: 'verbatim', chunk: xmpChunks[0], gps: indexOfAscii(packet, 'GPS') >= 0 };
  }
  const textKeep = TEXT_KEEP[mode];
  const items = [];
  for (const c of chunks) {
    let out = null;
    const verbatim = () => b.subarray(c.start, c.end);
    if (c.type === 'eXIf') {
      if (c === exifChunks[0] && exif.bytes) out = pngChunk('eXIf', exif.bytes);
    } else if (TEXT_TYPES.has(c.type)) {
      const kw = textKeyword(b, c);
      if (kw === XMP_KEYWORD) out = c === xmp.chunk ? verbatim() : null;
      else if (kw !== null && (textKeep === null || textKeep.has(kw))) out = verbatim();
    } else if (c.type === 'tIME') {
      if (mode === 'keep' || mode === 'keep-no-gps') out = verbatim();
    } else if (PNG_ALLOWED.has(c.type)) {
      if (!reencode) out = verbatim();
    } else if (!reencode && mode === 'keep') out = verbatim(); // unknown ancillary: lossless keep only
    items.push({ chunk: c, out });
  }
  return {
    items,
    metadata: {
      mode, exif: exif.outcome, xmp: xmp.outcome, iptc: 'absent',
      gpsPresent: gpsPresentOf(mode, exif, xmp.gps), contentCredentials: false,
    },
  };
}

/**
 * Metadata chunks for a RE-ENCODED PNG (plan § 5 PNG): eXIf patched (keep / keep-no-gps), XMP `iTXt` (keep, eligible),
 * text chunks per mode, tIME (keep / keep-no-gps); unknown ancillary chunks are dropped. Original order kept.
 * @returns {{ chunks: Array<{ type: string, data: Uint8Array }>, metadata: MetadataOutcome }}
 */
export function buildPngMetadata(bytes, inspection, { mode, width, height }) {
  checkMode(mode);
  requirePng(inspection);
  const sp = inspection.special;
  if (sp.apng || sp.highBitDepth || sp.c2pa || sp.trailing) fail('special-content-transform-required', 'special PNG');
  const { items, metadata } = pngPlan(bytes, inspection, { mode, reencode: true, width, height });
  const chunks = [];
  for (const { out } of items) {
    if (!out) continue;
    const n = out.length - 12;
    chunks.push({ type: String.fromCharCode(out[4], out[5], out[6], out[7]), data: out.slice(8, 8 + n) });
  }
  return { chunks, metadata };
}

/**
 * Insert `chunks` right after IHDR of the encoder's PNG (fresh CRC32 each).
 * @param {Uint8Array} encoderBytes PNG from `canvas.toBlob`
 * @param {Array<{ type: string, data: Uint8Array }>} chunks
 */
export function assemblePng(encoderBytes, chunks) {
  if (sniffFormat(encoderBytes) !== 'png') fail('output-type-mismatch', 'encoder output is not a PNG');
  const ihdrLen = be32(encoderBytes, 8, 'output-type-mismatch');
  if (ihdrLen !== 13 || !hasAscii(encoderBytes, 12, 'IHDR')) fail('output-type-mismatch', 'IHDR first');
  const cut = 8 + 12 + 13;
  if (encoderBytes.length < cut) fail('output-type-mismatch', 'truncated PNG');
  return concat([encoderBytes.subarray(0, cut), ...chunks.map((c) => pngChunk(c.type, c.data)), encoderBytes.subarray(cut)]);
}

/**
 * Lossless rewrite of an already-compliant PNG for a selective mode: allowed rendering chunks + IDAT verbatim, metadata
 * chunks filtered per mode, unknown ancillary chunks dropped, nothing after IEND. eXIf keeps its Orientation; in
 * copyright / none (or when the family is malformed) an Orientation ≠ 1 survives as a minimal eXIf. Unknown critical
 * chunk → `invalid-image`; APNG / C2PA → `metadata-policy-unsupported`. `keep` returns an unchanged copy.
 * @returns {{ bytes: Uint8Array, metadata: MetadataOutcome }}
 */
export function rewritePngLossless(bytes, inspection, mode) {
  checkMode(mode);
  requirePng(inspection);
  if (inspection.special.apng || inspection.special.c2pa || inspection.special.trailing) fail('metadata-policy-unsupported', 'special PNG');
  if (mode === 'keep') {
    const has = (t) => inspection.png.chunks.some((c) => c.type === t);
    const xmpChunks = inspection.png.chunks.filter((c) => c.type === 'iTXt' && textKeyword(bytes, c) === XMP_KEYWORD);
    const xmp = xmpChunks.length > 0;
    return {
      bytes: bytes.slice(),
      metadata: {
        mode, exif: has('eXIf') ? 'exact' : 'absent', xmp: xmp ? 'exact' : 'absent', iptc: 'absent',
        gpsPresent: withXmpGps(exactGps(inspection.exif, inspection.png.exifCount, false), pngXmpGps(bytes, inspection.png.chunks)),
        contentCredentials: false,
      },
    };
  }
  const { items, metadata } = pngPlan(bytes, inspection, { mode, reencode: false });
  const out = [bytes.subarray(0, 8)];
  for (const { out: o } of items) if (o) out.push(o);
  return { bytes: concat(out), metadata };
}

// ---------------------------------------------------------------------------------------------------------------------
// Summary (validates a site processor's output; tests)

/**
 * What metadata a JPEG / PNG carries. Other formats: `{ format, supported: false }` plus null fields.
 * Throws `ImageResizeError` when a JPEG / PNG container is unreadable.
 * @param {Uint8Array} bytes
 */
export function readMetadataSummary(bytes) {
  const format = sniffFormat(bytes);
  const base = {
    format, supported: false, orientation: null, hasExif: null, exifValid: null, exifCount: 0, exifTags: [],
    gpsPresent: null, exifGps: null, hasMakerNote: null, hasXmp: null, hasIptc: null, iptcValid: null, iptcDatasets: [],
    textKeywords: [], contentCredentials: null,
  };
  if (format !== 'jpeg' && format !== 'png') return base;
  const ins = inspectImage(bytes, { maxHeaderBytes: Math.max(DEFAULT_MAX_HEADER_BYTES, bytes.length) });
  const ex = ins.exif;
  const exifCount = format === 'jpeg' ? ins.jpeg.exifCount : ins.png.exifCount;
  const s = {
    ...base, supported: true, orientation: ins.orientation,
    hasExif: exifCount > 0, exifCount, exifValid: ex ? ex.valid : null, exifTags: ex && ex.valid ? ex.ifd0Tags : [],
    gpsPresent: exactGps(ex, exifCount, false), // XMP "GPS" is folded in below
    // standard EXIF GPS IFD with entries only (gpsPresent also turns 'unknown' on opaque MakerNote data)
    exifGps: !ex ? false : !ex.valid ? 'unknown' : !!(ex.gps && ex.gps.entryCount > 0),
    hasMakerNote: !!(ex && ex.valid && ex.hasMakerNote),
    contentCredentials: !!ins.special.c2pa,
  };
  if (format === 'jpeg') {
    const groups = classify(bytes, allSegments(ins));
    // EXIF APP1 placed between scans counts as present (browsers ignore it, but it still ships)
    if (groups.exif.length > exifCount) {
      s.hasExif = true;
      s.exifCount = groups.exif.length;
      if (s.gpsPresent === false) s.gpsPresent = 'unknown';
      if (s.exifGps === false) s.exifGps = 'unknown';
    }
    s.hasXmp = groups.xmp.length + groups.xmpExt.length > 0;
    if (xmpHasGps(bytes, groups.xmp, XMP_STD_SIG.length) || xmpHasGps(bytes, groups.xmpExt, XMP_EXT_SIG.length)) s.gpsPresent = true;
    s.hasIptc = false;
    s.iptcValid = true;
    for (const seg of groups.photoshop) {
      const p = parseIptc(bytes, seg.payloadStart, seg.end);
      if (!p.ok) s.iptcValid = false;
      if (p.datasets.length) s.hasIptc = true;
      for (const d of p.datasets) s.iptcDatasets.push(`${d.record}:${d.dataset}`);
    }
  } else {
    s.hasIptc = false;
    s.iptcValid = true;
    s.hasXmp = false;
    for (const c of ins.png.chunks) {
      if (!TEXT_TYPES.has(c.type)) continue;
      const kw = textKeyword(bytes, c);
      if (kw === XMP_KEYWORD) s.hasXmp = true;
      else if (kw !== null) s.textKeywords.push(kw);
    }
    s.gpsPresent = withXmpGps(s.gpsPresent, pngXmpGps(bytes, ins.png.chunks));
  }
  // Appended content after the primary image (EOI / IEND) is opaque: it may carry a whole second file with metadata.
  s.trailing = !!ins.special.trailing;
  if (s.trailing && s.gpsPresent === false) s.gpsPresent = 'unknown';
  return s;
}

