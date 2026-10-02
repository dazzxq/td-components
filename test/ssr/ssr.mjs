// Node helpers for the v0.25.0 SSR button contract (shared fixtures test/ssr/button.fixtures.json).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PHP_BIN } from '../php/php.mjs';

export const SSR_DIR = dirname(fileURLToPath(import.meta.url));
export const BUTTON_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'button.fixtures.json'), 'utf8'));
export const BUTTON_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'button.html');

/** Render test/ssr/button-fixture.php (the HTML loaded by the SSR browser test). */
export function renderButtonFixture() {
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', join(SSR_DIR, 'button-fixture.php')], { encoding: 'utf8' });
  if (r.status !== 0 || r.stderr) throw new Error(`button-fixture.php failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}
