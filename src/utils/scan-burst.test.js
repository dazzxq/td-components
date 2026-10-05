// v0.38.0 (plan v0.38.0-scan-input M1, QĐ 3–11) — the pure core of <td-scan-input>: keystroke rhythm, normalisation,
// dedupe, validate-result shape and the ordered validate queue (generation, cancel, timeout, cap). The same
// SCAN_NORMALIZE_CASES run against php/td.php td__scan_value() in test/php/td-ssr-scan-input.test.js (parity).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBurst, normalizeScan, scanInt, parseTerminator, isDuplicate, normalizeResult, createScanQueue, normalizeValues,
  SCAN_LIMITS, SCAN_NORMALIZE_CASES, MAX_PENDING, MESSAGE_MAX, MAX_VALUES, HARD_MAX,
} from './scan-burst.js';

/** Feed `n` single-character keys `gap` ms apart (first at `t0`); returns the last timestamp. */
function keys(b, n, gap, t0 = 1000) {
  let t = t0;
  for (let i = 0; i < n; i++) { b.add(t, 'key'); t += gap; }
  return t - gap;
}

test('15 characters 3 ms apart → scanner; 120 ms apart → manual', () => {
  const b = createBurst({ keyInterval: 40, minLength: 4 });
  keys(b, 15, 3);
  assert.deepEqual(b.classify(), { source: 'scanner', mixed: false });
  b.reset();
  keys(b, 15, 120);
  assert.deepEqual(b.classify(), { source: 'manual', mixed: false });
});

test('threshold: average gap ≤ key-interval is scanner, > is manual (jitter around 40 ms)', () => {
  const b = createBurst({ keyInterval: 40, minLength: 4 });
  // gaps 30 / 50 / 40 / 40 → mean 40 (≤), none > 160
  for (const t of [0, 30, 80, 120, 160]) b.add(t, 'key');
  assert.equal(b.classify().source, 'scanner');
  b.reset();
  for (const t of [0, 30, 80, 121, 161]) b.add(t, 'key'); // mean 40.25 (>)
  assert.equal(b.classify().source, 'manual');
});

test('one gap > 4 × key-interval inside a fast run → only the fast tail is machine: manual + mixed', () => {
  const b = createBurst({ keyInterval: 40, minLength: 4 });
  keys(b, 3, 150, 0); // typed by hand: 0, 150, 300
  keys(b, 15, 3, 700); // 400 ms later the trigger
  assert.deepEqual(b.classify(), { source: 'manual', mixed: true });
  assert.equal(b.machine(), true, 'the fast tail is a machine burst (tab / none terminators)');
  // a slow gap inside an otherwise fast scan, short tail → plain manual
  b.reset();
  keys(b, 12, 3, 0);
  keys(b, 2, 3, 600);
  assert.deepEqual(b.classify(), { source: 'manual', mixed: false });
  assert.equal(b.machine(), false);
});

test('paste / drop → paste, whatever the rhythm', () => {
  const b = createBurst({ keyInterval: 40, minLength: 4 });
  keys(b, 10, 3);
  b.add(2000, 'paste', 5);
  assert.equal(b.classify().source, 'paste');
});

test('QĐ 5a: a batch insert is never scanner (≥ 50 % → paste, < 50 % → at most manual)', () => {
  const b = createBurst({ keyInterval: 40, minLength: 4 });
  b.add(0, 'batch', 15);
  assert.equal(b.classify().source, 'paste', 'one 15-char insertText');
  b.reset();
  keys(b, 7, 3, 0);
  b.add(25, 'batch', 8); // 8 of 15
  assert.equal(b.classify().source, 'paste');
  b.reset();
  keys(b, 12, 3, 0);
  b.add(40, 'batch', 3); // 3 of 15, fast rhythm otherwise
  assert.equal(b.classify().source, 'manual', 'a small IME batch caps the source at manual');
  assert.equal(b.machine(), false);
});

