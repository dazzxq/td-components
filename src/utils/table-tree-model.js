/**
 * Pure tree model behind `td-table tree` (v0.57.0, plan docs/internal/plans/v0.57.0-tree-table.md QĐ 2–4, 9–11, 13,
 * 17–18). Internal module (no package subpath). No DOM: build from nested (`children-key`) or flat (`parent-key`) rows,
 * keys / duplicates / depth, the expanded state by key, the visible list with its ARIA numbers, sibling sort, lazy
 * children (latest-request-wins per generation), `move` (the `moveRow()` rules) and `getTree()`.
 *
 * The model NEVER writes the app's rows or arrays (QĐ 3): the sibling order and the parent after `move` live only in
 * the model's own nodes. Node: `{ key, id, row, parent, depth, children: Node[]|null, lazy, dup, loading, loadError }`
 * — `id` = keyId(key) (null = invalid key → a leaf that cannot be selected), `children === null` = lazy, not loaded.
 */
import { TREE_MAX_DEPTH, TREE_WARN_NODES } from './tree-model.js';
import { keyId } from './key-selection.js';

const COLLATOR = typeof Intl !== 'undefined' ? new Intl.Collator('vi', { numeric: true, sensitivity: 'base' }) : null;

/**
 * Row comparator of the table's client sort (D12) — shared by the flat table and every sibling group of the tree:
 * numbers numerically, strings with a `vi` numeric collator, null / undefined first in asc (last in desc). Callers sort
 * INDICES or a stable array, so ties keep their order. `direction` other than asc / desc → null (no sort).
 * @param {unknown} key column key @param {'asc'|'desc'|null} direction
 * @returns {((a: unknown, b: unknown) => number)|null}
 */
export function compareRows(key, direction) {
  if (direction !== 'asc' && direction !== 'desc') return null;
  const sign = direction === 'asc' ? 1 : -1;
  const val = (row) => (row && typeof row === 'object' ? row[key] : undefined);
  return (ra, rb) => {
    const va = val(ra);
    const vb = val(rb);
    if (va == null && vb == null) return 0;
    if (va == null) return -sign;
    if (vb == null) return sign;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign;
    return (COLLATOR ? COLLATOR.compare(String(va), String(vb)) : String(va).localeCompare(String(vb))) * sign;
  };
}

/** A stable copy of `list` sorted by `cmp` on the rows (null cmp → the list itself). */
function sortNodes(list, cmp) {
  if (!cmp || list.length < 2) return list;
  return list.map((n, i) => [n, i]).sort((a, b) => cmp(a[0].row, b[0].row) || a[1] - b[1]).map((p) => p[0]);
}

export class TableTreeModel {
  /**
   * @param {{ keyOf: (row: unknown) => unknown, warn?: (msg: string) => void }} opts — `keyOf` returns the row's
   *   ORIGINAL key or null (the component's `_keyOf`: rowKey field / function, validated).
   */
  constructor(opts) {
    this._keyOf = opts.keyOf;
    this._warnFn = typeof opts.warn === 'function' ? opts.warn : (msg) => console.warn(msg);
    this._warned = new Set();
    /** generation: bumped by setData / abortAll — a late lazy result of an older generation is dropped */
    this.gen = 0;
    this.roots = [];
    /** id → the owning node (first in preorder at build; later duplicates are leaves) */
    this._owners = new Map();
    /** expanded identities → the original key (insertion order) — lives across data (QĐ 4) */
    this._expanded = new Map();
    this._flat = null;
    this._ownerIdx = null;
    this._loading = new Set();
    this._childrenKey = 'children';
    this._parentKey = null;
    this._hasChildren = (row) => !!row && typeof row === 'object' && row.hasChildren === true;
  }

  _warnOnce(kind, msg) {
    if (this._warned.has(kind)) return;
    this._warned.add(kind);
    this._warnFn(msg);
  }

  // --- build ----------------------------------------------------------------------------------------------------

