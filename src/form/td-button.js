import { TdBaseElement } from '../base/td-base-element.js';
import { fillIconSlots, hasIcon } from '../icons/td-icon.js';

const VARIANTS = ['primary', 'secondary', 'success', 'danger', 'info', 'warning'];
const SIZES = ['sm', 'md', 'lg'];
const TYPES = ['submit', 'reset', 'button'];
const CLASS_TOKEN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const _contrastCache = new Map();
/** input string → parsed colour | null (one engine probe per distinct colour, invalid ones included) */
const _parseCache = new Map();

/**
 * Button — token-native (needs td.css; no Tailwind). Styles: src/styles/components/button.css.
 * Content-layer control: SOLID fills, never glass (docs/design/liquid-glass.md R1/R7); status variants
 * use the semantic colour tokens (all ≥ 4.5:1 with their text).
 *
 * DOM contract:
 *   <button class="td-btn td-btn--{variant} td-btn--{size}[ td-btn--full][ td-btn--custom]" type="…">
 *     [<span class="td-btn__icon" data-td-icon="name">svg</span>]<span class="td-btn__label">…</span>
 *     <span class="td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true" hidden>…</span>
 *   </button>
 * Loading = `aria-busy="true"` + `aria-disabled="true"` on the button (focus kept, clicks swallowed);
 * `disabled` = native disabled. Both update in place (no re-render → focus is not lost).
 *
 * @element td-button
 * @attr {string} variant - primary | secondary | success | danger | info | warning (default: primary)
 * @attr {string} size - sm | md | lg (default: md)
 * @attr {string} icon - Icon registry name (e.g. "download"). DEPRECATED: any other value is treated as a
 *   legacy class list (e.g. Font Awesome "fas fa-edit") rendered as `<i aria-hidden="true">`.
 * @attr {string} icon-position - left | right (default: left)
 * @attr {boolean} loading - Busy state (aria-busy), keeps focus
 * @attr {boolean} disabled - Native disabled
 * @attr {boolean} full-width
 * @attr {string} color - Custom background (safeColor) — overrides the variant
 * @attr {string} text-color - Custom text colour (default: black/white by WCAG contrast)
 * @attr {string} label - Button text (else the element's initial text)
 * @attr {string} type - button | submit | reset (default: button, whitelisted)
 * @attr {string} aria-label - Forwarded to the inner button (icon-only buttons)
 */
export class TdButton extends TdBaseElement {
  static get observedAttributes() {
    return ['variant', 'size', 'icon', 'icon-position', 'loading', 'disabled', 'full-width', 'color', 'text-color', 'label', 'type', 'aria-label'];
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
    const lin = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
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
      const over = (v) => v * c.a + 255 * (1 - c.a);
      const L = TdButton._luminance({ r: over(c.r), g: over(c.g), b: over(c.b) });
      const withBlack = (L + 0.05) / 0.05;
      const withWhite = 1.05 / (L + 0.05);
      out = withBlack >= withWhite ? '#000000' : '#ffffff';
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
   * @private The custom colour NORMALISED to rgb()/rgba() (contextual values such as currentColor are
   * resolved once, not re-evaluated inside the button). '' when absent/unsafe/unresolvable.
   */
  _customColor() {
    const c = this.safeColor(this.getAttribute('color'), '');
    const parsed = c ? TdButton._parseColor(c) : null;
    return parsed ? parsed.css : '';
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
    const classes = icon.split(/\s+/).filter((c) => CLASS_TOKEN.test(c)).join(' ');
    if (!classes) return '';
    return `<span class="td-btn__icon" aria-hidden="true"><i class="${this.escapeHtml(classes)}" aria-hidden="true"></i></span>`;
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
    return `<button class="${classes.join(' ')}" type="${type}">`
      + (right ? label + icon : icon + label)
      + '<span class="td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true" hidden>'
      + '<svg class="td-spinner__svg" viewBox="0 0 50 50" aria-hidden="true" focusable="false">'
      + '<circle class="td-spinner__track" cx="25" cy="25" r="20"></circle>'
      + '<circle class="td-spinner__arc" cx="25" cy="25" r="20"></circle></svg></span>'
      + '</button>';
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized) return;
    if (name === 'loading' || name === 'disabled') { this._syncState(); return; }
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
    fillIconSlots(this);
    const btn = this.querySelector('button');
    if (!btn) return;
    // Busy: swallow activation (the button stays focusable; aria-disabled announces it).
    this.listen(btn, 'click', (e) => {
      if (this.hasAttribute('loading')) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, { capture: true });
    this._syncState();
  }

  /** @private In-place state: disabled, busy, forwarded aria-label. */
  _syncState() {
    const btn = this.querySelector('button');
    if (!btn) return;
    const loading = this.hasAttribute('loading');
    btn.disabled = this.hasAttribute('disabled');
    if (loading) {
      btn.setAttribute('aria-busy', 'true');
      btn.setAttribute('aria-disabled', 'true');
    } else {
      btn.removeAttribute('aria-busy');
      btn.removeAttribute('aria-disabled');
    }
    const spinner = this.querySelector('.td-btn__spinner');
    if (spinner) spinner.hidden = !loading;
    const aria = this.getAttribute('aria-label');
    if (aria) btn.setAttribute('aria-label', aria);
    else btn.removeAttribute('aria-label');
  }

  /** Per-instance custom colours via host CSSOM custom properties (CSP-safe). */
  _applyStyles() {
    if (!this.style) return; // non-DOM environments (node render tests)
    const bg = this._customColor();
    if (bg) {
      const fg = this.safeColor(this.getAttribute('text-color'), '') || TdButton._getContrastColor(bg);
      this.style.setProperty('--td-btn-bg', bg);
      this.style.setProperty('--td-btn-fg', fg);
      // Hover overlay that INCREASES contrast: darken under light text, lighten under dark text.
      const light = TdButton._getContrastColor(fg) === '#000000';
      this.style.setProperty('--td-btn-hover', light ? 'rgb(0 0 0 / 12%)' : 'rgb(255 255 255 / 30%)');
    } else {
      this.style.removeProperty('--td-btn-bg');
      this.style.removeProperty('--td-btn-fg');
      this.style.removeProperty('--td-btn-hover');
    }
  }
}

if (!customElements.get('td-button')) {
  customElements.define('td-button', TdButton);
}