test('min-length: a fast burst shorter than min-length is manual', () => {
  const b = createBurst({ keyInterval: 40, minLength: 4 });
  keys(b, 3, 3);
  assert.equal(b.classify().source, 'manual');
  keys(b, 1, 3, 1009);
  assert.equal(b.classify().source, 'scanner');
});

test('taint (composition end / deletion) caps at manual; empty burst is manual; reset clears', () => {
  const b = createBurst({ keyInterval: 40, minLength: 4 });
  assert.equal(b.empty, true);
  assert.deepEqual(b.classify(), { source: 'manual', mixed: false });
  keys(b, 15, 3);
  b.taint();
  assert.equal(b.classify().source, 'manual');
  assert.equal(b.machine(), false);
  b.reset();
  keys(b, 15, 3);
  assert.equal(b.classify().source, 'scanner');
});

test('scanInt: integers in range, clamped; anything else → default', () => {
  assert.equal(scanInt('40', SCAN_LIMITS.keyInterval), 40);
  assert.equal(scanInt('2', SCAN_LIMITS.keyInterval), 5);
  assert.equal(scanInt('9999', SCAN_LIMITS.keyInterval), 500);
  assert.equal(scanInt('abc', SCAN_LIMITS.keyInterval), 40);
  assert.equal(scanInt(null, SCAN_LIMITS.minLength), 4);
  assert.equal(scanInt('1.5', SCAN_LIMITS.minLength), 4);
  assert.equal(scanInt('0', SCAN_LIMITS.dedupeWindow), 0);
  assert.equal(scanInt('', SCAN_LIMITS.maxLength), 128);
});

test('parseTerminator: enter (default) | tab | "enter tab" | none', () => {
  assert.deepEqual(parseTerminator(null), { enter: true, tab: false });
  assert.deepEqual(parseTerminator('tab'), { enter: false, tab: true });
  assert.deepEqual(parseTerminator('enter tab'), { enter: true, tab: true });
  assert.deepEqual(parseTerminator(' TAB  enter '), { enter: true, tab: true });
  assert.deepEqual(parseTerminator('none'), { enter: false, tab: false });
  assert.deepEqual(parseTerminator('space'), { enter: true, tab: false }, 'unknown → default');
});

test('normalizeScan == SCAN_NORMALIZE_CASES (C0 / C1 stripped incl. GS1 \\x1D, trim, cut at max code points)', () => {
  for (const [raw, max, want] of SCAN_NORMALIZE_CASES) assert.equal(normalizeScan(raw, max), want, JSON.stringify(raw));
  assert.equal(normalizeScan(null), '');
  assert.equal(normalizeScan(12345), '12345');
  assert.equal(normalizeScan('x'.repeat(500)).length, 128);
});

test('normalizeValues: normalised, empty dropped, duplicates dropped (first kept), capped at MAX_VALUES', () => {
  assert.deepEqual(normalizeValues([' A ', 'B', 'A', '', '\x1D', 'C', 7]), ['A', 'B', 'C', '7']);
  assert.deepEqual(normalizeValues('A'), []);
  assert.equal(normalizeValues(Array.from({ length: MAX_VALUES + 50 }, (_, i) => `v${i}`)).length, MAX_VALUES);
});

test('isDuplicate: same value within the window of the last accepted / pending scan; 0 = off', () => {
  const last = { value: 'A', t: 1000 };
  assert.equal(isDuplicate(last, 'A', 2400, 1500), true);
  assert.equal(isDuplicate(last, 'A', 2600, 1500), false);
  assert.equal(isDuplicate(last, 'B', 1100, 1500), false);
  assert.equal(isDuplicate(last, 'A', 1100, 0), false);
  assert.equal(isDuplicate(null, 'A', 1100, 1500), false);
});

