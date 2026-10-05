import { TdBaseElement } from '../base/td-base-element.js';
import { luminance, pickPole } from '../theme/color.js';
import { fillIconSlots, hasIcon } from '../icons/td-icon.js';
// v0.36.0: the SSR structure check (allowlists + sameControlStructure) lives in a shared internal module so
// td-action-button can reuse it with its own allowlists.
import { sameControlStructure, contentNodes, safeDownloadName } from './button-structure.js';

const VARIANTS = ['primary', 'secondary', 'success', 'danger', 'info', 'warning', 'ghost'];
const SIZES = ['sm', 'md', 'lg'];
const TYPES = ['submit', 'reset', 'button'];
const TARGETS = ['_blank', '_self', '_parent', '_top'];
/** Link schemes allowed on `href` (anything without a scheme — relative, `#…`, `?…`, `//host` — is allowed too). */
const LINK_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];
const CLASS_TOKEN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
/** A registry-style icon name (one lower-case kebab token) — unknown ones warn (v0.18.0), class lists do not. */
const ICON_NAME = /^[a-z][a-z0-9-]{0,63}$/;
/** Unknown registry-style icon names already warned about (once per name per page). */
const _warnedIcons = new Set();
/**
 * ARIA state forwarded to the inner control (v0.19.0 G1): attribute → allowed values (null = IDREF list, copied
 * verbatim unless empty / whitespace-only).
 */
const FORWARDED_ARIA = {
  'aria-pressed': ['true', 'false', 'mixed'],
  'aria-expanded': ['true', 'false'],
  'aria-controls': null,
  'aria-haspopup': ['true', 'false', 'menu', 'listbox', 'tree', 'grid', 'dialog'],
};
/** `attr=value` pairs already warned about (once per pair per page). */
const _warnedAria = new Set();
const _contrastCache = new Map();
/** input string → parsed colour | null (one engine probe per distinct colour, invalid ones included) */
const _parseCache = new Map();

/**
 * Validate a link `href` (security-model: URL whitelist): http(s), mailto:, tel:, or a scheme-less (relative) URL.
 * Normalised the way the URL parser does first (leading/trailing C0 controls + spaces stripped, tab/newline removed
 * anywhere), so `" java\tscript:…"` is judged as `javascript:`.
 * @param {string|null} href
 * @returns {string|null} the href to use, or null when unsafe
 */
export function safeButtonHref(href) {
  if (typeof href !== 'string') return null;
  const norm = href.replace(/^[\u0000- ]+|[\u0000- ]+$/g, '').replace(/[\t\n\r]/g, '');
  if (!norm) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(norm);
  if (!scheme) return norm; // relative / fragment / query / protocol-relative
  const proto = `${scheme[1].toLowerCase()}:`;
  // http: only on an http page — no HTTPS→HTTP downgrade (security review v0.17.0; same rule as TdMenu)
  if (proto === 'http:') return typeof location !== 'undefined' && location.protocol === 'http:' ? norm : null;
  return LINK_PROTOCOLS.includes(proto) ? norm : null;
}

