// v0.119.0 (plan docs/internal/plans/v0.119.0-crop-output.md QĐ1-QĐ4) — pure core of the crop step's round-trip
// (`crop.initial`), optional focal point, per-call presets / ratioLabel and `crop.output: 'new-asset'`. No DOM.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveOptions, buildOutcome, parseCropInitial, cleanCropPresets, cropDerivativePayload, runCropDerivative, swapAssets,
  SelectionModel, normalizeAsset, _resetCoreWarnings,
} from './media-picker-core.js';
import { safeMediaUrl } from './media-url.js';

const adapter = (extra = {}) => ({ list: async () => ({ items: [], nextCursor: null }), get: async () => null, ...extra });
const BASE = { aspectRatio: null, allowFocalPoint: false, mode: 'box', shape: 'rect' };
const raw = (id, extra = {}) => ({
  id, kind: 'image', status: 'ready', name: `${id}.jpg`, mimeType: 'image/jpeg', byteSize: 10,
  urls: { thumbnail: `https://cdn.test/${id}-t.jpg`, preview: `https://cdn.test/${id}.jpg` }, metadata: {}, ...extra,
});
const normalize = (r) => normalizeAsset(r, { safeUrl: (u) => safeMediaUrl(u, { baseURI: 'https://site.test/', protocol: 'https:' }) });
const run = (crop, ad = adapter(), sel = { mode: 'single' }) => {
  _resetCoreWarnings();
  const warns = [];
  const c = resolveOptions({ adapter: ad }, { selection: sel, crop }, { warn: (m) => warns.push(m) }).cropResolved;
  return { c, warns };
};

describe('v0.119.0 cropResolved: initial (QĐ1)', () => {
  it('a CropValue or a plain box → initial = a fresh plain box', () => {
    const n = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
    assert.deepEqual(run({ enabled: true, initial: { normalized: n, pixels: { x: 1, y: 1, width: 1, height: 1 } } }).c, { ...BASE, initial: n });
    const plain = run({ enabled: true, mode: 'pan', initial: n }).c;
    assert.deepEqual(plain.initial, n);
    assert.notEqual(plain.initial, n);
  });

  it('null / absent → no key, no warning; invalid → no key + ONE warning', () => {
    for (const initial of [undefined, null]) {
      const { c, warns } = run({ enabled: true, initial });
      assert.deepEqual(c, BASE);
      assert.deepEqual(warns, []);
    }
    _resetCoreWarnings();
    const warns = [];
    const r = (initial) => resolveOptions({ adapter: adapter() }, { selection: { mode: 'single' }, crop: { enabled: true, initial } },
      { warn: (m) => warns.push(m) }).cropResolved;
    for (const bad of [5, 'x', [], {}, { x: 0, y: 0, width: 0, height: 1 }, { x: 0.6, y: 0, width: 0.5, height: 1 },
      { x: -0.1, y: 0, width: 0.5, height: 1 }, { normalized: { x: 'a', y: 0, width: 1, height: 1 } }, { x: NaN, y: 0, width: 1, height: 1 }]) {
      assert.deepEqual(r(bad), BASE, JSON.stringify(bad));
    }
    assert.equal(warns.length, 1);
    assert.match(warns[0], /crop\.initial/);
  });

  it('parseCropInitial accepts the full image and the ± 1e-6 edge', () => {
    assert.deepEqual(parseCropInitial({ x: 0, y: 0, width: 1, height: 1 }), { x: 0, y: 0, width: 1, height: 1 });
    assert.ok(parseCropInitial({ x: 0.5, y: 0, width: 0.5000005, height: 1 }));
    assert.equal(parseCropInitial({ x: 0.5, y: 0, width: 0.51, height: 1 }), null);
  });

  it('box / pan focalPoint: kept with allowFocalPoint only (clamped); focal mode unchanged', () => {
    assert.deepEqual(run({ enabled: true, allowFocalPoint: true, focalPoint: { x: 2, y: 0.25 } }).c,
      { ...BASE, allowFocalPoint: true, focalPoint: { x: 1, y: 0.25 } });
    assert.deepEqual(run({ enabled: true, focalPoint: { x: 0.5, y: 0.5 } }).c, BASE);
    assert.deepEqual(run({ enabled: true, allowFocalPoint: true, focalPoint: 'bad' }).c, { ...BASE, allowFocalPoint: true });
    assert.equal('initial' in run({ mode: 'focal', initial: { x: 0, y: 0, width: 1, height: 1 } }).c, false);
  });
});

