// v0.47.0 (plan docs/internal/plans/v0.47.0-check-matrix.md M1) — the pure model of <td-check-matrix>: one validation
// path (fail closed), derived cell states, incremental counters + bulk rules, FormData, restore state, parity table.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateMatrix, canonicalMatrix, MatrixState, matrixEntries, decodeMatrixState, normalizeMatrixText, matrixKey,
  isNa, isLocked, MATRIX_CASES, MATRIX_LIMITS, CHECK_MATRIX_KEY, matrixJsonBytes,
} from './check-matrix-model.js';

const ok = (data) => {
  const r = validateMatrix(data);
  assert.equal(r.reason, null, JSON.stringify(r.reason));
  return r.model;
};
const reason = (data) => validateMatrix(data).reason;

const COLS = [{ key: 'owner', label: 'Chủ' }, { key: 'sales', label: 'Bán hàng' }, { key: 'ship', label: 'Kho' }];
// dash (ungrouped) ; group cat › view, edit, del ; group ord › list ; report (ungrouped)
const ROWS = () => [
  { key: 'dash', label: 'Tổng quan' },
  { key: 'cat', label: 'Sản phẩm', rows: [{ key: 'cat.view', label: 'Xem' }, { key: 'cat.edit', label: 'Sửa' }, { key: 'cat.del', label: 'Xoá' }] },
  { key: 'ord', label: 'Đơn', collapsed: true, rows: [{ key: 'ord.list', label: 'Danh sách' }] },
  { key: 'report', label: 'Báo cáo' },
];

describe('check-matrix-model — keys + text', () => {
  it('keys: the QĐ 4 regex or a non-negative safe integer', () => {
    for (const k of ['a', 'A9', 'catalog.products.view', 'x:y', 'a-b_c', '0', 'a'.repeat(128)]) assert.equal(matrixKey(k), k);
    assert.equal(matrixKey(7), '7');
    assert.equal(matrixKey(0), '0');
    for (const k of ['', '_v', '.a', 'a b', 'a[b', 'a]', 'a\n', 'đ', 'a'.repeat(129), -1, 1.5, NaN, 2 ** 53, null, true, {}, []]) {
      assert.equal(matrixKey(k), null, String(k));
    }
    assert.ok(CHECK_MATRIX_KEY.test('Z.z'));
  });

  it('normalizeMatrixText: controls, whitespace, cut by code point, idempotent', () => {
    assert.equal(normalizeMatrixText(' a\tb\nc  d ', 300), 'a b c d');
    assert.equal(normalizeMatrixText('A\u0085B\u009fC\u007f\u0000D', 300), 'ABCD');
    assert.equal(normalizeMatrixText('a  b', 300), 'a  b', 'NBSP is not collapsed (explicit U+0020 rule, PHP parity)');
    assert.equal(normalizeMatrixText('😀😀😀', 2), '😀😀');
    assert.equal(normalizeMatrixText('ab cd', 3), 'ab', 'the cut may end on a space: trimmed again');
    assert.equal(normalizeMatrixText('a\uD800b', 10), 'a�b');
    for (const s of ['  x  y ', `${'đ'.repeat(199)} x`, '\t\t', 'ab cd']) {
      const once = normalizeMatrixText(s, 200);
      assert.equal(normalizeMatrixText(once, 200), once);
    }
  });
});

