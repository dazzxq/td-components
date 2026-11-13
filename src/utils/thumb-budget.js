/**
 * v0.111.0 (plan v0.111.0-media-picker-thumb-loader, C1/C3/C11–C14) — the page-wide thumbnail request broker.
 *
 * Why: a CDN WAF rule (e.g. 750 requests / 10 s per IP + colo, block 10 s, cache HITs counted) is shared by every
 * surface of the page, every tab of the origin and the next page in the same tab. One broker per `budgetKey` (default:
 * the image host) owns what must be shared: the token bucket, the concurrency cap (with a look-ahead sub-cap), the
 * priority queue, the gate (cooldown → canary → backoff), the attempt ledger and the per-tab storage records.
 * Surfaces (`thumb-loader.js`) keep their own IntersectionObserver, cell state machine, retries and cleanup.
 *
 * Pace (C11): `rate = min(maxRate 30, 0.4 × limit / windowSeconds)`, `burst = min(6, round(rate × 0.3))`,
 *   concurrency 6 of which look-ahead ≤ 4. Default `wafBudget` {500, 10} → 20/s, burst 6. Save-Data / 2g: 4/s,
 *   burst 3, concurrency 3, look-ahead 2. Raw `rate` / `burst` / `concurrency` / `lookahead` are clamped overrides.
 * Queue order (C11): visible > user > look-ahead in the scroll direction > the rest; then distance, then latest seen.
 * Gate (C11/C12): 3 distinct ids failing within 2 s, or a visible cell failing a 2nd time plus ≥ 1 other id in that
 *   window. Cooldown 12 s + jitter; then up to 2 canaries (visible, distinct ids, never-failed first), one at a time.
 *   One canary passes → reopen (bucket ramps 1 → burst over 2 s). Two distinct canaries fail → backoff 24/48/60 s.
 *   A lone failed canary with no second candidate → base cooldown again, no backoff. 30 s clean → backoff level 0.
 * Rate factor (C13/C14): ×0.5 per gate (floor 0.25), +0.1 per 30 s without a cluster, applied to rate and burst; it
 *   lives in this tab's gate record `{until, factor, factorAt, t}`; readers take the min live factor, the max live
 *   `until`. A record whose `until` is beyond now + 60 s + 1 s + 5 s skew is corrupt and ignored.
 * Storage (C12–C14): every localStorage key is written by one tab only (`…:<tabId>`); the slot ledger
 *   (`sharedWindow`, default off since the C9 harness; opt in) is summed across fresh tabs and carried to the next page of the same tab through
 *   sessionStorage at `pagehide`. Storage failures → local-only, silently. BroadcastChannel is an optional fast path.
 *
 * Everything environmental (window, clock, timers, random, storages, BroadcastChannel, navigator.connection) is
 * injectable. No DOM writes here.
 *
 * @module utils/thumb-budget
 */

/** Every number of the broker (tests read these). */
export const BUDGET = Object.freeze({
  LIMIT: 500,
  WINDOW_S: 10,
  SHARE: 0.4,
  MAX_RATE: 30,
  MIN_RATE: 0.1,
  BURST_FRACTION: 0.3,
  BURST_MAX: 6,
  CONCURRENCY: 6,
  LOOKAHEAD: 4,
  SAVE_DATA: Object.freeze({ rate: 4, burst: 3, concurrency: 3, lookahead: 2 }),
  ERR_CLUSTER_N: 3,
  ERR_CLUSTER_MS: 2000,
  BACKOFF_MS: Object.freeze([12000, 24000, 48000, 60000]),
  GATE_JITTER_MS: 1000,
  MAX_BACKOFF_MS: 60000,
  CLOCK_SKEW_MS: 5000,
  CLEAN_MS: 30000,
  CANARIES: 2,
  RAMP_MS: 2000,
  FACTOR_DOWN: 0.5,
  FACTOR_MIN: 0.25,
  FACTOR_UP: 0.1,
  FACTOR_TTL_MS: 90000,
  SHARED_HOLD: 0.6,
  WRITE_MS: 1000,
  TAB_FRESH_MS: 15000,
  TAB_STALE_MS: 30000,
  MAX_ATTEMPTS: 3,
  LEDGER_MAX: 5000,
});

/** Queue ranks, lower first. */
export const RANK = Object.freeze({ visible: 0, user: 1, ahead: 2, rest: 3 });

