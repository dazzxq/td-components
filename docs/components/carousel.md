[Tài liệu](../README.md) › [Components](README.md) › Carousel

# Dải cuộn sản phẩm / ảnh — `<td-carousel>`

Dải ngang các slide (thẻ sản phẩm, ảnh) cuộn **native** bằng CSS scroll-snap, có nút trước / sau, chấm chọn trang và bộ
đếm. Số slide mỗi khung theo **container query** (token). **Không JS vẫn là một dải cuộn dùng được** (nội dung nằm sẵn
trong trang, crawl được, Tab tới được). **Không autoplay, không lặp, không kéo chuột** — lý do ở
[ADR 0024](../internal/decisions/0024-carousel-native-scroll.md).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/carousel'` (class: `import { TdCarousel } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | không |
| PHP | `td_carousel(array $slides, array $o = [])` — in khung + slide, giữ chỗ thanh điều khiển (không dịch layout) |
| Từ phiên bản | 0.50.0 (cần `td.css`) |

## Ví dụ nhanh

```html
<td-carousel label="Sản phẩm nổi bật" per-view="2">
  <div><a class="card" href="/p/1">…</a></div>
  <div><a class="card" href="/p/2">…</a></div>
  <div><a class="card" href="/p/3">…</a></div>
  <div><a class="card" href="/p/4">…</a></div>
</td-carousel>

<script type="module">import '@dazzxq/td-components/carousel';</script>
```

