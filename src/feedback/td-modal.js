/**
 * TdModal — stacked modal dialogs + Promise dialogs (static utility, no TdBaseElement). Token-native: needs td.css
 * (src/styles/components/modal.css + button.css); no Tailwind, no adopted/inline <style>, CSP-strict.
 *
 * DOM contract (one root per open dialog, portaled to <body>):
 *   <div id="{id}" class="td-modal td-modal--{xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|full}[ td-modal--viewport]"
 *        data-state="opening|open|closing" [data-covered]>
 *     <div class="td-modal__backdrop" aria-hidden="true"></div>             ← scrim, never closes (ADR 0006)
 *     <div class="td-modal__dialog td-glass-surface td-glass-surface--strong td-glass-surface--lg"
 *          role="dialog|alertdialog" aria-modal="true" aria-labelledby="{id}-title" | aria-label (no header)
 *          [aria-describedby="{id}-message"] tabindex="-1"
 *          (CSSOM: --td-modal-w, --td-modal-h, --td-modal-body-pad, --td-modal-body-overflow)>
 *       <div class="td-modal__header" [hidden]>
 *         <h2 class="td-modal__title" id="{id}-title">title</h2>
 *         <button type="button" class="td-modal__close" aria-label="Đóng" [hidden]>
 *           <span class="td-modal__close-icon" data-td-icon="close" aria-hidden="true">svg</span></button>
 *       </div>
 *       <div class="td-modal__body">body</div>
 *       <div class="td-modal__footer" [hidden]>footer | .td-btn actions</div>
 *     </div>
 *   </div>
 *
 * Behaviour (plan v0.9.0 item 1):
 * - Each open dialog registers with the layer registry (utils/layers.js) at LAYERS.modal as a BLOCKING boundary:
 *   everything below it (page, lower modals, a lightbox) is `inert`; Tab is trapped (focus is pulled back from
 *   anywhere); Escape is consumed and does nothing (ADR 0006 — it never closes, and it never reaches a layer
 *   below); higher layers (dropdown menu, tooltip, loading) get the keyboard first. One scroll lease per stack.
 * - Focus: moves into the dialog on open. Initial target: `focusTarget` (only if connected AND inside the dialog)
 *   → v0.57.1 the first usable `[autofocus]` of the body / footer
 *   → first body field → first focusable other than the X → the X → the dialog. `autoFocus:false` → the dialog.
 *   On close, focus returns to the opener only when this dialog was on top (else it stays where it is); if the
 *   opener is gone/outside the new top dialog, the new top dialog is focused. Restored BEFORE `onClose`.
 * - z-index: `var(--td-z-modal)` for every dialog; DOM order stacks. Covered dialogs `[data-covered]` go solid.
 *
 * Trusted-HTML hatches (developer content ONLY, never user input): `show({ body: '<html string>' })` and
 * `messageHtml` on the Promise dialogs. `title`, `message`, button labels are always text.
 *
 * @example
 * const id = TdModal.show({ title: 'Xin chào', body: formElement, actions: [
 *   { label: 'Hủy', value: false },
 *   { label: 'Lưu', variant: 'primary', value: true, onClick: () => save() }, // thenable → busy until settled
 * ] });
 * const ok = await TdModal.confirm({ title: 'Xóa?', message: 'Không thể hoàn tác.', confirmVariant: 'danger' });
 */

import { TdModalStackManager } from './td-modal-stack.js';
import {
  LAYERS, focusablesIn, setFocusHandoff, followFocusHandoff, restoreFocus,
} from '../utils/layers.js';
import { fillIconSlots } from '../icons/td-icon.js';
import { transitionEndMs } from '../utils/transition.js';
import { openDialogLayer } from './dialog-layer.js';
import { preparePhrase, phraseMatches } from '../utils/confirm-phrase.js';

const MODAL_LAYER = LAYERS.modal; // --td-z-modal
const SIZES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', 'full'];
const BTN_VARIANTS = ['primary', 'secondary', 'danger', 'success', 'warning', 'info'];
const OVERFLOWS = ['visible', 'hidden', 'auto', 'scroll', 'clip'];
const FIELD = 'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])';
const EXIT_MS = 240; // min wait before the root is removed (≥ --td-modal-exit-dur 200ms + margin; longer tokens extend it)
const REDUCED_EXIT_MS = 120; // reduced motion: the opacity-only fade (--td-dur-fast) when the computed style can't be read
const EXIT_MARGIN = 40;
const SPINNER = '<span class="td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true" hidden>'
  + '<svg class="td-spinner__svg" viewBox="0 0 50 50" aria-hidden="true" focusable="false">'
  + '<circle class="td-spinner__track" cx="25" cy="25" r="20"></circle>'
  + '<circle class="td-spinner__arc" cx="25" cy="25" r="20"></circle></svg></span>';

let confirmSeq = 0; // ids of the type-to-confirm field (v0.44.0)

const isThenable = (v) => !!v && (typeof v === 'object' || typeof v === 'function') && typeof v.then === 'function';

/**
 * A developer CSS value for `prop`, or '' (D22): must parse for that property and must not pull in url()/var().
 * @param {string} prop
 * @param {unknown} value
 * @param {string} option name for the warning
 */
