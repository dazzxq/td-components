import './td-slider.js';

export default {
  title: 'Form/Slider',
  tags: ['autodocs'],
  argTypes: {
    min: { control: 'number' },
    max: { control: 'number' },
    value: { control: 'number' },
    step: { control: 'number' },
    size: { control: { type: 'select' }, options: ['sm', 'md', 'lg'] },
    color: { control: 'color' },
    label: { control: 'text' },
    'show-label': { control: 'boolean' },
    'label-position': { control: { type: 'select' }, options: ['top', 'bottom'] },
    'show-step-labels': { control: 'boolean' },
    'show-step-marks': { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};

export const Default = {
  render: (args) => `
    <td-slider
      min="${args.min ?? 0}"
      max="${args.max ?? 100}"
      value="${args.value ?? 50}"
      step="${args.step ?? 1}"
      size="${args.size || 'md'}"
      color="${args.color || '#3b82f6'}"
      label="${args.label || ''}"
      ${args['show-label'] ? 'show-label' : ''}
      label-position="${args['label-position'] || 'top'}"
      ${args['show-step-labels'] ? 'show-step-labels' : ''}
      ${args['show-step-marks'] ? 'show-step-marks' : ''}
      ${args.disabled ? 'disabled' : ''}
    ></td-slider>
  `,
  args: {
    min: 0,
    max: 100,
    value: 50,
    step: 1,
    size: 'md',
    color: '#3b82f6',
    label: 'Volume',
    'show-label': true,
    'label-position': 'top',
    'show-step-labels': true,
    'show-step-marks': false,
    disabled: false,
  },
};

export const CustomColor = {
  ...Default,
  args: {
    ...Default.args,
    color: '#10b981',
    label: 'Progress',
    value: 75,
  },
};

export const WithStepMarks = {
  ...Default,
  args: {
    ...Default.args,
    min: 0,
    max: 10,
    step: 2,
    value: 4,
    label: 'Rating',
    'show-step-marks': true,
    'show-step-labels': false,
  },
};

export const SmallSize = {
  ...Default,
  args: {
    ...Default.args,
    size: 'sm',
    label: 'Small Slider',
    value: 30,
  },
};

export const LargeSize = {
  ...Default,
  args: {
    ...Default.args,
    size: 'lg',
    label: 'Large Slider',
    value: 70,
  },
};

export const Disabled = {
  ...Default,
  args: {
    ...Default.args,
    disabled: true,
    label: 'Disabled Slider',
    value: 40,
  },
};

export const LabelBottom = {
  ...Default,
  args: {
    ...Default.args,
    'label-position': 'bottom',
    label: 'Label Below',
    value: 60,
  },
};

export const CustomRange = {
  ...Default,
  args: {
    min: 0,
    max: 10,
    step: 2,
    value: 4,
    size: 'md',
    color: '#8b5cf6',
    label: 'Custom Range (0-10, step 2)',
    'show-label': true,
    'label-position': 'top',
    'show-step-labels': true,
    'show-step-marks': true,
    disabled: false,
  },
};
