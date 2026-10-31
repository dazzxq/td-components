/**
 * v0.90.0 (plan docs/internal/plans/v0.90.0-image-resize.md § 2-4, step 2) — client image resize engine: policy
 * normalisation, the per-file decision flow, target size, the JPEG quality / PNG size search, the canvas engine (with
 * cached orientation probes), the site `processor` hook contract and the module-global FIFO queue (one job at a time).
 *
 * `optimizeImage(file, policy, { signal, onStart })` resolves to one of:
 * - `{ kind: 'not-image', file, optimization: null }` — magic bytes are not an image the kit recognises: the policy does
 *   not apply, the caller runs its legacy `max-size` check on the original file;
 * - `{ kind: 'original', file, optimization }` — the SAME File object (already compliant in `keep`, or a rewrite / the
 *   processor produced nothing new);
 * - `{ kind: 'rewritten' | 'resized' | 'processed', file, optimization }` — a new File (original name, canonical MIME of
 *   the same format, original `lastModified`).
 * Failures reject with `ImageResizeError { code }` (`aborted` on cancel); an invalid policy throws `TypeError`
 * synchronously. `optimization` follows plan § 6: `{ changed, reasons, original: { name, type, size, width, height },
 * output: { type, size, width, height }, metadata: { mode, exif, xmp, iptc, gpsPresent, contentCredentials } }`
 * (width / height = display orientation, null when the format's size is not read).
 *
 * Main thread only, no Worker / OffscreenCanvas / `<img>` fallback, no dependency. Byte work is in image-bytes.js /
 * image-metadata.js; this module only orchestrates.
 *
 * @module utils/image-resize
 */
import { ImageResizeError, sniffFormat, inspectImage, pngChunks, jpegSegmentKind, be32 } from './image-bytes.js';
import {
  buildJpegMetadata, assembleJpeg, buildPngMetadata, assemblePng, rewriteJpegLossless, rewritePngLossless,
  readMetadataSummary, crc32, jpegSegment, METADATA_MODES, PNG_ALLOWED,
} from './image-metadata.js';

export { ImageResizeError };

/** Bytes read to sniff the format: every binary magic fits in 64, an SVG behind a long prolog needs up to 4 KiB. */
export const SNIFF_BYTES = 4096;

/** Policy defaults (plan § 2). Output caps are off (`null`) — the kit sets no site ceiling. */
export const IMAGE_RESIZE_DEFAULTS = Object.freeze({
  maxBytes: null,
  maxPixels: null,
  maxWidth: null,
  maxHeight: null,
  quality: 0.9,
  minQuality: 0.65,
  maxEncodes: 8,
  metadata: 'keep',
  maxInputBytes: 64 * 1024 * 1024,
  maxInputPixels: 64e6,
  maxInputSide: 16384,
  maxHeaderBytes: 1024 * 1024,
  processor: null,
});

const KEYS = Object.keys(IMAGE_RESIZE_DEFAULTS);
const OUTPUT_CAPS = ['maxBytes', 'maxPixels', 'maxWidth', 'maxHeight'];
const SAFETY_CAPS = ['maxInputBytes', 'maxInputPixels', 'maxInputSide', 'maxHeaderBytes'];
const MIME = {
  jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', heic: 'image/heic',
  svg: 'image/svg+xml', bmp: 'image/bmp', tiff: 'image/tiff', jxl: 'image/jxl',
};

const fail = (code, message) => {
  throw new ImageResizeError(code, message);
};
const abortedError = () => new ImageResizeError('aborted', 'image optimisation cancelled');

// ---------------------------------------------------------------------------------------------------------------------
// Policy

const normalized = new WeakSet();
const warnedKeys = new Set();
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isPosInt = (v) => typeof v === 'number' && Number.isInteger(v) && v > 0;

/**
 * Normalise an `imageResize` policy (plan § 2): copy own known keys over the defaults, validate, freeze. `null` /
 * `undefined` → `null` (feature off). Unknown own keys are ignored with one `console.warn` per key name. Any invalid
 * value of a known key → `TypeError` (thrown synchronously, so the caller keeps its previous policy). An already
 * normalised policy is returned as is.
 *
 * Rules: output caps (`maxBytes`, `maxPixels`, `maxWidth`, `maxHeight`) are `null` or an integer > 0; safety caps
 * (`maxInputBytes`, `maxInputPixels`, `maxInputSide`, `maxHeaderBytes`) an integer > 0 (`null` is refused: they cannot
 * be switched off); `maxEncodes` an integer 1-32; `quality` / `minQuality` a number in (0, 1] with
 * `minQuality <= quality` (a default counts: `{ quality: 0.6 }` alone fails against the default floor 0.65);
 * `metadata` one of `keep | keep-no-gps | copyright | none`; `processor` a function or `null`.
 *
 * @param {object|null|undefined} input
 * @returns {Readonly<ImageResizePolicy>|null}
 *
 * @typedef {{ maxBytes: number|null, maxPixels: number|null, maxWidth: number|null, maxHeight: number|null,
 *   quality: number, minQuality: number, maxEncodes: number, metadata: 'keep'|'keep-no-gps'|'copyright'|'none',
 *   maxInputBytes: number, maxInputPixels: number, maxInputSide: number, maxHeaderBytes: number,
 *   processor: null|((file: File, ctx: { policy: object, signal: AbortSignal }) => File|Blob|null|Promise<File|Blob|null>) }} ImageResizePolicy
 */
