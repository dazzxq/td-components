// v0.46.0 (plan docs/internal/plans/v0.46.0-diff.md M1) — pure model of <td-diff>: kinds, typed paths, key order,
// numbers, formatting, strings, masking, budgets. The PHP side (Td::diffModel) is held to the same model by
// test/php/td-ssr-diff.test.js through test/ssr/diff.fixtures.json.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalize, parityModel, canonicalNumber, roundDecimal, formatNumber, formatDate, orderKeys, isIndexKey, cleanText,
  splitInvisible, deepEqual, jsonString, LIMITS, DEFAULT_LABELS, fill,
} from './diff-model.js';

const rowsOf = (m) => m.rows.map((r) => [r.id, r.kind]);
const byId = (m, path) => m.rows.find((r) => r.id === JSON.stringify(path));
const txt = (c) => (c === null ? null : c.k === 'list' ? c.items.map((i) => i.m + i.s) : c.k === 'masked' ? 'MASKED' : c.s);

describe('diff-model — kinds (QĐ 2)', () => {
  test('empty = missing / undefined / null / blank string / [] / {}; added / removed / changed / unchanged', () => {
    const m = normalize({ items: [
      { key: 'a', after: 'x' }, { key: 'b', before: 'x' }, { key: 'c', before: 'x', after: 'y' }, { key: 'd', before: 'x', after: 'x' },
      { key: 'e', before: null, after: '  ' }, { key: 'f', before: [], after: {} }, { key: 'g', before: null, after: 0 },
      { key: 'h', before: false, after: undefined }, { key: 'i', before: '\t\n', after: 'z' },
    ] });
    assert.deepEqual(m.rows.map((r) => r.kind), ['added', 'removed', 'changed', 'unchanged', 'unchanged', 'unchanged', 'added', 'removed', 'added']);
    assert.deepEqual(m.counts, { added: 3, removed: 2, changed: 1, unchanged: 3, hidden: 0, truncated: false });
  });

  test('a type change is a real change (1 vs "1"); objects compare by key SET; lists by order', () => {
    const m = normalize({ items: [
      { key: 'n', before: 1, after: '1' }, { key: 'o', before: { a: 1, b: [1, 2] }, after: { b: [1, 2], a: 1 } },
      { key: 'l', before: ['a', 'b'], after: ['b', 'a'] }, { key: 'f', before: 1, after: 1.0 }, { key: 'z', before: -0, after: 0 },
    ] });
    assert.deepEqual(m.rows.map((r) => r.kind), ['changed', 'unchanged', 'changed', 'unchanged', 'unchanged']);
  });

  test('a given kind is trusted; an invalid one is recomputed + one warning code (no value)', () => {
    const m = normalize({ items: [{ key: 'a', before: 'x', after: 'x', kind: 'changed' }, { key: 'b', before: 'x', after: 'y', kind: 'bogus' }, { key: 'c', kind: 'nope' }] });
    assert.deepEqual(m.rows.map((r) => r.kind), ['changed', 'changed', 'unchanged']);
    assert.deepEqual(m.warnings, ['kind']);
  });

  test('items: dropped (not an object, no key) → warning; number key → string; null items → snapshot mode', () => {
    const m = normalize({ items: [null, 'x', [], { label: 'no key' }, { key: '' }, { key: 12, after: 1 }, { key: 1.5, after: 2 }] });
    assert.deepEqual(m.rows.map((r) => r.path), [['12'], ['1.5']]);
    assert.deepEqual(m.warnings, ['item']);
    assert.equal(normalize({ items: null, before: { a: 1 } }).rows.length, 1);
  });
});

