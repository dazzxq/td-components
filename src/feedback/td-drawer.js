/**
 * <td-drawer> + TdDrawer.open() — a panel sliding in from the inline start / end edge (v0.27.0, plan
 * v0.27.0-dsuite-p0a §C). Token-native: needs td.css (src/styles/components/drawer.css); light DOM, CSP-strict (CSSOM
 * only), no dependency.
 *
 * Mounting: while open, the drawer has ONE overlay root that is a direct child of <body> (like TdModal / TdLightbox), so
 * the inert lease, focus trap and the modal / lightbox stacking band (v0.21.1) work. A declarative drawer MOVES the
 * host's child nodes into the panel on open (no clone: listeners, state and node identity are kept) and gives them
 * back to the host, in the same order, once the exit transition is over. `TdDrawer.open()` builds a <td-drawer> host
 * (appended to <body>, removed after the close) and opens it.
 *
 * DOM contract (root, while open):
 *   <div class="td-drawer-root td-drawer-root--{start|end} td-drawer-root--{sm|md|lg|xl}" dir="{ltr|rtl}"
 *        data-state="opening|open|closing">
 *     <div class="td-drawer__backdrop" aria-hidden="true"></div>
 *     <div class="td-drawer__panel td-glass-surface td-glass-surface--lg" role="dialog" aria-modal="true" tabindex="-1"
 *          aria-labelledby="{title id}" | aria-label="{label}">
 *       <div class="td-drawer__header">
 *         [<h2 class="td-drawer__title" id="{auto}">title</h2>] [host children with slot="header"]
 *         <button type="button" class="td-drawer__close" aria-label="Đóng"><span class="td-drawer__close-icon"
 *           data-td-icon="close" aria-hidden="true">svg</span></button>
 *       </div>
 *       <div class="td-drawer__body">other host children</div>            ← the only scroller
 *       <div class="td-drawer__footer" [hidden]>host children with slot="footer"</div>
 *     </div>
 *   </div>
 *
 * Lifecycle (layer mechanics: the shared dialog-layer controller, ./dialog-layer.js):
 * - `open` attribute ↔ `open` property (reflected both ways); `show()` / `close(reason = 'programmatic')`; show while
 *   open and close while closed / closing do nothing.
 * - Every close path dispatches `before-close` (cancelable, `detail.reason`: 'escape' | 'backdrop' | 'button' |
 *   'programmatic'); not cancelled → the panel slides out, the nodes go back to the host (or the JS host is removed),
 *   THEN `close` (`detail.reason`) fires and the `close()` Promise / `TdDrawer.open().closed` resolve.
 * - `open` (event) fires once the panel is open and the initial focus is set (first field of the body → first other
 *   focusable → the × → the panel).
 * - `dismissible` (default true): Escape and a backdrop click close; `dismissible="false"` → only the × / close().
 * - Name: `title` → an <h2> + aria-labelledby; else `label` → aria-label; else the host's own `aria-labelledby`; none →
 *   one console.warn per page + `TdDrawer.labels.drawer` as aria-label.
 * - No JS: an undefined <td-drawer> shows its content in place (CSS `td-drawer:not(:defined)`).
 *
 * @element td-drawer
 * @attr {boolean} open
 * @attr {string} title - visible heading (names the dialog)
 * @attr {string} label - aria-label when there is no title
 * @attr {string} side - start | end (default end; logical, flips in RTL)
 * @attr {string} size - sm | md | lg | xl (default md); `--td-drawer-w` overrides the width
 * @attr {string} dismissible - "false" → Escape / backdrop do not close
 * @fires open
 * @fires before-close - cancelable, detail: { reason }
 * @fires close - detail: { reason }
 */
import { openDialogLayer } from './dialog-layer.js';
import { LAYERS, focusablesIn } from '../utils/layers.js';
import { fillIconSlots } from '../icons/td-icon.js';

const SIDES = ['start', 'end'];
const SIZES = ['sm', 'md', 'lg', 'xl'];
const FIELD = 'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])';
let uid = 0;
let warnedName = false;

export class TdDrawer extends HTMLElement {
  /** Default texts (Vietnamese); override per site: `TdDrawer.labels.close = 'Close'`. */
  static labels = {
    close: 'Đóng',
    drawer: 'Bảng điều khiển',
  };

