[Tài liệu](../README.md) › [Components](README.md) › Slider

# Slider — `<td-slider>`

Thanh trượt chọn một số trong khoảng `[min, max]` theo bước `step`, dựa trên `<input type="range">` native (vô hình)
phủ lên phần hiển thị, nên chuột, cảm ứng, bàn phím và form đều là hành vi native. Dùng khi giá trị chính xác không quan
trọng bằng cảm giác kéo (âm lượng, độ sáng, mức ưu tiên). Khi người dùng cần nhập **con số chính xác** (giá tiền, số
lượng), dùng [input field](input-field.md) `type="number"`.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/slider';` (class: `import { TdSlider } from '@dazzxq/td-components';`) |
| Loại | Custom element |
| Form-associated | có |
| Từ phiên bản | 0.1.0 (form-associated từ 0.2.0, token-native + BEM `.td-slider__*` từ 0.8.0) |

Cần `td.css` trên trang (xem [Cài đặt](../getting-started/installation.md)).

## Ví dụ nhanh

```html
<td-slider name="volume" label="Âm lượng" min="0" max="100" value="30" show-label></td-slider>

<script type="module">
  import '@dazzxq/td-components/slider';
</script>
```

## Cách dùng

### Khoảng, bước, số thập phân

```html
<td-slider label="Độ mờ" min="0" max="1" step="0.05" value="0.35" show-label></td-slider>
<td-slider label="Nhiệt độ" min="-10" max="40" step="0.5" value="22.5" show-label></td-slider>
```

- Mặc định `min=0`, `max=100`, `step=1`; không có `value` thì giá trị là `min` (0.16.0; trước đó là `0`, nên
  `min="10"` không có `value` báo `rangeUnderflow` giả). Giá trị không phải số thì dùng mặc định; `step` ≤ 0 thì thành 1.
- Số hiển thị được làm tròn theo số chữ số thập phân của `step` (và `min`), nên không bao giờ thấy
  `0.30000000000000004`.

### Hiện giá trị, nhãn min/max, vạch chia

```html
<!-- Hiện giá trị hiện tại (trên hoặc dưới thanh) -->
<td-slider label="Âm lượng" value="40" show-label></td-slider>
<td-slider label="Âm lượng" value="40" show-label label-position="bottom"></td-slider>

<!-- Hiện min và max ở hai đầu, dưới thanh -->
<td-slider label="Giá" min="0" max="500" value="100" show-step-labels></td-slider>

<!-- Một vạch + nhãn cho mỗi bước -->
<td-slider aria-label="Đánh giá" min="1" max="5" value="3" show-step-marks></td-slider>
```

- `show-label` hiện **giá trị** (không phải nhãn). Nhãn là attribute `label`.
- `show-step-marks` chỉ vẽ khi số bước ≤ 50. Quá 50 bước: không vẽ vạch và ghi cảnh báo ra console
  (`[td-slider] show-step-marks ignored: …`).
- Khi vạch chia **được vẽ**, `show-step-labels` bị bỏ qua (nhãn của vạch đã có min và max). Nếu vạch bị bỏ vì quá 50
  bước thì `show-step-labels` vẫn hiện.

### Kích thước, độ rộng, màu

```html
<td-slider size="sm" value="20"></td-slider>   <!-- rộng 200px -->
<td-slider size="md" value="20"></td-slider>   <!-- rộng 300px (mặc định) -->
<td-slider size="lg" value="20"></td-slider>   <!-- rộng 400px -->

<td-slider value="60" color="#16a34a" track-color="#dcfce7"></td-slider>
```

Slider không bao giờ rộng quá khung chứa (`max-width: 100%`). Muốn rộng theo ý, đặt token `--td-slider-w`:

```css
.filters td-slider { --td-slider-w: 100%; }
```

`color` (màu phần đã kéo và viền núm) và `track-color` (màu phần chưa kéo) đi qua `safeColor`; không hợp lệ thì dùng
token mặc định. Chúng được đặt thành biến CSS trên host bằng CSSOM, hợp lệ với CSP strict.

### Đọc, ghi giá trị và nghe sự kiện

```js
const s = document.querySelector('td-slider[name="volume"]');

s.getValue();        // số, ví dụ 30 (giá trị đang hiển thị)
s.setValue(75);      // đặt giá trị (bị kẹp vào [min, max]), KHÔNG phát event
s.value;             // chuỗi attribute, ví dụ "75"

s.addEventListener('input', (e) => {
  console.log('đang kéo:', e.detail.value);   // number
});
s.addEventListener('change', (e) => {
  console.log('đã chọn:', e.detail.value);    // number
});
```

