// Regenerate test/ssr/fixtures/number.html (PHP markup of every case in test/ssr/number.fixtures.json, loaded by
// src/form/td-number-input.ssr.engines.browser-test.js). test/php/td-ssr-number.test.js fails when it is stale.
//   node test/ssr/build-number-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderNumberFixture, NUMBER_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-number-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(NUMBER_FIXTURE_FILE), { recursive: true });
writeFileSync(NUMBER_FIXTURE_FILE, renderNumberFixture());
console.log(`wrote ${NUMBER_FIXTURE_FILE}`);
