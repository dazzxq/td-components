/**
 * @internal v0.95.0 — the background upload store of td-media-picker's grid drop (plan v0.95.0-media-picker-bulk, A–H).
 * DOM-free (node-testable); not exported from the public entry.
 *
 * Files dropped into an open picker's grid live HERE, not in the picker session: closing the picker (×, Đóng, Esc,
 * Chèn, close(), removing the host) only detaches its view — uploads go on in the background; reopening a picker with
 * the SAME adapter object (and the same `context`) shows the running / failed cards again. A page reload / navigation
 * loses them (nothing is persisted).
 *
 *   getUploadStore(adapter, { toast, optimize? }) → store   // one per adapter object (Map, created lazily)
 *   store.attach(view) → session token  /  store.detach(view)
 *   store.accept(files, { view, cfg: { accept, maxSize, policy, single, labels }, context, collection, metaKeys,
 *     makeHook(rec, { onError, isClosed }) })                // → { accepted, rejected, records }
 *   store.visible(view) → records of the view's context, grid order (newest drop first)
 *   store.takeReused(context) → assets of `exact-reused` files that finished while no view showed them (consumed)
 *   store.retry(rec, view) / store.remove(rec) / store.retryFailed(view) / store.removeFailed(view) / store.cancelAll()
 *   uploadStats() → { running, waiting, failed } over every store;  cancelAllUploads() → number of files cancelled
 *   pageUploadSlots() → the page-wide createUploadSlots(3) pool (never closed; grid stores + the upload dialog)
 *
 * view (the DOM layer, media-picker-drop.js): `{ session, context, t(key, params),
 *   onAdd(recs), onChange(rec, kind), onDone(rec, asset, dedup), onRemove(rec), onError(detail), onBatch(result),
 *   detached() }` — called only for records of its context (`Object.is(rec.context, view.context)`).
 *
 * Record: `{ item, name, kind, context, session, attempt, reused, assetId, removed }` — `session` = the view session
 * the file was dropped in (decides selection / asset-change), `attempt` = the session the current upload try started in
 * (routes operation-error and the batch feedback). Only unfinished records are kept: a `done` item is released from
 * the queue at once (UploadQueue.release, its bytes dropped), the card of the view keeps what it needs.
 *
 * Caps per store (owner Q8): 100 unfinished files and 256 MiB estimated bytes (a policy file costs min(size, byte cap)
 * until optimised, then the optimised Blob's size; a file without policy costs 0 — a reference to the dropped File).
 * Over a cap → rejected at admission, reason `count`.
 */
import { UploadQueue, createUploadSlots, acceptsFile } from '../utils/upload-queue.js';

export const UPLOAD_LIMIT = 100;
export const UPLOAD_BYTES = 256 * 1024 * 1024;
const REUSED_MAX = 100;

/** `{name}` placeholders from `vars`; unknown ones are kept as written. */
const format = (tpl, vars = {}) => String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/** @type {ReturnType<typeof createUploadSlots>|null} */
let pagePool = null;

/** @returns {ReturnType<typeof createUploadSlots>} the page-wide pool: at most 3 concurrent `adapter.upload` (never closed) */
export function pageUploadSlots() {
  if (!pagePool) pagePool = createUploadSlots(3);
  return pagePool;
}

/** @type {Map<object, object>} adapter → store */
const stores = new Map();

