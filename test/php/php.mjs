// Node helpers for the PHP adapter tests (plan v0.17.0 E5): run php/td.php through test/php/harness.php.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..', '..');
export const PHP_BIN = process.env.PHP_BIN || 'php';

/** true when a PHP >= 8.1 CLI is on PATH (else the PHP tests are skipped with a warning). */
export const HAS_PHP = (() => {
  const r = spawnSync(PHP_BIN, ['-r', 'echo PHP_VERSION_ID;'], { encoding: 'utf8' });
  return r.status === 0 && Number(r.stdout) >= 80100;
})();

/**
 * Run calls in ONE php process.
 * @param {Array<{fn: string, args?: any[]}>} calls
 * @param {{ baseUrl?: string, kitDir?: string }} [config] baseUrl → Td::configure(baseUrl, kitDir ?? repo root)
 * @returns {Array<{out?: any, error?: string, message?: string}>}
 */
export function runPhp(calls, config = { baseUrl: '/vendor/td/0.17.0' }) {
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', join(HERE, 'harness.php')], {
    input: JSON.stringify({ ...config, calls }),
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`php exited ${r.status}: ${r.stderr || r.stdout}`);
  if (r.stderr) throw new Error(`php wrote to stderr (warning/notice): ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/** Output of one call (throws when the call threw). */
export function php1(fn, ...args) {
  const [res] = runPhp([{ fn, args }]);
  if (res.error) throw new Error(`${res.error}: ${res.message}`);
  return res.out;
}

/** Render test/php/fixture.php (the HTML fixture of the browser tests). */
export function renderFixture() {
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', join(HERE, 'fixture.php')], { encoding: 'utf8' });
  if (r.status !== 0 || r.stderr) throw new Error(`fixture.php failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}

export const FIXTURE_FILE = join(HERE, 'fixtures', 'ssr.html');
