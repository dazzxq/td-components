// v0.104.0: filled icons (`<name>-filled`, one precomputed fill path, Lucide-derived) + PHP variant parity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HAS_PHP, ROOT, runPhp } from '../../test/php/php.mjs';

const json = JSON.parse(readFileSync(join(ROOT, 'src/icons/icons.json'), 'utf8'));
const design = JSON.parse(readFileSync(join(ROOT, 'scripts/filled-icons/design.json'), 'utf8'));
const FILLED = Object.keys(json.icons).filter((n) => n.endsWith('-filled'));

test('15 filled icons, each = its outline twin + one fill path, lucide source kept', () => {
  assert.equal(FILLED.length, 15);
  assert.deepEqual(FILLED.slice().sort(), Object.keys(design.icons).sort());
  for (const n of FILLED) {
    const def = json.icons[n];
    const base = n.slice(0, -'-filled'.length);
    assert.ok(json.icons[base], `${n}: outline twin ${base}`);
    assert.equal(def.paint, 'fill', n);
    assert.equal(def.lucide, json.icons[base].lucide, `${n}: same Lucide source as ${base}`);
    assert.equal(def.nodes.length, 1, n);
    assert.equal(def.nodes[0][0], 'path', n);
  }
});

test('PHP: td_icon / Td::icon variant filled, fallback, parity with the -filled name', { skip: !HAS_PHP && 'php >= 8.0 CLI not found' }, () => {
  const res = runPhp([
    { fn: 'td_icon', args: ['eye', 'm', '', 'filled'] },
    { fn: 'td_icon', args: ['eye-filled'] },
    { fn: 'td_icon', args: ['x', 's', '', 'filled'] },
    { fn: 'td_icon', args: ['close', 'm', '', 'filled'] },
    { fn: 'td_icon', args: ['close'] },
    { fn: 'td_icon', args: ['eye', 'm', '', 'solid'] },
    { fn: 'td_icon', args: ['eye'] },
  ]).map((r) => r.out);
  assert.ok(res[0].startsWith('<svg class="td-icon td-icon--m" data-icon="eye-filled" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"'), res[0]);
  assert.equal(res[0], res[1]);
  assert.ok(res[2].includes('data-icon="close"'), res[2]); // alias → close, no filled → outline
  assert.equal(res[3], res[4]);
  assert.equal(res[5], res[6]);
});
