// Regenerate test/ssr/fixtures/toggle.html (PHP markup of every case in test/ssr/toggle.fixtures.json, loaded by
// src/form/td-toggle.ssr.engines.browser-test.js). test/php/td-v052-php.test.js fails when it is stale.
//   node test/ssr/build-toggle-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderToggleFixture, TOGGLE_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-toggle-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(TOGGLE_FIXTURE_FILE), { recursive: true });
writeFileSync(TOGGLE_FIXTURE_FILE, renderToggleFixture());
console.log(`wrote ${TOGGLE_FIXTURE_FILE}`);
