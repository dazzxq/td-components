#!/usr/bin/env node
// Deterministic simulation harness for the thumbnail loader (plan v0.111.0, C9).
//
//   node test/perf/thumb-loader-sim.mjs            markdown table on stdout
//   node test/perf/thumb-loader-sim.mjs --json     JSON instead
//   node test/perf/thumb-loader-sim.mjs --dwp-file=/path/to/dwp/thumb-loader.js
//                                                  profile A runs the REAL dwp module instead of the in-harness port
//
// Everything is virtual time: one fake clock + timer queue, a seeded PRNG (network latency 40-250 ms), a fake WAF
// (sliding window per IP; > limit requests in the window blocks the IP for 10 s; blocked requests error; every request,
// blocked ones included, counts), a fake IntersectionObserver driven by a scroll script, a shared fake localStorage /
// BroadcastChannel for multi-tab runs. No real timers, no browser, no src/ changes.
//
// Profiles
//   A "dwp-current": a faithful condensed port of the dwp loader (engine/dwp-members/assets/photos-td/thumb-loader.js,
//     origin/main): bucket 30/s burst 10 (starts full), concurrency 8, IO rootMargin 200px, EVERY entering cell dwells
//     120 ms (the first scan is eager), nearest-first queue, gate = 3 distinct failing ids in 2 s (or a visible cell
//     failing twice), gate 11 s + 0-1 s jitter then every visible cell is re-queued at full bucket, one retry after
//     1.5 s, 3 attempts, no shared window, no canary, no backoff, no rate factor. The kit core was NOT used to emulate
//     it because the core cannot switch off the canary, backoff, rate factor, look-ahead sub-cap and adaptive margin.
//   B "kit": the real src/utils/thumb-loader.js + thumb-budget.js with wafBudget {limit, windowSeconds: 10}.
//   C "kit, sharedWindow off": as B with `sharedWindow: false` (plan C11: does the shared ledger earn its keep?).
//
// Honest limits of the model: every image costs the same; the WAF is the literal rule from the plan (a blocked
// request still counts, so an unbroken hammer re-blocks the moment a block ends); the cache is binary (scenario 5);
// only the foreground behaviour of each tab is simulated (no hidden-tab pause); IO callbacks are delivered once per
// frame (16 ms while scrolling).

import { createThumbLoader as createKitLoader } from '../../src/utils/thumb-loader.js';
import { createThumbBudget } from '../../src/utils/thumb-budget.js';

const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const DWP_FILE = (argv.find((a) => a.startsWith('--dwp-file=')) || '').slice('--dwp-file='.length) || null;
const DWP_MOD = DWP_FILE ? await import(DWP_FILE) : null;

const T0 = 1_000_000;
const VH = 900;
const WINDOW_MS = 10_000;
const TAIL_MS = 45_000;
const LIMITS = [400, 750, 2000]; // 400 = extra "tight site" rows, not asked for: shows where the pace adapts

/* ================= clock, PRNG ================= */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeClock(t0 = T0) {
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
  };
}

/* ================= WAF + network ================= */

function makeWorld(limit, opts = {}) {
  const clock = makeClock();
  const rng = mulberry32(opts.seed || 12345);
  const hits = []; // {t, src}
  let winStart = 0;
  let blockedUntil = 0;
  const blockStarts = [];
  const cached = new Set();
  const waf = {
    /** @returns {boolean} true when this request is blocked */
    hit(t, src) {
      hits.push({ t, src });
      while (hits[winStart].t <= t - WINDOW_MS) winStart += 1;
      if (t < blockedUntil) return true;
      if (hits.length - winStart > limit) {
        blockedUntil = t + WINDOW_MS;
        blockStarts.push(t);
        return true;
      }
      return false;
    },
  };
  const world = {
    clock, waf, cached, limit, rng, hits, blockStarts,
    cacheMode: opts.cacheMode || 'revalidate',
    rng2: mulberry32(777), // broker / loader randomness (gate jitter)
    /** a fake <img> got a src: count the hit now, answer after the latency, unless the src was removed meanwhile */
    fetch(img, url, src) {
      const tok = (img._net = (img._net || 0) + 1);
      img._pending = tok;
      const free = 'maxage' === world.cacheMode && cached.has(url);
      const blocked = free ? false : waf.hit(clock.now(), src);
      const lat = free ? 2 : 40 + rng() * 210;
      clock.setTimeout(() => {
        if (img._pending !== tok) return; // aborted: the WAF already counted it
        img._pending = null;
        img.complete = true;
        if (blocked) {
          img.naturalWidth = 0;
          dispatch(img, 'error');
        } else {
          cached.add(url);
          img.naturalWidth = 300;
          dispatch(img, 'load');
        }
      }, lat);
    },
    noise(perTenSeconds, untilT) {
      const step = WINDOW_MS / perTenSeconds;
      for (let t = T0 - WINDOW_MS; t < T0; t += step) waf.hit(Math.round(t), 'noise');
      const tick = () => {
        if (clock.now() > untilT) return;
        waf.hit(clock.now(), 'noise');
        clock.setTimeout(tick, step);
      };
      clock.setTimeout(tick, step);
    },
  };
  return world;
}

