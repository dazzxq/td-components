import { TdBaseElement } from '../base/td-base-element.js';
import { fillIconSlots, hasIcon } from '../icons/td-icon.js';
import { safeLinkUrl } from '../utils/media-url.js';

let _autoIdCounter = 0;
const SIZES = ['sm', 'md'];
/** v0.70.0 (K9): the td-badge tones a count pill can take (anything else → 'neutral') */
const TONES = ['neutral', 'info', 'success', 'warning', 'danger'];

/**
 * v0.70.0 (K9): a count as the text of its pill, '' = no pill. A finite number → String(n); a string verbatim (the site
 * formats "1.234" / "99+" and owns the length); null / undefined / blank / NaN / ±Infinity / anything else → ''.
 * @param {unknown} count
 * @returns {string}
 */
function countText(count) {
  if (typeof count === 'number') return Number.isFinite(count) ? String(count) : '';
  if (typeof count === 'string') return count.trim() === '' ? '' : count;
  return '';
}
const CLASS_TOKEN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const DEFAULT_NAME = 'Các thẻ';
/** v0.83.0: default name of the link-mode `<nav>` */
const NAV_NAME = 'Điều hướng phụ';
/** px — width of the overflow edge fade (tabs.css `--_td-tabs-fade`); the active tab is scrolled clear of it. */
const EDGE_FADE = 24;
/** px — leave overflow mode only when the widest tab fits the slot with this much to spare (no flip-flop). */
const HYSTERESIS = 4;
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
 *        [data-overflow] [data-scroll-start] [data-scroll-end]
 *        (CSSOM --td-tabs-ind-x / --td-tabs-ind-w)>
 *     <span class="td-tabs__indicator" aria-hidden="true"></span>
 *     <button type="button" role="tab" class="td-tabs__tab" id="{host-id}-tab-{i}" data-tab-id="{id}"
 *             aria-selected="true|false" tabindex="0|-1" [aria-controls="{panel}"]>
 *       [<span class="td-tabs__icon" data-td-icon="{name}" aria-hidden="true">svg</span>]
 *       <span class="td-tabs__label" data-label="{label}">{label}</span>
 *       [<span class="td-tabs__count" data-tone="neutral|info|success|warning|danger"><span class="td-tabs__count-sep">, </span>{count}</span>]
 *     </button>…
 *   v0.70.0 (K9, plan v0.70.0-tabs-counts): the optional count pill only exists for a tab that has a `count`; the visually hidden ", "
 *   makes the accessible name read "{label}, {count}" (name from content, no aria-label). Colours = the td-badge tone pairs.
 *   v0.36.0 (plan QĐ 16): `data-label` feeds `.td-tabs__label::after` (0 px tall, hidden, semibold) — every label is as
 *   wide as its bold rendering, so switching the active (bold) tab never moves text or neighbours.
 *   </div>
 *   Empty: <div class="td-tabs td-tabs--{size}" data-state="empty"></div>
 *
 * Link mode (v0.83.0, plan v0.83.0-tabs-links) — at least one tab has a valid `href` (gate: safeLinkUrl; tabs without one
 * are dropped with a console.warn):
 *   <nav class="td-tabs td-tabs--{sm|md}" aria-label="…" [data-state="ready"] [data-overflow] …>
 *     <span class="td-tabs__indicator" aria-hidden="true"></span>
 *     <a class="td-tabs__tab" href="{href as written}" data-tab-id="{id}" [aria-current="page"]>icon? label count?</a>…
 *   </nav>
 *   No tab roles, no aria-selected, no tabindex (every link is a Tab stop; arrows do nothing); `panel` is ignored. The
 *   current tab = explicit (`active-tab` / setActiveTab) → else the URL (same origin + pathname, one trailing `/`
 *   ignored, search ignored, exact — no prefix; a href with a hash only matches with `match-hash`, then on the exact
 *   `location.hash`, and beats a path-only match) → else none (no aria-current, no data-state, indicator hidden).
 *   Re-matched in place (silently) on `popstate` and, with `match-hash`, on `hashchange`. A click is a native link click;
 *   `tab-click` is dispatched first and cancelling it prevents the navigation. Server-rendered `<a href>` children are
 *   read as the tabs at the first render when `tabs` was never assigned (`data-tab-id`, `data-icon`, `data-count`,
 *   `data-tone`; `aria-current="page"` → initial `active-tab`).
 *
 * Responsive (v0.34.0, plan QĐ 9): equal-width segments (`flex: 1 1 0`) while they fit, else `data-overflow` on the
 * trough → natural-width tabs in a horizontally scrolling row (snap, hidden scrollbar, edge fade driven by
 * `data-scroll-start` / `data-scroll-end`). Rule: slot = (content width − gap × (n − 1)) / n; overflow when the widest
 * tab (measured once per render in the ACTIVE style via `data-measuring`) > slot, back when it is ≤ slot − 4px
 * (hysteresis). Labels never truncate. The trough scrolls itself, so the indicator (its absolute child) scrolls with
 * the tabs.
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
 * @attr {string} aria-label - Tablist name (default "Các thẻ"; link-mode nav: "Điều hướng phụ"); `aria-labelledby` is
 *   forwarded too
 * @attr {boolean} match-hash - v0.83.0 (link mode): a tab whose href has a `#hash` can be current (exact `location.hash`)
 * @fires tab-change - When the user (or setActiveTab) changes the tab, detail: { tabId }
 * @fires tab-click - v0.83.0 (link mode), on a tab link click, BEFORE the native navigation; cancelable (cancelling it calls
 *   preventDefault() on the click), detail: { tabId, href, event }
 *
 * @property {Array<{id: string, label: string, href?: string, icon?: string, panel?: string, count?: number|string, tone?: string}>} tabs - Tab
 *   definitions. `icon`: registry name; DEPRECATED: any other value is a class list rendered as `<i class aria-hidden>`.
 *   v0.70.0: `count` (a finite number or a string; null / undefined / blank / NaN = no pill; 0 → "0") and `tone`
 *   (neutral | info | success | warning | danger, default neutral) draw a count pill after the label.
 *   v0.83.0: `href` (kept as written, escaped; refused by safeLinkUrl → no href) switches to link mode.
 * @property {Function} onChange - Callback receiving tabId (runs before `tab-change`; a throw is logged with
 *   `console.error` and the event still fires)
 */
