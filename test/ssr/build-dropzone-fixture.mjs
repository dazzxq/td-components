// Regenerate test/ssr/fixtures/dropzone.html (PHP markup of every case in test/ssr/dropzone.fixtures.json, loaded
// by src/form/td-dropzone.ssr.engines.browser-test.js). test/php/td-ssr-dropzone.test.js fails when it is stale.
//   node test/ssr/build-dropzone-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderDropzoneFixture, DROPZONE_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-dropzone-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(DROPZONE_FIXTURE_FILE), { recursive: true });
writeFileSync(DROPZONE_FIXTURE_FILE, renderDropzoneFixture());
console.log(`wrote ${DROPZONE_FIXTURE_FILE}`);
