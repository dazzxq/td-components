import { escapeHtml } from '../utils/escape.js';
import { avatarInitial } from './avatar.js';
import '../styles/story-layout.css';

// .td-avatar is CSS-only (td.css `components/avatar.css`, v0.105.0); helpers PHP td_avatar() / JS tdAvatar().
const SIZES = ['xs', 'sm', 'm', 'lg'];
const PX = { xs: 22, sm: 32, m: 40, lg: 96 };
const PHOTO = '/test/fixtures/photo.svg';
const cls = (size) => `td-avatar${size && size !== 'm' ? ` td-avatar--${size}` : ''}`;

export default {
  title: 'Display/Avatar',
  tags: ['autodocs'],
  argTypes: {
    name: { control: 'text' },
    size: { control: 'select', options: SIZES },
    image: { control: 'boolean' },
  },
};

export const Default = {
  render: (args) => {
    const size = SIZES.includes(args.size) ? args.size : 'm';
    return args.image
      ? `<img class="${cls(size)}" src="${PHOTO}" alt="" width="${PX[size]}" height="${PX[size]}">`
      : `<span class="${cls(size)} td-avatar--empty" aria-hidden="true">${escapeHtml(avatarInitial(String(args.name ?? '')))}</span>`;
  },
  args: { name: 'Đức', size: 'm', image: false },
};

/** Every size, image and initial. */
export const Sizes = {
  render: () => SIZES.map((s) => `<p><img class="${cls(s)}" src="${PHOTO}" alt="" width="${PX[s]}" height="${PX[s]}"> `
    + `<span class="${cls(s)} td-avatar--empty" aria-hidden="true">A</span> <code>${s}</code></p>`).join(''),
};