/* ================= fake DOM (patterns of src/utils/thumb-loader.test.js) ================= */

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

function el(tag, attrs = {}, hooks = {}) {
  const listeners = [];
  const e = {
    tag, nodeType: 1, attrs: new Map(Object.entries(attrs)), kids: [], parentElement: null, attached: true,
    classes: new Set(), complete: false, naturalWidth: 0, _ls: listeners,
    get isConnected() {
      for (let n = this; n; n = n.parentElement) if (!n.attached) return false;
      return true;
    },
    setAttribute(k, v) {
      this.attrs.set(k, String(v));
      if ('src' === k) {
        this.complete = false;
        this.naturalWidth = 0;
        if (hooks.onSrc) hooks.onSrc(this, String(v));
      }
    },
    getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; },
    removeAttribute(k) {
      this.attrs.delete(k);
      if ('src' === k) this._pending = null; // the browser aborts
    },
    addEventListener(t, f, cap) { listeners.push({ t, f, cap: true === cap || !!(cap && cap.capture) }); },
    removeEventListener(t, f, cap) {
      const c = true === cap || !!(cap && cap.capture);
      const i = listeners.findIndex((l) => l.t === t && l.f === f && l.cap === c);
      if (i >= 0) listeners.splice(i, 1);
    },
    append(...k) { for (const c of k) { c.parentElement = this; this.kids.push(c); } },
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
    getBoundingClientRect() { return { top: 0, bottom: 0 }; },
  };
  e.classList = {
    add: (c) => { e.classes.add(c); if (hooks.onClass) hooks.onClass(e, c); },
    remove: (c) => e.classes.delete(c),
    contains: (c) => e.classes.has(c),
  };
  return e;
}

function dispatch(target, type) {
  const path = [];
  for (let n = target.parentElement; n; n = n.parentElement) path.unshift(n);
  const ev = { type, target };
  for (const n of path) for (const l of n._ls.slice()) if (l.t === type && l.cap) l.f(ev);
  for (const l of target._ls.slice()) if (l.t === type) l.f(ev);
}

function eventHost(extra = {}) {
  const ls = new Map();
  return Object.assign({
    addEventListener(t, f) { ls.set(t, (ls.get(t) || new Set()).add(f)); },
    removeEventListener(t, f) { if (ls.has(t)) ls.get(t).delete(f); },
    emit(t, ev = {}) { for (const f of Array.from(ls.get(t) || [])) f(Object.assign({ type: t }, ev)); },
  }, extra);
}

/** IO driven by the harness frame: reports state changes against the page's scroll + its rootMargin. */
function makeIO(page) {
  return class IO {
    constructor(cb, o) {
      this.cb = cb;
      this.margin = parseInt(String((o && o.rootMargin) || '0'), 10) || 0;
      this.obs = new Map(); // el -> last reported state (undefined = none yet)
      page.ios.add(this);
    }
    observe(e) { if (!this.obs.has(e)) this.obs.set(e, undefined); }
    unobserve(e) { this.obs.delete(e); }
    disconnect() { this.obs.clear(); page.ios.delete(this); }
    deliver() {
      const out = [];
      for (const [e, prev] of this.obs) {
        const r = e.getBoundingClientRect();
        const on = r.bottom >= -this.margin && r.top <= VH + this.margin;
        if (on !== prev) {
          this.obs.set(e, on);
          out.push({ target: e, isIntersecting: on });
        }
      }
      if (out.length) this.cb(out);
    }
  };
}

/* ================= shared localStorage / BroadcastChannel across tabs ================= */

