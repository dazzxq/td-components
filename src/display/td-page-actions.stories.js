import { escapeHtml } from '../utils/escape.js';
import { TdMenu } from '../feedback/td-menu.js';
import '../form/td-button.js';
import './td-page-actions.js';
import '../styles/story-layout.css';

export default {
  title: 'Display/Page actions',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
  },
};

const esc = (v) => escapeHtml(String(v ?? ''));

if (!TdMenu.has('story-sort')) {
  TdMenu.define('story-sort', (ctx) => [
    { label: `Mới nhất (album ${ctx.album || '?'})`, onSelect: () => {} },
    { label: 'Cũ nhất', onSelect: () => {} },
    { label: 'Tên A–Z', onSelect: () => {} },
  ]);
}

/** the title row: [h1 | actions] — the 480px threshold is measured on THIS row (the component's parent) */
const row = (actions, label, extra = '') => `
  <div class="sb-page-head" data-story-row>
    <h1 class="sb-page-head__title">Ảnh</h1>
    <td-page-actions label="${esc(label)}"${extra}>${actions}</td-page-actions>
  </div>`;

const ACTIONS = `
  <a class="td-btn td-btn--secondary" href="#import">Nhập</a>
  <button class="td-btn td-btn--secondary" type="button" data-td-menu="story-sort" data-td-menu-album="7">Sắp xếp</button>
  <button class="td-btn td-btn--secondary" type="button" data-td-in-menu>Xuất CSV</button>
  <button class="td-btn td-btn--danger" type="button" data-td-tone="danger">Xoá album</button>
  <td-button variant="primary" icon="upload" label="Tải ảnh lên"></td-button>`;

/** layout of the demo row only (CSSOM: CSP-safe) */
function layout(wrap, width) {
  const r = wrap.querySelector('[data-story-row]');
  r.style.display = 'flex';
  r.style.alignItems = 'center';
  r.style.gap = '1rem';
  if (width) r.style.maxInlineSize = width;
  const h = r.querySelector('h1');
  h.style.margin = '0';
  h.style.flex = 'none';
}

/**
 * The default fold: 2 secondaries shown, the primary last; "Xuất CSV" (`data-td-in-menu`) and the rest in "…".
 * "Sắp xếp" is a `data-td-menu` button (TdMenu anchored to the clicked button, ctx `album` from `data-td-menu-album`).
 */
export const Default = {
  render: (args) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = row(ACTIONS, args.label);
    layout(wrap);
    return wrap;
  },
  args: { label: 'Thao tác trang' },
};

/** A title row narrower than 480px: only the primary + "…". */
export const Narrow = {
  render: (args) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = row(ACTIONS, args.label);
    layout(wrap, '390px');
    return wrap;
  },
  args: { label: 'Thao tác trang' },
};

/** Long labels in a 560px row: the shown secondaries that do not fit fold into "…" (from the end); never the primary. */
export const Crowded = {
  render: (args) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = row(`
      <button class="td-btn td-btn--secondary" type="button">Nhập ảnh từ thư mục máy tính</button>
      <button class="td-btn td-btn--secondary" type="button">Sắp xếp theo ngày chụp</button>
      <td-button variant="primary" label="Tải ảnh lên"></td-button>`, args.label);
    layout(wrap, '560px');
    return wrap;
  },
  args: { label: 'Thao tác trang' },
};

/**
 * `mirror="id"`: the kit fills the site's sticky-header container with safe proxies of the shown actions
 * (`aria-hidden`, `tabindex=-1`); a click on a proxy clicks the original.
 */
export const Mirror = {
  render: (args) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="sb-sticky" data-story-sticky>
        <strong>Ảnh</strong>
        <div id="story-sticky-actions" data-story-mirror></div>
      </div>
      ${row(ACTIONS, args.label, ' mirror="story-sticky-actions"')}
      <p data-story-log>Chưa có thao tác.</p>`;
    layout(wrap);
    const s = wrap.querySelector('[data-story-sticky]');
    s.style.display = 'flex';
    s.style.alignItems = 'center';
    s.style.justifyContent = 'space-between';
    s.style.gap = '1rem';
    s.style.padding = '0.5rem 1rem';
    s.style.marginBlockEnd = '1rem';
    s.style.borderBlockEnd = '1px solid var(--td-color-border)';
    const m = wrap.querySelector('[data-story-mirror]');
    m.style.display = 'flex';
    m.style.gap = '0.5rem';
    const log = wrap.querySelector('[data-story-log]');
    wrap.querySelector('td-page-actions').addEventListener('click', (e) => {
      const b = e.target instanceof Element ? e.target.closest('button, a') : null;
      if (b) log.textContent = `Bấm: ${b.textContent.trim() || b.getAttribute('aria-label')}`;
    });
    return wrap;
  },
  args: { label: 'Thao tác trang' },
};
