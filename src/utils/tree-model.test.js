// v0.29.0 (plan docs/internal/plans/v0.29.0-tree.md M1 / M3 / M4 / M5 / M6) — the pure tree model shared by <td-tree>
// and <td-tree-select>: normalize, visible list + navigation + type-ahead, filtering, selection (single / multiple /
// cascade), lazy children (latest-request-wins), value reconciliation.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TreeModel, normalizeValue, TREE_MAX_DEPTH, TREE_WARN_NODES } from './tree-model.js';

/** A model with captured warnings. */
function mk(mode = 'none', cascade = false) {
  const warns = [];
  const m = new TreeModel({ warn: (msg) => warns.push(String(msg)) });
  m.setMode(mode, cascade);
  return { m, warns };
}
const labels = (m) => m.visible().map((n) => n.label);
const vals = (m) => m.values;
const n = (m, v) => m.node(v);

// Điện thoại › (Apple › iPhone 15, iPhone 16), (Samsung › Galaxy S24) ; Laptop › Dell ; Phụ kiện (leaf)
const CATS = () => [
  { value: 'phone', label: 'Điện thoại', children: [
    { value: 'apple', label: 'Apple', children: [{ value: 'ip15', label: 'iPhone 15' }, { value: 'ip16', label: 'iPhone 16' }] },
    { value: 'samsung', label: 'Samsung', children: [{ value: 's24', label: 'Galaxy S24' }] },
  ] },
  { value: 'laptop', label: 'Laptop', children: [{ value: 'dell', label: 'Dell' }] },
  { value: 'acc', label: 'Phụ kiện' },
];

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('tree-model — normalizeValue', () => {
  it('strings (non-empty) and finite numbers only; everything else is null', () => {
    assert.equal(normalizeValue('a'), 'a');
    assert.equal(normalizeValue(7), '7');
    assert.equal(normalizeValue(0), '0');
    assert.equal(normalizeValue(1.5), '1.5');
    for (const bad of ['', null, undefined, NaN, Infinity, {}, [], ['a'], true, false, () => 1, Symbol('x')]) {
      assert.equal(normalizeValue(bad), null, String(typeof bad));
    }
  });
});

