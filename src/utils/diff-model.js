/**
 * v0.46.0 (plan docs/internal/plans/v0.46.0-diff.md QĐ 1–10) — pure model of `<td-diff>`: no DOM. Shared by the
 * component, the node tests and the PHP parity tests (php/td.php `Td::diffModel()` implements the SAME rules and must
 * produce the same model byte for byte — test/ssr/diff.fixtures.json). Internal module (no package subpath).
 *
 * normalize(input, opts) → { rows, counts, notes, json, warnings }
 * - input: `{ items }` (flat rows — dsuite policies `fields` / `keys`) or `{ before, after, fields }` (snapshots,
 *   flattened by the kit). `items !== undefined` wins.
 * - Every string is TEXT (the renderer escapes it). Control characters C0 (except \t \n) / C1 are removed; bidi /
 *   invisible characters are KEPT here and made visible as `⟨U+202E⟩` by the renderer (QĐ 8).
 * - Bounded work (QĐ 10): node / key / row / text / JSON budgets, raw strings cut before any regex.
 * - Typed paths (QĐ 3): `path` is an array of segments — string = object key (verbatim), number = array index; a row id
 *   is `JSON.stringify(path)`.
 * - Numbers (QĐ 7a): one canonical rule shared with PHP — non-finite first, then safe integer / unsafe integer /
 *   ECMAScript Number::toString.
 * - Masking (QĐ 9 + dsuite clarification 2026-10-06): an item `masked: true` shows its before / after only when they
 *   are STRINGS (already masked by the server, e.g. `***678`), else `TdDiff.labels.masked`; a masked FieldDef prefix
 *   hides a whole snapshot branch, which is never read.
 * @module utils/diff-model
 */

export const LIMITS = Object.freeze({
  nodes: 10000, // visited values per side (snapshots)
  keys: 1000, // keys of one object / elements of one array (and items inspected)
  rows: 500, // rows kept (changed first, then unchanged)
  depth: 6, // flattened levels
  label: 200, // code points of a key / label
  preview: 300, // code points shown before "Xem đầy đủ"
  full: 10000, // code points of one value
  total: 300000, // code points of every full value of one diff
  json: 100000, // UTF-16 code units of one JSON view side
  list: 200, // elements shown per list side
  fields: 200, // FieldDefs inspected
  pathSegs: 7, // segments of a FieldDef path
  unit: 20, // code points of a unit
  equal: 10000, // steps of one deep comparison
  jsonDepth: 32, // nesting of the JSON view
});

/** Default texts (Vietnamese) — TdDiff.labels / PHP Td::DIFF_LABELS (same keys). `{n}` = a number. */
export const DEFAULT_LABELS = Object.freeze({
  table: 'So sánh thay đổi',
  field: 'Trường',
  before: 'Trước',
  after: 'Sau',
  added: 'Thêm',
  removed: 'Xoá',
  changed: 'Đổi',
  masked: '[ĐÃ ẨN]',
  maskedBadge: 'Đã che',
  empty: 'trống',
  yes: 'Có',
  no: 'Không',
  showFull: 'Xem đầy đủ ({n} ký tự)',
  unchanged: '{n} trường không đổi',
  json: 'Xem JSON',
  jsonBefore: 'JSON trước',
  jsonAfter: 'JSON sau',
  more: 'Còn {n} trường không hiện.',
  tooLarge: 'Dữ liệu quá lớn, chỉ hiện một phần.',
  textBudget: 'Dữ liệu dài: các giá trị sau chỉ hiện bản xem trước.',
  truncated: '… đã cắt',
  none: 'Không có thay đổi.',
  unsupported: '[không hỗ trợ]',
  unreadable: '[không đọc được]',
  cycle: '[vòng lặp]',
  unsafeNumber: '[số quá lớn]',
  uncertain: 'không so sánh được',
  unsafeNote: 'Có số vượt độ chính xác — server nên gửi dạng chuỗi.',
  invalidJson: 'JSON không hợp lệ.',
  listAdded: 'thêm',
  listRemoved: 'bỏ',
  listMore: '+{n} phần tử',
  arraySummary: 'Mảng {n} phần tử',
  objectSummary: 'Object {n} khoá',
  root: 'Giá trị',
});

export const KINDS = Object.freeze(['added', 'removed', 'changed', 'unchanged']);
export const TYPES = Object.freeze(['text', 'number', 'money', 'boolean', 'date', 'enum', 'list', 'json']);
/** Bidi / invisible characters shown as `⟨U+XXXX⟩` (QĐ 8). */
export const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;
const INVISIBLE_G = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

/** `{name}` placeholders; a function replacement keeps `$&` in the data literal (precedent v0.37). */
export function fill(template, vars) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(vars, k) ? String(vars[k]) : m));
}

/** Labels: defaults + own string overrides. */
export function resolveLabels(over) {
  const L = { ...DEFAULT_LABELS };
  if (over && typeof over === 'object') {
    for (const k of Object.keys(DEFAULT_LABELS)) {
      let v;
      try { v = Object.hasOwn(over, k) ? over[k] : undefined; } catch { v = undefined; }
      if (typeof v === 'string') L[k] = v;
    }
  }
  return L;
}

// --- strings ---

/** Number of code points. */
export function cpLength(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) i++;
    }
    n++;
  }
  return n;
}

/** First `max` code points (and whether something was left out). */
export function cpSlice(s, max) {
  let n = 0;
  let i = 0;
  while (i < s.length && n < max) {
    const c = s.charCodeAt(i);
    i += c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00 ? 2 : 1;
    n++;
  }
  return i >= s.length ? s : s.slice(0, i);
}

