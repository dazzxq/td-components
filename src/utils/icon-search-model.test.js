// v0.94.0 (plan v0.94.0-icons-picker §8.4, §9.1): the pure search model of td-icon-picker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIconIndex, searchIcons, isIconIndexCurrent, normalizeIconQuery, compareIconNames } from './icon-search-model.js';
import { listIcons } from '../icons/td-icon.js';
import { aliases as CORE_ALIASES } from '../icons/registry.js';
import CORE_DATA from '../icons/icons-search.js';

const coreIndex = () => buildIconIndex({ names: listIcons(), aliases: CORE_ALIASES, data: CORE_DATA });

test('real data: "thung rac" / "THÙNG RÁC" / "trash" / "Thùng-rác" → trash first', () => {
  const index = coreIndex();
  for (const q of ['thung rac', 'THÙNG RÁC', 'trash', 'Thùng-rác', '  thùng   rác ']) assert.equal(searchIcons(index, q)[0], 'trash', q);
});

test('alias "x" → close at rank 0; the alias itself is never a result', () => {
  const index = coreIndex();
  const r = searchIcons(index, 'x');
  assert.equal(r[0], 'close');
  assert.ok(!r.includes('x'));
  assert.equal(searchIcons(index, 'chevron-left')[0], 'prev');
});

test('"arrow left" == "arrow-left" == "Arrow_Left"; đ → d ("đăng" ~ "dang")', () => {
  const index = coreIndex();
  assert.deepEqual(searchIcons(index, 'arrow left'), searchIcons(index, 'arrow-left'));
  assert.deepEqual(searchIcons(index, 'Arrow_Left'), searchIcons(index, 'arrow-left'));
  assert.equal(searchIcons(index, 'arrow-left')[0], 'arrow-left');
  assert.deepEqual(searchIcons(index, 'đăng'), searchIcons(index, 'dang'));
  assert.ok(searchIcons(index, 'dang nhap').includes('log-in'));
  assert.equal(searchIcons(index, 'Đăng nhập')[0], 'log-in');
});

// A controlled index: one icon per rank for the query "lamp".
const DATA = {
  e: { label: 'Đèn bàn', keywords: { en: ['desk light'], vi: ['đèn'] } },
  d: { label: 'Đèn', keywords: { en: ['big lampshade'], vi: ['chao'] } },
  c: { label: 'C', keywords: { en: ['lamp'], vi: ['c'] } },
  'lamp-post': { label: 'Cột', keywords: { en: ['post'], vi: ['cột'] } },
  zz: { label: 'Z', keywords: { en: ['oil'], vi: ['z'] } },
  q: { label: 'Q', keywords: { en: ['clamp'], vi: ['kẹp'] } },
};
const NAMES = ['zz', 'q', 'lamp-post', 'e', 'd', 'c', 'lamp', 'other'];
const ALIASES = { light: 'e', zz: 'c', lantern: 'missing', oil: 'zz' };

test('rank order 0 > 1 > 2 > 3 > 4, ties in canonical order, no match left out', () => {
  const index = buildIconIndex({ names: NAMES, aliases: { ...ALIASES, lamplight: 'other' }, data: DATA });
  // 0: name `lamp`; 1: keyword of `c`; 2: name prefix `lamp-post` and alias prefix `other` (lamplight) → name order;
  // 3: word start of `d`'s keyword "big lampshade"; 4: substring of `q`'s "clamp"
  assert.deepEqual(searchIcons(index, 'lamp'), ['lamp', 'c', 'lamp-post', 'other', 'd', 'q']);
  assert.deepEqual(searchIcons(index, 'nothing here'), []);
  // label exact (rank 1) beats a word start (rank 3): "đèn" = label of d, keyword of e → tie at rank 1 → name order
  assert.deepEqual(searchIcons(index, 'den'), ['d', 'e']);
  assert.deepEqual(searchIcons(index, 'den ban'), ['e']);
});

test('a 1-character query never matches as a substring (ranks 0–3 only)', () => {
  const index = buildIconIndex({ names: ['ab', 'ba', 'cab'], data: { cab: { label: 'Xe', keywords: { en: ['taxi'], vi: ['xe'] } } } });
  assert.deepEqual(searchIcons(index, 'b'), ['ba']);
  assert.deepEqual(searchIcons(index, 'ab'), ['ab', 'cab']);
});

