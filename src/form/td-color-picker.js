import {
  TdFormElement, ssrClassKey, ssrContentNodes, ssrSameAttrs, ssrSamePart, ssrIsErrorNote, SSR_ARIA_DATA, SSR_CONTROL_ATTRS,
} from '../base/td-form-element.js';
import { ssrMarker } from '../base/td-base-element.js';
import { tdIcon } from '../icons/td-icon.js';
import { placeFloating, isReferenceHidden, watchReference, viewportBox } from '../utils/floating.js';
import { LAYERS, register as registerLayer, bridgeTheme, focusablesIn } from '../utils/layers.js';
import { createCheckMark } from '../utils/check-mark.js';
import { contrast, pickPole } from '../theme/color.js';
import {
  parseColorInput, parsePresets, DEFAULT_PRESETS, HEX_RE, MAX_COLOR_INPUT, hsvFromHex, hexFromHsv, hueHex, stepArea,
  areaFromPoint, colorName, areaValueText, fill,
} from '../utils/color-picker-model.js';

/** Attributes of the server-rendered input that exist only for the no-JS form (removed on hydrate). */
const SSR_ONLY = ['name', 'value', 'required', 'pattern', 'title'];
/** The no-JS pattern printed by php/td.php (QĐ 1: only `#RRGGBB` without JS — the server normalises). */
export const SSR_PATTERN = '#[0-9a-fA-F]{6}';
const FALSY = new Set(['false', '0', 'off']);
/** Fixed attributes of the text input (render() + php/td.php). `autocapitalize="none"` (never "off": Firefox). */
const INPUT_ATTRS = [['inputmode', 'text'], ['autocomplete', 'off'], ['autocapitalize', 'none'], ['autocorrect', 'off'],
  ['spellcheck', 'false'], ['maxlength', String(MAX_COLOR_INPUT)]];
/** Starting state of the popup for an empty value: the pure hue (top-right) — moving the hue alone gives a colour. */
const EMPTY_HSV = Object.freeze({ h: 0, s: 1, v: 1 });

/**
 * Write a picker custom property — ONLY a `#rrggbb` produced by toHex() or a clamped number (QĐ 21). Anything else is
 * not written (the user's raw text never reaches CSSOM).
 * @param {HTMLElement|null} el
 * @param {string} name
 * @param {string|number|null} value null → removed
 */
function setVar(el, name, value) {
  if (!el || !el.style) return;
  if (value == null) { el.style.removeProperty(name); return; }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) el.style.setProperty(name, String(Math.min(1, Math.max(0, value))));
    return;
  }
  if (typeof value === 'string' && HEX_RE.test(value)) el.style.setProperty(name, value);
}

let panelSeq = 0;

/**
 * <td-color-picker> — a form-associated colour field (v0.48.0, plan v0.48.0-color-picker). Token-native: needs td.css
 * (src/styles/components/color-picker.css). The value is ONE shape: `#rrggbb` lowercase, or `''`.
 *
 * - Three ways in, each enough on its own: the text input (always visible: type / paste `#ABC`, `1d4ed8`, `rgb()`,
 *   `oklch()`, a CSS basic name — src/utils/color-picker-model.js parseColorInput), the presets, and the 2-D area
 *   (saturation × brightness, HSV) + hue range in the popup. Keyboard: the text input + presets; the area has its
 *   own keys (arrows ±1 %, Shift ±10 %, PageUp / PageDown, Home / End).
 * - Typing: a parsable text updates the swatch / popup / form value at once (the text is NOT rewritten while typing);
 *   on blur / Enter it becomes the canonical form (`#ABC` → `#aabbcc`) and `change` fires when it differs from the
 *   last committed value. Unparsable → the form submits the raw text with `badInput` (blocked by constraint
 *   validation); translucent colours are refused (`messages.alpha`).
 * - Popup (portaled to <body>, layer `popover`, theme bridged — ADR 0020): area, [eyedropper] + hue, [contrast row],
 *   presets, "Xoá màu". Escape → back to the value at opening + focus on the swatch button; outside click / scroll
 *   away / covered → close keeping the value; a preset click selects + closes. Tab cycles inside the popup.
 * - Events (bubbling CustomEvents, user only): `input` `{ value }` on every change (drag coalesced per frame),
 *   `change` `{ value }` on commit (pointer up, each key step, preset, clear, eyedropper, blur / Enter, Escape that
 *   changed the value). The native `input` / `change` of the inner controls never leave the component. Setting
 *   `value` / `setValue()` is silent.
 * - `presets` attribute (codes separated by spaces / commas) or property (array of `string | { value, label }`, wins);
 *   default: 16 colours (`TdColorPicker.defaultPresets`); `presets=""` → none. `custom="false"` → presets only (text
 *   read-only, no area / hue / eyedropper). `contrast` → white / black text samples + WCAG ratio. `eyedropper="false"`
 *   hides the EyeDropper button (shown only where `window.EyeDropper` exists).
 * - SSR (ADR 0012, contract `color-picker@1`): php/td.php td_color_picker() prints the same tree with a plain text
 *   input (`pattern="#[0-9a-fA-F]{6}"`, works without JS); the element adopts it IN PLACE, then wraps the swatch in
 *   the button and adds the clear button.
 *
 * DOM contract:
 *   <td-color-picker>
 *     <div class="td-color">
 *       [<label class="td-color__label" for="{control id}">label</label>]
 *       <div class="td-color__box">
 *         <button type="button" class="td-color__trigger" aria-haspopup="dialog" aria-expanded aria-label>
 *           <span class="td-color__swatch" aria-hidden="true" data-state="empty|filled|invalid"></span></button>
 *         <input type="text" class="td-color__input" id="{host id}-input" inputmode="text" autocomplete="off"
 *                autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="64">
 *         <button type="button" class="td-color__clear" aria-label="Xoá màu" [hidden]><svg data-icon="close"></button>
 *       </div>
 *     </div>
 *     [<span class="td-field-error" id="{host id}-error" data-for="{host id}">error</span>]
 *   </td-color-picker>
 *   <body> > <div class="td-color-panel td-glass-surface td-glass-surface--strong" role="dialog" id="{host id}-panel"> (open)
 *
 * @element td-color-picker
 * @attr {string} name
 * @attr {string} value - default value; later changes set the live value too
 * @attr {string} label / placeholder / error-text / aria-label
 * @attr {string} presets - codes separated by spaces / commas
 * @attr {boolean} required / disabled / readonly / contrast
 * @attr {string} custom - "false" → presets only
 * @attr {string} eyedropper - "false" → no EyeDropper button
 * @fires input - detail: { value }
 * @fires change - detail: { value }
 */
