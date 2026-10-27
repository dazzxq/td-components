#!/usr/bin/env node
// `npm run test:visual [-- --update]`: runs every visual gate in turn, forwarding the CLI args (and the environment:
// TD_VISUAL_STRICT / FORCE / OUT) to each; exit 1 if any fails. All scripts run even after a failure.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = ['media-picker.visual.mjs', 'dropdown.visual.mjs'];
let failed = 0;
for (const s of SCRIPTS) {
  console.log(`\n== ${s} ==`);
  const r = spawnSync(process.execPath, [join(HERE, s), ...process.argv.slice(2)], { stdio: 'inherit' });
  if (r.status !== 0) { failed++; console.error(`${s} exited ${r.status ?? r.signal}`); }
}
process.exit(failed ? 1 : 0);
