import { TdBaseElement } from '../base/td-base-element.js';
import { fillIconSlots, hasIcon, svgStringToDefinition, renderIconDefinition } from '../icons/td-icon.js';

const SIZES = { sm: 28, md: 40, lg: 56 };
const VARIANTS = new Set(['primary', 'secondary', 'danger']);
const DEFAULT_TITLE = 'Không có dữ liệu';
const DEFAULT_MESSAGE = 'Chưa có mục nào được tạo.';

// --- v0.26.0 SSR (contract empty-state@1, ADR 0012) ----------------------------------------------------------------
const classKey = (el) => [...el.classList].sort().join(' ');
/** Element children + non-blank text nodes (comments / whitespace ignored). */
const contentNodes = (el) => [...el.childNodes].filter((n) => n.nodeType === 1 || (n.nodeType === 3 && n.data.trim()));
/** @param {Element} el @param {string[]} names */
const onlyAttrs = (el, names) => [...el.attributes].every((a) => names.includes(a.name));
/** The spinner every td-button / td_link control carries (src/form/td-button.js render(), php/td.php). */
const SPINNER_SVG = '<svg class="td-spinner__svg" viewBox="0 0 50 50" aria-hidden="true" focusable="false">'
  + '<circle class="td-spinner__track" cx="25" cy="25" r="20"></circle>'
  + '<circle class="td-spinner__arc" cx="25" cy="25" r="20"></circle></svg>';
/** Attributes of a server action host (td_link element mode as td_empty() calls it) — before or after its hydrate. */
const ACTION_HOST_ATTRS = ['data-td-ssr', 'variant', 'size', 'label', 'href'];
/** Attributes its `<a>` may carry (td_link / TdButton _syncState for a link). */
const ACTION_LINK_ATTRS = ['class', 'href', 'role', 'tabindex', 'aria-disabled'];

/** Same URL policy as <td-button href> / Td::safeUrl: https, mailto, tel, scheme-less (http only on an http page). */
function safeHref(href) {
  const norm = String(href).replace(/^[\u0000- ]+|[\u0000- ]+$/g, '').replace(/[\t\n\r]/g, '');
  if (!norm) return false;
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(norm);
  if (!m) return true;
  const p = m[1].toLowerCase();
  return p === 'https' || p === 'mailto' || p === 'tel' || (p === 'http' && location.protocol === 'http:');
}

/**
 * A server action exactly as td_empty() prints it (td_link element mode, size sm, variant primary|secondary|danger):
 * `<td-button [data-td-ssr="button@1"] variant size="sm" label href><a class="td-btn td-btn--{v} td-btn--sm" href>
 * <span class="td-btn__label">…</span><span class="td-btn__spinner …" hidden>…</span></a></td-button>` — the marker is
 * present while <td-button> is not defined yet and gone once it hydrated; both states are accepted. Only allowlisted
 * attributes (on*, style, data-td-* … → refused).
 * @param {Element} el
 */
function validServerAction(el) {
  if (el.localName !== 'td-button' || !onlyAttrs(el, ACTION_HOST_ATTRS)) return false;
  if (el.hasAttribute('data-td-ssr') && el.getAttribute('data-td-ssr') !== 'button@1') return false;
  const variant = el.getAttribute('variant');
  const label = el.getAttribute('label');
  if (!VARIANTS.has(variant) || el.getAttribute('size') !== 'sm' || !label || !el.hasAttribute('href')) return false;
  const kids = contentNodes(el);
  const a = kids[0];
  if (kids.length !== 1 || a.nodeType !== 1 || a.localName !== 'a' || !onlyAttrs(a, ACTION_LINK_ATTRS)) return false;
  if (classKey(a) !== ['td-btn', `td-btn--${variant}`, 'td-btn--sm'].sort().join(' ')) return false;
  if (a.hasAttribute('href') && (a.getAttribute('href') !== el.getAttribute('href') || !safeHref(a.getAttribute('href')))) return false;
  const parts = contentNodes(a);
  if (parts.length !== 2 || parts.some((p) => p.nodeType !== 1 || p.localName !== 'span')) return false;
  const [lab, spin] = parts;
  return classKey(lab) === 'td-btn__label' && onlyAttrs(lab, ['class']) && lab.children.length === 0 && lab.textContent === label
    && classKey(spin) === 'td-btn__spinner td-spinner td-spinner--sm' && onlyAttrs(spin, ['class', 'aria-hidden', 'hidden'])
    && spin.innerHTML === SPINNER_SVG;
}

