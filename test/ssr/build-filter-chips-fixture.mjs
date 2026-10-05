// Regenerate test/ssr/fixtures/filter-chips.html (PHP markup of every case in test/ssr/filter-chips.fixtures.json,
// loaded by src/display/td-filter-chips.ssr.engines.browser-test.js). test/php/td-ssr-filter-chips.test.js fails when
// it is stale.
//   node test/ssr/build-filter-chips-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderFilterChipsFixture, FILTER_CHIPS_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-filter-chips-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(FILTER_CHIPS_FIXTURE_FILE), { recursive: true });
writeFileSync(FILTER_CHIPS_FIXTURE_FILE, renderFilterChipsFixture());
console.log(`wrote ${FILTER_CHIPS_FIXTURE_FILE}`);
