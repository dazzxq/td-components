// v0.39.0 (plan v0.39.0-filters-range QĐ 11–16) — pure model of <td-filter-chips>: normalisation + the chip link policy.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeItems, cleanText, cleanHref, fill, LIMITS } from './filter-chips-model.js';

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
  test('safe: relative, query, root-relative, protocol-relative https, https', () => {
    for (const h of ['?q=1', '/a?b=c', 'x/y', '#f', '//cdn.example/x', 'https://a.vn/x']) assert.equal(cleanHref(h, HTTPS), h, h);
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
  test('http: only on an http page (no downgrade)', () => {
    assert.equal(cleanHref('http://a.vn/x', HTTPS), '');
    assert.equal(cleanHref('http://a.vn/x', HTTP), 'http://a.vn/x');
  });
});

test('fill(): {label} / {value} replaced literally ($& stays text)', () => {
  assert.equal(fill('Bỏ lọc {label}: {value}', { label: '$&', value: 'a{b}' }), 'Bỏ lọc $&: a{b}');
});
