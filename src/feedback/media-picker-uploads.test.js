import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const {
  getUploadStore, peekUploadStore, pageUploadSlots, uploadStats, cancelAllUploads, UPLOAD_LIMIT, UPLOAD_BYTES,
} = await import('./media-picker-uploads.js');
const { UploadQueue } = await import('../utils/upload-queue.js');
const { normalizeImageResizePolicy } = await import('../utils/image-resize.js');

const LABELS = {
  rejectType: '{name}: type',
  rejectSize: '{name}: size',
  rejectCount: '{name}: count {n}',
  uploadError: 'Upload failed',
  optimizeError: { default: 'Failed' },
};
const MiB = 1024 * 1024;

/** a File-like object (size without allocating the bytes) */
const fake = (name, size = 10, type = 'image/png') => ({ name, size, type });
const fakes = (n, prefix = 'f', size = 10) => Array.from({ length: n }, (_, i) => fake(`${prefix}${i}.png`, size));
const tick = () => new Promise((r) => setTimeout(r, 0));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** hooks settled by hand; `calls[i].rec` = the store record */
function manualHooks() {
  const calls = [];
  const makeHook = (rec, h) => (file, c) => {
    const d = deferred();
    calls.push({ rec, file, c, h, ...d });
    return d.promise;
  };
  return { makeHook, calls };
}

function makeView(context = null) {
  const log = [];
  const v = {
    session: 0,
    context,
    t: (k, p) => `${k}:${JSON.stringify(p || {})}`,
    onAdd: (recs) => log.push(['add', recs.map((r) => r.name)]),
    onChange: (rec, kind) => log.push(['change', rec.name, kind]),
    onDone: (rec, asset, dedup) => log.push(['done', rec.name, asset && asset.id, dedup && dedup.outcome]),
    onRemove: (rec) => log.push(['remove', rec.name]),
    onError: (d) => log.push(['error', d.code]),
    onBatch: (r) => log.push(['batch', r.ok, r.fail, r.total]),
    detached: () => log.push(['detached']),
  };
  return { v, log };
}

function drop(store, view, files, { hooks, cfg = {}, context = view.context } = {}) {
  return store.accept(files, {
    view,
    cfg: { accept: null, maxSize: null, policy: null, single: false, labels: LABELS, ...cfg },
    context,
    metaKeys: [],
    makeHook: hooks.makeHook,
  });
}

const okResult = (id, outcome = 'created') => ({ asset: { id, name: id }, deduplication: { outcome } });

afterEach(async () => {
  cancelAllUploads();
  await tick();
  assert.equal(pageUploadSlots().active, 0, 'every slot freed between tests');
});

describe('getUploadStore', () => {
  it('one store per adapter object; another adapter → another store; an idle store leaves the Map', () => {
    const a = {};
    const b = {};
    const sa = getUploadStore(a);
    assert.equal(getUploadStore(a), sa);
    assert.notEqual(getUploadStore(b), sa);
    const { v } = makeView();
    sa.attach(v);
    sa.detach(v);
    assert.equal(peekUploadStore(a), null, 'pruned: no view, no record, no mark');
  });
});

