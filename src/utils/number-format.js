/**
 * Number rules of <td-number-input> (v0.30.0, plan docs/internal/plans/v0.30.0-number-repeater.md M1) — pure, no DOM;
 * `node --test` covers every rule. The component is only a DOM layer on top of it.
 *
 * Values are CANONICAL decimal strings: `-?(0|[1-9][0-9]*)(\.[0-9]+)?` — `.` as the decimal point, no grouping, no
 * unit, at most MAX_DIGITS digits — and every computation is BigInt on a 10^scale grid: a value never goes through
 * `Number` (exact at any size up to 30 digits).
 *
 * Shared `opts`: `{ group = '.', decimal = ',', decimals = 0, negative = false, prefix?, suffix? }` (Vietnamese
 * convention by default; the separators are attributes — the kit reads no site setting).
 */

/** Hard limit of digits (integer + fraction) a value may have. */
export const MAX_DIGITS = 30;

/** Digit blocks normalised to ASCII: full-width (U+FF10), Arabic-Indic (U+0660), extended Arabic-Indic (U+06F0). */
const DIGIT_BASES = [0xFF10, 0x0660, 0x06F0];
const CANONICAL = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;
/** Units stripped by parseLoose (longest first), plus the component's own prefix / suffix. */
const UNITS = ['vnđ', 'vnd', '₫', 'đ', '$', '€', '%'];

/**
 * @param {string} ch - one character
 * @returns {string|null} the ASCII digit ('0'–'9') for an ASCII / full-width / Arabic-Indic digit, else null
 */
export function asciiDigit(ch) {
  if (typeof ch !== 'string' || !ch) return null;
  const c = ch.codePointAt(0);
  if (c >= 48 && c <= 57) return String.fromCharCode(c);
  for (const base of DIGIT_BASES) if (c >= base && c <= base + 9) return String(c - base);
  return null;
}

/** @param {*} d @returns {number} decimals clamped to 0..10 (invalid → 0) */
function dec(d) {
  const n = Number(d);
  return Number.isInteger(n) && n >= 0 ? Math.min(n, 10) : 0;
}

/** @param {string} v canonical @returns {string} without the sign of a zero */
function noNegZero(v) {
  return /^-0(\.0+)?$/.test(v) ? v.slice(1) : v;
}

/**
 * The ONLY gate before any format / arithmetic: the canonical form, at most MAX_DIGITS digits and at most `decimals`
 * fraction digits (never rounded / cut — refused). `-0` → `0`.
 * @param {*} str
 * @param {number} decimals
 * @returns {string|null}
 */
export function parseCanonical(str, decimals) {
  if (typeof str !== 'string') return null;
  const m = CANONICAL.exec(str);
  if (!m) return null;
  const frac = m[2] ? m[2].length - 1 : 0;
  if (frac > dec(decimals)) return null;
  if (m[1].length + frac > MAX_DIGITS) return null;
  return noNegZero(str);
}

/**
 * Display string of a canonical value: integer part grouped by 3 with `group`, `decimal` before the fraction. No
 * rounding, no padding (`decimals` is a maximum: the value keeps the digits it has).
 * @param {string} canonical
 * @param {{ group?: string, decimal?: string }} [opts]
 * @returns {string}
 */
export function format(canonical, opts = {}) {
  if (!canonical) return '';
  const { group = '.', decimal = ',' } = opts;
  const neg = canonical.startsWith('-');
  const [int, frac] = (neg ? canonical.slice(1) : canonical).split('.');
  return (neg ? '-' : '') + groupInt(int, group) + (frac != null ? decimal + frac : '');
}

/** @param {string} int @param {string} group */
function groupInt(int, group) {
  if (!group || int.length <= 3) return int;
  let out = '';
  const head = int.length % 3 || 3;
  out = int.slice(0, head);
  for (let i = head; i < int.length; i += 3) out += group + int.slice(i, i + 3);
  return out;
}

/**
 * Normalise what the browser put in the field (typing, IME, Android, autofill — the safety net where `beforeinput`
 * cannot be cancelled) and map the caret.
 * 1. Keep digits (asciiDigit), the FIRST `decimal` (when decimals > 0), `-` / U+2212 only at the start and only when
 *    `negative`; drop everything else (group characters too — format() adds them back). `k` = meaningful characters
 *    (digits, decimal, minus) before `caret`.
 * 2. Drop leading zeros of the integer part (one `0` kept before the decimal / when all zero; a decimal typed first
 *    gets a `0`), `k` adjusted.
 * 3. Cut the fraction past `decimals` and the digits past MAX_DIGITS.
 * 4. display = formatted (a trailing decimal kept while typing: `12,`); caret right after the k-th meaningful
 *    character. value: canonical (`12,` → `12`); only `-` and / or the decimal → `''` + bad.
 * @param {string} raw
 * @param {number} caret
 * @param {{ group?: string, decimal?: string, decimals?: number, negative?: boolean }} [opts]
 * @returns {{ display: string, caret: number, value: string, bad: boolean }}
 */
