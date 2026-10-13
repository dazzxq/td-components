# cropper-pan-mode — `td-cropper` hai kiểu thao tác: khung di chuyển (`box`, như cũ) và khung cố định, ảnh di chuyển (`pan`)

Trạng thái: **bản nháp plan — chưa qua `/codex-plan-review`, chưa đánh version** (phiên chính đổi tên file thành
`vX.Y.Z-cropper-pan-mode.md`). Nhánh `cropper-pan-mode` từ `main` f7d6d97 (v0.72.0). Chỉ có plan, chưa có code.

Ký hiệu: **MỚI** = chưa có trong code, plan này thêm. Mọi tên khác đã grep thấy trong code ở f7d6d97.

## Tóm tắt

Owner muốn `td-cropper` hỗ trợ cả hai kiểu, chọn bằng param:

- **`box`** (mặc định, y như hiện tại): ảnh contain-fit đứng yên, người dùng kéo / đổi cỡ khung. Dành cho cắt tự do.
- **`pan`** (MỚI): khung đứng giữa vùng cắt với cỡ cố định trên màn hình, người dùng kéo để dịch ảnh, zoom để phóng ảnh.
  Dành cho avatar: mặt người luôn to bằng khung, không còn cảnh khung bé tí trên ảnh lớn.

Trả lời câu hỏi của owner: **có, làm bằng param được, và rẻ hơn dự kiến.** Đã kiểm bằng code thật: model rect theo px
ảnh (`this._rect` + `crop-geometry.js`) dùng nguyên cho cả hai kiểu; kiểu `pan` chỉ là **một cách tính `_fit` khác**
(vị trí + cỡ ảnh trên màn hình suy ra từ rect, thay vì contain-fit) cộng ánh xạ input đảo dấu. Hệ quả:

- **Không thêm node DOM** (`SHELL` giữ nguyên), **không thêm biến CSSOM** (vẫn 10 biến `--_tdc-*` trong `VARS`),
  không thêm event, không đổi `CropValue`. Kiểu `box` không đổi một dòng hành vi nào.
- CSS mới đều nằm dưới `td-cropper[data-mode="pan"]` / `td-cropper[data-shape="circle"]` (hai attribute trạng thái MỚI,
  chỉ có mặt khi bật) nên computed style của mọi state CSP cũ không đổi.

Chia hai mốc: **M1** lõi cropper (hình học + element + CSS + docs cropper), **M2** truyền param xuống các nơi nhúng
(crop dialog, media field, media gallery, media picker, helper PHP). M2 phụ thuộc M1, làm tuần tự.

## Nguồn

- Yêu cầu owner (2026-10-14): "Khung cố định, ảnh di chuyển bên dưới: dùng cho avatar. Codex chỉ ra rằng kiểu khung di
  chuyển của td làm mặt người bé tí khi ảnh lớn, khó căn. Khung di chuyển trên ảnh: cho cắt tự do sau này. Tao muốn td
  cropper hỗ trợ cả 2 kiểu, custom bằng param."
- Plan gốc [v0.35.0-cropper](v0.35.0-cropper.md), [ADR 0015](../decisions/0015-td-cropper.md) (tự viết, chỉ xuất toạ
  độ, zoom = cỡ khung, không tạo pixel).
- Luật: [conventions](../conventions.md), [minimal surfaces](../design/liquid-glass.md), [touch](../design/touch.md),
  [security-model](../security-model.md).

## Hiện trạng cần biết (đã đọc code)

`src/form/td-cropper.js`:

- Nguồn sự thật là `this._rect` (`Rect` px ảnh gốc, `W × H`). Output chỉ đi qua `toOutput()` trong getter `crop`.
- `_measure()` đọc padding của `.td-cropper__stage`, gọi `containFit(W, H, bw, bh)` và lưu
  `this._fit = { scale, x, y, w, h }` (ảnh trong stage, px màn hình). `_renderVars()` ghi `--_tdc-img-x/y/w/h` từ `_fit`
  và `--_tdc-box-x/y/w/h` từ `modelToDisplay(rect, _fit.scale)` (toạ độ khung **tương đối so với ảnh**).
- CSS (`cropper.css`): `.td-cropper__area` có `width / height = --_tdc-img-w/h`, `transform: translate(--_tdc-img-x/y)`;
  `.td-cropper__box` nằm **trong** area, `transform: translate(--_tdc-box-x/y)`; lớp mờ ngoài khung là
  `box-shadow: 0 0 0 200vmax var(--td-cropper-dim)` của chính khung, bị `.td-cropper__stage { overflow: hidden }` cắt.
- `_clientToModel(cx, cy)` = `(client − area.getBoundingClientRect()) / _fit.scale` — đúng với mọi `_fit`, không giả
  định contain-fit.
- Input: `_onDown` chỉ bắt đầu cử chỉ khi bấm trong khung / tay nắm / điểm trọng tâm (`kind` = `resize | focal | move |
  tap`); `_step()` tính tuyệt đối từ `g.rect0` (`moveBy`, `resizeFrom`, `scaleAround`); `_startPinch` neo ở
  `_clientToModel(trung điểm)` và dùng `scaleAround(g.rect0, g.d0 / d, g.anchor, …)`; `_onWheel` dùng `wheelFactor` /
  `dampedWheelFactor` + `scaleAround` quanh con trỏ; `_zoom(k)` quanh tâm khung; `_onKey` mũi tên = `moveBy` với
  `stepFor(W | H, shift)`, `+ / −` = `_zoom`.
- Tỉ lệ: `_ratio()` = `_lock` (attribute `aspect-ratio`) hoặc `ratio` của preset đang chọn (`null` = tự do);
  `data-locked` có mặt khi `_ratio() != null` (CSS ẩn tay nắm cạnh).

`src/utils/crop-geometry.js` (thuần):

- `scaleAround(r, k, anchor, o)`: `k` kẹp trong `[kMin, kMax]`, `kMin` từ `minSize()` (dựa `MIN_PX = 16`),
  `kMax = min(W / r.w, H / r.h)`; toạ độ mới `x = ax − (ax − r.x)·k` — điểm neo giữ **cùng vị trí tương đối trong
  khung**; cuối cùng `clampRect`. Rect luôn nằm trong ảnh.
