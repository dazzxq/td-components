// Regenerate test/ssr/fixtures/check-matrix.html (PHP markup of every case in test/ssr/check-matrix.fixtures.json, loaded
// by src/form/td-check-matrix.ssr.engines.browser-test.js). test/php/td-ssr-check-matrix.test.js fails when it is stale.
//   node test/ssr/build-check-matrix-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderCheckMatrixFixture, CHECK_MATRIX_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-check-matrix-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(CHECK_MATRIX_FIXTURE_FILE), { recursive: true });
writeFileSync(CHECK_MATRIX_FIXTURE_FILE, renderCheckMatrixFixture());
console.log(`wrote ${CHECK_MATRIX_FIXTURE_FILE}`);
