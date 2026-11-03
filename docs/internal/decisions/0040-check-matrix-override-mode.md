# ADR 0040 — `td-check-matrix mode="override"`: ô ba trạng thái là `button`, FormData đủ tập `_v=2`, SSR `check-matrix@2` không nhận tại chỗ (bổ sung ADR 0022)

Trạng thái: **chấp nhận** — 2026-11-03 (v0.95.0). Plan [v0.95.0-check-matrix](../plans/v0.95.0-check-matrix.md) (Codex
plan APPROVE); owner chốt 2026-11-03 Q1 + Q2 ("bấm xoay vòng kế thừa → cấp → cấm"), các câu còn lại theo đề xuất
(plan §15). Số ADR do phiên chính gán lúc gộp lô (lane media-picker-bulk cũng thêm ADR).
Liên quan: [ADR 0022](0022-check-matrix-grid-form-shape.md) (form shape hai trạng thái — **không sửa**), [ADR 0017](0017-shared-check-mark.md)
(mark ✓ dùng chung), [ADR 0019](0019-touch-standard.md) (cảm ứng), [ADR 0025](0025-pre-upgrade-parity.md) (trước khi JS tải).

## Bối cảnh

dcms2 (màn phân quyền người dùng, `require_once php/td.php`) cần mỗi ô có **ba** trạng thái: *kế thừa* (theo vai trò),
*cấp quyền*, *từ chối*, cộng ô khoá và nút "đặt lại về kế thừa". Hôm nay dcms2 chỉ có cột override boolean + ma trận chỉ
đọc: "kế thừa" bị suy ra, không gửi được "từ chối". `<td-check-matrix>` (ADR 0022) chỉ có tick / không tick, FormData
`name[col][]=row` + `_v=1`, SSR `check-matrix@1` nhận tại chỗ.

## Quyết định

1. **Opt-in `mode="override"`** (attribute + property phản chiếu; PHP `'mode' => 'override'`). Vắng / `check` → chế độ cũ
   **không đổi một byte** (markup JS + PHP, FormData `_v=1`, marker `@1`, event `{added, removed}`) — bằng chứng là test
   cũ không đổi. Giá trị lạ → `check` + một cảnh báo (JS `console.warn` một lần mỗi instance, PHP `E_USER_WARNING` chỉ in
   độ dài + giá trị đã làm sạch).
2. **Model riêng** `OverrideState` (cạnh `MatrixState`, không chạm đường hai trạng thái). `validateMatrix(data, mode)` dùng
   chung cột / hàng / nhóm / `cells` / trần; chỉ nhánh `value` (`{cột: {hàng: 'inherit'|'grant'|'deny'}}`, so khớp chặt;
   lỗi mới `value-shape` / `value-state` / `value-na`) và cờ ô `inherited` (gợi ý hiển thị, không bao giờ gửi) là khác.
3. **Đổi `mode` sau khi có dữ liệu → bỏ dữ liệu** (trạng thái rỗng, không mục FormData) + cảnh báo. Không đoán chuyển đổi
   giữa hai hình dạng `value`: "không key" = server giữ nguyên (fail-safe như ADR 0022 §4).
4. **FormData đủ tập**: marker `name[col]=''` mỗi cột (đầu) → `name[col][row]=inherit|grant|deny` **mọi ô áp dụng được**,
   kể cả ô khoá (đúng một lần) và ô kế thừa → `name[_v]=2` (cuối). JS và form không JS giống từng byte (nguyên tắc ADR
   0022); `_v` là phiên bản định dạng như ADR 0022 §3 đã hẹn. Marker chuỗi rồi khoá con có tên được test PHP `parse_str`
   thật chứng minh (`cat.view` giữ nguyên, `"12"` thành int → recipe ép `(string)`).
5. **Ô (JS) là `<button type="button">`** trong `gridcell`, tên = hàng + cột + chữ trạng thái (ba id, không từ dữ liệu),
   một node mô tả phím chung `{h}-keys`; bấm / Space / Enter = trạng thái kế, Shift+Space = trạng thái trước, `+`/`=` cấp,
   `-` từ chối, Delete / Backspace / `0` về kế thừa. Đúng **một** bước và **một** `change` mỗi thao tác (không click thứ hai
   ở keyup). Không `aria-checked="mixed"`, không `aria-pressed`.
