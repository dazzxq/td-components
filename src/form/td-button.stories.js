import './td-button.js';

export default {
  title: 'Form/Button',
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'success', 'danger', 'info', 'warning'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    icon: { control: 'text' },
    'icon-position': { control: 'select', options: ['left', 'right'] },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
    'full-width': { control: 'boolean' },
    color: { control: 'color' },
    label: { control: 'text' },
  },
};

export const Default = {
  render: (args) => `
    <td-button
      variant="${args.variant || 'primary'}"
      size="${args.size || 'md'}"
      ${args.icon ? `icon="${args.icon}"` : ''}
      ${args['icon-position'] ? `icon-position="${args['icon-position']}"` : ''}
      ${args.loading ? 'loading' : ''}
      ${args.disabled ? 'disabled' : ''}
      ${args['full-width'] ? 'full-width' : ''}
      ${args.color ? `color="${args.color}"` : ''}
      label="${args.label || 'Button'}"
    ></td-button>
  `,
  args: {
    variant: 'primary',
    size: 'md',
    label: 'Button',
    loading: false,
    disabled: false,
    'full-width': false,
  },
};

export const AllVariants = {
  render: () => `
    <div class="flex flex-wrap items-center gap-3">
      <td-button variant="primary" label="Primary"></td-button>
      <td-button variant="secondary" label="Secondary"></td-button>
      <td-button variant="success" label="Success"></td-button>
      <td-button variant="danger" label="Danger"></td-button>
      <td-button variant="info" label="Info"></td-button>
      <td-button variant="warning" label="Warning"></td-button>
    </div>
  `,
};

export const Loading = {
  ...Default,
  args: { ...Default.args, loading: true, label: 'Saving...' },
};

export const WithIcon = {
  ...Default,
  args: { ...Default.args, icon: 'fas fa-edit', label: 'Edit' },
};

export const Disabled = {
  ...Default,
  args: { ...Default.args, disabled: true, label: 'Disabled' },
};

export const FullWidth = {
  ...Default,
  args: { ...Default.args, 'full-width': true, label: 'Full Width Button' },
};

export const CustomColor = {
  ...Default,
  args: { ...Default.args, color: '#8b5cf6', label: 'Purple Button' },
};
