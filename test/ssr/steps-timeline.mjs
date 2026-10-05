// v0.45.0: node helpers for the SSR contracts steps@1 / timeline@1 (kept out of ssr.mjs: one module per release line).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PHP_BIN } from '../php/php.mjs';
import { SSR_DIR } from './ssr.mjs';

export const STEPS_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'steps.fixtures.json'), 'utf8'));
export const STEPS_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'steps.html');
export const TIMELINE_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'timeline.fixtures.json'), 'utf8'));
export const TIMELINE_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'timeline.html');

/** @param {'steps'|'timeline'} which */
export function renderStepsTimelineFixture(which) {
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', join(SSR_DIR, 'steps-timeline-fixture.php'), which], { encoding: 'utf8' });
  if (r.status !== 0 || r.stderr) throw new Error(`steps-timeline-fixture.php ${which} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}