describe('diff-model — typed paths, labels, order (QĐ 3, 3a)', () => {
  test('a dotted key and a nested key are two rows; labels a.b vs a › b; ids are JSON of the typed path', () => {
    const m = normalize({ after: JSON.parse('{"a.b":1,"a":{"b":2}}') });
    assert.deepEqual(m.rows.map((r) => [r.id, r.label]), [['["a.b"]', 'a.b'], ['["a","b"]', 'a › b']]);
  });

  test("['lines', 0] (array index) ≠ ['lines', '0'] (object key)", () => {
    const list = normalize({ after: { lines: [{ qty: 1 }] }, fields: [{ path: ['lines', 0, 'qty'], label: 'SL đầu' }] });
    const obj = normalize({ after: JSON.parse('{"lines":{"0":{"qty":1}}}'), fields: [{ path: ['lines', 0, 'qty'], label: 'SL đầu' }] });
    assert.deepEqual(list.rows.map((r) => [r.path, r.label]), [[['lines', 0, 'qty'], 'SL đầu']]);
    assert.deepEqual(obj.rows.map((r) => [r.path, r.label]), [[['lines', '0', 'qty'], 'lines › 0 › qty']]);
  });

  test('labels: exact FieldDef, longest labelled prefix + segments, #n for indexes; string path = ONE root key', () => {
    const m = normalize({
      after: { lines: [{ qty: 1 }, { qty: 2 }], 'x.y': 1 },
      fields: [{ path: 'lines', label: 'Dòng hàng' }, { path: ['lines', 1, 'qty'], label: 'SL dòng 2' }, { path: 'x.y', label: 'XY' }],
    });
    assert.deepEqual(m.rows.map((r) => r.label), ['Dòng hàng › #1 › qty', 'SL dòng 2', 'XY']);
  });

  test('order: fields first (by first matching FieldDef), then after then before; no alphabetical sort', () => {
    const m = normalize({ before: { z: 1, old: 1 }, after: { z: 2, b: 1, a: 1 }, fields: [{ path: 'a' }, { path: 'old' }] });
    assert.deepEqual(m.rows.map((r) => r.path[0]), ['a', 'old', 'z', 'b']);
  });

  test('3a key order = JS own-property order: index keys ascending (numerically), then insertion order', () => {
    assert.deepEqual(orderKeys(['b', '10', '2', 'a', '1']), ['1', '2', '10', 'b', 'a']);
    for (const k of ['0', '1', '10', '4294967294']) assert.equal(isIndexKey(k), true, k);
    for (const k of ['01', '-1', '1.5', '1e3', ' 1', '4294967295', '+1', '-0', '']) assert.equal(isIndexKey(k), false, k);
    const m = normalize({ after: JSON.parse('{"b":1,"10":2,"2":3,"a":4,"1":5,"4294967295":6,"4294967294":7}') });
    assert.deepEqual(m.rows.map((r) => r.path[0]), ['1', '2', '10', '4294967294', 'b', 'a', '4294967295']);
    assert.ok(m.rows.every((r) => typeof r.path[0] === 'string'));
  });

  test('duplicate JSON key: last value, first position', () => {
    const m = normalize({ after: JSON.parse('{"a":1,"b":2,"a":3}') });
    assert.deepEqual(m.rows.map((r) => [r.path[0], txt(r.after)]), [['a', '3'], ['b', '2']]);
  });

  test('invalid FieldDef paths dropped with their index only', () => {
    const m = normalize({ after: { a: 1 }, fields: [{ path: [] }, { path: ['a', -1] }, { path: ['a', 1.5] }, { path: [{}] },
      { path: Array(8).fill('a') }, { path: 'x'.repeat(201) }, { path: 'a', label: 'A' }, 'nope'] });
    assert.deepEqual(m.warnings, ['field:0', 'field:1', 'field:2', 'field:3', 'field:4', 'field:5', 'field:7']);
    assert.equal(m.rows[0].label, 'A');
  });

  test('prototype safety: only own enumerable keys; JSON.parse __proto__ is a normal row; polluted prototype unseen', () => {
    Object.prototype.polluted = 'x'; // eslint-disable-line no-extend-native
    try {
      const m = normalize({ after: JSON.parse('{"__proto__":{"admin":true},"constructor":"c"}') });
      assert.deepEqual(m.rows.map((r) => r.path), [['__proto__', 'admin'], ['constructor']]);
      assert.equal(normalize({ after: {} }).rows.length, 0);
    } finally {
      delete Object.prototype.polluted;
    }
  });

  test('getters that throw / hostile Proxies → [không đọc được], walk continues; class instances / Map → [không hỗ trợ]', () => {
    const o = { a: 1 };
    Object.defineProperty(o, 'bad', { enumerable: true, get() { throw new Error('boom'); } });
    o.z = 2;
    const p = new Proxy({}, { ownKeys() { throw new Error('x'); } });
    const m = normalize({ after: { o, p, map: new Map([[1, 2]]), k: new (class K {})(), fn: () => 1, d: new Date(0) } });
    const show = Object.fromEntries(m.rows.map((r) => [r.path.join('.'), txt(r.after)]));
    assert.equal(show['o.bad'], DEFAULT_LABELS.unreadable);
    assert.equal(show['o.z'], '2');
    assert.equal(show.p, DEFAULT_LABELS.unreadable);
    assert.equal(show.map, DEFAULT_LABELS.unsupported);
    assert.equal(show.k, DEFAULT_LABELS.unsupported);
    assert.equal(show.fn, DEFAULT_LABELS.unsupported);
    assert.equal(show.d, '1970-01-01T00:00:00.000Z');
  });
});

