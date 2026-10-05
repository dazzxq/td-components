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
 * - Duplicate `id` → suffix `-2`, `-3`… (the first keeps it).
 * - `removable` is true unless exactly `false`. `href` (removable items only) passes `cleanHref()`; refused → absent.
 * @module utils/filter-chips-model
 */
import { safeLinkUrl } from './media-url.js';

export const LIMITS = Object.freeze({ key: 200, id: 200, label: 200, value: 500 });
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
  return Array.from(s.replace(CONTROL, '')).slice(0, max).join('');
}

/**
 * The chip link policy (one policy for JS and PHP, QĐ 13): tab / CR / LF removed, C0 controls + spaces trimmed (as the
 * URL parser does), then `safeLinkUrl` — https, http only on an http page, relative input resolving to those. Never
 * javascript: / data: / mailto: / tel: / blob:.
 * @param {unknown} v
 * @param {{ baseURI?: string, protocol?: string }} [opts] injectable for tests
 * @returns {string} the cleaned href (as written, not resolved), or '' when refused
 */
export function cleanHref(v, opts = {}) {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\t\r\n]+/g, '').replace(/^[\u0000- ]+|[\u0000- ]+$/g, '');
  if (!s || s.length > 8192) return '';
  return safeLinkUrl(s, opts) ? s : '';
}

/**
 * @param {unknown} list
 * @param {{ baseURI?: string, protocol?: string }} [opts] for cleanHref (tests)
 * @returns {{ items: Array<{id: string, key: string, label: string, value: string, removable: boolean, href?: string}>,
 *   dropped: number, renamed: number }}
 */
export function normalizeItems(list, opts = {}) {
  const items = [];
  let dropped = 0;
  let renamed = 0;
  const used = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { dropped++; continue; }
    const key = cleanText(raw.key, LIMITS.key);
    const value = cleanText(raw.value, LIMITS.value);
    const label = raw.label == null ? key : cleanText(raw.label, LIMITS.label);
    const id0 = raw.id == null ? key : cleanText(raw.id, LIMITS.id);
    if (!key || value === null || label === null || id0 === null) { dropped++; continue; }
    const base = id0 || key;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    if (id !== base) renamed++;
    used.add(id);
    const removable = raw.removable !== false;
    const item = { id, key, label: label || key, value, removable };
    if (removable && raw.href != null) {
      const href = cleanHref(raw.href, opts);
      if (href) item.href = href;
    }
    items.push(item);
  }
  return { items, dropped, renamed };
}

/** `{name}` placeholders (labels); a function replacement keeps `$&` in the data literal. */
export function fill(template, vars) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(vars, k) ? String(vars[k]) : m));
}