function makeSharedStorage(world) {
  const data = new Map();
  const views = [];
  return (owner) => {
    const notify = (key) => {
      for (const v of views) {
        if (v.owner === owner || !v.owner.win) continue;
        world.clock.setTimeout(() => v.owner.win.emit('storage', { key }), 1);
      }
    };
    const v = {
      owner,
      get length() { return data.size; },
      key: (i) => Array.from(data.keys())[i] ?? null,
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, val) => { data.set(k, String(val)); notify(k); },
      removeItem: (k) => { if (data.delete(k)) notify(k); },
    };
    views.push(v);
    return v;
  };
}

function makeBC(world) {
  const insts = new Set();
  return class BC {
    constructor(name) { this.name = name; this.ls = []; insts.add(this); }
    addEventListener(t, f) { if ('message' === t) this.ls.push(f); }
    postMessage(msg) {
      const data = JSON.parse(JSON.stringify(msg));
      for (const o of insts) {
        if (o === this || o.name !== this.name) continue;
        world.clock.setTimeout(() => o.ls.forEach((f) => f({ data })), 1);
      }
    }
    close() { insts.delete(this); }
  };
}

function makeSessionStorage() {
  const d = new Map();
  return {
    get length() { return d.size; },
    key: (i) => Array.from(d.keys())[i] ?? null,
    getItem: (k) => (d.has(k) ? d.get(k) : null),
    setItem: (k, v) => { d.set(k, String(v)); },
    removeItem: (k) => { d.delete(k); },
  };
}

/* ================= profile A: condensed port of the dwp loader ================= */

const DWP = Object.freeze({
  MARGIN: 200, DWELL_MS: 120, REFILL: 30, CAP: 10, CONC: 8, ERR_N: 3, ERR_MS: 2000, RETRY_MS: 1500,
  GATE_MS: 11000, GATE_JITTER: 1000, MAX_ATTEMPTS: 3,
});

