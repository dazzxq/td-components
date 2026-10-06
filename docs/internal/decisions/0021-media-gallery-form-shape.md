# ADR 0021 — Gallery ảnh: element riêng, hai dạng FormData, fail closed không bao giờ "xoá hết"

- Trạng thái: Accepted 2026-10-05 (v0.43.0, plan [v0.43.0-media-gallery.md](../plans/v0.43.0-media-gallery.md) — QĐ 1, 8,
  14, 15, 15b, 19; owner O1 / O2)
- Liên quan: [ADR 0013](0013-media-picker-boundary.md) (danh tính = `assetId`, FormData của media field là API công khai),
  [ADR 0012](0012-ssr-hydration.md) (SSR + hydrate tại chỗ), [ADR 0015](0015-td-cropper.md) (crop chỉ là toạ độ),
  [ADR 0019](0019-touch-standard.md) (cảm ứng)

## Bối cảnh

dsuite cần gallery sản phẩm (`media_usages(asset_id, role=gallery, position, alt_text, crop_json, focal_point_json)`:
alt / crop / focal theo **từng chỗ dùng**, vị trí = thứ tự, ảnh bìa = ảnh đầu). Kit đã có `<td-media-field>` (một ảnh,
FormData công khai từ 0.32) và `SortableController` dùng chung (0.31). Ba câu hỏi phải chốt vì chúng là **hợp đồng với
server** — đổi sau là phá site:

1. thêm `multiple` vào field hay element mới;
2. hình dạng FormData (danh sách, rỗng, "không gửi");
3. làm gì khi dữ liệu vào không hợp lệ hoặc vượt `max`.

## Quyết định

### 1. Element riêng `<td-media-gallery>` (+ PHP `td_media_gallery()`, hợp đồng SSR `media-gallery@1`)

Không thêm `multiple` vào `<td-media-field>`: hợp đồng của field là **một giá trị** (`value: string`, sáu attribute đơn
trị), và 1264 dòng state machine của field cho một ảnh sẽ thêm một chiều ở mọi nhánh. Gallery giữ **hợp đồng** của field
(cùng bộ khoá `id` / `alt` / `crop` / `focal`, cùng JSON v1, cùng tên attribute `usage` / `croppable` / `crop-ratio` /
`focal-point` / `accept-kind` / `aspect-ratio`, cùng cổng URL, cùng adapter resolve) nhưng là element khác, contract SSR
khác. Gallery không lồng `td-media-grid` / `td-sortable`: dùng thẳng `SortableController` (host = `ul` của nó), như
`td-repeater[sortable]`. Lưới cố định (không justified).

### 2. Hai dạng FormData + `name=` cho rỗng

| Dạng | Có ảnh (i = 0…n−1, theo thứ tự hiển thị) | Rỗng |
|---|---|---|
| Reference (mặc định) | `name[]=<id>` | **một** `name=` |
| Usage | `name[i][id]`, `name[i][alt]`, `name[i][crop]` (+ `name[i][focal]`), đúng thứ tự khoá | `name=` |

Ba trạng thái phía server: **không có key** = giữ nguyên (disabled / fail closed / vượt `max`); `name` là **chuỗi rỗng** =
đã gỡ hết; `name` là **mảng** = danh sách mới thay toàn bộ. Index tường minh `[i]` vì PHP gom `name[][id]` theo từng khoá
con sẽ sai nhóm; `name[]` cho reference vì là idiom quen thuộc và cùng nghĩa với `name=<id>` của field. Không dùng một
hidden JSON (phải `json_decode` có giới hạn ở mọi site, không validate được bằng rule Laravel, lệch với field). `name`
kết thúc `[]` → fail closed (gallery tự nối `[]` / `[i]`).

### 3. Fail closed không bao giờ thành "xoá hết"; vượt `max` không gửi gì

- `items` sai JSON / > 256 KiB / > 100 / id thiếu, trùng, không phải chuỗi, > 512 — hoặc `name` sai → trạng thái lỗi,
  khoá thao tác, **không mục FormData nào**, không state khôi phục (một state rỗng khôi phục lại sẽ gửi `name=`). Coi dữ
  liệu hỏng là rỗng rồi gửi `name=` sẽ âm thầm xoá gallery thật.