describe('v0.119.0 cropResolved: focalPointOptional (QĐ2), presets / ratioLabel (QĐ3)', () => {
  it('focalPointOptional: only true adds the key (focal mode: see the v120 test)', () => {
    assert.equal(run({ enabled: true, allowFocalPoint: true, focalPointOptional: true }).c.focalPointOptional, true);
    for (const v of [false, 'true', 1, null]) assert.equal('focalPointOptional' in run({ enabled: true, focalPointOptional: v }).c, false);
  });

  it('presets: validated like TdCropper.presets (invalid dropped, order kept, empty → absent = the global default)', () => {
    const presets = [{ label: ' A ', ratio: 14 }, { label: '', ratio: 1 }, { label: 'Free', ratio: null }, { label: 'bad', ratio: -1 },
      { label: 'x', ratio: '2' }, null, 'p', { label: 'B', ratio: 9 / 16 }];
    assert.deepEqual(run({ enabled: true, presets }).c.presets, [{ label: 'A', ratio: 14 }, { label: 'Free', ratio: null }, { label: 'B', ratio: 9 / 16 }]);
    for (const p of [[], [{ label: '', ratio: 1 }], 'x', {}]) assert.equal('presets' in run({ enabled: true, presets: p }).c, false);
    assert.deepEqual(cleanCropPresets([{ label: 'z'.repeat(50), ratio: 10000 }, { label: 'y', ratio: 10001 }]), [{ label: 'z'.repeat(40), ratio: 10000 }]);
  });

  it('ratioLabel: trimmed text ≤ 40; empty / non-string → absent', () => {
    assert.equal(run({ enabled: true, aspectRatio: 14, ratioLabel: ' Banner 14:1 ' }).c.ratioLabel, 'Banner 14:1');
    assert.equal(run({ enabled: true, ratioLabel: 'q'.repeat(60) }).c.ratioLabel.length, 40);
    for (const v of ['', '  ', 5, null]) assert.equal('ratioLabel' in run({ enabled: true, ratioLabel: v }).c, false);
  });
});

describe('v0.119.0 cropResolved: output (QĐ4)', () => {
  const withMethod = () => adapter({ createCropDerivative: async () => raw('d1') });
  it("'new-asset' with the method → output key; absent / 'metadata' / unknown → no key, no warning", () => {
    const { c, warns } = run({ enabled: true, output: 'new-asset' }, withMethod());
    assert.equal(c.output, 'new-asset');
    assert.deepEqual(warns, []);
    for (const output of [undefined, 'metadata', 'nope']) assert.equal('output' in run({ enabled: true, output }, withMethod()).c, false);
  });

  it('without createCropDerivative → metadata + ONE warning', () => {
    _resetCoreWarnings();
    const warns = [];
    const r = () => resolveOptions({ adapter: adapter() }, { selection: { mode: 'single' }, crop: { enabled: true, output: 'new-asset' } },
      { warn: (m) => warns.push(m) }).cropResolved;
    assert.deepEqual(r(), BASE);
    assert.deepEqual(r(), BASE);
    assert.equal(warns.length, 1);
    assert.match(warns[0], /createCropDerivative/);
  });

  it('focal mode → metadata + ONE warning (no rect to cut)', () => {
    const { c, warns } = run({ mode: 'focal', output: 'new-asset' }, withMethod());
    assert.equal('output' in c, false);
    assert.equal(warns.length, 1);
    assert.match(warns[0], /focal/);
  });
});

