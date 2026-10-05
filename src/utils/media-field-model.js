/**
 * v0.32.0 (plan v0.32.0-media-picker M1, decisions 24-25) — pure model of `<td-media-field>`: aspect ratio, crop
 * (JSON v1, kept byte-identical), submitted FormData entries, restore state, accepted kinds. php/td.php
 * `td_media_field()` implements the same rules (parity table: ASPECT_CASES / CROP_CASES, run by
 * test/php/td-ssr-media-field.test.js).
 *
 * v0.43.0 (plan v0.43.0-media-gallery M1, decisions 14-17): the gallery helpers `galleryEntries`, `validateItems`,
 * `parseItems`, `encodeGalleryState` / `decodeGalleryState` + the parity table GALLERY_CASES (php/td.php
 * td__media_gallery_items(), run by test/php/td-ssr-media-gallery.test.js).
 *
 * @module utils/media-field-model
 */
import { safeMediaUrl } from './media-url.js';

export const KINDS = Object.freeze(['image', 'video', 'file']);

const NUM = '(\\d{1,5}(?:\\.\\d{1,4})?)';
const RATIO_PAIR = new RegExp(`^${NUM}\\s*[/:]\\s*${NUM}$`);
const RATIO_ONE = new RegExp(`^${NUM}$`);
const RATIO_MAX = 10000;
const CROP_MAX_LEN = 512;
const CROP_EPS = 1e-6;
const FOCAL_MAX_LEN = 128;
const STATE_MAX_LEN = 16384;
const ALT_MAX = 500;
const ID_MAX = 512;

/**
 * `aspect-ratio` attribute → `{ w, h, text }` (`text` = the "3:2" shown on an empty frame), or null (invalid / absent).
 * `W/H`, `W:H` or one number (`1.91` → 1.91:1); each part > 0, ≤ 10000, at most 4 decimals; no exponent / sign.
 * @param {unknown} str
 * @returns {{ w: number, h: number, text: string } | null}
 */
export function parseAspectRatio(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim();
  let m = RATIO_PAIR.exec(s);
  let w;
  let h;
  if (m) {
    w = Number(m[1]);
    h = Number(m[2]);
  } else {
    m = RATIO_ONE.exec(s);
    if (!m) return null;
    w = Number(m[1]);
    h = 1;
  }
  if (!(w > 0 && h > 0 && w <= RATIO_MAX && h <= RATIO_MAX)) return null;
  return { w, h, text: `${w}:${h}` };
}

/**
 * `crop` attribute → `{ raw, crop }` (raw = the exact string, submitted as is), or null (absent / "null" / invalid).
 * Exactly `{"v":1,"x","y","width","height"}` with finite numbers, x,y ≥ 0, width,height > 0, x + width ≤ 1 and
 * y + height ≤ 1 (± 1e-6); at most 512 characters.
 * @param {unknown} str
 * @returns {{ raw: string, crop: { x: number, y: number, width: number, height: number } } | null}
 */
