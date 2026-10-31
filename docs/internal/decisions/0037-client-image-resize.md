# ADR 0037 — Resize ảnh ở trình duyệt trước khi upload: opt-in policy, canvas trên main thread, metadata byte-level, hàng đợi FIFO một slot

Trạng thái: **chấp nhận** — 2026-11-01 (v0.90.0). Plan [v0.90.0-image-resize](../plans/v0.90.0-image-resize.md) (Codex plan APPROVE r3); nghiên cứu [image-resize-before-upload](../research/image-resize-before-upload-2026-10-31.md), [R3 kịch bản](../research/image-resize-codex-r3-2026-10-31.md), [metadata R1](../research/image-resize-metadata-codex-r1-2026-10-31.md), [metadata R2](../research/image-resize-metadata-codex-r2-2026-10-31.md) (hai phiên Codex think, đều CONSENSUS). Owner chốt 2026-10-31: "khi upload cần resize ở frontend; mỗi site một chất lượng", mặc định metadata `keep`.
Liên quan: [ADR 0013](0013-media-picker-boundary.md) (ranh giới picker / app: server là ranh giới tin cậy), [0015](0015-td-cropper.md) (kit không tạo pixel *sau* upload; crop vẫn chạy trên asset), [0008](0008-drop-tailwind-token-css.md) (CSP, không `<style>` / `style=""`).

## Bối cảnh

Ảnh từ máy ảnh (ví dụ Sony a7C II, 33 MP, ~30 MB) vượt trần upload của site, làm chậm upload và buộc server giải mã ảnh khổng lồ. Trước 0.90, `max-size` của dropzone / `upload.maxSize` của picker chỉ **từ chối** file gốc quá cỡ; kit không đọc nội dung file. Mỗi site cần một chính sách khác nhau (JPEG 90 %, tối đa 5 MB, tối đa 12 MP…), nên kit không thể tự chọn số.

## Quyết định

1. **Opt-in, kit không đặt trần.** Property `TdDropzone#imageResize` (policy object, mặc định `null`) và `upload.imageResize` của media picker. Không đặt = hành vi 0.89 từng byte (không đọc file, hook nhận đúng `{ onProgress, signal }`). Không thêm attribute HTML (cấu hình là code JS, không đổi PHP SSR). Dropzone **không** kế thừa ngầm default của picker.
2. **Policy chuẩn hoá + đóng băng, lỗi to và sớm.** Chỉ chép key own đã biết; key lạ bỏ qua + `console.warn` một lần; giá trị sai của key đã biết → `TypeError` đồng bộ (setter, `configureDefaults`, `open()`), policy cũ giữ nguyên. Trần byte là số nguyên (không nhận `'5MB'` để khỏi lệch MB / MiB). Bốn trần đầu vào (`maxInput*`, `maxHeaderBytes`) không tắt được: chống bom giải nén là việc của kit, không phải của site.
3. **Engine native, không dependency, main thread.** `createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth, resizeHeight, resizeQuality: 'high' })` → canvas đúng kích thước đích → `toBlob`; option bị từ chối hoặc bitmap sai kích thước → thu nhỏ từng bước ≤ 2× trên canvas. Probe hướng xoay (JPEG và PNG `eXIf`) một lần, cache trong module; sai → `resize-unsupported`, **không** fallback `<img>`. Dọn dẹp ở mọi nhánh, huỷ bằng `AbortSignal` kiểm sau mọi `await`.
4. **Quyết định theo nội dung, không theo `file.type` / đuôi.** Sniff magic bytes (4 KiB đầu). Đã đạt mọi trần + `keep` → gửi nguyên cùng object `File`. JPEG thường → resize + encode lại JPEG (hạ `quality` tới `minQuality`, rồi thu kích thước, tối đa `maxEncodes`, giữ ứng viên nhỏ nhất đạt trần); PNG 8-bit thường → resize giữ PNG và alpha. **Không bao giờ đổi định dạng** (không PNG → JPEG, không xuất WebP / AVIF). Vượt trần mà không biến đổi được (JPEG đặc biệt MPF / gain map / C2PA / đuôi, APNG, PNG 16-bit, định dạng khác) → từ chối với mã lỗi rõ, không lén upload bản vượt trần. Ảnh vượt trần đầu vào (panorama) → từ chối.
5. **Metadata byte-level, bốn chế độ như Cloudflare:** `keep` (mặc định, **giữ cả GPS**; docs cảnh báo ngay cạnh option) | `keep-no-gps` | `copyright` | `none`. Không parse XML, không `DOMParser` (không đụng Trusted Types): EXIF vá tại chỗ giữ bố cục TIFF (MakerNote còn đúng offset), GPS xoá tại chỗ, IPTC dựng lại từ resource `0x0404`, XMP chỉ ở `keep` và chép **nguyên văn** một gói Standard XMP không chứa tên trong danh sách chặn. Chế độ khác `keep` mà ảnh đã đạt trần → **viết lại không mất dữ liệu** (giữ nguyên entropy JPEG / IDAT PNG). Lỗi cấu trúc metadata → bỏ họ đó, báo `partial`, không làm hỏng upload. Metadata chèn vào tính trong `maxBytes` (`metadata-too-large`, không lén bỏ).
6. **Hàng đợi FIFO toàn module, một slot.** Mọi dropzone và hộp tải lên của picker dùng chung; mỗi lúc một ảnh được giải mã (kiểm soát bộ nhớ). Trạng thái hàng `queued` → `optimizing` → `uploading` → `done` | `error` (không hook: `selected`). Chỉ hàng đã sẵn sàng mới vào `files` / `FormData`; còn hàng đang chờ / lỗi tối ưu → `customError` để form không submit nhầm. `uploading` tính cả hàng chờ / đang tối ưu để dialog không tự đóng giữa lô.
7. **`max-size` trở thành trần đầu ra của ảnh** khi có policy (gộp vào `maxBytes`); file không phải ảnh vẫn bị kiểm trên file gốc. `accept` và `max-files` vẫn chặn đồng bộ.
8. **Hook `processor` do site cung cấp** thay engine ở nhánh vượt trần / viết lại; kit **không tin** kết quả: cùng họ định dạng, đạt mọi trần và chế độ metadata (đọc lại), thoả các trần đầu vào; `null` chỉ hợp lệ khi file gốc đã đạt trọn policy.
9. **Hợp đồng hook / adapter:** hook upload nhận thêm `optimization` và `originalFile` (chỉ khi có policy); `adapter.upload` của picker nhận `optimization` (không có `originalFile`). `files-change` có thêm `detail.added` (File gốc, phát trước khi job chạy) để dialog chụp `uploadFields` lúc **nhận** file. Lỗi upload (không phải lỗi tối ưu) có nút "Thử lại" dùng lại file đã tối ưu, không tối ưu lại.
10. **Server vẫn là ranh giới tin cậy** (docs [Giới hạn khi upload ảnh](../../guides/image-upload-limits.md)): trần client chỉ để tiết kiệm băng thông, trần server ≥ client cùng đơn vị byte; nén lại đổi hash nên dedup theo hash chính xác có thể lệch.