- `moveBy` = dịch + `clampRect`. `fitLargest` / `applyPreset` / `normalizeInitial` cho rect lớn nhất của một tỉ lệ.

Ba nơi gọi `openCropDialog` (đúng một hàm, `src/feedback/crop-dialog.js`): `td-media-field.js` (dòng 1104, và option
`crop` gửi cho picker ở dòng 892-894), `td-media-gallery.js` (1690), `td-media-picker.js` (2572, lấy cấu hình từ
`s.opts.cropResolved` do `resolveOptions` trong `src/utils/media-picker-core.js` dòng 668-687 tạo). Helper PHP
`td_media_field` / `td_media_gallery` (`php/td.php`) có `crop_ratio` và danh sách tên attribute dành riêng.

Cổng CSP: `test/csp/matrix.json` có **4** state của `td-cropper` (`free`, `locked-focal`, `loading`, `error`) và 3 state
ở nơi nhúng (`td-media-field.croppable`, `td-media-gallery.crop-dialog`, `td-media-picker.crop-step`); tổng 422 state /
422 file baseline (đo bằng `node -e` trên `matrix.json` + `ls test/csp/baseline | wc -l` ở f7d6d97 — đo lại khi làm).
`test/csp/style-props.json` (82 prop) đã có đủ 10 biến `--_tdc-*`, `transform`, bốn `border-*-radius`, `cursor`,
`touch-action`, bốn `padding-*`.

## Kiểm hướng kỹ thuật đã chốt (kết luận: khả thi, không cần phương án thay)

Gọi `frame = { x, y, w, h }` là khung trên màn hình (px, trong content box của stage). Trong kiểu `pan`:

```
s      = frame.w / rect.w                      (rect luôn đúng tỉ lệ khung ⇒ cũng = frame.h / rect.h)
_fit   = { scale: s, x: pl + frame.x − rect.x·s, y: pt + frame.y − rect.y·s, w: W·s, h: H·s }
box    = modelToDisplay(rect, s)               (⇒ box.w = frame.w, box.h = frame.h; vị trí tương đối so với ảnh)
```

Tức là ghi **đúng 8 biến sẵn có** với giá trị khác: area (ảnh) to hơn stage và có toạ độ âm, khung nằm trong area ở vị
trí bù lại, nên trên màn hình khung đứng yên ở `frame`. Stage `overflow: hidden` cắt phần ảnh thừa; `box-shadow` 200vmax
của khung vẫn là lớp mờ. Vì rect luôn nằm trong ảnh (`clampRect`), khung không bao giờ lộ vùng ngoài ảnh.

| Hàm hiện có | Dùng lại trong `pan` | Ghi chú |
|---|---|---|
| `containFit` | có | tính khung: `containFit(ratio, 1, bw, bh)` cho rect lớn nhất của tỉ lệ nằm giữa content box |
| `modelToDisplay` | có, nguyên | với `scale = s` |
| `moveBy` | có | kéo ảnh = `moveBy(rect0, −dx / s, −dy / s, W, H)` (đảo dấu); bàn phím cũng vậy |
| `scaleAround` | có, nguyên | nút / phím / wheel / pinch. Vì điểm neo giữ vị trí tương đối trong khung và khung cố định trên màn hình, điểm ảnh dưới con trỏ **đứng yên trên màn hình** — đúng "zoom quanh con trỏ" mà không cần công thức mới |
| `clampRect`, `minSize`, `MIN_PX` | có, nguyên | zoom tối đa = `minSize()`; zoom tối thiểu = `kMax` của `scaleAround` = rect lớn nhất của tỉ lệ |
| `fitLargest`, `applyPreset`, `normalizeInitial` | có, nguyên | khung ban đầu, đổi preset (giữ tâm), "Đặt lại" |
| `wheelFactor`, `isTrackpadDelta`, `dampedWheelFactor`, `ZOOM_STEP`, `stepFor`, `toOutput`, `ratioMismatch` | có, nguyên | `wheelFactor < 1` = khung model nhỏ lại = ảnh phóng to: cùng chiều với hiện tại |
| `_clientToModel`, `_startPinch`, `_onWheel`, `_zoom`, `_apply`, `_changed`, `_finish`, `_reset`, `_queueLive` | có | `_startPinch` thêm trung điểm ban đầu; còn lại không đổi |
| `_measure`, `_renderVars`, `_onDown`, `_step`, `_onKey`, `_ratio`, `_focalTool`, `_syncDisabled`, `_syncDesc`, `_defaultPresetIdx` | sửa có nhánh | nhánh `pan` MỚI, nhánh `box` giữ nguyên từng dòng |
| `resizeFrom`, `clampFocal` (qua UI), `TAP_PX`, `SMALL_BOX` | không dùng trong `pan` | không có tay nắm, không có công cụ trọng tâm |

Hàm thuần MỚI trong `crop-geometry.js` (để test node + kiểm đột biến, element chỉ gọi):

- `panFrame(bw, bh, ratio)` **MỚI** → `{ x, y, w, h }` px nguyên (làm tròn để viền khung không rung): bọc `containFit`.
- `panFit(rect, frame, W, H)` **MỚI** → `{ scale, x, y, w, h }` theo công thức trên (chưa cộng padding).
- `panBy(rect, dxDisplay, dyDisplay, scale, W, H)` **MỚI** = `moveBy(rect, −dx / scale, −dy / scale, W, H)`.
- `panPinch(rect0, k, anchor, dMid, frameW, o)` **MỚI** = `scaleAround(rect0, k, anchor, o)` rồi `panBy` theo độ dịch
  trung điểm hai ngón (`dMid`, px màn hình) với `scale = frameW / rect.w` sau khi zoom — hai ngón vừa chụm vừa kéo thì
  ảnh đi theo (kiểu `box` hiện không theo trung điểm; không đổi kiểu `box`).

## Phạm vi

**Làm:**

- M1: attribute `mode` + `shape` trên `td-cropper`, nhánh render / input `pan`, CSS, một token, một nhãn, story, test,
  state CSP mới, docs `cropper.md`, ADR mới.
- M2: option `mode` / `shape` của `openCropDialog` (= `TdCropper.openDialog`); attribute `crop-mode` / `crop-shape` của
  `td-media-field` và `td-media-gallery`; `crop.mode` / `crop.shape` của media picker; `crop_mode` / `crop_shape` của hai
  helper PHP; docs tương ứng.

