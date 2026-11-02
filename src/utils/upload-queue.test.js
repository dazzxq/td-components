import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { UploadQueue, createUploadSlots, acceptsFile, parseFileSize, uploadErrorMessage } = await import('./upload-queue.js');
const { normalizeImageResizePolicy } = await import('./image-resize.js');

const LABELS = {
  rejectType: '{name}: type',
  rejectSize: '{name}: > {max}',
  rejectCount: '{name}: count {n}',
  uploadError: 'Upload failed',
  optimizeError: { 'cannot-satisfy-limits': 'Cannot fit', 'decode-failed': 'Unreadable', default: 'Failed' },
};

const file = (name, size = 10, type = 'image/png') => new File([new Uint8Array(size)], name, { type });
const files = (n, prefix = 'f') => Array.from({ length: n }, (_, i) => file(`${prefix}${i}.png`));
const tick = () => new Promise((r) => setTimeout(r, 0));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** an upload hook whose calls are settled by hand */
function manualHook() {
  const calls = [];
  const hook = (f, ctx) => {
    const d = deferred();
    calls.push({ file: f, ctx, ...d });
    return d.promise;
  };
  return { hook, calls };
}

/** a fake optimizeImage (same signature): jobs settled by hand; onStart runs when the test starts the job */
function manualOptimizer() {
  const jobs = [];
  const optimize = (f, policy, { signal, onStart }) => {
    const d = deferred();
    const job = { file: f, policy, signal, ...d, start: () => onStart && onStart() };
    signal.addEventListener('abort', () => d.reject(Object.assign(new Error('aborted'), { code: 'aborted' })));
    jobs.push(job);
    return d.promise;
  };
  return { optimize, jobs };
}

const POLICY = normalizeImageResizePolicy({ maxWidth: 100 });
const optimized = (f, size = 5) => ({
  kind: 'resized', file: new File([new Uint8Array(size)], f.name, { type: f.type }),
  optimization: { changed: true, original: { size: f.size }, output: { size } },
});

function makeQueue(extra = {}) {
  const changes = [];
  const batches = [];
  const q = new UploadQueue({
    labels: LABELS,
    onChange: (item, kind) => changes.push([item.original.name, kind, item.status]),
    onBatchEnd: (r) => batches.push(r),
    ...extra,
  });
  return { q, changes, batches };
}

describe('acceptsFile / parseFileSize / uploadErrorMessage', () => {
  it('MIME, type/*, .ext, empty accept', () => {
    assert.equal(acceptsFile(file('a.png', 1, 'image/png'), 'image/png'), true);
    assert.equal(acceptsFile(file('a.png', 1, 'image/png'), 'image/*'), true);
    assert.equal(acceptsFile(file('a.pdf', 1, 'application/pdf'), 'image/*'), false);
    assert.equal(acceptsFile(file('A.PDF', 1, 'application/pdf'), '.pdf, image/*'), true);
    assert.equal(acceptsFile(file('a.bin', 1, ''), ''), true);
    assert.equal(acceptsFile(file('a.bin', 1, ''), null), true);
  });
  it('an empty MIME type never matches type/* or a MIME token, only .ext', () => {
    assert.equal(acceptsFile(file('a.heic', 1, ''), 'image/*'), false);
    assert.equal(acceptsFile(file('a.heic', 1, ''), 'image/heic'), false);
    assert.equal(acceptsFile(file('a.heic', 1, ''), '.heic'), true);
  });
  it('parseFileSize (1024-based) and the capped error message', () => {
    assert.equal(parseFileSize('5MB'), 5 * 1024 * 1024);
    assert.equal(parseFileSize('0'), null);
    assert.equal(uploadErrorMessage(new Error('  boom ')), 'boom');
    assert.equal(uploadErrorMessage({ message: 42 }), '');
    assert.equal([...uploadErrorMessage(new Error('x'.repeat(500)))].length, 200);
  });
});

