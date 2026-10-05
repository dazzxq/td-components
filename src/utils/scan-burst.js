/**
 * Pure core of <td-scan-input> (v0.38.0, plan v0.38.0-scan-input QĐ 3–11). Internal module (no package subpath).
 *
 * - `createBurst()` — rhythm of the characters typed since the last scan, measured on `beforeinput` time stamps
 *   (never on `keydown.key`: Android / DataWedge send keyCode 229 through the IME). Classifies the end of a scan as
 *   `scanner` (≥ min-length characters, mean gap ≤ key-interval, no gap > 4 × key-interval), `manual`, or `paste`
 *   (paste / drop, or one batch insert holding ≥ 50 % of the characters). A batch insert (IME / "send as string" /
 *   autofill: one event, several characters) has one time stamp → never `scanner` (QĐ 5a).
 * - `normalizeScan()` — C0 / C1 controls stripped (the GS1 separator \x1D too), trimmed, cut at `maxLength` code
 *   points. php/td.php `td__scan_value()` applies the same rule (parity table SCAN_NORMALIZE_CASES).
 * - `createScanQueue()` — the app `validate` callbacks run in PARALLEL, their results are applied in `seq` order; a
 *   generation (`bump()`) drops every pending result even when the validator ignores its AbortSignal.
 */

/** [min, max, default] of the numeric attributes (integers; out of range → clamped, not a number → default). */
export const SCAN_LIMITS = Object.freeze({
  keyInterval: Object.freeze([5, 500, 40]),
  minLength: Object.freeze([1, 64, 4]),
  maxLength: Object.freeze([1, 1024, 128]),
  dedupeWindow: Object.freeze([0, 600000, 1500]),
  validateTimeout: Object.freeze([0, 600000, 10000]),
  max: Object.freeze([1, 100000, 0]),
});
/** Scans waiting for `validate` at once (QĐ 10); one more → `messages.busy`. */
export const MAX_PENDING = 16;
/** Invalid rows kept in the multiple list (the newest). */
export const MAX_INVALID_ROWS = 20;
/** Messages from `validate` are text, cut to this many code points (QĐ 9). */
export const MESSAGE_MAX = 300;
/** At most this many values in `values` / the server-rendered list (defensive bound). */
export const MAX_VALUES = 1000;

/**
 * Integer attribute value: digits only (optional sign), clamped into [min, max]; anything else → the default.
 * @param {unknown} raw
 * @param {readonly number[]} limits [min, max, default]
 * @returns {number}
 */
export function scanInt(raw, [min, max, def]) {
  const s = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (!/^-?\d{1,9}$/.test(s)) return def;
  return Math.min(max, Math.max(min, Number(s)));
}

/**
 * `terminator` attribute: space-separated `enter` / `tab`, or `none`. Unknown / empty → `enter`.
 * @param {unknown} raw
 * @returns {{ enter: boolean, tab: boolean }}
 */
export function parseTerminator(raw) {
  const tokens = typeof raw === 'string' ? raw.toLowerCase().split(/\s+/).filter(Boolean) : [];
  if (tokens.length === 1 && tokens[0] === 'none') return { enter: false, tab: false };
  const enter = tokens.includes('enter');
  const tab = tokens.includes('tab');
  return enter || tab ? { enter, tab } : { enter: true, tab: false };
}

// eslint-disable-next-line no-control-regex
const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * QĐ 7: strip C0 / C1 controls, trim, cut at `maxLength` code points (then trim the end again).
 * @param {unknown} raw
 * @param {number} [maxLength]
 * @returns {string}
 */
export function normalizeScan(raw, maxLength = SCAN_LIMITS.maxLength[2]) {
  if (raw == null) return '';
  const s = String(raw).replace(CONTROLS, '').trim();
  const cps = [...s];
  return cps.length > maxLength ? cps.slice(0, maxLength).join('').trimEnd() : s;
}