function createDwpPortLoader({ IO, now, setTimeout: setT, clearTimeout: clearT, random, onGate }) {
  const C = DWP;
  const SEL = 'img[data-dwp-thumb]';
  const CELL = '.dwp-photos-grid__item';
  let credit = C.CAP * 1000; // milli-tokens, starts full
  let last = now();
  const refill = () => { const t = now(); if (t > last) { credit = Math.min(C.CAP * 1000, credit + (t - last) * C.REFILL); last = t; } };
  const take = () => { refill(); if (credit >= 1000) { credit -= 1000; return true; } return false; };
  const msNext = () => { refill(); return credit >= 1000 ? 0 : Math.ceil((1000 - credit) / C.REFILL); };
  let gateUntil = 0;
  let errs = [];
  const gateOpen = () => now() < gateUntil;
  const states = new WeakMap();
  const live = new Set();
  const queue = new Set();
  const ledger = new Map();
  let inflight = 0;
  let pumpTimer = null;
  let gateTimer = null;
  let firstScan = true;
  let destroyed = false;
  const setCls = (s, w) => {
    const cl = s.cell.classList;
    for (const k of ['waiting', 'loaded', 'failed']) { if (k === w) cl.add('is-thumb-' + k); else cl.remove('is-thumb-' + k); }
  };
  const clearTimers = (s) => {
    if (null !== s.dwell) { clearT(s.dwell); s.dwell = null; }
    if (null !== s.retry) { clearT(s.retry); s.retry = null; }
  };
  const finish = (s, tok) => {
    if (null === s.active || s.active !== tok) return false;
    s.active = null;
    s.img.removeEventListener('load', s.onLoad);
    s.img.removeEventListener('error', s.onError);
    inflight -= 1;
    return true;
  };
  const cancelLoad = (s) => { if (null !== s.active && finish(s, s.active)) s.img.removeAttribute('src'); };
  const unwatch = (s) => { live.delete(s); queue.delete(s); if (io) io.unobserve(s.img); };
  const toWatching = (s) => { s.st = 'watching'; setCls(s, null); };
  const toGated = (s) => { s.st = 'gated'; setCls(s, 'waiting'); };
  const fail = (s) => { clearTimers(s); cancelLoad(s); unwatch(s); s.st = 'failed'; setCls(s, 'failed'); };
  const drop = (s) => { clearTimers(s); cancelLoad(s); unwatch(s); s.st = 'idle'; s.inView = false; setCls(s, null); };
  const distOf = (s) => {
    const r = s.img.getBoundingClientRect();
    if (r.bottom < 0) return -r.bottom;
    return r.top > VH ? r.top - VH : 0;
  };
  const armPump = () => {
    if (null === pumpTimer) pumpTimer = setT(() => { pumpTimer = null; pump(); }, Math.max(1, msNext()));
  };
  const armGate = () => {
    if (null === gateTimer) gateTimer = setT(endGate, Math.max(1, gateUntil - now()));
  };
  const enqueue = (s) => {
    if (gateOpen()) { toGated(s); armGate(); return; }
    s.st = 'queued';
    setCls(s, null);
    queue.add(s);
  };
  const start = (s, url) => {
    const tok = (s.tok += 1);
    s.active = tok;
    s.st = 'loading';
    inflight += 1;
    s.onLoad = () => settle(s, tok, true);
    s.onError = () => settle(s, tok, false);
    s.img.addEventListener('load', s.onLoad);
    s.img.addEventListener('error', s.onError);
    s.img.setAttribute('src', url);
  };
  function pump() {
    if (destroyed) return;
    if (gateOpen()) { armGate(); return; }
    if (null !== pumpTimer) { clearT(pumpTimer); pumpTimer = null; }
    if (0 === queue.size) return;
    const cands = Array.from(queue, (s) => ({ s, dist: distOf(s), seenAt: s.seenAt }));
    while (inflight < C.CONC && cands.length > 0) {
      let best = null;
      for (const x of cands) if (!best || x.dist < best.dist || (x.dist === best.dist && x.seenAt > best.seenAt)) best = x;
      const s = best.s;
      if (!s.img.isConnected) { cands.splice(cands.indexOf(best), 1); drop(s); continue; }
      const url = String(s.img.getAttribute('data-dwp-thumb') || '');
      if (!take()) { armPump(); return; }
      cands.splice(cands.indexOf(best), 1);
      queue.delete(s);
      start(s, url);
    }
  }
  function openGate() {
    for (const s of live) {
      if ('loading' === s.st) { cancelLoad(s); toGated(s); }
      else if ('queued' === s.st) { queue.delete(s); toGated(s); }
      else if ('retrywait' === s.st) { clearTimers(s); toGated(s); }
    }
    if (null !== pumpTimer) { clearT(pumpTimer); pumpTimer = null; }
    armGate();
    if (onGate) onGate({ until: gateUntil });
  }
  function setGate(t) {
    gateUntil = t + C.GATE_MS + Math.min(1, Math.max(0, Number(random()))) * C.GATE_JITTER;
    errs = [];
  }
  function endGate() {
    gateTimer = null;
    if (destroyed) return;
    if (gateOpen()) { armGate(); return; }
    for (const s of Array.from(live)) {
      if ('gated' !== s.st) continue;
      if (!s.img.isConnected) drop(s);
      else if (s.inView) enqueue(s);
      else toWatching(s);
    }
    pump();
  }
  function settle(s, tok, ok) {
    if (!finish(s, tok)) return;
    if (ok && s.img.complete && s.img.naturalWidth > 0) {
      unwatch(s); s.st = 'loaded'; ledger.delete(s.id); setCls(s, 'loaded'); pump(); return;
    }
    s.img.removeAttribute('src');
    const n = (ledger.get(s.id) || 0) + 1;
    ledger.set(s.id, n);
    const wasOpen = gateOpen();
    let g = 'none';
    if (!wasOpen) {
      const t = now();
      errs = errs.filter((e) => t - e.t <= C.ERR_MS);
      errs.push({ id: s.id, t });
      if (new Set(errs.map((e) => e.id)).size >= C.ERR_N) { setGate(t); g = 'open'; }
    }
    if (n >= C.MAX_ATTEMPTS) { fail(s); if ('open' === g) openGate(); pump(); return; }
    if (wasOpen) { toGated(s); armGate(); return; }
    if ('open' === g || (n >= 2 && s.inView)) {
      if ('open' !== g) setGate(now());
      toGated(s);
      openGate();
      return;
    }
    s.st = 'retrywait';
    setCls(s, 'waiting');
    s.retry = setT(() => {
      s.retry = null;
      if ('retrywait' !== s.st) return;
      if (!s.img.isConnected) drop(s);
      else if (s.inView) { enqueue(s); pump(); }
      else toWatching(s);
    }, C.RETRY_MS);
    pump();
  }
  function onIntersect(entries) {
    if (destroyed) return;
    for (const e of entries) {
      const s = states.get(e.target);
      if (!s || !live.has(s)) continue;
      const eager = s.eager;
      s.eager = false;
      const was = s.inView;
      s.inView = !!e.isIntersecting;
      if (s.inView) {
        if (!was) s.seenAt = now();
        if ('watching' !== s.st) continue;
        if (eager) { enqueue(s); continue; }
        s.st = 'dwelling';
        s.dwell = setT(() => {
          s.dwell = null;
          if ('dwelling' === s.st && s.inView) { enqueue(s); pump(); }
        }, C.DWELL_MS);
      } else if ('dwelling' === s.st) { clearTimers(s); s.st = 'watching'; }
      else if ('queued' === s.st) { queue.delete(s); s.st = 'watching'; }
    }
    pump();
  }
  const io = new IO(onIntersect, { rootMargin: C.MARGIN + 'px 0px' });
  return {
    scan(root) {
      if (destroyed) return;
      const eager = firstScan;
      firstScan = false;
      for (const img of root.querySelectorAll(SEL)) {
        let s = states.get(img);
        if (!s) {
          s = { img, cell: null, id: '', st: 'idle', tok: 0, active: null, onLoad: null, onError: null, dwell: null, retry: null, inView: false, seenAt: 0, eager: false };
          states.set(img, s);
        }
        s.cell = img.closest(CELL) || img.parentElement;
        s.id = s.cell.getAttribute('data-id');
        if ('idle' !== s.st || !img.isConnected) continue;
        toWatching(s);
        s.inView = false;
        s.eager = eager;
        live.add(s);
        io.observe(img);
        if (eager) {
          const r = img.getBoundingClientRect();
          s.eager = false;
          if (r.bottom >= -C.MARGIN && r.top <= VH + C.MARGIN) { s.inView = true; s.seenAt = now(); enqueue(s); }
        }
      }
      pump();
    },
    destroy() {
      destroyed = true;
      for (const s of Array.from(live)) { clearTimers(s); cancelLoad(s); }
      if (null !== pumpTimer) clearT(pumpTimer);
      if (null !== gateTimer) clearT(gateTimer);
      io.disconnect();
    },
  };
}