export function normalizeImageResizePolicy(input) {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object' || Array.isArray(input)) throw new TypeError('imageResize: policy must be an object or null');
  if (normalized.has(input)) return input;
  const p = { ...IMAGE_RESIZE_DEFAULTS };
  for (const k of KEYS) if (own(input, k)) p[k] = input[k];
  for (const k of Object.keys(input)) {
    if (KEYS.includes(k) || warnedKeys.has(k)) continue;
    warnedKeys.add(k);
    console.warn(`imageResize: unknown key "${k}" ignored`);
  }
  for (const k of OUTPUT_CAPS) {
    if (p[k] !== null && !isPosInt(p[k])) throw new TypeError(`imageResize.${k}: expected null or an integer > 0`);
  }
  for (const k of SAFETY_CAPS) {
    if (!isPosInt(p[k])) throw new TypeError(`imageResize.${k}: expected an integer > 0`);
  }
  if (!isPosInt(p.maxEncodes) || p.maxEncodes > 32) throw new TypeError('imageResize.maxEncodes: expected an integer 1-32');
  for (const k of ['quality', 'minQuality']) {
    const v = p[k];
    if (typeof v !== 'number' || !(v > 0 && v <= 1)) throw new TypeError(`imageResize.${k}: expected a number in (0, 1]`);
  }
  if (p.minQuality > p.quality) throw new TypeError('imageResize.minQuality: must be <= quality');
  if (!METADATA_MODES.includes(p.metadata)) throw new TypeError(`imageResize.metadata: expected one of ${METADATA_MODES.join(', ')}`);
  if (p.processor !== null && typeof p.processor !== 'function') throw new TypeError('imageResize.processor: expected a function or null');
  const frozen = Object.freeze(p);
  normalized.add(frozen);
  return frozen;
}

// ---------------------------------------------------------------------------------------------------------------------
// Size math

/**
 * Output size for a display-oriented `width × height` (plan § 4): `s = min(1, maxWidth/w, maxHeight/h,
 * sqrt(maxPixels/(w·h)))` (unset caps omitted), each side rounded down and ≥ 1. A 1-pixel clamp on a very thin image
 * cannot push the area over `maxPixels`: the long side is reduced until it fits.
 * @param {number} width
 * @param {number} height
 * @param {{ maxWidth?: number|null, maxHeight?: number|null, maxPixels?: number|null }} caps
 * @returns {{ width: number, height: number }}
 */
export function computeTargetSize(width, height, { maxWidth = null, maxHeight = null, maxPixels = null } = {}) {
  let s = 1;
  if (maxWidth) s = Math.min(s, maxWidth / width);
  if (maxHeight) s = Math.min(s, maxHeight / height);
  if (maxPixels) s = Math.min(s, Math.sqrt(maxPixels / (width * height)));
  // + 1e-9: 3001 · (1000 / 3001) is 999.9999… in floating point; the caps below still clamp
  let w = Math.max(1, Math.floor(width * s + 1e-9));
  let h = Math.max(1, Math.floor(height * s + 1e-9));
  if (maxWidth) w = Math.min(w, maxWidth);
  if (maxHeight) h = Math.min(h, maxHeight);
  if (maxPixels) {
    while (w * h > maxPixels) {
      if (w >= h) w = Math.max(1, Math.floor(maxPixels / h));
      else h = Math.max(1, Math.floor(maxPixels / w));
    }
  }
  return { width: w, height: h };
}

/** Which output caps a display-oriented size / byte count breaks (`reasons` order: bytes, pixels, width, height). */
function capReasons(policy, size, dims) {
  const r = [];
  if (policy.maxBytes !== null && size > policy.maxBytes) r.push('bytes');
  if (dims) {
    if (policy.maxPixels !== null && dims.width * dims.height > policy.maxPixels) r.push('pixels');
    if (policy.maxWidth !== null && dims.width > policy.maxWidth) r.push('width');
    if (policy.maxHeight !== null && dims.height > policy.maxHeight) r.push('height');
  }
  return r;
}
const hasDimensionCap = (p) => p.maxPixels !== null || p.maxWidth !== null || p.maxHeight !== null;

// ---------------------------------------------------------------------------------------------------------------------
// Queue (module-global FIFO, one active job across every dropzone / picker)

const queue = [];
let active = false;

function pump() {
  if (active) return;
  const job = queue.shift();
  if (!job) return;
  active = true;
  job.start().finally(() => {
    active = false;
    pump();
  });
}

