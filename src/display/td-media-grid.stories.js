import { escapeHtml } from '../utils/escape.js';
import './td-media-grid.js';
import { TdLightbox } from '../feedback/td-lightbox.js';
import { TdMenu } from '../feedback/td-menu.js';
import '../styles/story-layout.css';

export default {
  title: 'Display/Media grid',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    max: { control: 'number' },
    disabled: { control: 'boolean' },
  },
};

const esc = (v) => escapeHtml(String(v ?? ''));
const IMGS = [1, 2, 3, 4, 1, 2, 3, 4];

/** Site markup (data-td-media-item + data-id + [data-td-media-open]); the element adds the ticks. Hover / focus an image to
 *  see its tick; click a tick to enter select mode, then click images to flip, Shift + click for a range, Esc to clear. */
export const Default = {
  render: (args) => `
    <td-media-grid label="${esc(args.label)}"${Number(args.max) >= 1 ? ` max="${esc(Number(args.max))}"` : ''}${args.disabled ? ' disabled' : ''}>
      ${IMGS.map((n, i) => `<div data-td-media-item data-id="f${i + 1}">
        <button type="button" data-td-media-open aria-label="Khung ${i + 1}"><img src="/lightbox/${n}.svg" width="160" height="120" alt=""></button>
      </div>`).join('')}
    </td-media-grid>`,
  args: { label: 'Khung hình cuộn 12', max: 0, disabled: false },
};

/**
 * 135-style contact sheet: the opener is a lightbox item (TdLightbox.bind — opens only while nothing is selected), each
 * item has a site ⋯ TdMenu button (the grid leaves it alone), and a selection bar follows `select-change`.
 */
export const ContactSheet = {
  render: (args) => {
    const wrap = document.createElement('div');
    wrap.className = 'sb-stack';
    const bar = document.createElement('p');
    bar.textContent = 'Chưa chọn khung nào';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'td-btn td-btn--secondary td-btn--sm';
    clear.textContent = 'Bỏ chọn';
    const grid = document.createElement('td-media-grid');
    grid.setAttribute('label', String(args.label ?? ''));
    grid.setAttribute('data-td-lightbox-group', '');
    IMGS.forEach((n, i) => {
      const item = document.createElement('div');
      item.setAttribute('data-td-media-item', '');
      item.setAttribute('data-id', `f${i + 1}`);
      const open = document.createElement('a');
      open.href = `/lightbox/${n}.svg`;
      open.setAttribute('data-td-media-open', '');
      open.setAttribute('data-td-lightbox-item', '');
      open.setAttribute('data-td-lightbox-caption', `Khung ${i + 1}`);
      const img = document.createElement('img');
      img.src = `/lightbox/${n}.svg`;
      img.width = 160;
      img.height = 120;
      img.alt = `Khung ${i + 1}`;
      open.appendChild(img);
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'td-btn td-btn--ghost td-btn--sm';
      more.setAttribute('aria-label', `Thao tác khung ${i + 1}`);
      more.textContent = '⋯';
      TdMenu.bind(more, [
        { label: 'Đặt làm bìa', icon: 'star', onClick: () => {} },
        { label: 'Xoá khung', icon: 'trash', danger: true, onClick: () => item.remove() },
      ], { label: 'Thao tác khung' });
      item.append(open, more);
      grid.appendChild(item);
    });
    grid.addEventListener('select-change', (e) => {
      const n = e.detail.ids.length;
      bar.textContent = n ? `Đã chọn ${n}: ${e.detail.ids.join(', ')}` : 'Chưa chọn khung nào';
    });
    clear.addEventListener('click', () => grid.clear({ emit: true }));
    TdLightbox.bind(wrap);
    wrap.append(bar, clear, grid);
    return wrap;
  },
  args: { label: 'Khung hình cuộn 12' },
};
