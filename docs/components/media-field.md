[Tài liệu](../README.md) › [Components](README.md) › Media field

# Ô chọn ảnh — `<td-media-field>`

Ô form chọn **một** ảnh / video / file từ thư viện media, giao diện **placeholder kiểu dcms2** (0.79.0; 0.79.1 y hệt dcms2): khung nét đứt cả khi rỗng lẫn khi có ảnh;
khi rỗng chỉ có vòng tròn xám chứa icon (lời nhắc chỉ hiện khi đặt `prompt`), xem trước khi đã chọn; **cả khung bấm được** để chọn / đổi ảnh (mở [media picker](media-picker.md),
chế độ đơn); nút **X tròn đỏ** ở góc trên-cuối để gỡ, hiện khi rê chuột / Tab vào ô (màn cảm ứng: luôn hiện), chữ tỉ lệ (`3:2`, `1.91:1`…)
nằm dưới khung. Không còn hai nút chữ "Đổi ảnh" / "Gỡ" dưới khung.
Từ 0.35.0 (`croppable`): **nút icon cắt** cạnh X + bước cắt khi chọn ảnh — chỉ lưu toạ độ, không tạo file mới.
Giá trị gửi form là **`assetId`** — không bao giờ là URL. Dùng cho ảnh đại diện bài viết, ảnh OG, logo thương hiệu,
poster video, file đính kèm một-cái.