**Không làm:**

- Không tạo pixel: không canvas, blob, `crossorigin`, không request riêng (guard test hiện có trong
  `crop-geometry.test.js` phải vẫn xanh, không sửa).
- Không đổi `CropValue`, event, `detail`, FormData, `source` (không thêm giá trị `source` mới: kéo ảnh = `pointer`).
- Không xoay / lật ảnh, không quán tính sau khi thả, không double-tap zoom, không thanh trượt zoom.
- Không làm tròn ảnh xem trước của `td-media-field` / tile gallery khi `crop-shape="circle"` (đó là CSS của site; ghi một
  recipe ngắn trong docs).
- Không vẽ khung mới bằng cách kéo ngoài khung (vẫn là non-goal của v0.35).
- Không RTL: không test, không đo, không tiêu chí nghiệm thu; chỉ giữ CSS logical ở chỗ đang logical. Toạ độ khung / ảnh
  vẫn vật lý (`left / top`) như hiện tại.

## API công khai và tương thích ngược

### `td-cropper` (M1)

| Tên | Loại | Giá trị | Mặc định | Ghi chú |
|---|---|---|---|---|
| `mode` **MỚI** | attribute scalar (observed) | `box` \| `pan` | vắng = `box` | So khớp sau `trim().toLowerCase()`; giá trị lạ / rỗng = `box`, không cảnh báo |
| `shape` **MỚI** | attribute scalar (observed) | `rect` \| `circle` | vắng = `rect` | Chỉ đổi hình hiển thị; chỉ có hiệu lực khi tỉ lệ đang áp dụng là 1:1 (`!ratioMismatch(r, 1, 1, 1)`); giá trị lạ = `rect` |
| `data-mode="pan"` **MỚI** | attribute trạng thái trên host (JS đặt) | chỉ `pan` | vắng | Kiểu `box` **không** có attribute này (DOM kiểu cũ không đổi). CSS chỉ bám vào đây, không bám `[mode]` |
| `data-shape="circle"` **MỚI** | attribute trạng thái trên host | chỉ `circle` | vắng | Có mặt khi `shape="circle"` **và** tỉ lệ đang là 1:1 |
| `--td-cropper-pan-inset` **MỚI** | token (`@layer td.tokens`, `:root`) | độ dài | `24px` | Khoảng cách tối thiểu từ mép vùng cắt tới khung trong kiểu `pan` |
| `TdCropper.labels.panHelp` **MỚI** | nhãn | chuỗi | `'Mũi tên: dịch ảnh dưới khung, Shift + mũi tên: bước lớn, + / −: phóng to / thu nhỏ ảnh.'` | Thay `boxHelp` trong mô tả của khung khi `pan` |

Không thêm property JS cho `mode` / `shape` (attribute scalar là đủ, đúng quyết định đã chốt). Không thêm event, method.

Hành vi `pan` (theo mặc định đề xuất ở "Câu hỏi mở"):

- Luôn có tỉ lệ: `_ratio()` trả `_lock`, không thì `ratio` của lựa chọn đang chọn, không thì **1**. Danh sách lựa chọn
  hiển thị là `_choices()` **MỚI** = `_presets()` bỏ các mục `ratio: null`; mặc định chọn mục có tỉ lệ 1 (sai số 1e-4),
  không có thì mục đầu. Getter công khai `presets` vẫn trả danh sách đầy đủ (không đổi). Danh sách rỗng hoặc có
  `aspect-ratio` ⇒ ẩn nhóm tỉ lệ (dùng cờ `hidden` sẵn có).
- `data-locked` luôn có (hệ quả của `_ratio() != null`); tay nắm góc + cạnh ẩn bằng CSS, góc có `tabIndex = -1`.
- Công cụ trọng tâm tắt: `_focalTool()` trả `false`; nút `.td-cropper__focal-toggle` và `.td-cropper__focal` ẩn. Giá trị
  focal đang có (attribute `focal` / property `focalPoint`) **giữ nguyên và vẫn trả ra** ở `focalPoint` / `getResult()`.
- Đổi `mode` lúc đang chạy: huỷ cử chỉ đang dở (`_finish(false)`), dựng lại nhóm tỉ lệ (giữ tỉ lệ đang chọn nếu còn
  trong danh sách mới), vào `pan` thì `applyPreset(rect, ratio, W, H)` (giữ tâm), `_measure()`. Im lặng, không event —
  giống mọi thay đổi attribute khác.

**Tương thích ngược:** vắng `mode` và `shape` ⇒ không có `data-mode` / `data-shape`, mọi nhánh mới không chạy,
`_choices()` trả đúng `_presets()`. Site đang tự đặt attribute tên `mode` / `shape` lên `<td-cropper>` cho việc riêng sẽ
bị ảnh hưởng — rủi ro rất thấp, ghi vào `docs/upgrading`.

### Nơi nhúng (M2) — tên option ở từng nơi

| Nơi | Tên **MỚI** | Truyền xuống |
|---|---|---|
| `openCropDialog(opts)` / `TdCropper.openDialog(opts)` | `opts.mode` (`'box'` \| `'pan'`), `opts.shape` (`'rect'` \| `'circle'`) | `cropper.setAttribute('mode' / 'shape', …)` chỉ khi giá trị là `pan` / `circle` (giá trị khác: không đặt attribute) |
| `<td-media-field>` | attribute `crop-mode`, `crop-shape` (cạnh `crop-ratio` đang có; cần `usage` + `croppable`, thiếu thì bỏ qua theo `_usageFor35()` + cùng cảnh báo một lần) | `openCropDialog({ mode, shape })` ở dòng 1104 **và** `crop: { enabled, aspectRatio, allowFocalPoint, mode, shape }` gửi picker ở dòng 892 |
| `<td-media-gallery>` | attribute `crop-mode`, `crop-shape` (thêm vào `HOST_ATTRS` + `observedAttributes`) | `openCropDialog({ mode, shape })` ở dòng 1690 |
| Media picker `open()` / `configureDefaults()` | `crop.mode`, `crop.shape` | `resolveOptions` ⇒ `cropResolved = { aspectRatio, allowFocalPoint, mode, shape }` (chuẩn hoá về `'box' \| 'pan'`, `'rect' \| 'circle'`) ⇒ `_openCrop` truyền cho dialog |
| PHP `td_media_field`, `td_media_gallery` | option `crop_mode`, `crop_shape` | in attribute `crop-mode` / `crop-shape` (chỉ giá trị trong danh sách trắng; thêm hai tên vào danh sách attribute dành riêng) |

