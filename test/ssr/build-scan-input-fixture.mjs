// Regenerate test/ssr/fixtures/scan-input.html (PHP markup of every case in test/ssr/scan-input.fixtures.json, loaded by
// src/form/td-scan-input.ssr.engines.browser-test.js). test/php/td-ssr-scan-input.test.js fails when it is stale.
//   node test/ssr/build-scan-input-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderScanInputFixture, SCAN_INPUT_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-scan-input-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(SCAN_INPUT_FIXTURE_FILE), { recursive: true });
writeFileSync(SCAN_INPUT_FIXTURE_FILE, renderScanInputFixture());
console.log(`wrote ${SCAN_INPUT_FIXTURE_FILE}`);
