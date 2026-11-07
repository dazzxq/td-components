import { TdFormElement, ssrContentNodes, ssrSamePart, ssrSameAttrs } from '../base/td-form-element.js';
import { ssrMarker } from '../base/td-base-element.js';
import { fillIconSlots, tdIcon } from '../icons/td-icon.js';
import { formatFileSize } from '../utils/dom-utils.js';
import { normalizeImageResizePolicy } from '../utils/image-resize.js';
import { UploadQueue, acceptsFile, parseFileSize } from '../utils/upload-queue.js';
import '../feedback/td-progress.js';

/** `{name}` placeholders from `vars`; unknown ones are kept as written. */
const format = (tpl, vars = {}) => String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

// v0.93.0: moved to utils/upload-queue.js, re-exported (public import path kept)
export { parseFileSize };

/**
 * v0.90.0: the grouped message of each optimisation error code (`TdDropzone.labels.optimizeError[code]`, unknown →
 * `default`). Five texts: unreadable / too large to process / format not optimisable / cannot reach the limits / failed.
 */
const UNREADABLE = 'Không đọc được ảnh';
const TOO_LARGE = 'Ảnh quá lớn để xử lý';
const NOT_OPTIMISABLE = 'Định dạng này không tối ưu được';
const CANNOT_FIT = 'Không giảm được xuống trần';
const FAILED = 'Tối ưu thất bại';

let seq = 0;