  /**
   * Replace the rows (new generation: lazy requests in flight are aborted). The expanded keys are kept.
   * @param {unknown[]} data
   * @param {{ childrenKey?: string, parentKey?: string|null, hasChildren?: (row: unknown) => boolean,
   *   readField?: (row: unknown, field: string) => unknown }} [opts]
   */
  setData(data, opts = {}) {
    this.abortAll();
    if (opts.childrenKey) this._childrenKey = String(opts.childrenKey);
    this._parentKey = opts.parentKey ? String(opts.parentKey) : null;
    if (typeof opts.hasChildren === 'function') this._hasChildren = opts.hasChildren;
    this._readField = typeof opts.readField === 'function' ? opts.readField
      : (row, f) => (row && typeof row === 'object' ? row[f] : undefined);
    this._owners = new Map();
    this._count = 0;
    const rows = Array.isArray(data) ? data : [];
    this.roots = this._parentKey ? this._buildFlat(rows) : this._buildNested(rows, null);
    this._dirty();
    if (this._count > TREE_WARN_NODES) {
      this._warnOnce('size', `td-table: tree with ${this._count} rows — consider loadChildren (lazy branches) for large trees.`);
    }
  }

  /** @private one node; registers the key owner (a later duplicate is a leaf, QĐ 2) */
  _node(row, parent) {
    let key = null;
    try { key = this._keyOf(row); } catch { key = null; }
    const id = keyId(key);
    let dup = false;
    if (id !== null) {
      if (this._owners.has(id)) {
        dup = true;
        this._warnOnce('dup', 'td-table: duplicate row key in the tree — a later row with the same key is a leaf (no expand, no selection; its branch is not shown).');
      }
    }
    const node = {
      key: id === null ? null : key, id, row, parent, depth: parent ? parent.depth + 1 : 0,
      children: [], lazy: false, dup, loading: false, loadError: false, seq: 0, ctrl: null, promise: null,
    };
    if (id !== null && !dup) this._owners.set(id, node);
    this._count += 1;
    return node;
  }

  /** @private may this row (no children in the data) load children lazily? */
  _isLazy(row) {
    try { return !!this._hasChildren(row); } catch { return false; }
  }

  _tooDeep(depth) {
    if (depth < TREE_MAX_DEPTH) return false;
    this._warnOnce('depth', `td-table: tree deeper than ${TREE_MAX_DEPTH} levels — the deeper rows are not shown.`);
    return true;
  }

  /** @private nested rows (children-key arrays) under `parent` */
  _buildNested(rows, parent) {
    const out = [];
    const depth = parent ? parent.depth + 1 : 0;
    if (this._tooDeep(depth)) return out;
    const ck = this._childrenKey;
    for (const row of rows) {
      const node = this._node(row, parent);
      out.push(node);
      if (node.id === null || node.dup) continue; // a leaf: its branch is not shown
      const kids = row && typeof row === 'object' ? row[ck] : undefined;
      if (Array.isArray(kids)) node.children = this._buildNested(kids, node);
      else if (this._isLazy(row)) {
        node.children = null;
        node.lazy = true;
      }
    }
    return out;
  }

