[Tài liệu](../README.md) › [Components](README.md) › Chip input

# Chip input — `<td-chip-input>`

Ô nhập thu thập **nhiều** mục, mỗi mục hiện thành một "chip" có nút xoá. Người dùng gõ để lọc gợi ý (từ danh sách có
sẵn hoặc từ API), chọn bằng chuột/bàn phím, hoặc tạo mục mới từ chữ đã gõ. Dùng cho thẻ (tags), tác giả, người nhận,
từ khoá…

Không dùng khi: chỉ chọn **một** giá trị từ danh sách cố định → [`<td-dropdown>`](dropdown.md); nhập một chuỗi tự do →
[`<td-input-field>`](input-field.md).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/chip-input'` (class: `import { TdChipInput } from '@dazzxq/td-components/chip-input'`; hàm tiện ích: `import { parseChipItems } from '@dazzxq/td-components/chip-input'`) |
| Loại | Custom element |
| Form-associated | có (`ElementInternals`), gửi **nhiều** entry cùng tên |
| Từ phiên bản | 0.12.0 |

**`parseChipItems(str)`** (named export): parse chuỗi giống attribute `value` — trả `[]` khi `str` là `null`/`''`,
**mảng** khi `str` là JSON array (phần tử giữ nguyên: string, number hoặc object `{ value, label }`, chưa được chuẩn
hoá), `null` khi không phải JSON hợp lệ hoặc không phải mảng (component dùng `null` để bỏ qua + cảnh báo). Hữu ích để
kiểm tra chuỗi từ server trước khi gán:

```js
import { parseChipItems } from '@dazzxq/td-components/chip-input';
const items = parseChipItems(serverValue);
if (items === null) console.warn('value không phải JSON array');
```

## Ví dụ nhanh

```html
<form id="f">
  <td-chip-input id="tags" name="tags[]" label="Thẻ" placeholder="Nhập thẻ…" allow-create
                 value='["php","laravel"]'></td-chip-input>
  <button type="submit">Lưu</button>
</form>
```

```js
import '@dazzxq/td-components/chip-input';

const tags = document.getElementById('tags');
tags.options = ['php', 'laravel', 'javascript', 'wordpress', 'mysql'];
tags.addEventListener('change', (e) => {
  console.log(e.detail.items);            // [{ value: 'php', label: 'php' }, …]
  console.log(e.detail.added, e.detail.removed);
});
// Khi submit: FormData có tags[]=php, tags[]=laravel, … (PHP nhận $_POST['tags'] là mảng)
```

## Cách dùng

### 1. Định dạng một "mục" (item)

Ở mọi nơi (attribute `value`, `options`, kết quả `search`, `create`, `setValue`, `addItem`), một mục có thể là:

- **chuỗi hoặc số** → tự đổi thành `{ value: 'x', label: 'x' }`;
- **object** có `value` khác rỗng (không phải object): `{ value: '7', label: 'Nguyễn A', description: 'Biên tập viên' }`.
  `label` thiếu/rỗng → dùng `value` làm chữ hiển thị. `description` (tuỳ chọn) hiện thành dòng phụ trong gợi ý.

Mục không hợp lệ (null, object không có value…) bị bỏ qua. Trùng lặp được loại **theo value** (so chuỗi). Key có thể đổi
bằng `value-key` / `label-key`:

```html
<td-chip-input name="author_ids[]" label="Tác giả" value-key="id" label-key="name"></td-chip-input>
```

### 2. Giá trị ban đầu (`value` là JSON)

Attribute `value` phải là **mảng JSON** (chuỗi, số hoặc object). Sai JSON / không phải mảng → bị bỏ qua và in **một**
cảnh báo console.

```html
<td-chip-input name="tags[]" value='["php", {"value": "js", "label": "JavaScript"}]'></td-chip-input>
```

Render từ PHP:

```php
<td-chip-input name="tags[]" label="Thẻ"
  value="<?= htmlspecialchars(json_encode(array_map(
      fn ($t) => ['value' => (string) $t['id'], 'label' => $t['name']], $post['tags']
  )), ENT_QUOTES) ?>"></td-chip-input>
```

Giá trị này cũng là **giá trị khôi phục khi form reset**.