describe('UploadQueue — admission', () => {
  it('rejects type / size / count with the labels; accepted files become items', () => {
    const { q } = makeQueue({ accept: 'image/*', maxSize: 100, limit: 2 });
    const r = q.admit([file('a.png'), file('b.pdf', 1, 'application/pdf'), file('c.png', 500), file('d.png'), file('e.png')]);
    assert.deepEqual(r.accepted.map((f) => f.name), ['a.png', 'd.png']);
    assert.deepEqual(r.rejected.map((x) => [x.file.name, x.reason]), [['b.pdf', 'type'], ['c.png', 'size'], ['e.png', 'count']]);
    assert.equal(r.rejected[0].message, 'b.pdf: type');
    assert.equal(r.rejected[2].message, 'e.png: count 2');
    assert.deepEqual(q.items.map((i) => [i.file.name, i.status, i.ready]), [['a.png', 'selected', true], ['d.png', 'selected', true]]);
  });
  it('single: the first acceptable file replaces every item (aborted, onRemoved)', () => {
    const removed = [];
    const { hook, calls } = manualHook();
    const { q } = makeQueue({ single: true, upload: hook, onRemoved: (i) => removed.push(i.file.name) });
    q.admit([file('a.png')]);
    const r = q.admit([file('b.png'), file('c.png')]);
    assert.deepEqual(r.accepted.map((f) => f.name), ['b.png']);
    assert.deepEqual(r.rejected.map((x) => x.reason), ['count']);
    assert.deepEqual(q.items.map((i) => i.file.name), ['b.png']);
    assert.deepEqual(removed, ['a.png']);
    assert.equal(calls[0].ctx.signal.aborted, true);
  });
  it('without a policy: max size checked at admission; hooks called synchronously inside admit, in order', () => {
    const { hook, calls } = manualHook();
    const order = [];
    const { q } = makeQueue({ upload: hook });
    q.admit(files(5), {
      admitted: () => order.push(`admitted:${calls.length}`),
      added: () => order.push(`added:${calls.length}`),
    });
    assert.deepEqual(order, ['admitted:0', 'added:5']);
    assert.deepEqual(calls.map((c) => c.file.name), ['f0.png', 'f1.png', 'f2.png', 'f3.png', 'f4.png']);
    assert.deepEqual(Object.keys(calls[0].ctx).sort(), ['onProgress', 'signal']);
    assert.equal(q.items[0].waiting, false);
    assert.equal(q.busy, true);
  });
  it('without a hook the items stay selected and nothing is busy', () => {
    const { q, batches } = makeQueue();
    q.admit(files(2));
    assert.equal(q.busy, false);
    assert.deepEqual(q.items.map((i) => i.status), ['selected', 'selected']);
    return tick().then(() => assert.deepEqual(batches, []));
  });
});

describe('UploadQueue — upload hook', () => {
  it('progress (percent and loaded/total), done with the result, error with the message', async () => {
    const { hook, calls } = manualHook();
    const { q } = makeQueue({ upload: hook });
    q.admit(files(2));
    calls[0].ctx.onProgress(40);
    assert.equal(q.items[0].progress, 40);
    calls[0].ctx.onProgress(3, 4);
    assert.equal(q.items[0].progress, 75);
    calls[0].resolve({ id: 'x' });
    calls[1].reject(new Error('Server says no'));
    await tick();
    assert.deepEqual([q.items[0].status, q.items[0].progress, q.items[0].result], ['done', 100, { id: 'x' }]);
    assert.deepEqual([q.items[1].status, q.items[1].uploadFailed, q.items[1].error], ['error', true, 'Server says no']);
    assert.equal(q.busy, false);
  });
  it('a hook that throws synchronously → error state', async () => {
    const { q } = makeQueue({ upload: () => { throw new Error('sync'); } });
    q.admit(files(1));
    await tick();
    assert.equal(q.items[0].status, 'error');
    assert.equal(q.items[0].error, 'sync');
  });
  it('remove while uploading aborts the signal; the late result is ignored', async () => {
    const { hook, calls } = manualHook();
    const { q } = makeQueue({ upload: hook });
    q.admit(files(1));
    const item = q.items[0];
    assert.equal(q.remove(item), true);
    assert.equal(calls[0].ctx.signal.aborted, true);
    calls[0].resolve({});
    await tick();
    assert.equal(item.status, 'uploading');
    assert.equal(q.items.length, 0);
    assert.equal(q.remove(item), false);
  });
  it('retry: only an upload error, the same file goes to the hook again', async () => {
    const { hook, calls } = manualHook();
    const { q } = makeQueue({ upload: hook });
    q.admit(files(1));
    const item = q.items[0];
    assert.equal(q.retry(item), false); // still uploading
    calls[0].reject(new Error('x'));
    await tick();
    assert.equal(q.retry(item), true);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].file, calls[0].file);
    assert.equal(item.status, 'uploading');
  });
});

