// Regenerate test/ssr/fixtures/carousel.html (PHP markup of every case in test/ssr/carousel.fixtures.json, loaded by
// src/display/td-v050-carousel.engines.browser-test.js). test/php/td-ssr-carousel.test.js fails when it is stale.
//   node test/ssr/build-carousel-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderCarouselFixture, CAROUSEL_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-carousel-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(CAROUSEL_FIXTURE_FILE), { recursive: true });
writeFileSync(CAROUSEL_FIXTURE_FILE, renderCarouselFixture());
console.log(`wrote ${CAROUSEL_FIXTURE_FILE}`);
