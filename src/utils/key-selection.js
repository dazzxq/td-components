/**
 * Selection model of td-table row selection (v0.37.0, plan v0.37.0-table-row-selection QĐ 3–4, 10–15). Pure (no DOM),
 * internal (no subpath export); unit-tested by key-selection.test.js.
 *
 * Identity: a key is valid when it is a non-empty string, a finite number or a bigint; its identity is `String(key)`
 * (1 and "1" are ONE row — server APIs mix the types). The ORIGINAL value first seen while selected is kept and
 * returned (dcms2 `rowIdKey` lesson), so `keys()` hands back numbers / strings / bigints as the app gave them.
 *
 * Two tiers (review R1-2):
 * - USER (`userToggle`, `userRange`, `userPage`) — the `max` cap applies: an add past it stops there and reports
 *   `limited: true`. `exclusive` (single mode) only goes through `userToggle`.
 * - API (`replace`, `add`, `remove`, `clear`) — NEVER reads `max` (the app is the source of authority); a selection
 *   over the cap is kept as it is.
 * Every change returns `{ added, removed }` (originals, in change order); the user tier adds `limited`.
 */

/**
 * Identity of a row key, or null when the key is not valid.
 * @param {unknown} key
 * @returns {string|null}
 */
export function keyId(key) {
  if (typeof key === 'string') return key === '' ? null : key;
  if (typeof key === 'number') return Number.isFinite(key) ? String(key) : null;
  if (typeof key === 'bigint') return String(key);
  return null;
}

/** @param {unknown} list @returns {unknown[]} */
const listOf = (list) => {
  if (list == null) return [];
  if (typeof list === 'string' || typeof list !== 'object' || typeof list[Symbol.iterator] !== 'function') return [list];
  return [...list];
};

export class KeySelection {
  /**
   * @param {{ max?: number, exclusive?: boolean }} [opts]
   */
  constructor(opts = {}) {
    /** @type {Map<string, unknown>} id → original, insertion order = selection order */
    this._map = new Map();
    this.max = Number.isInteger(opts.max) && opts.max >= 0 ? opts.max : Infinity;
    this.exclusive = !!opts.exclusive;
  }

  get size() { return this._map.size; }

  /** @param {unknown} key */
  has(key) {
    const id = keyId(key);
    return id !== null && this._map.has(id);
  }

  /** Originals in selection order. */
  keys() { return [...this._map.values()]; }

  /** Identities (strings) in selection order. */
  ids() { return [...this._map.keys()]; }

  // --- internal ---

  /** @private apply a target id map; returns the diff */
  _set(next) {
    const added = [];
    const removed = [];
    for (const [id, orig] of this._map) if (!next.has(id)) removed.push(orig);
    for (const [id, orig] of next) if (!this._map.has(id)) added.push(orig);
    this._map = next;
    return { added, removed };
  }

  /** @private valid [id, original] pairs of a list, duplicates collapsed (first wins) */
  _pairs(list) {
    const out = new Map();
    for (const k of listOf(list)) {
      const id = keyId(k);
      if (id !== null && !out.has(id)) out.set(id, k);
    }
    return out;
  }

  // --- API tier (never reads max) ---

  /** Replace the whole selection. Exclusive → the last valid key only. */
  replace(list) {
    let next = this._pairs(list);
    if (this.exclusive && next.size > 1) next = new Map([[...next].pop()]);
    // an id already selected keeps its first-seen original
    for (const id of next.keys()) if (this._map.has(id)) next.set(id, this._map.get(id));
    return this._set(next);
  }

  /** Add keys (kept order). Exclusive → the last valid key replaces the selection. */
  add(list) {
    const pairs = this._pairs(list);
    if (this.exclusive) {
      if (!pairs.size) return { added: [], removed: [] };
      const [id, orig] = [...pairs].pop();
      return this._set(new Map([[id, this._map.has(id) ? this._map.get(id) : orig]]));
    }
    const next = new Map(this._map);
    for (const [id, orig] of pairs) if (!next.has(id)) next.set(id, orig);
    return this._set(next);
  }

  /** Remove keys. */
  remove(list) {
    const next = new Map(this._map);
    for (const id of this._pairs(list).keys()) next.delete(id);
    return this._set(next);
  }

