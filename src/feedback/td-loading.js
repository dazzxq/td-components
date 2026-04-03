/**
 * TdLoading — Fullscreen loading overlay with Google-style circular spinner
 * TdLoadingSpinner — Inline spinner factory
 *
 * Static API: TdLoading.show(msg), TdLoading.hide(), TdLoading.wrap(fn)
 * Factory API: TdLoadingSpinner.create({size, color})
 *
 * Features:
 * - Fullscreen overlay with dark backdrop
 * - Google Material Design circular SVG spinner
 * - maxDuration auto-hide (default 30s)
 * - Async wrapper function
 * - Inline spinner for loading states
 * - prefers-reduced-motion support
 */

/**
 * Fullscreen loading overlay utility.
 * Does NOT extend TdBaseElement — standalone static class.
 */
export class TdLoading {
    static element = null;
    static _maxDurationTimer = null;

    /**
     * Initialize the loading overlay element.
     * Creates and appends to body on first call.
     */
    static init() {
        if (TdLoading.element) return;

        const overlay = document.createElement('div');
        overlay.id = 'td-loading';
        overlay.className = 'fixed inset-0 z-[99999] hidden flex items-center justify-center';
        overlay.style.cssText = 'background: rgba(0, 0, 0, 0.25);';

        overlay.innerHTML = `
            <div class="td-loading-card">
                <div class="td-circular-spinner">
                    <svg viewBox="0 0 50 50">
                        <circle class="td-spinner-track" cx="25" cy="25" r="20"></circle>
                        <circle class="td-spinner-arc" cx="25" cy="25" r="20"></circle>
                    </svg>
                </div>
                <p id="td-loading-message" class="td-loading-message">Dang tai...</p>
            </div>
            <style>
                .td-loading-card {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 32px 44px;
                    border-radius: 20px;
                    background: rgb(255, 255, 255);
                    border: 1px solid rgba(0, 0, 0, 0.08);
                    box-shadow:
                        0 24px 80px rgba(0, 0, 0, 0.15),
                        0 8px 32px rgba(0, 0, 0, 0.1),
                        inset 0 1px 0 rgba(255, 255, 255, 0.9);
                }

                .td-circular-spinner {
                    width: 56px;
                    height: 56px;
                    margin-bottom: 16px;
                    animation: td-spinner-rotate 1.4s linear infinite;
                }

                .td-circular-spinner svg {
                    width: 100%;
                    height: 100%;
                }

                .td-spinner-track {
                    fill: none;
                    stroke: rgba(59, 130, 246, 0.15);
                    stroke-width: 4;
                }

                .td-spinner-arc {
                    fill: none;
                    stroke: #3b82f6;
                    stroke-width: 4;
                    stroke-linecap: round;
                    stroke-dasharray: 90, 150;
                    stroke-dashoffset: 0;
                    animation: td-spinner-dash 1.4s ease-in-out infinite;
                }

                @keyframes td-spinner-rotate {
                    100% { transform: rotate(360deg); }
                }

                @keyframes td-spinner-dash {
                    0% {
                        stroke-dasharray: 1, 150;
                        stroke-dashoffset: 0;
                    }
                    50% {
                        stroke-dasharray: 90, 150;
                        stroke-dashoffset: -35;
                    }
                    100% {
                        stroke-dasharray: 90, 150;
                        stroke-dashoffset: -124;
                    }
                }

                .td-loading-message {
                    margin: 0;
                    font-size: 15px;
                    font-weight: 500;
                    color: #374151;
                    text-align: center;
                    letter-spacing: -0.01em;
                }

                @media (prefers-reduced-motion: reduce) {
                    .td-circular-spinner {
                        animation: td-spinner-rotate 2.8s linear infinite;
                    }
                    .td-spinner-arc {
                        animation: none;
                        stroke-dasharray: 90, 150;
                        stroke-dashoffset: -35;
                    }
                }
            </style>
        `;

        document.body.appendChild(overlay);
        TdLoading.element = overlay;
    }

