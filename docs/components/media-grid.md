[Tài liệu](../README.md) › [Components](README.md) › Media grid

# Lưới ảnh chọn được — `<td-media-grid>`

Lưới ảnh / media có **chế độ chọn**: rê chuột (hoặc focus) vào một ô thì hiện nút tick tròn; bấm tick là vào chế độ chọn,
sau đó bấm ảnh để lật chọn, Shift + bấm để chọn dải, Esc để bỏ hết. Khi chưa chọn gì, bấm ảnh là **mở** (phát
`activate` — xem ảnh, mở lightbox, mở form sửa…). Dùng cho contact sheet, thư viện ảnh trong CMS, chọn nhiều ảnh để
xoá / gắn thẻ / tải về.

Khác với các component khác, td-media-grid **không tự render ô**: site (hoặc PHP) in sẵn markup các ô theo một hợp đồng
nhỏ, element chỉ **nâng cấp tại chỗ** (thêm tick, class, ARIA, xử lý chọn). Nhờ vậy site giữ toàn quyền bố cục, ảnh,
nút ⋯, badge… và trang vẫn hiển thị ảnh khi JS chưa chạy.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/media-grid'` (class: `import { TdMediaGrid } from '@dazzxq/td-components'`) |
| Loại | Custom element (nâng cấp markup có sẵn) |
| Form-associated | không |
| Từ phiên bản | 0.23.0 (cần `td.css`) |

## Ví dụ nhanh

```html
<td-media-grid label="Ảnh của tôi">
  <div data-td-media-item data-id="p1">
    <button type="button" data-td-media-open aria-label="Ảnh biển"><img src="/img/p1.jpg" alt=""></button>
  </div>
  <div data-td-media-item data-id="p2">
    <button type="button" data-td-media-open aria-label="Ảnh núi"><img src="/img/p2.jpg" alt=""></button>
  </div>
</td-media-grid>

<script type="module">
  import '@dazzxq/td-components/media-grid';

  const grid = document.querySelector('td-media-grid');
  grid.addEventListener('activate', (e) => openViewer(e.detail.id));            // bấm ảnh khi chưa chọn gì / Enter
  grid.addEventListener('select-change', (e) => updateBar(e.detail.ids));     // người dùng đổi lựa chọn
</script>
```

## Cách dùng

### 1. Hợp đồng markup

Mỗi ô cần:

- `data-td-media-item` + `data-id` (chuỗi, **duy nhất** trong lưới; ô thiếu `data-id` không chọn được, `data-id` trùng
  thì ô đầu tiên thắng);
- đúng **một** phần tử mở `[data-td-media-open]`: `<button type="button">` hoặc `<a href>` (link xem ảnh, item lightbox…).
  Đây là điểm Tab của ô.

Element **chèn** nút tick `button.td-media-grid__tick` ngay **sau** phần tử mở (anh em, không bao giờ nằm trong `<a>`),
với `tabindex="-1"`, `aria-pressed`, `aria-label` = `"Chọn {tên}"` (tên lấy theo thứ tự: `aria-label` của phần tử mở →
`alt` của ảnh → `data-id`) và icon `check`. Site muốn tự in tick thì đặt `[data-td-media-tick]` trong ô — element giữ
nguyên nút đó, chỉ thêm class và quản lý `aria-pressed`.

Mọi thứ khác trong ô (nút ⋯ [TdMenu](menu.md), [badge](badge.md), chú thích…) element **không đụng tới**. Ô có thể nằm
lồng trong wrapper của site (dải, cột…), không bắt buộc là con trực tiếp (trừ `layout="justified"`, xem §9).

Tuỳ chọn (0.33.0): `data-td-ar` trên ô = tỉ lệ khung ảnh (`"1.5"`, `"3/2"` hoặc `"3:2"`), dùng cho `layout="justified"`.

### 2. Chế độ chọn

| Tình huống | Bấm phần tử mở | Bấm tick |
|---|---|---|
| Chưa chọn gì | `activate` (cancelable) — hành vi mặc định (link, lightbox) chạy nếu không `preventDefault()` | Chọn ô, vào chế độ chọn |
| Đang chọn (≥ 1 ô) | Lật ô; **không** `activate`, hành vi mặc định bị chặn (link / lightbox không mở) | Lật ô |
| Shift + bấm | Chọn **dải** theo thứ tự DOM từ ô neo (ô bấm gần nhất) tới ô này — chỉ thêm, neo giữ nguyên; chưa có neo → lật ô | như bên trái |

