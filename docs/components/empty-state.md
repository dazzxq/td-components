[Tài liệu](../README.md) › [Components](README.md) › Empty state

# Trạng thái rỗng — `<td-empty-state>`

Khối "chưa có gì ở đây": icon trang trí, tiêu đề, một câu giải thích và (tuỳ chọn) các nút hành động như "Tạo mới".
Dùng khi một danh sách, kết quả tìm kiếm hay khu vực nội dung không có dữ liệu. Bảng [`td-table`](table.md) đã tự hiện
empty state khi không có hàng, bạn không cần tự đặt. Không dùng cho lỗi cần người dùng chú ý ngay (dùng
[toast](toast.md) hoặc [modal](modal.md)).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/empty-state'` (class: `import { TdEmptyState } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | không |
| Từ phiên bản | 0.1.0 (token-native từ 0.8.0: cần `td.css`) |

## Ví dụ nhanh

```html
<td-empty-state title="Chưa có hoá đơn" message="Tạo hoá đơn đầu tiên để bắt đầu."></td-empty-state>

<script type="module">
  import '@dazzxq/td-components/empty-state';
</script>
```

Không đặt gì cũng được: mặc định icon `inbox`, tiêu đề "Không có dữ liệu", nội dung "Chưa có mục nào được tạo.".

## Cách dùng

### 1. Thêm nút hành động

```js
const empty = document.querySelector('td-empty-state');
empty.actions = [
  { label: 'Tạo hoá đơn', variant: 'primary', onClick: () => openCreateForm() },
  { label: 'Nhập từ file', onClick: () => openImport() },
];
```

- Nút được render bằng class `.td-btn` (cỡ `sm`), **không** cần import `td-button`.
- `variant`: `'primary'`, `'secondary'` hoặc `'danger'`; giá trị khác → `'secondary'`.
- `onClick` nhận event `click` gốc (listener gắn trực tiếp lên `<button>`).
- Gán lại `actions` sẽ gỡ listener cũ trước khi tạo nút mới, **không bị cộng dồn** handler. Mảng rỗng → khung nút ẩn.
- Mục không phải object bị bỏ qua; `label` rỗng hiện `TdEmptyState.labels.action` (mặc định `Thực hiện`).

### 2. Icon khác từ registry

```html
<td-empty-state icon="search" title="Không có kết quả" message="Thử thay đổi bộ lọc."></td-empty-state>
```

`icon` là tên icon trong registry (core hoặc site đã `registerIcons()`); xem danh sách ở [Icons](icons.md). Tên không
tồn tại → hiện `inbox` + một cảnh báo console.

### 3. Icon SVG riêng của site (`iconNode`)

```js
const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(SVG_NS, 'svg');
svg.setAttribute('viewBox', '0 0 24 24');
svg.setAttribute('fill', 'none');
svg.setAttribute('stroke', 'currentColor');
svg.setAttribute('stroke-width', '2');
const path = document.createElementNS(SVG_NS, 'path');
path.setAttribute('d', 'M4 4h16v16H4z');
svg.appendChild(path);

document.querySelector('td-empty-state').iconNode = svg;
```

`iconNode` nhận một `SVGElement` **do site tự dựng (tin cậy)**. Component **clone** nó (node gốc của bạn không bị di
chuyển), đặt `aria-hidden="true"`, `focusable="false"` và `width`/`height` theo `size`. `iconNode` thắng `icon`. Giá trị
không phải `SVGElement` → `null` (quay về `icon`). Nếu icon dùng lại nhiều nơi, đăng ký nó bằng `registerIcons()` rồi
dùng `icon="tên"` sẽ gọn hơn.

### 4. Kích thước và độ gọn

```html
<td-empty-state size="sm" compact title="Trống"></td-empty-state>
<td-empty-state size="lg" title="Chưa có dự án" message="Dự án bạn tạo sẽ hiện ở đây."></td-empty-state>
```

| `size` | Icon | Padding (thường / `compact`) |
|---|---|---|
| `sm` | 28 px | 16px / 8px |
| `md` | 40 px | 22px / 11px |
| `lg` | 56 px | 28px / 14px |

### 5. Đúng cấp heading trong trang

```html
<h2>Đơn hàng</h2>
<td-empty-state heading-level="3" title="Chưa có đơn hàng"></td-empty-state>
```

`heading-level` 2–6 (mặc định 3, ngoài khoảng → 3). Chọn cấp nối tiếp heading bao quanh để cây heading của trang đúng.

### 6. In sẵn từ server, không nháy (`td_empty()`, 0.26.0)

