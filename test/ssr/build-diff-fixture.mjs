// Regenerate test/ssr/fixtures/diff.html (PHP markup of every case in test/ssr/diff.fixtures.json, loaded by
// src/display/td-diff.ssr.engines.browser-test.js). test/php/td-ssr-diff.test.js fails when it is stale.
//   node test/ssr/build-diff-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderDiffFixture, DIFF_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-diff-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(DIFF_FIXTURE_FILE), { recursive: true });
writeFileSync(DIFF_FIXTURE_FILE, renderDiffFixture());
console.log(`wrote ${DIFF_FIXTURE_FILE}`);
