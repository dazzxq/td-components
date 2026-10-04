import { escapeHtml } from '../utils/escape.js';
import { createMockAdapter, assetFields, uploadFields } from '../../test/fixtures/media-adapter.js';
import './td-media-picker.js';
import '../styles/story-layout.css';

export default {
  title: 'Feedback/Media picker',
  tags: ['autodocs'],
  argTypes: {
    title: { control: 'text' },
  },
  // '' → the default title from selection.kinds (v0.33: "Chọn ảnh" / "Chọn video" / "Chọn tài liệu" / "Chọn media")
  args: { title: '' },
};

const esc = (v) => escapeHtml(String(v ?? ''));
const trigger = (id, label, variant = 'primary') => `<button type="button" class="td-btn td-btn--${variant}" id="${id}">
  <span class="td-btn__label">${esc(label)}</span></button>`;
// Mock adapters (no network): images from /lightbox/{1..4}.svg (Storybook static dir), 250 ms fake latency.
const mock = (o = {}) => createMockAdapter({ base: '/lightbox/', latency: 250, ...o });

/** Outcome as text (never HTML): status + the chosen ids / alt. */
function show(out, outcome) {
  out.textContent = JSON.stringify(outcome.status === 'selected'
    ? { status: outcome.status, selection: outcome.selection.map((s) => ({ assetId: s.assetId, altText: s.usage.altText })) }
    : outcome, null, 2);
}

/** Wire a trigger button to TdMediaPicker.open(options) (nothing opens on render). */
function wire(canvasElement, id, options) {
  const out = canvasElement.querySelector(`#${id}-out`);
  canvasElement.querySelector(`#${id}`).addEventListener('click', async () => {
    const Picker = customElements.get('td-media-picker');
    show(out, await Picker.open(options()));
  });
}

const frame = (id, label) => `<div class="sb-stack">${trigger(id, label)}<pre class="sb-note" id="${id}-out"></pre></div>`;

/** Single selection: click a card (select + detail), "Chèn" resolves `{ status: 'selected', selection }`. */
export const Single = {
  render: () => frame('mp-single', 'Chọn ảnh'),
  play: ({ canvasElement, args }) => {
    const adapter = mock();
    wire(canvasElement, 'mp-single', () => ({ adapter, title: String(args.title ?? ''), selection: { mode: 'single', kinds: ['image'] } }));
  },
};

/**
 * Multiple selection, at most 5 — kept across pages / searches / facets. A click only VIEWS a card; the tick (top-right),
 * Space or Ctrl/Cmd+click toggles, Shift+click selects a range; the footer shows "Đã chọn n/5" + "Bỏ chọn tất cả".
 */
export const Multiple = {
  render: () => frame('mp-multi', 'Chọn tối đa 5'),
  play: ({ canvasElement, args }) => {
    const adapter = mock();
    wire(canvasElement, 'mp-multi', () => ({ adapter, title: String(args.title ?? ''), selection: { mode: 'multiple', maxItems: 5 } }));
  },
};

/** An adapter without upload() / uploadFromUrl() / update(): no "Tải lên", the fields read-only (capabilities are inferred). */
export const NoUpload = {
  render: () => frame('mp-noup', 'Chỉ chọn'),
  play: ({ canvasElement }) => {
    const adapter = mock({ upload: false, uploadFromUrl: false, update: false });
    wire(canvasElement, 'mp-noup', () => ({ adapter, assetFields: assetFields() }));
  },
};

/** list() rejects with `code: 'network'`: the curated text + "Thử lại" (the raw message never shows). */
export const NetworkError = {
  render: () => frame('mp-err', 'Mở (mất mạng)'),
  play: ({ canvasElement }) => {
    const adapter = mock();
    adapter.list = () => Promise.reject(Object.assign(new Error('fetch failed (raw)'), { code: 'network' }));
    wire(canvasElement, 'mp-err', () => ({ adapter }));
  },
};

/**
 * dsuite-like: facets (album / scope / tags), upload with a required album field, metadata descriptors with
 * `visibleWhen` (licence expiry shows for "Mua bản quyền"), initial selection, multiple.
 */
export const DsuiteLike = {
  render: () => frame('mp-dsuite', 'Thư viện (dsuite-like)'),
  play: ({ canvasElement }) => {
    const adapter = mock();
    wire(canvasElement, 'mp-dsuite', () => ({
      adapter,
      assetFields: assetFields(),
      uploadFields: uploadFields(),
      selection: { mode: 'multiple', maxItems: 10, initialIds: ['m60', 'm58'] },
      upload: { accept: 'image/*', maxSize: '5MB' },
      context: { site: 'demo' },
    }));
  },
};

/** Declarative `<td-media-picker>`: `options` property + `open()` / events on the element. */
export const Declarative = {
  render: () => `<div class="sb-stack">${trigger('mp-decl', 'Mở (element)')}<td-media-picker id="mp-el"></td-media-picker>
    <pre class="sb-note" id="mp-decl-out"></pre></div>`,
  play: ({ canvasElement }) => {
    const el = canvasElement.querySelector('#mp-el');
    const out = canvasElement.querySelector('#mp-decl-out');
    el.options = { adapter: mock(), selection: { mode: 'single' } };
    el.addEventListener('selection-change', (e) => { out.textContent = `selection-change: ${e.detail.selection.map((s) => s.assetId).join(', ')}`; });
    canvasElement.querySelector('#mp-decl').addEventListener('click', async () => show(out, await el.open()));
  },
};

