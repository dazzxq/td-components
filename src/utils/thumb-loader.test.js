// v0.111.0 (plan v0.111.0-media-picker-thumb-loader, C5/C6/C10–C13) — the per-surface thumbnail loader on top of the
// page-wide broker: kept dwp invariants (tokens, finish, ledger, release, detached cells, no IO, visibility, bfcache,
// success rule, src removal), the C11 rewrite (no dwell unless scrolling fast, direction, reserved slots, stricter gate,
// canary), a broker shared by two loaders, Save-Data, IO rebuild on resize, srcset rules, SSR adoption, swap, observe
// and the no-inline-style guard. Fake DOM, fake IO / MO, fake clock; no real timers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createThumbLoader, parseSrcset, cleanSrcset, rootMarginFor, THUMB, CLS, ROOT_CLASS, ATTR,
  configureThumbBudget, getThumbBudget,
} from './thumb-loader.js';
import { createThumbBudget, getThumbBudget as brokerGet, configureThumbBudget as brokerConfigure } from './thumb-budget.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ---------- clock ---------- */

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
    clearTimeout: (k) => { timers.delete(k); },
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

/* ---------- fake DOM ---------- */

function selMatch(e, sel) {
  return sel.split(',').some((part) => {
    const p = part.trim();
    if (p.startsWith('.')) return e.classes.has(p.slice(1));
    const m = /^([a-z]+)?(?:\[([\w-]+)\])?$/.exec(p);
    if (!m) return false;
    if (m[1] && e.tag !== m[1]) return false;
    if (m[2] && !e.attrs.has(m[2])) return false;
    return !!(m[1] || m[2]);
  });
}

function el(tag, attrs = {}) {
  const listeners = [];
  const e = {
    tag,
    nodeType: 1,
    attrs: new Map(Object.entries(attrs)),
    kids: [],
    parentElement: null,
    attached: true,
    classes: new Set(),
    srcSets: 0,
    complete: false,
    naturalWidth: 0,
    rect: { top: 0, bottom: 100 }, // in view unless a test moves it
    get isConnected() {
      for (let n = this; n; n = n.parentElement) if (!n.attached) return false;
      return true;
    },
    setAttribute(k, v) {
      if ('src' === k) {
        this.srcSets += 1;
        this.complete = false;
        this.naturalWidth = 0;
      }
      this.attrs.set(k, String(v));
    },
    getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; },
    removeAttribute(k) { this.attrs.delete(k); },
    addEventListener(t, f, cap) { listeners.push({ t, f, cap: true === cap || !!(cap && cap.capture) }); },
    removeEventListener(t, f, cap) {
      const c = true === cap || !!(cap && cap.capture);
      const i = listeners.findIndex((l) => l.t === t && l.f === f && l.cap === c);
      if (i >= 0) listeners.splice(i, 1);
    },
    listenerCount(t) { return listeners.filter((l) => l.t === t).length; },
    _ls: listeners,
    append(...k) {
      for (const c of k) { c.parentElement = this; this.kids.push(c); }
    },
    remove() {
      if (this.parentElement) this.parentElement.kids.splice(this.parentElement.kids.indexOf(this), 1);
      this.attached = false;
    },
    matches(sel) { return selMatch(this, sel); },
    closest(sel) {
      for (let n = this; n; n = n.parentElement) if (n.matches(sel)) return n;
      return null;
    },
    querySelectorAll(sel) {
      const out = [];
      const walk = (n) => n.kids.forEach((c) => { if (c.matches(sel)) out.push(c); walk(c); });
      walk(this);
      return out;
    },
    getBoundingClientRect() { return this.rect; },
  };
  e.classList = {
    add: (c) => e.classes.add(c),
    remove: (c) => e.classes.delete(c),
    contains: (c) => e.classes.has(c),
  };
  return e;
}

/** Dispatch like the browser: capture listeners of the ancestors (outermost first), then the target's own. */
function dispatch(target, type) {
  const path = [];
  for (let n = target.parentElement; n; n = n.parentElement) path.unshift(n);
  const ev = { type, target };
  for (const n of path) for (const l of n._ls.slice()) if (l.t === type && l.cap) l.f(ev);
  for (const l of target._ls.slice()) if (l.t === type) l.f(ev);
}

const ok = (img, w = 300) => { img.complete = true; img.naturalWidth = w; dispatch(img, 'load'); };
const bad = (img) => { img.complete = true; img.naturalWidth = 0; dispatch(img, 'error'); };
const hasSrc = (img) => img.attrs.has('src');
const cls = (c) => [...c.classes].filter((k) => k.startsWith('is-thumb-')).sort();

const URL0 = (id) => 'https://img.example/p/' + id + '.jpg';

function cell(id, url = URL0(id), extra = {}) {
  const a = el('div', { 'data-td-thumb-cell': '', 'data-id': id });
  const img = el('img', Object.assign({ 'data-td-src': url, alt: '' }, extra));
  a.append(img);
  return { a, img, id };
}

function gridOf(n, from = 0) {
  const grid = el('div');
  const cells = [];
  for (let i = 0; i < n; i++) {
    const c = cell('m' + String(from + i).padStart(3, '0'));
    grid.append(c.a);
    cells.push(c);
  }
  return { grid, cells };
}

function fakeIO() {
  const inst = [];
  class IO {
    constructor(cb, o) { this.cb = cb; this.o = o; this.obs = new Set(); this.dead = false; inst.push(this); }
    observe(e) { this.obs.add(e); }
    unobserve(e) { this.obs.delete(e); }
    disconnect() { this.obs.clear(); this.dead = true; }
  }
  return { IO, inst };
}

