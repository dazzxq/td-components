// ADR 0019 (v0.36.2): hover gate + pressed-state lints (scripts/css-touch.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkHoverGate, checkPressed, pressedBases, baseOf, stripState, splitList } from '../../scripts/css-touch.mjs';
import { PRESS_TARGETS } from '../utils/press.js';

const GATE = '@media (hover: hover) and (pointer: fine)';

test('checkHoverGate: bare hover fails, the exact gate passes', () => {
  assert.equal(checkHoverGate('.a:hover { color: red }', 'x.css').length, 1);
  assert.match(checkHoverGate('.a:hover { color: red }', 'x.css')[0], /^x\.css:1: :hover outside/);
  assert.deepEqual(checkHoverGate(`${GATE} { .a:hover { color: red } }`, 'x.css'), []);
  // nested in a layer + the gate
  assert.deepEqual(checkHoverGate(`@layer td.component { ${GATE} { .a:hover:not(:disabled) { color: red } } }`, 'x.css'), []);
});

test('checkHoverGate: (hover: hover) without pointer: fine, or a gate in a list, fails', () => {
  assert.equal(checkHoverGate('@media (hover: hover) { .a:hover { color: red } }', 'x.css').length, 1);
  assert.equal(checkHoverGate('@media (pointer: fine) { .a:hover { color: red } }', 'x.css').length, 1);
  assert.equal(checkHoverGate('@media (hover: hover) and (pointer: fine), print { .a:hover { color: red } }', 'x.css').length, 1);
});

test('checkHoverGate: forced-colors nesting around the gate passes; gate around forced-colors too', () => {
  assert.deepEqual(checkHoverGate(`@media (forced-colors: active) { ${GATE} { .a:hover { outline: 1px solid } } }`, 'x.css'), []);
  assert.deepEqual(checkHoverGate(`${GATE} { @media (forced-colors: active) { .a:hover { outline: 1px solid } } }`, 'x.css'), []);
  assert.equal(checkHoverGate('@media (forced-colors: active) { .a:hover { outline: 1px solid } }', 'x.css').length, 1);
});

test('checkHoverGate: hover-exempt with a reason passes, without a reason fails', () => {
  assert.deepEqual(checkHoverGate('/* hover-exempt: demo only */\n.a:hover { color: red }', 'x.css'), []);
  assert.deepEqual(checkHoverGate('.a:hover { color: red } /* hover-exempt: same line */', 'x.css'), []);
  const e = checkHoverGate('/* hover-exempt: */\n.a:hover { color: red }', 'x.css');
  assert.equal(e.length, 1);
  assert.match(e[0], /needs a reason/);
});

test('checkHoverGate: :is(:hover, :focus-visible) fails even inside the gate', () => {
  assert.equal(checkHoverGate('.a:is(:hover, :focus-visible) { color: red }', 'x.css').length, 1);
  assert.match(checkHoverGate(`${GATE} { .a:is(:hover, :focus-visible) { color: red } }`, 'x.css')[0], /split :hover/);
});

test('checkHoverGate: comments / strings mentioning :hover are ignored; lists report per piece with the right line', () => {
  assert.deepEqual(checkHoverGate('/* .a:hover { } */ .b { content: ":hover" }', 'x.css'), []);
  const e = checkHoverGate(`.a,\n.b:hover,\n.c:hover { color: red }`, 'x.css');
  assert.equal(e.length, 2);
  assert.match(e[0], /x\.css:2:/);
  assert.match(e[1], /x\.css:3:/);
});

test('stripState / baseOf / splitList', () => {
  assert.equal(stripState('.a:hover:not(:disabled, [aria-x])[data-y]::before'), '.a');
  assert.equal(stripState('td-x.a#b'), 'td-x.a#b');
  assert.equal(baseOf('.p:hover .c:not(:checked) ~ .m', (p) => p.includes(':hover')), '.p');
  assert.equal(baseOf('.f[data-state="empty"] > .o:hover:not(:disabled)', (p) => p.includes(':hover')), '.f > .o');
  // ancestor state excluded in a pressed rule still names the same control (ISSUE-1: dropzone disabled / dragover)
  assert.equal(baseOf('.d:not([data-disabled], [data-state="dragover"]) .z:is(:active, [data-td-pressed])', (p) => p.includes(':active')), '.d .z');
  assert.equal(baseOf('a > [data-x] > .h:hover', (p) => p.includes(':hover')), 'a > [data-x] > .h'); // state-only compound kept
  assert.equal(baseOf('.a:is(:active, [data-td-pressed]):not(:disabled)', (p) => p.includes(':active')), '.a');
  assert.deepEqual(splitList('.a:is(.b, .c), .d').map((p) => p.text), ['.a:is(.b, .c)', '.d']);
});