export class TdTabs extends TdBaseElement {
  static get observedAttributes() {
    return ['size', 'active-tab', 'aria-label', 'aria-labelledby', 'match-hash'];
  }

  static get booleanAttributes() { return ['match-hash']; }

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
    // v0.34.0 overflow decision (QĐ 9)
    /** widest tab's natural outer width in the active style (0 = not measured / not laid out) */
    this._maxOuter = 0;
    this._gap = 0;
    /** trough content-box width (from the ResizeObserver) */
    this._avail = 0;
    this._fontSize = '';
    this._overflow = false;
    /** @type {boolean|null} decision waiting for its frame */
    this._pendingOverflow = null;
    this._modeRaf = 0;
    // v0.70.0 (K9): ONE coalesced re-measure after setTabCount (its own handle); `_countDirty` = a re-measure is owed (the element was
    // disconnected when the count changed, or when its frame had not run yet) — connectedCallback pays it
    this._countRaf = 0;
    this._countDirty = false;
    // v0.83.0 link mode: `_links` = at least one tab has a valid href; `_explicitId` = active-tab / setActiveTab (null = follow
    // the URL); `_tabsAssigned` = the `tabs` setter ran (incl. the pre-upgrade replay) → `<a>` children are not read
    this._links = false;
    this._explicitId = null;
    this._tabsAssigned = false;
    this._childLinksRead = false;
    this._offPop = null;
    this._offHash = null;
  }

  // --- JS Property accessors ---

  get tabs() { return this._tabs; }
  set tabs(data) {
    this._tabsAssigned = true; // v0.83.0: `<a>` children are never read once `tabs` was assigned
    this._assign(data);
    if (this._initialized) {
      const hadFocus = this.contains(document.activeElement);
      this._doRender();
      if (hadFocus) this._buttonFor(this._activeTabId)?.focus();
    }
  }

  /** Normalise `data` into `_items` (+ v0.83.0 link mode) and re-validate the active tab. */
  _assign(data) {
    this._tabs = Array.isArray(data) ? data : [];
    const items = this._tabs
      .filter((t) => t && typeof t === 'object' && t.id != null && t.id !== '')
      .map((t) => {
        const count = countText(t.count); // read ONCE (an accessor-backed tab object may answer differently the second time)
        const tone = t.tone;
        const href = typeof t.href === 'string' ? t.href.trim() : ''; // v0.83.0: kept as written when the gate accepts it
        return {
          id: String(t.id),
          label: t.label == null ? '' : String(t.label),
          icon: typeof t.icon === 'string' ? t.icon.trim() : '',
          panel: typeof t.panel === 'string' ? t.panel.trim() : '',
          count,
          // a tone only means something with a pill: without a count it is dropped (a later setTabCount with no tone starts neutral)
          tone: count && TONES.includes(tone) ? tone : 'neutral',
          href: href && safeLinkUrl(href) ? href : '',
        };
      });
    // v0.83.0: one valid href → link mode; a tab without one is dropped there (no "link tab that is not a link")
    this._links = items.some((t) => t.href);
    this._items = this._links ? items.filter((t) => t.href) : items;
    if (this._items.length < items.length) {
      console.warn(`td-tabs: link mode — ${items.length - this._items.length} tab(s) without a valid href dropped`);
    }
    if (this._explicitId != null && !this._hasTab(this._explicitId)) this._explicitId = null;
    this._validateActive();
  }

  get onChange() { return this._onChange; }
  set onChange(fn) { this._onChange = typeof fn === 'function' ? fn : null; }

  // --- Lifecycle ---

  connectedCallback() {
    this._ensureId();
    this.listen(this, 'click', (e) => this._onClick(e));
    this.listen(this, 'keydown', (e) => this._onKeydown(e));
    // The trough is the scroller in overflow mode; scroll does not bubble → capture on the host.
    this.listen(this, 'scroll', () => this._syncScrollEdges(), { capture: true, passive: true });
    if (typeof document !== 'undefined' && document.fonts && typeof document.fonts.addEventListener === 'function') {
      this.listen(document.fonts, 'loadingdone', () => this._remeasure());
    }
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver((entries) => this._onResize(entries));
    }
    if (!this._initialized) {
      this._validateActive();
      super.connectedCallback(); // first render → afterRender observes + syncs panels
    } else {
      this._observe();
      this._syncPanels();
      // v0.83.0: popstate / hashchange were not heard while detached → listen again and re-match the URL
      this._syncLocationListeners();
      if (this._links) this._resolveCurrent();
      if (this._countDirty) { // v0.70.0: a count changed while disconnected → widths / overflow mode / indicator are stale
        this._countDirty = false;
        this._remeasure();
      } else this._scheduleIndicator();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._ro?.disconnect();
    this._ro = null;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this._modeRaf) cancelAnimationFrame(this._modeRaf);
    this._modeRaf = 0;
    if (this._countRaf) { // v0.70.0: the re-measure had not run — keep owing it
      cancelAnimationFrame(this._countRaf);
      this._countRaf = 0;
      this._countDirty = true;
    }
    this._pendingOverflow = null;
    this._releasePanels(new Set());
    this._syncLocationListeners(); // v0.83.0: not connected → both window listeners removed
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
    // v0.83.0: the first render (after the pre-upgrade property replay) reads server-rendered `<a>` children — only
    // when `tabs` was never assigned
    if (!this._childLinksRead) {
      this._childLinksRead = true;
      if (!this._tabsAssigned) this._adoptLinkChildren();
      // pre-upgrade `activeTab` / `matchHash` replayed in super.connectedCallback() came after connectedCallback's
      // _validateActive (their attribute callbacks return before _initialized) → validate again before the first markup
      this._validateActive();
    }
    const size = this._size();
    if (this._items.length === 0) {
      return `<div class="td-tabs td-tabs--${size}" data-state="empty"></div>`;
    }
    if (this._links) return this._renderLinks(size);
    const tabs = this._items.map((tab, i) => {
      const selected = tab.id === this._activeTabId;
      const controls = tab.panel ? ` aria-controls="${this.escapeHtml(tab.panel)}"` : '';
      return `<button type="button" role="tab" class="td-tabs__tab" id="${this.escapeHtml(this._tabDomId(i))}"`
        + ` data-tab-id="${this.escapeHtml(tab.id)}" aria-selected="${selected}" tabindex="${selected ? 0 : -1}"${controls}>`
        + `${this._iconMarkup(tab.icon)}<span class="td-tabs__label" data-label="${this.escapeHtml(tab.label)}">`
        + `${this.escapeHtml(tab.label)}</span>${this._countMarkup(tab)}</button>`;
    }).join('');
    // Keep the current mode on a re-render (no flash); afterRender re-decides from a fresh measurement.
    const overflow = this._overflow ? ' data-overflow=""' : '';
    return `<div class="td-tabs td-tabs--${size}" role="tablist"${overflow}>`
      + `<span class="td-tabs__indicator" aria-hidden="true"></span>${tabs}</div>`;
  }

  /** v0.83.0 link mode: `<nav>` of `<a class="td-tabs__tab">` (href = the gated original string, escaped). */
  _renderLinks(size) {
    const tabs = this._items.map((tab) => {
      const current = tab.id === this._activeTabId ? ' aria-current="page"' : '';
      return `<a class="td-tabs__tab" href="${this.escapeHtml(tab.href)}" data-tab-id="${this.escapeHtml(tab.id)}"${current}>`
        + `${this._iconMarkup(tab.icon)}<span class="td-tabs__label" data-label="${this.escapeHtml(tab.label)}">`
        + `${this.escapeHtml(tab.label)}</span>${this._countMarkup(tab)}</a>`;
    }).join('');
    const overflow = this._overflow ? ' data-overflow=""' : '';
    return `<nav class="td-tabs td-tabs--${size}"${overflow}>`
      + `<span class="td-tabs__indicator" aria-hidden="true"></span>${tabs}</nav>`;
  }

  /**
   * v0.83.0 progressive enhancement: `:scope > a[href]` children → tabs (id = data-tab-id or the index, label = text,
   * href = the attribute as written, data-icon / data-count / data-tone); an `aria-current="page"` child becomes the
   * initial `active-tab` when the host has none. Children whose href the gate refuses are dropped; none left → empty.
   */
  _adoptLinkChildren() {
    const anchors = [...this.querySelectorAll(':scope > a[href]')];
    if (!anchors.length) return;
    let current = null;
    const data = anchors.map((a, i) => {
      const id = a.getAttribute('data-tab-id') || String(i);
      if (current == null && a.getAttribute('aria-current') === 'page') current = id;
      const tab = { id, label: a.textContent.trim(), href: a.getAttribute('href') };
      for (const [key, attr] of [['icon', 'data-icon'], ['count', 'data-count'], ['tone', 'data-tone']]) {
        const v = a.getAttribute(attr);
        if (v != null) tab[key] = v;
      }
      return tab;
    });
    this._assign(data);
    if (!this._links) { // no child href passed the gate: never turn server links into tablist buttons
      this._assign([]);
      return;
    }
    if (current != null && this._hasTab(current) && !this.hasAttribute('active-tab')) {
      this.setAttribute('active-tab', current); // → _explicitId (attributeChangedCallback)
      this._validateActive();
    }
  }

  afterRender() {
    this._list = this.querySelector(':scope > .td-tabs');
    this._buttons = [...this.querySelectorAll(':scope > .td-tabs > .td-tabs__tab')];
    fillIconSlots(this);
    this._applyName();
    this._observe();
    this._syncPanels();
    this._measure();
    this._decideFromLayout();
    this._updateIndicator();
    this._syncLocationListeners();
  }

  /** v0.70.0 (K9): the count pill of one tab ('' without a count); `tone` was validated against TONES, `count` is escaped. */
  _countMarkup(tab) {
    if (!tab.count) return '';
    return `<span class="td-tabs__count" data-tone="${tab.tone}"><span class="td-tabs__count-sep">, </span>`
      + `${this.escapeHtml(tab.count)}</span>`;
  }

  /** v0.70.0 (K9): bring the pill of ONE rendered tab in line with its item — create, retext / retone, or remove (in place). */
  _paintCount(btn, item) {
    let pill = btn.querySelector(':scope > .td-tabs__count');
    if (!item.count) {
      if (pill) pill.remove();
      return;
    }
    if (!pill) {
      pill = document.createElement('span');
      pill.className = 'td-tabs__count';
      btn.append(pill); // after the label (the last child otherwise)
    }
    pill.setAttribute('data-tone', item.tone);
    const sep = document.createElement('span');
    sep.className = 'td-tabs__count-sep';
    sep.textContent = ', ';
    pill.replaceChildren(sep, document.createTextNode(item.count));
  }

  /** v0.70.0 (K9): ONE re-measure after any run of setTabCount calls (a dedicated handle; see `_countDirty` for a disconnected host). */
  _scheduleRemeasure() {
    if (!this.isConnected) {
      this._countDirty = true;
      return;
    }
    if (this._countRaf) return;
    this._countRaf = requestAnimationFrame(() => {
      this._countRaf = 0;
      this._remeasure();
    });
  }

  _tabDomId(i) { return `${this.id}-tab-${i}`; }

  _buttonFor(id) { return this._buttons.find((b) => b.dataset.tabId === id) || null; }

  _hasTab(id) { return this._items.some((t) => t.id === id); }

  /**
   * Keep `_activeTabId` pointing at an existing tab: current → `active-tab` attribute → first tab.
   * v0.83.0 link mode: explicit → URL match → null (never a fallback to the first tab).
   */
  _validateActive() {
    if (this._links) {
      this._activeTabId = this._currentId();
      return;
    }
    if (this._activeTabId != null && this._hasTab(this._activeTabId)) return;
    const attr = this.getAttribute('active-tab');
    if (attr != null && this._hasTab(attr)) this._activeTabId = attr;
    else this._activeTabId = this._items[0]?.id ?? null;
  }

  /** D19: tablist name = host aria-labelledby → host aria-label → "Các thẻ" (v0.83.0: link-mode nav → "Điều hướng phụ"). */
  _applyName() {
    const list = this._list;
    if (!list) return;
    const nav = list.tagName === 'NAV';
    if (list.getAttribute('role') !== 'tablist' && !nav) {
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
      list.setAttribute('aria-label', label || (nav ? NAV_NAME : DEFAULT_NAME));
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
    if (!btn) {
      if (this._links) list.removeAttribute('data-state'); // v0.83.0: no current page → no pill
      return;
    }
    const lr = list.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    if (br.width === 0) return; // not laid out yet (hidden ancestor) — the ResizeObserver retries
    // + scrollLeft: the indicator is a child of the (possibly scrolled) trough → position in CONTENT coordinates, so it
    // scrolls with the tabs (RTL: scrollLeft ≤ 0, same formula).
    const x = Math.round((br.left - lr.left - list.clientLeft + list.scrollLeft) * 100) / 100;
    const w = Math.round(br.width * 100) / 100;
    list.style.setProperty('--td-tabs-ind-x', `${x}px`);
    list.style.setProperty('--td-tabs-ind-w', `${w}px`);
    list.setAttribute('data-state', 'ready');
  }

  // --- Overflow mode (v0.34.0, plan QĐ 9) ---

  /**
   * ONE synchronous pass: `data-measuring` makes every tab `flex: 0 0 auto` in the active (heaviest) style; read each
   * tab's outer width; remove the attribute — same task, no paint in between. Cached until render / size / font change.
   */
  _measure() {
    const list = this._list;
    this._maxOuter = 0;
    if (!list || !list.isConnected || this._buttons.length === 0) return;
    list.setAttribute('data-measuring', '');
    let max = 0;
    for (const b of this._buttons) max = Math.max(max, b.getBoundingClientRect().width);
    const cs = getComputedStyle(list);
    this._gap = parseFloat(cs.columnGap) || 0;
    this._fontSize = cs.fontSize;
    list.removeAttribute('data-measuring');
    this._maxOuter = max; // 0 when not laid out (hidden ancestor) → measured again on the next real resize
  }

  /** Re-measure (fonts loaded, size changed) and re-decide with the cached width. */
  _remeasure() {
    if (!this._list || !this._list.isConnected) return;
    this._measure();
    this._decide();
    this._scheduleIndicator();
  }

  /** Right after a render: the trough is new (not painted yet) → decide from layout and apply at once (no flash). */
  _decideFromLayout() {
    const list = this._list;
    if (!list || !list.isConnected) return;
    const cs = getComputedStyle(list);
    const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const border = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
    const w = list.getBoundingClientRect().width;
    if (w > 0) this._avail = Math.max(0, w - pad - border);
    if (this._modeRaf) cancelAnimationFrame(this._modeRaf);
    this._modeRaf = 0;
    this._pendingOverflow = null;
    const next = this._nextMode(this._overflow);
    if (next != null && next !== this._overflow) {
      this._overflow = next;
      list.toggleAttribute('data-overflow', next);
    }
    this._syncScrollEdges();
    if (this._overflow) this._scrollActiveIntoView();
  }

  /** @param {ResizeObserverEntry[]} entries */
  _onResize(entries) {
    const list = this._list;
    if (!list || !list.isConnected) return;
    for (const e of entries) {
      if (e.target !== list) continue;
      const box = Array.isArray(e.contentBoxSize) ? e.contentBoxSize[0] : e.contentBoxSize;
      this._avail = box && typeof box.inlineSize === 'number' ? box.inlineSize : e.contentRect.width;
    }
    // Re-measure only when needed: not measured yet (was hidden) or the trough's font size changed.
    if ((!this._maxOuter && this._avail > 0) || getComputedStyle(list).fontSize !== this._fontSize) this._measure();
    this._decide();
    this._syncScrollEdges();
    this._scheduleIndicator();
  }

  /**
   * Hysteresis: enter when maxOuter > slot, leave when maxOuter ≤ slot − 4px.
   * @param {boolean} cur
   * @returns {boolean|null} null = cannot decide (not measured / no width)
   */
  _nextMode(cur) {
    const n = this._buttons.length;
    if (!n || !this._maxOuter || !(this._avail > 0)) return null;
    const slot = (this._avail - this._gap * (n - 1)) / n;
    if (cur) return this._maxOuter > slot - HYSTERESIS;
    return this._maxOuter > slot;
  }

  /** One decision per call; the attribute is written in the next frame, and only when it changes. */
  _decide() {
    const cur = this._pendingOverflow ?? this._overflow;
    const next = this._nextMode(cur);
    if (next == null || next === cur) return;
    if (next === this._overflow) { // back to the applied mode before the frame ran
      this._pendingOverflow = null;
      if (this._modeRaf) cancelAnimationFrame(this._modeRaf);
      this._modeRaf = 0;
      return;
    }
    this._pendingOverflow = next;
    if (this._modeRaf) return;
    this._modeRaf = requestAnimationFrame(() => {
      this._modeRaf = 0;
      const want = this._pendingOverflow;
      this._pendingOverflow = null;
      const list = this._list;
      if (want == null || !list || !list.isConnected || want === this._overflow) return;
      this._overflow = want;
      list.toggleAttribute('data-overflow', want);
      this._syncScrollEdges();
      if (want) this._scrollActiveIntoView();
      this._updateIndicator();
    });
  }

  /** `data-scroll-start` / `data-scroll-end`: content hidden before / after the visible part (edge fade). */
  _syncScrollEdges() {
    const list = this._list;
    if (!list) return;
    let start = false;
    let end = false;
    if (this._overflow) {
      const max = list.scrollWidth - list.clientWidth;
      const pos = Math.abs(list.scrollLeft);
      start = pos > 1;
      end = pos < max - 1;
    }
    if (list.hasAttribute('data-scroll-start') !== start) list.toggleAttribute('data-scroll-start', start);
    if (list.hasAttribute('data-scroll-end') !== end) list.toggleAttribute('data-scroll-end', end);
  }

  /**
   * Scroll the TROUGH only (never the page, unlike scrollIntoView) so the active tab is fully visible — `inline:
   * 'nearest'` semantics, kept clear of the edge fade.
   */
  _scrollActiveIntoView() {
    const list = this._list;
    const btn = this._buttonFor(this._activeTabId);
    if (!list || !btn || !this._overflow) return;
    const lr = list.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    const room = Math.min(EDGE_FADE, Math.max(0, (list.clientWidth - br.width) / 2));
    const left = lr.left + list.clientLeft + room;
    const right = lr.left + list.clientLeft + list.clientWidth - room;
    let delta = 0;
    if (br.left < left) delta = br.left - left;
    else if (br.right > right) delta = br.right - right;
    if (delta) list.scrollLeft += delta;
    this._syncScrollEdges();
  }

  // --- Panels (D7) ---

  _panelElement(id) {
    const root = this.getRootNode();
    const el = typeof root.getElementById === 'function' ? root.getElementById(id) : document.getElementById(id);
    return el && !this.contains(el) ? el : null;
  }

  _syncPanels() {
    if (!this.isConnected) return;
    if (this._links) { // v0.83.0: `panel` is ignored in link mode; panels managed before (tablist) are given back
      this._releasePanels(new Set());
      return;
    }
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
    // v0.83.0: the explicit current tab of link mode follows `active-tab` from the start (null = removed → follow the URL)
    if (name === 'active-tab' && oldVal !== newVal) this._explicitId = newVal;
    if (oldVal === newVal || !this._initialized) return;
    if (name === 'active-tab') {
      if (this._links) this._resolveCurrent();
      else if (newVal != null) this._select(newVal, false);
    } else if (name === 'match-hash') {
      if (this._links) {
        this._syncLocationListeners();
        this._resolveCurrent();
      }
    } else if (name === 'size') {
      if (this._list) this._list.className = `td-tabs td-tabs--${this._size()}`;
      this._remeasure();
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
    if (this._links) {
      this._onLinkClick(e, btn);
      return;
    }
    for (const b of this._buttons) b.tabIndex = b === btn ? 0 : -1; // also when re-clicking the selected tab
    this._select(btn.dataset.tabId, true);
  }

  /**
   * v0.83.0: a link click stays native. `tab-click` is dispatched directly (emit() is not cancelable); only a cancelled
   * `tab-click` prevents the click's default. The current tab is not changed here (the page / hashchange / the site does).
   */
  _onLinkClick(e, a) {
    const tabId = a.dataset.tabId;
    const href = this._items.find((t) => t.id === tabId)?.href ?? a.getAttribute('href');
    const ev = new CustomEvent('tab-click', {
      bubbles: true, composed: true, cancelable: true, detail: { tabId, href, event: e },
    });
    if (!this.dispatchEvent(ev)) e.preventDefault();
  }

  _onKeydown(e) {
    if (this._links) return; // v0.83.0: links are plain Tab stops — no roving, no arrows
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
    if (this._links) { // v0.83.0: an explicit current tab, kept until the next explicit choice
      if (id == null || !this._hasTab(id)) return false;
      this._explicitId = id;
      if (!this._applyCurrent(id)) return false;
    } else {
      if (id == null || !this._hasTab(id) || id === this._activeTabId) return false;
      this._activeTabId = id;
      for (const b of this._buttons) {
        const selected = b.dataset.tabId === id;
        b.setAttribute('aria-selected', String(selected));
        b.setAttribute('tabindex', selected ? '0' : '-1');
      }
      this._syncPanels();
      this._scrollActiveIntoView();
      this._updateIndicator();
    }
    if (fireEvents) {
      if (this._onChange) {
        try {
          this._onChange(id);
        } catch (err) {
          console.error('td-tabs: onChange threw', err);
        }
      }
      this.emit('tab-change', { tabId: id });
    }
    return true;
  }

  // --- Link mode: the current tab (v0.83.0) ---

  /** Explicit (still a tab) → URL match → null. */
  _currentId() {
    if (this._explicitId != null && this._hasTab(this._explicitId)) return this._explicitId;
    return this._matchLocation();
  }

  /**
   * Same origin + pathname (one trailing `/` ignored, search ignored, exact). A href with a hash: never without
   * `match-hash`; with it, path + exact `location.hash`, and it beats a path-only match. First match wins per level.
   * @returns {string|null}
   */
  _matchLocation() {
    if (typeof location === 'undefined') return null;
    const trim = (p) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p);
    const here = trim(location.pathname);
    const withHash = this.hasAttribute('match-hash');
    let pathHit = null;
    for (const tab of this._items) {
      let u;
      try { u = new URL(tab.href, document.baseURI); } catch { continue; }
      if (u.origin !== location.origin || trim(u.pathname) !== here) continue;
      if (u.hash) {
        if (withHash && u.hash === location.hash) return tab.id;
      } else if (pathHit == null) pathHit = tab.id;
    }
    return pathHit;
  }

  /** Re-resolve the current tab and apply it in place — silent (no tab-change). */
  _resolveCurrent() {
    if (!this._links) return false;
    return this._applyCurrent(this._currentId());
  }

  /**
   * aria-current + indicator (+ scroll into the trough when it changed), in place, no re-render.
   * @param {string|null} id
   * @returns {boolean} whether the current tab changed
   */
  _applyCurrent(id) {
    const changed = id !== this._activeTabId;
    this._activeTabId = id;
    for (const b of this._buttons) {
      if (b.dataset.tabId === id) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    if (changed) this._scrollActiveIntoView();
    this._updateIndicator();
    return changed;
  }

  /** popstate always in link mode; hashchange only with `match-hash`; none when detached or in tablist mode. */
  _syncLocationListeners() {
    const pop = this.isConnected && this._links && typeof window !== 'undefined';
    const hash = pop && this.hasAttribute('match-hash');
    const on = (type) => {
      const fn = () => this._resolveCurrent();
      window.addEventListener(type, fn);
      return () => window.removeEventListener(type, fn);
    };
    if (pop && !this._offPop) this._offPop = on('popstate');
    else if (!pop && this._offPop) { this._offPop(); this._offPop = null; }
    if (hash && !this._offHash) this._offHash = on('hashchange');
    else if (!hash && this._offHash) { this._offHash(); this._offHash = null; }
  }

  // --- Public API ---

  /**
   * Programmatically switch to a tab (fires `tab-change` / onChange when it changes).
   * v0.83.0 link mode: the tab becomes the explicit current page until the next explicit choice (URL changes no longer
   * move it); `setActiveTab(null)` = `syncFromLocation()` (silent).
   * @param {string|null} tabId - Tab ID to activate
   */
  setActiveTab(tabId) {
    if (tabId == null && this._links) {
      this.syncFromLocation();
      return;
    }
    this._select(tabId, true);
  }

  /**
   * v0.83.0 (link mode): forget the explicit current tab and match the current URL again — call it after a SPA / PJAX
   * navigation (`history.pushState` fires no event). Silent (no tab-change). No-op in tablist mode.
   */
  syncFromLocation() {
    if (!this._links) return;
    this._explicitId = null;
    this._resolveCurrent();
  }

  /**
   * Get the currently active tab ID (v0.83.0 link mode: the current page's tab, null when none matches).
   * @returns {string|null}
   */
  getActiveTab() {
    return this._activeTabId;
  }

  /**
   * v0.70.0 (K9): set, change or clear the count pill of ONE tab IN PLACE — the tablist and the buttons stay the same nodes (focus,
   * the selected tab and the roving tabindex are untouched), no `tab-change`. `count` null / undefined / '' / NaN clears the pill
   * (and forgets its tone); 0 shows "0". `tone` omitted keeps the tab's current tone (neutral when it had none); pass 'neutral' to
   * reset it. Then ONE coalesced re-measure (widths, overflow mode, indicator). Assigning `tabs` still rebuilds everything and its
   * own `count` / `tone` win.
   * @param {string} tabId
   * @param {number|string|null|undefined} count
   * @param {string} [tone] neutral | info | success | warning | danger
   * @returns {boolean} false when there is no such tab (nothing happens)
   */
  setTabCount(tabId, count, tone) {
    const id = tabId == null ? null : String(tabId);
    const item = id == null ? null : this._items.find((t) => t.id === id);
    if (!item) return false;
    item.count = countText(count);
    if (!item.count) item.tone = 'neutral';
    else if (tone !== undefined) item.tone = TONES.includes(tone) ? tone : 'neutral';
    const btn = this._buttonFor(id);
    if (btn) {
      this._paintCount(btn, item);
      this._scheduleRemeasure();
    }
    return true;
  }
}

if (!customElements.get('td-tabs')) {
  customElements.define('td-tabs', TdTabs);
}