const SLOT_PREFIX = 'td-thumb-budget:';
const GATE_PREFIX = 'td-thumb-gate:';
const NAV_PREFIX = 'td-thumb-nav:';

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clampNum = (v, lo, hi, dflt) => (fin(v) ? Math.min(hi, Math.max(lo, v)) : dflt);
const round2 = (x) => Math.round(x * 100) / 100;
const safe = (f, dflt = null) => {
  try { return f(); } catch { return dflt; }
};

/** true for Save-Data or a 2g / slow-2g effective connection. */
export function isSlowConnection(conn) {
  if (!conn || typeof conn !== 'object') return false;
  if (conn.saveData === true) return true;
  return conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g';
}

/**
 * The broker's pace from a site config (C2 + C11).
 * @param {{wafBudget?:{limit?:number, windowSeconds?:number}, maxRate?:number, rate?:number, burst?:number,
 *   concurrency?:number, lookahead?:number}} [cfg]
 * @param {any} [connection] `navigator.connection`-like
 * @param {typeof BUDGET} [c]
 */
export function computeLimits(cfg = {}, connection = null, c = BUDGET) {
  const waf = cfg && typeof cfg.wafBudget === 'object' && cfg.wafBudget ? cfg.wafBudget : {};
  const limit = clampNum(waf.limit, 1, 1e7, c.LIMIT);
  const windowSeconds = clampNum(waf.windowSeconds, 1, 3600, c.WINDOW_S);
  const maxRate = clampNum(cfg.maxRate, c.MIN_RATE, 100, c.MAX_RATE);
  let rate = Math.max(c.MIN_RATE, Math.min(maxRate, (c.SHARE * limit) / windowSeconds));
  let burst = Math.min(c.BURST_MAX, Math.max(1, Math.round(rate * c.BURST_FRACTION)));
  let concurrency = c.CONCURRENCY;
  let lookahead = c.LOOKAHEAD;
  if (fin(cfg.rate)) rate = clampNum(cfg.rate, c.MIN_RATE, 100, rate);
  if (fin(cfg.burst)) burst = Math.round(clampNum(cfg.burst, 1, 30, burst));
  if (fin(cfg.concurrency)) concurrency = Math.round(clampNum(cfg.concurrency, 1, 16, concurrency));
  if (fin(cfg.lookahead)) lookahead = Math.round(clampNum(cfg.lookahead, 0, 16, lookahead));
  const saveData = isSlowConnection(connection);
  if (saveData) {
    rate = Math.min(rate, c.SAVE_DATA.rate);
    burst = Math.min(burst, c.SAVE_DATA.burst);
    concurrency = Math.min(concurrency, c.SAVE_DATA.concurrency);
    lookahead = Math.min(lookahead, c.SAVE_DATA.lookahead);
  }
  lookahead = Math.min(lookahead, concurrency);
  return { limit, windowSeconds, rate, burst, concurrency, lookahead, saveData };
}

/**
 * Token bucket counted in milli-tokens (exact with integer-ms clocks). Starts full. `configure` changes cap / rate in
 * place; `ramp(from, ms)` caps the level at `from` and lets the cap grow linearly back to `cap` over `ms`.
 * @param {number} cap @param {number} refillPerS @param {() => number} now
 */
export function createBucket(cap, refillPerS, now) {
  const UNIT = 1000;
  let capT = cap;
  let rate = refillPerS;
  let credit = cap * UNIT;
  let last = now();
  let rampFrom = 0;
  let rampAt = 0;
  let rampMs = 0;
  const effMax = (t) => {
    let m = capT;
    if (rampMs > 0) {
      const p = (t - rampAt) / rampMs;
      if (p >= 1) rampMs = 0;
      else m = Math.min(capT, rampFrom + (capT - rampFrom) * Math.max(0, p));
    }
    return m * UNIT;
  };
  const refill = () => {
    const t = now();
    if (t > last) {
      credit += (t - last) * rate;
      last = t;
    }
    credit = Math.min(effMax(t), credit);
  };
  return {
    take() {
      refill();
      if (credit >= UNIT) {
        credit -= UNIT;
        return true;
      }
      return false;
    },
    msUntilNext() {
      refill();
      return credit >= UNIT ? 0 : Math.ceil((UNIT - credit) / rate);
    },
    level() {
      refill();
      return credit / UNIT;
    },
    configure(newCap, newRate) {
      refill();
      capT = newCap;
      rate = newRate;
      credit = Math.min(credit, effMax(now()));
    },
    ramp(from, ms) {
      refill();
      rampFrom = Math.min(capT, from);
      rampAt = now();
      rampMs = ms;
      credit = Math.min(credit, rampFrom * UNIT);
    },
    drain() {
      refill();
      credit = 0;
    },
  };
}