/* ================= pages ================= */

/**
 * One grid of `n` cells in `cols` columns, `rowH` px per row, in a fake window; a profile loader; a scroll script
 * `script(msSincePageStart) -> scrollY`. Records, per cell, first-visible and loaded times.
 */
function makePage(world, tab, cfg) {
  const { n, cols, rowH, imgH, album, profile } = cfg;
  const page = {
    world, tab, cfg, t0: world.clock.now(), ios: new Set(), cells: [], y: 0, gates: 0, rafs: [], destroyed: false,
    win: eventHost({ scrollY: 0, innerHeight: VH, location: { protocol: 'https:' } }),
    doc: null, loader: null, broker: null, root: null,
  };
  page.doc = eventHost({ hidden: false, documentElement: { clientHeight: VH }, baseURI: 'https://site.example/shop/', createElement: (t) => el(t) });
  const hooks = {
    onSrc: (img, url) => world.fetch(img, url, tab.id),
    onClass: (cell, c) => {
      const rec = cell._rec;
      if (!rec) return;
      if ('is-thumb-loaded' === c && null === rec.loadedAt) rec.loadedAt = world.clock.now();
      if ('is-thumb-failed' === c) rec.failed = true;
    },
  };
  const dwpMarkup = 'dwp' === profile;
  page.root = el('div', {}, hooks);
  for (let i = 0; i < n; i++) {
    const id = album + '-' + String(i).padStart(3, '0');
    const url = 'https://img.example/p/' + id + '.jpg';
    const cell = dwpMarkup ? el('div', { 'data-id': id }, hooks) : el('div', { 'data-td-thumb-cell': '', 'data-id': id }, hooks);
    if (dwpMarkup) cell.classes.add('dwp-photos-grid__item');
    const img = el('img', dwpMarkup ? { 'data-dwp-thumb': url, alt: '' } : { 'data-td-src': url, alt: '' }, hooks);
    const top = Math.floor(i / cols) * rowH;
    img.getBoundingClientRect = () => ({ top: top - page.y, bottom: top + imgH - page.y });
    const rec = { id, top, firstVis: null, loadedAt: null, failed: false };
    cell._rec = rec;
    cell.append(img);
    page.root.append(cell);
    page.cells.push(rec);
  }
  page.rows = Math.ceil(n / cols);
  page.maxScroll = Math.max(0, page.rows * rowH - VH);
  const common = {
    win: page.win, doc: page.doc, IO: makeIO(page), now: world.clock.now, setTimeout: world.clock.setTimeout,
    clearTimeout: world.clock.clearTimeout,
  };
  const onGate = () => { page.gates += 1; };
  if ('dwp' === profile) {
    page.loader = DWP_MOD
      ? DWP_MOD.createThumbLoader(Object.assign({ random: world.rng2, onGate }, common))
      : createDwpPortLoader(Object.assign({ random: world.rng2, onGate }, common));
  } else {
    tab.pageNo += 1;
    page.broker = createThumbBudget({
      budgetKey: 'img.example', win: page.win, now: world.clock.now, setTimeout: world.clock.setTimeout,
      clearTimeout: world.clock.clearTimeout, random: world.rng2, storage: tab.storage, session: tab.session,
      BroadcastChannel: tab.BC, connection: null, tabId: tab.id + 'p' + tab.pageNo,
      wafBudget: { limit: world.limit, windowSeconds: 10 }, sharedWindow: 'kit-nosw' !== profile,
    });
    page.loader = createKitLoader(Object.assign({
      MO: null, requestAnimationFrame: (f) => { page.rafs.push(f); return page.rafs.length; }, cancelAnimationFrame: () => {},
      onGate, budget: page.broker,
    }, common));
  }
  tab.win = page.win;
  return page;
}