describe('UploadQueue — image resize policy', () => {
  it('queued → optimizing → uploading, the hook gets optimization + originalFile; maxSize merged into maxBytes', async () => {
    const { hook, calls } = manualHook();
    const { optimize, jobs } = manualOptimizer();
    const { q, changes } = makeQueue({ upload: hook, policy: POLICY, maxSize: 50, optimize, onOptimized: (i) => changes.push(['optimized', i.file.size]) });
    const f = file('big.png', 500);
    const r = q.admit([f]); // over maxSize but a policy is set: not rejected at admission
    assert.equal(r.rejected.length, 0);
    const item = q.items[0];
    assert.equal(item.status, 'queued');
    assert.equal(item.ready, false);
    assert.equal(jobs[0].policy.maxBytes, 50);
    jobs[0].start();
    assert.equal(item.status, 'optimizing');
    jobs[0].resolve(optimized(f, 20));
    await tick();
    assert.equal(item.status, 'uploading');
    assert.equal(item.ready, true);
    assert.equal(calls[0].file.size, 20);
    assert.equal(calls[0].ctx.originalFile, f);
    assert.equal(calls[0].ctx.optimization.output.size, 20);
    assert.ok(changes.some((c) => c[0] === 'optimized'));
  });
  it('a policy maxBytes smaller than maxSize is kept', () => {
    const { optimize, jobs } = manualOptimizer();
    const { q } = makeQueue({ policy: normalizeImageResizePolicy({ maxBytes: 10 }), maxSize: 50, optimize });
    q.admit([file('a.png')]);
    assert.equal(jobs[0].policy.maxBytes, 10);
  });
  it('error codes: output over maxSize / format-not-transformable over the cap → cannot-satisfy-limits; others mapped', async () => {
    const { optimize, jobs } = manualOptimizer();
    const errs = [];
    const { q } = makeQueue({ upload: () => Promise.resolve(), policy: POLICY, maxSize: 50, optimize, onOptimizeError: (o) => errs.push(o.name) });
    q.admit([file('a.png', 500), file('b.gif', 500), file('c.png', 10), file('d.png', 10)]);
    jobs[0].resolve(optimized(q.items[0].original, 80)); // still over 50
    jobs[1].reject(Object.assign(new Error(), { code: 'format-not-transformable' }));
    jobs[2].reject(Object.assign(new Error(), { code: 'decode-failed' }));
    jobs[3].reject(Object.assign(new Error(), { code: 'something-else' }));
    await tick();
    assert.deepEqual(q.items.map((i) => [i.status, i.blocked, i.error]), [
      ['error', true, 'Cannot fit'], ['error', true, 'Cannot fit'], ['error', true, 'Unreadable'], ['error', true, 'Failed'],
    ]);
    assert.deepEqual(errs, ['a.png', 'b.gif', 'c.png', 'd.png']);
    assert.equal(q.retry(q.items[0]), false); // an optimisation error has no retry
  });
  it('not-image over maxSize → rejectSize on the item', async () => {
    const { optimize, jobs } = manualOptimizer();
    const { q } = makeQueue({ policy: POLICY, maxSize: 50, optimize });
    const f = file('doc.pdf', 500, 'application/pdf');
    q.admit([f]);
    jobs[0].resolve({ kind: 'not-image', file: f, optimization: null });
    await tick();
    assert.equal(q.items[0].error, 'doc.pdf: > 50 Bytes');
  });
  it('retry does not optimise again (engine call count)', async () => {
    const { hook, calls } = manualHook();
    const { optimize, jobs } = manualOptimizer();
    const { q } = makeQueue({ upload: hook, policy: POLICY, optimize });
    const f = file('a.png', 100);
    q.admit([f]);
    jobs[0].resolve(optimized(f, 20));
    await tick();
    calls[0].reject(new Error('net'));
    await tick();
    assert.equal(q.retry(q.items[0]), true);
    assert.equal(jobs.length, 1);
    assert.equal(calls[1].file, calls[0].file);
    assert.equal(calls[1].ctx.originalFile, f);
  });
  it('remove while optimising aborts the job; the hook is never called', async () => {
    const { hook, calls } = manualHook();
    const { optimize, jobs } = manualOptimizer();
    const { q } = makeQueue({ upload: hook, policy: POLICY, optimize });
    q.admit([file('a.png')]);
    jobs[0].start();
    q.remove(q.items[0]);
    assert.equal(jobs[0].signal.aborted, true);
    await tick();
    assert.equal(calls.length, 0);
  });
  it('clear() aborts everything; busy goes false', async () => {
    const { hook, calls } = manualHook();
    const { optimize, jobs } = manualOptimizer();
    const { q, batches } = makeQueue({ upload: hook, policy: POLICY, optimize });
    q.admit(files(2));
    assert.equal(q.busy, true);
    q.clear();
    assert.equal(q.busy, false);
    assert.ok(jobs.every((j) => j.signal.aborted));
    await tick();
    assert.equal(calls.length, 0);
    assert.deepEqual(batches, []);
  });
});