describe('check-matrix-model — validateMatrix (QĐ 6, one path, fail closed)', () => {
  it('builds leaves, groups, segments; groups never become rows', () => {
    const m = ok({ columns: COLS, rows: ROWS() });
    assert.deepEqual(m.rows.map((r) => r.key), ['dash', 'cat.view', 'cat.edit', 'cat.del', 'ord.list', 'report']);
    assert.deepEqual(m.rows.map((r) => r.group), [-1, 0, 0, 0, 1, -1]);
    assert.deepEqual(m.groups.map((g) => [g.key, g.start, g.end, g.collapsed]), [['cat', 1, 4, false], ['ord', 4, 5, true]]);
    assert.deepEqual(m.segments, [{ group: -1, start: 0, end: 1 }, { group: 0, start: 1, end: 4 }, { group: 1, start: 4, end: 5 },
      { group: -1, start: 5, end: 6 }]);
  });

  it('every MATRIX_CASES row gives its reason; ok cases give their entries', () => {
    for (const c of MATRIX_CASES) {
      const r = validateMatrix(c.data);
      assert.equal(r.reason, c.reason, c.name);
      assert.equal(r.ok, c.reason === null, c.name);
      if (c.entries) assert.deepEqual(matrixEntries('p', r.model, r.model.value), c.entries, c.name);
    }
    assert.ok(Object.isFrozen(MATRIX_CASES) && MATRIX_CASES.every(Object.isFrozen));
  });

  it('five derived cell states: tick / empty / locked-tick / locked-empty / n/a (lock from cell, row, column)', () => {
    const m = ok({
      columns: [{ key: 'a' }, { key: 'b', locked: true }],
      rows: [{ key: 'r1' }, { key: 'r2', locked: true }],
      cells: { r1: { a: { locked: true } } },
      value: { a: ['r1'], b: ['r1'] },
    });
    // r1a locked (cell) ticked, r1b locked (column) ticked, r2a locked (row) empty, r2b locked empty
    assert.deepEqual([0, 1, 2, 3].map((i) => isLocked(m, i)), [true, true, true, true]);
    const m2 = ok({ columns: [{ key: 'a' }, { key: 'b' }], rows: [{ key: 'r' }], cells: { r: { b: { na: true, locked: true } } }, value: { a: ['r'] } });
    assert.equal(isNa(m2, 1), true);
    assert.equal(isLocked(m2, 1), false, 'n/a wins over locked');
    assert.equal(isLocked(m2, 0), false);
  });

  it('group locked → its rows locked; collapsed only on groups', () => {
    const m = ok({ columns: COLS, rows: [{ key: 'g', locked: true, rows: [{ key: 'x' }] }, { key: 'y' }] });
    assert.equal(m.rows[0].locked, true);
    assert.equal(m.rows[1].locked, false);
  });

  it('labels: default to the key, cut to 200 code points; descriptions + notes 300', () => {
    const m = ok({ columns: [{ key: 'c', label: 'x'.repeat(250) }], rows: [{ key: 'r', description: 'd'.repeat(400) }],
      cells: { r: { c: { note: 'n'.repeat(400) } } } });
    assert.equal(m.columns[0].label.length, 200);
    assert.equal(m.rows[0].label, 'r');
    assert.equal(m.rows[0].description.length, 300);
    assert.equal(m.notes.get(0).length, 300);
  });

  it('limits: exactly at the caps is valid', () => {
    const cols = Array.from({ length: 20 }, (_, i) => ({ key: `c${i}` }));
    const rows = Array.from({ length: 500 }, (_, i) => ({ key: `r${i}` }));
    assert.equal(reason({ columns: cols, rows }), null);
    assert.equal(reason({ columns: Array.from({ length: 32 }, (_, i) => ({ key: `c${i}` })), rows: [{ key: 'r' }] }), null);
    assert.equal(reason({ columns: COLS, rows: Array.from({ length: 64 }, (_, i) => ({ key: `g${i}`, rows: [{ key: `r${i}` }] })) }), null);
    assert.equal(MATRIX_LIMITS.cells, 10000);
  });

  it('canonical data re-validates to the same model (PHP prints it in `data`)', () => {
    for (const c of MATRIX_CASES.filter((x) => x.reason === null && x.json !== false)) {
      const m = validateMatrix(c.data).model;
      const can = canonicalMatrix(m);
      const again = validateMatrix(JSON.parse(JSON.stringify(can)));
      assert.equal(again.reason, null, c.name);
      assert.deepEqual(canonicalMatrix(again.model), can, c.name);
      assert.deepEqual([...again.model.flags], [...m.flags], c.name);
    }
  });

  it('never throws on hostile input', () => {
    for (const bad of [null, undefined, 1, 'x', [], { columns: null }, { columns: [null] }, { columns: COLS, rows: [null] },
      { columns: COLS, rows: ROWS(), value: [['dash']] }, { columns: COLS, rows: ROWS(), cells: { dash: null } }]) {
      assert.doesNotThrow(() => validateMatrix(bad));
      assert.equal(validateMatrix(bad).ok, false);
    }
  });
});

