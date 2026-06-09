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

import { safeColor } from '../utils/css-safe.js';
import { adoptStyles } from '../utils/adopt-styles.js';

/**
 * Single constructable stylesheet for BOTH the overlay spinner and the inline factory
 * spinner. Under a strict CSP (`default-src 'self'; style-src 'self'`, NO `unsafe-inline`)
 * a JS-injected `<style>` element is BLOCKED, so the previous two injected `<style>`
 * blocks (`#td-loading-styles` + `#td-spinner-keyframes`) would silently kill the
 * `@keyframes`-driven animation. `@keyframes` and `@media (prefers-reduced-motion)` ARE
 * expressible in a constructable `CSSStyleSheet`, so everything — the card chrome, the
 * spinner selectors, all four keyframe sets, and the reduced-motion override — lives here
 * and is adopted into `document` LAZILY (from `init()` / `create()`, never at module
 * top-level). Both the overlay (portaled to `document.body`) and inline spinners (mounted
 * anywhere in the light DOM) are reached by a sheet on the top-level document.
 *
 * Keyframe names + selector class names are kept STABLE so the rotation `transform`
 * (rotate) and arc `stroke-dashoffset`/`stroke-dasharray` animate identically to the
 * pre-CSP version. On an unsupported browser/SSR `adoptStyles` returns false and the
 * spinner still renders structurally (it just won't animate — acceptable degradation).
 *
 * @type {string}
 */
const TD_LOADING_CSS = `
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

.td-spinner-arc-inline {
    animation: td-inline-spinner-dash 1.4s ease-in-out infinite;
}

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

        // Adopt the spinner stylesheet (keyframes + selectors + reduced-motion) into the
        // top-level document — CSP-safe replacement for the old injected <style>. Lazy +
        // idempotent; degrades to a no-op (returns false) in SSR/old browsers.
        adoptStyles(TD_LOADING_CSS, 'td-loading');

        const overlay = document.createElement('div');
        overlay.id = 'td-loading';
        overlay.className = 'fixed inset-0 z-[99999] hidden flex items-center justify-center';
        // CSSOM scalar (allowed under CSP) — NOT a declarative style= attribute.
        overlay.style.cssText = 'background: rgba(0, 0, 0, 0.25);';

        // SVG width/height are PRESENTATION ATTRIBUTES (not a declarative style="…"),
        // so they are CSP-safe inside this innerHTML string. The animation/keyframes
        // come from the adopted sheet's `.td-circular-spinner` / `.td-spinner-arc` rules.
        overlay.innerHTML = `
            <div class="td-loading-card">
                <div class="td-circular-spinner">
                    <svg viewBox="0 0 50 50" width="100%" height="100%">
                        <circle class="td-spinner-track" cx="25" cy="25" r="20"></circle>
                        <circle class="td-spinner-arc" cx="25" cy="25" r="20"></circle>
                    </svg>
                </div>
                <p id="td-loading-message" class="td-loading-message">Đang tải...</p>
            </div>
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
    static show(messageOrOptions = 'Đang tải...') {
        if (!TdLoading.element) {
            TdLoading.init();
        }

        let message = 'Đang tải...';
        let maxDuration = 30000;

        if (typeof messageOrOptions === 'string') {
            message = messageOrOptions;
        } else if (messageOrOptions && typeof messageOrOptions === 'object') {
            message = messageOrOptions.message || 'Đang tải...';
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
        // CSSOM scalar (allowed under CSP) — NOT a declarative style= attribute.
        TdLoading.element.style.display = 'flex';

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
            // CSSOM scalar (allowed under CSP) — NOT a declarative style= attribute.
            TdLoading.element.style.display = 'none';
        }
    }

    /**
     * Wrap an async function with loading overlay.
     * Shows loading before, hides after (even on error).
     * @param {Function} asyncFn - Async function to execute
     * @param {string} message - Loading message
     * @returns {Promise<*>} Result of asyncFn
     */
    static async wrap(asyncFn, message = 'Đang tải...') {
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

        // Adopt the spinner stylesheet (keyframes for the rotate + dash animations the
        // inline spinner references) — CSP-safe, lazy, idempotent. Shares the same sheet
        // as the overlay via the 'td-loading' key.
        adoptStyles(TD_LOADING_CSS, 'td-loading');

        // Caller-provided colors land in SVG `stroke` presentation attributes via
        // innerHTML — sanitize.
        const safeColorValue = safeColor(color, '#3b82f6');
        const safeTrackColor = safeColor(trackColor, 'rgba(59, 130, 246, 0.15)');

        const sizes = {
            sm: { width: 20, strokeWidth: 3 },
            md: { width: 32, strokeWidth: 4 },
            lg: { width: 48, strokeWidth: 5 }
        };
        const s = sizes[size] || sizes.md;

        const container = document.createElement('div');
        container.className = `td-spinner ${className}`.trim();
        // CSSOM (allowed under CSP) — sets per-instance size scalars + the rotation
        // animation. The referenced `td-inline-spinner-rotate` @keyframes lives in the
        // adopted sheet (TD_LOADING_CSS), so this is CSP-safe.
        container.style.cssText = `
            display: inline-block;
            width: ${s.width}px;
            height: ${s.width}px;
            animation: td-inline-spinner-rotate 1.4s linear infinite;
        `;

        // SVG attributes only — width/height/stroke/stroke-width/stroke-dasharray are
        // PRESENTATION ATTRIBUTES (CSP-safe), not declarative style="…". The arc's dash
        // animation comes from the `.td-spinner-arc-inline` class rule in the adopted sheet.
        container.innerHTML = `
            <svg viewBox="0 0 50 50" width="100%" height="100%">
                <circle cx="25" cy="25" r="20" fill="none" stroke="${safeTrackColor}" stroke-width="${s.strokeWidth}"></circle>
                <circle class="td-spinner-arc-inline" cx="25" cy="25" r="20" fill="none" stroke="${safeColorValue}" stroke-width="${s.strokeWidth}" stroke-linecap="round" stroke-dasharray="90,150"></circle>
            </svg>
        `;

        return container;
    }
}
