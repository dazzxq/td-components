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

Danh sách lựa chọn **luôn** được gán bằng JS (property `options` hoặc `updateData()`), không có cú pháp `<option>` bên
trong thẻ.

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
- Không hỗ trợ: nhóm option (`optgroup`), option bị vô hiệu hoá, HTML trong label, chọn nhiều.

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
`updateData()` được gọi.

Render phía server (PHP): chỉ cần in `value` và nạp options bằng JS:

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
dd.updateData(newList);      // thay danh sách, giữ lựa chọn hiện tại, tự đặt lại vị trí nếu menu đang mở
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
// hoặc
dd.onSelect = (item) => console.log('item', item);         // nhận cả object (null khi bỏ chọn)
```

Nếu đặt **cả hai**, chỉ `onChange` được gọi (`onSelect` bị bỏ qua). Event `change` vẫn luôn được phát.

### 8. Báo lỗi (lỗi server, lỗi tự kiểm)

```js
dd.setError('Vui lòng chọn thành phố hợp lệ');   // viền đỏ + dòng lỗi + aria-invalid
dd.clearError();
```

Hoặc bằng attribute: `<td-dropdown error-text="…">`. Xem [TdFormValidation](form-validation.md) để map lỗi server hàng loạt.

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `name` | string | — | Tên field khi gửi form. Không có `name` → không gửi. |
| `value` | string | — | Giá trị chọn ban đầu (so theo chuỗi). Đổi attribute sau khi render = gọi `setValue()`. Cũng là giá trị khôi phục khi form reset. |
| `label` | string | — | Nhãn hiển thị (`<label class="td-field__label">`), đặt tên cho combobox và listbox. |
| `aria-label` | string | — | Tên truy cập khi không có `label` hiển thị (được chép vào nút trigger và listbox). |
| `placeholder` | string | `Chọn một tùy chọn` | Chữ hiện khi chưa chọn gì. |
| `searchable` | cờ mặc định BẬT | bật | Hiện ô tìm kiếm trong menu. Tắt: `"false"` / `"0"` / `"off"`. |
| `allow-clear` | cờ mặc định BẬT | bật | Thêm dòng "Không chọn" ở đầu danh sách khi đã có lựa chọn. Tắt như trên. |
| `max-height` | number | `5` | Số option hiển thị trước khi cuộn (mỗi option 40px; tối đa 100). Cũng là bước nhảy của PageUp/PageDown. |
| `value-key` | string | `value` | Key trong object option dùng làm giá trị. |
| `label-key` | string | `label` | Key trong object option dùng làm chữ hiển thị. |
| `required` | boolean | `false` | Bắt buộc chọn: `valueMissing` khi trống, `aria-required`, dấu `*` trang trí trong label. |
| `disabled` | boolean | `false` | Vô hiệu hoá (cũng tự vô hiệu trong `<fieldset disabled>`). Đang mở mà bị disable → đóng. |
| `error-text` | string | — | Thông báo lỗi hiển thị (error contract). |

Đổi `value`, `placeholder`, `disabled`, `required`, `name`, `aria-label`, `error-text` được cập nhật **tại chỗ** (giữ
focus). Đổi `label`, `searchable`, `allow-clear`, `max-height`, `value-key`, `label-key` sẽ đóng menu và render lại.

## Property & method

| Thành viên | Chữ ký | Mô tả |
|---|---|---|
| `options` | `Array<Object>` (get/set) | Danh sách option. Gán mới → lọc lại, áp giá trị pending và attribute `value` (xem [Lưu ý](#lưu-ý--lỗi-thường-gặp)). |
| `onChange` | `(value) => void` \| `null` | Callback khi người dùng chọn/bỏ chọn; nhận value (`null` khi bỏ chọn). |
| `onSelect` | `(item) => void` \| `null` | Callback nhận cả object (`null` khi bỏ chọn). Chỉ chạy khi **không** đặt `onChange`. |
| `searchable` | `boolean` (get/set) | Trạng thái thật của cờ. `false` → `searchable="false"`; `true` → xoá attribute. |
| `allowClear` | `boolean` (get/set) | Tương tự cho `allow-clear`. |
| `getValue()` | `() => any \| null` | Giá trị của mục đang chọn (kiểu gốc trong object, không ép chuỗi), `null` nếu chưa chọn. |
| `setValue(value)` | `(value) => void` | Chọn theo giá trị. `null` / `undefined` / `''` → bỏ chọn. Giá trị chưa có trong options → bỏ lựa chọn cũ, nhớ lại để áp dụng khi options đến. **Không** phát `change`. |
| `getSelectedItem()` | `() => Object \| null` | Object option đang chọn. |
| `updateData(list)` | `(Array) => void` | Thay danh sách (giữ lựa chọn hiện tại, áp giá trị pending). |
| `open()` | `() => void` | Mở menu (không làm gì khi disabled; đang mở thì chỉ đặt lại vị trí). Đóng mọi dropdown khác đang mở. |
| `close()` | `() => void` | Đóng menu, xoá chữ tìm kiếm, trả focus về trigger nếu focus đang trong menu. |
| `toggle()` | `() => void` | Mở/đóng. |
| `destroy()` | `() => void` | Gỡ hẳn: huỷ listener, xoá menu portal và nội dung phần tử. |
| `setError(msg)` / `clearError()` | | Error contract (xem [Form](#form)). `errorMessage` (getter) trả lỗi đang hiện. |
| `name`, `disabled`, `required`, `value`, `label`, `placeholder`, `maxHeight`, `valueKey`, `labelKey`, `errorText` | property phản chiếu attribute | Đọc/ghi attribute tương ứng (chuỗi; `disabled`/`required` là boolean). Lưu ý `el.value` là **attribute** `value` (giá trị ban đầu), không phải lựa chọn hiện tại — dùng `getValue()`. |
| `form`, `validity`, `validationMessage`, `willValidate`, `labels` | read-only | Như control gốc. |
| `checkValidity()`, `reportValidity()`, `setCustomValidity(msg)` | | Như control gốc. |
| `focus()` | | Chuyển focus vào nút trigger. |

## Event

| Event | detail | Khi nào | bubbles? |
|---|---|---|---|
| `change` | `{ value, item }` — `value` là giá trị gốc (hoặc `null`), `item` là object (hoặc `null`) | Người dùng chọn một mục hoặc chọn "Không chọn". Đúng **một** event mỗi lần chọn. `setValue()`, `updateData()`, form reset **không** phát. | có (`composed: true`) |

## Form

- **Giá trị gửi**: `String(value)` của mục đang chọn dưới `name`. Chưa chọn → không có entry trong `FormData`.
- **`required`**: chưa chọn → `validity.valueMissing`, thông báo `Vui lòng chọn một tùy chọn`.
- **Reset** (`form.reset()` / `<button type="reset">`): khôi phục attribute `value` ban đầu (lúc kết nối DOM), xoá lỗi
  `setError`.
- **`<fieldset disabled>`**: tự vô hiệu, không đổi attribute `disabled` của bạn, không bị gửi.
- **Khôi phục trạng thái** (bfcache/autofill): chọn lại theo giá trị.
- **Label ngoài**: `<label for="city">` (id của host) hoạt động; bấm label → focus trigger.
- **Error contract**: `error-text` / `setError(msg)` → `aria-invalid="true"`, `aria-errormessage`, `aria-describedby` trên
  trigger + `<span class="td-field-error">` sau khối dropdown. Lỗi hiển thị **không** thay đổi `validity`; muốn chặn
  submit hãy dùng `setCustomValidity()` hoặc [TdFormValidation](form-validation.md).

Chi tiết chung về form: [Hướng dẫn form](../guides/forms.md).

## Tuỳ biến giao diện

Token riêng của dropdown (khai báo trong `@layer td.tokens`, file `components/dropdown.css`):

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-dropdown-option-h` | `40px` | Chiều cao tối thiểu một option. **Lưu ý:** JS tính `max-height` của danh sách theo 40px/option, đổi token không đổi phép tính này. |
| `--td-dropdown-option-hover` | `var(--td-color-hover)` | Nền option khi hover chuột. |
| `--td-dropdown-option-active` | `var(--td-color-hover-strong)` | Nền option đang active (bàn phím). |
| `--td-dropdown-option-active-line` | `var(--td-control-border-hover)` | Viền trong (inset) của option active. |
| `--td-dropdown-option-selected` | `var(--td-color-hover-strong)` | Nền option đã chọn. |
| `--td-dropdown-search-bg` | `var(--td-color-hover)` (dark: `rgb(255 255 255 / 6%)`) | Nền ô tìm kiếm. |
| `--td-dropdown-search-border` | `var(--td-control-border-soft)` | Viền ô tìm kiếm. |
| `--td-dropdown-hairline` | `var(--td-color-border)` | Đường kẻ dưới ô tìm kiếm. |