/**
 * `<td-dropzone>` — file picker with drag-and-drop (content layer → solid, dashed zone; the "choose" button is the
 * kit's secondary button). Form-associated: the selected files are submitted under `name` through
 * `ElementInternals.setFormValue(FormData)` (use `enctype="multipart/form-data"` and `name="files[]"` for PHP arrays).
 * Styles: td.css (`components/dropzone.css`).
 *
 *   <td-dropzone name="attachments[]" label="Tệp đính kèm" accept=".pdf,image/*" multiple max-size="5MB" max-files="3">
 *   </td-dropzone>
 *
 * A REAL `<input type="file">` lives inside (no `name`, not in the tab order): the "choose" button, a click on the
 * zone, or Enter/Space on the button open its picker. Dropping files on the component adds them. Files are checked
 * against `accept` (MIME `type/sub`, `type/*`, `.ext`), `max-size` and `max-files`; the rest are listed as rejected
 * (`TdDropzone.labels`). This filtering is a UX hint only — the SERVER must re-validate type, size and content.
 * File names are rendered with `textContent` only. File contents are never read; an object URL is created only for
 * image previews when `preview` is set (revoked on remove / reset / disconnect).
 *
 * Without `multiple` the component holds one file: a new pick replaces it. Form life cycle: reset → list, form value
 * and running uploads cleared (uploads aborted); `name` change → FormData rebuilt under the new name; effectively
 * disabled (`disabled` or an ancestor `<fieldset disabled>`) → no picker, drops ignored, remove buttons locked, not
 * submitted (native behaviour of disabled form-associated elements).
 *
 * v0.93.0: the per-file state (admission, optimisation, upload, retry) lives in an internal `UploadQueue`
 * (utils/upload-queue.js); this element keeps the DOM, form value, announcements and events. Behaviour unchanged.
 *
 * Upload hook (optional property): `el.upload = (file, { onProgress, signal }) => Promise` — called for every added
 * file; `onProgress(percent 0–100)` or `onProgress(loaded, total)` drives a per-file `<td-progress>`; removing the file
 * (or a form reset) aborts `signal`. Until the hook's first `onProgress` call the row is WAITING (indeterminate bar +
 * `labels.uploadWaiting`) — e.g. a file queued behind a site-side concurrency limit. Rejection = the file shows an
 * error state: the rejection's `message` when it is a non-empty string (rendered with `textContent`, capped at 200
 * characters — keep server messages user-safe), else `labels.uploadError`. An abort (remove / reset) shows no error.
 * Nothing is uploaded without a hook.
 *
 * v0.90.0 — client image resize (opt-in property `imageResize`, a policy of utils/image-resize.js; default `null` = the
 * v0.89 behaviour above, unchanged). With a policy every accepted file is queued (one module-global FIFO slot shared by
 * every dropzone / picker) and optimised before it counts: row `data-status` `queued` → `optimizing` → then `uploading`
 * → `done` | `error` with an upload hook, `selected` without one. Only optimised rows (or files sent as they are) are in
 * `files` / the FormData; queued / optimising rows → validity `customError` (`labels.pendingInvalid`), a row that could
 * not be processed → `customError` (`labels.failedInvalid`) until it is removed. `max-size` is not checked when the file
 * is added: images the kit handles use it as an OUTPUT cap (merged into the policy's `maxBytes` when smaller), other
 * files are checked on the original (`labels.rejectSize` on the row). The hook gets the optimised file (original name)
 * plus `optimization` and `originalFile` in its options. An upload error row offers "Thử lại" (`.td-dropzone__retry`):
 * the same optimised file goes to the hook again (no new optimisation). Removing a row aborts its optimisation (the
 * upload never starts).
 *
 * **SSR (v0.100.0, ADR 0012; contract `dropzone@1`):** php `td_dropzone()` element mode prints the host marked
 * `data-td-ssr="dropzone@1"` + EXACTLY the markup below for an empty dropzone (hint text filled), with the real input
 * carrying the no-JS-only attributes `name` / `required` (and `aria-labelledby` | `aria-label` + `aria-describedby`; no
 * `tabindex="-1"` / `aria-hidden="true"`: the input is the field before the upgrade, see `td-dropzone:not(:defined)` in
 * dropzone.css). Valid markup is adopted in place: the native input is NEVER rebuilt; the files already picked in it enter
 * the queue silently (no `input` / `change` / `files-change`), ElementInternals owns the form value + validity, the input
 * loses `name` / `required` / the labelling and gets the JS render's `tabindex="-1"` + `aria-hidden="true"`. Anything
 * else (another schema, extra / changed nodes or attributes) → safe render now; the files of its one native file input
 * still enter the queue and that input node is moved into the new render.
 *
 * Markup:
 *   <div class="td-dropzone" role="group" aria-labelledby="{id}-label" data-state="idle|dragover" [data-disabled]>
 *     [<span class="td-dropzone__label" id="{id}-label">…[<span class="td-field__required" aria-hidden="true"> *</span>]</span>]
 *     <input type="file" class="td-dropzone__input" tabindex="-1" aria-hidden="true" [accept] [multiple] [disabled]>
 *     <div class="td-dropzone__zone">
 *       <span class="td-dropzone__icon" aria-hidden="true"><svg class="td-icon" data-icon="upload"></span>
 *       <p class="td-dropzone__prompt"><span class="td-dropzone__text">Kéo thả file vào đây hoặc</span>
 *         <button type="button" class="td-dropzone__browse td-btn td-btn--secondary td-btn--sm">Chọn file</button></p>
 *       <p class="td-dropzone__hint" id="{id}-hint" [hidden]>Định dạng: {accept | accept-label} · Tối đa 5 MB mỗi file · Tối đa 3 file</p>
 *     </div>
 *     <ul class="td-dropzone__rejected" [hidden]><li class="td-dropzone__reject" data-reason="type|size|count">…</li></ul>
 *     <ul class="td-dropzone__list" aria-label="File đã chọn" [hidden]>
 *       <li class="td-dropzone__item" data-status="selected|queued|optimizing|uploading|done|error" [data-waiting]>
 *         [<img class="td-dropzone__thumb" alt="" src="blob:…">]
 *         <span class="td-dropzone__meta"><span class="td-dropzone__name">…</span><span class="td-dropzone__size">…</span>
 *           [<span class="td-dropzone__status">…</span>]</span>
 *         [<td-progress class="td-dropzone__progress" size="sm" [value] label>]   (no value while waiting)
 *         [<button type="button" class="td-dropzone__retry td-btn td-btn--ghost td-btn--sm" aria-label="Thử lại {name}">Thử lại</button>]   (v0.90.0)
 *         <button type="button" class="td-dropzone__remove" aria-label="Xoá {name}"><svg data-icon="close"></button></li>
 *     </ul>
 *     <span class="td-sr-only" aria-live="polite"></span>
 *   </div>
 *
 * @element td-dropzone
 * @attr {string} name - Form field name (each file appended under it)
 * @attr {string} label - Visible label (names the group)
 * @attr {string} accept - Allowed types: comma list of `type/sub`, `type/*`, `.ext` (as the native attribute)
 * @attr {string} accept-label - Hint text for the formats: absent → the `accept` list as written; non-empty (e.g.
 *   "Ảnh JPEG") → replaces `{accept}` in `labels.hintAccept`; empty → the format part is dropped (size / count stay).
 *   Display only: filtering always follows `accept`.
 * @attr {boolean} multiple - Allow several files (without it a new file replaces the current one)
 * @attr {string} max-size - Max size per file: bytes or `500KB` / `5MB` / `1GB` (1024-based)
 * @attr {number} max-files - Max number of files (with `multiple`)
 * @attr {boolean} preview - Show a thumbnail for image files (object URL; CSP needs `img-src blob:`)
 * @attr {boolean} required - At least one file
 * @attr {boolean} disabled
 * @attr {string} error-text - Error message (error contract, like the other fields)
 * @attr {string} prompt-title - v0.33.0 presentation (text only): when it or `prompt-text` is non-empty the zone is
 *   STACKED (`.td-dropzone--stacked`): large upload icon → `<p class="td-dropzone__title">` → `<p class="td-dropzone__subtext">`
 *   → the "choose" button (kept for keyboard reach; the whole zone stays clickable). Neither set → the v0.32 markup.
 * @attr {string} prompt-text - v0.33.0: the muted sub-line under `prompt-title` (text only)
 * @attr {string} hint-style - v0.33.0: `badges` → the hint is one `<span class="td-badge td-dropzone__badge">` per part
 *   (formats: `accept-label` or derived from `accept` · `labels.badgeSize` · `labels.badgeCount`) inside
 *   `<div class="td-dropzone__hint td-dropzone__hint--badges">`; anything else → the joined `<p>` hint.
 * @fires files-change - User add / drop / remove: detail `{ files: File[], rejected: { file, reason, message }[],
 *   added: File[] }` (v0.90.0 `added`: the original Files accepted by this add, emitted before any optimisation runs; `[]`
 *   on remove; `files` = the files ready to submit)
 */
