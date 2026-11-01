# ADR 0038 — td-rich-text: `target` / `noreferrer` theo từng link, hộp thoại link bằng td-modal, `RichTextPolicy::sanitize()`

Trạng thái: **chấp nhận** — 2026-11-02 (v0.91.0). Plan [v0.91.0-link-modal-gutter](../plans/v0.91.0-link-modal-gutter.md) (Codex plan APPROVE r3); khảo sát [v0.91.0-facts](../research/v0.91.0-facts-2026-11-01.md). Owner chốt 2026-11-01: "phải là mở modal ra để chèn link → dùng td modal… xử lý cái open new tab hay không, thêm cả no referer"; `link-target` thành giá trị tick sẵn; noreferrer là checkbox từng link, mặc định bỏ tick; modal có URL + văn bản hiển thị.
Liên quan: plan [v0.88.0-rich-text](../plans/v0.88.0-rich-text.md) (policy JSON dùng chung client + PHP), [ADR 0011](0011-minimal-surfaces.md) (bề mặt UI).

## Bối cảnh

v0.88.0 ép một `target` cho mọi link của ô (attribute `link-target`) và luôn `rel="nofollow noopener"`; `target` / `rel` đầu vào (kể cả khi dán) bị bỏ. Chèn link qua một panel inline nhỏ dưới toolbar: không có ô văn bản, không chọn được tab mới theo từng link, không có `noreferrer`. Đổi `link-target` lúc chạy dựng lại schema và mất undo.

## Quyết định

1. **Link mark `{ href, target: null | '_blank', noreferrer: false }`.** Parse giữ `target` chỉ khi đúng `_blank`; `noreferrer` = token trong `rel` (ASCII, không phân biệt hoa thường). Xuất `href`, `rel="nofollow noopener[ noreferrer]"`, `target="_blank"` — `nofollow noopener` luôn ép. Token rel khác và target khác bị bỏ.
2. **HTML cũ không migrate.** Link `target="_blank"` đã lưu đi vòng nguyên vẹn; `_self` bị bỏ (cùng mặc định trình duyệt).
3. **`link-target` chỉ là giá trị tick sẵn** của "Mở trong tab mới" khi chèn link mới; ra khỏi khoá cấu hình schema (đổi lúc chạy không dựng lại, không mất undo). `_self` coi như `none`.
4. **Hộp thoại = `TdModal`** (import động khi mở, subpath `/rich-text` vẫn nhẹ): URL, văn bản hiển thị, hai checkbox, Áp dụng / Gỡ liên kết (chỉ khi sửa) / Huỷ. Chọn chồng lên link sẵn có = sửa cả span link đó. Áp dụng là một transaction (một bước undo). Trạng thái `loading → open` có generation token: disabled / readonly / đổi `value` / rebuild / disconnect / blur thật lúc đang tải huỷ phiên; `onClose` của phiên cũ không đụng document. Focus vào modal không tính là blur (không phát `change` sớm). Bỏ panel inline.
5. **Policy JSON (version 1):** `features.link.attrs.a = ["href","rel","target"]`, `link.targets = ["_blank"]`, `link.relOptional = ["noreferrer"]`.
6. **PHP: entry point mới `RichTextPolicy::sanitize()`** — Symfony HtmlSanitizer với `a[href|rel|target]` + attribute sanitizer chuẩn hoá rel / target, rồi hậu xử lý trên output **đã escape** của Symfony: dựng lại thẻ mở `<a>` theo thứ tự href, rel, target và thêm `rel` khi thiếu; số thẻ `<a>` lệch → `RuntimeException` (không để lọt link thiếu `rel`). `symfonyConfig()` **giữ nguyên output v0.88.0** (allowlist chỉ `href`, ép rel + target) cho caller cũ; muốn per-link phải chuyển sang `sanitize()`.

## Phương án đã bác

- **Chỉ dùng `HtmlSanitizerConfig` (forceAttribute + attribute sanitizer)** — Symfony không gọi attribute sanitizer cho attribute vắng mặt, còn `forceAttribute` ghi đè `noreferrer`; không thể vừa giữ per-link vừa thêm rel cho link thiếu.
- **Đổi hành vi `symfonyConfig()` sang per-link** — đổi output âm thầm của site đang chạy; giữ legacy, thêm entry point mới.
- **Giữ panel inline, thêm checkbox** — chật trên điện thoại, không có ô văn bản; owner chốt modal.
- **Cho phép `_self` / `_top` / rel tuỳ ý** — không có nhu cầu, mở thêm bề mặt (tabnabbing, rel lạ); chỉ `_blank` + `noreferrer`.
