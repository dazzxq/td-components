#!/usr/bin/env node
/**
 * v0.88.0 (plan v0.88.0-rich-text, lane B): generate src/form/rich-text/rich-text-policy.json from RICH_TEXT_POLICY
 * (src/form/rich-text/rich-text-policy.js is the single source; php/td-rich-text-policy.php reads the JSON).
 *   node scripts/build-rich-text-policy.mjs          → write
 *   node scripts/build-rich-text-policy.mjs --check  → exit 1 if stale
 * The JSON is read / written ONLY through scripts/safe-file.mjs (never follows a symbolic link).
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RICH_TEXT_POLICY } from '../src/form/rich-text/rich-text-policy.js';
import { readGenerated, writeGenerated } from './safe-file.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'form', 'rich-text', 'rich-text-policy.json');
const out = `${JSON.stringify(RICH_TEXT_POLICY, null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (readGenerated(ROOT, OUT) !== out) {
    console.error('src/form/rich-text/rich-text-policy.json is stale — run npm run build:rich-text-policy');
    process.exit(1);
  }
  console.log('rich-text policy up to date');
} else {
  writeGenerated(ROOT, OUT, out);
  console.log('wrote src/form/rich-text/rich-text-policy.json');
}