describe('background store', () => {
  it('detach never aborts; a file that finishes with no view is dropped; an exact-reused one leaves a mark', async () => {
    const adapter = {};
    const toasts = [];
    const store = getUploadStore(adapter, { toast: (type, text) => toasts.push([type, text]) });
    const hooks = manualHooks();
    const { v } = makeView('ctx');
    store.attach(v);
    drop(store, v, fakes(2), { hooks });
    assert.equal(hooks.calls.length, 2);
    store.detach(v);
    assert.ok(hooks.calls.every((c) => !c.c.signal.aborted));
    assert.equal(peekUploadStore(adapter), store, 'kept while it has files');
    hooks.calls[0].resolve(okResult('A'));
    hooks.calls[1].resolve(okResult('B', 'exact-reused'));
    await tick();
    assert.equal(store.records.length, 0);
    assert.equal(store.size, 0, 'done items released');
    assert.equal(store.reusedMarks, 1);
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0][0], 'success');
    assert.match(toasts[0][1], /^uploadDone:/);
    const { v: v2 } = makeView('other');
    store.attach(v2);
    assert.deepEqual(store.takeReused('other'), []);
    assert.deepEqual(store.takeReused('ctx').map((a) => a.id), ['B']);
    store.detach(v2);
    assert.equal(peekUploadStore(adapter), null);
  });

  it('records come back to a view of the same context only; the view is told about its records only', async () => {
    const store = getUploadStore({});
    const hooks = manualHooks();
    const { v } = makeView('x');
    store.attach(v);
    drop(store, v, fakes(2, 'x'), { hooks });
    store.detach(v);
    const { v: other, log: otherLog } = makeView('y');
    store.attach(other);
    assert.deepEqual(store.visible(other), []);
    hooks.calls[0].reject(new Error('boom'));
    await tick();
    assert.equal(otherLog.filter((l) => l[0] === 'change').length, 0);
    store.detach(other);
    const { v: again } = makeView('x');
    store.attach(again);
    assert.deepEqual(store.visible(again).map((r) => r.name), ['x0.png', 'x1.png']);
    assert.ok(again.session > v.session);
  });

  it('a newer view takes over: the old one is told (detached)', () => {
    const store = getUploadStore({});
    const { v: a, log } = makeView();
    const { v: b } = makeView();
    store.attach(a);
    store.attach(b);
    assert.deepEqual(log, [['detached']]);
    assert.equal(store.view, b);
    store.detach(a); // not the attached one: no change
    assert.equal(store.view, b);
    store.detach(b);
  });

  it('the batch: ended in its own session → view.onBatch; started in an earlier session → toast (fail first)', async () => {
    const toasts = [];
    const store = getUploadStore({}, { toast: (type, text) => toasts.push([type, text]) });
    const hooks = manualHooks();
    const { v, log } = makeView();
    store.attach(v);
    drop(store, v, fakes(2), { hooks });
    hooks.calls[0].resolve(okResult('A'));
    hooks.calls[1].reject(new Error('boom'));
    await tick();
    assert.deepEqual(log.filter((l) => l[0] === 'batch'), [['batch', 1, 1, 2]]);
    assert.equal(toasts.length, 0);
    drop(store, v, fakes(1, 'n'), { hooks });
    store.detach(v);
    const { v: v2 } = makeView();
    store.attach(v2);
    hooks.calls[2].reject(new Error('boom'));
    await tick();
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0][0], 'warning');
    assert.match(toasts[0][1], /^uploadFailedClosed:\{"n":1\}/);
    store.detach(v2);
  });

  it('an earlier-session file removed from the open batch no longer routes its summary to a toast (Codex impl r1 #2)', async () => {
    const toasts = [];
    const store = getUploadStore({}, { toast: (type, text) => toasts.push([type, text]) });
    const hooks = manualHooks();
    const { v } = makeView();
    store.attach(v);
    const [old] = drop(store, v, fakes(1, 'o'), { hooks }).records;
    store.detach(v);
    const { v: v2, log: log2 } = makeView();
    store.attach(v2);
    drop(store, v2, fakes(1, 'n'), { hooks });
    assert.equal(store.remove(old), true);
    hooks.calls[1].resolve(okResult('N'));
    await tick();
    assert.deepEqual(log2.filter((l) => l[0] === 'batch'), [['batch', 1, 0, 1]]);
    assert.equal(toasts.length, 0);
    store.detach(v2);
  });

  it('operation-error goes to the view whose session started the try', async () => {
    const store = getUploadStore({});
    const hooks = manualHooks();
    const { v, log } = makeView();
    store.attach(v);
    drop(store, v, fakes(1), { hooks });
    store.detach(v);
    const { v: v2, log: log2 } = makeView();
    store.attach(v2);
    hooks.calls[0].h.onError({ code: 'server' });
    assert.equal(log.filter((l) => l[0] === 'error').length + log2.filter((l) => l[0] === 'error').length, 0);
    hooks.calls[0].reject(new Error('boom'));
    await tick();
    const [rec] = store.visible(v2);
    assert.equal(store.retry(rec, v2), true);
    hooks.calls[1].h.onError({ code: 'server' });
    assert.deepEqual(log2.filter((l) => l[0] === 'error'), [['error', 'server']]);
    store.detach(v2);
  });

  it('the context of a record is the one at drop time; makeHook gets the record', () => {
    const store = getUploadStore({});
    const hooks = manualHooks();
    const ctx = { site: 1 };
    const { v } = makeView(ctx);
    store.attach(v);
    const res = drop(store, v, fakes(1), { hooks });
    assert.equal(res.records[0].context, ctx);
    assert.equal(hooks.calls[0].rec, res.records[0]);
    store.detach(v);
  });
});

