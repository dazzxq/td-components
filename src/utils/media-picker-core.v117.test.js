// v0.117.0 (plan docs/internal/plans/v0.117.0-dcms2-create-row-minsize.md QĐ3 / QĐ4) — pure core of the media picker's
// `selection.minSize` (validation, eligibility) and `beforeApply` (how the hook settles). No DOM.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveOptions, parseMinSize, minSizeReason, cropMeetsMin, runBeforeApply, InitialLoad, SelectionModel, MIN_SIZE_MAX,
} from './media-picker-core.js';

const adapter = () => ({ list: async () => ({ items: [], nextCursor: null }), get: async () => null });
const img = (width, height, extra = {}) => ({ id: 'a', kind: 'image', status: 'ready', width, height, ...extra });
const flush = () => new Promise((r) => setTimeout(r, 0));
const TEXT = { rejected: 'REJ', failed: 'FAIL' };

describe('selection.minSize — validation (QĐ3)', () => {
  it('absent / null → no minSize key (the old selection shape)', () => {
    for (const minSize of [undefined, null]) {
      const o = resolveOptions(null, { adapter: adapter(), selection: { mode: 'single', minSize } });
      assert.equal('minSize' in o.selection, false);
    }
    assert.deepEqual(Object.keys(resolveOptions(null, { adapter: adapter() }).selection), ['mode', 'maxItems', 'initialIds', 'kinds']);
  });

  it('valid → a fresh object with only the given axes', () => {
    const src = { width: 800, height: 600, extra: 1 };
    const o = resolveOptions(null, { adapter: adapter(), selection: { mode: 'single', minSize: src } });
    assert.deepEqual(o.selection.minSize, { width: 800, height: 600 });
    assert.notEqual(o.selection.minSize, src);
    assert.deepEqual(parseMinSize({ width: 1 }), { width: 1 });
    assert.deepEqual(parseMinSize({ height: MIN_SIZE_MAX }), { height: 100000 });
    assert.deepEqual(parseMinSize({ width: 5, height: undefined }), { width: 5 });
    assert.equal(parseMinSize(null), null, 'minSize: null as a whole stays valid');
  });

  it('bad shapes → TypeError at resolve (open) time', () => {
    const bad = [{}, { width: 0 }, { width: -1 }, { width: 1.5 }, { height: 100001 }, { width: '800' }, { width: NaN },
      { width: Infinity }, { width: null, height: null }, { width: 5, height: null }, { width: null }, { height: null, width: 800 },
      5, 'x', [800, 600], true];
    for (const minSize of bad) {
      assert.throws(() => resolveOptions(null, { adapter: adapter(), selection: { mode: 'single', minSize } }), TypeError,
        `rejects ${JSON.stringify(minSize)}`);
    }
  });

  it('never from configureDefaults (selection is per open)', () => {
    const o = resolveOptions({ adapter: adapter(), selection: { mode: 'single', minSize: { width: 10 } } });
    assert.equal('minSize' in o.selection, false);
  });
});

describe('beforeApply — option (QĐ4)', () => {
  it('a function passes through, from defaults or open(); anything else is ignored', () => {
    const f = () => true;
    const g = () => false;
    assert.equal(resolveOptions({ adapter: adapter(), beforeApply: f }).beforeApply, f);
    assert.equal(resolveOptions({ adapter: adapter(), beforeApply: f }, { beforeApply: g }).beforeApply, g);
    assert.equal(resolveOptions({ adapter: adapter(), beforeApply: 'x' }).beforeApply, undefined);
    assert.equal(resolveOptions({ adapter: adapter() }).beforeApply, undefined);
  });
});

describe('minSizeReason — eligibility (QĐ3)', () => {
  const both = { width: 800, height: 600 };
  it('no minSize / not an image → eligible (video and file untouched)', () => {
    assert.equal(minSizeReason(img(10, 10), null), null);
    assert.equal(minSizeReason(img(10, 10, { kind: 'video' }), both), null);
    assert.equal(minSizeReason({ id: 'f', kind: 'file' }, both), null);
    assert.equal(minSizeReason(null, both), null);
  });

  it('no crop: each axis of the source', () => {
    assert.equal(minSizeReason(img(800, 600), both), null);
    assert.equal(minSizeReason(img(1200, 800), both), null);
    assert.equal(minSizeReason(img(799, 600), both), 'small');
    assert.equal(minSizeReason(img(800, 599), both), 'small');
  });

  it('one axis only: the other one is ignored (even unknown)', () => {
    assert.equal(minSizeReason(img(800, undefined), { width: 800 }), null);
    assert.equal(minSizeReason(img(799, 5000), { width: 800 }), 'small');
    assert.equal(minSizeReason(img(undefined, 600), { height: 600 }), null);
    assert.equal(minSizeReason(img(5000, 599), { height: 600 }), 'small');
  });

  it('a needed dimension missing / not positive → unknown', () => {
    assert.equal(minSizeReason(img(undefined, 600), both), 'unknown');
    assert.equal(minSizeReason(img(800, 0), both), 'unknown');
    assert.equal(minSizeReason(img(undefined, 600), { width: 1 }), 'unknown');
    assert.equal(minSizeReason(img(800, undefined), { height: 1 }), 'unknown');
  });

  it('focal-only and free crop: only the source test (a free crop can always be the whole image)', () => {
    const focal = { aspectRatio: null, mode: 'focal' };
    const free = { aspectRatio: null, mode: 'box' };
    assert.equal(minSizeReason(img(800, 600), both, focal), null);
    assert.equal(minSizeReason(img(799, 600), both, focal), 'small');
    assert.equal(minSizeReason(img(800, 600), both, free), null);
    assert.equal(minSizeReason(img(700, 600), both, free), 'small', 'free crop on a source smaller than minSize');
  });

  it('fixed ratio: the largest crop of that ratio must meet both minima', () => {
    const r169 = { aspectRatio: 16 / 9, mode: 'box' };
    // 1200 × 800 at 16:9 → 1200 × 675
    assert.equal(minSizeReason(img(1200, 800), { width: 1200, height: 675 }, r169), null);
    assert.equal(minSizeReason(img(1200, 800), { width: 1200, height: 676 }, r169), 'small');
    // a tall source: 1000 × 2000 at 1:1 → 1000 × 1000 (source passes 900 × 1100, the square does not)
    assert.equal(minSizeReason(img(1000, 2000), { width: 900, height: 1100 }, { aspectRatio: 1, mode: 'pan' }), 'small');
    assert.equal(minSizeReason(img(1000, 2000), { width: 900, height: 1000 }, { aspectRatio: 1, mode: 'pan' }), null);
    // one axis with a ratio: the fit still needs both sides
    assert.equal(minSizeReason(img(1200, undefined), { width: 100 }, r169), 'unknown');
    // the focal mode ignores a ratio
    assert.equal(minSizeReason(img(1000, 2000), { width: 900, height: 1100 }, { aspectRatio: 1, mode: 'focal' }), null);
  });

  it('cropMeetsMin', () => {
    assert.equal(cropMeetsMin(800, 600, { width: 800, height: 600 }), true);
    assert.equal(cropMeetsMin(799, 600, { width: 800, height: 600 }), false);
    assert.equal(cropMeetsMin(10, 599, { height: 600 }), false);
    assert.equal(cropMeetsMin(10, 10, null), true);
  });
});

