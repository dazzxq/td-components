[Tài liệu](../README.md) › [Components](README.md) › Datetime picker

# Datetime picker — `<td-datetime-picker>`

Ô chọn **ngày + giờ** (đến phút). Bấm vào ô sẽ mở một hộp thoại ([TdModal](modal.md)) gồm 3 ô số ngày / tháng / năm và
2 bánh xe cuộn giờ / phút. Hiển thị dạng `dd/mm/yyyy - hh:mm`, gửi form dạng ISO (mặc định) hoặc dạng DB. Dùng cho hẹn
giờ đăng bài, lịch hẹn, hạn chót…

Không dùng khi: chỉ cần ngày (không cần giờ) hoặc chỉ cần giờ — component luôn làm việc với đủ ngày + giờ + phút; khi đó
`<input type="date">` / `<input type="time">` gốc (có thể bọc bằng [td-input-field](input-field.md)) đơn giản hơn. Chỉ
cần **định dạng / hiển thị** thời gian (không nhập) → dùng `TdDateTime` trong [Tiện ích](utilities.md).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/datetime-picker'` (class: `import { TdDatetimePicker } from '@dazzxq/td-components/datetime-picker'`) |
| Loại | Custom element (mở hộp thoại TdModal — được import tự động) |
| Form-associated | có (`ElementInternals`) |
| Từ phiên bản | 0.1.0 (token-native + bàn phím đầy đủ + `min`/`max` từ 0.10.0) |

## Ví dụ nhanh

```html
<form id="f">
  <td-datetime-picker name="publish_at" label="Thời gian đăng" required></td-datetime-picker>
  <button type="submit">Lưu</button>
</form>
```

```js
import '@dazzxq/td-components/datetime-picker';

const picker = document.querySelector('td-datetime-picker');
picker.addEventListener('change', (e) => {
  console.log(e.detail.value);   // "15/06/2026 - 10:30"
  console.log(e.detail.dbValue); // "2026-06-15 10:30:00"
});

document.getElementById('f').addEventListener('submit', (e) => {
  e.preventDefault();
  console.log(new FormData(e.target).get('publish_at')); // "2026-06-15T10:30:00"
});
```

## Cách dùng

### 1. Các định dạng thời gian

Component phân biệt 3 định dạng (đều là giờ địa phương, **không có múi giờ**):

| Tên | Mẫu | Ví dụ | Dùng ở đâu |
|---|---|---|---|
| display | `dd/mm/yyyy - hh:mm` | `15/06/2026 - 10:30` | attribute `value`, `setValue()`, `getValue()`, chữ hiển thị, `e.detail.value` |
| db | `yyyy-mm-dd hh:mm:ss` | `2026-06-15 10:30:00` | `getDBValue()`, `setDBValue()`, `e.detail.dbValue`, `form-value-format="db"` |
| iso (ISO-local) | `yyyy-mm-ddThh:mm:00` | `2026-06-15T10:30:00` | giá trị gửi form mặc định; `setDBValue()` cũng nhận |

Chi tiết cú pháp:

- **display** chấp nhận ngày/tháng/giờ/phút 1–2 chữ số và khoảng trắng quanh dấu `-` là tuỳ ý (`5/6/2026-9:05` hợp lệ);
  năm phải đủ 4 chữ số. Khi hiển thị/đọc lại luôn được chuẩn hoá có số 0 đứng đầu (`05/06/2026 - 09:05`).
- **db** cần đủ 2 chữ số, giây là tuỳ chọn (`yyyy-mm-dd hh:mm` hoặc `… hh:mm:ss`); giây bị bỏ, khi xuất luôn là `:00`.
- **iso** là `yyyy-mm-ddThh:mm[:ss]`, không có `Z` hay `+07:00`.

Giá trị phải là ngày thật (có tính năm nhuận: `29/02/2025` sai, `29/02/2024` đúng), giờ 0–23, phút 0–59.

### 2. Giá trị ban đầu từ server (PHP)

Attribute `value` **chỉ nhận định dạng display**. Nếu DB lưu `2026-06-15 10:30:00`, hãy đổi trước khi in:

```php
<td-datetime-picker name="publish_at" label="Thời gian đăng"
  value="<?= $post['publish_at'] ? htmlspecialchars(date('d/m/Y - H:i', strtotime($post['publish_at'])), ENT_QUOTES) : '' ?>">
</td-datetime-picker>
```