describe('page pool', () => {
  it('2 stores + a dialog queue share 3 slots; the dialog clear() hands its slots to the store waiters', async () => {
    const pool = pageUploadSlots();
    const s1 = getUploadStore({});
    const s2 = getUploadStore({});
    const h1 = manualHooks();
    const h2 = manualHooks();
    const { v: v1 } = makeView();
    const { v: v2 } = makeView();
    s1.attach(v1);
    s2.attach(v2);
    const dialogCalls = [];
    const dialog = new UploadQueue({
      labels: LABELS, slots: pool,
      upload: (f, c) => { const d = deferred(); dialogCalls.push({ c, ...d }); return d.promise; },
    });
    dialog.admit(fakes(2, 'd'));
    drop(s1, v1, fakes(2, 'a'), { hooks: h1 });
    drop(s2, v2, fakes(2, 'b'), { hooks: h2 });
    assert.equal(dialogCalls.length + h1.calls.length + h2.calls.length, 3);
    assert.equal(pool.active, 3);
    assert.deepEqual(uploadStats(), { running: 1, waiting: 3, failed: 0 });
    dialog.clear();
    assert.ok(dialogCalls.every((c) => c.c.signal.aborted));
    assert.equal(dialogCalls.length, 2);
    assert.equal(h1.calls.length + h2.calls.length, 3);
    assert.equal(pool.active, 3);
    s1.detach(v1);
    s2.detach(v2);
  });
});

describe('bulk actions', () => {
  it('retryFailed / removeFailed act on the failed records of the view context only', async () => {
    const store = getUploadStore({});
    const hooks = manualHooks();
    const { v: vx } = makeView('x');
    store.attach(vx);
    drop(store, vx, fakes(2, 'x'), { hooks });
    store.detach(vx);
    const { v: vy } = makeView('y');
    store.attach(vy);
    drop(store, vy, fakes(3, 'y'), { hooks });
    const failAll = async () => { // 3 slots: the waiters start as the running ones fail
      for (let done = 0; done < hooks.calls.length; done++) {
        hooks.calls[done].reject(new Error('boom'));
        await tick();
      }
    };
    await failAll();
    assert.equal(uploadStats().failed, 5);
    assert.equal(store.retryFailed(vy), 3);
    assert.equal(uploadStats().failed, 2);
    await failAll();
    assert.equal(hooks.calls.length, 8);
    assert.equal(store.removeFailed(vy), 3);
    assert.equal(store.records.length, 2);
    assert.ok(store.records.every((r) => r.context === 'x'));
    assert.equal(store.retryFailed(makeView('y').v), 0, 'not the attached view → nothing');
    store.detach(vy);
  });

  it('cancelAllUploads(): every signal aborted (waiting ones never start), stats 0, marks dropped, no toast', async () => {
    const toasts = [];
    const store = getUploadStore({}, { toast: (...a) => toasts.push(a) });
    const hooks = manualHooks();
    const { v } = makeView();
    store.attach(v);
    drop(store, v, fakes(5), { hooks });
    assert.equal(hooks.calls.length, 3);
    store.detach(v);
    assert.equal(cancelAllUploads(), 5);
    await tick();
    assert.ok(hooks.calls.every((c) => c.c.signal.aborted));
    assert.equal(hooks.calls.length, 3);
    assert.deepEqual(uploadStats(), { running: 0, waiting: 0, failed: 0 });
    assert.equal(toasts.length, 0);
    assert.equal(pageUploadSlots().active, 0);
  });
});