describe('tree-model — normalize (M1)', () => {
  it('builds internal nodes: uid counter, value coerced to string, depth, parent, fold, lazy, leaf, src', () => {
    const { m } = mk();
    const data = [{ value: 1, label: 'Hà Nội', children: [{ value: 'x', label: 'Ba Đình', description: 'Quận' }] },
      { value: 'lz', label: 'Lazy', hasChildren: true }, { value: 'e', label: 'Empty', children: [] }];
    m.setData(data);
    const a = n(m, '1');
    assert.equal(a.value, '1');
    assert.equal(a.depth, 0);
    assert.equal(a.parent, null);
    assert.equal(a.src, data[0]);
    assert.equal(a.fold, 'ha noi');
    const b = n(m, 'x');
    assert.equal(b.parent, a);
    assert.equal(b.depth, 1);
    assert.equal(b.description, 'Quận');
    assert.ok(Number.isInteger(a.uid) && Number.isInteger(b.uid) && a.uid !== b.uid);
    assert.equal(n(m, 'lz').lazy, true);
    assert.equal(n(m, 'lz').children, null);
    assert.equal(n(m, 'e').lazy, false);
    assert.deepEqual(n(m, 'e').children, []);
    assert.equal(m.getNode('x'), data[0].children[0]);
    assert.equal(m.getNode('nope'), null);
    // uids are never reused across generations
    const old = a.uid;
    m.setData(data);
    assert.ok(n(m, '1').uid > old);
  });

  it('labels / descriptions are text: coerced with String(), missing label → value', () => {
    const { m } = mk();
    m.setData([{ value: 'v', label: '<img src=x onerror=alert(1)>' }, { value: 'w' }, { value: 'z', label: 5 }]);
    assert.equal(n(m, 'v').label, '<img src=x onerror=alert(1)>');
    assert.equal(n(m, 'w').label, 'w');
    assert.equal(n(m, 'z').label, '5');
  });

  it('invalid value ("" / null / undefined / object / array / boolean) drops the WHOLE branch + one warning', () => {
    const { m, warns } = mk();
    m.setData([
      { value: '', label: 'empty', children: [{ value: 'c1', label: 'C1' }] },
      { value: null, label: 'null' }, { label: 'none' }, { value: {}, label: 'obj' }, { value: ['a'], label: 'arr' },
      { value: true, label: 'bool' }, { value: 'ok', label: 'OK' },
    ]);
    assert.deepEqual(labels(m), ['OK']);
    assert.equal(m.node('c1'), null);
    assert.equal(warns.filter((w) => /value/i.test(w)).length, 1, warns.join('\n'));
  });

  it('duplicate value: one warning, the later node is locked and never part of the value', () => {
    const { m, warns } = mk('multiple');
    m.setData([{ value: 'a', label: 'A' }, { value: 'b', label: 'B', children: [{ value: 'a', label: 'A2' }] }]);
    assert.equal(warns.filter((w) => /duplicate/i.test(w)).length, 1);
    const dup = m.visible().length; // roots only
    assert.equal(dup, 2);
    m.expandAll();
    const a2 = m.visible().find((x) => x.label === 'A2');
    assert.equal(a2.locked, true);
    assert.equal(m.canSelect(a2), false);
    assert.equal(m.node('a').label, 'A'); // the value maps to the first node
    m.setValues(['a']);
    assert.equal(m.isSelected(a2), false);
    assert.equal(m.isSelected(m.node('a')), true);
  });

  it('repeated object / cycles are skipped (iterative, no stack overflow) + warning', () => {
    const { m, warns } = mk();
    const shared = { value: 's', label: 'S' };
    const loop = { value: 'l', label: 'L', children: [] };
    loop.children.push(loop);
    m.setData([shared, { value: 'p', label: 'P', children: [shared] }, loop]);
    m.expandAll();
    assert.deepEqual(labels(m), ['S', 'P', 'L']);
    assert.ok(warns.some((w) => /repeated|cycle/i.test(w)), warns.join('\n'));
  });

  it(`depth limit ${TREE_MAX_DEPTH}: deeper nodes dropped (+ warning), 10 000 levels do not overflow`, () => {
    const { m, warns } = mk();
    const deep = (k) => {
      const root = { value: 'd0', label: 'd0' };
      let cur = root;
      for (let i = 1; i < k; i++) { const c = { value: `d${i}`, label: `d${i}` }; cur.children = [c]; cur = c; }
      return root;
    };
    m.setData([deep(TREE_MAX_DEPTH + 4)]);
    assert.ok(m.node(`d${TREE_MAX_DEPTH - 1}`));
    assert.equal(m.node(`d${TREE_MAX_DEPTH}`), null);
    assert.equal(warns.filter((w) => /depth/i.test(w)).length, 1);
    assert.deepEqual(m.node(`d${TREE_MAX_DEPTH - 1}`).children, []); // becomes a leaf
    m.setData([deep(10000)]);
    assert.equal(warns.filter((w) => /depth/i.test(w)).length, 1, 'warned once per model');
  });

  it(`> ${TREE_WARN_NODES} nodes: one warning suggesting loadChildren (still runs)`, () => {
    const { m, warns } = mk();
    const big = Array.from({ length: TREE_WARN_NODES + 1 }, (_, i) => ({ value: `v${i}`, label: `L${i}` }));
    m.setData(big);
    assert.equal(m.visible().length, TREE_WARN_NODES + 1);
    assert.equal(warns.filter((w) => /loadChildren/.test(w)).length, 1);
    m.setData(big);
    assert.equal(warns.filter((w) => /loadChildren/.test(w)).length, 1);
  });

  it('disabled locks the node AND its whole branch (inherited), expand still allowed', () => {
    const { m } = mk('multiple');
    m.setData([{ value: 'p', label: 'P', disabled: true, children: [{ value: 'c', label: 'C', children: [{ value: 'g', label: 'G' }] }] }, { value: 'q', label: 'Q' }]);
    for (const v of ['p', 'c', 'g']) assert.equal(n(m, v).locked, true, v);
    assert.equal(n(m, 'p').disabled, true);
    assert.equal(n(m, 'c').disabled, false);
    assert.equal(n(m, 'q').locked, false);
    m.expand(n(m, 'p'));
    assert.deepEqual(labels(m), ['P', 'C', 'Q']);
  });
});