Mỗi **con trực tiếp** là một slide (con có `hidden` thì không phải slide). Lần nâng cấp đầu, JS dựng khung quanh chúng
(viewport > track > slide, thanh điều khiển, vùng thông báo) — **di chuyển** node một lần, không clone, không render lại.
Muốn không dịch layout lúc tải: dùng `td_carousel()` (PHP) hoặc viết sẵn khung (mẫu ở [Cấu trúc DOM](#cấu-trúc-dom-hợp-đồng-carousel1)).

Host là container (`container-type: inline-size`): nó **cần bề rộng từ cha** (khối thường, cột grid / flex có bề rộng).
Đặt trong flex item co theo nội dung (`flex: 0 1 auto`) → sụp về 0. Carousel cần ≥ 280 px.

## Attribute

| Attribute | Kiểu / mặc định | Mô tả |
|---|---|---|
| `label` | text, **nên có** | Tên vùng ("Sản phẩm nổi bật"). Thiếu → "Băng chuyền" + một cảnh báo console. |
| `per-view` | số nguyên 1–6, mặc định `1` | Số slide mỗi khung ở **mọi** bề rộng. Responsive → token (dưới). |
| `dots` | `auto` (mặc định) \| `on` \| `off` | `auto`: chấm khi cần ≤ 2 hàng chấm, nhiều hơn → chỉ bộ đếm "k / P"; `on`: chấm luôn; `off`: chỉ bộ đếm. |
| `step` | `page` (mặc định) \| `slide` | Nút trước / sau đi **một khung** hay **một slide**. Chấm luôn theo trang. |

## Property, method, event

| | Mô tả |
|---|---|
| `index` (đọc) | Chỉ số slide đầu tiên đang thấy (0-based). |
| `page` / `pageCount` (đọc) | Trang hiện tại (0-based) / số trang. |
| `next()` / `prev()` | Sang bước kế / trước (trang hoặc slide theo `step`). Ở hai đầu: không làm gì. |
| `goTo(index)` | Cuộn để slide `index` (kẹp) nằm đầu khung. |
| `refresh()` | Đo lại (thường không cần: `ResizeObserver` + `MutationObserver` tự làm). |
| `TdCarousel.labels` (static) | Chữ của **cả trang**: `carousel`, `roleCarousel` ("băng chuyền"), `roleSlide` ("mục"), `slide` ("{n} / {total}"), `prev`, `next`, `dots`, `dot` ("Trang {n} / {total}"), `status` ("Mục {from}–{to} / {total}"), `statusOne`. |
| event `slide-change` | `{ index, page, pageCount, reason: 'button' \| 'dot' \| 'scroll' \| 'api' }` — phát **khi cuộn dừng** và chỉ khi `index` đổi; không phát lúc nâng cấp. |

## Responsive: số slide mỗi khung

`per-view` = tiện cho một số. Responsive dùng **token trong CSS của site** (chạy cả khi không JS, hợp CSP), mobile-first theo
bề rộng **của carousel** (container query, mốc 480 / 720 / 1024 / 1280):

```css
.deals {
  --td-carousel-per-view: 1;      /* < 480 */
  --td-carousel-per-view-sm: 2;   /* ≥ 480 */
  --td-carousel-per-view-lg: 4;   /* ≥ 1024 (md / xl thừa kế bậc dưới) */
  --td-carousel-peek: 12%;        /* lộ một phần slide kế — gợi ý "còn nữa" trên điện thoại */
}
.thumbs { --td-carousel-slide-size: 220px; }   /* slide rộng cố định: bỏ qua per-view */
```

Bề rộng slide = `(100% − peek − (n − 1) × gap) / n`. Bề rộng slide do CSS (không phụ thuộc ảnh tải xong) → không dịch layout.

## Thanh điều khiển

Nằm **dưới** dải, trong lề nội dung (không có nút sát mép màn hình — vùng vuốt "back" của iOS), ở mọi kích thước:

| Bề rộng carousel | Bố cục |
|---|---|
| `< 480 px` | Hàng 1: `[‹]  3 / 8  [›]`; rồi các hàng chấm, **6 chấm / hàng**, căn giữa |
| `≥ 480 px` | ≤ 8 trang: một hàng `[‹] ● ● ━ ● [›]` (không bộ đếm); nhiều hơn: như hẹp, **8 chấm / hàng** |

`dots="auto"` rơi về chỉ bộ đếm khi cần > 2 hàng chấm (hẹp: > 12 trang; rộng: > 16). Một trang (mọi slide vừa khung) → ẩn
cả thanh. Thứ tự DOM = thứ tự hiển thị (Tab / đọc màn hình đúng như mắt thấy). Ở hai đầu nút có `aria-disabled="true"`
(vẫn focus được — focus không rơi về `<body>`), bấm bị bỏ qua.

## Không JS và giữ chỗ (CLS)

- Trước khi module tải, viewport (markup PHP) — hoặc chính host (markup viết tay) — là dải cuộn snap có thanh cuộn mảnh:
  vuốt / trackpad / thanh cuộn / Tab vào link đều dùng được.
- Thanh điều khiển PHP in sẵn với `data-td-js-only` → `visibility: hidden` **giữ đúng chiều cao** lúc sau nâng cấp: không
  dịch layout khi JS tới (Core Web Vitals). Đổi lại, nếu JS không bao giờ tải, dưới dải có khoảng trống bằng các hàng đó.
- Chiều cao giữ chỗ tính từ số trang **dự đoán** `max(1, ceil(số slide / per_view))`. Khi số slide mỗi khung phụ thuộc bề
  rộng (token responsive, `slide-size`, peek), dự đoán có thể lệch → dịch một hàng chấm (≤ 44 px) **một lần** lúc nâng cấp.
  Trang cần CLS tuyệt đối: dùng `per-view` attribute, hoặc `dots="off"` (chỉ hàng nút, luôn cố định).
- **Ngoại lệ chấp nhận: `dots="on"` cần hơn 2 hàng chấm** (hẹp: > 12 trang; rộng: > 16). CSS chỉ giữ chỗ tới 2 hàng, nên
  lúc nâng cấp khung chấm cao thêm (tối đa số hàng thừa × 44 px cảm ứng / 24 px chuột) **một lần**. Muốn không dịch: dùng
  `dots="auto"` (rơi về bộ đếm) hoặc `dots="off"`. Test: `td-v050-carousel.engines.browser-test.js` (case `c-on17`).

## Ảnh lười + LCP

Kit **không** đọc / ghi thuộc tính ảnh (`loading`, `src`, `srcset`, `sizes`, `decoding`, `fetchpriority`), không tải
sẵn. Khuyên: ảnh có `width` + `height` (hoặc `aspect-ratio`), `loading="eager"` cho khung đầu (ảnh LCP),
`loading="lazy"` cho slide ngoài khung đầu.

## PHP — `td_carousel()`

```php
use TdComponents\Td;

// $cardHtml do TEMPLATE của site dựng (template đã tự escape tên, giá… bên trong) → đánh dấu tin cậy bằng Td::html()
$slides = array_map(fn ($p) => Td::html(render_product_card($p)), $related);
echo td_carousel($slides, ['label' => 'Sản phẩm liên quan', 'per_view' => 2]);

echo td_carousel(['Ưu đãi 1', 'Ưu đãi 2'], ['label' => 'Ưu đãi']);   // chuỗi thường = CHỮ (được escape)
```

- `$slides` — mỗi phần tử là **một trong hai** (từ 0.50.0, sau Codex review):
  - `Td::html($cardHtml)` (`TdTrustedHtml`): markup do **template của chính site** sinh, in **nguyên văn** — đường opt-in
    tường minh duy nhất ([security-model §2](../internal/security-model.md)). **Không bao giờ bọc input người dùng**
    (mô tả, bình luận, tên do khách nhập…) trong `Td::html()`: escape nó **bên trong** template trước.
  - chuỗi thường: in như **chữ** (escape bằng `Td::e`) — `<img onerror=…>` hiện thành chữ, không chạy.
  - Khác (số, mảng, object khác) → bị bỏ + một `E_USER_WARNING`.
- Options (chữ đều escape): `label` (thiếu → "Băng chuyền" + `E_USER_WARNING`), `per_view` (1–6), `dots`, `step`, `id`,
  `class`, `attrs` (host: allowlist + `aria-*` / `data-*`; tên kit sở hữu và `data-td-*` bị chặn). **Không** có `labels`:
  nhãn khung là mặc định của kit; site đổi `TdCarousel.labels` thì JS ghi lại nhãn **khung** lúc nâng cấp (slide không bị
  chạm).
- In `data-td-pages`, `data-td-rows-narrow`, `data-td-rows-wide` (dự đoán) → JS đo thật và ghi lại.

## Cấu trúc DOM (hợp đồng `carousel@1`)

Site Blade / viết tay muốn markup có sẵn khung (không dịch layout) dùng đúng mẫu này:

```html
<td-carousel label="Sản phẩm nổi bật" per-view="2" data-td-ssr="carousel@1" data-td-pages="4"
             data-td-rows-narrow="1" data-td-rows-wide="inline"
             role="region" aria-roledescription="băng chuyền" aria-label="Sản phẩm nổi bật">
  <div class="td-carousel__viewport">                                    <!-- phần tử cuộn -->
    <div class="td-carousel__track">
      <div class="td-carousel__slide" role="group" aria-roledescription="mục" aria-label="1 / 8">…</div>
      …
    </div>
  </div>
  <div class="td-carousel__controls" data-td-js-only>                   <!-- thêm hidden khi chỉ 1 trang -->
    <button type="button" class="td-carousel__btn" data-td-carousel="prev" aria-label="Mục trước">‹svg prev›</button>
    <span class="td-carousel__counter" aria-hidden="true"></span>
    <button type="button" class="td-carousel__btn" data-td-carousel="next" aria-label="Mục tiếp theo">‹svg next›</button>
    <div class="td-carousel__dots" role="group" aria-label="Chọn trang"></div>
  </div>
  <p class="td-sr-only" role="status" aria-live="polite" aria-atomic="true"></p>
</td-carousel>
```

`data-td-rows-*` lấy từ bảng ở [Thanh điều khiển](#thanh-điều-khiển) (`rows-narrow` = `ceil(P / 6)`, `rows-wide` =
`inline` khi P ≤ 8, ngược lại `ceil(P / 8)`; `auto` > 2 hàng → `0`). Khung lệch (thiếu nút, nút là link…) → JS thay phần
đó bằng phần của kit, **không chạm slide**. Nhãn slide ("n / total") tính lại theo DOM thật; `aria-label` /
`aria-labelledby` riêng của site trên slide được giữ.

Luật khung (sau Codex review): mọi node khung (viewport, track, nút, chấm…) phải đúng thẻ + class + danh sách attribute
cho phép, lệch → thay bằng node mới của kit (con được chuyển sang, không clone). Viewport chỉ chứa **đúng một** con là
track: phần tử (hoặc chữ) nào khác nằm trong viewport trở thành **slide** theo thứ tự DOM — cùng luật với con trực tiếp
lạc của host; chữ trắng bị bỏ. Kiểm lại mỗi lần phần tử được gắn lại vào trang.

## Token CSS

| Token | Mặc định | Ghi chú |
|---|---|---|
| `--td-carousel-per-view[-sm\|-md\|-lg\|-xl]` | (không đặt → 1) | Số slide mỗi khung theo bề rộng carousel |
| `--td-carousel-slide-size` | (không đặt) | Slide rộng cố định (bỏ qua per-view) |
| `--td-carousel-peek` | `0px` | Phần slide kế lộ ra |
| `--td-carousel-gap` | `var(--td-space-sm)` | Khe giữa slide |
| `--td-carousel-gutter` | `0px` | Lề hai đầu dải (+ `scroll-padding-inline`) và thanh điều khiển |
| `--td-carousel-btn-size` | `36px` (con trỏ thô: `44px`) | Nút trước / sau (đặc, kiểu nút secondary) |
| `--td-carousel-dot-size` | `8px` | Chấm vẽ (vùng bấm = bước 24 px chuột / 44 px cảm ứng) |
| `--td-carousel-dot` / `--td-carousel-dot-active` | `var(--td-color-text-subtle)` / `var(--td-color-text)` | Chấm nghỉ (≥ 3.2:1) / chấm hiện tại (viên thuốc dài gấp ba) |

Dải tràn mép màn hình (full-bleed): giữ `--td-carousel-gutter` ≥ lề trang để slide đầu không nằm trong 24 px mép (vùng vuốt
"back").

## Bàn phím & trợ năng

- Host `role="region"` + `aria-roledescription` ("băng chuyền") + `aria-label`; slide `role="group"` +
  `aria-roledescription` ("mục") + "n / total". Không có mô hình phím riêng, không bắt phím toàn cục.
- Thứ tự Tab: nội dung slide → nút / chấm. Dải **không** có phần tử focus được (ảnh thuần) → viewport nhận `tabindex="0"`
  + tên vùng để ← / → / Home / End cuộn **native**; có link / nút trong slide → không thêm điểm Tab (Tab vào link của slide
  khuất thì trình duyệt tự cuộn tới).
- Slide khuất **không** `inert` / ẩn: trình đọc màn hình đọc tuần tự được mọi sản phẩm (như khi không JS).
- Vùng thông báo (`role="status"`) chỉ nói khi đổi trang bằng nút / chấm / API ("Mục 3–4 / 8"), không nói khi người dùng tự
  cuộn. Bộ đếm "k / P" là `aria-hidden` (thông tin đã có trong thông báo và nhãn slide).
- Chấm là **nút** (không phải tab): "Trang 2 / 3", chấm hiện tại `aria-current="true"` + dài hơn (không chỉ màu).
- Cuộn mượt chỉ khi `prefers-reduced-motion: no-preference`; ngược lại nhảy tức thì.
- `forced-colors`: nút `ButtonFace` / `ButtonText` + viền; chấm `CanvasText`, chấm hiện tại `Highlight`; nút ở đầu / cuối
  `GrayText`.

## Cảm ứng

Chỉ cuộn native: vuốt ngang cuộn dải, vuốt dọc bắt đầu trên dải **cuộn trang** (không `touch-action: pan-x`), không
listener pointer / touch / wheel, không chặn bánh xe. `overscroll-behavior-x: contain` (vuốt hết dải không kích hoạt "back"
của Chrome Android). Nút / chấm có hình nhấn (ADR 0019), vùng chạm ≥ 44 × 44 khi con trỏ thô.

## RTL

`dir="rtl"` (trang hoặc host): slide 1 ở mép phải, "tiếp" cuộn sang **trái**, mũi tên lật, chấm / nút / `goTo` / giữ slide
khi đổi cỡ đều đúng (toạ độ cuộn logic, kể cả quy ước `scrollLeft` âm). Hạn chế: Chrome / Edge 102–119 chỉ lật mũi tên khi
hướng đặt bằng attribute `dir` (không chỉ bằng CSS `direction`).

## Lưu ý

- Carousel trong panel đang ẩn (`display: none`: tab chưa chọn, drawer đóng) → không đo; đo khi hiện.
- Đổi cỡ / xoay máy giữ **slide đầu đang thấy**. Thêm / bớt slide (kể cả `hidden`) → nhãn "n / total" + chấm cập nhật.
- Carousel lồng carousel: không hỗ trợ chính thức.
- Không autoplay / loop / drag — xem [ADR 0024](../internal/decisions/0024-carousel-native-scroll.md); banner tự chạy là
  việc của site (và site chịu trách nhiệm nút dừng).