/**
 * Empty state — token-native (v0.8.0). Styles: td.css (`components/empty-state.css`, block `.td-empty-state`).
 * Solid content-layer card (dashed border), decorative icon, heading, message and optional action buttons
 * rendered with the `.td-btn` CSS contract (no `<td-button>` dependency).
 *
 * SSR (v0.26.0, ADR 0012): a host marked `data-td-ssr="empty-state@1"` (PHP td_empty()) holding exactly render()'s tree
 * is adopted IN PLACE (no flash, no layout shift; the icon is re-created from the JS registry). Server actions
 * (`<td-button>` links, hydrated or not yet) are kept — same nodes, also across re-renders — until `actions` is set from
 * JS. Mismatched / tampered markup → normal render (server actions dropped). Re-connect re-binds without re-rendering.
 *
 * @element td-empty-state
 * @attr {string} icon - Registry icon name (core or `registerIcons()`); default `inbox`. Unknown name → `inbox`
 *   + one console.warn. DEPRECATED: a raw `<svg …>` string is rendered only if it is plain allowlisted geometry
 *   (validated like `registerIcons`, rebuilt with createElementNS); anything else → `inbox` + console.warn.
 *   Use the `iconNode` property for custom SVG instead.
 * @attr {string} title - Title text (default 'Không có dữ liệu'). Note: `title` is also the global HTML
 *   attribute, so browsers show it as a tooltip over the component.
 * @attr {string} message - Message text (default 'Chưa có mục nào được tạo.')
 * @attr {string} size - 'sm' | 'md' | 'lg' (default 'md')
 * @attr {boolean} compact - Reduced padding
 * @attr {number} heading-level - Heading level of the title, 2–6 (default 3)
 *
 * @property {SVGElement|null} iconNode - TRUSTED custom icon built by the site (cloned, decorative). Wins over `icon`.
 * @property {Array<{label: string, variant?: 'primary'|'secondary'|'danger', onClick?: Function}>} actions - An
 *   action without `label` shows `TdEmptyState.labels.action` (default 'Thực hiện').
 */
export class TdEmptyState extends TdBaseElement {
  /** v0.26.0 (ADR 0012): adopts td_empty() markup in place; re-connect re-binds without re-rendering. */
  static hydratable = true;

  /** Version of the SSR markup contract (`data-td-ssr="empty-state@1"`) — bumped only when the hydrate assumptions change. */
  static SSR_SCHEMA = 1;

  /** Default texts (Vietnamese); override per site: `TdEmptyState.labels.action = 'Do it'`. */
  static labels = {
    action: 'Thực hiện',
  };

  static get observedAttributes() {
    return ['icon', 'title', 'message', 'size', 'compact', 'heading-level'];
  }

  static get booleanAttributes() {
    return ['compact'];
  }

  constructor() {
    super();
    this._actions = [];
    this._iconNode = null;
    /** @type {Array<() => void>} listeners of the current action buttons (removed on every rebuild) */
    this._actionCleanups = [];
    this._warned = new Set();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._clearActionListeners();
  }

  connectedCallback() {
    // v0.26.0: `actions` / `iconNode` assigned before the element upgraded live in own data properties that shadow the
    // accessors — re-apply them through the accessors (an early `actions` then replaces server-rendered actions).
    for (const p of ['actions', 'iconNode']) {
      if (Object.prototype.hasOwnProperty.call(this, p)) {
        const v = this[p];
        delete this[p];
        this[p] = v;
      }
    }
    // Re-connect (moved): the base re-binds (afterRender → icon + actions, listeners included) or re-renders.
    super.connectedCallback();
  }

  // --- JS properties ---

  get actions() { return this._actions; }
  set actions(val) {
    this._actions = Array.isArray(val) ? val : [];
    this._actionsSet = true;
    this._ssrActionNodes = null; // JS actions replace server-rendered ones (v0.26.0)
    if (this._initialized) this._renderActions();
  }

  get iconNode() { return this._iconNode; }
  set iconNode(node) {
    this._iconNode = typeof SVGElement !== 'undefined' && node instanceof SVGElement ? node : null;
    if (this._initialized) this._renderIcon();
  }

  // --- Attribute helpers ---

  _getSize() {
    const s = this.getAttribute('size');
    return s && Object.hasOwn(SIZES, s) ? s : 'md';
  }

  _getTitle() { return this.getAttribute('title') || DEFAULT_TITLE; }
  _getMessage() { return this.getAttribute('message') || DEFAULT_MESSAGE; }

  _getHeadingLevel() {
    const n = parseInt(this.getAttribute('heading-level') ?? '', 10);
    return n >= 2 && n <= 6 ? n : 3;
  }

  _warnOnce(msg) {
    if (this._warned.has(msg)) return;
    this._warned.add(msg);
    console.warn(msg);
  }

  // --- Rendering ---

