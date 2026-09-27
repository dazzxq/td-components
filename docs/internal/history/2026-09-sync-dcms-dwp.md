# Sync dcms2 + dwp (2026-09)

Quét để tìm fix/tính năng đáng đưa vào td sau v0.4.0. td **không** sync ngược
([ADR 0007](../decisions/0007-td-canonical-over-dcms.md)). Kết quả đã chuyển thành item trong [roadmap](../roadmap.md).

## Phạm vi quét

| Repo | Đường dẫn | Khoảng | Số commit |
|---|---|---|---|
| dcms2 | `resources/js/components` | từ 2026-06-09 | 157 |
| dwp | `engine/dwp-core/assets/ui` | — | 153 |

## dcms2 → td

| Commit | Nội dung | Thành item |
|---|---|---|
| `fc603bea` | toast shift (evict FIFO) | B1 (vòng lặp FIFO) |
| `fbc1d693` | modal: guard liveness + `onShow` | B2; batch 3 (`onShow`) |
| `2ec17c75` | tabs: ARIA tablist/tab | batch 2 |
| `350bc2fe` | dropdown: placement | B5 |
| `4d873b0d`, `f0e86922` | input: footer/helper text | B4 |
| `ea1448b6`, `7f3f03d5` | error aria contract | error contract ở `TdFormElement` |
| `ec08c81d`, `b4647dd2` | toggle optimistic | backlog: toggle `commit()`/pending |
| `fda49d3f` | table `cellPaddingClass` | batch 4 |
| — | `dcms-chip-search-field.js`, `dcms-form-validation.js` | `td-chip-input`, `FormValidation` |

## dwp → td

| File / commit | Nội dung | Thành item |
|---|---|---|
| `ui-modal.js` | a11y (`role=dialog`, `aria-modal`, labelledby, trả focus) + footer async | batch 3 |
| `ui-modal-stack.js` | scroll lock bằng class trên `<html>` | B3; scroll-lock dùng chung (v0.5.0) |
| `ui-dropdown.js` | bàn phím (Home/End/Tab) + placement | B5; batch 3 |
| `ui-tooltip.js` | hiện khi focus | batch 3 |
| `toast.js` | `role=status` | B6 |
| `ui-button.js` | `aria-busy` khi loading | batch 1 |
| `menu.js` | menu | `td-menu` |
| `lightbox.js` | lightbox | `td-lightbox` ([ADR 0009](../decisions/0009-td-lightbox-hooks.md)) |
| `34d3fa9a` | đo CSP: attribute `style` bị chặn bởi `style-src-attr 'none'`, nhưng ghi CSSOM `el.style` vẫn được phép | xác nhận mô hình CSSOM ([security.md](../security-model.md)) |

## 135

135 có một kit `td-` **không Tailwind** tự fork (`td-tokens.css`, `td-ui.css`, `td-glass.css`, `td-lightbox.css`),
gốc từ dwp. Đây là **điểm xuất phát cho v0.5** (token, BEM, glass). Lệch chuẩn cần sửa ở phía 135: xem
[liquid-glass.md §5](../design/liquid-glass.md#5-những-chỗ-135dwp-đang-lệch-apple-hoặc-tự-mâu-thuẫn).

## Thư viện Liquid Glass bên thứ ba

| Thư viện | Kết luận | Lý do |
|---|---|---|
| `@ozcanyldzhn/liquid-glass-js` | **REJECT** | Shadow DOM, chèn `<style>`, bundle three.js (619 KB), khúc xạ chỉ đúng trên Chromium |
| `ybouane/liquidglass` | **REJECT** | Chụp DOM bằng html-to-image + WebGL, không phủ được layer gắn vào `body` (modal/menu/toast), chèn `<style>` |

Chỉ mượn: công thức khúc xạ (gốc từ bài viết của kube.io, phải ghi công) cho module `td-refract` tuỳ chọn, và ý tưởng
tham số hoá fresnel/rim. Chi tiết: [liquid-glass.md §4](../design/liquid-glass.md#4-thư-viện-bên-thứ-ba).
