// Regenerate test/ssr/fixtures/color-picker.html (PHP markup of every case in test/ssr/color-picker.fixtures.json, loaded
// by src/form/td-color-picker.ssr.engines.browser-test.js). test/php/td-ssr-color.test.js fails when it is stale.
//   node test/ssr/build-color-picker-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderColorPickerFixture, COLOR_PICKER_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-color-picker-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(COLOR_PICKER_FIXTURE_FILE), { recursive: true });
writeFileSync(COLOR_PICKER_FIXTURE_FILE, renderColorPickerFixture());
console.log(`wrote ${COLOR_PICKER_FIXTURE_FILE}`);