  /** Remove everything. */
  clear() { return this._set(new Map()); }

  /** Switch exclusive on / off; on keeps the LAST selected key. */
  setExclusive(on) {
    this.exclusive = !!on;
    if (!this.exclusive || this._map.size <= 1) return { added: [], removed: [] };
    return this._set(new Map([[...this._map].pop()]));
  }

  // --- user tier (the max cap applies, except in exclusive mode) ---

  /** @private room left under the cap */
  _room() { return this.exclusive ? Infinity : this.max - this._map.size; }

  /**
   * Flip one key. Exclusive: selecting drops the previously selected one in the same change; flipping the selected
   * key clears (0 rows).
   */
  userToggle(key) {
    const id = keyId(key);
    if (id === null) return { added: [], removed: [], limited: false };
    if (this._map.has(id)) {
      const next = new Map(this._map);
      next.delete(id);
      return { ...this._set(next), limited: false };
    }
    if (this.exclusive) return { ...this._set(new Map([[id, key]])), limited: false };
    if (this._room() <= 0) return { added: [], removed: [], limited: true };
    const next = new Map(this._map);
    next.set(id, key);
    return { ...this._set(next), limited: false };
  }

  /**
   * Shift range in PAGE order (`orderKeys`, the displayed order after sort): the target's NEW state (the opposite of
   * its current one) is applied to every enabled key between the anchor and the target (both included). Anchor not
   * on the page → a single toggle of the target. A locked target → no change. Adds stop at the cap.
   * @param {unknown[]} orderKeys keys of the page in display order (null = row without a valid key)
   * @param {unknown} anchor
   * @param {unknown} target
   * @param {(key: unknown) => boolean} isEnabled
   */
  userRange(orderKeys, anchor, target, isEnabled) {
    const none = { added: [], removed: [], limited: false };
    const tid = keyId(target);
    if (tid === null || !isEnabled(target)) return none;
    const ids = orderKeys.map(keyId);
    const aid = keyId(anchor);
    const from = aid === null ? -1 : ids.indexOf(aid);
    const to = ids.indexOf(tid);
    if (from < 0 || to < 0 || this.exclusive) return this.userToggle(target);
    const on = !this._map.has(tid);
    const step = to >= from ? 1 : -1;
    const next = new Map(this._map);
    let limited = false;
    for (let i = from; ; i += step) {
      const id = ids[i];
      if (id !== null && isEnabled(orderKeys[i])) {
        if (!on) next.delete(id);
        else if (!next.has(id)) {
          if (next.size >= this.max) { limited = true; break; }
          next.set(id, orderKeys[i]);
        }
      }
      if (i === to) break;
    }
    return { ...this._set(next), limited };
  }

  /**
   * Header state of a page: 'disabled' (no enabled row), 'none' / 'some' / 'all' over the ENABLED rows only (a locked
   * selected row does not count).
   * @param {unknown[]} pageKeys
   * @param {(key: unknown) => boolean} isEnabled
   * @returns {'disabled'|'none'|'some'|'all'}
   */
  headerState(pageKeys, isEnabled) {
    let enabled = 0;
    let on = 0;
    for (const k of pageKeys) {
      const id = keyId(k);
      if (id === null || !isEnabled(k)) continue;
      enabled++;
      if (this._map.has(id)) on++;
    }
    if (!enabled) return 'disabled';
    return on === 0 ? 'none' : on === enabled ? 'all' : 'some';
  }

  /**
   * Header click: 'all' → deselect the enabled rows of the page; otherwise select them (page order, up to the cap).
   * Keys of other pages are never touched.
   */
  userPage(pageKeys, isEnabled) {
    const state = this.headerState(pageKeys, isEnabled);
    if (state === 'disabled') return { added: [], removed: [], limited: false };
    const next = new Map(this._map);
    let limited = false;
    for (const k of pageKeys) {
      const id = keyId(k);
      if (id === null || !isEnabled(k)) continue;
      if (state === 'all') next.delete(id);
      else if (!next.has(id)) {
        if (next.size >= this.max) { limited = true; break; }
        next.set(id, k);
      }
    }
    return { ...this._set(next), limited };
  }
}
