// Regenerate test/php/fixtures/ssr.html (HTML rendered by php/td.php for src/form/td-v017-ssr.browser-test.js).
//   node test/php/build-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP, renderFixture, FIXTURE_FILE } from './php.mjs';

if (!HAS_PHP) {
  console.error('build-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(FIXTURE_FILE), { recursive: true });
writeFileSync(FIXTURE_FILE, renderFixture());
console.log(`wrote ${FIXTURE_FILE}`);
