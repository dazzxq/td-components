/**
 * @internal v0.93.0 — files dropped on an open td-media-picker, uploaded in place in its grid (plan
 * v0.93.0-media-picker-grid-drop, "Thiết kế"). Used only when the site registered no `uploadFields` (with fields the
 * picker opens the upload dialog with the files held instead). Not exported from the public entry.
 *
 *   const drop = createGridDrop({
 *     grid,            // the picker's <td-media-grid>
 *     t,               // (key, params?) => string — the picker's label resolver
 *     adapter, context, metaKeys,
 *     upload,          // resolved OpenMediaPickerOptions.upload { accept?, maxSize?, multiple?, imageResize? }
 *     collection,      // () => undefined (no collection session) | { id: string|null } — read when files are dropped
 *     slots,           // () => the picker-wide createUploadSlots(3) pool (shared with the upload dialog)
 *     listSeq,         // () => number — the picker's list request counter (s.listSeq)
 *     hasCard,         // (assetId) => boolean — a real card of that asset is in the grid now
 *     paintCard,       // (el, asset) => void — paint a done card like a regular one (the picker's _paintItem)
 *     onUploaded,      // (asset, deduplication) => void — the picker's _onUploaded (called AFTER the card is done)
 *     onError,         // ({ operation: 'upload', code, retryable }) => void — operation-error
 *     announce,        // (text) => void — the picker's live region
 *     toast,           // (type: 'success'|'warning', text) => void
 *     syncGrid,        // () => void — re-mirror the selection model into the grid (after a card left)
 *     onCardsChange,   // () => void — the set of placeholder cards changed (grid visibility)
 *     focusFallback,   // () => HTMLElement|null — focus target when the last card with focus left (results heading)
 *     isLive,          // () => boolean — the picker session is still open
 *   });
 *   drop.accept(files)            → { accepted, rejected } (cards first in the grid, uploads started / queued)
 *   drop.busy()                   → a file is queued / optimising / uploading / waiting for a slot
 *   drop.isPending(id)            → `id` is the data-id of a card of this module that is not done (still uploading /
 *                                   failed): the picker's grid handlers skip it (never by an id prefix — Codex impl r1 #1)
 *   drop.placeholders()           → the placeholder card elements in the grid (any state)
 *   drop.doneIds()                → asset ids of the `done` cards still shown (the picker's _syncGrid view)
 *   drop.afterRender(ids, seq)    → after the picker rebuilt a page: done cards whose asset is on the page, or done
 *                                   before the request `seq` started, leave; the rest go back to the start of the grid
 *   drop.abortAll() / destroy()   → abort everything (two phases, no batch toast), cards removed
 *
 * The per-file state is one `UploadQueue` configured like the upload dialog's dropzone (same accept / max-size / single
 * / image-resize policy / labels / slots); the adapter call is `createAdapterUpload` (no fields). Card DOM (DOM APIs,
 * file names only through textContent / setAttribute, no style attribute, no object URL — the preview is drawn on a
 * canvas from createImageBitmap(file)):
 *   <div data-td-media-item data-id="td-up-{token}-{n}" class="td-media-picker__card td-media-picker__card--upload"
 *        data-upload="queued|optimizing|uploading|done|error" [data-waiting] aria-busy="true|false">
 *     <button type="button" class="td-media-picker__open" data-td-media-open aria-disabled="true" aria-label="{name} — {status}">
 *       <span class="td-media-picker__thumb" aria-hidden="true"><canvas class="td-media-picker__upload-preview"> | icon</span>
 *       <span class="td-media-picker__info" aria-hidden="true"><span __name>{name}</span><span __meta>{status | size}</span></span>
 *     </button>
 *     (td-media-grid's tick)
 *     <td-progress class="td-media-picker__upload-progress" size="sm" label="Đang tải {name}" [value]>
 *     <span class="td-media-picker__upload-actions">[button.td-btn--ghost "Thử lại"] [button × "Huỷ tải {name}" | "Gỡ {name}"]</span>
 *   </div>
 * Done: `data-upload="done"`, `data-id` = the asset id, the opener loses aria-disabled and gets the regular card label,
 * the progress bar + actions are removed; the card then mirrors the selection model until a page render replaces it.
 */
