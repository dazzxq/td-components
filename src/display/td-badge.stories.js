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
    glass: { control: 'boolean', description: 'v0.76.0: opt-in glass (blur + translucent tint); ignored with outline / stamp' },
  },
};

/** Class list of a badge (variant from the allowlist only). */
function badgeClass(variant, modifier, glass) {
  const v = VARIANTS.includes(variant) ? variant : 'neutral';
  return `td-badge td-badge--${v}${modifier ? ` td-badge--${modifier}` : ''}${glass ? ' td-badge--glass' : ''}`;
}

export const Default = {
  render: (args) => {
    const modifier = args.stamp ? 'stamp' : args.outline ? 'outline' : '';
    const cls = badgeClass(args.variant, modifier, args.glass);
    return `<span class="${cls}">${escapeHtml(String(args.text ?? ''))}</span>`;
  },
  args: { text: 'Mới', variant: 'accent', outline: false, stamp: false },
};

/** Tinted (default) · outline · stamp for every variant. */
export const AllVariants = {
  render: () => [['', 'Nền nhạt'], ['outline', 'Viền'], ['stamp', 'Con dấu']].map(([modifier, note]) => {
    const row = VARIANTS.map((v) => {
      const cls = badgeClass(v, modifier);
      return `<span class="${cls}">${v}</span>`;
    }).join(' ');
    return `<p class="sb-note">${note}</p><div class="sb-row">${row}</div>`;
  }).join(''),
};

/** v0.76.0 opt-in `.td-badge--glass`: translucent tint + blur. Shown on a plain surface and over a colourful backdrop. */
export const Glass = {
  render: () => {
    const row = (g) => VARIANTS.map((v) => `<span class="${badgeClass(v, '', g)}">${v}</span>`).join(' ');
    return `<p class="sb-note">Mặc định (tinted)</p><div class="sb-row">${row(false)}</div>`
      + `<p class="sb-note">Glass trên nền thường</p><div class="sb-row">${row(true)}</div>`
      + `<p class="sb-note">Glass trên nền nhiều màu</p><div class="sb-backdrop"><div class="sb-row">${row(true)}</div></div>`
      + `<p class="sb-note">Mặc định trên nền nhiều màu</p><div class="sb-backdrop"><div class="sb-row">${row(false)}</div></div>`;
  },
};
