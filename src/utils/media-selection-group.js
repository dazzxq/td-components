/**
 * Selection group of `td-media-grid` (plan v0.95.0-selection-bar §4) — the coordinator behind
 * `<td-media-grid selection-group="lib">` and `<td-selection-bar group="lib" | for="a b">`. Internal module (no package
 * subpath): only td-media-grid imports the store; td-selection-bar reaches it through
 * `customElements.get('td-media-grid')._selectionGroup(…)`, so a bar from a second bundle talks to the store of the
 * grid class that was actually defined (one store per page, whatever the bundling).
 *
 * - The selection stays in each grid (`grid._selected`); a group only coordinates: one Shift anchor, member order (DOM),
 *   "selecting" = group total > 0, one Escape listener, batched change notes (one per microtask), the total announcement.
 * - Store: `WeakMap<rootNode, { named: Map<name, Group>, anon: Group[] }>`. Named groups are created lazily by the first
 *   grid (or bar) and dropped when the last member and the last bar left. Anonymous groups belong to one bar (`for`);
 *   the first registered one wins a grid listed by two bars, `selection-group` wins over any `for`.
 * - No DOM work at import. Names / ids are compared as strings (`getAttribute`, `getElementById`), never put in a
 *   selector.
 *
 * Pure helpers (node-tested, src/utils/media-selection-group.test.js): `rangeAcross` (Shift range over member grids)
 * and `fitActions` (how many bar actions fit, with hysteresis).
 */

import { hasActiveAbove } from './layers.js';

/** @type {WeakMap<Node, { named: Map<string, Group>, anon: Group[] }>} */
const STORES = new WeakMap();

const ITEM_PENDING = 'data-td-media-pending';

/**
 * Shift range across member grids, in member order then item order, from the anchor to the target (both included,
 * either direction). Adds only; pending ids are skipped (not counted); a disabled member is skipped; each member stops
 * at its own `max` (its limit flag is set) and the range goes on in the next member.
 * With anchor and target in the same member this is exactly the single-grid algorithm of td-media-grid.
 * @param {{ ids: string[], pending?: Set<string>, selected: Set<string>, max?: number, disabled?: boolean }[]} members
 * @param {{ member: number, index: number }} anchor
 * @param {{ member: number, index: number }} target
 * @returns {{ adds: string[][], limited: boolean[] }}
 */
export function rangeAcross(members, anchor, target) {
  const adds = members.map(() => []);
  const limited = members.map(() => false);
  const valid = (p) => p && Number.isInteger(p.member) && Number.isInteger(p.index) && members[p.member]
    && p.index >= 0 && p.index < members[p.member].ids.length;
  if (!valid(anchor) || !valid(target)) return { adds, limited };
  const sel = members.map((m) => new Set(m.selected));
  const forward = target.member > anchor.member || (target.member === anchor.member && target.index >= anchor.index);
  const step = forward ? 1 : -1;
  let m = anchor.member;
  let i = anchor.index;
  for (;;) {
    const mem = members[m];
    if (!mem.disabled) {
      const id = mem.ids[i];
      if (!sel[m].has(id) && !(mem.pending && mem.pending.has(id))) {
        const max = typeof mem.max === 'number' ? mem.max : Infinity;
        if (sel[m].size >= max) {
          limited[m] = true;
        } else {
          sel[m].add(id);
          adds[m].push(id);
        }
      }
    }
    if (m === target.member && i === target.index) break;
    i += step;
    while (i < 0 || i >= members[m].ids.length) {
      m += step;
      if (m < 0 || m >= members.length) return { adds, limited };
      i = step > 0 ? 0 : members[m].ids.length - 1;
    }
  }
  return { adds, limited };
}

/** px: enter the overflow when the actions need more than the room + this (subpixel tolerance) */
const FIT_ENTER = 1;
/** px: leave the overflow (or show one more action) only with this much to spare — no flip-flop on resize */
const FIT_LEAVE = 4;