/**
 * Optimise one file under a policy. Jobs run one at a time in call order (module-global FIFO). An abort while queued
 * removes the job; an abort while running rejects at once with `aborted`, and the job keeps the slot until its
 * in-flight browser work settles (its late result is dropped, no later stage runs), so two decodes never overlap.
 *
 * @param {File|Blob} file
 * @param {object} policy raw or normalised policy (normalised synchronously: invalid → TypeError)
 * @param {{ signal?: AbortSignal|null, onStart?: (() => void)|null, engine?: ImageResizeEngine }} [opts]
 *   `onStart`: called when the job leaves the queue (`queued` → `optimizing`); `engine`: decode / encode backend
 *   (default: the canvas engine; tests inject a fake).
 * @returns {Promise<ImageResizeResult>}
 *
 * @typedef {{ kind: 'not-image'|'original'|'rewritten'|'resized'|'processed', file: File|Blob,
 *   optimization: object|null }} ImageResizeResult
 */
export function optimizeImage(file, policy, { signal = null, onStart = null, engine = null } = {}) {
  const p = normalizeImageResizePolicy(policy);
  if (!p) throw new TypeError('optimizeImage: a policy is required');
  if (!(file instanceof Blob)) throw new TypeError('optimizeImage: file must be a File or Blob');
  const eng = engine || defaultEngine();
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(abortedError());
      return;
    }
    let settled = false;
    const job = {};
    const onAbort = () => {
      const i = queue.indexOf(job);
      if (i >= 0) queue.splice(i, 1);
      finish(reject, abortedError());
    };
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener('abort', onAbort);
      fn(value);
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    job.start = () => {
      if (settled) return Promise.resolve();
      if (onStart) {
        try {
          onStart();
        } catch (e) {
          console.error(e);
        }
      }
      return processFile(file, p, signal, eng).then((r) => finish(resolve, r), (e) => finish(reject, e));
    };
    queue.push(job);
    pump();
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Decision flow (plan § 3)

const readBytes = async (blob) => new Uint8Array(await blob.arrayBuffer());
const sameBytes = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
const toFile = (bytes, original, format) => new File([bytes], original.name ?? 'image', {
  type: MIME[format], lastModified: original.lastModified ?? Date.now(),
});
const isSpecialJpeg = (sp) => sp.mpf || sp.gainMap || sp.c2pa || sp.trailing;
const isSpecialPng = (sp) => sp.apng || sp.highBitDepth || sp.c2pa || sp.trailing;

/** Family outcomes of metadata kept byte-for-byte, from a summary (JPEG / PNG) — or opaque for other formats. */
function exactMetadata(mode, summary) {
  if (!summary || !summary.supported) {
    return { mode, exif: 'exact', xmp: 'exact', iptc: 'exact', gpsPresent: 'unknown', contentCredentials: false };
  }
  return {
    mode,
    exif: summary.hasExif ? 'exact' : 'absent',
    xmp: summary.hasXmp ? 'exact' : 'absent',
    iptc: summary.hasIptc ? 'exact' : 'absent',
    gpsPresent: summary.gpsPresent,
    contentCredentials: !!summary.contentCredentials,
  };
}

/** True when a JPEG's SOF is not 8-bit baseline / extended / progressive Huffman (browsers rarely decode the rest). */
function jpegDecodeUnsupported(ins) {
  const sof = ins.jpeg.segments.find((s) => s.marker >= 0xc0 && s.marker <= 0xcf && s.marker !== 0xc4 && s.marker !== 0xc8 && s.marker !== 0xcc);
  return !sof || ![0xc0, 0xc1, 0xc2].includes(sof.marker) || ins.bitDepth !== 8;
}

async function processFile(file, policy, signal, engine) {
  const check = () => {
    if (signal && signal.aborted) throw abortedError();
  };
  check();
  if (file.size === 0) fail('empty-file');
  const head = await readBytes(file.slice(0, SNIFF_BYTES));
  check();
  const format = sniffFormat(head);
  if (!format) return { kind: 'not-image', file, optimization: null };
  if (file.size > policy.maxInputBytes) fail('input-too-large');

  let bytes = null;
  let ins;
  if (format === 'jpeg' || format === 'png') {
    bytes = await readBytes(file);
    check();
    ins = inspectImage(bytes, { maxHeaderBytes: policy.maxHeaderBytes });
  } else {
    ins = inspectImage(head, { maxHeaderBytes: policy.maxHeaderBytes });
  }
  if (ins.width !== null && ins.height !== null) {
    if (ins.width > policy.maxInputSide || ins.height > policy.maxInputSide || ins.width * ins.height > policy.maxInputPixels) {
      fail('input-dimensions-too-large');
    }
  }
  // SVG is vector: byte cap only. Other formats without a readable size cannot be checked against a dimension cap.
  const dims = format !== 'svg' && ins.width !== null ? { width: ins.orientedWidth, height: ins.orientedHeight } : null;
  const unverifiable = format !== 'svg' && !dims && hasDimensionCap(policy);
  const reasons = capReasons(policy, file.size, dims);
  const compliant = reasons.length === 0 && !unverifiable;
  const mode = policy.metadata;
  const ctx = {
    file, policy, signal, engine, check, format, bytes, ins, dims, compliant, mode,
    reasons: mode === 'keep' ? reasons : [...reasons, 'metadata'],
    original: { name: file.name ?? '', type: file.type, size: file.size, width: dims ? dims.width : null, height: dims ? dims.height : null },
  };

  if (compliant && mode === 'keep') {
    const summary = bytes ? readMetadataSummary(bytes) : null;
    return originalResult(ctx, exactMetadata(mode, summary));
  }
  if (policy.processor) return runProcessor(ctx);
  if (compliant) {
    if (format === 'jpeg' || format === 'png') return rewrite(ctx);
    fail('metadata-policy-unsupported', `${format}: metadata mode ${mode} needs a rewrite the kit cannot do`);
  }
  if (format === 'jpeg') {
    if (isSpecialJpeg(ins.special)) fail('special-content-transform-required');
    return transform(ctx, 'image/jpeg');
  }
  if (format === 'png') {
    if (isSpecialPng(ins.special)) fail('special-content-transform-required');
    return transform(ctx, 'image/png');
  }
  fail('format-not-transformable', `${format} over the policy caps`);
}