function cssValue(prop, value, option) {
  if (value === null || value === undefined || value === '') return '';
  const v = String(value).trim();
  const ok = v && v.length <= 200 && !/url\(|var\(|image-set\(|[;{}]/i.test(v)
    && typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports(prop, v);
  if (!ok) {
    console.warn(`TdModal: ignored invalid ${option} "${v}"`);
    return '';
  }
  return v;
}

function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/**
 * Build a `.td-btn` button (label as text). Busy state = aria-busy + aria-disabled + spinner (button.css).
 * @param {string} label
 * @param {string} variant
 * @returns {HTMLButtonElement}
 */
function makeButton(label, variant) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `td-btn td-btn--${BTN_VARIANTS.includes(variant) ? variant : 'secondary'}`;
  const text = document.createElement('span');
  text.className = 'td-btn__label';
  text.textContent = label == null ? '' : String(label);
  btn.appendChild(text);
  btn.insertAdjacentHTML('beforeend', SPINNER); // constant markup, no interpolation
  return btn;
}

function setButtonBusy(btn, busy) {
  if (busy) {
    btn.setAttribute('aria-busy', 'true');
    btn.setAttribute('aria-disabled', 'true');
  } else {
    btn.removeAttribute('aria-busy');
    btn.removeAttribute('aria-disabled');
  }
  const spinner = btn.querySelector('.td-btn__spinner');
  if (spinner) spinner.hidden = !busy;
}

export class TdModal {
  /**
   * Default labels (Vietnamese); override per site: `TdModal.labels.close = 'Close'`. `*Title` / `confirmMessage`
   * are the defaults of the Promise dialogs when the call passes no `title` / `message`.
   */
  static labels = {
    close: 'Đóng',
    confirm: 'Xác nhận',
    cancel: 'Hủy',
    ok: 'OK',
    confirmTitle: 'Xác nhận',
    confirmMessage: 'Bạn có chắc chắn?',
    successTitle: 'Thành công',
    errorTitle: 'Lỗi',
    infoTitle: 'Thông tin',
    // v0.44.0 type-to-confirm (`{phrase}` → the phrase, always as text)
    typeToConfirmLabel: 'Gõ {phrase} để xác nhận',
    typeToConfirmMismatch: 'Chưa khớp — hãy gõ đúng {phrase}',
    typeToConfirmMatched: 'Đã khớp, có thể xác nhận',
  };

  /**
   * Compatibility map: modal id → `{ el, layer }` while the dialog's keyboard/inert registration is active.
   * @type {Map<string, { el: HTMLElement, layer: { release(): void, isTop(): boolean } }>}
   */
  static _focusTrapHandlers = new Map();

  /**
   * Build the modal root (not yet attached).
   * @private
   * @param {string} id
   * @returns {HTMLElement}
   */
  static _createModalElement(id) {
    const root = document.createElement('div');
    root.id = id;
    root.className = 'td-modal td-modal--md';
    root.setAttribute('data-state', 'opening');
    // Static markup only; every dynamic value is set below through the DOM (textContent / attributes).
    root.innerHTML = '<div class="td-modal__backdrop" aria-hidden="true"></div>'
      + '<div class="td-modal__dialog td-glass-surface td-glass-surface--strong td-glass-surface--lg"'
      + ' role="dialog" aria-modal="true" tabindex="-1">'
      + '<div class="td-modal__header"><h2 class="td-modal__title"></h2>'
      + '<button type="button" class="td-modal__close">'
      + '<span class="td-modal__close-icon" data-td-icon="close" aria-hidden="true"></span></button></div>'
      + '<div class="td-modal__body"></div>'
      + '<div class="td-modal__footer" hidden></div>'
      + '</div>';
    root.querySelector('.td-modal__title').id = `${id}-title`;
    root.querySelector('.td-modal__close').setAttribute('aria-label', TdModal.labels.close || 'Đóng');
    fillIconSlots(root);
    // No backdrop-click close (ADR 0006). Keep focus in the dialog when the scrim is clicked.
    root.querySelector('.td-modal__backdrop').addEventListener('mousedown', (e) => e.preventDefault());
    return root;
  }

  /**
   * Show a modal.
   * @param {Object} options
   * @param {string} [options.title='Modal'] - Title (text).
   * @param {string|Node} [options.body=''] - Body: a Node (preferred) or an HTML string. **The string form is a
   *   TRUSTED-HTML hatch** (`innerHTML`): developer markup only, never user input.
   * @param {HTMLElement[]|HTMLElement|null} [options.footer=null] - Footer element(s), appended as is.
   * @param {Array<{label: string, variant?: string, value?: *, close?: boolean, disabled?: boolean,
   *   onClick?: (ctx: {id: string, value: *, button: HTMLButtonElement}) => (boolean|void|PromiseLike<*>)}>}
   *   [options.actions] - Footer buttons (`.td-btn`; wins over `footer`). `onClick` returning a thenable keeps
   *   the dialog open with that button busy (`aria-busy`) and the other actions + X disabled; resolved `false`,
   *   sync `false`, `close:false` or a rejection keep it open; otherwise it closes and `onClose(value)` gets the
   *   action's `value`.
   * @param {string} [options.size='md'] - xs, sm, md, lg, xl, 2xl, 3xl, 4xl, 5xl, full.
   * @param {string|null} [options.width=null] - Custom width (any valid CSS width without url()/var()).
   * @param {string|null} [options.height=null] - Custom height (same rule).
   * @param {boolean} [options.fullViewport=false] - Dialog fills the viewport (no bottom sheet).
   * @param {boolean} [options.closable=true] - Show the X. The modal NEVER closes on backdrop click, nor on Escape
   *   unless `escapeCloses`.
   * @param {boolean} [options.escapeCloses=false] - Escape closes the dialog (not while an action is busy). Only for
   *   dialogs whose close loses no user data (ADR 0006 addendum), e.g. pickers.
   * @param {boolean} [options.showHeader=true] - Without a header the title becomes the dialog's `aria-label`.
   * @param {boolean} [options.showFooter=true]
   * @param {Function|null} [options.onClose=null] - Called once on every close path, after focus is restored.
   * @param {(root: HTMLElement, payload: *) => void} [options.onShow] - Called once after the open state is set
   *   (second animation frame) unless the modal was closed before; errors are caught and warned.
   * @param {*} [options.onShowPayload] - Second argument of `onShow`.
   * @param {boolean} [options.autoFocus=true] - false: focus the dialog itself instead of the first field.
   * @param {HTMLElement|null} [options.focusTarget=null] - Initial focus (honoured only if inside the dialog).
   * @param {string|number} [options.bodyPadding] - Body padding (valid CSS padding).
   * @param {string} [options.bodyOverflow] - visible | hidden | auto | scroll | clip.
   * @param {Element|null} [options.themeRoot=null] - v0.42.0 (ADR 0020): render in the theme scope
   *   (`[data-td-theme]`) of this element; without it the dialog follows the page theme.
   * @param {(ctx: { reason: 'button'|'escape'|'action'|'request', value: * }) => (boolean|void|PromiseLike<boolean|void>)}
   *   [options.beforeClose] - v0.44.0 guard of the USER close paths (X, Escape with `escapeCloses`, a closing action —
   *   also "Lưu": call `tracker.markClean()` before it returns —, `requestClose()`). `false` (sync or resolved) keeps
   *   the dialog open, so does a throw / rejection (console.error); anything else closes. While it is pending, further
   *   attempts share it and actions do not run. `close()` / `closeById()` / `closeAll()` never run it.
   * @returns {string} Modal id
   */
  static show(options = {}) {
    return TdModal._open(options, null);
  }

  /**
   * @private
   * @param {Object} options public show() options
   * @param {{ role?: string, message?: HTMLElement }|null} internal promise-dialog extras
   */
  static _open(options = {}, internal = null) {
    const opts = options || {};
    const id = TdModalStackManager.generateId();
    const root = TdModal._createModalElement(id);
    const dialog = /** @type {HTMLElement} */ (root.querySelector('.td-modal__dialog'));
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement : null;

    const instance = {
      id,
      element: root,
      dialog,
      opener,
      // the open modal the opener lives in (focus falls back through closed ancestors' openers)
      openerOwner: opener ? TdModalStackManager.stack.find((m) => m.element.contains(opener)) || null : null,
      onClose: typeof opts.onClose === 'function' ? opts.onClose : null,
      closable: opts.closable !== false,
      closed: false,
      busy: false,
      // v0.44.0: guard of the user close paths (show() only — the Promise dialogs pass no beforeClose)
      beforeClose: !internal && typeof opts.beforeClose === 'function' ? opts.beforeClose : null,
      guarding: null, // the pending guard's Promise<boolean>
      layer: null,
      close: (value) => TdModal._closeInstance(instance, value),
    };

    TdModal._configureModal(root, opts, instance);
    if (internal && internal.role) dialog.setAttribute('role', internal.role);
    if (internal && internal.message) {
      internal.message.id = `${id}-message`;
      dialog.setAttribute('aria-describedby', internal.message.id);
    }

    document.body.appendChild(root);
    TdModalStackManager.push(instance);
    const autoFocus = opts.autoFocus !== false;
    const focusTarget = opts.focusTarget || null;
    // v0.27.0 (§A): the layer mechanics live in the shared dialog-layer controller — same order, same timing.
    instance.handle = openDialogLayer({
      root,
      dialog,
      themeFrom: typeof Element !== 'undefined' && opts.themeRoot instanceof Element ? opts.themeRoot : null,
      viewport: { root, scroller: dialog.querySelector('.td-modal__body') }, // v0.36.2: above the keyboard
      layer: MODAL_LAYER,
      opener,
      // ADR 0006: Escape never closes (consumed so it cannot reach a layer below) — except `escapeCloses` dialogs
      // whose close loses no user data (e.g. the datetime picker keeps a pending copy); never while busy.
      onEscape: () => {
        if (opts.escapeCloses === true && !instance.busy) TdModal._requestClose(instance, 'escape');
        return true;
      },
      // v0.21.1 F4: opened over a lightbox that sits above the modals (lightbox opened from a modal) → promoted above
      // it; under TdModalStackManager.BASE_Z_INDEX its normal z is the stack's (kept in sync by _sync()).
      baseZ: () => (TdModalStackManager._zBase() !== null ? instance.zIndex : null),
      // The initial target is chosen once the content is laid out (second frame); focus moved into the dialog at once.
      onOpened: () => {
        if (!TdModal._isOpen(id)) return;
        root.setAttribute('data-state', 'open');
        TdModal._initialFocus(instance, autoFocus, focusTarget);
        if (typeof opts.onShow === 'function') {
          try { opts.onShow(root, opts.onShowPayload); } catch (err) { console.warn('TdModal onShow failed:', err); }
        }
      },
      wasTop: () => TdModalStackManager.getTop() === instance,
      beforeRelease: () => {
        TdModalStackManager.removeById(instance.id);
        TdModal._removeFocusTrap(instance.id);
      },
      restoreFocus: (ctx) => TdModal._restoreFocus(instance, ctx),
      // onClose: called once on every close path, after focus is restored, before the exit transition
      onClosing: (value) => {
        if (typeof instance.onClose === 'function') instance.onClose(value);
      },
      exitMs: () => TdModal._exitMs(instance),
    });
    instance.layer = instance.handle.layer;
    TdModal._focusTrapHandlers.set(id, { el: root, layer: instance.layer });
    return id;
  }

  /**
   * @private
   * @param {object} instance
   * @param {boolean} autoFocus
   * @param {HTMLElement|null} focusTarget
   */
  static _initialFocus(instance, autoFocus, focusTarget) {
    const { dialog, element: root } = instance;
    if (TdModalStackManager.getTop() !== instance) return; // a later modal owns focus
    const active = document.activeElement;
    if (active && active !== dialog && active !== document.body && root.contains(active)) return; // user moved on
    const tryFocus = (el) => {
      if (!el || typeof el.focus !== 'function') return false;
      try { el.focus({ preventScroll: true }); } catch { return false; }
      return document.activeElement === el;
    };
    if (autoFocus) {
      if (focusTarget instanceof HTMLElement && focusTarget.isConnected && dialog.contains(focusTarget)
        && tryFocus(focusTarget)) return;
      const body = dialog.querySelector('.td-modal__body');
      const eligible = new Set(focusablesIn(dialog));
      // v0.57.1: the first usable [autofocus] of the body / footer (DOM order). A host that is not focusable itself
      // (e.g. <td-input-field autofocus>) hands it to its first eligible descendant; disabled / hidden ones are skipped
      // (eligible = focusablesIn: not :disabled, no [hidden]/[inert] ancestor, rendered, visible).
      for (const part of dialog.querySelectorAll('.td-modal__body, .td-modal__footer')) {
        for (const el of part.querySelectorAll('[autofocus]')) {
          if (el.matches(':disabled') || el.hasAttribute('disabled')) continue;
          if (eligible.has(el) && tryFocus(el)) return;
          // Codex impl r1: a visible element focusable only by script (tabindex="-1") is a valid autofocus target too
          const shown = !el.closest('[hidden], [inert]') && el.getClientRects().length > 0;
          if (shown && !eligible.has(el) && tryFocus(el)) return;
          const inner = [...eligible].find((f) => f !== el && el.contains(f));
          if (inner && tryFocus(inner)) return;
        }
      }
      const fields = body ? [...body.querySelectorAll(FIELD)].filter((el) => eligible.has(el)) : [];
      for (const el of fields) if (tryFocus(el)) return;
      const close = dialog.querySelector('.td-modal__close');
      for (const el of eligible) if (el !== close && tryFocus(el)) return;
      if (tryFocus(close)) return;
    }
    tryFocus(dialog);
  }

  /**
   * v0.44.0: ask to close a modal THROUGH its `beforeClose` guard (for a hand-built footer). Not while an action is busy.
   * `close()` / `closeById()` / `closeAll()` stay unguarded (the app's own decision — logout, route change).
   * @param {string} modalId
   * @param {*} [value] passed to the guard and to onClose
   * @returns {Promise<boolean>} true once closed; false when it stays open (guard refused, busy, unknown id)
   */
  static requestClose(modalId, value) {
    const inst = TdModalStackManager.stack.find((m) => m.id === modalId);
    if (!inst || typeof inst.close !== 'function' || !inst.handle) return Promise.resolve(false);
    return TdModal._requestClose(inst, 'request', value);
  }

  /**
   * @private v0.44.0 (QĐ 12-15): the guarded close. Sync guard → closes (or not) synchronously; async → `guarding`
   * until it settles (further attempts get the same Promise); a code close meanwhile drops the result silently.
   * @param {object} inst
   * @param {'button'|'escape'|'action'|'request'} reason
   * @param {*} [value]
   * @returns {Promise<boolean>}
   */
  static _requestClose(inst, reason, value) {
    if (inst.closed) return Promise.resolve(false);
    if (inst.guarding) return inst.guarding;
    if (inst.busy) return Promise.resolve(false);
    const guard = inst.beforeClose;
    if (typeof guard !== 'function') {
      inst.close(value);
      return Promise.resolve(true);
    }
    let result;
    let then;
    try {
      result = guard({ reason, value });
      // `.then` is read ONCE, here (review r2 / r3 E): a throwing getter is a refusal; the captured function is the one
      // called below — a stateful getter cannot answer "thenable" now and "plain value" later
      then = !!result && (typeof result === 'object' || typeof result === 'function') ? result.then : undefined;
    } catch {
      console.error('TdModal: beforeClose threw — the dialog stays open'); // fixed text, never the caller's error (SEC-3)
      return Promise.resolve(false);
    }
    if (typeof then !== 'function') {
      if (result === false || inst.closed) return Promise.resolve(inst.closed);
      inst.close(value);
      return Promise.resolve(true);
    }
    const pending = Promise.resolve().then(() => new Promise((res, rej) => {
      // the captured `then` — never re-read — called only AFTER the pending Promise is installed below (review r4 E2):
      // a synchronous thenable re-entering requestClose() gets that same Promise, never a second guard run
      try { then.call(result, res, rej); } catch { rej(); }
    })).then((v) => {
      inst.guarding = null;
      if (inst.closed) return true; // closed by code meanwhile: the guard's answer no longer matters
      if (v === false) return false;
      inst.close(value);
      return true;
    }, () => {
      inst.guarding = null;
      if (inst.closed) return true;
      console.error('TdModal: beforeClose rejected — the dialog stays open');
      return false;
    });
    inst.guarding = pending;
    return pending;
  }

  /** Close the top modal. */
  static close() {
    const top = TdModalStackManager.getTop();
    if (top) this.closeById(top.id);
  }

  /**
   * Close a modal by id (any position in the stack).
   * @param {string} modalId
   */
  static closeById(modalId) {
    const inst = TdModalStackManager.stack.find((m) => m.id === modalId);
    if (inst && typeof inst.close === 'function') {
      inst.close();
      return;
    }
    TdModal._removeFocusTrap(modalId);
    const removed = TdModalStackManager.removeById(modalId);
    if (removed && removed.element && removed.element.parentNode) removed.element.remove();
  }

  /** Close every modal (top first); focus ends on the bottom-most opener. */
  static closeAll() {
    TdModalStackManager.closeAll();
    for (const id of Array.from(TdModal._focusTrapHandlers.keys())) TdModal._removeFocusTrap(id);
  }

  /**
   * @private single close path (idempotent)
   * @param {object} inst
   * @param {*} [value] passed to onClose (action value)
   */
  static _closeInstance(inst, value) {
    if (inst.closed) return;
    inst.closed = true;
    // v0.27.0 (§A): phase 1 of the shared dialog-layer close (popups covered, closing state + inert dialog, stack
    // bookkeeping, layer released, focus restored by _restoreFocus below, onClose) — then the root is removed after the
    // exit transition (_exitMs). Same steps, same order as before the extraction.
    inst.handle.close(value);
  }

  /**
   * @private Focus (D10) on close — the modal's own restore (stack-aware), run by the dialog-layer controller.
   * @param {object} inst
   * @param {{ wasTop: boolean, focusWasHere: boolean, over: Element|null }} ctx
   */
  static _restoreFocus(inst, ctx) {
    const root = inst.element;
    const { wasTop, focusWasHere, over } = ctx;
    // Focus (D10): resolved when this dialog was on top; moved only if focus was in it (never steal it from a higher
    // layer — that layer follows the hand-off when it releases, e.g. the loading overlay).
    // The outward opener: walk out of dialogs that are gone, then through closed overlays' hand-offs (an opener inside
    // a closed lightbox → that lightbox's opener). Never a node of this closing dialog (v0.21.1 review round 2: an
    // out-of-order teardown could otherwise hand focus back to ourselves).
    let opener = inst.opener;
    let owner = inst.openerOwner;
    while (opener && owner && owner.closed) { // opener sat in a dialog that is gone → that dialog's opener
      opener = owner.opener;
      owner = owner.openerOwner;
    }
    let resolved = followFocusHandoff(opener);
    if (resolved && root.contains(resolved)) resolved = null;
    if (wasTop) {
      const newTop = TdModalStackManager.getTop();
      // v0.21.1: promoted over a still-open layer (modal → lightbox → this modal) → that layer is the one below, not
      // the previous modal (inert under it): the opener inside it, else that layer itself; then the new top dialog.
      const below = over ? over : (newTop ? newTop.element : null);
      const openerOk = !!resolved && resolved.isConnected && (!below || below.contains(resolved));
      const overTarget = over
        ? /** @type {HTMLElement|null} */ (over.querySelector('[role="dialog"], [role="alertdialog"]'))
          || (over instanceof HTMLElement ? over : null)
        : null;
      const chain = [openerOk ? resolved : null, overTarget, newTop ? newTop.dialog : null]
        .filter((t) => t instanceof HTMLElement && !root.contains(t));
      setFocusHandoff(root, chain[0] || null);
      if (focusWasHere) {
        let moved = false;
        for (const t of chain) { // a target that cannot take focus (inert / hidden) → the next one down
          try { t.focus({ preventScroll: true }); } catch { /* ignore */ }
          if (document.activeElement === t) { moved = true; break; }
        }
        // Every explicit target failed (e.g. the opener was removed and an UNPROMOTED lightbox is below): the top
        // registered boundary (its dialog / element) — restoreFocus never returns into this dialog (released above).
        if (!moved) moved = restoreFocus(null) && !root.contains(document.activeElement);
        if (!moved && root.contains(document.activeElement) && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }
    } else {
      // Not on top (closed under a higher dialog / lightbox): whoever later resolves through this dialog follows its
      // own outward opener chain, not the current top dialog (which may be the very dialog resolving it).
      setFocusHandoff(root, resolved);
    }
  }

  /**
   * @private How long the closing root stays connected: the whole exit transition actually computed in the closing
   * state (dialog + scrim) — under reduced motion that is the 120 ms opacity fade (P5), otherwise the longer of
   * --td-modal-exit-dur (scale) and --td-modal-exit-fade-dur (opacity, scrim).
   * @param {object} inst
   * @returns {number}
   */
  static _exitMs(inst) {
    const root = inst.element;
    const measured = transitionEndMs(inst.dialog, root.querySelector('.td-modal__backdrop'));
    if (prefersReducedMotion()) return (measured === null ? REDUCED_EXIT_MS : measured) + EXIT_MARGIN;
    return Math.max(EXIT_MS, TdModal._cssMs(root, '--td-modal-exit-dur', 0) + EXIT_MARGIN, (measured || 0) + EXIT_MARGIN);
  }

  /**
   * @private a CSS time custom property of `el` in ms ("300ms" / "0.3s"); `fallback` when unset or unparsable.
   * @param {Element} el
   * @param {string} prop
   * @param {number} fallback
   * @returns {number}
   */
  static _cssMs(el, prop, fallback) {
    let raw = '';
    try { raw = getComputedStyle(el).getPropertyValue(prop).trim(); } catch { return fallback; }
    const m = /^(-?[\d.]+)(ms|s)$/i.exec(raw);
    if (!m) return fallback;
    const n = Number(m[1]) * (m[2].toLowerCase() === 's' ? 1000 : 1);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  /**
   * Whether a modal with this id is still open (in the stack).
   * @private
   * @param {string} modalId
   */
  static _isOpen(modalId) {
    return TdModalStackManager.stack.some((m) => m.id === modalId);
  }

  /**
   * Promise-dialog message block (role=alertdialog + aria-describedby → the text).
   * @private
   * @param {'confirm'|'success'|'error'|'info'} kind
   * @param {string} message text
   * @param {string} [messageHtml] TRUSTED HTML (developer content only)
   */
  static _messageBlock(kind, message, messageHtml) {
    const wrap = document.createElement('div');
    wrap.className = kind === 'confirm' ? 'td-modal__message' : `td-modal__message td-modal__message--${kind}`;
    if (kind !== 'confirm') {
      const icon = document.createElement('span');
      icon.className = 'td-modal__icon';
      icon.setAttribute('data-td-icon', kind);
      icon.setAttribute('data-td-icon-size', 'l');
      icon.setAttribute('aria-hidden', 'true');
      wrap.appendChild(icon);
      fillIconSlots(wrap);
    }
    const p = document.createElement(typeof messageHtml === 'string' ? 'div' : 'p');
    p.className = 'td-modal__text';
    if (typeof messageHtml === 'string') p.innerHTML = messageHtml; // trusted hatch (D8)
    else p.textContent = message == null ? '' : String(message);
    wrap.appendChild(p);
    return { wrap, text: p };
  }

  /**
   * Confirm dialog — resolves exactly once: confirm → true; cancel / X / closeAll → false.
   * `onConfirm` returning a thenable keeps the dialog open with the confirm button busy; it resolves true and
   * closes when that settles to anything but `false`; `false` or a rejection keeps it open (D6). Sync callbacks
   * behave like `actions` (v0.16.0): returning `false` or throwing (logged with console.error) keeps it open;
   * anything else resolves true and closes.
   * @param {Object} options
   * @param {string} [options.title=TdModal.labels.confirmTitle]
   * @param {string} [options.message=TdModal.labels.confirmMessage] - Text.
   * @param {string} [options.messageHtml] - TRUSTED HTML message (developer content only); wins over `message`.
   * @param {string} [options.confirmText='Xác nhận']
   * @param {string} [options.cancelText='Hủy']
   * @param {'primary'|'danger'|'success'|'warning'} [options.confirmVariant='primary']
   * @param {Function} [options.onConfirm]
   * @param {Function} [options.onCancel]
   * @param {Element|null} [options.themeRoot] - v0.42.0: follow this element's theme scope (see show())
   * @param {string} [options.typeToConfirm] - v0.44.0: the confirm button works only once this phrase is typed in a
   *   field under the message (NFC, trimmed, whitespace runs = one space; case- and accent-sensitive; ≤ 100 code
   *   points). Until then it is `aria-disabled` (still focusable); a click / Enter shows the mismatch error. The field
   *   gets the first focus. PRESENT but invalid (not a string — null / undefined included —, empty / blank after
   *   normalisation, > 100 code points) → FAIL CLOSED: the Promise rejects with a TypeError (fixed message), no dialog
   *   opens, onConfirm never runs (Codex review round 1, SEC-1). The option is read ONCE (review r2 A): a getter / Proxy
   *   cannot pass validation with one value and build the gate with another; one that throws → the same rejection.
   * @returns {Promise<boolean>}
   */
  static confirm(options = {}) {
    const o = options || {};
    /** @type {string|null} the normalised phrase — the gate is built from this cached value only */
    let phrase = null;
    try {
      if (Object.prototype.hasOwnProperty.call(o, 'typeToConfirm')) {
        const prep = preparePhrase(o.typeToConfirm); // the ONLY read of the option
        if (!prep || prep.truncated) return Promise.reject(new TypeError('TdModal.confirm: typeToConfirm must be a non-empty string of at most 100 characters'));
        phrase = prep.phrase;
      }
    } catch {
      return Promise.reject(new TypeError('TdModal.confirm: typeToConfirm must be a non-empty string of at most 100 characters'));
    }
    return new Promise((resolve) => {
      const {
        title = TdModal.labels.confirmTitle || 'Xác nhận',
        message = TdModal.labels.confirmMessage || 'Bạn có chắc chắn?',
        messageHtml,
        confirmText = TdModal.labels.confirm || 'Xác nhận',
        cancelText = TdModal.labels.cancel || 'Hủy',
        confirmVariant = 'primary',
        onConfirm = () => {},
        onCancel = () => {},
        themeRoot = null,
      } = options || {};
      let settled = false;
      let confirming = false; // a close during onConfirm() is the confirmation, not a dismissal
      let modalId = '';
      const variant = ['primary', 'danger', 'success', 'warning'].includes(confirmVariant) ? confirmVariant : 'primary';
      const cancelButton = makeButton(cancelText, 'secondary');
      const confirmButton = makeButton(confirmText, variant);
      const gate = phrase === null ? null : TdModal._typeToConfirm(phrase, confirmButton);

      const settle = (value) => {
        if (settled) return false;
        settled = true;
        resolve(value);
        return true;
      };
      const setBusy = (busy) => {
        const inst = TdModalStackManager.stack.find((m) => m.id === modalId);
        if (inst) inst.busy = busy;
        setButtonBusy(confirmButton, busy);
        cancelButton.disabled = busy;
        const x = inst && inst.element.querySelector('.td-modal__close');
        if (x) x.disabled = busy;
        if (gate) gate.setBusy(busy);
      };

      cancelButton.addEventListener('click', () => {
        if (!settle(false)) return;
        try { TdModal.closeById(modalId); } catch { /* ignore */ }
        try { onCancel(); } catch { /* ignore */ }
      });
      confirmButton.addEventListener('click', () => {
        if (settled || confirmButton.getAttribute('aria-busy') === 'true') return;
        if (gate && !gate.check()) return; // v0.44.0: phrase not typed yet → the error, nothing else
        let result;
        confirming = true;
        let threw = false;
        try {
          result = typeof onConfirm === 'function' ? onConfirm() : undefined;
        } catch (err) {
          threw = true;
          console.error(err);
        }
        confirming = false;
        if (settled) return; // onConfirm closed the dialog itself (resolved true via onClose)
        if (threw) return; // like actions: a throwing handler keeps the dialog open
        if (!isThenable(result)) {
          if (result === false) return; // keep open
          if (!settle(true)) return;
          try { TdModal.closeById(modalId); } catch { /* ignore */ }
          return;
        }
        setBusy(true);
        Promise.resolve(result).then((v) => {
          if (settled) return;
          setBusy(false);
          if (v === false) return; // keep open
          settle(true);
          TdModal.closeById(modalId);
        }, (err) => {
          if (settled) return;
          setBusy(false);
          console.warn('TdModal.confirm onConfirm rejected:', err);
        });
      });

      const { wrap, text } = TdModal._messageBlock('confirm', message, messageHtml);
      let body = wrap;
      if (gate) {
        body = document.createDocumentFragment();
        body.append(wrap, gate.field);
      }
      modalId = TdModal._open({
        title,
        body,
        footer: [cancelButton, confirmButton],
        size: 'sm',
        themeRoot,
        // v0.44.0 (QĐ 10): with a phrase the field takes the first focus (the confirm button is locked anyway)
        focusTarget: gate ? gate.input : cancelButton,
        onClose: () => {
          if (confirming) { settle(true); return; }
          if (!settle(false)) return;
          try { onCancel(); } catch { /* ignore */ }
        },
      }, { role: 'alertdialog', message: text });
      if (gate) gate.describe(text.id);
    });
  }

  /**
   * @private v0.44.0 (plan v0.44.0-confirm-dirty QĐ 1-11): the type-to-confirm field of `confirm()` and its gate on the
   * confirm button. Every text (label template, phrase, messages) goes in as TEXT nodes — never innerHTML.
   * @param {string} phrase the normalised, validated phrase (confirm() reads and checks the option once)
   * @param {HTMLButtonElement} confirmButton
   * @returns {null | { field: HTMLElement, input: HTMLInputElement, check(): boolean, setBusy(b: boolean): void,
   *   describe(id: string): void }}
   */
  static _typeToConfirm(phrase, confirmButton) {
    const labels = TdModal.labels;
    const id = `td-modal-confirm-${++confirmSeq}`;
    const field = document.createElement('div');
    field.className = 'td-modal__confirm-field td-field';
    const label = document.createElement('label');
    label.className = 'td-field__label';
    label.htmlFor = `${id}-input`;
    const strong = document.createElement('strong');
    strong.className = 'td-modal__phrase';
    strong.textContent = phrase;
    const tpl = String(labels.typeToConfirmLabel || 'Gõ {phrase} để xác nhận');
    const at = tpl.indexOf('{phrase}');
    if (at === -1) label.append(document.createTextNode(`${tpl} `), strong);
    else {
      label.append(document.createTextNode(tpl.slice(0, at)), strong,
        document.createTextNode(tpl.slice(at + '{phrase}'.length).split('{phrase}').join(phrase)));
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `${id}-input`;
    input.className = 'td-field__control';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'none'); // never "off" (kit rule): "none" is the standard keyword
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('enterkeyhint', 'done');
    const error = document.createElement('span');
    error.className = 'td-field-error';
    error.id = `${id}-error`;
    error.hidden = true;
    const status = document.createElement('span');
    status.className = 'td-modal__confirm-status td-sr-only';
    status.setAttribute('role', 'status');
    field.append(label, input, error, status);

    let matched = false;
    let composing = false;
    let describedBy = '';
    const lock = () => {
      if (matched) confirmButton.removeAttribute('aria-disabled');
      else confirmButton.setAttribute('aria-disabled', 'true');
    };
    const syncDescribedBy = () => {
      const ids = [describedBy, error.hidden ? '' : error.id].filter(Boolean).join(' ');
      if (ids) input.setAttribute('aria-describedby', ids);
      else input.removeAttribute('aria-describedby');
    };
    const hideError = () => {
      if (error.hidden) return;
      error.hidden = true;
      error.textContent = '';
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-errormessage');
      syncDescribedBy();
    };
    const evaluate = () => {
      const now = phraseMatches(input.value, phrase);
      if (now === matched) return;
      matched = now;
      lock();
      // QĐ 8: announce the unlock once per transition — never every key
      status.textContent = matched ? String(labels.typeToConfirmMatched || '') : '';
    };
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => {
      composing = false;
      hideError(); // reward early, like the input path (review round 1, ISSUE-1)
      evaluate();
    });
    input.addEventListener('input', (e) => {
      if (composing || /** @type {InputEvent} */ (e).isComposing) return; // QĐ 5: an uncommitted IME word is not typed yet
      hideError(); // reward early
      evaluate();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.isComposing || e.keyCode === 229 || composing) return; // the IME's own Enter commits the word
      e.preventDefault();
      if (input.readOnly) return;
      confirmButton.click(); // QĐ 9: matched → confirm; else → the error (the click handler checks)
    });
    lock();
    return {
      field,
      input,
      check() {
        if (!composing) evaluate();
        if (matched) return true;
        const tplMsg = String(labels.typeToConfirmMismatch || '');
        error.textContent = tplMsg.split('{phrase}').join(phrase);
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-errormessage', error.id);
        syncDescribedBy();
        // the attempt came from the button: back to the field, which now reads as invalid + the error (described-by)
        if (document.activeElement !== input && !input.readOnly) {
          try { input.focus({ preventScroll: true }); } catch { /* ignore */ }
        }
        return false;
      },
      setBusy(busy) {
        input.readOnly = busy;
        if (!busy) lock(); // setButtonBusy() cleared aria-disabled
      },
      describe(messageId) {
        describedBy = messageId || '';
        syncDescribedBy();
      },
    };
  }

  /**
   * @private success/error/info: OK → true, dismiss → false.
   * @param {'success'|'error'|'info'} kind
   */
  static _notice(kind, options, defaults) {
    return new Promise((resolve) => {
      const {
        title = defaults.title,
        message = defaults.message,
        messageHtml,
        okText = TdModal.labels.ok || 'OK',
        themeRoot = null,
      } = options || {};
      let settled = false;
      let modalId = '';
      const okButton = makeButton(okText, defaults.variant);
      okButton.addEventListener('click', () => {
        if (settled) return;
        settled = true;
        resolve(true);
        try { TdModal.closeById(modalId); } catch { /* ignore */ }
      });
      const { wrap, text } = TdModal._messageBlock(kind, message, messageHtml);
      modalId = TdModal._open({
        title,
        body: wrap,
        footer: [okButton],
        size: 'sm',
        themeRoot,
        onClose: () => {
          if (settled) return;
          settled = true;
          resolve(false);
        },
      }, { role: 'alertdialog', message: text });
    });
  }

  /**
   * Success dialog — OK → true, dismiss → false.
   * @param {{ title?: string, message?: string, messageHtml?: string, okText?: string, themeRoot?: Element|null }} [options]
   *   `messageHtml` is TRUSTED HTML (developer content only).
   * @returns {Promise<boolean>}
   */
  static success(options = {}) {
    return TdModal._notice('success', options, { title: TdModal.labels.successTitle || 'Thành công', message: 'Thao tác đã hoàn tất', variant: 'success' });
  }

  /**
   * Error dialog — OK → true, dismiss → false.
   * @param {{ title?: string, message?: string, messageHtml?: string, okText?: string, themeRoot?: Element|null }} [options]
   *   `messageHtml` is TRUSTED HTML (developer content only).
   * @returns {Promise<boolean>}
   */
  static error(options = {}) {
    return TdModal._notice('error', options, { title: TdModal.labels.errorTitle || 'Lỗi', message: 'Đã xảy ra lỗi', variant: 'danger' });
  }

  /**
   * Info dialog — OK → true, dismiss → false.
   * @param {{ title?: string, message?: string, messageHtml?: string, okText?: string, themeRoot?: Element|null }} [options]
   *   `messageHtml` is TRUSTED HTML (developer content only).
   * @returns {Promise<boolean>}
   */
  static info(options = {}) {
    return TdModal._notice('info', options, { title: TdModal.labels.infoTitle || 'Thông tin', message: '', variant: 'primary' });
  }

  // TdModal.loading() removed — use TdLoading.show() / TdLoading.hide() instead

  /**
   * Configure content, size and per-instance custom properties.
   * @private
   */
  static _configureModal(root, options = {}, instance = null) {
    const {
      title = 'Modal',
      body = '',
      footer = null,
      actions = null,
      size = 'md',
      width = null,
      height = null,
      fullViewport = false,
      closable = true,
      showHeader = true,
      showFooter = true,
    } = options;
    const dialog = root.querySelector('.td-modal__dialog');
    const header = root.querySelector('.td-modal__header');
    const titleEl = root.querySelector('.td-modal__title');
    const closeBtn = root.querySelector('.td-modal__close');
    const bodyEl = root.querySelector('.td-modal__body');
    const footerEl = root.querySelector('.td-modal__footer');
    const titleText = title == null ? '' : String(title);

    titleEl.textContent = titleText;
    header.hidden = !showHeader;
    if (showHeader) {
      dialog.setAttribute('aria-labelledby', titleEl.id);
      dialog.removeAttribute('aria-label');
    } else {
      dialog.removeAttribute('aria-labelledby');
      if (titleText) dialog.setAttribute('aria-label', titleText);
    }
    closeBtn.hidden = closable === false;
    closeBtn.addEventListener('click', () => {
      if (instance && instance.busy) return;
      if (instance && instance.handle) TdModal._requestClose(instance, 'button'); // v0.44.0: through the guard
      else TdModal.closeById(root.id);
    });

    if (typeof body === 'string') bodyEl.innerHTML = body; // TRUSTED hatch (documented)
    else if (body && typeof body === 'object' && typeof body.nodeType === 'number') bodyEl.appendChild(body);

    footerEl.replaceChildren();
    if (showFooter && Array.isArray(actions) && actions.length) {
      TdModal._renderActions(footerEl, actions, instance, root);
    } else if (showFooter && footer) {
      for (const el of (Array.isArray(footer) ? footer : [footer])) {
        if (el && typeof el.nodeType === 'number') footerEl.appendChild(el);
      }
    }
    footerEl.hidden = footerEl.childNodes.length === 0;

    root.className = `td-modal td-modal--${SIZES.includes(size) ? size : 'md'}${fullViewport ? ' td-modal--viewport' : ''}`;
    const setProp = (name, v) => { if (v) dialog.style.setProperty(name, v); };
    if (!fullViewport) {
      setProp('--td-modal-w', cssValue('width', width, 'width'));
      setProp('--td-modal-h', cssValue('height', height, 'height'));
    }
    if (options.bodyPadding !== undefined) {
      setProp('--td-modal-body-pad', cssValue('padding', options.bodyPadding, 'bodyPadding'));
    }
    if (options.bodyOverflow !== undefined) {
      const o = String(options.bodyOverflow);
      if (OVERFLOWS.includes(o)) dialog.style.setProperty('--td-modal-body-overflow', o);
      else console.warn(`TdModal: ignored invalid bodyOverflow "${o}"`);
    }
  }

  /**
   * Footer actions (D6).
   * @private
   */
  static _renderActions(footerEl, actions, instance, root) {
    const buttons = [];
    // v0.44.0 (QĐ 14): a closing action goes through the guard too (it is the user asking to close)
    const closeWith = (value) => (instance ? TdModal._requestClose(instance, 'action', value) : TdModal.closeById(root.id));
    const setBusy = (busyBtn, busy) => {
      if (instance) instance.busy = busy;
      for (const b of buttons) {
        if (b.btn === busyBtn) setButtonBusy(b.btn, busy);
        else b.btn.disabled = busy || b.disabled;
      }
      const x = root.querySelector('.td-modal__close');
      if (x) x.disabled = busy;
    };
    for (const a of actions) {
      if (!a || typeof a !== 'object') continue;
      const btn = makeButton(a.label, typeof a.variant === 'string' ? a.variant : 'secondary');
      const entry = { btn, disabled: !!a.disabled };
      btn.disabled = entry.disabled;
      buttons.push(entry);
      btn.addEventListener('click', () => {
        if ((instance && (instance.busy || instance.closed || instance.guarding))
          || btn.getAttribute('aria-busy') === 'true') return;
        const shouldClose = a.close !== false;
        let result;
        try {
          result = typeof a.onClick === 'function' ? a.onClick({ id: root.id, value: a.value, button: btn }) : undefined;
        } catch (err) {
          console.error(err);
          return; // a throwing handler keeps the dialog open
        }
        if (!isThenable(result)) {
          if (result !== false && shouldClose) closeWith(a.value);
          return;
        }
        setBusy(btn, true);
        Promise.resolve(result).then((v) => {
          if (instance && instance.closed) return;
          setBusy(btn, false);
          if (v !== false && shouldClose) closeWith(a.value);
        }, (err) => {
          if (instance && instance.closed) return;
          setBusy(btn, false);
          console.warn('TdModal action rejected:', err);
        });
      });
      footerEl.appendChild(btn);
    }
  }

  /**
   * Release the keyboard/inert registration of a modal (idempotent).
   * @private
   * @param {string} modalId
   */
  static _removeFocusTrap(modalId) {
    const entry = TdModal._focusTrapHandlers.get(modalId);
    if (entry) {
      TdModal._focusTrapHandlers.delete(modalId);
      if (entry.layer) entry.layer.release();
    }
  }
}
