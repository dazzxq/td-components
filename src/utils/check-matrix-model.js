/**
 * Pure model of <td-check-matrix> (v0.47.0, plan docs/internal/plans/v0.47.0-check-matrix.md QĐ 2–14). Internal (no
 * package subpath); php/td.php `td__check_matrix_data()` applies the same rules (parity table MATRIX_CASES).
 *
 * - `validateMatrix({ columns, rows, cells, value })` — the ONE validation path (QĐ 6). A structural error fails CLOSED
 *   as a whole (`{ ok: false, reason }`): dropping one bad row would make it absent from every column, i.e. REVOKE it.
 *   Text (labels, descriptions, notes) is normalised + cut, never an error.
 * - `canonicalMatrix(model)` — the JSON-able data the model stands for (PHP prints the same object in the host `data`
 *   attribute; parity + hydrate gate read it).
 * - `MatrixState` — the live ticks + incremental counters (QĐ 8: O(1) per cell) + bulk rules (QĐ 7) + FormData (QĐ 10–12)
 *   + restore state (QĐ 14).
 *
 * Cell index = row × columnCount + column. Rows are the LEAF rows in display order; groups (one level) own a contiguous
 * range [start, end) of them.
 */

/** Key of a row / column / group (QĐ 4): no `[` `]` (PHP splits them), no leading `_` (reserved: `_v`), no spaces. */
export const CHECK_MATRIX_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

/** Hard limits (QĐ 5). `json` / `state` in UTF-16 code units of the attribute / restore string. */
export const MATRIX_LIMITS = Object.freeze({
  rows: 500, columns: 32, cells: 10000, groups: 64, label: 200, text: 300, json: 512 * 1024, state: 256 * 1024,
});

/** Bit flags of a cell. */
const LOCK = 1;
const NA = 2;

/**
 * Text normalisation shared with PHP `td__check_matrix_text()` (byte parity): tab / CR / LF / FF / VT → space, every
 * other C0 / C1 control and DEL removed, runs of U+0020 collapsed, trimmed (U+0020 only), cut to `max` code points,
 * trimmed again (the cut may end on a space — keeps the function idempotent). Lone surrogates → U+FFFD.
 * @param {string} s
 * @param {number} max
 * @returns {string}
 */
export function normalizeMatrixText(s, max) {
  let t = wellFormed(String(s));
  t = t.replace(/[\t\n\v\f\r]/g, ' ').replace(/[\u0000-\u001F\u007F-\u009F]/g, '').replace(/ {2,}/g, ' ');
  t = t.replace(/^ +| +$/g, '');
  const cps = [...t];
  if (cps.length > max) t = cps.slice(0, max).join('').replace(/ +$/, '');
  return t;
}

/** Lone surrogates → U+FFFD (no lookbehind: older WebKit). */
function wellFormed(s) {
  if (typeof s.toWellFormed === 'function') return s.toWellFormed();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    if (u >= 0xd800 && u <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      out += s[i] + s[i + 1];
      i++;
    } else out += u >= 0xd800 && u <= 0xdfff ? '\uFFFD' : s[i];
  }
  return out;
}

/** Prototype Object.prototype or null (no array, Map, class instance). */
function isPlain(o) {
  if (o === null || typeof o !== 'object') return false;
  const p = Object.getPrototypeOf(o);
  return p === Object.prototype || p === null;
}

/** "No special cells / no ticks": undefined, null, {} or []. */
function isEmptyMap(o) {
  return o == null || (Array.isArray(o) && o.length === 0) || (isPlain(o) && Object.keys(o).length === 0);
}

/**
 * A key as given by the app → its string form, or null (QĐ 4).
 * @param {unknown} k
 * @returns {string|null}
 */
export function matrixKey(k) {
  if (typeof k === 'string') return CHECK_MATRIX_KEY.test(k) ? k : null;
  if (typeof k === 'number' && Number.isSafeInteger(k) && k >= 0) return String(k);
  return null;
}

/** Strict boolean flag: absent / undefined / null = false; else a real boolean, or the error token. */
const FLAG_ERR = Symbol('flag');
function flag(v) {
  if (v === undefined || v === null) return false;
  return typeof v === 'boolean' ? v : FLAG_ERR;
}

