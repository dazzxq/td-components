[Tài liệu](../README.md) › [Components](README.md) › Rating

# Đánh giá sao (chỉ đọc) — `<td-rating>`

Hiện điểm trung bình bằng sao — **số lẻ** (làm tròn nửa sao hoặc tô đúng tỉ lệ), tên trợ năng bằng **chữ thật** ("4,3
trên 5 sao"), số lượt "(1.234 đánh giá)" tuỳ chọn. Dùng cho thẻ sản phẩm, trang sản phẩm, danh sách đánh giá. **Chỉ đọc**:
không bấm được, không focus, không event (chế độ chọn sao để nhập là bản sau).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/rating'` (class: `import { TdRating } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | không |
| PHP | `td_rating(int\|float\|string\|null $value, array $o = [])` — in đủ cây, **chạy không JS** |
| Từ phiên bản | 0.50.0 (cần `td.css`) |

## Ví dụ nhanh

```html
<td-rating value="4.3" count="1234"></td-rating>                 <!-- ★★★★½ (1.234 đánh giá), đọc "4,3 trên 5 sao" -->
<td-rating value="4.5" show-value></td-rating>                    <!-- 4,5 ★★★★½ -->
<td-rating value="3.37" precision="exact" size="s"></td-rating>  <!-- sao thứ 4 tô đúng 37 % -->
<td-rating></td-rating>                                           <!-- "Chưa có đánh giá" (không vẽ sao) -->

<script type="module">import '@dazzxq/td-components/rating';</script>
```

```php
<?= td_rating($product['rating_avg'], ['count' => $product['rating_count']]) ?>
<?= td_rating(null) ?>  <!-- sản phẩm chưa có đánh giá -->
```

## Attribute

| Attribute | Kiểu / mặc định | Mô tả |
|---|---|---|
| `value` | số thập phân (`4.5`), tuỳ chọn | Điểm trung bình. Kẹp `[0, max]`. **Thiếu / rỗng / không phải số thập phân thường** (`4,5`, `1e3`, `-1`, `4.5abc`) → **chưa có đánh giá**. `value="0"` là 0 sao thật — khi sản phẩm chưa có đánh giá, **bỏ** attribute (PHP: truyền `null`). |
| `max` | số nguyên 1–10, mặc định `5` | Số sao. Ngoài khoảng → 5 + một cảnh báo console. |
| `precision` | `half` (mặc định) \| `exact` | Chỉ ảnh hưởng **hình sao**: `half` làm tròn tới nửa sao gần nhất (nửa làm tròn lên: 4,25 → 4,5; 4,74 → 4,5; 4,75 → 5); `exact` tô đúng tỉ lệ. Nhãn đọc luôn là giá trị thật (xem dưới). |
| `count` | số nguyên ≥ 0, tuỳ chọn | Số lượt đánh giá → "(1.234 đánh giá)" (phân cách nghìn bằng dấu chấm). Bỏ qua khi chưa có đánh giá. |
| `show-value` | boolean | Hiện "4,5" trước sao (chữ thường, ẩn với trình đọc màn hình vì nhãn đã có số). |
| `size` | `s` \| `m` (mặc định) \| `l` | Cỡ sao = `--td-icon-s` / `-m` / `-l` (16 / 20 / 24 px mặc định). |

## Property

| Property | Kiểu | Mô tả |
|---|---|---|
| `value` | `number \| null` | Đọc: giá trị đã kẹp, `null` khi chưa có đánh giá. Ghi: số (làm tròn 4 chữ số thập phân), chuỗi, hoặc `null` (bỏ attribute). |
| `max` | `number` | Số sao đang dùng (5 khi attribute sai). |
| `count` | `number \| null` | Số lượt. |
| `TdRating.labels` (static) | object | Chữ của **cả trang** (xem [Nhãn](#nhãn-và-ngôn-ngữ)). |

Không có method, không có event.

## Nhãn đọc được

- Tên trợ năng là **chữ thật** trong `span.td-sr-only` ("4,3 trên 5 sao"), không phải `role="img"` + `aria-label`: đọc
  được khi rating nằm trong link của thẻ sản phẩm, khi copy / dịch trang, và trên trình đọc không hỗ trợ role. Sao và số
  hiển thị là `aria-hidden`; "(1.234 đánh giá)" là chữ thường → đọc liền "4,3 trên 5 sao (1.234 đánh giá)".
- Nhãn dùng **giá trị thật làm tròn 1 chữ số thập phân**, dấu phẩy, bỏ ",0" — kể cả khi sao hiện nửa sao (4,3 → hình 4,5
  sao, đọc "4,3 trên 5 sao"): hình là xấp xỉ, số đọc là chính xác.
- Định dạng số tự viết (không `Intl`) để PHP và JS ra **cùng từng byte**.

## Chưa có đánh giá

`value` thiếu / không hợp lệ → **không vẽ sao** (5 sao rỗng bị mắt đọc thành "0 sao"), chỉ hiện chữ mờ "Chưa có đánh giá"
(đọc được, không ẩn), host có `data-empty`, `count` bị bỏ qua.

## Nhãn và ngôn ngữ

Một bộ chữ **tĩnh cho cả site** (không có nhãn theo từng phần tử):

```js
import { TdRating } from '@dazzxq/td-components/rating';
TdRating.labels.value = '{value} out of {max} stars';  // {value} {max}
TdRating.labels.count = '({count} reviews)';            // {count}
TdRating.labels.none = 'No reviews yet';
```

Gán **trước** khi phần tử nâng cấp (module của site chạy trước khi markup được parse, hoặc ngay sau import và trước khi chèn
markup). Markup PHP luôn in chữ mặc định tiếng Việt: khi site đổi nhãn JS, cổng hydrate thấy lệch và **render lại** bằng
nhãn JS (rẻ: không state) — kết quả nhất quán, không bao giờ trộn hai bộ. Site đa ngôn ngữ cần nhãn theo từng phần tử →
chờ bản sau (hợp đồng chung PHP + JS).

## PHP — `td_rating()`

```php
echo td_rating('4.3', ['count' => 1234, 'show_value' => true, 'size' => 's', 'class' => 'card__rating']);
```

- `$value`: `int` / `float` (âm → 0) hoặc chuỗi số thập phân thường (`/^\d+(\.\d+)?$/`, ≤ 16 ký tự); `null` / khác → chưa có
  đánh giá.
- Options: `max` (1–10; sai → 5 + `E_USER_WARNING`), `precision` (`half` | `exact`), `count`, `show_value`, `size`,
  `id`, `class`, `attrs` (host: allowlist + `aria-*` / `data-*` + `itemprop` (tên thuộc tính microdata, vd.
  `aggregateRating`); tên kit sở hữu và `data-td-*` bị chặn). **Không** có
  `labels`.
- In `<td-rating data-td-ssr="rating@1" …>` + đủ cây (sao, chữ) → đúng hình ngay khi tải trang, **không cần JS** (không
  CLS); module JS nhận tại chỗ khi markup khớp đúng cái nó tự dựng.
- **Kit không phát dữ liệu cấu trúc** (`AggregateRating` / `Review`): đó là việc của site, **chỉ từ đánh giá thật**. Muốn gắn
  microdata thì dùng `attrs` (`itemprop`…).

## Cấu trúc DOM (hợp đồng `rating@1`)

```html
<td-rating value="4.5" max="5" count="123" show-value>
  <span class="td-rating__value" aria-hidden="true">4,5</span>            <!-- chỉ khi show-value -->
  <span class="td-rating__stars" aria-hidden="true">
    <span class="td-rating__star" data-fill="100">
      <svg class="td-icon td-icon--m td-rating__off" data-icon="star" …></svg>
      <svg class="td-icon td-icon--m td-rating__on" data-icon="star" …></svg>
    </span>
    … (max sao; data-fill = 0 / 10 / … / 100)
  </span>
  <span class="td-sr-only">4,5 trên 5 sao</span>
  <span class="td-rating__count">(123 đánh giá)</span>                    <!-- chỉ khi có count -->
</td-rating>
```

Mỗi sao = hai icon `star` của registry chồng nhau: lớp nền (`__off`) + lớp tô (`__on`) bị cắt theo `--_td-rating-fill`
từ mép **đầu dòng**. `data-fill` (bậc 10 %) là đường không JS; `precision="exact"` tinh chỉnh sao tô dở bằng CSSOM
(`style.setProperty`, không bao giờ `style="…"` — CSP strict). Đổi hình sao: không có (icon `star` của kit).

## Token CSS

| Token | Mặc định | Ghi chú |
|---|---|---|
| `--td-rating-fill` | `var(--td-solid-warning-bg)` (`#f59e0b`) | Màu tô sao (sáng / tối như nhau) |
| `--td-rating-stroke` | `var(--td-color-warning)` | Viền sao tô — ≥ 3.2:1 trên mọi bề mặt (amber đặc chỉ 2.15:1 trên trắng) |
| `--td-rating-empty` | `var(--td-color-border-strong)` | Sao rỗng: xám nhạt **trang trí** (~1.5:1, có chủ đích — giá trị luôn có bằng chữ) |
| `--td-rating-value-fg` / `--td-rating-count-fg` | `var(--td-color-text)` / `var(--td-color-text-muted)` | Số hiển thị / số lượt, "Chưa có đánh giá" |
| `--td-rating-size` / `--td-rating-gap` | `var(--td-icon-m)` / `2px` | Cỡ sao mặc định (`size="s/l"` dùng `--td-icon-s/l`) / khe giữa sao |

Token màu là alias của token hợp đồng theme → palette sinh bởi `td-theme` và theme theo vùng tự đúng.

## Trợ năng

- Tên đọc là chữ (xem trên); sao không bao giờ là thông tin duy nhất.
- `forced-colors`: sao tô `CanvasText`, sao rỗng nền `Canvas` viền `CanvasText` — tô / rỗng / dở vẫn phân biệt.
  `prefers-contrast: more`: sao rỗng viền `currentcolor`.
- Không bao giờ xuống dòng giữa các sao.

## RTL

Sao xếp từ phải sang, tô từ mép phải (`:dir(rtl)`). **Hạn chế đã biết:** Chrome / Edge 102–119 chỉ nhận hướng đặt bằng
attribute `dir="rtl"` (ở host hoặc tổ tiên); hướng chỉ đặt bằng CSS `direction` thì sao vẫn tô từ trái.

## Bảo mật

Mọi chữ đi qua `textContent` (JS) / `Td::e` (PHP); số được kiểm theo dạng trước khi dùng. Không có HTML nào từ input.