- Vượt `max` (≤ 100, server in thừa hoặc site hạ `max` lúc chạy): mọi ảnh **giữ và hiện**, `rangeOverflow`, nhưng
  **không gửi mục nào** (JS: `setFormValue(null)`; PHP no-JS: không control nào có `name`). Lý do: validity chỉ chặn submit
  khi form được validate — `novalidate`, `form.submit()`, `requestSubmit` từ code bỏ qua nó; hợp đồng phải an toàn ngay ở
  tầng dữ liệu. Gỡ về ≤ `max` → FormData bật lại.

### 4. Một đường validate cho mọi lối vào

`validateItems(list, { max })` (`src/utils/media-field-model.js`) = `td__media_gallery_items()` (PHP), chung bảng
`GALLERY_CASES`. PHP đổi id `int` → chuỗi thập phân **trước** (0 → `"0"`); mọi kiểu khác lỗi; JS chỉ nhận chuỗi.
Xử lý theo lối vào: attribute → fail closed (cấu trúc) / áp + QĐ 3 (vượt `max`); khôi phục form → bỏ state hỏng, giữ
state hiện tại; `value =` / `setSelection()` → **từ chối, không đổi gì** (API không bao giờ tự tạo overflow); picker →
bỏ id sai / trùng (thông báo), chỉ lấy phần vừa đủ.

### 5. Trần cứng

100 ảnh (`TdMediaGallery.MAX_ITEMS` = `max` mặc định; 100 × 4 = 400 biến < `max_input_vars` 1000 của PHP), `items` ≤ 256
KiB, id ≤ 512, alt 500 (cắt theo code point), crop ≤ 512, focal ≤ 128, 4 `adapter.get` song song. Caption theo ảnh: không
có ở 0.43 (owner O1) — thêm sau bằng opt-in `caption` → `name[i][caption]`, additive.

## Hệ quả

- Server đọc theo **kiểu** (chuỗi rỗng vs mảng vs vắng). Docs (`components/media-gallery.md`) có mẫu Laravel / PHP thuần;
  server vẫn phải tự kiểm `count ≤ max` của nó, `distinct`, quyền với mọi id (một `whereIn`), ghi theo vị trí trong
  transaction. `[0]` chỉ là ảnh bìa theo quy ước, không phải quyền.
- Field không đổi một byte (luồng lấy nguồn cắt của gallery là bản riêng gọn: thế hệ nguồn chung + identity `li` + id —
  tách `_cropSource` của field sẽ đụng provenance của nó; xem kết quả M0 của plan).
- Hai element dùng chung model (`media-field-model.js`) và CSS token; một site có thể dùng cả hai trong một form.

## Phụ lục v0.51.0 (2026-10-06) — chú thích theo ảnh + giới hạn độ dài mềm

Plan [v0.51.0-gallery-caption](../plans/v0.51.0-gallery-caption.md) (QĐ 1–23, Codex plan-review r1–r3). Additive: không ADR
mới, không đổi version hình dạng form, hợp đồng SSR vẫn `media-gallery@1` (markup không bật tính năng mới giống từng byte
0.50, nên markup 0.43–0.50 vẫn được nhận tại chỗ).

- **`name[i][caption]`** ngay sau `[alt]`, **chỉ dạng usage** (opt-in `caption`; thiếu `usage` → bỏ + cảnh báo). Hai chế
  độ, cùng tên field: `line` (mặc định, ô một dòng, xuống dòng → một dấu cách) và `multiline` (textarea, giữ `\n`).
- **Ba trạng thái của khoá con** (chốt với dsuite), cùng tinh thần "vắng = giữ" của §2: hàng **không có** `[caption]` =
  **giữ** chú thích đang lưu; `[caption]=` = null; chữ = lưu. Kit tắt `caption` → không bao giờ gửi khoá; bật → luôn gửi
  (kể cả rỗng). Lệch phiên bản PHP / JS vì thế không xoá chú thích.
- **Giới hạn mềm** (`alt-maxlength` 1…500, `caption-maxlength` 1…1000; đếm code point sau trim ECMAScript, JS ≡ PHP) =
  validity `customError` + lỗi inline, **không cắt**, FormData vẫn gửi đủ (server 422). Khác vượt `max` (§3): gửi một
  phần danh sách làm mất ảnh, còn gửi đủ chữ quá dài thì server chỉ từ chối.
- **Trần cứng chú thích 1000 code point** (cắt, như alt 500), giữ trần `items` / state 256 KiB.
- State khôi phục: bật `caption` → mọi item có khoá `caption` (kể cả `""` — chữ đã xoá không hồi sinh); tắt → đúng byte
  0.50.