test('normalizeResult: boolean | string | { valid, message, value }; text capped; anything else invalid', () => {
  assert.deepEqual(normalizeResult(true), { valid: true });
  assert.deepEqual(normalizeResult({ valid: true }), { valid: true });
  assert.deepEqual(normalizeResult({ valid: true, value: ' x\x1D1 ' }), { valid: true, value: 'x1' });
  assert.deepEqual(normalizeResult({ valid: true, value: '\x00' }), { valid: true }, 'an empty replacement is ignored');
  assert.deepEqual(normalizeResult(false), { valid: false });
  assert.deepEqual(normalizeResult('Đã có trong danh sách'), { valid: false, message: 'Đã có trong danh sách' });
  assert.deepEqual(normalizeResult(''), { valid: false });
  assert.deepEqual(normalizeResult({ valid: false, message: 'Sai' }), { valid: false, message: 'Sai' });
  assert.equal(normalizeResult('x'.repeat(1000)).message.length, MESSAGE_MAX);
  assert.deepEqual(normalizeResult(undefined), { valid: false });
  assert.deepEqual(normalizeResult(1), { valid: false });
  assert.deepEqual(normalizeResult({ valid: 'yes' }), { valid: false });
  assert.deepEqual(normalizeResult({ valid: false, message: { toString: () => 'x' } }), { valid: false });
});

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** A validator whose calls resolve when the test says so. */
function deferredValidator() {
  const calls = [];
  const fn = (value, ctx) => new Promise((resolve, reject) => { calls.push({ value, ctx, resolve, reject }); });
  return { fn, calls };
}

test('queue: results applied in seq order even when promises settle 3-1-2', async () => {
  const applied = [];
  const q = createScanQueue({ onApply: (e) => applied.push([e.seq, e.result.valid]) });
  const v = deferredValidator();
  q.submit({ seq: 1, value: 'A', source: 'scanner', run: v.fn });
  q.submit({ seq: 2, value: 'B', source: 'scanner', run: v.fn });
  q.submit({ seq: 3, value: 'C', source: 'scanner', run: v.fn });
  assert.equal(q.size, 3);
  v.calls[2].resolve(true);
  await tick();
  assert.deepEqual(applied, [], '3 waits for 1 and 2');
  v.calls[0].resolve(true);
  await tick();
  assert.deepEqual(applied, [[1, true]]);
  v.calls[1].resolve(false);
  await tick();
  assert.deepEqual(applied, [[1, true], [2, false], [3, true]]);
  assert.equal(q.size, 0);
});

test('queue: no validator → valid, still in order behind a pending one; signal + source passed', async () => {
  const applied = [];
  const q = createScanQueue({ onApply: (e) => applied.push(e.seq) });
  const v = deferredValidator();
  q.submit({ seq: 1, value: 'A', source: 'manual', run: v.fn });
  q.submit({ seq: 2, value: 'B', source: 'scanner', run: null });
  assert.equal(v.calls[0].ctx.source, 'manual');
  assert.ok(v.calls[0].ctx.signal instanceof AbortSignal);
  await tick();
  assert.deepEqual(applied, []);
  v.calls[0].resolve(true);
  await tick();
  assert.deepEqual(applied, [1, 2]);
});

test('queue: throw / reject → kind error (the error object kept for the caller to log)', async () => {
  const applied = [];
  const q = createScanQueue({ onApply: (e) => applied.push(e.result) });
  q.submit({ seq: 1, value: 'A', source: 'scanner', run: () => { throw new Error('boom'); } });
  q.submit({ seq: 2, value: 'B', source: 'scanner', run: () => Promise.reject(new Error('net')) });
  await tick();
  assert.equal(applied.length, 2);
  assert.equal(applied[0].kind, 'error');
  assert.equal(applied[0].valid, false);
  assert.equal(applied[1].error.message, 'net');
});

test('queue: timeout aborts the signal and applies kind timeout; a late resolve is ignored', async () => {
  const applied = [];
  const q = createScanQueue({ onApply: (e) => applied.push(e.result) });
  const v = deferredValidator();
  q.submit({ seq: 1, value: 'A', source: 'scanner', run: v.fn, timeoutMs: 20 });
  await tick(60);
  assert.equal(v.calls[0].ctx.signal.aborted, true);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].kind, 'timeout');
  v.calls[0].resolve(true);
  await tick();
  assert.equal(applied.length, 1);
});

