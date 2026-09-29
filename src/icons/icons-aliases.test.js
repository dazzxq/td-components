// v0.18.0 F6: icon aliases — one table (src/icons/icons.json "aliases") for JS (registry.js → td-icon.js) and PHP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { aliases as generated } from './registry.js';
import { hasIcon, listIcons, resolveIconName } from './td-icon.js';
import { HAS_PHP, ROOT, runPhp } from '../../test/php/php.mjs';

const json = JSON.parse(readFileSync(join(ROOT, 'src/icons/icons.json'), 'utf8'));

// The table 135 relies on (plan F6) — same names PHP accepted since v0.17.0.
const EXPECTED = {
  x: 'close',
  'chevron-left': 'prev',
  'chevron-right': 'next',
  'chevron-up': 'up',
  'chevron-down': 'down',
  ellipsis: 'more',
  'external-link': 'external',
  expand: 'fullscreen',
  pen: 'pencil',
};

test('icons.json aliases: the F6 table, every target a core icon, no alias shadows a core name', () => {
  assert.deepEqual(json.aliases, EXPECTED);
  for (const [alias, target] of Object.entries(json.aliases)) {
    assert.ok(Object.hasOwn(json.icons, target), `${alias} → ${target}`);
    assert.ok(!Object.hasOwn(json.icons, alias), `${alias} shadows a core icon`);
  }
});

test('registry.js exports the same aliases (generated, not hand-edited)', () => {
  assert.deepEqual({ ...generated }, json.aliases);
});

test('td-icon.js resolves aliases (hasIcon / resolveIconName), listIcons stays canonical', () => {
  for (const [alias, target] of Object.entries(EXPECTED)) {
    assert.equal(hasIcon(alias), true, alias);
    assert.equal(resolveIconName(alias), target, alias);
  }
  assert.equal(resolveIconName('close'), 'close');
  assert.equal(resolveIconName('no-such-icon'), null);
  assert.equal(hasIcon('no-such-icon'), false);
  // prototype keys are never aliases
  for (const k of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) assert.equal(hasIcon(k), false, k);
  const names = listIcons();
  for (const alias of Object.keys(EXPECTED)) assert.ok(!names.includes(alias), alias);
});

test('PHP: every alias renders the same SVG as its target', { skip: !HAS_PHP && 'php >= 8.1 CLI not found' }, () => {
  const entries = Object.entries(json.aliases);
  const res = runPhp(entries.flatMap(([alias, target]) => [
    { fn: 'td_icon', args: [alias] },
    { fn: 'td_icon', args: [target] },
  ]));
  entries.forEach(([alias, target], i) => {
    const a = res[2 * i].out;
    assert.ok(a.startsWith(`<svg class="td-icon td-icon--m" data-icon="${target}"`), alias);
    assert.equal(a, res[2 * i + 1].out, alias);
  });
});