const startPage = (page) => page.loader.scan(page.root);

function frame(page) {
  if (page.destroyed) return;
  const t = page.world.clock.now();
  const y = Math.max(0, Math.min(page.maxScroll, page.cfg.script(t - page.t0)));
  const moved = y !== page.y;
  page.y = y;
  page.win.scrollY = y;
  if (moved) {
    page.win.emit('scroll');
    while (page.rafs.length) page.rafs.shift()();
  }
  for (const io of Array.from(page.ios)) io.deliver();
  const { rowH, imgH, cols } = page.cfg;
  const r0 = Math.max(0, Math.floor((y - imgH) / rowH));
  const r1 = Math.min(page.rows - 1, Math.floor((y + VH) / rowH));
  for (let r = r0; r <= r1; r++) {
    const top = r * rowH;
    if (top - y < VH && top + imgH - y > 0) {
      for (let c = 0; c < cols; c++) {
        const rec = page.cells[r * cols + c];
        if (rec && null === rec.firstVis) rec.firstVis = t;
      }
    }
  }
}

function endPage(page, { navigate = false } = {}) {
  page.destroyed = true;
  if (navigate) page.win.emit('pagehide', { persisted: false });
  for (const im of page.root.querySelectorAll('img')) im._pending = null; // the browser aborts on unload
  page.loader.destroy();
  if (page.broker) page.broker.destroy();
}

/** Frames every 16 ms while a script moves, 250 ms otherwise. */
function run(world, pages, untilT) {
  const moving = (p, t) => !p.destroyed && t - p.t0 <= (p.cfg.script.endMs || 0) + 50;
  while (world.clock.now() < untilT) {
    for (const p of pages) frame(p);
    const t = world.clock.now();
    world.clock.advance(Math.min(pages.some((p) => moving(p, t)) ? 16 : 250, untilT - t));
  }
}

/* ================= scroll scripts ================= */

/** hold 0.5 s, then `cycles` x (move `moveMs` at `speed` px/s, pause `pauseMs`): a flick-and-look scroll. */
function flickScript(speed, moveMs = 1400, pauseMs = 600, cycles = 10, holdMs = 500) {
  const per = moveMs + pauseMs;
  const f = (t) => {
    if (t <= holdMs) return 0;
    const u = t - holdMs;
    const cyc = Math.min(cycles, Math.floor(u / per));
    const within = cyc >= cycles ? per : u - cyc * per;
    return ((cyc * moveMs + Math.min(moveMs, within)) * speed) / 1000;
  };
  f.endMs = holdMs + cycles * per;
  return f;
}
function rampScript(totalPx, durMs, holdMs = 500) {
  const f = (t) => (t <= holdMs ? 0 : Math.min(1, (t - holdMs) / durMs) * totalPx);
  f.endMs = holdMs + durMs;
  return f;
}

/* ================= metrics ================= */

const pct = (sorted, q) => (sorted.length ? sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1))] : null);

