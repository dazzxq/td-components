// v0.94.0 (plan v0.94.0-icons-picker §5.2–5.3, §9.1): the generated search metadata matches its source and covers
// exactly the icons of icons.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import SEARCH from './icons-search.js';
import { validateSearchEntry } from './icon-search-schema.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const icons = JSON.parse(readFileSync(join(DIR, 'icons.json'), 'utf8'));
const source = JSON.parse(readFileSync(join(DIR, 'icons-search.json'), 'utf8'));

test('icons-search.json: schema tag, keys == icons.json icon names (no alias)', () => {
  assert.equal(source.$schema, 'td-icons-search/1');
  assert.deepEqual(Object.keys(source.icons).sort(), Object.keys(icons.icons).sort());
  for (const alias of Object.keys(icons.aliases)) assert.ok(!Object.hasOwn(source.icons, alias), alias);
});

test('icons-search.js (generated): same entries, icons.json order, frozen, every entry valid with >= 1 EN + 1 VI', () => {
  assert.deepEqual(Object.keys(SEARCH), Object.keys(icons.icons));
  assert.equal(Object.keys(SEARCH).length, 188);
  assert.ok(Object.isFrozen(SEARCH));
  for (const [name, entry] of Object.entries(SEARCH)) {
    assert.deepEqual(entry, source.icons[name], name);
    assert.deepEqual(validateSearchEntry(name, entry), entry, name);
    assert.ok(entry.keywords.en.length >= 1 && entry.keywords.vi.length >= 1, name);
  }
});

test('one line per icon in the generated file', () => {
  const text = readFileSync(join(DIR, 'icons-search.js'), 'utf8');
  for (const name of Object.keys(icons.icons)) {
    assert.equal(text.split('\n').filter((l) => l.startsWith(`  ${JSON.stringify(name)}: {`)).length, 1, name);
  }
});

test('td-icon.js / registry.js never import the search metadata (stays lazy)', () => {
  for (const f of ['td-icon.js', 'registry.js', 'td-icon-element.js']) {
    assert.ok(!readFileSync(join(DIR, f), 'utf8').includes('icons-search'), f);
  }
});