describe('createUploadSlots', () => {
  it('starts synchronously while free, FIFO otherwise; release is idempotent', () => {
    const pool = createUploadSlots(2);
    const started = [];
    const rel = {};
    for (const k of ['a', 'b', 'c', 'd']) pool.acquire(null, (r) => { started.push(k); rel[k] = r; });
    assert.deepEqual(started, ['a', 'b']);
    assert.equal(pool.active, 2);
    assert.equal(pool.waiting, 2);
    rel.a();
    rel.a();
    assert.deepEqual(started, ['a', 'b', 'c']);
    assert.equal(pool.active, 2);
  });
  it('an abort while waiting withdraws the request', () => {
    const pool = createUploadSlots(1);
    let release;
    pool.acquire(null, (r) => { release = r; });
    const c = new AbortController();
    let ran = false;
    pool.acquire(c.signal, () => { ran = true; });
    c.abort();
    assert.equal(pool.waiting, 0);
    release();
    assert.equal(ran, false);
    assert.equal(pool.active, 0);
  });
  it('close(): waiting requests never run, releases start nobody, later acquire does not run', () => {
    const pool = createUploadSlots(1);
    let release;
    let ran = 0;
    pool.acquire(null, (r) => { release = r; });
    pool.acquire(null, () => { ran++; });
    pool.close();
    release();
    assert.equal(pool.acquire(null, () => { ran++; }), false);
    assert.equal(ran, 0);
    assert.equal(pool.active, 0);
    assert.equal(pool.waiting, 0);
  });
});

