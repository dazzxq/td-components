import { escapeHtml } from '../utils/escape.js';
import '../styles/story-layout.css';

// .td-card is CSS-only (td.css `components/card.css`; PHP td_card()) — no module to import.
// Cover images are inline SVG data URLs generated here (no network); every text goes through escapeHtml().
// The `image` icon as plain markup (what td_icon('image', 'l') prints); a story is a string, so no DOM is needed here.
const IMAGE_ICON = '<svg class="td-icon td-icon--l" data-icon="image" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
  + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>'
  + '<circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
const RATIOS = ['', '1x1', '4x3', '3x2', '16x9', '3x4'];

/** A flat coloured SVG used as a cover (data URL, safe: built from a fixed hue number only). */
function cover(hue) {
  const h = Number(hue) | 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">`
    + `<rect width="640" height="480" fill="hsl(${h} 45% 62%)"/><circle cx="470" cy="150" r="70" fill="hsl(${h} 60% 85%)"/>`
    + `<path d="M0 480 L190 240 L330 380 L430 290 L640 480Z" fill="hsl(${h} 40% 38%)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * One card. Nothing but allowlisted class names reaches `class`; text is escaped; the cover is a data URL we built.
 * @param {{ title: string, href?: string, hue?: number | null, surface?: boolean, ratio?: string, badges?: string[], meta?: string[], heading?: number, picture?: boolean }} c
 */
function card(c) {
  const ratio = RATIOS.includes(c.ratio) && c.ratio ? ` td-card--ratio-${c.ratio}` : '';
  const cls = `td-card${c.surface ? ' td-card--surface' : ''}${ratio}`;
  const tag = c.href ? 'a' : 'div';
  const media = c.hue == null
    ? `<span class="td-card__placeholder" aria-hidden="true">${IMAGE_ICON}</span>`
    : c.picture
      ? `<picture><source type="image/svg+xml" srcset="${cover(c.hue)}"><img src="${cover(c.hue)}" alt="" loading="lazy" decoding="async"></picture>`
      : `<img src="${cover(c.hue)}" alt="" loading="lazy" decoding="async" width="640" height="480">`;
  const level = [2, 3, 4, 5, 6].includes(c.heading) ? c.heading : 0;
  const titleTag = level ? `h${level}` : 'span';
  const badges = (c.badges ?? []).length
    ? ` <span class="td-card__badges">${c.badges.map((b) => `<span class="td-badge td-badge--${b === 'Live' ? 'danger' : 'neutral'}">${escapeHtml(b)}</span>`).join(' ')}</span>`
    : '';
  const meta = (c.meta ?? []).length
    ? ` <span class="td-card__meta">${c.meta.map((m) => `<span>${escapeHtml(m)}</span>`).join(' <span class="td-card__sep" aria-hidden="true">·</span> ')}</span>`
    : '';
  const href = c.href ? ` href="${escapeHtml(c.href)}"` : '';
  return `<${tag} class="${cls}"${href}><span class="td-card__media">${media}</span> `
    + `<span class="td-card__body"><${titleTag} class="td-card__title">${escapeHtml(c.title)}</${titleTag}>${badges}${meta}</span></${tag}>`;
}

const ALBUMS = [
  { title: 'Tết 2026', hue: 12, badges: ['Live'], meta: ['42 ảnh', '12/02/2026'] },
  { title: 'Đà Lạt tháng 3', hue: 150, meta: ['18 ảnh', '03/03/2026'] },
  { title: 'Sinh nhật Bin', hue: 280, badges: ['Riêng tư'], meta: ['120 ảnh', '21/01/2026'] },
  { title: 'Chưa có ảnh bìa', hue: null, meta: ['0 ảnh', '01/11/2026'] },
];

export default {
  title: 'Display/Card',
  tags: ['autodocs'],
  argTypes: {
    title: { control: 'text' },
    surface: { control: 'boolean' },
    ratio: { control: 'select', options: RATIOS },
    link: { control: 'boolean', description: 'a.td-card (link) or a static div.td-card' },
    withImage: { control: 'boolean' },
    badge: { control: 'text' },
    meta: { control: 'text' },
  },
};

export const Default = {
  render: (args) => card({
    title: String(args.title ?? ''),
    href: args.link ? '#album' : undefined,
    hue: args.withImage ? 200 : null,
    surface: !!args.surface,
    ratio: args.ratio,
    badges: args.badge ? [String(args.badge)] : [],
    meta: args.meta ? [String(args.meta)] : [],
    heading: 3,
  }),
  args: { title: 'Tết 2026', surface: false, ratio: '', link: true, withImage: true, badge: 'Live', meta: '42 ảnh' },
};

/** The album grid: `.td-card-grid` (auto-fill, container-free) holding bare cards. */
export const AlbumGrid = {
  render: () => `<div class="td-card-grid">${ALBUMS.map((a) => card({ ...a, href: '#album', heading: 3 })).join('')}</div>`,
};

/** `.td-card--surface`: fill + edge + shadow; hover = a solid fill. */
export const Surface = {
  render: () => `<div class="td-card-grid">${ALBUMS.map((a) => card({ ...a, href: '#album', surface: true, heading: 3 })).join('')}</div>`,
};

/** No cover image: the placeholder tile (icon `image`). */
export const NoImage = {
  render: () => `<div class="td-card-grid">${card({ title: 'Chưa có ảnh bìa', hue: null, href: '#a', meta: ['0 ảnh'] })}${card({ title: 'Hộp, chưa có ảnh', hue: null, href: '#a', surface: true, meta: ['0 ảnh'] })}</div>`,
};

/** A card without a link: the same classes on a div — no pointer cursor, no hover, no press. */
export const Static = {
  render: () => `<div class="td-card-grid">${card({ title: 'Card tĩnh', hue: 40, meta: ['không có liên kết'] })}${card({ title: 'Card tĩnh (hộp)', hue: 40, surface: true, meta: ['không có liên kết'] })}</div>`,
};

/** Several badges wrap inside the image corner. */
export const ManyBadges = {
  render: () => `<div class="td-card-grid">${card({ title: 'Nhiều nhãn', hue: 330, href: '#a', badges: ['Live', 'Riêng tư', 'Mới', 'Nổi bật'], meta: ['9 ảnh'] })}</div>`,
};

/** A very long title clamps to two lines; a long unbroken string wraps (`overflow-wrap: anywhere`). */
export const LongTitle = {
  render: () => `<div class="td-card-grid">${card({ title: 'Một tiêu đề album rất dài '.repeat(8), hue: 90, href: '#a', meta: ['một dòng meta rất dài cũng bị cắt gọn, không xuống dòng', '12/02/2026'] })}`
    + `${card({ title: 'x'.repeat(120), hue: 200, href: '#a', meta: ['1 ảnh'] })}</div>`,
};

/** `<picture>` goes inside `.td-card__media` (markup by hand; PHP prints only `<img>`). */
export const Picture = {
  render: () => `<div class="td-card-grid">${card({ title: 'Có <picture>', hue: 60, href: '#a', picture: true, meta: ['42 ảnh'] })}</div>`,
};

/** `.td-card--ratio-*`: 1:1, 4:3 (default), 3:2, 16:9, 3:4. */
export const Ratios = {
  render: () => `<div class="td-card-grid">${RATIOS.map((r, i) => card({ title: r ? `Tỉ lệ ${r}` : 'Mặc định (4x3)', hue: 20 + i * 50, href: '#a', ratio: r, meta: ['42 ảnh'] })).join('')}</div>`,
};

/** Dark theme: colours follow the --td-card-* tokens. */
export const Dark = {
  render: () => `<div data-td-theme="dark" class="sb-dark"><div class="td-card-grid">${ALBUMS.map((a, i) => card({ ...a, href: '#album', surface: i % 2 === 1, heading: 3 })).join('')}</div></div>`,
};