describe('check-matrix-model — counters + bulk (QĐ 7–8)', () => {
  const data = () => ({
    columns: COLS,
    rows: ROWS(),
    cells: { 'cat.del': { owner: { locked: true }, sales: { na: true } }, 'cat.edit': { ship: { locked: true } } },
    value: { owner: ['cat.del'], sales: ['dash'] },
  });

  it('bulk state: locked-ticked counts for "checked", never makes a header lie; all-locked set → disabled', () => {
    const s = new MatrixState(ok(data()));
    // group cat × owner: view, edit, del(locked ✓) → mixed
    assert.deepEqual(s.bulkState('group-column', 0, 0), { state: 'mixed', disabled: false });
    s.toggleCell(1, 0);
    s.toggleCell(2, 0);
    assert.deepEqual(s.bulkState('group-column', 0, 0), { state: 'checked', disabled: false });
    // cat × ship: view free, edit locked empty, del free
    s.toggleCell(1, 2);
    s.toggleCell(3, 2);
    assert.equal(s.bulkState('group-column', 0, 2).state, 'mixed', 'a locked unticked cell keeps it mixed');
    // cat.del row: owner locked ✓, sales n/a, ship ✓ → checked (n/a excluded)
    assert.equal(s.bulkState('row', 3).state, 'checked');
    const allLocked = new MatrixState(ok({ columns: [{ key: 'a', locked: true }], rows: [{ key: 'r' }] }));
    assert.deepEqual(allLocked.bulkState('column', 0), { state: 'unchecked', disabled: true });
    const onlyNa = new MatrixState(ok({ columns: [{ key: 'a' }], rows: [{ key: 'r' }], cells: { r: { a: { na: true } } } }));
    assert.deepEqual(onlyNa.bulkState('all'), { state: 'unchecked', disabled: true });
  });

  it('bulk click: all free ticked → untick them; else tick them; locked / n/a never change; never stuck', () => {
    const s = new MatrixState(ok(data()));
    const C = 3;
    let d = s.toggleSet('group-column', 0, 0); // view, edit free → tick
    assert.deepEqual(d, { added: [1 * C, 2 * C], removed: [] });
    d = s.toggleSet('group-column', 0, 0); // all free ticked → untick free only (locked ✓ stays)
    assert.deepEqual(d, { added: [], removed: [1 * C, 2 * C] });
    assert.equal(s.on[3 * C], 1, 'locked-ticked kept');
    // column sales: dash ✓ free; others free except cat.del n/a → tick all free
    d = s.toggleSet('column', 1);
    assert.deepEqual(d.added, [1 * C + 1, 2 * C + 1, 4 * C + 1, 5 * C + 1]);
    assert.equal(s.on[3 * C + 1], 0, 'n/a untouched');
    d = s.toggleSet('all');
    assert.equal(d.removed.length + d.added.length > 0, true);
    for (const i of [3 * C, 2 * C + 2]) assert.equal(s.on[i], i === 3 * C ? 1 : 0, 'locked cells never move');
    assert.equal(s.toggleCell(3, 0), null, 'locked cell');
    assert.equal(s.toggleCell(3, 1), null, 'n/a cell');
  });

  it('row / group / all sets cover the right cells', () => {
    const s = new MatrixState(ok({ columns: COLS, rows: ROWS() }));
    assert.equal(s.toggleSet('row', 0).added.length, 3);
    assert.equal(s.toggleSet('group', 0).added.length, 9);
    assert.equal(s.toggleSet('group', 1).added.length, 3);
    assert.equal(s.toggleSet('all').added.length, 3, 'only report left');
    assert.equal(s.bulkState('all').state, 'checked');
    assert.equal(s.toggleSet('all').removed.length, 18);
  });

  it('changedCount follows on ≠ default, incl. back to default', () => {
    const s = new MatrixState(ok(data()));
    assert.equal(s.changedCount, 0);
    s.toggleCell(0, 0);
    s.toggleCell(0, 1); // dash sales was ✓ → off
    assert.equal(s.changedCount, 2);
    s.toggleCell(0, 1);
    assert.equal(s.changedCount, 1);
    s.setAll(s.def);
    assert.equal(s.changedCount, 0);
  });

  it('fuzz: 2,000 random operations — incremental counters equal a full recount', () => {
    let seed = 47;
    const rnd = (n) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const cols = Array.from({ length: 5 }, (_, i) => ({ key: `c${i}`, locked: i === 4 }));
    const rows = [{ key: 'a' }, { key: 'g', rows: [{ key: 'b' }, { key: 'c', locked: true }, { key: 'd' }] }, { key: 'e' },
      { key: 'h', rows: [{ key: 'f' }, { key: 'k' }] }];
    const cells = { a: { c1: { na: true } }, d: { c2: { locked: true } }, f: { c0: { na: true }, c3: { locked: true } } };
    const m = ok({ columns: cols, rows, cells, value: { c4: ['a', 'e'], c3: ['f'], c2: ['d'] } });
    const s = new MatrixState(m);
    const C = 5;
    const R = m.rows.length;
    const recount = (kind, a, b) => {
      let total = 0; let on = 0; let free = 0;
      s._cells(kind, a, b).forEach((i) => {
        if (isNa(m, i)) return;
        total++;
        if (!isLocked(m, i)) free++;
        if (s.on[i]) on++;
      });
      return { total, on, free };
    };
    const lockedSnapshot = [...s.on].filter((_, i) => isLocked(m, i) || isNa(m, i));
    for (let k = 0; k < 2000; k++) {
      const op = rnd(6);
      if (op === 0) s.toggleCell(rnd(R), rnd(C));
      else if (op === 1) s.toggleSet('row', rnd(R));
      else if (op === 2) s.toggleSet('column', rnd(C));
      else if (op === 3) s.toggleSet('group', rnd(2));
      else if (op === 4) s.toggleSet('group-column', rnd(2), rnd(C));
      else s.toggleSet('all');
      if (k % 50 !== 0) continue;
      const sets = [['all'], ...Array.from({ length: R }, (_, r) => ['row', r]), ...Array.from({ length: C }, (_, c) => ['column', c]),
        ['group', 0], ['group', 1], ...Array.from({ length: C }, (_, c) => ['group-column', 1, c])];
      for (const [kind, a, b] of sets) {
        const { total, on, free } = s.stats(kind, a, b);
        assert.deepEqual({ total, on, free }, recount(kind, a, b), `${kind} ${a} ${b} @${k}`);
      }
      let changed = 0;
      for (let i = 0; i < s.on.length; i++) if (!isNa(m, i) && s.on[i] !== s.def[i]) changed++;
      assert.equal(s.changedCount, changed);
    }
    assert.deepEqual([...s.on].filter((_, i) => isLocked(m, i) || isNa(m, i)), lockedSnapshot, 'locked / n/a never changed');
  });
});

