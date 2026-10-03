// Regenerate test/ssr/fixtures/form.html (PHP element-mode markup of every case in test/ssr/form.fixtures.json, loaded
// by src/form/td-form.ssr.browser-test.js). test/php/td-ssr.test.js fails when the file is stale.
//   node test/ssr/build-form-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderFormFixture, FORM_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-form-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(FORM_FIXTURE_FILE), { recursive: true });
writeFileSync(FORM_FIXTURE_FILE, renderFormFixture());
console.log(`wrote ${FORM_FIXTURE_FILE}`);
