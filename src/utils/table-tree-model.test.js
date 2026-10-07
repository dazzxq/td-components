// v0.57.0 (plan docs/internal/plans/v0.57.0-tree-table.md QĐ 2–4, 9–11, 13, 17–18) — the pure tree model behind
// `td-table tree`: nested (`children`) and flat (`parent-key`) data, keys, duplicates, depth, visible list + ARIA
// numbers, sibling sort (the shared `compareRows`), lazy children (latest-request-wins), `move` (moveRow), getTree,
// and the app's data is never written.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TableTreeModel, compareRows } from './table-tree-model.js';
import { TREE_MAX_DEPTH, TREE_WARN_NODES } from './tree-model.js';
import { keyId } from './key-selection.js';

const keyOf = (row) => (row && typeof row === 'object' && keyId(row.id) !== null ? row.id : null);
function mk(data, opts = {}) {
  const warns = [];
  const m = new TableTreeModel({ keyOf: opts.keyOf || keyOf, warn: (msg) => warns.push(String(msg)) });
  m.setData(data, opts);
  return { m, warns };
}
/** Visible ids (all expanded state from the model). */
const vis = (m, cmp = null) => m.visible(m.sortedRoots(cmp), cmp).map((e) => (e.status ? `[${e.status}:${e.node.id}]` : e.node.id));
const tree = (m) => JSON.stringify(m.getTree().map(function strip(t) {
  return { k: t.key, c: t.children === null ? null : t.children.map(strip) };
}));
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

// Áo › (Áo thun › Cổ tròn), Áo khoác ; Quần › Jeans ; Phụ kiện
const NESTED = () => [
  { id: 'ao', name: 'Áo', children: [
    { id: 'thun', name: 'Áo thun', children: [{ id: 'tron', name: 'Cổ tròn' }] },
    { id: 'khoac', name: 'Áo khoác' },
  ] },
  { id: 'quan', name: 'Quần', children: [{ id: 'jeans', name: 'Jeans' }] },
  { id: 'pk', name: 'Phụ kiện' },
];
const FLAT = () => [
  { id: 'ao', name: 'Áo', parentId: null },
  { id: 'thun', name: 'Áo thun', parentId: 'ao' },
  { id: 'quan', name: 'Quần', parentId: '' },
  { id: 'tron', name: 'Cổ tròn', parentId: 'thun' },
  { id: 'khoac', name: 'Áo khoác', parentId: 'ao' },
  { id: 'jeans', name: 'Jeans', parentId: 'quan' },
  { id: 'pk', name: 'Phụ kiện' },
];

describe('table-tree-model — compareRows (shared with the flat table sort, D12)', () => {
  it('numbers numerically, strings with the vi numeric collator, nulls first in asc / last in desc, stable', () => {
    const rows = [{ v: 'b10' }, { v: null }, { v: 'b2' }, { v: 'Ă' }, { v: undefined, t: 1 }, { v: 'a' }];
    const asc = compareRows('v', 'asc');
    const idx = rows.map((_, i) => i).sort((a, b) => asc(rows[a], rows[b]));
    assert.deepEqual(idx.map((i) => rows[i].v), [null, undefined, 'a', 'Ă', 'b2', 'b10']);
    const desc = compareRows('v', 'desc');
    const d = rows.map((_, i) => i).sort((a, b) => desc(rows[a], rows[b]));
    assert.deepEqual(d.map((i) => rows[i].v), ['b10', 'b2', 'Ă', 'a', null, undefined]);
    const nums = [{ v: 10 }, { v: 9 }, { v: 100 }];
    assert.deepEqual(nums.slice().sort(compareRows('v', 'asc')).map((r) => r.v), [9, 10, 100]);
    assert.equal(compareRows('v', null), null);
    assert.equal(compareRows('v', 'asc')(null, 'x'), 0, 'a non-object row reads as null');
  });
});

