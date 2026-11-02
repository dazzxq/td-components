/**
 * Upload dialog of td-media-picker — v0.33.0 (plan v0.33.0-media-picker-dcms-parity, decisions 20-23). A nested dialog
 * ("Tải lên media") on top of the picker: optional uploadFields (shared by both sources), `<td-tabs size="sm">` "Tải file"
 * (td-dropzone multiple, presentation API) / "Tải từ URL" (adapter.uploadFromUrl), footer "Đóng".
 *
 * INTERFACE CONTRACT (fixed — the picker lane codes against it; the upload lane implements it):
 *
 *   import { openUploadDialog, UPLOAD_LABELS } from './media-picker-upload.js';
 *
 *   UPLOAD_LABELS — default Vietnamese texts of this dialog; the picker spreads them into TdMediaPicker.labels, so
 *   `o.t(key, params)` resolves them (with options.messages overrides) exactly like every other picker label.
 *
 *   const handle = openUploadDialog({
 *     t,            // (key: string, params?: object) => string — the picker's label resolver
 *     adapter,      // the resolved adapter (upload / uploadFromUrl are called on it)
 *     context,      // OpenMediaPickerOptions.context (passed through to the adapter)
 *     collectionId, // v0.66.0 (K8), optional: present (null | id) only in a collection-enabled picker session → passed
 *                   //   through to upload / uploadFromUrl options; absent → the options keep the v0.65 shape
 *     sources,      // { file: boolean, url: boolean } — which sources the picker allows (caps + methods resolved)
 *     upload,       // resolved OpenMediaPickerOptions.upload { accept?, maxSize?, multiple?, acceptLabel?, imageResize? }
 *                   //   (v0.90.0 `imageResize`: a normalised policy or null → the dropzone's `imageResize`)
 *     uploadFields, // normalizeFields() output (may be [])
 *     metaKeys,     // string[] — metadata keys kept on normalized assets
 *     idPrefix,     // unique id prefix (picker id + '-up')
 *     onUploaded,   // (asset, deduplication, operation: 'upload' | 'upload-url') => void — one VALIDATED result
 *                   //   (normalizeUploadResult ok); the picker invalidates caches, reloads page 1, selects, opens detail,
 *                   //   emits asset-change.
 *     onError,      // ({ operation: 'upload' | 'upload-url', code, retryable }) => void — picker emits operation-error
 *     announce,     // (text: string) => void — picker live region
 *     onClosed,     // () => void — after the dialog fully closed (picker returns focus to its "Tải lên" button)
 *     uploadSlots,  // v0.93.0 (internal), optional: the picker-wide createUploadSlots(3) pool → the dropzone's
 *                   //   `_uploadSlots` (grid + dialog share 3 concurrent adapter.upload calls); absent → unlimited
 *     files,        // v0.93.0 (internal), optional File[]: dropped on the picker (a site with uploadFields) → HELD in a
 *                   //   block above the dropzone, uploaded only by its "Tải lên {n} tệp" button (field values captured
 *                   //   then, per File); never uploaded on their own; closing with held files asks nothing
 *   });
 *
 *   handle.root      HTMLElement — the dialog root (.td-modal…td-media-picker-upload)
 *   handle.busy()    boolean — a file or URL upload is in flight
 *   handle.close()   Promise<boolean> — user-style close: asks "Huỷ các tệp đang tải?" when busy; true when closed
 *   handle.destroy() void — immediate teardown, aborts everything, no confirmation (picker teardown)
 *
 * Text-only rendering, CSP-strict, every error through normalizeError (userMessage / labels only).
 *
 * Implementation notes (lane D):
 * - Shell = `openDialogLayer` at LAYERS.modal (band promotion puts it above the picker) + the td-modal DOM / CSS
 *   (`components/media-picker-upload.css`: md width, full viewport < 720px (ADR 0014)). Escape / × / "Đóng" → close() (layered:
 *   only this dialog). The focus goes back to the opener (the picker's "Tải lên" button) through dialog-layer; then
 *   `onClosed()` runs once the root is removed. `destroy()` never calls `onClosed`.
 * - The busy confirmation is a `TdModal.show()` whose id is kept (like the picker's discard confirm) so destroy() can
 *   close exactly that instance; texts `uploadCancelTitle` / `uploadCancelMessage`; message as text.
 * - Every in-dialog status (per-file uploaded / reused, URL errors) goes to the dialog's own live region (the picker's
 *   region is inert while this dialog is open); `announce` (the picker's) is used only after the dialog closed.
 * - File tab: one "batch" = the files added while none was pending; v0.93.0 the dropzone's UploadQueue counts it
 *   (`dz._onBatchEnd`, utils/upload-queue.js: rows waiting for a slot, queued / optimising rows, optimisation failures
 *   and "Thử lại" included; aborted rows not counted) → toast `uploadDone` ({ok}/{total}; no toast when nothing
 *   succeeded) and, without errors (and no URL task running), the dialog closes.
 * - v0.90.0 image resize (`upload.imageResize`): the upload fields are captured when a file is ADDED (`files-change`
 *   `detail.added`, WeakMap by the original File) and that snapshot is reused when the file uploads and on "Thử lại";
 *   the adapter gets `optimization` in its options.
 * - v0.93.0: the adapter call itself is `createAdapterUpload()` (shared with the picker's grid drop); URL uploads take
 *   no upload slot.
 * - No auto-close (file batch or URL) while the dropzone still shows an error row (`[data-status="error"]`).
 * - URL tab: client checks are UX only (validateRemoteUrl); the normalised `href` is sent; no client preview (no request
 *   to the typed URL from the browser); single-flight; "Huỷ" aborts silently.
 *
 * DOM:
 *   <div class="td-modal td-modal--md td-media-picker-upload" data-state="opening|open|closing">
 *     <div class="td-modal__backdrop" aria-hidden="true"></div>
 *     <div class="td-modal__dialog … td-media-picker-upload__dialog" role="dialog" aria-modal="true" aria-labelledby tabindex="-1">
 *       <div class="td-modal__header"><h2 class="td-modal__title">Tải lên media</h2><button class="td-modal__close">×</button></div>
 *       <div class="td-modal__body td-media-picker-upload__body">
 *         [FieldForm .td-media-picker-upload__fields] <p class="td-media-picker-upload__hint" [hidden]>
 *         [<td-tabs size="sm" class="td-media-picker-upload__tabs">]   (both sources only)
 *         <div class="td-media-picker-upload__panels">   (one grid cell: the inactive panel keeps its box, invisible →
 *                                                          one dialog height across tabs, like dcms2)
 *         [<div class="td-media-picker-upload__panel" data-source="file">
 *            [v0.93.0 <div class="td-media-picker-upload__held" role="group" aria-labelledby="{id}-held">
 *              <p class="td-media-picker-upload__held-title" id="{id}-held">Tệp đã thả (n)</p>
 *              <ul class="td-media-picker-upload__held-list"><li class="td-media-picker-upload__held-item">
 *                <span __held-name>{name}</span><span __held-size>{size}</span><button.td-btn ghost sm × "Bỏ {name}"></li></ul>
 *              <td-button variant="primary" class="td-media-picker-upload__held-submit">Tải lên {n} tệp</td-button></div>]
 *            td-dropzone + <ul class="td-media-picker-upload__notes"></div>]
 *         [<div class="td-media-picker-upload__panel" data-source="url"><p class="td-media-picker-upload__desc">
 *            <div class="td-media-picker-upload__url-row">td-input-field.td-media-picker-upload__url</div>
 *            <div class="td-media-picker-upload__url-actions">td-button submit · td-button abort</div>   (below the input, dcms2)
 *            <td-progress class="td-media-picker-upload__progress" size="sm" hidden></div>]
 *         </div>
 *       </div>
 *       <div class="td-modal__footer td-media-picker-upload__footer"><td-button variant="secondary">Đóng</td-button></div>
 *       <span class="td-sr-only td-media-picker-upload__live" role="status"></span>
 *     </div>
 *   </div>
 */
