// v0.32.0 (plan docs/internal/plans/v0.32.0-media-picker.md M1) — pure core of <td-media-picker>: DTO normalisation,
// error normalisation (decision 8), capabilities (2, 5), option resolution + defaults registry (6), list requests,
// latest-request-wins (9), selection model + capacity (13), initialIds transaction (15), debouncer, caches, scalar
// tokens (22), outcome (7). No DOM.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAsset, normalizePage, normalizeFacets, normalizeFields, normalizeError, resolveCapabilities, canDo,
  resolveOptions, DefaultsRegistry, buildListRequest, requestKey, LatestRequest, SelectionModel, InitialLoad, Debouncer,
  SessionCache, ScalarTokens, buildOutcome, cancelledOutcome, formatLabel, LIMITS, VALUE_LIMITS, normalizeOptions,
  validateRemoteUrl, normalizeDeleteResult, normalizeDownloadResult, safeFilename, defaultTitle, normalizeUploadResult,
  PageState, PAGE_SIZE_DEFAULT, REMOTE_URL_MAX, _resetCoreWarnings,
} from './media-picker-core.js';
import { safeMediaUrl } from './media-url.js';

const safeUrl = (u) => safeMediaUrl(u, { baseURI: 'https://site.test/', protocol: 'https:' });
const quiet = () => {};
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const raw = (id, extra = {}) => ({
  id, kind: 'image', status: 'ready', name: `${id}.jpg`, mimeType: 'image/jpeg', byteSize: 10,
  urls: { thumbnail: `https://cdn.test/${id}-t.jpg`, preview: `https://cdn.test/${id}.jpg` }, metadata: {}, ...extra,
});
const adapter = (extra = {}) => ({ list: async () => ({ items: [], nextCursor: null }), get: async (id) => raw(id), ...extra });

describe('normalizeAsset', () => {
  it('valid asset → normalised copy', () => {
    const a = normalizeAsset(raw('a1', { width: 30, height: 20, defaultAltText: 'Alt', version: 3,
      badges: [{ key: 'k', label: 'Mới', tone: 'success' }, { key: 'x', label: 5 }, { key: 'y', label: 'Lạ', tone: 'pink' }],
      capabilities: { editMetadata: false, bogus: 1 }, metadata: { a: 1, b: 2 } }), { safeUrl, metadataKeys: ['a', 'zz'] });
    assert.equal(a.id, 'a1');
    assert.equal(a.kind, 'image');
    assert.equal(a.width, 30);
    assert.equal(a.defaultAltText, 'Alt');
    assert.equal(a.version, 3);
    assert.deepEqual(a.badges, [{ key: 'k', label: 'Mới', tone: 'success' }, { key: 'y', label: 'Lạ', tone: 'neutral' }]);
    assert.deepEqual(a.capabilities, { editMetadata: false });
    assert.deepEqual(a.metadata, { a: 1 });
    assert.equal(a.urls.preview, 'https://cdn.test/a1.jpg');
  });

  it('missing id / bad kind / bad status / not an object → null', () => {
    assert.equal(normalizeAsset(raw(''), { safeUrl }), null);
    assert.equal(normalizeAsset({ ...raw('a'), id: 5 }, { safeUrl }), null);
    assert.equal(normalizeAsset(raw('a', { kind: 'audio' }), { safeUrl }), null);
    assert.equal(normalizeAsset(raw('a', { status: 'done' }), { safeUrl }), null);
    assert.equal(normalizeAsset(null, { safeUrl }), null);
    assert.equal(normalizeAsset('a', { safeUrl }), null);
  });

  it('javascript: / data: URLs → empty urls, never throws', () => {
    const a = normalizeAsset(raw('a', { urls: { thumbnail: 'javascript:alert(1)', preview: 'data:image/png;base64,AA' } }), { safeUrl });
    assert.deepEqual(a.urls, { thumbnail: '', preview: '' });
    const b = normalizeAsset(raw('b', { urls: null }), { safeUrl });
    assert.deepEqual(b.urls, { thumbnail: '', preview: '' });
  });

  it('a throwing getter → null (no throw)', () => {
    const evil = raw('a');
    Object.defineProperty(evil, 'name', { get() { throw new Error('x'); }, enumerable: true });
    assert.equal(normalizeAsset(evil, { safeUrl }), null);
  });
});

describe('normalizePage', () => {
  it('duplicate ids → the first; invalid items dropped; cursor / total', () => {
    const p = normalizePage({ items: [raw('a'), raw('b'), raw('a', { name: 'dup' }), { id: '' }], nextCursor: 'c2', total: 9 },
      { safeUrl, warn: quiet });
    assert.deepEqual(p.items.map((x) => x.id), ['a', 'b']);
    assert.equal(p.items[0].name, 'a.jpg');
    assert.equal(p.nextCursor, 'c2');
    assert.equal(p.total, 9);
  });

  it('no cursor / bad total → null / undefined', () => {
    const p = normalizePage({ items: [], nextCursor: '', total: -1 }, { safeUrl, warn: quiet });
    assert.equal(p.nextCursor, null);
    assert.equal(p.total, undefined);
  });

  it('kinds filter hides other kinds (one warning per call)', () => {
    const warns = [];
    const p = normalizePage({ items: [raw('a'), raw('v', { kind: 'video' }), raw('f', { kind: 'file' })], nextCursor: null },
      { safeUrl, kinds: ['image'], warn: (m) => warns.push(m) });
    assert.deepEqual(p.items.map((x) => x.id), ['a']);
    assert.equal(p.hidden, 2);
  });

  it('not an object / items not an array → throws code server', () => {
    for (const bad of [null, 'x', 5, { items: 'no' }]) {
      assert.throws(() => normalizePage(bad, { safeUrl, warn: quiet }), (e) => e.code === 'server');
    }
  });
});

describe('normalizeFacets / normalizeFields', () => {
  it('facets: bad descriptors dropped, duplicate key → first, options normalised', () => {
    const warns = [];
    const f = normalizeFacets([
      { key: 'album', label: 'Album', type: 'single', options: [{ value: 1, label: 'A', count: 12 }, { value: { x: 1 }, label: 'bad' }, { value: null, label: 'Không album' }] },
      { key: 'album', label: 'Dup', type: 'single', options: [] },
      { key: 'scope', label: 'Phạm vi', type: 'toggle', options: [{ value: 'mine', label: 'Của tôi' }] },
      { key: '', label: 'x', type: 'single', options: [] },
      { key: 't', label: 'x', type: 'range', options: [] },
      'junk',
    ], { warn: (m) => warns.push(m) });
    assert.deepEqual(f.map((x) => x.key), ['album', 'scope']);
    assert.deepEqual(f[0].options, [{ value: 1, label: 'A', count: 12, disabled: false }, { value: null, label: 'Không album', disabled: false }]);
    assert.ok(warns.length >= 1);
    assert.deepEqual(normalizeFacets('x', { warn: quiet }), []);
  });

  it('fields: control enum, functions kept, duplicate key → first', () => {
    const lo = async () => [];
    const vw = () => true;
    const f = normalizeFields([
      { key: 'alt', label: 'Alt', control: 'text', required: true, helpText: 'Gợi ý' },
      { key: 'license', label: 'Giấy phép', control: 'select', options: [{ value: 'cc', label: 'CC' }], loadOptions: lo, visibleWhen: vw },
      { key: 'alt', label: 'dup', control: 'text' },
      { key: 'x', label: 'x', control: 'html' },
      { key: 'y', label: '<b>', control: 'readonly' },
    ], { warn: quiet });
    assert.deepEqual(f.map((x) => x.key), ['alt', 'license', 'y']);
    assert.equal(f[0].required, true);
    assert.equal(f[1].loadOptions, lo);
    assert.equal(f[1].visibleWhen, vw);
    assert.equal(f[2].label, '<b>');
  });
});

