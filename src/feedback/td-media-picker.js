/**
 * <td-media-picker> + TdMediaPicker.open() — v0.32.0 (plan v0.32.0-media-picker, ADR 0013). The reusable media-library
 * interaction shell: dialog / bottom sheet, search, facets, cursor "load more", loading / empty / error / retry, grid +
 * detail, single / multiple selection (+ maxItems, kept across queries), upload queue (progress, cancel, dedup result),
 * explicit metadata edit from descriptors, keyboard / focus / responsive / i18n, text-only rendering. The APP owns the
 * adapter (endpoints, envelopes, auth, permissions, DTO mapping, upload security, storage); the picker NEVER mutates
 * host content and never creates usages — it only resolves `SelectedMedia[]`.
 *
 * Token-native: needs td.css (modal.css shell + components/media-picker.css). Light DOM, CSP-strict (no style
 * attributes, no <style>, no inline handlers; every adapter / descriptor / message string → textContent; every URL →
 * safeMediaUrl), no globals.
 *
 * Shell: `openDialogLayer` + the td-modal DOM / CSS (root `.td-modal.td-modal--5xl.td-media-picker`), not TdModal.show()
 * (its × / Escape cannot be gated while edits are unsaved). One picker at a time.
 *
 * DOM (built with DOM APIs; `{id}` = per-open counter id):
 *   <div class="td-modal td-modal--5xl td-media-picker" data-state="opening|open|closing" data-view="grid|detail|upload|edit"
 *        data-mode="single|multiple" [data-filters-open]>
 *     <div class="td-modal__backdrop" aria-hidden="true"></div>
 *     <div class="td-modal__dialog … td-media-picker__dialog" role="dialog" aria-modal="true" aria-labelledby="{id}-title" tabindex="-1">
 *       <div class="td-modal__header"><h2 class="td-modal__title" id="{id}-title">…</h2><button class="td-modal__close">×</button></div>
 *       <div class="td-modal__body td-media-picker__body">
 *         <div class="td-media-picker__toolbar">[search] [filters toggle] <div class="td-media-picker__facets" id="{id}-facets"> [upload toggle]</div>
 *         [<section class="td-media-picker__upload" id="{id}-upload" hidden>fields + td-dropzone + notes</section>]
 *         <div class="td-media-picker__main">
 *           <section class="td-media-picker__results" aria-busy>td-media-grid + skeleton | td-empty-state | error + retry,
 *             count, "Tải thêm"</section>
 *           <aside class="td-media-picker__detail" data-state="empty|ready" [data-loading]>…</aside>
 *         </div>
 *       </div>
 *       <div class="td-modal__footer td-media-picker__footer">[tray] Huỷ · Chọn (n)</div>
 *       <span class="td-sr-only" role="status"></span>
 *     </div>
 *   </div>
 *
 * Events on the host (bubbles + composed): `selection-change { selection, addedIds, removedIds }` (user changes only),
 * `asset-change { operation: 'upload'|'update', asset, deduplication? }`, `confirm { selection }`, `cancel { reason }`,
 * `operation-error { operation: 'list'|'facets'|'get'|'upload'|'update', code, retryable }`.
 *
 * @element td-media-picker
 * @property {object} options - OpenMediaPickerOptions (merged over TdMediaPicker.defaults at open())
 * @fires selection-change
 * @fires asset-change
 * @fires confirm
 * @fires cancel
 * @fires operation-error
 */
import { openDialogLayer } from './dialog-layer.js';
import { TdModal } from './td-modal.js';
import { LAYERS } from '../utils/layers.js';
import { fillIconSlots, tdIcon } from '../icons/td-icon.js';
import { formatFileSize } from '../utils/dom-utils.js';
import { safeMediaUrl } from '../utils/media-url.js';
import {
  DefaultsRegistry, resolveOptions, cancelledOutcome, buildOutcome, normalizeAsset, normalizePage, normalizeFacets,
  normalizeFields, normalizeError, canDo, buildListRequest, requestKey, LatestRequest, SelectionModel, InitialLoad,
  Debouncer, SessionCache, formatLabel,
} from '../utils/media-picker-core.js';
import { createFacetControl, FieldForm, FIELD_LABELS } from './media-picker-fields.js';
import '../display/td-media-grid.js';
import '../display/td-empty-state.js';
import '../form/td-dropzone.js';

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
const SKELETON_TILES = 8;
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

export class TdMediaPicker extends HTMLElement {
  /**
   * Default texts (Vietnamese); override per site (`TdMediaPicker.labels.title = 'Media library'`) or per open through
   * `options.messages` (a string or `(params) => string`; dotted keys for nested ones: `'error.network'`). Always text.
   */
  static labels = {
    title: 'Thư viện media',
    close: 'Đóng',
    cancel: 'Huỷ',
    confirm: 'Chọn ({n})',
    search: 'Tìm media',
    searchPlaceholder: 'Tìm theo tên…',
    filters: 'Bộ lọc',
    filtersCount: 'Bộ lọc ({n})',
    upload: 'Tải lên',
    results: 'Kết quả',
    grid: 'Media',
    count: 'Hiển thị {n} / {total}',
    resultsCount: '{n} kết quả',
    loadMore: 'Tải thêm',
    loadedMore: 'Đã tải thêm {n}',
    empty: 'Chưa có media nào',
    emptyFiltered: 'Không có kết quả phù hợp',
    emptyHint: 'Thử từ khoá hoặc bộ lọc khác, hoặc tải lên file mới.',
    retry: 'Thử lại',
    back: 'Quay lại',
    detail: 'Chi tiết',
    detailEmpty: 'Chọn một mục để xem chi tiết.',
    edit: 'Sửa thông tin',
    save: 'Lưu',
    saved: 'Đã lưu',
    cancelEdit: 'Huỷ',
    discardTitle: 'Bỏ thay đổi?',
    discardMessage: 'Các thay đổi chưa lưu hoặc file đang tải lên sẽ bị huỷ.',
    discard: 'Bỏ thay đổi',
    keepEditing: 'Tiếp tục sửa',
    limit: 'Tối đa {max} mục',
    loadingInitial: 'Đang tải lựa chọn…',
    selected: 'Đã chọn {n}',
    selectedMax: 'Đã chọn {n}/{max}',
    clearSelection: 'Bỏ chọn tất cả',
    deselect: 'Bỏ chọn {name}',
    selectFirst: 'Hãy chọn ít nhất một mục.',
    notReady: 'Mục này chưa sẵn sàng để chọn.',
    uploaded: 'Đã tải lên {name}',
    reused: '{name} đã có trong thư viện — dùng lại ảnh cũ',
    uploadError: 'Tải lên thất bại',
    uploadNeedsFields: 'Điền các trường bắt buộc trước khi tải lên.',
    conflict: 'Media đã bị thay đổi ở nơi khác.',
    reload: 'Tải lại',
    video: 'Video',
    kind: { image: 'Ảnh', video: 'Video', file: 'File' },
    status: { pending: 'Đang chờ', processing: 'Đang xử lý', failed: 'Lỗi', archived: 'Đã lưu trữ' },
    meta: { kind: 'Loại', size: 'Dung lượng', dimensions: 'Kích thước', date: 'Ngày tải', uploadedBy: 'Người tải' },
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
   * Texts of the descriptor / facet controls (facet placeholder "Tất cả", create row, general-errors list name, create
   * error); the same object the controls read at use time — override per site: `TdMediaPicker.fieldLabels.all = 'All'`.
   */
  static fieldLabels = FIELD_LABELS;

  /**
   * Module-level defaults (decision 6): REPLACES the whole default object on every call (one call in the site
   * bootstrap). Keys: adapter, capabilities, assetFields, uploadFields, messages, context, upload, pageSize. An adapter
   * without list() / get() → TypeError (previous defaults kept).
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
      nextCursor: null,
      total: undefined,
      /** @type {Map<string, HTMLElement>} grid items by id */
      items: new Map(),
      req: { list: new LatestRequest(), more: new LatestRequest(), facets: new LatestRequest(), detail: new LatestRequest(),
        update: new LatestRequest(), reload: new LatestRequest() },
      debounce: new Debouncer(SEARCH_DEBOUNCE_MS),
      initial: null,
      facets: new Map(),
      detailId: null,
      edit: null,
      uploadForm: null,
      confirm: null,
      raf: 0,
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
        if (this._s !== s || this._settled) return;
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
    this._loadList();
  }

