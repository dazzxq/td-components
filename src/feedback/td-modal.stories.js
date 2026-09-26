import { TdModal } from './td-modal.js';
import { TdLoading } from './td-loading.js';
import '../styles/story-layout.css';

export default {
  title: 'Feedback/Modal',
  tags: ['autodocs'],
};

const trigger = (id, label, variant = 'primary') => `<button type="button" class="td-btn td-btn--${variant}" id="${id}">
  <span class="td-btn__label">${label}</span></button>`;
const bind = (root, id, fn) => root.querySelector(`#${id}`).addEventListener('click', fn);
const text = (t) => {
  const p = document.createElement('p');
  p.textContent = t;
  return p;
};

export const SimpleModal = {
  render: () => `<div class="sb-stack">${trigger('m-simple', 'Mở modal')}
    <p class="sb-note">ESC và click nền không đóng modal (ADR 0006) — đóng bằng nút X hoặc nút ở footer.</p></div>`,
  play: ({ canvasElement }) => {
    bind(canvasElement, 'm-simple', () => TdModal.show({
      title: 'Thông báo',
      body: text('Nội dung modal có thể là một phần tử DOM hoặc chuỗi HTML tin cậy của lập trình viên.'),
      actions: [{ label: 'Đóng' }],
    }));
  },
};

export const ConfirmDialog = {
  render: () => `<div class="sb-stack">${trigger('m-confirm', 'Xóa mục', 'danger')}<p class="sb-note" id="m-confirm-out"></p></div>`,
  play: ({ canvasElement }) => {
    const out = canvasElement.querySelector('#m-confirm-out');
    bind(canvasElement, 'm-confirm', async () => {
      const ok = await TdModal.confirm({
        title: 'Xác nhận xóa',
        message: 'Bạn có chắc chắn muốn xóa mục này? Hành động này không thể hoàn tác.',
        confirmVariant: 'danger',
        confirmText: 'Xóa',
      });
      out.textContent = ok ? 'Đã xác nhận xóa.' : 'Đã hủy.';
    });
  },
};

export const AsyncConfirm = {
  name: 'Confirm với onConfirm bất đồng bộ',
  render: () => `<div class="sb-stack">${trigger('m-async', 'Lưu (1,5 giây)')}<p class="sb-note" id="m-async-out"></p></div>`,
  play: ({ canvasElement }) => {
    const out = canvasElement.querySelector('#m-async-out');
    bind(canvasElement, 'm-async', async () => {
      const ok = await TdModal.confirm({
        title: 'Lưu thay đổi?',
        message: 'Nút xác nhận hiển thị trạng thái đang xử lý cho tới khi lưu xong.',
        onConfirm: () => new Promise((r) => setTimeout(r, 1500)),
      });
      out.textContent = ok ? 'Đã lưu.' : 'Đã hủy.';
    });
  },
};

export const AsyncActions = {
  name: 'Footer actions (async)',
  render: () => `<div class="sb-stack">${trigger('m-actions', 'Mở form')}<p class="sb-note" id="m-actions-out"></p></div>`,
  play: ({ canvasElement }) => {
    const out = canvasElement.querySelector('#m-actions-out');
    bind(canvasElement, 'm-actions', () => {
      const form = document.createElement('div');
      form.className = 'sb-stack';
      form.innerHTML = '<label for="m-name">Họ tên</label><input id="m-name" class="td-field__control" autocomplete="name">';
      TdModal.show({
        title: 'Hồ sơ',
        body: form,
        onClose: (value) => { out.textContent = `Đóng với giá trị: ${String(value)}`; },
        actions: [
          { label: 'Hủy', value: 'cancel' },
          {
            label: 'Lưu',
            variant: 'primary',
            value: 'saved',
            // resolve false = giữ modal mở (ví dụ khi ô trống)
            onClick: () => new Promise((r) => setTimeout(() => r(form.querySelector('input').value.trim() !== ''), 1000)),
          },
        ],
      });
    });
  },
};

