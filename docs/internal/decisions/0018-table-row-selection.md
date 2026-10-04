# ADR 0018 — `td-table` chọn dòng: bảng tĩnh + một checkbox mỗi dòng, danh tính theo khoá, form-associated opt-in

Trạng thái: chấp nhận (2026-10-05). Nguồn: plan [v0.37.0-table-row-selection](../plans/v0.37.0-table-row-selection.md)
QĐ 1–30 (Codex duyệt vòng 2); yêu cầu dsuite #5 (P1).

## Bối cảnh

dsuite (media, danh sách sản phẩm, máy IMEI), 135 và dwp cần chọn nhiều dòng của `td-table` để thao tác hàng loạt:
checkbox mỗi dòng, chọn cả trang, Shift chọn dải, event khi lựa chọn đổi, giữ lựa chọn khi đổi trang. dcms2 không có
tính năng này (chỉ một hộp thư tự viết "chọn trang" không ba trạng thái). Có bốn câu hỏi kiến trúc:

1. Ngữ nghĩa: giữ `role="table"` hay chuyển APG `grid`?
2. Danh tính dòng: theo chỉ số hay theo khoá? Kiểu khoá?
3. Lựa chọn sống bao lâu (trang, sort, `data` mới)? Ai sở hữu "chọn tất cả kết quả trên server"?
4. Gửi form: site PHP tự đồng bộ `<input hidden>` hay bảng tự vào form?

## Quyết định

1. **Bảng tĩnh + một control mỗi dòng, không grid.** `role="table"` giữ nguyên (cả dạng card, ADR 0014). Grid buộc mô
   hình phím theo ô (roving tabindex qua mọi ô, mũi tên, Enter / F2 vào nội dung) xung đột với link / nút / `render` tự do
   của site và với card. Mỗi dòng: `button.td-table__select[type=button][role=checkbox][aria-checked]` chứa mark dùng
   chung `.td-check` (ADR 0017; trạng thái đọc từ `aria-checked` / `:disabled` — không thêm selector vào `check.css`).
   **Không `aria-selected` trên `tr`** (vô nghĩa trong `table`); `tr[data-selected]` chỉ cho CSS. `single` cũng là
   checkbox (độc quyền) — **không bao giờ `role="radio"`** (radio ngoài `radiogroup`, thiếu phím mũi tên = ARIA sai —
   review R1-1). Không `<input>` native (một input không tên trong form của site vẫn là control form) và không lồng
   `<td-checkbox>` (rò FormData — ADR 0017). Header (`multiple`): checkbox ba trạng thái "Chọn tất cả trên trang", tính
   trên các dòng chọn được của **trang hiện tại**.
2. **Danh tính = `String(key)`**, khoá từ `rowKey` (tên trường hoặc hàm). Hợp lệ: chuỗi khác rỗng, số hữu hạn, `bigint`;
   `1` và `"1"` là một dòng (API hay trả lẫn kiểu); giá trị **gốc** lần đầu thấy được giữ trong `Map` và trả lại (bài
   học `rowIdKey` của dcms2). Thiếu `rowKey` → không có cột chọn (fail closed: chọn theo chỉ số là đúng loại lỗi phải
   tránh). Khoá sai / trùng / `rowKey` ném → dòng đó không chọn được. Khoá không in ra DOM (dòng ↔ khoá qua
   `data-row-idx`). Mô hình thuần `src/utils/key-selection.js` (nội bộ, test node), hai tầng: **người dùng** (bấm,
   Shift dải, header) chịu `max-selected`; **API** (`selectedKeys`, `select` / `deselect` / `toggle` / `clearSelection`,
   kể cả `{ emit: true }`) không bao giờ đọc trần — app là nguồn quyền (review R1-2). Không gộp với `td-media-grid`
   (lưới theo DOM, khác vòng đời; YAGNI — xem lại khi có consumer thứ ba).
3. **Lựa chọn sống qua** trang, sort, `data` (client lẫn server), `columns`, `loading`; bảng không tự bỏ khoá không còn
   trong `data` (không phân biệt "lọc ẩn" với "đã xoá") — app gọi `deselect` / `clearSelection`. Event `select-change`
   (cùng từ vựng với `td-media-grid`) **chỉ** khi người dùng đổi (hoặc API `{ emit: true }`). "Chọn tất cả N kết quả trên
   server", thanh thao tác hàng loạt và đồng bộ URL là **của app** (công thức trong docs + demo, không slot / component).
4. **Form-associated opt-in trên phần tử hiển thị.** `TdTable` khai báo `static formAssociated = true` +
   `attachInternals()` nhưng **không** thành `TdFormElement` (không `value`, validation, `required`). Có `name` →
   `setFormValue(FormData)` một mục mỗi khoá (`String(key)`, thứ tự chọn, gồm khoá trang khác) như `td-chip-input` /
   `td-tree`; không `name` → không gửi. `formResetCallback` bỏ hết + một `select-change` `trigger: 'reset'` (lệch có chủ
   đích so với input native, để thanh hàng loạt không lệch); `formDisabledCallback` khoá control; `formStateRestoreCallback`
   không làm gì (dữ liệu chưa chắc đã tải lại). Đây là **ngoại lệ có lý do** so với "chỉ `TdFormElement` vào form"
   (ADR 0003): site PHP (135, dwp) gửi form "xoá hàng loạt" qua nhiều trang mà không phải tự đồng bộ input ẩn — đúng
   loại lỗi kit phải gánh; chi phí ≈ 40 dòng. Server **luôn** kiểm quyền từng khoá.

## Hệ quả

- `td-table` xuất hiện trong `form.elements`, nhận `<fieldset disabled>` và attribute `disabled`. **Đo được (Chromium,
  Firefox, WebKit):** host form-associated bị khoá thì trình duyệt **không phát cú bấm chuột** vào mọi phần tử bên trong
  (sort, phân trang, nút thao tác) — phím thì tuỳ engine. Trong `<fieldset disabled>` các nút native vốn đã bị khoá nên
  không khác; `disabled` trên chính `td-table` (trước đây vô nghĩa) giờ làm cả bảng trơ với chuột. Ghi ở docs +
  breaking-changes § 0.37.0; chỉ muốn khoá việc chọn → `rowSelectable = () => false`.
- Cột chọn không thuộc `columns` (không `data-col`, không CSSOM cột, không `cellPaddingClass`) → tương thích với ẩn /
  hiện cột sau này. Code dựa chỉ số ô (`children[ci]`) đã sửa thành có độ lệch.
- Card: ô chọn mang `.td-table__card-select` (`order: 0` đã chừa ở v0.34) → `[chọn][lead][primary]`; header là chip đầu
  thanh sắp xếp. Token mới `--td-table-select-w`, `--td-table-row-selected`, `--td-table-card-selected-border` (contrast
  gate).
- Không PHP / SSR: bảng luôn do JS render; ảnh hưởng PHP duy nhất là phía nhận form.