/** JS `String.prototype.trim()` whitespace (= PHP Td::JS_WS). */
const isBlank = (s) => s.trim() === '';

/**
 * A raw string → `{ s, cut, empty }`: cut to 4 × max code points BEFORE any regex (bounded work), C0 (except \t \n) /
 * C1 removed, lone surrogates → U+FFFD, then the first `max` code points. `empty` = nothing but whitespace (JS trim).
 * @param {string} raw
 * @param {number} max
 */
export function cleanText(raw, max) {
  let s = raw;
  let cut = false;
  if (s.length > max * 4) {
    const head = cpSlice(s.slice(0, max * 8), max * 4);
    if (head.length < s.length) cut = true;
    s = head;
  }
  s = s.replace(CONTROL, '').replace(LONE, '\uFFFD');
  const empty = isBlank(s);
  const t = cpSlice(s, max);
  if (t.length < s.length) cut = true;
  return { s: t, cut, empty };
}

/** A key / label: cleaned, cut to `max` code points + `…`. */
export function cleanLabel(raw, max = LIMITS.label) {
  const r = cleanText(raw, max);
  return r.cut ? `${r.s}…` : r.s;
}

/** A path segment from an object key: the raw key, first 200 code points (lone surrogates → U+FFFD). */
function keySeg(k) {
  const s = k.length > LIMITS.label ? cpSlice(k, LIMITS.label) : k;
  return s.replace(LONE, '\uFFFD');
}

/** Split a display string into text / invisible-character parts (the renderer marks the latter). */
export function splitInvisible(s) {
  const out = [];
  let last = 0;
  INVISIBLE_G.lastIndex = 0;
  let m;
  while ((m = INVISIBLE_G.exec(s))) {
    if (m.index > last) out.push({ t: s.slice(last, m.index) });
    out.push({ c: `⟨U+${m[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}⟩` });
    last = m.index + 1;
  }
  if (last < s.length) out.push({ t: s.slice(last) });
  return out;
}

// --- numbers (QĐ 7a) ---

/**
 * The shared number rule: `{ t: 'x' }` non-finite (checked FIRST) · `{ t: 'u' }` integer beyond ±(2^53 − 1) ·
 * `{ t: 'n', s }` canonical string (safe integer without `-0`, else ECMAScript Number::toString).
 * @param {number} x
 */
export function canonicalNumber(x) {
  if (!Number.isFinite(x)) return { t: 'x' };
  if (Number.isInteger(x)) {
    if (Math.abs(x) > Number.MAX_SAFE_INTEGER) return { t: 'u' };
    return { t: 'n', s: String(x === 0 ? 0 : x) };
  }
  return { t: 'n', s: String(x) };
}

/** Half-up rounding of a canonical decimal string to `d` fraction digits (on the STRING — never toFixed). */
export function roundDecimal(canon, d) {
  const neg = canon.startsWith('-');
  const body = neg ? canon.slice(1) : canon;
  const dot = body.indexOf('.');
  if (dot < 0 || body.length - dot - 1 <= d) return canon;
  const int = body.slice(0, dot);
  const frac = body.slice(dot + 1);
  let digits = int + frac.slice(0, d);
  if (frac.charCodeAt(d) >= 53) { // '5'
    const a = digits.split('');
    let i = a.length - 1;
    while (i >= 0) {
      if (a[i] === '9') { a[i] = '0'; i--; } else { a[i] = String.fromCharCode(a[i].charCodeAt(0) + 1); break; }
    }
    digits = (i < 0 ? '1' : '') + a.join('');
  }
  const il = digits.length - d;
  let out = digits.slice(0, il).replace(/^0+(?=[0-9])/, '');
  let f = digits.slice(il).replace(/0+$/, '');
  if (!out) out = '0';
  const r = out + (f ? `.${f}` : '');
  return neg && r !== '0' ? `-${r}` : r;
}

/** `1234567.5` → `1.234.567,5` (vi-VN); an exponent form is shown as is. */
export function formatNumber(canon, decimals, unit) {
  let s = canon;
  if (!/[eE]/.test(s)) {
    if (decimals !== null) s = roundDecimal(s, decimals);
    const neg = s.startsWith('-');
    const [int, frac] = (neg ? s.slice(1) : s).split('.');
    let g = int;
    if (int.length > 3) {
      const head = int.length % 3 || 3;
      g = int.slice(0, head);
      for (let i = head; i < int.length; i += 3) g += `.${int.slice(i, i + 3)}`;
    }
    s = (neg ? '-' : '') + g + (frac !== undefined ? `,${frac}` : '');
  }
  return unit ? `${s} ${unit}` : s;
}