Host có `[data-selecting]` khi tập chọn khác rỗng; ô đã chọn có `[data-selected]`.

**`select-mode="tick"`** (0.33.0) — kiểu thư viện media (dcms2, `td-media-picker`): bấm phần tử mở **luôn** phát
`activate` (kể cả khi đang chọn); lựa chọn chỉ đổi qua:

| Thao tác | Tác dụng |
|---|---|
| Bấm tick | Lật ô |
| Ctrl + bấm / Cmd + bấm ảnh | Lật ô (không `activate`, hành vi mặc định bị chặn) |
| Shift + bấm ảnh | Chọn dải từ ô neo |
| Space / Shift + Space | Như mặc định |

Không có attribute (mặc định) thì giữ đúng hành vi bảng trên. Góc của tick đổi bằng token
`--td-media-grid-tick-inline: start | end` (picker đặt `end` = góc trên-phải).

### 3. Mở ảnh: `activate`

```js
grid.addEventListener('activate', (e) => {
  e.preventDefault();               // chặn hành vi mặc định của phần tử mở (link / lightbox)
  openEditModal(e.detail.id);
});
```

`activate` phát khi bấm phần tử mở lúc chưa chọn gì, và khi nhấn **Enter** trên phần tử mở (cả lúc đang chọn — Enter
không đổi lựa chọn). Không `preventDefault()` thì hành vi mặc định của phần tử mở vẫn chạy (link đi tới `href`,
`TdLightbox.bind()` mở lightbox, listener click của site chạy).

### 4. Giới hạn số ô: `max`

```html
<td-media-grid max="10">…</td-media-grid>
```

Người dùng chọn quá `max` → không thêm, phát `select-limit` và trình đọc màn hình đọc "Tối đa 10 mục". Chọn dải chỉ thêm
tới khi đủ.

### 5. Thao tác bằng code

```js
grid.select(['p1', 'p3']);          // không phát event (như setValue)
grid.selectAll();
grid.deselect('p1');
grid.toggle('p2');
grid.clear({ emit: true });         // { emit: true } → gọi onSelectChange + phát select-change
grid.selectedIds;                   // ['p2', 'p3'] — theo thứ tự DOM
```

### 6. Ô thêm / bớt động

Site append ô mới (tải thêm, phân trang) hoặc xoá ô: element tự nâng cấp ô mới (gom theo microtask) và bỏ ô đã gỡ khỏi
lựa chọn — nếu tập chọn đổi thì phát `select-change` với `removed`.
Thay toàn bộ con của host (`grid.innerHTML = …` khi phân trang) cũng được: live region được gắn lại tự động.

### 7. Sắp thứ tự ảnh (kéo thả + bàn phím) — 0.31.0

Bọc các ô trong `<td-sortable role="none">` (con **trực tiếp** của `td-media-grid`) và thêm `data-td-sort-item` vào mỗi
ô (dùng chung `data-id`):

```html
<td-media-grid label="Ảnh sản phẩm">
  <td-sortable role="none" label="Thứ tự ảnh">
    <div data-td-media-item data-td-sort-item data-id="p1">
      <button type="button" data-td-media-open aria-label="Ảnh 1"><img src="/img/p1.jpg" alt=""></button>
    </div>
    …
  </td-sortable>
</td-media-grid>
```

