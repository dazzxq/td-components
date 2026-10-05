// Regenerate test/ssr/fixtures/media-gallery.html (PHP markup of every case in test/ssr/media-gallery.fixtures.json, loaded
// by src/form/td-media-gallery.ssr.engines.browser-test.js). test/php/td-ssr-media-gallery.test.js fails when it is stale.
//   node test/ssr/build-media-gallery-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderMediaGalleryFixture, MEDIA_GALLERY_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-media-gallery-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(MEDIA_GALLERY_FIXTURE_FILE), { recursive: true });
writeFileSync(MEDIA_GALLERY_FIXTURE_FILE, renderMediaGalleryFixture());
console.log(`wrote ${MEDIA_GALLERY_FIXTURE_FILE}`);
