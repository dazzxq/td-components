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
      color="${args.color || '#4ADE80'}"
    ></td-toggle>
  `,
  args: {
    checked: false,
    disabled: false,
    label: 'Toggle me',
    size: 'md',
    color: '#4ADE80',
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
