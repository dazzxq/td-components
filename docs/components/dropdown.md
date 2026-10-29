[Tài liệu](../README.md) › [Components](README.md) › Dropdown

# Dropdown — `<td-dropdown>`

Ô chọn **một** giá trị từ danh sách (thay `<select>`), có ô tìm kiếm trong menu, điều khiển bằng bàn phím theo mẫu
APG "select-only combobox", tự đặt vị trí menu và gửi giá trị trong `<form>` như control gốc. Dùng khi người dùng chọn
đúng 1 mục trong danh sách biết trước (tỉnh/thành, trạng thái, danh mục…).

Không dùng khi: cần chọn **nhiều** mục hoặc gợi ý lấy từ server theo từ khoá → dùng [`<td-chip-input>`](chip-input.md);
cần một menu hành động (Sửa / Xoá…) chứ không phải một giá trị form → dùng [TdMenu](menu.md).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/dropdown'` (class: `import { TdDropdown } from '@dazzxq/td-components/dropdown'`) |
| Loại | Custom element |
| Form-associated | có (`ElementInternals`) |
| Từ phiên bản | 0.1.0 (token-native + APG combobox từ 0.9.0) |

## Ví dụ nhanh

```html
<link rel="stylesheet" href="/node_modules/@dazzxq/td-components/td.css">

<form id="f">
  <td-dropdown id="city" name="city" label="Thành phố" required placeholder="Chọn thành phố"></td-dropdown>
  <button type="submit">Lưu</button>
</form>
```

```js
import '@dazzxq/td-components/dropdown';

const dd = document.getElementById('city');
dd.options = [
  { value: 'hn', label: 'Hà Nội' },
  { value: 'sg', label: 'Sài Gòn' },
  { value: 'dn', label: 'Đà Nẵng' },
];
dd.addEventListener('change', (e) => {
  console.log(e.detail.value, e.detail.item); // 'hn', { value: 'hn', label: 'Hà Nội' }
});
```