/** Optional text: absent / null = '' (none); a string → normalised; anything else → null (error). */
function text(v, max) {
  if (v === undefined || v === null) return '';
  return typeof v === 'string' ? normalizeMatrixText(v, max) : null;
}

class Fail extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}
const fail = (reason) => { throw new Fail(reason); };

/**
 * @typedef {{ key: string, raw: string|number, label: string, description: string, locked: boolean }} MatrixColumn
 * @typedef {{ key: string, raw: string|number, label: string, description: string, locked: boolean, group: number }} MatrixRow
 * @typedef {{ key: string, raw: string|number, label: string, collapsed: boolean, locked: boolean, start: number, end: number }} MatrixGroup
 * @typedef {{ columns: MatrixColumn[], rows: MatrixRow[], groups: MatrixGroup[], segments: Array<{ group: number, start: number, end: number }>,
 *   flags: Uint8Array, cellLock: Uint8Array, notes: Map<number, string>, value: Uint8Array, rowIndex: Map<string, number>,
 *   colIndex: Map<string, number>, groupIndex: Map<string, number> }} MatrixModel
 */

/** @returns {{ key: string, raw: any, label: string, description: string, locked: boolean }} */
function header(def, kind, keys) {
  if (!isPlain(def)) fail(`${kind === 'column' ? 'columns' : 'rows'}-shape`);
  const key = matrixKey(def.key);
  if (key === null) fail(`${kind}-key`);
  if (keys.has(key)) fail(`duplicate-${kind}`);
  keys.add(key);
  const label = text(def.label, MATRIX_LIMITS.label);
  const description = kind === 'group' ? '' : text(def.description, MATRIX_LIMITS.text);
  if (label === null || description === null) fail('label');
  const locked = flag(def.locked);
  if (locked === FLAG_ERR) fail('flag');
  return { key, raw: def.key, label: label || key, description, locked };
}

/**
 * The ONE validation path (QĐ 6). Never throws.
 * @param {{ columns?: unknown, rows?: unknown, cells?: unknown, value?: unknown }} data
 * @returns {{ ok: true, model: MatrixModel, reason: null } | { ok: false, model: null, reason: string }}
 */
export function validateMatrix(data) {
  try {
    return { ok: true, model: build(data || {}), reason: null };
  } catch (e) {
    if (e instanceof Fail) return { ok: false, model: null, reason: e.reason };
    throw e;
  }
}