- `input` phát liên tục khi kéo; `change` phát khi thả. Với bàn phím, mỗi lần nhấn phím phát cả `input` và `change`.
- Mỗi event native tạo đúng **một** CustomEvent cùng tên; `input`/`change` native bị chặn tại host.
- Khi người dùng kéo, attribute `value` của host được cập nhật theo.

### Trong form

```html
<form id="f">
  <td-slider name="volume" min="0" max="100" value="30"></td-slider>
</form>
```

```js
new FormData(document.getElementById('f')).get('volume'); // "30"
```

- Gửi giá trị dạng chuỗi số qua `name` của host.
- Validation dựa trên **giá trị của component** (attribute `value`), không dựa trên input native (input native tự kẹp
  và làm tròn, sẽ che mất lỗi):

  | Điều kiện | Cờ `validity` | Thông báo |
  |---|---|---|
  | `value` < `min` | `rangeUnderflow` | `Giá trị tối thiểu là {min}.` |
  | `value` > `max` | `rangeOverflow` | `Giá trị tối đa là {max}.` |
  | `value` không khớp bước tính từ `min` | `stepMismatch` | `Giá trị phải là bội số của {step}.` |

  Ví dụ `<td-slider value="200" max="100">`: thanh hiển thị ở 100 nhưng form gửi `200` và field ở trạng thái
  `rangeOverflow` (chặn submit).
- Reset form: trả `value` về attribute lúc gắn vào trang. Nếu lúc đó không có attribute `value`, giá trị về `min`
  (0.16.0; trước đó là `0`).
- `<fieldset disabled>` bao ngoài làm slider disabled (không gửi), attribute `disabled` không đổi.
- Autofill / back-forward cache: giá trị được khôi phục qua attribute `value`.
- Không có `required` (từ 0.16.0 không còn là attribute được theo dõi, không có property `required`): slider luôn có
  giá trị, `<input type="range">` native cũng không có `valueMissing`.

### Hiện lỗi (error contract)

```js
s.setError('Giá trị này vượt hạn mức của gói');
s.clearError();
```

```html
<td-slider label="Ngưỡng" value="50" error-text="Giá trị quá cao"></td-slider>
```

Lỗi = viền núm màu lỗi + `aria-invalid`/`aria-errormessage`/`aria-describedby` trên input + dòng
`.td-field-error` bên trong khối `.td-slider`. `setError()` và `error-text`: đặt sau cùng thì thắng. Không chặn submit
(dùng `setCustomValidity()` nếu cần). Xem [Forms](../guides/forms.md).

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `min` | number | `0` | Giá trị nhỏ nhất. |
| `max` | number | `100` | Giá trị lớn nhất. |
| `value` | number | `min` | Giá trị hiện tại (vắng → `min`, 0.16.0; trước đó `0`). Tự cập nhật khi người dùng kéo. Lúc gắn vào trang là mặc định khi reset. |
| `step` | number | `1` | Bước nhảy (≤ 0 hoặc không phải số → 1). |
| `name` | string | — | Tên trường trong form. |
| `size` | string | `md` | `sm` \| `md` \| `lg`: rộng 200 / 300 / 400 px, rãnh cao 4 / 6 / 8 px, núm 14 / 18 / 22 px. |
| `color` | string (màu CSS) | `--td-slider-color` (accent) | Màu phần đã kéo và viền núm. |
| `track-color` | string (màu CSS) | `--td-slider-track` | Màu rãnh phần chưa kéo. |
| `label` | string | — | Nhãn hiển thị phía trên (đặt tên cho slider qua `aria-labelledby`). |
| `aria-label` | string | — | Tên truy cập khi không có `label`. |
| `show-label` | boolean | không | Hiện giá trị hiện tại. |
| `label-position` | string | `top` | Vị trí giá trị: `top` \| `bottom`. |
| `show-step-labels` | boolean | không | Hiện min/max dưới thanh (bị bỏ qua khi vạch chia được vẽ). |
| `show-step-marks` | boolean | không | Vạch + nhãn cho mỗi bước (chỉ khi ≤ 50 bước). |
| `disabled` | boolean | không | Tắt (cũng qua `<fieldset disabled>`). |
| `error-text` | string | — | Dòng lỗi (error contract). |
| `id` | string | tự sinh `td-td-slider-{n}` | Tự gán nếu thiếu; id con: `{id}-label`, `{id}-control`, `{id}-error`. |

## Property & method

Property phản chiếu attribute (đều là **chuỗi**, trừ boolean): `min`, `max`, `value`, `step`, `name`, `size`, `color`,
`trackColor`, `label`, `ariaLabel`, `labelPosition`, `errorText`, và boolean `showLabel`, `showStepLabels`,
`showStepMarks`, `disabled`. Muốn số, dùng `getValue()`.

