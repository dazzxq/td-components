/**
 * v0.111.0 (plan v0.111.0-media-picker-thumb-loader, C1/C5/C6/C10–C13) — the per-surface thumbnail loader. Ported
 * from the dwp photos loader (tokens, `finish` as the only slot release, cell states, visibility / bfcache handling),
 * paced by the page-wide broker of `thumb-budget.js` (one per `budgetKey`, shared by every loader of the page).
 *
 * Markup: `<img data-td-src="…" [data-td-srcset="…" data-td-sizes="…"] decoding="async" alt="">` — no `src`, no
 *   `loading=lazy`; only the loader sets the real attributes. Server-rendered images that already carry `src` opt in
 *   with `data-td-managed-img` (adopted at `scan` / `observe`; see "SSR adoption").
 * Cell (default: closest `[data-td-thumb-cell]`, else the image's parent) carries exactly one state class at a time:
 *   `is-thumb-waiting` (retry wait / gate), `is-thumb-loaded`, `is-thumb-failed`; none while watching / loading.
 *   The scanned root gets `td-thumbs-js` (CSS hooks live under it).
 * Cell id: `data-id` of the cell, then of the image, then the normalised URL (`idOf` overrides). Attempts are counted
 *   per id in the broker (page session): at most MAX_ATTEMPTS loads, the first included; gate-cancelled loads do not
 *   count. Only `scan(root, { userInitiated: true })` clears a failed id.
 * URLs: `safeMediaUrl` (https, relative, http on an http page). Refused → failed at once, no token, no attempt.
 *   `srcset` candidates are parsed one by one; a bad candidate is dropped; a candidate of another budget (host not the
 *   `src` host, not declared in the broker's `hosts`) drops the whole `srcset` — `src` alone is used (C13).
 * States: idle → watching (IO) → [dwelling] → queued (broker) → loading → loaded | error. Dwell (120 ms) only while
 *   scrolling faster than one viewport per second and only for cells not yet in the real viewport (C11). Leaving the
 *   margin while queued / dwelling → watching; while loading → the load completes (the WAF already counted it).
 *   Error: remove `src` / `srcset` / `sizes` first (never a broken icon), bump the ledger, report to the broker; at the
 *   cap → failed (final); gate → gated (waiting class) until the broker's gate ends; else one retry after 1.5 s.
 * rootMargin = clamp(300px, 0.75 × scroll-root height, 600px); the observer is rebuilt (debounced) after a resize.
 * SSR adoption (C6/C12/C13): a managed image's `src` / `srcset` / `sizes` are copied to `data-td-*`, then:
 *   complete + naturalWidth > 0 → loaded (counted in the window); complete + naturalWidth 0 → failed before the
 *   script ran → recovery; not complete inside viewport + margin → still loading: it holds a concurrency slot until
 *   `load` / `error`; not complete outside → converted to `data-td-*` (the broker takes over). A capture-phase `error`
 *   listener on scanned roots recovers managed images that fail outside the loader's own loads.
 * `swap(img, url, { priority })` keeps the current image until the new one loaded (probe element, same budget).
 * The loader never touches the inline style property (C10): classes and attributes only.
 *
 * @module utils/thumb-loader
 */
import { safeMediaUrl } from './media-url.js';
import { RANK, BUDGET, budgetKeyFor, getThumbBudget } from './thumb-budget.js';

export { configureThumbBudget, getThumbBudget } from './thumb-budget.js';

/** Every number of the loader (tests read these). */
export const THUMB = Object.freeze({
  DWELL_MS: 120,
  HOVER_MS: 120,
  RETRY_DELAY_MS: 1500,
  MAX_ATTEMPTS: BUDGET.MAX_ATTEMPTS,
  MARGIN_MIN: 300,
  MARGIN_MAX: 600,
  MARGIN_FRACTION: 0.75,
  FAST_VIEWPORTS_PER_S: 1,
  SAMPLE_FRESH_MS: 250,
  RESIZE_DEBOUNCE_MS: 150,
  SIZES_MAX: 1000,
  /** security r1 ISSUE-1: a load still pending after this is an error (a stalled host must not hold every slot) */
  LOAD_TIMEOUT_MS: 20_000,
  /** security r1 ISSUE-3: srcset bounds (longer / more candidates → srcset dropped, `src` alone) */
  SRCSET_MAX_CHARS: 16_384,
  SRCSET_MAX_CANDIDATES: 16,
});

export const ROOT_CLASS = 'td-thumbs-js';

export const CLS = Object.freeze({
  waiting: 'is-thumb-waiting',
  loaded: 'is-thumb-loaded',
  failed: 'is-thumb-failed',
});

export const ATTR = Object.freeze({
  src: 'data-td-src',
  srcset: 'data-td-srcset',
  sizes: 'data-td-sizes',
  managed: 'data-td-managed-img',
});