/**
 * How many leading actions stay in the bar (the rest go to the "…" menu), with hysteresis like td-tabs fit: enter the
 * overflow when the actions need more than `avail + 1`, leave it when they need at most `avail − 4`.
 * @param {number[]} widths natural widths of the visible actions, DOM order
 * @param {number} avail room for the actions (px)
 * @param {number} moreWidth width of the "…" button
 * @param {number|null|undefined} prevCount the previous result (null / undefined = first decision)
 * @param {number} [gap] gap between two buttons (px)
 * @returns {number} count of leading actions shown (`widths.length` = no overflow, "…" hidden)
 */
export function fitActions(widths, avail, moreWidth, prevCount, gap = 0) {
  const n = widths.length;
  if (!n) return 0;
  const g = Number.isFinite(gap) && gap > 0 ? gap : 0;
  const sum = (k) => {
    let s = 0;
    for (let i = 0; i < k; i++) s += widths[i];
    return s;
  };
  const total = sum(n) + g * (n - 1);
  /** room needed by k actions + the "…" button */
  const need = (k) => sum(k) + g * k + moreWidth;
  const prev = Number.isInteger(prevCount) ? Math.max(0, Math.min(n, prevCount)) : n;
  if (prev >= n) {
    if (total <= avail + FIT_ENTER) return n;
    let k = n - 1;
    while (k > 0 && need(k) > avail) k--;
    return k;
  }
  if (total <= avail - FIT_LEAVE) return n;
  let k = prev;
  while (k > 0 && need(k) > avail + FIT_ENTER) k--;
  while (k < n - 1 && need(k + 1) <= avail - FIT_LEAVE) k++;
  return k;
}

// --- store ---

function storeOf(root, create) {
  let s = STORES.get(root);
  if (!s && create) {
    s = { named: new Map(), anon: [] };
    STORES.set(root, s);
  }
  return s || null;
}

const nameOf = (grid) => (grid.getAttribute('selection-group') || '').trim();

/** @param {Element} grid first opener of the grid's first item (focus fallback) */
function firstOpener(grid) {
  if (!grid || !grid.isConnected || typeof grid._openOf !== 'function') return null;
  for (const item of grid.items) {
    const open = grid._openOf(item);
    if (open) return open;
  }
  return null;
}

/** The group a connected grid belongs to now (creating a named group on demand), or null. */
function resolve(grid) {
  if (!grid.isConnected) return null;
  const root = grid.getRootNode();
  const name = nameOf(grid);
  const store = storeOf(root, !!name);
  const claims = grid.id && store ? store.anon.filter((g) => g.ids.has(grid.id)) : [];
  if (name) {
    if (claims.length && !grid._groupWarned) {
      grid._groupWarned = true;
      console.warn(`td-media-grid: #${grid.id} has selection-group="${name}" and is listed in a td-selection-bar `
        + '"for" — selection-group wins.');
    }
    let g = store.named.get(name);
    if (!g) {
      g = new Group(store, name, null);
      store.named.set(name, g);
    }
    return g;
  }
  if (!claims.length) return null;
  for (const lost of claims.slice(1)) lost._warnConflict(grid);
  return claims[0];
}

/**
 * Put a grid in the group it belongs to now (connect, `selection-group` change, a bar's `for` registered / released).
 * @param {HTMLElement} grid a td-media-grid of the defined class
 * @param {boolean} [lost] the grid left the DOM: its selected ids count as removed (event)
 */
export function syncGridGroup(grid, lost = false) {
  const want = resolve(grid);
  const cur = grid._group || null;
  // a move inside the page (insertBefore of a connected grid): its disconnect / connect reactions run after the move,
  // the grid is connected again in both → same group, no leave / join; its place in the DOM order may have changed
  if (want === cur) { if (cur) cur._order = null; return; }
  if (cur) cur._leave(grid, lost);
  if (want) want._join(grid);
}