describe('tree-model — visible list, navigation, type-ahead (M1 / M2)', () => {
  it('visible = roots + children of expanded nodes (preorder); expanded flag from data', () => {
    const { m } = mk();
    const data = CATS();
    data[0].expanded = true;
    m.setData(data);
    assert.deepEqual(labels(m), ['Điện thoại', 'Apple', 'Samsung', 'Laptop', 'Phụ kiện']);
    m.expand(n(m, 'apple'));
    assert.deepEqual(labels(m), ['Điện thoại', 'Apple', 'iPhone 15', 'iPhone 16', 'Samsung', 'Laptop', 'Phụ kiện']);
    m.collapse(n(m, 'phone'));
    assert.deepEqual(labels(m), ['Điện thoại', 'Laptop', 'Phụ kiện']);
    m.expand(n(m, 'phone'));
    assert.ok(m.isExpanded(n(m, 'apple')), 'a descendant keeps its own state');
    assert.equal(m.expandable(n(m, 'acc')), false);
    assert.equal(m.expandable(n(m, 'phone')), true);
  });

  it('next / prev (no wrap), parentOf, firstChild, first / last', () => {
    const { m } = mk();
    m.setData(CATS());
    m.expand(n(m, 'phone'));
    assert.equal(m.next(n(m, 'phone')).value, 'apple');
    assert.equal(m.next(n(m, 'samsung')).value, 'laptop');
    assert.equal(m.next(n(m, 'acc')), null);
    assert.equal(m.prev(n(m, 'phone')), null);
    assert.equal(m.prev(n(m, 'laptop')).value, 'samsung');
    assert.equal(m.parentOf(n(m, 'apple')).value, 'phone');
    assert.equal(m.parentOf(n(m, 'phone')), null);
    assert.equal(m.firstChild(n(m, 'phone')).value, 'apple');
    assert.equal(m.firstChild(n(m, 'apple')), null, 'collapsed');
    assert.equal(m.first().value, 'phone');
    assert.equal(m.last().value, 'acc');
  });

  it('siblingInfo: aria-setsize / posinset among the VISIBLE siblings', () => {
    const { m } = mk();
    m.setData(CATS());
    assert.deepEqual(m.siblingInfo(n(m, 'laptop')), { setsize: 3, posinset: 2, level: 1 });
    m.expand(n(m, 'phone'));
    assert.deepEqual(m.siblingInfo(n(m, 'samsung')), { setsize: 2, posinset: 2, level: 2 });
  });

  it('type-ahead on visible labels, diacritic-insensitive, cycles', () => {
    const { m } = mk();
    m.setData([{ value: 'a', label: 'Đà Nẵng' }, { value: 'b', label: 'Hà Nội' }, { value: 'c', label: 'Hải Phòng' }]);
    assert.equal(m.typeahead(null, 'h').value, 'b');
    assert.equal(m.typeahead(n(m, 'b'), 'h').value, 'c');
    assert.equal(m.typeahead(n(m, 'c'), 'h').value, 'b');
    assert.equal(m.typeahead(null, 'da').value, 'a');
    assert.equal(m.typeahead(null, 'x'), null);
  });

  it('expandSiblings (*) expands every expandable visible sibling, expandAll / collapseAll (loaded nodes only)', () => {
    const { m } = mk();
    m.setData(CATS());
    m.expandSiblings(n(m, 'acc'));
    assert.deepEqual(labels(m), ['Điện thoại', 'Apple', 'Samsung', 'Laptop', 'Dell', 'Phụ kiện']);
    m.collapseAll();
    assert.deepEqual(labels(m), ['Điện thoại', 'Laptop', 'Phụ kiện']);
    m.expandAll();
    assert.equal(m.visible().length, 9);
  });

  it('pathOf: ancestor labels root → node', () => {
    const { m } = mk();
    m.setData(CATS());
    assert.deepEqual(m.pathOf(n(m, 'ip15')), ['Điện thoại', 'Apple', 'iPhone 15']);
  });
});

