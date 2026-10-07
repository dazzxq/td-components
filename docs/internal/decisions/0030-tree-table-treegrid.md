# ADR 0030 — `td-table` chế độ cây: treegrid chỉ khi `tree`, focus theo dòng, kit không sửa dữ liệu

Trạng thái: chấp nhận (2026-10-07). Nguồn: plan [v0.57.0-tree-table](../plans/v0.57.0-tree-table.md) QĐ 1–18 (Codex
duyệt vòng 3, `gpt-5.6-sol` + `high`); yêu cầu dsuite (danh mục cần cột "Thao tác" + toggle trạng thái mỗi dòng — không
dùng được `td-tree`). **Sửa đổi một phần [ADR 0018](0018-table-row-selection.md) §1** (chỉ cho chế độ cây). Kéo thả
(QĐ 19–22 của plan) là hợp đồng giữ chỗ cho v0.58.0 — ADR này sẽ được bổ sung khi đó.

## Bối cảnh

Danh sách quản trị có cấp bậc (danh mục, phòng ban, menu) cần mọi thứ của `td-table` trên từng dòng — cột, `render`,
`actions`, chọn dòng, sort, phân trang, card — cộng với mở / đóng nhánh, tải con chậm và đổi cha. `td-tree` (ADR 0010
đời v0.29) là control **chọn giá trị**: nút `{ value, label }`, không cột, không thao tác mỗi dòng. ADR 0018 §1 từ chối
APG `grid` cho bảng (mô hình phím theo ô xung đột với nội dung tự do trong ô và với card). Nhưng `role="table"` không cho
`aria-level` / `aria-expanded` / `aria-setsize` / `aria-posinset` trên `row`, nên người dùng trình đọc màn hình mất cấp
bậc — đúng thứ cần sửa. Bốn câu hỏi: ngữ nghĩa, mô hình phím, ai sở hữu thứ tự / cha sau khi đổi, và hình dữ liệu.

## Quyết định

1. **`role="treegrid"` chỉ khi `tree`** (+ `rowKey`). Bảng không `tree` giữ `role="table"`, DOM giống từng byte v0.54
   (snapshot trong test). Khi `tree`: `tr[role=row]` có `aria-level` / `aria-setsize` / `aria-posinset` (theo nhóm anh em
   đã biết; gốc khi phân trang: vị trí toàn cục + tổng số gốc), `aria-expanded` **chỉ** ở dòng có con, `aria-busy` khi tải
   con; ô `gridcell`. Dòng đóng không nằm trong DOM (không `aria-owns`). Không `aria-selected` / `aria-multiselectable`
   (chọn qua ô tick như ADR 0018 — tránh đọc trùng). Card chỉ đổi `display`: role tường minh giữ cây trợ năng (đo:
   Chromium AX tree có `level` / `expanded` ở cả bảng và card; Firefox / WebKit mức DOM — `test/engines/tree-table-a11y`).
2. **Focus theo dòng, không theo ô** (mô hình "row focus" của APG treegrid). Thân bảng là **một** điểm Tab: roving
   `tabindex` trên `tr` (↓ ↑ Home End, → mở / tới con đầu, ← đóng / về cha, `*` mở anh em, Space chọn, Enter để cho app;
   RTL đảo ← →). Control trong dòng (ô tick, thao tác, `render` của app) vẫn dùng được: control của **dòng không hoạt
   động** tạm `tabindex=-1` (giá trị gốc nhớ trong `WeakMap`, trả lại cho dòng hoạt động); `focusin` vào control của dòng
   khác ⇒ dòng đó hoạt động; `MutationObserver` trên `tbody` áp lại khi control của app tự vẽ lại (`td-toggle` vẽ lại
   input khi `checked` đổi — spike M0). Rò điểm Tab chỉ thêm một điểm dừng, không bao giờ kẹt. Lý do không theo ô: chính
   lý do của ADR 0018 §1 (nội dung tự do, card) vẫn đúng; theo dòng giữ được cấp bậc mà không bắt app vào mô hình ô.
3. **Nút mở / đóng là `button` thật có tên, không phải điểm Tab** ("Mở / Thu gọn {tên dòng}", không `aria-expanded` —
   trạng thái ở `tr`). Khác `td-tree` (`span aria-hidden`): người dùng VoiceOver / TalkBack trên điện thoại kích hoạt bằng
   chạm đúp vào **phần tử**; dòng bảng không có hành động nên nút ẩn = không mở được nhánh. Hệ quả đo được: tên dòng
   (tính từ nội dung) có thêm chữ của nút ("Thu gọn Áo Áo …") — chấp nhận, ô vẫn đọc gọn.
4. **Kit không bao giờ sửa dữ liệu của app.** Một mô hình thuần `table-tree-model.js` (test node) dựng cây từ `data`
   **lồng** (`children-key`) hoặc **phẳng** (`parent-key`; mồ côi / vòng lặp → gốc + cảnh báo); khoá trùng → lá. Thứ tự /
   cha sau `moveRow()` chỉ sống trong mô hình (`getTree()`); `data` trả lại đúng mảng app đặt; `data` mới dựng lại từ
   đầu (app đã lưu thì `data` mới đã đúng). Tra cứu theo khoá đi thẳng tới **nút sở hữu** của mô hình — không bao giờ
   đánh chỉ số `data` bằng chỉ số của cây.
5. **Trạng thái mở theo khoá, sống lâu** (`expandedKeys`, như lựa chọn — ADR 0018 §3); API im lặng, `expanded-change`
   chỉ cho người dùng. **Phân trang theo gốc** (mở nhánh không đẩy dòng sang trang khác). **Sort trong nhóm anh em.**
6. **Vẽ tăng dần**: mở / đóng / tải xong / `moveRow` giữ node của các dòng còn lại (focus, trạng thái của app), chỉ vẽ +
   `render` dòng mới (và dòng đổi cấp / cha); sort / trang / `data` vẽ lại cả trang như cũ. Menu "Thao tác" của card đọc
   dòng **sống** (lúc mở + lúc chọn) — áp cho cả bảng phẳng (trước đây chỉ số bị đóng băng lúc vẽ).
7. **`moveRow(key, parentKey, index)`** — `index` = vị trí **cuối cùng** sau khi gỡ nguồn; cùng chỗ = no-op; bị từ chối
   (`canDrop`, `max-depth`, vòng, cha chưa tải) ⇒ `false`, không đổi gì. Server mode giữ **độ lệch số gốc cục bộ** tới khi
   app gửi `data` / `total-items` mới. Đây là đường áp thay đổi chung mà kéo thả v0.58 sẽ dùng lại.

## Hệ quả

- Bảng cây có **ít điểm Tab hơn** bảng phẳng (một cho thân bảng + control của một dòng) — ghi docs; test tự động duyệt
  bằng Tab của site phải đổi theo.
- Tham số thứ ba của `render` (`ctx = { level, parentKey, hasChildren, expanded }`) chỉ ở chế độ cây; bảng phẳng gọi
  `render(row, rowIndex)` như cũ.
- Không PHP / SSR (như ADR 0018): bảng luôn do JS render.
- Không chọn cascade, không ảo hoá, không lọc trong cây (lọc giữ tổ tiên là việc server của app).