/** `YYYY-MM-DD` (valid calendar date) → `DD/MM/YYYY`, else null. */
export function formatDate(s) {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (mo < 1 || mo > 12 || d < 1 || d > dim[mo - 1]) return null;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// --- key order (QĐ 3a) ---

/** An array-index key exactly as JS defines it: canonical decimal 0 … 4294967294. */
export function isIndexKey(k) {
  return /^(?:0|[1-9][0-9]{0,9})$/.test(k) && Number(k) <= 4294967294;
}

/** JS own-property order: index keys ascending, then the others in insertion order. */
export function orderKeys(keys) {
  const idx = [];
  const rest = [];
  for (const k of keys) (isIndexKey(k) ? idx : rest).push(k);
  idx.sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
  return idx.length ? idx.concat(rest) : rest;
}

// --- value inspection ---

const isScalar = (v) => v === null || v === undefined || typeof v === 'string' || typeof v === 'number'
  || typeof v === 'boolean' || typeof v === 'bigint';

/** 'array' | 'object' (plain) | 'date' | 'other' | 'scalar' — never throws (a hostile Proxy → 'bad'). */
function shapeOf(v) {
  if (isScalar(v)) return 'scalar';
  if (typeof v !== 'object') return 'other';
  try {
    if (Array.isArray(v)) return 'array';
    const p = Object.getPrototypeOf(v);
    if (p === Object.prototype || p === null) return 'object';
    if (v instanceof Date) return 'date';
    return 'other';
  } catch {
    return 'bad';
  }
}

/** Own enumerable string keys in JS order, or null when they cannot be read. */
function keysOf(o) {
  try { return orderKeys(Object.keys(o)); } catch { return null; }
}

function lengthOf(a) {
  try {
    const n = a.length;
    return Number.isInteger(n) && n >= 0 ? n : null;
  } catch { return null; }
}

/**
 * Deep equality of two raw values: 1 equal · 0 different · 2 cannot tell (unsafe / non-finite number, unsupported
 * value, budget or depth exhausted). Objects compare by key SET (order free); arrays by index.
 */
export function deepEqual(a, b, budget = { left: LIMITS.equal }, depth = 0) {
  if (--budget.left < 0 || depth > 64) return 2;
  const sa = shapeOf(a);
  const sb = shapeOf(b);
  if (sa === 'scalar' && sb === 'scalar') {
    if (a == null || b == null) return a == null && b == null ? 1 : 0;
    if (typeof a === 'number' || typeof b === 'number') {
      if (typeof a !== 'number' || typeof b !== 'number') return 0;
      const ca = canonicalNumber(a);
      const cb = canonicalNumber(b);
      if (ca.t !== 'n' || cb.t !== 'n') return 2;
      return ca.s === cb.s ? 1 : 0;
    }
    if (typeof a === 'bigint' || typeof b === 'bigint') return typeof a === typeof b && a === b ? 1 : 0;
    return a === b ? 1 : 0;
  }
  if (sa !== sb) return sa === 'scalar' || sb === 'scalar' ? 0 : (sa === 'other' || sb === 'other' || sa === 'bad' || sb === 'bad' ? 2 : 0);
  if (sa === 'date') {
    try { return a.getTime() === b.getTime() ? 1 : 0; } catch { return 2; }
  }
  if (sa === 'array') {
    const la = lengthOf(a);
    const lb = lengthOf(b);
    if (la === null || lb === null) return 2;
    if (la !== lb) return 0;
    let unsure = false;
    for (let i = 0; i < la; i++) {
      let x;
      let y;
      try { x = a[i]; y = b[i]; } catch { return 2; }
      const r = deepEqual(x, y, budget, depth + 1);
      if (r === 0) return 0;
      if (r === 2) { unsure = true; if (budget.left < 0) return 2; }
    }
    return unsure ? 2 : 1;
  }
  if (sa === 'object') {
    const ka = keysOf(a);
    const kb = keysOf(b);
    if (!ka || !kb) return 2;
    if (ka.length !== kb.length) return 0;
    const inB = new Set(kb);
    for (const k of ka) if (!inB.has(k)) return 0;
    let unsure = false;
    for (const k of ka) {
      let x;
      let y;
      try { x = a[k]; y = b[k]; } catch { return 2; }
      const r = deepEqual(x, y, budget, depth + 1);
      if (r === 0) return 0;
      if (r === 2) { unsure = true; if (budget.left < 0) return 2; }
    }
    return unsure ? 2 : 1;
  }
  return 2;
}

// --- JSON (compact one-line leaf + the budgeted pretty view) ---

/** JSON string literal with the kit's escapes (C0, DEL, C1 as \u00xx; lone surrogates as \udxxx). */
export function jsonString(s) {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) out += '\\"';
    else if (c === 0x5c) out += '\\\\';
    else if (c === 0x0a) out += '\\n';
    else if (c === 0x0d) out += '\\r';
    else if (c === 0x09) out += '\\t';
    else if (c === 0x08) out += '\\b';
    else if (c === 0x0c) out += '\\f';
    else if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) out += `\\u${c.toString(16).padStart(4, '0')}`;
    else if (c >= 0xd800 && c <= 0xdfff) {
      const pair = c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00;
      if (pair) { out += s[i] + s[i + 1]; i++; } else out += `\\u${c.toString(16)}`;
    } else out += s[i];
  }
  return `${out}"`;
}

/**
 * Serializer shared by the compact leaf and the pretty view: never JSON.stringify on input (cycles, bigint, no early
 * stop). Masked paths print `"[ĐÃ ẨN]"` without being read.
 */
class JsonWriter {
  /**
   * @param {{ L: object, pretty: boolean, budget: number, masked: (path: Array<string|number>) => boolean, onUnsafe?: () => void }} o
   */
  constructor(o) {
    this.L = o.L;
    this.pretty = o.pretty;
    this.left = o.budget;
    this.masked = o.masked;
    this.onUnsafe = o.onUnsafe || (() => {});
    this.lines = [];
    this.cur = '';
    this.cut = false;
  }

  /** append text to the current line; false (and cut) when over budget */
  put(t) {
    if (this.cut) return false;
    if (t.length > this.left) {
      this.cut = true;
      return false;
    }
    this.left -= t.length;
    this.cur += t;
    return true;
  }

  /** new line (pretty) */
  nl(indent) {
    if (!this.pretty || this.cut) return !this.cut;
    if (1 + indent > this.left) {
      this.cut = true;
      return false;
    }
    this.left -= 1 + indent;
    this.lines.push(this.cur);
    this.cur = ' '.repeat(indent);
    return true;
  }