export class TdColorPicker extends TdFormElement {
  /** v0.48.0: adopts PHP element-mode markup in place (`color-picker@1`). */
  static hydratable = true;

  /** Texts (Vietnamese); override per site. Templates: `{current}`, `{name}`, `{hex}`, `{deg}`, `{s}`, `{v}`, `{ratio}`. */
  static labels = {
    input: 'Mã màu',
    /** placeholder of the text input when the `placeholder` attribute is absent (= php Td::COLOR_LABELS) */
    placeholder: '#000000',
    trigger: 'Chọn màu: {current}',
    none: 'chưa chọn',
    panel: 'Bảng chọn màu',
    area: 'Độ bão hoà và độ sáng',
    areaRole: 'vùng chọn màu 2 chiều',
    areaValue: 'Bão hoà {s} %, độ sáng {v} % — {name}, {hex}',
    hue: 'Sắc độ',
    hueValue: '{deg}°, {name}',
    presets: 'Màu có sẵn',
    preset: '{name} {hex}',
    clear: 'Xoá màu',
    eyedropper: 'Lấy màu trên màn hình',
    contrastWhite: 'Chữ trắng',
    contrastBlack: 'Chữ đen',
    pass: 'Đạt AA',
    fail: 'Chưa đạt',
    contrastValue: '{ratio}:1',
  };

  /** Validation texts (Vietnamese); override per site. */
  static messages = {
    valueMissing: 'Vui lòng chọn màu',
    invalid: 'Mã màu không hợp lệ — ví dụ #1d4ed8',
    alpha: 'Không hỗ trợ màu trong suốt',
  };

  /** The 16 default presets (dcms2 parity, lowercase). */
  static defaultPresets = DEFAULT_PRESETS;

  /**
   * Approximate Vietnamese name of `#rrggbb` (screen-reader text, always read with the hex). Override for another
   * language: `TdColorPicker.colorName = (hex) => …`.
   * @type {(hex: string) => string}
   */
  static colorName = colorName;

  static get observedAttributes() {
    return [...super.observedAttributes, 'value', 'label', 'placeholder', 'presets', 'readonly', 'custom', 'contrast',
      'eyedropper', 'error-text', 'aria-label'];
  }

  static get booleanAttributes() { return [...super.booleanAttributes, 'readonly', 'contrast']; }

  static get errorContract() { return true; }

  constructor() {
    super();
    /** @private last valid value ('' = none) */
    this._hex = '';
    /** @private unparsable text: { raw, reason } — the form submits `raw` with badInput */
    this._bad = null;
    /** @private popup state (floats; the hex is only an output) */
    this._hsv = { ...EMPTY_HSV };
    this._valueSet = false;
    /** @private the value of the last `change` (or silent set) */
    this._committed = '';
    /** @private presets property (wins over the attribute); null = use the attribute */
    this._presetsProp = null;
    /** @private warning keys already printed */
    this._warned = new Set();
    this._panel = null;
    this._layer = null;
    this._unbridge = null;
    this._unwatchRef = null;
    this._drag = null;
    this._raf = 0;
    this._eyedrop = null;
    this._openValue = null;
    this._openHsv = null;
    this._onDocDown = (e) => {
      const t = /** @type {Node} */ (e.target);
      if (this._panel && !this.contains(t) && !this._panel.contains(t)) this.close({ focus: false });
    };
    this._onReposition = () => {
      if (this._posRaf) return;
      this._posRaf = requestAnimationFrame(() => {
        this._posRaf = 0;
        this._updatePosition();
      });
    };
  }

  connectedCallback() {
    if (!this._initialized && !this._valueSet) this._assign(this.getAttribute('value') ?? '');
    super.connectedCallback();
    if (!this._committedSet) {
      this._committed = this.value;
      this._committedSet = true;
    }
  }

  disconnectedCallback() {
    this.close({ focus: false });
    super.disconnectedCallback();
  }

  // --- public API ---

  /** @returns {string} `#rrggbb`, `''`, or — while the text is unparsable — that raw text (what the form submits) */
  get value() { return this._bad ? this._bad.raw : this._hex; }

  /** Set the value silently (normalised; unparsable → badInput like typing). */
  set value(v) {
    this._valueSet = true;
    this._assign(v == null ? '' : String(v));
    this._committed = this.value;
    if (this._initialized) this._refresh(true);
  }

  getValue() { return this.value; }

  setValue(v) { this.value = v; }

  /** @returns {boolean} false when `custom="false"` (presets only) */
  get custom() { return !FALSY.has(String(this.getAttribute('custom') ?? '').trim().toLowerCase()); }

  set custom(v) { if (v === false || FALSY.has(String(v).toLowerCase())) this.setAttribute('custom', 'false'); else this.removeAttribute('custom'); }

  /** @returns {boolean} false when `eyedropper="false"` */
  get eyedropper() { return !FALSY.has(String(this.getAttribute('eyedropper') ?? '').trim().toLowerCase()); }

  set eyedropper(v) { if (v === false || FALSY.has(String(v).toLowerCase())) this.setAttribute('eyedropper', 'false'); else this.removeAttribute('eyedropper'); }

  /** @returns {Array<{ value: string, label: string }>} the presets in use (resolved) */
  get presets() { return this._presetItems().map((p) => ({ value: p.hex, label: p.label })); }

  /** An array of `string | { value, label }` (wins over the attribute); a string sets the attribute; null → attribute. */
  set presets(v) {
    if (typeof v === 'string') {
      this._presetsProp = null;
      this.setAttribute('presets', v);
      return;
    }
    this._presetsProp = Array.isArray(v) ? [...v] : null;
    this._warned.delete('presets');
    if (this._panel) this._rebuildPanel();
  }

