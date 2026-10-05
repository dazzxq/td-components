# Tài liệu td-components

td-components là **bộ UI kit duy nhất** cho mọi site: dwp (WordPress), 135 (PHP thuần) và các site sau này. Mỗi
component là một Web Component (Custom Element) render vào **light DOM** — không Shadow DOM — nên CSS của trang và
token `--td-*` chạm được tới nó. Toàn bộ giao diện nằm trong **một file `td.css`**. Kit chạy dưới **CSP nghiêm ngặt**
(không `style="…"`, không chèn `<style>`), nhãn mặc định **tiếng Việt**, giao diện **minimal surfaces** (nền + viền mảnh + bóng mềm, blur nhẹ cho popup; từ 0.20.0 thay Liquid Glass).

Triết lý: **lõi nhỏ + hook**. Site tuỳ biến bằng token CSS, attribute/property và hook (callback) — không bao giờ sửa
code của kit.

Phiên bản hiện tại: **0.49.0** (tag git `v0.49.0`) · Lịch sử thay đổi: [CHANGELOG.md](../CHANGELOG.md)

---

## Đọc theo thứ tự nào?

| Bạn muốn… | Đọc |
|---|---|
| Biết máy/trình duyệt/site cần gì | [Yêu cầu](getting-started/requirements.md) |
| Cài vào project (Vite, PHP thuần, WordPress) | [Cài đặt](getting-started/installation.md) |
| Render markup component từ PHP (SSR) | [Adapter PHP](guides/php-adapter.md) |
| Có một trang chạy được trong 5 phút | [Bắt đầu nhanh](getting-started/quick-start.md) |
| Hiểu kit hoạt động ra sao (attribute, property, event, form, lớp nổi) | [Cách hoạt động](concepts/how-it-works.md) |
| Hiển thị đúng từ điện thoại tới desktop (breakpoint, container query, vùng chạm) | [Responsive](concepts/responsive.md) |
| Tra cứu một component | [Danh sách component](components/README.md) |
| Đổi màu, font, bo góc, dark mode, bỏ blur | [Theming](customization/theming.md) |
| Sinh theme màu từ nền + màu nhấn (tự cân tương phản), vùng tối trong trang sáng | [Theming › Palette tuỳ biến (`td-theme`)](customization/theming.md#palette-tuỳ-biến-td-theme-0420) · [Theme theo vùng](customization/theming.md#theme-theo-vùng) |
| Viết CSS đè lên component | [Styling](customization/styling.md) |
| Cắm logic riêng của site (hook, callback) | [Danh mục hook](customization/hooks.md) |
| Tự viết component mới, thêm icon, dịch nhãn | [Mở rộng](customization/extending.md) |
| Nâng cấp lên bản mới | [Nâng cấp](upgrading/README.md) |

---

## Bắt đầu

- [Yêu cầu hệ thống](getting-started/requirements.md) — trình duyệt hỗ trợ, cần gì / không cần gì, CSP.
- [Cài đặt](getting-started/installation.md) — npm/GitHub, Vite, PHP thuần + import map, WordPress.
- [Bắt đầu nhanh](getting-started/quick-start.md) — form + dropdown + toggle + nút + toast + modal.
- [Cách hoạt động](concepts/how-it-works.md) — light DOM, attribute vs property, event, vòng đời, form, lớp nổi, CSP.
- [Responsive](concepts/responsive.md) — breakpoint kit, container query vs media query, vùng chạm 44px, lớp phủ theo màn hình.

## Component

Xem [danh sách đầy đủ](components/README.md). Tóm tắt:

| Nhóm | Component |
|---|---|
| Form | [Button](components/button.md) · [Input field](components/input-field.md) · [Checkbox](components/checkbox.md) · [Toggle](components/toggle.md) · [Slider](components/slider.md) · [Dropdown](components/dropdown.md) · [Datetime picker](components/datetime-picker.md) · [Datetime range](components/datetime-range.md) · [Color picker](components/color-picker.md) · [Chip input](components/chip-input.md) · [Tree](components/tree.md) · [Tree select](components/tree-select.md) · [Number input](components/number-input.md) · [Choice group](components/choice-group.md) · [Scan input](components/scan-input.md) · [Check matrix](components/check-matrix.md) · [Repeater](components/repeater.md) · [Media field](components/media-field.md) · [Media gallery](components/media-gallery.md) · [Cropper](components/cropper.md) · [Password meter](components/password-meter.md) · [Dropzone](components/dropzone.md) · [Form validation](components/form-validation.md) |
| Lớp nổi & phản hồi | [Modal](components/modal.md) · [Media picker](components/media-picker.md) · [Toast](components/toast.md) · [Tooltip](components/tooltip.md) · [Loading](components/loading.md) · [Menu](components/menu.md) · [Hovercard](components/hovercard.md) · [Lightbox](components/lightbox.md) · [Progress](components/progress.md) · [Scroll to top](components/scroll-top.md) · [Alert](components/alert.md) |
| Hiển thị | [Table](components/table.md) · [Tabs](components/tabs.md) · [Pagination](components/pagination.md) · [Empty state](components/empty-state.md) · [Media grid](components/media-grid.md) · [Sortable](components/sortable.md) · [Masked value](components/masked-value.md) · [Filter chips](components/filter-chips.md) · [Steps](components/steps.md) · [Timeline](components/timeline.md) · [Diff](components/diff.md) · [Badge](components/badge.md) · [Icons](components/icons.md) |
| Nền tảng | [Base element (tự viết component)](components/base-element.md) · [Tiện ích](components/utilities.md) |

## Tuỳ biến

- [Theming](customization/theming.md) — token `--td-*`, light / dark / auto, palette `td-theme` (CLI + builder), theme theo vùng, bề mặt nổi (`--td-glass-*`), viền, chuẩn tương phản.
- [Styling](customization/styling.md) — `@layer`, cách đè CSS an toàn, class BEM ổn định, giá trị per-instance.
- [Hook](customization/hooks.md) — danh mục mọi hook/callback/option theo component + công thức mẫu.
- [Mở rộng](customization/extending.md) — viết component mới, đăng ký icon, registry menu, đổi ngôn ngữ nhãn.

## Hướng dẫn

- [Form](guides/forms.md) — form-associated, FormData, validation, lỗi từ server, submit AJAX.
- [Trợ năng (a11y)](guides/accessibility.md) — bàn phím, ARIA, focus, các đánh đổi có chủ đích.
- [Cảm ứng](guides/touch.md) — hover chỉ cho chuột, hình nhấn, tooltip khi chạm, bàn phím ảo trong dialog, vuốt lightbox; token `--td-*-pressed`.
- [Bảo mật](guides/security.md) — text vs HTML, các "cửa" HTML tin cậy, URL, checklist cho site.
- [CSP](guides/csp.md) — header nên dùng, nonce, những gì kit không bao giờ làm.
- [Biến thể ảnh đã cắt](guides/media-renditions.md) — **bắt buộc** khi dùng crop / focal: URL ký HMAC, giới hạn biến thể,
  cache, chống lạm dụng endpoint cắt ảnh (kit chỉ xuất toạ độ).
- [WordPress & PHP](guides/wordpress-php.md) — tích hợp vào dwp và 135.
- [Adapter PHP](guides/php-adapter.md) — `php/td.php`: import map, `td.css`, markup render phía server (nút, ô nhập,
  dropdown, switch, checkbox, icon, ô chọn ảnh `td_media_field`).

## Nâng cấp

- [Quy trình nâng cấp](upgrading/README.md) — chính sách version, từng bước, checklist sau nâng cấp.
- [Thay đổi phá vỡ theo phiên bản](upgrading/breaking-changes.md) — 0.4 → 0.17, cần sửa gì.
- [Bảng đổi class](upgrading/class-map.md) — class cũ (Tailwind/DCMS) → class mới.

---

## Xem trực tiếp

- **Demo:** `npm run demo` (mở `demo.html` qua Vite — mở file trực tiếp bằng `file://` sẽ trống vì trình duyệt chặn
  ES module).
- **Storybook:** `npm run storybook` → http://localhost:6006 (mọi component, mọi trạng thái; mục
  *Foundations/Surfaces › Showcase* để xem các bề mặt).

## Cho người phát triển kit

ADR, plan từng release, bộ luật minimal surfaces, kiến trúc, quy ước, roadmap: [docs/internal/](internal/README.md).
