# ADR 0029 — `td-repeater` đọc / ghi giá trị field `data-td-field` và khoá `disabled` / `readonly`

Trạng thái: chấp nhận (2026-10-07). Nguồn: plan [v0.56.0-repeater-icons-date](../plans/v0.56.0-repeater-icons-date.md)
R1–R11 (owner duyệt phạm vi; Codex plan-review APPROVE vòng 2; quyết định release lead Q2 / Q3 / Q5 / Q6 / Q7). Nới quyết
định 7 của plan [v0.30.0](../plans/v0.30.0-number-repeater.md) ("kit không đọc / ghi `name` / `form` / `value` trong dòng").
(Plan ghi "ADR 0028" — số 0028 đã dùng cho v0.55, ADR này lấy 0029.)

## Bối cảnh

Đến 0.55, `<td-repeater>` chỉ quản lý **cấu trúc** (thêm / xoá / sắp) và phát `rows-change` để app đặt tên — không có API
dữ liệu, nên mỗi màn sửa (sản phẩm có "Hộp gồm", gói bảo hành…) tự viết vòng đọc DOM / dựng dòng. Cũng không có trạng thái
khoá: `<fieldset disabled>` tổ tiên tắt nút native nhưng kéo thả `sortable` vẫn chạy (controller chỉ hỏi `sortable`), và
màn "xem" (readonly) để lại nút chết.

## Quyết định

1. **Khoá field = `data-td-field="key"`**, không bao giờ suy từ `name` / `data-name` (mỗi app một sơ đồ tên). Field thuộc
   dòng **gần nhất** (`closest('[data-td-row]')`), nên repeater lồng nhau không lẫn; repeater con mang `data-td-field` là
   một field có giá trị mảng.
2. **`value` = `Array<Record<string, FieldValue>>`**, đọc / ghi theo **loại phần tử** (text / select / multiple / một
   checkbox → boolean / nhóm checkbox → mảng / nhóm radio → value | null / custom element có `checked` boolean →
   boolean / custom element khác → `.value`); `input[type=file]` bỏ qua. Object dựng bằng `Object.fromEntries`. Hook theo
   instance `readRow(row, read)` / `writeRow(row, data, write)` (tham số cuối = mặc định, gọi để giữ phần còn lại).
3. **Setter tái dùng dòng theo vị trí**, kẹp `min-rows` / `max-rows`, trần `MAX_VALUE_ROWS = 1000` khi không có `max-rows`,
   **một** `rows-change` `reason: 'set'` `source: 'api'` (giá trị enum mới, luôn phát). Không bao giờ ghi `name` / `form`:
   công thức đặt tên của app vẫn là nguồn duy nhất của FormData. Gán trước nâng cấp → áp lúc gắn, chỉ `init`.
4. **Hai nguồn khoá tách biệt.** Khoá của host (`disabled` thắng `readonly`) là nguồn **duy nhất ghi thuộc tính**, và kit
   chỉ gỡ đúng thứ nó đã đặt (bảng sở hữu `WeakMap<Element, Set<attr>>`; field app tự `disabled` giữ nguyên). Khoá của
   fieldset tính lười theo luật HTML (`fieldset[disabled]` tổ tiên, trừ `<legend>` con đầu) và **không ghi gì** — trình
   duyệt đã tắt nút / field natively. Chặn tương tác = một trong hai; API (`addRow` / `removeRow` / `moveRow` / `value`)
   vẫn chạy như code với input native.
5. **`disabled` = như `<fieldset disabled>`**: nút kit + mọi control form trong dòng (`input` / `select` / `textarea` /
   `button` / custom element form-associated hoặc quan sát `disabled`) nhận `disabled`, host `aria-disabled="true"`; không
   dùng `inert` (không chặn gửi form). **`readonly`** = khoá cấu trúc (nút kit `hidden`) + field **có năng lực** — dò từ
   loại input / `observedAttributes` của class (`readonly`, td-toggle `locked`), không danh sách tag; field không có năng lực
   (select, checkbox, radio…) **không** giả lập: một cảnh báo liệt kê tag + hook tĩnh `TdRepeater.lockField(el, mode)`.
6. **Phạm vi:** khoá áp khi đổi thuộc tính và ở mọi lần vẽ lại dòng (thêm / `sync` / `set`); field chèn **vào trong** dòng
   đã có sau khi khoá không được theo dõi (tắt / bật lại thuộc tính). Chỉ có hiệu lực sau nâng cấp — server khoá từ đầu
   bằng `<fieldset disabled>` hoặc thuộc tính trên field.

## Hệ quả

- Ranh giới v0.30 đổi có kiểm soát: kit ghi giá trị và thuộc tính khoá của field app, **chỉ** trong hai trường hợp trên và
  luôn hoàn tác được; `name` / `form` vẫn ngoài tầm.
- Form dirty (v0.44): setter / khoá từ code không bẩn khi chưa tương tác; bật `disabled` **sau** khi người dùng đã sửa làm
  field rời FormData → bẩn (y như `<fieldset disabled>`) — docs khuyên `readonly` khi khoá lúc lưu.
- Breaking (nhỏ): `rows-change` có thể mang `reason: 'set'`; app `switch (reason)` không có nhánh mặc định cần thêm.
