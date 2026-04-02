import './td-sample.js';

export default {
  title: 'Base/Sample',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    count: { control: 'number' },
    disabled: { control: 'boolean' },
  },
};

export const Default = {
  render: (args) => `
    <td-sample
      label="${args.label || ''}"
      count="${args.count || 0}"
      ${args.disabled ? 'disabled' : ''}
    ></td-sample>
  `,
  args: {
    label: 'Sample Component',
    count: 0,
    disabled: false,
  },
};

export const Disabled = {
  ...Default,
  args: { ...Default.args, disabled: true, label: 'Disabled Sample' },
};

export const WithHighCount = {
  ...Default,
  args: { ...Default.args, count: 42, label: 'High Count' },
};
