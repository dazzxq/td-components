/**
 * <td-media-picker> + TdMediaPicker.open() — v0.32.0 (plan v0.32.0-media-picker, ADR 0013) reworked in v0.33.0 for dcms2
 * parity (plan v0.33.0-media-picker-dcms-parity, decisions 4-19, 24-31). The reusable media-library interaction shell:
 * full-viewport dialog, toolbar of kit components (upload · search · compact facets · pagination), card grid,
 * loading / empty / error / retry, single / multiple selection (+ maxItems, kept across pages and queries), inline
 * detail panel (always-open metadata form, download, copy link, delete with server-side usage blocking), a nested
 * upload dialog (file + URL, media-picker-upload.js), keyboard / focus / responsive / i18n, text-only rendering. The
 * APP owns the adapter (endpoints, envelopes, auth, permissions, DTO mapping, upload / delete / download security,
 * storage); the picker NEVER mutates host content and never creates usages — it only resolves `SelectedMedia[]`.
 * v0.35.0 (plan v0.35.0-cropper, decisions 23-26): with `crop.enabled` (single mode) "Chèn" on an image opens the crop
 * step (crop-dialog.js, nested) before finishing; its coordinates fill `usage.crop` / `usage.focalPoint`.
 *
 * Token-native: needs td.css (modal.css shell + components/media-picker.css). Light DOM, CSP-strict (no style
 * attributes, no <style>, no inline handlers; every adapter / descriptor / message string → textContent; every URL →
 * safeMediaUrl, usage links → safeLinkUrl), no globals.
 *
 * Shell: `openDialogLayer` + the td-modal DOM / CSS (root `.td-modal.td-modal--viewport.td-media-picker`), not
 * TdModal.show() (its × / Escape cannot be gated while edits are unsaved). One picker at a time.
 *
 * DOM (built with DOM APIs; `{id}` = per-open counter id):
 *   <div class="td-modal td-modal--viewport td-media-picker" data-state="opening|open|closing" data-view="grid|detail"
 *        data-mode="single|multiple">
 *     <div class="td-modal__backdrop" aria-hidden="true"></div>
 *     <div class="td-modal__dialog … td-media-picker__dialog" role="dialog" aria-modal="true" aria-labelledby="{id}-title" tabindex="-1">
 *       <div class="td-modal__header"><h2 class="td-modal__title" id="{id}-title">…</h2><button class="td-modal__close">×</button></div>
 *       <div class="td-modal__body td-media-picker__body">
 *         <div class="td-media-picker__toolbar">
 *           [<td-button class="td-media-picker__upload-btn" variant="primary" icon="upload">Tải lên</td-button>]
 *           [<td-input-field class="td-media-picker__search" type="search" size="md">]
 *           <div class="td-media-picker__filters"><div class="td-media-picker__facets">…</div>
 *             <div class="td-media-picker__pager">‹ "Hiển thị a-b / n media" › | <td-pagination></div></div>
 *         </div>
 *         <div class="td-media-picker__content">
 *           <section class="td-media-picker__results" aria-busy aria-labelledby="{id}-rh"><h3 class="td-sr-only" tabindex="-1">
 *             <td-media-grid select-mode="tick"> cards + skeleton (30) | td-empty-state | error + "Thử lại"</section>
 *           <aside class="td-media-picker__detail" data-state="empty|ready" [data-loading]>…</aside>
 *         </div>
 *       </div>
 *       <div class="td-modal__footer td-media-picker__footer">[Đã chọn n/max · Bỏ chọn tất cả] Đóng · Chèn (n)</div>
 *       <span class="td-sr-only td-media-picker__live" role="status"></span>
 *     </div>
 *   </div>
 *
 * Events on the host (bubbles + composed): `selection-change { selection, addedIds, removedIds }` (user changes only),
 * `asset-change { operation: 'upload'|'upload-url'|'update'|'delete', asset?, id?, deduplication? }`,
 * `confirm { selection }`, `cancel { reason }`,
 * `operation-error { operation: 'list'|'facets'|'get'|'upload'|'upload-url'|'update'|'delete'|'download', code, retryable }`.
 *
 * @element td-media-picker
 * @property {object} options - OpenMediaPickerOptions (merged over TdMediaPicker.defaults at open())
 * @fires selection-change
 * @fires asset-change
 * @fires confirm
 * @fires cancel
 * @fires operation-error
 */
import { matchesBelow } from '../utils/breakpoints.js';
import { openDialogLayer } from './dialog-layer.js';
import { TdModal } from './td-modal.js';
import { TdModalStackManager } from './td-modal-stack.js';
import { TdToast } from './td-toast.js';
import { LAYERS } from '../utils/layers.js';
import { fillIconSlots, tdIcon } from '../icons/td-icon.js';
import { formatFileSize } from '../utils/dom-utils.js';
import { safeMediaUrl, safeLinkUrl } from '../utils/media-url.js';
import {
  DefaultsRegistry, resolveOptions, cancelledOutcome, buildOutcome, normalizeAsset, normalizePage, normalizeFacets,
  normalizeFields, normalizeError, canDo, buildListRequest, requestKey, LatestRequest, SelectionModel, InitialLoad,
  Debouncer, SessionCache, formatLabel, PageState, defaultTitle, normalizeDeleteResult, normalizeDownloadResult,
} from '../utils/media-picker-core.js';
import { createFacetControl, FieldForm, FIELD_LABELS } from './media-picker-fields.js';
import { openUploadDialog, UPLOAD_LABELS } from './media-picker-upload.js';
import { openCropDialog } from './crop-dialog.js';
import '../display/td-media-grid.js';
import '../display/td-empty-state.js';
import '../display/td-pagination.js';
import '../display/td-copy.js';
import '../form/td-button.js';
import '../form/td-input-field.js';
import './td-alert.js';

const registry = new DefaultsRegistry();
/** @type {Set<() => void>} notified after each configureDefaults() (module-level, no global) */
const defaultsListeners = new Set();

/**
 * @internal Run `fn` after every `TdMediaPicker.configureDefaults()` (td-media-field: fetch a pending preview once an
 * adapter exists). @param {() => void} fn @returns {() => void} unsubscribe
 */
export function onDefaultsChange(fn) {
  defaultsListeners.add(fn);
  return () => defaultsListeners.delete(fn);
}
const SEARCH_DEBOUNCE_MS = 250;
const SKELETON_CARDS = 30;
const USAGES_SHOWN = 20;
const TONES = ['info', 'success', 'warning', 'danger'];
const KIND_ICON = { image: 'image', video: 'video', file: 'file' };
let uid = 0;
/** @type {TdMediaPicker|null} the one open picker (decision 10) */
let active = null;
const warned = new Set();
const warnOnce = (key, msg) => {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(msg);
};
const isMac = () => {
  try { return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || ''); } catch { return false; }
};

/**
 * Discard-changes confirmation of THIS picker (decision 12): a TdModal.show() whose id we keep, so teardown closes exactly
 * that instance (never TdModal.close() / closeAll()). Body is a DOM node with textContent.
 * @param {(key: string) => string} t
 * @returns {{ id: string, promise: Promise<boolean> }}
 */
function openDiscardConfirm(t) {
  let resolve = (_v) => {};
  const promise = new Promise((r) => { resolve = r; });
  const body = document.createElement('p');
  body.className = 'td-media-picker__confirm-text';
  body.textContent = t('discardMessage');
  const id = TdModal.show({
    title: t('discardTitle'),
    body,
    size: 'sm',
    actions: [
      { label: t('keepEditing'), variant: 'secondary', value: false },
      { label: t('discard'), variant: 'danger', value: true },
    ],
    onClose: (v) => resolve(v === true),
  });
  return { id, promise };
}

/**
 * A `<td-button>` (decision 10: every picker button is one, except × and the grid opener).
 * @param {string} label text ('' → icon-only, then `aria` names it)
 * @param {{ variant?: string, size?: string, icon?: string, cls?: string, aria?: string }} [o]
 * @returns {HTMLElement}
 */
function makeButton(label, { variant = 'secondary', size, icon, cls, aria } = {}) {
  const b = document.createElement('td-button');
  b.setAttribute('variant', variant);
  if (size) b.setAttribute('size', size);
  if (icon) b.setAttribute('icon', icon);
  if (aria) b.setAttribute('aria-label', aria);
  if (label) b.setAttribute('label', label);
  if (cls) b.className = cls;
  return b;
}

/** A user action on a `<td-button>` host — ignored while disabled / loading (a programmatic host.click() included). */
const usable = (b) => !b.hasAttribute('disabled') && !b.hasAttribute('loading');

export class TdMediaPicker extends HTMLElement {
  /**
   * Default texts (Vietnamese); override per site (`TdMediaPicker.labels.title = 'Media library'`) or per open through
   * `options.messages` (a string or `(params) => string`; dotted keys for nested ones: `'error.network'`). Always text.
   * The upload dialog's texts (media-picker-upload.js UPLOAD_LABELS) are part of this object.
   */
  static labels = {
    ...UPLOAD_LABELS,
    title: 'Chọn media',
    titleImage: 'Chọn ảnh',
    titleVideo: 'Chọn video',
    titleFile: 'Chọn tài liệu',
    close: 'Đóng',
    cancel: 'Đóng',
    confirm: 'Chèn',
    confirmCount: 'Chèn ({n})',
    cropTitle: 'Cắt ảnh',
    cropBack: 'Quay lại',
    cropConfirm: 'Chèn',
    cropUnavailable: 'Không mở được ảnh để cắt.',
    search: 'Tìm media',
    searchPlaceholder: 'Tìm kiếm media…',
    upload: 'Tải lên',
    results: 'Kết quả',
    grid: 'Media',
    pagination: 'Phân trang media',
    pageItem: 'media',
    pageInfo: 'Hiển thị {from}-{to} / {total} media',
    page: 'Trang {n}',
    prevPage: 'Trang trước',
    nextPage: 'Trang sau',
    resultsCount: '{n} kết quả',
    empty: 'Không có media nào',
    emptyHint: 'Thử từ khoá khác',
    retry: 'Thử lại',
    back: 'Quay lại',
    detail: 'Chi tiết',
    detailEmpty: 'Chọn một ảnh để xem chi tiết',
    detailEmptyHint: 'Bấm vào ảnh trong danh sách bên trái',
    fileName: 'Tên file',
    save: 'Lưu',
    saved: 'Đã lưu thay đổi',
    discardTitle: 'Bỏ thay đổi?',
    discardMessage: 'Các thay đổi chưa lưu hoặc file đang tải lên sẽ bị huỷ.',
    discard: 'Bỏ thay đổi',
    keepEditing: 'Tiếp tục sửa',
    limit: 'Tối đa {max} mục',
    loadingInitial: 'Đang tải lựa chọn…',
    selected: 'Đã chọn {n}',
    selectedMax: 'Đã chọn {n}/{max}',
    clearSelection: 'Bỏ chọn tất cả',
    selectFirst: 'Hãy chọn ít nhất một mục.',
    notReady: 'Mục này chưa sẵn sàng để chọn.',
    conflict: 'Media đã bị thay đổi ở nơi khác.',
    reload: 'Tải lại',
    video: 'Video',
    download: 'Tải về',
    downloadExpired: 'Liên kết tải đã hết hạn',
    copyLink: 'Copy link',
    delete: 'Xoá',
    deleteTitle: 'Xác nhận xoá',
    deleteMessage: 'Bạn có chắc muốn xoá "{name}"? Hành động này không thể hoàn tác.',
    deleteConfirm: 'Xoá',
    deleteCancel: 'Huỷ',
    deleted: 'Đã xoá {name}',
    blockedHeading: 'Không xoá được',
    blockedText: 'Media đang được dùng ở {n} nơi.',
    blockedMore: '… và {k} nơi khác',
    kind: { image: 'Ảnh', video: 'Video', file: 'File' },
    status: { pending: 'Đang chờ', processing: 'Đang xử lý', failed: 'Lỗi', archived: 'Đã lưu trữ' },
    meta: {
      size: 'Kích thước',
      dimensions: 'Độ phân giải',
      dimensionsValue: '{w} × {h}px',
      type: 'Loại',
      date: 'Tải lên',
      uploadedBy: 'Bởi',
      status: 'Trạng thái',
    },
    error: {
      network: 'Không kết nối được. Kiểm tra mạng rồi thử lại.',
      unauthorized: 'Phiên đăng nhập đã hết. Hãy đăng nhập lại.',
      forbidden: 'Bạn không có quyền thực hiện thao tác này.',
      'not-found': 'Không tìm thấy media.',
      conflict: 'Media đã bị thay đổi ở nơi khác.',
      'rate-limited': 'Thao tác quá nhanh. Thử lại sau giây lát.',
      validation: 'Dữ liệu chưa hợp lệ.',
      server: 'Có lỗi xảy ra. Thử lại sau.',
    },
  };

