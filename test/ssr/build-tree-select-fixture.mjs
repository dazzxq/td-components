// Regenerate test/ssr/fixtures/tree-select.html (PHP markup of every case in test/ssr/tree-select.fixtures.json, loaded
// by src/form/td-tree-select.ssr.engines.browser-test.js). test/php/td-ssr-tree-select.test.js fails when it is stale.
//   node test/ssr/build-tree-select-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderTreeSelectFixture, TREE_SELECT_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-tree-select-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(TREE_SELECT_FIXTURE_FILE), { recursive: true });
writeFileSync(TREE_SELECT_FIXTURE_FILE, renderTreeSelectFixture());
console.log(`wrote ${TREE_SELECT_FIXTURE_FILE}`);
