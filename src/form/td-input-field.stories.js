import { escapeHtml } from '../utils/escape.js';
import '../styles/story-layout.css';
import './td-input-field.js';
import '../icons/td-icon-element.js';

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

const esc = (v) => escapeHtml(String(v ?? ''));
const opt = (name, v) => (v != null && v !== '' ? ` ${name}="${esc(v)}"` : '');

/** v0.55.0 prefix / suffix (text + registry icon): decorative, the unit is read through the description (unit-label). */
export const Affixes = {
  args: { label: 'Website', prefix: 'https://', suffix: '.vn', 'prefix-icon': '', 'suffix-icon': '', 'unit-label': '' },
  argTypes: {
    prefix: { control: 'text' }, suffix: { control: 'text' }, 'prefix-icon': { control: 'text' },
    'suffix-icon': { control: 'text' }, 'unit-label': { control: 'text' },
  },
  render: (args) => `<div class="sb-stack">
    <td-input-field name="site"${opt('label', args.label)}${opt('prefix', args.prefix)}${opt('suffix', args.suffix)}${opt('prefix-icon', args['prefix-icon'])}${opt('suffix-icon', args['suffix-icon'])}${opt('unit-label', args['unit-label'])}></td-input-field>
    <td-input-field name="battery" type="number" label="Dung lượng pin" suffix="mAh" unit-label="mi-li-am-pe giờ" value="5000"></td-input-field>
    <td-input-field name="q" type="search" label="Tìm sản phẩm" prefix-icon="search" placeholder="Tên, mã SKU…"></td-input-field>
    <td-input-field name="price" label="Giá (lỗi)" suffix="đ" unit-label="đồng" value="12" error-text="Giá tối thiểu 1.000 đ"></td-input-field>
    <td-input-field name="locked" label="Khoá" prefix="https://" value="congty.vn" disabled></td-input-field>
    <td-input-field name="pw" type="password" label="Mật khẩu" size="lg" prefix-icon="lock" suffix="8+ ký tự"></td-input-field>
    <p class="sb-note">Affix không bao giờ nằm trong giá trị; textarea / date / time bỏ affix (một cảnh báo).</p></div>`,
};

/** v0.55.0 page Elements in [slot="prefix"|"suffix"]: moved (same node), never hidden from AT — the page names / wires them. */
export const AffixSlot = {
  render: () => `<form class="sb-stack" id="if-slot">
    <td-input-field name="password" type="password" label="Mật khẩu" autocomplete="current-password">
      <button type="button" slot="suffix" class="sb-pw-toggle" aria-label="Hiện mật khẩu" aria-pressed="false">Hiện</button>
    </td-input-field>
    <td-input-field name="q" type="search" label="Tìm" value="iphone">
      <td-icon slot="prefix" name="search" aria-hidden="true"></td-icon>
      <button type="button" slot="suffix" class="sb-clear" aria-label="Xoá">×</button>
    </td-input-field></form>`,
  play: ({ canvasElement }) => {
    const pw = canvasElement.querySelector('td-input-field[name="password"]');
    canvasElement.querySelector('.sb-pw-toggle').addEventListener('click', (e) => {
      const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
      e.currentTarget.setAttribute('aria-pressed', String(on));
      e.currentTarget.textContent = on ? 'Ẩn' : 'Hiện';
      pw.querySelector('.td-field__control').type = on ? 'text' : 'password';
    });
    canvasElement.querySelector('.sb-clear').addEventListener('click', () => {
      const q = canvasElement.querySelector('td-input-field[name="q"]');
      q.setValue('');
      q.focus();
    });
  },
};

/**
 * v0.58.0 `label-mode="floating"` (plan v0.58.0-floating-label, ADR 0031; design from dwp): the label sits inside the field
 * and rises (12 px) on focus / value — pure CSS, identical before and after the upgrade. Every state side by side, light +
 * dark (`data-td-theme="dark"` scope) + RTL, for the release screenshot.
 */
const floatingSet = (p) => `
    <td-input-field name="${p}-empty" label="Họ tên" label-mode="floating" helper-text="Như trên CCCD"></td-input-field>
    <td-input-field name="${p}-focus" label="Email" label-mode="floating" type="email" data-sb-focus></td-input-field>
    <td-input-field name="${p}-value" label="Email" label-mode="floating" type="email" value="an.nguyen@congty.vn" required></td-input-field>
    <td-input-field name="${p}-ph" label="Điện thoại" label-mode="floating" type="tel" placeholder="vd: 0901 234 567"></td-input-field>
    <td-input-field name="${p}-err" label="Mã số thuế" label-mode="floating" value="12" helper-text="10 hoặc 13 chữ số" error-text="Mã số thuế phải có 10 hoặc 13 chữ số"></td-input-field>
    <td-input-field name="${p}-dis" label="Mã khách hàng" label-mode="floating" value="KH-0042" disabled></td-input-field>
    <td-input-field name="${p}-ro" label="Ngày tạo" label-mode="floating" value="08/10/2026" readonly></td-input-field>
    <td-input-field name="${p}-prefix" label="Website" label-mode="floating" prefix="https://" suffix=".vn" value="congty"></td-input-field>
    <td-input-field name="${p}-date" label="Ngày giao" label-mode="floating" type="date"></td-input-field>
    <td-input-field name="${p}-ta" label="Ghi chú" label-mode="floating" type="textarea" max-length="200" value="Giao giờ hành chính"></td-input-field>
    <td-input-field name="${p}-long" label="Địa chỉ nhận hàng đầy đủ gồm số nhà, tên đường, phường, quận và thành phố" label-mode="floating"></td-input-field>
    <td-input-field name="${p}-sm" label="Mã (sm)" label-mode="floating" size="sm"></td-input-field>
    <td-input-field name="${p}-lg" label="Thành phố (lg)" label-mode="floating" size="lg" value="Huế"></td-input-field>`;

export const FloatingLabel = {
  args: { label: 'Họ tên', 'label-mode': 'floating', placeholder: '', value: '' },
  argTypes: { 'label-mode': { control: 'select', options: ['top', 'floating'] } },
  render: (args) => `<div class="sb-stack">
    <td-input-field name="live"${opt('label', args.label)}${opt('label-mode', args['label-mode'])}${opt('placeholder', args.placeholder)}${opt('value', args.value)}></td-input-field>
    <h3>Sáng</h3>${floatingSet('l')}
    <h3>Tối</h3><div data-td-theme="dark" class="sb-stack sb-dark">${floatingSet('d')}</div>
    <h3>RTL</h3><div dir="rtl" class="sb-stack"><td-input-field name="rtl" label="الاسم الكامل" label-mode="floating"></td-input-field>
      <td-input-field name="rtl-v" label="الاسم الكامل" label-mode="floating" value="سلام"></td-input-field></div>
    <p class="sb-note">Nhãn nổi khi focus / có giá trị / tự điền; luôn nổi với date và khi có tiền tố / hậu tố. placeholder hiện khi nhãn đã nổi: lúc focus, hoặc mỗi khi ô rỗng nếu ô luôn nổi (có tiền tố / hậu tố).</p></div>`,
  play: ({ canvasElement }) => {
    canvasElement.querySelector('td-input-field[data-sb-focus] .td-field__control')?.focus(); // the light "focused" field
  },
};