function originalResult(ctx, metadata) {
  const { file, original } = ctx;
  return {
    kind: 'original', file,
    optimization: {
      changed: false, reasons: [], original,
      output: { type: original.type, size: original.size, width: original.width, height: original.height },
      metadata,
    },
  };
}

function newResult(ctx, kind, bytes, width, height, metadata, reasons = ctx.reasons) {
  const out = toFile(bytes, ctx.file, ctx.format);
  return {
    kind, file: out,
    optimization: {
      changed: true, reasons, original: ctx.original,
      output: { type: out.type, size: out.size, width, height },
      metadata,
    },
  };
}

/** Compliant JPEG / PNG in a selective mode: lossless rewrite (pixels / entropy data untouched). */
function rewrite(ctx) {
  const { bytes, ins, mode, policy } = ctx;
  const r = ctx.format === 'jpeg' ? rewriteJpegLossless(bytes, ins, mode) : rewritePngLossless(bytes, ins, mode);
  if (sameBytes(r.bytes, bytes)) return originalResult(ctx, r.metadata);
  if (policy.maxBytes !== null && r.bytes.length > policy.maxBytes) fail('cannot-satisfy-limits', 'rewrite over maxBytes');
  return newResult(ctx, 'rewritten', r.bytes, ctx.dims.width, ctx.dims.height, r.metadata, ['metadata']);
}

// ---------------------------------------------------------------------------------------------------------------------
// Transform (decode + resize + encode, plan § 4)

const ENCODER_APP = new Set(['jfif', 'jfxx', 'icc', 'adobe']);

/**
 * Encoder output minus the encoder's own metadata, so only the policy's metadata ships (plan § 5: keep the JFIF / ICC
 * / APP14 the encoder wrote). WebKit's JPEG encoder writes an APP1 Exif + APP13 Photoshop, its PNG encoder an `eXIf`;
 * Firefox's PNG encoder a private `deBG` chunk. JPEG: header segments other than tables / SOF / DRI and APP0
 * JFIF/JFXX, APP2 ICC, APP14 Adobe are dropped, bytes from SOS kept. PNG: only the rendering / structure chunks every
 * mode keeps. Not the requested format → `output-type-mismatch`; unreadable → `encode-failed`.
 */