export class TdDropzone extends TdFormElement {
  /** Default texts (Vietnamese); override per site: `TdDropzone.labels.browse = 'Choose files'`. */
  static labels = {
    prompt: 'Kéo thả file vào đây hoặc',
    browse: 'Chọn file',
    list: 'File đã chọn',
    hintAccept: 'Định dạng: {accept}',
    hintSize: 'Tối đa {size} mỗi file',
    hintCount: 'Tối đa {n} file',
    remove: 'Xoá {name}',
    rejectType: '{name}: định dạng không được chấp nhận',
    rejectSize: '{name}: lớn hơn {max}',
    rejectCount: '{name}: vượt quá số file cho phép ({n})',
    added: 'Đã thêm {n} file',
    removed: 'Đã xoá {name}',
    uploading: 'Đang tải lên…',
    uploaded: 'Đã tải lên',
    uploadError: 'Tải lên thất bại',
    uploadWaiting: 'Đang chờ…',
    progress: 'Tải lên {name}',
    required: 'Vui lòng chọn file.',
    badgeAccept: '{accept}',
    badgeSize: 'Tối đa {size}',
    badgeCount: 'Tối đa {n} file',
    // v0.90.0 — image resize (`imageResize` policy only)
    queued: 'Đang chờ tối ưu…',
    optimizing: 'Đang tối ưu ảnh…',
    sizeChange: '{from} → {to}',
    optimized: 'Đã giảm {name} từ {from} xuống {to}',
    retry: 'Thử lại',
    retryLabel: 'Thử lại {name}',
    pendingInvalid: 'Đang tối ưu ảnh, vui lòng chờ',
    failedInvalid: 'Có tệp không xử lý được, hãy gỡ ra',
    optimizeError: {
      'empty-file': UNREADABLE,
      'invalid-image': UNREADABLE,
      'header-limit': UNREADABLE,
      'decode-failed': UNREADABLE,
      'decode-unsupported': UNREADABLE,
      'input-too-large': TOO_LARGE,
      'input-dimensions-too-large': TOO_LARGE,
      'canvas-limit': TOO_LARGE,
      'format-not-transformable': NOT_OPTIMISABLE,
      'special-content-transform-required': NOT_OPTIMISABLE,
      'metadata-policy-unsupported': NOT_OPTIMISABLE,
      'resize-unsupported': NOT_OPTIMISABLE,
      'cannot-satisfy-limits': CANNOT_FIT,
      'metadata-too-large': CANNOT_FIT,
      'encode-failed': FAILED,
      'output-type-mismatch': FAILED,
      'processor-failed': FAILED,
      'processor-invalid-result': FAILED,
      default: FAILED,
    },
  };

  static get observedAttributes() {
    return [...super.observedAttributes, 'label', 'accept', 'accept-label', 'multiple', 'max-size', 'max-files', 'preview', 'error-text',
      'prompt-title', 'prompt-text', 'hint-style'];
  }

  static get booleanAttributes() {
    return [...super.booleanAttributes, 'multiple', 'preview'];
  }

  static get errorContract() { return true; }

  constructor() {
    super();
    this._uid = ++seq;
    /**
     * @private v0.93.0 the per-file state machine (utils/upload-queue.js). Its items (`_items`): `file` = what is
     * submitted / uploaded (the optimised file once ready), `original` = the File added; `policy` = the image-resize
     * policy at admission (null = v0.89 flow), `ready` = in `files` / FormData, `blocked` = could not be processed
     * (never submitted), `uploadFailed` = error from the upload hook (retry).
     * Items also carry `url` (preview object URL) and `el` (row) of this element.
     * @type {UploadQueue}
     */
    this._queue = new UploadQueue(this._queueOptions());
    /** @private rejected files of the latest add */
    this._rejected = [];
    /** @private upload hook */
    this._upload = null;
    /** @private v0.90.0 normalised image-resize policy (null = off) */
    this._imageResize = null;
    /** @internal v0.90.0: called with the original File when a row fails optimisation (the picker's upload dialog) */
    this._onOptimizeError = null;
    /** @internal v0.93.0: a createUploadSlots() pool shared by the picker (null = unlimited, the standalone behaviour) */
    this._uploadSlots = null;
    /** @internal v0.93.0: `({ ok, fail, total }) => void`, once per upload batch (the picker's upload dialog) */
    this._onBatchEnd = null;
  }

  /** @private v0.93.0 the queue reads the current attributes / properties on every use */
  _queueOptions() {
    const self = this;
    const call = (fn, ...args) => {
      if (typeof fn !== 'function') return;
      try {
        fn(...args);
      } catch (e) {
        console.error(e);
      }
    };
    return {
      get accept() { return self.getAttribute('accept'); },
      get maxSize() { return parseFileSize(self.getAttribute('max-size')); },
      get limit() { return self._limit(); },
      get single() { return !self.hasAttribute('multiple'); },
      get policy() { return self._imageResize; },
      get upload() { return self._upload; },
      get labels() { return TdDropzone.labels; },
      slots: () => self._uploadSlots,
      onChange: (item) => self._paintItem(item),
      onValue: () => self._syncForm(),
      onOptimized: (item) => {
        const o = item.optimization;
        self._announce(format(TdDropzone.labels.optimized, {
          name: item.original.name, from: formatFileSize(o.original.size), to: formatFileSize(o.output.size),
        }));
      },
      onOptimizeError: (original) => call(self._onOptimizeError, original),
      onRemoved: (item) => self._revoke(item),
      onBatchEnd: (r) => call(self._onBatchEnd, r),
    };
  }

  /** @private v0.93.0 the queue's items (`{ id, file, original, status, … }` + `url` / `el` of this element) */
  get _items() { return this._queue.items; }

  // --- Public API ---

  /** @type {((file: File, ctx: { onProgress: Function, signal: AbortSignal }) => Promise<*>)|null} */
  get upload() { return this._upload; }
  set upload(fn) { this._upload = typeof fn === 'function' ? fn : null; }