describe('UploadQueue — slots', () => {
  it('pool(2), 5 files: 2 hooks run, the others wait; slots freed on resolve / reject / remove (before the hook settles)', async () => {
    const { hook, calls } = manualHook();
    const pool = createUploadSlots(2);
    const { q } = makeQueue({ upload: hook, slots: pool });
    q.admit(files(5));
    assert.equal(calls.length, 2);
    assert.deepEqual(q.items.map((i) => i.waiting), [false, false, true, true, true]);
    assert.deepEqual(q.items.map((i) => i.status), Array(5).fill('uploading'));
    calls[0].resolve({});
    await tick();
    assert.equal(calls.length, 3);
    assert.equal(q.items[2].waiting, false);
    calls[1].reject(new Error('x'));
    await tick();
    assert.equal(calls.length, 4);
    q.remove(q.items[2]); // hook 3 never settles: its slot is freed at once
    assert.equal(calls.length, 5);
    assert.equal(pool.active, 2);
  });
  it('retry asks for a slot again', async () => {
    const { hook, calls } = manualHook();
    const pool = createUploadSlots(1);
    const { q } = makeQueue({ upload: hook, slots: pool });
    q.admit(files(2));
    calls[0].reject(new Error('x'));
    await tick();
    assert.equal(calls.length, 2); // the second file took the slot
    q.retry(q.items[0]);
    assert.equal(q.items[0].waiting, true);
    assert.equal(calls.length, 2);
    calls[1].resolve({});
    await tick();
    assert.equal(calls.length, 3);
    assert.equal(calls[2].file.name, 'f0.png');
  });
  it('slots as a function is read when a slot is needed', () => {
    const { hook, calls } = manualHook();
    let pool = null;
    const { q } = makeQueue({ upload: hook, slots: () => pool });
    q.admit(files(3));
    assert.equal(calls.length, 3);
    pool = createUploadSlots(1);
    q.admit(files(3, 'g'));
    assert.equal(calls.length, 4);
  });
  it('two queues share one pool(3): never more than 3 running, FIFO by request order', async () => {
    const pool = createUploadSlots(3);
    const running = new Set();
    let peak = 0;
    const order = [];
    const all = [];
    const hook = (f) => {
      order.push(f.name);
      running.add(f.name);
      peak = Math.max(peak, running.size);
      const d = deferred();
      all.push({ name: f.name, d });
      return d.promise.finally(() => running.delete(f.name));
    };
    const a = makeQueue({ upload: hook, slots: pool }).q;
    const b = makeQueue({ upload: hook, slots: pool }).q;
    a.admit(files(2, 'a'));
    b.admit(files(3, 'b'));
    a.admit(files(1, 'c'));
    assert.deepEqual(order, ['a0.png', 'a1.png', 'b0.png']);
    while (all.some((x) => !x.done)) {
      const next = all.find((x) => !x.done);
      next.done = true;
      next.d.resolve({});
      await tick();
    }
    assert.deepEqual(order, ['a0.png', 'a1.png', 'b0.png', 'b1.png', 'b2.png', 'c0.png']);
    assert.ok(peak <= 3);
  });
  it('removing an item waiting for a slot: the hook never runs', async () => {
    const { hook, calls } = manualHook();
    const pool = createUploadSlots(1);
    const { q } = makeQueue({ upload: hook, slots: pool });
    q.admit(files(2));
    q.remove(q.items[1]);
    assert.equal(pool.waiting, 0);
    calls[0].resolve({});
    await tick();
    assert.equal(calls.length, 1);
  });
});

