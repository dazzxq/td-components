import { escapeHtml } from '../utils/escape.js';
import { TdModal } from '../feedback/td-modal.js';
import './td-color-picker.js';
import '../styles/story-layout.css';

export default {
  title: 'Form/Color picker',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    contrast: { control: 'boolean' },
  },
};

const esc = (v) => escapeHtml(String(v ?? ''));

/** Default: the setting form shape — text input always visible, the swatch opens the popup; FormData `#rrggbb`. */
export const Default = {
  render: (args) => `<form class="sb-stack" novalidate>
    <td-color-picker name="brand_color" label="${esc(args.label)}" value="${esc(args.value)}"${args.required ? ' required' : ''}${args.disabled ? ' disabled' : ''}${args.contrast ? ' contrast' : ''}></td-color-picker>
    <p class="sb-note" data-out>Sự kiện: —</p></form>`,
  args: { label: 'Màu thương hiệu', value: '#1d4ed8', required: false, disabled: false, contrast: false },
  play: ({ canvasElement }) => {
    const host = canvasElement.querySelector('td-color-picker');
    const out = canvasElement.querySelector('[data-out]');
    for (const t of ['input', 'change']) host.addEventListener(t, (e) => { if (e.detail) out.textContent = `Sự kiện ${t}: ${e.detail.value || '(rỗng)'}`; });
  },
};

/** Brand presets with labels (property) + the contrast row (white / black text on the colour). */
export const BrandPresets = {
  render: (args) => `<div class="sb-stack"><td-color-picker id="cp-brand" label="${esc(args.label)}" value="#b3261e" contrast></td-color-picker></div>`,
  args: { label: 'Màu nút chính' },
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#cp-brand').presets = [
      { value: '#b3261e', label: 'Đỏ thương hiệu' }, { value: '#1f2937', label: 'Than chì' },
      { value: '#0f766e', label: 'Xanh ngọc đậm' }, { value: '#f59e0b', label: 'Hổ phách' }, { value: '#ffffff', label: 'Trắng' },
    ];
  },
};

/** custom="false": presets only (dcms `custom: false`) — the text is read-only, no area / hue. */
export const PresetsOnly = {
  render: (args) => `<div class="sb-stack"><td-color-picker label="${esc(args.label)}" custom="false" presets="#ef4444 #f59e0b #10b981 #3b82f6 #8b5cf6" value="#10b981"></td-color-picker></div>`,
  args: { label: 'Màu nhãn' },
};

/** States: error, locked, read-only, invalid text (badInput). */
export const States = {
  render: () => `<div class="sb-stack">
    <td-color-picker label="Có lỗi" value="#ffffff" error-text="Màu nền không đủ tương phản với chữ."></td-color-picker>
    <td-color-picker label="Đang khoá" value="#1d4ed8" disabled></td-color-picker>
    <td-color-picker label="Chỉ đọc" value="#b3261e" readonly></td-color-picker>
    <td-color-picker label="Mã sai" value="xanh"></td-color-picker></div>`,
};

/** Inside a TdModal: the popup floats above the dialog; Escape closes only the popup. */
export const InModal = {
  render: () => '<div class="sb-stack"><button type="button" class="td-btn td-btn--secondary" data-open>Mở hộp thoại cài đặt</button></div>',
  play: ({ canvasElement }) => {
    canvasElement.querySelector('[data-open]').addEventListener('click', () => {
      const el = document.createElement('td-color-picker');
      el.setAttribute('label', 'Màu tiêu đề');
      el.setAttribute('value', '#0f766e');
      TdModal.show({ title: 'Cài đặt giao diện', body: el });
    });
  },
};

/** A dark region of a light page: the popup follows the region theme (ADR 0020 bridge). */
export const DarkRegion = {
  render: (args) => `<section data-td-theme="dark" class="sb-stack sb-dark-region"><td-color-picker label="${esc(args.label)}" value="#93c5fd" contrast></td-color-picker></section>`,
  args: { label: 'Màu liên kết (vùng tối)' },
};

/** SSR (`color-picker@1`): what php/td.php td_color_picker(…, ['element' => true]) prints — adopted in place. */
export const ServerRendered = {
  render: (args) => `<td-color-picker data-td-ssr="color-picker@1" id="cp-ssr-host" name="accent" value="#1d4ed8" label="${esc(args.label)}">
    <div class="td-color"><label class="td-color__label" for="cp-ssr">${esc(args.label)}</label><div class="td-color__box"><span class="td-color__swatch" aria-hidden="true"></span>
    <input type="text" class="td-color__input" id="cp-ssr" inputmode="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="64" placeholder="#000000" name="accent" value="#1d4ed8" pattern="#[0-9a-fA-F]{6}" title="Dạng #RRGGBB, ví dụ #1d4ed8"></div></div></td-color-picker>`,
  args: { label: 'Màu nhấn (SSR)' },
};
