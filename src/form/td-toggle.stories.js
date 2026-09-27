import { escapeHtml } from '../utils/escape.js';
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
      label="${escapeHtml(String(args.label || ''))}"
      size="${escapeHtml(String(args.size || 'md'))}"
      ${args.color ? `color="${escapeHtml(String(args.color))}"` : ''}
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

/** v0.13.0 `commit(asyncFn)`: optimistic + pending; every second "bật" fails and the switch reverts. */
export const CommitOptimistic = {
  render: () => {
    const wrap = document.createElement('div');
    wrap.className = 'sb-stack';
    const t = document.createElement('td-toggle');
    t.setAttribute('label', 'Công khai bài viết');
    t.setAttribute('controlled', '');
    const out = document.createElement('p');
    out.className = 'sb-note';
    let saves = 0;
    t.addEventListener('change', (e) => {
      t.commit(async (next) => {
        await new Promise((r) => setTimeout(r, 1000));
        saves += 1;
        if (next && saves % 2 === 0) throw new Error('Lỗi mạng (giả lập)');
        out.textContent = next ? 'Đã công khai' : 'Đã ẩn';
      }, e.detail.checked);
    });
    t.addEventListener('commit-error', (e) => { out.textContent = `Không lưu được: ${e.detail.error ? e.detail.error.message : ''}`; });
    wrap.append(t, out);
    return wrap;
  },
};
