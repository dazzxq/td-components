// Regenerate test/ssr/fixtures/affix.html (PHP markup of every case in test/ssr/affix.fixtures.json, loaded by
// src/form/td-v055-affix.ssr.engines.browser-test.js). test/php/td-v055-php.test.js fails when it is stale.
//   node test/ssr/build-affix-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderAffixFixture, AFFIX_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-affix-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(AFFIX_FIXTURE_FILE), { recursive: true });
writeFileSync(AFFIX_FIXTURE_FILE, renderAffixFixture());
console.log(`wrote ${AFFIX_FIXTURE_FILE}`);
