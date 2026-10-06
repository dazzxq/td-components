// v0.49.0 (plan docs/internal/plans/v0.49.0-choice-stepper.md QĐ 8–9, M1) — the PHP gates of the choice-group sinks:
//   - Td::safeColor() = src/utils/css-safe.js safeColor() (test/ssr/safe-color.cases.json, the same file the node test
//     runs) → the SVG `fill` of a swatch;
//   - td__media_url() → `<img src>` of a swatch image: https: / scheme-less only, http: refused unless the site declares
//     Td::allowHttpLinks(true) (test/ssr/media-url.cases.json, `php` column).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HAS_PHP, ROOT, runPhp } from './php.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };
const load = (f) => JSON.parse(readFileSync(join(ROOT, 'test/ssr', f), 'utf8')).cases;

describe('php Td::safeColor (v0.49.0)', opts, () => {
  test('same answers as the JS safeColor (shared cases)', () => {
    const cases = load('safe-color.cases.json');
    const out = runPhp(cases.map((c) => ({ fn: 'Td::safeColor', args: [c.in] })));
    cases.forEach((c, i) => assert.deepEqual(out[i], { out: c.out }, JSON.stringify(c.in)));
  });
});

describe('php td__media_url — swatch image scheme rule (v0.49.0 QĐ 9)', opts, () => {
  for (const allowHttp of [false, true]) {
    test(`Td::allowHttpLinks(${allowHttp})`, () => {
      const cases = load('media-url.cases.json').filter((c) => c.allowHttp === allowHttp);
      // the PHP side does not know the page scheme: `page` is irrelevant here, `allowHttp` is the server declaration
      const out = runPhp([{ fn: 'Td::allowHttpLinks', args: [allowHttp] }, ...cases.map((c) => ({ fn: 'td__media_url', args: [c.url] }))]).slice(1);
      cases.forEach((c, i) => assert.equal(out[i].out == null ? 'refuse' : 'keep', c.php, `${c.url.slice(0, 60)} (allowHttp ${allowHttp})`));
    });
  }
});
