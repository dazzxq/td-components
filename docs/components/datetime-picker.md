[Tài liệu](../README.md) › [Components](README.md) › Datetime picker

# Datetime picker — `<td-datetime-picker>`

Ô chọn **ngày + giờ** (đến phút). Bấm vào ô sẽ mở một **lịch**: lưới tháng bắt đầu từ Thứ Hai, bấm tiêu đề tháng / năm để
nhảy nhanh tới tháng / năm khác. Mode **datetime** là **hai màn** (0.61.0): màn ngày (lịch) rồi, sau khi bấm một ngày, màn giờ (2 bánh xe giờ / phút). Từ 0.60.0 lịch là một popover neo vào ô
(≥ 720px) hoặc bottom sheet ([TdModal](modal.md), < 720px — chọn lúc mở); trước đó là hộp thoại với 3 ô số phải gõ tay. Hiển thị dạng
`dd/mm/yyyy - hh:mm`, gửi form dạng ISO (mặc định) hoặc dạng DB. Dùng cho hẹn giờ đăng bài, lịch hẹn, hạn chót…
Xem [mục 10](#10-lịch-0600).

Từ 0.18.0 có thêm `mode="date"` (chỉ ngày), `mode="month"` (tháng + năm) và `mode="year"` (chỉ năm) — xem
[mục 7](#7-chế-độ-mode-date--month--year). Chỉ cần **giờ** → `<td-input-field type="time">` ([input-field](input-field.md)).
Chỉ cần **định dạng / hiển thị** thời gian (không nhập) → dùng `TdDateTime` trong [Tiện ích](utilities.md).
Cần một **khoảng** "Từ – Đến" (lọc theo ngày, khung giờ khuyến mãi) → [`<td-datetime-range>`](datetime-range.md) (0.40.0:
element riêng; hai mục form + preset; **vẫn dùng hộp thoại ba ô số cũ tới 0.61.0**, khi nó chuyển sang lịch này).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/datetime-picker'` (class: `import { TdDatetimePicker } from '@dazzxq/td-components/datetime-picker'`) |
| Loại | Custom element (mở lịch popover ≥ 720px; bottom sheet < 720px dùng TdModal — được import tự động) |
| Form-associated | có (`ElementInternals`) |
| Từ phiên bản | 0.1.0 (token-native + bàn phím đầy đủ + `min`/`max` từ 0.10.0; `mode` + `open-at` từ 0.18.0; mặc định mở tại hôm nay + `setDBValue('')` xoá từ 0.19.0; **lịch dạng lưới + không còn cửa sổ năm 2000–2099 từ 0.60.0**) |

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

**0.56.0: dùng helper** — in đúng markup, nhận mọi định dạng (cả chuỗi DB), chạy cả khi không có JS (ô ngày native tạo
dáng như trigger), JS nhận **tại chỗ** không nháy ([PHP adapter § td_datetime_picker / td_date](../guides/php-adapter.md#td_datetime_picker--td_date-0560)):

```php
<?= td_datetime_picker('publish_at', $post['publish_at'], ['label' => 'Thời gian đăng']) ?>   // '2026-06-15 10:30:00' được
<?= td_date('ngay_giao', $order['ship_date'], ['label' => 'Ngày giao', 'min' => date('Y-m-d'), 'required' => true]) ?>
```

**0.60.0:** không có `min` / `max` thì **mọi ngày có thật đều hợp lệ** (năm 1–9999) — ngày sinh, dữ liệu cũ in thẳng,
không cần đặt `min` nữa. (0.56–0.59: giá trị server ngoài năm 2000–2099 bị bỏ kèm một cảnh báo PHP.) Muốn giới hạn thì đặt
`min` / `max` tường minh. Không JS, ô native gửi định dạng của trình duyệt: `yyyy-mm-dd` (mode date — trùng iso) /
`yyyy-mm-ddThh:mm` (mode datetime).

In tay (không dùng helper): attribute `value` nhận định dạng display, hoặc ISO của mode (từ 0.18.0: `2026-06-15T10:30` ở
mode datetime). Chuỗi **DB** (`2026-06-15 10:30:00`, có dấu cách) thì không — đổi trước khi in, hoặc gán bằng JS:

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
  ở mode `datetime` nút "Chọn" từ chối và giữ lịch mở (hiện dòng lỗi); ở `date` / `month` / `year` ô ngoài khoảng bị khoá nên không chọn được. Giá trị ngoài khoảng vẫn được gửi form (giống input gốc),
  nhưng `getValue()` / `getDBValue()` trả `''`.
- Từ 0.18.0 còn nhận tháng (`mm/yyyy`, `yyyy-mm`: `min` = ngày 1, `max` = ngày cuối tháng) và năm (`yyyy`: `min` = 01/01,
  `max` = 31/12). So sánh theo **độ chi tiết của mode**: mode `month` chỉ so tháng (min `2024-03-15` vẫn cho chọn
  `03/2024`), mode `year` chỉ so năm, mode `date` bỏ giờ.
- **Không có `min` và `max` (0.60.0): mọi ngày biểu diễn được đều hợp lệ — năm 1 tới 9999.** Chỉ có một bound: phía còn
  lại mở tới 1 hoặc 9999. Năm luôn là **4 chữ số** trong mọi định dạng (`15/03/0999`, `0999-03-15`); năm `0000`, năm 3 hoặc
  5 chữ số → `badInput`. Lịch là Gregory ngoại suy (không có lịch Julius / ngày bị bỏ năm 1582).
  > **Đổi hành vi ở 0.60.0:** 0.10–0.59 coi năm ngoài **2000–2099** là `badInput` khi không có bound. Site dựa vào cửa sổ
  > ngầm đó để chặn dữ liệu → đặt `min="2000-01-01" max="2099-12-31"` tường minh. Server luôn phải tự kiểm.

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

### 7. Chế độ (`mode`): date / month / year

```html
<td-datetime-picker name="shot_date" mode="date" label="Ngày chụp" min="1900-01-01"></td-datetime-picker>
<td-datetime-picker name="period" mode="month" label="Kỳ"></td-datetime-picker>
<td-datetime-picker name="film_year" mode="year" label="Năm" min="1900" max="2026"></td-datetime-picker>
```

Mỗi mode mở ở lưới của mình (`date` / `datetime`: lưới ngày, `datetime` thêm bánh xe giờ / phút; `month`: lưới 12 tháng;
`year`: lưới 12 năm) và có định dạng riêng. Phần không thuộc mode (giờ ở `date`, ngày ở `month`…) **không tồn tại**
trong giá trị.

| | datetime (mặc định, như cũ) | date | month | year |
|---|---|---|---|---|
| display / attribute `value` / `getValue()` / `setValue()` / `e.detail.value` | `dd/mm/yyyy - hh:mm` | `dd/mm/yyyy` | `mm/yyyy` | `yyyy` |
| `getDBValue()` / `setDBValue()` / `e.detail.dbValue` / `form-value-format="db"` | `yyyy-mm-dd hh:mm:00` | `yyyy-mm-dd` | `yyyy-mm` | `yyyy` |
| gửi form `iso` (mặc định) | `yyyy-mm-ddThh:mm:00` (**không đổi so với 0.17.0**) | `yyyy-mm-dd` | `yyyy-mm` | `yyyy` |
| placeholder mặc định | `dd/mm/yyyy - hh:mm` | `dd/mm/yyyy` | `mm/yyyy` | `yyyy` |

- `setValue()` / attribute `value` nhận display **hoặc** ISO của mode (`15/06/1985` hoặc `1985-06-15` ở `date`);
  `setDBValue()` nhận db của mode (ISO cũng được). Chuỗi của mode khác (ví dụ `15/06/1985 - 10:00` ở `date`) → `badInput`.
- **Đổi `mode` khi đã có giá trị**: giữ các thành phần còn ý nghĩa (datetime → date bỏ giờ; date → month bỏ ngày),
  thành phần **mới xuất hiện** có giá trị cố định: tháng = 01, ngày = 01, giờ = 00, phút = 00 (date `15/06/1985` →
  datetime `15/06/1985 - 00:00`; year `1985` → datetime `01/01/1985 - 00:00`). Giá trị được chuẩn hoá lại, kẹp vào
  `[min, max]`, form value cập nhật, **không** phát `change`. Hộp thoại đang mở thì đóng lại. Giá trị sai định dạng giữ
  nguyên văn.
- Nhãn / thông báo riêng từng mode: `labels.titleDate|titleMonth|titleYear`, `placeholderDate|…`, `nowDate|…`
  ("Hôm nay" / "Tháng này" / "Năm nay"), `messages.requiredDate|…`, `formatDate|…`; key không có hậu tố → dùng key của
  datetime. (`messages.incomplete*` không còn hiện trong picker từ 0.60.0 — lịch không có ô để bỏ trống.)

### 8. Điểm mở lịch (`open-at`)

Khi mở hộp thoại mà **chưa có giá trị**, các ô bắt đầu ở:

| `open-at` | Mở tại |
|---|---|
| (không đặt) | **hôm nay** (kẹp vào `[min, max]`) |
| `today` | hôm nay |
| `min` / `max` | mốc `min` / `max` (không đặt mốc đó → như không có `open-at`) |
| một ngày (`1975-08-09`, `09/08/1975`, `1975-08`, `1975`…, cùng định dạng `min`) | ngày đó |

Luôn kẹp vào `[min, max]`; `open-at` tường minh luôn thắng mặc định; `open-at` sai → như không đặt; đã có giá trị
thì mở tại giá trị.

> **Đổi hành vi ở 0.19.0:** 0.18.0 mở tại `min` khi năm của `min` trước 2000. Quy tắc đó sai khi `min` chỉ là biên
> hợp lệ (ví dụ `min="1900-01-01"` cho ảnh chụp năm nay) nên đã bỏ: không có `open-at` luôn mở tại **hôm nay**. Muốn
> mở ở đầu khoảng thì đặt `open-at="min"`.

```html
<!-- min chỉ là biên hợp lệ: mở tại hôm nay -->
<td-datetime-picker name="taken" mode="date" min="1900-01-01"></td-datetime-picker>
<!-- dữ liệu cũ: mở ngay ở 1950 -->
<td-datetime-picker name="born" mode="date" min="1950-01-01" open-at="min"></td-datetime-picker>
<!-- mở ở năm muộn nhất -->
<td-datetime-picker name="year" mode="year" min="1900" max="2026" open-at="max"></td-datetime-picker>
```

### 9. Nút xoá ngày (`clearable`, 0.59.0)

Ô không bắt buộc có thể cần **bỏ** ngày đã chọn (hạn thanh toán, ngày hết hiệu lực…). `clearable` thêm nút × ngay
trong ô:

```html
<td-datetime-picker name="han" mode="date" label="Hạn thanh toán" value="15/06/2026" clearable></td-datetime-picker>
```

- Nút hiện khi ô **có giá trị** (kể cả giá trị sai — xoá là cách sửa) và **không** `required` / `disabled` (kể cả
  `<fieldset disabled>`); cập nhật tại chỗ khi giá trị / `required` / `disabled` đổi.
- Bấm (chuột, chạm, Enter, Space): giá trị rỗng (FormData không có mục — như ô trống), phát **một** `change`
  `{ value: '', dbValue: '' }` (không phát `input` — picker chỉ phát `change`), focus về trigger, **không** mở hộp thoại.
  `trackFormDirty` coi đó là thay đổi của người dùng. `form.reset()` đưa giá trị mặc định (và nút) trở lại.
- Tên truy cập theo mode: "Xoá ngày" (datetime / date), "Xoá tháng", "Xoá năm" — `TdDatetimePicker.labels.clear`,
  `clearDate`, `clearMonth`, `clearYear`.
- Nút là **anh em** của trigger (không lồng trong nút), đứng ở mép cuối ô sau icon lịch; ô luôn dành chỗ cho nút (chữ dài
  bị cắt `…` không nhảy khi nút hiện / ẩn). Tab: trigger → nút xoá. Cảm ứng: ≥ 44 px.
- Opt-in: không đặt → giống hệt trước 0.59.0. PHP: `td_date(…, ['clearable' => true])` / `td_datetime_picker` in host
  `clearable` + cùng nút (ẩn tới khi module chạy — không có nút "chết" khi không có JS; trước / sau nâng cấp cùng hộp).

### 10. Lịch (0.60.0)

Lịch thay cho hộp thoại ba ô số. **Cùng thẻ, attribute, định dạng giá trị, sự kiện `change`, method, form, helper PHP** — site
không phải đổi markup hay handler.

```html
<td-datetime-picker name="giao" mode="date" label="Ngày giao" value="15/06/2026" min="2026-06-01"></td-datetime-picker>
```

- **Vỏ**: ≥ 720px popover (`div.td-dtp-pop[role=dialog]` gắn ở `<body>`, neo vào ô, lật lên / xuống theo chỗ trống; vùng
  lưới + bánh xe cuộn được, hàng nút luôn thấy; trang bên dưới **không** bị inert, bấm ra ngoài đóng). < 720px bottom sheet
  (TdModal; bấm nền **không** đóng; nút hành động ở **chân sheet**, không cuộn — 0.61.0). Chọn vỏ lúc mở. Cùng một cây DOM ở cả hai vỏ.
- **Lưới ngày** bắt đầu từ Thứ Hai (cố định), 6 tuần, ngày ngoài tháng mờ nhưng bấm được; **hôm nay** có vòng viền, **ngày đã
  chọn** nền đặc + đậm, ngày ngoài `min`–`max` **gạch ngang** và khoá (`aria-disabled`). `‹ ›` đổi một tháng (khoá khi tháng
  bên cạnh nằm ngoài khoảng). Nút tháng và nút năm trên đầu mở lưới 12 tháng / lưới 12 năm (‹ › = ±12 năm); bấm lại nút đang
  bật để quay lại mà không chọn.
- **Cam kết** theo mode:

| Mode | Bấm… | Kết quả |
|---|---|---|
| `date` | một ngày; "Hôm nay" | ghi giá trị + **một** `change` + đóng + focus về ô. Chọn lại đúng ngày cũ: đóng, không `change` |
| `month` | một tháng; "Tháng này" | như trên (mở thẳng ở lưới tháng; nút năm → lưới năm → quay về lưới tháng) |
| `year` | một năm; "Năm nay" | như trên (mở thẳng ở lưới năm) |
| `datetime` | một ngày; "Hôm nay" | **không ghi** — sang **màn giờ** (0.61.0): tiêu đề ngày + nút "‹" (`aria-label="Chọn lại ngày"`, hoặc phím Backspace) quay lại màn ngày; bánh xe giờ / phút (`minute-step`) đổi nháp; **"Chọn"** (chỉ có ở màn giờ) mới ghi + một `change`; "Bây giờ" đưa nháp (ngày + giờ) về hiện tại và ở lại màn giờ (không ghi); nháp ngoài `min` / `max` → dòng lỗi (cũng hiện ở màn ngày), "Chọn" từ chối |

**Hai màn của `datetime` (0.61.0, `data-step="date" \| "time"` trên hộp):** mở luôn ở **màn ngày** (ngày của giá trị có focus; Enter trên ngày đó = sang màn giờ); bấm ngày / Enter / Space → màn giờ, focus bánh xe giờ, vùng `role=status` đọc "Chọn giờ cho 15/10/2026"; "‹" / Backspace → về màn ngày, focus ô ngày (nháp ngoài `min`–`max` giữ nguyên + dòng lỗi; focus rơi vào ngày bật gần nhất); Esc đóng ở cả hai màn. Mỗi màn vừa khung nhìn, không cuộn (kể cả điện thoại 320 × 568); chạm: bánh xe vuốt có quán tính + khớp giá trị, không dây chuyền cuộn ra trang, mục tiêu ≥ 44px, không bàn phím ảo.

- Chọn **tháng** hay **năm** trong lưới của mode `date` / `datetime` chỉ là điều hướng: không `change`, không đóng. Chọn
  tháng → về lưới ngày; chọn năm → về nơi đã mở lưới năm (lưới ngày hoặc lưới tháng).
- **Esc** luôn đóng cả lịch và bỏ nháp (focus về ô). Bấm lại ô khi lịch đang mở: đóng, bỏ nháp, không `change`.
- **Nút xoá (`clearable`) vẫn bấm được khi popover đang mở**: bỏ nháp, xoá giá trị đã ghi, **đúng một** `change`
  `{ value: '', dbValue: '' }`, đóng, focus về ô. Giá trị rỗng thì nút ẩn (`Esc` để huỷ). Ở bottom sheet nút xoá không bấm được
  (sheet là modal).
- Mặc định **không gõ ngày** trong picker. Ngày xa → bấm nút năm rồi ‹ ›, hoặc đặt `open-at`. Cần gõ tay → attribute
  `editable` (0.63.0, [mục 11](#11-gõ-tay-editable-0630)).
- **Bàn phím** (APG date picker dialog): xem [Bàn phím & trợ năng](#bàn-phím--trợ-năng).

**Test tự động (selector ổn định từ 0.60.0)** — mọi thứ khác trong lịch là riêng tư:

| Selector | Nghĩa |
|---|---|
| `.td-cal [data-date="yyyy-mm-dd"]` | ô ngày |
| `.td-cal [data-month="1…12"]`, `.td-cal [data-year="yyyy"]` | ô lưới tháng / năm |
| `.td-cal[data-view="days\|months\|years"]` | khung đang hiện |
| `.td-cal [data-dir="prev\|next"]`, `.td-cal [data-pick="month\|year"]` | nút đầu lịch |
| `.td-dtp-pop [data-action="today\|now\|confirm"]` | nút hàng dưới |
| vai trò + tên trợ năng (`getByRole('gridcell', { name: 'Thứ Hai, 15 tháng 6 năm 2026' })`) | luôn ưu tiên |

Đừng khẳng định "không có `.td-dtp-panel`" (luôn đúng từ 0.60.0). Chọn **15/03/1999** từ lịch đang mở ở 10/2026 — mỗi bước
theo đúng bảng chuyển khung: `[data-pick="year"]` → `[data-dir="prev"]` ×2 (trang 1993–2004) → `[data-year="1999"]` (**về
lưới ngày**, không qua lưới tháng) → `[data-pick="month"]` → `[data-month="3"]` → `[data-date="1999-03-15"]`. Không cần lịch:
`el.setDBValue('1999-03-15')` rồi `el.dispatchEvent(new Event('change', { bubbles: true }))`.

### 11. Gõ tay (`editable`, 0.63.0)

Nhập ngày cũ (cuộn phim thập niên 1990…) gõ nhanh hơn đi qua lưới năm → lưới tháng. `editable` biến ô thành **ô gõ chữ +
nút lịch** (APG "Date Picker Combobox"); lịch y như mục 10. **Opt-in**: không đặt attribute → giống hệt 0.62 (markup,
hành vi, test của site).

```html
<td-datetime-picker name="chup_tu" mode="date" label="Chụp từ" editable></td-datetime-picker>
```

- **Chỉ máy tính gõ được.** Thiết bị cảm ứng (`(hover: none) and (pointer: coarse)`, theo dõi trực tiếp — máy lai đổi tại chỗ):
  ô `readonly` + `inputmode="none"`, chạm = mở lịch như 0.62, không bàn phím ảo che sheet. Máy có chuột nhưng màn hẹp
  < 720px: gõ được (sheet chỉ khi mở lịch).
- **Chỉ gõ được chữ số + mặt nạ khi gõ (0.63.1):** chữ cái, khoảng trắng, dấu bị chặn; ô tự hiện đúng định dạng **ngay lúc
  gõ**: `11122026` → `11/12/2026`, datetime `111220260930` → `11/12/2026 - 09:30`, month `031994` → `03/1994`. Dấu phân cách do mặt
  nạ viết, chỉ khi có chữ số **tiếp theo** (gõ `11` vẫn là `11`, thêm `1` → `11/1`) — Backspace không kẹt ở dấu, xoá không định dạng
  lại. Phím `/ . - :` hoặc cách **không được ghi** nhưng điền số 0 cho ngày / tháng / giờ / phút mới có một chữ số: gõ `1/3/1994` →
  `01/03/1994`. Chữ số thừa sau năm bị bỏ. **Dán** một ngày đọc được (`15/03/1994`, `1994-03-15`, `15.3.1994`…) → đổi sang định dạng
  hiển thị; dán thứ khác → chỉ giữ chữ số. IME: làm sạch khi gõ xong (`compositionend`). Con trỏ đứng sau đúng chữ số vừa gõ.
- **Đọc lúc chốt:** như bảng dưới (cũng dùng cho giá trị dán / attribute `value`); gõ thiếu (`15/03/19` — năm 2 chữ số) → lỗi định
  dạng.

| mode | **gõ phím** (chỉ chữ số; phím `/` điền số 0) | **dán** / attribute `value` (đọc được, thành định dạng hiển thị) |
|---|---|---|
| `date` | `15031994`, `15/3/1994` → `15/03/1994` | `15/03/1994`, `15/3/1994`, `15.3.1994`, `15-3-1994`, ISO `1994-03-15` |
| `datetime` | `150319940905`, `15/3/1994 9:05` → `15/03/1994 - 09:05` | ngày như trên + giờ `9:05` / `9h05` / `0905`; ISO `1994-03-15T09:05` |
| `month` | `031994`, `3/1994` → `03/1994` | `3/1994`, `031994`, ISO `1994-03` |
| `year` | `1994` | `1994` |

  **Năm luôn 4 chữ số** — `15/3/94` bị từ chối (lỗi định dạng), không đoán 1994 hay 2094. `datetime` thiếu giờ → lỗi "Vui lòng
  nhập đầy đủ…" (không tự thêm 00:00). `minute-step` **không** áp lên giờ gõ (nó là bước của bánh xe).
- **Chốt** khi: `Enter` (không chặn — form submit ngầm chạy SAU và thấy giá trị mới), rời ô (Tab, bấm ra ngoài, bấm nút lịch),
  và ngay trước khi lịch mở. Chữ không đổi so với lần hiển thị trước → không làm gì. Đang gõ: không kiểm, không đổi lỗi, không
  đổi `value`.

| Chữ gõ khi chốt | `value` | ô hiển thị | lỗi | `change` |
|---|---|---|---|---|
| rỗng, không `required` | xoá | placeholder | xoá | `{ value: '', dbValue: '' }` nếu trước đó có giá trị (như nút xoá) |
| rỗng, `required` | xoá | placeholder | "Vui lòng chọn…" (`valueMissing`) | **không** |
| hợp lệ, trong `min`–`max` | dạng hiển thị chuẩn | dạng chuẩn | xoá | **một**, nếu khác giá trị cũ **và** validity của element sạch hoàn toàn (kể cả `setCustomValidity()` của site) |
| đọc được, ngoài `min` / `max` | dạng chuẩn (**không** tự kẹp) | dạng chuẩn | "Không được trước / sau …" | **không** |
| không đọc được / ngày không tồn tại (`31/02/1994`) | chữ thô (`badInput`) | chữ thô | "Định dạng … không hợp lệ" / "Ngày không hợp lệ" | **không** |

- **Lỗi gõ hiện ngay** dưới ô (ghi chú `.td-field-error`, `aria-invalid` + `aria-errormessage` trên **ô gõ**), form invalid nên
  submit bị chặn. Lỗi của site (`error-text` / `setError()`) **thắng**. Lỗi gõ mất khi: chốt hợp lệ / rỗng (trừ `required`),
  lịch ghi giá trị, nút xoá, `setValue()` / `setDBValue()` / attribute `value` đổi từ ngoài, reset form, tắt `editable`, hoặc giá
  trị hết sai (vd. bỏ `required`). Đổi `min` / `max` / `required` / `mode` khi đang có lỗi gõ → lỗi được tính lại theo
  trạng thái mới (message mới, hoặc mất nếu giá trị giờ hợp lệ). Message dùng lại `TdDatetimePicker.messages` (`format*`, `incomplete*`, `date`, `min`, `max`,
  `required*`) — không có message mới.
- **`Escape`** (lịch đóng): trả chữ về giá trị đã chốt, không chốt, không event.
- **Lịch**: nút lịch, `ArrowDown` / `Alt+ArrowDown` trên ô → chốt rồi mở, lịch mở đúng tháng / năm vừa gõ, ngày được chọn
  (chữ không đọc được → mở như giá trị hỏng: hôm nay / `open-at`). Chọn trên lịch ghi như 0.62 (một `change`), ô hiện giá trị
  mới, **focus về ô gõ** (không về nút). Bấm vào ô gõ khi popover đang mở → đóng, bỏ nháp, không `change`. Popover neo vào
  cả hộp (ô + nút).
- **Sự kiện**: `input` / `change` gốc của ô gõ **không lọt ra** host — công khai chỉ có `change` (CustomEvent có `detail`) của
  element, như 0.62. Listener `change` của site không bao giờ nhận event thiếu `detail`.
- `setValue()` / `setDBValue()` / attribute `value` đổi từ ngoài: ô cập nhật ngay (kể cả khi đang focus — chương trình thắng),
  không `change`. Bật / tắt `editable` lúc chạy: render lại phần ô, giữ giá trị (chữ đang gõ dở và lỗi gõ bỏ), lịch đang mở
  thì đóng, focus theo sang ô mới.
- **Form**: ô gõ **không có `name`** — FormData vẫn một mục, của host (ElementInternals), định dạng `form-value-format` như cũ.
- **PHP**: `td_date('chup_tu', null, ['editable' => true])` / `td_datetime_picker(..., ['editable' => true])` chỉ in thêm
  attribute `editable` trên host. Markup SSR (native input + trigger) **không đổi**; khi JS chạy, element không nhận markup đó
  (khác cấu trúc) mà đi đường "safe render" sẵn có — giữ giá trị native người dùng đã gõ trước khi JS chạy. Hạn chế: nếu người
  dùng đang gõ trong native input đúng lúc JS định nghĩa element thì mất focus (hiếm).
- **Nhãn** (đổi được như mọi label): tên nút lịch `TdDatetimePicker.labels.openCalendar` 'Mở lịch' (datetime),
  `openCalendarDate` / `openCalendarMonth` / `openCalendarYear` 'Chọn ngày' / 'Chọn tháng' / 'Chọn năm'. Placeholder của ô
  = `placeholder` / `labels.placeholder*` như trước.

**Selector cho test (0.63.0):** `.td-dtp--editable` (hộp), `.td-dtp__input` (ô gõ), `.td-dtp__trigger` (vẫn là thứ **mở
lịch** — test bấm nó vẫn chạy), `.td-dtp__trigger--icon`; `.td-cal [data-date]`, `[data-action="confirm"]` không đổi.
Ví dụ (Playwright): `await page.fill('#ngay .td-dtp__input', '15031994'); await page.press('#ngay .td-dtp__input', 'Enter');`.

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `name` | string | — | Tên field khi gửi form. |
| `mode` | `datetime` \| `date` \| `month` \| `year` | `datetime` | Độ chi tiết (xem [mục 7](#7-chế-độ-mode-date--month--year)). Giá trị lạ → `datetime`. 0.18.0. |
| `open-at` | `today` \| `min` \| `max` \| một ngày | — | Vị trí khi mở mà chưa có giá trị (xem [mục 8](#8-điểm-mở-lịch-open-at)). 0.18.0. |
| `value` | string (display) | — | Giá trị hiện tại dạng display của mode (`dd/mm/yyyy - hh:mm` mặc định; ISO của mode cũng nhận). Là nguồn sự thật: mỗi lần ghi (bấm một ô ở `date` / `month` / `year`, "Chọn" ở `datetime`, nút xoá) ghi lại attribute này. Giá trị lúc kết nối DOM là giá trị khôi phục khi reset. |
| `label` | string | — | Nhãn hiển thị, đặt tên cho nút trigger. |
| `aria-label` | string | — | Tên truy cập khi không có `label`. |
| `placeholder` | string | theo mode (`labels.placeholder`, `placeholderDate`…) | Chữ khi chưa có giá trị. |
| `min` | string | — | Mốc sớm nhất (xem [mục 4](#4-giới-hạn-min--max)). |
| `max` | string | — | Mốc muộn nhất. |
| `minute-step` | number | `1` | Bước phút của bánh xe (1–30, chia hết 60). |
| `form-value-format` | `iso` \| `display` \| `db` | `iso` | Định dạng gửi form. Giá trị lạ → `iso`. |
| `required` | boolean | `false` | Bắt buộc: `valueMissing` khi trống, `aria-required`, dấu `*` trang trí. |
| `disabled` | boolean | `false` | Vô hiệu hoá (cũng qua `<fieldset disabled>`); đang mở mà bị disable → đóng hộp thoại. |
| `error-text` | string | — | Thông báo lỗi hiển thị (error contract). |
| `clearable` | boolean | `false` | **0.59.0** Nút xoá ngày trong ô khi có giá trị và không `required` / `disabled` ([mục 9](#9-nút-xoá-ngày-clearable-0590)). Bật / tắt lúc chạy → render lại. Property `clearable`. |
| `editable` | boolean | `false` | **0.63.0** Gõ ngày bằng tay trên máy tính (cảm ứng vẫn chạm để mở lịch) — [mục 11](#11-gõ-tay-editable-0630). Bật / tắt lúc chạy → render lại phần ô. Property `editable`. |
| `helper-text` | string | — | **0.54.0** Gợi ý dưới control (chữ, 1–2 câu): ẩn và rời khỏi mô tả khi có lỗi. Nội dung giàu (link, `<code>`): `<td-hint>` con — xem [Hint](hint.md). Property `helperText`, `setHelper(msg)`, `helperMessage`. |

Mọi attribute trừ `label` được cập nhật tại chỗ (giữ nguyên nút trigger và focus). Đổi `min`/`max`/`form-value-format`
khi lịch đang mở đánh dấu lại các ô (khoá / mở) **tại chỗ** và kiểm tra lại bản nháp. Đổi `label` hoặc `mode` khi đang mở
sẽ đóng lịch (`label` còn render lại, focus chuyển sang trigger mới). `minute-step` đọc lại ở lần mở sau.

## Property & method

| Thành viên | Chữ ký | Mô tả |
|---|---|---|
| `getValue()` | `() => string` | Giá trị display của mode đã chuẩn hoá, hoặc `''` khi trống / sai định dạng / ngày không tồn tại / ngoài `min`–`max`. |
| `getDBValue()` | `() => string` | db của mode (`yyyy-mm-dd hh:mm:00` \| `yyyy-mm-dd` \| `yyyy-mm` \| `yyyy`), hoặc `''` trong các trường hợp như trên. |
| `setValue(display)` | `(string \| null) => void` | Đặt giá trị dạng display (hoặc ISO) của mode. `''` / `null` → xoá. Chuỗi sai **vẫn được giữ** và bị đánh dấu `badInput`. Không phát `change`. |
| `setDBValue(db)` | `(string) => void` | Đặt từ dạng db (hoặc ISO) của mode. `''` / `null` / `undefined` → **xoá** như `setValue(null)` (0.19.0, mọi mode). Chuỗi rác khác / ngày không tồn tại → **bỏ qua** (giá trị cũ giữ nguyên). Không phát `change`. |
| `setError(msg)` / `clearError()` | | Error contract. `errorMessage` (getter) trả lỗi đang hiện. |
| `value`, `label`, `placeholder`, `min`, `max`, `minuteStep`, `formValueFormat`, `mode`, `openAt`, `name`, `errorText` | property phản chiếu attribute | Đọc/ghi attribute (chuỗi). `el.value` là chuỗi display thô (có thể sai định dạng) — dùng `getValue()` để lấy giá trị đã kiểm tra. |
| `disabled`, `required` | boolean | Phản chiếu attribute. |
| `form`, `validity`, `validationMessage`, `willValidate`, `labels` | read-only | Như control gốc. |
| `checkValidity()`, `reportValidity()`, `setCustomValidity(msg)` | | Như control gốc. |
| `focus()` | | Focus nút trigger. |

Không có method `open()` công khai. Muốn mở bằng code, bấm nút trigger:
`picker.querySelector('.td-dtp__trigger').click()`.

## Event

| Event | detail | Khi nào | bubbles? |
|---|---|---|---|
| `change` | `{ value, dbValue }` — `value` dạng display, `dbValue` dạng db, theo mode (datetime: `yyyy-mm-dd hh:mm:00`) | Người dùng **ghi** một giá trị hợp lệ: `date` / `month` / `year` — bấm một ô (0.60.0: không còn "Chọn"); `datetime` — "Chọn". Một event mỗi lần ghi. 0.59.0: bấm nút xoá (`clearable`) → `{ value: '', dbValue: '' }` (cả khi lịch đang mở). 0.63.0 `editable`: chốt chữ gõ hợp lệ khác giá trị cũ (hoặc xoá trắng ô có giá trị, không `required`) — chữ sai / ngoài `min`–`max` **không** phát. Đóng bằng Escape, bấm ra ngoài, chọn lại đúng giá trị cũ ở `date` / `month` / `year`, `setValue()`, `setDBValue()`, reset **không** phát. | có (`composed: true`) |

## Hook & tuỳ chọn

`TdDatetimePicker.labels` — chữ giao diện (mặc định tiếng Việt):

| Key | Mặc định | Dùng cho |
|---|---|---|
| `title` | `Chọn ngày giờ` | Tên của lịch (`aria-label` của popover / tiêu đề sheet) |
| `placeholder` | `dd/mm/yyyy - hh:mm` | Placeholder mặc định |
| `time` | `Giờ` | Tên nhóm bánh xe |
| `hour` / `minute` | `Giờ` / `Phút` | Tên (aria-label) hai bánh xe |
| `now` | `Bây giờ` | Nút đặt bản nháp về hiện tại (datetime) |
| `confirm` | `Chọn` | Nút xác nhận (datetime) |
| `prevMonth` / `nextMonth` / `prevYear` / `nextYear` / `prevYears` / `nextYears` | `Tháng trước` / `Tháng sau` / `Năm trước` / `Năm sau` / `12 năm trước` / `12 năm sau` | Tên nút ‹ › theo khung (0.60.0) |
| `pickMonth` / `pickYear` | `chọn tháng` / `chọn năm` | Đuôi tên nút tháng / năm trên đầu lịch ("Tháng 6, chọn tháng") |
| `weekdaysShort` / `weekdaysLong` | `['T2', … 'CN']` / `['Thứ Hai', … 'Chủ Nhật']` | **Mảng 7 chuỗi**, bắt đầu Thứ Hai (sai dạng → mặc định + một cảnh báo) |
| `monthName` / `heading` / `headingMonths` / `headingYears` | `Tháng {n}` / `Tháng {month} năm {year}` / `Năm {year}` / `{from} – {to}` | Nút tháng, vùng đọc `aria-live` theo khung |
| `dayLabel` / `yearLabel` / `todaySuffix` | `{weekday}, {day} tháng {month} năm {year}` / `Năm {year}` / `hôm nay` | Tên truy cập từng ô |
| `date`, `day` / `month` / `year`, `close` | | **Không còn hiện** trong picker từ 0.60.0 (vẫn khai báo cho site đã ghi đè; range cũng không còn dùng từ 0.61.0 — ở hộp thoại của nó) |
| `titleDate` / `titleMonth` / `titleYear` | `Chọn ngày` / `Chọn tháng` / `Chọn năm` | Tiêu đề theo mode (0.18.0) |
| `placeholderDate` / `placeholderMonth` / `placeholderYear` | `dd/mm/yyyy` / `mm/yyyy` / `yyyy` | Placeholder theo mode |
| `nowDate` / `nowMonth` / `nowYear` | `Hôm nay` / `Tháng này` / `Năm nay` | Nút "bây giờ" theo mode |
| `dateMonth` / `dateYear` | `Tháng` / `Năm` | Legend nhóm ô ở mode month / year |

`TdDatetimePicker.messages` — thông báo kiểm tra (`{min}` / `{max}` được điền):

| Key | Mặc định | Khi nào |
|---|---|---|
| `required` | `Vui lòng chọn ngày giờ` | `required` mà trống (`valueMissing`) |
| `format` | `Định dạng ngày giờ không hợp lệ` | `value` sai cú pháp (`badInput`) |
| `incomplete` / `incompleteDate` | `Vui lòng nhập đầy đủ ngày và giờ` (datetime, v0.63.0) / `Vui lòng nhập đầy đủ ngày, tháng, năm` (date) | Hiện khi gõ thiếu phần (`editable`, v0.63.0) hoặc giá trị gán qua attribute thiếu phần; range: `incomplete` / `incompleteDatetime` |
| `requiredDate` / `requiredMonth` / `requiredYear` | `Vui lòng chọn ngày` / `… tháng` / `… năm` | `required` theo mode (0.18.0) |
| `formatDate` / `formatMonth` / `formatYear` | `Định dạng ngày không hợp lệ` / `… tháng …` / `… năm …` | Sai cú pháp theo mode |
| `incompleteMonth` / `incompleteYear` | `Vui lòng nhập đầy đủ tháng, năm` / `Vui lòng nhập năm` | Không còn hiện trong picker từ 0.60.0 |
| `day` / `month` / `hour` / `minute` | `Ngày phải từ 1 đến 31` … | Giá trị `value` có thành phần ngoài khoảng (`validationMessage`) |
| `year` | `Năm phải từ {min} đến {max}` | Năm ngoài 1–9999 hoặc ngoài khoảng của `min` / `max` một phía |
| `date` | `Ngày không hợp lệ` | Ngày không tồn tại (31/02…) |
| `min` | `Không được trước {min}` | `rangeUnderflow` |
| `max` | `Không được sau {max}` | `rangeOverflow` |

Các chuỗi này là **văn bản thuần** (render bằng `textContent`). Đổi key nào thì chỉ key đó thay đổi; đặt trước khi
picker render (hoặc trước lần mở hộp thoại tiếp theo). Hiện chưa có bản dịch theo từng phần tử — đổi là đổi cho cả
trang. Hướng dẫn đổi ngôn ngữ: [Extending](../customization/extending.md).

## Form

- **Giá trị gửi** theo `form-value-format`. Trống → không có entry trong `FormData`.
- **Giá trị sai** (sai cú pháp, 31/02, 25:99, năm `0000`): `validity.badInput`, gửi **chuỗi thô** (không cố đổi định
  dạng). 0.60.0: năm ngoài 2000–2099 **không còn** là giá trị sai.
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

Lịch (0.60.0) — token ở `:root` / `[data-td-theme]`, trỏ tới token theme có sẵn (không thêm token màu theme):

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-cal-cell` | `36px` (`--td-touch-min` = 44px trên màn cảm ứng) | Cạnh một ô ngày (cao và rộng) |
| `--td-cal-pad` | `var(--td-space-sm)` | Đệm của popover |
| `--td-cal-fg` | `var(--td-color-text)` | Chữ ngày, đầu lịch |
| `--td-cal-muted-fg` | `var(--td-color-text-muted)` | Ngày ngoài tháng, tiêu đề thứ, ngày khoá (gạch ngang) |
| `--td-cal-hover-bg` | `var(--td-color-hover)` | Nền khi rê chuột (chỉ trong cổng `hover: hover`) |
| `--td-cal-selected-bg` / `--td-cal-selected-fg` | `var(--td-btn-primary-bg)` / `var(--td-btn-primary-fg)` | Ngày / tháng / năm đã chọn (theo nút primary của site) |
| `--td-cal-today-ring` | `var(--td-color-text-muted)` | Vòng viền của hôm nay |
| `--td-cal-focus` | `var(--td-field-focus)` | Viền focus của ô |

Nút trigger dùng token field chung (`--td-field-bg`, `--td-field-border`, `--td-field-border-hover`, `--td-field-focus`,
`--td-field-error`, `--td-field-placeholder`, `--td-field-radius-md`, `--td-field-h-md`…). Popover là bề mặt popup nhỏ
(`td-glass-surface--strong`); bottom sheet nằm trong TdModal (xem [token của modal](modal.md)).

```css
:root {
  --td-dtp-visible: 3;          /* bánh xe thấp hơn */
  --td-cal-cell: 40px;          /* ô ngày lớn hơn trên chuột */
  --td-cal-selected-bg: #2563eb; --td-cal-selected-fg: #fff;
}
```

Lịch được gắn ở `<body>` nên biến đặt trên host picker **không** ảnh hưởng lịch; đặt ở `:root` hoặc trên `.td-dtp-pop`. Lịch
theo phạm vi theme (`data-td-theme`) của host ([ADR 0020](../internal/decisions/0020-theme-scope-portal.md)).

### Responsive (0.34.0)

Màn hình thấp (≤ 500px — điện thoại xoay ngang): bánh xe giờ / phút còn **3 dòng** (`--td-dtp-visible: 3`) để hộp thoại
vừa chiều cao. Ô trigger co theo cột (`min-inline-size: 0`); chữ giá trị bị cắt `…` thì `.td-dtp__value` có `title` = giá trị đầy đủ (không có cho placeholder). Xem [responsive](../concepts/responsive.md).

**Popover thấp (0.60.0):** khung nhìn thấp hơn lịch (điện thoại xoay ngang ≥ 720px, cửa sổ nhỏ) → popover lật lên / xuống
theo phía rộng hơn; vùng lưới + bánh xe (`.td-dtp-pop__scroll`) **co lại và cuộn**, hàng nút (`.td-dtp-pop__actions`) ghim
đáy ngoài vùng cuộn nên "Chọn" / "Hôm nay" luôn thấy; khi cả hai phía đều chật (còn < 220px) popover được kẹp vào khung nhìn
và có thể che ô. Popover luôn nằm trọn trong khung nhìn (gate: 720 / 844 / 1280 × cao 400 / 480 / 600, ô neo đầu / giữa /
cuối, chuột và cảm ứng, cả khi nằm trên một TdModal).

**Bottom sheet < 720px:** cùng cây DOM trong TdModal, không có chân modal (hàng nút ở thân sheet, dính đáy). Bánh xe 3 dòng.
Ô ngày cao `--td-cal-cell` (44px trên cảm ứng) và **vừa 7 cột từ 320px**: lề ngang của sheet co từ 24px xuống tối thiểu 4px
(`clamp`) để ô rộng ≥ 44px. Chiều cao đo ở 360–393px rộng, ô 44px: sheet chỉ-ngày ≈ 521px (61–67 % của 780–852px), sheet
ngày-giờ ≈ 665px (78–85 %, trần của modal là 90 %). (0.36.0: sheet cũ ≈ 47–49 %.)

## Cấu trúc DOM & class

```html
<td-datetime-picker id="{host}">
  <div class="td-dtp" data-state="closed|open">
    <label class="td-field__label" id="{host}-label" for="{host}-trigger">Hẹn giờ<span class="td-field__required" aria-hidden="true"> *</span></label>
    <button type="button" class="td-dtp__trigger" id="{host}-trigger" role="combobox" aria-haspopup="dialog"
            aria-expanded="false" [aria-controls="{dialog-id}" khi mở] [aria-required] [aria-invalid]>
      <span class="td-dtp__value" [data-placeholder]>15/06/2026 - 10:30</span>
      <span class="td-dtp__icon" data-td-icon="calendar" aria-hidden="true"><svg class="td-icon td-icon--m" data-icon="calendar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/></svg></span>
    </button>
    <!-- 0.59.0, chỉ khi clearable (gốc thêm class td-dtp--clearable): -->
    [<button type="button" class="td-dtp__clear" aria-label="Xoá ngày" [hidden]><span class="td-dtp__clear-icon" data-td-icon="close" data-td-icon-size="s" aria-hidden="true">svg</span></button>]
  </div>
  <span class="td-field-error" id="{host}-error" data-for="{host}">…</span>   <!-- chỉ khi có lỗi -->
</td-datetime-picker>
```

0.63.0 `editable` (máy tính; cảm ứng: ô `readonly inputmode="none"`) — trigger thành nút icon, thêm ô gõ:

```html
<div class="td-dtp td-dtp--editable [td-dtp--clearable]" data-state="closed|open">
  <label class="td-field__label" id="{host}-label" for="{host}-input">Chụp từ</label>
  <input type="text" class="td-dtp__input" id="{host}-input" role="combobox" aria-haspopup="dialog" aria-expanded="false"
         aria-autocomplete="none" autocomplete="off" spellcheck="false" placeholder="dd/mm/yyyy" value="15/03/1994"
         [aria-controls khi mở] [aria-required] [aria-invalid] [aria-errormessage] [aria-describedby] [disabled]>
  <button type="button" class="td-dtp__trigger td-dtp__trigger--icon" id="{host}-trigger" aria-label="Chọn ngày"
          aria-haspopup="dialog" aria-expanded="false" [disabled]><span class="td-dtp__icon" data-td-icon="calendar" aria-hidden="true">svg</span></button>
  [button.td-dtp__clear …]   <!-- như trên -->
</div>
```

Hộp vẽ bằng `::before` của `.td-dtp--editable` (cùng hình trigger 0.62: nền, viền, bo, cao), trạng thái đọc từ các phần:
`:focus-within` (vòng focus — ô gõ không có vòng riêng), `data-state="open"`, `aria-invalid` trên ô gõ (viền đỏ), ô
`disabled`. Màu nền / viền theo token field ở trên; chế độ tương phản cao: viền `CanvasText`, focus `Highlight`, lỗi gạch đứt.

Markup PHP (0.56.0; từ 0.60.0 là `data-td-ssr="datetime-picker@2"` — JS vẫn nhận `@1` của markup in trước 0.60 trong lúc
nâng cấp dần, `@2` không có `min` / `max` ngầm 2000–2099, chỉ `max="9999-12-31"` khi site không đặt `max`) có thêm `input.td-dtp__native` (ô ngày native, `id="{host}-native"`)
giữa nhãn và trigger, nhãn `for="{host}-native"`; trước khi nâng cấp ô native mang hộp của trigger và trigger bị ẩn
(`td-datetime-picker:not(:defined)`); khi nâng cấp component gỡ ô native và trỏ nhãn sang trigger.

Lịch (0.60.0). `{p}` = `{host}-dtp{n}`, `n` tăng mỗi lần mở. Cây này là `div.td-dtp-pop` ở popover (gắn ở `<body>`, kèm
`role="dialog"`, `aria-label`, `td-glass-surface td-glass-surface--strong`) và là thân TdModal ở sheet (`td-dtp-pop--sheet`):

```html
<div class="td-dtp-pop" id="{p}-pop" data-mode="datetime|date|month|year" role="dialog" aria-label="Chọn ngày" data-state="open" data-placement="bottom|top">
  <div class="td-dtp-pop__scroll">                                   <!-- vùng cuộn duy nhất của popover -->
    <div class="td-cal" data-view="days|months|years">
      <div class="td-cal__head">
        <button type="button" class="td-cal__nav" data-dir="prev" aria-label="Tháng trước" [aria-disabled="true"]>…</button>
        <div class="td-cal__titles">
          <button type="button" class="td-cal__title" data-pick="month" aria-label="Tháng 6, chọn tháng" aria-pressed="false">Tháng 6</button>
          <button type="button" class="td-cal__title" data-pick="year" aria-label="2026, chọn năm" aria-pressed="false">2026</button>
          <span class="td-cal__heading" hidden>…</span>              <!-- chỉ ở mode year: tiêu đề không phải nút -->
        </div>
        <button type="button" class="td-cal__nav" data-dir="next" …>…</button>
      </div>
      <p class="td-sr-only td-cal__live" id="{p}-live" aria-live="polite">Tháng 6 năm 2026</p>
      <div class="td-cal__days">
        <table class="td-cal__grid" role="grid" aria-labelledby="{p}-live">
          <thead><tr><th class="td-cal__weekday" scope="col" abbr="Thứ Hai" aria-label="Thứ Hai">T2</th> … ×7</tr></thead>
          <tbody><tr>
            <td class="td-cal__day" role="gridcell" data-date="2026-06-15" tabindex="0" aria-selected="true" aria-current="date"
                aria-label="Thứ Hai, 15 tháng 6 năm 2026, hôm nay" [aria-disabled="true"] [data-outside]>15</td> … ×7 × 6 tuần
          </tr></tbody>
        </table>
      </div>
      <div class="td-cal__cells" data-kind="months" role="grid" hidden> <!-- 4 × 3 -->
        <div class="td-cal__row" role="row"><div class="td-cal__cell" role="gridcell" data-month="1" tabindex="-1" aria-selected="false">Tháng 1</div> …</div>
      </div>
      <div class="td-cal__cells" data-kind="years" role="grid" hidden>   <!-- 4 × 3, 12 năm một trang -->
        <div class="td-cal__row" role="row"><div class="td-cal__cell" role="gridcell" data-year="2017" …>2017</div> …</div>
      </div>
    </div>
    <!-- chỉ mode datetime (0.61.0): màn giờ `div.td-time-step[hidden]` = [button.td-cal__nav.td-time-step__back[data-action=back] + p.td-time-step__heading] + : -->
    <div class="td-dtp-pop__time" role="group" aria-labelledby="{p}-time">
      <p class="td-sr-only" id="{p}-time">Giờ</p>
      <div class="td-dtp-pop__wheels">
        <div class="td-dtp-wheel"><div class="td-dtp-wheel__list" role="listbox" id="{p}-hour" aria-label="Giờ" tabindex="0" data-part="hour"
             aria-activedescendant="{p}-hour-10"><div class="td-dtp-wheel__option" role="option" id="{p}-hour-10" aria-selected="true" data-value="10">10</div> …</div></div>
        <span class="td-dtp-wheel__sep" aria-hidden="true">:</span>
        <div class="td-dtp-wheel"><!-- minute --></div>
      </div>
    </div>
    <p class="td-dtp-pop__error" id="{p}-error" role="alert" hidden></p>   <!-- chỉ datetime -->
  </div>
  <div class="td-dtp-pop__actions">                                    <!-- popover: hàng nút ngoài vùng cuộn; sheet (0.61.0): CÙNG các nút `data-action` ở chân TdModal -->
    <button type="button" class="td-btn td-btn--secondary td-btn--sm" data-action="today|now">…</button>   <!-- date/month/year: Hôm nay · Tháng này · Năm nay; datetime: Bây giờ -->
    <button type="button" class="td-btn td-btn--primary td-btn--sm" data-action="confirm">Chọn</button>    <!-- chỉ datetime, chỉ hiện ở màn giờ -->
  </div>
</div>
```

| Ở đâu | Attribute trạng thái |
|---|---|
| `.td-dtp` | `data-state="open|closed"` |
| `.td-dtp__trigger` | `aria-expanded`, `aria-controls` (khi mở: id thật của hộp thoại — popover: `{host}-dtp{n}-pop`; sheet: id của TdModal), `:disabled`, `aria-invalid="true"` |
| `.td-dtp__value` | `data-placeholder` khi trống |
| `.td-cal` | `data-view="days|months|years"` |
| ô ngày / tháng / năm | `aria-selected`, `aria-current="date"` (hôm nay, chỉ ô ngày), `aria-disabled="true"`, `data-outside`, `tabindex` (đúng **một** ô `0`) |
| `.td-cal__nav` | `aria-disabled="true"` khi kỳ bên cạnh nằm ngoài khoảng (không dùng `disabled`: focus ở lại) |
| `.td-cal__title` | `aria-pressed` (nút tháng ở lưới tháng, nút năm ở lưới năm) |
| `.td-dtp-pop__error` | `[hidden]` khi không có lỗi |
| `.td-dtp-wheel__option` | `aria-selected="true"` |

Class `.td-dtp-panel*` (hộp thoại ba ô số) **đã gỡ hẳn** (0.61.0; `<td-datetime-range>` cũng dùng lịch). Selector ổn định cho test: `.td-dtp-pop[data-step]`, `[data-action="today|now|confirm|back"]` (popover VÀ chân sheet), `.td-cal [data-date]`.

JS không ghi style nào; bánh xe cuộn bằng `scrollTo`, dùng CSS scroll-snap.

## Bàn phím & trợ năng

**Nút trigger** (mẫu APG combobox có popup dialog): `Enter` / `Space` (click của nút) và `ArrowDown` (kể cả `Alt+ArrowDown`)
mở lịch; `Enter` không bao giờ submit form. Bấm chuột cũng mở. **Bấm ô khi lịch đang mở → đóng** (bỏ nháp, không `change`).

**Trong lịch** (mẫu APG *date picker dialog*; lưới ngày là **một** điểm Tab, ô hoạt động có `tabindex="0"`):

| Vị trí | Phím | Hành động |
|---|---|---|
| Mở | — | Focus vào ô hoạt động (ngày đã chọn, hoặc `open-at` / hôm nay kẹp vào `min`–`max`). |
| Lưới ngày | `←` `→` | ±1 ngày |
| | `↑` `↓` | ±1 tuần |
| | `Home` / `End` | Thứ Hai / Chủ Nhật của tuần |
| | `PageUp` / `PageDown` | ±1 tháng (ngày kẹp về cuối tháng: 31/01 → 28/02) |
| | `Shift+PageUp` / `Shift+PageDown` | ±1 năm (29/02 → 28/02) |
| | `Enter` / `Space` | Chọn ngày (xem bảng cam kết ở [mục 10](#10-lịch-0600)) |
| Lưới tháng | `←` `→` / `↑` `↓` | ±1 / ±3 tháng |
| | `Home` / `End` | Đầu / cuối hàng; `PageUp` / `PageDown` ±1 năm; `Enter` / `Space` chọn |
| Lưới năm | `←` `→` / `↑` `↓` | ±1 / ±3 năm |
| | `Home` / `End` | Đầu / cuối hàng; `PageUp` / `PageDown` ±12 năm; `Shift+PageUp` / `PageDown` ±120 năm |
| Mọi lưới | | Đích ngoài `min`–`max` hoặc ngoài năm 1–9999: dừng ở biên gần nhất (không nhảy sang ô bị khoá) |
| Bánh xe giờ / phút (mỗi bánh xe là **một** điểm Tab) | `ArrowUp` / `ArrowDown`; `PageUp` / `PageDown`; `Home` / `End` | ±1; ±6 giờ / ±15 phút; đầu / cuối (không vòng) |
| Mọi nơi | `Tab` | Vòng trong lịch (popover: bẫy Tab; WebKit cũng đi qua các nút) |
| Màn giờ (datetime) | `Backspace` | Về màn ngày (như nút "‹"); không mất giá trị |
| Nút "Chọn" (datetime, màn giờ) | | Có lỗi → giữ mở, hiện dòng lỗi, focus bánh xe giờ. Hợp lệ → ghi, một `change`, đóng, focus về trigger |
| `Escape` | | Đóng cả lịch ở **mọi khung**, bỏ nháp, focus về trigger (nút X của sheet cũng vậy) |

Mỗi lần đổi khung (ngày ↔ tháng ↔ năm) focus chuyển vào ô hoạt động của khung mới; vùng `aria-live="polite"` đọc đúng một lần
"Tháng 6 năm 2026" / "Năm 2026" / "2017 – 2028".

**Nút xoá** (0.59.0 `clearable`): một điểm Tab sau trigger; `Enter` / `Space` / bấm → xoá giá trị, focus về trigger
(nút ẩn đi). Tên "Xoá ngày" / "Xoá tháng" / "Xoá năm". Khi popover đang mở: xem [mục 10](#10-lịch-0600).

Trợ năng:

- Lưới là `<table role="grid">`: tên lưới = vùng đọc ("Tháng 6 năm 2026"), tiêu đề cột đủ chữ ("Thứ Hai"…), mỗi ô tên đủ
  ngày ("Thứ Hai, 15 tháng 6 năm 2026", kèm ", hôm nay"); `aria-selected` đúng một ô; `aria-current="date"` là hôm nay;
  `aria-disabled` chỉ ở ô ngoài khoảng. Popover **không** khai `aria-modal` (trang bên dưới không bị inert); sheet là modal thật.
- Option bánh xe không bao giờ nhận focus; dòng active **chính là** dòng được chọn (`aria-selected` và
  `aria-activedescendant` luôn đồng bộ).
- Lỗi của bản nháp (datetime) hiện trong `p[role=alert]`; hai bánh xe có `aria-describedby` trỏ tới dòng lỗi chỉ khi lỗi đang hiện.
- Tên truy cập của trigger: `label` → `aria-label` của host → `<label for="{host-id}">` ngoài.
- **Không còn hiệu ứng "cuộn từ 00" khi mở** (0.21.0 – 0.59.0; cả `<td-datetime-range>` từ 0.61.0): bánh xe căn ngay vào giá trị mỗi lần vào màn giờ. Bấm phím trên bánh xe vẫn cuộn mượt tới dòng mới.
- `prefers-reduced-motion`: bánh xe nhảy ngay khi bấm phím; popover chỉ mờ dần. `forced-colors`: ngày đã chọn dùng
  `Highlight` / `HighlightText`, hôm nay viền `CanvasText`, ngày khoá `GrayText`, focus `Highlight`.
- Cảm ứng (ADR 0019): ô ngày / tháng / năm, nút ‹ ›, dòng bánh xe cao ≥ 44px; hover chỉ trong cổng `hover: hover`; ‹ › có
  `touch-action: manipulation`.

## Bảo mật

`label`, `placeholder`, `value` (kể cả chuỗi sai) và mọi chuỗi trong `labels` / `messages` được render dạng **văn bản**
(escape hoặc `textContent`). Lịch dựng bằng DOM API, không dùng chuỗi HTML; hình học chỉ qua CSSOM (`placeFloating`), không
`style="…"`. `data-date` / `data-month` / `data-year` do component sinh từ số, không từ chuỗi của site.

## Lưu ý & lỗi thường gặp

- **In chuỗi DB vào `value`** → `badInput` (ở mode datetime). `value` nhận display hoặc ISO của mode; dùng
  `setDBValue()` hoặc đổi định dạng ở server.
- **Không có múi giờ.** Mọi giá trị là giờ tường (wall-clock) của người dùng. Nếu server lưu UTC, tự quy đổi trước khi
  hiển thị và sau khi nhận.
- **`getValue()` trả `''`** không có nghĩa là trống: có thể giá trị sai hoặc ngoài `min`/`max`. Kiểm tra `picker.validity`
  hoặc `picker.value` (chuỗi thô) để phân biệt.
- **Test cũ bấm một ngày rồi bấm "Chọn" ngay ở mode `datetime`** (0.61.0): bấm ngày giờ chuyển sang màn giờ — thêm một thao tác (chờ `[data-step="time"]`, rồi `[data-action="confirm"]`); chọn giờ qua bánh xe (ArrowUp / ArrowDown), không còn ô số.
- **Test cũ gõ vào `[data-part="day|month|year"]`, bấm "Chọn" ở mode `date`, hoặc khẳng định `.td-dtp-panel` biến mất** (0.60.0):
  ba ô số và nút đó không còn — dùng selector ở [mục 10](#10-lịch-0600). Khẳng định "không có `.td-dtp-panel`" nay **luôn đúng**.
- **Ngày sinh / dữ liệu cũ** (0.60.0): không cần `min` nữa — không có bound thì năm 1–9999 đều hợp lệ (trước 0.60.0 năm
  ngoài 2000–2099 bị từ chối). Hộp thoại vẫn mở tại hôm nay; muốn mở ở một ngày khác thì đặt `open-at` (0.19.0).
- **Xoá giá trị từ dữ liệu server rỗng**: `setDBValue(row.date ?? '')` xoá picker khi DB trả rỗng / `null` (0.19.0);
  trước 0.19.0 lệnh này bị bỏ qua và giá trị cũ còn lại.
- **`setValue()` im lặng**: không phát `change`. Nếu code khác phụ thuộc `change`, tự dispatch hoặc gọi hàm xử lý.
- **Lịch là popover (≥ 720px) hoặc bottom sheet TdModal (< 720px)**, chọn lúc mở. Mở từ bên trong một modal ở ≥ 720px: popover
  nổi lên trên modal (không phải modal thứ hai; Esc chỉ đóng popover); dưới 720px sheet xếp chồng như mọi TdModal. Các nút trong
  lịch dùng `.td-btn` của [button](button.md).

## Xem thêm

- [Modal](modal.md) · [Tiện ích: TdDateTime và các hàm parse/format](utilities.md)
- [Form validation](form-validation.md) · [Hướng dẫn form](../guides/forms.md)
- [Theming](../customization/theming.md) · [Extending (đổi ngôn ngữ nhãn)](../customization/extending.md) ·
  [Trợ năng](../guides/accessibility.md)
