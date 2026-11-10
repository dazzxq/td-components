/**
 * @internal v0.93.0 — files dropped on an open td-media-picker, uploaded in place in its grid (plan
 * v0.93.0-media-picker-grid-drop, "Thiết kế"). Used only when the site registered no `uploadFields` (with fields the
 * picker opens the upload dialog with the files held instead). Not exported from the public entry.
 * v0.95.0 (plan v0.95.0-media-picker-bulk): this module is the VIEW of a background upload store
 * (media-picker-uploads.js, one per adapter object): the files, their queue and the slot pool live outside the picker
 * session — `destroy()` detaches the view (cards out of the DOM, uploads go on), a later picker with the same adapter
 * and `context` rebuilds the cards on `attach()`. + the failure strip (≥ 2 failed cards: "Thử lại tất cả" / "Gỡ tất cả
 * lỗi"), the "Đã có trong thư viện" mark (exact-reused) and the pinned card of a reused asset not on the page.
 *
 *   const drop = createGridDrop({
 *     grid,            // the picker's <td-media-grid>
 *     t,               // (key, params?) => string — the picker's label resolver
 *     tStatic,         // (key, params?) => string — same labels, bound to this open's `messages` only (kept by the
 *                      //   store for upload hooks / toasts after the picker closed; never holds the session)
 *     adapter, context, metaKeys,
 *     upload,          // resolved OpenMediaPickerOptions.upload { accept?, maxSize?, multiple?, imageResize? }
 *     collection,      // () => undefined (no collection session) | { id: string|null } — read when files are dropped
 *     listSeq,         // () => number — the picker's list request counter (s.listSeq)
 *     hasCard,         // (assetId) => boolean — a real card of that asset is in the grid now
 *     paintCard,       // (el, asset) => void — paint a done card like a regular one (the picker's _paintItem)
 *     onUploaded,      // (asset, deduplication) => void — a file dropped in THIS open finished (select, asset-change…)
 *     onUploadedQuiet, // (asset, deduplication) => void — a file of an earlier open finished: cache + reload only
 *     markReused,      // (assetId) => void — the asset is "Đã có trong thư viện" for this open (before any paint)
 *     cacheAsset,      // (asset) => void — a reused asset finished while closed (pinned card on attach)
 *     onError,         // ({ operation: 'upload', code, retryable }) => void — operation-error
 *     announce,        // (text) => void — the picker's live region
 *     toast,           // (type: 'success'|'warning', text) => void
 *     syncGrid,        // () => void — re-mirror the selection model into the grid (after a card left)
 *     onCardsChange,   // () => void — the set of placeholder cards changed (grid visibility)
 *     focusFallback,   // () => HTMLElement|null — focus target when the last card with focus left (results heading)
 *     isLive,          // () => boolean — the picker session is still open
 *   });
 *   drop.attach()                 → join the store: cards of its running / failed files (this context) + pinned reused
 *   drop.accept(files)            → { accepted, rejected } (cards first in the grid, uploads started / queued)
 *   drop.busy()                   → a file shown here is queued / optimising / uploading / waiting for a slot
 *   drop.isPending(id)            → `id` is the data-id of a card of this module that is not done (still uploading /
 *                                   failed): the picker's grid handlers skip it (never by an id prefix — Codex impl r1 #1)
 *   drop.placeholders()           → the placeholder card elements in the grid (any state)
 *   drop.doneIds()                → asset ids of the `done` cards still shown (the picker's _syncGrid view)
 *   drop.afterRender(ids, seq, source) → after the picker rebuilt a page: done cards whose asset is on the page leave;
 *                                   a reused (pinned) card stays through a render of `source` 'upload' / 'open' and
 *                                   leaves on a user navigation; any other done card leaves once a request started
 *                                   after it finished renders; the rest go back to the start of the grid
 *   drop.destroy()                → detach: cards, canvases and the strip removed, uploads NOT aborted
 *
 * Card DOM (DOM APIs, file names only through textContent / setAttribute, no style attribute, no object URL — the
 * preview is drawn on a canvas from createImageBitmap(file)):
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
 * Failure strip (created on the first need, right before the grid; shown while ≥ 2 cards failed, owner Q2):
 *   <div class="td-media-picker__upload-failed td-alert td-alert--danger" [hidden]>
 *     <span class="td-alert__icon td-media-picker__upload-failed-icon" aria-hidden="true">{error icon}</span>
 *     <span class="td-media-picker__upload-failed-text">{n} tệp tải lên lỗi</span>
 *     <span class="td-media-picker__upload-failed-actions">
 *       <button class="td-btn td-btn--sm td-btn--secondary td-media-picker__upload-retry-all">Thử lại tất cả</button>
 *       <button class="td-btn td-btn--sm td-btn--ghost td-media-picker__upload-remove-all">Gỡ tất cả lỗi</button></span>
 *   </div>
 */