describe('normalizeError (decision 8)', () => {
  it('AbortError / aborted signal → null', () => {
    const ac = new AbortController();
    ac.abort();
    assert.equal(normalizeError(new Error('x'), ac.signal, { warn: quiet }), null);
    const e = new Error('aborted');
    e.name = 'AbortError';
    assert.equal(normalizeError(e, undefined, { warn: quiet }), null);
    assert.equal(normalizeError(new DOMException('a', 'AbortError'), null, { warn: quiet }), null);
  });

  it('unknown code → server; raw message never surfaces', () => {
    const e = Object.assign(new Error('SQLSTATE[42S02] users table'), { code: 'EBADF' });
    const n = normalizeError(e, null, { warn: quiet });
    assert.equal(n.code, 'server');
    assert.equal(n.userMessage, '');
    assert.ok(!JSON.stringify([...n.fieldErrors]).includes('SQLSTATE'));
    assert.equal(n.retryable, true);
  });

  it('userMessage trimmed + cut at 200 code points', () => {
    const n = normalizeError({ code: 'validation', userMessage: `  ${'😀'.repeat(250)} ` }, null, { warn: quiet });
    assert.equal([...n.userMessage].length, 200);
    assert.equal(n.code, 'validation');
    assert.equal(n.retryable, false);
  });

  it('fieldErrors: own string keys, __proto__ / constructor dropped, arrays of strings, ≤ 5 × 200', () => {
    const fe = JSON.parse('{"__proto__":["x"],"constructor":["y"],"license":["a","b","c","d","e","f"],"title":"no","tags":[1,"ok"],"long":[""]}');
    fe.big = [`${'x'.repeat(300)}`];
    const n = normalizeError({ code: 'validation', fieldErrors: fe }, null, { warn: quiet });
    assert.deepEqual([...n.fieldErrors.keys()].sort(), ['big', 'license', 'tags']);
    assert.equal(n.fieldErrors.get('license').length, 5);
    assert.deepEqual(n.fieldErrors.get('tags'), ['ok']);
    assert.equal(n.fieldErrors.get('big')[0].length, 200);
  });

  it('retryable defaults: network / rate-limited / server true; explicit boolean wins', () => {
    assert.equal(normalizeError({ code: 'network' }, null, { warn: quiet }).retryable, true);
    assert.equal(normalizeError({ code: 'rate-limited' }, null, { warn: quiet }).retryable, true);
    assert.equal(normalizeError({ code: 'forbidden' }, null, { warn: quiet }).retryable, false);
    assert.equal(normalizeError({ code: 'network', retryable: false }, null, { warn: quiet }).retryable, false);
  });

  it('review SEC-2: the warning carries only the operation + code (never the raw error / response / url)', () => {
    const warns = [];
    const SECRET = 'tok_SECRET_123';
    const err = Object.assign(new Error(`boom ${SECRET}`), { code: 'forbidden', response: { body: SECRET }, url: `https://x/?t=${SECRET}` });
    const n = normalizeError(err, null, { warn: (...a) => warns.push(a), operation: 'list' });
    assert.equal(n.code, 'forbidden');
    assert.equal(warns.length, 1);
    assert.ok(warns[0].every((a) => typeof a === 'string' && !a.includes(SECRET)));
    assert.match(warns[0].join(' '), /list/);
    assert.match(warns[0].join(' '), /forbidden/);
    const w2 = [];
    assert.equal(normalizeError('boom', null, { warn: (...a) => w2.push(a) }).code, 'server');
    assert.ok(w2[0].every((a) => typeof a === 'string' && !a.includes('boom')));
  });
});

describe('capabilities (decisions 2, 5)', () => {
  it('missing caps → inferred from methods', () => {
    assert.deepEqual(resolveCapabilities(adapter(), undefined),
      { search: true, upload: false, editMetadata: false, delete: false, downloadOriginal: false, uploadFromUrl: false, copyLink: false });
    const full = adapter({ upload: async () => {}, update: async () => {}, delete: async () => {} });
    assert.deepEqual(resolveCapabilities(full, null),
      { search: true, upload: true, editMetadata: true, delete: false, downloadOriginal: false, uploadFromUrl: false, copyLink: false });
  });

  it('flag true without the method → false; flag false hides', () => {
    assert.equal(resolveCapabilities(adapter(), { upload: true }).upload, false);
    assert.equal(resolveCapabilities(adapter({ upload: async () => {} }), { upload: false }).upload, false);
    assert.equal(resolveCapabilities(adapter(), { search: false }).search, false);
  });

  it('per-asset caps only narrow', () => {
    const ad = adapter({ update: async () => {} });
    assert.equal(canDo('editMetadata', ad, undefined, { capabilities: { editMetadata: false } }), false);
    assert.equal(canDo('editMetadata', ad, { editMetadata: false }, { capabilities: { editMetadata: true } }), false);
    assert.equal(canDo('editMetadata', ad, undefined, { capabilities: {} }), true);
    assert.equal(canDo('editMetadata', adapter(), undefined, { capabilities: { editMetadata: true } }), false);
    assert.equal(canDo('upload', adapter({ upload: async () => {} }), undefined, null), true);
  });
});

describe('resolveOptions + DefaultsRegistry (decision 6)', () => {
  it('precedence: later layers win (open() > pickerOptions > field.adapter > defaults); undefined skipped', () => {
    const a1 = adapter();
    const a2 = adapter();
    const o = resolveOptions({ adapter: a1, pageSize: 20, context: 'd' }, { adapter: a2 }, { pageSize: undefined, title: 'T' },
      { selection: { mode: 'multiple', maxItems: 3 } });
    assert.equal(o.adapter, a2);
    assert.equal(o.pageSize, 20);
    assert.equal(o.context, 'd');
    assert.equal(o.title, 'T');
    assert.equal(o.selection.mode, 'multiple');
    assert.equal(o.selection.maxItems, 3);
  });

  it('selection never comes from the defaults', () => {
    const o = resolveOptions({ adapter: adapter(), selection: { mode: 'multiple' } });
    assert.equal(o.selection.mode, 'single');
  });

  it('normalises selection / pageSize / upload / crop', () => {
    const warns = [];
    const o = resolveOptions({ adapter: adapter() }, {
      pageSize: 500, upload: { accept: 'image/*', multiple: false }, crop: { enabled: true },
      selection: { mode: 'single', initialIds: ['a', 'b', 'a', 5, ''], kinds: ['video', 'zip'] },
    }, { warn: (m) => warns.push(m) });
    assert.equal(o.pageSize, 100);
    assert.deepEqual(o.selection.initialIds, ['a']);
    assert.equal(o.selection.maxItems, 1);
    assert.deepEqual(o.selection.kinds, ['video']);
    assert.deepEqual(o.upload, { accept: 'image/*', maxSize: '', multiple: false, acceptLabel: '' });
    assert.equal(o.cropRequested, true);
    assert.ok(warns.some((w) => /v0\.35/.test(w)), 'v0.33 decision 2: crop ships in v0.35');
    assert.ok(!warns.some((w) => /v0\.33/.test(w)));
    const m = resolveOptions({ adapter: adapter() }, { selection: { mode: 'multiple', maxItems: 2, initialIds: ['a', 'b', 'c'] } });
    assert.deepEqual(m.selection.initialIds, ['a', 'b']);
    assert.equal(resolveOptions({ adapter: adapter() }).pageSize, 30, 'v0.33 decision 13: dcms2 page size');
    assert.equal(PAGE_SIZE_DEFAULT, 30);
    assert.equal(resolveOptions({ adapter: adapter() }, { pageSize: 0 }).pageSize, 1);
  });

  it('missing / invalid adapter → TypeError', () => {
    assert.throws(() => resolveOptions({}), TypeError);
    assert.throws(() => resolveOptions({ adapter: { list() {} } }), TypeError);
  });

  it('configure replaces the WHOLE default object; get() is a shallow copy', () => {
    const reg = new DefaultsRegistry();
    const ad = adapter();
    reg.configure({ adapter: ad, pageSize: 10, context: { site: 1 } });
    reg.configure({ adapter: ad });
    assert.equal(reg.get().pageSize, undefined);
    const copy = reg.get();
    copy.adapter = null;
    assert.equal(reg.get().adapter, ad);
    assert.throws(() => reg.configure({ adapter: { list() {} } }), TypeError);
    assert.equal(reg.get().adapter, ad); // a refused configure keeps the previous defaults
    reg.configure({});
    assert.deepEqual(reg.get(), {});
    reg.configure(null);
    assert.deepEqual(reg.get(), {});
  });
});

