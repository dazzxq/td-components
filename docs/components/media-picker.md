[Tài liệu](../README.md) › [Components](README.md) › Media picker

# Thư viện media — `TdMediaPicker.open()` / `<td-media-picker>`

Hộp thoại **full viewport** chọn ảnh / video / file từ **thư viện media của chính site**, bố cục và cách dùng giống media
picker của dcms2: thanh công cụ (Tải lên · tìm · facet gọn · phân trang), lưới **card**, panel **chi tiết** luôn mở bên
phải (form metadata, Tải về / Copy link / Xoá / Lưu), dialog **tải lên** lồng trên picker (file hoặc **URL**). Chọn **một**
hoặc **nhiều** (lựa chọn giữ qua các trang và các lần tìm). Kết quả trả về là danh sách `assetId` + ảnh chụp nhanh của
asset — picker **không** tự chèn gì vào trang. Bật option `crop` (chọn một ảnh) → sau "Chèn" có **bước cắt ảnh**, kết quả
kèm toạ độ crop + điểm trọng tâm (0.35.0, không tạo file mới).

Kit **không biết** backend của bạn. Site đưa vào một **adapter** — object gồm vài hàm `async` (`list`, `get`, tuỳ chọn
`facets`, `upload`, `uploadFromUrl`, `update`, `delete`, `download`) tự gọi API của mình và trả dữ liệu theo đúng hình
dạng ở mục [Hợp đồng adapter](#hợp-đồng-adapter). Endpoint, envelope JSON, CSRF, **quyền**, lưu trữ, kiểm file, chặn SSRF,
kiểm usage trước khi xoá đều là việc của site ([ADR 0013](../internal/decisions/0013-media-picker-boundary.md)).

Cần **một ô form** "ảnh đại diện" (khung có tỉ lệ, xem trước, Đổi / Gỡ, gửi `assetId` theo form) → dùng
[`<td-media-field>`](media-field.md); field tự mở picker này. Chỉ cần **hiện** một lưới ảnh có sẵn trong trang và cho
chọn → [`<td-media-grid>`](media-grid.md) là đủ.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/media-picker'` (class: `import { TdMediaPicker } from '@dazzxq/td-components'`) |
| Loại | API JS tĩnh (`TdMediaPicker.open()`) + custom element khai báo `<td-media-picker>` |
| Form-associated | không (ô form là [`<td-media-field>`](media-field.md)) |
| Từ phiên bản | 0.32.0 (cần `td.css`); 0.33.0 bố cục dcms2, tải từ URL, xoá, tải về, copy link, phân trang số; 0.35.0 bước cắt ảnh (option [`crop`](#cắt-ảnh--option-crop-0350)) |

## Ví dụ nhanh

```js
import { TdMediaPicker } from '@dazzxq/td-components/media-picker';
import { mediaAdapter } from '/assets/app/media-adapter.js'; // code của site — xem "Ví dụ adapter fetch"

// Một lần trong bootstrap của site:
TdMediaPicker.configureDefaults({
  adapter: mediaAdapter,
  capabilities: { delete: true, downloadOriginal: true, copyLink: true }, // ba nút này mặc định TẮT
});

// Mỗi lần cần chọn:
document.querySelector('#insert-image').addEventListener('click', async () => {
  const outcome = await TdMediaPicker.open({
    selection: { mode: 'multiple', maxItems: 5, kinds: ['image'] },   // tiêu đề mặc định: "Chọn ảnh"
  });
  if (outcome.status !== 'selected') return;            // huỷ: resolve, không reject
  for (const { assetId, asset, usage } of outcome.selection) {
    editor.insertImage({ id: assetId, src: asset.urls.preview, alt: usage.altText }); // app tự chèn
  }
});
```

## Ranh giới kit / app

| Kit lo | App (adapter + server của site) lo |
|---|---|
| Dialog full viewport, focus, Escape theo tầng, khoá cuộn, hộp xác nhận "bỏ thay đổi" / "xoá" | Endpoint, envelope JSON, map DTO → `MediaAsset` |
| Ô tìm (debounce 250ms), facet gọn, phân trang (cursor hoặc số trang); request cũ không bao giờ thắng | Auth, CSRF, 2FA / xác thực lại, **quyền**, audit, rate limit |
| Trạng thái đang tải (30 card skeleton) / rỗng / lỗi / "Thử lại" | Chuẩn hoá lỗi thành `MediaAdapterError` (chữ an toàn cho người dùng) |
| Lưới card + panel chi tiết, chọn đơn / nhiều + `maxItems` | Album, brand, tag, bản quyền… (đưa vào qua facet + descriptor) |
| Dialog tải lên: tiến độ, huỷ, "dùng lại ảnh cũ"; ô URL (kiểm cú pháp cho **tiện**, không phải bảo mật) | Kiểm file thật (magic byte, re-encode, dung lượng), dedup SHA-256, **chặn SSRF** khi tải từ URL |
| Nút Xoá + hộp xác nhận + hiển thị danh sách "đang được dùng" do server trả | **Kiểm usage + quyền trước khi xoá** — kit không bao giờ tự kiểm |
| Tải về (`<a download>` tạm, blob không bao giờ mở trong tab), Copy link | URL tải ký / `Content-Disposition`, bảng `media_usages`, chèn vào nội dung |
| Bàn phím, trợ năng, nhãn tiếng Việt, render text an toàn, CSP strict | Validate lại **mọi thứ** ở server |

Adapter là **object callback**, không bao giờ là chuỗi URL endpoint. Kit không đọc HTTP status, không nối URL, không
đoán envelope.

## Bố cục

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Chọn ảnh                                                                   × │  header (viền dưới)
├──────────────────────────────────────────────────────────────────────────────┤
│ [⇪ Tải lên] [🔍 Tìm kiếm media…        ] [Tất cả ▾] [◯ Của tôi]  Hiển thị 1-30 / 60 media ‹ › │  toolbar (1 hàng)
├───────────────────────────────────────────────────────┬──────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                    │ ┌──────────────────┐ │
│ │ 3:2  │ │      │ │      │ │      │   ← chỉ vùng này   │ │   xem trước 1:1  │ │
│ ├──────┤ ├──────┤ ├──────┤ ├──────┤     cuộn           │ └──────────────────┘ │
│ │tên   │ │      │ │      │ │      │                    │ TÊN FILE             │
│ │cỡ•ngày│ │      │ │      │ │      │                    │ form metadata        │
│ └──────┘ └──────┘ └──────┘ └──────┘                    │ ──────────────────── │
│                                                       │ Kích thước: …        │
│                                                       │ ──────────────────── │
│                                                       │ [Tải về][Copy][Xoá][Lưu] │
├───────────────────────────────────────────────────────┴──────────────────────┤
│ [2/5 đã chọn ×]                                                  [Đóng] [Chèn (2)] │  footer (viền trên)
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Full viewport ở mọi kích thước**: root `.td-modal.td-modal--viewport.td-media-picker` (`100% × 100dvh`, không bo
  góc, chỉ fade). Không còn bottom sheet. Header / footer **cộng thêm** `env(safe-area-inset-*)` vào padding gốc (tai thỏ,
  thanh home của iOS); body chỉ nhận inset hai bên.
- **Content** hai cột `[danh sách | chi tiết 25rem]`, cách nhau `1rem`. Chỉ danh sách cuộn; panel chi tiết cuộn riêng khi
  dài. Breakpoint **720px** (0.34.0, [ADR 0014](../internal/decisions/0014-breakpoints-container-queries.md); dcms2 / 0.33.0: 768px). Dialog luôn phủ kín màn hình ở mọi kích thước.
- **Dưới 1024px** (0.36.0): facet rời toolbar vào **sheet "Bộ lọc"**; **dưới 720px** phân trang nằm **dưới lưới**, footer
  một hàng — [Toolbar dưới 1024px](#toolbar-dưới-1024px--sheet-bộ-lọc-0360).
- **Tiêu đề mặc định theo `selection.kinds`**: `['image']` "Chọn ảnh", `['video']` "Chọn video", `['file']` "Chọn tài liệu",
  còn lại "Chọn media". Option `title` của `open()` thắng.

### Thanh công cụ + facet gọn

Mọi control là component kit, theo thứ tự. Từ **1024px** toolbar **luôn một hàng** như dcms2, không xuống dòng: ô tìm giữ
tối thiểu 200px, nhóm facet không đủ chỗ thì **cuộn ngang ngay trong hàng** (focus bằng bàn phím tự cuộn tới facet, vòng
focus không bị cắt; menu dropdown / chip nổi trên lớp popover nên không bị cắt). Dưới 1024px facet chuyển vào sheet "Bộ lọc"
(mục kế tiếp).

| # | Control | Ghi chú |
|---|---|---|
| 1 | `<td-button variant="primary" icon="upload">` "Tải lên" | Mở [dialog tải lên](#dialog-tải-lên). Chỉ hiện khi có `upload` hoặc `uploadFromUrl` (và capability bật) |
| 2 | `<td-input-field type="search">` | Placeholder "Tìm kiếm media…", `aria-label` "Tìm media". Debounce 250ms, Enter = tìm ngay, Escape khi có chữ = xoá chữ |
| 3 | Facet (theo thứ tự descriptor) | **Không nhãn hiển thị** — nhãn descriptor thành `aria-label` / placeholder (bảng dưới) |
| 4 | Phân trang | Đẩy sang phải; ẩn khi chỉ có một trang ([Phân trang](#phân-trang--hai-chế-độ)) |

| `type` facet | Control | Giá trị trong `filters[key]` |
|---|---|---|
| `single` | [`td-dropdown`](dropdown.md) `searchable="false" allow-clear="false"`, `min-width` 150px; option đầu "Tất cả" (giá trị rỗng = bỏ lọc) | `Scalar` (giữ kiểu); "Tất cả" → không có key |
| `toggle` | [`td-toggle`](toggle.md) `size="sm"` inline, nhãn = `label` của descriptor | bật = `options[0].value` (không có → `true`); tắt → không có key |
| `multiple` | [`td-chip-input`](chip-input.md) `selection-only`, `min-width` 200px | `Scalar[]`; rỗng → không có key |

Sắp xếp "Mới nhất / Cũ nhất" = một facet `single` key `sort` do adapter hiểu (kit không có UI sắp xếp riêng).

### Toolbar dưới 1024px + sheet "Bộ lọc" (0.36.0)

Từ 720–1023px facet bị cắt khi cuộn ngang, dưới 720px toolbar cũ chiếm 4 hàng (≈ 250px). Giờ toolbar **một hàng** ở mọi
độ rộng:

| Độ rộng | Toolbar | Phân trang |
|---|---|---|
| ≥ 1024px | Như trên (facet trong hàng, cuộn ngang) | Cuối toolbar |
| 720–1023px | [Tải lên — chỉ icon] [ô tìm] [**Bộ lọc** + badge] | Cuối toolbar |
| < 720px | [Tải lên — chỉ icon, 44px] [ô tìm] [**Bộ lọc** — chỉ icon, 44px + badge] | **Dưới lưới** (cuối vùng cuộn kết quả) |

- Nút "Bộ lọc" (`icon="filter"`, `aria-haspopup="dialog"`) chỉ có khi adapter khai báo facet. Badge số = số bộ lọc **đang
  áp** (ẩn khi 0); tên truy cập "Bộ lọc, {n} đang áp dụng" (`labels.filtersActive`).
- **Sheet bộ lọc** = hộp thoại lồng (cỡ `sm`; dưới 720px là bottom sheet của [modal](modal.md)), chứa **mọi** facet
  adapter khai báo, xếp dọc rộng hết, footer "Xoá lọc" · "Áp dụng". Không thêm facet hay sắp xếp mới.
- Sheet làm trên **bản nháp**: đổi control trong sheet không gọi `list`, không đổi badge. **"Áp dụng"** = một lần commit
  (về trang 1, đúng **một** request `list`; nháp trùng bộ lọc đang áp → không request) rồi đóng, focus về nút. **"Xoá
  lọc"** chỉ xoá nháp (sheet vẫn mở). **× / Escape / đóng picker** = bỏ nháp, bộ lọc đang áp giữ nguyên. Descriptor facet
  tải về trong lúc sheet mở được áp **sau khi** sheet đóng.
- Quay lại ≥ 1024px: facet trong toolbar mang đúng giá trị đã áp từ sheet.

### Card

Mỗi mục là một item [`td-media-grid`](media-grid.md) (`select-mode="tick"`):

```html
<div data-td-media-item data-id="…" class="td-media-picker__card" data-kind="image" data-status="ready" [data-viewing] [data-selected]>
  <button data-td-media-open class="td-media-picker__open">
    <span class="td-media-picker__thumb"><img …></span>            <!-- 3:2, object-fit: contain, nền muted -->
    <span class="td-media-picker__info">
      <span class="td-media-picker__name" title="tên đầy đủ">…</span> <!-- 1 dòng, cắt … -->
      <span class="td-media-picker__meta">241.05 KB • 13/09/2026 15:30</span>
      [<span class="td-media-picker__badges">td-badge…</span>]
    </span>
  </button>
  <button class="td-media-grid__tick td-media-grid__tick--mark" aria-pressed="…">   <!-- góc trên-phải, chỉ ở chế độ nhiều -->
    <span class="td-check td-check--lg td-check--on-media" aria-hidden="true">✓</span>  <!-- 0.36.0: ô tick chung, 20px -->
  </button>
</div>
```

- Ngày định dạng bằng `Intl` theo `locale` (`vi` → `DD/MM/YYYY HH:mm` như dcms2).
- Video: thumb là poster + icon video ở góc. File: icon loại file cỡ lớn. `processing` / `failed`: lớp phủ trạng thái, không
  chọn được.
- Cột lưới tối thiểu 200px (220px ≥ 1280px, 170px ở 720–1023px — cột chi tiết hẹp lại `clamp(15rem, 38vw, 400px)` để lưới giữ hai cột trên iPad dọc / máy gập mở, 150px < 720px).
- Màn hình thấp (≤ 500px — điện thoại xoay ngang): toolbar / header / footer gọn hơn, vẫn thấy ít nhất một hàng card.

**Trạng thái card = màu viền 2px** (token mới, mặc định trỏ token có sẵn):

| Trạng thái | Token | Mặc định |
|---|---|---|
| Hover | `--td-media-picker-card-hover` | `var(--td-media-picker-card-viewing)` |
| Đang xem (`[data-viewing]`) | `--td-media-picker-card-viewing` | `var(--td-accent)` |
| Đã chọn (`[data-selected]`) | `--td-media-picker-card-checked` | `var(--td-color-success)` |

Đã chọn thắng đang xem. Ô tick (0.36.0) là [ô tick chung](checkbox.md#phần-hình-dùng-chung-td-check-0360) — đúng hình
`td-checkbox`, màu `--td-checkbox-color`; `--td-media-picker-card-checked` chỉ còn tô **viền card**. Ở chế độ nhiều, thumb của mục đã chọn mờ `--td-media-picker-checked-opacity` (0.7). Cả ba màu viền
được `test:contrast` kiểm ≥ 3:1 trên nền card — đổi token thì giữ ngưỡng đó. `forced-colors`: viền `Highlight` /
`CanvasText`. Token khác: `--td-media-picker-detail-w` (25rem), `--td-media-picker-col-min`, `--td-media-picker-gap`,
`--td-media-picker-list-bg`, `--td-media-picker-card-radius`, `--td-media-picker-card-shadow` — xem
[Theming](../customization/theming.md).

### Panel chi tiết (luôn mở)

Từ trên xuống: **xem trước vuông 1:1** (`contain`; video = poster, không nhúng player; file = icon + tên) → "TÊN FILE" →
**form `assetFields` luôn mở inline** (khi `editMetadata` được phép; không thì field hiện dạng chữ) → các dòng info
("Kích thước", "Độ phân giải", "Loại", "Tải lên", "Bởi") → **hàng nút căn phải**, mỗi nút chỉ hiện khi được phép:

| # | Nút | Hiện khi |
|---|---|---|
| 1 | "Tải về" (secondary sm, icon `download`) | `canDo('downloadOriginal')` + có `adapter.download` — [Tải về](#tải-về-bản-gốc) |
| 2 | "Copy link" (`<td-copy size="sm">`) | `capabilities.copyLink` — [Copy link](#copy-link) |
| 3 | "Xoá" (danger sm, icon `trash`) | `canDo('delete')` + có `adapter.delete` — [Xoá](#xoá) |
| 4 | "Lưu" (success sm, icon `check`) | Có form sửa; **chỉ bật khi form bẩn** |

- **Luôn có xem trước** (0.36.0, từ 720px; thứ tự: mục đang xem nếu còn trong kết quả → mục **đã chọn** đầu tiên có trong
  kết quả → mục đầu tiên; kết quả rỗng → panel về trạng thái trống; không bao giờ đổi lựa chọn): mở picker và sau **mỗi** lần tải danh sách (tìm, lọc, đổi trang, tải lại), nếu
  không có mục nào đang xem (hoặc mục đang xem không còn trong kết quả) thì panel **xem trước asset đầu tiên** (card có
  `data-viewing`) — **không chọn**: "Chèn" vẫn khoá tới khi người dùng chọn. Mục đang xem còn trong kết quả → giữ; form
  đang sửa dở không bị thay. Dưới 720px không tự mở (lưới hiện trước). [ADR 0013 › Bổ sung v0.36](../internal/decisions/0013-media-picker-boundary.md#bổ-sung-v036).
- Chưa xem gì (danh sách rỗng, hoặc < 720px): `td-empty-state` "Chọn một ảnh để xem chi tiết" / "Bấm vào ảnh trong danh
  sách bên trái". Đang tải bản mới (`get`): skeleton theo bố cục panel.
- **Lưu tường minh**, không bao giờ autosave: nút "Lưu", **Enter trong ô một dòng** (chỉ trong phạm vi ô), Ctrl/⌘+Enter
  trong textarea. Lưu xong → toast "Đã lưu thay đổi" + live region.
- Đổi sang mục khác khi form đang bẩn → hỏi "Bỏ thay đổi?" trước (dcms2 mất dữ liệu im lặng).

### Footer

Căn phải: "Đóng" (secondary) và "Chèn" / "Chèn ({n})" (primary, disabled khi chưa chọn gì). Bên trái, **chỉ ở chế độ
nhiều**, một **chip "{n} đã chọn ×"** (0.36.0; "{n}/{max} đã chọn" khi có `maxItems`): vừa là số đếm (cho thấy lựa chọn trải
qua nhiều trang — dcms2 không có), vừa là nút "Bỏ chọn tất cả" (tên đọc "Bỏ chọn tất cả ({n} đã chọn)", cập nhật mỗi lần
chọn / bỏ). Không chọn gì → không có chip. Footer luôn **một hàng**. Nhãn: `selectedChip`, `selectedChipMax`,
`clearSelectionChip` (`selected` / `selectedMax` cũ không còn dùng).

### Chuyển động mở / đóng (0.62.0)

Picker dùng **cùng chuyển động với [modal](modal.md)**: ≥ 720px vào bằng `scale(0.95) → 1` (lò xo 300ms) + fade 200ms, ra
`scale(0.95)` 200ms + fade 150ms; < 720px (picker toàn màn hình) trượt từ dưới lên như bottom-sheet của modal (không
overshoot, tránh hở mép). Màn chắn (scrim) và `prefers-reduced-motion` (chỉ fade, không scale/trượt) lấy từ `modal.css`,
focus vào ô tìm kiếm vẫn đúng thời điểm cũ. Trước 0.62.0 picker chỉ fade. Site muốn lại kiểu chỉ fade:

```css
:root {
  --td-media-picker-enter-from: none;  /* ≥ 720px */
  --td-media-picker-sheet-from: none;  /* < 720px */
}
```

## Hợp đồng adapter

Typedef JSDoc nằm trong `src/utils/media-picker-core.js` (đúng tên / trường của hợp đồng dsuite). Interface **chốt từ
0.32.0**; 0.33.0 chỉ **thêm** phần tuỳ chọn (`uploadFromUrl`, `capabilities.uploadFromUrl` / `copyLink`,
`MediaListRequest.page`) — adapter 0.32 chạy y nguyên.

```ts
type Scalar = string | number | boolean | null;
type FilterValue = Scalar | Scalar[];

interface MediaListRequest {
  query: string;                          // đã trim
  filters: Record<string, FilterValue>;   // bản sao — adapter sửa cũng không ảnh hưởng picker
  cursor: string | null;                  // opaque với kit (null = trang đầu; luôn null ở pagination 'pages')
  page?: number;                          // 0.33: chỉ ở pagination 'pages' — số trang, bắt đầu từ 1
  limit: number;                          // = pageSize (mặc định 30)
  sort?: { key: string; direction: 'asc' | 'desc' };   // kit không đặt (muốn sắp xếp: facet key `sort`)
  context?: unknown;                      // chuyển nguyên từ options.context, kit không đọc
  kinds: ('image' | 'video' | 'file')[] | null;        // từ selection.kinds — adapter NÊN lọc
  signal: AbortSignal;
}

interface MediaAsset {
  id: string;                             // danh tính (opaque, ≤ 512 ký tự)
  version?: string | number;              // gửi lại trong update() để phát hiện xung đột
  kind: 'image' | 'video' | 'file';
  status: 'pending' | 'processing' | 'ready' | 'failed' | 'archived';  // chỉ 'ready' chọn được
  name: string;
  mimeType: string;
  byteSize: number;
  width?: number; height?: number;
  createdAt?: string;                     // ISO, hiển thị theo locale
  uploadedByLabel?: string;
  urls: { thumbnail: string; preview: string };   // CHỈ để hiển thị (và copy link); video: poster
                                                  // 0.35: bật crop ⇒ preview PHẢI là ảnh nguyên, không cắt sẵn (bất kỳ cỡ)
  defaultAltText?: string;
  metadata: Record<string, unknown>;      // giá trị đầu của form assetFields (theo key)
  badges?: { key: string; label: string; tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }[];
  capabilities?: Partial<MediaCapabilities>;      // chỉ được THU HẸP cờ top-level
}

interface MediaPage {
  items: MediaAsset[];
  nextCursor: string | null;              // null = hết (pagination 'pages': bỏ qua)
  previousCursor?: string | null;         // kit không dùng — tự giữ chồng cursor
  total?: number;                         // số nguyên ≥ 0; BẮT BUỘC ở pagination 'pages'
}

interface FacetOption { value: Scalar; label: string; count?: number; disabled?: boolean }
interface FacetDescriptor { key: string; label: string; type: 'single' | 'multiple' | 'toggle'; options: FacetOption[] }

interface FieldDescriptor {
  key: string;
  label: string;
  scope?: 'upload' | 'asset';
  control: 'text' | 'textarea' | 'url' | 'select' | 'multiselect' | 'date' | 'readonly';
  required?: boolean;                     // gợi ý giao diện — server quyết
  helpText?: string;
  options?: FacetOption[];
  loadOptions?(query: string, o: { signal: AbortSignal }): Promise<FacetOption[]>;
  createOption?(label: string, o: { signal: AbortSignal }): Promise<FacetOption>;
  visibleWhen?(values: Record<string, unknown>, asset?: MediaAsset): boolean;
}

interface MediaCapabilities {
  search: boolean; upload: boolean; editMetadata: boolean;
  delete: boolean; downloadOriginal: boolean;    // mặc định false — site bật tường minh
  uploadFromUrl: boolean;                        // 0.33: suy ra !!adapter.uploadFromUrl
  copyLink: boolean;                             // 0.33: mặc định false
}

interface UploadProgress { loaded: number; total?: number; percent?: number }
interface UploadResult {
  asset: MediaAsset;
  deduplication: { outcome: 'created' } | { outcome: 'exact-reused'; matchedAssetId: string };  // matchedAssetId === asset.id
}

interface UsageSummary { id: string; label: string; kind?: string; href?: string }
type DeleteResult =
  | { status: 'deleted'; id: string }
  | { status: 'blocked'; reason: 'in-use'; usageCount: number; usages: UsageSummary[]; truncated?: boolean };
type DownloadResult = { url: string; filename: string; expiresAt?: string } | { blob: Blob; filename: string };

interface MediaAdapterError extends Error {
  code: 'validation' | 'unauthorized' | 'forbidden' | 'conflict' | 'not-found' | 'rate-limited' | 'network' | 'server';
  userMessage?: string;                   // chữ DUY NHẤT người dùng thấy
  fieldErrors?: Record<string, string[]>; // key = FieldDescriptor.key (tải từ URL: thêm key `url`)
  retryable?: boolean;
}

interface MediaPickerAdapter {
  list(request: MediaListRequest): Promise<MediaPage>;                          // bắt buộc
  get(id: string, o: { context?: unknown; signal: AbortSignal }): Promise<MediaAsset>;   // bắt buộc
  facets?(request: { query: string; filters: Record<string, FilterValue>; context?: unknown; signal: AbortSignal })
    : Promise<FacetDescriptor[]>;
  upload?(file: File, o: { fields: Record<string, unknown>; context?: unknown; signal: AbortSignal;
    onProgress(p: UploadProgress): void }): Promise<UploadResult>;
  uploadFromUrl?(url: string, o: { fields: Record<string, unknown>; context?: unknown; signal: AbortSignal;
    onProgress?(p: UploadProgress): void }): Promise<UploadResult>;             // 0.33
  update?(id: string, patch: { fields: Record<string, unknown>; version?: string | number },
    o: { context?: unknown; signal: AbortSignal }): Promise<MediaAsset>;
  delete?(id: string, o: { context?: unknown; signal: AbortSignal }): Promise<DeleteResult>;
  download?(id: string, o: { rendition: 'original'; context?: unknown; signal: AbortSignal }): Promise<DownloadResult>;
}
```

**`urls.preview` khi bật crop (0.35.0).** Bước cắt hiển thị `urls.preview` và tính toạ độ trên chính ảnh đó, nên khi
picker mở với `crop.enabled` ảnh preview **phải là toàn bộ ảnh gốc, không cắt sẵn** (bất kỳ cỡ — bản 1600px là đủ;
thumbnail vuông thì không). `width` / `height` (kích thước gốc **sau** khi server chuẩn hoá EXIF) nên có: có thì kết quả
có `pixels` và kit kiểm được tỉ lệ — preview lệch tỉ lệ > 1 % so với `width/height` ⇒ bước cắt báo lỗi, nút "Chèn" khoá
(fail closed, không bao giờ ra toạ độ từ ảnh đã cắt). Không có `width/height` ⇒ kết quả chỉ có `normalized`.

**Kit làm gì với dữ liệu adapter trả về** (an toàn khi adapter sai, không vỡ trang):

- Asset thiếu `id` chuỗi, `kind` / `status` ngoài danh sách, không phải object → bị bỏ (một cảnh báo console). Id trùng
  trong một trang → giữ cái đầu. `list()` trả thứ không phải `{ items: [] }` → coi như lỗi `server`.
- `urls.*` qua cổng URL (`https:`; `http:` chỉ khi trang là `http:`; tương đối) — sai → coi như không có ảnh.
- Mục sai `kinds` (khi có `selection.kinds`) bị **ẩn** dù adapter không lọc; mục `status ≠ 'ready'` hiện nhưng **không
  chọn được** (thông báo `labels.notReady`).
- Facet / descriptor sai kiểu hoặc trùng `key` → bỏ (cái đầu thắng) + cảnh báo.
- Giá trị option là `Scalar` và **giữ đúng kiểu**: `1` khác `"1"`, `null`, `false` đều đến adapter nguyên kiểu (trong
  `filters` và trong `update().fields`).
- `UploadResult` sai hợp đồng (không phải `created`, hoặc `exact-reused` mà `matchedAssetId !== asset.id`), `DeleteResult` /
  `DownloadResult` sai hình dạng → coi như lỗi `server`.

### Kit gọi adapter khi nào, với signal nào

Mỗi "khe" (`list`, `facets`, `get` chi tiết, `update`, trang, `delete` theo asset, `download`, `uploadFromUrl`) chỉ có
**một** request còn hiệu lực: gọi mới → abort `signal` cũ; kết quả về muộn bị **bỏ** kể cả khi adapter phớt lờ `signal`
(latest-wins). Đóng picker → abort **mọi** request đang chạy, kể cả upload. Đóng dialog tải lên → abort các tác vụ của nó.

**Không cache trang list**: mỗi lần đổi query / filter / trang, quay lại query cũ hay "Thử lại" đều là một lời gọi `list`
mới. Chỉ **facet** (theo query + filter) và **asset theo id** được giữ trong một lần mở; upload / update / xoá thành công
xoá cache facet; đóng picker xoá hết. Không localStorage, không cache liên phiên.

| Hàm | Kit gọi khi | Signal bị abort khi |
|---|---|---|
| `list` | Mở picker; gõ ô tìm (**debounce 250ms**; Enter = gọi ngay); đổi facet (về trang 1); đổi trang; "Thử lại"; sau upload (trang 1) / update / xoá (trang hiện tại) | Có `list` mới (đổi query / filter; `pages`: bấm trang khác); đóng picker |
| `facets` | Mở picker; cùng nhịp với `list` do đổi query / filter (cùng query + filter đã tải → dùng lại); sau upload / update / xoá | Như `list` |
| `get` (initial) | Mở picker có `selection.initialIds`: song song từng id, chung một signal, tối đa `maxItems`, bỏ id trùng | Người dùng đổi lựa chọn trước khi xong; đóng picker |
| `get` (chi tiết) | Mở chi tiết một mục (trong lúc chờ hiện bản từ lưới); "Tải lại" sau lỗi `conflict` | Mở chi tiết mục khác; đóng picker |
| `upload` | Mỗi file thả / chọn trong dialog tải lên (sau lọc `accept` / `maxSize`) | Bấm xoá dòng file; đóng dialog (sau khi đồng ý huỷ); đóng picker |
| `uploadFromUrl` | Bấm "Tải lên" hoặc Enter trong ô URL (URL qua `validateRemoteUrl`); một tác vụ một lúc | Bấm "Huỷ"; đóng dialog / picker |
| `update` | Bấm "Lưu" / Enter trong ô một dòng / Ctrl/⌘+Enter — không bao giờ tự lưu | Đóng picker (sau khi đồng ý bỏ thay đổi) |
| `delete` | Bấm "Xoá" trong hộp xác nhận (chạy trong lúc hộp còn mở, nút busy) | Đóng picker |
| `download` | Bấm "Tải về" | Bấm lại / mục khác; đóng picker |

`initialIds` áp **một lần**, theo thứ tự gốc, khi lời gọi cuối cùng xong; id nào lỗi bị bỏ (cảnh báo). Trong lúc chờ,
footer hiện "Đang tải lựa chọn…" nhưng vẫn chọn / xác nhận được; xác nhận trước khi xong → kết quả theo lựa chọn hiện tại.

## Cấu hình mặc định — `configureDefaults`

```js
TdMediaPicker.configureDefaults({
  adapter,                        // bắt buộc phải có list() + get(), không thì TypeError (giữ mặc định cũ)
  capabilities: { delete: true, downloadOriginal: true, copyLink: true }, // thiếu → suy từ method (xem "Capability ≠ quyền")
  assetFields: [/* FieldDescriptor — form trong panel chi tiết */],
  uploadFields: [/* FieldDescriptor — các ô trên đầu dialog tải lên */],
  messages: { title: 'Kho ảnh' }, // ghi đè nhãn cho mọi lần mở
  context: { siteId: 3 },         // chuyển nguyên vào mọi lời gọi adapter
  upload: { accept: 'image/*', maxSize: '10MB', acceptLabel: 'JPG, PNG, WEBP' },
  pageSize: 30,
  pagination: 'cursor',           // hoặc 'pages'
});
TdMediaPicker.defaults;           // bản sao nông của object đã cấu hình
```

- Registry cấp **module** (không biến `window`). Mỗi lần gọi **thay thế toàn bộ** object (không merge) — gọi một lần
  trong bootstrap. Không có nhiều backend trên một trang.
- Thứ tự resolve **mỗi lần mở** (merge nông theo key, giá trị `undefined` không ghi đè):
  **tham số `open()`** > **`field.pickerOptions`** > **`field.adapter`** > **defaults**.
- `selection` **không bao giờ** lấy từ defaults: luôn do người gọi `open()` hoặc [media field](media-field.md) quyết.
- Không resolve được adapter hợp lệ → `open()` ném `TypeError` đồng bộ (lỗi lập trình).

## Mở picker — `TdMediaPicker.open(options)`

```js
const outcome = await TdMediaPicker.open({
  selection: { mode: 'single', initialIds: ['a_9f2c'], kinds: ['image'] },
  initialQuery: '', initialFilters: { album: 2 },
  title: 'Chọn ảnh đại diện',
});
```

`OpenMediaPickerOptions` (mọi key ngoài `selection` đều có thể đến từ defaults):

| Key | Kiểu | Mặc định | Ghi chú |
|---|---|---|---|
| `adapter` | `MediaPickerAdapter` | defaults | Bắt buộc có `list` + `get` |
| `capabilities` | `Partial<MediaCapabilities>` | suy từ adapter | Xem dưới |
| `assetFields` / `uploadFields` | `FieldDescriptor[]` | `[]` | Form trong chi tiết / ô trên đầu dialog tải lên |
| `selection.mode` | `'single'` \| `'multiple'` | `'single'` | |
| `selection.maxItems` | số ≥ 1 | không giới hạn (đơn = 1) | Đếm **toàn cục**, kể cả mục đã chọn ở trang / lần tìm khác |
| `selection.initialIds` | `string[]` | `[]` | Đã chọn sẵn khi mở (gọi `get`) |
| `selection.kinds` | `('image'\|'video'\|'file')[]` | mọi loại | Chuyển vào `MediaListRequest.kinds`; kit ẩn mục sai loại; quyết định tiêu đề mặc định |
| `initialQuery` / `initialFilters` | `string` / `Record<string, FilterValue>` | `''` / `{}` | |
| `context` | `unknown` | — | Chuyển nguyên vào mọi lời gọi adapter |
| `locale` | `string` | `vi-VN` | Định dạng ngày (`Intl`) |
| `messages` | `Record<string, string \| (params) => string>` | `{}` | Ghi đè nhãn **cho lần mở này** |
| `themeRoot` | `Element` | — | 0.42.0: hiển thị theo theme của vùng `[data-td-theme]` chứa phần tử này ([theming › Theme theo vùng](../customization/theming.md#popup-mở-từ-trong-vùng), ADR 0020). Không truyền → theme của trang. |
| `title` | `string` | theo `selection.kinds` | "Chọn ảnh" / "Chọn video" / "Chọn tài liệu" / "Chọn media" |
| `pageSize` | số 1–100 | `30` | → `limit` (0.32: 40) |
| `pagination` | `'cursor'` \| `'pages'` | `'cursor'` | 0.33 — [Phân trang](#phân-trang--hai-chế-độ) |
| `upload` | `{ accept?, maxSize?, multiple? = true, acceptLabel? }` | — | Chuyển cho `td-dropzone` ([dropzone](dropzone.md)). `acceptLabel` (0.33) chỉ là **chữ** trên badge / mô tả tab URL, không phải bộ lọc; thiếu thì suy từ `accept` |
| `crop` | `{ enabled, aspectRatio?, allowFocalPoint? }` | — | 0.35.0: `enabled: true` + chọn **một** ảnh ⇒ bước cắt sau "Chèn". `aspectRatio` = số `w / h` trong `[0.01, 100]` (khoá tỉ lệ; thiếu ⇒ tự do có preset). Xem [Cắt ảnh](#cắt-ảnh--option-crop-0350) |

- **Một picker một lúc**: gọi `open()` khi đã có picker mở → resolve ngay `{ status: 'cancelled', reason:
  'programmatic' }` + cảnh báo một lần (không chồng picker).
- `TdMediaPicker.open()` tạo host tạm trên `<body>` và gỡ sau khi đóng.
- Mở picker **không** tự chọn mục nào (trừ `initialIds`); panel chi tiết ở trạng thái rỗng, "Chèn" disabled.

### Kết quả — `PickerOutcome`

```ts
type PickerOutcome =
  | { status: 'selected'; selection: SelectedMedia[] }
  | { status: 'cancelled'; reason: 'close' | 'escape' | 'programmatic'; selection: [] };

interface SelectedMedia {
  assetId: string;
  asset: MediaAsset;            // ảnh chụp nhanh để render ngay — không phải nguồn sự thật
  usage: {
    altText: string;              // = asset.defaultAltText ?? ''
    crop: CropValue | null;       // 0.35: chỉ từ bước cắt; null = không cắt / toàn ảnh / không bật crop
    focalPoint: { x: number; y: number } | null;   // 0.35: chỉ khi crop.allowFocalPoint
  };
}

interface CropValue {             // xem Cropper
  normalized: { x: number; y: number; width: number; height: number };   // 0..1 theo ảnh gốc
  pixels?: { x: number; y: number; width: number; height: number };      // chỉ khi asset có width/height
  aspectRatio: number;
}
```

- Huỷ **resolve**, không bao giờ reject: `close` = nút × hoặc "Đóng", `escape` = phím Escape, `programmatic` =
  `close()` bằng code / host bị gỡ khỏi DOM / mở chồng.
- `selection` theo **thứ tự người dùng chọn** (mục `initialIds` trước).
- App lưu `assetId`; `asset` chỉ để hiện ngay. Server kiểm lại `assetId` (tồn tại, được phép dùng) khi nhận form.

## Cắt ảnh — option `crop` (0.35.0)

> **⚠ Site phải tự xử lý**: picker chỉ trả toạ độ (`usage.crop`, `usage.focalPoint`); cắt / đổi cỡ ảnh khi render là việc
> của endpoint / CDN của site — checklist **bắt buộc** (URL ký HMAC, giới hạn biến thể, rate limit, ảnh riêng tư):
> [Biến thể ảnh đã cắt](../guides/media-renditions.md).

```js
const outcome = await TdMediaPicker.open({
  selection: { mode: 'single', kinds: ['image'] },
  crop: { enabled: true, aspectRatio: 3 / 2, allowFocalPoint: true },   // kiểu dcms2 post-avatar-thumb
});
if (outcome.status === 'selected') {
  const { assetId, usage } = outcome.selection[0];
  save({ assetId, alt: usage.altText, crop: usage.crop?.normalized ?? null, focal: usage.focalPoint });
}
```

Luồng (giống dcms2: cắt **sau khi chọn**):

1. Người dùng chọn một ảnh, bấm **"Chèn"**. Cổng kết thúc vẫn chạy trước (form chi tiết bẩn → hỏi "Bỏ thay đổi?").
2. `crop.enabled` + chế độ **đơn** + asset `kind === 'image'` ⇒ mở **bước cắt** (hộp thoại lồng trên picker, dùng
   [`<td-cropper>`](cropper.md)): tiêu đề "Cắt ảnh" (+ " · 3:2" khi khoá tỉ lệ), ảnh = `urls.preview`, kích thước gốc = `width/height`, khung ban đầu =
   hình lớn nhất đúng tỉ lệ (căn giữa) hoặc toàn ảnh khi tự do.
3. **"Quay lại"** (hoặc Escape / ×) → về picker, lựa chọn còn nguyên, focus về "Chèn". **"Chèn"** (của bước cắt) →
   picker kết thúc `selected` với `usage.crop` + `usage.focalPoint`. Nút "Chèn" khoá khi ảnh đang tải hoặc lỗi (preview
   lệch tỉ lệ, không tải được).
4. Video / file → không có bước cắt, kết thúc ngay với `crop: null`. Không có URL preview an toàn → bước cắt không mở,
   picker giữ nguyên + thông báo `cropUnavailable` (không bao giờ kết thúc thiếu crop app đã yêu cầu).

- **Toàn ảnh = `null`**: khung phủ toàn ảnh ⇒ `usage.crop = null` ("dùng nguyên ảnh", như dcms2 dùng ảnh gốc khi không
  cắt).
- `usage.focalPoint` chỉ có khi `allowFocalPoint: true` và người dùng bật điểm trọng tâm.
- `selection.mode = 'multiple'` + `crop` → cảnh báo console **một lần**, bỏ crop (như dcms2: chọn nhiều không crop).
- `aspectRatio` không phải số hữu hạn trong `[0.01, 100]` (gồm hai đầu) → bị từ chối + cảnh báo một lần, cắt **tự do**. Muốn nhập `"16:9"` thì tự đổi
  sang `16 / 9` (field làm việc này từ thuộc tính `crop-ratio`).
- `close()` bằng code hoặc host bị gỡ khi bước cắt đang mở → cả bước cắt lẫn picker đóng, `cancelled / programmatic`.
- **Không có nút "Cắt" trong panel chi tiết**: panel là metadata **của asset**; crop là dữ liệu **của chỗ dùng** (một ảnh
  có crop khác nhau ở OG, thẻ, bìa) — một lối vào duy nhất.
- `crop` đặt được qua `configureDefaults` như mọi key khác, nhưng [media field](media-field.md) **luôn** tự đặt `crop`
  ở tham số `open()` (ưu tiên cao nhất): field không `croppable` mở picker với `crop: { enabled: false }`.
- Picker **không** cắt ảnh, không tạo file mới, không sửa host (ADR 0013 QĐ 3). App lưu toạ độ theo chỗ dùng; server cắt
  thật bằng tham số đã ký — xem [Cropper › Dùng toạ độ ở server](cropper.md#8-dùng-toạ-độ-ở-server-cắt-thật-bằng-tham-số-đã-ký).

### Thẻ khai báo `<td-media-picker>`

Khi muốn nghe event trên một element cố định (thay vì `await`):

```html
<td-media-picker id="lib"></td-media-picker>
<script type="module">
  import '@dazzxq/td-components/media-picker';
  const lib = document.getElementById('lib');
  lib.options = { selection: { mode: 'multiple', maxItems: 10 } };   // adapter lấy từ defaults
  lib.addEventListener('asset-change', (e) => console.log(e.detail.operation, e.detail.asset?.id ?? e.detail.id));
  document.querySelector('#open-lib').addEventListener('click', async () => {
    const outcome = await lib.open();
  });
</script>
```

| Thành viên | Kiểu / chữ ký | Mô tả |
|---|---|---|
| `options` | `OpenMediaPickerOptions` (property) | Option cho lần `open()` kế tiếp (resolve với defaults như trên) |
| `open()` | `() => Promise<PickerOutcome>` | Mở; `TypeError` đồng bộ khi không có adapter hợp lệ; thẻ chưa gắn vào trang → resolve ngay `cancelled / programmatic` |
| `close(reason = 'programmatic')` | `('close' \| 'escape' \| 'programmatic') => void` | Đóng **ngay** bằng code, **không** hỏi "bỏ thay đổi" (app đã quyết): abort mọi việc đang chạy, resolve `cancelled` với `reason` |
| `isOpen` | `boolean` (chỉ đọc) | |
| `TdMediaPicker.labels` | static | Nhãn (bảng dưới) |
| `TdMediaPicker.fieldLabels` | static | Chữ của control facet / descriptor |
| `TdMediaPicker.configureDefaults()` / `.defaults` | static | Xem trên |

Bản thân thẻ không hiển thị gì (`display: none`); dialog được dựng trên `<body>` khi mở. Gỡ thẻ khỏi DOM trong lúc
đang mở → mọi request bị abort, dialog gỡ ngay (không chờ hiệu ứng), Promise resolve **đúng một lần**
`cancelled / programmatic` + event `cancel`.

## Event

Phát trên host (`<td-media-picker>`, hoặc host tạm của `open()`), `bubbles` + `composed`.

| Event | detail | Khi nào |
|---|---|---|
| `selection-change` | `{ selection: SelectedMedia[], addedIds: string[], removedIds: string[] }` | Người dùng đổi lựa chọn (không phát khi áp `initialIds`) |
| `asset-change` | `{ operation: 'upload' \| 'upload-url' \| 'update' \| 'delete', asset?, id?, deduplication? }` | Tải lên xong (file / URL; `deduplication` của `UploadResult`), lưu thông tin thành công, xoá thành công (`id`) |
| `confirm` | `{ selection }` | Bấm "Chèn" và picker kết thúc với `selected` |
| `cancel` | `{ reason }` | Picker kết thúc với `cancelled` |
| `operation-error` | `{ operation: 'list' \| 'facets' \| 'get' \| 'upload' \| 'upload-url' \| 'update' \| 'delete' \| 'download', code, retryable }` | Lời gọi adapter lỗi (không phát khi abort). **Không** có chữ lỗi — dùng để log / đo |

## Capability ≠ quyền

Capability chỉ quyết định nút nào **hiện ra**. Một action hiện khi **có method trong adapter + cờ top-level bật + cờ
per-asset không tắt**:

| Cờ | Thiếu thì suy ra | Cần method | Điều khiển |
|---|---|---|---|
| `search` | `true` | — | Ô tìm |
| `upload` | `!!adapter.upload` | `upload` | Nút "Tải lên" + tab "Tải file" |
| `uploadFromUrl` | `!!adapter.uploadFromUrl` | `uploadFromUrl` | Tab "Tải từ URL" (đặt `false` để ẩn dù có method) |
| `editMetadata` | `!!adapter.update` | `update` | Form trong chi tiết (per-asset `false` → field chỉ đọc) |
| `delete` | **`false`** | `delete` | Nút "Xoá" |
| `downloadOriginal` | **`false`** | `download` | Nút "Tải về" |
| `copyLink` | **`false`** | — | Nút "Copy link" |

`asset.capabilities` chỉ **thu hẹp** (đặt `true` không mở được thứ top-level đã tắt). Ẩn nút **không phải** phân quyền:
mọi endpoint mà adapter gọi phải tự kiểm quyền ở server. Lọc file phía trình duyệt (`accept`, `maxSize`) và kiểm URL phía
trình duyệt chỉ là UX.

## Phân trang — hai chế độ

Mỗi trang **thay** nội dung lưới (không còn "Tải thêm"); lựa chọn giữ qua các trang (theo id). Có trang mới → danh sách
cuộn lên đầu, focus về tiêu đề vùng kết quả, live region đọc "Trang {n}". Ẩn phân trang khi chỉ có một trang. Đổi query /
filter → về trang 1.

### `'cursor'` (mặc định — hợp đồng dsuite)

- `‹` / `›` (`<td-button size="sm" variant="secondary">`), chữ "Hiển thị {from}-{to} / {total} media" khi adapter trả
  `total`, không có thì "Trang {n}".
- Kit gửi `cursor = nextCursor` của trang trước và **tự giữ chồng cursor** các trang đã qua để lùi — adapter không cần
  `previousCursor`. Không nhảy trang được (cursor không cho phép).
- **Single-flight**: trong lúc trang đang tải, `‹` / `›` disabled (nút vừa bấm `loading`), bấm thêm bị bỏ qua. Trang chỉ
  tiến / lùi khi request **thành công**; lỗi hoặc abort giữ nguyên trang và chồng cursor.

### `'pages'` (tuỳ chọn — số trang như dcms2)

- Kit gửi `MediaListRequest.page` (bắt đầu từ 1) và `cursor: null`. Adapter **phải** trả `total` (số nguyên ≥ 0). Thiếu
  hoặc sai → cảnh báo console một lần và quay về giao diện cursor (`nextCursor`).
- Dùng [`<td-pagination>`](pagination.md) thật (`total-items`, `items-per-page`, `current-page`, `item-label="media"`):
  "Hiển thị 1-30 / 60 media" + các nút số trang.
- **Latest-wins**: mỗi số trang là một request độc lập; bấm trang khác thì abort request cũ.

Adapter cho chế độ `pages` (backend phân trang theo offset / số trang):

```js
// CODE CỦA SITE — backend trả { data: [...], meta: { total, current_page } }
export const mediaAdapter = {
  async list({ query, filters, page, limit, kinds, signal }) {
    const qs = new URLSearchParams({ q: query, page: String(page ?? 1), per_page: String(limit) });
    for (const k of kinds ?? []) qs.append('kind[]', k);
    for (const [key, v] of Object.entries(filters)) for (const x of [].concat(v)) qs.append(`f[${key}][]`, String(x));
    const { data, meta } = await call(`/admin/api/media?${qs}`, { signal });
    return { items: data.map(toAsset), nextCursor: null, total: meta.total };   // total BẮT BUỘC
  },
  // get, facets, upload, … như "Ví dụ adapter fetch"
};

TdMediaPicker.configureDefaults({ adapter: mediaAdapter, pagination: 'pages' });
```

## Chọn: đơn / nhiều

- **Chế độ đơn**: click / Enter / Space trên card = **chọn + xem** chi tiết. Không có tick. Chọn mục khác thay mục đang
  chọn; nếu form chi tiết đang bẩn thì hỏi trước, "Không" → lựa chọn và chi tiết giữ nguyên.
- **Chế độ nhiều** (giống dcms2): click card hoặc Enter = **chỉ xem** chi tiết, không đổi lựa chọn. Tick (góc trên-phải,
  luôn hiện) và phím tắt bên dưới đổi lựa chọn. Vượt `maxItems` → bị chặn + thông báo "Tối đa {max} mục".
- **Không bao giờ tự chọn** (khác dcms2). Từ 720px picker tự **xem trước** asset đầu ([Panel chi tiết](#panel-chi-tiết-luôn-mở)) — xem, không chọn.

**Phím tắt chọn** (thật bằng chuột + bàn phím, test 3 engine). "Cmd" trên macOS, "Ctrl" trên Windows / Linux — trên macOS
Ctrl+click là menu chuột phải, nên chỉ Cmd dùng được:

| Thao tác | Chế độ nhiều | Chế độ đơn |
|---|---|---|
| Click / Enter trên card | Xem chi tiết (không đổi lựa chọn) | Chọn đúng mục này + xem |
| Cmd / Ctrl + click | Bật / tắt mục, đặt mốc (anchor) | Như click thường |
| Shift + click | **Thêm** cả dải từ mốc tới mục (không bỏ chọn ngoài dải; dừng ở `maxItems`). Mốc không còn trên trang (đã đổi trang / lọc) → bật / tắt một mục | Như click thường |
| Space / Shift + Space | Bật / tắt / thêm dải | Chọn + xem |
| Tick | Bật / tắt | (không có tick) |

Lựa chọn tích luỹ qua nhiều trang. Shift+click không bôi đen chữ trên lưới. Không có Ctrl/Cmd+A (picker phân trang —
"tất cả" mơ hồ) và Ctrl/Cmd+Space (đụng phím đổi bộ gõ / Spotlight).

## Dialog tải lên

Nút "Tải lên" mở một dialog **lồng trên picker** (cùng tầng modal, band promotion đặt nó trên picker; cỡ md): header
"Tải lên media" + ×, footer "Đóng". Dưới 720px (0.36.0) là **bottom sheet cao theo nội dung** của [modal](modal.md) (trước:
full viewport với ≈ 110px trống) và **không có footer** — × ở header đủ để đóng.

- **`uploadFields`** nằm trên cùng, dùng chung cho cả hai nguồn. Giá trị được **chụp lúc mỗi tác vụ bắt đầu** (sửa ô sau đó
  không ảnh hưởng file đang tải). Field `required` chưa điền → **khoá cả hai nguồn** kèm gợi ý "Điền các trường bắt buộc
  trước khi tải lên." — muốn dialog dùng được ngay thì đừng đánh dấu `required`, hoặc cho field một option mặc định.
- **Tab** ([`td-tabs`](tabs.md) `size="sm"`): "Tải file" (khi có `upload`) và "Tải từ URL" (khi có `uploadFromUrl` và
  `capabilities.uploadFromUrl !== false`). Chỉ có một nguồn → không hiện tab.
- **Đóng dialog khi còn tác vụ chạy** → hỏi "Huỷ các tệp đang tải?"; "Huỷ tải lên" thì abort toàn bộ. Đóng hẳn picker
  cũng abort.

### Tab file

[`<td-dropzone multiple>`](dropzone.md) dạng xếp chồng (`prompt-title` / `prompt-text` / `hint-style="badges"`): icon
lớn, "Kéo thả file vào đây", "hoặc bấm để chọn file", badge định dạng (`upload.acceptLabel` hoặc suy từ `accept`) và
"Tối đa {maxSize}". Cả zone là vùng bấm; nút "Chọn file" vẫn tới được bằng bàn phím.

- Kit gọi `adapter.upload(file, { fields, context, signal, onProgress })`. Gọi `onProgress({ percent })` hoặc
  `onProgress({ loaded, total })` → thanh tiến độ của dòng file. Chưa gọi lần nào → dòng "Đang chờ…".
- **Huỷ** = nút xoá của dòng file → `signal` bị abort (không báo lỗi). Kit **không** giới hạn số file tải song song —
  muốn xếp hàng thì adapter tự làm.
- **Mỗi file xong**: kiểm hợp đồng (`created`, hoặc `exact-reused` với `matchedAssetId === asset.id`) → nạp lại **trang 1**
  → chọn theo chế độ (đơn: file xong sau cùng thắng; nhiều: thêm nếu còn chỗ) → mở chi tiết. `exact-reused` → không thêm
  mục trùng + chú thích "{name} đã có trong thư viện — dùng lại ảnh cũ". Mục chưa `ready` chỉ hiện, không chọn.
- **Tất cả xong**: toast "Đã tải lên {ok}/{total} tệp"; **không có lỗi thì dialog tự đóng**, có lỗi thì giữ mở để thấy dòng
  đỏ (`userMessage` / `labels.error.{code}`; `fieldErrors` → lỗi trên ô `uploadFields`).
- Phát `asset-change { operation: 'upload', asset, deduplication }`.

### Tải từ URL

```ts
adapter.uploadFromUrl?(url: string, o: { fields: Record<string, unknown>, context?: unknown, signal: AbortSignal,
  onProgress?(p: UploadProgress): void }) => Promise<UploadResult>
```

Giao diện: mô tả "Nhập URL ảnh để tải trực tiếp. Hỗ trợ: {acceptLabel}", ô `<td-input-field type="url">` (placeholder
`https://example.com/image.jpg`), nút "Tải lên" (disabled tới khi URL hợp lệ; **Enter trong ô** cũng gửi). Trong lúc chạy:
nút loading + "Huỷ" (abort) + `td-progress` (indeterminate; có `onProgress` thì hiện số). Mỗi lần **một** tác vụ.

**Kiểm URL ở client chỉ để tiện cho người dùng, không phải bảo mật.** `validateRemoteUrl()` (thuần, trong
`media-picker-core.js`), theo thứ tự: trim → rỗng thì chỉ disabled → dài hơn 2048 "URL quá dài" → `new URL()` hỏng "URL
không hợp lệ" → scheme khác `http:` / `https:` "Chỉ nhận http hoặc https" → có user / password "URL không được chứa
thông tin đăng nhập" → hostname rỗng "URL không hợp lệ". Lỗi hiện khi blur hoặc khi gửi, không hiện lúc đang gõ. Adapter
nhận chuỗi `url.href` **đã chuẩn hoá**.

- Kit **không** chặn host nội bộ / IP riêng ở client: DNS rebinding và redirect vượt qua được, nên chặn ở client chỉ tạo
  cảm giác an toàn giả. Việc chặn thuộc về **server** (checklist dưới).
- Kit **không** xem trước URL ở client (trình duyệt người dùng sẽ phải tải một host tuỳ ý — lộ IP — và `img-src` của site
  cũng chặn). "Xem trước" là asset do server trả về, hiện trong lưới và chi tiết như mọi asset.
- Kết quả đi qua **cùng** bộ kiểm + hậu xử lý như upload file: toast "Đã tải lên từ URL", dialog đóng, nạp trang 1, chọn +
  mở chi tiết, `asset-change { operation: 'upload-url', asset, deduplication }`.
- Lỗi: chỉ `userMessage` hoặc `labels.error.{code}` dưới ô — **không bao giờ** chuỗi thô của host từ xa;
  `fieldErrors.url` hiện ở ô URL, key khác hiện ở `uploadFields`; abort thì im lặng.
- Kit không có logic theo loại media: server muốn từ chối video / file thì trả lỗi `validation`.

#### Trách nhiệm của server khi tải từ URL (SSRF)

Endpoint đứng sau `uploadFromUrl` là một **máy tải URL tuỳ ý theo lệnh người dùng** — kit không bảo đảm điều nào dưới
đây. Server **phải**:

- [ ] **Chặn SSRF**: resolve DNS **một lần** rồi kết nối tới **đúng IP đã kiểm** (không resolve lại);
- [ ] chặn loopback (`127.0.0.0/8`, `::1`), mạng riêng (`10/8`, `172.16/12`, `192.168/16`), link-local (`169.254/16`,
      `fe80::/10`), metadata cloud (`169.254.169.254`, `fd00:ec2::254`), IPv6 ULA (`fc00::/7`), IPv4-mapped IPv6, `0.0.0.0`;
- [ ] kiểm lại **ở mỗi redirect** và giới hạn số redirect (≤ 3);
- [ ] chỉ nhận `http` / `https`, cổng 80 / 443 (trừ khi site cho phép rõ ràng);
- [ ] timeout kết nối + timeout đọc; đọc theo luồng với **trần kích thước** (dừng khi vượt, không tin `Content-Length`);
- [ ] kiểm magic byte, re-encode, áp **cùng** giới hạn loại / kích thước như upload file;
- [ ] kiểm quyền, CSRF, rate limit, ghi audit;
- [ ] không dội lại cho người dùng body / chuỗi lỗi của host từ xa (chỉ `userMessage` đã soạn);
- [ ] dedup SHA-256 như upload (`exact-reused` + `matchedAssetId`).

Site không làm được các điều trên → **đừng** cài `uploadFromUrl` (tab URL sẽ không hiện), hoặc đặt
`capabilities.uploadFromUrl: false`.

## Xoá

Nút "Xoá" hiện khi `canDo('delete')`: có `adapter.delete`, `capabilities.delete: true` (mặc định **false**), per-asset
không thu hẹp.

1. Hộp xác nhận `TdModal.confirm`: "Xác nhận xoá" / `Bạn có chắc muốn xoá "{tên}"? Hành động này không thể hoàn tác.`
   (chữ thuần, không HTML) / "Xoá" (danger) · "Huỷ".
2. `adapter.delete(id, { context, signal })` chạy **trong** hộp xác nhận (hộp giữ mở, nút busy). Mỗi asset một slot
   latest-wins; đóng picker thì abort.
3. Kết quả:
   - `{ status: 'deleted', id }` (id khớp) → bỏ khỏi lựa chọn, nạp lại **trang hiện tại** (trang rỗng và không phải trang 1
     → lùi một trang), panel chi tiết về trạng thái rỗng (không tự chọn mục khác), toast "Đã xoá {tên}",
     `asset-change { operation: 'delete', id }`.
   - `{ status: 'blocked', reason: 'in-use', usageCount, usages, truncated? }` → ngay trong panel chi tiết một
     `<td-alert variant="warning" heading="Không xoá được">`: "Media đang được dùng ở {n} nơi." + danh sách usage (tối đa 20
     dòng hiển thị, `usages` nhận tối đa 50; nhãn cắt 200 ký tự). Usage có `href` an toàn (qua `safeLinkUrl`) là link
     `target="_blank" rel="noopener noreferrer"`; `href` không an toàn (`javascript:` …) → chỉ là chữ. Còn nữa hoặc
     `truncated` → "… và {k} nơi khác". Alert tự gỡ khi đổi asset.
   - Hình dạng khác → lỗi `server`. Lỗi (`forbidden`, `conflict`, …) → toast `userMessage`; abort im lặng.

> **Kit không bao giờ tự kiểm usage — server quyết định.** Nút Xoá chỉ hỏi lại người dùng rồi gọi adapter; việc media có
> đang được dùng (bài viết, sản phẩm, banner…) hay không, và người dùng có quyền xoá hay không, **chỉ server biết**.
> **Một `delete` không kiểm usage + quyền ở server là không an toàn** (link chết khắp site, xoá được media của người
> khác). Server trả `blocked` kèm `usages` để kit hiện; xoá mềm / xoá cứng cũng là quyết định của server.

## Tải về bản gốc

Nút "Tải về" hiện khi `canDo('downloadOriginal')` (mặc định **false**) và có `adapter.download`. Kit gọi
`adapter.download(id, { rendition: 'original', context, signal })` (nút loading trong lúc chờ), rồi:

| Kết quả | Kit làm |
|---|---|
| `{ url, filename, expiresAt? }` | `url` qua `safeMediaUrl` và phải là `http(s):` (không `blob:` / `data:` / `javascript:` → lỗi `server`). `expiresAt` đã qua → lỗi "Liên kết tải đã hết hạn". Tạo `<a href download="{filename}" rel="noopener noreferrer">` tạm, click, gỡ. URL **khác origin** → thêm `target="_blank"` (trình duyệt bỏ qua `download` khác origin và mở URL) — **không bao giờ** điều hướng trang hiện tại |
| `{ blob, filename }` | `blob instanceof Blob` bắt buộc. `URL.createObjectURL` → `<a download>` cùng origin → click → `revokeObjectURL` ở macrotask kế tiếp (đóng picker thu hồi mọi URL còn sót). **Không bao giờ mở blob trong tab** — một blob `text/html` mở ra sẽ chạy dưới origin của site |

- `filename`: cắt 200 ký tự, bỏ `/ \ :` và ký tự điều khiển; rỗng thì dùng `asset.name`.
- **CDN khác origin**: `download="{filename}"` **bị bỏ qua**, tên file do header của CDN quyết. Muốn tải về đúng tên thì
  server ký URL kèm `Content-Disposition: attachment; filename="…"` (S3 / R2: `response-content-disposition`), hoặc adapter tự
  `fetch` file (CORS + `connect-src` phải cho phép) rồi trả `{ blob, filename }`.
- Lỗi → toast. Nút "Tải về" có cho mọi loại media (dcms2 chỉ ở chế độ file), miễn capability cho phép.

## Copy link

Bật bằng `capabilities.copyLink: true` (mặc định **false**). Nút là [`<td-copy size="sm">`](copy.md) "Copy link", giá trị là
`asset.urls.preview` sau `safeMediaUrl`, ở dạng **tuyệt đối**.

- Đây là link **hiển thị**, **không phải danh tính** — form vẫn lưu `assetId`. Site muốn copy bản gốc công khai (như dcms2)
  thì map `urls.preview` sang URL đó trong adapter.
- `urls.preview` là URL ký có hạn → **đừng** bật `copyLink` (link copy ra sẽ chết).

## Lỗi: chỉ `userMessage` được hiện

Adapter reject bằng `MediaAdapterError` (hoặc bất cứ thứ gì — kit chuẩn hoá):

- Abort (`AbortError`, hoặc signal đã abort) → im lặng.
- `code` ngoài danh sách → `'server'`. `retryable` mặc định `true` cho `network`, `rate-limited`, `server`.
- Chữ hiện cho người dùng **chỉ** là `userMessage` (trim, cắt 200 ký tự) hoặc nhãn mặc định `labels.error.{code}`.
  **Không bao giờ** hiện `err.message` — đó thường là exception thô, câu SQL, đường dẫn lưu trữ, lỗi của host từ xa.
- `fieldErrors`: chỉ key là own property chuỗi (bỏ `__proto__` / `constructor` / `prototype`), giá trị phải là mảng
  chuỗi (mỗi chuỗi cắt 200, tối đa 5 / key). Key trùng `FieldDescriptor.key` → lỗi hiện **dưới đúng control**; key khác →
  danh sách lỗi chung đầu form. Control lỗi đầu tiên được focus.
- Console chỉ nhận **một chuỗi** dạng `td-media-picker: <thao tác> failed (<code>)` — **không bao giờ** đối tượng lỗi gốc,
  `message`, body response hay URL (có thể mang token / dữ liệu server). Muốn log chi tiết → app tự log trong adapter.
- Lỗi cần hành động **inline**: `list` → khối lỗi `role="alert"` + "Thử lại"; field / URL / file → tại chỗ. Lỗi của hành
  động một lần (xoá, tải về) → toast. Thành công tức thời (lưu, xoá, tải lên) → `TdToast` + live region.

## Giới hạn dữ liệu từ adapter

Trước khi vào DOM, dữ liệu adapter bị chặn trên (`LIMITS` trong `src/utils/media-picker-core.js`); phần thừa bị **bỏ**
kèm **một** `console.warn` chỉ có số lượng (không có dữ liệu thô):

| Dữ liệu | Giới hạn |
|---|---|
| Mục mỗi trang `list()` | `min(limit của request, 100)` (`pageSize` tối đa 100) |
| Chuỗi hiển thị của asset: `name`, `mimeType`, `uploadedByLabel`, `defaultAltText`, nhãn badge | 500 code point (cắt) |
| `badges` mỗi asset | 10 |
| Facet (`facets()`) | 20 |
| Option mỗi facet / mỗi field (kể cả kết quả `loadOptions`) | 200; nhãn option 500 code point |
| Field descriptor (`assetFields`, `uploadFields`) | 50; `label` / `helpText` 500 code point |
| `usages` của `DeleteResult` | 50 (hiện 20); `label` 200 code point |
| URL nhập ở tab URL | 2 048 ký tự |

Mảng lớn được **xử lý có giới hạn**: mỗi danh sách chỉ được **duyệt** tối đa 4 × giới hạn ở trên rồi dừng — mảng 1 triệu
phần tử tốn như mảng nhỏ.

`metadata`: asset chỉ giữ **các key trùng `assetFields`**. Giá trị không bao giờ bị cắt (cắt sẽ làm hỏng dữ liệu khi lưu);
giá trị vượt giới hạn theo loại control khiến **trường đó bị khoá** trong form (disabled + chữ
`TdMediaPicker.fieldLabels.tooLarge`), không gán vào control và **không bao giờ gửi** trong `update()`:

| Control | Giới hạn giá trị |
|---|---|
| `text` / `select` | 10 000 ký tự |
| `readonly` | **chỉ scalar**: chuỗi ≤ 10 000 ký tự, số hữu hạn, boolean, `null` — object / mảng → khoá, không bao giờ serialize |
| `textarea` | 100 000 ký tự |
| `url` | 2 048 ký tự |
| `date` | 64 ký tự |
| `multiselect` | mảng ≤ 200 scalar (mỗi chuỗi ≤ 10 000) |

Mọi control trừ `multiselect` chỉ nhận **scalar** (object / mảng / `NaN` → khoá). Kit không bao giờ `JSON.stringify` /
duyệt sâu giá trị metadata của adapter.

## Facet: giữ giá trị khi descriptor tải lại

`count` hiện trong nhãn option ("Album A (12)"). Giá trị đang chọn giữ **nguyên kiểu** khi descriptor tải lại — kể cả khi
danh sách mới không còn option đó (giữ nhãn cũ). Facet đổi `type` khi tải lại → control mới; filter được áp lại nếu control
mới nhận được (vd. `single` 2 → `multiple` [2]), không thì xoá khỏi filter. Facet biến mất → filter của nó bị bỏ. Mỗi khi
đối chiếu làm đổi filter, kit tải lại **cả** facet (không lấy từ cache) **và** list. Toggle đang bật giữ nguyên giá trị đã
bật qua các lần tải lại. Đổi facet → tải lại list + facet **ngay** (không debounce), về trang 1.

Chữ của control facet / descriptor nằm ở `TdMediaPicker.fieldLabels` (đọc lúc dùng): `all` "Tất cả", `create` "Thêm mới"
(`create-label` khi có `createOption`), `generalErrors` "Lỗi", `createError` "Không thêm được lựa chọn.", `tooLarge`.

```js
Object.assign(TdMediaPicker.fieldLabels, { all: 'All', create: 'Add new', generalErrors: 'Errors', createError: 'Could not add.' });
```

## Form metadata (descriptor → control)

- Form dựng từ `assetFields`, giá trị đầu từ `asset.metadata[key]`, gửi
  `update(id, { fields: <mọi field đang hiện, trừ readonly>, version: asset.version }, { context, signal })`.
  Field bị `visibleWhen` ẩn: không gửi, không validate. Field `readonly` **không bao giờ** được gửi.
- `visibleWhen(values, asset)` chạy lại sau mỗi thay đổi; `values` có **mọi** field (kể cả đang ẩn), đúng kiểu. Hàm ném
  lỗi → field hiện + một cảnh báo console.
- Thành công → asset mới thay ở lưới / chi tiết, `asset-change { operation: 'update', asset }`, toast "Đã lưu thay đổi".
- `validation` → map `fieldErrors` như trên. `conflict` (ai đó đã sửa trước) → thông báo + nút **"Tải lại"**: gọi `get` rồi
  ghi đè form **sau khi người dùng bấm** (không tự xoá chữ đang gõ).

| `control` | Control | Giá trị |
|---|---|---|
| `text` / `url` | [`td-input-field`](input-field.md) `type=text` / `url` | chuỗi |
| `textarea` | `td-input-field type=textarea autoresize` | chuỗi |
| `select` | [`td-dropdown`](dropdown.md) (`options`; `loadOptions('')` gọi một lần khi dựng form; `createOption` → dòng "Thêm mới" / "Thêm “{query}”") | `Scalar` giữ kiểu |
| `multiselect` | [`td-chip-input`](chip-input.md) (không `createOption` → `selection-only`; tìm bằng `loadOptions`; có `createOption` → `allow-create`) | `Scalar[]` |
| `date` | [`td-datetime-picker`](datetime-picker.md) `mode=date`, năm 1900–2199 | `'YYYY-MM-DD'` hoặc `null` |
| `readonly` | chữ trong `<dl>` | chỉ hiển thị — không bao giờ có trong `update().fields` |

`helpText` → `helper-text` của `td-input-field`; với control khác là một đoạn `p.td-field__note`. `label`, `helpText`, nhãn
option đều là **text** — descriptor không nhận HTML. Không control nào có `name` (form ảo, không lọt vào `<form>` của trang).
Cùng bộ control này dựng các ô `uploadFields` trong dialog tải lên.

## Đóng khi còn việc dở

Mọi đường kết thúc **của người dùng** (×, "Đóng", Escape, "Chèn") đi qua **một cổng**: nếu form chi tiết đang có thay đổi
chưa lưu hoặc còn upload / lưu đang chạy → hộp xác nhận ("Bỏ thay đổi" / "Tiếp tục sửa"). Đồng ý → abort mọi thứ rồi kết
thúc **đúng loại đã yêu cầu** (từ "Chèn" vẫn resolve `selected` với lựa chọn lúc đồng ý). Không → picker giữ nguyên. Lựa
chọn chưa xác nhận **không** tính là việc dở. `close()` bằng code và việc gỡ host khỏi DOM **không** qua cổng này.

## Bàn phím & trợ năng

| Phím | Tác dụng |
|---|---|
| Tab / Shift+Tab | Bị giữ trong dialog; mở picker → focus ô tìm (hoặc card đầu / dialog) |
| Gõ trong ô tìm | Tìm sau 250ms; **Enter = tìm ngay**, không bao giờ là Chèn |
| Escape | Theo tầng: popup (dropdown, chip, lịch) → dialog lồng (tải lên, xác nhận, **bước cắt** = "Quay lại") → ô tìm có chữ (xoá chữ) → đóng picker (`cancelled / escape`, qua cổng xác nhận nếu có việc dở) |
| Enter trên card | Đơn: chọn + xem. Nhiều: chỉ xem chi tiết |
| Space trên card | Đơn: chọn + xem. Nhiều: bật / tắt chọn; Shift+Space: chọn dải |
| Ctrl+click card (⌘+click trên macOS) | (nhiều) Bật / tắt chọn; (đơn) như click |
| Shift+click card | (nhiều) Thêm dải từ mốc; (đơn) như click |
| Enter trong ô một dòng của form | Lưu (chỉ trong phạm vi ô) |
| Ctrl/⌘+Enter trong form | Lưu |
| Enter trong ô URL | Gửi tải từ URL |

- **Không có Enter toàn cục = Chèn**: chỉ nút "Chèn" ở footer xác nhận (disabled khi chưa chọn gì).
- Live region của picker đọc: số kết quả, "Trang {n}", tải lên xong / dùng lại, đã lưu, đã xoá. `aria-busy` trên vùng kết
  quả khi đang tải. Đóng → focus về phần tử đã mở picker.
- Facet không nhãn hiển thị vẫn có tên truy cập (`aria-label` = nhãn descriptor); nút "Tải lên" / "Bộ lọc" / "Bỏ chọn tất
  cả" chỉ-icon có `aria-label` (nút Bộ lọc kèm số bộ lọc đang áp).

### Điện thoại (< 720px)

- Picker vẫn full viewport (không còn bottom sheet). Toolbar **một hàng** (0.36.0): "Tải lên" + ô tìm + "Bộ lọc" (chỉ
  icon, 44px); facet trong [sheet Bộ lọc](#toolbar-dưới-1024px--sheet-bộ-lọc-0360); phân trang **dưới lưới**; footer một
  hàng. Không tự mở chi tiết khi tải danh sách.
- Panel chi tiết là **pane full màn hình trượt vào từ phải**; "Quay lại" là **mũi tên 44px trên header hộp thoại** (0.36.0,
  chỉ hiện khi pane đang mở; tên `back`); mở pane → focus tiêu đề pane; Quay lại → focus về card vừa xem. Footer "Đóng /
  Chèn" vẫn hiện bên dưới. Hàng nút của pane hiện **tối đa 3** (luôn giữ "Lưu"); phần còn lại vào nút **"Thêm"** (menu,
  nhãn `detailMore`). dcms2 không có lối ra này.
- 720–1023px: khi không có mục nào đang xem (kết quả rỗng) cột chi tiết **thu lại**, lưới dùng hết bề ngang; có xem trước
  → cột hiện lại.
- Dialog tải lên là bottom sheet cao theo nội dung, không footer. Header các hộp thoại gọn (≤ 56px, [modal](modal.md)).
  Reduced motion → chỉ fade, không trượt. Forced colors → viền card vẫn thấy.

## Nhãn — `TdMediaPicker.labels`

Đổi toàn trang bằng `Object.assign(TdMediaPicker.labels, {...})`; đổi **theo lần mở** bằng `options.messages` (chuỗi hoặc
hàm `(params) => string`; hàm ném lỗi / trả không phải chuỗi → dùng nhãn mặc định). Placeholder `{n}`, `{max}`,
`{total}`, `{from}`, `{to}`, `{name}`, `{ok}`, `{k}`, `{accept}` được điền sẵn. Kết quả **luôn** gán bằng `textContent`.

| Key | Mặc định |
|---|---|
| `title` · `titleImage` · `titleVideo` · `titleFile` | "Chọn media" · "Chọn ảnh" · "Chọn video" · "Chọn tài liệu" (option `title` thắng) |
| `close` · `cancel` · `confirm` · `confirmCount` | "Đóng" · "Đóng" · "Chèn" · "Chèn ({n})" |
| `cropTitle` · `cropBack` · `cropConfirm` · `cropUnavailable` (0.35) | "Cắt ảnh" · "Quay lại" · "Chèn" · "Không mở được ảnh để cắt." (nhãn bên trong vùng cắt: [`TdCropper.labels`](cropper.md#nhãn--tdcropperlabels)) |
| `search` · `searchPlaceholder` | "Tìm media" (nhãn ẩn) · "Tìm kiếm media…" |
| `upload` · `results` · `grid` | "Tải lên" · "Kết quả" · "Media" |
| `filters` · `filtersActive` · `filtersTitle` (0.36) | "Bộ lọc" · "Bộ lọc, {n} đang áp dụng" · "Bộ lọc" |
| `filtersApply` · `filtersClear` · `filtersClose` (0.36) | "Áp dụng" · "Xoá lọc" · "Đóng bộ lọc" |
| `pagination` · `pageItem` · `pageInfo` · `page` | "Phân trang media" · "media" · "Hiển thị {from}-{to} / {total} media" · "Trang {n}" |
| `prevPage` · `nextPage` · `resultsCount` | "Trang trước" · "Trang sau" · "{n} kết quả" |
| `empty` · `emptyHint` · `retry` · `back` | "Không có media nào" · "Thử từ khoá khác" · "Thử lại" · "Quay lại" |
| `detail` · `detailEmpty` · `detailEmptyHint` · `fileName` | "Chi tiết" · "Chọn một ảnh để xem chi tiết" · "Bấm vào ảnh trong danh sách bên trái" · "Tên file" |
| `save` · `saved` | "Lưu" · "Đã lưu thay đổi" |
| `discardTitle` · `discardMessage` · `discard` · `keepEditing` | "Bỏ thay đổi?" · "Các thay đổi chưa lưu hoặc file đang tải lên sẽ bị huỷ." · "Bỏ thay đổi" · "Tiếp tục sửa" |
| `limit` · `loadingInitial` | "Tối đa {max} mục" · "Đang tải lựa chọn…" |
| `selected` · `selectedMax` · `clearSelection` | "Đã chọn {n}" · "Đã chọn {n}/{max}" · "Bỏ chọn tất cả" |
| `selectFirst` · `notReady` | "Hãy chọn ít nhất một mục." · "Mục này chưa sẵn sàng để chọn." |
| `conflict` · `reload` · `video` | "Media đã bị thay đổi ở nơi khác." · "Tải lại" · "Video" |
| `download` · `downloadExpired` · `copyLink` | "Tải về" · "Liên kết tải đã hết hạn" · "Copy link" |
| `delete` · `deleteTitle` · `deleteMessage` | "Xoá" · "Xác nhận xoá" · `Bạn có chắc muốn xoá "{name}"? Hành động này không thể hoàn tác.` |
| `deleteConfirm` · `deleteCancel` · `deleted` | "Xoá" · "Huỷ" · "Đã xoá {name}" |
| `blockedHeading` · `blockedText` · `blockedMore` | "Không xoá được" · "Media đang được dùng ở {n} nơi." · "… và {k} nơi khác" |
| `uploadTitle` · `uploadClose` · `uploadSources` | "Tải lên media" · "Đóng" · "Nguồn tải lên" |
| `uploadTabFile` · `uploadTabUrl` | "Tải file" · "Tải từ URL" |
| `uploadDropTitle` · `uploadDropText` | "Kéo thả file vào đây" · "hoặc bấm để chọn file" |
| `uploadNeedsFields` · `uploadDone` | "Điền các trường bắt buộc trước khi tải lên." · "Đã tải lên {ok}/{total} tệp" |
| `uploaded` · `reused` · `uploadError` | "Đã tải lên {name}" · "{name} đã có trong thư viện — dùng lại ảnh cũ" · "Tải lên thất bại" |
| `uploadCancelTitle` · `uploadCancelMessage` | "Huỷ các tệp đang tải?" · "Các tệp đang tải lên sẽ bị huỷ." |
| `uploadCancelConfirm` · `uploadCancelKeep` | "Huỷ tải lên" · "Tiếp tục tải" |
| `urlDescription` · `urlDescriptionAny` | "Nhập URL ảnh để tải trực tiếp. Hỗ trợ: {accept}" · "Nhập URL ảnh để tải trực tiếp." |
| `urlLabel` · `urlPlaceholder` | "URL ảnh" · "https://example.com/image.jpg" |
| `urlSubmit` · `urlAbort` · `urlProgress` · `urlDone` | "Tải lên" · "Huỷ" · "Đang tải từ URL" · "Đã tải lên từ URL" |
| `urlError.{too-long\|invalid\|scheme\|credentials}` | "URL quá dài" · "URL không hợp lệ" · "Chỉ nhận http hoặc https" · "URL không được chứa thông tin đăng nhập" |
| `kind.{image\|video\|file}` | "Ảnh" · "Video" · "File" |
| `status.{pending\|processing\|failed\|archived}` | "Đang chờ" · "Đang xử lý" · "Lỗi" · "Đã lưu trữ" |
| `meta.{size\|dimensions\|type\|date\|uploadedBy\|status}` | "Kích thước" · "Độ phân giải" · "Loại" · "Tải lên" · "Bởi" · "Trạng thái" (`meta.dimensionsValue` "{w} × {h}px") |
| `error.network` | "Không kết nối được. Kiểm tra mạng rồi thử lại." |
| `error.unauthorized` | "Phiên đăng nhập đã hết. Hãy đăng nhập lại." |
| `error.forbidden` | "Bạn không có quyền thực hiện thao tác này." |
| `error.not-found` · `error.conflict` | "Không tìm thấy media." · "Media đã bị thay đổi ở nơi khác." |
| `error.rate-limited` | "Thao tác quá nhanh. Thử lại sau giây lát." |
| `error.validation` · `error.server` | "Dữ liệu chưa hợp lệ." · "Có lỗi xảy ra. Thử lại sau." |

`error.*` chỉ dùng khi adapter không có `userMessage`. Key lồng nhau (`error`, `kind`, `status`, `meta`, `urlError`) đè
bằng `messages: { 'error.network': '…' }` theo lần mở, hoặc thay cả object con trên `TdMediaPicker.labels`. Đổi nhãn so với
0.32 ("Chọn (n)" → "Chèn (n)", "Huỷ" → "Đóng", …): [Nâng cấp](../upgrading/README.md).

```js
Object.assign(TdMediaPicker.labels, { title: 'Media library', confirmCount: 'Insert ({n})' });
TdMediaPicker.labels.error = { ...TdMediaPicker.labels.error, network: 'Connection lost.' };
TdMediaPicker.open({ selection: { mode: 'single' }, messages: { limit: ({ max }) => `Chỉ chọn ${max} ảnh` } });
```

## CSP, ảnh và referrer

- Kit không dùng `style="…"`, không chèn `<style>`, không handler inline — chạy dưới CSP strict như mọi component (giá trị
  riêng từng ô của lưới đặt bằng CSSOM, CSP không chặn).
- **`img-src` của CSP phải cho phép origin ảnh mà adapter trả về** (CDN, bucket R2 / S3, domain ảnh ký). Ví dụ
  `img-src 'self' https://cdn.example.com`. Thiếu → thumbnail trống, console báo vi phạm CSP.
- `blob:` trong `img-src` chỉ cần nếu muốn dropzone hiện thumbnail xem trước của file **đang chọn để tải**; thiếu thì dòng
  file không có thumbnail, upload vẫn chạy.
- **Tải về**: nhánh `{ url }` khác origin mở **tab mới** (không phải fetch, không cần `connect-src`); nhánh `{ blob }` là
  `<a download>` cùng origin (không cần directive thêm). Nếu adapter tự `fetch` file gốc để trả blob thì `connect-src` phải
  cho phép origin đó, và CDN phải trả header CORS.
- **Tải từ URL**: trình duyệt **không** chạm vào URL người dùng nhập (chỉ gửi chuỗi cho adapter) — không cần mở CSP cho
  host lạ.
- Mọi `<img>` của picker / field có `referrerpolicy="no-referrer"` cố định, `loading="lazy"`, `decoding="async"`. **CDN có
  chống hotlink phải chấp nhận referer rỗng**, không thì ảnh trong picker bị chặn.
- URL ảnh chỉ nhận `https:` (`http:` khi trang là `http:`) hoặc đường dẫn tương đối; `javascript:`, `data:`, `file:`…
  → coi như không có ảnh. Link usage qua `safeLinkUrl` (chỉ `http(s):` / tương đối).

## Ví dụ adapter `fetch` (code của app, không phải API kit)

Đây là **một ví dụ** cho backend trả envelope `{ data, meta }` và lỗi `{ message, code, errors }` (kiểu Laravel). Site
khác envelope thì sửa hàm map — kit không bao giờ đoán envelope. Giữ adapter trong code của site.

```js
// /assets/app/media-adapter.js — CODE CỦA SITE
const CSRF = document.querySelector('meta[name="csrf-token"]')?.content ?? '';
const CODES = { 401: 'unauthorized', 403: 'forbidden', 404: 'not-found', 409: 'conflict', 422: 'validation', 429: 'rate-limited' };

async function call(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method, signal, credentials: 'same-origin',
      headers: { Accept: 'application/json', 'X-CSRF-TOKEN': CSRF, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
      body: body instanceof FormData ? body : body && JSON.stringify(body),
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;                   // abort → để kit im lặng
    throw Object.assign(new Error(String(e)), { code: 'network', userMessage: 'Mất kết nối, thử lại sau.' });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(`HTTP ${res.status}`), {
      code: CODES[res.status] ?? 'server',
      userMessage: res.status < 500 && typeof json.message === 'string' ? json.message : undefined, // server đã viết chữ an toàn
      fieldErrors: res.status === 422 ? json.errors : undefined,  // { license: ['…'], url: ['…'] }
    });
  }
  return json;
}

const toAsset = (d) => ({
  id: String(d.id), version: d.updated_at, kind: d.kind, status: d.status,
  name: d.original_name, mimeType: d.mime, byteSize: d.size, width: d.width, height: d.height,
  createdAt: d.created_at, uploadedByLabel: d.uploader?.name,
  urls: { thumbnail: d.thumb_url, preview: d.preview_url },
  defaultAltText: d.alt ?? '', metadata: d.meta ?? {},
  capabilities: { editMetadata: d.can_edit, delete: d.can_delete },
});
const toUpload = ({ data, dedup }) => ({
  asset: toAsset(data),
  deduplication: dedup?.reused ? { outcome: 'exact-reused', matchedAssetId: String(data.id) } : { outcome: 'created' },
});

export const mediaAdapter = {
  async list({ query, filters, cursor, limit, kinds, signal }) {
    const qs = new URLSearchParams({ q: query, limit: String(limit) });
    if (cursor) qs.set('cursor', cursor);
    for (const k of kinds ?? []) qs.append('kind[]', k);
    for (const [key, v] of Object.entries(filters)) for (const x of [].concat(v)) qs.append(`f[${key}][]`, String(x));
    const { data, meta } = await call(`/admin/api/media?${qs}`, { signal });
    return { items: data.map(toAsset), nextCursor: meta.next_cursor ?? null, total: meta.total };
  },
  async get(id, { signal }) {
    return toAsset((await call(`/admin/api/media/${encodeURIComponent(id)}`, { signal })).data);
  },
  async facets({ signal }) {
    return (await call('/admin/api/media/facets', { signal })).data;   // server trả sẵn FacetDescriptor[]
  },
  async upload(file, { fields, signal, onProgress }) {
    const body = new FormData();
    body.append('file', file);
    for (const [k, v] of Object.entries(fields)) body.append(k, v == null ? '' : String(v));
    onProgress({ percent: 0 });                 // fetch không có tiến độ upload; cần % thật thì dùng XMLHttpRequest
    const json = await call('/admin/api/media', { method: 'POST', body, signal });
    onProgress({ percent: 100 });
    return toUpload(json);
  },
  // Server PHẢI chặn SSRF (xem checklist "Trách nhiệm của server khi tải từ URL").
  async uploadFromUrl(url, { fields, signal }) {
    return toUpload(await call('/admin/api/media/import-url', { method: 'POST', body: { url, ...fields }, signal }));
  },
  async update(id, { fields, version }, { signal }) {
    const { data } = await call(`/admin/api/media/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: { ...fields, version }, signal });
    return toAsset(data);
  },
  // Server kiểm quyền + usage; đang dùng → 200 { status: 'blocked', usage_count, usages: [{ id, label, kind, url }] }.
  async delete(id, { signal }) {
    const r = await call(`/admin/api/media/${encodeURIComponent(id)}`, { method: 'DELETE', signal });
    if (r.status === 'blocked') {
      return { status: 'blocked', reason: 'in-use', usageCount: r.usage_count,
        usages: r.usages.map((u) => ({ id: String(u.id), label: u.label, kind: u.kind, href: u.url })), truncated: r.truncated };
    }
    return { status: 'deleted', id };
  },
  // Server trả URL ký ngắn hạn kèm Content-Disposition: attachment.
  async download(id, { signal }) {
    const { data } = await call(`/admin/api/media/${encodeURIComponent(id)}/download`, { signal });
    return { url: data.url, filename: data.filename, expiresAt: data.expires_at };
  },
};
```

Ghi nhớ khi viết adapter:

- Luôn truyền `signal` vào `fetch` (và rethrow `AbortError` nguyên dạng).
- `userMessage` phải là chữ **đã duyệt** cho người dùng; đừng gán `error.message` của server 500 hay của host từ xa vào đó.
- Server vẫn kiểm quyền cho từng request — adapter chạy trong trình duyệt, ai cũng sửa được.
- `capabilities` per-asset chỉ để ẩn nút; `PATCH` / `DELETE` vẫn phải trả 403 nếu không có quyền.

## Cấu trúc DOM & class

```html
<div class="td-modal td-modal--viewport td-media-picker" data-state="open" data-view="grid|detail" data-mode="single|multiple">
  <div class="td-modal__backdrop" aria-hidden="true"></div>
  <div class="td-modal__dialog td-media-picker__dialog" role="dialog" aria-modal="true" aria-labelledby="…-title" tabindex="-1">
    <div class="td-modal__header"><h2 class="td-modal__title">Chọn ảnh</h2><button class="td-modal__close">×</button></div>
    <div class="td-modal__body td-media-picker__body">
      <div class="td-media-picker__toolbar">
        <td-button class="td-media-picker__upload-btn"> <td-input-field class="td-media-picker__search">
        <span class="td-media-picker__filter" [hidden]>              <!-- 0.36.0: hiện < 1024px khi có facet -->
          <td-button class="td-media-picker__filter-btn" aria-haspopup="dialog"> <span class="td-badge td-media-picker__filter-count">
        </span>
        <div class="td-media-picker__filters">
          <div class="td-media-picker__facets"><div class="td-media-picker__facet" data-key data-type>…</div></div>
          <div class="td-media-picker__pager[ td-media-picker__pager--below]">   <!-- < 720px: JS dời node xuống cuối __results -->
            <div class="td-media-picker__cursor"><p class="td-media-picker__page-info"> .td-media-picker__prev .td-media-picker__next</div>
            | <td-pagination>
          </div>
        </div>
      </div>
      <div class="td-media-picker__content">
        <section class="td-media-picker__results" aria-busy><h3 class="td-media-picker__results-heading td-sr-only">
          <td-media-grid class="td-media-picker__grid" select-mode="tick">.td-media-picker__card …</td-media-grid>
          .td-media-picker__skeleton | td-empty-state.td-media-picker__empty | .td-media-picker__error[role=alert] + .td-media-picker__retry
        </section>
        <aside class="td-media-picker__detail" data-state="empty|ready" aria-label="Chi tiết">
          .td-media-picker__back · .td-media-picker__preview · .td-media-picker__label + .td-media-picker__detail-name ·
          .td-media-picker__form · .td-media-picker__facts · .td-media-picker__detail-actions
          (.td-media-picker__download · td-copy.td-media-picker__copy · .td-media-picker__delete · .td-media-picker__save) ·
          td-alert.td-media-picker__blocked > ul.td-media-picker__usages
        </aside>
      </div>
    </div>
    <div class="td-modal__footer td-media-picker__footer">
      <div class="td-media-picker__selbar">.td-media-picker__selcount · .td-media-picker__clear</div>
      <div class="td-media-picker__actions">.td-media-picker__cancel · .td-media-picker__confirm</div>
    </div>
  </div>
</div>

<!-- sheet bộ lọc (0.36.0), lồng trên picker -->
<div class="td-modal td-modal--sm td-media-picker-filters">
  … .td-media-picker-filters__body > .td-media-picker-filters__facet (control facet, rộng hết)
  · .td-media-picker-filters__footer > .td-media-picker-filters__clear · .td-media-picker-filters__apply
</div>

<!-- dialog tải lên, lồng trên picker -->
<div class="td-modal td-modal--md td-media-picker-upload">
  … .td-media-picker-upload__fields · td-tabs.td-media-picker-upload__tabs
  · .td-media-picker-upload__panels (một ô grid chung cho hai panel → dialog giữ nguyên chiều cao khi đổi tab, như dcms2)
    > .td-media-picker-upload__panel (td-dropzone.td-media-picker-upload__dropzone
      | .td-media-picker-upload__url-row > .td-media-picker-upload__url, rồi .td-media-picker-upload__url-actions
        > __submit · __abort (nút nằm DƯỚI ô URL, như dcms2), rồi __progress)
  · __footer
</div>
```

Vỏ dùng lại class / CSS của [modal](modal.md) (`.td-modal--viewport`, chuyển động, reduced motion). Lưới dùng
`--td-media-grid-*` của [media grid](media-grid.md) cộng các token `--td-media-picker-*` ở trên. Trạng thái qua `data-*` /
`aria-*` — đè CSS theo [Styling](../customization/styling.md).

## dcms2 → td: giống gì, khác gì

Picker theo bố cục và cách dùng của media picker dcms2. Bảng dưới là các điểm chính; lý do chi tiết từng điểm cố ý khác ở
[research §C](../internal/research/dcms2-media-picker-inventory.md#c-những-gì-giữ-nguyên-lập-trường-từ-chối-adr-0013--plan-v032-tránh).

| Hạng mục | dcms2 | td | |
|---|---|---|---|
| Kích thước | Full viewport (`100vh`) | Full viewport (`100dvh` + safe area) | khớp (sửa lỗi thanh địa chỉ iOS) |
| Tiêu đề | Theo loại | Theo `selection.kinds` | khớp |
| Toolbar | Upload · tìm · facet · phân trang, một hàng | Như dcms2, toàn component kit | khớp |
| Toolbar < 720px | Tràn ngang | Xuống 2 hàng | sửa lỗi |
| Facet | Dropdown / toggle gọn, không nhãn | Như dcms2 + `aria-label` | khớp |
| Phân trang | Số trang + "Hiển thị a-b / total" | `pages` y như vậy; `cursor` là ‹ › + cùng dòng chữ | khớp (thêm chế độ cursor cho dsuite) |
| Card | 3:2 contain, tên, "cỡ • ngày", viền 2px, bo 12px | Như dcms2 | khớp |
| Màu trạng thái | `#3b82f6` / `#10b981` cứng | Token, mặc định accent / success, gate tương phản | khớp (theo token) |
| Thumb đã chọn mờ | Không cập nhật khi đổi lựa chọn | Cập nhật mỗi lần | sửa lỗi |
| Click ở chế độ nhiều | Click = xem, checkbox = chọn | Như dcms2 + Space / Shift chọn dải | khớp (thêm bàn phím) |
| Panel chi tiết | 400px, 1:1 contain, form inline, Copy / Xoá / Lưu | Như dcms2 + "Tải về" cho mọi loại | khớp |
| Nút Lưu | Luôn bật (ảnh) | Chỉ bật khi form bẩn | cố ý khác |
| Lưu | Enter trong ô alt, cả khi chỉ xem | Enter trong ô một dòng **chỉ trong phạm vi ô**; không autosave | cố ý khác |
| Sửa dở rồi đổi mục | Mất im lặng | Hỏi "Bỏ thay đổi?" | cố ý khác |
| Upload | Modal lồng, 2 tab file / URL | Như dcms2 (`td-tabs`, `td-dropzone`) | khớp |
| Tiến độ upload | Modal không huỷ được | Từng dòng trong dropzone, huỷ được | cố ý khác |
| URL upload: lỗi | Hiện `error.message` thô | Chỉ `userMessage` | cố ý khác |
| URL upload: loại | Chặn video ở client | Server trả `validation` | cố ý khác |
| Xoá | Xoá cứng / mềm, không hỏi usage | Hỏi lại; **server** kiểm usage + quyền, trả `blocked` | cố ý khác |
| Tải về | `window.open` | `<a download>` tạm; blob không bao giờ mở trong tab | cố ý khác |
| Copy link | Có | Tuỳ chọn (`copyLink`, mặc định tắt); link hiển thị, không phải danh tính | khớp có điều kiện |
| Tự chọn mục đầu | Có | Không | cố ý khác |
| Enter toàn cục = Chèn | Có | Không | cố ý khác |
| Escape | Không đóng | Đóng theo tầng (qua cổng xác nhận) | cố ý khác |
| Mobile chi tiết | Che kín, không lối ra | Pane trượt có "Quay lại" | sửa lỗi |
| Request cũ / debounce | Kết quả cũ thắng, không debounce | Latest-wins + abort, debounce 250ms | cố ý khác |
| Crop | Bấm "Chèn" → modal crop (CropperJS) khi có tỉ lệ; chọn nhiều không crop | Như dcms2: bước cắt sau "Chèn" (`crop`), khung lớn nhất đúng tỉ lệ căn giữa, chọn nhiều không crop; + "Quay lại", điểm trọng tâm, bàn phím | khớp UX |
| Kết quả crop | Canvas → JPEG → **upload file mới** | **Chỉ toạ độ** (`usage.crop` / `focalPoint`), không canvas, không file mới; server cắt bằng tham số đã ký | cố ý khác |
| Kiểm tỉ lệ ảnh | `validateRatio` | Không — lọc ở adapter / server | cố ý khác |
| Giá trị form | URL | `assetId` | cố ý khác |
| CSP | `<style>` chèn lúc chạy, `style.cssText`, z-index 100000 | CSP strict, CSSOM, tầng modal của kit | cố ý khác |

## Cảm ứng

- Khi bàn phím ảo mở (ô tìm, trường chi tiết, hộp tải lên / URL, sheet lọc), lớp phủ co theo vùng nhìn thấy; vùng cuộn chứa ô đang nhập tự cuộn tới nó. Card, nút quay lại có hình nhấn (opener ảnh tối nhẹ); hover viền chỉ trên con trỏ mịn.
- Bước cắt (crop dialog) không theo bàn phím (không có ô gõ chữ).

Chuẩn chung: [Cảm ứng](../guides/touch.md).

## Lưu ý & lỗi thường gặp

- **`TypeError: … adapter must implement list() and get()`** → chưa `configureDefaults({ adapter })`, hoặc adapter thiếu
  `list` / `get`.
- **Thumbnail trống, console báo CSP** → thêm origin ảnh vào `img-src`. Ảnh trống, không lỗi CSP → CDN chặn hotlink khi
  referer rỗng, hoặc URL không phải `https:`.
- **Nút Xoá / Tải về / Copy link không hiện** → ba capability này mặc định **tắt**: bật `capabilities.delete` /
  `downloadOriginal` / `copyLink` (và cài `delete` / `download`). Per-asset `capabilities.x: false` ẩn riêng mục đó.
- **Tab "Tải từ URL" không hiện** → adapter không có `uploadFromUrl`, hoặc `capabilities.uploadFromUrl: false`.
- **Dialog tải lên khoá cả hai nguồn** → có `uploadFields` `required` chưa điền.
- **Chế độ `pages` vẫn hiện ‹ › + cảnh báo console** → `list()` không trả `total` số nguyên ≥ 0.
- **Tải về mở tab mới thay vì lưu file** → URL khác origin: trình duyệt bỏ qua `download`. Cho CDN trả
  `Content-Disposition: attachment`, hoặc trả `{ blob, filename }`.
- **Lỗi chỉ hiện câu chung chung (`labels.error.{code}`)** → adapter không đặt `userMessage` (cố ý: kit không hiện
  `message`).
- **Mục không chọn được** → `status` khác `'ready'`, hoặc sai `selection.kinds` (bị ẩn).
- **`open()` resolve ngay `cancelled / programmatic`** → đã có một picker đang mở.
- **Bật `crop` mà "Chèn" kết thúc ngay** → đang chọn nhiều, asset là video / file, hoặc picker do một
  [media field](media-field.md) không `croppable` mở (field luôn gửi `crop: { enabled: false }`).
- **Bước cắt báo lỗi tỉ lệ, "Chèn" khoá** → `urls.preview` là ảnh đã cắt sẵn (thumbnail) trong khi `width/height` là của
  ảnh gốc. Trả preview là ảnh nguyên.
- **`usage.crop` không có `pixels`** → asset thiếu `width` / `height`.

## Xem thêm

- [Media field](media-field.md) · [Cropper](cropper.md) · [Media grid](media-grid.md) · [Dropzone](dropzone.md) · [Modal](modal.md) ·
  [Pagination](pagination.md) · [Copy](copy.md)
- [Hook › TdMediaPicker](../customization/hooks.md#tdmediapicker) · [CSP](../guides/csp.md) · [Bảo mật](../guides/security.md)
- [ADR 0013](../internal/decisions/0013-media-picker-boundary.md) (kèm "Bổ sung v0.33", "Bổ sung v0.35") · plan
  [v0.33.0](../internal/plans/v0.33.0-media-picker-dcms-parity.md) ·
  [security-model › Media picker](../internal/security-model.md#6-media-picker--media-field)
