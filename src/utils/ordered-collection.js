/**
 * Ordered collection of OPAQUE keys + count limits (v0.30.0, plan docs/internal/plans/v0.30.0-number-repeater.md M4).
 * Internal util (not a public export): no DOM, no events — `node --test` covers every rule. <td-repeater> keeps one
 * (keys = its row elements); v0.31 td-sortable reuses `move` / `keys`.
 *
 * - `min` / `max` are integers >= 0 (`max` may be Infinity); `max < min` → `max = min` (one warning).
 * - Limits gate insert / remove only: initial keys above `max` are all kept (one warning — a server that printed 25
 *   rows for `max-rows=20` never loses data); lowering `max` never drops keys (only `canAdd()` turns false).
 * - `reset(keys)` replaces the whole order (the repeater's DOM is the source of truth) and applies no limit.
 * - Keys are unique: a duplicate is refused on insert and dropped (first wins) by the constructor / reset.
 */
export class OrderedCollectionModel {
  /**
   * @param {{ keys?: Iterable<*>, min?: *, max?: *, warn?: (msg: string) => void }} [opts]
   */
  constructor({ keys = [], min = 0, max = Infinity, warn } = {}) {
    this._warnFn = typeof warn === 'function' ? warn : (msg) => console.warn(msg);
    this._warned = new Set();
    /** @private @type {Array<*>} */
    this._keys = [];
    this.min = 0;
    this.max = Infinity;
    this.setLimits({ min, max });
    this._keys = this._unique(keys);
    if (this._keys.length > this.max) {
      this._warnOnce('over', `[td] OrderedCollectionModel: ${this._keys.length} keys exceed max ${this.max} — all kept.`);
    }
  }

  /** @returns {number} */
  get size() { return this._keys.length; }

  /** @returns {Array<*>} a copy of the keys in order */
  keys() { return this._keys.slice(); }

  /** @param {*} key @returns {number} -1 when absent */
  indexOf(key) { return this._keys.indexOf(key); }

  /** @param {number} i @returns {*} undefined out of range */
  at(i) { return Number.isInteger(i) && i >= 0 ? this._keys[i] : undefined; }

  /** @returns {boolean} size < max */
  canAdd() { return this._keys.length < this.max; }

  /** @returns {boolean} size > min */
  canRemove() { return this._keys.length > this.min; }

  /** @param {number} from @param {number} to @returns {boolean} both in range and different */
  canMove(from, to) {
    const n = this._keys.length;
    return Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to >= 0 && from < n && to < n && from !== to;
  }

  /**
   * Insert `key` at index `at` (clamped to [0, size]).
   * @param {*} key
   * @param {number} [at]
   * @returns {number} the index, or -1 (full / duplicate key)
   */
  insert(key, at = this._keys.length) {
    if (!this.canAdd() || this._keys.includes(key)) return -1;
    const n = Number(at);
    const i = Number.isFinite(n) ? Math.max(0, Math.min(Math.trunc(n), this._keys.length)) : this._keys.length;
    this._keys.splice(i, 0, key);
    return i;
  }

  /**
   * @param {*} key
   * @returns {number} the former index, or -1 (absent / at min)
   */
  remove(key) {
    const i = this._keys.indexOf(key);
    if (i < 0 || !this.canRemove()) return -1;
    this._keys.splice(i, 1);
    return i;
  }

  /**
   * Move the key at `from` so that it ends up AT index `to`.
   * @param {number} from
   * @param {number} to
   * @returns {boolean}
   */
  move(from, to) {
    if (!this.canMove(from, to)) return false;
    const [key] = this._keys.splice(from, 1);
    this._keys.splice(to, 0, key);
    return true;
  }

  /**
   * @param {{ min?: *, max?: * }} limits - absent / null / invalid → defaults (0 / Infinity)
   */
  setLimits({ min, max } = {}) {
    const int = (v) => {
      if (v == null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
    };
    this.min = int(min) ?? 0;
    this.max = max === Infinity ? Infinity : (int(max) ?? Infinity);
    if (this.max < this.min) {
      this._warnOnce('limits', `[td] OrderedCollectionModel: max ${this.max} < min ${this.min} — max set to ${this.min}.`);
      this.max = this.min;
    }
  }

  /**
   * Replace the whole order (no limit applied, duplicates dropped).
   * @param {Iterable<*>} keys
   */
  reset(keys) {
    this._keys = this._unique(keys);
  }

  /**
   * Which index should get focus after removing the item at `index`: the item now at that place, else the previous
   * one; -1 when the collection is empty.
   * @param {number} index - former index of the removed item
   * @param {number} size - size AFTER the removal
   * @returns {number}
   */
  static focusAfterRemove(index, size) {
    if (!(size > 0)) return -1;
    return Math.max(0, Math.min(index, size - 1));
  }

  /** @private */
  _unique(keys) {
    const out = [];
    let dup = false;
    for (const k of keys || []) {
      if (out.includes(k)) dup = true;
      else out.push(k);
    }
    if (dup) this._warnOnce('dup', '[td] OrderedCollectionModel: duplicate keys dropped (first kept).');
    return out;
  }

  /** @private */
  _warnOnce(kind, msg) {
    if (this._warned.has(kind)) return;
    this._warned.add(kind);
    this._warnFn(msg);
  }
}