import { UploadQueue, parseFileSize } from '../utils/upload-queue.js';
import { TdDropzone } from '../form/td-dropzone.js';
import { createAdapterUpload } from './media-picker-upload.js';
import { tdIcon } from '../icons/td-icon.js';
import './td-progress.js';

/**
 * id prefix of the placeholder cards. Only a readable hint: a card is "pending" by this module's records (isPending),
 * never by the prefix — an adapter may use ids like `td-up-1` (Codex impl r1 #1). A random token per page load + a
 * check against the ids on the page keep a placeholder id from matching a real card.
 */
const UPLOAD_ID_PREFIX = `td-up-${Math.random().toString(36).slice(2, 8)}-`;

const PREVIEW_MAX_BYTES = 64 * 1024 * 1024;
/** preview bitmap / canvas side (the tile is square) */
const PREVIEW_SIZE = 320;
const KIND_ICON = { image: 'image', video: 'video', file: 'file' };

let seq = 0;

/** @param {File} f */
const kindOf = (f) => {
  const type = String(f.type || '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  return 'file';
};

/**
 * Decode `file` into a PREVIEW_SIZE × PREVIEW_SIZE bitmap (Codex security SEC-04: the ONLY decode, both resize
 * dimensions bounded — no aspect probe, no full-size fallback). The aspect ratio is not kept: the square tile shows the
 * whole image squeezed for the few seconds of the upload, then the real thumbnail replaces it. An engine without the
 * resize options (TypeError) keeps the kind icon.
 * @param {File} file @returns {Promise<ImageBitmap>}
 */
function decodePreview(file) {
  return createImageBitmap(file, { resizeWidth: PREVIEW_SIZE, resizeHeight: PREVIEW_SIZE, resizeQuality: 'medium' });
}

/**
 * @param {object} o see the file header
 * @returns {{ accept(files: File[]): { accepted: File[], rejected: object[] }, busy(): boolean,
 *   isPending(id: string|null|undefined): boolean, placeholders(): HTMLElement[], doneIds(): string[], afterRender(ids: string[], seq: number): void,
 *   abortAll(): void, destroy(): void }}
 */
export function createGridDrop(o) {
  const t = (k, p) => {
    try { return String(o.t(k, p) ?? ''); } catch { return ''; }
  };
  const call = (fn, ...args) => {
    if (typeof fn !== 'function') return undefined;
    try { return fn(...args); } catch (err) { console.error(err); return undefined; }
  };
  const up = o.upload && typeof o.upload === 'object' ? o.upload : {};
  const L = () => TdDropzone.labels;
  let destroyed = false;
  const live = () => !destroyed && call(o.isLive) !== false;

  /** @type {Array<object>} card records, in grid order (newest drop first, file order inside a drop) */
  let recs = [];
  /** @type {Map<object, object>} queue item → card record */
  const byItem = new Map();
  /** @type {WeakMap<File, { id: string|null }|undefined>} collection in view when the original File was dropped */
  const collOf = new WeakMap();
  /** serial preview decoding (one file at a time: memory) */
  const previews = [];
  let previewing = false;

  // --- the adapter call (no fields; the collection captured at drop time) ---
  const hookFor = (coll) => createAdapterUpload({
    adapter: o.adapter,
    context: o.context,
    ...(coll ? { collectionId: coll.id } : {}),
    metaKeys: o.metaKeys,
    t,
    fieldsFor: () => ({}),
    onError: (d) => { if (live()) call(o.onError, d); },
    isClosed: () => !live(),
  });

  const queue = new UploadQueue({
    accept: up.accept || null,
    maxSize: parseFileSize(up.maxSize),
    // plan: like the dialog's dropzone — `multiple: false` keeps one file; a new drop replaces the earlier (running /
    // failed) one, the extra files of a drop are rejected ('count')
    single: up.multiple === false,
    policy: up.imageResize || null,
    get labels() { return TdDropzone.labels; },
    upload: (file, c) => hookFor(collOf.get(c.originalFile || file))(file, c),
    slots: () => (typeof o.slots === 'function' ? o.slots() : null),
    onChange: (item, kind) => onChange(item, kind),
    onRemoved: (item) => onRemoved(item),
    onBatchEnd: (r) => onBatchEnd(r),
  });

  // --- cards ---

  /** a placeholder id that is no card id on the page / of another record now (`taken`: extra ids to avoid) */
  function freshId(taken) {
    for (;;) {
      const id = `${UPLOAD_ID_PREFIX}${++seq}`;
      if (taken && taken.has(id)) continue;
      if (call(o.hasCard, id)) continue;
      if (recs.some((r) => r.el.getAttribute('data-id') === id)) continue;
      return id;
    }
  }

  function buildCard(item) {
    const file = item.original;
    const id = freshId();
    const el = document.createElement('div');
    el.setAttribute('data-td-media-item', '');
    el.setAttribute('data-td-media-pending', ''); // td-media-grid leaves it out of Shift ranges (Codex impl r2 #12)
    el.setAttribute('data-id', id);
    el.className = 'td-media-picker__card td-media-picker__card--upload';
    el.setAttribute('data-kind', kindOf(file));
    el.setAttribute('aria-busy', 'true');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'td-media-picker__open';
    open.setAttribute('data-td-media-open', '');
    open.setAttribute('aria-disabled', 'true');
    const thumb = document.createElement('span');
    thumb.className = 'td-media-picker__thumb';
    thumb.setAttribute('aria-hidden', 'true');
    const icon = document.createElement('span');
    icon.className = 'td-media-picker__thumb-icon';
    const svg = tdIcon(KIND_ICON[kindOf(file)] || 'file', { size: 'xl' });
    if (svg) icon.appendChild(svg);
    thumb.appendChild(icon);
    const info = document.createElement('span');
    info.className = 'td-media-picker__info';
    info.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'td-media-picker__name';
    name.textContent = file.name; // user-controlled: text only
    name.title = file.name;
    const meta = document.createElement('span');
    meta.className = 'td-media-picker__meta';
    info.append(name, meta);
    open.append(thumb, info);
    const bar = document.createElement('span');
    bar.className = 'td-media-picker__upload-actions';
    const progress = document.createElement('td-progress');
    progress.className = 'td-media-picker__upload-progress';
    progress.setAttribute('size', 'sm');
    progress.setAttribute('label', t('uploadProgressLabel', { name: file.name }));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'td-btn td-btn--ghost td-btn--sm td-media-picker__upload-remove';
    const x = tdIcon('close', { size: 's' });
    if (x) remove.appendChild(x);
    bar.append(remove);
    el.append(open, progress, bar);
    const rec = { item, el, open, thumb, icon, name, meta, bar, progress, remove, retry: null, canvas: null,
      state: '', label: '', assetId: null, assetName: '', doneSeq: -1 };
    remove.addEventListener('click', () => {
      if (!live()) return;
      removeByUser(rec);
    });
    return rec;
  }

  /** the status text of a running / failed item (the dropzone's labels: same words as the dialog) */
  function statusText(item) {
    const l = L();
    if (item.status === 'error') return item.error || String(l.uploadError ?? '');
    if (item.status === 'queued') return String(l.queued ?? '');
    if (item.status === 'optimizing') return String(l.optimizing ?? '');
    // like the dialog's dropzone: no progress reported yet (waiting for a slot / the first onProgress) = "Đang chờ…"
    if (item.status === 'uploading') return String((item.progress == null ? l.uploadWaiting : l.uploading) ?? '');
    return String(l.uploadWaiting ?? ''); // selected: about to start
  }

  function paint(rec) {
    const { item, el } = rec;
    if (rec.state === 'done') return;
    const state = item.status === 'selected' ? 'queued' : item.status;
    el.setAttribute('data-upload', state);
    el.toggleAttribute('data-waiting', item.status === 'uploading' && item.progress == null);
    const error = item.status === 'error';
    el.setAttribute('aria-busy', error ? 'false' : 'true');
    const text = statusText(item);
    if (rec.meta.textContent !== text) rec.meta.textContent = text;
    const label = `${item.original.name} — ${text}`;
    if (rec.label !== label) { // on state changes only, never per percent
      rec.label = label;
      rec.open.setAttribute('aria-label', label);
    }
    const p = rec.progress;
    p.hidden = error;
    if (item.progress == null) p.removeAttribute('value');
    else p.setAttribute('value', String(Math.round(item.progress)));
    p.setAttribute('variant', error ? 'danger' : 'primary');
    // the × cancels a running file, removes a failed one
    const rm = t(error ? 'dropRemove' : 'dropCancel', { name: item.original.name });
    if (rec.remove.getAttribute('aria-label') !== rm) rec.remove.setAttribute('aria-label', rm);
    const canRetry = error && !!item.uploadFailed;
    if (canRetry && !rec.retry) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'td-btn td-btn--ghost td-btn--sm td-media-picker__upload-retry';
      b.textContent = t('dropRetry');
      b.setAttribute('aria-label', t('dropRetryLabel', { name: item.original.name }));
      b.addEventListener('click', () => {
        if (!live() || rec.state === 'done') return;
        const had = rec.el.contains(document.activeElement);
        if (queue.retry(rec.item) && had) focus(rec.remove);
      });
      rec.bar.insertBefore(b, rec.remove);
      rec.retry = b;
    } else if (!canRetry && rec.retry) {
      const had = rec.retry === document.activeElement;
      rec.retry.remove();
      rec.retry = null;
      if (had) focus(rec.remove);
    }
    rec.state = state;
  }

  function onChange(item, kind) {
    const rec = byItem.get(item);
    if (!rec || destroyed) return;
    if (kind === 'done') {
      finishCard(rec);
      return;
    }
    paint(rec);
    if (kind === 'error' || kind === 'failed') {
      const name = item.original.name;
      const msg = item.error || String(L().uploadError ?? '');
      call(o.announce, `${t('dropFailed', { name })}. ${msg}`);
    }
  }

  /** plan "Thứ tự khi xong": the card is done (data-id = asset) BEFORE the picker's _onUploaded runs */
  function finishCard(rec) {
    const res = rec.item.result;
    const asset = res && res.asset;
    if (!asset) return;
    const el = rec.el;
    // another upload's placeholder may carry this asset id: re-key it first (Codex impl r2 #10)
    for (const r of recs) {
      if (r !== rec && r.state !== 'done' && r.el.getAttribute('data-id') === asset.id) {
        r.el.setAttribute('data-id', freshId(new Set([asset.id])));
      }
    }
    rec.state = 'done';
    rec.assetId = asset.id;
    rec.assetName = typeof asset.name === 'string' && asset.name ? asset.name : rec.item.original.name;
    rec.doneSeq = Number(call(o.listSeq)) || 0;
    // two drops deduplicated to the same asset: one done card per asset — this one leaves (Codex impl r1 #4)
    const twin = recs.find((r) => r !== rec && r.state === 'done' && r.assetId === asset.id);
    if (twin) {
      const hadFocus = el.contains(document.activeElement);
      dropCard(rec);
      if (hadFocus) focus(twin.open);
      call(o.onUploaded, asset, res.deduplication);
      return;
    }
    el.setAttribute('data-upload', 'done');
    el.removeAttribute('data-td-media-pending');
    el.removeAttribute('data-waiting');
    el.setAttribute('data-id', asset.id);
    el.setAttribute('aria-busy', 'false');
    // the regular card look + label (thumbnail of the asset, name, meta): the picker's _paintItem
    call(o.paintCard, el, asset);
    if (rec.canvas) {
      rec.canvas.width = 0;
      rec.canvas.height = 0;
      rec.canvas = null;
    }
    rec.open.removeAttribute('aria-disabled');
    const label = rec.open.getAttribute('aria-label') || asset.name || asset.id;
    const Grid = customElements.get('td-media-grid');
    const tick = el.querySelector('.td-media-grid__tick');
    if (tick && Grid && Grid.labels) tick.setAttribute('aria-label', String(Grid.labels.select ?? '').replace('{name}', label));
    const hadFocus = rec.bar.contains(document.activeElement);
    rec.progress.remove();
    rec.bar.remove();
    if (hadFocus) focus(rec.open);
    // exact-reused while the real card of the asset is on the page: one element per asset, never two
    if (call(o.hasCard, asset.id)) dropCard(rec, { focusNext: true });
    call(o.onUploaded, asset, res.deduplication);
  }

  function onRemoved(item) {
    const rec = byItem.get(item);
    if (!rec) return;
    byItem.delete(item);
    if (rec.state === 'done') return; // the card outlives its queue item (a page render removes it)
    dropCard(rec, { focusNext: true });
  }

  function onBatchEnd(r) {
    // done items leave the queue once their batch is counted (their cards stay until a page render replaces them)
    for (const item of [...queue.items]) if (item.status === 'done') queue.remove(item);
    if (!live() || !r || !r.ok) return;
    call(o.toast, 'success', t('uploadDone', { ok: r.ok, total: r.total }));
  }

  /** × of a card: cancel (running) / remove (failed); the focus moves to the next card */
  function removeByUser(rec) {
    if (rec.state === 'done') return;
    if (!queue.remove(rec.item)) dropCard(rec, { focusNext: true });
  }

  /** take a card out of the grid (silently out of the grid selection first: never a user-visible deselect) */
  function dropCard(rec, { focusNext = false, sync = true } = {}) {
    const i = recs.indexOf(rec);
    if (i < 0) return;
    recs.splice(i, 1);
    const el = rec.el;
    const grid = o.grid;
    let next = null;
    if (focusNext && el.contains(document.activeElement)) {
      const items = [...grid.querySelectorAll('[data-td-media-item]')];
      const k = items.indexOf(el);
      const other = items[k + 1] || items[k - 1] || null;
      next = other ? other.querySelector('[data-td-media-open]') : null;
      if (!next) next = call(o.focusFallback) || null;
    }
    const id = el.getAttribute('data-id');
    // a selected item leaving the grid makes td-media-grid emit a user `select-change` → out of its selection silently
    // first, unless a card of the asset stays (the real one on the page or another done card: same data-id)
    if (rec.state === 'done' && id && !call(o.hasCard, id) && !recs.some((r) => r.state === 'done' && r.assetId === id)
      && typeof grid.deselect === 'function') grid.deselect([id]);
    el.remove();
    if (rec.canvas) {
      rec.canvas.width = 0;
      rec.canvas.height = 0;
      rec.canvas = null;
    }
    if (next) focus(next);
    if (sync && rec.state === 'done') call(o.syncGrid);
    call(o.onCardsChange);
  }

  function focus(el) {
    if (!el || typeof el.focus !== 'function') return;
    try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
  }

  // --- preview: canvas from createImageBitmap (no blob: URL, no img-src), one file at a time ---

  function wantsPreview(file) {
    const type = String(file.type || '').toLowerCase();
    return type.startsWith('image/') && type !== 'image/svg+xml' && file.size > 0 && file.size <= PREVIEW_MAX_BYTES
      && typeof createImageBitmap === 'function';
  }

  function pumpPreviews() {
    if (previewing || destroyed) return;
    const rec = previews.shift();
    if (!rec) return;
    if (!rec.el.isConnected && !recs.includes(rec)) {
      pumpPreviews();
      return;
    }
    previewing = true;
    Promise.resolve().then(() => decodePreview(rec.item.original)).then((bmp) => { // a sync throw rejects too
      try {
        if (destroyed || !recs.includes(rec)) return;
        const w = PREVIEW_SIZE; // never the bitmap's own size (bounded by construction)
        const h = PREVIEW_SIZE;
        const canvas = document.createElement('canvas');
        canvas.className = 'td-media-picker__upload-preview';
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(bmp, 0, 0, w, h);
        rec.canvas = canvas;
        rec.icon.replaceWith(canvas);
      } finally {
        try { bmp.close(); } catch { /* ignore */ }
      }
    }, () => { /* not decodable: the kind icon stays */ }).finally(() => {
      previewing = false;
      pumpPreviews();
    });
  }

  // --- API ---

  function accept(files) {
    const list = [...(files || [])];
    if (destroyed || !list.length) return { accepted: [], rejected: [] };
    const coll = call(o.collection);
    for (const f of list) if (f && typeof f === 'object') collOf.set(f, coll ? { id: coll.id ?? null } : undefined);
    const fresh = [];
    const res = queue.admit(list, {
      // the cards exist before the first upload hook runs (no policy: synchronously after this)
      admitted: (_accepted, _rejected, items) => {
        for (const item of items) {
          const rec = buildCard(item);
          byItem.set(item, rec);
          fresh.push(rec);
        }
        recs = [...fresh, ...recs];
        const grid = o.grid;
        const els = fresh.map((r) => r.el);
        if (els.length) grid.prepend(...els);
        for (const rec of fresh) paint(rec);
        for (const rec of fresh) if (wantsPreview(rec.item.original)) previews.push(rec);
        if (fresh.length) call(o.onCardsChange);
      },
    });
    pumpPreviews();
    const parts = [];
    if (res.accepted.length) parts.push(t('dropStarted', { n: res.accepted.length }));
    for (const r of res.rejected) parts.push(r.message);
    if (res.rejected.length) call(o.toast, 'warning', t('dropRejected', { n: res.rejected.length }));
    if (parts.length) call(o.announce, parts.join('. '));
    return { accepted: res.accepted, rejected: res.rejected };
  }

  function afterRender(ids, renderSeq) {
    if (destroyed) return;
    const onPage = new Set(ids || []);
    const hidden = [];
    for (const rec of [...recs]) {
      if (rec.state !== 'done') {
        // the new page has a real card with this placeholder's id: re-key the placeholder (never two equal data-ids)
        if (onPage.has(rec.el.getAttribute('data-id'))) rec.el.setAttribute('data-id', freshId(onPage));
        continue;
      }
      if (onPage.has(rec.assetId)) dropCard(rec, { sync: false });
      else if (renderSeq > rec.doneSeq) {
        hidden.push(rec);
        dropCard(rec, { sync: false });
      }
    }
    const els = recs.map((r) => r.el);
    if (els.length) o.grid.prepend(...els); // back at the start of the grid, in order
    for (const rec of hidden) call(o.announce, t('uploadedHidden', { name: rec.assetName || rec.item.original.name }));
  }

  function abortAll() {
    previews.length = 0;
    queue.clear(); // two phases (waiting withdrawn, then running aborted); no batch toast
    for (const rec of [...recs]) dropCard(rec, { sync: false });
    byItem.clear();
  }

  return {
    accept,
    busy: () => !destroyed && queue.busy,
    isPending: (id) => !destroyed && id != null && recs.some((r) => r.state !== 'done' && r.el.getAttribute('data-id') === id),
    placeholders: () => recs.map((r) => r.el),
    doneIds: () => recs.filter((r) => r.state === 'done').map((r) => r.assetId),
    afterRender,
    abortAll,
    destroy() {
      if (destroyed) return;
      abortAll();
      destroyed = true;
    },
  };
}