6. **Form không JS = một `<select>` native mỗi ô**; ô khoá: `<select disabled>` + hidden mang trạng thái.
7. **SSR `check-matrix@2` không nhận tại chỗ**: cổng so từng node như `@1`; khớp → đọc giá trị `<select>` của ô không khoá
   (enum chặt) rồi render JS một lần, giữ focus; lệch (marker, `mode`, `v`, option lạ, attribute lạ…) → render từ `data`,
   không lấy giá trị nào từ markup. Hai chế độ hai marker; `mode` của host, marker và `"v"` của `data` phải khớp.
8. **Ô khoá giữ trạng thái và luôn gửi**; không đổi qua ô / hàng loạt / nút đặt lại / phím / chạm / chế độ hẹp.
9. **Ô hàng loạt** giữ: tập đồng nhất (ô không khoá) → trạng thái kế, lẫn lộn → kế thừa; hết ô không khoá → `disabled`; ô
   hàng loạt đang ẩn (chế độ hẹp) không bao giờ tác động. **Nút "Đặt lại về kế thừa"** luôn hiện ở override: lưới = cả
   bảng, chế độ hẹp = cột đang hiện; không hỏi xác nhận; `disabled` khi không còn gì để đặt lại.
10. **Event** `change` override: `{changes: [[hàng, cột, từ, thành]…], trigger}`; thêm `trigger` `inherit` (nút đặt lại).
11. **Hình**: kế thừa = ô viền (✓ mờ khi app báo "có quyền"), cấp = ô đặc + ✓, từ chối = ô đặc đỏ + ✕ (hình khác, không chỉ
    màu); token mới `--td-check-matrix-grant-bg` / `-deny-bg` / `-deny-fg` / `-inherit-mark` / `-inherit-edge`; forced-colors vẽ viền thật.

## Phương án bị loại

- **`role=checkbox` / `aria-checked` true / false / mixed**: `mixed` = "chọn một phần" của checkbox cha (trình đọc đọc "half
  checked"), sai nghĩa "kế thừa"; lưới đã dùng `mixed` cho ô hàng loạt; checkbox native không tự về `indeterminate`.
- **`aria-pressed` ba giá trị**: cùng lý do.
- **Radio group ba nút mỗi ô**: 30 000 input ở 10 000 ô, mũi tên đụng điều hướng lưới, ba nút không đủ 44px.
- **`<select>` mỗi ô ở chế độ JS**: nặng ở 10 000 ô, đổi trạng thái luôn hai thao tác, ↑↓ đổi giá trị trên Windows → chỉ
  dùng cho form không JS.
- **Chỉ gửi ô override** (bỏ `inherit`): `<select>` không JS luôn gửi giá trị → hai cách viết cùng nghĩa, server hai cách
  đọc (trái ADR 0022).
- **Hai danh sách `name[col][grant][]` / `name[col][deny][]`**: một hàng có thể nằm ở cả hai → thêm một loại mâu thuẫn
  server phải kiểm; map khoá hàng thì mâu thuẫn không biểu diễn được.
- **Nhận SSR `@2` tại chỗ**: `<select>` và `<button>` là hai node khác nhau → phải viết đường hydrate thứ hai.

## Hệ quả

- \+ Chế độ check giữ nguyên từng byte; trang hai trạng thái đang chạy không mất "nhận tại chỗ".
- \+ Server một cách đọc mỗi chế độ, `_v` phân biệt định dạng; thiếu hàng / giá trị lạ → 422, không bao giờ "xoá hết".
- − Số biến POST = số ô áp dụng được + số cột + 1, **luôn luôn** (không phụ thuộc số ô override): lưới lớn bắt buộc tăng
  `max_input_vars` và kiểm `_v === '2'`.
- − SSR override render lại một lần sau khi JS tải (không nhận tại chỗ).
- − Không có vai ARIA chuẩn cho ba trạng thái: bù bằng chữ trạng thái trong tên, mô tả phím, live region; kiểm tay
  VoiceOver / NVDA trước phát hành.
- Không helper PHP đọc POST (chỉ recipe trong docs, như ADR 0022); làm nếu dcms2 xin.
