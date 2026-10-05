// Regenerate test/ssr/fixtures/rating.html (PHP markup of every case in test/ssr/rating.fixtures.json, loaded by
// src/display/td-v050-rating.engines.browser-test.js). test/php/td-ssr-rating.test.js fails when it is stale.
//   node test/ssr/build-rating-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderRatingFixture, RATING_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-rating-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(RATING_FIXTURE_FILE), { recursive: true });
writeFileSync(RATING_FIXTURE_FILE, renderRatingFixture());
console.log(`wrote ${RATING_FIXTURE_FILE}`);
