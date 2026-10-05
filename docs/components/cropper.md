[Tài liệu](../README.md) › [Components](README.md) › Cropper

# Cắt ảnh (chỉ toạ độ) — `<td-cropper>`

Khung cắt ảnh theo tỉ lệ (Tự do, 1:1, 4:3, 3:2, 16:9, 1.91:1… hoặc khoá một tỉ lệ) + **điểm trọng tâm** tuỳ chọn. Kết quả
**chỉ là số**: toạ độ chuẩn hoá 0..1 (+ pixel khi biết kích thước gốc) và điểm trọng tâm. Kit **không bao giờ** tạo ảnh:
không `<canvas>`, không blob, không `fetch` ảnh, không upload file mới. Cắt thật là việc của server / CDN khi render trang
công khai, từ ảnh gốc + toạ độ đã lưu.

Thường bạn **không** cần đặt `<td-cropper>` trực tiếp: [media picker](media-picker.md#cắt-ảnh--option-crop-0350) có bước
cắt sau "Chèn" (option `crop`), [media field](media-field.md#9-cắt-ảnh--croppable-0350) có nút "Cắt ảnh" (`croppable`).
Cả hai dùng chung hộp thoại [`TdCropper.openDialog()`](#hộp-thoại--tdcropperopendialogopts). Dùng thẳng element khi cần
cắt ngay trong trang (trang sửa ảnh, trình soạn thảo).

> **⚠ Site phải tự xử lý** phần biến toạ độ thành ảnh: endpoint / CDN cắt ảnh của site là máy xử lý ảnh công khai — URL
> ký HMAC-SHA256, allowlist bề rộng / định dạng, trần kích thước, cache, rate limit, phân quyền ảnh riêng tư là **bắt
> buộc**. Xem [Biến thể ảnh đã cắt](../guides/media-renditions.md).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/cropper'` (class: `import { TdCropper } from '@dazzxq/td-components'`) |
| Loại | Custom element + API tĩnh `TdCropper.openDialog()` |
| Form-associated | **không** (giá trị form của crop nằm ở [media field](media-field.md)) |
| Từ phiên bản | 0.35.0 (cần `td.css`) — [ADR 0015](../internal/decisions/0015-td-cropper.md) |

## Ví dụ nhanh

```html
<td-cropper id="og-crop" src="https://cdn.example.com/o/a_9f2c.jpg" alt="iPhone 17 trên bàn"
            natural-width="4032" natural-height="3024" aspect-ratio="1.91" focal-point></td-cropper>
<pre id="og-crop-out"></pre>

<script type="module">
  import '@dazzxq/td-components/cropper';
  const cropper = document.getElementById('og-crop');
  const out = document.getElementById('og-crop-out');
  cropper.addEventListener('crop-change', (e) => {
    out.textContent = JSON.stringify(e.detail.crop, null, 2);   // luôn textContent
  });
  cropper.addEventListener('focal-change', (e) => console.log(e.detail.focalPoint)); // { x, y } | null
</script>
```

`crop-change` cho ra (ảnh 4032 × 3024, khoá 1.91:1, khung lớn nhất căn giữa):

```json
{
  "normalized": { "x": 0, "y": 0.151124, "width": 1, "height": 0.698082 },
  "aspectRatio": 1.91,
  "pixels": { "x": 0, "y": 457, "width": 4032, "height": 2111 }
}
```

Hộp thoại (một dòng, trả Promise):

```js
import { TdCropper } from '@dazzxq/td-components/cropper';

const res = await TdCropper.openDialog({
  src: asset.urls.preview, alt: asset.name,
  naturalWidth: asset.width, naturalHeight: asset.height,
  aspectRatio: 16 / 9, crop: figure.crop?.normalized ?? null, allowFocalPoint: true,
});
if (res.status === 'applied' && res.changed) {
  figure.crop = res.crop;            // CropValue | null (null = dùng nguyên ảnh)
  figure.focalPoint = res.focalPoint; // { x, y } | null
}
```

## Cách dùng

### 1. Toạ độ — `CropValue`

```ts
interface CropBox { x: number; y: number; width: number; height: number }
interface CropValue {
  normalized: CropBox;   // 0..1 theo ẢNH GỐC; x + width ≤ 1, y + height ≤ 1; 6 chữ số thập phân
  pixels?: CropBox;      // số nguyên, pixel ảnh gốc — CHỈ khi biết kích thước gốc (natural-width / natural-height)
  aspectRatio: number;   // tỉ lệ khoá (4 chữ số) hoặc width / height của pixels khi tự do
}
type FocalPoint = { x: number; y: number } | null;   // 0..1 theo toàn ảnh gốc, độc lập với crop
```

Đúng hình dạng `UsageDraft.crop` / `focalPoint` của [media picker](media-picker.md#kết-quả--pickeroutcome) và
`name[crop]` / `name[focal]` của [media field](media-field.md) (field chỉ gửi `normalized`).

- **Không gian toạ độ** = pixel ảnh gốc **theo hướng hiển thị** (`W × H`). `W × H` lấy từ `natural-width` /
  `natural-height` (thường là `asset.width/height` của adapter); không có thì từ kích thước ảnh tải về.
- **`pixels` chỉ có khi biết kích thước gốc.** Không có `natural-*` → kit tin ảnh tải về để tính `normalized` (đúng
  bất kể ảnh to hay nhỏ, miễn **cùng tỉ lệ** ảnh gốc) nhưng **bỏ `pixels`** — ảnh tải về có thể là bản thu nhỏ, pixel
  của nó không phải pixel gốc.
- **Làm tròn** (một hàm duy nhất cho mọi đường ra):
  - `pixels`: làm tròn từng số, rồi kẹp `width ≤ W − x`, `height ≤ H − y`, tối thiểu 1;
  - `normalized` tính **từ `pixels` nguyên** (cùng một nguồn sự thật), 6 chữ số thập phân, `x + width ≤ 1` luôn đúng ⇒
    kết quả luôn qua `parseCrop` của kit (JS và PHP `td_media_field`). Khung phủ toàn ảnh ra đúng `0, 0, 1, 1`;
  - `aspectRatio`: tỉ lệ khoá làm tròn 4 chữ số, hoặc `pixels.width / pixels.height` (4 chữ số) khi tự do;
  - điểm trọng tâm: 6 chữ số thập phân, kẹp `[0, 1]`.
- **Toàn ảnh = `null`** ở tầng tích hợp: picker, field và `TdCropper.openDialog()` đổi kết quả phủ toàn ảnh thành `crop =
  null` ("không cắt — dùng nguyên ảnh", cùng nghĩa với `name[crop]=null`). Bản thân `<td-cropper>` (property `crop`,
  event) luôn trả một hình chữ nhật.
- **Kích thước tối thiểu** chỉ là hằng nội bộ cho tương tác (16 px ảnh gốc mỗi cạnh; khoá tỉ lệ: cạnh ngắn ≥ 16) — chặn
  kéo / zoom / phím, **không** validate crop đầu vào và **không** có API công khai. Cần trần chất lượng (ví dụ OG ≥ 1200 ×
  630) → kiểm `pixels` ở server.

### 2. Khung ban đầu, preset, khoá tỉ lệ

- **Khoá** (`aspect-ratio="1.91"` / `"16/9"` / `"16:9"`, cùng luật với [media field](media-field.md#2-khung-tỉ-lệ-và-cách-ảnh-nằm-trong-khung)):
  khung là hình lớn nhất đúng tỉ lệ, căn giữa (như dcms2); bộ chọn tỉ lệ **ẩn**; chỉ 4 tay nắm góc.
- **Tự do** (không `aspect-ratio`): khung = toàn ảnh; bộ chọn tỉ lệ hiện `presets`; 8 tay nắm (4 góc + 4 cạnh).
- Có `crop` hợp lệ → dùng nó. Khoá mà `crop` lệch tỉ lệ > 1 % → thu về hình lớn nhất đúng tỉ lệ **bên trong** nó, cùng
  tâm. Nhỏ hơn mức tối thiểu → nới quanh tâm, kẹp trong ảnh.
- **Đổi preset** (Tự do → 16:9…): hình lớn nhất đúng tỉ lệ vừa ảnh, **giữ tâm** khung hiện tại. Về "Tự do" → giữ khung,
  mở khoá.
- "Đặt lại" → khung + điểm ban đầu (từ thuộc tính `crop` / `focal`), phát `crop-change` (và `focal-change` nếu điểm đổi)
  với `source: 'reset'`.

Preset mặc định toàn site: `TdCropper.presets` (Tự do, 1:1, 4:3, 3:2, 16:9, 1.91:1). Riêng một element: property
`presets`.

```js
TdCropper.presets = [
  { label: 'Tự do', ratio: null },
  { label: '3:2', ratio: 3 / 2 },
  { label: 'OG 1.91:1', ratio: 1.91 },
  { label: 'Bìa 3:1', ratio: 3 },
];
document.querySelector('#hero-crop').presets = [{ label: '1:1', ratio: 1 }, { label: '4:5', ratio: 0.8 }];
```

### 3. Zoom = đổi cỡ khung

Không có zoom khung nhìn. **"Phóng to" thu khung lại × 0.9** quanh một điểm neo (vùng chọn nhỏ hơn ⇒ ảnh ra "gần"
hơn), "Thu nhỏ" nới khung × 1/0.9. Neo: tâm khung (phím `+` / `-`, nút − / +), con trỏ (lăn chuột / trackpad pinch
`ctrlKey`), trung điểm hai ngón (pinch cảm ứng). Kẹp giữa mức tối thiểu và khung lớn nhất giữ tỉ lệ hiện tại, rồi tịnh
tiến vào trong ảnh.

Lăn chuột: hệ số `exp(deltaY · 0.002)` kẹp `[0.8, 1.25]` mỗi sự kiện (`deltaMode` dòng × 16). Lăn lên = phóng to.

Trackpad (0.36.0): trackpad gửi rất nhiều `deltaY` nhỏ mỗi giây nên trước đây zoom "nhảy". Giờ sự kiện `deltaMode` 0 với
`|deltaY|` < 50 được **cộng dồn theo frame** và áp **một** bước mỗi frame, kẹp ± 10 % — zoom mượt, không giật. Nấc chuột
(`|deltaY|` ≥ 50 hoặc `deltaMode` dòng / trang) giữ đúng bước như trên. Wheel chỉ chặn cuộn trang khi con trỏ **trên
stage**; ngoài stage trang cuộn bình thường.

Vì sao: mọi thao tác đều đổi kết quả (không có trạng thái ẩn "đang zoom mà khung không đổi"), hình học thuần, test được;
độ chính xác đủ cho toạ độ. Phóng đại khung nhìn để chỉnh từng pixel là **non-goal**.

### 4. Điểm trọng tâm — `focal-point`

Thuộc tính `focal-point` bật nút "Điểm trọng tâm" (`aria-pressed`). Bật → điểm đặt ở tâm khung, phát `focal-change`;
tắt → `focalPoint = null`. Khi bật: chạm / bấm lên ảnh (di chuyển ≤ 4 px) = đặt điểm; kéo điểm = di chuyển; kéo khung
vẫn di chuyển khung.

Toạ độ chuẩn hoá theo **toàn ảnh gốc**, độc lập với crop, **được phép nằm ngoài khung**: server dùng nó khi tự cắt một tỉ
lệ khác (ảnh vuông cho thẻ, ảnh dọc cho mobile) mà vẫn giữ chủ thể.

### 5. Nguồn ảnh: phải là ảnh nguyên, không cắt sẵn

`src` phải là **toàn bộ ảnh gốc** (bất kỳ cỡ: bản preview 1600px là đủ) — không phải thumbnail đã cắt vuông / cắt theo
tỉ lệ. Cropper tính toạ độ trên ảnh nó thấy; ảnh đã bị cắt ⇒ toạ độ sai ở server. Kit tự chặn khi có thể:

| Tình huống | Kết quả |
|---|---|
| Có `natural-*`, ảnh tải về **cùng tỉ lệ** (lệch ≤ 1 %) | `ready`, có `pixels` |
| Có `natural-*`, ảnh tải về **lệch tỉ lệ > 1 %** (preview bị cắt sẵn) | `error` (`ratio`) — **fail closed**: không tương tác, không kết quả; hộp thoại khoá nút xác nhận |
| Không `natural-*` | `ready`, **không** `pixels` (không kiểm được — hợp đồng nguồn ảnh là trách nhiệm của site) |
| Ảnh decode ra kích thước 0 (vd. SVG `width="0"`) | `error` (`size`) |
| SVG **không** `width/height` | trình duyệt báo 300 × 150 (hoặc theo `viewBox`) ⇒ chỉ bị chặn khi có `natural-*` (lỗi `ratio`); không `natural-*` thì toạ độ theo kích thước đó — luôn truyền `natural-*` cho SVG |
| Ảnh không tải được | `error` (`load`) |
| `src` không an toàn (`javascript:`, `data:`, `blob:`, `file:`…) | `error` (`src`), không có `<img>` |

Với picker: `urls.preview` của adapter **phải** là ảnh nguyên khi bật crop
([hợp đồng adapter](media-picker.md#hợp-đồng-adapter)). Với field: xem
[nguồn ảnh của hộp cắt](media-field.md#nguồn-ảnh-cho-hộp-cắt).

**EXIF / xoay ảnh:** kit giả định ảnh **đã được server chuẩn hoá** — xoay thật theo EXIF orientation rồi bỏ cờ orientation
khi re-encode (việc server vốn phải làm khi nhận upload, xem [security-model §6](../internal/security-model.md#6-media-picker--media-field)),
và `width/height` của asset là kích thước **sau** khi xoay. CSS để `image-orientation: from-image` (mặc định trình duyệt),
nên nếu server chưa chuẩn hoá, toạ độ vẫn theo ảnh **đang hiển thị** — server phải cắt trên cùng hướng đó. Kit không đọc
EXIF ở client.

### 6. Trạng thái

`data-state` trên host: `loading` (chưa decode — không tương tác, không event) → `ready` (phát `image-ready`) hoặc
`error` (phát `image-error`). Trạng thái tải / lỗi cũng được đọc qua live region. Đổi `src` / `natural-*` → tải lại từ
đầu.

### 7. Gán bằng code

Thuộc tính và property đều **im lặng** (không event — quy ước kit). Đổi `crop` / `focal` / `aspect-ratio` sau khi
`ready` → khung tính lại. `reset()` cũng im lặng; chỉ nút "Đặt lại" của người dùng phát `crop-change`.

```js
cropper.crop = { normalized: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 } };   // null = khung mặc định
cropper.focalPoint = { x: 0.35, y: 0.6 };
const { crop, focalPoint } = cropper.getResult();
```

### 8. Dùng toạ độ ở server (cắt thật bằng tham số đã ký)

Crop / focal là **gợi ý UX của người soạn**, không phải quyền. Server:

1. **Validate lại khi lưu** (đúng như [media field](media-field.md#1-hai-dạng-gửi-form-api-công-khai-chốt-từ-032)):
   `v === 1`, đúng khoá, số hữu hạn trong 0..1, `x + width ≤ 1`, `y + height ≤ 1`, độ dài chuỗi; tuỳ chọn trần chất
   lượng theo `width × W`.
2. **Lưu theo chỗ dùng** (bài viết / OG / thẻ), không ghi đè metadata của asset — một ảnh có nhiều crop ở nhiều nơi.
3. **Tự sinh URL biến đổi đã ký** từ crop đã lưu. **Không bao giờ** nhận toạ độ crop tuỳ ý từ query string của URL công
   khai (ai cũng gọi được → biến CDN thành máy cắt ảnh miễn phí, cache bị phá).

```php
// Ví dụ (PHP thuần, không phụ thuộc CDN cụ thể): crop + focal đã lưu → URL imgproxy-style có chữ ký HMAC.
function td_signed_image_url(array $asset, ?array $crop, ?array $focal, int $outW, int $outH): string
{
    $W = (int) $asset['width'];                // kích thước gốc SAU chuẩn hoá EXIF
    $H = (int) $asset['height'];
    $ops = [];
    if ($crop !== null) {                      // crop đã validate lúc lưu: {x, y, width, height} 0..1
        $x = (int) round($crop['x'] * $W);
        $y = (int) round($crop['y'] * $H);
        $w = max(1, min((int) round($crop['width'] * $W), $W - $x));
        $h = max(1, min((int) round($crop['height'] * $H), $H - $y));
        $ops[] = "crop:{$w}:{$h}:nowe:{$x}:{$y}";           // vùng cắt theo pixel gốc
    } elseif ($focal !== null) {
        $ops[] = sprintf('gravity:fp:%.4f:%.4f', $focal['x'], $focal['y']); // không crop: cắt theo tỉ lệ đích quanh điểm
    }
    $ops[] = "resize:fill:{$outW}:{$outH}";
    $path = '/' . implode('/', $ops) . '/plain/' . rawurlencode($asset['storage_key']);
    $sig  = rtrim(strtr(base64_encode(hash_hmac('sha256', $path, IMG_SIGN_SALT . IMG_SIGN_KEY, true)), '+/', '-_'), '=');
    return 'https://img.example.com/' . $sig . $path;
}

// OG 1200×630: $url = td_signed_image_url($asset, $seo->og_crop, $seo->og_focal, 1200, 630);
```

Tên tham số tuỳ dịch vụ (imgproxy, Cloudflare Images, Thumbor, Imgix…); điều cốt lõi: **chỉ server ký**, chỉ từ giá trị
đã lưu, và preset kích thước đầu ra (`1200×630`) do server quyết.

> **⚠ Site phải tự xử lý** phía kiểm: so chữ ký hằng thời gian, sai → 403 trước khi đọc file, allowlist bề rộng /
> định dạng, crop làm tròn 4 chữ số, trần kích thước, cache hai tầng, rate limit cache miss, ảnh riêng tư có `exp` +
> kiểm quyền. Checklist đầy đủ + ví dụ Cloudflare Worker / endpoint PHP: [Biến thể ảnh đã cắt](../guides/media-renditions.md).

### 9. Không có JS / SSR

Cắt ảnh cần JS: `<td-cropper>` **không** có helper PHP và không hydrate. Chưa có JS → host rỗng; site có thể đặt một
`<img>` dự phòng làm con (bị thay khi element chạy). Trang PHP thuần cần sửa crop → dùng
[`td_media_field(… 'croppable' => true)`](media-field.md#9-cắt-ảnh--croppable-0350): không JS thì form vẫn gửi lại đúng
`name[crop]` / `name[focal]` server đã in.

## Hộp thoại — `TdCropper.openDialog(opts)`

Mở `<td-cropper>` trong một hộp thoại modal (lớp phủ của kit, focus giữ trong hộp, Escape / × = huỷ). Chính hàm này chạy
bước cắt của media picker và nút "Cắt ảnh" của media field. Public vì app cần sửa lại crop ở chỗ khác (ví dụ figure trong
trình soạn thảo).

```ts
TdCropper.openDialog(opts: {
  src: string;                     // ảnh NGUYÊN (qua safeMediaUrl)
  alt?: string;                    // nhãn của vùng cắt
  naturalWidth?: number; naturalHeight?: number;   // kích thước gốc (cả hai) ⇒ có pixels + kiểm tỉ lệ
  aspectRatio?: number | null;     // số w/h ⇒ khoá; null / thiếu ⇒ tự do (có bộ chọn preset)
  crop?: CropBox | null;           // normalized hiện tại (null ⇒ khung mặc định)
  focalPoint?: FocalPoint;         // điểm hiện tại
  allowFocalPoint?: boolean;       // bật công cụ điểm trọng tâm
  title?: string;                  // mặc định "Cắt ảnh"; khoá tỉ lệ ⇒ tự thêm " · 16:9" (nhãn preset nếu khớp)
  confirmLabel?: string;           // mặc định "Áp dụng"
  cancelLabel?: string;            // mặc định "Huỷ"
  signal?: AbortSignal;            // abort ⇒ gỡ hộp ngay (không hiệu ứng thoát), resolve cancelled
  opener?: HTMLElement;            // nhận lại focus khi đóng
}): Promise<
  | { status: 'applied'; crop: CropValue | null; focalPoint: FocalPoint; changed: boolean }
  | { status: 'cancelled' }
>;
```

- **Huỷ resolve**, không reject (Escape / × / "Huỷ" / `signal` abort ⇒ `{ status: 'cancelled' }`). Promise **chỉ reject**
  khi đã có một hộp cắt khác đang mở (một hộp một lúc — picker và field dùng chung).
- `crop = null` khi khung phủ toàn ảnh. `changed = false` khi kết quả lệch giá trị đầu vào **không quá 1 pixel ảnh gốc** mỗi trục (`null` đầu vào = toàn ảnh) và focal không đổi (sai số
  1e-6) — app nên giữ nguyên chuỗi cũ (field làm vậy để không làm tròn lại dữ liệu server). Khoá tỉ lệ mà mở với
  `crop: null` → khung bắt đầu là hình lớn nhất đúng tỉ lệ (không phải toàn ảnh) ⇒ "Áp dụng" cho `changed: true` (trừ khi ảnh đúng tỉ lệ đó).
- Nút xác nhận **khoá** khi cropper `loading` / `error` (ví dụ ảnh lệch tỉ lệ) — chỉ huỷ được.
- Bố cục (lớp phủ ⇒ theo viewport, [ADR 0014](../internal/decisions/0014-breakpoints-container-queries.md)): hộp lớn từ
  720px; **full màn hình < 720px**; màn thấp (`short`, cao ≤ 500): header / footer gọn, vùng cắt lấp phần còn lại (≥ 200px),
  footer luôn trong màn hình + safe area.

## Responsive (0.35.0)

Host là **container** (`container: td-cropper / inline-size`, `display: block`) — cần bề rộng do cha quyết định (xem
[Responsive](../concepts/responsive.md)). Khi cropper **hẹp hơn 480px**: toolbar xuống hai hàng (nhóm tỉ lệ một hàng
riêng, cuộn ngang nếu thiếu chỗ), nút − / + chỉ còn icon (nhãn vẫn ở `aria-label`). Không có container query (Chrome /
Edge 102–104): dự phòng theo viewport < 480px.

Chiều cao vùng cắt: `--td-cropper-h` (mặc định `min(60vh, 32rem)`); `td-cropper:not(:defined)` giữ chỗ cùng chiều cao
(không xô lệch khi JS tải). Cảm ứng (`pointer: coarse`): vùng chạm của góc / điểm trọng tâm / nút toolbar ≥ 44px (chuột ≥ 24px;
vùng chạm thật 26 / 46px vì góc nằm trên nửa pixel bị trình duyệt làm tròn thiếu 1px) — vùng cắt có đệm trong (14 / 24px) để vùng chạm của góc nằm sát mép ảnh không bị cắt; khung hiển thị quá nhỏ thì ẩn tay nắm cạnh, góc vẫn
còn.

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `src` | URL | — | Ảnh **nguyên**. Qua `safeMediaUrl` (`https:`, `http:` khi trang là `http:`, tương đối); **không** `blob:` / `data:`. Sai → `error` `src` |
| `alt` | string | `''` | Mô tả ảnh — tên của vùng cắt ("Cắt ảnh: {alt}") |
| `natural-width` / `natural-height` | số nguyên 1–100 000 | — | Kích thước ảnh gốc (cả hai). Có ⇒ kết quả có `pixels` + kiểm tỉ lệ ảnh tải về |
| `aspect-ratio` | `W/H` \| `W:H` \| số | — | Có ⇒ **khoá** tỉ lệ, ẩn bộ chọn preset; tỉ lệ `w / h` phải trong **[0.01, 100]** (gồm hai đầu); ngoài khoảng → bị từ chối + **một** cảnh báo (không lặp lại giá trị), cắt tự do |
| `crop` | JSON v1 `{"v":1,"x","y","width","height"}` | — | Khung ban đầu (chuẩn hoá). Sai định dạng → khung mặc định |
| `focal-point` | boolean | — | Bật công cụ điểm trọng tâm |
| `focal` | JSON v1 `{"v":1,"x","y"}` | — | Điểm trọng tâm ban đầu |
| `disabled` | boolean | — | Không tương tác, không event |

## Property & method

| Thành viên | Kiểu / chữ ký | Mô tả |
|---|---|---|
| `crop` | get `CropValue \| null` · set `{ normalized: CropBox } \| CropBox \| null` | `null` khi chưa `ready`. Gán `null` = khung mặc định. Im lặng |
| `focalPoint` | `{ x, y } \| null` | Im lặng |
| `presets` | `{ label: string, ratio: number \| null }[]` | Mặc định `TdCropper.presets` |
| `reset()` | `() => void` | Về khung / điểm ban đầu, im lặng |
| `getResult()` | `() => { crop: CropValue \| null, focalPoint }` | Kết quả hiện tại (không đổi toàn ảnh thành `null`) |
| `TdCropper.presets` | static | Preset toàn site |
| `TdCropper.labels` | static | Nhãn (dưới) |
| `TdCropper.openDialog(opts)` | static | [Hộp thoại](#hộp-thoại--tdcropperopendialogopts) |

## Event

Phát trên host, `bubbles`. Không phát khi gán bằng code.

| Event | detail | Khi nào |
|---|---|---|
| `crop-input` | `{ crop, source }` | Trong lúc kéo / pinch (gộp theo khung hình) |
| `crop-change` | `{ crop, source }` | Kết thúc cử chỉ có thay đổi; mỗi bước phím / nút / lăn chuột; đổi preset; "Đặt lại" |
| `focal-change` | `{ focalPoint, source }` | Bật / tắt / đặt / kéo điểm trọng tâm |
| `image-ready` | `{ naturalWidth, naturalHeight, pixelsKnown }` | Ảnh decode xong, kích thước hợp lệ |
| `image-error` | `{ kind: 'src' \| 'load' \| 'size' \| 'ratio' }` | Xem [mục 5](#5-nguồn-ảnh-phải-là-ảnh-nguyên-không-cắt-sẵn) |

`source`: `'pointer'` · `'pinch'` · `'wheel'` · `'keyboard'` · `'button'` · `'preset'` · `'reset'`.

## Nhãn — `TdCropper.labels`

Đổi toàn trang bằng `Object.assign(TdCropper.labels, {...})`. Mọi nhãn gán bằng `textContent` / `setAttribute`. Nhãn
preset nằm ở `TdCropper.presets` (`label`), không ở đây.

| Key | Mặc định |
|---|---|
| `stage` · `stageNoAlt` | "Cắt ảnh: {alt}" · "Cắt ảnh" (tên vùng cắt) |
| `tools` · `ratios` | "Công cụ cắt ảnh" · "Tỉ lệ khung" |
| `zoomIn` · `zoomOut` · `focal` · `reset` | "Phóng to" · "Thu nhỏ" · "Điểm trọng tâm" · "Đặt lại" |
| `box` · `boxRole` · `handleRole` | "Vùng cắt" · "khung cắt" · "tay nắm" |
| `nw` · `ne` · `se` · `sw` | "Góc trên trái" · "Góc trên phải" · "Góc dưới phải" · "Góc dưới trái" |
| `focalPoint` | "Điểm trọng tâm" (tên của điểm) |
| `boxHelp` · `cornerHelp` · `focalHelp` | hướng dẫn phím (đọc qua `aria-describedby`) |
| `valuePx` · `valuePct` | "Vùng cắt {w} × {h} px, cách trái {x} px, cách trên {y} px" · bản theo % khi không có `pixels` |
| `focalValue` · `focalOff` | "Điểm trọng tâm {x} %, {y} %" · "Đã bỏ điểm trọng tâm" |
| `ratio` · `ratioFree` | "Tỉ lệ {label}" · "Tỉ lệ tự do" |
| `loading` | "Đang tải ảnh…" |
| `errorSrc` · `errorLoad` · `errorSize` · `errorRatio` | "Địa chỉ ảnh không hợp lệ" · "Không tải được ảnh" · "Không xác định được kích thước ảnh" · "Ảnh xem trước không khớp tỉ lệ ảnh gốc" |
| `dialogTitle` · `dialogApply` · `dialogCancel` · `dialogClose` | "Cắt ảnh" · "Áp dụng" · "Huỷ" · "Đóng" (hộp thoại; option `title` / `confirmLabel` / `cancelLabel` thắng) |

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-cropper-h` | `min(60vh, 32rem)` | Chiều cao vùng cắt (inline; trong hộp thoại vùng cắt lấp phần còn lại) |
| `--td-cropper-dim` | `rgb(0 0 0 / 55%)` | Vùng mờ ngoài khung |
| `--td-cropper-line` | trắng | Viền trong 1px của khung |
| `--td-cropper-line-contrast` | đen 60 % | Viền ngoài 1px — khung thấy được trên cả ảnh trắng lẫn ảnh đen |
| `--td-cropper-focus` | trắng | Vòng focus bàn phím trên ảnh (khung / góc / điểm trọng tâm) — không dùng màu accent của kit vì đo được ~1.1:1 trên ảnh sáng đã làm mờ |
| `--td-cropper-focus-halo` | đen 75 % | Quầng tối dưới vòng focus của góc / điểm trọng tâm (vòng hai tông: luôn có một tông tương phản với ảnh) |
| `--td-cropper-handle` | trắng | Nền tay nắm góc / cạnh (viền tối) |

Bề mặt theo [minimal surfaces](../internal/design/liquid-glass.md): không shadow trang trí, không blur; lưới 1/3 chỉ
hiện khi đang kéo (`data-dragging`). Gate tương phản đo viền khung / tay nắm / điểm ≥ 3:1 trên ảnh trắng, ảnh đen và
vùng mờ — đè token thì site tự kiểm. `prefers-contrast: more` / `forced-colors`: `Highlight` / `CanvasText`, không vùng
mờ bán trong suốt. Không có animation (reduced motion không cần nhánh riêng).

Giá trị vị trí / kích thước từng instance do JS đặt bằng CSSOM (`--_tdc-*` trên host, gỡ khi element rời trang) — **private**,
đừng đè.

## Cấu trúc DOM & class

Light DOM do element dựng (không có helper PHP):

```html
<td-cropper data-state="loading|ready|error" [data-error="src|load|size|ratio"] [data-locked] [data-dragging] [data-small-box]>
  <div class="td-cropper__toolbar" role="group">
    <div class="td-cropper__ratios" role="radiogroup"><button class="td-cropper__ratio" role="radio">…</button>…</div>
    <div class="td-cropper__tools">
      <button class="td-btn … td-cropper__tool td-cropper__zoom-out">…</button>
      <button class="td-btn … td-cropper__tool td-cropper__zoom-in">…</button>
      <button class="td-btn … td-cropper__tool td-cropper__focal-toggle" aria-pressed="false" hidden>…</button>
      <button class="td-btn … td-cropper__tool td-cropper__reset">…</button>
    </div>
  </div>
  <div class="td-cropper__stage" role="group" aria-label="Cắt ảnh: {alt}">
    <div class="td-cropper__area">
      <img class="td-cropper__img" alt="" draggable="false" referrerpolicy="no-referrer" decoding="async">
      <div class="td-cropper__box" role="group" aria-roledescription="khung cắt" tabindex="0">
        <span class="td-cropper__grid" aria-hidden="true"></span>
        <span class="td-cropper__handle td-cropper__handle--corner" data-handle="nw|ne|se|sw" role="group" tabindex="0"></span>
        <span class="td-cropper__handle td-cropper__handle--edge" data-handle="n|e|s|w" aria-hidden="true"></span>
      </div>
      <span class="td-cropper__focal" role="group" tabindex="0" hidden></span>
    </div>
    <p class="td-cropper__message" hidden></p>
  </div>
  <span class="td-sr-only td-cropper__desc"></span> <!-- + __corner-desc, __focal-desc -->
  <span class="td-sr-only td-cropper__live" role="status" aria-live="polite" aria-atomic="true"></span>
</td-cropper>
```

- `data-locked`: đang khoá tỉ lệ (chỉ 4 góc). `data-small-box`: khung hiển thị < 88px — CSS ẩn tay nắm cạnh trên màn cảm
  ứng. `data-dragging`: hiện lưới 1/3.
- Vùng mờ ngoài khung = `box-shadow` lan rộng của `.td-cropper__box` trong `.td-cropper__stage` `overflow: hidden`.

## Bàn phím & trợ năng

Thứ tự Tab: **toolbar** (nhóm tỉ lệ — **một** tab stop, mũi tên đổi preset; − ; + ; Điểm trọng tâm; Đặt lại) → **khung**
→ góc **trên trái** → **trên phải** → **dưới phải** → **dưới trái** → **điểm trọng tâm** (khi bật). Tay nắm cạnh chỉ dành
cho chuột / chạm (`aria-hidden`, không focus) — 4 góc đã chỉnh được cả hai chiều.

| Phím | Ở đâu | Tác dụng |
|---|---|---|
| ← → ↑ ↓ | Khung | Di chuyển 1 % cạnh ảnh theo trục đó (≥ 1 px) |
| Shift + mũi tên | Khung / góc / điểm | Bước × 10 |
| ← → ↑ ↓ | Góc | Đổi cỡ từ góc đó (khoá tỉ lệ: trục của phím quyết định, trục kia suy ra) |
| ← → ↑ ↓ | Điểm trọng tâm | Di chuyển 1 % |
| `+` / `=` / Numpad + | Mọi phần của vùng cắt | Phóng to (khung × 0.9 quanh tâm) |
| `-` / `_` / Numpad − | Mọi phần của vùng cắt | Thu nhỏ |
| ← → (↑ ↓) | Nhóm tỉ lệ | Đổi preset (roving) |
| Escape | Đang kéo | Trả khung về lúc bắt đầu kéo, **không** đóng hộp thoại |
| Escape | Hộp thoại (không kéo) | Huỷ |

- Mũi tên theo hướng **vật lý**: ← luôn sang trái, kể cả trang RTL (toolbar vẫn theo RTL). Ctrl / ⌘ + phím không bị
  nuốt.
- ARIA: vùng cắt `role="group"` "Cắt ảnh: {alt}"; khung `role="group"` + `aria-roledescription="khung cắt"` +
  `aria-describedby` (giá trị hiện tại + hướng dẫn phím); góc `aria-roledescription="tay nắm"` + "Góc trên trái"…; điểm
  "Điểm trọng tâm"; nút điểm `aria-pressed`.
- Live region (polite, đọc **400 ms sau thay đổi cuối**): "Vùng cắt 1200 × 675 px, cách trái 120 px, cách trên 40 px"
  (không có `pixels` → theo %), "Điểm trọng tâm 35 %, 60 %", "Đã bỏ điểm trọng tâm", "Tỉ lệ 16:9"; trạng thái tải / lỗi.

## Bảo mật & CSP

- **Không tạo pixel, không mạng**: không `<canvas>`, `toBlob`, `toDataURL`, `getImageData`, `fetch`, `createObjectURL`
  trong cropper / hộp thoại / hình học (có test chặn). Ảnh chỉ hiển thị bằng `<img>` ⇒ **không cần CORS**, không có thuộc
  tính `crossorigin`.
- **CSP**: `img-src` phải cho phép origin của ảnh (như [media picker](media-picker.md#csp-ảnh-và-referrer)); không cần
  `connect-src`, không cần `blob:` / `data:`. Không `style="…"`, không `<style>`: vị trí đặt bằng CSSOM custom property.
- `src` qua `safeMediaUrl` (cùng cổng với picker / field), ảnh `referrerpolicy="no-referrer"` (CDN chống hotlink phải
  nhận referer rỗng). `blob:` / `data:` bị từ chối.
- Mọi số từ thuộc tính parse chặt (số nguyên / `parseCrop` / `parseFocal`, `Number.isFinite`, kẹp). `alt` và nhãn chỉ là
  text. Không có cửa HTML nào.
- **Toạ độ chỉ là UX.** Server validate lại mọi giá trị và không coi crop là quyền; URL biến đổi ảnh công khai chỉ do
  server ký từ giá trị đã lưu ([mục 8](#8-dùng-toạ-độ-ở-server-cắt-thật-bằng-tham-số-đã-ký)).

## Cảm ứng

- **Cắt ảnh là thao tác kéo thiết yếu** (WCAG 2.5.7 "essential"): kéo khung, kéo tay nắm, pinch hai ngón để zoom. Cách thay thế không cần kéo: bàn phím (tay nắm + phím mũi tên) và ô tỉ lệ. Mặt cắt `touch-action: none`.
- Ô tỉ lệ có hình nhấn; hover chỉ trên con trỏ mịn. Ngón tay bị huỷ giữa chừng (`pointercancel`) kết thúc cử chỉ gọn.

Chuẩn chung: [Cảm ứng](../guides/touch.md).

## Lưu ý & lỗi thường gặp

- **Cropper báo lỗi tỉ lệ (`ratio`)** → `src` là ảnh đã cắt sẵn (thumbnail vuông…) trong khi `natural-*` là của ảnh gốc.
  Đổi `src` sang ảnh nguyên (bất kỳ cỡ).
- **Kết quả không có `pixels`** → thiếu `natural-width` / `natural-height` (adapter không trả `width/height`). Bình thường;
  `normalized` vẫn đúng.
- **Ảnh xoay sai so với bản server cắt** → server chưa chuẩn hoá EXIF khi nhận upload (mục 5).
- **Khung không hiện / cao 0** → host trong phần tử co theo nội dung (`inline-block`, flex `0 0 auto`) — container cần
  bề rộng từ cha.
- **Ảnh trống, console báo CSP** → thêm origin ảnh vào `img-src`.
- **Không có event khi gán `crop`** → đúng quy ước: gán bằng code im lặng.

## Xem thêm

- [Media picker › Cắt ảnh](media-picker.md#cắt-ảnh--option-crop-0350) · [Media field › Cắt ảnh](media-field.md#9-cắt-ảnh--croppable-0350)
- [Biến thể ảnh đã cắt](../guides/media-renditions.md) — checklist bắt buộc cho endpoint cắt ảnh của site
- [Responsive](../concepts/responsive.md) · [Theming](../customization/theming.md) · [CSP](../guides/csp.md)
- [ADR 0015](../internal/decisions/0015-td-cropper.md) · [ADR 0013 › Bổ sung v0.35](../internal/decisions/0013-media-picker-boundary.md#bổ-sung-v035) ·
  [security-model › Media picker](../internal/security-model.md#6-media-picker--media-field)
