// Regenerate test/ssr/fixtures/datetime-range.html (PHP markup of every case in test/ssr/datetime-range.fixtures.json,
// loaded by src/form/td-datetime-range.ssr.engines.browser-test.js). test/php/td-ssr-datetime-range.test.js fails when
// it is stale.
//   node test/ssr/build-datetime-range-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderDatetimeRangeFixture, DATETIME_RANGE_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-datetime-range-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(DATETIME_RANGE_FIXTURE_FILE), { recursive: true });
writeFileSync(DATETIME_RANGE_FIXTURE_FILE, renderDatetimeRangeFixture());
console.log(`wrote ${DATETIME_RANGE_FIXTURE_FILE}`);
