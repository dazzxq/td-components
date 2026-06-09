import { TdBaseElement } from '../base/td-base-element.js';
import { adoptStyles } from '../utils/adopt-styles.js';

/**
 * Static stylesheet for td-tabs — CSP-strict hardening.
 *
 * Under a strict `Content-Security-Policy` (`style-src 'self'`, no `unsafe-inline`) a
 * declarative `style="…"` attribute is BLOCKED. The container/button/indicator glass
 * styling here is identical for every td-tabs instance (no per-instance values), so it
 * lives in ONE constructable stylesheet adopted via `adoptStyles` (lazy, idempotent,
 * feature-detected, never throwing). Per-element DYNAMIC scalars that differ per
 * instance — the indicator's `left`/`width`/`opacity`, measured from the active button's
 * geometry — stay on the element via CSSOM (`_updateIndicator`), which CSP allows.
 *
 * The sheet is adopted into `document` (td-tabs renders in light DOM), so every selector
 * is element-scoped with a `td-tabs ` prefix to keep the blast radius to this component's
 * own nodes — a host page reusing these generic class names is never affected.
 *
 * Selectors are STABLE element-scoped classes / `data-*`:
 *  - `.td-tabs-container` carries the glass background; the populated variant
 *    (`[data-populated]`) is `position: relative` so the absolutely-positioned indicator
 *    anchors to it (the empty container stays `position: static`, matching baseline).
 *  - `.td-tab-btn` sits above the indicator (`z-index: 1`, transparent background).
 *  - `.td-tabs-indicator` holds the moving pill: position/box-shadow/border-radius/
 *    background and the `left`/`width` transition. Its initial `width: 0; opacity: 0` is
 *    overridden via CSSOM once positioned, so the active pill becomes visible (opacity is
 *    asserted by the parity gate).
 *
 * @type {string}
 */
const TD_TABS_CSS = `
td-tabs .td-tabs-container {
  background: rgba(0, 0, 0, 0.04);
}
td-tabs .td-tabs-container[data-populated] {
  position: relative;
}
td-tabs .td-tab-btn {
  position: relative;
  z-index: 1;
  background: transparent;
}
td-tabs .td-tabs-indicator {
  position: absolute;
  top: 4px;
  bottom: 4px;
  width: 0;
  opacity: 0;
  z-index: 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  transition: left 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), width 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
`;

/**
 * Tabs component with liquid glass style horizontal tab buttons.
 * Port of dcms-tabs.js to Web Component extending TdBaseElement.
 *
 * @element td-tabs
 * @attr {string} size - Tab size: 'sm' | 'md' (default 'md')
 * @attr {string} active-tab - ID of initially active tab
 * @fires tab-change - When active tab changes, detail: { tabId }
 *
 * @property {Array<{id: string, label: string, icon?: string}>} tabs - Tab definitions set via JS property
 * @property {Function} onChange - Callback receiving tabId
 */
export class TdTabs extends TdBaseElement {
  static get observedAttributes() {
    return ['size', 'active-tab'];
  }

  constructor() {
    super();
    this._tabs = [];
    this._activeTabId = null;
    this._onChange = null;
    this._tabButtons = new Map();
  }

  // --- JS Property accessors ---

  get tabs() { return this._tabs; }
  set tabs(data) {
    this._tabs = Array.isArray(data) ? data : [];
    if (!this._activeTabId && this._tabs.length > 0) {
      this._activeTabId = this.getAttribute('active-tab') || this._tabs[0].id;
    }
    if (this._initialized) {
      this._doRender();
    }
  }

  get onChange() { return this._onChange; }
  set onChange(fn) { this._onChange = typeof fn === 'function' ? fn : null; }

  // --- Size config ---

  _getSizeConfig() {
    const size = this.getAttribute('size') || 'md';
    const sizes = {
      sm: { padding: 'px-3 py-1.5', text: 'text-xs', iconMr: 'mr-1' },
      md: { padding: 'px-3 py-2', text: 'text-xs', iconMr: 'mr-1.5' },
    };
    return sizes[size] || sizes.md;
  }

  // --- Lifecycle ---