export function edit(raw, caret, opts = {}) {
  const { group = '.', decimal = ',', negative = false } = opts;
  const decimals = dec(opts.decimals);
  const str = String(raw ?? '');
  /** @type {Array<{ ch: string, pos: number, kind: 'sign'|'int'|'dec'|'frac' }>} */
  let toks = [];
  let seenDec = false;
  let i = 0;
  for (const ch of str) {
    const pos = i;
    i += ch.length;
    const d = asciiDigit(ch);
    if (d != null) toks.push({ ch: d, pos, kind: seenDec ? 'frac' : 'int' });
    else if (ch === decimal && decimals > 0 && !seenDec) { seenDec = true; toks.push({ ch: decimal, pos, kind: 'dec' }); }
    else if ((ch === '-' || ch === '−') && negative && toks.length === 0) toks.push({ ch: '-', pos, kind: 'sign' });
  }
  // 2. leading zeros
  const ints = toks.filter((t) => t.kind === 'int');
  const firstNonZero = ints.findIndex((t) => t.ch !== '0');
  const dropN = firstNonZero < 0 ? Math.max(0, ints.length - 1) : firstNonZero;
  if (dropN) {
    const drop = new Set(ints.slice(0, dropN));
    toks = toks.filter((t) => !drop.has(t));
  }
  const decTok = toks.find((t) => t.kind === 'dec');
  if (decTok && !toks.some((t) => t.kind === 'int') && toks.some((t) => t.kind === 'frac')) {
    toks.splice(toks.indexOf(decTok), 0, { ch: '0', pos: decTok.pos, kind: 'int' });
  }
  // 3. limits
  let fracCount = 0;
  toks = toks.filter((t) => t.kind !== 'frac' || ++fracCount <= decimals);
  let digits = toks.filter((t) => t.kind === 'int' || t.kind === 'frac').length;
  while (digits > MAX_DIGITS) {
    let last = -1;
    toks.forEach((t, j) => { if (t.kind === 'int' || t.kind === 'frac') last = j; });
    toks.splice(last, 1);
    digits -= 1;
  }
  const k = toks.filter((t) => t.pos < caret).length;
  // 4. display + caret map
  const sign = toks.some((t) => t.kind === 'sign');
  const int = toks.filter((t) => t.kind === 'int').map((t) => t.ch).join('');
  const frac = toks.filter((t) => t.kind === 'frac').map((t) => t.ch).join('');
  const hasDec = toks.some((t) => t.kind === 'dec');
  let display = '';
  const after = []; // display index right after each meaningful token, in order
  if (sign) { display += '-'; after.push(display.length); }
  const head = int.length % 3 || 3;
  for (let j = 0; j < int.length; j += 1) {
    if (group && j >= head && (j - head) % 3 === 0) display += group;
    display += int[j];
    after.push(display.length);
  }
  if (hasDec) { display += decimal; after.push(display.length); }
  for (const ch of frac) { display += ch; after.push(display.length); }
  const outCaret = k <= 0 ? 0 : after[Math.min(k, after.length) - 1];
  const bad = toks.length > 0 && !int && !frac;
  const value = int || frac ? noNegZero((sign ? '-' : '') + (int || '0') + (frac ? `.${frac}` : '')) : '';
  return { display, caret: outCaret, value, bad };
}

/**
 * Paste / autofill rule: the WHOLE text, exact, refused rather than guessed (money must never change silently).
 * Digits normalised, U+2212 → `-`, every whitespace removed, ONE unit prefix and / or suffix stripped (case-insensitive:
 * ₫ đ vnd vnđ $ € % + the component prefix / suffix), then `.` / `,` classified:
 * - both present: the LAST one is the decimal, the other the group;
 * - one kind, ≥ 2 times: group;
 * - one kind, once, followed by exactly 3 digits: group when decimals < 3, else the component's convention (the
 *   component decimal → decimal, otherwise group);
 * - one kind, once, otherwise: decimal.
 * Groups must be valid (first 1–3 digits, then exactly 3). More fraction digits than `decimals`, a negative when not
 * `negative`, more than MAX_DIGITS digits → null.
 * @param {string} text
 * @param {{ decimal?: string, decimals?: number, negative?: boolean, prefix?: string, suffix?: string }} [opts]
 * @returns {string|null} canonical value
 */