function cleanEncoderOutput(enc, jpeg) {
  if (sniffFormat(enc) !== (jpeg ? 'jpeg' : 'png')) fail('output-type-mismatch', 'encoder bytes are not the requested format');
  try {
    if (jpeg) {
      const { segments, sosOffset } = inspectImage(enc, { maxHeaderBytes: enc.length }).jpeg;
      const parts = [enc.subarray(0, 2)];
      for (const seg of segments) {
        if (seg.start >= sosOffset) break;
        const kind = jpegSegmentKind(enc, seg);
        if (kind === null || ENCODER_APP.has(kind)) parts.push(enc.subarray(seg.start, seg.end));
      }
      parts.push(enc.subarray(sosOffset));
      return concatBytes(parts);
    }
    const parts = [enc.subarray(0, 8)];
    for (const c of pngChunks(enc)) if (PNG_ALLOWED.has(c.type)) parts.push(enc.subarray(c.start, c.end));
    return concatBytes(parts);
  } catch (e) {
    if (e instanceof ImageResizeError) fail('encode-failed', `unreadable encoder output (${e.code})`);
    throw e;
  }
}
function concatBytes(parts) {
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

/**
 * Decode once at the target size, then encode until the output (encoder bytes + the metadata that will be spliced in)
 * fits `maxBytes`, within `maxEncodes` encodes in total.
 *
 * JPEG: encode at `quality`; too big → bisect DOWNWARD in [minQuality, quality] (midpoints while the gap is > 0.08,
 * then `minQuality` itself) and stop at the first compliant encode; still too big at the floor → scale the size by
 * `sqrt(budget / bytes) × 0.95` and encode again at `minQuality` (the shrink is sized from the floor encode, so a
 * higher quality would not fit either). PNG: one encode per size, shrinking the same way. The
 * smallest compliant candidate is kept (a non-compliant last encode is never returned). Out of encodes → when the image
 * alone would have fitted but not with its metadata `metadata-too-large`, else `cannot-satisfy-limits`.
 */
async function transform(ctx, type) {
  const { bytes, ins, mode, policy, engine, check, signal } = ctx;
  const jpeg = type === 'image/jpeg';
  const target = computeTargetSize(ctx.dims.width, ctx.dims.height, policy);
  const buildMeta = (width, height) => {
    if (jpeg) {
      const m = buildJpegMetadata(bytes, ins, { mode, width, height });
      return { ...m, length: m.segments.reduce((n, s) => n + s.length, 0) };
    }
    const m = buildPngMetadata(bytes, ins, { mode, width, height });
    return { ...m, length: m.chunks.reduce((n, c) => n + 12 + c.data.length, 0) };
  };
  const maxBytes = policy.maxBytes;
  // the metadata alone reaches the cap: no image bytes could fit next to it
  const firstMeta = buildMeta(target.width, target.height);
  if (maxBytes !== null && firstMeta.length > 0 && firstMeta.length >= maxBytes) fail('metadata-too-large', 'metadata alone reaches maxBytes');

  let handle = null;
  try {
    handle = await engine.open(ctx.file, {
      format: ctx.format, width: target.width, height: target.height, orientation: ins.orientation,
      orientedWidth: ctx.dims.width, orientedHeight: ctx.dims.height,
      decodeUnsupported: jpeg ? jpegDecodeUnsupported(ins) : false, signal,
    });
    check();
    let encodes = 0;
    let best = null;
    let minImageOnly = Infinity;
    let w = target.width;
    let h = target.height;
    let meta = firstMeta;
    sizes: while (encodes < policy.maxEncodes) {
      if (w !== target.width || h !== target.height) meta = buildMeta(w, h);
      const budget = maxBytes === null ? Infinity : maxBytes - meta.length;
      // first size: start at `quality`; after a shrink (sized from the floor encode) go on at `minQuality`
      let q = jpeg ? (w === target.width && h === target.height ? policy.quality : policy.minQuality) : undefined;
      let floorBytes = 0;
      for (;;) {
        if (encodes >= policy.maxEncodes) break sizes;
        encodes++;
        const blob = await engine.encode(handle, { type, quality: q, width: w, height: h });
        check();
        if (!blob) fail('encode-failed', 'encoder returned no blob');
        if (blob.type !== type) fail('output-type-mismatch', `encoder returned ${blob.type || 'no type'}`);
        const enc = cleanEncoderOutput(await readBytes(blob), jpeg);
        check();
        minImageOnly = Math.min(minImageOnly, enc.length);
        if (enc.length <= budget) {
          const out = jpeg ? assembleJpeg(enc, meta.segments) : assemblePng(enc, meta.chunks);
          if (maxBytes === null || out.length <= maxBytes) {
            if (!best || out.length < best.bytes.length) best = { bytes: out, width: w, height: h, metadata: meta.metadata };
            break sizes;
          }
        }
        floorBytes = enc.length;
        if (!jpeg || q <= policy.minQuality) break;
        const gap = q - policy.minQuality;
        q = gap > 0.08 ? Math.round((policy.minQuality + gap / 2) * 1000) / 1000 : policy.minQuality;
      }
      // still too big at the quality floor (or the one PNG encode): shrink and go again
      const s = Math.sqrt(Math.max(0, budget) / floorBytes) * 0.95;
      const nw = Math.max(1, Math.floor(w * s));
      const nh = Math.max(1, Math.floor(h * s));
      if (nw === w && nh === h) {
        if (w === 1 && h === 1) break;
        w = Math.max(1, w - 1);
        h = Math.max(1, h - 1);
      } else {
        w = nw;
        h = nh;
      }
    }
    if (!best) {
      if (maxBytes !== null && meta.length > 0 && minImageOnly <= maxBytes) fail('metadata-too-large', 'no room for the image next to its metadata');
      fail('cannot-satisfy-limits', `no compliant output within ${policy.maxEncodes} encodes`);
    }
    return newResult(ctx, 'resized', best.bytes, best.width, best.height, best.metadata);
  } finally {
    if (handle) engine.close(handle);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Site processor (plan § 3, r1 #4)

const ALLOWED_TAGS = { copyright: new Set([0x0112, 0x013b, 0x8298]), none: new Set([0x0112]) };
const IPTC_LOCATION = new Set(['2:26', '2:27', '2:90', '2:92', '2:95', '2:100', '2:101']);
const IPTC_COPYRIGHT = new Set(['1:90', '2:80', '2:116']);
const PNG_TEXT = {
  'keep-no-gps': new Set(['Title', 'Author', 'Description', 'Copyright']),
  copyright: new Set(['Author', 'Copyright']),
  none: new Set(),
};

/**
 * Does a JPEG / PNG summary satisfy a metadata mode? `keep`: anything. Every other mode: no XMP, no standard EXIF GPS
 * (unknown counts as present), at most one valid EXIF, valid IPTC, no Content Credentials, nothing after EOI / IEND;
 * `keep-no-gps` also no IPTC location datasets and PNG text only Title / Author / Description / Copyright; `copyright`:
 * EXIF IFD0 tags ⊆ Orientation / Artist / Copyright, IPTC ⊆ 1:90 / 2:80 / 2:116, PNG text ⊆ Author / Copyright;
 * `none`: EXIF only Orientation, no IPTC, no PNG text.
 */
export function metadataSatisfies(summary, mode) {
  if (mode === 'keep') return true;
  const s = summary;
  if (!s || !s.supported) return false;
  if (s.trailing || s.contentCredentials || s.hasXmp) return false;
  if (s.exifCount > 1 || (s.hasExif && s.exifValid !== true) || s.exifGps !== false) return false;
  if (!s.iptcValid) return false;
  const textOk = s.textKeywords.every((k) => PNG_TEXT[mode].has(k));
  if (!textOk) return false;
  if (mode === 'keep-no-gps') return !s.iptcDatasets.some((d) => IPTC_LOCATION.has(d));
  if (s.exifTags.some((t) => !ALLOWED_TAGS[mode].has(t))) return false;
  if (mode === 'copyright') return s.iptcDatasets.every((d) => IPTC_COPYRIGHT.has(d));
  return !s.hasIptc;
}

/**
 * Selective modes: a JPEG / PNG the site hands back (processor result, or the original via `null`) must already be
 * what the kit's own lossless rewrite for `mode` would produce: rewriting it changes no byte. This catches what the
 * summary does not model (COM, other APPn, extra Photoshop resources, private / unknown / disallowed PNG chunks). A
 * rewrite that throws (special content, metadata between scans, unreadable EXIF / IPTC) counts as a difference.
 */
function losslessFixpoint(bytes, ins, format, mode) {
  if (mode === 'keep') return true;
  try {
    const r = format === 'jpeg' ? rewriteJpegLossless(bytes, ins, mode) : rewritePngLossless(bytes, ins, mode);
    return sameBytes(r.bytes, bytes);
  } catch (e) {
    if (e instanceof ImageResizeError) return false;
    throw e;
  }
}

/** Every PNG chunk CRC matches and no unknown critical chunk (processor output is untrusted). */
function pngIntegrity(bytes) {
  for (const c of pngChunks(bytes)) {
    if (crc32(bytes, c.start + 4, c.dataStart + c.length) !== be32(bytes, c.dataStart + c.length)) return false;
    if (c.type.charCodeAt(0) < 0x61 && !['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(c.type)) return false;
  }
  return true;
}

/**
 * The site processor replaces the engine on the over-cap branch and on the rewrite branch (whatever the format). Its
 * result must be the same format family (magic bytes), meet every active cap (bytes; dimensions the kit can read — an
 * unreadable size under a dimension cap is invalid) and the metadata mode (read back), else `processor-invalid-result`;
 * a throw → `processor-failed`; `null` = keep the original, valid only when the original already satisfies the whole
 * policy.
 */
async function runProcessor(ctx) {
  const { file, policy, signal, check, format, mode } = ctx;
  let out;
  try {
    out = await policy.processor(file, { policy, signal: signal || new AbortController().signal });
  } catch (e) {
    check();
    throw new ImageResizeError('processor-failed', e && e.message ? String(e.message) : 'processor threw');
  }
  check();
  const invalid = (why) => fail('processor-invalid-result', why);
  if (out === null) {
    const summary = ctx.bytes ? readMetadataSummary(ctx.bytes) : null;
    if (!ctx.compliant || !metadataSatisfies(summary, mode)) invalid('null result but the original breaks the policy');
    if (ctx.bytes && !losslessFixpoint(ctx.bytes, ctx.ins, format, mode)) invalid(`null result but the original carries metadata mode ${mode} drops`);
    return originalResult(ctx, exactMetadata(mode, summary));
  }
  if (!(out instanceof Blob)) invalid('result is not a File, Blob or null');
  if (out.size === 0 || out.size > policy.maxInputBytes) invalid('result size');
  const head = await readBytes(out.slice(0, SNIFF_BYTES));
  check();
  if (sniffFormat(head) !== format) invalid('result format differs from the original');
  let bytes = null;
  let ins;
  try {
    if (format === 'jpeg' || format === 'png') {
      bytes = await readBytes(out);
      check();
      ins = inspectImage(bytes, { maxHeaderBytes: policy.maxHeaderBytes });
      if (format === 'png' && !pngIntegrity(bytes)) invalid('PNG chunk CRC / critical chunk');
    } else {
      ins = inspectImage(head, { maxHeaderBytes: policy.maxHeaderBytes });
    }
  } catch (e) {
    if (e instanceof ImageResizeError && e.code !== 'processor-invalid-result' && e.code !== 'aborted') invalid(`unreadable result (${e.code})`);
    throw e;
  }
  // the input safety caps bind the result too (raw stored size, as for the input)
  if (ins.width !== null && ins.height !== null) {
    if (ins.width > policy.maxInputSide || ins.height > policy.maxInputSide || ins.width * ins.height > policy.maxInputPixels) {
      invalid('result over maxInputSide / maxInputPixels');
    }
  }
  const dims = format !== 'svg' && ins.width !== null ? { width: ins.orientedWidth, height: ins.orientedHeight } : null;
  if (format !== 'svg' && !dims && hasDimensionCap(policy)) invalid('result size cannot be checked against a dimension cap');
  if (capReasons(policy, out.size, dims).length) invalid('result breaks a cap');
  const summary = bytes ? readMetadataSummary(bytes) : null;
  if (!metadataSatisfies(summary, mode)) invalid(`result metadata breaks mode ${mode}`);
  if (bytes && !losslessFixpoint(bytes, ins, format, mode)) invalid(`result carries metadata mode ${mode} drops`);
  if (bytes && ctx.bytes && sameBytes(bytes, ctx.bytes)) return originalResult(ctx, exactMetadata(mode, summary));
  const origSummary = ctx.bytes ? readMetadataSummary(ctx.bytes) : null;
  const family = (has, had) => (has === null ? 'rebuilt' : has ? 'rebuilt' : had ? 'dropped' : 'absent');
  const metadata = summary
    ? {
      mode,
      exif: family(summary.hasExif, origSummary && origSummary.hasExif),
      xmp: family(summary.hasXmp, origSummary && origSummary.hasXmp),
      iptc: family(summary.hasIptc, origSummary && origSummary.hasIptc),
      gpsPresent: summary.gpsPresent,
      contentCredentials: !!summary.contentCredentials,
    }
    : { mode, exif: 'rebuilt', xmp: 'rebuilt', iptc: 'rebuilt', gpsPresent: 'unknown', contentCredentials: false };
  return newResult(ctx, 'processed', bytes || out, dims ? dims.width : null, dims ? dims.height : null, metadata);
}

// ---------------------------------------------------------------------------------------------------------------------
// Canvas engine (browser)

/**
 * Decode / encode backend. `open` decodes `file` upright (EXIF orientation applied) at exactly `width × height`;
 * `encode` draws the opened image at `width × height` (≤ the opened size) and returns the encoder blob (or null);
 * `close` frees everything `open` allocated. Both may throw `ImageResizeError`.
 * @typedef {{
 *   open: (file: Blob, o: { format: string, width: number, height: number, orientation: number,
 *     orientedWidth: number, orientedHeight: number, decodeUnsupported: boolean, signal: AbortSignal|null }) => Promise<any>,
 *   encode: (handle: any, o: { type: string, quality: number|undefined, width: number, height: number }) => Promise<Blob|null>,
 *   close: (handle: any) => void,
 * }} ImageResizeEngine
 */

const zeroCanvas = (c) => {
  c.width = 0;
  c.height = 0;
};
function newCanvas(width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx) {
    zeroCanvas(c);
    fail('canvas-limit', `no 2D context for ${width}×${height}`);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas: c, ctx };
}

/** Draw `source` (sw × sh) into `ctx` at tw × th, halving on intermediate canvases so no step shrinks more than 2×. */
function drawDownscaled(source, sw, sh, ctx, tw, th) {
  let cur = source;
  let cw = sw;
  let ch = sh;
  try {
    while (cw > tw * 2 || ch > th * 2) {
      const nw = Math.max(tw, Math.ceil(cw / 2));
      const nh = Math.max(th, Math.ceil(ch / 2));
      const step = newCanvas(nw, nh);
      step.ctx.drawImage(cur, 0, 0, nw, nh);
      if (cur !== source) zeroCanvas(cur);
      cur = step.canvas;
      cw = nw;
      ch = nh;
    }
    ctx.drawImage(cur, 0, 0, tw, th);
  } finally {
    if (cur !== source) zeroCanvas(cur);
  }
}

const toBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
  try {
    canvas.toBlob(resolve, type, quality);
  } catch (e) {
    reject(e);
  }
});

function decodeError(err, unsupported) {
  if (err instanceof ImageResizeError) return err;
  return new ImageResizeError(unsupported ? 'decode-unsupported' : 'decode-failed', err && err.message ? String(err.message) : 'decode failed');
}

// --- orientation probes (r1 #7, r2 #12): cached per format for the module's life ---

/** Minimal big-endian TIFF: IFD0 with one SHORT Orientation entry. */
function orientationTiff(orientation) {
  return Uint8Array.of(0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0);
}
const EXIF_HEADER = Uint8Array.of(0x45, 0x78, 0x69, 0x66, 0, 0);

const probes = new Map();

/**
 * Does `createImageBitmap(…, { imageOrientation: 'from-image' })` apply EXIF Orientation for `format` (jpeg | png
 * eXIf)? Builds a 16×8 image, left half red / right half blue, tags it Orientation 6 and checks the bitmap is 8×16 with
 * a red top half. Any failure → false. Cached.
 * @param {'jpeg'|'png'} format
 * @returns {Promise<boolean>}
 */
export function probeOrientation(format) {
  if (!probes.has(format)) probes.set(format, runProbe(format).catch(() => false));
  return probes.get(format);
}

async function runProbe(format) {
  const type = format === 'png' ? 'image/png' : 'image/jpeg';
  const { canvas, ctx } = newCanvas(16, 8);
  let blob;
  try {
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 8, 8);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(8, 0, 8, 8);
    blob = await toBlob(canvas, type, 1);
  } finally {
    zeroCanvas(canvas);
  }
  if (!blob || blob.type !== type) return false;
  const raw = await readBytes(blob);
  const tiff = orientationTiff(6);
  const tagged = format === 'png'
    ? assemblePng(raw, [{ type: 'eXIf', data: tiff }])
    : assembleJpeg(raw, [jpegSegment(0xe1, Uint8Array.from([...EXIF_HEADER, ...tiff]))]);
  const bitmap = await createImageBitmap(new Blob([tagged], { type }), { imageOrientation: 'from-image' });
  try {
    if (bitmap.width !== 8 || bitmap.height !== 16) return false;
    const read = newCanvas(8, 16);
    try {
      read.ctx.drawImage(bitmap, 0, 0);
      const top = read.ctx.getImageData(4, 3, 1, 1).data;
      const bottom = read.ctx.getImageData(4, 12, 1, 1).data;
      const red = (p) => p[0] > 160 && p[2] < 96;
      const blue = (p) => p[2] > 160 && p[0] < 96;
      return red(top) && blue(bottom);
    } finally {
      zeroCanvas(read.canvas);
    }
  } finally {
    bitmap.close();
  }
}

/**
 * The browser engine: `createImageBitmap` with `imageOrientation: 'from-image'` and resize options; resize options
 * refused (TypeError) → decode at full size; a bitmap of the wrong size is brought to the target on canvas in ≤ 2×
 * steps. A full-size bitmap whose aspect does not match the display orientation (orientation not applied) →
 * `resize-unsupported`; so does Orientation ≠ 1 when the cached probe for the format failed.
 * @param {{ probe?: (format: string) => Promise<boolean> }} [opts] probe override (tests)
 * @returns {ImageResizeEngine}
 */
export function createCanvasEngine({ probe = probeOrientation } = {}) {
  return {
    async open(file, o) {
      const aborted = () => o.signal && o.signal.aborted;
      if (o.orientation !== 1) {
        const ok = await probe(o.format);
        if (aborted()) throw abortedError();
        if (!ok) fail('resize-unsupported', `EXIF orientation not applied by this browser for ${o.format}`);
      }
      if (typeof createImageBitmap !== 'function') fail('decode-unsupported', 'createImageBitmap missing');
      let bitmap;
      try {
        bitmap = await createImageBitmap(file, {
          imageOrientation: 'from-image', resizeWidth: o.width, resizeHeight: o.height, resizeQuality: 'high',
        });
      } catch (e) {
        if (aborted()) throw abortedError();
        if (!(e instanceof TypeError)) throw decodeError(e, o.decodeUnsupported);
        try {
          bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch (e2) {
          if (aborted()) throw abortedError();
          throw decodeError(e2, o.decodeUnsupported);
        }
      }
      if (aborted()) {
        bitmap.close();
        throw abortedError();
      }
      const bw = bitmap.width;
      const bh = bitmap.height;
      if (bw === o.width && bh === o.height) return { source: bitmap, bitmap, width: bw, height: bh };
      // wrong size: must still be the upright image (same aspect as the display orientation), at least the target size
      const aspectOk = Math.abs(bw * o.orientedHeight - bh * o.orientedWidth) <= Math.max(bw, bh, o.orientedWidth, o.orientedHeight);
      if (!aspectOk || bw < o.width || bh < o.height) {
        bitmap.close();
        fail('resize-unsupported', `decoded ${bw}×${bh}, expected the upright ${o.orientedWidth}×${o.orientedHeight} image`);
      }
      let target = null;
      try {
        target = newCanvas(o.width, o.height);
        drawDownscaled(bitmap, bw, bh, target.ctx, o.width, o.height);
      } catch (e) {
        if (target) zeroCanvas(target.canvas);
        throw e;
      } finally {
        bitmap.close();
      }
      return { source: target.canvas, bitmap: null, width: o.width, height: o.height };
    },
    async encode(handle, { type, quality, width, height }) {
      const { canvas, ctx } = newCanvas(width, height);
      try {
        if (width === handle.width && height === handle.height) ctx.drawImage(handle.source, 0, 0);
        else drawDownscaled(handle.source, handle.width, handle.height, ctx, width, height);
        try {
          return await toBlob(canvas, type, quality);
        } catch (e) {
          fail('encode-failed', e && e.message ? String(e.message) : 'toBlob threw');
        }
      } finally {
        zeroCanvas(canvas);
      }
    },
    close(handle) {
      if (handle.bitmap) handle.bitmap.close();
      else if (handle.source && 'width' in handle.source) zeroCanvas(handle.source);
    },
  };
}

let canvasEngine = null;
const defaultEngine = () => canvasEngine || (canvasEngine = createCanvasEngine());