  /**
   * Texts of the descriptor / facet controls (facet "Tất cả", create row, general-errors list name, create error); the
   * same object the controls read at use time — override per site: `TdMediaPicker.fieldLabels.all = 'All'`.
   */
  static fieldLabels = FIELD_LABELS;

  /**
   * Module-level defaults (decision 6): REPLACES the whole default object on every call (one call in the site
   * bootstrap). Keys: adapter, capabilities, assetFields, uploadFields, messages, context, upload, pageSize,
   * pagination. An adapter without list() / get() → TypeError (previous defaults kept).
   * @param {object} defaults
   */
  static configureDefaults(defaults) {
    registry.configure(defaults);
    for (const fn of [...defaultsListeners]) {
      try { fn(); } catch { /* a listener never breaks configure */ }
    }
  }

  /** @returns {object} a shallow copy of the configured defaults */
  static get defaults() { return registry.get(); }

  /**
   * Open a picker built from options (a temporary host on <body>, removed after the close). Resolution order: these
   * options > TdMediaPicker.defaults (shallow, per key). Throws a TypeError synchronously when no valid adapter
   * resolves. Another picker already open → resolves `{ status: 'cancelled', reason: 'programmatic' }` at once.
   * @param {object} [options] OpenMediaPickerOptions
   * @returns {Promise<import('../utils/media-picker-core.js').PickerOutcome>}
   */
  static open(options) {
    resolveOptions(registry.get(), options); // TypeError now (sync), before any DOM
    if (active) {
      warnOnce('busy', 'td-media-picker: a picker is already open — this open() resolves cancelled / programmatic.');
      return Promise.resolve(cancelledOutcome('programmatic'));
    }
    const host = /** @type {TdMediaPicker} */ (document.createElement('td-media-picker'));
    host._jsOwned = true;
    host.options = options || {};
    document.body.appendChild(host);
    return host.open();
  }

  constructor() {
    super();
    /** @type {object} */
    this.options = {};
    this._open = false;
    this._settled = true;
  }

  /** @returns {boolean} */
  get isOpen() { return this._open; }

  disconnectedCallback() {
    // Removed while open (decision 10, review R1-5): tear down at once — idempotent, settles exactly once.
    if (this._open) this._teardown(cancelledOutcome('programmatic'), true);
  }

  /**
   * Open this (connected) picker with `this.options` over the defaults.
   * @returns {Promise<import('../utils/media-picker-core.js').PickerOutcome>}
   */
  open() {
    const opts = resolveOptions(registry.get(), this.options); // TypeError (sync) without a valid adapter
    if (active) {
      warnOnce('busy', 'td-media-picker: a picker is already open — this open() resolves cancelled / programmatic.');
      return Promise.resolve(cancelledOutcome('programmatic'));
    }
    if (!this.isConnected) return Promise.resolve(cancelledOutcome('programmatic'));
    active = this;
    this._open = true;
    this._settled = false;
    let resolve = (_o) => {};
    const promise = new Promise((r) => { resolve = r; });
    this._resolve = resolve;
    this._setup(opts);
    return promise;
  }

  /**
   * Close now, without the discard confirmation (the app decided): resolves `cancelled` with `reason`.
   * @param {'close'|'escape'|'programmatic'} [reason='programmatic']
   */
  close(reason = 'programmatic') {
    if (!this._open) return;
    const r = ['close', 'escape', 'programmatic'].includes(reason) ? reason : 'programmatic';
    this._teardown(cancelledOutcome(/** @type {any} */ (r)), false);
  }

  // --- texts ---

  /** @private */
  _t(key, params) {
    return formatLabel(TdMediaPicker.labels, this._s ? this._s.messages : {}, key, params || {});
  }

