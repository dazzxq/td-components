# ADR 0042 — Modal / drawer với UI ngoài mở chồng, kính opt-in, `compat/td-wp-admin.css`

Trạng thái: **chấp nhận** — 2026-11-04 (v0.96.0). Plan [v0.96.0-modal-wp](../plans/v0.96.0-modal-wp.md).
Liên quan: [ADR 0011](0011-minimal-surfaces.md) (minimal surfaces), [ADR 0008](0008-drop-tailwind-token-css.md) (`@layer`).

## Bối cảnh

dwp mở `wp.media` (trình chọn ảnh của WordPress) từ một nút trong `TdModal` / `td-drawer`. wp.media gắn khung của nó thẳng vào
`<body>`; lớp chặn của kit làm mọi con của `<body>` ngoài dialog thành `inert`, bẫy Tab và nuốt Escape → wp.media hiện ra
nhưng không bấm, không gõ được. Cùng đợt: trang muốn dialog / panel kính mờ (luật minimal surfaces để chúng đặc), và CSS
wp-admin (unlayered) đè control của kit (nằm trong `@layer td.*`, luôn thua CSS unlayered).

## Quyết định

1. **UI ngoài do site khai báo, không heuristic** (`src/utils/external-overlay.js`): `registerExternalOverlay(selector |
   Element | (el) => boolean)` → hàm gỡ (idempotent, đếm tham chiếu), và attribute `data-td-external-overlay`. Chỉ xét
   **con trực tiếp của `<body>`** (UI lồng sâu: đăng ký khung ngoài cùng).
2. Một UI ngoài **đang hiện** (`hidden` / `display` / `visibility` / không có rect = không hiện) và **nằm trên** lớp chặn trên
   cùng (so `z-index` tính toán của con trực tiếp của `<body>`; bằng nhau → đứng sau trong DOM thắng; con `z-index: auto` lấy
   `z-index` lớn nhất của các con trực tiếp của nó — trường hợp khung bọc của wp.media) thì:
   `inert-lock` bỏ qua nó; `layers` không bẫy Tab, bỏ qua Escape hoàn toàn (không `preventDefault`, không `beforeClose`);
   bấm nền modal / drawer không đóng. Khi nó hết ở trên mà focus đã mất (về `<body>` / ra ngoài mọi lớp), focus quay về
   phần tử cuối cùng có focus trong lớp trên cùng (không có thì chính dialog).
3. Đồng bộ lại bằng một `MutationObserver` (childList của `<body>` + `style` / `class` / `hidden` / attribute khai báo trên
   con của `<body>`), notify gộp microtask, chỉ chạy khi có lease / bàn phím đăng ký; không khai báo gì → fast path, hành vi
   như 0.95.0.
4. Kit **không** đổi gì trên UI ngoài (không class / style / `aria-hidden` / `inert` ngược) và **giữ** scrim của mình khi
   wp.media mở (hai lớp nền tối — owner chọn, Q3).
5. **Kính opt-in**: `TdModal.show({ surface: 'glass' })`, `TdDrawer.open({ surface })` / attribute `surface="glass"` → class
   `td-modal--glass` / `td-drawer-root--glass`; nền `--td-{modal|drawer}-glass-bg` (mặc định `--td-glass-bg-strong` 94 %) +
   `--td-{modal|drawer}-glass-blur` (mặc định `--td-glass-blur` 12px), specificity 0,3,0 thắng nhóm đặc 0,2,0, fallback đục qua
   `--_td-glass-fill` / `--_td-glass-filter` (không `backdrop-filter`, giảm trong suốt, `data-td-glass="off"`, tăng tương
   phản, forced colors). Dialog Promise luôn đặc. Mặc định không đổi.
6. **`compat/td-wp-admin.css`** ship nguyên source ở gốc package (không `dist/`, không trong `td.css`): rule **unlayered**,
   selector `.td-*` lặp `:is()` ba lần (0,3,0), giá trị duy nhất `revert-layer` → rơi về giá trị của `td.component` (không
   chép giá trị td). Không `!important`, `@import`, `url(`, `@layer`. `padding: 0 !important` của wp trên checkbox / radio
   **chấp nhận rò** (input của kit đều ẩn, padding 0). URL từ `Td::baseUrl()` (không `assetBase()`). Thứ tự nạp: `td.css` →
   compat → skin site.

## Hệ quả

- API mới, cộng thêm; site không đăng ký thì không đổi gì. Selector rộng làm nội dung sau modal thao tác được — đây là UX,
  server vẫn kiểm quyền ([security-model §6t](../security-model.md)).
- Hai `aria-modal` cùng lúc khi UI ngoài mở là chuyện của thư viện ngoài.
- Compat ở specificity 0,3,0 thắng rule unlayered của site có specificity thấp hơn trên cùng thuộc tính → site đổi giao diện
  control qua token `--td-*`, nạp compat **trước** skin.
- Bản vendor của dwp phải chép thêm thư mục `compat/`.

Phương án bác: (1) heuristic tự nhận UI ngoài (mọi con mới của `<body>` có `z-index` cao) — đoán sai làm thủng `inert`;
(2) option theo từng modal (`allowExternal`) — wp.media mở từ nhiều chỗ, một khai báo toàn trang đơn giản hơn; (3) làm mờ /
ẩn scrim td khi wp.media mở — đụng giao diện, owner chọn giữ; (4) compat bằng `!important` hoặc chép giá trị td — lệch khi
token đổi và phá luật không `!important`.