describe('tree-model — filter (M5)', () => {
  it('shows matches + ancestors (temporarily expanded), diacritic-insensitive; clearing restores the real state', () => {
    const { m } = mk();
    m.setData(CATS());
    m.expand(n(m, 'laptop'));
    m.setFilter('iphone');
    assert.equal(m.filterActive, true);
    assert.equal(m.matchCount, 2);
    assert.deepEqual(labels(m), ['Điện thoại', 'Apple', 'iPhone 15', 'iPhone 16']);
    assert.deepEqual(m.siblingInfo(n(m, 'apple')), { setsize: 1, posinset: 1, level: 2 });
    assert.equal(n(m, 'phone').expanded, false, 'real state untouched');
    m.setFilter('dien');
    assert.deepEqual(labels(m), ['Điện thoại'], 'a matching parent is shown collapsed');
    m.expand(n(m, 'phone'));
    assert.deepEqual(labels(m), ['Điện thoại', 'Apple', 'Samsung'], 'expanding a match shows ALL its children');
    m.setFilter('   ');
    assert.equal(m.filterActive, false);
    assert.deepEqual(labels(m), ['Điện thoại', 'Laptop', 'Dell', 'Phụ kiện'], 'back to the state before filtering');
  });

  it('no match → empty list, matchCount 0', () => {
    const { m } = mk();
    m.setData(CATS());
    m.setFilter('zzz');
    assert.deepEqual(labels(m), []);
    assert.equal(m.matchCount, 0);
  });
});

describe('tree-model — single (M3)', () => {
  it('activate selects (any node, parent or leaf); same node → no change; diff payload', () => {
    const { m } = mk('single');
    m.setData(CATS());
    assert.deepEqual(m.activate(n(m, 'phone')), { added: ['phone'], removed: [] });
    assert.deepEqual(vals(m), ['phone']);
    assert.equal(m.activate(n(m, 'phone')), null);
    assert.deepEqual(m.activate(n(m, 'acc')), { added: ['acc'], removed: ['phone'] });
    assert.equal(m.isSelected(n(m, 'acc')), true);
    assert.equal(m.isSelected(n(m, 'phone')), false);
  });

  it('setValues keeps one value; revealSelected expands the ancestors', () => {
    const { m } = mk('single');
    m.setData(CATS());
    m.setValues(['ip16', 'dell']);
    assert.deepEqual(vals(m), ['ip16']);
    m.revealSelected();
    assert.ok(labels(m).includes('iPhone 16'));
  });

  it('a locked node is never selectable; a LOCKED selection blocks every other pick and clearing (setValues still works)', () => {
    const { m } = mk('single');
    m.setData([{ value: 'a', label: 'A', disabled: true }, { value: 'b', label: 'B' }]);
    assert.equal(m.activate(n(m, 'a')), null);
    m.setValues(['a']);
    assert.equal(m.singleLocked(), true);
    assert.equal(m.canSelect(n(m, 'b')), false);
    assert.equal(m.activate(n(m, 'b')), null);
    assert.equal(m.clear(), null);
    assert.equal(m.hasClearable(), false);
    assert.deepEqual(vals(m), ['a']);
    m.setValues(['b']);
    assert.deepEqual(vals(m), ['b']);
    assert.deepEqual(m.clear(), { added: [], removed: ['b'] });
  });

  it('mode none: nothing selectable', () => {
    const { m } = mk('none');
    m.setData(CATS());
    assert.equal(m.canSelect(n(m, 'acc')), false);
    assert.equal(m.activate(n(m, 'acc')), null);
  });
});

