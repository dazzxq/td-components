// v0.39.0 (plan v0.39.0-filters-range QĐ 11–16) — pure model of <td-filter-chips>: normalisation + the chip link policy.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeItems, cleanText, cleanHref, fill, LIMITS, MAX_ITEMS, MAX_CANDIDATES, HREF_CASES } from './filter-chips-model.js';
// Wall-clock budgets guard against super-linear blow-ups, not micro-speed: on a shared host (CI, several suites at
// once) they get 20× slack, which still catches quadratic behaviour; TD_PERF_STRICT=1 enforces the raw budget.
const PERF_SLACK = process.env.TD_PERF_STRICT ? 1 : 20;

const SPEC = JSON.parse(readFileSync(new URL('../../test/ssr/filter-chips.fixtures.json', import.meta.url), 'utf8'));
const HTTPS = { baseURI: 'https://shop.example/list', protocol: 'https:' };
const HTTP = { baseURI: 'http://shop.example/list', protocol: 'http:' };

describe('filter-chips-model — normalizeItems', () => {
  test('every fixture case: normalizeItems(args[0]) = expect.items (the PHP / hydrate contract)', () => {
    for (const c of SPEC.cases) {
      assert.deepEqual(normalizeItems(c.args[0], HTTPS).items, c.expect.items, c.id);
    }
  });

  test('defaults: id / label = key, removable true; numbers → strings; empty label / id → key; empty value kept', () => {
    const { items } = normalizeItems([{ key: 'k', value: '' }, { key: 5, value: 0, label: '', id: '' }]);
    assert.deepEqual(items, [
      { id: 'k', key: 'k', label: 'k', value: '', removable: true },
      { id: '5', key: '5', label: '5', value: '0', removable: true },
    ]);
  });

  test('dropped: non-object, missing / empty key, array / object / boolean / null value, bad label / id types, NaN', () => {
    const bad = [null, 'x', [1], { value: 'v' }, { key: '', value: 'v' }, { key: 'k', value: ['a', 'b'] }, { key: 'k', value: { a: 1 } },
      { key: 'k', value: true }, { key: 'k', value: null }, { key: 'k', value: 'v', label: {} }, { key: 'k', value: 'v', id: [] },
      { key: Number.NaN, value: 'v' }, { key: 'k', value: Infinity }];
    const r = normalizeItems(bad);
    assert.equal(r.items.length, 0);
    assert.equal(r.dropped, bad.length);
    assert.deepEqual(normalizeItems('nope').items, []);
  });

  test('control characters removed, lengths cut in code points (200 / 200 / 200 / 500)', () => {
    const emoji = '😀'.repeat(600);
    const [it] = normalizeItems([{ key: `a\u0000b\u001fc\u007fd\u0085`, label: emoji, value: emoji, id: emoji }]).items;
    assert.equal(it.key, 'abcd');
    assert.equal(Array.from(it.label).length, LIMITS.label);
    assert.equal(Array.from(it.value).length, LIMITS.value);
    assert.equal(Array.from(it.id).length, LIMITS.id);
    assert.equal(cleanText('x\ny\tz', 10), 'xyz');
  });

  test('duplicate ids get -2, -3 …; renamed counted', () => {
    const r = normalizeItems([{ id: 'a', key: 'k', value: '1' }, { id: 'a', key: 'k', value: '2' }, { id: 'a-2', key: 'k', value: '3' }]);
    assert.deepEqual(r.items.map((i) => i.id), ['a', 'a-2', 'a-2-2']);
    assert.equal(r.renamed, 2);
  });

  test('removable: only exactly false; href ignored on a non-removable item', () => {
    const r = normalizeItems([{ key: 'a', value: '1', removable: 0, href: '/x' }, { key: 'b', value: '1', removable: false, href: '/x' }], HTTPS);
    assert.deepEqual(r.items, [
      { id: 'a', key: 'a', label: 'a', value: '1', removable: true, href: '/x' },
      { id: 'b', key: 'b', label: 'b', value: '1', removable: false },
    ]);
  });
});

describe('filter-chips-model — cleanHref (QĐ 13)', () => {
  test('safe: relative, query, root-relative, hash (same origin)', () => {
    for (const h of ['?q=1', '/a?b=c', 'x/y', '#f']) assert.equal(cleanHref(h, HTTPS), h, h);
  });
  test('cleaned as the URL parser does (tab / CR / LF, edge spaces + C0)', () => {
    assert.equal(cleanHref('  /a\tb\n ', HTTPS), '/ab');
    assert.equal(cleanHref('\u0001/x', HTTPS), '/x');
  });
  test('refused: javascript:, java\\tscript:, data:, mailto:, tel:, blob:, file:, non-strings, > 8 KiB', () => {
    for (const h of ['javascript:alert(1)', 'java\tscript:alert(1)', ' JAVASCRIPT:x', 'data:text/html,x', 'mailto:a@b.vn', 'tel:+84',
      'blob:https://a.vn/1', 'file:///etc/passwd', `/${'a'.repeat(9000)}`, 1, null]) {
      assert.equal(cleanHref(h, HTTPS), '', String(h).slice(0, 30));
    }
  });
  test('http: never on an https page (other origin); same origin on an http page', () => {
    assert.equal(cleanHref('http://shop.example/x', HTTPS), '');
    assert.equal(cleanHref('http://shop.example/x', HTTP), 'http://shop.example/x');
    assert.equal(cleanHref('http://a.vn/x', HTTP), '');
  });
});

