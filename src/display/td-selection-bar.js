import { TdBaseElement } from '../base/td-base-element.js';
import { tdIcon } from '../icons/td-icon.js';
import { TdMenu } from '../feedback/td-menu.js';
// pure helper only — the group STORE is never reached from here (§4.1: always through the defined grid class)
import { fitActions, fitSecondaries } from '../utils/media-selection-group.js';
// v0.96.0 (plan v0.96.0-action-fold §4 / §5): the shared page-action fold policy (fold="count")
import { planActions, narrowState } from '../utils/action-fold.js';
// side effect on purpose (plan v0.95.0-selection-bar §4.1): with plain ESM the grid is defined before / with the bar
import './td-media-grid.js';

/**
 * `<td-selection-bar>` (v0.95.0, plan docs/internal/plans/v0.95.0-selection-bar.md §5) — the action bar of a selection
 * made in one or more `td-media-grid` (a selection group: `group="lib"` ↔ `<td-media-grid selection-group="lib">`, or
 * `for="grid-a grid-b"`). Upgrades the site's markup in place (no innerHTML, no Shadow DOM, CSP-strict):
 *
 *   <td-selection-bar group="lib" label="Thao tác với ảnh đã chọn">
 *     <button type="button" data-td-action="download" data-td-action-icon="download">Tải về</button>
 *     <button type="button" data-td-action="delete" data-td-action-icon="trash" data-td-tone="danger">Xoá</button>
 *   </td-selection-bar>
 *
 * After the upgrade (built with createElement; the site's buttons are MOVED into the tray, node + listeners kept):
 *   .td-selection-bar__panel[role=group][aria-label] > .td-selection-bar__clear (×) + .td-selection-bar__count +
 *   .td-selection-bar__actions (the site's buttons: td-btn td-btn--ghost td-selection-bar__action[--danger], a
 *   span.td-selection-bar__icon[aria-hidden] + span.td-selection-bar__label, [data-td-overflow]; other site children;
 *   .td-selection-bar__more "…" [hidden]) — and a polite live region (span.td-sr-only) OUTSIDE the panel.
 *
 * - Hidden while nothing is selected (`[data-empty]`); sticky at the bottom of its containing block
 *   (`--td-selection-bar-position`); `--td-selection-bar-offset` on `<html>` = height of the tallest visible bar.
 * - Narrow (bar < 36rem → `[data-compact]`): icon-only buttons (label kept for assistive tech); actions that do not
 *   fit go, from the end, into the "…" menu (TdMenu), with hysteresis.
 * - Action click → `selection-action` (cancelable). Not prevented → the bar clears the selection (owner 03/11).
 * - Locked (`disabled`, or every member grid disabled): `[data-disabled]`, `aria-disabled` on its controls, clicks
 *   blocked. A site button that is `disabled` / `aria-disabled="true"` never acts.
 *
 * @attr {string} group - Selection group name (`selection-group` of the grids). Wins over `for` (warns once).
 * @attr {string} for - Space-separated ids of grids (an anonymous group owned by this bar).
 * @attr {string} label - Name of the panel (`role="group"`); default `TdSelectionBar.labels.region`.
 * @attr {boolean} disabled - Lock the bar.
 * @attr {string} fold - `width` (default; v0.95.0 behaviour: actions that do not fit go, from the end, into "…") |
 *   `count` (v0.96.0 shared policy, plan v0.96.0-action-fold §4 / §5.1: the first 2 secondaries + the primary last,
 *   after "…"; the rest and every `data-td-in-menu` action in "…"; bar < 480px → primary + "…" only; then step 2 folds
 *   the shown secondaries that do not fit — never the primary). Unknown → `width`.
 * @attr {string} surface - `solid` (default) | `glass` (v0.96.0, opt-in exception to ADR 0011 rule 2 — ADR 0044:
 *   `.td-glass-surface` panel, radius `--td-selection-bar-glass-radius`, transparent bottom gap
 *   `--td-selection-bar-glass-gap`; guaranteed with the default `--td-selection-bar-position: sticky` only).
 *   Unknown → `solid`.
 *
 * Site buttons (v0.96.0): `data-td-tone="primary"` → solid accent button (`td-btn--primary`; never folded; keeps its
 * label when compact); `data-td-in-menu` → always in "…" (both fold modes).
 *
 * @fires selection-change - The group total changed by the user / `{ emit: true }` / selected items or grids removed.
 *   detail: { count, ids } (one per action, microtask batched)
 * @fires selection-action - An action button was activated (tray or "…" menu). Cancelable: not prevented → the bar
 *   clears the selection right after the dispatch. detail: { action, ids, count, button }
 *
 * @property {number} count - Total selected in the group (read only).
 * @property {string[]} selectedIds - Selected ids, grid DOM order then item order (read only).
 * @property {HTMLElement[]} grids - Member grids, DOM order (read only).
 */

