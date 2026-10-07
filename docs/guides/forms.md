[Tài liệu](../README.md) › Hướng dẫn › Form

# Form: submit, validation, lỗi từ server

Trang này nói về **mọi thứ liên quan tới `<form>`**: control nào của td tham gia form như thẻ `<input>` thật, giá trị nào
được gửi đi, validation (của trình duyệt, của `TdFormValidation`, lỗi trả về từ server), reset, `<fieldset disabled>`,
và mẫu submit bằng AJAX với `TdButton.run()`.

Tóm tắt một câu: **đặt control td vào `<form>` như thẻ native, đặt `name`, rồi dùng `new FormData(form)`** — không cần
input ẩn, không cần tự gom giá trị.

## Mục lục

- [Control nào là form-associated](#control-nào-là-form-associated)
- [Giá trị gửi đi: name, value, FormData](#giá-trị-gửi-đi-name-value-formdata)
- [Đọc và ghi giá trị bằng JS](#đọc-và-ghi-giá-trị-bằng-js)
- [td-button trong form](#td-button-trong-form)
- [Validation của trình duyệt (constraint validation)](#validation-của-trình-duyệt-constraint-validation)
- [Hiển thị lỗi: error contract](#hiển-thị-lỗi-error-contract)
- [TdFormValidation từ đầu đến cuối](#tdformvalidation-từ-đầu-đến-cuối)
- [Lỗi từ server](#lỗi-từ-server)
- [Mẫu AJAX submit với TdButton.run()](#mẫu-ajax-submit-với-tdbuttonrun)
- [Reset form](#reset-form)
- [fieldset disabled](#fieldset-disabled)
- [Khôi phục trạng thái (state restore)](#khôi-phục-trạng-thái-state-restore)
- [Label và tên truy cập](#label-và-tên-truy-cập)
- [Lỗi thường gặp](#lỗi-thường-gặp)

## Control nào là form-associated

"Form-associated" nghĩa là custom element được trình duyệt coi như một control thật của form (cơ chế
**ElementInternals**, `static formAssociated = true`). Host (thẻ `<td-…>`) sở hữu giá trị và validity; control native
bên trong **không mang `name`** nên không bao giờ bị gửi trùng ([ADR 0003](../internal/decisions/0003-elementinternals-form-association.md)).

| Thẻ | Form-associated | Error contract (`setError`) | Ghi chú |
|---|---|---|---|
| `<td-input-field>` | có | có | host tự tính validity (xem [bên dưới](#validation-của-trình-duyệt-constraint-validation)) |
| `<td-checkbox>` | có | có | gửi khi được tick |
| `<td-toggle>` | có | có | gửi khi bật |
| `<td-slider>` | có | có | luôn gửi một số |
| `<td-dropdown>` | có | có | gửi value của option đã chọn |
| `<td-chip-input>` | có | có | gửi **nhiều** entry cùng `name` |
| `<td-datetime-picker>` | có | có | định dạng gửi chọn bằng `form-value-format` |
| `<td-media-gallery>` | có | có | (0.43.0) danh sách ảnh: `name[]=id` hoặc `name[i][id\|alt\|crop\|focal]`; rỗng → một `name=`; hỏng / vượt `max` → **không gửi gì** ([Media gallery](../components/media-gallery.md#1-hai-dạng-gửi-form-api-công-khai-adr-0021)) |
| `<td-check-matrix>` | có | — | (0.47.0) gửi **đủ tập nhóm theo cột** + marker cột + sentinel `_v` — xem [Check matrix](../components/check-matrix.md#formdata-hợp-đồng-công-khai) |
| `<td-button>` | **không** (cố ý) | — | bên trong là `<button>` native, form thấy nó như nút thường |

Mọi control form-associated kế thừa [`TdFormElement`](../components/base-element.md) nên có chung bộ API native:

| Thành viên | Loại | Ý nghĩa |
|---|---|---|
| `name`, `disabled`, `required` | attribute + property phản chiếu | như thẻ native (`td-slider` không có `required` — range luôn có giá trị) |
| `form` | getter | `<form>` sở hữu control, hoặc `null` |
| `validity` | getter | `ValidityState` |
| `validationMessage` | getter | thông báo lỗi hiện tại (tiếng Việt với control td) |
| `willValidate` | getter | `false` khi disabled/readonly… |
| `labels` | getter | các `<label for="id-của-host">` |
| `checkValidity()` | method | `true`/`false`, bắn `invalid` nếu sai |
| `reportValidity()` | method | như trên + hiện bong bóng lỗi của trình duyệt |
| `setCustomValidity(msg)` | method | thêm `customError`; `''` chỉ xoá lỗi custom, **không** xoá `valueMissing`… |
| `focus(options)` | method | chuyển focus vào control bên trong |
| `setError(msg)` / `clearError()` / `errorMessage` | method / getter | lỗi hiển thị (xem [error contract](#hiển-thị-lỗi-error-contract)) |

Yêu cầu trình duyệt: ElementInternals (Chrome 77+, Firefox 98+, Safari 16.4+). Chi tiết ở
[Yêu cầu hệ thống](../getting-started/requirements.md).

## Giá trị gửi đi: name, value, FormData

Không có `name` thì control **không gửi gì** (giống thẻ native). Control `disabled` (kể cả do `<fieldset disabled>`)
cũng không gửi.

| Thẻ | Giá trị trong FormData | Khi nào **không** có key |
|---|---|---|
| `td-input-field` | chuỗi đang gõ (kể cả `''`); `month` / `datetime-local` / `time`: đúng `.value` đã chuẩn hoá của control native (`2026-09`, `2026-09-28T14:30` hoặc `…T14:30:15` khi `step="1"`, `14:30`) | chỉ khi không có `name` / disabled |
| `td-checkbox`, `td-toggle` | attribute `value`, mặc định `"on"` | khi chưa tick / tắt |
| `td-slider` | số dạng chuỗi, ví dụ `"40"` | — |
| `td-dropdown` | `String(item[value-key])` của option đã chọn | khi chưa chọn gì (không gửi `''`) |
| `td-chip-input` | **mỗi item một entry** cùng `name` (`item[value-key]`) | khi không có item nào |
| `td-check-matrix` | `name[col]=''` mỗi cột (đầu), `name[col][]=row` mỗi ô đang tick (gồm ô khoá-tick), `name[_v]=1` (cuối). PHP: mảng / `''` / không key | khi không có `name`, disabled, hoặc dữ liệu lỗi (fail closed — **không bao giờ** gửi marker rỗng thay cho dữ liệu) |
| `td-datetime-picker` | `form-value-format="iso"` (mặc định) `2026-09-28T14:30:00`; `"display"` `28/09/2026 - 14:30`; `"db"` `2026-09-28 14:30:00`. `mode="date"` / `"month"` / `"year"` (0.18.0): iso = db = `2026-09-28` / `2026-09` / `2026`, display `28/09/2026` / `09/2026` / `2026` | khi trống |

Lưu ý server-side:

- **Checkbox chưa tick, dropdown chưa chọn, chip-input rỗng, datetime trống → key vắng mặt**, không phải chuỗi rỗng.
  Server phải xử lý "không có key" (PHP: `$_POST['agree'] ?? null`).
- **Chip-input với PHP:** đặt `name="tags[]"` để `$_POST['tags']` thành mảng. Với `name="tags"` PHP chỉ giữ entry
  cuối cùng.
- **Datetime-picker có giá trị sai định dạng** (ví dụ `31/02/2026 - 10:00`) vẫn gửi **chuỗi thô** kèm lỗi `badInput`
  — nghĩa là form không hợp lệ và sẽ không submit nếu bạn để validation chạy. Server vẫn phải tự kiểm tra.

```html
<form id="profile" action="/profile" method="post">
  <td-input-field name="full_name" label="Họ tên" required></td-input-field>
  <td-dropdown name="city" label="Thành phố" required></td-dropdown>
  <td-chip-input name="tags[]" label="Thẻ" allow-create></td-chip-input>
  <td-datetime-picker name="birthday" label="Ngày sinh" form-value-format="db"></td-datetime-picker>
  <td-checkbox name="agree" value="1" label="Tôi đồng ý" required></td-checkbox>
  <td-button type="submit" label="Lưu"></td-button>
</form>
```

```js
import '@dazzxq/td-components/input-field';
import '@dazzxq/td-components/dropdown';
import '@dazzxq/td-components/chip-input';
import '@dazzxq/td-components/datetime-picker';
import '@dazzxq/td-components/checkbox';
import '@dazzxq/td-components/button';

const form = document.getElementById('profile');
// Dropdown nhận options qua PROPERTY (không có attribute options)
form.querySelector('td-dropdown').options = [
  { value: 'hn', label: 'Hà Nội' },
  { value: 'hcm', label: 'TP. Hồ Chí Minh' },
];

form.addEventListener('submit', (e) => {
  const fd = new FormData(form);
  console.log([...fd.entries()]);
  // [['full_name','Lan'], ['city','hn'], ['tags[]','a'], ['tags[]','b'], ['birthday','2000-01-02 08:00:00'], ['agree','1']]
});
```

## Đọc và ghi giá trị bằng JS

Dùng **`getValue()` / `setValue()`** (hoặc `FormData`) để đọc giá trị sống. Với `td-input-field`, property `value`
cũng là giá trị sống từ 0.16.0 (trước đó nó trả attribute `value` — giá trị ban đầu). Với các control khác, property
`value` vẫn phản chiếu attribute (slider: chuỗi; dùng `getValue()` để có số).

| Thẻ | Đọc | Ghi (không bắn event) |
|---|---|---|
| `td-input-field` | `getValue()` / `el.value` → string | `setValue(str)` / `el.value = str` (cắt theo `max-length`) |
| `td-checkbox`, `td-toggle` | `el.checked` (boolean) | `el.checked = true` |
| `td-slider` | `getValue()` → number | `setValue(n)` (kẹp vào `[min, max]`, làm tròn theo `step`) |
| `td-dropdown` | `getValue()` / `el.value` → value hoặc `null` (sống từ 0.17.0); `getSelectedItem()` | `setValue(v)` / `el.value = v` (chờ nếu options chưa có) |
| `td-chip-input` | `getValue()` / `el.value` → mảng item (bản sao) | `setValue(items)`, `addItem()`, `removeItem(value)`, `clear()` |
| `td-datetime-picker` | `getValue()` → display của `mode` (`dd/mm/yyyy - hh:mm` mặc định) hoặc `''`; `getDBValue()` | `setValue(display hoặc ISO của mode)`, `setDBValue(db)` |

Ghi bằng API **không bắn `change`** — `change` chỉ dành cho thao tác của người dùng. Nếu cần phản ứng, gọi code của bạn
ngay sau khi `setValue()`.

## td-button trong form

`<td-button>` **không** form-associated. Nó render một `<button>` native trong light DOM, nên form thấy nút đó như
nút thường:

```html
<td-button type="submit" label="Gửi"></td-button>   <!-- submit form bao quanh -->
<td-button type="reset" label="Nhập lại"></td-button> <!-- reset form -->
<td-button label="Huỷ"></td-button>                  <!-- mặc định type="button": KHÔNG submit -->
```

- `type` chỉ nhận `submit | reset | button`; giá trị khác → `button`. **Mặc định là `button`** (khác `<button>`
  native, vốn mặc định `submit`). Quên `type="submit"` là lý do phổ biến nhất khiến "bấm không gửi".
- Nút phải nằm **bên trong** `<form>`: `td-button` không hỗ trợ attribute `form="id"`, `name`/`value` của nút submit
  cũng không có.
- `loading` (hoặc `setLoading(true)`): nút giữ focus, có `aria-busy="true"` + `aria-disabled="true"`, **mọi click bị
  nuốt** (kể cả implicit submit bằng Enter trong ô input, vì trình duyệt "click" nút submit mặc định).
- `disabled`: `<button>` bên trong bị disabled native. Nút nằm trong `<fieldset disabled>` cũng tự bị disabled (vì
  `<button>` bên trong là con của fieldset).

## Validation của trình duyệt (constraint validation)

Mỗi control td tự đặt `validity` qua ElementInternals, nên `form.checkValidity()`, `form.reportValidity()`, pseudo-class
`:invalid` và việc chặn submit đều hoạt động như thẻ native.

| Thẻ | Ràng buộc | Cờ validity | Thông báo mặc định |
|---|---|---|---|
| `td-input-field` | `required` | `valueMissing` | "Trường này là bắt buộc" |
| | `max-length` (+ `limit-type="char|word"`) | `tooLong` | "Vượt quá giới hạn {n} ký tự/từ" |
| | `minlength` (chỉ sau khi người dùng sửa) | `tooShort` | "Tối thiểu {n} ký tự" |
| | `pattern` | `patternMismatch` | "Giá trị không đúng định dạng" |
| | `type="email"` / `"url"` | `typeMismatch` | "Email không hợp lệ" / "URL không hợp lệ" |
| | `type="number"` (sai cú pháp) | `badInput` | "Giá trị không hợp lệ" |
| | `type="number"` + `min`/`max`/`step` | `rangeUnderflow` / `rangeOverflow` / `stepMismatch` | "Giá trị tối thiểu là {min}"… |
| | `type="date"` + `min`/`max` | `typeMismatch` / `rangeUnderflow` / `rangeOverflow` | "Ngày không hợp lệ", "Ngày tối thiểu là {min}"… |
| | `type="month"` / `"datetime-local"` / `"time"` + `min`/`max`/`step` | `rangeUnderflow` / `rangeOverflow` / `stepMismatch` | "Giá trị tối thiểu là {min}"… |
| `td-checkbox` | `required` | `valueMissing` | "Vui lòng chọn ô này." |
| `td-toggle` | `required` | `valueMissing` | "Vui lòng bật tùy chọn này." |
| `td-slider` | `min`/`max`/`step` | `rangeUnderflow` / `rangeOverflow` / `stepMismatch` | "Giá trị tối thiểu là {min}." … |
| `td-dropdown` | `required` | `valueMissing` | "Vui lòng chọn một tùy chọn" |
| `td-chip-input` | `required` | `valueMissing` | `TdChipInput.labels.required` = "Vui lòng thêm ít nhất một mục" |
| `td-datetime-picker` | `required`, định dạng, `min`/`max` | `valueMissing` / `badInput` / `rangeUnderflow` / `rangeOverflow` | `TdDatetimePicker.messages.*` |

Vài điểm khác thẻ native cần biết:

- **`td-input-field` tự tính validity** trên giá trị của host (dùng một `<input>` "probe" tách rời). Ô bên trong với
  `email`/`url`/`number` được render thành `type="text"` + `inputmode` phù hợp, nên nó không tự chặn form. `pattern`
  và `minlength` được host tự tính theo luật native (từ 0.16.0). Ràng buộc khác: dùng `rules` của
  [TdFormValidation](#tdformvalidation-từ-đầu-đến-cuối) hoặc `setCustomValidity()`.
- **Thông báo mặc định dịch được** (0.16.0): `TdInputField.messages`, `TdCheckbox.messages`, `TdToggle.messages`,
  `TdSlider.messages` — xem [Dịch nhãn](../customization/extending.md#dịch-nhãn-sang-ngôn-ngữ-khác).
- **`td-slider` validate giá trị của host** (attribute `value`), không phải `<input type="range">` bên trong (vốn tự
  kẹp giá trị), nên `value="150" max="100"` báo `rangeOverflow` thay vì âm thầm gửi `100`. Không có `value` thì giá
  trị là `min` (0.16.0; trước đó là `0`, nên `min="10"` báo `rangeUnderflow` giả).
- Control **readonly** hoặc **disabled** không tham gia validation (`willValidate === false`), như native.
- Không có `TdFormValidation.attach()` và form không có `novalidate`, trình duyệt hiện **bong bóng lỗi native** gắn vào
  control bên trong (thông báo tiếng Việt của td).

Thêm lỗi tuỳ chỉnh bằng API native:

```js
const slug = document.querySelector('td-input-field[name="slug"]');
slug.addEventListener('input', () => {
  const v = slug.getValue();
  slug.setCustomValidity(/^[a-z0-9-]*$/.test(v) ? '' : 'Chỉ chữ thường, số và dấu gạch');
});
```

`setCustomValidity('')` chỉ xoá lỗi custom; nếu ô vẫn trống mà `required`, `valueMissing` vẫn còn (khác một số
polyfill cũ).

## Hiển thị lỗi: error contract

Validity (form có hợp lệ không) và **lỗi hiển thị** (dòng chữ đỏ dưới ô) là hai việc tách biệt. Mọi control
form-associated của td có "error contract":

| API | Tác dụng |
|---|---|
| attribute `error-text="…"` | hiện lỗi (server render sẵn được) |
| `setError(msg)` | hiện lỗi lúc chạy; `setError('')` xoá |
| `clearError()` | xoá lỗi (cả lỗi từ `error-text`) |
| getter `errorMessage` | lỗi đang hiện (`''` = không có) |

Khi có lỗi, control bên trong nhận `aria-invalid="true"`, `aria-errormessage="{host-id}-error"`, id lỗi được gộp vào
`aria-describedby` (id mà trang tự thêm vào được giữ nguyên), và một `<span class="td-field-error" id="{host-id}-error">`
chứa **text** được chèn vào (với input-field là đầu `.td-field__footer`, với slider là trong `.td-slider`, còn lại là
cuối host). Attribute `error-text` mới nhất luôn thắng giá trị `setError()` trước đó.

**Gợi ý và lỗi (0.54.0).** Mọi form control có gợi ý `helper-text` / `setHelper()` (`<td-hint>` con cho link) — một dòng
chữ dưới control, nối vào `aria-describedby`. **Khi lỗi hiện, gợi ý ẩn** và rời khỏi mô tả; hết lỗi thì trở lại. Viết
chữ lỗi tự đủ nghĩa (người dùng không còn thấy gợi ý lúc lỗi). Chi tiết: [Hint](../components/hint.md).

**`setError()` không đổi validity.** Một ô `setError('Email đã tồn tại')` vẫn `validity.valid === true` và form vẫn
submit được. Muốn chặn submit, dùng `setCustomValidity()` (hoặc `rules` của TdFormValidation).

`td-input-field` có thêm `validate-on="blur|change|input"`: tự đưa thông báo validity hiện tại vào `setError()` vào thời
điểm đó — đủ cho form đơn giản không cần TdFormValidation.

```html
<td-input-field name="email" type="email" label="Email" required validate-on="blur"></td-input-field>
```

## TdFormValidation từ đầu đến cuối

[`TdFormValidation`](../components/form-validation.md) là helper tĩnh (không phải element) để: validate cả form, hiện
lỗi inline + tóm tắt, focus ô lỗi đầu tiên, và đổ lỗi server vào đúng ô. Nó đọc **ràng buộc native** (không có "schema"
riêng) và hoạt động với cả control td lẫn `<input>`/`<select>`/`<textarea>` native trong cùng form.

```js
import { TdFormValidation } from '@dazzxq/td-components/form-validation';
```

### Ba hàm chính

| Hàm | Làm gì | Trả về |
|---|---|---|
| `validate(root, opts)` | chạy `rules`, đọc validity, hiện lỗi, (tuỳ chọn) summary, focus ô lỗi đầu | `{ valid, errors, invalid }` |
| `apply(root, serverErrors, opts)` | đổ lỗi server `{ field: msg | msg[] }` vào ô; **không đổi validity** | `{ applied, unmapped, unmatched }` |
| `attach(form, opts)` | nối vào `submit`: validate khi submit, revalidate "sống" sau lần submit hỏng đầu | hàm `detach()` |
| `clear(root)` | gỡ mọi thứ helper đã đặt (lỗi, note, summary, custom validity của `rules`) | — |

`root` là `<form>` hoặc bất kỳ container nào (ví dụ thân modal). `errors[i]` = `{ element, name, message }`.

### Tuỳ chọn

| Tuỳ chọn | Dùng cho | Mặc định | Ý nghĩa |
|---|---|---|---|
| `rules` | validate, attach | — | `{ [name]: (value, control, root) => message | '' }`. Trả chuỗi khác rỗng = lỗi (đặt qua `setCustomValidity`). Rule **throw → ô bị coi là lỗi** (fail closed) với `messages.ruleError` |
| `messages` | validate, attach | — | theo `name`: một chuỗi cho mọi lỗi, hoặc `{ valueMissing: '…', tooLong: '…' }` |
| `summary` | cả ba | `'auto'` | `true` / `false` / `'auto'` (hiện khi ≥ 2 lỗi hoặc có lỗi server không map được) |
| `summaryTarget` | cả ba | `null` | element để **append** summary; mặc định prepend vào `root` |
| `focus` | cả ba | `true` | focus ô lỗi đầu tiên theo thứ tự tài liệu |
| `fieldMap` | apply | — | `{ key: 'element-id' | Element }` khi tên key server khác `name` |
| `live` | attach | `true` | revalidate khi sửa, sau lần submit hỏng đầu |
| `onValid` | attach | — | `(event, form) => …`: có nó thì submit **luôn bị chặn** và hàm được gọi (SPA/AJAX) |

Giá trị `value` mà rule nhận: control td có `getValue()` → kết quả `getValue()` (chip-input là mảng item,
dropdown là value hoặc `null`); checkbox native → boolean; nhóm radio → value đang chọn; `<select multiple>` → mảng.

### Thông báo tiếng Việt và ghi đè

- Control td dùng `validationMessage` tiếng Việt của chính nó.
- Control native (`<input>`…) dùng `TdFormValidation.messages` (vì thông báo native theo ngôn ngữ trình duyệt):
  `valueMissing`, `typeMismatch`, `typeMismatchEmail`, `typeMismatchUrl`, `badInput`, `patternMismatch` (ưu tiên
  attribute `title` của ô), `tooShort` (`{minLength}`), `tooLong` (`{maxLength}`), `rangeUnderflow` (`{min}`),
  `rangeOverflow` (`{max}`), `stepMismatch`, `ruleError`.
- Tiêu đề summary: `TdFormValidation.labels.summaryTitle` ("Vui lòng kiểm tra lại các trường sau:").

```js
TdFormValidation.messages.valueMissing = 'This field is required'; // đổi cho cả site
```

### Ví dụ đầy đủ (submit native, không AJAX)

```html
<form id="signup" action="/signup" method="post">
  <td-input-field name="email" type="email" label="Email" required></td-input-field>
  <td-input-field name="username" label="Tên đăng nhập" required max-length="20"></td-input-field>
  <label>Mã giới thiệu <input name="ref" pattern="[A-Z]{4}" title="4 chữ in hoa"></label>
  <td-checkbox name="terms" value="1" label="Đồng ý điều khoản" required></td-checkbox>
  <td-button type="submit" label="Đăng ký"></td-button>
</form>
```

```js
import '@dazzxq/td-components/input-field';
import '@dazzxq/td-components/checkbox';
import '@dazzxq/td-components/button';
import { TdFormValidation } from '@dazzxq/td-components/form-validation';

const form = document.getElementById('signup');
const detach = TdFormValidation.attach(form, {
  rules: {
    username: (v) => (/^[a-z0-9_]+$/.test(v) ? '' : 'Chỉ chữ thường, số và dấu gạch dưới'),
  },
  messages: { terms: 'Bạn cần đồng ý điều khoản để tiếp tục' },
});
// Form hợp lệ → submit native như bình thường. Không hợp lệ → chặn, hiện lỗi, focus ô đầu.
```

Hành vi của `attach()`:

1. Đặt `form.noValidate = true` (bong bóng native tắt; lỗi inline của td là cách hiển thị duy nhất).
2. `submit`: gọi `validate()`. Không hợp lệ → `preventDefault()`. Nếu `validate()` **throw**, submit cũng bị chặn
   (fail closed) và lỗi được `console.error`.
3. Sau lần submit hỏng đầu tiên, sửa ô sẽ revalidate ô đó: gõ (`input`) chỉ **cập nhật hoặc xoá** lỗi đang hiện (không
   tạo lỗi mới khi đang gõ), `change`/`focusout` thì hiện lỗi hiện tại.
4. Lỗi server trên một ô bị gỡ ở lần sửa đầu tiên của ô đó.
5. `detach()` gỡ listener và trả lại `novalidate` như cũ; lỗi đang hiện vẫn giữ — gọi `clear(form)` nếu muốn xoá.

### DOM mà helper sinh ra

Với control td: gọi `setError()` (xem [error contract](#hiển-thị-lỗi-error-contract)). Với control native:

```html
<input … aria-invalid="true" aria-errormessage="{id}-error" aria-describedby="… {id}-error">
<span class="td-field-error" id="{id}-error" data-for="{id}" data-td-fv="">{message}</span>
```

Note được chèn **sau** control (hoặc sau `<label>` bọc nó). Control native không có id sẽ được gán `td-fv-{n}`. Giá trị
`aria-invalid`/`aria-errormessage` mà trang tự đặt được khôi phục khi lỗi gỡ. Style viền đỏ cho control native là việc
của site: `input[aria-invalid="true"] { … }`.

Summary:

```html
<div class="td-form-summary" role="alert" data-td-fv="">
  <p class="td-form-summary__title">Vui lòng kiểm tra lại các trường sau:</p>
  <ul class="td-form-summary__list">
    <li class="td-form-summary__item"><button type="button" class="td-form-summary__link">Email: Email không hợp lệ</button></li>
    <li class="td-form-summary__item">Lỗi server không gắn được vào ô nào</li>
  </ul>
</div>
```

Bấm một dòng trong summary sẽ focus ô tương ứng. Mọi chuỗi (thông báo, nhãn) được đặt bằng `textContent`.

## Lỗi từ server

`apply(root, errors, opts)` nhận map kiểu Laravel: `{ field: 'msg' }` hoặc `{ field: ['msg1', 'msg2'] }` (lấy
thông báo khác rỗng đầu tiên). Key được tìm **trong `root`** theo thứ tự:

1. `fieldMap[key]` (id hoặc Element),
2. `form.elements.namedItem(tên)` / `[name="tên"]` với các biến thể tên: key nguyên văn, dạng chấm → ngoặc
   (`items.0.name` → `items[0][name]`), dạng mảng PHP (`tags` → `tags[]`, `tags.0` → `tags[]`),
3. `[data-field="key"]`.

Tìm thấy wrapper thì helper tự tìm control thật bên trong; tìm thấy `<input>` bên trong một host td thì dùng host.
Key không tìm được → nằm trong `unmapped` (và vào summary nếu summary bật) — **không bao giờ throw**, kể cả với key lạ
từ server.

```js
const res = await fetch('/api/profile', { method: 'POST', body: new FormData(form) });
if (res.status === 422) {
  const body = await res.json();              // { message, errors: { email: ['Email đã tồn tại'], 'tags.0': ['…'] } }
  const r = TdFormValidation.apply(form, body.errors, { fieldMap: { avatar_id: 'avatar-picker' } });
  if (r.unmapped.length) console.warn('Lỗi không gắn được:', r.unmapped);
}
```

Lỗi server **không đổi validity** (form vẫn "hợp lệ" với trình duyệt) — đúng ý đồ: người dùng sửa rồi gửi lại, server
kiểm tra lần nữa. Với `attach()`, lỗi server của một ô tự gỡ khi người dùng sửa ô đó.

WordPress REST trả lỗi tham số dạng `{ code: 'rest_invalid_param', data: { params: { field: 'msg' } } }` — truyền
`body.data.params` vào `apply()`. Xem [WordPress & PHP](wordpress-php.md#form-và-lỗi-server-trong-wordpress).

## Mẫu AJAX submit với TdButton.run()

`TdButton.run(fn)` bật `loading` trong lúc `fn` chạy, **luôn** tắt trong `finally`, trả về kết quả / ném lại lỗi của
`fn`. Gọi lại khi đang chạy trả về **cùng một promise** → không bao giờ gửi đôi.

```html
<form id="post-form" action="/api/posts" method="post">
  <td-input-field name="title" label="Tiêu đề" required max-length="120"></td-input-field>
  <td-input-field name="body" type="textarea" label="Nội dung" required autoresize></td-input-field>
  <td-chip-input name="tags[]" label="Thẻ" allow-create></td-chip-input>
  <td-button type="submit" label="Đăng bài"></td-button>
</form>
```

```js
import '@dazzxq/td-components/input-field';
import '@dazzxq/td-components/chip-input';
import '@dazzxq/td-components/button';
import { TdFormValidation } from '@dazzxq/td-components/form-validation';
import { TdToast } from '@dazzxq/td-components/toast';

const form = document.getElementById('post-form');
const submitBtn = form.querySelector('td-button[type="submit"]');

TdFormValidation.attach(form, {
  // Có onValid → submit native luôn bị chặn, hàm này chạy khi form HỢP LỆ phía client
  onValid: (event, f) => {
    submitBtn.run(async () => {
      const res = await fetch(f.action, {
        method: 'POST',
        body: new FormData(f),
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (res.status === 422) {
        const body = await res.json();
        TdFormValidation.apply(f, body.errors || {});
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      TdToast.success('Đã đăng bài');
      f.reset();
    }).catch(() => TdToast.error('Không lưu được, vui lòng thử lại'));
  },
});
```

Vì sao an toàn khi bấm liên tục hoặc nhấn Enter nhiều lần: khi `loading`, click vào nút bị nuốt; nếu `submit` vẫn tới
(ví dụ gọi `form.requestSubmit()`), `run()` trả lại promise đang chạy thay vì chạy lần hai.

Trong modal: đặt `<form>` làm `body` (Node) của `TdModal.show()`, rồi dùng đúng mẫu trên; hoặc dùng `actions` với
`onClick` trả về promise để modal tự giữ nút ở trạng thái bận. Xem [Modal](../components/modal.md).

## Reset form

`form.reset()` (hoặc `<td-button type="reset">`) gọi `formResetCallback` trên từng control td:

- Giá trị trở về giá trị **ban đầu** — attribute `value`/`checked` được **chụp một lần lúc control được gắn vào DOM**
  (không phải giá trị bạn `setValue()` sau đó). Input-field, slider, dropdown, chip-input (`value` JSON),
  datetime-picker, checkbox/toggle (`checked` và `value`) đều xử lý.
- Dropdown nâng cấp từ `<select>` con (0.17.0): về mặc định **theo luật của `<select>`** — option `selected` cuối cùng,
  không có thì option đầu tiên không bị vô hiệu hoá.
- Lỗi của error contract (`setError` / `error-text`) được xoá.

Form đã gắn `TdFormValidation.attach()` (từ 0.16.0): `reset` tự xoá summary, note lỗi và `aria-invalid` mà helper tạo,
và tắt kiểm tra lại khi sửa cho tới lần submit lỗi kế tiếp. Chỉ dùng `validate()` / `apply()` (không `attach()`) thì
tự thêm:

```js
form.addEventListener('reset', () => TdFormValidation.clear(form));
```

Muốn "giá trị mặc định mới" sau khi lưu (để reset quay về bản vừa lưu), hiện kit không có API — render lại form hoặc
tạo control mới.

## fieldset disabled

```html
<fieldset id="billing" disabled>
  <td-input-field name="tax_code" label="Mã số thuế"></td-input-field>
  <td-dropdown name="country" label="Quốc gia"></td-dropdown>
  <td-button label="Kiểm tra"></td-button>
</fieldset>
```

- Control td nhận `formDisabledCallback(true)` và chuyển sang trạng thái disabled **mà không thêm attribute `disabled`**
  (trạng thái "disabled hiệu lực" = attribute `disabled` HOẶC fieldset tổ tiên disabled). Bỏ `disabled` khỏi fieldset
  thì control trở lại đúng trạng thái trước đó.
- Control disabled không gửi giá trị và không validate.
- `td-input-field` cập nhật tại chỗ (không re-render, focus/caret giữ nguyên).
- `td-button`: `<button>` bên trong tự disabled vì là con của fieldset.
- CSS: host **không** có attribute `[disabled]` trong trạng thái này, nên selector `td-input-field[disabled]` không
  bắt được. Dùng pseudo-class `:disabled` (host form-associated khớp `:disabled` cả khi bị fieldset tắt) hoặc
  `:disabled` của control bên trong.

## Khôi phục trạng thái (state restore)

Khi trình duyệt khôi phục form (quay lại trang không qua bfcache, mode `'restore'`), nó gọi
`formStateRestoreCallback(state, mode)`. Control td đặt "state" riêng khi giá trị hiển thị khác giá trị gửi:

| Thẻ | State lưu | Khôi phục |
|---|---|---|
| `td-input-field` | giá trị (string) | `setValue(state)` |
| `td-slider` | giá trị | đặt lại attribute `value` |
| `td-dropdown` | value | `setValue(state)` (chờ options nếu chưa có) |
| `td-chip-input` | JSON `[{ value, label }]` | `setValue(…)` — nhãn chip hiện đúng mà không cần gọi lại `search` |
| `td-datetime-picker` | chuỗi hiển thị thô | `setValue(state)` |
| `td-checkbox`, `td-toggle` | `value` khi đang chọn, không có khi bỏ chọn | đặt lại `checked` (0.16.0); attribute `value` giữ nguyên |

Lưu ý:

- Trang nằm trong **bfcache** giữ nguyên toàn bộ DOM, không cần callback này.
- Autofill cho custom element (mode `'autocomplete'`) hiện gần như chưa trình duyệt nào hỗ trợ; đừng dựa vào nó.

## Label và tên truy cập

Ba cách đặt tên cho control, theo thứ tự ưu tiên:

1. Attribute `label="…"` — label hiển thị bên trong component (khuyên dùng).
2. `aria-label="…"` trên host — được chép vào control bên trong.
3. `<label for="id-của-host">` bên ngoài — trỏ vào **host** (không phải control bên trong). Host không có `id` sẽ được
   gán tự động (`td-{tag}-{n}`), nhưng để `<label for>` hoạt động bạn phải tự đặt `id` cố định. Bấm label sẽ focus
   control bên trong (checkbox/toggle thì tick luôn).

```html
<label for="newsletter">Nhận bản tin</label>
<td-toggle id="newsletter" name="newsletter"></td-toggle>
```

`td-input-field` có thêm `field-id` để đặt id cho ô bên trong (mặc định `{host-id}-control`). Xem thêm
[Trợ năng](accessibility.md).

## Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| Bấm nút không submit | `td-button` mặc định `type="button"` | thêm `type="submit"` |
| Key không có trong FormData | thiếu `name`, control disabled, hoặc control "rỗng" (checkbox chưa tick, dropdown chưa chọn…) | kiểm tra `name`; server xử lý key vắng mặt |
| PHP chỉ nhận một thẻ của chip-input | `name="tags"` | đổi thành `name="tags[]"` |
| Dropdown `required` báo lỗi dù có `value="…"` | `options` chưa được gán, value đang "chờ" | gán `el.options = […]` sớm (sau khi import module) |
| `setError()` hiện lỗi nhưng form vẫn submit | error contract không đổi validity | dùng `setCustomValidity()` / `rules` |
| `el.value` của input-field trả giá trị cũ | site còn chạy bản trước 0.16.0 | nâng cấp, hoặc dùng `getValue()` |
| `el.value` của dropdown trả attribute cũ | site còn chạy bản trước 0.17.0 | nâng cấp, hoặc dùng `getValue()` |
| Lỗi server không hiện ở ô nào | key server khác `name` | `fieldMap`, hoặc `data-field="key"` trên wrapper; xem `r.unmapped` |
| Reset xong vẫn còn summary lỗi | form không dùng `attach()` (hoặc bản trước 0.16.0) | `form.addEventListener('reset', () => TdFormValidation.clear(form))` |

## Xem thêm

- [TdFormValidation](../components/form-validation.md) — tham chiếu API đầy đủ
- [Input field](../components/input-field.md), [Dropdown](../components/dropdown.md),
  [Chip input](../components/chip-input.md), [Datetime picker](../components/datetime-picker.md),
  [Checkbox](../components/checkbox.md), [Toggle](../components/toggle.md), [Slider](../components/slider.md),
  [Button](../components/button.md)
- [Trợ năng](accessibility.md) · [Bảo mật](security.md) · [WordPress & PHP](wordpress-php.md)
- [Cách hoạt động](../concepts/how-it-works.md) — form-associated, lifecycle
