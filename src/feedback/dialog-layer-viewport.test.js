// v0.36.2 (ADR 0019, plan QĐ 16): every openDialogLayer() caller in src/ follows the on-screen keyboard (passes
// `viewport`) or is a reviewed exclusion with its reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const EXCLUDED = {
  'feedback/crop-dialog.js': 'no text control (preset buttons + the crop box): the keyboard never opens over it',
};

async function files(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await files(p, out);
    else if (e.name.endsWith('.js') && !/\.(test|browser-test|stories)\.js$/.test(e.name)) out.push(p);
  }
  return out;
}

test('openDialogLayer callers pass `viewport` (or are excluded with a reason)', async () => {
  const seen = [];
  for (const f of await files(SRC)) {
    const rel = f.slice(SRC.length).replace(/\\/g, '/');
    if (rel === 'feedback/dialog-layer.js') continue;
    const src = await readFile(f, 'utf8');
    for (const m of src.matchAll(/openDialogLayer\(\{/g)) {
      seen.push(rel);
      // the options object literal: up to the matching `})` of the call (first 1200 chars are enough for the keys)
      const head = src.slice(m.index, m.index + 1200);
      const hasViewport = /\n\s*viewport:\s*\{\s*root\b/.test(head);
      if (EXCLUDED[rel]) assert.ok(!hasViewport, `${rel} is excluded but passes viewport`);
      else assert.ok(hasViewport, `${rel}: openDialogLayer without viewport`);
    }
  }
  assert.deepEqual([...new Set(seen)].sort(), ['feedback/crop-dialog.js', 'feedback/media-picker-filters.js', 'feedback/media-picker-upload.js',
    'feedback/td-drawer.js', 'feedback/td-media-picker.js', 'feedback/td-modal.js']);
});