class Group {
  /**
   * @param {{ named: Map<string, Group>, anon: Group[] }} store
   * @param {string|null} name
   * @param {Set<string>|null} ids anonymous group (a bar's `for`)
   */
  constructor(store, name, ids) {
    this.store = store;
    this.name = name;
    this.ids = ids || new Set();
    /** @type {Set<HTMLElement>} */
    this.members = new Set();
    /** @type {HTMLElement[]|null} DOM order cache */
    this._order = null;
    /** @type {{ grid: HTMLElement, id: string }|null} Shift anchor (§4.3) */
    this.anchor = null;
    /** @type {HTMLElement|null} item of the last anchor (focus target after a clear, §5.6) */
    this._anchorItem = null;
    /** @type {HTMLElement|null} opener focused last in a member */
    this._opener = null;
    this.refs = 0;
    /** @type {object[]} registered bars, registration order (the first one announces) */
    this.bars = [];
    /** @type {Set<Function>} */
    this.subs = new Set();
    this._queued = false;
    this._emit = false;
    /** @type {HTMLElement|null} grid changed last (announcer without a bar) */
    this._last = null;
    this._key = '';
    this._doc = null;
    this._docKey = null;
    this._warned = false;
    this._dead = false;
    this._onFocusIn = (e) => {
      const grid = /** @type {any} */ (e.currentTarget);
      const item = grid._itemFrom?.(e.target);
      const open = item ? grid._openOf(item) : null;
      if (open && open.contains(e.target)) this._opener = open;
    };
  }

  /** @returns {HTMLElement[]} members in DOM order */
  get grids() {
    if (!this._order) {
      this._order = [...this.members].sort((a, b) => {
        if (a === b) return 0;
        // eslint-disable-next-line no-bitwise
        return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });
    }
    return this._order.slice();
  }

  get count() {
    let n = 0;
    for (const g of this.members) n += g._selected.size;
    return n;
  }

  get selectedIds() {
    const out = [];
    for (const g of this.grids) if (g._selected.size) out.push(...g.selectedIds);
    return out;
  }

  /** @private */
  _join(grid) {
    if (this.members.has(grid)) return;
    this.members.add(grid);
    this._order = null;
    grid._group = this;
    grid.addEventListener('focusin', this._onFocusIn);
    grid._setDocKey(false);
    this.note(grid, false);
  }

  /** @private */
  _leave(grid, lost) {
    if (!this.members.delete(grid)) return;
    this._order = null;
    grid._group = null;
    grid.removeEventListener('focusin', this._onFocusIn);
    if (this.anchor && this.anchor.grid === grid) this.anchor = null;
    if (this._anchorItem && grid.contains(this._anchorItem)) this._anchorItem = null;
    if (this._opener && grid.contains(this._opener)) this._opener = null;
    if (this._last === grid) this._last = null;
    // back to the grid's own semantics ("selecting" = its own selection, its own Escape listener)
    grid.toggleAttribute('data-selecting', grid._selected.size > 0);
    if (grid.isConnected) grid._setDocKey(grid._selected.size > 0);
    this.note(null, lost && grid._selected.size > 0);
    this._gc();
  }

  /** @private drop an empty named group (no member, no bar) from the store */
  _gc() {
    if (this.members.size || this.refs > 0) return;
    this._setDocKey(false);
    if (this.name != null) {
      if (this.store.named.get(this.name) === this) this.store.named.delete(this.name);
      this._dead = true;
    }
  }

  /** @private a later bar lists a grid an earlier bar already holds */
  _warnConflict(grid) {
    if (this._warned) return;
    this._warned = true;
    console.warn(`td-selection-bar: #${grid.id} is already in the "for" of an earlier td-selection-bar — ignored here.`);
  }

  /**
   * A member's selection changed (or a member joined / left). Repaints "selecting" on every member at once, batches
   * the subscribers per microtask.
   * @param {HTMLElement|null} grid
   * @param {boolean} emit user change / `{ emit: true }` / selected items or grids removed from the DOM
   */
  note(grid, emit) {
    if (emit) this._emit = true;
    if (grid) this._last = grid;
    const total = this.count;
    if (!total) this.anchor = null;
    for (const g of this.members) g.toggleAttribute('data-selecting', total > 0);
    this._setDocKey(total > 0);
    if (this._queued) return;
    this._queued = true;
    queueMicrotask(() => this._flush());
  }