Không cần CSS của site: `td.css` biến sortable thành lưới với cùng `--td-media-grid-cols` / `--td-media-grid-gap`. Tay nắm
ở góc trên-cuối của ảnh (tick ở góc trên-đầu); Space trên ảnh = chọn, Space trên tay nắm = nhấc; `selectedIds` theo thứ
tự mới. Chi tiết: [Sortable › Lưới ảnh](sortable.md#7-lưới-ảnh-với-media-grid-công-thức).

### 8. Contact sheet kiểu 135: lightbox + menu ⋯ + PHP

PHP in markup đúng hợp đồng (escape mọi giá trị):

```php
<td-media-grid label="<?= h('Khung hình cuộn ' . $roll['num']) ?>" data-td-lightbox-group>
<?php foreach ($frames as $f): ?>
  <div data-td-media-item data-id="<?= h($f['ulid']) ?>">
    <a href="<?= h($f['href']) ?>" data-td-media-open data-td-lightbox-item
       data-td-lightbox-caption="<?= h($f['caption']) ?>" aria-label="<?= h('Khung ' . $f['num']) ?>">
      <img src="<?= h($f['src']) ?>" width="<?= (int) $f['w'] ?>" height="<?= (int) $f['h'] ?>" alt="" loading="lazy">
    </a>
    <button type="button" class="site-frame-menu" data-frame-menu aria-label="<?= h('Thao tác khung ' . $f['num']) ?>">
      <?= td_icon('more') ?>
    </button>
  </div>
<?php endforeach; ?>
</td-media-grid>
<p data-sel-bar hidden><span data-sel-count></span> <button type="button" data-sel-clear>Bỏ chọn</button></p>
```

JS của site:

```js
import '@dazzxq/td-components/media-grid';
import { TdLightbox, TdMenu } from '@dazzxq/td-components';

const grid = document.querySelector('td-media-grid');
TdLightbox.bind(document);                     // chỉ mở khi chưa chọn gì (đang chọn, td-media-grid chặn click)

grid.querySelectorAll('[data-frame-menu]').forEach((btn) => {
  const item = btn.closest('[data-td-media-item]');
  TdMenu.bind(btn, [
    { label: 'Đặt làm bìa', icon: 'star', onClick: () => setCover(item.dataset.id) },
    { label: 'Xoá khung', icon: 'trash', danger: true, onClick: () => removeFrame(item.dataset.id) },
  ], { label: 'Thao tác khung' });
});

const bar = document.querySelector('[data-sel-bar]');
grid.addEventListener('select-change', (e) => {
  bar.hidden = e.detail.ids.length === 0;
  bar.querySelector('[data-sel-count]').textContent = `Đã chọn ${e.detail.ids.length}`;
});
bar.querySelector('[data-sel-clear]').addEventListener('click', () => grid.clear({ emit: true }));
```

Nút ⋯ nằm trong ô nhưng ngoài phần tử mở nên td-media-grid bỏ qua click / phím của nó: menu mở bình thường cả khi đang
chọn, Esc đóng menu trước (không bỏ lựa chọn).

### 9. Lưới justified — `layout="justified"` (0.33.0)

Kiểu album Google Photos / `photos.aetv.vn`: mỗi dòng **lấp đủ ngang**, các ảnh trong một dòng **cao bằng nhau**, mỗi ảnh
giữ đúng tỉ lệ (không cắt, trừ ảnh bị kẹp tỉ lệ). Là tuỳ chọn; mặc định vẫn là lưới ô đều.

Chiều cao mỗi ô lấy từ `aspect-ratio` của chính nó, **không** kéo giãn theo dòng (`align-items: flex-start`): WebKit
26.x giữ nguyên chiều cao cũ của một dòng flex có ô `stretch` khi bề rộng / tỉ lệ đổi. Vì ô cuối của dòng đầy hẹp
hơn 0.5px (để dòng không bao giờ tràn), nó thấp hơn các ô khác 0.5px / tỉ lệ của nó: dưới 1px với ảnh từ 1:2 trở lên,
tối đa 2.5px ở mức kẹp 1:5.

```html
<td-media-grid label="Album" layout="justified">
  <div data-td-media-item data-id="p1">
    <button type="button" data-td-media-open aria-label="Ảnh 1"><img src="/img/p1.jpg" width="1200" height="800" alt=""></button>
  </div>
  <div data-td-media-item data-id="p2" data-td-ar="2/3">
    <button type="button" data-td-media-open aria-label="Ảnh 2"><img src="/img/p2.jpg" alt=""></button>
  </div>
  …
</td-media-grid>
```

- **Tỉ lệ mỗi ảnh**, theo thứ tự ưu tiên: `data-td-ar` của ô → `width` / `height` của `<img>` → kích thước thật sau khi ảnh
  tải xong → tạm dùng `--td-media-grid-fallback-ar` (1.5) rồi xếp lại khi ảnh tải xong. **In sẵn `width` / `height`
  (hoặc `data-td-ar`) từ server** để xếp đúng ngay lần đầu, không giật. Tỉ lệ bị kẹp trong [0.2, 5].
- **Vùng bấm của tick** (0.34.0): hình tick nhỏ, vùng bấm ≥ 24px với chuột và ≥ 44px trên máy cảm ứng.
- **Xếp dòng** (thuật toán `pack_rows` của dwp): thêm ảnh vào dòng tới khi tổng tỉ lệ Σ gần `--td-media-grid-row-ratio`
  nhất — theo **bề rộng của chính lưới** (container query, 0.34.0): ≥ 1024px `--td-media-grid-row-ratio` (5.5), 720–1023px `--td-media-grid-row-ratio-md` (4), < 720px `--td-media-grid-row-ratio-sm` (2.5). Trước 0.34.0 theo bề rộng màn hình (≤ 1024 / ≤ 640). Không giới hạn số ảnh / dòng.
- **Dòng cuối thiếu** (Σ < đích) căn trái, để trống bên phải, và **không bao giờ dời ảnh** sang dòng khác. Chiều cao:
  - **vừa** (Σ của nó ≤ Σ dòng trên **và** số ảnh ≤ số ảnh dòng trên, tức ở chiều cao dòng trên nó lọt container ở mọi bề
    rộng) → cao **bằng đúng** dòng trên;
  - **không vừa** → chỉ đảm bảo không tràn (bề rộng dòng ≤ container, mẫu số = Σ đích như dwp). Chiều cao có thể khác dòng
    trên (thường thấp hơn).
- **Bề rộng là phần trăm**: resize trong cùng một nấc không phải xếp lại; qua nấc (Σ đổi), thêm / bớt / đổi thứ tự ô,
  đổi `data-td-ar` hoặc ảnh tải xong thì xếp lại trong một `requestAnimationFrame` (một pha đọc, một pha ghi).
- **Vùng chứa dòng** phải là chính `td-media-grid` (ô là con trực tiếp) hoặc **một** `<td-sortable>` con trực tiếp (§7).
  Bố cục khác (wrapper tuỳ ý, nhiều dải): `console.warn` một lần và dùng bố cục mặc định (host `[data-td-layout="default"]`).
- Trước khi JS chạy, CSS dự phòng xếp `flex` với ô `3/2`: không vỡ, chỉ chưa justified.
- Bỏ attribute `layout` (hoặc gỡ lưới khỏi DOM) thì mọi biến dòng bị xoá.

Kéo thả sắp xếp dùng y như §7: bọc ô trong `<td-sortable role="none">`, các dòng được xếp lại theo thứ tự mới.

### 10. Kích thước ô: kit sở hữu ảnh (0.33.0)

**Ảnh (`<img>`, `<video>`, `<picture> img` đầu tiên) trong phần tử mở luôn lấp đầy ô.** Grid đặt bằng CSSOM inline
`!important`: ảnh `width / height: 100%`, `max-width: none`, `object-fit: var(--td-media-grid-fit)`; phần tử mở
`width: 100%` + `aspect-ratio: var(--td-media-grid-ratio)` (justified: theo dòng). Vì vậy CSS của site đặt lên `img`
(kể cả không layer, kể cả `!important`) **không có tác dụng** — muốn khác thì **đổi token**:

```css
.my-library td-media-grid {
  --td-media-grid-ratio: 3 / 2;     /* ô 3:2 (mặc định auto = cao theo ảnh) */
  --td-media-grid-fit: contain;     /* thấy trọn ảnh (mặc định cover) */
}
```

Giá trị inline gốc của site trên ảnh / phần tử mở được chụp lại ở lần ghi đầu và **trả lại đúng** (cả `!important`) khi
ô bị gỡ khỏi lưới hoặc lưới bị gỡ khỏi DOM. Inline style khác của site không bị đụng tới.

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `label` | string | — | Tên của danh sách (thành `aria-label` của host). Đổi tại chỗ. |
| `max` | số nguyên ≥ 1 | — (không giới hạn) | Số ô tối đa người dùng chọn được. Giá trị khác → không giới hạn. |
| `disabled` | boolean | — | Người dùng không chọn / lật được (tick bị `disabled`); `activate` vẫn chạy; lựa chọn hiện có giữ nguyên (Esc cũng không bỏ). |
| `select-mode` | `tick` | — | 0.33.0. Bấm ảnh luôn `activate`; chọn qua tick / Space / Ctrl·Cmd + bấm / Shift (§2). |
| `layout` | `justified` | — | 0.33.0. Lưới justified (§9). Đổi tại chỗ, xếp lại trong frame kế tiếp. |

Đổi attribute **không** render lại: con của host (ảnh, nút của site) giữ nguyên node.

## Property & method

| Thành viên | Kiểu / chữ ký | Mô tả |
|---|---|---|
| `selectedIds` | `string[]` (chỉ đọc) | Id đang chọn, theo thứ tự DOM. |
| `items` | `HTMLElement[]` (chỉ đọc) | Các ô hợp lệ (có `data-id`, không trùng), theo thứ tự DOM. |
| `select(ids, { emit }?)` | `(string \| string[], { emit?: boolean }) => void` | Thêm id vào lựa chọn (id không có trong lưới bị bỏ qua; tôn trọng `max`). |
| `deselect(ids, { emit }?)` | như trên | Bỏ id khỏi lựa chọn. |
| `toggle(id, { emit }?)` | `(string, { emit?: boolean }) => void` | Lật một id. |
| `selectAll({ emit }?)` | | Chọn mọi ô (tới `max`). |
| `clear({ emit }?)` | | Bỏ hết. |
| `onSelectChange` | `(ids: string[]) => void` | Hook gọi **trước** `select-change`. Ném lỗi → `console.error`, event vẫn phát. |
| `TdMediaGrid.labels` | `{ select, count, limit }` | Chữ cho trình đọc màn hình: `'Chọn {name}'`, `'Đã chọn {n}'`, `'Tối đa {max} mục'`. Dịch: `TdMediaGrid.labels.count = 'Selected {n}'`. Đặt trước khi lưới nâng cấp (nhãn tick được ghi lúc nâng cấp). |

Method lập trình **không** phát event (giống `setValue`) trừ khi truyền `{ emit: true }`.

## Event

| Event | detail | Khi nào | bubbles? |
|---|---|---|---|
| `select-change` | `{ ids, added, removed }` | Người dùng đổi lựa chọn (tick, bấm ảnh khi đang chọn, Shift, Space, Esc), ô đã chọn bị gỡ khỏi DOM, hoặc method có `{ emit: true }`. `ids` theo thứ tự DOM. | có (composed) |
| `activate` | `{ id, item, event }` | Bấm phần tử mở khi chưa chọn gì (hoặc khi `disabled`; với `select-mode="tick"`: mọi lần bấm không kèm Ctrl / Cmd / Shift), hoặc Enter trên phần tử mở. **Cancelable**: `preventDefault()` chặn hành vi mặc định của phần tử mở. `event` là click / keydown gốc. | có (composed) |
| `select-limit` | `{ max }` | Người dùng thêm vượt `max`. | có (composed) |

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-media-grid-cols` | `repeat(auto-fill, minmax(160px, 1fr))` | `grid-template-columns` của lưới |
| `--td-media-grid-gap` | `var(--td-space-xs)` | Khoảng cách ô |
| `--td-media-grid-radius` | `var(--td-radius-md)` | Bo góc ô / ảnh |
| `--td-media-grid-tick-size` | `24px` | Đường kính tick (vùng bấm ≥ 44px trên cảm ứng) |
| `--td-media-grid-tick-inset` | `6px` | Khoảng cách tick tới góc trên của ô |
| `--td-media-grid-tick-inline` | `start` | 0.33.0. Góc của tick: `start` (trên-đầu) \| `end` (trên-cuối). Đọc mỗi frame đo (host `[data-td-tick="end"]`) |
| `--td-media-grid-tick-bg` | `rgb(0 0 0 / 35%)` | Nền tick chưa chọn |
| `--td-media-grid-tick-border` | `#fff` | Viền tick (và màu dấu check khi rê chuột lên tick) |
| `--td-media-grid-tick-ring` | `rgb(0 0 0 / 50%)` | Vòng tối mảnh ngoài viền (để tick nổi trên ảnh sáng) |
| `--td-media-grid-tick-on-bg` | `var(--td-btn-primary-bg)` | Nền tick đã chọn (dark tự đảo theo primary) |
| `--td-media-grid-tick-on-fg` | `var(--td-btn-primary-fg)` | Dấu check của tick đã chọn |
| `--td-media-grid-selected-ring` | `var(--td-media-grid-tick-on-bg)` | 0.33.0. Màu vòng inset 3px của ô đã chọn (vẽ trên phần tử mở, trùng khung ảnh) |
| `--td-media-grid-selected-scale` | **`1`** (trước 0.33: `0.88`) | Tỉ lệ thu ảnh của ô đã chọn. Muốn hiệu ứng thu nhỏ kiểu cũ: `0.88` |
| `--td-media-grid-fit` | `cover` | 0.33.0. `object-fit` của ảnh trong ô (`cover` \| `contain`) |
| `--td-media-grid-ratio` | `auto` | 0.33.0. Tỉ lệ khung ô ở bố cục mặc định (`auto` = cao theo ảnh; vd `3 / 2`, `1`) |
| `--td-media-grid-row-ratio` | `5.5` | 0.33.0, justified. Σ tỉ lệ đích mỗi dòng khi **lưới** rộng ≥ 1024px (lớn hơn = nhiều ảnh / dòng, dòng thấp hơn) |
| `--td-media-grid-row-ratio-md` / `-sm` | `4` / `2.5` | 0.34.0. Σ khi lưới rộng 720–1023px / < 720px (container query; trước đó là cùng token theo màn hình) |
| `--td-media-grid-fallback-ar` | `1.5` | 0.33.0, justified. Tỉ lệ tạm của ảnh chưa biết kích thước |

0.33.0: bỏ nền ô đã chọn (`--td-media-grid-selected-bg` không còn tác dụng) và phép thu 0.88; ô đã chọn = vòng inset +
tick đặc, nên khe giữa các ô luôn đều.

```css
:root { --td-media-grid-cols: repeat(auto-fill, minmax(120px, 1fr)); }
.roll td-media-grid { display: block; }   /* site tự bố cục (dải film…): bỏ grid của kit */
```

Tick ẩn khi nghỉ; hiện khi rê chuột (chuột thật: `hover: hover` + `pointer: fine`), khi ô có focus bên trong, khi đang
chọn và trên ô đã chọn. Màn cảm ứng (`hover: none` hoặc `pointer: coarse`) luôn hiện tick mờ (0.55). Không glass (lớp nội
dung). Tương phản đã kiểm trong gate (sáng + tối): viền tick ≥ 3:1 trên ảnh trắng và ảnh đen, dấu check ≥ 3.2:1 trên nền
tick đã chọn.

## Cấu trúc DOM & class

```html
<td-media-grid label="Khung hình cuộn 12" class="td-media-grid" role="list" aria-label="Khung hình cuộn 12" data-selecting>
  <div data-td-media-item data-id="f1" class="td-media-grid__item" role="listitem" data-selected>
    <button type="button" data-td-media-open aria-label="Khung 1" class="td-media-grid__open"><img src="…" alt=""></button>
    <button type="button" class="td-media-grid__tick" tabindex="-1" aria-pressed="true" aria-label="Chọn Khung 1">
      <svg class="td-icon td-icon--s" data-icon="check" …></svg>
    </button>
    <!-- nút ⋯, badge… của site -->
  </div>
  …
  <span class="td-sr-only" aria-live="polite">Đã chọn 1</span>
</td-media-grid>
```

- Phần do JS thêm: class / `role` / `aria-label` trên host, class / `role` trên ô, class trên phần tử mở, nút tick, live
  region cuối host. Trạng thái: `[data-selecting]` (host), `[data-selected]` (ô), `aria-pressed` (tick).
- 0.33.0, CSSOM (không phải attribute `style` trong markup): phần tử mở `width` / `height` / `aspect-ratio`, ảnh
  `width` / `height` / `max-width` / `object-fit` (inline `!important`); justified: `--td-mg-w` / `--td-mg-sub` /
  `--td-mg-k` trên từng ô. Host `[data-td-layout="justified" | "default"]` khi có `layout`, `[data-td-tick="end"]`.
- Fixture `test/contracts/media-grid.html` trong repo kit (chỉ dùng cho test, không nằm trong gói npm).

## Bàn phím & trợ năng

| Phím (focus trên phần tử mở) | Tác dụng |
|---|---|
| Tab | Đi qua các phần tử mở (tick có `tabindex="-1"` — không thêm hàng trăm điểm Tab) và control khác của site |
| Space | Lật ô (chặn cuộn trang). Shift + Space: chọn dải từ ô neo |
| Enter | Luôn `activate` (kể cả khi đang chọn); không đổi lựa chọn |
| Esc | Bỏ hết lựa chọn, giữ focus — trừ khi có lớp nổi đang mở (modal, lightbox, menu, dropdown…; Esc đóng lớp đó trước), Esc đã bị listener khác `preventDefault()`, lưới `disabled`, hoặc đang gõ IME |

- Phím chỉ được xử lý khi focus nằm trên phần tử mở; nút ⋯ / link khác trong ô tự xử lý phím của nó.
- Host `role="list"`, ô `role="listitem"`; tick là nút bật/tắt (`aria-pressed`). Một live region `polite` đọc "Đã chọn
  {n}" một lần cho mỗi thao tác (chọn dải không đọc từng ô).
- `prefers-reduced-motion`: không chạy hiệu ứng (thu nhỏ, vòng chọn). Forced colors: tick viền `ButtonText`, ô đã chọn
  viền `Highlight` (trên phần tử mở), tick đã chọn nền `Highlight`.
- Focus ring vẽ trên phần tử mở, và phần tử mở rộng đúng bằng ảnh. Layout justified không đổi thứ tự DOM, nên thứ tự Tab
  vẫn là thứ tự đọc.

## Bảo mật

Markup do site in — site phải escape (PHP: `h()`), như mọi HTML server. Element không chèn HTML: tick tạo bằng
`createElement`, icon từ registry, tên tick lấy từ `aria-label` / `alt` / `data-id` và gán bằng `setAttribute` (luôn là
chữ). `data-id` chỉ dùng như chuỗi so sánh, không đi vào selector hay markup. `data-td-ar` chỉ được parse thành số
(regex chặt, sai → bỏ qua). CSP strict: class / data attribute + CSSOM `style.setProperty` (không bị
`style-src-attr` chặn), không `style="…"`, không `<style>`.

## Lưu ý & lỗi thường gặp

- **Quên `data-id`** hoặc `data-id` trùng: ô không chọn được (ô trùng sau bị bỏ qua). `data-id` nên cố định; nếu site
  đổi `data-id` của một ô, id cũ bị bỏ khỏi lựa chọn (`select-change` với `removed`).
- **Tick nằm sai chỗ**: tick định vị `absolute` theo ô (`.td-media-grid__item` là `position: relative`); nếu site bọc
  phần tử mở trong wrapper có `position`, tick bám theo wrapper đó.
- **Click khi đang chọn**: td-media-grid bắt click trên phần tử mở / tick ở pha **capture** trên host rồi
  `preventDefault()` + `stopPropagation()`, nên listener click thường (bubble) của site, `TdLightbox.bind()` hay link đều
  không chạy. Ngoại lệ: listener **capture** gắn trên ancestor (`addEventListener('click', h, true)` trên `document`)
  chạy trước — tránh dùng kiểu đó cho phần tử mở, hoặc tự kiểm `grid.selectedIds.length`.
- **Bố cục riêng** (dải film, masonry): đặt `display` của site cho host; token `--td-media-grid-cols` chỉ áp khi host là
  grid. Lưới ảnh co giãn theo dòng: dùng `layout="justified"` thay vì tự tính.
- **CSS trên `img` không ăn** (0.33.0): đúng thiết kế — ảnh luôn lấp ô. Đổi `--td-media-grid-fit` / `--td-media-grid-ratio`
  (§10). Site cũ đặt `width: 160px; height: 107px` cho ảnh thì bỏ đi, kích thước ô do `--td-media-grid-cols` quyết định.
- **Justified mà ô không đều / cảnh báo "needs the items as direct children"**: ô phải là con trực tiếp của grid hoặc của
  một `<td-sortable>` con trực tiếp (§9).
- Đổi `TdMediaGrid.labels.select` sau khi lưới đã nâng cấp không đổi nhãn tick đã có.

## Xem thêm

- [Lightbox](lightbox.md) · [Menu](menu.md) · [Badge](badge.md) · [Icons](icons.md) · [Sortable](sortable.md)
- [Adapter PHP](../guides/php-adapter.md) · [Theming](../customization/theming.md) · [Hooks](../customization/hooks.md)
- [Trợ năng](../guides/accessibility.md) · [CSP](../guides/csp.md)