describe('UploadQueue — batches', () => {
  it('once with { ok, fail, total }: slot waiters + optimisation + one optimisation error + one hook error', async () => {
    const { hook, calls } = manualHook();
    const { optimize, jobs } = manualOptimizer();
    const pool = createUploadSlots(2);
    const { q, batches } = makeQueue({ upload: hook, slots: pool, policy: POLICY, optimize });
    const fs = files(5);
    q.admit(fs);
    jobs[0].resolve(optimized(fs[0]));
    jobs[1].resolve(optimized(fs[1]));
    jobs[2].resolve(optimized(fs[2]));
    jobs[3].reject(Object.assign(new Error(), { code: 'decode-failed' }));
    jobs[4].resolve(optimized(fs[4]));
    await tick();
    assert.equal(calls.length, 2);
    assert.deepEqual(batches, []);
    calls[0].resolve({});
    await tick();
    calls[1].reject(new Error('net'));
    await tick();
    calls[2].resolve({});
    await tick();
    assert.deepEqual(batches, []);
    calls[3].resolve({});
    await tick();
    assert.deepEqual(batches, [{ ok: 3, fail: 2, total: 5 }]);
    await tick();
    assert.equal(batches.length, 1);
  });
  it('removing the last waiting item closes the batch without it (microtask)', async () => {
    const { hook, calls } = manualHook();
    const pool = createUploadSlots(1);
    const { q, batches } = makeQueue({ upload: hook, slots: pool });
    q.admit(files(1));
    pool.acquire(null, () => {}); // another owner queues for the slot first (holds it, never releases)
    q.admit(files(1, 'g')); // joins the open batch, waits behind it
    calls[0].resolve({});
    await tick();
    assert.equal(calls.length, 1);
    assert.equal(q.items[1].waiting, true);
    assert.deepEqual(batches, []);
    q.remove(q.items[1]);
    assert.deepEqual(batches, []); // not synchronously
    await Promise.resolve();
    assert.deepEqual(batches, [{ ok: 1, fail: 0, total: 1 }]);
    assert.equal(calls.length, 1);
  });
  it('every item removed / cleared → no call', async () => {
    const { hook } = manualHook();
    const { q, batches } = makeQueue({ upload: hook });
    q.admit(files(2));
    q.remove(q.items[0]);
    q.remove(q.items[0]);
    await tick();
    q.admit(files(2));
    q.clear();
    await tick();
    assert.deepEqual(batches, []);
  });
  it('files added while the batch is open join it', async () => {
    const { hook, calls } = manualHook();
    const { q, batches } = makeQueue({ upload: hook });
    q.admit(files(1));
    q.admit(files(2, 'g'));
    calls[0].resolve({});
    await tick();
    calls[1].resolve({});
    calls[2].reject(new Error('x'));
    await tick();
    assert.deepEqual(batches, [{ ok: 2, fail: 1, total: 3 }]);
  });
  it('retry inside the open batch replaces the outcome (total unchanged); after it closed → a new batch of 1', async () => {
    const { hook, calls } = manualHook();
    const { q, batches } = makeQueue({ upload: hook });
    q.admit(files(2));
    calls[0].reject(new Error('x'));
    await tick();
    q.retry(q.items[0]); // batch still open (item 1 pending)
    calls[2].resolve({});
    calls[1].resolve({});
    await tick();
    assert.deepEqual(batches, [{ ok: 2, fail: 0, total: 2 }]);
    q.admit(files(1, 'g'));
    calls[3].reject(new Error('x'));
    await tick();
    assert.deepEqual(batches[1], { ok: 0, fail: 1, total: 1 });
    q.retry(q.items[2]);
    calls[4].resolve({});
    await tick();
    assert.deepEqual(batches[2], { ok: 1, fail: 0, total: 1 });
  });
  it('an adapter-side AbortError rejection shows an error row but is not counted', async () => {
    const { hook, calls } = manualHook();
    const { q, batches } = makeQueue({ upload: hook });
    q.admit(files(2));
    calls[0].reject(Object.assign(new Error('stop'), { name: 'AbortError' }));
    calls[1].resolve({});
    await tick();
    assert.equal(q.items[0].status, 'error');
    assert.deepEqual(batches, [{ ok: 1, fail: 0, total: 1 }]);
  });
});

describe('UploadQueue — two-phase cancel', () => {
  it('clear() of one queue: none of its waiters start; the other queue takes the freed slots', async () => {
    const pool = createUploadSlots(2);
    const ha = manualHook();
    const hb = manualHook();
    const a = makeQueue({ upload: ha.hook, slots: pool }).q;
    const b = makeQueue({ upload: hb.hook, slots: pool }).q;
    a.admit(files(3, 'a'));
    b.admit(files(3, 'b'));
    assert.equal(ha.calls.length, 2);
    assert.equal(hb.calls.length, 0);
    a.clear();
    assert.equal(ha.calls.length, 2);
    assert.ok(ha.calls.every((c) => c.ctx.signal.aborted));
    assert.equal(hb.calls.length, 2);
    assert.equal(pool.active, 2);
  });
  it('pool close() then clear both queues (teardown order): 0 new hooks after close', async () => {
    const pool = createUploadSlots(2);
    const ha = manualHook();
    const hb = manualHook();
    const a = makeQueue({ upload: ha.hook, slots: pool }).q;
    const b = makeQueue({ upload: hb.hook, slots: pool }).q;
    a.admit(files(3, 'a'));
    b.admit(files(3, 'b'));
    const before = ha.calls.length + hb.calls.length;
    pool.close();
    a.clear();
    b.clear();
    ha.calls.forEach((c) => c.resolve({}));
    await tick();
    assert.equal(ha.calls.length + hb.calls.length, before);
    assert.equal(pool.active, 0);
    let ran = false;
    pool.acquire(null, () => { ran = true; });
    assert.equal(ran, false);
  });
});
