// Regenerate test/ssr/fixtures/button.html (PHP element-mode markup of every case in test/ssr/button.fixtures.json,
// loaded by src/form/td-button.ssr.browser-test.js). test/php/td-ssr.test.js fails when the file is stale.
//   node test/ssr/build-button-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderButtonFixture, BUTTON_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-button-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(BUTTON_FIXTURE_FILE), { recursive: true });
writeFileSync(BUTTON_FIXTURE_FILE, renderButtonFixture());
console.log(`wrote ${BUTTON_FIXTURE_FILE}`);