describe('table-tree-model — build (QĐ 2)', () => {
  it('nested and flat (parent-key) data build the same tree, siblings in data order', () => {
    const a = mk(NESTED());
    const b = mk(FLAT(), { parentKey: 'parentId' });
    assert.equal(tree(a.m), tree(b.m));
    assert.equal(tree(a.m), JSON.stringify([
      { k: 'ao', c: [{ k: 'thun', c: [{ k: 'tron', c: [] }] }, { k: 'khoac', c: [] }] },
      { k: 'quan', c: [{ k: 'jeans', c: [] }] },
      { k: 'pk', c: [] },
    ]));
    assert.deepEqual(a.warns, []);
    assert.deepEqual(b.warns, []);
    const t = a.m.node('tron');
    assert.equal(t.depth, 2);
    assert.equal(t.parent, a.m.node('thun'));
    assert.equal(a.m.flat.map((n) => n.id).join(), 'ao,thun,tron,khoac,quan,jeans,pk');
  });

  it('flat: orphans and cycles become roots (one warning each); children-key is ignored with parent-key', () => {
    const { m, warns } = mk([
      { id: 'a', parentId: 'nope' },
      { id: 'x', parentId: 'y' }, { id: 'y', parentId: 'x' },
      { id: 's', parentId: 's' },
      { id: 'c', parentId: 'a', children: [{ id: 'zz' }] },
    ], { parentKey: 'parentId' });
    assert.deepEqual(m.roots.map((n) => n.id), ['a', 'x', 'y', 's']);
    assert.equal(m.node('c').parent, m.node('a'));
    assert.equal(m.node('zz'), undefined, 'children-key ignored');
    assert.equal(warns.filter((w) => /orphan/i.test(w)).length, 1);
    assert.equal(warns.filter((w) => /cycle/i.test(w)).length, 1);
    assert.equal(warns.filter((w) => /children-key|parent-key/.test(w)).length, 1);
  });

  it('a duplicate key: the later row is a leaf (no expand, its branch hidden); invalid keys are leaves', () => {
    const { m, warns } = mk([
      { id: 'a', children: [{ id: 'a1' }] },
      { id: 'b', children: [{ id: 'a', children: [{ id: 'hidden' }] }] },
      { id: '', children: [{ id: 'gone' }] },
      { name: 'no key', children: [{ id: 'gone2' }] },
    ]);
    const dup = m.flat.find((n) => n.dup);
    assert.equal(dup.parent, m.node('b'));
    assert.equal(m.expandable(dup), false);
    assert.equal(m.node('hidden'), undefined);
    assert.equal(m.node('gone'), undefined);
    assert.equal(m.node('a'), m.roots[0], 'the first (preorder) owns the key');
    const bad = m.roots.filter((n) => n.id === null);
    assert.equal(bad.length, 2);
    assert.ok(bad.every((n) => !m.expandable(n) && n.children.length === 0));
    assert.equal(warns.filter((w) => /duplicate/i.test(w)).length, 1);
  });

  it('depth: at most 16 levels (deeper dropped + one warning); > 5000 nodes → one warning', () => {
    let deep = { id: 'n0' };
    const top = deep;
    for (let i = 1; i < 20; i++) {
      deep.children = [{ id: `n${i}` }];
      deep = deep.children[0];
    }
    const { m, warns } = mk([top]);
    assert.ok(m.node(`n${TREE_MAX_DEPTH - 1}`));
    assert.equal(m.node(`n${TREE_MAX_DEPTH}`), undefined);
    assert.equal(warns.filter((w) => /depth|levels/i.test(w)).length, 1);
    const many = Array.from({ length: TREE_WARN_NODES + 1 }, (_, i) => ({ id: i }));
    const big = mk(many);
    assert.equal(big.warns.filter((w) => /loadChildren/.test(w)).length, 1);
  });

  it('lazy: rowHasChildren (default row.hasChildren === true) and no children → lazy (children null)', () => {
    const { m } = mk([{ id: 'l', hasChildren: true }, { id: 'e', hasChildren: true, children: [] }, { id: 'f' }]);
    assert.equal(m.node('l').children, null);
    assert.equal(m.node('l').lazy, true);
    assert.equal(m.expandable(m.node('l')), true);
    assert.equal(m.expandable(m.node('e')), false);
    const c = mk([{ id: 'x', kids: 2 }], { hasChildren: (r) => r.kids > 0 });
    assert.equal(c.m.node('x').lazy, true);
    const t = mk([{ id: 'x', hasChildren: true }, { id: 'y', parentId: 'x' }], { parentKey: 'parentId' });
    assert.equal(t.m.node('x').lazy, false, 'flat data that has the children is loaded');
  });

  it('never writes the app data (deep-frozen data, nested and flat)', () => {
    const n = deepFreeze(NESTED());
    const before = JSON.stringify(n);
    const { m } = mk(n);
    m.expandAll();
    assert.equal(m.move('khoac', 'quan', 0, {}).ok, true);
    assert.equal(JSON.stringify(n), before);
    const f = deepFreeze(FLAT());
    const fb = JSON.stringify(f);
    const b = mk(f, { parentKey: 'parentId' });
    assert.equal(b.m.move('pk', 'ao', 0, {}).ok, true);
    assert.equal(JSON.stringify(f), fb);
  });
});

