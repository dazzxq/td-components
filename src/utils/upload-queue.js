/**
 * @internal v0.93.0 — DOM-free upload state machine (plan v0.93.0-media-picker-grid-drop, "Seam").
 *
 * The admission / optimisation / upload logic that lived in `td-dropzone` (v0.18 – v0.92), moved verbatim so the
 * picker's grid drop can reuse it: `td-dropzone` keeps its DOM, form value, announcements and events and delegates the
 * per-file state to one `UploadQueue`. Not exported from the public entry.
 *
 *   const q = new UploadQueue({
 *     accept, maxSize, limit, single, policy, upload, labels,   // read on every use (plain values or getters)
 *     slots,          // createUploadSlots() pool, or () => pool | null; null / absent → unlimited, hooks called
 *                     //   synchronously at admission (the v0.92 behaviour)
 *     onChange(item, kind),        // item state changed (kind: 'optimizing' | 'uploading' | 'started' | 'progress' |
 *                                  //   'done' | 'error' | 'selected' | 'failed')
 *     onValue(),                   // the set of ready / blocked items changed after an optimisation (form value + validity)
 *     onOptimized(item),           // an optimisation made the file smaller (announce "30 MB → 4 MB")
 *     onOptimizeError(original),   // an item failed optimisation (after onChange / onValue)
 *     onRemoved(item),             // an item left the queue (remove / clear / single-file replace)
 *     onBatchEnd({ ok, fail, total }), // once per batch (microtask), see "batch" below
 *     optimize,                    // tests only: replaces optimizeImage (same signature)
 *   });
 *
 * Item: `{ id, file, original, status: 'selected'|'queued'|'optimizing'|'uploading'|'done'|'error', progress, error,
 * waiting, blocked, uploadFailed, optimization, result, ready, policy, maxSize, controller, release }`. `waiting` = the
 * item waits for an upload slot (status `uploading`, progress null, hook not called yet).
 *
 * Batch: admission of ≥ 1 item with no open batch opens one; more items admitted meanwhile join it. Outcomes are kept
 * per item: hook resolve → ok, hook reject / optimisation failure → fail; removed / replaced / cleared items and items
 * that end `selected` (no hook) are not counted; a hook rejection named `AbortError` (an adapter that aborted on its own)
 * shows an error row but is not counted (as the v0.92 dialog). Retry of an item in the open batch replaces its outcome;
 * otherwise it joins (or opens) the current batch. The batch closes when no member is pending → `onBatchEnd` once,
 * through queueMicrotask; nothing when total is 0; `clear()` drops the batch without a call.
 */
import { formatFileSize } from './dom-utils.js';
import { optimizeImage, normalizeImageResizePolicy } from './image-resize.js';

/** `{name}` placeholders from `vars`; unknown ones are kept as written. */
const format = (tpl, vars = {}) => String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

const UNITS = { b: 1, k: 1024, kb: 1024, m: 1024 ** 2, mb: 1024 ** 2, g: 1024 ** 3, gb: 1024 ** 3 };

/**
 * Parse a size limit: plain bytes (`5242880`) or a number + unit (`500KB`, `5MB`, `1.5 GB`; 1 KB = 1024 bytes,
 * case-insensitive). @param {string|null} str @returns {number|null} bytes, null = no limit / invalid
 */
export function parseFileSize(str) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(b|kb?|mb?|gb?)?\s*$/i.exec(String(str ?? ''));
  if (!m) return null;
  const n = Number(m[1]) * UNITS[(m[2] || 'b').toLowerCase()];
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

const ERROR_MAX = 200;

/**
 * The text shown for a rejected upload: `err.message` when it is a non-empty string (capped at ERROR_MAX characters,
 * rendered as text by the caller), else '' (→ the generic label). Anything else (objects, numbers…) is never shown.
 * @param {*} err @returns {string}
 */
