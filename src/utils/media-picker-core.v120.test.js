// v0.120.0 (plan docs/internal/plans/v0.120.0-focal-mode-optional.md QĐ7a) — focal-mode resolution keeps
// `focalPointOptional`. No DOM.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOptions, _resetCoreWarnings } from './media-picker-core.js';

const adapter = { list: async () => ({ items: [], nextCursor: null }), get: async () => null };
const run = (crop) => {
  _resetCoreWarnings();
  return resolveOptions({ adapter }, { selection: { mode: 'single' }, crop }, { warn: () => {} }).cropResolved;
};
const FOCAL = { aspectRatio: null, allowFocalPoint: true, mode: 'focal', shape: 'rect', focalPoint: null };

describe('v0.120.0 cropResolved: focal mode + focalPointOptional (QĐ7a)', () => {
  it('only true adds the key; absent / other values give the exact v0.119 focal object', () => {
    assert.deepEqual(run({ mode: 'focal' }), FOCAL);
    for (const v of [false, 'true', 1, null]) assert.deepEqual(run({ mode: 'focal', focalPointOptional: v }), FOCAL);
    assert.deepEqual(run({ mode: 'focal', focalPointOptional: true }), { ...FOCAL, focalPointOptional: true });
  });

  it('a seeded focalPoint stays alongside the flag; allowFocalPoint is not needed', () => {
    const c = run({ mode: 'focal', focalPointOptional: true, focalPoint: { x: 0.2, y: 0.7 } });
    assert.deepEqual(c, { ...FOCAL, focalPoint: { x: 0.2, y: 0.7 }, focalPointOptional: true });
  });
});
