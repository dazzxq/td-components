// Regenerate test/ssr/fixtures/datetime-picker.html (PHP markup of every case in test/ssr/datetime-picker.fixtures.json,
// loaded by src/form/td-datetime-picker.ssr.engines.browser-test.js). test/php/td-v056-php.test.js fails when it is stale.
//   node test/ssr/build-datetime-picker-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderDatetimePickerFixture, DATETIME_PICKER_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-datetime-picker-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(DATETIME_PICKER_FIXTURE_FILE), { recursive: true });
writeFileSync(DATETIME_PICKER_FIXTURE_FILE, renderDatetimePickerFixture());
console.log(`wrote ${DATETIME_PICKER_FIXTURE_FILE}`);
