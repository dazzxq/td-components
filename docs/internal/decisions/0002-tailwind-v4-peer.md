# 0002. Tailwind v4 là peerDependency

- **Status:** Superseded by [0008](0008-drop-tailwind-token-css.md)
- **Date:** 2026-03-31 (lên v4: 2026-04-04)

## Context

Component DCMS đã viết bằng class Tailwind. Viết lại sang CSS thuần lúc port bị coi là "rewrite vô ích".

## Decision

- Giữ class Tailwind trong component; host cung cấp Tailwind (`peerDependencies.tailwindcss >= 4.0.0`).
- Consumer khai báo `@source "../node_modules/@dazzxq/td-components/src"` để Tailwind quét class.
- CSS custom (animation, keyframes) dùng tiền tố `td-`.
- 2026-04-04 lên Tailwind v4: `shadow-sm→shadow-xs`, `rounded→rounded-sm`, `border` kèm màu tường minh, bỏ config v3.

## Consequences

- Site không dùng Tailwind (135 PHP thuần, dwp) không dùng được kit nếu không cài Tailwind.
- Style phụ thuộc phiên bản Tailwind của host; phải có fixture Tailwind pin version để test CSP parity.
- Bị thay bởi 0008 khi kit trở thành SSOT cho mọi site.