function metrics(world, pages, { fromT, endT, firstScreenPages }) {
  let peak = 0;
  let lo = 0;
  for (let i = 0; i < world.hits.length; i++) {
    const h = world.hits[i];
    while (world.hits[lo].t <= h.t - WINDOW_MS) lo += 1;
    if (h.t >= fromT) peak = Math.max(peak, i - lo + 1);
  }
  const ttis = [];
  let notLoaded = 0;
  let failed = 0;
  let gates = 0;
  for (const p of pages) {
    gates += p.gates;
    for (const rec of p.cells) {
      if (rec.failed) failed += 1;
      if (null === rec.firstVis) continue;
      if (null === rec.loadedAt) { notLoaded += 1; ttis.push(endT - rec.firstVis); }
      else ttis.push(Math.max(0, rec.loadedAt - rec.firstVis));
    }
  }
  ttis.sort((a, b) => a - b);
  let fs = 0;
  let fsOk = true;
  for (const p of firstScreenPages || pages) {
    for (const rec of p.cells) {
      if (rec.top < VH) {
        if (null === rec.loadedAt) fsOk = false;
        else fs = Math.max(fs, rec.loadedAt - p.t0);
      }
    }
  }
  return {
    peak10s: peak,
    blocks: world.blockStarts.filter((t) => t >= fromT).length,
    gates,
    failed,
    notLoaded,
    p50ms: pct(ttis, 0.5),
    p95ms: pct(ttis, 0.95),
    firstScreenMs: fsOk ? fs : null,
    requests: world.hits.filter((h) => h.t >= fromT && 'noise' !== h.src).length,
    visibleCells: ttis.length,
  };
}

/* ================= scenarios ================= */

const P1 = { n: 600, cols: 6, rowH: 180, imgH: 170 };
const P2 = { n: 120, cols: 4, rowH: 300, imgH: 290 };
const SCROLL1 = () => flickScript(1220); // 17080 px in 20.5 s, 1.36 viewports/s while moving

function setupWorld(limit, opts) {
  const world = makeWorld(limit, opts);
  const view = makeSharedStorage(world);
  const BC = makeBC(world);
  const newTab = (id) => {
    const tab = { id, win: null, session: makeSessionStorage(), pageNo: 0, BC };
    tab.storage = view(tab);
    return tab;
  };
  return { world, newTab };
}

const SCENARIOS = [
  ['1 scroll 600-thumb picker, 20 s', (profile, limit) => {
    const { world, newTab } = setupWorld(limit);
    const sc = SCROLL1();
    const page = makePage(world, newTab('a'), Object.assign({ album: 'pick', script: sc, profile }, P1));
    startPage(page);
    const end = page.t0 + sc.endMs + TAIL_MS;
    run(world, [page], end);
    return metrics(world, [page], { fromT: page.t0, endT: end });
  }, LIMITS],
  ['2 picker scroll, then same-tab nav to 120-img page after 1 s', (profile, limit) => {
    const { world, newTab } = setupWorld(limit);
    const tab = newTab('a');
    const sc = SCROLL1();
    const p1 = makePage(world, tab, Object.assign({ album: 'pick', script: sc, profile }, P1));
    startPage(p1);
    run(world, [p1], p1.t0 + sc.endMs + 1000);
    endPage(p1, { navigate: true });
    world.clock.advance(300); // network + parse of the next page
    const sc2 = rampScript((P2.n / P2.cols) * P2.rowH - VH, 8000);
    const p2 = makePage(world, tab, Object.assign({ album: 'shop', script: sc2, profile }, P2));
    startPage(p2);
    const end = p2.t0 + sc2.endMs + TAIL_MS;
    run(world, [p2], end);
    return metrics(world, [p1, p2], { fromT: p1.t0, endT: end, firstScreenPages: [p2] });
  }, LIMITS],
  ['3 two tabs scrolling at once (2nd starts +0.7 s)', (profile, limit) => {
    const { world, newTab } = setupWorld(limit);
    const sc = SCROLL1();
    const pA = makePage(world, newTab('a'), Object.assign({ album: 'albA', script: sc, profile }, P1));
    startPage(pA);
    world.clock.advance(700);
    const pB = makePage(world, newTab('b'), Object.assign({ album: 'albB', script: SCROLL1(), profile }, P1));
    startPage(pB);
    const end = pB.t0 + sc.endMs + TAIL_MS;
    run(world, [pA, pB], end);
    return metrics(world, [pA, pB], { fromT: pA.t0, endT: end });
  }, LIMITS],
  ['4 as 1, plus NAT noise 200 req/10 s', (profile, limit) => {
    const { world, newTab } = setupWorld(limit);
    const sc = SCROLL1();
    world.noise(200, T0 + sc.endMs + TAIL_MS);
    const page = makePage(world, newTab('a'), Object.assign({ album: 'pick', script: sc, profile }, P1));
    startPage(page);
    const end = page.t0 + sc.endMs + TAIL_MS;
    run(world, [page], end);
    return metrics(world, [page], { fromT: page.t0, endT: end });
  }, LIMITS],
];