  text() {
    return this.pretty ? [...this.lines, this.cur].join('\n') : this.cur;
  }

  scalar(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'string') {
      const r = cleanText(v, LIMITS.full);
      return jsonString(r.cut ? `${r.s}…` : r.s);
    }
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'bigint') return jsonString(v.toString());
    const c = canonicalNumber(v);
    if (c.t === 'n') return c.s;
    this.onUnsafe();
    return jsonString(c.t === 'u' ? this.L.unsafeNumber : this.L.unsupported);
  }

  /**
   * @param {unknown} v
   * @param {Array<string|number>} path
   * @param {number} indent
   * @param {object[]} anc ancestors (cycle check)
   */
  value(v, path, indent, anc) {
    if (this.cut) return;
    const shape = shapeOf(v);
    if (shape === 'scalar') { this.put(this.scalar(v)); return; }
    if (shape === 'date') {
      let iso = null;
      try { iso = v.toISOString(); } catch { iso = null; }
      this.put(iso === null ? jsonString(this.L.unsupported) : jsonString(iso));
      return;
    }
    if (shape !== 'array' && shape !== 'object') { this.put(jsonString(shape === 'bad' ? this.L.unreadable : this.L.unsupported)); return; }
    if (anc.includes(v)) { this.put(jsonString(this.L.cycle)); return; }
    if (anc.length >= LIMITS.jsonDepth) { this.put(jsonString('…')); return; }
    const arr = shape === 'array';
    const keys = arr ? null : keysOf(v);
    const len = arr ? lengthOf(v) : keys && keys.length;
    if (len === null) { this.put(jsonString(this.L.unreadable)); return; }
    if (len === 0) { this.put(arr ? '[]' : '{}'); return; }
    if (!this.put(arr ? '[' : '{')) return;
    anc.push(v);
    for (let i = 0; i < len && !this.cut; i++) {
      if (i > 0 && !this.put(',')) break;
      if (this.pretty) { if (!this.nl(indent + 2)) break; } else if (i > 0 && !this.put(' ')) break;
      const seg = arr ? i : keySeg(keys[i]);
      if (!arr && !this.put(`${jsonString(seg)}: `)) break;
      const p = path.concat([seg]);
      if (this.masked(p)) { this.put(jsonString(this.L.masked)); continue; }
      let child;
      try { child = arr ? v[i] : v[keys[i]]; } catch { this.put(jsonString(this.L.unreadable)); continue; }
      this.value(child, p, indent + 2, anc);
    }
    anc.pop();
    if (this.cut) return;
    if (this.pretty && !this.nl(indent)) return;
    this.put(arr ? ']' : '}');
  }
}

/** One line of JSON for a deep leaf (QĐ 5), cut at LIMITS.full code units. */
function compactJson(v, path, ctx) {
  const w = new JsonWriter({ L: ctx.L, pretty: false, budget: LIMITS.full, masked: ctx.isMasked, onUnsafe: () => { ctx.unsafe = true; } });
  w.value(v, path, 0, []);
  return { s: w.text(), cut: w.cut };
}

/** Pretty JSON view of one side (QĐ 13): 2-space indent, kit key order, ≤ LIMITS.json code units, cut at a line. */
function prettyJson(v, ctx, entries) {
  const w = new JsonWriter({ L: ctx.L, pretty: true, budget: LIMITS.json, masked: ctx.isMasked });
  if (entries) {
    // items mode: an object built from the items (key → value), kit key order
    const keys = orderKeys([...entries.keys()]);
    if (!keys.length) w.put('{}');
    else if (w.put('{')) {
      for (let i = 0; i < keys.length && !w.cut; i++) {
        if (i > 0 && !w.put(',')) break;
        if (!w.nl(2)) break;
        if (!w.put(`${jsonString(keys[i])}: `)) break;
        const e = entries.get(keys[i]);
        if (e.masked) w.put(w.scalar(e.text));
        else w.value(e.value, [keys[i]], 2, []);
      }
      if (!w.cut && w.nl(0)) w.put('}');
    }
  } else {
    w.value(v, [], 0, []);
  }
  // cut → keep whole lines only
  return { text: w.cut ? w.lines.join('\n') : w.text(), cut: w.cut };
}

// --- descriptors (one side of one row) ---
// { t: 'e' } empty · { t: 'm' } masked label · { t: 's', raw, s, cut } string · { t: 'n', s } number · { t: 'u' } unsafe
// number · { t: 'x' } non-finite · { t: 'b', v } boolean · { t: 'l', items: desc[], len } scalar list ·
// { t: 'note', s, ref? } fixed text (+ raw value for equality) · { t: 'j', s, cut, ref } JSON of a deep container

const EMPTY = Object.freeze({ t: 'e' });
const MASKED = Object.freeze({ t: 'm' });

/** A scalar → descriptor. */
function scalarDesc(v, ctx) {
  if (v === null || v === undefined) return EMPTY;
  if (typeof v === 'string') {
    const r = cleanText(v, LIMITS.full);
    return r.empty ? EMPTY : { t: 's', raw: v, s: r.s, cut: r.cut };
  }
  if (typeof v === 'boolean') return { t: 'b', v };
  if (typeof v === 'bigint') {
    const s = v.toString();
    return { t: 's', raw: s, s, cut: false };
  }
  const c = canonicalNumber(v);
  if (c.t !== 'n') ctx.unsafe = true;
  return c;
}

