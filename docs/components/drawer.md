[Tài liệu](../README.md) › [Components](README.md) › Drawer

# Ngăn kéo (drawer) — `<td-drawer>`

Panel trượt vào từ cạnh đầu hoặc cạnh cuối màn hình (mặc định cạnh phải), chặn phần còn lại của trang như một hộp thoại
modal: có scrim, bẫy focus, khoá cuộn, Escape / bấm nền để đóng, trả focus về nút đã mở. Hợp với nội dung **dài hoặc
phụ** cần giữ ngữ cảnh trang bên dưới: bộ lọc, form sửa nhanh, chi tiết một dòng trong bảng, giỏ hàng, menu điều hướng
trên điện thoại. Dùng được theo hai cách: thẻ khai báo `<td-drawer>` trong HTML, hoặc `TdDrawer.open({…})` từ JS.

**Không** dùng drawer cho câu hỏi xác nhận hay thông báo ngắn ("Xoá mục này?", "Đã lưu") — dùng
[modal](modal.md) (`TdModal.confirm` / `TdModal.success`); cũng không dùng cho thông báo không chặn (dùng
[toast](toast.md)) hay nội dung mà người dùng phải thấy ngay khi vào trang (để thẳng trong trang).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/drawer'` (class: `import { TdDrawer } from '@dazzxq/td-components'`) |
| Loại | Custom element + API JS tĩnh (`TdDrawer.open()`) |
| Form-associated | không |
| Từ phiên bản | 0.27.0 (cần `td.css`) |

## Ví dụ nhanh

```html
<button type="button" class="td-btn td-btn--primary" id="open-filters">
  <span class="td-btn__label">Bộ lọc</span>
</button>

<td-drawer id="filters" title="Bộ lọc">
  <label class="td-field__label" for="f-q">Từ khoá</label>
  <input id="f-q" class="td-field__control" name="q">
  <div slot="footer">
    <button type="button" class="td-btn td-btn--primary" id="apply-filters">
      <span class="td-btn__label">Áp dụng</span>
    </button>
  </div>
</td-drawer>

<script type="module">
  import '@dazzxq/td-components/drawer';

  const drawer = document.getElementById('filters');
  document.getElementById('open-filters').addEventListener('click', () => drawer.show());
  document.getElementById('apply-filters').addEventListener('click', () => drawer.close('button'));
  drawer.addEventListener('close', (e) => console.log('Đã đóng vì', e.detail.reason));
</script>
```

Khi mở, các con của `<td-drawer>` được **chuyển** (không sao chép) vào panel: phần tử `slot="footer"` vào chân panel,
phần còn lại vào thân panel. Đóng xong, chúng quay về `<td-drawer>` đúng thứ tự cũ — listener, giá trị đã gõ, trạng
thái của component con đều giữ nguyên.

## Cách dùng

### 1. Mở / đóng bằng attribute hoặc property

```js
drawer.show();                 // = drawer.open = true = drawer.setAttribute('open', '')
await drawer.close();          // = drawer.open = false = drawer.removeAttribute('open'); reason 'programmatic'
drawer.open;                   // true khi đang mở (false trong lúc đang trượt ra)
```

```html
<td-drawer title="Giỏ hàng" open>…</td-drawer>  <!-- mở ngay khi trang chạy JS -->
```

Attribute `open` và property `open` đồng bộ hai chiều. `show()` khi đang mở và `close()` khi đã đóng / đang đóng không
làm gì (idempotent). `close()` trả về `Promise` resolve với `reason` **sau** khi hiệu ứng trượt ra kết thúc và các node
đã về lại host; resolve `null` nếu việc đóng bị huỷ (`before-close` bị `preventDefault()`) hoặc drawer không mở.

### 2. Mở từ JS: `TdDrawer.open()`

```js
import { TdDrawer } from '@dazzxq/td-components';

const form = document.createElement('form');
form.id = 'quick-edit';
form.append(/* … các ô nhập … */);

const save = document.createElement('button');
save.type = 'submit';
save.setAttribute('form', 'quick-edit');
save.className = 'td-btn td-btn--primary';
save.textContent = 'Lưu';

const d = TdDrawer.open({ title: 'Sửa nhanh', body: form, footer: save, size: 'lg' });
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await saveRow(new FormData(form));
  d.close('programmatic');
});
const reason = await d.closed; // 'escape' | 'backdrop' | 'button' | 'programmatic'
```

