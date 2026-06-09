import { TdFormElement } from '../base/td-form-element.js';
import { applyStyles } from '../utils/css-safe.js';
import { adoptStyles } from '../utils/adopt-styles.js';

/**
 * Static, per-instance-INVARIANT rules adopted ONCE per document via a constructable
 * stylesheet (CSP-safe; a strict `style-src 'self'` blocks an injected `<style>`).
 *
 * ENHANCEMENT-ONLY (codex ISSUE-1): this sheet carries ONLY the three `transition`s
 * (track background + box-shadow, thumb transform, icon opacity). These are genuine,
 * non-load-bearing embellishments — on a browser WITHOUT `adoptedStyleSheets` (where
 * `adoptStyles()` returns false) losing them only removes the animation; the switch
 * still renders and conveys state.
 *
 * Everything STRUCTURAL (track `position:relative`/`display:inline-block`; thumb
 * `position:absolute`/`display:flex`/centering/`background-color:#fff`/`border-radius`;
 * track/thumb sizing + base background/box-shadow) AND everything STATE-CONVEYING (the
 * checked track color gradient/glow, the thumb translate, the icon opacity/position) is
 * applied as CSSOM SCALARS in `_applyStyles()` / `_updateToggleState()` so it works on
 * EVERY browser regardless of the adopted sheet — and because the transitions live here,
 * the browser still animates each scalar change when supported. The SVG icon `style=`
 * became presentation attributes (`opacity`) + CSSOM `position`.
 */
const TOGGLE_SHEET = `
td-toggle .td-toggle-track {
  transition: background 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94),
              box-shadow 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
td-toggle .td-toggle-thumb {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
td-toggle .td-toggle-icon {
  transition: opacity 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
`;

/**
 * Toggle switch component with SVG cross/checkmark icons and bounce animation.
 * Form-associated (ElementInternals): submits its `value` (default "on") only when
 * checked, supports `required`, reset, and `<fieldset disabled>`.
 *
 * **0.2.0 BREAKING:** the toggle is now **UNCONTROLLED by default** — clicking it
 * self-toggles like a native checkbox AND emits `change`. Add the boolean `controlled`
 * attribute to restore the old emit-only behavior (the consumer flips `checked`).
 *
 * **0.3.0 CSP-strict:** no declarative `style=` and no injected `<style>`. The static
 * transitions/structure live in a constructable stylesheet (`adoptStyles`); per-instance,
 * state-dependent scalars (size dimensions, active gradient/box-shadow built from the
 * custom color, thumb translate, icon opacity/position) are applied via CSSOM in
 * `_applyStyles()`; the SVG icons use presentation attributes instead of inline style.
 *
 * @element td-toggle
 * @attr {boolean} checked - Whether the toggle is on
 * @attr {boolean} controlled - Opt-in: emit `change` only, do NOT self-toggle (legacy behavior)
 * @attr {string} value - Submitted value when checked (default: "on")
 * @attr {string} name - Form field name (submitted via the host)
 * @attr {boolean} required - Must be on for the form to be valid
 * @attr {boolean} disabled - Disables interaction (also via ancestor <fieldset disabled>)
 * @attr {string} label - Label text displayed next to the switch
 * @attr {string} size - Size variant: sm | md | lg (default: md)
 * @attr {string} color - Active color (default: #4ADE80)
 * @fires change - When toggled, detail: { checked: boolean }
 */
export class TdToggle extends TdFormElement {
  static get observedAttributes() { return [...super.observedAttributes, 'checked', 'controlled', 'value', 'label', 'size', 'color']; }
  static get booleanAttributes() { return [...super.booleanAttributes, 'checked', 'controlled']; }

  connectedCallback() {
    // Adopt the static stylesheet lazily (never at module top-level) — idempotent,
    // feature-detected, never throws. Returns false in node/SSR or old browsers, where
    // the component still renders structurally (Tailwind classes + CSSOM scalars apply).
    adoptStyles(TOGGLE_SHEET, 'td-toggle');
    super.connectedCallback();
  }

  /** @private */
  _getSizeConfig() {
    const sizes = {
      sm: { width: 40, height: 20, thumb: 16, offset: 2, iconSize: 8, stroke: 1.5 },
      md: { width: 48, height: 24, thumb: 20, offset: 2, iconSize: 10, stroke: 2 },
      lg: { width: 56, height: 28, thumb: 24, offset: 2, iconSize: 12, stroke: 2 },
    };
    return sizes[this.getAttribute('size') || 'md'] || sizes.md;
  }