/**
 * Button — token-native (needs td.css; no Tailwind). Styles: src/styles/components/button.css.
 * Minimal surfaces (docs/internal/design/liquid-glass.md, v0.20.0): every variant is a SOLID fill (--td-btn-{v}-bg,
 * ≥ 4.7:1 with its label — rendered contrast gate) + one soft shadow; hover = a darker solid fill; no blur. Custom
 * `color` follows the same contract; disabled = opaque neutral fill.
 *
 * DOM contract:
 *   <button class="td-btn td-btn--{variant} td-btn--{size}[ td-btn--full][ td-btn--custom]" type="…">
 *     [<span class="td-btn__icon" data-td-icon="name">svg</span>]<span class="td-btn__label">…</span>
 *     <span class="td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true" hidden>…</span>
 *   </button>
 * Loading = `aria-busy="true"` + `aria-disabled="true"` on the button (focus kept, clicks swallowed);
 * `disabled` = native disabled. Both update in place (no re-render → focus is not lost).
 *
 * Link button (v0.17.0, `href` present): the same structure in an `<a class="td-btn …" href [target] [rel]
 * [download]>` (no `type`). `href` must be http(s) / relative / `#…` / `mailto:` / `tel:` (else dropped + a
 * console warning; the link then behaves as disabled); `target` ∈ _blank|_self|_parent|_top (`_blank` adds
 * `rel="noopener noreferrer"`).
 *   - disabled: `href` removed (restored later), `role="link"`, `aria-disabled="true"`, `tabindex="-1"`, clicks
 *     swallowed; styled as the disabled button.
 *   - loading: `href` removed (no new tab / middle-click), `role="link"`, `aria-busy` + `aria-disabled`,
 *     `tabindex="0"` (focus kept), clicks swallowed, spinner.
 * SSR (v0.25.0, ADR 0012): a host marked `data-td-ssr="button@1"` that already contains this exact control (PHP
 *   td_button / td_link element mode) is adopted IN PLACE on upgrade — same `<button>` / `<a>` node (focus kept), no
 *   flash, no layout shift; state attributes are synced onto it. A structural mismatch (see canHydrate) renders as
 *   usual. The marker is removed once consumed. Moving the element re-binds without re-rendering (static hydratable).
 * Ghost (v0.17.0): `variant="ghost"` — transparent, no shadow / border, accent label
 * (`--td-btn-ghost-fg`), a soft hover fill (`--td-btn-ghost-hover-bg`).
 *
 * @element td-button
 * @attr {string} variant - primary | secondary | success | danger | info | warning | ghost (default: primary)
 * @attr {string} size - sm | md | lg (default: md)
 * @attr {string} icon - Icon registry name or alias (e.g. "download", "external-link"). DEPRECATED: any other value is
 *   treated as a legacy class list (e.g. Font Awesome "fas fa-edit") rendered as `<i aria-hidden="true">`. A single
 *   kebab-case token that is not in the registry (after aliases) warns once per name (v0.18.0) — probably a typo — and
 *   still takes the legacy path.
 * @attr {string} icon-position - left | right (default: left)
 * @attr {boolean} loading - Busy state (aria-busy), keeps focus
 * @attr {boolean} disabled - Native disabled
 * @attr {boolean} full-width
 * @attr {string} color - Custom background (safeColor) — overrides the variant
 * @attr {string} text-color - Custom text colour (default: black/white by WCAG contrast)
 * @attr {string} label - Button text (else the element's initial text)
 * @attr {string} type - button | submit | reset (default: button, whitelisted)
 * @attr {string} aria-label - Forwarded to the inner button (icon-only buttons)
 * @attr {string} href - Render a link button (`<a>`), v0.17.0 — see above
 * @attr {string} target - Link target (_blank | _self | _parent | _top), v0.17.0
 * @attr {string} download - Link download (optional file name; path characters removed), v0.17.0
 * @attr {string} name - Forwarded to the inner `<button>` (v0.18.0): the button is the real submitter, so
 *   `FormData(form, submitter)` / native submit carry `name=value`. Not on a link button. (`form` is NOT forwarded.)
 * @attr {string} value - Forwarded to the inner `<button>` with `name` (v0.18.0)
 * @attr {string} aria-pressed - Forwarded to the inner control (v0.19.0): true | false | mixed (toggle button)
 * @attr {string} aria-expanded - Forwarded to the inner control (v0.19.0): true | false (disclosure / menu button)
 * @attr {string} aria-controls - Forwarded verbatim (IDREF list) to the inner control (v0.19.0); empty → dropped
 * @attr {string} aria-haspopup - Forwarded to the inner control (v0.19.0): true | false | menu | listbox | tree |
 *   grid | dialog. A value outside these whitelists is not forwarded (console warning once). Updated in place; removing
 *   the host attribute removes it below. The host keeps the site's attributes (a custom element has no role).
 */
export class TdButton extends TdBaseElement {
  /** v0.25.0 (ADR 0012): adopts PHP element-mode markup in place; re-connect re-binds without re-rendering. */
  static hydratable = true;

  /** Version of the SSR markup contract (`data-td-ssr="button@1"`) — bumped only when the hydrate assumptions change. */
  static SSR_SCHEMA = 1;

  static get observedAttributes() {
    return ['variant', 'size', 'icon', 'icon-position', 'loading', 'disabled', 'full-width', 'color', 'text-color', 'label', 'type', 'aria-label', 'href', 'target', 'download', 'name', 'value',
      ...Object.keys(FORWARDED_ARIA)];
  }

  static get booleanAttributes() { return ['loading', 'disabled', 'full-width']; }

