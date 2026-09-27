# 0005. CSP strict: CSSOM + constructable stylesheet

- **Status:** Accepted — phần `adoptedStyleSheets` **superseded cho component** bởi [0008](0008-drop-tailwind-token-css.md) (`adopt-styles.js` đã xoá ở 0.10.0); CSSOM cho giá trị per-instance vẫn là luật
- **Date:** 2026-06-10 (v0.3.0)

## Context

Dashboard s3 (internet-facing, giữ credential) chạy `default-src 'self'` không `unsafe-inline`. Dưới CSP đó,
`style="…"` và `<style>` chèn bằng JS bị chặn, component vỡ. Spike Playwright xác nhận CSSOM và `adoptedStyleSheets`
được phép.

## Decision

- Scalar per-instance → CSSOM trong `_applyStyles()` (gọi sau mỗi render và khi đổi state).
- Selector/pseudo/`@keyframes`/`@media` → một constructable sheet mỗi component qua `adoptStyles(css, key)`:
  lazy, idempotent, feature-detect, không throw ở node/SSR.
- SVG `style=` → presentation attribute.
- Gate `npm run test:csp` không rỗng: sentinel Tailwind + parity computed style 70 state + 0 violation + animation liveness.
- Raw-HTML hatch ngoài phạm vi cam kết, ghi rõ trong docs.

## Consequences

- Cần `adoptedStyleSheets`; trình duyệt cũ mất phần trang trí selector, cấu trúc còn nguyên.
- DOM không còn `style` attribute: ai kiểm tra chúng sẽ thấy khác.
- CSS nằm rải trong JS, khó override theo site → một lý do cho 0008.
