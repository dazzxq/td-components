[Tài liệu](../README.md) › [Components](README.md) › Media field

# Ô chọn ảnh — `<td-media-field>`

Ô form chọn **một** ảnh / video / file từ thư viện media: khung theo tỉ lệ (`3:2`, `1.91:1`…) có chữ tỉ lệ khi rỗng,
xem trước khi đã chọn, nút **Đổi** / **Gỡ** luôn hiện. Bấm khung → mở [media picker](media-picker.md) (chế độ đơn).
Giá trị gửi form là **`assetId`** — không bao giờ là URL. Dùng cho ảnh đại diện bài viết, ảnh OG, logo thương hiệu,
poster video, file đính kèm một-cái.

Cần chèn **nhiều** ảnh vào nội dung → gọi thẳng [`TdMediaPicker.open()`](media-picker.md) chế độ `multiple`. Field
nhiều ảnh / gallery có ở 0.38+.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/media-field'` (class: `import { TdMediaField } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | có |
| Từ phiên bản | 0.32.0 (cần `td.css`; cần một adapter — xem [media picker](media-picker.md#cấu-hình-mặc-định--configuredefaults)) |

## Ví dụ nhanh

```html
<form method="post" action="/posts/42">
  <td-media-field name="hero" label="Ảnh đại diện" aspect-ratio="3/2" required
                  value="a_9f2c" preview-src="https://cdn.example.com/t/a_9f2c.jpg" preview-alt="iphone-17.jpg"></td-media-field>

  <td-media-field name="og" label="Ảnh chia sẻ (OG)" aspect-ratio="1.91" usage></td-media-field>
  <button type="submit">Lưu</button>
</form>

<script type="module">
  import { TdMediaPicker } from '@dazzxq/td-components/media-picker';
  import '@dazzxq/td-components/media-field';
  import { mediaAdapter } from '/assets/app/media-adapter.js';   // code của site
  TdMediaPicker.configureDefaults({ adapter: mediaAdapter });
</script>
```

Gửi form: `hero=a_9f2c`, `og[id]=`, `og[alt]=`, `og[crop]=null`.

## Cách dùng

### 1. Hai dạng gửi form (API công khai, chốt từ 0.32)

| Dạng | Bật bằng | FormData | Dùng khi |
|---|---|---|---|
| **Reference** (mặc định) | — | `name=<assetId>`; rỗng → `name=` (có mục, giá trị rỗng = "đã gỡ") | Chỉ cần biết ảnh nào (ảnh đại diện, logo) |
| **Usage** | thuộc tính `usage` | luôn đủ **ba** mục: `name[id]`, `name[alt]`, `name[crop]` | Cần alt riêng cho chỗ dùng này (OG, ảnh trong khối nội dung) |

- `name[crop]` = chuỗi JSON `{"v":1,"x":…,"y":…,"width":…,"height":…}` (toạ độ chuẩn hoá 0..1 theo ảnh gốc) **hoặc chuỗi
  `null`**. `null` nghĩa là **không cắt — dùng nguyên ảnh** (hoặc server tự quyết theo tỉ lệ khung). 0.32 chưa có UI
  crop: crop lấy từ thuộc tính `crop` do server in ra và được gửi lại **đúng từng byte**; đổi / gỡ ảnh → `null` (crop cũ
  thuộc ảnh cũ). 0.33 chỉ thêm UI sửa crop — tên mục và định dạng không đổi.
- `name` kết thúc bằng `[]` ở chế độ usage (`og[]`) → **không gửi gì** + cảnh báo console (fail closed; PHP cũng vậy).
- Field `disabled` (hoặc trong `<fieldset disabled>`) → không có mục nào (như control native) — server phân biệt "không
  gửi" (giữ nguyên) với "gửi rỗng" (gỡ).
- `preview-src` / `kind` / `preview-alt` **không** được gửi.

**Laravel:**

```php
use Illuminate\Validation\Rule;

$data = $request->validate([
    'hero'    => ['nullable', 'string', 'max:512', Rule::exists('media', 'id')->where('status', 'ready')],
    'og.id'   => ['nullable', 'string', 'max:512', Rule::exists('media', 'id')],
    'og.alt'  => ['nullable', 'string', 'max:500'],
    'og.crop' => ['nullable', 'string', 'max:512'],
]);
// ConvertEmptyStringsToNull: hero='' → null = đã gỡ ảnh. Field disabled → key không có trong request.
$post->hero_media_id = $data['hero'] ?? null;

$crop = $request->input('og.crop');
$crop = ($crop === null || $crop === 'null') ? null : json_decode($crop, true, 4, JSON_THROW_ON_ERROR);
// Kiểm lại: v === 1, x/y ≥ 0, width/height > 0, x + width ≤ 1, y + height ≤ 1 — không tin client.
```

**PHP thuần:**

```php
// Reference
if (array_key_exists('hero', $_POST)) {                      // không có key = field disabled → giữ nguyên
    $hero = is_string($_POST['hero']) ? trim($_POST['hero']) : '';
    if ($hero === '') { /* gỡ ảnh */ }
    else { /* SELECT id FROM media WHERE id = ? AND status = 'ready' — kiểm tồn tại + quyền dùng */ }
}

// Usage
$og     = is_array($_POST['og'] ?? null) ? $_POST['og'] : [];
$ogId   = is_string($og['id'] ?? null) ? $og['id'] : '';
$ogAlt  = mb_substr(is_string($og['alt'] ?? null) ? trim($og['alt']) : '', 0, 500);
$rawCrop = is_string($og['crop'] ?? null) ? $og['crop'] : 'null';
$ogCrop = null;
if ($rawCrop !== 'null') {
    $c = json_decode($rawCrop, true);
    $ok = is_array($c) && ($c['v'] ?? null) === 1 && count($c) === 5;
    foreach (['x', 'y', 'width', 'height'] as $k) {
        $ok = $ok && (is_int($c[$k] ?? null) || is_float($c[$k] ?? null));
    }
    if ($ok && $c['x'] >= 0 && $c['y'] >= 0 && $c['width'] > 0 && $c['height'] > 0
        && $c['x'] + $c['width'] <= 1 && $c['y'] + $c['height'] <= 1) {
        $ogCrop = $c;
    }
}
```

`assetId` là chuỗi opaque do app cấp; server **luôn** kiểm id có tồn tại, đúng loại, và người dùng có quyền dùng không —
giá trị form ai cũng sửa được.

### 2. Khung, tỉ lệ và cách ảnh nằm trong khung

| Thuộc tính | Khung rỗng | Khung có ảnh |
|---|---|---|
| `aspect-ratio="3/2"` (hoặc `3:2`) | Theo tỉ lệ, chữ "3:2" dưới lời nhắc | Theo tỉ lệ, ảnh **phủ kín** (`object-fit: cover`, có thể bị cắt mép) |
| `aspect-ratio="1.91"` (một số) | Tỉ lệ 1.91:1, chữ "1.91:1" | Như trên |
| `aspect-ratio` + `preview-fit="contain"` | Như trên | Ảnh **nằm gọn** trong khung (không cắt, có thể có viền trống) |
| không có `aspect-ratio` | Cao `--td-media-field-empty-h` (10rem) | Ảnh theo **tỉ lệ gốc** (`height: auto`), trần `--td-media-field-max-h` (24rem) |

- `aspect-ratio` nhận `W/H`, `W:H` hoặc một số; mỗi phần là số dương ≤ 10000, tối đa 4 chữ số thập phân, không dấu, không
  `e`. Sai (`0`, `-1`, `abc`, `1e9`) → cảnh báo console + coi như không có tỉ lệ.
- Tỉ lệ dựng bằng một `<svg>` sizer có `viewBox` (cùng markup ở PHP và JS) — không inline style, đúng CSP strict, không
  xô lệch khi JS tải.
- Khung theo tỉ lệ chỉ là **khung xem trước**: kit không cắt ảnh. Cắt thật (theo `crop` hoặc theo tỉ lệ) là việc của
  server / CDN khi render trang công khai.

### 3. Video và file

- `accept-kind` (danh sách cách nhau bởi dấu phẩy / khoảng trắng: `image`, `video`, `file`; mặc định `image`) → chuyển
  thành `selection.kinds` của picker + chọn chữ mặc định: "Chọn ảnh" / "Chọn video" / "Chọn file" (`prompt` ghi đè).
- **Video = chỉ chọn poster**: `kind="video"` → khung hiện poster (`urls.preview`) + nhãn "Video"; **không** có player trong
  field.
- `kind="file"` → icon + tên file (`preview-alt`), không có ảnh.

### 4. Chọn, đổi, gỡ

- Bấm khung (hoặc "Đổi") → mở picker chế độ đơn, `initialIds = [value]` nếu đang có, tiêu đề = `label`. Bấm nhiều lần
  trong lúc picker đang mở bị bỏ qua (khoá mở hai lần).
- Chọn ảnh **khác** → `value` mới, xem trước = `urls.preview`, `preview-alt` = tên asset, `kind`, alt =
  `usage.altText` (alt mặc định của asset), crop = `null`; phát `input` rồi `change`. Chọn **lại đúng ảnh cũ** → chỉ làm
  mới ảnh xem trước, không event. Huỷ picker → không đổi gì.
- "Gỡ" → `value = ''`, alt `''`, crop `null`, phát `input` + `change`, focus về nút mở.
- Đóng picker → focus trở lại nút đã mở nó; nếu nút đó đã bị ẩn / gỡ → nút mở.
- Field bị gỡ khỏi trang khi picker đang mở → kết quả bị bỏ.
- Gán `field.value = 'a_123'` bằng code (im lặng, không event): ảnh xem trước và **crop bị xoá** (thuộc ảnh cũ), **alt
  giữ nguyên**, `kind` về loại đầu của `accept-kind`. Rồi nếu có adapter, field gọi `adapter.get(id)` (lười, latest-wins,
  gán tiếp thì request cũ bị abort) để lấy ảnh; không có adapter / `get` lỗi → trạng thái "Đã chọn (không có ảnh xem
  trước)" (console chỉ nhận `td-media-field get failed (<code>)`, không lỗi gốc). Trang SSR có sẵn `preview-src` / `preview-alt` **không bao giờ** gọi adapter lúc
  tải.
- Cần gán đủ id + ảnh + alt + crop cùng lúc (ví dụ app tự mở picker) → `setSelection(selectedMedia)` (im lặng); `null`
  hoặc `[]` → xoá hết.
- Không có adapter nào (không `field.adapter`, không `pickerOptions.adapter`, không `configureDefaults`) → bấm khung chỉ
  cảnh báo console một lần, không mở.

### 5. Adapter và option riêng cho một field

```js
const og = document.querySelector('td-media-field[name="og"]');
og.pickerOptions = { title: 'Ảnh chia sẻ', initialFilters: { album: 'seo' }, upload: { maxSize: '5MB' } };
og.adapter = otherAdapter;          // hiếm: field này dùng thư viện khác
```

Thứ tự resolve khi mở: `pickerOptions` > `adapter` của field > `TdMediaPicker.configureDefaults()`. `selection` luôn do
field đặt (`mode: 'single'`, `initialIds`, `kinds` từ `accept-kind`) — `pickerOptions.selection` bị bỏ qua.

### 6. Alt (chế độ usage)

Ô "Mô tả ảnh (alt)" (`maxlength="500"`) nằm dưới khung. Gõ → cập nhật FormData, host phát `input` mỗi lần gõ và `change`
khi rời ô nếu đã đổi (event `input` / `change` native của ô bị chặn tại host, không bị trùng). Chọn ảnh mới trong picker
→ alt = `usage.altText` (alt mặc định của asset); gán `.value =` bằng code → alt giữ nguyên.

### 7. Đổi thuộc tính sau khi nâng cấp, reset, khôi phục, `required`

- Đổi thuộc tính `value`, `preview-src`, `preview-alt`, `kind`, `alt`, `crop` sau khi field đã chạy → **đổi luôn state
  sống**, im lặng (không event). Đổi `value` → state lấy lại từ các thuộc tính hiện có (`preview-src`, `preview-alt`,
  `kind`, `crop`) nhưng **giữ alt đang có**; không có gì để xem trước → `get` lười như `.value =`. Đổi `preview-*` /
  `kind` chỉ đổi phần hiển thị; `alt` / `crop` đổi FormData. Đổi `value` cùng `preview-src` / `preview-alt` thì không
  cần gọi adapter. `label`, `prompt`, `aspect-ratio`, `accept-kind`… vẽ lại, giữ focus.

- `form.reset()` → về đúng trạng thái chụp từ thuộc tính (`value`, `preview-src`, `preview-alt`, `kind`, `alt`, `crop`),
  không event.
- Trình duyệt khôi phục form (Back / bfcache, tự điền phiên) → field nhận lại **chỉ** `id`, alt, crop. State khôi phục
  (`setFormValue` tham số 2, `{"v":1,"id","alt","crop"}`) **không** chứa URL xem trước (có thể là URL ký / token) hay
  nhãn từ server. Ảnh xem trước bắt đầu trống rồi được lấy lại bằng `adapter.get(id)` theo phiên hiện tại (latest-wins,
  abort khi đổi tiếp); chưa có adapter → chờ, tự lấy khi có (`field.adapter`, `pickerOptions` hoặc
  `TdMediaPicker.configureDefaults({ adapter })`).
- `required` → phải có id (`valueMissing`, thông báo `labels.required` "Vui lòng chọn {kind}." — `{kind}` lấy từ
  `labels.kinds` theo loại đầu của `accept-kind`: "ảnh" / "video" / "file"); dùng chung
  [hợp đồng lỗi](../customization/hooks.md#hợp-đồng-lỗi-của-mọi-form-control) (`setError`, `error-text`).
- **Không có JS** (markup từ `td_media_field()`), `required` **không** được trình duyệt kiểm (giá trị nằm trong hidden
  input) → server **phải** validate.

### 8. Render phía server (PHP)

`td_media_field('hero', $post->hero_media_id, ['label' => 'Ảnh đại diện', 'aspect_ratio' => '3/2', 'preview_src' =>
$thumbUrl, 'preview_alt' => $name])` in host + markup đầy đủ (`data-td-ssr="media-field@1"`) + hidden input → khi chưa
có JS, form vẫn gửi **đúng** hình dạng ở mục 1; nút mở / Đổi / Gỡ ẩn (`visibility: hidden`, giữ chỗ) tới khi module
tải. Module tải → nhận markup **tại chỗ** (không nháy, không xô lệch), gỡ hidden input, FormData giống từng byte. Chi
tiết: [Adapter PHP › td_media_field](../guides/php-adapter.md#td_media_field-0320).

PHP in nhãn **tiếng Việt mặc định** (`Td::MEDIA_FIELD_LABELS`). Site đổi `TdMediaField.labels` (ví dụ tiếng Anh) → chữ
in sẵn không khớp `render()` nên field **render lại an toàn** lúc nâng cấp thay vì nhận tại chỗ (không mất giá trị, alt
đang gõ hay focus — chỉ mất lợi ích "không nháy").

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `name` | string | — | Tên field. Usage + tên kết thúc `[]` → không gửi |
| `label` | string | — | Nhãn (cũng là tiêu đề picker) |
| `value` | string | `''` | `assetId` **mặc định** (reset về đây); đổi sau khi nâng cấp → đổi state sống (mục 7) |
| `preview-src` | URL | — | Ảnh xem trước (`https:`, `http:` khi trang là `http:`, tương đối). Chỉ hiển thị |
| `preview-alt` | string | — | Tên đọc cho ảnh đang chọn ("Đã chọn: {preview-alt}"; vắng mà có ảnh → "Đã chọn: {assetId}"); tên file khi `kind="file"` |
| `kind` | `image` \| `video` \| `file` | `image` | Loại của asset đang chọn |
| `accept-kind` | danh sách | `image` | Loại được chọn trong picker |
| `aspect-ratio` | `W/H` \| `W:H` \| số | — | Tỉ lệ khung |
| `preview-fit` | `cover` \| `contain` | `cover` | Cách ảnh nằm trong khung có tỉ lệ |
| `usage` | boolean | — | Dạng gửi usage (ô alt + `[id]` / `[alt]` / `[crop]`) |
| `alt` | string | `''` | Alt mặc định (usage) |
| `crop` | JSON v1 | — | Crop mặc định (usage); sai định dạng → coi như `null` |
| `prompt` | string | theo `accept-kind` | Chữ trong khung rỗng |
| `helper-text` / `error-text` | string | — | Ghi chú / lỗi |
| `required` / `disabled` | boolean | — | |

## Property & method

| Thành viên | Kiểu / chữ ký | Mô tả |
|---|---|---|
| `value` | `string` | `assetId` hiện tại (`''` = rỗng). Gán bằng code: không event, xoá preview + crop, giữ alt, `get` lười |
| `selection` | `[] \| [{ assetId, asset: MediaAsset \| null, usage: { altText, crop: { normalized: { x, y, width, height } } \| null, focalPoint: null } }]` (chỉ đọc) | `asset = null` khi chỉ có dữ liệu SSR / khôi phục / `.value =` chưa `get` xong |
| `setSelection(selected \| null)` | `(SelectedMedia \| SelectedMedia[] \| null) => void` | Gán id + ảnh (`asset.urls.preview`) + alt (`usage.altText`, không có → `defaultAltText`) + crop (`usage.crop.normalized`) bằng code, im lặng. `null` / `[]` / thiếu `assetId` → xoá hết |
| `adapter` | `MediaPickerAdapter \| null` | Adapter riêng cho field |
| `pickerOptions` | `Partial<OpenMediaPickerOptions>` | Option riêng khi mở picker (trừ `selection`) |
| `setError(msg)` / `clearError()` / `errorMessage` | | Hợp đồng lỗi |
| `form`, `validity`, `validationMessage`, `willValidate`, `checkValidity()`, `reportValidity()` | | Như control native |
| `TdMediaField.labels` | static | Nhãn (dưới) |

## Event

| Event | detail | Khi nào |
|---|---|---|
| `input` | `{ value, selection }` | Người dùng chọn ảnh khác, gỡ, hoặc gõ alt |
| `change` | `{ value, selection }` | Ngay sau `input` khi chọn / gỡ; khi rời ô alt đã đổi |

Gán `value` / `setSelection()` / `form.reset()` / chọn lại đúng ảnh cũ không phát event.

## Nhãn — `TdMediaField.labels`

| Key | Mặc định |
|---|---|
| `prompt.image` / `prompt.video` / `prompt.file` | "Chọn ảnh" / "Chọn video" / "Chọn file" |
| `replace.image` / `replace.video` / `replace.file` | "Đổi ảnh" / "Đổi video" / "Đổi file" |
| `remove` | "Gỡ" |
| `alt` | "Mô tả ảnh (alt)" |
| `empty` | "Chưa chọn" (đọc cho trình đọc màn hình) |
| `selected` | "Đã chọn: {name}" |
| `noPreview` | "Đã chọn (không có ảnh xem trước)" |
| `video` | "Video" (nhãn trên poster) |
| `required` | "Vui lòng chọn {kind}." |
| `kinds.image` / `kinds.video` / `kinds.file` | "ảnh" / "video" / "file" (điền `{kind}` của `required`) |

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-media-field-w` | `100%` | Bề rộng host |
| `--td-media-field-empty-h` | `10rem` | Chiều cao khung rỗng khi **không** có `aspect-ratio` |
| `--td-media-field-max-h` | `24rem` | Chiều cao tối đa của ảnh khi **không** có `aspect-ratio` |

Khung rỗng: viền 1px dashed `--td-color-text-muted` (≥ 3.2:1 trên nền khung rỗng), nền `--td-color-surface-muted`; có ảnh: viền liền
`--td-color-border`, nền `--td-color-surface`; lỗi: viền `--td-field-error`. Trên màn cảm ứng
các nút ≥ 44px.

## Cấu trúc DOM & class

```html
<td-media-field class="td-media-field" name="hero" label="Ảnh đại diện" aspect-ratio="3/2">
  <span class="td-media-field__label" id="{id}-label">Ảnh đại diện</span>
  <div class="td-media-field__frame" data-state="empty|filled" data-kind="image|video|file">
    <svg class="td-media-field__sizer" viewBox="0 0 3 2" aria-hidden="true" focusable="false"></svg>
    <button type="button" class="td-media-field__open" aria-haspopup="dialog" aria-labelledby="{id}-label {id}-state">
      <!-- rỗng -->
      <span class="td-media-field__empty"><span class="td-media-field__icon" data-td-icon="image" aria-hidden="true"></span>
        <span class="td-media-field__prompt">Chọn ảnh</span><span class="td-media-field__ratio">3:2</span></span>
      <!-- có ảnh: <img class="td-media-field__img" src alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
           [+ <span class="td-media-field__badge">Video</span>] | file: icon + <span class="td-media-field__name"> -->
      <span class="td-sr-only" id="{id}-state">Chưa chọn</span>
    </button>
  </div>
  <div class="td-media-field__actions" hidden>
    <button type="button" class="td-btn td-btn--secondary td-btn--sm td-media-field__replace" aria-haspopup="dialog">Đổi ảnh</button>
    <button type="button" class="td-btn td-btn--ghost td-btn--sm td-media-field__remove">Gỡ</button>
  </div>
  <!-- usage: <div class="td-field td-media-field__usage"><label class="td-field__label" for="{id}-alt">Mô tả ảnh (alt)</label>
               <input type="text" class="td-field__control td-media-field__alt" id="{id}-alt" maxlength="500"></div> -->
  <!-- <span class="td-media-field__help" id="{id}-help">…</span> -->
  <!-- <span class="td-field-error" id="{id}-error" data-for="{id}">…</span>  (nút mở: aria-invalid + aria-errormessage) -->
</td-media-field>
```

- Nút mở là `<button>` thật, không bọc control khác; Đổi / Gỡ là nút anh em, **luôn hiện** khi có ảnh (không chỉ khi rê
  chuột — màn cảm ứng thấy được).
- `img alt=""` vì trạng thái đã được đọc qua `{id}-state` ("Đã chọn: iphone-17.jpg").
- Hợp đồng SSR `media-field@1` ([ADR 0012](../internal/decisions/0012-ssr-hydration.md)): markup giống hệt + hidden input
  `.td-media-field__value` (`name` / `name[id]`), `name="…[alt]"` trên ô alt, hidden `.td-media-field__crop`. Nhận tại
  chỗ khi cấu trúc, thuộc tính (allowlist), URL / tỉ lệ / crop đều hợp lệ; lệch → render an toàn, giữ value / alt đang gõ /
  focus. Di chuyển field đã nâng cấp sang chỗ khác → giữ nguyên node; markup bị sửa khi đang tách → render an toàn + khôi
  phục state.

## Bàn phím & trợ năng

| Phím | Tác dụng |
|---|---|
| Tab | Nút mở → (Đổi → Gỡ) → ô alt |
| Enter / Space trên nút mở hoặc "Đổi" | Mở picker; đóng picker → focus trở lại nút đã mở (nút bị ẩn → nút mở) |
| Enter / Space trên "Gỡ" | Gỡ ảnh, focus về nút mở |

Tên của nút mở = nhãn + trạng thái ("Ảnh đại diện, Chưa chọn"). `<label for="{id host}">` bên ngoài → focus nút mở.
`disabled` / `<fieldset disabled>` → mọi nút + ô alt `disabled`.

## Bảo mật

- `label`, `preview-alt`, `prompt`, `helper-text`, `error-text`, nhãn đều là text.
- `preview-src` qua cổng URL `safeMediaUrl` (chỉ `https:` / `http:` khi trang là `http:` / tương đối); `javascript:`,
  `data:`, `file:` → không có `<img>`. Ảnh có `referrerpolicy="no-referrer"` (CDN chống hotlink phải chấp nhận referer
  rỗng; CSP `img-src` phải cho phép origin ảnh — xem [media picker › CSP](media-picker.md#csp-ảnh-và-referrer)).
- Giá trị form chỉ là `assetId` / alt / crop đã validate định dạng. Server **phải** kiểm id (tồn tại, loại, quyền), cắt
  alt, validate crop — không tin client.

## Chuyển từ dcms2 `MediaPickerPlaceholder`

| dcms2 | td-media-field |
|---|---|
| Hidden input chứa **URL** ảnh (`hiddenInput.value = imageUrl`) | Gửi **`assetId`**; URL chỉ để xem trước (`preview-src`). Server đổi cột lưu từ URL sang id |
| `onChange(url)` callback | Event `change` (`detail: { value, selection }`) trên host |
| `ratioText` truyền tay ("3:2") | Tự suy từ `aspect-ratio` |
| `freeStyle: true` (khung giữ tỉ lệ, ảnh theo tỉ lệ gốc) | **Bỏ** `aspect-ratio`: rỗng cao `--td-media-field-empty-h`, có ảnh theo tỉ lệ gốc (trần `--td-media-field-max-h`) |
| Nút gỡ chỉ hiện khi rê chuột | Nút "Đổi" / "Gỡ" luôn hiện, là `<button>` thật |
| Cả khung là `role="button"` chứa nút khác | Nút mở và Đổi / Gỡ là nút anh em (không lồng control) |
| `window.DCMS.MediaPicker` | [`TdMediaPicker`](media-picker.md) + adapter của site (`configureDefaults`) |
| Chế độ video có player trong field | Chỉ poster + nhãn "Video" |
| `style.*` inline (aspect-ratio, width, màu viền) | SVG sizer + token `--td-media-field-*` (CSP strict) |
| `Math.random()` id, `innerHTML` có nội suy | id ổn định, mọi chuỗi là text |

Shim tương thích cho code dcms2 cũ (nếu cần) nằm ở **dcms2**, không ở kit ([ADR 0007](../internal/decisions/0007-td-canonical-over-dcms.md),
[ADR 0013](../internal/decisions/0013-media-picker-boundary.md)).

## Lưu ý & lỗi thường gặp

- **Bấm khung không mở gì, console báo không có adapter** → gọi `TdMediaPicker.configureDefaults({ adapter })` (hoặc gán
  `field.adapter`) trước khi người dùng bấm.
- **Server nhận URL thay vì id** → đang đọc input khác; FormData của field chỉ có `assetId`.
- **`og[crop]` luôn là `"null"`** → bình thường ở 0.32 khi chưa có crop từ server (UI crop có ở 0.33).
- **Form usage không gửi gì** → `name` kết thúc `[]` (ví dụ `og[]`); bỏ `[]`.
- **Ảnh xem trước không hiện** → `preview-src` không phải `https:` / tương đối, hoặc CSP `img-src` / CDN chống hotlink chặn.
- **`required` không chặn submit khi chưa có JS** → giới hạn của hidden input; validate ở server.

## Xem thêm

- [Media picker](media-picker.md) · [Media grid](media-grid.md) · [Form](../guides/forms.md)
- [Adapter PHP › td_media_field](../guides/php-adapter.md#td_media_field-0320) · [Theming](../customization/theming.md) ·
  [Hook](../customization/hooks.md#tdmediapicker)
