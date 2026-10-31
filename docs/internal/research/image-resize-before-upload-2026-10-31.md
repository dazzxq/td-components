# Resize ảnh ở trình duyệt trước khi upload (research, 31/10/2026)

Owner (31/10): "khi upload cần resize ở frontend, mỗi site một chất lượng (vd JPEG 90%, max 5MB, max 12MP; ảnh Sony
a7C II 30MB 33MP về trần)". Owner dặn: research + think Codex thật kỹ, CHƯA làm, báo cáo phương án cuối.

Phiên Codex: `.codex-review/sessions/codex-think-about-20261030-001` (gpt-5.6-sol high). R1 + R2 xong, R2 = CONSENSUS
kiến trúc; R3 = soát kịch bản (A input, B size, C orientation, D memory, E output, F metadata, G màu, H config, I UX,
J tích hợp, K test).

## Đồng thuận (R1-R2)
- Native, không dependency: `createImageBitmap(file, {resizeWidth, resizeHeight, resizeQuality:'high',
  imageOrientation:'from-image'})` → canvas đúng kích thước đích → `toBlob` có giới hạn số lần. Kiểm kích thước bitmap
  trả về (engine có thể bỏ qua option); option bị reject → decode không resize rồi vẽ.
- v1 KHÔNG Worker (main thread, mỗi lúc 1 ảnh). Lõi trung lập: parser header + tính kích thước + vòng tìm quality
  dùng adapter surface/encoder bơm vào; sau này thêm OffscreenCanvas/Worker nếu đo thấy long task > ~100 ms.
- Đọc header có giới hạn (JPEG: SOF0-2 + EXIF 0x0112 chỉ để biết đảo trục 5-8, dừng ở SOS, 256 KiB; PNG: IHDR + acTL
  trước IDAT theo chunk; GIF/WebP không parse). Không decode 2 lần.
- Giới hạn hội (AND): maxPixels, maxBytes, maxWidth/maxHeight (mặc định KHÔNG đặt). Scale đầu =
  min(1, maxW/w, maxH/h, sqrt(maxPixels/(w*h))). Quality: start → floor → nhị phân ~4 lần; floor vẫn quá →
  thu kích thước sqrt(maxBytes/bytes)*0.95; tổng ≤ ~10-12 encode, ≤ 3 vòng kích thước; giữ ứng viên nhỏ nhất hợp lệ.
- Ảnh đã hợp lệ → không nén lại (giữ EXIF/hash). JPEG resize+reencode; PNG giữ alpha, thu kích thước để đạt bytes;
  GIF/APNG/WebP/AVIF/SVG/HEIC passthrough; passthrough hoặc lỗi mà vi phạm trần bắt buộc → REJECT, không lén upload.
- Giới hạn đầu vào tách khỏi đầu ra: `upload.maxSize` hiện chặn trước hook → 5MB sẽ từ chối file 30MB. Cần
  maxInputBytes / maxInputPixels / maxInputSide (16384) làm chặn bom giải nén.
- Cấu hình qua `configureDefaults` + override từng lần mở, normalize + freeze, opt-in. Hook `imageProcessor(file,
  {policy, signal, onPhase})` thay cả engine (Pica/jSquash do site tự lo). Kiểm `blob.type` (Safari không encode WebP).
- Phase job: queued → optimising → uploading → done/error; progress không giả %. AbortSignal: kiểm giữa các bước,
  bỏ kết quả muộn, close bitmap, canvas về 0.
- Server vẫn là ranh giới tin cậy; nén lại đổi hash → dedup exact-hash lệch giữa trình duyệt.
- Ra bản: v0.90.0 = hàng đợi job + resize trong dialog upload; v0.91.0 = thả vào lưới (đổi thứ tự đã báo owner →
  CẦN OWNER DUYỆT).
- Mặc định gợi ý: maxPixels 12e6, maxBytes 5 MiB, quality 0.90 start / 0.65 floor, maxWidth/Height null, maxInputSide 16384.

## Câu hỏi owner (gom sau R3)
MB hay MiB, per-file; 0.9 là start hay sàn; giữ EXIF ngày chụp/bản quyền?; xoá GPS cả khi ảnh đã hợp lệ (ép nén lại)?;
PNG screenshot nặng: thu kích thước hay đổi sang JPEG; đổi thứ tự v0.90/v0.91; Safari/iOS tối thiểu.

## Kết quả R3 (CONSENSUS, phiên đã finalize)
Bảng kịch bản đầy đủ A1-K7 + defaults + mã lỗi + hợp đồng adapter (`optimization` trong options thứ 2):
[image-resize-codex-r3-2026-10-31.md](image-resize-codex-r3-2026-10-31.md). Đã báo owner, chờ owner chốt các
OWNER DECISION trước khi viết plan v0.90.0.