  /**
   * Parse a colour to RGBA. In a browser, any CSS colour is resolved through a temporary probe
   * (appended, read, removed synchronously; cached). Without a DOM: hex (3/4/6/8) and rgb()/rgba().
   * @param {string} color
   * @returns {{ r: number, g: number, b: number, a: number } | null}
   */
  static _parseColor(color) {
    if (!color || typeof color !== 'string') return null;
    const key = color.trim();
    if (_parseCache.has(key)) return _parseCache.get(key);
    const parsed = TdButton._parseColorUncached(key);
    if (_parseCache.size > 500) _parseCache.clear(); // bounded
    _parseCache.set(key, parsed);
    return parsed;
  }

  /** @private */
  static _parseColorUncached(color) {
    const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color.trim());
    if (hex) {
      let h = hex[1];
      if (h.length <= 4) h = [...h].map((c) => c + c).join('');
      const c = {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      };
      c.css = c.a < 1 ? `rgba(${c.r}, ${c.g}, ${c.b}, ${+c.a.toFixed(3)})` : `rgb(${c.r}, ${c.g}, ${c.b})`;
      return c;
    }
    let resolved = color.trim();
    // In a browser EVERY colour (incl. rgb()/rgba() with %, hsl, named…) is normalised by the engine.
    if (typeof document !== 'undefined' && document.documentElement) {
      const probe = document.createElement('span');
      probe.style.setProperty('color', resolved);
      if (!probe.style.getPropertyValue('color')) return null; // not a valid colour
      document.documentElement.appendChild(probe);
      resolved = getComputedStyle(probe).color;
      probe.remove();
    }
    const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(resolved);
    if (!m) return null;
    let a = 1;
    if (m[4] != null) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    const out = { r: +m[1], g: +m[2], b: +m[3], a };
    out.css = a < 1 ? `rgba(${out.r}, ${out.g}, ${out.b}, ${a})` : `rgb(${out.r}, ${out.g}, ${out.b})`;
    return out;
  }

  /** @param {{r:number,g:number,b:number}} c @returns {number} WCAG relative luminance */
  static _luminance({ r, g, b }) {
    return luminance({ r: r / 255, g: g / 255, b: b / 255 }); // v0.42.0: src/theme/color.js
  }

  /**
   * Black or white text for a background, by the higher WCAG contrast ratio. Translucent colours are
   * composited over white (pass `text-color` for translucent backgrounds on other surfaces).
   * @param {string} color
   * @returns {'#000000'|'#ffffff'}
   */
  static _getContrastColor(color) {
    if (_contrastCache.has(color)) return _contrastCache.get(color);
    const c = TdButton._parseColor(color);
    let out = '#ffffff';
    if (c) {
      const over = (v) => (v * c.a + 255 * (1 - c.a)) / 255;
      out = pickPole({ r: over(c.r), g: over(c.g), b: over(c.b) }, { tie: 'black' }); // v0.42.0: src/theme/color.js
    }
    if (_contrastCache.size > 500) _contrastCache.clear(); // bounded, like _parseCache
    _contrastCache.set(color, out);
    return out;
  }

  /** Back-compat alias (≤ 0.6): hex/rgb → {r,g,b} | null. */
  static _hexToRgb(hex) {
    const c = TdButton._parseColor(hex);
    return c ? { r: c.r, g: c.g, b: c.b } : null;
  }

  /** @private Visible text; '' for an icon-only button (icon + aria-label, no text). */
  _getButtonText() {
    const text = this.getAttribute('label') || this._originalText;
    if (text) return text;
    if (this.getAttribute('icon') && this.getAttribute('aria-label')) return '';
    return 'Button';
  }

  /**
   * @private The custom colour NORMALISED to an OPAQUE rgb() (contextual values such as currentColor are resolved
   * once; a translucent colour is composited over white, the same surface _getContrastColor() assumes — G3: custom
   * fills are opaque). '' when absent/unsafe/unresolvable.
   */
  _customColor() {
    const c = this.safeColor(this.getAttribute('color'), '');
    const p = c ? TdButton._parseColor(c) : null;
    if (!p) return '';
    const over = (v) => Math.round(v * p.a + 255 * (1 - p.a));
    return `rgb(${over(p.r)}, ${over(p.g)}, ${over(p.b)})`;
  }

  connectedCallback() {
    if (this._originalText === undefined) this._originalText = (this.textContent || '').trim();
    // Custom colours go on the host BEFORE the first render, else the new button's background/border would
    // transition from transparent on first paint. Later renders use the base post-render _applyStyles().
    if (!this._initialized) this._applyStyles();
    super.connectedCallback();
  }

  /** @param {boolean} isLoading */
  setLoading(isLoading) {
    if (isLoading) this.setAttribute('loading', '');
    else this.removeAttribute('loading');
  }

  /**
   * Run an async action with the button busy (v0.13.0): `loading` is set for the duration and always cleared in `finally`;
   * the function's result is returned / its error rethrown. A call while one is running returns the SAME in-flight
   * promise (no double submit).
   * @template T
   * @param {() => (T|Promise<T>)} fn
   * @returns {Promise<T>}
   */
  run(fn) {
    if (typeof fn !== 'function') return Promise.reject(new TypeError('TdButton.run: a function is required'));
    if (this._running) return this._running;
    this.setLoading(true);
    // The guard exists BEFORE fn runs (a synchronous nested run() gets the same promise); fn starts a microtask later.
    const p = Promise.resolve().then(() => fn()).finally(() => {
      this._running = null;
      this.setLoading(false);
    });
    this._running = p;
    return p;
  }

  /** @param {boolean} isDisabled */
  setDisabled(isDisabled) {
    if (isDisabled) this.setAttribute('disabled', '');
    else this.removeAttribute('disabled');
  }

  /** @private */
  _iconMarkup(icon) {
    if (!icon) return '';
    if (hasIcon(icon)) {
      return `<span class="td-btn__icon" data-td-icon="${this.escapeHtml(icon)}" data-td-icon-size="s" aria-hidden="true"></span>`;
    }
    if (ICON_NAME.test(icon) && !_warnedIcons.has(icon)) {
      _warnedIcons.add(icon);
      console.warn(`td-button: unknown icon "${icon}" (not in the icon registry; rendered as a legacy class — `
        + 'check the name, or registerIcons() it)');
    }
    const classes = icon.split(/\s+/).filter((c) => CLASS_TOKEN.test(c)).join(' ');
    if (!classes) return '';
    return `<span class="td-btn__icon" aria-hidden="true"><i class="${this.escapeHtml(classes)}" aria-hidden="true"></i></span>`;
  }

  /** @private @returns {boolean} link mode (`href` attribute present) */
  _isLink() {
    return this.hasAttribute('href');
  }

  /** @private @returns {string|null} the whitelisted href (warns once per rejected value) */
  _linkHref() {
    const raw = this.getAttribute('href');
    const href = safeButtonHref(raw);
    if (href === null && raw !== null && this._warnedHref !== raw) {
      this._warnedHref = raw;
      console.warn('td-button: href dropped (allowed: http(s), relative, #, mailto:, tel:)', raw);
    }
    return href;
  }

  /** @private The rendered `.td-btn` (button or link). */
  _control() {
    return this.querySelector(':scope > .td-btn');
  }

  render() {
    const variant = VARIANTS.includes(this.getAttribute('variant')) ? this.getAttribute('variant') : 'primary';
    const size = SIZES.includes(this.getAttribute('size')) ? this.getAttribute('size') : 'md';
    const rawType = this.getAttribute('type');
    const type = TYPES.includes(rawType) ? rawType : 'button';
    const custom = !!this._customColor();
    const classes = ['td-btn', `td-btn--${variant}`, `td-btn--${size}`];
    if (this.hasAttribute('full-width')) classes.push('td-btn--full');
    if (custom) classes.push('td-btn--custom');
    const icon = this._iconMarkup(this.getAttribute('icon') || '');
    const right = this.getAttribute('icon-position') === 'right';
    const text = this._getButtonText();
    const label = text ? `<span class="td-btn__label">${this.escapeHtml(text)}</span>` : '';
    const inner = (right ? label + icon : icon + label)
      + '<span class="td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true" hidden>'
      + '<svg class="td-spinner__svg" viewBox="0 0 50 50" aria-hidden="true" focusable="false">'
      + '<circle class="td-spinner__track" cx="25" cy="25" r="20"></circle>'
      + '<circle class="td-spinner__arc" cx="25" cy="25" r="20"></circle></svg></span>';
    if (this._isLink()) {
      // href itself is set by _syncState() (it depends on disabled / loading); target/rel/download are static.
      let attrs = '';
      const target = this.getAttribute('target');
      if (TARGETS.includes(target)) {
        attrs += ` target="${target}"`;
        if (target === '_blank') attrs += ' rel="noopener noreferrer"';
      }
      if (this.hasAttribute('download')) {
        const file = safeDownloadName(this.getAttribute('download'));
        attrs += file ? ` download="${this.escapeHtml(file)}"` : ' download';
      }
      return `<a class="${classes.join(' ')}"${attrs}>${inner}</a>`;
    }
    return `<button class="${classes.join(' ')}" type="${type}">${inner}</button>`;
  }

  /**
   * v0.25.0 SSR hydrate (contract `button@1`, PHP td_button / td_link element mode). Adopt the server markup in place
   * only when the marker matches and its STRUCTURE equals what render() would produce for the host's CURRENT
   * attributes (read after the early-property replay, so attributes changed before define count): control tag,
   * classes, type / target / download, icon (name + position), label text, spinner. A custom `color` /
   * `text-color` (never printed by PHP) refuses. STATE (loading, disabled, name / value, aria-*, the href value) is
   * not compared — afterRender() → _syncState() applies it to the adopted control. Anything else → normal render.
   * @returns {boolean}
   */
  canHydrate() {
    if (!this._ssrMatches('button', TdButton.SSR_SCHEMA)) return false;
    if (this.hasAttribute('color') || this.hasAttribute('text-color')) return false;
    return this._markupMatches();
  }

  /**
   * Review round 1 (SEC-1): on RE-connect the adopted / rendered markup is revalidated — changed while detached
   * (structure or a non-allowlisted attribute such as `formaction`) → re-render instead of re-binding.
   * @returns {boolean}
   */
  canRebind() {
    return this._markupMatches();
  }

  /**
   * Hydrate (v0.25.0): remember a GENUINE `tabindex` / `role` pass-through on an adopted link (`attrs` of td_link) — not
   * produced by the current state — so _syncState() restores it instead of removing it when state clears (IMPL-1).
   */
  hydrateExisting() {
    const a = this._control();
    if (a?.localName !== 'a' || this.hasAttribute('loading') || this.hasAttribute('disabled') || !this._linkHref()) return;
    this._linkPass = { el: a, tabindex: a.getAttribute('tabindex'), role: a.getAttribute('role') };
  }

  /** @private The single `.td-btn` child has exactly render()'s structure + only allowlisted attributes. */
  _markupMatches() {
    const kids = contentNodes(this);
    if (kids.length !== 1 || kids[0].nodeType !== 1 || !kids[0].classList.contains('td-btn')) return false;
    const tpl = document.createElement('template');
    tpl.innerHTML = this.render();
    return sameControlStructure(kids[0], tpl.content.firstElementChild);
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized) return;
    if (name === 'loading' || name === 'disabled' || name === 'name' || name === 'value' || name in FORWARDED_ARIA) {
      this._syncState();
      return;
    }
    // href: a new value in place (focus kept); adding / removing it switches button <-> link (re-render).
    if (name === 'href' && oldVal !== null && newVal !== null) { this._syncState(); return; }
    if (name === 'label') {
      const l = this.querySelector('.td-btn__label');
      const text = this._getButtonText();
      if (l && text) { l.textContent = text; return; }
    }
    if (name === 'aria-label') {
      // Structural when it decides whether an icon-only button shows a text label.
      const hasLabel = !!this.querySelector('.td-btn__label');
      if (hasLabel !== !!this._getButtonText()) { this._doRender(); return; }
      this._syncState();
      return;
    }
    if (name === 'color' || name === 'text-color') { this._applyStyles(); this._doRender(); return; }
    this._doRender();
  }

  afterRender() {
    fillIconSlots(this, '.td-btn__icon[data-td-icon]'); // only the button's own icon slot (never the control itself)
    const btn = this._control();
    if (!btn) return;
    // Busy (and a disabled / href-less link): swallow activation (a busy element stays focusable; aria-disabled
    // announces it).
    this.listen(btn, 'click', (e) => {
      if (this.hasAttribute('loading') || (btn.localName === 'a' && !btn.hasAttribute('href'))) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, { capture: true });
    this._syncState();
  }

  /**
   * @private In-place state: disabled, busy, forwarded aria-label (and href / tabindex / role for a link; name / value
   * for a button).
   */
  _syncState() {
    const btn = this._control();
    if (!btn) return;
    const loading = this.hasAttribute('loading');
    const disabled = this.hasAttribute('disabled');
    if (btn.localName === 'a') {
      const href = this._linkHref();
      const inert = disabled || !href; // disabled, or nothing safe to navigate to
      // Order matters: a focused link must never be unfocusable for an instant (the browser would blur it) —
      // tabindex is set BEFORE href is removed, and href is restored BEFORE tabindex is removed.
      if (inert || loading) {
        btn.setAttribute('tabindex', inert ? '-1' : '0');
        btn.removeAttribute('href'); // the attribute stays on the host -> restored when the state clears
        btn.setAttribute('role', 'link'); // an <a> without href is no longer a link for AT
        btn.setAttribute('aria-disabled', 'true');
      } else {
        btn.setAttribute('href', href);
        // a pass-through tabindex / role of an adopted SSR link (td_link `attrs`) is restored, else removed
        const pass = this._linkPass?.el === btn ? this._linkPass : null;
        for (const attr of ['tabindex', 'role']) {
          if (pass?.[attr] != null) btn.setAttribute(attr, pass[attr]);
          else btn.removeAttribute(attr);
        }
        btn.removeAttribute('aria-disabled');
      }
      if (loading) btn.setAttribute('aria-busy', 'true');
      else btn.removeAttribute('aria-busy');
    } else {
      btn.disabled = disabled;
      // Submitter data (v0.18.0): the light-DOM <button> is the real submitter → name/value mirror the host.
      for (const attr of ['name', 'value']) {
        const v = this.getAttribute(attr);
        if (v !== null) btn.setAttribute(attr, v);
        else btn.removeAttribute(attr);
      }
      if (loading) {
        btn.setAttribute('aria-busy', 'true');
        btn.setAttribute('aria-disabled', 'true');
      } else {
        btn.removeAttribute('aria-busy');
        btn.removeAttribute('aria-disabled');
      }
    }
    const spinner = this.querySelector('.td-btn__spinner');
    if (spinner) spinner.hidden = !loading;
    const aria = this.getAttribute('aria-label');
    if (aria) btn.setAttribute('aria-label', aria);
    else btn.removeAttribute('aria-label');
    for (const attr of Object.keys(FORWARDED_ARIA)) {
      const v = this._forwardedAria(attr);
      if (v !== null) btn.setAttribute(attr, v);
      else btn.removeAttribute(attr);
    }
  }

  /**
   * @private The host's `aria-pressed|expanded|controls|haspopup` value to forward (v0.19.0 G1), or null (absent /
   * empty / not whitelisted — the last warns once per attribute+value).
   * @param {string} attr
   * @returns {string|null}
   */
  _forwardedAria(attr) {
    const raw = this.getAttribute(attr);
    if (raw === null) return null;
    const allowed = FORWARDED_ARIA[attr];
    if (allowed === null) return raw.trim() ? raw : null; // IDREF list: verbatim (setAttribute → no injection)
    const v = raw.trim().toLowerCase();
    if (allowed.includes(v)) return v;
    const key = `${attr}=${raw}`;
    if (!_warnedAria.has(key)) {
      if (_warnedAria.size > 200) _warnedAria.clear(); // bounded
      _warnedAria.add(key);
      console.warn(`td-button: ${attr} not forwarded (allowed: ${allowed.join(' | ')})`, raw);
    }
    return null;
  }

  /**
   * Per-instance custom colours via host CSSOM custom properties (CSP-safe). Owned vars only: without a custom
   * colour just the values this button set are removed — a site's own `--td-btn-*` on the host survives.
   */
  _applyStyles() {
    if (!this.style) return; // non-DOM environments (node render tests)
    const bg = this._customColor();
    let fg = '';
    let hover = '';
    if (bg) {
      fg = this.safeColor(this.getAttribute('text-color'), '') || TdButton._getContrastColor(bg);
      // Hover overlay that INCREASES contrast: darken under light text, lighten under dark text.
      const light = TdButton._getContrastColor(fg) === '#000000';
      hover = light ? 'rgb(0 0 0 / 12%)' : 'rgb(255 255 255 / 30%)';
    }
    this._setOwnedStyle('--td-btn-bg', bg);
    this._setOwnedStyle('--td-btn-fg', fg);
    this._setOwnedStyle('--td-btn-hover', hover);
  }
}

if (!customElements.get('td-button')) {
  customElements.define('td-button', TdButton);
}
