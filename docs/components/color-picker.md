[Tài liệu](../README.md) › [Components](README.md) › Color picker

# Ô chọn màu — `<td-color-picker>`

Ô nhập **một màu đặc** cho form cài đặt (màu thương hiệu, màu nút, màu nền khối…). Giá trị luôn **một dạng**:
`#rrggbb` chữ thường, hoặc rỗng. Ba lối nhập, lối nào cũng đủ để chọn mọi màu:

1. **Gõ / dán mã** vào ô chữ (luôn hiện): `#1D4ED8`, `1d4ed8`, `#abc`, `rgb(29 78 216)`, `oklch(…)`, `red`…
2. **Màu có sẵn** (preset) của site trong popup.
3. **Vùng 2 chiều** (độ bão hoà × độ sáng) + **thanh sắc độ** trong popup, kéo bằng chuột / ngón tay hoặc dùng bàn phím.

Form-associated: form gửi `name=#rrggbb`. Có helper PHP `td_color_picker()` (chạy được khi chưa có JS) và
**`td_color_value()` để chuẩn hoá phía server — bắt buộc gọi khi nhận POST** (xem [Phía server](#phía-server-bắt-buộc)).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/color-picker'` (class: `import { TdColorPicker } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | có (một mục, `#rrggbb` hoặc `''`) |
| Từ phiên bản | 0.48.0 (token-native: cần `td.css`) |

**Ngoài phạm vi (0.48.0):** màu trong suốt / alpha, `<input type="color">` của hệ điều hành trong popup, "màu gần đây"
(kit không ghi `localStorage` — app tự đưa vào `presets`), nhập `hsl()` / `hwb()` / `lab()` / 148 tên màu CSS mở rộng,
xuất dạng khác `#rrggbb`, chặn màu "không đạt tương phản", chọn nhiều màu, gradient.

## Ví dụ nhanh

```html
<form method="post" action="/cai-dat">
  <td-color-picker name="brand_color" label="Màu thương hiệu" value="#1d4ed8" required></td-color-picker>
  <td-color-picker name="banner_bg" label="Nền banner" presets="#ffffff #f4f4f5 #fef3c7 #dbeafe" contrast></td-color-picker>
  <button type="submit" class="td-btn td-btn--primary">Lưu</button>
</form>

<script type="module">
  import '@dazzxq/td-components/color-picker';

  const el = document.querySelector('[name="brand_color"]');
  el.presets = [
    { value: '#b3261e', label: 'Đỏ thương hiệu' },
    { value: '#1f2937', label: 'Than chì' },
  ];
  el.addEventListener('change', (e) => console.log('đã chọn', e.detail.value)); // "#b3261e"
</script>
```

## Giá trị và cú pháp nhận

- **Giá trị chuẩn:** `#rrggbb` chữ thường (`#1d4ed8`) hoặc `''` (chưa chọn). `value`, `getValue()`, FormData,
  `detail.value` của sự kiện — tất cả đúng dạng này.
- **Nhận khi gõ / dán** (đúng tập của lõi màu `parseColor`, thêm mã hex không có `#`):

  | Gõ | Thành |
  |---|---|
  | `#ABC`, `#abc`, `abc` | `#aabbcc` |
  | `#1D4ED8`, `1d4ed8` | `#1d4ed8` |
  | `#1d4ed8ff`, `#abcf` (alpha = ff) | `#1d4ed8`, `#aabbcc` |
  | `rgb(29, 78, 216)`, `rgb(29 78 216)`, `rgba(…, 1)`, `color(srgb 0.11 0.31 0.85)` | `#1d4ed8` |
  | `oklch(0.49 0.22 264)` | gần `#1d4ed8` — màu ngoài gamut sRGB được **kéo về gamut** (giữ độ sáng + sắc độ) rồi làm tròn, có thể lệch |
  | 16 tên CSS cơ bản (`red`, `navy`, `white`…) | `#ff0000`, `#000080`, `#ffffff` |

- **Không nhận:** `hsl()`, tên màu mở rộng (`tomato`), `var(--x)`, chuỗi > 64 ký tự… → lỗi `badInput`
  ("Mã màu không hợp lệ — ví dụ #1d4ed8"). **Màu trong suốt** (`#0000`, `rgb(0 0 0 / 50%)`, `transparent`) → lỗi riêng
  "Không hỗ trợ màu trong suốt" — kit **không** lặng lẽ bỏ alpha (sẽ đổi nghĩa màu).
- **Khi gõ:** mã hợp lệ cập nhật ô màu / popup / giá trị form **ngay**, nhưng **không** viết lại chữ đang gõ. Rời ô
  (blur) hoặc Enter → chữ đổi sang dạng chuẩn (`#ABC` → `#aabbcc`) và phát `change`. Enter **không** bị chặn: form vẫn
  submit, và đã chuẩn hoá xong trước khi trình duyệt đọc FormData.
- Chữ không hợp lệ: form **gửi đúng chữ đó** kèm `badInput` (constraint validation chặn submit) — giống ô ngày giờ.
  Chuỗi người dùng gõ **không bao giờ** đi vào CSS / HTML.
- Thuộc tính `pattern` / `minlength` trên host bị bỏ qua (định dạng đã cố định).

## Phía server (bắt buộc)

Client **không phải** ranh giới tin cậy: bản không-JS gửi đúng chữ người dùng gõ (ví dụ `#AABBCC`), và client bất kỳ
POST được chuỗi tuỳ ý. Vì vậy **mọi** giá trị màu nhận được phải qua `td_color_value()` **trước** khi kiểm / lưu:

```php
$v = td_color_value($_POST['brand_color'] ?? null);   // '#AABBCC' → '#aabbcc', ' abc ' → '#aabbcc', '' → ''
if ($v === null) { http_response_code(422); exit; }   // 'rgb(…)', 'red', '#abcd', mảng, số… → null
// hợp đồng lưu: $v khớp ^#[0-9a-f]{6}$ hoặc là ''
```

Laravel (dsuite, settings kiểu `color`):

```php
$v = td_color_value($request->input('brand_color'));
if ($v === null) abort(422);
$setting->value_json = $v;
```

Regex `^#[0-9a-f]{6}$` của server áp lên **kết quả** của helper, **không** lên chuỗi POST thô. Site không dùng PHP chép
4 dòng tương đương: `null` / `''` / chỉ khoảng trắng → `''`; không phải chuỗi hoặc dài > 64 → lỗi; `trim`, khớp
`^#?([0-9a-f]{3}|[0-9a-f]{6})$` (không phân biệt hoa thường) → nhân đôi 3 số, chữ thường, thêm `#`; còn lại → lỗi.

## Popup

Bấm nút ô màu (bên trái ô chữ), hoặc Enter / Space trên nút đó, hoặc **Alt+↓** (trên nút hoặc trong ô chữ) để mở.
Từ trên xuống: vùng 2 chiều → [nút lấy màu] + thanh sắc độ → [tương phản] → màu có sẵn → "Xoá màu".

- Mở ra focus vào **điểm chọn** của vùng 2 chiều (hoặc màu đang chọn khi `custom="false"`). Mở / đóng **không** ghi giá trị.
- **Tab / Shift+Tab** vòng trong popup. **Escape** → trả lại giá trị lúc mở + đóng + focus về nút ô màu,
  kể cả khi đang gõ trong ô chữ (giá trị khác lúc mở — kể cả màu vừa gõ chưa xác nhận: đúng một `input` + một `change`; nếu lúc mở ô chữ đang là mã **không hợp lệ**, chữ đó được trả lại
  **im lặng** — không sự kiện, lại `badInput`). **Bấm ra ngoài**, cuộn làm ô khuất, hoặc một lớp phủ mới che → đóng và **giữ** giá trị.
- **Bấm một màu có sẵn** → chọn + đóng (như dcms). Kéo vùng / thanh sắc độ không đóng.
- Gõ trong ô chữ khi popup đang mở → popup theo (vùng / sắc độ / màu có sẵn đang chọn).
- Popup là bề mặt "popup nhỏ" (đặc 94 % + blur), đưa ra `<body>`, nổi trên modal / drawer; mở từ một vùng
  `data-td-theme="dark"` thì theo theme của vùng ([Theme theo vùng](../customization/theming.md#theme-theo-vùng)).
- Màn hình thấp (≤ 500px, điện thoại xoay ngang): vùng 2 chiều thấp hơn (7rem), màu có sẵn thành một hàng cuộn ngang;
  không đủ chỗ trên / dưới ô thì popup nằm trong khung nhìn (có thể che ô).

### Bàn phím của vùng 2 chiều

| Phím | Tác dụng |
|---|---|
| ← / → | độ bão hoà −1 / +1 % |
| ↑ / ↓ | độ sáng +1 / −1 % |
| Shift + mũi tên | ±10 % |
| PageUp / PageDown | độ sáng ±10 % |
| Home / End | độ bão hoà 0 / 100 % |

Mỗi bước phím là một `change` (như thanh trượt native). Thanh sắc độ là `<input type="range">` **native** (0–359°):
mũi tên, VoiceOver iOS / TalkBack điều chỉnh được. Mô hình màu của vùng là **HSV** (x = bão hoà, y = độ sáng — như
Chrome DevTools / Figma); popup giữ trạng thái số thực nên kéo về đen / xám rồi kéo lên **không** mất sắc độ.

### Chạm

Chạm vào vùng 2 chiều = chọn ngay điểm đó (không chờ), kéo để chỉnh; nhấc ngón = một `change`. Vùng 2 chiều và thanh
sắc độ có `touch-action: none` (vuốt dọc bắt đầu **trên** chúng không cuộn trang — giống thanh trượt); phần còn lại của
popup cuộn bình thường. Ô / nút ≥ 44px trên màn hình cảm ứng.

## Màu có sẵn (`presets`)

- **Thuộc tính** `presets`: các mã cách nhau bởi khoảng trắng / dấu phẩy (in được từ PHP): `presets="#b3261e #1f2937 red"`.
- **Property** `presets` (thắng thuộc tính): mảng `string | { value, label }` — `label` là tên đọc cho trình đọc màn hình
  + tooltip (`title`), **chỉ là chữ** (không HTML).
- Mỗi mục qua cùng bộ parse; mục lỗi / trong suốt bị bỏ + **một** `console.warn` (chữ cố định); trùng → giữ lần đầu;
  tối đa **48** màu. Giới hạn công việc: chỉ **192** mục đầu (mảng hoặc mã trong chuỗi) được xem — mục sau bị bỏ qua, mảng
  thưa (sparse) không bị duyệt hết độ dài; chuỗi `presets` dài hơn **12 288 byte** (UTF-8) bị bỏ cả chuỗi (không lưới).
  Nhãn preset dài hơn 240 ký tự bị cắt **trước** khi trim (rồi còn tối đa 120) và cũng gây cảnh báo. PHP áp đúng giới
  hạn số mục / độ dài chuỗi (PHP không có nhãn preset).
- Không đặt → **16 màu mặc định** (như dcms: thang xám + vòng màu; `TdColorPicker.defaultPresets`). `presets=""` hoặc
  `[]` → không có lưới.
- Lưới là **một điểm Tab** (mũi tên 2 chiều theo số cột thật, Home / End), màu đang chọn có `aria-pressed="true"` + dấu
  tick (đen hoặc trắng tuỳ màu nền).

## Lấy màu trên màn hình, tương phản, chỉ preset

- **Lấy màu** (nút ống hút): chỉ hiện khi trình duyệt có `EyeDropper` (Chromium máy tính). Firefox / Safari: nút **không
  có** (không phải nút mờ). Tắt bằng `eyedropper="false"`. Kết quả cũng qua bộ parse; người dùng nhấn Escape → không đổi gì.
- **`contrast`**: hàng mẫu "Aa" chữ trắng và chữ đen trên màu đang chọn + tỉ số WCAG 2.x (1 chữ số thập phân) + chữ
  "Đạt AA" / "Chưa đạt" theo ngưỡng **4.5:1** (chữ thường). Chỉ hiển thị, **không** chặn chọn — quyết định là của app.
  Mặc định tắt.
- **`custom="false"`** (dcms `custom: false`): chỉ chọn trong preset — không vùng 2 chiều / sắc độ / ống hút, ô chữ chỉ
  đọc. Giá trị không có trong preset (từ server / `value`) vẫn được nhận và hiện (server là nguồn sự thật).

## Thuộc tính

| Thuộc tính | Mặc định | Ý nghĩa |
|---|---|---|
| `name` | — | Tên trong form |
| `value` | `''` | Giá trị mặc định (chuẩn hoá; là đích của `form.reset()`); đổi sau đó đặt luôn giá trị sống |
| `label` | — | Nhãn hiện trên ô (`<label for>`); không có → `aria-label` của host → `<label for="id-host">` ngoài → "Mã màu" |
| `placeholder` | `#000000` | Gợi ý trong ô chữ |
| `presets` | 16 màu | Xem trên |
| `required` | — | Rỗng → `valueMissing` ("Vui lòng chọn màu"); ẩn nút xoá |
| `disabled` / `readonly` | — | Không mở popup, không xoá (`<fieldset disabled>` cũng vậy; popup đang mở thì đóng) |
| `custom` | bật | `"false"` → chỉ preset |
| `contrast` | tắt | Hàng tương phản trắng / đen |
| `eyedropper` | bật | `"false"` → không có nút lấy màu |
| `error-text` | — | Lỗi hiển thị (error contract chung) |
| `aria-label` | — | Tên đọc khi không có `label` |

## Property, method, sự kiện

| | |
|---|---|
| `value` | đọc / ghi, **im lặng** (không phát sự kiện); không hợp lệ → `badInput` như khi gõ. Khi đang có chữ lỗi, `value` trả về đúng chữ đó |
| `presets` | đọc: danh sách đã chuẩn hoá `[{ value, label }]`; ghi: mảng (thắng thuộc tính) |
| `getValue()` / `setValue(v)` | như `value` |
| `open()` / `close()` | mở / đóng popup bằng code |
| `focus()`, `checkValidity()`, `reportValidity()`, `setError(msg)`, `clearError()` | như các control form khác |
| `TdColorPicker.labels` / `.messages` | chữ tiếng Việt, ghi đè được (`{current}`, `{name}`, `{hex}`, `{deg}`, `{s}`, `{v}`, `{ratio}`) |
| `TdColorPicker.colorName` | hàm `(hex) => tên màu` (mặc định tiếng Việt **gần đúng**) — site đa ngôn ngữ thay được |

| Sự kiện | `detail` | Khi nào |
|---|---|---|
| `input` | `{ value }` | mỗi thay đổi của người dùng (kéo: tối đa một lần mỗi khung hình; phím; gõ mã hợp lệ) |
| `change` | `{ value }` | khi **xác nhận**: thả con trỏ, mỗi bước phím trên vùng / sắc độ, bấm preset, xoá, lấy màu, blur / Enter ô chữ, Escape đã đổi giá trị. Không phát khi giá trị cuối bằng giá trị trước |

`input` / `change` **native** của ô chữ và thanh sắc độ không ra khỏi component (một sự kiện mỗi lần). Không có sự kiện
`open` / `close` (dùng `aria-expanded` của nút).

## Trình đọc màn hình

- Ô chữ là control chính (nhãn `<label for>`), nút ô màu đọc "Chọn màu: xanh dương #1d4ed8" (`aria-haspopup="dialog"`,
  `aria-expanded`), popup `role="dialog"` "Bảng chọn màu".
- Vùng 2 chiều: `role="slider"` (vai trò "vùng chọn màu 2 chiều"), `aria-valuetext` = "Bão hoà 62 %, độ sáng 40 % —
  xanh dương đậm, #1d4ed8" (đọc lại mỗi bước). Thanh sắc độ: "210°, xanh dương".
- **Tên màu là mô tả gần đúng** (tính từ OKLCH: đỏ, cam, nâu, vàng, xanh lá, xanh ngọc, xanh lơ, xanh dương, tím, hồng,
  trắng, xám, đen + "nhạt" / "đậm"), luôn đọc kèm mã hex; ngưỡng có thể chỉnh ở bản sau, **không** phải API ổn định. Cần
  tên chính xác → đặt `label` cho preset.
- **Hạn chế đã biết:** VoiceOver / TalkBack trên điện thoại chỉ chỉnh được **một** trục của slider tự vẽ bằng cử chỉ
  vuốt. Lối đầy đủ cho họ: ô chữ + preset + thanh sắc độ native.

## Không JS (SSR)

`td_color_picker()` in **ô chữ thường** (không phải `type=color` — ô màu native **không có trạng thái rỗng**, luôn gửi
`#000000`, setting tuỳ chọn sẽ bị ghi đè thành đen). Khi chưa có JS:

- ô chỉ nhận đúng `#RRGGBB` (`pattern="#[0-9a-fA-F]{6}"`, cho phép hoa — dán từ dcms / Figma được), **không** nhận 3 số,
  **không** thiếu `#` (không có JS để chuẩn hoá trước khi gửi); ô rỗng hợp lệ trừ khi `required`; gợi ý "Dạng #RRGGBB,
  ví dụ #1d4ed8";
- ô màu bên trái là ô xám trung tính (CSP cấm PHP tô màu inline) — có JS thì tô màu, **không** đổi bố cục.

Có JS (`element => true`): component nhận markup **tại chỗ** (giữ ô chữ, focus, chữ đang gõ), gỡ `name` / `pattern` /
`title` khỏi ô (host tự kiểm, parse rộng hơn: `#abc` → `#aabbcc`), bọc ô màu vào nút mở popup và thêm nút xoá. Markup
bị sửa (thêm `formaction`, ô `type=color`, input thứ hai…) → render an toàn ngay, giữ chữ đang gõ + focus.

```php
<?= td_color_picker('brand_color', [
    'label' => 'Màu thương hiệu',
    'value' => $setting->value_json,           // '#1D4ED8' / '1d4ed8' đều được, in ra '#1d4ed8'
    'presets' => ['#b3261e', '#1f2937', '#0f766e'],
    'contrast' => true,
    'required' => true,
    'element' => true,                          // hoặc Td::configure(..., ['ssr_elements' => true])
]) ?>
```

Option: `label`, `aria_label`, `value`, `presets` (mảng hoặc chuỗi mã), `required`, `disabled`, `readonly`, `custom`
(`false` = chỉ preset), `contrast`, `eyedropper` (`false` = ẩn), `placeholder`, `error`, `attrs` (lên ô chữ, allowlist;
các tên component sở hữu + `data-td-*` bị giữ chỗ), `class`, `id` (id của **ô chữ**; element: host = `{id}-host`),
`element`. `value` / `presets` qua `td_color_value()`: giá trị không hợp lệ dài ≤ 64 ký tự được **giữ nguyên** (escape) +
một `E_USER_WARNING` (component báo `badInput`, không mất dữ liệu server); dài hơn 64 (hoặc không phải chuỗi) thì
**không in** (ô rỗng) + một warning; preset lỗi bị bỏ + một warning. PHP chỉ nhận preset
dạng `#rgb` / `#rrggbb`. Chi tiết: [PHP adapter](../guides/php-adapter.md#td_color_picker-và-td_color_value-0480).

## Tuỳ biến

| Token | Mặc định | |
|---|---|---|
| `--td-color-picker-width` | `17.5rem` | độ rộng popup (tối đa `100vw − 16px`) |
| `--td-color-picker-area-height` | `10rem` | chiều cao vùng 2 chiều (7rem khi màn hình thấp) |
| `--td-color-picker-swatch` | `1.5rem` | cạnh ô màu trong ô nhập |
| `--td-color-swatch-border` | `var(--td-control-border-strong)` | viền ô màu / preset (≥ 3:1 với nền ô, light + dark) |
| `--td-color-checker` | `var(--td-color-border)` | màu ô cờ "chưa có màu" |

Ô nhập dùng token `--td-field-*` như các ô khác. Điểm chọn của vùng 2 chiều và của thanh sắc độ có **vòng kép** trắng +
đen (luôn thấy trên mọi màu) — vòng chức năng, không phải hiệu ứng trang trí.

## Bảo mật

- Chuỗi người dùng gõ / dán chỉ nằm trong `input.value`. Mọi thứ ghi vào CSS (CSSOM `setProperty`, không `style="…"`)
  là chuỗi do `toHex()` sinh (kiểm lại bằng `^#[0-9a-f]{6}$` trước khi ghi) hoặc số đã kẹp 0..1 — không `url()`,
  `var()`, `;`.
- Nhãn preset gán bằng `setAttribute` / `textContent` (không HTML). Kết quả của `EyeDropper` cũng qua bộ parse.
- Server: **luôn** `td_color_value()` (xem trên). PHP escape mọi thuộc tính, `attrs` qua allowlist.
