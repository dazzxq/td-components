import { TdBaseElement } from '../base/td-base-element.js';
import { tdIcon } from '../icons/td-icon.js';

const VARIANTS = ['info', 'success', 'warning', 'danger'];
/** variant → registry status icon (colour is never the only cue). */
const ICONS = { info: 'info', success: 'success', warning: 'warning', danger: 'error' };

/**
 * Static alert / banner (v0.18.0 F5). Styles: td.css (`components/alert.css`, block `.td-alert`). Content layer →
 * solid tinted fill, not glass.
 *
 * ONE markup contract, shared with PHP `td_alert()` (SSR):
 *   <td-alert variant="success" heading="Thành công" dismissible>
 *     <div class="td-alert td-alert--success" role="status">
 *       <span class="td-alert__icon" aria-hidden="true"><svg class="td-icon td-icon--m" data-icon="success">…</svg></span>
 *       <div class="td-alert__body"><p class="td-alert__heading">Thành công</p><div class="td-alert__message">…</div></div>
 *       <button type="button" class="td-alert__close" aria-label="Đóng">…</button>   ← added by JS, dismissible only
 *     </div>
 *   </td-alert>
 * td.css styles that markup WITHOUT JS. On upgrade the element works IN PLACE — it never re-renders the text
 * (no innerHTML): it only syncs the variant class / role / icon, the heading when the attribute changes, and adds
 * the close button when `dismissible` (no JS → no close button, so never a dead control).
 * Authored without the inner markup (`<td-alert variant="warning">Nội dung</td-alert>`), the existing child NODES
 * are moved into `.td-alert__message` (not re-parsed).
 *
 * @element td-alert
 * @attr {string} variant - 'info' (default) | 'success' | 'warning' | 'danger'. danger → role="alert" (assertive),
 *   the others role="status".
 * @attr {string} heading - Optional heading text (text only).
 * @attr {boolean} dismissible - Adds a close button (label `TdAlert.labels.close`).
 *
 * @fires dismiss - Cancelable, bubbles. Fired by the close button or `dismiss()`; unless `preventDefault()` is
 *   called the element is removed from the DOM.
 */
export class TdAlert extends TdBaseElement {
  /** Default texts (Vietnamese); override per site: `TdAlert.labels.close = 'Close'`. */
  static labels = {
    close: 'Đóng',
  };

  static get observedAttributes() {
    return ['variant', 'heading', 'dismissible'];
  }

  static get booleanAttributes() {
    return ['dismissible'];
  }

  attributeChangedCallback(name, oldVal, newVal) {
    // An SSR heading is kept on upgrade even without the attribute; only an explicit change removes / rewrites it.
    if (name === 'heading' && oldVal !== newVal && this._initialized) this._headingChanged = true;
    super.attributeChangedCallback(name, oldVal, newVal);
  }

  /** @returns {'info'|'success'|'warning'|'danger'} */
  _variant() {
    const v = this.getAttribute('variant');
    return VARIANTS.includes(v) ? v : 'info';
  }

  /** The `.td-alert` block (direct child). */
  get alertElement() {
    return Array.from(this.children).find((c) => c.classList.contains('td-alert')) || null;
  }

  /**
   * Upgrade / sync IN PLACE (overrides the base innerHTML render — the text is never re-rendered).
   * @private
   */
  _doRender() {
    if (this._suppressRender) return;
    const variant = this._variant();
    let box = this.alertElement;
    if (!box) {
      // Authored content (no SSR markup): move the existing child nodes into the message.
      box = document.createElement('div');
      const body = document.createElement('div');
      body.className = 'td-alert__body';
      const message = document.createElement('div');
      message.className = 'td-alert__message';
      message.append(...Array.from(this.childNodes));
      body.appendChild(message);
      box.appendChild(body);
      this.appendChild(box);
    }
    box.classList.add('td-alert');
    for (const v of VARIANTS) box.classList.toggle(`td-alert--${v}`, v === variant);
    box.setAttribute('role', variant === 'danger' ? 'alert' : 'status');

    let body = box.querySelector(':scope > .td-alert__body');
    if (!body) {
      body = document.createElement('div');
      body.className = 'td-alert__body';
      box.appendChild(body);
    }

    // Icon: keep the SSR svg when it already shows the right glyph.
    let icon = box.querySelector(':scope > .td-alert__icon');
    if (!icon) {
      icon = document.createElement('span');
      icon.className = 'td-alert__icon';
      icon.setAttribute('aria-hidden', 'true');
      box.insertBefore(icon, box.firstChild);
    }
    const glyph = ICONS[variant];
    if (icon.querySelector('svg')?.getAttribute('data-icon') !== glyph) {
      const svg = tdIcon(glyph, { size: 'm' });
      icon.replaceChildren(...(svg ? [svg] : []));
    }

    this._syncHeading(body);
    this._syncClose(box);
  }

  /** @private */
  _syncHeading(body) {
    // Same rule as PHP td_alert(): blank → no heading; otherwise the value as is (so an SSR heading is never rewritten).
    const text = this.getAttribute('heading') || '';
    let heading = body.querySelector(':scope > .td-alert__heading');
    if (text.trim()) {
      if (!heading) {
        heading = document.createElement('p');
        heading.className = 'td-alert__heading';
        body.insertBefore(heading, body.firstChild);
      }
      if (heading.textContent !== text) heading.textContent = text;
    } else if (heading && this._headingChanged) {
      heading.remove();
    }
    this._headingChanged = false;
  }

  /** @private */
  _syncClose(box) {
    let btn = box.querySelector(':scope > .td-alert__close');
    if (!this.hasAttribute('dismissible')) {
      btn?.remove();
      this._boundClose = null;
      return;
    }
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'td-alert__close';
      const x = tdIcon('close', { size: 's' });
      if (x) btn.appendChild(x);
      box.appendChild(btn);
    }
    btn.setAttribute('aria-label', String(TdAlert.labels.close ?? ''));
    // One listener per button; disconnect drops it (base cleanups) and the reconnect render binds it again.
    if (this._boundClose !== btn) {
      this.listen(btn, 'click', () => this.dismiss());
      this._boundClose = btn;
      this._cleanups.push(() => { this._boundClose = null; });
    }
  }

  /**
   * Fire the cancelable `dismiss` event; unless it is prevented, remove the element.
   * @returns {boolean} true when the alert was removed
   */
  dismiss() {
    const ok = this.dispatchEvent(new CustomEvent('dismiss', { bubbles: true, composed: true, cancelable: true }));
    if (ok) this.remove();
    return ok;
  }
}

if (!customElements.get('td-alert')) {
  customElements.define('td-alert', TdAlert);
}