function build({ columns, rows, cells, value }) {
  if (!Array.isArray(columns) || !columns.length) fail('columns-shape');
  if (!Array.isArray(rows) || !rows.length) fail('rows-shape');
  if (columns.length > MATRIX_LIMITS.columns) fail('too-many-columns');
  const colKeys = new Set();
  const cols = columns.map((c) => header(c, 'column', colKeys));
  const rowKeys = new Set();
  const groupKeys = new Set();
  /** @type {MatrixRow[]} */
  const leaves = [];
  /** @type {MatrixGroup[]} */
  const groups = [];
  const segments = [];
  const leaf = (def, g, inheritLock) => {
    if (isPlain(def) && def.rows !== undefined) fail(g < 0 ? 'rows-shape' : 'nested-group');
    const h = header(def, 'row', rowKeys);
    leaves.push({ ...h, locked: h.locked || inheritLock, group: g });
    if (leaves.length > MATRIX_LIMITS.rows) fail('too-many-rows');
  };
  for (const def of rows) {
    if (isPlain(def) && def.rows !== undefined) {
      if (!Array.isArray(def.rows)) fail('rows-shape');
      const h = header(def, 'group', groupKeys);
      const collapsed = flag(def.collapsed);
      if (collapsed === FLAG_ERR) fail('flag');
      const g = groups.length;
      if (g >= MATRIX_LIMITS.groups) fail('too-many-groups');
      const start = leaves.length;
      for (const child of def.rows) {
        if (isPlain(child) && child.rows !== undefined) fail('nested-group');
        leaf(child, g, h.locked);
      }
      groups.push({ key: h.key, raw: h.raw, label: h.label, collapsed, locked: h.locked, start, end: leaves.length });
      segments.push({ group: g, start, end: leaves.length });
    } else {
      const last = segments[segments.length - 1];
      if (last && last.group < 0) last.end += 1;
      else segments.push({ group: -1, start: leaves.length, end: leaves.length + 1 });
      leaf(def, -1, false);
    }
  }
  if (!leaves.length) fail('rows-shape');
  const R = leaves.length;
  const C = cols.length;
  if (R * C > MATRIX_LIMITS.cells) fail('too-many-cells');
  const rowIndex = new Map(leaves.map((r, i) => [r.key, i]));
  const colIndex = new Map(cols.map((c, j) => [c.key, j]));
  const groupIndex = new Map(groups.map((g, i) => [g.key, i]));

  // cells (schema table of QĐ 6)
  const flags = new Uint8Array(R * C);
  const cellLock = new Uint8Array(R * C); // the cell's OWN locked flag (canonical data keeps it apart from row / column locks)
  const notes = new Map();
  if (!isEmptyMap(cells)) {
    if (!isPlain(cells)) fail('cells-shape');
    for (const rk of Object.keys(cells)) {
      const r = rowIndex.get(rk);
      if (r === undefined) fail('cells-unknown-row');
      const row = cells[rk];
      if (!isPlain(row)) fail('cells-shape');
      for (const ck of Object.keys(row)) {
        const c = colIndex.get(ck);
        if (c === undefined) fail('cells-unknown-column');
        const cell = row[ck];
        if (!isPlain(cell)) fail('cells-shape');
        const locked = flag(cell.locked);
        const na = flag(cell.na);
        if (locked === FLAG_ERR || na === FLAG_ERR) fail('cells-flag');
        const note = text(cell.note, MATRIX_LIMITS.text);
        if (note === null) fail('cells-note');
        const i = r * C + c;
        cellLock[i] = locked ? 1 : 0;
        flags[i] = (locked ? LOCK : 0) | (na ? NA : 0);
        if (note) notes.set(i, note);
      }
    }
  }
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) if (leaves[r].locked || cols[c].locked) flags[r * C + c] |= LOCK;
  }

  // value (ticked cells, by column)
  const on = new Uint8Array(R * C);
  if (!isEmptyMap(value)) {
    if (!isPlain(value)) fail('value-shape');
    for (const ck of Object.keys(value)) {
      const c = colIndex.get(ck);
      if (c === undefined) fail('value-unknown-column');
      const list = value[ck];
      if (!Array.isArray(list)) fail('value-shape');
      for (const item of list) {
        const rk = matrixKey(item);
        if (rk === null) fail('value-shape');
        const r = rowIndex.get(rk);
        if (r === undefined) fail('value-unknown-row');
        const i = r * C + c;
        if (flags[i] & NA) fail('value-na');
        on[i] = 1;
      }
    }
  }
  return { columns: cols, rows: leaves, groups, segments, flags, cellLock, notes, value: on, rowIndex, colIndex, groupIndex };
}

/** Is cell `i` not applicable? */
export const isNa = (model, i) => (model.flags[i] & NA) !== 0;
/** Is cell `i` locked (cell, row or column lock)? n/a wins: an n/a cell is never "locked" (it has no control). */
export const isLocked = (model, i) => (model.flags[i] & (LOCK | NA)) === LOCK;

/**
 * The canonical, JSON-able data of a model (PHP prints the same object in the `data` attribute): keys as strings, text
 * normalised, flags only when true, `cells` only special cells, `value` every column (row display order).
 * @param {MatrixModel} model
 * @param {Uint8Array} [on] ticks (default: the model's value)
 */
