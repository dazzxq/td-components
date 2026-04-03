/**
 * TdTooltip -- Global tooltip singleton with auto-init
 * Any element with data-tooltip attribute shows tooltip on hover.
 *
 * Features:
 * - Auto-init: importing this file creates and inits the singleton
 * - Auto-positioning (top/bottom/left/right) with arrow pointing to element
 * - Internal movement detection (icon->text inside button does NOT hide)
 * - Custom colors via data-tooltip-color attribute
 * - Viewport clamping with 10px padding
 * - MutationObserver removes title from data-tooltip elements
 * - 30s auto-hide safety
 */

export class TdTooltip {
    constructor() {
        /** @type {HTMLElement|null} */
        this.tooltip = null;
        /** @type {HTMLElement|null} */
        this.tooltipContent = null;
        /** @type {HTMLElement|null} */
        this.tooltipArrow = null;
        /** @type {HTMLElement|null} */
        this.currentElement = null;
        /** @type {boolean} */
        this.isVisible = false;
        /** @type {number|null} */
        this.hideTimeout = null;
        /** @type {number|null} */
        this.showTimeout = null;
        /** @type {MouseEvent|null} */
        this.lastMouseEvent = null;
        /** @type {boolean} */
        this._inited = false;
        /** @type {MutationObserver|null} */
        this._observer = null;
    }

    /**
     * Initialize the tooltip system. Guarded by _inited flag.
     * Creates tooltip element, binds events, sets up MutationObserver.
     */
    init() {
        if (this._inited) return;
        this._inited = true;
        this.createTooltipElement();
        this.bindEvents();
        this.preventNativeTooltipConflicts();
    }

    /**
     * Create the tooltip DOM element and append to document.body.
     * Tooltip has: dark glass bg, backdrop blur, white text, arrow diamond.
     */
    createTooltipElement() {
        const el = document.createElement('div');
        el.className = 'td-tooltip';
        el.style.cssText = `
            position: absolute;
            z-index: 10010;
            visibility: hidden;
            opacity: 0;
            display: none;
            pointer-events: none;
            background-color: rgba(30, 30, 30, 0.75);
            backdrop-filter: blur(12px) saturate(160%);
            -webkit-backdrop-filter: blur(12px) saturate(160%);
            color: rgba(255, 255, 255, 0.95);
            padding: 8px 12px;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            font-size: 14px;
            font-weight: 400;
            line-height: 1.4;
            max-width: 280px;
            min-width: max-content;
            word-wrap: break-word;
            word-break: break-word;
            box-shadow: 0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.1);
            white-space: normal;
            text-align: center;
            transition: opacity 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                        visibility 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        `;

        // Content container
        const content = document.createElement('div');
        content.className = 'td-tooltip-content';
        content.style.cssText = `
            position: relative;
            z-index: 1;
        `;

        // Arrow element — CSS border triangle (no diamond artifact)
        const arrow = document.createElement('span');
        arrow.className = 'td-tooltip-arrow';
        arrow.style.cssText = `
            position: absolute;
            width: 0;
            height: 0;
            border: 6px solid transparent;
            z-index: 0;
        `;

        el.appendChild(content);
        el.appendChild(arrow);
        document.body.appendChild(el);

        this.tooltip = el;
        this.tooltipContent = content;
        this.tooltipArrow = arrow;
    }