describe('table-tree-model — expanded state + visible list (QĐ 4, QĐ 6, QĐ 9)', () => {
  it('expanded by key; visible = preorder of open branches; level / setsize / posinset', () => {
    const { m } = mk(NESTED());
    assert.deepEqual(vis(m), ['ao', 'quan', 'pk']);
    m.expand('ao');
    m.expand(1);
    assert.deepEqual(vis(m), ['ao', 'thun', 'khoac', 'quan', 'pk']);
    m.expand('thun');
    const e = m.visible(m.roots, null);
    assert.deepEqual(e.map((x) => [x.node.id, x.level, x.setsize, x.posinset]), [
      ['ao', 1, 3, 1], ['thun', 2, 2, 1], ['tron', 3, 1, 1], ['khoac', 2, 2, 2], ['quan', 1, 3, 2], ['pk', 1, 3, 3],
    ]);
    m.collapse('ao');
    assert.deepEqual(vis(m), ['ao', 'quan', 'pk']);
    m.expand('ao');
    assert.deepEqual(vis(m), ['ao', 'thun', 'tron', 'khoac', 'quan', 'pk'], 'a child keeps its open state');
  });

  it('roots of a page: posinset from the offset, setsize = the total', () => {
    const { m } = mk(NESTED());
    const e = m.visible([m.roots[2]], null, { offset: 10, total: 25 });
    assert.deepEqual([e[0].posinset, e[0].setsize], [11, 25]);
  });

  it('expandedKeys: known keys in preorder then the remembered ones; survives new data; 1 and "1" are one key', () => {
    const { m } = mk([{ id: 1, children: [{ id: 2, children: [{ id: 3 }] }] }]);
    m.setExpanded(['gone', '2', 1]);
    assert.deepEqual(m.expandedKeys(), [1, '2', 'gone']);
    m.setData([{ id: 'gone', children: [{ id: 'g1' }] }, { id: 1, children: [] }]);
    assert.deepEqual(m.expandedKeys(), ['gone', 1, '2']);
    assert.equal(m.isExpanded(m.node('gone')), true);
    m.collapseAll();
    assert.deepEqual(m.expandedKeys(), []);
  });

  it('expandAll opens only loaded branches (no lazy load storm)', () => {
    const { m } = mk([{ id: 'a', children: [{ id: 'b', children: [{ id: 'c' }] }] }, { id: 'l', hasChildren: true }]);
    m.expandAll();
    assert.deepEqual(m.expandedKeys(), ['a', 'b']);
  });

  it('sort within each sibling group, the parent always before its children (stable)', () => {
    const { m } = mk([
      { id: 'b', n: 2, children: [{ id: 'b2', n: 2 }, { id: 'b1', n: 1 }, { id: 'b1x', n: 1 }] },
      { id: 'a', n: 1, children: [{ id: 'a9', n: 9 }] },
    ]);
    m.expandAll();
    const cmp = compareRows('n', 'asc');
    assert.deepEqual(vis(m, cmp), ['a', 'a9', 'b', 'b1', 'b1x', 'b2']);
    assert.deepEqual(vis(m, compareRows('n', 'desc')), ['b', 'b2', 'b1', 'b1x', 'a', 'a9']);
    const e = m.visible(m.sortedRoots(cmp), cmp);
    assert.deepEqual(e.filter((x) => x.level === 2 && x.node.parent.id === 'b').map((x) => x.posinset), [1, 2, 3]);
  });

  it('ownerOf / ownerIdx: identity → the owning node (never an index into data) — Codex r1 #4', () => {
    const data = [{ id: 'A', children: [{ id: 'A1' }] }, { id: 'B' }, { id: 'C', children: [{ id: 'A1' }] }];
    const { m } = mk(data);
    assert.equal(m.ownerOf('A1').row, data[0].children[0]);
    assert.equal(m.ownerOf('B').row, data[1]);
    const dupIdx = m.flat.findIndex((n) => n.dup);
    assert.equal(m.ownerIdx.get('A1'), 1);
    assert.notEqual(dupIdx, 1);
    assert.equal(m.flat[m.ownerIdx.get('A1')], m.ownerOf('A1'));
  });

  it('status entries: a loading (shown) or failed branch that is open gets one status row', () => {
    const { m } = mk([{ id: 'l', hasChildren: true }, { id: 'z' }]);
    m.expand('l');
    const e = m.visible(m.roots, null, { status: (n) => (n.id === 'l' ? 'error' : null) });
    assert.deepEqual(e.map((x) => (x.status ? `${x.status}@${x.level}` : x.node.id)), ['l', 'error@2', 'z']);
  });
});

