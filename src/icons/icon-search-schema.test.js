// v0.94.0 (plan v0.94.0-icons-picker §5.3, §9.1): the one validator of icon search metadata.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSearchEntry, foldSearchText, ICON_SEARCH_LIMITS, ICON_SEARCH_LANGS, validateIconGroups, isSearchText, ICON_GROUP_LIMITS,
} from './icon-search-schema.js';
import { fold } from '../utils/typeahead.js';

const ok = () => ({ label: 'Thùng rác', keywords: { en: ['trash', 'delete', 'bin'], vi: ['xoá', 'thùng rác'] } });
const bad = (entry, re, name = 'trash') => assert.throws(() => validateSearchEntry(name, entry), (e) => e instanceof TypeError && re.test(e.message));

test('limits are the plan numbers', () => {
  assert.deepEqual({ ...ICON_SEARCH_LIMITS }, { textMax: 48, keywordsMax: 12, entriesMax: 2000, queryMax: 64, queryWordsMax: 8 });
  assert.deepEqual([...ICON_SEARCH_LANGS], ['en', 'vi']);
  assert.ok(Object.isFrozen(ICON_SEARCH_LIMITS));
});

test('a valid entry → a deep-frozen clean copy (label may repeat a keyword)', () => {
  const src = ok();
  const out = validateSearchEntry('trash', src);
  assert.deepEqual(out, src);
  assert.notEqual(out, src);
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.keywords) && Object.isFrozen(out.keywords.en) && Object.isFrozen(out.keywords.vi));
  src.keywords.en.push('x');
  assert.equal(out.keywords.en.length, 3);
  // limits inclusive
  const max = { label: 'a'.repeat(48), keywords: { en: Array.from({ length: 12 }, (_, i) => `k${i}`), vi: ['ổ'.repeat(48)] } };
  assert.deepEqual(validateSearchEntry('site-x', max), max);
});

test('invalid name / entry shape', () => {
  bad(ok(), /invalid icon name/, 'Bad Name');
  bad(ok(), /invalid icon name/, '');
  bad(ok(), /invalid icon name/, 7);
  for (const e of [null, 'x', [], 1]) bad(e, /entry must be an object/);
  bad({ ...ok(), group: 'actions' }, /unknown key "group"/);
  bad({ ...ok(), source: 'kit' }, /unknown key "source"/);
  bad({ keywords: ok().keywords }, /missing "label"/);
  bad({ label: 'A' }, /missing "keywords"/);
  bad({ label: 'A', keywords: [] }, /keywords must be an object/);
  bad({ label: 'A', keywords: { en: ['a'] } }, /missing "vi"/);
  bad({ label: 'A', keywords: { en: ['a'], vi: ['b'], fr: ['c'] } }, /unknown key "fr"/);
  bad({ label: 'A', keywords: { en: 'a', vi: ['b'] } }, /keywords.en must be an array/);
});

test('label rules: string, 1–48, trimmed, no control character, NFC', () => {
  bad({ ...ok(), label: '' }, /1–48/);
  bad({ ...ok(), label: 'a'.repeat(49) }, /1–48/);
  bad({ ...ok(), label: 5 }, /must be a string/);
  bad({ ...ok(), label: ' Xoá' }, /trimmed/);
  bad({ ...ok(), label: 'Xo\u0000á' }, /control character/);
  bad({ ...ok(), label: 'a\nb' }, /control character/);
  bad({ ...ok(), label: 'Xoá' }, /NFC/); // NFD "á"
});

test('keyword rules: 1–12 items, each like a label, no duplicate after fold in one list', () => {
  bad({ ...ok(), keywords: { en: [], vi: ['a'] } }, /1–12 items/);
  bad({ ...ok(), keywords: { en: ['a'], vi: Array.from({ length: 13 }, (_, i) => `k${i}`) } }, /1–12 items/);
  bad({ ...ok(), keywords: { en: ['a', ''], vi: ['b'] } }, /keywords.en\[1\].*1–48/);
  bad({ ...ok(), keywords: { en: ['a', 3], vi: ['b'] } }, /must be a string/);
  bad({ ...ok(), keywords: { en: ['a'], vi: ['xóa', 'xoá'] } }, /duplicates/);
  bad({ ...ok(), keywords: { en: ['Arrow-Left', 'arrow left'], vi: ['b'] } }, /duplicates/);
  bad({ ...ok(), keywords: { en: ['a'], vi: ['Đăng', 'dang'] } }, /duplicates/);
  bad({ ...ok(), keywords: { en: ['-'], vi: ['b'] } }, /no searchable character/);
  // the same word in en and vi is allowed (separate lists)
  assert.ok(validateSearchEntry('video', { label: 'Video', keywords: { en: ['video'], vi: ['video'] } }));
});

