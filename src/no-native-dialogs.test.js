// v0.62.0 (plan B): the kit never demonstrates the browser's own dialogs. Stories, demo.html and the code fences of the
// user docs use TdModal.confirm / trackFormDirty().confirmDiscard() — a native confirm() is not themeable, blocks the
// page, sits outside the drawer / modal stack and loses the focus return. `beforeunload` is the one native prompt the
// browser forces (docs/components/form-validation.md § Rời trang); it is not a call, so it is not matched here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
// `confirm(` / `alert(` / `prompt(` as a CALL: not a method (`TdModal.confirm(`), not part of a name, and not inside a
// payload string (`javascript:alert(1)`, `onerror=alert(1)`).
const CALL = /(?<![\w$.:=])(?:window\s*\.\s*)?(?:confirm|alert|prompt)\s*\(/;
const WINDOW_CALL = /window\s*\.\s*(?:confirm|alert|prompt)\s*\(/;
// internal history may quote the old pattern
const SKIP_DOCS = [/^docs\/internal\/(plans|history|decisions|research)\//];

function walk(dir, ok, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ok, out);
    else if (ok(p)) out.push(p);
  }
  return out;
}

const rel = (p) => p.slice(ROOT.length);
const stripComment = (line) => line.replace(/(^|\s)\/\/.*$/, '$1');

/** @returns {string[]} "file:line text" of every native dialog call */
export function nativeDialogCalls(text, { fencesOnly = false } = {}) {
  const hits = [];
  let inFence = false;
  text.split('\n').forEach((raw, i) => {
    if (fencesOnly) {
      if (/^\s*```/.test(raw)) { inFence = !inFence; return; }
      if (!inFence) return;
    }
    const line = stripComment(raw);
    if (CALL.test(line) || WINDOW_CALL.test(line)) hits.push(`${i + 1}: ${raw.trim()}`);
  });
  return hits;
}

test('the matcher: calls yes, methods / payload strings / comments no', () => {
  assert.equal(nativeDialogCalls('if (!window.confirm("x")) return;').length, 1);
  assert.equal(nativeDialogCalls('if (confirm("x")) {').length, 1);
  assert.equal(nativeDialogCalls('alert("hi");').length, 1);
  assert.equal(nativeDialogCalls('await TdModal.confirm({ title: "x" });').length, 0);
  assert.equal(nativeDialogCalls("href: 'javascript:alert(1)'").length, 0);
  assert.equal(nativeDialogCalls('<img src=x onerror=alert(1)>').length, 0);
  assert.equal(nativeDialogCalls('// confirm() trả Promise<boolean>').length, 0);
  assert.equal(nativeDialogCalls('tracker.confirmDiscard()').length, 0);
  assert.equal(nativeDialogCalls('prose confirm() outside a fence', { fencesOnly: true }).length, 0);
  assert.equal(nativeDialogCalls('```js\nconfirm("x")\n```', { fencesOnly: true }).length, 1);
});

test('stories and demo.html never call a native dialog', () => {
  const files = [...walk(join(ROOT, 'src'), (p) => p.endsWith('.stories.js')), join(ROOT, 'demo.html')];
  const bad = files.flatMap((f) => nativeDialogCalls(readFileSync(f, 'utf8')).map((h) => `${rel(f)}:${h}`));
  assert.deepEqual(bad, [], 'use TdModal.confirm / trackFormDirty().confirmDiscard() (docs/components/drawer.md § 6)');
});

test('code fences in the user docs never call a native dialog', () => {
  const files = walk(join(ROOT, 'docs'), (p) => p.endsWith('.md') && !SKIP_DOCS.some((re) => re.test(rel(p))));
  const bad = files.flatMap((f) => nativeDialogCalls(readFileSync(f, 'utf8'), { fencesOnly: true }).map((h) => `${rel(f)}:${h}`));
  assert.deepEqual(bad, []);
});
