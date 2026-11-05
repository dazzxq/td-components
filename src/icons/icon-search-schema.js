/**
 * v0.94.0 (plan v0.94.0-icons-picker §5.2–5.3): the ONE validator of icon search metadata — used by
 * scripts/build-icons.mjs (src/icons/icons-search.json → icons-search.js) and at runtime by registerIconSearchData() /
 * the td-icon-picker `loadSearchData` hook. Pure, no imports (the build script and the browser load the same file).
 *
 *   validateSearchEntry('trash', { label: 'Thùng rác', keywords: { en: ['trash', 'delete'], vi: ['xoá'] } })
 *     → Object.freeze({ label, keywords: Object.freeze({ en: Object.freeze([…]), vi: Object.freeze([…]) }) })
 *
 * Rules (entry): exactly the keys `label` + `keywords`; `keywords` exactly `en` + `vi`. Every string (label and each
 * keyword): NFC, trimmed, 1–48 characters, no control character. `en` / `vi`: arrays of 1–12 strings, no two equal
 * after foldSearchText() inside the same array (a duplicate is an ERROR, never silently dropped — keeps the source
 * clean); a keyword whose search key is empty ("-") is an error too. The label may repeat a keyword. Anything else
 * throws a TypeError.
 */

/** Limits — exported so the PHP twin (Td::registerIconSearchData) can be tested against the same numbers. */
export const ICON_SEARCH_LIMITS = Object.freeze({
  /** characters (code points) of a label / keyword */
  textMax: 48,
  /** keywords per language */
  keywordsMax: 12,
  /** entries per registerIconSearchData() call / loaded data object */
  entriesMax: 2000,
  /** characters of a search query kept (the rest is cut) */
  queryMax: 64,
  /** words of a search query kept */
  queryWordsMax: 8,
});

/** Languages of `keywords`, fixed order. */
export const ICON_SEARCH_LANGS = Object.freeze(['en', 'vi']);

const NAME_RE = /^[a-z][a-z0-9-]{0,63}$/;
const CONTROL = /\p{Cc}/u;

/**
 * Search key of a text: diacritics removed (NFD, marks dropped), lower case, `đ` → `d` (= fold() of
 * src/utils/typeahead.js), then `-` / `_` → space, runs of white space collapsed, trimmed.
 * "Thùng-rác" → "thung rac", "Đăng_nhập" → "dang nhap".
 * @param {unknown} s
 * @returns {string}
 */
export function foldSearchText(s) {
  return String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/đ/g, 'd')
    .replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function checkText(where, v) {
  if (typeof v !== 'string') throw new TypeError(`${where} must be a string`);
  // cheap UTF-16 length guard first (textMax code points ≤ 2 × textMax units): no spread / normalize of a huge string
  if (v.length > ICON_SEARCH_LIMITS.textMax * 2) throw new TypeError(`${where} must be 1–${ICON_SEARCH_LIMITS.textMax} characters`);
  const n = [...v].length;
  if (n < 1 || n > ICON_SEARCH_LIMITS.textMax) throw new TypeError(`${where} must be 1–${ICON_SEARCH_LIMITS.textMax} characters`);
  if (v !== v.trim()) throw new TypeError(`${where} must be trimmed`);
  if (CONTROL.test(v)) throw new TypeError(`${where} contains a control character`);
  if (v !== v.normalize('NFC')) throw new TypeError(`${where} must be NFC`);
  return v;
}

function onlyKeys(where, obj, allowed) {
  // early exit on the first unknown key: no full key array (a custom loader may hand over huge nested objects)
  for (const k in obj) {
    if (Object.hasOwn(obj, k) && !allowed.includes(k)) throw new TypeError(`${where}: unknown key "${k}"`);
  }
  for (const k of allowed) {
    if (!Object.hasOwn(obj, k)) throw new TypeError(`${where}: missing "${k}"`);
  }
}

/**
 * Validate one metadata entry; returns a deep-frozen clean copy or throws a TypeError.
 * @param {string} name icon name (registry name rule)
 * @param {unknown} entry `{ label, keywords: { en: string[], vi: string[] } }`
 * @returns {Readonly<{label: string, keywords: Readonly<{en: ReadonlyArray<string>, vi: ReadonlyArray<string>}>}>}
 */
