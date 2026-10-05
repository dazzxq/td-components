[Tài liệu](../README.md) › [Components](README.md) › Filter chips

# Chip bộ lọc đang áp dụng — `<td-filter-chips>`

Hàng chip "**Trạng thái:** Đang bán ×" cho các bộ lọc đang áp dụng của một danh sách: bỏ từng bộ lọc bằng ×, "Xoá tất
cả" khi có từ hai chip bỏ được, chip cố định (không ×), chip là **link** cho trang PHP / không JS. Hẹp (dưới 480px) thì
thành **một hàng cuộn ngang**. Dùng cùng thanh lọc của bạn và [`<td-table>`](table.md#11-bộ-lọc-ngoài--url-request-change-controlled--từ-0390).
Kit **không** dựng thanh lọc, không đọc / ghi URL: chip chỉ hiện + phát event.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/filter-chips'` (class: `import { TdFilterChips } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | không |
| PHP | `td_filter_chips(array $items, array $o = [])` — markup có sẵn lúc tải, × là link chạy không cần JS |
| Từ phiên bản | 0.39.0 (cần `td.css`) |

## Ví dụ nhanh

```html
<input id="q" aria-label="Tìm đơn">
<td-filter-chips id="chips" empty-focus="q"></td-filter-chips>

<script type="module">
  import '@dazzxq/td-components/filter-chips';

  const chips = document.querySelector('#chips');
  chips.items = [
    { key: 'shop', label: 'Kho', value: 'Hà Nội', removable: false },  // bộ lọc bắt buộc: không có ×
    { key: 'status', label: 'Trạng thái', value: 'Đang bán' },
    { id: 'tag-1', key: 'tag', label: 'Nhãn', value: 'Mới' },         // nhiều giá trị = nhiều item cùng key
    { id: 'tag-2', key: 'tag', label: 'Nhãn', value: 'Cũ' },
  ];
  chips.addEventListener('filter-remove', (e) => {
    console.log(e.detail.item);   // { id: 'tag-2', key: 'tag', label: 'Nhãn', value: 'Cũ', removable: true }
    console.log(e.detail.items);  // danh sách SAU khi bỏ
  });
</script>
```

## Cách dùng

### 1. Item

| Khoá | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `key` | string \| number | — (bắt buộc) | Tên bộ lọc (của app). Số → chuỗi. |
| `value` | string \| number | — (bắt buộc) | Giá trị hiển thị (chữ, đã định dạng: "Đang bán", "01/10 – 05/10"). **Mảng bị từ chối**: bộ lọc nhiều giá trị = một item mỗi giá trị, cùng `key`, khác `id`. |
| `label` | string \| number | `key` | Nhãn in đậm trước dấu ":". |
| `id` | string \| number | `key` | Danh tính chip (bỏ đúng chip). Trùng → thêm hậu tố `-2`, `-3`… + một cảnh báo. |
| `removable` | boolean | `true` | `false` → chip không có × (bộ lọc bắt buộc, ví dụ "Kho: HN"). |
| `href` | string | — | × là **link** tới URL **không còn** bộ lọc này (server tính). Chỉ **cùng origin** với trang: đường dẫn tương đối, `?query`, `#hash` (hoặc URL tuyệt đối cùng origin — chỉ JS); không `//host`, không `\`, không scheme khác `http(s)://`; khác (origin khác, `javascript:`, `data:`, `mailto:`…) → bỏ qua (× là nút). Không có tuỳ chọn cho link sang origin khác. |

- Mọi chuỗi là **chữ** (gán `textContent` — không có HTML), ký tự điều khiển bị bỏ, cắt ở 200 ký tự (`key` / `id` /
  `label`) / 500 (`value`). Item sai kiểu (object, boolean, mảng…) bị bỏ + một cảnh báo.
- Tối đa **200** chip và **800** mục được xét (hợp lệ hay không — mục sau đó không bao giờ được đọc, kể cả mảng thưa rất dài);
  vượt một trong hai → phần thừa bị bỏ + một cảnh báo. Giới hạn cứng, như PHP.
- Đọc lại `chips.items` → bản đã chuẩn hoá (bản sao): `{ id, key, label, value, removable, href? }`.
- Gán `items` **im lặng** (không event). Gán trước khi phần tử được define / gắn vào trang vẫn được.

### 2. Bỏ chip (uncontrolled mặc định)

- Bấm × (chuột, Enter, Space) → event **`filter-remove`** `{ item, items }` (`items` = danh sách **sau** khi bỏ), **có
  thể huỷ**. Không bị `preventDefault()` → kit bỏ chip khỏi `items` của nó; bị huỷ → chip ở lại.
- "**Xoá tất cả**" (chỉ hiện khi có **≥ 2** chip bỏ được) → **`filter-clear`** `{ items, removed }` (`items` = các chip
  **giữ lại** — chip không bỏ được; `removed` = các chip bị bỏ), có thể huỷ.
- **Controlled**: luôn `e.preventDefault()` rồi tự gán `items` mới (sau khi server / form xác nhận).
- **Focus sau khi bỏ** (người dùng không bao giờ bị rơi về `<body>`): nút × của chip **kế tiếp** → chip **trước** → "Xoá
  tất cả" → phần tử `empty-focus` (id, ví dụ ô tìm của thanh lọc) → chính host (`tabindex="-1"`).
- Thông báo cho trình đọc màn hình (`role="status"`): "Đã bỏ lọc {label}: {value}" / "Đã xoá tất cả bộ lọc".
- Hết chip → host có `hidden` (không chiếm chỗ) trừ khi đang giữ focus (ẩn khi focus rời đi).

### 3. Nối với bảng

```js
const table = document.querySelector('#orders');   // <td-table server-mode controlled>
const form = document.querySelector('#filters');

function chipsFrom(f) {
  const out = [];
  if (f.q) out.push({ key: 'q', label: 'Tìm', value: f.q });
  if (f.status) out.push({ key: 'status', label: 'Trạng thái', value: STATUS_LABEL[f.status] });
  for (const t of f.tags || []) out.push({ id: `tag-${t}`, key: 'tag', label: 'Nhãn', value: TAG_LABEL[t] });
  return out;
}

table.addEventListener('request-change', (e) => { chips.items = chipsFrom(e.detail.state.filters); });
chips.addEventListener('filter-remove', (e) => {
  const { key, id } = e.detail.item;
  clearFormField(form, key, id);          // bỏ giá trị trong form của bạn
  table.setFilters(readForm(form));       // → request-change reason 'filters'
});
chips.addEventListener('filter-clear', () => {
  form.reset();
  table.setFilters(readForm(form));
});
```

Công thức URL đầy đủ (`history`, `popstate`, `AbortController`, `requestId`): [table.md mục 11](table.md#11-bộ-lọc-ngoài--url-request-change-controlled--từ-0390).

### 4. Link (PHP / không JS)

Item có `href` → × là `<a href>`: JS vẫn phát `filter-remove` (có thể huỷ); không bị huỷ → **trình duyệt mở link** (kit
không tự bỏ chip — trang mới do server tính). Một cơ chế cho cả có JS lẫn không JS. Thuộc tính `clear-href` làm "Xoá tất
cả" thành link (cùng chính sách URL). Bị từ chối → nút (chỉ chạy khi có JS).

```php
<?php
$base = $_GET;
$without = static function (string $key) use ($base): string {
    $q = $base;
    unset($q[$key], $q['page']);
    return '?' . http_build_query($q);
};
echo td_filter_chips([
    ['key' => 'shop', 'label' => 'Kho', 'value' => 'Hà Nội', 'removable' => false],
    ['key' => 'status', 'label' => 'Trạng thái', 'value' => 'Đang bán', 'href' => $without('status')],
    ['key' => 'q', 'label' => 'Tìm', 'value' => (string) ($_GET['q'] ?? ''), 'href' => $without('q')],
], ['clear_href' => '?', 'empty_focus' => 'search-q']);
```

Nạp `@dazzxq/td-components/filter-chips` → markup được nhận **tại chỗ** (cùng node, không nháy). Chưa có JS: link × chạy
được; nút × / "Xoá tất cả" dạng nút (không `href`) **vô hình** (giữ chỗ, không bấm / Tab tới được — không có nút chết).

### 5. Hẹp: một hàng cuộn

Host là container (`container: td-filter-chips / inline-size`) — nó lấy bề rộng từ phần tử cha (đặt trong flex row thì
cho nó `flex: 1` / `width`). **≥ 480px**: chip xuống dòng tự nhiên. **< 480px**: **một hàng** cuộn ngang (snap, ẩn thanh
cuộn, mép mờ khi còn chip bị khuất), "Xoá tất cả" **ghim cuối** ngoài vùng cuộn. Mỗi chip một dòng; giá trị dài cắt `…` ở
16rem, đầy đủ trong `title`. Trình duyệt chưa có container query: rơi về `@media (max-width: 479.98px)` (ADR 0014).

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `label` | string | `TdFilterChips.labels.group` ("Bộ lọc đang áp dụng") | Tên nhóm (`role="group"`). |
| `clear-href` | URL | — | "Xoá tất cả" là link tới URL này (chính sách URL như `href` của item). |
| `empty-focus` | id | — | Phần tử nhận focus khi bỏ chip bỏ-được cuối cùng (ô tìm…). |

## Property & method

| Thành viên | Kiểu | Mô tả |
|---|---|---|
| `items` | `Array<Item>` | Xem mục 1. Gán = thay toàn bộ, im lặng. Đọc = bản chuẩn hoá (bản sao). |
| `TdFilterChips.labels` | static object | `group`, `clearAll` ("Xoá tất cả"), `remove` ("Bỏ lọc {label}: {value}" — tên nút ×), `removed` ("Đã bỏ lọc {label}: {value}"), `cleared` ("Đã xoá tất cả bộ lọc"). Đổi trước khi render. |

## Event

| Event | detail | Huỷ được | Khi nào |
|---|---|---|---|
| `filter-remove` | `{ item, items }` | có | Người dùng bấm × (chuột / Enter / Space). Không huỷ → chip bị bỏ (nút) hoặc trình duyệt mở link (`href`). |
| `filter-clear` | `{ items, removed }` | có | Người dùng bấm "Xoá tất cả". |

Cả hai `bubbles` + `composed`. Gán `items` không phát event.

## Tuỳ biến giao diện

| Token | Mặc định | |
|---|---|---|
| `--td-filter-chip-bg` | `var(--td-color-fill)` (gray-100; dark `#2c2c30`) | Nền chip |
| `--td-filter-chip-fg` / `--td-filter-chip-label-fg` | `--td-color-text` | Chữ giá trị / nhãn (đậm) |
| `--td-filter-chip-border` | `--td-color-border` | Viền chip |
| `--td-filter-chip-radius` | `--td-radius-full` | Bo góc |
| `--td-filter-chip-h` | `28px` | Chiều cao tối thiểu |
| `--td-filter-chip-gap` | `--td-space-xs` (cảm ứng `--td-space-sm`) | Khoảng giữa chip |
| `--td-filter-chip-max` | `16rem` | Bề rộng tối đa của giá trị (cắt `…`) |
| `--td-filter-chip-remove-fg` | `var(--td-color-text-label)` (gray-700; dark: muted) | Icon × (≥ 4.7:1 trên nền chip) |
| `--td-filter-chip-remove-hover` | `--td-color-hover-strong` | Nền × khi hover (chuột); nhấn = `--td-color-pressed` |

## Cấu trúc DOM & class

```html
<td-filter-chips [label] [clear-href] [empty-focus] [hidden]>
  <div class="td-filter-chips" role="group" aria-label="Bộ lọc đang áp dụng">
    <ul class="td-filter-chips__list" role="list" [data-scroll-start] [data-scroll-end]>
      <li class="td-filter-chips__item" data-id="status" data-key="status" data-removable="true|false">
        <span class="td-filter-chips__label">Trạng thái</span><span class="td-filter-chips__sep" aria-hidden="true">: </span><span class="td-filter-chips__value" title="Đang bán">Đang bán</span>
        <!-- item có href an toàn → <a class="td-filter-chips__remove" href="…" aria-label="…">; không removable → không có × -->
        <button type="button" class="td-filter-chips__remove" data-td-js-only aria-label="Bỏ lọc Trạng thái: Đang bán">
          <span class="td-filter-chips__icon" data-td-icon="close" data-td-icon-size="14" aria-hidden="true"><svg…></span>
        </button>
      </li>
    </ul>
    <!-- ≥ 2 chip bỏ được; clear-href an toàn → <a class="… td-filter-chips__clear" href> -->
    <button type="button" class="td-btn td-btn--ghost td-btn--sm td-filter-chips__clear" data-td-js-only>Xoá tất cả</button>
  </div>
  <p class="td-sr-only" role="status"></p>
</td-filter-chips>
```

PHP in **đúng** cây này (hợp đồng SSR `filter-chips@1`, dấu `data-td-ssr` trên host; JS thêm `title` cho giá trị). Mỗi
trường nằm ở **nút riêng** (`data-id`, `data-key`, `data-removable`, chữ của `__label` / `__value`, `href`) — hydrate đọc
lại từng trường, không bao giờ tách chữ "nhãn: giá trị". Markup lệch bất kỳ chỗ nào (thuộc tính lạ, phần tử thừa,
`aria-label` không khớp, `href` không an toàn, thiếu / thừa "Xoá tất cả") → **không nhận**: render rỗng + một cảnh báo
(an toàn hơn đoán); `items` gán sớm luôn thắng markup.

## Bàn phím & trợ năng

- Danh sách là `ul[role=list]` trong `role="group"` có tên; chip đọc "Trạng thái: Đang bán" (dấu ":" là chữ hiển thị
  `aria-hidden`, nhãn và giá trị liền nhau).
- Mỗi × là một `button` / `a` có tên "Bỏ lọc {label}: {value}" (Tab tới; Enter / Space với nút, Enter với link). Sau khi
  bỏ, focus chuyển như mục 2 và vùng `role="status"` đọc kết quả.
- Hàng cuộn hẹp: Tab tới chip bị khuất → trình duyệt cuộn nó vào (có `scroll-padding`).
- Cảm ứng: × có vùng chạm 44 × 44 (chuột ≥ 24); forced colors: viền chip `CanvasText`.

## Bảo mật

- Nhãn / giá trị / id / key luôn là **chữ** (DOM API, `textContent`, `setAttribute`) — không có cửa HTML. Chuỗi
  `<img onerror>` hiện nguyên văn.
- `href` / `clear-href`: link "bỏ lọc" **không bao giờ rời site** — JS giải URL theo `document.baseURI` và chỉ nhận
  http(s) **cùng origin** với trang (tương đối, `?query`, `#hash`, hoặc URL tuyệt đối cùng origin); `//host`
  (protocol-relative), dấu `\`, `https:host` (thiếu `//`), origin khác, `javascript:` (kể cả `java\tscript:`),
  `data:`, `blob:`, `mailto:`, `tel:` → không phải link. PHP không biết origin của trang nên **chỉ nhận URL tương đối**
  (không scheme, không `//`, không `\`). Không có opt-in cho link sang origin khác.
- Khối lượng xử lý có trần: tối đa 200 chip và 800 mục được xét (duyệt theo chỉ số, không đi hết mảng thưa), chuỗi thô
  cắt ở 4 × giới hạn trước khi xử lý, id trùng đánh số theo bộ đếm (không bậc hai).
- Giá trị chip thường lấy từ URL (người dùng sửa được) — chip chỉ hiển thị; server vẫn phải kiểm từng tham số lọc.

## Cảm ứng

× có hình nhấn (`--td-color-pressed`, chỉ đổi màu) và vùng chạm 44px; hover chỉ trên con trỏ mịn. Hàng cuộn hẹp cuộn
ngang bình thường (không chặn cuộn trang). Chuẩn chung: [Cảm ứng](../guides/touch.md).

## Lưu ý & lỗi thường gặp

- **Host co về 0** trong flex row / grid `auto`: container cần bề rộng từ cha — cho nó `flex: 1 1 auto` / `width: 100%`.
- Chip "Nhãn: Mới" và "Nhãn: Cũ" cùng `key` → **phải** khác `id` (không thì thành `tag`, `tag-2`: vẫn chạy nhưng có cảnh
  báo và id không ổn định khi thứ tự đổi).
- Muốn ẩn hẳn khi không có bộ lọc: kit đã đặt `hidden` khi rỗng; đừng tự gỡ `hidden` khi `items` rỗng.

## Xem thêm

- [Table — Bộ lọc ngoài + URL](table.md#11-bộ-lọc-ngoài--url-request-change-controlled--từ-0390)
- [PHP adapter — `td_filter_chips`](../guides/php-adapter.md#td_filter_chips-0390)
- [Chip input](chip-input.md) (nhập nhiều giá trị trong form — khác: đó là control form)
