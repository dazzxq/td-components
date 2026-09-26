import { TdBaseElement } from '../base/td-base-element.js';
import { fillIconSlots, hasIcon, svgStringToDefinition, renderIconDefinition } from '../icons/td-icon.js';

const SIZES = { sm: 28, md: 40, lg: 56 };
const VARIANTS = new Set(['primary', 'secondary', 'danger']);
const DEFAULT_TITLE = 'Không có dữ liệu';
const DEFAULT_MESSAGE = 'Chưa có mục nào được tạo.';

/**
 * Empty state — token-native (v0.8.0). Styles: td.css (`components/empty-state.css`, block `.td-empty-state`).
 * Solid content-layer card (dashed border), decorative icon, heading, message and optional action buttons
 * rendered with the `.td-btn` CSS contract (no `<td-button>` dependency).
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
 * @property {Array<{label: string, variant?: 'primary'|'secondary'|'danger', onClick?: Function}>} actions
 */
export class TdEmptyState extends TdBaseElement {
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
    const reconnect = this._initialized;
    super.connectedCallback();
    // Action listeners are removed on disconnect; re-bind them when the element is moved.
    if (reconnect) this._renderActions();
  }

  // --- JS properties ---

  get actions() { return this._actions; }
  set actions(val) {
    this._actions = Array.isArray(val) ? val : [];
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
    const buttons = this._actions.filter((a) => a && typeof a === 'object').map((action) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const variant = VARIANTS.has(action.variant) ? action.variant : 'secondary';
      btn.className = `td-btn td-btn--${variant} td-btn--sm`;
      btn.textContent = action.label == null || action.label === '' ? 'Action' : String(action.label);
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