  /**
   * v0.90.0 — opt-in client image resize policy (utils/image-resize.js `normalizeImageResizePolicy`): normalised and
   * frozen on set; an invalid value throws a TypeError synchronously and the previous policy stays. `null` = off. Applies
   * to files added afterwards.
   * @type {Readonly<object>|null}
   */
  get imageResize() { return this._imageResize; }
  set imageResize(policy) { this._imageResize = normalizeImageResizePolicy(policy); }

  /** @type {File[]} the files ready to submit (a copy; v0.90.0: optimised ones, rows still optimising are left out) */
  get files() { return this._items.filter((i) => i.ready).map((i) => i.file); }

  /** @type {boolean} an upload is running (v0.90.0: or a row is queued / optimising) */
  get uploading() { return this._queue.busy; }

  /** @returns {File[]} */
  getValue() { return this.files; }

  /** Replace the selection (filters apply; no event). @param {Iterable<File>} files */
  setValue(files) {
    this._clearItems();
    return this.addFiles(files || []);
  }

  /**
   * Add files as if picked (filters + upload hook apply; no event — only user actions emit `files-change`).
   * @param {Iterable<File>} files
   * @returns {{ accepted: File[], rejected: { file: File, reason: string, message: string }[] }}
   */
  addFiles(files) {
    return this._add([...(files || [])].filter((f) => f instanceof File));
  }

  /**
   * Remove one file (index or the File itself — v0.90.0 the original or its optimised copy; aborts its upload; no
   * event). @param {number|File} which
   */
  removeFile(which) {
    const item = typeof which === 'number' ? this._items[which]
      : this._items.find((i) => i.file === which || i.original === which);
    if (item) this._removeItem(item);
  }

  /** Remove every file (aborts uploads; no event). */
  clear() {
    this._clearItems();
    this._rejected = [];
    this._refresh();
  }

  /** Open the native file picker (no-op while disabled). */
  openPicker() {
    if (this._effectiveDisabled) return;
    const input = this.querySelector('.td-dropzone__input');
    if (input) input.click();
  }

  // --- Life cycle ---

  connectedCallback() {
    super.connectedCallback(); // v0.54.1: the base replays an `upload` assigned before the upgrade
    if (!this._bound) this._bind();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._bound = false;
    // Object URLs are recreated on the next render if the element comes back.
    for (const item of this._items) this._revoke(item);
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (this._helperAttr(name, oldVal, newVal)) return; // v0.54.0: helper-text in place (TdFormElement)
    if (name === 'name') {
      if (oldVal !== newVal && this._initialized) this._syncForm(); // no re-render: rebuild FormData only
      return;
    }
    super.attributeChangedCallback(name, oldVal, newVal);
  }

  render() {
    const L = TdDropzone.labels;
    const esc = (s) => this.escapeHtml(s);
    const id = esc(this.id);
    const label = (this.getAttribute('label') || '').trim();
    const dis = this._effectiveDisabled;
    const accept = this.getAttribute('accept');
    const title = (this.getAttribute('prompt-title') || '').trim();
    const sub = (this.getAttribute('prompt-text') || '').trim();
    const stacked = !!(title || sub);
    const badges = this._badgeHint();
    const labelHtml = label
      ? `<span class="td-dropzone__label" id="${id}-label">${esc(label)}`
        + `${this.hasAttribute('required') ? '<span class="td-field__required" aria-hidden="true"> *</span>' : ''}</span>`
      : '';
    const browse = `<button type="button" class="td-dropzone__browse td-btn td-btn--secondary td-btn--sm"${dis ? ' disabled' : ''}>${esc(L.browse)}</button>`;
    // v0.33.0 presentation API (additive): without prompt-title / prompt-text / hint-style="badges" the markup below is
    // byte-for-byte the v0.32 one.
    const prompt = stacked
      ? '<span class="td-dropzone__icon" data-td-icon="upload" data-td-icon-size="64" aria-hidden="true"></span>'
        + (title ? `<p class="td-dropzone__title">${esc(title)}</p>` : '')
        + (sub ? `<p class="td-dropzone__subtext">${esc(sub)}</p>` : '')
        + `<p class="td-dropzone__prompt">${browse}</p>`
      : '<span class="td-dropzone__icon" data-td-icon="upload" aria-hidden="true"></span>'
        + `<p class="td-dropzone__prompt"><span class="td-dropzone__text">${esc(L.prompt)}</span> ${browse}</p>`;
    const hint = badges
      ? `<div class="td-dropzone__hint td-dropzone__hint--badges" id="${id}-hint" hidden></div>`
      : `<p class="td-dropzone__hint" id="${id}-hint" hidden></p>`;
    return `<div class="${stacked ? 'td-dropzone td-dropzone--stacked' : 'td-dropzone'}" role="group"${label ? ` aria-labelledby="${id}-label"` : ''} data-state="idle"${dis ? ' data-disabled=""' : ''}>`
      + labelHtml
      + `<input type="file" class="td-dropzone__input" tabindex="-1" aria-hidden="true"${accept ? ` accept="${esc(accept)}"` : ''}`
      + `${this.hasAttribute('multiple') ? ' multiple' : ''}${dis ? ' disabled' : ''}>`
      + '<div class="td-dropzone__zone">'
      + prompt
      + hint
      + '</div>'
      + '<ul class="td-dropzone__rejected" hidden></ul>'
      + `<ul class="td-dropzone__list" aria-label="${esc(L.list)}" hidden></ul>`
      + '<span class="td-sr-only td-dropzone__live" aria-live="polite"></span>'
      + '</div>';
  }

