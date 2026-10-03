// v0.32.0 (plan docs/internal/plans/v0.32.0-media-picker.md M1) — pure core of <td-media-picker>: DTO normalisation,
// error normalisation (decision 8), capabilities (2, 5), option resolution + defaults registry (6), list requests,
// latest-request-wins (9), selection model + capacity (13), initialIds transaction (15), debouncer, caches, scalar
// tokens (22), outcome (7). No DOM.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAsset, normalizePage, normalizeFacets, normalizeFields, normalizeError, resolveCapabilities, canDo,
  resolveOptions, DefaultsRegistry, buildListRequest, requestKey, LatestRequest, SelectionModel, InitialLoad, Debouncer,
  SessionCache, ScalarTokens, buildOutcome, cancelledOutcome, formatLabel, LIMITS,
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
      capabilities: { editMetadata: false, bogus: 1 }, metadata: { a: 1 } }), { safeUrl });
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
      { search: true, upload: false, editMetadata: false, delete: false, downloadOriginal: false });
    const full = adapter({ upload: async () => {}, update: async () => {}, delete: async () => {} });
    assert.deepEqual(resolveCapabilities(full, null),
      { search: true, upload: true, editMetadata: true, delete: false, downloadOriginal: false });
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
    assert.deepEqual(o.upload, { accept: 'image/*', maxSize: '', multiple: false });
    assert.equal(o.cropRequested, true);
    assert.ok(warns.some((w) => /v0\.33/.test(w)));
    const m = resolveOptions({ adapter: adapter() }, { selection: { mode: 'multiple', maxItems: 2, initialIds: ['a', 'b', 'c'] } });
    assert.deepEqual(m.selection.initialIds, ['a', 'b']);
    assert.equal(resolveOptions({ adapter: adapter() }).pageSize, 40);
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
