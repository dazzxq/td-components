import { escapeHtml } from '../utils/escape.js';
import '../styles/story-layout.css';
import './td-scroll-top.js';

export default {
  title: 'Feedback/ScrollTop',
  tags: ['autodocs'],
  argTypes: {
    threshold: { control: 'number' },
    label: { control: 'text' },
  },
  args: { threshold: 200, label: '' },
};

const paragraphs = (n) => Array.from({ length: n }, (_, i) => `<p>Đoạn nội dung ${i + 1}. Cuộn xuống để thấy nút lên đầu trang ở góc dưới.</p>`).join('');

/** Scroll the canvas past `threshold` px: the solid round button fades in bottom-right; click → top + focus #main. */
export const Default = {
  render: (args) => `
    <main id="main" class="sb-stack">
      <p class="sb-note">Cuộn xuống quá ${escapeHtml(String(args.threshold ?? ''))}px.</p>
      ${paragraphs(80)}
    </main>
    <td-scroll-top threshold="${escapeHtml(String(args.threshold ?? ''))}"
      ${args.label ? `label="${escapeHtml(String(args.label))}"` : ''}></td-scroll-top>`,
};
