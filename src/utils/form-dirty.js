/**
 * trackFormDirty(form) — "unsaved changes" for a <form> (v0.44.0, plan v0.44.0-confirm-dirty §C, QĐ 18-24). Re-exported
 * by ./form-validation.js (subpath `./form-validation`) and index.js. No element, no CSS; the discard dialog
 * (`confirmDiscard`) loads TdModal lazily.
 *
 * Semantics:
 * - Snapshot = the ORDERED `[name, value]` list of `new FormData(form)` — native controls AND every td form-associated
 *   control (ElementInternals.setFormValue, multi-entry FormData included). Strings compare verbatim, `File`s by
 *   identity. `opts.ignore` (names or a predicate) drops fields.
 * - `dirty = manual || (interacted && snapshot ≠ baseline)`: values that change WITHOUT a user event (custom element
 *   upgrade, SSR hydrate, a remote dropdown resolving, `el.value = …` from code) never make the form dirty —
 *   `markDirty()` / `check()` for those. `interacted` = one user event of `trackFormDirty.events` from a control of the
 *   form (also `form="id"` controls outside it).
 * - `beforeunload` (default on) is armed SYNCHRONOUSLY by the first user event / markDirty() and disarmed once the form
 *   is clean again (keeps the bfcache); its handler always recomputes before blocking. A native submit of the form
 *   (not prevented) is never blocked.
 * - `dirty-change` ({ dirty }, bubbles) on the form whenever the computed state flips (user events are batched per
 *   animation frame).
 */

/**
 * The ordered snapshot of form entries.
 * @param {Iterable<[string, unknown]>|null|undefined} entries e.g. a FormData
 * @param {string[]|((name: string) => boolean)|null} [ignore]
 * @returns {Array<[string, unknown]>}
 */
export function snapshotOf(entries, ignore = null) {
  const out = [];
  if (!entries || typeof entries[Symbol.iterator] !== 'function') return out;
  const skip = ignoreTest(ignore);
  for (const entry of entries) {
    if (!entry) continue;
    const name = String(entry[0]);
    if (skip(name)) continue;
    out.push([name, entry[1]]);
  }
  return out;
}

/**
 * @param {string[]|((name: string) => boolean)|null|undefined} ignore
 * @returns {(name: string) => boolean}
 */
function ignoreTest(ignore) {
  if (Array.isArray(ignore)) {
    const set = new Set(ignore.map(String));
    return (n) => set.has(n);
  }
  if (typeof ignore === 'function') {
    return (n) => {
      try { return ignore(n) === true; } catch (err) { console.error('trackFormDirty: ignore() threw', err); return false; }
    };
  }
  return () => false;
}

/**
 * Same entries in the same order; strings by value, anything else (File) by identity.
 * @param {Array<[string, unknown]>|null} a
 * @param {Array<[string, unknown]>|null} b
 * @returns {boolean}
 */
export function sameSnapshot(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  }
  return true;
}