describe('tree-model — multiple, independent (M3)', () => {
  it('each node its own check (no tri-state); value = every checked node in PREORDER', () => {
    const { m } = mk('multiple');
    m.setData(CATS());
    assert.deepEqual(m.activate(n(m, 'acc')), { added: ['acc'], removed: [] });
    m.activate(n(m, 'phone'));
    m.activate(n(m, 'dell'));
    assert.deepEqual(vals(m), ['phone', 'dell', 'acc']);
    assert.equal(m.checkState(n(m, 'phone')), 'true');
    assert.equal(m.checkState(n(m, 'apple')), 'false');
    assert.equal(m.checkState(n(m, 'laptop')), 'false', 'no mixed in independent mode');
    assert.deepEqual(m.activate(n(m, 'phone')), { added: [], removed: ['phone'] });
  });

  it('locked: never toggled by the user; clear() removes only the unlocked ones; required counts the locked', () => {
    const { m } = mk('multiple');
    m.setData([{ value: 'a', label: 'A', disabled: true }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }]);
    m.setValues(['a', 'b']);
    assert.equal(m.activate(n(m, 'a')), null);
    assert.equal(m.hasClearable(), true);
    assert.deepEqual(m.clear(), { added: [], removed: ['b'] });
    assert.deepEqual(vals(m), ['a']);
    assert.equal(m.hasClearable(), false);
    assert.equal(m.clear(), null);
    assert.equal(m.isEmpty(), false, 'a locked selected value is a value (required satisfied)');
  });

  it('setValues filters "" / bad types and duplicates', () => {
    const { m } = mk('multiple');
    m.setData(CATS());
    m.setValues(['acc', '', null, {}, true, 'acc', 'dell']);
    assert.deepEqual(vals(m), ['dell', 'acc']);
  });
});