  /** @private */
  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }

  /** @private still the same open session */
  _live(s) {
    return this._s === s && !this._settled;
  }

  // --- setup ---

  /** @private */
  _setup(opts) {
    const id = `td-media-picker-${++uid}`;
    const mode = opts.selection.mode;
    const s = {
      id,
      opts,
      adapter: opts.adapter,
      caps: opts.capabilities,
      messages: opts.messages,
      context: opts.context,
      kinds: opts.selection.kinds,
      mode,
      model: new SelectionModel({ mode, max: opts.selection.maxItems }),
      cache: new SessionCache(),
      query: opts.initialQuery.trim(),
      filters: { ...opts.initialFilters },
      pageSize: opts.pageSize,
      pages: new PageState({ mode: opts.pagination, pageSize: opts.pageSize, warn: (m) => warnOnce('pages', m) }),
      lastHow: 'reload',
      /** @type {Map<string, HTMLElement>} grid items by id */
      items: new Map(),
      req: { list: new LatestRequest(), facets: new LatestRequest(), detail: new LatestRequest(),
        update: new LatestRequest(), reload: new LatestRequest(), download: new LatestRequest() },
      /** @type {Map<string, LatestRequest>} delete slot per asset (decision 24) */
      del: new Map(),
      deleteConfirmId: null,
      debounce: new Debouncer(SEARCH_DEBOUNCE_MS),
      initial: null,
      facets: new Map(),
      detailId: null,
      edit: null,
      blocked: null,
      upload: null,
      confirm: null,
      /** @type {{ ctrl: AbortController }|null} the open crop step (v0.35 decisions 24-25) */
      crop: null,
      /** @type {Set<string>} object URLs of blob downloads not revoked yet */
      blobUrls: new Set(),
      assetFields: normalizeFields(opts.assetFields, { warn: (m) => warnOnce(`af:${m}`, m) }),
      uploadFields: normalizeFields(opts.uploadFields, { warn: (m) => warnOnce(`uf:${m}`, m) }),
      ctrl: new AbortController(),
      announceQueued: false,
      pendingAnnounce: '',
    };
    // review SEC-3 r2: an asset keeps only the metadata keys of its field descriptors
    s.metaKeys = s.assetFields.map((f) => f.key);
    this._s = s;
    const root = this._build();
    s.root = root;
    const dialog = /** @type {HTMLElement} */ (root.querySelector('.td-media-picker__dialog'));
    s.handle = openDialogLayer({
      root,
      dialog,
      layer: LAYERS.modal,
      scrollLock: true,
      backdrop: root.querySelector('.td-modal__backdrop'),
      onEscape: () => { this._onEscape(); return true; },
      onOpened: () => {
        if (!this._live(s)) return;
        root.setAttribute('data-state', 'open');
        this._initialFocus();
      },
    });
    // initialIds transaction (decision 15)
    if (opts.selection.initialIds.length) {
      s.initial = new InitialLoad({
        ids: opts.selection.initialIds,
        model: s.model,
        get: (assetId, signal) => Promise.resolve(s.adapter.get(assetId, { context: s.context, signal }))
          .then((raw) => normalizeAsset(raw, { safeUrl: safeMediaUrl, metadataKeys: s.metaKeys })),
        onApply: (assets) => {
          if (this._s !== s) return;
          for (const a of assets) s.cache.putAsset(a);
          this._syncGrid();
          this._renderSelection();
        },
        onSettle: () => { if (this._s === s) this._renderSelection(); },
        warn: (...a) => console.warn(...a),
      });
      s.initial.start();
    }
    this._renderSelection();
    this._loadFacets();
    this._loadPage('reload');
  }

  /** @private build the root (static skeleton markup + DOM-API content) */
  _build() {
    const s = this._s;
    const t = (k, p) => this._t(k, p);
    const root = document.createElement('div');
    root.className = 'td-modal td-modal--viewport td-media-picker';
    root.setAttribute('data-state', 'opening');
    root.setAttribute('data-view', 'grid');
    root.setAttribute('data-mode', s.mode);
    // Static markup only (no interpolation); every dynamic value is set through the DOM below.
    root.innerHTML = '<div class="td-modal__backdrop" aria-hidden="true"></div>'
      + '<div class="td-modal__dialog td-glass-surface td-glass-surface--strong td-glass-surface--lg td-media-picker__dialog"'
      + ' role="dialog" aria-modal="true" tabindex="-1">'
      + '<div class="td-modal__header"><h2 class="td-modal__title"></h2>'
      + '<button type="button" class="td-modal__close"><span class="td-modal__close-icon" data-td-icon="close" aria-hidden="true"></span></button></div>'
      + '<div class="td-modal__body td-media-picker__body">'
      + '<div class="td-media-picker__toolbar"></div>'
      + '<div class="td-media-picker__content">'
      + '<section class="td-media-picker__results" aria-busy="false">'
      + '<h3 class="td-sr-only td-media-picker__results-heading" tabindex="-1"></h3>'
      + '<td-media-grid class="td-media-picker__grid" select-mode="tick"></td-media-grid>'
      + '<div class="td-media-picker__skeleton" aria-hidden="true" hidden></div>'
      + '<td-empty-state class="td-media-picker__empty" icon="image" size="sm" compact heading-level="3" hidden></td-empty-state>'
      + '<div class="td-media-picker__error" role="alert" hidden><p class="td-media-picker__error-text"></p></div>'
      + '</section>'
      + '<aside class="td-media-picker__detail" data-state="empty"></aside>'
      + '</div></div>'
      + '<div class="td-modal__footer td-media-picker__footer">'
      + '<div class="td-media-picker__selbar"></div>'
      + '<div class="td-media-picker__actions"></div></div>'
      + '<span class="td-sr-only td-media-picker__live" role="status"></span>'
      + '</div>';
    const q = (sel) => /** @type {HTMLElement} */ (root.querySelector(sel));
    const dialog = q('.td-media-picker__dialog');
    const title = q('.td-modal__title');
    title.id = `${s.id}-title`;
    title.textContent = defaultTitle(s.kinds, {
      title: t('title'), titleImage: t('titleImage'), titleVideo: t('titleVideo'), titleFile: t('titleFile'),
    }, s.opts.title);
    dialog.setAttribute('aria-labelledby', title.id);
    const x = q('.td-modal__close');
    x.setAttribute('aria-label', t('close'));
    x.addEventListener('click', () => this._requestFinish('cancel', 'close'));
    root.querySelector('.td-modal__backdrop').addEventListener('mousedown', (e) => e.preventDefault());
    fillIconSlots(root);

    s.els = {
      dialog,
      body: q('.td-media-picker__body'),
      toolbar: q('.td-media-picker__toolbar'),
      results: q('.td-media-picker__results'),
      heading: q('.td-media-picker__results-heading'),
      grid: /** @type {any} */ (q('.td-media-picker__grid')),
      skeleton: q('.td-media-picker__skeleton'),
      empty: q('.td-media-picker__empty'),
      error: q('.td-media-picker__error'),
      errorText: q('.td-media-picker__error-text'),
      detail: q('.td-media-picker__detail'),
      selbar: q('.td-media-picker__selbar'),
      actions: q('.td-media-picker__actions'),
      live: q('.td-media-picker__live'),
    };
    const e = s.els;
    e.heading.id = `${s.id}-rh`;
    e.heading.textContent = t('results');
    e.results.setAttribute('aria-labelledby', e.heading.id);
    e.detail.setAttribute('aria-label', t('detail'));
    e.grid.setAttribute('label', t('grid'));
    for (let i = 0; i < SKELETON_CARDS; i++) {
      const card = document.createElement('div');
      card.className = 'td-media-picker__skeleton-card';
      const thumb = document.createElement('div');
      thumb.className = 'td-skeleton td-skeleton--rect td-media-picker__skeleton-thumb';
      const info = document.createElement('div');
      info.className = 'td-media-picker__skeleton-info';
      const l1 = document.createElement('div');
      l1.className = 'td-skeleton td-skeleton--text';
      const l2 = document.createElement('div');
      l2.className = 'td-skeleton td-skeleton--text td-media-picker__skeleton-short';
      info.append(l1, l2);
      card.append(thumb, info);
      e.skeleton.appendChild(card);
    }
    const retry = makeButton(t('retry'), { size: 'sm', cls: 'td-media-picker__retry' });
    retry.addEventListener('click', () => { if (usable(retry)) this._loadPage(s.lastHow); });
    e.error.appendChild(retry);
    e.retry = retry;
    // footer (decision 17)
    const selcount = document.createElement('span');
    selcount.className = 'td-media-picker__selcount';
    const clear = makeButton(t('clearSelection'), { variant: 'ghost', size: 'sm', cls: 'td-media-picker__clear' });
    clear.addEventListener('click', () => {
      if (!usable(clear)) return;
      this._userChange(() => s.model.clear());
      this._focus(this._searchInput() || e.heading);
    });
    const loadingNote = document.createElement('span');
    loadingNote.className = 'td-media-picker__initial-loading';
    loadingNote.textContent = t('loadingInitial');
    loadingNote.hidden = true;
    if (s.mode === 'multiple') e.selbar.append(selcount, clear);
    e.selbar.appendChild(loadingNote);
    Object.assign(e, { selcount, clear, loadingNote });
    const cancel = makeButton(t('cancel'), { cls: 'td-media-picker__cancel' });
    cancel.addEventListener('click', () => { if (usable(cancel)) this._requestFinish('cancel', 'close'); });
    const confirm = makeButton(t('confirm'), { variant: 'primary', cls: 'td-media-picker__confirm' });
    confirm.addEventListener('click', () => this._requestFinish('confirm', 'confirm'));
    e.actions.append(cancel, confirm);
    Object.assign(e, { cancel, confirm });
    this._buildToolbar();
    this._bindGrid();
    this._renderDetail();
    return root;
  }

  /** @private upload button, search, facets container, pager (decisions 7-10, 13) */
  _buildToolbar() {
    const s = this._s;
    const e = s.els;
    const t = (k, p) => this._t(k, p);
    s.sources = {
      file: canDo('upload', s.adapter, s.caps, null),
      url: canDo('uploadFromUrl', s.adapter, s.caps, null),
    };
    if (s.sources.file || s.sources.url) {
      const up = makeButton(t('upload'), { variant: 'primary', icon: 'upload', aria: t('upload'), cls: 'td-media-picker__upload-btn' });
      up.addEventListener('click', () => { if (usable(up)) this._openUpload(); });
      e.toolbar.appendChild(up);
      e.uploadBtn = up;
    }
    if (s.opts.capabilitiesResolved.search) {
      const f = /** @type {any} */ (document.createElement('td-input-field'));
      f.className = 'td-media-picker__search';
      f.id = `${s.id}-q`;
      f.setAttribute('type', 'search');
      f.setAttribute('size', 'md');
      f.setAttribute('placeholder', t('searchPlaceholder'));
      f.setAttribute('aria-label', t('search'));
      f.setAttribute('autocomplete', 'off');
      f.setAttribute('enterkeyhint', 'search');
      if (s.query) f.setAttribute('value', s.query);
      f.addEventListener('input', () => {
        const v = String(f.getValue?.() ?? f.value ?? '');
        s.debounce.schedule(() => this._applyQuery(v));
      });
      f.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && !ev.isComposing) {
          ev.preventDefault(); // never confirms the picker (decision 29)
          s.debounce.cancel();
          this._applyQuery(String(f.getValue?.() ?? f.value ?? ''));
        }
      });
      e.toolbar.appendChild(f);
      e.search = f;
    }
    const filters = document.createElement('div');
    filters.className = 'td-media-picker__filters';
    const facets = document.createElement('div');
    facets.className = 'td-media-picker__facets';
    facets.hidden = true;
    // ≥ 720px (ADR 0014; v0.33: 768) the facet group is a horizontal scroller inside the one-row toolbar (impl review #3): a facet that takes
    // focus (Tab, or a programmatic focus — Firefox does not scroll an overflow box for that) is brought into view
    facets.addEventListener('focusin', (ev) => {
      const facet = /** @type {HTMLElement|null} */ (ev.target instanceof Element ? ev.target.closest('.td-media-picker__facet') : null);
      if (!facet || facets.scrollWidth <= facets.clientWidth + 1) return;
      const f = facets.getBoundingClientRect();
      const r = facet.getBoundingClientRect();
      if (r.left < f.left) facets.scrollLeft -= f.left - r.left;
      else if (r.right > f.right) facets.scrollLeft += Math.min(r.right - f.right, r.left - f.left);
    });
    const pager = document.createElement('div');
    pager.className = 'td-media-picker__pager';
    pager.hidden = true;
    filters.append(facets, pager);
    e.toolbar.appendChild(filters);
    e.facets = facets;
    e.pager = pager;
    // cursor UI (built once; shown / hidden by _renderPager)
    const prev = makeButton('', { size: 'sm', icon: 'prev', aria: t('prevPage'), cls: 'td-media-picker__prev' });
    const next = makeButton('', { size: 'sm', icon: 'next', aria: t('nextPage'), cls: 'td-media-picker__next' });
    const info = document.createElement('p');
    info.className = 'td-media-picker__page-info';
    prev.addEventListener('click', () => { if (usable(prev)) this._loadPage('prev', { nav: true, button: prev }); });
    next.addEventListener('click', () => { if (usable(next)) this._loadPage('next', { nav: true, button: next }); });
    const cursorBox = document.createElement('div');
    cursorBox.className = 'td-media-picker__cursor';
    cursorBox.append(info, prev, next);
    // pages UI: the real td-pagination, synced silently through the current-page ATTRIBUTE (never setPage())
    const pg = document.createElement('td-pagination');
    pg.setAttribute('aria-label', t('pagination'));
    pg.setAttribute('item-label', t('pageItem'));
    pg.setAttribute('items-per-page', String(s.pageSize));
    pg.setAttribute('quiet', '');
    pg.addEventListener('page-change', (ev) => {
      const n = Number(ev.detail && ev.detail.page);
      if (Number.isInteger(n) && n >= 1 && n !== s.pages.page) this._loadPage(n, { nav: true });
    });
    pager.append(cursorBox, pg);
    Object.assign(e, { prev, next, pageInfo: info, cursorBox, pagination: pg });
  }

  /** @private the inner <input> of the search field */
  _searchInput() {
    const f = this._s && this._s.els.search;
    return f ? /** @type {HTMLElement|null} */ (f.querySelector('input')) : null;
  }

  // --- upload dialog (decisions 20-22, lane D implements the dialog) ---

  /** @private */
  _openUpload() {
    const s = this._s;
    if (!this._live(s) || s.upload) return;
    try {
      s.upload = openUploadDialog({
        t: (k, p) => this._t(k, p),
        adapter: s.adapter,
        context: s.context,
        sources: { ...s.sources },
        upload: s.opts.upload,
        uploadFields: s.uploadFields,
        metaKeys: s.metaKeys,
        idPrefix: `${s.id}-up`,
        onUploaded: (asset, dedup, operation) => { if (this._live(s)) this._onUploaded(asset, dedup, operation); },
        onError: (d) => {
          if (!this._live(s) || !d) return;
          this._emit('operation-error', { operation: d.operation, code: d.code, retryable: d.retryable });
        },
        announce: (text) => { if (this._live(s)) this._announce(text); },
        onClosed: () => {
          if (!this._live(s)) return;
          s.upload = null;
          this._focusButton(s.els.uploadBtn);
        },
      });
    } catch {
      s.upload = null;
      warnOnce('upload-dialog', 'td-media-picker: the upload dialog could not open.');
    }
  }

  /**
   * @private One validated upload result (file or URL, v0.32 #20): caches dropped, page 1 reloaded, the asset selected
   * per mode (single: the last one wins), detail opened, `asset-change`.
   */
  _onUploaded(asset, dedup, operation) {
    const s = this._s;
    if (!asset || !dedup) return;
    s.cache.putAsset(asset);
    s.cache.invalidateLists();
    // the open upload dialog announces uploaded / reused in its own live region (this one is inert under it)
    if (!s.upload) this._announce(this._t(dedup.outcome === 'exact-reused' ? 'reused' : 'uploaded', { name: asset.name || asset.id }));
    const existing = s.items.get(asset.id);
    if (existing) this._paintItem(existing, asset);
    if (s.detailId === asset.id && !this._editBusy()) this._renderDetail(); // a re-upload refreshes the open detail
    let view = false;
    if (!this._selectable(asset)) {
      this._announce(this._t('notReady'));
    } else if (s.mode === 'single') {
      this._userChange(() => s.model.replace(asset));
      view = true;
    } else if (s.model.has(asset.id)) {
      s.model.update(asset);
      view = true;
    } else if (s.model.remaining > 0) {
      this._userChange(() => s.model.add(asset));
      view = true;
    } else {
      this._announce(this._t('limit', { max: s.model.max }));
    }
    s.model.update(asset);
    this._renderSelection();
    // open its detail — never over a dirty form of another asset (that one is kept; the user saves or discards it)
    if (view && !this._editBusy()) this._showDetail(asset.id, { gated: false });
    this._emit('asset-change', { operation: operation === 'upload-url' ? 'upload-url' : 'upload', asset, deduplication: dedup });
    this._loadFacets();
    this._loadPage('reload', { reset: true, keepGrid: true });
  }

  // --- list / facets / pages (decisions 9, 13) ---

  /** @private */
  _listState() {
    const s = this._s;
    return { query: s.query, filters: s.filters, pageSize: s.pageSize, context: s.context, kinds: s.kinds };
  }

  /** @private */
  _applyQuery(value) {
    const s = this._s;
    if (!s || this._settled) return;
    const q = String(value ?? '').trim();
    if (q === s.query) return;
    s.query = q;
    this._loadFacets();
    this._loadPage('reload', { reset: true });
  }

  /**
   * @private Load a page. `how`: 'reload' (the current page; with `reset` page 1), 'next' / 'prev', or a page number
   * (pages mode). Cursor navigation is single-flight (PageState refuses while pending); a reset / pages-mode click is
   * latest-wins (the list slot aborts the previous request). Never served from a cache (decision 9).
   * @param {'reload'|'next'|'prev'|number} how
   * @param {{ reset?: boolean, keepGrid?: boolean, nav?: boolean, button?: HTMLElement, stepBack?: boolean }} [o]
   */
  _loadPage(how, o = {}) {
    const s = this._s;
    if (!this._live(s)) return;
    if (o.reset) s.pages.reset();
    const r = s.pages.begin(how);
    if (!r) {
      this._renderPager();
      return;
    }
    s.lastHow = how;
    this._runPage(r, o);
  }

  /** @private run a begun PageState request */
  _runPage(r, o = {}) {
    const s = this._s;
    const state = this._listState();
    if (!o.keepGrid) this._showLoading();
    s.els.results.setAttribute('aria-busy', 'true');
    this._renderPager(o.button || null);
    s.req.list.run((signal) => s.adapter.list(buildListRequest(state, { cursor: r.cursor, page: r.page, signal }))).then((res) => {
      if (!this._live(s)) return;
      if (res.stale) {
        s.pages.rollback(r.token);
        return;
      }
      s.els.results.setAttribute('aria-busy', 'false');
      if ('error' in res) {
        s.pages.rollback(r.token);
        this._renderPager();
        this._listError(res.error);
        return;
      }
      let page;
      try {
        page = normalizePage(res.value, { safeUrl: safeMediaUrl, kinds: s.kinds, limit: s.pageSize, metadataKeys: s.metaKeys,
          pagination: s.opts.pagination, warn: (m) => warnOnce(`page:${m}`, m) });
      } catch (err) {
        s.pages.rollback(r.token);
        this._renderPager();
        this._listError(err);
        return;
      }
      if (!s.pages.commit(r.token, page)) return; // superseded
      if (page.hidden) warnOnce('kinds', 'td-media-picker: the adapter returned items of other kinds — hidden (filter by `kinds`).');
      for (const a of page.items) s.cache.putAsset(a);
      if (o.stepBack && !page.items.length) {
        const back = s.pages.stepBackIfEmpty();
        if (back) {
          this._runPage(back, { keepGrid: true });
          return;
        }
      }
      this._renderPage(page, !o.nav && !o.keepGrid);
      this._renderPager();
      if (o.nav) {
        s.els.results.scrollTop = 0;
        this._focus(s.els.heading);
        this._announce(this._t('page', { n: s.pages.page }));
      }
    });
  }

  /** @private */
  _listError(err) {
    const s = this._s;
    const n = normalizeError(err, null, { operation: 'list' });
    if (!n) return;
    this._emit('operation-error', { operation: 'list', code: n.code, retryable: n.retryable });
    s.els.errorText.textContent = n.userMessage || this._t(`error.${n.code}`);
    s.els.retry.hidden = !n.retryable;
    s.els.skeleton.hidden = true;
    s.els.empty.hidden = true;
    s.els.grid.hidden = true;
    s.els.error.hidden = false;
  }

  /** @private skeleton cards while a page loads */
  _showLoading() {
    const e = this._s.els;
    e.error.hidden = true;
    e.empty.hidden = true;
    e.grid.hidden = true;
    e.skeleton.hidden = false;
  }

  /** @private */
  _showResults() {
    const e = this._s.els;
    e.skeleton.hidden = true;
    e.error.hidden = true;
    e.empty.hidden = true;
    e.grid.hidden = false;
  }

  /** @private replace the grid content with a page (silent clear before, silent re-select after) */
  _renderPage(page, announce) {
    const s = this._s;
    const grid = s.els.grid;
    if (typeof grid.clear === 'function') grid.clear();
    for (const el of s.items.values()) el.remove();
    s.items.clear();
    for (const a of page.items) {
      const el = this._itemEl(a);
      s.items.set(a.id, el);
      grid.appendChild(el);
    }
    if (!page.items.length) {
      const filtered = !!s.query || Object.keys(s.filters).length > 0;
      s.els.empty.setAttribute('title', this._t('empty'));
      if (filtered) s.els.empty.setAttribute('message', this._t('emptyHint'));
      else s.els.empty.removeAttribute('message');
      s.els.skeleton.hidden = true;
      s.els.error.hidden = true;
      grid.hidden = true;
      s.els.empty.hidden = false;
    } else {
      this._showResults();
    }
    this._syncGrid();
    if (announce) this._announce(this._t('resultsCount', { n: page.total ?? page.items.length }));
  }

  /** @private pager (decision 13): hidden on one page; cursor ‹ › + text, or a silent td-pagination */
  _renderPager(busyButton = null) {
    const s = this._s;
    const e = s.els;
    const ps = s.pages;
    const visible = !!ps.visible;
    e.pager.hidden = !visible;
    if (!visible) return;
    const pagesUi = ps.ui === 'pages';
    e.cursorBox.hidden = pagesUi;
    e.pagination.hidden = !pagesUi;
    if (pagesUi) {
      const pg = e.pagination;
      const set = (k, v) => { if (pg.getAttribute(k) !== String(v)) pg.setAttribute(k, String(v)); };
      set('total-items', ps.total ?? 0);
      set('items-per-page', ps.pageSize);
      set('current-page', ps.page);
      return;
    }
    // single-flight (cursor): while a page request runs, the clicked button shows `loading`, the other is disabled
    const pending = !!ps.pending;
    if (busyButton && pending) busyButton.setAttribute('loading', '');
    if (!pending) {
      e.prev.removeAttribute('loading');
      e.next.removeAttribute('loading');
    }
    const busy = (b) => b.hasAttribute('loading');
    e.prev.toggleAttribute('disabled', pending ? !busy(e.prev) : !ps.hasPrev);
    e.next.toggleAttribute('disabled', pending ? !busy(e.next) : !ps.hasNext);
    e.pageInfo.textContent = ps.total !== undefined && ps.from !== undefined
      ? this._t('pageInfo', { from: ps.from, to: ps.to, total: ps.total })
      : this._t('page', { n: ps.page });
  }

  /** @private */
  _loadFacets({ fresh = false } = {}) {
    const s = this._s;
    if (!s || this._settled || typeof s.adapter.facets !== 'function') return;
    const state = { query: s.query, filters: s.filters };
    const key = requestKey(state, null);
    // `fresh`: the descriptors changed under us (reconciliation) — a cached older descriptor set must never come back
    const cached = fresh ? undefined : s.cache.getFacets(key);
    if (cached) {
      s.req.facets.abort();
      this._renderFacets(cached);
      return;
    }
    s.req.facets.run((signal) => s.adapter.facets({ query: s.query, filters: buildListRequest({ ...state, pageSize: 0 }).filters,
      ...(s.context !== undefined ? { context: s.context } : {}), signal })).then((r) => {
      if (r.stale || !this._live(s)) return;
      if ('error' in r) {
        const n = normalizeError(r.error, null, { operation: 'facets' });
        if (n) this._emit('operation-error', { operation: 'facets', code: n.code, retryable: n.retryable });
        return;
      }
      const list = normalizeFacets(r.value, { warn: (m) => warnOnce(`facets:${m}`, m) });
      s.cache.setFacets(key, list);
      this._renderFacets(list);
    });
  }

  /** @private create / update facet controls; values are kept across descriptor reloads */
  _renderFacets(list) {
    const s = this._s;
    const box = s.els.facets;
    const keys = new Set(list.map((f) => f.key));
    let filtersChanged = false;
    for (const [k, c] of s.facets) {
      if (keys.has(k)) continue;
      c.destroy();
      c.el.remove();
      s.facets.delete(k);
      if (k in s.filters) {
        delete s.filters[k];
        filtersChanged = true; // impl review ISSUE-9: an active filter went away with its facet
      }
    }
    for (const f of list) {
      let c = s.facets.get(f.key);
      if (c && c.type !== f.type) {
        // impl review #8: the type changed → a new control; the typed filter is re-applied when the new control accepts
        // it (read back through the control), else cleared — control and filters stay consistent
        c.destroy();
        c.el.remove();
        s.facets.delete(f.key);
        c = null;
        const before = s.filters[f.key];
        const fresh = createFacetControl(f, { idPrefix: `${s.id}-f`, onChange: () => this._onFacetChange(f.key) });
        s.facets.set(f.key, fresh);
        if (before !== undefined) {
          fresh.set(f.type === 'multiple' && !Array.isArray(before) ? [before] : before);
          const after = fresh.get();
          if (after === undefined || (Array.isArray(after) && !after.length)) delete s.filters[f.key];
          else s.filters[f.key] = after;
          filtersChanged = filtersChanged || JSON.stringify([before]) !== JSON.stringify([s.filters[f.key]])
            || typeof before !== typeof s.filters[f.key];
        }
        c = fresh;
      } else if (c) {
        c.setDescriptor(f);
      } else {
        c = createFacetControl(f, {
          idPrefix: `${s.id}-f`,
          onChange: () => this._onFacetChange(f.key),
        });
        s.facets.set(f.key, c);
        if (s.filters[f.key] !== undefined) c.set(s.filters[f.key]);
      }
      box.appendChild(c.el); // keeps descriptor order
    }
    box.hidden = list.length === 0;
    if (filtersChanged) {
      // impl review ISSUE-9: reconciliation changed the filters → facets (counts) AND list follow the filters now in force
      s.cache.invalidateLists(); // older descriptor sets (and pages) cached for these filters are now stale
      this._loadFacets({ fresh: true });
      this._loadPage('reload', { reset: true });
    }
  }

  /** @private */
  _onFacetChange(key) {
    const s = this._s;
    const c = s.facets.get(key);
    if (!c) return;
    const v = c.get();
    if (v === undefined || (Array.isArray(v) && !v.length)) delete s.filters[key];
    else s.filters[key] = v;
    s.debounce.cancel();
    if (s.els.search) s.query = String(s.els.search.getValue?.() ?? '').trim();
    this._loadFacets();
    this._loadPage('reload', { reset: true });
  }

  // --- grid + selection (decisions 11-12, 15-17) ---

  /** @private */
  _visibleKind(asset) {
    const k = this._s.kinds;
    return !k || !k.length || k.includes(asset.kind);
  }

  /** @private */
  _selectable(asset) {
    return !!asset && asset.status === 'ready' && this._visibleKind(asset);
  }

  /** @private `{size} • {DD/MM/YYYY HH:mm}` parts that exist */
  _cardMeta(asset) {
    return [asset.byteSize ? formatFileSize(asset.byteSize) : '', this._dateTime(asset.createdAt)].filter(Boolean).join(' • ');
  }

  /** @private one grid card (DOM API, text only) — decision 11 */
  _itemEl(asset) {
    const item = document.createElement('div');
    item.setAttribute('data-td-media-item', '');
    item.setAttribute('data-id', asset.id);
    item.className = 'td-media-picker__card';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'td-media-picker__open';
    open.setAttribute('data-td-media-open', '');
    item.appendChild(open);
    this._paintItem(item, asset);
    return item;
  }

  /** @private (re)paint a card from an asset snapshot */
  _paintItem(item, asset) {
    const s = this._s;
    item.setAttribute('data-kind', asset.kind);
    item.setAttribute('data-status', asset.status);
    item.toggleAttribute('data-viewing', s.detailId === asset.id);
    const open = /** @type {HTMLElement} */ (item.querySelector('.td-media-picker__open'));
    const statusText = asset.status !== 'ready' ? this._t(`status.${asset.status}`) : '';
    const name = asset.name || asset.id;
    const meta = this._cardMeta(asset);
    open.setAttribute('aria-label', [name, meta, statusText].filter(Boolean).join(' — '));
    open.replaceChildren();
    const thumb = document.createElement('span');
    thumb.className = 'td-media-picker__thumb';
    thumb.setAttribute('aria-hidden', 'true');
    const src = asset.urls.thumbnail || asset.urls.preview;
    if (src && asset.kind !== 'file') {
      const img = document.createElement('img');
      img.alt = '';
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
      img.setAttribute('referrerpolicy', 'no-referrer');
      img.src = src;
      thumb.appendChild(img);
    } else {
      const ic = document.createElement('span');
      ic.className = 'td-media-picker__thumb-icon';
      const svg = tdIcon(KIND_ICON[asset.kind] || 'file', { size: 'xl' });
      if (svg) ic.appendChild(svg);
      thumb.appendChild(ic);
    }
    if (asset.kind === 'video') {
      const b = document.createElement('span');
      b.className = 'td-media-picker__kind';
      const svg = tdIcon('video', { size: 's' });
      if (svg) b.appendChild(svg);
      thumb.appendChild(b);
    }
    if (statusText) {
      const st = document.createElement('span');
      st.className = 'td-media-picker__status';
      st.textContent = statusText;
      thumb.appendChild(st);
    }
    const info = document.createElement('span');
    info.className = 'td-media-picker__info';
    info.setAttribute('aria-hidden', 'true');
    const nm = document.createElement('span');
    nm.className = 'td-media-picker__name';
    nm.textContent = name;
    nm.title = name;
    const mt = document.createElement('span');
    mt.className = 'td-media-picker__meta';
    mt.textContent = meta;
    info.append(nm, mt);
    if (asset.badges && asset.badges.length) info.appendChild(this._badges(asset));
    open.append(thumb, info);
  }

  /** @private td-badge row of an asset */
  _badges(asset) {
    const wrap = document.createElement('span');
    wrap.className = 'td-media-picker__badges';
    for (const b of asset.badges) {
      const sp = document.createElement('span');
      sp.className = TONES.includes(b.tone) ? `td-badge td-badge--${b.tone}` : 'td-badge';
      sp.textContent = b.label;
      wrap.appendChild(sp);
    }
    return wrap;
  }

  /** @private the "đang xem" marker (decision 12) */
  _markViewing() {
    const s = this._s;
    for (const [id, el] of s.items) el.toggleAttribute('data-viewing', id === s.detailId);
  }

  /** @private */
  _bindGrid() {
    const s = this._s;
    const grid = s.els.grid;
    const results = s.els.results;
    const itemOf = (node) => {
      const el = node instanceof Element ? node.closest('[data-td-media-item]') : null;
      return el && grid.contains(el) ? el : null;
    };
    // Single mode (review R1-2, R2-2): a FLIP in the grid (tick, Ctrl/Cmd/Shift+click, Space) has no "before select"
    // hook — clear the grid SILENTLY in the capture phase of an ancestor (before the grid's own capture listener) when
    // an UNSELECTED item is flipped while the grid has a selection; the grid then sees an empty selection, no anchor.
    const preClear = (item) => {
      if (s.mode !== 'single' || !item) return;
      const id = item.getAttribute('data-id');
      const sel = grid.selectedIds || [];
      if (sel.length && !sel.includes(id)) grid.clear();
    };
    results.addEventListener('click', (ev) => {
      if (ev.button !== 0) return;
      const item = itemOf(ev.target);
      if (!item) return;
      const t = /** @type {Element} */ (ev.target);
      if (t.closest('.td-media-grid__tick')
        || (t.closest('[data-td-media-open]') && (ev.shiftKey || ev.ctrlKey || ev.metaKey))) preClear(item);
    }, true);
    results.addEventListener('keydown', (ev) => {
      if (ev.key !== ' ' || ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const t = /** @type {Element} */ (ev.target);
      if (!t.closest || !t.closest('[data-td-media-open]')) return;
      preClear(itemOf(t));
    }, true);
    // select-mode="tick": a plain click / Enter on the opener ALWAYS activates
    grid.addEventListener('activate', (ev) => {
      ev.preventDefault();
      const id = ev.detail.id;
      const asset = s.cache.getAsset(id);
      if (!asset) { this._syncGrid(true); return; }
      if (s.mode === 'multiple') {
        this._showDetail(id, { fromGrid: true }); // decision 15: click / Enter = view only
        return;
      }
      this._selectSingle(id, asset);
    });
    grid.addEventListener('select-change', (ev) => this._onGridChange(ev.detail));
  }

  /**
   * @private Single mode: select `id` + view it (decision 16). Order: grid re-synced to the model at once (a provisional
   * grid flip never shows), a dirty detail form asks FIRST (declined / closed / another session → nothing changes, no
   * event), then model + detail + grid.
   */
  async _selectSingle(id, asset) {
    const s = this._s;
    this._syncGrid(true);
    if (s.detailId !== id && this._editBusy()) {
      if (!(await this._confirmDiscard())) {
        if (this._live(s)) this._syncGrid(true);
        return;
      }
      if (!this._live(s)) return;
      this._dropEdit();
    }
    if (!this._selectable(asset)) {
      this._announce(this._t('notReady'));
    } else {
      this._userChange(() => s.model.replace(asset));
    }
    this._showDetail(id, { gated: false, fromGrid: true });
    this._syncGrid(true);
  }

  /** @private a user flip in the grid → the model (the model is the source of truth) */
  _onGridChange({ added = [], removed = [] }) {
    const s = this._s;
    const grid = s.els.grid;
    if (s.mode === 'single') {
      if (added.length === 1) {
        const asset = s.cache.getAsset(added[0]);
        if (asset) {
          this._selectSingle(added[0], asset); // decision 16: Space goes through here, same order as a click
          return;
        }
      }
      if (!added.length && removed.length) {
        this._userChange(() => { for (const id of removed) s.model.remove(id); });
      }
      // more than one added must not happen (pre-clear): treat as a sync error — keep the model, rewrite the grid
      this._syncGrid(true);
      return;
    }
    const veto = [];
    let limited = false;
    let notReady = false;
    this._userChange(() => {
      for (const id of removed) s.model.remove(id);
      for (const id of added) {
        const asset = s.cache.getAsset(id);
        if (!this._selectable(asset)) { veto.push(id); notReady = true; continue; }
        if (!s.model.add(asset)) { veto.push(id); limited = true; }
      }
    });
    if (veto.length) grid.deselect(veto);
    if (notReady) this._announce(this._t('notReady'));
    else if (limited) this._announce(this._t('limit', { max: s.model.max }));
    this._syncGrid();
  }

  /**
   * @private run a USER selection change: the initialIds transaction is cancelled synchronously (decision 15) when the
   * model changed; grid / footer re-sync; `selection-change` with the diff.
   * @param {() => void} mutate
   */
  _userChange(mutate) {
    const s = this._s;
    const before = s.model.ids;
    const rev = s.model.revision;
    mutate();
    if (s.model.revision === rev) return;
    if (s.initial) s.initial.invalidate();
    const after = s.model.ids;
    const addedIds = after.filter((id) => !before.includes(id));
    const removedIds = before.filter((id) => !after.includes(id));
    this._syncGrid();
    this._renderSelection();
    this._emit('selection-change', { selection: buildOutcome(s.model).selection, addedIds, removedIds });
  }

  /** @private mirror the model into the grid (silent) + the grid cap */
  _syncGrid(force = false) {
    const s = this._s;
    const grid = s.els.grid;
    if (typeof grid.select !== 'function') return;
    const view = [...s.items.keys()];
    const { gridMax } = s.model.capacity(view);
    if (gridMax === null) grid.removeAttribute('max');
    else grid.setAttribute('max', String(gridMax));
    const want = view.filter((id) => s.model.has(id));
    if (force) grid.clear();
    const have = grid.selectedIds || [];
    const drop = have.filter((id) => !s.model.has(id));
    if (drop.length) grid.deselect(drop);
    const add = want.filter((id) => !have.includes(id));
    if (add.length) grid.select(add);
  }

  /** @private footer: confirm label / state, selection count + "Bỏ chọn tất cả" (multiple), initial-loading note */
  _renderSelection() {
    const s = this._s;
    const e = s.els;
    const n = s.model.size;
    const label = s.mode === 'multiple' && n ? this._t('confirmCount', { n }) : this._t('confirm', { n });
    if (e.confirm.getAttribute('label') !== label) e.confirm.setAttribute('label', label);
    e.confirm.toggleAttribute('disabled', n === 0);
    if (s.mode === 'multiple') {
      e.selcount.textContent = s.model.max === Infinity ? this._t('selected', { n }) : this._t('selectedMax', { n, max: s.model.max });
      e.selcount.setAttribute('data-count', String(n));
      e.clear.hidden = n === 0;
    }
    e.loadingNote.hidden = !(s.initial && s.initial.pending);
  }

  // --- detail panel (decisions 18-19) ---

  /** @private */
  _setView(view) {
    this._s.root.setAttribute('data-view', view);
  }

  /** @private */
  _isNarrow() {
    return matchesBelow('md'); // ADR 0014: < 720 (v0.33: < 768)
  }

  /**
   * @private Open the detail of `id`. `gated` (default): a dirty form of ANOTHER asset asks first (keep → nothing
   * changes). The same id keeps the current panel (and what the user typed).
   * @param {string} id
   * @param {{ gated?: boolean, fromGrid?: boolean }} [o]
   */
  async _showDetail(id, { gated = true } = {}) {
    const s = this._s;
    if (s.detailId === id && s.root.querySelector('.td-media-picker__detail[data-state="ready"]')) {
      this._setView('detail');
      if (this._isNarrow()) this._focusDetailHeading();
      return;
    }
    if (gated && this._editBusy()) {
      if (!(await this._confirmDiscard())) return;
      if (!this._live(s)) return;
    }
    this._dropEdit();
    s.detailId = id;
    s.blocked = null;
    this._markViewing();
    this._setView('detail');
    this._renderDetail(true);
    if (this._isNarrow()) this._focusDetailHeading();
    s.req.detail.run((signal) => s.adapter.get(id, { context: s.context, signal })).then((r) => {
      if (r.stale || !this._live(s) || s.detailId !== id) return;
      s.els.detail.removeAttribute('data-loading');
      if ('error' in r) {
        const n = normalizeError(r.error, null, { operation: 'get' });
        if (n) this._emit('operation-error', { operation: 'get', code: n.code, retryable: n.retryable });
        if (!s.cache.getAsset(id)) this._renderDetail();
        return;
      }
      const asset = normalizeAsset(r.value, { safeUrl: safeMediaUrl, metadataKeys: s.metaKeys });
      if (!asset || asset.id !== id) return;
      this._applyFreshAsset(asset);
    });
  }

  /** @private */
  _focusDetailHeading() {
    const s = this._s;
    const h = s.els.detail.querySelector('.td-media-picker__detail-name') || s.els.detail.querySelector('.td-media-picker__back');
    this._focus(/** @type {HTMLElement|null} */ (h));
  }

  /** @private a fresh snapshot of an asset → cache, grid card, selection, detail (a dirty form is kept) */
  _applyFreshAsset(asset) {
    const s = this._s;
    s.cache.putAsset(asset);
    const item = s.items.get(asset.id);
    if (item) this._paintItem(item, asset);
    if (s.model.has(asset.id)) {
      s.model.update(asset);
      this._renderSelection();
    }
    if (s.detailId === asset.id && !this._editBusy()) this._renderDetail();
  }

  /** @private (re)render the detail panel; the focus stays on the same control when it was inside */
  _renderDetail(loading = false) {
    const s = this._s;
    const box = s.els.detail;
    const had = document.activeElement && box.contains(document.activeElement) ? document.activeElement : null;
    let restore = null;
    if (had) {
      const field = had.closest('.td-media-picker__field');
      if (field) restore = `.td-media-picker__field[data-key="${CSS.escape(field.getAttribute('data-key') || '')}"]`;
      else {
        const host = had.closest('td-button, td-copy, .td-media-picker__detail-name');
        const cls = host && [...host.classList].find((c) => c.startsWith('td-media-picker__'));
        if (cls) restore = `.${cls}`;
      }
    }
    this._paintDetail(loading);
    if (had && !had.isConnected) {
      const el = restore ? box.querySelector(restore) : null;
      const target = el ? (el.querySelector('input, textarea, button, [tabindex]') || el) : box.querySelector('.td-media-picker__detail-name');
      this._focus(/** @type {HTMLElement|null} */ (target));
    }
  }

  /** @private */
  _paintDetail(loading) {
    const s = this._s;
    const t = (k, p) => this._t(k, p);
    const box = s.els.detail;
    if (s.edit) { try { s.edit.form.destroy(); } catch { /* ignore */ } s.edit = null; }
    box.replaceChildren();
    const back = makeButton(t('back'), { variant: 'ghost', size: 'sm', icon: 'back', cls: 'td-media-picker__back' });
    back.addEventListener('click', () => { if (usable(back)) this._closeDetail(); });
    box.appendChild(back);
    const asset = s.detailId ? s.cache.getAsset(s.detailId) : null;
    box.toggleAttribute('data-loading', !!loading && !!asset);
    if (!asset) {
      if (s.detailId && loading) {
        box.setAttribute('data-state', 'ready');
        box.appendChild(this._detailSkeleton());
        return;
      }
      box.setAttribute('data-state', 'empty');
      const es = document.createElement('td-empty-state');
      es.className = 'td-media-picker__detail-empty';
      es.setAttribute('icon', 'image');
      es.setAttribute('size', 'sm');
      es.setAttribute('compact', '');
      es.setAttribute('heading-level', '3');
      es.setAttribute('title', t('detailEmpty'));
      es.setAttribute('message', t('detailEmptyHint'));
      box.appendChild(es);
      return;
    }
    box.setAttribute('data-state', 'ready');
    // 1. square preview, contain (video: poster only, never a player)
    const fig = document.createElement('div');
    fig.className = 'td-media-picker__preview';
    fig.setAttribute('data-kind', asset.kind);
    const src = asset.urls.preview || asset.urls.thumbnail;
    if (src && asset.kind !== 'file') {
      const img = document.createElement('img');
      img.alt = asset.defaultAltText || '';
      img.setAttribute('decoding', 'async');
      img.setAttribute('loading', 'lazy');
      img.setAttribute('referrerpolicy', 'no-referrer');
      img.src = src;
      fig.appendChild(img);
    } else {
      const wrap = document.createElement('span');
      wrap.className = 'td-media-picker__preview-file';
      const ic = document.createElement('span');
      ic.className = 'td-media-picker__thumb-icon';
      ic.setAttribute('aria-hidden', 'true');
      const svg = tdIcon(KIND_ICON[asset.kind] || 'file', { size: 'xl' });
      if (svg) ic.appendChild(svg);
      const fn = document.createElement('span');
      fn.textContent = asset.name || asset.id;
      wrap.append(ic, fn);
      fig.appendChild(wrap);
    }
    if (asset.kind === 'video') {
      const b = document.createElement('span');
      b.className = 'td-media-picker__kind';
      b.setAttribute('aria-hidden', 'true');
      const svg = tdIcon('video', { size: 's' });
      if (svg) b.appendChild(svg);
      fig.appendChild(b);
    }
    box.appendChild(fig);
    // 2. "TÊN FILE" + value (the pane heading)
    const group = document.createElement('div');
    group.className = 'td-media-picker__field-group';
    const lbl = document.createElement('p');
    lbl.className = 'td-media-picker__label';
    lbl.id = `${s.id}-fn`;
    lbl.textContent = t('fileName');
    const h = document.createElement('h3');
    h.className = 'td-media-picker__detail-name';
    h.tabIndex = -1;
    h.textContent = asset.name || asset.id;
    group.append(lbl, h);
    box.appendChild(group);
    if (asset.badges && asset.badges.length) box.appendChild(this._badges(asset));
    // 3. metadata form — always open when editable, readonly text otherwise (decision 18)
    const editable = canDo('editMetadata', s.adapter, s.caps, asset);
    let saveBtn = null;
    if (s.assetFields.length) {
      const form = new FieldForm(s.assetFields, {
        asset,
        values: asset.metadata,
        idPrefix: `${s.id}-af`,
        signal: s.ctrl.signal,
        readonly: !editable,
        warn: (...a) => console.warn(...a),
        onDirtyChange: () => this._syncSave(),
      });
      const notice = document.createElement('div');
      notice.className = 'td-media-picker__notice';
      notice.setAttribute('role', 'alert');
      notice.hidden = true;
      if (editable) {
        form.el.addEventListener('keydown', (ev) => this._onFormKey(ev));
        saveBtn = makeButton(t('save'), { variant: 'success', size: 'sm', icon: 'check', cls: 'td-media-picker__save' });
        saveBtn.addEventListener('click', () => { if (usable(saveBtn)) this._save(); });
      }
      box.append(form.el, notice);
      s.edit = { form, asset, notice, save: saveBtn, id: asset.id, editable };
    }
    // 4. facts
    const hr1 = document.createElement('hr');
    hr1.className = 'td-media-picker__divider';
    box.appendChild(hr1);
    const dl = document.createElement('dl');
    dl.className = 'td-media-picker__facts';
    const row = (k, v) => {
      if (v === '' || v == null) return;
      const r = document.createElement('div');
      r.className = 'td-media-picker__fact';
      const dt = document.createElement('dt');
      dt.textContent = `${t(`meta.${k}`)}:`;
      const dd = document.createElement('dd');
      dd.textContent = String(v);
      r.append(dt, dd);
      dl.appendChild(r);
    };
    row('size', asset.byteSize ? formatFileSize(asset.byteSize) : '');
    row('dimensions', asset.width && asset.height ? t('meta.dimensionsValue', { w: asset.width, h: asset.height }) : '');
    row('type', [t(`kind.${asset.kind}`), asset.mimeType].filter(Boolean).join(' / '));
    row('date', this._dateTime(asset.createdAt));
    row('uploadedBy', asset.uploadedByLabel || '');
    if (asset.status !== 'ready') row('status', t(`status.${asset.status}`));
    box.appendChild(dl);
    // 5. actions: Tải về · Copy · Xoá · Lưu (each only when offered)
    const actions = document.createElement('div');
    actions.className = 'td-media-picker__detail-actions';
    if (canDo('downloadOriginal', s.adapter, s.caps, asset) && typeof s.adapter.download === 'function') {
      const dlb = makeButton(t('download'), { size: 'sm', icon: 'download', cls: 'td-media-picker__download' });
      dlb.addEventListener('click', () => { if (usable(dlb)) dlb.run(() => this._download(asset)); });
      actions.appendChild(dlb);
    }
    const copyUrl = canDo('copyLink', s.adapter, s.caps, asset) ? this._absoluteUrl(asset.urls.preview) : '';
    if (copyUrl) {
      const cp = /** @type {any} */ (document.createElement('td-copy'));
      cp.className = 'td-media-picker__copy';
      cp.setAttribute('size', 'sm');
      cp.setAttribute('label', t('copyLink'));
      cp.setAttribute('value', copyUrl);
      actions.appendChild(cp);
    }
    if (canDo('delete', s.adapter, s.caps, asset) && typeof s.adapter.delete === 'function') {
      const del = makeButton(t('delete'), { variant: 'danger', size: 'sm', icon: 'trash', cls: 'td-media-picker__delete' });
      del.addEventListener('click', () => { if (usable(del)) this._confirmDelete(asset); });
      actions.appendChild(del);
    }
    if (saveBtn) actions.appendChild(saveBtn);
    if (actions.childNodes.length) {
      const hr2 = document.createElement('hr');
      hr2.className = 'td-media-picker__divider';
      box.append(hr2, actions);
    }
    if (s.blocked && s.blocked.id === asset.id) box.appendChild(this._blockedAlert(s.blocked.result));
    this._syncSave();
  }

  /** @private skeleton of the panel (dcms2 layout): square preview, name, two fields, facts */
  _detailSkeleton() {
    const wrap = document.createElement('div');
    wrap.className = 'td-media-picker__detail-skeleton';
    wrap.setAttribute('aria-hidden', 'true');
    const add = (cls) => {
      const d = document.createElement('div');
      d.className = cls;
      wrap.appendChild(d);
    };
    add('td-skeleton td-skeleton--rect td-media-picker__skeleton-thumb');
    add('td-skeleton td-skeleton--text td-media-picker__skeleton-short');
    add('td-skeleton td-skeleton--text');
    add('td-skeleton td-skeleton--text');
    add('td-skeleton td-skeleton--text td-skeleton--lines-3');
    return wrap;
  }

  /** @private an http(s) URL made absolute (copy link), '' when unsafe */
  _absoluteUrl(url) {
    const safe = safeMediaUrl(url);
    if (!safe) return '';
    try { return new URL(safe, document.baseURI).href; } catch { return ''; }
  }

  /** @private Save enabled only when the form is dirty and no save runs (decision 18) */
  _syncSave() {
    const s = this._s;
    const ed = s && s.edit;
    if (!ed || !ed.save) return;
    const saving = s.req.update.pending;
    ed.save.toggleAttribute('disabled', !ed.form.dirty && !saving);
    ed.save.toggleAttribute('loading', saving);
  }

  /**
   * @private Enter in a single-line text / url field = save (field scope only); Ctrl/Cmd+Enter anywhere in the form
   * (re-dispatched from the field wrapper by media-picker-fields.js) = save. Never a global Enter.
   */
  _onFormKey(ev) {
    if (ev.key !== 'Enter' || ev.isComposing || ev.altKey) return;
    const mod = isMac() ? ev.metaKey : ev.ctrlKey;
    const t = /** @type {Element} */ (ev.target);
    const singleLine = !ev.ctrlKey && !ev.metaKey && !ev.shiftKey && t instanceof HTMLInputElement
      && !!t.closest('td-input-field') && !!t.closest('.td-media-picker__field');
    if (!mod && !singleLine) return;
    ev.preventDefault();
    ev.stopPropagation();
    this._save();
  }

  /** @private the date-time text `DD/MM/YYYY HH:mm` (vi) through Intl in `locale` */
  _dateTime(iso) {
    if (typeof iso !== 'string' || !iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const locale = this._s.opts.locale || 'vi-VN';
    try {
      const fmt = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit',
        minute: '2-digit', hourCycle: 'h23' });
      if (/^vi\b/i.test(locale)) {
        const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
        return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
      }
      return fmt.format(d);
    } catch {
      return d.toISOString().slice(0, 16).replace('T', ' ');
    }
  }

  /** @private mobile "Quay lại" from the detail pane (gated when the form is dirty); focus back on the card */
  async _closeDetail() {
    const s = this._s;
    if (this._editBusy()) {
      if (!(await this._confirmDiscard())) return;
      if (!this._live(s)) return;
      this._dropEdit();
      this._renderDetail();
    }
    const id = s.detailId;
    this._setView('grid');
    const item = id ? s.items.get(id) : null;
    const open = item ? /** @type {HTMLElement} */ (item.querySelector('[data-td-media-open]')) : null;
    this._focus(open || this._searchInput() || s.els.dialog);
  }

  /** @private the form is dirty or a save is running */
  _editBusy() {
    const s = this._s;
    return !!s.edit && s.edit.editable && (s.edit.form.dirty || s.req.update.pending);
  }

  /** @private drop the form state of the current detail (abort a running save / reload / option loads) */
  _dropEdit() {
    const s = this._s;
    s.req.update.abort();
    s.req.reload.abort();
    if (s.edit) {
      try { s.edit.form.destroy(); } catch { /* ignore */ }
      s.edit = null;
    }
  }

  /** @private explicit save (no autosave) */
  _save() {
    const s = this._s;
    const ed = s.edit;
    if (!ed || !ed.editable || s.req.update.pending || !ed.form.dirty) return;
    ed.form.clearErrors();
    ed.notice.hidden = true;
    ed.notice.replaceChildren();
    const fields = ed.form.values();
    const patch = { fields };
    if (ed.asset.version !== undefined) patch.version = ed.asset.version;
    const id = ed.id;
    const run = s.req.update.run((signal) => s.adapter.update(id, patch, { context: s.context, signal }));
    this._syncSave();
    run.then((r) => {
      if (r.stale || !this._live(s) || s.edit !== ed) return;
      this._syncSave();
      if ('error' in r) {
        const n = normalizeError(r.error, null, { operation: 'update' });
        if (!n) return;
        this._emit('operation-error', { operation: 'update', code: n.code, retryable: n.retryable });
        if (n.code === 'conflict') {
          this._editNotice(n.userMessage || this._t('conflict'), true);
        } else if (n.fieldErrors.size) {
          ed.form.applyErrors(n);
          if (n.userMessage) this._editNotice(n.userMessage, false);
        } else {
          this._editNotice(n.userMessage || this._t(`error.${n.code}`), false);
        }
        return;
      }
      const asset = normalizeAsset(r.value, { safeUrl: safeMediaUrl, metadataKeys: s.metaKeys });
      if (!asset || asset.id !== id) {
        this._editNotice(this._t('error.server'), false);
        return;
      }
      s.cache.invalidateLists();
      ed.form.snapshot(); // clean now — the re-render below rebuilds the form from the saved values
      this._applyFreshAsset(asset);
      const msg = this._t('saved');
      this._announce(msg);
      try { TdToast.success(msg); } catch { /* ignore */ }
      this._emit('asset-change', { operation: 'update', asset });
      this._loadFacets();
      this._loadPage('reload', { keepGrid: true });
    });
  }

  /** @private alert text in the form; `reload` → "Tải lại" (conflict) */
  _editNotice(text, reload) {
    const s = this._s;
    const ed = s.edit;
    ed.notice.replaceChildren();
    const p = document.createElement('p');
    p.textContent = text;
    ed.notice.appendChild(p);
    if (reload) {
      const b = makeButton(this._t('reload'), { size: 'sm', cls: 'td-media-picker__reload' });
      b.addEventListener('click', () => {
        if (!usable(b)) return;
        s.req.reload.run((signal) => s.adapter.get(ed.id, { context: s.context, signal })).then((r) => {
          if (r.stale || !this._live(s) || s.edit !== ed) return;
          if ('error' in r) {
            const n = normalizeError(r.error, null, { operation: 'get' });
            if (n) {
              this._emit('operation-error', { operation: 'get', code: n.code, retryable: n.retryable });
              this._editNotice(n.userMessage || this._t(`error.${n.code}`), true);
            }
            return;
          }
          const asset = normalizeAsset(r.value, { safeUrl: safeMediaUrl, metadataKeys: s.metaKeys });
          if (!asset || asset.id !== ed.id) return;
          s.cache.putAsset(asset);
          ed.asset = asset;
          ed.form.setValues(asset.metadata, asset); // overwritten only now; visibleWhen sees the new asset (impl review #3)
          ed.form.snapshot();
          ed.notice.hidden = true;
          ed.notice.replaceChildren();
          const item = s.items.get(asset.id);
          if (item) this._paintItem(item, asset);
          if (s.model.has(asset.id)) s.model.update(asset);
        });
      });
      ed.notice.appendChild(b);
    }
    ed.notice.hidden = false;
  }

  // --- delete (decision 24) ---

  /** @private the delete slot of one asset */
  _delSlot(id) {
    const s = this._s;
    let r = s.del.get(id);
    if (!r) {
      r = new LatestRequest();
      s.del.set(id, r);
    }
    return r;
  }

  /** @private "Xoá": TdModal.confirm (text message) → adapter.delete inside onConfirm (the dialog stays busy) */
  _confirmDelete(asset) {
    const s = this._s;
    const t = (k, p) => this._t(k, p);
    const name = asset.name || asset.id;
    const done = TdModal.confirm({
      title: t('deleteTitle'),
      message: t('deleteMessage', { name }), // TEXT (never messageHtml): a name like <b>x</b> shows literally
      confirmText: t('deleteConfirm'),
      cancelText: t('deleteCancel'),
      confirmVariant: 'danger',
      onConfirm: () => this._runDelete(asset), // never rejects (a rejection would be logged raw by TdModal)
    });
    const top = TdModalStackManager.stack[TdModalStackManager.stack.length - 1];
    s.deleteConfirmId = top ? top.id : null;
    done.then(() => {
      if (this._s !== s) return;
      s.deleteConfirmId = null;
      // TdModal returns focus to its opener; when the detail re-rendered while the confirm was open (a late `get`),
      // that node is gone and the focus fell back to the dialog → put it on the panel's (new) "Xoá" instead
      if (!this._live(s) || !s.handle.layer.isTop()) return;
      const a = document.activeElement;
      if (a && a !== s.els.dialog && a !== document.body && s.els.dialog.contains(a)) return;
      if (s.detailId !== asset.id) return; // deleted: _onDeleted focuses the results heading
      const del = s.els.detail.querySelector('.td-media-picker__delete button');
      if (del instanceof HTMLElement) this._focus(del);
    });
  }

  /** @private @returns {Promise<void>} never rejects */
  _runDelete(asset) {
    const s = this._s;
    const id = asset.id;
    if (!this._live(s)) return Promise.resolve();
    const slot = this._delSlot(id);
    return slot.run((signal) => s.adapter.delete(id, { context: s.context, signal })).then((r) => {
      if (r.stale || !this._live(s)) return;
      if ('error' in r) {
        this._actionError('delete', r.error);
        return;
      }
      let res;
      try {
        res = normalizeDeleteResult(r.value, id);
      } catch (err) {
        this._actionError('delete', err);
        return;
      }
      if (res.status === 'deleted') this._onDeleted(asset);
      else this._onBlocked(id, res);
    }).catch(() => {});
  }

  /** @private a one-shot action failed (delete / download): operation-error + a toast with the curated text only */
  _actionError(operation, err, text) {
    const n = normalizeError(err, null, { operation });
    if (!n) return; // aborted: silent
    this._emit('operation-error', { operation, code: n.code, retryable: n.retryable });
    const msg = text || n.userMessage || this._t(`error.${n.code}`);
    this._announce(msg);
    try { TdToast.error(msg); } catch { /* ignore */ }
  }

  /** @private `deleted` → out of the selection, caches dropped, the CURRENT page reloaded, the detail empty */
  _onDeleted(asset) {
    const s = this._s;
    const id = asset.id;
    this._userChange(() => s.model.remove(id));
    s.cache.invalidateLists();
    if (s.detailId === id) {
      this._dropEdit();
      s.detailId = null;
      s.blocked = null;
      this._setView('grid');
      this._renderDetail();
    }
    const item = s.items.get(id);
    if (item) {
      item.remove();
      s.items.delete(id);
    }
    const msg = this._t('deleted', { name: asset.name || id });
    this._announce(msg);
    try { TdToast.success(msg); } catch { /* ignore */ }
    this._emit('asset-change', { operation: 'delete', id });
    this._loadFacets({ fresh: true });
    this._loadPage('reload', { keepGrid: true, stepBack: true });
    requestAnimationFrame(() => { if (this._live(s) && s.handle.layer.isTop()) this._focus(s.els.heading); });
  }

  /** @private `blocked` → a warning alert in the detail panel (removed when the asset changes) */
  _onBlocked(id, result) {
    const s = this._s;
    s.blocked = { id, result };
    if (s.detailId === id) {
      const old = s.els.detail.querySelector('.td-media-picker__blocked');
      const al = this._blockedAlert(result);
      if (old) old.replaceWith(al);
      else s.els.detail.appendChild(al);
    }
    this._announce(this._t('blockedText', { n: result.usageCount }));
  }

  /** @private the "Không xoá được" alert: count + up to 20 usages (links through safeLinkUrl) + "… và k nơi khác" */
  _blockedAlert(result) {
    const t = (k, p) => this._t(k, p);
    const al = document.createElement('td-alert');
    al.className = 'td-media-picker__blocked';
    al.setAttribute('variant', 'warning');
    al.setAttribute('heading', t('blockedHeading'));
    const p = document.createElement('p');
    p.textContent = t('blockedText', { n: result.usageCount });
    al.appendChild(p);
    const shown = result.usages.slice(0, USAGES_SHOWN);
    // usageCount ≥ usages.length (normalizeDeleteResult): everything not rendered is "… và k nơi khác", also when the
    // server sent a count without any summaries
    const remainder = Math.max(0, result.usageCount - shown.length);
    if (shown.length || remainder > 0) {
      const ul = document.createElement('ul');
      ul.className = 'td-media-picker__usages';
      for (const u of shown) {
        const li = document.createElement('li');
        const href = u.href ? safeLinkUrl(u.href) : '';
        let label;
        if (href) {
          label = document.createElement('a');
          label.href = href;
          label.target = '_blank';
          label.rel = 'noopener noreferrer';
        } else {
          label = document.createElement('span');
        }
        label.className = 'td-media-picker__usage';
        label.textContent = u.label;
        li.appendChild(label);
        if (u.kind) {
          const k = document.createElement('span');
          k.className = 'td-media-picker__usage-kind';
          k.textContent = ` (${u.kind})`;
          li.appendChild(k);
        }
        ul.appendChild(li);
      }
      if (remainder > 0) {
        const li = document.createElement('li');
        li.className = 'td-media-picker__usage-more';
        li.textContent = t('blockedMore', { k: remainder });
        ul.appendChild(li);
      }
      al.appendChild(ul);
    }
    return al;
  }

  // --- download (decision 25) ---

  /** @private @returns {Promise<void>} never rejects */
  _download(asset) {
    const s = this._s;
    const id = asset.id;
    if (!this._live(s)) return Promise.resolve();
    return s.req.download.run((signal) => s.adapter.download(id, { rendition: 'original', context: s.context, signal })).then((r) => {
      if (r.stale || !this._live(s)) return;
      if ('error' in r) {
        this._actionError('download', r.error);
        return;
      }
      let res;
      try {
        res = normalizeDownloadResult(r.value, { safeUrl: safeMediaUrl, now: Date.now(), fallbackName: asset.name || id });
      } catch (err) {
        const expired = !!err && /** @type {any} */ (err).code === 'expired';
        this._actionError('download', expired ? Object.assign(new Error('expired'), { code: 'server' }) : err,
          expired ? this._t('downloadExpired') : '');
        return;
      }
      this._saveFile(res);
    }).catch(() => {});
  }

  /**
   * @private A temporary `<a download>` clicked once, then removed — never a navigation of this page, never a blob in a
   * tab / window.open (a text/html blob would run under the site's origin).
   */
  _saveFile(res) {
    const s = this._s;
    const a = document.createElement('a');
    a.className = 'td-media-picker__download-link';
    a.hidden = true;
    a.rel = 'noopener noreferrer';
    a.download = res.filename;
    let blobUrl = '';
    if (res.kind === 'blob') {
      if (!(res.blob instanceof Blob)) return;
      blobUrl = URL.createObjectURL(res.blob);
      s.blobUrls.add(blobUrl);
      a.href = blobUrl; // same origin: the browser honours `download`
    } else {
      a.href = res.url;
      let cross = true;
      try { cross = new URL(res.url, document.baseURI).origin !== location.origin; } catch { cross = true; }
      if (cross) a.target = '_blank'; // `download` is ignored cross-origin: a new tab, never this page
    }
    s.els.dialog.appendChild(a);
    try { a.click(); } finally { a.remove(); }
    if (blobUrl) {
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        s.blobUrls.delete(blobUrl);
      }, 0);
    }
  }

  // --- finish gate (decision 12) ---

  /** @private something would be lost by finishing now */
  _dirty() {
    const s = this._s;
    let uploading = false;
    try { uploading = !!s.upload && s.upload.busy(); } catch { uploading = false; }
    return this._editBusy() || uploading;
  }

  /** @private the picker's own discard confirmation; one at a time (a second request while it is open → false) */
  _confirmDiscard() {
    const s = this._s;
    if (s.confirm) return Promise.resolve(false);
    const c = openDiscardConfirm((k) => this._t(k));
    s.confirm = c;
    return c.promise.then((ok) => {
      if (s.confirm === c) s.confirm = null;
      return ok && this._live(s);
    });
  }

  /**
   * @private The ONE finish gate for ×, "Đóng", Escape and "Chèn": clean → finish now; dirty → confirmation; yes →
   * abort everything and finish with the REQUESTED kind (selection as of the consent).
   * @param {'confirm'|'cancel'} kind
   * @param {string} reason
   */
  async _requestFinish(kind, reason) {
    const s = this._s;
    // s.crop: the crop step is open over the picker — its own Quay lại / Chèn decide (no double finish, decision 24)
    if (!s || this._settled || s.confirm || s.crop) return;
    if (kind === 'confirm' && s.model.size === 0) {
      this._announce(this._t('selectFirst'));
      return;
    }
    if (this._dirty()) {
      const ok = await this._confirmDiscard();
      if (!ok || !this._live(s)) return;
      if (kind === 'confirm' && s.model.size === 0) {
        this._announce(this._t('selectFirst'));
        return;
      }
    }
    if (s.crop) return; // opened while the discard confirmation was answered (cannot happen through the UI)
    const cropAsset = kind === 'confirm' ? this._cropTarget() : null;
    if (cropAsset) {
      this._openCrop(cropAsset);
      return;
    }
    const outcome = kind === 'confirm' ? buildOutcome(s.model) : cancelledOutcome(/** @type {any} */ (reason));
    this._teardown(outcome, false);
  }

  // --- crop step (v0.35 decisions 23-26) ---

  /**
   * @private The asset "Chèn" must crop first: `crop` resolved (single mode only — resolveOptions drops it for
   * multiple), exactly one selected asset, `kind === 'image'`. Video / file → null (finish now, crop null).
   * @returns {import('../utils/media-picker-core.js').MediaAsset|null}
   */
  _cropTarget() {
    const s = this._s;
    if (!s.opts.cropResolved || s.mode !== 'single' || s.model.size !== 1) return null;
    const asset = s.model.assets[0];
    return asset && asset.kind === 'image' ? asset : null;
  }

  /**
   * @private Open the crop step: the shared crop dialog (crop-dialog.js), nested over the picker. Its source is the
   * asset's `urls.preview` (adapter contract: the WHOLE, uncropped image, any size) through `safeMediaUrl`; the
   * original size comes from `asset.width/height` when both are positive integers (then `pixels` is filled and a
   * preview of another ratio fails closed in the dialog: Chèn locked). No safe preview URL → fail closed: the crop step
   * does not open, the picker stays open (selection kept) and its live region says so — never a finish without the
   * crop the app asked for. Quay lại / Escape / × → back to the picker, focus on "Chèn". Applied → the ONE end path with
   * `usage.crop` (whole image → null, already by the dialog) + `usage.focalPoint` (only with `allowFocalPoint`).
   * @param {import('../utils/media-picker-core.js').MediaAsset} asset
   */
  _openCrop(asset) {
    const s = this._s;
    if (!this._live(s) || s.crop) return;
    const cfg = s.opts.cropResolved;
    const src = safeMediaUrl(asset.urls && asset.urls.preview);
    if (!src) {
      this._announce(this._t('cropUnavailable'));
      return;
    }
    const dim = (v) => (Number.isInteger(v) && v >= 1 && v <= 100000 ? v : undefined);
    const naturalWidth = dim(asset.width);
    const naturalHeight = dim(asset.height);
    const known = naturalWidth !== undefined && naturalHeight !== undefined;
    const ctrl = new AbortController();
    const step = { ctrl };
    s.crop = step;
    const opener = /** @type {HTMLElement|null} */ (s.els.confirm.querySelector('button')) || s.els.confirm;
    let pending;
    try {
      pending = Promise.resolve(openCropDialog({
        src,
        alt: asset.defaultAltText || asset.name || '',
        naturalWidth: known ? naturalWidth : undefined,
        naturalHeight: known ? naturalHeight : undefined,
        aspectRatio: cfg.aspectRatio,
        crop: null,
        focalPoint: null,
        allowFocalPoint: cfg.allowFocalPoint,
        title: this._t('cropTitle'),
        confirmLabel: this._t('cropConfirm'),
        cancelLabel: this._t('cropBack'),
        nested: true,
        signal: ctrl.signal,
        opener,
      }));
    } catch (err) {
      pending = Promise.reject(err);
    }
    pending.then((res) => {
      if (!this._live(s) || s.crop !== step) return;
      s.crop = null;
      if (res && res.status === 'applied') {
        const usage = { crop: res.crop || null, focalPoint: cfg.allowFocalPoint ? (res.focalPoint || null) : null };
        this._teardown(buildOutcome(s.model, new Map([[asset.id, usage]])), false);
        return;
      }
      this._focusButton(s.els.confirm); // Quay lại / Escape / ×: the selection is kept
    }, () => {
      if (!this._live(s) || s.crop !== step) return;
      s.crop = null;
      warnOnce('crop-dialog', 'td-media-picker: the crop dialog could not open.');
      this._announce(this._t('cropUnavailable'));
      this._focusButton(s.els.confirm);
    });
  }

  /** @private Escape on the picker layer (popups / nested dialogs handle theirs): clears a non-empty search first */
  _onEscape() {
    const s = this._s;
    if (!s || this._settled) return;
    const f = s.els.search;
    if (f && f.contains(document.activeElement) && String(f.getValue?.() ?? '')) {
      f.setValue('');
      s.debounce.cancel();
      this._applyQuery('');
      return;
    }
    this._requestFinish('cancel', 'escape');
  }

  /**
   * @private The single end path (idempotent): abort every request / upload / option load, close the confirmations
   * of THIS picker, release the layer (now when `immediate`, else after the exit transition), settle once, emit.
   * @param {import('../utils/media-picker-core.js').PickerOutcome} outcome
   * @param {boolean} immediate
   */
  _teardown(outcome, immediate) {
    if (this._settled) return;
    this._settled = true;
    this._open = false;
    if (active === this) active = null;
    const s = this._s;
    if (s) {
      for (const r of Object.values(s.req)) r.abort();
      for (const r of s.del.values()) r.abort();
      if (s.initial) s.initial.invalidate();
      s.debounce.cancel();
      s.ctrl.abort();
      if (s.upload) { try { s.upload.destroy(); } catch { /* ignore */ } s.upload = null; }
      if (s.crop) { const c = s.crop; s.crop = null; c.ctrl.abort(); } // v0.35 decision 25: the crop step closes too
      if (s.edit) { try { s.edit.form.destroy(); } catch { /* ignore */ } s.edit = null; }
      for (const c of s.facets.values()) { try { c.destroy(); } catch { /* ignore */ } }
      for (const u of s.blobUrls) { try { URL.revokeObjectURL(u); } catch { /* ignore */ } }
      s.blobUrls.clear();
      if (s.confirm) {
        const c = s.confirm;
        s.confirm = null;
        try { TdModal.closeById(c.id); } catch { /* ignore */ }
      }
      if (s.deleteConfirmId) {
        const did = s.deleteConfirmId;
        s.deleteConfirmId = null;
        try { TdModal.closeById(did); } catch { /* ignore */ }
      }
      s.cache.clear();
      const handle = s.handle;
      const jsOwned = !!this._jsOwned;
      if (immediate) {
        handle.release();
      } else {
        const reason = outcome.status === 'cancelled' ? outcome.reason : 'confirm';
        handle.close(reason).then(() => {
          if (jsOwned && this.isConnected && !this._open) this.remove();
        });
      }
    }
    const resolve = this._resolve;
    this._resolve = null;
    if (outcome.status === 'selected') this._emit('confirm', { selection: outcome.selection });
    else this._emit('cancel', { reason: outcome.reason });
    if (resolve) resolve(outcome);
    if (immediate && this._jsOwned && this.isConnected) this.remove();
  }

  // --- focus / announce ---

  /** @private initial focus: search → first opener → dialog */
  _initialFocus() {
    const s = this._s;
    const activeEl = document.activeElement;
    if (activeEl && activeEl !== s.els.dialog && s.root.contains(activeEl)) return; // the user moved on
    if (s.handle && !s.handle.layer.isTop()) return;
    const first = /** @type {HTMLElement|null} */ (s.els.grid.querySelector('[data-td-media-open]'));
    this._focus(this._searchInput() || first || s.els.dialog);
  }

  /** @private */
  _focus(el) {
    if (!el || typeof el.focus !== 'function') return;
    try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
  }

  /** @private focus the inner control of a td-button host */
  _focusButton(b) {
    if (!b) return;
    this._focus(/** @type {HTMLElement|null} */ (b.querySelector('button, a')) || b);
  }

  /** @private one picker live-region update per task (the last message wins) */
  _announce(text) {
    const s = this._s;
    if (!s || !text) return;
    s.pendingAnnounce = text;
    if (s.announceQueued) return;
    s.announceQueued = true;
    queueMicrotask(() => {
      s.announceQueued = false;
      const live = s.els.live;
      if (live.textContent === s.pendingAnnounce) live.textContent = '';
      live.textContent = s.pendingAnnounce;
    });
  }
}

if (!customElements.get('td-media-picker')) customElements.define('td-media-picker', TdMediaPicker);