export function canonicalMatrix(model, on = model.value) {
  const C = model.columns.length;
  const head = (h, desc = true) => {
    const o = { key: h.key, label: h.label };
    if (desc && h.description) o.description = h.description;
    return o;
  };
  const columns = model.columns.map((c) => Object.assign(head(c), c.locked ? { locked: true } : {}));
  const rowOut = (r) => {
    const row = model.rows[r];
    const g = row.group >= 0 ? model.groups[row.group] : null;
    return Object.assign(head(row), row.locked && !(g && g.locked) ? { locked: true } : {});
  };
  const rows = [];
  for (const s of model.segments) {
    if (s.group < 0) {
      for (let r = s.start; r < s.end; r++) rows.push(rowOut(r));
    } else {
      const g = model.groups[s.group];
      const o = { key: g.key, label: g.label };
      if (g.collapsed) o.collapsed = true;
      if (g.locked) o.locked = true;
      o.rows = [];
      for (let r = s.start; r < s.end; r++) o.rows.push(rowOut(r));
      rows.push(o);
    }
  }
  const cells = {};
  for (let r = 0; r < model.rows.length; r++) {
    for (let c = 0; c < C; c++) {
      const i = r * C + c;
      const na = (model.flags[i] & NA) !== 0;
      const lock = model.cellLock[i] === 1;
      const note = model.notes.get(i);
      if (!na && !lock && !note) continue;
      const cell = {};
      if (lock) cell.locked = true;
      if (na) cell.na = true;
      if (note) cell.note = note;
      (cells[model.rows[r].key] ||= {})[model.columns[c].key] = cell;
    }
  }
  const value = {};
  model.columns.forEach((col, c) => {
    value[col.key] = [];
    for (let r = 0; r < model.rows.length; r++) if (on[r * C + c]) value[col.key].push(model.rows[r].key);
  });
  return { columns, rows, cells, value };
}

/**
 * FormData of the matrix (QĐ 10–12): `name[col]=''` for every column (first, column order), `name[col][]=row` per
 * ticked cell incl. locked-ticked ones (row-major display order), `name[_v]=1` last. null (= no entry at all, QĐ 13)
 * when `name` is empty or ends with `[]`.
 * @param {string} name
 * @param {MatrixModel} model
 * @param {Uint8Array} on
 * @returns {Array<[string, string]>|null}
 */
export function matrixEntries(name, model, on) {
  if (typeof name !== 'string' || name === '' || name.endsWith('[]')) return null;
  const C = model.columns.length;
  const out = model.columns.map((c) => [`${name}[${c.key}]`, '']);
  for (let r = 0; r < model.rows.length; r++) {
    for (let c = 0; c < C; c++) {
      const i = r * C + c;
      if (on[i] && !(model.flags[i] & NA)) out.push([`${name}[${model.columns[c].key}][]`, model.rows[r].key]);
    }
  }
  out.push([`${name}[_v]`, '1']);
  return out;
}

/** Bulk kinds (QĐ 7). */
export const BULK_KINDS = Object.freeze(['all', 'row', 'column', 'group', 'group-column']);

/**
 * Live ticks + incremental counters (QĐ 8). Every set keeps `total` (applicable cells), `on` (ticked, locked
 * included), `free` (applicable + not locked) and `lockedOn` (constant: locked + ticked).
 */