describe('tree-model — multiple + cascade (M3 rules 1-6)', () => {
  const PERMS = () => [
    { value: 'post', label: 'Bài viết', children: [
      { value: 'post.read', label: 'Xem' }, { value: 'post.write', label: 'Sửa' }, { value: 'post.del', label: 'Xoá', disabled: true },
    ] },
    { value: 'user', label: 'Người dùng', children: [{ value: 'user.read', label: 'Xem' }] },
    { value: 'sys', label: 'Hệ thống', disabled: true, children: [{ value: 'sys.a', label: 'A' }, { value: 'sys.b', label: 'B' }] },
  ];

  it('value = checked LEAVES only; parent state from every descendant leaf (locked included)', () => {
    const { m } = mk('multiple', true);
    m.setData(PERMS());
    assert.equal(m.cascade, true);
    m.activate(n(m, 'post.read'));
    assert.equal(m.checkState(n(m, 'post')), 'mixed');
    m.activate(n(m, 'post.write'));
    assert.equal(m.checkState(n(m, 'post')), 'mixed', 'the locked unchecked leaf keeps it mixed (honest)');
    assert.deepEqual(vals(m), ['post.read', 'post.write']);
    m.setValues(['post.read', 'post.write', 'post.del']);
    assert.equal(m.checkState(n(m, 'post')), 'true');
  });

  it('click parent: all unlocked leaves checked → uncheck them, else check them; locked leaves untouched (never stuck)', () => {
    const { m } = mk('multiple', true);
    m.setData(PERMS());
    assert.deepEqual(m.activate(n(m, 'post')), { added: ['post.read', 'post.write'], removed: [] });
    assert.equal(m.checkState(n(m, 'post')), 'mixed');
    assert.deepEqual(m.activate(n(m, 'post')), { added: [], removed: ['post.read', 'post.write'] }, 'mixed parent toggles back');
    assert.equal(m.checkState(n(m, 'post')), 'false');
    m.setValues(['post.del']);
    assert.deepEqual(m.activate(n(m, 'post')), { added: ['post.read', 'post.write'], removed: [] });
    assert.equal(m.checkState(n(m, 'post')), 'true');
    assert.deepEqual(m.activate(n(m, 'post')), { added: [], removed: ['post.read', 'post.write'] });
    assert.deepEqual(vals(m), ['post.del']);
  });

  it('rule 1: a disabled parent locks the branch; its click does nothing', () => {
    const { m } = mk('multiple', true);
    m.setData(PERMS());
    m.setValues(['sys.a']);
    assert.equal(m.canSelect(n(m, 'sys')), false);
    assert.equal(m.activate(n(m, 'sys')), null);
    assert.equal(m.activate(n(m, 'sys.b')), null);
    assert.equal(m.checkState(n(m, 'sys')), 'mixed');
  });

  it('rule 5: parent / unknown values dropped with one warning', () => {
    const { m, warns } = mk('multiple', true);
    m.setData(PERMS());
    m.setValues(['post', 'nope', 'user.read']);
    assert.deepEqual(vals(m), ['user.read']);
    assert.equal(m.checkState(n(m, 'user')), 'true');
    assert.equal(warns.filter((w) => /cascade/i.test(w)).length, 1);
    m.setValues(['post']);
    assert.equal(warns.filter((w) => /cascade/i.test(w)).length, 1, 'once');
  });

  it('review ISSUE-1: turning cascade ON at runtime drops parent values and recounts tri-state (values event)', () => {
    const { m, warns } = mk('multiple');
    m.setData(PERMS());
    m.setValues(['post', 'post.read']);
    assert.deepEqual(vals(m), ['post', 'post.read']);
    const ev = [];
    m.subscribe((e) => ev.push(e.type));
    m.setMode('multiple', true);
    assert.deepEqual(vals(m), ['post.read']);
    assert.equal(m.checkState(n(m, 'post')), 'mixed');
    assert.ok(ev.includes('values'));
    assert.equal(warns.filter((w) => /cascade/i.test(w)).length, 1);
  });

  it('review ISSUE-1: removing loadChildren makes an opted-in cascade effective → parents dropped, tri-state recounted', () => {
    const { m } = mk('multiple', true);
    m.setLoader(async () => []);
    m.setData(PERMS());
    m.setValues(['post', 'post.read']);
    assert.deepEqual(vals(m), ['post', 'post.read'], 'independent while lazy');
    const ev = [];
    m.subscribe((e) => ev.push(e.type));
    m.setLoader(null);
    assert.equal(m.cascade, true);
    assert.deepEqual(vals(m), ['post.read']);
    assert.equal(m.checkState(n(m, 'post')), 'mixed');
    assert.ok(ev.includes('values'));
  });

  it('rule 6: cascade + loadChildren → one warning, independent multiple', () => {
    const { m, warns } = mk('multiple', true);
    m.setLoader(async () => []);
    m.setData(PERMS());
    assert.equal(m.cascade, false);
    assert.equal(warns.filter((w) => /cascade/i.test(w) && /loadChildren/.test(w)).length, 1);
    m.activate(n(m, 'post'));
    assert.deepEqual(vals(m), ['post']);
  });
});