test('queue: bump() (generation) drops every pending result even when the validator ignores the signal', async () => {
  const applied = [];
  const q = createScanQueue({ onApply: (e) => applied.push(e.seq) });
  const v = deferredValidator();
  q.submit({ seq: 1, value: 'A', source: 'scanner', run: v.fn });
  q.submit({ seq: 2, value: 'B', source: 'scanner', run: v.fn });
  const g = q.gen;
  q.bump();
  assert.equal(q.gen, g + 1);
  assert.equal(q.size, 0);
  assert.equal(v.calls[0].ctx.signal.aborted, true);
  v.calls[0].resolve(true);
  v.calls[1].resolve(true);
  await tick();
  assert.deepEqual(applied, []);
  q.submit({ seq: 3, value: 'C', source: 'scanner', run: null });
  await tick();
  assert.deepEqual(applied, [3], 'the queue keeps working after a bump');
});

test('queue: cancel(entry) aborts it, skips it and lets the next ones apply', async () => {
  const applied = [];
  const q = createScanQueue({ onApply: (e) => applied.push(e.seq) });
  const v = deferredValidator();
  const a = q.submit({ seq: 1, value: 'A', source: 'scanner', run: v.fn });
  q.submit({ seq: 2, value: 'B', source: 'scanner', run: null });
  await tick();
  q.cancel(a);
  assert.equal(v.calls[0].ctx.signal.aborted, true);
  await tick();
  assert.deepEqual(applied, [2]);
  v.calls[0].resolve(true);
  await tick();
  assert.deepEqual(applied, [2]);
});

test('queue: MAX_PENDING = 16; pending() lists the waiting entries in order', () => {
  assert.equal(MAX_PENDING, 16);
  const q = createScanQueue({ onApply: () => {} });
  const v = deferredValidator();
  for (let i = 1; i <= 3; i++) q.submit({ seq: i, value: `V${i}`, source: 'scanner', run: v.fn });
  assert.deepEqual(q.pending().map((e) => e.value), ['V1', 'V2', 'V3']);
});

test('SEC-3 / ISSUE-7: the timeout handle is cleared on cancel() and bump() (validator never resolves, ignores abort)', () => {
  const active = new Set();
  const origSet = globalThis.setTimeout;
  const origClear = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms) => { const id = origSet(fn, ms); active.add(id); return id; };
  globalThis.clearTimeout = (id) => { active.delete(id); origClear(id); };
  try {
    const q = createScanQueue({ onApply: () => {} });
    const never = () => new Promise(() => {});
    const a = q.submit({ seq: 1, value: 'A', source: 'scanner', run: never, timeoutMs: 60000 });
    assert.equal(active.size, 1);
    q.cancel(a);
    assert.equal(active.size, 0, 'cancel clears the timer');
    q.submit({ seq: 2, value: 'B', source: 'scanner', run: never, timeoutMs: 60000 });
    q.submit({ seq: 3, value: 'C', source: 'scanner', run: never, timeoutMs: 60000 });
    assert.equal(active.size, 2);
    q.bump();
    assert.equal(active.size, 0, 'bump clears every timer');
  } finally {
    for (const id of active) origClear(id);
    globalThis.setTimeout = origSet;
    globalThis.clearTimeout = origClear;
  }
});

test('ISSUE-6: cancel() of an entry already settled but waiting for an older one → never applied', async () => {
  const applied = [];
  const q = createScanQueue({ onApply: (e) => applied.push(e.seq) });
  const v = deferredValidator();
  q.submit({ seq: 1, value: 'A', source: 'scanner', run: v.fn });
  const b = q.submit({ seq: 2, value: 'B', source: 'scanner', run: v.fn });
  v.calls[1].resolve(true);
  await tick();
  assert.equal(b.done, true);
  q.cancel(b);
  assert.equal(q.size, 1);
  v.calls[0].resolve(true);
  await tick();
  assert.deepEqual(applied, [1]);
});

test('HARD_MAX: live scans are capped at 1000 (= MAX_VALUES)', () => {
  assert.equal(HARD_MAX, 1000);
  assert.equal(HARD_MAX, MAX_VALUES);
});
