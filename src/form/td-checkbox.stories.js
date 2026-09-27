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
