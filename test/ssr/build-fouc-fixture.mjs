// Regenerate test/ssr/fixtures/fouc.html (PHP markup of every case in test/ssr/fouc.fixtures.json, loaded by
// test/engines/ssr-fouc.spec.mjs). test/php/td-ssr-fouc.test.js fails when it is stale.
//   node test/ssr/build-fouc-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderFoucFixture, FOUC_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-fouc-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(FOUC_FIXTURE_FILE), { recursive: true });
writeFileSync(FOUC_FIXTURE_FILE, renderFoucFixture());
console.log(`wrote ${FOUC_FIXTURE_FILE}`);