## Owner chốt (31/10)
1. OK v0.90.0 = hàng đợi job + resize trong dialog; v0.91.0 = thả vào lưới.
2. OK 3 chế độ metadata; owner hỏi "resize mà vẫn giữ metadata như Cloudflare được không" → đề xuất: JPEG→JPEG chép lại
   segment APP1 EXIF / XMP / APP13 IPTC từ file gốc vào file mới (Orientation → 1 cả EXIF lẫn XMP, cập nhật
   PixelX/YDimension, bỏ thumbnail IFD1, KHÔNG chép ICC (pixel đã là sRGB), bỏ C2PA/APP11 + MPF/gain map); chế độ giống
   Cloudflare `metadata`: keep | keep-no-gps | copyright | none (GPS xoá tại chỗ, không dời offset). Chờ owner chọn mặc định.
3. OK giữ PNG, thu kích thước.
4. Panorama vượt maxInputSide/maxInputPixels: TỪ CHỐI.
5. OK không làm fallback <img> (không đòi img-src blob:).
6. Kit KHÔNG đặt số trần mặc định: site tự khai báo; docs phải cảnh báo đồng bộ trần FE và BE (cùng đơn vị byte).
- Owner chốt mặc định metadata = `keep` (giống Cloudflare, giữ cả GPS). Yêu cầu: think Codex tìm toàn bộ gap + kịch bản trước khi viết plan.

## Codex metadata R1 (phiên codex-think-about-20261030-002) — bản đầy đủ: image-resize-metadata-codex-r1-2026-10-31.md
- EXIF: chỉ 1 APP1 Exif hợp lệ; sửa tại chỗ (Orientation SHORT IFD0 → 1, PixelX/Y SHORT|LONG), thiếu tag thì để thiếu;
  giữ nguyên bố cục TIFF → MakerNote còn đúng offset. IFD1 thumbnail: bỏ.
- IPTC: dựng lại APP13 chỉ từ resource 0x0404 (không chép nguyên APP13: kèm thumbnail/ICC cũ).
- XMP: sửa an toàn cần parser XML namespace-aware (DOMParser = sink Trusted Types) → v0.90 BỎ XMP khi phải nén lại,
  báo `partial` (OWNER DECISION). Extended XMP: bỏ.
- Giữ ICC do encoder mới sinh, không chép ICC gốc. Thứ tự: SOI, APP1 Exif, (XMP), APP13, rồi phần encoder.
- Ảnh đạt trần ở chế độ keep-no-gps/copyright/none: viết lại KHÔNG MẤT DỮ LIỆU ở mức marker/chunk (giữ entropy data).
- JPEG đặc biệt (MPF/MPO, gain map, C2PA, dữ liệu đuôi): chỉ gửi nguyên; cần biến đổi → từ chối
  `special-content-transform-required` hoặc processor của site.
- Metadata giữ lại tính vào maxBytes, không lén bỏ để đạt trần → `metadata-too-large`.
- Lỗi mới: metadata-invalid, metadata-too-large, metadata-policy-unsupported, special-content-transform-required.
- Hiện trạng: dialog upload chạy mọi file ngay, chưa có hàng đợi; upload.maxSize chặn file gốc; hàng lỗi chưa có nút thử lại.
- Docs: cảnh báo GPS của `keep` ngay cạnh option.

## Codex metadata R2: CONSENSUS (bản đầy đủ image-resize-metadata-codex-r2-2026-10-31.md). Không còn câu hỏi owner.
- XMP: chỉ ở `keep`, chép NGUYÊN 1 gói Standard XMP UTF-8 khi không có Extended XMP / HasExtendedXMP và không chứa
  tên nào trong danh sách chặn (Orientation, PixelX/YDimension, ImageWidth/Length, X/YResolution, ResolutionUnit,
  ColorSpace, ICCProfile, PhotometricInterpretation, BitsPerSample, SamplesPerPixel, YCbCrSubSampling,
  CompressedBitsPerPixel, NativeDigest, LegacyIPTCDigest, DocumentID, InstanceID, OriginalDocumentID, DerivedFrom,
  History, MetadataDate, ModifyDate, camera-raw-settings, crs:); có → bỏ XMP. keep-no-gps/copyright/none: bỏ XMP.
- Thứ tự: SOI → EXIF đã vá → XMP (nếu đủ điều kiện) → APP13 chỉ IPTC 0x0404 → phần encoder.
- EXIF lỗi (vòng, chồng, ngoài biên…) → bỏ họ EXIF, báo partial, không làm hỏng upload. Định dạng gửi nguyên ở chế độ
  riêng tư → từ chối `metadata-policy-unsupported`.
- Adapter nhận exifOutcome / xmpOutcome (exact|verbatim|dropped|absent) / iptcOutcome / gpsPresent / contentCredentials.
- BƯỚC TIẾP: viết plan v0.90.0 (commit kèm docs research) → /codex-plan-review sol/high.