  connectedCallback() {
    // Adopt the static stylesheet ONCE (idempotent, lazy — never at module top-level).
    // On unsupported browsers/SSR this is a no-op (returns false) and the component still
    // renders structurally via its Tailwind classes; only the glass embellishments and
    // indicator transition are absent. Adopted into `document` (td-tabs renders in the
    // light DOM, so its nodes are reached by the top-level document sheet).
    adoptStyles(TD_TABS_CSS, 'td-tabs');
    super.connectedCallback();
  }

  // --- Rendering ---

  render() {
    if (this._tabs.length === 0) {
      return '<div class="td-tabs-container flex gap-1 p-1 rounded-xl"></div>';
    }

    const s = this._getSizeConfig();
    const activeId = this._activeTabId || this._tabs[0]?.id;

    const tabsHtml = this._tabs.map(tab => {
      const isActive = tab.id === activeId;
      const iconHtml = tab.icon ? `<i class="${this.escapeHtml(tab.icon)} ${s.iconMr} opacity-70"></i>` : '';

      return `
        <button
          type="button"
          class="td-tab-btn flex-1 ${s.padding} ${s.text} font-medium rounded-lg transition-colors duration-200 ${isActive ? 'text-gray-800' : 'text-gray-500 hover:text-gray-700'}"
          data-tab-id="${this.escapeHtml(tab.id)}"
        >${iconHtml}${this.escapeHtml(tab.label)}</button>
      `;
    }).join('');

    return `<div class="td-tabs-container flex gap-1 p-1 rounded-xl" data-populated>
      <div class="td-tabs-indicator"></div>
      ${tabsHtml}
    </div>`;
  }

  afterRender() {
    this._tabButtons.clear();
    const buttons = this.querySelectorAll('.td-tab-btn');
    buttons.forEach(btn => {
      const tabId = btn.dataset.tabId;
      this._tabButtons.set(tabId, btn);
      this.listen(btn, 'click', () => this._handleTabClick(tabId));
    });

    // Position indicator on active tab after paint
    requestAnimationFrame(() => this._updateIndicator());
  }

  /**
   * Update the sliding indicator position to match the active tab button.
   * @private
   */
  _updateIndicator() {
    const container = this.querySelector('.td-tabs-container');
    const indicator = this.querySelector('.td-tabs-indicator');
    const activeBtn = this._tabButtons.get(this._activeTabId);

    if (!container || !indicator || !activeBtn) return;

    indicator.style.left = `${activeBtn.offsetLeft}px`;
    indicator.style.width = `${activeBtn.offsetWidth}px`;
    indicator.style.opacity = '1';
  }

  // Prevent full re-render for active-tab attribute changes — just switch styles
  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (!this._initialized) return;

    if (name === 'active-tab' && newVal) {
      this._switchTab(newVal, false);
      return;
    }

    this._doRender();
  }

  // --- Tab switching ---

  _handleTabClick(tabId) {
    if (this._activeTabId === tabId) return;
    this._switchTab(tabId, true);
  }

  /**
   * Switch active tab with style updates (no full re-render).
   * @param {string} tabId - Target tab ID
   * @param {boolean} fireEvents - Whether to fire onChange callback and tab-change event
   */
  _switchTab(tabId, fireEvents) {
    if (!this._tabButtons.has(tabId)) return;
    if (this._activeTabId === tabId) return;

    // Deactivate previous
    const prevBtn = this._tabButtons.get(this._activeTabId);
    if (prevBtn) {
      prevBtn.classList.remove('text-gray-800');
      prevBtn.classList.add('text-gray-500', 'hover:text-gray-700');
    }

    // Activate new
    const newBtn = this._tabButtons.get(tabId);
    if (newBtn) {
      newBtn.classList.add('text-gray-800');
      newBtn.classList.remove('text-gray-500', 'hover:text-gray-700');
    }

    this._activeTabId = tabId;

    // Animate indicator to new tab position
    this._updateIndicator();

    if (fireEvents) {
      if (this._onChange) {
        this._onChange(tabId);
      }
      this.emit('tab-change', { tabId });
    }
  }

  // --- Public API ---

  /**
   * Programmatically switch to a tab.
   * @param {string} tabId - Tab ID to activate
   */
  setActiveTab(tabId) {
    this._switchTab(tabId, true);
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