export function parseCrop(str) {
  if (typeof str !== 'string' || !str || str.length > CROP_MAX_LEN) return null;
  let o;
  try { o = JSON.parse(str); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const keys = Object.keys(o).sort().join(',');
  if (keys !== 'height,v,width,x,y' || o.v !== 1) return null;
  const { x, y, width, height } = o;
  if (![x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  if (x < 0 || y < 0 || width <= 0 || height <= 0) return null;
  if (x + width > 1 + CROP_EPS || y + height > 1 + CROP_EPS) return null;
  return { raw: str, crop: { x, y, width, height } };
}

/**
 * v0.35 (decision 29) — `focal` attribute / `name[focal]` → `{ raw, focal }` (raw = the exact string, submitted as is), or
 * null (absent / "null" / invalid). Exactly `{"v":1,"x","y"}` with finite numbers in [0, 1]; at most 128 characters.
 * @param {unknown} str
 * @returns {{ raw: string, focal: { x: number, y: number } } | null}
 */
export function parseFocal(str) {
  if (typeof str !== 'string' || !str || str.length > FOCAL_MAX_LEN) return null;
  let o;
  try { o = JSON.parse(str); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  if (Object.keys(o).sort().join(',') !== 'v,x,y' || o.v !== 1) return null;
  const { x, y } = o;
  if (![x, y].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)) return null;
  return { raw: str, focal: { x, y } };
}

const q6 = (v) => Math.round(v * 1e6) / 1e6;

/**
 * v0.35 (decision 29) — the crop string the CROP UI writes (picker crop step, dialog "Áp dụng"): keys `v,x,y,width,height`,
 * values quantised to 6 decimals, `x + width ≤ 1` kept. Always passes `parseCrop` (else null). Never used by
 * `setSelection()` / attribute paths (those keep v0.34 semantics, review R1 #5).
 * @param {{ x: number, y: number, width: number, height: number }|null|undefined} n
 * @returns {string|null}
 */
export function serializeCrop(n) {
  if (!n || ![n.x, n.y, n.width, n.height].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  const fit = (a, size) => {
    let s = size;
    if (a + s > 1) s = q6(1 - a);
    for (let i = 0; i < 10 && a + s > 1; i++) s = q6(s - 1e-6);
    return s;
  };
  const x = Math.max(0, q6(n.x));
  const y = Math.max(0, q6(n.y));
  const out = JSON.stringify({ v: 1, x, y, width: fit(x, q6(n.width)), height: fit(y, q6(n.height)) });
  return parseCrop(out) ? out : null;
}

/**
 * v0.35 — the focal string the crop UI writes: `{"v":1,"x","y"}`, 6 decimals, clamped to [0, 1]; invalid ⇒ null.
 * @param {{ x: number, y: number }|null|undefined} p
 * @returns {string|null}
 */
export function serializeFocal(p) {
  if (!p || ![p.x, p.y].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  const c = (v) => Math.min(1, Math.max(0, q6(v)));
  const out = JSON.stringify({ v: 1, x: c(p.x), y: c(p.y) });
  return parseFocal(out) ? out : null;
}

/** v0.35 review R1 #5 — the PUBLIC crop ratio range (w / h), boundaries included: picker `crop.aspectRatio`, field
 * `crop-ratio`, PHP `crop_ratio`, `<td-cropper aspect-ratio>`. Outside ⇒ rejected with one bounded warning. */
export const CROP_RATIO_MIN = 0.01;
export const CROP_RATIO_MAX = 100;

/** @param {unknown} r @returns {boolean} a finite number in [0.01, 100] */
export function cropRatioInRange(r) {
  return typeof r === 'number' && Number.isFinite(r) && r >= CROP_RATIO_MIN && r <= CROP_RATIO_MAX;
}

/**
 * v0.35 (decision 27) — `crop-ratio` attribute: `free` (any case) ⇒ `'free'`; a ratio (`parseAspectRatio` rules) whose
 * `w / h` is in [0.01, 100] ⇒ that number; absent / invalid / out of range ⇒ null (the field warns, then falls back to
 * `aspect-ratio`, then free).
 * @param {unknown} str
 * @returns {number|'free'|null}
 */
export function parseCropRatio(str) {
  if (typeof str !== 'string') return null;
  if (str.trim().toLowerCase() === 'free') return 'free';
  const r = parseAspectRatio(str);
  return r && cropRatioInRange(r.w / r.h) ? r.w / r.h : null;
}

/**
 * v0.35 (decision 30) — crop preview of the field frame: when the crop's PIXEL ratio (`width·W / height·H`) is within 2 %
 * of the frame ratio, the unitless CSSOM values `{ x, y, w, h }` (= the normalised crop) the `<img>` uses to show exactly
 * the cropped area; otherwise null (plain `object-fit: cover`).
 * @param {{ x: number, y: number, width: number, height: number }|null|undefined} crop normalised
 * @param {{ W: number, H: number, frameRatio: number|null|undefined }} o natural size + frame ratio (w / h)
 * @returns {{ x: number, y: number, w: number, h: number } | null}
 */
export function cropPreviewVars(crop, o) {
  if (!crop || !o) return null;
  const { W, H, frameRatio } = o;
  if (![W, H, frameRatio].every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0)) return null;
  if (![crop.x, crop.y, crop.width, crop.height].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  if (crop.width <= 0 || crop.height <= 0) return null;
  const r = (crop.width * W) / (crop.height * H);
  if (Math.abs(r / frameRatio - 1) > 0.02) return null;
  return { x: crop.x, y: crop.y, w: crop.width, h: crop.height };
}

/**
 * `accept-kind` (a comma / space list, or an array) → the valid kinds, unique, in order; none → `['image']`.
 * @param {unknown} v
 * @returns {Array<'image'|'video'|'file'>}
 */
export function parseKinds(v) {
  const list = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(/[\s,]+/) : []);
  const out = [];
  for (const k of list) {
    const l = typeof k === 'string' ? k.trim().toLowerCase() : '';
    if (KINDS.includes(l) && !out.includes(l)) out.push(l);
  }
  return out.length ? out : ['image'];
}

/**
 * The FormData entries of a field (decision 24) — the public form shape.
 * Reference (default): `[[name, id]]` (empty id → `name=`, the server reads "cleared").
 * Usage: always `name[id]`, `name[alt]`, `name[crop]` (crop = the validated attribute string, or `null`); v0.35
 * `opts.focal` (the `focal-point` attribute, opt-in) adds a fourth `name[focal]` (validated string, or `null`).
 * No name, or usage + a name ending in `[]` (would mis-group entries) → null (nothing submitted).
 * @param {string|null|undefined} name
 * @param {{ id?: string, alt?: string, cropRaw?: string|null, focalRaw?: string|null }} value
 * @param {boolean} usage
 * @param {{ focal?: boolean }} [opts]
 * @returns {Array<[string, string]> | null}
 */
export function fieldEntries(name, value, usage, opts) {
  if (typeof name !== 'string' || !name) return null;
  const id = typeof value?.id === 'string' ? value.id : '';
  if (!usage) return [[name, id]];
  if (name.endsWith('[]')) return null;
  const alt = typeof value?.alt === 'string' ? value.alt : '';
  const crop = typeof value?.cropRaw === 'string' && value.cropRaw ? value.cropRaw : 'null';
  const out = [[`${name}[id]`, id], [`${name}[alt]`, alt], [`${name}[crop]`, crop]];
  if (opts?.focal) {
    const focal = typeof value?.focalRaw === 'string' && value.focalRaw ? value.focalRaw : 'null';
    out.push([`${name}[focal]`, focal]);
  }
  return /** @type {Array<[string, string]>} */ (out);
}

/**
 * Restore state (setFormValue 2nd argument) — review SEC-1: ONLY `{"v":1,"id","alt","crop","focal"}` (the asset id, the
 * alt the user typed, the validated crop, v0.35 the validated focal). Never a preview URL (signed / tokenised) nor a server label: the browser may persist
 * this state (bfcache, session restore); the preview is fetched again with `adapter.get(id)` under the current session.
 * @param {{ id: string, alt: string, cropRaw: string|null, focalRaw?: string|null }} s extra keys (e.g. `preview`) are
 *   ignored
 * @returns {string}
 */
export function encodeState(s) {
  const crop = typeof s.cropRaw === 'string' ? parseCrop(s.cropRaw) : null;
  const focal = typeof s.focalRaw === 'string' ? parseFocal(s.focalRaw) : null;
  return JSON.stringify({
    v: 1, id: String(s.id ?? ''), alt: String(s.alt ?? ''), crop: crop ? crop.raw : null, focal: focal ? focal.raw : null,
  });
}

/**
 * Parse a restore state; only `v === 1`. Anything but id / alt / crop / focal (an old or forged `preview`) is ignored; an
 * invalid crop / focal → null; a missing `focal` (state written before v0.35) → null.
 * @param {unknown} str
 * @returns {{ id: string, alt: string, cropRaw: string|null, focalRaw: string|null } | null}
 */
export function decodeState(str) {
  if (typeof str !== 'string' || str.length > STATE_MAX_LEN) return null;
  let o;
  try { o = JSON.parse(str); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o) || o.v !== 1) return null;
  if (typeof o.id !== 'string' || o.id.length > ID_MAX || typeof o.alt !== 'string') return null;
  const crop = typeof o.crop === 'string' ? parseCrop(o.crop) : null;
  const focal = typeof o.focal === 'string' ? parseFocal(o.focal) : null;
  return {
    id: o.id, alt: [...o.alt].slice(0, ALT_MAX).join(''), cropRaw: crop ? crop.raw : null, focalRaw: focal ? focal.raw : null,
  };
}

/** Parity table (JS + PHP): [input, expected parseAspectRatio()]. */
export const ASPECT_CASES = Object.freeze([
  ['3/2', { w: 3, h: 2, text: '3:2' }],
  ['3:2', { w: 3, h: 2, text: '3:2' }],
  ['16 / 9', { w: 16, h: 9, text: '16:9' }],
  ['1.91', { w: 1.91, h: 1, text: '1.91:1' }],
  ['4.50:3', { w: 4.5, h: 3, text: '4.5:3' }],
  ['10000/1', { w: 10000, h: 1, text: '10000:1' }],
  ['0', null], ['-1', null], ['abc', null], ['1e9', null], ['0/2', null], ['1.12345', null], ['10001', null],
  ['', null], ['3 2', null], ['.5', null],
]);

/** Parity table (JS + PHP): [crop string, valid?]. */
export const CROP_CASES = Object.freeze([
  ['{"v":1,"x":0.1,"y":0,"width":0.5,"height":1}', true],
  ['{"v":1,"x":0,"y":0,"width":1,"height":1}', true],
  ['{"v":1,"x":0.5,"y":0,"width":0.5000005,"height":1}', true],
  ['{"v":1,"x":0.6,"y":0,"width":0.5,"height":0.5}', false],
  ['{"v":1,"x":-0.1,"y":0,"width":0.5,"height":0.5}', false],
  ['{"v":1,"x":0,"y":0,"width":0,"height":0.5}', false],
  ['{"x":0,"y":0,"width":0.5,"height":0.5}', false],
  ['{"v":2,"x":0,"y":0,"width":0.5,"height":0.5}', false],
  ['{"v":1,"x":0,"y":0,"width":0.5,"height":0.5,"z":1}', false],
  ['{"v":1,"x":"0","y":0,"width":0.5,"height":0.5}', false],
  ['{v:1}', false],
  ['null', false],
]);

/** v0.35 parity table (JS + PHP): [focal string, valid?]. */
export const FOCAL_CASES = Object.freeze([
  ['{"v":1,"x":0.5,"y":0.5}', true],
  ['{"v":1,"x":0,"y":1}', true],
  ['{"v":1,"x":0.123456,"y":0.654321}', true],
  ['{"v":1,"x":1.1,"y":0.5}', false],
  ['{"v":1,"x":-0.1,"y":0.5}', false],
  ['{"x":0.5,"y":0.5}', false],
  ['{"v":2,"x":0.5,"y":0.5}', false],
  ['{"v":1,"x":0.5,"y":0.5,"z":1}', false],
  ['{"v":1,"x":"0.5","y":0.5}', false],
  ['{"v":1,"x":0.5}', false],
  ['[0.5,0.5]', false],
  ['null', false],
  ['', false],
]);

/** v0.35 review R1 #5 parity table (JS + PHP): [crop-ratio string, parseCropRatio()]. */
export const CROP_RATIO_CASES = Object.freeze([
  ['free', 'free'],
  ['0.01', 0.01],
  ['1:100', 0.01],
  ['100', 100],
  ['100/1', 100],
  ['16:9', 16 / 9],
  ['0.0099', null],
  ['100.01', null],
  ['1:101', null],
  ['101/1', null],
  ['10000/1', null],
]);

// --- v0.43.0 <td-media-gallery> (plan v0.43.0-media-gallery decisions 14-17, ADR 0021) ---

/** Hard ceiling of a gallery (decision 6, owner O2): also the default `max`. 100 × 4 entries ≤ PHP max_input_vars 1000. */
export const GALLERY_MAX_ITEMS = 100;
/** The `items` attribute / restore state: at most 256 KiB (UTF-16 code units, like `String#length`). */
export const GALLERY_ITEMS_MAX_LEN = 262144;

const capAlt = (s) => [...s].slice(0, ALT_MAX).join('');
/** Review round 1 ISSUE-3: the display name of an item, capped like the alt (code points), never refused. */
export const GALLERY_NAME_MAX = 512;

/**
 * The FormData entries of a gallery (decision 14) — the public form shape (ADR 0021).
 * Reference (default): `name[]=<id>` per item, in order. Usage: `name[i][id]`, `name[i][alt]`, `name[i][crop]`
 * (+ `name[i][focal]` with `opts.focal`), i = 0…n−1, in this key order; crop / focal = the validated string or `null`.
 * Empty (both shapes): exactly ONE `name=` (the server reads "removed all"). No name, or a name ending in `[]` (the
 * gallery appends `[]` / `[i]` itself) → null (nothing submitted — the gallery fails closed).
 * @param {unknown} name
 * @param {Array<{ id: string, alt?: string, cropRaw?: string|null, focalRaw?: string|null }>} items
 * @param {{ usage?: boolean, focal?: boolean }} [opts]
 * @returns {Array<[string, string]> | null}
 */
export function galleryEntries(name, items, opts = {}) {
  if (typeof name !== 'string' || !name || name.endsWith('[]')) return null;
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [[name, '']];
  if (!opts.usage) return list.map((it) => [`${name}[]`, String(it.id)]);
  const out = [];
  list.forEach((it, i) => {
    const k = `${name}[${i}]`;
    out.push([`${k}[id]`, String(it.id)], [`${k}[alt]`, typeof it.alt === 'string' ? it.alt : ''],
      [`${k}[crop]`, typeof it.cropRaw === 'string' && it.cropRaw ? it.cropRaw : 'null']);
    if (opts.focal) out.push([`${k}[focal]`, typeof it.focalRaw === 'string' && it.focalRaw ? it.focalRaw : 'null']);
  });
  return /** @type {Array<[string, string]>} */ (out);
}

/**
 * Decision 15b — the ONE validation path of every way into a gallery's state (attribute `items`, PHP hydrate, form
 * restore, `value =`, `setSelection()`, picker). In order:
 *   1. an array of at most `ceiling` (100) entries → else `type` / `ceiling`; every entry an object → else `item`;
 *   2. every `id` a non-empty string of ≤ 512 code units → else `id`; unique (case-sensitive) → else `duplicate`;
 *   3. fields capped, never refused: alt cut to 500 code points, the display name to 512, crop (≤ 512, parseCrop) / focal (≤ 128, parseFocal)
 *      invalid → null, `src` through the URL gate (refused → '' — the item is kept), `kind` outside KINDS → image;
 *   4. more items than `max` → reason `max` WITH the normalised items (the caller keeps them — attribute / restore —
 *      or refuses — API).
 * Structural errors (1-2) return `items: null`. Input keys: `id`, `src`, `name` (display name), `kind`, `alt`, `crop`,
 * `focal` (crop / focal are the JSON v1 STRINGS, kept byte-identical).
 * @param {unknown} list
 * @param {{ max?: number, ceiling?: number, safeUrl?: (u: string) => boolean }} [o]
 * @returns {{ ok: boolean, reason: null|'type'|'ceiling'|'item'|'id'|'duplicate'|'max', items: Array<{ id: string,
 *   src: string, previewAlt: string, kind: 'image'|'video'|'file', alt: string, cropRaw: string|null,
 *   focalRaw: string|null }>|null }}
 */
export function validateItems(list, o = {}) {
  const ceiling = Number.isInteger(o.ceiling) && o.ceiling >= 0 ? o.ceiling : GALLERY_MAX_ITEMS;
  const max = Number.isInteger(o.max) && o.max >= 0 ? Math.min(o.max, ceiling) : ceiling;
  const okUrl = typeof o.safeUrl === 'function' ? o.safeUrl : (u) => !!safeMediaUrl(u);
  const fail = (reason) => ({ ok: false, reason, items: null });
  if (!Array.isArray(list)) return fail('type');
  if (list.length > ceiling) return fail('ceiling');
  if (list.some((x) => !x || typeof x !== 'object' || Array.isArray(x))) return fail('item');
  const seen = new Set();
  for (const x of list) {
    if (typeof x.id !== 'string' || !x.id || x.id.length > ID_MAX) return fail('id');
    if (seen.has(x.id)) return fail('duplicate');
    seen.add(x.id);
  }
  const items = list.map((x) => {
    const crop = typeof x.crop === 'string' ? parseCrop(x.crop) : null;
    const focal = typeof x.focal === 'string' ? parseFocal(x.focal) : null;
    return {
      id: x.id,
      src: typeof x.src === 'string' && x.src && okUrl(x.src) ? x.src : '',
      previewAlt: typeof x.name === 'string' ? [...x.name].slice(0, GALLERY_NAME_MAX).join('') : '',
      kind: /** @type {'image'|'video'|'file'} */ (KINDS.includes(x.kind) ? x.kind : 'image'),
      alt: typeof x.alt === 'string' ? capAlt(x.alt) : '',
      cropRaw: crop ? crop.raw : null,
      focalRaw: focal ? focal.raw : null,
    };
  });
  return items.length > max ? { ok: false, reason: 'max', items } : { ok: true, reason: null, items };
}

/**
 * The `items` attribute (decision 17): absent / '' → ok, []; > 256 KiB → `size`; not JSON → `json`; else
 * validateItems().
 * @param {unknown} str
 * @param {{ max?: number, safeUrl?: (u: string) => boolean }} [o]
 * @returns {ReturnType<typeof validateItems> | { ok: false, reason: 'size'|'json', items: null }}
 */
export function parseItems(str, o = {}) {
  if (str == null || str === '') return { ok: true, reason: null, items: [] };
  if (typeof str !== 'string') return { ok: false, reason: 'type', items: null };
  if (str.length > GALLERY_ITEMS_MAX_LEN) return { ok: false, reason: 'size', items: null };
  let v;
  try { v = JSON.parse(str); } catch { return { ok: false, reason: 'json', items: null }; }
  return validateItems(v, o);
}

/**
 * Restore state of a gallery (decision 16, review SEC-1 of the field): `{"v":1,"items":[{"id","alt","crop","focal"}]}`
 * — never a preview URL, a display name or an asset (the browser may persist it; previews come back through
 * `adapter.get`).
 * @param {Array<{ id: string, alt?: string, cropRaw?: string|null, focalRaw?: string|null }>} items
 * @returns {string}
 */
export function encodeGalleryState(items) {
  return JSON.stringify({
    v: 1,
    items: (items || []).map((it) => {
      const crop = typeof it.cropRaw === 'string' ? parseCrop(it.cropRaw) : null;
      const focal = typeof it.focalRaw === 'string' ? parseFocal(it.focalRaw) : null;
      return { id: String(it.id ?? ''), alt: String(it.alt ?? ''), crop: crop ? crop.raw : null, focal: focal ? focal.raw : null };
    }),
  });
}

/**
 * Parse a restore state (v1 only, ≤ 256 KiB) into the INPUT shape of validateItems (`{ id, alt, crop, focal }` — any
 * other key dropped); null when broken. The caller still runs validateItems (ids, duplicates, caps, max).
 * @param {unknown} str
 * @returns {Array<{ id: unknown, alt: unknown, crop: unknown, focal: unknown }> | null}
 */
export function decodeGalleryState(str) {
  if (typeof str !== 'string' || !str || str.length > GALLERY_ITEMS_MAX_LEN) return null;
  let o;
  try { o = JSON.parse(str); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o) || o.v !== 1 || !Array.isArray(o.items)) return null;
  return o.items.map((x) => (x && typeof x === 'object' && !Array.isArray(x)
    ? { id: x.id, alt: x.alt ?? '', crop: x.crop ?? null, focal: x.focal ?? null }
    : x));
}

const G_CROP = '{"v":1,"x":0.1,"y":0,"width":0.5,"height":1}';
const G_FOCAL = '{"v":1,"x":0.25,"y":0.75}';
const gIds = (n, p = 'm') => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);

/**
 * v0.43.0 parity table (JS validateItems ⇔ PHP td__media_gallery_items, decision 15b / 19). `items` = the input (PHP
 * receives the same JSON decoded as arrays), `max` (default 100), `expect` = the JS result `{ reason, ids?, items? }`,
 * `php` = the PHP result when it differs (PHP turns an int id into its decimal string FIRST; JS refuses numbers).
 */
export const GALLERY_CASES = Object.freeze([
  { id: 'valid', items: [{ id: 'm1', src: 'https://cdn.example/1.jpg', name: 'Ảnh 1', alt: 'Một', crop: G_CROP, focal: G_FOCAL }, { id: 'm2' }, { id: 'm3', kind: 'video' }],
    expect: { reason: null, ids: ['m1', 'm2', 'm3'],
      items: [{ src: 'https://cdn.example/1.jpg', previewAlt: 'Ảnh 1', kind: 'image', alt: 'Một', cropRaw: G_CROP, focalRaw: G_FOCAL },
        { src: '', previewAlt: '', kind: 'image', alt: '', cropRaw: null, focalRaw: null },
        { src: '', previewAlt: '', kind: 'video', alt: '', cropRaw: null, focalRaw: null }] } },
  { id: 'empty', items: [], expect: { reason: null, ids: [] } },
  { id: 'not-a-list', items: { a: { id: 'm1' } }, expect: { reason: 'type' } },
  { id: 'item-string', items: ['m1'], expect: { reason: 'item' } },
  { id: 'item-null', items: [{ id: 'm1' }, null], expect: { reason: 'item' } },
  { id: 'duplicate', items: [{ id: 'm1' }, { id: 'm2' }, { id: 'm1' }], expect: { reason: 'duplicate' } },
  { id: 'id-empty', items: [{ id: '' }], expect: { reason: 'id' } },
  { id: 'id-missing', items: [{ alt: 'x' }], expect: { reason: 'id' } },
  { id: 'id-513', items: [{ id: 'x'.repeat(513) }], expect: { reason: 'id' } },
  { id: 'id-512', items: [{ id: 'x'.repeat(512) }], expect: { reason: null, ids: ['x'.repeat(512)] } },
  { id: 'id-512-astral', items: [{ id: '😀'.repeat(257) }], expect: { reason: 'id' } },
  { id: 'id-bool', items: [{ id: true }], expect: { reason: 'id' } },
  { id: 'id-null', items: [{ id: null }], expect: { reason: 'id' } },
  { id: 'id-float', items: [{ id: 1.5 }], expect: { reason: 'id' } },
  { id: 'id-array', items: [{ id: ['m1'] }], expect: { reason: 'id' } },
  { id: 'id-int-zero', items: [{ id: 0 }], expect: { reason: 'id' }, php: { reason: null, ids: ['0'] } },
  { id: 'id-int', items: [{ id: 42 }, { id: -1 }], expect: { reason: 'id' }, php: { reason: null, ids: ['42', '-1'] } },
  { id: 'id-int-duplicate', items: [{ id: 7 }, { id: '7' }], expect: { reason: 'id' }, php: { reason: 'duplicate' } },
  { id: 'ceiling', items: gIds(101).map((id) => ({ id })), expect: { reason: 'ceiling' } },
  { id: 'at-ceiling', items: gIds(100).map((id) => ({ id })), expect: { reason: null, ids: gIds(100) } },
  { id: 'over-max', items: gIds(5).map((id) => ({ id })), max: 3, expect: { reason: 'max', ids: gIds(5) } },
  { id: 'at-max', items: gIds(3).map((id) => ({ id })), max: 3, expect: { reason: null, ids: gIds(3) } },
  // review round 1 ISSUE-3: the display name is capped like the alt (512 code points), never refused
  { id: 'name-cap', items: [{ id: 'm1', name: 'ả'.repeat(600) }], expect: { reason: null, ids: ['m1'], items: [{ previewAlt: 'ả'.repeat(512) }] } },
  { id: 'caps', items: [{ id: 'm1', alt: 'é'.repeat(600), crop: '{"v":1,"x":0.9,"y":0,"width":0.5,"height":1}', focal: '{"v":1,"x":2,"y":0}', src: 'javascript:alert(1)', kind: 'pdf' },
    { id: 'm2', src: 'data:image/png;base64,AAAA', crop: `${G_CROP}${' '.repeat(600)}`, alt: 7, name: 9 }],
    expect: { reason: null, ids: ['m1', 'm2'],
      items: [{ alt: 'é'.repeat(500), cropRaw: null, focalRaw: null, src: '', kind: 'image', previewAlt: '' },
        { alt: '', cropRaw: null, focalRaw: null, src: '', kind: 'image', previewAlt: '' }] } },
]);