import { parseFileSize } from '../utils/upload-queue.js';
import { readImageSize } from '../utils/image-size.js';
import { TdDropzone } from '../form/td-dropzone.js';
import { createAdapterUpload } from './media-picker-upload.js';
import { getUploadStore } from './media-picker-uploads.js';
import { batchDoneText } from './media-picker-batch.js';
import { TdToast } from './td-toast.js';
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

/** v0.95.0: the toast of a batch that ended while no picker showed it — the page's theme (no themeRoot), plan D */
function closedToast(type, text) {
  if (!text) return;
  try { (type === 'warning' ? TdToast.warning : TdToast.success).call(TdToast, text, { duration: 4000 }); } catch { /* ignore */ }
}

/**
 * v0.95.0: the adapter call of ONE dropped file, its context captured at drop time (plan A). Built outside
 * createGridDrop so the hook (kept by the store while the file uploads in the background) never holds the picker
 * session through a shared closure scope.
 */
function recordHook({ adapter, context, coll, metaKeys, t }, { onError, isClosed }) {
  return createAdapterUpload({
    adapter,
    context,
    ...(coll ? { collectionId: coll.id } : {}),
    metaKeys,
    t,
    fieldsFor: () => ({}),
    onError,
    isClosed,
  });
}

/**
 * Decode `file` for the square preview (plan v0.93.1-preview-cover): the size comes from the file head
 * (`readImageSize`, EXIF orientation applied), then ONE decode with one common scale — both resize dimensions ≤
 * PREVIEW_SIZE (Codex security v0.93.0 SEC-04: no probe, no full-size fallback), aspect kept. Unknown size / a PNG or
 * WebP orientation we cannot be sure of → null (the kind icon stays, no decode). An engine without the resize options
 * (TypeError) keeps the icon too.
 * @param {File} file @returns {Promise<{ bmp: ImageBitmap, dw: number, dh: number } | null>}
 */
async function decodePreview(file) {
  const size = await readImageSize(file);
  if (!size) return null;
  const scale = Math.min(1, PREVIEW_SIZE / Math.max(size.width, size.height));
  const dw = Math.min(PREVIEW_SIZE, Math.max(1, Math.round(size.width * scale)));
  const dh = Math.min(PREVIEW_SIZE, Math.max(1, Math.round(size.height * scale)));
  const bmp = await createImageBitmap(file, { resizeWidth: dw, resizeHeight: dh, resizeQuality: 'medium' });
  return { bmp, dw, dh };
}

/**
 * @param {object} o see the file header
 * @returns {{ attach(): void, accept(files: File[]): { accepted: File[], rejected: object[] }, busy(): boolean,
 *   isPending(id: string|null|undefined): boolean, placeholders(): HTMLElement[], doneIds(): string[],
 *   afterRender(ids: string[], seq: number, source?: string): void, destroy(): void }}
 */