describe('check-matrix-model — FormData (QĐ 10–13) + restore state (QĐ 14)', () => {
  const m = () => ok({ columns: COLS, rows: ROWS(), cells: { 'cat.del': { owner: { locked: true } } }, value: { owner: ['cat.del', 'dash'], ship: ['report'] } });

  it('markers first (column order), ticks row-major incl. locked-ticked once, sentinel last', () => {
    const model = m();
    assert.deepEqual(matrixEntries('perms', model, model.value), [
      ['perms[owner]', ''], ['perms[sales]', ''], ['perms[ship]', ''],
      ['perms[owner][]', 'dash'], ['perms[owner][]', 'cat.del'], ['perms[ship][]', 'report'], ['perms[_v]', '1']]);
  });

  it('nested name ok; empty name or a name ending in [] → null (no entry at all)', () => {
    const model = m();
    assert.equal(matrixEntries('role[perms]', model, model.value)[0][0], 'role[perms][owner]');
    for (const bad of ['', 'perms[]', null, undefined, 5]) assert.equal(matrixEntries(bad, model, model.value), null);
  });

  it('restore state round-trips; any unknown key drops the WHOLE state', () => {
    const model = m();
    const s = new MatrixState(model);
    s.toggleCell(0, 1);
    const st = s.encodeState();
    assert.deepEqual(JSON.parse(st), { v: 1, value: { owner: ['dash', 'cat.del'], sales: ['dash'], ship: ['report'] } });
    const data = { columns: COLS, rows: ROWS(), cells: { 'cat.del': { owner: { locked: true } } } };
    assert.deepEqual([...decodeMatrixState(st, data)], [...s.on]);
    assert.equal(decodeMatrixState(JSON.stringify({ v: 1, value: { owner: ['gone'] } }), data), null);
    assert.equal(decodeMatrixState(JSON.stringify({ v: 2, value: {} }), data), null);
    assert.equal(decodeMatrixState('{', data), null);
    assert.equal(decodeMatrixState(`{"v":1,"value":{},"x":"${'a'.repeat(MATRIX_LIMITS.state)}"}`, data), null);
    assert.equal(decodeMatrixState(null, data), null);
  });

  it('valueObject uses the ORIGINAL keys (numbers stay numbers)', () => {
    const s = new MatrixState(ok({ columns: [{ key: 1 }], rows: [{ key: 7 }, { key: 'x' }], value: { 1: [7] } }));
    assert.deepEqual(s.valueObject(), { 1: [7] });
  });
});