  static get observedAttributes() { return ['open']; }

  /**
   * Open a drawer built from options (JS-only; the host is appended to <body> and removed after the close).
   * @param {object} [options]
   * @param {string} [options.title] - visible heading (text) — names the dialog
   * @param {string} [options.label] - aria-label when there is no title
   * @param {Node|Node[]|string} [options.body] - Node(s), or an HTML string: a TRUSTED-HTML hatch (developer markup only)
   * @param {Node|Node[]} [options.footer] - footer element(s)
   * @param {'start'|'end'} [options.side='end']
   * @param {'sm'|'md'|'lg'|'xl'} [options.size='md']
   * @param {boolean} [options.dismissible=true]
   * @param {(reason: string) => void} [options.onClose] - after the close (same moment as the `close` event)
   * @returns {{ element: TdDrawer, close(reason?: string): Promise<string|null>, closed: Promise<string> }}
   */
  static open(options = {}) {
    const o = options || {};
    const host = /** @type {TdDrawer} */ (document.createElement('td-drawer'));
    if (o.title != null && String(o.title) !== '') host.setAttribute('title', String(o.title));
    if (o.label != null && String(o.label) !== '') host.setAttribute('label', String(o.label));
    if (SIDES.includes(o.side)) host.setAttribute('side', o.side);
    if (SIZES.includes(o.size)) host.setAttribute('size', o.size);
    if (o.dismissible === false) host.setAttribute('dismissible', 'false');
    const body = o.body;
    if (typeof body === 'string') {
      const tpl = document.createElement('template');
      tpl.innerHTML = body; // TRUSTED hatch (documented)
      host.appendChild(tpl.content);
    } else {
      for (const n of Array.isArray(body) ? body : [body]) if (n && typeof n.nodeType === 'number') host.appendChild(n);
    }
    for (const n of Array.isArray(o.footer) ? o.footer : (o.footer ? [o.footer] : [])) {
      if (!n || typeof n.nodeType !== 'number') continue;
      if (n.nodeType === 1) {
        /** @type {Element} */ (n).setAttribute('slot', 'footer');
        host.appendChild(n);
      } else {
        const wrap = document.createElement('div');
        wrap.setAttribute('slot', 'footer');
        wrap.appendChild(n);
        host.appendChild(wrap);
      }
    }
    host._jsOwned = true;
    let resolveClosed = () => {};
    const closed = new Promise((r) => { resolveClosed = r; });
    host.addEventListener('close', (e) => {
      const reason = /** @type {CustomEvent} */ (e).detail.reason;
      if (typeof o.onClose === 'function') {
        try { o.onClose(reason); } catch (err) { console.error(err); }
      }
      resolveClosed(reason);
    }, { once: true });
    document.body.appendChild(host);
    host.show();
    return { element: host, close: (reason) => host.close(reason), closed };
  }

  constructor() {
    super();
    /** @type {ReturnType<typeof openDialogLayer>|null} */
    this._layer = null;
    /** @type {Node[]} the host's child nodes while they live in the panel */
    this._moved = [];
    this._state = 'closed'; // closed | open | closing
    this._closing = null;
    this._reflecting = false;
    this._inBeforeClose = false;
  }

  /** @returns {boolean} */
  get open() { return this._state === 'open'; }

  set open(v) {
    if (v) this.show();
    else this.close('programmatic');
  }

  connectedCallback() {
    if (this.hasAttribute('open') && this._state === 'closed') this.show();
  }

