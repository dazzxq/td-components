// ADR 0014 (v0.34.0): breakpoint lint + generated container-query fallbacks (scripts/css-responsive.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkBreakpoints, addContainerFallbacks, expandVariants, compact, matchBrace, FALLBACK_MARK, VARIANT_MARK } from '../../scripts/css-responsive.mjs';

test('checkBreakpoints: kit numbers pass, others fail with file:line', () => {
  const ok = `@media (max-width: 719.98px) { a { b: c } }
@media (min-width: 1024px) and (pointer: coarse) { a { b: c } }
@media (max-height: 500px) { a { b: c } }
@media (pointer: coarse) { a { b: c } }
@container td-x (width < 480px) { a { b: c } }
@container td-x (width >= 1280px) { a { b: c } }
@container td-x (width < 360px) { a { b: c } }
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
  assert.ok(out.includes('@supports not (container-type: inline-size) {\n\t\t@media (max-width: 479.98px) {.a{display:none}.b{content:"}"}}\n\t}'), out);
  assert.ok(out.includes('@media (min-width: 720px) {.c{gap:1rem}}'), out);
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
    assert.equal(compact(fbBody), compact(body), `${m[1]} rules identical`);
  }
  return count;
});

test('expandVariants: one source rule set re-emitted per container condition with the variant prefix', () => {
  const css = `@layer td.component {
	/* card mode
	 * @td-variants source=":where(x-t[layout=\\"cards\\"])"
	 *   td-t (width < 480px) => :where(x-t[below="sm"])
	 *   td-t (width < 720px) => :where(x-t:not([below]))
	 */
	:where(x-t[layout="cards"]) .row { display: flex; } /* note */
	:where(x-t[layout="cards"]) .cell::before { content: "a: b"; }
	/* @td-variants-end */
}`;
  const out = expandVariants(css, 'v.css');
  assert.ok(out.includes(':where(x-t[layout="cards"]) .row { display: flex; }'), 'source kept');
  assert.equal(out.split(VARIANT_MARK).length - 1, 2);
  assert.ok(out.includes('@container td-t (width < 480px) {:where(x-t[below="sm"]) .row{display:flex}:where(x-t[below="sm"]) .cell::before{content:"a:b"}}'), out);
  assert.ok(out.includes('@container td-t (width < 720px) {:where(x-t:not([below])) .row{display:flex}'), out);
  assert.ok(!out.includes('@td-variants-end'));
  // then the fallbacks follow each generated block
  const full = addContainerFallbacks(out, 'v.css');
  assert.equal(full.split(FALLBACK_MARK).length - 1, 2);
  assert.deepEqual(checkBreakpoints(full, 'v.css'), []);
});

test('expandVariants: malformed specs throw with file:line', () => {
  const bad = (spec, body = ':where(s) a { b: c; }') => `/* @td-variants source=":where(s)"\n${spec}\n*/\n${body}\n/* @td-variants-end */`;
  assert.throws(() => expandVariants(bad('td-t (width < 480px) :where(v)'), 'b.css'), /b\.css:1: bad @td-variants line/);
  assert.throws(() => expandVariants(bad(''), 'b.css'), /without variants/);
  assert.throws(() => expandVariants(bad('td-t (width < 480px) => :where(v)', 'a { b: c; }'), 'b.css'), /never uses its source prefix/);
});

test('td-table.css holds ONE card rule set (no hand copies); td.css carries 3 generated card-below variants', async () => {
  const src = await readFile(new URL('./components/table.css', import.meta.url), 'utf8');
  assert.equal((src.match(/@container td-table \(width < /g) || []).length, 0, 'no hand-written card container blocks');
  const css = await readFile(new URL('../../td.css', import.meta.url), 'utf8');
  for (const [n, p] of [[480, '[card-below="sm"]'], [720, ':not([layout="table"],[card-below="sm"],[card-below="lg"])'], [1024, '[card-below="lg"]']]) {
    const i = css.indexOf(`@container td-table (width < ${n}px) {`);
    assert.ok(i > 0, `variant ${n}`);
    assert.ok(css.slice(i, i + 400).includes(p), `variant ${n} prefix`);
  }
});

test('360 is a container-only size: allowed in @container (+ generated fallback), rejected in hand-written @media', () => {
  assert.deepEqual(checkBreakpoints('@container td-p (width < 360px) { a { b: c } }', 'c.css'), []);
  assert.equal(checkBreakpoints('@media (max-width: 359.98px) { a { b: c } }', 'c.css').length, 1);
  const out = addContainerFallbacks('@container td-p (width < 360px) { .a { b: c; } }', 'c.css');
  assert.ok(out.includes('@media (max-width: 359.98px) {.a{b:c}}'), out);
});
