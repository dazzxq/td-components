import { escapeHtml } from '../utils/escape.js';
import '../styles/story-layout.css';
import './td-input-field.js';

export default {
  title: 'Form/InputField',
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'password', 'email', 'tel', 'number', 'url', 'search', 'date', 'textarea', 'contenteditable'],
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
    type="${escapeHtml(String(args.type || 'text'))}"
    size="${escapeHtml(String(args.size || 'md'))}"
    ${args.value ? `value="${escapeHtml(String(args.value))}"` : ''}
    ${args.placeholder ? `placeholder="${escapeHtml(String(args.placeholder))}"` : ''}
    ${args.disabled ? 'disabled' : ''}
    ${args.readonly ? 'readonly' : ''}
    ${args.required ? 'required' : ''}
    ${args['max-length'] ? `max-length="${escapeHtml(String(args['max-length']))}"` : ''}
    ${args['limit-type'] ? `limit-type="${escapeHtml(String(args['limit-type']))}"` : ''}
    ${args.label ? `label="${escapeHtml(String(args.label))}"` : ''}
    ${args['helper-text'] ? `helper-text="${escapeHtml(String(args['helper-text']))}"` : ''}
    ${args['error-text'] ? `error-text="${escapeHtml(String(args['error-text']))}"` : ''}
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

export const ErrorWithHelper = {
  render: Template,
  args: {
    ...Default.args,
    type: 'email',
    label: 'Email công ty',
    value: 'an@',
    'helper-text': 'Dùng email @congty.vn',
    'error-text': 'Email không hợp lệ',
    'max-length': 40,
  },
};

export const ContentEditable = {
  render: Template,
  args: {
    ...Default.args,
    type: 'contenteditable',
    label: 'Ghi chú',
    placeholder: 'Nhập ghi chú…',
  },
};

export const WordLimit = {
  render: Template,
  args: {
    ...Default.args,
    type: 'textarea',
    label: 'Tóm tắt',
    'max-length': 5,
    'limit-type': 'word',
    value: 'một hai ba bốn năm',
  },
};

export const AllSizes = {
  render: () => `
    <div class="sb-stack">
      <td-input-field size="sm" label="Nhỏ" placeholder="sm"></td-input-field>
      <td-input-field size="md" label="Vừa" placeholder="md"></td-input-field>
      <td-input-field size="lg" label="Lớn" placeholder="lg"></td-input-field>
      <p class="sb-note">Coarse pointer: every control is ≥ 44 px tall.</p>
    </div>
  `,
};

/** v0.13.0 `autoresize`: the textarea grows with its content (never below `rows`, capped, then scrolls). */
export const TextareaAutoresize = {
  render: () => '<div class="sb-stack"><td-input-field type="textarea" label="Tóm tắt" rows="2" autoresize '
    + 'placeholder="Gõ nhiều dòng…"></td-input-field><p class="sb-note">CSS field-sizing (Chromium/Safari mới); '
    + 'trình duyệt khác giữ chiều cao theo rows.</p></div>',
};
