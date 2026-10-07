[Tài liệu](../README.md) › [Components](README.md) › Number input

# Ô nhập số / tiền — `<td-number-input>`

Ô nhập số có **phân cách hàng nghìn** khi gõ (`12.990.000`), **hậu tố / tiền tố** (`₫`, `%`, `$`), `min` / `max` /
`step`, không nhận ký tự lạ, **dán** được số có dấu chấm / phẩy / đơn vị — nhưng form luôn gửi **số sạch**
(`12990000`). Dùng cho giá bán, giá vốn, ngưỡng cài đặt, hoàn tiền, tỉ lệ phần trăm. Giá trị tính bằng `BigInt` trên chuỗi
thập phân: chính xác tới **30 chữ số**, không bao giờ qua `Number` (không có lỗi `0.1 + 0.2`, không mất chính xác trên
9 triệu tỷ).

Khi nào dùng cái nào: cần số trần không định dạng (năm) → [input field](input-field.md) `type="number"`;
cần định dạng tiền / số lớn / dán từ Excel, hoá đơn → `<td-number-input>`; số lượng trong giỏ (nút − / +) →
`<td-number-input stepper>` ([mục 8](#8-stepper)).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/number-input'` (class: `import { TdNumberInput } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | có |
| Từ phiên bản | 0.30.0 (token-native: cần `td.css`; icon / slot affix + `locale` từ 0.55.0) |

## Ví dụ nhanh

```html
<form method="post" action="/products/42">
  <td-number-input name="price" label="Giá bán" suffix="₫" unit-label="đồng"
                   value="12990000" min="1000" required></td-number-input>
  <td-number-input name="rate" label="Hoa hồng" suffix="%" decimals="2" max="100" value="12.5"></td-number-input>
  <button type="submit">Lưu</button>
</form>

<script type="module">
  import '@dazzxq/td-components/number-input';
  document.querySelector('[name=price]').addEventListener('change', (e) => console.log(e.detail.value)); // "12990000"
</script>
```

Người dùng thấy `12.990.000 ₫`; `FormData` có `price=12990000`, `rate=12.5`.

## Cách dùng

### 1. Giá trị chuẩn

Mọi giá trị vào / ra (attribute `value` / `min` / `max` / `step`, property `value`, `FormData`, event) là **chuỗi thập
phân chuẩn**: `-?(0|[1-9][0-9]*)(\.[0-9]+)?` — dấu thập phân là `.`, không dấu nhóm, không đơn vị, tối đa 30 chữ số
(nguyên + lẻ). Phần hiển thị (`12.990.000`, `1.234,5`) chỉ là lớp vẽ.

#### Tối đa N chữ số lẻ — không đệm, không làm tròn

- **Không làm tròn, không cắt, không đệm.** `decimals` là số chữ số lẻ **tối đa**; giá trị giữ đúng số chữ số lẻ đã gõ:
  gõ `6,7` (`decimals="2"`) → hiện `6,7`, gửi `6.7` (không thành `6,70`); gõ `6,70` → giữ `6,70` / `6.70`; chữ số lẻ thứ 3
  bị chặn (không làm tròn `6,789` → `6,79`). Attribute `value="1.234"` khi `decimals="2"` → bị **bỏ** + một cảnh báo console
  (không lặng lẽ thành `1.23`). Cùng luật cho `min` / `max` / `step` và `setValue()`. (Có test khoá từ 0.55.0.)
- **Thấy `6,70` dù không gõ số 0?** Gần như luôn là **dữ liệu** đã đệm: cột `DECIMAL(10,2)` trả `"6.70"` và trang in nguyên
  chuỗi đó vào `value`. Kit giữ đúng chuỗi được đưa vào (đó là dữ liệu, không phải định dạng). Muốn hiện `6,7`: chuẩn hoá ở
  site trước khi in — PHP `rtrim(rtrim($v, '0'), '.')` (chỉ khi chuỗi có dấu `.`), JS
  `v.includes('.') ? v.replace(/\.?0+$/, '') : v`.
- **Rỗng ≠ 0.** Ô trống gửi `name=""` (giống `<input>` native; Laravel `ConvertEmptyStringsToNull` → `null`); `required`
  → `valueMissing`. Không bao giờ tự thành `0`.
- **`min` vắng = sàn ngầm 0** (không nhận số âm — đúng cho tiền / ngưỡng). Cần số âm (điều chỉnh ±) → đặt `min` âm
  tường minh, ví dụ `min="-1000000"`.
- **30 chữ số** là giới hạn cứng: gõ chữ số thứ 31 không có tác dụng, dán quá 30 bị từ chối. Server nên lưu
  `BIGINT` / `DECIMAL(p, s)` và đặt `max` tương ứng.
- `valueAsNumber` (chỉ đọc) = `Number(value)`, `NaN` khi rỗng — **tiện ích**, mất chính xác trên
  `Number.MAX_SAFE_INTEGER` (9.007.199.254.740.991). Tính tiền thì dùng chuỗi `value` (hoặc `BigInt` / thư viện decimal).

### 2. Gõ

- Chỉ nhận chữ số (kể cả chữ số full-width / Ả Rập – Ấn, tự đổi sang ASCII), **một** dấu thập phân (khi `decimals > 0`),
  dấu `-` ở đầu (khi `min < 0`). Phím sai cấu trúc (chữ cái, dấu thập phân thứ hai, `-` giữa số, chữ số lẻ vượt `decimals`,
  chữ số thứ 31) bị **bỏ** — ô không đổi, không phát `input`.
- Dấu nhóm tự thêm khi gõ; **con trỏ không nhảy** (gõ giữa nhóm vẫn đứng sau chữ số vừa gõ). Backspace ngay sau dấu nhóm
  (`12.|990`) xoá **chữ số trước nó** (`1.990`); Delete ngay trước dấu nhóm xoá chữ số sau nó — không bị "kẹt".
- Phím `.` của **bàn phím số** (NumpadDecimal) luôn ra dấu thập phân của ô (người dùng vi bấm `.` vẫn ra `,`).
- **0.55.0 — bàn phím ảo:** bàn phím `decimal` của iOS / Android hiện dấu thập phân **theo máy**, không theo ô (máy tiếng Anh
  chỉ có `.` trong ô vi dùng `,`). Khi `decimals > 0` và ô **chưa** có dấu thập phân (ngoài vùng chọn), gõ `.` **hoặc** `,` —
  kể cả khi đó là dấu nhóm của ô — ra **dấu thập phân của ô**. Dấu nhóm không bao giờ cần gõ (kit tự thêm). `decimals = 0`
  hoặc đã có dấu thập phân: phím đó bị bỏ như trước. Dán / tự điền không đổi (luật mục 3).
- `min` / `max` **không chặn gõ** (`min="1000"` vẫn gõ được "5" trước "000").
- Không đổi giá trị khi lăn chuột (khác `type=number` native — một nguồn lỗi nhập tiền).
- Rời ô: `12,` → `12`; chỉ `-` → rỗng.
- **Hoàn tác:** sau khi ô tự định dạng lại, Ctrl+Z không có lịch sử đầy đủ (giá trị được ghi bằng JS) — giới hạn đã biết.

### 3. Dán (và tự điền)

Dán **chỉ chữ số** → chèn tại vùng chọn (từ chối nếu kết quả vượt 30 chữ số hoặc chữ số lẻ vượt `decimals`). Dán thứ khác
→ đọc **cả chuỗi** rồi **thay toàn bộ giá trị**, chính xác, *từ chối thay vì đoán* (tiền không được lặng lẽ đổi):
bỏ khoảng trắng (cả NBSP, thin space), bóc **một** đơn vị đầu / cuối (`₫ đ vnd vnđ $ € %` + `prefix` / `suffix` của ô,
không phân biệt hoa thường), rồi phân loại `.` / `,`:

- có cả hai → dấu xuất hiện **cuối** là thập phân;
- một loại, ≥ 2 lần → dấu nhóm;
- một loại, 1 lần, sau nó đúng 3 chữ số → dấu nhóm khi `decimals < 3`, ngược lại theo quy ước của ô;
- một loại, 1 lần, sau nó không phải 3 chữ số → thập phân.

Nhóm phải hợp lệ (nhóm đầu 1–3 chữ số, các nhóm sau đúng 3). Bị từ chối → ô không đổi + thông báo "Không dán được: giá trị
không hợp lệ" (live region).

| Dán | `decimals=0` | `decimals=2` |
|---|---|---|
| `1.234.567` | `1234567` | `1234567` |
| `1,234,567` | `1234567` | `1234567` |
| `1.234,5` | từ chối (số lẻ) | `1234.5` |
| `1,234.50` | từ chối | `1234.50` |
| `12 990 000 ₫` | `12990000` | `12990000` |
| `1.234` / `1,234` | `1234` | `1234` |
| `1,5` / `1.5` | từ chối | `1.5` |
| `1.23.456` / `12abc` / `1e5` | từ chối | từ chối |
| `-1.000` (min ≥ 0) | từ chối | từ chối |
| `１２３` (full-width) | `123` | `123` |

Tự điền của trình duyệt / trình quản lý mật khẩu dùng cùng luật. Kéo thả vào ô bị chặn.

### 4. Ngoài khoảng: báo lỗi, không tự sửa

Mặc định giá trị ngoài `[min, max]` được **báo** (`rangeUnderflow` / `rangeOverflow`, thông báo có số đã định dạng + đơn
vị: "Giá trị tối thiểu là 1.000 ₫"), **không** tự sửa — tự kẹp im lặng một số tiền (hoàn 15tr → 10tr) là nguy hiểm.
`clamp` (opt-in) kẹp vào khoảng **khi rời ô** và thông báo "Đã chỉnh về 10.000.000 ₫". ↑ / ↓ luôn ở trong khoảng.

```html
<td-number-input name="refund" label="Hoàn tiền" suffix="₫" max="10000000" validate-on="blur"></td-number-input>
<td-number-input name="threshold" label="Ngưỡng" suffix="₫" min="0" max="10000000" clamp></td-number-input>
```

### 5. Bước (`step`) và bàn phím

↑ / ↓ cộng / trừ `step` (mặc định 1 đơn vị nguyên), PageUp / PageDown ×10, luôn kẹp trong khoảng; ô rỗng → `0` kẹp vào khoảng (vd. `min="1000"` → `1000`).
Giá trị lệch bước nhảy tới giá trị đúng bước kế tiếp theo hướng bấm (như `stepUp()` native; gốc = `min` nếu có, không thì
0). `stepMismatch` chỉ khi có attribute `step`. `step` phải > 0 (`0` / âm → bỏ + cảnh báo).

### 6. Đổi `decimals` khi đã có giá trị

`min` / `max` / `step` được kiểm lại theo `decimals` mới (sai → bỏ + cảnh báo). Giá trị hiện tại **không bị sửa** (không cắt
dữ liệu): nhiều chữ số lẻ hơn → giữ nguyên, hiển thị đủ, `badInput` ("Tối đa 0 chữ số thập phân") cho tới khi người dùng /
`setValue()` sửa; FormData vẫn gửi đúng chuỗi đó (server tự kiểm như mọi giá trị).

### 7. Render phía server (PHP)

`td_number_input('price', $price, ['label' => 'Giá bán', 'suffix' => '₫', 'element' => true])` in host + control native
`type=number` với giá trị **chuẩn** (không có JS vẫn gửi số sạch, trình duyệt tự kiểm khoảng / bước; chưa có dấu chấm
hàng nghìn). Module tải → nhận tại chỗ, hiện `12.990.000`. Helper PHP chỉ nhận giá trị kiểu `string` / `int` (`float`
`12.5` bị từ chối, không lặng lẽ thành `12` — truyền `'12.5'`). Chi tiết option và id:
[Adapter PHP › td_number_input](../guides/php-adapter.md#td_number_input-0300).

### 8. Stepper

`stepper` (0.49.0) thêm nút − / + ở hai đầu ô — số lượng trong giỏ, số khách, số phòng. Mọi thứ khác (gõ, dán, ↑ / ↓,
`clamp`, validity, reset, SSR) y hệt; dùng đúng `decimals` / `step` của ô (không giới hạn số nguyên).

```html
<td-number-input name="qty" label="Số lượng" stepper min="1" max="5" value="1" clamp></td-number-input>
```

- Bấm − / + = ↑ / ↓ (± `step`, kẹp khoảng; ô rỗng → `min`). Mỗi lần bấm làm đổi giá trị phát **`input` và `change` ngay**
  (như nút xoay native) và đọc giá trị mới qua live region ("2 cái").
- **Biên:** giá trị ≤ `min` → nút − `aria-disabled` (vẫn bấm được nhưng không làm gì — không mất focus, không nuốt cú bấm kế
  tiếp vào trang); ≥ `max` → nút + tương tự. Ô rỗng → cả hai bật. Đổi `min` / `max` / `step` lúc chạy → biên cập nhật tại
  chỗ. Host `disabled` / `readonly` / `<fieldset disabled>` → hai nút `disabled`.
- **Focus không đi đâu:** nút ngoài vòng Tab (`tabindex="-1"`; bàn phím đã có ↑ / ↓ / PageUp / PageDown + gõ). Bấm nút không
  lấy focus: ô đang gõ vẫn focus (và rời ô sau đó không phát `change` lần hai), ô chưa focus vẫn không focus (không bật bàn
  phím ảo khi chạm +). Trình đọc màn hình di động / Switch Control vẫn tới nút (duyệt cây trợ năng).
- Tên nút: `messages.decrease` / `increase` = "Giảm {label}" / "Tăng {label}" (`{label}` = `label` hoặc `aria-label`; không có
  → "Giảm" / "Tăng"), `aria-controls` = id ô.
- Chữ số căn **giữa** (ngoại lệ có chủ đích: ô hẹp chỉ số lượng); host rộng `--td-number-stepper-w` (9rem).
- Không nhấn giữ tự lặp (số lượng giỏ nhỏ; số lớn thì gõ).

**Công thức giỏ hàng** — bấm + liên tục phát nhiều `change`; app gộp lệnh cập nhật giỏ bằng `debounce`:

```js
import { debounce } from '@dazzxq/td-components/dom-utils';
const save = debounce((qty) => fetch('/cart/line/42', { method: 'PATCH', body: new URLSearchParams({ qty }) }), 400);
document.querySelector('td-number-input[name=qty]').addEventListener('change', (e) => save(e.detail.value));
```

`max` = giới hạn của app (tồn / giới hạn giỏ); server vẫn kiểm tồn khi đặt hàng. Nút xoá dòng khi số lượng về 1 là của app.

PHP: `td_number_input('qty', 1, ['element' => true, 'stepper' => true, 'min' => '1', 'max' => '5'])` in thêm hai nút — ẩn
nhưng **giữ chỗ** tới khi module tải (không xô lệch, không có nút chết khi chưa có JS). Chế độ native (`element` false) bỏ qua
`stepper` (ô `type=number` có nút xoay của trình duyệt).

### 9. Tiền tố / hậu tố: icon và phần tử của trang (0.55.0)

Chữ `prefix` / `suffix` có từ 0.30. Từ 0.55.0 thêm **icon** và **phần tử của trang** — cùng API, cùng hộp với
[input field](input-field.md#tiền-tố--hậu-tố-chữ-icon-phần-tử-của-trang-0550):

```html
<td-number-input name="price" label="Giá bán" suffix="₫" suffix-icon="lock" unit-label="đồng"></td-number-input>
<td-number-input name="fee" label="Phí" decimals="2" suffix="%">
  <button type="button" slot="prefix" aria-label="Giải thích phí">?</button>
</td-number-input>
```

- `prefix-icon` / `suffix-icon`: tên icon registry, nằm **trong** span affix của bên đó, ở mép ngoài (`[icon]$` / `₫[icon]`),
  trang trí. Không icon / không slot: markup **giống hệt** 0.54.
- Con `[slot="prefix"|"suffix"]`: chuyển (cùng node) vào `span.td-number__affix--slot` cạnh ô; thắng chữ / icon của bên đó
  (ẩn đi + một cảnh báo). Đọc ở lần render đầu; kit không đụng ngữ nghĩa (nút: tự đặt tên + `type="button"`). Với `stepper`:
  nằm giữa nút − / + và ô. Bấm nút trong slot không cướp focus.
- Đơn vị đọc qua mô tả như cũ (`unit-label` → `suffix` → `prefix`).

### 10. `locale` — chỉ suy ra dấu phân cách (0.55.0)

```html
<td-number-input name="amount" label="Amount" locale="en-US" decimals="2" prefix="$"></td-number-input> <!-- 1,234,567.5 -->
<td-number-input name="prix" label="Prix" locale="fr" decimals="2" suffix="€"></td-number-input>         <!-- 1 234 567,5 -->
```

- `locale` (BCP 47) chỉ quyết định **dấu nhóm** và **dấu thập phân**. Giá trị vẫn định dạng bằng luật mục 1–3 (BigInt, không
  làm tròn / đệm) — `Intl.NumberFormat` **không** được dùng để in số (nó làm tròn VND về 0 lẻ, đệm USD thành 2 lẻ, không nhóm
  số 4 chữ số ở `es`, nhóm lakh ở `en-IN`, đổi chữ số ở `ar`).
- Bảng cố định (không phân biệt hoa thường, tra **cả thẻ** — thẻ vùng có trong bảng hoặc không, không rơi ngầm về ngôn ngữ):

  | Thẻ | Nhóm | Thập phân |
  |---|---|---|
  | `vi` `vi-VN` · `de` `de-DE` · `id` `id-ID` · `pt` `pt-BR` · `es` `es-ES` · `it` `it-IT` · `nl` `nl-NL` | `.` | `,` |
  | `en` `en-US` `en-GB` · `ja` `ja-JP` · `ko` `ko-KR` · `zh` `zh-CN` `zh-TW` · `th` `th-TH` | `,` | `.` |
  | `fr` `fr-FR` · `ru` `ru-RU` · `pl` `pl-PL` · `de-AT` | khoảng trắng | `,` |

- Thẻ **ngoài bảng** (chỉ JS): suy từ `Intl` của trình duyệt, nhận khi dấu nhóm là `.` / `,` / khoảng trắng (NBSP / NNBSP
  → khoảng trắng thường) và dấu thập phân `,` / `.`, khác nhau, và Intl không rơi sang ngôn ngữ khác (`pt-PT` → khoảng trắng
  / `,`; `en-IN`, `es-MX` → `,` / `.`). Không dùng được (`de-CH` dùng `'`, `ar-*`, tag sai, ngôn ngữ lạ) → `.` / `,` mặc định
  + một cảnh báo console.
- **Thứ tự thắng:** `group-separator` / `decimal-separator` tường minh > `locale` > mặc định. Giải theo **cặp**: bên tường
  minh thắng, bên suy ra tự tránh nếu trùng (`locale="de" group-separator=","` → thập phân `.`; `locale="en"
  decimal-separator=","` → nhóm `.`). Không có `locale`: y hệt 0.54.
- Đổi `locale` lúc chạy định dạng lại **tại chỗ** (cùng ô, giữ focus, không phát event). Dán đọc theo dấu thập phân của
  locale. Giá trị gửi đi luôn là số chuẩn.
- **PHP** `'locale' => 'en-US'`: tra cùng bảng (không cần ext-intl), in `group-separator` / `decimal-separator` tường minh
  lên host (không in `locale` — markup hydrate không phụ thuộc ICU của trình duyệt). Thẻ ngoài bảng → mặc định +
  `E_USER_WARNING`.
- Giới hạn có chủ đích: nhóm luôn 3 chữ số (`en-IN` ra `1,234,567`, `es` nhóm cả số 4 chữ số), không đổi chữ số (Ả Rập),
  không có `currency` (đơn vị: `prefix` / `suffix` / `unit-label`), không đọc `<html lang>` để tự chọn.

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `name` | string | — | Tên field khi submit. |
| `value` | chuẩn | `''` | Giá trị **mặc định** (dạng chuẩn). Đổi sau khi render → đặt luôn giá trị sống (không event). `form.reset()` về giá trị này. |
| `label` | string | — | Nhãn hiển thị (`<label for>` nội bộ). |
| `placeholder` | string | — | |
| `helper-text` / `error-text` | string | — | Ghi chú / lỗi dưới ô (error contract). 0.54.0: có lỗi thì ghi chú ẩn; nội dung giàu: `<td-hint>` con — [Hint](hint.md). |
| `size` | `sm` \| `md` \| `lg` | `md` | Cỡ như input field. |
| `required` / `disabled` / `readonly` | boolean | — | |
| `min` / `max` | chuẩn | `min` vắng = `0` | Khoảng hợp lệ (báo lỗi, không chặn gõ). `min` âm mới nhận số âm. |
| `step` | chuẩn, > 0 | 1 (cho ↑ / ↓) | Bước của ↑ / ↓ + `stepMismatch` (chỉ khi có attribute). |
| `decimals` | `0`–`10` | `0` | Số chữ số lẻ tối đa. |
| `group-separator` | `.` \| `,` \| ` ` \| `` | `.` (theo `locale`) | Dấu nhóm hàng nghìn (`""` = không nhóm). |
| `decimal-separator` | `,` \| `.` | `,` (`.` khi nhóm là `,`; theo `locale`) | Trùng dấu nhóm → về mặc định + cảnh báo. |
| `locale` | BCP 47 | — | 0.55.0: suy ra hai dấu phân cách ([mục 10](#10-locale--chỉ-suy-ra-dấu-phân-cách-0550)); dấu tường minh thắng. Đổi lúc chạy: tại chỗ. |
| `prefix` / `suffix` | string | — | Đơn vị trang trí trong hộp (`$`, `₫`, `%`), `aria-hidden`. Đặt bằng attribute (`el.prefix` là property native của DOM). |
| `prefix-icon` / `suffix-icon` | string | — | 0.55.0: tên icon registry trong span affix (mép ngoài), trang trí. Đổi = vẽ lại (giữ giá trị, focus, con trỏ). |
| `unit-label` | string | `suffix` / `prefix` | Chữ trình đọc màn hình đọc cho đơn vị (vd. `đồng`), qua `aria-describedby`. |
| `clamp` | boolean | — | Kẹp vào `[min, max]` khi rời ô + thông báo. |
| `inputmode` | string | tự suy | Ghi đè bàn phím ảo. Mặc định: `numeric` (không lẻ, không âm) / `decimal` (có lẻ) / `text` (cho phép âm — bàn phím số iOS không có dấu trừ). |
| `enterkeyhint` | string | — | 0.36.2: nhãn phím Enter của bàn phím ảo — `enter` · `done` · `go` · `next` · `previous` · `search` · `send` (giá trị khác bị bỏ); chuyển xuống ô tại chỗ, không render lại. SSR: áp sau khi nhận markup. |
| `validate-on` | `blur` \| `change` \| `input` | — | Tự hiện thông báo ràng buộc thành lỗi. |
| `aria-label` | string | — | Tên truy cập khi không có `label`. |
| `stepper` | boolean | — | 0.49.0: nút − / + quanh ô ([mục 8](#8-stepper)). Thuộc tính cấu trúc: bật / tắt lúc chạy → vẽ lại, giữ giá trị + focus. |

Dấu phân cách là attribute — kit **không đọc** cài đặt tiền tệ nào của site (đó là logic của app).

## Property & method

| Thành viên | Kiểu / chữ ký | Mô tả |
|---|---|---|
| `value` | `string` | Giá trị chuẩn (`''` = rỗng). Gán = `setValue()`. |
| `valueAsNumber` | `number` (chỉ đọc) | `Number(value)`, `NaN` khi rỗng; mất chính xác trên 2^53. |
| `getValue()` / `setValue(v)` | | `setValue` nhận chuỗi chuẩn hoặc `number` hữu hạn mà `String(n)` không có `e`; sai → `''` + cảnh báo. Không phát event. |
| `setHelper(msg)` | `(string) => void` | Ghi chú runtime. |
| `helperMessage` | `string` (chỉ đọc) | 0.54.0: ghi chú đang áp. |
| `setError(msg)` / `clearError()` / `errorMessage` | | Error contract. |
| `form`, `validity`, `validationMessage`, `willValidate`, `checkValidity()`, `reportValidity()` | | Như control native. |
| `TdNumberInput.messages` | static | Văn bản (dưới). |

```js
import { TdNumberInput } from '@dazzxq/td-components/number-input';
Object.assign(TdNumberInput.messages, {
  valueMissing: 'Required', badInput: 'Invalid number', rangeUnderflow: 'Minimum is {min}', rangeOverflow: 'Maximum is {max}',
  stepMismatch: 'Must be a multiple of {step}', tooManyDecimals: 'At most {decimals} decimals',
  pasteRejected: 'Could not paste: invalid number', clamped: 'Adjusted to {value}',
  decrease: 'Decrease {label}', increase: 'Increase {label}', // 0.49.0 stepper
});
```

Mặc định: `valueMissing` "Trường này là bắt buộc", `badInput` "Giá trị không hợp lệ", `rangeUnderflow` "Giá trị tối thiểu là
{min}", `rangeOverflow` "Giá trị tối đa là {max}", `stepMismatch` "Giá trị phải theo bước {step}", `tooManyDecimals` "Tối đa
{decimals} chữ số thập phân", `pasteRejected` "Không dán được: giá trị không hợp lệ", `clamped` "Đã chỉnh về {value}",
`decrease` / `increase` "Giảm {label}" / "Tăng {label}" (0.49.0, tên nút stepper).
`{min}` / `{max}` / `{value}` đã định dạng kèm đơn vị.

## Event

| Event | detail | Khi nào |
|---|---|---|
| `input` | `{ value }` | Mỗi lần **giá trị chuẩn** đổi do người dùng (gõ, xoá, dán, ↑ / ↓, kẹp khi rời ô). Phím bị từ chối không phát. |
| `change` | `{ value }` | Rời ô, nếu giá trị khác lúc focus; 0.49.0: **ngay** sau mỗi lần bấm − / + làm đổi giá trị (`input` + `change`). |

`input` / `change` native của ô bên trong **dừng ở host**; `e.target` là host → `e.target.value` luôn là số sạch (không lỡ
đọc chuỗi đã định dạng). Gán `value` / `setValue()` / `form.reset()` không phát event.

## Tuỳ biến giao diện

Hộp dùng token của field (`--td-field-*`: nền, viền, bo góc, chiều cao theo `size`, viền focus + quầng, lỗi, disabled,
readonly) — nhìn y hệt input field. Thêm:

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-number-affix-fg` | `var(--td-field-affix-fg)` (0.55.0; = `var(--td-color-text-muted)`) | Màu chữ / icon tiền tố / hậu tố (≥ 4.7:1 trên nền ô) |
| `--td-number-affix-gap` | `var(--td-field-affix-gap)` (0.55.0; = `var(--td-space-2xs)`) | Khoảng cách affix ↔ số |
| `--td-field-affix-icon` | `1.125em` | 0.55.0: cỡ icon affix (dùng chung với input field) |
| `--td-number-step-size` | `2.5rem` | 0.49.0: bề rộng nút − / + (≥ 44px trên cảm ứng) |
| `--td-number-step-fg` | `var(--td-control-fg)` | 0.49.0: icon − / + (≥ 3.2:1; `aria-disabled` dùng màu disabled của nút, ≥ 2.2:1) |
| `--td-number-stepper-w` | `9rem` | 0.49.0: bề rộng host ở chế độ `stepper` |

Số căn **trái** (như mọi ô nhập — không đổi thói quen gõ), chữ số dạng bảng (`tabular-nums`).

## Cấu trúc DOM & class

```html
<td-number-input id="p" name="price" label="Giá bán" suffix="₫" unit-label="đồng">
  <div class="td-field td-field--md td-number">
    <label class="td-field__label" id="p-label" for="p-control">Giá bán</label>
    <div class="td-number__box">
      <input type="text" class="td-number__control" id="p-control" inputmode="numeric" autocomplete="off" spellcheck="false"
             aria-describedby="p-unit p-note">
      <span class="td-number__affix td-number__affix--suffix" aria-hidden="true">₫</span>
      <span id="p-unit" hidden>đồng</span>
    </div>
    <div class="td-field__footer" hidden>[<span class="td-field-error" …>]<div class="td-field__note" id="p-note" hidden></div></div>
    <span class="td-sr-only" id="p-status" role="status"></span>
  </div>
</td-number-input>
```

- Trạng thái đọc từ control: `:focus` (hộp có `:focus-within`), `:disabled`, `[readonly]`, `[aria-invalid="true"]`.
- Bấm vào hộp / affix → focus ô (0.55.0: trừ nút / link / ô trong slot).
- 0.55.0: icon affix = `span.td-number__affix-icon[data-td-icon][data-td-icon-class="td-number__affix-svg"]` bên trong
  `span.td-number__affix`; slot = `span.td-number__affix.td-number__affix--{side}.td-number__affix--slot` (do JS gắn sau
  bind, không `aria-hidden`) ngay trước / sau ô. Luật hộp dùng chung với input field (`field.css`,
  `:is(.td-number__box, .td-field__box)`).
- `stepper` (0.49.0): `.td-field` thêm `td-number--stepper`; hộp = `button.td-number__step.td-number__step--down` (`type=button`,
  `tabindex=-1`, `aria-controls`, `aria-label`, icon `minus`) + [tiền tố] + ô + [hậu tố] + [đơn vị ẩn] +
  `button.td-number__step.td-number__step--up` (icon `plus`); biên = `aria-disabled="true"`.

### Hợp đồng SSR `number-input@1` — hydrate tại chỗ

[ADR 0012](../internal/decisions/0012-ssr-hydration.md). Markup `td_number_input(…, ['element' => true])` = host
`<td-number-input data-td-ssr="number-input@1">` + đúng cây trên, nhưng control là `type="number"` mang thêm `name` /
`value` (chuẩn) / `min` / `max` / `step` / `required` cho chế độ không JS.

- **Nhận tại chỗ** khi: dấu `number-input@1`; cấu trúc đúng `render()` (nhãn + `*` ⇔ `required`, hộp + affix + chữ đơn vị,
  control `type=number|text` + id đúng, footer, live region `span`); attribute trong allowlist; `name` / `required` /
  `disabled` / `readonly` / `min` / `max` / `step` của control khớp host.
- **Cam kết chỉ gồm: giữ node, focus và giá trị.** Property `value` gán trước khi define thắng; rồi giá trị native người
  dùng đã gõ; rồi attribute. Control trước JS là `type=number` (không có API vùng chọn) nên con trỏ **không** được khôi
  phục — sau khi định dạng có thể về cuối ô (ca hiếm: đang gõ đúng lúc module tải).
- **Thứ tự:** ElementInternals trước, rồi đổi `type` → `text` trên **cùng node**, gỡ `name` / `value` / `min` / `max` /
  `step` / `required` → FormData đúng một mục. `<label for="{id control}">` ngoài host chuyển sang host.
- Không khớp (markup bị sửa, `p` thay cho `span`, input thứ hai, attribute lạ, dấu `@2`…) → render an toàn ngay, giữ giá trị
  + focus.
- `stepper` (0.49.0, schema **vẫn** `@1`): hai nút được so đúng `render()` (thẻ, `type`, class, `tabindex`, `aria-controls`,
  ô icon); tên nút là trạng thái (áp sau khi nhận, không so). Kit cũ gặp markup có nút → từ chối → render an toàn (không hỏng).
- 0.55.0 (schema **vẫn** `@1`, chỉ thêm): `prefix_icon` / `suffix_icon` in ô icon kèm SVG inline trong span affix (so theo
  attribute, vẽ lại cùng hộp); `locale` in thành `group-separator` / `decimal-separator` → nhận tại chỗ. Không dùng option mới:
  markup giống từng byte 0.54.

## Bàn phím & trợ năng

| Phím | Tác dụng |
|---|---|
| 0–9, dấu thập phân, `-` (khi cho phép) | Nhập |
| `.` bàn phím số | Dấu thập phân của ô |
| `.` hoặc `,` khi `decimals > 0` và chưa có dấu thập phân | 0.55.0: dấu thập phân của ô (bàn phím ảo theo máy) |
| ↑ / ↓ | ± `step` (kẹp khoảng) |
| PageUp / PageDown | ± 10 × `step` |
| (chuột / chạm) − / + | ± `step` — `stepper`, ngoài vòng Tab |
| Backspace / Delete qua dấu nhóm | Xoá chữ số bên kia dấu nhóm |
| Ctrl/⌘+V | Dán (luật mục 3) |

- **Textbox thường, không `role="spinbutton"`**: việc chính là gõ số đã định dạng; spinbutton buộc `aria-valuenow` là số
  thực (sai trên 2^53) và VoiceOver thao tác spinbutton trên ô gõ được không ổn định. ↑ / ↓ là tiện ích thêm như native.
- Tên: nhãn nội bộ → `aria-label` host → `<label for>` ngoài. Mô tả (`aria-describedby`): id của trang + đơn vị + ghi
  chú + lỗi. Từ chối dán / kẹp được đọc qua live region.

## Bảo mật

- `label`, `prefix`, `suffix`, `unit-label`, `helper-text`, `error-text`, `placeholder` đều là text (escape / `textContent`).
  `prefix-icon` / `suffix-icon` là tên tra registry; con `[slot]` là node của chính trang (không có chuỗi HTML). `locale`
  chỉ chọn trong tập dấu cố định (`.` `,` khoảng trắng) — không bao giờ chèn ký tự Intl trả về khác tập đó.
- Giá trị gửi đi chỉ có thể là chuỗi chuẩn (hoặc rỗng) — không có đường nào để chuỗi định dạng lọt vào FormData.
- Server **vẫn phải** kiểm giá trị (khoảng, bước, số lẻ) và parse bằng kiểu chính xác (`BIGINT` / `DECIMAL`, `bcmath`,
  `brick/math`) — đừng ép qua `float`, đừng `(int) "12.990.000"`.

## Cảm ứng

- `enterkeyhint` (0.36.2) đặt nhãn phím Enter trên bàn phím ảo (`next` cho form nhiều ô, `done` cho ô cuối). Trong dialog, ô đang nhập luôn nằm trên bàn phím (xem [modal](modal.md#cảm-ứng)).
- Hộp số không có hình nhấn (focus ring là phản hồi). Nút − / + của `stepper` có hình nhấn (chỉ đổi màu), ≥ 44px trên cảm
  ứng, `touch-action: manipulation` (bấm + nhanh nhiều lần không phóng to trang trên iOS).

Chuẩn chung: [Cảm ứng](../guides/touch.md).

## Lưu ý & lỗi thường gặp

- **`value` attribute bị bỏ + cảnh báo console** → không ở dạng chuẩn (`12.990.000`, `1,5`, nhiều số lẻ hơn `decimals`).
  Truyền `12990000`, `1.5`.
- **Không gõ được số âm** → `min` vắng = sàn 0; đặt `min` âm.
- **Không gõ được `.`** trong ô vi → 0.55.0: khi `decimals > 0`, `.` ra `,`; với `decimals = 0` thì không có phần lẻ.
- **`el.prefix = '$'` không có tác dụng** → `prefix` là property native của DOM (namespace); dùng `setAttribute('prefix', '$')`.
- **Server nhận `12`** → đang đọc ô không phải td-number-input (hoặc tự ghép chuỗi hiển thị); `FormData` của component luôn
  là số sạch.
- Không có: nhóm kiểu Ấn Độ (lakh), định dạng bằng `Intl` (`locale` chỉ chọn dấu phân cách), `currency`, làm tròn / pad
  phần lẻ, rút gọn `K` / `M`, ngoặc kế toán, số khoa học, nhấn giữ − / + để tự lặp.

## Xem thêm

- [Input field](input-field.md) · [Repeater](repeater.md) · [Choice group](choice-group.md) · [Form validation](form-validation.md)
- [Adapter PHP › td_number_input](../guides/php-adapter.md#td_number_input-0300) · [Form](../guides/forms.md) ·
  [Trợ năng](../guides/accessibility.md) · [Theming](../customization/theming.md)