### 3. Gợi ý từ danh sách có sẵn (`options`)

```js
tags.options = [
  { value: 'php', label: 'PHP' },
  { value: 'js', label: 'JavaScript', description: 'Ngôn ngữ web' },
];
```

Lọc cục bộ: "chứa chuỗi", **không phân biệt hoa thường và dấu** ("ha noi" khớp "Hà Nội", "da" khớp "Đà"). Mục đã chọn
không hiện lại trong gợi ý. Không có giới hạn số gợi ý (danh sách cuộn sau 8 dòng).

### 4. Gợi ý từ server (`search`)

Gán một hàm `search(query, { signal })` trả về mảng mục (hoặc Promise của mảng). Khi có `search`, `options` bị bỏ qua.

```js
const authors = document.querySelector('td-chip-input[name="author_ids[]"]');
authors.search = async (query, { signal }) => {
  const res = await fetch(`/api/authors?q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();                     // [{ id: 7, name: 'Nguyễn A', role: '…' }]
  return rows.map((r) => ({ value: String(r.id), label: r.name, description: r.role }));
};
authors.addEventListener('search-error', (e) => console.warn('Tìm lỗi', e.detail.query, e.detail.error));
```

Component tự lo phần khó:

- **Debounce**: chỉ gọi `search` sau khi ngừng gõ `search-delay` ms (mặc định 250). Lọc cục bộ thì chạy ngay.
- **Huỷ yêu cầu cũ**: mỗi lần tìm có `AbortController` riêng; gõ tiếp → yêu cầu trước bị `abort()`. Truyền `signal` vào
  `fetch` để trình duyệt thực sự huỷ request.
- **Chống phản hồi cũ**: mỗi lần tìm có số thứ tự; phản hồi đến muộn (kể cả khi hàm của bạn bỏ qua `signal`) hoặc đến
  sau khi người dùng đã chọn / đóng / rời ô đều bị **bỏ**, không bao giờ mở lại popup.
- **Trạng thái**: chậm hơn 400 ms → hiện "Đang tìm…"; không có kết quả → "Không có gợi ý"; hàm `throw`/reject → hiện
  "Không tải được gợi ý" (dòng đỏ), thông báo cho trình đọc màn hình và phát `search-error`. Lỗi `AbortError` (do huỷ)
  không bị báo.
- `min-chars` (mặc định 1): gõ ít hơn thì không tìm và đóng popup.
- Kết quả trả về không phải mảng → coi như rỗng.

### 5. Hiện gợi ý ngay khi focus (`show-on-focus`)

```html
<td-chip-input name="tags[]" label="Thẻ" show-on-focus min-chars="2"></td-chip-input>
```

Khi focus đi vào ô từ bên ngoài (không tính khi quay lại từ một chip), component chạy tìm ngay: với chữ đang có nếu đủ
`min-chars`, còn không thì với **chuỗi rỗng** (`search('')` hoặc toàn bộ `options`) — kể cả khi `min-chars` > 0. Không
chạy khi disabled hoặc đã đủ `max-items`. Với `search`, hãy xử lý `query === ''` (ví dụ trả "hay dùng gần đây"). Kết quả rỗng với chuỗi rỗng →
không mở popup.

### 6. Tạo mục mới (`allow-create`, `create`)

Có `allow-create`: khi chữ đã gõ không trùng (không phân biệt dấu) với gợi ý nào hay mục đã chọn nào, cuối danh sách có
dòng `Thêm “{text}”`; `Enter` không có gợi ý active cũng tạo mục. Mặc định mục mới là `{ value: text, label: text }`
(chữ đã gộp khoảng trắng, cắt theo `max-length`).

Muốn lưu lên server trước (lấy id thật), gán `create`:

```js
authors.create = async (text) => {
  const res = await fetch('/api/authors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: text }),
  });
  if (!res.ok) {
    authors.setError('Không tạo được tác giả');
    return null;                                   // null = từ chối, chữ vẫn giữ trong ô
  }
  const row = await res.json();
  return { value: String(row.id), label: row.name };
};
```

- Trả object (hoặc Promise object) → thêm như người dùng chọn (phát `change`).
- Trả `null` / `undefined` → không thêm gì. `throw` → ghi `console.error`, coi như `null`.
- Trong lúc `create` đang chạy, lần tạo khác bị bỏ qua. `setValue()`, reset form hoặc gỡ phần tử trong lúc chờ → kết
  quả bị huỷ. Người dùng gõ tiếp trong lúc chờ → mục vẫn được thêm nhưng chữ mới không bị xoá.

### 7. Giới hạn số mục (`max-items`)

```html
<td-chip-input name="tags[]" label="Tối đa 3 thẻ" max-items="3"></td-chip-input>
```

Khi đủ: không mở gợi ý, không thêm được (kể cả qua `addItem`), thông báo `Đã đạt tối đa 3 mục` cho trình đọc màn hình.
Ô nhập **vẫn focus được** (để xoá chip), placeholder bị ẩn, gốc có `data-full`.

### 8. Tuỳ biến nội dung option / chip (`renderOption`, `renderChip`)

Hai hook này trả về **một Node** (tự dựng bằng DOM API) **hoặc một chuỗi** — chuỗi luôn được hiển thị dạng **văn bản**,
không bao giờ là HTML.

```js
authors.renderOption = (item, { query }) => {
  const wrap = document.createElement('span');
  const name = document.createElement('strong');
  name.textContent = item.label;
  const role = document.createElement('small');
  role.className = 'td-chip-input__option-desc';
  role.textContent = item.description || '';
  wrap.append(name, document.createTextNode(' · '), role);
  return wrap;
};