describe('table-tree-model — lazy children (QĐ 13)', () => {
  it('loads, builds children, latest generation wins; [] → leaf; non-array → error', async () => {
    const { m } = mk([{ id: 'l', hasChildren: true }, { id: 'e', hasChildren: true }, { id: 'x', hasChildren: true }]);
    const seen = [];
    const r1 = await m.load(m.node('l'), (row, { signal }) => { seen.push([row.id, signal instanceof AbortSignal]); return [{ id: 'c1' }, { id: 'c2', hasChildren: true }]; });
    assert.deepEqual(seen, [['l', true]]);
    assert.deepEqual(r1, { ok: true, n: 2 });
    assert.deepEqual(m.node('l').children.map((n) => n.id), ['c1', 'c2']);
    assert.equal(m.node('c2').lazy, true);
    assert.equal(m.node('c1').depth, 1);
    const r2 = await m.load(m.node('e'), async () => []);
    assert.deepEqual(r2, { ok: true, n: 0 });
    assert.equal(m.expandable(m.node('e')), false);
    const r3 = await m.load(m.node('x'), () => 'nope');
    assert.equal(r3.ok, false);
    assert.ok(r3.error instanceof TypeError);
    assert.equal(m.node('x').loadError, true);
    assert.equal(m.node('x').children, null);
  });

  it('a rejection / throw → error; a retry after an error loads again', async () => {
    const { m } = mk([{ id: 'l', hasChildren: true }]);
    const r = await m.load(m.node('l'), () => { throw new Error('boom'); });
    assert.equal(r.ok, false);
    assert.equal(r.error.message, 'boom');
    const r2 = await m.load(m.node('l'), () => Promise.resolve([{ id: 'k' }]));
    assert.equal(r2.ok, true);
    assert.equal(m.node('l').loadError, false);
  });

  it('new data (generation) drops a late result and aborts the request', async () => {
    const { m } = mk([{ id: 'l', hasChildren: true }]);
    const d = deferred();
    let signal;
    const p = m.load(m.node('l'), (row, o) => { signal = o.signal; return d.promise; });
    assert.equal(m.node('l').loading, true);
    const old = m.node('l');
    m.setData([{ id: 'l', hasChildren: true }]);
    assert.equal(signal.aborted, true);
    d.resolve([{ id: 'late' }]);
    assert.deepEqual(await p, { stale: true });
    assert.equal(m.node('late'), undefined);
    assert.notEqual(m.node('l'), old);
    assert.equal(m.node('l').children, null);
  });

  it('a second load of the same node while loading shares the request', async () => {
    const { m } = mk([{ id: 'l', hasChildren: true }]);
    let calls = 0;
    const d = deferred();
    const p1 = m.load(m.node('l'), () => { calls += 1; return d.promise; });
    const p2 = m.load(m.node('l'), () => { calls += 1; return d.promise; });
    assert.equal(p1, p2);
    d.resolve([]);
    await p1;
    assert.equal(calls, 1);
  });

  it('flat (parent-key): loadChildren returns ONE level of rows; nested: nested rows', async () => {
    const { m } = mk([{ id: 'r', hasChildren: true }], { parentKey: 'parentId' });
    await m.load(m.node('r'), () => [{ id: 'k1', parentId: 'whatever' }, { id: 'k2', hasChildren: true }]);
    assert.deepEqual(m.node('r').children.map((n) => n.id), ['k1', 'k2']);
    const n = mk([{ id: 'r', hasChildren: true }]);
    await n.m.load(n.m.node('r'), () => [{ id: 'k', children: [{ id: 'kk' }] }]);
    assert.equal(n.m.node('kk').depth, 2);
  });

  it('abortAll: loading nodes go back to not loaded (opening again reloads)', async () => {
    const { m } = mk([{ id: 'l', hasChildren: true }]);
    const d = deferred();
    const p = m.load(m.node('l'), () => d.promise);
    m.abortAll();
    assert.equal(m.node('l').loading, false);
    d.resolve([{ id: 'x' }]);
    assert.deepEqual(await p, { stale: true });
    assert.equal(m.node('l').children, null);
    await flush();
  });
});

