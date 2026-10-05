// Regenerate test/ssr/fixtures/steps.html + timeline.html (PHP markup of every case in test/ssr/{steps,timeline}.fixtures.json,
// loaded by src/display/td-{steps,timeline}.ssr.engines.browser-test.js). test/php/td-ssr-steps-timeline.test.js fails
// when they are stale.
//   node test/ssr/build-steps-timeline-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderStepsTimelineFixture, STEPS_FIXTURE_FILE, TIMELINE_FIXTURE_FILE } from './steps-timeline.mjs';

if (!HAS_PHP) {
  console.error('build-steps-timeline-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
for (const [which, file] of [['steps', STEPS_FIXTURE_FILE], ['timeline', TIMELINE_FIXTURE_FILE]]) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, renderStepsTimelineFixture(which));
  console.log(`wrote ${file}`);
}
