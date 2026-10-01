import '../styles/story-layout.css';
import '../form/td-button.js';
import { TdToast } from './td-toast.js';

export default {
  title: 'Feedback/Toast',
  tags: ['autodocs'],
};

/** Build a row of td-buttons wired to click handlers. */
function buttons(items, note = '') {
  const root = document.createElement('div');
  root.className = 'sb-stack';
  const row = document.createElement('div');
  row.className = 'sb-row';
  for (const [label, variant, fn] of items) {
    const b = document.createElement('td-button');
    b.setAttribute('variant', variant);
    b.textContent = label;
    b.addEventListener('click', fn);
    row.appendChild(b);
  }
  root.appendChild(row);
  if (note) {
    const p = document.createElement('p');
    p.className = 'sb-note';
    p.textContent = note;
    root.appendChild(p);
  }
  return root;
}

/** v0.21.0 dcms-style pills: pastel fill per type, no icon, no visible close button (keyboard: Tab reveals it). */
export const AllVariants = {
  render: () => buttons([
    ['Thành công', 'secondary', () => TdToast.success('Lưu thành công!')],
    ['Lỗi', 'secondary', () => TdToast.error('Có lỗi xảy ra, vui lòng thử lại.')],
    ['Cảnh báo', 'secondary', () => TdToast.warning('Cảnh báo: dữ liệu chưa được lưu!')],
    ['Thông tin', 'secondary', () => TdToast.info('Bạn có 3 thông báo mới.')],
  ], 'Bấm vào thông báo để đóng. Di chuột hoặc Tab vào thông báo để tạm dừng hẹn giờ; nút “Đóng” chỉ hiện khi Tab tới.'),
};

export const AutoDismiss = {
  render: () => buttons([
    ['Nhanh (1 giây)', 'secondary', () => TdToast.info('Thông báo này sẽ tắt sau 1 giây', 1000)],
    ['Chậm (8 giây)', 'secondary', () => TdToast.info('Thông báo này sẽ tắt sau 8 giây', 8000)],
  ]),
};

/** duration 0 = sticky: dismissed only by its close button (keyboard) or a click. */
export const Sticky = {
  render: () => buttons([
    ['Thông báo dính', 'primary', () => TdToast.warning('Phiên làm việc sắp hết hạn. Hãy lưu bài viết.', 0)],
  ]),
};

export const LongText = {
  render: () => buttons([
    ['Nội dung dài', 'secondary', () => TdToast.info(
      'Bài viết đã được lên lịch đăng lúc 08:00 ngày mai. Bạn có thể chỉnh sửa lịch đăng trong mục Quản lý bài viết.',
      8000,
    )],
  ]),
};

/** FIFO: at most MAX_VISIBLE (5); the oldest leaves first. */
export const Burst = {
  render: () => buttons([
    ['Bắn 8 thông báo', 'secondary', () => {
      for (let i = 1; i <= 8; i++) TdToast.info(`Thông báo số ${i}`, 6000);
    }],
  ]),
};

export const DarkTheme = {
  render: () => {
    const root = buttons([
      ['Bật/tắt giao diện tối', 'secondary', () => {
        const html = document.documentElement;
        if (html.getAttribute('data-td-theme') === 'dark') html.removeAttribute('data-td-theme');
        else html.setAttribute('data-td-theme', 'dark');
      }],
      ['Hiện thông báo', 'secondary', () => {
        TdToast.success('Đã sao chép liên kết.');
        TdToast.error('Không thể kết nối máy chủ.');
      }],
    ]);
    return root;
  },
};
