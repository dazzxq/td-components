import { escapeHtml } from '../utils/escape.js';
import './td-datetime-picker.js';
import { TdModal } from '../feedback/td-modal.js';
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

/** v0.60.0: open the first picker of the canvas (the calendar is a popover ≥ 720 px, a bottom sheet below) */
const openFirst = ({ canvasElement }) => {
  setTimeout(() => canvasElement.querySelector('td-datetime-picker .td-dtp__trigger')?.click(), 60);
};

export const Default = {
  render: (args) => '<div class="sb-stack"><td-datetime-picker'
    + `${attr('label', args.label)}${attr('value', args.value)}${attr('placeholder', args.placeholder)}`
    + `${attr('min', args.min)}${attr('max', args.max)}${attr('minute-step', args['minute-step'])}`
    + `${attr('form-value-format', args['form-value-format'])}${flag('required', args.required)}`
    + `${flag('disabled', args.disabled)}${attr('error-text', args['error-text'])}></td-datetime-picker>`
    + '<p class="sb-note">Bàn phím: Enter / Space / ↓ mở lịch; ← → ↑ ↓ ±1 ngày / ±1 tuần, Home / End = Thứ Hai / Chủ Nhật,'
    + ' PageUp / PageDown ±1 tháng, Shift+PageUp / PageDown ±1 năm, Enter / Space chọn. Ngày-giờ (0.61) là HAI MÀN: bấm ngày → màn giờ'
    + ' (bánh xe: ↑↓ Home End PageUp PageDown; "‹" hoặc Backspace quay lại màn ngày); "Chọn" lưu ở màn giờ, Esc huỷ.</p></div>',
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

/**
 * v0.60.0 the calendar (plan v0.60.0-calendar-picker, ADR 0032). Each story opens its picker on load (≥ 720 px a popover next to the
 * field, < 720 px the bottom sheet): date commits on a day, datetime on "Chọn", month / year open on their grid.
 */
export const CalendarDate = {
  render: () => '<div class="sb-stack" style="min-height: 28rem">'
    + '<td-datetime-picker mode="date" label="Ngày giao" value="15/06/2026"></td-datetime-picker>'
    + '<p class="sb-note">Bấm một ngày: ghi + đóng. Tiêu đề "Tháng 6" / "2026" mở lưới tháng / năm; ‹ › đổi một tháng.</p></div>',
  play: openFirst,
};

export const CalendarDatetime = {
  render: () => '<div class="sb-stack" style="min-height: 34rem">'
    + '<td-datetime-picker label="Giờ hẹn" value="15/06/2026 - 10:30" minute-step="15"></td-datetime-picker>'
    + '<p class="sb-note">Hai màn (0.61): MÀN 1 chọn ngày (chỉ lịch, "Hôm nay" ở chân); bấm một ngày → MÀN 2 chọn giờ (tiêu đề ngày + "‹" quay lại,'
    + ' bánh xe giờ / phút theo <code>minute-step</code>, "Bây giờ" đưa ngày + giờ về hiện tại và ở lại màn giờ, "Chọn" mới ghi một lần). Mỗi màn vừa'
    + ' màn hình, không cuộn, kể cả điện thoại 320 × 568; bánh xe vuốt có quán tính + khớp giá trị.</p></div>',
  play: openFirst,
};

/** v0.61.0: the same two screens on a phone-sized frame (the bottom sheet): the actions live in the sheet footer. */
export const CalendarDatetimeSheet = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  render: () => '<div class="sb-stack" style="min-height: 34rem">'
    + '<td-datetime-picker label="Giờ hẹn" value="15/06/2026 - 10:30" minute-step="5"></td-datetime-picker>'
    + '<p class="sb-note">Thu hẹp cửa sổ dưới 720 px để thấy bottom sheet: chân sheet có "Hôm nay" (màn ngày) hoặc "Bây giờ" + "Chọn" (màn giờ).</p></div>',
  play: openFirst,
};

export const CalendarMonth = {
  render: () => '<div class="sb-stack" style="min-height: 22rem">'
    + '<td-datetime-picker mode="month" label="Tháng báo cáo" value="06/2026"></td-datetime-picker></div>',
  play: openFirst,
};

export const CalendarYear = {
  render: () => '<div class="sb-stack" style="min-height: 22rem">'
    + '<td-datetime-picker mode="year" label="Năm" value="2026"></td-datetime-picker>'
    + '<p class="sb-note">Lưới 12 năm, ‹ › = ±12 năm; Shift+PageUp / PageDown = ±120 năm.</p></div>',
  play: openFirst,
};

export const CalendarMinMax = {
  render: () => '<div class="sb-stack" style="min-height: 28rem">'
    + '<td-datetime-picker mode="date" label="Chỉ trong 10–28/06/2026" min="2026-06-10" max="2026-06-28" value="15/06/2026"></td-datetime-picker>'
    + '<p class="sb-note">Ngày ngoài khoảng bị gạch ngang và khoá; ‹ › khoá khi tháng bên cạnh nằm ngoài; phím dừng ở biên. Không min / max: năm 1–9999.</p></div>',
  play: openFirst,
};

export const CalendarClearable = {
  render: () => '<div class="sb-stack" style="min-height: 28rem">'
    + '<td-datetime-picker mode="date" label="Hạn thanh toán" value="15/06/2026" clearable></td-datetime-picker>'
    + '<p class="sb-note">Nút × vẫn bấm được khi lịch đang mở: bỏ bản nháp, xoá giá trị (một change), đóng lịch.</p></div>',
  play: openFirst,
};

export const CalendarDark = {
  render: () => '<div data-td-theme="dark" class="sb-stack sb-dark" style="min-height: 28rem">'
    + '<td-datetime-picker mode="date" label="Ngày giao (tối)" value="15/06/2026"></td-datetime-picker></div>',
  play: openFirst,
};

export const CalendarInsideModal = {
  render: () => '<div class="sb-stack"><button type="button" class="td-btn td-btn--primary" data-sb-open-modal><span class="td-btn__label">Mở hộp thoại có ô ngày</span></button>'
    + '<p class="sb-note">Lịch nổi trên hộp thoại (không phải hộp thoại thứ hai); Esc đóng riêng lịch.</p></div>',
  play: ({ canvasElement }) => {
    const open = () => {
      const body = document.createElement('div');
      body.innerHTML = '<td-datetime-picker mode="date" label="Ngày giao" value="15/06/2026"></td-datetime-picker><p>Nội dung hộp thoại.</p>';
      TdModal.show({ title: 'Đơn hàng', body, escapeCloses: true, actions: [{ label: 'Đóng', value: 'x' }] });
    };
    const btn = canvasElement.querySelector('[data-sb-open-modal]');
    if (btn && !btn.dataset.bound) { btn.dataset.bound = '1'; btn.addEventListener('click', open); }
  },
};