  /** @private */
  _flush() {
    this._queued = false;
    const grids = this.grids;
    const ids = [];
    const parts = [];
    for (const g of grids) {
      if (!g._selected.size) continue;
      const own = g.selectedIds;
      ids.push(...own);
      parts.push(own.join('\u0001'));
    }
    const key = parts.join('\u0002');
    const emit = this._emit && key !== this._key;
    this._emit = false;
    this._key = key;
    const count = ids.length;
    for (const fn of [...this.subs]) {
      try { fn({ count, ids: ids.slice(), emit }); } catch (err) { console.error(err); }
    }
    if (emit && !this.bars.length) {
      // no bar: the grid changed last reads the TOTAL (soft: a pending "Tối đa {max} mục" of that grid wins)
      const g = this._last && this.members.has(this._last) ? this._last : grids[0];
      const tpl = g?.constructor?.labels?.count;
      if (g && typeof g._announce === 'function') g._announce(String(tpl ?? '').replace('{n}', () => String(count)), true);
    }
  }

  /** @param {HTMLElement|null} grid @param {string|null} id */
  setAnchor(grid, id) {
    if (!grid || id == null) {
      this.anchor = null;
      return;
    }
    this.anchor = { grid, id };
    const item = grid.items.find((el) => el.getAttribute('data-id') === id);
    if (item) this._anchorItem = item;
  }

  /** @returns {string|null} the anchor id when it is in `grid` */
  anchorIn(grid) {
    return this.anchor && this.anchor.grid === grid ? this.anchor.id : null;
  }

  /**
   * Shift range from the anchor (in another member) to `item` of `grid` (§4.3). Each changed member commits (its own
   * `select-change`); a member at its `max` fires `select-limit`.
   * @returns {boolean} false when there is no usable anchor (the caller falls back to a single flip)
   */
  rangeTo(grid, item) {
    const a = this.anchor;
    if (!a || !this.members.has(a.grid)) return false;
    const grids = this.grids;
    const members = grids.map((g) => {
      const items = g.items;
      const ids = items.map((el) => el.getAttribute('data-id'));
      const pending = new Set();
      items.forEach((el, i) => { if (el.hasAttribute(ITEM_PENDING)) pending.add(ids[i]); });
      return { ids, pending, selected: g._selected, max: g._max(), disabled: g.hasAttribute('disabled') };
    });
    const am = grids.indexOf(a.grid);
    const tm = grids.indexOf(grid);
    const ai = members[am].ids.indexOf(a.id);
    const ti = tm >= 0 ? members[tm].ids.indexOf(item.getAttribute('data-id')) : -1;
    if (ai < 0 || ti < 0) return false;
    const { adds, limited } = rangeAcross(members, { member: am, index: ai }, { member: tm, index: ti });
    grids.forEach((g, k) => {
      if (adds[k].length) g._commit(new Set([...g._selected, ...adds[k]]), true);
    });
    grids.forEach((g, k) => { if (limited[k]) g._limit(members[k].max); });
    return true;
  }

  /** Clear every member that is not disabled (a disabled grid keeps its selection — Q5). */
  clear(opts = {}) {
    const emit = !!(opts && opts.emit);
    for (const g of this.grids) if (!g.hasAttribute('disabled') && g._selected.size) g.clear({ emit });
    this.anchor = null;
  }

  /** @private one capture keydown listener on the document while the group has a selection */
  _setDocKey(on) {
    if (typeof document === 'undefined') return;
    if (on && !this._docKey) {
      this._doc = [...this.members][0]?.ownerDocument || document;
      this._docKey = (e) => this._onDocKeydown(e);
      this._doc.addEventListener('keydown', this._docKey, true);
    } else if (!on && this._docKey) {
      this._doc.removeEventListener('keydown', this._docKey, true);
      this._docKey = null;
      this._doc = null;
    }
  }