export function uploadErrorMessage(err) {
  let msg = '';
  try {
    // Bound the work before trimming / splitting: a huge server body must not be scanned or copied whole.
    msg = err != null && typeof err.message === 'string' ? err.message.slice(0, ERROR_MAX * 8).trim() : '';
  } catch {
    msg = ''; // a throwing getter must not break the error state
  }
  let out = '';
  let n = 0;
  for (const ch of msg) { // code points, stops after ERROR_MAX + 1
    if (++n > ERROR_MAX) return `${[...out].slice(0, ERROR_MAX - 1).join('')}…`;
    out += ch;
  }
  return out;
}

/**
 * `accept` check (as the native attribute): comma list of MIME `type/sub`, `type/*`, `.ext`; empty → everything.
 * @param {{ name?: string, type?: string }} file @param {string|null|undefined} accept @returns {boolean}
 */
export function acceptsFile(file, accept) {
  const tokens = String(accept || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (!tokens.length) return true;
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  return tokens.some((t) => {
    if (t.startsWith('.')) return name.endsWith(t);
    if (t.endsWith('/*')) return !!type && type.startsWith(t.slice(0, -1));
    return type === t;
  });
}

/**
 * @internal A FIFO pool of `n` upload slots (plan "Giới hạn 3 song song"). `acquire(signal, start)`: a free slot →
 * `start(release)` runs synchronously; else the request waits in call order. `release()` is idempotent. An abort of
 * `signal` while waiting withdraws the request (`start` never runs). `close()`: every waiting request is withdrawn,
 * later releases only free the slot (nobody starts) and later acquisitions never run.
 * @param {number} n
 * @returns {{ acquire(signal: AbortSignal|null, start: (release: () => void) => void): boolean, close(): void,
 *   readonly active: number, readonly waiting: number, readonly closed: boolean }}
 */
export function createUploadSlots(n) {
  const max = Math.max(1, Math.floor(Number(n)) || 1);
  let active = 0;
  let closed = false;
  /** @type {Array<{ signal: AbortSignal|null, start: Function, onAbort: (() => void)|null }>} */
  const queue = [];
  const detach = (e) => {
    if (e.signal && e.onAbort) e.signal.removeEventListener('abort', e.onAbort);
    e.onAbort = null;
  };
  const run = (e) => {
    active += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      active -= 1;
      pump();
    };
    try {
      e.start(release);
    } catch (err) {
      release();
      console.error(err);
    }
  };
  function pump() {
    while (!closed && active < max && queue.length) {
      const e = queue.shift();
      detach(e);
      if (e.signal && e.signal.aborted) continue;
      run(e);
    }
  }
  return {
    acquire(signal, start) {
      if (closed || (signal && signal.aborted) || typeof start !== 'function') return false;
      const e = { signal: signal || null, start, onAbort: null };
      if (active < max && !queue.length) {
        run(e);
        return true;
      }
      if (e.signal) {
        e.onAbort = () => {
          const i = queue.indexOf(e);
          if (i >= 0) queue.splice(i, 1);
          detach(e);
        };
        e.signal.addEventListener('abort', e.onAbort, { once: true });
      }
      queue.push(e);
      return true;
    },
    close() {
      closed = true;
      for (const e of queue.splice(0)) detach(e);
    },
    get active() { return active; },
    get waiting() { return queue.length; },
    get closed() { return closed; },
  };
}

/** @internal see the file header */
export class UploadQueue {
  /** @param {object} [o] options (see the file header); getters are read on every use */
  constructor(o = {}) {
    /** @private */
    this._o = o;
    /** @type {object[]} the items, in admission order */
    this.items = [];
    /** @private */
    this._seq = 0;
    /** @private @type {Map<object, 'pending'|'ok'|'fail'>|null} */
    this._batch = null;
    /** @private */
    this._batchQueued = false;
    /** @private two-phase cancel running */
    this._closing = false;
  }

  /** @type {boolean} an item is queued / optimising / uploading (or waiting for a slot) */
  get busy() {
    return this.items.some((i) => i.status === 'uploading' || i.status === 'queued' || i.status === 'optimizing');
  }

