/**
 * Clipped-value title (v0.34.0, plan QĐ 11) — INTERNAL helper shared by td-dropdown, td-tree-select and
 * td-datetime-picker (not a package export). The element that shows the selected value gets `title` = the full value
 * while its text is cut (…); the title is removed when the text fits, the placeholder is shown or the value is empty.
 *
 * One ResizeObserver per watcher (re-checks on resize, no polling). A value change re-checks in the NEXT frame (one per
 * change, coalesced) — never a synchronous layout read during render / setValue (that started style transitions from a
 * stale state, e.g. the datetime error border).
 */

/**
 * The text an element displays as its value: '' for the placeholder, and for an `<input>` while it is open for typing.
 * @param {{ localName?: string, value?: string, textContent?: string|null, hasAttribute?: (n: string) => boolean }} el
 * @param {{ open?: boolean }} [opts]
 * @returns {string}
 */
export function displayedValueText(el, { open = false } = {}) {
  if (!el) return '';
  if (el.localName === 'input') return open ? '' : String(el.value || '');
  return el.hasAttribute && el.hasAttribute('data-placeholder') ? '' : String(el.textContent || '');
}

/**
 * Set / remove `title` on `el`: the full `text` only while it is clipped (`scrollWidth > clientWidth`).
 * @param {{ scrollWidth: number, clientWidth: number, getAttribute: (n: string) => string|null,
 *   setAttribute: (n: string, v: string) => void, removeAttribute: (n: string) => void,
 *   hasAttribute: (n: string) => boolean }} el
 * @param {string} text
 */
export function applyClippedTitle(el, text) {
  if (text && el.scrollWidth > el.clientWidth) {
    if (el.getAttribute('title') !== text) el.setAttribute('title', text);
  } else if (el.hasAttribute('title')) {
    el.removeAttribute('title');
  }
}

/** Watches one value element at a time; `textOf(el)` returns its displayed value text. */
export class ValueTitleWatcher {
  /** @param {(el: Element) => string} textOf */
  constructor(textOf) {
    this._textOf = textOf;
    /** @type {Element|null} */
    this.el = null;
    this._raf = 0;
    this._ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.sync()) : null;
  }

  /** Observe `el` (its initial ResizeObserver notification, after layout, does the first check). */
  watch(el) {
    if (el === this.el) return;
    if (this.el && this._ro) this._ro.unobserve(this.el);
    this.el = el;
    if (el && this._ro) this._ro.observe(el);
  }

  /** The value changed: re-check in the next frame (coalesced). No-op without ResizeObserver. */
  schedule() {
    if (!this._ro || this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this.sync();
    });
  }

  /** Check now. */
  sync() {
    const el = this.el;
    if (!el || !el.isConnected) return;
    applyClippedTitle(/** @type {any} */ (el), this._textOf(el));
  }

  /** Disconnect (component disconnect). */
  destroy() {
    if (this._ro) this._ro.disconnect();
    if (this._raf) cancelAnimationFrame(this._raf);
    this._ro = null;
    this._raf = 0;
    this.el = null;
  }
}