export class MatrixState {
  /**
   * @param {MatrixModel} model
   * @param {Uint8Array} [on] live ticks (default: the model's value)
   * @param {Uint8Array} [def] defaults (changed = on ≠ default; default: the model's value)
   */
  constructor(model, on = model.value, def = model.value) {
    this.model = model;
    this.on = Uint8Array.from(on);
    this.def = Uint8Array.from(def);
    const R = model.rows.length;
    const C = model.columns.length;
    const G = model.groups.length;
    const mk = (n) => ({ total: new Int32Array(n), on: new Int32Array(n), free: new Int32Array(n), lockedOn: new Int32Array(n) });
    this.rowS = mk(R);
    this.colS = mk(C);
    this.gcS = mk(G * C);
    this.grpS = mk(G);
    this.allS = mk(1);
    this.changed = 0;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        if (model.flags[i] & NA) continue;
        const locked = (model.flags[i] & LOCK) !== 0;
        this._each(r, c, (s, k) => {
          s.total[k]++;
          if (!locked) s.free[k]++;
          if (this.on[i]) {
            s.on[k]++;
            if (locked) s.lockedOn[k]++;
          }
        });
        if (this.on[i] !== this.def[i]) this.changed++;
      }
    }
  }

  /** @private run `fn(stats, index)` for the 3–5 sets containing cell (r, c) */
  _each(r, c, fn) {
    const g = this.model.rows[r].group;
    fn(this.rowS, r);
    fn(this.colS, c);
    fn(this.allS, 0);
    if (g >= 0) {
      fn(this.gcS, g * this.model.columns.length + c);
      fn(this.grpS, g);
    }
  }

  /** @private set one cell (no lock check) */
  _set(i, v) {
    if (this.on[i] === v) return false;
    const C = this.model.columns.length;
    const r = Math.floor(i / C);
    const c = i - r * C;
    const was = this.on[i] !== this.def[i];
    this.on[i] = v;
    const d = v ? 1 : -1;
    this._each(r, c, (s, k) => { s.on[k] += d; });
    const now = this.on[i] !== this.def[i];
    if (was !== now) this.changed += now ? 1 : -1;
    return true;
  }

  /** Cell (r, c) can change (applicable + not locked). */
  editable(r, c) {
    return (this.model.flags[r * this.model.columns.length + c] & (LOCK | NA)) === 0;
  }

  /**
   * Counters of a bulk set.
   * @param {'all'|'row'|'column'|'group'|'group-column'} kind
   * @param {number} [a] row / column / group index
   * @param {number} [b] column index (group-column)
   */
  stats(kind, a = 0, b = 0) {
    const pick = (s, k) => ({ total: s.total[k], on: s.on[k], free: s.free[k], lockedOn: s.lockedOn[k] });
    switch (kind) {
      case 'row': return pick(this.rowS, a);
      case 'column': return pick(this.colS, a);
      case 'group': return pick(this.grpS, a);
      case 'group-column': return pick(this.gcS, a * this.model.columns.length + b);
      default: return pick(this.allS, 0);
    }
  }

  /**
   * Shown state of a bulk cell (QĐ 7): every applicable cell ticked (locked ones included) → checked; none → unchecked;
   * else mixed. `disabled` = no unlocked applicable cell left.
   * @returns {{ state: 'checked'|'mixed'|'unchecked', disabled: boolean }}
   */
  bulkState(kind, a, b) {
    const s = this.stats(kind, a, b);
    const state = s.total > 0 && s.on === s.total ? 'checked' : s.on === 0 ? 'unchecked' : 'mixed';
    return { state, disabled: s.free === 0 };
  }

  /** Toggle one cell; null when locked / n/a. @returns {{ added: number[], removed: number[] }|null} */
  toggleCell(r, c) {
    if (!this.editable(r, c)) return null;
    const i = r * this.model.columns.length + c;
    const v = this.on[i] ? 0 : 1;
    this._set(i, v);
    return v ? { added: [i], removed: [] } : { added: [], removed: [i] };
  }

  /** @private the cell indexes of a set (row-major display order) */
  _cells(kind, a, b) {
    const m = this.model;
    const C = m.columns.length;
    let r0 = 0;
    let r1 = m.rows.length;
    let c0 = 0;
    let c1 = C;
    if (kind === 'row') { r0 = a; r1 = a + 1; }
    if (kind === 'column') { c0 = a; c1 = a + 1; }
    if (kind === 'group' || kind === 'group-column') { r0 = m.groups[a].start; r1 = m.groups[a].end; }
    if (kind === 'group-column') { c0 = b; c1 = b + 1; }
    const out = [];
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) out.push(r * C + c);
    return out;
  }

  /**
   * Bulk click (QĐ 7): every unlocked applicable cell of the set ticked → untick them; else tick them. Locked / n/a
   * cells never change.
   * @returns {{ added: number[], removed: number[] }}
   */
  toggleSet(kind, a, b) {
    const s = this.stats(kind, a, b);
    const target = s.free > 0 && s.on - s.lockedOn === s.free ? 0 : 1;
    const diff = { added: [], removed: [] };
    for (const i of this._cells(kind, a, b)) {
      if (this.model.flags[i] & (LOCK | NA)) continue;
      if (this._set(i, target)) (target ? diff.added : diff.removed).push(i);
    }
    return diff;
  }

  /**
   * Replace every tick (programmatic / reset / restore). Returns the diff (unlocked or not: the caller decides).
   * @param {Uint8Array} on
   */
  setAll(on) {
    const diff = { added: [], removed: [] };
    for (let i = 0; i < on.length; i++) {
      if (this.model.flags[i] & NA) continue;
      const v = on[i] ? 1 : 0;
      if (this._set(i, v)) (v ? diff.added : diff.removed).push(i);
    }
    return diff;
  }

  /** Number of cells that differ from the defaults. */
  get changedCount() { return this.changed; }

  /** FormData entries for `name` (null = none, QĐ 13). */
  entries(name) { return matrixEntries(name, this.model, this.on); }

  /** `{ col: [row…] }` with the app's ORIGINAL keys (row display order). */
  valueObject() {
    const m = this.model;
    const C = m.columns.length;
    const out = {};
    m.columns.forEach((col, c) => {
      const list = [];
      for (let r = 0; r < m.rows.length; r++) if (this.on[r * C + c]) list.push(m.rows[r].raw);
      out[col.raw] = list;
    });
    return out;
  }

  /** Restore state (QĐ 14): `{"v":1,"value":{col:[row…]}}` with string keys. */
  encodeState() {
    return JSON.stringify({ v: 1, value: canonicalMatrix(this.model, this.on).value });
  }
}

