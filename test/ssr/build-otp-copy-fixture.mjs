// Regenerate test/ssr/fixtures/otp.html + test/ssr/fixtures/copy.html (PHP markup of every case in
// test/ssr/otp.fixtures.json / copy.fixtures.json, loaded by src/form/td-otp-input.ssr.engines.browser-test.js and
// src/display/td-copy.ssr.engines.browser-test.js). test/php/td-ssr-otp-copy.test.js fails when they are stale.
//   node test/ssr/build-otp-copy-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderOtpFixture, renderCopyFixture, OTP_FIXTURE_FILE, COPY_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-otp-copy-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(OTP_FIXTURE_FILE), { recursive: true });
writeFileSync(OTP_FIXTURE_FILE, renderOtpFixture());
writeFileSync(COPY_FIXTURE_FILE, renderCopyFixture());
console.log(`wrote ${OTP_FIXTURE_FILE}\nwrote ${COPY_FIXTURE_FILE}`);
