# ADR 0041 — Upload nền từ lưới của `td-media-picker` (bổ sung ADR 0013)

Trạng thái: **chấp nhận** — 2026-11-03 (v0.95.0). Plan [v0.95.0-media-picker-bulk](../plans/v0.95.0-media-picker-bulk.md).
Liên quan: [ADR 0013](0013-media-picker-boundary.md) (ranh giới picker / adapter).

## Bối cảnh

Từ v0.93.0, file thả vào lưới của picker được upload ngay trong lưới; đóng picker thì hỏi rồi **huỷ mọi upload** đang chạy.
Người dùng thả một loạt ảnh rồi đóng picker để làm việc khác thì mất hết; site muốn upload tiếp trong nền.

## Quyết định

1. **Store cấp module theo object adapter** (`src/feedback/media-picker-uploads.js`): store giữ `UploadQueue` + bản ghi; lưới
   của picker chỉ là **view** (gắn / gỡ). Đóng picker / gỡ picker khỏi DOM **không** huỷ upload. Mở lại với **cùng object
   adapter và cùng `context`** (`Object.is`) thì thấy lại các thẻ. `context` / `collectionId` chụp lúc thả, không đọc lại.
2. **Một pool toàn trang** `createUploadSlots(3)` dùng chung cho mọi store và hộp thoại upload (không bao giờ đóng): giới hạn
   3 upload đồng thời là của cả trang (trước đây mỗi picker).
3. **Trần mỗi store**: 100 file / 256 MiB ước tính; mục xong được nhả ngay (`UploadQueue.release`).
4. API tĩnh `TdMediaPicker.uploads` (đọc) và `TdMediaPicker.cancelUploads()` (huỷ tất cả). Kit **không** gắn `beforeunload`.
5. Không lưu gì (reload trang = mất); tên file là `textContent`; không URL `blob:`.

## Hệ quả

- Đóng picker không còn hỏi / huỷ file thả vào lưới (CHANGELOG Changed; hộp thoại upload vẫn hỏi như cũ).
- Site dựa vào "đóng = huỷ" phải gọi `cancelUploads()`; site **phải** gọi nó khi đăng xuất / đổi tài khoản (adapter vẫn gửi
  request bằng credential nó giữ — [security-model §6](../security-model.md#6-media-picker--media-field)).
- Hai bundle của kit trên một trang có store riêng (Map theo module); guard `active` của picker vẫn chặn hai picker mở cùng lúc.

Phương án bác: (1) giữ "đóng = huỷ" (mất việc của người dùng); (2) lưu hàng đợi vào storage để sống qua reload (file không
serialize được, rủi ro credential, ngoài phạm vi kit).
