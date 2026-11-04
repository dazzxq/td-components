# ADR 0044 — Thanh chọn nền kính opt-in `surface="glass"` (ngoại lệ ADR 0011 luật 2)

Trạng thái: **chấp nhận** — 2026-11-04 (v0.96.0). Plan [v0.96.0-action-fold](../plans/v0.96.0-action-fold.md) §5.3, §8.
Liên quan: [ADR 0011](0011-minimal-surfaces.md) (minimal surfaces), [liquid-glass.md](../design/liquid-glass.md).

## Bối cảnh

ADR 0011 luật 2: blur chỉ cho popup nhỏ và thanh lightbox; bề mặt lớn **đặc**. Panel `td-selection-bar` (v0.95.0) là bề
mặt lớn nên xếp vào lớp **Đặc**. dsuite (`ds-action-bar` kính, `ui.md:309–310`) và dwp (plan §1: bo 20px, cách đáy
12/16px, rộng bằng khối trang) — cùng một owner — cần thanh thao tác nổi nền kính khớp mép trang.

## Quyết định

1. Mặc định giữ **đặc** (`surface="solid"`): luật 2 vẫn đúng cho mặc định, markup v0.95.0 không đổi byte.
2. Thêm ngoại lệ **opt-in** `surface="glass"` cho **đúng** panel selection-bar: panel nhận lớp dùng chung
   `td-glass-surface td-glass-surface--strong td-glass-surface--lg` (nền `--td-selection-bar-glass-bg` = 94 %, blur,
   bóng lớn), bo `--td-selection-bar-glass-radius` (20px), cách đáy một khoảng **trong suốt**
   `--td-selection-bar-glass-gap` (12px, từ 720px 16px; tối thiểu safe area) làm bằng đệm của host + host
   `pointer-events: none` (panel `auto`) → không chặn click bên dưới; `--td-selection-bar-offset` tự gồm khoảng hở.
   Panel rộng đúng khối chứa (không inset ngang, không `max-width`).
3. Mọi fallback của `.td-glass-surface` áp dụng (không `backdrop-filter`, giảm trong suốt, `data-td-glass="off"`,
   tương phản cao, forced colours → đặc) — quy tắc kính đọc biến riêng `--_td-glass-*` để fallback thắng.
4. Cổng contrast trên kính light + dark: chữ (đếm, nhãn, danger) ≥ 4.7:1, icon ≥ 3.2:1, disabled ≥ 2.2:1 (luật 9).
5. Không mở rộng: ngoại lệ chỉ cho panel selection-bar. Bề mặt lớn kính khác (modal / drawer) cần ADR riêng hoặc gộp
   vào ADR này khi phát hành.

## Hệ quả

- `liquid-glass.md` lớp Đặc ghi chú ngoại lệ opt-in. Token mới `--td-selection-bar-glass-{bg,radius,gap}`.
- Chỉ đảm bảo "rộng đúng khối trang" với `--td-selection-bar-position: sticky` (mặc định); `fixed` thì site tự đặt
  `inset-inline` / `inline-size`.
- Thêm state CSP `glass` + cổng contrast cho kính (phiên chính chạy khi phát hành).

Phương án bác: (1) đổi mặc định sang kính (trái luật 2 cho mọi site, đổi baseline v0.95.0); (2) để site tự viết CSS kính
(mất fallback dùng chung + cổng contrast, mỗi site một kiểu).
