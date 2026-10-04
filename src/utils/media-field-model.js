/**
 * v0.32.0 (plan v0.32.0-media-picker M1, decisions 24-25) — pure model of `<td-media-field>`: aspect ratio, crop
 * (JSON v1, kept byte-identical), submitted FormData entries, restore state, accepted kinds. php/td.php
 * `td_media_field()` implements the same rules (parity table: ASPECT_CASES / CROP_CASES, run by
 * test/php/td-ssr-media-field.test.js).
 *
 * @module utils/media-field-model
 */

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

/**
 * v0.35 (decision 27) — `crop-ratio` attribute: `free` (any case) ⇒ `'free'`; a ratio (`parseAspectRatio` rules) ⇒ the
 * number `w / h`; absent / invalid ⇒ null (the field then falls back to `aspect-ratio`, then free).
 * @param {unknown} str
 * @returns {number|'free'|null}
 */
export function parseCropRatio(str) {
  if (typeof str !== 'string') return null;
  if (str.trim().toLowerCase() === 'free') return 'free';
  const r = parseAspectRatio(str);
  return r ? r.w / r.h : null;
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
