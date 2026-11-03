// Regenerate test/ssr/fixtures/icon-picker.html (PHP markup of every case in test/ssr/icon-picker.fixtures.json, loaded
// by src/form/td-icon-picker.ssr.engines.browser-test.js). test/php/td-ssr-icon-picker.test.js fails when it is stale.
//   node test/ssr/build-icon-picker-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderIconPickerFixture, ICON_PICKER_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-icon-picker-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(ICON_PICKER_FIXTURE_FILE), { recursive: true });
writeFileSync(ICON_PICKER_FIXTURE_FILE, renderIconPickerFixture());
console.log(`wrote ${ICON_PICKER_FIXTURE_FILE}`);