describe('diff-model — lists, depth, cycles (QĐ 4, 5)', () => {
  test('scalar list = one leaf; changed → set marks + / − (duplicates, unsafe elements always marked)', () => {
    const m = normalize({ items: [{ key: 'roles', before: ['admin', 'editor', 'editor'], after: ['editor', 'viewer'] },
      { key: 'big', before: [2 ** 53, 1], after: [2 ** 53, 1, 2] }] });
    assert.deepEqual(txt(m.rows[0].before), ['-admin', 'editor', 'editor']);
    assert.deepEqual(txt(m.rows[0].after), ['editor', '+viewer']);
    assert.equal(m.rows[0].type, 'list');
    assert.deepEqual(txt(m.rows[1].before), [`-${DEFAULT_LABELS.unsafeNumber}`, '1']);
    assert.deepEqual(txt(m.rows[1].after), [`+${DEFAULT_LABELS.unsafeNumber}`, '1', '+2']);
    assert.equal(m.rows[1].uncertain, false); // lengths differ: a certain change
  });

  test('list > 200 elements: 200 shown + more; enum options map list elements', () => {
    const m = normalize({ items: [{ key: 't', after: Array.from({ length: 201 }, (_, i) => `t${i}`) },
      { key: 'r', type: 'enum', options: { a: 'Quản trị' }, before: ['a'], after: ['a', 'b'] }] });
    assert.equal(m.rows[0].after.items.length, 200);
    assert.equal(m.rows[0].after.more, 1);
    assert.deepEqual(txt(m.rows[1].after), ['Quản trị', '+b']);
  });

  test('arrays of objects flatten by index; depth 6 → json leaf at the 6th level; 7 levels → still 6 segments', () => {
    const m = normalize({ after: { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } } });
    assert.deepEqual(m.rows.map((r) => [r.path.length, r.type, txt(r.after)]), [[6, 'json', '{"g": 1}']]);
    const l = normalize({ before: { lines: [{ qty: 1 }, { qty: 2 }] }, after: { lines: [{ qty: 1 }, { qty: 3 }] } });
    assert.deepEqual(rowsOf(l), [['["lines",0,"qty"]', 'unchanged'], ['["lines",1,"qty"]', 'changed']]);
  });

  test('cycle → [vòng lặp] leaf; a shared (non-cyclic) object is shown twice', () => {
    const a = { x: 1 };
    a.self = a;
    const shared = { v: 1 };
    const m = normalize({ after: { a, s1: shared, s2: shared } });
    assert.equal(txt(byId(m, ['a', 'self']).after), DEFAULT_LABELS.cycle);
    assert.equal(txt(byId(m, ['s2', 'v']).after), '1');
  });
});