/** A non-scalar leaf value (items mode, or a container that does not descend) → descriptor. */
function containerLeaf(v, shape, path, ctx) {
  if (shape === 'date') {
    let iso = null;
    try { iso = v.toISOString(); } catch { iso = null; }
    return iso === null ? { t: 'note', s: ctx.L.unsupported } : { t: 's', raw: iso, s: iso, cut: false };
  }
  if (shape === 'bad') return { t: 'note', s: ctx.L.unreadable };
  if (shape !== 'array' && shape !== 'object') return { t: 'note', s: ctx.L.unsupported };
  const arr = shape === 'array';
  const keys = arr ? null : keysOf(v);
  const len = arr ? lengthOf(v) : keys && keys.length;
  if (len === null) return { t: 'note', s: ctx.L.unreadable };
  if (len === 0) return EMPTY;
  if (len > LIMITS.keys) {
    ctx.tooLarge = true;
    return { t: 'note', s: fill(arr ? ctx.L.arraySummary : ctx.L.objectSummary, { n: len }), ref: v };
  }
  if (arr) {
    const els = [];
    let scalars = true;
    for (let i = 0; i < len; i++) {
      let x;
      try { x = v[i]; } catch { scalars = false; break; }
      if (!isScalar(x)) { scalars = false; break; }
      els.push(x);
    }
    if (scalars) return { t: 'l', items: els.map((x) => scalarDesc(x, ctx)), len };
  }
  const j = compactJson(v, path, ctx);
  return { t: 'j', s: j.s, cut: j.cut, ref: v };
}

/** Equality of two non-empty descriptors: 1 / 0 / 2 (uncertain). */
function descEqual(a, b) {
  if (a.t === 'u' || a.t === 'x' || b.t === 'u' || b.t === 'x') return 2;
  if (a.t === 'note' && !a.ref) return 2;
  if (b.t === 'note' && !b.ref) return 2;
  const ra = a.t === 'j' || a.t === 'note';
  const rb = b.t === 'j' || b.t === 'note';
  if (ra || rb) return ra && rb ? deepEqual(a.ref, b.ref) : 0;
  if (a.t !== b.t) return 0;
  if (a.t === 's') return a.raw === b.raw ? 1 : 0;
  if (a.t === 'n') return a.s === b.s ? 1 : 0;
  if (a.t === 'b') return a.v === b.v ? 1 : 0;
  if (a.t === 'l') {
    if (a.len !== b.len) return 0;
    let unsure = false;
    for (let i = 0; i < a.items.length; i++) {
      const x = a.items[i];
      const y = b.items[i];
      if (x.t === 'e' || y.t === 'e') {
        if (x.t !== y.t) return 0;
        continue;
      }
      const r = descEqual(x, y);
      if (r === 0) return 0;
      if (r === 2) unsure = true;
    }
    return unsure ? 2 : 1;
  }
  return 0;
}

/** `{ kind, uncertain }` of two descriptors (QĐ 2 / 7a). */
function kindOf(b, a) {
  const eb = b.t === 'e';
  const ea = a.t === 'e';
  if (eb && ea) return { kind: 'unchanged', uncertain: false };
  if (eb) return { kind: 'added', uncertain: false };
  if (ea) return { kind: 'removed', uncertain: false };
  const r = descEqual(b, a);
  return r === 1 ? { kind: 'unchanged', uncertain: false } : { kind: 'changed', uncertain: r === 2 };
}

/** The set key of a list element (unsafe / non-finite: unique — always marked). */
function elemKey(d, i, side) {
  if (d.t === 's') return `s${d.raw}`;
  if (d.t === 'n') return `n${d.s}`;
  if (d.t === 'b') return d.v ? 'b1' : 'b0';
  if (d.t === 'e') return 'e';
  return `!${side}${i}`;
}

// --- FieldDefs ---

/**
 * Validate `fields` (QĐ 3): `path` = PathSeg[] (string key | integer index ≥ 0), 1–7 segments, a key ≤ 200 code
 * points; a string path is ONE root key. Invalid → dropped + a warning code with its index only.
 */
function readFields(fields, warnings) {
  const out = [];
  if (fields === undefined || fields === null) return out;
  if (!Array.isArray(fields)) { warnings.push('fields'); return out; }
  const total = lengthOf(fields) ?? 0;
  if (total > LIMITS.fields) warnings.push('fields');
  const n = Math.min(total, LIMITS.fields);
  for (let i = 0; i < n; i++) {
    let f;
    try { f = fields[i]; } catch { f = null; }
    const def = shapeOf(f) === 'object' ? readDef(f) : null;
    if (!def || !def.path) { warnings.push(`field:${i}`); continue; }
    out.push(def);
  }
  return out;
}

function readDef(f) {
  const get = (k) => { try { return f[k]; } catch { return undefined; } };
  let p = get('path');
  if (typeof p === 'string') p = [p];
  let path = null;
  if (Array.isArray(p)) {
    const len = lengthOf(p);
    if (len && len <= LIMITS.pathSegs) {
      path = [];
      for (let i = 0; i < len; i++) {
        let s;
        try { s = p[i]; } catch { s = undefined; }
        if (typeof s === 'string' && cpLength(s) <= LIMITS.label) path.push(s.replace(LONE, '\uFFFD'));
        else if (typeof s === 'number' && Number.isSafeInteger(s) && s >= 0) path.push(s);
        else { path = null; break; }
      }
    }
  }
  return { path, ...readOpts(get) };
}