describe('buildListRequest / requestKey', () => {
  it('copies filters one level deep (caller object untouched), cursor default null, kinds, no sort', () => {
    const filters = { tags: ['a', 'b'], album: 1 };
    const ac = new AbortController();
    const r = buildListRequest({ query: ' q ', filters, pageSize: 40, context: { x: 1 }, kinds: ['image'] }, { signal: ac.signal });
    r.filters.tags.push('c');
    r.filters.album = 2;
    assert.deepEqual(filters, { tags: ['a', 'b'], album: 1 });
    assert.equal(r.cursor, null);
    assert.equal(r.limit, 40);
    assert.equal(r.query, 'q');
    assert.deepEqual(r.kinds, ['image']);
    assert.equal(r.signal, ac.signal);
    assert.equal('sort' in r, false);
    assert.equal(buildListRequest({ query: '', filters: {}, pageSize: 5 }, { cursor: 'c2' }).cursor, 'c2');
  });

  it('requestKey: same query/filters/cursor → same key, filter order irrelevant, typed values distinct', () => {
    const s = (filters, query = 'a') => ({ query, filters, pageSize: 40, kinds: null });
    assert.equal(requestKey(s({ a: 1, b: 2 })), requestKey(s({ b: 2, a: 1 })));
    assert.notEqual(requestKey(s({ a: 1 })), requestKey(s({ a: '1' })));
    assert.notEqual(requestKey(s({})), requestKey(s({}), 'c2'));
    assert.notEqual(requestKey(s({}, 'a')), requestKey(s({}, 'b')));
  });
});

describe('LatestRequest (decision 9)', () => {
  it('3 requests resolved in reverse order → only the last is fresh; older signals aborted', async () => {
    const lr = new LatestRequest();
    const ds = [deferred(), deferred(), deferred()];
    const signals = [];
    const outs = ds.map((d) => lr.run((signal) => { signals.push(signal); return d.promise; }));
    assert.deepEqual(signals.map((s) => s.aborted), [true, true, false]);
    ds[2].resolve('c');
    ds[1].resolve('b');
    ds[0].resolve('a');
    const res = await Promise.all(outs);
    assert.deepEqual(res.map((r) => r.stale), [true, true, false]);
    assert.equal(res[2].value, 'c');
    assert.equal(res[0].value, undefined);
  });

  it('an adapter that ignores the signal is still dropped', async () => {
    const lr = new LatestRequest();
    const d1 = deferred();
    const p1 = lr.run(() => d1.promise); // ignores signal
    const p2 = lr.run(async () => 'new');
    d1.resolve('old');
    assert.deepEqual(await p1, { stale: true });
    assert.deepEqual(await p2, { stale: false, value: 'new' });
  });

  it('abort() → every later settle is stale; errors are fresh results, never rejections', async () => {
    const lr = new LatestRequest();
    const d = deferred();
    let sig;
    const p = lr.run((s) => { sig = s; return d.promise; });
    lr.abort();
    assert.equal(sig.aborted, true);
    d.reject(new Error('late'));
    assert.deepEqual(await p, { stale: true });
    const e = new Error('x');
    const q = await lr.run(() => { throw e; });
    assert.deepEqual(q, { stale: false, error: e });
    assert.equal(lr.pending, false);
  });

  it('pending reflects the running request', async () => {
    const lr = new LatestRequest();
    const d = deferred();
    const p = lr.run(() => d.promise);
    assert.equal(lr.pending, true);
    d.resolve(1);
    await p;
    assert.equal(lr.pending, false);
  });
});

describe('SelectionModel (decision 13)', () => {
  const A = { id: 'a' }; const B = { id: 'b' }; const C = { id: 'c' }; const D = { id: 'd' };

  it('single: add replaces; revision bumps on every user change', () => {
    const m = new SelectionModel({ mode: 'single' });
    assert.equal(m.max, 1);
    m.add(A);
    const r1 = m.revision;
    m.add(B);
    assert.deepEqual(m.ids, ['b']);
    assert.ok(m.revision > r1);
    const r2 = m.revision;
    m.add(B); // no change
    assert.equal(m.revision, r2);
    m.remove('zz');
    assert.equal(m.revision, r2);
    m.toggle(B);
    assert.deepEqual(m.ids, []);
  });

  it('multiple: cap, selection order, replace, clear', () => {
    const m = new SelectionModel({ mode: 'multiple', max: 3 });
    assert.equal(m.add(C), true);
    m.add(A);
    m.add(B);
    assert.equal(m.add(D), false);
    assert.deepEqual(m.ids, ['c', 'a', 'b']);
    m.remove('a');
    m.add(D);
    assert.deepEqual(m.ids, ['c', 'b', 'd']);
    m.replace(A);
    assert.deepEqual(m.ids, ['a']);
    const r = m.revision;
    assert.equal(m.clear(), true);
    assert.ok(m.revision > r);
    assert.equal(m.clear(), false);
  });

  it('update() swaps a snapshot without a revision change', () => {
    const m = new SelectionModel({ mode: 'multiple' });
    m.add(A);
    const r = m.revision;
    m.update({ id: 'a', name: 'Z' });
    m.update({ id: 'zz' });
    assert.equal(m.get('a').name, 'Z');
    assert.equal(m.revision, r);
    assert.deepEqual(m.ids, ['a']);
  });

  it('capacity: gridMax null for single / unlimited / 0 left; never 0', () => {
    assert.deepEqual(new SelectionModel({ mode: 'single' }).capacity(['a']), { gridMax: null, remaining: 1 });
    const u = new SelectionModel({ mode: 'multiple' });
    u.add(A);
    assert.deepEqual(u.capacity(['a']), { gridMax: null, remaining: Infinity });
    const m = new SelectionModel({ mode: 'multiple', max: 3 });
    m.add(A); m.add(B); m.add(C);
    assert.deepEqual(m.capacity(['x', 'y']), { gridMax: null, remaining: 0 }); // all outside the view
    assert.deepEqual(m.capacity(['a', 'x']), { gridMax: 1, remaining: 0 }); // a is in the grid → grid may keep 1
    m.remove('c');
    assert.deepEqual(m.capacity(['x']), { gridMax: 1, remaining: 1 });
    assert.deepEqual(m.capacity(['a', 'b', 'x']), { gridMax: 3, remaining: 1 });
  });

  it('applyInitial: refused once the revision moved; keeps the given order; no revision change', () => {
    const m = new SelectionModel({ mode: 'multiple', max: 2 });
    const rev0 = m.revision;
    assert.equal(m.applyInitial([B, A, C], rev0), true);
    assert.deepEqual(m.ids, ['b', 'a']);
    assert.equal(m.revision, rev0);
    const n = new SelectionModel({ mode: 'multiple' });
    const r0 = n.revision;
    n.add(D);
    assert.equal(n.applyInitial([A], r0), false);
    assert.deepEqual(n.ids, ['d']);
  });
});

describe('InitialLoad (decision 15)', () => {
  const mk = (ids, model, impl) => {
    const calls = [];
    const applied = [];
    const load = new InitialLoad({
      ids,
      model,
      get: (id, signal) => { calls.push({ id, signal }); return impl(id, signal); },
      onApply: (assets) => applied.push(assets.map((a) => a.id)),
      warn: quiet,
    });
    return { load, calls, applied };
  };

  it('resolves c, a, b → applied ONCE in initialIds order', async () => {
    const m = new SelectionModel({ mode: 'multiple' });
    const ds = { a: deferred(), b: deferred(), c: deferred() };
    const { load, calls, applied } = mk(['a', 'b', 'c'], m, (id) => ds[id].promise);
    load.start();
    assert.equal(calls.length, 3);
    assert.equal(load.pending, true);
    ds.c.resolve({ id: 'c' });
    await flush();
    ds.a.resolve({ id: 'a' });
    await flush();
    assert.deepEqual(applied, []);
    ds.b.resolve({ id: 'b' });
    await flush();
    assert.deepEqual(applied, [['a', 'b', 'c']]);
    assert.deepEqual(m.ids, ['a', 'b', 'c']);
    assert.equal(load.pending, false);
  });

  it('get(b) rejects → b skipped', async () => {
    const m = new SelectionModel({ mode: 'multiple' });
    const { load } = mk(['a', 'b', 'c'], m, async (id) => { if (id === 'b') throw new Error('nf'); return { id }; });
    load.start();
    await flush();
    assert.deepEqual(m.ids, ['a', 'c']);
  });

  it('invalidate() is synchronous: signals aborted, later settles (resolve or reject) change nothing', async () => {
    const m = new SelectionModel({ mode: 'multiple' });
    const forever = deferred();
    const late = deferred();
    const { load, calls, applied } = mk(['a', 'b', 'c'], m, (id) => (id === 'a' ? Promise.resolve({ id }) : id === 'b' ? forever.promise : late.promise));
    load.start();
    await flush();
    load.invalidate();
    assert.ok(calls.every((c) => c.signal.aborted));
    assert.equal(load.pending, false);
    m.add({ id: 'x' });
    forever.resolve({ id: 'b' });
    late.reject(new Error('late'));
    await flush();
    assert.deepEqual(applied, []);
    assert.deepEqual(m.ids, ['x']);
  });

  it('a user change while pending (revision moved) → result dropped even without invalidate()', async () => {
    const m = new SelectionModel({ mode: 'multiple' });
    const d = deferred();
    const { load, applied } = mk(['a'], m, () => d.promise);
    load.start();
    m.add({ id: 'x' });
    d.resolve({ id: 'a' });
    await flush();
    assert.deepEqual(applied, []);
    assert.deepEqual(m.ids, ['x']);
  });

  it('no ids → nothing pending, nothing called', () => {
    const m = new SelectionModel({ mode: 'single' });
    const { load, calls } = mk([], m, async (id) => ({ id }));
    load.start();
    assert.equal(load.pending, false);
    assert.equal(calls.length, 0);
  });
});

