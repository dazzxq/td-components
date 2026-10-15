[Tài liệu nội bộ](../README.md) › Research

# td-cropper: kiểu khung cố định (`mode="pan"`) — kết luận tranh luận Claude × Codex

2026-10-14. Đầu vào cho plan `docs/internal/plans/cropper-pan-mode.md` (lane `cropper-pan-mode`, chưa đánh version).
Codex `gpt-5.6-sol` + `high`, 2 vòng, kết thúc **CONSENSUS**. Chưa qua `/codex-plan-review`; các mặc định UX **chưa
được owner xác nhận**.

## Yêu cầu của owner

Cropper hỗ trợ hai kiểu, chọn bằng param: **khung di chuyển trên ảnh** (hiện có, cho cắt tự do) và **khung cố định, ảnh
di chuyển bên dưới** (avatar: ảnh lớn làm hộp và mặt người bé tí ở kiểu hiện tại). Vẫn chỉ xuất toạ độ (ADR 0015).

## Đã thống nhất

- **Một element công khai**, attribute `mode="box"` (mặc định) | `mode="pan"`. Vắng attribute = đúng đường code / DOM /
  tab order / event / output hiện tại; không reflect `mode="box"`, không thêm `data-mode`. Giá trị lạ → `box`.
- **`_rect` theo px ảnh là nguồn sự thật duy nhất** cho cả hai kiểu. Không công khai zoom / offset / transform.
  Khung cố định `V`: `s = V.w / rect.w`; ảnh ở `V.x − rect.x·s`, `V.y − rect.y·s`. Kéo `Δ` màn hình = `moveBy(rect, −Δx/s, −Δy/s)`.
  Zoom nút / wheel / pinch = `scaleAround` (zoom ảnh `z` = rect × `1/z`).
- **Render**: giữ DOM; trong pan `--_tdc-box-*` = khung cố định; ảnh vẽ bằng **translate + scale trên `<img>`**
  (`transform-origin: 0 0`, `pointer-events: none`) trong `.area` hữu hạn, stage `overflow: hidden`; không dùng layout box
  khổng lồ. Biến CSSOM mới chỉ đặt khi `mode="pan"`, gỡ khi đổi mode / disconnect.
- **`_clientToModel()` phải sửa cho pan**: hiện lấy gốc từ `area.getBoundingClientRect()`; pan dùng `stageRect + _fit.x/y`
  và `_fit.scale` (`x/y` tương đối với padding box của stage).
- **Pinch phải bù dịch chuyển của điểm giữa** (code hiện chỉ scale quanh điểm giữa ban đầu): sau `scaleAround(rect0, d0/d, anchor0)`
  bù `(mid0 − midHiệnTại) / sMới` rồi clamp. Mọi gesture tính tuyệt đối từ `rect0`; không làm tròn `_rect`.
- **Giới hạn zoom**: nhỏ nhất = `fitLargest(W, H, ratio)` (cover-fit, ảnh luôn phủ khung); lớn nhất = `MIN_PX` (16) như
  kiểu hộp. Trần chất lượng ("kích thước cắt tối thiểu" theo px gốc) là tính năng chung cho cả hai kiểu, **hoãn**.
- **Tỉ lệ trong pan**: `aspect-ratio` → preset dương đầu tiên → 1. Preset `ratio: null` (tự do) không hiện.
  Đổi preset giữ **tâm + zoom tương đối** (không dùng `applyPreset`, nó reset về zoom nhỏ nhất).
- **`shape="circle"`**: chỉ là mặt nạ hiển thị, output vẫn là hình chữ nhật bao; chỉ nhận khi tỉ lệ hiệu lực = 1, khác
  thì cảnh báo một lần + về `rect`.
- **Focal**: ẩn công cụ và điểm focal trong pan; giá trị focal cũ đi qua nguyên vẹn (không xoá).
- **Bàn phím / trợ năng**: focus proxy duy nhất là `.td-cropper__box` (nhãn kiểu "Ảnh trong vùng cắt"); mũi tên dịch
  **ảnh** theo hướng nhìn thấy (rect đi ngược dấu), Shift ×10, `+` / `−` zoom; handle ẩn + rời tab order + rời a11y tree;
  live region giữ debounce 400 ms.
- **Wheel / pinch bắt trên toàn stage** như kiểu hộp.
- **Nơi nhúng**: `TdCropper.openDialog({ mode, shape })`; `TdMediaPicker.open({ crop: { mode, shape, … } })`;
  `td-media-field` / `td-media-gallery` dùng attribute `crop-mode` / `crop-shape`. Cả đường chọn ảnh mới lẫn nút sửa crop
  truyền cùng giá trị xuống `openCropDialog()`.
- **CSP**: CSS pan chỉ nối thêm dưới `td-cropper[mode="pan"]`, không sửa khai báo hiện có; baseline cũ (`free`,
  `locked-focal`, `loading`, `error`) nguyên byte; thêm state `pan-square`, `pan-circle`. Không thêm custom property mới
  vào danh sách snapshot chung.
- **Helper thuần mới có test** (trong `crop-geometry.js`): `panViewport`, `panDisplay`, `panByDisplayDelta`, `panPinch`,
  `changePanRatio`. Không tạo view class / subclass ở bản đầu.
- **Test phải có**: dấu kéo đảo; neo không đổi khi chưa clamp; clamp bốn biên; pinch vừa scale vừa dịch; đổi mode lúc
  chạy (huỷ gesture trước); resize stage không đổi output; chưa biết natural size; ảnh < 16 px; crop ban đầu lệch tỉ lệ;
  preset giữ zoom tương đối; circle + tỉ lệ ≠ 1; **1:1 ra pixel nguyên vuông tuyệt đối** ở bốn góc; mọi test / golden
  kiểu hộp cũ giữ nguyên. Nghiệm thu trợ năng = test tự động trên accessibility tree, 3 engine.

## Không làm ở bản đầu (đánh đổi có chủ đích)

- **Nút dịch ảnh thay cho kéo (WCAG 2.5.7)**: không thêm. Cả hai kiểu hiện chỉ có bàn phím làm thay thế; ghi rõ đánh
  đổi này cho **cả hai kiểu** trong `docs/guides/accessibility.md`, không viết như đã đạt tiêu chí.
- Xoay ảnh: cần mở lại hợp đồng `CropValue` (ADR 0015), không liên quan `mode` / `shape`.
- Kiểm tay NVDA / VoiceOver / TalkBack: tuỳ chọn trước phát hành, không phải tiêu chí.

## Chờ owner chốt

1. Tên `mode="box" | "pan"` và `shape="circle"`.
2. Có thêm 4 nút dịch ảnh (cho cả hai kiểu, bản riêng) không. Mặc định: không.
3. Crop 1:1 ép vuông tuyệt đối theo pixel nguyên. Mặc định: có.
4. Có đưa "kích thước cắt tối thiểu" vào roadmap không, hay chờ site yêu cầu.
