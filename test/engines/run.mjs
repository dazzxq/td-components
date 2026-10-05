/**
 * `npm run test:engines` (v0.38.0): run every `*.spec.mjs` of this directory one after the other (each launches its
 * own Chromium / Firefox / WebKit). Exit code 1 when any spec fails; all specs run either way.
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const specs = readdirSync(DIR).filter((f) => f.endsWith('.spec.mjs')).sort();
const failed = [];
for (const spec of specs) {
  console.log(`\n=== ${spec} ===`);
  const r = spawnSync(process.execPath, [join(DIR, spec)], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(spec);
}
if (failed.length) {
  console.log(`\ntest:engines — FAILED: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`\ntest:engines — ${specs.length} spec(s) passed.`);
