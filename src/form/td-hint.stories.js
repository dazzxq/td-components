import './td-hint.js';
import './td-input-field.js';
import './td-dropdown.js';
import './td-toggle.js';
import './td-checkbox.js';
import '../styles/story-layout.css';

export default {
  title: 'Form/Hint',
  tags: ['autodocs'],
};

/** v0.54.0: `helper-text` on every form control — the same line under the control; hidden while an error shows. */
export const HelperText = {
  render: () => `<div class="sb-stack">
    <td-input-field label="Mã số thuế" helper-text="10 hoặc 13 chữ số"></td-input-field>
    <td-input-field label="Mã số thuế" helper-text="10 hoặc 13 chữ số" error-text="Mã số thuế phải có 10 hoặc 13 chữ số"></td-input-field>
    <td-dropdown label="Thành phố" placeholder="Chọn thành phố" helper-text="Nơi giao hàng"></td-dropdown>
    <td-toggle label="Nhận email" helper-text="Tối đa một email mỗi tuần"></td-toggle>
    <td-checkbox label="Đồng ý điều khoản" helper-text="Bắt buộc để tạo tài khoản"></td-checkbox></div>`,
};

/** A child <td-hint> carries rich content (the page's own nodes): it takes the hint slot of the control. */
export const RichChild = {
  render: () => `<div class="sb-stack">
    <td-input-field label="Đường dẫn"><td-hint>Chỉ chữ thường và <code>-</code>. Xem <a href="#">hướng dẫn</a>.</td-hint></td-input-field>
    <td-checkbox label="Nhận bản tin"><td-hint>Xem <a href="#">chính sách quyền riêng tư</a>.</td-hint></td-checkbox></div>`,
};

/** `<td-hint for="id">` describes a control that is not a kit control (it links itself into aria-describedby). */
export const ForNativeControl = {
  render: () => `<div class="sb-stack">
    <label for="sb-hint-note">Ghi chú giao hàng</label>
    <textarea id="sb-hint-note" class="td-field__control" rows="2"></textarea>
    <td-hint for="sb-hint-note">Không ghi số điện thoại ở đây.</td-hint></div>`,
};

/** td-toggle `on-text` / `off-text`: the visible state text (CSS from :checked), in a table cell. */
export const ToggleStateText = {
  render: () => `<table><tbody>
    <tr><td>iPhone 17</td><td><td-toggle aria-label="Dùng iPhone 17" on-text="Đang dùng" off-text="Đã lưu trữ" checked></td-toggle></td></tr>
    <tr><td>Galaxy S26</td><td><td-toggle aria-label="Dùng Galaxy S26" on-text="Đang dùng" off-text="Đã lưu trữ"></td-toggle></td></tr>
    </tbody></table>`,
};