describe('Debouncer', () => {
  it('fake clock: bursts → one call; flush() runs now; cancel()', () => {
    let now = 0;
    const timers = new Map();
    let seq = 0;
    const clock = {
      setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: now + ms }); return id; },
      clearTimeout: (id) => timers.delete(id),
    };
    const tick = (ms) => {
      now += ms;
      for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); }
    };
    const d = new Debouncer(250, clock);
    const calls = [];
    d.schedule(() => calls.push('a'));
    tick(100);
    d.schedule(() => calls.push('ab'));
    tick(100);
    d.schedule(() => calls.push('abc'));
    tick(249);
    assert.deepEqual(calls, []);
    tick(1);
    assert.deepEqual(calls, ['abc']);
    d.schedule(() => calls.push('enter'));
    assert.equal(d.pending, true);
    d.flush();
    assert.deepEqual(calls, ['abc', 'enter']);
    tick(500);
    assert.deepEqual(calls, ['abc', 'enter']);
    d.schedule(() => calls.push('x'));
    d.cancel();
    tick(500);
    assert.deepEqual(calls, ['abc', 'enter']);
    d.flush(); // nothing pending
    assert.deepEqual(calls, ['abc', 'enter']);
  });
});

describe('SessionCache (decision 9 — cache after a change)', () => {
  it('lists + facets cleared together; assets by id kept and replaced', () => {
    const c = new SessionCache();
    c.setList('k1', { items: [{ id: 'a' }], nextCursor: null });
    c.setFacets('f1', []);
    c.putAsset({ id: 'a', name: 'old' });
    assert.ok(c.getList('k1'));
    c.invalidateLists();
    assert.equal(c.getList('k1'), undefined);
    assert.equal(c.getFacets('f1'), undefined);
    c.putAsset({ id: 'a', name: 'Z' });
    assert.equal(c.getAsset('a').name, 'Z');
    c.clear();
    assert.equal(c.getAsset('a'), undefined);
  });
});

describe('ScalarTokens (decision 22)', () => {
  it('typed scalars map to positional tokens and back (Object.is: 1 ≠ "1")', () => {
    const t = new ScalarTokens([{ value: 1 }, { value: '1' }, { value: true }, { value: null }, { value: false }]);
    assert.deepEqual(t.tokens, ['o0', 'o1', 'o2', 'o3', 'o4']);
    assert.equal(t.tokenOf(1), 'o0');
    assert.equal(t.tokenOf('1'), 'o1');
    assert.equal(t.tokenOf(null), 'o3');
    assert.equal(t.tokenOf(false), 'o4');
    assert.equal(t.tokenOf(2), null);
    assert.equal(t.valueOf('o1'), '1');
    assert.equal(t.valueOf('o2'), true);
    assert.equal(t.valueOf('zz'), undefined);
    assert.equal(t.has('o3'), true);
    const tok = t.add(2);
    assert.equal(tok, 'o5');
    assert.equal(t.add(2), 'o5'); // existing value → same token
    assert.equal(t.valueOf('o5'), 2);
  });
});

describe('outcome + labels', () => {
  it('buildOutcome: assetId / asset / usage defaults, selection order', () => {
    const m = new SelectionModel({ mode: 'multiple' });
    m.add({ id: 'b', defaultAltText: 'B alt' });
    m.add({ id: 'a' });
    const o = buildOutcome(m);
    assert.equal(o.status, 'selected');
    assert.deepEqual(o.selection.map((s) => s.assetId), ['b', 'a']);
    assert.deepEqual(o.selection[0].usage, { altText: 'B alt', crop: null, focalPoint: null });
    assert.equal(o.selection[1].usage.altText, '');
    assert.deepEqual(cancelledOutcome('escape'), { status: 'cancelled', reason: 'escape', selection: [] });
  });

  it('formatLabel: messages (string | function) over labels, {params}, nested error.code, never throws', () => {
    const labels = { count: 'Hiển thị {n} / {total}', error: { network: 'Mất mạng' }, title: 'Thư viện' };
    assert.equal(formatLabel(labels, {}, 'count', { n: 3, total: 9 }), 'Hiển thị 3 / 9');
    assert.equal(formatLabel(labels, { count: (p) => `${p.n}!` }, 'count', { n: 3 }), '3!');
    assert.equal(formatLabel(labels, {}, 'error.network'), 'Mất mạng');
    assert.equal(formatLabel(labels, { 'error.network': 'Offline' }, 'error.network'), 'Offline');
    assert.equal(formatLabel(labels, { title: () => { throw new Error('x'); } }, 'title'), 'Thư viện');
    assert.equal(formatLabel(labels, { title: 5 }, 'title'), 'Thư viện');
    assert.equal(formatLabel(labels, {}, 'missing'), '');
  });
});

describe('payload bounds (review SEC-3)', () => {
  const SECRET = 'RAW_SENTINEL_9';
  const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));

  it('LIMITS are the documented numbers', () => {
    assert.deepEqual({ ...LIMITS }, { pageItems: 100, text: 500, badges: 10, facets: 20, options: 200, fields: 50 });
  });

  it('page items capped at min(limit, 100), one warning without raw data', () => {
    const warns = [];
    const p = normalizePage({ items: many(8, (i) => raw(`a${i}`, { name: SECRET })), nextCursor: null }, { safeUrl, limit: 5, warn: (m) => warns.push(m) });
    assert.equal(p.items.length, 5);
    assert.equal(warns.length, 1);
    assert.ok(!warns[0].includes(SECRET));
    const big = normalizePage({ items: many(150, (i) => raw(`b${i}`)), nextCursor: null }, { safeUrl, limit: 500, warn: () => {} });
    assert.equal(big.items.length, 100);
    const nolimit = normalizePage({ items: many(150, (i) => raw(`c${i}`)), nextCursor: null }, { safeUrl, warn: () => {} });
    assert.equal(nolimit.items.length, 100);
  });

  it('asset text fields capped at 500 code points; badges at 10', () => {
    const long = '😀'.repeat(600);
    const a = normalizeAsset(raw('a', { name: long, uploadedByLabel: long, defaultAltText: long, mimeType: long, createdAt: long,
      badges: many(15, (i) => ({ key: `k${i}`, label: long })) }), { safeUrl });
    for (const k of ['name', 'uploadedByLabel', 'defaultAltText', 'mimeType']) assert.equal([...a[k]].length, 500, k);
    assert.equal(a.badges.length, 10);
    assert.equal([...a.badges[0].label].length, 500);
  });

  it('facets capped at 20, options at 200, labels at 500; one warning without raw data', () => {
    const warns = [];
    const f = normalizeFacets(many(25, (i) => ({ key: `f${i}`, label: `${SECRET}${'x'.repeat(600)}`, type: 'single',
      options: many(250, (j) => ({ value: j, label: SECRET })) })), { warn: (m) => warns.push(m) });
    assert.equal(f.length, 20);
    assert.equal(f[0].options.length, 200);
    assert.equal([...f[0].label].length, 500);
    assert.ok(warns.length >= 1 && warns.every((w) => !w.includes(SECRET)));
  });

  it('field descriptors capped at 50, options at 200, label / helpText at 500', () => {
    const warns = [];
    const f = normalizeFields(many(60, (i) => ({ key: `k${i}`, label: 'x'.repeat(600), helpText: 'y'.repeat(600), control: 'select',
      options: many(250, (j) => ({ value: j, label: SECRET })) })), { warn: (m) => warns.push(m) });
    assert.equal(f.length, 50);
    assert.equal(f[0].options.length, 200);
    assert.equal(f[0].label.length, 500);
    assert.equal(f[0].helpText.length, 500);
    assert.ok(warns.length >= 1 && warns.every((w) => !w.includes(SECRET)));
  });

  it('InitialLoad warnings never carry the raw rejection', async () => {
    const warns = [];
    const m = new SelectionModel({ mode: 'single' });
    const load = new InitialLoad({ ids: ['a'], model: m, get: async () => { throw new Error(SECRET); }, warn: (...a) => warns.push(a) });
    load.start();
    await flush();
    assert.ok(warns.length && warns.every((a) => a.every((x) => typeof x === 'string' && !x.includes(SECRET))));
  });
});