describe('diff-model — numbers (QĐ 7a, shared table with PHP)', () => {
  const T = [
    [9007199254740991, { t: 'n', s: '9007199254740991' }], [9007199254740992, { t: 'u' }], [-9007199254740992, { t: 'u' }],
    [1e21, { t: 'u' }], [1.5e300, { t: 'u' }], [0.1 + 0.2, { t: 'n', s: '0.30000000000000004' }], [1.0, { t: 'n', s: '1' }],
    [-0, { t: 'n', s: '0' }], [1e-7, { t: 'n', s: '1e-7' }], [0.000001, { t: 'n', s: '0.000001' }], [Infinity, { t: 'x' }],
    [-Infinity, { t: 'x' }], [NaN, { t: 'x' }], [123.456, { t: 'n', s: '123.456' }], [-1.5e-10, { t: 'n', s: '-1.5e-10' }],
  ];
  test('canonicalNumber: non-finite first, safe integers, unsafe integers, Number::toString', () => {
    for (const [x, want] of T) assert.deepEqual(canonicalNumber(x), want, String(x));
  });

  test('rounding / formatting on the string (1.005 → 1,01; 123.456 → 123,46; exponent kept)', () => {
    assert.equal(roundDecimal('1.005', 2), '1.01');
    assert.equal(roundDecimal('123.456', 2), '123.46');
    assert.equal(roundDecimal('9.995', 2), '10');
    assert.equal(roundDecimal('-0.004', 2), '0');
    assert.equal(roundDecimal('-1.005', 2), '-1.01');
    assert.equal(roundDecimal('0.5', 0), '1');
    assert.equal(formatNumber('12990000', null, '₫'), '12.990.000 ₫');
    assert.equal(formatNumber('-1234.5', null, ''), '-1.234,5');
    assert.equal(formatNumber('1e-7', 2, ''), '1e-7');
    assert.equal(formatNumber('0.30000000000000004', null, ''), '0,30000000000000004');
  });

  test('unsafe / non-finite: [số quá lớn] / [không hỗ trợ], changed + uncertain on both sides, added from empty, one note', () => {
    const m = normalize({ items: [
      { key: 'a', before: 2 ** 53, after: 2 ** 53 + 1 }, { key: 'b', before: Infinity, after: Infinity },
      { key: 'c', before: null, after: 2 ** 53 }, { key: 'd', before: 1, after: 1.0 },
    ] });
    assert.deepEqual(m.rows.map((r) => [r.kind, r.uncertain]), [['changed', true], ['changed', true], ['added', false], ['unchanged', false]]);
    assert.deepEqual([txt(m.rows[0].before), txt(m.rows[1].after)], [DEFAULT_LABELS.unsafeNumber, DEFAULT_LABELS.unsupported]);
    assert.equal(m.rows[0].before.k, 'note');
    assert.deepEqual(m.notes, ['unsafe']);
  });

  test('a digit STRING stays exact text; number / money types format decimal strings too', () => {
    const m = normalize({ items: [{ key: 'id', after: '12345678901234567890' }, { key: 'm', type: 'money', after: '12990000' },
      { key: 'n', type: 'number', decimals: 2, after: 123.456 }, { key: 'u', type: 'money', unit: 'USD', after: 5 },
      { key: 't', type: 'text', after: 12990000 }, { key: 'x', type: 'money', after: '007' }] });
    assert.deepEqual(m.rows.map((r) => txt(r.after)), ['12345678901234567890', '12.990.000 ₫', '123,46', '5 USD', '12990000', '007']);
  });
});