  /** @private flat rows (parent-key): parent = the row owning `String(row[parentKey])`; orphans / cycles → roots */
  _buildFlat(rows) {
    const pk = this._parentKey;
    const ck = this._childrenKey;
    // pass 1: keys + owners (first row of a key in data order)
    const items = rows.map((row) => ({ row, node: null }));
    for (const it of items) {
      it.node = this._node(it.row, null);
      if (!this._warned.has('both') && it.row && typeof it.row === 'object' && Array.isArray(it.row[ck])) {
        this._warnOnce('both', 'td-table: `parent-key` is set — `children-key` arrays in the rows are ignored.');
      }
    }
    // pass 2: parent identity of each row
    const parentOf = new Map();
    let orphan = false;
    for (const it of items) {
      let pid = null;
      try { pid = keyId(this._readField(it.row, pk)); } catch { pid = null; }
      if (pid !== null && !this._owners.has(pid)) {
        orphan = true;
        pid = null;
      }
      parentOf.set(it.node, pid === null ? null : this._owners.get(pid));
    }
    if (orphan) this._warnOnce('orphan', 'td-table: a row\'s parent key is not in data (orphan) — that row is shown as a root.');
    // pass 3: cycles → EVERY row on a cycle becomes a root (found first, cut after)
    const onCycle = new Set();
    for (const it of items) {
      const seen = new Set([it.node]);
      for (let p = parentOf.get(it.node); p; p = parentOf.get(p)) {
        if (p === it.node) {
          onCycle.add(it.node);
          break;
        }
        if (seen.has(p)) break; // a cycle further up (its own rows are found when they are visited)
        seen.add(p);
      }
    }
    for (const n of onCycle) parentOf.set(n, null);
    const cycle = onCycle.size > 0;
    if (cycle) this._warnOnce('cycle', 'td-table: parent keys form a cycle — the rows of the cycle are shown as roots.');
    // pass 4: attach in data order; depth from the roots (deeper than the cap → dropped with its branch)
    const kids = new Map();
    const roots = [];
    for (const it of items) {
      const p = parentOf.get(it.node);
      if (!p) roots.push(it.node);
      else {
        if (!kids.has(p)) kids.set(p, []);
        kids.get(p).push(it.node);
      }
    }
    const attach = (node, depth) => {
      node.depth = depth;
      const list = kids.get(node) || [];
      if (node.id === null || node.dup) {
        node.children = [];
        for (const c of list) this._dropBranch(c, kids);
        return;
      }
      if (list.length && this._tooDeep(depth + 1)) {
        node.children = [];
        for (const c of list) this._dropBranch(c, kids);
        return;
      }
      for (const c of list) {
        c.parent = node;
        attach(c, depth + 1);
      }
      node.children = list;
      if (!list.length && this._isLazy(node.row)) {
        node.children = null;
        node.lazy = true;
      }
    };
    for (const r of roots) attach(r, 0);
    return roots;
  }

  /** @private a node that is not shown: forget its key ownership (with its branch) */
  _dropBranch(node, kids) {
    if (node.id !== null && this._owners.get(node.id) === node) this._owners.delete(node.id);
    for (const c of kids.get(node) || []) this._dropBranch(c, kids);
  }

  _dirty() {
    this._flat = null;
    this._ownerIdx = null;
  }

  /** Every known node in preorder (model order). */
  get flat() {
    if (!this._flat) {
      const out = [];
      const walk = (list) => {
        for (const n of list) {
          out.push(n);
          if (n.children) walk(n.children);
        }
      };
      walk(this.roots);
      this._flat = out;
    }
    return this._flat;
  }

  /** id → index in `flat` of the node that owns the key (Codex r1 #4: never an index into `data`). */
  get ownerIdx() {
    if (!this._ownerIdx) {
      const m = new Map();
      this.flat.forEach((n, i) => { if (n.id !== null && !n.dup && this._owners.get(n.id) === n) m.set(n.id, i); });
      this._ownerIdx = m;
    }
    return this._ownerIdx;
  }

  /** The node owning an identity, or undefined. */
  ownerOf(id) { return id == null ? undefined : this._owners.get(String(id)); }

  /** The node owning a key (original or identity), or undefined. */
  node(key) {
    const id = keyId(key);
    return id === null ? undefined : this._owners.get(id);
  }

  get size() { return this.flat.length; }

  /** Has the node children to show (loaded, non-empty) or a lazy branch to load? Duplicates / invalid keys: never. */
  expandable(node) {
    if (!node || node.dup || node.id === null) return false;
    return node.children === null ? node.lazy : node.children.length > 0;
  }

  // --- expanded state (QĐ 4) ------------------------------------------------------------------------------------

  isExpanded(node) { return !!node && node.id !== null && !node.dup && this._expanded.has(node.id); }

  /** @returns {boolean} changed */
  expand(key) {
    const id = keyId(key);
    if (id === null || this._expanded.has(id)) return false;
    const n = this._owners.get(id);
    this._expanded.set(id, n ? n.key : key);
    return true;
  }

  /** @returns {boolean} changed */
  collapse(key) {
    const id = keyId(key);
    return id !== null && this._expanded.delete(id);
  }

  /** Replace the expanded keys (invalid entries ignored). */
  setExpanded(keys) {
    this._expanded = new Map();
    const list = keys == null ? [] : typeof keys === 'string' || typeof keys[Symbol.iterator] !== 'function' ? [keys] : [...keys];
    for (const k of list) {
      const id = keyId(k);
      if (id !== null && !this._expanded.has(id)) this._expanded.set(id, k);
    }
  }