describe('tree-model — lazy children (M4)', () => {
  it('expand a lazy node → loader(src, { signal }) once; children normalized (depth, locked inherited); events', async () => {
    const { m } = mk('multiple');
    const calls = [];
    const d = deferred();
    m.setLoader((src, ctx) => { calls.push([src, ctx.signal]); return d.promise; });
    const data = [{ value: 'r', label: 'R', hasChildren: true, disabled: true }];
    m.setData(data);
    const events = [];
    m.subscribe((e) => events.push(e.type));
    const r = n(m, 'r');
    const p = m.expand(r);
    assert.ok(p instanceof Promise);
    assert.equal(r.loading, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], data[0]);
    assert.ok(calls[0][1] instanceof AbortSignal);
    d.resolve([{ value: 'c', label: 'C' }]);
    await p;
    assert.equal(r.loading, false);
    assert.equal(n(m, 'c').depth, 1);
    assert.equal(n(m, 'c').locked, true, 'locked inherited from the parent');
    assert.ok(m.isExpanded(r));
    assert.deepEqual(labels(m), ['R', 'C']);
    assert.ok(events.includes('loading') && events.includes('load'));
  });

  it('collapse while loading: result cached, NOT re-opened; a second expand does not request again', async () => {
    const { m } = mk();
    let count = 0;
    const d = deferred();
    m.setLoader(() => { count++; return d.promise; });
    m.setData([{ value: 'r', label: 'R', hasChildren: true }]);
    const r = n(m, 'r');
    const p = m.expand(r);
    m.collapse(r);
    d.resolve([{ value: 'c', label: 'C' }]);
    await p;
    assert.equal(m.isExpanded(r), false);
    assert.deepEqual(r.children.map((x) => x.value), ['c']);
    assert.equal(m.expand(r), null, 'already loaded');
    assert.equal(count, 1);
    // two quick opens while loading → one request
    m.setData([{ value: 'q', label: 'Q', hasChildren: true }]);
    const d2 = deferred();
    m.setLoader(() => { count++; return d2.promise; });
    const q = n(m, 'q');
    const p1 = m.expand(q);
    m.collapse(q);
    m.expand(q);
    assert.equal(count, 2);
    d2.resolve([]);
    await p1;
    assert.equal(q.lazy, false);
    assert.deepEqual(q.children, [], 'empty array → leaf');
    assert.equal(m.expandable(q), false);
  });

  it('new data / abortAll: in-flight requests aborted, late results dropped EVEN when the hook ignores the signal', async () => {
    const { m } = mk();
    const ds = [];
    const signals = [];
    m.setLoader((src, { signal }) => { const d = deferred(); ds.push(d); signals.push(signal); return d.promise; });
    m.setData([{ value: 'r', label: 'R', hasChildren: true }]);
    const r = n(m, 'r');
    m.expand(r);
    m.setData([{ value: 'r', label: 'R2', hasChildren: true }]);
    assert.equal(signals[0].aborted, true);
    ds[0].resolve([{ value: 'late', label: 'Late' }]);
    await flush();
    assert.equal(m.node('late'), null);
    // abortAll (disconnect): loading node back to lazy-not-loaded, reload on next expand
    const r2 = n(m, 'r');
    m.expand(r2);
    m.abortAll();
    assert.equal(signals[1].aborted, true);
    assert.equal(r2.loading, false);
    assert.equal(r2.children, null);
    assert.equal(m.isExpanded(r2), false);
    ds[1].resolve([{ value: 'late2', label: 'Late2' }]);
    await flush();
    assert.equal(m.node('late2'), null);
    const p = m.expand(r2);
    assert.equal(ds.length, 3, 'reloads');
    ds[2].resolve([{ value: 'ok', label: 'OK' }]);
    await p;
    assert.ok(m.node('ok'));
  });

  it('non-array / rejection → error state (closed, loadError, load-error event); expanding again retries', async () => {
    const { m } = mk();
    let mode = 'bad';
    m.setLoader(async () => { if (mode === 'bad') return { nope: 1 }; if (mode === 'throw') throw new Error('x'); return [{ value: 'c', label: 'C' }]; });
    m.setData([{ value: 'r', label: 'R', hasChildren: true }]);
    const errs = [];
    m.subscribe((e) => { if (e.type === 'load-error') errs.push(e); });
    const r = n(m, 'r');
    await m.expand(r);
    assert.equal(r.loadError, true);
    assert.equal(m.isExpanded(r), false);
    assert.equal(errs.length, 1);
    mode = 'throw';
    await m.expand(r);
    assert.equal(errs.length, 2);
    assert.equal(errs[1].error.message, 'x');
    mode = 'ok';
    await m.expand(r);
    assert.equal(r.loadError, false);
    assert.deepEqual(labels(m), ['R', 'C']);
  });

  it('loaded children go through normalize: duplicate value vs the existing tree, depth limit', async () => {
    const { m, warns } = mk('multiple');
    m.setLoader(async () => [{ value: 'a', label: 'dup' }, { value: '', label: 'bad' }, { value: 'n', label: 'N' }]);
    m.setData([{ value: 'a', label: 'A' }, { value: 'r', label: 'R', hasChildren: true }]);
    await m.expand(n(m, 'r'));
    const kids = n(m, 'r').children;
    assert.deepEqual(kids.map((k) => k.label), ['dup', 'N']);
    assert.equal(kids[0].locked, true);
    assert.equal(m.node('a').label, 'A');
    assert.ok(warns.some((w) => /duplicate/i.test(w)));
  });

  it('review S-02: expandSiblings (*) opens only LOADED siblings — lazy ones are never requested', () => {
    const { m } = mk();
    const asked = [];
    m.setLoader(async (src) => { asked.push(src.value); return []; });
    m.setData([{ value: 'a', label: 'A', hasChildren: true }, { value: 'b', label: 'B', hasChildren: true },
      { value: 'c', label: 'C', children: [{ value: 'c1', label: 'C1' }] }]);
    const started = m.expandSiblings(n(m, 'a'));
    assert.deepEqual(started, []);
    assert.deepEqual(asked, []);
    assert.equal(m.isExpanded(n(m, 'c')), true);
    assert.equal(m.wantsOpen(n(m, 'a')), false);
  });
});