export function createGridDrop(o) {
  const t = (k, p) => {
    try { return String(o.t(k, p) ?? ''); } catch { return ''; }
  };
  const tStatic = typeof o.tStatic === 'function' ? o.tStatic : o.t;
  const call = (fn, ...args) => {
    if (typeof fn !== 'function') return undefined;
    try { return fn(...args); } catch (err) { console.error(err); return undefined; }
  };
  const up = o.upload && typeof o.upload === 'object' ? o.upload : {};
  const L = () => TdDropzone.labels;
  let destroyed = false;
  let attached = false;
  const live = () => attached && !destroyed && call(o.isLive) !== false;
  const store = getUploadStore(o.adapter, { toast: closedToast });

  /** @type {Array<object>} cards, in grid order (newest drop first, file order inside a drop; pinned after) */
  let cards = [];
  /** @type {Map<object, object>} store record → card */
  const byRec = new Map();
  /** serial preview decoding (one file at a time: memory) */
  const previews = [];
  let previewing = false;
  /** @type {{ el: HTMLElement, text: HTMLElement, retry: HTMLButtonElement, remove: HTMLButtonElement }|null} */
  let strip = null;

  // --- the view the store talks to (only for records of this context) ---
  const view = {
    session: 0,
    context: o.context,
    t: tStatic,
    onAdd: (recs) => addCards(recs),
    onChange: (rec, kind) => onChange(rec, kind),
    onDone: (rec, asset, dedup) => {
      const card = byRec.get(rec);
      byRec.delete(rec);
      if (card && live()) finishCard(card, asset, dedup);
      updateStrip();
    },
    onRemove: (rec) => {
      const card = byRec.get(rec);
      byRec.delete(rec);
      if (card && card.state !== 'done') dropCard(card, { focusNext: true });
      updateStrip();
    },
    onError: (d) => { if (live()) call(o.onError, d); },
    onBatch: (r) => {
      if (!live() || !r) return;
      if (r.ok) call(o.toast, 'success', batchDoneText(r, t));
      const n = failedCards().length;
      if (n >= 2) call(o.announce, t('uploadFailedStrip', { n }));
    },
    detached: () => teardown(),
  };

  // --- cards ---

  /** a placeholder id that is no card id on the page / of another card now (`taken`: extra ids to avoid) */
  function freshId(taken) {
    for (;;) {
      const id = `${UPLOAD_ID_PREFIX}${++seq}`;
      if (taken && taken.has(id)) continue;
      if (call(o.hasCard, id)) continue;
      if (cards.some((c) => c.el.getAttribute('data-id') === id)) continue;
      return id;
    }
  }

  /** @param {string} name @param {string} kind @param {object|null} rec the store record (null: a pinned reused card) */
  function buildCard(name, kind, rec) {
    const id = freshId();
    const el = document.createElement('div');
    el.setAttribute('data-td-media-item', '');
    el.setAttribute('data-td-media-pending', ''); // td-media-grid leaves it out of Shift ranges (Codex impl r2 #12)
    el.setAttribute('data-id', id);
    el.className = 'td-media-picker__card td-media-picker__card--upload';
    el.setAttribute('data-kind', kind);
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
    const svg = tdIcon(KIND_ICON[kind] || 'file', { size: 'xl' });
    if (svg) icon.appendChild(svg);
    thumb.appendChild(icon);
    const info = document.createElement('span');
    info.className = 'td-media-picker__info';
    info.setAttribute('aria-hidden', 'true');
    const nm = document.createElement('span');
    nm.className = 'td-media-picker__name';
    nm.textContent = name; // user-controlled: text only
    nm.title = name;
    const meta = document.createElement('span');
    meta.className = 'td-media-picker__meta';
    info.append(nm, meta);
    open.append(thumb, info);
    const bar = document.createElement('span');
    bar.className = 'td-media-picker__upload-actions';
    const progress = document.createElement('td-progress');
    progress.className = 'td-media-picker__upload-progress';
    progress.setAttribute('size', 'sm');
    progress.setAttribute('label', t('uploadProgressLabel', { name }));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'td-btn td-btn--ghost td-btn--sm td-media-picker__upload-remove';
    const x = tdIcon('close', { size: 's' });
    if (x) remove.appendChild(x);
    bar.append(remove);
    el.append(open, progress, bar);
    const card = { rec, name, el, open, thumb, icon, meta, bar, progress, remove, retry: null, canvas: null,
      state: '', label: '', assetId: null, assetName: '', doneSeq: -1, reused: false };
    remove.addEventListener('click', () => {
      if (!live()) return;
      removeByUser(card);
    });
    return card;
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

  function paint(card) {
    const { el } = card;
    if (card.state === 'done' || !card.rec) return;
    const item = card.rec.item;
    const state = item.status === 'selected' ? 'queued' : item.status;
    el.setAttribute('data-upload', state);
    el.toggleAttribute('data-waiting', item.status === 'uploading' && item.progress == null);
    const error = item.status === 'error';
    el.setAttribute('aria-busy', error ? 'false' : 'true');
    const text = statusText(item);
    if (card.meta.textContent !== text) card.meta.textContent = text;
    const label = `${card.name} — ${text}`;
    if (card.label !== label) { // on state changes only, never per percent
      card.label = label;
      card.open.setAttribute('aria-label', label);
    }
    const p = card.progress;
    p.hidden = error;
    if (item.progress == null) p.removeAttribute('value');
    else p.setAttribute('value', String(Math.round(item.progress)));
    p.setAttribute('variant', error ? 'danger' : 'primary');
    // the × cancels a running file, removes a failed one
    const rm = t(error ? 'dropRemove' : 'dropCancel', { name: card.name });
    if (card.remove.getAttribute('aria-label') !== rm) card.remove.setAttribute('aria-label', rm);
    const canRetry = error && !!item.uploadFailed;
    if (canRetry && !card.retry) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'td-btn td-btn--ghost td-btn--sm td-media-picker__upload-retry';
      b.textContent = t('dropRetry');
      b.setAttribute('aria-label', t('dropRetryLabel', { name: card.name }));
      b.addEventListener('click', () => {
        if (!live() || card.state === 'done' || !card.rec) return;
        const had = card.el.contains(document.activeElement);
        if (store.retry(card.rec, view) && had) focus(card.remove);
      });
      card.bar.insertBefore(b, card.remove);
      card.retry = b;
    } else if (!canRetry && card.retry) {
      const had = card.retry === document.activeElement;
      card.retry.remove();
      card.retry = null;
      if (had) focus(card.remove);
    }
    card.state = state;
  }

  function onChange(rec, kind) {
    const card = byRec.get(rec);
    if (!card || !live()) return;
    paint(card);
    if (kind === 'error' || kind === 'failed') {
      const msg = rec.item.error || String(L().uploadError ?? '');
      call(o.announce, `${t('dropFailed', { name: card.name })}. ${msg}`);
    }
    updateStrip();
  }

  /** a card turns into a regular done card of `asset` (data-id = asset id), its upload chrome removed */
  function markDone(card, asset) {
    const el = card.el;
    card.state = 'done';
    card.assetId = asset.id;
    card.assetName = typeof asset.name === 'string' && asset.name ? asset.name : card.name;
    el.setAttribute('data-upload', 'done');
    el.removeAttribute('data-td-media-pending');
    el.removeAttribute('data-waiting');
    el.setAttribute('data-id', asset.id);
    el.setAttribute('aria-busy', 'false');
    // the regular card look + label (thumbnail of the asset, name, meta, reused chip): the picker's _paintItem
    call(o.paintCard, el, asset);
    if (card.canvas) {
      card.canvas.width = 0;
      card.canvas.height = 0;
      card.canvas = null;
    }
    card.open.removeAttribute('aria-disabled');
    const label = card.open.getAttribute('aria-label') || asset.name || asset.id;
    const Grid = customElements.get('td-media-grid');
    const tick = el.querySelector('.td-media-grid__tick');
    if (tick && Grid && Grid.labels) tick.setAttribute('aria-label', String(Grid.labels.select ?? '').replace('{name}', label));
    const hadFocus = card.bar.contains(document.activeElement);
    card.progress.remove();
    card.bar.remove();
    if (hadFocus) focus(card.open);
  }

  /**
   * plan "Thứ tự khi xong": the card is done (data-id = asset) BEFORE the picker's _onUploaded runs. v0.95.0: a file
   * dropped in an earlier open finishes quietly (no selection, no asset-change — owner Q12).
   */
  function finishCard(card, asset, dedup) {
    if (!asset) {
      dropCard(card, { focusNext: true });
      return;
    }
    const own = !!card.rec && card.rec.session === view.session;
    const done = own ? o.onUploaded : o.onUploadedQuiet;
    const reused = !!dedup && dedup.outcome === 'exact-reused';
    if (reused) {
      card.reused = true;
      call(o.markReused, asset.id); // before any paint: every card of the asset shows the chip
    }
    // another upload's placeholder may carry this asset id: re-key it first (Codex impl r2 #10)
    for (const c of cards) {
      if (c !== card && c.state !== 'done' && c.el.getAttribute('data-id') === asset.id) {
        c.el.setAttribute('data-id', freshId(new Set([asset.id])));
      }
    }
    card.doneSeq = Number(call(o.listSeq)) || 0;
    // two drops deduplicated to the same asset: one done card per asset — this one leaves (Codex impl r1 #4)
    const twin = cards.find((c) => c !== card && c.state === 'done' && c.assetId === asset.id);
    if (twin) {
      if (reused) {
        twin.reused = true;
        call(o.paintCard, twin.el, asset); // the chip on the card that stays
      }
      const hadFocus = card.el.contains(document.activeElement);
      dropCard(card);
      if (hadFocus) focus(twin.open);
      call(done, asset, dedup);
      return;
    }
    markDone(card, asset);
    // exact-reused while the real card of the asset is on the page: one element per asset, never two
    if (call(o.hasCard, asset.id)) dropCard(card, { focusNext: true });
    call(done, asset, dedup);
  }

  /** × of a card: cancel (running) / remove (failed); the focus moves to the next card */
  function removeByUser(card) {
    if (card.state === 'done') return;
    if (!card.rec || !store.remove(card.rec)) dropCard(card, { focusNext: true });
  }

  /** take a card out of the grid (silently out of the grid selection first: never a user-visible deselect) */
  function dropCard(card, { focusNext = false, sync = true } = {}) {
    const i = cards.indexOf(card);
    if (i < 0) return;
    cards.splice(i, 1);
    if (card.rec) byRec.delete(card.rec);
    const el = card.el;
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
    if (card.state === 'done' && id && !call(o.hasCard, id) && !cards.some((c) => c.state === 'done' && c.assetId === id)
      && typeof grid.deselect === 'function') grid.deselect([id]);
    el.remove();
    if (card.canvas) {
      card.canvas.width = 0;
      card.canvas.height = 0;
      card.canvas = null;
    }
    if (next) focus(next);
    if (sync && card.state === 'done') call(o.syncGrid);
    if (!destroyed) call(o.onCardsChange);
  }

  function focus(el) {
    if (!el || typeof el.focus !== 'function') return;
    try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
  }

  /** new store records → cards first in the grid (`append`: after the cards already there — the rebuild on attach) */
  function addCards(recs, { append = false } = {}) {
    if (destroyed) return [];
    const fresh = [];
    for (const rec of recs) {
      const card = buildCard(rec.name, rec.kind, rec);
      byRec.set(rec, card);
      fresh.push(card);
    }
    cards = append ? [...cards, ...fresh] : [...fresh, ...cards];
    const els = fresh.map((c) => c.el);
    if (els.length && !append) o.grid.prepend(...els);
    for (const card of fresh) paint(card);
    for (const card of fresh) if (card.rec.item.original && wantsPreview(card.rec.item.original)) previews.push(card);
    pumpPreviews();
    if (fresh.length) call(o.onCardsChange);
    updateStrip();
    return fresh;
  }

  // --- failure strip (plan E) ---

  const failedCards = () => cards.filter((c) => c.state !== 'done' && c.rec && c.rec.item.status === 'error');

  function buildStrip() {
    const el = document.createElement('div');
    el.className = 'td-media-picker__upload-failed td-alert td-alert--danger';
    el.hidden = true;
    const icon = document.createElement('span');
    icon.className = 'td-alert__icon td-media-picker__upload-failed-icon';
    icon.setAttribute('aria-hidden', 'true');
    const svg = tdIcon('error', { size: 'm' });
    if (svg) icon.appendChild(svg);
    const text = document.createElement('span');
    text.className = 'td-media-picker__upload-failed-text';
    const actions = document.createElement('span');
    actions.className = 'td-media-picker__upload-failed-actions';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'td-btn td-btn--sm td-btn--secondary td-media-picker__upload-retry-all';
    retry.textContent = t('retryAll');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'td-btn td-btn--sm td-btn--ghost td-media-picker__upload-remove-all';
    remove.textContent = t('removeAllFailed');
    actions.append(retry, remove);
    el.append(icon, text, actions);
    retry.addEventListener('click', () => {
      if (!live()) return;
      const had = el.contains(document.activeElement);
      const n = store.retryFailed(view);
      if (n) call(o.announce, t('retryAllStarted', { n }));
      afterBulk(had);
    });
    remove.addEventListener('click', () => {
      if (!live()) return;
      const had = el.contains(document.activeElement);
      const n = store.removeFailed(view);
      if (n) call(o.announce, t('removedFailed', { n }));
      afterBulk(had);
    });
    o.grid.before(el); // right before the grid, inside the results section
    return { el, text, retry, remove };
  }

  /** focus after a bulk action: strip gone → the results heading; still shown → the button that is left */
  function afterBulk(had) {
    updateStrip();
    if (!had || !strip) return;
    if (strip.el.hidden) focus(call(o.focusFallback));
    else if (strip.retry.hidden) focus(strip.remove);
  }

  function updateStrip() {
    if (destroyed) return;
    const failed = failedCards();
    const n = failed.length;
    if (n < 2) { // owner Q2: one failed card has its own Thử lại / Gỡ
      if (strip && !strip.el.hidden) {
        const had = strip.el.contains(document.activeElement);
        strip.el.hidden = true;
        if (had) focus(call(o.focusFallback));
      }
      return;
    }
    if (!strip) strip = buildStrip();
    const text = t('uploadFailedStrip', { n });
    if (strip.text.textContent !== text) strip.text.textContent = text;
    const canRetry = failed.some((c) => c.rec.item.uploadFailed);
    if (strip.retry.hidden === canRetry) {
      const had = strip.retry === document.activeElement;
      strip.retry.hidden = !canRetry;
      if (had && !canRetry) focus(strip.remove);
    }
    strip.el.hidden = false;
  }

  // --- preview: canvas from createImageBitmap (no blob: URL, no img-src), one file at a time ---

  function wantsPreview(file) {
    const type = String(file.type || '').toLowerCase();
    return type.startsWith('image/') && type !== 'image/svg+xml' && file.size > 0 && file.size <= PREVIEW_MAX_BYTES
      && typeof createImageBitmap === 'function';
  }

  function pumpPreviews() {
    if (previewing || destroyed) return;
    const card = previews.shift();
    if (!card) return;
    const file = card.rec && card.rec.item.original;
    if (!file || !cards.includes(card) || card.state === 'done') {
      pumpPreviews();
      return;
    }
    previewing = true;
    Promise.resolve().then(() => decodePreview(file)).then((r) => { // a sync throw rejects too
      if (!r) return;
      const { bmp, dw, dh } = r;
      try {
        if (destroyed || !cards.includes(card) || card.state === 'done') return;
        const canvas = document.createElement('canvas');
        canvas.className = 'td-media-picker__upload-preview';
        canvas.width = PREVIEW_SIZE;
        canvas.height = PREVIEW_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        // cover: the centred square of the bitmap (dw / dh are ours, never the bitmap's own size), scaled to the tile
        const side = Math.min(dw, dh);
        ctx.drawImage(bmp, (dw - side) / 2, (dh - side) / 2, side, side, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
        card.canvas = canvas;
        card.icon.replaceWith(canvas);
      } finally {
        try { bmp.close(); } catch { /* ignore */ }
      }
    }, () => { /* not decodable: the kind icon stays */ }).finally(() => {
      previewing = false;
      pumpPreviews();
    });
  }

  // --- API ---

  function attach() {
    if (attached || destroyed) return;
    attached = true;
    store.attach(view);
    // running / failed files of this context (store order), then the reused assets that finished unseen (pinned)
    const recs = store.visible(view);
    addCards(recs, { append: true });
    for (const asset of store.takeReused(view.context)) {
      if (!asset || cards.some((c) => c.state === 'done' && c.assetId === asset.id)) continue;
      call(o.markReused, asset.id);
      call(o.cacheAsset, asset);
      const card = buildCard(typeof asset.name === 'string' ? asset.name : String(asset.id), asset.kind || 'file', null);
      card.reused = true;
      cards.push(card);
      markDone(card, asset);
    }
    const els = cards.map((c) => c.el);
    if (els.length) {
      o.grid.prepend(...els);
      call(o.onCardsChange);
    }
    if (recs.length) {
      const k = recs.filter((r) => r.item.status === 'error').length;
      call(o.announce, t('uploadsResumed', { n: recs.length - k, k }));
    }
  }

  function accept(files) {
    const list = [...(files || [])];
    if (destroyed || !attached || !list.length) return { accepted: [], rejected: [] };
    const coll = call(o.collection);
    const snap = { adapter: o.adapter, context: o.context, coll: coll ? { id: coll.id ?? null } : null,
      metaKeys: o.metaKeys, t: tStatic };
    const res = store.accept(list, {
      view,
      cfg: {
        accept: up.accept || null,
        maxSize: parseFileSize(up.maxSize),
        // plan: like the dialog's dropzone — `multiple: false` keeps one file of this open; a new drop replaces the
        // earlier (running / failed) one, the extra files of a drop are rejected ('count')
        single: up.multiple === false,
        policy: up.imageResize || null,
        labels: TdDropzone.labels,
      },
      context: o.context,
      makeHook: (_rec, h) => recordHook(snap, h),
    });
    const parts = [];
    if (res.accepted.length) parts.push(t('dropStarted', { n: res.accepted.length }));
    for (const r of res.rejected) parts.push(r.message);
    if (res.rejected.length) call(o.toast, 'warning', t('dropRejected', { n: res.rejected.length }));
    if (parts.length) call(o.announce, parts.join('. '));
    return { accepted: res.accepted, rejected: res.rejected };
  }

  function afterRender(ids, renderSeq, source) {
    if (destroyed) return;
    const onPage = new Set(ids || []);
    const keepPinned = source === 'upload' || source === 'open';
    const hidden = [];
    for (const card of [...cards]) {
      if (card.state !== 'done') {
        // the new page has a real card with this placeholder's id: re-key the placeholder (never two equal data-ids)
        if (onPage.has(card.el.getAttribute('data-id'))) card.el.setAttribute('data-id', freshId(onPage));
        continue;
      }
      if (onPage.has(card.assetId)) dropCard(card, { sync: false });
      else if (card.reused) {
        // plan F: a reused asset not on this page stays pinned through upload / opening reloads; a user navigation
        // (query, filter, album, page) removes it silently (the asset stays selected)
        if (!keepPinned) dropCard(card, { sync: false });
      } else if (renderSeq > card.doneSeq) {
        hidden.push(card);
        dropCard(card, { sync: false });
      }
    }
    const els = cards.map((c) => c.el);
    if (els.length) o.grid.prepend(...els); // back at the start of the grid, in order
    for (const card of hidden) call(o.announce, t('uploadedHidden', { name: card.assetName || card.name }));
  }

  /** the one cleanup (detach or a forced detach by a newer view): DOM out, nothing aborted */
  function teardown() {
    if (destroyed) return;
    destroyed = true;
    previews.length = 0;
    for (const card of [...cards]) {
      card.el.remove();
      if (card.canvas) {
        card.canvas.width = 0;
        card.canvas.height = 0;
        card.canvas = null;
      }
    }
    cards = [];
    byRec.clear();
    if (strip) {
      strip.el.remove();
      strip = null;
    }
  }

  return {
    attach,
    accept,
    busy: () => !destroyed && cards.some((c) => c.state !== 'done' && c.rec
      && ['queued', 'optimizing', 'uploading', 'selected'].includes(c.rec.item.status)),
    isPending: (id) => !destroyed && id != null && cards.some((c) => c.state !== 'done' && c.el.getAttribute('data-id') === id),
    placeholders: () => cards.map((c) => c.el),
    doneIds: () => cards.filter((c) => c.state === 'done').map((c) => c.assetId),
    afterRender,
    destroy() {
      if (destroyed) return;
      teardown();
      store.detach(view);
    },
  };
}