    /**
     * Show loading overlay.
     * @param {string|{message?: string, maxDuration?: number|false}} messageOrOptions
     *   - String: loading message text
     *   - Object: { message, maxDuration } where maxDuration defaults to 30000ms
     */
    static show(messageOrOptions = 'Dang tai...') {
        if (!TdLoading.element) {
            TdLoading.init();
        }

        let message = 'Dang tai...';
        let maxDuration = 30000;

        if (typeof messageOrOptions === 'string') {
            message = messageOrOptions;
        } else if (messageOrOptions && typeof messageOrOptions === 'object') {
            message = messageOrOptions.message || 'Dang tai...';
            if ('maxDuration' in messageOrOptions) {
                maxDuration = messageOrOptions.maxDuration;
            }
        }

        const messageEl = TdLoading.element.querySelector('#td-loading-message');
        if (messageEl) messageEl.textContent = message;

        // Clear any existing maxDuration timer
        if (TdLoading._maxDurationTimer) {
            clearTimeout(TdLoading._maxDurationTimer);
            TdLoading._maxDurationTimer = null;
        }

        TdLoading.element.classList.remove('hidden');

        // Set auto-hide timer if maxDuration is enabled
        if (maxDuration && maxDuration > 0) {
            TdLoading._maxDurationTimer = setTimeout(() => {
                console.warn('Loading auto-hidden after maxDuration (' + maxDuration + 'ms)');
                TdLoading.hide();
            }, maxDuration);
        }
    }

    /**
     * Hide loading overlay.
     */
    static hide() {
        if (TdLoading._maxDurationTimer) {
            clearTimeout(TdLoading._maxDurationTimer);
            TdLoading._maxDurationTimer = null;
        }
        if (TdLoading.element) {
            TdLoading.element.classList.add('hidden');
        }
    }

    /**
     * Wrap an async function with loading overlay.
     * Shows loading before, hides after (even on error).
     * @param {Function} asyncFn - Async function to execute
     * @param {string} message - Loading message
     * @returns {Promise<*>} Result of asyncFn
     */
    static async wrap(asyncFn, message = 'Dang tai...') {
        try {
            TdLoading.show(message);
            return await asyncFn();
        } finally {
            TdLoading.hide();
        }
    }
}

/**
 * Inline loading spinner factory.
 * Creates standalone spinner elements for inline use.
 */
export class TdLoadingSpinner {
    /**
     * Create an inline loading spinner element.
     * @param {Object} options - Spinner configuration
     * @param {'sm'|'md'|'lg'} options.size - Spinner size (default 'md')
     * @param {string} options.color - Spinner arc color (default '#3b82f6')
     * @param {string} options.trackColor - Track color (default 'rgba(59, 130, 246, 0.15)')
     * @param {string} options.className - Additional CSS classes
     * @returns {HTMLElement} Spinner container element
     */
    static create(options = {}) {
        const {
            size = 'md',
            color = '#3b82f6',
            trackColor = 'rgba(59, 130, 246, 0.15)',
            className = ''
        } = options;

        const sizes = {
            sm: { width: 20, strokeWidth: 3 },
            md: { width: 32, strokeWidth: 4 },
            lg: { width: 48, strokeWidth: 5 }
        };
        const s = sizes[size] || sizes.md;

        const container = document.createElement('div');
        container.className = `td-spinner ${className}`.trim();
        container.style.cssText = `
            display: inline-block;
            width: ${s.width}px;
            height: ${s.width}px;
            animation: td-inline-spinner-rotate 1.4s linear infinite;
        `;

        container.innerHTML = `
            <svg viewBox="0 0 50 50" style="width: 100%; height: 100%;">
                <circle cx="25" cy="25" r="20" fill="none" stroke="${trackColor}" stroke-width="${s.strokeWidth}"></circle>
                <circle cx="25" cy="25" r="20" fill="none" stroke="${color}" stroke-width="${s.strokeWidth}" stroke-linecap="round"
                    style="stroke-dasharray: 90, 150; animation: td-inline-spinner-dash 1.4s ease-in-out infinite;"></circle>
            </svg>
        `;

        // Inject keyframe styles once
        if (!document.getElementById('td-spinner-keyframes')) {
            const style = document.createElement('style');
            style.id = 'td-spinner-keyframes';
            style.textContent = `
                @keyframes td-inline-spinner-rotate {
                    100% { transform: rotate(360deg); }
                }
                @keyframes td-inline-spinner-dash {
                    0% {
                        stroke-dasharray: 1, 150;
                        stroke-dashoffset: 0;
                    }
                    50% {
                        stroke-dasharray: 90, 150;
                        stroke-dashoffset: -35;
                    }
                    100% {
                        stroke-dasharray: 90, 150;
                        stroke-dashoffset: -124;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        return container;
    }
}