/**
 * The error window (C11): `note(id, t, repeatVisible)` → true when the gate should open: ERR_CLUSTER_N distinct ids
 * within ERR_CLUSTER_MS, or a visible cell's repeat failure plus at least one OTHER id in that window.
 * @param {typeof BUDGET} [c]
 */
export function createErrorWindow(c = BUDGET) {
  let errs = [];
  return {
    note(id, t, repeatVisible = false) {
      errs = errs.filter((e) => t - e.t <= c.ERR_CLUSTER_MS);
      errs.push({ id, t });
      const n = new Set(errs.map((e) => e.id)).size;
      return n >= c.ERR_CLUSTER_N || (!!repeatVisible && n >= 2);
    },
    reset() {
      errs = [];
    },
  };
}

/** Queue order: rank, then distance, then the most recently seen. */
export function compareCandidates(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  if (a.dist !== b.dist) return a.dist - b.dist;
  return (b.seenAt || 0) - (a.seenAt || 0);
}

/** @returns {T|null} the first candidate in queue order */
export function pickNext(cands) {
  let best = null;
  for (const x of cands) if (!best || compareCandidates(x, best) < 0) best = x;
  return best;
}

/**
 * A stored gate record `{until, factor, factorAt, t}` → the parsed record, or null when corrupt or when `until` lies
 * beyond `now + MAX_BACKOFF_MS + GATE_JITTER_MS + CLOCK_SKEW_MS` (C14). Liveness is decided by `gateLive`.
 */
export function parseGateRecord(raw, t, c = BUDGET) {
  const o = typeof raw === 'string' ? safe(() => JSON.parse(raw)) : raw;
  if (!o || typeof o !== 'object') return null;
  const { until, factor, factorAt } = o;
  if (!fin(until) || !fin(factor) || !fin(factorAt) || !fin(o.t)) return null;
  if (until > t + c.MAX_BACKOFF_MS + c.GATE_JITTER_MS + c.CLOCK_SKEW_MS) return null;
  return { until, factor, factorAt, t: o.t };
}

/** `{untilLive, factorLive}` of a parsed gate record at time `t` (C14 lifecycle). */
export function gateLive(rec, t, c = BUDGET) {
  if (!rec) return { untilLive: false, factorLive: false };
  const untilLive = rec.until > t && rec.until <= t + c.MAX_BACKOFF_MS + c.GATE_JITTER_MS + c.CLOCK_SKEW_MS;
  const factorLive = rec.factor < 1 && rec.factor >= c.FACTOR_MIN && t - rec.factorAt < c.FACTOR_TTL_MS
    && rec.factorAt <= t + c.CLOCK_SKEW_MS;
  return { untilLive, factorLive };
}

/** Slot list `[{second, count}]` → the sum within the last `windowS` seconds of `t` (bad entries ignored). */
export function sumSlots(slots, t, windowS) {
  if (!Array.isArray(slots)) return 0;
  const sec = Math.floor(t / 1000);
  let n = 0;
  for (const s of slots) {
    if (!s || !fin(s.second) || !fin(s.count) || s.count < 0 || s.count > 1e6) continue;
    if (s.second > sec - windowS && s.second <= sec + 1) n += s.count;
  }
  return n;
}

/**
 * One broker (not the page singleton: `getThumbBudget` / `configureThumbBudget` hold those).
 * @param {object} [opts] config (`budgetKey`, `hosts`, `wafBudget`, `maxRate`, `rate`, `burst`, `concurrency`,
 *   `lookahead`, `sharedWindow`) + environment (`win`, `now`, `setTimeout`, `clearTimeout`, `random`, `storage`,
 *   `session`, `BroadcastChannel`, `connection`, `tabId`, `constants`)
 */