Cần chèn **nhiều** ảnh vào nội dung → gọi thẳng [`TdMediaPicker.open()`](media-picker.md) chế độ `multiple`. Field
nhiều ảnh có thứ tự (gallery sản phẩm, ảnh bài viết) → [Media gallery](media-gallery.md) (0.43.0).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/media-field'` (class: `import { TdMediaField } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | có |
| Từ phiên bản | 0.32.0 (cần `td.css`; cần một adapter — xem [media picker](media-picker.md#cấu-hình-mặc-định--configuredefaults)); 0.35.0 cắt ảnh (`croppable`, `crop-ratio`, `focal-point`, `focal`); 0.79.0 giao diện placeholder (bỏ nút Đổi / Gỡ, X góc, `hide-label`, `hide-hints`, DOM `media-field@2`) |

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
| **Usage + focal** (0.35.0) | `usage` + `focal-point` | đủ **bốn** mục: `name[id]`, `name[alt]`, `name[crop]`, `name[focal]` (đúng thứ tự này) | Server cần điểm trọng tâm để tự cắt nhiều tỉ lệ |

- `name[crop]` = chuỗi JSON `{"v":1,"x":…,"y":…,"width":…,"height":…}` (toạ độ chuẩn hoá 0..1 theo ảnh gốc) **hoặc chuỗi
  `null`**. `null` nghĩa là **không cắt — dùng nguyên ảnh** (hoặc server tự quyết theo tỉ lệ khung). Crop từ thuộc tính
  `crop` do server in ra được gửi lại **đúng từng byte** khi người dùng không sửa; đổi / gỡ ảnh → `null` (crop cũ thuộc
  ảnh cũ). 0.35 chỉ thêm UI sửa crop (`croppable`, [mục 9](#9-cắt-ảnh--croppable-0350)) — tên mục và định dạng **không đổi**;
  crop do UI cắt tạo ra có tối đa 6 chữ số thập phân, khoá theo thứ tự `v,x,y,width,height`.
- `name[focal]` (0.35.0, **chỉ khi** có `focal-point`) = `{"v":1,"x":…,"y":…}` (0..1 theo **toàn ảnh gốc**, ≤ 128 ký tự)
  **hoặc chuỗi `null`**. Không có `focal-point` → đúng ba mục như 0.32, không đổi một byte.
- `name` kết thúc bằng `[]` ở chế độ usage (`og[]`) → **không gửi gì** + cảnh báo console (fail closed; PHP cũng vậy).
- Field `disabled` (hoặc trong `<fieldset disabled>`) → không có mục nào (như control native) — server phân biệt "không
  gửi" (giữ nguyên) với "gửi rỗng" (gỡ).
- `preview-src` / `kind` / `preview-alt` **không** được gửi.

**Laravel:**

```php
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

$data = $request->validate([
    'hero'    => ['nullable', 'string', 'max:512', Rule::exists('media', 'id')->where('status', 'ready')],
    'og.id'   => ['nullable', 'string', 'max:512', Rule::exists('media', 'id')],
    'og.alt'  => ['nullable', 'string', 'max:500'],
    'og.crop' => ['nullable', 'string', 'max:512'],
    'og.focal' => ['nullable', 'string', 'max:128'],     // 0.35: chỉ có khi field bật focal-point
]);
// ConvertEmptyStringsToNull: hero='' → null = đã gỡ ảnh. Field disabled → key không có trong request.
$post->hero_media_id = $data['hero'] ?? null;

$crop = $request->input('og.crop');
$crop = ($crop === null || $crop === 'null') ? null : json_decode($crop, true, 4, JSON_THROW_ON_ERROR);
// Kiểm lại: v === 1, x/y ≥ 0, width/height > 0, x + width ≤ 1, y + height ≤ 1 — không tin client.

// 0.35 focal: key vắng = field không bật focal-point (hoặc disabled) → giữ giá trị đã lưu.
if ($request->has('og.focal')) {
    $raw = $request->input('og.focal');               // ConvertEmptyStringsToNull: '' → null
    $focal = null;
    if ($raw !== null && $raw !== 'null') {
        $f = json_decode($raw, true, 2);
        $ok = is_array($f) && array_keys($f) === ['v', 'x', 'y'] && $f['v'] === 1;
        foreach (['x', 'y'] as $k) {
            $ok = $ok && (is_int($f[$k]) || is_float($f[$k])) && $f[$k] >= 0 && $f[$k] <= 1;
        }
        if (!$ok) {
            throw ValidationException::withMessages(['og.focal' => 'Điểm trọng tâm không hợp lệ.']);
        }
        $focal = ['x' => (float) $f['x'], 'y' => (float) $f['y']];
    }
    $seo->og_focal = $focal;
}
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

// 0.35 focal (chỉ khi field bật focal-point): không có key → giữ nguyên giá trị đã lưu
if (array_key_exists('focal', $og)) {
    $rawFocal = is_string($og['focal']) ? $og['focal'] : 'null';
    $ogFocal = null;
    if ($rawFocal !== 'null' && strlen($rawFocal) <= 128) {
        $f = json_decode($rawFocal, true, 2);
        if (is_array($f) && array_keys($f) === ['v', 'x', 'y'] && $f['v'] === 1
            && (is_int($f['x']) || is_float($f['x'])) && (is_int($f['y']) || is_float($f['y']))
            && $f['x'] >= 0 && $f['x'] <= 1 && $f['y'] >= 0 && $f['y'] <= 1) {
            $ogFocal = ['x' => (float) $f['x'], 'y' => (float) $f['y']];
        }
    }
}
```

Crop / focal chỉ là **gợi ý của người soạn**: server lưu chúng **theo chỗ dùng** (OG của bài này), không ghi vào asset, và
khi render tự sinh URL biến đổi ảnh **đã ký** từ giá trị đã lưu — không bao giờ nhận crop từ query string công khai
([Cropper › Dùng toạ độ ở server](cropper.md#8-dùng-toạ-độ-ở-server-cắt-thật-bằng-tham-số-đã-ký)).

`assetId` là chuỗi opaque do app cấp; server **luôn** kiểm id có tồn tại, đúng loại, và người dùng có quyền dùng không —
giá trị form ai cũng sửa được.

### 2. Khung, tỉ lệ và cách ảnh nằm trong khung

**Mặc định (từ 0.77.0): ô xem trước luôn là hình vuông 1:1**, ảnh `object-fit: contain` căn giữa (ảnh ngang / dọc có khoảng trống), cả lúc trống lẫn có ảnh,
kể cả khi có `aspect-ratio` (banner `16/7` cũng vuông). Cạnh = `min(--td-media-field-frame-w, bề rộng ô, --td-media-field-max-h)`; `--td-media-field-max-h` (24rem) là
cạnh tối đa, tăng nó nếu cần ô to hơn. `aspect-ratio` vẫn cho tỉ lệ khung cắt (`crop-ratio` mặc định theo nó) và chữ tỉ lệ ("16:7") trong ô trống. Có `croppable` + crop (và biết kích thước ảnh):
ô vuông hiện **đúng vùng đã cắt**, contain trong ô (`span.td-media-field__view` bọc `<img>`, kích thước qua CSSOM), kể cả crop tự do; chưa có crop → ảnh gốc contain. `preview-fit` không tác dụng ở chế độ này.

**Muốn khung theo tỉ lệ như trước 0.77.0** (`preview-shape="ratio"`, PHP `'preview_shape' => 'ratio'`): bảng dưới là hành vi đó. `ratio` không phân biệt hoa thường; mọi giá trị khác (kể cả ` ratio ` có khoảng trắng) là ô vuông.

```html
<td-media-field name="hero" aspect-ratio="16/7" preview-shape="ratio"></td-media-field>
```

Hành vi với `preview-shape="ratio"`:

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
- **Xem trước vùng cắt** (0.35.0, field `croppable`, chỉ khi có JS; **chế độ `preview-shape="ratio"`**, chế độ vuông xem ở đầu mục này): có crop + khung có `aspect-ratio` + tỉ lệ pixel của crop khớp tỉ lệ
  khung (lệch ≤ 2 %) → khung hiện **đúng vùng đã cắt** (CSSOM, không `style="…"`); còn lại `object-fit: cover` như cũ.
  Cần kích thước gốc: `asset.width/height`, không có thì kích thước ảnh xem trước (cùng tỉ lệ gốc theo
  [hợp đồng nguồn ảnh](#nguồn-ảnh-cho-hộp-cắt)). SSR / chưa có JS: cover như cũ, khung không xô lệch.

#### Khung nhỏ trong ô rộng: `--td-media-field-frame-w` (0.71.0)

Ô logo hay ảnh đại diện cần **khung nhỏ** (vd 7,5rem) nhưng nhãn, gợi ý và dòng lỗi vẫn phải rộng đủ đọc. Đừng thu
cả ô bằng `--td-media-field-w` (nhãn và lỗi bị ép vào cùng bề rộng đó); hãy đặt `--td-media-field-frame-w`, bề rộng của **riêng khung ảnh**:

```css
.logo-field { --td-media-field-frame-w: 7.5rem; }   /* khung 120px; nhãn, gợi ý và lỗi vẫn rộng bằng ô */
```

```html
<td-media-field class="logo-field" name="logo" label="Logo" aspect-ratio="1/1" helper-text="PNG hoặc SVG, tối đa 2 MB."></td-media-field>
```

- Giá trị là **độ dài hoặc phần trăm** (phần trăm tính theo bề rộng của ô, vd `50%`). Giá trị khác (vd `fit-content`, `max-content`) không dùng được: khung rộng bằng ô.
  Mặc định `100%` (khung rộng bằng ô, như trước 0.71.0). Khung không bao giờ rộng hơn ô: token lớn hơn ô (vd `900px` trong ô 300px) bị chặn ở `100%` của ô.
- Token là custom property nên **kế thừa**: đặt trên cha (`.logo-field`, `:root`, một `<form>`) là đủ. Khung nằm ở mép đầu của ô.
- Mặc định (ô vuông, 0.77.0): khung là hình vuông cạnh bằng token (tối đa `--td-media-field-max-h`). Với `preview-shape="ratio"` và `aspect-ratio`, khung nhỏ lại vẫn giữ tỉ lệ
  (ô `1/1` thành hình vuông đúng bề rộng token); xem trước vùng cắt co theo khung. Không có `aspect-ratio`, chiều cao khung rỗng vẫn là `--td-media-field-empty-h`.
- Chỉ đặt bằng CSS: helper PHP `td_media_field` không có tuỳ chọn bề rộng.

### 3. Video và file

- `accept-kind` (danh sách cách nhau bởi dấu phẩy / khoảng trắng: `image`, `video`, `file`; mặc định `image`) → chuyển
  thành `selection.kinds` của picker + chọn chữ mặc định: "Chọn ảnh" / "Chọn video" / "Chọn file" (`prompt` ghi đè).
- **Video = chỉ chọn poster**: `kind="video"` → khung hiện poster (`urls.preview`) + nhãn "Video"; **không** có player trong
  field.
- `kind="file"` → icon + tên file (`preview-alt`), không có ảnh.

### 4. Chọn, đổi, gỡ

- Bấm khung (cả khi rỗng lẫn khi đã có ảnh = đổi ảnh) → mở picker chế độ đơn, `initialIds = [value]` nếu đang có, tiêu đề = `label`. Bấm nhiều lần
  trong lúc picker đang mở bị bỏ qua (khoá mở hai lần).
- Chọn ảnh **khác** → `value` mới, xem trước = `urls.preview`, `preview-alt` = tên asset, `kind`, alt =
  `usage.altText` (alt mặc định của asset), crop = `null` (field `croppable`: crop / focal của bước cắt — [mục
  9](#9-cắt-ảnh--croppable-0350)); phát `input` rồi `change`. Chọn **lại đúng ảnh cũ** → chỉ làm mới ảnh xem trước, không
  event (field `croppable`: áp crop / focal mới, có event nếu đổi). Huỷ picker → không đổi gì.
- **X** (nút "Gỡ {nhãn}" ở góc khung) → `value = ''`, alt `''`, crop `null`, focal `null`, phát `input` + `change`, focus về ô (nút mở).
- Đóng picker → focus trở lại nút đã mở nó; nếu nút đó đã bị ẩn / gỡ → nút mở.
- Field bị gỡ khỏi trang khi picker đang mở → kết quả bị bỏ.
- Gán `field.value = 'a_123'` bằng code (im lặng, không event): ảnh xem trước, **crop và focal bị xoá** (thuộc ảnh cũ), **alt
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
field đặt (`mode: 'single'`, `initialIds`, `kinds` từ `accept-kind`) — `pickerOptions.selection` bị bỏ qua. Từ 0.35.0
`crop` cũng **luôn** do field đặt (ưu tiên cao nhất): `croppable` → `{ enabled: true, aspectRatio, allowFocalPoint }`,
không → `{ enabled: false }` — `pickerOptions.crop` / `configureDefaults({ crop })` không bao giờ mở được bước cắt cho field
không `croppable`.

**Chọn sẵn ảnh đầu (0.67.0, bật mặc định từ 0.68.0):** field **còn trống** mở picker với ảnh đầu của danh sách đã được chọn sẵn
("Chèn" bật ngay). Field **đã có ảnh** truyền `selection.initialIds = [giá trị]` nên không bị tự chọn đè. Tắt cho mọi field:
`TdMediaPicker.configureDefaults({ autoSelectFirst: false })`; tắt cho một field: `pickerOptions.autoSelectFirst = false`.
Xem [Tự chọn ảnh đầu](media-picker.md#tự-chọn-ảnh-đầu-khi-mở--autoselectfirst-0670) Field luôn là picker chọn **một** ảnh, nên 0.72.0 (picker `multiple` mặc định không chọn sẵn) không đổi gì ở đây.

### 6. Alt (chế độ usage)

Ô "Mô tả ảnh (alt)" (`maxlength="500"`) nằm dưới khung. Gõ → cập nhật FormData, host phát `input` mỗi lần gõ và `change`
khi rời ô nếu đã đổi (event `input` / `change` native của ô bị chặn tại host, không bị trùng). Chọn ảnh mới trong picker
→ alt = `usage.altText` (alt mặc định của asset); gán `.value =` bằng code → alt giữ nguyên.

### 7. Đổi thuộc tính sau khi nâng cấp, reset, khôi phục, `required`

- Đổi thuộc tính `value`, `preview-src`, `preview-alt`, `kind`, `alt`, `crop`, `focal` sau khi field đã chạy → **đổi luôn state
  sống**, im lặng (không event). Đổi `value` → state lấy lại từ các thuộc tính hiện có (`preview-src`, `preview-alt`,
  `kind`, `crop`) nhưng **giữ alt đang có**; không có gì để xem trước → `get` lười như `.value =`. Đổi `preview-*` /
  `kind` chỉ đổi phần hiển thị; `alt` / `crop` đổi FormData. Đổi `value` cùng `preview-src` / `preview-alt` thì không
  cần gọi adapter. `label`, `prompt`, `aspect-ratio`, `accept-kind`… vẽ lại, giữ focus.

- `form.reset()` → về đúng trạng thái chụp từ thuộc tính (`value`, `preview-src`, `preview-alt`, `kind`, `alt`, `crop`,
  `focal`), không event.
- Trình duyệt khôi phục form (Back / bfcache, tự điền phiên) → field nhận lại **chỉ** `id`, alt, crop, focal. State khôi phục
  (`setFormValue` tham số 2, `{"v":1,"id","alt","crop","focal"}` — `focal` thêm ở 0.35, state cũ thiếu `focal` vẫn đọc được) **không** chứa URL xem trước (có thể là URL ký / token) hay
  nhãn từ server. Ảnh xem trước bắt đầu trống rồi được lấy lại bằng `adapter.get(id)` theo phiên hiện tại (latest-wins,
  abort khi đổi tiếp); chưa có adapter → chờ, tự lấy khi có (`field.adapter`, `pickerOptions` hoặc
  `TdMediaPicker.configureDefaults({ adapter })`).
- Mỗi lần adapter / context hiệu lực đổi (`configureDefaults`, `field.adapter`, `pickerOptions`, kể cả gỡ) → request
  `get` đang chờ bị **huỷ trước** (abort + tăng thế hệ nguồn), rồi mới lấy lại nếu còn adapter. Kết quả chỉ được áp khi
  thế hệ request, thế hệ nguồn, adapter, context và id đều còn khớp — adapter cũ phớt lờ `AbortSignal` cũng không ghi
  được ảnh xem trước.
- `required` → phải có id (`valueMissing`, thông báo `labels.required` "Vui lòng chọn {kind}." — `{kind}` lấy từ
  `labels.kinds` theo loại đầu của `accept-kind`: "ảnh" / "video" / "file"); dùng chung
  [hợp đồng lỗi](../customization/hooks.md#hợp-đồng-lỗi-của-mọi-form-control) (`setError`, `error-text`).
- **Không có JS** (markup từ `td_media_field()`), `required` **không** được trình duyệt kiểm (giá trị nằm trong hidden
  input) → server **phải** validate.

### 8. Render phía server (PHP)

`td_media_field('hero', $post->hero_media_id, ['label' => 'Ảnh đại diện', 'aspect_ratio' => '3/2', 'preview_src' =>
$thumbUrl, 'preview_alt' => $name])` in host + markup đầy đủ (`data-td-ssr="media-field@2"`) + hidden input → khi chưa
có JS, form vẫn gửi **đúng** hình dạng ở mục 1; ô mở và các nút công cụ (X / cắt) ẩn (`visibility: hidden`, giữ chỗ) tới khi module
tải. Module tải → nhận markup **tại chỗ** (không nháy, không xô lệch), gỡ hidden input, FormData giống từng byte. Chi
tiết: [Adapter PHP › td_media_field](../guides/php-adapter.md#td_media_field-0320).

Cắt ảnh từ PHP (0.35.0): `croppable`, `crop_ratio`, `focal_point`, `focal` — xem [mục 9](#9-cắt-ảnh--croppable-0350).

Tuỳ chọn PHP `hide_label` / `hide_hints` (bool) in attribute `hide-label` / `hide-hints` ([mục 10](#10-ẩn-nhãn-và-gợi-ý--hide-label-hide-hints-0790)).
HTML cũ còn cache với marker `media-field@1` (cây có `__actions` / `__replace`) bị cổng SSR từ chối → field **render lại an toàn** (giữ value / alt đang gõ / focus).

PHP in nhãn **tiếng Việt mặc định** (`Td::MEDIA_FIELD_LABELS`). Site đổi `TdMediaField.labels` (ví dụ tiếng Anh) → chữ
in sẵn không khớp `render()` nên field **render lại an toàn** lúc nâng cấp thay vì nhận tại chỗ (không mất giá trị, alt
đang gõ hay focus — chỉ mất lợi ích "không nháy").

### 9. Cắt ảnh — `croppable` (0.35.0)

> **⚠ Site phải tự xử lý**: field chỉ gửi toạ độ (`name[crop]`, `name[focal]`); cắt / đổi cỡ ảnh khi render trang là
> việc của endpoint / CDN của site, và checklist [Biến thể ảnh đã cắt](../guides/media-renditions.md) (URL ký HMAC,
> giới hạn biến thể, rate limit, ảnh riêng tư) là **bắt buộc**.

```html
<td-media-field name="og" label="Ảnh chia sẻ (OG)" aspect-ratio="1.91" usage croppable focal-point
                value="a_9f2c" preview-src="https://cdn.example.com/o/a_9f2c.jpg"
                crop='{"v":1,"x":0,"y":0.151124,"width":1,"height":0.698082}' focal='{"v":1,"x":0.4,"y":0.55}'></td-media-field>
```

Gửi form: `og[id]=a_9f2c`, `og[alt]=…`, `og[crop]={"v":1,…}`, `og[focal]={"v":1,"x":0.4,"y":0.55}`.

| Thuộc tính | Tác dụng |
|---|---|
| `croppable` | Bật cắt ảnh: nút icon **"Cắt ảnh"** (cạnh X) + bước cắt khi chọn ảnh qua picker |
| `crop-mode` | 0.75.0: `pan` \| `box` (mặc định). `pan` = hộp cắt giữ khung cố định, người dùng kéo / phóng **ảnh** (avatar) — xem [Cropper › mode](cropper.md#hai-kiểu-thao-tác--mode-0730). Cắt khoảng trắng, không phân biệt hoa thường; giá trị lạ = `box`, im lặng. Áp cho cả nút "Cắt ảnh" và bước cắt của picker (thắng `pickerOptions.crop`). Cần `usage` + `croppable` |
| `crop-shape` | 0.75.0: `circle` \| `rect` (mặc định). `circle` = khung tròn trong hộp cắt; chỉ có tác dụng khi `crop-mode="pan"` **và** tỉ lệ cắt đang là 1:1 (ví dụ `crop-ratio="1"`), ngoài ra cropper cảnh báo một lần và vẽ khung chữ nhật. Chỉ đổi hình khung; ảnh xem trước và `name[crop]` không đổi (vẫn hình vuông) — muốn avatar tròn, bo tròn ảnh xem trước bằng CSS của site (xem dưới). Giá trị lạ = `rect` |
| `crop-ratio` | Tỉ lệ khung cắt: `W/H` \| `W:H` \| số \| `free`; tỉ lệ phải trong **[0.01, 100]**. **Vắng** (hoặc sai / ngoài khoảng: một cảnh báo) → theo `aspect-ratio` của khung (khung ngoài [0.01, 100] → tự do + cảnh báo); vắng cả hai → tự do (như dcms2 tách tỉ lệ cắt khỏi tỉ lệ hiển thị) |
| `focal-point` | Bật điểm trọng tâm: công cụ trong hộp cắt (khi `croppable`) + mục thứ tư `name[focal]` |
| `focal` | Điểm trọng tâm mặc định, JSON v1 `{"v":1,"x","y"}` (0..1). Sai → `null` |

- Cả bốn chỉ có tác dụng ở **chế độ `usage`** (dạng reference không có mục crop): thiếu `usage` → cảnh báo console một
  lần, bỏ qua (fail closed).
- `focal-point` **không** kèm `croppable` → chỉ round-trip giá trị server in ra (như crop ở 0.32), không có UI sửa focal.
- **Nút "Cắt ảnh"** (`.td-media-field__crop-btn`, nút icon tròn trong `.td-media-field__tools`, đứng **trước** X, `aria-haspopup="dialog"`, tên trợ năng "Cắt ảnh {nhãn}") hiện khi: `croppable`
  + `usage` + đã có `value` + `kind="image"` + có nguồn ảnh an toàn (dưới). Bấm → hộp cắt
  ([`TdCropper.openDialog`](cropper.md#hộp-thoại--tdcropperopendialogopts), chung khoá mở-hai-lần với picker) mở từ crop /
  focal hiện tại. **"Áp dụng"** có thay đổi → cập nhật, phát `input` + `change`, focus về nút cắt. Không đổi gì / **"Huỷ"** →
  giữ **nguyên chuỗi crop / focal gốc đúng từng byte** (không làm tròn lại dữ liệu server), không event.
- **Chọn ảnh qua picker** khi `croppable` → "Chèn" mở bước cắt (picker option `crop`), kết quả áp ngay vào field.
- Khung phủ toàn ảnh → `crop = null` ("dùng nguyên ảnh").

#### Nguồn ảnh cho hộp cắt

Hộp cắt tính toạ độ trên ảnh nó hiển thị, nên ảnh đó **phải là ảnh nguyên, không cắt sẵn** (bất kỳ cỡ). Field chọn nguồn
theo thứ tự, **fail closed**:

1. **Có adapter** (`pickerOptions.adapter` > `field.adapter` > defaults): nếu field chưa có asset đầy đủ (trang SSR, khôi
   phục form, `.value =`) hoặc asset thiếu `width/height` → bấm "Cắt ảnh" gọi `adapter.get(value)` (nút `aria-busy` trong
   lúc chờ; đổi value / gỡ field → abort) rồi dùng **`asset.urls.preview` + `asset.width/height`** — **không** dùng
   `preview-src` (có thể là thumbnail của site). `get` lỗi → không mở hộp, báo lỗi qua live region của field (chỉ
   `userMessage` / nhãn `cropError`, trong `span.td-media-field__status`); không âm thầm rơi về `preview-src`.
2. **Không có adapter** (trang PHP / HTML thuần): dùng `preview-src`. **Hợp đồng:** với `croppable`, `preview-src` / PHP
   `preview_src` **phải là ảnh nguyên, không cắt sẵn**. Không biết kích thước gốc → kết quả không có `pixels` (field chỉ
   gửi `normalized` nên đủ).
3. Biết kích thước gốc (bước 1) mà ảnh tải về lệch tỉ lệ > 1 % → hộp cắt báo lỗi, "Áp dụng" khoá — không bao giờ ra toạ độ
   từ ảnh đã cắt.

`urls.preview` của adapter cũng phải là ảnh nguyên khi bật crop ([media picker › hợp đồng adapter](media-picker.md#hợp-đồng-adapter)).

#### Crop / focal đổi khi nào

`crop` / `focal` dưới đây là chuỗi gửi đi trong `name[crop]` / `name[focal]`. Mọi đường cập nhật state **trước** rồi mới
phát event, nên `detail.selection` luôn là state mới.

| Đường | crop | focal | Event |
|---|---|---|---|
| Picker → ảnh **mới**, `croppable` | crop của bước cắt (`null` khi toàn ảnh) | focal của bước cắt hoặc `null` | `input` + `change` |
| Picker → ảnh mới, không `croppable` | `null` (như 0.34) | `null` | `input` + `change` |
| Picker → **cùng** ảnh, `croppable` | làm mới ảnh xem trước **và** áp crop mới | áp focal mới | `input` + `change` **chỉ khi** crop hoặc focal đổi (so số, sai số 1e-6; bằng → giữ chuỗi gốc) |
| Picker → cùng ảnh, không `croppable` | giữ (như 0.34) | giữ | không |
| Hộp cắt "Áp dụng" có thay đổi | crop mới / `null` (toàn ảnh) | focal mới / `null` | `input` + `change` |
| Hộp cắt "Huỷ" / không đổi gì | giữ đúng byte | giữ đúng byte | không |
| X ("Gỡ") | `null` | `null` | `input` + `change` |
| `.value = id` (code) | `null` | `null` | không |
| `setSelection(sel)` | `usage.crop.normalized` (như 0.34, không làm tròn) | `usage.focalPoint` (không làm tròn) | không |
| `setSelection(null)` / `[]` | `null` | `null` | không |
| Đổi thuộc tính `crop` / `focal` | từ thuộc tính | từ thuộc tính | không |
| Đổi thuộc tính `value` (+ preview) | `null` trừ khi `crop` cùng đổi | `null` trừ khi `focal` cùng đổi | không |
| `form.reset()` | thuộc tính `crop` | thuộc tính `focal` | không |
| Khôi phục form (Back / bfcache) | `state.crop` (sai → `null`) | `state.focal` (thiếu / sai → `null`) | không |

Chỉ crop do **UI cắt** tạo ra (bước cắt của picker, "Áp dụng") đi qua bộ chuẩn hoá (6 chữ số thập phân, luôn hợp lệ với
`parseCrop`); mọi đường khác giữ đúng ngữ nghĩa 0.34.

#### Avatar tròn (0.75.0)

```html
<td-media-field name="avatar" usage croppable crop-ratio="1" crop-mode="pan" crop-shape="circle" preview-fit="cover"></td-media-field>
```

Hộp cắt là khung tròn cố định giữa vùng cắt, người dùng kéo / phóng ảnh phía dưới; kết quả vẫn là `name[crop]` hình vuông.
Kit **không** bo tròn ảnh xem trước của field (đó là CSS của site; chọn tự làm tròn là quyết định riêng). Recipe cho
khung 1:1 (`aspect-ratio="1"`): `td-media-field[name="avatar"] :is(.td-media-field__frame, .td-media-field__open) { border-radius: 50%; }` — nút
`.td-media-field__open` chứa ảnh và đã cắt phần thừa (`overflow: hidden`); khung chỉ cần bo cùng để viền tròn theo. Kiểm tra bằng mắt trên site của bạn.

#### PHP

```php
<?= td_media_field('og', $seo->og_media_id, [
    'label' => 'Ảnh chia sẻ (OG)', 'aspect_ratio' => '1.91', 'usage' => true,
    'croppable'   => true,                       // in nút icon "Cắt ảnh" (ẩn tới khi JS chạy, như X)
    'crop_ratio'  => '1.91',                     // tuỳ chọn; vắng → theo aspect_ratio; 'free' → tự do
    // 'crop_mode' => 'pan', 'crop_shape' => 'circle',  // 0.75.0, tuỳ chọn: in crop-mode="pan" / crop-shape="circle"
    'focal_point' => true,                       // in hidden og[focal]
    'alt'   => $seo->og_alt,
    'crop'  => $seo->og_crop,                    // mảng x/y/width/height | JSON v1 | null — in như 0.34
    'focal' => $seo->og_focal,                   // ['x' => 0.4, 'y' => 0.55] | '{"v":1,"x":0.4,"y":0.55}' | null
    'preview_src' => $og?->preview_url,          // với croppable: ẢNH NGUYÊN, không thumbnail cắt sẵn
    'preview_alt' => $og?->original_name,
]) ?>
```

`focal` / `crop_ratio` sai → bỏ + một `E_USER_WARNING`. `crop_mode` / `crop_shape` (0.75.0): chuỗi bằng `pan` / `circle` sau khi cắt khoảng trắng và hạ chữ thường thì in đúng hằng `crop-mode="pan"` / `crop-shape="circle"` (không in lại chuỗi của site); mọi giá trị khác (`box`, `rect`, lạ, không phải chuỗi) → không in gì, im lặng; thiếu `usage` → bỏ + cùng cảnh báo với `crop_ratio`. Phần in crop **không đổi** so với 0.34 (cùng byte). Bốn option
0.35 thiếu `usage` → bỏ cả bốn + một `E_USER_WARNING`. Không có JS: hidden `og[crop]` / `og[focal]` gửi lại đúng giá trị server in ra; nút "Cắt ảnh" ẩn.
Bảng option đầy đủ: [Adapter PHP › td_media_field](../guides/php-adapter.md#td_media_field-0320).

### 10. Ẩn nhãn và gợi ý — `hide-label`, `hide-hints` (0.79.0)

Form chỉ có ô ảnh (avatar, logo) thường không cần nhãn hiện ra hay chữ gợi ý. Hai attribute boolean, thuần CSS (DOM không đổi):

| Attribute / PHP | Tác dụng |
|---|---|
| `hide-label` / `'hide_label' => true` | Nhãn ẩn khỏi mắt (kiểu `td-sr-only`, 1px) nhưng **vẫn là tên trợ năng**: ô mở, nút X / cắt và tiêu đề picker vẫn dùng nó. Nhãn rỗng vẫn không hiện như trước |
| `hide-hints` / `'hide_hints' => true` | Ẩn lời nhắc `prompt` trong khung rỗng và chữ tỉ lệ (`display: none`); hai thứ này không nằm trong tên trợ năng. `helper-text` / `error-text` **không** bị ẩn |

```html
<td-media-field name="avatar" label="Ảnh đại diện" hide-label hide-hints></td-media-field>
```

Bỏ bo góc khung: `--td-media-field-frame-radius: 0` (đặt trên field hoặc cha). Nút mở bo theo `max(0px, frame-radius − 1px)` để ôm viền khung.

#### Bỏ CSS đè của site khi nâng lên 0.79.0

Site từng tự viết CSS đè `.td-media-field__*` để ẩn nhãn / chữ gợi ý / chữ tỉ lệ hoặc bỏ bo góc thì **xoá các luật đó** và dùng:

| CSS đè cũ | Thay bằng |
|---|---|
| ẩn `.td-media-field__label` (giữ tên trợ năng) | attribute `hide-label` |
| ẩn `.td-media-field__prompt` / `.td-media-field__ratio` | attribute `hide-hints` |
| `border-radius: 0` trên `__frame` / `__open` | `--td-media-field-frame-radius: 0` |
| style `.td-media-field__actions` / `__replace` | xoá (phần tử không còn) |
| style `.td-media-field__remove` / `__crop-btn` như nút chữ | đổi màu bằng token `-remove-bg/-fg`, `-tool-bg/-fg`, kích thước bằng `-tool-size` |

## Responsive (0.34.0)

Host `<td-media-field>` là **container** (`container: td-media-field / inline-size`, thêm `min-inline-size: 0`). Khi field
**hẹp hơn 360px** (cỡ `2xs` chỉ dành cho container) giao diện không đổi hình dạng (từ 0.79.0 không còn hai nút chữ để xếp dọc;
X / cắt là nút tròn nằm trong góc khung). Khung ảnh không bao giờ rộng hơn ô (luôn bị chặn ở 100% bề rộng ô). Cần bề rộng từ cha: `--td-media-field-w` phải là độ dài / phần trăm
(mặc định `100%`), **không** `fit-content` / `max-content` (container co theo nội dung sẽ sụp về 0). Muốn khung nhỏ mà phần còn lại vẫn rộng: dùng
[`--td-media-field-frame-w`](#khung-nhỏ-trong-ô-rộng---td-media-field-frame-w-0710), đừng thu `--td-media-field-w`.

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
| `preview-fit` | `cover` \| `contain` | `cover` | Cách ảnh nằm trong khung có tỉ lệ (chỉ khi `preview-shape="ratio"`; ô vuông luôn contain) |
| `preview-shape` | `ratio` | — (vuông) | 0.77.0: vắng = ô xem trước vuông 1:1, ảnh contain; `ratio` (không phân biệt hoa thường) = khung theo `aspect-ratio` / tỉ lệ ảnh như trước 0.77.0. Giá trị khác = vuông |
| `usage` | boolean | — | Dạng gửi usage (ô alt + `[id]` / `[alt]` / `[crop]`, + `[focal]` khi `focal-point`) |
| `alt` | string | `''` | Alt mặc định (usage) |
| `crop` | JSON v1 | — | Crop mặc định (usage); sai định dạng → coi như `null` |
| `croppable` | boolean | — | 0.35: nút icon "Cắt ảnh" + bước cắt khi chọn (cần `usage`) |
| `crop-ratio` | `W/H` \| `W:H` \| số \| `free` | theo `aspect-ratio` | 0.35: tỉ lệ khung cắt |
| `crop-mode` | `box` \| `pan` | `box` | 0.75.0: kiểu thao tác của hộp cắt (cần `usage` + `croppable`) |
| `crop-shape` | `rect` \| `circle` | `rect` | 0.75.0: hình khung của hộp cắt; tròn chỉ khi `pan` + tỉ lệ 1:1 |
| `focal-point` | boolean | — | 0.35: điểm trọng tâm + mục `name[focal]` (cần `usage`) |
| `focal` | JSON v1 `{"v":1,"x","y"}` | — | 0.35: focal mặc định; sai → `null` |
| `prompt` | string | theo `accept-kind` | Chữ trong khung rỗng. 0.79.1: chỉ hiện khi đặt attribute (không rỗng); không đặt thì khung rỗng chỉ có icon như dcms2 (span vẫn có trong DOM, `display: none`) |
| `helper-text` / `error-text` | string | — | Ghi chú / lỗi. 0.54.0: có lỗi thì ghi chú ẩn (và rời khỏi mô tả); đổi `helper-text` không render lại; `setHelper()` / `helperMessage`; nội dung giàu: `<td-hint>` con — [Hint](hint.md) |
| `hide-label` | boolean | — | 0.79.0: nhãn ẩn khỏi mắt, vẫn là tên trợ năng ([mục 10](#10-ẩn-nhãn-và-gợi-ý--hide-label-hide-hints-0790)) |
| `hide-hints` | boolean | — | 0.79.0: ẩn lời nhắc `prompt` và chữ tỉ lệ (`helper-text` / `error-text` vẫn hiện) |
| `required` / `disabled` | boolean | — | |

## Property & method

| Thành viên | Kiểu / chữ ký | Mô tả |
|---|---|---|
| `value` | `string` | `assetId` hiện tại (`''` = rỗng). Gán bằng code: không event, xoá preview + crop, giữ alt, `get` lười |
| `selection` | `[] \| [{ assetId, asset: MediaAsset \| null, usage: { altText, crop: { normalized: { x, y, width, height } } \| null, focalPoint: { x, y } \| null } }]` (chỉ đọc) | `asset = null` khi chỉ có dữ liệu SSR / khôi phục / `.value =` chưa `get` xong. `focalPoint` là giá trị thật khi có `focal-point` (0.34 luôn `null`) |
| `setSelection(selected \| null)` | `(SelectedMedia \| SelectedMedia[] \| null) => void` | Gán id + ảnh (`asset.urls.preview`) + alt (`usage.altText`, không có → `defaultAltText`) + crop (`usage.crop.normalized`) + focal (`usage.focalPoint`, 0.35) bằng code, im lặng, không làm tròn. `null` / `[]` / thiếu `assetId` → xoá hết |
| `adapter` | `MediaPickerAdapter \| null` | Adapter riêng cho field |
| `pickerOptions` | `Partial<OpenMediaPickerOptions>` | Option riêng khi mở picker (trừ `selection`) |
| `setError(msg)` / `clearError()` / `errorMessage` | | Hợp đồng lỗi |
| `form`, `validity`, `validationMessage`, `willValidate`, `checkValidity()`, `reportValidity()` | | Như control native |
| `TdMediaField.labels` | static | Nhãn (dưới) |

## Event

| Event | detail | Khi nào |
|---|---|---|
| `input` | `{ value, selection }` | Người dùng chọn ảnh khác, gỡ, gõ alt, hoặc (0.35) đổi crop / focal bằng hộp cắt / bước cắt |
| `change` | `{ value, selection }` | Ngay sau `input` khi chọn / gỡ / áp crop; khi rời ô alt đã đổi |

Gán `value` / `setSelection()` / `form.reset()` / chọn lại đúng ảnh cũ (không `croppable`, hoặc crop / focal y hệt) không
phát event.

## Nhãn — `TdMediaField.labels`

| Key | Mặc định |
|---|---|
| `prompt.image` / `prompt.video` / `prompt.file` | "Chọn ảnh" / "Chọn video" / "Chọn file" |
| `replace.image` / `replace.video` / `replace.file` | "Đổi ảnh" / "Đổi video" / "Đổi file" — **deprecated từ 0.79.0**: giữ key (site đã ghi đè không vỡ) nhưng **không còn render**; bỏ ở 1.0 |
| `remove` | "Gỡ" (nút X có tên trợ năng "Gỡ {nhãn}", tooltip "Gỡ") |
| `crop` | "Cắt ảnh" (0.35; nút icon có tên "Cắt ảnh {nhãn}", tooltip "Cắt ảnh"; tiêu đề hộp cắt = "Cắt ảnh · {tỉ lệ}" khi khoá) |
| `cropError` | "Không tải được ảnh để cắt." (0.35; khi `adapter.get` lỗi không có `userMessage` / không có URL ảnh an toàn) |
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
| `--td-media-field-w` | `100%` | Bề rộng host (nhãn, nút, gợi ý, lỗi và khung nằm trong bề rộng này) |
| `--td-media-field-frame-w` | `100%` | Bề rộng của **riêng khung ảnh**: độ dài hoặc phần trăm của host, tối đa bằng host (0.71.0). Xem [khung nhỏ trong ô rộng](#khung-nhỏ-trong-ô-rộng---td-media-field-frame-w-0710) |
| `--td-media-field-empty-h` | `10rem` | Chiều cao khung rỗng khi **không** có `aspect-ratio` (chỉ `preview-shape="ratio"`) |
| `--td-media-field-max-h` | `24rem` | Cạnh tối đa của ô vuông xem trước (0.77.0); với `preview-shape="ratio"`: chiều cao tối đa của ảnh khi **không** có `aspect-ratio` |
| `--td-media-field-frame-radius` | `var(--td-radius-md)` | 0.79.0: bo góc khung; nút mở bo `max(0px, giá trị − 1px)`. `0` = vuông góc |
| `--td-media-field-tool-size` | `1.75rem` | 0.79.0: đường kính nút X / cắt (vùng chạm trên màn cảm ứng vẫn ≥ `--td-touch-min`, qua `::before`) |
| `--td-media-field-remove-bg` / `-remove-fg` | `var(--td-solid-danger-bg)` / `var(--td-solid-danger-fg)` | 0.79.0: nền / icon nút X (hover: `--td-solid-danger-hover`) |
| `--td-media-field-tool-bg` / `-tool-fg` | `rgb(0 0 0 / 60%)` / `#fff` | 0.79.0: nền / icon nút cắt |
| `--td-media-field-tool-shadow` | `var(--td-shadow-2)` | 0.79.0: bóng nhẹ tách nút khỏi ảnh sáng |
| `--td-media-field-empty-icon-size` | `4rem` | 0.79.0: đường kính vòng tròn icon của khung rỗng |
| `--td-media-field-empty-icon-bg` | `color-mix(in srgb, var(--td-color-text) 10%, var(--td-color-surface-muted))` | 0.79.0: nền vòng tròn icon (tự theo theme tối vì trộn từ token chữ / nền) |

Token 0.79.0 **không khai báo trên `:root`** (chỉ dùng `var(--x, mặc định)`) để giá trị mặc định đi theo theme; đặt chúng trên field, một cha hoặc `:root` của site đều có tác dụng.

Khung (0.79.1, cả rỗng lẫn có ảnh): viền 1px dashed `--td-color-text-muted` (≥ 3.2:1 trên nền khung rỗng); nền rỗng `--td-color-surface-muted`, có ảnh
`--td-color-surface`, rê chuột tinh lên ô có ảnh: viền `--td-color-text`; lỗi: viền `--td-field-error`. Con trỏ tinh: nút X / cắt `opacity: 0`, hiện khi rê vào khung hoặc Tab vào ô
(`:hover` / `:focus-within`); màn cảm ứng (`(hover: none), (pointer: coarse)`): luôn hiện, vùng chạm mỗi nút ≥ 44 × 44px (hai vùng chỉ chạm mép nhau, không chồng),
nhấn có trạng thái `data-td-pressed` (nền đậm hơn). Field `disabled` (kể cả `<fieldset disabled>`) ẩn hẳn hai nút.

## Cấu trúc DOM & class

```html
<td-media-field class="td-media-field" name="hero" label="Ảnh đại diện" aspect-ratio="3/2" data-td-ssr="media-field@2">
  <span class="td-media-field__label" id="{id}-label">Ảnh đại diện</span>
  <div class="td-media-field__frame" data-state="empty|filled" data-kind="image|video|file">
    <svg class="td-media-field__sizer" viewBox="0 0 3 2" aria-hidden="true" focusable="false"></svg>
    <button type="button" class="td-media-field__open" aria-haspopup="dialog" aria-labelledby="{id}-label {id}-state">
      <!-- rỗng -->
      <span class="td-media-field__empty"><span class="td-media-field__badge-icon"><span class="td-media-field__icon" data-td-icon="image" aria-hidden="true"></span></span>
        <span class="td-media-field__prompt">Chọn ảnh</span></span>
      <!-- có ảnh: <img class="td-media-field__img" src alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
           [+ <span class="td-media-field__badge">Video</span>] | file: icon + <span class="td-media-field__name"> -->
      <!-- ô vuông + croppable + crop: <span class="td-media-field__view"><img class="td-media-field__img" …></span>
           (JS thêm / gỡ; style chỉ là CSSOM --_td-mf-view-w / -h; `preview-shape="ratio"` không có span này) -->
      <span class="td-sr-only" id="{id}-state">Chưa chọn</span>
    </button>
    <!-- 0.79.0: nút công cụ là anh em của nút mở (không lồng nút trong nút); [hidden] khi rỗng -->
    <div class="td-media-field__tools" hidden>
      <!-- croppable: --><button type="button" class="td-media-field__tool td-media-field__crop-btn" aria-haspopup="dialog"
              aria-labelledby="{id}-crop-t {id}-label" title="Cắt ảnh"><span class="td-media-field__icon" data-td-icon="crop" aria-hidden="true"></span>
              <span class="td-sr-only" id="{id}-crop-t">Cắt ảnh</span></button>
      <button type="button" class="td-media-field__tool td-media-field__remove" aria-labelledby="{id}-remove-t {id}-label" title="Gỡ">
        <span class="td-media-field__icon" data-td-icon="close" aria-hidden="true"></span><span class="td-sr-only" id="{id}-remove-t">Gỡ</span></button>
    </div>
  </div>
  <!-- 0.79.0: chữ tỉ lệ DƯỚI khung, cả rỗng lẫn có ảnh, khi có aspect-ratio hợp lệ: <span class="td-media-field__ratio">3:2</span> -->
  <!-- usage: <div class="td-field td-media-field__usage"><label class="td-field__label" for="{id}-alt">Mô tả ảnh (alt)</label>
               <input type="text" class="td-field__control td-media-field__alt" id="{id}-alt" maxlength="500"></div> -->
  <!-- <span class="td-media-field__help" id="{id}-help">…</span> -->
  <!-- <span class="td-field-error" id="{id}-error" data-for="{id}">…</span>  (nút mở: aria-invalid + aria-errormessage) -->
</td-media-field>
```

- Nút mở là `<button>` thật, không bọc control khác; X / cắt nằm trong `__frame > __tools`, là nút anh em của nút mở. Con trỏ tinh chỉ thấy
  khi rê / Tab vào khung; con trỏ thô / không hover thì **luôn hiện** (màn cảm ứng không có hover).
- 0.79.0 **bỏ** `div.td-media-field__actions` và `button.td-media-field__replace`; `span.td-media-field__ratio` chuyển ra **dưới khung**
  (trước là con của `__empty`, chỉ khi rỗng). `.td-media-field__crop-btn` / `__remove` không còn là `td-btn` chữ mà là nút icon tròn.
- `img alt=""` vì trạng thái đã được đọc qua `{id}-state` ("Đã chọn: iphone-17.jpg").
- Hợp đồng SSR `media-field@2` (0.79.0; `@1` từ 0.32–0.78 — HTML cache cũ bị từ chối rồi render an toàn) ([ADR 0012](../internal/decisions/0012-ssr-hydration.md)): markup giống hệt + hidden input
  `.td-media-field__value` (`name` / `name[id]`), `name="…[alt]"` trên ô alt, hidden `.td-media-field__crop` (+ 0.35:
  hidden `.td-media-field__focal` `name[focal]` khi `focal_point`, nút icon `.td-media-field__crop-btn` trong `__tools` khi `croppable`). Attribute `hide-label` / `hide-hints` do PHP in qua `hide_label` / `hide_hints`. Nhận tại
  chỗ khi cấu trúc, thuộc tính (allowlist), URL / tỉ lệ / crop đều hợp lệ; lệch → render an toàn, giữ value / alt đang gõ /
  focus. Di chuyển field đã nâng cấp sang chỗ khác → giữ nguyên node; markup bị sửa khi đang tách → render an toàn + khôi
  phục state.

## Bàn phím & trợ năng

| Phím | Tác dụng |
|---|---|
| Tab | Ô (nút mở) → (Cắt ảnh →) Gỡ → ô alt. Tab vào ô là X / cắt hiện ra (`:focus-within`) |
| Enter / Space trên ô | Mở picker (rỗng: chọn; có ảnh: đổi); đóng picker → focus trở lại nút đã mở (nút bị ẩn → ô) |
| Enter / Space trên X ("Gỡ") | Gỡ ảnh, focus về ô |
| Enter / Space trên "Cắt ảnh" | Mở hộp cắt ([bàn phím của cropper](cropper.md#bàn-phím--trợ-năng)); đóng → focus về nút cắt |

Không có phím tắt mới (Delete để gỡ: chưa hỗ trợ). Tên của nút mở = nhãn + trạng thái ("Ảnh đại diện, Chưa chọn"). Tên nút công cụ gồm nhãn để nhiều ô
trên một trang vẫn phân biệt được: **"Gỡ {nhãn}"** / **"Cắt ảnh {nhãn}"**. Chữ tỉ lệ nằm ngoài nút nên đọc được ở chế độ duyệt.
`<label for="{id host}">` bên ngoài → focus nút mở. `disabled` / `<fieldset disabled>` → mọi nút + ô alt `disabled` (X / cắt không hiện).
Forced colors: nút X / cắt dùng `ButtonFace` / `ButtonText` + viền, focus `Highlight`.

## Bảo mật

- `label`, `preview-alt`, `prompt`, `helper-text`, `error-text`, nhãn đều là text.
- `preview-src` qua cổng URL `safeMediaUrl` (chỉ `https:` / `http:` khi trang là `http:` / tương đối); `javascript:`,
  `data:`, `file:` → không có `<img>`. Ảnh có `referrerpolicy="no-referrer"` (CDN chống hotlink phải chấp nhận referer
  rỗng; CSP `img-src` phải cho phép origin ảnh — xem [media picker › CSP](media-picker.md#csp-ảnh-và-referrer)).
- Giá trị form chỉ là `assetId` / alt / crop / focal đã validate định dạng. Server **phải** kiểm id (tồn tại, loại, quyền), cắt
  alt, validate crop + focal — không tin client, không coi crop là quyền.
- Hộp cắt không tạo pixel (không canvas / blob / fetch ảnh) — chỉ cần CSP `img-src` cho origin ảnh, không cần CORS.
- **⚠ Site phải tự xử lý** endpoint biến thể ảnh đã cắt: [checklist bắt buộc](../guides/media-renditions.md#checklist-bắt-buộc).

## Chuyển từ dcms2 `MediaPickerPlaceholder`

| dcms2 | td-media-field |
|---|---|
| Hidden input chứa **URL** ảnh (`hiddenInput.value = imageUrl`) | Gửi **`assetId`**; URL chỉ để xem trước (`preview-src`). Server đổi cột lưu từ URL sang id |
| `onChange(url)` callback | Event `change` (`detail: { value, selection }`) trên host |
| `ratioText` truyền tay ("3:2") | Tự suy từ `aspect-ratio` |
| `freeStyle: true` (khung giữ tỉ lệ, ảnh theo tỉ lệ gốc) | **Bỏ** `aspect-ratio`: rỗng cao `--td-media-field-empty-h`, có ảnh theo tỉ lệ gốc (trần `--td-media-field-max-h`) |
| Nút gỡ (X đỏ góc) chỉ hiện khi rê chuột | 0.79.0 giống dcms2: X tròn đỏ hiện khi rê / Tab vào khung; màn cảm ứng luôn hiện (không phụ thuộc hover). Là `<button>` thật |
| Cả khung là `role="button"` chứa nút khác | Nút mở và X / cắt là nút anh em (không lồng control) |
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
- **`og[crop]` luôn là `"null"`** → chưa có crop từ server và field không `croppable` (hoặc người dùng chưa cắt / cắt toàn
  ảnh — toàn ảnh = `null`).
- **Không thấy nút "Cắt ảnh"** → thiếu `usage`, chưa chọn ảnh, `kind` không phải `image`, hoặc không có nguồn ảnh an toàn
  (không adapter và không `preview-src` hợp lệ).
- **Hộp cắt báo lỗi tỉ lệ** → `urls.preview` / `preview-src` là ảnh đã cắt sẵn; trả ảnh nguyên.
- **Không có `og[focal]`** → thiếu `focal-point` (opt-in) hoặc thiếu `usage`.
- **Form usage không gửi gì** → `name` kết thúc `[]` (ví dụ `og[]`); bỏ `[]`.
- **Ảnh xem trước không hiện** → `preview-src` không phải `https:` / tương đối, hoặc CSP `img-src` / CDN chống hotlink chặn.
- **`required` không chặn submit khi chưa có JS** → giới hạn của hidden input; validate ở server.

## Xem thêm

[Media gallery](media-gallery.md) (nhiều ảnh có thứ tự, 0.43.0) · 
- [Media picker](media-picker.md) · [Cropper](cropper.md) · [Media grid](media-grid.md) · [Form](../guides/forms.md)
- [Adapter PHP › td_media_field](../guides/php-adapter.md#td_media_field-0320) · [Theming](../customization/theming.md) ·
  [Hook](../customization/hooks.md#tdmediapicker)
