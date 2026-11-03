import { escapeHtml } from '../utils/escape.js';
import './td-media-grid.js';
import './td-selection-bar.js';
import '../styles/story-layout.css';

export default {
  title: 'Display/Selection bar',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    disabled: { control: 'boolean' },
  },
};

const esc = (v) => escapeHtml(String(v ?? ''));
const IMGS = [1, 2, 3, 4];

/** one day of a photo library: a heading + a grid in the selection group `lib` */
const day = (key, title, from, group = 'lib') => `
  <h3>${esc(title)}</h3>
  <td-media-grid selection-group="${esc(group)}" label="${esc(title)}">
    ${IMGS.map((n, i) => `<div data-td-media-item data-id="${esc(`${key}-${from + i}`)}">
      <button type="button" data-td-media-open aria-label="Ảnh ${from + i}"><img src="/lightbox/${n}.svg" width="160" height="120" alt=""></button>
    </div>`).join('')}
  </td-media-grid>`;

const actions = `
  <button type="button" data-td-action="download" data-td-action-icon="download">Tải về</button>
  <button type="button" data-td-action="tag" data-td-action-icon="tag">Gắn thẻ</button>
  <button type="button" data-td-action="album" data-td-action-icon="folder-plus">Thêm vào album</button>
  <button type="button" data-td-action="delete" data-td-action-icon="trash" data-td-tone="danger">Xoá</button>`;

/**
 * Photo library by day: three grids in one selection group (`selection-group="lib"`) and one bar (`group="lib"`). Tick
 * an image, then click images in any day; Shift + click selects a range across days (DOM order); Esc clears everything.
 * An action logs its ids below and clears the selection. "Thêm một ngày" appends a grid BEFORE the bar (sticky keeps
 * working; the new grid joins the group and keeps the selection).
 */
export const Library = {
  render: (args) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      ${day('d1', 'Thứ Hai, 3 tháng 11', 1)}
      ${day('d2', 'Chủ Nhật, 2 tháng 11', 5)}
      ${day('d3', 'Thứ Bảy, 1 tháng 11', 9)}
      <td-selection-bar group="lib" label="${esc(args.label)}"${args.disabled ? ' disabled' : ''}>${actions}</td-selection-bar>
      <p><button type="button" class="td-btn td-btn--secondary td-btn--sm" data-sb-add>Thêm một ngày</button></p>
      <p data-sb-log>Chưa có thao tác.</p>`;
    const bar = wrap.querySelector('td-selection-bar');
    const log = wrap.querySelector('[data-sb-log]');
    let next = 13;
    wrap.querySelector('[data-sb-add]').addEventListener('click', () => {
      const holder = document.createElement('div');
      holder.innerHTML = day(`d${next}`, `Ngày thêm ${next}`, next);
      bar.before(...holder.childNodes);
      next += 4;
    });
    bar.addEventListener('selection-action', (e) => {
      log.textContent = `${e.detail.action}: ${e.detail.ids.join(', ')}`;
    });
    return wrap;
  },
  args: { label: 'Thao tác với ảnh đã chọn', disabled: false },
};

/** `for="…"`: one bar for two grids by id (an anonymous group). Narrow container (390px): icon-only buttons, the
 *  actions that do not fit go into the "…" menu from the end. */
export const NarrowFor = {
  render: (args) => {
    const wrap = document.createElement('div');
    wrap.style.maxInlineSize = '390px'; // CSSOM (CSP-safe): a phone-width column
    const grid = (id, name, prefix) => `<td-media-grid id="${id}" label="${esc(name)}">
        ${IMGS.map((n, i) => `<div data-td-media-item data-id="${prefix}${i + 1}">
          <button type="button" data-td-media-open aria-label="${esc(name)} ${i + 1}"><img src="/lightbox/${n}.svg" width="80" height="60" alt=""></button>
        </div>`).join('')}
      </td-media-grid>`;
    wrap.innerHTML = `
      ${grid('sb-grid-a', 'Album A', 'a')}
      ${grid('sb-grid-b', 'Album B', 'b')}
      <td-selection-bar for="sb-grid-a sb-grid-b" label="${esc(args.label)}"${args.disabled ? ' disabled' : ''}>
        ${actions}
        <button type="button" data-td-action="link" data-td-action-icon="link">Sao chép liên kết</button>
      </td-selection-bar>`;
    return wrap;
  },
  args: { label: 'Thao tác với ảnh đã chọn', disabled: false },
};

/** Locked bar (`disabled`): the controls are aria-disabled (still focusable), nothing acts. */
export const Disabled = {
  render: (args) => `
    <div>
      ${day('x', 'Ảnh đã khoá', 1, 'locked')}
      <td-selection-bar group="locked" label="${esc(args.label)}" disabled>${actions}</td-selection-bar>
    </div>`,
  args: { label: 'Thao tác với ảnh đã chọn' },
};
