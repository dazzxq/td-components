/**
 * v0.94.0 (plan v0.94.0-icons-picker §8.4): pure search model of td-icon-picker — an index over icon names, aliases and
 * the optional search metadata (VI label + EN / VI keywords), and a ranked search. No DOM.
 *
 *   const index = buildIconIndex({ names: listIcons(), aliases, data });   // data may be null (not loaded yet)
 *   searchIcons(index, 'thung rac');                                       // → ['trash', …]
 *   if (!isIconIndexCurrent(index, { names: listIcons(), aliases, data })) index = buildIconIndex(…); // each open
 *
 * Normalisation (query and indexed text): foldSearchText() — diacritics dropped, lower case, đ → d, `-` / `_` → space,
 * white space collapsed. Ranks (smaller first; an icon takes its best rank):
 *   0  query == name or alias
 *   1  query == label or a keyword
 *   2  name / alias starts with the query
 *   3  a WORD of the label / a keyword starts with the query
 *   4  (query >= 2 characters) every query word is a substring of name ∪ aliases ∪ label ∪ keywords
 * Ties → canonical name order (compareIconNames). No match → left out. The query is cut to ICON_SEARCH_LIMITS.queryMax
 * characters and queryWordsMax words (bounded work). An alias is indexed only when its target is one of `names` and no
 * registered name shadows it (the resolve rule of the registry: a registered name wins over an alias).
 */
import { foldSearchText, ICON_SEARCH_LIMITS } from '../icons/icon-search-schema.js';

/**
 * Canonical order of icon names (grid order, rank ties): `localeCompare` with 'en', code-unit order as a tie-break.
 * @param {string} a @param {string} b @returns {number}
 */
export function compareIconNames(a, b) {
  return a.localeCompare(b, 'en') || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * The normalised query actually searched: cut to queryMax characters, folded, at most queryWordsMax words.
 * @param {unknown} query
 * @returns {string} '' = empty query
 */
export function normalizeIconQuery(query) {
  const folded = foldSearchText(String(query ?? '').slice(0, ICON_SEARCH_LIMITS.queryMax));
  return folded ? folded.split(' ').slice(0, ICON_SEARCH_LIMITS.queryWordsMax).join(' ') : '';
}

const entriesOf = (aliases) => {
  if (!aliases) return [];
  if (aliases instanceof Map) return [...aliases.entries()];
  return typeof aliases === 'object' ? Object.entries(aliases) : [];
};

const textList = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string') : []);

/**
 * Build the search index.
 * @param {{ names?: Iterable<string>, aliases?: Record<string,string>|Map<string,string>|null,
 *           data?: Record<string, {label?: string, keywords?: {en?: string[], vi?: string[]}}>|null }} [input]
 *   names: registered canonical names (core + site, e.g. listIcons()); aliases: alias → target name (registry.js
 *   `aliases`); data: search metadata by name (already validated — entries of other names are ignored).
 * @returns {Readonly<{ names: ReadonlyArray<string>, aliases: any, data: any, nameSet: ReadonlySet<string>,
 *   entries: ReadonlyArray<object> }>} `names` = the indexed names in canonical order (= the result of an empty search)
 */
export function buildIconIndex({ names = [], aliases = null, data = null } = {}) {
  const nameSet = new Set();
  for (const n of names) if (typeof n === 'string' && n) nameSet.add(n);
  const sorted = [...nameSet].sort(compareIconNames);
  /** @type {Map<string, string[]>} target → folded alias keys */
  const aliasKeys = new Map();
  for (const [alias, target] of entriesOf(aliases)) {
    if (typeof alias !== 'string' || typeof target !== 'string' || !nameSet.has(target) || nameSet.has(alias)) continue;
    const key = foldSearchText(alias);
    if (!key) continue;
    if (!aliasKeys.has(target)) aliasKeys.set(target, []);
    aliasKeys.get(target).push(key);
  }
  const meta = data && typeof data === 'object' ? data : null;
  const entries = sorted.map((name, order) => {
    const entry = meta && Object.hasOwn(meta, name) && meta[name] && typeof meta[name] === 'object' ? meta[name] : null;
    const label = entry && typeof entry.label === 'string' ? foldSearchText(entry.label) : '';
    const kw = entry && entry.keywords && typeof entry.keywords === 'object'
      ? [...textList(entry.keywords.en), ...textList(entry.keywords.vi)].map(foldSearchText).filter(Boolean)
      : [];
    const nameKey = foldSearchText(name);
    const al = aliasKeys.get(name) || [];
    const texts = label ? [label, ...kw] : kw;
    return Object.freeze({
      name,
      order,
      nameKey,
      aliasKeys: Object.freeze(al),
      texts: Object.freeze(texts),
      // '\n' never occurs in a folded key (white space collapsed) → a substring cannot span two fields
      haystack: [nameKey, ...al, ...texts].join('\n'),
    });
  });
  return Object.freeze({ names: Object.freeze(sorted), aliases, data, nameSet, entries: Object.freeze(entries) });
}

/**
 * True when `index` was built from the same input: the same set of names, the same `aliases` object and the same
 * `data` object (identity — the caller keeps one merged data object and replaces it when metadata changes).
 * @param {ReturnType<typeof buildIconIndex>|null|undefined} index
 * @param {{ names?: Iterable<string>, aliases?: any, data?: any }} input
 * @returns {boolean}
 */
export function isIconIndexCurrent(index, { names = [], aliases = null, data = null } = {}) {
  if (!index || index.aliases !== aliases || index.data !== data) return false;
  const set = new Set();
  for (const n of names) if (typeof n === 'string' && n) set.add(n);
  if (set.size !== index.nameSet.size) return false;
  for (const n of set) if (!index.nameSet.has(n)) return false;
  return true;
}

const wordStarts = (text, q) => {
  if (text.startsWith(q)) return true;
  for (let i = text.indexOf(' '); i !== -1; i = text.indexOf(' ', i + 1)) {
    if (text.startsWith(q, i + 1)) return true;
  }
  return false;
};

function rankOf(e, q, words) {
  if (e.nameKey === q || e.aliasKeys.includes(q)) return 0;
  if (e.texts.includes(q)) return 1;
  if (e.nameKey.startsWith(q) || e.aliasKeys.some((a) => a.startsWith(q))) return 2;
  if (e.texts.some((t) => wordStarts(t, q))) return 3;
  if (q.length >= 2 && words.every((w) => e.haystack.includes(w))) return 4;
  return -1;
}

/**
 * Search the index.
 * @param {ReturnType<typeof buildIconIndex>} index
 * @param {unknown} query raw text of the search box
 * @returns {string[]} matching canonical names, best rank first, ties in canonical order; an empty query → every
 *   indexed name in canonical order
 */
export function searchIcons(index, query) {
  if (!index) return [];
  const q = normalizeIconQuery(query);
  if (!q) return [...index.names];
  const words = q.split(' ');
  const hits = [];
  for (const e of index.entries) {
    const rank = rankOf(e, q, words);
    if (rank >= 0) hits.push([rank, e.order, e.name]);
  }
  hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return hits.map((h) => h[2]);
}
