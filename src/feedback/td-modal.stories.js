import { TdModal } from './td-modal.js';
import { TdLoading } from './td-loading.js';

export default {
  title: 'Feedback/Modal',
  tags: ['autodocs'],
};

export const SimpleModal = {
  render: () => `
    <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            id="simple-modal-btn">
      Open Simple Modal
    </button>
  `,
  play: ({ canvasElement }) => {
    const btn = canvasElement.querySelector('#simple-modal-btn');
    btn.addEventListener('click', () => {
      TdModal.show({
        title: 'Thông báo',
        body: '<p class="text-gray-600">Nội dung modal có thể chứa HTML, hình ảnh, hoặc bất kỳ nội dung nào.</p>',
      });
    });
  },
};

export const ConfirmDialog = {
  render: () => `
    <div>
      <button class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              id="confirm-modal-btn">
        Delete Item
      </button>
      <p id="confirm-result" class="mt-3 text-sm text-gray-500"></p>
    </div>
  `,
  play: ({ canvasElement }) => {
    const btn = canvasElement.querySelector('#confirm-modal-btn');
    const result = canvasElement.querySelector('#confirm-result');
    btn.addEventListener('click', async () => {
      const ok = await TdModal.confirm({
        title: 'Xác nhận xóa',
        message: 'Bạn có chắc chắn muốn xóa mục này? Hành động này không thể hoàn tác.',
        confirmVariant: 'danger',
        confirmText: 'Xóa',
        cancelText: 'Hủy',
      });
      result.textContent = ok ? 'Đã xác nhận xóa!' : 'Đã hủy.';
    });
  },
};

export const SuccessDialog = {
  render: () => `
    <button class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            id="success-modal-btn">
      Show Success
    </button>
  `,
  play: ({ canvasElement }) => {
    const btn = canvasElement.querySelector('#success-modal-btn');
    btn.addEventListener('click', () => {
      TdModal.success({ title: 'Thành công', message: 'Đã lưu thành công!' });
    });
  },
};

export const LoadingModal = {
  name: 'Loading (uses TdLoading)',
  render: () => `
    <button class="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors"
            id="loading-modal-btn">
      Show Loading (2s)
    </button>
  `,
  play: ({ canvasElement }) => {
    const btn = canvasElement.querySelector('#loading-modal-btn');
    btn.addEventListener('click', () => {
      TdLoading.show('Đang xử lý...');
      setTimeout(() => TdLoading.hide(), 2000);
    });
  },
};

export const StackedModals = {
  render: () => `
    <button class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            id="stacked-modal-btn">
      Open Stacked Modals
    </button>
  `,
  play: ({ canvasElement }) => {
    const btn = canvasElement.querySelector('#stacked-modal-btn');
    btn.addEventListener('click', () => {
      TdModal.show({
        title: 'Modal 1 — Background',
        body: '<p class="text-gray-600">Đây là modal đầu tiên. Modal thứ hai sẽ hiển thị phía trên.</p>',
        size: 'lg',
      });
      setTimeout(() => {
        TdModal.show({
          title: 'Modal 2 — Foreground',
          body: '<p class="text-gray-600">Đây là modal thứ hai, hiển thị chồng lên modal đầu tiên.</p>',
          size: 'sm',
        });
      }, 300);
    });
  },
};