Một bộ chuẩn hoá dùng chung **MỚI** trong `src/utils/media-field-model.js` (cạnh `parseCropRatio`):
`parseCropMode(v)` → `'box' | 'pan'`, `parseCropShape(v)` → `'rect' | 'circle'`; PHP có cặp tương ứng + bảng parity JS /
PHP như `crop-ratio` đang làm.

Field luôn đặt `crop` ở `open()` (quyết định 28 của v0.35) nên `mode` / `shape` của field cũng thắng
`pickerOptions.crop` / `configureDefaults({ crop })`. Dialog không đổi kết quả: `crop: null` khi toàn ảnh
(`isWholeImage`), `changed` theo `cropChanged` / `focalChanged`. Lưu ý đã có sẵn với tỉ lệ khoá và nay đúng cho mọi
dialog `pan`: mở với `crop: null` trên ảnh không vuông thì khung ban đầu không phải toàn ảnh ⇒ "Áp dụng" trả
`changed: true`.

## Thay đổi theo file

### M1

| File | Thay đổi |
|---|---|
| `src/utils/crop-geometry.js` | + `panFrame`, `panFit`, `panBy`, `panPinch` (MỚI, thuần). Không sửa hàm cũ |
| `src/form/td-cropper.js` | `OBSERVED` + `mode`, `shape`; `_pan()` MỚI (đọc attribute); `_choices()` MỚI thay `_presets()` ở `_renderPresets`, `_syncPresetUi`, `_selectPreset`, `_onRatioKey`, `_ratio`, `_defaultPresetIdx`; `_syncMode()` / `_syncShape()` MỚI (đặt `data-mode` / `data-shape`, gọi từ `_build`, `attributeChangedCallback`, `_syncLocked`); `_measure` lưu `this._frame` MỚI khi `pan`; `_renderVars` nhánh `pan` gán `this._fit = panFit(…)` + padding rồi ghi 8 biến, không đụng `data-small-box`; `_onDown` nhánh `pan`: bấm bất kỳ đâu trong stage ⇒ `kind: 'pan'`, focus vào `.td-cropper__box`; `_step` nhánh `pan` (`panBy`) và pinch `pan` (`panPinch`); `_startPinch` lưu `mid0`; `_onKey` nhánh `pan` (dấu đảo, bước `stepFor(rect.w | rect.h, shift)`); `_focalTool()` trả `false` khi `pan`; `_syncDisabled` góc `-1` khi `pan`; `_syncDesc` dùng `panHelp`; `disconnectedCallback` không đổi (`_clearVars` đã đủ). JSDoc đầu file cập nhật |
| `src/styles/components/cropper.css` | token `--td-cropper-pan-inset`; khối luật dưới `td-cropper[data-mode="pan"]` và `td-cropper[data-shape="circle"]` (xem "CSS"). Không sửa luật cũ |
| `src/form/td-cropper.stories.js` (+ `.stories.css` nếu cần) | story mới: "Avatar: khung cố định 1:1", "Avatar tròn", "Pan + preset tỉ lệ", "Khung tròn kiểu box" |
| `src/utils/crop-geometry.test.js` | test node cho bốn hàm mới + fuzz có seed |
| `src/form/td-vXYZ-cropper-pan.engines.browser-test.js` **MỚI** | browser 3 engine; thêm vào danh sách engines trong `web-test-runner.config.js` (cạnh dòng 32) |
| `src/package-manifest.test.js` | thêm selector / token mới vào kiểm tra CSS của cropper |
| `test/csp/matrix.json` + `test/csp/baseline/` | **chỉ thêm** state + file baseline mới |
| `test/tokens/golden.json` | thêm `--td-cropper-pan-inset` (hai theme) |
| `test/fixtures/responsive-page.js`, `test/responsive/responsive.spec.mjs`, `test/touch/touch.spec.mjs` | fixture + ca mới cho `pan` |
| `test/fixtures/crop-large.png` **MỚI** | ảnh raster 4000 × 3000 ít màu (vài KB) cho ca hiệu năng |
| Sinh lại | `td.css`, `dist/` (`npm run build`), `module-graph.json` nếu đổi |

### M2

| File | Thay đổi |
|---|---|
| `src/utils/media-field-model.js` | `parseCropMode`, `parseCropShape` MỚI + bảng parity |
| `src/feedback/crop-dialog.js` | đọc `o.mode` / `o.shape`, đặt attribute lên cropper; JSDoc option. `focusBox()` không đổi (`.td-cropper__box` vẫn là điểm focus) |
| `src/form/td-media-field.js` | attribute `crop-mode` / `crop-shape` (observed, warn-once theo `_usageFor35()`), truyền ở hai chỗ |
| `src/form/td-media-gallery.js` | như field, một chỗ gọi dialog |
| `src/utils/media-picker-core.js`, `src/feedback/td-media-picker.js` | `cropResolved.mode / shape`; `_openCrop` truyền xuống; typedef `OpenMediaPickerOptions.crop` |
| `php/td.php` | `crop_mode` / `crop_shape` cho `td_media_field`, `td_media_gallery` |
| Test | node: `media-picker-core` (resolveOptions), `media-field-model` (parity), `test/php/td-ssr-media-field.test.js`, `td-ssr-media-gallery.test.js`; browser 3 engine: một file `td-vXYZ-crop-mode-passthrough.engines.browser-test.js` MỚI |

### CSS (M1, toàn bộ là luật mới, đều có tiền tố trạng thái)