Nút trigger dùng chung token field (`field.css`): `--td-field-bg`, `--td-field-fg`, `--td-field-border`,
`--td-field-border-hover`, `--td-field-focus`, `--td-field-error`, `--td-field-placeholder`, `--td-field-radius-md`,
`--td-field-h-md`, `--td-field-bg-disabled`, `--td-field-fg-disabled`, `--td-field-label`, `--td-field-note`. Menu là
glass mạnh (`.td-glass-surface--strong`) dùng `--td-glass-pad`, `--td-glass-radius`, `--td-glass-radius-inner`, và nằm
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
      <span class="td-dropdown__arrow" data-td-icon="down" aria-hidden="true"><svg …></svg></span>
    </button>
  </div>
  <span class="td-field-error" id="{host}-error" data-for="{host}">…</span>   <!-- chỉ khi có lỗi -->
</td-dropdown>

<!-- Con trực tiếp của <body>, tồn tại suốt khi host còn trong DOM -->
<div class="td-dropdown__menu td-glass-surface td-glass-surface--strong" id="{host}-menu" hidden
     data-state="closed|open" data-placement="bottom|top">
  <div class="td-dropdown__search-wrap">
    <input type="text" class="td-dropdown__search" aria-label="Tìm kiếm" placeholder="Tìm kiếm..."
           aria-autocomplete="list" aria-controls="{host}-listbox">
  </div>
  <div class="td-dropdown__options" role="listbox" id="{host}-listbox" aria-labelledby="{host}-label">
    <div class="td-dropdown__option td-dropdown__option--clear" role="option" id="{host}-opt-clear"
         aria-selected="false" data-value="__CLEAR__"><span class="td-dropdown__option-label">Không chọn</span></div>
    <div class="td-dropdown__option" role="option" id="{host}-opt-0" aria-selected="true" data-value="hn"
         data-index="0" [data-active]>
      <span class="td-dropdown__option-label">Hà Nội</span>
      <span class="td-dropdown__check" data-td-icon="check" aria-hidden="true">…</span>
    </div>
  </div>
  <p class="td-dropdown__empty" role="status">Không tìm thấy kết quả</p>
