import { TdLoading, TdLoadingSpinner } from './td-loading.js';

export default {
  title: 'Feedback/Loading',
  tags: ['autodocs'],
};

export const FullscreenOverlay = {
  render: () => `
    <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            id="loading-show-btn">
      Show Loading (2s)
    </button>
  `,
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#loading-show-btn').addEventListener('click', () => {
      TdLoading.show('Dang tai du lieu...');
      setTimeout(() => TdLoading.hide(), 2000);
    });
  },
};

export const InlineSpinner = {
  render: () => {
    const container = document.createElement('div');
    container.className = 'flex items-center gap-6 p-4';

    const sizes = [
      { size: 'sm', label: 'Small' },
      { size: 'md', label: 'Medium' },
      { size: 'lg', label: 'Large' },
    ];

    sizes.forEach(({ size, label }) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'flex flex-col items-center gap-2';

      const spinner = TdLoadingSpinner.create({ size });
      const text = document.createElement('span');
      text.className = 'text-sm text-gray-500';
      text.textContent = label;

      wrapper.appendChild(spinner);
      wrapper.appendChild(text);
      container.appendChild(wrapper);
    });

    // Add a custom color spinner
    const customWrapper = document.createElement('div');
    customWrapper.className = 'flex flex-col items-center gap-2';
    const customSpinner = TdLoadingSpinner.create({ size: 'md', color: '#8b5cf6', trackColor: 'rgba(139, 92, 246, 0.15)' });
    const customText = document.createElement('span');
    customText.className = 'text-sm text-gray-500';
    customText.textContent = 'Custom Color';
    customWrapper.appendChild(customSpinner);
    customWrapper.appendChild(customText);
    container.appendChild(customWrapper);

    return container;
  },
};

export const CustomMessage = {
  render: () => `
    <div class="flex flex-wrap gap-3">
      <button class="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors"
              id="loading-save-btn">Saving...</button>
      <button class="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors"
              id="loading-upload-btn">Uploading...</button>
      <button class="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors"
              id="loading-delete-btn">Deleting...</button>
    </div>
  `,
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#loading-save-btn').addEventListener('click', () => {
      TdLoading.show('Dang luu du lieu...');
      setTimeout(() => TdLoading.hide(), 2000);
    });
    canvasElement.querySelector('#loading-upload-btn').addEventListener('click', () => {
      TdLoading.show('Dang tai file len...');
      setTimeout(() => TdLoading.hide(), 2000);
    });
    canvasElement.querySelector('#loading-delete-btn').addEventListener('click', () => {
      TdLoading.show('Dang xoa...');
      setTimeout(() => TdLoading.hide(), 2000);
    });
  },
};

export const WithAutoHide = {
  render: () => `
    <button class="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
            id="loading-autohide-btn">
      Show Loading (auto-hide 3s)
    </button>
    <p class="mt-2 text-sm text-gray-500">Loading se tu dong an sau 3 giay (maxDuration).</p>
  `,
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#loading-autohide-btn').addEventListener('click', () => {
      TdLoading.show({ message: 'Se tu dong an...', maxDuration: 3000 });
    });
  },
};