  /** @private build the root (static skeleton markup + DOM-API content) */
  _build() {
    const s = this._s;
    const t = (k, p) => this._t(k, p);
    const root = document.createElement('div');
    root.className = 'td-modal td-modal--5xl td-media-picker';
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
      + '<div class="td-media-picker__main">'
      + '<section class="td-media-picker__results" aria-busy="false">'
      + '<td-media-grid class="td-media-picker__grid"></td-media-grid>'
      + '<div class="td-media-picker__skeleton" aria-hidden="true" hidden></div>'
      + '<td-empty-state class="td-media-picker__empty" icon="image" size="sm" compact heading-level="3" hidden></td-empty-state>'
      + '<div class="td-media-picker__error" role="alert" hidden><p class="td-media-picker__error-text"></p>'
      + '<button type="button" class="td-btn td-btn--secondary td-btn--sm td-media-picker__retry"></button></div>'
      + '<div class="td-media-picker__more-row"><p class="td-media-picker__count" hidden></p>'
      + '<button type="button" class="td-btn td-btn--secondary td-btn--sm td-media-picker__more" hidden></button></div>'
      + '</section>'
      + '<aside class="td-media-picker__detail" data-state="empty"></aside>'
      + '</div></div>'
      + '<div class="td-modal__footer td-media-picker__footer">'
      + '<div class="td-media-picker__tray"></div>'
      + '<div class="td-media-picker__actions">'
      + '<button type="button" class="td-btn td-btn--secondary td-media-picker__cancel"></button>'
      + '<button type="button" class="td-btn td-btn--primary td-media-picker__confirm"></button></div></div>'
      + '<span class="td-sr-only td-media-picker__live" role="status"></span>'
      + '</div>';
    const q = (sel) => /** @type {HTMLElement} */ (root.querySelector(sel));
    const dialog = q('.td-media-picker__dialog');
    const title = q('.td-modal__title');
    title.id = `${s.id}-title`;
    title.textContent = s.opts.title || t('title');
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
      grid: /** @type {any} */ (q('.td-media-picker__grid')),
      skeleton: q('.td-media-picker__skeleton'),
      empty: q('.td-media-picker__empty'),
      error: q('.td-media-picker__error'),
      errorText: q('.td-media-picker__error-text'),
      retry: q('.td-media-picker__retry'),
      count: q('.td-media-picker__count'),
      more: q('.td-media-picker__more'),
      detail: q('.td-media-picker__detail'),
      tray: q('.td-media-picker__tray'),
      cancel: q('.td-media-picker__cancel'),
      confirm: q('.td-media-picker__confirm'),
      live: q('.td-media-picker__live'),
    };
    const e = s.els;
    e.results.setAttribute('aria-label', t('results'));
    e.detail.setAttribute('aria-label', t('detail'));
    e.grid.setAttribute('label', t('grid'));
    for (let i = 0; i < SKELETON_TILES; i++) {
      const sk = document.createElement('div');
      sk.className = 'td-skeleton td-skeleton--rect td-media-picker__skeleton-tile';
      e.skeleton.appendChild(sk);
    }
    e.retry.textContent = t('retry');
    e.retry.addEventListener('click', () => this._loadList());
    e.more.textContent = t('loadMore');
    e.more.addEventListener('click', () => this._loadMore());
    e.cancel.textContent = t('cancel');
    e.cancel.addEventListener('click', () => this._requestFinish('cancel', 'close'));
    e.confirm.addEventListener('click', () => this._requestFinish('confirm', 'confirm'));
    this._buildToolbar(root);
    this._bindGrid();
    this._renderDetail();
    return root;
  }

  /** @private search, filters toggle, facets container, upload toggle + panel */
  _buildToolbar(root) {
    const s = this._s;
    const e = s.els;
    const t = (k, p) => this._t(k, p);
    if (s.opts.capabilitiesResolved.search) {
      const label = document.createElement('label');
      label.className = 'td-sr-only';
      label.htmlFor = `${s.id}-q`;
      label.textContent = t('search');
      const input = document.createElement('input');
      input.type = 'search';
      input.id = `${s.id}-q`;
      input.className = 'td-field__control td-media-picker__search';
      input.setAttribute('autocomplete', 'off');
      input.placeholder = t('searchPlaceholder');
      input.value = s.query;
      input.addEventListener('input', () => {
        const v = input.value;
        s.debounce.schedule(() => this._applyQuery(v));
      });
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && !ev.isComposing) {
          ev.preventDefault(); // never confirms the picker (decision 12)
          s.debounce.cancel();
          this._applyQuery(input.value);
        }
      });
      e.toolbar.append(label, input);
      e.search = input;
    }
    const ft = document.createElement('button');
    ft.type = 'button';
    ft.className = 'td-btn td-btn--secondary td-btn--sm td-media-picker__filters-toggle';
    ft.setAttribute('aria-expanded', 'false');
    ft.setAttribute('aria-controls', `${s.id}-facets`);
    ft.hidden = true;
    const ficon = tdIcon('filter', { size: 's' });
    if (ficon) ft.appendChild(ficon);
    const flabel = document.createElement('span');
    flabel.className = 'td-media-picker__filters-label';
    ft.appendChild(flabel);
    ft.addEventListener('click', () => {
      const open = ft.getAttribute('aria-expanded') !== 'true';
      ft.setAttribute('aria-expanded', open ? 'true' : 'false');
      root.toggleAttribute('data-filters-open', open);
    });
    const facets = document.createElement('div');
    facets.className = 'td-media-picker__facets';
    facets.id = `${s.id}-facets`;
    facets.hidden = true;
    e.toolbar.append(ft, facets);
    e.filtersToggle = ft;
    e.filtersLabel = flabel;
    e.facets = facets;
    this._renderFiltersToggle();

    if (canDo('upload', s.adapter, s.caps, null)) {
      const ut = document.createElement('button');
      ut.type = 'button';
      ut.className = 'td-btn td-btn--secondary td-btn--sm td-media-picker__upload-toggle';
      ut.setAttribute('aria-expanded', 'false');
      ut.setAttribute('aria-controls', `${s.id}-upload`);
      const uicon = tdIcon('upload', { size: 's' });
      if (uicon) ut.appendChild(uicon);
      const ul = document.createElement('span');
      ul.textContent = t('upload');
      ut.appendChild(ul);
      ut.addEventListener('click', () => this._toggleUpload());
      e.toolbar.appendChild(ut);
      e.uploadToggle = ut;
      this._buildUpload();
    }
  }

  // --- upload (decisions 19-20) ---

  /** @private */
  _buildUpload() {
    const s = this._s;
    const e = s.els;
    const t = (k, p) => this._t(k, p);
    const sec = document.createElement('section');
    sec.className = 'td-media-picker__upload';
    sec.id = `${s.id}-upload`;
    sec.setAttribute('aria-label', t('upload'));
    sec.hidden = true;
    const back = this._backButton(() => this._toggleUpload(false));
    sec.appendChild(back);
    if (s.uploadFields.length) {
      s.uploadForm = new FieldForm(s.uploadFields, {
        asset: undefined,
        values: {},
        idPrefix: `${s.id}-uf`,
        signal: s.ctrl.signal,
        warn: (...a) => console.warn(...a),
        onChange: () => this._syncUploadGate(),
      });
      s.uploadForm.el.classList.add('td-media-picker__upload-fields');
      sec.appendChild(s.uploadForm.el);
    }
    const hint = document.createElement('p');
    hint.className = 'td-media-picker__upload-hint';
    hint.textContent = t('uploadNeedsFields');
    hint.hidden = true;
    sec.appendChild(hint);
    const dz = /** @type {any} */ (document.createElement('td-dropzone'));
    dz.className = 'td-media-picker__dropzone';
    const up = s.opts.upload;
    if (up.accept) dz.setAttribute('accept', up.accept);
    if (up.maxSize) dz.setAttribute('max-size', up.maxSize);
    if (up.multiple) dz.setAttribute('multiple', '');
    dz.setAttribute('label', t('upload'));
    dz.upload = (file, ctx) => this._upload(file, ctx);
    sec.appendChild(dz);
    const notes = document.createElement('ul');
    notes.className = 'td-media-picker__upload-notes';
    notes.hidden = true;
    sec.appendChild(notes);
    e.upload = sec;
    e.uploadHint = hint;
    e.dropzone = dz;
    e.uploadNotes = notes;
    e.body.insertBefore(sec, e.body.querySelector('.td-media-picker__main'));
    this._syncUploadGate();
  }

  /** @private required upload fields without a value → dropzone disabled + hint */
  _syncUploadGate() {
    const s = this._s;
    if (!s || !s.els.dropzone) return;
    const missing = !!s.uploadForm && s.uploadForm.missingRequired();
    s.els.dropzone.toggleAttribute('disabled', missing);
    s.els.uploadHint.hidden = !missing;
  }

  /** @private */
  _toggleUpload(force) {
    const s = this._s;
    const e = s.els;
    if (!e.upload) return;
    const open = typeof force === 'boolean' ? force : e.upload.hidden;
    e.upload.hidden = !open;
    e.uploadToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    const view = s.root.getAttribute('data-view');
    if (open) this._setView('upload');
    else if (view === 'upload') this._setView(s.detailId ? 'detail' : 'grid');
    if (!open) this._focus(e.uploadToggle);
    else this._focus(e.upload.querySelector('.td-media-picker__back:not([hidden])') || null);
  }

  /** @private the dropzone upload hook → adapter.upload (decision 19) */
  _upload(file, { onProgress, signal }) {
    const s = this._s;
    if (!s || this._settled) return Promise.reject(Object.assign(new Error('closed'), { name: 'AbortError' }));
    const fields = s.uploadForm ? s.uploadForm.values() : {}; // captured when the file starts
    const progress = (p) => {
      if (!p || typeof p !== 'object') return;
      const pct = typeof p.percent === 'number' && Number.isFinite(p.percent) ? p.percent : null;
      if (pct !== null) onProgress(pct);
      else if (typeof p.loaded === 'number' && Number.isFinite(p.loaded)) {
        onProgress(p.loaded, typeof p.total === 'number' && Number.isFinite(p.total) ? p.total : undefined);
      }
    };
    let out;
    try {
      out = Promise.resolve(s.adapter.upload(file, { fields, context: s.context, signal, onProgress: progress }));
    } catch (err) {
      out = Promise.reject(err);
    }
    return out.then((raw) => {
      if (this._s !== s || this._settled || signal.aborted) throw Object.assign(new Error('closed'), { name: 'AbortError' });
      const asset = normalizeAsset(raw && raw.asset, { safeUrl: safeMediaUrl, metadataKeys: s.metaKeys });
      // impl review #4: only { outcome: 'created' } or { outcome: 'exact-reused', matchedAssetId === asset.id }
      const d = raw && typeof raw === 'object' ? raw.deduplication : null;
      let dedup = null;
      if (asset && d && typeof d === 'object') {
        if (d.outcome === 'created') dedup = { outcome: 'created' };
        else if (d.outcome === 'exact-reused' && d.matchedAssetId === asset.id) dedup = { outcome: 'exact-reused', matchedAssetId: asset.id };
      }
      if (!asset || !dedup) {
        console.warn('td-media-picker: malformed upload result (ignored)'); // never the raw result (review SEC-2)
        throw new Error(this._t('uploadError'));
      }
      this._onUploaded(asset, dedup);
      return { asset, deduplication: dedup };
    }, (err) => {
      if (this._s !== s || this._settled) throw err;
      const n = normalizeError(err, signal, { operation: 'upload' });
      if (!n) throw err; // aborted (row removed / picker closed): the dropzone shows nothing
      if (s.uploadForm && n.fieldErrors.size) s.uploadForm.applyErrors(n);
      this._emit('operation-error', { operation: 'upload', code: n.code, retryable: n.retryable });
      throw new Error(n.userMessage || this._t(`error.${n.code}`) || this._t('uploadError'));
    });
  }

  /** @private decision 20 */
  _onUploaded(asset, dedup) {
    const s = this._s;
    s.cache.putAsset(asset);
    s.cache.invalidateLists();
    // grid: update in place, or insert first (never a duplicate)
    if (this._visibleKind(asset)) {
      const existing = s.items.get(asset.id);
      if (existing) this._paintItem(existing, asset);
      else {
        const el = this._itemEl(asset);
        s.items.set(asset.id, el);
        const first = s.els.grid.querySelector('[data-td-media-item]');
        s.els.grid.insertBefore(el, first || null);
        this._showResults();
      }
    }
    if (dedup.outcome === 'exact-reused') {
      this._announce(this._t('reused', { name: asset.name }));
      const li = document.createElement('li');
      li.className = 'td-media-picker__upload-note';
      li.textContent = this._t('reused', { name: asset.name });
      s.els.uploadNotes.appendChild(li);
      s.els.uploadNotes.hidden = false;
    } else {
      this._announce(this._t('uploaded', { name: asset.name }));
    }
    // select the result (review R2-9) when it is selectable
    if (!this._selectable(asset)) {
      this._announce(this._t('notReady'));
    } else if (s.mode === 'single') {
      this._userChange(() => s.model.replace(asset));
      this._showDetail(asset.id);
    } else if (s.model.has(asset.id)) {
      s.model.update(asset);
    } else if (s.model.remaining > 0) {
      this._userChange(() => s.model.add(asset));
    } else {
      this._announce(this._t('limit', { max: s.model.max }));
    }
    s.model.update(asset);
    this._renderSelection();
    if (s.detailId === asset.id && !s.edit) this._renderDetail();
    this._emit('asset-change', { operation: 'upload', asset, deduplication: dedup });
    this._loadFacets();
    this._loadList({ keepGrid: true });
  }

  // --- list / facets (decision 9) ---

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
    this._loadList();
  }

  /**
   * @private (Re)load the first page. A query / filter change aborts list + load-more + facets (callers reload facets).
   * `keepGrid`: refresh after a change (the grid stays until the new page arrives).
   */
  _loadList({ keepGrid = false } = {}) {
    const s = this._s;
    if (!s || this._settled) return;
    s.req.more.abort();
    const state = this._listState();
    // Never served from a cache (decision 9: searching away and back is a NEW request — an old page can never win).
    if (!keepGrid) this._showLoading();
    s.els.results.setAttribute('aria-busy', 'true');
    s.req.list.run((signal) => s.adapter.list(buildListRequest(state, { signal }))).then((r) => {
      if (r.stale || this._s !== s || this._settled) return;
      s.els.results.setAttribute('aria-busy', 'false');
      if ('error' in r) {
        this._listError(r.error, s.req.list);
        return;
      }
      let page;
      try {
        page = normalizePage(r.value, { safeUrl: safeMediaUrl, kinds: s.kinds, limit: s.pageSize, metadataKeys: s.metaKeys, warn: (m) => warnOnce(`page:${m}`, m) });
      } catch (err) {
        this._listError(err, null);
        return;
      }
      if (page.hidden) warnOnce('kinds', 'td-media-picker: the adapter returned items of other kinds — hidden (filter by `kinds`).');
      for (const a of page.items) s.cache.putAsset(a);
      this._renderPage(page, !keepGrid);
    });
  }

  /** @private */
  _loadMore() {
    const s = this._s;
    if (!s.nextCursor || s.req.more.pending) return;
    const state = this._listState();
    const cursor = s.nextCursor;
    s.els.more.setAttribute('aria-busy', 'true');
    s.req.more.run((signal) => s.adapter.list(buildListRequest(state, { cursor, signal }))).then((r) => {
      if (r.stale || this._s !== s || this._settled) return;
      s.els.more.removeAttribute('aria-busy');
      if ('error' in r) {
        this._listError(r.error, s.req.more, true);
        return;
      }
      let page;
      try {
        page = normalizePage(r.value, { safeUrl: safeMediaUrl, kinds: s.kinds, limit: s.pageSize, metadataKeys: s.metaKeys, warn: (m) => warnOnce(`page:${m}`, m) });
      } catch (err) {
        this._listError(err, null, true);
        return;
      }
      for (const a of page.items) s.cache.putAsset(a);
      const added = [];
      for (const a of page.items) {
        if (s.items.has(a.id)) continue;
        const el = this._itemEl(a);
        s.items.set(a.id, el);
        s.els.grid.appendChild(el);
        added.push(a.id);
      }
      s.nextCursor = page.nextCursor;
      if (page.total !== undefined) s.total = page.total;
      this._syncGrid();
      this._renderFooterRow();
      this._announce(this._t('loadedMore', { n: added.length }));
    });
  }

  /** @private */
  _listError(err, slot, more = false) {
    const s = this._s;
    const n = normalizeError(err, null, { operation: 'list' });
    if (!n) return;
    this._emit('operation-error', { operation: 'list', code: n.code, retryable: n.retryable });
    const text = n.userMessage || this._t(`error.${n.code}`);
    if (more) {
      this._announce(text);
      return;
    }
    s.els.errorText.textContent = text;
    s.els.retry.hidden = !n.retryable;
    s.els.skeleton.hidden = true;
    s.els.empty.hidden = true;
    s.els.grid.hidden = true;
    s.els.error.hidden = false;
    s.els.more.hidden = true;
    s.els.count.hidden = true;
  }

  /** @private skeleton tiles while the first page loads */
  _showLoading() {
    const e = this._s.els;
    e.error.hidden = true;
    e.empty.hidden = true;
    e.grid.hidden = true;
    e.skeleton.hidden = false;
    e.more.hidden = true;
    e.count.hidden = true;
  }

  /** @private */
  _showResults() {
    const e = this._s.els;
    e.skeleton.hidden = true;
    e.error.hidden = true;
    e.empty.hidden = true;
    e.grid.hidden = false;
  }

  /** @private replace the grid content with a page (decision 13: silent clear before, silent re-select after) */
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
    s.nextCursor = page.nextCursor;
    s.total = page.total;
    if (!page.items.length) {
      const filtered = !!s.query || Object.keys(s.filters).length > 0;
      s.els.empty.setAttribute('title', this._t(filtered ? 'emptyFiltered' : 'empty'));
      s.els.empty.setAttribute('message', this._t('emptyHint'));
      s.els.skeleton.hidden = true;
      s.els.error.hidden = true;
      grid.hidden = true;
      s.els.empty.hidden = false;
    } else {
      this._showResults();
    }
    this._syncGrid();
    this._renderFooterRow();
    if (announce) this._announce(this._t('resultsCount', { n: page.total ?? page.items.length }));
  }

  /** @private count text + load-more button */
  _renderFooterRow() {
    const s = this._s;
    const n = s.items.size;
    s.els.more.hidden = !s.nextCursor;
    if (s.total !== undefined && n) {
      s.els.count.textContent = this._t('count', { n, total: s.total });
      s.els.count.hidden = false;
    } else {
      s.els.count.hidden = true;
    }
  }

  /** @private */
  _loadFacets() {
    const s = this._s;
    if (!s || this._settled || typeof s.adapter.facets !== 'function') return;
    const state = { query: s.query, filters: s.filters };
    const key = requestKey(state, null);
    const cached = s.cache.getFacets(key);
    if (cached) {
      s.req.facets.abort();
      this._renderFacets(cached);
      return;
    }
    s.req.facets.run((signal) => s.adapter.facets({ query: s.query, filters: buildListRequest({ ...state, pageSize: 0 }).filters,
      ...(s.context !== undefined ? { context: s.context } : {}), signal })).then((r) => {
      if (r.stale || this._s !== s || this._settled) return;
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
    for (const [k, c] of s.facets) {
      if (keys.has(k)) continue;
      c.destroy();
      c.el.remove();
      s.facets.delete(k);
      delete s.filters[k];
    }
    let filtersChanged = false;
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
    s.els.filtersToggle.hidden = list.length === 0;
    this._renderFiltersToggle();
    if (filtersChanged) this._loadList(); // the shown list must match the filters now in force
  }

  /** @private */
  _onFacetChange(key) {
    const s = this._s;
    const c = s.facets.get(key);
    if (!c) return;
    const v = c.get();
    if (v === undefined || (Array.isArray(v) && !v.length)) delete s.filters[key];
    else s.filters[key] = v;
    this._renderFiltersToggle();
    s.debounce.cancel();
    if (s.els.search) s.query = s.els.search.value.trim();
    this._loadFacets();
    this._loadList();
  }

  /** @private */
  _renderFiltersToggle() {
    const s = this._s;
    const n = Object.keys(s.filters).length;
    s.els.filtersLabel.textContent = n ? this._t('filtersCount', { n }) : this._t('filters');
  }

  // --- grid + selection (decision 13) ---

  /** @private */
  _visibleKind(asset) {
    const k = this._s.kinds;
    return !k || !k.length || k.includes(asset.kind);
  }

  /** @private */
  _selectable(asset) {
    return !!asset && asset.status === 'ready' && this._visibleKind(asset);
  }

  /** @private one grid item (DOM API, text only) */
  _itemEl(asset) {
    const item = document.createElement('div');
    item.setAttribute('data-td-media-item', '');
    item.setAttribute('data-id', asset.id);
    item.className = 'td-media-picker__item';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'td-media-picker__open';
    open.setAttribute('data-td-media-open', '');
    item.appendChild(open);
    const name = document.createElement('span');
    name.className = 'td-media-picker__name';
    name.setAttribute('aria-hidden', 'true');
    item.appendChild(name);
    this._paintItem(item, asset);
    return item;
  }

  /** @private (re)paint an item from an asset snapshot */
  _paintItem(item, asset) {
    item.setAttribute('data-kind', asset.kind);
    item.setAttribute('data-status', asset.status);
    const open = /** @type {HTMLElement} */ (item.querySelector('.td-media-picker__open'));
    const statusText = asset.status !== 'ready' ? this._t(`status.${asset.status}`) : '';
    open.setAttribute('aria-label', [asset.name || asset.id, statusText].filter(Boolean).join(' — '));
    open.replaceChildren();
    const src = asset.urls.thumbnail || asset.urls.preview;
    if (src && asset.kind !== 'file') {
      const img = document.createElement('img');
      img.className = 'td-media-picker__thumb';
      img.alt = '';
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
      img.setAttribute('referrerpolicy', 'no-referrer');
      img.src = src;
      open.appendChild(img);
    } else {
      const ic = document.createElement('span');
      ic.className = 'td-media-picker__thumb-icon';
      ic.setAttribute('aria-hidden', 'true');
      const svg = tdIcon(KIND_ICON[asset.kind] || 'file', { size: 'l' });
      if (svg) ic.appendChild(svg);
      open.appendChild(ic);
    }
    if (asset.kind === 'video') {
      const b = document.createElement('span');
      b.className = 'td-media-picker__kind';
      b.setAttribute('aria-hidden', 'true');
      b.textContent = this._t('video');
      open.appendChild(b);
    }
    if (statusText) {
      const st = document.createElement('span');
      st.className = 'td-media-picker__status';
      st.setAttribute('aria-hidden', 'true');
      st.textContent = statusText;
      open.appendChild(st);
    }
    const name = item.querySelector('.td-media-picker__name');
    if (name) name.textContent = asset.name || asset.id;
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
    // Single mode (review R1-2, R2-2): the grid has no "before select" hook — clear it SILENTLY in the capture phase
    // of an ancestor (runs before the grid's own capture listener) when an UNSELECTED item is clicked / Space-flipped
    // while the grid has a selection; the grid then sees an empty selection without an anchor.
    const preClear = (ev, item) => {
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
      if (t.closest('[data-td-media-open]') || t.closest('.td-media-grid__tick')) preClear(ev, item);
    }, true);
    results.addEventListener('keydown', (ev) => {
      if (ev.key !== ' ' || ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const t = /** @type {Element} */ (ev.target);
      if (!t.closest || !t.closest('[data-td-media-open]')) return;
      preClear(ev, itemOf(t));
    }, true);
    grid.addEventListener('activate', async (ev) => {
      ev.preventDefault();
      const id = ev.detail.id;
      const asset = s.cache.getAsset(id);
      // the single-mode pre-clear may have emptied the grid: read it now, before any re-sync
      const hadSelection = (grid.selectedIds || []).length > 0;
      if (!asset) { this._syncGrid(); return; }
      // impl review #1: a dirty edit of another asset → consent FIRST; selection + grid stay as they are meanwhile
      if (s.edit && s.detailId !== id && this._editBusy()) {
        this._syncGrid();
        if (!(await this._confirmDiscard())) return;
        if (this._s !== s || this._settled) return;
        this._closeEdit();
      }
      if (!hadSelection && !s.model.has(id)) {
        if (!this._selectable(asset)) this._announce(this._t('notReady'));
        else if (s.mode === 'single') this._userChange(() => s.model.add(asset));
        else if (s.model.remaining <= 0) this._announce(this._t('limit', { max: s.model.max }));
        else this._userChange(() => s.model.add(asset));
      }
      this._syncGrid(); // impl review #2: a rejected activation leaves grid = model
      this._showDetail(id);
    });
    grid.addEventListener('select-change', (ev) => this._onGridChange(ev.detail));
  }

  /** @private a user flip in the grid → the model (the model is the source of truth) */
  _onGridChange({ added = [], removed = [] }) {
    const s = this._s;
    const grid = s.els.grid;
    if (s.mode === 'single' && added.length > 1) {
      // must not happen (pre-clear): treat as a sync error — keep the model, rewrite the grid silently
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
   * model changed; grid / tray / footer re-sync; `selection-change` with the diff.
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

  /** @private tray (multiple), footer confirm count, initial-loading note */
  _renderSelection() {
    const s = this._s;
    const e = s.els;
    const n = s.model.size;
    e.confirm.textContent = this._t('confirm', { n });
    if (n) e.confirm.removeAttribute('aria-disabled');
    else e.confirm.setAttribute('aria-disabled', 'true');
    const tray = e.tray;
    tray.replaceChildren();
    const loading = !!s.initial && s.initial.pending;
    if (s.mode === 'multiple') {
      const count = document.createElement('span');
      count.className = 'td-media-picker__tray-count';
      count.textContent = s.model.max === Infinity ? this._t('selected', { n }) : this._t('selectedMax', { n, max: s.model.max });
      tray.appendChild(count);
      const list = document.createElement('div');
      list.className = 'td-media-picker__tray-list';
      for (const a of s.model.assets) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'td-media-picker__tray-item';
        b.setAttribute('aria-label', this._t('deselect', { name: a.name || a.id }));
        const src = a.urls.thumbnail || a.urls.preview;
        if (src && a.kind !== 'file') {
          const img = document.createElement('img');
          img.alt = '';
          img.setAttribute('loading', 'lazy');
          img.setAttribute('decoding', 'async');
          img.setAttribute('referrerpolicy', 'no-referrer');
          img.src = src;
          b.appendChild(img);
        } else {
          const svg = tdIcon(KIND_ICON[a.kind] || 'file', { size: 's' });
          if (svg) b.appendChild(svg);
        }
        b.addEventListener('click', () => {
          const next = b.nextElementSibling || b.previousElementSibling;
          this._userChange(() => s.model.remove(a.id));
          this._focus(next && next.isConnected ? /** @type {HTMLElement} */ (next)
            : tray.querySelector('.td-media-picker__tray-clear') || e.confirm);
        });
        list.appendChild(b);
      }
      tray.appendChild(list);
      if (n) {
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'td-btn td-btn--ghost td-btn--sm td-media-picker__tray-clear';
        clear.textContent = this._t('clearSelection');
        clear.addEventListener('click', () => {
          this._userChange(() => s.model.clear());
          this._focus(e.confirm);
        });
        tray.appendChild(clear);
      }
    }
    if (loading) {
      const l = document.createElement('span');
      l.className = 'td-media-picker__tray-loading';
      l.textContent = this._t('loadingInitial');
      tray.appendChild(l);
    }
    tray.hidden = tray.childNodes.length === 0;
  }

  // --- detail + edit (decisions 16, 21) ---

  /** @private */
  _backButton(onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'td-btn td-btn--ghost td-btn--sm td-media-picker__back';
    const icon = tdIcon('back', { size: 's' });
    if (icon) b.appendChild(icon);
    const l = document.createElement('span');
    l.textContent = this._t('back');
    b.appendChild(l);
    b.addEventListener('click', onClick);
    return b;
  }

  /** @private */
  _setView(view) {
    this._s.root.setAttribute('data-view', view);
  }

  /** @private open the detail of `id` (gated when an edit is dirty) */
  async _showDetail(id) {
    const s = this._s;
    if (s.edit && s.detailId !== id) {
      if (this._editBusy() && !(await this._confirmDiscard())) return;
      if (this._s !== s || this._settled) return;
      this._closeEdit();
    }
    s.detailId = id;
    if (s.root.getAttribute('data-view') !== 'upload') this._setView('detail');
    this._renderDetail(true);
    const back = s.els.detail.querySelector('.td-media-picker__back');
    if (back && this._isNarrow()) this._focus(/** @type {HTMLElement} */ (back));
    s.req.detail.run((signal) => s.adapter.get(id, { context: s.context, signal })).then((r) => {
      if (r.stale || this._s !== s || this._settled || s.detailId !== id) return;
      s.els.detail.removeAttribute('data-loading');
      if ('error' in r) {
        const n = normalizeError(r.error, null, { operation: 'get' });
        if (n) this._emit('operation-error', { operation: 'get', code: n.code, retryable: n.retryable });
        return;
      }
      const asset = normalizeAsset(r.value, { safeUrl: safeMediaUrl, metadataKeys: s.metaKeys });
      if (!asset || asset.id !== id) return;
      this._applyFreshAsset(asset);
    });
  }

  /** @private a fresh snapshot of an asset → cache, grid item, selection, detail */
  _applyFreshAsset(asset) {
    const s = this._s;
    s.cache.putAsset(asset);
    const item = s.items.get(asset.id);
    if (item) this._paintItem(item, asset);
    if (s.model.has(asset.id)) {
      s.model.update(asset);
      this._renderSelection();
    }
    if (s.detailId === asset.id && !s.edit) this._renderDetail();
  }

  /** @private */
  _isNarrow() {
    try { return window.matchMedia('(max-width: 640px)').matches; } catch { return false; }
  }

  /** @private (re)render the detail panel from the cached snapshot */
  _renderDetail(loading = false) {
    const s = this._s;
    const box = s.els.detail;
    // a re-render keeps the focus on the same control (back / edit) when it was there
    const had = document.activeElement && box.contains(document.activeElement) ? document.activeElement : null;
    const role = had ? ['td-media-picker__back', 'td-media-picker__edit'].find((c) => had.classList.contains(c)) : null;
    this._paintDetail(loading);
    if (had && !had.isConnected) this._focus(role ? box.querySelector(`.${role}`) : box.querySelector('.td-media-picker__back'));
  }

  /** @private */
  _paintDetail(loading) {
    const s = this._s;
    const box = s.els.detail;
    box.replaceChildren();
    const back = this._backButton(() => this._closeDetail());
    box.appendChild(back);
    const asset = s.detailId ? s.cache.getAsset(s.detailId) : null;
    if (!asset) {
      box.setAttribute('data-state', 'empty');
      const p = document.createElement('p');
      p.className = 'td-media-picker__detail-empty';
      p.textContent = this._t('detailEmpty');
      box.appendChild(p);
      return;
    }
    box.setAttribute('data-state', 'ready');
    box.toggleAttribute('data-loading', loading);
    const fig = document.createElement('div');
    fig.className = 'td-media-picker__preview';
    fig.setAttribute('data-kind', asset.kind);
    const src = asset.urls.preview || asset.urls.thumbnail;
    if (src && asset.kind !== 'file') {
      const img = document.createElement('img');
      img.alt = asset.defaultAltText || '';
      img.setAttribute('decoding', 'async');
      img.setAttribute('referrerpolicy', 'no-referrer');
      img.src = src;
      fig.appendChild(img);
    } else {
      const svg = tdIcon(KIND_ICON[asset.kind] || 'file', { size: 'xl' });
      if (svg) fig.appendChild(svg);
    }
    if (asset.kind === 'video') {
      const b = document.createElement('span');
      b.className = 'td-media-picker__kind';
      b.textContent = this._t('video');
      fig.appendChild(b);
    }
    box.appendChild(fig);
    const h = document.createElement('h3');
    h.className = 'td-media-picker__detail-name';
    h.textContent = asset.name || asset.id;
    box.appendChild(h);
    const dl = document.createElement('dl');
    dl.className = 'td-media-picker__meta';
    const row = (k, v) => {
      if (v === '' || v == null) return;
      const dt = document.createElement('dt');
      dt.textContent = this._t(`meta.${k}`);
      const dd = document.createElement('dd');
      dd.textContent = String(v);
      dl.append(dt, dd);
    };
    row('kind', [this._t(`kind.${asset.kind}`), asset.mimeType].filter(Boolean).join(' · '));
    row('size', asset.byteSize ? formatFileSize(asset.byteSize) : '');
    row('dimensions', asset.width && asset.height ? `${asset.width} × ${asset.height}` : '');
    row('date', this._date(asset.createdAt));
    row('uploadedBy', asset.uploadedByLabel || '');
    if (asset.status !== 'ready') row('kind', this._t(`status.${asset.status}`));
    box.appendChild(dl);
    if (loading) {
      const sk = document.createElement('div');
      sk.className = 'td-skeleton td-skeleton--text td-skeleton--lines-2 td-media-picker__detail-skeleton';
      sk.setAttribute('aria-hidden', 'true');
      box.appendChild(sk);
    }
    if (asset.badges && asset.badges.length) {
      const wrap = document.createElement('div');
      wrap.className = 'td-media-picker__badges';
      for (const b of asset.badges) {
        const sp = document.createElement('span');
        sp.className = TONES.includes(b.tone) ? `td-badge td-badge--${b.tone}` : 'td-badge';
        sp.textContent = b.label;
        wrap.appendChild(sp);
      }
      box.appendChild(wrap);
    }
    if (s.assetFields.length && canDo('editMetadata', s.adapter, s.caps, asset)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'td-btn td-btn--secondary td-btn--sm td-media-picker__edit';
      const icon = tdIcon('pencil', { size: 's' });
      if (icon) btn.appendChild(icon);
      const l = document.createElement('span');
      l.textContent = this._t('edit');
      btn.appendChild(l);
      btn.addEventListener('click', () => this._openEdit());
      box.appendChild(btn);
    }
  }

  /** @private */
  _date(iso) {
    if (typeof iso !== 'string' || !iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    try {
      return new Intl.DateTimeFormat(this._s.opts.locale || 'vi-VN', { dateStyle: 'medium' }).format(d);
    } catch {
      return d.toISOString().slice(0, 10);
    }
  }

  /** @private mobile "back" from the detail (gated when an edit is dirty) */
  async _closeDetail() {
    const s = this._s;
    if (s.edit) {
      if (this._editBusy() && !(await this._confirmDiscard())) return;
      if (this._s !== s || this._settled) return;
      this._closeEdit();
    }
    const id = s.detailId;
    this._setView('grid');
    const item = id ? s.items.get(id) : null;
    const open = item ? /** @type {HTMLElement} */ (item.querySelector('[data-td-media-open]')) : null;
    this._focus(open || s.els.search || s.els.dialog);
  }

  /** @private the edit form of the current detail (decision 21) */
  _openEdit() {
    const s = this._s;
    const asset = s.detailId ? s.cache.getAsset(s.detailId) : null;
    if (!asset || s.edit) return;
    const box = s.els.detail;
    box.replaceChildren();
    box.setAttribute('data-state', 'edit');
    box.removeAttribute('data-loading');
    this._setView('edit');
    const back = this._backButton(() => this._cancelEdit());
    box.appendChild(back);
    const h = document.createElement('h3');
    h.className = 'td-media-picker__detail-name';
    h.textContent = asset.name || asset.id;
    box.appendChild(h);
    const form = new FieldForm(s.assetFields, {
      asset,
      values: asset.metadata,
      idPrefix: `${s.id}-af`,
      signal: s.ctrl.signal,
      warn: (...a) => console.warn(...a),
      onChange: () => {},
    });
    const notice = document.createElement('div');
    notice.className = 'td-media-picker__notice';
    notice.setAttribute('role', 'alert');
    notice.hidden = true;
    const actions = document.createElement('div');
    actions.className = 'td-media-picker__edit-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'td-btn td-btn--secondary td-btn--sm td-media-picker__edit-cancel';
    cancel.textContent = this._t('cancelEdit');
    cancel.addEventListener('click', () => this._cancelEdit());
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'td-btn td-btn--primary td-btn--sm td-media-picker__save';
    save.textContent = this._t('save');
    save.addEventListener('click', () => this._save());
    actions.append(cancel, save);
    form.el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && (isMac() ? ev.metaKey : ev.ctrlKey) && !ev.isComposing) {
        ev.preventDefault();
        ev.stopPropagation();
        this._save();
      }
    });
    box.append(form.el, notice, actions);
    s.edit = { form, asset, notice, save, id: asset.id };
    const first = /** @type {HTMLElement|null} */ (form.el.querySelector('input, textarea, button'));
    this._focus(first);
  }

  /** @private an edit is dirty or a save is running */
  _editBusy() {
    const s = this._s;
    return !!s.edit && (s.edit.form.dirty || s.req.update.pending);
  }

  /** @private */
  async _cancelEdit() {
    const s = this._s;
    if (!s.edit) return;
    if (this._editBusy() && !(await this._confirmDiscard())) return;
    if (this._s !== s || this._settled) return;
    this._closeEdit();
    this._setView('detail');
    this._renderDetail();
    this._focus(/** @type {HTMLElement} */ (s.els.detail.querySelector('.td-media-picker__edit')));
  }

  /** @private drop the edit form (abort a running save / option loads) */
  _closeEdit() {
    const s = this._s;
    if (!s.edit) return;
    s.req.update.abort();
    s.req.reload.abort();
    s.edit.form.destroy();
    s.edit = null;
  }

  /** @private explicit save (no autosave) */
  _save() {
    const s = this._s;
    const ed = s.edit;
    if (!ed || s.req.update.pending) return;
    ed.form.clearErrors();
    ed.notice.hidden = true;
    ed.notice.replaceChildren();
    ed.save.setAttribute('aria-busy', 'true');
    const fields = ed.form.values();
    const patch = { fields };
    if (ed.asset.version !== undefined) patch.version = ed.asset.version;
    const id = ed.id;
    s.req.update.run((signal) => s.adapter.update(id, patch, { context: s.context, signal })).then((r) => {
      if (r.stale || this._s !== s || this._settled || s.edit !== ed) return;
      ed.save.removeAttribute('aria-busy');
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
      this._closeEdit();
      this._applyFreshAsset(asset);
      this._setView('detail');
      this._renderDetail();
      this._announce(this._t('saved'));
      this._emit('asset-change', { operation: 'update', asset });
      this._focus(/** @type {HTMLElement} */ (s.els.detail.querySelector('.td-media-picker__edit')));
      this._loadFacets();
      this._loadList({ keepGrid: true });
    });
  }

  /** @private alert text in the edit form; `reload` → "Tải lại" (conflict) */
  _editNotice(text, reload) {
    const s = this._s;
    const ed = s.edit;
    ed.notice.replaceChildren();
    const p = document.createElement('p');
    p.textContent = text;
    ed.notice.appendChild(p);
    if (reload) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'td-btn td-btn--secondary td-btn--sm td-media-picker__reload';
      b.textContent = this._t('reload');
      b.addEventListener('click', () => {
        s.req.reload.run((signal) => s.adapter.get(ed.id, { context: s.context, signal })).then((r) => {
          if (r.stale || this._s !== s || this._settled || s.edit !== ed) return;
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

  // --- finish gate (decision 12) ---

  /** @private something would be lost by finishing now */
  _dirty() {
    const s = this._s;
    return this._editBusy() || (!!s.els.dropzone && !!s.els.dropzone.uploading);
  }

  /** @private the picker's own discard confirmation; one at a time (a second request while it is open → false) */
  _confirmDiscard() {
    const s = this._s;
    if (s.confirm) return Promise.resolve(false);
    const c = openDiscardConfirm((k) => this._t(k));
    s.confirm = c;
    return c.promise.then((ok) => {
      if (s.confirm === c) s.confirm = null;
      return ok && this._s === s && !this._settled;
    });
  }

  /**
   * @private The ONE finish gate for ×, "Huỷ", Escape and "Chọn (n)": clean → finish now; dirty → confirmation; yes →
   * abort everything and finish with the REQUESTED kind (selection as of the consent).
   * @param {'confirm'|'cancel'} kind
   * @param {string} reason
   */
  async _requestFinish(kind, reason) {
    const s = this._s;
    if (!s || this._settled || s.confirm) return;
    if (kind === 'confirm' && s.model.size === 0) {
      this._announce(this._t('selectFirst'));
      return;
    }
    if (this._dirty()) {
      const ok = await this._confirmDiscard();
      if (!ok || this._s !== s || this._settled) return;
      if (kind === 'confirm' && s.model.size === 0) {
        this._announce(this._t('selectFirst'));
        return;
      }
    }
    const outcome = kind === 'confirm' ? buildOutcome(s.model) : cancelledOutcome(/** @type {any} */ (reason));
    this._teardown(outcome, false);
  }

  /** @private Escape: clears a non-empty search first; otherwise the finish gate */
  _onEscape() {
    const s = this._s;
    if (!s || this._settled) return;
    const input = s.els.search;
    if (input && document.activeElement === input && input.value) {
      input.value = '';
      s.debounce.cancel();
      this._applyQuery('');
      return;
    }
    this._requestFinish('cancel', 'escape');
  }

  /**
   * @private The single end path (idempotent): abort every request / upload / option load, close the discard dialog of
   * THIS picker, release the layer (now when `immediate`, else after the exit transition), settle once, emit.
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
      if (s.initial) s.initial.invalidate();
      s.debounce.cancel();
      s.ctrl.abort();
      if (s.els.dropzone && typeof s.els.dropzone.clear === 'function') {
        try { s.els.dropzone.clear(); } catch { /* ignore */ }
      }
      if (s.edit) { try { s.edit.form.destroy(); } catch { /* ignore */ } s.edit = null; }
      if (s.uploadForm) { try { s.uploadForm.destroy(); } catch { /* ignore */ } }
      for (const c of s.facets.values()) { try { c.destroy(); } catch { /* ignore */ } }
      if (s.confirm) {
        const c = s.confirm;
        s.confirm = null;
        try { TdModal.closeById(c.id); } catch { /* ignore */ }
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
    this._focus(s.els.search || first || s.els.dialog);
  }

  /** @private */
  _focus(el) {
    if (!el || typeof el.focus !== 'function') return;
    try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
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
