// Regenerate test/ssr/fixtures/floating.html (PHP markup of every case in test/ssr/floating.fixtures.json, loaded by
// src/form/td-v058-floating.ssr.engines.browser-test.js). test/php/td-v058-php.test.js fails when it is stale.
//   node test/ssr/build-floating-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderFloatingFixture, FLOATING_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-floating-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(FLOATING_FIXTURE_FILE), { recursive: true });
writeFileSync(FLOATING_FIXTURE_FILE, renderFloatingFixture());
console.log(`wrote ${FLOATING_FIXTURE_FILE}`);