import { openDialogLayer } from './dialog-layer.js';
import { nearestScroller } from '../utils/keyboard-viewport.js';
import { TdModal } from './td-modal.js';
import { TdToast } from './td-toast.js';
import { LAYERS } from '../utils/layers.js';
import { fillIconSlots } from '../icons/td-icon.js';
import { safeMediaUrl } from '../utils/media-url.js';
import { normalizeError, normalizeUploadResult, validateRemoteUrl } from '../utils/media-picker-core.js';
import { FieldForm } from './media-picker-fields.js';
import { tdIcon } from '../icons/td-icon.js';
import { formatFileSize } from '../utils/dom-utils.js';
import '../display/td-tabs.js';
import '../form/td-dropzone.js';
import '../form/td-input-field.js';
import '../form/td-button.js';
import './td-progress.js';

/** Default texts (merged into TdMediaPicker.labels by the picker). */
export const UPLOAD_LABELS = {
  uploadTitle: 'Tải lên media',
  uploadClose: 'Đóng',
  uploadSources: 'Nguồn tải lên',
  uploadTabFile: 'Tải file',
  uploadTabUrl: 'Tải từ URL',
  uploadDropTitle: 'Kéo thả file vào đây',
  uploadDropText: 'hoặc bấm để chọn file',
  uploadNeedsFields: 'Điền các trường bắt buộc trước khi tải lên.',
  uploadDone: 'Đã tải lên {ok}/{total} tệp',
  /** v0.93.0: files dropped on the picker (site with uploadFields), held until the user submits them */
  uploadHeld: 'Tệp đã thả ({n})',
  uploadHeldSubmit: 'Tải lên {n} tệp',
  uploadHeldRemove: 'Bỏ {name}',
  uploaded: 'Đã tải lên {name}',
  reused: '{name} đã có trong thư viện — dùng lại ảnh cũ',
  uploadError: 'Tải lên thất bại',
  uploadCancelTitle: 'Huỷ các tệp đang tải?',
  uploadCancelMessage: 'Các tệp đang tải lên sẽ bị huỷ.',
  uploadCancelConfirm: 'Huỷ tải lên',
  uploadCancelKeep: 'Tiếp tục tải',
  urlDescription: 'Nhập URL ảnh để tải trực tiếp. Hỗ trợ: {accept}',
  urlDescriptionAny: 'Nhập URL ảnh để tải trực tiếp.',
  urlLabel: 'URL ảnh',
  urlPlaceholder: 'https://example.com/image.jpg',
  urlSubmit: 'Tải lên',
  urlAbort: 'Huỷ',
  urlProgress: 'Đang tải từ URL',
  urlDone: 'Đã tải lên từ URL',
  urlError: {
    'too-long': 'URL quá dài',
    invalid: 'URL không hợp lệ',
    scheme: 'Chỉ nhận http hoặc https',
    credentials: 'URL không được chứa thông tin đăng nhập',
  },
};

