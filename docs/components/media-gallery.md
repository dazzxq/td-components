[Tài liệu](../README.md) › [Components](README.md) › Media gallery

# Gallery ảnh — `<td-media-gallery>`

Ô form cho **danh sách ảnh có thứ tự**: gallery sản phẩm, ảnh bài viết, slide. Thêm nhiều ảnh một lần qua
[media picker](media-picker.md) (chế độ nhiều ảnh), gỡ từng ảnh, **sắp lại** bằng kéo / chạm-để-chuyển / bàn phím, alt +
cắt ảnh + điểm trọng tâm **theo từng ảnh** (chỉ toạ độ). Giá trị gửi form là **danh sách `assetId` theo thứ tự** — không
bao giờ là URL. Ảnh đầu là ảnh bìa (quy ước, không có trường riêng).

Chỉ cần **một** ảnh → dùng [Media field](media-field.md). Hiển thị gallery ngoài trang công khai → dùng
[Media grid](media-grid.md) `layout="justified"` ([công thức](#hiển-thị-gallery-ở-trang-công-khai)).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/media-gallery'` (class: `import { TdMediaGallery } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | có |
| Từ phiên bản | 0.43.0 (cần `td.css`; cần một adapter — xem [media picker](media-picker.md#cấu-hình-mặc-định--configuredefaults)). Quyết định: [ADR 0021](../internal/decisions/0021-media-gallery-form-shape.md) |

## Ví dụ nhanh

```html
<form method="post" action="/products/42">
  <td-media-gallery name="gallery" label="Ảnh sản phẩm" usage croppable cover max="10" aspect-ratio="1/1"
                    items='[{"id":"a_9f2c","src":"https://cdn.example.com/t/a_9f2c.jpg","name":"ao-trang.jpg","alt":"Áo thun trắng"},
                            {"id":"a_77b1","src":"https://cdn.example.com/t/a_77b1.jpg","name":"ao-den.jpg"}]'></td-media-gallery>
  <button type="submit">Lưu</button>
</form>

<script type="module">
  import { TdMediaPicker } from '@dazzxq/td-components/media-picker';
  import '@dazzxq/td-components/media-gallery';
  import { mediaAdapter } from '/assets/app/media-adapter.js';   // code của site
  TdMediaPicker.configureDefaults({ adapter: mediaAdapter });
</script>
```

Gửi form: `gallery[0][id]=a_9f2c`, `gallery[0][alt]=Áo thun trắng`, `gallery[0][crop]=null`, `gallery[1][id]=a_77b1`,
`gallery[1][alt]=`, `gallery[1][crop]=null`.

Server PHP in sẵn bằng [`td_media_gallery()`](#render-phía-server-php) — form gửi được cả khi chưa có JS.

## Cách dùng

### 1. Hai dạng gửi form (API công khai, ADR 0021)

| Dạng | Bật bằng | Có ảnh (theo thứ tự hiển thị, i = 0…n−1 liên tục) | Rỗng |
|---|---|---|---|
| **Reference** (mặc định) | — | `name[]=<id>` — mỗi ảnh một mục | đúng **một** mục `name=` (chuỗi rỗng) |
| **Usage** | thuộc tính `usage` | `name[i][id]`, `name[i][alt]`, `name[i][crop]` (+ `name[i][focal]` khi có `focal-point`), đúng thứ tự khoá này | `name=` |

Server đọc **theo kiểu** của giá trị — ba trạng thái, giống [Media field](media-field.md#1-hai-dạng-gửi-form-api-công-khai-chốt-từ-032):

| Request có | Nghĩa | Server làm |
|---|---|---|
| **không có key** `name` | gallery `disabled`, hỏng dữ liệu (fail closed) hoặc đang vượt `max` | **giữ nguyên** những gì đã lưu |
| `name` = chuỗi rỗng | người dùng đã gỡ hết | xoá hết ảnh của chỗ dùng này |
| `name` = mảng | danh sách mới | **thay toàn bộ**, vị trí = thứ tự trong mảng |

- `crop` / `focal` giống từng byte với field: chuỗi JSON v1 (`{"v":1,"x","y","width","height"}` / `{"v":1,"x","y"}`,
  toạ độ 0..1 theo ảnh gốc) **hoặc chuỗi `null`**.
- `name` lồng được (`product[gallery]` → `product[gallery][0][id]`). `name` kết thúc bằng `[]` → **không gửi gì** + cảnh báo
  (gallery tự nối `[]` / `[i]`; fail closed).
- Tối đa **100** ảnh (`TdMediaGallery.MAX_ITEMS`): 100 × 4 mục = 400 biến, dưới `max_input_vars` 1000 mặc định của PHP.

**Laravel:**

```php
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

if ($request->has('gallery')) {                          // không có key = disabled / fail closed / vượt max → giữ nguyên
    $raw = $request->input('gallery');                   // ConvertEmptyStringsToNull: '' → null = đã gỡ hết
    $rows = is_array($raw) ? array_values($raw) : [];
    if (count($rows) > 10) {                             // max CỦA SERVER — không tin max của client
        throw ValidationException::withMessages(['gallery' => 'Tối đa 10 ảnh.']);
    }
    $request->validate([
        'gallery'         => ['nullable', 'array', 'max:10'],
        'gallery.*.id'    => ['required', 'string', 'max:512', 'distinct'],
        'gallery.*.alt'   => ['nullable', 'string', 'max:500'],
        'gallery.*.crop'  => ['nullable', 'string', 'max:512'],
        'gallery.*.focal' => ['nullable', 'string', 'max:128'],
    ]);
    $ids = array_column($rows, 'id');
    // MỘT truy vấn: mọi id tồn tại, đúng loại, người dùng có quyền — so số lượng
    $ok = Media::whereIn('id', $ids)->where('kind', 'image')->where('status', 'ready')
        ->where('owner_id', $request->user()->id)->count();
    if ($ok !== count($ids)) {
        throw ValidationException::withMessages(['gallery' => 'Có ảnh không hợp lệ.']);
    }
    DB::transaction(function () use ($product, $rows) {
        $product->mediaUsages()->where('role', 'gallery')->delete();
        foreach ($rows as $pos => $row) {
            $product->mediaUsages()->create([
                'asset_id' => $row['id'], 'role' => 'gallery', 'position' => $pos,
                'alt_text' => mb_substr(trim((string) ($row['alt'] ?? '')), 0, 500),
                'crop_json' => parse_crop($row['crop'] ?? 'null'),     // cùng hàm kiểm của media field (null khi sai)
                'focal_point_json' => parse_focal($row['focal'] ?? 'null'),
            ]);
        }
    });
}
```

Dạng reference (`images[]`): `'images' => ['nullable', 'array', 'max:10']`, `'images.*' => ['string', 'max:512', 'distinct']`.

**PHP thuần:**

```php
if (array_key_exists('gallery', $_POST)) {               // không có key → giữ nguyên
    $raw = $_POST['gallery'];
    $rows = is_array($raw) ? array_values($raw) : [];    // '' (chuỗi) = gỡ hết → []
    if (count($rows) > 10) { /* lỗi: vượt max của server */ }
    $ids = [];
    foreach ($rows as $r) {
        $id = is_array($r) && is_string($r['id'] ?? null) ? $r['id'] : '';   // reference: is_string($r) ? $r : ''
        if ($id === '' || strlen($id) > 512 || isset($ids[$id])) { /* lỗi: id sai / trùng */ }
        $ids[$id] = true;
    }
    // SELECT COUNT(*) FROM media WHERE id IN (…) AND kind = 'image' AND owner_id = ? → phải bằng count($ids)
    // rồi trong MỘT transaction: DELETE usages role=gallery của bản ghi này; INSERT lại theo $pos
}
```

### 2. Thêm ảnh

Nút **Thêm ảnh** nằm dưới lưới (gallery rỗng: khung lớn "Chọn ảnh" + tỉ lệ). Bấm → `TdMediaPicker.open()` với:

```js
{ selection: { mode: 'multiple', initialIds: [], maxItems: max - count, kinds }, crop: { enabled: false },
  title: label, themeRoot: gallery }
```

- Ảnh chọn được **nối cuối** theo thứ tự người dùng chọn trong picker. Alt ban đầu = `usage.altText` → `asset.defaultAltText`;
  crop / focal = `null` (picker chỉ cắt ở chế độ một ảnh — cắt từng ảnh sau bằng nút **Cắt**).
- Ảnh **đã có** trong gallery bị bỏ qua và đọc "Bỏ qua {n} ảnh đã có" (một asset không xuất hiện hai lần). Picker trả thừa
  (adapter bỏ qua `maxItems`) → chỉ lấy phần vừa đủ, phần còn lại đọc "Bỏ qua {n} ảnh vượt quá giới hạn".
- Đây là chế độ **thêm**, không phải "sửa cả tập": bỏ chọn trong picker không xoá ảnh của gallery, và không có N lời gọi
  `adapter.get` lúc mở.
- Đủ `max` → nút Thêm ẩn, dòng đếm "Đã đủ {max} ảnh"; focus chuyển sang tay nắm của ảnh mới đầu tiên.
- Mỗi lần thêm: `input` + `change` (`reason: 'add'`) và vùng thông báo đọc "Đã thêm {n} ảnh. {count}/{max} ảnh."
- Không có adapter ở đâu cả → một cảnh báo console, không mở gì. Resolve adapter giống field: `pickerOptions.adapter` >
  `gallery.adapter` > `TdMediaPicker.configureDefaults()`; `selection` / `crop` luôn do gallery đặt.

### 3. Gỡ ảnh

Nút thùng rác trên từng ô (`aria-label="Gỡ Ảnh 2 trên 5: ao-den.jpg"`). Không hỏi xác nhận (chưa lưu tới khi gửi form).
`input` + `change` (`reason: 'remove'`), đọc "Đã gỡ {name}. Còn {count} ảnh.". Focus sang nút Gỡ của ô **kế tiếp** →
ô trước → nút Thêm.

### 4. Sắp lại thứ tự

Dùng chung bộ điều khiển với [`td-sortable`](sortable.md):

- **Kéo** tay nắm (góc trên của ảnh) bằng chuột / ngón tay — DOM không đổi khi đang kéo, thả = một lần di chuyển.
- **Chạm-để-chuyển** (WCAG 2.5.7): chạm tay nắm ô A rồi chạm tay nắm ô B → A về chỗ B.
- **Bàn phím:** Tab tới tay nắm → Space / Enter nhấc → mũi tên di chuyển **theo lưới** (↑ ↓ đi một hàng), Home / End →
  Space / Enter thả, Escape huỷ.
- `change` (`reason: 'reorder'`) phát **đúng một lần khi thả**, không phát khi đang nhấc. FormData đi theo thứ tự mới
  ngay lập tức.
- Thân ô (ảnh) cuộn trang bình thường trên điện thoại — chỉ tay nắm có `touch-action: none`.

### 5. Ảnh bìa — `cover`

Ảnh bìa **luôn là ảnh đầu** (quy ước dsuite / dwp — không có cờ `is_cover`, server lấy `[0]`). Thuộc tính `cover` chỉ
**hiển thị**: badge "Ảnh bìa" trên ô đầu + ", ảnh bìa" trong tên đọc. Đặt một ảnh làm bìa = đưa nó lên đầu (nhấc + Home,
hoặc chạm-để-chuyển vào ô đầu).

### 6. Alt (chế độ `usage`)

Mỗi ô có ô nhập alt (placeholder "Mô tả (alt)", nhãn cho trình đọc màn hình "Mô tả ảnh {n} (alt)", tối đa 500 ký tự).
Ô hẹp nên nhãn nhìn thấy chỉ là placeholder — đánh đổi có chủ đích. `input` mỗi lần gõ, `change` khi rời ô
(`reason: 'alt'`); event native của ô nhập bị chặn tại host (không trùng).

### 7. Cắt ảnh / điểm trọng tâm theo từng ảnh — `croppable`, `focal-point`

Cần `usage` (thiếu → bỏ + một cảnh báo). Nút **Cắt** trên ô ảnh (không có cho video / file) mở
[hộp cắt dùng chung](cropper.md) cho **đúng ảnh đó**:

- Nguồn ảnh theo đúng thứ tự fail-closed của [Media field](media-field.md#nguồn-ảnh-cho-hộp-cắt): có adapter →
  `adapter.get(id)` (nút `aria-busy` trong lúc chờ) → `urls.preview` + `width` / `height`; không adapter → `src` của item
  (chỉ khi do server / code đặt, không phải do adapter tạo).
- `crop-ratio` là **một** tỉ lệ cho cả gallery: vắng → `aspect-ratio` → tự do.
- "Áp dụng" có đổi → `input` + `change` (`reason: 'crop'`). Huỷ / không đổi → giữ chuỗi gốc **đúng từng byte**.
- Ô ảnh xem trước đúng vùng cắt khi tỉ lệ vùng cắt khớp tỉ lệ ô (± 2 %), như field.
- **Một luồng cắt mỗi gallery.** Luồng bị huỷ im lặng (không mở hộp / không áp kết quả) khi ảnh đó bị gỡ, id đổi
  (`value =`, `setSelection`, reset, khôi phục form), adapter / context đổi, gallery rời trang hoặc bị `disabled`. Sắp lại
  trong lúc chờ **không** huỷ: kết quả áp vào **đúng ảnh** đã bấm, không theo vị trí.

### 8. `min`, `max`, `required`, vượt `max`

- `max`: số nguyên 1…100 (lớn hơn → 100; vắng / sai → 100). `min` kẹp ≤ `max`; `required` ≡ `min ≥ 1`.
- Thiếu: rỗng → `valueMissing` ("Vui lòng chọn ảnh."), còn lại `rangeUnderflow` ("Cần ít nhất {min} ảnh."). Lỗi gắn vào
  nút Thêm; hợp đồng lỗi chung (`setError()`, `error-text`).
- **Vượt `max`** (server in ra nhiều hơn `max`, hoặc site hạ `max` lúc chạy): mọi ảnh vẫn **hiện và giữ** (không mất
  dữ liệu), người dùng gỡ bớt được, nút Thêm ẩn, dòng đếm đỏ "Vượt giới hạn: {count}/{max} ảnh", validity `rangeOverflow` ("Tối đa {max} ảnh."), và **không gửi mục
  FormData nào** — server thấy "không có key" nên giữ nguyên. Lý do: `novalidate` / `form.submit()` bỏ qua validity, nên
  hợp đồng phải an toàn ngay ở tầng dữ liệu. Gỡ về ≤ `max` → FormData bật lại ngay.

### 9. Dữ liệu hỏng → fail closed (không bao giờ thành "xoá hết")

Attribute `items` sai JSON / quá 256 KiB / quá 100 ảnh / item thiếu `id`, id trùng, id không phải chuỗi hoặc dài quá 512
ký tự, hoặc `name` kết thúc `[]` → gallery hiện "Không đọc được danh sách ảnh", khoá thao tác, **không gửi mục nào** +
một cảnh báo console (không in giá trị). Coi dữ liệu hỏng là rỗng rồi gửi `name=` sẽ âm thầm xoá gallery thật — nên kit
không làm vậy. Trường lẻ thì **cắt / bỏ**, không từ chối: alt > 500 ký tự bị cắt, crop / focal sai → `null`, `src` không an
toàn → bỏ ảnh xem trước (giữ item), `kind` lạ → `image`.

### 10. Đặt giá trị từ code

```js
const g = document.querySelector('td-media-gallery');
g.value;                       // ['a_9f2c', 'a_77b1'] (bản sao)
g.value = ['a_77b1', 'x_1'];   // im lặng; id còn giữ alt / crop / ảnh; id mới lấy ảnh xem trước bằng adapter.get
g.setSelection([{ assetId: 'a_1', asset, usage: { altText: 'Áo', crop: { normalized: { x: 0, y: 0, width: 1, height: 0.5 } } } }]);
g.setSelection(null);          // rỗng
g.selection;                   // [{ assetId, asset, usage: { altText, crop, focalPoint } }] theo thứ tự
```

Mọi lối vào đi qua **một** hàm kiểm (`validateItems`): `value =` / `setSelection()` không hợp lệ (trùng, id sai, vượt `max`,
không phải mảng) → **từ chối, không đổi gì**, một cảnh báo console, không event. API không bao giờ tự tạo trạng thái vượt
`max`. Khôi phục form (bfcache / autofill) chỉ mang id / alt / crop / focal — **không** URL; ảnh xem trước lấy lại bằng
`adapter.get` (tối đa 4 request song song, huỷ khi adapter đổi hoặc gallery rời trang; item có `src` từ server thì **không**
gọi lúc tải).

### 11. Lưu thứ tự ngay (không chờ submit) — kiểu dsuite `PUT …/media-order`

```js
gallery.addEventListener('change', async (e) => {
  if (e.detail.reason !== 'reorder') return;
  const res = await fetch(`/api/products/${id}/media-order`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify({ role: 'gallery', ids: e.detail.value }),
  });
  if (!res.ok) TdToast.error('Không lưu được thứ tự ảnh.');
});
```

Server làm như submit: kiểm `distinct`, mọi id thuộc bản ghi + có quyền, ghi lại `position` trong một transaction.

### Hiển thị gallery ở trang công khai

Field là để **soạn**. Trang công khai dùng [Media grid](media-grid.md#9-lưới-justified--layoutjustified-0330) justified
với URL ảnh đã ký theo crop đã lưu ([checklist renditions](../guides/media-renditions.md)):

```php
<td-media-grid label="Ảnh sản phẩm" layout="justified">
<?php foreach ($product->gallery as $u): ?>
  <div data-td-media-item data-td-ar="<?= $u->width ?>/<?= $u->height ?>">
    <img src="<?= e(signed_rendition_url($u, 'w800')) ?>" alt="<?= e($u->alt_text) ?>" loading="lazy">
  </div>
<?php endforeach ?>
</td-media-grid>
```

### Render phía server (PHP)

```php
echo td_media_gallery('gallery', $product->galleryItems(), [
    'label' => 'Ảnh sản phẩm', 'usage' => true, 'croppable' => true, 'cover' => true, 'max' => 10, 'aspect_ratio' => '1/1',
]);
// $items: [['id' => 'a_9f2c', 'src' => $thumbUrl, 'name' => 'ao.jpg', 'alt' => '…', 'crop' => [...] | '{"v":1,…}' | null], …]
```

In host `<td-media-gallery data-td-ssr="media-gallery@1">` + đúng cây `render()` + hidden input gửi đúng FormData ở
trên khi **chưa có JS** (thứ tự = thứ tự server in; alt sửa được vì là ô nhập thật). Tay nắm / Cắt / Gỡ / Thêm ẩn
(`visibility: hidden`, giữ chỗ) tới khi module chạy. Có JS → nhận **tại chỗ** (cùng node, không xô lệch, FormData giống
từng byte). Chi tiết option: [PHP adapter › td_media_gallery](../guides/php-adapter.md#td_media_gallery-0430).

## Responsive & cảm ứng

- Host là container `td-media-gallery` (ADR 0014); lưới cố định `repeat(auto-fill, minmax(--td-media-gallery-tile-min, 1fr))`
  — **không justified** (hàng đổi chiều cao khi sắp lại sẽ làm ô đích nhảy dưới ngón tay). Mặc định `8rem`: 2 cột ở
  320–430 px, 4+ cột từ 768 px. Container < 360 px: khe nhỏ hơn.
- Nút trên ô ≥ 44 × 44 px khi `pointer: coarse`; hàng nút nằm **dưới** ảnh (không che ảnh). Tay nắm trên nền đặc.
- Hover chỉ trong `(hover: hover) and (pointer: fine)`; trạng thái nhấn chỉ đổi màu (ADR 0019).

## Attribute

| Attribute | Giá trị | Mặc định | Ghi chú |
|---|---|---|---|
| `name` | chuỗi | — | Không có → không gửi. Kết thúc `[]` → fail closed |
| `label` | chuỗi | — | Nhãn (có `*` khi `required`) |
| `items` | JSON | — | `[{"id","src"?,"name"?,"kind"?,"alt"?,"crop"?,"focal"?}]` — giá trị mặc định / reset. `crop` / `focal` là **chuỗi** JSON v1. Đổi sau khi nâng cấp = đặt lại danh sách |
| `usage` | boolean | — | Dạng usage + ô alt |
| `croppable` | boolean | — | (cần `usage`) nút Cắt từng ảnh |
| `crop-ratio` | `W/H` · `W:H` · số · `free` | `aspect-ratio`, rồi tự do | Một tỉ lệ cho cả gallery, [0.01, 100] |
| `focal-point` | boolean | — | (cần `usage`) gửi `name[i][focal]` + chọn trong hộp cắt |
| `cover` | boolean | — | Badge "Ảnh bìa" trên ô đầu |
| `aspect-ratio` | `W/H` · `W:H` · số | `1:1` | Tỉ lệ ô |
| `preview-fit` | `cover` · `contain` | `cover` | |
| `accept-kind` | `image` · `video` · `file` (danh sách) | `image` | `kinds` của picker; loại đầu quyết định chữ |
| `min` | số nguyên ≥ 0 | 0 | Kẹp ≤ `max` |
| `max` | 1…100 | 100 | |
| `required` | boolean | — | ≡ `min ≥ 1` |
| `disabled` | boolean | — | Cũng theo `<fieldset disabled>`; không gửi gì |
| `prompt` | chuỗi | "Chọn ảnh" | Chữ khung rỗng |
| `helper-text` / `error-text` | chuỗi | — | Ghi chú / lỗi (hợp đồng lỗi chung) |

## Property & method

| Tên | Kiểu | Ghi chú |
|---|---|---|
| `value` | `string[]` | Đọc: bản sao các id theo thứ tự. Gán: im lặng, qua `validateItems` (sai → từ chối) |
| `selection` | `SelectedMedia[]` (chỉ đọc) | `{ assetId, asset, usage: { altText, crop, focalPoint } }` |
| `setSelection(arr \| null)` | method | Im lặng, qua `validateItems` |
| `adapter` | `MediaPickerAdapter \| null` | Adapter riêng của gallery |
| `pickerOptions` | `object \| null` | Option trộn lên `TdMediaPicker.configureDefaults()` khi mở (trừ `selection` / `crop`) |
| `setError(msg)` / `clearError()` | method | Hợp đồng lỗi chung |
| `TdMediaGallery.MAX_ITEMS` | `100` | Trần cứng |
| `TdMediaGallery.LAZY_CONCURRENCY` | `4` | `adapter.get` song song tối đa |

## Event

| Event | `detail` | Khi |
|---|---|---|
| `input` | `{ value, selection, reason }` | Thêm / gỡ / thả sau khi sắp / mỗi lần gõ alt / áp cắt |
| `change` | `{ value, selection, reason }` | Như trên; alt: khi rời ô |

`reason`: `'add'` · `'remove'` · `'reorder'` · `'alt'` · `'crop'`. Gán `value`, `setSelection()`, reset form, khôi phục,
đổi `items` **không** phát event. Không có `order-change` (dùng `change` + `detail.value`).

## Nhãn — `TdMediaGallery.labels`

Tiếng Việt, ghi đè được theo site (`TdMediaGallery.labels.add.image = 'Add photos'`). Trang SSR có nhãn khác nhãn của
PHP (`Td::MEDIA_GALLERY_LABELS`) được render lại an toàn (không nhận tại chỗ). Khoá: `prompt.{kind}`, `add.{kind}`,
`kinds.{kind}`, `countMax` (vắng `max` → 100), `full`, `over`, `item`, `coverSuffix`, `cover`, `handle`, `remove`, `crop`, `alt`,
`altPlaceholder`, `noPreview`, `video`, `broken`, `sortHelp`, `added`, `skipped`, `tooMany`, `removed`, `required`,
`min`, `max`, `cropTitle`, `cropError`. Thông báo khi nhấc / di chuyển / thả dùng `TdSortable.labels`.

## Tuỳ biến giao diện

| Token | Mặc định | |
|---|---|---|
| `--td-media-gallery-tile-min` | `8rem` | Bề rộng tối thiểu một ô (số cột tự tính) |
| `--td-media-gallery-gap` | `var(--td-space-xs)` | Khe lưới |
| `--td-media-gallery-empty-h` | `8rem` | Chiều cao khung "Chọn ảnh" khi rỗng |

Màu chỉ lấy từ token ngữ nghĩa (`--td-color-surface`, `-surface-muted`, `-text`, `-text-muted`, `-border`, `-hover`,
`-pressed`) — palette sinh bằng `td-theme` đọc được ([Theming](../customization/theming.md)).

## Cấu trúc DOM & class

```html
<td-media-gallery class="td-media-gallery" name="g" label="Ảnh" usage croppable cover items="[…]">
  <div class="td-media-gallery__head">
    <span class="td-media-gallery__label" id="{id}-label">Ảnh</span>
    <span class="td-media-gallery__count" id="{id}-count">2/10 ảnh</span>
  </div>
  <ul class="td-media-gallery__list" role="list" aria-labelledby="{id}-label" aria-describedby="{id}-count">
    <li class="td-media-gallery__item" data-kind="image">
      <div class="td-media-gallery__media">
        <svg class="td-media-gallery__sizer" viewBox="0 0 1 1" aria-hidden="true" focusable="false"></svg>
        <img class="td-media-gallery__img" src="…" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
        <span class="td-media-gallery__cover">Ảnh bìa</span>
        <button type="button" class="td-sortable__handle td-media-gallery__handle" aria-label="Sắp xếp Ảnh 1 trên 2: …"
                aria-describedby="{id}-sort-help">…grip…</button>
      </div>
      <div class="td-media-gallery__bar">
        <button type="button" class="td-media-gallery__btn td-media-gallery__crop-btn" aria-haspopup="dialog" aria-label="Cắt …">…</button>
        <button type="button" class="td-media-gallery__btn td-media-gallery__remove" aria-label="Gỡ …">…</button>
      </div>
      <label class="td-media-gallery__alt-field"><span class="td-sr-only">Mô tả ảnh 1 (alt)</span>
        <input type="text" class="td-field__control td-media-gallery__alt" maxlength="500" placeholder="Mô tả (alt)"></label>
    </li>
  </ul>
  <button type="button" class="td-media-gallery__add" data-state="filled" aria-haspopup="dialog">…Thêm ảnh</button>
  <span class="td-sr-only td-media-gallery__status" role="status"></span>
  <span class="td-sr-only td-media-gallery__sort-status" role="status"></span>
  <span class="td-media-gallery__sort-help" id="{id}-sort-help" hidden>…</span>
</td-media-gallery>
```

Trạng thái: `data-kind` trên ô, `data-state` / `hidden` / `aria-invalid` / `:disabled` trên nút Thêm,
`data-td-dragging` (lưới) + `data-td-sort-state` (ô) khi sắp. Video có `span.td-media-gallery__badge`; file / không có
ảnh có `span.td-media-gallery__file` > `span.td-media-gallery__name`. Hỏng: `span.td-media-gallery__broken` thay cho
lưới + nút Thêm.

## Bàn phím & trợ năng

- Thứ tự Tab: tay nắm → Cắt → Gỡ → alt của ô 1 → … → Thêm. Mũi tên chỉ tác dụng trên tay nắm đang nhấc — không cướp
  phím của ô alt.
- Lưới là `ul[role=list]` có tên (nhãn) + mô tả (dòng đếm). Tên đọc của mỗi nút có vị trí: "Gỡ Ảnh 2 trên 5: tên ảnh"
  (tên = tên file → alt → id), cập nhật sau mỗi lần sắp.
- Hai vùng thông báo không nói chồng: của gallery (thêm / gỡ / bỏ qua / lỗi) và của bộ sắp xếp (nhấc / di chuyển / thả).
- `img alt=""` (tên nằm ở các nút + nhãn).

## Bảo mật

- Giá trị form chỉ là `assetId` / alt / crop / focal đã kiểm định dạng. URL chỉ để hiển thị (`safeMediaUrl` /
  `td__media_url`, `referrerpolicy="no-referrer"`).
- Mọi chuỗi đi qua `textContent` / attribute đã escape; PHP qua `Td::e`. Không `style=""` (vùng cắt / vị trí khi kéo là
  CSSOM).
- Trần cứng: 100 ảnh, `items` ≤ 256 KiB, id ≤ 512, alt 500, crop 512, focal 128, 4 `adapter.get` song song.
- Console không bao giờ in giá trị hay lỗi gốc của adapter (chỉ mã lỗi).
- **Server phải:** kiểm `count ≤ max` **của server**, `distinct`, mọi id tồn tại / đúng loại / người dùng có quyền
  (**một** `whereIn`, so số lượng), cắt alt, kiểm crop / focal (cùng code với field), ghi theo vị trí trong transaction.
  Crop chỉ là gợi ý → render bằng URL ký. Không coi `[0]` là quyền gì cả. Không có key = giữ nguyên.

## Lưu ý & lỗi thường gặp

| Triệu chứng | Nguyên nhân | Sửa |
|---|---|---|
| Lưu xong gallery mất hết ảnh | Server coi "không có key" là rỗng | Chỉ xoá khi `name` là chuỗi rỗng; không có key = giữ nguyên |
| Server nhận mảng có phần tử rỗng | `name` kết thúc `[]` (gallery không gửi gì) hoặc tự in `name[]=` | Đặt `name="gallery"`, gallery tự nối `[]` / `[i]` |
| "Không đọc được danh sách ảnh" | `items` trùng id / sai JSON / id là số | Server in id dạng chuỗi (PHP `td_media_gallery` tự đổi int → chuỗi) |
| Form gửi không có ảnh dù đang hiện | Đang vượt `max` | Gỡ bớt về ≤ `max`, hoặc tăng `max` |
| Nút Thêm không mở picker | Chưa có adapter | `TdMediaPicker.configureDefaults({ adapter })` hoặc `gallery.adapter = …` |
| Chọn lại ảnh cũ bị "bỏ qua" | Một asset chỉ một lần trong gallery | Có chủ đích (server `distinct`) |

## Xem thêm

[Media field](media-field.md) · [Media picker](media-picker.md) · [Cropper](cropper.md) · [Sortable](sortable.md) ·
[Media grid](media-grid.md) · [PHP adapter](../guides/php-adapter.md#td_media_gallery-0430) ·
[Media renditions](../guides/media-renditions.md) · [ADR 0021](../internal/decisions/0021-media-gallery-form-shape.md)