/**
 * v0.33: the dcms2 layout — full viewport at every size (resize the canvas below 768px: the toolbar wraps to two rows
 * and the detail becomes a pane sliding in from the right with "Quay lại"), inline always-open metadata form, cursor
 * pagination ("Hiển thị 1-30 / 60 media ‹ ›").
 */
export const FullViewport = {
  name: 'Full viewport',
  render: () => frame('mp-fv', 'Chọn ảnh (full viewport)'),
  play: ({ canvasElement, args }) => {
    const adapter = mock();
    wire(canvasElement, 'mp-fv', () => ({
      adapter, title: String(args.title ?? ''), assetFields: assetFields(), selection: { mode: 'single', kinds: ['image'] },
    }));
  },
};

/**
 * Upload from a URL (nested "Tải lên media" dialog, tab "Tải từ URL"): the adapter's uploadFromUrl() receives the
 * normalised href; a URL containing `?fail=` shows the server's curated message under the field. The server owns SSRF
 * protection — the client check is UX only.
 */
export const UploadFromUrl = {
  name: 'Tải từ URL',
  render: () => frame('mp-url', 'Tải lên (file + URL)'),
  play: ({ canvasElement }) => {
    const adapter = mock();
    wire(canvasElement, 'mp-url', () => ({ adapter, upload: { accept: 'image/*', maxSize: '5MB', acceptLabel: 'JPG, PNG, WEBP' } }));
  },
};

/**
 * Delete with server-side usage blocking: `capabilities.delete: true`. Assets m3, m10, m17, m24, m31… (id % 7 = 3) answer
 * `blocked` → "Không xoá được" with their usages (a `javascript:` link shows as plain text); the others are deleted
 * (the current page reloads, the detail goes empty). The kit never checks usage itself.
 */
export const DeleteBlocked = {
  name: 'Chặn xoá (usage)',
  render: () => frame('mp-del', 'Xoá (m31 bị chặn)'),
  play: ({ canvasElement }) => {
    const adapter = mock();
    wire(canvasElement, 'mp-del', () => ({ adapter, capabilities: { delete: true } }));
  },
};

/**
 * Download the original: `capabilities.downloadOriginal: true`. The mock alternates `{ url, filename }` and
 * `{ blob, filename }` — both through a temporary `<a download>` (a blob is never opened in a tab); m2 answers a
 * `javascript:` URL → refused with an error toast. Copy link (`capabilities.copyLink: true`) copies the absolute preview URL.
 */
export const Download = {
  name: 'Tải về',
  render: () => frame('mp-dl', 'Tải về + copy link'),
  play: ({ canvasElement }) => {
    const adapter = mock();
    wire(canvasElement, 'mp-dl', () => ({ adapter, capabilities: { downloadOriginal: true, copyLink: true } }));
  },
};

/**
 * `pagination: 'pages'`: the adapter receives `request.page` (1-based) and must return `total` — the toolbar shows a real
 * `<td-pagination>` (jump to any page, latest wins).
 */
export const PagesPagination = {
  name: 'Phân trang số (pages)',
  render: () => frame('mp-pages', 'Phân trang số'),
  play: ({ canvasElement }) => {
    const adapter = mock({ pagination: 'pages' });
    wire(canvasElement, 'mp-pages', () => ({ adapter, pagination: 'pages', pageSize: 12, selection: { mode: 'multiple' } }));
  },
};

/**
 * v0.35 crop step: `crop: { enabled: true, aspectRatio: 3 / 2, allowFocalPoint: true }` (like dcms2 `post-avatar-thumb`).
 * "Chèn" on an image opens "Cắt ảnh · 3:2" over the picker; "Quay lại" returns to the picker, "Chèn" resolves with
 * `usage.crop` (coordinates only — `normalized` + `pixels` when the asset has width / height) + `usage.focalPoint`.
 * Video / file → finishes at once (crop null).
 */
export const CropStep = {
  name: 'Bước cắt ảnh (crop 3:2)',
  render: () => frame('mp-crop', 'Chọn + cắt ảnh 3:2'),
  play: ({ canvasElement }) => {
    const adapter = mock();
    const out = canvasElement.querySelector('#mp-crop-out');
    canvasElement.querySelector('#mp-crop').addEventListener('click', async () => {
      const Picker = customElements.get('td-media-picker');
      const o = await Picker.open({ adapter, crop: { enabled: true, aspectRatio: 3 / 2, allowFocalPoint: true } });
      out.textContent = JSON.stringify(o.status === 'selected'
        ? o.selection.map((s) => ({ assetId: s.assetId, crop: s.usage.crop, focalPoint: s.usage.focalPoint }))
        : o, null, 2);
    });
  },
};
