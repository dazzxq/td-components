# ADR 0046 — Menu con trong TdMenu: một cấp, cùng phiên

Trạng thái: **chấp nhận** — 2026-11-20 (v0.118.0). Plan đã qua Codex plan review (APPROVED R4), owner chốt D1–D3.
Plan: [v0.118.0-menu-submenu](../plans/v0.118.0-menu-submenu.md).
Liên quan: [ADR 0026](0026-menu-panel-custom-rows.md) (menu panel), [ADR 0011](0011-minimal-surfaces.md) /
[liquid-glass.md](../design/liquid-glass.md), [ADR 0019](0019-touch-standard.md) / [touch.md](../design/touch.md),
[docs › Menu con](../../components/menu.md#8-menu-con--items-01180).

## Bối cảnh

dsuite (thẻ album ảnh) và dcms2 cần "Chuyển sang ›" mở một menu bên cạnh, giống menu ngữ cảnh của Chrome / macOS /
Windows. Plan v0.53.0 ghi "Không submenu / TdMenu lồng" là non-goal; kit giữ "một menu một lúc" (`open()` đóng phiên cũ),
nên dsuite phải mở lại một `TdMenu` thứ hai trên cùng trigger.

## Quyết định

1. **Bỏ non-goal của v0.53.0**: item có `items: [...]` là mục cha. Chỉ **một cấp** — `items` sâu hơn bị bỏ qua kèm
   cảnh báo. Lý do: Apple HIG (Menus, Context menus) và hướng dẫn UX Windows (Menus) đều khuyên một cấp; nhiều cấp hơn
   nên là hộp thoại.
2. **Cùng phiên, không phải `open()` thứ hai.** Menu con là trạng thái `s.sub` của phiên đang mở; "một menu một lúc"
   giữ nguyên. Chọn mục con = chọn mục gốc (đóng cả cây, `onClose('select')`, focus trigger rồi `onSelect(ctx)`, `ctx`
   không thêm trường).
3. **Menu con là một con khác của `<body>`** (`.td-menu.td-menu--sub`), không nằm trong menu gốc: `backdrop-filter` của
   menu gốc biến nó thành containing block cho `position: fixed`, và `overflow` của menu gốc sẽ cắt menu con. Menu con có
   **lớp floating riêng** (`registerLayer`, `keyboard: 'none'`, anchor = trigger) để không bị `inert` khi menu nằm trong
   `TdModal` và để `covered` / `hidden` đóng cả cây; bàn phím vẫn đi qua lớp của menu gốc (Escape đóng từng cấp, Tab
   từ menu con đóng cả cây).
4. **Hai kiểu hiển thị**, chọn lúc mở menu con, không đổi khi resize lúc đang mở:
   - **flyout** (con trỏ mịn, màn ≥ 480px): `placeBeside()` trong `floating.js` — sát cạnh cuối dòng nếu vừa, không
     thì đầu dòng, không thì bên rộng hơn rồi kẹp vào viewport (lề 8px); mục con đầu thẳng hàng mục cha; cùng trần
     `min(448, viewport − 16)` như menu gốc;
   - **drill-down** (`pointer: coarse` hoặc < 480px, D2): menu con thay menu gốc tại chỗ (cùng left / top / bề rộng,
     trần cao không vượt phần màn còn lại về phía đã mở, không đè trigger); menu gốc `visibility: hidden`; hàng đầu
     `‹ {nhãn mục cha}` (D1), tên truy cập `"{TdMenu.labels.back}: {nhãn}"`.
5. **Hover intent kiểu macOS**: mở sau 120ms (Windows 400ms thấy chậm trên web), tam giác an toàn với ân hạn 300ms;
   rê ra khoảng trống không đóng menu con. Chỉ khi `(hover: hover) and (pointer: fine)` và `pointerType !== 'touch'`;
   hằng số media query để cục bộ trong `td-menu.js`.
6. **Mục cha không hành động**: `onSelect` / `href` / `download` / checkable bị bỏ (một cảnh báo). Hàng custom không có
   trong menu con; custom + `items` vẫn là custom. Menu con rỗng → bỏ mục cha.
7. **Menu không có `items` giữ nguyên byte-for-byte** như 0.117.0 (markup, id, focus, listener — listener hover chỉ gắn
   khi có mục cha).

## Không làm

Nhiều hơn một cấp; danh sách con lười / async; mũi tên cuộn; chọn bằng kéo-thả; "Escape đóng hết" kiểu macOS; đổi kiểu
hiển thị khi resize lúc đang mở; hỗ trợ PHP (menu luôn do JS dựng); test RTL (luật owner, vẫn giữ CSS logical).

## Hệ quả

- `floating.js` có thêm `placeBeside()` và `inTriangle()` (thuần, test node).
- `TdMenu.labels.back` là khoá nhãn mới.
- CSP matrix thêm hai trạng thái `submenu-open`, `submenu-drill`.
- dsuite / dcms2 có thể bỏ cách mở lại menu thứ hai; `td-page-actions` / action-fold không đổi trong bản này.