  disconnectedCallback() {
    // Removed while open: tear down at once and give the nodes back (silently; `open` stays for a re-insert).
    // A TdDrawer.open() host removed by the page while open still settles its `closed` Promise (`close` fires).
    if (this._state !== 'closed') this._releaseNow(!!this._jsOwned);
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name !== 'open' || this._reflecting || oldVal === newVal) return;
    if (newVal !== null) {
      if (this.isConnected) this.show();
    } else if (this._state === 'open') {
      this.close('programmatic');
    }
  }

  /** @private set / remove `open` without re-entering attributeChangedCallback */
  _reflect(on) {
    this._reflecting = true;
    try { this.toggleAttribute('open', on); } finally { this._reflecting = false; }
  }

  /** Open the drawer (nothing while it is open). */
  show() {
    if (this._state === 'open') return;
    if (this._state === 'closing') this._releaseNow(true); // finish the previous close (`close` fires) before reopening
    if (!this.isConnected) return;
    this._state = 'open';
    this._reflect(true);
    const root = this._buildRoot();
    const panel = /** @type {HTMLElement} */ (root.querySelector('.td-drawer__panel'));
    const backdrop = root.querySelector('.td-drawer__backdrop');
    this._layer = openDialogLayer({
      root,
      dialog: panel,
      layer: LAYERS.modal,
      scrollLock: true,
      backdrop,
      onEscape: () => {
        if (this._dismissible()) this.close('escape');
        return true; // consumed either way (never reaches a layer below)
      },
      onOpened: () => {
        if (this._state !== 'open' || this._layer?.root !== root) return;
        root.setAttribute('data-state', 'open');
        this._initialFocus(panel);
        this.dispatchEvent(new CustomEvent('open', { bubbles: true, composed: true }));
      },
    });
  }

  /**
   * Close the drawer. Dispatches the cancelable `before-close` first.
   * @param {string} [reason='programmatic'] 'escape' | 'backdrop' | 'button' | 'programmatic'
   * @returns {Promise<string|null>} the reason once closed (after the transition); null when cancelled or not open
   */
  close(reason = 'programmatic') {
    if (this._state === 'closing') return this._closing;
    if (this._state !== 'open' || this._inBeforeClose) {
      if (this._state === 'open' && !this.hasAttribute('open')) this._reflect(true);
      return Promise.resolve(null);
    }
    this._inBeforeClose = true;
    let ok;
    try {
      ok = this.dispatchEvent(new CustomEvent('before-close', {
        bubbles: true, composed: true, cancelable: true, detail: { reason },
      }));
    } finally {
      this._inBeforeClose = false;
    }
    if (!ok || this._state !== 'open') {
      if (this._state === 'open') this._reflect(true); // stays open: `open` stays reflected
      return Promise.resolve(null);
    }
    this._state = 'closing';
    this._closeReason = reason;
    this._reflect(false);
    const layer = this._layer;
    this._closing = layer.close(reason).then(() => this._finish(reason, true));
    return this._closing;
  }

  /** @private after the exit transition: nodes back, `close` event, JS host removed */
  _finish(reason, emit) {
    if (this._state === 'closed') return reason;
    this._state = 'closed';
    this._layer = null;
    this._closing = null;
    this._restoreNodes();
    if (emit) this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true, detail: { reason } }));
    if (this._jsOwned && this.isConnected) this.remove();
    return reason;
  }

  /**
   * @private Tear down at once (no transition): the root is removed, the nodes go back. `emit` → `close` fires (a show()
   * during a pending close, a JS host removed by the page); otherwise silent (a removed declarative host keeps `open`).
   */
  _releaseNow(emit) {
    const layer = this._layer;
    if (!layer) { this._state = 'closed'; return; }
    const reason = this._state === 'closing' ? this._closeReason : 'programmatic';
    this._state = 'closing';
    layer.release();
    this._finish(reason, emit);
  }

  /** @private */
  _dismissible() {
    return this.getAttribute('dismissible') !== 'false';
  }

  /** @private build the root and move the host's nodes into it */
  _buildRoot() {
    if (!this._uid) this._uid = this.id || `td-drawer-${++uid}`;
    const side = SIDES.includes(this.getAttribute('side')) ? this.getAttribute('side') : 'end';
    const size = SIZES.includes(this.getAttribute('size')) ? this.getAttribute('size') : 'md';
    const root = document.createElement('div');
    root.className = `td-drawer-root td-drawer-root--${side} td-drawer-root--${size}`;
    root.setAttribute('data-state', 'opening');
    let dir = 'ltr';
    try { dir = getComputedStyle(this).direction === 'rtl' ? 'rtl' : 'ltr'; } catch { /* ltr */ }
    root.setAttribute('dir', dir);
    // Static markup only; every dynamic value is set through the DOM below.
    root.innerHTML = '<div class="td-drawer__backdrop" aria-hidden="true"></div>'
      + '<div class="td-drawer__panel td-glass-surface td-glass-surface--lg" role="dialog" aria-modal="true" tabindex="-1">'
      + '<div class="td-drawer__header"><button type="button" class="td-drawer__close">'
      + '<span class="td-drawer__close-icon" data-td-icon="close" aria-hidden="true"></span></button></div>'
      + '<div class="td-drawer__body"></div><div class="td-drawer__footer" hidden></div></div>';
    const panel = /** @type {HTMLElement} */ (root.querySelector('.td-drawer__panel'));
    const header = root.querySelector('.td-drawer__header');
    const closeBtn = root.querySelector('.td-drawer__close');
    const body = root.querySelector('.td-drawer__body');
    const footer = /** @type {HTMLElement} */ (root.querySelector('.td-drawer__footer'));
    closeBtn.setAttribute('aria-label', TdDrawer.labels.close || 'Đóng');
    fillIconSlots(root);
    // Per-instance width: a --td-drawer-w set on (or inherited by) the host reaches the body-child root (CSSOM).
    try {
      const w = getComputedStyle(this).getPropertyValue('--td-drawer-w').trim();
      if (w) root.style.setProperty('--td-drawer-w', w);
    } catch { /* ignore */ }

    // Name (title → h2 + aria-labelledby; label → aria-label; host aria-labelledby; else warn + default label).
    const title = this.getAttribute('title');
    const label = this.getAttribute('label');
    const by = this.getAttribute('aria-labelledby');
    if (title) {
      const h = document.createElement('h2');
      h.className = 'td-drawer__title';
      h.id = `${this._uid}-title`;
      h.textContent = title;
      header.insertBefore(h, closeBtn);
      panel.setAttribute('aria-labelledby', h.id);
    } else if (label) {
      panel.setAttribute('aria-label', label);
    } else if (by) {
      panel.setAttribute('aria-labelledby', by);
    } else {
      if (!warnedName) {
        warnedName = true;
        console.warn('td-drawer: no accessible name — set `title`, `label` or `aria-labelledby` (using labels.drawer).');
      }
      panel.setAttribute('aria-label', TdDrawer.labels.drawer || 'Bảng điều khiển');
    }

    // Move (never clone) the host's nodes: slot="header" → header (before ×), slot="footer" → footer, rest → body.
    this._moved = [...this.childNodes];
    for (const n of this._moved) {
      const slot = n.nodeType === 1 ? /** @type {Element} */ (n).getAttribute('slot') : null;
      if (slot === 'header') header.insertBefore(n, closeBtn);
      else if (slot === 'footer') footer.appendChild(n);
      else body.appendChild(n);
    }
    footer.hidden = footer.childNodes.length === 0;

    closeBtn.addEventListener('click', () => this.close('button'));
    const scrim = root.querySelector('.td-drawer__backdrop');
    scrim.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the panel
    scrim.addEventListener('click', () => { if (this._dismissible()) this.close('backdrop'); });
    return root;
  }

  /** @private give the moved nodes back to the host, in their original order */
  _restoreNodes() {
    const nodes = this._moved;
    this._moved = [];
    for (const n of nodes) this.appendChild(n);
  }

  /** @private first field of the body → first other focusable → the × → the panel (only if focus is still ours) */
  _initialFocus(panel) {
    const active = document.activeElement;
    if (active && active !== panel && active !== document.body && panel.contains(active)) return; // user moved on
    if (!this._layer || !this._layer.layer.isTop()) return; // a later layer owns focus
    const tryFocus = (el) => {
      if (!el || typeof el.focus !== 'function') return false;
      try { el.focus({ preventScroll: true }); } catch { return false; }
      return document.activeElement === el;
    };
    const eligible = focusablesIn(panel);
    const set = new Set(eligible);
    const body = panel.querySelector('.td-drawer__body');
    for (const el of body ? body.querySelectorAll(FIELD) : []) if (set.has(el) && tryFocus(el)) return;
    const x = panel.querySelector('.td-drawer__close');
    for (const el of eligible) if (el !== x && tryFocus(el)) return;
    if (tryFocus(x)) return;
    tryFocus(panel);
  }
}

if (!customElements.get('td-drawer')) customElements.define('td-drawer', TdDrawer);
