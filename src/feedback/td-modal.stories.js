import { TdModal } from './td-modal.js';

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
        title: 'Thong bao',
        body: '<p class="text-gray-600">Noi dung modal co the chua HTML, hinh anh, hoac bat ky noi dung nao.</p>',
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
        title: 'Xac nhan xoa',
        message: 'Ban co chac chan muon xoa muc nay? Hanh dong nay khong the hoan tac.',
        confirmVariant: 'danger',
        confirmText: 'Xoa',
        cancelText: 'Huy',
      });
      result.textContent = ok ? 'Da xac nhan xoa!' : 'Da huy.';
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
      TdModal.success({ title: 'Thanh cong', message: 'Da luu thanh cong!' });
    });
  },
};

export const LoadingModal = {
  render: () => `
    <button class="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors"
            id="loading-modal-btn">
      Show Loading (2s)
    </button>
  `,
  play: ({ canvasElement }) => {
    const btn = canvasElement.querySelector('#loading-modal-btn');
    btn.addEventListener('click', () => {
      const loadId = TdModal.loading('Dang xu ly...');
      setTimeout(() => TdModal.closeById(loadId), 2000);
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
        body: '<p class="text-gray-600">Day la modal dau tien. Modal thu hai se hien thi phia tren.</p>',
        size: 'lg',
      });
      setTimeout(() => {
        TdModal.show({
          title: 'Modal 2 — Foreground',
          body: '<p class="text-gray-600">Day la modal thu hai, hien thi chong len modal dau tien.</p>',
          size: 'sm',
        });
      }, 300);
    });
  },
};