Hoặc để nguyên chuỗi DB và gán bằng JS:

```js
picker.setDBValue('2026-06-15 10:30:00');   // cũng nhận '2026-06-15T10:30'
```

In thẳng chuỗi DB vào `value="2026-06-15 10:30:00"` là **sai**: component coi đó là giá trị không hợp lệ (`badInput`),
hiển thị nguyên văn và gửi nguyên văn.

### 3. Chọn định dạng gửi form (`form-value-format`)

```html
<!-- mặc định: 2026-06-15T10:30:00 -->
<td-datetime-picker name="a"></td-datetime-picker>
<!-- MySQL DATETIME: 2026-06-15 10:30:00 -->
<td-datetime-picker name="b" form-value-format="db"></td-datetime-picker>
<!-- như hiển thị: 15/06/2026 - 10:30 -->
<td-datetime-picker name="c" form-value-format="display"></td-datetime-picker>
```

PHP: `$_POST['b']` dùng thẳng được cho cột `DATETIME`; với ISO có thể dùng
`DateTime::createFromFormat('Y-m-d\TH:i:s', $_POST['a'])`.

### 4. Giới hạn `min` / `max`

```html
<td-datetime-picker name="deadline" label="Hạn chót" min="2026-01-01" max="31/12/2026 - 17:00"></td-datetime-picker>
```

- Nhận dạng display (`dd/mm/yyyy` hoặc `dd/mm/yyyy - hh:mm`) hoặc ISO (`yyyy-mm-dd` hoặc `yyyy-mm-ddThh:mm`).
- `min` chỉ có ngày → tính từ **00:00** ngày đó; `max` chỉ có ngày → tới **23:59** ngày đó. Có giờ thì so chính xác.
- Bound sai cú pháp hoặc ngày không tồn tại → bị bỏ qua (như không đặt).
- Ngoài khoảng: `validity.rangeUnderflow` / `rangeOverflow` với thông báo `Không được trước {min}` / `Không được sau {max}`;
  nút "Chọn" trong hộp thoại từ chối và giữ hộp thoại mở. Giá trị ngoài khoảng vẫn được gửi form (giống input gốc),
  nhưng `getValue()` / `getDBValue()` trả `''`.
- Không có `min` và `max`: năm phải trong **2000–2099** (ngoài khoảng → `badInput`). Có ít nhất một bound: ô năm dùng
  năm của bound, phía còn lại mở tới 1 hoặc 9999.

Đặt `min` động bằng JS (ví dụ không cho chọn quá khứ):

```js
import { partsFromDate, formatDisplay } from '@dazzxq/td-components/datetime';
picker.setAttribute('min', formatDisplay(partsFromDate(new Date())));
```

### 5. Bước phút (`minute-step`)

```html
<td-datetime-picker name="slot" minute-step="15"></td-datetime-picker>
```

Bánh xe phút chỉ hiện 00, 15, 30, 45. Giá trị hợp lệ: số nguyên 1–30 **chia hết 60** (1, 2, 3, 4, 5, 6, 10, 12, 15, 20,
30); giá trị khác → 1. Khi mở hộp thoại, phút hiện tại được **làm tròn xuống** theo bước (10:58 với bước 5 → 10:55,
không nhảy sang giờ sau). `minute-step` chỉ ảnh hưởng hộp thoại: một `value` như `10:07` đặt bằng code vẫn hợp lệ.

### 6. Đổi chữ giao diện / thông báo

Tất cả chữ nằm trong hai object tĩnh (áp dụng cho **mọi** picker trên trang, đặt một lần lúc khởi động):

```js
import { TdDatetimePicker } from '@dazzxq/td-components/datetime-picker';

TdDatetimePicker.labels.title = 'Chọn thời gian';
TdDatetimePicker.labels.confirm = 'Xong';
TdDatetimePicker.messages.min = 'Phải sau {min}';
```