/** Parity table with php/td.php td__scan_value(): [raw, maxLength, expected]. */
export const SCAN_NORMALIZE_CASES = Object.freeze([
  ['356938035643809', 128, '356938035643809'],
  ['  3569 3803\t', 128, '3569 3803'],
  ['\x1D0104912345678904\x1D21ABC', 128, '010491234567890421ABC'],
  ['A\u0085B\u009fC\u007f', 128, 'ABC'],
  [' IMEI　', 128, 'IMEI'],
  ['\r\n\t', 128, ''],
  ['abcdef', 4, 'abcd'],
  ['ab cdef', 3, 'ab'],
  ['😀😀😀', 2, '😀😀'],
  ['Mã đơn <b>1</b>', 128, 'Mã đơn <b>1</b>'],
]);

/**
 * Values for `values` / the server list: normalised, empty and duplicate values dropped (first kept), at most
 * MAX_VALUES. A non-array → [].
 * @param {unknown} list
 * @param {number} [maxLength]
 * @returns {string[]}
 */
export function normalizeValues(list, maxLength) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list.slice(0, MAX_VALUES * 4)) {
    if (typeof raw !== 'string' && typeof raw !== 'number') continue;
    const v = normalizeScan(raw, maxLength);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= MAX_VALUES) break;
  }
  return out;
}

/**
 * Rhythm of one scan in progress (QĐ 5 / 5a / 8).
 * `add(timeStamp, kind, n)`: kind `key` (one character), `batch` (one event, n > 1 characters), `paste`
 * (paste / drop). `taint()` (composition end, deletion) caps the result at `manual`.
 * @param {{ keyInterval: number, minLength: number }} cfg
 */
export function createBurst(cfg) {
  /** @type {{ t: number, kind: string, n: number }[]} */
  let events = [];
  let tainted = false;

  const gaps = (list) => list.slice(1).map((e, i) => e.t - list[i].t);
  const fast = (list) => {
    if (list.length < Math.max(2, cfg.minLength)) return false;
    const g = gaps(list);
    const mean = g.reduce((a, b) => a + b, 0) / g.length;
    return mean <= cfg.keyInterval && g.every((x) => x <= 4 * cfg.keyInterval);
  };
  /** index where the run after the last gap > 4 × key-interval starts (0 = no such gap) */
  const tailStart = () => {
    for (let i = events.length - 1; i > 0; i--) if (events[i].t - events[i - 1].t > 4 * cfg.keyInterval) return i;
    return 0;
  };
  const chars = () => events.reduce((a, e) => a + e.n, 0);
  const hasBatch = () => events.some((e) => e.kind === 'batch');

  return {
    add(t, kind, n = 1) {
      events.push({ t: Number(t) || 0, kind, n: Math.max(1, n | 0) });
    },
    taint() { tainted = true; },
    reset() { events = []; tainted = false; },
    get empty() { return events.length === 0; },
    get size() { return events.length; },
    /** A machine-speed run (the whole burst or its tail) of ≥ min-length characters — tab / none terminators. */
    machine() {
      if (tainted || hasBatch() || events.some((e) => e.kind === 'paste')) return false;
      return fast(events.slice(tailStart()));
    },
    /** @returns {{ source: 'scanner'|'manual'|'paste', mixed: boolean }} */
    classify() {
      if (events.some((e) => e.kind === 'paste')) return { source: 'paste', mixed: false };
      const total = chars();
      if (events.some((e) => e.kind === 'batch' && e.n * 2 >= total)) return { source: 'paste', mixed: false };
      if (tainted || hasBatch() || !events.length) return { source: 'manual', mixed: false };
      const start = tailStart();
      if (start === 0) return { source: fast(events) ? 'scanner' : 'manual', mixed: false };
      return { source: 'manual', mixed: fast(events.slice(start)) };
    },
  };
}

/**
 * QĐ 11: the same value as the last accepted / pending scan within `windowMs` (0 = off).
 * @param {{ value: string, t: number } | null} last
 * @param {string} value
 * @param {number} now
 * @param {number} windowMs
 */
