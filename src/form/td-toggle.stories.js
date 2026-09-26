import '../styles/story-layout.css';
import './td-toggle.js';

export default {
  title: 'Form/Toggle',
  tags: ['autodocs'],
  argTypes: {
    checked: { control: 'boolean' },
    disabled: { control: 'boolean' },
    label: { control: 'text' },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    color: { control: 'color' },
  },
};

export const Default = {
  render: (args) => `
    <td-toggle
      ${args.checked ? 'checked' : ''}
      ${args.disabled ? 'disabled' : ''}
      label="${args.label || ''}"
      size="${args.size || 'md'}"
      ${args.color ? `color="${args.color}"` : ''}
    ></td-toggle>
  `,
  args: {
    checked: false,
    disabled: false,
    label: 'Toggle me',
    size: 'md',
  },
};

export const Checked = {
  ...Default,
  args: { ...Default.args, checked: true, label: 'Active toggle' },
};

export const Disabled = {
  ...Default,
  args: { ...Default.args, disabled: true, label: 'Disabled toggle' },
};

export const SmallSize = {
  ...Default,
  args: { ...Default.args, size: 'sm', label: 'Small toggle' },
};

export const LargeSize = {
  ...Default,
  args: { ...Default.args, size: 'lg', label: 'Large toggle' },
};

export const CustomColor = {
  ...Default,
  args: { ...Default.args, checked: true, color: '#f59e0b', label: 'Amber toggle' },
};

/** Error contract: `error-text` / setError() → aria-invalid + aria-errormessage + note. */
export const WithError = {
  render: () => `<td-toggle label="Tôi đồng ý với điều khoản" error-text="Bạn cần chọn mục này để tiếp tục"></td-toggle>`,
};

/** Unlabeled (named by aria-label); the hit area stays ≥ 24×24 (44 on touch). */
export const AriaLabelOnly = {
  render: () => `<div class="sb-row"><td-toggle size="sm" aria-label="Chọn"></td-toggle><td-toggle aria-label="Chọn"></td-toggle><td-toggle size="lg" aria-label="Chọn" checked></td-toggle></div>`,
};
