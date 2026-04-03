/**
 * TdModalStackManager
 * Manages z-index stacking and backdrop opacity for multiple modals.
 *
 * Features:
 * - Automatic z-index calculation for stacked modals
 * - Backdrop opacity management
 * - Body scroll lock/unlock
 * - Modal ID generation
 *
 * Ported from DCMS ModalStackManager — standalone utility class (no TdBaseElement).
 */

export class TdModalStackManager {
  static stack = [];
  static BASE_Z_INDEX = 9999;
  static Z_INDEX_INCREMENT = 100;
  static BACKDROP_BASE_OPACITY = 0.5;
  static BACKDROP_OPACITY_INCREMENT = 0.05;

  /**
   * Generate unique modal ID
   * @returns {string}
   */
  static generateId() {
    return 'td-modal-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Push modal to stack
   * @param {Object} modalInstance - Modal instance object
   * @returns {string} Modal ID
   */
  static push(modalInstance) {
    const stackSize = this.stack.length;
    const zIndex = this.BASE_Z_INDEX + (stackSize * this.Z_INDEX_INCREMENT);
    const backdropOpacity = Math.min(
      this.BACKDROP_BASE_OPACITY + (stackSize * this.BACKDROP_OPACITY_INCREMENT),
      0.8
    );

    modalInstance.zIndex = zIndex;
    modalInstance.backdropOpacity = backdropOpacity;
    modalInstance.stackIndex = stackSize;

    if (!modalInstance.id) {
      modalInstance.id = this.generateId();
    }

    this.stack.push(modalInstance);

    // Apply z-index to modal element
    if (modalInstance.element) {
      modalInstance.element.style.zIndex = zIndex.toString();

      // Apply backdrop opacity if backdrop exists
      const backdrop = modalInstance.element.querySelector('.td-modal-backdrop');
      if (backdrop) {
        backdrop.style.opacity = backdropOpacity.toString();
      }
    }

    // Lock body scroll if first modal
    if (stackSize === 0) {
      document.body.style.overflow = 'hidden';
    }

    return modalInstance.id;
  }

  /**
   * Pop modal from stack (close top modal)
   * @returns {Object|null} Removed modal instance or null
   */
  static pop() {
    if (this.stack.length === 0) return null;

    const removed = this.stack.pop();

    // Unlock body scroll if no modals left
    if (this.stack.length === 0) {
      document.body.style.overflow = '';
    }

    return removed;
  }

  /**
   * Get top modal (current active modal)
   * @returns {Object|null} Top modal instance or null
   */
  static getTop() {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
  }

  /**
   * Get stack size
   * @returns {number} Number of modals in stack
   */
  static getStackSize() {
    return this.stack.length;
  }

  /**
   * Remove modal by ID from stack
   * @param {string} modalId - Modal ID to remove
   * @returns {Object|null} Removed modal instance or null
   */
  static removeById(modalId) {
    const index = this.stack.findIndex(m => m.id === modalId);
    if (index !== -1) {
      const removed = this.stack.splice(index, 1)[0];

      // Recalculate z-index for remaining modals
      this.stack.forEach((modal, idx) => {
        modal.stackIndex = idx;
        modal.zIndex = this.BASE_Z_INDEX + (idx * this.Z_INDEX_INCREMENT);
        modal.backdropOpacity = Math.min(
          this.BACKDROP_BASE_OPACITY + (idx * this.BACKDROP_OPACITY_INCREMENT),
          0.8
        );

        if (modal.element) {
          modal.element.style.zIndex = modal.zIndex.toString();
          const backdrop = modal.element.querySelector('.td-modal-backdrop');
          if (backdrop) {
            backdrop.style.opacity = modal.backdropOpacity.toString();
          }
        }
      });

      // Unlock body scroll if no modals left
      if (this.stack.length === 0) {
        document.body.style.overflow = '';
      }

      return removed;
    }
    return null;
  }

  /**
   * Close all modals with exit animation
   */
  static closeAll() {
    // Close from top to bottom with exit animation
    while (this.stack.length > 0) {
      const modal = this.pop();
      if (modal && modal.element) {
        const contentEl = modal.element.querySelector('.td-modal-content');
        const backdrop = modal.element.querySelector('.td-modal-backdrop');

        if (contentEl) {
          contentEl.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
          contentEl.style.opacity = '0';
          contentEl.style.transform = 'scale(0.95)';
        }
        if (backdrop) {
          backdrop.style.transition = 'opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
          backdrop.style.opacity = '0';
        }

        // Remove from DOM after animation
        const el = modal.element;
        setTimeout(() => {
          if (el && el.parentNode) {
            el.remove();
          }
        }, 200);
      }
      if (modal && modal.onClose) {
        modal.onClose();
      }
    }
    document.body.style.overflow = '';
  }

  /**
   * Ensure body scroll state is consistent with stack.
   * Call when stack might be desync (e.g., after error during modal lifecycle).
   */
  static ensureScrollState() {
    if (this.stack.length === 0 && document.body.style.overflow === 'hidden') {
      console.warn('TdModalStack: scroll lock desync detected, resetting');
      document.body.style.overflow = '';
    }
  }
}
