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
      label="${args.label || ''}"
      size="${args.size || 'md'}"
      color="${args.color || '#2196F3'}"
    ></td-checkbox>
  `,
  args: {
    checked: false,
    label: 'Accept terms',
    size: 'md',
    color: '#2196F3',
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
