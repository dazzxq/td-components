// Node helpers for the SSR contracts (ADR 0012): button@1 (v0.25.0, test/ssr/button.fixtures.json) and input-field@1 /
// toggle@1 / checkbox@1 (v0.26.0, test/ssr/form.fixtures.json).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PHP_BIN } from '../php/php.mjs';

export const SSR_DIR = dirname(fileURLToPath(import.meta.url));
export const BUTTON_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'button.fixtures.json'), 'utf8'));
export const BUTTON_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'button.html');
export const FORM_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'form.fixtures.json'), 'utf8'));
export const FORM_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'form.html');

/** Run a fixture PHP script of this directory and return its stdout. */
function renderPhp(script) {
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', join(SSR_DIR, script)], { encoding: 'utf8' });
  if (r.status !== 0 || r.stderr) throw new Error(`${script} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}

/** Render test/ssr/button-fixture.php (the HTML loaded by the button SSR browser test). */
export function renderButtonFixture() {
  return renderPhp('button-fixture.php');
}

/** Render test/ssr/form-fixture.php (the HTML loaded by the form SSR browser test). */
export function renderFormFixture() {
  return renderPhp('form-fixture.php');
}