describe('diff-model — formatting by type (QĐ 7)', () => {
  test('boolean / date / enum (own keys only) / decimals clamped', () => {
    const opts = JSON.parse('{"pending":"Chờ xử lý","__proto__":"Proto"}');
    const m = normalize({ items: [
      { key: 'b', after: true }, { key: 'b2', after: false }, { key: 'd', type: 'date', after: '2026-02-28' },
      { key: 'd2', type: 'date', after: '2026-02-30' }, { key: 'e', type: 'enum', options: opts, after: 'pending' },
      { key: 'e2', type: 'enum', options: opts, after: 'toString' }, { key: 'e3', type: 'enum', options: opts, after: '__proto__' },
      { key: 'x', type: 'number', decimals: 99, after: 1.123456789 }, { key: 'y', type: 'number', decimals: 'a', after: 1.5 },
    ] });
    assert.deepEqual(m.rows.map((r) => txt(r.after)), ['Có', 'Không', '28/02/2026', '2026-02-30', 'Chờ xử lý', 'toString', 'Proto', '1,123457', '1,5']);
    assert.equal(formatDate('2024-02-29'), '29/02/2024');
    assert.equal(formatDate('2100-02-29'), null);
  });
});

describe('diff-model — strings (QĐ 8)', () => {
  test('C0 (except \\t \\n) / C1 removed; bidi + zero-width kept (renderer shows ⟨U+…⟩); code-point cut', () => {
    const r = cleanText('a\u0000b\u0007c\td\ne\u0085f\u202Eg\u200Bh', 100);
    assert.equal(r.s, 'abc\td\nef\u202Eg\u200Bh');
    assert.deepEqual(splitInvisible('x\u202Ey\uFEFF'), [{ t: 'x' }, { c: '⟨U+202E⟩' }, { t: 'y' }, { c: '⟨U+FEFF⟩' }]);
    const e = cleanText('😀'.repeat(250), 200);
    assert.equal(Array.from(e.s).length, 200);
    assert.equal(e.cut, true);
  });

  test('a 10 MB string is cut BEFORE the regexes (fast), labels cut at 200 + …', () => {
    const big = 'x'.repeat(10 * 1024 * 1024);
    const t0 = performance.now();
    const m = normalize({ items: [{ key: big, after: big }] });
    const ms = performance.now() - t0;
    assert.equal(Array.from(m.rows[0].label).length, 201);
    assert.equal(m.rows[0].after.s.length, LIMITS.full);
    assert.equal(m.rows[0].after.cut, true);
    if (ms > 100) console.warn(`perf: 10 MB string took ${ms.toFixed(0)} ms (budget 100 ms local)`);
  });
});

describe('diff-model — masking (QĐ 9 + dsuite clarification 2026-10-06)', () => {
  test('masked item: strings shown verbatim (server-masked), anything else → label, never read deeper / stringified', () => {
    let reads = 0;
    const secret = { get deep() { reads++; return 's3cr3t'; }, toString() { reads++; return 's3cr3t'; } };
    const item = { key: 'pw', masked: true, after: '***678', get before() { reads++; return secret; } };
    const m = normalize({ items: [item, { key: 'k', masked: true }, { key: 's', masked: true, before: '[ĐÃ ĐỔI]', after: '[ĐÃ ĐỔI]' }] }, { json: true });
    assert.equal(reads, 1, 'only the property itself was read');
    assert.deepEqual(m.rows.map((r) => [txt(r.before), txt(r.after), r.kind, r.masked]), [
      ['MASKED', '***678', 'changed', true], ['MASKED', 'MASKED', 'changed', true], ['[ĐÃ ĐỔI]', '[ĐÃ ĐỔI]', 'unchanged', true]]);
    assert.ok(!JSON.stringify(parityModel(m)).includes('s3cr3t'));
    assert.match(m.json.before, /"pw": "\[ĐÃ ẨN\]"/);
    assert.match(m.json.after, /"pw": "\*\*\*678"/);
  });

  test('masked FieldDef prefix hides a branch (by segment): the branch is never read; JSON view prints [ĐÃ ẨN] there', () => {
    let reads = 0;
    const a = { get b() { reads++; return 'secret'; } };
    const data = { 'a.b': 'root-dotted', a, card: { number: '4111', exp: '12/30' } };
    const m = normalize({ before: {}, after: data, fields: [{ path: ['a', 'b'], masked: true }, { path: 'card', masked: true }] }, { json: true });
    assert.equal(reads, 0);
    assert.deepEqual(m.rows.map((r) => [r.id, r.masked, txt(r.after)]), [
      ['["a","b"]', true, 'MASKED'], ['["card"]', true, 'MASKED'], ['["a.b"]', false, 'root-dotted']]);
    assert.ok(!JSON.stringify(parityModel(m)).includes('4111'));
    assert.match(m.json.after, /"a": \{\n {4}"b": "\[ĐÃ ẨN\]"\n {2}\}/);
    const root = normalize({ after: data, fields: [{ path: 'a.b', masked: true }] }, { json: true });
    assert.equal(byId(root, ['a.b']).masked, true);
    assert.equal(byId(root, ['a', 'b']).masked, false);
  });

  test('a masked path under a would-be leaf masks the whole leaf (a scalar list never shows the masked index)', () => {
    const m = normalize({ after: { tags: ['public', 'secret-tag'] }, fields: [{ path: ['tags', 1], masked: true }] }, { json: true });
    assert.ok(!JSON.stringify(parityModel(m)).includes('secret-tag'));
  });
});