  /** @private */
  _getColor() {
    return this.safeColor(this.getAttribute('color'), '#4ADE80');
  }

  /** @private - Convert any CSS color to RGB using computed style */
  _parseHexToRgb(color) {
    if (!color) return { r: 74, g: 222, b: 128 };
    // Try hex first
    if (color.startsWith('#')) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
      if (result) return { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) };
      // Short hex (#abc)
      const short = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(color);
      if (short) return { r: parseInt(short[1]+short[1], 16), g: parseInt(short[2]+short[2], 16), b: parseInt(short[3]+short[3], 16) };
    }
    // Named colors / rgb() / etc — use computed style
    const temp = document.createElement('div');
    temp.style.color = color;
    document.body.appendChild(temp);
    const computed = getComputedStyle(temp).color;
    document.body.removeChild(temp);
    const m = computed.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (m) return { r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]) };
    return { r: 74, g: 222, b: 128 };
  }

  /**
   * Change toggle color at runtime without re-rendering.
   * @param {string} newColor - CSS hex color (e.g. '#f59e0b')
   */
  setColor(newColor) {
    this.setAttribute('color', newColor);
  }

  render() {
    const isChecked = this.hasAttribute('checked');
    const isDisabled = this._effectiveDisabled;
    const label = this.escapeHtml(this.getAttribute('label') || '');
    const color = this._getColor();
    const s = this._getSizeConfig();

    const trackActive = isChecked ? ' td-toggle-track--active' : '';
    const thumbActive = isChecked ? ' td-toggle-thumb--active' : '';
    const disabledClass = isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer';

    // SVG icons: the old inline `style="opacity:…;position:…"` is gone. `opacity` is an
    // SVG PRESENTATION ATTRIBUTE (not a CSS context — not gated by CSP); `position` is set
    // via CSSOM in `_applyStyles()` (with the transition coming from the adopted sheet).
    const crossOpacity = isChecked ? '0' : '1';
    const checkOpacity = isChecked ? '1' : '0';

    // a11y: the interactive label is exposed as an ARIA switch (role + aria-checked),
    // mirroring the dcms toggle. It is keyboard-focusable (tabindex) and operable via
    // Space/Enter (see afterRender) so it behaves like a native switch. `aria-checked`
    // is kept in sync on every state change in `_updateToggleState()` / re-render.
    const ariaDisabled = isDisabled ? ' aria-disabled="true"' : '';
    const tabIndex = isDisabled ? '-1' : '0';
    return `
      <div class="flex items-center gap-2 td-toggle-root">
        <label class="relative inline-flex items-center ${disabledClass}" role="switch" aria-checked="${isChecked ? 'true' : 'false'}" tabindex="${tabIndex}"${ariaDisabled}>
          <div class="td-toggle-track${trackActive}">
            <div class="td-toggle-thumb${thumbActive}">
              <svg viewBox="0 0 12 12" fill="none" class="td-toggle-icon" opacity="${crossOpacity}">
                <path d="M3 3L9 9M9 3L3 9" stroke="#9ca3af" stroke-width="${s.stroke}" stroke-linecap="round"></path>
              </svg>
              <svg viewBox="0 0 12 12" fill="none" class="td-toggle-icon" opacity="${checkOpacity}">
                <path d="M2.5 6L5 8.5L9.5 3.5" stroke="${this.escapeHtml(color)}" stroke-width="${s.stroke}" stroke-linecap="round"></path>
              </svg>
            </div>
          </div>
        </label>
        ${label ? `<span class="text-sm font-medium text-gray-700 select-none td-toggle-label">${label}</span>` : ''}
      </div>
    `;
  }

  /**
   * Per-element scalar style maps for the current state — single source of truth shared
   * by `_applyStyles()` (full render) and `_updateToggleState()` (lightweight check toggle).
   * All values are CSSOM-ready (no selectors). Color-derived strings are built from the
   * sanitized `_getColor()`; sizes from `_getSizeConfig()`.
   * @private
   */
  _scalarStyles() {
    const isChecked = this.hasAttribute('checked');
    const s = this._getSizeConfig();
    const translateX = s.width - s.thumb - s.offset * 2;
    const color = this._getColor();
    const rgb = this._parseHexToRgb(color);
    const darker = { r: Math.max(0, rgb.r - 20), g: Math.max(0, rgb.g - 20), b: Math.max(0, rgb.b - 20) };

    const trackActiveBg = `linear-gradient(180deg, rgba(${rgb.r},${rgb.g},${rgb.b},0.95) 0%, rgba(${darker.r},${darker.g},${darker.b},0.95) 100%)`;
    const trackActiveShadow = `inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 2px 8px rgba(${rgb.r},${rgb.g},${rgb.b},0.3)`;

    return {
      track: {
        // STRUCTURAL (must apply on every browser, not sheet-only): the track is the
        // positioning context for the absolutely-positioned thumb and lays out inline.
        'position': 'relative',
        'display': 'inline-block',
        'width': `${s.width}px`,
        'height': `${s.height}px`,
        'border-radius': `${s.height / 2}px`,
        // State-dependent: active → color gradient + glow; inactive → base tint + inset.
        // Setting `background` (shorthand) clears the other-state value so parity holds.
        'background': isChecked ? trackActiveBg : 'rgba(0, 0, 0, 0.1)',
        'box-shadow': isChecked ? trackActiveShadow : 'inset 0 1px 2px rgba(0, 0, 0, 0.08)',
      },
      thumb: {
        // STRUCTURAL: absolute inside the track, centered flex for the icons, round white
        // knob. All load-bearing — must apply via CSSOM, never via the adopted sheet only.
        'position': 'absolute',
        'display': 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'background-color': '#fff',
        'border-radius': '50%',
        'box-shadow': '0 2px 8px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.1)',
        'width': `${s.thumb}px`,
        'height': `${s.thumb}px`,
        'top': `${s.offset}px`,
        'left': `${s.offset}px`,
        // STATE: translate to the "on" position when checked; off position otherwise.
        'transform': isChecked ? `translateX(${translateX}px)` : 'none',
      },
      iconSize: {
        'width': `${s.iconSize}px`,
        'height': `${s.iconSize}px`,
      },
      crossPosition: isChecked ? 'absolute' : 'static',
      checkPosition: isChecked ? 'static' : 'absolute',
    };
  }

  /**
   * CSP-safe replacement for the removed declarative `style=` attributes. Auto-invoked by
   * the base after `afterRender()` on the initial render AND on every observed-attribute
   * re-render (size/color/disabled/value/label/controlled funnel through `_doRender()`),
   * so size- and color-dependent scalars stay correct. The `checked` attribute takes the
   * lightweight `_updateToggleState()` path instead (no re-render) — which re-applies the
   * SAME maps so the CSS transition (from the adopted sheet) animates.
   * @private
   */
  _applyStyles() {
    const m = this._scalarStyles();
    const root = this.querySelector('.td-toggle-root');
    const track = this.querySelector('.td-toggle-track');
    const thumb = this.querySelector('.td-toggle-thumb');
    const crossIcon = this.querySelector('.td-toggle-icon:first-child');
    const checkIcon = this.querySelector('.td-toggle-icon:last-child');

    // Root: tighten line-height so the inline switch doesn't inherit text leading. Moved
    // off the adopted sheet (was sheet-only) → CSSOM so it holds without adoptedStyleSheets.
    applyStyles(root, { 'line-height': '1' });
    applyStyles(track, m.track);
    applyStyles(thumb, m.thumb);
    applyStyles(crossIcon, { ...m.iconSize, 'position': m.crossPosition });
    applyStyles(checkIcon, { ...m.iconSize, 'position': m.checkPosition });

    // Optional label span: line-height tracks the switch height (size-dependent). Not in
    // the parity matrix, but kept for visual fidelity with the pre-refactor inline style.
    const labelSpan = this.querySelector('.td-toggle-label');
    if (labelSpan) applyStyles(labelSpan, { 'line-height': m.track.height });
  }

  /**
   * Lightweight DOM updates for 'checked'/'color'; full re-render otherwise.
   * 'disabled' keeps `_effectiveDisabled` in sync (it changes the rendered guard classes).
   */
  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (!this._initialized) return;

    if (name === 'checked') {
      this._updateToggleState();
      this._syncForm();
      return;
    }

    if (name === 'color') {
      // Re-apply color-derived scalars (active gradient/box-shadow) + the SVG stroke
      // presentation attribute, without a full re-render.
      this._applyStyles();
      const color = this._getColor();
      const checkIcon = this.querySelector('.td-toggle-icon:last-child path');
      if (checkIcon) checkIcon.setAttribute('stroke', color);
      return;
    }

    if (name === 'disabled') {
      this._effectiveDisabled = newVal !== null || this._ancestorDisabled;
      this._doRender();
      return;
    }

    // For other attributes (controlled, value, label, size, name, required): full re-render
    this._doRender();
  }

  /**
   * Lightweight DOM update for toggle state — no re-render, CSS transition plays.
   * Re-applies the SCALAR maps (CSSOM) + toggles the active classes + the SVG `opacity`
   * presentation attribute. The adopted sheet's transitions animate the scalar changes.
   * @private
   */
  _updateToggleState() {
    const isChecked = this.hasAttribute('checked');
    const m = this._scalarStyles();
    // a11y: keep the ARIA switch state in sync on the no-re-render `checked` path.
    const switchEl = this.querySelector('label[role="switch"]');
    if (switchEl) switchEl.setAttribute('aria-checked', isChecked ? 'true' : 'false');
    const track = this.querySelector('.td-toggle-track');
    const thumb = this.querySelector('.td-toggle-thumb');
    const crossIcon = this.querySelector('.td-toggle-icon:first-child');
    const checkIcon = this.querySelector('.td-toggle-icon:last-child');

    if (track) {
      track.classList.toggle('td-toggle-track--active', isChecked);
      applyStyles(track, m.track);
    }
    if (thumb) {
      thumb.classList.toggle('td-toggle-thumb--active', isChecked);
      applyStyles(thumb, m.thumb);
    }
    if (crossIcon) {
      crossIcon.setAttribute('opacity', isChecked ? '0' : '1');
      crossIcon.style.setProperty('position', m.crossPosition);
    }
    if (checkIcon) {
      checkIcon.setAttribute('opacity', isChecked ? '1' : '0');
      checkIcon.style.setProperty('position', m.checkPosition);
    }
  }

  afterRender() {
    const labelEl = this.querySelector('label');
    if (labelEl) {
      this.listen(labelEl, 'click', (e) => {
        e.preventDefault();
        this._toggleFromUser();
      });
      // a11y: a `role="switch"` must be operable by keyboard. Space/Enter toggle it,
      // matching native switch/checkbox behavior. preventDefault stops Space scrolling.
      this.listen(labelEl, 'keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'Spacebar') {
          e.preventDefault();
          this._toggleFromUser();
        }
      });
    }
    this._syncForm();
  }

  /**
   * Shared user-initiated toggle action (click or Space/Enter). Respects `disabled`
   * and the `controlled` opt-out, then emits `change`.
   * @private
   */
  _toggleFromUser() {
    if (this._effectiveDisabled) return;
    const isChecked = this.hasAttribute('checked');

    // 0.2.0: UNCONTROLLED by default — self-toggle like a native checkbox.
    // With the `controlled` attribute we keep the legacy emit-only behavior, so
    // the consumer sets/removes `checked` after confirming the action / API success.
    if (!this.hasAttribute('controlled')) {
      if (isChecked) this.removeAttribute('checked');
      else this.setAttribute('checked', ''); // → attributeChangedCallback updates UI + form value
    }

    this.emit('change', { checked: !isChecked });
  }

  /** @private Push the toggle state into form submission + constraint validation. */
  _syncForm() {
    const checked = this.hasAttribute('checked');
    const value = this.getAttribute('value') ?? 'on';
    this._setFormValue(checked ? value : null);
    if (this.hasAttribute('required') && !checked) {
      this._setValidity({ valueMissing: true }, 'Please turn this on.', this._focusTarget());
    } else {
      this._setValidity({});
    }
  }

  _captureDefaults() {
    super._captureDefaults();
    // Presence-aware: null = no `value` attr (submits "on"); a string = explicit value (ISSUE-2).
    this._defaultValueAttr = this.getAttribute('value');
  }

  _restoreDefaults() {
    if (this._defaultChecked) this.setAttribute('checked', '');
    else this.removeAttribute('checked');
    if (this._defaultValueAttr === null) this.removeAttribute('value');
    else this.setAttribute('value', this._defaultValueAttr);
    this._syncForm();
  }

  _focusTarget() {
    return this.querySelector('label');
  }
}

if (!customElements.get('td-toggle')) {
  customElements.define('td-toggle', TdToggle);
}
