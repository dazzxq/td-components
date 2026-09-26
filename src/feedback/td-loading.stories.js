import '../styles/story-layout.css';
import '../form/td-button.js';
import { TdLoading, TdLoadingSpinner } from './td-loading.js';

export default {
  title: 'Feedback/Loading',
  tags: ['autodocs'],
};

const on = (root, sel, fn) => root.querySelector(sel).addEventListener('click', fn);

/** Blocking overlay: strong glass card over a plain scrim; page inert, focus held, restored after. */
export const FullscreenOverlay = {
  render: () => {
    const root = document.createElement('div');
    root.innerHTML = '<td-button id="loading-show-btn">Show loading (2s)</td-button>';
    on(root, '#loading-show-btn', () => {
      TdLoading.show('Đang tải dữ liệu...');
      setTimeout(() => TdLoading.hide(), 2000);
    });
    return root;
  },
};

export const InlineSpinner = {
  render: () => {
    const row = document.createElement('div');
    row.className = 'sb-row';
    for (const [opts, text] of [[{ size: 'sm' }, 'Small'], [{ size: 'md' }, 'Medium'], [{ size: 'lg' }, 'Large'],
      [{ size: 'md', color: '#8b5cf6', trackColor: 'rgba(139, 92, 246, 0.15)', label: 'Đang tải' }, 'Custom + label']]) {
      const col = document.createElement('div');
      col.className = 'sb-col';
      const caption = document.createElement('span');
      caption.className = 'sb-note';
      caption.textContent = text;
      col.append(TdLoadingSpinner.create(opts), caption);
      row.appendChild(col);
    }
    return row;
  },
};

/** wrap() is ref-counted: the overlay stays until the LAST concurrent task settles. */
export const ConcurrentWrap = {
  render: () => {
    const root = document.createElement('div');
    root.innerHTML = '<td-button id="wrap-btn" variant="secondary">Run 2 tasks (1s + 2.5s)</td-button>'
      + '<p class="sb-note">The overlay hides only when both tasks finish.</p>';
    on(root, '#wrap-btn', () => {
      TdLoading.wrap(() => new Promise((r) => setTimeout(r, 1000)), 'Đang lưu...');
      TdLoading.wrap(() => new Promise((r) => setTimeout(r, 2500)), 'Đang tải file lên...');
    });
    return root;
  },
};

export const WithAutoHide = {
  render: () => {
    const root = document.createElement('div');
    root.innerHTML = '<td-button id="loading-autohide-btn" variant="warning">Show loading (auto-hide 3s)</td-button>'
      + '<p class="sb-note">Loading sẽ tự động ẩn sau 3 giây (maxDuration).</p>';
    on(root, '#loading-autohide-btn', () => TdLoading.show({ message: 'Sẽ tự động ẩn...', maxDuration: 3000 }));
    return root;
  },
};
