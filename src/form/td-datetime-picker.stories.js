import { escapeHtml } from '../utils/escape.js';
import './td-datetime-picker.js';
import '../styles/story-layout.css';

const attr = (name, v) => (v === undefined || v === null || v === '' ? '' : ` ${name}="${escapeHtml(String(v))}"`);
const flag = (name, v) => (v ? ` ${name}` : '');

export default {
  title: 'Form/Datetime Picker',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    placeholder: { control: 'text' },
    min: { control: 'text' },
    max: { control: 'text' },
    'minute-step': { control: 'number' },
    'form-value-format': { control: 'select', options: ['iso', 'display', 'db'] },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    'error-text': { control: 'text' },
  },
};

export const Default = {
  render: (args) => '<div class="sb-stack"><td-datetime-picker'
    + `${attr('label', args.label)}${attr('value', args.value)}${attr('placeholder', args.placeholder)}`
    + `${attr('min', args.min)}${attr('max', args.max)}${attr('minute-step', args['minute-step'])}`
    + `${attr('form-value-format', args['form-value-format'])}${flag('required', args.required)}`
    + `${flag('disabled', args.disabled)}${attr('error-text', args['error-text'])}></td-datetime-picker>`
    + '<p class="sb-note">Bàn phím: Enter / Space / ↓ mở hộp thoại; Tab qua Ngày → Tháng → Năm → Giờ → Phút; trên bánh xe'
    + ' giờ/phút: ↑↓ Home End PageUp PageDown; "Chọn" lưu, Esc / "Đóng" huỷ.</p></div>',
  args: {
    label: 'Thời gian hẹn', value: '15/06/2026 - 10:30', placeholder: '', min: '', max: '', 'minute-step': 1,
    'form-value-format': 'iso', required: false, disabled: false, 'error-text': '',
  },
};

export const Empty = {
  render: () => '<div class="sb-stack">'
    + '<td-datetime-picker label="Ngày giao hàng" placeholder="Chọn ngày giờ giao"></td-datetime-picker>'
    + '<p class="sb-note">Chưa có giá trị: getValue() trả về chuỗi rỗng, mở ra bắt đầu từ thời điểm hiện tại.</p></div>',
};

export const MinuteStep = {
  render: () => '<div class="sb-stack">'
    + '<td-datetime-picker label="Bước 15 phút" minute-step="15" value="15/06/2026 - 10:58"></td-datetime-picker>'
    + '<p class="sb-note">Phút làm tròn XUỐNG theo bước khi mở (10:58 → 10:45), không nhảy sang giờ sau.</p></div>',
};

export const MinMax = {
  render: () => '<div class="sb-stack">'
    + '<td-datetime-picker label="Trong tháng 6/2026" min="2026-06-01" max="30/06/2026" value="15/06/2026 - 10:30"></td-datetime-picker>'
    + '<td-datetime-picker label="Ngoài khoảng" min="2026-06-01" max="30/06/2026" value="01/07/2026 - 08:00"></td-datetime-picker>'
    + '<p class="sb-note">min/max nhận dd/mm/yyyy[ - hh:mm] hoặc yyyy-mm-dd[Thh:mm]; chỉ có ngày thì min = 00:00, max = 23:59.'
    + ' Ngoài khoảng → rangeUnderflow / rangeOverflow, nút "Chọn" từ chối.</p></div>',
};

export const States = {
  render: () => '<div class="sb-stack">'
    + '<td-datetime-picker label="Bắt buộc" required></td-datetime-picker>'
    + '<td-datetime-picker label="Có lỗi" value="15/06/2026 - 10:30" error-text="Lịch hẹn trùng, vui lòng chọn giờ khác"></td-datetime-picker>'
    + '<td-datetime-picker label="Sai định dạng" value="31/02/2026 - 25:99"></td-datetime-picker>'
    + '<td-datetime-picker label="Vô hiệu" value="15/06/2026 - 10:30" disabled></td-datetime-picker>'
    + '<td-datetime-picker aria-label="Không có nhãn hiển thị" value="15/06/2026 - 10:30"></td-datetime-picker>'
    + '</div>',
};

export const InAForm = {
  render: () => {
    setTimeout(() => {
      const form = document.getElementById('dtp-story-form');
      const out = document.getElementById('dtp-story-out');
      if (!form || !out || form.dataset.bound) return;
      form.dataset.bound = '1';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        out.textContent = [...new FormData(form)].map(([k, v]) => `${k} = ${v}`).join('\n') || '(trống)';
      });
    }, 0);
    return '<form id="dtp-story-form" class="sb-stack">'
      + '<td-datetime-picker name="start" label="Bắt đầu (iso)" value="15/06/2026 - 08:00" required></td-datetime-picker>'
      + '<td-datetime-picker name="end" label="Kết thúc (db)" form-value-format="db" value="15/06/2026 - 17:30"></td-datetime-picker>'
      + '<td-datetime-picker name="remind" label="Nhắc (display)" form-value-format="display"></td-datetime-picker>'
      + '<div class="sb-row"><button type="submit" class="td-btn td-btn--primary"><span class="td-btn__label">Gửi</span></button>'
      + '<button type="reset" class="td-btn td-btn--secondary"><span class="td-btn__label">Đặt lại</span></button></div>'
      + '<pre id="dtp-story-out" class="sb-note"></pre></form>';
  },
};

/** v0.59.0 `clearable`: a clear button while there is a value (not when required / disabled). */
export const Clearable = {
  render: () => '<div class="sb-stack">'
    + '<td-datetime-picker mode="date" label="Hạn thanh toán" value="15/06/2026" clearable></td-datetime-picker>'
    + '<td-datetime-picker label="Giờ hẹn (bắt buộc — không có nút xoá)" value="15/06/2026 - 10:30" required clearable></td-datetime-picker>'
    + '<td-datetime-picker mode="month" label="Tháng báo cáo" value="06/2026" clearable></td-datetime-picker>'
    + '<p class="sb-note">Nút × (Xoá ngày / Xoá tháng) đứng sau icon lịch; Tab từ ô tới nút; xoá xong focus về ô.</p></div>',
};
