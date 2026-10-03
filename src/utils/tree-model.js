/**
 * Pure tree model shared by <td-tree> and <td-tree-select> (v0.29.0, plan docs/internal/plans/v0.29.0-tree.md M1, M3–M6).
 * No DOM: normalize, visible list + navigation + type-ahead, filtering, selection (single / multiple independent /
 * multiple cascade), lazy children (latest-request-wins per node), value reconciliation. The components are only a
 * render + event layer on top of it (and `node --test` covers every rule here).
 *
 * Node shape accepted from the app: `{ value, label, children?, hasChildren?, disabled?, description?, expanded? }`.
 * `value`: non-empty string or finite number (coerced with String()); anything else drops the node WITH its branch (one
 * warning). Values must be unique (a later duplicate is kept but locked and never part of the value). `children: [...]`
 * = loaded, `children` absent + `hasChildren: true` = lazy (loadChildren), `children: []` / absent = leaf.
 */
import { fold, nextTypeaheadIndex } from './typeahead.js';

/** Maximum depth (levels); deeper nodes are dropped with one warning. */
export const TREE_MAX_DEPTH = 16;
/** Above this many nodes in `data` one warning suggests `loadChildren` (the tree still works). */
export const TREE_WARN_NODES = 5000;

/**
 * A value as the tree stores it: a non-empty string, or a finite number as a string. Anything else → null ('' is
 * reserved for "empty").
 * @param {unknown} v
 * @returns {string|null}
 */