  /** Open the popup (no-op when disabled / read-only / already open). */
  open() {
    if (this._panel || !this._initialized || !this.isConnected || this._locked()) return;
    const trigger = this._trigger();
    if (!trigger) return;
    this._openValue = this.value;
    this._openHsv = { ...this._hsv };
    const panel = this._buildPanel();
    this._panel = panel;
    document.body.appendChild(panel);
    this._unbridge = bridgeTheme(panel, this);
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-controls', panel.id);
    this._paintPanel();
    this._placePanel();
    panel.setAttribute('data-state', 'open');
    this._layer = registerLayer({
      layer: LAYERS.popover,
      element: panel,
      keyboard: 'boundary',
      onEscape: () => { this._cancel(); return true; },
      onTab: (e) => this._onTab(e),
      anchor: this,
      onCovered: () => this.close({ focus: false }),
    });
    document.addEventListener('pointerdown', this._onDocDown, true);
    window.addEventListener('resize', this._onReposition);
    window.addEventListener('scroll', this._onReposition, true);
    this._unwatchRef = watchReference(trigger, () => this._updatePosition());
    const first = this.custom ? panel.querySelector('.td-color-panel__thumb')
      : (panel.querySelector('.td-color-panel__preset[tabindex="0"]') || panel.querySelector('button:not([hidden])'));
    (first || panel).focus({ preventScroll: true });
  }

