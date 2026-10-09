// CI shard helper (v0.62.1 parallel CI): run web-test-runner once per named group of web-test-runner.config.js, except
// the groups given with --skip (the `browser` CI job runs `default` and `engines` in their own matrix entries).
//   node scripts/wtr-groups.mjs --skip engines   → scrollbars, ssr, pointer-1…n, one after another; exit 1 if any failed
import { spawnSync } from 'node:child_process';

const skip = new Set(process.argv.includes('--skip') ? process.argv[process.argv.indexOf('--skip') + 1].split(',') : []);
const config = (await import('../web-test-runner.config.js')).default;
const groups = config.groups.map((g) => g.name).filter((n) => !skip.has(n));
const failed = [];
for (const g of groups) {
  console.log(`\n=== web-test-runner --group ${g} ===`);
  const r = spawnSync('npx', ['web-test-runner', '--group', g], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(g);
}
if (failed.length) {
  console.log(`\nwtr groups FAILED: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`\nwtr groups passed: ${groups.join(', ')}`);
