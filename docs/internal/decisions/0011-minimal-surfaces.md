# 0011. Minimal surfaces thay Liquid Glass: nền + viền mảnh + một shadow, blur chỉ cho popup nhỏ

- **Status:** Accepted
- **Date:** 2026-10-02 (owner yêu cầu; Codex think-about `gpt-5.6-sol` + high, 2 vòng, đồng thuận; plan-review
  APPROVE 2 vòng — [plan v0.20.0](../plans/v0.20.0-minimal-surfaces.md))
- **Thay thế:** hướng Liquid Glass v1 (0.5.0) / v2 (0.14.0) trong
  [liquid-glass.md](../design/liquid-glass.md) (file nay chứa luật mới, giữ đường dẫn).

## Context

Từ 0.5.0 kit giả lập Liquid Glass của Apple bằng CSS: nền trong suốt thấp (40–52 %), `blur(16–20px) saturate()
brightness()`, sheen gradient 135°, rim inset hai tông, hairline tối ngoài, nút "tinted glass" (tint + film + sheen +
rim + blur), toast có status wash, glow khi hover, scale khi bấm / nâng / mở. Trên trang thật owner thấy "không đẹp
lắm"; mỗi lớp trang trí lại cần gate tương phản và fallback riêng, và có những hệ quả phụ (bề mặt bị "covered" phải
chuyển đặc, test phụ thuộc animation scale). dcms2 (`dcms-glass.css`, `dcms-btn.css`) cho thấy một bản đơn giản: nền
gần đặc + viền mảnh + shadow mềm, blur nhẹ.

## Decision

- Mỗi bề mặt = **nền + một viền mảnh + một shadow mềm**; `blur(12px)` **chỉ** cho popup nhỏ (menu, dropdown, gợi ý
  chip-input, hovercard, toast) trên nền 94 %, và thanh lightbox (tối 88 %).
- **Đặc, không blur:** modal dialog, loading card, tooltip, scroll-top (một rule `:is(…).td-glass-surface` trong
  `glass.css`, vẫn đi qua `--_td-glass-fill` để fallback contrast / forced-colors thắng).
- **Nút đặc:** `--td-btn-{v}-bg` + một shadow `--td-btn-lift`; hover = nền đậm hơn (đặc); ghost / disabled không
  shadow; `.td-btn--custom` cùng hợp đồng (hover `color-mix(in srgb, var(--td-btn-bg) 92%, #000)`).
- Bỏ: sheen, rim, hairline ngoài, film / tint trong suốt, status wash, glow, mọi scale trang trí, lens clear của
  slider, glyph shadow, dim cục bộ của lightbox, override "covered → solid" của modal / toast.
- **Không đổi** markup, class công khai, API JS; tên token / class `glass` giữ (API công khai). Token bỏ tác dụng
  được **giữ khai báo** (deprecated, xoá ở bản lớn sau); `--td-btn-{v}-tint` là alias một chu kỳ cho nền nút.
- Giữ nguyên chuỗi fallback (no backdrop-filter → reduced transparency → `data-td-glass="off"` → contrast →
  forced colours) và các gate (token, tương phản 3 engine, CSP).

Giá trị mặc định (light / dark): `--td-glass-bg` `rgb(255 255 255 / 90%)` / `rgb(28 28 30 / 90%)`, `-bg-strong`
94 %, `-solid` `#fff` / `#1c1c1e`, `-fg` `#18181b` / `#f5f5f7`, `-border` `rgb(0 0 0 / 7%)` / `rgb(255 255 255 /
10%)`, `-blur` = `-blur-lg` = `blur(12px)`, `-shadow` `0 4px 16px` 6 % / 18 %, `-shadow-lg` `0 8px 24px` 9 % / 24 %,
`--td-btn-lift` `0 1px 2px 6 %, 0 2px 6px -2px 8 %` (tối 18 % / 20 %). Lightbox: `-clear-bg rgb(20 20 22 / 88%)`,
`-clear-solid #141416`, `-clear-border rgb(255 255 255 / 12%)`, `-clear-shadow 0 4px 16px rgb(0 0 0 / 24%)`.

## Consequences

- Giao diện đổi lớn (một lần): site đang override token glass cũ vẫn chạy; token deprecated không còn tác dụng.
  Site từng tự ép modal đặc có thể bỏ override. 135 đặt `--td-btn-danger-tint` → vẫn đúng màu nhờ alias.
- CSS gọn hơn: không còn `--_td-glass-rim/-outline/-sheen/-glyph-shadow/-dim`, `--_td-btn-*` (trừ `-lift`),
  `--_td-glass-press/-lift-knob/-enter/-glow`, `--td-glass-wash`.
- Token gate kiểm theo **từng selector** (đặc / blur / lightbox / nút, không `background-image`, không rim);
  contrast gate giữ ngưỡng. Baseline CSP của các component đổi giao diện được chụp lại.
- Luật cho UI mới: [liquid-glass.md](../design/liquid-glass.md) ("Minimal surfaces").
