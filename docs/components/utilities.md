[Tài liệu](../README.md) › [Components](README.md) › Utilities

# Tiện ích — `dom-utils`, `TdDateTime` và các helper

Các hàm/lớp tiện ích không phải component: định dạng số, dung lượng, slug tiếng Việt, debounce/throttle, tính tương phản
màu, định dạng và phân tích ngày giờ. Tất cả **thuần** (không đụng DOM, không gọi mạng), chạy được cả trong Node lẫn trình
duyệt; không component nào bắt bạn phải dùng chúng.

| | |
|---|---|
| Import | `@dazzxq/td-components/dom-utils` · `@dazzxq/td-components/datetime` (hoặc `TdDateTime` từ entry gốc) |
| Loại | Tiện ích (hàm / lớp tĩnh) |
| Form-associated | không |
| Từ phiên bản | `TdDateTime` 0.1.0 · `dom-utils` 0.4.0 · helper "parts" ngày giờ 0.10.0 |

## Cái nào là API công khai?

Chỉ những module có trong `exports` của `package.json` mới là API công khai (được giữ ổn định, ghi trong breaking
changes khi đổi):

| Subpath | Nội dung | Tài liệu |
|---|---|---|
| `./dom-utils` | `slugify`, `formatFileSize`, `formatNumber`, `debounce`, `throttle`, `parseColorToRgb`, `relativeLuminance`, `contrastRatio`, `getAccessibleTextColor` | [trang này](#dom-utils) |
| `./datetime` | `TdDateTime` + các helper "parts" (`parseDisplay`, `formatDb`…) | [trang này](#tddatetime) |
| `./icons` | `tdIcon`, `registerIcons`, `hasIcon`, `listIcons`, `fillIconSlots`, `svgStringToDefinition`, `renderIconDefinition` | [Icons](icons.md) |
| `./icon-element` | định nghĩa `<td-icon>` | [Icons](icons.md) |
| `./icons.json` | dữ liệu icon (cho PHP / SSR) | [Icons](icons.md#markup-hợp-đồng-ssr) |
| `./form-validation` | `TdFormValidation` | [Form validation](form-validation.md) |
| `./base`, `./form-element`, `./sample` | `TdBaseElement` (có `escapeHtml()`, `safeColor()`), `TdFormElement`, `<td-sample>` | [Base element](base-element.md) |

### Tiện ích nội bộ (không export)

Các file dưới đây nằm trong `src/utils/` nhưng **không** có trong `exports`, nên là chi tiết cài đặt: có thể đổi hoặc bị
xoá ở bất kỳ bản nào, và `import '@dazzxq/td-components/src/utils/…'` sẽ bị Node/Vite từ chối (Node báo
`ERR_PACKAGE_PATH_NOT_EXPORTED`, Vite báo subpath "is not exported"). Chúng được liệt kê để bạn hiểu kit, **không** để dùng trực tiếp.

| File | Làm gì | Nếu site cần thứ tương tự |
|---|---|---|
| `escape.js` | `escapeHtml(str)` | Dùng `this.escapeHtml()` trong component kế thừa `TdBaseElement`; ngoài component, ưu tiên `textContent` / `setAttribute`. |
| `css-safe.js` | `safeColor`, `safeHexColor`, `safeCssDimension`, `clampNumber`, `applyStyles` | `this.safeColor()` trên `TdBaseElement`; kích thước: `CSS.supports('width', v)`; style: `el.style.setProperty()`. |
| `typeahead.js` | `fold()` (bỏ dấu, không phân biệt hoa thường), `nextTypeaheadIndex()` cho dropdown / menu / chip-input | Tự viết (hàm ngắn) nếu cần. |
| `layers.js` | Registry lớp nổi (z-index `LAYERS`), phân xử Escape/Tab, bẫy focus | Không tự bắt Escape trên `document` khi có overlay của kit; xem [Cách hoạt động](../concepts/how-it-works.md). |
| `inert-lock.js` | Đặt `inert` cho nền khi modal/lightbox/loading mở | — |
| `scroll-lock.js` | Khoá cuộn trang có đếm tham chiếu (trên `<html>`) | — |
| `floating.js` | `placeFloating()` / `isReferenceHidden()` định vị menu, tooltip | — |

Chạy không bundler (import map / URL trực tiếp) thì về kỹ thuật vẫn tải được các file này, nhưng chúng vẫn **không** phải
API công khai.

---

## dom-utils

```js
import {
  slugify, formatFileSize, formatNumber, debounce, throttle,
  parseColorToRgb, relativeLuminance, contrastRatio, getAccessibleTextColor,
} from '@dazzxq/td-components/dom-utils';
```

Hộp đồ nghề chuyển từ `dcms-utils.js` (chỉ phần không phụ thuộc kiến trúc; các hàm gắn với Laravel/CSRF không được
chuyển). Không hàm nào đụng DOM.

### `slugify(text)`

`(text: string) => string` — chuỗi thân thiện URL, hỗ trợ tiếng Việt đầy đủ (`đ` → `d`, mọi dấu thanh/dấu mũ → chữ gốc).
Kết quả chỉ gồm `a-z`, `0-9`, `-`; gộp khoảng trắng và gạch nối liên tiếp, bỏ gạch đầu/cuối. Không phải chuỗi hoặc rỗng →
`''`.

```js
slugify('Chuyên mục Tin tức');        // 'chuyen-muc-tin-tuc'
slugify('Tiếng Việt có dấu');         // 'tieng-viet-co-dau'
slugify('  Xin chào -- Thế giới! ');  // 'xin-chao-the-gioi'
slugify('Hello World 123');           // 'hello-world-123'
```

Ký tự ngoài Latin/tiếng Việt (chữ Hán, emoji) bị bỏ hẳn; kiểm tra slug rỗng nếu dữ liệu có thể toàn ký tự như vậy.

### `formatFileSize(bytes)`

`(bytes: number) => string` — hệ 1024, tối đa 2 chữ số thập phân (bỏ số 0 thừa), đơn vị `Bytes`, `KB`, `MB`, `GB`, `TB`.
Không phải số hữu hạn hoặc ≤ 0 → `'0 Bytes'`.

```js
formatFileSize(500);          // '500 Bytes'
formatFileSize(1536);         // '1.5 KB'
formatFileSize(1073741824);   // '1 GB'
```

Dấu thập phân là **dấu chấm** (không theo locale).

### `formatNumber(num)`

`(num: number) => string` — rút gọn: ≥ 1 000 000 → `x.xM`, ≥ 1 000 → `x.xK` (1 chữ số thập phân, dấu chấm); nhỏ hơn thì
định dạng `vi-VN` (dấu phẩy thập phân, dấu chấm nhóm nghìn). Không phải số → `'0'`.

```js
formatNumber(1500);       // '1.5K'
formatNumber(12345678);   // '12.3M'
formatNumber(999);        // '999'
formatNumber(12.5);       // '12,5'
formatNumber(-5000);      // '-5.000'  (số âm không được rút gọn)
```

Lưu ý: phần rút gọn dùng dấu chấm (`1.5K`) còn phần nhỏ dùng dấu phẩy (`12,5`) — không đồng nhất; nếu cần định dạng số
tiền/số liệu chính xác, dùng `Intl.NumberFormat` trực tiếp.

### `debounce(func, wait)`

`(func, wait: number) => (...args) => void` — trì hoãn (trailing edge): chỉ gọi `func` sau khi đã yên `wait` ms kể từ lần
gọi cuối, với tham số và `this` của lần gọi cuối. Không có `cancel()`/`flush()`.

```js
const search = debounce((q) => fetchResults(q), 300);
input.addEventListener('input', (e) => search(e.target.value));
```

### `throttle(func, limit)`

`(func, limit: number) => (...args) => void` — gọi **ngay** lần đầu (leading edge), rồi bỏ qua mọi lần gọi trong `limit` ms.
Lần gọi cuối trong cửa sổ **bị bỏ** (không có trailing call).

```js
window.addEventListener('scroll', throttle(() => updateHeader(), 100));
```

Không hàm nào tự huỷ timer khi component rời trang; trong component kế thừa `TdBaseElement`, dùng `this.setTimeout()` nếu
cần tự dọn.

### `parseColorToRgb(color)`

`(color: string) => { r, g, b } | null` — hỗ trợ `#rgb`, `#rrggbb`, `rgb(r, g, b)` / `rgba(r, g, b, a)` (cú pháp **dấu
phẩy**; alpha bị bỏ). Trả `null` cho tên màu (`tomato`), hex 4/8 chữ số, cú pháp khoảng trắng `rgb(255 0 0)`, `hsl()`…

```js
parseColorToRgb('#10b981');           // { r: 16, g: 185, b: 129 }
parseColorToRgb('rgba(0, 0, 0, .5)'); // { r: 0, g: 0, b: 0 }
parseColorToRgb('rgb(255 0 0)');      // null
```

### `relativeLuminance({ r, g, b })`

`({ r, g, b }) => number` — độ chói tương đối theo WCAG, 0 (đen) … 1 (trắng).

### `contrastRatio(color1, color2)`

`(string | {r,g,b}, string | {r,g,b}) => number` — tỉ lệ tương phản WCAG 1–21. Không parse được một trong hai → `1`.

```js
contrastRatio('#ffffff', '#000000');  // 21
contrastRatio('#10b981', '#ffffff');  // ≈ 2.54  (chưa đạt 4.5:1 cho chữ thường)
```

### `getAccessibleTextColor(backgroundColor)`

`(string | {r,g,b}) => '#ffffff' | '#000000'` — chọn chữ trắng hay đen cho tương phản cao hơn trên nền đã cho. Không
parse được → `'#ffffff'`.

```js
getAccessibleTextColor('#10b981'); // '#000000'
getAccessibleTextColor('#1e3a8a'); // '#ffffff'
```

Hàm này không biết độ trong suốt; với màu có alpha, chồng màu lên nền trước (như `td-pagination` tự làm với
`active-color`).

---

## TdDateTime

```js
import { TdDateTime } from '@dazzxq/td-components/datetime';
// hoặc: import { TdDateTime } from '@dazzxq/td-components';
```

Lớp tĩnh (không tạo instance) chuyển từ `FormatTime` của DCMS: định dạng ngày giờ theo token, thời gian tương đối tiếng
Việt, và chuyển chuỗi đã định dạng ngược về ISO.

### Đầu vào chấp nhận

Mọi method nhận `dateInput` là một trong:

| Kiểu | Hiểu thế nào |
|---|---|
| `Date` | Dùng luôn (Date không hợp lệ → coi như không hợp lệ). |
| `number` | Unix timestamp: **< 1e12 → giây**, ngược lại → mili giây. |
| `string` | Thử `new Date(str)` (ISO 8601…) trước; không được thì nếu là chuỗi số → timestamp như trên. |

`''`, `null`, `undefined` hoặc đầu vào không hợp lệ → method trả `''`. Timestamp `0` là hợp lệ (1/1/1970, từ 0.16.0;
trước đó bị coi là không có).

### `TdDateTime.toAbsolute(dateInput, format = 'DD/MM/YYYY - HH:mm')`

`=> string` — định dạng theo **giờ địa phương** của trình duyệt/máy chạy.

| Token | Ý nghĩa | Ví dụ |
|---|---|---|
| `YYYY` | Năm 4 số | `2025` |
| `YY` | Năm 2 số | `25` |
| `MM` | Tháng 01–12 | `08` |
| `DD` | Ngày 01–31 | `12` |
| `HH` | Giờ 00–23 | `14` |
| `hh` | Giờ 01–12 | `02` |
| `mm` | Phút 00–59 | `05` |
| `ss` | Giây 00–59 | `09` |
| `A` | `AM` / `PM` | `PM` |
| `a` | `am` / `pm` | `pm` |

```js
TdDateTime.toAbsolute('2025-08-12T04:36:00Z');                 // '12/08/2025 - 11:36' (máy ở GMT+7)
TdDateTime.toAbsolute(new Date(2025, 7, 12, 14, 5), 'hh:mm A'); // '02:05 PM'
TdDateTime.toAbsolute(1755000000, 'DD/MM/YYYY');                // timestamp giây
```

**Chữ trong `format`** (từ 0.16.0): `format` được quét một lượt theo từng cụm chữ cái liền nhau. Một cụm chỉ được thay
khi nó **gồm toàn token** (`DD`, `YYYYMMDD`, `HHmm`, `A`…); cụm có chữ khác (`Ngay`, `thang`, `Class`) giữ nguyên. Văn
bản trong `[...]` được in nguyên văn (bỏ ngoặc) — dùng khi một từ trùng token, ví dụ chữ `a` đứng riêng.

```js
TdDateTime.toAbsolute(d, 'Ngay DD thang MM');           // 'Ngay 12 thang 08'
TdDateTime.toAbsolute(d, '[Ngày] DD [lúc] HH:mm');      // 'Ngày 12 lúc 14:05'
TdDateTime.toAbsolute(d, 'YYYYMMDD');                   // '20250812'
```

Trước 0.16.0 token được tìm-và-thay toàn chuỗi, kể cả bên trong từ (`'Ngay DD thang MM'` → `'Ngpmy 12 thpmng 08'`).

### `TdDateTime.toRelative(dateInput)`

`=> string` — thời gian tương đối tiếng Việt so với lúc gọi:

| Khoảng cách | Kết quả |
|---|---|
| < 60 giây | `Vừa xong` |
| < 60 phút | `N phút trước` |
| < 24 giờ | `N giờ trước`, hoặc `Hơn N giờ trước` khi phần lẻ ≥ 30 phút |
| < 30 ngày | `N ngày trước` / `Hơn N ngày trước` (phần lẻ ≥ 12 giờ) |
| < 12 tháng (tháng = 30 ngày) | `N tháng trước` / `Hơn N tháng trước` (phần lẻ ≥ 15 ngày) |
| còn lại (năm = 365 ngày) | `N năm trước` / `Hơn N năm trước` (phần lẻ ≥ 6 tháng) |

Thời điểm **trong tương lai** (từ 0.16.0; trước đó luôn là `Vừa xong`):

| Khoảng cách tới | Kết quả |
|---|---|
| < 1 phút | `Sắp tới` |
| < 60 phút | `Trong N phút` |
| < 24 giờ | `Trong N giờ` |
| < 30 ngày | `Trong N ngày` |
| < 365 ngày | `Trong N tháng` (tháng = 30 ngày) |
| còn lại | `Trong N năm` |

```js
TdDateTime.toRelative(Date.now() - 5 * 60 * 1000); // '5 phút trước'
TdDateTime.toRelative(Date.now() + 5 * 60 * 1000); // 'Trong 5 phút'
```

Giờ máy khách chạy chậm hơn server vài giây thì bài vừa đăng có thể hiện `Sắp tới`. Chuỗi không tự cập nhật; muốn "sống"
thì tự gọi lại theo chu kỳ.

### `TdDateTime.convert(dateInput, { mode = 'absolute', format = 'DD/MM/YYYY - HH:mm' } = {})`

`=> string` — `mode: 'relative'` gọi `toRelative`, còn lại gọi `toAbsolute(dateInput, format)`.

```js
TdDateTime.convert(post.created_at, { mode: 'relative' });
```

### `TdDateTime.toISO(formattedDate, inputFormat = 'DD/MM/YYYY - HH:mm')`

`=> string` — phân tích chuỗi theo `inputFormat` (cùng bộ token), hiểu là **giờ địa phương**, trả về
`Date#toISOString()` (**UTC**, có `Z`). Bắt buộc có ngày, tháng, năm, giờ, phút; giây tuỳ chọn. Ngày không tồn tại
(31/02), giờ/phút ngoài khoảng hoặc chuỗi không khớp → `''`.

```js
TdDateTime.toISO('12/08/2025 - 11:36');                         // '2025-08-12T04:36:00.000Z' (máy ở GMT+7)
TdDateTime.toISO('12/08/2025 11:36 PM', 'DD/MM/YYYY hh:mm A');  // '2025-08-12T16:36:00.000Z'
TdDateTime.toISO('31/02/2025 - 10:00');                         // ''
```

`YY` được hiểu là 2000–2049 khi < 50, ngược lại 1950–1999.

### Helper "parts" (giờ đồng hồ, không múi giờ)

Cùng module export thêm các hàm thuần mà `td-datetime-picker` dùng (0.10.0). Một "parts" là object
`{ day, month, year, hour, minute }` (số nguyên, giờ địa phương, không múi giờ). Các parser chỉ kiểm tra **cú pháp**;
kiểm tra lịch (29/2, 31/4…) nằm ở `invalidReason` / `isValidParts`.

```js
import {
  parseDisplay, parseDb, parseIsoLocal, parseBound,
  formatDisplay, formatDb, formatIsoLocal,
  isValidParts, invalidReason, compareParts, daysInMonth,
  normalizeMinuteStep, snapMinuteDown, partsFromDate,
} from '@dazzxq/td-components/datetime';
```

| Hàm | Chữ ký | Mô tả |
|---|---|---|
| `parseDisplay` | `(str) => Parts \| null` | `d/m/yyyy - h:mm` (1–2 số cho ngày/tháng/giờ/phút, năm 4 số). |
| `parseDb` | `(str) => Parts \| null` | `yyyy-mm-dd hh:mm[:ss]` (giây 00–59 được chấp nhận rồi bỏ). |
| `parseIsoLocal` | `(str) => Parts \| null` | `yyyy-mm-ddThh:mm[:ss]` (không múi giờ). |
| `parseBound` | `(str, 'min' \| 'max') => Parts \| null` | Như display hoặc ISO-local, có hoặc không giờ. Chỉ có ngày → `00:00` cho `min`, `23:59` cho `max`. Không hợp lệ → `null`. |
| `formatDisplay` | `(p) => string` | `dd/mm/yyyy - hh:mm` |
| `formatDb` | `(p) => string` | `yyyy-mm-dd hh:mm:00` |
| `formatIsoLocal` | `(p) => string` | `yyyy-mm-ddThh:mm:00` |
| `invalidReason` | `(p) => null \| 'incomplete' \| 'day' \| 'month' \| 'year' \| 'hour' \| 'minute' \| 'date'` | Lý do không hợp lệ, `null` = hợp lệ. Năm hợp lệ 1–9999. `'date'` = ngày không có trong tháng đó. |
| `isValidParts` | `(p) => boolean` | `invalidReason(p) === null`. |
| `compareParts` | `(a, b) => number` | Âm nếu `a` sớm hơn, 0 nếu bằng, dương nếu muộn hơn. |
| `daysInMonth` | `(year, month) => number` | Số ngày của tháng (1–12), tính năm nhuận. |
| `normalizeMinuteStep` | `(value) => number` | Số nguyên 1–30 chia hết 60, ngược lại `1`. |
| `snapMinuteDown` | `(minute, step) => number` | Làm tròn **xuống** theo bước, không nhảy sang giờ sau (`58`, bước 5 → `55`). |
| `partsFromDate` | `(date: Date) => Parts` | Lấy parts theo giờ địa phương. |

```js
const p = parseDisplay('5/8/2025 - 9:05');   // { day: 5, month: 8, year: 2025, hour: 9, minute: 5 }
formatDisplay(p);                            // '05/08/2025 - 09:05'
formatDb(p);                                 // '2025-08-05 09:05:00'
formatIsoLocal(p);                           // '2025-08-05T09:05:00'
invalidReason({ day: 30, month: 2, year: 2025, hour: 1, minute: 1 }); // 'date'
parseBound('2025-08-12', 'max');             // { day: 12, month: 8, year: 2025, hour: 23, minute: 59 }
```

Chuyển giá trị DB của Laravel/PHP sang dạng hiển thị mà không qua `Date` (tránh lệch múi giờ):

```js
const p = parseDb('2025-08-05 09:05:00');
const text = p && isValidParts(p) ? formatDisplay(p) : '';
```

## Lưu ý & lỗi thường gặp

- **Import đường dẫn `src/…`**: bị chặn bởi `exports`. Chỉ import các subpath ở bảng đầu trang.
- **`toAbsolute` biến chữ `a` thành `am`/`pm`**: đừng để chữ Latin trong `format` (xem trên).
- **Timestamp giây vs mili giây**: số < 1e12 bị coi là giây. Timestamp mili giây của năm 1970–2001 (hiếm) sẽ bị hiểu sai.
- **`toISO` trả giờ UTC**: `'…T04:36:00.000Z'` là đúng cho 11:36 giờ Việt Nam. Muốn chuỗi local không múi giờ để gửi
  server, dùng `formatIsoLocal(parseDisplay(str))`.
- **`parseColorToRgb` / `contrastRatio` với màu lạ trả `null` / `1`** — kiểm tra kết quả trước khi tin.

## Xem thêm

- [Icons](icons.md) · [Form validation](form-validation.md) · [Base element](base-element.md)
- [Datetime picker](datetime-picker.md) (dùng các helper parts) · [Bảo mật](../guides/security.md)