    /**
     * Bind global event listeners for tooltip show/hide behavior.
     * Uses capture phase for mouseenter/mouseleave/mousemove.
     * Internal movement detection via relatedTarget check (D-12).
     */
    bindEvents() {
        // mouseenter (capture) — show tooltip for [data-tooltip] elements
        document.addEventListener('mouseenter', (e) => {
            this.lastMouseEvent = e;
            if (this.hideTimeout) { clearTimeout(this.hideTimeout); this.hideTimeout = null; }
            if (!e.target || typeof e.target.closest !== 'function') return;
            const element = e.target.closest('[data-tooltip]');
            if (element && element.dataset.tooltip) {
                if (this.showTimeout) { clearTimeout(this.showTimeout); this.showTimeout = null; }
                if (element !== this.currentElement || !this.isVisible) {
                    this.show(element);
                }
            }
        }, true);

        // mouseleave (capture) — D-12: check relatedTarget for internal movement
        document.addEventListener('mouseleave', (e) => {
            this.lastMouseEvent = e;
            if (!e.target || typeof e.target.closest !== 'function') return;
            const element = e.target.closest('[data-tooltip]');
            if (element && element.dataset.tooltip) {
                // Check if we're still moving within the same tooltip element
                // Handles icon->text, text->icon movement inside buttons
                const relatedTarget = e.relatedTarget;
                const currentInElement = element.contains(e.target);
                const relatedInElement = relatedTarget && (
                    element.contains(relatedTarget) ||
                    relatedTarget === element
                );

                // Still inside the same tooltip element — don't hide
                if (currentInElement && relatedInElement) {
                    return;
                }

                this.hideTimeout = setTimeout(() => {
                    if (this.currentElement === element || !this.isCurrentlyHovering()) {
                        this.hide();
                    }
                }, 50);
            }
        }, true);

        // mousemove (capture) — secondary hover check for edge cases
        document.addEventListener('mousemove', (e) => {
            this.lastMouseEvent = e;
            if (this.isVisible && this.currentElement) {
                const element = e.target?.closest?.('[data-tooltip]');
                if (!element || element !== this.currentElement) {
                    if (!this.isMouseOverElement(e, this.currentElement)) {
                        this.hideTimeout = setTimeout(() => {
                            if (!this.isCurrentlyHovering()) {
                                this.hide();
                            }
                        }, 100);
                    }
                }
            }
        }, true);

        // Scroll — hide immediately
        document.addEventListener('scroll', () => { if (this.isVisible) this.hide(); }, true);

        // Resize & blur — hide
        window.addEventListener('resize', () => { if (this.isVisible) this.hide(); });
        window.addEventListener('blur', () => { if (this.isVisible) this.hide(); });

        // Escape key — hide
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) this.hide();
        });
    }

    /**
     * Remove title attribute from elements with data-tooltip to prevent
     * native browser tooltip conflicts. Setup MutationObserver for dynamic elements.
     */
    preventNativeTooltipConflicts() {
        const elems = document.querySelectorAll('[data-tooltip]');
        elems.forEach(el => {
            if (el.hasAttribute('title')) el.removeAttribute('title');
        });

        if (typeof MutationObserver !== 'undefined') {
            this._observer = new MutationObserver((mutations) => {
                mutations.forEach((m) => {
                    if (m.type === 'childList') {
                        m.addedNodes.forEach((node) => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                if (node.hasAttribute && node.hasAttribute('data-tooltip') && node.hasAttribute('title')) {
                                    node.removeAttribute('title');
                                }
                                const childTooltips = node.querySelectorAll
                                    ? node.querySelectorAll('[data-tooltip][title]')
                                    : [];
                                childTooltips.forEach(child => child.removeAttribute('title'));
                            }
                        });
                    }
                });
            });
            this._observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    /**
     * Disconnect the MutationObserver and clean up.
     */
    disconnect() {
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
    }

    /**
     * Show tooltip for the given element.
     * Reads data-tooltip for content, data-tooltip-color for custom bg.
     * Positions with rAF, auto-hides after 30s.
     * @param {HTMLElement} element
     */
    show(element) {
        const content = this.getTooltipContent(element);
        if (!content) return;

        if (this.hideTimeout) { clearTimeout(this.hideTimeout); this.hideTimeout = null; }
        if (this.showTimeout) { clearTimeout(this.showTimeout); this.showTimeout = null; }

        if (element.hasAttribute('title')) element.removeAttribute('title');
        this.currentElement = element;

        // Set content
        if (this.tooltipContent) {
            this.tooltipContent.textContent = content;
        } else {
            this.tooltip.textContent = content;
        }

        // Custom color support via data-tooltip-color
        let bgColor = 'rgba(30, 30, 30, 0.75)';
        let textColor = 'rgba(255, 255, 255, 0.95)';

        if (element.dataset.tooltipColor) {
            bgColor = element.dataset.tooltipColor;
            // Simple accessible text color: light text for dark bg, dark text for light bg
            textColor = element.dataset.tooltipTextColor || this._getAccessibleTextColor(bgColor);
        } else if (element.dataset.tooltipTextColor) {
            textColor = element.dataset.tooltipTextColor;
        }

        const shadowColor = this._shadowRGBA(bgColor, 0.3);

        // Apply styles
        this.tooltip.style.backgroundColor = bgColor;
        this.tooltip.style.color = textColor;
        this.tooltip.style.boxShadow = `0 8px 32px ${shadowColor}, inset 0 1px 0 rgba(255,255,255,0.1)`;
        this.tooltip.style.backdropFilter = 'blur(12px) saturate(160%)';
        this.tooltip.style.webkitBackdropFilter = 'blur(12px) saturate(160%)';
        this.tooltip.style.border = '1px solid rgba(255, 255, 255, 0.1)';

        if (this.tooltipContent) {
            this.tooltipContent.style.color = textColor;
        }
        // Arrow border color is set in position() based on direction

        // Prepare for measurement
        this.tooltip.style.left = '0px';
        this.tooltip.style.top = '0px';
        this.tooltip.style.transform = '';
        this.tooltip.style.visibility = 'hidden';
        this.tooltip.style.opacity = '0';
        this.tooltip.style.display = 'block';
        this.tooltip.style.position = 'absolute';

        // Force reflow then position
        this.tooltip.offsetHeight;
        requestAnimationFrame(() => {
            if (this.currentElement === element) {
                this.position(element);
                this.tooltip.style.visibility = 'visible';
                this.tooltip.style.opacity = '1';
                this.isVisible = true;
                // Auto-hide after 30s safety
                this.showTimeout = setTimeout(() => {
                    if (this.isVisible && this.currentElement === element) this.hide();
                }, 30000);
            }
        });
    }

    /**
     * Hide the tooltip and reset state.
     */
    hide() {
        if (this.hideTimeout) { clearTimeout(this.hideTimeout); this.hideTimeout = null; }
        if (this.showTimeout) { clearTimeout(this.showTimeout); this.showTimeout = null; }
        this.tooltip.style.visibility = 'hidden';
        this.tooltip.style.opacity = '0';
        this.tooltip.style.display = 'none';
        this.isVisible = false;
        this.currentElement = null;
    }

    /**
     * Position the tooltip relative to the target element.
     * Reads data-tooltip-position (top/bottom/left/right, default top).
     * Clamps to viewport with 10px padding. Adjusts arrow when clamped.
     * @param {HTMLElement} element
     */
    position(element) {
        const rect = element.getBoundingClientRect();
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;
        const tipRect = this.tooltip.getBoundingClientRect();
        const pos = element.dataset.tooltipPosition || 'top';
        const offset = 8;

        const elLeft = rect.left + scrollX;
        const elTop = rect.top + scrollY;
        const elRight = rect.right + scrollX;
        const elBottom = rect.bottom + scrollY;

        let left, top;

        // Anchor centers
        const anchorCenterX = elLeft + (rect.width / 2);
        const anchorCenterY = elTop + (rect.height / 2);

        // Reset arrow
        if (this.tooltipArrow) {
            this.tooltipArrow.style.display = 'block';
        }

        const arrowSize = 6; // border width — triangle is 12px wide, 6px tall
        const bgColor = this.tooltip.style.backgroundColor || 'rgba(30, 30, 30, 0.75)';

        switch (pos) {
            case 'bottom':
                left = anchorCenterX - (tipRect.width / 2);
                top = elBottom + offset;
                if (this.tooltipArrow) {
                    // Arrow points up — flush with tooltip top edge
                    this.tooltipArrow.style.borderColor = `transparent transparent ${bgColor} transparent`;
                    this.tooltipArrow.style.top = `${-arrowSize * 2 + 1}px`;
                    this.tooltipArrow.style.left = `${Math.round(tipRect.width / 2 - arrowSize)}px`;
                }
                break;
            case 'left':
                left = elLeft - tipRect.width - offset;
                top = anchorCenterY - (tipRect.height / 2);
                if (this.tooltipArrow) {
                    // Arrow points right — flush with tooltip right edge
                    this.tooltipArrow.style.borderColor = `transparent transparent transparent ${bgColor}`;
                    this.tooltipArrow.style.top = `${Math.round(tipRect.height / 2 - arrowSize)}px`;
                    this.tooltipArrow.style.left = `${tipRect.width - 1}px`;
                }
                break;
            case 'right':
                left = elRight + offset;
                top = anchorCenterY - (tipRect.height / 2);
                if (this.tooltipArrow) {
                    // Arrow points left — flush with tooltip left edge
                    this.tooltipArrow.style.borderColor = `transparent ${bgColor} transparent transparent`;
                    this.tooltipArrow.style.top = `${Math.round(tipRect.height / 2 - arrowSize)}px`;
                    this.tooltipArrow.style.left = `${-arrowSize * 2 + 1}px`;
                }
                break;
            case 'top':
            default:
                left = anchorCenterX - (tipRect.width / 2);
                top = elTop - tipRect.height - offset;
                if (this.tooltipArrow) {
                    // Arrow points down — flush with tooltip bottom edge
                    this.tooltipArrow.style.borderColor = `${bgColor} transparent transparent transparent`;
                    this.tooltipArrow.style.top = `${tipRect.height - 1}px`;
                    this.tooltipArrow.style.left = `${Math.round(tipRect.width / 2 - arrowSize)}px`;
                }
        }

        // Viewport clamping with 10px padding
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const minLeft = scrollX + 10;
        const maxLeft = scrollX + viewportWidth - tipRect.width - 10;
        const minTop = scrollY + 10;
        const maxTop = scrollY + viewportHeight - tipRect.height - 10;

        left = Math.max(minLeft, Math.min(left, maxLeft));
        top = Math.max(minTop, Math.min(top, maxTop));

        this.tooltip.style.left = Math.round(left) + 'px';
        this.tooltip.style.top = Math.round(top) + 'px';

        // Adjust arrow to point to anchor when tooltip is clamped
        if (this.tooltipArrow) {
            if (pos === 'top' || pos === 'bottom') {
                const desiredArrowLeft = anchorCenterX - left - arrowSize;
                const minArrow = 10;
                const maxArrow = tipRect.width - 10;
                const clampedArrowLeft = Math.max(minArrow, Math.min(desiredArrowLeft, maxArrow));
                this.tooltipArrow.style.left = `${Math.round(clampedArrowLeft)}px`;
            } else if (pos === 'left' || pos === 'right') {
                const desiredArrowTop = anchorCenterY - top - arrowSize;
                const minArrowY = 10;
                const maxArrowY = tipRect.height - 10;
                const clampedArrowTop = Math.max(minArrowY, Math.min(desiredArrowTop, maxArrowY));
                this.tooltipArrow.style.top = `${Math.round(clampedArrowTop)}px`;
            }
        }
    }

    /**
     * Check if the mouse is currently over the current tooltip element.
     * @returns {boolean}
     */
    isCurrentlyHovering() {
        if (!this.currentElement || !this.lastMouseEvent) return false;
        return this.isMouseOverElement(this.lastMouseEvent, this.currentElement);
    }

    /**
     * Check if mouse event coordinates are within element bounds.
     * @param {MouseEvent} event
     * @param {HTMLElement} element
     * @returns {boolean}
     */
    isMouseOverElement(event, element) {
        if (!event || !element) return false;
        const rect = element.getBoundingClientRect();
        const x = event.clientX, y = event.clientY;
        return (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
    }

    /**
     * Get tooltip content from data-tooltip attribute.
     * No permission check (not applicable to td-components).
     * @param {HTMLElement} element
     * @returns {string|null}
     */
    getTooltipContent(element) {
        return element.dataset.tooltip || null;
    }

    /**
     * Compute shadow rgba string from a color and alpha.
     * @param {string} color - CSS color value
     * @param {number} alpha - Alpha value (0-1)
     * @returns {string} rgba() string
     */
    _shadowRGBA(color, alpha) {
        const rgb = this._toComputedRGB(color);
        if (!rgb) return `rgba(45, 162, 199, ${alpha})`;
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    }

    /**
     * Convert any CSS color to computed RGB triplet.
     * @param {string} color - CSS color value
     * @returns {{r: number, g: number, b: number}|null}
     */
    _toComputedRGB(color) {
        const temp = document.createElement('div');
        temp.style.color = color;
        document.body.appendChild(temp);
        const computed = getComputedStyle(temp).color;
        document.body.removeChild(temp);
        const m = computed.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (!m) return null;
        return { r: parseInt(m[1], 10), g: parseInt(m[2], 10), b: parseInt(m[3], 10) };
    }

    /**
     * Simple accessible text color: white for dark backgrounds, dark for light.
     * Uses relative luminance calculation.
     * @param {string} bgColor - CSS color value
     * @returns {string} Text color (white or dark)
     */
    _getAccessibleTextColor(bgColor) {
        const rgb = this._toComputedRGB(bgColor);
        if (!rgb) return '#ffffff';
        // Relative luminance (simplified sRGB)
        const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
        return luminance > 0.5 ? '#1e1e1e' : '#ffffff';
    }
}

// Auto-init singleton (D-10)
const tdTooltip = new TdTooltip();
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => tdTooltip.init());
    } else {
        tdTooltip.init();
    }
}

export { tdTooltip };