test('checkPressed: bases from :hover and cursor: pointer need a pressed rule outside the gate', () => {
  const css = `${GATE} { .a:hover { color: red } .b[aria-x]:hover:not(:disabled) { color: red } }
.c { cursor: pointer }
.a:active { color: blue }
.b:is(:active, [data-td-pressed]):not(:disabled) { color: blue }`;
  const e = checkPressed(css, 'x.css');
  assert.equal(e.length, 1, e.join('\n'));
  assert.match(e[0], /x\.css:2: .*— \.c$/);
});

test('checkPressed: active-exempt with a reason passes, empty reason fails; :active inside the gate fails', () => {
  assert.deepEqual(checkPressed('/* active-exempt: text input, focus ring is the feedback */\n.c { cursor: pointer }', 'x.css'), []);
  assert.match(checkPressed('/* active-exempt: */\n.c { cursor: pointer }', 'x.css')[0], /needs a reason/);
  const e = checkPressed(`${GATE} { .a:hover { color: red } .a:active { color: blue } }`, 'x.css');
  assert.ok(e.some((m) => /inside the hover gate/.test(m)), e.join('\n'));
  assert.ok(e.some((m) => /no :active/.test(m)), e.join('\n'));
});

test('checkPressed: a pressed rule scoped by an ancestor state covers the control (ISSUE-1)', () => {
  const css = `.z { cursor: pointer }\n.d:not([data-disabled], [data-state="dragover"]) .z:is(:active, [data-td-pressed]) { color: blue }`;
  assert.deepEqual(checkPressed(css, 'x.css'), []);
  assert.deepEqual(pressedBases(css), ['.d .z']);
  // an unrelated longer name does not count
  assert.equal(checkPressed('.z { cursor: pointer }\n.d .zz:active { color: blue }', 'x.css').length, 1);
});

test('checkPressed: a pressed rule in another file counts (entries are checked together)', () => {
  const e = checkPressed([{ css: `${GATE} { .a:hover { color: red } }`, file: 'a.css' }, { css: '.a:active { color: blue }', file: 'b.css' }]);
  assert.deepEqual(e, []);
});

async function kitEntries() {
  const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8'));
  const entries = [];
  for (const f of manifest.files) entries.push({ css: await readFile(new URL(`./${f}`, import.meta.url), 'utf8'), file: f });
  return entries;
}

test('the kit CSS: 0 hover-gate errors, 0 hover-exempt (A1)', async () => {
  const entries = await kitEntries();
  assert.deepEqual(entries.flatMap((x) => checkHoverGate(x.css, x.file)), []);
  const hoverExempt = entries.reduce((n, x) => n + (x.css.match(/hover-exempt:/g) || []).length, 0);
  assert.equal(hoverExempt, 0);
});

test('the kit CSS: 0 pressed-state errors; press.js PRESS_TARGETS = the pressed bases (A2)', async () => {
  const entries = await kitEntries();
  assert.deepEqual(checkPressed(entries), []);
  assert.deepEqual([...PRESS_TARGETS].sort(), pressedBases(entries));
  // every active-exempt carries a reason (checkPressed enforces it) — the list is reviewed in docs/internal/design/touch.md
  const exempt = entries.flatMap((x) => [...x.css.matchAll(/active-exempt:([^*]*)\*\//g)].map((m) => m[1].trim()));
  assert.ok(exempt.every(Boolean));
  // ISSUE-1 (v0.36.2 review): the dropzone zone and the toast surface have a pressed look; v0.48.0: + the colour picker
  // field box (focus ring) and its native hue range (thumb follows the finger); v0.55.0: + the td-input-field affix box
  // (.td-field__box — focus ring, like .td-number__box); v0.63.0: + the `editable` picker / range boxes (.td-dtp--editable,
  // .td-dtr--editable — text input boxes, the focus ring is the feedback; their buttons keep their pressed rules)
  assert.equal(exempt.length, 19);
  for (const base of ['.td-dropzone .td-dropzone__zone', '.td-toast']) assert.ok(PRESS_TARGETS.includes(base), base);
});
