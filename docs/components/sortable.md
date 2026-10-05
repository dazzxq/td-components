[Tài liệu](../README.md) › [Components](README.md) › Sortable

# Sắp xếp kéo thả — `<td-sortable>`

Sắp lại thứ tự một danh sách / lưới do app in sẵn: **kéo tay nắm** bằng chuột / ngón tay / bút, hoặc **bàn phím** (Space
/ Enter nhấc, mũi tên di chuyển, Space / Enter thả, Escape huỷ), mọi bước được **thông báo cho trình đọc màn hình**.
Thả xong phát `order-change` với thứ tự mới — **lưu lên server là việc của app**. Dùng cho thứ tự ảnh gallery, menu,
section trang chủ, thuộc tính sản phẩm, preset.

Như [media grid](media-grid.md) và [repeater](repeater.md), element **không tự render mục**: app in markup, element
nâng cấp tại chỗ (thêm tay nắm, ARIA, xử lý kéo / phím). Danh sách dòng có field cần thêm / xoá thì dùng
[repeater `sortable`](repeater.md#6-kéo-thả-và-bàn-phím-sortable-0310) — cùng bộ điều khiển.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/sortable'` (class: `import { TdSortable } from '@dazzxq/td-components'`) |
| Loại | Custom element (nâng cấp markup có sẵn) |
| Form-associated | không |
| Từ phiên bản | 0.31.0 (cần `td.css`) |

## Ví dụ nhanh

```html
<td-sortable label="Section trang chủ">
  <div data-td-sort-item data-id="hero" data-td-sort-label="Banner đầu trang">Banner đầu trang</div>
  <div data-td-sort-item data-id="flash" data-td-sort-label="Flash sale">Flash sale</div>
  <div data-td-sort-item data-id="news" data-td-sort-label="Tin tức">Tin tức</div>
</td-sortable>

<script type="module">
  import '@dazzxq/td-components/sortable';

  const list = document.querySelector('td-sortable');
  list.addEventListener('order-change', async (e) => {
    const res = await fetch('/admin/home-sections/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ order: e.detail.order }),
    });
    if (!res.ok) list.setOrder(e.detail.previous); // trả về thứ tự cũ — không phát event, không vòng lặp lưu
  });
</script>
```

## Cách dùng

### 1. Hợp đồng markup

```html
<td-sortable label="…" [disabled]>
  <div data-td-sort-item data-id="hero" [data-td-sort-label="Banner đầu trang"]>
    [<span data-td-sort-handle></span> | <button type="button" data-td-sort-handle>…</button>]   ← tuỳ chọn
    …nội dung app (có thể có field)…
  </div>
</td-sortable>
```

- Mục = **con trực tiếp** có `data-td-sort-item`, mỗi mục một `data-id` **không rỗng, duy nhất**.
- **Khoá bắt buộc:** chỉ một mục thiếu / trùng `data-id` → **cả danh sách tắt sắp xếp** (tay nắm `aria-disabled`) + một
  cảnh báo console. Kit **không bao giờ** phát một thứ tự thiếu (backend `/reorder` thường đòi đủ mọi bản ghi). Khoá
  được kiểm lại khi `data-id` / `data-td-sort-item` của một mục đổi, ngay trước khi nhấc / bắt đầu kéo và ngay trước khi
  phát event. Đổi `data-id` giữa lúc kéo mà vẫn hợp lệ → thao tác tiếp tục, event mang id **mới**; thành thiếu / trùng →
  thao tác bị huỷ.
- Tên đọc của mục: `data-td-sort-label` > `aria-label` của mục > chữ của `aria-labelledby` > "Mục {n}". Kit **không**
  dùng chữ của mục (có thể chứa giá trị field, quá dài).
- JS thêm: host `role="list"` (giữ `role` app đã đặt) + `aria-label` từ `label`; mục `role="listitem"` (giữ role sẵn có);
  một live region `span.td-sr-only[role=status]` và đoạn hướng dẫn `span[hidden]` ở cuối host (không phải mục).

### 2. Tay nắm

Chỉ kéo được **từ tay nắm** — phần còn lại của mục giữ nguyên click, chọn chữ, focus field và cuộn trang trên cảm ứng.

| App in | Kit làm |
|---|---|
| không gì | chèn `<button class="td-sortable__handle">` làm **con đầu** của mục |
| `<span data-td-sort-handle></span>` (ô giữ chỗ) | chèn nút **vào trong** ô (ô rỗng được CSS giữ 32px → không xô lệch khi JS chạy) |
| `<button type="button" data-td-sort-handle>` | nâng cấp đúng nút đó (thêm class, `aria-describedby`, `aria-label` nếu thiếu) |

Nút: `aria-label` "Sắp xếp {tên}", `aria-describedby` trỏ đoạn hướng dẫn, icon `grip`, 32px (44px trên cảm ứng),
`touch-action: none` (kéo bằng ngón tay không cuộn trang). Nút app in sẵn là **nút chết** trước khi module chạy → `td.css`
ẩn nó bằng `visibility: hidden` khi host chưa define (giữ chỗ, không thấy, không Tab tới, không vào cây trợ năng) và cho
nó đúng hộp của tay nắm nên khi hiện lại không xô lệch.

### 3. Bàn phím

| Phím (trên tay nắm) | Chưa nhấc | Đang nhấc |
|---|---|---|
| Space / Enter | nhấc ("Đã nhấc Banner, vị trí 2 trên 5.") | thả (phát `order-change` nếu thứ tự đổi) |
| ↑ / ← | — | lùi một ô |
| ↓ / → | — | tiến một ô |
| ↑ / ↓ (lưới ≥ 2 cột) | — | lên / xuống một hàng (ra ngoài lưới → đứng yên, không quấn vòng) |
| ← / → (lưới, `direction: rtl`) | — | đảo chiều |
| Home / End | — | về đầu / cuối |
| Escape | — | huỷ: về vị trí ban đầu, không event |
| Tab / rời focus | — | thả ở vị trí hiện tại |

Mỗi bước bàn phím **đổi DOM ngay** (focus vẫn ở tay nắm, trang cuộn tới mục) và đọc "Banner: vị trí 3 trên 5."; ở biên
đọc "… đã ở đầu / cuối danh sách.". `order-change` chỉ phát **một lần khi thả**, không phát mỗi mũi tên. Mũi tên chỉ được
nghe trên tay nắm của chính danh sách → input / select / textarea trong mục không bao giờ bị cướp phím. Lưới hay danh
sách do kit tự đo (không có attribute `orientation`).

### 4. Kéo bằng chuột / cảm ứng / bút

Nhấn tay nắm và di quá 4px → bắt đầu kéo: mục đi theo con trỏ, các mục khác dịch chỗ xem trước, khung nét đứt chỉ ô đích.
**DOM không đổi trong lúc kéo**; thả → một lần di chuyển + `order-change` (`source: 'pointer'`). Ô đích = ô chứa con
trỏ (ngoài mọi ô → ô gần nhất). Gần mép (48px) của vùng cuộn gần nhất thì tự cuộn. Huỷ (không đổi gì): Escape, mất
pointer, trang bị ẩn, modal / loading mở đè, app sửa danh sách giữa chừng.

Nhấn rồi thả không di (< 4px) = click = nhấc (như Space).

### 5. Chạm để chuyển (không cần kéo — WCAG 2.2 SC 2.5.7)

Chạm tay nắm A (nhấc) → chạm tay nắm của mục C → A chuyển tới chỗ C và thả. Chạm lại chính A = thả tại chỗ. Cùng đường
click nên dùng được với chuột, cảm ứng, điều khiển bằng giọng nói.

### 6. `order-change` và lưu server

```js
list.addEventListener('order-change', (e) => {
  const { order, previous, id, from, to, source } = e.detail;
  // order: string[] — data-id theo thứ tự mới; previous: thứ tự ngay trước lần thả này
});
```

- Phát khi **thả** và thứ tự thật sự đổi; không cancelable (DOM đã đổi). Không phát cho từng bước bàn phím, khi huỷ, khi
  gọi API (`setOrder`), khi app tự sửa DOM.
- Server lỗi → `list.setOrder(e.detail.previous)` (không phát event → không vòng lặp lưu).
- **Đừng bật sắp xếp cho một tập con đã lọc / đang phân trang**: "chuyển mục 3 lên đầu trang 2" là mơ hồ với thứ tự toàn
  cục. Như dcms2, chỉ cho sắp khi **toàn bộ** danh sách nằm trên một trang và không lọc (tắt bằng `disabled` hoặc không
  render tay nắm).

### 7. Lưới ảnh với media grid (công thức)

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

- `role="none"`: media grid đã là danh sách; sortable chỉ thêm tay nắm.
- **Không cần CSS của app:** `td.css` có luật ghép `td-media-grid > td-sortable { display: grid; grid-template-columns:
  var(--td-media-grid-cols); gap: var(--td-media-grid-gap); grid-column: 1 / -1 }` — sortable chiếm cả hàng của lưới
  ngoài và tự là lưới dùng **cùng token** cột / khe. Đổi `--td-media-grid-cols` trên `td-media-grid` là sortable theo.
- Tay nắm nằm ở góc trên-cuối của ảnh trên nền đặc (góc trên-đầu là nút tick của media grid).
- Space trên nút mở ảnh = chọn (media grid), Space trên tay nắm = nhấc (sortable) — khác phần tử, không xung đột.
  `selectedIds` của media grid đi theo thứ tự DOM mới.

### 8. Không JS

Danh sách tĩnh theo thứ tự server in. Tay nắm của kit chỉ có khi JS chạy; tay nắm app in sẵn bị ẩn (mục 2). App cần sắp
xếp không JS thì tự in ô số thứ tự (ngoài kit).

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `label` | string | — | Tên danh sách (`aria-label` của host). |
| `disabled` | boolean | — | Tay nắm `aria-disabled="true"` (vẫn focus được, đọc là "mờ"); thao tác đang chạy bị huỷ. |

## Property & method

| Thành viên | Kiểu / chữ ký | Mô tả |
|---|---|---|
| `order` | `string[]` (chỉ đọc) | `data-id` theo thứ tự DOM. |
| `setOrder(ids)` | `→ boolean` | Sắp lại theo `ids` (phải là **hoán vị đúng** của id hiện có; sai / khoá không hợp lệ → `false` + cảnh báo). Không phát event; thao tác đang chạy bị huỷ trước. |
| `cancel()` | `→ void` | Huỷ kéo / nhấc đang chạy (nhấc → về chỗ cũ). |
| `TdSortable.labels` | static | Văn bản (dùng chung với repeater `sortable`). |

```js
import { TdSortable } from '@dazzxq/td-components/sortable';
Object.assign(TdSortable.labels, {
  handle: 'Reorder {name}', item: 'Item {n}',
  help: 'Press Space or Enter to lift, arrow keys to move, Space or Enter to drop, Escape to cancel.',
  lifted: '{name} lifted, position {n} of {count}.', moved: '{name}: position {n} of {count}.',
  dropped: '{name} dropped at position {n} of {count}.', cancelled: 'Cancelled, {name} back to position {n} of {count}.',
  first: '{name} is already first.', last: '{name} is already last.',
});
```

Mặc định: `handle` "Sắp xếp {name}", `item` "Mục {n}", `help` "Nhấn Space hoặc Enter để nhấc, phím mũi tên để di chuyển,
Space hoặc Enter để thả, Escape để huỷ.", `lifted` "Đã nhấc {name}, vị trí {n} trên {count}.", `moved` "{name}: vị trí
{n} trên {count}.", `dropped` "Đã thả {name} ở vị trí {n} trên {count}.", `cancelled` "Đã huỷ, {name} về vị trí {n} trên
{count}.", `first` "{name} đã ở đầu danh sách.", `last` "{name} đã ở cuối danh sách.".

## Event

| Event | detail | Khi nào | Hủy được? |
|---|---|---|---|
| `order-change` | `{ order, previous, id, from, to, source: 'pointer' \| 'keyboard' }` | Thả và thứ tự đổi (xem mục 6) | không |

Tên khác `sort-change` của [table](table.md) (sắp cột). Không có event cho thay đổi từ bên ngoài.

## Tuỳ biến giao diện

Không có token mới (theming không đổi). Bố cục danh sách / lưới là CSS của app (host `display: block; position:
relative`). Kit vẽ: tay nắm ghost (màu chữ phụ, hover nền `--td-color-hover-strong`, `aria-disabled` màu disabled), mục đang
kéo nền đặc `--td-color-surface` + một shadow `--td-glass-shadow` (không phóng to — Minimal surfaces), mục đang nhấc viền
`outline` 2px `--td-accent`, khung đích nét đứt `--td-control-border-strong`. Các mục dịch chỗ có `transition: transform
150ms` **chỉ** khi `prefers-reduced-motion: no-preference`; mục bám con trỏ và bước bàn phím không có animation.

## Cấu trúc DOM & class

```html
<td-sortable label="Section" role="list" aria-label="Section" [data-td-dragging]>
  <div data-td-sort-item data-id="hero" role="listitem" [data-td-sort-state="lifted|dragging"]>
    <button type="button" class="td-sortable__handle" aria-label="Sắp xếp Banner" aria-describedby="td-sortable-1-help"
            [aria-disabled="true"]><svg data-icon="grip" …/></button>
    …
  </div>
  <span hidden id="td-sortable-1-help">Nhấn Space hoặc Enter để nhấc…</span>
  <span class="td-sr-only" role="status"></span>
  <div class="td-sortable__placeholder" aria-hidden="true"></div>   ← chỉ trong lúc kéo
</td-sortable>
```

- Vị trí trong lúc kéo đi qua CSSOM (`--_td-sort-x` / `--_td-sort-y` trên mục, `left` / `top` / `width` / `height` của
  khung đích) — không `style="…"`, không `<style>`; mọi giá trị được xoá khi kết thúc.
- Id sinh từ bộ đếm, không phải API.

## Bàn phím & trợ năng

Xem bảng ở mục 3. Thêm:

- Tay nắm là `<button>` thật và là đường **duy nhất** để nhấc (click / Enter / Space / click `detail 0` của trình đọc màn
  hình ở browse mode / chạm) → không có chuỗi keydown / keyup / click bị bật hai lần.
- **Giới hạn ở browse mode** (NVDA / JAWS): mũi tên bị trình đọc màn hình dùng để đọc; người dùng vào forms / focus
  mode (Enter trên tay nắm) hoặc dùng chạm-để-chuyển. Repeater còn có nút ↑ / ↓.
- Escape đi qua bộ điều phối lớp của kit: sortable nằm trong modal → Escape huỷ thao tác, modal vẫn mở.

## Bảo mật

- `label`, `data-td-sort-label`, `aria-label` của mục và mọi văn bản `labels` chỉ đi vào `aria-label` / live region dưới
  dạng **text**. Không có cửa HTML.
- `order-change` chỉ mang `data-id` của app. Server vẫn phải kiểm `order` là hoán vị đúng của các bản ghi người dùng được
  sửa.

## Cảm ứng

- Kéo bắt đầu sau **10 px** với ngón tay, 8 px với bút, 4 px với chuột (đọc theo từng sự kiện — máy lai đúng). Chạm nhẹ (dưới ngưỡng) vẫn là "chạm để nhấc" rồi chạm vị trí mới.
- Chỉ tay nắm có `touch-action: none`; vuốt trên thân item cuộn trang bình thường. Tay nắm có hình nhấn.

Chuẩn chung: [Cảm ứng](../guides/touch.md).

## Lưu ý & lỗi thường gặp

- **Tay nắm mờ, không nhấc được** → có mục thiếu / trùng `data-id` (xem console) hoặc `disabled`.
- **Mục không xếp thành lưới trong media grid** → sortable phải là **con trực tiếp** của `td-media-grid`.
- **Kéo cả mục** (không tay nắm), kéo giữa hai danh sách, lồng sortable trong sortable, mục ghim, chọn nhiều rồi kéo, sắp
  dòng `td-table`, undo, cây: chưa hỗ trợ (non-goal v0.31).
- Không có helper PHP: nội dung mục là markup của app.

## Xem thêm

- [Repeater `sortable`](repeater.md) · [Media grid](media-grid.md) · [Table](table.md)