describe('v0.119.0 derivative helpers (QĐ4)', () => {
  const signal = new AbortController().signal;
  it('payload: a whole-image result (crop null) → {0,0,1,1}; focal copied or null', () => {
    assert.deepEqual(cropDerivativePayload('a', { crop: null, focalPoint: null }, signal),
      { sourceAssetId: 'a', crop: { normalized: { x: 0, y: 0, width: 1, height: 1 } }, focalPoint: null, signal });
    const p = cropDerivativePayload('a', { crop: { normalized: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, pixels: {} }, focalPoint: { x: 0.5, y: 0.6 } }, signal);
    assert.deepEqual(p.crop, { normalized: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } });
    assert.deepEqual(p.focalPoint, { x: 0.5, y: 0.6 });
  });

  it('runCropDerivative: success → normalised asset; reject → err.userMessage or the label (raw message never shown); bad result → the label', async () => {
    const pay = (s = signal) => cropDerivativePayload('a', { crop: null, focalPoint: null }, s);
    const T = { normalize, error: 'ERR' };
    const seen = [];
    const ok = await runCropDerivative({ createCropDerivative: async (o) => { seen.push(o); return raw('d1'); } }, pay(), T);
    assert.equal(ok.ok, true);
    assert.equal(ok.asset.id, 'd1');
    assert.equal(seen[0].sourceAssetId, 'a');
    assert.deepEqual(await runCropDerivative({ createCropDerivative: async () => { throw Object.assign(new Error('Server says no'), { userMessage: 'Ảnh quá nhỏ' }); } }, pay(), T), { ok: false, message: 'Ảnh quá nhỏ' });
    assert.deepEqual(await runCropDerivative({ createCropDerivative: async () => { throw new Error('SQLSTATE 42S02 raw'); } }, pay(), T), { ok: false, message: 'ERR' });
    assert.deepEqual(await runCropDerivative({ createCropDerivative: () => { throw 'x'; } }, pay(), T), { ok: false, message: 'ERR' });
    assert.deepEqual(await runCropDerivative({ createCropDerivative: async () => { throw { message: 5 }; } }, pay(), T), { ok: false, message: 'ERR' });
    for (const bad of [null, 5, 'd1', {}, { id: '' }, { name: 'x' }]) {
      assert.deepEqual(await runCropDerivative({ createCropDerivative: async () => bad }, pay(), T), { ok: false, message: 'ERR' }, JSON.stringify(bad));
    }
    const ctrl = new AbortController();
    const late = runCropDerivative({ createCropDerivative: async () => { ctrl.abort(); return raw('d1'); } }, pay(ctrl.signal), T);
    assert.deepEqual(await late, { ok: false, aborted: true });
    const ab = runCropDerivative({ createCropDerivative: async () => { throw Object.assign(new Error('a'), { name: 'AbortError' }); } }, pay(), T);
    assert.deepEqual(await ab, { ok: false, aborted: true });
  });

  it('swapAssets / SelectionModel.swap: same position, a duplicate id dropped; no revision bump', () => {
    const A = { id: 'a' }; const B = { id: 'b' }; const C = { id: 'c' }; const D = { id: 'd' };
    assert.deepEqual(swapAssets([A, B, C], 'b', D).map((x) => x.id), ['a', 'd', 'c']);
    assert.deepEqual(swapAssets([A, B, C], 'b', { id: 'c' }).map((x) => x.id), ['a', 'c']);
    assert.deepEqual(swapAssets([C, A, B], 'b', { id: 'c' }).map((x) => x.id), ['a', 'c']);
    const m = new SelectionModel({ mode: 'multiple' });
    m.add(A); m.add(B); m.add(C);
    const rev = m.revision;
    m.swap('b', D);
    assert.deepEqual(m.ids, ['a', 'd', 'c']);
    assert.equal(m.revision, rev);
    m.swap('zz', B);
    assert.deepEqual(m.ids, ['a', 'd', 'c']);
  });

  it('buildOutcome: derivedFromAssetId only when given (the metadata usage shape is unchanged)', () => {
    const m = new SelectionModel();
    m.add(normalize(raw('a', { defaultAltText: 'Alt' })));
    assert.deepEqual(Object.keys(buildOutcome(m).selection[0].usage), ['altText', 'crop', 'focalPoint']);
    const d = normalize(raw('d1'));
    const o = buildOutcome({ assets: swapAssets(m.assets, 'a', d) }, new Map([['d1', { crop: null, focalPoint: null, derivedFromAssetId: 'a' }]]));
    assert.equal(o.selection[0].assetId, 'd1');
    assert.deepEqual(o.selection[0].usage, { altText: '', crop: null, focalPoint: null, derivedFromAssetId: 'a' });
    assert.deepEqual(m.ids, ['a'], 'provisional: the live model is untouched');
  });
});