export function createThumbBudget(opts = {}) {
  const c = Object.assign({}, BUDGET, opts.constants || {});
  const key = String(opts.budgetKey || 'default');
  const win = 'win' in opts ? opts.win : typeof window !== 'undefined' ? window : null;
  const now = opts.now || (() => Date.now());
  const setT = opts.setTimeout || ((f, ms) => setTimeout(f, ms));
  const clearT = opts.clearTimeout || ((id) => clearTimeout(id));
  const random = opts.random || Math.random;
  const storage = 'storage' in opts ? opts.storage : safe(() => (win && win.localStorage) || null);
  const session = 'session' in opts ? opts.session : safe(() => (win && win.sessionStorage) || null);
  const BC = 'BroadcastChannel' in opts ? opts.BroadcastChannel : (win && win.BroadcastChannel) || null;
  const connection = 'connection' in opts ? opts.connection
    : safe(() => (win && win.navigator && win.navigator.connection) || null);
  const tabId = String(opts.tabId || (Math.floor(Number(random()) * 2 ** 31).toString(36) + now().toString(36)))
    .replace(/:/g, '');
  const slotPrefix = SLOT_PREFIX + key + ':';
  const gatePrefix = GATE_PREFIX + key + ':';
  const navKey = NAV_PREFIX + key;
  const ownSlotKey = slotPrefix + tabId;
  const ownGateKey = gatePrefix + tabId;

  let cfg = {};
  let hosts = new Set();
  let sharedWindow = false; // v0.111.0: off by default, the C9 harness showed no gain at 750 / 2000 and a loss with 2 tabs
  const setCfg = (o) => {
    cfg = Object.assign({}, cfg, o);
    if (Array.isArray(o.hosts)) hosts = new Set(o.hosts.map((h) => String(h).toLowerCase()));
    if (typeof o.sharedWindow === 'boolean') sharedWindow = o.sharedWindow;
  };
  setCfg(opts);

  let limits = computeLimits(cfg, connection, c);
  const bucket = createBucket(limits.burst, limits.rate, now);
  const errWin = createErrorWindow(c);
  /** @type {Set<any>} */
  const queue = new Set();
  const subs = new Set();
  const ledger = new Map();
  let inflight = 0;
  let aheadInflight = 0;
  /** 'open' | 'cooldown' | 'canary' */
  let phase = 'open';
  let gateUntil = 0;
  let level = 0;
  let reopenedAt = -Infinity;
  let lastGateAt = -Infinity;
  let canaryActive = null;
  let canaryFails = []; // failed canary URL keys
  let canaryFailIds = []; // Codex impl r2 ISSUE-6: and their cell ids (2 distinct of each escalate)
  let factor = 1;
  let factorAt = 0;
  const foreign = new Map();
  const ownSlots = new Map();
  let others = 0;
  let othersAt = -Infinity;
  let lastWrite = -Infinity;
  let writeTimer = null;
  let pumpTimer = null;
  let pumpAt = Infinity;
  let gateTimer = null;
  let factorTimer = null;
  let pumping = false;
  let again = false;
  let destroyed = false;
  let channel = null;

  /* ---------- storage (every access guarded: failure → local only) ---------- */

  const keysWith = (prefix) => {
    const out = [];
    if (!storage) return out;
    safe(() => {
      const n = storage.length;
      for (let i = 0; i < n; i++) {
        const k = storage.key(i);
        // `<prefix><tabId>` only: a ':' in the rest belongs to a longer budgetKey
        if (typeof k === 'string' && k.startsWith(prefix) && !k.slice(prefix.length).includes(':')) out.push(k);
      }
    });
    return out;
  };
  const getItem = (st, k) => (st ? safe(() => st.getItem(k)) : null);
  const setItem = (st, k, v) => {
    if (st) safe(() => st.setItem(k, v));
  };
  const removeItem = (st, k) => {
    if (st) safe(() => st.removeItem(k));
  };

  const windowS = () => Math.min(60, Math.round(limits.windowSeconds));
  const pruneSlots = () => {
    const sec = Math.floor(now() / 1000);
    for (const s of ownSlots.keys()) if (s <= sec - windowS()) ownSlots.delete(s);
  };
  const slotList = () => {
    pruneSlots();
    return Array.from(ownSlots, ([second, count]) => ({ second, count }));
  };
  const ownCount = () => sumSlots(slotList(), now(), windowS());

  const writeSlots = () => {
    lastWrite = now();
    setItem(storage, ownSlotKey, JSON.stringify({ t: now(), slots: slotList() }));
  };
  const scheduleWrite = () => {
    if (!sharedWindow || !storage || destroyed) return;
    const due = lastWrite + c.WRITE_MS - now();
    if (due <= 0) writeSlots();
    else if (null === writeTimer) {
      writeTimer = setT(() => {
        writeTimer = null;
        if (!destroyed) writeSlots();
      }, due);
    }
  };

  const readOthers = () => {
    othersAt = now();
    let sum = 0;
    for (const k of keysWith(slotPrefix)) {
      if (k === ownSlotKey) continue;
      const o = safe(() => JSON.parse(getItem(storage, k)));
      if (!o || typeof o !== 'object' || !fin(o.t)) continue;
      const age = now() - o.t;
      if (age > c.TAB_STALE_MS) {
        removeItem(storage, k); // a dead tab's record: harmless to drop, nobody counts it any more
        continue;
      }
      if (age <= c.TAB_FRESH_MS) sum += sumSlots(o.slots, now(), windowS());
    }
    others = sum;
  };

  const readGates = () => {
    foreign.clear();
    const t = now();
    for (const k of keysWith(gatePrefix)) {
      if (k === ownGateKey) continue;
      const rec = parseGateRecord(getItem(storage, k), t, c);
      if (!rec) continue; // corrupt or out of bound: ignored, never trusted
      const live = gateLive(rec, t, c);
      if (!live.untilLive && !live.factorLive) {
        if (t - rec.factorAt >= c.FACTOR_TTL_MS && rec.until <= t) removeItem(storage, k);
        continue;
      }
      foreign.set(k.slice(gatePrefix.length), rec);
    }
  };

  const ownRecord = () => ({ until: gateUntil, factor, factorAt, t: now() });
  const post = (msg) => {
    if (channel) safe(() => channel.postMessage(msg));
  };
  const writeGate = () => {
    const rec = ownRecord();
    setItem(storage, ownGateKey, JSON.stringify(rec));
    post({ tabId, rec });
  };
  const removeGate = () => {
    removeItem(storage, ownGateKey);
    post({ tabId, rec: null });
  };

  const foreignUntil = () => {
    const t = now();
    let u = 0;
    for (const rec of foreign.values()) if (gateLive(rec, t, c).untilLive) u = Math.max(u, rec.until);
    return u;
  };
  const effFactor = () => {
    const t = now();
    let f = factor;
    for (const rec of foreign.values()) if (gateLive(rec, t, c).factorLive) f = Math.min(f, rec.factor);
    return Math.max(c.FACTOR_MIN, Math.min(1, f));
  };

  const applyLimits = () => {
    limits = computeLimits(cfg, connection, c);
    const f = effFactor();
    bucket.configure(Math.max(1, Math.round(limits.burst * f)), Math.max(c.MIN_RATE, limits.rate * f));
  };

  /* ---------- timers ---------- */

  const clearPump = () => {
    if (null !== pumpTimer) {
      clearT(pumpTimer);
      pumpTimer = null;
      pumpAt = Infinity;
    }
  };
  const armPump = (ms) => {
    const at = now() + Math.max(1, ms);
    if (null !== pumpTimer && pumpAt <= at) return;
    clearPump();
    pumpAt = at;
    pumpTimer = setT(() => {
      pumpTimer = null;
      pumpAt = Infinity;
      pump();
    }, Math.max(1, ms));
  };

  const notify = (method, info) => {
    for (const s of Array.from(subs)) {
      if (typeof s[method] === 'function') safe(() => s[method](info));
    }
  };

  const scheduleFactor = () => {
    if (null !== factorTimer) {
      clearT(factorTimer);
      factorTimer = null;
    }
    if (factor >= 1 || destroyed) return;
    const at = Math.max(lastGateAt, factorAt) + c.CLEAN_MS;
    factorTimer = setT(stepFactor, Math.max(1, at - now()));
  };
  function stepFactor() {
    factorTimer = null;
    if (destroyed) return;
    const t = now();
    if (t - lastGateAt < c.CLEAN_MS) {
      scheduleFactor();
      return;
    }
    factor = Math.min(1, round2(factor + c.FACTOR_UP));
    factorAt = t;
    if (factor >= 1 && gateUntil <= t) removeGate();
    else writeGate();
    applyLimits();
    scheduleFactor();
    pump();
  }

  /* ---------- gate ---------- */

  /** @param {'cluster'|'canary'|'quiet'} kind */
  function openGate(kind) {
    const t = now();
    if ('cluster' === kind) {
      level = 'open' === phase && t - reopenedAt >= c.CLEAN_MS ? 0 : Math.min(level + 1, c.BACKOFF_MS.length - 1);
    } else if ('canary' === kind) {
      level = Math.min(level + 1, c.BACKOFF_MS.length - 1);
    }
    const r = Number(random());
    const jitter = (fin(r) ? Math.min(1, Math.max(0, r)) : 0) * c.GATE_JITTER_MS;
    const base = 'quiet' === kind ? c.BACKOFF_MS[0] : c.BACKOFF_MS[level];
    gateUntil = t + base + jitter;
    phase = 'cooldown';
    canaryActive = null;
    canaryFails = [];
    canaryFailIds = [];
    errWin.reset();
    if ('quiet' !== kind) {
      factor = Math.max(c.FACTOR_MIN, round2(factor * c.FACTOR_DOWN));
      factorAt = t;
      lastGateAt = t;
      scheduleFactor();
    }
    writeGate();
    applyLimits();
    clearPump();
    if (null !== gateTimer) clearT(gateTimer);
    gateTimer = setT(endCooldown, Math.max(1, gateUntil - t));
    notify('onGate', { until: gateUntil, remainingMs: Math.max(0, gateUntil - t), kind, level });
  }

  function endCooldown() {
    gateTimer = null;
    if (destroyed) return;
    phase = 'canary';
    canaryFails = [];
    canaryFailIds = [];
    if (factor >= 1) removeGate();
    notify('onGateEnd', { kind: 'canary' });
    pump();
  }

  function reopen() {
    phase = 'open';
    canaryActive = null;
    canaryFails = [];
    canaryFailIds = [];
    reopenedAt = now();
    applyLimits();
    bucket.ramp(1, c.RAMP_MS);
    notify('onGateEnd', { kind: 'reopen' });
  }

  /* ---------- queue ---------- */

  const candidates = () => {
    const out = [];
    for (const e of Array.from(queue)) {
      if (e.owner && e.owner.paused) continue;
      const m = typeof e.measure === 'function' ? e.measure() : { rank: RANK.visible, dist: 0 };
      if (!m) {
        queue.delete(e);
        if (typeof e.onDrop === 'function') safe(() => e.onDrop());
        continue;
      }
      out.push({ e, rank: m.rank, dist: m.dist || 0, seenAt: e.seenAt || 0 });
    }
    return out.sort(compareCandidates);
  };

  const canaryPick = (cands) => {
    let fallback = null;
    for (const x of cands) {
      if (x.rank !== RANK.visible || canaryFails.includes(String(x.e.key || x.e.id)) || canaryFailIds.includes(String(x.e.id))) continue; // Codex impl r1 ISSUE-2: visible only
      if (!ledger.has(x.e.id)) return x;
      if (!fallback) fallback = x;
    }
    return fallback;
  };

  const mkTicket = (rank, canary) => {
    inflight += 1;
    const ahead = rank >= RANK.ahead;
    if (ahead) aheadInflight += 1;
    const tk = {
      rank,
      canary,
      released: false,
      release() {
        if (tk.released) return;
        tk.released = true;
        inflight -= 1;
        if (ahead) aheadInflight -= 1;
        if (canaryActive === tk) canaryActive = null; // a cancelled canary: the next pump picks another
      },
    };
    return tk;
  };

  const record = (n = 1) => {
    const sec = Math.floor(now() / 1000);
    ownSlots.set(sec, (ownSlots.get(sec) || 0) + n);
    scheduleWrite();
  };

  const grant = (x, canary) => {
    queue.delete(x.e);
    record(1);
    const tk = mkTicket(x.rank, canary);
    if (canary) canaryActive = tk;
    x.e.start(tk);
  };

  /** Shared slot ledger: hold while this IP's window (own + other tabs + previous page) is ≥ SHARED_HOLD × limit. */
  const sharedHold = () => {
    if (!sharedWindow) return false;
    if (storage && now() - othersAt >= c.WRITE_MS) readOthers();
    if (ownCount() + others < c.SHARED_HOLD * limits.limit) return false;
    armPump(1000 - (now() % 1000) + 1);
    return true;
  };

  function pumpOnce() {
    if ('cooldown' === phase) return;
    const fu = foreignUntil();
    if (fu > now()) {
      armPump(fu - now());
      return;
    }
    clearPump();
    if (0 === queue.size) return;
    applyLimits();
    const cands = candidates();
    if (0 === cands.length) return;
    if ('canary' === phase) {
      if (canaryActive) return;
      const x = canaryPick(cands);
      if (!x) return; // waits for a visible request
      if (!bucket.take()) {
        armPump(bucket.msUntilNext());
        return;
      }
      grant(x, true);
      return;
    }
    if (sharedHold()) return;
    for (const x of cands) {
      if (inflight >= limits.concurrency) return;
      if (x.rank >= RANK.ahead && aheadInflight >= limits.lookahead) return; // sorted: the rest is look-ahead too
      if (!bucket.take()) {
        armPump(bucket.msUntilNext());
        return;
      }
      grant(x, false);
    }
  }

  function pump() {
    if (destroyed) return;
    if (pumping) {
      again = true;
      return;
    }
    pumping = true;
    try {
      do {
        again = false;
        pumpOnce();
      } while (again && !destroyed);
    } finally {
      pumping = false;
    }
  }

  /* ---------- environment listeners ---------- */

  const onStorage = (e) => {
    const k = e && e.key;
    if (null === k || undefined === k || (typeof k === 'string' && k.startsWith(gatePrefix))) {
      readGates();
      applyLimits();
      pump();
    }
    if (null === k || undefined === k || (typeof k === 'string' && k.startsWith(slotPrefix))) othersAt = -Infinity;
  };
  const onMessage = (e) => {
    const d = e && e.data;
    if (!d || typeof d !== 'object' || typeof d.tabId !== 'string' || d.tabId === tabId) return;
    if (null === d.rec) foreign.delete(d.tabId);
    else {
      const rec = parseGateRecord(d.rec, now(), c);
      if (rec) foreign.set(d.tabId, rec);
    }
    applyLimits();
    pump();
  };
  const onPageHide = () => {
    if (sharedWindow && session) {
      const slots = slotList();
      if (slots.length) setItem(session, navKey, JSON.stringify(slots));
    }
    removeItem(storage, ownSlotKey);
  };

  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('storage', onStorage);
    win.addEventListener('pagehide', onPageHide);
  }
  if (typeof BC === 'function') {
    channel = safe(() => new BC('td-thumb-budget:' + key));
    if (channel) {
      if (typeof channel.addEventListener === 'function') channel.addEventListener('message', onMessage);
      else channel.onmessage = onMessage;
    }
  }
  // Start-up: other tabs' gates, the previous page's slots (same tab), the other tabs' slots.
  readGates();
  if (sharedWindow && session) {
    const carried = safe(() => JSON.parse(getItem(session, navKey)));
    removeItem(session, navKey);
    if (Array.isArray(carried)) {
      const sec = Math.floor(now() / 1000);
      for (const s of carried) {
        if (!s || !fin(s.second) || !fin(s.count) || s.count <= 0 || s.count > 1e6) continue;
        if (s.second > sec - windowS() && s.second <= sec + 1) ownSlots.set(s.second, (ownSlots.get(s.second) || 0) + s.count);
      }
      if (ownSlots.size) scheduleWrite();
    }
  }
  if (sharedWindow && storage) readOthers();
  applyLimits();

  return {
    key,
    tabId,
    /** Merge config (`wafBudget`, `maxRate`, raw overrides, `hosts`, `sharedWindow`) and re-derive the pace. */
    configure(o = {}) {
      setCfg(o);
      applyLimits();
      pump();
    },
    hasHost(h) {
      return hosts.has(String(h || '').toLowerCase());
    },
    hosts() {
      return Array.from(hosts);
    },
    limits() {
      applyLimits();
      return Object.assign({}, limits, { factor: effFactor() });
    },
    subscribe(listener) {
      subs.add(listener);
      return () => subs.delete(listener);
    },
    /**
     * Queue a load. `entry`: `{owner?:{paused:boolean}, id, seenAt, measure():({rank, dist}|null), onDrop(),
     * start(ticket)}`; `measure()` null → dropped without a token. `start(ticket)` must call `ticket.release()` once.
     */
    request(entry) {
      if (!destroyed && entry) queue.add(entry);
      return entry;
    },
    cancel(entry) {
      queue.delete(entry);
    },
    /** A slot for an image the browser is already loading (adopted SSR): no token, counted in the window. */
    occupy() {
      record(1);
      return mkTicket(RANK.visible, false);
    },
    /** Count `n` requests the broker did not grant (adopted SSR images) into the window ledger only. */
    record,
    pump,
    /** This tab's gate cooldown (canary / reopen phases are not "cooling down"). */
    isCoolingDown() {
      return 'cooldown' === phase;
    },
    phase() {
      return phase;
    },
    reportLoad(ticket) {
      if (ticket && ticket.canary && 'canary' === phase) reopen();
    },
    /**
     * A failed load (`ticket` null for failures the broker did not grant). `info`: `{id, visible, n}` with `n` the
     * attempt count after this failure. → 'open' (this call opened the gate), 'gated' (wait for the gate's end) or
     * 'none' (ordinary retry).
     */
    reportError(ticket, info = {}) {
      const t = now();
      const id = String(info.key || info.id || ''); // Codex impl r1 ISSUE-1: distinct URLs, not ids
      const repeatVisible = !!info.visible && (info.n || 0) >= 2;
      if (ticket && ticket.canary && 'canary' === phase && canaryActive !== null && canaryActive === ticket) {
        canaryActive = null;
      }
      if (ticket && ticket.canary && 'canary' === phase) {
        if (!canaryFails.includes(id)) canaryFails.push(id);
        const cid = String(info.id || '');
        if (!canaryFailIds.includes(cid)) canaryFailIds.push(cid);
        if (canaryFails.length >= c.CANARIES && canaryFailIds.length >= c.CANARIES) {
          openGate('canary');
          return 'open';
        }
        if (!canaryPick(candidates())) {
          openGate('quiet'); // a lone broken image must not extend the backoff
          return 'gated';
        }
        return 'gated';
      }
      if ('cooldown' === phase) return 'gated';
      if (errWin.note(id, t, repeatVisible)) {
        openGate('cluster');
        return 'open';
      }
      return 'canary' === phase ? 'gated' : 'none';
    },
    /** Attempt ledger (per page session, LRU by id). */
    bump(id) {
      const n = (ledger.get(id) || 0) + 1;
      ledger.delete(id);
      ledger.set(id, n);
      while (ledger.size > c.LEDGER_MAX) ledger.delete(ledger.keys().next().value);
      return n;
    },
    errors(id) {
      return ledger.get(id) || 0;
    },
    clearErrors(id) {
      ledger.delete(id);
    },
    stats() {
      return {
        key,
        tabId,
        inflight,
        aheadInflight,
        queued: queue.size,
        phase,
        level,
        gateUntil,
        foreignUntil: foreignUntil(),
        factor: effFactor(),
        ownFactor: factor,
        windowCount: ownCount(),
        others,
        ledger: ledger.size,
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearPump();
      for (const id of [gateTimer, factorTimer, writeTimer]) if (null !== id) clearT(id);
      gateTimer = factorTimer = writeTimer = null;
      queue.clear();
      subs.clear();
      if (win && typeof win.removeEventListener === 'function') {
        win.removeEventListener('storage', onStorage);
        win.removeEventListener('pagehide', onPageHide);
      }
      if (channel) safe(() => channel.close());
    },
  };
}