/** label / type / options / decimals / unit / masked of a FieldDef or an item. */
function readOpts(get) {
  const o = {};
  const label = get('label');
  o.label = typeof label === 'string' && cleanLabel(label) !== '' ? cleanLabel(label) : null;
  const type = get('type');
  o.type = TYPES.includes(type) ? type : null;
  const opts = get('options');
  o.options = shapeOf(opts) === 'object' ? opts : null;
  const dec = get('decimals');
  o.decimals = typeof dec === 'number' && Number.isFinite(dec) ? Math.min(6, Math.max(0, Math.trunc(dec))) : null;
  const unit = get('unit');
  o.unit = typeof unit === 'string' ? cleanLabel(unit, LIMITS.unit) : null;
  o.masked = get('masked') === true;
  return o;
}

const segEq = (a, b) => a === b; // typed: '0' !== 0
function isPrefix(pre, path) {
  if (pre.length > path.length) return false;
  for (let i = 0; i < pre.length; i++) if (!segEq(pre[i], path[i])) return false;
  return true;
}

/** enum option label: own string value of `options[code]` */
function optionLabel(options, code) {
  if (!options) return null;
  try {
    if (!Object.hasOwn(options, code)) return null;
    const v = options[code];
    return typeof v === 'string' ? cleanLabel(v) : null;
  } catch { return null; }
}

// --- cells ---

/**
 * The display cell of one descriptor: null (empty) · `{ k: 'masked' }` · `{ k: 'text', s, cut }` ·
 * `{ k: 'note', s }` (muted fixed text) · `{ k: 'json', s, cut }` · `{ k: 'list', items: [{ s, note, m }], more }`.
 */
function cellOf(d, type, def, L, other, marks) {
  switch (d.t) {
    case 'e': return null;
    case 'm': return { k: 'masked' };
    case 'u': return { k: 'note', s: L.unsafeNumber };
    case 'x': return { k: 'note', s: L.unsupported };
    case 'note': return { k: 'note', s: d.s };
    case 'j': return { k: 'json', s: d.s, cut: d.cut };
    case 'l': {
      const items = [];
      let set = null;
      if (marks && other && other.t === 'l') set = new Set(other.items.map((x, i) => elemKey(x, i, 'o')));
      const n = Math.min(d.items.length, LIMITS.list);
      for (let i = 0; i < n; i++) {
        const x = d.items[i];
        const c = scalarText(x, type === 'enum' ? 'enum' : null, def, L, true);
        const key = elemKey(x, i, 's');
        items.push({ s: c.s, note: c.note, m: set ? (set.has(key) ? '' : marks) : '' });
      }
      return { k: 'list', items, more: d.items.length - n };
    }
    default: {
      const c = scalarText(d, type, def, L, false);
      return c.note ? { k: 'note', s: c.s } : { k: 'text', s: c.s, cut: c.cut };
    }
  }
}

/** Text of a scalar descriptor by type (QĐ 7). */
function scalarText(d, type, def, L, inList) {
  const cap = (s) => (inList ? cleanLabel(s) : s);
  if (d.t === 'e') return { s: '—', note: true, cut: false };
  if (d.t === 'u') return { s: L.unsafeNumber, note: true, cut: false };
  if (d.t === 'x') return { s: L.unsupported, note: true, cut: false };
  if (d.t === 'b') {
    const o = type === 'enum' ? optionLabel(def.options, d.v ? 'true' : 'false') : null;
    return { s: o ?? (d.v ? L.yes : L.no), note: false, cut: false };
  }
  if (d.t === 'n') {
    if (type === 'enum') return { s: optionLabel(def.options, d.s) ?? d.s, note: false, cut: false };
    if (type === 'text') return { s: d.s, note: false, cut: false };
    return { s: formatNumber(d.s, def.decimals, unitOf(type, def)), note: false, cut: false };
  }
  // string
  if (type === 'enum') {
    const o = optionLabel(def.options, d.raw);
    if (o !== null) return { s: o, note: false, cut: false };
  } else if (type === 'date') {
    const f = formatDate(d.s);
    if (f !== null) return { s: f, note: false, cut: false };
  } else if ((type === 'number' || type === 'money') && !d.cut && DECIMAL.test(d.s)) {
    return { s: formatNumber(d.s === '-0' ? '0' : d.s, def.decimals, unitOf(type, def)), note: false, cut: false };
  }
  return inList ? { s: cap(d.s), note: false, cut: false } : { s: d.s, note: false, cut: d.cut };
}

function unitOf(type, def) {
  if (def.unit !== null) return def.unit;
  return type === 'money' ? '₫' : '';
}

/** Inferred type of a row from its descriptors (after first). */
function inferType(a, b) {
  const d = a.t !== 'e' && a.t !== 'm' ? a : b;
  switch (d.t) {
    case 'n': case 'u': case 'x': return 'number';
    case 'b': return 'boolean';
    case 'l': return 'list';
    case 'j': return 'json';
    default: return 'text';
  }
}

// --- flattening (snapshots) ---

