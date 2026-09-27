# Vision

## Là gì

td-components là **UI kit duy nhất (single source of truth)** cho mọi site của mình:

- **dwp** (WordPress), **135** (PHP thuần), và site tương lai.
- Web Components (Custom Elements v1), không Shadow DOM, vanilla JS + JSDoc, ship source ES Modules.
- Khởi nguồn: port 22 component DCMS (`window.DCMS`, factory JS + Tailwind) sang Custom Elements có lifecycle.

**dcms2 đứng độc lập**, không đồng bộ hai chiều. td chỉ *lấy ý tưởng/logic* từ dcms (và dwp) khi cần,
dcms không phụ thuộc td.

## Giá trị cốt lõi

Thả vào bất kỳ project nào, import đúng component cần, chạy ngay: không config, không copy code, không
làm bẩn global namespace.

## Triết lý: lõi nhỏ + hook/param

- Lõi giữ nhỏ và chung. Khác biệt giữa các site đi qua **token** (`--td-*`), **hook/callback**
  (vd. `download`, `video`, `history` của lightbox) và **attribute/property**.
- Site tuỳ biến **mà không sửa lõi**: override token trong CSS không layer, truyền hook, hoặc bọc adapter
  (PHP helper nằm trong repo site).
- Một bộ từ vựng class trong lõi (BEM `td-x__el--mod`), không alias legacy.

## Ràng buộc

- **Không Shadow DOM**: CSS của host (token `--td-*`) phải chạm được component.
- **CSP strict**: không `style="…"`, không chèn `<style>`. Chỉ dùng file CSS ship kèm và CSSOM. Xem [security.md](security.md).
- **Không bắt buộc build step ở phía consumer**: Vite import thẳng source; PHP dùng `<link>` tới `td.css`.
- **Tương thích về khái niệm** với DCMS gốc: cover cùng chức năng, không cần cùng API.
- **Solo dev**: không over-engineer, không framework, không TypeScript.
- **Styling** ([ADR 0008](decisions/0008-drop-tailwind-token-css.md)): mọi component token-native, chỉ cần `td.css`
  (không cần Tailwind từ 0.11.0).

## Ngoài phạm vi

| Không làm | Lý do |
|---|---|
| Shadow DOM | Chặn CSS host |
| Wrapper React/Vue | Không có consumer dùng |
| Publish npm registry | `npm install github:dazzxq/td-components` là đủ |
| Atomic Design đầy đủ | Nhóm phẳng form/feedback/display là đủ |
| Component CMS-riêng: post-card, media-picker, notification, action-buttons, richtext, draft-preview, banner, color-picker | Gắn chặt với dcms |
| `td-breadcrumb` | Không có nhu cầu |
| i18n built-in | Mặc định tiếng Việt; site ghi đè qua `static labels` / `messages` (không có hệ i18n riêng) |
| Thư viện validation đầy đủ | Không có: luật = constraint gốc của trình duyệt; `TdFormValidation` (0.12) chỉ là helper nhẹ gắn lỗi/focus |
| Bundle Plyr / thư viện liquid-glass bên thứ ba | Nặng, vi phạm CSP/không Shadow DOM (xem [history](history/2026-09-sync-dcms-dwp.md)) |
