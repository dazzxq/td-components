[Tài liệu](../README.md) › [Components](README.md) › Input field

# Input field — `<td-input-field>`

Ô nhập liệu đa dạng: text, mật khẩu, email, số, URL, ngày, tháng, ngày-giờ, giờ, textarea (có thể tự giãn) và vùng soạn thảo
`contenteditable`, kèm nhãn, dòng gợi ý, thông báo lỗi và bộ đếm ký tự/từ. Nó tham gia `<form>` như một control
native. Dùng [dropdown](dropdown.md) khi người dùng chọn từ danh sách, [datetime-picker](datetime-picker.md) khi cần
chọn ngày giờ theo định dạng Việt Nam, [chip-input](chip-input.md) khi nhập nhiều thẻ (tag).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/input-field';` (class: `import { TdInputField } from '@dazzxq/td-components';`) |
| Loại | Custom element |
| Form-associated | có |
| Từ phiên bản | 0.1.0 (form-associated từ 0.2.0, token-native + BEM `.td-field` từ 0.8.0, `autoresize` từ 0.13.0) |

Cần `td.css` trên trang (xem [Cài đặt](../getting-started/installation.md)).

## Ví dụ nhanh

```html
<form id="signup">
  <td-input-field name="email" type="email" label="Email" required
                  helper-text="Chúng tôi không chia sẻ email của bạn"></td-input-field>
  <td-input-field name="bio" type="textarea" label="Giới thiệu" rows="3" max-length="280"></td-input-field>
</form>

<script type="module">
  import '@dazzxq/td-components/input-field';
</script>
```

## Cách dùng

### Các `type`

```html
<td-input-field label="Họ tên"></td-input-field>                        <!-- text (mặc định) -->
<td-input-field type="password" label="Mật khẩu"></td-input-field>
<td-input-field type="email" label="Email"></td-input-field>
<td-input-field type="tel" label="Số điện thoại"></td-input-field>
<td-input-field type="number" label="Số lượng" min="1" max="10" step="1"></td-input-field>
<td-input-field type="url" label="Website"></td-input-field>
<td-input-field type="search" label="Tìm kiếm"></td-input-field>
<td-input-field type="date" label="Ngày sinh" min="1900-01-01"></td-input-field>
<td-input-field type="month" label="Kỳ báo cáo"></td-input-field>
<td-input-field type="datetime-local" label="Chụp lúc" step="1"></td-input-field>
<td-input-field type="time" label="Giờ mở cửa" min="08:00" max="17:00"></td-input-field>
<td-input-field type="textarea" label="Ghi chú" rows="4"></td-input-field>
<td-input-field type="contenteditable" label="Nội dung" placeholder="Viết gì đó…"></td-input-field>
```

Cách từng `type` được render bên trong (quan trọng khi bạn style hoặc đọc DOM):