/** Scenario 5: visit, leave, revisit 270 s later; metrics of the REVISIT only. */
function revisit(profile, limit, cacheMode) {
  const { world, newTab } = setupWorld(limit, { cacheMode });
  const tab = newTab('a');
  const sc = SCROLL1();
  const p1 = makePage(world, tab, Object.assign({ album: 'pick', script: sc, profile }, P1));
  startPage(p1);
  run(world, [p1], p1.t0 + sc.endMs + 3000);
  endPage(p1, { navigate: true });
  const visit1 = world.hits.length;
  world.clock.advance(270_000);
  const sc2 = SCROLL1();
  const p2 = makePage(world, tab, Object.assign({ album: 'pick', script: sc2, profile }, P1));
  startPage(p2);
  const end = p2.t0 + sc2.endMs + TAIL_MS;
  run(world, [p2], end);
  return Object.assign(metrics(world, [p2], { fromT: p2.t0, endT: end }), { visit1Requests: visit1 });
}

/* ================= main ================= */

const PROFILES = [['A dwp-current', 'dwp'], ['B kit', 'kit'], ['C kit, sharedWindow off', 'kit-nosw']];

function main() {
  const started = Date.now();
  const rows = [];
  for (const [name, fn, limits] of SCENARIOS) {
    for (const limit of limits) {
      for (const [label, prof] of PROFILES) rows.push({ scenario: name, limit, profile: label, ...fn(prof, limit) });
    }
  }
  for (const mode of ['revalidate', 'maxage']) {
    for (const [label, prof] of PROFILES) {
      rows.push({
        scenario: '5 revisit after 270 s, ' + ('revalidate' === mode ? 'revalidate (every img = 1 req)' : 'long max-age (cached = 0 req)'),
        limit: 750, profile: label, ...revisit(prof, 750, mode),
      });
    }
  }
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (AS_JSON) {
    process.stdout.write(JSON.stringify({ dwpFile: DWP_FILE, wallSeconds: Number(secs), rows }, null, 2) + '\n');
    return;
  }
  printTable(rows, secs);
}

const fmtS = (ms) => (null === ms ? '-' : ms < 10_000 ? (ms / 1000).toFixed(2) + 's' : (ms / 1000).toFixed(1) + 's');

function printTable(rows, secs) {
  const out = [];
  out.push('# thumb-loader simulation (deterministic, virtual time; wall ' + secs + ' s)');
  out.push('');
  out.push('Profile A = ' + (DWP_FILE ? 'the REAL dwp loader from ' + DWP_FILE
    : 'condensed in-harness port of the dwp loader (30/s, burst 10, concurrency 8, rootMargin 200px, always dwell 120 ms, gate 11-12 s then re-queue visible, no shared window / canary / backoff / rate factor)') + '.');
  out.push('Profile B = real kit core, wafBudget {limit, windowSeconds 10}: rate min(30, 0.4*limit/10)/s, burst 6, concurrency 6 (look-ahead <= 4), margin 600 px at this viewport, dwell only above 1 viewport/s, canary + backoff + rate factor, shared window.');
  out.push('Profile C = B with sharedWindow:false (no cross-tab / cross-page ledger, no hold at 60% of the limit).');
  out.push('WAF: sliding 10 s window per IP, > limit requests blocks the IP for 10 s, blocked requests error, every request counts (blocked too). Latency 40-250 ms (seeded).');
  out.push('Limit 400 rows are an extra "tight site" case (not requested): where a fixed 30/s pace stops being safe.');
  out.push('peak = max requests in any 10 s window as the WAF sees them (includes scenario 4 noise); req = this site only (scenario 2: both pages; scenario 5: the revisit only).');
  out.push('failed = cells that ended is-thumb-failed. unl = cells that were on screen at some time and never loaded within 45 s after the scroll ended.');
  out.push('p50/p95 = first on screen -> loaded, over every cell that was ever on screen (unloaded count as end-of-run minus first seen). 1st screen = every cell on screen at scroll 0 loaded (scenario 2: page 2; scenario 3: slowest tab).');
  out.push('');
  out.push('| scenario | limit | profile | peak/10s | blocks | gates | failed | unl | p50 | p95 | 1st screen | req |');
  out.push('|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    out.push(`| ${r.scenario} | ${r.limit} | ${r.profile} | ${r.peak10s} | ${r.blocks} | ${r.gates} | ${r.failed} | ${r.notLoaded} | ${fmtS(r.p50ms)} | ${fmtS(r.p95ms)} | ${fmtS(r.firstScreenMs)} | ${r.requests} |`);
  }
  process.stdout.write(out.join('\n') + '\n');
}

main();
