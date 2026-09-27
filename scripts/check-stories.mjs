#!/usr/bin/env node
/**
 * Story XSS check (plan v0.12.0, review ISSUE-7): imports every src/**\/*.stories.js (CSS + custom-element modules
 * stubbed by ./check-stories/hooks.mjs), renders EVERY exported story with an HTML payload in every declared arg /
 * argType (plus common text args) and fails when the payload's `<img` survives as markup.
 *
 *   npm run check:stories                 → all stories
 *   node --import ./scripts/check-stories/register.mjs scripts/check-stories.mjs <file>   → one file
 * Stories that need a real DOM (return a Node, or throw a ReferenceError for document/window) are left to the DOM
 * half of the gate, src/stories-dom.browser-test.js (every story, real browser). Any OTHER throw fails here.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PAYLOAD = '"><img src=x onerror=alert(1)>';
const COMMON = ['label', 'placeholder', 'size', 'variant', 'icon', 'title', 'message', 'text', 'hint'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.stories.js')) out.push(p);
  }
  return out;
}

const files = process.argv[2] ? [process.argv[2]] : walk('src');
globalThis.setTimeout = () => 0; // stories schedule DOM work after render; not needed here
let rendered = 0; let skipped = 0; const leaks = []; const failures = [];
for (const f of files) {
  const m = await import(pathToFileURL(resolve(f)).href);
  const meta = m.default || {};
  for (const [name, story] of Object.entries(m)) {
    if (!story || typeof story.render !== 'function') continue;
    const keys = new Set([...Object.keys(meta.argTypes || {}), ...Object.keys(meta.args || {}),
      ...Object.keys(story.args || {}), ...COMMON]);
    const args = { ...(meta.args || {}), ...(story.args || {}) };
    for (const k of keys) if (typeof args[k] !== 'boolean') args[k] = PAYLOAD;
    let out;
    try {
      out = story.render(args, { args });
    } catch (err) {
      const needsDom = err instanceof ReferenceError && /\b(document|window|HTMLElement|customElements|Node)\b/.test(err.message);
      if (needsDom) { skipped++; continue; }
      failures.push(`${f} › ${name}: ${err && err.message}`);
      continue;
    }
    if (typeof out !== 'string') { skipped++; continue; }
    rendered++;
    if (out.includes('<img src=x')) leaks.push(`${f} › ${name}`);
  }
}
console.log(`check:stories — rendered ${rendered} stories from ${files.length} files (${skipped} need a DOM → checked by `
  + `src/stories-dom.browser-test.js); leaks ${leaks.length}; failures ${failures.length}`);
for (const l of leaks) console.log(`  LEAK ${l}`);
for (const l of failures) console.log(`  FAIL ${l}`);
process.exit(leaks.length || failures.length ? 1 : 0);
