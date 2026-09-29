import { escapeHtml } from '../utils/escape.js';
import '../styles/story-layout.css';

// .td-badge is CSS-only (td.css `components/badge.css`; PHP td_badge()) — no module to import.
const VARIANTS = ['neutral', 'accent', 'success', 'warning', 'danger', 'info'];

export default {
  title: 'Display/Badge',
  tags: ['autodocs'],
  argTypes: {
    text: { control: 'text' },
    variant: { control: 'select', options: VARIANTS },
    outline: { control: 'boolean' },
    stamp: { control: 'boolean' },
  },
};

/** Class list of a badge (variant from the allowlist only). */
function badgeClass(variant, modifier) {
  const v = VARIANTS.includes(variant) ? variant : 'neutral';
  return `td-badge td-badge--${v}${modifier ? ` td-badge--${modifier}` : ''}`;
}

export const Default = {
  render: (args) => {
    const modifier = args.stamp ? 'stamp' : args.outline ? 'outline' : '';
    const cls = badgeClass(args.variant, modifier);
    return `<span class="${cls}">${escapeHtml(String(args.text ?? ''))}</span>`;
  },
  args: { text: 'Mới', variant: 'accent', outline: false, stamp: false },
};

/** Soft fill · outline · stamp for every variant. */
export const AllVariants = {
  render: () => [['', 'Nền nhạt'], ['outline', 'Viền'], ['stamp', 'Con dấu']].map(([modifier, note]) => {
    const row = VARIANTS.map((v) => {
      const cls = badgeClass(v, modifier);
      return `<span class="${cls}">${v}</span>`;
    }).join(' ');
    return `<p class="sb-note">${note}</p><div class="sb-row">${row}</div>`;
  }).join(''),
};
