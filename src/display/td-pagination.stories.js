import { escapeHtml } from '../utils/escape.js';
import './td-pagination.js';
import '../styles/story-layout.css';

export default {
  title: 'Display/Pagination',
  tags: ['autodocs'],
  argTypes: {
    'total-items': { control: 'number' },
    'items-per-page': { control: 'number' },
    'current-page': { control: 'number' },
    'active-color': { control: 'color' },
    'item-label': { control: 'text' },
    'max-pages': { control: 'number' },
    'aria-label': { control: 'text' },
  },
};

export const Default = {
  render: (args) => `
    <td-pagination
      total-items="${escapeHtml(String(args['total-items'] || 100))}"
      items-per-page="${escapeHtml(String(args['items-per-page'] || 10))}"
      current-page="${escapeHtml(String(args['current-page'] || 1))}"
      ${args['active-color'] ? `active-color="${escapeHtml(String(args['active-color']))}"` : ''}
      ${args['item-label'] ? `item-label="${escapeHtml(String(args['item-label']))}"` : ''}
      ${args['max-pages'] ? `max-pages="${escapeHtml(String(args['max-pages']))}"` : ''}
      ${args['aria-label'] ? `aria-label="${escapeHtml(String(args['aria-label']))}"` : ''}
    ></td-pagination>
  `,
  args: {
    'total-items': 100,
    'items-per-page': 10,
    'current-page': 1,
  },
  play: ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-pagination');
    if (el) {
      el.addEventListener('page-change', (e) => {
        console.log('page-change:', e.detail);
      });
    }
  },
};

export const ManyPages = {
  render: () => `
    <td-pagination
      total-items="500"
      items-per-page="10"
      current-page="25"
    ></td-pagination>
  `,
  play: ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-pagination');
    if (el) {
      el.addEventListener('page-change', (e) => {
        console.log('page-change:', e.detail);
      });
    }
  },
};

export const FewPages = {
  render: () => `
    <td-pagination
      total-items="30"
      items-per-page="10"
      current-page="2"
    ></td-pagination>
  `,
};

export const CustomColor = {
  render: () => `
    <td-pagination
      total-items="200"
      items-per-page="10"
      current-page="5"
      active-color="#8b5cf6"
    ></td-pagination>
  `,
};

export const CustomLabel = {
  render: () => `
    <td-pagination
      total-items="150"
      items-per-page="20"
      current-page="3"
      item-label="bài viết"
    ></td-pagination>
  `,
};

export const WindowSize = {
  render: () => `
    <td-pagination total-items="1000" items-per-page="10" current-page="50" max-pages="3" aria-label="Phân trang (max-pages=3)"></td-pagination>
    <p class="sb-note">max-pages = kích thước cửa sổ trang liên tiếp; trang đầu/cuối luôn hiện.</p>
  `,
};

export const TranslucentColor = {
  render: () => `
    <td-pagination total-items="200" items-per-page="10" current-page="5" active-color="rgba(37, 99, 235, 0.25)"></td-pagination>
    <p class="sb-note">Màu trong suốt: chữ đen/trắng chọn theo tương phản với màu đã phủ lên nền thật.</p>
  `,
};