  /**
   * Filter + add. Single → the first acceptable file replaces every current item. With a policy `maxSize` is not
   * checked here (the optimisation does it). Order: items pushed → `hooks.admitted` → no policy: uploads started (hooks
   * called synchronously when a slot is free) → `hooks.added` → policy: optimisations queued.
   * @param {Iterable<File>} files
   * @param {{ admitted?: (accepted: File[], rejected: object[], items: object[]) => void,
   *   added?: ((accepted: File[], rejected: object[]) => void)|null }} [hooks]
   * @returns {{ accepted: File[], rejected: { file: File, reason: 'type'|'size'|'count', message: string }[], items: object[] }}
   */
  admit(files, hooks = {}) {
    const o = this._o;
    const L = o.labels || {};
    const policy = o.policy || null;
    const maxSize = typeof o.maxSize === 'number' && o.maxSize > 0 ? o.maxSize : null;
    const single = !!o.single;
    const limit = single ? 1 : (typeof o.limit === 'number' && o.limit > 0 ? o.limit : Infinity);
    let room = single ? 1 : limit - this.items.length;
    const accepted = [];
    const rejected = [];
    for (const file of files || []) {
      let reason = '';
      let message = '';
      if (!acceptsFile(file, o.accept)) {
        reason = 'type';
        message = format(L.rejectType, { name: file.name });
      } else if (!policy && maxSize && file.size > maxSize) {
        reason = 'size';
        message = format(L.rejectSize, { name: file.name, max: formatFileSize(maxSize) });
      } else if (room <= 0) {
        reason = 'count';
        message = format(L.rejectCount, { name: file.name, n: limit });
      }
      if (reason) {
        rejected.push({ file, reason, message });
        continue;
      }
      accepted.push(file);
      room--;
    }
    if (single && accepted.length && this.items.length) {
      const old = this.items;
      this.items = [];
      this._cancel(old);
      for (const item of old) this._batchDelete(item);
    }
    const added = accepted.map((file) => ({
      id: ++this._seq, file, original: file, status: policy ? 'queued' : 'selected', progress: null, error: '',
      controller: null, release: null, waiting: false, policy, maxSize, ready: !policy, blocked: false,
      uploadFailed: false, optimization: null, result: undefined,
    }));
    this.items.push(...added);
    for (const item of added) this._batchAdd(item);
    if (hooks.admitted) hooks.admitted(accepted, rejected, added);
    if (!policy) for (const item of added) this._startUpload(item);
    if (hooks.added) hooks.added(accepted, rejected);
    if (policy) for (const item of added) this._optimize(item);
    return { accepted, rejected, items: added };
  }

  /** Remove one item (aborts its optimisation / upload, frees its slot at once). @returns {boolean} it was here */
  remove(item) {
    const i = this.items.indexOf(item);
    if (i < 0) return false;
    this.items.splice(i, 1);
    this._cancel([item]);
    this._batchDelete(item);
    return true;
  }

  /**
   * "Thử lại" of an upload error: the same (optimised) file goes to the hook again — no new optimisation; the item
   * asks for a slot again. @returns {boolean} started
   */
  retry(item) {
    if (!this.items.includes(item) || item.status !== 'error' || !item.uploadFailed || !this._o.upload) return false;
    this._batchAdd(item);
    this._startUpload(item);
    return true;
  }

  /**
   * Remove every item, two phases (plan r2 #6): (1) items waiting for a slot are withdrawn from the pool, (2) running
   * optimisations / uploads are aborted and their slots freed — a freed slot can never start one of this queue's items.
   * The open batch is dropped (no `onBatchEnd`).
   */
  clear() {
    const old = this.items;
    this.items = [];
    this._batch = null;
    this._cancel(old);
  }

  // --- private ---

  /** @private */
  _emit(name, ...args) {
    const fn = this._o[name];
    if (typeof fn !== 'function') return;
    try {
      fn(...args);
    } catch (err) {
      console.error(err);
    }
  }