test('fill(): {label} / {value} replaced literally ($& stays text)', () => {
  assert.equal(fill('Bỏ lọc {label}: {value}', { label: '$&', value: 'a{b}' }), 'Bỏ lọc $&: a{b}');
});

// ---- Codex review round 1 (v0.39.0) ----

describe('filter-chips-model — bounded work (SEC-1)', () => {
  test('10 000 identical ids: at most MAX_ITEMS chips, unique ids, fast (amortised suffix counter), capped flagged', () => {
    const t0 = performance.now();
    const r = normalizeItems(Array.from({ length: 10000 }, () => ({ id: 'x', key: 'k', value: 'v' })));
    const ms = performance.now() - t0;
    assert.equal(MAX_ITEMS, 200);
    assert.equal(r.items.length, MAX_ITEMS);
    assert.equal(new Set(r.items.map((i) => i.id)).size, MAX_ITEMS);
    assert.deepEqual(r.items.slice(0, 3).map((i) => i.id), ['x', 'x-2', 'x-3']);
    assert.equal(r.capped, true);
    assert.ok(ms < 200 * PERF_SLACK, `${ms.toFixed(1)}ms`);
  });

  test('10 000 malformed items: nothing kept, fast, counted (one warning per call is the caller\'s)', () => {
    const t0 = performance.now();
    const r = normalizeItems(Array.from({ length: 10000 }, (_, i) => ({ key: '', value: i })));
    assert.ok(performance.now() - t0 < 200 * PERF_SLACK);
    assert.equal(r.items.length, 0);
    assert.ok(r.dropped > 0);
  });

  test('a huge raw string is bounded BEFORE the regex / code-point split (fast, cut to the limit)', () => {
    const big = 'a'.repeat(5_000_000);
    const t0 = performance.now();
    const r = normalizeItems([{ key: big, label: big, value: big, id: big }]);
    assert.ok(performance.now() - t0 < 100 * PERF_SLACK, 'bounded');
    assert.equal(r.items[0].value.length, LIMITS.value);
    assert.equal(r.items[0].key.length, LIMITS.key);
  });

  test('explicit suffixed ids still never collide with generated ones', () => {
    const r = normalizeItems([{ id: 'a', key: 'k', value: '1' }, { id: 'a-2', key: 'k', value: '2' }, { id: 'a', key: 'k', value: '3' }, { id: 'a', key: 'k', value: '4' }]);
    assert.deepEqual(r.items.map((i) => i.id), ['a', 'a-2', 'a-3', 'a-4']);
  });
});

describe('filter-chips-model — same-origin links (SEC-2)', () => {
  const PAGE = { baseURI: 'https://shop.example/list/', origin: 'https://shop.example' };
  test('HREF_CASES: JS verdict per case (relative, query, hash → kept; other origins, //host, backslash, schemes → refused)', () => {
    for (const [href, js] of HREF_CASES) assert.equal(cleanHref(href, PAGE), js === null ? '' : js, JSON.stringify(href));
  });
  test('the page origin decides (an absolute URL of the SAME origin is kept in JS)', () => {
    assert.equal(cleanHref('https://shop.example/x', PAGE), 'https://shop.example/x');
    assert.equal(cleanHref('https://cdn.shop.example/x', PAGE), '');
  });
});

describe('filter-chips-model — inspected candidates are capped too (SEC-1 round 2)', () => {
  test('MAX_CANDIDATES = MAX_ITEMS × 4', () => assert.equal(MAX_CANDIDATES, MAX_ITEMS * 4));

  test('a max-length sparse array (length 0xffffffff) returns at once, capped', () => {
    const sparse = [];
    sparse.length = 0xffffffff;
    const t0 = performance.now();
    const r = normalizeItems(sparse);
    assert.ok(performance.now() - t0 < 100 * PERF_SLACK, `${(performance.now() - t0).toFixed(1)}ms`);
    assert.equal(r.items.length, 0);
    assert.equal(r.capped, true);
  });

  test('more than MAX_CANDIDATES malformed entries → capped, nothing kept', () => {
    const r = normalizeItems(Array.from({ length: MAX_CANDIDATES + 5 }, () => ({ key: '' })));
    assert.equal(r.items.length, 0);
    assert.equal(r.capped, true);
    assert.equal(r.dropped, MAX_CANDIDATES);
  });

  test('malformed prefix: valid entries within the candidate cap kept, beyond it dropped', () => {
    const bad = Array.from({ length: MAX_CANDIDATES - 2 }, () => null);
    const good = Array.from({ length: 5 }, (_, i) => ({ key: `k${i}`, value: 'v' }));
    const r = normalizeItems([...bad, ...good]);
    assert.deepEqual(r.items.map((i) => i.key), ['k0', 'k1']);
    assert.equal(r.capped, true);
    const exact = [...bad, ...good.slice(0, 2)];
    assert.equal(exact.length, MAX_CANDIDATES);
    const ok = normalizeItems(exact); // exactly MAX_CANDIDATES entries: not capped
    assert.equal(ok.items.length, 2);
    assert.equal(ok.capped, false);
  });
});