Xem bảng đầy đủ ở [Hook & tuỳ chọn](#hook--tuỳ-chọn).

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `name` | string | — | Tên field khi gửi form. |
| `value` | string (display) | — | Giá trị hiện tại dạng `dd/mm/yyyy - hh:mm`. Là nguồn sự thật: "Chọn" ghi lại attribute này. Giá trị lúc kết nối DOM là giá trị khôi phục khi reset. |
| `label` | string | — | Nhãn hiển thị, đặt tên cho nút trigger. |
| `aria-label` | string | — | Tên truy cập khi không có `label`. |
| `placeholder` | string | `dd/mm/yyyy - hh:mm` (`labels.placeholder`) | Chữ khi chưa có giá trị. |
| `min` | string | — | Mốc sớm nhất (xem [mục 4](#4-giới-hạn-min--max)). |
| `max` | string | — | Mốc muộn nhất. |
| `minute-step` | number | `1` | Bước phút của bánh xe (1–30, chia hết 60). |
| `form-value-format` | `iso` \| `display` \| `db` | `iso` | Định dạng gửi form. Giá trị lạ → `iso`. |
| `required` | boolean | `false` | Bắt buộc: `valueMissing` khi trống, `aria-required`, dấu `*` trang trí. |
| `disabled` | boolean | `false` | Vô hiệu hoá (cũng qua `<fieldset disabled>`); đang mở mà bị disable → đóng hộp thoại. |
| `error-text` | string | — | Thông báo lỗi hiển thị (error contract). |

Mọi attribute trừ `label` được cập nhật tại chỗ (giữ nguyên nút trigger và focus). Đổi `min`/`max`/`form-value-format`
khi hộp thoại đang mở cũng cập nhật giới hạn ô năm và kiểm tra lại. Đổi `label` khi đang mở sẽ đóng hộp thoại và render
lại, focus chuyển sang trigger mới. `minute-step` đọc lại ở lần mở sau.

## Property & method

| Thành viên | Chữ ký | Mô tả |
|---|---|---|
| `getValue()` | `() => string` | Giá trị display đã chuẩn hoá, hoặc `''` khi trống / sai định dạng / ngày không tồn tại / ngoài `min`–`max`. |
| `getDBValue()` | `() => string` | `yyyy-mm-dd hh:mm:00`, hoặc `''` trong các trường hợp như trên. |
| `setValue(display)` | `(string \| null) => void` | Đặt giá trị dạng display. `''` / `null` → xoá. Chuỗi sai **vẫn được giữ** và bị đánh dấu `badInput`. Không phát `change`. |
| `setDBValue(db)` | `(string) => void` | Đặt từ dạng db hoặc ISO-local. Chuỗi rác / ngày không tồn tại → **bỏ qua** (giá trị cũ giữ nguyên). Không phát `change`. |
| `setError(msg)` / `clearError()` | | Error contract. `errorMessage` (getter) trả lỗi đang hiện. |
| `value`, `label`, `placeholder`, `min`, `max`, `minuteStep`, `formValueFormat`, `name`, `errorText` | property phản chiếu attribute | Đọc/ghi attribute (chuỗi). `el.value` là chuỗi display thô (có thể sai định dạng) — dùng `getValue()` để lấy giá trị đã kiểm tra. |
| `disabled`, `required` | boolean | Phản chiếu attribute. |
| `form`, `validity`, `validationMessage`, `willValidate`, `labels` | read-only | Như control gốc. |
| `checkValidity()`, `reportValidity()`, `setCustomValidity(msg)` | | Như control gốc. |
| `focus()` | | Focus nút trigger. |

Không có method `open()` công khai. Muốn mở bằng code, bấm nút trigger:
`picker.querySelector('.td-dtp__trigger').click()`.

## Event

| Event | detail | Khi nào | bubbles? |
|---|---|---|---|
| `change` | `{ value, dbValue }` — `value` dạng display, `dbValue` dạng `yyyy-mm-dd hh:mm:00` | Người dùng bấm "Chọn" với giá trị hợp lệ. Một event mỗi lần xác nhận. Đóng bằng Escape / X / "Đóng", `setValue()`, `setDBValue()`, reset **không** phát. | có (`composed: true`) |

## Hook & tuỳ chọn

`TdDatetimePicker.labels` — chữ giao diện (mặc định tiếng Việt):

| Key | Mặc định | Dùng cho |
|---|---|---|
| `title` | `Chọn ngày giờ` | Tiêu đề hộp thoại |
| `placeholder` | `dd/mm/yyyy - hh:mm` | Placeholder mặc định |
| `date` | `Ngày` | Tiêu đề nhóm ô ngày (legend) |
| `day` / `month` / `year` | `Ngày` / `Tháng` / `Năm` | Nhãn 3 ô số |
| `time` | `Giờ` | Tiêu đề nhóm bánh xe |
| `hour` / `minute` | `Giờ` / `Phút` | Tên (aria-label) hai bánh xe |
| `close` | `Đóng` | Nút huỷ |
| `now` | `Bây giờ` | Nút đặt về thời điểm hiện tại |
| `confirm` | `Chọn` | Nút xác nhận |

`TdDatetimePicker.messages` — thông báo kiểm tra (`{min}` / `{max}` được điền):

| Key | Mặc định | Khi nào |
|---|---|---|
| `required` | `Vui lòng chọn ngày giờ` | `required` mà trống (`valueMissing`) |
| `format` | `Định dạng ngày giờ không hợp lệ` | `value` sai cú pháp (`badInput`) |
| `incomplete` | `Vui lòng nhập đầy đủ ngày, tháng, năm` | Ô ngày/tháng/năm bỏ trống trong hộp thoại |
| `day` | `Ngày phải từ 1 đến 31` | |
| `month` | `Tháng phải từ 1 đến 12` | |
| `year` | `Năm phải từ {min} đến {max}` | Năm ngoài khoảng cho phép |
| `hour` | `Giờ phải từ 0 đến 23` | |
| `minute` | `Phút phải từ 0 đến 59` | |
| `date` | `Ngày không hợp lệ` | Ngày không tồn tại (31/02…) |
| `min` | `Không được trước {min}` | `rangeUnderflow` |
| `max` | `Không được sau {max}` | `rangeOverflow` |

Các chuỗi này là **văn bản thuần** (render bằng `textContent`). Đổi key nào thì chỉ key đó thay đổi; đặt trước khi
picker render (hoặc trước lần mở hộp thoại tiếp theo). Hiện chưa có bản dịch theo từng phần tử — đổi là đổi cho cả
trang. Hướng dẫn đổi ngôn ngữ: [Extending](../customization/extending.md).

## Form

- **Giá trị gửi** theo `form-value-format`. Trống → không có entry trong `FormData`.
- **Giá trị sai** (sai cú pháp, 31/02, 25:99, năm ngoài 2000–2099 khi không có bound): `validity.badInput`, gửi **chuỗi
  thô** (không cố đổi định dạng).
- **Ngoài `min`/`max`**: `rangeUnderflow` / `rangeOverflow`, vẫn gửi giá trị đã định dạng.
- **`required`** + trống → `valueMissing` (`Vui lòng chọn ngày giờ`).
- **Reset**: khôi phục attribute `value` lúc kết nối DOM (không có → xoá), xoá lỗi `setError`.
- **Khôi phục trạng thái** (bfcache/autofill): đặt lại chuỗi display.
- **Error contract**: `error-text` / `setError()` → `aria-invalid`, `aria-errormessage`, `aria-describedby` trên trigger +
  `<span class="td-field-error">` sau khối `.td-dtp`. Không đổi `validity`.

Kết hợp với [TdFormValidation](form-validation.md): các thông báo `validationMessage` tiếng Việt ở trên được dùng
nguyên văn.

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-dtp-option-h` | `40px` (`--td-touch-min` = 44px trên màn cảm ứng) | Chiều cao một dòng trên bánh xe |
| `--td-dtp-visible` | `5` | Số dòng nhìn thấy (nên là số lẻ để dòng chọn nằm giữa) → chiều cao bánh xe = dòng × số này |
| `--td-dtp-wheel-w` | `5rem` | Độ rộng một bánh xe |
| `--td-dtp-band-bg` | `var(--td-color-hover-strong)` | Nền dải chọn ở giữa bánh xe |
| `--td-dtp-band-border` | `var(--td-control-border-hover)` | Viền dải chọn |
| `--td-dtp-option-fg` | `var(--td-color-text-muted)` | Màu chữ dòng chưa chọn |
| `--td-dtp-option-selected-fg` | `var(--td-color-text)` | Màu chữ dòng đang chọn |
| `--td-dtp-preview-bg` | `var(--td-color-hover)` | Nền dòng xem trước |

Nút trigger và 3 ô số dùng token field chung (`--td-field-bg`, `--td-field-border`, `--td-field-border-hover`,
`--td-field-focus`, `--td-field-error`, `--td-field-placeholder`, `--td-field-radius-md`, `--td-field-h-md`…). Hộp thoại
là TdModal (xem [token của modal](modal.md)).

```css
:root {
  --td-dtp-visible: 3;          /* bánh xe thấp hơn */
  --td-dtp-band-bg: #e0ecff;
}
```

Hộp thoại được gắn ở `<body>` nên biến đặt trên host picker **không** ảnh hưởng hộp thoại; đặt ở `:root` hoặc trên
`.td-dtp-panel`.

## Cấu trúc DOM & class

```html
<td-datetime-picker id="{host}">
  <div class="td-dtp" data-state="closed|open">
    <label class="td-field__label" id="{host}-label" for="{host}-trigger">Hẹn giờ<span class="td-field__required" aria-hidden="true"> *</span></label>
    <button type="button" class="td-dtp__trigger" id="{host}-trigger" role="combobox" aria-haspopup="dialog"
            aria-expanded="false" [aria-controls="{modal-id}" khi mở] [aria-required] [aria-invalid]>
      <span class="td-dtp__value" [data-placeholder]>15/06/2026 - 10:30</span>
      <span class="td-dtp__icon" data-td-icon="calendar" aria-hidden="true"><svg …></svg></span>
    </button>
  </div>
  <span class="td-field-error" id="{host}-error" data-for="{host}">…</span>   <!-- chỉ khi có lỗi -->
</td-datetime-picker>
```

Thân hộp thoại (bên trong TdModal; `{p}` = `{host}-dtp{n}`, `n` tăng mỗi lần mở):

```html
<div class="td-dtp-panel">
  <fieldset class="td-dtp-panel__group">
    <legend class="td-dtp-panel__legend">Ngày</legend>
    <div class="td-dtp-panel__fields">
      <div class="td-dtp-panel__field">
        <label class="td-dtp-panel__label" for="{p}-day">Ngày</label>
        <input class="td-dtp-panel__input" id="{p}-day" type="number" inputmode="numeric" min="1" max="31" data-part="day">
      </div>
      <!-- month (1–12), year (khoảng năm) tương tự -->
    </div>
  </fieldset>
  <div class="td-dtp-panel__group" role="group" aria-labelledby="{p}-time">
    <p class="td-dtp-panel__legend" id="{p}-time">Giờ</p>
    <div class="td-dtp-panel__wheels">
      <div class="td-dtp-wheel">
        <div class="td-dtp-wheel__list" role="listbox" id="{p}-hour" aria-label="Giờ" tabindex="0" data-part="hour"
             aria-activedescendant="{p}-hour-10">
          <div class="td-dtp-wheel__option" role="option" id="{p}-hour-10" aria-selected="true" data-value="10">10</div>
          …
        </div>
      </div>
      <span class="td-dtp-wheel__sep" aria-hidden="true">:</span>
      <div class="td-dtp-wheel"><!-- minute --></div>
    </div>
  </div>
  <p class="td-dtp-panel__preview">15/06/2026 - 10:30</p>
  <p class="td-dtp-panel__error" id="{p}-error" role="alert" hidden></p>
</div>
```

| Ở đâu | Attribute trạng thái |
|---|---|
| `.td-dtp` | `data-state="open|closed"` |
| `.td-dtp__trigger` | `aria-expanded`, `:disabled`, `aria-invalid="true"` |
| `.td-dtp__value` | `data-placeholder` khi trống |
| `.td-dtp-panel__input`, `.td-dtp-wheel__list` | `aria-invalid="true"` trên ô gây lỗi |
| `.td-dtp-panel__error` | `[hidden]` khi không có lỗi |
| `.td-dtp-wheel__option` | `aria-selected="true"` |

JS không ghi style nào; bánh xe cuộn bằng `scrollTo`, dùng CSS scroll-snap.

## Bàn phím & trợ năng

**Nút trigger** (mẫu APG combobox có popup dialog): `Enter`, `Space`, `ArrowDown` (kể cả `Alt+ArrowDown`) mở hộp thoại.
`Enter` không bao giờ submit form. Bấm chuột cũng mở.

**Trong hộp thoại**

| Vị trí | Phím | Hành động |
|---|---|---|
| Mở | — | Focus vào ô Ngày. |
| Ô ngày/tháng/năm | gõ số | Kiểm tra ngay khi gõ (không sửa chữ đang gõ); khi rời ô (`change`) giá trị bị kẹp vào min–max của ô. |
| Bánh xe (mỗi bánh xe là **một** điểm Tab) | `ArrowUp` / `ArrowDown` | ±1 giờ / ±1 bước phút (không vòng) |
| | `PageUp` / `PageDown` | ±6 giờ / ±15 phút (làm tròn theo bước) |
| | `Home` / `End` | Đầu / cuối |
| | chuột: click / cuộn | Click chọn dòng; cuộn (hoặc vuốt) chọn dòng dừng ở dải giữa |
| Mọi nơi | `Tab` | Ngày → Tháng → Năm → Giờ → Phút → các nút; focus bị giữ trong hộp thoại |
| Nút "Bây giờ" | | Đặt về thời điểm hiện tại (phút làm tròn xuống), hộp thoại vẫn mở |
| Nút "Chọn" | | Có lỗi → giữ mở, hiện dòng lỗi và focus ô gây lỗi (nếu lỗi thuộc một ô cụ thể). Hợp lệ → ghi giá trị, phát 1 `change`, đóng, focus về trigger |
| `Escape` / nút X / "Đóng" | | Huỷ thay đổi (hộp thoại làm việc trên bản sao), focus về trigger |

Trợ năng:

- Option bánh xe không bao giờ nhận focus; dòng active **chính là** dòng được chọn (`aria-selected` và
  `aria-activedescendant` luôn đồng bộ).
- Lỗi hiện trong `p[role=alert]`; ô gây lỗi có `aria-invalid="true"` và `aria-describedby` trỏ tới dòng lỗi (chỉ khi lỗi
  đang hiện).
- Tên truy cập của trigger: `label` → `aria-label` của host → `<label for="{host-id}">` ngoài.
- `prefers-reduced-motion`: bánh xe nhảy ngay, không cuộn mượt. `forced-colors`: dòng chọn dùng màu `Highlight`.
- Touch: dòng bánh xe và các ô cao ≥ 44px; ô số ≥ 16px chữ (iOS không zoom).

## Bảo mật

`label`, `placeholder`, `value` (kể cả chuỗi sai) và mọi chuỗi trong `labels` / `messages` được render dạng **văn bản**
(escape hoặc `textContent`). Thân hộp thoại dựng bằng DOM API, không dùng chuỗi HTML.

## Lưu ý & lỗi thường gặp

- **In chuỗi DB/ISO vào `value`** → `badInput`. `value` chỉ nhận `dd/mm/yyyy - hh:mm`; dùng `setDBValue()` hoặc đổi định
  dạng ở server.
- **Không có múi giờ.** Mọi giá trị là giờ tường (wall-clock) của người dùng. Nếu server lưu UTC, tự quy đổi trước khi
  hiển thị và sau khi nhận.
- **`getValue()` trả `''`** không có nghĩa là trống: có thể giá trị sai hoặc ngoài `min`/`max`. Kiểm tra `picker.validity`
  hoặc `picker.value` (chuỗi thô) để phân biệt.
- **Năm ngoài 2000–2099 bị từ chối** khi không đặt `min`/`max`. Nhập ngày sinh / dữ liệu cũ → đặt `min` (ví dụ
  `min="1900-01-01"`).
- **`setValue()` im lặng**: không phát `change`. Nếu code khác phụ thuộc `change`, tự dispatch hoặc gọi hàm xử lý.
- **Hộp thoại là TdModal**: mở từ bên trong một modal khác sẽ xếp chồng lên trên; các nút trong hộp thoại dùng
  `.td-btn` của [button](button.md).

## Xem thêm

- [Modal](modal.md) · [Tiện ích: TdDateTime và các hàm parse/format](utilities.md)
- [Form validation](form-validation.md) · [Hướng dẫn form](../guides/forms.md)
- [Theming](../customization/theming.md) · [Extending (đổi ngôn ngữ nhãn)](../customization/extending.md) ·
  [Trợ năng](../guides/accessibility.md)