/**
 * Decode a restore state against the CURRENT data (QĐ 14): the value must pass validateMatrix with that data, else
 * null (the whole state is dropped).
 * @param {unknown} state
 * @param {{ columns: any, rows: any, cells: any }} data
 * @returns {Uint8Array|null}
 */
export function decodeMatrixState(state, data) {
  if (typeof state !== 'string' || state.length > MATRIX_LIMITS.state) return null;
  let o;
  try {
    o = JSON.parse(state);
  } catch {
    return null;
  }
  if (!isPlain(o) || o.v !== 1) return null;
  const res = validateMatrix({ ...data, value: o.value });
  return res.ok ? res.model.value : null;
}

/**
 * Parity table (QĐ 6, M1 / M2): validateMatrix in JS and td__check_matrix_data() in PHP give the same `reason`; the ok
 * cases also the same canonical data and FormData entries for name `p`. `json: false` = not expressible in JSON (JS only).
 */
const COLS = [{ key: 'owner', label: 'Chủ' }, { key: 'sales', label: 'Bán hàng' }];
const ROWS = [{ key: 'dash.view', label: 'Xem' }, { key: 'cat', label: 'Sản phẩm', rows: [{ key: 'cat.view', label: 'Xem SP' }, { key: 'cat.del', label: 'Xoá SP' }] }];
const base = (over) => ({ columns: COLS, rows: ROWS, ...over });