function flatten(root, ctx) {
  const map = new Map();
  const st = { left: LIMITS.nodes, stop: false };
  const tick = (n) => {
    if (st.stop) return false;
    if (st.left < n) { st.stop = true; st.left = 0; ctx.tooLarge = true; return false; }
    st.left -= n;
    return true;
  };
  const emit = (path, desc) => {
    const id = JSON.stringify(path);
    if (!map.has(id)) map.set(id, { path, desc });
  };
  /** a masked FieldDef lies strictly below `path` (the leaf there would show it) */
  const maskBelow = (path) => ctx.masks.some((m) => m.length > path.length && isPrefix(path, m));

  const walk = (v, path, anc) => {
    if (!tick(1)) return;
    const shape = shapeOf(v);
    if (shape === 'scalar') {
      if (path.length && maskBelow(path)) emit(path, MASKED);
      else if (path.length || (v !== null && v !== undefined)) emit(path, scalarDesc(v, ctx));
      return;
    }
    if ((shape === 'array' || shape === 'object') && anc.includes(v)) { emit(path, { t: 'note', s: ctx.L.cycle }); return; }
    if (shape !== 'array' && shape !== 'object') { emit(path, maskBelow(path) ? MASKED : containerLeaf(v, shape, path, ctx)); return; }
    const arr = shape === 'array';
    const keys = arr ? null : keysOf(v);
    const len = arr ? lengthOf(v) : keys && keys.length;
    if (len === null) { emit(path, { t: 'note', s: ctx.L.unreadable }); return; }
    if (len === 0) { if (path.length) emit(path, maskBelow(path) ? MASKED : EMPTY); return; }
    const below = maskBelow(path);
    if (len > LIMITS.keys || path.length >= LIMITS.depth) { emit(path, below ? MASKED : containerLeaf(v, shape, path, ctx)); return; }
    if (arr) {
      // read every element once (counted) — a list of scalars is ONE leaf (QĐ 4); masked indexes are never read
      if (!tick(len)) return;
      const els = new Array(len);
      let scalars = !below;
      for (let i = 0; i < len; i++) {
        if (ctx.isMasked(path.concat([i]))) { els[i] = MASKED; scalars = false; continue; }
        try { els[i] = { v: v[i] }; } catch { els[i] = null; scalars = false; continue; }
        if (!isScalar(els[i].v)) scalars = false;
      }
      if (scalars) { emit(path, { t: 'l', items: els.map((e) => scalarDesc(e.v, ctx)), len }); return; }
      anc.push(v);
      for (let i = 0; i < len && !st.stop; i++) {
        const p = path.concat([i]);
        if (els[i] === MASKED) { if (tick(1)) emit(p, MASKED); continue; }
        if (els[i] === null) { if (tick(1)) emit(p, { t: 'note', s: ctx.L.unreadable }); continue; }
        walk(els[i].v, p, anc);
      }
      anc.pop();
      return;
    }
    anc.push(v);
    for (let i = 0; i < len && !st.stop; i++) {
      const p = path.concat([keySeg(keys[i])]);
      if (ctx.isMasked(p)) { if (tick(1)) emit(p, MASKED); continue; }
      let child;
      try { child = v[keys[i]]; } catch { if (tick(1)) emit(p, { t: 'note', s: ctx.L.unreadable }); continue; }
      walk(child, p, anc);
    }
    anc.pop();
  };
  walk(root, [], []);
  return map;
}

// --- labels of snapshot rows ---

function segText(seg) {
  return typeof seg === 'number' ? `#${seg + 1}` : cleanText(seg, LIMITS.label).s;
}

function rowLabel(path, fields, L) {
  if (!path.length) return L.root;
  for (const f of fields) if (f.label !== null && f.path.length === path.length && isPrefix(f.path, path)) return f.label;
  let best = null;
  for (const f of fields) {
    if (f.label !== null && f.path.length < path.length && isPrefix(f.path, path) && (!best || f.path.length > best.path.length)) best = f;
  }
  const parts = [];
  if (best) parts.push(best.label);
  for (let i = best ? best.path.length : 0; i < path.length; i++) parts.push(segText(path[i]));
  const s = parts.join(' › ');
  return cpLength(s) > LIMITS.label ? `${cpSlice(s, LIMITS.label)}…` : s;
}

// --- normalize ---

/**
 * @param {{ items?: unknown, before?: unknown, after?: unknown, fields?: unknown }} input
 * @param {{ labels?: object, json?: boolean }} [opts]
 */
