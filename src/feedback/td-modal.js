/**
 * TdModal
 * Universal Modal Component with Tailwind CSS.
 * All modals are stacked modals with their own DOM elements.
 * Single unified API for all modal operations.
 *
 * Features:
 * - Stacked modals with z-index management
 * - Full viewport mode support
 * - Loading modals (non-closable)
 * - Confirm, success, error, info dialogs
 * - Promise-based API
 * - Focus trap (Tab wrapping within modal)
 * - Entrance/exit animation (scale + opacity via rAF)
 * - Glass morphism styling
 *
 * Ported from DCMS Modal — standalone utility class (no TdBaseElement).
 *
 * @example
 * // Simple modal
 * const id = TdModal.show({ title: 'Hello', body: '<p>Content</p>' });
 *
 * // Confirm dialog (Promise-based)
 * const ok = await TdModal.confirm({ title: 'Delete?', message: 'Are you sure?' });
 *
 * // Loading modal
 * const loadId = TdModal.loading('Processing...');
 * // ... later
 * TdModal.closeById(loadId);
 */

import { TdModalStackManager } from './td-modal-stack.js';
import { escapeHtml } from '../utils/escape.js';

export class TdModal {
  static _focusTrapHandlers = new Map();

  /**
   * Create a new modal DOM element
   * @private
   * @returns {HTMLElement} Modal container element
   */
  static _createModalElement() {
    const modalId = TdModalStackManager.generateId();
    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'fixed inset-0 hidden';

    modal.innerHTML = `
      <!-- Backdrop -->
      <div class="td-modal-backdrop fixed inset-0 bg-black/25 transition-opacity"></div>

      <!-- Modal Container -->
      <div class="fixed inset-0 overflow-y-auto">
        <div class="flex min-h-full items-end sm:items-center justify-center p-0 sm:p-4">
          <!-- Modal Content -->
          <div class="td-modal-content bg-white/[0.9] rounded-t-3xl sm:rounded-[20px] border border-white/50 max-w-lg w-full transform transition-all" style="box-shadow: 0 24px 80px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.5); backdrop-filter: blur(24px) saturate(160%); -webkit-backdrop-filter: blur(24px) saturate(160%);">
            <!-- Header -->
            <div class="td-modal-header px-4 sm:px-6 py-3 sm:py-4 border-b border-black/[0.06] flex items-center justify-between">
              <h3 class="td-modal-title text-lg sm:text-xl font-bold text-gray-900"></h3>
              <button type="button" class="td-modal-close text-gray-400 hover:text-gray-600 transition-colors p-1">
                <svg class="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            <!-- Body -->
            <div class="td-modal-body px-4 sm:px-6 py-4 max-h-[60vh] sm:max-h-[70vh] overflow-y-auto text-gray-900"></div>

            <!-- Footer -->
            <div class="td-modal-footer px-4 sm:px-6 py-3 sm:py-4 border-t border-black/[0.06] flex flex-row justify-end gap-2"></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Setup event listeners
    const backdrop = modal.querySelector('.td-modal-backdrop');
    const closeBtn = modal.querySelector('.td-modal-close');

    backdrop.addEventListener('click', () => {
      TdModal.closeById(modalId);
    });

    closeBtn.addEventListener('click', () => {
      TdModal.closeById(modalId);
    });

    return modal;
  }

  /**
   * Show modal with content
   * @param {Object} options - Modal configuration
   * @param {string} [options.title='Modal'] - Modal title
   * @param {string|HTMLElement} [options.body=''] - Body content (HTML string or element)
   * @param {HTMLElement[]|HTMLElement|null} [options.footer=null] - Footer buttons
   * @param {string} [options.size='md'] - Size: xs, sm, md, lg, xl, 2xl, 3xl, 4xl, 5xl, full
   * @param {string|null} [options.width=null] - Custom width (overrides size)
   * @param {string|null} [options.height=null] - Custom height
   * @param {boolean} [options.fullViewport=false] - Full viewport mode
   * @param {boolean} [options.closable=true] - Allow closing via backdrop/button
   * @param {boolean} [options.showHeader=true] - Show header
   * @param {boolean} [options.showFooter=true] - Show footer
   * @param {Function|null} [options.onClose=null] - Close callback
   * @param {boolean} [options.autoFocus=true] - Auto-focus first input
   * @param {HTMLElement|null} [options.focusTarget=null] - Specific element to focus
   * @param {string} [options.bodyPadding] - Custom body padding
   * @param {string} [options.bodyOverflow] - Custom body overflow
   * @returns {string} Modal ID
   */
  static show(options = {}) {
    // Check if this is a loading modal
    const isNewLoadingModal = options.showHeader === false && options.showFooter === false && options.closable === false;

    // If showing a non-loading modal, close all loading modals first
    if (!isNewLoadingModal) {
      this._closeAllLoadingModals();
    }

    // Create new modal element
    const modal = this._createModalElement();
    const modalId = modal.id;

    // Push to stack
    const modalInstance = {
      id: modalId,
      element: modal,
      onClose: options.onClose || null,
      closable: options.closable !== false,
    };

    TdModalStackManager.push(modalInstance);

    // Configure and show modal
    this._configureModal(modal, options);

    // --- Entrance animation setup ---
    const contentEl = modal.querySelector('.td-modal-content');
    const backdrop = modal.querySelector('.td-modal-backdrop');

    // Save backdrop target opacity (set by TdModalStackManager.push)
    const targetBackdropOpacity = backdrop ? (backdrop.style.opacity || '0.5') : '0.5';

    // Set transitions
    if (contentEl) {
      contentEl.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      contentEl.style.opacity = '0';
      contentEl.style.transform = 'scale(0.95)';
    }
    if (backdrop) {
      backdrop.style.transition = 'opacity 0.12s ease-out';
      backdrop.style.opacity = '0';
    }

    // Show modal with animation
    requestAnimationFrame(() => {
      modal.classList.remove('hidden');
      modal.style.display = 'block';

      // Animate entrance in next frame (after browser paints initial state)
      requestAnimationFrame(() => {
        if (contentEl) {
          contentEl.style.opacity = '1';
          contentEl.style.transform = 'scale(1)';
        }
        if (backdrop) {
          backdrop.style.opacity = targetBackdropOpacity;
        }
      });

      // Setup focus trap and auto-focus
      TdModal._setupFocusTrap(modal, {
        autoFocus: options.autoFocus !== false,
        focusTarget: options.focusTarget || null,
      });
    });

    return modalId;
  }

  /**
   * Close top modal (current active modal)
   */
  static close() {
    const topModal = TdModalStackManager.getTop();
    if (topModal) {
      this.closeById(topModal.id);
    }
  }

  /**
   * Close modal by ID
   * @param {string} modalId - Modal ID to close
   */
  static closeById(modalId) {
    TdModal._removeFocusTrap(modalId);
    const modalInstance = TdModalStackManager.removeById(modalId);
    if (modalInstance && modalInstance.element) {
      // --- Exit animation ---
      const contentEl = modalInstance.element.querySelector('.td-modal-content');
      const backdrop = modalInstance.element.querySelector('.td-modal-backdrop');

      if (contentEl) {
        contentEl.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
        contentEl.style.opacity = '0';
        contentEl.style.transform = 'scale(0.95)';
      }
      if (backdrop) {
        backdrop.style.transition = 'opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
        backdrop.style.opacity = '0';
      }

      if (modalInstance.onClose) {
        modalInstance.onClose();
      }

      // Remove from DOM after exit animation completes
      setTimeout(() => {
        if (modalInstance.element) {
          modalInstance.element.classList.add('hidden');
          modalInstance.element.style.display = 'none';
          if (modalInstance.element.parentNode) {
            modalInstance.element.remove();
          }
        }
      }, 200);
    }
  }

  /**
   * Close all modals
   */
  static closeAll() {
    TdModalStackManager.closeAll();
  }

  /**
   * Confirm dialog — returns Promise<boolean>
   * @param {Object} options
   * @param {string} [options.title='Xac nhan'] - Dialog title
   * @param {string} [options.message='Ban co chac chan?'] - Message text
   * @param {string} [options.confirmText='Xac nhan'] - Confirm button text
   * @param {string} [options.cancelText='Huy'] - Cancel button text
   * @param {string} [options.confirmVariant='primary'] - Confirm button variant
   * @param {Function} [options.onConfirm] - Confirm callback
   * @param {Function} [options.onCancel] - Cancel callback
   * @returns {Promise<boolean>}
   */
  static confirm(options = {}) {
    return new Promise((resolve) => {
      const {
        title = 'Xac nhan',
        message = 'Ban co chac chan?',
        confirmText = 'Xac nhan',
        cancelText = 'Huy',
        confirmVariant = 'primary',
        onConfirm = () => {},
        onCancel = () => {},
      } = options;

      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.textContent = cancelText;
      cancelButton.className = 'px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors';
      cancelButton.addEventListener('click', () => {
        TdModal.closeById(modalId);
        onCancel();
        resolve(false);
      });

      const variantClasses = {
        primary: 'bg-blue-600 hover:bg-blue-700 text-white',
        danger: 'bg-red-600 hover:bg-red-700 text-white',
        success: 'bg-green-600 hover:bg-green-700 text-white',
        warning: 'bg-yellow-500 hover:bg-yellow-600 text-white',
      };

      const confirmButton = document.createElement('button');
      confirmButton.type = 'button';
      confirmButton.textContent = confirmText;
      confirmButton.className = `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${variantClasses[confirmVariant] || variantClasses.primary}`;
      confirmButton.addEventListener('click', () => {
        TdModal.closeById(modalId);
        onConfirm();
        resolve(true);
      });

      const modalId = TdModal.show({
        title,
        body: `<p class="text-gray-600 text-sm sm:text-base">${escapeHtml(message)}</p>`,
        footer: [cancelButton, confirmButton],
        size: 'sm',
        focusTarget: cancelButton,
      });
    });
  }

  /**
   * Success dialog — returns Promise<boolean>
   * @param {Object} options
   * @param {string} [options.title='Thanh cong'] - Dialog title
   * @param {string} [options.message='Thao tac da hoan tat'] - Message text
   * @param {string} [options.okText='OK'] - OK button text
   * @returns {Promise<boolean>}
   */
  static success(options = {}) {
    return new Promise((resolve) => {
      const {
        title = 'Thanh cong',
        message = 'Thao tac da hoan tat',
        okText = 'OK',
      } = options;

      const okButton = document.createElement('button');
      okButton.type = 'button';
      okButton.textContent = okText;
      okButton.className = 'px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-green-600 hover:bg-green-700 text-white';
      okButton.addEventListener('click', () => {
        TdModal.closeById(modalId);
        resolve(true);
      });

      const modalId = TdModal.show({
        title,
        body: `
          <div class="flex items-start gap-3">
            <div class="flex-shrink-0">
              <svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <p class="text-gray-600 text-sm sm:text-base">${escapeHtml(message)}</p>
          </div>
        `,
        footer: [okButton],
        size: 'sm',
      });
    });
  }

  /**
   * Error dialog — returns Promise<boolean>
   * @param {Object} options
   * @param {string} [options.title='Loi'] - Dialog title
   * @param {string} [options.message='Da xay ra loi'] - Message text
   * @param {string} [options.okText='OK'] - OK button text
   * @returns {Promise<boolean>}
   */
  static error(options = {}) {
    return new Promise((resolve) => {
      const {
        title = 'Loi',
        message = 'Da xay ra loi',
        okText = 'OK',
      } = options;

      const okButton = document.createElement('button');
      okButton.type = 'button';
      okButton.textContent = okText;
      okButton.className = 'px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-red-600 hover:bg-red-700 text-white';
      okButton.addEventListener('click', () => {
        TdModal.closeById(modalId);
        resolve(true);
      });

      const modalId = TdModal.show({
        title,
        body: `
          <div class="flex items-start gap-3">
            <div class="flex-shrink-0">
              <svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </div>
            <p class="text-gray-600 text-sm sm:text-base">${escapeHtml(message)}</p>
          </div>
        `,
        footer: [okButton],
        size: 'sm',
      });
    });
  }

  /**
   * Info dialog — returns Promise<boolean>
   * @param {Object} options
   * @param {string} [options.title='Thong tin'] - Dialog title
   * @param {string} [options.message=''] - Message text
   * @param {string} [options.okText='OK'] - OK button text
   * @returns {Promise<boolean>}
   */
  static info(options = {}) {
    return new Promise((resolve) => {
      const {
        title = 'Thong tin',
        message = '',
        okText = 'OK',
      } = options;

      const okButton = document.createElement('button');
      okButton.type = 'button';
      okButton.textContent = okText;
      okButton.className = 'px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-blue-600 hover:bg-blue-700 text-white';
      okButton.addEventListener('click', () => {
        TdModal.closeById(modalId);
        resolve(true);
      });

      const modalId = TdModal.show({
        title,
        body: `
          <div class="flex items-start gap-3">
            <div class="flex-shrink-0">
              <svg class="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <p class="text-gray-600 text-sm sm:text-base">${escapeHtml(message)}</p>
          </div>
        `,
        footer: [okButton],
        size: 'sm',
      });
    });
  }

  /**
   * Loading dialog (non-closable, no header/footer)
   * @param {string|Object} messageOrOptions - Loading message or { message: string }
   * @returns {string} Modal ID
   */
  static loading(messageOrOptions = 'Dang tai...') {
    const message = typeof messageOrOptions === 'string'
      ? messageOrOptions
      : (messageOrOptions.message || 'Dang tai...');

    return TdModal.show({
      title: '',
      body: `
        <div class="flex flex-col items-center justify-center py-8">
          <svg class="animate-spin h-12 w-12 text-gray-900 mb-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p class="text-gray-900 font-medium text-sm sm:text-base">${escapeHtml(message)}</p>
        </div>
      `,
      footer: null,
      size: 'sm',
      closable: false,
      showHeader: false,
      showFooter: false,
    });
  }

  /**
   * Configure modal content and styling
   * @private
   */
  static _configureModal(modalElement, options = {}) {
    const {
      title = 'Modal',
      body = '',
      footer = null,
      size = 'md',
      width = null,
      height = null,
      fullViewport = false,
      closable = true,
      showHeader = true,
      showFooter = true,
    } = options;

    // Handle header visibility
    const headerEl = modalElement.querySelector('.td-modal-header');
    if (showHeader) {
      headerEl.style.display = '';
      const titleEl = modalElement.querySelector('.td-modal-title');
      titleEl.textContent = title;
    } else {
      headerEl.style.display = 'none';
    }

    // Set body
    const bodyEl = modalElement.querySelector('.td-modal-body');
    if (typeof body === 'string') {
      bodyEl.innerHTML = body;
    } else {
      bodyEl.innerHTML = '';
      bodyEl.appendChild(body);
    }

    // Handle footer visibility
    const footerEl = modalElement.querySelector('.td-modal-footer');
    if (showFooter && footer) {
      footerEl.innerHTML = '';
      if (Array.isArray(footer)) {
        footer.forEach(btn => footerEl.appendChild(btn));
      } else {
        footerEl.appendChild(footer);
      }
      footerEl.classList.remove('hidden');
      footerEl.style.display = '';
    } else {
      footerEl.classList.add('hidden');
      footerEl.style.display = 'none';
    }

    // Set size
    const contentEl = modalElement.querySelector('.td-modal-content');
    const containerEl = modalElement.querySelector('.fixed.inset-0.overflow-y-auto');
    const flexContainerEl = containerEl?.querySelector('.flex.min-h-full');

    // Handle full viewport mode
    if (fullViewport) {
      if (containerEl) {
        containerEl.style.overflow = 'hidden';
        containerEl.classList.remove('overflow-y-auto');
      }

      if (flexContainerEl) {
        flexContainerEl.classList.remove('items-end', 'sm:items-center', 'justify-center', 'p-0', 'sm:p-4');
        flexContainerEl.style.display = 'flex';
        flexContainerEl.style.alignItems = 'stretch';
        flexContainerEl.style.justifyContent = 'stretch';
        flexContainerEl.style.padding = '0';
        flexContainerEl.style.minHeight = '100vh';
      }

      contentEl.className = contentEl.className.replace(/max-w-[\w-]+(\s+sm:max-w-[\w-]+)?(\s+mx-\d+)?/g, '');
      contentEl.className = contentEl.className.replace(/rounded-t-3xl|sm:rounded-\[20px\]/g, '');
      if (!contentEl.className.includes('shadow-xl')) {
        contentEl.className += ' shadow-xl';
      }
      contentEl.style.width = '100vw';
      contentEl.style.maxWidth = '100vw';
      contentEl.style.height = '100vh';
      contentEl.style.maxHeight = '100vh';
      contentEl.style.margin = '0';
      contentEl.style.borderRadius = '0';
      contentEl.style.transform = 'none';

      if (headerEl) headerEl.style.flexShrink = '0';
      if (footerEl && !footerEl.classList.contains('hidden')) footerEl.style.flexShrink = '0';

      bodyEl.style.display = 'flex';
      bodyEl.style.flexDirection = 'column';
      bodyEl.style.flex = '1';
      bodyEl.style.minHeight = '0';
      bodyEl.style.overflow = 'hidden';
      bodyEl.style.padding = '0';
      bodyEl.classList.remove('max-h-[60vh]', 'sm:max-h-[70vh]', 'overflow-y-auto', 'px-4', 'sm:px-6', 'py-4');

      contentEl.style.display = 'flex';
      contentEl.style.flexDirection = 'column';
    } else {
      // Normal modal sizing
      contentEl.className = contentEl.className.replace(/max-w-[\w-]+(\s+sm:max-w-[\w-]+)?(\s+mx-\d+)?/g, '');
      contentEl.style.width = '';
      contentEl.style.maxWidth = '';
      contentEl.style.height = '';
      contentEl.style.maxHeight = '';

      if (width) {
        contentEl.style.width = width;
        contentEl.style.maxWidth = width;
      } else {
        const sizes = {
          xs: 'max-w-xs',
          sm: 'max-w-sm',
          md: 'max-w-md sm:max-w-lg',
          lg: 'max-w-lg sm:max-w-2xl',
          xl: 'max-w-xl sm:max-w-3xl',
          '2xl': 'max-w-2xl sm:max-w-4xl',
          '3xl': 'max-w-3xl sm:max-w-5xl',
          '4xl': 'max-w-4xl sm:max-w-6xl',
          '5xl': 'max-w-5xl sm:max-w-7xl',
          full: 'max-w-full mx-4',
        };
        contentEl.className += ' ' + (sizes[size] || sizes.md);
      }

      if (height) {
        contentEl.style.height = height;
        contentEl.style.maxHeight = height;
        contentEl.style.display = 'flex';
        contentEl.style.flexDirection = 'column';

        if (headerEl) headerEl.style.flexShrink = '0';
        if (footerEl && !footerEl.classList.contains('hidden')) footerEl.style.flexShrink = '0';

        bodyEl.style.display = 'flex';
        bodyEl.style.flexDirection = 'column';
        bodyEl.style.flex = '1';
        bodyEl.style.minHeight = '0';
        bodyEl.style.overflowY = 'auto';
        bodyEl.classList.remove('max-h-[60vh]', 'sm:max-h-[70vh]');
      }
    }

    // Optional body customization
    if (options.bodyPadding !== undefined) {
      bodyEl.style.padding = options.bodyPadding;
      if (options.bodyPadding === '0' || options.bodyPadding === 0) {
        bodyEl.classList.remove('px-4', 'sm:px-6', 'py-4');
      }
    }
    if (options.bodyOverflow !== undefined) {
      bodyEl.style.overflow = options.bodyOverflow;
      if (options.bodyOverflow === 'hidden') {
        bodyEl.classList.remove('overflow-y-auto');
      }
    }

    // Show/hide close button
    const closeBtn = modalElement.querySelector('.td-modal-close');
    if (closable) {
      closeBtn.classList.remove('hidden');
    } else {
      closeBtn.classList.add('hidden');
    }

    // Disable backdrop click if not closable
    const backdrop = modalElement.querySelector('.td-modal-backdrop');
    if (!closable) {
      backdrop.style.pointerEvents = 'none';
    } else {
      backdrop.style.pointerEvents = '';
    }
  }

  /**
   * Setup focus trap for a modal element
   * @private
   * @param {HTMLElement} modalElement - Modal element
   * @param {Object} options
   * @param {boolean} [options.autoFocus=true] - Whether to auto-focus first element
   * @param {HTMLElement|null} [options.focusTarget=null] - Specific element to focus
   */
  static _setupFocusTrap(modalElement, options = {}) {
    const { autoFocus = true, focusTarget = null } = options;
    const FOCUSABLE = 'a[href], button:not([disabled]):not([style*="display: none"]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const handler = (e) => {
      if (e.key !== 'Tab') return;

      const focusable = Array.from(modalElement.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    modalElement.addEventListener('keydown', handler);
    TdModal._focusTrapHandlers.set(modalElement.id, handler);

    // Auto-focus: focusTarget > first input in body > first focusable
    if (autoFocus) {
      setTimeout(() => {
        if (focusTarget && typeof focusTarget.focus === 'function') {
          focusTarget.focus();
        } else {
          const body = modalElement.querySelector('.td-modal-body');
          const INPUT_SELECTOR = 'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])';
          const firstInput = body && body.querySelector(INPUT_SELECTOR);
          if (firstInput && firstInput.offsetParent !== null) {
            firstInput.focus();
          } else {
            const focusable = Array.from(modalElement.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null);
            if (focusable.length > 0) {
              focusable[0].focus();
            }
          }
        }
      }, 50);
    }
  }

  /**
   * Remove focus trap for a modal element
   * @private
   * @param {string} modalId - Modal ID
   */
  static _removeFocusTrap(modalId) {
    const handler = TdModal._focusTrapHandlers.get(modalId);
    if (handler) {
      const el = document.getElementById(modalId);
      if (el) {
        el.removeEventListener('keydown', handler);
      }
      TdModal._focusTrapHandlers.delete(modalId);
    }
  }

  /**
   * Close all loading modals (modals with spinner and no header/footer)
   * @private
   */
  static _closeAllLoadingModals() {
    const stack = TdModalStackManager.stack;
    if (!stack || stack.length === 0) return;

    const loadingModalIds = [];
    for (let i = stack.length - 1; i >= 0; i--) {
      const modalInstance = stack[i];
      if (!modalInstance || !modalInstance.element) continue;

      const body = modalInstance.element.querySelector('.td-modal-body');
      const header = modalInstance.element.querySelector('.td-modal-header');
      const footer = modalInstance.element.querySelector('.td-modal-footer');

      const hasSpinner = body && body.querySelector('.animate-spin') !== null;
      const hasNoHeader = !header || header.style.display === 'none';
      const hasNoFooter = !footer || footer.style.display === 'none' || footer.classList.contains('hidden');

      if (hasSpinner && hasNoHeader && hasNoFooter) {
        loadingModalIds.push(modalInstance.id);
      } else {
        break;
      }
    }

    loadingModalIds.forEach(modalId => {
      TdModal.closeById(modalId);
    });
  }
}
