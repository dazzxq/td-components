/**
 * v0.57.2: the pure parts of a pagination info text — shared by td-pagination (`formatInfo`) and td-table
 * (`formatPageInfo`).
 */

/**
 * The 1-based range of items shown on a page (`0-0` for an empty list).
 * @param {number} total
 * @param {number} perPage
 * @param {number} page - already clamped to [1, totalPages]
 * @returns {{ from: number, to: number }}
 */
export function pageRange(total, perPage, page) {
  if (total === 0) return { from: 0, to: 0 };
  return { from: (page - 1) * perPage + 1, to: Math.min(page * perPage, total) };
}

/**
 * The text of a per-instance text hook. The result is used as TEXT by the caller (textContent / escaped), never as
 * HTML. A non-string result or a throw → null (= the caller's default text) + `warn(message)`; the caller decides
 * how often it warns.
 * @param {Function|null} fn
 * @param {object} ctx
 * @param {(msg: string) => void} warn
 * @param {string} name - e.g. 'td-table: formatPageInfo'
 * @returns {string|null}
 */
export function hookText(fn, ctx, warn, name) {
  if (typeof fn !== 'function') return null;
  let v;
  try {
    v = fn(ctx);
  } catch (err) {
    warn(`${name} threw — the default text is used. ${err && err.message ? err.message : String(err)}`);
    return null;
  }
  if (typeof v === 'string') return v;
  warn(`${name} must return a string — the default text is used.`);
  return null;
}