export function normalize(input, opts = {}) {
  const L = resolveLabels(opts.labels);
  const warnings = [];
  const ctx = { L, tooLarge: false, unsafe: false, masks: [], isMasked: () => false };
  const rows = [];
  let jsonSides = null;
  const itemsMode = !!input && input.items !== undefined && input.items !== null;

  if (itemsMode) {
    const list = input.items;
    if (!Array.isArray(list)) warnings.push('items');
    const total = Array.isArray(list) ? (lengthOf(list) ?? 0) : 0;
    const n = Math.min(total, LIMITS.keys);
    if (total > LIMITS.keys) ctx.tooLarge = true;
    const entries = opts.json ? { before: new Map(), after: new Map() } : null;
    for (let i = 0; i < n; i++) {
      let raw;
      try { raw = list[i]; } catch { raw = null; }
      if (shapeOf(raw) !== 'object') { warnings.push('item'); continue; }
      const get = (k) => { try { return raw[k]; } catch { return undefined; } };
      let key = get('key');
      if (typeof key === 'number') { const c = canonicalNumber(key); key = c.t === 'n' ? c.s : null; }
      if (typeof key !== 'string' || key === '') { warnings.push('item'); continue; }
      const seg = keySeg(key);
      const o = readOpts(get);
      const kindIn = get('kind');
      let kind = KINDS.includes(kindIn) ? kindIn : null;
      if (kindIn !== undefined && kind === null) warnings.push('kind');
      let b;
      let a;
      let bView;
      let aView;
      if (o.masked) {
        // dsuite clarification 2026-10-06: server-masked STRINGS are shown verbatim; anything else → the label
        const side = (k) => {
          const v = get(k);
          if (typeof v !== 'string') return { d: MASKED, view: { masked: true, text: L.masked } };
          const d = scalarDesc(v, ctx);
          return { d, view: { masked: true, text: v } };
        };
        const sb = side('before');
        const sa = side('after');
        b = sb.d; a = sa.d; bView = sb.view; aView = sa.view;
        if (kind === null) kind = b.t !== 'm' && a.t !== 'm' ? kindOf(b, a).kind : 'changed';
      } else {
        const leaf = (k) => {
          const v = get(k);
          const shape = shapeOf(v);
          return { v, d: shape === 'scalar' ? scalarDesc(v, ctx) : containerLeaf(v, shape, [seg], ctx) };
        };
        const lb = leaf('before');
        const la = leaf('after');
        b = lb.d; a = la.d;
        bView = lb.v === undefined ? null : { masked: false, value: lb.v };
        aView = la.v === undefined ? null : { masked: false, value: la.v };
      }
      let uncertain = false;
      if (kind === null) ({ kind, uncertain } = kindOf(b, a));
      const type = o.type ?? inferType(a, b);
      rows.push({ path: [seg], label: o.label ?? cleanLabel(key), kind, uncertain, masked: o.masked, type, b, a, def: o });
      if (entries) {
        for (const [m, view] of [[entries.before, bView], [entries.after, aView]]) {
          if (view) m.set(seg, view); // a repeated key keeps its first position, the last value wins (= a JS object)
        }
      }
    }
    if (entries) {
      jsonSides = [prettyJson(null, ctx, entries.before), prettyJson(null, ctx, entries.after)];
    }
  } else {
    const fields = readFields(input && input.fields, warnings);
    ctx.masks = fields.filter((f) => f.masked).map((f) => f.path);
    ctx.isMasked = (p) => ctx.masks.some((m) => isPrefix(m, p));
    const before = input ? input.before : undefined;
    const after = input ? input.after : undefined;
    const fa = flatten(after, ctx);
    const fb = flatten(before, ctx);
    const ids = [...fa.keys()];
    for (const id of fb.keys()) if (!fa.has(id)) ids.push(id);
    const rank = (path) => {
      for (let i = 0; i < fields.length; i++) if (isPrefix(fields[i].path, path)) return i;
      return Infinity;
    };
    const tmp = ids.map((id, i) => {
      const e = fa.get(id) || fb.get(id);
      return { id, path: e.path, i, r: rank(e.path) };
    });
    tmp.sort((x, y) => (x.r === y.r ? x.i - y.i : x.r < y.r ? -1 : 1));
    for (const t of tmp) {
      const b = fb.has(t.id) ? fb.get(t.id).desc : EMPTY;
      const a = fa.has(t.id) ? fa.get(t.id).desc : EMPTY;
      const exact = fields.find((f) => f.path.length === t.path.length && isPrefix(f.path, t.path));
      const def = exact || { label: null, type: null, options: null, decimals: null, unit: null, masked: false };
      const masked = b.t === 'm' || a.t === 'm';
      let kind;
      let uncertain = false;
      if (masked) kind = 'changed';
      else ({ kind, uncertain } = kindOf(b, a));
      rows.push({
        path: t.path, label: rowLabel(t.path, fields, L), kind, uncertain, masked,
        type: def.type ?? inferType(a, b), b: masked ? MASKED : b, a: masked ? MASKED : a, def,
      });
    }
    if (opts.json) jsonSides = [prettyJson(before, ctx), prettyJson(after, ctx)];
  }

  // counts + row budget: changed rows first, then unchanged, order kept (QĐ 10)
  const counts = { added: 0, removed: 0, changed: 0, unchanged: 0, hidden: 0, truncated: false };
  for (const r of rows) counts[r.kind]++;
  const nonUnchanged = rows.length - counts.unchanged;
  const keepChanged = Math.min(nonUnchanged, LIMITS.rows);
  let keepUnchanged = Math.min(counts.unchanged, LIMITS.rows - keepChanged);
  let keptChanged = 0;
  const kept = [];
  for (const r of rows) {
    if (r.kind === 'unchanged') { if (keepUnchanged > 0) { keepUnchanged--; kept.push(r); } } else if (keptChanged < keepChanged) {
      keptChanged++;
      kept.push(r);
    }
  }
  counts.hidden = rows.length - kept.length;

  // cells + total text budget (QĐ 10)
  let used = 0;
  let over = false;
  const budget = (c) => {
    if (!c || (c.k !== 'text' && c.k !== 'json')) return c;
    const n = cpLength(c.s);
    if (!over && used + n <= LIMITS.total) { used += n; return c; }
    over = true;
    if (n <= LIMITS.preview) return c;
    return { k: c.k, s: cpSlice(c.s, LIMITS.preview), cut: true };
  };
  const outRows = kept.map((r) => {
    const marks = r.kind === 'changed' && r.b.t === 'l' && r.a.t === 'l';
    const before = budget(cellOf(r.b, r.type, r.def, L, r.a, marks ? '-' : ''));
    const after = budget(cellOf(r.a, r.type, r.def, L, r.b, marks ? '+' : ''));
    return { id: JSON.stringify(r.path), path: r.path, label: r.label, kind: r.kind, uncertain: r.uncertain, masked: r.masked, type: r.type, before, after };
  });
  counts.truncated = ctx.tooLarge || counts.hidden > 0 || over;
  const notes = [];
  if (ctx.tooLarge) notes.push('tooLarge');
  if (over) notes.push('textBudget');
  if (ctx.unsafe) notes.push('unsafe');
  const json = jsonSides ? { before: jsonSides[0].text, beforeCut: jsonSides[0].cut, after: jsonSides[1].text, afterCut: jsonSides[1].cut } : null;
  return { rows: outRows, counts, notes, json, warnings: [...new Set(warnings)] };
}

/** The parity part of a model (what PHP Td::diffModel() returns): everything but the warnings. */
export function parityModel(m) {
  return { rows: m.rows, counts: m.counts, notes: m.notes, json: m.json };
}