  /**
   * Close the popup keeping the value.
   * @param {{ focus?: boolean }} [o] focus = put the focus back on the swatch button when it was inside the popup
   */
  close({ focus = true } = {}) {
    const panel = this._panel;
    if (!panel) return;
    this._endDrag(false);
    if (this._eyedrop) { try { this._eyedrop.abort(); } catch { /* ignore */ } this._eyedrop = null; }
    const hadFocus = panel.contains(document.activeElement);
    this._panel = null;
    if (this._layer) { this._layer.release(); this._layer = null; }
    if (this._unbridge) { this._unbridge(); this._unbridge = null; }
    if (this._unwatchRef) { this._unwatchRef(); this._unwatchRef = null; }
    if (this._posRaf) { cancelAnimationFrame(this._posRaf); this._posRaf = 0; }
    document.removeEventListener('pointerdown', this._onDocDown, true);
    window.removeEventListener('resize', this._onReposition);
    window.removeEventListener('scroll', this._onReposition, true);
    panel.remove();
    const trigger = this._trigger();
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      trigger.removeAttribute('aria-controls');
      if (hadFocus && focus && !trigger.disabled) trigger.focus({ preventScroll: true });
    }
  }

  /** Focus the text input (label click, `el.focus()`). */
  focus(options) {
    const input = this._focusTarget();
    if (input) input.focus(options);
    else super.focus(options);
  }

  // --- value core ---

  /**
   * @private Parse `raw` into the state (no DOM, no event). Valid → `_hex` + HSV (hue kept on grey / black); empty →
   * ''; else the raw text is kept for the form (badInput).
   * @param {string} raw
   */
  _assign(raw) {
    const r = parseColorInput(raw);
    if (r.ok) {
      this._hex = r.hex;
      this._bad = null;
      this._hsv = hsvFromHex(r.hex, this._hsv);
    } else if (r.reason === 'empty') {
      this._hex = '';
      this._bad = null;
    } else {
      this._bad = { raw, reason: r.reason };
    }
  }

  /**
   * @private Push the state into the DOM: text input (when `rewrite`), swatch, buttons, popup, form value.
   * @param {boolean} rewrite
   */
  _refresh(rewrite) {
    const input = this._focusTarget();
    if (input && rewrite && input.value !== this.value) input.value = this.value;
    this._paint();
    this._syncForm();
  }

  /** @private user change: emit `input` when the value differs from `prev`. */
  _changed(prev) {
    if (this.value !== prev) this.emit('input', { value: this.value });
  }

  /** @private commit: `change` once when the (valid) value differs from the last committed one. */
  _commit() {
    if (this._bad) return;
    if (this.value === this._committed) return;
    this._committed = this.value;
    this.emit('change', { value: this.value });
  }

  /**
   * @private A user pick from the popup / a preset / the eyedropper / clear: set + input event (+ change when `commit`).
   * @param {string} hex `#rrggbb` or ''
   * @param {{ commit?: boolean, hsv?: {h:number,s:number,v:number} }} [o]
   */
  _pick(hex, { commit = true, hsv } = {}) {
    const prev = this.value;
    if (hsv) {
      this._hsv = { ...hsv };
      this._hex = hex;
      this._bad = null;
    } else {
      this._assign(hex);
    }
    this._refresh(true);
    this._changed(prev);
    if (commit) this._commit();
  }

  /** @private */
  _locked() {
    return this._effectiveDisabled || this.hasAttribute('readonly');
  }

  // --- render ---

  /** @protected */
  _focusTarget() { return this.querySelector('input.td-color__input'); }

  /** @private */
  _trigger() { return this.querySelector('.td-color__trigger'); }

  /** @private control id: the caller's (SSR markup) or `{host id}-input` */
  _controlId() { return this._ssrControlId || `${this.id}-input`; }

  /** The tree php/td.php prints (without the no-JS attributes); the bind step adds the buttons. */
  render() {
    const id = this.escapeHtml(this._controlId());
    const label = this.getAttribute('label') || '';
    const ph = this.getAttribute('placeholder') || TdColorPicker.labels.placeholder;
    return '<div class="td-color">'
      + (label ? `<label class="td-color__label" for="${id}">${this.escapeHtml(label)}</label>` : '')
      + '<div class="td-color__box"><span class="td-color__swatch" aria-hidden="true"></span>'
      + `<input type="text" class="td-color__input" id="${id}"`
      + INPUT_ATTRS.map(([k, v]) => ` ${k}="${v}"`).join('')
      + (ph ? ` placeholder="${this.escapeHtml(ph)}"` : '')
      + '></div></div>';
  }

  /** Re-render keeping the text being typed + the focused part (label / disabled changes). */
  _doRender() {
    if (this._suppressRender) return;
    const old = this._bound && !this._ssrFreshRender ? this._focusTarget() : null;
    const active = this.ownerDocument.activeElement;
    const role = !this.contains(active) ? null
      : active === old ? 'input' : active?.classList?.contains('td-color__trigger') ? 'trigger' : null;
    const text = old ? old.value : null;
    let sel = null;
    try { if (role === 'input') sel = [old.selectionStart, old.selectionEnd]; } catch { /* ignore */ }
    super._doRender();
    const input = this._focusTarget();
    if (input && text != null) input.value = text;
    if (role === 'input' && input) {
      input.focus({ preventScroll: true });
      try { if (sel) input.setSelectionRange(sel[0], sel[1]); } catch { /* ignore */ }
    } else if (role === 'trigger') {
      this._trigger()?.focus({ preventScroll: true });
    }
  }

  /** @private SSR swatch → wrapped in the trigger button; the clear button after the input (bind step, idempotent). */
  _ensureParts() {
    const box = this.querySelector(':scope > .td-color > .td-color__box');
    const input = this._focusTarget();
    if (!box || !input) return;
    let trigger = this._trigger();
    if (!trigger) {
      trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'td-color__trigger';
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-expanded', 'false');
      const swatch = box.querySelector(':scope > .td-color__swatch') || document.createElement('span');
      swatch.className = 'td-color__swatch';
      swatch.setAttribute('aria-hidden', 'true');
      box.insertBefore(trigger, box.firstChild);
      trigger.appendChild(swatch);
    }
    if (!this.querySelector('.td-color__clear')) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'td-color__clear';
      clear.hidden = true;
      const icon = tdIcon('close', { size: 's' });
      if (icon) clear.appendChild(icon);
      input.after(clear);
    }
  }

  afterRender() {
    const input = this._focusTarget();
    if (!input) return;
    this._bound = true;
    this._ensureParts();
    if (!this._hydrating && input.value !== this.value) input.value = this.value;
    const trigger = this._trigger();
    const clear = this.querySelector('.td-color__clear');
    this._syncDisabled();
    this.listen(input, 'input', (e) => { e.stopPropagation(); this._onInput(input); });
    this.listen(input, 'change', (e) => e.stopPropagation()); // the host fires its own `change` on commit
    this.listen(input, 'blur', () => this._commitText(input));
    this.listen(input, 'keydown', (e) => this._onInputKey(/** @type {KeyboardEvent} */ (e), input));
    if (trigger) {
      this.listen(trigger, 'click', () => (this._panel ? this.close() : this.open()));
      this.listen(trigger, 'keydown', (e) => {
        if (/** @type {KeyboardEvent} */ (e).altKey && /** @type {KeyboardEvent} */ (e).key === 'ArrowDown') {
          e.preventDefault();
          this.open();
        }
      });
    }
    if (clear) {
      this.listen(clear, 'click', () => {
        if (this._locked() || this.hasAttribute('required')) return;
        this._pick('');
        input.focus({ preventScroll: true });
      });
    }
    this._applyName();
    this._paint();
    this._syncForm();
    this._applyErrorState();
  }

  /** @private disabled / readonly / custom onto the parts (in place); a locked host closes its popup. */
  _syncDisabled() {
    const input = this._focusTarget();
    const dis = this._effectiveDisabled;
    if (input) {
      input.disabled = dis;
      input.readOnly = this.hasAttribute('readonly') || !this.custom;
    }
    const trigger = this._trigger();
    if (trigger) trigger.disabled = dis || this.hasAttribute('readonly'); // read-only: the popup never opens
    if (this._locked()) this.close({ focus: false });
  }

  /** @private Accessible name: label → host aria-label → external labels → labels.input. */
  _applyName() {
    const input = this._focusTarget();
    if (!input) return;
    const visible = !!this.getAttribute('label');
    super._applyAccessibleName(input, visible);
    if (!visible && !input.hasAttribute('aria-label') && !input.hasAttribute('aria-labelledby')) {
      input.setAttribute('aria-label', TdColorPicker.labels.input || 'Mã màu');
    }
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized) {
      super.attributeChangedCallback(name, oldVal, newVal);
      return;
    }
    switch (name) {
      case 'value': this.value = newVal ?? ''; return;
      case 'placeholder': {
        const input = this._focusTarget();
        const ph = newVal || TdColorPicker.labels.placeholder;
        if (input) { if (ph) input.setAttribute('placeholder', ph); else input.removeAttribute('placeholder'); }
        return;
      }
      case 'readonly': case 'custom': this._syncDisabled(); this._paint(); if (this._panel) this._rebuildPanel(); return;
      case 'presets': this._warned.delete('presets'); if (this._panel) this._rebuildPanel(); return;
      case 'contrast': case 'eyedropper': if (this._panel) this._rebuildPanel(); return;
      case 'required': this._paint(); this._syncForm(); if (this._panel) this._rebuildPanel(); return;
      case 'aria-label': this._applyName(); return;
      case 'name': return; // ElementInternals submits under the host name
      default: super.attributeChangedCallback(name, oldVal, newVal); // disabled, label (re-render), error-text
    }
  }

  // --- text input ---

  /** @private typing / paste / autofill: parse, never rewrite the text while typing */
  _onInput(input) {
    const prev = this.value;
    this._assign(input.value);
    this._paint();
    this._syncForm();
    if (!this._bad) this._changed(prev);
  }

  /** @private blur / Enter: canonical text + `change` */
  _commitText(input) {
    if (!this._bad && input.value !== this._hex) input.value = this._hex;
    this._paint();
    this._commit();
  }

  /** @private Enter commits (the form still submits — not prevented); Alt+↓ opens the popup */
  _onInputKey(e, input) {
    if (e.isComposing) return;
    if (e.key === 'Enter') this._commitText(input);
    else if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault();
      this.open();
    }
  }

  // --- paint ---

  /** @private swatch, trigger name, clear button, popup */
  _paint() {
    const filled = !this._bad && !!this._hex;
    this._setOwnedStyle('--_td-cp-color', filled && HEX_RE.test(this._hex) ? this._hex : null);
    const swatch = this.querySelector('.td-color__swatch');
    if (swatch) swatch.setAttribute('data-state', this._bad ? 'invalid' : filled ? 'filled' : 'empty');
    const L = TdColorPicker.labels;
    const trigger = this._trigger();
    if (trigger) {
      const current = filled ? `${this._name(this._hex)} ${this._hex}`.trim() : L.none;
      trigger.setAttribute('aria-label', fill(L.trigger, { current }));
    }
    const clear = this.querySelector('.td-color__clear');
    if (clear) {
      clear.setAttribute('aria-label', L.clear);
      clear.hidden = !this.value || this.hasAttribute('required') || this._locked();
    }
    if (this._panel) this._paintPanel();
  }

  /** @private colour name through the (overridable) static hook */
  _name(hex) {
    try { return String(TdColorPicker.colorName(hex) ?? ''); } catch { return ''; }
  }

  /** @protected */
  _syncForm() {
    const v = this.value;
    this._setFormValue(v);
    const input = this._focusTarget() || undefined;
    if (this._bad) {
      this._setValidity({ badInput: true }, this._msg(this._bad.reason === 'alpha' ? 'alpha' : 'invalid'), input);
    } else if (this.hasAttribute('required') && !v) {
      this._setValidity({ valueMissing: true }, this._msg('valueMissing'), input);
    } else {
      this._setValidity({});
    }
  }

  _captureDefaults() {
    const raw = this._ssrDefaults ? this._ssrDefaults.value : (this.getAttribute('value') ?? '');
    const r = parseColorInput(raw);
    this._defaultValue = r.ok ? r.hex : r.reason === 'empty' ? '' : raw;
  }

  _restoreDefaults() {
    this.value = this._defaultValue;
  }

  _restoreState(state) {
    if (typeof state === 'string') this.value = state;
  }

  // --- popup ---

  /** @private resolved presets (property > attribute > defaults), one warning per source when entries are dropped */
  _presetItems() {
    const src = this._presetsProp ?? (this.hasAttribute('presets') ? this.getAttribute('presets') : null);
    const { items, dropped } = parsePresets(src);
    if (dropped && !this._warned.has('presets')) {
      this._warned.add('presets');
      console.warn(`td-color-picker: ${dropped} preset(s) ignored (not a colour, translucent, or over 48).`);
    }
    return items;
  }

  /** @private the popup tree (DOM API: labels via setAttribute / textContent only) */
  _buildPanel() {
    const L = TdColorPicker.labels;
    const make = (tag, cls, attrs = {}) => {
      const el = document.createElement(tag);
      if (cls) el.className = cls;
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return el;
    };
    const panel = make('div', 'td-color-panel td-glass-surface td-glass-surface--strong', {
      role: 'dialog', 'aria-label': L.panel, tabindex: '-1', 'data-state': 'closed',
    });
    panel.id = `${this.id || `td-color-picker-${++panelSeq}`}-panel`;
    if (this.custom) {
      const area = make('div', 'td-color-panel__area');
      const thumb = make('div', 'td-color-panel__thumb', {
        role: 'slider', tabindex: '0', 'aria-roledescription': L.areaRole, 'aria-label': L.area,
        'aria-valuemin': '0', 'aria-valuemax': '100',
      });
      area.appendChild(thumb);
      panel.appendChild(area);
      const row = make('div', 'td-color-panel__row');
      if (this.eyedropper && typeof window !== 'undefined' && 'EyeDropper' in window) {
        const eye = make('button', 'td-color-panel__eyedropper', { type: 'button', 'aria-label': L.eyedropper });
        const icon = tdIcon('pipette', { size: 's' });
        if (icon) eye.appendChild(icon);
        row.appendChild(eye);
      }
      const hue = make('input', 'td-color-panel__hue', { type: 'range', min: '0', max: '359', step: '1', 'aria-label': L.hue });
      row.appendChild(hue);
      panel.appendChild(row);
    }
    if (this.hasAttribute('contrast')) {
      const box = make('div', 'td-color-panel__contrast');
      for (const tone of ['light', 'dark']) {
        const item = make('div', `td-color-panel__pair td-color-panel__pair--${tone}`);
        const sample = make('span', 'td-color-panel__sample', { 'aria-hidden': 'true' });
        sample.textContent = 'Aa';
        const text = make('span', 'td-color-panel__ratio');
        item.append(sample, text);
        box.appendChild(item);
      }
      panel.appendChild(box);
    }
    const items = this._presetItems();
    if (items.length) {
      const grid = make('div', 'td-color-panel__presets', { role: 'group', 'aria-label': L.presets });
      for (const p of items) {
        const b = make('button', 'td-color-panel__preset', { type: 'button', tabindex: '-1', 'aria-pressed': 'false' });
        b.dataset.value = p.hex; // validated #rrggbb
        b.setAttribute('aria-label', p.label || fill(L.preset, { name: this._name(p.hex), hex: p.hex }).trim());
        if (p.label) b.title = p.label;
        setVar(b, '--_td-cp-color', p.hex);
        setVar(b, '--_td-cp-mark', pickPole(p.hex));
        b.appendChild(createCheckMark('sm'));
        grid.appendChild(b);
      }
      panel.appendChild(grid);
    }
    if (!this.hasAttribute('required')) {
      const clear = make('button', 'td-btn td-btn--ghost td-btn--sm td-color-panel__clear', { type: 'button' });
      const lbl = make('span', 'td-btn__label');
      lbl.textContent = L.clear;
      clear.appendChild(lbl);
      panel.appendChild(clear);
    }
    this._bindPanel(panel);
    return panel;
  }

  /** @private rebuild an open popup in place (attribute / presets changed) keeping it open */
  _rebuildPanel() {
    const old = this._panel;
    if (!old) return;
    if (this._locked()) { this.close({ focus: false }); return; }
    const hadFocus = old.contains(document.activeElement);
    const next = this._buildPanel();
    for (const name of [...old.style]) if (name.startsWith('--') && !name.startsWith('--_td-cp-')) next.style.setProperty(name, old.style.getPropertyValue(name));
    if (old.hasAttribute('data-td-theme')) next.setAttribute('data-td-theme', old.getAttribute('data-td-theme'));
    next.setAttribute('data-state', 'open');
    old.replaceWith(next);
    this._panel = next;
    if (this._layer) { this._layer.release(); }
    this._layer = registerLayer({
      layer: LAYERS.popover, element: next, keyboard: 'boundary',
      onEscape: () => { this._cancel(); return true; }, onTab: (e) => this._onTab(e), anchor: this,
      onCovered: () => this.close({ focus: false }),
    });
    this._paintPanel();
    this._placePanel();
    if (hadFocus) (next.querySelector('.td-color-panel__thumb, .td-color-panel__preset[tabindex="0"]') || next).focus({ preventScroll: true });
  }

  /** @private listeners of a popup tree (removed with it) */
  _bindPanel(panel) {
    // native events of the popup controls never reach the page
    panel.addEventListener('input', (e) => e.stopPropagation());
    panel.addEventListener('change', (e) => e.stopPropagation());
    const area = panel.querySelector('.td-color-panel__area');
    const thumb = panel.querySelector('.td-color-panel__thumb');
    if (area && thumb) {
      area.addEventListener('pointerdown', (e) => this._onAreaDown(/** @type {PointerEvent} */ (e), area, thumb));
      area.addEventListener('pointermove', (e) => this._onAreaMove(/** @type {PointerEvent} */ (e)));
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        area.addEventListener(t, (e) => this._onAreaEnd(/** @type {PointerEvent} */ (e)));
      }
      thumb.addEventListener('keydown', (e) => this._onAreaKey(/** @type {KeyboardEvent} */ (e)));
    }
    const hue = panel.querySelector('.td-color-panel__hue');
    if (hue) {
      hue.addEventListener('input', () => {
        const h = Math.min(359, Math.max(0, Number(hue.value) || 0));
        const hsv = { ...this._hsv, h };
        this._pick(hexFromHsv(hsv), { commit: false, hsv });
      });
      hue.addEventListener('change', () => this._commit());
    }
    const eye = panel.querySelector('.td-color-panel__eyedropper');
    if (eye) eye.addEventListener('click', () => this._eyedropper());
    const grid = panel.querySelector('.td-color-panel__presets');
    if (grid) {
      grid.addEventListener('click', (e) => {
        const b = /** @type {Element} */ (e.target).closest?.('.td-color-panel__preset');
        if (!b || !grid.contains(b)) return;
        const hex = b.getAttribute('data-value') || '';
        if (!HEX_RE.test(hex)) return;
        this._pick(hex);
        this.close();
      });
      grid.addEventListener('keydown', (e) => this._onPresetKey(/** @type {KeyboardEvent} */ (e), grid));
    }
    const clear = panel.querySelector('.td-color-panel__clear');
    if (clear) {
      clear.addEventListener('click', () => {
        this._pick('');
        this.close();
      });
    }
  }

  /** @private popup state → CSSOM (validated hex / clamped numbers only) + ARIA */
  _paintPanel() {
    const panel = this._panel;
    if (!panel) return;
    const L = TdColorPicker.labels;
    const filled = !this._bad && !!this._hex;
    const hsv = this._hsv;
    const shown = hexFromHsv(hsv);
    setVar(panel, '--_td-cp-hue', hueHex(hsv.h));
    setVar(panel, '--_td-cp-x', hsv.s);
    setVar(panel, '--_td-cp-y', hsv.v);
    setVar(panel, '--_td-cp-color', filled ? this._hex : shown);
    const thumb = panel.querySelector('.td-color-panel__thumb');
    if (thumb) {
      thumb.setAttribute('aria-valuenow', String(Math.round(hsv.s * 100)));
      thumb.setAttribute('aria-valuetext', areaValueText(hsv, shown, this._name(shown), L.areaValue));
    }
    const hue = panel.querySelector('.td-color-panel__hue');
    if (hue) {
      const deg = Math.round(hsv.h) % 360;
      if (hue.value !== String(deg)) hue.value = String(deg);
      hue.setAttribute('aria-valuetext', fill(L.hueValue, { deg, name: this._name(hueHex(hsv.h)) }));
    }
    const presets = [...panel.querySelectorAll('.td-color-panel__preset')];
    let roving = null;
    for (const b of presets) {
      const on = filled && b.getAttribute('data-value') === this._hex;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) roving = b;
    }
    const keep = roving || presets.find((b) => b.tabIndex === 0) || presets[0];
    for (const b of presets) b.tabIndex = b === keep ? 0 : -1;
    const pairs = panel.querySelectorAll('.td-color-panel__pair');
    for (const pair of pairs) {
      const ratioEl = pair.querySelector('.td-color-panel__ratio');
      const light = pair.classList.contains('td-color-panel__pair--light');
      if (!ratioEl) continue;
      if (!filled) { ratioEl.textContent = `${light ? L.contrastWhite : L.contrastBlack}: —`; continue; }
      const r = contrast(light ? '#ffffff' : '#000000', this._hex);
      const ratio = (Math.floor(r * 10) / 10).toFixed(1);
      ratioEl.textContent = `${light ? L.contrastWhite : L.contrastBlack}: ${fill(L.contrastValue, { ratio })} · ${r >= 4.5 ? L.pass : L.fail}`;
    }
  }

  /** @private */
  _placePanel() {
    const trigger = this._trigger();
    if (!this._panel || !trigger) return;
    const panel = this._panel;
    const { side, top } = placeFloating(trigger, panel, { width: 'auto', align: 'start' });
    panel.setAttribute('data-placement', side);
    // neither side has room (short landscape phone): keep the whole popup inside the viewport (it may cover the field)
    const box = viewportBox();
    const h = panel.offsetHeight;
    const clamped = Math.max(box.top + 8, Math.min(top, box.bottom - h - 8));
    if (clamped !== top) panel.style.setProperty('top', `${clamped}px`);
  }

  /** @private scroll / resize / reference change: close once the swatch button is hidden, else follow it */
  _updatePosition() {
    if (!this._panel) return;
    const trigger = this._trigger();
    if (!trigger || !trigger.isConnected || isReferenceHidden(trigger.getBoundingClientRect(), trigger)) {
      this.close({ focus: false });
      return;
    }
    this._placePanel();
  }

  /** @private Escape: back to the value at opening (one input + one change when it differs) + focus on the swatch */
  _cancel() {
    const prev = this.value;
    if (this._openValue != null && prev !== this._openValue) {
      this._assign(this._openValue);
      if (this._openHsv) this._hsv = { ...this._openHsv };
      this._refresh(true);
      this._changed(prev);
      this._commit();
    }
    this.close();
  }

  /** @private Tab / Shift+Tab cycle inside the popup; from the text input (popup open) Tab leaves + closes */
  _onTab(e) {
    const panel = this._panel;
    if (!panel) return 'pass';
    if (!panel.contains(document.activeElement)) {
      this.close({ focus: false });
      return 'pass';
    }
    const nodes = focusablesIn(panel);
    if (!nodes.length) { e.preventDefault(); return 'handled'; }
    const i = nodes.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    const next = i < 0 ? 0 : (i + (e.shiftKey ? -1 : 1) + nodes.length) % nodes.length;
    e.preventDefault();
    nodes[next].focus({ preventScroll: true });
    return 'handled';
  }

  // --- area: pointer + keyboard ---

  /** @private touch / pen / primary mouse button: jump to the point at once + capture (tap-to-pick) */
  _onAreaDown(e, area, thumb) {
    if (this._locked() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault(); // no text selection / no focus on the area: the thumb takes it
    thumb.focus({ preventScroll: true });
    try { area.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this._drag = { id: e.pointerId, area, start: this.value, point: null };
    this._moveTo(e.clientX, e.clientY);
  }

  /** @private */
  _onAreaMove(e) {
    const d = this._drag;
    if (!d || e.pointerId !== d.id) return;
    d.point = [e.clientX, e.clientY];
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      const p = this._drag?.point;
      if (!p) return;
      this._drag.point = null;
      this._moveTo(p[0], p[1]);
    });
  }

  /** @private pointerup / pointercancel / lostpointercapture → one `change` (cancel keeps the value reached) */
  _onAreaEnd(e) {
    const d = this._drag;
    if (!d || e.pointerId !== d.id) return;
    if (e.type === 'pointerup') d.point = [e.clientX, e.clientY];
    this._endDrag(true);
  }

  /** @private the ONE clean-up of a drag: flush the last point, release the capture, commit */
  _endDrag(commit) {
    const d = this._drag;
    if (!d) return;
    this._drag = null;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    if (d.point && commit) this._moveTo(d.point[0], d.point[1]);
    try { if (d.area.hasPointerCapture?.(d.id)) d.area.releasePointerCapture(d.id); } catch { /* ignore */ }
    if (commit) this._commit();
  }

  /** @private */
  _moveTo(x, y) {
    const area = this._panel?.querySelector('.td-color-panel__area');
    if (!area) return;
    const { s, v } = areaFromPoint(area.getBoundingClientRect(), x, y);
    const hsv = { ...this._hsv, s, v };
    this._pick(hexFromHsv(hsv), { commit: false, hsv });
  }

  /** @private arrows / Shift / PageUp / PageDown / Home / End — each step commits (like a native range) */
  _onAreaKey(e) {
    if (this._locked()) return;
    const next = stepArea(this._hsv, e.key, e.shiftKey);
    if (!next) return;
    e.preventDefault();
    this._pick(hexFromHsv(next), { hsv: next });
  }

  /** @private roving tabindex over the preset grid: arrows (rows measured from the layout), Home / End */
  _onPresetKey(e, grid) {
    const items = [...grid.querySelectorAll('.td-color-panel__preset')];
    const i = items.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    if (i < 0) return;
    const top = items[0].offsetTop;
    let cols = items.findIndex((b) => b.offsetTop !== top);
    if (cols < 0) cols = items.length;
    let j = i;
    switch (e.key) {
      case 'ArrowRight': j = Math.min(items.length - 1, i + 1); break;
      case 'ArrowLeft': j = Math.max(0, i - 1); break;
      case 'ArrowDown': j = i + cols < items.length ? i + cols : i; break;
      case 'ArrowUp': j = i - cols >= 0 ? i - cols : i; break;
      case 'Home': j = 0; break;
      case 'End': j = items.length - 1; break;
      default: return;
    }
    e.preventDefault();
    for (const b of items) b.tabIndex = -1;
    items[j].tabIndex = 0;
    items[j].focus({ preventScroll: true });
  }

  /** @private EyeDropper (Chromium desktop): the result goes through parseColorInput — never trusted as is */
  async _eyedropper() {
    if (this._locked() || typeof window === 'undefined' || !('EyeDropper' in window)) return;
    if (this._eyedrop) { try { this._eyedrop.abort(); } catch { /* ignore */ } }
    const ctl = new AbortController();
    this._eyedrop = ctl;
    let res = null;
    try {
      res = await new window.EyeDropper().open({ signal: ctl.signal });
    } catch {
      res = null; // AbortError (Escape / closed) or refused: nothing happens
    }
    if (this._eyedrop !== ctl) return;
    this._eyedrop = null;
    if (ctl.signal.aborted || !res) return;
    const r = parseColorInput(typeof res.sRGBHex === 'string' ? res.sRGBHex : '');
    if (!r.ok) return;
    this._pick(r.hex);
  }

  // --- SSR hydrate (ADR 0012, contract color-picker@1) ---

  /**
   * Marker `color-picker@<n>` + the input at its skeleton slot → capture its state; adopt the markup only when the
   * schema is 1, it is exactly render()'s (+ the no-JS name / value / required / pattern / title), its form attributes
   * agree with the host and it passes the subtree scan + skeleton; else safe render at once + restore.
   * @returns {boolean}
   */
  canHydrate() {
    const m = ssrMarker(this);
    if (!m || m.name !== 'color-picker') return false;
    const control = this._ssrStateSource();
    if (!control) return this._ssrClean(false);
    this._ssrDefaults = { value: this.getAttribute('value') ?? '' };
    this._ssrControlId = control.id || null;
    const matches = m.schema === 1 && this._markupMatches(true)
      && this._ssrFormAttrsAgree(control, [['name', 'name'], ['required', 'required'], ['disabled', 'disabled'], ['readonly', 'readonly']],
        ['required', 'disabled', 'readonly']);
    return this._ssrDecide(control, matches, false);
  }

  /** A moved element re-renders (the state lives on the host; the typed text + focus are kept by _doRender). */
  canRebind() { return false; }

  /** @protected `div.td-color` > `div.td-color__box` > `input.td-color__input` — each unique at its level. */
  _ssrSlotControl() {
    const one = (parent, tag, cls) => {
      const c = [...parent.children].filter((e) => e.localName === tag && e.classList.contains(cls));
      return c.length === 1 ? c[0] : null;
    };
    const root = one(this, 'div', 'td-color');
    const box = root && one(root, 'div', 'td-color__box');
    return box ? one(box, 'input', 'td-color__input') : null;
  }

  /** @protected */
  _ssrPlausible() { return 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])'; }

  /** @protected the text in the input (typed before the upgrade) + selection + focus; an early `value` property wins */
  _ssrCapture(control, live) {
    const focused = control === control.ownerDocument.activeElement;
    let selection = null;
    try {
      if (control.selectionStart != null) selection = [control.selectionStart, control.selectionEnd, control.selectionDirection || 'none'];
    } catch { /* no selection API */ }
    const early = !live && this._earlyProps?.has('value');
    return { text: early ? this.value : String(control.value), selection, focused };
  }

  hydrateExisting() {
    const control = /** @type {HTMLInputElement} */ (this._ssrControl);
    const state = this._ssrState;
    this._assign(state.text);
    control.value = state.focused || this._bad ? state.text : this.value; // dirty: removing `value` below changes nothing
    this._committed = this.value;
    this._committedSet = true;
    const note = [...this.children].find(ssrIsErrorNote);
    if (note) this._errorNote = note;
    const own = `${this.id}-error`;
    const rest = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter((t) => t && t !== own);
    if (rest.length) control.setAttribute('aria-describedby', rest.join(' '));
    else control.removeAttribute('aria-describedby');
    this._syncForm(); // ElementInternals FIRST…
    for (const a of SSR_ONLY) control.removeAttribute(a); // …then the no-JS attributes: FormData has ONE entry
    this._ssrRetargetLabels(control);
    this._ssrControl = null;
    this._ssrState = null;
    this._hydrating = true;
    queueMicrotask(() => { this._hydrating = false; });
  }

  /** @protected after refused markup was replaced: the typed text + the focus */
  _restoreSsrState(state) {
    const input = this._focusTarget();
    if (state.clean) {
      if (state.refocus && input) input.focus({ preventScroll: true });
      return;
    }
    this._assign(state.text);
    this._committed = this.value;
    if (input) input.value = state.refocus || this._bad ? state.text : this.value;
    this._paint();
    this._syncForm();
    if (state.refocus && input) {
      input.focus({ preventScroll: true });
      if (state.selection) {
        try { input.setSelectionRange(...state.selection); } catch { /* ignore */ }
      }
    }
  }

  /** @protected `div.td-color` > [label] + `div.td-color__box` > [span.td-color__swatch, input] — then at most the error note */
  _ssrSkeletonOk() {
    const kids = ssrContentNodes(this);
    if (!kids.length || kids.length > 2 || kids.some((n) => n.nodeType !== 1) || (kids[1] && !ssrIsErrorNote(kids[1]))) return false;
    const root = kids[0];
    if (root.localName !== 'div' || ssrClassKey(root) !== 'td-color') return false;
    const parts = ssrContentNodes(root);
    if (parts.some((n) => n.nodeType !== 1) || parts.length < 1 || parts.length > 2) return false;
    if (parts.length === 2 && (parts[0].localName !== 'label' || parts[0].children.length)) return false;
    const box = parts[parts.length - 1];
    if (box.localName !== 'div' || ssrClassKey(box) !== 'td-color__box') return false;
    const inner = ssrContentNodes(box);
    return inner.length === 2 && inner[0].nodeType === 1 && inner[0].localName === 'span'
      && ssrClassKey(inner[0]) === 'td-color__swatch' && inner[0].children.length === 0 && inner[1] === this._ssrControl;
  }

  /**
   * @private Exactly render()'s tree: wrapper, label, box, swatch, the input (type text, id, fixed attributes,
   * placeholder as render(); allowlist; `first` = the no-JS name / value / required / pattern / title may be there —
   * pattern only the no-JS one); the error note there exactly when an error shows.
   */
  _markupMatches(first) {
    const kids = ssrContentNodes(this);
    if (!kids.length || kids.length > 2 || (kids.length === 2 && !ssrIsErrorNote(kids[1]))) return false;
    if ((kids.length === 2) !== !!this.errorMessage) return false;
    const tpl = document.createElement('template');
    tpl.innerHTML = this.render();
    const want = tpl.content.firstElementChild;
    const root = kids[0];
    if (root.nodeType !== 1 || root.localName !== 'div' || !ssrSameAttrs(root, want)) return false;
    const have = ssrContentNodes(root);
    const need = [...want.children];
    if (have.length !== need.length || have.some((n) => n.nodeType !== 1)) return false;
    return need.every((w, i) => (w.localName === 'label' ? ssrSamePart(have[i], w) : this._ssrBoxOk(have[i], w, first)));
  }

  /** @private the box: the swatch exactly, then the input */
  _ssrBoxOk(box, want, first) {
    if (!box || box.localName !== 'div' || !ssrSameAttrs(box, want)) return false;
    const parts = ssrContentNodes(box);
    const [wSwatch, wInput] = [...want.children];
    if (parts.length !== 2 || parts.some((n) => n.nodeType !== 1)) return false;
    if (!ssrSamePart(parts[0], wSwatch)) return false;
    const c = parts[1];
    if (c.localName !== 'input' || c.getAttribute('type') !== 'text' || ssrClassKey(c) !== 'td-color__input' || c.id !== wInput.id) return false;
    for (const a of wInput.attributes) {
      if (a.name === 'class' || a.name === 'id' || a.name === 'type') continue;
      if (c.getAttribute(a.name) !== a.value) return false;
    }
    if (c.hasAttribute('placeholder') !== wInput.hasAttribute('placeholder')) return false;
    if (first && c.hasAttribute('pattern') && c.getAttribute('pattern') !== SSR_PATTERN) return false;
    const ok = (n) => (SSR_CONTROL_ATTRS.has(n) && n !== 'checked' && (first || !SSR_ONLY.includes(n))) || SSR_ARIA_DATA.test(n);
    return [...c.attributes].every((a) => ok(a.name));
  }
}

if (!customElements.get('td-color-picker')) {
  customElements.define('td-color-picker', TdColorPicker);
}