```
td-cropper[data-mode="pan"] .td-cropper__stage   { --_tdc-pad: var(--td-cropper-pan-inset); cursor: grab; }
td-cropper[data-mode="pan"][data-dragging] .td-cropper__stage { cursor: grabbing; }
td-cropper[data-mode="pan"] .td-cropper__box     { cursor: inherit; }
td-cropper[data-mode="pan"] .td-cropper__handle  { display: none; }
td-cropper[data-mode="pan"][disabled] .td-cropper__stage { cursor: default; }
td-cropper[data-shape="circle"] .td-cropper__box,
td-cropper[data-shape="circle"] .td-cropper__grid { border-radius: 50%; }
td-cropper[data-shape="circle"] .td-cropper__grid { overflow: hidden; }
```

- Khung = content box của stage sau padding, nên `--td-cropper-pan-inset` đi qua `--_tdc-pad` sẵn có và `_measure()`
  vẫn đọc padding như hiện tại. Độ đặc hiệu (0,2,1) thắng luật `(pointer: coarse)` đang đặt `--_tdc-pad: 24px`.
- Hình tròn: `box-shadow` (viền tương phản + lớp mờ 200vmax) và `outline` focus đi theo `border-radius`, nên lỗ tròn
  trên lớp mờ có sẵn, không cần mask / clip-path / node mới. Khối `forced-colors` hiện có vẫn đúng (viền `Highlight` tròn).
- Không `will-change`, không `transition` mới, không `touch-action` mới (xem "Cảm ứng").

## Bảo mật và CSP

- Không có đường dữ liệu mới vào HTML: `mode` / `shape` chỉ được **so sánh với danh sách trắng** rồi đặt
  `data-mode="pan"` / `data-shape="circle"` (hằng số) bằng `setAttribute`; giá trị người dùng không bao giờ được chép
  vào DOM, class hay CSS. `SHELL` vẫn là markup hằng. Nhãn mới `panHelp` đi qua `textContent` như các nhãn khác.
- `src` vẫn qua `safeMediaUrl` (không `blob:` / `data:` / `javascript:`); `referrerpolicy="no-referrer"` giữ nguyên.
- CSP strict: không `style="…"`, không `<style>`; giá trị per-instance vẫn chỉ là `this.style.setProperty('--_tdc-…')`
  trên host (CSSOM), gỡ ở `_clearVars()`. Không thêm tên biến.
- PHP: `crop_mode` / `crop_shape` in qua bộ escape attribute sẵn có của helper, chỉ khi thuộc danh sách trắng; hai tên
  attribute mới thêm vào danh sách dành riêng để `attrs` của site không chèn được.
- Chạm input người dùng (attribute, option, PHP) ⇒ M2 cần `/codex-security-review` kèm impl review.

## Trợ năng và cảm ứng

**Bàn phím (`pan`):** focus nằm trên `.td-cropper__box` (vẫn `role="group"`, `tabindex="0"`, `aria-label` = `labels.box`,
`aria-roledescription` = `labels.boxRole`, `aria-describedby` = mô tả có giá trị hiện tại + `panHelp`). Bốn góc ra khỏi
thứ tự Tab. Mũi tên dịch **ảnh** theo hướng mũi tên (phải ⇒ ảnh sang phải ⇒ `rect.x` giảm); bước = 1 % cạnh **khung**
theo model (`stepFor(rect.w | rect.h)`, ≥ 1 px ảnh), Shift × 10 — dùng cạnh khung thay vì cạnh ảnh để khi đã phóng to một
lần bấm không nhảy quá nửa khung. `+ / =`, `− / _`, `NumpadAdd / Subtract` zoom quanh tâm khung. Escape khi đang kéo: trả
về `g.origin` như cũ. Vùng live (`_queueLive`, trễ `LIVE_MS`) đọc câu `valuePx` / `valuePct` sẵn có — vẫn đúng nghĩa
(vùng cắt trên ảnh gốc).

**Tương phản:** viền khung, vòng focus hai tông, lưới 1/3 dùng lại token cũ; vòng focus của khung vẫn nằm trên lớp mờ
(khung cách mép ≥ inset, ngoài khung luôn là lớp mờ trên ảnh hoặc trên `--td-cropper-bg`). Không token màu mới ⇒ contrast
gate không thêm cặp.

**Minimal surfaces:** lớp mờ ngoài khung là một màu phẳng `--td-cropper-dim` (không blur, không gradient, không bóng
trang trí); khung là một đường sáng + một đường tương phản — đúng công thức hiện có của cropper, không thêm bề mặt nổi.

**Cảm ứng ([touch.md](../design/touch.md)):**

