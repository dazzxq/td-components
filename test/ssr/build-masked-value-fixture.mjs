// Regenerate test/ssr/fixtures/masked-value.html (PHP markup of every case in test/ssr/masked-value.fixtures.json,
// loaded by src/display/td-masked-value.ssr.engines.browser-test.js). test/php/td-ssr-masked-value.test.js fails when
// it is stale.
//   node test/ssr/build-masked-value-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderMaskedValueFixture, MASKED_VALUE_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-masked-value-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(MASKED_VALUE_FIXTURE_FILE), { recursive: true });
writeFileSync(MASKED_VALUE_FIXTURE_FILE, renderMaskedValueFixture());
console.log(`wrote ${MASKED_VALUE_FIXTURE_FILE}`);