const SEL = 'img[' + ATTR.src + '], img[' + ATTR.managed + ']';

/** clamp(MARGIN_MIN, MARGIN_FRACTION × height, MARGIN_MAX), in whole px. */
export function rootMarginFor(height, c = THUMB) {
  const h = typeof height === 'number' && Number.isFinite(height) ? height : 0;
  return Math.round(Math.min(c.MARGIN_MAX, Math.max(c.MARGIN_MIN, c.MARGIN_FRACTION * h)));
}

/**
 * HTML srcset → `[{url, desc}]` (spec-like tokenizer: a URL is a run of non-space characters, so commas inside a
 * URL survive; trailing commas end a descriptor-less candidate; descriptors run to the next comma outside parens).
 */
export function parseSrcset(str) {
  const out = [];
  if (typeof str !== 'string' || str.length > THUMB.SRCSET_MAX_CHARS) return out; // security r1 ISSUE-3
  const s = str;
  const ws = (ch) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';
  let i = 0;
  while (i < s.length) {
    while (i < s.length && (ws(s[i]) || s[i] === ',')) i++;
    if (i >= s.length) break;
    const start = i;
    while (i < s.length && !ws(s[i])) i++;
    let url = s.slice(start, i);
    let desc = '';
    if (url.endsWith(',')) {
      url = url.replace(/,+$/, '');
    } else {
      let j = i;
      let depth = 0;
      while (j < s.length) {
        const ch = s[j];
        if (ch === '(') depth++;
        else if (ch === ')') depth = Math.max(0, depth - 1);
        else if (ch === ',' && depth === 0) break;
        j++;
      }
      desc = s.slice(i, j).trim();
      i = j + 1;
    }
    if (url) out.push({ url, desc });
  }
  return out;
}

const DESC = /^(?:[1-9]\d*w|(?:\d+(?:\.\d+)?|\.\d+)x)$/;
const hostOf = (href) => {
  try {
    return new URL(href).host.toLowerCase();
  } catch {
    return '';
  }
};

/**
 * The srcset to apply for `srcHref` (C13): candidates normalised with `safeMediaUrl`, bad ones (URL refused, bad or
 * duplicate descriptor) dropped; any candidate outside the `src` budget → '' (src only).
 * @param {string} raw @param {string} srcHref @param {{key?:string, hasHost?:(h:string)=>boolean}|null} broker
 * @param {{baseURI?:string, protocol?:string}} [urlOpts]
 */
export function cleanSrcset(raw, srcHref, broker, urlOpts = {}) {
  const cands = parseSrcset(raw);
  if (!cands.length || !srcHref || cands.length > THUMB.SRCSET_MAX_CANDIDATES) return ''; // security r1 ISSUE-3
  const srcHost = hostOf(srcHref);
  const out = [];
  const seen = new Set();
  for (const cand of cands) {
    const desc = cand.desc.replace(/\s+/g, ' ');
    if (desc && !DESC.test(desc)) continue;
    const key = desc || '1x';
    if (seen.has(key)) continue;
    const href = safeMediaUrl(cand.url, urlOpts);
    if (!href || href.endsWith(',')) continue;
    const h = hostOf(href);
    const same = h === srcHost || (broker && typeof broker.hasHost === 'function' && broker.hasHost(h))
      || (broker && broker.key && budgetKeyFor(href) === broker.key);
    if (!same) return '';
    seen.add(key);
    out.push(desc ? href + ' ' + desc : href);
  }
  return out.join(', ');
}

/**
 * @param {object} [opts] `{win, doc, IO, MO, now, setTimeout, clearTimeout, requestAnimationFrame,
 *   cancelAnimationFrame, onGate({until, remainingMs}), budget (broker or budgetKey), scrollRoot, cellSelector,
 *   cellOf(img), idOf(img, cell), rootClass, baseURI, protocol, constants}`
 */