  afterRender() {
    fillIconSlots(this);
    this._fillHint(this.querySelector('.td-dropzone__hint'));
    const root = this.querySelector('.td-dropzone');
    this._applyAccessibleName(root, !!(this.getAttribute('label') || '').trim());
    this._refresh();
    this._applyErrorState();
  }

  /** @private the hint element's content: the joined text, or one badge per part (also used on the SSR template) */
  _fillHint(hint) {
    if (this._badgeHint()) {
      // One badge per part, text only; a space between them keeps the accessible description readable.
      const nodes = [];
      for (const part of this._hintParts(true)) {
        if (nodes.length) nodes.push(document.createTextNode(' '));
        const span = document.createElement('span');
        span.className = 'td-badge td-dropzone__badge';
        span.textContent = part;
        nodes.push(span);
      }
      hint.replaceChildren(...nodes);
      hint.hidden = nodes.length === 0;
    } else {
      const text = this._hintText();
      hint.textContent = text;
      hint.hidden = !text;
    }
  }

  _focusTarget() {
    return this.querySelector('.td-dropzone__browse');
  }

  _errorHost() {
    return this.querySelector('.td-dropzone') || this;
  }

  _describedByIds() {
    const hint = this.querySelector('.td-dropzone__hint');
    return [...(hint && !hint.hidden ? [hint.id] : []), ...this._helperDescribedByIds()];
  }

  /** Form reset: clear the list, abort uploads, forget rejections. */
  _restoreDefaults() {
    this.clear();
  }

  /** Files can't be restored from a saved state (bfcache / autofill): keep the current list. */
  _restoreState() {}

  // --- SSR (contract dropzone@1; v0.100.0, ADR 0012) ---

  /**
   * Marker `dropzone@1` + EXACTLY the markup php td_dropzone() element mode prints → adopt in place; anything else (another
   * schema, changed / extra nodes or attributes) → safe render NOW. In both cases the files already picked in the
   * server-rendered native input are kept: they enter the queue silently (hydrateExisting / _restoreSsrState).
   * @returns {boolean}
   */
  canHydrate() {
    const m = ssrMarker(this);
    if (!m || m.name !== 'dropzone') return false;
    this.removeAttribute('data-td-ssr'); // consumed (not `hydratable`: a re-connect renders again)
    const gate = m.schema === 1 ? this._ssrGate() : null;
    if (gate) {
      this._ssrAdopt = gate;
      return true;
    }
    const inputs = [...this.querySelectorAll('input')].filter((i) => i.type === 'file');
    const input = inputs.length === 1 ? inputs[0] : null;
    const active = this.ownerDocument.activeElement;
    this._ssrRestore = { input, files: input ? [...input.files] : [], refocus: !!active && active !== this && this.contains(active) };
    this._ssrFreshRender = true;
    return false;
  }

  /**
   * Adopt the markup: the native input stays (same node). Its live FileList is captured, the input gives up the no-JS-only
   * attributes (`name` / `required` / labelling) FIRST, THEN the files enter the queue (silently: no event; the
   * ElementInternals form value + validity are set from them; one FormData entry per file even for an early upload hook).
   * The input gets the JS render's `tabindex="-1"` + `aria-hidden="true"` and is emptied (the queue owns the files).
   */
  hydrateExisting() {
    const input = this._ssrAdopt;
    this._ssrAdopt = null;
    if (!input) return;
    const hadFocus = this.ownerDocument.activeElement === input;
    const files = [...input.files];
    // the native input stops owning the field BEFORE the queue does (an early upload hook sees one FormData entry)
    for (const a of ['name', 'required', 'aria-labelledby', 'aria-label', 'aria-describedby']) input.removeAttribute(a);
    this._adoptFiles(files);
    input.setAttribute('tabindex', '-1');
    input.setAttribute('aria-hidden', 'true');
    input.value = '';
    if (hadFocus) this._focusTarget()?.focus({ preventScroll: true }); // the input is hidden from now on
  }

  /** @protected refused markup was replaced: the old native input node moves into the render, its files enter the queue */
  _restoreSsrState(s) {
    const old = s.input;
    const fresh = this.querySelector('.td-dropzone__input');
    if (old && fresh && old.type === 'file' && fresh !== old) {
      // the server's attributes (handlers, name, form overrides…) are not trusted: only the render's own remain
      for (const a of [...old.attributes]) if (a.name !== 'type') old.removeAttribute(a.name);
      for (const a of [...fresh.attributes]) if (a.name !== 'type') old.setAttribute(a.name, a.value);
      old.value = '';
      fresh.replaceWith(old);
    }
    this._adoptFiles(s.files || []);
    if (s.refocus) this._focusTarget()?.focus({ preventScroll: true });
  }

  /** @private files already chosen before the upgrade: into the queue, silently (no event, no announcement) */
  _adoptFiles(files) {
    const list = files.filter((f) => f instanceof File);
    if (list.length) this._add(list);
  }

