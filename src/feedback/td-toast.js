/**
 * TdToast — Toast notification utility
 * Static API: TdToast.success(msg), .error(msg), .warning(msg), .info(msg)
 *
 * Features:
 * - Dynamic z-index calculation (always above modal stack)
 * - Auto-dismiss with configurable duration
 * - Click to dismiss
 * - Success, error, warning, info variants
 * - Max 5 visible with FIFO eviction
 */

/**
 * Try to import TdModalStackManager for dynamic z-index.
 * If not available (parallel wave execution), fallback to base z-index.
 * @type {import('./td-modal-stack.js').TdModalStackManager|null}
 */
let TdModalStackManager = null;
try {
    const mod = await import('./td-modal-stack.js');
    TdModalStackManager = mod.TdModalStackManager || null;
} catch {
    // Modal stack not available — use base z-index
}

export class TdToast {
    static container = null;
    static TOAST_Z_INDEX_BASE = 99999;
    static MAX_VISIBLE = 5;
    static _activeToasts = [];

    /**
     * Get dynamic z-index for toast container.
     * Ensures toast is always above modal stack.
     * @returns {number}
     */
    static getToastZIndex() {
        if (TdModalStackManager) {
            const stack = TdModalStackManager.stack || [];
            if (stack.length > 0) {
                const maxModalZIndex = Math.max(
                    ...stack.map(modal => {
                        if (!modal.element) return 0;
                        const zIndex = window.getComputedStyle(modal.element).zIndex;
                        return parseInt(zIndex) || 0;
                    })
                );
                return maxModalZIndex + 1000;
            }
        }
        return TdToast.TOAST_Z_INDEX_BASE;
    }

    /**
     * Ensure toast container exists in DOM.
     * Auto-creates on first call, updates z-index on subsequent calls.
     */
    static ensureContainer() {
        if (TdToast.container) {
            TdToast.container.style.zIndex = TdToast.getToastZIndex();
            return;
        }

        const container = document.createElement('div');
        container.id = 'td-toast-container';
        container.className = 'fixed top-20 right-4 flex flex-col items-end space-y-2 pointer-events-none';
        container.style.zIndex = TdToast.getToastZIndex();
        document.body.appendChild(container);
        TdToast.container = container;
    }

    /**
     * Get theme configuration for toast type.
     * @param {string} type
     * @returns {{bg: string, hover: string, icon: string}}
     */
    static getTheme(type) {
        const themes = {
            success: {
                bg: 'bg-green-500/85',
                hover: 'hover:bg-green-500/90',
                icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>'
            },
            error: {
                bg: 'bg-red-500/85',
                hover: 'hover:bg-red-500/90',
                icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>'
            },
            warning: {
                bg: 'bg-yellow-500/85',
                hover: 'hover:bg-yellow-500/90',
                icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>'
            },
            info: {
                bg: 'bg-blue-500/85',
                hover: 'hover:bg-blue-500/90',
                icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>'
            }
        };

        return themes[type] || themes.info;
    }

    /**
     * Show a toast notification.
     * @param {string} message - Toast message text
     * @param {'success'|'error'|'warning'|'info'} type - Toast variant
     * @param {number} duration - Auto-dismiss delay in ms (0 = no auto-dismiss)
     */
    static show(message, type = 'info', duration = 4000) {
        if (!message) return;

        TdToast.ensureContainer();

        // Update z-index dynamically each time
        if (TdToast.container) {
            TdToast.container.style.zIndex = TdToast.getToastZIndex();
        }

        const theme = TdToast.getTheme(type);

        const toast = document.createElement('div');
        toast.className = 'toast-item w-full sm:w-auto max-w-md pointer-events-auto cursor-pointer transform transition-all duration-200 translate-x-4 opacity-0';
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
        toast.innerHTML = `
            <div class="px-4 py-3 rounded-xl text-white border border-white/20 ${theme.bg} ${theme.hover}" style="box-shadow: 0 8px 32px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.2); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);">
                <span class="text-sm leading-relaxed block">${message}</span>
            </div>
        `;

        TdToast.container.appendChild(toast);

        const removeToast = () => {
            if (toast._removed) return;
            toast._removed = true;
            toast.classList.add('translate-x-4', 'opacity-0');
            toast.classList.remove('translate-x-0', 'opacity-100');
            setTimeout(() => {
                toast.remove();
                TdToast._activeToasts = TdToast._activeToasts.filter(t => t !== toast);
            }, 180);
        };

        toast._removeToast = removeToast;
        TdToast._activeToasts.push(toast);

        // FIFO eviction when exceeding MAX_VISIBLE
        while (TdToast._activeToasts.length > TdToast.MAX_VISIBLE) {
            const oldest = TdToast._activeToasts[0];
            if (oldest && oldest._removeToast) {
                oldest._removeToast();
            }
        }

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.remove('translate-x-4', 'opacity-0');
            toast.classList.add('translate-x-0', 'opacity-100');
        });

        toast.addEventListener('click', removeToast);

        if (duration > 0) {
            setTimeout(removeToast, duration);
        }
    }

    /**
     * Show success toast (green).
     * @param {string} message
     * @param {number} duration
     */
    static success(message, duration = 4000) {
        TdToast.show(message, 'success', duration);
    }

    /**
     * Show error toast (red, longer default duration).
     * @param {string} message
     * @param {number} duration
     */
    static error(message, duration = 5000) {
        TdToast.show(message, 'error', duration);
    }

    /**
     * Show warning toast (yellow).
     * @param {string} message
     * @param {number} duration
     */
    static warning(message, duration = 4000) {
        TdToast.show(message, 'warning', duration);
    }

    /**
     * Show info toast (blue).
     * @param {string} message
     * @param {number} duration
     */
    static info(message, duration = 4000) {
        TdToast.show(message, 'info', duration);
    }
}