describe('tree-model — value reconciliation (M6)', () => {
  it('values set BEFORE data are kept (unresolved), then resolved / dropped when the data arrives', () => {
    const { m, warns } = mk('multiple');
    m.setValues(['dell', 'ghost']);
    assert.deepEqual(vals(m), ['dell', 'ghost']);
    assert.equal(m.isComplete(), false);
    m.setData(CATS());
    assert.deepEqual(vals(m), ['dell'], 'eager data is complete: unknown value dropped');
    assert.equal(warns.filter((w) => /not in the tree/.test(w)).length, 1);
  });

  it('single: same rule', () => {
    const { m } = mk('single');
    m.setValues(['ghost']);
    assert.deepEqual(vals(m), ['ghost']);
    m.setData(CATS());
    assert.deepEqual(vals(m), []);
  });

  it('lazy model: unknown values kept (submitted, unresolved) until a load resolves them; dropped once complete; no change', async () => {
    const { m, warns } = mk('multiple');
    m.setLoader(async (src) => (src.value === 'r' ? [{ value: 'deep', label: 'Sâu' }, { value: 'sub', label: 'Sub', hasChildren: true }] : [{ value: 'x', label: 'X' }]));
    m.setValues(['deep', 'ghost', 'acc']);
    m.setData([{ value: 'r', label: 'R', hasChildren: true }, { value: 'acc', label: 'Phụ kiện' }]);
    assert.deepEqual(vals(m), ['acc', 'deep', 'ghost'], 'resolved in preorder, unresolved appended in order received');
    assert.deepEqual(m.unresolved(), ['deep', 'ghost']);
    assert.equal(m.isEmpty(), false);
    await m.expand(n(m, 'r'));
    assert.deepEqual(vals(m), ['deep', 'acc', 'ghost'], 'deep resolved (preorder position)');
    assert.equal(m.isComplete(), false, 'sub still lazy');
    await m.expand(n(m, 'sub'));
    assert.equal(m.isComplete(), true);
    assert.deepEqual(vals(m), ['deep', 'acc'], 'complete: ghost dropped');
    assert.equal(warns.filter((w) => /not in the tree/.test(w)).length, 1);
  });

  it('single + lazy: unresolved value kept until it resolves', async () => {
    const { m } = mk('single');
    m.setLoader(async () => [{ value: 'deep', label: 'Sâu' }]);
    m.setData([{ value: 'r', label: 'R', hasChildren: true }]);
    m.setValues(['deep']);
    assert.deepEqual(vals(m), ['deep']);
    assert.equal(m.node('deep'), null);
    await m.expand(n(m, 'r'));
    assert.equal(m.isSelected(n(m, 'deep')), true);
  });

  it('new data keeps values that still exist (by value)', () => {
    const { m } = mk('multiple');
    m.setData(CATS());
    m.setValues(['dell', 'acc']);
    m.setData([{ value: 'acc', label: 'Phụ kiện mới' }]);
    assert.deepEqual(vals(m), ['acc']);
  });
});
