// v0.51.1 (plan v0.51.1-ssr-fouc, ADR 0025): the browser fixture of test/engines/ssr-fouc.spec.mjs
// (test/ssr/fixtures/fouc.html, rendered from test/ssr/fouc.fixtures.json by test/ssr/fouc-fixture.php) must be up to
// date, and every case must render the host its module upgrades (one section per case, the expected tag).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HAS_PHP } from './php.mjs';
import { FOUC_FIXTURES, FOUC_FIXTURE_FILE, renderFoucFixture } from '../ssr/ssr.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

describe('v0.51.1 SSR pre-upgrade parity fixture', opts, () => {
  test('test/ssr/fixtures/fouc.html (browser fixture) is up to date', () => {
    assert.equal(readFileSync(FOUC_FIXTURE_FILE, 'utf8'), renderFoucFixture(), 'stale fixture: run `node test/ssr/build-fouc-fixture.mjs`');
  });

  test('one section per case, each holding the upgraded host of its module', () => {
    const html = readFileSync(FOUC_FIXTURE_FILE, 'utf8');
    const sections = [...html.matchAll(/<section class="fouc-case" data-case="([^"]+)" data-kind="([a-z]+)" data-module="([a-z-]+)" data-width="(\d+)" data-tag="([a-z-]+)">(<[a-z-]+)/g)];
    assert.equal(sections.length, FOUC_FIXTURES.cases.length);
    const tagOf = { 'empty-state': 'td-empty-state' };
    for (const [i, m] of sections.entries()) {
      const c = FOUC_FIXTURES.cases[i];
      assert.equal(m[1], c.id);
      assert.equal(m[2], c.kind);
      assert.equal(m[3], c.module);
      assert.equal(m[5], m[6].slice(1), `${c.id}: data-tag = first element`);
      const want = tagOf[c.module] ?? (c.module === 'action-button' ? 'td-action-button' : `td-${c.module}`);
      assert.equal(m[5], want, `${c.id}: host is <${want}>`);
    }
  });
});
