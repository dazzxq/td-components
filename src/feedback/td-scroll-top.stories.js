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

/**
 * v0.62.0 `color` / `text-color`: the fill and (optionally) the icon colour per instance, set through CSSOM. The icon colour is
 * picked by contrast (black / white) unless `text-color` keeps >= 3:1 on `color`. A very light fill needs the border / shadow
 * to stay visible on a white page; increased contrast and forced colours ignore these colours on purpose.
 */
export const CustomColour = {
  argTypes: { color: { control: 'color' }, textColor: { control: 'text' } },
  args: { threshold: 200, color: '#1e40af', textColor: '' },
  render: (args) => `
    <main id="main" class="sb-stack">
      <p class="sb-note">Cuộn xuống quá ${escapeHtml(String(args.threshold ?? ''))}px: nút có màu riêng (hover và nhấn tự suy ra).</p>
      ${paragraphs(80)}
    </main>
    <td-scroll-top threshold="${escapeHtml(String(args.threshold ?? ''))}" color="${escapeHtml(String(args.color ?? ''))}"
      ${args.textColor ? `text-color="${escapeHtml(String(args.textColor))}"` : ''}></td-scroll-top>`,
};
