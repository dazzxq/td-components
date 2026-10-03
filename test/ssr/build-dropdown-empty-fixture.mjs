// Regenerate test/ssr/fixtures/dropdown.html + test/ssr/fixtures/empty.html (PHP markup of every case in
// test/ssr/dropdown.fixtures.json / empty.fixtures.json, loaded by src/form/td-dropdown.ssr.browser-test.js and
// src/display/td-empty-state.ssr.browser-test.js). test/php/td-ssr-dropdown-empty.test.js fails when they are stale.
//   node test/ssr/build-dropdown-empty-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderDropdownFixture, renderEmptyFixture, DROPDOWN_FIXTURE_FILE, EMPTY_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-dropdown-empty-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(DROPDOWN_FIXTURE_FILE), { recursive: true });
writeFileSync(DROPDOWN_FIXTURE_FILE, renderDropdownFixture());
writeFileSync(EMPTY_FIXTURE_FILE, renderEmptyFixture());
console.log(`wrote ${DROPDOWN_FIXTURE_FILE}\nwrote ${EMPTY_FIXTURE_FILE}`);