describe('diff-model — budgets (QĐ 10)', () => {
  test('rows: 500 kept, changed first; hidden counted; counts add up', () => {
    const before = {};
    const after = {};
    for (let i = 0; i < 600; i++) { before[`u${i}`] = 1; after[`u${i}`] = 1; }
    for (let i = 0; i < 10; i++) after[`c${i}`] = 2;
    const m = normalize({ before, after });
    assert.equal(m.rows.length, 500);
    assert.equal(m.rows.filter((r) => r.kind !== 'unchanged').length, 10);
    assert.equal(m.counts.hidden, 110);
    assert.equal(m.counts.truncated, true);
    assert.equal(m.counts.added + m.counts.unchanged, 610);
  });

  test('keys per object: 1000 ok, 1001 → summary leaf + tooLarge note; sparse length 1e9 is instant', () => {
    const o1000 = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`k${i}`, i]));
    const m1000 = normalize({ after: { o: o1000 } });
    assert.equal(m1000.rows.length + m1000.counts.hidden, 1000);
    assert.deepEqual(m1000.notes, []);
    const o1001 = { ...o1000, k1000: 1 };
    const m = normalize({ after: { o: o1001 } });
    assert.deepEqual(m.rows.map((r) => txt(r.after)), [fill(DEFAULT_LABELS.objectSummary, { n: 1001 })]);
    assert.deepEqual(m.notes, ['tooLarge']);
    const sparse = [];
    sparse.length = 1e9;
    const t0 = performance.now();
    const s = normalize({ after: { s: sparse } }, { json: true });
    assert.ok(performance.now() - t0 < 500);
    assert.equal(txt(s.rows[0].after), fill(DEFAULT_LABELS.arraySummary, { n: 1e9 }));
    assert.ok(s.json.afterCut);
  });

  test('nodes per side: 10 000 → stop + note; object with 10 000 keys in nested chunks', () => {
    const after = {};
    for (let i = 0; i < 20; i++) after[`g${i}`] = Object.fromEntries(Array.from({ length: 600 }, (_, j) => [`k${j}`, j]));
    const t0 = performance.now();
    const m = normalize({ after });
    if (performance.now() - t0 > 100) console.warn(`perf: 12 000 nodes took ${(performance.now() - t0).toFixed(0)} ms`);
    assert.ok(m.notes.includes('tooLarge'));
    assert.equal(m.counts.truncated, true);
    assert.ok(m.counts.added < 10000);
  });

  test('total text budget: values after 300 000 code points keep only the 300-code-point preview', () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ key: `k${i}`, after: 'y'.repeat(10000) }));
    const m = normalize({ items });
    assert.deepEqual(m.notes, ['textBudget']);
    assert.equal(m.rows[29].after.s.length, 10000);
    assert.equal(m.rows[30].after.s.length, LIMITS.preview);
    assert.equal(m.rows[30].after.cut, true);
  });

  test('JSON view: ≤ 100 000 code units, cut at a line boundary, 2-space indent, kit key order', () => {
    const m = normalize({ after: { b: 1, 2: [1, { x: 'y' }], a: { } } }, { json: true });
    assert.equal(m.json.after, '{\n  "2": [\n    1,\n    {\n      "x": "y"\n    }\n  ],\n  "b": 1,\n  "a": {}\n}');
    assert.equal(m.json.before, 'null');
    const big = normalize({ after: { s: Array.from({ length: 900 }, () => 'z'.repeat(200)) } }, { json: true });
    assert.ok(big.json.after.length <= LIMITS.json);
    assert.ok(big.json.afterCut);
    assert.ok(big.json.after.endsWith('",') || big.json.after.endsWith('"'));
  });
});