const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
/** marks the rejection of a malformed `adapter.upload` result (createAdapterUpload) */
/** errors made here for a malformed result — a WeakSet never runs an adapter error's proxy traps (Codex impl r2 #11) */
const malformedErrors = new WeakSet();

/**
 * Formats text from `accept` ('.jpg,.png,image/webp,image/*' → 'JPG, PNG, WEBP, image/*'), '' without one.
 * @param {string} accept @returns {string}
 */
export function acceptLabelFrom(accept) {
  const out = [];
  for (const raw of String(accept || '').split(',')) {
    const tok = raw.trim();
    if (!tok) continue;
    let label = tok;
    if (tok.startsWith('.')) label = tok.slice(1).toUpperCase();
    else {
      const m = /^[a-z0-9.+-]+\/([a-z0-9.+-]+)$/i.exec(tok);
      if (m && m[1] !== '*') label = m[1].replace(/^x-/i, '').split('+')[0].toUpperCase();
    }
    if (label && !out.includes(label)) out.push(label);
  }
  return out.join(', ');
}

/** Upload progress object → the dropzone's `onProgress(percent)` / `onProgress(loaded, total)`. */
function progressBridge(onProgress) {
  return (p) => {
    if (!p || typeof p !== 'object') return;
    const pct = typeof p.percent === 'number' && Number.isFinite(p.percent) ? p.percent : null;
    if (pct !== null) onProgress(pct);
    else if (typeof p.loaded === 'number' && Number.isFinite(p.loaded)) {
      onProgress(p.loaded, typeof p.total === 'number' && Number.isFinite(p.total) ? p.total : undefined);
    }
  };
}

/**
 * @internal v0.93.0 — the upload hook shared by the upload dialog and the grid drop: `adapter.upload(file, { fields,
 * context, collectionId?, signal, onProgress, optimization? })` → `normalizeUploadResult` / `normalizeError`. The hook
 * (`(file, { onProgress, signal, optimization?, originalFile? }) => Promise`) resolves `{ asset, deduplication }`;
 * rejects with an Error carrying the user message on failure (`onFieldErrors(n)` when the error has field errors —
 * without that handler the field messages join the message; `onError({ operation: 'upload', code, retryable })`, a
 * malformed result included: code 'server'), or with the raw error when aborted (no report). It neither counts
 * batches (UploadQueue does) nor calls `onUploaded` (the caller decides the order).
 * @param {{ adapter: object, context?: *, collectionId?: *, metaKeys?: string[], t: (k: string, p?: object) => string,
 *   fieldsFor?: (original: File) => object, onError?: Function, onFieldErrors?: Function, isClosed?: () => boolean }} o
 *   `collectionId`: sent only when the key is present (v0.66 shape)
 * @returns {(file: File, c: { onProgress: Function, signal: AbortSignal, optimization?: object, originalFile?: File })
 *   => Promise<{ asset: object, deduplication: object }>}
 */
export function createAdapterUpload(o) {
  const t = (k, p) => {
    try { return String(o.t(k, p) ?? ''); } catch { return ''; }
  };
  const collOpt = 'collectionId' in o && o.collectionId !== undefined ? { collectionId: o.collectionId } : {};
  const metaKeys = Array.isArray(o.metaKeys) ? o.metaKeys : [];
  const closed = () => {
    try { return typeof o.isClosed === 'function' && !!o.isClosed(); } catch { return false; }
  };
  const report = (n) => {
    try {
      if (typeof o.onError === 'function') o.onError({ operation: 'upload', code: n.code, retryable: n.retryable });
    } catch (err) { console.error(err); }
  };
  return (file, c) => {
    const { onProgress, signal } = c;
    if (closed()) return Promise.reject(abortError());
    // v0.90.0: the field values of the original File (dialog: the snapshot taken when it was added)
    const fieldValues = typeof o.fieldsFor === 'function' ? (o.fieldsFor(c.originalFile || file) || {}) : {};
    // v0.90.0: the optimisation summary goes to the adapter as it is (only when the dropzone has a policy)
    const optOpt = 'optimization' in c ? { optimization: c.optimization } : {};
    let out;
    try {
      out = Promise.resolve(o.adapter.upload(file, { fields: fieldValues, context: o.context, ...collOpt, signal,
        onProgress: progressBridge(onProgress), ...optOpt }));
    } catch (err) {
      out = Promise.reject(err);
    }
    // one path (Codex impl r1 #3): a malformed result is a normalised `server` failure, reported like any rejection
    return out.then((raw) => {
      if (closed() || signal.aborted) throw abortError();
      let res = null;
      try {
        res = normalizeUploadResult(raw, { safeUrl: safeMediaUrl, metadataKeys: metaKeys });
      } catch { res = null; }
      if (!res) {
        console.warn('td-media-picker: malformed upload result (ignored)'); // never the raw result (review SEC-2)
        const e = new Error('malformed');
        malformedErrors.add(e);
        throw e;
      }
      return res;
    }).catch((err) => {
      if (closed()) throw err;
      const malformed = typeof err === 'object' && err !== null && malformedErrors.has(err);
      const n = malformed
        ? normalizeError({ code: 'server' }, null, { warn: () => {}, operation: 'upload' })
        : normalizeError(err, signal, { operation: 'upload' });
      if (!n) throw err; // aborted (row removed / dialog closed): the dropzone shows nothing
      const fieldHandler = typeof o.onFieldErrors === 'function';
      if (n.fieldErrors.size && fieldHandler) {
        try { o.onFieldErrors(n); } catch (e) { console.error(e); }
      }
      report(n);
      if (malformed) throw new Error(t('uploadError'));
      // no field form to show them (grid drop): the field messages go into the row / card text (Codex impl r1 #6)
      const parts = n.userMessage ? [n.userMessage] : [];
      if (n.fieldErrors.size && !fieldHandler) {
        for (const msgs of n.fieldErrors.values()) {
          for (const m of msgs) if (!parts.includes(m) && parts.length < 4) parts.push(m);
        }
      }
      throw new Error(parts.join('. ') || t(`error.${n.code}`) || t('uploadError'));
    });
  };
}

