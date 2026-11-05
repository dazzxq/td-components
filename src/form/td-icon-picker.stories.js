import { escapeHtml } from '../utils/escape.js';
import { registerIcons, hasIcon } from '../icons/td-icon.js';
import './td-icon-picker.js';
import '../styles/story-layout.css';

export default {
  title: 'Form/Icon picker',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    suggestions: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};

const esc = (v) => escapeHtml(String(v ?? ''));

/** the class (story checks load form modules as empty stubs: read it at play time) */
const picker = () => customElements.get('td-icon-picker');
/** the kit's loader, put back by every story (the "load error" story swaps it for a failing one) */
let KIT_LOADER = null;
const kitLoader = () => {
  const C = picker();
  KIT_LOADER ??= C.loadSearchData;
  C.loadSearchData = KIT_LOADER;
};

const showEvents = (canvasElement) => {
  const out = canvasElement.querySelector('[data-out]');
  for (const host of canvasElement.querySelectorAll('td-icon-picker')) {
    for (const t of ['input', 'change']) host.addEventListener(t, (e) => { if (e.detail && out) out.textContent = `Sự kiện ${t}: ${e.detail.value || '(rỗng)'}`; });
  }
};

/** Default: an empty field; the popup lists every registered icon A–Z, search by name / VI label / EN + VI keywords. */
export const Default = {
  render: (args) => `<form class="sb-stack" novalidate>
    <td-icon-picker name="menu_icon" label="${esc(args.label)}" value="${esc(args.value)}"${args.suggestions ? ` suggestions="${esc(args.suggestions)}"` : ''}${args.required ? ' required' : ''}${args.disabled ? ' disabled' : ''}></td-icon-picker>
    <p class="sb-note" data-out>Sự kiện: —</p></form>`,
  args: { label: 'Icon mục', value: '', suggestions: '', required: false, disabled: false },
  play: ({ canvasElement }) => { kitLoader(); showEvents(canvasElement); },
};

/** A value + the "Gợi ý" row (attribute; an alias `x` is stored as `close`). */
export const ValueAndSuggestions = {
  render: () => `<form class="sb-stack" novalidate>
    <td-icon-picker name="menu_icon" label="Icon mục" value="trash" suggestions="home user settings trash search star x"></td-icon-picker>
    <td-icon-picker name="limited" label="Chỉ trong tập cho phép" value="home" icons="home user settings trash search star close check"
      helper-text="Thuộc tính icons giới hạn lưới"></td-icon-picker>
    <p class="sb-note" data-out>Sự kiện: —</p></form>`,
  play: ({ canvasElement }) => { kitLoader(); showEvents(canvasElement); },
};

/** Required + error text (valueMissing = "Vui lòng chọn icon"; no clear button while required). */
export const RequiredAndError = {
  render: () => `<form class="sb-stack" novalidate>
    <td-icon-picker name="a" label="Bắt buộc" required></td-icon-picker>
    <td-icon-picker name="b" label="Có lỗi" value="star" error-text="Icon này đã dùng cho mục khác."></td-icon-picker>
    <button type="button" class="td-btn" data-check>Kiểm tra</button>
    <p class="sb-note" data-out>—</p></form>`,
  play: ({ canvasElement }) => {
    kitLoader();
    const out = canvasElement.querySelector('[data-out]');
    canvasElement.querySelector('[data-check]').addEventListener('click', () => {
      const host = canvasElement.querySelector('td-icon-picker[required]');
      out.textContent = host.checkValidity() ? 'Hợp lệ' : `Không hợp lệ: ${host.validationMessage}`;
    });
  },
};

/** Disabled (not submitted) / read-only (submitted, never opens) / no clear button / only an aria-label. */
export const DisabledReadonly = {
  render: () => `<div class="sb-stack">
    <td-icon-picker name="a" label="Đang khoá" value="home" disabled></td-icon-picker>
    <td-icon-picker name="b" label="Chỉ đọc" value="user" readonly></td-icon-picker>
    <td-icon-picker name="c" label="Không có nút xoá" value="settings" allow-clear="false"></td-icon-picker>
    <td-icon-picker name="d" aria-label="Icon của nút" value="search"></td-icon-picker></div>`,
  play: () => kitLoader(),
};

/** A site icon (registerIcons) with its search metadata (registerIconSearchData): search "kho hang" or "warehouse". */
export const SiteIcon = {
  render: () => `<div class="sb-stack">
    <td-icon-picker name="menu_icon" label="Icon mục" value="site-warehouse" suggestions="site-warehouse home"></td-icon-picker>
    <td-icon-picker name="later" label="Icon site chưa đăng ký (giữ nguyên giá trị)" value="site-later"></td-icon-picker></div>`,
  play: async () => {
    kitLoader();
    const { registerIconSearchData } = await import('./td-icon-picker.js');
    if (!hasIcon('site-warehouse')) {
      registerIcons({
        'site-warehouse': { nodes: [['path', { d: 'M3 21V8l9-5 9 5v13' }], ['path', { d: 'M7 21v-8h10v8' }], ['path', { d: 'M7 17h10' }]] },
      });
      registerIconSearchData({ 'site-warehouse': { label: 'Kho hàng', keywords: { en: ['warehouse', 'storage'], vi: ['kho', 'lưu trữ'] } } });
    }
  },
};

/** The hook fails (TdIconPicker.loadSearchData rejects): status + "Thử lại"; search still works on names + aliases. */
export const LoadError = {
  render: () => `<div class="sb-stack"><td-icon-picker name="menu_icon" label="Dữ liệu tìm kiếm lỗi"></td-icon-picker>
    <p class="sb-note">Mở popup: thanh trạng thái báo lỗi tải, nút Thử lại gọi lại hook (vẫn lỗi trong story này).</p></div>`,
  play: () => {
    const C = picker();
    KIT_LOADER ??= C.loadSearchData;
    C.loadSearchData = () => Promise.reject(new Error('story: offline'));
  },
};

/** v0.96.1 (opt-in): the trigger shows the VI label, a "Không icon" cell on top, groups + a filter row (property `groups`). */
export const LabelNoneGroups = {
  render: () => `<form class="sb-stack" novalidate>
    <td-icon-picker name="menu_icon" label="Icon mục" value="trash" trigger-text="label" none-option none-value="none" data-story="groups"></td-icon-picker>
    <p class="sb-note" data-out>Sự kiện: —</p></form>`,
  play: ({ canvasElement }) => {
    kitLoader();
    const host = canvasElement.querySelector('[data-story="groups"]');
    host.groups = [
      { key: 'actions', label: 'Thao tác', icons: ['trash', 'search', 'check', 'close'] },
      { key: 'places', label: 'Điều hướng', icons: ['home', 'settings', 'user'] },
    ];
    showEvents(canvasElement);
  },
};