export function validateSearchEntry(name, entry) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) throw new TypeError(`icon search data: invalid icon name "${String(name).slice(0, 80)}"`);
  const where = `icon search data "${name}"`;
  if (!isPlainObject(entry)) throw new TypeError(`${where}: entry must be an object`);
  onlyKeys(where, entry, ['label', 'keywords']);
  const label = checkText(`${where}: label`, entry.label);
  const kw = entry.keywords;
  if (!isPlainObject(kw)) throw new TypeError(`${where}: keywords must be an object`);
  onlyKeys(`${where}: keywords`, kw, ICON_SEARCH_LANGS);
  const keywords = {};
  for (const lang of ICON_SEARCH_LANGS) {
    const list = kw[lang];
    if (!Array.isArray(list)) throw new TypeError(`${where}: keywords.${lang} must be an array`);
    if (list.length < 1 || list.length > ICON_SEARCH_LIMITS.keywordsMax) {
      throw new TypeError(`${where}: keywords.${lang} must have 1–${ICON_SEARCH_LIMITS.keywordsMax} items`);
    }
    const seen = new Set();
    keywords[lang] = Object.freeze(list.map((v, i) => {
      const s = checkText(`${where}: keywords.${lang}[${i}]`, v);
      const key = foldSearchText(s);
      if (!key) throw new TypeError(`${where}: keywords.${lang}[${i}] has no searchable character`);
      if (seen.has(key)) throw new TypeError(`${where}: keywords.${lang}[${i}] "${s}" duplicates another keyword`);
      seen.add(key);
      return s;
    }));
  }
  return Object.freeze({ label, keywords: Object.freeze(keywords) });
}

/** v0.96.1: limits of the `groups` of <td-icon-picker> (the string rules are the ones of the search data). */
export const ICON_GROUP_LIMITS = Object.freeze({
  /** groups per list */
  groupsMax: 50,
  /** icon names read in all the groups together (= MAX_CANDIDATES of the picker) */
  namesMax: 2000,
});

const GROUP_KEY_RE = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * v0.96.1: is `v` a text of the search-data kind (string, 1–48 characters, trimmed, no control character, NFC)? Used for
 * the `value-label` of <td-icon-picker>.
 * @param {unknown} v
 * @returns {boolean}
 */
export function isSearchText(v) {
  try {
    checkText('text', v);
    return true;
  } catch {
    return false;
  }
}

/**
 * v0.96.1: validate the `groups` of <td-icon-picker>: `Array<{ key, label, icons: string[] }>` — at most 50 groups,
 * `key` = `^[a-z][a-z0-9-]{0,31}$` and unique, `label` = a search-data string, `icons` = an array of strings (names are
 * checked against the registry by the picker, not here), at most 2000 names in all. Bounded: a longer array is refused
 * by its `length`, never walked. Returns a deep-frozen copy or throws a TypeError.
 * @param {unknown} groups
 * @returns {ReadonlyArray<Readonly<{key: string, label: string, icons: ReadonlyArray<string>}>>}
 */
export function validateIconGroups(groups) {
  if (!Array.isArray(groups)) throw new TypeError('icon groups: expected an array');
  if (groups.length > ICON_GROUP_LIMITS.groupsMax) throw new TypeError(`icon groups: at most ${ICON_GROUP_LIMITS.groupsMax} groups`);
  const keys = new Set();
  let names = 0;
  const out = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const where = `icon groups[${i}]`;
    if (!isPlainObject(g)) throw new TypeError(`${where}: expected an object`);
    const key = g.key;
    if (typeof key !== 'string' || !GROUP_KEY_RE.test(key)) throw new TypeError(`${where}: key must match ${GROUP_KEY_RE}`);
    if (keys.has(key)) throw new TypeError(`${where}: duplicate key "${key}"`);
    keys.add(key);
    const label = checkText(`${where}: label`, g.label);
    const icons = g.icons;
    if (!Array.isArray(icons)) throw new TypeError(`${where}: icons must be an array`);
    names += icons.length;
    if (names > ICON_GROUP_LIMITS.namesMax) throw new TypeError(`icon groups: at most ${ICON_GROUP_LIMITS.namesMax} icon names in all`);
    const list = [];
    for (let j = 0; j < icons.length; j++) {
      if (typeof icons[j] !== 'string') throw new TypeError(`${where}: icons[${j}] must be a string`);
      list.push(icons[j]);
    }
    out.push(Object.freeze({ key, label, icons: Object.freeze(list) }));
  }
  return Object.freeze(out);
}