export const MATRIX_CASES = Object.freeze([
  { name: 'minimal', data: base({}), reason: null,
    entries: [['p[owner]', ''], ['p[sales]', ''], ['p[_v]', '1']] },
  { name: 'value + locked-ticked + n/a + notes', data: base({
    cells: { 'cat.del': { owner: { locked: true, note: ' Không\tsửa\n role  của mình ' }, sales: { na: true, note: 'n/a' } } },
    value: { owner: ['cat.del', 'dash.view'], sales: ['cat.view'] } }), reason: null,
  entries: [['p[owner]', ''], ['p[sales]', ''], ['p[owner][]', 'dash.view'], ['p[sales][]', 'cat.view'], ['p[owner][]', 'cat.del'], ['p[_v]', '1']] },
  { name: 'int keys → strings', data: { columns: [{ key: 3, label: 'Ba' }], rows: [{ key: 0, label: 'Không' }, { key: 12 }], value: { 3: [12] } },
    reason: null, entries: [['p[3]', ''], ['p[3][]', '12'], ['p[_v]', '1']] },
  { name: 'row / column / group locks', data: { columns: [{ key: 'a', locked: true }, { key: 'b' }],
    rows: [{ key: 'r1', locked: true }, { key: 'g', label: 'G', locked: true, collapsed: true, rows: [{ key: 'r2' }] }, { key: 'r3' }],
    value: { a: ['r3'], b: ['r1', 'r2'] } }, reason: null,
  entries: [['p[a]', ''], ['p[b]', ''], ['p[b][]', 'r1'], ['p[b][]', 'r2'], ['p[a][]', 'r3'], ['p[_v]', '1']] },
  { name: 'labels: missing → key, cut at 200 code points, controls', data: { columns: [{ key: 'c', label: `${'đ'.repeat(199)} x` }],
    rows: [{ key: 'r', label: '\u0085A\u0000 \u00a0B\u007f', description: '   ' }] }, reason: null, entries: [['p[c]', ''], ['p[_v]', '1']] },
  { name: 'note: 301 code points cut + emoji', data: base({ cells: { 'dash.view': { owner: { note: `${'😀'.repeat(301)}` } } } }), reason: null },
  { name: 'note: empty after normalisation = none', data: base({ cells: { 'dash.view': { owner: { note: ' \t\u0001 ' } } } }), reason: null },
  { name: 'cells: [] / {} empty, unknown field ignored', data: base({ cells: { 'dash.view': { owner: { foo: 1, note: null, locked: null } } } }), reason: null },
  { name: 'cells empty array', data: base({ cells: [] }), reason: null },
  { name: 'na + locked → n/a', data: base({ cells: { 'dash.view': { owner: { na: true, locked: true } } } }), reason: null },
  { name: 'value: [] empty, duplicates ignored', data: base({ value: { owner: ['dash.view', 'dash.view'] } }), reason: null,
    entries: [['p[owner]', ''], ['p[sales]', ''], ['p[owner][]', 'dash.view'], ['p[_v]', '1']] },
  { name: 'empty group', data: { columns: COLS, rows: [{ key: 'g', rows: [] }, { key: 'r' }] }, reason: null },
  // structural errors → fail closed
  { name: 'columns not an array', data: { columns: {}, rows: ROWS }, reason: 'columns-shape' },
  { name: 'no columns', data: { columns: [], rows: ROWS }, reason: 'columns-shape' },
  { name: 'no rows', data: { columns: COLS, rows: [] }, reason: 'rows-shape' },
  { name: 'only empty groups', data: { columns: COLS, rows: [{ key: 'g', rows: [] }] }, reason: 'rows-shape' },
  { name: 'column not an object', data: { columns: ['owner'], rows: ROWS }, reason: 'columns-shape' },
  { name: 'row not an object', data: { columns: COLS, rows: ['x'] }, reason: 'rows-shape' },
  { name: 'key with [', data: { columns: [{ key: 'a[b' }], rows: ROWS }, reason: 'column-key' },
  { name: 'key with leading _', data: { columns: COLS, rows: [{ key: '_v' }] }, reason: 'row-key' },
  { name: 'key with a space', data: { columns: COLS, rows: [{ key: 'a b' }] }, reason: 'row-key' },
  { name: 'negative int key', data: { columns: [{ key: -1 }], rows: ROWS }, reason: 'column-key' },
  { name: 'float key', data: { columns: [{ key: 1.5 }], rows: ROWS }, reason: 'column-key' },
  { name: 'key too long', data: { columns: [{ key: 'a'.repeat(129) }], rows: ROWS }, reason: 'column-key' },
  { name: 'duplicate column', data: { columns: [{ key: 'a' }, { key: 'a' }], rows: ROWS }, reason: 'duplicate-column' },
  { name: 'duplicate row across groups', data: { columns: COLS, rows: [{ key: 'x' }, { key: 'g', rows: [{ key: 'x' }] }] }, reason: 'duplicate-row' },
  { name: 'int and string key collide', data: { columns: COLS, rows: [{ key: 1 }, { key: '1' }] }, reason: 'duplicate-row' },
  { name: 'duplicate group', data: { columns: COLS, rows: [{ key: 'g', rows: [{ key: 'a' }] }, { key: 'g', rows: [{ key: 'b' }] }] }, reason: 'duplicate-group' },
  { name: 'nested group', data: { columns: COLS, rows: [{ key: 'g', rows: [{ key: 'h', rows: [] }] }] }, reason: 'nested-group' },
  { name: 'group rows not an array', data: { columns: COLS, rows: [{ key: 'g', rows: 'x' }] }, reason: 'rows-shape' },
  { name: 'label not a string', data: { columns: [{ key: 'a', label: 5 }], rows: ROWS }, reason: 'label' },
  { name: 'locked not a boolean', data: { columns: [{ key: 'a', locked: 'true' }], rows: ROWS }, reason: 'flag' },
  { name: 'collapsed not a boolean', data: { columns: COLS, rows: [{ key: 'g', collapsed: 1, rows: [{ key: 'a' }] }] }, reason: 'flag' },
  { name: 'too many columns', data: { columns: Array.from({ length: 33 }, (_, i) => ({ key: `c${i}` })), rows: ROWS }, reason: 'too-many-columns' },
  { name: 'too many rows', data: { columns: COLS, rows: Array.from({ length: 501 }, (_, i) => ({ key: `r${i}` })) }, reason: 'too-many-rows' },
  { name: 'too many groups', data: { columns: COLS, rows: Array.from({ length: 65 }, (_, i) => ({ key: `g${i}`, rows: [{ key: `r${i}` }] })) }, reason: 'too-many-groups' },
  { name: 'too many cells', data: { columns: Array.from({ length: 21 }, (_, i) => ({ key: `c${i}` })), rows: Array.from({ length: 480 }, (_, i) => ({ key: `r${i}` })) }, reason: 'too-many-cells' },
  // PHP cannot tell a list from a map: a list's int keys are row keys there (`0` is not a row → unknown row)
  { name: 'cells: non-empty array', data: base({ cells: [{ owner: {} }] }), reason: 'cells-shape', phpReason: 'cells-unknown-row' },
  { name: 'cells: a string', data: base({ cells: 'x' }), reason: 'cells-shape' },
  { name: 'cells: unknown row', data: base({ cells: { nope: { owner: { locked: true } } } }), reason: 'cells-unknown-row' },
  { name: 'cells: group key', data: base({ cells: { cat: { owner: { locked: true } } } }), reason: 'cells-unknown-row' },
  { name: 'cells: __proto__ from JSON', data: base({ cells: JSON.parse('{"__proto__":{"owner":{"locked":true}}}') }), reason: 'cells-unknown-row' },
  { name: 'cells: row not an object', data: base({ cells: { 'dash.view': 1 } }), reason: 'cells-shape' },
  { name: 'cells: unknown column', data: base({ cells: { 'dash.view': { admin: { locked: true } } } }), reason: 'cells-unknown-column' },
  { name: 'cells: cell not an object', data: base({ cells: { 'dash.view': { owner: true } } }), reason: 'cells-shape' },
  { name: 'cells: locked "true"', data: base({ cells: { 'dash.view': { owner: { locked: 'true' } } } }), reason: 'cells-flag' },
  { name: 'cells: locked 1', data: base({ cells: { 'dash.view': { owner: { locked: 1 } } } }), reason: 'cells-flag' },
  { name: 'cells: na "1"', data: base({ cells: { 'dash.view': { owner: { na: '1' } } } }), reason: 'cells-flag' },
  { name: 'cells: note a number', data: base({ cells: { 'dash.view': { owner: { note: 5 } } } }), reason: 'cells-note' },
  { name: 'value: a string', data: base({ value: 'owner' }), reason: 'value-shape' },
  { name: 'value: column list not an array', data: base({ value: { owner: 'dash.view' } }), reason: 'value-shape' },
  { name: 'value: unknown column', data: base({ value: { admin: [] } }), reason: 'value-unknown-column' },
  { name: 'value: unknown row', data: base({ value: { owner: ['nope'] } }), reason: 'value-unknown-row' },
  { name: 'value: group key', data: base({ value: { owner: ['cat'] } }), reason: 'value-unknown-row' },
  { name: 'value: bad item', data: base({ value: { owner: [{}] } }), reason: 'value-shape' },
  { name: 'value: ticks an n/a cell', data: base({ cells: { 'cat.view': { owner: { na: true, locked: true } } }, value: { owner: ['cat.view'] } }), reason: 'value-na' },
  // JS only (not expressible in JSON)
  { name: 'cells: a Map', data: base({ cells: new Map([['dash.view', {}]]) }), reason: 'cells-shape', json: false },
  { name: 'cells: a class instance', data: base({ cells: new (class X { constructor() { this['dash.view'] = {}; } })() }), reason: 'cells-shape', json: false },
  { name: 'cells: a null-prototype object', data: base({ cells: Object.assign(Object.create(null), { 'dash.view': { owner: { na: true } } }) }), reason: null, json: false },
].map((c) => Object.freeze(c)));
