// Regenerate test/ssr/fixtures/action-button.html (PHP element-mode markup of every preset + every case of
// test/ssr/action-button.fixtures.json, loaded by src/form/td-action-button.ssr.engines.browser-test.js).
// test/php/td-action-button.test.js fails when the file is stale.
//   node test/ssr/build-action-button-fixture.mjs
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HAS_PHP, PHP_BIN } from '../php/php.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
export const ACTION_BUTTON_FIXTURES = JSON.parse(readFileSync(join(DIR, 'action-button.fixtures.json'), 'utf8'));
export const ACTION_BUTTON_FIXTURE_FILE = join(DIR, 'fixtures', 'action-button.html');

/** Render test/ssr/action-button-fixture.php. */
export function renderActionButtonFixture() {
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', join(DIR, 'action-button-fixture.php')], { encoding: 'utf8' });
  if (r.status !== 0 || r.stderr) throw new Error(`action-button-fixture.php failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!HAS_PHP) {
    console.error('build-action-button-fixture: php >= 8.0 CLI not found');
    process.exit(1);
  }
  mkdirSync(dirname(ACTION_BUTTON_FIXTURE_FILE), { recursive: true });
  writeFileSync(ACTION_BUTTON_FIXTURE_FILE, renderActionButtonFixture());
  console.log(`wrote ${ACTION_BUTTON_FIXTURE_FILE}`);
}
