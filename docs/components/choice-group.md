[Tài liệu](../README.md) › [Components](README.md) › Choice group

# Nhóm lựa chọn — `<td-choice-group>`

Chọn **một** trong N lựa chọn, hiển thị dạng **nút** (chữ, có thể kèm dòng phụ như giá, chấm màu hoặc ảnh nhỏ) hoặc dạng
**ô màu** (swatch: màu hoặc ảnh). Dùng cho trang sản phẩm (dung lượng, màu, phiên bản), gói dịch vụ, phương thức giao hàng —
mọi chỗ cần "radio" nhưng nhìn như nút bấm. Bên trong là **radio native**: bàn phím, "2 trên 3" của trình đọc màn hình, và
form **chạy không cần JS** (PHP `td_choice_group`).

Kit chỉ lo phần chọn. Việc **ghép tổ hợp → biến thể / giá / tồn kho / URL** là của app (công thức ở
[mục 5](#5-công-thức-biến-thể-dung-lượng--màu)).

Khi nào dùng cái nào: chọn **nhiều** → checkbox / [chip input](chip-input.md) `selection-only`; danh sách dài (> 8–10 mục)
hoặc cần tìm → [dropdown](dropdown.md); chọn một, ít lựa chọn, cần thấy hết → `<td-choice-group>`. Thanh chọn gọn kiểu viên
thuốc (Tự động / Sáng / Tối, chế độ xem) → `variant="segmented"` ([mục 7](#7-thanh-chọn-segmented-0520)).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/choice-group'` (class: `import { TdChoiceGroup } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | có (một mục `name=value`; chưa chọn → không có mục, như radio native) |
| Từ phiên bản | 0.49.0 (token-native: cần `td.css`); `variant="segmented"` + khoá `icon` từ 0.52.0 |

## Ví dụ nhanh

```html
<form method="post" action="/cart">
  <td-choice-group id="cap" name="capacity" label="Dung lượng" required></td-choice-group>
  <td-choice-group id="color" name="color" label="Màu sắc" variant="swatch"></td-choice-group>
  <button type="submit">Thêm vào giỏ</button>
</form>

<script type="module">
  import '@dazzxq/td-components/choice-group';
  const cap = document.getElementById('cap');
  cap.options = [
    { value: '128', label: '128GB', hint: '21.990.000₫' },
    { value: '256', label: '256GB', hint: '24.990.000₫', unavailable: true },
    { value: '1tb', label: '1TB', disabled: true },
  ];
  document.getElementById('color').options = [
    { value: 'titan-den', label: 'Titan đen', swatch: '#3b3b3d' },
    { value: 'titan-sa-mac', label: 'Titan sa mạc', image: 'https://cdn.example.vn/sw/sa-mac.webp', unavailable: true, unavailableLabel: 'Sắp về' },
  ];
  cap.addEventListener('change', (e) => console.log(e.detail.value, e.detail.option)); // "128" { value, label, hint, … }
</script>
```

## Cách dùng

### 1. Lựa chọn (`options`)

Gán bằng **property** `options` (mảng object). Mỗi lựa chọn:

| Khoá | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `value` | `string` (số hữu hạn → `String()`) | có | Mã định danh: 1–200 ký tự (code point), không ký tự điều khiển (kể cả xuống dòng, tab), không bao giờ cắt khoảng trắng. Duy nhất trong nhóm (so sau khi chuẩn hoá: `5` và `'5'` là một); trùng → bỏ bản sau; sai → bỏ lựa chọn |
| `label` | `string` | có | Tên (text). Dạng swatch: ẩn trực quan, vẫn là tên truy cập |
| `hint` | `string` | — | Dòng phụ trong nút (vd. giá — app tự định dạng). Đọc qua `aria-describedby`. Swatch: không hiện, vẫn đọc |
| `swatch` | màu CSS | — | Hex / `rgb()` / `hsl()` / tên màu (qua `safeColor`, tối đa 64 ký tự). Sai → ô trung tính + cảnh báo |
| `image` | URL | — | Ảnh swatch (thắng `swatch` khi hợp lệ). Xem [mục 4](#4-ô-màu-màu-hoặc-ảnh) |
| `disabled` | `boolean` | — | **Không chọn được** (tổ hợp không tồn tại) |
| `unavailable` | `boolean` | — | **Chọn được**, gạch chữ + ghi chú (hết hàng) |
| `unavailableLabel` | `string` | — | Ghi chú thay "Hết hàng" (vd. "Sắp về", "Không có") |
| `icon` | tên icon | — | 0.52.0, chỉ hiện ở `segmented`: tên trong [registry icon](icons.md) (`/^[a-z][a-z0-9-]{0,63}$/`, đã đăng ký). Sai / không có → bỏ icon (giữ lựa chọn) + cảnh báo |

**Giới hạn** (giống hệt PHP `Td::CHOICE_LIMITS`): đọc tối đa **400** phần tử của mảng, nhận tối đa **100** lựa chọn (phần sau bị
bỏ); `label` / `hint` dài quá 200 ký tự, `unavailableLabel` quá 100 bị **cắt**; `value` quá 200, `swatch` quá 128, `image`
quá 8192 ký tự bị **từ chối**. Có gì bị bỏ / cắt → **một** cảnh báo console duy nhất với số lượng (không in giá trị). Property
`options` đọc ra bản sao đã chuẩn hoá (đông cứng).

Giới hạn cấp nhóm (cũng trong `CHOICE_LIMITS`, code point): `id` 100, `name` 200, `class` 256, `label` / `aria-label` 200,
`helper-text` 1000, `error-text` 1000. PHP `td_choice_group` **không in gì** (một cảnh báo cố định) khi vượt; markup server
vượt các giới hạn này (hoặc ngân sách preflight: số node, độ sâu, ≤ 16 thuộc tính mỗi phần tử kể cả host, độ dài thuộc tính)
thì component **không nhận** mà vẽ lại từ đầu + một cảnh báo cố định. Markup PHP in ra ở đúng giới hạn luôn được nhận.

Gán `options` làm lựa chọn **đang focus** thành `disabled` → focus chuyển sang điểm dừng Tab của nhóm (không cuộn trang).

**Gán lại `options` khi danh sách `value` giữ nguyên thứ tự → vá tại chỗ**: radio giữ nguyên node, focus không mất, không
phát event; chỉ trạng thái / chữ / màu / ảnh đổi. Đây là ca "HTML trang sản phẩm được cache, app tải tồn kho sau bằng một
request nhỏ" — cứ gán lại cả mảng. Danh sách `value` khác → vẽ lại, focus đi theo `value` (mất lựa chọn đang focus → về điểm
dừng Tab của nhóm). Lựa chọn **đang được chọn biến mất** → giá trị thành `''` (+ cảnh báo, không event).

### 2. `disabled` hay `unavailable`?

| | `disabled` | `unavailable` |
|---|---|---|
| Ý nghĩa nên dùng | Tổ hợp **không tồn tại** (máy này không có bản 1TB màu hồng) | **Hết hàng** / sắp về |
| Chọn được | Không (bỏ qua khi đi mũi tên) | **Có** (khách vẫn xem được giá / ảnh của bản đó) |
| Hình | Mờ (token disabled của nút) | Chữ gạch ngang + ghi chú "Hết hàng"; swatch: vạch chéo hai tông |
| Trình đọc màn hình | "128GB, mờ" | "256GB, Hết hàng, radio, 2 trên 3" |
| `required` | Không tính là lựa chọn được | Tính là lựa chọn được |

Lý do không chặn chọn bản hết hàng: chỉ một tổ hợp hết thì khách không bị kẹt (chọn được màu X rồi đổi dung lượng). Kit
**không** đổi validity theo `unavailable`; nút "Thêm vào giỏ" do app bật / tắt.

Tổ hợp không có, hai cách (ranh giới app): `disabled`, **hoặc** `unavailable` + `unavailableLabel: 'Không có'` (cho phép bấm
rồi app tự nhảy sang tổ hợp gần nhất).

Lựa chọn **đang chọn** bị app đổi thành `disabled` → kit **giữ** giá trị (không đổi lặng lẽ, không event); app tự
`setValue()` nếu muốn bỏ.

### 3. `required`

Chưa chọn + có ít nhất một lựa chọn chọn được → `valueMissing` "Vui lòng chọn một mục" (`aria-required` trên
`role="radiogroup"`). **Mọi lựa chọn đều `disabled` (hoặc `options` rỗng) → hợp lệ**: form vẫn gửi được, không
`aria-required`, lỗi "Vui lòng chọn một mục" đang hiện bị xoá — giống hệt nhóm radio native (radio `disabled` không tham gia
kiểm tra), nên trước và sau khi JS tải cho cùng kết quả. Có lại lựa chọn chọn được → `required` có hiệu lực lại ngay (lỗi
không tự hiện tới lần kiểm kế tiếp). Cần chặn gửi khi "không còn gì để chọn" → app tự chặn.

### 4. Ô màu: màu hoặc ảnh

`variant="swatch"`: ô tròn `--td-choice-swatch-size` (2rem), tên ẩn trực quan, dòng nhãn hiện lựa chọn hiện tại
("Màu sắc: Titan đen" — thêm " — Hết hàng" khi bản đó `unavailable`; phần này `aria-hidden`, không lặp trong tên nhóm).
Không tooltip (cảm ứng không có hover — thông tin bắt buộc không đặt trong tooltip).

- **Màu** vẽ bằng thuộc tính `fill` của SVG (presentation attribute, **không** phải inline style) → chạy dưới CSP strict,
  chạy cả khi không có JS (PHP in sẵn). Vành trong `--td-choice-swatch-edge` để ô trắng vẫn thấy trên nền trắng.
- **Ảnh** là `<img alt="" loading="lazy" decoding="async">` (không `background-image`). Site phải mở CSP `img-src` cho CDN
  ảnh. Ảnh bị chặn → vẫn còn tên + vòng chọn.
- **Luật URL ảnh**:
  - JS: `https:`; `http:` **chỉ khi trang là `http:`**; tương đối / `/…` / `//…`; không `data:` / `blob:` / `javascript:`;
    ≤ 8 KiB.
  - PHP (`td_choice_group`): `https:` + không scheme (tương đối, `/…`, `//…`); `http:` bị **từ chối** trừ khi site khai báo
    `Td::allowHttpLinks(true)` (site chạy HTTP). PHP không biết scheme của trang: bật cờ đó mà trang thực tế là HTTPS thì
    PHP in `<img src="http:…">`, JS khi nhận markup kiểm lại → từ chối → vẽ lại **không có ảnh** (về màu / ô trung tính, giữ
    lựa chọn và focus). Trước khi module tải, trình duyệt tự chặn / nâng cấp mixed content.

Dạng `button` cũng nhận `swatch` / `image` → chấm màu / ảnh nhỏ trước chữ.

### 5. Công thức biến thể (dung lượng × màu)

Kit không biết biến thể. Mẫu cho trang sản phẩm (hai nhóm + một hidden `variant_id` + nút giỏ):

```html
<form id="buy" method="post" action="/cart">
  <td-choice-group id="cap" name="capacity" label="Dung lượng" required></td-choice-group>
  <td-choice-group id="color" name="color" label="Màu sắc" variant="swatch" required></td-choice-group>
  <input type="hidden" name="variant_id">
  <p id="price"></p>
  <button type="submit" id="add">Thêm vào giỏ</button>
</form>
<script type="module">
  import '@dazzxq/td-components/choice-group';
  const VARIANTS = window.PRODUCT.variants; // [{ id, slug, signature: { capacity: '256', color: 'titan-den' }, price, stock, image }]
  const cap = document.getElementById('cap');
  const color = document.getElementById('color');
  const find = (c, k) => VARIANTS.find((v) => v.signature.capacity === c && v.signature.color === k);

  function sync() {
    // nhóm kia: tổ hợp không có → disabled; hết hàng → unavailable (vá tại chỗ: cùng danh sách value)
    color.options = window.PRODUCT.colors.map((o) => {
      const v = find(cap.value, o.value);
      return { ...o, disabled: !!cap.value && !v, unavailable: !!v && v.stock === 0 };
    });
    const v = find(cap.value, color.value);
    document.querySelector('[name=variant_id]').value = v ? v.id : '';
    document.getElementById('price').textContent = v ? v.priceText : '';
    document.getElementById('add').disabled = !v || v.stock === 0;
    if (v) history.replaceState(null, '', `?bien-the=${encodeURIComponent(v.slug)}`);
  }
  cap.addEventListener('change', sync);
  color.addEventListener('change', sync);
  // tồn kho tải sau (trang được cache): gán lại options → vá tại chỗ, không mất focus, không event
  fetch('/api/stock?product=42').then((r) => r.json()).then((stock) => { /* cập nhật VARIANTS[].stock */ sync(); });
</script>
```

Lưới 3 cột đều (dung lượng) → CSS **không layer** của site:

```css
#cap .td-choice__options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
```

### 6. Render phía server (PHP)

```php
echo td_choice_group('capacity', [
    ['value' => '128', 'label' => '128GB', 'hint' => '21.990.000₫'],
    ['value' => '256', 'label' => '256GB', 'unavailable' => true],
    ['value' => '1tb', 'label' => '1TB', 'disabled' => true],
], $selected, ['label' => 'Dung lượng', 'required' => true]);
```

Luôn in element `<td-choice-group data-td-ssr="choice-group@1">` + radio **native** mang `name` thật (+ `required` trên mọi
radio, `checked` trên lựa chọn đang chọn): **không JS** form vẫn gửi `capacity=128`, mũi tên / Space / Tab chạy. Module tải →
nhận **tại chỗ** (cùng node radio: lựa chọn + focus giữ nguyên). Option khoá PHP dùng `unavailable_label`. Chi tiết:
[Adapter PHP › td_choice_group](../guides/php-adapter.md#td_choice_group-0490).

Giới hạn không JS: dòng "lựa chọn hiện tại" của swatch là chữ tĩnh lúc in (đổi lựa chọn không cập nhật dòng đó; tên vẫn đọc
được qua trình đọc màn hình).

### 7. Thanh chọn segmented (0.52.0)

```html
<td-choice-group id="theme" name="theme" aria-label="Giao diện" variant="segmented" size="sm" value="auto"></td-choice-group>
<script type="module">
  import '@dazzxq/td-components/choice-group';
  document.getElementById('theme').options = [
    { value: 'auto', label: 'Tự động', icon: 'monitor' },
    { value: 'light', label: 'Sáng', icon: 'sun' },
    { value: 'dark', label: 'Tối', icon: 'moon' },
  ];
</script>
```

- Một **rãnh** nền nhạt, các ô **bằng nhau** (= ô rộng nhất), ô đang chọn là **viên thuốc** sáng + vòng 1px (≥ 3:1 với
  rãnh và viên) + chữ đậm — đổi hình + độ đậm, không chỉ màu. Chữ đậm đã được giữ chỗ nên đổi lựa chọn không xô ô.
  Không có thanh trượt animation.
- Mỗi ô: icon (khoá `icon`) + nhãn. `icon-only`: nhãn **ẩn trực quan** (vẫn là tên truy cập của radio) — lựa chọn nào
  không có icon hợp lệ thì vẫn hiện nhãn (không bao giờ ra ô trống) + cảnh báo. Nhóm vẫn cần tên (`label` / `aria-label`).
- `size`: `sm` (32px) / `md` (40px, mặc định) / `lg` (48px); **trên cảm ứng mọi cỡ ≥ 44 × 44**. `size` chỉ áp cho
  `segmented`.
- `hint` không hiện trong ô (vẫn là mô tả cho trình đọc màn hình); `swatch` / `image` bị bỏ qua (cảnh báo). `disabled` /
  `unavailable` / `required` / form / reset / SSR như mọi variant. `icon-only` + `unavailable`: vạch chéo qua icon.
- Muốn rãnh **lấp hết cột** (sidebar, menu): attribute `stretch` (0.53.1; PHP `'stretch' => true`) — xem
  [Bố cục ở chỗ hẹp](#bố-cục-ở-chỗ-hẹp-0531).
- **Vì sao không phải [`td-tabs`](tabs.md):** tabs là `role="tablist"` — **điều hướng** giữa các vùng nội dung trên trang
  (trình đọc màn hình đọc "thẻ 1 trên 3" và chờ một `tabpanel`, mũi tên mặc định chỉ dời focus), không gửi form. Theme / chế
  độ là **một giá trị** (lưu, gửi, khôi phục) → `role="radiogroup"`: mũi tên chọn luôn, có `name` / `required` / reset /
  SSR.

#### Bố cục ở chỗ hẹp (0.53.1)

Một thanh segmented luôn có **đúng một** bố cục cho **mọi** ô — không bao giờ có ô xếp icon trên nhãn cạnh ô nằm ngang.
Component đo nội dung (một `ResizeObserver` trên host) và chọn bậc **đầu tiên vừa chỗ**:

| Bậc (`data-layout` trên `.td-choice__options`) | Khi nào | Hình |
|---|---|---|
| `equal` | `n × (ô rộng nhất) + khung ≤ chỗ` | Ô **bằng nhau**, icon + nhãn nằm ngang. Không `stretch`: rãnh rộng theo nội dung; `stretch`: lấp cột |
| `fit` | `Σ(bề rộng ô) + khung ≤ chỗ` | Icon + nhãn ngang; ô không bao giờ hẹp hơn nội dung một dòng của nó, các ô còn lại **chia đều** phần dư; rãnh lấp cột |
| `stacked` | còn lại | **Mọi** ô xếp icon trên nhãn, ô bằng nhau, rãnh lấp cột; nhãn dài xuống dòng trong ô (không cắt) |
| `stacked` + `data-overflow` | `minRail > chỗ` | Như `stacked`, ô ở bề rộng tối thiểu; **rãnh tự cuộn ngang** — trang không bao giờ tràn ngang |

```
khung   = (n − 1) × --td-choice-seg-gap + 2 × --td-choice-seg-pad
minRail = Σ minᵢ + khung,   minᵢ = max(44 px khi cảm ứng / 0 khi chuột, 2 × padding ngang + max(icon, từ dài nhất của nhãn))
```

- Ví dụ sidebar 216 px (`size="sm"`, `stretch`, Tự động / Sáng / Tối): bậc `fit` — ba ô ngang, lấp sidebar.
- **Cảm ứng ở chỗ rất hẹp:** ô giữ ≥ 44 × 44 px; 3 ô cần `3 × 44 + 2 × 2 + 2 × 3 = 142 px` — ở 140 px rãnh **cuộn ngang
  trong chính nó** (vuốt ngang trên thanh), không bao giờ làm trang tràn. Ô đang focus / đang chọn luôn được kéo vào vùng
  thấy (chỉ cuộn rãnh, không cuộn trang; đúng cả RTL).
- **Trước khi JS tải / tắt JS:** thanh dùng bậc `equal` (như 0.52), icon luôn cạnh nhãn (không bao giờ trộn); chỗ hẹp thì rãnh
  tự cuộn. Khi module tải, bậc đúng được chọn — **hộp của thanh không đổi** (mọi bậc cao bằng nhau: ở `stacked` icon tự thu
  nhỏ cho vừa chiều cao ô). Ngoại lệ duy nhất: `stacked` với nhãn phải xuống dòng → cao thêm đúng số dòng.
- Đo lại tự động khi: bề rộng host đổi, font web tải xong (`document.fonts`), đổi `size` / `stretch` / `icon-only` /
  `variant` / `label` / `options`, chuột ↔ cảm ứng, cỡ chữ của thanh đổi. Đổi theme (`data-td-theme`) chỉ đổi màu nên không cần
  đo. **Site tự sửa token hình học / font bằng CSS lúc chạy mà bề rộng host không đổi → gọi `el.relayout()`.**
- Token kích thước ô (0.53.1): `--td-choice-seg-gap`, `--td-choice-seg-px`, `--td-choice-seg-font`, `--td-choice-seg-icon`,
  `--td-choice-seg-icon-gap` ([bảng token](#tuỳ-biến-giao-diện)). `sm` gọn hơn 0.52 (padding 6 px, icon 16 px, khe 4 px).
- **Caption:** dùng `label="Giao diện"` (nhãn field nhìn thấy, cũng là tên của nhóm) thay `aria-label` khi muốn có chữ phía
  trên thanh — ví dụ sidebar. Trong menu tài khoản dùng `label` của **mục menu** (đừng đặt cả hai).

```php
<?= td_choice_group('', $THEMES, $theme, ['id' => 'theme-switch', 'label' => 'Giao diện',
    'variant' => 'segmented', 'size' => 'sm', 'stretch' => true]) ?>
```

#### Công thức: chuyển theme (Tự động / Sáng / Tối)

Kit không có component theme riêng ([Theming › Light / dark / auto](../customization/theming.md#light--dark--auto)) — ghép
`segmented` với `data-td-theme` + cookie:

```php
<?php
$theme = $_COOKIE['td_theme'] ?? 'auto';
if (!in_array($theme, ['light', 'dark', 'auto'], true)) $theme = 'auto'; // whitelist, không in chuỗi thô
?>
<html lang="vi" data-td-theme="<?= $theme ?>">
<head>
  <meta name="color-scheme" content="<?= ['light' => 'light', 'dark' => 'dark', 'auto' => 'light dark'][$theme] ?>">
  <script src="/assets/theme-boot.js"></script>  <!-- đồng bộ, KHÔNG module: đặt attribute trước lần vẽ đầu -->
  <link rel="stylesheet" href="/assets/td.css">
</head>
…
<?= td_choice_group('', [
  ['value' => 'auto', 'label' => 'Tự động', 'icon' => 'monitor'],
  ['value' => 'light', 'label' => 'Sáng', 'icon' => 'sun'],
  ['value' => 'dark', 'label' => 'Tối', 'icon' => 'moon'],
], $theme, ['id' => 'theme-switch', 'aria_label' => 'Giao diện', 'variant' => 'segmented', 'size' => 'sm', 'icon_only' => true]) ?>
```

```js
// module của trang — chỉ chạy khi người dùng đổi (lần vẽ đầu đã đúng nhờ attribute PHP + theme-boot.js)
import '@dazzxq/td-components/choice-group';
document.getElementById('theme-switch').addEventListener('change', (e) => {
  const v = e.detail.value; // 'auto' | 'light' | 'dark'
  document.documentElement.setAttribute('data-td-theme', v);
  document.cookie = `td_theme=${v}; path=/; max-age=31536000; SameSite=Lax`;
});
```

- `name` rỗng: nhóm không gửi form (chỉ là điều khiển của trang). Bàn phím: Tab vào, ← → đổi theme ngay.
- `theme-boot.js` (mục [Không chớp trắng](../customization/theming.md#không-chớp-trắng-no-fouc)) vẫn cần cho trang
  không render PHP / cache HTML; nút chuyển chỉ đổi attribute + cookie.
- Đặt công tắc **trong menu tài khoản** (`TdMenu`, 0.53.0): mục `type: 'custom'` trả về chính `td-choice-group` này —
  [công thức](menu.md#công-thức-chuyển-theme-trong-menu-tài-khoản).

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `name` | string | — | Tên field khi submit. |
| `value` | string | `''` | Giá trị **mặc định** (`form.reset()` về đây). Đổi sau khi render → đặt luôn giá trị sống (không event). |
| `label` | string | — | Nhãn nhóm hiển thị (tên của `role="radiogroup"`). |
| `variant` | `button` \| `swatch` \| `segmented` | `button` | Dáng; giá trị lạ → `button`. `segmented` từ 0.52.0 ([mục 7](#7-thanh-chọn-segmented-0520)). |
| `size` | `sm` \| `md` \| `lg` | `md` | 0.52.0, chỉ `segmented`: chiều cao ô (32 / 40 / 48px; cảm ứng ≥ 44). |
| `icon-only` | boolean | — | 0.52.0, chỉ `segmented`: nhãn ẩn trực quan (vẫn là tên truy cập). |
| `stretch` | boolean | — | 0.53.1, chỉ `segmented`: thanh lấp cột chứa nó ([Bố cục ở chỗ hẹp](#bố-cục-ở-chỗ-hẹp-0531)). |
| `required` / `disabled` | boolean | — | [Mục 3](#3-required); `disabled` khoá cả nhóm (cả `<fieldset disabled>` tổ tiên). |
| `helper-text` / `error-text` | string | — | Ghi chú / lỗi dưới nhóm (error contract). |
| `aria-label` | string | — | Tên khi không có `label`. |

## Property & method

| Thành viên | Kiểu / chữ ký | Mô tả |
|---|---|---|
| `options` | `Array<object>` | [Mục 1](#1-lựa-chọn-options). |
| `value` | `string` | Giá trị đang chọn (`''` = chưa chọn). Gán = `setValue()`. |
| `getValue()` / `setValue(v)` | | Không phát event. Giá trị không có trong `options` → `''` + cảnh báo (trước khi có `options`: giữ, kiểm khi `options` tới). |
| `selectedOption` | `object \| null` | Bản sao đông cứng `{ value, label, hint, disabled, unavailable, index }`. |
| `setHelper(msg)` / `setError(msg)` / `clearError()` / `errorMessage` | | Error contract. |
| `form`, `validity`, `validationMessage`, `willValidate`, `checkValidity()`, `reportValidity()` | | Như control native; bong bóng neo vào radio đang chọn / radio đầu tiên chọn được. |
| `focus()` | | Focus điểm dừng Tab của nhóm. |
| `relayout()` | `void` | 0.53.1, `segmented`: đo lại và chọn lại bậc bố cục ngay — cho thay đổi kit không tự thấy (site sửa token hình học / font bằng CSS mà bề rộng host giữ nguyên). |
| `stretch` | `boolean` | 0.53.1: phản chiếu attribute `stretch`. |
| `TdChoiceGroup.messages` | static | `valueMissing` "Vui lòng chọn một mục", `unavailable` "Hết hàng". |

## Event

| Event | detail | Khi nào |
|---|---|---|
| `input` | `{ value, option }` | Người dùng chọn (chuột, chạm, Space, mũi tên). |
| `change` | `{ value, option }` | Ngay sau `input`, cùng lần chọn. |

`option` là bản sao đông cứng (không bao giờ là object nội bộ). `input` / `change` native của radio **dừng ở host**. Gán
`value` / `setValue()` / `options` / `form.reset()` không phát event.

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-choice-gap` | `var(--td-space-xs)` | Khoảng giữa các lựa chọn (swatch + 4px) |
| `--td-choice-h` | `2.5rem` | Chiều cao tối thiểu nút (44px trên cảm ứng) |
| `--td-choice-radius` | `var(--td-radius-md)` | Bo góc nút |
| `--td-choice-bg` | `var(--td-control-bg)` | Nền nút |
| `--td-choice-border` | `var(--td-control-border-soft)` | Viền nút khi nghỉ |
| `--td-choice-border-hover` | `var(--td-control-border-hover)` | Viền khi rê chuột |
| `--td-choice-selected` | `var(--td-color-text)` | Vòng mực 2px của lựa chọn đang chọn (≥ 3:1 với nền) |
| `--td-choice-hint-fg` | `var(--td-color-text-muted)` | Dòng phụ / ghi chú / chữ gạch (≥ 4.7:1) |
| `--td-choice-swatch-size` | `2rem` | Cỡ ô màu |
| `--td-choice-swatch-edge` | `var(--td-color-border-strong)` | Vành trong của ô màu |
| `--td-choice-seg-bg` | `var(--td-color-hover)` | 0.52.0 segmented: rãnh |
| `--td-choice-seg-pill` | `var(--td-control-bg)` | 0.52.0: viên thuốc ô đang chọn |
| `--td-choice-seg-ring` | `var(--td-color-text-muted)` | 0.52.0: vòng 1px quanh viên (≥ 3:1 với rãnh và viên — mực muted được bộ sinh palette giữ ≥ 4.7 trên rãnh hover và mọi bề mặt) |
| `--td-choice-seg-fg` / `-fg-selected` | `var(--td-color-text-label)` / `var(--td-color-text)` | 0.52.0: chữ / icon ô nghỉ (≥ 4.7 trên rãnh, cả trên nền trang sáng của kit) / ô chọn + hover |
| `--td-choice-seg-h` | `2.5rem` (sm `2rem`, lg `3rem`) | 0.52.0: chiều cao ô (cảm ứng ≥ 44px) |
| `--td-choice-seg-pad` / `--td-choice-seg-radius` | `3px` / `var(--td-radius-full)` | 0.52.0: đệm rãnh / bo. Viền focus của ô nằm trong đệm (`outline-offset = đệm − 2px`) để rãnh cuộn không cắt nó |
| `--td-choice-seg-gap` | `2px` | 0.53.1: khe giữa các ô |
| `--td-choice-seg-px` | `0.875rem` (sm `0.375rem`, lg `1.125rem`; `icon-only` `0.625rem`) | 0.53.1: padding ngang ô |
| `--td-choice-seg-font` | `var(--td-text-sm)` (sm `text-xs`, lg `text-base`) | 0.53.1: cỡ chữ nhãn |
| `--td-choice-seg-icon` | `1.25rem` (sm `1rem`) | 0.53.1: cỡ icon (ở `stacked` tự thu nhỏ cho vừa chiều cao ô) |
| `--td-choice-seg-icon-gap` | `0.375rem` (sm `0.25rem`) | 0.53.1: khe icon ↔ nhãn |

Mọi màu đọc token của hợp đồng theme → dark / `auto` / theme theo vùng / palette sinh tự đúng. Đã chọn = **vòng mực** (đổi
hình dạng, không chỉ màu); focus = viền focus của kit **ngoài** mặt nút, tách khỏi vòng chọn. Nhãn dài xuống dòng trong nút
(không cắt `…`).

## Cấu trúc DOM & class

```html
<td-choice-group id="c" name="color" label="Màu sắc" variant="swatch" value="den">
  <div class="td-field td-choice td-choice--swatch">
    <div class="td-field__label td-choice__label" id="c-label">Màu sắc<span class="td-choice__current" aria-hidden="true">: Titan đen</span></div>
    <div class="td-choice__options" role="radiogroup" aria-labelledby="c-label">
      <label class="td-choice__option" data-td-value="den">
        <input type="radio" class="td-choice__input" id="c-o0" value="den" name="td-choice-7" form="" autocomplete="off" aria-labelledby="c-o0-l">
        <span class="td-choice__face">
          <svg class="td-choice__swatch" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#3b3b3d"></circle></svg>
          <span class="td-choice__text td-sr-only" id="c-o0-l">Titan đen</span>
        </span>
      </label>
      <!-- unavailable: data-unavailable trên label + span.td-choice__note (id …-n) trong aria-describedby;
           disabled: data-disabled + radio disabled -->
    </div>
    <div class="td-field__footer" hidden><div class="td-field__note" id="c-note" hidden></div></div>
  </div>
</td-choice-group>
```

Dạng `segmented` (0.52.0): `.td-choice--segmented.td-choice--{sm|md|lg}` (+ `.td-choice--icon-only`); mặt ô =
`span.td-choice__icon[data-td-icon][aria-hidden]` (khi có icon) + `span.td-choice__text[data-label]` (`data-label` = nhãn, giữ
chỗ chữ đậm; `td-sr-only` khi `icon-only`) + dòng phụ / ghi chú `td-sr-only`. SSR: ô icon so theo thuộc tính, SVG bên trong
(chỉ nhận `<svg>`) được vẽ lại từ registry khi nhận.

Dạng `button`: `.td-choice--button`, chữ / dòng phụ / ghi chú hiện trong `span.td-choice__body`. Trạng thái đọc từ radio
native: `:checked`, `:disabled`, `:focus-visible` (+ `[data-unavailable]` / `[data-disabled]` trên lựa chọn,
`[aria-invalid]` trên radiogroup). Radio nằm trong **nhóm riêng không có form owner** (`form=""`,
[ADR 0023](../internal/decisions/0023-unowned-radio-group.md)): không bao giờ vào FormData, `form.reset()` không đụng — host
gửi giá trị.

### Hợp đồng SSR `choice-group@1`

[ADR 0012](../internal/decisions/0012-ssr-hydration.md). Markup PHP = cây trên với radio mang `name` thật + `required`, không
`form` / `autocomplete`. Nhận tại chỗ khi: dấu `choice-group@1`; đọc lại `options` từ markup qua **cùng cổng** với property
(màu / URL ảnh kiểm lại) không bị từ chối gì; cây đúng `render()` cho các lựa chọn đó (allowlist thuộc tính radio, mặt nút
khớp từng phần, chỉ có radio là control); `name` / `required` / `disabled` của radio khớp host; không gán `options` trước khi
define. Nhận: ElementInternals trước, rồi trên **cùng node** đổi `name` → nhóm riêng + `form=""` + `autocomplete="off"`, gỡ
`required`. Lựa chọn người dùng đổi trước khi module tải là trạng thái sống (thắng attribute; property `value` gán sớm thắng
tất cả). Không khớp → vẽ lại an toàn ngay, giữ lựa chọn + focus. Ghi chú "Hết hàng" mặc định là **trạng thái** (`messages`),
áp lại khi nhận; ghi chú riêng mang `data-td-custom`.

## Bàn phím & trợ năng

| Phím | Tác dụng |
|---|---|
| Tab / Shift+Tab | Vào / ra nhóm — **một** điểm dừng (lựa chọn đang chọn; chưa chọn: lựa chọn đầu tiên chọn được) |
| ← ↑ / → ↓ | Sang lựa chọn chọn được kế tiếp **và chọn nó**; vòng lại ở hai đầu; bỏ qua `disabled`, **vào** `unavailable` |
| Space | Chọn lựa chọn đang focus |

- Bàn phím và "n trên N" là **của trình duyệt** (radio native), kit chỉ tự vòng ở hai đầu (WebKit không vòng). Safari macOS:
  Tab mặc định chỉ qua ô chữ — Option+Tab tới mọi control (như mọi radio).
- Tên nhóm: `label` → `aria-label` host → `<label for="{id host}">` ngoài (bấm nhãn ngoài chỉ **focus**, không chọn). Tên mỗi
  radio = chữ của nó (không gộp dòng phụ); dòng phụ + ghi chú qua `aria-describedby`.
- Forced colors: viền `ButtonText`, chọn = `Highlight`, disabled `GrayText`; màu / ảnh swatch giữ nguyên (nội dung).

## Bảo mật

- `label`, `hint`, `unavailableLabel`, nhãn nhóm, `messages` là text (escape / `textContent`). `value` chỉ vào attribute đã
  escape và được **so sánh chuỗi** — không bao giờ ghép thành selector.
- Màu → sink `fill` của SVG chỉ qua `safeColor` (JS) / `Td::safeColor` (PHP, cùng bảng ca); URL → `<img src>` chỉ qua
  `safeMediaUrl` / `td__media_url` (luật scheme mục 4). Dữ liệu đọc lại từ markup khi nhận tại chỗ đi qua **cùng** cổng.
- Server **vẫn phải** kiểm giá trị gửi lên thuộc tập lựa chọn hợp lệ của sản phẩm (và tồn kho / giới hạn giỏ).
- `icon` (0.52.0): chỉ tên theo regex + có trong registry (JS `hasIcon`, PHP `Td::icon`); SVG luôn dựng từ registry, không
  bao giờ từ markup / dữ liệu của site.

## Cảm ứng

- Mỗi lựa chọn ≥ 44 × 44 trên cảm ứng (swatch: vùng chạm 44 quanh ô 32, không chồng nhau; segmented: mọi `size`); chuột ≥ 24.
- Hình nhấn chỉ đổi màu (`--td-color-pressed`); hover chỉ với chuột. Cuộn trang bắt đầu trên nhóm vẫn cuộn.

Chuẩn chung: [Cảm ứng](../guides/touch.md).

## Lưu ý & lỗi thường gặp

- **Không thấy lựa chọn nào** → `options` chưa gán (attribute không nhận mảng) hoặc mọi lựa chọn bị bỏ (xem cảnh báo console).
- **`value` về `''`** → giá trị không có trong `options` (đổi kiểu số / chuỗi: `128` và `'128'` là một, `'0128'` thì không).
- **Ảnh swatch không hiện** → CSP `img-src` của site chặn CDN, hoặc URL `http:` trên trang HTTPS (bị từ chối có chủ đích).
- **Form gửi được dù `required`** → mọi lựa chọn đang `disabled` ([mục 3](#3-required)).
- Không có: chọn nhiều, bỏ chọn khi đã chọn, tự ẩn lựa chọn, ma trận nhiều chiều trong một element, swatch hai màu / gradient,
  tooltip tên màu, dải cuộn ngang cho `button` / `swatch` (segmented: chỉ khi tràn), `size` cho `button` / `swatch`, thanh
  trượt animation cho `segmented`, tự ẩn nhãn khi chật (`segmented` dùng `stacked` / cuộn).
- **Segmented sửa token bằng CSS lúc chạy mà thanh không đổi bố cục** → gọi `el.relayout()` (0.53.1).

## Xem thêm

- [Number input › Stepper](number-input.md#8-stepper) · [Checkbox](checkbox.md) · [Dropdown](dropdown.md) ·
  [Chip input](chip-input.md)
- [Adapter PHP › td_choice_group](../guides/php-adapter.md#td_choice_group-0490) · [Form](../guides/forms.md) ·
  [Trợ năng](../guides/accessibility.md) · [Theming](../customization/theming.md)
