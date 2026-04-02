import './td-input-field.js';

export default {
  title: 'Form/InputField',
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'password', 'email', 'tel', 'number', 'textarea', 'contenteditable'],
    },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    value: { control: 'text' },
    placeholder: { control: 'text' },
    disabled: { control: 'boolean' },
    readonly: { control: 'boolean' },
    required: { control: 'boolean' },
    'max-length': { control: 'number' },
    'limit-type': { control: 'select', options: ['char', 'word'] },
    label: { control: 'text' },
    'helper-text': { control: 'text' },
    'error-text': { control: 'text' },
  },
};

const Template = (args) => `
  <td-input-field
    type="${args.type || 'text'}"
    size="${args.size || 'md'}"
    ${args.value ? `value="${args.value}"` : ''}
    ${args.placeholder ? `placeholder="${args.placeholder}"` : ''}
    ${args.disabled ? 'disabled' : ''}
    ${args.readonly ? 'readonly' : ''}
    ${args.required ? 'required' : ''}
    ${args['max-length'] ? `max-length="${args['max-length']}"` : ''}
    ${args['limit-type'] ? `limit-type="${args['limit-type']}"` : ''}
    ${args.label ? `label="${args.label}"` : ''}
    ${args['helper-text'] ? `helper-text="${args['helper-text']}"` : ''}
    ${args['error-text'] ? `error-text="${args['error-text']}"` : ''}
  ></td-input-field>
`;

export const Default = {
  render: Template,
  args: {
    type: 'text',
    size: 'md',
    placeholder: 'Enter text...',
  },
};

export const WithLabel = {
  render: Template,
  args: {
    ...Default.args,
    label: 'Full Name',
    placeholder: 'Enter your name',
  },
};

export const WithPlaceholder = {
  render: Template,
  args: {
    ...Default.args,
    placeholder: 'Type something here...',
  },
};

export const Password = {
  render: Template,
  args: {
    ...Default.args,
    type: 'password',
    label: 'Password',
    placeholder: 'Enter password',
  },
};

export const Email = {
  render: Template,
  args: {
    ...Default.args,
    type: 'email',
    label: 'Email',
    placeholder: 'name@example.com',
  },
};

export const Textarea = {
  render: Template,
  args: {
    ...Default.args,
    type: 'textarea',
    label: 'Description',
    placeholder: 'Write a description...',
  },
};

export const WithCounter = {
  render: Template,
  args: {
    ...Default.args,
    label: 'Bio',
    placeholder: 'Write your bio...',
    'max-length': 100,
    'limit-type': 'char',
    value: 'Hello world',
  },
};

export const WithError = {
  render: Template,
  args: {
    ...Default.args,
    label: 'Username',
    value: 'ab',
    'error-text': 'Username must be at least 3 characters',
  },
};

export const WithHelper = {
  render: Template,
  args: {
    ...Default.args,
    label: 'Email',
    placeholder: 'name@example.com',
    'helper-text': 'We will never share your email',
  },
};

export const Required = {
  render: Template,
  args: {
    ...Default.args,
    label: 'Email Address',
    placeholder: 'required@example.com',
    required: true,
  },
};

export const Disabled = {
  render: Template,
  args: {
    ...Default.args,
    label: 'Disabled Field',
    value: 'Cannot edit',
    disabled: true,
  },
};

export const SmallSize = {
  render: Template,
  args: {
    ...Default.args,
    size: 'sm',
    label: 'Small Input',
    placeholder: 'Small size...',
  },
};

export const LargeSize = {
  render: Template,
  args: {
    ...Default.args,
    size: 'lg',
    label: 'Large Input',
    placeholder: 'Large size...',
  },
};