describe('bounded PROCESSING (review SEC-3 round 2)', () => {
  /** A 1e6-entry array that counts index reads (what normalisation inspects). */
  const counted = (fill) => {
    const reads = { n: 0 };
    const arr = new Array(1e6).fill(fill);
    const p = new Proxy(arr, { get(t, k) { if (typeof k === 'string' && /^\d+$/.test(k)) reads.n += 1; return t[k]; } });
    return { p, reads };
  };
  const fast = (fn) => { const t0 = Date.now(); fn(); return Date.now() - t0; };

  it('1e6 invalid badges: at most 4 × LIMITS.badges inspected', () => {
    const { p, reads } = counted({});
    const ms = fast(() => assert.deepEqual(normalizeAsset(raw('a', { badges: p }), { safeUrl }).badges, []));
    assert.ok(reads.n <= 4 * LIMITS.badges, `reads ${reads.n}`);
    assert.ok(ms < 500, `${ms} ms`);
  });

  it('1e6 options: scanning stops after 4 × LIMITS.options even when none is valid', () => {
    const { p, reads } = counted({ value: {}, label: 'bad' });
    const ms = fast(() => assert.deepEqual(normalizeOptions(p), []));
    assert.ok(reads.n <= 4 * LIMITS.options, `reads ${reads.n}`);
    assert.ok(ms < 500, `${ms} ms`);
    const v = counted({ value: 1, label: 'ok' });
    assert.equal(normalizeOptions(v.p).length, LIMITS.options);
    assert.ok(v.reads.n <= 4 * LIMITS.options);
  });

  it('1e6 facets / field descriptors: bounded inspection', () => {
    const f = counted('junk');
    assert.deepEqual(normalizeFacets(f.p, { warn: () => {} }), []);
    assert.ok(f.reads.n <= 4 * LIMITS.facets, `facet reads ${f.reads.n}`);
    const d = counted('junk');
    assert.deepEqual(normalizeFields(d.p, { warn: () => {} }), []);
    assert.ok(d.reads.n <= 4 * LIMITS.fields, `field reads ${d.reads.n}`);
  });

  it('metadata: only descriptor keys are copied (10 000 extra keys ignored); none given → {}', () => {
    const meta = { title: 'T', license: 'cc' };
    for (let i = 0; i < 10000; i++) meta[`x${i}`] = i;
    const a = normalizeAsset(raw('a', { metadata: meta }), { safeUrl, metadataKeys: ['title', 'license', 'missing'] });
    assert.deepEqual(a.metadata, { title: 'T', license: 'cc' });
    assert.deepEqual(normalizeAsset(raw('b', { metadata: meta }), { safeUrl }).metadata, {});
    const evil = JSON.parse('{"__proto__":{"polluted":1},"title":"T"}');
    assert.deepEqual(normalizeAsset(raw('c', { metadata: evil }), { safeUrl, metadataKeys: ['__proto__', 'title'] }).metadata, { title: 'T' });
    const page = normalizePage({ items: [raw('d', { metadata: meta })], nextCursor: null }, { safeUrl, metadataKeys: ['title'], warn: () => {} });
    assert.deepEqual(page.items[0].metadata, { title: 'T' });
  });

  it('VALUE_LIMITS per control', () => {
    assert.deepEqual({ ...VALUE_LIMITS }, { text: 10000, textarea: 100000, url: 2048, select: 10000, date: 64, readonly: 10000, multiselect: 200 });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// v0.33.0 (plan docs/internal/plans/v0.33.0-media-picker-dcms-parity.md M1, "Test > Node") — URL upload, delete,
// download, filenames, titles, upload results, paging, the new capabilities / options.

describe('v0.33 validateRemoteUrl (decision 22 — UX only, not security)', () => {
  it('valid https → ok + normalised href', () => {
    assert.deepEqual(validateRemoteUrl('https://a.b/x.jpg'), { ok: true, href: 'https://a.b/x.jpg' });
    assert.deepEqual(validateRemoteUrl('  HTTP://A.B/x y.jpg  '), { ok: true, href: 'http://a.b/x%20y.jpg' });
  });

  it('empty / blank / not a string → "empty" (button disabled, no error shown)', () => {
    for (const v of ['', '   ', '\t\n', null, undefined, 5, {}]) assert.deepEqual(validateRemoteUrl(v), { ok: false, code: 'empty' });
  });

  it('> 2048 characters → "too-long" (checked before parsing)', () => {
    assert.equal(REMOTE_URL_MAX, 2048);
    const long = `https://a.b/${'a'.repeat(2049 - 'https://a.b/'.length)}`;
    assert.equal(long.length, 2049);
    assert.deepEqual(validateRemoteUrl(long), { ok: false, code: 'too-long' });
    assert.equal(validateRemoteUrl(long.slice(0, 2048)).ok, true);
    assert.deepEqual(validateRemoteUrl(`javascript:${'a'.repeat(3000)}`), { ok: false, code: 'too-long' }, 'order: length first');
  });

  it('unparseable → "invalid"', () => {
    for (const v of ['https://exa mple.com', 'not a url', '/relative/x.jpg', 'https://', 'http://[::1']) {
      assert.deepEqual(validateRemoteUrl(v), { ok: false, code: 'invalid' }, v);
    }
  });

  it('ftp: / javascript: / data: / file: / blob: → "scheme"', () => {
    for (const v of ['ftp://a.b/x.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'file:///etc/passwd',
      'blob:https://a.b/1-2', 'mailto:a@b.c']) {
      assert.deepEqual(validateRemoteUrl(v), { ok: false, code: 'scheme' }, v);
    }
  });

  it('username / password → "credentials"', () => {
    assert.deepEqual(validateRemoteUrl('https://user:pw@h/'), { ok: false, code: 'credentials' });
    assert.deepEqual(validateRemoteUrl('https://user@h/'), { ok: false, code: 'credentials' });
    assert.deepEqual(validateRemoteUrl('https://:pw@h/'), { ok: false, code: 'credentials' });
  });

  it('WHATWG normalisation happens first: `http:///x` and `https://@h/` are VALID; the normalised href is what is sent', () => {
    assert.deepEqual(validateRemoteUrl('http:///x'), { ok: true, href: 'http://x/' });
    assert.deepEqual(validateRemoteUrl('https://@h/'), { ok: true, href: 'https://h/' });
  });

  it('IDN → punycode href', () => {
    assert.deepEqual(validateRemoteUrl('https://bücher.de/ảnh.jpg'),
      { ok: true, href: 'https://xn--bcher-kva.de/%E1%BA%A3nh.jpg' });
  });

  it('does NOT block private / loopback hosts — SSRF protection is the SERVER\'s job (decision 23)', () => {
    for (const v of ['http://127.0.0.1/x.jpg', 'http://localhost/x', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/x', 'http://10.0.0.1/']) {
      assert.equal(validateRemoteUrl(v).ok, true, v);
    }
  });
});

describe('v0.33 normalizeDeleteResult (decision 24)', () => {
  it('deleted with the matching id → { status: "deleted", id }', () => {
    assert.deepEqual(normalizeDeleteResult({ status: 'deleted', id: 'a1', extra: 1 }, 'a1'), { status: 'deleted', id: 'a1' });
  });

  it('deleted with another / missing id → contract error (server)', () => {
    for (const r of [{ status: 'deleted', id: 'a2' }, { status: 'deleted' }, { status: 'deleted', id: 1 }]) {
      assert.throws(() => normalizeDeleteResult(r, 'a1'), (e) => e.code === 'server');
    }
  });

  it('blocked → normalised usages', () => {
    const r = normalizeDeleteResult({ status: 'blocked', reason: 'in-use', usageCount: 2, truncated: true,
      usages: [{ id: 'p1', label: '  Bài 1 ', kind: 'post', href: '/admin/p/1' }, { id: 7, label: 'SP' }] }, 'a1');
    assert.deepEqual(r, { status: 'blocked', reason: 'in-use', usageCount: 2, truncated: true,
      usages: [{ id: 'p1', label: 'Bài 1', kind: 'post', href: '/admin/p/1' }, { id: '7', label: 'SP' }] });
  });

  it('usageCount must be an integer ≥ 0', () => {
    for (const usageCount of [-1, 1.5, '3', NaN, undefined, null]) {
      assert.throws(() => normalizeDeleteResult({ status: 'blocked', reason: 'in-use', usageCount, usages: [] }, 'a'),
        (e) => e.code === 'server', String(usageCount));
    }
    assert.equal(normalizeDeleteResult({ status: 'blocked', reason: 'in-use', usageCount: 0, usages: [] }, 'a').usageCount, 0);
  });

  it('80 usages → 50 (truncated: true); label 500 code points → 200', () => {
    const usages = Array.from({ length: 80 }, (_, i) => ({ id: `u${i}`, label: i === 0 ? '😀'.repeat(500) : `L${i}` }));
    const r = normalizeDeleteResult({ status: 'blocked', reason: 'in-use', usageCount: 80, usages }, 'a');
    assert.equal(r.usages.length, 50);
    assert.equal(r.truncated, true);
    assert.equal([...r.usages[0].label].length, 200);
    assert.equal(r.usages[49].id, 'u49');
  });

  it('usages not an array / an item with an own __proto__ / constructor key / bad item → contract error', () => {
    const base = { status: 'blocked', reason: 'in-use', usageCount: 1 };
    const fakeArr = Object.create(Array.prototype);
    for (const usages of [undefined, null, {}, 'x', fakeArr, { length: 1, 0: { id: 'a', label: 'b' } }]) {
      assert.throws(() => normalizeDeleteResult({ ...base, usages }, 'a'), (e) => e.code === 'server');
    }
    for (const item of [JSON.parse('{"id":"u","label":"L","__proto__":{"x":1}}'), { id: 'u', label: 'L', constructor: 1 },
      null, 'u', { id: '', label: 'L' }, { id: 'u' }, { id: 'u', label: '   ' }, { id: {}, label: 'L' }]) {
      assert.throws(() => normalizeDeleteResult({ ...base, usages: [item] }, 'a'), (e) => e.code === 'server', JSON.stringify(item));
    }
  });

  it('truncated not a boolean → dropped; kind / href non-strings dropped', () => {
    const r = normalizeDeleteResult({ status: 'blocked', reason: 'in-use', usageCount: 1, truncated: 'yes',
      usages: [{ id: 'u', label: 'L', kind: 5, href: { toString: () => 'https://x' } }] }, 'a');
    assert.equal('truncated' in r, false);
    assert.deepEqual(r.usages, [{ id: 'u', label: 'L' }]);
  });

  it('href: raw by default (the renderer gates it through safeLinkUrl); with `safeLink` pre-gated, unsafe dropped', () => {
    const raw0 = { status: 'blocked', reason: 'in-use', usageCount: 2,
      usages: [{ id: 'u1', label: 'A', href: 'javascript:alert(1)' }, { id: 'u2', label: 'B', href: '/p/2' }] };
    assert.equal(normalizeDeleteResult(raw0, 'a').usages[0].href, 'javascript:alert(1)');
    const gate = (u) => (u.startsWith('/') ? `https://site.test${u}` : '');
    const r = normalizeDeleteResult(raw0, 'a', { safeLink: gate });
    assert.deepEqual(r.usages, [{ id: 'u1', label: 'A' }, { id: 'u2', label: 'B', href: 'https://site.test/p/2' }]);
  });

  it('other shapes → contract error', () => {
    for (const r of [null, undefined, 'deleted', [], {}, { status: 'gone', id: 'a' },
      { status: 'blocked', reason: 'other', usageCount: 1, usages: [] }]) {
      assert.throws(() => normalizeDeleteResult(r, 'a'), (e) => e.code === 'server');
    }
  });
});

describe('v0.33 safeFilename (decision 25)', () => {
  it('strips / \\ : control + bidi characters, cuts 200, empty → fallback', () => {
    assert.equal(safeFilename('../../etc/passwd'), 'etcpasswd');
    assert.equal(safeFilename('C:\\Windows\\a.exe'), 'CWindowsa.exe');
    assert.equal(safeFilename('a\u0000b\u001fc\u007fd\u0085e\u202Egpj.exe'), 'abcdegpj.exe');
    assert.equal([...safeFilename('ả'.repeat(300))].length, 200);
    assert.equal(safeFilename('   ', 'anh-1.jpg'), 'anh-1.jpg');
    assert.equal(safeFilename('///', 'x/y.jpg'), 'xy.jpg', 'the fallback is cleaned too');
    assert.equal(safeFilename(null, ''), 'download');
    assert.equal(safeFilename('báo cáo 2026.pdf'), 'báo cáo 2026.pdf');
  });
});

describe('v0.33 normalizeDownloadResult (decision 25)', () => {
  const opts = { safeUrl, now: Date.parse('2026-10-04T10:00:00Z'), fallbackName: 'anh-1.jpg' };

  it('{ url, filename } → kind url, URL gated, filename cleaned', () => {
    assert.deepEqual(normalizeDownloadResult({ url: '/dl/1?sig=x', filename: '../a\\b:c\u0007.jpg' }, opts),
      { kind: 'url', url: 'https://site.test/dl/1?sig=x', filename: 'abc.jpg' });
    assert.deepEqual(normalizeDownloadResult({ url: 'https://cdn.test/o.jpg', filename: '' }, opts),
      { kind: 'url', url: 'https://cdn.test/o.jpg', filename: 'anh-1.jpg' });
  });

  it('javascript: / blob: / data: / non-string url → contract error (server)', () => {
    for (const url of ['javascript:alert(1)', 'blob:https://site.test/1', 'data:text/html,<script>alert(1)</script>', 5, '']) {
      assert.throws(() => normalizeDownloadResult({ url, filename: 'a' }, opts), (e) => e.code === 'server', String(url));
    }
    // even a gate that lets blob: through cannot open a blob from the url branch
    assert.throws(() => normalizeDownloadResult({ url: 'blob:https://site.test/1', filename: 'a' }, { ...opts, safeUrl: (u) => u }),
      (e) => e.code === 'server');
  });

  it('expiresAt in the past → code "expired"; future ok; unparseable → server', () => {
    assert.throws(() => normalizeDownloadResult({ url: '/d', filename: 'a', expiresAt: '2026-10-04T09:59:59Z' }, opts),
      (e) => e.code === 'expired');
    assert.equal(normalizeDownloadResult({ url: '/d', filename: 'a', expiresAt: '2026-10-04T10:05:00Z' }, opts).kind, 'url');
    assert.throws(() => normalizeDownloadResult({ url: '/d', filename: 'a', expiresAt: 'soon' }, opts), (e) => e.code === 'server');
  });

  it('{ blob, filename } → kind blob (blob instanceof Blob required)', () => {
    const blob = new Blob(['x'], { type: 'text/html' });
    const r = normalizeDownloadResult({ blob, filename: 'x.html' }, opts);
    assert.equal(r.kind, 'blob');
    assert.equal(r.blob, blob);
    assert.equal(r.filename, 'x.html');
    for (const b of [{}, 'blob', null, { size: 1, type: 'x' }]) {
      assert.throws(() => normalizeDownloadResult({ blob: b, filename: 'a' }, opts), (e) => e.code === 'server');
    }
  });

  it('both / neither / not an object → contract error', () => {
    for (const r of [null, 'x', [], {}, { filename: 'a' }, { url: '/d', blob: new Blob(['x']), filename: 'a' }]) {
      assert.throws(() => normalizeDownloadResult(r, opts), (e) => e.code === 'server');
    }
  });
});

describe('v0.33 defaultTitle (decision 6)', () => {
  it('the four cases + overrides', () => {
    assert.equal(defaultTitle(['image']), 'Chọn ảnh');
    assert.equal(defaultTitle(['video']), 'Chọn video');
    assert.equal(defaultTitle(['file']), 'Chọn tài liệu');
    assert.equal(defaultTitle(['image', 'video']), 'Chọn media');
    assert.equal(defaultTitle(null), 'Chọn media');
    assert.equal(defaultTitle([]), 'Chọn media');
    assert.equal(defaultTitle(['image'], { titleImage: 'Pick an image', title: 'Media' }), 'Pick an image');
    assert.equal(defaultTitle(['zip'], { title: 'Media' }), 'Media');
    assert.equal(defaultTitle(['image'], { titleImage: '' }), 'Chọn ảnh', 'empty label → default');
    assert.equal(defaultTitle(['image'], {}, 'Ảnh đại diện'), 'Ảnh đại diện', 'options.title wins');
    assert.equal(defaultTitle(['image'], {}, ''), 'Chọn ảnh');
  });
});

describe('v0.33 normalizeUploadResult (v0.32 #20, shared by file + URL upload)', () => {
  it('created / exact-reused with the same id → normalised; anything else → null', () => {
    const ok = normalizeUploadResult({ asset: raw('n1'), deduplication: { outcome: 'created', x: 1 } }, { safeUrl });
    assert.equal(ok.asset.id, 'n1');
    assert.deepEqual(ok.deduplication, { outcome: 'created' });
    const re = normalizeUploadResult({ asset: raw('n1'), deduplication: { outcome: 'exact-reused', matchedAssetId: 'n1' } }, { safeUrl });
    assert.deepEqual(re.deduplication, { outcome: 'exact-reused', matchedAssetId: 'n1' });
    for (const r of [null, {}, { asset: raw('n1') }, { asset: raw('n1'), deduplication: { outcome: 'exact-reused', matchedAssetId: 'n2' } },
      { asset: raw('n1'), deduplication: { outcome: 'exact-reused' } }, { asset: raw('n1'), deduplication: { outcome: 'other' } },
      { asset: { id: 'x' }, deduplication: { outcome: 'created' } }, { asset: raw('n1'), deduplication: 'created' }]) {
      assert.equal(normalizeUploadResult(r, { safeUrl }), null, JSON.stringify(r));
    }
  });

  it('metadataKeys restrict the metadata copy; URLs gated', () => {
    const r = normalizeUploadResult({ asset: raw('n1', { metadata: { title: 'T', secret: 1 }, urls: { thumbnail: 'javascript:x', preview: '/p.jpg' } }),
      deduplication: { outcome: 'created' } }, { safeUrl, metadataKeys: ['title'] });
    assert.deepEqual(r.asset.metadata, { title: 'T' });
    assert.equal(r.asset.urls.thumbnail, '');
    assert.equal(r.asset.urls.preview, 'https://site.test/p.jpg');
  });
});

describe('v0.33 capabilities: uploadFromUrl + copyLink (decisions 20, 22, 27)', () => {
  const fromUrl = async () => ({});
  it('uploadFromUrl inferred from the method; false hides; true without the method → false', () => {
    assert.equal(resolveCapabilities(adapter({ uploadFromUrl: fromUrl }), undefined).uploadFromUrl, true);
    assert.equal(resolveCapabilities(adapter({ uploadFromUrl: fromUrl }), { uploadFromUrl: false }).uploadFromUrl, false);
    assert.equal(resolveCapabilities(adapter(), { uploadFromUrl: true }).uploadFromUrl, false);
    assert.equal(resolveCapabilities(adapter({ uploadFromUrl: 'x' }), undefined).uploadFromUrl, false);
  });

  it('copyLink defaults to false; on only when the site turns it on (no method needed)', () => {
    assert.equal(resolveCapabilities(adapter(), undefined).copyLink, false);
    assert.equal(resolveCapabilities(adapter(), { copyLink: true }).copyLink, true);
    assert.equal(resolveCapabilities(adapter(), { copyLink: 'yes' }).copyLink, false);
  });

  it('delete / downloadOriginal stay explicit opt-in: method + flag true', () => {
    const del = async () => {};
    assert.equal(resolveCapabilities(adapter({ delete: del, download: del }), undefined).delete, false);
    assert.equal(resolveCapabilities(adapter({ delete: del }), { delete: true }).delete, true);
    assert.equal(resolveCapabilities(adapter(), { delete: true, downloadOriginal: true }).downloadOriginal, false);
    assert.equal(resolveCapabilities(adapter({ download: del }), { downloadOriginal: true }).downloadOriginal, true);
  });

  it('canDo: per-asset flags only narrow (all four new / v0.32.1 actions)', () => {
    const fn = async () => {};
    const ad = adapter({ uploadFromUrl: fn, delete: fn, download: fn });
    const caps = { delete: true, downloadOriginal: true, copyLink: true };
    for (const action of ['uploadFromUrl', 'copyLink', 'delete', 'downloadOriginal']) {
      assert.equal(canDo(action, ad, caps, null), true, action);
      assert.equal(canDo(action, ad, caps, { capabilities: { [action]: false } }), false, action);
      assert.equal(canDo(action, ad, { ...caps, [action]: false }, { capabilities: { [action]: true } }), false, action);
    }
    assert.equal(canDo('copyLink', ad, undefined, { capabilities: { copyLink: true } }), false, 'per-asset cannot widen');
  });

  it('normalizeAsset keeps the new per-asset flags (booleans only)', () => {
    const a = normalizeAsset(raw('a', { capabilities: { copyLink: false, uploadFromUrl: 'no', delete: false } }), { safeUrl });
    assert.deepEqual(a.capabilities, { copyLink: false, delete: false });
  });
});

describe('v0.33 resolveOptions: pagination + upload.acceptLabel (decisions 13, 21)', () => {
  it('pagination: default cursor; pages; defaults layer; invalid → warn + cursor', () => {
    assert.equal(resolveOptions({ adapter: adapter() }).pagination, 'cursor');
    assert.equal(resolveOptions({ adapter: adapter() }, { pagination: 'pages' }).pagination, 'pages');
    assert.equal(resolveOptions({ adapter: adapter(), pagination: 'pages' }).pagination, 'pages', 'via configureDefaults');
    const warns = [];
    assert.equal(resolveOptions({ adapter: adapter() }, { pagination: 'infinite' }, { warn: (m) => warns.push(m) }).pagination, 'cursor');
    assert.equal(warns.length, 1);
    assert.ok(!warns[0].includes('infinite'), 'never echoes the raw value');
  });

  it('upload.acceptLabel: text only, cut', () => {
    assert.equal(resolveOptions({ adapter: adapter() }, { upload: { acceptLabel: ' JPG, PNG ' } }).upload.acceptLabel, 'JPG, PNG');
    assert.equal(resolveOptions({ adapter: adapter() }, { upload: { acceptLabel: 5 } }).upload.acceptLabel, '');
    assert.equal([...resolveOptions({ adapter: adapter() }, { upload: { acceptLabel: 'x'.repeat(500) } }).upload.acceptLabel].length, 200);
  });

  it('crop warning (once) names v0.35', () => {
    _resetCoreWarnings();
    const warns = [];
    resolveOptions({ adapter: adapter() }, { crop: { enabled: true } }, { warn: (m) => warns.push(m) });
    resolveOptions({ adapter: adapter() }, { crop: { enabled: true } }, { warn: (m) => warns.push(m) });
    assert.equal(warns.length, 1);
    assert.match(warns[0], /v0\.35/);
  });
});

describe('v0.33 buildListRequest / requestKey / normalizePage: pages mode (decision 13)', () => {
  it('page given → request.page, cursor forced null; cursor mode → no page key', () => {
    const st = { query: '', filters: {}, pageSize: 30 };
    const r = buildListRequest(st, { page: 3, cursor: 'ignored' });
    assert.equal(r.page, 3);
    assert.equal(r.cursor, null);
    assert.equal('page' in buildListRequest(st, { cursor: 'c' }), false);
    for (const page of [0, -1, 1.5, '2', NaN]) assert.equal('page' in buildListRequest(st, { page }), false, String(page));
  });

  it('requestKey includes the page', () => {
    const st = { query: '', filters: {}, pageSize: 30, kinds: null };
    assert.notEqual(requestKey(st, null, 1), requestKey(st, null, 2));
    assert.equal(requestKey(st, null, 2), requestKey(st, null, 2));
    assert.equal(requestKey(st, 'c'), requestKey(st, 'c', null));
  });

  it('pages mode: valid total kept; missing / invalid total → pagesFallback', () => {
    const p = (total) => normalizePage({ items: [raw('a')], nextCursor: null, total }, { safeUrl, pagination: 'pages', warn: quiet });
    assert.equal(p(61).total, 61);
    assert.equal(p(61).pagesFallback, false);
    for (const t of [undefined, -1, 1.5, '61', null]) {
      assert.equal(p(t).pagesFallback, true, String(t));
      assert.equal(p(t).total, undefined);
    }
    assert.equal('pagesFallback' in normalizePage({ items: [] }, { safeUrl, warn: quiet }), false, 'cursor mode unchanged');
  });
});

describe('v0.33 PageState (decision 13)', () => {
  const page = (n, nextCursor = null, total) => ({ items: new Array(n).fill(0), nextCursor, total });

  it('cursor: forward 3, back 2, query change → reset; from / to with total', () => {
    const ps = new PageState({ mode: 'cursor', pageSize: 30 });
    let r = ps.begin('reload');
    assert.deepEqual({ target: r.target, cursor: r.cursor, page: r.page }, { target: 1, cursor: null, page: undefined });
    assert.equal(ps.commit(r.token, page(30, 'c30', 95)), true);
    assert.deepEqual([ps.page, ps.from, ps.to, ps.total, ps.hasPrev, ps.hasNext, ps.visible], [1, 1, 30, 95, false, true, true]);
    for (const [cur, n, next] of [['c30', 30, 'c60'], ['c60', 30, 'c90'], ['c90', 5, null]]) {
      r = ps.begin('next');
      assert.equal(r.cursor, cur);
      ps.commit(r.token, page(n, next, 95));
    }
    assert.deepEqual([ps.page, ps.from, ps.to, ps.hasNext, ps.hasPrev], [4, 91, 95, false, true]);
    assert.equal(ps.begin('next'), null, 'no next cursor');
    r = ps.begin('prev');
    assert.equal(r.cursor, 'c60');
    ps.commit(r.token, page(30, 'c90', 95));
    r = ps.begin('prev');
    assert.equal(r.cursor, 'c30');
    ps.commit(r.token, page(30, 'c60', 95));
    assert.deepEqual([ps.page, ps.from, ps.to], [2, 31, 60]);
    ps.reset();
    assert.deepEqual([ps.page, ps.total, ps.hasNext, ps.hasPrev, ps.pending], [1, undefined, false, false, false]);
    assert.equal(ps.begin('reload').cursor, null);
  });

  it('cursor: single-flight — next / prev ignored while pending; failure / abort keeps page + stack', () => {
    const ps = new PageState({ mode: 'cursor', pageSize: 2 });
    ps.commit(ps.begin('reload').token, page(2, 'c2'));
    const r = ps.begin('next');
    assert.equal(ps.pending, true);
    assert.equal(ps.begin('next'), null);
    assert.equal(ps.begin('prev'), null);
    ps.rollback(r.token);
    assert.deepEqual([ps.page, ps.pending, ps.hasNext], [1, false, true]);
    const r2 = ps.begin('next');
    assert.equal(r2.cursor, 'c2');
    ps.commit(r2.token, page(1, null));
    assert.deepEqual([ps.page, ps.hasNext, ps.hasPrev], [2, false, true]);
  });

  it('cursor: without total → no from/to (UI says "Trang n"); stale tokens ignored; reload supersedes', () => {
    const ps = new PageState({ pageSize: 2 });
    const a = ps.begin('reload');
    const b = ps.begin('reload');
    assert.equal(ps.commit(a.token, page(2, 'x')), false, 'superseded');
    assert.equal(ps.commit(b.token, page(2, 'c2')), true);
    assert.equal(ps.total, undefined);
    assert.equal(ps.from, undefined);
    const n = ps.begin('next');
    ps.reset();
    assert.equal(ps.commit(n.token, page(2, 'c4')), false, 'reset makes pending stale');
    assert.equal(ps.page, 1);
  });

  it('hidden when everything fits one page', () => {
    const ps = new PageState({ pageSize: 30 });
    ps.commit(ps.begin('reload').token, page(12, null, 12));
    assert.equal(ps.visible, false);
    const pp = new PageState({ mode: 'pages', pageSize: 30 });
    pp.commit(pp.begin(1).token, page(30, null, 30));
    assert.equal(pp.visible, false);
    pp.commit(pp.begin(1).token, page(30, null, 31));
    assert.equal(pp.visible, true);
  });

  it('pages: page numbers, latest wins, cursor null, pageCount + from / to', () => {
    const ps = new PageState({ mode: 'pages', pageSize: 30 });
    const r1 = ps.begin(1);
    assert.deepEqual({ target: r1.target, cursor: r1.cursor, page: r1.page }, { target: 1, cursor: null, page: 1 });
    ps.commit(r1.token, page(30, null, 95));
    assert.deepEqual([ps.ui, ps.pageCount, ps.from, ps.to, ps.hasNext], ['pages', 4, 1, 30, true]);
    const a = ps.begin(3);
    const b = ps.begin(4);
    assert.ok(a && b, 'pages mode is latest-wins, never blocked');
    assert.equal(ps.commit(a.token, page(30, null, 95)), false);
    ps.commit(b.token, page(5, null, 95));
    assert.deepEqual([ps.page, ps.from, ps.to, ps.hasNext], [4, 91, 95, false]);
    assert.equal(ps.begin('next'), null);
    assert.equal(ps.begin('prev').page, 3);
    assert.equal(ps.begin(0), null);
    assert.equal(ps.begin(1.5), null);
  });

  it('pages: missing / invalid total → warn ONCE + cursor UI; requests keep sending page', () => {
    const warns = [];
    const ps = new PageState({ mode: 'pages', pageSize: 2, warn: (m) => warns.push(m) });
    ps.commit(ps.begin(1).token, page(2, null, undefined));
    assert.equal(ps.ui, 'cursor');
    assert.equal(ps.hasNext, true, 'a full page → there may be a next page');
    const r = ps.begin('next');
    assert.deepEqual({ page: r.page, cursor: r.cursor }, { page: 2, cursor: null });
    ps.commit(r.token, page(1, null, '3'));
    assert.equal(ps.hasNext, false);
    assert.equal(warns.length, 1);
    ps.reset();
    ps.commit(ps.begin(1).token, page(2, null, 4));
    assert.equal(ps.ui, 'pages', 'a later valid total brings the pages UI back');
    assert.equal(ps.mode, 'pages');
  });

  it('cursor: begin(number) other than the current page is refused', () => {
    const ps = new PageState({ pageSize: 2 });
    assert.equal(ps.begin(3), null);
  });

  it('empty page after delete → step back one page (never below 1)', () => {
    const ps = new PageState({ pageSize: 2 });
    ps.commit(ps.begin('reload').token, page(2, 'c2', 3));
    ps.commit(ps.begin('next').token, page(1, null, 3));
    const re = ps.begin('reload');
    assert.equal(re.cursor, 'c2', 'reload re-fetches the current page');
    ps.commit(re.token, page(0, null, 2));
    const back = ps.stepBackIfEmpty();
    assert.equal(back.cursor, null);
    assert.equal(back.target, 1);
    ps.commit(back.token, page(2, null, 2));
    assert.equal(ps.page, 1);
    ps.commit(ps.begin('reload').token, page(0, null, 0));
    assert.equal(ps.stepBackIfEmpty(), null, 'page 1 stays');
    const pp = new PageState({ mode: 'pages', pageSize: 30 });
    pp.commit(pp.begin(4).token, page(1, null, 91));
    pp.commit(pp.begin('reload').token, page(0, null, 90));
    assert.equal(pp.stepBackIfEmpty().page, 3);
  });

  it('invalid mode → cursor; pageSize falls back to the default', () => {
    const ps = new PageState({ mode: 'x', pageSize: 0 });
    assert.equal(ps.mode, 'cursor');
    assert.equal(ps.pageSize, PAGE_SIZE_DEFAULT);
  });
});
