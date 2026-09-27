# Tài liệu nội bộ (người phát triển td-components)

Tài liệu cho người **phát triển kit**, không phải người dùng kit. Người dùng đọc [hub tài liệu](../README.md).

| File | Nội dung |
|---|---|
| [roadmap.md](roadmap.md) | Now / Next / Later / External. **Cập nhật cùng mọi thay đổi.** |
| [vision.md](vision.md) | Mục tiêu, giá trị cốt lõi, ràng buộc, những gì không làm |
| [architecture.md](architecture.md) | Base class, mô hình style CSP, render/cleanup, sơ đồ phụ thuộc |
| [conventions.md](conventions.md) | Cấu trúc file, đặt tên, escaping, test, quy trình release |
| [security-model.md](security-model.md) | Mô hình XSS theo ngữ cảnh, cam kết CSP, raw-HTML hatch (cam kết của lõi) |
| [design/liquid-glass.md](design/liquid-glass.md) | Bộ luật Liquid Glass — **bắt buộc cho UI mới** |
| [decisions/](decisions/README.md) | ADR: các quyết định kiến trúc |
| [plans/](plans/) | Plan từng release (đã qua Codex plan-review) |
| [history/](history/README.md) | Lịch sử milestone, so sánh dcms, các đợt sync |

Quy trình: một thay đổi = sửa code + test + cập nhật `roadmap.md` + `CHANGELOG.md` (+ ADR nếu là quyết định kiến
trúc) + cập nhật trang tài liệu người dùng liên quan trong `docs/`.