</div>
```

Trạng thái dùng để style (không có class JS bật/tắt):

| Ở đâu | Attribute trạng thái |
|---|---|
| `.td-dropdown` | `data-state="open|closed"` |
| `.td-dropdown__trigger` | `aria-expanded`, `:disabled`, `aria-invalid="true"` |
| `.td-dropdown__value` | `data-placeholder` khi chưa chọn |
| `.td-dropdown__menu` | `[hidden]`, `data-state`, `data-placement="top|bottom"` |
| `.td-dropdown__option` | `aria-selected="true"` (đã chọn), `data-active` (đang trỏ bằng phím/chuột) |

JS chỉ ghi toạ độ/độ rộng menu và `max-height` danh sách qua CSSOM. Host không có `id` sẽ được gán tự động
(`td-td-dropdown-N`).

## Bàn phím & trợ năng

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
| `ArrowDown` / `ArrowUp` | Di chuyển active (vòng quanh; dòng "Không chọn" nằm trong vòng). |
| `Home` / `End` | Mục đầu / cuối (chỉ khi focus ở trigger; trong ô tìm kiếm là di con trỏ chữ). |
| `PageDown` / `PageUp` | Nhảy `max-height` mục. |
| `Enter` | Chọn mục active (cả khi đang gõ trong ô tìm kiếm). |
| `Alt+ArrowUp` | Chọn mục active (không có thì đóng). |
| `Space` | Trên trigger: chọn mục active (đang type-ahead thì là ký tự). Trong ô tìm kiếm: gõ dấu cách. |
| Ký tự in được (trigger) | Type-ahead: không phân biệt hoa thường và **dấu** ("ha" khớp "Hà Nội"), gõ lặp một chữ để xoay vòng, bộ đệm xoá sau 500 ms. |
| `Escape` | Đóng, focus về trigger. Phím bị "tiêu thụ" — modal phía dưới không bị đóng theo. |
| `Tab` | Từ ô tìm kiếm: đóng và quay về trigger. Từ trigger: đóng và để Tab đi tiếp (bẫy focus của modal vẫn hoạt động). Tab không bao giờ chọn. |

Khác:

- Trên màn hình rộng ≥ 768px, mở menu có ô tìm kiếm sẽ focus ô tìm kiếm sau 100 ms; trên điện thoại thì không (tránh
  bàn phím ảo che danh sách).
- Bấm chuột ra ngoài (`pointerdown`) đóng menu. Cuộn trong danh sách không đóng. Trigger bị cuộn khuất khỏi màn hình →
  menu tự đóng. Mở một dropdown sẽ đóng dropdown khác.
- Menu đăng ký lớp nổi `LAYERS.popover` nên dùng được bên trong [modal](modal.md) (không bị `inert` của modal chặn).
- Tên truy cập theo thứ tự: `label` nội bộ → `aria-label` của host → `<label for="{host-id}">` bên ngoài. Listbox lấy
  cùng tên.
- Ô "Không tìm thấy kết quả" là `role="status"` nằm ngoài listbox.
- Touch (`pointer: coarse`): trigger, ô tìm kiếm và option cao tối thiểu `--td-touch-min` (44px); ô tìm kiếm ≥ 16px chữ
  để iOS không zoom.
- `prefers-reduced-motion`: menu chỉ mờ dần, không phóng to. `forced-colors`: có viền/outline hệ thống.

Chi tiết: [Trợ năng](../guides/accessibility.md).

## Bảo mật

- `label`, `placeholder`, label và value của mọi option đều được **escape** trước khi render — chuỗi `<img onerror>`
  trong dữ liệu hiển thị thành chữ. Không có đường render HTML tuỳ ý trong option.
- Id nội bộ (`{host}-opt-{i}`) sinh từ chỉ số, không từ dữ liệu.

Xem [Bảo mật](../guides/security.md).

## Lưu ý & lỗi thường gặp

- **Chỉ gán `options` bằng JS.** Viết `<td-dropdown options='[…]'>` không có tác dụng.
- **`el.value` không phải lựa chọn hiện tại.** Nó là attribute `value` (giá trị ban đầu). Người dùng chọn không cập nhật
  attribute. Đọc lựa chọn bằng `getValue()` hoặc `e.detail.value`.
- **Gán lại `options` sẽ áp lại attribute `value`.** Nếu thẻ có `value="hn"`, người dùng chọn "sg", rồi bạn gán
  `dd.options = …` lần nữa, lựa chọn quay về "hn". Muốn thay dữ liệu mà giữ lựa chọn của người dùng, dùng
  `updateData(list)`.
- **`updateData()` không tự bỏ lựa chọn cũ** nếu mục đó không còn trong danh sách mới (trigger vẫn hiện chữ cũ, form vẫn
  gửi giá trị cũ). Gọi `setValue(null)` trước nếu cần (xem ví dụ Tỉnh → Quận).
- **Tìm kiếm trong menu phân biệt dấu**: lọc là "chứa chuỗi" không phân biệt hoa thường nhưng **có** phân biệt dấu
  ("ha noi" không khớp "Hà Nội"). Type-ahead trên trigger thì bỏ qua dấu.
- **`onChange` và `onSelect` không chạy cùng lúc**: đặt cả hai thì chỉ `onChange` chạy. Dùng event `change` nếu cần
  nhiều nơi nghe.
- **Chữ giao diện là tiếng Việt cố định** ("Chọn một tùy chọn", "Tìm kiếm", "Không chọn", "Không tìm thấy kết quả",
  thông báo `required`). Chỉ `placeholder` đổi được qua attribute; dropdown không có bảng `labels` tĩnh như chip-input
  hay datetime-picker.
- **Menu nằm ở `<body>`**, không nằm trong host: selector kiểu `#city .td-dropdown__option` sẽ không khớp; dùng
  `#city-menu .td-dropdown__option`.
- Không có sự kiện `open`/`close`; theo dõi `data-state` hoặc `aria-expanded` nếu cần.

## Xem thêm

- [Chip input](chip-input.md) — chọn nhiều, tìm từ server
- [Form validation](form-validation.md) — kiểm tra form và lỗi server
- [Hướng dẫn form](../guides/forms.md) · [Hook & callback](../customization/hooks.md) ·
  [Theming](../customization/theming.md) · [Trợ năng](../guides/accessibility.md)