describe('check-matrix-model — prototype-named keys (review r1 #1)', () => {
  const NAMES = ['constructor', 'toString', 'assign', 'prototype', 'hasOwnProperty', 'valueOf', 'isPrototypeOf'];
  const snapshot = () => [Object.assign, Object.prototype.toString, Object.prototype.hasOwnProperty, Object.prototype.constructor,
    ...Object.getOwnPropertyNames(Object), ...Object.getOwnPropertyNames(Object.prototype)];

  it('row / column keys named like Object members: serialization works, Object / Object.prototype never touched', () => {
    const before = snapshot();
    const descBefore = JSON.stringify(Object.getOwnPropertyNames(Object.prototype).map((n) => [n, typeof Object.getOwnPropertyDescriptor(Object.prototype, n).value]));
    const columns = NAMES.map((k) => ({ key: k }));
    const rows = NAMES.map((k) => ({ key: k }));
    const cells = Object.fromEntries(NAMES.map((r) => [r, Object.fromEntries(NAMES.map((c) => [c, { locked: true, note: `${r}/${c}` }]))]));
    const value = Object.fromEntries(NAMES.map((c) => [c, [...NAMES]]));
    const res = validateMatrix({ columns, rows, cells, value });
    assert.equal(res.reason, null);
    const can = canonicalMatrix(res.model);
    const json = JSON.parse(JSON.stringify(can));
    assert.deepEqual(Object.keys(json.cells), NAMES);
    assert.equal(json.cells.constructor.assign.note, 'constructor/assign');
    assert.deepEqual(json.value.toString, NAMES);
    const again = validateMatrix(json);
    assert.equal(again.reason, null);
    const s = new MatrixState(res.model);
    const v = s.valueObject();
    assert.deepEqual(Object.keys(v), NAMES);
    assert.ok(Object.hasOwn(v, 'constructor') && Array.isArray(v.constructor));
    assert.deepEqual(JSON.parse(s.encodeState()).value.hasOwnProperty, NAMES);
    assert.ok(decodeMatrixState(s.encodeState(), { columns, rows, cells }));
    assert.deepEqual(snapshot(), before, 'Object / Object.prototype unchanged');
    assert.equal(JSON.stringify(Object.getOwnPropertyNames(Object.prototype).map((n) => [n, typeof Object.getOwnPropertyDescriptor(Object.prototype, n).value])), descBefore);
    assert.equal(typeof Object.assign, 'function');
    assert.equal(({}).constructor, Object);
  });

  it('__proto__ is never a key (regex), from JSON it fails closed as an unknown row / column', () => {
    assert.equal(matrixKey('__proto__'), null);
    const v = JSON.parse('{"__proto__":["a"]}');
    assert.equal(validateMatrix({ columns: [{ key: 'a' }], rows: [{ key: 'a' }], value: v }).reason, 'value-unknown-column');
    assert.equal(({}).polluted, undefined);
  });
});

describe('check-matrix-model — data attribute size (review r1 #2)', () => {
  it('matrixJsonBytes = UTF-8 bytes (PHP strlen), not UTF-16 code units', () => {
    assert.equal(matrixJsonBytes('abc'), 3);
    assert.equal(matrixJsonBytes('đ'), 2);
    assert.equal(matrixJsonBytes('😀'), 4);
    assert.equal(matrixJsonBytes('Quyền'), 7);
    assert.equal(MATRIX_LIMITS.json, 524288);
  });
});