export function createThumbLoader(opts = {}) {
  const win = 'win' in opts ? opts.win : typeof window !== 'undefined' ? window : null;
  const doc = 'doc' in opts ? opts.doc : (win && win.document) || null;
  const c = Object.assign({}, THUMB, opts.constants || {});
  const now = opts.now || (() => Date.now());
  const setT = opts.setTimeout || ((f, ms) => setTimeout(f, ms));
  const clearT = opts.clearTimeout || ((id) => clearTimeout(id));
  let raf;
  let caf;
  if (typeof opts.requestAnimationFrame === 'function') {
    raf = opts.requestAnimationFrame;
    caf = typeof opts.cancelAnimationFrame === 'function' ? opts.cancelAnimationFrame : () => {};
  } else if (win && typeof win.requestAnimationFrame === 'function') {
    raf = (f) => win.requestAnimationFrame(f);
    caf = (id) => win.cancelAnimationFrame(id);
  } else {
    raf = (f) => setT(f, 16);
    caf = (id) => clearT(id);
  }
  const IO = 'IO' in opts ? opts.IO : (win && win.IntersectionObserver) || null;
  const MO = 'MO' in opts ? opts.MO : (win && win.MutationObserver) || null;
  const onGate = typeof opts.onGate === 'function' ? opts.onGate : null;
  const scrollRoot = opts.scrollRoot || null;
  const cellSelector = opts.cellSelector || '[data-td-thumb-cell]';
  const rootClass = typeof opts.rootClass === 'string' ? opts.rootClass : ROOT_CLASS;
  const urlOpts = {
    baseURI: typeof opts.baseURI === 'string' ? opts.baseURI : (doc && typeof doc.baseURI === 'string' ? doc.baseURI : undefined),
    protocol: typeof opts.protocol === 'string' ? opts.protocol
      : (win && win.location && typeof win.location.protocol === 'string' ? win.location.protocol : undefined),
  };
  const fixedBudget = opts.budget && typeof opts.budget === 'object' ? opts.budget
    : typeof opts.budget === 'string' && opts.budget ? getThumbBudget(opts.budget) : null;

  /** @type {WeakMap<any, any>} */
  const states = new WeakMap();
  const live = new Set();
  /** swap jobs by image */
  const jobs = new Map();
  const roots = new Set();
  const observers = [];
  /** broker → unsubscribe */
  const brokers = new Map();
  const owner = { paused: !!(doc && doc.hidden) };
  let inflight = 0;
  let loaded = 0;
  let failed = 0;
  let destroyed = false;
  let margin = 0;
  let io = null;
  let resizeTimer = null;
  let rafId = null;
  let scrollDir = 0;
  let speed = 0;
  let lastY = null;
  let lastT = 0;
  let lastSampleAt = -Infinity;

  const brokerFor = (href) => {
    const b = fixedBudget || getThumbBudget(budgetKeyFor(href));
    if (!brokers.has(b)) {
      brokers.set(b, b.subscribe({
        onGate: (info) => onBrokerGate(b, info),
        onGateEnd: () => onBrokerGateEnd(b),
      }));
    }
    return b;
  };
  const pumpAll = () => {
    if (destroyed) return;
    for (const b of Array.from(brokers.keys())) b.pump();
  };

  /* ---------- geometry ---------- */

  // the layout viewport height (measuring, not a breakpoint: src/utils/breakpoints.test.js forbids inner* here)
  const viewportH = () => (doc && doc.documentElement && Number(doc.documentElement.clientHeight)) || 0;
  const rectOf = (el) => (el && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null);
  const viewBox = () => {
    const r = scrollRoot ? rectOf(scrollRoot) : null;
    return r ? { top: r.top, bottom: r.bottom } : { top: 0, bottom: viewportH() };
  };
  const rootH = () => {
    if (scrollRoot) {
      if (scrollRoot.clientHeight) return scrollRoot.clientHeight;
      const b = viewBox();
      return b.bottom - b.top;
    }
    return viewportH();
  };
  const scrollPos = () => {
    if (scrollRoot) return Number(scrollRoot.scrollTop) || 0;
    if (win && typeof win.scrollY === 'number') return win.scrollY;
    if (win && typeof win.pageYOffset === 'number') return win.pageYOffset;
    return (doc && doc.documentElement && Number(doc.documentElement.scrollTop)) || 0;
  };
  /** `{rank, dist}` in the broker's terms, or null when the image left the DOM. */
  function measure(s) {
    if (!s.img.isConnected) return null;
    const r = rectOf(s.img);
    if (!r) return { rank: RANK.visible, dist: 0 };
    const v = viewBox();
    let dist = 0;
    let below = true;
    if (r.bottom < v.top) {
      dist = v.top - r.bottom;
      below = false;
    } else if (r.top > v.bottom) {
      dist = r.top - v.bottom;
    } else {
      return { rank: RANK.visible, dist: 0 };
    }
    if ('user' === s.priority) return { rank: RANK.user, dist };
    const ahead = 0 === scrollDir || (below ? scrollDir > 0 : scrollDir < 0);
    return { rank: ahead ? RANK.ahead : RANK.rest, dist };
  }
  const isVisible = (s) => {
    const m = measure(s);
    return !!m && m.rank === RANK.visible;
  };
  const inMargin = (r) => {
    const v = viewBox();
    return r.bottom >= v.top - margin && r.top <= v.bottom + margin;
  };
  const isFast = () => now() - lastSampleAt <= c.SAMPLE_FRESH_MS && speed > c.FAST_VIEWPORTS_PER_S * rootH();

  /* ---------- cell helpers ---------- */

  const setCls = (s, which) => {
    const cl = s.cell && s.cell.classList;
    if (!cl) return;
    for (const k of Object.keys(CLS)) {
      if (k === which) cl.add(CLS[k]);
      else cl.remove(CLS[k]);
    }
  };
  const clearTimers = (s) => {
    if (null !== s.dwell) {
      clearT(s.dwell);
      s.dwell = null;
    }
    if (null !== s.retry) {
      clearT(s.retry);
      s.retry = null;
    }
  };
  const removeReal = (img) => {
    img.removeAttribute('src');
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
  };

  /** Settle token `tok`: current token only, once. The ONLY place that releases a slot. → the ticket, or null. */
  const finish = (s, tok) => {
    if (null === s.active || s.active !== tok) return null;
    s.active = null;
    const el = s.probe || s.img;
    el.removeEventListener('load', s.onLoad);
    el.removeEventListener('error', s.onError);
    s.onLoad = null;
    s.onError = null;
    if (null != s.loadTimer) {
      clearT(s.loadTimer);
      s.loadTimer = null;
    }
    inflight -= 1;
    const tk = s.ticket;
    s.ticket = null;
    if (tk) tk.release();
    return tk || {};
  };
  /** Cancel the running load: invalidate the token FIRST, then drop the attributes so the browser aborts. */
  const cancelLoad = (s) => {
    if (null !== s.active && finish(s, s.active)) removeReal(s.probe || s.img);
  };
  const dequeue = (s) => {
    if (s.req) {
      s.broker.cancel(s.req);
      s.req = null;
    }
  };
  const unwatch = (s) => {
    live.delete(s);
    dequeue(s);
    if (io) io.unobserve(s.img);
  };
  const toWatching = (s) => {
    s.st = 'watching';
    setCls(s, null);
  };
  const toGated = (s) => {
    s.st = 'gated';
    setCls(s, 'waiting');
  };
  const fail = (s) => {
    clearTimers(s);
    cancelLoad(s);
    unwatch(s);
    removeReal(s.img);
    s.st = 'failed';
    setCls(s, 'failed');
    failed += 1;
  };
  /** Left the DOM when its turn came: dropped, no token, no attempt; a later `scan` resumes it. */
  const drop = (s) => {
    clearTimers(s);
    cancelLoad(s);
    unwatch(s);
    s.st = 'idle';
    s.inView = false;
    setCls(s, null);
  };

  const listen = (s, el, tk) => {
    const tok = (s.tok += 1);
    s.active = tok;
    s.ticket = tk;
    inflight += 1;
    const done = s.isJob ? settleJob : settle;
    s.onLoad = () => done(s, tok, true);
    s.onError = () => done(s, tok, false);
    el.addEventListener('load', s.onLoad);
    el.addEventListener('error', s.onError);
    // security r1 ISSUE-1: a stalled request becomes an ordinary error (src dropped → the browser aborts it)
    s.loadTimer = setT(() => {
      s.loadTimer = null;
      if (s.active === tok) done(s, tok, false);
    }, c.LOAD_TIMEOUT_MS);
  };

  function start(s, tk) {
    s.req = null;
    s.st = 'loading';
    listen(s, s.img, tk);
    if (s.srcset) {
      if (s.sizes) s.img.setAttribute('sizes', s.sizes);
      s.img.setAttribute('srcset', s.srcset);
    }
    s.img.setAttribute('src', s.url);
  }

  function enqueue(s) {
    if (s.broker.isCoolingDown()) {
      toGated(s);
      return;
    }
    if (s.req) return;
    s.st = 'queued';
    setCls(s, null);
    s.req = s.broker.request({
      owner,
      id: s.id,
      key: failKey(s),
      get seenAt() {
        return s.seenAt;
      },
      measure: () => measure(s),
      onDrop: () => {
        s.req = null;
        drop(s);
      },
      start: (tk) => start(s, tk),
    });
  }

  function dwell(s) {
    s.st = 'dwelling';
    s.dwell = setT(() => {
      s.dwell = null;
      if ('dwelling' === s.st && s.inView) {
        enqueue(s);
        pumpAll();
      }
    }, c.DWELL_MS);
  }

  /** A cell entered the margin (IO or scan-time rect). */
  function entered(s) {
    if (isFast() && !isVisible(s)) dwell(s);
    else enqueue(s);
  }

  /** Codex impl r1 ISSUE-1 (C11): gate clusters and canaries count distinct failed URLs; the ledger stays per id. */
  function failKey(s, failed) {
    return String(failed || s.url || s.id || '');
  }

  /** Error path shared by own loads, adopted loads, pre-adoption failures and the capture listener. */
  function errorPath(s, tk) {
    // Codex impl r2 ISSUE-5: the URL the browser actually tried (a srcset candidate), read before src/srcset go
    const cur = s.img && typeof s.img.currentSrc === 'string' && s.img.currentSrc ? safeMediaUrl(s.img.currentSrc, urlOpts) : '';
    removeReal(s.img);
    const n = s.broker.bump(s.id);
    const visible = isVisible(s);
    const wasCooling = s.broker.isCoolingDown();
    s.st = 'erroring';
    const g = s.broker.reportError(tk && tk.release ? tk : null, { id: s.id, key: failKey(s, cur), visible, n });
    if (n >= c.MAX_ATTEMPTS) {
      fail(s);
      return;
    }
    if (wasCooling || 'none' !== g) {
      toGated(s);
      return;
    }
    s.st = 'retrywait';
    setCls(s, 'waiting');
    s.retry = setT(() => {
      s.retry = null;
      if ('retrywait' !== s.st) return;
      if (!s.img.isConnected) drop(s);
      else if (s.inView) {
        enqueue(s); // through the broker as usual (token + caps), no second dwell
        pumpAll();
      } else toWatching(s); // keeps its right to retry: the next entry dwells / queues
    }, c.RETRY_DELAY_MS);
  }

  function settle(s, tok, ok) {
    const tk = finish(s, tok);
    if (!tk) return; // a late event of an old / cancelled token
    if (ok && s.img.complete && s.img.naturalWidth > 0) {
      unwatch(s);
      s.st = 'loaded';
      s.broker.clearErrors(s.id);
      setCls(s, 'loaded');
      loaded += 1;
      s.broker.reportLoad(tk.release ? tk : null);
      pumpAll();
      return;
    }
    errorPath(s, tk);
    pumpAll();
  }

  /* ---------- broker events ---------- */

  function onBrokerGate(b, info) {
    let had = false;
    for (const s of Array.from(live)) {
      if (s.broker !== b) continue;
      had = true;
      if ('loading' === s.st) {
        cancelLoad(s);
        toGated(s);
      } else if ('queued' === s.st) {
        dequeue(s);
        toGated(s);
      } else if ('retrywait' === s.st) {
        clearTimers(s);
        toGated(s);
      }
    }
    for (const j of Array.from(jobs.values())) {
      if (j.broker !== b) continue;
      had = true;
      if ('loading' === j.st) cancelLoad(j);
      if ('queued' === j.st) dequeue(j);
      if ('loading' === j.st || 'queued' === j.st) j.st = 'gated';
    }
    if (onGate && had && info && 'quiet' !== info.kind) {
      try {
        onGate({ until: info.until, remainingMs: info.remainingMs });
      } catch {
        // a broken toast must not break the loader
      }
    }
  }

  function onBrokerGateEnd(b) {
    if (destroyed) return;
    for (const s of Array.from(live)) {
      if (s.broker !== b || 'gated' !== s.st) continue;
      if (!s.img.isConnected) drop(s);
      else if (s.inView) enqueue(s);
      else toWatching(s);
    }
    for (const j of Array.from(jobs.values())) {
      if (j.broker === b && 'gated' === j.st) requestJob(j);
    }
  }

  /* ---------- IntersectionObserver ---------- */

  function onIntersect(entries) {
    if (destroyed) return;
    for (const e of entries) {
      const s = states.get(e.target);
      if (!s || !live.has(s)) continue;
      const was = s.inView;
      s.inView = !!e.isIntersecting;
      if (s.inView) {
        if (!was) s.seenAt = now();
        if ('watching' === s.st) entered(s);
      } else if ('dwelling' === s.st) {
        clearTimers(s);
        s.st = 'watching';
      } else if ('queued' === s.st) {
        dequeue(s);
        s.st = 'watching';
      }
    }
    pumpAll();
  }

  const makeIO = () => {
    margin = rootMarginFor(rootH(), c);
    if (!IO) return null;
    const o = new IO(onIntersect, { root: scrollRoot || null, rootMargin: margin + 'px 0px' });
    for (const s of live) o.observe(s.img);
    return o;
  };
  io = makeIO();

  const onResize = () => {
    if (null !== resizeTimer) clearT(resizeTimer);
    resizeTimer = setT(() => {
      resizeTimer = null;
      if (destroyed) return;
      if (rootMarginFor(rootH(), c) === margin) return;
      if (io) io.disconnect();
      io = makeIO(); // IO cannot change its margin in place
    }, c.RESIZE_DEBOUNCE_MS);
  };

  const sample = () => {
    rafId = null;
    if (destroyed) return;
    const y = scrollPos();
    const t = now();
    if (null !== lastY && t > lastT) {
      const dy = y - lastY;
      speed = (Math.abs(dy) * 1000) / (t - lastT);
      if (dy) scrollDir = dy > 0 ? 1 : -1;
    }
    lastY = y;
    lastT = t;
    lastSampleAt = t;
  };
  const onScroll = () => {
    if (null === rafId) rafId = raf(sample);
  };

  /* ---------- scan ---------- */

  const matches = (el, sel) => !!el && typeof el.matches === 'function' && el.matches(sel);
  const imgsIn = (root) => {
    const out = [];
    if (matches(root, SEL)) out.push(root);
    if (root && typeof root.querySelectorAll === 'function') out.push(...root.querySelectorAll(SEL));
    return out;
  };
  const cellOf = (img) => (typeof opts.cellOf === 'function' && opts.cellOf(img))
    || (typeof img.closest === 'function' && img.closest(cellSelector)) || img.parentElement || img;
  const idOf = (img, cell, url) => {
    if (typeof opts.idOf === 'function') {
      const v = opts.idOf(img, cell);
      if (v) return String(v);
    }
    return (cell && cell.getAttribute && cell.getAttribute('data-id')) || img.getAttribute('data-id') || url;
  };
  const markRoot = (root) => {
    if (!rootClass) return;
    let el = root && 9 === root.nodeType ? root.documentElement : root;
    if (matches(el, cellSelector) || matches(el, SEL)) el = el.parentElement;
    if (el && el.classList) el.classList.add(rootClass);
  };

  const onCaptureError = (e) => {
    const img = e && e.target;
    if (destroyed || !img || !matches(img, 'img[' + ATTR.managed + ']')) return;
    const s = states.get(img);
    if (s && null !== s.active) return; // the loader's own token handles it
    if (!img.getAttribute('src')) return;
    if (!s || 'idle' === s.st) {
      scanImg(img, false);
      pumpAll();
      return;
    }
    if ('loaded' === s.st || 'failed' === s.st) {
      // a managed image changed by the site and failed: recover it under its new URL
      stash(img, true);
      readUrls(s);
      if (!s.url) return;
      live.add(s);
      if (io) io.observe(img);
      s.inView = true;
      errorPath(s, null);
      pumpAll();
    }
  };
  const addRoot = (root) => {
    if (roots.has(root)) return;
    roots.add(root);
    if (typeof root.addEventListener === 'function') root.addEventListener('error', onCaptureError, true);
  };

  const newState = (img) => ({
    img, cell: null, id: '', url: '', srcset: '', sizes: '', broker: null, st: 'idle', tok: 0, active: null,
    ticket: null, req: null, onLoad: null, onError: null, dwell: null, retry: null, inView: false, seenAt: 0,
    priority: null, probe: null,
  });

  /** Copy the real attributes of a managed SSR image into data-td-* (overwrite: the real ones are newer). */
  const stash = (img, overwrite) => {
    for (const [real, data] of [['src', ATTR.src], ['srcset', ATTR.srcset], ['sizes', ATTR.sizes]]) {
      const v = img.getAttribute(real);
      if (null !== v && (overwrite || null === img.getAttribute(data))) img.setAttribute(data, v);
    }
  };

  function readUrls(s) {
    const img = s.img;
    s.url = safeMediaUrl(img.getAttribute(ATTR.src), urlOpts);
    s.broker = s.url ? brokerFor(s.url) : s.broker || fixedBudget;
    s.srcset = s.url ? cleanSrcset(img.getAttribute(ATTR.srcset) || '', s.url, s.broker, urlOpts) : '';
    const sizes = img.getAttribute(ATTR.sizes);
    s.sizes = s.srcset && typeof sizes === 'string' ? sizes.trim().slice(0, c.SIZES_MAX) : '';
    s.id = idOf(img, s.cell, s.url || String(img.getAttribute(ATTR.src) || ''));
  }

  function watch(s) {
    toWatching(s);
    s.inView = false;
    live.add(s);
    if (!io) {
      s.inView = true; // no IO: everything counts as in view, still through the broker
      s.seenAt = now();
      enqueue(s);
      return;
    }
    io.observe(s.img);
    const r = rectOf(s.img);
    if (r && inMargin(r)) {
      s.inView = true;
      s.seenAt = now();
      entered(s);
    }
  }

  function adopt(s) {
    const img = s.img;
    stash(img, false);
    readUrls(s);
    if (!s.url || !s.broker) {
      fail(s);
      return;
    }
    if (img.complete) {
      s.broker.record(1);
      if (img.naturalWidth > 0) {
        s.st = 'loaded';
        setCls(s, 'loaded');
        s.broker.clearErrors(s.id); // Codex impl r1 ISSUE-4
        loaded += 1;
        return;
      }
      live.add(s); // failed before the script ran → recovery
      if (io) io.observe(img);
      const r = rectOf(img);
      s.inView = !io || !r || inMargin(r);
      s.seenAt = now();
      errorPath(s, null);
      return;
    }
    const r = rectOf(img);
    if (!r || inMargin(r)) {
      live.add(s); // the browser is loading it now: hold a slot until load / error
      if (io) io.observe(img);
      s.inView = true;
      s.seenAt = now();
      s.st = 'loading';
      listen(s, img, s.broker.occupy());
      return;
    }
    removeReal(img); // a pending legacy lazy image: the broker takes over
    img.removeAttribute('loading');
    watch(s);
  }

  function scanImg(img, user) {
    let s = states.get(img);
    if (!s) {
      s = newState(img);
      states.set(img, s);
    }
    s.cell = cellOf(img);
    if ('idle' === s.st || 'failed' === s.st) {
      const raw = img.getAttribute(ATTR.src) || img.getAttribute('src') || '';
      const href = safeMediaUrl(raw, urlOpts);
      if (user) {
        const b = s.broker || (href ? brokerFor(href) : null);
        if (b) b.clearErrors(idOf(img, s.cell, href || String(raw)));
        if ('failed' === s.st) s.st = 'idle';
      }
    }
    if ('idle' !== s.st || !img.isConnected) return; // loaded / failed: final; live: kept; detached: wait
    if (null !== img.getAttribute(ATTR.managed) && img.getAttribute('src')) {
      adopt(s);
      return;
    }
    if (null === img.getAttribute(ATTR.src)) return;
    readUrls(s);
    if (!s.url || !s.broker) {
      fail(s); // refused URL: final, no token, no attempt
      return;
    }
    if (s.broker.errors(s.id) >= c.MAX_ATTEMPTS) {
      fail(s); // same id rebuilt after exhausting its attempts: no new load
      return;
    }
    watch(s);
  }

  function scanInternal(root, user, top) {
    if (destroyed || !root) return;
    if (top) {
      markRoot(root);
      addRoot(root);
    }
    for (const img of imgsIn(root)) scanImg(img, user);
    pumpAll();
  }

  /* ---------- swap ---------- */

  function requestJob(j) {
    if (!j.img.isConnected) {
      jobs.delete(j.img);
      return;
    }
    if (j.broker.isCoolingDown()) {
      j.st = 'gated';
      return;
    }
    j.st = 'queued';
    j.req = j.broker.request({
      owner,
      id: j.id,
      seenAt: j.seenAt,
      measure: () => measure(j),
      onDrop: () => {
        j.req = null;
        jobs.delete(j.img);
      },
      start: (tk) => {
        j.req = null;
        j.st = 'loading';
        j.probe = doc.createElement('img');
        // security r1 ISSUE-2: the probe fetches like the target (no referrer leak, same CORS mode)
        for (const a of ['referrerpolicy', 'crossorigin']) {
          const v = j.img.getAttribute(a);
          if (null !== v) j.probe.setAttribute(a, v);
        }
        listen(j, j.probe, tk);
        j.probe.setAttribute('src', j.url);
      },
    });
  }
  function settleJob(j, tok, ok) {
    const tk = finish(j, tok);
    if (!tk) return;
    const probe = j.probe;
    j.probe = null;
    if (jobs.get(j.img) === j) jobs.delete(j.img);
    if (ok && probe && probe.complete && probe.naturalWidth > 0) {
      const img = j.img;
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      if (null !== img.getAttribute(ATTR.src)) {
        img.setAttribute(ATTR.src, j.url);
        img.removeAttribute(ATTR.srcset);
        img.removeAttribute(ATTR.sizes);
      }
      img.setAttribute('src', j.url);
      j.broker.clearErrors(j.id);
      j.broker.reportLoad(tk.release ? tk : null);
    } else {
      if (probe) probe.removeAttribute('src'); // a timed-out probe stops fetching
      // the current image stays; the failure still counts toward the gate
      const n = j.broker.bump(j.id);
      j.broker.reportError(tk.release ? tk : null, { id: j.id, visible: isVisible(j), n });
    }
    pumpAll();
  }
  const cancelJob = (j) => {
    if (null !== j.timer) {
      clearT(j.timer);
      j.timer = null;
    }
    dequeue(j);
    if (null !== j.active && finish(j, j.active) && j.probe) j.probe.removeAttribute('src');
    j.probe = null;
    j.st = 'idle';
    if (jobs.get(j.img) === j) jobs.delete(j.img);
  };

  /* ---------- page lifecycle ---------- */

  const onVis = () => (doc && doc.hidden ? loader.pause() : loader.resume());
  const onShow = (e) => {
    if (e && e.persisted) {
      loader.resume();
      for (const r of Array.from(roots)) {
        if (false === r.isConnected) roots.delete(r);
        else loader.scan(r);
      }
    }
  };

  const loader = {
    /** Adopt / watch every managed image under `root`. `userInitiated` clears the failed ids of the root. */
    scan(root, o) {
      scanInternal(root, !!(o && o.userInitiated), true);
    },
    /** Cancel loads and timers under `root`; unfinished cells back to idle. Never clears the ledger. */
    release(root) {
      for (const img of imgsIn(root)) {
        const j = jobs.get(img);
        if (j) cancelJob(j);
        const s = states.get(img);
        if (!s) continue;
        clearTimers(s);
        cancelLoad(s);
        unwatch(s);
        if ('loaded' !== s.st && 'failed' !== s.st) {
          s.st = 'idle';
          s.inView = false;
          setCls(s, null);
        }
      }
      pumpAll();
    },
    /** `scan(root)` now, then scan added / release removed direct children (MutationObserver childList). */
    observe(root) {
      if (destroyed || !root) return;
      loader.scan(root);
      if (!MO) return;
      const mo = new MO((records) => {
        if (destroyed) return;
        for (const rec of records) {
          for (const n of Array.from(rec.removedNodes || [])) if (n && 1 === n.nodeType) loader.release(n);
          for (const n of Array.from(rec.addedNodes || [])) if (n && 1 === n.nodeType) scanInternal(n, false, false);
        }
      });
      mo.observe(root, { childList: true });
      observers.push(mo);
    },
    /**
     * Replace `img`'s picture with `url`, keeping the current one until the new one loaded. `priority`: 'user'
     * (explicit choice), 'hover' (dwells HOVER_MS first) or none. → false when the URL is refused.
     */
    swap(img, url, o = {}) {
      if (destroyed || !img) return false;
      const href = safeMediaUrl(url, urlOpts);
      if (!href) return false;
      // Codex impl r1/r2 ISSUE-3: a swap URL that already used its attempts is refused before anything changes (the
      // current picture and any running swap stay); no automatic retry, the next hover / swap() call is the retry
      if (brokerFor(href).errors(href) >= c.MAX_ATTEMPTS) return false;
      const priority = o && typeof o.priority === 'string' ? o.priority : null;
      const old = jobs.get(img);
      if (old) cancelJob(old);
      const s = states.get(img);
      if (s && 'loaded' !== s.st && 'idle' !== s.st && 'failed' !== s.st) {
        // still waiting for its first picture: just point the cell at the new URL
        clearTimers(s);
        cancelLoad(s);
        unwatch(s);
        img.setAttribute(ATTR.src, href);
        img.removeAttribute(ATTR.srcset);
        img.removeAttribute(ATTR.sizes);
        s.st = 'idle';
        s.priority = 'user' === priority ? 'user' : null;
        scanImg(img, false);
        pumpAll();
        return true;
      }
      if (!doc || typeof doc.createElement !== 'function') return false;
      const j = {
        img, url: href, id: href, broker: brokerFor(href), priority: 'user' === priority ? 'user' : null, st: 'idle',
        tok: 0, active: null, ticket: null, req: null, onLoad: null, onError: null, probe: null, timer: null,
        seenAt: now(), isJob: true,
      };
      jobs.set(img, j);
      if ('hover' === priority) {
        j.st = 'dwelling';
        j.timer = setT(() => {
          j.timer = null;
          if (jobs.get(img) === j && 'dwelling' === j.st) {
            requestJob(j);
            pumpAll();
          }
        }, c.HOVER_MS);
      } else requestJob(j);
      pumpAll();
      return true;
    },
    pause() {
      owner.paused = true;
    },
    resume() {
      if (destroyed) return;
      owner.paused = false;
      pumpAll();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (io) io.disconnect();
      for (const mo of observers) mo.disconnect();
      observers.length = 0;
      for (const j of Array.from(jobs.values())) cancelJob(j);
      for (const s of Array.from(live)) {
        clearTimers(s);
        cancelLoad(s);
        dequeue(s);
      }
      live.clear();
      for (const r of roots) if (typeof r.removeEventListener === 'function') r.removeEventListener('error', onCaptureError, true);
      roots.clear();
      for (const unsub of brokers.values()) unsub();
      for (const b of brokers.keys()) b.pump();
      brokers.clear();
      if (null !== resizeTimer) clearT(resizeTimer);
      resizeTimer = null;
      if (null !== rafId) caf(rafId);
      rafId = null;
      if (doc && typeof doc.removeEventListener === 'function') doc.removeEventListener('visibilitychange', onVis);
      if (win && typeof win.removeEventListener === 'function') {
        win.removeEventListener('pageshow', onShow);
        win.removeEventListener('resize', onResize);
      }
      const st = scrollRoot || win;
      if (st && typeof st.removeEventListener === 'function') st.removeEventListener('scroll', onScroll);
    },
    stats() {
      let queued = 0;
      for (const s of live) if (s.req) queued += 1;
      let gateUntil = 0;
      for (const b of brokers.keys()) gateUntil = Math.max(gateUntil, b.stats().gateUntil);
      return { queued, inflight, loaded, failed, gateUntil, rootMargin: margin, scrollDir, fast: isFast() };
    },
  };

  if (doc && typeof doc.addEventListener === 'function') doc.addEventListener('visibilitychange', onVis);
  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('pageshow', onShow);
    win.addEventListener('resize', onResize);
  }
  {
    const st = scrollRoot || win;
    if (st && typeof st.addEventListener === 'function') st.addEventListener('scroll', onScroll, { passive: true });
  }
  return loader;
}