`TdDrawer.open()` tạo một `<td-drawer>`, gắn vào cuối `<body>`, mở ngay và trả về `{ element, close(reason), closed }`.
Host này **tự bị gỡ** khỏi DOM sau khi đóng. `closed` là Promise resolve với `reason` (cùng lúc event `close`); nếu
trang tự gỡ host khi drawer còn mở, `closed` vẫn resolve. Xem bảng tuỳ chọn ở mục [Property & method](#property--method).

### 3. Header, body, footer

```html
<td-drawer title="Đơn hàng #1024">
  <span class="td-badge" slot="header">Mới</span>  <!-- vào header, giữa tiêu đề và nút × -->
  <p>Nội dung dài…</p>                      <!-- vào body: vùng cuộn DUY NHẤT -->
  <div slot="footer">…các nút…</div>        <!-- vào footer (ẩn khi không có gì) -->
</td-drawer>
```

`slot` ở đây chỉ là attribute đánh dấu (không có Shadow DOM): `slot="header"` → header (đặt **trước** nút ×),
`slot="footer"` → footer, mọi node khác (kể cả text) → body. Header và footer đứng yên, chỉ body cuộn.

### 4. Cạnh và kích thước

```html
<td-drawer side="start" size="sm" label="Menu chính">…</td-drawer>
```

- `side="end"` (mặc định) / `side="start"` là cạnh **logic**: `end` = bên phải khi LTR, bên trái khi RTL. Hướng lấy từ
  `direction` của host lúc mở (root nhận `dir` tương ứng).
- `size`: `sm` (20rem) · `md` (28rem, mặc định) · `lg` (36rem) · `xl` (48rem). Muốn độ rộng tuỳ ý, đặt
  `--td-drawer-w` (thắng `size`, xem [Tuỳ biến giao diện](#tuỳ-biến-giao-diện)).
- Theo breakpoint kit ([responsive](../concepts/responsive.md)): màn hình **< 480px** panel tràn toàn màn hình bất kể `size`; **480–719px** panel rộng tối đa `100% − 3rem` (vẫn thấy một dải trang phía sau). Header / footer / cạnh panel cộng `env(safe-area-inset-*)` (tai thỏ, thanh home).

### 5. Không cho đóng bằng Escape / bấm nền

```html
<td-drawer title="Thanh toán" dismissible="false">…</td-drawer>
```

`dismissible="false"` (đúng chuỗi `false`): Escape và bấm nền không đóng; chỉ nút × và `close()` đóng được. Escape vẫn
bị drawer "nuốt", không lọt xuống trang hay lớp bên dưới. `TdDrawer.open({ dismissible: false })` tương đương.

### 6. Chặn đóng khi form chưa lưu (`before-close`)

Mọi đường đóng (Escape, bấm nền, nút ×, `close()`) đều phát `before-close` **có thể huỷ** trước. Vì `preventDefault()`
phải gọi **đồng bộ** còn `TdModal.confirm` là bất đồng bộ, mẫu đúng là: chặn trước, hỏi sau, đồng ý thì gọi lại
`close()` kèm một cờ để lần đó đi qua:

```js
import { TdModal } from '@dazzxq/td-components/modal';

let discarding = false;
drawer.addEventListener('before-close', async (e) => {
  if (discarding || !isDirty(form)) return;  // không có gì để mất → cho đóng
  e.preventDefault();                         // chặn NGAY (đồng bộ)
  const ok = await TdModal.confirm({
    message: 'Bỏ các thay đổi chưa lưu?',
    confirmText: 'Bỏ thay đổi',
    confirmVariant: 'danger',
  });
  if (!ok) return;                            // ở lại drawer
  discarding = true;
  try { await drawer.close(e.detail.reason); } finally { discarding = false; }
});
```

Modal xác nhận mở **bên trên** drawer (lớp mở sau nằm trên); đóng modal thì focus quay lại trong drawer.

### 7. Đặt tên cho hộp thoại

Drawer là `role="dialog"` nên phải có tên. Thứ tự ưu tiên:

1. `title` → một `<h2 class="td-drawer__title">` hiển thị + `aria-labelledby` trỏ vào nó;
2. `label` → `aria-label` (không có tiêu đề hiển thị — ví dụ menu điều hướng);
3. `aria-labelledby` đặt trên host → chuyển xuống panel (nên trỏ tới một heading nằm trong nội dung drawer);
4. không có gì → một `console.warn` (một lần mỗi trang) và dùng `TdDrawer.labels.drawer` (`'Bảng điều khiển'`).

### 8. Markup render sẵn phía server (PHP / Blade)

Drawer không có helper PHP; in thẳng markup, phần nội dung vẫn escape như mọi chỗ khác:

```php
<td-drawer id="order-detail" title="<?= htmlspecialchars($title, ENT_QUOTES) ?>" size="lg">
  <dl class="order-meta">…</dl>
  <div slot="footer">
    <?= td_button('Đóng', ['variant' => 'ghost', 'attrs' => ['data-close-drawer' => '']]) ?>
  </div>
</td-drawer>
```

```blade
<td-drawer id="order-detail" title="{{ $title }}" size="lg">
  @include('orders._detail', ['order' => $order])
  <div slot="footer"><button type="button" class="td-btn td-btn--ghost" data-close-drawer>Đóng</button></div>
</td-drawer>
```

Nút đóng tuỳ ý thì nối bằng JS của site, gắn listener lên `document` (lúc mở, nút nằm trong panel dưới `<body>`,
không còn trong host — xem [Lưu ý](#lưu-ý--lỗi-thường-gặp)):

```js
const drawer = document.getElementById('order-detail');
document.addEventListener('click', (e) => {
  if (e.target.closest('.td-drawer-root [data-close-drawer]')) drawer.close('button');
});
```

**Khi không có JS**, `<td-drawer>` chưa được định nghĩa sẽ **hiện nội dung tại chỗ** như một khối bình thường (kit không
giấu nội dung). Vì vậy hãy đặt drawer ở cuối nội dung trang, hoặc bọc trong `<details>` nếu nội dung đó chỉ nên thấy khi
người dùng chủ động mở.

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `open` | boolean | — | Có → mở (khi host nằm trong document). Phản chiếu hai chiều với property `open`. |
| `title` | string | — | Tiêu đề hiển thị, đặt tên cho hộp thoại. Đọc lúc mở. |
| `label` | string | — | `aria-label` khi không có `title`. Đọc lúc mở. |
| `aria-labelledby` | id | — | Tên theo phần tử khác, dùng khi không có `title` / `label`. |
| `side` | `'start'` \| `'end'` | `end` | Cạnh trượt vào (logic, tự lật khi RTL). Giá trị khác → `end`. Đọc lúc mở. |
| `size` | `'sm'` \| `'md'` \| `'lg'` \| `'xl'` | `md` | Độ rộng panel. Giá trị khác → `md`. Đọc lúc mở. |
| `dismissible` | `'false'` | (bật) | Đúng chuỗi `false` → Escape và bấm nền không đóng. Đọc tại thời điểm nhấn phím / bấm. |

`title`, `label`, `side`, `size` chỉ có tác dụng ở lần mở **tiếp theo**; đổi khi drawer đang mở không cập nhật panel.

## Property & method

| Thành viên | Kiểu / chữ ký | Mô tả |
|---|---|---|
| `open` | `boolean` | Đọc: `true` khi đang mở (không tính lúc đang trượt ra). Gán `true` → `show()`, `false` → `close('programmatic')`. |
| `show()` | `() => void` | Mở. Đang mở → không làm gì. Đang trượt ra → kết thúc lần đóng đó ngay (`close` phát) rồi mở lại. Host chưa gắn vào document → không làm gì. |
| `close(reason?)` | `(reason = 'programmatic') => Promise<string \| null>` | Đóng: phát `before-close`, rồi trượt ra; Promise resolve `reason` sau khi xong, `null` nếu bị huỷ hoặc không mở. Gọi lại trong lúc đang đóng → cùng một Promise. |
| `TdDrawer.open(options)` | `(options?) => { element, close(reason?), closed }` | Tạo, gắn vào `<body>` và mở một drawer; host bị gỡ sau khi đóng. |
| `TdDrawer.labels` | `{ close, drawer }` | Chữ mặc định: `close` = `'Đóng'` (aria-label nút ×), `drawer` = `'Bảng điều khiển'` (tên dự phòng). Gán lại cho cả site: `TdDrawer.labels.close = 'Close'`. |

Tuỳ chọn của `TdDrawer.open()`:

| Tuỳ chọn | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `title` | `string` | — | Tiêu đề hiển thị (text). |
| `label` | `string` | — | `aria-label` khi không có `title`. |
| `body` | `Node \| Node[] \| DocumentFragment \| string` | — | Nội dung thân. Node / fragment được gắn nguyên. **Chuỗi luôn là TEXT** (gán như `textContent`, không bao giờ parse HTML) — đưa dữ liệu người dùng vào là an toàn. |
| `bodyHtml` | `string \| TrustedHTML` | — | **Cửa HTML tin cậy** (từ 0.27.0, tên tường minh): markup do developer viết, parse bằng `<template>`. **Không bao giờ** dùng cho dữ liệu người dùng / dữ liệu từ server chưa làm sạch. Bị bỏ qua khi có `body`. Nhận `TrustedHTML` khi trang bật Trusted Types. |
| `footer` | `Node \| Node[] \| string` | — | Phần tử chân panel (được gắn `slot="footer"`; node không phải element được bọc trong một `<div slot="footer">`). Chuỗi = TEXT. |
| `footerHtml` | `string \| TrustedHTML` | — | Như `bodyHtml` cho chân panel (bị bỏ qua khi có `footer`). |
| `side` | `'start' \| 'end'` | `'end'` | Như attribute. |
| `size` | `'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Như attribute. |
| `dismissible` | `boolean` | `true` | `false` → chỉ nút × / `close()` đóng được. |
| `onClose` | `(reason) => void` | — | Gọi sau khi đóng (cùng lúc event `close`). Lỗi ném ra được ghi `console.error`. |

Giá trị trả về: `element` là host `<td-drawer>` (nghe event, gọi method trên đó được); `close(reason)` = `element.close(reason)`;
`closed` là `Promise<reason>`.

## Event

| Event | detail | Khi nào | Huỷ được? | bubbles? |
|---|---|---|---|---|
| `open` | — | Sau khi chuyển động vào kết thúc (trượt, hoặc fade ngắn khi giảm chuyển động); trạng thái mở + focus ban đầu đã đặt từ đầu chuyển động. Đóng trước khi chuyển động xong → **không** phát. Đúng một lần mỗi lần mở. | không | có (composed) |
| `before-close` | `{ reason }` | Trước mọi lần đóng. `reason`: `'escape'` \| `'backdrop'` \| `'button'` (nút ×) \| `'programmatic'` (hoặc giá trị bạn truyền vào `close()`). | **có** — `preventDefault()` giữ drawer mở | có (composed) |
| `close` | `{ reason }` | **Sau** khi trượt ra xong và các node đã về lại host (với `TdDrawer.open()`: ngay trước khi host bị gỡ). | không | có (composed) |

Gọi `close()` ngay **bên trong** handler `before-close` (đồng bộ) bị bỏ qua và trả `null`; muốn đóng lại thì gọi sau
một `await`, như mẫu ở [mục 6](#6-chặn-đóng-khi-form-chưa-lưu-before-close).

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-drawer-w` | (không đặt) | Độ rộng tuỳ ý, thắng `size`. Vẫn bị kẹp ở 100% màn hình. |
| `--td-drawer-w-sm` | `20rem` | Độ rộng `size="sm"` |
| `--td-drawer-w-md` | `28rem` | Độ rộng `size="md"` (mặc định) |
| `--td-drawer-w-lg` | `36rem` | Độ rộng `size="lg"` |
| `--td-drawer-w-xl` | `48rem` | Độ rộng `size="xl"` |
| `--td-drawer-pad-x` | `var(--td-space-lg)` | Đệm ngang của header, body, footer |
| `--td-drawer-pad-y` | `var(--td-space-md)` | Đệm dọc của body |
| `--td-drawer-enter-dur` | `280ms` | Thời gian trượt vào (và scrim hiện) |
| `--td-drawer-exit-dur` | `200ms` | Thời gian trượt ra |
| `--td-drawer-ease` | `cubic-bezier(0.32, 0.72, 0, 1)` | Đường cong trượt vào |
| `--td-drawer-exit-ease` | `cubic-bezier(0.4, 0, 0.2, 1)` | Đường cong trượt ra |

Token dùng chung có ảnh hưởng: `--td-z-modal` (`400`, cùng tầng với modal), `--td-glass-scrim` (màu nền phủ, không làm
mờ), `--td-glass-solid` / `--td-glass-border` / `--td-glass-shadow-lg` (bề mặt panel), `--td-hairline` (đường kẻ dưới
header, trên footer).

`--td-drawer-w` đặt được ở ba chỗ: trên `:root` (mọi drawer), trên **host** `<td-drawer>` (một drawer — giá trị được
chép sang root lúc mở, vì root nằm dưới `<body>` chứ không nằm trong host), hoặc nhắm thẳng `.td-drawer-root`.

```css
/* CSS của site — không bọc trong @layer để thắng td.tokens */
:root { --td-drawer-pad-x: 1rem; }
#order-detail { --td-drawer-w: 42rem; }    /* chỉ drawer này */
```

```js
// Per-instance bằng CSSOM (an toàn với CSP) — trước khi mở
drawer.style.setProperty('--td-drawer-w', '30rem');
```

Panel dùng bề mặt Minimal: **nền đặc** (không blur) + viền mảnh + bóng `lg`, trên scrim thường (không làm mờ trang). Xem
[Theming](../customization/theming.md#bề-mặt-nổi---td-glass-).

## Cấu trúc DOM & class

Lúc đóng, `<td-drawer>` đã định nghĩa là `display: none` và chỉ chứa các node của bạn. Lúc mở, có **một** root là con
trực tiếp của `<body>` (giống TdModal / TdLightbox — để inert, bẫy focus và xếp lớp hoạt động đúng):

```html
<body>
  …
  <td-drawer id="filters" title="Bộ lọc" open></td-drawer>   <!-- rỗng trong lúc mở -->

  <div class="td-drawer-root td-drawer-root--end td-drawer-root--md" dir="ltr" data-state="open">
    <div class="td-drawer__backdrop" aria-hidden="true"></div>
    <div class="td-drawer__panel td-glass-surface td-glass-surface--lg" role="dialog" aria-modal="true"
         tabindex="-1" aria-labelledby="filters-title">
      <div class="td-drawer__header">
        <h2 class="td-drawer__title" id="filters-title">Bộ lọc</h2>
        <!-- các node slot="header" -->
        <button type="button" class="td-drawer__close" aria-label="Đóng">
          <span class="td-drawer__close-icon" data-td-icon="close" aria-hidden="true"><svg …></svg></span>
        </button>
      </div>
      <div class="td-drawer__body"><!-- các node còn lại --></div>
      <div class="td-drawer__footer"><!-- các node slot="footer" --></div>
    </div>
  </div>
</body>
```

| Class / attribute | Ý nghĩa |
|---|---|
| `.td-drawer-root--start` / `--end` | Cạnh trượt vào. |
| `.td-drawer-root--sm` … `--xl` | Kích thước. |
| `[dir]` trên root | Hướng chữ lấy từ host lúc mở (quyết định cạnh vật lý). |
| `[data-state="opening\|open\|closing"]` trên root | Trạng thái (do JS đặt; dùng thay cho class trạng thái). |
| `[inert]` trên panel | Có trong lúc đang trượt ra. |
| `[hidden]` trên `.td-drawer__footer` | Footer không có node nào. |
| `aria-labelledby` / `aria-label` trên panel | Tên hộp thoại (xem [mục 7](#7-đặt-tên-cho-hộp-thoại)). |

- Id tiêu đề: `{id của host}-title`; host không có id thì `td-drawer-{n}-title`.
- Tiêu đề luôn là `<h2>`.

## Bàn phím & trợ năng

| Phím | Tác dụng |
|---|---|
| Tab / Shift+Tab | Đi vòng trong panel (bẫy focus); không ra được trang bên dưới. |
| Escape | Đóng (`reason: 'escape'`) nếu `dismissible`; nếu đang có popup con mở (menu dropdown, gợi ý chip-input…) thì **chỉ** đóng popup đó. |
| Enter / Space trên × | Đóng (`reason: 'button'`). |

- Lúc mở: phần còn lại của trang bị `inert`, cuộn trang bị khoá (khoá chia sẻ với modal / lightbox).
- **Focus ban đầu**: ô nhập đầu tiên trong body (`input` / `textarea` / `select` không disabled) → phần tử focus được đầu
  tiên khác → nút × → chính panel. Event `open` phát khi chuyển động vào đã xong (focus đặt từ trước đó).
- **Đóng**: focus quay lại phần tử đã mở drawer (thường là nút bấm); nếu nút đó không còn, về lớp nổi bên dưới hoặc lớp
  trên cùng còn lại.
- Xếp lớp: drawer dùng `--td-z-modal` và chung một "dải" với modal / lightbox — lớp mở sau nằm trên. Mở lightbox hoặc
  modal từ trong drawer, hay mở drawer từ trong lightbox, đều dùng được (cơ chế đẩy lớp lên của 0.21.1).
- Vùng bấm nút × ≥ 36px, ≥ `--td-touch-min` trên thiết bị cảm ứng.
- `prefers-reduced-motion`: panel không trượt, chỉ hiện/ẩn mờ dần (`--td-dur-fast`). Forced colors: panel, header,
  footer có viền `CanvasText`, nút × viền `ButtonText`.

TdModal và td-drawer dùng chung một bộ điều khiển lớp hộp thoại nội bộ (`src/feedback/dialog-layer.js`: gắn vào
`<body>`, inert, bẫy focus, Escape, trả focus, đóng hai pha). Đây **không** phải API công khai — không import trực tiếp.

## Bảo mật

`title`, `label` được đưa vào DOM dạng **text** / attribute — đưa dữ liệu người dùng vào là an toàn. Nội dung khai báo
là node do bạn (hoặc server) tạo, kit chỉ di chuyển, không parse lại. `TdDrawer.open({ body: '…' })` với chuỗi luôn hiển thị **text**
(không như `TdModal.show({ body })` cũ). HTML chỉ đi qua cửa đặt tên tường minh `bodyHtml` / `footerHtml` (parse bằng
`<template>.innerHTML`, nhận `TrustedHTML`) — chỉ dành cho markup do developer viết, **không bao giờ** cho dữ liệu người
dùng (CWE-79). Không có `style="…"`; độ rộng per-instance ghi bằng CSSOM — chạy được dưới CSP nghiêm
ngặt.

## Lưu ý & lỗi thường gặp

- **Trong lúc mở, nội dung không nằm trong host.** `drawer.querySelector('#f-q')` trả `null` khi drawer đang mở; tìm
  bằng `document.getElementById(…)` hoặc giữ tham chiếu tới phần tử. Listener gắn **trực tiếp** lên phần tử con vẫn chạy;
  listener **uỷ quyền** (delegation) gắn trên host hoặc tổ tiên của host thì không nhận event từ panel — gắn lên chính
  phần tử, hoặc lên `document`.
- **CSS nhắm theo cha** (`#filters .x`, `.sidebar td-drawer input`) không áp dụng khi mở, vì node đã ra dưới `<body>`.
  Viết CSS nhắm class của chính phần tử, hoặc `.td-drawer-root …`. Token đặt trên tổ tiên của host cũng không tới panel
  (trừ `--td-drawer-w`, được chép riêng).
- **Gỡ host khi đang mở**: drawer đóng ngay (không hiệu ứng), node về lại host, attribute `open` được giữ → gắn host lại
  vào trang thì mở lại. Với host do `TdDrawer.open()` tạo, `close` vẫn phát và `closed` vẫn resolve.
- **`close` phát muộn** (sau hiệu ứng ~200ms). Cần biết "người dùng vừa bấm đóng" ngay lập tức thì nghe `before-close`.
- `title` cũng là attribute HTML toàn cục: khi **không có JS**, rê chuột lên khối nội dung sẽ hiện tooltip của trình
  duyệt. Không muốn vậy thì dùng `label` + một heading trong nội dung (`aria-labelledby`).
- `dismissible="false"` không chặn `close()` từ code và nút ×; muốn chặn mọi đường thì dùng `before-close`.
- Đừng dùng drawer cho xác nhận ngắn — dùng [TdModal.confirm](modal.md).

## Xem thêm

- [Modal](modal.md) · [Lightbox](lightbox.md) · [Toast](toast.md)
- [Lớp nổi, inert và focus](../concepts/how-it-works.md) · [Trợ năng](../guides/accessibility.md)
- [Theming](../customization/theming.md) · [Hooks](../customization/hooks.md) · [CSP](../guides/csp.md)