const OFFSET_PROP = '--td-selection-bar-offset';
const COMPACT_REM = 36;
const ACTION = 'data-td-action';
const ACTION_ICON = 'data-td-action-icon';
const IN_MENU = 'data-td-in-menu';
const TONE = 'data-td-tone';
const GLASS_CLASSES = ['td-glass-surface', 'td-glass-surface--strong', 'td-glass-surface--lg'];

// --- --td-selection-bar-offset: ONE writer per page (the module of the defined class, plan §5.3) ---

/** @type {Set<HTMLElement>} connected bars */
const liveBars = new Set();
/** @type {Map<HTMLElement, number>} visible bar → border-box height (px) */
const barHeights = new Map();
let offsetRaf = 0;
/** @type {number|null} value written last (px), null = property absent */
let offsetWritten = null;

function offsetRoot() {
  return typeof document !== 'undefined' ? document.documentElement : null;
}

function writeOffset() {
  offsetRaf = 0;
  const root = offsetRoot();
  if (!root || !liveBars.size) return;
  let max = 0;
  for (const h of barHeights.values()) if (h > max) max = h;
  if (offsetWritten != null && Math.abs(max - offsetWritten) < 1) return;
  offsetWritten = max;
  root.style.setProperty(OFFSET_PROP, `${Math.round(max * 100) / 100}px`);
}

function scheduleOffset() {
  if (offsetRaf || typeof requestAnimationFrame !== 'function') return;
  offsetRaf = requestAnimationFrame(writeOffset);
}

function offsetHeight(bar, h) {
  if (h > 0) barHeights.set(bar, h);
  else barHeights.delete(bar);
  scheduleOffset();
}

function offsetConnect(bar) {
  liveBars.add(bar);
  scheduleOffset();
}

function offsetDisconnect(bar) {
  liveBars.delete(bar);
  barHeights.delete(bar);
  if (liveBars.size) {
    scheduleOffset();
    return;
  }
  if (offsetRaf) cancelAnimationFrame(offsetRaf);
  offsetRaf = 0;
  offsetWritten = null;
  offsetRoot()?.style.removeProperty(OFFSET_PROP);
}

const isLockedButton = (b) => b.disabled || b.getAttribute('aria-disabled') === 'true';

export class TdSelectionBar extends TdBaseElement {
  /** Default texts (Vietnamese); override per site: `TdSelectionBar.labels.count = '{n} selected'`. */
  static labels = {
    count: 'Đã chọn {n}',
    clear: 'Bỏ chọn tất cả',
    more: 'Thao tác khác',
    region: 'Thao tác với mục đã chọn',
    cleared: 'Đã bỏ chọn tất cả',
  };

  static get observedAttributes() {
    return ['group', 'for', 'label', 'disabled', 'fold', 'surface'];
  }

  static get booleanAttributes() {
    return ['disabled'];
  }

  constructor() {
    super();
    this._panel = null;
    this._clearBtn = null;
    this._countEl = null;
    this._tray = null;
    this._more = null;
    this._live = null;
    /** group handle (TdMediaGrid._selectionGroup), null = none */
    this._handle = null;
    this._unsub = null;
    /** generation: a pending whenDefined() of an older connect / attribute is ignored */
    this._gen = 0;
    this._count = 0;
    this._ids = [];
    this._locked = false;
    /** @type {WeakSet<Element>} controls this bar put aria-disabled="true" on (only those are restored) */
    this._ariaOwned = new WeakSet();
    /** @type {Set<Element>} same, iterable */
    this._ariaList = new Set();
    /** @type {WeakSet<HTMLButtonElement>} adopted action buttons */
    this._adopted = new WeakSet();
    /** @type {WeakSet<HTMLButtonElement>} buttons whose aria-label the bar set (kept in sync with their text) */
    this._ownLabel = new WeakSet();
    this._mo = null;
    this._ro = null;
    this._raf = 0;
    this._dirty = true;
    /** @type {Map<HTMLButtonElement, number>} natural widths (current compact mode) */
    this._widths = new Map();
    this._moreWidth = 0;
    this._extraWidth = 0;
    this._gap = 0;
    this._fit = null;
    this._compact = false;
    this._fontsHooked = false;
    this._warnedGroupFor = false;
    this._announceQueued = false;
    this._pendingAnnounce = '';
    // v0.96.0 fold="count" (plan v0.96.0-action-fold §5.1)
    /** @type {HTMLButtonElement|null} the primary that won the last count layout (kept across rebuilds, §4.2 rule 2) */
    this._winner = null;
    this._narrow = false;
    /** @type {HTMLButtonElement[]} shown secondaries the last step 2 ran on (its hysteresis is only valid for them) */
    this._fitSet = [];
    /** @type {HTMLButtonElement[]|null} "…" order in count mode (step-2 folds, then step-1 folds); null = DOM order */
    this._menuOrder = null;
    /** @type {WeakSet<HTMLButtonElement>} buttons the bar switched from ghost to primary */
    this._primaryOwned = new WeakSet();
    this._warnedPrimary = false;
  }

