/**
 * TdModalStackManager — bookkeeping for stacked TdModal dialogs (static, no TdBaseElement).
 *
 * - z-index comes from the token `--td-z-modal` (components/modal.css); every modal shares it and later modals
 *   stack by DOM order (plan v0.9.0 D5). `BASE_Z_INDEX` is an OPT-IN override: when a consumer sets it to a number,
 *   each root gets an inline `z-index` (CSSOM, CSP-allowed) of `BASE + i·INCREMENT` and one console warning points to
 *   the `--td-z-*` token set (override the set, not one layer).
 * - `instance.zIndex / backdropOpacity / stackIndex` are still computed (read-only compatibility); the backdrop
 *   opacity is no longer written (the scrim is `--td-glass-scrim`).
 * - Every non-top root carries `[data-covered]` (CSS turns its glass dialog solid — "no glass on glass", D20).
 * - One page scroll lease (utils/scroll-lock.js) while the stack is non-empty.
 * - `closeAll()` delegates to each instance's `close()` (TdModal instances), so focus, layer leases and `onClose`
 *   run exactly once per dialog.
 */

import { lockScroll } from '../utils/scroll-lock.js';
import { LAYERS } from '../utils/layers.js';

export class TdModalStackManager {
  static stack = [];
  /** @type {number|null} opt-in inline z-index base (null = use the --td-z-modal token) */
  static BASE_Z_INDEX = null;
  static Z_INDEX_INCREMENT = 100;
  static BACKDROP_BASE_OPACITY = 0.5;
  static BACKDROP_OPACITY_INCREMENT = 0.05;
  /** @type {(() => void)|null} scroll-lock lease held while the stack is non-empty */
  static _releaseScroll = null;
  /** @private one warning per page for the BASE_Z_INDEX override */
  static _warnedZ = false;

  /** @private */
  static _syncScrollLock() {
    if (this.stack.length > 0 && !this._releaseScroll) {
      this._releaseScroll = lockScroll();
    } else if (this.stack.length === 0 && this._releaseScroll) {
      this._releaseScroll();
      this._releaseScroll = null;
    }
  }

  /** @private numeric override base, or null */
  static _zBase() {
    const b = this.BASE_Z_INDEX;
    return typeof b === 'number' && Number.isFinite(b) ? b : null;
  }

  /** @private recompute compat numbers, inline z (override only) and [data-covered] for the whole stack */
  static _sync() {
    const base = this._zBase();
    if (base !== null && this.stack.length && !this._warnedZ) {
      this._warnedZ = true;
      console.warn('TdModalStackManager.BASE_Z_INDEX is deprecated: modals use the --td-z-modal token. '
        + 'Sites with fixed chrome above it should override the whole --td-z-* set instead.');
    }
    const last = this.stack.length - 1;
    this.stack.forEach((m, i) => {
      m.stackIndex = i;
      m.zIndex = (base !== null ? base : LAYERS.modal) + (base !== null ? i * this.Z_INDEX_INCREMENT : 0);
      m.backdropOpacity = Math.min(this.BACKDROP_BASE_OPACITY + i * this.BACKDROP_OPACITY_INCREMENT, 0.8);
      const el = m.element;
      if (!el || typeof el.setAttribute !== 'function') return;
      if (base !== null) el.style.zIndex = String(m.zIndex);
      if (i < last) el.setAttribute('data-covered', '');
      else el.removeAttribute('data-covered');
    });
  }

  /**
   * Generate a unique modal id.
   * @returns {string}
   */
  static generateId() {
    return 'td-modal-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
  }

  /**
   * Push a modal instance on top of the stack.
   * @param {{ id?: string, element?: HTMLElement }} modalInstance
   * @returns {string} modal id
   */
  static push(modalInstance) {
    if (!modalInstance.id) modalInstance.id = this.generateId();
    this.stack.push(modalInstance);
    this._sync();
    this._syncScrollLock();
    return modalInstance.id;
  }

  /**
   * Pop the top instance (bookkeeping only — does not close it).
   * @returns {Object|null}
   */
  static pop() {
    if (this.stack.length === 0) return null;
    const removed = this.stack.pop();
    if (removed && removed.element && typeof removed.element.removeAttribute === 'function') {
      removed.element.removeAttribute('data-covered');
    }
    this._sync();
    this._syncScrollLock();
    return removed;
  }

  /** @returns {Object|null} top modal instance */
  static getTop() {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
  }

  /** @returns {number} */
  static getStackSize() {
    return this.stack.length;
  }

  /**
   * Remove an instance by id (bookkeeping only — TdModal.closeById does the closing).
   * @param {string} modalId
   * @returns {Object|null}
   */
  static removeById(modalId) {
    const index = this.stack.findIndex((m) => m.id === modalId);
    if (index === -1) return null;
    const removed = this.stack.splice(index, 1)[0];
    if (removed && removed.element && typeof removed.element.removeAttribute === 'function') {
      removed.element.removeAttribute('data-covered');
    }
    this._sync();
    this._syncScrollLock();
    return removed;
  }

  /** Close every modal, top first. TdModal instances close through their own `close()`. */
  static closeAll() {
    let guard = this.stack.length + 1;
    while (this.stack.length > 0 && guard-- > 0) {
      const top = this.getTop();
      if (top && typeof top.close === 'function') {
        try { top.close(); } catch (err) { console.error(err); }
      }
      if (this.getTop() === top) { // plain instance (or a close() that did not unregister): legacy path
        this.pop();
        const el = top && top.element;
        if (el && el.parentNode) el.remove();
        if (top && typeof top.onClose === 'function') {
          try { top.onClose(); } catch (err) { console.error(err); }
        }
      }
    }
    this._syncScrollLock();
  }

  /** Re-sync the scroll lease with the stack (after an error during a modal lifecycle). */
  static ensureScrollState() {
    this._syncScrollLock();
  }
}