  /** Expanded keys: the known ones in preorder, then the remembered ones (not in the tree now) in the order received. */
  expandedKeys() {
    const out = [];
    const done = new Set();
    for (const n of this.flat) {
      if (n.id !== null && !n.dup && this._expanded.has(n.id) && !done.has(n.id)) {
        out.push(this._expanded.get(n.id));
        done.add(n.id);
      }
    }
    for (const [id, k] of this._expanded) if (!done.has(id)) out.push(k);
    return out;
  }

  /** Expand every LOADED branch (lazy ones are not loaded — no request storm). */
  expandAll() {
    for (const n of this.flat) {
      if (n.children && n.children.length && this.expandable(n) && !this._expanded.has(n.id)) this._expanded.set(n.id, n.key);
    }
  }

  collapseAll() { this._expanded = new Map(); }

  // --- visible list (QĐ 6, 9, 10) -------------------------------------------------------------------------------

  /** Roots in display order (sorted by `cmp` within the group, stable). */
  sortedRoots(cmp) { return sortNodes(this.roots, cmp); }

  /** Children of a node in display order. */
  sortedChildren(node, cmp) { return node.children ? sortNodes(node.children, cmp) : []; }

  /**
   * Preorder of the rows to show: the given roots (a page, display order), each followed by its open branches.
   * Entry: `{ node, level, setsize, posinset }`; an open branch without loaded children gets ONE status entry
   * `{ status, node: <parent>, level }` when `opts.status(node)` says so ('loading' | 'error').
   * @param {object[]} roots @param {Function|null} cmp
   * @param {{ offset?: number, total?: number, status?: (node: object) => string|null }} [opts]
   */
  visible(roots, cmp, opts = {}) {
    const out = [];
    const offset = Number.isFinite(opts.offset) ? opts.offset : 0;
    const total = Number.isFinite(opts.total) ? opts.total : roots.length;
    const status = typeof opts.status === 'function' ? opts.status : null;
    const walk = (node, level, setsize, posinset) => {
      out.push({ node, level, setsize, posinset });
      if (!this.isExpanded(node) || !this.expandable(node)) return;
      if (node.children === null) {
        const s = status ? status(node) : null;
        if (s) out.push({ status: s, node, level: level + 1, setsize: 1, posinset: 1 });
        return;
      }
      const kids = sortNodes(node.children, cmp);
      kids.forEach((c, i) => walk(c, level + 1, kids.length, i + 1));
    };
    roots.forEach((r, i) => walk(r, 1, total, offset + i + 1));
    return out;
  }

  // --- lazy children (QĐ 13) ------------------------------------------------------------------------------------

  /**
   * Load a lazy node's children with `loader(row, { signal })`. Resolves `{ ok: true, n }`, `{ ok: false, error }`
   * or `{ stale: true }` (another generation / aborted — nothing changed). A second call while loading shares the
   * request. `[]` → the node becomes a leaf; anything but an array → error.
   */
  load(node, loader) {
    if (node.loading && node.promise) return node.promise;
    const gen = this.gen;
    const seq = ++node.seq;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    node.ctrl = ctrl;
    node.loading = true;
    node.loadError = false;
    this._loading.add(node);
    let ret;
    try {
      ret = loader(node.row, { signal: ctrl ? ctrl.signal : undefined });
    } catch (err) {
      ret = Promise.reject(err);
    }
    const p = Promise.resolve(ret).then(
      (res) => this._loaded(node, gen, seq, res, null),
      (err) => this._loaded(node, gen, seq, null, err == null ? new Error('loadChildren rejected') : err),
    );
    node.promise = p;
    return p;
  }

  /** @private */
  _loaded(node, gen, seq, res, err) {
    if (gen !== this.gen || node.seq !== seq || !node.loading) return { stale: true };
    node.loading = false;
    node.ctrl = null;
    node.promise = null;
    this._loading.delete(node);
    if (err || !Array.isArray(res)) {
      node.loadError = true;
      return { ok: false, error: err || new TypeError('loadChildren must resolve to an array') };
    }
    const kids = this._parentKey ? this._buildLevel(res, node) : this._buildNested(res, node);
    node.children = kids;
    node.lazy = false;
    this._dirty();
    return { ok: true, n: kids.length };
  }