test('several words: AND over name ∪ aliases ∪ label ∪ keywords (any field per word)', () => {
  const index = buildIconIndex({ names: NAMES, aliases: ALIASES, data: DATA });
  assert.deepEqual(searchIcons(index, 'post cot'), ['lamp-post']); // name + label
  assert.deepEqual(searchIcons(index, 'desk ight'), ['e']);
  assert.deepEqual(searchIcons(index, 'desk nope'), []);
});

test('aliases: indexed only when the target is a name and no registered name shadows them', () => {
  const index = buildIconIndex({ names: NAMES, aliases: ALIASES, data: DATA });
  assert.equal(searchIcons(index, 'light')[0], 'e'); // alias rank 0
  // `zz` is a registered name → the alias zz → c is shadowed: "zz" finds the icon zz only
  assert.deepEqual(searchIcons(index, 'zz'), ['zz']);
  // alias to a missing target is ignored
  assert.deepEqual(searchIcons(index, 'lantern'), []);
  // Map works like an object
  assert.deepEqual(searchIcons(buildIconIndex({ names: NAMES, aliases: new Map(Object.entries(ALIASES)) }), 'light'), ['e']);
});

test('no metadata: search by name and alias only; empty query → every name in canonical order', () => {
  const index = buildIconIndex({ names: NAMES, aliases: ALIASES, data: null });
  assert.deepEqual(searchIcons(index, 'lamp'), ['lamp', 'lamp-post']);
  assert.deepEqual(searchIcons(index, 'den'), []);
  const sorted = [...new Set(NAMES)].sort(compareIconNames);
  assert.deepEqual(searchIcons(index, ''), sorted);
  assert.deepEqual(searchIcons(index, '  - _ '), sorted);
  assert.deepEqual([...index.names], sorted);
  assert.deepEqual(searchIcons(null, 'x'), []);
  // metadata of names not in `names` is ignored
  assert.deepEqual(searchIcons(buildIconIndex({ names: ['a'], data: { b: { label: 'Bee', keywords: { en: ['bee'], vi: ['ong'] } } } }), 'bee'), []);
});

test('query bounds: cut to 64 characters, at most 8 words', () => {
  assert.equal(normalizeIconQuery('a'.repeat(200)).length, 64);
  assert.equal(normalizeIconQuery('a b c d e f g h i j'), 'a b c d e f g h');
  assert.equal(normalizeIconQuery(' Thùng-Rác '), 'thung rac');
  assert.equal(normalizeIconQuery(undefined), '');
  const index = buildIconIndex({ names: ['a'.repeat(64)] });
  assert.deepEqual(searchIcons(index, 'a'.repeat(200)), ['a'.repeat(64)]);
});

test('canonical order: localeCompare en, stable for hyphenated names', () => {
  assert.deepEqual(['b', 'arrow-up', 'arrow-down', 'a'].sort(compareIconNames), ['a', 'arrow-down', 'arrow-up', 'b']);
  assert.equal(compareIconNames('x', 'x'), 0);
});

test('isIconIndexCurrent: same name set + same aliases / data objects; anything else → rebuild', () => {
  const data = { ...DATA };
  const index = buildIconIndex({ names: NAMES, aliases: ALIASES, data });
  assert.equal(isIconIndexCurrent(index, { names: [...NAMES].reverse(), aliases: ALIASES, data }), true);
  assert.equal(isIconIndexCurrent(index, { names: [...NAMES, 'site-new'], aliases: ALIASES, data }), false);
  assert.equal(isIconIndexCurrent(index, { names: NAMES.slice(1), aliases: ALIASES, data }), false);
  assert.equal(isIconIndexCurrent(index, { names: NAMES, aliases: ALIASES, data: { ...data } }), false);
  assert.equal(isIconIndexCurrent(index, { names: NAMES, aliases: { ...ALIASES }, data }), false);
  assert.equal(isIconIndexCurrent(null, { names: NAMES, aliases: ALIASES, data }), false);
  // a site icon registered later shadows a core alias → after rebuild the alias is no longer indexed
  const before = buildIconIndex({ names: ['close'], aliases: { x: 'close' } });
  assert.deepEqual(searchIcons(before, 'x'), ['close']);
  const after = buildIconIndex({ names: ['close', 'x'], aliases: { x: 'close' } });
  assert.deepEqual(searchIcons(after, 'x'), ['x']);
});

test('real data: every core icon is found by its own name first, and by its VI label', () => {
  const index = coreIndex();
  for (const name of listIcons()) {
    assert.equal(searchIcons(index, name)[0], name, name);
    assert.ok(searchIcons(index, CORE_DATA[name].label).includes(name), `${name}: ${CORE_DATA[name].label}`);
  }
});