describe('table-tree-model — move / moveRow (QĐ 17, QĐ 18)', () => {
  const sib = () => mk([{ id: 'P', children: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] }, { id: 'Q' }]);
  const kids = (m, k) => m.node(k).children.map((n) => n.id).join('');

  it('index = the FINAL position after removing the source (forward, backward, same place = no-op)', () => {
    let { m } = sib();
    assert.equal(m.move('a', 'P', 2, {}).ok, true);
    assert.equal(kids(m, 'P'), 'bcad');
    ({ m } = sib());
    m.move('d', 'P', 1, {});
    assert.equal(kids(m, 'P'), 'adbc');
    ({ m } = sib());
    let called = 0;
    const r = m.move('b', 'P', 1, { canDrop: () => { called += 1; return true; } });
    assert.deepEqual([r.ok, r.noop], [true, true]);
    assert.equal(called, 0, 'canDrop is not called for a no-op');
    assert.equal(kids(m, 'P'), 'abcd');
  });

  it('index: negative / not an integer / NaN / Infinity → refused; too big → the end', () => {
    for (const bad of [-1, 1.5, NaN, Infinity, '1', null]) {
      const { m, warns } = sib();
      assert.equal(m.move('a', 'P', bad, {}).ok, false, String(bad));
      assert.equal(kids(m, 'P'), 'abcd');
      assert.equal(warns.length, 1);
    }
    const { m } = sib();
    assert.equal(m.move('a', 'P', 99, {}).ok, true);
    assert.equal(kids(m, 'P'), 'bcda');
    const r = m.move('Q', 'P', Number.MAX_SAFE_INTEGER, {});
    assert.equal(r.ok, true);
    assert.equal(kids(m, 'P'), 'bcdaQ');
    assert.deepEqual(m.roots.map((n) => n.id), ['P']);
    assert.equal(m.node('Q').depth, 1);
  });

  it('re-parent: root → child, child → root (parentKey null), the branch moves along (depth updated)', () => {
    const { m } = mk(NESTED());
    const r = m.move('thun', null, 1, {});
    assert.equal(r.ok, true);
    assert.deepEqual(m.roots.map((n) => n.id), ['ao', 'thun', 'quan', 'pk']);
    assert.equal(m.node('tron').depth, 1);
    assert.equal(r.from.parent, m.node('ao'));
    assert.equal(r.from.index, 0);
    assert.equal(r.to.parent, null);
    assert.equal(r.to.index, 1);
    m.move('quan', 'pk', 0, {});
    assert.equal(m.node('jeans').depth, 2);
    assert.equal(m.flat.map((n) => n.id).join(), 'ao,khoac,thun,tron,pk,quan,jeans');
  });

  it('refused (false + one warning, model unchanged): unknown key / parent, lazy parent not loaded, cycle, max-depth, canDrop false / throws', () => {
    const cases = [
      ['nope', 'ao', 0, {}],
      ['pk', 'nope', 0, {}],
      ['pk', 'lz', 0, {}],
      ['ao', 'tron', 0, {}],
      ['ao', 'ao', 0, {}],
      ['quan', 'tron', 0, { maxDepth: 4 }],
      ['pk', 'ao', 0, { canDrop: () => false }],
      ['pk', 'ao', 0, { canDrop: () => { throw new Error('x'); } }],
    ];
    for (const [k, p, i, o] of cases) {
      const { m, warns } = mk([...NESTED(), { id: 'lz', hasChildren: true }]);
      const before = tree(m);
      assert.equal(m.move(k, p, i, o).ok, false, `${k} → ${p}`);
      assert.equal(tree(m), before);
      assert.ok(warns.length >= 1, `${k} → ${p} warns`);
    }
    const { m } = mk(NESTED());
    assert.equal(m.move('quan', 'tron', 0, { maxDepth: 5 }).ok, true, 'jeans lands on level 5');
  });

  it('canDrop gets { key, row, parentKey, parentRow, index, level } (original keys)', () => {
    const data = [{ id: 1, children: [{ id: 2 }] }, { id: 3 }];
    const { m } = mk(data);
    let got;
    m.move(3, 1, 5, { canDrop: (x) => { got = x; return true; } });
    assert.deepEqual(got, { key: 3, row: data[1], parentKey: 1, parentRow: data[0], index: 1, level: 2 });
    m.move(3, null, 0, { canDrop: (x) => { got = x; return true; } });
    assert.deepEqual([got.parentKey, got.parentRow, got.level], [null, null, 1]);
  });

  it('into a leaf (it becomes a parent); the old parent may become a leaf', () => {
    const { m } = mk([{ id: 'a', children: [{ id: 'a1' }] }, { id: 'b' }]);
    m.move('a1', 'b', 0, {});
    assert.equal(m.expandable(m.node('a')), false);
    assert.equal(m.expandable(m.node('b')), true);
    assert.equal(tree(m), JSON.stringify([{ k: 'a', c: [] }, { k: 'b', c: [{ k: 'a1', c: [] }] }]));
  });

  it('getTree: model order, children null = not loaded yet', () => {
    const { m } = mk([{ id: 'l', hasChildren: true }, { id: 'x', children: [{ id: 'y' }] }]);
    m.move('x', null, 0, {});
    assert.equal(tree(m), JSON.stringify([{ k: 'x', c: [{ k: 'y', c: [] }] }, { k: 'l', c: null }]));
  });
});