  render() {
    const size = this._getSize();
    const cls = `td-empty-state td-empty-state--${size}${this.hasAttribute('compact') ? ' td-empty-state--compact' : ''}`;
    const h = `h${this._getHeadingLevel()}`;
    return `<div class="${cls}">`
      + '<div class="td-empty-state__icon" aria-hidden="true"></div>'
      + `<${h} class="td-empty-state__title">${this.escapeHtml(this._getTitle())}</${h}>`
      + `<p class="td-empty-state__message">${this.escapeHtml(this._getMessage())}</p>`
      + '<div class="td-empty-state__actions" hidden></div>'
      + '</div>';
  }

  afterRender() {
    this._renderIcon();
    this._renderActions();
  }

  // --- SSR hydrate (v0.26.0, contract empty-state@1, PHP td_empty()) ---

  /**
   * Adopt td_empty() markup in place when the marker matches and the tree is exactly what render() produces for the
   * host's current attributes (card classes, icon slot with the resolved name + px size, heading level + text, message
   * text, actions container) with only allowlisted attributes, plus — inside the actions container — only valid server
   * actions (see validServerAction; container `hidden` exactly when there are none). Anything else → normal render
   * (no state: server actions are dropped). The icon is re-created from the JS registry by afterRender() (same box).
   * @returns {boolean}
   */
  canHydrate() {
    if (!this._ssrMatches('empty-state', TdEmptyState.SSR_SCHEMA)) return false;
    const box = this._skeletonMatches(true);
    const ok = !!box && this._actionsMatch(box, null);
    this._ssrBox = ok ? box : null;
    if (!ok) this._ssrActionNodes = null;
    return ok;
  }

  /** Server actions are kept (same nodes) until the site sets `actions` from JS. */
  hydrateExisting() {
    const box = this._ssrBox;
    this._ssrBox = null;
    if (this._actionsSet) return; // an early JS `actions` wins
    const nodes = [...box.children];
    this._ssrActionNodes = nodes.length ? nodes : null;
  }

  /**
   * Re-connect: the markup is revalidated (tampered with while detached → re-render; server actions then dropped).
   * @returns {boolean}
   */
  canRebind() {
    const box = this._skeletonMatches(false);
    const ok = !!box && (!this._ssrActionNodes || this._actionsMatch(box, this._ssrActionNodes));
    if (!ok) this._ssrActionNodes = null;
    return ok;
  }

  /**
   * @private The single `.td-empty-state` child has render()'s skeleton. `strictIcon` (hydrate): the icon wrapper holds
   * exactly the slot render() + _renderIcon() would create; else (re-bind) any icon content (it is re-created anyway).
   * @returns {Element|null} the actions container when the skeleton matches
   */
  _skeletonMatches(strictIcon) {
    const kids = contentNodes(this);
    if (kids.length !== 1 || kids[0].nodeType !== 1) return null;
    const card = kids[0];
    const tpl = document.createElement('template');
    tpl.innerHTML = this.render();
    const want = tpl.content.firstElementChild;
    if (card.localName !== 'div' || classKey(card) !== classKey(want) || !onlyAttrs(card, ['class'])) return null;
    const parts = contentNodes(card);
    if (parts.length !== 4 || parts.some((p) => p.nodeType !== 1)) return null;
    const [icon, title, message, actions] = parts;
    const [wIcon, wTitle, wMessage] = want.children;
    if (icon.localName !== 'div' || classKey(icon) !== classKey(wIcon) || !onlyAttrs(icon, ['class', 'aria-hidden'])
      || icon.getAttribute('aria-hidden') !== 'true' || !this._iconMatches(icon, strictIcon)) return null;
    for (const [el, w] of [[title, wTitle], [message, wMessage]]) {
      if (el.localName !== w.localName || classKey(el) !== classKey(w) || !onlyAttrs(el, ['class'])
        || el.children.length !== 0 || el.textContent !== w.textContent) return null;
    }
    const ok = actions.localName === 'div' && classKey(actions) === 'td-empty-state__actions' && onlyAttrs(actions, ['class', 'hidden']);
    return ok ? actions : null;
  }

  /** @private Icon wrapper content: one slot `span[data-td-icon][data-td-icon-size]` (+ at most one svg) on hydrate. */
  _iconMatches(wrap, strict) {
    const kids = contentNodes(wrap);
    if (kids.some((k) => k.nodeType !== 1)) return false;
    if (!strict) return kids.length <= 1;
    const icon = (this.getAttribute('icon') || '').trim();
    if (icon.startsWith('<') || kids.length !== 1) return false; // the deprecated SVG string is never server-rendered
    const slot = kids[0];
    if (slot.localName !== 'span' || !onlyAttrs(slot, ['data-td-icon', 'data-td-icon-size'])) return false;
    if (slot.getAttribute('data-td-icon-size') !== String(SIZES[this._getSize()])) return false;
    if (!this._iconNode) {
      const name = icon && hasIcon(icon) ? icon : 'inbox';
      if (slot.getAttribute('data-td-icon') !== name) return false;
    }
    const svg = contentNodes(slot);
    return svg.length === 0 || (svg.length === 1 && svg[0].nodeType === 1 && svg[0].localName === 'svg');
  }

