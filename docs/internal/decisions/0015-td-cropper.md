# ADR 0015 — `td-cropper`: tự viết, chỉ xuất toạ độ, zoom = cỡ khung, không bao giờ tạo pixel

Trạng thái: chấp nhận (2026-10-04). Nguồn: plan [v0.35.0-cropper](../plans/v0.35.0-cropper.md) quyết định 1-22, 33
(owner uỷ quyền; `/codex-plan-review` 2 vòng — R1 bỏ API kích thước tối thiểu công khai, R2 field luôn đặt `crop` ở
`open()`); yêu cầu dsuite #13 (`dienthoaihay/docs/06-TD-COMPONENTS-REQUESTS.md`); research dsuite
`17-codex-media-picker-r2.md` §3-4; [ADR 0013](0013-media-picker-boundary.md) QĐ 3, 6.

## Bối cảnh

dsuite cần cắt ảnh theo từng chỗ dùng (OG 1.91:1, thumb 3:2, bìa 3:1, thẻ 64:9…) + điểm trọng tâm, và **chỉ cần toạ
độ**: server / CDN tự cắt từ ảnh gốc. ADR 0013 QĐ 6 đã chốt `name[crop]` JSON v1 từ v0.32 và hứa v0.35 "chỉ thêm UI sửa
crop". dcms2 có crop bằng CropperJS: bấm "Chèn" → modal crop → `getCroppedCanvas()` → JPEG → **upload file mới**. Cách đó
nhân bản file, mất chất lượng (nén lại), không sửa lại được, và cần đọc pixel (CORS, tainted canvas).

Lựa chọn thư viện:

- **CropperJS v1**: ghi `style="…"` lên phần tử (vỡ CSP strict, ADR 0005 / 0008) và sinh ra `getCroppedCanvas` — đúng
  thứ phải cấm.
- **CropperJS v2**: Web Components **có Shadow DOM** (cấm, ADR 0001), API khác hẳn.
- Thư viện khác (react-easy-crop, croppie…): framework, inline style, hoặc canvas.
- Mọi lựa chọn đều thêm dependency runtime — trái luật kit (ship source, không dependency).

Phần thật sự cần (khung, 8 tay nắm, zoom, bàn phím, pinch) nhỏ, và hình học tách được thành hàm thuần test bằng node.

## Quyết định

1. **Tự viết, không CropperJS, không dependency.** `src/utils/crop-geometry.js` (thuần: `fitLargest`, `resizeFrom`,
   `scaleAround`, `applyPreset`, `normalizeInitial`, `toOutput`, `ratioMismatch`, `wheelFactor`…; node test + fuzz 10 000
   ca có seed), `src/form/td-cropper.js` (`<td-cropper>`, extends `TdBaseElement`, Light DOM, **không** form-associated
   — giá trị form nằm ở media field), `src/feedback/crop-dialog.js` (hộp thoại nội bộ dùng chung cho picker + field,
   `openDialogLayer` + DOM `td-modal`; public qua `TdCropper.openDialog()`), `src/styles/components/cropper.css`.
   Subpath `./cropper`, barrel export `TdCropper`.
2. **Chỉ toạ độ, không bao giờ tạo pixel** (vĩnh viễn, không phải hoãn): không `<canvas>`, `toBlob`, `toDataURL`,
   `getImageData`, `fetch` ảnh, `createObjectURL`, upload, thuộc tính `crossorigin`. Guard test tĩnh trên ba file. Kết
   quả `CropValue = { normalized, pixels?, aspectRatio }` — đúng `UsageDraft.crop` của ADR 0013 — + `focalPoint`.
3. **Không gian mô hình = pixel ảnh gốc theo hướng hiển thị.** Kích thước gốc từ `natural-width/height`
   (`asset.width/height`); không có thì từ ảnh tải về **và `pixels` bị bỏ** (có thể là bản thu nhỏ). Có kích thước gốc mà
   ảnh tải về lệch tỉ lệ > 1 % → `error` `ratio` (**fail closed**: ảnh xem trước bị cắt sẵn ⇒ toạ độ sai). Ảnh nguồn
   (`urls.preview`, `preview-src`) phải là ảnh nguyên — hợp đồng ghi ở docs picker / field. EXIF do server chuẩn hoá
   (re-encode upload đã bắt buộc), kit không đọc EXIF.
4. **Một hàm làm tròn `toOutput()`**: `pixels` nguyên (round rồi kẹp trong ảnh, ≥ 1); `normalized` tính **từ `pixels`**
   (một nguồn sự thật), 6 chữ số, `x + width ≤ 1` bảo đảm ⇒ luôn qua `parseCrop` (JS + PHP); toàn ảnh ra đúng 0 / 1;
   `aspectRatio` 4 chữ số.