## Phương án đã bác

- **Worker / OffscreenCanvas** — thêm bề mặt CSP (`worker-src`), thêm đường code; bản đầu giới hạn một ảnh một lúc trên main thread, thêm Worker khi đo thấy long task > ~100 ms.
- **Fallback `<img>` + canvas** — đòi `img-src blob:` và hai đường giải mã khác nhau về hướng xoay; thay bằng probe + `resize-unsupported`.
- **Thư viện (Pica, jSquash, browser-image-compression…)** — vi phạm "không dependency"; site cần thì dùng qua `processor`.
- **Tự đổi PNG → JPEG, hoặc xuất WebP / AVIF** — đổi định dạng sau lưng người dùng (mất alpha, hợp đồng MIME của adapter); owner chốt giữ PNG và thu kích thước.
- **Mặc định có trần (12 MP / 5 MiB)** — mỗi site một chính sách; owner chốt kit không đặt số.
- **Parse XMP bằng `DOMParser` để sửa Orientation / kích thước** — sink Trusted Types, XML namespace phức tạp; thay bằng chép nguyên văn có danh sách chặn (chỉ ở `keep`) hoặc bỏ XMP.
- **Chép nguyên APP13 / cắt APP1 để bỏ thumbnail** — APP13 mang cả thumbnail và ICC cũ; cắt APP1 làm lệch offset MakerNote. Thay bằng dựng lại IPTC và ghi 0 lên vùng IFD1 tại chỗ.
- **Gửi nguyên ảnh vượt trần khi không biến đổi được** — phá cam kết trần; chọn từ chối với mã lỗi và thông điệp gom nhóm.
- **Attribute HTML `image-resize` (JSON)** — policy chứa hàm (`processor`) và nhiều số; chỉ là property / option JS.

## Hệ quả

- Ba module mới thuần logic, không DOM: `src/utils/image-bytes.js` (sniff, JPEG / PNG / EXIF / IPTC / XMP), `image-metadata.js` (vá, dựng, viết lại, CRC32), `image-resize.js` (policy, quyết định, engine, hàng đợi). `td-dropzone.js` import `image-resize.js` (đổi `module-graph.json`).
- Một property mới (`imageResize`), hai trạng thái dòng (`queued`, `optimizing`), một class (`td-dropzone__retry`), một khoá `detail.added`, tập nhãn mới (`queued`, `optimizing`, `sizeChange`, `optimized`, `retry`, `retryLabel`, `pendingInvalid`, `failedInvalid`, `optimizeError`), hai case CSP (`td-dropzone.optimizing`, `td-dropzone.retry`). Không token, không attribute, không đổi PHP.
- Đánh đổi chấp nhận: chất lượng thu nhỏ trên Safari / Firefox có thể thấp hơn Chrome (bỏ qua `resizeQuality`); ảnh rất lớn có thể làm tab máy yếu bị kill (trần đầu vào + một slot giảm rủi ro, không loại trừ); ảnh Display-P3 bị chuyển sang sRGB; định dạng đặc biệt chỉ gửi nguyên hoặc bị từ chối.
- Chưa làm (v0.91.0): thả file thẳng vào lưới đang mở của picker. URL upload (`uploadFromUrl`) và bước crop không đi qua tối ưu.
