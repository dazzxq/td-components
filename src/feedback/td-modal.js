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
import { LAYERS, register as registerLayer, trapTab, focusablesIn } from '../utils/layers.js';
import { fillIconSlots } from '../icons/td-icon.js';

const MODAL_LAYER = LAYERS.modal; // --td-z-modal
const SIZES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', 'full'];
const BTN_VARIANTS = ['primary', 'secondary', 'danger', 'success', 'warning', 'info'];
const OVERFLOWS = ['visible', 'hidden', 'auto', 'scroll', 'clip'];
const FIELD = 'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])';
const EXIT_MS = 220; // ≥ --td-dur-base (exit transition) before the root is removed
const SPINNER = '<span class="td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true" hidden>'
  + '<svg class="td-spinner__svg" viewBox="0 0 50 50" aria-hidden="true" focusable="false">'
  + '<circle class="td-spinner__track" cx="25" cy="25" r="20"></circle>'
  + '<circle class="td-spinner__arc" cx="25" cy="25" r="20"></circle></svg></span>';

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
  /** Default labels (Vietnamese); override per site: `TdModal.labels.close = 'Close'`. */
  static labels = { close: 'Đóng', confirm: 'Xác nhận', cancel: 'Hủy', ok: 'OK' };

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
   * @param {boolean} [options.closable=true] - Show the X. The modal NEVER closes on backdrop click or Escape.
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
    instance.layer = registerLayer({
      layer: MODAL_LAYER,
      element: root,
      blocking: true,
      onEscape: () => true, // ADR 0006: Escape never closes; consumed so it cannot reach a layer below
      onTab: (e) => trapTab(e, dialog, MODAL_LAYER),
    });
    TdModal._focusTrapHandlers.set(id, { el: root, layer: instance.layer });
    // Focus moves into the dialog immediately (the opener is inert now); the initial target is chosen once the
    // content is laid out (second frame).
    try { dialog.focus({ preventScroll: true }); } catch { /* ignore */ }

    const autoFocus = opts.autoFocus !== false;
    const focusTarget = opts.focusTarget || null;
    requestAnimationFrame(() => {
      if (!TdModal._isOpen(id)) return;
      requestAnimationFrame(() => {
        if (!TdModal._isOpen(id)) return;
        root.setAttribute('data-state', 'open');
        TdModal._initialFocus(instance, autoFocus, focusTarget);
        if (typeof opts.onShow === 'function') {
          try { opts.onShow(root, opts.onShowPayload); } catch (err) { console.warn('TdModal onShow failed:', err); }
        }
      });
    });
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
      const field = body ? [...body.querySelectorAll(FIELD)].find((el) => !el.closest('[hidden]') && el.getClientRects().length > 0) : null;
      if (tryFocus(field)) return;
      const close = dialog.querySelector('.td-modal__close');
      const all = focusablesIn(dialog);
      if (tryFocus(all.find((el) => el !== close))) return;
      if (tryFocus(all[0])) return;
    }
    tryFocus(dialog);
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
    const root = inst.element;
    const wasTop = TdModalStackManager.getTop() === inst;
    const active = document.activeElement;
    const focusWasHere = !active || active === document.body || root.contains(active);

    TdModalStackManager.removeById(inst.id);
    TdModal._removeFocusTrap(inst.id);
    if (inst.layer) inst.layer.release();

    // Focus (D10): only when this dialog was on top and focus was in it (never steal it from a higher layer).
    if (wasTop && focusWasHere) {
      const newTop = TdModalStackManager.getTop();
      let opener = inst.opener;
      let owner = inst.openerOwner;
      while (opener && owner && owner.closed) { // opener sat in a dialog that is gone → that dialog's opener
        opener = owner.opener;
        owner = owner.openerOwner;
      }
      const openerOk = opener && opener.isConnected && (!newTop || newTop.element.contains(opener));
      const target = openerOk ? opener : (newTop ? newTop.dialog : null);
      if (target) {
        try { target.focus({ preventScroll: true }); } catch { /* ignore */ }
      } else if (root.contains(document.activeElement) && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }

    root.setAttribute('data-state', 'closing');
    root.setAttribute('inert', '');
    if (typeof inst.onClose === 'function') {
      try { inst.onClose(value); } catch (err) { console.error(err); }
    }
    const remove = () => {
      root.hidden = true;
      if (root.parentNode) root.remove();
    };
    if (prefersReducedMotion()) setTimeout(remove, 0);
    else setTimeout(remove, EXIT_MS);
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
   * (and throwing ones) resolve true and close.
   * @param {Object} options
   * @param {string} [options.title='Xác nhận']
   * @param {string} [options.message='Bạn có chắc chắn?'] - Text.
   * @param {string} [options.messageHtml] - TRUSTED HTML message (developer content only); wins over `message`.
   * @param {string} [options.confirmText='Xác nhận']
   * @param {string} [options.cancelText='Hủy']
   * @param {'primary'|'danger'|'success'|'warning'} [options.confirmVariant='primary']
   * @param {Function} [options.onConfirm]
   * @param {Function} [options.onCancel]
   * @returns {Promise<boolean>}
   */
  static confirm(options = {}) {
    return new Promise((resolve) => {
      const {
        title = 'Xác nhận',
        message = 'Bạn có chắc chắn?',
        messageHtml,
        confirmText = TdModal.labels.confirm || 'Xác nhận',
        cancelText = TdModal.labels.cancel || 'Hủy',
        confirmVariant = 'primary',
        onConfirm = () => {},
        onCancel = () => {},
      } = options || {};
      let settled = false;
      let modalId = '';
      const variant = ['primary', 'danger', 'success', 'warning'].includes(confirmVariant) ? confirmVariant : 'primary';
      const cancelButton = makeButton(cancelText, 'secondary');
      const confirmButton = makeButton(confirmText, variant);

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
      };

      cancelButton.addEventListener('click', () => {
        if (!settle(false)) return;
        try { TdModal.closeById(modalId); } catch { /* ignore */ }
        try { onCancel(); } catch { /* ignore */ }
      });
      confirmButton.addEventListener('click', () => {
        if (settled || confirmButton.getAttribute('aria-busy') === 'true') return;
        let result;
        try { result = typeof onConfirm === 'function' ? onConfirm() : undefined; } catch { result = undefined; }
        if (!isThenable(result)) {
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
      modalId = TdModal._open({
        title,
        body: wrap,
        footer: [cancelButton, confirmButton],
        size: 'sm',
        focusTarget: cancelButton,
        onClose: () => {
          if (!settle(false)) return;
          try { onCancel(); } catch { /* ignore */ }
        },
      }, { role: 'alertdialog', message: text });
    });
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
   * @param {{ title?: string, message?: string, messageHtml?: string, okText?: string }} [options]
   *   `messageHtml` is TRUSTED HTML (developer content only).
   * @returns {Promise<boolean>}
   */
  static success(options = {}) {
    return TdModal._notice('success', options, { title: 'Thành công', message: 'Thao tác đã hoàn tất', variant: 'success' });
  }

  /**
   * Error dialog — OK → true, dismiss → false.
   * @param {{ title?: string, message?: string, messageHtml?: string, okText?: string }} [options]
   *   `messageHtml` is TRUSTED HTML (developer content only).
   * @returns {Promise<boolean>}
   */
  static error(options = {}) {
    return TdModal._notice('error', options, { title: 'Lỗi', message: 'Đã xảy ra lỗi', variant: 'danger' });
  }

  /**
   * Info dialog — OK → true, dismiss → false.
   * @param {{ title?: string, message?: string, messageHtml?: string, okText?: string }} [options]
   *   `messageHtml` is TRUSTED HTML (developer content only).
   * @returns {Promise<boolean>}
   */
  static info(options = {}) {
    return TdModal._notice('info', options, { title: 'Thông tin', message: '', variant: 'primary' });
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
      TdModal.closeById(root.id);
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
    const closeWith = (value) => (instance ? instance.close(value) : TdModal.closeById(root.id));
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
        if ((instance && (instance.busy || instance.closed)) || btn.getAttribute('aria-busy') === 'true') return;
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