export const SuccessErrorInfo = {
  name: 'Success / Error / Info',
  render: () => `<div class="sb-row">${trigger('m-ok', 'Thành công', 'success')}${trigger('m-err', 'Lỗi', 'danger')}${trigger('m-info', 'Thông tin', 'secondary')}</div>`,
  play: ({ canvasElement }) => {
    bind(canvasElement, 'm-ok', () => TdModal.success({ message: 'Đã lưu thành công!' }));
    bind(canvasElement, 'm-err', () => TdModal.error({ message: 'Không thể kết nối máy chủ.' }));
    bind(canvasElement, 'm-info', () => TdModal.info({ message: 'Phiên bản mới đã sẵn sàng.' }));
  },
};

export const OnShowHook = {
  name: 'onShow(root, payload)',
  render: () => `<div class="sb-stack">${trigger('m-onshow', 'Mở')}<p class="sb-note">onShow chạy sau khi modal ở trạng thái open.</p></div>`,
  play: ({ canvasElement }) => {
    bind(canvasElement, 'm-onshow', () => TdModal.show({
      title: 'onShow',
      body: text('…'),
      onShowPayload: { user: 'An' },
      onShow: (root, payload) => { root.querySelector('.td-modal__body p').textContent = `Xin chào ${payload.user}!`; },
    }));
  },
};

export const LoadingOverModal = {
  name: 'Loading đè lên modal',
  render: () => `<div class="sb-stack">${trigger('m-loading', 'Modal + loading 2 giây', 'secondary')}</div>`,
  play: ({ canvasElement }) => {
    bind(canvasElement, 'm-loading', () => {
      TdModal.show({ title: 'Đang chờ', body: text('Loading hiển thị phía trên và giữ focus.') });
      TdLoading.show('Đang xử lý...');
      setTimeout(() => TdLoading.hide(), 2000);
    });
  },
};

export const StackedModals = {
  render: () => `<div class="sb-stack">${trigger('m-stack', 'Mở 2 modal chồng nhau')}
    <p class="sb-note">Dialog bên dưới chuyển sang nền đặc (không kính chồng kính).</p></div>`,
  play: ({ canvasElement }) => {
    bind(canvasElement, 'm-stack', () => {
      TdModal.show({ title: 'Modal 1 — nền', body: text('Modal đầu tiên. Modal thứ hai sẽ mở phía trên.'), size: 'lg' });
      setTimeout(() => TdModal.show({ title: 'Modal 2 — trên cùng', body: text('Modal thứ hai.'), size: 'sm', actions: [{ label: 'Đóng' }] }), 300);
    });
  },
};

export const ForceAction = {
  name: 'closable: false',
  render: () => `<div class="sb-stack">${trigger('m-force', 'Mở (không có nút X)', 'secondary')}</div>`,
  play: ({ canvasElement }) => {
    bind(canvasElement, 'm-force', () => TdModal.show({
      title: 'Chọn một thao tác',
      body: text('Modal này chỉ đóng bằng nút ở footer.'),
      closable: false,
      actions: [{ label: 'Tôi đã hiểu', variant: 'primary' }],
    }));
  },
};

export const FullViewport = {
  render: () => `<div class="sb-stack">${trigger('m-full', 'Toàn màn hình', 'secondary')}</div>`,
  play: ({ canvasElement }) => {
    bind(canvasElement, 'm-full', () => TdModal.show({
      title: 'Toàn màn hình',
      body: text('fullViewport: true'),
      fullViewport: true,
      bodyPadding: '1.5rem',
      actions: [{ label: 'Đóng' }],
    }));
  },
};

export const Dark = {
  render: () => `<div class="sb-stack">${trigger('m-dark', 'Modal (giao diện tối)')}</div>`,
  play: ({ canvasElement }) => {
    bind(canvasElement, 'm-dark', () => {
      document.documentElement.setAttribute('data-td-theme', 'dark');
      TdModal.show({
        title: 'Giao diện tối',
        body: text('Token --td-* tự đổi theo data-td-theme.'),
        onClose: () => document.documentElement.removeAttribute('data-td-theme'),
        actions: [{ label: 'Đóng' }],
      });
    });
  },
};