5. **Toàn ảnh = `null`** ở tầng tích hợp (picker, field, `openDialog`) — "dùng nguyên ảnh", đúng nghĩa `name[crop]=null`
   đã chốt. Bản thân element luôn trả một hình chữ nhật.
6. **Zoom = đổi cỡ khung quanh một điểm neo** (× 0.9 / × 1/0.9; neo tâm khung, con trỏ, trung điểm pinch; wheel
   `exp(deltaY · 0.002)` kẹp `[0.8, 1.25]`). Không có zoom khung nhìn: mọi thao tác đều đổi kết quả (không trạng thái ẩn),
   hình học thuần, test được. Phóng đại khung nhìn để chỉnh tinh = non-goal.
7. **`MIN_PX = 16` là hằng nội bộ** cho tương tác (mỗi cạnh; khoá tỉ lệ: cạnh ngắn), không có API công khai
   `min-crop-*` / `crop.minWidth` (review R1): chỉ chặn kéo / zoom / phím, không validate đầu vào. Trần chất lượng là việc
   của server (`pixels`).
8. **Bàn phím đầy đủ, toạ độ vật lý**: Tab toolbar (radiogroup preset một tab stop) → khung → 4 góc → điểm; mũi tên 1 % /
   Shift 10 %, `+` / `-` zoom; ← luôn sang trái kể cả RTL. Tay nắm cạnh chỉ chuột / chạm. Live region riêng, debounce 400 ms.
9. **CSSOM, không inline style**: vị trí bằng custom property riêng `--_tdc-*` trên host (gỡ khi disconnect), vùng mờ =
   `box-shadow` lan rộng. Container `td-cropper` (< 480 toolbar hai hàng); hộp thoại theo viewport (ADR 0014).
10. **Picker / field**: bước cắt sau "Chèn" (như dcms2), không nút "Cắt" trong panel chi tiết (crop là dữ liệu **của chỗ
    dùng**, không của asset); field `croppable` + nút "Cắt ảnh"; `name[focal]` opt-in — ghi ở
    [ADR 0013 › Bổ sung v0.35](0013-media-picker-boundary.md#bổ-sung-v035).

## Hệ quả

- Không có file ảnh mới, không nén lại, crop sửa lại được bất kỳ lúc nào; một ảnh có nhiều crop ở nhiều chỗ dùng. Server
  / CDN phải biết cắt theo toạ độ — URL biến đổi công khai **do server ký** từ giá trị đã lưu, không nhận crop tuỳ ý từ
  client (security-model §6 Bổ sung v0.35).
- Kit giữ trọn CSP strict, không CORS, không dependency; chi phí là tự bảo trì ~1 module hình học + 1 element (đổi lại có
  fuzz test và engines test 3 trình duyệt).
- Không có: xoay / lật, phóng đại khung nhìn, vẽ khung mới bằng kéo ngoài khung, crop khi chọn nhiều / video / file, nhiều
  crop cho một usage, helper PHP / SSR cho `<td-cropper>` (cắt cần JS), xem trước kết quả dạng thumbnail. Muốn thêm thì
  mở ADR mới.
- Site không chuẩn hoá EXIF ở server sẽ nhận toạ độ theo ảnh **đang hiển thị** — ghi rõ là trách nhiệm server.
- **⚠ Site phải tự xử lý** (bổ sung v0.36, plan v0.36.0 M12): endpoint / CDN biến toạ độ thành ảnh là máy xử lý ảnh
  công khai của **site** — URL ký HMAC-SHA256, allowlist bề rộng / định dạng, trần kích thước, cache hai tầng, rate limit
  cache miss, phân quyền ảnh riêng tư là **bắt buộc**: [guides/media-renditions.md](../../guides/media-renditions.md),
  [security-model §7](../security-model.md#7-trách-nhiệm-của-site). Kit không ship helper ký URL / endpoint.
- Bổ sung v0.36 (plan QĐ 70): wheel trên stage có **giảm chấn trackpad** — `deltaY` nhỏ (`deltaMode` 0, `|deltaY|` < 50)
  cộng dồn theo frame, mỗi frame một bước zoom kẹp ± 10 % (`dampedWheelFactor`, `WHEEL_FRAME_CAP`); nấc chuột (≥ 50 px
  hoặc `deltaMode` dòng / trang) giữ bước `wheelFactor` như QĐ 6. Chỉ chặn cuộn trang khi con trỏ trên stage.
- Docs người dùng: [components/cropper.md](../../components/cropper.md).
