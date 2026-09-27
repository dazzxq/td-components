# 0009. td-lightbox: port clean-room lõi lightbox của dwp, mở rộng bằng hook

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

dwp (`dwp/engine/dwp-core/assets/ui/lightbox.js`) và 135 đều có lightbox, logic trùng nhau và có lỗi. Đây là
component token-native đầu tiên (pilot cho [0008](0008-drop-tailwind-token-css.md)).

## Decision

- **Port clean-room** lõi lightbox của dwp. dwp **không bị động tới** và vẫn là nguồn chuẩn cho dwp cho tới khi đạt parity.
- **API:**
  - `TdLightbox.open(items, opts)` → handle.
  - `TdLightbox.bind(root, { group, item })` → hàm `unbind`.
  - Event: `td-lightbox-open`, `td-lightbox-change`, `td-lightbox-close`.
  - Import không có side effect.
- **Hook** (`opts`):
  - `download(item)` → url | null
  - `isAllowedUrl(url)`: mặc định chỉ `http:`/`https:`
  - `video(item, mountEl, { signal })`: mặc định `<video>` native; Plyr qua adapter, không bundle
  - `history`: mặc định **tắt**; `true` = `pushState`/`popstate`; hoặc adapter `{ push, back, onPop }`
  - `panel(ctx)` → Element
  - `toolbar`: `[{ id, icon, label, onClick, visible }]`
  - `isForeignLayerOpen()`: có layer khác đang mở (để không cướp phím/đóng nhầm)
  - `labels`: mặc định **tiếng Việt** (user chốt 2026-09-27; mọi site đều tiếng Việt), ghi đè được
- **Click backdrop thì ĐÓNG** (khác `td-modal`, [0006](0006-modal-no-backdrop-close.md)): trình xem ảnh, không có gì để mất.
- Dùng Pointer Events (không dò `'ontouchstart'`). Background `inert`: chỉ ghi nhận và khôi phục những phần tử nó
  đã đổi. Scroll lock dùng chung, đếm tham chiếu, chung với modal stack.
- **Sửa lỗi của dwp:** id chèn vào selector không escape (dùng `CSS.escape`), icon qua `innerHTML`, dedup theo `src`
  trả sai index.
- Glass: chrome toolbar/counter là **Clear** + dim cục bộ; panel/sheet là solid tối ([liquid-glass.md](../design/liquid-glass.md) R4, R5).

## Consequences

- Chạy thật trên 135 trước, dwp chuyển sau v1.0 qua adapter.
- Cần scroll-lock chung (việc v0.5.0) trước khi pilot.
- Mọi khác biệt theo site nằm trong hook, lõi không có code riêng cho dwp/135.

## Addendum — v0.15.0 (dwp API parity)

Re-checked against the current dwp lightbox (all its commits predate the port): layout / two-column panel / bottom
sheet already matched. Added the missing GENERIC API, keeping hooks-not-globals: per-handle `setPanel` /
`refreshPanel` / `addToolbarButton` / `removeToolbarButton` (dwp uses module globals `setViewerMode`, `setSidePanel`,
`addToolbarButton` — td keeps state per session so two sites/pages never share it), `itemEl` / `groupEl` in ctx and
events, `bind()` `attrPrefix` (whitelisted, for `data-dwp-*` markup) and `filter`, touch-based sheet swipe. Still dwp
hooks: Navigation API history adapter, download proxy / gateway rules, Plyr + video gate, auto-binding post images.
Plan: `docs/plans/v0.15.0-lightbox-parity.md`.
