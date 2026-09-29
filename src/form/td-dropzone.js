import { TdFormElement } from '../base/td-form-element.js';
import { fillIconSlots, tdIcon } from '../icons/td-icon.js';
import { formatFileSize } from '../utils/dom-utils.js';
import '../feedback/td-progress.js';

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
 * Upload hook (optional property): `el.upload = (file, { onProgress, signal }) => Promise` — called for every added
 * file; `onProgress(percent)` or `onProgress(loaded, total)` drives a per-file `<td-progress>`; removing the file (or a
 * form reset) aborts `signal`. Rejection = the file shows an error state. Nothing is uploaded without a hook.
 *
 * Markup:
 *   <div class="td-dropzone" role="group" aria-labelledby="{id}-label" data-state="idle|dragover" [data-disabled]>
 *     [<span class="td-dropzone__label" id="{id}-label">…[<span class="td-field__required" aria-hidden="true"> *</span>]</span>]
 *     <input type="file" class="td-dropzone__input" tabindex="-1" aria-hidden="true" [accept] [multiple] [disabled]>
 *     <div class="td-dropzone__zone">
 *       <span class="td-dropzone__icon" aria-hidden="true"><svg class="td-icon" data-icon="upload"></span>
 *       <p class="td-dropzone__prompt"><span class="td-dropzone__text">Kéo thả file vào đây hoặc</span>
 *         <button type="button" class="td-dropzone__browse td-btn td-btn--secondary td-btn--sm">Chọn file</button></p>
 *       <p class="td-dropzone__hint" id="{id}-hint" [hidden]>Định dạng: … · Tối đa 5 MB mỗi file · Tối đa 3 file</p>
 *     </div>
 *     <ul class="td-dropzone__rejected" [hidden]><li class="td-dropzone__reject" data-reason="type|size|count">…</li></ul>
 *     <ul class="td-dropzone__list" aria-label="File đã chọn" [hidden]>
 *       <li class="td-dropzone__item" data-status="selected|uploading|done|error">
 *         [<img class="td-dropzone__thumb" alt="" src="blob:…">]
 *         <span class="td-dropzone__meta"><span class="td-dropzone__name">…</span><span class="td-dropzone__size">…</span>
 *           [<span class="td-dropzone__status">…</span>]</span>
 *         [<td-progress class="td-dropzone__progress" size="sm" value label>]
 *         <button type="button" class="td-dropzone__remove" aria-label="Xoá {name}"><svg data-icon="close"></button></li>
 *     </ul>
 *     <span class="td-sr-only" aria-live="polite"></span>
 *   </div>
 *
 * @element td-dropzone
 * @attr {string} name - Form field name (each file appended under it)
 * @attr {string} label - Visible label (names the group)
 * @attr {string} accept - Allowed types: comma list of `type/sub`, `type/*`, `.ext` (as the native attribute)
 * @attr {boolean} multiple - Allow several files (without it a new file replaces the current one)
 * @attr {string} max-size - Max size per file: bytes or `500KB` / `5MB` / `1GB` (1024-based)
 * @attr {number} max-files - Max number of files (with `multiple`)
 * @attr {boolean} preview - Show a thumbnail for image files (object URL; CSP needs `img-src blob:`)
 * @attr {boolean} required - At least one file
 * @attr {boolean} disabled
 * @attr {string} error-text - Error message (error contract, like the other fields)
 * @fires files-change - User add / drop / remove: detail `{ files: File[], rejected: { file, reason, message }[] }`
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
    progress: 'Tải lên {name}',
    required: 'Vui lòng chọn file.',
  };

  static get observedAttributes() {
    return [...super.observedAttributes, 'label', 'accept', 'multiple', 'max-size', 'max-files', 'preview', 'error-text'];
  }

  static get booleanAttributes() {
    return [...super.booleanAttributes, 'multiple', 'preview'];
  }

  static get errorContract() { return true; }

  constructor() {
    super();
    this._uid = ++seq;
    /** @private @type {Array<{ id: number, file: File, url: string|null, status: string, progress: number|null, controller: AbortController|null, result?: * }>} */
    this._items = [];
    /** @private rejected files of the latest add */
    this._rejected = [];
    /** @private upload hook */
    this._upload = null;
    /** @private */
    this._itemSeq = 0;
  }

  // --- Public API ---

  /** @type {((file: File, ctx: { onProgress: Function, signal: AbortSignal }) => Promise<*>)|null} */
  get upload() { return this._upload; }
  set upload(fn) { this._upload = typeof fn === 'function' ? fn : null; }

  /** @type {File[]} the selected files (a copy) */
  get files() { return this._items.map((i) => i.file); }

  /** @type {boolean} an upload is running */
  get uploading() { return this._items.some((i) => i.status === 'uploading'); }

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

  /** Remove one file (index or the File itself; aborts its upload; no event). @param {number|File} which */
  removeFile(which) {
    const item = typeof which === 'number' ? this._items[which] : this._items.find((i) => i.file === which);
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
    // A hook assigned before the element upgraded lives in an own data property that shadows the accessor.
    if (Object.prototype.hasOwnProperty.call(this, 'upload')) {
      const fn = this.upload;
      delete this.upload;
      this.upload = fn;
    }
    super.connectedCallback();
    if (!this._bound) this._bind();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._bound = false;
    // Object URLs are recreated on the next render if the element comes back.
    for (const item of this._items) this._revoke(item);
  }

  attributeChangedCallback(name, oldVal, newVal) {
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
    const labelHtml = label
      ? `<span class="td-dropzone__label" id="${id}-label">${esc(label)}`
        + `${this.hasAttribute('required') ? '<span class="td-field__required" aria-hidden="true"> *</span>' : ''}</span>`
      : '';
    return `<div class="td-dropzone" role="group"${label ? ` aria-labelledby="${id}-label"` : ''} data-state="idle"${dis ? ' data-disabled=""' : ''}>`
      + labelHtml
      + `<input type="file" class="td-dropzone__input" tabindex="-1" aria-hidden="true"${accept ? ` accept="${esc(accept)}"` : ''}`
      + `${this.hasAttribute('multiple') ? ' multiple' : ''}${dis ? ' disabled' : ''}>`
      + '<div class="td-dropzone__zone">'
      + '<span class="td-dropzone__icon" data-td-icon="upload" aria-hidden="true"></span>'
      + `<p class="td-dropzone__prompt"><span class="td-dropzone__text">${esc(L.prompt)}</span> `
      + `<button type="button" class="td-dropzone__browse td-btn td-btn--secondary td-btn--sm"${dis ? ' disabled' : ''}>${esc(L.browse)}</button></p>`
      + `<p class="td-dropzone__hint" id="${id}-hint" hidden></p>`
      + '</div>'
      + '<ul class="td-dropzone__rejected" hidden></ul>'
      + `<ul class="td-dropzone__list" aria-label="${esc(L.list)}" hidden></ul>`
      + '<span class="td-sr-only td-dropzone__live" aria-live="polite"></span>'
      + '</div>';
  }

  afterRender() {
    fillIconSlots(this);
    const hint = this.querySelector('.td-dropzone__hint');
    const text = this._hintText();
    hint.textContent = text;
    hint.hidden = !text;
    const root = this.querySelector('.td-dropzone');
    this._applyAccessibleName(root, !!(this.getAttribute('label') || '').trim());
    this._refresh();
    this._applyErrorState();
  }

  _focusTarget() {
    return this.querySelector('.td-dropzone__browse');
  }

  _errorHost() {
    return this.querySelector('.td-dropzone') || this;
  }

  _describedByIds() {
    const hint = this.querySelector('.td-dropzone__hint');
    return hint && !hint.hidden ? [hint.id] : [];
  }

  /** Form reset: clear the list, abort uploads, forget rejections. */
  _restoreDefaults() {
    this.clear();
  }

  /** Files can't be restored from a saved state (bfcache / autofill): keep the current list. */
  _restoreState() {}

  // --- Private ---

  /** @private Host-level listeners, once per connection (event delegation survives re-renders). */
  _bind() {
    this._bound = true;
    this.listen(this, 'click', (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t || t.closest('.td-dropzone__input')) return;
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

  /** @private @returns {string[]} lower-cased accept tokens */
  _acceptTokens() {
    return (this.getAttribute('accept') || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  }

  /** @private */
  _accepts(file) {
    const tokens = this._acceptTokens();
    if (!tokens.length) return true;
    const name = String(file.name || '').toLowerCase();
    const type = String(file.type || '').toLowerCase();
    return tokens.some((t) => {
      if (t.startsWith('.')) return name.endsWith(t);
      if (t.endsWith('/*')) return !!type && type.startsWith(t.slice(0, -1));
      return type === t;
    });
  }

  /** @private @returns {number} Infinity = no limit */
  _limit() {
    if (!this.hasAttribute('multiple')) return 1;
    const n = parseInt(this.getAttribute('max-files') ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : Infinity;
  }

  /** @private */
  _hintText() {
    const L = TdDropzone.labels;
    const parts = [];
    const tokens = (this.getAttribute('accept') || '').split(',').map((t) => t.trim()).filter(Boolean);
    if (tokens.length) parts.push(format(L.hintAccept, { accept: tokens.join(', ') }));
    const max = parseFileSize(this.getAttribute('max-size'));
    if (max) parts.push(format(L.hintSize, { size: formatFileSize(max) }));
    const limit = this._limit();
    if (limit !== Infinity && limit > 1) parts.push(format(L.hintCount, { n: limit }));
    return parts.join(' · ');
  }

  /**
   * @private Filter + add. Without `multiple` the first acceptable file replaces the current one.
   * @param {File[]} files
   */
  _add(files) {
    const L = TdDropzone.labels;
    const maxSize = parseFileSize(this.getAttribute('max-size'));
    const limit = this._limit();
    const single = !this.hasAttribute('multiple');
    let room = single ? 1 : limit - this._items.length;
    const accepted = [];
    const rejected = [];
    for (const file of files) {
      let reason = '';
      let message = '';
      if (!this._accepts(file)) {
        reason = 'type';
        message = format(L.rejectType, { name: file.name });
      } else if (maxSize && file.size > maxSize) {
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
    if (single && accepted.length) this._clearItems();
    const added = accepted.map((file) => ({ id: ++this._itemSeq, file, url: null, status: 'selected', progress: null, controller: null }));
    this._items.push(...added);
    this._rejected = rejected;
    this._refresh();
    for (const item of added) this._startUpload(item);
    return { accepted, rejected };
  }

  /** @private user pick / drop: add + announce + event */
  _addUser(files) {
    const { accepted, rejected } = this._add(files);
    const L = TdDropzone.labels;
    const parts = [];
    if (accepted.length) parts.push(format(L.added, { n: accepted.length }));
    for (const r of rejected) parts.push(r.message);
    this._announce(parts.join('. '));
    this.emit('files-change', { files: this.files, rejected: rejected.map((r) => ({ ...r })) });
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
    this.emit('files-change', { files: this.files, rejected: [] });
  }

  /** @private */
  _removeItem(item) {
    const i = this._items.indexOf(item);
    if (i < 0) return;
    this._abort(item);
    this._revoke(item);
    this._items.splice(i, 1);
    this._refresh();
  }

  /** @private abort + revoke everything, empty the list (no render) */
  _clearItems() {
    for (const item of this._items) {
      this._abort(item);
      this._revoke(item);
    }
    this._items = [];
  }

  /** @private */
  _abort(item) {
    if (item.controller) {
      item.controller.abort();
      item.controller = null;
    }
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
    size.className = 'td-dropzone__size';
    size.textContent = formatFileSize(item.file.size);
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
    const status = li.querySelector('.td-dropzone__status');
    const text = item.status === 'uploading' ? L.uploading : item.status === 'done' ? L.uploaded
      : item.status === 'error' ? L.uploadError : '';
    status.textContent = String(text ?? '');
    status.hidden = !text;
    const progress = li.querySelector('.td-dropzone__progress');
    progress.hidden = item.status === 'selected';
    if (item.progress == null) progress.removeAttribute('value');
    else progress.setAttribute('value', String(Math.round(item.progress)));
    const variant = item.status === 'done' ? 'success' : item.status === 'error' ? 'danger' : 'primary';
    progress.setAttribute('variant', variant);
  }

  /** @private Run the upload hook for a newly added file. */
  _startUpload(item) {
    const hook = this._upload;
    if (!hook) return;
    const controller = new AbortController();
    item.controller = controller;
    item.status = 'uploading';
    item.progress = 0;
    this._paintItem(item);
    const live = () => !controller.signal.aborted && this._items.includes(item);
    const onProgress = (loaded, total) => {
      if (!live()) return;
      let pct = total != null ? (Number(total) > 0 ? (Number(loaded) / Number(total)) * 100 : NaN) : Number(loaded);
      if (!Number.isFinite(pct)) return;
      pct = Math.min(100, Math.max(0, pct));
      item.progress = pct;
      this._paintItem(item);
    };
    let out;
    try {
      out = hook(item.file, { onProgress, signal: controller.signal });
    } catch (err) {
      out = Promise.reject(err);
    }
    Promise.resolve(out).then(
      (result) => {
        if (!live()) return;
        item.controller = null;
        item.status = 'done';
        item.progress = 100;
        item.result = result;
        this._paintItem(item);
      },
      () => {
        if (!live()) return; // aborted by remove / reset: no error state
        item.controller = null;
        item.status = 'error';
        this._paintItem(item);
      },
    );
  }

  /** @private Files → FormData under `name`; required → valueMissing. */
  _syncForm() {
    const name = this.getAttribute('name');
    let fd = null;
    if (name && this._items.length) {
      fd = new FormData();
      for (const item of this._items) fd.append(name, item.file, item.file.name);
    }
    this._setFormValue(fd);
    if (this.hasAttribute('required') && !this._items.length) {
      this._setValidity({ valueMissing: true }, TdDropzone.labels.required, this._focusTarget() || undefined);
    } else {
      this._setValidity({});
    }
  }
}

if (!customElements.get('td-dropzone')) {
  customElements.define('td-dropzone', TdDropzone);
}
