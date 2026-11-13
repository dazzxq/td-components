// v0.111.0 (plan v0.111.0-media-picker-thumb-loader, C1/C3/C11–C14) — the page-wide thumbnail broker: pace, caps,
// queue order, gate (cooldown → canary → backoff), rate factor lifecycle, per-tab storage records and the page
// registry. Deterministic fake clock / timers / storages / BroadcastChannel only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUDGET, RANK, computeLimits, createBucket, createErrorWindow, compareCandidates, pickNext, parseGateRecord, gateLive,
  createThumbBudget, configureThumbBudget, getThumbBudget, budgetKeyFor, _resetThumbBudgets, isSlowConnection,
} from './thumb-budget.js';

/* ---------- fakes ---------- */

function clock(t0 = 1_000_000) {
  let t = t0;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimeout: (f, ms) => {
      const k = ++seq;
      timers.set(k, { at: t + Math.max(0, ms), f });
      return k;
    },
    clearTimeout: (k) => {
      timers.delete(k);
    },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let nk = null;
        let na = Infinity;
        for (const [k, v] of timers) if (v.at <= end && v.at < na) { na = v.at; nk = k; }
        if (null === nk) break;
        const v = timers.get(nk);
        timers.delete(nk);
        t = Math.max(t, v.at);
        v.f();
      }
      t = end;
    },
    pending: () => timers.size,
  };
}