describe('runBeforeApply — how the hook settles (QĐ4)', () => {
  const run = (hook, ctrl = new AbortController(), errors = []) =>
    runBeforeApply(hook, [{ assetId: 'a' }], ctrl.signal, { ...TEXT, error: (e) => errors.push(e) });

  it('called once with the selection and the signal', async () => {
    const calls = [];
    const ctrl = new AbortController();
    const sel = [{ assetId: 'x' }];
    const r = await runBeforeApply((s, ctx) => { calls.push([s, ctx]); }, sel, ctrl.signal, TEXT);
    assert.deepEqual(r, { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], sel);
    assert.equal(calls[0][1].signal, ctrl.signal);
  });

  it('undefined / true / any non-false value (sync or async) → proceed', async () => {
    for (const v of [undefined, true, 0, '', null, {}]) {
      assert.deepEqual(await run(() => v), { ok: true });
      assert.deepEqual(await run(async () => v), { ok: true });
    }
  });

  it('false → applyRejected', async () => {
    assert.deepEqual(await run(() => false), { ok: false, message: 'REJ' });
    assert.deepEqual(await run(async () => false), { ok: false, message: 'REJ' });
  });

  it('a throw / rejection with userMessage → that text (cut to 200), not logged', async () => {
    const errors = [];
    assert.deepEqual(await run(() => { throw Object.assign(new Error('raw'), { userMessage: 'Trùng tên' }); }, undefined, errors),
      { ok: false, message: 'Trùng tên' });
    assert.deepEqual(await run(async () => { throw { userMessage: 'Không hợp lệ' }; }, undefined, errors),
      { ok: false, message: 'Không hợp lệ' });
    const long = await run(() => Promise.reject({ userMessage: 'x'.repeat(300) }));
    assert.equal(long.message.length, 200);
    assert.equal(errors.length, 0);
  });

  it('any other error → logged + applyFailed (the raw text never shown)', async () => {
    const errors = [];
    const e = new Error('SQLSTATE secret');
    const r = await run(() => { throw e; }, undefined, errors);
    assert.deepEqual(r, { ok: false, message: 'FAIL' });
    assert.deepEqual(errors, [e]);
    assert.deepEqual(await run(async () => { throw { userMessage: '   ' }; }, undefined, errors), { ok: false, message: 'FAIL' });
  });

  it('AbortError / an aborted signal → silent', async () => {
    const errors = [];
    const abortErr = Object.assign(new Error('a'), { name: 'AbortError' });
    assert.deepEqual(await run(() => { throw abortErr; }, undefined, errors), { ok: false, aborted: true });
    const ctrl = new AbortController();
    const p = run(() => new Promise((res) => setTimeout(() => res(true), 5)), ctrl, errors);
    ctrl.abort();
    assert.deepEqual(await p, { ok: false, aborted: true }, 'a late success after abort is dropped');
    const c2 = new AbortController();
    const p2 = run(() => new Promise((res, rej) => setTimeout(() => rej(new Error('x')), 5)), c2, errors);
    c2.abort();
    assert.deepEqual(await p2, { ok: false, aborted: true });
    assert.equal(errors.length, 0);
  });
});

describe('InitialLoad accept (QĐ3: initialIds skip an ineligible asset)', () => {
  it('a refused asset is not applied; without accept everything is (old path)', async () => {
    const assets = { a: { id: 'a', kind: 'image', status: 'ready', width: 10, height: 10 },
      b: { id: 'b', kind: 'image', status: 'ready', width: 900, height: 900 } };
    const mk = (accept) => {
      const model = new SelectionModel({ mode: 'multiple' });
      const applied = [];
      const il = new InitialLoad({ ids: ['a', 'b'], model, get: async (id) => assets[id], onApply: (x) => applied.push(x),
        warn: () => {}, ...(accept ? { accept } : {}) });
      il.start();
      return { model, applied };
    };
    const f = mk((a) => !minSizeReason(a, { width: 800 }));
    const n = mk(null);
    await flush();
    assert.deepEqual(f.model.ids, ['b']);
    assert.deepEqual(n.model.ids, ['a', 'b']);
  });
});