| `type` | Control bên trong | Ghi chú |
|---|---|---|
| `text`, `password`, `tel`, `search` | `<input type="…">` cùng loại | Giữ nguyên type native (bàn phím điện thoại tự đúng). |
| `email`, `url`, `number` | `<input type="text">` + `inputmode` (`email` / `url` / `decimal`) | Bàn phím điện thoại vẫn đúng loại. Việc kiểm tra định dạng/khoảng do **host** làm (xem [Validation](#validation)). |
| `date` | `<input type="date">` native | Có lịch chọn ngày của trình duyệt; `min`/`max` được chuyển xuống control. Giá trị dạng `YYYY-MM-DD`. |
| `month`, `datetime-local`, `time` | `<input type="…">` native cùng loại | 0.18.0. Bộ chọn của trình duyệt; `min`/`max`/`step` được chuyển xuống control. Giá trị = **đúng `.value` đã chuẩn hoá của control native**, kit không cắt bớt: `YYYY-MM`; `YYYY-MM-DDTHH:mm` (có giây / phần lẻ giây khi `step` cho phép, ví dụ `2024-06-15T10:30:15` hay `…T10:30:15.5`); `HH:mm[:ss[.sss]]`. |
| `textarea` | `<textarea rows="…">` | `rows` mặc định 4. |
| `contenteditable` | `<div contenteditable role="textbox" aria-multiline="true">` | Giá trị là **text thuần** (`innerText`). |

`type` không nằm trong danh sách trên được coi là `text`.

### Nhãn, gợi ý, bắt buộc

```html
<td-input-field label="Mã số thuế" required helper-text="10 hoặc 13 chữ số"></td-input-field>
```

- `label` tạo `<label>` nối với control, nên bấm vào nhãn sẽ focus ô nhập.
- `required` thêm dấu `*` đỏ sau nhãn (có `aria-hidden`, chỉ để nhìn) và `aria-required="true"` trên control.
- `helper-text` hiện dưới ô. Khi có lỗi, **gợi ý vẫn hiện cùng lỗi** (lỗi đứng trên).

Không muốn nhãn hiện ra? Dùng `aria-label`, hoặc một `<label for>` ở ngoài trỏ vào `id` của host:

```html
<label for="q">Tìm sản phẩm</label>
<td-input-field id="q" type="search"></td-input-field>

<td-input-field type="search" aria-label="Tìm sản phẩm"></td-input-field>
```

### Giới hạn ký tự hoặc số từ (bộ đếm)

```html
<td-input-field label="Tiêu đề" max-length="60"></td-input-field>
<td-input-field type="textarea" label="Tóm tắt" max-length="50" limit-type="word"></td-input-field>
```

- Có `max-length` thì hiện bộ đếm `n/max ký tự` (hoặc `n/max từ`) ở góc phải dưới ô.
- `limit-type="char"` (mặc định): control có `maxlength` native, trình duyệt chặn gõ quá.
- `limit-type="word"`: đếm theo từ (tách bằng khoảng trắng). Gõ hoặc dán vượt số từ thì phần thừa bị cắt, con trỏ giữ
  đúng vị trí sau phần chữ còn lại.
- Khi đạt giới hạn, bộ đếm chuyển màu lỗi (`data-state="limit"`) nhưng **viền ô không đỏ** (chưa phải lỗi).
- `setValue()` cũng cắt theo giới hạn. Riêng giá trị ban đầu từ attribute `value` dài hơn giới hạn thì **không** bị
  cắt; khi đó field ở trạng thái `tooLong` (không hợp lệ) cho tới khi sửa.

### Textarea tự giãn (`autoresize`)

```html
<td-input-field type="textarea" label="Bình luận" rows="2" autoresize></td-input-field>
```

- Ô cao tối thiểu bằng `rows` dòng, giãn theo nội dung, tối đa khoảng 16 dòng rồi hiện thanh cuộn.
- Đổi chiều cao tối đa bằng token `--td-field-autoresize-max`:

  ```css
  td-input-field.comment { --td-field-autoresize-max: 10lh; }
  ```

- Dựa vào CSS `field-sizing: content`. Trình duyệt chưa hỗ trợ thì giữ chiều cao cố định theo `rows` (vẫn dùng được,
  chỉ không tự giãn). Kéo tay để đổi cỡ (`resize`) bị tắt khi bật `autoresize`.
- Chỉ áp dụng cho `type="textarea"`.

### Đọc và ghi giá trị

```js
const field = document.querySelector('td-input-field[name="email"]');

field.value;                   // giá trị hiện tại (người dùng đang gõ gì thì trả về đó) — như input native
field.getValue();              // như trên
field.value = 'an@vd.com';     // = setValue(): đặt giá trị, KHÔNG phát input/change
field.setAttribute('value', 'an@vd.com'); // cũng cập nhật ô nhập (attribute = giá trị ban đầu / khi reset)
```

> Từ 0.16.0 property `field.value` là **giá trị sống** (get = `getValue()`, set = `setValue()`), giống `<input>`
> native. Trước 0.16.0 nó trả về attribute `value` (giá trị cũ). Gán `field.value` **không** đổi attribute `value`.

`getValue()` / `setValue()` là method trên prototype nên gọi được cả trước khi phần tử gắn vào trang: `setValue()` lúc
đó lưu vào attribute `value` và được render khi gắn vào.

### Nghe sự kiện

```js
field.addEventListener('input', (e) => {
  console.log('đang gõ:', e.detail.value);
});
field.addEventListener('change', (e) => {
  console.log('đã sửa xong:', e.detail.value); // phát khi rời ô, chỉ khi giá trị khác lúc vào ô
});
```

### Validation

Host tự tính trạng thái hợp lệ như control native, dựa trên giá trị của component (không dựa vào control bên trong):

| Điều kiện | Cờ `validity` | Thông báo (mặc định, tiếng Việt) |
|---|---|---|
| `required` và giá trị rỗng (hoặc chỉ khoảng trắng) | `valueMissing` | `Trường này là bắt buộc` |
| Vượt `max-length` | `tooLong` | `Vượt quá giới hạn {maxLength} ký tự` / `… {maxLength} từ` |
| Ngắn hơn `minlength` (chỉ sau khi **người dùng** sửa, như native; rỗng thì không tính) | `tooShort` | `Tối thiểu {minLength} ký tự` |
| Không khớp `pattern` (khớp **cả** giá trị; `text`/`search`/`tel`/`url`/`email`/`password`; rỗng thì không tính) | `patternMismatch` | `Giá trị không đúng định dạng` |
| `number`: không phải số | `badInput` | `Giá trị không hợp lệ` |
| `email` / `url` sai định dạng | `typeMismatch` | `Email không hợp lệ` / `URL không hợp lệ` |
| `number` < `min` / > `max` | `rangeUnderflow` / `rangeOverflow` | `Giá trị tối thiểu là {min}` / `Giá trị tối đa là {max}` |
| `number` không khớp `step` | `stepMismatch` | `Giá trị không đúng bước nhảy` |
| `date` không phải ngày hợp lệ | `typeMismatch` | `Ngày không hợp lệ` |
| `date` < `min` / > `max` | `rangeUnderflow` / `rangeOverflow` | `Ngày tối thiểu là {min}` / `Ngày tối đa là {max}` |
| `month` / `datetime-local` / `time` < `min` / > `max` | `rangeUnderflow` / `rangeOverflow` | `Giá trị tối thiểu là {min}` / `Giá trị tối đa là {max}` |
| `month` / `datetime-local` / `time` không khớp `step` (mặc định `time`/`datetime-local` bước 60 giây → giá trị có giây là lệch bước; đặt `step="1"` để cho phép giây) | `stepMismatch` | `Giá trị không đúng bước nhảy` |

Mọi thông báo ở bảng trên (và đơn vị `ký tự` / `từ` của bộ đếm) nằm trong `TdInputField.messages` — đổi cho cả
trang, ví dụ `TdInputField.messages.valueMissing = 'This field is required'` (khoá và placeholder: xem
[Dịch nhãn](../customization/extending.md#dịch-nhãn-sang-ngôn-ngữ-khác)).

Field không hợp lệ sẽ chặn submit form (trình duyệt hiện bong bóng thông báo gắn vào ô nhập), giống control native.
`checkValidity()`, `reportValidity()`, `validity`, `validationMessage` dùng được như bình thường.

Mặc định lỗi validation **không** hiện thành dòng chữ đỏ dưới ô. Có hai cách để hiện:

1. `validate-on` — tự hiện thông báo trên thành lỗi:

   ```html
   <td-input-field type="email" label="Email" required validate-on="blur"></td-input-field>
   ```

   `blur` và `change`: kiểm tra khi rời ô. `input`: kiểm tra mỗi lần gõ. Khi hợp lệ trở lại, lỗi tự xoá.

2. Dùng [TdFormValidation](form-validation.md) để kiểm tra cả form khi submit.

### Hiện lỗi từ server (error contract)

```js
// Hiện lỗi (viền đỏ + aria-invalid + dòng chữ lỗi dưới ô)
field.setError('Email này đã được đăng ký');
// Xoá lỗi
field.clearError();           // hoặc field.setError('')
// Đọc lỗi đang hiện
field.errorMessage;           // '' nếu không có
```

```html
<!-- Render sẵn lỗi từ server (PHP…) -->
<td-input-field name="email" type="email" label="Email" value="x" error-text="Email không hợp lệ"></td-input-field>
```

- `setError()` và attribute `error-text` cùng điều khiển một dòng lỗi. Cái nào được đặt **sau cùng** thì thắng: đổi
  `error-text` sau `setError()` sẽ thay lỗi runtime, và ngược lại.
- Error contract chỉ là **hiển thị + trợ năng**, **không chặn submit**. Muốn chặn submit bằng lỗi của bạn, gọi thêm
  `setCustomValidity(msg)` (và `setCustomValidity('')` để gỡ). Xem [Forms](../guides/forms.md).
- Form reset xoá lỗi đang hiện.
- Nếu field có `validate-on`, lần kiểm tra kế tiếp sẽ ghi đè lỗi bạn đặt (ví dụ lỗi server bị xoá khi người dùng rời
  ô và giá trị hợp lệ về mặt định dạng).

### Gợi ý runtime, disabled, read-only

```js
field.setHelper('Đang kiểm tra…');  // thay helper-text; setHelper('') để ẩn
field.setDisabled(true);            // = setAttribute('disabled', '')
field.setReadOnly(true);            // = setAttribute('readonly', '')
```

Như lỗi, `setHelper()` và attribute `helper-text` theo luật "đặt sau cùng thắng".

### Thuộc tính native: autocomplete, bàn phím điện thoại, autofocus (0.17.0)

```html
<td-input-field type="text" name="username" label="Tài khoản" autocomplete="username" autocapitalize="off"
                spellcheck="false" autofocus></td-input-field>
<td-input-field type="password" name="password" label="Mật khẩu" autocomplete="current-password"
                enterkeyhint="go"></td-input-field>
<td-input-field name="otp" label="Mã OTP" inputmode="numeric" autocomplete="one-time-code"></td-input-field>
```

`autocomplete`, `inputmode`, `enterkeyhint`, `autocapitalize`, `spellcheck` đặt trên host được chuyển xuống control
bên trong (`.td-field__control`), nên trình quản lý mật khẩu và bàn phím điện thoại nhận đúng như với `<input>` thường.

- Giá trị theo danh sách trắng của HTML (xem bảng [Attribute](#attribute)); giá trị lạ bị **bỏ** (không chuyển xuống),
  không báo lỗi. Giá trị được chuyển sang chữ thường.
- Đổi / xoá attribute trên host cập nhật control **tại chỗ** (giữ focus, con trỏ); vẫn giữ sau khi render lại.
- `inputmode` tường minh thắng `inputmode` tự suy từ `type` (`email`/`url`/`number` → `email`/`url`/`decimal`); bỏ
  nó thì quay về giá trị tự suy.
- `type="contenteditable"`: nhận `inputmode`, `enterkeyhint`, `autocapitalize`, `spellcheck`; **không** nhận
  `autocomplete` (không phải ô tự điền).
- `autofocus` chỉ chạy **một lần** khi field gắn vào trang lần đầu; không cướp focus nếu đã có phần tử khác (ngoài
  `<body>`) đang được focus, không focus field disabled. Thêm `autofocus` sau đó hoặc render lại không focus lần nữa.

### Trong form

```html
<form id="f">
  <fieldset id="fs">
    <td-input-field name="city" label="Thành phố" value="Hà Nội"></td-input-field>
  </fieldset>
  <td-button type="submit">Gửi</td-button>
  <td-button type="reset" variant="secondary">Nhập lại</td-button>
</form>
```

```js
new FormData(document.getElementById('f')).get('city'); // 'Hà Nội'
document.getElementById('fs').disabled = true;          // field bị disabled, không gửi trong FormData
```

- Giá trị được gửi qua `name` của **host**. Control bên trong **không có `name`** (từ 0.2.0), nên không bị gửi hai lần.
- Reset form: trả về giá trị của attribute `value` lúc ban đầu (không có attribute thì về rỗng) và xoá lỗi.
- `<fieldset disabled>` bao ngoài làm field disabled mà không đổi attribute `disabled` của nó.
- Khôi phục trạng thái (autofill, back/forward cache): giá trị được đặt lại qua `setValue()`.

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `type` | string | `text` | `text` \| `password` \| `email` \| `tel` \| `number` \| `url` \| `search` \| `date` \| `month` \| `datetime-local` \| `time` \| `textarea` \| `contenteditable` (`month`/`datetime-local`/`time` từ 0.18.0). Khác → `text`. Đổi `type` = render lại. |
| `size` | string | `md` | `sm` \| `md` \| `lg` (cao 32 / 40 / 48 px). |
| `value` | string | `''` | Giá trị ban đầu (property `value` là giá trị sống). Đổi attribute cập nhật tại chỗ (giữ focus, con trỏ). Giá trị lúc gắn vào là mặc định khi reset. |
| `placeholder` | string | — | Chữ gợi ý trong ô. Với `contenteditable` hiện bằng CSS (`data-placeholder`), không bao giờ nằm trong giá trị. |
| `label` | string | — | Nhãn hiển thị. |
| `helper-text` | string | — | Dòng gợi ý dưới ô (vẫn hiện khi có lỗi). |
| `error-text` | string | — | Dòng lỗi (error contract). |
| `required` | boolean | không | Bắt buộc: dấu `*`, `aria-required`, `valueMissing` khi rỗng. |
| `disabled` | boolean | không | Tắt ô (cũng có tác dụng qua `<fieldset disabled>`). Không gửi trong form. |
| `readonly` | boolean | không | Chỉ đọc (vẫn focus được, vẫn gửi trong form). |
| `max-length` | number | — | Giới hạn ký tự/từ, hiện bộ đếm. Phải là số nguyên dương, khác thì bỏ qua. |
| `limit-type` | string | `char` | `char` \| `word`. |
| `minlength` | number | — | Số ký tự tối thiểu → `tooShort` (chỉ sau khi người dùng sửa). Không áp cho `number` / `date` / `month` / `datetime-local` / `time`. 0.16.0. |
| `pattern` | string | — | Biểu thức chính quy cho **cả** giá trị → `patternMismatch` (luật của trình duyệt; pattern sai cú pháp thì bỏ qua). Chỉ `text`/`search`/`tel`/`url`/`email`/`password`. 0.16.0. **Pattern do dev viết là code tin cậy**: tránh lượng từ lồng nhau kiểu `(a+)+` — như `<input pattern>` gốc, regex tệ + chuỗi dài do người dùng nhập có thể làm treo trang (ReDoS). Đặt thêm `max-length` cho ô có pattern. |
| `min` / `max` | string | — | Khoảng giá trị cho `number`, `date`, `month`, `datetime-local`, `time` (cùng định dạng với giá trị: `YYYY-MM-DD`, `YYYY-MM`, `YYYY-MM-DDTHH:mm`, `HH:mm`). |
| `step` | string | — | Bước nhảy cho `number`, `month` (tháng), `datetime-local` / `time` (giây: `1` = cho phép giây, `0.001` = phần nghìn giây). |
| `rows` | number | `4` | Số dòng của `textarea` (tối thiểu khi `autoresize`). |
| `autoresize` | boolean | không | `textarea` giãn theo nội dung (0.13.0). |
| `validate-on` | string | — | `blur` \| `change` \| `input`: tự hiện thông báo validation thành lỗi. |
| `field-id` | string | `{host-id}-control` | `id` của control bên trong, dùng nguyên văn. Tự đảm bảo không trùng. |
| `name` | string | — | Tên trường gửi trong form (trên host). |
| `aria-label` | string | — | Tên truy cập khi không có `label`. |
| `autocomplete` | string | — | Chuyển xuống `<input>`/`<textarea>` (ví dụ `current-password`, `new-password`, `email`, `username`, `off`). Danh sách token `[a-z0-9 -]`; khác thì bỏ. 0.17.0. |
| `inputmode` | string | theo `type` | `none` \| `text` \| `decimal` \| `numeric` \| `tel` \| `search` \| `email` \| `url` → control; ghi đè `inputmode` tự suy từ `type`. 0.17.0. |
| `enterkeyhint` | string | — | `enter` \| `done` \| `go` \| `next` \| `previous` \| `search` \| `send` → control. 0.17.0. |
| `autocapitalize` | string | — | `off` \| `none` \| `on` \| `sentences` \| `words` \| `characters` → control. 0.17.0. |
| `spellcheck` | string | — | `true` \| `false` → control. 0.17.0. |
| `autofocus` | boolean | không | Focus control **một lần** khi field gắn vào trang lần đầu, trừ khi đã có phần tử khác đang giữ focus, hoặc field disabled. 0.17.0. |
| `id` | string | tự sinh `td-td-input-field-{n}` | Nếu không đặt, kit tự gán để `<label for>` và các id con hoạt động. |

## Property & method

Property phản chiếu attribute (tên camelCase): `type`, `size`, `placeholder`, `label`, `helperText`,
`errorText`, `required`, `disabled`, `readonly` (chú ý: `readonly`, không phải `readOnly`), `maxLength`, `limitType`,
`min`, `max`, `step`, `minlength`, `pattern`, `rows`, `autoresize`, `validateOn`, `fieldId`, `name`, `ariaLabel`.
Property chuỗi trả `''` khi không có attribute; boolean trả `true/false`. Riêng `value` **không** phản chiếu attribute: nó
là giá trị sống (xem trên). Gán property trước khi phần tử vào trang (hoặc trước khi module được import) vẫn có tác
dụng từ 0.16.0.

| Method / property | Trả về | Mô tả |
|---|---|---|
| `value` | `string` | Giá trị sống (get = `getValue()`, set = `setValue()`). Đổi hành vi 0.16.0: trước đây là attribute. |
| `getValue()` | `string` | Giá trị hiện tại (live). Trước lần render đầu: attribute `value` (hoặc `''`). |
| `TdInputField.messages` (static) | `object` | Thông báo validation + đơn vị bộ đếm, tiếng Việt mặc định; ghi đè cho cả trang. 0.16.0. |
| `setValue(val)` | `void` | Đặt giá trị (cắt theo `max-length`), cập nhật bộ đếm + form. **Không** phát `input`/`change`. `null` → rỗng. |
| `setError(message: string)` | `void` | Hiện lỗi. `''` để xoá. |
| `clearError()` | `void` | Xoá lỗi (từ `setError` hoặc `error-text`). |
| `errorMessage` | `string` (chỉ đọc) | Lỗi đang hiện, `''` nếu không có. |
| `setHelper(msg: string)` | `void` | Đặt dòng gợi ý runtime. `''` để ẩn. |
| `setDisabled(bool)` | `void` | Bật/tắt `disabled`. |
| `setReadOnly(bool)` | `void` | Bật/tắt `readonly`. |
| `focus(options?)` | `void` | Focus control bên trong. |
| `setCustomValidity(message)` | `void` | Như native: chuỗi khác rỗng thêm `customError` (chặn submit); `''` chỉ gỡ lỗi custom, không xoá các cờ khác như `valueMissing`. |
| `checkValidity()` / `reportValidity()` | `boolean` | Như native. |
| `form` | `HTMLFormElement \| null` | Form chứa field. |
| `validity` / `validationMessage` / `willValidate` / `labels` | — | Như native (chỉ đọc). |

## Event

| Event | detail | Khi nào | bubbles? |
|---|---|---|---|
| `input` | `{ value: string }` | Mỗi lần người dùng sửa nội dung (gõ, dán, xoá). Đúng **một** event mỗi lần. | có (composed) |
| `change` | `{ value: string }` | Khi rời ô (blur), **chỉ khi** giá trị khác lúc vào ô. | có (composed) |

`input`/`change` native của control bên trong bị chặn tại host, nên bạn chỉ nhận CustomEvent ở trên. `setValue()` và
đổi attribute `value` không phát event. Nếu đổi giá trị bằng code **trong lúc** ô đang focus, mốc so sánh cho `change`
cũng được cập nhật (thay đổi bằng code không bị tính là người dùng sửa).

## Tuỳ biến giao diện

| Token | Mặc định (sáng) | Tác dụng |
|---|---|---|
| `--td-field-bg` | `var(--td-control-bg)` (#fff) | Nền ô. |
| `--td-field-bg-focus` | `var(--td-control-bg)` | Nền khi focus. |
| `--td-field-bg-disabled` | `var(--td-gray-100)` | Nền khi disabled. |
| `--td-field-bg-readonly` | `var(--td-color-surface-muted)` | Nền khi read-only. |
| `--td-field-fg` | `var(--td-control-fg)` | Màu chữ. |
| `--td-field-fg-disabled` | `var(--td-color-text-muted)` | Màu chữ khi disabled. |
| `--td-field-border` | `var(--td-control-border-soft)` (#d1d1d6) | Viền lúc nghỉ (mềm, v0.14.1). |
| `--td-field-border-hover` | `var(--td-control-border-hover)` (#aeaeb2) | Viền khi hover (v0.14.2). |
| `--td-field-focus` | `var(--td-focus)` | Màu viền khi focus. |
| `--td-field-focus-ring` | `var(--td-focus-ring)` | Vòng focus bàn phím. |
| `--td-field-placeholder` | `var(--td-gray-600)` | Màu placeholder (5.28:1 trên trắng). |
| `--td-field-note` | `var(--td-color-text-muted)` | Màu dòng gợi ý và bộ đếm. |
| `--td-field-label` | `var(--td-gray-700)` | Màu nhãn. |
| `--td-field-error` | `var(--td-color-error)` | Màu lỗi (viền, chữ lỗi, dấu `*`, bộ đếm khi đạt giới hạn). Dùng chung cho mọi control. |
| `--td-field-radius-sm` / `-md` / `-lg` | `10px` / `12px` / `14px` | Bo góc theo size. |
| `--td-field-h-sm` / `-md` / `-lg` | `32px` / `40px` / `48px` | Chiều cao theo size. |
| `--td-field-autoresize-max` | khoảng 16 dòng | Chiều cao tối đa khi `autoresize` (không khai báo sẵn, đặt khi cần). |

Theme tối đổi `--td-field-bg-disabled`, `--td-field-bg-readonly`, `--td-field-placeholder` (gray-400) và
`--td-field-label` (gray-300); phần còn lại theo token control chung.

Ví dụ: ô nhập bo nhiều hơn và viền đậm hơn trên một trang:

```css
.checkout td-input-field {
  --td-field-radius-md: 20px;
  --td-field-border: var(--td-control-border-strong);
}
```

**Viền mềm và WCAG:** viền lúc nghỉ ~1.5:1 và viền hover ~2.2:1 thấp hơn mức 3:1 của WCAG 1.4.11 (lựa chọn có chủ
đích cho giao diện nhẹ). Site cần tuân thủ nghiêm đặt:

```css
:root {
  --td-control-border-soft: var(--td-control-border-strong);
  --td-control-border-hover: var(--td-control-border-strong);
}
```

Input field là tầng nội dung: luôn nền đặc, không bao giờ là kính. Xem [Theming](../customization/theming.md).

## Cấu trúc DOM & class

```html
<td-input-field id="name" label="Họ tên" helper-text="Tên đầy đủ" max-length="50" value="An" required>
  <div class="td-field td-field--md">
    <label class="td-field__label" id="name-label" for="name-control">Họ tên<span class="td-field__required" aria-hidden="true"> *</span></label>
    <input type="text" class="td-field__control" id="name-control" value="An" maxlength="50"
           aria-required="true" aria-describedby="name-note name-counter">
    <div class="td-field__footer">
      <!-- khi có lỗi: <span class="td-field-error" id="name-error" data-for="name">…</span> đứng đầu footer -->
      <div class="td-field__note" id="name-note">Tên đầy đủ</div>
      <div class="td-field__counter" id="name-counter">2/50 ký tự</div>
    </div>
  </div>
</td-input-field>
```

| Class / attribute | Ý nghĩa |
|---|---|
| `.td-field` + `.td-field--{sm\|md\|lg}` | Block và size. |
| `.td-field--textarea` / `.td-field--editable` | Biến thể textarea / contenteditable. |
| `.td-field__label`, `.td-field__required` | Nhãn, dấu `*`. |
| `.td-field__control` | Control (`input` / `textarea` / `div`). |
| `.td-field__control[data-autoresize]` | Textarea tự giãn; biến `--td-field-rows` đặt bằng CSSOM. |
| `.td-field__control[data-placeholder]` | Placeholder của contenteditable (hiện khi `:empty`). |
| `.td-field__footer` | Hàng dưới ô; `hidden` khi không có gì để hiện. |
| `.td-field-error` | Dòng lỗi (dùng chung mọi control), `id="{host-id}-error"`. |
| `.td-field__note` | Gợi ý, `id="{host-id}-note"`, `hidden` khi rỗng. |
| `.td-field__counter` + `[data-state="limit"]` | Bộ đếm, `id="{host-id}-counter"`. |
| Trên control: `[aria-invalid="true"]`, `:disabled` / `[aria-disabled]`, `[readonly]` / `[aria-readonly]`, `:focus-visible` | Trạng thái. |

- Id đều sinh từ id của host: `{host}-label`, `{host}-control` (hoặc `field-id`), `{host}-note`, `{host}-counter`,
  `{host}-error`.
- `aria-describedby` của control = các id **bạn** tự thêm vào (được giữ lại) + note (khi có gợi ý) + counter + error
  (khi có lỗi).
- Render phía server: `td_field('email', '', ['label' => 'Email', 'type' => 'email'])` của
  [adapter PHP](../guides/php-adapter.md#td_field) in đúng khối `.td-field` trên với control native (chạy với chỉ
  `td.css`, password manager nhận được). Không dùng PHP thì in tay khối trên (bên trong `<td-input-field id="…">` hoặc
  đứng riêng). Các file `test/contracts/*.html` trong repo kit chỉ là fixture test (không nằm trong gói npm). Xem
  [WordPress & PHP](../guides/wordpress-php.md) và [bảng class cũ](../upgrading/class-map.md) (đổi `.td-input*` →
  `.td-field*` ở 0.8.0).

## Bàn phím & trợ năng

- Control là phần tử native (hoặc `div role="textbox" aria-multiline="true"` cho `contenteditable`), nên bàn phím là
  hành vi chuẩn của trình duyệt. Với `contenteditable`, Enter xuống dòng.
- Tên truy cập, theo thứ tự ưu tiên: `label` → `aria-label` trên host (được chép xuống control) → các `<label for="host-id">`
  ở ngoài (thành `aria-labelledby` của control).
- Lỗi: `aria-invalid="true"` + `aria-errormessage` + id lỗi trong `aria-describedby` (vì hỗ trợ `aria-errormessage`
  còn chưa đều).
- `contenteditable` disabled: `contenteditable="false"` + `aria-disabled`, ra khỏi thứ tự Tab; read-only:
  `aria-readonly`, vẫn focus được.
- Thay đổi attribute (giá trị, placeholder, gợi ý, lỗi, disabled, readonly, required, min/max/step) cập nhật **tại
  chỗ**: không mất focus, không nhảy con trỏ. Chỉ `type`, `size`, `label`, `max-length`, `limit-type`, `rows`,
  `field-id`, `autoresize` gây render lại (giá trị đang gõ được giữ).
- Trên màn cảm ứng: ô cao tối thiểu 44 px và chữ ≥ 16 px (iOS không tự zoom khi focus).
- Chế độ tương phản cưỡng bức (`forced-colors`): viền lỗi thành nét đứt 2 px.

## Bảo mật

- `label`, `helper-text`, `error-text`, `placeholder`, `value` luôn là **text** (được escape / gán bằng
  `textContent`). Không đưa HTML vào được.
- Giá trị của `contenteditable` là text thuần (`innerText`). Đừng đọc `innerHTML` của control để lấy nội dung.
- Vẫn phải escape khi **bạn** in lại giá trị người dùng ra trang. Xem [Bảo mật](../guides/security.md).

## Lưu ý & lỗi thường gặp

- **Đọc `el.getAttribute('value')` để lấy giá trị đang gõ**: attribute là giá trị ban đầu; dùng `el.value` /
  `getValue()`.
- **Đặt `setError()` nhưng form vẫn submit**: error contract không chặn submit; thêm `setCustomValidity()`.
- **Lỗi validation không hiện dưới ô**: thêm `validate-on` hoặc dùng [TdFormValidation](form-validation.md).
- **Kiểm tra định dạng email/url/number bằng CSS `:invalid` trên control bên trong không chạy**: control bên trong là
  `type="text"`, không có ràng buộc; dùng `validity` của host.
- **Nghe `change` để bắt từng lần gõ**: `change` chỉ phát khi rời ô; dùng `input`.
- **Hai field dùng cùng `field-id`**: id trùng làm nhãn trỏ sai; để mặc định nếu không có lý do đặc biệt.

## Xem thêm

- [Forms](../guides/forms.md) — FormData, validation, lỗi server, reset, fieldset disabled
- [Form validation](form-validation.md) — kiểm tra cả form
- [Theming](../customization/theming.md) — token, viền mềm, override WCAG
- [Styling](../customization/styling.md)
- [Base element](base-element.md) — `TdFormElement` và error contract
- [Trợ năng](../guides/accessibility.md)
