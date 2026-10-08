import { escapeHtml } from '../utils/escape.js';
import '../styles/story-layout.css';
import './td-checkbox.js';

export default {
  title: 'Form/Checkbox',
  tags: ['autodocs'],
  argTypes: {
    checked: { control: 'boolean' },
    label: { control: 'text' },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    color: { control: 'color' },
  },
};

export const Default = {
  render: (args) => `
    <td-checkbox
      ${args.checked ? 'checked' : ''}
      label="${escapeHtml(String(args.label || ''))}"
      size="${escapeHtml(String(args.size || 'md'))}"
      ${args.color ? `color="${escapeHtml(String(args.color))}"` : ''}
    ></td-checkbox>
  `,
  args: {
    checked: false,
    label: 'Accept terms',
    size: 'md',
  },
};

export const Checked = {
  ...Default,
  args: { ...Default.args, checked: true, label: 'Checked item' },
};

export const SmallSize = {
  ...Default,
  args: { ...Default.args, size: 'sm', label: 'Small checkbox' },
};

export const LargeSize = {
  ...Default,
  args: { ...Default.args, size: 'lg', label: 'Large checkbox' },
};

export const CustomColor = {
  ...Default,
  args: { ...Default.args, checked: true, color: '#10b981', label: 'Green checkbox' },
};

/** Error contract: `error-text` / setError() → aria-invalid + aria-errormessage + note. */
export const WithError = {
  render: () => `<td-checkbox label="Tôi đồng ý với điều khoản" error-text="Bạn cần chọn mục này để tiếp tục"></td-checkbox>`,
};

/** Unlabeled (named by aria-label); the hit area stays ≥ 24×24 (44 on touch). */
export const AriaLabelOnly = {
  render: () => `<div class="sb-row"><td-checkbox size="sm" aria-label="Chọn"></td-checkbox><td-checkbox aria-label="Chọn"></td-checkbox><td-checkbox size="lg" aria-label="Chọn" checked></td-checkbox></div>`,
};

/**
 * v0.59.1 `label-position="start"`: the label BEFORE the box. CSS only — same DOM, one hit area; RTL puts the label on the
 * right. The hint / error starts on the label's start edge.
 */
export const LabelStart = {
  name: 'Nhãn trước ô tick',
  render: () => `<div class="sb-stack">
    <td-checkbox label="Hiển thị" label-position="start" checked></td-checkbox>
    <td-checkbox label="Hiển thị" label-position="start" size="sm"></td-checkbox>
    <td-checkbox label="Chọn tất cả" label-position="start" size="lg" indeterminate></td-checkbox>
    <td-checkbox label="Đồng ý điều khoản" label-position="start" helper-text="Bắt buộc để tiếp tục"></td-checkbox>
    <td-checkbox label="Đồng ý điều khoản" label-position="start" error-text="Bạn cần chọn mục này để tiếp tục"></td-checkbox>
    <div dir="rtl"><td-checkbox label="Hiển thị (RTL)" label-position="start" checked></td-checkbox></div>
  </div>`,
};