authors.renderChip = (item) => `@${item.label}`;   // chuỗi → text
```

- Hook trả `null`, `''` hoặc ném lỗi → dùng label mặc định (lỗi được `console.error`).
- Khi có `renderOption`, dòng `description` tự động **không** hiện nữa (bạn tự hiển thị nếu muốn).
- Nút xoá của chip vẫn dùng label gốc cho `aria-label` (`Xóa {label}`).
- Gán `renderChip` sau khi render sẽ vẽ lại các chip ngay.

### 9. Thao tác bằng code (im lặng)

```js
tags.getValue();                 // [{ value, label, … }] (bản sao)
tags.setValue(['a', 'b']);       // thay toàn bộ
tags.addItem({ value: 'c', label: 'C' });   // true / false
tags.removeItem('a');            // true / false
tags.clear();
tags.value = '["x","y"]';        // property value nhận mảng hoặc chuỗi JSON
```

Các thao tác này **không** phát `change` và **không** thông báo cho trình đọc màn hình.

### 10. Gán property trước khi component được định nghĩa

Có thể gán `options`, `search`, `create`, `renderOption`, `renderChip`, `messages`, `value` lên phần tử **trước** khi
import module (ví dụ script không phải module chạy trước). Khi phần tử nâng cấp, các giá trị này được áp lại qua setter.

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `name` | string | — | Tên field; mỗi mục gửi một entry. Dùng `name="tags[]"` cho PHP. |
| `value` | JSON array | — | Mục ban đầu + giá trị khôi phục khi reset. Đổi attribute sau khi render → `setValue()` (im lặng). |
| `label` | string | — | Nhãn hiển thị; đặt tên cho ô nhập, listbox và danh sách chip. |
| `aria-label` | string | — | Tên truy cập khi không có `label`. |
| `placeholder` | string | — | Placeholder của ô nhập (không bao giờ dùng làm tên truy cập). |
| `required` | boolean | `false` | Cần ít nhất 1 mục (`valueMissing`), `aria-required`, dấu `*`. |
| `disabled` | boolean | `false` | Vô hiệu ô nhập và nút xoá chip (cũng qua `<fieldset disabled>`). |
| `error-text` | string | — | Thông báo lỗi hiển thị (error contract). |
| `max-items` | number | không giới hạn | Số mục tối đa (≥ 1). |
| `min-chars` | number | `1` | Số ký tự tối thiểu trước khi tìm (≥ 0). |
| `search-delay` | number (ms) | `250` | Debounce cho `search` (không áp dụng khi lọc `options`). |
| `allow-create` | boolean | `false` | Cho phép tạo mục từ chữ đã gõ. |
| `show-on-focus` | boolean | `false` | Tìm với chuỗi rỗng khi focus vào ô. |
| `value-key` | string | `value` | Key giá trị trong object mục. |
| `label-key` | string | `label` | Key chữ hiển thị. |
| `max-length` | number | `200` | Độ dài tối đa chữ gõ / mục tạo mới (`maxlength` của ô). |

Tất cả được cập nhật tại chỗ (giữ focus, giữ chữ đang gõ); riêng `label` render lại cấu trúc nhưng vẫn giữ chữ và vị trí
focus.

## Property & method

| Thành viên | Chữ ký | Mô tả |
|---|---|---|
| `value` | `Array` (get) / `Array \| string` (set) | Get = `getValue()`. Set nhận mảng hoặc chuỗi JSON (im lặng). |
| `options` | `Array` | Gợi ý cục bộ (khi không có `search`). Gán khi popup đang mở → lọc lại ngay. |
| `search` | `(query: string, ctx: { signal: AbortSignal }) => Array \| Promise<Array>` \| `null` | Nhà cung cấp gợi ý bất đồng bộ. |
| `create` | `(text: string) => Object \| null \| Promise<Object \| null>` \| `null` | Dựng mục từ chữ gõ. |
| `renderOption` | `(item, { query }) => Node \| string` \| `null` | Nội dung một gợi ý. |
| `renderChip` | `(item) => Node \| string` \| `null` | Nội dung một chip. |
| `messages` | `Object \| null` | Ghi đè `TdChipInput.labels` cho **riêng** phần tử này (xem [Hook](#hook--tuỳ-chọn)). |
| `lastResults` | `Array` (read-only) | Các mục đã chuẩn hoá của lần tìm gần nhất (bao gồm cả mục đã chọn). |
| `getValue()` | `() => Object[]` | Bản sao danh sách mục. |
| `setValue(items)` | `(Array) => void` | Thay toàn bộ (chuẩn hoá, bỏ trùng). Im lặng. |
| `addItem(item)` | `(Object \| string) => boolean` | Thêm 1 mục. `false` khi không hợp lệ, trùng value, hoặc đã đủ `max-items`. Im lặng. |
| `removeItem(value)` | `(string \| number) => boolean` | Xoá theo value. `false` khi không có. Im lặng. |
| `clear()` | `() => void` | Xoá hết. Im lặng. |
| `open()` | `() => void` | Hiện gợi ý cho chữ hiện tại (chạy tìm nếu cần). |
| `close()` | `() => void` | Đóng popup, huỷ tìm đang chờ/đang chạy. |
| `setError(msg)` / `clearError()` | | Error contract. `errorMessage` (getter). |
| `form`, `validity`, `validationMessage`, `willValidate`, `labels` | read-only | Như control gốc. **`labels` là các `<label>` liên kết**, không phải bảng chữ — dùng `messages`. |
| `checkValidity()`, `reportValidity()`, `setCustomValidity(msg)` | | Như control gốc. |
| `focus()` | | Focus ô nhập. |

Các attribute còn lại có property phản chiếu tự động (`maxItems`, `minChars`, `searchDelay`, `allowCreate`,
`showOnFocus`, `valueKey`, `labelKey`, `maxLength`, `placeholder`, `label`, `name`, `disabled`, `required`, `errorText`).

## Event

| Event | detail | Khi nào | bubbles? |
|---|---|---|---|
| `change` | `{ value, items, added? , removed? }` — `value` và `items` đều là mảng mục hiện tại; `added` là mục vừa thêm **hoặc** `removed` là mục vừa xoá | Người dùng thêm (chọn / tạo) hoặc xoá một chip. API code (`setValue`, `addItem`, …) và reset **không** phát. Sự kiện `change` gốc của ô `<input>` bên trong bị chặn, không lọt ra ngoài. | có |
| `search-error` | `{ query, error }` | Hàm `search` ném lỗi / reject (trừ `AbortError`, trừ phản hồi đã cũ). | có |

## Hook & tuỳ chọn

Tóm tắt các hook đã mô tả ở trên: `search`, `create`, `renderOption`, `renderChip` (xem mục 4, 6, 8) và bảng chữ.

**`TdChipInput.labels`** — chữ mặc định cho cả trang (`{label}`, `{text}`, `{n}`, `{max}` được điền):

| Key | Mặc định | Dùng cho |
|---|---|---|
| `remove` | `Xóa {label}` | `aria-label` nút xoá chip |
| `create` | `Thêm “{text}”` | Dòng tạo mục mới |
| `chips` | `Đã chọn` | Tên danh sách chip khi không có `label` |
| `added` | `Đã thêm {label}` | Thông báo trình đọc màn hình |
| `removed` | `Đã xóa {label}` | nt |
| `duplicate` | `Đã có {label}` | nt, khi thêm trùng |
| `results` | `{n} gợi ý` | nt, sau khi có kết quả |
| `noResults` | `Không có gợi ý` | Dòng trống + thông báo |
| `loading` | `Đang tìm…` | Dòng đang tải + thông báo |
| `error` | `Không tải được gợi ý` | Dòng lỗi + thông báo |
| `max` | `Đã đạt tối đa {max} mục` | Thông báo khi đủ `max-items` |
| `required` | `Vui lòng thêm ít nhất một mục` | `validationMessage` khi `required` mà trống |

```js
import { TdChipInput } from '@dazzxq/td-components/chip-input';