  /**
   * @private The strict gate. The host holds ONE `div.td-dropzone` (+ the PHP helper note inside it, last) equal to
   * render() with the hint filled, whose only difference is the one native input (the no-JS attributes).
   * @returns {HTMLInputElement|null} the input to adopt
   */
  _ssrGate() {
    if (this.errorMessage) return null; // the contract has no error note
    const nodes = ssrContentNodes(this);
    if (nodes.length !== 1 || nodes[0].nodeType !== 1) return null;
    const root = /** @type {HTMLElement} */ (nodes[0]);
    const tpl = document.createElement('template');
    tpl.innerHTML = this.render();
    const want = tpl.content.firstElementChild;
    if (!want || root.localName !== 'div' || root.namespaceURI !== want.namespaceURI || !ssrSameAttrs(root, want)) return null;
    this._fillHint(want.querySelector('.td-dropzone__hint'));
    const kids = ssrContentNodes(root);
    const rest = this._ssrWithoutHelperNote(kids);
    if (!rest) return null;
    const clone = /** @type {HTMLElement} */ (root.cloneNode(true));
    if (rest.length !== kids.length) clone.lastElementChild?.remove(); // the helper note (the base keeps it)
    const inputs = clone.querySelectorAll('input');
    const live = root.querySelector('input');
    const wantInput = want.querySelector('input');
    if (inputs.length !== 1 || !live || !wantInput || !this._ssrInputOk(live, wantInput, want)) return null;
    inputs[0].replaceWith(wantInput.cloneNode(true));
    // an icon slot is drawn by fillIconSlots() on bind: anything inside it now is not ours
    if ([...clone.querySelectorAll('[data-td-icon]')].some((e) => e.childNodes.length && (e.firstElementChild || e.textContent.trim()))) return null;
    return ssrSamePart(clone, want) ? /** @type {HTMLInputElement} */ (live) : null;
  }

  /**
   * @private the server's native input = render()'s input MINUS `tabindex` / `aria-hidden`, PLUS `name` (the host's),
   * `required`, its accessible name (`aria-labelledby` the label | `aria-label`) and `aria-describedby` (hint, helper note).
   */
  _ssrInputOk(live, wantInput, want) {
    if (!(live instanceof HTMLInputElement) || live.type !== 'file' || live.namespaceURI !== wantInput.namespaceURI
      || live.childNodes.length) return false;
    const exp = wantInput.cloneNode(false);
    exp.removeAttribute('tabindex');
    exp.removeAttribute('aria-hidden');
    const name = this.getAttribute('name');
    if (name) exp.setAttribute('name', name);
    if (this.hasAttribute('required')) exp.setAttribute('required', '');
    if ((this.getAttribute('label') || '').trim()) exp.setAttribute('aria-labelledby', `${this.id}-label`);
    else exp.setAttribute('aria-label', this.getAttribute('aria-label') || String(TdDropzone.labels.browse ?? ''));
    const hint = want.querySelector('.td-dropzone__hint');
    const ids = [...(hint && !hint.hidden ? [hint.id] : []), ...(this.helperMessage ? [`${this.id}-note`] : [])];
    if (ids.length) exp.setAttribute('aria-describedby', ids.join(' '));
    return ssrSameAttrs(live, exp);
  }

  // --- Private ---

