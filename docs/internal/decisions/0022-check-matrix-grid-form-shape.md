# ADR 0022 — `td-check-matrix`: `role=grid` + checkbox native, FormData đủ tập nhóm theo cột + marker + sentinel `_v`, fail closed không bao giờ "xoá hết"

Trạng thái: chấp nhận (2026-10-06). Nguồn: plan [v0.47.0-check-matrix](../plans/v0.47.0-check-matrix.md) QĐ 1–32 (Codex
plan-review APPROVE vòng 3; owner uỷ quyền 6 câu hỏi theo mặc định); yêu cầu dsuite #18. Số ADR có thể đổi khi merge
(0021 = gallery v0.43).

## Bối cảnh

dsuite cần sửa quyền theo vai trò: ~100 quyền `module.resource.action` × 10 vai trò, chọn cả hàng / cột / nhóm, nhóm thu
gọn, ô khoá ("không gán được quyền mình không có", "không tự sửa role của chính mình") và ghi chú. Server so trạng thái
gửi lên với trạng thái hiện tại ("trường không có quyền sửa → 403"). PHP site phải chạy không JS. Bốn câu hỏi:

1. Ngữ nghĩa và bàn phím: `role=table` + checkbox như chọn dòng của bảng (ADR 0018), hay APG `grid`?
2. Hình dạng FormData: đủ tập hay phần thay đổi? Nhóm theo hàng hay theo cột? Cột rỗng gửi gì?
3. `max_input_vars` của PHP (mặc định 1 000) cắt im lặng form 2 400 ô — mục bị cắt = quyền bị thu hồi.
4. Dữ liệu sai thì sao — bỏ hàng sai hay từ chối cả lưới?

## Quyết định

1. **`<table role="grid">`, mỗi ô áp dụng được là một `<input type=checkbox>` native, một tab stop (roving tabindex), phím
   APG grid.** 2 400 checkbox là 2 400 tab stop nếu giữ `role=table`; trình đọc màn hình không chuyển focus mode cho roving
   trên bảng thường. Lý do ADR 0018 né grid (ô có link / nút / `render` tự do, dạng card) **không áp dụng**: mọi ô ở đây là
   đúng một checkbox hoặc trống. Checkbox native (không `button[role=checkbox]`) vì chế độ không JS bắt buộc là input native
   và hydrate tại chỗ (ADR 0012) cần cùng node; input không tên ở chế độ JS chấp nhận được (`defaultChecked` luôn = mặc định
   của model, nên `form.reset()` native và `formResetCallback` cho cùng kết quả). Header thuần chữ, ô "chọn cả hàng / cột"
   là ô riêng; nhóm là hàng thường có nút disclosure (`aria-expanded` + `aria-controls` = `tbody` của nhóm), **không**
   `treegrid`. Ô khoá / n/a / nhãn tới được bằng phím (focus vào `td` / `th`). Id từ id host + chỉ số, không từ dữ liệu.
2. **FormData đủ tập, nhóm theo cột:** `name[col]=''` mọi cột (đầu tiên, thứ tự cột), `name[col][]=row` mỗi ô đang tick
   **gồm ô khoá-tick** (đúng một lần; theo hàng rồi cột), `name[_v]=1` cuối cùng. PHP đọc ra ba trạng thái: mảng = danh sách
   thay thế, `''` = cột rỗng, không có key = không đụng. Đủ tập thì idempotent và khớp form không JS (checkbox native vốn gửi
   đủ tập); diff phía client sai khi trang cũ / hai tab / gửi lại. Theo cột vì cột là trục ngắn (≤ 32 marker) và khớp
   `role_permissions` lưu theo role. Marker luôn đứng trước (mẹo hidden input trước checkbox: mục mảng đến sau ghi đè chuỗi
   rỗng — đo trên PHP 8.5); JS gửi **y hệt từng byte** để server chỉ có một cách đọc. Chỉ cam kết parser PHP.
3. **Sentinel `name[_v]=1` cuối cùng** — mục bị `max_input_vars` cắt trước tiên. Server bắt buộc từ chối (422) khi thiếu
   `_v` và gỡ `_v` trước khi validate; `_v` cũng là phiên bản định dạng. Test PHP chứng minh `max_input_vars` nhỏ làm mất
   `_v`.
4. **Một đường validate, fail closed toàn bộ, không bao giờ thành "xoá hết".** Lỗi cấu trúc (khoá sai / trùng, trần,
   nhóm lồng, `value` lạ / tick ô n/a, `cells` sai schema, `name` rỗng hoặc kết thúc `[]`) → trạng thái lỗi, mọi control
   khoá, **không mục FormData nào** (server thấy không có key → giữ nguyên). Không bao giờ bỏ riêng một hàng (hàng vắng =
   thu hồi ở mọi cột). JS `validateMatrix()` và PHP `td__check_matrix_data()` chạy chung bảng `MATRIX_CASES`.
5. **SSR:** `td_check_matrix()` luôn in element + form không JS đầy đủ (marker, checkbox có tên, hidden sau ô khoá-tick,
   sentinel) + attribute `data` (JSON chuẩn hoá) — nguồn duy nhất của cổng hydrate và của reset. Cổng so **từng node** với
   markup kỳ vọng sinh từ `data` (`renderMatrix({ ssr })`, cùng hàm render của JS; test PHP chứng minh giống từng byte); lệch
   → không lấy giá trị nào từ markup.

## Hệ quả

- (+) Một định dạng cho JS, PHP không JS và PHP → hydrate; server có một cách đọc, chống cắt im lặng, chống "xoá hết".
- (+) Ô khoá-tick gửi đúng như hiện có → server kiểu "403 khi đổi trường không có quyền" không báo nhầm.
- (−) Server **phải** kiểm + gỡ `_v` và tăng `max_input_vars`; quên gỡ → validate `perms.*` lỗi ngay lần lưu đầu (lộ ra, không
  im lặng). Rails / Node đọc thủ công.
- (−) `form.elements` dài thêm ~2 400 input không tên (không ảnh hưởng FormData / validity).
- (−) Trùng dữ liệu SSR (`data` + markup ≈ 2 lần kích thước) là giá của hydrate an toàn.
- (−) Không lọc hàng có sẵn trong v0.47: app tự lọc bằng cách bỏ hàng = thu hồi (docs "lỗi thường gặp").