// Cả trang
TdChipInput.labels.noResults = 'Chưa có thẻ phù hợp';

// Riêng một phần tử (chỉ các key bạn đặt; key khác lấy từ TdChipInput.labels)
document.getElementById('tags').messages = { create: 'Tạo thẻ “{text}”', required: 'Cần ít nhất một thẻ' };
```

Tất cả chữ là **văn bản thuần**.

## Form

- **Giá trị gửi**: mỗi mục một entry `name=value` (theo thứ tự chip). Không có `name` hoặc không có mục → không gửi gì.
  Với PHP đặt `name="tags[]"` để nhận mảng; `name="tags"` sẽ chỉ còn giá trị cuối trong `$_POST`.
- Chỉ **value** được gửi, không gửi label. Server cần label thì tự tra theo value.
- **`required`** + không có mục → `valueMissing` (`labels.required`).
- **Reset**: xoá chữ đang gõ, đóng popup, khôi phục mục từ attribute `value` ban đầu, xoá lỗi `setError`.
- **Khôi phục trạng thái** (bfcache/autofill): lưu JSON `[{value,label}]`, áp lại khi quay lại trang.
- **Error contract**: `error-text` / `setError()` → `aria-invalid` + `aria-errormessage` + `aria-describedby` trên ô nhập,
  viền đỏ cho cả khung, `<span class="td-field-error">` sau khối.

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-chip-bg` | `var(--td-color-hover-strong)` (dark: `rgb(255 255 255 / 14%)`) | Nền chip |
| `--td-chip-fg` | `var(--td-color-text)` | Chữ chip |
| `--td-chip-radius` | `var(--td-radius-full)` | Bo góc chip (viên thuốc) |
| `--td-chip-h` | `28px` | Chiều cao chip và ô nhập |
| `--td-chip-gap` | `6px` | Khoảng cách giữa các chip |
| `--td-chip-remove-size` | `22px` | Kích thước nút xoá |
| `--td-chip-remove-hover` | `var(--td-color-hover-strong)` (dark: `rgb(255 255 255 / 16%)`) | Nền nút xoá khi hover |
| `--td-chip-input-min-w` | `8rem` | Độ rộng tối thiểu ô nhập trước khi xuống dòng |