Danh sách lựa chọn gán bằng JS (property `options` hoặc `updateData()`), **hoặc** (từ 0.17.0) đặt một `<select>`
native làm con trực tiếp — component đọc nó khi gắn vào trang (xem [mục 9](#9-nâng-cấp-từ-select-native-ssr--không-js)).
Gán `options` (và `onChange` / `onSelect`) **trước** khi script component được nạp cũng được: giá trị được nhận khi
phần tử nâng cấp.

## Cách dùng

### 1. Định dạng dữ liệu `options`

`options` là một mảng **object**. Mặc định component đọc key `value` (giá trị gửi đi) và `label` (chữ hiển thị). Các key
khác được giữ nguyên và trả lại cho bạn trong `e.detail.item` / `getSelectedItem()`.

```js
dd.options = [
  { value: 1, label: 'Bản nháp', color: 'gray' },
  { value: 2, label: 'Đã đăng', color: 'green' },
];
```

- So khớp giá trị luôn theo chuỗi: `String(item.value) === String(v)`. Vì vậy `setValue('1')` và `setValue(1)` chọn
  cùng một mục.
- Giá trị gửi lên form là `String(value)`.
- Mảng không hợp lệ (không phải array) được coi là `[]`.
- `disabled: true` (từ 0.17.0; đúng giá trị boolean `true`) → option vẫn hiện (mờ, `aria-disabled="true"`) nhưng
  người dùng **không chọn được** bằng chuột/phím, và bị bỏ qua khi di chuyển bằng ↑↓ / Home / End / PageUp / PageDown /
  type-ahead / tìm kiếm. `setValue()` vẫn chọn được nó (như `<select>` native).
- `swatch` (từ 0.82.0, tuỳ chọn): một **màu CSS** → chấm tròn 12px trước nhãn, ở dòng trong menu và ở trigger khi
  option đó đang được chọn (placeholder không có chấm). Cùng cổng với `swatch` của
  [`td-choice-group`](choice-group.md): hex `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa`, `rgb()` / `hsl()`, tên màu, tối đa
  64 ký tự; giá trị khác (`url(…)`, `var(…)`, có `;`…) → **không có chấm**, không báo lỗi. Màu chỉ vào thuộc tính `fill`
  của SVG (không `style`, hợp CSP). Chấm là trang trí (`aria-hidden`): **nhãn phải nói tên màu** ("Đỏ", "Titan đen"), vì
  tên truy cập của option và trigger chỉ là nhãn.
- Từ 0.84.0: icon, dòng mô tả, trạng thái, chữ phụ, từ khoá tìm kiếm và nhóm có tiêu đề, xem
  [mục 1b](#1b-dòng-giàu-thông-tin-và-nhóm-084-0).
- Không hỗ trợ: HTML trong label, chọn nhiều.

```js
dd.options = [
  { value: 'red', label: 'Đỏ', swatch: '#ff0000' },
  { value: 'blue', label: 'Xanh dương', swatch: 'rgb(0, 0, 255)' },
  { value: 'none', label: 'Không màu' }, // không swatch → không chấm
];
```

```js
dd.options = [
  { value: 'hn', label: 'Hà Nội' },
  { value: 'sg', label: 'Sài Gòn', disabled: true }, // hết hàng: thấy nhưng không chọn được
];
```

### 1b. Dòng giàu thông tin và nhóm (0.84.0)

Mọi trường dưới đây đều **tuỳ chọn**. Option không dùng trường nào thì ra DOM và hành vi y như 0.83.0. Tên trường cố
định: chúng **không** đổi theo `value-key` / `label-key`.

| Trường | Kiểu | Hiển thị |
|---|---|---|
| `icon` | string | Tên icon trong registry của kit (core, hoặc icon site đã `registerIcons`), vẽ trong ô vuông bo tròn đầu dòng. Tên không có trong registry → không vẽ ô, `console.warn` một lần cho mỗi tên. Không bao giờ nhận SVG / HTML. |
| `iconTone` | `neutral` \| `accent` \| `success` \| `warning` \| `danger` \| `info` | Màu ô icon, lấy theo token của `td-badge`. Giá trị khác → `neutral`. |
| `description` | string | Dòng thứ hai, chữ nhỏ màu phụ, một dòng, dài thì cắt `…`. |
| `status` | `{ tone, text }` | Chấm màu (theo `tone`, như `iconTone`) + chữ ngắn, ở cuối dòng mô tả. Mô tả dài bị cắt trước, trạng thái luôn còn. |
| `meta` | string | Chữ phụ căn phải của dòng (vd "Đã thêm"), hay đi cùng `disabled: true`. |
| `keywords` | string \| string[] | Chỉ dùng để tìm, không hiển thị. |
| `group` | string | Khoá nhóm, chỉ có tác dụng khi đã gán property `groups`. |

```js
dd.groups = [
  { key: 'public', label: 'Đang hiện' },
  { key: 'hidden', label: 'Đang tắt' },
];
dd.options = [
  { value: 'a', label: 'Tặng ốp lưng', group: 'public', icon: 'gift', iconTone: 'danger',
    description: 'Quà tặng', status: { tone: 'success', text: 'Đang hiện' }, keywords: ['qua', 'op lung'] },
  { value: 'b', label: 'Trả góp 0%', group: 'public', icon: 'credit-card', iconTone: 'info',
    description: 'Trả góp', disabled: true, meta: 'Đã thêm' },
  { value: 'c', label: 'Giảm 5%', group: 'hidden' },
  { value: 'd', label: 'Khác' }, // không group → nhóm cuối, không tiêu đề
];
```

- **Nhóm:** `groups` (chỉ property, gán được trước khi component được định nghĩa) quyết định **thứ tự và tiêu đề**.
  - Trong một nhóm, option giữ thứ tự của mảng.
  - Option có `group` lạ hoặc không có `group` → xếp cuối, không tiêu đề.
  - Khi chưa có `groups`, `group` bị bỏ qua (danh sách phẳng như cũ).
  - Nhóm không còn option nào (vd sau khi lọc) thì ẩn cả tiêu đề.
  - Tiêu đề không chọn được, và ↑↓ / Home / End / PageUp / PageDown / type-ahead bỏ qua nó.
  - `getSelectedItem()` và `options` vẫn là mảng gốc của bạn.
- **Tìm kiếm:** mặc định tìm trên `label`, `description` và `keywords` (không dấu, không phân biệt hoa thường).
  - `search-fields="label"` trở lại hành vi trước 0.84.0. Nhận một danh sách con của `label description keywords`, cách nhau bởi dấu cách hoặc dấu phẩy.
  - Trình đọc màn hình nghe số kết quả khi đang gõ ("12 kết quả", từ `TdDropdown.labels.resultCount`). Câu này ẩn với mắt; "Không tìm thấy kết quả" vẫn hiện như cũ.
- **Trigger:** option đã chọn có `icon` thì trigger hiện icon (màu chữ, không ô nền) + nhãn, không có mô tả.
  - `trigger-icon="none"` để trigger chỉ có chữ.
  - Ở chế độ chọn giá trị, các giá trị `trigger-icon` khác bị bỏ qua. Ở chế độ "chọn để thêm" chúng là tên icon cố định ([mục 11](#11-chế-độ-chọn-để-thêm-modeaction-0850)).
- **`max-height`** vẫn là **số dòng**. Khi có dòng giàu thông tin hoặc nhóm, chiều cao được đo thật: đúng N dòng option nhìn thấy, tính từ trên xuống, tiêu đề nhóm cộng thêm chiều cao nhưng không tính là một dòng. PageUp / PageDown nhảy N dòng.
- **Trợ năng:**
  - Tên của option chỉ là nhãn (`aria-labelledby`). Mô tả, trạng thái và chữ phụ được đọc như phần mô tả (`aria-describedby`).
  - Nhóm là `role="group"`, tên là tiêu đề nhóm.
  - Ô icon và chấm trạng thái là `aria-hidden`.
  - Màu của trạng thái chỉ để trang trí: chữ `text` phải tự nói đủ nghĩa.

PHP (`td_dropdown`, in `<optgroup>` và `data-*` cho bản nâng cấp đọc lại):

```php
<?= td_dropdown('warehouse', [
    ['label' => 'Kho hàng', 'options' => [
        ['value' => 'hn', 'label' => 'Kho Hà Nội', 'icon' => 'archive', 'icon_tone' => 'success',
         'description' => 'Cầu Giấy', 'status' => ['text' => 'Đang mở', 'tone' => 'success'], 'meta' => '128 SP',
         'keywords' => ['ha noi', 'mien bac']],
    ]],
    ['value' => 'other', 'label' => 'Khác'], // ngoài nhóm → xếp cuối
], 'hn', ['element' => true, 'label' => 'Nơi xuất']) ?>
```

Mỗi trường chỉ được in khi hợp lệ: tên icon đúng mẫu, tone thuộc danh sách (và chỉ khi có icon), chữ không rỗng. Mọi giá
trị đều escape.

### 2. Dữ liệu từ API có key khác (`value-key` / `label-key`)

```html
<td-dropdown id="author" name="author_id" label="Tác giả" value-key="id" label-key="name"></td-dropdown>
```

```js
const res = await fetch('/api/authors');
document.getElementById('author').options = await res.json(); // [{ id: 7, name: 'Nguyễn A' }, …]
```

### 3. Giá trị ban đầu (kể cả khi options đến sau)

Đặt attribute `value`. Nếu options chưa có, component **nhớ** giá trị đó và tự chọn khi options tới:

```html
<td-dropdown id="status" name="status" label="Trạng thái" value="2"></td-dropdown>
```

```js
// Tải options bất đồng bộ — "2" vẫn được chọn khi dữ liệu về.
document.getElementById('status').options = await loadStatuses();
```

Tương tự, `setValue(v)` gọi trước khi có options sẽ được giữ lại (pending) và áp dụng khi `options` được gán hoặc
`updateData()` được gọi — trừ `''`: không có option giá trị rỗng thì `''` nghĩa là bỏ chọn ngay, không pending.

Attribute `value` chỉ là **lựa chọn ban đầu**: nó được áp ở lần gán `options` đầu tiên (danh sách đầu rỗng, ví dụ đang
tải, thì chờ danh sách sau). Gán lại `options` về sau **giữ** lựa chọn hiện tại của người dùng nếu giá trị đó vẫn có trong
danh sách mới, không kéo về `value`.

Render phía server (PHP) — cách đơn giản nhất là `td_dropdown()` của [adapter PHP](../guides/php-adapter.md#td_dropdown):
in `<td-dropdown>` bọc `<select>` native (chạy khi chưa có JS, được nâng cấp khi module nạp — xem
[mục 9](#9-nâng-cấp-từ-select-native-ssr--không-js)). Nếu danh sách lớn/động, in `value` và nạp options bằng JS:

```php
<td-dropdown id="category" name="category_id" label="Danh mục"
             value="<?= htmlspecialchars((string) $post['category_id'], ENT_QUOTES) ?>"></td-dropdown>
<script type="module">
  import '@dazzxq/td-components/dropdown'; // cần import map hoặc bundler — xem getting-started/installation.md
  document.getElementById('category').options = <?= json_encode($categories, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
</script>
```

### 4. Tắt tìm kiếm / tắt lựa chọn "Không chọn"

`searchable` và `allow-clear` **mặc định BẬT**. Chỉ tắt được bằng giá trị `"false"`, `"0"` hoặc `"off"` (không phân
biệt hoa thường), hoặc gán property `false`:

```html
<td-dropdown label="Giới tính" searchable="false" allow-clear="false"></td-dropdown>
```

```js
dd.searchable = false;  // → attribute searchable="false"
dd.allowClear = true;   // → xoá attribute (quay lại mặc định BẬT)
```

Chú ý: `<td-dropdown searchable>` hoặc `searchable=""` vẫn là BẬT (khác boolean attribute thông thường).

### 5. Đổi danh sách khi đang dùng

```js
dd.updateData(newList);      // thay danh sách; giữ lựa chọn nếu còn trong danh sách, không còn thì bỏ chọn;
                             // tự đặt lại vị trí nếu menu đang mở
dd.setValue('dn');           // chọn theo giá trị (không phát event change)
dd.setValue(null);           // bỏ chọn
```

### 6. Dropdown phụ thuộc nhau (Tỉnh → Quận)

```js
const province = document.getElementById('province');
const district = document.getElementById('district');
province.addEventListener('change', async (e) => {
  district.setValue(null);
  district.updateData(e.detail.value ? await loadDistricts(e.detail.value) : []);
});
```

### 7. Callback thay cho event

```js
dd.onChange = (value) => console.log('giá trị', value);   // chỉ nhận value
dd.onSelect = (item) => console.log('item', item);         // nhận cả object (null khi bỏ chọn)
```

Đặt cả hai thì **cả hai** đều chạy: `onSelect` trước, rồi `onChange`, rồi event `change` (từ 0.16.0; trước đó chỉ
`onChange` chạy). Callback ném lỗi → lỗi được ghi `console.error`, callback còn lại và event `change` vẫn chạy.

### 8. Báo lỗi (lỗi server, lỗi tự kiểm)

```js
dd.setError('Vui lòng chọn thành phố hợp lệ');   // viền đỏ + dòng lỗi + aria-invalid
dd.clearError();
```

Hoặc bằng attribute: `<td-dropdown error-text="…">`. Xem [TdFormValidation](form-validation.md) để map lỗi server hàng loạt.

### 9. Nâng cấp từ `<select>` native (SSR / không JS)

Từ 0.17.0, in một `<select>` bình thường **bên trong** `<td-dropdown>`. Chưa có JS (hoặc JS lỗi): select native hoạt
động và submit như thường. Khi component được nạp, nó **thay** select:

```html
<label for="city-sel">Thành phố</label>
<td-dropdown>
  <select id="city-sel" name="city" required>
    <option value="">Chọn…</option>
    <optgroup label="Miền Bắc">
      <option value="hn" selected>Hà Nội</option>
      <option value="hp">Hải Phòng</option>
    </optgroup>
    <optgroup label="Miền Nam" disabled>
      <option value="sg">Sài Gòn</option>
    </optgroup>
  </select>
</td-dropdown>
```

Khi gắn vào trang **lần đầu**, nếu host có con trực tiếp `<select>` và chưa có `options` gán bằng JS:

- **options**: mỗi `<option>` → `{ value, label }` (`label` = chữ hiển thị đã trim, hoặc attribute `label` của option
  nếu có), theo đúng thứ tự. `data-swatch` của `<option>` → `swatch` (0.82.0; qua cùng cổng màu, sai → bỏ). Từ 0.84.0 `<optgroup label>` thành **nhóm** (`groups` tự sinh khoá `g0`, `g1`…; option nằm ngoài mọi optgroup xếp cuối,
  không tiêu đề), và `<option>` đọc thêm `data-icon`, `data-icon-tone`, `data-description`, `data-status` +
  `data-status-tone`, `data-meta`, `data-keywords` (trước 0.84.0 optgroup bị làm phẳng). Option `disabled` hoặc nằm trong
  `<optgroup disabled>` → `disabled: true`. Key theo `value-key` / `label-key` nếu host có đặt.
- **lựa chọn**: (1) attribute `value` của host nếu có; (2) nếu không, giá trị **đang chọn** của select — gồm cả lựa chọn
  người dùng đã đổi trước khi JS chạy, và option đầu tiên (không bị vô hiệu) khi không option nào `selected`, như native.
- **reset form**: về mặc định theo luật `<select>` — option `selected` cuối cùng, không có thì option đầu tiên không bị
  vô hiệu hoá.
- `name`, `required`, `disabled`, `aria-label` lấy từ select nếu host chưa có.
- `<label for="{id của select}">` được đổi `for` sang id của `<td-dropdown>` (host tự được gán id nếu chưa có) — nhãn
  vẫn đặt tên và bấm vẫn focus dropdown.
- Select bị **gỡ** khỏi DOM, nên không có giá trị gửi trùng.
- `<select multiple>` **không** được nâng cấp (dropdown chỉ chọn một): select giữ nguyên, hoạt động native, có
  `console.warn`. Dùng [`<td-chip-input>`](chip-input.md) nếu cần chọn nhiều có giao diện td.
- Chỉ đọc **một lần**: đổi select sau đó (hoặc gắn lại host) không có tác dụng; dùng `options` / `updateData()`.

**Trước khi JS tải (0.51.1, [ADR 0025](../internal/decisions/0025-pre-upgrade-parity.md)).** Khi host **chưa được
define**, `td.css` cho select con trực tiếp (cả select trần lẫn `select.td-dropdown__native` của chế độ element) đúng
**hộp và dáng của trigger đóng**: cao `--td-field-h-md`, padding, viền, bo góc, font, màu chữ placeholder khi đang chọn
option `value=""`, **chevron vẽ bằng CSS gradient** (`appearance: none`; không ảnh, CSP không đổi), kiểu chữ nhãn của
`.td-dropdown`. Nạp module thì select → trigger **không dịch pixel nào** (đo ở Chromium / Firefox / WebKit, 390 và 1280
px). Không JS: vẫn là select native (chọn, submit, `required`), chỉ đẹp hơn. Cảm ứng: chữ select 16 px (iOS không
phóng to khi chạm), sau nâng cấp trigger 14 px — hộp vẫn khớp. Forced colors: mũi tên hệ thống. Host **đã define** không
bao giờ tạo kiểu cho một `<select>` con (chỉ trạng thái trước nâng cấp).

Nạp component bằng `<script type="module">` (mặc định chạy sau khi HTML parse xong). Nếu module được định nghĩa
**trước** khi parser đọc tới `<select>` bên trong (ví dụ `async` chạy sớm trên trang dài), component sẽ render trước khi
select tồn tại và không nâng cấp được.

Option `value=""` **đứng đầu** (dạng "Chọn…") là **placeholder**, giống quy ước của `td_dropdown()` trong
[adapter PHP](../guides/php-adapter.md#td_dropdown): nó không thành một mục chọn được; chữ của nó thành attribute
`placeholder` của host (nếu host chưa đặt); nếu nó là lựa chọn mặc định thì dropdown = chưa có giá trị (không gửi,
`required` báo thiếu, reset về chưa chọn). Option `value=""` ở vị trí khác vẫn là một mục bình thường.

**Vỏ SSR không xô lệch (0.26.0, hợp đồng `dropdown@1`).** Select native mặc định cao / viền / font khác trigger, nên khi
module tải xong trang bị xô lệch. Đánh dấu host `data-td-ssr="dropdown@1"` và cho select class `td-dropdown__native`
(đây chính là markup `td_dropdown(…, ['element' => true])` của [adapter PHP](../guides/php-adapter.md#td_dropdown-ở-chế-độ-element-vỏ-không-xô-lệch-0260)
in ra):

```html
<td-dropdown data-td-ssr="dropdown@1" id="city" label="Thành phố" searchable="false" allow-clear="false">
  <label class="td-field__label" for="city-select">Thành phố</label>
  <select class="td-dropdown__native" id="city-select" name="city">…</select>
</td-dropdown>
```

- `td.css` tạo dáng select **đúng hộp của trigger** (chiều cao, padding, viền, bo góc, font, màu theo token
  `--td-field-*`, rộng 100 %) và giữ **mũi tên native** (không `appearance: none`, không ảnh `data:` — hợp CSP chặt).
  Mũi tên có thể khác chevron của trigger, hộp thì trùng: thay select → trigger không dịch pixel nào (test 3 engine).
- **Select đang focus khi module tới** (người dùng đang chọn): component không làm gì — không gỡ select, không render,
  không gắn listener — cho tới khi select **blur**; lúc đó nâng cấp đúng **một lần** với lựa chọn tại thời điểm blur,
  focus giữ ở chỗ người dùng vừa chuyển tới. Gỡ host khỏi trang trong lúc chờ → huỷ chờ; gắn lại → xét lại từ đầu.
- Dấu bị gỡ khi nâng cấp. Không có dấu / dấu lệch (`dropdown@2`) → hành vi nâng cấp như trên, không hoãn.

### 10. Dòng "＋ Thêm mới" ở cuối menu (`create-label`, 0.22.0)

Cho người dùng thêm một mục **mới** ngay trong dropdown (ví dụ thêm film / máy / lab vào catalog rồi chọn luôn), thay
cho nút riêng bên dưới hoặc option giả kiểu `__new__`:

```html
<td-dropdown id="film" name="film" label="Film" create-label="Thêm film mới"></td-dropdown>
```

Menu có thêm **một dòng hành động cố định ở đáy** (icon `plus`, chữ màu accent, đậm, có đường kẻ phía trên), nằm ngoài
vùng cuộn nên danh sách dài cuộn tới đâu dòng này vẫn luôn thấy:

- **Không bao giờ là một giá trị**: bấm vào không đổi lựa chọn, không phát `change`, không vào `FormData`, không ảnh
  hưởng `required`.
- **Không bị lọc** khi tìm, vẫn hiện khi danh sách rỗng / không có kết quả (thông báo "Không tìm thấy kết quả" nằm phía
  trên danh sách, dòng tạo luôn ở cuối).
- Chưa gõ gì → chữ là `create-label`. Đang gõ trong ô tìm kiếm → chữ là `TdDropdown.labels.createWithQuery` với
  `{query}` = chữ đã gõ (trim hai đầu), mặc định `Thêm “Portra 400”`. Chữ luôn đưa vào dạng **text** (đã escape) — gõ
  `<img onerror>` chỉ hiện ra đúng chuỗi đó.
- Kích hoạt bằng chuột, hoặc `Enter` / `Space` khi dòng đang active (`↑` `↓` `Home` `End` `PageUp` `PageDown` đi tới
  được như một mục cuối danh sách; type-ahead bỏ qua nó).

Khi kích hoạt, **theo đúng thứ tự**:

1. Chụp `query` = chữ trong ô tìm kiếm, **chỉ trim hai đầu**, giữ nguyên hoa / thường và dấu (`''` khi không có ô tìm
   kiếm hoặc chưa gõ).
2. Đóng menu (giải phóng lớp nổi của dropdown) và trả focus về trigger.
3. Gọi `onCreate(query)` (nếu có) rồi phát event `create` với `detail: { query }` — **cùng** bản chụp ở bước 1.

Vì menu đã đóng **trước** khi handler chạy, mở một modal chồng trong handler là an toàn (modal mới nằm trên cùng, nhận
focus; đóng nó thì focus về lại trigger của dropdown). Luồng điển hình — dropdown nằm trong một modal phiếu, bấm
"Thêm film mới" mở modal thứ hai, lưu xong thì mục mới được chọn:

```js
import { TdModal } from '@dazzxq/td-components/modal';

const film = document.getElementById('film');
film.addEventListener('create', (e) => {
  const name = document.createElement('input');
  name.value = e.detail.query;               // "Portra 400" nếu người dùng đã gõ trong ô tìm kiếm
  TdModal.show({
    title: 'Thêm film',
    body: name,
    actions: [
      { label: 'Huỷ' },
      {
        label: 'Lưu',
        variant: 'primary',
        // trả Promise → nút "Lưu" bận tới khi xong, rồi modal tự đóng (ném lỗi / reject → modal giữ nguyên)
        onClick: async () => {
          const saved = await api.createFilm({ name: name.value });   // { id, name } từ server
          film.options = [...film.options, { value: saved.id, label: saved.name }];
          film.setValue(saved.id);                                    // chọn mục mới
        },
      },
    ],
  });
});
```

**Lưu ý:** `setValue()` **không** phát `change` (cũng như `options = […]`). Nếu phần còn lại của form đang nghe
`change` để cập nhật (giá, phụ thuộc…), hãy tự gọi lại logic đó sau `setValue()`, hoặc tự phát:
`film.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: saved.id, item: film.getSelectedItem() } }))`.

Gỡ attribute (`removeAttribute('create-label')` hoặc `createLabel = ''`) → dòng biến mất. Dropdown `disabled` không mở
được nên dòng cũng không kích hoạt được. Adapter PHP: `td_dropdown(..., ['create_label' => 'Thêm film mới'])` (dòng chỉ
có khi JS đã nạp — bản `<select>` native không có nó).

### 11. Chế độ "chọn để thêm" (`mode="action"`, 0.85.0)

Dùng khi dropdown là một **nút thêm**, không phải ô chọn giá trị. Ví dụ "+ Thêm mẫu khuyến mãi": mỗi lần chọn là thêm một mục vào danh sách bên dưới.

```html
<td-dropdown id="ds-campaign-add" mode="action" placeholder="Thêm mẫu khuyến mãi" trigger-meta="4/10"
             aria-label="Thêm mẫu khuyến mãi" create-label="Tạo mẫu khuyến mãi mới" max-height="8"></td-dropdown>
```

```js
const add = document.getElementById('ds-campaign-add');
add.groups = [{ key: 'public', label: 'Đang hiện' }, { key: 'hidden', label: 'Đang tắt' }];
add.options = templates.map((t) => ({ value: t.id, label: t.name, group: t.group, icon: t.icon }));
add.addEventListener('pick', (e) => {
  addTemplate(e.detail.item);                         // site tự thêm vào danh sách của mình
  add.setAttribute('trigger-meta', `${count()}/10`);  // cập nhật số đếm trên trigger
  if (count() >= 10) add.disabled = true;             // đủ trần → tắt cả ô
});
```

Hợp đồng:

- **Không giữ giá trị.** Chọn một option thì phát `pick` `{ value, item }` (và `onPick(item)` chạy trước). Sau đó menu đóng và focus về trigger. Ngoài ra:
  - không phát `change`;
  - không vào `FormData`, kể cả khi có `name`;
  - `required` không có tác dụng;
  - không có dòng "Không chọn" (`allow-clear` bị bỏ qua) và không có dấu tích.
- `getValue()` / `value` luôn `null`. `setValue()`, attribute `value`, form reset và khôi phục trạng thái đều bị bỏ qua.
- **Trigger** luôn hiện chữ `placeholder`, màu chữ thường (đây là nhãn của nút, không phải gợi ý mờ). Icon đầu:
  - mặc định `plus`;
  - `trigger-icon="tên-icon"` dùng icon khác (phải có trong registry);
  - `trigger-icon="none"` thì không có icon.
- **`trigger-meta`**: chữ phụ mờ ở cuối trigger (ví dụ `4/10`), dùng được ở cả hai chế độ. Trình đọc màn hình đọc nó như mô tả (`aria-describedby`), không gộp vào tên. Đổi attribute thì cập nhật tại chỗ.
- **`keep-open`**: chọn xong menu vẫn mở để thêm nhiều mục liền:
  - ô tìm giữ nguyên chữ đã gõ;
  - dòng active nhảy sang option kế tiếp còn chọn được (bỏ qua dòng "Thêm mới"), không có thì lùi về option trước.
  - Nếu site gán lại `options` ngay trong handler `pick` (ví dụ đánh dấu mục vừa thêm là `disabled` + `meta: 'Đã thêm'`), menu vẫn giữ chữ tìm và dòng active (từ 0.86.0 cũng vậy ở chế độ select).
  - Dòng "Thêm mới" (`create-label`) vẫn đóng menu như 0.22.0.
- Option `disabled` không phát `pick`. Host `disabled` thì không mở được.
- **Trợ năng:**
  - trigger vẫn là `role="combobox"`, nên luôn đặt `label` hoặc `aria-label`;
  - sau mỗi lần chọn, một vùng `aria-live="polite"` ẩn với mắt đọc "Đã chọn {nhãn}" (`TdDropdown.labels.picked`; `''` = tắt).
- Đổi `mode` lúc đang chạy sẽ đóng menu, render lại và bỏ lựa chọn cũ.
- Adapter PHP không có chế độ này: dropdown hành động chỉ có khi JS chạy. Bản `<select>` native sẽ gửi giá trị, trái với hợp đồng.

### 12. Nạp danh sách bất đồng bộ (`load`, 0.86.0)

Danh sách lớn hoặc lấy từ API: gán một hàm trả `Promise` của mảng option. Dropdown gọi nó **một lần**, ở lần mở menu đầu
tiên; trong lúc chờ, menu hiện "Đang tải…".

```js
const dd = document.querySelector('#customer');
dd.load = async () => {
  const res = await fetch('/api/customers');
  if (!res.ok) throw new Error(res.statusText);
  return res.json();           // mảng option như mục 1 / 1b
};
// danh sách đổi ở server → nạp lại (menu mở hay đóng đều được)
const ok = await dd.reload();  // true = đã gán options; false = lỗi / bị lần nạp mới hơn thay / không có load
```

- **Chỉ tự gọi một lần.** Nạp xong thì các lần mở sau không gọi lại; muốn nạp lại dùng `reload()` hoặc gán `load` mới.
- **Lỗi** (promise reject, hàm ném lỗi, kết quả không phải mảng hoặc có phần tử không phải object): menu hiện "Không tải được" và nút "Thử lại". Bấm nút
  hoặc nhấn Enter (khi không có dòng nào đang active) để nạp lại. Focus vẫn ở trigger / ô tìm, menu không đóng. Lỗi được
  ghi `console.warn('td-dropdown: load failed', err)`. Đóng rồi mở lại sau lỗi **không** tự gọi lại: menu vẫn hiện lỗi và
  nút.
- **Chỉ lần nạp mới nhất có hiệu lực.** Gọi `reload()` chồng nhau, gán `load` mới (kể cả `null`) hoặc `destroy()` → kết
  quả của lần cũ bị bỏ (lần cũ trả `false`). Gán `load = null` xoá ngay chữ "Đang tải…" / lỗi.
- Kết quả đi qua `options` như gán tay: attribute `value` hoặc `setValue()` gọi trước đó được áp khi danh sách về. Menu
  đang mở thì giữ chữ tìm; chưa có dòng active thì đặt như lúc mở (↓ mở → dòng đầu, End → dòng cuối…).
- Option đã có sẵn (gán trước `load`) vẫn hiện trong lúc tải.
- Chữ: `TdDropdown.labels.loading`, `loadError`, `retry`. Dòng trạng thái là `role="status"` sẵn có của menu (trình đọc
  màn hình đọc "Đang tải…" rồi kết quả), listbox mang `aria-busy="true"` khi đang tải.
- Không có trong adapter PHP: muốn có danh sách khi không JS thì in `<select>` (mục 9).

**Danh sách lớn (0.86.0).** Hơn 200 option (sau khi lọc) → trình duyệt bỏ qua dàn trang các dòng ngoài màn hình
(`content-visibility: auto`); mọi dòng vẫn có trong DOM nên bàn phím, `aria-activedescendant` và tìm kiếm không đổi.
2000 option có icon + mô tả + nhóm: mở menu và gõ tìm đều dưới mức người dùng thấy giật (số đo ở CHANGELOG 0.86.0).
Trình duyệt cũ (Firefox < 125, Safari < 18) vẫn đúng, chỉ chậm hơn.

### 13. Tự vẽ nhãn dòng (`renderOption`, 0.87.0)

`renderOption(item, { query, selected })` trả nội dung cho phần **nhãn** của mỗi dòng option (dòng thường và dòng giàu
thông tin). Icon, mô tả, trạng thái, meta, dấu tích vẫn dựng từ field như cũ.

```js
dd.renderOption = (item, { query }) => {
  const i = query ? item.label.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return null; // nhãn chữ mặc định
  const span = document.createElement('span');
  const mark = document.createElement('mark');
  mark.textContent = item.label.slice(i, i + query.length);
  span.append(item.label.slice(0, i), mark, item.label.slice(i + query.length));
  return span;
};
```

- Trả **Node** → chèn vào nhãn; trả **chuỗi** → chèn dạng chữ (không bao giờ là HTML); `null` / `''` / ném lỗi → nhãn chữ
  mặc định (lỗi ghi `console.error`).
- Không áp cho trigger, dòng "Không chọn", dòng "Thêm mới". Tìm kiếm, type-ahead và tên đọc cho trình đọc màn hình vẫn
  theo `label` / `keywords`.
- Node **không được chứa phần tử nhận focus** (link, nút, input): cả dòng là một `option`. Site chịu trách nhiệm nội dung
  Node của mình (dựng bằng DOM API, đừng gán `innerHTML` từ dữ liệu người dùng).
- Có `renderOption` thì chiều cao menu luôn đo thật (Node có thể cao hơn dòng chuẩn).

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `name` | string | — | Tên field khi gửi form. Không có `name` → không gửi. |
| `value` | string | — | Giá trị chọn ban đầu (so theo chuỗi). Đổi attribute sau khi render = gọi `setValue()`. Cũng là giá trị khôi phục khi form reset (trừ khi nâng cấp từ `<select>` — xem mục 9). Attribute **không** sống theo lựa chọn; đọc lựa chọn bằng property `value`. |
| `label` | string | — | Nhãn hiển thị (`<label class="td-field__label">`), đặt tên cho combobox và listbox. |
| `aria-label` | string | — | Tên truy cập khi không có `label` hiển thị (được chép vào nút trigger và listbox). |
| `placeholder` | string | `Chọn một tùy chọn` | Chữ hiện khi chưa chọn gì. |
| `searchable` | cờ mặc định BẬT | bật | Hiện ô tìm kiếm trong menu. Tắt: `"false"` / `"0"` / `"off"`. |
| `allow-clear` | cờ mặc định BẬT | bật | Thêm dòng "Không chọn" ở đầu danh sách khi đã có lựa chọn. Tắt như trên. |
| `max-height` | number | `5` | Số option hiển thị trước khi cuộn (mỗi option 40px; tối đa 100; có dòng giàu thông tin / nhóm thì đo thật, 0.84.0). Cũng là bước nhảy của PageUp/PageDown. |
| `search-fields` | string | `label description keywords` | **0.84.0** Trường dùng để tìm (cách nhau bởi dấu cách / dấu phẩy). `label` = hành vi cũ. Đổi tại chỗ. |
| `trigger-icon` | string | — | **0.84.0** `none` / `off` / `false` → trigger không hiện icon của option đã chọn. **0.85.0** Ở `mode="action"`: vắng → `plus`, tên icon khác → icon đó (phải có trong registry), `none` → không icon. |
| `mode` | `select` \| `action` | `select` | **0.85.0** `action` = chế độ "chọn để thêm" ([mục 11](#11-chế-độ-chọn-để-thêm-modeaction-0850)). Đổi sẽ render lại. |
| `keep-open` | cờ | tắt | **0.85.0** Chỉ ở `mode="action"`: chọn xong menu vẫn mở. `"false"` / `"0"` / `"off"` = tắt. Đọc lúc chọn, đổi không render lại. |
| `trigger-meta` | string | — | **0.85.0** Chữ phụ mờ ở cuối trigger (ví dụ `4/10`), vào `aria-describedby` của trigger. Cả hai chế độ. Đổi tại chỗ. |
| `value-key` | string | `value` | Key trong object option dùng làm giá trị. |
| `label-key` | string | `label` | Key trong object option dùng làm chữ hiển thị. |
| `required` | boolean | `false` | Bắt buộc chọn: `valueMissing` khi trống, `aria-required`, dấu `*` trang trí trong label. |
| `disabled` | boolean | `false` | Vô hiệu hoá (cũng tự vô hiệu trong `<fieldset disabled>`). Đang mở mà bị disable → đóng. |
| `error-text` | string | — | Thông báo lỗi hiển thị (error contract). |
| `create-label` | string | — | Bật dòng hành động "Thêm mới" cố định ở đáy menu với chữ này (0.22.0). Rỗng / vắng = tắt. Xem [mục 10](#10-dòng--thêm-mới-ở-cuối-menu-create-label-0220). |
| `helper-text` | string | — | **0.54.0** Gợi ý dưới control (chữ, 1–2 câu): ẩn và rời khỏi mô tả khi có lỗi. Nội dung giàu (link, `<code>`): `<td-hint>` con — xem [Hint](hint.md). Property `helperText`, `setHelper(msg)`, `helperMessage`. |

Đổi `value`, `placeholder`, `disabled`, `required`, `name`, `aria-label`, `error-text`, `create-label`, `search-fields`, `trigger-icon`,
`trigger-meta`, `keep-open` được cập nhật **tại chỗ** (giữ focus; menu đang mở vẫn mở). Đổi `label`, `searchable`, `allow-clear`,
`max-height`, `value-key`, `label-key`, `mode` sẽ đóng menu và render lại.

## Property & method

| Thành viên | Chữ ký | Mô tả |
|---|---|---|
| `options` | `Array<Object>` (get/set) | Danh sách option. Lần gán đầu áp attribute `value`; các lần sau giữ lựa chọn hiện tại nếu còn trong danh sách (không còn → bỏ chọn). Luôn áp giá trị pending. Menu đang mở → giữ chữ tìm, dòng active, vị trí cuộn (0.86.0 ở cả hai chế độ). Gán trước khi component được define vẫn nhận. |
| `onChange` | `(value) => void` \| `null` | Callback khi người dùng chọn/bỏ chọn; nhận value (`null` khi bỏ chọn). Chạy sau `onSelect`. |
| `onSelect` | `(item) => void` \| `null` | Callback nhận cả object (`null` khi bỏ chọn). Chạy trước `onChange` (cả hai đều chạy nếu cùng đặt). |
| `renderOption` | `(item, { query, selected }) => Node \| string \| null` \| `null` | **0.87.0** Nội dung nhãn của mỗi dòng option ([mục 13](#13-tự-vẽ-nhãn-dòng-renderoption-0870)). Gán / gỡ → vẽ lại danh sách. Khác hàm → `null`. Gán trước khi define vẫn nhận. |
| `onCreate` | `(query) => void` \| `null` | Callback khi kích hoạt dòng "Thêm mới" (0.22.0); nhận `query` (chuỗi). Chạy trước event `create`; ném lỗi → ghi `console.error`, event vẫn phát. |
| `createLabel` | `string` (get/set) | Phản chiếu attribute `create-label` (`''` = tắt). |
| `load` | `() => Promise<Array>` \| `null` | **0.86.0** Hàm nạp danh sách bất đồng bộ ([mục 12](#12-nạp-danh-sách-bất-đồng-bộ-load-0860)). Tự gọi một lần ở lần mở đầu. Gán lại (kể cả `null`) → bỏ lần nạp đang chờ; menu đang mở thì nạp ngay. Gán trước khi define vẫn nhận. |
| `reload()` | `() => Promise<boolean>` | **0.86.0** Gọi `load` ngay (menu mở hay đóng). `true` = đã gán options; `false` = không có `load`, lỗi, hoặc bị lần nạp mới hơn thay. Không bao giờ reject. |
| `onPick` | `(item) => void` \| `null` | **0.85.0** Callback khi chọn một option ở `mode="action"`. Chạy trước event `pick`; ném lỗi thì ghi `console.error`, event vẫn phát. Gán trước khi define vẫn nhận. |
| `mode` / `keepOpen` / `triggerMeta` | get/set | **0.85.0** Phản chiếu `mode` (`'select'` \| `'action'`), `keep-open` (boolean), `trigger-meta` (chuỗi). Gán trước khi define vẫn nhận. |
| `groups` | `Array<{ key, label }>` (get/set) | **0.84.0** Thứ tự và tiêu đề nhóm ([mục 1b](#1b-dòng-giàu-thông-tin-và-nhóm-084-0)). Gán lại → lọc lại tại chỗ. Gán trước khi define vẫn nhận. |
| `TdDropdown.labels` | static object | Chữ giao diện, site ghi đè được (xem [dưới](#tddropdownlabels)). |
| `searchable` | `boolean` (get/set) | Trạng thái thật của cờ. `false` → `searchable="false"`; `true` → xoá attribute. |
| `allowClear` | `boolean` (get/set) | Tương tự cho `allow-clear`. |
| `value` | get/set | **Sống** (từ 0.17.0): đọc = `getValue()`, ghi = `setValue()` (không đổi attribute `value`). Trước khi gắn vào DOM, ghi = đặt attribute `value` ban đầu. Trước 0.17.0 property này trả attribute. |
| `getValue()` | `() => any \| null` | Giá trị của mục đang chọn (kiểu gốc trong object, không ép chuỗi), `null` nếu chưa chọn. |
| `setValue(value)` | `(value) => void` | Chọn theo giá trị. `null` / `undefined` → luôn bỏ chọn. `''` → chọn option **có giá trị rỗng thật** nếu có (0.17.0), không có thì bỏ chọn (không pending). Giá trị khác chưa có trong options → bỏ lựa chọn cũ, nhớ lại để áp dụng khi options đến. **Không** phát `change`. |
| `getSelectedItem()` | `() => Object \| null` | Object option đang chọn. |
| `updateData(list)` | `(Array) => void` | Thay danh sách: giữ lựa chọn hiện tại nếu còn trong danh sách, không còn thì bỏ chọn (không phát `change`); áp giá trị pending. Khi menu đang mở (như `options = …`; **0.85.0** ở `mode="action"`, **0.86.0** cả chế độ select): giữ chữ tìm và lọc lại, giữ dòng active theo giá trị, giữ vị trí cuộn. |
| `open()` | `() => void` | Mở menu (không làm gì khi disabled; đang mở thì chỉ đặt lại vị trí). Đóng mọi dropdown khác đang mở. |
| `close()` | `() => void` | Đóng menu, xoá chữ tìm kiếm, trả focus về trigger nếu focus đang trong menu. |
| `toggle()` | `() => void` | Mở/đóng. |
| `destroy()` | `() => void` | Gỡ hẳn: huỷ listener, xoá menu portal và nội dung phần tử. |
| `setError(msg)` / `clearError()` | | Error contract (xem [Form](#form)). `errorMessage` (getter) trả lỗi đang hiện. |
| `name`, `disabled`, `required`, `label`, `placeholder`, `maxHeight`, `valueKey`, `labelKey`, `errorText` | property phản chiếu attribute | Đọc/ghi attribute tương ứng (chuỗi; `disabled`/`required` là boolean). |
| `form`, `validity`, `validationMessage`, `willValidate`, `labels` | read-only | Như control gốc. |
| `checkValidity()`, `reportValidity()`, `setCustomValidity(msg)` | | Như control gốc. |
| `focus()` | | Chuyển focus vào nút trigger. |

### `TdDropdown.labels`

Chữ mặc định cho cả trang (tiếng Việt). Đổi ngay sau import, trước khi dropdown render:

```js
import { TdDropdown } from '@dazzxq/td-components/dropdown';
Object.assign(TdDropdown.labels, {
  search: 'Search', none: 'None', noResults: 'No results', required: 'Please choose an option',
});
```

| Khoá | Mặc định | Dùng ở |
|---|---|---|
| `search` | `Tìm kiếm` | `aria-label` của ô tìm kiếm; placeholder là chữ này + `...` |
| `none` | `Không chọn` | Dòng bỏ chọn (`allow-clear`) |
| `noResults` | `Không tìm thấy kết quả` | Dòng trạng thái khi tìm không ra |
| `required` | `Vui lòng chọn một tùy chọn` | Thông điệp `valueMissing` khi `required` |
| `createWithQuery` | `Thêm “{query}”` | Chữ dòng "Thêm mới" khi đang gõ tìm kiếm; `{query}` = chữ đã gõ (trim). Không gõ gì → dùng `create-label` (0.22.0) |
| `resultCount` | `{count} kết quả` | **0.84.0** Câu trình đọc màn hình đọc khi đang gõ tìm và có kết quả (ẩn với mắt). `''` = tắt |
| `picked` | `Đã chọn {label}` | **0.85.0** Câu thông báo lịch sự sau mỗi lần chọn ở `mode="action"`; `{label}` = nhãn option. `''` = tắt |
| `loading` | `Đang tải…` | **0.86.0** Dòng trạng thái khi `load` đang chạy |
| `loadError` | `Không tải được` | **0.86.0** Dòng trạng thái khi `load` lỗi |
| `retry` | `Thử lại` | **0.86.0** Chữ nút nạp lại khi `load` lỗi |

Tất cả được escape / đưa vào bằng `textContent`. Placeholder của trigger ("Chọn một tùy chọn") đổi bằng attribute
`placeholder`.

## Event

| Event | detail | Khi nào | bubbles? |
|---|---|---|---|
| `change` | `{ value, item }` — `value` là giá trị gốc (hoặc `null`), `item` là object (hoặc `null`) | Người dùng chọn một mục hoặc chọn "Không chọn". Đúng **một** event mỗi lần chọn. `setValue()`, `updateData()`, form reset **không** phát. | có (`composed: true`) |
| `create` | `{ query }` — chữ trong ô tìm kiếm, trim hai đầu (`''` nếu không có) | Người dùng kích hoạt dòng "Thêm mới" (`create-label`, 0.22.0). Phát **sau** khi menu đã đóng và focus đã về trigger, sau `onCreate`. Không kèm `change`. | có (`composed: true`) |
| `pick` | `{ value, item }` | **0.85.0** Chỉ ở `mode="action"`: người dùng chọn một option (chuột, Enter, Space, Alt+↑). Đúng **một** event mỗi lần. Phát sau `onPick`, sau khi menu đóng và focus về trigger (`keep-open`: menu vẫn mở, focus giữ nguyên). Không kèm `change`. | có (`composed: true`) |

## Form

- **Giá trị gửi**: `String(value)` của mục đang chọn dưới `name`. Chưa chọn → không có entry trong `FormData`.
  `mode="action"` (0.85.0) không bao giờ gửi gì và không bao giờ `valueMissing`.
- **`required`**: chưa chọn → `validity.valueMissing`, thông báo `TdDropdown.labels.required` (`Vui lòng chọn một tùy chọn`).
- **Reset** (`form.reset()` / `<button type="reset">`): khôi phục attribute `value` ban đầu (lúc kết nối DOM), xoá lỗi
  `setError`. Nâng cấp từ `<select>`: về mặc định theo luật `<select>` (xem [mục 9](#9-nâng-cấp-từ-select-native-ssr--không-js)).
- **`<fieldset disabled>`**: tự vô hiệu, không đổi attribute `disabled` của bạn, không bị gửi.
- **Khôi phục trạng thái** (bfcache/autofill): chọn lại theo giá trị.
- **Label ngoài**: `<label for="city">` (id của host) hoạt động; bấm label → focus trigger. `<label for>` trỏ vào
  `<select>` con được đổi sang id host khi nâng cấp.
- **Error contract**: `error-text` / `setError(msg)` → `aria-invalid="true"`, `aria-errormessage`, `aria-describedby` trên
  trigger + `<span class="td-field-error">` sau khối dropdown. Lỗi hiển thị **không** thay đổi `validity`; muốn chặn
  submit hãy dùng `setCustomValidity()` hoặc [TdFormValidation](form-validation.md).

Chi tiết chung về form: [Hướng dẫn form](../guides/forms.md).

## Tuỳ biến giao diện

Token riêng của dropdown (khai báo trong `@layer td.tokens`, file `components/dropdown.css`):

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-dropdown-option-h` | `40px` | Chiều cao tối thiểu một option. **Lưu ý:** JS tính `max-height` của danh sách theo 40px/option, đổi token không đổi phép tính này. |
| `--td-dropdown-option-hover` | `var(--td-option-hover-bg)` | Nền option khi hover chuột. |
| `--td-dropdown-option-active` | `var(--td-option-active-bg)` | Nền option đang active (bàn phím) + vạch nhấn đầu dòng (0.36.0). |
| `--td-dropdown-option-active-line` | `var(--td-control-border-hover)` | **Hết tác dụng từ 0.36.0** — hàng active có vạch nhấn đầu dòng `--td-option-active-bar` (xem [Tuỳ biến › Hàng option](../customization/theming.md)). |
| `--td-dropdown-option-selected` | `var(--td-option-selected-bg)` | Nền option đã chọn (0.36.0: nhãn in đậm, ✓ ở cuối, hàng tràn mép). |
| `--td-dropdown-swatch-size` | `0.75rem` | Cỡ chấm màu của option (0.82.0). |
| `--td-dropdown-swatch-edge` | `var(--td-color-border-strong)` | Viền 1px quanh chấm để chấm trắng / đen vẫn thấy trên mọi nền (forced-colors: `CanvasText`). |
| `--td-dropdown-icon-size` | `1.75rem` | **0.84.0** Cạnh ô vuông chứa `icon` của option; hình bên trong bằng 60% cạnh ô. Màu ô lấy theo token `--td-badge-{tone}-*`. |
| `--td-dropdown-search-bg` | `var(--td-color-hover)` (dark: `rgb(255 255 255 / 6%)`) | Nền ô tìm kiếm. |
| `--td-dropdown-search-border` | `var(--td-control-border-soft)` | Viền ô tìm kiếm. |
| `--td-dropdown-hairline` | `var(--td-color-border)` | Đường kẻ dưới ô tìm kiếm và trên dòng "Thêm mới". |
| `--td-dropdown-create-fg` | accent đậm hơn 18 % (dark: accent pha 45 % trắng) | Màu chữ + icon dòng "Thêm mới" (0.22.0; ≥ 4.7:1 trên nền menu, kể cả khi active). Trình duyệt không có `color-mix()`: màu cố định `--td-dropdown-create-fg-fallback` = `#1d4ed8` (dark `#93c5fd`), cũng đạt ≥ 4.7:1. |

Nút trigger dùng chung token field (`field.css`): `--td-field-bg`, `--td-field-fg`, `--td-field-border`,
`--td-field-border-hover`, `--td-field-focus`, `--td-field-error`, `--td-field-placeholder`, `--td-field-radius-md`,
`--td-field-h-md`, `--td-field-bg-disabled`, `--td-field-fg-disabled`, `--td-field-label`, `--td-field-note`. Menu là
popup nhỏ (`.td-glass-surface--strong`: nền 94 % + `blur(12px)` + viền mảnh + một bóng mềm, 0.20.0) dùng `--td-glass-pad`, `--td-glass-radius`, `--td-glass-radius-inner`, và nằm
ở lớp `--td-z-popover` (450).

```css
/* Trong CSS của site, sau td.css */
:root {
  --td-dropdown-option-selected: #e0ecff;
  --td-dropdown-option-active-line: #2563eb;
}
/* Chỉ một dropdown: đặt biến trên chính host */
#city { --td-field-radius-md: 6px; }
```

Menu được portal ra `<body>`, nên biến đặt trên host **không** chảy vào menu. Muốn đổi menu cho riêng một dropdown,
nhắm theo id menu: `#city-menu { --td-dropdown-option-selected: #fef3c7; }`.

Xem thêm: [Theming](../customization/theming.md), [Styling](../customization/styling.md).

## Cấu trúc DOM & class

```html
<td-dropdown id="{host}">
  <div class="td-dropdown" data-state="closed|open">
    <label class="td-field__label" id="{host}-label" for="{host}-trigger">Nhãn<span class="td-field__required" aria-hidden="true"> *</span></label>
    <button type="button" class="td-dropdown__trigger" id="{host}-trigger" role="combobox" aria-haspopup="listbox"
            aria-expanded="false" aria-controls="{host}-listbox" [aria-activedescendant] [aria-required] [aria-invalid]>
      <span class="td-dropdown__value" [data-placeholder]>Hà Nội</span>
      <span class="td-dropdown__arrow" data-td-icon="down" aria-hidden="true"><svg class="td-icon td-icon--m" data-icon="down" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg></span>
    </button>
  </div>
  <span class="td-field-error" id="{host}-error" data-for="{host}">…</span>   <!-- chỉ khi có lỗi -->
</td-dropdown>

<!-- Con trực tiếp của <body>, tồn tại suốt khi host còn trong DOM -->
<div class="td-dropdown__menu td-glass-surface td-glass-surface--strong" id="{host}-menu" hidden
     data-state="closed|open" data-placement="bottom|top">
  <div class="td-dropdown__search-wrap">
    <input type="text" class="td-dropdown__search" aria-label="{labels.search}" placeholder="{labels.search}..."
           aria-autocomplete="list" aria-controls="{host}-listbox">
  </div>
  <p class="td-dropdown__empty" role="status">Không tìm thấy kết quả</p>
  <div class="td-dropdown__options" role="listbox" id="{host}-listbox" aria-labelledby="{host}-label">
    <div class="td-dropdown__scroller" role="presentation">           <!-- vùng cuộn (nhận max-height) -->
      <div class="td-dropdown__option td-dropdown__option--clear" role="option" id="{host}-opt-clear"
           aria-selected="false" data-value="__CLEAR__" data-nav="0"><span class="td-dropdown__option-label">Không chọn</span></div>
      <div class="td-dropdown__option" role="option" id="{host}-opt-0" aria-selected="true" data-value="hn"
           data-index="0" data-nav="1" [data-active]>
        <span class="td-dropdown__option-label">Hà Nội</span>
        <span class="td-dropdown__check" data-td-icon="check" aria-hidden="true">…</span>
      </div>
    </div>
    <!-- chỉ khi có create-label: con cuối của listbox, ngoài vùng cuộn -->
    <div class="td-dropdown__option td-dropdown__option--create" role="option" id="{host}-opt-create"
         aria-selected="false" data-nav="2">
      <span class="td-dropdown__create-icon" data-td-icon="plus" aria-hidden="true">…</span>
      <span class="td-dropdown__option-label">Thêm film mới</span>
    </div>
  </div>
</div>
```

Từ 0.84.0, khi option dùng trường mới (xem [mục 1b](#1b-dòng-giàu-thông-tin-và-nhóm-084-0)):

```html
<!-- trigger: option đã chọn có icon (tắt bằng trigger-icon="none") -->
<span class="td-dropdown__value"><span class="td-dropdown__value-icon" data-td-icon="{icon}" aria-hidden="true">…</span>Kho Hà Nội</span>

<!-- vùng trạng thái khi đang gõ và có kết quả: ẩn với mắt, chỉ trình đọc màn hình đọc -->
<p class="td-dropdown__empty" role="status" data-count>12 kết quả</p>

<!-- trong .td-dropdown__scroller: một nhóm (chỉ khi đã gán groups) -->
<div class="td-dropdown__group" role="group" aria-labelledby="{host}-grp-0">
  <div class="td-dropdown__group-label" role="presentation" id="{host}-grp-0">Kho hàng</div>
  <div class="td-dropdown__option td-dropdown__option--rich" role="option" id="{host}-opt-0" aria-selected="false"
       aria-labelledby="{host}-opt-0-label" aria-describedby="{host}-opt-0-desc {host}-opt-0-meta" data-value data-index data-nav>
    <span class="td-dropdown__icon" data-tone="success" data-td-icon="archive" aria-hidden="true">…</span>
    <span class="td-dropdown__text">
      <span class="td-dropdown__option-label" id="{host}-opt-0-label">Kho Hà Nội</span>
      <span class="td-dropdown__desc" id="{host}-opt-0-desc"><span class="td-dropdown__desc-text">Cầu Giấy</span><span class="td-dropdown__status" data-tone="success"><span class="td-dropdown__status-dot" aria-hidden="true"></span>Đang mở</span></span>
    </span>
    <span class="td-dropdown__meta" id="{host}-opt-0-meta">128 SP</span>
  </div>
</div>
<!-- option không thuộc nhóm nào: con trực tiếp của .td-dropdown__scroller, sau các nhóm -->
```

Từ 0.85.0 (`trigger-meta` ở cả hai chế độ; còn lại chỉ ở `mode="action"`, [mục 11](#11-chế-độ-chọn-để-thêm-modeaction-0850)):

```html
<button type="button" class="td-dropdown__trigger" id="{host}-trigger" role="combobox" … aria-describedby="{host}-trigger-meta">
  <span class="td-dropdown__value" data-action><span class="td-dropdown__value-icon" data-td-icon="plus" aria-hidden="true">…</span>Thêm mẫu khuyến mãi</span>
  <span class="td-dropdown__trigger-meta" id="{host}-trigger-meta">4/10</span>
  <span class="td-dropdown__arrow" data-td-icon="down" aria-hidden="true">…</span>
</button>
<!-- sau khối .td-dropdown, trong host: vùng thông báo ẩn với mắt -->
<span class="td-sr-only td-dropdown__live" aria-live="polite" aria-atomic="true">Đã chọn Tặng ốp lưng</span>
```

Từ 0.86.0, khi `load` lỗi, nút nạp lại nằm ngay sau dòng trạng thái (không bao giờ nhận focus):

```html
<p class="td-dropdown__empty" role="status">Không tải được</p>
<button type="button" class="td-dropdown__retry" tabindex="-1">Thử lại</button>
<div class="td-dropdown__options" role="listbox" id="{host}-listbox">…</div>
```

**0.22.0 đổi cấu trúc menu:** `.td-dropdown__options` (listbox) **không còn cuộn** — vùng cuộn và `max-height` chuyển
sang `.td-dropdown__scroller` bên trong; dòng `.td-dropdown__empty` chuyển lên **trước** listbox. CSS của site nhắm
`.td-dropdown__options` để đổi chiều cao / thanh cuộn → đổi sang `.td-dropdown__scroller`. Mỗi dòng mang `data-nav`
(chỉ số trong mô hình điều hướng).

Trạng thái dùng để style (không có class JS bật/tắt):

| Ở đâu | Attribute trạng thái |
|---|---|
| `.td-dropdown` | `data-state="open|closed"` |
| `.td-dropdown__trigger` | `aria-expanded`, `:disabled`, `aria-invalid="true"` |
| `.td-dropdown__value` | `data-placeholder` khi chưa chọn; `data-action` ở `mode="action"` (0.85.0) |
| `.td-dropdown__options` | `aria-busy="true"` khi `load` đang chạy (0.86.0) |
| `.td-dropdown__scroller` | `data-many` khi hơn 200 option đang hiện (0.86.0, `content-visibility: auto` cho từng dòng) |
| `.td-dropdown__menu` | `[hidden]`, `data-state`, `data-placement="top|bottom"`, `data-load="loading|error"` khi `load` đang chạy / lỗi (0.86.0) |
| `.td-dropdown__option` | `aria-selected="true"` (đã chọn), `data-active` (đang trỏ bằng phím/chuột), `aria-disabled="true"` (option vô hiệu hoá, 0.17.0) |

JS chỉ ghi toạ độ/độ rộng menu và `max-height` của vùng cuộn (`.td-dropdown__scroller`) qua CSSOM. Host không có `id` sẽ được gán tự động
(`td-td-dropdown-N`).

## Bàn phím & trợ năng

Giá trị bị cắt `…` (ô hẹp, 0.34.0): `.td-dropdown__value` có `title` = nhãn đầy đủ (rê chuột để xem); không có khi vừa chỗ hoặc đang là placeholder.

Mẫu APG **select-only combobox**: option không bao giờ nhận focus; control đang có focus (trigger, hoặc ô tìm kiếm khi
nó có focus) mang `aria-activedescendant` trỏ tới option active.

**Menu đóng (focus ở trigger)**

| Phím | Hành động |
|---|---|
| `ArrowDown` / `ArrowUp` / `Enter` / `Space` | Mở; active = mục đang chọn, không có thì mục đầu. |
| `Home` / `End` | Mở, active = mục đầu / cuối. |
| Ký tự in được | Mở và nhảy tới mục bắt đầu bằng chữ đã gõ (type-ahead). |

**Menu mở**

| Phím | Hành động |
|---|---|
| `ArrowDown` / `ArrowUp` | Di chuyển active (vòng quanh; dòng "Không chọn" và dòng "Thêm mới" nằm trong vòng; option vô hiệu hoá bị bỏ qua — áp cho mọi phím di chuyển và type-ahead). |
| `Home` / `End` | Mục đầu / cuối (chỉ khi focus ở trigger; trong ô tìm kiếm là di con trỏ chữ). |
| `PageDown` / `PageUp` | Nhảy `max-height` mục. |
| `Enter` | Chọn mục active (cả khi đang gõ trong ô tìm kiếm). Active là dòng "Thêm mới" → kích hoạt nó (event `create`). |
| `Alt+ArrowUp` | Chọn mục active (không có thì đóng). |
| `Space` | Trên trigger: chọn mục active (đang type-ahead thì là ký tự). Trong ô tìm kiếm: gõ dấu cách. |
| Ký tự in được (trigger) | Type-ahead: không phân biệt hoa thường và **dấu** ("ha" khớp "Hà Nội"), gõ lặp một chữ để xoay vòng, bộ đệm xoá sau 500 ms. |
| `Escape` | Đóng, focus về trigger. Phím bị "tiêu thụ" — modal phía dưới không bị đóng theo. |
| `Tab` | Từ ô tìm kiếm: đóng và quay về trigger. Từ trigger: đóng và để Tab đi tiếp (bẫy focus của modal vẫn hoạt động). Tab không bao giờ chọn. |

Khác:

- Mở menu có ô tìm kiếm sẽ focus ô tìm kiếm sau 100 ms — **trừ trên máy cảm ứng** (`(hover: none) and (pointer: coarse)`,
  mọi độ rộng kể cả iPad — 0.34.0; trước đó theo bề rộng ≥ 768px) để bàn phím ảo không che danh sách.
- Bấm chuột ra ngoài (`pointerdown`) đóng menu. Cuộn trong danh sách không đóng. Trigger bị cuộn khuất khỏi màn hình →
  menu tự đóng. Mở một dropdown sẽ đóng dropdown khác.
- Menu đăng ký lớp nổi `LAYERS.popover` nên dùng được bên trong [modal](modal.md) (không bị `inert` của modal chặn).
- Tên truy cập theo thứ tự: `label` nội bộ → `aria-label` của host → `<label for="{host-id}">` bên ngoài. Listbox lấy
  cùng tên.
- Ô "Không tìm thấy kết quả" là `role="status"` nằm ngoài listbox (phía trên nó).
- Dòng "Thêm mới" là `role="option"` `aria-selected="false"` (không `aria-disabled`), id `{host}-opt-create`;
  `aria-activedescendant` trỏ tới nó khi active. Chữ của nó bắt đầu bằng hành động ("Thêm …") nên đọc lên đủ nghĩa.
  Type-ahead không bao giờ nhảy vào nó.
- Touch (`pointer: coarse`): trigger, ô tìm kiếm và option cao tối thiểu `--td-touch-min` (44px); ô tìm kiếm ≥ 16px chữ
  để iOS không zoom.
- Menu mở bằng fade (không phóng to, 0.20.0); `prefers-reduced-motion`: fade nhanh tuyến tính. `forced-colors`: có viền/outline hệ thống.

Chi tiết: [Trợ năng](../guides/accessibility.md).

## Bảo mật

- `label`, `placeholder`, label và value của mọi option đều được **escape** trước khi render — chuỗi `<img onerror>`
  trong dữ liệu hiển thị thành chữ. Không có đường render HTML tuỳ ý trong option.
- Chữ người dùng gõ vào ô tìm kiếm chỉ đi vào nhãn dòng "Thêm mới" dưới dạng text đã escape, và vào `detail.query`
  dạng chuỗi thô — site **tự** escape khi đưa `query` vào HTML của mình (ví dụ dùng `value` / `textContent`, như ví dụ
  ở [mục 10](#10-dòng--thêm-mới-ở-cuối-menu-create-label-0220)).
- Id nội bộ (`{host}-opt-{i}`) sinh từ chỉ số, không từ dữ liệu.

Xem [Bảo mật](../guides/security.md).

## Cảm ứng

- Trigger và hàng option có hình nhấn (`--td-option-pressed-bg`); hover chỉ trên con trỏ mịn — không còn hàng "dính" màu sau khi chạm. `<select>` native (chế độ nâng cấp) do trình duyệt vẽ.

Chuẩn chung: [Cảm ứng](../guides/touch.md).

## Lưu ý & lỗi thường gặp

- **Menu đi theo "chủ" của nó (0.21.1).** Popup tự đóng khi trigger bị khung cuộn cắt, bị ẩn mà không cần
  cuộn (chuyển tab, accordion đóng, `display: none`), bị gỡ khỏi DOM, hoặc khi một modal / lightbox **mới** mở đè lên
  bằng code (timer, hết phiên…) — focus đi vào lớp mới, popup không còn bấm xuyên được. Modal / lightbox chứa trigger
  đóng → popup đóng ngay (không đợi hiệu ứng thoát). Mở popup lúc modal đang chạy hiệu ứng vào (vd. trong `onShow`)
  → vị trí được đặt lại khi hiệu ứng kết thúc.
- **Escape thuộc về popup, không thuộc tooltip hover (0.21.1).** Đang trỏ chuột lên một nút có tooltip rồi mở popup
  bằng bàn phím: Escape đầu tiên đóng popup, lần sau mới đóng tooltip.
- **Chỉ gán `options` bằng JS.** Viết `<td-dropdown options='[…]'>` không có tác dụng.
- **`el.value` là lựa chọn hiện tại từ 0.17.0** (trước đó là attribute `value` ban đầu). Attribute `value` vẫn chỉ là
  giá trị ban đầu, người dùng chọn không cập nhật attribute; code cũ đọc `el.value` để lấy giá trị ban đầu → dùng
  `getAttribute('value')`.
- **Gán lại `options` / `updateData()` bỏ lựa chọn không còn trong danh sách mới** (từ 0.16.0; trước đó gán lại
  `options` kéo lựa chọn về attribute `value`, còn `updateData()` giữ và vẫn gửi giá trị "ma"). Không phát `change`;
  nếu cần biết, so `getValue()` trước và sau.
- **Tìm kiếm trong menu không phân biệt hoa thường và dấu** ("ha noi" khớp "Hà Nội", "da" khớp "Đà Nẵng"), giống
  type-ahead trên trigger.
- **Menu nằm ở `<body>`**, không nằm trong host: selector kiểu `#city .td-dropdown__option` sẽ không khớp; dùng
  `#city-menu .td-dropdown__option`.
- Không có sự kiện `open`/`close`; theo dõi `data-state` hoặc `aria-expanded` nếu cần.

## Xem thêm

- [Chip input](chip-input.md) — chọn nhiều, tìm từ server
- [Form validation](form-validation.md) — kiểm tra form và lỗi server
- [Hướng dẫn form](../guides/forms.md) · [Hook & callback](../customization/hooks.md) ·
  [Theming](../customization/theming.md) · [Trợ năng](../guides/accessibility.md)
