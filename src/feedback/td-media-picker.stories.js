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
  args: { title: 'Thư viện media' },
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

/** Single selection: click a tile (select + detail), "Chọn (1)" resolves `{ status: 'selected', selection }`. */
export const Single = {
  render: () => frame('mp-single', 'Chọn ảnh'),
  play: ({ canvasElement, args }) => {
    const adapter = mock();
    wire(canvasElement, 'mp-single', () => ({ adapter, title: String(args.title ?? ''), selection: { mode: 'single', kinds: ['image'] } }));
  },
};

/** Multiple selection, at most 5 — kept across searches / facets; the footer tray lists the picks (deselect there). */
export const Multiple = {
  render: () => frame('mp-multi', 'Chọn tối đa 5'),
  play: ({ canvasElement, args }) => {
    const adapter = mock();
    wire(canvasElement, 'mp-multi', () => ({ adapter, title: String(args.title ?? ''), selection: { mode: 'multiple', maxItems: 5 } }));
  },
};

/** An adapter without upload() / update(): no "Tải lên", no "Sửa thông tin" (capabilities are inferred). */
export const NoUpload = {
  render: () => frame('mp-noup', 'Chỉ chọn'),
  play: ({ canvasElement }) => {
    const adapter = mock({ upload: false, update: false });
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
