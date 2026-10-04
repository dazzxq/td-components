import { escapeHtml } from '../utils/escape.js';
import './td-otp-input.js';
import '../styles/story-layout.css';

export default {
  title: 'Form/OTP input',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    readonly: { control: 'boolean' },
    errorText: { control: 'text' },
  },
};

const esc = (v) => escapeHtml(String(v ?? ''));
const CELLS = `<span class="td-otp__cells" aria-hidden="true">${'<span class="td-otp__cell"></span>'.repeat(6)}</span>`;

/** One native input over 6 decorative cells: type, paste "123 456", or let the phone fill the SMS code. */
export const Default = {
  render: (args) => `<form class="sb-stack" id="otp-form" novalidate>
    <td-otp-input name="otp_code" label="${esc(args.label)}"${args.required ? ' required' : ''}${args.disabled ? ' disabled' : ''}${args.readonly ? ' readonly' : ''}${args.errorText ? ` error-text="${esc(args.errorText)}"` : ''}></td-otp-input>
    <p class="sb-note" id="otp-out">Sự kiện complete: —</p></form>`,
  args: { label: 'Mã xác thực', required: true, disabled: false, readonly: false, errorText: '' },
  play: ({ canvasElement }) => {
    const out = canvasElement.querySelector('#otp-out');
    canvasElement.querySelector('td-otp-input').addEventListener('complete', (e) => {
      out.textContent = `Sự kiện complete: ${e.detail.value} (kit không tự submit — app gọi API)`;
    });
  },
};

/** Error state (wrong code) and the locked states. */
export const States = {
  render: () => `<div class="sb-stack">
    <td-otp-input label="Sai mã" value="123450" error-text="Mã không đúng, còn 2 lần thử."></td-otp-input>
    <td-otp-input label="Đang xác thực" value="123456" readonly></td-otp-input>
    <td-otp-input label="Bị khoá" disabled></td-otp-input></div>`,
};

/** SSR (`otp-input@1`): the markup php/td.php td_otp_input(…, ['element' => true]) prints — adopted in place. */
export const ServerRendered = {
  render: (args) => `<td-otp-input data-td-ssr="otp-input@1" id="otp-ssr" name="otp_code" label="${esc(args.label)}" required>
    <div class="td-otp"><label class="td-otp__label" for="otp-ssr-input">${esc(args.label)}</label><div class="td-otp__box">
    <input type="text" class="td-otp__input" id="otp-ssr-input" inputmode="numeric" autocomplete="one-time-code" name="otp_code" maxlength="6" pattern="[0-9]{6}" required>${CELLS}</div></div></td-otp-input>`,
  args: { label: 'Mã 2FA' },
};

/** No JS: the native field td_otp_input() prints by default (maxlength 6, pattern, one-time-code). */
export const NativeNoJs = {
  render: (args) => `<div class="td-otp"><label class="td-otp__label" for="otp-native">${esc(args.label)}</label><div class="td-otp__box">
    <input type="text" class="td-otp__input" id="otp-native" inputmode="numeric" autocomplete="one-time-code" name="otp_code" maxlength="6" pattern="[0-9]{6}"></div></div>`,
  args: { label: 'Mã xác thực (không JS)' },
};

/** v0.36.0: `length` 1–10 + `charset` / `case` — 6 digits, 8 digits, Steam Guard-like 5 upper-case alphanumerics. */
export const LengthsAndCharsets = {
  render: () => `<div class="sb-stack">
    <td-otp-input label="Mã 6 số (mặc định)" name="otp6"></td-otp-input>
    <td-otp-input label="Mã 8 số" name="otp8" length="8"></td-otp-input>
    <td-otp-input label="Mã Steam Guard (5 ký tự chữ-số)" name="steam" length="5" charset="alphanumeric"></td-otp-input>
    <p class="sb-note">Bộ có chữ: gõ / dán "wm-x7q" → WMX7Q (chuẩn hoá chữ hoa, bỏ gạch / khoảng trắng). Nên tắt bộ gõ tiếng Việt khi nhập mã chữ.</p></div>`,
};