function fakeMO() {
  const inst = [];
  class MO {
    constructor(cb) { this.cb = cb; this.dead = false; inst.push(this); }
    observe(root, o) { this.root = root; this.o = o; }
    disconnect() { this.dead = true; }
  }
  return { MO, inst };
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

/**
 * A loader + its broker in a fake page. `budget` = broker options; `broker` = reuse one (shared by 2 loaders).
 */
function setup(o = {}) {
  const ck = o.ck || clock();
  const io = fakeIO();
  const mo = fakeMO();
  const doc = eventHost({ hidden: false, documentElement: { clientHeight: o.innerHeight || 800 }, baseURI: 'https://site.example/shop/', createElement: (t) => el(t) });
  const win = eventHost({ scrollY: 0, location: { protocol: 'https:' } });
  const rafs = [];
  const broker = o.broker || createThumbBudget(Object.assign({
    budgetKey: 'img.example', win: null, now: ck.now, setTimeout: ck.setTimeout, clearTimeout: ck.clearTimeout,
    random: () => 0, storage: null, session: null, BroadcastChannel: null, connection: null,
  }, o.budget || {}));
  const gates = [];
  const L = createThumbLoader(Object.assign({
    win, doc, IO: 'IO' in o ? o.IO : io.IO, MO: mo.MO, now: ck.now, setTimeout: ck.setTimeout, clearTimeout: ck.clearTimeout,
    requestAnimationFrame: (f) => { rafs.push(f); return rafs.length; }, cancelAnimationFrame: () => {},
    onGate: (i) => gates.push(i), budget: broker,
  }, o.loader || {}));
  const g = gridOf(undefined === o.n ? 5 : o.n, o.from || 0);
  const see = (imgs, on = true, k = -1) => {
    const inst = io.inst[k < 0 ? io.inst.length + k : k];
    inst.cb([].concat(imgs).map((target) => ({ target, isIntersecting: on })));
  };
  const flush = () => { while (rafs.length) rafs.shift()(); };
  const scrollTo = (y, after = 0) => { if (after) ck.advance(after); win.scrollY = y; win.emit('scroll'); flush(); };
  return Object.assign({ ck, io, mo, doc, win, broker, gates, L, see, flush, scrollTo }, g);
}

/** Put a cell's image at a viewport position (window viewport = [0, innerHeight]). */
const at = (img, top, h = 100) => { img.rect = { top, bottom: top + h }; };

/* ---------- basics ---------- */

test('scan + IO: a cell in view loads at once (no dwell when not scrolling fast); src = normalised data-td-src', () => {
  const s = setup({ n: 2 });
  for (const c of s.cells) at(c.img, 5000); // outside the margin: the scan does not queue them
  s.L.scan(s.grid);
  assert.ok(s.grid.classes.has(ROOT_CLASS));
  assert.equal(s.cells[0].img.srcSets, 0);
  at(s.cells[0].img, 100);
  s.see(s.cells[0].img);
  assert.equal(s.cells[0].img.getAttribute('src'), URL0('m000'));
  assert.deepEqual(cls(s.cells[0].a), [], 'no class while loading');
  ok(s.cells[0].img);
  assert.deepEqual(cls(s.cells[0].a), [CLS.loaded]);
  assert.equal(s.L.stats().loaded, 1);
  assert.equal(s.cells[1].img.srcSets, 0);
});

test('scan-time rect: cells within viewport + margin queue without waiting for IO; outside do not', () => {
  const s = setup({ n: 3 });
  at(s.cells[0].img, 0);
  at(s.cells[1].img, 800 + 550); // in the 600 px margin
  at(s.cells[2].img, 800 + 700);
  s.L.scan(s.grid);
  assert.equal(s.cells[0].img.srcSets, 1);
  assert.equal(s.cells[1].img.srcSets, 1);
  assert.equal(s.cells[2].img.srcSets, 0);
  s.see([s.cells[0].img, s.cells[1].img]);
  assert.equal(s.cells[0].img.srcSets, 1, 'IO repeating the state does not load twice');
});

test('success only when complete && naturalWidth > 0: a 0-byte load is an error (src removed, waiting)', () => {
  const s = setup({ n: 1 });
  s.L.scan(s.grid);
  const { img, a } = s.cells[0];
  img.complete = true;
  img.naturalWidth = 0;
  dispatch(img, 'load');
  assert.equal(hasSrc(img), false);
  assert.deepEqual(cls(a), [CLS.waiting]);
});

/* ---------- dwell / direction / margin ---------- */

test('dwell (C11): only while scrolling > 1 viewport/s and only for cells outside the real viewport', () => {
  const s = setup({ n: 3 });
  const [inView, ahead, slow] = s.cells;
  for (const c of s.cells) at(c.img, 5000);
  s.L.scan(s.grid);
  s.scrollTo(0);
  s.scrollTo(1000, 100); // 10 000 px/s on an 800 px viewport
  assert.equal(s.L.stats().fast, true);
  assert.equal(s.L.stats().scrollDir, 1);
  at(ahead.img, 900);
  s.see(ahead.img);
  assert.equal(ahead.img.srcSets, 0, 'look-ahead while fast: dwells');
  s.ck.advance(THUMB.DWELL_MS - 1);
  assert.equal(ahead.img.srcSets, 0);
  s.ck.advance(1);
  assert.equal(ahead.img.srcSets, 1);
  at(inView.img, 100);
  s.see(inView.img);
  assert.equal(inView.img.srcSets, 1, 'actually visible: no dwell even while fast');
  // slow scrolling: 100 px over 500 ms = 200 px/s < 800
  s.scrollTo(1100, 500);
  assert.equal(s.L.stats().fast, false);
  at(slow.img, 900);
  s.see(slow.img);
  assert.equal(slow.img.srcSets, 1, 'slow: look-ahead without dwell');
});

test('dwell: leaving before 120 ms never queues; leave + re-enter restarts the dwell', () => {
  const s = setup({ n: 1 });
  const { img } = s.cells[0];
  at(img, 5000);
  s.L.scan(s.grid);
  s.scrollTo(0);
  s.scrollTo(1000, 100);
  at(img, 900);
  s.see(img);
  s.ck.advance(100);
  s.see(img, false);
  s.ck.advance(1000);
  assert.equal(img.srcSets, 0);
  s.scrollTo(2000, 0);
  s.scrollTo(3000, 100);
  s.see(img);
  s.ck.advance(119);
  assert.equal(img.srcSets, 0);
  s.ck.advance(1);
  assert.equal(img.srcSets, 1);
});

test('direction (C11): look-ahead in the scroll direction goes first', () => {
  const s = setup({ n: 2, budget: { burst: 1 } });
  const [above, below] = s.cells;
  for (const c of s.cells) at(c.img, 5000);
  s.L.scan(s.grid);
  s.scrollTo(0);
  s.scrollTo(100, 500); // slow, downwards
  at(above.img, -150); // 50 px above the viewport
  at(below.img, 1100); // 300 px below
  s.broker.limits(); // bucket full (1)
  s.see([above.img, below.img]);
  assert.equal(below.img.srcSets, 1, 'scrolling down: the cell below wins despite the larger distance');
  assert.equal(above.img.srcSets, 0);
  const t = clock();
  const up = setup({ n: 2, budget: { burst: 1 }, ck: t });
  for (const c of up.cells) at(c.img, 5000);
  up.L.scan(up.grid);
  up.scrollTo(1000);
  up.scrollTo(900, 500); // upwards
  at(up.cells[0].img, -150);
  at(up.cells[1].img, 1100);
  up.see([up.cells[0].img, up.cells[1].img]);
  assert.equal(up.cells[0].img.srcSets, 1);
  assert.equal(up.cells[1].img.srcSets, 0);
});

test('rootMargin (C11) = clamp(300, 0.75 × height, 600); a resize rebuilds the IO (debounced) only when it changes', () => {
  assert.equal(rootMarginFor(0), 300);
  assert.equal(rootMarginFor(400), 300);
  assert.equal(rootMarginFor(600), 450);
  assert.equal(rootMarginFor(2000), 600);
  const s = setup({ n: 3, innerHeight: 400 });
  for (const c of s.cells) at(c.img, 5000);
  s.L.scan(s.grid);
  assert.equal(s.io.inst.length, 1);
  assert.equal(s.io.inst[0].o.rootMargin, '300px 0px');
  s.doc.documentElement.clientHeight = 600;
  s.win.emit('resize');
  s.ck.advance(50);
  s.win.emit('resize');
  s.ck.advance(THUMB.RESIZE_DEBOUNCE_MS - 1);
  assert.equal(s.io.inst.length, 1, 'debounced');
  s.ck.advance(1);
  assert.equal(s.io.inst.length, 2);
  assert.equal(s.io.inst[0].dead, true);
  assert.equal(s.io.inst[1].o.rootMargin, '450px 0px');
  assert.equal(s.io.inst[1].obs.size, 3, 'live cells re-observed');
  assert.equal(s.L.stats().rootMargin, 450);
  s.doc.documentElement.clientHeight = 610; // 457.5 → 458 ≠ 450
  s.win.emit('resize');
  s.ck.advance(200);
  assert.equal(s.io.inst.length, 3);
  s.win.emit('resize');
  s.ck.advance(200);
  assert.equal(s.io.inst.length, 3, 'same margin: no rebuild');
  // the new IO drives the cells
  at(s.cells[0].img, 100);
  s.see(s.cells[0].img);
  assert.equal(s.cells[0].img.srcSets, 1);
});

/* ---------- caps / broker ---------- */

test('reserved slots via the loader: 10 look-ahead + 2 visible → 2 visible + 4 look-ahead loading', () => {
  const s = setup({ n: 12 });
  for (let i = 0; i < 10; i++) at(s.cells[i].img, 900 + i * 10);
  at(s.cells[10].img, 100);
  at(s.cells[11].img, 300);
  s.L.scan(s.grid);
  const loading = s.cells.filter((c) => hasSrc(c.img));
  assert.equal(loading.length, 6);
  assert.ok(hasSrc(s.cells[10].img) && hasSrc(s.cells[11].img));
  assert.equal(s.broker.stats().aheadInflight, 4);
  assert.equal(s.L.stats().inflight, 6);
});

test('a broker shared by two loaders: one bucket + caps for the page; a gate from one gates the other', () => {
  const ck = clock();
  const A = setup({ n: 6, ck });
  const B = setup({ n: 2, from: 100, ck, broker: A.broker });
  A.L.scan(A.grid);
  assert.equal(A.cells.filter((c) => hasSrc(c.img)).length, 6);
  B.L.scan(B.grid);
  assert.equal(B.cells.filter((c) => hasSrc(c.img)).length, 0, 'page-wide caps');
  ok(A.cells[0].img);
  ck.advance(50);
  assert.equal(B.cells[0].img.srcSets, 1, 'freed slot + token → the other surface');
  // three distinct failures on A open the gate: B's loading cell is cancelled and gated too
  bad(A.cells[1].img);
  bad(A.cells[2].img);
  bad(A.cells[3].img);
  assert.equal(A.gates.length, 1, 'onGate once');
  assert.equal(B.gates.length, 1, 'B had live cells: told once');
  assert.equal(hasSrc(B.cells[0].img), false);
  assert.deepEqual(cls(B.cells[0].a), [CLS.waiting]);
  assert.equal(A.broker.stats().inflight, 0, 'every slot released');
});

test('Save-Data (C11): 10 visible cells → 3 loading', () => {
  const s = setup({ n: 10, budget: { connection: { saveData: true } } });
  s.L.scan(s.grid);
  assert.equal(s.cells.filter((c) => hasSrc(c.img)).length, 3);
});

test('no IntersectionObserver: every cell counts as in view, still through bucket + caps', () => {
  const s = setup({ n: 20, IO: null });
  s.L.scan(s.grid);
  assert.equal(s.cells.filter((c) => hasSrc(c.img)).length, 6);
});

test('hidden tab: no new loads, in-flight kept; visible again → continues; pageshow persisted → resume + rescan', () => {
  const s = setup({ n: 10 });
  s.L.scan(s.grid);
  assert.equal(s.L.stats().inflight, 6);
  s.doc.hidden = true;
  s.doc.emit('visibilitychange');
  ok(s.cells[0].img);
  s.ck.advance(5000);
  assert.equal(s.L.stats().inflight, 5, 'nothing new while hidden');
  assert.ok(hasSrc(s.cells[1].img), 'in-flight not cancelled');
  s.doc.hidden = false;
  s.doc.emit('visibilitychange');
  assert.equal(s.L.stats().inflight, 6);
  s.L.pause();
  const more = cell('late');
  s.grid.append(more.a);
  s.win.emit('pageshow', { persisted: false });
  assert.equal(more.img.srcSets, 0);
  for (const c of s.cells) if (hasSrc(c.img)) ok(c.img);
  s.win.emit('pageshow', { persisted: true });
  assert.ok(hasSrc(more.img), 'bfcache restore: resumed and rescanned');
});

test('detached when its turn comes: dropped, no token, no attempt; re-attached + scan → loads', () => {
  const s = setup({ n: 2, budget: { burst: 1 } });
  const [gone, next] = s.cells;
  at(gone.img, 0);
  at(next.img, 200);
  s.L.scan(s.grid); // gone takes the only token
  ok(gone.img);
  const g2 = cell('g2');
  s.grid.append(g2.a);
  at(g2.img, 0);
  s.L.scan(s.grid); // queued (no token)
  g2.a.attached = false;
  s.ck.advance(50);
  s.broker.pump();
  assert.equal(g2.img.srcSets, 0);
  assert.equal(next.img.srcSets, 1, 'the token went to the attached cell');
  assert.equal(s.broker.errors('g2'), 0);
  g2.a.attached = true;
  s.ck.advance(50);
  s.L.scan(s.grid);
  assert.equal(g2.img.srcSets, 1);
});

/* ---------- errors, retry, gate ---------- */

test('single error: src/srcset/sizes removed first, waiting class, one retry after 1.5 s, no gate', () => {
  const s = setup({ n: 1 });
  s.L.scan(s.grid);
  const { img, a } = s.cells[0];
  bad(img);
  assert.equal(hasSrc(img), false);
  assert.equal(img.attrs.has('srcset'), false);
  assert.deepEqual(cls(a), [CLS.waiting]);
  assert.equal(s.gates.length, 0);
  s.ck.advance(THUMB.RETRY_DELAY_MS - 1);
  assert.equal(img.srcSets, 1);
  s.ck.advance(1);
  assert.equal(img.srcSets, 2);
  ok(img);
  assert.deepEqual(cls(a), [CLS.loaded]);
  assert.equal(s.broker.errors('m000'), 0, 'a load clears the id');
});

test('gate rule (C11): one visible image failing alone never gates — it fails after 3 loads; plus 1 other URL → gate', () => {
  const s = setup({ n: 1 });
  s.L.scan(s.grid);
  const { img, a } = s.cells[0];
  at(img, 100);
  bad(img);
  s.ck.advance(1500);
  bad(img);
  assert.equal(s.gates.length, 0, 'repeat-visible without another failing URL');
  s.ck.advance(1500);
  assert.equal(img.srcSets, 3);
  bad(img);
  assert.deepEqual(cls(a), [CLS.failed]);
  s.ck.advance(60_000);
  assert.equal(img.srcSets, 3, 'max 3 loads, the first included');
  const t = setup({ n: 2 });
  t.L.scan(t.grid);
  const [v, o] = t.cells;
  at(v.img, 100);
  bad(v.img);
  t.ck.advance(1500);
  bad(o.img); // another URL in the 2 s window
  assert.equal(t.gates.length, 0);
  bad(v.img); // visible, 2nd failure
  assert.equal(t.gates.length, 1);
});

test('gate: 3 distinct failures → loading / queued / retrywait gated without spending attempts; canary after 12 s', () => {
  const s = setup({ n: 9 });
  s.L.scan(s.grid);
  const c = s.cells;
  bad(c[0].img); // retrywait
  s.ck.advance(100);
  bad(c[1].img);
  bad(c[2].img);
  assert.equal(s.gates.length, 1);
  assert.ok(s.gates[0].remainingMs >= 12_000 && s.gates[0].remainingMs <= 13_000);
  for (const x of c) assert.equal(hasSrc(x.img), false, x.id + ' no src');
  for (const x of c) assert.deepEqual(cls(x.a), [CLS.waiting]);
  for (const x of c.slice(3)) assert.equal(s.broker.errors(x.id), 0, 'cancelled loads are not attempts');
  assert.equal(s.broker.stats().inflight, 0);
  s.ck.advance(12_000);
  const loading = c.filter((x) => hasSrc(x.img));
  assert.equal(loading.length, 1, 'one canary');
  assert.equal(s.broker.errors(loading[0].id), 0, 'a never-failed id');
  ok(loading[0].img);
  assert.equal(c.filter((x) => hasSrc(x.img) && !x.a.classes.has(CLS.loaded)).length, 1, 'ramp: 1 token right after');
  s.ck.advance(2000);
  s.broker.pump();
  assert.equal(c.filter((x) => hasSrc(x.img) && !x.a.classes.has(CLS.loaded)).length, 6);
});

test('token: release mid-load → src removed, inflight −1 exactly (loader and broker); late events ignored; no duplicate', () => {
  const s = setup({ n: 1 });
  s.L.scan(s.grid);
  const { img } = s.cells[0];
  assert.equal(s.broker.stats().inflight, 1);
  s.L.release(s.grid);
  assert.equal(hasSrc(img), false);
  assert.equal(s.L.stats().inflight, 0);
  assert.equal(s.broker.stats().inflight, 0);
  assert.equal(img.listenerCount('load') + img.listenerCount('error'), 0);
  ok(img);
  bad(img);
  assert.equal(s.L.stats().inflight, 0);
  assert.equal(s.broker.stats().inflight, 0);
  assert.equal(s.broker.errors('m000'), 0);
  // replacing a loading image: the new DOM with the same id loads once
  const g = gridOf(1);
  s.L.scan(g.grid);
  assert.equal(g.cells[0].img.srcSets, 1);
  assert.equal(s.broker.stats().inflight, 1);
});

test('a late error of an old token after the retry started is ignored', () => {
  const s = setup({ n: 1 });
  s.L.scan(s.grid);
  const { img } = s.cells[0];
  const oldErr = img._ls.find((l) => l.t === 'error').f;
  bad(img);
  s.ck.advance(1500);
  assert.equal(img.srcSets, 2);
  oldErr({ type: 'error' });
  assert.equal(s.broker.errors('m000'), 1);
  assert.equal(s.L.stats().inflight, 1);
});

test('ledger by id: rebuilt DOM with an exhausted id fails at once (0 loads); userInitiated clears; healthy swaps never fail', () => {
  const s = setup({ n: 1 });
  s.L.scan(s.grid);
  const { img } = s.cells[0];
  for (let i = 0; i < 3; i++) { bad(img); s.ck.advance(1500); }
  assert.deepEqual(cls(s.cells[0].a), [CLS.failed]);
  const again = gridOf(1);
  s.L.scan(again.grid);
  assert.equal(again.cells[0].img.srcSets, 0);
  assert.deepEqual(cls(again.cells[0].a), [CLS.failed]);
  s.L.release(again.grid);
  s.L.scan(again.grid, { userInitiated: true });
  assert.equal(again.cells[0].img.srcSets, 1);
  for (let i = 0; i < 20; i++) {
    const g = gridOf(1, 50);
    s.L.scan(g.grid);
    ok(g.cells[0].img);
    assert.deepEqual(cls(g.cells[0].a), [CLS.loaded]);
    s.L.release(g.grid);
    s.ck.advance(100);
  }
});

test('released cells back to idle; loaded cells kept; a waiting class is normalised on rescan', () => {
  const s = setup({ n: 3 });
  s.L.scan(s.grid);
  ok(s.cells[0].img);
  bad(s.cells[1].img);
  s.L.release(s.grid);
  assert.deepEqual(cls(s.cells[0].a), [CLS.loaded]);
  assert.deepEqual(cls(s.cells[1].a), []);
  s.ck.advance(5000);
  assert.equal(s.cells[1].img.srcSets, 1, 'release cancelled the retry timer');
  s.L.scan(s.grid);
  assert.equal(s.cells[0].img.srcSets, 1, 'loaded: skipped');
  assert.equal(s.cells[1].img.srcSets, 2);
});

/* ---------- URL policy + srcset ---------- */

test('URL policy (C12): safeMediaUrl — relative resolves, javascript: / http-on-https fail at once without a token', () => {
  const s = setup({ n: 0, budget: { burst: 1 } });
  const rel = cell('rel', '/media/a.jpg');
  const js = cell('js', 'javascript:alert(1)');
  const http = cell('http', 'http://img.example/a.jpg');
  s.grid.append(js.a, http.a, rel.a);
  s.L.scan(s.grid);
  assert.deepEqual(cls(js.a), [CLS.failed]);
  assert.deepEqual(cls(http.a), [CLS.failed]);
  assert.equal(js.img.srcSets + http.img.srcSets, 0);
  assert.equal(rel.img.getAttribute('src'), 'https://site.example/media/a.jpg', 'the only token went to the valid one');
  assert.equal(s.broker.errors('js'), 0);
});

test('parseSrcset: commas inside URLs survive; trailing commas; descriptors', () => {
  assert.deepEqual(parseSrcset('https://c.ex/cdn-cgi/image/width=200,q=75/a.jpg 200w, https://c.ex/b.jpg 2x,https://c.ex/c.jpg,'), [
    { url: 'https://c.ex/cdn-cgi/image/width=200,q=75/a.jpg', desc: '200w' },
    { url: 'https://c.ex/b.jpg', desc: '2x' },
    { url: 'https://c.ex/c.jpg', desc: '' },
  ]);
  assert.deepEqual(parseSrcset(''), []);
  assert.deepEqual(parseSrcset(' , ,'), []);
  assert.deepEqual(parseSrcset(null), []);
});

test('cleanSrcset (C13): bad candidates dropped, another budget drops the srcset, declared hosts kept', () => {
  const u = { baseURI: 'https://site.example/', protocol: 'https:' };
  const src = 'https://img.example/a.jpg';
  const b = { key: 'img.example', hasHost: (h) => 'img2.example' === h };
  assert.equal(cleanSrcset('/x.jpg 1x', src, b, u), '', 'relative → site host, another budget');
  assert.equal(
    cleanSrcset('https://img.example/a-200.jpg 200w, javascript:x 300w, https://img.example/b.jpg 0w, https://img.example/c.jpg 1.5q, https://img.example/d.jpg 400w', src, b, u),
    'https://img.example/a-200.jpg 200w, https://img.example/d.jpg 400w',
  );
  assert.equal(cleanSrcset('https://img.example/a.jpg 1x, https://evil.example/b.jpg 2x', src, b, u), '');
  assert.equal(cleanSrcset('https://img2.example/b.jpg 2x', src, b, u), 'https://img2.example/b.jpg 2x');
  assert.equal(cleanSrcset('', src, b, u), '');
  assert.equal(cleanSrcset('   ', src, b, u), '');
  assert.equal(cleanSrcset('https://img.example/a.jpg 1x, https://img.example/b.jpg 1x', src, b, u), 'https://img.example/a.jpg 1x', 'duplicate descriptor');
});

test('srcset in the loader: sizes + srcset set before src; cross-budget srcset → src only; error removes all three', () => {
  const s = setup({ n: 0 });
  const a = cell('a', URL0('a'), { 'data-td-srcset': 'https://img.example/a-1.jpg 1x, https://img.example/a-2.jpg 2x', 'data-td-sizes': '200px' });
  const x = cell('x', URL0('x'), { 'data-td-srcset': 'https://other.example/x-2.jpg 2x', 'data-td-sizes': '200px' });
  s.grid.append(a.a, x.a);
  const order = [];
  const set = a.img.setAttribute.bind(a.img);
  a.img.setAttribute = (k, v) => { order.push(k); set(k, v); };
  s.L.scan(s.grid);
  assert.deepEqual(order, ['sizes', 'srcset', 'src']);
  assert.equal(a.img.getAttribute('srcset'), 'https://img.example/a-1.jpg 1x, https://img.example/a-2.jpg 2x');
  assert.equal(x.img.getAttribute('srcset'), null);
  assert.equal(x.img.getAttribute('sizes'), null);
  assert.ok(hasSrc(x.img));
  bad(a.img);
  for (const k of ['src', 'srcset', 'sizes']) assert.equal(a.img.getAttribute(k), null, k);
});

/* ---------- SSR adoption ---------- */

test('SSR adoption (C6/C12/C13): complete ok → loaded (window +1); failed before JS → recovered; in-flight holds a slot; out-of-margin lazy → converted', () => {
  const s = setup({ n: 0 });
  const mk = (id, attrs) => {
    const c = cell(id, undefined, {});
    c.img.attrs.delete('data-td-src');
    for (const [k, v] of Object.entries(attrs)) c.img.attrs.set(k, v);
    s.grid.append(c.a);
    return c;
  };
  const done = mk('done', { src: URL0('done'), 'data-td-managed-img': '' });
  done.img.complete = true;
  done.img.naturalWidth = 300;
  const broke = mk('broke', { src: URL0('broke'), srcset: 'https://img.example/broke-2.jpg 2x', 'data-td-managed-img': '' });
  broke.img.complete = true;
  broke.img.naturalWidth = 0;
  const flying = mk('fly', { src: URL0('fly'), 'data-td-managed-img': '' });
  at(flying.img, 300);
  const lazy = mk('lazy', { src: URL0('lazy'), loading: 'lazy', 'data-td-managed-img': '' });
  at(lazy.img, 4000);
  const plain = mk('plain', { src: URL0('plain') }); // no marker: out of scope
  s.L.scan(s.grid);
  assert.deepEqual(cls(done.a), [CLS.loaded]);
  assert.equal(done.img.srcSets, 0, 'untouched');
  assert.equal(hasSrc(broke.img), false, 'no broken icon');
  assert.equal(broke.img.getAttribute('data-td-src'), URL0('broke'), 'original stashed');
  assert.equal(broke.img.getAttribute('data-td-srcset'), 'https://img.example/broke-2.jpg 2x');
  assert.deepEqual(cls(broke.a), [CLS.waiting]);
  assert.equal(s.broker.errors('broke'), 1, 'the pre-adoption load counts');
  assert.equal(flying.img.srcSets, 0, 'in flight: not re-requested');
  assert.equal(s.broker.stats().inflight, 1, 'but it holds a slot');
  assert.equal(hasSrc(lazy.img), false);
  assert.equal(lazy.img.getAttribute('loading'), null);
  assert.equal(lazy.img.getAttribute('data-td-src'), URL0('lazy'));
  assert.equal(cls(plain.a).length, 0);
  assert.equal(s.broker.stats().windowCount, 3, 'done + broke + fly counted');
  ok(flying.img);
  assert.deepEqual(cls(flying.a), [CLS.loaded]);
  assert.equal(s.broker.stats().inflight, 0);
  s.ck.advance(1500);
  assert.equal(broke.img.getAttribute('src'), URL0('broke'), 'retried through the broker');
  assert.equal(broke.img.getAttribute('srcset'), 'https://img.example/broke-2.jpg 2x');
  at(lazy.img, 500);
  s.see(lazy.img);
  assert.equal(lazy.img.getAttribute('src'), URL0('lazy'));
});

test('SSR: the capture-phase error listener recovers a managed image failing outside the loader; unmarked ones untouched', () => {
  const s = setup({ n: 0 });
  const m = cell('m', undefined);
  m.img.attrs.delete('data-td-src');
  m.img.attrs.set('src', URL0('m'));
  m.img.attrs.set('data-td-managed-img', '');
  m.img.complete = true;
  m.img.naturalWidth = 300;
  const plain = el('img', { src: URL0('plain') });
  s.grid.append(m.a, plain);
  s.L.scan(s.grid);
  assert.deepEqual(cls(m.a), [CLS.loaded]);
  // the site swaps the src of the managed image and it fails
  m.img.attrs.set('src', URL0('m2'));
  bad(m.img);
  assert.equal(hasSrc(m.img), false);
  assert.equal(m.img.getAttribute('data-td-src'), URL0('m2'));
  assert.deepEqual(cls(m.a), [CLS.waiting]);
  s.ck.advance(1500);
  assert.equal(m.img.getAttribute('src'), URL0('m2'));
  bad(plain);
  assert.equal(plain.getAttribute('src'), URL0('plain'), 'no marker: not ours');
  // a managed image inserted after the scan and failing before any scan → adopted by the listener
  const late = el('img', { src: URL0('late'), 'data-td-managed-img': '' });
  s.grid.append(late);
  bad(late);
  assert.equal(hasSrc(late), false);
  assert.equal(late.getAttribute('data-td-src'), URL0('late'));
});

/* ---------- swap / observe ---------- */

test('swap (C6e): the current image stays until the new one loaded; failure keeps it; hover dwells; bad URL refused', () => {
  const s = setup({ n: 1 });
  s.L.scan(s.grid);
  const { img } = s.cells[0];
  ok(img);
  const probes = [];
  const mkEl = s.doc.createElement;
  s.doc.createElement = (t) => { const e = mkEl(t); probes.push(e); return e; };
  assert.equal(s.L.swap(img, URL0('red')), true);
  assert.equal(img.getAttribute('src'), URL0('m000'), 'old picture kept');
  assert.equal(probes.length, 1);
  assert.equal(probes[0].getAttribute('src'), URL0('red'));
  ok(probes[0]);
  assert.equal(img.getAttribute('src'), URL0('red'));
  assert.equal(img.getAttribute('data-td-src'), URL0('red'), 'a later rescan keeps the new picture');
  assert.equal(s.L.swap(img, URL0('blue')), true);
  bad(probes[1]);
  assert.equal(img.getAttribute('src'), URL0('red'), 'failure: the current image stays');
  assert.equal(s.L.swap(img, URL0('green'), { priority: 'hover' }), true);
  assert.equal(probes.length, 2);
  s.ck.advance(THUMB.HOVER_MS);
  assert.equal(probes.length, 3);
  assert.equal(s.L.swap(img, 'javascript:alert(1)'), false);
  assert.equal(s.broker.stats().inflight, 1, 'a refused URL leaves the running probe alone');
  ok(probes[2]);
  assert.equal(img.getAttribute('src'), URL0('green'));
  assert.equal(s.broker.stats().inflight, 0);
});

test('swap on a cell still waiting for its first picture: re-pointed, one load only', () => {
  const s = setup({ n: 1 });
  at(s.cells[0].img, 5000);
  s.L.scan(s.grid);
  const { img } = s.cells[0];
  s.L.swap(img, URL0('alt'), { priority: 'user' });
  at(img, 100);
  s.see(img);
  assert.equal(img.getAttribute('src'), URL0('alt'));
  assert.equal(img.srcSets, 1);
});

test('observe(root): scans now, scans added children, releases removed ones (childList of that root only)', () => {
  const s = setup({ n: 1 });
  s.L.observe(s.grid);
  assert.equal(s.mo.inst.length, 1);
  assert.deepEqual(s.mo.inst[0].o, { childList: true });
  assert.ok(hasSrc(s.cells[0].img));
  const add = cell('added');
  s.grid.append(add.a);
  s.mo.inst[0].cb([{ addedNodes: [add.a], removedNodes: [] }]);
  assert.ok(hasSrc(add.img));
  s.cells[0].a.remove();
  s.mo.inst[0].cb([{ addedNodes: [], removedNodes: [s.cells[0].a] }]);
  assert.equal(hasSrc(s.cells[0].img), false, 'removed while loading: cancelled');
  assert.equal(s.broker.stats().inflight, 1);
  s.L.destroy();
  assert.equal(s.mo.inst[0].dead, true);
});

/* ---------- lifecycle + guards ---------- */

test('destroy: no timers, listeners or slots left; onGate errors are swallowed', () => {
  const s = setup({ n: 4, loader: { onGate: () => { throw new Error('toast'); } } });
  s.L.scan(s.grid);
  bad(s.cells[0].img);
  s.scrollTo(10);
  s.win.emit('resize');
  s.L.destroy();
  assert.equal(s.broker.stats().inflight, 0);
  assert.equal(s.broker.stats().queued, 0);
  assert.equal(s.ck.pending(), 0);
  assert.equal(s.doc.count('visibilitychange'), 0);
  for (const t of ['pageshow', 'resize', 'scroll']) assert.equal(s.win.count(t), 0, t);
  assert.equal(s.grid.listenerCount('error'), 0);
  const t = setup({ n: 3, loader: { onGate: () => { throw new Error('toast'); } } });
  t.L.scan(t.grid);
  assert.doesNotThrow(() => { for (const c of t.cells) bad(c.img); });
});

test('re-exports: configureThumbBudget / getThumbBudget are the broker module\'s', () => {
  assert.equal(configureThumbBudget, brokerConfigure);
  assert.equal(getThumbBudget, brokerGet);
  assert.deepEqual(ATTR, { src: 'data-td-src', srcset: 'data-td-srcset', sizes: 'data-td-sizes', managed: 'data-td-managed-img' });
});

test('guard (C10): neither module touches the inline style property, injects <style> or probes with fetch', () => {
  for (const f of ['thumb-loader.js', 'thumb-budget.js']) {
    const src = readFileSync(join(HERE, f), 'utf8');
    assert.doesNotMatch(src, /\.style\b/, f + ': .style');
    assert.doesNotMatch(src, /setAttribute\(\s*['"]style['"]/, f + ': style attribute');
    assert.doesNotMatch(src, /<style|createElement\(\s*['"]style/, f);
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest/, f + ': no probing');
  }
});

test('Codex impl r1 ISSUE-3/4: a swap URL that used its attempts is refused (old picture stays); a complete SSR image clears its old failures', () => {
  const s = setup({ n: 1 });
  s.L.scan(s.grid);
  const { img } = s.cells[0];
  ok(img);
  const probes = [];
  const mkEl = s.doc.createElement;
  s.doc.createElement = (t) => { const e = mkEl(t); probes.push(e); return e; };
  const broken = URL0('broken-colour');
  for (let i = 0; i < THUMB.MAX_ATTEMPTS; i++) {
    assert.equal(s.L.swap(img, broken), true, 'attempt ' + (i + 1));
    bad(probes[probes.length - 1]);
    s.ck.advance(20_000);
    s.broker.pump();
  }
  const before = probes.length;
  assert.equal(s.L.swap(img, broken), false, 'exhausted: refused');
  assert.equal(probes.length, before, 'no new request');
  assert.equal(img.getAttribute('src'), URL0('m000'), 'the current picture stays');
  // ISSUE-4
  const s2 = setup({ n: 0 });
  s2.broker.bump('ssr1');
  s2.broker.bump('ssr1');
  const c = cell('ssr1', undefined, {});
  c.img.attrs.delete('data-td-src');
  c.img.attrs.set('src', URL0('ssr1'));
  c.img.attrs.set('data-td-managed-img', '');
  c.img.complete = true;
  c.img.naturalWidth = 300;
  s2.grid.append(c.a);
  s2.L.scan(s2.grid);
  assert.equal(s2.broker.errors('ssr1'), 0, 'loaded on adoption → failures cleared');
});

test('Codex impl r2 ISSUE-5: the failure key is the URL the browser tried (currentSrc), so 3 cells failing on ONE srcset candidate are not a cluster', () => {
  const s = setup({ n: 3 });
  s.L.scan(s.grid);
  for (const x of s.cells) {
    x.img.currentSrc = 'https://img.example/p/shared-2x.jpg';
    bad(x.img);
  }
  assert.equal(s.gates.length, 0);
  const t = setup({ n: 3 });
  t.L.scan(t.grid);
  for (const x of t.cells) bad(x.img);
  assert.equal(t.gates.length, 1, 'control: 3 distinct URLs open the gate');
});

test('Codex impl r2 ISSUE-3: an exhausted swap URL is refused before anything changes (running swap kept, waiting cell not re-pointed)', () => {
  const s = setup({ n: 2 });
  s.L.scan(s.grid);
  const probes = [];
  const mkEl = s.doc.createElement;
  s.doc.createElement = (t) => { const e = mkEl(t); probes.push(e); return e; };
  const broken = URL0('dead');
  for (let i = 0; i < THUMB.MAX_ATTEMPTS; i++) s.broker.bump(broken);
  const waiting = s.cells[1].img; // still on its first picture
  const before = waiting.getAttribute('data-td-src');
  assert.equal(s.L.swap(waiting, broken), false);
  assert.equal(waiting.getAttribute('data-td-src'), before, 'not re-pointed');
  const { img } = s.cells[0];
  ok(img);
  assert.equal(s.L.swap(img, URL0('red')), true);
  const running = probes.length;
  const inflight = s.broker.stats().inflight;
  assert.equal(s.L.swap(img, broken), false);
  assert.equal(s.broker.stats().inflight, inflight, 'the running swap is untouched');
  assert.equal(probes.length, running, 'no new request');
  ok(probes[running - 1]);
  assert.equal(img.getAttribute('src'), URL0('red'));
});

test('security r1 ISSUE-1: a load still pending after LOAD_TIMEOUT_MS is an error that frees its slot', () => {
  const s = setup({ n: 1 });
  s.L.scan(s.grid);
  const { img } = s.cells[0];
  assert.ok(hasSrc(img));
  assert.equal(s.broker.stats().inflight, 1);
  s.ck.advance(THUMB.LOAD_TIMEOUT_MS + 10);
  assert.equal(hasSrc(img), false, 'the stalled request was dropped');
  assert.equal(s.broker.errors(s.cells[0].id), 1, 'counted as one failed attempt');
});

test('security r1 ISSUE-1: a load that settles in time clears its timer (no late error)', () => {
  const s = setup({ n: 1 });
  s.L.scan(s.grid);
  ok(s.cells[0].img);
  s.ck.advance(THUMB.LOAD_TIMEOUT_MS + 10);
  assert.equal(s.broker.errors(s.cells[0].id), 0);
  assert.ok(s.cells[0].a.classes.has(CLS.loaded));
});

test('security r1 ISSUE-2: the swap probe copies referrerpolicy and crossorigin from the target', () => {
  const s = setup({ n: 1 });
  s.L.scan(s.grid);
  const probes = [];
  const mk = s.doc.createElement;
  s.doc.createElement = (t) => { const e = mk(t); probes.push(e); return e; };
  const { img } = s.cells[0];
  img.setAttribute('referrerpolicy', 'no-referrer');
  img.setAttribute('crossorigin', 'anonymous');
  ok(img);
  assert.equal(s.L.swap(img, URL0('red')), true);
  s.ck.advance(THUMB.HOVER_MS + 10);
  s.broker.pump();
  const p = probes[probes.length - 1];
  assert.ok(p, 'a probe was created');
  assert.equal(p.getAttribute('referrerpolicy'), 'no-referrer');
  assert.equal(p.getAttribute('crossorigin'), 'anonymous');
});

test('security r1 ISSUE-3: oversized or over-long srcset is dropped (src alone)', () => {
  const big = Array.from({ length: THUMB.SRCSET_MAX_CANDIDATES + 1 }, (_, i) => `https://img.example/p/a-${i}.jpg ${100 + i}w`).join(', ');
  assert.equal(cleanSrcset(big, 'https://img.example/p/a.jpg', null), '');
  assert.deepEqual(parseSrcset('x'.repeat(THUMB.SRCSET_MAX_CHARS + 1)), []);
  const ok16 = Array.from({ length: THUMB.SRCSET_MAX_CANDIDATES }, (_, i) => `https://img.example/p/a-${i}.jpg ${100 + i}w`).join(', ');
  assert.notEqual(cleanSrcset(ok16, 'https://img.example/p/a.jpg', null), '');
});
