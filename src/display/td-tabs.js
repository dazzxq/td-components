import { TdBaseElement } from '../base/td-base-element.js';
import { fillIconSlots, hasIcon } from '../icons/td-icon.js';

let _autoIdCounter = 0;
const SIZES = ['sm', 'md'];
const CLASS_TOKEN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const DEFAULT_NAME = 'Các thẻ';
/** Every attribute td-tabs may set on a consumer panel (recorded + restored, D7). */
const PANEL_ATTRS = ['role', 'aria-labelledby', 'hidden', 'tabindex'];
const FOCUSABLE = [
  'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', 'iframe', 'audio[controls]', 'video[controls]',
  'summary', '[contenteditable]:not([contenteditable="false"])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Tabs — token-native (needs td.css; no Tailwind). Styles: src/styles/components/tabs.css.
 * WAI-ARIA APG tabs: `role="tablist"` / `role="tab"`, `aria-selected`, roving tabindex (the selected tab is the
 * only Tab stop). Content-layer segmented look (liquid-glass: no glass — trough `--td-tabs-bg`, pill
 * `--td-tabs-pill`).
 *
 * DOM contract:
 *   <div class="td-tabs td-tabs--{sm|md}" role="tablist" aria-label="…" data-state="ready"
 *        (CSSOM --td-tabs-ind-x / --td-tabs-ind-w)>
 *     <span class="td-tabs__indicator" aria-hidden="true"></span>
 *     <button type="button" role="tab" class="td-tabs__tab" id="{host-id}-tab-{i}" data-tab-id="{id}"
 *             aria-selected="true|false" tabindex="0|-1" [aria-controls="{panel}"]>
 *       [<span class="td-tabs__icon" data-td-icon="{name}" aria-hidden="true">svg</span>]
 *       <span class="td-tabs__label">{label}</span>
 *     </button>…
 *   </div>
 *   Empty: <div class="td-tabs td-tabs--{size}" data-state="empty"></div>
 *
 * Keyboard: ← → (wrap, RTL-aware) / Home / End move focus. Default MANUAL activation: Enter/Space (native
 * button click) selects and fires `tab-change` once. `activation="auto"`: arrows also select.
 *
 * Panels (optional, D7): `tab.panel` = element id → `aria-controls` on the tab; td-tabs manages that element's
 * `role="tabpanel"`, `aria-labelledby`, `hidden`, and `tabindex="0"` (only when the panel has no focusable
 * content). The previous value of every attribute it touches is restored when the panel stops being managed
 * (tabs reassigned without it) or when td-tabs disconnects.
 *
 * @element td-tabs
 * @attr {string} size - 'sm' | 'md' (default 'md')
 * @attr {string} active-tab - ID of the active tab (changes switch silently, no event)
 * @attr {string} activation - 'manual' (default) | 'auto'
 * @attr {string} aria-label - Tablist name (default "Các thẻ"); `aria-labelledby` is forwarded too
 * @fires tab-change - When the user (or setActiveTab) changes the tab, detail: { tabId }
 *
 * @property {Array<{id: string, label: string, icon?: string, panel?: string}>} tabs - Tab definitions.
 *   `icon`: registry name; DEPRECATED: any other value is a class list rendered as `<i class aria-hidden>`.
 * @property {Function} onChange - Callback receiving tabId
 */
export class TdTabs extends TdBaseElement {
  static get observedAttributes() {
    return ['size', 'active-tab', 'aria-label', 'aria-labelledby'];
  }

  constructor() {
    super();
    this._tabs = [];
    /** @type {Array<{id: string, label: string, icon: string, panel: string}>} */
    this._items = [];
    this._activeTabId = null;
    this._onChange = null;
    /** @type {HTMLButtonElement[]} */
    this._buttons = [];
    /** @type {HTMLElement|null} */
    this._list = null;
    /** @type {Map<Element, Record<string, string|null>>} managed panel → original attribute values */
    this._panels = new Map();
    this._ro = null;
    this._raf = 0;
  }

  // --- JS Property accessors ---

  get tabs() { return this._tabs; }
  set tabs(data) {
    this._tabs = Array.isArray(data) ? data : [];
    this._items = this._tabs
      .filter((t) => t && typeof t === 'object' && t.id != null && t.id !== '')
      .map((t) => ({
        id: String(t.id),
        label: t.label == null ? '' : String(t.label),
        icon: typeof t.icon === 'string' ? t.icon.trim() : '',
        panel: typeof t.panel === 'string' ? t.panel.trim() : '',
      }));
    this._validateActive();
    if (this._initialized) {
      const hadFocus = this.contains(document.activeElement);
      this._doRender();
      if (hadFocus) this._buttonFor(this._activeTabId)?.focus();
    }
  }

  get onChange() { return this._onChange; }
  set onChange(fn) { this._onChange = typeof fn === 'function' ? fn : null; }

  // --- Lifecycle ---

  connectedCallback() {
    this._ensureId();
    this.listen(this, 'click', (e) => this._onClick(e));
    this.listen(this, 'keydown', (e) => this._onKeydown(e));
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._scheduleIndicator());
    }
    if (!this._initialized) {
      this._validateActive();
      super.connectedCallback(); // first render → afterRender observes + syncs panels
    } else {
      this._observe();
      this._syncPanels();
      this._scheduleIndicator();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._ro?.disconnect();
    this._ro = null;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._releasePanels(new Set());
  }

  /** Same pattern as TdFormElement._ensureId: a host id so tab ids `{host-id}-tab-{i}` never collide. */
  _ensureId() {
    if (this.id) return;
    let id;
    do { id = `td-tabs-${++_autoIdCounter}`; } while (document.getElementById(id));
    this.id = id;
  }

  // --- Rendering ---

  _size() {
    const size = this.getAttribute('size');
    return SIZES.includes(size) ? size : 'md';
  }

  _iconMarkup(icon) {
    if (!icon) return '';
    if (hasIcon(icon)) {
      return `<span class="td-tabs__icon" data-td-icon="${this.escapeHtml(icon)}" data-td-icon-size="s" aria-hidden="true"></span>`;
    }
    const classes = icon.split(/\s+/).filter((c) => CLASS_TOKEN.test(c)).join(' ');
    if (!classes) return '';
    return `<span class="td-tabs__icon" aria-hidden="true"><i class="${this.escapeHtml(classes)}" aria-hidden="true"></i></span>`;
  }

  render() {
    const size = this._size();
    if (this._items.length === 0) {
      return `<div class="td-tabs td-tabs--${size}" data-state="empty"></div>`;
    }
    const tabs = this._items.map((tab, i) => {
      const selected = tab.id === this._activeTabId;
      const controls = tab.panel ? ` aria-controls="${this.escapeHtml(tab.panel)}"` : '';
      return `<button type="button" role="tab" class="td-tabs__tab" id="${this.escapeHtml(this._tabDomId(i))}"`
        + ` data-tab-id="${this.escapeHtml(tab.id)}" aria-selected="${selected}" tabindex="${selected ? 0 : -1}"${controls}>`
        + `${this._iconMarkup(tab.icon)}<span class="td-tabs__label">${this.escapeHtml(tab.label)}</span></button>`;
    }).join('');
    return `<div class="td-tabs td-tabs--${size}" role="tablist">`
      + `<span class="td-tabs__indicator" aria-hidden="true"></span>${tabs}</div>`;
  }

  afterRender() {
    this._list = this.querySelector(':scope > .td-tabs');
    this._buttons = [...this.querySelectorAll(':scope > .td-tabs > .td-tabs__tab')];
    fillIconSlots(this);
    this._applyName();
    this._observe();
    this._syncPanels();
    this._updateIndicator();
  }

  _tabDomId(i) { return `${this.id}-tab-${i}`; }

  _buttonFor(id) { return this._buttons.find((b) => b.dataset.tabId === id) || null; }

  _hasTab(id) { return this._items.some((t) => t.id === id); }

  /** Keep `_activeTabId` pointing at an existing tab: current → `active-tab` attribute → first tab. */
  _validateActive() {
    if (this._activeTabId != null && this._hasTab(this._activeTabId)) return;
    const attr = this.getAttribute('active-tab');
    if (attr != null && this._hasTab(attr)) this._activeTabId = attr;
    else this._activeTabId = this._items[0]?.id ?? null;
  }

  /** D19: tablist name = host aria-labelledby → host aria-label → "Các thẻ". */
  _applyName() {
    const list = this._list;
    if (!list) return;
    if (list.getAttribute('role') !== 'tablist') {
      list.removeAttribute('aria-label');
      list.removeAttribute('aria-labelledby');
      return;
    }
    const labelledby = (this.getAttribute('aria-labelledby') || '').trim();
    const label = (this.getAttribute('aria-label') || '').trim();
    if (labelledby) {
      list.setAttribute('aria-labelledby', labelledby);
      list.removeAttribute('aria-label');
    } else {
      list.setAttribute('aria-label', label || DEFAULT_NAME);
      list.removeAttribute('aria-labelledby');
    }
  }

  // --- Indicator (CSSOM custom properties, re-measured on resize) ---

  _observe() {
    if (!this._ro) return;
    this._ro.disconnect();
    if (!this._list) return;
    this._ro.observe(this._list);
    for (const b of this._buttons) this._ro.observe(b);
  }

  _scheduleIndicator() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this._updateIndicator();
    });
  }

  _updateIndicator() {
    const list = this._list;
    if (!list || !list.isConnected || this._items.length === 0) return;
    const btn = this._buttonFor(this._activeTabId);
    if (!btn) return;
    const lr = list.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    if (br.width === 0) return; // not laid out yet (hidden ancestor) — the ResizeObserver retries
    const x = Math.round((br.left - lr.left - list.clientLeft) * 100) / 100;
    const w = Math.round(br.width * 100) / 100;
    list.style.setProperty('--td-tabs-ind-x', `${x}px`);
    list.style.setProperty('--td-tabs-ind-w', `${w}px`);
    list.setAttribute('data-state', 'ready');
  }

  // --- Panels (D7) ---

  _panelElement(id) {
    const root = this.getRootNode();
    const el = typeof root.getElementById === 'function' ? root.getElementById(id) : document.getElementById(id);
    return el && !this.contains(el) ? el : null;
  }

  _syncPanels() {
    if (!this.isConnected) return;
    const keep = new Set();
    this._items.forEach((tab, i) => {
      if (!tab.panel) return;
      const panel = this._panelElement(tab.panel);
      if (!panel) return;
      keep.add(panel);
      if (!this._panels.has(panel)) {
        const saved = {};
        for (const a of PANEL_ATTRS) saved[a] = panel.getAttribute(a);
        this._panels.set(panel, saved);
      }
      const saved = this._panels.get(panel);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', this._tabDomId(i));
      panel.toggleAttribute('hidden', tab.id !== this._activeTabId);
      if (panel.querySelector(FOCUSABLE)) this._restoreAttr(panel, 'tabindex', saved.tabindex);
      else panel.setAttribute('tabindex', '0');
    });
    this._releasePanels(keep);
  }

  /** Restore every attribute td-tabs set on panels no longer managed (not in `keep`). */
  _releasePanels(keep) {
    for (const [panel, saved] of this._panels) {
      if (keep.has(panel)) continue;
      for (const a of PANEL_ATTRS) this._restoreAttr(panel, a, saved[a]);
      this._panels.delete(panel);
    }
  }

  _restoreAttr(el, name, value) {
    if (value == null) el.removeAttribute(name);
    else el.setAttribute(name, value);
  }

  // --- Attributes: all handled in place (no re-render) ---

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized) return;
    if (name === 'active-tab') {
      if (newVal != null) this._select(newVal, false);
    } else if (name === 'size') {
      if (this._list) this._list.className = `td-tabs td-tabs--${this._size()}`;
      this._scheduleIndicator();
    } else {
      this._applyName();
    }
  }

  // --- Interaction ---

  _tabFromEvent(e) {
    const btn = e.target instanceof Element ? e.target.closest('.td-tabs__tab') : null;
    return btn && this._buttons.includes(btn) ? btn : null;
  }

  _onClick(e) {
    const btn = this._tabFromEvent(e);
    if (!btn) return;
    for (const b of this._buttons) b.tabIndex = b === btn ? 0 : -1; // also when re-clicking the selected tab
    this._select(btn.dataset.tabId, true);
  }

  _onKeydown(e) {
    const btn = this._tabFromEvent(e);
    if (!btn || e.altKey || e.ctrlKey || e.metaKey) return;
    const n = this._buttons.length;
    const i = this._buttons.indexOf(btn);
    const rtl = getComputedStyle(this._list).direction === 'rtl';
    let next;
    switch (e.key) {
      case 'ArrowRight': next = (i + (rtl ? -1 : 1) + n) % n; break;
      case 'ArrowLeft': next = (i + (rtl ? 1 : -1) + n) % n; break;
      case 'Home': next = 0; break;
      case 'End': next = n - 1; break;
      default: return; // Enter/Space: native button click → _onClick
    }
    e.preventDefault();
    const target = this._buttons[next];
    // Roving tabindex follows FOCUS (manual mode too): the focused tab is the one Tab returns to.
    for (const b of this._buttons) b.tabIndex = b === target ? 0 : -1;
    target.focus();
    if (this.getAttribute('activation') === 'auto') this._select(target.dataset.tabId, true);
  }

  /**
   * Select a tab: aria-selected + roving tabindex + panels + indicator, atomically.
   * @returns {boolean} whether the selection changed
   */
  _select(tabId, fireEvents) {
    const id = tabId == null ? null : String(tabId);
    if (id == null || !this._hasTab(id) || id === this._activeTabId) return false;
    this._activeTabId = id;
    for (const b of this._buttons) {
      const selected = b.dataset.tabId === id;
      b.setAttribute('aria-selected', String(selected));
      b.setAttribute('tabindex', selected ? '0' : '-1');
    }
    this._syncPanels();
    this._updateIndicator();
    if (fireEvents) {
      if (this._onChange) this._onChange(id);
      this.emit('tab-change', { tabId: id });
    }
    return true;
  }

  // --- Public API ---

  /**
   * Programmatically switch to a tab (fires `tab-change` / onChange when it changes).
   * @param {string} tabId - Tab ID to activate
   */
  setActiveTab(tabId) {
    this._select(tabId, true);
  }

  /**
   * Get the currently active tab ID.
   * @returns {string|null}
   */
  getActiveTab() {
    return this._activeTabId;
  }
}

if (!customElements.get('td-tabs')) {
  customElements.define('td-tabs', TdTabs);
}