  /** @private Host-level listeners, once per connection (event delegation survives re-renders). */
  _bind() {
    this._bound = true;
    this.listen(this, 'click', (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t || t.closest('.td-dropzone__input')) return;
      const retry = t.closest('.td-dropzone__retry');
      if (retry) {
        if (this._effectiveDisabled) return;
        const li = retry.closest('.td-dropzone__item');
        const item = this._items.find((i) => String(i.id) === li?.getAttribute('data-id'));
        if (item) this._retry(item);
        return;
      }
      const remove = t.closest('.td-dropzone__remove');
      if (remove) {
        if (this._effectiveDisabled) return;
        const li = remove.closest('.td-dropzone__item');
        const item = this._items.find((i) => String(i.id) === li?.getAttribute('data-id'));
        if (item) this._removeUser(item);
        return;
      }
      if (t.closest('.td-dropzone__zone')) this.openPicker();
    });
    // The inner input is an implementation detail: its events stay inside; the host emits `files-change`.
    const onInput = (e) => {
      if (!(e.target instanceof HTMLInputElement) || !e.target.classList.contains('td-dropzone__input')) return;
      e.stopPropagation();
      if (e.type !== 'change') return;
      const files = [...(e.target.files || [])];
      e.target.value = '';
      if (files.length && !this._effectiveDisabled) this._addUser(files);
    };
    this.listen(this, 'change', onInput);
    this.listen(this, 'input', onInput);
    // Drag and drop. dragover/drop are ALWAYS default-prevented (else the browser opens the dropped file).
    const hasFiles = (e) => !!e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    const setState = (s) => this.querySelector('.td-dropzone')?.setAttribute('data-state', s);
    const onOver = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (this._effectiveDisabled) {
        e.dataTransfer.dropEffect = 'none';
        return;
      }
      e.dataTransfer.dropEffect = 'copy';
      setState('dragover');
    };
    this.listen(this, 'dragenter', onOver);
    this.listen(this, 'dragover', onOver);
    this.listen(this, 'dragleave', (e) => {
      if (e.relatedTarget instanceof Node && this.contains(e.relatedTarget)) return;
      setState('idle');
    });
    this.listen(this, 'drop', (e) => {
      if (!e.dataTransfer) return;
      e.preventDefault();
      setState('idle');
      if (this._effectiveDisabled) return;
      const files = [...(e.dataTransfer.files || [])];
      if (files.length) this._addUser(files);
    });
  }

  /** @private */
  _accepts(file) {
    return acceptsFile(file, this.getAttribute('accept'));
  }

  /** @private @returns {number} Infinity = no limit */
  _limit() {
    if (!this.hasAttribute('multiple')) return 1;
    const n = parseInt(this.getAttribute('max-files') ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : Infinity;
  }

  /** @private `hint-style="badges"` (v0.33.0) */
  _badgeHint() {
    return (this.getAttribute('hint-style') || '').trim().toLowerCase() === 'badges';
  }

  /**
   * @private The hint parts (formats · size · count). `badges` → the badge texts: formats without the "Định dạng:"
   * prefix and, without `accept-label`, derived from `accept` (`.pdf` → PDF, `image/svg+xml` → SVG, `image/*` as written).
   * @param {boolean} [badges] @returns {string[]}
   */
  _hintParts(badges = false) {
    const L = TdDropzone.labels;
    const parts = [];
    const tokens = (this.getAttribute('accept') || '').split(',').map((t) => t.trim()).filter(Boolean);
    if (tokens.length) {
      // accept-label: absent → the raw list; non-empty → friendly text; empty → no format part at all.
      const friendly = this.hasAttribute('accept-label') ? (this.getAttribute('accept-label') || '').trim() : null;
      if (badges) {
        const list = friendly ?? [...new Set(tokens.map((t) => {
          if (t.startsWith('.')) return t.slice(1).toUpperCase();
          const sub = t.split('/')[1] || '';
          return sub && sub !== '*' ? sub.split('+')[0].toUpperCase() : t;
        }))].join(', ');
        if (list) parts.push(format(L.badgeAccept, { accept: list }));
      } else if (friendly == null) parts.push(format(L.hintAccept, { accept: tokens.join(', ') }));
      else if (friendly) parts.push(format(L.hintAccept, { accept: friendly }));
    }
    const max = parseFileSize(this.getAttribute('max-size'));
    if (max) parts.push(format(badges ? L.badgeSize : L.hintSize, { size: formatFileSize(max) }));
    const limit = this._limit();
    if (limit !== Infinity && limit > 1) parts.push(format(badges ? L.badgeCount : L.hintCount, { n: limit }));
    return parts;
  }

  /** @private */
  _hintText() {
    return this._hintParts().join(' · ');
  }

  /**
   * @private Filter + add. Without `multiple` the first acceptable file replaces the current one. v0.90.0: with an
   * `imageResize` policy `max-size` is not checked here (the optimisation job does it) and `onAdded` runs before any job
   * starts (no policy: after the upload hooks started, as in v0.89). v0.93.0: the queue does the work.
   * @param {File[]} files
   * @param {((accepted: File[], rejected: object[]) => void)|null} [onAdded]
   */
  _add(files, onAdded = null) {
    const { accepted, rejected } = this._queue.admit(files, {
      admitted: (_accepted, rej) => {
        this._rejected = rej;
        this._refresh();
      },
      added: onAdded,
    });
    return { accepted, rejected };
  }

  /** @private user pick / drop: add + announce + event */
  _addUser(files) {
    this._add(files, (accepted, rejected) => {
      const L = TdDropzone.labels;
      const parts = [];
      if (accepted.length) parts.push(format(L.added, { n: accepted.length }));
      for (const r of rejected) parts.push(r.message);
      this._announce(parts.join('. '));
      this.emit('files-change', { files: this.files, rejected: rejected.map((r) => ({ ...r })), added: [...accepted] });
    });
  }

  /** @private user remove button */
  _removeUser(item) {
    const index = this._items.indexOf(item);
    this._removeItem(item);
    this._announce(format(TdDropzone.labels.removed, { name: item.file.name }));
    // Focus the next remove button (or the previous, or the choose button) so keyboard users keep their place.
    const btns = [...this.querySelectorAll('.td-dropzone__remove')];
    const next = btns[Math.min(index, btns.length - 1)] || this._focusTarget();
    if (next) next.focus();
    this.emit('files-change', { files: this.files, rejected: [], added: [] });
  }

  /** @private */
  _removeItem(item) {
    if (this._queue.remove(item)) this._refresh(); // aborts + revokes (onRemoved)
  }

  /** @private abort + revoke everything, empty the list (no render) */
  _clearItems() {
    this._queue.clear();
  }

  /** @private */
  _revoke(item) {
    if (item.url) {
      URL.revokeObjectURL(item.url);
      item.url = null;
    }
  }

  /** @private */
  _announce(text) {
    const live = this.querySelector('.td-dropzone__live');
    if (live) live.textContent = text;
  }

  /** @private Rebuild the rejected list + file list from state, then the form value. */
  _refresh() {
    if (!this._initialized) return;
    const L = TdDropzone.labels;
    const rej = this.querySelector('.td-dropzone__rejected');
    if (rej) {
      rej.replaceChildren(...this._rejected.map((r) => {
        const li = document.createElement('li');
        li.className = 'td-dropzone__reject';
        li.setAttribute('data-reason', r.reason);
        li.textContent = r.message; // text only: file names are user-controlled
        return li;
      }));
      rej.hidden = this._rejected.length === 0;
    }
    const list = this.querySelector('.td-dropzone__list');
    if (list) {
      list.setAttribute('aria-label', String(L.list ?? ''));
      list.replaceChildren(...this._items.map((item) => this._renderItem(item)));
      list.hidden = this._items.length === 0;
    }
    this._syncForm();
  }

  /** @private one list row (DOM API only; the name is text) */
  _renderItem(item) {
    const L = TdDropzone.labels;
    const li = document.createElement('li');
    li.className = 'td-dropzone__item';
    li.setAttribute('data-id', String(item.id));
    const wantPreview = this.hasAttribute('preview') && /^image\//i.test(item.file.type || '');
    if (!wantPreview) this._revoke(item);
    if (wantPreview) {
      if (!item.url) item.url = URL.createObjectURL(item.file);
      const img = document.createElement('img');
      img.className = 'td-dropzone__thumb';
      img.alt = '';
      img.src = item.url;
      li.appendChild(img);
    }
    const meta = document.createElement('span');
    meta.className = 'td-dropzone__meta';
    const name = document.createElement('span');
    name.className = 'td-dropzone__name';
    name.textContent = item.file.name;
    name.title = item.file.name;
    const size = document.createElement('span');
    size.className = 'td-dropzone__size'; // text: _paintItem
    const status = document.createElement('span');
    status.className = 'td-dropzone__status';
    meta.append(name, size, status);
    li.appendChild(meta);
    const progress = document.createElement('td-progress');
    progress.className = 'td-dropzone__progress';
    progress.setAttribute('size', 'sm');
    progress.setAttribute('label', format(L.progress, { name: item.file.name }));
    li.appendChild(progress);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'td-dropzone__remove';
    btn.setAttribute('aria-label', format(L.remove, { name: item.file.name }));
    btn.disabled = this._effectiveDisabled;
    const icon = tdIcon('close', { size: 's' });
    if (icon) btn.appendChild(icon);
    li.appendChild(btn);
    item.el = li;
    this._paintItem(item);
    return li;
  }

  /** @private status text + progress bar of one row */
  _paintItem(item) {
    const li = item.el;
    if (!li) return;
    const L = TdDropzone.labels;
    li.setAttribute('data-status', item.status);
    // Waiting = the hook has not reported any progress yet (queued / not started): indeterminate bar.
    const waiting = item.status === 'uploading' && item.progress == null;
    li.toggleAttribute('data-waiting', waiting);
    // v0.90.0: an optimised file shows "30 MB → 4.2 MB"
    const opt = item.optimization;
    li.querySelector('.td-dropzone__size').textContent = opt && opt.changed && opt.output.size !== opt.original.size
      ? format(L.sizeChange, { from: formatFileSize(opt.original.size), to: formatFileSize(opt.output.size) })
      : formatFileSize(item.file.size);
    const status = li.querySelector('.td-dropzone__status');
    const text = waiting ? L.uploadWaiting : item.status === 'uploading' ? L.uploading : item.status === 'done' ? L.uploaded
      : item.status === 'queued' ? L.queued : item.status === 'optimizing' ? L.optimizing
        : item.status === 'error' ? (item.error || L.uploadError) : '';
    status.textContent = String(text ?? '');
    status.hidden = !text;
    const progress = li.querySelector('.td-dropzone__progress');
    // queued / optimizing: indeterminate bar; a file that could not be processed has no progress to show
    progress.hidden = item.status === 'selected' || !!item.blocked;
    if (item.progress == null) progress.removeAttribute('value');
    else progress.setAttribute('value', String(Math.round(item.progress)));
    const variant = item.status === 'done' ? 'success' : item.status === 'error' ? 'danger' : 'primary';
    progress.setAttribute('variant', variant);
    // v0.90.0: "Thử lại" on an upload error (policy rows with a hook only; never after an optimisation error)
    const canRetry = item.status === 'error' && !!item.uploadFailed && !!item.policy && !!this._upload;
    let retry = li.querySelector('.td-dropzone__retry');
    if (canRetry && !retry) {
      retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'td-dropzone__retry td-btn td-btn--ghost td-btn--sm';
      retry.textContent = String(L.retry ?? '');
      retry.setAttribute('aria-label', format(L.retryLabel, { name: item.file.name }));
      li.insertBefore(retry, li.querySelector('.td-dropzone__remove'));
    } else if (!canRetry && retry) {
      retry.remove();
      retry = null;
    }
    if (retry) retry.disabled = this._effectiveDisabled;
  }

  /** @private v0.90.0 "Thử lại": the same (optimised) file goes to the hook again; focus stays in the row */
  _retry(item) {
    if (item.status !== 'error' || !item.uploadFailed || !this._upload) return;
    const hadFocus = !!item.el && item.el.contains(document.activeElement);
    this._queue.retry(item);
    if (hadFocus) item.el.querySelector('.td-dropzone__remove')?.focus();
  }

  /**
   * @private Files → FormData under `name`; required → valueMissing. v0.90.0: only ready rows are submitted; a row
   * still queued / optimising, or one that could not be processed → customError.
   */
  _syncForm() {
    const L = TdDropzone.labels;
    const name = this.getAttribute('name');
    const ready = this._items.filter((i) => i.ready);
    let fd = null;
    if (name && ready.length) {
      fd = new FormData();
      for (const item of ready) fd.append(name, item.file, item.file.name);
    }
    this._setFormValue(fd);
    const anchor = this._focusTarget() || undefined;
    if (this._items.some((i) => i.status === 'queued' || i.status === 'optimizing')) {
      this._setValidity({ customError: true }, String(L.pendingInvalid ?? ''), anchor);
    } else if (this._items.some((i) => i.blocked)) {
      this._setValidity({ customError: true }, String(L.failedInvalid ?? ''), anchor);
    } else if (this.hasAttribute('required') && !ready.length) {
      this._setValidity({ valueMissing: true }, L.required, anchor);
    } else {
      this._setValidity({});
    }
  }
}

if (!customElements.get('td-dropzone')) {
  customElements.define('td-dropzone', TdDropzone);
}
