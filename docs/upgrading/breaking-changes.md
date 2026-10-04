[Tài liệu](../README.md) › [Nâng cấp](README.md) › Thay đổi phá vỡ theo phiên bản

# Thay đổi phá vỡ theo phiên bản (0.4 → 0.33)

Trang này liệt kê, cho từng bản từ **0.33.0** (mới nhất) ngược về **0.4.0**, những gì có thể làm site của bạn chạy
khác hoặc nhìn khác sau khi nâng cấp, và **chính xác site phải sửa gì**. Nguồn sự thật là
[CHANGELOG.md](../../CHANGELOG.md); trang này chỉ gom lại theo góc nhìn "tôi phải làm gì" và thêm ví dụ trước/sau.
Quy trình nâng cấp chung nằm ở [README.md](README.md).

Nhãn dùng trong trang:

- **Phá vỡ** — code / CSS / cấu hình của site sẽ hỏng hoặc mất tác dụng nếu không sửa.
- **Đổi hành vi** — API giữ nguyên nhưng component phản ứng khác (bàn phím, sự kiện, giá trị trả về).
- **Đổi giao diện** — không phải sửa code, nhưng site sẽ nhìn khác; có token để chỉnh lại nếu cần.
- **Không có thay đổi phá vỡ** — chỉ bổ sung (additive) và sửa lỗi.

## Tóm tắt