export function parseLoose(text, opts = {}) {
  const { decimal = ',', negative = false } = opts;
  const decimals = dec(opts.decimals);
  let s = '';
  for (const ch of String(text ?? '')) {
    const d = asciiDigit(ch);
    if (d != null) s += d;
    else if (ch === '−') s += '-';
    else if (!/\s/.test(ch)) s += ch;
  }
  const units = [...UNITS, opts.prefix, opts.suffix].filter((u) => typeof u === 'string' && u.trim())
    .map((u) => u.replace(/\s+/g, '').toLowerCase()).sort((a, b) => b.length - a.length);
  const lower = () => s.toLowerCase();
  for (const u of units) if (lower().startsWith(u)) { s = s.slice(u.length); break; }
  for (const u of units) if (lower().endsWith(u)) { s = s.slice(0, s.length - u.length); break; }
  if (!/^-?[0-9.,]+$/.test(s)) return null;
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  if (!/[0-9]/.test(s)) return null;
  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;
  let groupCh = null;
  let decCh = null;
  if (dots && commas) {
    decCh = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    groupCh = decCh === '.' ? ',' : '.';
  } else if (dots + commas >= 2) {
    groupCh = dots ? '.' : ',';
  } else if (dots + commas === 1) {
    const sep = dots ? '.' : ',';
    const tail = s.slice(s.indexOf(sep) + 1);
    if (/^[0-9]{3}$/.test(tail)) {
      if (decimals < 3) groupCh = sep;
      else if (sep === decimal) decCh = sep;
      else groupCh = sep;
    } else {
      decCh = sep;
    }
  }
  let intPart = s;
  let frac = '';
  if (decCh) {
    const at = s.indexOf(decCh);
    if (at !== s.lastIndexOf(decCh)) return null;
    intPart = s.slice(0, at);
    frac = s.slice(at + 1);
    if (!/^[0-9]*$/.test(frac)) return null;
  }
  if (groupCh && intPart.includes(groupCh)) {
    const chunks = intPart.split(groupCh);
    if (!/^[0-9]{1,3}$/.test(chunks[0]) || chunks.slice(1).some((c) => !/^[0-9]{3}$/.test(c))) return null;
    intPart = chunks.join('');
  }
  if (!/^[0-9]*$/.test(intPart)) return null;
  if (!intPart && !frac) return null;
  if (frac.length > decimals) return null;
  if (neg && !negative) return null;
  intPart = intPart.replace(/^0+(?=[0-9])/, '') || '0';
  if (intPart.length + frac.length > MAX_DIGITS) return null;
  return noNegZero((neg ? '-' : '') + intPart + (frac ? `.${frac}` : ''));
}

// --- arithmetic (BigInt on a 10^scale grid) ---

/** @param {string} v canonical @returns {number} fraction digits */
const scaleOf = (v) => (v && v.includes('.') ? v.length - v.indexOf('.') - 1 : 0);

/** @param {string} v canonical @param {number} scale @returns {bigint} */
function toBig(v, scale) {
  const neg = v.startsWith('-');
  const [int, frac = ''] = (neg ? v.slice(1) : v).split('.');
  const n = BigInt(int + frac.padEnd(scale, '0'));
  return neg ? -n : n;
}

/** @param {bigint} n @param {number} scale @returns {string} canonical, trailing fraction zeros trimmed */
function fromBig(n, scale) {
  const neg = n < 0n;
  let s = (neg ? -n : n).toString();
  if (scale > 0) {
    s = s.padStart(scale + 1, '0');
    const int = s.slice(0, -scale);
    const frac = s.slice(-scale).replace(/0+$/, '');
    s = frac ? `${int}.${frac}` : int;
  }
  return noNegZero((neg ? '-' : '') + s);
}

/** @param {...string} vals @returns {number} */
const scaleFor = (...vals) => Math.max(0, ...vals.filter(Boolean).map(scaleOf));

/**
 * @param {string} a canonical
 * @param {string} b canonical
 * @returns {-1|0|1}
 */
export function compare(a, b) {
  const sc = scaleFor(a, b);
  const x = toBig(a, sc);
  const y = toBig(b, sc);
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * @param {string} v canonical
 * @param {string|null} [min]
 * @param {string|null} [max]
 * @returns {string} v, or the bound it passed
 */
export function clamp(v, min, max) {
  if (min && compare(v, min) < 0) return min;
  if (max && compare(v, max) > 0) return max;
  return v;
}

/**
 * Is `v - base` an integral multiple of `stepVal`?
 * @param {string} v
 * @param {string} stepVal - > 0
 * @param {string} [base] - default 0
 * @returns {boolean}
 */
export function stepAligned(v, stepVal, base = '0') {
  const sc = scaleFor(v, stepVal, base);
  const s = toBig(stepVal, sc);
  if (s <= 0n) return true;
  return (toBig(v, sc) - toBig(base || '0', sc)) % s === 0n;
}

/**
 * ↑ / ↓ like native `stepUp(n)` / `stepDown(n)`: an aligned value moves by `dir` steps; a misaligned one snaps to the
 * next aligned value in that direction; always clamped to [min, max]. Empty → clamp(0, min, max).
 * @param {string} v - canonical or ''
 * @param {number} dir - signed number of steps (±1, ±10)
 * @param {{ step?: string, base?: string|null, min?: string|null, max?: string|null }} [o]
 * @returns {string}
 */
export function step(v, dir, o = {}) {
  const { min = null, max = null } = o;
  if (!v) return clamp('0', min, max);
  const stepVal = o.step || '1';
  const base = o.base || '0';
  const sc = scaleFor(v, stepVal, base);
  const s = toBig(stepVal, sc);
  const b = toBig(base, sc);
  const x = toBig(v, sc);
  const off = x - b;
  const r = ((off % s) + s) % s; // non-negative remainder
  let next;
  if (r === 0n) next = x + BigInt(dir) * s;
  else next = dir > 0 ? x - r + s : x - r;
  return clamp(fromBig(next, sc), min, max);
}
