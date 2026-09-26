import { LAYERS, register as registerLayer } from '../utils/layers.js';
import { placeFloating, isReferenceHidden } from '../utils/floating.js';
import { safeColor } from '../utils/css-safe.js';

/**
 * TdTooltip — global tooltip singleton with auto-init. Token-native (needs td.css; styles:
 * src/styles/components/tooltip.css). Any element with `data-tooltip="text"` gets a tooltip.
 *
 * Declarative API (unchanged): `data-tooltip`, `data-tooltip-position="top|bottom|left|right"` (default top; flips to
 * the opposite side when it does not fit), `data-tooltip-color` (solid custom chip; validated with safeColor),
 * `data-tooltip-text-color` (only with `data-tooltip-color`; default = black/white by WCAG contrast).
 *
 * DOM contract (one element, portaled to <body>):
 *   <div id="td-tooltip" class="td-tooltip td-glass-surface td-glass-surface--strong" role="tooltip" hidden
 *        [data-state="open"] data-placement="top|bottom|left|right" [data-custom]>
 *     <span class="td-tooltip__content">{text}</span>
 *   </div>
 *   trigger while shown: aria-describedby="{existing ids} td-tooltip" (own id only; removed on hide)
 *
 * Behaviour (WCAG 1.4.13): shows on pointerenter (mouse/pen; touch ignored) and on keyboard focus (focusin when the
 * target is :focus-visible); hides on pointerleave/focusout after a short grace so the pointer can move ONTO the
 * tooltip (hoverable); no auto-hide; Escape dismisses it through the layer registry (tooltip layer 510, keyboard
 * boundary without Tab handling), so Escape over a modal hides only the tooltip. Hidden when the trigger scrolls out
 * of view, on resize-out, window blur, or when the trigger leaves the DOM.
 *
 * Accessible-name policy (D15, deterministic and conservative) — names are touched ONLY for supported triggers:
 * native <button>, <a href>, input[type=button|submit|reset|image], and elements whose explicit role is
 * button|link|tab|menuitem. Any other element/role keeps its name and `title` untouched (the tooltip is still shown
 * and linked as a description).
 *  - named (see `_accessibleName`) → `title` removed; tooltip = description while shown (skipped when equal to the name)
 *  - unnamed + non-empty `title` → `title` moved to `aria-label` (`data-td-tooltip-named="title"`)
 *  - unnamed, no `title` → `data-tooltip` becomes `aria-label` (`data-td-tooltip-named="tooltip"`) + console.warn
 */

const TIP_ID = 'td-tooltip';
const HIDE_GRACE_MS = 100;
const EDGE = 8;
const SUPPORTED_ROLES = new Set(['button', 'link', 'tab', 'menuitem']);
const INPUT_BUTTON_TYPES = new Set(['button', 'submit', 'reset']);
/** UA wording for value-less submit/reset inputs (their accessible name). */
const INPUT_DEFAULT_NAME = { submit: 'Submit', reset: 'Reset' };

const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

/**
 * Which supported trigger kind `el` is, or null (unsupported → names/title untouched).
 * @param {Element} el
 * @returns {'button'|'link'|'input-button'|'input-image'|'role'|null}
 */
function triggerKind(el) {
  const role = clean(el.getAttribute('role') || '').split(' ')[0].toLowerCase();
  if (role && !SUPPORTED_ROLES.has(role)) return null; // role override (e.g. presentation, switch) → hands off
  const tag = el.localName;
  if (tag === 'button') return 'button';
  if (tag === 'a' && el.hasAttribute('href')) return 'link';
  if (tag === 'input') {
    const type = (el.getAttribute('type') || 'text').trim().toLowerCase();
    if (INPUT_BUTTON_TYPES.has(type)) return 'input-button';
    if (type === 'image') return 'input-image';
  }
  return role ? 'role' : null;
}

/** Text of `root` for name-from-content: skips hidden subtrees and the tooltip itself; counts img alt / svg labels. */
function contentText(root) {
  let out = '';
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) { out += child.nodeValue; continue; }
      if (child.nodeType !== 1) continue;
      const el = /** @type {Element} */ (child);
      if (el.id === TIP_ID || el.hidden || el.getAttribute('aria-hidden') === 'true') continue;
      const tag = el.localName;
      if (tag === 'script' || tag === 'style' || tag === 'template') continue;
      if (tag === 'img') { out += ` ${el.getAttribute('alt') || ''} `; continue; }
      if (tag === 'svg' || el.getAttribute('role') === 'img') {
        out += ` ${el.getAttribute('aria-label') || ''} `;
        continue;
      }
      out += ' ';
      walk(el);
      out += ' ';
    }
  };
  walk(root);
  return clean(out);
}