Khung dùng token field (`--td-field-bg`, `--td-field-border`, `--td-field-border-hover`, `--td-field-focus`,
`--td-field-error`, `--td-field-radius-md`, `--td-field-h-md`…). Popup gợi ý dùng chung token option của dropdown:
`--td-dropdown-option-h`, `--td-dropdown-option-hover`, `--td-dropdown-option-active`,
`--td-dropdown-option-active-line` (xem [Dropdown](dropdown.md#tuỳ-biến-giao-diện)), là popup nhỏ (nền 94 % + `blur(12px)` + viền mảnh + một bóng mềm, 0.20.0) ở `--td-z-popover`.

```css
:root {
  --td-chip-bg: #e0ecff;
  --td-chip-radius: 6px;
}
```

Popup nằm ở `<body>`: nhắm riêng bằng id `#{host}-menu`.

## Cấu trúc DOM & class

```html
<td-chip-input id="{host}">
  <div class="td-chip-input" data-state="closed|open" [data-full] [data-empty]>
    <label class="td-field__label" id="{host}-label" for="{host}-input">Thẻ<span class="td-field__required" aria-hidden="true"> *</span></label>
    <div class="td-chip-input__box">
      <ul class="td-chip-input__chips" aria-labelledby="{host}-label" [hidden]>   <!-- hoặc aria-label="Đã chọn" -->
        <li class="td-chip-input__chip" data-index="0">
          <span class="td-chip-input__chip-label">php</span>
          <button type="button" class="td-chip-input__remove" tabindex="-1" aria-label="Xóa php">
            <span data-td-icon="close" data-td-icon-size="s" aria-hidden="true"><svg class="td-icon td-icon--s" data-icon="close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></span>
          </button>
        </li>
      </ul>
      <input type="text" class="td-chip-input__input" id="{host}-input" role="combobox" aria-autocomplete="list"
             aria-expanded="false" aria-controls="{host}-listbox" [aria-activedescendant]
             autocomplete="off" spellcheck="false" maxlength="200">
    </div>
    <p class="td-sr-only" id="{host}-status" role="status"></p>   <!-- vùng thông báo duy nhất -->
  </div>
  <span class="td-field-error" id="{host}-error" data-for="{host}">…</span>   <!-- chỉ khi có lỗi -->
</td-chip-input>

<!-- Con trực tiếp của <body> -->
<div class="td-chip-input__menu td-glass-surface td-glass-surface--strong" id="{host}-menu" hidden
     data-state="closed|open" data-placement="bottom|top">
  <div class="td-chip-input__options" role="listbox" id="{host}-listbox" aria-labelledby="{host}-label">
    <div class="td-chip-input__option" role="option" id="{host}-opt-0" aria-selected="true|false" data-index="0">
      <span class="td-chip-input__option-label">JavaScript</span>
      <span class="td-chip-input__option-desc">Ngôn ngữ web</span>
    </div>
    <div class="td-chip-input__option td-chip-input__option--create" role="option" id="{host}-opt-create"
         aria-selected="false">Thêm “vue”</div>
  </div>
  <p class="td-chip-input__empty" [data-kind="none|loading|error"]>…</p>
</div>
```

| Ở đâu | Trạng thái |
|---|---|
| `.td-chip-input` | `data-state`, `data-full` (đủ `max-items`), `data-empty` (chưa có mục) |
| `.td-chip-input__box` | style qua `:has(.td-chip-input__input:focus-visible / :disabled / [aria-invalid="true"])` |
| `.td-chip-input__chips` | `[hidden]` khi rỗng |
| `.td-chip-input__menu` | `[hidden]`, `data-state`, `data-placement` |
| `.td-chip-input__option` | `aria-selected="true"` = option **đang active** (không phải "đã chọn" — mục đã chọn không hiện trong gợi ý) |
| `.td-chip-input__empty` | `data-kind="none|loading|error"` |

## Bàn phím & trợ năng

Mẫu APG **editable combobox** (list autocomplete). Toàn bộ component là **một** điểm Tab (ô nhập); nút xoá chip có
`tabindex="-1"` và di chuyển bằng phím mũi tên (roving focus). Khi chọn gợi ý, focus DOM không rời ô nhập.

**Trong ô nhập**

| Phím | Hành động |
|---|---|
| `ArrowDown` | Popup đóng: mở (dùng kết quả đã có hoặc chạy tìm) với option đầu active. Popup mở: xuống (vòng). |
| `ArrowUp` | Popup đóng: mở với option cuối active. Popup mở: lên (vòng). |
| `Alt+ArrowDown` / `Alt+ArrowUp` | Mở mà không chọn option active. |
| `Enter` | Có option active → chọn/tạo. Không có → chữ khớp **chính xác** (không phân biệt dấu) một gợi ý thì chọn nó; không thì tạo mới (nếu `allow-create`). Ô trống → hành vi gốc (submit form). |
| `Escape` | Popup mở: đóng (giữ chữ). Popup đóng: xoá chữ. |
| `Tab` | Đóng popup và đi tiếp (không chọn). |
| `Backspace` / `ArrowLeft` ở đầu ô (con trỏ vị trí 0) | Chuyển focus tới nút xoá của chip cuối (không xoá). |

**Trên nút xoá chip**

| Phím | Hành động |
|---|---|
| `ArrowLeft` / `ArrowRight` | Chip trước / sau; `ArrowRight` ở chip cuối → về ô nhập |
| `Home` / `End` | Chip đầu / cuối |
| `Delete` / `Backspace` / `Enter` / `Space` | Xoá chip này; focus sang chip kế tiếp, không có thì chip trước, không có thì ô nhập |
| `Escape` | Về ô nhập |

Khác:

- Thông báo (đã thêm / đã xoá / trùng / đủ / số gợi ý / đang tìm / lỗi) đi qua **một** vùng `role="status"` duy nhất.
  Số gợi ý được đọc sau khi ngừng gõ 500 ms.
- Popup đăng ký lớp nổi `LAYERS.popover`: dùng được trong [modal](modal.md); `Escape` chỉ đóng popup, không đóng modal.
- Bấm ra ngoài (`pointerdown`) hoặc focus rời component → đóng popup và huỷ tìm đang chạy. Khung bị cuộn khuất → đóng.
- Bấm vào vùng trống của khung → focus ô nhập.
- IME (gõ tiếng Việt bằng bộ gõ có composition): `Enter` khi đang ghép chữ không chọn option.
- Tên truy cập: `label` → `aria-label` host → `<label for="{host-id}">`. Placeholder không bao giờ là tên.
- Touch: chip, nút xoá, option cao ≥ 44px; ô nhập ≥ 16px chữ.

## Bảo mật

- Label, description, chữ người dùng gõ, kết quả từ server và mọi chuỗi `labels` / `messages` đều được đưa vào DOM bằng
  `textContent` / `setAttribute` — **không có** đường render HTML.
- `renderOption` / `renderChip` chỉ nhận **Node** hoặc **chuỗi (hiển thị dạng text)**. Nếu cần định dạng, tự dựng Node
  bằng `document.createElement` + `textContent`; đừng dùng `innerHTML` với dữ liệu từ server trong hook.
- Id option sinh từ chỉ số, không từ dữ liệu.
- Hàm `search` là code của bạn: nhớ `encodeURIComponent(query)` khi ghép URL.

Xem [Bảo mật](../guides/security.md).

## Lưu ý & lỗi thường gặp

- **Quên `[]` trong `name`** khi gửi về PHP → chỉ nhận được mục cuối.
- **`value` không phải JSON hợp lệ** (dấu nháy đơn trong JSON, thiếu ngoặc) → bị bỏ qua kèm cảnh báo. Trong HTML hãy bọc
  attribute bằng nháy đơn và dùng nháy kép trong JSON, hoặc escape bằng `htmlspecialchars(json_encode(...))`.
- **Value là chuỗi**: số `7` được so và gửi như `"7"`. Trùng lặp so theo chuỗi value (chính xác); riêng khi **tạo mới**
  thì so không phân biệt dấu/hoa thường với cả value lẫn label.
- **Có `search` thì `options` bị bỏ qua** (kể cả khi Enter tìm khớp chính xác: chỉ xét gợi ý đang hiển thị).
- **`search` nên tôn trọng `signal`** để không tốn request thừa; dù không, phản hồi cũ cũng không hiển thị.
- **Gán `el.value` một chuỗi JSON sai** (hoặc `null`) sẽ **xoá hết** mục, không cảnh báo (khác attribute `value`, vốn bị
  bỏ qua kèm cảnh báo). Kiểm tra dữ liệu trước khi gán.
- **`change` chỉ đến từ người dùng.** Đồng bộ UI khác sau `setValue()` thì tự gọi.
- `labels` trên phần tử là danh sách `<label>` của form control; chữ tuỳ biến theo phần tử đặt qua `messages`.
- Không kéo-thả sắp xếp chip, không sửa chip tại chỗ.

## Xem thêm

- [Dropdown](dropdown.md) · [Form validation](form-validation.md) · [Hướng dẫn form](../guides/forms.md)
- [Hook & callback](../customization/hooks.md) · [Theming](../customization/theming.md) ·
  [Trợ năng](../guides/accessibility.md) · [Bảo mật](../guides/security.md)
