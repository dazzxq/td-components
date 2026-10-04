// ADR 0014 (v0.34.0): breakpoint lint + generated container-query fallbacks (scripts/css-responsive.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkBreakpoints, addContainerFallbacks, matchBrace, FALLBACK_MARK } from '../../scripts/css-responsive.mjs';

test('checkBreakpoints: kit numbers pass, others fail with file:line', () => {
  const ok = `@media (max-width: 719.98px) { a { b: c } }
@media (min-width: 1024px) and (pointer: coarse) { a { b: c } }
@media (max-height: 500px) { a { b: c } }
@media (pointer: coarse) { a { b: c } }
@container td-x (width < 480px) { a { b: c } }
@container td-x (width >= 1280px) { a { b: c } }
/* @media (max-width: 999px) in a comment is ignored */`;
  assert.deepEqual(checkBreakpoints(ok, 'ok.css'), []);
  const bad = `x {}
@media (max-width: 640px) { a { b: c } }
@media (min-width: 768px) { a { b: c } }
@media (width <= 719.98px) { a { b: c } }
@media (max-height: 600px) { a { b: c } }
@container td-x (width < 900px) { a { b: c } }
@media (max-width: 720px) { a { b: c } }`;
  const errs = checkBreakpoints(bad, 'bad.css');
  assert.equal(errs.length, 6, errs.join('\n'));
  assert.match(errs[0], /^bad\.css:2: width breakpoint 640px/);
  assert.match(errs[2], /bad\.css:4: use min-width/);
  assert.match(errs[5], /bad\.css:7: width breakpoint 720px/); // max-width must be N − 0.02
});

test('checkBreakpoints: bp-exception on the same line or the line above opts out', () => {
  const css = `/* bp-exception: legacy embed */
@media (max-width: 600px) { a { b: c } }
@media (max-width: 900px) { /* bp-exception: x */ a { b: c } }`;
  assert.deepEqual(checkBreakpoints(css, 'x.css'), []);
});

test('matchBrace skips comments and strings', () => {
  const css = 'a { content: "}"; /* } */ b { c: d } }';
  assert.equal(matchBrace(css, 2), css.length - 1);
});

test('addContainerFallbacks: one @supports-not viewport block per @container, same rules', () => {
  const css = `@layer td.component {
	@container td-pager (width < 480px) {
		.a { display: none; }
		.b { content: "}"; }
	}
	@container td-pager (width >= 720px) {
		.c { gap: 1rem; }
	}
}`;
  const out = addContainerFallbacks(css, 't.css');
  assert.equal(out.split(FALLBACK_MARK).length - 1, 2);
  assert.match(out, /@supports not \(container-type: inline-size\) \{\n\t\t@media \(max-width: 479\.98px\) \{\n\t\t\t\.a \{ display: none; \}\n\t\t\t\.b \{ content: "\}"; \}\n\t\t\}\n\t\}/);
  assert.match(out, /@media \(min-width: 720px\) \{\n\t\t\t\.c \{ gap: 1rem; \}/);
  // still inside the layer, original blocks untouched
  assert.ok(out.startsWith('@layer td.component {\n\t@container td-pager (width < 480px) {'));
  assert.ok(out.trimEnd().endsWith('}'));
  assert.deepEqual(checkBreakpoints(out, 't.css'), []);
});

test('addContainerFallbacks: only named td-* single width conditions', () => {
  assert.throws(() => addContainerFallbacks('@container (width < 480px) { a {} }', 'u.css'), /u\.css:1: @container must be/);
  assert.throws(() => addContainerFallbacks('@container td-a (width < 480px) and (height > 1px) { a {} }', 'u.css'), /must be/);
  assert.throws(() => addContainerFallbacks('@container td-a (width < 500px) { a {} }', 'u.css'), /not a kit breakpoint/);
});

test('td.css: every @container td-* block is followed by exactly its generated fallback', async () => {
  const css = await readFile(new URL('../../td.css', import.meta.url), 'utf8');
  const re = /@container (td-[a-z0-9-]+) \(width (<|>=) (\d+)px\) \{/g;
  let m;
  let count = 0;
  while ((m = re.exec(css))) {
    count++;
    const open = m.index + m[0].length - 1;
    const close = matchBrace(css, open);
    const body = css.slice(open, close + 1);
    const n = Number(m[3]);
    const media = m[2] === '<' ? `(max-width: ${n - 0.02}px)` : `(min-width: ${n}px)`;
    const next = css.slice(close + 1).replace(/^\s*/, '');
    assert.ok(next.startsWith(`${FALLBACK_MARK}\n`), `fallback mark after @container ${m[1]} (${m[3]})`);
    const fb = next.slice(FALLBACK_MARK.length).trimStart();
    assert.ok(fb.startsWith(`@supports not (container-type: inline-size) {`), m[1]);
    const inner = fb.slice(fb.indexOf('@media'));
    assert.ok(inner.startsWith(`@media ${media} {`), `${m[1]}: ${inner.slice(0, 60)}`);
    const fbBody = inner.slice(inner.indexOf('{'), matchBrace(inner, inner.indexOf('{')) + 1);
    assert.equal(fbBody.replace(/\s+/g, ' '), body.replace(/\s+/g, ' '), `${m[1]} rules identical`);
  }
  return count;
});
