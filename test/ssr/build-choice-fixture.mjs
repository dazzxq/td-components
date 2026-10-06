// Regenerate test/ssr/fixtures/choice.html (PHP markup of every case in test/ssr/choice.fixtures.json, loaded by
// src/form/td-choice-group.ssr.engines.browser-test.js). test/php/td-ssr-choice.test.js fails when it is stale.
//   node test/ssr/build-choice-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HAS_PHP } from '../php/php.mjs';
import { renderChoiceFixture, CHOICE_FIXTURE_FILE } from './ssr.mjs';

if (!HAS_PHP) {
  console.error('build-choice-fixture: php >= 8.0 CLI not found');
  process.exit(1);
}
mkdirSync(dirname(CHOICE_FIXTURE_FILE), { recursive: true });
writeFileSync(CHOICE_FIXTURE_FILE, renderChoiceFixture());
console.log(`wrote ${CHOICE_FIXTURE_FILE}`);