export function isDuplicate(last, value, now, windowMs) {
  return !!last && windowMs > 0 && last.value === value && now - last.t <= windowMs;
}

const cut = (s) => [...s].slice(0, MESSAGE_MAX).join('');

/**
 * QĐ 9: `validate` result → `{ valid, message?, value? }`. `true` / `{ valid: true }` valid; `false` invalid; a string is
 * the error message; `{ valid: false, message }`; `value` (string) replaces the normalised value (empty after
 * normalisation → ignored). Anything else (undefined, numbers, `valid` not a boolean) → invalid (fail closed).
 * @param {unknown} r
 * @param {number} [maxLength]
 */
export function normalizeResult(r, maxLength) {
  if (r === true) return { valid: true };
  if (typeof r === 'string') return r ? { valid: false, message: cut(r) } : { valid: false };
  if (r && typeof r === 'object' && typeof r.valid === 'boolean') {
    if (r.valid) {
      const v = typeof r.value === 'string' ? normalizeScan(r.value, maxLength) : '';
      return v ? { valid: true, value: v } : { valid: true };
    }
    return typeof r.message === 'string' && r.message ? { valid: false, message: cut(r.message) } : { valid: false };
  }
  return { valid: false };
}

/**
 * Ordered validate queue (QĐ 10). `submit({ seq, value, source, run, timeoutMs })` starts `run(value, { source, signal })`
 * at once (null = valid); `onApply(entry)` receives the entries in submission order once settled, `entry.result` =
 * normalizeResult(...) + `kind` (`result` | `error` | `timeout`) + `error` (the thrown value, for the caller to log).
 * `bump()` aborts + forgets everything (results of the old generation are dropped). `cancel(entry)` aborts one entry,
 * which is then skipped.
 * @param {{ onApply: (entry: object) => void, maxLength?: number }} opts
 */
export function createScanQueue({ onApply, maxLength }) {
  let gen = 0;
  /** @type {object[]} entries in seq order, not yet applied */
  let order = [];

  const flush = () => {
    while (order.length && order[0].done) {
      const e = order.shift();
      if (!e.cancelled) onApply(e);
    }
  };

  return {
    get gen() { return gen; },
    /** waiting entries (not cancelled) */
    get size() { return order.filter((e) => !e.cancelled).length; },
    pending() { return order.filter((e) => !e.cancelled); },
    submit({ seq, value, source, run, timeoutMs = 0, data }) {
      const controller = new AbortController();
      const entry = { seq, value, source, data, gen, controller, done: false, cancelled: false, result: null };
      order.push(entry);
      let timer = 0;
      const settle = (out) => {
        if (timer) clearTimeout(timer);
        if (entry.done || entry.gen !== gen) return; // late (timeout / cancel already) or an old generation
        entry.done = true;
        if (out.kind === 'result') entry.result = { ...normalizeResult(out.v, maxLength), kind: 'result' };
        else entry.result = { valid: false, kind: out.kind, error: out.error };
        flush();
      };
      if (typeof run !== 'function') {
        Promise.resolve().then(() => settle({ kind: 'result', v: true }));
        return entry;
      }
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          timer = 0;
          controller.abort();
          settle({ kind: 'timeout' });
        }, timeoutMs);
      }
      let r;
      try {
        r = run(value, { source, signal: controller.signal });
      } catch (error) {
        Promise.resolve().then(() => settle({ kind: 'error', error }));
        return entry;
      }
      Promise.resolve(r).then((v) => settle({ kind: 'result', v }), (error) => settle({ kind: 'error', error }));
      return entry;
    },
    cancel(entry) {
      if (!entry || entry.done || entry.cancelled) return;
      entry.cancelled = true;
      entry.done = true;
      entry.controller.abort();
      flush();
    },
    bump() {
      gen++;
      for (const e of order) e.controller.abort();
      order = [];
    },
  };
}