  /**
   * @private Actions container content: valid server actions only (`expected` = these exact nodes, in order), and
   * `hidden` exactly when there is none.
   * @param {Element} box
   * @param {Element[]|null} expected
   */
  _actionsMatch(box, expected) {
    const kids = contentNodes(box);
    if (expected && (kids.length !== expected.length || kids.some((k, i) => k !== expected[i]))) return false;
    if (box.hidden !== (kids.length === 0)) return false;
    return kids.every((k) => k.nodeType === 1 && validServerAction(k));
  }

  /** @private Icon precedence: iconNode (trusted, cloned) → registry name → deprecated validated `<svg` string → inbox. */
  _renderIcon() {
    const wrap = this.querySelector('.td-empty-state__icon');
    if (!wrap) return;
    const px = SIZES[this._getSize()];
    if (this._iconNode) {
      const svg = this._iconNode.cloneNode(true);
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      svg.setAttribute('width', String(px));
      svg.setAttribute('height', String(px));
      wrap.replaceChildren(svg);
      return;
    }
    const icon = (this.getAttribute('icon') || '').trim();
    if (icon.startsWith('<')) {
      // Legacy strings were written for innerHTML (no xmlns); the XML parser needs the SVG namespace on the root.
      // Adding it changes nothing else — the result is still fully validated.
      const src = /^<svg[\s>/]/i.test(icon) && !/^<svg\b[^>]*\sxmlns\s*=/i.test(icon)
        ? icon.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"')
        : icon;
      // svgStringToDefinition validates the children only (root attributes are dropped on rebuild); still refuse
      // a string that carries event handlers / inline style anywhere — it is not "plain geometry".
      const def = /\s(on[a-z]+|style)\s*=/i.test(src) ? null : svgStringToDefinition(src);
      const svg = def ? renderIconDefinition(def, { size: px }) : null;
      if (svg) {
        this._warnOnce('td-empty-state: a raw <svg> string in `icon` is deprecated — use a registry name or the `iconNode` property.');
        wrap.replaceChildren(svg);
        return;
      }
      this._warnOnce('td-empty-state: `icon` SVG string rejected (only plain shape geometry is allowed) — showing "inbox". Use the `iconNode` property.');
      this._slot(wrap, 'inbox', px);
      return;
    }
    let name = icon || 'inbox';
    if (!hasIcon(name)) {
      this._warnOnce(`td-empty-state: unknown icon "${name}" — showing "inbox".`);
      name = 'inbox';
    }
    this._slot(wrap, name, px);
  }

  /** @private */
  _slot(wrap, name, px) {
    const span = document.createElement('span');
    span.setAttribute('data-td-icon', name);
    span.setAttribute('data-td-icon-size', String(px));
    wrap.replaceChildren(span);
    fillIconSlots(wrap);
  }

  /** @private */
  _clearActionListeners() {
    this._actionCleanups.forEach((fn) => fn());
    this._actionCleanups = [];
  }

  /**
   * Rebuild the action buttons (`.td-btn` markup). Previous buttons' listeners are removed first, so reassigning
   * `actions` never stacks handlers. Empty → the container is `[hidden]`.
   * @private
   */
  _renderActions() {
    this._clearActionListeners();
    const container = this.querySelector('.td-empty-state__actions');
    if (!container) return;
    // v0.26.0: server-rendered actions (td_empty) stay — the same nodes, put back after a re-render — until JS `actions`.
    const kept = this._ssrActionNodes;
    if (kept) {
      const kids = [...container.children];
      if (kids.length !== kept.length || kids.some((k, i) => k !== kept[i])) container.replaceChildren(...kept);
      container.hidden = false;
      return;
    }
    const buttons = this._actions.filter((a) => a && typeof a === 'object').map((action) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const variant = VARIANTS.has(action.variant) ? action.variant : 'secondary';
      btn.className = `td-btn td-btn--${variant} td-btn--sm`;
      btn.textContent = action.label == null || action.label === ''
        ? String(TdEmptyState.labels.action ?? '')
        : String(action.label);
      if (typeof action.onClick === 'function') {
        const handler = action.onClick;
        btn.addEventListener('click', handler);
        this._actionCleanups.push(() => btn.removeEventListener('click', handler));
      }
      return btn;
    });
    container.replaceChildren(...buttons);
    container.hidden = buttons.length === 0;
  }
}

if (!customElements.get('td-empty-state')) {
  customElements.define('td-empty-state', TdEmptyState);
}
