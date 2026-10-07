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
    /** committed build config (changed only by a SUCCESSFUL setData — Codex r2 #2) */
    this._cfg = {
      childrenKey: 'children',
      parentKey: null,
      hasChildren: (row) => !!row && typeof row === 'object' && row.hasChildren === true,
      readField: (row, f) => (row && typeof row === 'object' ? row[f] : undefined),
    };
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
    const old = this._cfg;
    const cfg = {
      childrenKey: opts.childrenKey ? String(opts.childrenKey) : old.childrenKey,
      parentKey: opts.parentKey ? String(opts.parentKey) : null,
      hasChildren: typeof opts.hasChildren === 'function' ? opts.hasChildren : old.hasChildren,
      readField: typeof opts.readField === 'function' ? opts.readField : old.readField,
    };
    const rows = Array.isArray(data) ? data : [];
    // Codex r1 #1 / r2 #2: config, roots and owners are built LOCALLY; only after the build succeeded are the old
    // requests aborted, the generation bumped and everything committed — a throwing build (a row getter / proxy) leaves
    // the previous tree, its config and its loads in flight untouched. Every walk is iterative (no recursion on depth).
    const ctx = { owners: new Map(), base: null, count: 0, cfg };
    const roots = cfg.parentKey ? this._buildFlat(rows, ctx) : this._buildNested(rows, null, ctx);
    this.abortAll();
    this._cfg = cfg;
    this._owners = ctx.owners;
    this.roots = roots;
    this._dirty();
    if (ctx.count > TREE_WARN_NODES) {
      this._warnOnce('size', `td-table: tree with ${ctx.count} rows — consider loadChildren (lazy branches) for large trees.`);
    }
  }

  /**
   * @private one node; registers the key owner in `ctx.owners` (a key already owned there or in `ctx.base` → a later
   * duplicate: a leaf, QĐ 2)
   */
  _node(row, parent, ctx) {
    let key = null;
    try { key = this._keyOf(row); } catch { key = null; }
    const id = keyId(key);
    let dup = false;
    if (id !== null && (ctx.owners.has(id) || (ctx.base && ctx.base.has(id)))) {
      dup = true;
      this._warnOnce('dup', 'td-table: duplicate row key in the tree — a later row with the same key is a leaf (no expand, no selection; its branch is not shown).');
    }
    const node = {
      key: id === null ? null : key, id, row, parent, depth: parent ? parent.depth + 1 : 0,
      children: [], lazy: false, dup, loading: false, loadError: false, seq: 0, ctrl: null, promise: null,
    };
    if (id !== null && !dup) ctx.owners.set(id, node);
    ctx.count += 1;
    return node;
  }

  /** @private may this row (no children in the data) load children lazily? */
  _isLazy(row, ctx) {
    try { return !!ctx.cfg.hasChildren(row); } catch { return false; }
  }

  _tooDeep(depth) {
    if (depth < TREE_MAX_DEPTH) return false;
    this._warnOnce('depth', `td-table: tree deeper than ${TREE_MAX_DEPTH} levels — the deeper rows are not shown.`);
    return true;
  }

  /**
   * @private nested rows (children-key arrays) under `parent`, preorder (the first row of a key in preorder owns it).
   * Iterative (explicit stack of sibling lists); rows deeper than the cap are never visited.
   */
  _buildNested(rows, parent, ctx) {
    const out = [];
    if (this._tooDeep(parent ? parent.depth + 1 : 0)) return out;
    const ck = ctx.cfg.childrenKey;
    const stack = [{ rows, i: 0, parent, out }];
    while (stack.length) {
      const f = stack[stack.length - 1];
      if (f.i >= f.rows.length) {
        stack.pop();
        continue;
      }
      const row = f.rows[f.i++];
      const node = this._node(row, f.parent, ctx);
      f.out.push(node);
      if (node.id === null || node.dup) continue; // a leaf: its branch is not shown
      const kids = row && typeof row === 'object' ? row[ck] : undefined;
      if (Array.isArray(kids)) {
        node.children = [];
        if (kids.length && !this._tooDeep(node.depth + 1)) stack.push({ rows: kids, i: 0, parent: node, out: node.children });
      } else if (this._isLazy(row, ctx)) {
        node.children = null;
        node.lazy = true;
      }
    }
    return out;
  }

  /**
   * @private flat rows (parent-key): parent = the row owning `String(row[parentKey])`; orphans / cycles → roots.
   * Codex sec r1 #2: O(n) — the parent links form a functional graph; one colouring pass (unvisited / on the current
   * path / done) finds every cycle, a memoised pass computes the depths; rows deeper than the cap are dropped.
   */
  _buildFlat(rows, ctx) {
    const pk = ctx.cfg.parentKey;
    const ck = ctx.cfg.childrenKey;
    const n = rows.length;
    const nodes = new Array(n);
    for (let i = 0; i < n; i++) {
      const row = rows[i];
      nodes[i] = this._node(row, null, ctx);
      if (!this._warned.has('both') && row && typeof row === 'object' && Array.isArray(row[ck])) {
        this._warnOnce('both', 'td-table: `parent-key` is set — `children-key` arrays in the rows are ignored.');
      }
    }
    const index = new Map();
    for (let i = 0; i < n; i++) index.set(nodes[i], i);
    // parent index of each row (-1 = root)
    const par = new Int32Array(n).fill(-1);
    let orphan = false;
    for (let i = 0; i < n; i++) {
      let pid = null;
      try { pid = keyId(ctx.cfg.readField(rows[i], pk)); } catch { pid = null; }
      if (pid === null) continue;
      const owner = ctx.owners.get(pid);
      if (!owner) orphan = true;
      else par[i] = index.get(owner);
    }
    if (orphan) this._warnOnce('orphan', 'td-table: a row\'s parent key is not in data (orphan) — that row is shown as a root.');
    // cycles: 0 unvisited · 1 on the current path · 2 done
    const state = new Uint8Array(n);
    const path = [];
    let cycle = false;
    for (let s = 0; s < n; s++) {
      if (state[s]) continue;
      path.length = 0;
      let v = s;
      while (v !== -1 && state[v] === 0) {
        state[v] = 1;
        path.push(v);
        v = par[v];
      }
      if (v !== -1 && state[v] === 1) {
        // the path from v to its end is a cycle: every row on it becomes a root
        cycle = true;
        const members = [];
        for (let k = path.length - 1; k >= 0; k--) {
          members.push(path[k]);
          if (path[k] === v) break;
        }
        for (const m of members) par[m] = -1;
      }
      for (const p of path) state[p] = 2;
    }
    if (cycle) this._warnOnce('cycle', 'td-table: parent keys form a cycle — the rows of the cycle are shown as roots.');
    // depths (memoised, iterative)
    const depth = new Int32Array(n).fill(-1);
    for (let s = 0; s < n; s++) {
      if (depth[s] >= 0) continue;
      path.length = 0;
      let v = s;
      while (v !== -1 && depth[v] < 0) {
        path.push(v);
        v = par[v];
      }
      let d = v === -1 ? -1 : depth[v];
      for (let k = path.length - 1; k >= 0; k--) depth[path[k]] = ++d;
    }
    // attach in data order; a row at depth ≥ the cap is dropped (its key forgotten), so are its descendants
    const hadKids = new Uint8Array(n);
    const roots = [];
    let deep = false;
    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      node.depth = depth[i];
      if (depth[i] >= TREE_MAX_DEPTH) {
        deep = true;
        if (node.id !== null && ctx.owners.get(node.id) === node) ctx.owners.delete(node.id);
        continue;
      }
      const p = par[i];
      if (p === -1) {
        roots.push(node);
        continue;
      }
      hadKids[p] = 1;
      const parent = nodes[p];
      if (parent.id === null || parent.dup) continue; // never: a parent is an owner
      node.parent = parent;
      parent.children.push(node);
    }
    if (deep) this._tooDeep(TREE_MAX_DEPTH);
    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      if (depth[i] >= TREE_MAX_DEPTH || node.id === null || node.dup) continue;
      if (!hadKids[i] && this._isLazy(node.row, ctx)) {
        node.children = null;
        node.lazy = true;
      }
    }
    return roots;
  }

  _dirty() {
    this._flat = null;
    this._ownerIdx = null;
  }

  /** Every known node in preorder (model order). */
  get flat() {
    if (!this._flat) {
      const out = [];
      const stack = this.roots.slice().reverse();
      while (stack.length) {
        const n = stack.pop();
        out.push(n);
        if (n.children) for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
      }
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
    // preorder, iterative (explicit stack of frames pushed in reverse)
    const stack = [];
    for (let i = roots.length - 1; i >= 0; i--) stack.push({ node: roots[i], level: 1, setsize: total, posinset: offset + i + 1 });
    while (stack.length) {
      const e = stack.pop();
      if (e.status) {
        out.push(e);
        continue;
      }
      const { node, level } = e;
      out.push(e);
      if (!this.isExpanded(node) || !this.expandable(node)) continue;
      if (node.children === null) {
        const s = status ? status(node) : null;
        if (s) stack.push({ status: s, node, level: level + 1, setsize: 1, posinset: 1 });
        continue;
      }
      const kids = sortNodes(node.children, cmp);
      for (let i = kids.length - 1; i >= 0; i--) stack.push({ node: kids[i], level: level + 1, setsize: kids.length, posinset: i + 1 });
    }
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
    // Codex r2 #3: materialising the result may throw (a row getter, an array proxy) → an ERROR (retry), never a
    // rejected promise with the node half-loaded; built locally, committed after success
    let kids;
    const ctx = { owners: new Map(), base: this._owners, count: 0, cfg: this._cfg };
    try {
      kids = this._cfg.parentKey ? this._buildLevel(res, node, ctx) : this._buildNested(res, node, ctx);
    } catch (e) {
      node.loadError = true;
      return { ok: false, error: e == null ? new Error('loadChildren result could not be read') : e };
    }
    for (const [id, owner] of ctx.owners) this._owners.set(id, owner); // committed after a complete build
    node.children = kids;
    node.lazy = false;
    this._dirty();
    return { ok: true, n: kids.length };
  }

  /** @private flat mode: ONE level of loaded children (their parent field is not read) */
  _buildLevel(rows, parent, ctx) {
    const out = [];
    if (this._tooDeep(parent.depth + 1)) return out;
    for (const row of rows) {
      const node = this._node(row, parent, ctx);
      out.push(node);
      if (node.id !== null && !node.dup && this._isLazy(row, ctx)) {
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
    const stack = [[node, 0]];
    while (stack.length) {
      const [x, d] = stack.pop();
      if (d > h) h = d;
      for (const c of x.children || []) stack.push([c, d + 1]);
    }
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
    const stack = [[node, level - 1]];
    while (stack.length) {
      const [x, d] = stack.pop();
      x.depth = d;
      for (const c of x.children || []) stack.push([c, d + 1]);
    }
    this._dirty();
    return { ok: true, node, from, to: { parent, index: to } };
  }

  /** Snapshot in model order: `[{ key, row, children: [...] | null }]` (null = lazy, not loaded yet). */
  getTree() {
    const out = [];
    const stack = this.roots.map((n) => [n, out]).reverse();
    while (stack.length) {
      const [n, into] = stack.pop();
      const t = { key: n.key, row: n.row, children: n.children === null ? null : [] };
      into.push(t);
      if (n.children) for (let i = n.children.length - 1; i >= 0; i--) stack.push([n.children[i], t.children]);
    }
    return out;
  }
}
