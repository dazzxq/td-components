// Regenerate test/ssr/fixtures/hint.html (PHP markup of every case in test/ssr/hint.fixtures.json, loaded by
// src/base/td-v054-hint.ssr.engines.browser-test.js). test/php/td-v054-php.test.js fails when it is stale.
//   node test/ssr/build-hint-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderHintFixture, HINT_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-hint-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(HINT_FIXTURE_FILE), { recursive: true });
writeFileSync(HINT_FIXTURE_FILE, renderHintFixture());
console.log(`wrote ${HINT_FIXTURE_FILE}`);
