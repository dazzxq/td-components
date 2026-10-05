/**
 * Pure model of `<td-rating>` and PHP `td_rating()` — v0.50.0 (plan v0.50.0-rating-carousel R2 / R3 / R5 / R6). Internal
 * module (no package subpath). PHP (`php/td.php` td__rating_*) mirrors every function byte for byte — no `Intl`: the
 * Vietnamese number format is written out here (shared fixtures test/ssr/rating.fixtures.json).
 */

/** Default texts (`TdRating.labels`; PHP prints these — R13: one static set per site). */
export const RATING_LABELS = Object.freeze({
  value: '{value} trên {max} sao',
  count: '({count} đánh giá)',
  none: 'Chưa có đánh giá',
});

export const MAX_DEFAULT = 5;
const VALUE_RE = /^\d+(\.\d+)?$/;

/**
 * A rating value: a plain decimal string (`/^\d+(\.\d+)?$/`, ≤ 16 characters) or a finite number (negative → 0).
 * Anything else → null (= no rating, R6).
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parseValue(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.max(0, raw) : null;
  if (typeof raw !== 'string' || raw.length > 16 || !VALUE_RE.test(raw)) return null;
  return Number(raw);
}

/**
 * The `value` attribute printed for a NUMBER (JS property setter, PHP int / float): ≥ 0, rounded to 4 decimals, no
 * trailing zeros. Non-finite → null.
 * @param {number} n
 * @returns {string|null}
 */
export function formatValueAttr(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  if (n >= 1e15) return null; // beyond the 16-character attribute
  const k = Math.round(Math.max(0, n) * 10000); // integer arithmetic below: PHP prints the same digits
  const frac = String(k % 10000).padStart(4, '0').replace(/0+$/, '');
  return `${Math.floor(k / 10000)}${frac ? `.${frac}` : ''}`;
}

/**
 * `max`: integer 1–10 (string of digits or integer number); absent / '' → 5; anything else → 5 + `invalid`.
 * @param {unknown} raw
 * @returns {{ max: number, invalid: boolean }}
 */
export function parseMax(raw) {
  if (raw == null || raw === '') return { max: MAX_DEFAULT, invalid: false };
  let n = null;
  if (typeof raw === 'number') n = Number.isInteger(raw) ? raw : null;
  else if (typeof raw === 'string' && /^\d{1,2}$/.test(raw)) n = Number(raw);
  return n !== null && n >= 1 && n <= 10 ? { max: n, invalid: false } : { max: MAX_DEFAULT, invalid: true };
}

/**
 * `count`: an integer ≥ 0 (digit string ≤ 15 characters, or a safe integer number) → its canonical digit string; else null.
 * @param {unknown} raw
 * @returns {string|null}
 */
export function parseCount(raw) {
  if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw >= 0 ? String(raw) : null;
  if (typeof raw !== 'string' || !/^\d{1,15}$/.test(raw)) return null;
  return raw.replace(/^0+(?=\d)/, '');
}

/**
 * R2: the value the STARS show — `half`: nearest half star (a half rounds up); `exact`: the value itself.
 * @param {number} v
 * @param {'half'|'exact'} precision
 */
export function displayValue(v, precision) {
  return precision === 'exact' ? v : Math.round(v * 2) / 2;
}

/**
 * R2 / R5: per star `{ step, exact }` — `step` = the fill in 10 % steps (the `data-fill` attribute, the no-JS / SSR
 * path; `half` only 0 / 50 / 100); `exact` = the CSSOM refinement (`'37%'`) for a partly filled star in `exact`
 * precision, else null.
 * @param {number} v the clamped value
 * @param {number} max
 * @param {'half'|'exact'} precision
 * @returns {Array<{ step: number, exact: string|null }>}
 */
export function starFills(v, max, precision) {
  const shown = displayValue(v, precision);
  const out = [];
  for (let i = 0; i < max; i++) {
    const f = Math.min(1, Math.max(0, shown - i));
    const step = Math.round(f * 10) * 10;
    const exact = precision === 'exact' && f > 0 && f < 1 ? `${Math.round(f * 10000) / 100}%` : null;
    out.push({ step, exact });
  }
  return out;
}

/**
 * R3: one decimal, comma separator, ",0" dropped (4 → "4", 4.26 → "4,3"). Integer arithmetic on round(v × 10) so PHP
 * rounds the same way.
 * @param {number} v ≥ 0
 */
export function formatDecimal(v) {
  const n = Math.round(v * 10);
  const int = Math.floor(n / 10);
  const dec = n % 10;
  return dec ? `${int},${dec}` : String(int);
}

/**
 * R3: thousands separated by "." (from the canonical digit string — no float).
 * @param {string} digits
 */
export function formatCount(digits) {
  return digits.replace(/\B(?=(\d{3})+$)/g, '.');
}

/**
 * Fill `{name}` placeholders in ONE pass (a value is never re-expanded; unknown names stay). Text only — the render
 * layer escapes (textContent / Td::e).
 * @param {string} tpl
 * @param {Record<string, string>} vars
 */
export function fillTemplate(tpl, vars) {
  return String(tpl).replace(/\{([a-z]+)\}/g, (m, k) => (Object.hasOwn(vars, k) ? String(vars[k]) : m));
}

/**
 * Everything the markup needs, from the host's attribute strings (or PHP options).
 * @param {{ value?: unknown, max?: unknown, precision?: unknown, count?: unknown }} a
 * @param {{ value: string, count: string, none: string }} [labels]
 */
export function ratingModel(a, labels = RATING_LABELS) {
  const { max, invalid } = parseMax(a.max);
  const precision = a.precision === 'exact' ? 'exact' : 'half';
  const raw = parseValue(a.value);
  if (raw === null) {
    return { empty: true, max, maxInvalid: invalid, precision, noneText: labels.none, stars: [], label: null, valueText: null, countText: null };
  }
  const v = Math.min(raw, max);
  const valueText = formatDecimal(v);
  const count = parseCount(a.count);
  return {
    empty: false,
    max,
    maxInvalid: invalid,
    precision,
    value: v,
    valueText,
    label: fillTemplate(labels.value, { value: valueText, max: String(max) }),
    countText: count === null ? null : fillTemplate(labels.count, { count: formatCount(count) }),
    stars: starFills(v, max, precision),
    noneText: null,
  };
}
