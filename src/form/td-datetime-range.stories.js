import { escapeHtml } from '../utils/escape.js';
import './td-datetime-range.js';
import '../styles/story-layout.css';

export default {
  title: 'Form/Datetime range',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    mode: { control: 'select', options: ['date', 'datetime'] },
    start: { control: 'text' },
    end: { control: 'text' },
    required: { control: 'select', options: ['', 'both', 'start', 'end'] },
    disabled: { control: 'boolean' },
  },
  args: { label: 'Khoảng ngày', mode: 'date', start: '', end: '', required: '', disabled: false },
};

const esc = (v) => escapeHtml(String(v ?? ''));

/** Filter of an audit log (date + presets). */
export const Default = {
  render: (a) => `<div class="sb-stack">
    <td-datetime-range name="range" label="${esc(a.label)}" mode="${esc(a.mode)}"${a.start ? ` start="${esc(a.start)}"` : ''}${a.end ? ` end="${esc(a.end)}"` : ''}${a.required ? ` required="${esc(a.required)}"` : ''}${a.disabled ? ' disabled' : ''}></td-datetime-range>
  </div>`,
};

/**
 * Promotion window: date + time, 15-minute wheel. v0.61.0: each endpoint is TWO screens — bấm ngày của Từ → màn giờ của Từ →
 * "Tiếp: Đến" → ngày của Đến → màn giờ → "Chọn" (chỉ có ở màn giờ; "Xoá" rồi "Chọn" xoá bộ lọc).
 */
export const DatetimeStep15 = {
  args: { label: 'Khung giờ khuyến mãi', mode: 'datetime', start: '01/10/2026 - 08:00', end: '05/10/2026 - 22:00' },
  render: (a) => `<div class="sb-stack" style="min-height: 34rem">
    <td-datetime-range name="promo" label="${esc(a.label)}" mode="datetime" minute-step="15" start="${esc(a.start)}" end="${esc(a.end)}"></td-datetime-range>
    <p class="sb-note">Mở hộp: màn NGÀY (lịch). Bấm một ngày → màn GIỜ của mốc đó ("‹" / Backspace quay lại). Công tắc "Từ | Đến" nhảy mốc;
      "Tiếp: Đến" sang ngày của Đến; một nút "Chọn" cuối cùng (ở màn giờ).</p>
  </div>`,
  play: ({ canvasElement }) => { setTimeout(() => canvasElement.querySelector('td-datetime-range .td-dtr__trigger')?.click(), 60); },
};

/** v0.61.0: the same two-screen flow with "Không hạn" (the end stays empty → "Chọn" on the time screen of Từ). */
export const DatetimeOpenEnd = {
  render: () => `<div class="sb-stack" style="min-height: 34rem">
    <td-datetime-range name="hl" label="Hiệu lực" mode="datetime" start="01/10/2026 - 08:00" end="05/10/2026 - 22:00" allow-open-end required="start"></td-datetime-range>
    <p class="sb-note">Bấm "Không hạn": Đến để trống và hộp chuyển tới màn giờ của Từ, nơi "Chọn" có sẵn.</p>
  </div>`,
  play: ({ canvasElement }) => { setTimeout(() => canvasElement.querySelector('td-datetime-range .td-dtr__trigger')?.click(), 60); },
};

/** Report limited to 92 days; dcms2 field names. */
export const MaxDays = {
  args: { label: 'Báo cáo (tối đa 92 ngày)' },
  render: (a) => `<div class="sb-stack">
    <td-datetime-range start-name="date_from" end-name="date_to" name="report" label="${esc(a.label)}" max-days="92" required></td-datetime-range>
  </div>`,
};

/** v0.59.0 `allow-open-end`: a validity window that may have no end ("Không hạn"). */
export const OpenEnd = {
  args: { label: 'Hiệu lực' },
  render: (a) => `<div class="sb-stack">
    <td-datetime-range name="hl" label="${esc(a.label)}" start="01/10/2026" required allow-open-end></td-datetime-range>
    <p class="sb-note">Ngày kết thúc có thể để trống: ô ghi "01/10/2026 – Không hạn"; trong hộp thoại bên "Đến" có nút
      "Không hạn". Gửi form: hl[end] = "".</p>
  </div>`,
};