test('foldSearchText = fold() of typeahead + separators to space, collapsed, trimmed', () => {
  for (const s of ['Thùng rác', 'ĐĂNG NHẬP', 'Hà Nội', 'abc']) assert.equal(foldSearchText(s), fold(s));
  assert.equal(foldSearchText('  Thùng-rác__Đỏ  '), 'thung rac do');
  assert.equal(foldSearchText(null), '');
});

test('security: nested entry / keywords objects with 200k extra keys are refused at the first unknown key', () => {
  const extra = {};
  for (let i = 0; i < 200000; i++) extra[`x${i}`] = 1;
  bad({ ...ok(), ...extra }, /unknown key/);
  bad({ ...ok(), keywords: { en: ['a'], vi: ['b'], ...extra } }, /unknown key/);
});

test('security: a multi-MB label / keyword is refused by the UTF-16 length guard, fast (no spread / normalize)', () => {
  const huge = 'a'.repeat(4 * 1024 * 1024);
  const t0 = performance.now();
  bad({ ...ok(), label: huge }, /1–48/);
  bad({ ...ok(), keywords: { en: [huge], vi: ['b'] } }, /1–48/);
  bad({ ...ok(), label: '😀'.repeat(49) }, /1–48/); // 98 units: over by code points too
  assert.ok(performance.now() - t0 < 200, 'guard is O(1)');
  // 48 astral code points = 96 UTF-16 units: still valid
  assert.ok(validateSearchEntry('trash', { ...ok(), label: '😀'.repeat(48) }));
});

// --- v0.96.1: validateIconGroups / isSearchText (plan v0.96.0-icon-picker D5, §10) ---

const grp = (over = {}) => ({ key: 'actions', label: 'Thao tác', icons: ['home', 'trash'], ...over });
const badGroups = (groups) => assert.throws(() => validateIconGroups(groups), (e) => e instanceof TypeError);

test('groups: limits are the plan numbers', () => {
  assert.ok(Object.isFrozen(ICON_GROUP_LIMITS));
  assert.ok(Object.values(ICON_GROUP_LIMITS).every((n) => Number.isInteger(n) && n > 0));
});

test('groups: a valid list gives a frozen copy, order kept', () => {
  const src = [grp(), grp({ key: 'a-b-2', label: 'Khác', icons: [] })];
  const out = validateIconGroups(src);
  assert.deepEqual(out, src);
  assert.notEqual(out, src);
  assert.notEqual(out[0].icons, src[0].icons);
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out[0]) && Object.isFrozen(out[0].icons));
  src[0].icons.push('x');
  assert.equal(out[0].icons.length, 2);
  assert.deepEqual(validateIconGroups([]), []);
});

test('groups: bad shapes, keys, duplicates', () => {
  for (const g of [null, undefined, 'x', { 0: grp() }]) badGroups(g);
  badGroups([null]);
  badGroups([[]]);
  for (const key of ['', 'A', '1a', 'a_b', 'a b', 'a'.repeat(64), undefined, 5, null]) badGroups([grp({ key })]);
  badGroups([grp(), grp({ label: 'Khác' })]);
});

test('groups: label follows the search-text rule', () => {
  for (const label of ['', ' x', 'x ', 'a'.repeat(49), 'a\nb', 'é', 5, undefined, null]) badGroups([grp({ label })]);
  assert.equal(validateIconGroups([grp({ label: '<img src=x onerror=alert(1)>' })])[0].label, '<img src=x onerror=alert(1)>');
});

test('groups: icons must be an array of strings; a huge or sparse array is refused by length, fast', () => {
  badGroups([grp({ icons: 'home trash' })]);
  badGroups([grp({ icons: undefined })]);
  badGroups([grp({ icons: ['home', 5] })]);
  const sparse = [];
  sparse.length = 1e9;
  const t0 = performance.now();
  badGroups([grp({ icons: sparse })]);
  badGroups([grp({ icons: new Array(1e6).fill('home') })]);
  assert.ok(performance.now() - t0 < 500, 'bounded');
});

test('isSearchText: the label rule as a boolean', () => {
  assert.equal(isSearchText('Thùng rác'), true);
  assert.equal(isSearchText('a'.repeat(48)), true);
  for (const v of ['', ' x', 'a'.repeat(49), 'a\u0000b', 'é', 5, null, undefined, {}, ['x']]) assert.equal(isSearchText(v), false, String(v));
});