  /** @private Escape clears the whole group (not the disabled members) — same skips as a single grid */
  _onDocKeydown(e) {
    if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
    const grids = this.grids.filter((g) => g.isConnected && !g.hasAttribute('disabled') && g._selected.size);
    if (!grids.length) return;
    if (hasActiveAbove(0)) return; // an overlay (menu, modal…) consumes Escape first
    for (const g of grids) g._commit(new Set(), true);
    this.anchor = null;
  }

  /** @returns {HTMLElement[]} focus targets in order: anchor opener, last anchor opener, last focused opener */
  focusCandidates() {
    const out = [];
    const inMember = (el) => !!el && el.isConnected && [...this.members].some((g) => g.contains(el));
    const add = (el) => { if (el && !out.includes(el)) out.push(el); };
    if (this.anchor) {
      const g = this.anchor.grid;
      const item = g.items.find((el) => el.getAttribute('data-id') === this.anchor.id);
      if (item) add(g._openOf(item));
    }
    if (inMember(this._anchorItem)) {
      const g = [...this.members].find((m) => m.contains(this._anchorItem));
      add(g._openOf(this._anchorItem));
    }
    if (inMember(this._opener)) add(this._opener);
    return out;
  }
}

/**
 * Handle of a group for td-selection-bar (`TdMediaGrid._selectionGroup`, @internal — not public API).
 * @param {{ name?: string, ids?: string[], root: Node }} opts `name` (a `group`) or `ids` (a `for`: one anonymous group
 *   owned by the caller)
 */
export function acquireGroup(opts) {
  const root = opts && opts.root;
  if (!root) return null;
  const name = typeof opts.name === 'string' ? opts.name.trim() : '';
  const store = storeOf(root, true);
  /** @type {Group} */
  let group;
  if (name) {
    group = store.named.get(name);
    if (!group) {
      group = new Group(store, name, null);
      store.named.set(name, group);
    }
  } else {
    const ids = new Set((Array.isArray(opts.ids) ? opts.ids : []).map(String).filter(Boolean));
    group = new Group(store, null, ids);
    store.anon.push(group);
    for (const id of ids) {
      const el = typeof root.getElementById === 'function' ? root.getElementById(id) : null;
      if (el && el.isConnected && '_group' in el && typeof el._commit === 'function') syncGridGroup(el);
    }
  }
  group.refs++;
  let released = false;
  const mine = new Set();
  const bars = [];
  return {
    get grids() { return released ? [] : group.grids; },
    get count() { return released ? 0 : group.count; },
    get selectedIds() { return released ? [] : group.selectedIds; },
    clear(o) { if (!released) group.clear(o); },
    /** @param {(s: { count: number, ids: string[], emit: boolean }) => void} fn */
    subscribe(fn) {
      if (released || typeof fn !== 'function') return () => {};
      group.subs.add(fn);
      mine.add(fn);
      return () => { group.subs.delete(fn); mine.delete(fn); };
    },
    registerBar(bar) {
      if (released) return () => {};
      group.bars.push(bar);
      bars.push(bar);
      return () => {
        const i = group.bars.indexOf(bar);
        if (i >= 0) group.bars.splice(i, 1);
      };
    },
    isAnnouncer(bar) { return !released && group.bars[0] === bar; },
    focusCandidates() { return released ? [] : group.focusCandidates(); },
    firstOpener,
    release() {
      if (released) return;
      released = true;
      for (const fn of mine) group.subs.delete(fn);
      for (const bar of bars) {
        const i = group.bars.indexOf(bar);
        if (i >= 0) group.bars.splice(i, 1);
      }
      group.refs--;
      if (group.name == null) {
        // an anonymous group lives as long as its bar: its grids go to the next bar listing them (or to none)
        const i = store.anon.indexOf(group);
        if (i >= 0) store.anon.splice(i, 1);
        for (const g of group.grids) syncGridGroup(g);
        group._setDocKey(false);
        group._dead = true;
      } else {
        group._gc();
      }
    },
  };
}