describe('caps', () => {
  it(`more than ${UPLOAD_LIMIT} unfinished files → the rest rejected 'count' (n = ${UPLOAD_LIMIT})`, () => {
    const store = getUploadStore({});
    const hooks = manualHooks();
    const { v } = makeView();
    store.attach(v);
    const r1 = drop(store, v, fakes(98, 'a'), { hooks });
    assert.equal(r1.accepted.length, 98);
    const r2 = drop(store, v, [...fakes(3, 'b'), fake('c.txt', 1, 'text/plain')], { hooks, cfg: { accept: 'image/*' } });
    assert.equal(r2.accepted.length, 2);
    assert.deepEqual(r2.rejected.map((r) => r.reason).sort(), ['count', 'type']);
    assert.equal(r2.rejected.find((r) => r.reason === 'count').message, `b2.png: count ${UPLOAD_LIMIT}`);
    store.detach(v);
  });

  it('bytes: a policy file costs min(size, maxBytes, maxSize) until optimised, then its output; no policy → 0', async () => {
    const jobs = [];
    const optimize = (f, policy, { signal }) => {
      const d = deferred();
      jobs.push({ f, signal, ...d });
      return d.promise;
    };
    const store = getUploadStore({}, { optimize });
    const hooks = manualHooks();
    const { v } = makeView();
    store.attach(v);
    drop(store, v, [fake('big.bin', 300 * MiB, 'application/octet-stream')], { hooks });
    assert.equal(store.bytes, 0, 'no policy: a File reference only');
    const policyNull = normalizeImageResizePolicy({ maxWidth: 100, maxBytes: null });
    const policy10 = normalizeImageResizePolicy({ maxWidth: 100, maxBytes: 10 * MiB });
    drop(store, v, [fake('a.png', 50 * MiB)], { hooks, cfg: { policy: policyNull, maxSize: 20 * MiB } });
    assert.equal(store.bytes, 20 * MiB, 'maxBytes null → the maxSize cap');
    drop(store, v, [fake('b.png', 50 * MiB)], { hooks, cfg: { policy: policy10, maxSize: 20 * MiB } });
    assert.equal(store.bytes, 30 * MiB);
    drop(store, v, [fake('c.png', 5 * MiB)], { hooks, cfg: { policy: policyNull, maxSize: null } });
    assert.equal(store.bytes, 35 * MiB, 'no cap at all → the file size');
    // the optimised Blob grew past the estimate: it counts as it is
    const grown = { name: 'c.png', size: 8 * MiB, type: 'image/png' };
    jobs[2].resolve({ kind: 'resized', file: grown, optimization: { changed: true, original: { size: 5 * MiB }, output: { size: 8 * MiB } } });
    await tick();
    assert.equal(store.bytes, 38 * MiB);
    // over 256 MiB estimated → 'count'
    const r = drop(store, v, [fake('d.png', 250 * MiB), fake('e.png', 1 * MiB)], { hooks, cfg: { policy: policyNull, maxSize: null } });
    assert.deepEqual(r.accepted.map((f) => f.name), ['e.png']);
    assert.equal(r.rejected[0].reason, 'count');
    assert.ok(store.bytes <= UPLOAD_BYTES);
    store.detach(v);
  });
});

