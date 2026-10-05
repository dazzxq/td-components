import { escapeHtml } from '../utils/escape.js';
import './td-scan-input.js';
import '../styles/story-layout.css';

export default {
  title: 'Form/Scan input',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    placeholder: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    beep: { control: 'boolean' },
  },
};

const esc = (v) => escapeHtml(String(v ?? ''));

/**
 * Luhn check of a 15-digit IMEI — an APP example (the kit knows nothing about IMEI; plan v0.38.0 QĐ 9).
 * @param {string} v
 */
function luhnImei(v) {
  if (!/^\d{15}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(v[14 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * STORY / DEMO ONLY — a fake scanner: types `code` into the input one character every 3 ms through `beforeinput` +
 * `input` (like a keyboard-wedge scanner), then Enter. Real pages never need this.
 * @param {HTMLElement} host
 * @param {string} code
 */
async function fakeScan(host, code) {
  const input = host.querySelector('input.td-scan__input');
  input.focus();
  for (const ch of code) {
    const ok = input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ch }));
    if (ok) {
      input.setRangeText(ch, input.selectionStart, input.selectionEnd, 'end'); // like typing: replaces a selection
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }));
    }
    await new Promise((r) => setTimeout(r, 3));
  }
  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
}

/** Single (default): one code (an order number); a valid scan stays selected — the next scan overwrites it. */
export const Single = {
  render: (args) => `<form class="sb-stack" novalidate>
    <td-scan-input name="order" label="${esc(args.label)}" placeholder="${esc(args.placeholder)}"${args.required ? ' required' : ''}${args.disabled ? ' disabled' : ''}${args.beep ? ' beep' : ''}></td-scan-input>
    <p><button type="button" class="td-btn td-btn--secondary td-btn--sm" data-fake="DH-2026-000123">Giả lập máy quét</button></p>
    <p class="sb-note" data-out>Sự kiện: —</p></form>`,
  args: { label: 'Mã đơn hàng', placeholder: 'Quét mã vạch trên phiếu', required: true, disabled: false, beep: false },
  play: ({ canvasElement }) => {
    const host = canvasElement.querySelector('td-scan-input');
    const out = canvasElement.querySelector('[data-out]');
    for (const t of ['scan', 'scan-invalid', 'scan-duplicate']) {
      host.addEventListener(t, (e) => { out.textContent = `Sự kiện ${t}: ${JSON.stringify(e.detail)}`; });
    }
    canvasElement.querySelector('[data-fake]').addEventListener('click', (e) => fakeScan(host, e.currentTarget.dataset.fake));
  },
};

/** Multiple: one row per scanned IMEI (Luhn + a fake 300 ms server check in the APP's validate), FormData `imei[]`. */
export const MultipleImei = {
  render: (args) => `<form class="sb-stack" novalidate>
    <td-scan-input multiple name="imei[]" label="${esc(args.label)}" inputmode="numeric" max="50"${args.beep ? ' beep' : ''}></td-scan-input>
    <p class="sb-row"><button type="button" class="td-btn td-btn--secondary td-btn--sm" data-fake="356938035643809">Quét IMEI hợp lệ</button>
    <button type="button" class="td-btn td-btn--secondary td-btn--sm" data-fake="356938035643801">Quét IMEI sai Luhn</button>
    <button type="button" class="td-btn td-btn--secondary td-btn--sm" data-fake="490154203237518">Quét IMEI "đã nhập kho"</button></p></form>`,
  args: { label: 'IMEI nhập kho', beep: true },
  play: ({ canvasElement }) => {
    const host = canvasElement.querySelector('td-scan-input');
    host.validate = async (value, { signal }) => {
      if (!luhnImei(value)) return 'IMEI không hợp lệ (sai Luhn)';
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, 300);
        signal.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); });
      });
      return value === '490154203237518' ? 'Máy này đã nhập kho' : true;
    };
    for (const b of canvasElement.querySelectorAll('[data-fake]')) b.addEventListener('click', () => fakeScan(host, b.dataset.fake));
  },
};

/** States: error (manual typing refused), locked, read-only. */
export const States = {
  render: () => `<div class="sb-stack">
    <td-scan-input label="Chỉ nhận máy quét" manual="reject" error-text="Vui lòng dùng máy quét."></td-scan-input>
    <td-scan-input label="Đang khoá" value="DH-0001" disabled></td-scan-input>
    <td-scan-input label="Chỉ đọc" value="DH-0002" readonly></td-scan-input></div>`,
};

/** SSR (`scan-input@1`, multiple): what php/td.php td_scan_input(…, ['multiple' => true]) prints — adopted in place. */
export const ServerRenderedMultiple = {
  render: (args) => `<td-scan-input data-td-ssr="scan-input@1" id="scan-ssr" name="imei[]" label="${esc(args.label)}" multiple>
    <div class="td-scan" data-mode="multiple"><label class="td-scan__label" for="scan-ssr-input">${esc(args.label)}</label>
    <div class="td-scan__box"><input type="text" class="td-scan__input" id="scan-ssr-input" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done"></div>
    <textarea class="td-scan__fallback" name="imei[]" rows="3" aria-label="Nhập tay, mỗi dòng một mã"></textarea>
    <ul class="td-scan__list" aria-label="Mã đã quét"><li class="td-scan__item" data-value="356938035643809"><span class="td-scan__value">356938035643809</span></li></ul></div>
    <input type="hidden" class="td-scan__hidden" name="imei[]" value="356938035643809"></td-scan-input>`,
  args: { label: 'IMEI (SSR)' },
};