- `touch-action`: stage **giữ** `none` qua đúng selector `.td-cropper__stage` đang có trong bảng — **không** thêm khai
  báo, bảng `TABLE` của `src/styles/td-touch-action.test.js` không đổi. Chỉ sửa cột "Lý do" trong touch.md (thêm "kéo /
  pinch ảnh trong kiểu `pan`"). Vuốt dọc bắt đầu trên stage không cuộn trang — đã đúng với kiểu `box` hôm nay.
- Ngưỡng kéo (luật 8): kiểu `pan` **không có hành động chạm** trên stage (công cụ trọng tâm tắt) nên không cần phân biệt
  chạm / kéo ⇒ không ngưỡng, ảnh theo ngón từ px đầu, giống `kind: 'move'` khi không có công cụ trọng tâm (`threshold:
  false`). Không dùng `dragSlop()` ở đây là có chủ đích; nếu sau này `pan` có thao tác chạm thì phải đọc `dragSlop(e.pointerType)`.
- Hình nhấn (luật 4-6): không control mới, `PRESS_TARGETS` (`src/utils/press.js`) không đổi; `cursor: grab` không phải
  `cursor: pointer` nên lint `checkPressed` không đòi luật nhấn (tiền lệ: `.td-cropper__focal`).
- Luật 13: một trạng thái cử chỉ (`this._g`) + một hàm dọn (`_finish`) như cũ; ngón thứ hai đổi `pan` thành `pinch`
  qua `_startPinch`, nhả một ngón kết thúc pinch (ngón còn lại bị bỏ qua tới khi nhả) — giữ nguyên.
- Luật 14 (reduced motion): không có chuyển động tự chạy nào để tắt (không quán tính, không transition).
- WCAG 2.5.7: kéo ảnh là thao tác thiết yếu như kéo khung hôm nay; lối thay thế không cần kéo: nút − / +, ô tỉ lệ, bàn
  phím. Vùng chạm ≥ 44 px của nút toolbar đã có.
- Thêm một dòng "kiểu pan trên iPhone thật" vào `docs/internal/release-touch-checklist.md`.

## Test

**Node (`src/utils/crop-geometry.test.js`):**

- `panFrame`: nằm giữa, đúng tỉ lệ (sai số làm tròn ≤ 1 px), nằm trong `bw × bh`, đầu vào không hợp lệ ⇒ rect 0.
- `panFit`: bất biến **khung đứng yên** — với mọi rect cùng tỉ lệ, `fit.x + rect.x·scale = frame.x`, tương tự `y`,
  `rect.w·scale = frame.w`; ảnh luôn phủ kín khung.
- `panBy`: ngón sang phải ⇒ `rect.x` giảm; kẹp ở mép ảnh; cỡ không đổi.
- Zoom quanh con trỏ: sau `scaleAround`, điểm model dưới con trỏ có cùng toạ độ màn hình (qua `panFit`) trước và sau,
  khi chưa chạm mép.
- `panPinch`: chỉ chụm ⇒ bằng `scaleAround`; chỉ dịch trung điểm ⇒ bằng `panBy`; cả hai ⇒ rect vẫn trong ảnh, đúng tỉ lệ.
- Giới hạn: zoom ra hết cỡ = `fitLargest(W, H, ratio)`; zoom vào hết cỡ = `minSize(W, H, ratio)`; ảnh nhỏ hơn `MIN_PX`
  ⇒ zoom là no-op.
- Fuzz có seed (như bộ 10 000 ca hiện có): chuỗi ngẫu nhiên pan / zoom / pinch / đổi tỉ lệ ⇒ rect luôn trong ảnh, đúng
  tỉ lệ (`ratioMismatch` false), `toOutput` luôn qua `parseCrop`.
- `media-field-model` (M2): `parseCropMode` / `parseCropShape` + parity PHP; `media-picker-core`: `cropResolved` có
  `mode` / `shape`, giá trị lạ ⇒ `box` / `rect`, `enabled: false` ⇒ `null` như cũ.

**Browser 3 engine (Chromium, Firefox, WebKit), file engines mới:**

- Kéo chuột thật trên stage (kể cả bắt đầu ở vùng mờ ngoài khung) ⇒ `crop-input` mỗi khung hình + một `crop-change`
  `source: 'pointer'`; `getBoundingClientRect()` của `.td-cropper__box` đứng yên (≤ 0.5 px) suốt cử chỉ; ảnh dịch.
- Wheel quanh con trỏ: điểm dưới con trỏ đứng yên (≤ 1 px), `source: 'wheel'`; trackpad gộp một bước mỗi khung hình.
- Pinch tổng hợp (Pointer Events hai ngón, như test v0.35): xoè ⇒ vùng cắt nhỏ lại; chụm + dịch ⇒ ảnh đi theo.
- Bàn phím: mũi tên đúng dấu trên cả hai trục, Shift, `+ / −`, Escape giữa lúc kéo trả về và không phát event.
- Nút − / +, "Đặt lại" (về khung ban đầu / crop ban đầu), đổi preset giữ tâm, không có lựa chọn "Tự do", mặc định 1:1.
- `focal-point` + `mode="pan"`: nút và điểm trọng tâm ẩn, `focalPoint` vẫn trả giá trị ban đầu, không `focal-change`.
- `disabled` / loading / error: không cử chỉ, không event, con trỏ mặc định, nút khoá.
- Đổi `mode` lúc chạy cả hai chiều: không event, output hợp lệ, `data-mode` / tay nắm đúng.
- `shape="circle"`: `data-shape` chỉ có khi tỉ lệ 1:1, mất khi đổi sang 16:9, có lại khi về 1:1.
- Đổi cỡ stage (ResizeObserver): `crop` không đổi, khung vẫn ở giữa.
- **Hồi quy kiểu `box`:** toàn bộ `td-v035-cropper*.engines.browser-test.js` và các file crop của field / gallery /
  picker chạy lại **không sửa**.
- M2: dialog / field / gallery / picker truyền đúng `mode` / `shape` xuống `<td-cropper>`; vắng option ⇒ cropper không
  có attribute `mode` / `shape`.
- a11y: thứ tự Tab trong `pan` (ô tỉ lệ → nút → khung, không có góc), tên + mô tả của khung, axe như bộ a11y hiện có.

**Cổng đổi baseline (phiên chính chạy tuần tự, một agent một lúc):**

| Cổng | Thay đổi | Điều kiện |
|---|---|---|
| `npm run test:csp` + `test:csp:combined` | **Thêm** state `td-cropper.pan`, `td-cropper.pan-circle`, `td-cropper.box-circle` (cùng danh sách selector với `free`, cùng `excludeProps: ["margin-left"]`) | Sau khi capture: `git diff --stat test/csp/baseline` chỉ được có **file mới**; 4 file `td-cropper.*` cũ và 3 file crop ở nơi nhúng phải giống từng byte. Không thêm prop vào `style-props.json` (không cần: không có biến / thuộc tính mới ngoài danh sách) |
| `npm run test:golden` | `golden.json` + `--td-cropper-pan-inset` ở cả hai theme | chỉ thêm dòng |
| `npm run test:responsive` | thêm `#rsp-cropper-pan` (inline + cột 280 px) và opener dialog `pan`: không tràn ngang, khung nằm trong stage, stage dialog ≥ 200 px ở dải thấp | ca cũ không đổi |
| `npm run test:touch` | thêm ca CDP hai ngón thật trên cropper `pan` + `touchcancel` | ca pinch cũ không đổi |
| `npm run check:css`, `check:dist`, `test:theme`, `test:contrast` | phải xanh, không mong đợi đổi baseline | |

**Kiểm đột biến (sửa một dòng, test phải đỏ, rồi hoàn lại):**

1. `panBy`: bỏ dấu trừ (`+dx / scale`) ⇒ ca "ngón sang phải" và ca kéo chuột đỏ.
2. `panFit`: `scale = frame.w / rect.w` đổi thành `frame.w / W` ⇒ bất biến khung đứng yên đỏ.
3. `panFit`: bỏ `− rect.x·s` ⇒ khung trôi, ca `getBoundingClientRect` đỏ.
4. `_ratio()` nhánh `pan`: bỏ fallback `1` ⇒ ca "không có tỉ lệ ⇒ 1:1" đỏ.
5. `_choices()`: không lọc `ratio: null` ⇒ ca "không có Tự do" đỏ.
6. `_onKey` nhánh `pan`: đảo dấu ⇒ ca bàn phím đỏ.
7. `_focalTool()`: bỏ điều kiện `pan` ⇒ ca focal đỏ.
8. `_syncMode()`: so khớp `!== 'box'` thay vì `=== 'pan'` ⇒ ca "giá trị lạ = box" đỏ.
9. `_syncShape()`: bỏ điều kiện tỉ lệ 1:1 ⇒ ca "16:9 không tròn" đỏ.
10. M2: bỏ dòng truyền `mode` ở từng nơi nhúng (4 chỗ) ⇒ ca passthrough tương ứng đỏ.

## Docs sẽ sửa

- `docs/components/cropper.md`: mục mới "Hai kiểu thao tác — `mode`" (sau "Ví dụ nhanh", có ví dụ avatar); sửa "3. Zoom =
  đổi cỡ khung" (trong `pan` người dùng thấy ảnh phóng, model vẫn là cỡ khung); "4. Điểm trọng tâm" (tắt trong `pan`);
  "Hộp thoại" (option `mode`, `shape`); "Responsive" (khung `pan` + inset); bảng "Attribute", "Nhãn", "Tuỳ biến giao
  diện" (token), "Cấu trúc DOM & class" (`data-mode`, `data-shape`), "Bàn phím & trợ năng", "Cảm ứng", "Lưu ý".
- `docs/components/media-field.md` (mục 9 + bảng attribute + recipe làm tròn ảnh xem trước),
  `docs/components/media-gallery.md`, `docs/components/media-picker.md` (mục "Cắt ảnh — option `crop`").
- `docs/customization/hooks.md` (đoạn "Cắt ảnh (0.35.0)" dòng 530: thêm `mode`, `shape`), `docs/customization/theming.md`
  (dòng token của td-cropper), phần helper PHP trong hai trang component đó, `docs/upgrading/README.md` (ghi chú tên attribute mới).
- `docs/internal/design/touch.md` (cột lý do của `.td-cropper__stage`), `docs/internal/release-touch-checklist.md`.
- **ADR mới** `docs/internal/decisions/0036-cropper-pan-mode.md` ("một model rect, hai cách hiển thị"; số tiếp theo sau
  0035 — phiên chính xác nhận) + một dòng "bổ sung bởi ADR 0036" ở ADR 0015. Không sửa nội dung quyết định của 0015:
  "zoom = cỡ khung" vẫn đúng ở tầng model.
- `docs/internal/roadmap.md`, `CHANGELOG.md`, JSDoc đầu `td-cropper.js` / `crop-dialog.js`.

## Câu hỏi mở (plan viết theo mặc định đề xuất; owner chốt)

1. **Tên attribute.** Đề xuất `mode="box"` (mặc định) | `mode="pan"`, giá trị lạ = `box`. Thay thế đã cân nhắc:
   `frame="fixed|free"` — mô tả khung chứ không mô tả thao tác, dễ nhầm với "tỉ lệ khoá"; `drag="image|box"` — đúng với
   chuột nhưng không bao hàm zoom / bàn phím. *Nếu đổi tên:* chỉ đổi chuỗi attribute + tên option M2 (`crop-mode`,
   `crop.mode`, `crop_mode`), logic không đổi.
2. **`pan` không có `aspect-ratio`.** Đề xuất mặc định 1:1, nhóm tỉ lệ vẫn hiện (bỏ mục "Tự do"), đổi tỉ lệ đổi hình
   khung và giữ tâm. *Phương án khác:* `pan` bắt buộc khoá (ẩn hẳn nhóm tỉ lệ) ⇒ bỏ `_choices()`, `_ratio()` = `_lock ?? 1`.
3. **Mặt nạ tròn.** Đề xuất attribute riêng `shape="circle"`, chỉ đổi hình hiển thị, chỉ hiệu lực khi tỉ lệ 1:1, **cho
   cả kiểu `box`** (lý do: chỉ là hai luật CSS, không thêm code theo kiểu; "khung tròn di chuyển" là một kiểu cắt avatar
   có thật; cấm ở `box` mới là thứ tốn thêm điều kiện). Output vẫn là hình vuông. *Nếu chỉ cho `pan`:* thêm điều kiện
   `_pan()` trong `_syncShape()`, bỏ state CSP `box-circle`.
4. **Công cụ trọng tâm trong `pan`.** Đề xuất ẩn. Hệ quả: `focal-point` + `mode="pan"` không báo lỗi, chỉ không có UI;
   giá trị `focal` đang có được giữ và trả ra nguyên vẹn, nên `td-media-field focal-point` vẫn gửi `name[focal]` cũ
   nhưng người dùng không sửa được trong dialog `pan`. *Phương án khác:* cảnh báo một lần khi kết hợp hai thứ.
5. **Bàn phím.** Đề xuất mũi tên dịch ảnh theo hướng mũi tên, bước 1 % cạnh khung (Shift 10 %), `+ / −` zoom quanh tâm;
   focus trên `.td-cropper__box`; nhãn `panHelp` như bảng API. *Phương án khác:* mũi tên dịch **khung nhìn** (ngược dấu,
   kiểu bản đồ) ⇒ đổi một dấu trong `_onKey` + câu `panHelp`.
6. **Giới hạn zoom.** Đề xuất: tối đa theo `MIN_PX` hiện có (`minSize`), tối thiểu = khung phủ vừa cạnh ngắn của ảnh
   (`fitLargest`), không bao giờ lộ vùng ngoài ảnh. Ảnh nhỏ hơn khung: ảnh được phóng to cho vừa khung (không có trạng
   thái "ảnh lọt thỏm"); ảnh nhỏ hơn `MIN_PX`: zoom là no-op. **Điểm tao muốn mày cân nhắc lại:** với `MIN_PX = 16` và
   khung 400 px, ảnh 4000 px có thể được vẽ rộng tới 100 000 px — vô nghĩa cho avatar và là rủi ro hiệu năng (xem Rủi
   ro 2). Phương án dự phòng đã thiết kế sẵn: hằng nội bộ `PAN_MAX_UPSCALE` MỚI (một px ảnh hiển thị tối đa 8 px màn
   hình), chỉ áp cho `pan`. Mặc định của plan vẫn là **không** thêm trần; chỉ thêm khi ca hiệu năng đỏ hoặc owner muốn.
7. **Nút zoom, wheel, pinch, đặt lại, trạng thái, responsive.** Đề xuất: nút − / + giữ nhãn "Thu nhỏ" / "Phóng to" (trong
   `pan` đúng nghĩa đen), bước `ZOOM_STEP`; wheel / trackpad quanh con trỏ, chặn cuộn trang chỉ khi tương tác được (như
   cũ); pinch quanh trung điểm + theo trung điểm; "Đặt lại" về crop ban đầu hoặc khung lớn nhất ở giữa; `disabled` /
   loading / error như `box` (vùng ảnh ẩn, thông báo ở giữa); responsive dùng container query 480 px hiện có cho toolbar,
   khung tự tính lại theo stage, dialog giữ stage ≥ 200 px (khung ≥ 152 px với inset 24).
8. **Token inset.** Đề xuất `--td-cropper-pan-inset: 24px` (công khai, vào golden). *Phương án khác:* không công khai,
   dùng luôn `--_tdc-pad` 24 px ⇒ bỏ dòng golden + dòng docs.
9. **Một bản hay hai bản phát hành.** Đề xuất một bản minor gồm M1 + M2 (M1 một mình không tới được tay người dùng
   field / picker). *Phương án khác:* M1 trước để dsuite thử `TdCropper` trần, M2 bản sau.

## Rủi ro

1. **Baseline CSP cũ bị đổi.** Mọi luật mới có tiền tố `[data-mode="pan"]` / `[data-shape="circle"]` và kiểu `box` không
   có hai attribute đó, nên computed style cũ không đổi; không thêm prop vào `style-props.json`. Chặn bằng điều kiện
   "chỉ file mới" ở bảng cổng. Chạy `npm run test:csp` cục bộ ngay sau khi sửa CSS, trước Codex.
2. **Hiệu năng với ảnh lớn.** Pan chỉ đổi `transform: translate` của area; zoom đổi `width / height` của một phần tử
   absolute (layout rẻ) nhưng trình duyệt phải vẽ lại ảnh ở cỡ mới, và ở mức zoom tối đa phần tử rất lớn. Đo bằng
   `crop-large.png` 4000 × 3000 trên 3 engine (pinch / wheel liên tục, không khung hình > 50 ms ở Chromium; WebKit kiểm
   thêm trên iPhone thật theo checklist). Đỏ ⇒ bật `PAN_MAX_UPSCALE` (câu hỏi 6). Không dùng `will-change`.
3. **Khung rung nửa pixel.** Vị trí khung trên màn hình là tổng hai `translate` (area + box) đã làm tròn 2 chữ số; sai
   số ≤ 0.01 px. `panFrame` trả px nguyên. Test đo `getBoundingClientRect` của khung trong suốt cử chỉ. Nếu một engine
   vẫn rung viền 1 px: dự phòng là làm tròn `--_tdc-img-x/y` về px nguyên trong nhánh `pan` rồi bù phần dư vào box.
4. **Ảnh chưa biết kích thước gốc.** Không có `natural-*` ⇒ `W × H` = kích thước ảnh preview, output không có `pixels`
   — y như `box`; `pan` không cần gì thêm. Trước `image-ready` không có `_rect` nên không vẽ khung (vùng ảnh ẩn). Ảnh
   không có kích thước nội tại ⇒ lỗi `size` như cũ.
5. **Chỉ số preset lệch khi đổi `mode`.** `_presetIdx` trỏ vào `_choices()` (khác độ dài giữa hai kiểu). Chặn: mọi chỗ
   đọc chỉ số đi qua `_choices()`, đổi `mode` thì tìm lại theo tỉ lệ; có test đổi `mode` hai chiều + `presets` tuỳ biến
   không có mục 1:1 / chỉ có mục `null`.
6. **Xung đột khi gộp.** File "nối thêm" dùng chung: `td.css` / `dist` sinh lại, `test/csp/matrix.json`,
   `test/tokens/golden.json`, `test/fixtures/responsive-page.js`, `web-test-runner.config.js`, `php/td.php`,
   `docs/customization/hooks.md`. Sau rebase chạy golden / responsive / dirty-contract cục bộ trước khi gộp.
7. **Kỳ vọng "cắt tự do" trong `pan`.** `pan` không có tay nắm nên không bao giờ cắt tự do; docs phải nói rõ ngay ở mục
   `mode` để site không đặt `mode="pan"` cho ảnh bìa tự do.

## Ước lượng

| Mốc | Code | Test | Docs |
|---|---|---|---|
| M1 | geometry ~60 dòng, element ~150 dòng, CSS ~30 dòng, story 4 | node ~15 ca + fuzz; browser 1 file ~25 ca × 3 engine; 3 state CSP; responsive + touch | cropper.md, ADR 0036, touch.md |
| M2 | JS ~90 dòng trên 6 file, PHP ~40 dòng | node ~10 ca (JS + PHP); browser 1 file ~10 ca × 3 engine | field / gallery / picker / hooks / theming / upgrading |

Khoảng 2 phiên làm việc: M1 một lane, M2 một lane sau khi M1 gộp. Cổng phiên chính: `codex-plan` (plan này),
`codex-impl`, `codex-security` (M2: attribute / option / PHP), `browser`, `csp`, `responsive`, `touch`.

## Tiêu chí xong

- Vắng `mode` / `shape`: toàn bộ test cropper / field / gallery / picker hiện có xanh **không sửa**; 7 file baseline CSP
  liên quan crop giống từng byte.
- `mode="pan"`: khung đứng yên trên màn hình trong mọi thao tác; `crop` luôn hợp lệ, đúng tỉ lệ, nằm trong ảnh; kéo,
  wheel, pinch, bàn phím, nút đều phát đúng `crop-input` / `crop-change` với `source` hiện có.
- Bốn nơi nhúng nhận param đúng tên trong bảng; helper PHP in đúng attribute.
- 10 đột biến ở trên đều bị test bắt.
- Guard "không tạo pixel" vẫn xanh, không sửa.