  /** @private the slot pool now (null = unlimited) */
  _slots() {
    const s = this._o.slots;
    const pool = typeof s === 'function' ? s() : s;
    return pool && typeof pool.acquire === 'function' ? pool : null;
  }

  /** @private two-phase abort of items already out of `items` */
  _cancel(items) {
    this._closing = true;
    try {
      for (const item of items) if (item.waiting) this._abort(item); // phase 1: withdraw from the pool
      for (const item of items) {
        this._abort(item); // phase 2: abort + free the slot
        this._emit('onRemoved', item);
      }
    } finally {
      this._closing = false;
    }
  }

  /** @private abort the item's signal, free its slot */
  _abort(item) {
    item.waiting = false;
    if (item.controller) {
      item.controller.abort();
      item.controller = null;
    }
    if (item.release) {
      const release = item.release;
      item.release = null;
      release();
    }
  }

  /** @private */
  _batchAdd(item) {
    if (!this._batch) this._batch = new Map();
    this._batch.set(item, 'pending');
  }

  /** @private */
  _batchSet(item, outcome) {
    if (this._batch && this._batch.has(item)) this._batch.set(item, outcome);
    this._batchCheck();
  }

  /** @private */
  _batchDelete(item) {
    if (this._batch) this._batch.delete(item);
    this._batchCheck();
  }

  /** @private the batch closes when no member is pending (checked once per microtask) */
  _batchCheck() {
    if (this._batchQueued) return;
    this._batchQueued = true;
    queueMicrotask(() => {
      this._batchQueued = false;
      const b = this._batch;
      if (!b) return;
      for (const v of b.values()) if (v === 'pending') return;
      this._batch = null;
      const all = [...b.values()];
      const total = all.length;
      if (!total) return;
      const ok = all.filter((v) => v === 'ok').length;
      this._emit('onBatchEnd', { ok, fail: total - ok, total });
    });
  }

  /** @private the grouped text of an optimisation error code */
  _optimizeErrorText(code) {
    const L = this._o.labels || {};
    const table = L.optimizeError || {};
    const own = (k) => Object.prototype.hasOwnProperty.call(table, k);
    return String((own(code) ? table[code] : table.default) ?? '') || String(L.uploadError ?? '');
  }

  /**
   * @private Optimise one queued item (module-global FIFO of optimizeImage), then upload it (hook) or mark it ready.
   * `maxSize` caps the OUTPUT of images (merged into `maxBytes` when smaller) and the original of non-images.
   */
  _optimize(item) {
    if (!this.items.includes(item)) return; // removed by an `added` listener
    const L = this._o.labels || {};
    const controller = new AbortController();
    item.controller = controller;
    const { signal } = controller;
    const live = () => !signal.aborted && this.items.includes(item);
    const optimize = typeof this._o.optimize === 'function' ? this._o.optimize : optimizeImage;
    let capByMaxSize = false; // maxSize set the effective byte cap
    let job;
    try {
      let policy = item.policy;
      if (item.maxSize && (policy.maxBytes === null || policy.maxBytes > item.maxSize)) {
        policy = normalizeImageResizePolicy({ ...policy, maxBytes: item.maxSize });
        capByMaxSize = true;
      }
      job = optimize(item.original, policy, {
        signal,
        onStart: () => {
          if (!live()) return;
          item.status = 'optimizing';
          this._emit('onChange', item, 'optimizing');
        },
      });
    } catch (err) {
      job = Promise.reject(err);
    }
    Promise.resolve(job).then((r) => {
      if (!live()) return;
      item.controller = null;
      if (r.kind === 'not-image') {
        if (item.maxSize && item.original.size > item.maxSize) {
          this._failItem(item, format(L.rejectSize, { name: item.original.name, max: formatFileSize(item.maxSize) }));
          return;
        }
      } else if (item.maxSize && r.file.size > item.maxSize) {
        this._failItem(item, this._optimizeErrorText('cannot-satisfy-limits'));
        return;
      }
      item.file = r.file;
      item.optimization = r.optimization || null;
      item.ready = true;
      const opt = item.optimization;
      if (opt && opt.changed && opt.output.size < opt.original.size) this._emit('onOptimized', item);
      if (this._o.upload) this._startUpload(item);
      else {
        item.status = 'selected';
        this._emit('onChange', item, 'selected');
        this._batchDelete(item); // nothing to upload: not counted
      }
      this._emit('onValue');
    }, (err) => {
      if (!live()) return; // removed / reset / single-file replace: no error state
      item.controller = null;
      let code = err && typeof err.code === 'string' ? err.code : '';
      // an image the kit cannot re-encode (GIF / WebP / SVG / special content) over maxSize: its output is over the
      // cap — reported as such, not as a format problem
      if (capByMaxSize && item.original.size > item.maxSize
        && (code === 'format-not-transformable' || code === 'special-content-transform-required')) {
        code = 'cannot-satisfy-limits';
      }
      this._failItem(item, this._optimizeErrorText(code));
    });
  }