describe('table-tree-model — deep / hostile input (Codex impl r1 #1, sec r1 #1–#2)', () => {
  const levels = (m) => Math.max(...m.flat.map((n) => n.depth)) + 1;
  const depthWarns = (w) => w.filter((x) => /deeper than/.test(x)).length;

  it('a flat parent-key chain of 50 000 rows: no stack overflow, exactly 16 levels, one depth warning', () => {
    const rows = Array.from({ length: 50000 }, (_, i) => ({ id: i, parentId: i ? i - 1 : null }));
    const { m, warns } = mk(rows, { parentKey: 'parentId' });
    assert.equal(levels(m), TREE_MAX_DEPTH);
    assert.equal(m.flat.length, TREE_MAX_DEPTH);
    assert.equal(depthWarns(warns), 1);
    assert.equal(m.node(TREE_MAX_DEPTH), undefined, 'a dropped row does not own its key');
    assert.equal(m.getTree().length, 1);
  });

  it('a nested children chain of 50 000 levels: no stack overflow, exactly 16 levels, one depth warning', () => {
    const top = { id: 0 };
    let cur = top;
    for (let i = 1; i < 50000; i++) {
      cur.children = [{ id: i }];
      cur = cur.children[0];
    }
    const { m, warns } = mk([top]);
    assert.equal(levels(m), TREE_MAX_DEPTH);
    assert.equal(m.flat.length, TREE_MAX_DEPTH);
    assert.equal(depthWarns(warns), 1);
    m.expandAll();
    assert.equal(m.visible(m.roots, null).length, TREE_MAX_DEPTH);
  });

  it('10 000-row chain and a 10 000-row single cycle build in linear time (< 200 ms); cycle rows become roots, one warning', () => {
    const chain = Array.from({ length: 10000 }, (_, i) => ({ id: i, parentId: i ? i - 1 : null }));
    let t0 = performance.now();
    mk(chain, { parentKey: 'parentId' });
    const tChain = performance.now() - t0;
    const ring = Array.from({ length: 10000 }, (_, i) => ({ id: i, parentId: (i + 1) % 10000 }));
    t0 = performance.now();
    const { m, warns } = mk(ring, { parentKey: 'parentId' });
    const tRing = performance.now() - t0;
    assert.ok(tChain < 200, `chain ${tChain.toFixed(1)} ms`);
    assert.ok(tRing < 200, `cycle ${tRing.toFixed(1)} ms`);
    assert.equal(m.roots.length, 10000);
    assert.equal(warns.filter((w) => /cycle/.test(w)).length, 1);
  });

  it('a failing build leaves the previous tree intact (atomic commit)', () => {
    const m = new TableTreeModel({ keyOf: (r) => r.id, warn: () => {} });
    m.setData(NESTED());
    m.expandAll();
    const snap = tree(m);
    const flat = m.flat.map((n) => n.id).join();
    m._isLazy = () => { throw new Error('hook'); };
    assert.throws(() => m.setData([{ id: 'q', hasChildren: true }]));
    assert.equal(tree(m), snap, 'old tree kept after a throwing build');
    assert.equal(m.flat.map((n) => n.id).join(), flat);
    assert.equal(m.node('q'), undefined, 'no key of the failed build leaked into the owners');
  });
});