describe('diff-model — deepEqual / jsonString', () => {
  test('deepEqual: 1 / 0 / 2 (unsafe, budget)', () => {
    assert.equal(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), 1);
    assert.equal(deepEqual({ a: 1 }, { a: 1, b: 2 }), 0);
    assert.equal(deepEqual({ a: 2 ** 53 }, { a: 2 ** 53 }), 2);
    assert.equal(deepEqual({ a: 2 ** 53, b: 1 }, { a: 2 ** 53, b: 2 }), 0);
    const long = Array.from({ length: 20000 }, (_, i) => i);
    assert.equal(deepEqual(long, long.slice()), 2);
  });

  test('jsonString escapes C0 / DEL / C1 / lone surrogates, keeps the rest', () => {
    assert.equal(jsonString('a"\\\n\u0001\u007f\u0085é😀\ud800'), '"a\\"\\\\\\n\\u0001\\u007f\\u0085é😀\\ud800"');
  });
});

describe('diff-model — fuzz (seeded)', () => {
  test('2 000 random inputs: never throws, counts add up, every string within its cap', () => {
    let seed = 46;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const scalars = () => pick([null, undefined, '', ' ', 'x', 'é😀', '\u202E', 0, -0, 1.5, 2 ** 53, Infinity, NaN, true, false, '1', 'a'.repeat(400)]);
    const gen = (d) => {
      const r = rnd();
      if (d > 7 || r < 0.4) return scalars();
      if (r < 0.7) return Array.from({ length: Math.floor(rnd() * 5) }, () => gen(d + 1));
      const o = {};
      for (let i = 0; i < Math.floor(rnd() * 5); i++) o[pick(['a', 'b', '1', '10', 'a.b', '__proto__', ''])] = gen(d + 1);
      return o;
    };
    for (let i = 0; i < 2000; i++) {
      const input = rnd() < 0.3
        ? { items: Array.from({ length: Math.floor(rnd() * 6) }, () => ({ key: pick(['a', 'b', 1, '']), before: gen(3), after: gen(3), masked: rnd() < 0.1, kind: pick([undefined, 'changed', 'x']) })) }
        : { before: gen(0), after: gen(0), fields: rnd() < 0.3 ? [{ path: ['a', 'b'], masked: true }, { path: 'a', label: 'A' }] : undefined };
      const m = normalize(input, { json: rnd() < 0.5 });
      const c = m.counts;
      assert.equal(c.added + c.removed + c.changed + c.unchanged, m.rows.length + c.hidden);
      for (const r of m.rows) {
        assert.ok(Array.from(r.label).length <= LIMITS.label + 1);
        for (const cell of [r.before, r.after]) {
          if (cell && (cell.k === 'text' || cell.k === 'json')) assert.ok(Array.from(cell.s).length <= LIMITS.full);
        }
      }
    }
  });
});