  /** @private an item that could not be processed: error state, never submitted, counted as a failed file */
  _failItem(item, message) {
    item.status = 'error';
    item.blocked = true;
    item.ready = false;
    item.progress = null;
    item.error = message;
    this._emit('onChange', item, 'failed');
    this._emit('onValue');
    this._emit('onOptimizeError', item.original);
    this._batchSet(item, 'fail');
  }

  /** @private Run the upload hook for an item (after a slot when a pool is set). */
  _startUpload(item) {
    const hook = this._o.upload;
    if (!hook || this._closing) {
      if (!hook) this._batchDelete(item); // no hook: the item stays `selected`, not counted
      return;
    }
    const controller = new AbortController();
    item.controller = controller;
    item.status = 'uploading';
    item.progress = null; // waiting until the first onProgress
    item.error = '';
    item.uploadFailed = false;
    const pool = this._slots();
    item.waiting = !!pool;
    this._emit('onChange', item, 'uploading');
    const live = () => !controller.signal.aborted && this.items.includes(item);
    const run = (release) => {
      if (!live()) {
        release();
        return;
      }
      item.release = release;
      const wasWaiting = item.waiting;
      item.waiting = false;
      const onProgress = (loaded, total) => {
        if (!live()) return;
        let pct = total != null ? (Number(total) > 0 ? (Number(loaded) / Number(total)) * 100 : NaN) : Number(loaded);
        if (!Number.isFinite(pct)) return;
        pct = Math.min(100, Math.max(0, pct));
        item.progress = pct;
        this._emit('onChange', item, 'progress');
      };
      // v0.90.0: with a policy the hook also gets the optimisation summary and the File the user added
      const ctx = item.policy
        ? { onProgress, signal: controller.signal, optimization: item.optimization, originalFile: item.original }
        : { onProgress, signal: controller.signal };
      let out;
      try {
        out = hook(item.file, ctx);
      } catch (err) {
        out = Promise.reject(err);
      }
      if (wasWaiting && live()) this._emit('onChange', item, 'started'); // left the slot queue
      const free = () => {
        if (item.release === release) item.release = null;
        release();
      };
      Promise.resolve(out).then(
        (result) => {
          if (!live()) return;
          item.controller = null;
          item.status = 'done';
          item.progress = 100;
          item.result = result;
          this._emit('onChange', item, 'done');
          this._batchSet(item, 'ok');
          free();
        },
        (err) => {
          if (!live()) return; // aborted by remove / reset: no error state
          item.controller = null;
          item.status = 'error';
          item.uploadFailed = true;
          item.error = uploadErrorMessage(err);
          this._emit('onChange', item, 'error');
          let aborted = false;
          try { aborted = !!err && err.name === 'AbortError'; } catch { aborted = false; }
          if (aborted) this._batchDelete(item);
          else this._batchSet(item, 'fail');
          free();
        },
      );
    };
    if (pool) pool.acquire(controller.signal, run);
    else run(() => {});
  }
}