/** Whether `el` has keyboard-style focus (:focus-visible; engines without it count as keyboard). */
function isKeyboardFocus(el) {
  try { return el.matches(':focus-visible'); } catch { return true; }
}

/** Relative luminance (WCAG 2.x) of an {r,g,b} 0–255 colour. */
function luminance({ r, g, b }) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export class TdTooltip {
    constructor() {
        /** @type {HTMLElement|null} the tooltip root (public field, read by tests) */
        this.tooltip = null;
        /** @type {HTMLElement|null} */
        this.tooltipContent = null;
        /** @type {null} kept for shape compatibility — the arrow was removed in 0.9 (D14) */
        this.tooltipArrow = null;
        /** @type {HTMLElement|null} */
        this.currentElement = null;
        /** @type {boolean} */
        this.isVisible = false;
        /** @type {ReturnType<typeof setTimeout>|null} */
        this.hideTimeout = null;
        /** @type {PointerEvent|null} */
        this.lastMouseEvent = null;
        this._inited = false;
        /** @type {MutationObserver|null} */
        this._observer = null;
        /** @type {AbortController|null} */
        this._abort = null;
        /** @type {{ release(): void }|null} layer registration while shown */
        this._layer = null;
        /** @type {HTMLElement|null} trigger whose aria-describedby carries our id */
        this._describedEl = null;
        this._pointerIn = false;
        this._focusIn = false;
        this._rafReposition = 0;
        /** @type {WeakSet<Element>} triggers already warned about (unnamed) */
        this._warned = new WeakSet();
    }

    /** Initialize the tooltip system (idempotent): element, listeners, title/name observer. */
    init() {
        if (this._inited || typeof document === 'undefined') return;
        this._inited = true;
        this.createTooltipElement();
        this.bindEvents();
        this.preventNativeTooltipConflicts();
    }

    /** Create (or adopt) the singleton tooltip element on <body>. */
    createTooltipElement() {
        let el = /** @type {HTMLElement|null} */ (document.getElementById(TIP_ID));
        if (!el || !el.classList.contains('td-tooltip')) {
            el = document.createElement('div');
            el.id = TIP_ID;
            el.className = 'td-tooltip td-glass-surface td-glass-surface--strong';
            el.setAttribute('role', 'tooltip');
            el.hidden = true;
            const content = document.createElement('span');
            content.className = 'td-tooltip__content';
            el.appendChild(content);
        }
        if (!el.isConnected) document.body.appendChild(el);
        this.tooltip = el;
        this.tooltipContent = el.querySelector('.td-tooltip__content');
    }

    /** Bind document/window listeners (all removed by disconnect()). */
    bindEvents() {
        this._abort = new AbortController();
        const opts = { capture: true, signal: this._abort.signal };

        document.addEventListener('pointerenter', (e) => {
            if (e.pointerType === 'touch') return; // taps never pop tooltips (D16)
            this.lastMouseEvent = e;
            const t = e.target;
            if (!(t instanceof Element)) return;
            if (this.tooltip && (t === this.tooltip || this.tooltip.contains(t))) {
                if (this.isVisible) { this._pointerIn = true; this._cancelHide(); }
                return;
            }
            const trigger = /** @type {HTMLElement|null} */ (t.closest('[data-tooltip]'));
            if (!trigger || !this.getTooltipContent(trigger)) return;
            if (trigger === this.currentElement && this.isVisible) {
                this._pointerIn = true;
                this._cancelHide();
                return;
            }
            this.show(trigger);
            this._pointerIn = true;
        }, opts);

        document.addEventListener('pointerleave', (e) => {
            if (e.pointerType === 'touch' || !this.isVisible) return;
            this.lastMouseEvent = e;
            // `matches`-style: only leaving the trigger itself or the tooltip counts (icon ↔ text moves inside a
            // button fire pointerleave on the child, which is ignored).
            if (e.target !== this.currentElement && e.target !== this.tooltip) return;
            this._pointerIn = false;
            this._scheduleHide();
        }, opts);

        document.addEventListener('focusin', (e) => {
            const t = e.target;
            if (!(t instanceof Element)) return;
            const trigger = /** @type {HTMLElement|null} */ (t.closest('[data-tooltip]'));
            if (!trigger || !this.getTooltipContent(trigger)) return;
            if (!isKeyboardFocus(t)) return; // mouse/touch focus: pointer events own those
            if (trigger !== this.currentElement || !this.isVisible) this.show(trigger);
            this._focusIn = true;
            this._cancelHide();
        }, opts);

        document.addEventListener('focusout', (e) => {
            const cur = this.currentElement;
            if (!cur || !this.isVisible || !(e.target instanceof Node) || !cur.contains(e.target)) return;
            const next = e.relatedTarget;
            if (next instanceof Node && cur.contains(next)) return;
            this._focusIn = false;
            this._scheduleHide();
        }, opts);

        const reposition = () => {
            if (!this.isVisible || this._rafReposition) return;
            this._rafReposition = requestAnimationFrame(() => {
                this._rafReposition = 0;
                if (this.isVisible && this.currentElement) this.position(this.currentElement);
            });
        };
        document.addEventListener('scroll', reposition, opts);
        window.addEventListener('resize', reposition, { signal: this._abort.signal });
        window.addEventListener('blur', () => { if (this.isVisible) this.hide(); }, { signal: this._abort.signal });
    }

    /**
     * Apply the naming policy to every current [data-tooltip] trigger and observe additions / title and
     * data-tooltip changes (replaces the old blind `title` stripping).
     */
    preventNativeTooltipConflicts() {
        document.querySelectorAll('[data-tooltip]').forEach((el) => this._prepare(/** @type {HTMLElement} */ (el)));
        if (typeof MutationObserver === 'undefined' || !document.body) return;
        this._observer = new MutationObserver((records) => {
            for (const m of records) {
                if (m.type === 'attributes') {
                    const el = /** @type {HTMLElement} */ (m.target);
                    if (!el.isConnected || !el.hasAttribute('data-tooltip')) continue;
                    this._prepare(el);
                    if (el === this.currentElement && this.isVisible) this._refreshContent(el);
                    continue;
                }
                m.addedNodes.forEach((node) => {
                    if (node.nodeType !== 1 || !node.isConnected) return; // removed again in the same batch
                    const el = /** @type {Element} */ (node);
                    if (el.hasAttribute('data-tooltip')) this._prepare(/** @type {HTMLElement} */ (el));
                    el.querySelectorAll('[data-tooltip]').forEach((c) => this._prepare(/** @type {HTMLElement} */ (c)));
                });
            }
            if (this.currentElement && !this.currentElement.isConnected) this.hide();
        });
        this._observer.observe(document.body, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['title', 'data-tooltip'],
        });
    }

    /** Full teardown: listeners, observer, layer registration, element. `init()` may be called again. */
    disconnect() {
        this.hide();
        if (this._abort) { this._abort.abort(); this._abort = null; }
        if (this._observer) { this._observer.disconnect(); this._observer = null; }
        if (this._rafReposition) { cancelAnimationFrame(this._rafReposition); this._rafReposition = 0; }
        if (this.tooltip) this.tooltip.remove();
        this.tooltip = null;
        this.tooltipContent = null;
        this._inited = false;
    }

    /**
     * Show the tooltip for `element` (text from data-tooltip, set as text — never HTML).
     * @param {HTMLElement} element
     */
    show(element) {
        const content = this.getTooltipContent(element);
        if (!content) return;
        if (!this.tooltip || !this.tooltip.isConnected) this.createTooltipElement();
        this._cancelHide();

        if (this.currentElement && this.currentElement !== element) this._unlink();
        this.currentElement = element;
        this._pointerIn = false;
        const active = document.activeElement;
        this._focusIn = !!active && element.contains(active) && isKeyboardFocus(active);
        this._prepare(element);

        const tip = /** @type {HTMLElement} */ (this.tooltip);
        this._refreshContent(element);
        tip.hidden = false;
        tip.removeAttribute('data-state');
        this.position(element);
        if (this.currentElement !== element) return; // reference hidden → position() hid it

        this._link(element, content);
        if (!this._layer) {
            this._layer = registerLayer({
                layer: LAYERS.tooltip,
                element: tip,
                onEscape: () => { this.hide(); return true; },
            });
        }
        this.isVisible = true;
        requestAnimationFrame(() => {
            if (this.currentElement === element && this.isVisible) tip.setAttribute('data-state', 'open');
        });
    }

    /** Hide the tooltip and reset state (releases the layer registration and the description link). */
    hide() {
        this._cancelHide();
        if (this.tooltip) {
            this.tooltip.hidden = true;
            this.tooltip.removeAttribute('data-state');
        }
        this._unlink();
        if (this._layer) { this._layer.release(); this._layer = null; }
        this.isVisible = false;
        this.currentElement = null;
        this._pointerIn = false;
        this._focusIn = false;
    }

    /**
     * Place the tooltip against `element` (position: fixed, CSSOM geometry). top/bottom → placeFloating (flip + clamp);
     * left/right → beside the trigger when that side (or the opposite one) fits, else placeFloating on top.
     * Hides when the trigger is not rendered / scrolled out of view.
     * @param {HTMLElement} element
     */
    position(element) {
        const tip = this.tooltip;
        if (!tip) return;
        const rect = element.getBoundingClientRect();
        if (!element.isConnected || isReferenceHidden(rect)) { this.hide(); return; }
        const s = tip.style;
        s.setProperty('left', '0px'); // measure at natural width (fixed + left:0 → full shrink-to-fit room)
        s.setProperty('top', '0px');
        const gap = parseFloat(getComputedStyle(tip).getPropertyValue('--td-tooltip-gap')) || 8;
        const pos = (element.dataset.tooltipPosition || 'top').trim().toLowerCase();

        if (pos === 'left' || pos === 'right') {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const w = tip.offsetWidth;
            const h = tip.offsetHeight;
            const room = { left: rect.left - gap - EDGE, right: vw - rect.right - gap - EDGE };
            const other = pos === 'left' ? 'right' : 'left';
            const side = w <= room[pos] ? pos : (w <= room[other] ? other : null);
            if (side) {
                const left = side === 'left' ? rect.left - gap - w : rect.right + gap;
                const top = Math.max(EDGE, Math.min(rect.top + rect.height / 2 - h / 2, vh - h - EDGE));
                s.setProperty('left', `${Math.round(left)}px`);
                s.setProperty('top', `${Math.round(top)}px`);
                tip.setAttribute('data-placement', side);
                return;
            }
        }
        const r = placeFloating(element, tip, { side: pos === 'bottom' ? 'bottom' : 'top', width: 'auto', gap });
        tip.setAttribute('data-placement', r.side);
    }

    /** @returns {boolean} whether the pointer is over the current trigger or the tooltip */
    isCurrentlyHovering() {
        return this.isVisible && this._pointerIn;
    }

    /**
     * Whether mouse event coordinates are within an element's bounds.
     * @param {MouseEvent} event
     * @param {Element} element
     * @returns {boolean}
     */
    isMouseOverElement(event, element) {
        if (!event || !element) return false;
        const rect = element.getBoundingClientRect();
        const x = event.clientX, y = event.clientY;
        return (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
    }

    /**
     * Tooltip text from data-tooltip.
     * @param {HTMLElement} element
     * @returns {string|null}
     */
    getTooltipContent(element) {
        return (element && element.dataset && element.dataset.tooltip) || null;
    }

    /**
     * Accessible name of a SUPPORTED trigger from its type-specific sources (each counts only when non-empty).
     * Unsupported elements → '' (never inspected).
     * @param {HTMLElement} el
     * @returns {string}
     */
    _accessibleName(el) {
        const kind = triggerKind(el);
        if (!kind) return '';
        const ids = clean(el.getAttribute('aria-labelledby') || '');
        if (ids) {
            const text = clean(ids.split(' ').map((id) => {
                const ref = document.getElementById(id);
                return ref ? ref.textContent : '';
            }).join(' '));
            if (text) return text;
        }
        const aria = clean(el.getAttribute('aria-label') || '');
        if (aria) return aria;
        if (kind === 'button' || kind === 'input-button' || kind === 'input-image') {
            const labels = /** @type {HTMLButtonElement|HTMLInputElement} */ (el).labels;
            if (labels && labels.length) {
                const text = clean([...labels].map((l) => contentText(l)).join(' '));
                if (text) return text;
            }
        }
        if (kind === 'button' || kind === 'link' || kind === 'role') return contentText(el);
        if (kind === 'input-button') {
            const value = clean(el.getAttribute('value') || '');
            if (value) return value;
            const type = (el.getAttribute('type') || '').trim().toLowerCase();
            return INPUT_DEFAULT_NAME[type] || '';
        }
        return clean(el.getAttribute('alt') || ''); // input[type=image]: alt only, never value
    }

    /** @private apply the D15 naming policy to one trigger (idempotent). */
    _prepare(el) {
        if (!triggerKind(el)) return; // unsupported: names and title untouched
        const text = clean(this.getTooltipContent(el) || '');
        if (el.getAttribute('data-td-tooltip-named') === 'tooltip') {
            // we named it from data-tooltip: keep it in sync (a site-set title now wins as the better name)
            const title = clean(el.getAttribute('title') || '');
            if (title) {
                el.setAttribute('aria-label', title);
                el.setAttribute('data-td-tooltip-named', 'title');
                el.removeAttribute('title');
            } else if (text && el.getAttribute('aria-label') !== text) {
                el.setAttribute('aria-label', text);
            }
            return;
        }
        if (this._accessibleName(el)) {
            if (el.hasAttribute('title')) el.removeAttribute('title');
            return;
        }
        const title = clean(el.getAttribute('title') || '');
        if (title) {
            el.setAttribute('aria-label', title);
            el.setAttribute('data-td-tooltip-named', 'title');
            el.removeAttribute('title');
            return;
        }
        if (!text) return;
        el.setAttribute('aria-label', text);
        el.setAttribute('data-td-tooltip-named', 'tooltip');
        if (!this._warned.has(el)) {
            this._warned.add(el);
            console.warn('[td-tooltip] trigger has no accessible name; data-tooltip used as aria-label. '
                + 'Give it visible text, aria-label or a <label>.', el);
        }
    }

    /** @private text + custom colour chip (validated; invalid values fall back to the glass chip). */
    _refreshContent(el) {
        const tip = /** @type {HTMLElement} */ (this.tooltip);
        const text = this.getTooltipContent(el) || '';
        if (this.tooltipContent) this.tooltipContent.textContent = text;
        else tip.textContent = text;
        const bg = safeColor(el.dataset.tooltipColor);
        if (bg) {
            const fg = safeColor(el.dataset.tooltipTextColor) || this._getAccessibleTextColor(bg);
            tip.style.setProperty('--td-tooltip-bg', bg);
            tip.style.setProperty('--td-tooltip-fg', fg);
            tip.setAttribute('data-custom', '');
        } else {
            tip.style.removeProperty('--td-tooltip-bg');
            tip.style.removeProperty('--td-tooltip-fg');
            tip.removeAttribute('data-custom');
        }
        if (el === this.currentElement && this._describedEl === el) {
            this._unlink();
            this._link(el, text);
        }
    }

    /** @private add our id to the trigger's aria-describedby unless the text equals its name. */
    _link(el, text) {
        if (clean(text) === this._accessibleName(el)) return;
        const ids = clean(el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
        if (ids.includes(TIP_ID)) return; // already there (site's own reference): never ours to remove
        ids.push(TIP_ID);
        el.setAttribute('aria-describedby', ids.join(' '));
        this._describedEl = el;
    }

    /** @private remove ONLY our id from the linked trigger. */
    _unlink() {
        const el = this._describedEl;
        this._describedEl = null;
        if (!el) return;
        const ids = clean(el.getAttribute('aria-describedby') || '').split(' ').filter((id) => id && id !== TIP_ID);
        if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
        else el.removeAttribute('aria-describedby');
    }

    /** @private */
    _scheduleHide() {
        this._cancelHide();
        this.hideTimeout = setTimeout(() => {
            this.hideTimeout = null;
            if (!this._pointerIn && !this._focusIn) this.hide();
        }, HIDE_GRACE_MS);
    }

    /** @private */
    _cancelHide() {
        if (this.hideTimeout) { clearTimeout(this.hideTimeout); this.hideTimeout = null; }
    }

    /**
     * Any CSS colour → {r,g,b} (canvas normalisation: no DOM probe, no body mutation).
     * @param {string} color
     * @returns {{r: number, g: number, b: number}|null}
     */
    _toComputedRGB(color) {
        try {
            const ctx = document.createElement('canvas').getContext('2d');
            if (!ctx) return null;
            ctx.fillStyle = '#010203';
            ctx.fillStyle = color;
            const v = String(ctx.fillStyle);
            const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
            if (hex) {
                if (v === '#010203' && !/^#010203$/i.test(color.trim())) return null; // rejected value
                return { r: parseInt(hex[1], 16), g: parseInt(hex[2], 16), b: parseInt(hex[3], 16) };
            }
            const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(v);
            return m ? { r: Math.round(+m[1]), g: Math.round(+m[2]), b: Math.round(+m[3]) } : null;
        } catch {
            return null;
        }
    }

    /**
     * Black or white text, whichever has the higher WCAG contrast on `bgColor`.
     * @param {string} bgColor
     * @returns {string}
     */
    _getAccessibleTextColor(bgColor) {
        const rgb = this._toComputedRGB(bgColor);
        if (!rgb) return '#ffffff';
        const l = luminance(rgb);
        return (1.05 / (l + 0.05)) >= ((l + 0.05) / 0.05) ? '#ffffff' : '#000000';
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
