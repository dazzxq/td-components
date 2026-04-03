import { TdToast } from './td-toast.js';

export default {
  title: 'Feedback/Toast',
  tags: ['autodocs'],
};

export const AllVariants = {
  render: () => `
    <div class="flex flex-wrap gap-3">
      <button class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              id="toast-success-btn">Success</button>
      <button class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              id="toast-error-btn">Error</button>
      <button class="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors"
              id="toast-warning-btn">Warning</button>
      <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              id="toast-info-btn">Info</button>
    </div>
  `,
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#toast-success-btn').addEventListener('click', () => {
      TdToast.success('Luu thanh cong!');
    });
    canvasElement.querySelector('#toast-error-btn').addEventListener('click', () => {
      TdToast.error('Co loi xay ra!');
    });
    canvasElement.querySelector('#toast-warning-btn').addEventListener('click', () => {
      TdToast.warning('Canh bao: Du lieu chua duoc luu!');
    });
    canvasElement.querySelector('#toast-info-btn').addEventListener('click', () => {
      TdToast.info('Thong tin: Ban co 3 thong bao moi.');
    });
  },
};

export const Success = {
  render: () => `
    <button class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            id="toast-s-btn">Show Success Toast</button>
  `,
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#toast-s-btn').addEventListener('click', () => {
      TdToast.success('Luu thanh cong!');
    });
  },
};

export const Error = {
  render: () => `
    <button class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            id="toast-e-btn">Show Error Toast</button>
  `,
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#toast-e-btn').addEventListener('click', () => {
      TdToast.error('Co loi xay ra!');
    });
  },
};

export const Warning = {
  render: () => `
    <button class="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors"
            id="toast-w-btn">Show Warning Toast</button>
  `,
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#toast-w-btn').addEventListener('click', () => {
      TdToast.warning('Canh bao!');
    });
  },
};

export const AutoDismiss = {
  render: () => `
    <div class="flex flex-wrap gap-3">
      <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              id="toast-fast-btn">Fast (1s)</button>
      <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              id="toast-slow-btn">Slow (8s)</button>
    </div>
  `,
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#toast-fast-btn').addEventListener('click', () => {
      TdToast.info('Toast nay se mat sau 1 giay', 1000);
    });
    canvasElement.querySelector('#toast-slow-btn').addEventListener('click', () => {
      TdToast.info('Toast nay se mat sau 8 giay', 8000);
    });
  },
};