  /** v0.96.0: `width` (default) | `count`; unknown → `width` */
  get fold() {
    return (this.getAttribute('fold') || '').trim().toLowerCase() === 'count' ? 'count' : 'width';
  }

  set fold(v) {
    if (v == null) this.removeAttribute('fold');
    else this.setAttribute('fold', String(v));
  }

  /** v0.96.0: `solid` (default) | `glass`; unknown → `solid` */
  get surface() {
    return (this.getAttribute('surface') || '').trim().toLowerCase() === 'glass' ? 'glass' : 'solid';
  }

  set surface(v) {
    if (v == null) this.removeAttribute('surface');
    else this.setAttribute('surface', String(v));
  }

  // --- public API ---

  get count() { return this._handle ? this._handle.count : 0; }

  get selectedIds() { return this._handle ? this._handle.selectedIds : []; }

  get grids() { return this._handle ? this._handle.grids : []; }

  /** @returns {string[]} the selected ids (= `selectedIds`) */
  getSelected() { return this.selectedIds; }

  /**
   * Clear the selection of every member grid that is not disabled. No event unless `{ emit: true }`.
   * @param {{ emit?: boolean }} [opts]
   */
  clear(opts = {}) {
    this._handle?.clear({ emit: !!opts?.emit });
  }

  // --- lifecycle (in place: built once, re-bound on re-connect) ---

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized || !this._panel) return;
    if (name === 'label') this._syncLabel();
    else if (name === 'disabled') this._syncLock();
    else if (name === 'surface') this._syncSurface();
    else if (name === 'fold') this._refold();
    else if (this.isConnected) this._connectGroup(); // group / for
  }

  /** @private first connect and every re-connect (disconnect ran the cleanups) */
  _doRender() {
    if (this._suppressRender) return;
    this.classList.add('td-selection-bar');
    this._build();
    this._adopt();
    this._syncLabel();
    this._syncSurface();
    this._renderCount();
    this.toggleAttribute('data-empty', this._count === 0);

    this.listen(this, 'click', (e) => this._onCaptureClick(e), true);
    this.listen(this, 'click', (e) => this._onClick(e));
    if (typeof MutationObserver === 'function') {
      this._mo = new MutationObserver((records) => this._onMutations(records));
      this._mo.observe(this, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['hidden', 'disabled', ACTION_ICON, ACTION, 'aria-label', TONE, IN_MENU],
      });
      this._cleanups.push(() => { this._mo?.disconnect(); this._mo = null; });
    }
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver((entries) => this._onResize(entries));
      this._ro.observe(this);
      this._cleanups.push(() => { this._ro?.disconnect(); this._ro = null; });
    }
    if (!this._fontsHooked && typeof document !== 'undefined' && document.fonts?.ready) {
      this._fontsHooked = true;
      document.fonts.ready.then(() => { this._dirty = true; this._schedule(); }, () => {});
    }
    offsetConnect(this);
    this._cleanups.push(() => offsetDisconnect(this));
    this._cleanups.push(() => {
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = 0;
    });
    this._connectGroup();
    this._cleanups.push(() => this._disconnectGroup());
    this._dirty = true;
    this._schedule();
  }

  /** @private the kit's own parts (once; kept across re-connects) */
  _build() {
    if (this._panel) return;
    const L = TdSelectionBar.labels;
    const panel = document.createElement('div');
    panel.className = 'td-selection-bar__panel';
    panel.setAttribute('role', 'group');

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'td-btn td-btn--ghost td-selection-bar__clear';
    clear.setAttribute('aria-label', String(L.clear ?? ''));
    const x = tdIcon('close');
    if (x) clear.appendChild(x);

    const count = document.createElement('span');
    count.className = 'td-selection-bar__count';

    const tray = document.createElement('div');
    tray.className = 'td-selection-bar__actions';

    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'td-btn td-btn--ghost td-selection-bar__more';
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-label', String(L.more ?? ''));
    more.hidden = true;
    const dots = tdIcon('more');
    if (dots) more.appendChild(dots);
    tray.appendChild(more);

    panel.append(clear, count, tray);

    const live = document.createElement('span');
    live.className = 'td-sr-only';
    live.setAttribute('aria-live', 'polite');

    // the site's children stay where they are until _adopt() moves them into the tray
    this.prepend(panel);
    this.appendChild(live);
    this._panel = panel;
    this._clearBtn = clear;
    this._countEl = count;
    this._tray = tray;
    this._more = more;
    this._live = live;
  }

  /** @private own parts (never the site's) — mutations there are ignored */
  _isOwn(node) {
    return node === this._clearBtn || node === this._countEl || node === this._more || node === this._live
      || node === this._panel || node === this._tray
      || !!(this._clearBtn?.contains(node) || this._countEl?.contains(node) || this._more?.contains(node)
        || this._live?.contains(node));
  }

  /**
   * @private move the site's children into the tray: action buttons (in DOM order) before the other site children,
   * "…" last. Idempotent.
   */
  _adopt() {
    if (!this._tray) return false;
    let changed = false;
    for (const node of [...this.childNodes]) {
      if (node === this._panel || node === this._live) continue;
      if (node.nodeType === 3 && !node.textContent.trim()) continue; // markup whitespace stays
      if (node.nodeType !== 1 && node.nodeType !== 3) continue;
      this._insertSite(node);
      changed = true;
    }
    for (const b of this._actions(true)) {
      if (!this._adopted.has(b)) {
        this._adoptButton(b);
        changed = true;
      }
    }
    // keep the order: actions, other site children, "…" (v0.96.0 fold="count": then the winning primary, §5.1)
    const tail = this._tail();
    // an action left after "…" (a former count-mode primary) goes back to the end of the actions
    for (let n = this._more.nextElementSibling; n; n = n.nextElementSibling) {
      if (n === tail || !this._isAction(n)) continue;
      const before = [...this._tray.children].find((el) => el !== this._more && el !== tail && el !== n && !this._isAction(el));
      this._tray.insertBefore(n, before || this._more);
      changed = true;
      n = this._more;
    }
    const firstOther = [...this._tray.children].find((el) => el !== this._more && el !== tail && !this._isAction(el));
    for (const b of this._actions(true)) {
      if (b === tail) continue;
      if (firstOther && (b.compareDocumentPosition(firstOther) & Node.DOCUMENT_POSITION_PRECEDING)) {
        this._tray.insertBefore(b, firstOther);
        changed = true;
      }
    }
    if (tail) {
      if (this._tray.lastElementChild !== tail || tail.previousElementSibling !== this._more) {
        this._tray.append(this._more, tail);
        changed = true;
      }
    } else if (this._tray.lastElementChild !== this._more) {
      this._tray.appendChild(this._more);
      changed = true;
    }
    if (changed && this._locked) this._applyLock(true);
    return changed;
  }

  /** @private fold="count": the winning primary, placed after "…" — null in width mode / when it is no longer valid */
  _tail() {
    const w = this._winner;
    if (this.fold !== 'count' || !w || w.parentElement !== this._tray || w.hidden || !this._isAction(w)) return null;
    return w;
  }

  /** @private */
  _insertSite(node) {
    if (node.nodeType === 1 && this._isAction(node)) {
      const others = [...this._tray.children].find((el) => el !== this._more && !this._isAction(el));
      this._tray.insertBefore(node, others || this._more);
    } else {
      this._tray.insertBefore(node, this._more);
    }
  }

  /** @private */
  _isAction(el) {
    return el instanceof HTMLButtonElement && el.hasAttribute(ACTION) && el.getAttribute(ACTION) !== '';
  }

  /**
   * @private action buttons (direct children of the tray), DOM order
   * @param {boolean} [all] include the site's `hidden` ones
   */
  _actions(all = false) {
    if (!this._tray) return [];
    return [...this._tray.children].filter((el) => this._isAction(el) && (all || !el.hidden));
  }

  /** @private classes, icon span, label span, aria-label */
  _adoptButton(b) {
    this._adopted.add(b);
    b.classList.add('td-btn', 'td-btn--ghost', 'td-selection-bar__action');
    this._syncTone(b);
    let label = [...b.children].find((el) => el.classList.contains('td-selection-bar__label'));
    if (!label) {
      label = document.createElement('span');
      label.className = 'td-selection-bar__label';
      for (const n of [...b.childNodes]) {
        if (n.nodeType === 1 && /** @type {Element} */ (n).classList.contains('td-selection-bar__icon')) continue;
        label.appendChild(n); // move (text nodes / site markup), never parse
      }
      b.appendChild(label);
    }
    this._syncIcon(b);
    this._syncAriaLabel(b);
  }

  /**
   * @private `data-td-tone` whitelist: `danger` → modifier; v0.96.0 `primary` → solid `td-btn--primary` + modifier
   * (ghost given back when the tone goes — only on buttons the bar switched)
   */
  _syncTone(b) {
    const tone = b.getAttribute(TONE);
    b.classList.toggle('td-selection-bar__action--danger', tone === 'danger');
    if (tone === 'primary') {
      if (!this._primaryOwned.has(b)) {
        this._primaryOwned.add(b);
        b.classList.remove('td-btn--ghost');
        b.classList.add('td-btn--primary', 'td-selection-bar__action--primary');
      }
    } else if (this._primaryOwned.has(b)) {
      this._primaryOwned.delete(b);
      b.classList.remove('td-btn--primary', 'td-selection-bar__action--primary');
      b.classList.add('td-btn--ghost');
    }
  }

  /** @private v0.96.0 surface="glass": the panel takes the shared glass recipe (+ its fallbacks), the host its gap */
  _syncSurface() {
    if (!this._panel) return;
    const glass = this.surface === 'glass';
    if (this.classList.contains('td-selection-bar--glass') !== glass) this.classList.toggle('td-selection-bar--glass', glass);
    for (const c of GLASS_CLASSES) {
      if (this._panel.classList.contains(c) !== glass) this._panel.classList.toggle(c, glass);
    }
  }

  /** @private v0.96.0: the fold mode changed at run time — forget the previous plan, lay out once */
  _refold() {
    if (!this._tray) return;
    for (const b of this._actions(true)) b.removeAttribute('data-td-overflow');
    this._fit = null;
    this._fitSet = [];
    this._menuOrder = null;
    if (this.fold !== 'count') this._winner = null;
    this._adopt();
    this._mo?.takeRecords();
    this._dirty = true;
    this._schedule();
  }

  /** @private icon from `data-td-action-icon` (registry name; unknown = no icon) */
  _syncIcon(b) {
    const name = (b.getAttribute(ACTION_ICON) || '').trim();
    let span = [...b.children].find((el) => el.classList.contains('td-selection-bar__icon'));
    const cur = span?.firstElementChild?.getAttribute('data-icon') || '';
    const svg = name ? tdIcon(name) : null;
    if (!svg) {
      span?.remove();
      b.classList.remove('td-selection-bar__action--icon');
      return;
    }
    if (span && cur === svg.getAttribute('data-icon')) {
      b.classList.add('td-selection-bar__action--icon');
      return;
    }
    if (!span) {
      span = document.createElement('span');
      span.className = 'td-selection-bar__icon';
      span.setAttribute('aria-hidden', 'true');
      b.prepend(span);
    }
    span.replaceChildren(svg);
    b.classList.add('td-selection-bar__action--icon');
  }

  /** @private aria-label = trimmed text when the site set none (also the name of an icon-only button) */
  _syncAriaLabel(b) {
    const text = this._labelText(b);
    if (!b.hasAttribute('aria-label') || this._ownLabel.has(b)) {
      if (text) {
        if (b.getAttribute('aria-label') !== text) b.setAttribute('aria-label', text);
        this._ownLabel.add(b);
      } else if (this._ownLabel.has(b)) {
        b.removeAttribute('aria-label');
        this._ownLabel.delete(b);
      }
    }
  }

  /** @private */
  _labelText(b) {
    const label = [...b.children].find((el) => el.classList.contains('td-selection-bar__label'));
    return ((label || b).textContent || '').replace(/\s+/g, ' ').trim();
  }

  /** @private */
  _onMutations(records) {
    let dirty = false;
    for (const r of records) {
      const t = r.target;
      if (this._isOwn(t) && !(r.type === 'childList' && t === this._tray)) continue;
      if (r.type === 'attributes' && r.attributeName === 'aria-label') {
        // the site took over the name of a button: stop syncing it
        const b = /** @type {HTMLButtonElement} */ (t);
        if (this._ownLabel.has(b) && b.getAttribute('aria-label') !== this._labelText(b)) this._ownLabel.delete(b);
        continue;
      }
      dirty = true;
    }
    if (!dirty) return;
    this._adopt();
    for (const b of this._actions(true)) {
      this._syncTone(b);
      this._syncIcon(b);
      this._syncAriaLabel(b);
    }
    this._mo?.takeRecords(); // our own writes above
    this._dirty = true;
    this._schedule();
  }

  /** @private */
  _syncLabel() {
    if (!this._panel) return;
    const own = (this.getAttribute('label') || '').trim();
    this._panel.setAttribute('aria-label', own || String(TdSelectionBar.labels.region ?? ''));
  }

  // --- group ---

  /** @private (re)attach to the group named by `group` / `for` — after td-media-grid is defined (§4.1) */
  _connectGroup() {
    this._disconnectGroup();
    const gen = ++this._gen;
    if (typeof customElements === 'undefined') return;
    customElements.whenDefined('td-media-grid').then(() => {
      if (gen !== this._gen || !this.isConnected) return;
      this._attach();
    });
  }

  /** @private */
  _attach() {
    const Grid = customElements.get('td-media-grid');
    if (!Grid || typeof Grid._selectionGroup !== 'function') return;
    const name = (this.getAttribute('group') || '').trim();
    const ids = (this.getAttribute('for') || '').split(/\s+/).filter(Boolean);
    if (name && ids.length && !this._warnedGroupFor) {
      this._warnedGroupFor = true;
      console.warn('td-selection-bar: both "group" and "for" are set — "for" is ignored.');
    }
    if (!name && !ids.length) {
      this._onState({ count: 0, ids: [], emit: false });
      return;
    }
    const h = Grid._selectionGroup(name ? { name, root: this.getRootNode() } : { ids, root: this.getRootNode() });
    if (!h) return;
    this._handle = h;
    this._unsub = h.subscribe((s) => this._onState(s));
    h.registerBar(this);
    this._onState({ count: h.count, ids: h.selectedIds, emit: false });
  }

  /** @private */
  _disconnectGroup() {
    this._gen++;
    this._unsub?.();
    this._unsub = null;
    this._handle?.release();
    this._handle = null;
  }

  /**
   * @private a batched change of the group: count, empty / visible, lock, focus, event, announcement
   * @param {{ count: number, ids: string[], emit: boolean }} s
   */
  _onState(s) {
    const was = this._count;
    this._count = s.count;
    this._ids = s.ids;
    this._renderCount();
    const doc = this.ownerDocument;
    const focusIn = !!this._panel && this._panel.contains(doc.activeElement);
    if (s.count === 0 && was > 0 && focusIn) this._returnFocus(this._focusList());
    this.toggleAttribute('data-empty', s.count === 0);
    this._syncLock();
    if (s.count > 0 && was === 0) {
      this._dirty = true;
      this._schedule();
    }
    if (!s.emit) return;
    this.emit('selection-change', { count: s.count, ids: s.ids.slice() });
    if (this._handle?.isAnnouncer(this)) {
      const L = TdSelectionBar.labels;
      this._announce(s.count ? this._countText(s.count) : String(L.cleared ?? ''));
    }
  }

  /** @private */
  _countText(n) {
    return String(TdSelectionBar.labels.count ?? '').replace('{n}', () => String(n));
  }

  /** @private */
  _renderCount() {
    if (!this._countEl) return;
    const text = this._countText(this._count);
    if (this._countEl.textContent !== text) this._countEl.textContent = text;
  }

  /** @private one live-region update per batch (the same text again is re-read) */
  _announce(text) {
    this._pendingAnnounce = text;
    if (this._announceQueued) return;
    this._announceQueued = true;
    queueMicrotask(() => {
      this._announceQueued = false;
      if (!this._live) return;
      if (this._live.textContent === this._pendingAnnounce) this._live.textContent = '';
      this._live.textContent = this._pendingAnnounce;
    });
  }

  // --- lock (§5.5) ---

  /** @private */
  _syncLock() {
    const grids = this._handle ? this._handle.grids : [];
    const locked = this.hasAttribute('disabled') || (grids.length > 0 && grids.every((g) => g.hasAttribute('disabled')));
    if (locked === this._locked) return;
    this._locked = locked;
    this.toggleAttribute('data-disabled', locked);
    this._applyLock(locked);
  }

  /** @private aria-disabled only on controls that did not have it (and only those are restored) */
  _applyLock(locked) {
    const controls = [this._clearBtn, this._more, ...this._actions(true)].filter(Boolean);
    if (locked) {
      for (const el of controls) {
        if (el.getAttribute('aria-disabled') === 'true') continue;
        el.setAttribute('aria-disabled', 'true');
        this._ariaOwned.add(el);
        this._ariaList.add(el);
      }
    } else {
      for (const el of this._ariaList) {
        if (this._ariaOwned.has(el)) el.removeAttribute('aria-disabled');
      }
      this._ariaList.clear();
      this._ariaOwned = new WeakSet();
    }
  }

  // --- clicks ---

  /** @private capture: a locked bar / a locked site button never acts (no site click, no event, no clear) */
  _onCaptureClick(e) {
    const btn = e.target instanceof Element ? e.target.closest('button') : null;
    if (!btn || !this._panel?.contains(btn)) return;
    const own = btn === this._clearBtn || btn === this._more || (this._isAction(btn) && btn.parentElement === this._tray);
    if (!own) return;
    if (this._locked || (this._isAction(btn) && isLockedButton(btn))) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  /** @private bubble: the site's own click listener on the button already ran */
  _onClick(e) {
    const btn = e.target instanceof Element ? e.target.closest('button') : null;
    if (!btn || !this._panel?.contains(btn)) return;
    if (btn === this._clearBtn) {
      const focus = this._focusList();
      this.clear({ emit: true });
      this._returnFocus(focus);
      return;
    }
    if (btn === this._more) {
      this._openMore();
      return;
    }
    if (this._isAction(btn) && btn.parentElement === this._tray && !btn.hidden) this._act(btn);
  }

  /** @private focus targets now: anchor opener → last anchor opener → last focused opener → first opener */
  _focusList() {
    const h = this._handle;
    const list = h ? h.focusCandidates() : [];
    const grids = h ? h.grids : [];
    return { list, grids, first: h ? h.firstOpener : null };
  }

  /** @private first target still connected (lease, §5.6 / §5.7) */
  _returnFocus(lease) {
    const ok = (el) => el && el.isConnected && typeof el.focus === 'function';
    let target = lease.list.find(ok);
    if (!target && lease.first) {
      const g = lease.grids.find((el) => el.isConnected);
      const open = g ? lease.first(g) : null;
      if (ok(open)) target = open;
    }
    if (target) target.focus();
  }

  /** @private one activation of an action (§5.7): event, then clear by lease unless prevented */
  _act(btn) {
    const h = this._handle;
    const grids = h ? h.grids : [];
    const lease = this._focusList();
    const ids = h ? h.selectedIds : [];
    const ok = this.dispatchEvent(new CustomEvent('selection-action', {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail: { action: btn.getAttribute(ACTION), ids, count: ids.length, button: btn },
    }));
    if (!ok) return;
    for (const g of grids) {
      if (g.isConnected && !g.hasAttribute('disabled') && typeof g.clear === 'function') g.clear({ emit: true });
    }
    // focus: only when it would be lost (body / inside a panel that is about to hide / disconnected)
    const doc = this.ownerDocument;
    const ae = doc.activeElement;
    const left = grids.reduce((n, g) => n + (g.isConnected ? g.selectedIds.length : 0), 0);
    const remaining = this._handle ? this._handle.count : left;
    const lost = !ae || ae === doc.body || !ae.isConnected
      || (this._panel.contains(ae) && (remaining === 0 || !this.isConnected));
    if (lost) this._returnFocus(lease);
  }

  /** @private "…" → TdMenu with the overflowed actions (built at open) */
  _openMore() {
    const order = this._menuOrder && this.fold === 'count'
      ? this._menuOrder.filter((b) => b.parentElement === this._tray && this._isAction(b) && !b.hidden)
      : this._actions();
    const items = order.filter((b) => b.hasAttribute('data-td-overflow')).map((b) => ({
      label: this._labelText(b) || b.getAttribute('aria-label') || '',
      icon: (b.getAttribute(ACTION_ICON) || '').trim() || undefined,
      danger: b.classList.contains('td-selection-bar__action--danger'),
      disabled: this._locked || isLockedButton(b),
      onClick: () => b.click(),
    }));
    if (!items.length) return;
    TdMenu.open(this._more, items, { side: 'top', align: 'end', label: String(TdSelectionBar.labels.more ?? '') });
  }

  // --- layout: compact + overflow (§5.4), offset (§5.3) ---

  /** @private */
  _onResize(entries) {
    for (const entry of entries) {
      const box = entry.borderBoxSize && entry.borderBoxSize[0];
      const h = box ? box.blockSize : this.getBoundingClientRect().height;
      offsetHeight(this, this.hasAttribute('data-empty') ? 0 : h);
    }
    this._schedule();
  }

  /** @private */
  _schedule() {
    if (this._raf || typeof requestAnimationFrame !== 'function') return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this._layout();
    });
  }

  /** @private one read / write pass (measure only when the width cache is dirty) */
  _layout() {
    if (!this.isConnected || !this._tray || this.hasAttribute('data-empty')) return;
    const rootSize = parseFloat(getComputedStyle(this.ownerDocument.documentElement).fontSize) || 16;
    const compact = this.getBoundingClientRect().width < COMPACT_REM * rootSize;
    if (compact !== this._compact) {
      this._compact = compact;
      this.toggleAttribute('data-compact', compact);
      this._dirty = true;
    }
    const actions = this._actions();
    if (this.fold === 'count') {
      this._layoutCount(actions);
      return;
    }
    let avail;
    if (this._dirty) {
      this._dirty = false;
      this.setAttribute('data-td-measuring', '');
      this._widths = new Map();
      for (const b of actions) this._widths.set(b, b.getBoundingClientRect().width);
      this._moreWidth = this._more.getBoundingClientRect().width;
      const others = [...this._tray.children].filter((el) => el !== this._more && !this._isAction(el));
      const gap = parseFloat(getComputedStyle(this._tray).columnGap) || 0;
      this._gap = gap;
      this._extraWidth = others.reduce((s, el) => s + el.getBoundingClientRect().width + gap, 0);
      avail = this._tray.getBoundingClientRect().width;
      this.removeAttribute('data-td-measuring');
    } else {
      avail = this._tray.getBoundingClientRect().width;
    }
    // v0.96.0: a `primary` (the first one not in the menu) is never folded — its width is reserved; `data-td-in-menu`
    // actions always fold ("…" always shown). v0.95.0 markup has neither → exactly the computation it had.
    const inMenu = actions.filter((b) => b.hasAttribute(IN_MENU));
    const primary = actions.find((b) => b.getAttribute(TONE) === 'primary' && !b.hasAttribute(IN_MENU)) || null;
    const list = inMenu.length || primary ? actions.filter((b) => b !== primary && !inMenu.includes(b)) : actions;
    const widths = list.map((b) => this._widths.get(b) ?? 0);
    let room = avail - this._extraWidth;
    if (primary) room -= (this._widths.get(primary) ?? 0) + this._gap;
    // forced menu: "…" is always shown, so each kept action carries its own following gap (row [a1 g … ak g "…"])
    const k = inMenu.length
      ? fitActions(widths.map((w) => w + this._gap), room - this._moreWidth, 0, this._fit, 0)
      : fitActions(widths, room, this._moreWidth, this._fit, this._gap);
    this._fit = k;
    list.forEach((b, i) => b.toggleAttribute('data-td-overflow', i >= k));
    for (const b of inMenu) b.setAttribute('data-td-overflow', '');
    if (primary) primary.removeAttribute('data-td-overflow');
    for (const b of this._actions(true)) if (b.hidden) b.removeAttribute('data-td-overflow');
    this._more.hidden = k >= list.length && !inMenu.length;
    this._mo?.takeRecords();
  }

  /**
   * @private v0.96.0 fold="count" (plan v0.96.0-action-fold §5.1 + §4.5). Step 1 = planActions (narrow = the bar itself
   * < 480px, with hysteresis); the winning primary is moved after "…" and kept across rebuilds (`keep`). Step 2 =
   * fitSecondaries over the shown secondaries (frame = the tray, which flex-grows into the room left by × + count;
   * fixed = the other site children with their gaps + the primary). Widths are measured in one pass (cache) when dirty.
   * @param {HTMLButtonElement[]} actions visible actions, tray order
   */
  _layoutCount(actions) {
    this._narrow = narrowState(this.getBoundingClientRect().width, this._narrow);
    const flags = actions.map((b) => ({ primary: b.getAttribute(TONE) === 'primary', inMenu: b.hasAttribute(IN_MENU) }));
    const keep = this._winner ? actions.indexOf(this._winner) : -1;
    const plan = planActions(flags, { narrow: this._narrow, keep });
    if (plan.demoted.length && !this._warnedPrimary) {
      this._warnedPrimary = true;
      console.warn('td-selection-bar: more than one data-td-tone="primary" action — only the first is kept as primary.');
    }
    const winner = plan.primary >= 0 ? actions[plan.primary] : null;
    if (winner !== this._winner) {
      this._winner = winner;
      this._adopt(); // the primary after "…", a former primary back among the actions
    }
    const shown = plan.shown.filter((i) => i !== plan.primary).map((i) => actions[i]);
    const folded = plan.folded.map((i) => actions[i]);
    if (this._dirty || shown.some((b) => !this._widths.get(b)) || (winner && !this._widths.get(winner))) {
      this._dirty = false;
      this.setAttribute('data-td-measuring', '');
      this._widths = new Map();
      for (const b of actions) this._widths.set(b, b.getBoundingClientRect().width);
      this._moreWidth = this._more.getBoundingClientRect().width;
      const gap = parseFloat(getComputedStyle(this._tray).columnGap) || 0;
      this._gap = gap;
      const others = [...this._tray.children].filter((el) => el !== this._more && !this._isAction(el));
      this._extraWidth = others.reduce((s, el) => s + el.getBoundingClientRect().width + gap, 0);
      this.removeAttribute('data-td-measuring');
    }
    let k = shown.length;
    if (!this._narrow && shown.length) {
      const same = shown.length === this._fitSet.length && shown.every((b, i) => b === this._fitSet[i]);
      const fixed = this._extraWidth + (winner ? this._widths.get(winner) ?? 0 : 0);
      k = fitSecondaries(shown.map((b) => this._widths.get(b) ?? 0), this._tray.getBoundingClientRect().width, fixed,
        this._moreWidth, this._gap, same ? this._fit : null, folded.length > 0, !!winner);
    }
    this._fit = k;
    this._fitSet = shown;
    const over = [...shown.slice(k), ...folded];
    const set = new Set(over);
    for (const b of actions) b.toggleAttribute('data-td-overflow', set.has(b));
    for (const b of this._actions(true)) if (b.hidden) b.removeAttribute('data-td-overflow');
    this._menuOrder = over;
    this._more.hidden = !over.length;
    this._mo?.takeRecords();
  }
}

if (!customElements.get('td-selection-bar')) {
  customElements.define('td-selection-bar', TdSelectionBar);
}