const kindOf = (f) => {
  const type = String((f && f.type) || '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  return 'file';
};

/** the estimated bytes a policy file holds before its optimisation (> 0 for any non-empty file, Codex plan r1 #2) */
function estimate(file, policy, maxSize) {
  const size = Number(file && file.size) || 0;
  const caps = [policy && policy.maxBytes, maxSize].filter((v) => typeof v === 'number' && v > 0);
  return Math.min(size, caps.length ? Math.min(...caps) : size);
}

/** bytes an unfinished item holds in RAM (see the file header) */
function costOf(item) {
  if (!item.policy || item.blocked) return 0;
  if (item.ready) return item.file && item.file !== item.original ? Number(item.file.size) || 0 : 0;
  return estimate(item.original, item.policy, item.maxSize);
}

function abortError() {
  const e = new Error('aborted');
  e.name = 'AbortError';
  return e;
}

/**
 * @param {object} adapter
 * @param {{ toast?: (type: 'success'|'warning', text: string) => void, optimize?: Function }} [env]
 */
export function getUploadStore(adapter, env = {}) {
  let store = stores.get(adapter);
  if (!store) {
    store = createStore(adapter);
    stores.set(adapter, store);
  }
  store.configure(env);
  return store;
}

/** @internal tests: the store of `adapter` when one exists (never creates one) */
export function peekUploadStore(adapter) {
  return stores.get(adapter) || null;
}

/** @returns {{ running: number, waiting: number, failed: number }} every store of the page */
export function uploadStats() {
  let running = 0;
  let waiting = 0;
  let failed = 0;
  for (const store of stores.values()) {
    for (const item of store.queue.items) {
      if (item.status === 'error') failed++;
      else if ((item.status === 'uploading' && !item.waiting) || item.status === 'optimizing') running++;
      else if (item.status !== 'done') waiting++;
    }
  }
  return { running, waiting, failed };
}

/** Abort every background upload of the page (two phases), drop failed files and batches; no toast, no event. */
export function cancelAllUploads() {
  let n = 0;
  for (const store of [...stores.values()]) n += store.cancelAll();
  return n;
}

function createStore(adapter) {
  const env = { toast: null, optimize: null };
  /** @type {object|null} the attached view */
  let view = null;
  let sessions = 0;
  /** @type {object[]} unfinished records, grid order (newest drop first, file order inside a drop) */
  let records = [];
  const byItem = new Map();
  /** @type {{ asset: object, context: * }[]} exact-reused files that finished unseen (oldest first) */
  let reusedDone = [];
  /** item → attempt session, for the items of the open batch (a removed item leaves it; a released one stays) */
  let batchAttempts = new Map();
  /** the label function of the last attached session (its messages snapshot; never the session itself) */
  let lastT = null;
  /** admission config of the latest drop (labels are read later: optimisation errors) */
  let cfg = { accept: null, maxSize: null, policy: null, single: false, labels: {} };

  const call = (fn, ...args) => {
    if (typeof fn !== 'function') return undefined;
    try { return fn(...args); } catch (err) { console.error(err); return undefined; }
  };
  const shows = (rec) => !!view && Object.is(rec.context, view.context);
  const tt = (k, p) => {
    try { return String((lastT && lastT(k, p)) ?? ''); } catch { return ''; }
  };

  const queue = new UploadQueue({
    get accept() { return cfg.accept; },
    get maxSize() { return cfg.maxSize; },
    get policy() { return cfg.policy; },
    get labels() { return cfg.labels || {}; },
    get optimize() { return env.optimize || undefined; },
    single: false, // never on the shared queue (Codex plan r1 #1): single mode is done here, per session
    upload: (file, c) => {
      // the item whose upload try owns this signal (unique per try)
      const item = queue.items.find((i) => i.controller && i.controller.signal === c.signal);
      const rec = item ? byItem.get(item) : null;
      if (!rec || typeof rec.hook !== 'function') return Promise.reject(abortError());
      return rec.hook(file, c);
    },
    slots: () => pageUploadSlots(),
    onChange: (item, kind) => onChange(item, kind),
    onRemoved: (item) => onRemoved(item),
    onBatchEnd: (r) => onBatchEnd(r),
  });

  function unlink(rec) {
    const i = records.indexOf(rec);
    if (i >= 0) records.splice(i, 1);
    byItem.delete(rec.item);
  }

  function onChange(item, kind) {
    const rec = byItem.get(item);
    if (!rec) return;
    if (kind === 'done') {
      finish(rec);
      return;
    }
    if (shows(rec)) call(view.onChange, rec, kind);
  }

  function finish(rec) {
    const res = rec.item.result;
    const asset = res && res.asset;
    const dedup = res && res.deduplication;
    rec.reused = !!dedup && dedup.outcome === 'exact-reused';
    rec.assetId = asset ? asset.id : null;
    unlink(rec);
    queue.release(rec.item); // its bytes go now (plan G); the batch still counts it
    if (shows(rec)) call(view.onDone, rec, asset, dedup);
    else if (rec.reused && asset) markReused(asset, rec.context);
    prune();
  }

  function markReused(asset, context) {
    reusedDone = reusedDone.filter((m) => !(m.asset.id === asset.id && Object.is(m.context, context)));
    reusedDone.push({ asset, context });
    if (reusedDone.length > REUSED_MAX) reusedDone.splice(0, reusedDone.length - REUSED_MAX);
  }

  function onRemoved(item) {
    const rec = byItem.get(item);
    if (!rec) return;
    rec.removed = true;
    batchAttempts.delete(item); // it left the batch too: its session no longer decides where the summary goes
    unlink(rec);
    if (shows(rec)) call(view.onRemove, rec);
    prune();
  }

  function onBatchEnd(r) {
    const attempts = [...batchAttempts.values()];
    batchAttempts = new Map();
    const local = !!view && attempts.length > 0 && attempts.every((a) => a === view.session);
    if (local) call(view.onBatch, r);
    else if (r && r.fail > 0) call(env.toast, 'warning', tt('uploadFailedClosed', { n: r.fail }));
    else if (r && r.ok > 0) call(env.toast, 'success', tt('uploadDone', { ok: r.ok, total: r.total }));
    prune();
  }

  function routeError(rec, d) {
    if (view && rec.attempt === view.session) call(view.onError, d);
  }

  /** a store with nothing left (no record, no mark, no view, no open batch) leaves the Map: the adapter is not kept */
  function prune() {
    if (view || records.length || reusedDone.length || queue.items.length || queue._batch) return;
    if (stores.get(adapter) === store) stores.delete(adapter);
  }

  /** a new batch starts with no attempt recorded (a batch of total 0 never ends with a call) */
  function batchOpen() {
    if (!queue._batch) batchAttempts = new Map();
  }

  const store = {
    adapter,
    queue,
    get records() { return records.slice(); },
    get view() { return view; },
    get reusedMarks() { return reusedDone.length; },
    get bytes() { return queue.items.reduce((n, item) => n + costOf(item), 0); },
    get busy() { return queue.busy; },
    get failed() { return queue.items.filter((i) => i.status === 'error').length; },
    get size() { return queue.items.length; },

    configure(e = {}) {
      if (typeof e.toast === 'function') env.toast = e.toast;
      if ('optimize' in e) env.optimize = typeof e.optimize === 'function' ? e.optimize : null;
    },

    /** @returns {number} the view's session token */
    attach(v) {
      if (view && view !== v) {
        const old = view;
        view = null;
        call(old.detached);
      }
      view = v;
      sessions += 1;
      v.session = sessions;
      if (typeof v.t === 'function') lastT = v.t;
      return sessions;
    },

    detach(v) {
      if (view !== v) return;
      view = null;
      prune();
    },

    visible(v) {
      return records.filter((r) => Object.is(r.context, v.context));
    },

    takeReused(context) {
      const out = [];
      reusedDone = reusedDone.filter((m) => {
        if (!Object.is(m.context, context)) return true;
        out.push(m.asset);
        return false;
      });
      prune();
      return out;
    },

    accept(files, o) {
      const v = o.view;
      const list = [...(files || [])];
      if (!v || v !== view || !list.length) return { accepted: [], rejected: [], records: [] };
      cfg = { ...cfg, ...(o.cfg || {}) };
      const L = cfg.labels || {};
      const single = !!cfg.single;
      const policy = cfg.policy || null;
      const maxSize = typeof cfg.maxSize === 'number' && cfg.maxSize > 0 ? cfg.maxSize : null;
      // single (`multiple: false`): the unfinished files of THIS session are replaced, nobody else's (Codex plan r1 #1)
      const mine = single ? records.filter((r) => r.session === v.session) : [];
      const mineCost = mine.reduce((n, r) => n + costOf(r.item), 0);
      const others = queue.items.length - mine.length;
      let room = single ? Math.min(1, UPLOAD_LIMIT - others) : UPLOAD_LIMIT - queue.items.length;
      let bytes = store.bytes - mineCost;
      const toQueue = [];
      const over = [];
      for (const file of list) {
        // type / size rejections stay the queue's (same reasons and order as before)
        if (!file || typeof file !== 'object' || !acceptsFile(file, cfg.accept) || (!policy && maxSize && file.size > maxSize)) {
          toQueue.push(file);
          continue;
        }
        const cost = policy ? estimate(file, policy, maxSize) : 0;
        if (room <= 0 || bytes + cost > UPLOAD_BYTES) {
          over.push({ file, reason: 'count', message: format(L.rejectCount, { name: file.name, n: single ? 1 : UPLOAD_LIMIT }) });
          continue;
        }
        toQueue.push(file);
        room -= 1;
        bytes += cost;
      }
      batchOpen();
      const fresh = [];
      const res = queue.admit(toQueue, {
        admitted: (_accepted, _rejected, items) => {
          if (single && items.length) for (const r of mine) if (byItem.has(r.item)) queue.remove(r.item);
          for (const item of items) {
            const rec = {
              item, name: String(item.original.name ?? ''), kind: kindOf(item.original), context: o.context,
              session: v.session, attempt: v.session, reused: false, assetId: null, removed: false, hook: null,
            };
            rec.hook = call(o.makeHook, rec, { onError: (d) => routeError(rec, d), isClosed: () => rec.removed }) || null;
            byItem.set(item, rec);
            fresh.push(rec);
          }
          records = [...fresh, ...records];
          for (const r of fresh) batchAttempts.set(r.item, v.session);
          if (fresh.length) call(v.onAdd, fresh);
        },
      });
      return { accepted: res.accepted, rejected: [...res.rejected, ...over], records: fresh };
    },

    /** "Thử lại" of one card in the view's session */
    retry(rec, v) {
      if (!byItem.has(rec.item) || !v || v !== view) return false;
      const it = rec.item;
      if (it.status !== 'error' || !it.uploadFailed) return false;
      batchOpen();
      const prev = rec.attempt;
      rec.attempt = v.session;
      if (queue.retry(it)) {
        batchAttempts.set(it, v.session);
        return true;
      }
      rec.attempt = prev;
      return false;
    },

    /** × of a card: cancel / remove its file @returns {boolean} it was here */
    remove(rec) {
      return byItem.has(rec.item) ? queue.remove(rec.item) : false;
    },

    /** "Thử lại tất cả": every upload failure shown by the view, grid order @returns {number} */
    retryFailed(v) {
      if (!v || v !== view) return 0;
      let n = 0;
      for (const rec of store.visible(v)) {
        if (rec.item.status === 'error' && rec.item.uploadFailed && store.retry(rec, v)) n += 1;
      }
      return n;
    },

    /** "Gỡ tất cả lỗi": every failed file shown by the view (optimisation failures too) @returns {number} */
    removeFailed(v) {
      if (!v || v !== view) return 0;
      let n = 0;
      for (const rec of store.visible(v)) {
        if (rec.item.status === 'error' && queue.remove(rec.item)) n += 1;
      }
      return n;
    },

    /** abort everything of this store (two phases), drop the batch and the marks @returns {number} files cancelled */
    cancelAll() {
      const n = queue.items.length;
      for (const rec of records) rec.removed = true;
      queue.clear(); // waiting withdrawn, then running aborted; onRemoved per item; the batch is dropped (no call)
      batchAttempts = new Map();
      reusedDone = [];
      prune();
      return n;
    },
  };
  return store;
}