Trang PHP dùng [`td_empty()`](../guides/php-adapter.md#td_empty-0260): helper in host
`<td-empty-state data-td-ssr="empty-state@1">` kèm **đúng cây** mà `render()` tạo (icon đã điền SVG, heading đúng cấp,
lời nhắn, nút hành động là link `td_link` chế độ element). `td.css` tạo dáng ngay khi chưa có JS; nạp module thì
component **nhận markup tại chỗ** — không thay con, không nháy, không xô lệch:

```php
<?= td_empty('Chưa có sản phẩm', 'Tạo sản phẩm đầu tiên.', [
    'actions' => [['label' => 'Tạo sản phẩm', 'href' => '/products/new', 'variant' => 'primary']],
]) ?>
```

- Hydrate chỉ khi cấu trúc khớp `render()` cho đúng attribute hiện tại và mọi node chỉ mang thuộc tính trong allowlist
  (`on*`, `style`, `data-td-*` lạ, phần tử / chữ thừa, icon / cấp heading / chữ lệch → **render lại** như thường; không
  có state nên không mất gì). Icon được tạo lại từ registry JS (cùng hộp). Icon không có / tên lạ → `inbox` ở cả PHP lẫn JS.
- **Nút hành động của server được giữ** (cùng node) tới khi trang gán property `actions` — lúc đó thay bằng nút JS như
  mục 1. Đổi attribute cấu trúc (`size`, `title`…) sau đó vẫn giữ chúng. Mỗi nút server ở **một trong hai** trạng thái
  hợp lệ: `<td-button data-td-ssr="button@1">` chưa hydrate (chỉ nạp module `empty-state` — `td-button` chưa định
  nghĩa; link vẫn bấm được) hoặc `<td-button>` đã hydrate (nạp gốc package: `td-button` được định nghĩa trước).
- Dấu `data-td-ssr` bị gỡ sau khi đọc. Viết `<td-empty-state>` bằng tay (không dấu) → render như trước.

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `icon` | string | `inbox` | Tên icon registry. Chuỗi SVG thô **deprecated** (xem [Bảo mật](#bảo-mật)). |
| `title` | string | `Không có dữ liệu` | Tiêu đề (escape). Vì `title` cũng là attribute HTML toàn cục, trình duyệt hiện nó thành tooltip khi hover lên component. |
| `message` | string | `Chưa có mục nào được tạo.` | Câu giải thích (escape). |
| `size` | `'sm'` \| `'md'` \| `'lg'` | `md` | Cỡ icon, chữ, padding. |
| `compact` | boolean | vắng | Giảm padding (dùng trong bảng, thẻ nhỏ). |
| `heading-level` | number | `3` | Cấp heading của tiêu đề, 2–6. |

Chuỗi rỗng ở `title` / `message` được coi như không đặt (dùng mặc định). Đổi bất kỳ attribute nào → render lại khối
(các nút hành động được dựng lại, listener gắn lại đúng một lần).

## Property & method

| Property | Kiểu | Mô tả |
|---|---|---|
| `actions` | `Array<{ label: string, variant?: 'primary' \| 'secondary' \| 'danger', onClick?: (e: MouseEvent) => void }>` | Nút hành động. Không phải mảng → `[]`. |
| `iconNode` | `SVGElement \| null` | Icon SVG tin cậy do site dựng; được clone, trang trí; thắng `icon`. |
| `TdEmptyState.labels` | static object | `{ action: 'Thực hiện' }` — chữ của nút hành động thiếu `label` (cả trang): `TdEmptyState.labels.action = 'Do it'`. |

Không có method công khai riêng; không phát event riêng (nghe `onClick` của từng action).

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-empty-state-bg` | `var(--td-color-surface)` | Nền khối |
| `--td-empty-state-border` | `var(--td-color-border-strong)` | Viền nét đứt |
| `--td-empty-state-icon` | `var(--td-color-text-subtle)` | Màu icon |

Hai biến `--td-empty-state-pad` (mặc định `22px`) và `--td-empty-state-gap` (`10px`) của cỡ md khai báo trên `:root`
(từ 0.16.0), nên `:root { --td-empty-state-pad: 32px; }` có tác dụng. Cỡ `sm` / `lg` và `compact` đặt lại chúng trên
`.td-empty-state` (class `--sm`, `--lg`, `--compact`); muốn đổi những cỡ đó thì nhắm class tương ứng.

```css
:root { --td-empty-state-icon: var(--td-accent); }
.sidebar .td-empty-state { border-style: solid; }
```

Khối là bề mặt đặc (lớp nội dung), không có glass. Nút hành động theo token của `.td-btn` (xem [Button](button.md)).

## Cấu trúc DOM & class

```html
<td-empty-state>
  <div class="td-empty-state td-empty-state--md [td-empty-state--compact]">
    <div class="td-empty-state__icon" aria-hidden="true">
      <span data-td-icon="inbox" data-td-icon-size="40"><svg width="40" height="40" class="td-icon" data-icon="inbox" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg></span>
    </div>
    <h3 class="td-empty-state__title">Không có dữ liệu</h3>
    <p class="td-empty-state__message">Chưa có mục nào được tạo.</p>
    <div class="td-empty-state__actions" [hidden]>
      <button type="button" class="td-btn td-btn--primary td-btn--sm">Tạo mới</button>
    </div>
  </div>
</td-empty-state>
```

Với `iconNode` hoặc SVG chuỗi hợp lệ, phần tử svg nằm thẳng trong `.td-empty-state__icon` (không có `<span>` bọc). Mẫu markup
chuẩn cho server render là khối ở trên (có thể render khối `.td-empty-state` độc lập, chỉ cần `td.css`). Icon: in slot
`<span data-td-icon="inbox" data-td-icon-size="40"></span>` rồi gọi `fillIconSlots(root)`, hoặc in svg đầy đủ như
trên (geometry từ `icons.json`). `td_icon()` của [adapter PHP](../guides/php-adapter.md) chỉ có cỡ `s`/`m`/`l`, không in
được cỡ 40px. Empty state không có helper PHP; fixture `test/contracts/empty-state.html` trong repo kit chỉ dùng cho test
(không nằm trong gói npm).

## Bàn phím & trợ năng

- Icon luôn trang trí (`aria-hidden` trên khung icon) — ý nghĩa nằm ở tiêu đề và câu giải thích.
- Tiêu đề là heading thật (`h2`–`h6`) để người dùng trình đọc màn hình nhảy tới.
- Nút hành động là `<button type="button">` native: Tab, Enter/Space.
- Tiêu đề và nội dung đạt ≥ 4.5:1 trên nền khối (sáng và tối). Forced colors: viền và icon dùng `CanvasText`.

## Bảo mật

- `title`, `message`, `label` của action đều là **text** (escape / `textContent`).
- `iconNode` là cửa cho SVG tin cậy: chỉ đưa SVG do code của bạn dựng, không đưa SVG lấy từ người dùng.
- **Chuỗi SVG trong `icon` (deprecated)**: không bao giờ được gán `innerHTML`. Chuỗi được parse như
  `image/svg+xml`, và chỉ được vẽ lại (bằng `createElementNS`) khi là "hình học thuần":
  - phần tử gốc là svg có `viewBox` hợp lệ, attribute gốc chỉ trong danh sách cho phép (`xmlns`, `viewBox`, `fill`, `stroke`,
    `stroke-width`, `width`, `height`, `class`…), không có `url(`/`javascript:`;
  - mỗi phần tử con là một trong `path`, `circle`, `rect`, `line`, `polyline`, `polygon`, `ellipse` với attribute hình
    học hợp lệ (không nhóm `<g>`, không `<use>`, `<script>`, `<foreignObject>`, `style`, `on*`, `href`);
  - tối đa 64 hình, chuỗi ≤ 32 000 ký tự, không DTD/ENTITY.

  Đạt thì vẽ + một cảnh báo deprecated; không đạt thì hiện `inbox` + một cảnh báo. Thay bằng `iconNode` hoặc
  `registerIcons()`. Quy tắc đầy đủ: [Icons](icons.md#bảo-mật).

## Lưu ý & lỗi thường gặp

- **Hover thấy tooltip trùng tiêu đề**: tiêu đề được đọc từ attribute `title`, mà trình duyệt luôn hiện attribute này
  thành tooltip. Đây là đánh đổi đã biết của API; không có attribute tiêu đề thay thế.
- **Action thiếu `label`** hiện `TdEmptyState.labels.action` ("Thực hiện"; trước 0.16.0 là "Action") — chữ chung
  chung, nên luôn truyền `label`.
- **Icon không đổi màu**: icon dùng `currentColor`, lấy từ `--td-empty-state-icon`; `iconNode` tự đặt `fill`/`stroke`
  cứng sẽ không theo token — dùng `currentColor` trong SVG của bạn.
- Di chuyển element trong DOM: listener của nút được gỡ khi rời trang và gắn lại khi vào lại, nút vẫn hoạt động. Từ
  0.26.0 gắn lại **không render lại** (giữ nguyên node; markup bị sửa trong lúc rời trang thì render lại).

## Xem thêm

- [Icons](icons.md) · [Table](table.md) · [Button](button.md) (contract `.td-btn`)
- [Theming](../customization/theming.md) · [Bảo mật](../guides/security.md) · [Mở rộng](../customization/extending.md)
