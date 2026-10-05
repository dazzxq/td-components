/**
 * v0.39.0 (plan v0.39.0-filters-range QĐ 11–16) — pure model of `<td-filter-chips>`: item normalisation and the chip
 * link policy, shared by the component, its SSR gate and the node / PHP parity tests. Internal module (no package
 * subpath). php/td.php `td__filter_items()` / `td__media_url()` implement the same rules.
 *
 * Item (normalised): `{ id, key, label, value, removable, href? }` — all strings except `removable` (boolean).
 * - `key` (required), `label` (default: the key), `value` (required), `id` (default: the key): a string or a finite
 *   number (→ `String(n)`); anything else (arrays, objects, booleans, null value) → the item is dropped. A multi-value
 *   filter is one item per value (same `key`, different `id`).
 * - Control characters (U+0000–U+001F, U+007F–U+009F) are removed; then cut to LIMITS code points. An empty label / id
 *   falls back to the key; an empty key drops the item; an empty value is allowed.
 * - Duplicate `id` → suffix `-2`, `-3`… (the first keeps it; a per-base counter keeps it amortised O(n)).
 * - `removable` is true unless exactly `false`. `href` (removable items only) passes `cleanHref()`; refused → absent.
 * - Bounded work (review SEC-1): at most MAX_ITEMS chips (the rest dropped, `capped`); a raw string is cut to 4 × its limit
 *   (UTF-16 units) BEFORE the control-character regex / code-point split.
 * @module utils/filter-chips-model
 */

export const LIMITS = Object.freeze({ key: 200, id: 200, label: 200, value: 500 });
/** Hard cap on chips (JS = PHP `td__filter_items`). */
export const MAX_ITEMS = 200;

/**
 * Chip link verdicts shared by the JS and PHP tests (review SEC-2): `[href, JS on https://shop.example/list/, PHP]`
 * (`null` = refused). JS keeps a link only when it resolves to the PAGE ORIGIN; PHP cannot know the origin, so it keeps
 * RELATIVE links only (no scheme, no `//`). Both refuse backslashes.
 */
export const HREF_CASES = Object.freeze([
  ['?q=iphone&page=1', '?q=iphone&page=1', '?q=iphone&page=1'],
  ['/san-pham?status=selling', '/san-pham?status=selling', '/san-pham?status=selling'],
  ['x/y', 'x/y', 'x/y'],
  ['#bo-loc', '#bo-loc', '#bo-loc'],
  ['  /a\tb  ', '/ab', '/ab'],
  ['https://shop.example/x', 'https://shop.example/x', null],
  ['https://evil.example/x', null, null],
  ['http://shop.example/x', null, null],
  ['//evil.example/x', null, null],
  ['/\\evil.example/x', null, null],
  ['\\\\evil.example', null, null],
  ['https:evil.example', null, null],
  ['javascript:alert(1)', null, null],
  ['java\tscript:alert(1)', null, null],
  ['data:text/html,x', null, null],
  ['mailto:a@b.vn', null, null],
  ['blob:https://shop.example/1', null, null],
]);
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * @param {unknown} v
 * @param {number} max code points
 * @returns {string|null} null when the type is not allowed
 */
export function cleanText(v, max) {
  let s;
  if (typeof v === 'string') s = v;
  else if (typeof v === 'number' && Number.isFinite(v)) s = String(v);
  else return null;
  if (s.length > max * 4) s = s.slice(0, max * 4); // bound the work first (SEC-1)
  return Array.from(s.replace(CONTROL, '')).slice(0, max).join('');
}

/**
 * The chip link policy (QĐ 13, review SEC-2 — one policy for JS and PHP): tab / CR / LF removed, C0 controls + spaces
 * trimmed (as the URL parser does); no backslash, no protocol-relative `//host`; the URL resolved against the page must
 * be http(s) on the PAGE ORIGIN (relative paths, `?query`, `#hash`, or an absolute URL of the same origin). A removal
 * link never leaves the site. (PHP keeps relative URLs only — it cannot know the origin.)
 * @param {unknown} v
 * @param {{ baseURI?: string, origin?: string }} [opts] injectable for tests (default: document.baseURI, location.origin)
 * @returns {string} the cleaned href (as written, not resolved), or '' when refused
 */
export function cleanHref(v, opts = {}) {
  if (typeof v !== 'string' || v.length > 8192 * 4) return '';
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\t\r\n]+/g, '').replace(/^[\u0000- ]+|[\u0000- ]+$/g, '');
  if (!s || s.length > 8192 || s.includes('\\') || s.startsWith('//')) return '';
  // a scheme is only accepted as an absolute `http(s)://` URL (`https:evil.example` is scheme-relative — refused)
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:\/\//i.test(s)) return '';
  const base = typeof opts.baseURI === 'string' ? opts.baseURI : (typeof document !== 'undefined' && document.baseURI) || '';
  let origin = typeof opts.origin === 'string' ? opts.origin : (typeof location !== 'undefined' && location.origin) || '';
  let u;
  try {
    u = base ? new URL(s, base) : new URL(s);
    if (!origin && base) origin = new URL(base).origin;
  } catch {
    return '';
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
  return origin && u.origin === origin ? s : '';
}

/**
 * @param {unknown} list
 * @param {{ baseURI?: string, origin?: string }} [opts] for cleanHref (tests)
 * @returns {{ items: Array<{id: string, key: string, label: string, value: string, removable: boolean, href?: string}>,
 *   dropped: number, renamed: number, capped: boolean }}
 */
export function normalizeItems(list, opts = {}) {
  const items = [];
  let dropped = 0;
  let renamed = 0;
  let capped = false;
  const used = new Set();
  /** base id → next suffix to try (amortised O(n) — SEC-1) */
  const next = new Map();
  for (const raw of Array.isArray(list) ? list : []) {
    if (items.length >= MAX_ITEMS) { capped = true; break; }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { dropped++; continue; }
    const key = cleanText(raw.key, LIMITS.key);
    const value = cleanText(raw.value, LIMITS.value);
    const label = raw.label == null ? key : cleanText(raw.label, LIMITS.label);
    const id0 = raw.id == null ? key : cleanText(raw.id, LIMITS.id);
    if (!key || value === null || label === null || id0 === null) { dropped++; continue; }
    const base = id0 || key;
    let id = base;
    if (used.has(id)) {
      let n = next.get(base) || 2;
      while (used.has(`${base}-${n}`)) n++;
      id = `${base}-${n}`;
      next.set(base, n + 1);
      renamed++;
    }
    used.add(id);
    const removable = raw.removable !== false;
    const item = { id, key, label: label || key, value, removable };
    if (removable && raw.href != null) {
      const href = cleanHref(raw.href, opts);
      if (href) item.href = href;
    }
    items.push(item);
  }
  return { items, dropped, renamed, capped };
}

/** `{name}` placeholders (labels); a function replacement keeps `$&` in the data literal. */
export function fill(template, vars) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(vars, k) ? String(vars[k]) : m));
}