/* ---------- page registry ---------- */

/** @type {Map<string, ReturnType<typeof createThumbBudget>>} */
const registry = new Map();
let defaults = {};

/** The budget key of a normalised URL: a broker that declared its host in `hosts`, else the host itself. */
export function budgetKeyFor(href) {
  const host = safe(() => new URL(String(href)).host.toLowerCase(), '') || '';
  for (const b of registry.values()) if (b.hasHost(host)) return b.key;
  return host || 'default';
}

/**
 * Page-wide config. With `budgetKey`: creates or reconfigures that broker (environment options only apply on
 * creation). Without: page defaults for every broker (existing ones are reconfigured).
 * @returns {ReturnType<typeof createThumbBudget>|null}
 */
export function configureThumbBudget(opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  if (!o.budgetKey) {
    defaults = Object.assign({}, defaults, o);
    for (const b of registry.values()) b.configure(o);
    return null;
  }
  const key = String(o.budgetKey);
  const b = registry.get(key);
  if (b) {
    b.configure(o);
    return b;
  }
  const created = createThumbBudget(Object.assign({}, defaults, o, { budgetKey: key }));
  registry.set(key, created);
  return created;
}

/** The page broker of `budgetKey` (created with the page defaults when missing). */
export function getThumbBudget(budgetKey) {
  const key = String(budgetKey || 'default');
  return registry.get(key) || configureThumbBudget({ budgetKey: key });
}

/** Test only: destroy every page broker and forget the defaults. */
export function _resetThumbBudgets() {
  for (const b of registry.values()) b.destroy();
  registry.clear();
  defaults = {};
}
