# td-components docs

td-components là **bộ UI kit duy nhất (single source of truth)** cho mọi site của mình: dwp (WordPress),
135 (PHP thuần) và các site sau này. Web Components không Shadow DOM, CSP-strict, lõi nhỏ; site tuỳ biến qua
token, hook và tham số, không sửa lõi. Hướng hiện tại: bỏ Tailwind khỏi bên trong component, chuyển sang CSS
token phân lớp (`td.css`) và ngôn ngữ thiết kế Liquid Glass.

**Trạng thái (2026-09-27):** v0.4.0 đã ship · **v0.4.1 (bugfix) đang làm** · v0.5.0 (nền token) là bước kế tiếp.
Chi tiết ở [roadmap.md](roadmap.md), lịch sử thay đổi ở [CHANGELOG.md](../CHANGELOG.md).

## Tài liệu

| File | Nội dung |
|---|---|
| [roadmap.md](roadmap.md) | Now / Next / Later / External. **Cập nhật cùng mọi thay đổi.** |
| [vision.md](vision.md) | Mục tiêu, giá trị cốt lõi, ràng buộc, những gì không làm |
| [architecture.md](architecture.md) | Base class, mô hình style CSP, render/cleanup, sơ đồ phụ thuộc, kiến trúc style mục tiêu |
| [conventions.md](conventions.md) | Cấu trúc file, đặt tên, escaping, test, quy trình release |
| [components.md](components.md) | Catalog component: attribute, property, event, method |
| [security.md](security.md) | Mô hình XSS theo ngữ cảnh, cam kết CSP, raw-HTML hatch |
| [design/liquid-glass.md](design/liquid-glass.md) | Bộ luật Liquid Glass (bắt buộc cho UI mới) · [glass-tokens.css](design/glass-tokens.css) · [nguồn Apple](design/sources/apple/README.md) |
| [decisions/](decisions/README.md) | ADR: các quyết định kiến trúc |
| [history/](history/README.md) | Lịch sử milestone, so sánh dcms, đợt sync dcms/dwp 2026-09 |

Cách làm việc: không dùng GSD. Một thay đổi = sửa code + cập nhật `roadmap.md` + `CHANGELOG.md`
(+ ADR nếu là quyết định kiến trúc).