| Bản | Mức | Việc chính site phải làm |
|---|---|---|
| [0.33.0](#0330) | Đổi giao diện + đổi văn bản (không breaking API) | Không bắt buộc sửa code. Media picker full viewport giống dcms2: nhãn mặc định đổi ("Chọn ({n})" → "Chèn ({n})", "Huỷ" → "Đóng", "Thư viện media" → tiêu đề theo `selection.kinds`), `pageSize` 40 → 30, "Tải thêm" → phân trang, bỏ khay thumb. `td-media-grid`: ô đã chọn hết thu nhỏ / nền, thành vòng inset; grid tự đặt kích thước `img` (CSS site trên `img` không còn thắng — dùng token). |
| [0.32.0](#0320) | Không có thay đổi phá vỡ | Không. Thêm `<td-media-picker>` / `TdMediaPicker`, `<td-media-field>`, `td_media_field()`. Import map tự liệt kê: thêm `media-picker`, `media-field`. |
| [0.31.0](#0310) | Đổi văn bản (nhỏ) | Không bắt buộc. Thêm `<td-sortable>`, `<td-masked-value>`, `td_masked_value()`, `<td-repeater sortable>`. Câu thông báo di chuyển dòng của repeater đổi chữ (test so đúng chữ phải cập nhật). Import map: thêm `sortable`, `masked-value`. |
| [0.30.0](#0300) | Không có thay đổi phá vỡ | Không. Sửa `<td-otp-input>` co hẹp trong flex row. Thêm `<td-repeater>`, `<td-number-input>`, `td_number_input()`. Import map tự liệt kê: thêm `repeater`, `number-input`. |
| [0.29.0](#0290) | Không có thay đổi phá vỡ | Không. Thêm `<td-tree>`, `<td-tree-select>`, `td_tree_select()`. Import map tự liệt kê: thêm `tree`, `tree-select`. |
| [0.28.0](#0280) | Không có thay đổi phá vỡ | Không. `<td-chip-input>` thêm `selection-only` / `select-all` / nhóm / nâng cấp `<select multiple>`; PHP `td_multiselect()`. |
| [0.27.0](#0270) | Không có thay đổi phá vỡ | Không. Thêm otp-input, drawer, copy, skeleton CSS. Import map tự liệt kê: thêm `otp-input`, `drawer`, `copy`. |
| [0.26.1](#0261) | Không có thay đổi phá vỡ | Không. Sửa password-meter `for` trỏ id ô của field. |
| [0.26.0](#0260) | Không phá vỡ (opt-in) | Site đã bật `ssr_elements`: field / toggle / checkbox / dropdown cũng in element mode — kiểm CSS / JS bám ô native, id. Thêm `td_empty()`. |
| [0.25.0](#0250) | Không có thay đổi phá vỡ | Không bắt buộc. Muốn hết flash: bật element mode PHP (`ssr_elements`); khi bật, `id` / `class` của `td_button` nằm trên host. |
| [0.24.0](#0240) | Đổi giao diện + đổi hành vi (nhỏ) | Lightbox: nút trước / sau ra hai bên trên máy chuột; URL item trả ra là tuyệt đối; tải sẵn ảnh kề chỉ cùng origin mặc định. |
| [0.23.0](#0230) | Không có thay đổi phá vỡ | Không. Thêm `<td-media-grid>`. |
| [0.22.1](#0221) | Không có thay đổi phá vỡ | Không. Modal đổi chuyển động (giống dcms); site đặt `--td-modal-ease` riêng: giờ là đường cong fade. |
| [0.22.0](#0220) | Đổi DOM (nhỏ) | CSS / code site cuộn hoặc đo `.td-dropdown__options` → `.td-dropdown__scroller`; "Không có kết quả" nằm trên listbox. |
| [0.21.1](#0211) | Không có thay đổi phá vỡ | Không. Sửa lỗi popup / modal / lightbox khi kết hợp; `TdMenu` `onClose` thêm reason `'covered'`. |
| [0.21.0](#0210) | Đổi giao diện + đổi DOM toast | Primary đen (về accent bằng token); nút ngữ nghĩa pastel; tooltip đen; toast bỏ icon (code query `.td-toast__icon` phải bỏ); modal có animation. |
| [0.20.0](#0200) | Đổi giao diện lớn | Kiểm bằng mắt nút / popup / toast / modal; override token kính cũ hết tác dụng → đổi sang token mới (bảng dưới). |
| [0.19.0](#0190) | Đổi hành vi (nhỏ) + đổi giao diện (nhỏ) | datetime-picker mặc định mở tại hôm nay (cần đầu khoảng → `open-at="min"`); stamp dùng font mono; `td-button` chuyển ARIA trạng thái xuống; dropzone hiện `err.message`. |
| [0.18.0](#0180) | Đổi hành vi (nhỏ) | `searchable="false"` (PHP) giờ tắt thật; `hasIcon()` hiểu alias; datetime-picker nhận ISO; `td-button` truyền `name`/`value`. |
| [0.17.0](#0170) | Đổi hành vi (nhỏ) | `dropdown.value` trả giá trị đang chọn; `<td-dropdown>` chứa `<select>` giờ được nâng cấp. |
| [0.16.0](#0160) | Đổi hành vi | `input-field.value`, slider `required`/`step`/mặc định, dropdown giữ/bỏ lựa chọn + `onSelect`+`onChange`, `confirm` giữ mở khi `onConfirm` trả `false`, định dạng `toAbsolute`, token `:root`, dark accent. |
| [0.15.1](#0151) | Không có thay đổi phá vỡ | Không. Tài liệu viết lại; sửa con trỏ trigger video lightbox. |
| [0.15.0](#0150) | Không có thay đổi phá vỡ | Không bắt buộc. Con trỏ trên trigger lightbox đổi. |
| [0.14.4](#0144) | Đổi giao diện (nhỏ) | Không bắt buộc. |
| [0.14.3](#0143) | Đổi giao diện + gỡ 1 token | Bỏ override `--td-glass-secondary-film`; kiểm tra nút secondary / disabled. |
| [0.14.2](#0142) | Đổi giao diện | Site cần tương phản chặt: ghi đè `--td-control-border-hover`. |
| [0.14.1](#0141) | Đổi giao diện | Site cần viền 3:1 lúc nghỉ: ghi đè `--td-control-border-soft`. |
| [0.14.0](#0140) | Đổi giao diện lớn + đổi hành vi | Kiểm tra glass, nút, checkbox tròn, toast, tooltip; tooltip dwp chạy trùng. |
| [0.13.0](#0130) | Không có thay đổi phá vỡ | Không. |
| [0.12.0](#0120) | Đổi hành vi (nhỏ) | Test so khớp thông báo lỗi tiếng Anh của checkbox/toggle/slider. |
| [0.11.0](#0110) | Phá vỡ | Site dùng Tailwind phải tự khai báo `tailwindcss`; `td-sample` đổi markup. |
| [0.10.0](#0100) | Phá vỡ + đổi hành vi | Class BEM của datetime-picker / table; `getValue()` trả `''`; server-mode cần `total-items`. |
| [0.9.0](#090) | Phá vỡ + đổi hành vi | Class BEM của modal / toast / tooltip / dropdown; z-index theo token; `getTheme()` đổi kiểu trả về. |
| [0.8.0](#080) | Phá vỡ + đổi hành vi | Class BEM của input-field / slider / pagination / tabs / empty-state; một sự kiện mỗi loại; tabs kích hoạt thủ công. |
| [0.7.0](#070) | Phá vỡ + đổi hành vi | Bắt buộc tải `td.css`; class BEM của button / checkbox / toggle / loading; `--td-cb-color` → `--td-checkbox-color`. |
| [0.6.0](#060) | Không có thay đổi phá vỡ | Không. |
| [0.5.0](#050) | Không có thay đổi phá vỡ | Không. |
| [0.4.1](#041) | Đổi hành vi (sửa lỗi) | Code đọc `body.style.overflow` của modal; role của toast. |
| [0.4.0](#040) | Đổi hành vi | Modal không còn đóng khi bấm nền; `searchable="false"` / `allow-clear="false"` giờ có tác dụng. |

Nhảy nhiều bản một lúc (ví dụ 0.6 → 0.15)? Làm theo thứ tự cũ → mới: tải `td.css` (0.7) trước, rồi đổi selector
theo [class-map.md](class-map.md) (0.7–0.10), rồi xử lý hành vi và giao diện.

---

## 0.33.0

**Đổi giao diện + đổi văn bản — không breaking API.** Hợp đồng adapter chỉ thêm phần tuỳ chọn (`uploadFromUrl`,
`capabilities.uploadFromUrl` / `copyLink`, `pagination: 'pages'` + `MediaListRequest.page`, `upload.acceptLabel`, xem
[ADR 0013 › Bổ sung v0.33](../internal/decisions/0013-media-picker-boundary.md#bổ-sung-v033)); adapter v0.32 chạy y nguyên.
Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.33.0.

**`td-media-picker` — chữ hiển thị đổi.** Site đã ghi đè nhãn (`TdMediaPicker.labels` / `messages`) không bị ảnh hưởng; test so đúng chữ phải cập nhật.

| Chỗ | Trước (0.32) | Sau (0.33) |
|---|---|---|
| Nút xác nhận (`confirm`) | "Chọn ({n})" | "Chèn" / "Chèn ({n})" |
| Nút huỷ ở footer (`cancel`) | "Huỷ" | "Đóng" |
| Tiêu đề mặc định (`title`) | "Thư viện media" | theo `selection.kinds`: `['image']` "Chọn ảnh", `['video']` "Chọn video", `['file']` "Chọn tài liệu", khác "Chọn media" (`title` của `open()` vẫn thắng) |

**`td-media-picker` — hành vi / giao diện đổi:**

- **Full viewport ở mọi kích thước** (`.td-modal--viewport`), bỏ bottom sheet; breakpoint 768px (trước 640px).
- **`pageSize` mặc định 40 → 30.** Muốn giữ 40 thì truyền `pageSize: 40` cho `open()` / `configureDefaults`.
- **"Tải thêm" → phân trang**: mỗi trang **thay** nội dung lưới (lựa chọn vẫn giữ qua các trang). Mặc định `‹` / `›`
  theo cursor; adapter trả `total` thì có thể bật `pagination: 'pages'` để có `td-pagination` số trang.
- **Bỏ khay thumb 40px** ở footer; giữ số đếm "Đã chọn {n}/{max}" + "Bỏ chọn tất cả".
- Không tự chọn mục đầu (như 0.32); click card ở chế độ nhiều = **xem chi tiết**, bật / tắt chọn qua tick (góc trên-phải),
  Space hoặc Ctrl/Cmd+click. Form chi tiết luôn mở inline (bỏ nút "Sửa thông tin"). Tải lên chuyển sang dialog lồng.
- Bỏ nút "Bộ lọc (n)" trên màn hẹp: facet hiện inline, toolbar xuống dòng.
- CSS / test site nhắm vào DOM bên trong picker (`.td-media-picker__*`) phải kiểm lại: vỏ, toolbar, card và footer đã dựng
  lại bằng component kit (`td-button`, `td-input-field`, `td-dropdown`, …).

**`td-media-grid` — đổi giao diện ô:**

- **Ô đã chọn**: bỏ phép thu 0.88 (`--td-media-grid-selected-scale` mặc định thành `1`) và bỏ nền; đánh dấu bằng **vòng
  inset** vẽ trên opener (`--td-media-grid-selected-ring`). Muốn hiệu ứng thu nhỏ kiểu cũ: `:root
  { --td-media-grid-selected-scale: 0.88; }`.
- **Grid sở hữu kích thước ảnh**: `<img>` / `<video>` đầu tiên trong opener được đặt `width` / `height: 100%`,
  `max-width: none`, `object-fit` bằng CSSOM inline `!important`. Hệ quả: **CSS của site đặt lên `img` trong grid
  (`width`, `height`, `object-fit`) không còn tác dụng**, kể cả `!important`. Muốn khác thì dùng token:
  `--td-media-grid-fit` (`cover` / `contain`), `--td-media-grid-ratio` (tỉ lệ khung ô; mặc định `auto`, chiều cao ô theo
  ảnh như trước). Giá trị inline gốc của site được khôi phục khi item rời grid.
- Thêm (tuỳ chọn): `layout="justified"`, `select-mode="tick"`, `--td-media-grid-tick-inline`. Không đặt thì bố cục lưới
  giữ như cũ.

Xem [theming.md › Token riêng của từng component](../customization/theming.md#token-riêng-của-từng-component) cho danh sách
token mới.

---

## 0.32.0

**Không có thay đổi phá vỡ** — chỉ bổ sung. Site tự viết import map: thêm `@dazzxq/td-components/media-picker`,
`/media-field`. Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.32.0.

---

## 0.31.0

**Đổi văn bản (nhỏ)** — `TdRepeater.labels.moved` giờ là "Đã chuyển tới vị trí {n} trên {count}." (trước "{n} / {count}");
site tự đặt `TdRepeater.labels.moved` không bị ảnh hưởng. Còn lại chỉ bổ sung. Import map tự viết: thêm
`@dazzxq/td-components/sortable`, `/masked-value`. Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.31.0.

---

## 0.30.0

**Không có thay đổi phá vỡ** — chỉ bổ sung. Site tự viết import map: thêm `@dazzxq/td-components/repeater`,
`/number-input`. Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.30.0.

---

## 0.29.0

**Không có thay đổi phá vỡ** — chỉ bổ sung. Site tự viết import map: thêm `@dazzxq/td-components/tree`,
`/tree-select`. Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.29.0.

---

## 0.28.0

**Không có thay đổi phá vỡ** — chỉ bổ sung (chip-input không đặt `selection-only` chạy như cũ). Nguồn:
[CHANGELOG.md](../../CHANGELOG.md) 0.28.0.

---

## 0.27.0

**Không có thay đổi phá vỡ** — chỉ bổ sung. Site tự viết import map: thêm `@dazzxq/td-components/otp-input`,
`/drawer`, `/copy`. Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.27.0.

---

## 0.26.1

**Không có thay đổi phá vỡ** — sửa lỗi. Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.26.1.

---

## 0.26.0

**Không phá vỡ với site chưa bật element mode.** Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.26.0.

Site **đã bật** `Td::configure(…, ['ssr_elements' => true])` từ 0.25: từ 0.26 cờ này áp thêm cho `td_field`, `td_toggle`,
`td_checkbox`, `td_dropdown` (`<select>` thêm class `td-dropdown__native`, có hộp giống nút chọn). Kiểm:

1. `id` truyền vào là id của **ô native** (như trước); host nhận `{id}-host`. CSS / JS bám `#id` vẫn trúng ô.
2. `td_toggle` / `td_checkbox`: `class` / `attrs` lên **host** `<td-toggle>` / `<td-checkbox>` (trước: lên `<label>`);
   `input_attrs` vẫn xuống ô. `aria-label` qua `input_attrs` bị bỏ — dùng option `aria_label`.
3. Không muốn cho helper nào: truyền `['element' => false]` cho lần gọi đó.

---

## 0.25.0

**Không có thay đổi phá vỡ** — element mode là **opt-in**, mặc định `td_button()` / `td_link()` vẫn in nút native như cũ.
Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.25.0.

Khi **bật** element mode (`['element' => true]` hoặc `Td::configure(…, ['ssr_elements' => true])`):

1. `id` và `class` truyền vào helper nằm trên **host** `<td-button>`, không còn trên `<button>` bên trong. CSS / JS site
   nhắm `#id` / `.class` vào nút bên trong → đổi sang `#id > .td-btn` hoặc dùng API component.
2. `attrs` vẫn đi xuống nút native; `aria-*` trạng thái + `aria-label` được nâng lên host (JS chuyển xuống như 0.19).
3. Nên thêm `Td::modulePreloads([...])` sau import map để JS nạp sớm hơn (không bắt buộc).

---

## 0.24.0

**Đổi giao diện nhỏ ở lightbox + bổ sung.** Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.24.0.

1. Trên máy dùng chuột, nút **trước / sau** của lightbox chuyển từ toolbar ra **hai bên** ảnh (cùng phần tử, cùng
   `data-action`). CSS / test của site định vị hoặc đếm nút trong `.td-lightbox__toolbar` cần cập nhật; trên cảm ứng
   nút vẫn ở toolbar.
2. Bấm nền để đóng chỉ khi cú bấm bắt đầu trên nền.
3. Filmstrip mặc định **tắt** — bật bằng `filmstrip: true` hoặc `'auto'`.
4. `item.src` / `poster` / `thumb` trong `ctx.item`, `detail` sự kiện, `href` tải xuống giờ là **URL tuyệt đối** (đã
   chuẩn hoá theo `document.baseURI`). Code site so sánh với chuỗi tương đối cần so theo URL tuyệt đối.
5. Tải sẵn ảnh kề mặc định chỉ cho ảnh **cùng origin**; ảnh trên CDN tin cậy khác origin: `preload: 'all'`.

---

## 0.23.0

**Không có thay đổi phá vỡ** — chỉ thêm component `<td-media-grid>`. Site dùng import map tự liệt kê subpath: thêm
`@dazzxq/td-components/media-grid`. Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.23.0.

---

## 0.22.1

**Không có thay đổi phá vỡ.** Modal mở / đóng theo kiểu dcms; khoá cuộn không còn làm trang nhảy ngang. Site đã đặt
`--td-modal-ease` riêng: từ bản này token đó là đường cong **fade** (đường cong phóng là `--td-modal-enter-ease`);
`--td-modal-enter-dur` là thời lượng phóng (300ms). Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.22.1.

---

## 0.22.0

**Bổ sung + đổi DOM nhỏ của menu dropdown.** Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.22.0.

1. Vùng cuộn của menu là `.td-dropdown__scroller` (trong `.td-dropdown__options`, vẫn là `role="listbox"`). CSS / code
   site từng đặt `max-height` / `overflow` / `scrollTop` trên `.td-dropdown__options` → chuyển sang
   `.td-dropdown__scroller`.
2. `.td-dropdown__empty` ("Không có kết quả") giờ đứng **trước** listbox.
3. Site đang tự làm option giả kiểu `value="__new__"` để thêm mục: chuyển sang `create-label` + sự kiện `create`
   (xem [dropdown](../components/dropdown.md)).

---

## 0.21.1

**Không có thay đổi phá vỡ** — sửa lỗi khi kết hợp component. Popup giờ tự đóng khi trigger bị cuộn khuất / ẩn / gỡ
hoặc bị modal mở sau phủ; lightbox mở từ modal nằm trên. Code site nào dựa vào việc popup **còn mở** trong các tình huống
đó (hiếm) cần mở lại sau. `TdMenu` `onClose(reason)` có thể nhận `'covered'`. Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.21.1.

---

## 0.21.0

**Đổi giao diện + đổi DOM toast.** Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.21.0.

1. **Nút primary mặc định đen.** Site muốn primary theo màu thương hiệu:

   ```css
   :root {
     --td-btn-primary-bg: var(--td-accent-fill);
     --td-btn-primary-fg: var(--td-accent-contrast);
     --td-btn-primary-hover: color-mix(in srgb, var(--td-accent-fill) 92%, #000);
   }
   ```

   Đặt đủ ba token (chữ `-fg` mặc định ở dark là `#18181b`, phải map về `--td-accent-contrast`). Đổi `--td-accent` một
   mình **không** còn đổi nút primary hay `.td-glass-tint`.

2. **Nút success / danger / warning / info thành pastel** (chữ đậm trên nền nhạt). Site đặt `--td-btn-{v}-bg` riêng thì
   đặt kèm `--td-btn-{v}-hover` (và `-fg` nếu nền đậm, ví dụ `#fff`). Alias `-tint` của 0.20 vẫn chạy (hover tự đậm hơn),
   nhưng chữ giờ là màu đậm pastel → nền tint đậm thì đặt thêm `--td-btn-{v}-fg: #fff`.
3. **Tooltip đen.** Muốn chip sáng như 0.20: `--td-tooltip-bg` / `--td-tooltip-fg`.
4. **Toast đổi DOM:** không còn `.td-toast__icon`, không còn class `td-glass-surface` trên toast; có
   `.td-sr-only` tiền tố loại. Code / test / CSS của site bám vào icon toast phải bỏ. Màu toast:
   `--td-toast-{type}-bg/-fg/-border` (pastel đặc, không blur). `--td-toast-error-border` có tác dụng trở lại;
   `--td-toast-fg`, `-close-fg`, `-glass-bg`, `--td-toast-{type}-icon` hết tác dụng.
5. **Modal có animation** (260ms vào). Test E2E của site chờ modal mở cần chờ `data-state="open"` hoặc tắt bằng
   `--td-modal-enter-from: none` + `--td-modal-enter-dur: 0s` (từ 0.22.1 thêm `--td-modal-fade-dur: 0s`,
   `--td-modal-scrim-dur: 0s`; enter giờ là 300ms).
6. **Viền focus ô nhập nhạt hơn.** Site cần viền focus đậm như cũ: `--td-field-focus: var(--td-focus)`,
   `--td-field-focus-ring: var(--td-focus-ring)`.

---

## 0.20.0

**Đổi giao diện lớn — không đổi markup / class / API JS.** Liquid Glass giả bằng CSS được thay bằng "Minimal surfaces":
nền + một viền mảnh + một shadow mềm; chỉ popup nhỏ (menu, dropdown, gợi ý chip-input, hovercard, toast) còn blur 12px
trên nền 94%. Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.20.0.

1. **Nút đặc.** Không còn kính, bóng loáng, phát sáng, lún khi bấm. Màu primary vẫn theo `--td-accent`.
2. **Modal, tooltip, loading, scroll-top đặc** (không blur). Site từng tự ép modal / menu đặc (ví dụ override
   `--td-glass-bg-strong` thành gần 100%) có thể bỏ override cho modal; popup nhỏ muốn đặc hẳn thì đặt
   `--td-glass-bg-strong: var(--td-glass-solid)`.
3. **Toast trung tính**, màu trạng thái ở icon. `--td-toast-*-wash` / `--td-toast-error-border` hết tác dụng.
4. **Token kính cũ hết tác dụng** (vẫn khai báo, không lỗi). Đổi sang:

   | Token cũ | Thay bằng |
   |---|---|
   | `--td-btn-{primary,success,danger,info,warning}-tint` | `--td-btn-{…}-bg` (tên cũ vẫn chạy như alias tới bản lớn sau) |
   | `--td-btn-secondary-glass` | `--td-btn-secondary-bg` |
   | `--td-btn-secondary-edge` | `--td-btn-secondary-border` |
   | `--td-btn-*-alpha`, `--td-btn-*-film`, `--td-btn-sheen` | — (nút đặc) |
   | `--td-glass-edge`, `-side-edge`, `-bottom`, `-outline`, `-sheen`, `-glow*`, `-*-scale`, `-dim*`, `-tint*`, `-clear-edge`, `-clear-glyph-shadow` | — (bỏ hiệu ứng) |

5. **Site cần viền 3:1 cho nút secondary** (từng map `--td-control-border-soft` sang viền đậm): giờ đặt thêm
   `--td-btn-secondary-border`.
6. **Nút `color` tuỳ biến** hover luôn **đậm** hơn (trước có lúc sáng hơn khi chữ tối) — màu rất sáng + chữ tối thì
   kiểm lại tương phản khi hover.

---

## 0.19.0

**Đổi hành vi nhỏ + đổi giao diện nhỏ + bổ sung** (ARIA của nút, lý do lỗi / trạng thái chờ của dropzone, `accept-label`,
token font badge, `setDBValue('')`). Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.19.0.

1. **`<td-datetime-picker>` mặc định mở tại hôm nay** (kẹp vào `[min, max]`). 0.18.0 mở tại `min` khi năm của `min`
   trước 2000. Site cần mở ở đầu khoảng thì thêm `open-at="min"`:

   ```html
   <!-- trước (0.18.0): tự mở năm 1950 -->
   <td-datetime-picker min="1950-01-01"></td-datetime-picker>
   <!-- sau (0.19.0): giữ hành vi cũ -->
   <td-datetime-picker min="1950-01-01" open-at="min"></td-datetime-picker>
   ```

2. **`setDBValue('' | null | undefined)` giờ xoá giá trị** (trước bị bỏ qua). Code nào gọi `setDBValue('')` để "không
   làm gì" thì bỏ lời gọi đó.
3. **Badge `stamp` dùng font mono** (đổi giao diện, dấu hẹp hơn). Giữ sans:
   `:root { --td-badge-stamp-font-family: var(--td-font-sans); }`. Ghi đè màu `--td-badge-*-fg` / `-bg` → site tự kiểm
   tương phản.
4. **`<td-button>` chuyển `aria-pressed` / `aria-expanded` / `aria-haspopup` / `aria-controls` xuống control bên
   trong.** Site từng tự đặt các attribute này lên `querySelector('button')` bên trong thì bỏ code đó, đặt trên
   `<td-button>`.
5. **`<td-dropzone>` hiện `err.message` khi hook `upload` reject** — message phải an toàn để người dùng đọc (không lộ
   stack / chi tiết nội bộ). Không muốn hiện: reject với giá trị không có `message` chuỗi (ví dụ `reject()` hoặc `reject('lỗi')`) → nhãn chung. File chưa có tiến độ không còn
   `aria-valuenow="0"`.

---

## 0.18.0

**Đổi hành vi nhỏ + bổ sung** (progress, dropzone, alert, badge, chế độ ngày/tháng/năm, type month/datetime-local/time,
submitter name/value). Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.18.0.

1. **PHP `td_dropdown` `searchable`**: chuỗi `'false'` / `'0'` / `'off'` / `'no'` / `''` giờ **tắt** tìm kiếm (trước là
   bật do PHP coi chuỗi khác rỗng là true). Không truyền / `null` vẫn tự động (> 8 mục).
2. **`hasIcon()` / `tdIcon()` hiểu alias**: `hasIcon('pen')`, `hasIcon('external-link')`… giờ trả `true`. Code kiểu
   `if (!hasIcon(x)) registerIcons({ [x]: … })` với tên trùng alias sẽ không đăng ký nữa (icon đích được dùng); icon
   site đã đăng ký trùng tên alias vẫn thắng alias.
3. **`<td-button>` có `name` / `value`**: giờ được chuyển xuống `<button>` bên trong → nút submit gửi cặp `name=value`.
   Site từng đặt `name` trên `<td-button>` mà không muốn gửi thì gỡ attribute.
4. **`<td-datetime-picker>`**: attribute `value` / `setValue()` nhận thêm ISO (`2026-06-15T10:30`), trước bị `badInput`.
   Mode mặc định `datetime` và giá trị form `yyyy-mm-ddThh:mm:00` **không đổi**.
5. **`php/td.php`** chạy được trên PHP 8.0 (trước ghi ≥ 8.1).

Site phải sửa: chỉ khi dựa vào các hành vi cũ ở mục 1–4.

---

## 0.17.0

**Đổi hành vi nhỏ + nhiều bổ sung** (adapter PHP chính thức, ghost/link button, password meter, scroll-top…). Nguồn:
[CHANGELOG.md](../../CHANGELOG.md) 0.17.0.

1. **`td-dropdown.value` trả giá trị đang chọn** (giống `td-input-field.value` từ 0.16.0); gán `.value` = `setValue()`.
   Code đọc `.value` để lấy giá trị ban đầu phải đọc `getAttribute('value')`.
2. **`<td-dropdown>` chứa `<select>` con giờ được nâng cấp:** kit đọc các `<option>` thành `options`, lấy `name` /
   `required` / `disabled` từ select, rồi **gỡ** select (component submit thay). Trước 0.17.0 select con bị bỏ qua. Site
   từng tự đặt `<select>` bên trong làm fallback và tự gán `options` bằng JS: `options` gán bằng JS trước khi gắn vẫn
   thắng; nếu không muốn nâng cấp, đưa select ra ngoài host. `<select multiple>` không được nâng cấp (giữ native).
3. **Site đã tự viết adapter PHP** (ví dụ `135/src/Ui/*`): thay bằng `php/td.php` của kit — tên hàm và option tương
   thích; xem [Adapter PHP](../guides/php-adapter.md) mục chuyển từ adapter riêng. Khác biệt: `td_link` in `a.td-btn`
   dạng ghost (giữ kiểu cũ bằng `'class' => '…'`), `td_toggle` không có `value` mặc định (gửi `on`).

Site phải sửa: chỉ khi dựa vào các hành vi cũ ở mục 1–3.

---

## 0.16.0

**Đổi hành vi** (không đổi tên API nào). Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.16.0.

1. **`td-input-field.value` trả giá trị đang nhập.** Trước đây trả attribute `value` ban đầu (chỉ `getValue()` đúng).
   Code nào dựa vào `.value` = giá trị ban đầu phải đọc `getAttribute('value')`.

   ```js
   // trước (sai nhưng có người dựa vào): field.value === giá trị server render
   const initial = field.getAttribute('value'); // sau: đọc attribute nếu cần giá trị ban đầu
   const current = field.value;                // = field.getValue()
   ```

2. **`td-slider`**: `required` bị bỏ (range không bao giờ "trống"); `setValue(7)` với `step="5"` → `5` (snap như
   `<input type=range>`); không có `value` → giá trị là `min` (trước là `0` và báo lỗi underflow khi `min > 0`).
3. **`td-dropdown`**:
   - Gán lại `options` **giữ** lựa chọn hiện tại nếu giá trị còn trong danh sách mới; nếu không còn thì **bỏ**
     (trước: kéo về attribute `value`, hoặc — với `updateData()` — giữ và vẫn submit giá trị không còn tồn tại).
   - Có cả `onSelect` và `onChange` → **cả hai** chạy (`onSelect` trước). Trước đây `onChange` chặn `onSelect`; nếu
     bạn đặt cả hai mà chỉ muốn một, gỡ cái kia.
4. **`TdModal.confirm`**: `onConfirm` đồng bộ trả `false` hoặc throw → hộp thoại **giữ nguyên** (như `actions`).
   Trước đây vẫn đóng và resolve `true`.
5. **`TdDateTime.toAbsolute`**: chỉ thay cụm chữ **toàn token** (`DD/MM/YYYY`, `YYYYMMDD`…), không thay trong từ
   (`'Ngay DD thang MM'` giữ "Ngay", "thang"); `[…]` in nguyên văn. Timestamp `0` giờ là 01/01/1970 (trước: chuỗi rỗng).
   `toRelative` tương lai: `Trong N phút|giờ|ngày|tháng|năm` (dưới 1 phút vẫn `Vừa xong`).
6. **Token mặc định lên `:root`**: `--td-lb-*`, `--td-checkbox-box`, kích thước switch mặc định, `--td-spinner-size`,
   `--td-empty-state-pad/-gap`, `--td-pagination-item-size`. Override `:root` của site trước đây **không** ăn, giờ ăn —
   nếu site từng để sẵn các override này (vô tác dụng), kiểm tra lại hình. Trên màn cảm ứng, override
   `--td-pagination-item-size` / `--td-lb-btn` giờ thắng mức 44px kit ép trước đây.
7. **Dark theme**: nút primary + trang active theo `--td-accent` (qua `--td-accent-fill`). Site dark đã đổi
   `--td-accent` sẽ thấy nút primary đổi màu theo; muốn giữ #2563eb: `:root[data-td-theme="dark"] { --td-accent-fill: #2563eb; }`.

Bổ sung (không phá vỡ): nhãn/thông báo dịch được (`messages`/`labels` của input-field, slider, checkbox, toggle,
dropdown, pagination, empty-state, toast, loading, modal), `TdToast` handle `close()` + `TdToast.clear()`,
`TdLoading.wrap(fn, { message, maxDuration })`, `pattern`/`minlength` cho input-field, property gán sớm không mất.

Đóng gói: package không còn chứa test/stories; `engines.node >= 20`; `./icons` không còn export
`_validateIconDefinition` (hàm nội bộ).

Site phải sửa: chỉ khi dựa vào các hành vi cũ ở mục 1–7.

---

## 0.15.1

**Không có thay đổi phá vỡ.** Bản tài liệu + một sửa lỗi nhỏ.

- Tài liệu người dùng viết lại dạng hub-spoke (`docs/README.md`); tài liệu nội bộ chuyển vào `docs/internal/`. Link
  cũ `docs/components.md` → `docs/components/README.md` (mỗi component một trang), `docs/migration/class-map.md` →
  [class-map.md](class-map.md).
- Sửa: trigger video của lightbox dùng prefix `td` (đơn lẻ hoặc trong `[data-td-lightbox-group]`) giờ hiện con trỏ
  `pointer` như 0.15.0 đã định (trước đó một rule cũ vẫn ép `zoom-in`). Site nào đã tự thêm
  `[data-td-lightbox-type="video"] { cursor: pointer; }` để né lỗi có thể bỏ dòng đó.

Site phải sửa: không có.

---

## 0.15.0

**Không có thay đổi phá vỡ.** TdLightbox bổ sung API cho ngang bằng lightbox của dwp.

Bổ sung:

- Handle trả về từ `TdLightbox.open()` có thêm `setPanel(false | true | renderer)`, `refreshPanel()`,
  `addToolbarButton(spec)` (trả về đối tượng có `remove()`; cùng `id` thì thay thế) và `removeToolbarButton(id)`.
- `itemEl` / `groupEl` có trong ctx của hook panel / toolbar / download và trong `detail` của các sự kiện
  `td-lightbox-open`, `td-lightbox-change`, `td-lightbox-close`; `TdLightbox.open(items, { groupEl })`.
- `TdLightbox.bind(root, { attrPrefix: 'dwp' })` đọc markup `data-dwp-lightbox-*`; `filter(el, event)` trả `false`
  để bỏ qua một cú click.

Có thể khiến site nhìn khác:

- **Con trỏ trên trigger:** phần tử ảnh có `data-td-lightbox` / `data-td-lightbox-item` (và bản `data-dwp-…`) giờ có
  con trỏ `zoom-in`; trigger video (`data-…-lightbox-type="video"`) có con trỏ `pointer`. Chỉ áp dụng cho hai tiền
  tố dựng sẵn `td` và `dwp`; tiền tố khác qua `attrPrefix` không có con trỏ này. Muốn giữ con trỏ cũ, ghi đè trong
  CSS không layer của site:

  ```css
  [data-td-lightbox],
  [data-td-lightbox-item] {
    cursor: default;
  }
  ```

- **Vuốt bottom sheet trên điện thoại** dùng touch event thay vì Pointer Events (sửa lỗi bị `pointercancel` khi
  panel cuộn được). Không có API nào đổi.

Cần làm: không có gì bắt buộc.

## 0.14.4

**Đổi giao diện (nhỏ).** Dải chọn (band) của bánh xe giờ/phút trong `td-datetime-picker` trước chỉ có viền trên/dưới
nên hai đầu bo tròn trông như bị cắt. Giờ là viền 1px đủ 4 phía, tông mềm `--td-control-border-hover` qua token
`--td-dtp-band-border`.

Cần làm: không bắt buộc. Nếu site muốn dải chọn đậm như trước (viền trước đây dùng `--td-control-border-strong`):

```css
:root {
  --td-dtp-band-border: var(--td-control-border-strong);
}
```

## 0.14.3

**Đổi giao diện + gỡ một token.** "Sáng hơn, bớt xám" theo phản hồi của chủ dự án.

Thay đổi:

- **Nút secondary** thành kính trắng có viền rõ: token mới `--td-btn-secondary-glass` (trắng 80 %; dark 84 %) và
  viền `--td-btn-secondary-edge` (mặc định `--td-control-border-soft`).
  **Sửa lỗi:** trước đây `.td-btn:not(.td-btn--custom)` thắng `.td-btn--secondary` nên nút secondary luôn hiện màu
  xám đặc `#f0f0f2` thay vì kính. Nếu site đã quen với nút xám đó, sau bản này nó thành trắng.
- **Token `--td-glass-secondary-film` bị gỡ** (lớp phim xám 4 % của nút secondary). Override của site với token này
  không còn tác dụng.
- **Nút màu sáng hơn:** alpha tint 90 → 94 %, lớp phim làm tối 16–18 % → 6–13 % (vẫn ≥ 4.7:1 trên mọi nền trong
  contrast gate).
- **Bóng nâng nhẹ hơn:** token mới `--td-btn-lift`.
- **Nút disabled trông rõ là bị tắt:** nền `#f4f4f5`, chữ `#a1a1aa`, viền `#e4e4e7` (dark `#202024` / `#6b6b73`).
  Tương phản chữ disabled chỉ đảm bảo ≥ 2.2:1 (WCAG 1.4.3 / 1.4.11 miễn cho control không hoạt động).

Cần làm:

1. Tìm và bỏ `--td-glass-secondary-film` trong CSS của site. Muốn chỉnh nút secondary thì dùng token mới:

   ```css
   /* Trước (≤ 0.14.2) */
   :root {
     --td-glass-secondary-film: rgb(0 0 0 / 8%);
   }

   /* Sau (0.14.3+) */
   :root {
     --td-btn-secondary-glass: rgb(245 245 247 / 85%);
     --td-btn-secondary-edge: var(--td-control-border-strong);
   }
   ```

2. Nếu muốn giữ nút secondary xám đặc như trước (vốn là do lỗi):

   ```css
   :root {
     --td-btn-secondary-glass: #f0f0f2;
   }
   ```

3. Nếu site cần chữ disabled đậm hơn: ghi đè `--td-btn-disabled-bg`, `--td-btn-disabled-fg`,
   `--td-btn-disabled-border`.

## 0.14.2

**Đổi giao diện.** Viền khi hover của input-field, dropdown, datetime-picker, chip-input, checkbox chưa tích, toggle
đang tắt, và viền của option đang được chọn bằng bàn phím trong dropdown / chip-input giờ dùng
`--td-control-border-hover` (`#aeaeb2` light / `#636366` dark) thay cho gray-500 / gray-600. Nền highlight của
option giữ nguyên.

Cần làm: không bắt buộc. Site cần tương phản chặt (≥ 3:1 cả lúc nghỉ lẫn hover):

```css
:root {
  --td-control-border-soft: var(--td-control-border-strong);
  --td-control-border-hover: var(--td-control-border-strong);
}
```

## 0.14.1

**Đổi giao diện.** Viền lúc nghỉ của input-field, textarea, dropdown (trigger + ô tìm), datetime-picker, chip-input,
toggle và checkbox dùng `--td-control-border-soft` (`#d1d1d6` light / `#3a3a3c` dark) thay cho gray-500. Focus bằng
bàn phím vẫn có vòng focus.

Đánh đổi có chủ đích: viền lúc nghỉ chỉ khoảng 1.5:1, **dưới** mức 3:1 của WCAG 1.4.11.

Điều dễ bị bỏ sót: trước 0.14.1, site muốn đổi màu viền ô nhập thường ghi đè `--td-control-border-strong`. Từ 0.14.1
token đó **không còn là viền lúc nghỉ** (và từ 0.14.2 cũng không còn là viền hover) của các control trên. Override cũ
vẫn hợp lệ nhưng gần như không thấy tác dụng.

Cần làm:

```css
/* Trước (≤ 0.14.0): đổi viền ô nhập */
:root {
  --td-control-border-strong: #8a8f98;
}

/* Sau (0.14.1+): viền lúc nghỉ và hover là hai token riêng */
:root {
  --td-control-border-soft: #c7cad1;   /* lúc nghỉ */
  --td-control-border-hover: #8a8f98;  /* khi hover (0.14.2+) */
}

/* Hoặc: site cần viền 3:1 lúc nghỉ như trước */
:root {
  --td-control-border-soft: var(--td-control-border-strong);
}
```

## 0.14.0

**Đổi giao diện lớn + đổi hành vi.** "Liquid Glass thật": luật glass viết lại (v2), mọi giá trị đi qua contrast gate
render thật.

Đổi giao diện:

- **Chất liệu kính mỏng hơn:** nền kính 40 % / 52 % (light), 44 % / 60 % (dark) thay cho 72 % / 86 %; blur 16px +
  saturate + brightness, sheen 135°, viền hai tông, hairline ngoài tối, bóng sâu hơn. Tên token giữ nguyên
  (`--td-glass-bg`, `--td-glass-bg-strong`, …) nhưng **giá trị mặc định đổi**; site đã ghi đè các token này giữ giá
  trị của mình.
- **Nút là kính:** variant nổi bật (primary, success, danger, warning, info) = kính tint màu; secondary = kính trung
  tính. `warning` thành vàng hổ phách, chữ tối. Disabled dùng màu trạng thái đặc thay cho `opacity: .55`. Hover =
  quầng sáng bên ngoài (màu nền sau chữ không đổi); nhấn dùng `--td-glass-press-scale`. Nút trong bảng / vùng dày
  đặc / trên bề mặt kính giữ vẻ kính nhưng không tự blur. Màu tuỳ chỉnh (`color`) luôn được vẽ đặc.
- **Checkbox tròn** mặc định (`--td-checkbox-radius: 50%`; trước là 6px).
- **Toast là kính tint theo loại** (`--td-toast-glass-bg`, `--td-toast-{success|error|warning|info}-wash`,
  `--td-toast-{…}-icon`).
- **Kính phía trước thắng:** dropdown / menu / gợi ý chip-input / tooltip / hovercard mở trên modal giữ kính, còn
  dialog bị che chuyển sang đặc (trước: popover chuyển đặc).
- Nút X của modal và nút đóng toast dùng màu chữ của kính (xám nhạt cũ không đạt 3:1 trên kính).

Đổi hành vi:

- **Tooltip theo dwp:** có mũi tên, chữ 14px, **hiện khi chạm** (trước 0.14.0 bỏ qua chạm), hiện khi focus bất kỳ,
  **ẩn khi cuộn / resize / chạm chỗ khác** (0.9.0 định vị lại khi cuộn), hiệu ứng mờ dần. Chấp nhận alias của dwp:
  `data-dwp-tooltip`, `data-tooltip-pos`, `data-dwp-tooltip-pos`. Khi có cả hai cách viết, bản `data-tooltip` /
  `data-tooltip-position` thắng.
- **Hovercard** (mới) mở ngay chỉ khi focus bằng bàn phím (`:focus-visible`); click chuột đi qua hover-intent.
  Trigger `tabindex="-1"` được cho vào thứ tự Tab trong lúc bind.

Bổ sung: `TdMenu.define()`, `TdMenu.register()`, `TdMenu.has()`, `TdMenu.bindAll()`, `TdMenu.open(anchor, 'tên')`,
markup `data-td-menu="tên"`; `TdHovercard` (`@dazzxq/td-components/hovercard`).

Cần làm:

1. Mở các trang có nút, modal, toast, menu và xem lại bằng mắt. Nếu site không muốn kính (hoặc trình duyệt yếu):

   ```html
   <html lang="vi" data-td-glass="off">
   ```

2. Muốn checkbox vuông như trước:

   ```css
   :root {
     --td-checkbox-radius: 6px;
   }
   ```

3. **Trang dwp đang nạp script tooltip riêng của dwp:** từ 0.14.0 `td-tooltip` cũng nhận `data-dwp-tooltip`, nên
   nạp cả hai sẽ ra **hai tooltip chồng nhau**. Chỉ giữ một: bỏ script tooltip của dwp và để td xử lý (markup dwp
   chạy nguyên vẹn), hoặc không import `@dazzxq/td-components/tooltip` trên trang đó.
4. Site có code dựa vào "tooltip không hiện trên cảm ứng" hoặc "tooltip định vị lại khi cuộn": xem lại theo hành vi
   mới ([tooltip.md](../components/tooltip.md)).
5. Site đã tự vẽ nút bằng `.td-btn` trong markup server-side: không phải đổi class, nhưng nền phía sau nút giờ lộ qua
   lớp kính; kiểm tra nút đặt trên ảnh / nền nhiều màu.

## 0.13.0

**Không có thay đổi phá vỡ.** Chỉ bổ sung, tất cả là opt-in:

- `TdButton.run(asyncFn)` — nút ở trạng thái `loading` trong lúc chạy, gọi lại khi đang chạy dùng chung promise.
- `td-toggle` `commit(asyncFn, next?)` — lưu lạc quan, trạng thái pending (`aria-busy`, `.td-switch[data-pending]`),
  thất bại thì quay lại và phát `commit-error`.
- `td-input-field` thuộc tính `autoresize` cho textarea.

Cần làm: không có.

## 0.12.0

**Đổi hành vi (nhỏ).** Ba component mới: `TdMenu` (`./menu`), `<td-chip-input>` (`./chip-input`),
`TdFormValidation` (`./form-validation`).

Thay đổi có thể ảnh hưởng:

- Thông báo lỗi ràng buộc (constraint message, `validationMessage`) của `td-checkbox`, `td-toggle`, `td-slider` giờ
  là **tiếng Việt** (trước là tiếng Anh), ví dụ toggle bắt buộc: `Please turn this on.` → `Vui lòng bật tùy chọn này.`
- `td-dropdown` dùng chung bộ type-ahead mới (`utils/typeahead.js`).

Cần làm: nếu test của site so khớp chuỗi thông báo tiếng Anh, đổi sang so khớp trạng thái thay vì chuỗi:

```js
// Trước
expect(toggle.validationMessage).toBe('Please turn this on.');

// Sau: kiểm tra trạng thái, không phụ thuộc ngôn ngữ
expect(toggle.validity.valueMissing).toBe(true);
```

## 0.11.0

**Phá vỡ.** Kit không còn cần Tailwind.

- **Peer dependency `tailwindcss` bị gỡ.** Site chỉ cần `td.css`. Site vẫn dùng Tailwind cho giao diện riêng vẫn chạy
  bình thường (`td.css` nằm trong `@layer td.*` và component tự đặt font / line-height / box-sizing / viền).
- `td-sample` (`./sample`) in markup BEM `.td-sample` với nút `.td-btn` thay vì class Tailwind (attribute và sự kiện
  `count-change` giữ nguyên).

Cần làm:

1. Site **tự dùng** Tailwind: đảm bảo `tailwindcss` nằm trong `dependencies` / `devDependencies` của chính site.
   npm 7+ tự cài peer dependency, nên có site chỉ có Tailwind "nhờ" kit; sau 0.11.0 gói đó biến mất.

   ```bash
   npm install -D tailwindcss@^4
   ```

2. Bỏ dòng `@source` trỏ vào kit trong CSS Tailwind của site (không còn class Tailwind nào trong kit để quét):

   ```css
   /* Trước (≤ 0.10) */
   @import "tailwindcss";
   @source "../node_modules/@dazzxq/td-components/src";

   /* Sau (0.11.0+) */
   @import "tailwindcss";
   ```

3. Tải `td.css` nếu chưa (bắt buộc từ 0.7.0).
4. Site có CSS / test dựa vào markup Tailwind của `td-sample`: đổi theo [class-map.md](class-map.md#td-sample).

## 0.10.0

**Phá vỡ + đổi hành vi.** Đợt migrate cuối: `td-datetime-picker` và `td-table` chuyển sang token-native. Từ bản này
mọi component chỉ cần `td.css`.

Phá vỡ:

- Class nội bộ đổi sang BEM: `.td-dtp-wheel-*` → `.td-dtp-wheel__*`, thân modal của picker → `.td-dtp-panel__*`,
  `.td-table-*` → `.td-table__*`. Xem [class-map.md](class-map.md#td-datetime-picker) và
  [class-map.md](class-map.md#td-table).
- `src/utils/adopt-styles.js` bị xoá (chưa bao giờ là export công khai; ai import thẳng file này sẽ lỗi).

Đổi hành vi — datetime-picker:

- Trigger là `button[role=combobox][aria-haspopup=dialog]` (trước là `input[readonly]`).
- **Escape đóng dialog** và bỏ thay đổi (TdModal `escapeCloses`), giống nút X và "Đóng".
- Giờ / phút được kiểm tra (không còn 25:99).
- **`getValue()` / `getDBValue()` trả `''`** khi rỗng, sai định dạng hoặc ngoài `min`/`max` (trước trả thời điểm
  "bây giờ").
- Phút làm tròn xuống theo `minute-step` khi mở dialog; `setDBValue()` bỏ qua giá trị rác và nhận thêm ISO-local.

Đổi hành vi — table:

- Sort / phân trang / data / loading cập nhật tại chỗ (giữ focus).
- `zebra="false"` giờ tắt được sọc (trước luôn bật).
- **Server mode giữ trang hiện tại** khi `data` đổi (trước quay về trang 1) và **bắt buộc `total-items`**; thiếu thì
  ẩn cả hai thanh phân trang và in cảnh báo.
- Trang bị kẹp trong khoảng hợp lệ; `render` được gọi theo **chỉ số cột** với `(row, rowIdxInPage)` và có thể trả về
  Node; mặc định `empty-text` là "Chưa có dữ liệu để hiển thị."

Cần làm:

1. Đổi selector CSS theo [class-map.md](class-map.md).
2. Code gọi `getValue()` để lấy "bây giờ" khi picker rỗng phải tự xử lý chuỗi rỗng:

   ```js
   // Trước (≤ 0.9): picker rỗng vẫn trả thời điểm hiện tại
   const when = picker.getDBValue();

   // Sau (0.10.0+)
   const when = picker.getDBValue();
   if (!when) {
     picker.setError('Vui lòng chọn ngày giờ.');
     return;
   }
   ```

3. Bảng server mode phải có `total-items`:

   ```html
   <!-- Trước -->
   <td-table server-mode></td-table>

   <!-- Sau -->
   <td-table server-mode total-items="0"></td-table>
   ```

   ```js
   table.onPageChange = async (page) => {
     const res = await fetch(`/api/posts?page=${page}`).then((r) => r.json());
     table.setAttribute('total-items', String(res.total));
     table.data = res.rows; // server mode: giữ nguyên trang hiện tại
   };
   ```

4. Cột có `render` dùng tham số thứ hai hoặc dựa vào `key` để tìm cột: kiểm tra lại với chữ ký
   `render(row, rowIdxInPage)`.
5. Test bấm Escape để giữ picker mở: hành vi đã đổi.

## 0.9.0

**Phá vỡ + đổi hành vi.** Lớp nổi (floating layer): `TdModal` / `TdModalStackManager`, `TdToast`, `TdTooltip`,
`td-dropdown` chuyển sang token-native.

Phá vỡ:

- Class nội bộ đổi sang BEM: `.td-modal-*` → `.td-modal__*`, `.toast-item` → `.td-toast`,
  `.td-tooltip-content` → `.td-tooltip__content` (mũi tên cũ bị bỏ), `.td-dropdown-*` → `.td-dropdown__*`. Xem
  [class-map.md](class-map.md).
- **z-index lấy từ token:** modal `--td-z-modal` 400, menu dropdown `--td-z-popover` 450 (trước 10010), toast
  `--td-z-toast` 500 (trước 99999), tooltip `--td-z-tooltip` 510 (mới). Header / chat widget cố định của site có
  z-index lớn hơn sẽ **đè lên modal và toast**.
- `TdModalStackManager.BASE_Z_INDEX` (`@dazzxq/td-components/modal-stack`) giờ mặc định `null`; đặt số vào sẽ vẫn
  chạy nhưng in cảnh báo deprecated. `TdToast.TOAST_Z_INDEX_BASE` là 500, `TdToast.getToastZIndex()` trả giá trị token
  (cả hai deprecated).
- **`TdToast.getTheme(type)` trả `{ type, icon }`** (trước trả class Tailwind + chuỗi SVG).

Đổi hành vi:

- **Một chủ bàn phím cho mọi lớp nổi:** Escape chỉ tới lớp trên cùng; Tab bị giữ trong lớp chặn trên cùng. Overlay
  loading giữ focus.
- **Modal:** `role=dialog` + `aria-modal`; focus luôn vào trong dialog khi mở (`autoFocus: false` giờ focus chính
  dialog thay vì không focus gì; `focusTarget` chỉ dùng nếu nằm trong dialog) và trả về phần tử mở **trước** khi gọi
  `onClose`; trang phía sau `inert`; chỉ phần thân cuộn (bỏ giới hạn 60/70 vh); `onConfirm` trả promise giữ dialog
  mở tới khi promise xong; `onClose(value)` nhận `value` của nút footer. Vẫn không đóng bằng Escape / bấm nền.
- **Toast:** kính + icon trạng thái (không còn nền màu đặc); mọi toast có nút đóng; hẹn giờ tạm dừng khi hover / focus
  / tab bị ẩn.
- **Tooltip:** `role=tooltip` + `aria-describedby`; mở khi focus bàn phím; hover được; Escape tắt; xử lý `title` theo
  chính sách đặt tên (có thể chuyển `title` thành `aria-label`); `data-tooltip-text-color` chỉ có tác dụng khi có
  `data-tooltip-color`. (Hành vi chạm và cuộn đổi tiếp ở 0.14.0.)
- **Dropdown:** combobox APG — option **không còn là điểm dừng Tab** (dùng `aria-activedescendant`), type-ahead, Tab
  đóng menu, click ngoài đóng ở `pointerdown`, **đúng một** sự kiện `change` mỗi lần chọn, `open()` không làm gì khi
  disabled.

Cần làm:

1. Đổi selector CSS theo [class-map.md](class-map.md). Các component này bắt buộc có `td.css`.
2. Nếu header cố định của site có z-index cao, ghi đè **cả bộ** token và giữ đúng thứ tự
   (lightbox < modal < popover < loading < toast < tooltip):

   ```css
   /* Trước (≤ 0.8): toast 99999 luôn nằm trên header z-index 1000 */

   /* Sau (0.9.0+) */
   :root {
     --td-z-lightbox: 1350;
     --td-z-modal: 1400;
     --td-z-popover: 1450;
     --td-z-loading: 1480;
     --td-z-toast: 1500;
     --td-z-tooltip: 1510;
   }
   ```

3. Bỏ `TdModalStackManager.BASE_Z_INDEX = …` trong code site, dùng token `--td-z-modal` ở trên.
4. Code dùng `TdToast.getTheme()`:

   ```js
   // Trước (≤ 0.8): { bg: 'bg-green-500/85', hover: 'hover:bg-green-500/90', icon: '<path …>' }
   // Sau:
   const { type, icon } = TdToast.getTheme('success');
   ```

5. Code dựa vào `autoFocus: false` để "không focus gì" hoặc test Tab đi qua từng option của dropdown: cập nhật theo
   hành vi mới.
6. Test đếm số sự kiện `change` của dropdown: giờ đúng một lần mỗi lần chọn.

## 0.8.0

**Phá vỡ + đổi hành vi.** `td-input-field`, `td-slider`, `td-pagination`, `td-tabs`, `td-empty-state` chuyển sang
token-native.

Phá vỡ:

- Class nội bộ đổi sang BEM: `.td-input*` → `.td-field*`, `.td-slider-*` → `.td-slider__*`,
  `.td-pagination-*` → `.td-pagination__*`, `.td-tab-btn` → `.td-tabs__tab`, `.td-empty-*` → `.td-empty-state__*`.
  Xem [class-map.md](class-map.md). Các component này bắt buộc có `td.css`.

Đổi hành vi:

- **Một sự kiện mỗi loại** cho input-field và slider: `input` / `change` gốc của control bên trong **không còn nổi
  bọt** lên; chỉ còn CustomEvent của host với `detail: { value }`. `change` của input-field chỉ phát khi giá trị khác
  lúc focus.
- **Tabs:** vai trò APG, roving tabindex; ← → Home End chỉ **di chuyển focus**, **Enter / Space mới chọn** (kích hoạt
  thủ công). Muốn mũi tên chọn luôn: `activation="auto"`. Tên mặc định của tablist là "Các thẻ".
- **Pagination:** số trang là `<button>` (`aria-current`); `max-pages` giờ là **kích thước cửa sổ** số trang liên tiếp
  (trước chỉ là ngưỡng — lỗi), kẹp tối đa 25; trang hiện tại là viên màu accent đặc (trước là chữ đỏ).
- **Input-field:** lỗi và helper hiện cùng lúc; reset form xoá lỗi; nhãn luôn được gắn (`field-id` giữ nguyên, nếu
  không thì `{host-id}-control`).
- **Slider:** màu mặc định là token accent; `track-color` giờ có tác dụng; chỉ vẽ vạch khi ≤ 50 bước.
- **Empty-state:** `icon` dạng chuỗi `<svg>` thô bị deprecated và được kiểm tra chặt; tên icon không tồn tại → `inbox`
  + cảnh báo; `actions` vẽ nút `.td-btn`.

Cần làm:

1. Đổi selector CSS theo [class-map.md](class-map.md).
2. Listener gắn vào control bên trong phải chuyển lên host:

   ```js
   // Trước (≤ 0.7): nghe sự kiện gốc từ <input> bên trong
   field.querySelector('input').addEventListener('input', (e) => preview(e.target.value));

   // Sau (0.8.0+): nghe trên host, đọc detail
   field.addEventListener('input', (e) => preview(e.detail.value));
   ```

3. Muốn tabs đổi ngay khi bấm mũi tên như trước:

   ```html
   <td-tabs activation="auto"></td-tabs>
   ```

4. Kiểm tra `max-pages` của pagination: giá trị giờ là số nút trang liên tiếp hiển thị (mặc định 5).
5. `td-empty-state` đang truyền `icon="<svg …>"`: chuyển sang tên icon trong registry hoặc property `iconNode`:

   ```js
   // Trước
   empty.setAttribute('icon', svgMarkupString);  // chuỗi SVG thô (kiểu cũ, không còn được khuyến khích)

   // Sau
   empty.setAttribute('icon', 'inbox');          // tên trong registry
   // hoặc
   empty.iconNode = mySvgElement;                 // SVGElement do site tự dựng (tin cậy)
   ```

## 0.7.0

**Phá vỡ + đổi hành vi.** `td-button`, `td-checkbox`, `td-toggle`, `TdLoading` chuyển sang token-native — lần đầu
component **cần `td.css`**.

Phá vỡ:

- **Bốn component này bắt buộc tải `td.css`**; thiếu thì chúng mất style.
- Class nội bộ đổi sang BEM (xem [class-map.md](class-map.md)).
- **Custom property `--td-cb-color` của `td-checkbox` đổi thành `--td-checkbox-color`.**

Đổi hành vi:

- **Một sự kiện `change`** cho checkbox / toggle (`change` / `input` gốc của input bên trong không còn nổi bọt).
- **`td-toggle`** là `<input type="checkbox" role="switch">` gốc; **Enter không còn bật/tắt** (chỉ Space, theo APG).
- **`td-button` loading** giữ focus: dùng `aria-busy` + `aria-disabled` + chặn click, **không** đặt `disabled` gốc
  lên `<button>` bên trong nữa.
- `td-button` thuộc tính `icon` nhận tên icon trong registry; giá trị khác (ví dụ class Font Awesome) là đường cũ,
  deprecated.
- Màu mặc định: checkbox dùng accent (trước `#2196F3`); toggle bật `#16a34a` (trước `#4ADE80`).
- **`TdLoading.wrap()` đếm tham chiếu**; overlay `role="status"`, giữ focus, làm trang `inert`, khoá cuộn; z-index
  `--td-z-loading: 480` (trước 99999, giờ nằm dưới toast).
- (Giao diện nút ở bản này là màu đặc; tới 0.14.0 nút lại thành kính.)

Cần làm:

1. Tải `td.css` một lần cho cả site:

   ```js
   // Vite / bundler
   import '@dazzxq/td-components/td.css';
   ```

   ```html
   <!-- PHP / HTML -->
   <link rel="stylesheet" href="/vendor/td-components-0.15.0/td.css">
   ```

2. Đổi custom property của checkbox (hoặc dùng thuộc tính `color`):

   ```css
   /* Trước */
   td-checkbox.brand { --td-cb-color: #e11d48; }

   /* Sau */
   td-checkbox.brand { --td-checkbox-color: #e11d48; }
   ```

   ```html
   <td-checkbox color="#e11d48" label="Đồng ý"></td-checkbox>
   ```

3. Code kiểm tra `button.disabled` để biết nút đang loading: đổi sang `aria-busy`:

   ```js
   // Trước
   const busy = tdButton.querySelector('button').disabled;

   // Sau
   const busy = tdButton.querySelector('button').getAttribute('aria-busy') === 'true';
   ```

4. Nút dùng icon Font Awesome: đổi sang tên icon trong registry (`close`, `check`, `plus`, `download`, `search`, …;
   danh sách ở [icons.md](../components/icons.md)):

   ```html
   <!-- Trước -->
   <td-button icon="fa fa-download" label="Tải về"></td-button>

   <!-- Sau -->
   <td-button icon="download" label="Tải về"></td-button>
   ```

5. Test / phím tắt dựa vào Enter để bật toggle: dùng Space.

## 0.6.0

**Không có thay đổi phá vỡ.** Thêm `TdLightbox` (`@dazzxq/td-components/lightbox`) — component token-native đầu
tiên — và icon registry (`@dazzxq/td-components/icons`, `<td-icon>` qua `./icon-element`, `icons.json`). Component
có sẵn không đổi.

Cần làm: không có. Muốn dùng lightbox thì phải tải `td.css`.

## 0.5.0

**Không có thay đổi phá vỡ.** Ra mắt `td.css` (export `@dazzxq/td-components/td.css`): token `--td-*`, thứ tự layer
`@layer td.tokens, td.component, td.utilities`, dark theme opt-in `<html data-td-theme="dark">`, recipe kính
`.td-glass-surface` và công tắc `<html data-td-glass="off">`. Component cũ (Tailwind) không đổi giao diện.

Cần làm: không có. Tải `td.css` từ bản này là bước chuẩn bị tốt cho 0.7.0.

## 0.4.1

**Đổi hành vi (sửa lỗi).** Không gỡ API nào.

- `TdToast`: không còn treo tab ở toast thứ 6; toast thành công / thông tin / cảnh báo là `role="status"`, chỉ lỗi là
  `role="alert"` (trước mọi toast là `alert`).
- `TdModal` đóng ngay trong khung hình mở không còn rò focus trap; `TdModal.closeAll()` gỡ mọi listener focus trap.
- **Khoá cuộn của modal chuyển từ `<body>` sang `<html>`** (khoá dùng chung, đếm tham chiếu, trả lại đúng giá trị cũ).
  Trước đó modal ghi `document.body.style.overflow = 'hidden'` / `''`.
- `td-input-field`: lỗi và helper là hai trạng thái riêng; `setError('')` không còn xoá helper; viền đỏ giữ qua
  focus / blur; control bên trong có `aria-invalid="true"` khi lỗi.
- `td-dropdown`: menu mở về phía còn nhiều chỗ, kẹp trong viewport, đóng khi trigger bị khuất; đóng khi focus đang ở
  trong menu thì focus về trigger.

Cần làm:

- Code / CSS của site kiểm tra `body.style.overflow === 'hidden'` để biết modal đang mở: đổi cách kiểm tra (ví dụ
  kiểm tra có phần tử `.td-modal` đang hiện), vì khoá giờ đặt trên `<html>`.
- Test tìm `[role="alert"]` cho toast thành công: đổi sang `[role="status"]`.

## 0.4.0

**Đổi hành vi.** Không đổi tên attribute / property / event nào.

- **Modal không còn đóng khi bấm nền (backdrop)** — có chủ đích để tránh đóng nhầm (ADR 0006). Modal chỉ đóng bằng
  nút X, nút footer, hoặc bằng code (`closeById` / `closeAll`). `closable: false` giờ chỉ ẩn nút X.
- **`td-dropdown` `searchable` và `allow-clear` giờ tắt được.** Trước đây kiểm tra nội bộ luôn trả `true`, nên
  `searchable="false"` không có tác dụng. Mặc định vẫn BẬT; tắt bằng `"false"` / `"0"` / `"off"` hoặc
  `el.searchable = false`. Site nào đã (vô tình) viết `searchable="false"` sẽ thấy ô tìm kiếm biến mất.
- `TdModal.confirm()` (và `success` / `error` / `info`) luôn resolve đúng một lần: xác nhận → `true`; huỷ / X /
  `closeAll()` → `false` (trước đó đóng bằng X làm promise treo mãi).
- Bổ sung: `td-input-field type="date"`, `role="switch"` cho toggle, export `@dazzxq/td-components/dom-utils`.

Cần làm:

1. Nếu UX của site cần đóng modal khi bấm ra ngoài: không còn hỗ trợ; thêm nút đóng rõ ràng trong footer.
2. Tìm `searchable="false"` / `allow-clear="false"` trong markup và quyết định có thật muốn tắt không.
3. Code `await TdModal.confirm(...)` từng phải tự đặt timeout vì sợ treo: có thể bỏ.

---

## Trước 0.4 (tham khảo)

Chi tiết trong [CHANGELOG.md](../../CHANGELOG.md):

- **0.3.0** — CSP-strict: bỏ `style="…"` inline, dùng CSSOM + `adoptedStyleSheets` (cơ chế này bị gỡ ở 0.10.0).
- **0.2.0** — `td-toggle` mặc định **không controlled** (tự bật/tắt; thêm `controlled` để giữ cách cũ); control bên
  trong `td-input-field` không còn mang `name` (form gửi qua `name` của host).

## Xem thêm

- [README.md](README.md) — quy trình nâng cấp, rollback, checklist.
- [class-map.md](class-map.md) — class cũ → class BEM hiện tại.
- [theming.md](../customization/theming.md) — token `--td-*` và cách ghi đè.
- [accessibility.md](../guides/accessibility.md) — lý do của các đánh đổi tương phản (viền mềm, nút disabled).