describe('single (multiple: false)', () => {
  it('a new drop replaces the unfinished file of the SAME session only; extra files → count (n = 1)', async () => {
    const store = getUploadStore({});
    const hooks = manualHooks();
    const { v: old } = makeView();
    store.attach(old);
    drop(store, old, fakes(1, 'old'), { hooks, cfg: { single: true } });
    store.detach(old);
    const { v } = makeView();
    store.attach(v);
    drop(store, v, fakes(1, 'a'), { hooks, cfg: { single: true } });
    const r = drop(store, v, fakes(2, 'b'), { hooks, cfg: { single: true } });
    assert.deepEqual(r.accepted.map((f) => f.name), ['b0.png']);
    assert.equal(r.rejected[0].reason, 'count');
    assert.equal(r.rejected[0].message, 'b1.png: count 1');
    assert.deepEqual(store.records.map((x) => x.name).sort(), ['b0.png', 'old0.png']);
    assert.ok(hooks.calls.find((c) => c.rec.name === 'a0.png').c.signal.aborted);
    assert.ok(!hooks.calls.find((c) => c.rec.name === 'old0.png').c.signal.aborted);
    store.detach(v);
  });
  it(`at the ${UPLOAD_LIMIT}-file cap: ${UPLOAD_LIMIT} background files → 'count'; ${UPLOAD_LIMIT - 1} background + 1 of this session → that one is replaced, total stays ${UPLOAD_LIMIT} (Codex plan r2 #8)`, () => {
    const store = getUploadStore({});
    const hooks = manualHooks();
    const { v: bg } = makeView();
    store.attach(bg);
    assert.equal(drop(store, bg, fakes(UPLOAD_LIMIT, 'bg'), { hooks }).accepted.length, UPLOAD_LIMIT);
    store.detach(bg);
    // a single-mode session with nothing of its own: no room at all
    const { v } = makeView();
    store.attach(v);
    const full = drop(store, v, fakes(1, 'x'), { hooks, cfg: { single: true } });
    assert.equal(full.accepted.length, 0);
    assert.equal(full.rejected.length, 1);
    assert.equal(full.rejected[0].reason, 'count');
    assert.equal(full.rejected[0].message, 'x0.png: count 1');
    assert.equal(store.size, UPLOAD_LIMIT);
    store.detach(v);
    cancelAllUploads();

    // 99 background + 1 file of THIS session: a new drop replaces exactly that file
    const store2 = getUploadStore({});
    const hooks2 = manualHooks();
    const { v: bg2 } = makeView();
    store2.attach(bg2);
    drop(store2, bg2, fakes(UPLOAD_LIMIT - 1, 'bg'), { hooks: hooks2 });
    store2.detach(bg2);
    const { v: me } = makeView();
    store2.attach(me);
    assert.equal(drop(store2, me, fakes(1, 'mine'), { hooks: hooks2, cfg: { single: true } }).accepted.length, 1);
    assert.equal(store2.size, UPLOAD_LIMIT);
    const r = drop(store2, me, fakes(1, 'next'), { hooks: hooks2, cfg: { single: true } });
    assert.deepEqual(r.accepted.map((f) => f.name), ['next0.png']);
    assert.deepEqual(r.rejected, []);
    assert.equal(store2.size, UPLOAD_LIMIT, 'total still at the cap');
    const names = store2.records.map((x) => x.name);
    assert.equal(names.length, UPLOAD_LIMIT);
    assert.ok(names.includes('next0.png'));
    assert.ok(!names.includes('mine0.png'), 'the session file was replaced');
    assert.equal(names.filter((n) => n.startsWith('bg')).length, UPLOAD_LIMIT - 1, 'no background file touched');
    assert.ok(hooks2.calls.filter((c) => c.rec.name.startsWith('bg')).every((c) => !c.c.signal.aborted));
    store2.detach(me);
  });
});