/**
 * @param {object} o see the contract above
 * @returns {{ root: HTMLElement, busy(): boolean, close(): Promise<boolean>, destroy(): void }}
 */
export function openUploadDialog(o) {
  const t = (k, p) => {
    try { return String(o.t(k, p) ?? ''); } catch { return ''; }
  };
  const sources = { file: !!(o.sources && o.sources.file), url: !!(o.sources && o.sources.url) };
  const up = o.upload && typeof o.upload === 'object' ? o.upload : {};
  const id = String(o.idPrefix || 'td-media-picker-upload');
  // v0.66.0 (K8): the collection the picker is in (null = top level) — only when the picker passed the key at all
  const collOpt = o.collectionId !== undefined ? { collectionId: o.collectionId } : {};
  const metaKeys = Array.isArray(o.metaKeys) ? o.metaKeys : [];
  const acceptLabel = typeof up.acceptLabel === 'string' && up.acceptLabel.trim() ? up.acceptLabel.trim()
    : acceptLabelFrom(up.accept);
  const ctrl = new AbortController(); // lifetime of the dialog (field option loads)

  let closing = false; // phase 1 started (user close or destroy)
  let destroyed = false;
  /** @type {{ id: string, promise: Promise<boolean> }|null} */
  let confirm = null;
  /** @type {{ ctrl: AbortController }|null} */
  let urlTask = null;
  /** v0.90.0: an error row stays in the dropzone → the dialog must not auto-close over it */
  const hasErrorRow = () => !!(dz && dz.querySelector('[data-status="error"]'));
  /** v0.90.0: upload field values per original File, captured when the file was added */
  const snapshots = new WeakMap();

  // --- shell (static markup only; every dynamic value through the DOM) ---
  const root = document.createElement('div');
  root.className = 'td-modal td-modal--md td-media-picker-upload';
  root.setAttribute('data-state', 'opening');
  root.innerHTML = '<div class="td-modal__backdrop" aria-hidden="true"></div>'
    + '<div class="td-modal__dialog td-glass-surface td-glass-surface--strong td-glass-surface--lg td-media-picker-upload__dialog"'
    + ' role="dialog" aria-modal="true" tabindex="-1">'
    + '<div class="td-modal__header"><h2 class="td-modal__title"></h2>'
    + '<button type="button" class="td-modal__close"><span class="td-modal__close-icon" data-td-icon="close" aria-hidden="true"></span></button></div>'
    + '<div class="td-modal__body td-media-picker-upload__body"></div>'
    + '<div class="td-modal__footer td-media-picker-upload__footer"></div>'
    + '<span class="td-sr-only td-media-picker-upload__live" role="status"></span>'
    + '</div>';
  const q = (sel) => /** @type {HTMLElement} */ (root.querySelector(sel));
  const dialog = q('.td-media-picker-upload__dialog');
  const body = q('.td-media-picker-upload__body');
  const live = q('.td-media-picker-upload__live');
  const title = q('.td-modal__title');
  title.id = `${id}-title`;
  title.textContent = t('uploadTitle');
  dialog.setAttribute('aria-labelledby', title.id);
  const x = q('.td-modal__close');
  x.setAttribute('aria-label', t('uploadClose'));
  x.addEventListener('click', () => { void close(); });
  root.querySelector('.td-modal__backdrop').addEventListener('mousedown', (e) => e.preventDefault());
  fillIconSlots(root);
  const footerClose = /** @type {any} */ (document.createElement('td-button'));
  footerClose.className = 'td-media-picker-upload__close';
  footerClose.setAttribute('variant', 'secondary');
  footerClose.textContent = t('uploadClose');
  footerClose.addEventListener('click', () => { void close(); });
  q('.td-media-picker-upload__footer').appendChild(footerClose);

  let announceQueued = false;
  let pending = '';
  const announce = (text) => {
    if (!text) return;
    if (closing) {
      try { if (typeof o.announce === 'function') o.announce(text); } catch { /* ignore */ }
      return;
    }
    pending = text;
    if (announceQueued) return;
    announceQueued = true;
    queueMicrotask(() => {
      announceQueued = false;
      if (live.textContent === pending) live.textContent = '';
      live.textContent = pending;
    });
  };

  // --- upload fields (shared by both sources) ---
  /** @type {FieldForm|null} */
  let form = null;
  const fields = Array.isArray(o.uploadFields) ? o.uploadFields : [];
  if (fields.length) {
    form = new FieldForm(fields, {
      asset: undefined,
      values: {},
      idPrefix: `${id}-f`,
      signal: ctrl.signal,
      warn: (...a) => console.warn(...a),
      onChange: () => syncGate(),
    });
    form.el.classList.add('td-media-picker-upload__fields');
    body.appendChild(form.el);
  }
  const hint = document.createElement('p');
  hint.className = 'td-media-picker-upload__hint';
  hint.textContent = t('uploadNeedsFields');
  hint.hidden = true;
  body.appendChild(hint);
  const missing = () => !!form && form.missingRequired();
  const values = () => (form ? form.values() : {});

  // --- tabs (both sources only) ---
  const both = sources.file && sources.url;
  /** @type {any} */
  let tabs = null;
  if (both) {
    tabs = document.createElement('td-tabs');
    tabs.className = 'td-media-picker-upload__tabs';
    tabs.setAttribute('size', 'sm');
    tabs.setAttribute('aria-label', t('uploadSources'));
    tabs.tabs = [
      { id: 'file', label: t('uploadTabFile'), icon: 'upload', panel: `${id}-file` },
      { id: 'url', label: t('uploadTabUrl'), icon: 'link', panel: `${id}-url` },
    ];
    body.appendChild(tabs);
  }

  // --- panels: one grid cell for both sources, so the dialog keeps one height across tabs (dcms2) ---
  const panels = document.createElement('div');
  panels.className = 'td-media-picker-upload__panels';
  body.appendChild(panels);

  // --- v0.93.0: files dropped on the picker, held until "Tải lên {n} tệp" (never uploaded on their own) ---
  /** @type {File[]} */
  let held = sources.file && Array.isArray(o.files) ? o.files.filter((f) => f && typeof f === 'object') : [];
  /** @type {HTMLElement|null} */
  let heldEl = null;
  /** @type {any} */
  let heldSubmit = null;
  let heldTitle = null;
  let heldList = null;
  function buildHeld() {
    heldEl = document.createElement('div');
    heldEl.className = 'td-media-picker-upload__held';
    heldEl.setAttribute('role', 'group');
    heldTitle = document.createElement('p');
    heldTitle.className = 'td-media-picker-upload__held-title';
    heldTitle.id = `${id}-held`;
    heldEl.setAttribute('aria-labelledby', heldTitle.id);
    heldList = document.createElement('ul');
    heldList.className = 'td-media-picker-upload__held-list';
    for (const f of held) {
      const li = document.createElement('li');
      li.className = 'td-media-picker-upload__held-item';
      const name = document.createElement('span');
      name.className = 'td-media-picker-upload__held-name';
      name.textContent = f.name; // user-controlled: text only
      name.title = f.name;
      const size = document.createElement('span');
      size.className = 'td-media-picker-upload__held-size';
      size.textContent = formatFileSize(f.size);
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'td-btn td-btn--ghost td-btn--sm td-media-picker-upload__held-remove';
      rm.setAttribute('aria-label', t('uploadHeldRemove', { name: f.name }));
      const icon = tdIcon('close', { size: 's' });
      if (icon) rm.appendChild(icon);
      rm.addEventListener('click', () => removeHeld(f, li));
      li.append(name, size, rm);
      heldList.appendChild(li);
    }
    heldSubmit = document.createElement('td-button');
    heldSubmit.className = 'td-media-picker-upload__held-submit';
    heldSubmit.setAttribute('variant', 'primary');
    heldSubmit.addEventListener('click', () => submitHeld());
    heldEl.append(heldTitle, heldList, heldSubmit);
    paintHeld();
    return heldEl;
  }
  function paintHeld() {
    if (!heldEl) return;
    heldTitle.textContent = t('uploadHeld', { n: held.length });
    heldSubmit.textContent = t('uploadHeldSubmit', { n: held.length });
  }
  function dropHeld() {
    if (!heldEl) return;
    heldEl.remove();
    heldEl = null;
    heldSubmit = null;
  }
  function removeHeld(file, li) {
    if (destroyed || closing) return;
    const items = [...heldList.children];
    const k = items.indexOf(li);
    held = held.filter((f) => f !== file);
    const had = li.contains(document.activeElement);
    li.remove();
    if (!held.length) {
      dropHeld();
      if (had) focusIn(dz);
      return;
    }
    paintHeld();
    if (had) {
      const next = heldList.children[k] || heldList.children[k - 1];
      focusIn(next || heldSubmit);
    }
  }
  function submitHeld() {
    if (destroyed || closing || !held.length || !dz) return;
    if (missing()) {
      syncGate();
      return;
    }
    // dz.addFiles() emits no files-change: the field values are captured here, per original File
    const v = values();
    for (const f of held) snapshots.set(f, { ...v });
    const files = held;
    held = [];
    const had = !!heldEl && heldEl.contains(document.activeElement);
    dropHeld();
    dz.addFiles(files);
    if (had) focusIn(dz);
  }
  /** the first empty visible required field, else the first field (focus on open with held files) */
  function firstField() {
    if (!form) return null;
    let first = null;
    for (const c of form.controls.values()) {
      if (!c.control || !c.visible) continue;
      if (!first) first = c.el;
      if (!c.descriptor.required) continue;
      const v = c.get();
      if (v === '' || v == null || (Array.isArray(v) && !v.length)) return c.el;
    }
    return first;
  }

  // --- file source ---
  /** @type {any} */
  let dz = null;
  /** @type {HTMLUListElement|null} */
  let notes = null;
  if (sources.file) {
    const panel = document.createElement('div');
    panel.className = 'td-media-picker-upload__panel';
    panel.setAttribute('data-source', 'file');
    panel.id = `${id}-file`;
    dz = document.createElement('td-dropzone');
    dz._uploadSlots = o.uploadSlots || null; // v0.93.0 (internal): the picker-wide pool, before any file
    dz._onBatchEnd = (r) => finishBatch(r); // v0.93.0 (internal): the dropzone's queue counts the batch
    dz.className = 'td-media-picker-upload__dropzone';
    if (up.multiple !== false) dz.setAttribute('multiple', '');
    if (up.accept) dz.setAttribute('accept', String(up.accept));
    if (up.maxSize) dz.setAttribute('max-size', String(up.maxSize));
    if (acceptLabel) dz.setAttribute('accept-label', acceptLabel);
    dz.imageResize = up.imageResize || null; // v0.90.0 (normalised by the picker)
    dz.setAttribute('prompt-title', t('uploadDropTitle'));
    dz.setAttribute('prompt-text', t('uploadDropText'));
    dz.setAttribute('hint-style', 'badges');
    dz.upload = (file, c) => uploadFile(file, c).then((res) => {
      uploaded(res.asset, res.deduplication, 'upload');
      return res;
    });
    // v0.90.0: fields captured when the file is added (before its optimisation), once per original File
    dz.addEventListener('files-change', (e) => {
      const added = e.detail && Array.isArray(e.detail.added) ? e.detail.added : [];
      for (const f of added) if (f && typeof f === 'object' && !snapshots.has(f)) snapshots.set(f, values());
    });
    panel.appendChild(dz);
    if (held.length) panel.insertBefore(buildHeld(), dz);
    notes = document.createElement('ul');
    notes.className = 'td-media-picker-upload__notes';
    notes.hidden = true;
    panel.appendChild(notes);
    panels.appendChild(panel);
  }

  // Stable height, robust to host resets: a reset such as Tailwind preflight's `[hidden] { display: none !important }`
  // collapses the inactive panel out of the shared grid cell, so the tallest panel height seen at the current width is
  // also kept as the container's min-height (CSSOM, CSP-safe). A width change starts over (content reflows).
  let panelsRO = null;
  if (sources.file && sources.url && typeof ResizeObserver === 'function') {
    let maxH = 0;
    let lastW = -1;
    const remember = () => {
      if (destroyed || !panels.isConnected) return;
      const w = panels.clientWidth;
      if (Math.abs(w - lastW) > 0.5) {
        lastW = w;
        maxH = 0;
      }
      let h = 0;
      for (const el of panels.children) {
        h = Math.max(h, /** @type {HTMLElement} */ (el).offsetHeight); // layout px (never the open scale transform); display:none → 0
      }
      if (h > maxH + 0.5) {
        maxH = h;
        panels.style.setProperty('min-height', `${Math.ceil(maxH)}px`);
      }
    };
    panelsRO = new ResizeObserver(remember);
    // also right before a tab switch (capture: td-tabs hides the current panel in its own handler)
    if (tabs) {
      tabs.addEventListener('click', remember, true);
      tabs.addEventListener('keydown', remember, true);
    }
  }

  // --- URL source ---
  /** @type {any} */
  let urlField = null;
  /** @type {any} */
  let submitBtn = null;
  /** @type {any} */
  let abortBtn = null;
  /** @type {any} */
  let progress = null;
  if (sources.url) {
    const panel = document.createElement('div');
    panel.className = 'td-media-picker-upload__panel';
    panel.setAttribute('data-source', 'url');
    panel.id = `${id}-url`;
    const desc = document.createElement('p');
    desc.className = 'td-media-picker-upload__desc';
    desc.textContent = acceptLabel ? t('urlDescription', { accept: acceptLabel }) : t('urlDescriptionAny');
    panel.appendChild(desc);
    const row = document.createElement('div');
    row.className = 'td-media-picker-upload__url-row';
    urlField = document.createElement('td-input-field');
    urlField.className = 'td-media-picker-upload__url';
    urlField.id = `${id}-url-field`;
    urlField.setAttribute('type', 'url');
    urlField.setAttribute('size', 'md');
    urlField.setAttribute('placeholder', t('urlPlaceholder'));
    urlField.setAttribute('inputmode', 'url');
    urlField.setAttribute('enterkeyhint', 'go');
    urlField.setAttribute('autocomplete', 'off');
    urlField.setAttribute('spellcheck', 'false');
    urlField.setAttribute('aria-label', t('urlLabel'));
    row.appendChild(urlField);
    panel.appendChild(row);
    const actions = document.createElement('div');
    actions.className = 'td-media-picker-upload__url-actions';
    submitBtn = document.createElement('td-button');
    submitBtn.className = 'td-media-picker-upload__submit';
    submitBtn.setAttribute('variant', 'primary');
    submitBtn.setAttribute('disabled', '');
    submitBtn.textContent = t('urlSubmit');
    actions.appendChild(submitBtn);
    abortBtn = document.createElement('td-button');
    abortBtn.className = 'td-media-picker-upload__abort';
    abortBtn.setAttribute('variant', 'ghost');
    abortBtn.textContent = t('urlAbort');
    abortBtn.hidden = true;
    actions.appendChild(abortBtn);
    panel.appendChild(actions);
    progress = document.createElement('td-progress');
    progress.className = 'td-media-picker-upload__progress';
    progress.setAttribute('size', 'sm');
    progress.setAttribute('label', t('urlProgress'));
    progress.hidden = true;
    panel.appendChild(progress);
    panels.appendChild(panel);
    if (panelsRO) for (const el of panels.children) panelsRO.observe(el);

    urlField.addEventListener('input', () => {
      if (urlField.getAttribute('error-text')) urlField.removeAttribute('error-text'); // never shown while typing
      syncGate();
    });
    urlField.addEventListener('focusout', (e) => {
      if (urlField.contains(/** @type {Node|null} */ (e.relatedTarget))) return;
      if (urlTask) return;
      showUrlCheck();
    });
    urlField.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      submitUrl();
    });
    submitBtn.addEventListener('click', () => submitUrl());
    abortBtn.addEventListener('click', () => abortUrl(true));
  }

  const urlValue = () => (urlField ? String(urlField.value ?? '') : '');
  const checkUrl = () => {
    const raw = urlValue();
    if (!raw.trim()) return { ok: false, code: 'empty' };
    try {
      const r = validateRemoteUrl(raw);
      return r && typeof r === 'object' ? r : { ok: false, code: 'invalid' };
    } catch {
      return { ok: false, code: 'invalid' };
    }
  };
  const urlErrorText = (code) => t(`urlError.${code}`) || t('urlError.invalid');
  /** blur / submit: show the check's message (nothing for an empty field) */
  const showUrlCheck = () => {
    const r = checkUrl();
    if (r.ok || r.code === 'empty') {
      urlField.removeAttribute('error-text');
      return r;
    }
    urlField.setAttribute('error-text', urlErrorText(r.code));
    return r;
  };

  /** required fields missing → both sources locked + hint; URL submit enabled only for a valid URL, not while running */
  function syncGate() {
    if (destroyed) return;
    const lock = missing();
    hint.hidden = !lock;
    if (dz) dz.toggleAttribute('disabled', lock);
    if (heldSubmit) heldSubmit.toggleAttribute('disabled', lock);
    if (submitBtn) submitBtn.toggleAttribute('disabled', lock || !!urlTask || !checkUrl().ok);
  }

  // --- file upload hook (decision 21; v0.93.0 createAdapterUpload, the batch is counted by the dropzone's queue) ---
  const uploadFile = createAdapterUpload({
    adapter: o.adapter,
    context: o.context,
    ...collOpt,
    metaKeys,
    t,
    // v0.90.0: the snapshot taken when the file was added; else (no policy: the hook runs inside the add) now
    fieldsFor: (key) => {
      let fieldValues = snapshots.get(key);
      if (!fieldValues) {
        fieldValues = values();
        snapshots.set(key, fieldValues);
      }
      return fieldValues;
    },
    onFieldErrors: (n) => { if (form) form.applyErrors(n); },
    onError: (d) => reportError(d.operation, d),
    isClosed: () => closing || destroyed,
  });

  /** v0.93.0: `{ ok, fail, total }` of one batch (once, from the dropzone's UploadQueue) */
  function finishBatch(r) {
    if (destroyed || !r) return;
    const { ok, fail, total } = r;
    if (!total) return;
    if (ok) {
      try { TdToast.success(t('uploadDone', { ok, total }), { themeRoot: root }); } catch { /* ignore */ }
    }
    if (!fail && ok && !closing && !urlTask && !hasErrorRow()) finish();
  }

  /** one validated result → the picker; the exact-reused note stays visible in the dialog */
  function uploaded(asset, dedup, operation) {
    const reused = dedup.outcome === 'exact-reused';
    const text = t(reused ? 'reused' : 'uploaded', { name: asset.name });
    if (reused && notes && operation === 'upload') {
      const li = document.createElement('li');
      li.className = 'td-media-picker-upload__note';
      li.textContent = text;
      notes.appendChild(li);
      notes.hidden = false;
    }
    announce(text);
    try { if (typeof o.onUploaded === 'function') o.onUploaded(asset, dedup, operation); } catch (err) { console.error(err); }
  }

  function reportError(operation, n) {
    try {
      if (typeof o.onError === 'function') o.onError({ operation, code: n.code, retryable: n.retryable });
    } catch (err) { console.error(err); }
  }

  // --- URL upload (decision 22) ---
  function setUrlRunning(on) {
    if (!submitBtn) return;
    submitBtn.toggleAttribute('loading', on);
    abortBtn.hidden = !on;
    progress.hidden = !on;
    if (!on) progress.removeAttribute('value');
    urlField.toggleAttribute('readonly', on);
    syncGate();
  }

  function submitUrl() {
    if (closing || destroyed || urlTask || !urlField) return;
    if (missing()) {
      syncGate();
      return;
    }
    const r = showUrlCheck();
    if (!r.ok) return;
    const href = String(r.href);
    const task = { ctrl: new AbortController() };
    urlTask = task;
    const { signal } = task.ctrl;
    const fieldValues = values(); // captured when the task starts
    if (form) form.clearErrors();
    setUrlRunning(true);
    const onProgress = (p) => {
      if (urlTask !== task || !p || typeof p !== 'object') return;
      let pct = null;
      if (typeof p.percent === 'number' && Number.isFinite(p.percent)) pct = p.percent;
      else if (typeof p.loaded === 'number' && typeof p.total === 'number' && Number.isFinite(p.loaded) && p.total > 0) {
        pct = (p.loaded / p.total) * 100;
      }
      if (pct === null) return;
      progress.setAttribute('value', String(Math.round(Math.min(100, Math.max(0, pct)))));
    };
    let out;
    try {
      out = Promise.resolve(o.adapter.uploadFromUrl(href, { fields: fieldValues, context: o.context, ...collOpt, signal, onProgress }));
    } catch (err) {
      out = Promise.reject(err);
    }
    out.then((raw) => {
      if (urlTask !== task || destroyed || signal.aborted) return;
      urlTask = null;
      setUrlRunning(false);
      const res = normalizeUploadResult(raw, { safeUrl: safeMediaUrl, metadataKeys: metaKeys });
      if (!res) {
        console.warn('td-media-picker: malformed upload-url result (ignored)'); // never the raw result
        urlField.setAttribute('error-text', t('uploadError'));
        announce(t('uploadError'));
        return;
      }
      uploaded(res.asset, res.deduplication, 'upload-url');
      try { TdToast.success(t('urlDone'), { themeRoot: root }); } catch { /* ignore */ }
      urlField.value = '';
      urlField.removeAttribute('error-text');
      syncGate();
      if (!closing && !(dz && dz.uploading) && !hasErrorRow()) finish();
    }, (err) => {
      if (urlTask !== task || destroyed) return;
      const n = normalizeError(err, signal, { operation: 'upload-url' });
      urlTask = null;
      setUrlRunning(false);
      if (!n) return; // aborted: silent
      const own = n.fieldErrors.get('url');
      const rest = new Map([...n.fieldErrors].filter(([k]) => k !== 'url'));
      if (form && rest.size) form.applyErrors({ fieldErrors: rest });
      const text = (own && own.join(' ')) || n.userMessage || t(`error.${n.code}`) || t('uploadError');
      urlField.setAttribute('error-text', text);
      announce(text);
      reportError('upload-url', n);
    });
  }

  function abortUrl(focusField) {
    const task = urlTask;
    if (!task) return;
    urlTask = null;
    task.ctrl.abort();
    if (destroyed) return;
    setUrlRunning(false);
    if (focusField) focusIn(urlField);
  }

  // --- life cycle ---
  const focusIn = (el) => {
    if (!el) return;
    const target = el.querySelector('input, textarea, button:not([disabled]), [tabindex="0"]') || el;
    try { target.focus({ preventScroll: true }); } catch { /* ignore */ }
  };

  const handle = openDialogLayer({
    root,
    dialog,
    themeFrom: o.themeFrom || null, // v0.42.0 (ADR 0020): the picker root (bridged when the picker is)
    viewport: { root, scroller: nearestScroller(root) }, // v0.36.2: above the keyboard
    layer: LAYERS.modal,
    backdrop: root.querySelector('.td-modal__backdrop'),
    onEscape: () => { void close(); return true; },
    onOpened: () => {
      if (closing || destroyed) return;
      root.setAttribute('data-state', 'open');
      const active = document.activeElement;
      if (active && active !== dialog && root.contains(active)) return; // the user moved on
      if (!handle.layer.isTop()) return;
      if (heldEl) { // v0.93.0: dropped files held → the field to fill first, else the submit button
        focusIn(firstField() || heldSubmit);
        return;
      }
      if (tabs) focusIn(tabs);
      else if (urlField && !dz) focusIn(urlField);
      else if (dz) focusIn(dz);
    },
  });
  syncGate();

  const busy = () => !destroyed && (!!urlTask || !!(dz && dz.uploading));

  /** abort everything still running (rows removed, URL task aborted) */
  function abortAll() {
    abortUrl(false);
    if (dz) {
      try { dz.clear(); } catch { /* ignore */ }
    }
  }

  /** close without asking (phase 1 now; onClosed after the exit transition) */
  function finish() {
    if (closing || destroyed) return;
    closing = true;
    if (panelsRO) panelsRO.disconnect();
    abortAll();
    ctrl.abort();
    if (form) { try { form.destroy(); } catch { /* ignore */ } }
    handle.close('close').then(() => {
      if (destroyed) return;
      try { if (typeof o.onClosed === 'function') o.onClosed(); } catch (err) { console.error(err); }
    });
  }

  /** @returns {Promise<boolean>} */
  async function close() {
    if (destroyed || closing) return closing && !destroyed;
    if (confirm) return false;
    if (busy()) {
      const c = openCancelConfirm(t, root);
      confirm = c;
      const ok = await c.promise;
      if (confirm === c) confirm = null;
      if (!ok || destroyed || closing) return false;
    }
    finish();
    return true;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    closing = true;
    if (panelsRO) panelsRO.disconnect();
    if (urlTask) { urlTask.ctrl.abort(); urlTask = null; }
    if (dz) {
      try { dz.clear(); } catch { /* ignore */ }
    }
    ctrl.abort();
    if (form) { try { form.destroy(); } catch { /* ignore */ } }
    if (confirm) {
      const c = confirm;
      confirm = null;
      try { TdModal.closeById(c.id); } catch { /* ignore */ }
    }
    handle.release();
  }

  return { root, busy, close, destroy };
}

/**
 * "Huỷ các tệp đang tải?" — a TdModal.show() whose id we keep (destroy() closes exactly this instance). Text only.
 * @param {(key: string) => string} t
 * @returns {{ id: string, promise: Promise<boolean> }}
 */
function openCancelConfirm(t, themeRoot) {
  let resolve = (_v) => {};
  const promise = new Promise((r) => { resolve = r; });
  const body = document.createElement('p');
  body.className = 'td-media-picker-upload__confirm-text';
  body.textContent = t('uploadCancelMessage');
  const id = TdModal.show({
    title: t('uploadCancelTitle'),
    body,
    size: 'sm',
    themeRoot,
    actions: [
      { label: t('uploadCancelKeep'), variant: 'secondary', value: false },
      { label: t('uploadCancelConfirm'), variant: 'danger', value: true },
    ],
    onClose: (v) => resolve(v === true),
  });
  return { id, promise };
}