function store() {
  const m = new Map();
  return {
    m,
    writes: [],
    get length() { return m.size; },
    key(i) { return Array.from(m.keys())[i] ?? null; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { this.writes.push(k); m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
  };
}

function throwingStore() {
  const boom = () => { throw new Error('SecurityError'); };
  return { get length() { return boom(); }, key: boom, getItem: boom, setItem: boom, removeItem: boom };
}

function eventHost(extra = {}) {
  const ls = new Map();
  return Object.assign({
    addEventListener(t, f) { ls.set(t, (ls.get(t) || new Set()).add(f)); },
    removeEventListener(t, f) { if (ls.has(t)) ls.get(t).delete(f); },
    emit(t, ev = {}) { for (const f of Array.from(ls.get(t) || [])) f(Object.assign({ type: t }, ev)); },
    count(t) { return ls.has(t) ? ls.get(t).size : 0; },
  }, extra);
}

function bus() {
  const chans = new Set();
  class BC {
    constructor(name) { this.name = name; this.ls = new Set(); this.closed = false; chans.add(this); }
    addEventListener(t, f) { if ('message' === t) this.ls.add(f); }
    postMessage(data) {
      const copy = JSON.parse(JSON.stringify(data));
      for (const ch of chans) if (ch !== this && ch.name === this.name && !ch.closed) for (const f of ch.ls) f({ data: copy });
    }
    close() { this.closed = true; chans.delete(this); }
  }
  return BC;
}

/** One broker ("tab") in a fake environment; `shared` = the origin's localStorage, `sess` = this tab's session. */
function tab(ck, o = {}) {
  const win = eventHost();
  const b = createThumbBudget(Object.assign({
    budgetKey: 'img.example',
    sharedWindow: true, // cross-tab tests opt in (default off since v0.111.0 C9)
    win,
    now: ck.now,
    setTimeout: ck.setTimeout,
    clearTimeout: ck.clearTimeout,
    random: () => 0,
    storage: null,
    session: null,
    BroadcastChannel: null,
    connection: null,
  }, o));
  return { b, win };
}

/** A queue entry; `started` collects its tickets. */
function entry(id, rank = RANK.visible, dist = 0, extra = {}) {
  const e = {
    id,
    seenAt: 0,
    rank,
    dist,
    attached: true,
    tickets: [],
    dropped: 0,
    measure: () => (e.attached ? { rank: e.rank, dist: e.dist } : null),
    onDrop: () => { e.dropped += 1; },
    start: (tk) => { e.tickets.push(tk); },
  };
  return Object.assign(e, extra);
}

const started = (es) => es.filter((e) => e.tickets.length > 0).length;

/** Error the given entries' current tickets (release first, like the loader's finish()). */
function fail(b, e, n = 1, visible = true) {
  const tk = e.tickets[e.tickets.length - 1];
  tk.release();
  return b.reportError(tk, { id: e.id, visible, n });
}
function pass(b, e) {
  const tk = e.tickets[e.tickets.length - 1];
  tk.release();
  b.reportLoad(tk);
  b.pump();
}

/** Open a gate with three distinct failures (waits for tokens when the bucket is ramping / halved). */
function openCluster(b, ids = ['x1', 'x2', 'x3'], ck = null) {
  const es = ids.map((id) => entry(id));
  for (const e of es) b.request(e);
  b.pump();
  for (let i = 0; ck && i < 100 && started(es) < es.length; i++) { ck.advance(100); b.pump(); }
  let r = 'none';
  for (const e of es) r = fail(b, e);
  return r;
}

/* ---------- pace ---------- */

test('computeLimits: default {500, 10} → 20/s burst 6 conc 6 look-ahead 4; maxRate caps; burst ≤ 6', () => {
  assert.deepEqual(
    (({ rate, burst, concurrency, lookahead, limit, windowSeconds }) => ({ rate, burst, concurrency, lookahead, limit, windowSeconds }))(computeLimits()),
    { rate: 20, burst: 6, concurrency: 6, lookahead: 4, limit: 500, windowSeconds: 10 },
  );
  const dwp = computeLimits({ wafBudget: { limit: 750, windowSeconds: 10 } });
  assert.equal(dwp.rate, 30);
  assert.equal(dwp.burst, 6, 'round(30 × 0.3) = 9, capped at 6 (C11)');
  assert.equal(computeLimits({ wafBudget: { limit: 2000 } }).rate, 30, 'raw 80/s capped by maxRate 30');
  const dsuite = computeLimits({ wafBudget: { limit: 2000 }, maxRate: 12 });
  assert.equal(dsuite.rate, 12);
  assert.equal(dsuite.burst, 4);
  assert.equal(computeLimits({ wafBudget: { limit: 100, windowSeconds: 10 } }).rate, 4);
});

test('computeLimits: Save-Data / 2g → 4/s burst 3 conc 3 look-ahead 2; raw overrides are clamped', () => {
  for (const conn of [{ saveData: true }, { effectiveType: '2g' }, { effectiveType: 'slow-2g' }]) {
    assert.equal(isSlowConnection(conn), true);
    const l = computeLimits({}, conn);
    assert.deepEqual([l.rate, l.burst, l.concurrency, l.lookahead, l.saveData], [4, 3, 3, 2, true]);
  }
  assert.equal(isSlowConnection({ effectiveType: '4g' }), false);
  assert.equal(isSlowConnection(null), false);
  const l = computeLimits({ rate: 1000, burst: 0, concurrency: 0, lookahead: 99 });
  assert.equal(l.rate, 100);
  assert.equal(l.burst, 1);
  assert.equal(l.concurrency, 1);
  assert.equal(l.lookahead, 1, 'look-ahead never above concurrency');
  assert.equal(computeLimits({ rate: NaN, wafBudget: { limit: 'x' } }).rate, 20, 'junk falls back to defaults');
});

test('bucket: starts full, refills per second, never above cap, carries remainders; configure + ramp', () => {
  const ck = clock();
  const b = createBucket(6, 20, ck.now);
  for (let i = 0; i < 6; i++) assert.equal(b.take(), true);
  assert.equal(b.take(), false);
  assert.equal(b.msUntilNext(), 50);
  ck.advance(49);
  assert.equal(b.take(), false);
  ck.advance(1);
  assert.equal(b.take(), true);
  ck.advance(10_000);
  assert.equal(b.level(), 6);
  let got = 0;
  while (b.take()) got++;
  for (let i = 0; i < 10_000; i++) { ck.advance(1); if (b.take()) got++; }
  assert.equal(got, 6 + 200, '10 s at 20/s after draining the burst');
  b.configure(3, 10);
  ck.advance(10_000);
  assert.equal(b.level(), 3, 'a lower cap clamps the level');
  b.configure(6, 20);
  ck.advance(10_000);
  b.ramp(1, 2000);
  assert.equal(b.level(), 1, 'ramp starts at 1 token');
  ck.advance(1000);
  assert.ok(b.level() <= 3.5 && b.level() >= 3, 'half way: cap ≈ 1 + 5/2');
  ck.advance(1000);
  assert.equal(b.level(), 6);
});

test('error window (C11): 3 distinct ids within 2 s; same id ×3 is not a cluster; a repeat-visible needs 1 other id', () => {
  const w = createErrorWindow();
  assert.equal(w.note('a', 0), false);
  assert.equal(w.note('b', 1000), false);
  assert.equal(w.note('c', 2000), true);
  w.reset();
  assert.equal(w.note('a', 0), false);
  assert.equal(w.note('b', 1500), false);
  assert.equal(w.note('c', 4000), false, '2.5 s spread');
  w.reset();
  for (let i = 0; i < 3; i++) assert.equal(w.note('a', i * 10), false);
  w.reset();
  assert.equal(w.note('v', 0, true), false, 'one broken visible image alone never opens');
  assert.equal(w.note('v', 1500, true), false);
  assert.equal(w.note('o', 1600), false, 'other id without the repeat flag: 2 distinct < 3');
  assert.equal(w.note('v', 1700, true), true, 'repeat-visible + 1 other id in window');
});

test('queue order: visible > user > look-ahead (direction) > rest, then distance, then latest seen', () => {
  const v = { rank: RANK.visible, dist: 0, seenAt: 1 };
  const u = { rank: RANK.user, dist: 0, seenAt: 9 };
  const a = { rank: RANK.ahead, dist: 10, seenAt: 1 };
  const a2 = { rank: RANK.ahead, dist: 5, seenAt: 1 };
  const r = { rank: RANK.rest, dist: 0, seenAt: 99 };
  assert.deepEqual([r, a, u, a2, v].sort(compareCandidates), [v, u, a2, a, r]);
  assert.equal(pickNext([]), null);
  const old = { rank: 0, dist: 0, seenAt: 1 };
  const neu = { rank: 0, dist: 0, seenAt: 2 };
  assert.equal(pickNext([old, neu]), neu);
});

/* ---------- broker: caps ---------- */

test('broker: 20 visible requests → 6 start (burst = concurrency); a release frees a slot, the token refills at 20/s', () => {
  const ck = clock();
  const { b } = tab(ck);
  const es = Array.from({ length: 20 }, (_, i) => entry('v' + i));
  for (const e of es) b.request(e);
  b.pump();
  assert.equal(started(es), 6);
  assert.equal(b.stats().inflight, 6);
  es[0].tickets[0].release();
  es[0].tickets[0].release(); // idempotent
  assert.equal(b.stats().inflight, 5);
  b.pump();
  assert.equal(started(es), 6, 'bucket empty');
  ck.advance(50);
  assert.equal(started(es), 7, 'one token after 50 ms');
});

test('broker: pace — 300 requests finishing at once take ≈ (300 − 6) / 20 s; never faster than the bucket', () => {
  const ck = clock();
  const { b } = tab(ck);
  let n = 0;
  const times = [];
  const mk = (i) => entry('p' + i, RANK.visible, 0, { start: (tk) => { n++; times.push(ck.now()); tk.release(); } });
  for (let i = 0; i < 300; i++) b.request(mk(i));
  b.pump();
  for (let i = 0; i < 20_000 && n < 300; i += 10) { ck.advance(10); b.pump(); }
  assert.equal(n, 300);
  const span = times[299] - times[0];
  assert.ok(span >= 14_650 && span <= 14_800, 'span ' + span);
  for (let i = 0; i + 26 < times.length; i++) assert.ok(times[i + 26] - times[i] >= 1000, 'no 1 s window above burst + rate');
});

test('broker: look-ahead holds at most 4 slots; the 2 reserved slots go to visible / user requests', () => {
  const ck = clock();
  const { b } = tab(ck);
  const ahead = Array.from({ length: 10 }, (_, i) => entry('a' + i, RANK.ahead, 100 + i));
  for (const e of ahead) b.request(e);
  b.pump();
  assert.equal(started(ahead), 4);
  assert.equal(b.stats().aheadInflight, 4);
  const vis = [entry('v0'), entry('u0', RANK.user)];
  for (const e of vis) b.request(e);
  b.pump();
  assert.equal(vis[0].tickets.length, 1, 'visible takes a reserved slot');
  assert.equal(vis[1].tickets.length, 1, 'user takes the other');
  const late = entry('v1');
  b.request(late);
  ck.advance(1000);
  b.pump();
  assert.equal(late.tickets.length, 0, 'concurrency 6 reached');
  assert.equal(b.stats().inflight, 6);
});

test('broker: a waiting visible request blocks look-ahead (bucket goes to it first); paused owners are skipped', () => {
  const ck = clock();
  const { b } = tab(ck, { burst: 1 });
  const a = entry('a', RANK.ahead, 10);
  const v = entry('v');
  b.request(a);
  b.request(v);
  b.pump();
  assert.equal(v.tickets.length, 1);
  assert.equal(a.tickets.length, 0);
  const owner = { paused: true };
  const p = entry('p', RANK.visible, 0, { owner });
  b.request(p);
  ck.advance(1000);
  b.pump();
  assert.equal(p.tickets.length, 0, 'hidden tab: never started');
  assert.equal(a.tickets.length, 1, 'look-ahead proceeds while the visible one is paused');
  owner.paused = false;
  ck.advance(1000);
  b.pump();
  assert.equal(p.tickets.length, 1);
});

test('broker: a detached entry (measure → null) is dropped without spending a token', () => {
  const ck = clock();
  const { b } = tab(ck, { burst: 1 });
  const gone = entry('gone');
  gone.attached = false;
  const ok = entry('ok', RANK.visible, 5);
  b.request(gone);
  b.request(ok);
  b.pump();
  assert.equal(gone.dropped, 1);
  assert.equal(gone.tickets.length, 0);
  assert.equal(ok.tickets.length, 1, 'the only token went to the attached entry');
});

/* ---------- gate ---------- */

test('gate: 3 distinct failures → cooldown 12 s + jitter, onGate once, nothing granted; then the canary phase', () => {
  for (const [r, len] of [[0, 12_000], [0.999, 12_999]]) {
    const ck = clock();
    const { b } = tab(ck, { random: () => r });
    const ev = [];
    b.subscribe({ onGate: (i) => ev.push(['gate', i]), onGateEnd: (i) => ev.push(['end', i.kind]) });
    assert.equal(openCluster(b), 'open');
    assert.equal(ev.length, 1);
    assert.equal(ev[0][1].kind, 'cluster');
    assert.equal(Math.round(ev[0][1].remainingMs), len);
    assert.equal(b.isCoolingDown(), true);
    const w = entry('w');
    b.request(w);
    b.pump();
    ck.advance(len - 1);
    assert.equal(w.tickets.length, 0);
    ck.advance(1);
    assert.deepEqual(ev[1], ['end', 'canary']);
    assert.equal(b.phase(), 'canary');
    assert.equal(w.tickets.length, 1, 'canary released');
    assert.equal(w.tickets[0].canary, true);
  }
});

test('canary (C12): one at a time, visible only, never-failed id first; a pass reopens with a 1 → burst ramp', () => {
  const ck = clock();
  const { b } = tab(ck);
  const ends = [];
  b.subscribe({ onGateEnd: (i) => ends.push(i.kind) });
  openCluster(b, ['x1', 'x2', 'x3']);
  b.bump('x1'); // the loader bumps the ledger before reporting
  const old = entry('x1'); // failed before
  const fresh = entry('fresh', RANK.visible, 10);
  const look = entry('look', RANK.ahead, 0);
  for (const e of [old, fresh, look]) b.request(e);
  ck.advance(12_000);
  assert.equal(fresh.tickets.length, 1, 'never-failed id preferred over a closer failed one');
  assert.equal(old.tickets.length + look.tickets.length, 0, 'one canary only; look-ahead is never a canary');
  pass(b, fresh);
  assert.equal(b.phase(), 'open');
  assert.deepEqual(ends, ['canary', 'reopen']);
  assert.equal(old.tickets.length, 1, 'ramp: the bucket holds 1 token right after the reopen');
  assert.equal(look.tickets.length, 0);
  ck.advance(2000);
  b.pump();
  assert.equal(look.tickets.length, 1);
});

test('canary (C12): 2 distinct canaries fail → backoff 24 s, then 48 s, capped at 60 s', () => {
  const ck = clock();
  const { b } = tab(ck);
  const gates = [];
  b.subscribe({ onGate: (i) => gates.push(i) });
  openCluster(b);
  for (const want of [24_000, 48_000, 60_000, 60_000]) {
    const c1 = entry('c1-' + want);
    const c2 = entry('c2-' + want, RANK.visible, 10);
    b.request(c1);
    b.request(c2);
    ck.advance(gates[gates.length - 1].remainingMs);
    assert.equal(c1.tickets.length, 1);
    assert.equal(fail(b, c1), 'gated', 'first canary: wait for the second');
    b.pump();
    assert.equal(c2.tickets.length, 1, 'second canary, distinct id');
    assert.equal(fail(b, c2), 'open');
    assert.equal(gates[gates.length - 1].kind, 'canary');
    assert.equal(gates[gates.length - 1].remainingMs, want);
  }
});

test('canary (C12): a lone failed canary with no second candidate → base cooldown again, no backoff, no factor', () => {
  const ck = clock();
  const { b } = tab(ck);
  const gates = [];
  b.subscribe({ onGate: (i) => gates.push(i) });
  openCluster(b);
  const f1 = b.stats().ownFactor;
  const only = entry('only');
  b.request(only);
  ck.advance(12_000);
  assert.equal(fail(b, only), 'gated');
  assert.equal(gates.length, 2);
  assert.equal(gates[1].kind, 'quiet');
  assert.equal(gates[1].remainingMs, 12_000);
  assert.equal(b.stats().level, 0);
  assert.equal(b.stats().ownFactor, f1);
  // one canary fails, the second passes → reopened at level 0
  const a = entry('a');
  const z = entry('z', RANK.visible, 5);
  b.request(a);
  b.request(z);
  ck.advance(12_000);
  fail(b, a);
  b.pump();
  pass(b, z);
  assert.equal(b.phase(), 'open');
  assert.equal(b.stats().level, 0);
});

test('backoff resets after 30 s clean; a cluster sooner after the reopen escalates', () => {
  const ck = clock();
  const { b } = tab(ck);
  const gates = [];
  b.subscribe({ onGate: (i) => gates.push(i) });
  const reopenNow = () => {
    const c = entry('c' + gates.length);
    b.request(c);
    ck.advance(gates[gates.length - 1].remainingMs);
    pass(b, c);
  };
  openCluster(b, ['a1', 'a2', 'a3']);
  reopenNow();
  ck.advance(5000);
  openCluster(b, ['b1', 'b2', 'b3'], ck);
  assert.equal(gates[1].remainingMs, 24_000, 'cluster 5 s after the reopen');
  reopenNow();
  ck.advance(30_000);
  openCluster(b, ['c1', 'c2', 'c3'], ck);
  assert.equal(gates[2].remainingMs, 12_000, '30 s clean → level 0');
});

/* ---------- rate factor ---------- */

test('rate factor (C13): ×0.5 per gate, floor 0.25, applied to rate and burst; +0.1 per 30 s clean back to 1', () => {
  const ck = clock();
  const { b } = tab(ck);
  openCluster(b);
  assert.equal(b.stats().ownFactor, 0.5);
  let l = b.limits();
  assert.equal(l.factor, 0.5);
  const c = entry('c');
  b.request(c);
  ck.advance(12_000);
  pass(b, c);
  openCluster(b, ['d1', 'd2', 'd3'], ck);
  assert.equal(b.stats().ownFactor, 0.25);
  const c2 = entry('c2');
  b.request(c2);
  ck.advance(24_000);
  pass(b, c2);
  openCluster(b, ['e1', 'e2', 'e3'], ck);
  assert.equal(b.stats().ownFactor, 0.25, 'floor');
  const seen = [];
  for (let i = 0; i < 8; i++) { ck.advance(30_000); seen.push(b.stats().ownFactor); }
  assert.deepEqual(seen, [0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1]);
  l = b.limits();
  assert.equal(l.factor, 1);
});

test('rate factor drives the bucket: factor 0.5 → 10/s and burst 3 after the reopen', () => {
  const ck = clock();
  const { b } = tab(ck);
  openCluster(b);
  const c = entry('c');
  b.request(c);
  ck.advance(12_000);
  pass(b, c);
  ck.advance(5000); // ramp over, bucket at its (halved) cap
  const es = Array.from({ length: 10 }, (_, i) => entry('r' + i, RANK.visible, 0, { start: (tk) => { es[i].tickets.push(tk); tk.release(); } }));
  for (const e of es) b.request(e);
  b.pump();
  assert.equal(started(es), 3, 'burst round(6 × 0.5)');
  ck.advance(100);
  assert.equal(started(es), 4, '10/s → 1 token per 100 ms');
});

/* ---------- per-tab storage ---------- */

test('per-tab slots (C12/C13): each tab writes only its own key, at most once a second; readers sum fresh tabs', () => {
  const ck = clock();
  const shared = store();
  const A = tab(ck, { storage: shared, tabId: 'A' }).b;
  const B = tab(ck, { storage: shared, tabId: 'B' }).b;
  for (let i = 0; i < 5; i++) A.record(1);
  B.record(2);
  assert.deepEqual([...new Set(shared.writes)].sort(), ['td-thumb-budget:img.example:A', 'td-thumb-budget:img.example:B']);
  assert.equal(shared.writes.filter((k) => k.endsWith(':A')).length, 1, 'throttled');
  ck.advance(1000);
  assert.equal(shared.writes.filter((k) => k.endsWith(':A')).length, 2, 'the throttled count is flushed');
  assert.equal(JSON.parse(shared.getItem('td-thumb-budget:img.example:A')).slots.reduce((n, s) => n + s.count, 0), 5);
  for (const k of shared.writes) assert.ok(k.endsWith(':A') || k.endsWith(':B'));
  // B's pump reads A's slots: hold once A + B ≥ 0.6 × limit (300 of 500)
  for (let i = 0; i < 300; i++) A.record(1);
  ck.advance(1000);
  const e = entry('e');
  B.request(e);
  B.pump();
  assert.equal(e.tickets.length, 0, 'held: the IP window is shared');
  assert.ok(B.stats().others >= 300);
  ck.advance(11_000);
  assert.equal(e.tickets.length, 1, 'released once A\'s slots left the 10 s window');
});

test('per-tab slots: stale keys (> 30 s) are removed when met, corrupt ones ignored, storage errors stay local', () => {
  const ck = clock();
  const shared = store();
  shared.setItem('td-thumb-budget:img.example:dead', JSON.stringify({ t: ck.now() - 31_000, slots: [{ second: Math.floor(ck.now() / 1000), count: 999 }] }));
  shared.setItem('td-thumb-budget:img.example:junk', '{nope');
  shared.setItem('td-thumb-budget:img.example:old', JSON.stringify({ t: ck.now() - 20_000, slots: [{ second: Math.floor(ck.now() / 1000), count: 999 }] }));
  shared.setItem('td-thumb-budget:img.example:8443:x', JSON.stringify({ t: ck.now(), slots: [{ second: Math.floor(ck.now() / 1000), count: 999 }] }));
  const { b } = tab(ck, { storage: shared, tabId: 'B' });
  assert.equal(shared.getItem('td-thumb-budget:img.example:dead'), null, 'dead tab removed');
  assert.notEqual(shared.getItem('td-thumb-budget:img.example:junk'), null, 'corrupt: ignored, not trusted');
  assert.equal(b.stats().others, 0, 'old (15–30 s) not counted; another budget key not counted');
  const e = entry('e');
  b.request(e);
  b.pump();
  assert.equal(e.tickets.length, 1);
  const t = tab(ck, { storage: throwingStore(), session: throwingStore(), tabId: 'T' });
  const es = Array.from({ length: 8 }, (_, i) => entry('t' + i));
  for (const x of es) t.b.request(x);
  assert.doesNotThrow(() => t.b.pump());
  assert.equal(started(es), 6);
  for (const x of es) for (const tk of x.tickets) tk.release();
  assert.doesNotThrow(() => openCluster(t.b, ['q1', 'q2', 'q3'], ck));
  assert.doesNotThrow(() => t.win.emit('pagehide'));
});

test('navigation (C13): pagehide carries this tab\'s last-10-s slots in sessionStorage; the next page counts them', () => {
  const ck = clock();
  const shared = store();
  const sess = store();
  const p1 = tab(ck, { storage: shared, session: sess, tabId: 'P1' });
  for (let i = 0; i < 320; i++) p1.b.record(1);
  p1.win.emit('pagehide');
  assert.equal(shared.getItem('td-thumb-budget:img.example:P1'), null, 'own slot key removed at pagehide');
  assert.ok(sess.getItem('td-thumb-nav:img.example'));
  p1.b.destroy();
  ck.advance(500);
  const p2 = tab(ck, { storage: shared, session: sess, tabId: 'P2' });
  assert.equal(sess.getItem('td-thumb-nav:img.example'), null, 'read once');
  assert.equal(p2.b.stats().windowCount, 320);
  const e = entry('e');
  p2.b.request(e);
  p2.b.pump();
  assert.equal(e.tickets.length, 0, '320 ≥ 0.6 × 500: the storefront waits');
  ck.advance(10_000);
  assert.equal(e.tickets.length, 1);
  // sharedWindow false: no slot keys, no carry-over; the gate key is still written
  const s3 = store();
  const off = tab(ck, { storage: s3, session: sess, tabId: 'OFF', sharedWindow: false });
  off.b.record(5);
  openCluster(off.b);
  assert.deepEqual([...s3.m.keys()], ['td-thumb-gate:img.example:OFF']);
});

test('gate records (C14): a stored gate of 12 / 24 / 48 / 60 s is honoured by the other tab; 70 s is dropped', () => {
  for (const [ms, honoured] of [[12_000, true], [24_000, true], [48_000, true], [60_000, true], [61_000, true], [70_000, false]]) {
    const ck = clock();
    const shared = store();
    shared.setItem('td-thumb-gate:img.example:A', JSON.stringify({ until: ck.now() + ms, factor: 0.5, factorAt: ck.now(), t: ck.now() }));
    const { b } = tab(ck, { storage: shared, tabId: 'B' });
    const e = entry('e');
    b.request(e);
    b.pump();
    assert.equal(e.tickets.length, honoured ? 0 : 1, ms + ' ms');
    if (honoured) {
      assert.equal(b.stats().foreignUntil, ck.now() + ms);
      ck.advance(ms - 1);
      assert.equal(e.tickets.length, 0);
      ck.advance(1);
      assert.equal(e.tickets.length, 1, 'released when the foreign gate ends');
    }
  }
  assert.equal(parseGateRecord('{x', 0), null);
  assert.equal(parseGateRecord(JSON.stringify({ until: 1, factor: 'a', factorAt: 0, t: 0 }), 0), null);
  assert.equal(parseGateRecord(JSON.stringify({ until: 66_001, factor: 1, factorAt: 0, t: 0 }), 0), null);
  assert.ok(parseGateRecord(JSON.stringify({ until: 66_000, factor: 1, factorAt: 0, t: 0 }), 0));
});

test('gate records (C14): factor lifecycle across 2 tabs — min live factor, recovery 0.5 → 1, record removed; dead tab expires after 90 s', () => {
  const ck = clock();
  const shared = store();
  const A = tab(ck, { storage: shared, tabId: 'A' });
  const B = tab(ck, { storage: shared, tabId: 'B' });
  openCluster(A.b);
  const key = 'td-thumb-gate:img.example:A';
  const rec = JSON.parse(shared.getItem(key));
  assert.equal(rec.factor, 0.5);
  assert.equal(rec.until, ck.now() + 12_000);
  assert.deepEqual(Object.keys(rec).sort(), ['factor', 'factorAt', 't', 'until']);
  B.win.emit('storage', { key });
  assert.equal(B.b.limits().factor, 0.5, 'B takes the min live factor');
  assert.equal(B.b.limits().rate, 20, 'own pace');
  assert.equal(B.b.stats().foreignUntil, rec.until, 'and the max live until');
  const factors = [];
  for (let i = 0; i < 5; i++) {
    ck.advance(30_000);
    B.win.emit('storage', { key });
    factors.push(B.b.limits().factor);
  }
  assert.deepEqual(factors, [0.6, 0.7, 0.8, 0.9, 1]);
  assert.equal(shared.getItem(key), null, 'A removed its record at factor 1 (gate expired)');
  // a tab that dies mid-recovery: its record stops counting 90 s after its last factorAt
  const canary = entry('canary');
  A.b.request(canary);
  A.b.pump();
  pass(A.b, canary); // A was still in its canary phase
  assert.equal(A.b.phase(), 'open');
  openCluster(A.b, ['k1', 'k2', 'k3'], ck);
  B.win.emit('storage', { key });
  assert.equal(B.b.limits().factor, 0.5);
  A.b.destroy();
  ck.advance(89_999);
  assert.equal(B.b.limits().factor, 0.5);
  ck.advance(1);
  assert.equal(B.b.limits().factor, 1, 'dead tab\'s factor expired');
  B.win.emit('storage', { key });
  assert.equal(shared.getItem(key), null, 'stale record removed when met');
});

test('gate records: only the owner tab writes its key; BroadcastChannel is a fast path (no storage event needed)', () => {
  const ck = clock();
  const shared = store();
  const BC = bus();
  const A = tab(ck, { storage: shared, tabId: 'A', BroadcastChannel: BC });
  const B = tab(ck, { storage: shared, tabId: 'B', BroadcastChannel: BC });
  shared.writes.length = 0;
  openCluster(A.b);
  assert.ok(shared.writes.every((k) => k.endsWith(':A')), 'B never writes A\'s keys');
  assert.ok(B.b.stats().foreignUntil > ck.now(), 'B learnt the gate from the channel');
  const e = entry('e');
  B.b.request(e);
  B.b.pump();
  assert.equal(e.tickets.length, 0);
  ck.advance(12_000);
  assert.equal(e.tickets.length, 1);
  A.b.destroy();
  B.b.destroy();
});

/* ---------- ledger + registry ---------- */

test('ledger: per id, LRU at LEDGER_MAX, clearErrors', () => {
  const ck = clock();
  const { b } = tab(ck, { constants: { LEDGER_MAX: 3 } });
  assert.equal(b.bump('a'), 1);
  assert.equal(b.bump('a'), 2);
  b.bump('b');
  b.bump('c');
  b.bump('a'); // refresh a
  b.bump('d'); // evicts b
  assert.equal(b.errors('b'), 0);
  assert.equal(b.errors('a'), 3);
  b.clearErrors('a');
  assert.equal(b.errors('a'), 0);
});

test('registry: one broker per budgetKey; hosts map to their key; page defaults; reset', () => {
  _resetThumbBudgets();
  const env = { win: null, storage: null, session: null, BroadcastChannel: null, connection: null };
  configureThumbBudget(Object.assign({ wafBudget: { limit: 750 } }, env));
  const photos = configureThumbBudget({ budgetKey: 'photos', hosts: ['A.cdn.example', 'b.cdn.example'] });
  assert.equal(getThumbBudget('photos'), photos);
  assert.equal(photos.limits().rate, 30, 'page defaults applied');
  assert.equal(budgetKeyFor('https://b.cdn.example/x.jpg'), 'photos');
  assert.equal(budgetKeyFor('https://a.cdn.example/x.jpg'), 'photos');
  assert.equal(budgetKeyFor('https://other.example:8443/x.jpg'), 'other.example:8443');
  const other = getThumbBudget('other.example');
  assert.notEqual(other, photos);
  assert.equal(getThumbBudget('other.example'), other);
  configureThumbBudget({ budgetKey: 'photos', maxRate: 12 });
  assert.equal(photos.limits().rate, 12, 'reconfigured in place');
  _resetThumbBudgets();
  assert.notEqual(configureThumbBudget(Object.assign({ budgetKey: 'photos' }, env)), photos);
  _resetThumbBudgets();
});

test('gateLive: until must be in the future and within the bound; factor < 1 and younger than 90 s', () => {
  const t = 100_000;
  assert.deepEqual(gateLive({ until: t + 1, factor: 1, factorAt: t, t }, t), { untilLive: true, factorLive: false });
  assert.deepEqual(gateLive({ until: t, factor: 0.5, factorAt: t - 89_999, t }, t), { untilLive: false, factorLive: true });
  assert.deepEqual(gateLive({ until: t, factor: 0.5, factorAt: t - 90_000, t }, t), { untilLive: false, factorLive: false });
  assert.equal(gateLive({ until: t, factor: 0.1, factorAt: t, t }, t).factorLive, false, 'below the floor = corrupt');
  assert.equal(BUDGET.MAX_BACKOFF_MS + BUDGET.GATE_JITTER_MS + BUDGET.CLOCK_SKEW_MS, 66_000);
});

test('destroy: no timers, no listeners left', () => {
  const ck = clock();
  const shared = store();
  const { b, win } = tab(ck, { storage: shared, tabId: 'A' });
  openCluster(b);
  b.record(1);
  b.destroy();
  assert.equal(ck.pending(), 0);
  assert.equal(win.count('storage'), 0);
  assert.equal(win.count('pagehide'), 0);
});

test('sharedWindow is off by default (C9 harness): no slot keys, no nav carry-over; gate keys still shared', () => {
  const ck = clock();
  const shared = store();
  const sess = store();
  const { b } = tab(ck, { storage: shared, session: sess, tabId: 'D', sharedWindow: undefined });
  b.record(5);
  ck.advance(2000);
  assert.deepEqual([...shared.m.keys()].filter((k) => k.startsWith('td-thumb-budget:')), []);
  openCluster(b);
  assert.ok([...shared.m.keys()].includes('td-thumb-gate:img.example:D'));
});

test('Codex impl r1 ISSUE-1/2: 3 ids sharing ONE broken URL are not a cluster; canaries are visible-only (a user-rank entry waits)', () => {
  const ck = clock();
  const { b } = tab(ck);
  const es = ['a', 'b', 'c'].map((id) => entry(id));
  for (const e of es) b.request(e);
  b.pump();
  let r = 'none';
  for (const e of es) {
    const tk = e.tickets[e.tickets.length - 1];
    tk.release();
    r = b.reportError(tk, { id: e.id, key: 'https://img.example/same.jpg', visible: true, n: 1 });
  }
  assert.equal(r, 'none', 'one URL failing on 3 cards: no gate');
  assert.equal(b.isCoolingDown(), false);
  openCluster(b, ['x1', 'x2', 'x3']);
  const user = entry('u', RANK.user, 0);
  b.request(user);
  ck.advance(12_000);
  b.pump();
  assert.equal(user.tickets.length, 0, 'only a user-rank entry: no canary yet (waits for a visible one)');
  const vis = entry('v', RANK.visible, 50);
  b.request(vis);
  b.pump();
  assert.equal(vis.tickets.length, 1, 'the visible entry is the canary');
  assert.equal(vis.tickets[0].canary, true);
  assert.equal(user.tickets.length, 0, 'a user-rank (off-screen) entry is never a canary');
});

test('Codex impl r2 ISSUE-6: two failed canaries escalate only with distinct ids AND distinct URLs', () => {
  const ck = clock();
  const { b } = tab(ck);
  openCluster(b, ['x1', 'x2', 'x3']);
  const a1 = entry('same', RANK.visible, 0, { key: 'https://img.example/a.jpg' });
  const a2 = entry('same', RANK.visible, 10, { key: 'https://img.example/b.jpg' });
  b.request(a1);
  b.request(a2);
  ck.advance(12_000);
  const first = [a1, a2].find((e) => e.tickets.length);
  const tk = first.tickets[0];
  tk.release();
  const r = b.reportError(tk, { id: 'same', key: first.key, visible: true, n: 1 });
  assert.equal(r, 'gated');
  const second = [a1, a2].find((e) => e !== first);
  ck.advance(13_000);
  b.pump();
  if (second.tickets.length) {
    const t2 = second.tickets[second.tickets.length - 1];
    t2.release();
    b.reportError(t2, { id: 'same', key: second.key, visible: true, n: 1 });
  }
  assert.equal(b.stats().level, 0, 'one id (two URLs): no backoff extension');
});