  /** @private flat mode: ONE level of loaded children (their parent field is not read) */
  _buildLevel(rows, parent) {
    const out = [];
    if (this._tooDeep(parent.depth + 1)) return out;
    for (const row of rows) {
      const node = this._node(row, parent);
      out.push(node);
      if (node.id !== null && !node.dup && this._isLazy(row)) {
        node.children = null;
        node.lazy = true;
      }
    }
    return out;
  }

  /** Abort every request in flight (new data, disconnect): loading nodes go back to not loaded. */
  abortAll() {
    this.gen += 1;
    for (const node of this._loading) {
      try { node.ctrl?.abort(); } catch { /* ignore */ }
      node.loading = false;
      node.ctrl = null;
      node.promise = null;
    }
    this._loading.clear();
  }

  // --- move (QĐ 17, 18) -----------------------------------------------------------------------------------------

  /** @private is `a` the node `b` or one of its ancestors? */
  _isSelfOrAncestor(a, b) {
    for (let p = b; p; p = p.parent) if (p === a) return true;
    return false;
  }

  /** @private levels below `node` (0 = no loaded children) */
  _height(node) {
    let h = 0;
    for (const c of node.children || []) h = Math.max(h, 1 + this._height(c));
    return h;
  }

  /**
   * Move a row (with its branch) under `parentKey` (null = root) at the FINAL index `index` of the new sibling group
   * (counted after removing the source). Refused → `{ ok: false }` + one warning; same place → `{ ok: true, noop: true }`
   * (canDrop not called). Applied → `{ ok: true, node, from: { parent, index }, to: { parent, index } }`.
   * @param {{ maxDepth?: number, canDrop?: Function }} [opts]
   */
  move(key, parentKey, index, opts = {}) {
    const refuse = (msg) => {
      this._warnFn(`td-table: moveRow refused — ${msg}.`);
      return { ok: false };
    };
    const node = this.node(key);
    if (!node) return refuse('unknown key');
    let parent = null;
    if (parentKey !== null && parentKey !== undefined) {
      parent = this.node(parentKey);
      if (!parent) return refuse('unknown parent key');
      if (parent.children === null) return refuse('the parent\'s children are not loaded');
      if (this._isSelfOrAncestor(node, parent)) return refuse('a row cannot move into itself or its own branch');
    }
    if (!Number.isInteger(index) || index < 0) return refuse('index must be an integer ≥ 0');
    const fromList = node.parent ? node.parent.children : this.roots;
    const fromIndex = fromList.indexOf(node);
    const toList = parent ? parent.children : this.roots;
    const n = toList.length - (toList === fromList ? 1 : 0);
    const to = Math.min(index, n);
    if (toList === fromList && to === fromIndex) return { ok: true, noop: true, node };
    const level = (parent ? parent.depth + 1 : 0) + 1;
    const maxDepth = Number.isInteger(opts.maxDepth) && opts.maxDepth >= 1 ? Math.min(opts.maxDepth, TREE_MAX_DEPTH) : TREE_MAX_DEPTH;
    if (level + this._height(node) > maxDepth) return refuse(`the branch would go deeper than max-depth (${maxDepth})`);
    if (typeof opts.canDrop === 'function') {
      let ok = false;
      try {
        ok = !!opts.canDrop({ key: node.key, row: node.row, parentKey: parent ? parent.key : null,
          parentRow: parent ? parent.row : null, index: to, level });
      } catch (err) {
        return refuse(`canDrop threw (${err && err.message ? err.message : err})`);
      }
      if (!ok) return refuse('canDrop returned false');
    }
    const from = { parent: node.parent, index: fromIndex };
    fromList.splice(fromIndex, 1);
    toList.splice(to, 0, node);
    node.parent = parent;
    const relevel = (x, d) => {
      x.depth = d;
      for (const c of x.children || []) relevel(c, d + 1);
    };
    relevel(node, level - 1);
    this._dirty();
    return { ok: true, node, from, to: { parent, index: to } };
  }

  /** Snapshot in model order: `[{ key, row, children: [...] | null }]` (null = lazy, not loaded yet). */
  getTree() {
    const snap = (list) => list.map((n) => ({ key: n.key, row: n.row, children: n.children === null ? null : snap(n.children) }));
    return snap(this.roots);
  }
}