> Gán property trước khi phần tử gắn vào trang (hoặc trước khi module được import) vẫn có tác dụng từ 0.16.0: giá
> trị được áp khi phần tử kết nối lần đầu. Chi tiết: [Cách hoạt động](../concepts/how-it-works.md).

| Method / property | Trả về | Mô tả |
|---|---|---|
| `getValue()` | `number` | Giá trị đang hiển thị (đã được input native kẹp vào khoảng và làm tròn theo bước). Trước lần render đầu: số từ attribute. |
| `setValue(val)` | `void` | Đặt `value`, kẹp vào `[min, max]` và làm tròn về bước gần nhất tính từ `min` (như range native, 0.16.0). Không phải số hữu hạn → bỏ qua. Không phát event. |
| `TdSlider.messages` (static) | `object` | Thông báo validation `rangeUnderflow` / `rangeOverflow` / `stepMismatch` (`{min}` `{max}` `{step}`), tiếng Việt mặc định; ghi đè cho cả trang. 0.16.0. |
| `setDisabled(bool)` | `void` | Bật/tắt `disabled`. |
| `isDragging` | `boolean` | `true` khi đang nhấn giữ trên thanh. |
| `setError(msg)` / `clearError()` / `errorMessage` | — | Error contract. |
| `focus(options?)` | `void` | Focus input range bên trong. |
| `setCustomValidity(message)` | `void` | Lỗi custom chặn submit; `''` để gỡ. |
| `checkValidity()` / `reportValidity()` | `boolean` | Như native. |
| `form`, `validity`, `validationMessage`, `willValidate`, `labels` | — | Như native (chỉ đọc). |

## Event

| Event | detail | Khi nào | bubbles? |
|---|---|---|---|
| `input` | `{ value: number }` | Giá trị thay đổi khi kéo hoặc nhấn phím. | có (composed) |
| `change` | `{ value: number }` | Giá trị được chốt: thả chuột/ngón tay, hoặc mỗi lần nhấn phím. | có (composed) |

Không phát khi đổi bằng code (`setValue`, attribute `value`).

## Tuỳ biến giao diện

