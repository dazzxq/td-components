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

/** v0.52.0 `tone`: the ON colour from the theme contract + clock / ✓ icon + a status description (not colour only). */
export const Tones = {
  render: () => `<div class="sb-stack">
    <td-toggle label="Bắt buộc 2FA (chờ quét QR)" tone="warning" status-text="Chờ người dùng quét mã QR khi đăng nhập" checked></td-toggle>
    <td-toggle label="Bắt buộc 2FA (đã thiết lập)" tone="success" status-text="2FA đã thiết lập — người dùng nhập mã khi đăng nhập" checked></td-toggle>
    <td-toggle label="Bắt buộc 2FA (tắt — rãnh xám, không mô tả)" tone="warning"></td-toggle>
  </div>`,
};

/** v0.52.0 `locked`: focusable, still submitted, never toggles; lock in the knob + "Không thể thay đổi: {lý do}". */
export const Locked = {
  render: () => `<div class="sb-stack">
    <td-toggle name="tfa" label="Bắt buộc 2FA" checked locked locked-reason="Chính sách công ty bắt buộc 2FA cho quản trị viên"></td-toggle>
    <td-toggle name="beta" label="Tính năng thử nghiệm" locked locked-reason="Gói hiện tại không hỗ trợ"></td-toggle>
    <td-toggle label="Khoá + đang chờ" tone="warning" checked locked></td-toggle>
  </div>`,
};

/** v0.52.0 recipe: the 2FA column (controlled + confirm on OFF + commit; failure snaps back). Fake API: every 3rd save fails. */
export const TwoFactorRecipe = {
  render: () => {
    const wrap = document.createElement('div');
    wrap.className = 'sb-stack';
    const WAIT = 'Đã bật 2FA — chờ người dùng quét mã QR khi đăng nhập';
    const DONE = '2FA đã thiết lập — người dùng nhập mã khi đăng nhập';
    const t = document.createElement('td-toggle');
    t.setAttribute('label', 'Bắt buộc 2FA cho nguyenvana');
    t.setAttribute('controlled', '');
    const out = document.createElement('p');
    out.className = 'sb-note';
    const verify = document.createElement('button');
    verify.type = 'button';
    verify.className = 'td-btn td-btn--secondary td-btn--sm';
    verify.textContent = 'Giả lập: người dùng đã quét QR';
    let saves = 0;
    const save = () => new Promise((r) => setTimeout(() => { saves += 1; r(saves % 3 !== 0); }, 800));
    t.addEventListener('change', async (e) => {
      if (e.detail.checked) {
        t.tone = 'warning';
        t.statusText = WAIT;
        t.setAttribute('data-tooltip', WAIT);
        t.commit(save);
        return;
      }
      if (!window.confirm('Tắt xác thực 2FA cho nguyenvana?')) return;
      t.commit(save);
    });
    t.addEventListener('commit-error', () => { out.textContent = 'Không lưu được — công tắc đã quay lại.'; });
    verify.addEventListener('click', () => {
      if (!t.checked) return;
      t.tone = 'success';
      t.statusText = DONE;
      t.setAttribute('data-tooltip', DONE);
    });
    wrap.append(t, verify, out);
    return wrap;
  },
};

/**
 * v0.53.2 "Căn dọc cạnh chữ": a toggle without the kit label next to text — in an inline-flex row (align-items: center),
 * in a plain text line and as the standalone PHP switch. The host box is the switch box (no descender space).
 */
export const CanDocCanhChu = {
  name: 'Căn dọc cạnh chữ',
  render: () => `<div class="sb-stack">
    <div class="sb-row"><td-toggle controlled aria-label="Trạng thái gói A" checked></td-toggle><span>Đang dùng</span></div>
    <div class="sb-row"><td-toggle size="sm" aria-label="Nhỏ" checked></td-toggle><span>Nhỏ (sm)</span></div>
    <div class="sb-row"><td-toggle size="lg" aria-label="Lớn"></td-toggle><span>Lớn (lg)</span></div>
    <p>Trạng thái: <td-toggle controlled aria-label="Trạng thái gói B" checked></td-toggle> Đang dùng</p>
    <p>Có nhãn: <td-toggle label="Thông báo" checked></td-toggle> — cùng dòng chữ</p>
  </div>`,
};