export function normalizeValue(v) {
  if (typeof v === 'string') return v === '' ? null : v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * @typedef {Object} TreeNode
 * @property {number} uid - per-model counter (DOM ids are built from it, never from data)
 * @property {string} value
 * @property {string} label
 * @property {string} fold - search key (case / diacritic-insensitive)
 * @property {string} description
 * @property {TreeNode|null} parent
 * @property {number} depth - 0 for roots
 * @property {TreeNode[]|null} children - null = lazy, not loaded yet
 * @property {boolean} lazy
 * @property {boolean} disabled - own `disabled`
 * @property {boolean} dup - a later duplicate value (locked, never selected)
 * @property {boolean} locked - own disabled / duplicate, or inherited from an ancestor
 * @property {boolean} expanded - the real (user / data) state
 * @property {boolean} loading
 * @property {boolean} loadError
 * @property {Object} src - the app's own object
 */

export class TreeModel {
  /**
   * @param {{ warn?: (msg: string) => void }} [opts]
   */
  constructor(opts = {}) {
    this._warnFn = typeof opts.warn === 'function' ? opts.warn : (msg) => console.warn(msg);
    /** @private warning keys already reported (each kind once per model) */
    this._warned = new Set();
    this._uid = 0;
    /** @type {'none'|'single'|'multiple'} */
    this.mode = 'none';
    this._cascadeOpt = false;
    /** @type {null|((node: Object, ctx: { signal: AbortSignal }) => Promise<Array>|Array)} */
    this.loader = null;
    /** generation: bumped by new data and abortAll() — a late lazy result of an older generation is dropped */
    this.gen = 0;
    this.hasData = false;
    /** @type {TreeNode[]} */
    this.roots = [];
    this._byValue = new Map();
    this._byUid = new Map();
    this._lazyCount = 0;
    /** @private selected values in the order received (set semantics) */
    this._values = [];
    this._valueSet = new Set();
    /** @private nodes with a request in flight */
    this._loading = new Set();
    this._subs = new Set();
    this._srcSeen = new WeakSet();
    this._filter = '';
    this._match = null;
    this._anc = null;
    /** @private uid → expanded while filtering (the real state is never touched) */
    this._override = new Map();
    this._order = null;
    this._vis = null;
  }

  // --- config ---------------------------------------------------------------------------------------------------

  /** @private one warning per kind and model */
  _warnOnce(key, msg) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    try { this._warnFn(msg); } catch { /* a throwing logger never breaks the tree */ }
  }

  /**
   * @param {'none'|'single'|'multiple'} mode
   * @param {boolean} [cascade] multiple only (tri-state, value = checked leaves)
   */
  setMode(mode, cascade = false) {
    this.mode = mode === 'single' || mode === 'multiple' ? mode : 'none';
    this._cascadeOpt = !!cascade;
    this._checkCascade();
    this._applyValues(this._values);
    this._settle();
  }

  /** Effective cascade: `multiple` + `cascade` without a lazy hook (M3 rule 6). */
  get cascade() {
    return this._cascadeOpt && this.mode === 'multiple' && !this.loader;
  }

  /** @param {Function|null} fn loadChildren(node, { signal }) */
  setLoader(fn) {
    this.loader = typeof fn === 'function' ? fn : null;
    this._checkCascade();
    this._settle();
  }

  /**
   * @private Review round 1 (ISSUE-1): the mode or the EFFECTIVE cascade changed at runtime (cascade attribute, a
   * loadChildren hook added / removed) — reconcile the values (cascade drops parent / unknown values), recount the
   * tri-state, then tell the views (`values`: rows + form value re-synced).
   */
  _settle() {
    this._reconcile(true);
    this._recount();
    this._notify({ type: 'values' });
  }

  /** @private */
  _checkCascade() {
    if (this._cascadeOpt && this.mode === 'multiple' && this.loader) {
      this._warnOnce('cascade-lazy', 'td-tree: cascade is not supported with loadChildren (unknown leaves of unloaded branches) — independent multiple is used.');
    }
  }

  /**
   * Listen to model changes: `{ type: 'data' | 'loading' | 'load' | 'load-error' | 'values', node?, error? }`.
   * @param {(e: Object) => void} fn
   * @returns {() => void} unsubscribe
   */
  subscribe(fn) {
    this._subs.add(fn);
    return () => this._subs.delete(fn);
  }

  /** @private */
  _notify(e) {
    for (const fn of [...this._subs]) {
      try { fn(e); } catch (err) { console.error(err); }
    }
  }

  // --- data -----------------------------------------------------------------------------------------------------

  /**
   * Replace the data (new generation: every lazy request is aborted, uids are new; values are reconciled — M6).
   * @param {Array} data
   */
  setData(data) {
    this.abortAll();
    this._byValue = new Map();
    this._byUid = new Map();
    this._srcSeen = new WeakSet();
    this._lazyCount = 0;
    this._override.clear();
    this.hasData = true;
    const list = Array.isArray(data) ? data : [];
    this._count = 0;
    this.roots = this._build(list, null);
    if (this._count > TREE_WARN_NODES) {
      this._warnOnce('size', `td-tree: ${this._count} nodes — above ${TREE_WARN_NODES}, load branches on demand with loadChildren.`);
    }
    this._changed();
    this._reconcile();
    this._recount();
    this._notify({ type: 'data' });
  }

  /**
   * @private Iterative normalize of `list` under `parent` (no recursion: depth and cycles are bounded here).
   * @param {Array} list
   * @param {TreeNode|null} parent
   * @returns {TreeNode[]}
   */
  _build(list, parent) {
    const out = [];
    const stack = [{ items: list, i: 0, parent, out }];
    while (stack.length) {
      const f = stack[stack.length - 1];
      if (f.i >= f.items.length) {
        stack.pop();
        continue;
      }
      const raw = f.items[f.i++];
      const isObj = !!raw && typeof raw === 'object' && !Array.isArray(raw);
      if (isObj && this._srcSeen.has(raw)) {
        this._warnOnce('repeat', 'td-tree: a node object appears twice (or a cycle) — the repeat was skipped.');
        continue;
      }
      const value = isObj ? normalizeValue(raw.value) : null;
      if (value === null) {
        this._warnOnce('value', 'td-tree: a node without a valid value (non-empty string or finite number) was dropped with its branch.');
        continue;
      }
      const depth = f.parent ? f.parent.depth + 1 : 0;
      if (depth >= TREE_MAX_DEPTH) {
        this._warnOnce('depth', `td-tree: maximum depth is ${TREE_MAX_DEPTH} levels — deeper nodes were dropped.`);
        continue;
      }
      this._srcSeen.add(raw);
      const dup = this._byValue.has(value);
      if (dup) this._warnOnce('dup', `td-tree: duplicate value "${value}" — the later node is locked and never selected.`);
      const label = raw.label == null || raw.label === '' ? value : String(raw.label);
      const node = {
        uid: ++this._uid,
        value,
        label,
        fold: fold(label),
        description: raw.description == null ? '' : String(raw.description),
        parent: f.parent,
        depth,
        children: [],
        lazy: false,
        disabled: !!raw.disabled,
        dup,
        locked: !!raw.disabled || dup || !!(f.parent && f.parent.locked),
        expanded: false,
        loading: false,
        loadError: false,
        seq: 0,
        ctrl: null,
        src: raw,
        leafTotal: 0,
        leafOn: 0,
        leafFree: 0,
      };
      if (!dup) this._byValue.set(value, node);
      this._byUid.set(node.uid, node);
      this._count += 1;
      f.out.push(node);
      if (Array.isArray(raw.children)) {
        node.expanded = raw.expanded === true;
        stack.push({ items: raw.children, i: 0, parent: node, out: node.children });
      } else if (raw.hasChildren === true) {
        node.children = null;
        node.lazy = true;
        this._lazyCount += 1;
      }
    }
    return out;
  }

  /** @private caches (preorder, visible) are stale */
  _changed() {
    this._order = null;
    this._vis = null;
    if (this._filter) this._computeFilter();
  }

  /**
   * Internal node of a value, or null.
   * @param {unknown} value
   * @returns {TreeNode|null}
   */
  node(value) {
    const v = normalizeValue(value);
    return v === null ? null : this._byValue.get(v) || null;
  }

  /** @param {number} uid @returns {TreeNode|null} */
  nodeByUid(uid) {
    return this._byUid.get(uid) || null;
  }

  /**
   * The app's own object for a value (null when not loaded / unknown).
   * @param {unknown} value
   * @returns {Object|null}
   */
  getNode(value) {
    const n = this.node(value);
    return n ? n.src : null;
  }

  /** @private every loaded node in preorder (cached) @returns {TreeNode[]} */
  _preorder() {
    if (this._order) return this._order;
    const out = [];
    const stack = [...this.roots].reverse();
    while (stack.length) {
      const node = stack.pop();
      out.push(node);
      if (node.children) for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
    }
    this._order = out;
    return out;
  }

  /** @param {TreeNode} node @returns {boolean} the node can open (has children, or lazy) */
  expandable(node) {
    return node.children === null ? node.lazy : node.children.length > 0;
  }

  /** @param {TreeNode} node @returns {boolean} no children (a lazy not-loaded node counts as a leaf for cascade) */
  _isLeaf(node) {
    return !node.children || node.children.length === 0;
  }

  // --- expansion ------------------------------------------------------------------------------------------------

  /** @param {TreeNode} node @returns {boolean} the expanded INTENT (real state, or the filter's temporary one) */
  wantsOpen(node) {
    if (this._filter) return this._override.has(node.uid) ? this._override.get(node.uid) : this._anc.has(node);
    return node.expanded;
  }

  /** @param {TreeNode} node @returns {boolean} shown expanded (intent + loaded children) */
  isExpanded(node) {
    return this.wantsOpen(node) && !!node.children && node.children.length > 0;
  }

  /**
   * Open / close a node (while filtering only the temporary state changes). Opening a lazy, not-loaded node starts its
   * request: the in-flight promise is returned (null when nothing is loaded).
   * @param {TreeNode} node
   * @param {boolean} on
   * @returns {Promise|null}
   */
  setExpanded(node, on) {
    if (!node || (node.children && node.children.length === 0)) return null;
    if (this._filter) this._override.set(node.uid, !!on);
    else node.expanded = !!on;
    this._vis = null;
    if (on && node.children === null) return this.load(node);
    return null;
  }

  /** @param {TreeNode} node */
  expand(node) { return this.setExpanded(node, true); }

  /** @param {TreeNode} node */
  collapse(node) { return this.setExpanded(node, false); }

  /** Open every LOADED node with children (never starts a lazy request). */
  expandAll() {
    for (const node of this._preorder()) if (node.children && node.children.length) this.setExpanded(node, true);
  }

  /** Close every loaded node. */
  collapseAll() {
    for (const node of this._preorder()) if (node.children && node.children.length) this.setExpanded(node, false);
  }

  /**
   * APG `*`: open every visible sibling of `node` whose children are already LOADED. Review round 1 (S-02): lazy,
   * not-loaded siblings are left closed — one keystroke never fires an unbounded burst of loadChildren requests (like
   * expandAll()).
   * @param {TreeNode} node
   * @returns {Promise[]} always empty (kept for the call shape)
   */
  expandSiblings(node) {
    for (const sib of this._shownSiblings(node)) {
      if (sib.children && sib.children.length && !this.isExpanded(sib)) this.setExpanded(sib, true);
    }
    return [];
  }

  /** Expand the ancestors of every selected (loaded) node. */
  revealSelected() {
    for (const v of this._values) {
      const node = this._byValue.get(v);
      for (let p = node ? node.parent : null; p; p = p.parent) p.expanded = true;
    }
    this._vis = null;
  }

  /** @param {TreeNode} node @returns {string[]} labels from the root to the node */
  pathOf(node) {
    const out = [];
    for (let p = node; p; p = p.parent) out.unshift(p.label);
    return out;
  }

  // --- visible list + navigation -------------------------------------------------------------------------------

  /** @private shown under the current filter (match, ancestor of a match, or inside a matched branch) */
  _shown(node) {
    if (!this._filter) return true;
    if (this._match.has(node) || this._anc.has(node)) return true;
    for (let p = node.parent; p; p = p.parent) if (this._match.has(p)) return true;
    return false;
  }

  /** @private @param {TreeNode} node */
  _shownSiblings(node) {
    const list = node.parent ? node.parent.children || [] : this.roots;
    return list.filter((s) => this._shown(s));
  }

  /** @param {TreeNode|null} parent @returns {TreeNode[]} shown children (roots for null) */
  shownChildren(parent) {
    const list = parent ? parent.children || [] : this.roots;
    return list.filter((s) => this._shown(s));
  }

  /**
   * Nodes currently shown, in order: roots + the children of every expanded node (filter applied).
   * @returns {TreeNode[]}
   */
  visible() {
    if (this._vis) return this._vis.list;
    const list = [];
    const stack = [...this.shownChildren(null)].reverse();
    while (stack.length) {
      const node = stack.pop();
      list.push(node);
      if (this.isExpanded(node)) {
        const kids = this.shownChildren(node);
        for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
      }
    }
    const index = new Map(list.map((n, i) => [n, i]));
    this._vis = { list, index };
    return list;
  }

  /** @private position in the visible list (-1 = not shown) */
  _visIndex(node) {
    this.visible();
    return node && this._vis.index.has(node) ? this._vis.index.get(node) : -1;
  }

  /** @param {TreeNode} node @returns {boolean} */
  isVisible(node) { return this._visIndex(node) >= 0; }

  /** @param {TreeNode} node @returns {TreeNode|null} next shown node (no wrap) */
  next(node) {
    const i = this._visIndex(node);
    const list = this.visible();
    return i >= 0 && i + 1 < list.length ? list[i + 1] : null;
  }

  /** @param {TreeNode} node @returns {TreeNode|null} previous shown node (no wrap) */
  prev(node) {
    const i = this._visIndex(node);
    return i > 0 ? this.visible()[i - 1] : null;
  }

  /** @param {TreeNode} node @returns {TreeNode|null} */
  parentOf(node) { return node ? node.parent : null; }

  /** @param {TreeNode} node @returns {TreeNode|null} first shown child of an expanded node */
  firstChild(node) {
    if (!this.isExpanded(node)) return null;
    return this.shownChildren(node)[0] || null;
  }

  /** @returns {TreeNode|null} */
  first() { return this.visible()[0] || null; }

  /** @returns {TreeNode|null} */
  last() {
    const list = this.visible();
    return list[list.length - 1] || null;
  }

  /**
   * ARIA position among the visible siblings.
   * @param {TreeNode} node
   * @returns {{ setsize: number, posinset: number, level: number }}
   */
  siblingInfo(node) {
    const sibs = this._shownSiblings(node);
    return { setsize: sibs.length, posinset: sibs.indexOf(node) + 1, level: node.depth + 1 };
  }

  /**
   * APG type-ahead over the visible labels (diacritic-insensitive, cycles).
   * @param {TreeNode|null} active
   * @param {string} buffer
   * @returns {TreeNode|null}
   */
  typeahead(active, buffer) {
    const list = this.visible();
    const i = nextTypeaheadIndex(list.map((n) => n.label), this._visIndex(active), buffer);
    return i >= 0 ? list[i] : null;
  }

  // --- filter (M5) ----------------------------------------------------------------------------------------------

  /**
   * Filter the LOADED nodes by a label substring (case / diacritic-insensitive). Shown: matches + their ancestors
   * (temporarily expanded) + the content of a matched branch the user opens. '' / blank → off (real state back).
   * @param {string} query
   */
  setFilter(query) {
    const f = fold(query).trim();
    if (f === this._filter) return;
    this._filter = f;
    this._override.clear();
    this._computeFilter();
    this._vis = null;
  }

  /** @private */
  _computeFilter() {
    if (!this._filter) {
      this._match = null;
      this._anc = null;
      return;
    }
    const match = new Set();
    const anc = new Set();
    for (const node of this._preorder()) {
      if (!node.fold.includes(this._filter)) continue;
      match.add(node);
      for (let p = node.parent; p && !anc.has(p); p = p.parent) anc.add(p);
    }
    this._match = match;
    this._anc = anc;
  }

  get filterActive() { return !!this._filter; }

  get matchCount() { return this._match ? this._match.size : 0; }

  // --- lazy children (M4) ---------------------------------------------------------------------------------------

  /**
   * Load a lazy node's children through the hook (latest-request-wins: a result of another generation / an older
   * request / an aborted one is dropped even when the hook ignores the signal).
   * @param {TreeNode} node
   * @returns {Promise|null}
   */
  load(node) {
    if (!this.loader) {
      this._warnOnce('no-loader', 'td-tree: a lazy node (hasChildren) was opened without a loadChildren hook.');
      node.expanded = false;
      this._override.delete(node.uid);
      return null;
    }
    if (node.loading) return node._promise;
    const gen = this.gen;
    const seq = ++node.seq;
    const ctrl = new AbortController();
    node.ctrl = ctrl;
    node.loading = true;
    node.loadError = false;
    this._loading.add(node);
    let ret;
    try {
      ret = this.loader(node.src, { signal: ctrl.signal });
    } catch (err) {
      ret = Promise.reject(err);
    }
    const p = Promise.resolve(ret).then(
      (res) => this._loaded(node, gen, seq, res, null),
      (err) => this._loaded(node, gen, seq, null, err == null ? new Error('loadChildren rejected') : err),
    );
    node._promise = p;
    this._notify({ type: 'loading', node });
    return p;
  }

  /** @private */
  _loaded(node, gen, seq, res, err) {
    if (gen !== this.gen || node.seq !== seq || !node.loading) return; // stale / aborted
    node.loading = false;
    node.ctrl = null;
    node._promise = null;
    this._loading.delete(node);
    if (err || !Array.isArray(res)) {
      node.loadError = true;
      node.expanded = false;
      this._override.delete(node.uid);
      this._vis = null;
      this._notify({ type: 'load-error', node, error: err || new TypeError('loadChildren must resolve to an array') });
      return;
    }
    this._count = 0;
    node.children = this._build(res, node);
    node.lazy = false;
    this._lazyCount -= 1;
    this._changed();
    this._reconcile();
    this._recount();
    this._notify({ type: 'load', node });
  }

  /**
   * Abort every request in flight (disconnect, new data): new generation, loading nodes back to lazy-not-loaded and
   * closed (opening again reloads). Data and values are kept.
   */
  abortAll() {
    this.gen += 1;
    for (const node of this._loading) {
      try { node.ctrl?.abort(); } catch { /* ignore */ }
      node.loading = false;
      node.ctrl = null;
      node._promise = null;
      node.expanded = false;
      this._override.delete(node.uid);
    }
    this._loading.clear();
    this._vis = null;
  }

  // --- values (M3 / M6) -----------------------------------------------------------------------------------------

  /**
   * Selected values: loaded ones in preorder, then the unresolved ones (not in the loaded tree) in the order received.
   * @returns {string[]}
   */
  get values() {
    if (!this._values.length) return [];
    const out = [];
    for (const node of this._preorder()) if (!node.dup && this._valueSet.has(node.value)) out.push(node.value);
    for (const v of this._values) if (!this._byValue.has(v)) out.push(v);
    return out;
  }

  /** @returns {string[]} selected values not found in the loaded tree */
  unresolved() {
    return this._values.filter((v) => !this._byValue.has(v));
  }

  /** @returns {boolean} */
  isEmpty() { return this._values.length === 0; }

  /** The model is "complete": data present and no lazy branch left (cascade is always complete). */
  isComplete() {
    return this.hasData && (this.cascade || this._lazyCount === 0);
  }

  /**
   * Programmatic value (silent; the app may select locked nodes). '' / bad types / duplicates dropped; single keeps
   * one; cascade keeps leaves only (M3 rule 5); unknown values follow M6.
   * @param {unknown} list a value or an array of values
   */
  setValues(list) {
    this._applyValues(Array.isArray(list) ? list : list == null ? [] : [list]);
    this._reconcile();
    this._recount();
  }

  /** @private */
  _applyValues(list) {
    const out = [];
    const seen = new Set();
    for (const v of list) {
      const nv = normalizeValue(v);
      if (nv !== null && !seen.has(nv)) {
        seen.add(nv);
        out.push(nv);
      }
    }
    this._values = this.mode === 'single' ? out.slice(0, 1) : out;
    this._valueSet = new Set(this._values);
  }

  /**
   * @private M6: values not in the tree are kept while the model is incomplete (submitted, resolved when a branch
   * loads them); once complete they are dropped with one warning (no change event). Cascade: parent / unknown dropped.
   * @param {boolean} [silent] no `values` notification (the caller notifies after recounting)
   * @returns {boolean} something was dropped
   */
  _reconcile(silent = false) {
    if (!this.hasData || !this._values.length) return false;
    let keep;
    if (this.cascade) {
      keep = this._values.filter((v) => {
        const node = this._byValue.get(v);
        return !!node && this._isLeaf(node);
      });
      if (keep.length !== this._values.length) {
        this._warnOnce('cascade-value', 'td-tree: with cascade the value holds leaves only — parent / unknown values were dropped.');
      }
    } else if (this.isComplete()) {
      keep = this._values.filter((v) => this._byValue.has(v));
      if (keep.length !== this._values.length) {
        this._warnOnce('missing', 'td-tree: selected values not in the tree were dropped.');
      }
    } else {
      return false;
    }
    if (keep.length === this._values.length) return false;
    this._values = keep;
    this._valueSet = new Set(keep);
    if (!silent) this._notify({ type: 'values' });
    return true;
  }

  /** @private cascade counts (leaves under every node: total, checked, unlocked) — full pass */
  _recount() {
    if (!this.cascade) return;
    const order = this._preorder();
    for (let i = order.length - 1; i >= 0; i--) {
      const node = order[i];
      if (this._isLeaf(node)) continue;
      let total = 0;
      let on = 0;
      let free = 0;
      for (const c of node.children) {
        if (this._isLeaf(c)) {
          if (c.dup) continue;
          total += 1;
          if (this._valueSet.has(c.value)) on += 1;
          if (!c.locked) free += 1;
        } else {
          total += c.leafTotal;
          on += c.leafOn;
          free += c.leafFree;
        }
      }
      node.leafTotal = total;
      node.leafOn = on;
      node.leafFree = free;
    }
  }

  /** @param {TreeNode} node @returns {boolean} */
  isSelected(node) {
    return !!node && !node.dup && this._valueSet.has(node.value);
  }

  /**
   * `aria-checked` of a node in multiple mode: true / false, `mixed` only for a cascade parent.
   * @param {TreeNode} node
   * @returns {'true'|'false'|'mixed'}
   */
  checkState(node) {
    if (this.cascade && !this._isLeaf(node)) {
      if (node.leafOn === 0) return 'false';
      return node.leafOn === node.leafTotal ? 'true' : 'mixed';
    }
    return this.isSelected(node) ? 'true' : 'false';
  }

  /** `single` holding a LOCKED selection: no other pick, no clear (M3). */
  singleLocked() {
    if (this.mode !== 'single' || !this._values.length) return false;
    const node = this._byValue.get(this._values[0]);
    return !!node && node.locked;
  }

  /**
   * Can the USER change this node's selection?
   * @param {TreeNode} node
   * @returns {boolean}
   */
  canSelect(node) {
    if (!node || this.mode === 'none' || node.locked || node.dup) return false;
    if (this.mode === 'single') return !this.singleLocked();
    if (this.cascade && !this._isLeaf(node)) return node.leafFree > 0;
    return true;
  }

  /** @private */
  _add(v) {
    if (this._valueSet.has(v)) return;
    this._values.push(v);
    this._valueSet.add(v);
  }

  /** @private */
  _remove(v) {
    if (!this._valueSet.has(v)) return;
    this._valueSet.delete(v);
    this._values = this._values.filter((x) => x !== v);
  }

  /** @private cascade: add `delta` to the checked-leaf count of every ancestor (O(depth)) */
  _bump(node, delta) {
    for (let p = node.parent; p; p = p.parent) p.leafOn += delta;
  }

  /**
   * USER commit on a node (Enter / Space / click): single selects, multiple toggles, cascade per M3 rules 3-4.
   * @param {TreeNode} node
   * @returns {{ added: string[], removed: string[] }|null} null = nothing changed
   */
  activate(node) {
    if (!this.canSelect(node)) return null;
    if (this.mode === 'single') {
      if (this.isSelected(node)) return null;
      const removed = this.values;
      this._values = [node.value];
      this._valueSet = new Set(this._values);
      return { added: [node.value], removed };
    }
    if (!this.cascade || this._isLeaf(node)) {
      const on = !this.isSelected(node);
      if (on) this._add(node.value);
      else this._remove(node.value);
      if (this.cascade) this._bump(node, on ? 1 : -1);
      return on ? { added: [node.value], removed: [] } : { added: [], removed: [node.value] };
    }
    const leaves = [];
    const stack = [...node.children].reverse();
    while (stack.length) {
      const c = stack.pop();
      if (this._isLeaf(c)) {
        if (!c.locked && !c.dup) leaves.push(c);
      } else {
        for (let i = c.children.length - 1; i >= 0; i--) stack.push(c.children[i]);
      }
    }
    if (!leaves.length) return null;
    const allOn = leaves.every((l) => this.isSelected(l));
    const diff = { added: [], removed: [] };
    for (const leaf of leaves) {
      if (allOn) {
        this._remove(leaf.value);
        this._bump(leaf, -1);
        diff.removed.push(leaf.value);
      } else if (!this.isSelected(leaf)) {
        this._add(leaf.value);
        this._bump(leaf, 1);
        diff.added.push(leaf.value);
      }
    }
    return diff;
  }

  /** @param {string} v @returns {boolean} the value belongs to a locked node */
  _lockedValue(v) {
    const node = this._byValue.get(v);
    return !!node && node.locked;
  }

  /** Is there anything the user may clear? (locked values stay; a locked single blocks it) */
  hasClearable() {
    if (this.singleLocked()) return false;
    return this._values.some((v) => !this._lockedValue(v));
  }

  /**
   * USER clear: every value except the locked ones (a locked single: nothing).
   * @returns {{ added: string[], removed: string[] }|null}
   */
  clear() {
    if (!this.hasClearable()) return null;
    const removed = this.values.filter((v) => !this._lockedValue(v));
    for (const v of removed) this._remove(v);
    this._recount();
    return { added: [], removed };
  }
}