| Token | Mặc định (sáng) | Tác dụng |
|---|---|---|
| `--td-slider-color` | `var(--td-accent)` | Phần đã kéo + viền núm (accent 5.17:1 trên trắng). Attribute `color` đặt biến này trên host. |
| `--td-slider-track` | `var(--td-gray-200)` (tối: #3a3a40) | Rãnh phần chưa kéo. Attribute `track-color` đặt biến này trên host. |
| `--td-slider-thumb-bg` | `#fff` | Nền núm. |
| `--td-slider-disabled` | `var(--td-gray-400)` (tối: #5a5a62) | Phần đã kéo và viền núm khi disabled. |
| `--td-slider-w` | chưa đặt (theo size) | Độ rộng tuỳ ý, luôn `max-width: 100%`. |
| `--td-slider-w-sm` / `-md` / `-lg` | `200px` / `300px` / `400px` | Độ rộng theo size. |
| `--td-slider-h-sm` / `-md` / `-lg` | `4px` / `6px` / `8px` | Độ dày rãnh. |
| `--td-slider-thumb-sm` / `-md` / `-lg` | `14px` / `18px` / `22px` | Đường kính núm. |

Biến do JS đặt trên host (CSSOM, không override): `--td-slider-pct` (vị trí 0…1 của giá trị) và trên mỗi vạch
`--td-slider-mark`. Vạch chia dùng `--td-control-border-strong`; lỗi dùng `--td-field-error`; focus dùng
`--td-focus-ring`.

Minimal surfaces (0.20.0): rãnh và núm luôn đặc, núm có một bóng mềm; khi đang kéo (`[data-dragging]`) núm giữ nguyên
(không còn thấu kính trong, không phóng to). `[data-dragging]` vẫn được đặt để site tự style nếu muốn. Xem
[Theming](../customization/theming.md).

## Cấu trúc DOM & class

```html
<td-slider id="vol" label="Âm lượng" value="30" show-label show-step-labels>
  <div class="td-slider td-slider--md">
    <span class="td-slider__label" id="vol-label">Âm lượng</span>
    <output class="td-slider__value" for="vol-control" aria-hidden="true">30</output>
    <div class="td-slider__control">
      <input type="range" class="td-slider__input" id="vol-control" min="0" max="100" step="1" value="30"
             aria-labelledby="vol-label" aria-valuetext="30">
      <span class="td-slider__track" aria-hidden="true"><span class="td-slider__fill"></span></span>
      <!-- khi show-step-marks: <span class="td-slider__marks" aria-hidden="true"><span class="td-slider__mark"><span class="td-slider__mark-label">0</span></span>…</span> -->
      <span class="td-slider__thumb" aria-hidden="true"></span>
    </div>
    <div class="td-slider__range" aria-hidden="true"><span>0</span><span>100</span></div>
    <!-- khi có lỗi: <span class="td-field-error" id="vol-error" data-for="vol">…</span> -->
  </div>
</td-slider>
```

| Class / trạng thái | Ý nghĩa |
|---|---|
| `.td-slider` + `.td-slider--{sm\|md\|lg}` | Block và size. |
| `.td-slider__label` | Nhãn (`label`). |
| `.td-slider__value` | Giá trị (`show-label`); đứng trước hoặc sau `.td-slider__control` theo `label-position`. |
| `.td-slider__control` | Vùng tương tác, cao ≥ 24 px (44 px trên cảm ứng). |
| `.td-slider__input` | Range native, `opacity: 0`, phủ cả vùng; độ rộng núm native bằng `--td-slider-thumb` để vị trí con trỏ khớp giá trị. |
| `.td-slider__track`, `.td-slider__fill`, `.td-slider__thumb` | Phần vẽ (trang trí). |
| `.td-slider__marks`, `.td-slider__mark`, `.td-slider__mark-label` | Vạch chia. |
| `.td-slider__range` | Nhãn min/max. |
| `.td-slider[data-dragging]` | Đang kéo. |
| `.td-slider__input:disabled` / `:focus-visible` / `[aria-invalid="true"]` | Trạng thái. |

Render phía server: in sẵn khối trên; vị trí lấy từ `--td-slider-pct` trên host (không có JS thì đặt bằng rule CSS
của site hoặc để 0). Slider chưa có helper trong [adapter PHP](../guides/php-adapter.md): markup chuẩn là khối ở
trên (fixture `test/contracts/slider.html` của repo chỉ dùng cho test, không nằm trong gói npm). Xem
[WordPress & PHP](../guides/wordpress-php.md) và [bảng class cũ](../upgrading/class-map.md) (`.td-slider-*` → `.td-slider__*` ở 0.8.0).

## Bàn phím & trợ năng

- Range native: Tab để tới; mũi tên trái/phải/lên/xuống đổi một bước; Page Up/Page Down đổi bước lớn; Home/End về
  min/max.
- `aria-valuetext` = giá trị đã làm tròn theo bước, để trình đọc màn hình đọc đúng.
- Tên truy cập theo thứ tự: `label` (qua `aria-labelledby`) → `aria-label` trên host → `<label for="host-id">` ở ngoài.
  Lưu ý nhãn `label` là `<span>`, bấm vào nó không focus slider.
- Giá trị hiển thị (`<output>`), nhãn min/max và vạch chia có `aria-hidden` (trình đọc màn hình đã đọc giá trị từ
  input).
- Vùng bấm ≥ 24 px, 44 px trên màn cảm ứng.
- Đổi giá trị bằng code cập nhật tại chỗ (giữ focus). Đổi `disabled`, `min`, `max`, `step`, `label`… thì render lại.
- `forced-colors`: dùng màu hệ thống (`Highlight`, `CanvasText`, `GrayText`).

## Bảo mật

`label`, nhãn giá trị, `error-text` là text (escape). `color`/`track-color` qua `safeColor`. `min`/`max`/`step`/`value`
được parse thành số trước khi đưa vào markup.

## Cảm ứng

- Input range đặt `touch-action: none`: chạm để chọn giá trị, kéo thumb chắc tay. Đánh đổi: **vuốt dọc bắt đầu trên slider không cuộn trang** — trên điện thoại chừa chỗ cuộn quanh slider.

Chuẩn chung: [Cảm ứng](../guides/touch.md).

## Lưu ý & lỗi thường gặp

- **`getValue()` khác giá trị gửi trong form**: `getValue()` là giá trị hiển thị (đã kẹp/làm tròn); form gửi attribute
  `value` nguyên văn. Hai giá trị lệch nhau khi `value` nằm ngoài khoảng hoặc lệch bước — lúc đó field cũng không hợp
  lệ.
- **`el.value` là chuỗi**: `el.value + 1` ra `"301"`. Dùng `getValue()`.
- **Vạch chia không hiện**: kiểm tra số bước (`(max - min) / step`) có vượt 50 không.
- **Cần nhập số chính xác**: dùng [input field](input-field.md) `type="number"`.

## Xem thêm

- [Forms](../guides/forms.md)
- [Theming](../customization/theming.md)
- [Base element](base-element.md) — `TdFormElement`, error contract
- [Trợ năng](../guides/accessibility.md)
