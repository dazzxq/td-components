[Tài liệu](../README.md) › [Components](README.md) › Menu

# Menu thao tác — `TdMenu`

`TdMenu` là menu thao tác kiểu "···" (WAI-ARIA APG *Menu Button* + *Menu*): bấm một nút, hiện danh sách lệnh như
Sửa, Chia sẻ, Xoá. Nó là **API JS tĩnh**, không có thẻ custom element; menu được tạo lúc mở, gắn vào `<body>` và gỡ
khi đóng. Dùng khi cần một danh sách **hành động** gắn với một nút. **Không** dùng để chọn giá trị trong form (dùng
[`td-dropdown`](dropdown.md)), không dùng làm menu điều hướng chính của site, và không dùng cho nội dung giàu thông
tin khi rê chuột (dùng [`TdHovercard`](hovercard.md)).

| | |
|---|---|
| Import | `import { TdMenu } from '@dazzxq/td-components/menu'` |
| Loại | API JS tĩnh (static class), không có tag |
| Form-associated | không |
| Từ phiên bản | 0.12.0 (registry tuỳ chọn `define` / `register` / `bindAll`: 0.14.0; mục tuỳ biến `type: 'custom'`: 0.53.0) |
| CSS | cần `td.css` (phần `src/styles/components/menu.css`) |

Import không có side effect: không có gì chạy, không lắng nghe sự kiện nào cho tới khi bạn gọi `open`, `bind`,
`bindAll` hoặc `button`.

## Ví dụ nhanh

```html
<button type="button" id="post-7-actions" aria-label="Thao tác bài viết">···</button>
```

```js
import { TdMenu } from '@dazzxq/td-components/menu';

const trigger = document.getElementById('post-7-actions');

TdMenu.bind(trigger, [
  { label: 'Sửa', icon: 'plus', hint: 'Ctrl+E', onSelect: () => editPost(7) },
  { label: 'Mở trang', href: '/posts/7', newTab: true },
  { separator: true },
  { label: 'Xoá', danger: true, onSelect: () => deletePost(7) },
]);
```

`bind()` lo mọi thứ: gắn ARIA cho nút (`aria-haspopup="menu"`, `aria-expanded`), bấm để mở/đóng, phím mũi tên để mở,
và trả focus về nút sau khi chọn.

## Cách dùng

### 1. Gắn vào nút có sẵn — `TdMenu.bind()`

```js
const unbind = TdMenu.bind(trigger, items, { align: 'end', label: 'Thao tác bài viết' });
// …khi gỡ nút khỏi trang (SPA):
unbind();
```

`items` có thể là mảng, một hàm `(ctx) => items` (gọi mỗi lần mở, hợp khi danh sách phụ thuộc trạng thái hiện tại),
hoặc **tên** của một menu đã đăng ký (xem mục 5). Gọi `bind()` lần nữa trên cùng nút sẽ **thay** binding cũ.

```js
// Danh sách tính lúc mở: "Ghim" / "Bỏ ghim" theo trạng thái hiện tại
TdMenu.bind(trigger, () => [
  { label: post.pinned ? 'Bỏ ghim' : 'Ghim', onSelect: () => togglePin(post) },
  { label: 'Xoá', danger: true, onSelect: () => deletePost(post.id) },
]);
```

### 2. Để kit tạo luôn nút "···" — `TdMenu.button()`

Tương đương `createMenuButton` của dwp: tạo một `<button class="td-menu-btn">` đã được `bind()` sẵn.

```js
const btn = TdMenu.button({
  icon: 'more',              // tên icon trong registry (mặc định 'more')
  label: '',                 // chữ hiển thị cạnh icon (tuỳ chọn)
  ariaLabel: 'Thao tác bài viết',
  items: [
    { label: 'Sửa', onSelect: () => editPost(7) },
    { label: 'Xoá', danger: true, onSelect: () => deletePost(7) },
  ],
  align: 'end',              // mọi tuỳ chọn khác được chuyển cho bind()/open()
});
card.querySelector('.card__actions').append(btn);
```

- Không có `label` và không có `ariaLabel` → nút nhận `aria-label` = `TdMenu.labels.trigger` (mặc định `Tùy chọn`).
- `getItems` là tên thay thế cho `items` (dwp compat); nếu có cả hai thì `items` thắng.
- Icon không có trong registry → nút không có icon (không lỗi).

### 3. Mở bằng code — `TdMenu.open()`

Dùng khi anchor không phải nút bạn quản lý (ví dụ nút trên toolbar của lightbox, một ô bảng):

```js
const handle = TdMenu.open(anchorEl, items, { align: 'start', side: 'top', focus: 'first' });
if (handle) {
  handle.element;   // phần tử .td-menu đang mở
  handle.isOpen;    // true cho tới khi đóng
  handle.close();
}
```

`open()` là **toggle**: gọi lại với cùng anchor khi menu của anchor đó đang mở → đóng và trả `null`. Chỉ có **một menu
mở tại một thời điểm**; mở menu cho anchor khác sẽ đóng menu cũ.

### 4. Mục chọn được: checkbox và radio

```js
let view = 'grid';
let showHidden = false;

TdMenu.bind(trigger, () => [
  { label: 'Dạng lưới', type: 'radio', group: 'view', checked: view === 'grid',
    onSelect: () => { view = 'grid'; render(); } },
  { label: 'Dạng danh sách', type: 'radio', group: 'view', checked: view === 'list',
    onSelect: () => { view = 'list'; render(); } },
  { separator: true },
  { label: 'Hiện mục ẩn', type: 'checkbox', checked: showHidden,
    onSelect: (ctx) => { showHidden = ctx.checked; render(); } },
]);
```

Quan trọng: menu **không bao giờ sửa object item của bạn**. Trạng thái mới đến qua `ctx.checked` trong `onSelect`;
bạn phải lưu vào model của mình (như ví dụ trên), nếu không lần mở sau sẽ hiện trạng thái cũ. Vì vậy nên dùng dạng
hàm `() => items` để mỗi lần mở đọc lại model.

- `checkbox`: bấm là đảo trạng thái **tại chỗ**, menu **vẫn mở**. Từ 0.36.0 mục hiện
  [ô tick chung](checkbox.md#phần-hình-dùng-chung-td-check-0360) cỡ `sm` **luôn hiện** (hộp rỗng khi tắt, đã tick khi bật —
  đúng hình `td-checkbox`); trước là ✓ trần chỉ hiện khi bật.
- Từ 0.39.0, `onSelect` của mục **checkbox** nhận thêm `ctx.setDisabled(id, disabled, hint?)`: khoá / mở khoá mục
  khác (theo `id` của item) **ngay khi menu đang mở** (`aria-disabled`, mục khoá không chọn được); `hint` (chữ, tuỳ chọn)
  thay gợi ý của mục đó (`''` = bỏ gợi ý). Dùng cho luật kiểu "phải còn ít nhất một mục bật" — `td-table` `column-menu`
  dùng nó cho `min-visible`:

  ```js
  TdMenu.bind(trigger, () => cols.map((c) => ({
    type: 'checkbox', id: c.key, label: c.label, checked: c.on, disabled: c.on && onCount() === 1,
    onSelect: (ctx) => {
      c.on = ctx.checked;
      const last = onCount() === 1;
      for (const o of cols) ctx.setDisabled(o.key, o.on && last, o.on && last ? 'Cần ít nhất 1 cột' : '');
    },
  })));
  ```
- `radio`: bấm chọn một mục trong cùng `group`, menu **đóng**, `ctx.checked` luôn là `true`. Radio **giữ dấu ✓** (chỉ hiện
  ở mục đang chọn) — ngữ nghĩa chọn một, không phải hộp.
- Item có `checked` (boolean) mà không có `type` → được coi là `radio` (tương thích dwp).

### 5. Registry tuỳ chọn: lõi định nghĩa, module/site thêm mục (0.14.0)

Đây là cơ chế "lõi nhỏ + hook" của menu: một module định nghĩa menu **theo tên**, module khác (plugin, site) chèn
thêm mục mà không phải sửa code của module gốc.

```js
// Module bài viết (lõi)
TdMenu.define('post-actions', (ctx) => [
  { label: 'Sửa', onSelect: (c) => editPost(c.postId) },                 // order mặc định 0
  { label: 'Chia sẻ', onSelect: (c) => sharePost(c.postId) },             // order 10
  { label: 'Xoá', danger: true, order: 2000,                              // luôn cuối
    when: (c) => c.canDelete === '1', onSelect: (c) => deletePost(c.postId) },
]);

// Plugin thống kê (file khác, có thể chạy TRƯỚC hoặc SAU define)
const unregister = TdMenu.register('post-actions', [
  { label: 'Xem thống kê', icon: 'info', onSelect: (c) => openStats(c.postId) },
], { group: 'stats', order: 500 });

TdMenu.has('post-actions'); // true
```

Mở menu theo tên:

```js
TdMenu.open(anchor, 'post-actions', { ctx: { postId: 7, canDelete: '1' } });
TdMenu.bind(trigger, 'post-actions', { ctx: { postId: 7 } });
```

Hoặc **khai báo trong HTML** (hợp với trang render server-side như dwp/135) và gọi `bindAll()` **một lần**:

```html
<button type="button" class="td-menu-btn" aria-label="Thao tác"
        data-td-menu="post-actions" data-td-menu-post-id="7" data-td-menu-can-delete="1">···</button>
```

```js
const unbindAll = TdMenu.bindAll();          // root mặc định = document
// hoặc giới hạn trong một vùng: TdMenu.bindAll(document.querySelector('#feed'))
```

Quy tắc sắp xếp và nhóm:

| Quy tắc | Chi tiết |
|---|---|
| `order` của mục base (`define`) | mặc định `vị trí × 10` (0, 10, 20…) nếu item không tự khai `order` |
| `order` của mục `register` | `item.order` → `opts.order` → mặc định `1000` (nối cuối) |
| Bằng `order` | giữ thứ tự khai báo/đăng ký |
| `group` (tuỳ chọn của `register`) | đổi nhóm giữa hai mục liền nhau → tự chèn separator. Mục base và mục đăng ký không có `group` chung một nhóm mặc định |
| `when(ctx)` | trả `false` → ẩn mục. `when` throw → ẩn mục + `console.warn`. Áp dụng cho **mọi** danh sách, kể cả mảng thường |
| Separator | tự gộp: không có separator ở đầu, cuối, hay hai cái liền nhau |
| `define` lần hai cùng tên | **thay** danh sách base (các mục `register` vẫn giữ) |
| Tên chưa có gì | `open()` → `console.warn` + trả `null` (menu đang mở, nếu có, vẫn mở) |
| Mọi mục bị ẩn | `open()` trả `null` |

Mảng truyền vào `define`/`register` được **sao chép** tại thời điểm gọi; sửa mảng gốc sau đó không ảnh hưởng.
`undefine()` / `unregister()` chỉ gỡ đúng phần đóng góp của chính nó (một `undefine` cũ không gỡ được định nghĩa mới
hơn).

### 6. Ngữ cảnh `ctx`

`ctx` được dựng mỗi lần mở và truyền cho builder `(ctx) => items`, `when(ctx)` và `onSelect(ctx)`:

```text
ctx = {
  ...opts.ctx,                      // dữ liệu bạn truyền qua open()/bind()
  ...data-td-menu-* của anchor,     // camelCase, luôn là CHUỖI
  anchor,                           // phần tử anchor
  name,                             // tên menu đã đăng ký ('' nếu là danh sách thường)
}
onSelect nhận thêm: item (object item gốc của bạn), checked (boolean)
```

- `data-td-menu-post-id="7"` → `ctx.postId === '7'` (chuỗi; tự `Number()` nếu cần). `data-td-menu` (không hậu tố)
  là tên menu, không vào `ctx`.
- Thứ tự ghi đè: `data-td-menu-*` thắng `opts.ctx` khi trùng khoá.
- Các khoá dành riêng bị bỏ qua nếu bạn truyền: `__proto__`, `constructor`, `prototype`, `anchor`, `name`, `item`,
  `checked`.

### 7. Mục tuỳ biến — `type: 'custom'` (0.53.0)

Menu chứa được **nội dung bất kỳ** do bạn dựng: thanh chọn [`td-choice-group variant="segmented"`](choice-group.md),
[`td-tabs`](tabs.md), một công tắc, một form nhỏ, khối thông tin (avatar + email)… Kit không có item cứng kiểu
`segmented` / `theme`: bạn trả về một **Element**, kit đặt nó vào một hàng của menu.

```js
{
  type: 'custom',                       // bắt buộc
  render(ctx) { return element; },      // bắt buộc: Element MỚI, chưa gắn vào trang — hoặc null (không có hàng)
  label: 'Giao diện',                   // tuỳ chọn: caption hiển thị (TEXT) + tên của hàng (role="group")
  id: 'theme',                          // tuỳ chọn: data-item="theme" trên hàng
  order: 500, when: (ctx) => true,      // như mọi item (registry / ẩn hiện)
}
```

`render(ctx)` được gọi **mỗi lần mở** (giống danh sách dạng hàm: luôn đọc trạng thái hiện tại), với:

```text
ctx = {
  ...opts.ctx, ...data-td-menu-*,   // như ctx của menu (mục 6)
  anchor, name,
  item,                             // object item của bạn (không bị sửa)
  close(),                          // đóng menu (lý do 'select', focus về trigger); gọi sau khi đã đóng: không làm gì
  signal,                           // AbortSignal — abort khi menu đóng (mọi lý do): gắn listener với { signal }
}
```

`close` / `signal` thắng khoá trùng tên trong `opts.ctx`; `onSelect` / `when` của các mục khác không thấy chúng.

- **Bấm / nhập trong nội dung không đóng menu.** Muốn đóng sau khi chọn → gọi `ctx.close()`.
- **Dọn dẹp:** listener gắn với `{ signal: ctx.signal }` tự gỡ khi menu đóng; `signal` abort khi element **còn** trong
  DOM, trước `onClose`.
- `onSelect`, `href`, `icon`, `hint`, `danger`, `disabled`, `checked` trên item custom bị bỏ qua — nội dung tự lo.

#### Chỉ nhận Element (không nhận chuỗi HTML)

| `render` trả / làm | Kết quả |
|---|---|
| `Element` chưa gắn vào trang | Được đặt vào hàng **nguyên trạng** (không clone, không thêm attribute / class / style) |
| `null` / `undefined` | Không có hàng, không cảnh báo (như `when` → `false`) |
| Chuỗi (kể cả HTML) | Bỏ hàng + `console.warn` "…strings are not rendered (no HTML)" — **không bao giờ** thành DOM |
| Số, `DocumentFragment`, Text node, Promise… | Bỏ hàng + `console.warn` "…must return an Element" |
| Element **đang gắn** trong trang | Bỏ hàng + `console.warn` "…must return a detached Element" (đặt vào menu sẽ giật nó khỏi trang) |
| Ném lỗi | Bỏ hàng + `console.warn` "…render() threw — row omitted" (kèm lỗi) |

Mọi trường hợp bỏ hàng: `ctx.signal` của hàng đó abort ngay. Không còn hàng nào → `open()` trả `null`.

Markup viết sẵn → dùng `<template>` rồi **clone** (không `innerHTML` từ chuỗi):

```html
<template id="tpl-quick-note">
  <form class="quick-note"><td-input-field label="Ghi chú" name="note"></td-input-field>
    <td-button type="submit" variant="primary" size="sm">Lưu</td-button></form>
</template>
```

```js
{ type: 'custom', label: 'Ghi chú nhanh', render: ({ close, signal }) => {
  const form = document.importNode(document.getElementById('tpl-quick-note').content, true).firstElementChild;
  form.addEventListener('submit', (e) => { e.preventDefault(); saveNote(new FormData(form)); close(); }, { signal });
  return form;
} }
```

#### Công thức: chuyển theme trong menu tài khoản

Ghép mục custom với [segmented](choice-group.md#công-thức-chuyển-theme-tự-động--sáng--tối) và API theme của kit
(`data-td-theme` trên `<html>` + cookie, [Theming › Light / dark / auto](../customization/theming.md#light--dark--auto)).
Kit không có code theme riêng.

```js
import { TdMenu } from '@dazzxq/td-components/menu';
import '@dazzxq/td-components/choice-group';

const THEMES = [
  { value: 'auto', label: 'Tự động', icon: 'monitor' },
  { value: 'light', label: 'Sáng', icon: 'sun' },
  { value: 'dark', label: 'Tối', icon: 'moon' },
];
const currentTheme = () => {
  const v = document.documentElement.getAttribute('data-td-theme');
  return THEMES.some((t) => t.value === v) ? v : 'auto';
};

TdMenu.bind(profileCard, () => [
  { label: 'Hồ sơ', href: '/profile' },
  { separator: true },
  {
    type: 'custom', id: 'theme', label: 'Giao diện',
    render: ({ signal }) => {
      const g = document.createElement('td-choice-group');
      g.setAttribute('variant', 'segmented');
      g.setAttribute('size', 'sm');
      g.setAttribute('value', currentTheme());
      g.options = THEMES;                         // không đặt aria-label: hàng đã mang tên "Giao diện"
      g.addEventListener('change', (e) => {
        const v = e.detail.value;                 // 'auto' | 'light' | 'dark'
        document.documentElement.setAttribute('data-td-theme', v);
        document.cookie = `td_theme=${v}; path=/; max-age=31536000; SameSite=Lax`;
      }, { signal });                             // tự gỡ khi menu đóng
      return g;
    },
  },
  { separator: true },
  { label: 'Đăng xuất', icon: 'log-out', danger: true, onSelect: logout },
], { label: 'Tài khoản' });
```

- Đổi theme **không** đóng menu (người dùng thấy ngay kết quả); muốn đóng → `ctx.close()` trong `change`.
- Lần vẽ đầu đúng theme nhờ PHP in `data-td-theme` từ cookie đã whitelist + `theme-boot.js` (công thức ở
  [choice-group](choice-group.md#công-thức-chuyển-theme-tự-động--sáng--tối)); menu chỉ đổi attribute + cookie.
- `label` của item **hoặc** tên của widget, không cả hai (tránh trình đọc màn hình đọc "Giao diện" hai lần).

#### Menu panel: ngữ nghĩa và bàn phím

Một menu có hàng custom **không còn là `role="menu"` thuần** (ARIA không cho radio / ô nhập nằm trong menu). Kit chuyển
popup thành **menu panel** ([ADR 0026](../internal/decisions/0026-menu-panel-custom-rows.md)): hộp thoại không modal
(`role="dialog"`, tên = trigger / `label`), các mục thường nằm trong khúc `role="menu"` (giữ nguyên vai trò, `aria-checked`,
type-ahead), hàng custom là nhóm có tên. Trình đọc màn hình: "Tài khoản, hộp thoại" → "Hồ sơ, mục menu" → "Giao diện,
nhóm, Sáng, nút radio, đã chọn". Menu **không** có hàng custom giữ đúng markup và hành vi cũ.

| Phím | Trên mục thường | Trong nội dung custom |
|---|---|---|
| `↑` / `↓` | Hàng trước / sau (vòng lại). Hàng custom = **một điểm dừng**: vào ở control đầu (↓) / cuối (↑); nhóm radio vào ở radio đang chọn; hàng không có gì focus được (khối tĩnh) bị bỏ qua | Rời hàng — **trừ** control tự dùng ↑ ↓: ô chữ, `number`, `range`, `select`, `textarea`, `contenteditable`, `role` slider / spinbutton / listbox / combobox / textbox / tree / treegrid / grid, và mọi thứ trong `[data-td-menu-keys="content"]` |
| `←` `→` `Home` `End` `Enter` `Space`, gõ chữ | Như menu thường (Home / End, kích hoạt, type-ahead — bỏ qua hàng custom) | Của nội dung (segmented ← → đổi chọn ngay; td-tabs ← → Home End) |
| `Tab` / `Shift+Tab` | Điểm dừng kế / trước: **mỗi mục thường** + **mọi** control của hàng custom, theo thứ tự; qua mép → đóng, focus đi tiếp từ trigger (như menu thường) | như cột bên |
| `Escape` | Đóng, focus trigger | **Luôn đóng** (kể cả trong ô nhập), focus trigger. Popup con đang mở (dropdown) → Escape đầu đóng popup con |

- Bấm chuột / chạm vào control trong hàng: focus theo control đó ở mọi trình duyệt (Safari không tự focus radio / nút
  khi bấm — kit bù). Bấm vào caption / chữ tĩnh → focus panel (↓ đi tiếp được).
- Popup mở từ nội dung (`td-dropdown`, color picker…) được coi là bên trong panel: bấm trong danh sách của nó không đóng
  panel; panel đóng thì popup con đóng trước. Mở **`TdMenu` khác** từ nội dung sẽ đóng panel (một menu một lúc).
- Nội dung lớn lên / co lại (td-tabs đổi nội dung) → panel tự đặt lại vị trí.

## Property & method

Tất cả là static trên `TdMenu`.

| Chữ ký | Trả về | Mô tả |
|---|---|---|
| `TdMenu.open(anchor, items, opts?)` | `{ element, close(), isOpen } \| null` | Mở menu tại `anchor`. `items`: mảng, `(ctx) => mảng`, hoặc tên đã đăng ký. Trả `null` khi: không có DOM, anchor không phải `HTMLElement` / đã rời DOM, tên không tồn tại, không còn mục nào hiển thị, hoặc đây là lần gọi toggle đóng |
| `TdMenu.close()` | `void` | Đóng menu đang mở (lý do `'api'`); không có menu → không làm gì |
| `TdMenu.isOpen(anchor?)` | `boolean` | Có menu nào mở không; truyền `anchor` → chỉ hỏi menu của anchor đó |
| `TdMenu.bind(trigger, items, opts?)` | `() => void` (unbind) | Nối nút của bạn: ARIA, click toggle (focus mục đầu), `ArrowDown`/`ArrowUp` mở (focus mục đầu/cuối). Nút nằm trong link card: click bị `preventDefault` để không điều hướng. Unbind: gỡ listener, đóng menu của nút nếu đang mở, khôi phục ARIA ban đầu |
| `TdMenu.button(opts?)` | `HTMLButtonElement` | Tạo nút `.td-menu-btn` đã bind. `opts`: `icon`, `label`, `ariaLabel`, `items` \| `getItems`, cộng mọi tuỳ chọn của `open()` |
| `TdMenu.define(name, items)` | `() => void` (undefine) | Khai báo / thay danh sách base của menu tên `name`. Tham số sai → `console.warn` + no-op |
| `TdMenu.register(name, item \| item[], { order?, group? })` | `() => void` (unregister) | Thêm mục vào menu tên `name` (trước hay sau `define` đều được) |
| `TdMenu.has(name)` | `boolean` | Tên có danh sách base hoặc mục đăng ký |
| `TdMenu.bindAll(root = document)` | `() => void` | Trigger khai báo `[data-td-menu="tên"]` trong `root` (event delegation — trigger thêm sau vẫn chạy). Idempotent theo root (gọi lại trả cùng unbind). Trigger đã `bind()` bị bỏ qua; trigger `disabled` / `aria-disabled="true"` không mở |
| `TdMenu.labels` | `{ trigger: 'Tùy chọn' }` | Nhãn mặc định, ghi đè theo site: `TdMenu.labels.trigger = 'Options'` |

Named export phụ: `safeMenuHref(href, page = location)` → chuỗi href an toàn hoặc `null` (đúng hàm kit dùng để lọc
`href`, xem [Bảo mật](#bảo-mật)); `sanitizeDownloadName(name)` → tên file đã lọc cho `download` (0.17.0).

### Tuỳ chọn của `open()` / `bind()` / `button()`

| Tuỳ chọn | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `align` | `'start' \| 'center' \| 'end'` | `'end'` | Căn menu theo cạnh của anchor (end = mép phải menu thẳng mép phải nút) |
| `side` | `'bottom' \| 'top'` | `'bottom'` | Phía ưu tiên; tự lật khi không đủ chỗ |
| `label` | `string` | — | Có → menu dùng `aria-label`; không có → `aria-labelledby` trỏ tới id của anchor (kit tự gán id `td-menu-trigger-{n}` nếu anchor chưa có) |
| `focus` | `'first' \| 'last'` | `'first'` | Mục được focus khi mở (bỏ qua mục disabled; nếu tất cả disabled thì vẫn focus mục đầu/cuối) |
| `onClose` | `(reason) => void` | — | Gọi sau khi đóng. `reason`: `'select'`, `'escape'`, `'tab'`, `'outside'`, `'hidden'`, `'api'`. Lỗi trong hàm được log, không ném ra |
| `ctx` | `object` | — | Dữ liệu ngữ cảnh (xem [ctx](#6-ngữ-cảnh-ctx)) |
| `isAllowedUrl` | `(url) => boolean` | — | Chính sách URL riêng cho `href` của menu này: **thay** bộ lọc mặc định `safeMenuHref` (bạn chịu trách nhiệm). `false` / ném lỗi → mục disabled. `javascript:` luôn bị chặn. Xem [Mục tải xuống](#mục-tải-xuống-download) |
| `themeRoot` | `Element` | — | 0.42.0: hiển thị theo theme của vùng `[data-td-theme]` chứa phần tử này ([theming › Theme theo vùng](../customization/theming.md#popup-mở-từ-trong-vùng), ADR 0020). Không truyền → theme của trang. |

Trigger khai báo qua `bindAll()` luôn mở với tuỳ chọn mặc định (align `end`, không `onClose`); cần tuỳ chọn riêng thì
dùng `bind()`.

## Hook & tuỳ chọn

### Định dạng item

| Thuộc tính | Kiểu | Mô tả |
|---|---|---|
| `label` | `string` | **Bắt buộc** (trừ `type: 'custom'`, ở đó là caption tuỳ chọn). Chữ hiển thị, luôn là text (`textContent`). Item không có label bị bỏ |
| `onSelect` (alias `onClick`) | `(ctx) => void \| Promise` | Gọi khi chọn. Lỗi hoặc promise reject được `console.error`, không phá menu. Promise **không được await** |
| `href` | `string` | Biến mục thành `<a>`. Chỉ `https:`, `http:` (khi trang là http) hoặc URL tương đối (hoặc theo option `isAllowedUrl` nếu có). Khác → mục disabled + warn |
| `newTab` | `boolean` | Link mở tab mới: `target="_blank" rel="noopener noreferrer"` |
| `download` | `true \| string` | Chỉ với `href`: link thành `<a download>`. Chuỗi = tên file (đã lọc); `true` = trình duyệt tự đặt tên theo URL |
| `icon` | `string` | Tên icon trong registry (`hasIcon`). Không có → bỏ qua icon, không lỗi |
| `iconNode` | `SVGElement` | SVG bạn tự dựng (tin cậy), được **clone**, gắn `aria-hidden`. Chỉ dùng khi không có `icon` hợp lệ |
| `hint` | `string` | Dòng phụ dưới label (phím tắt, mô tả), là text; trở thành `aria-describedby` |
| `danger` | `boolean` | Kiểu nguy hiểm (màu `--td-menu-danger-fg`) |
| `disabled` | `boolean` | `aria-disabled="true"`: vẫn focus được bằng phím (theo APG) nhưng không kích hoạt được |
| `type` | `'item' \| 'checkbox' \| 'radio' \| 'custom'` | Mặc định `'item'`. `'custom'` (0.53.0): hàng nội dung tuỳ biến — xem [mục 7](#7-mục-tuỳ-biến--type-custom-0530); giá trị lạ khác (vd. `'segmented'`) = `'item'` |
| `render` | `(ctx) => Element \| null` | Chỉ với `type: 'custom'` (bắt buộc): dựng nội dung của hàng, gọi mỗi lần mở |
| `checked` | `boolean` | Trạng thái của checkbox/radio lúc mở |
| `group` | `string` | Khoá nhóm radio (mặc định `''`) |
| `id` | `string` | Xuất ra `data-item="{id}"` trên phần tử mục (để test/style) |
| `order` | `number` | Chỉ dùng trong registry (menu đặt tên) |
| `when` | `(ctx) => boolean` | Ẩn mục khi trả `false` |
| `{ separator: true }` | — | Đường kẻ phân cách |

`href` chỉ có tác dụng với `type: 'item'`. Mục link vẫn gọi `onSelect` (sau khi trình duyệt bắt đầu điều hướng, với
`ctx.checked = false`).

### Mục tải xuống (`download`)

```js
TdMenu.open(button, [
  { label: 'Ảnh gốc', href: '/media/42/original.jpg', download: 'anh-goc.jpg' },
  { label: 'Ảnh nhỏ', href: '/media/42/small.jpg', download: true }, // tên file lấy từ URL
]);

// Scheme mà bộ lọc mặc định từ chối (blob:, …): truyền chính sách của bạn — nó THAY bộ lọc mặc định.
TdMenu.open(button, [{ label: 'Bản xuất', href: blobUrl, download: 'bao-cao.csv' }], {
  isAllowedUrl: (url) => url.startsWith('blob:') || safeMenuHref(url) !== null,
});
```

- Tên file được lọc: bỏ `/ \ : * ? " < > |` và ký tự điều khiển, cắt dấu chấm / khoảng trắng hai đầu, tối đa 200 ký
  tự. Lọc xong rỗng → `download` không giá trị (trình duyệt tự đặt tên). Export phụ `sanitizeDownloadName(name)`.
- `download` chỉ có hiệu lực khi `href` được chấp nhận (mục bị chặn là nút disabled, không có `download`).
- Trình duyệt chỉ tôn trọng `download` với URL **cùng origin** (hoặc `blob:` / `data:`); URL khác origin thì điều
  hướng bình thường — cần tải file khác origin thì trỏ qua proxy của site.

## Tuỳ biến giao diện

Token khai báo trong `@layer td.tokens` trên `:root`:

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-menu-min-w` | `13rem` | Chiều rộng tối thiểu của menu |
| `--td-menu-max-w` | `22rem` | Chiều rộng tối đa (luôn ≤ `100vw - 16px`) |
| `--td-menu-item-py` | `0.6rem` | Padding dọc của mục |
| `--td-menu-item-px` | `0.75rem` | Padding ngang của mục (và lề của separator) |
| `--td-menu-item-hover` | `var(--td-color-hover)` | Nền khi hover |
| `--td-menu-item-active` | `var(--td-color-hover-strong)` | Nền khi focus bằng phím |
| `--td-menu-danger-fg` | `var(--td-color-error)` | Màu chữ mục `danger` |
| `--td-menu-hint-fg` | `var(--td-color-text-muted)` | Màu `hint` |
| `--td-menu-icon-fg` | `var(--td-color-text-muted)` | Màu icon |
| `--td-menu-separator` | `var(--td-color-border)` (dark: `rgb(255 255 255 / 12%)`) | Màu separator |
| `--td-menu-btn-fg` | `var(--td-color-text-muted)` | Màu nút `.td-menu-btn` |
| `--td-menu-btn-fg-hover` | `var(--td-color-text)` | Màu nút khi hover / đang mở |
| `--td-menu-btn-hover` | `var(--td-color-hover)` | Nền nút khi hover / đang mở |
| `--td-menu-btn-size` | `32px` | Kích thước tối thiểu của nút (thiết bị cảm ứng: `--td-touch-min`) |

Menu là popup nhỏ (`.td-glass-surface--strong`, 0.20.0): nền 94 % + `blur(12px)` + viền mảnh + một bóng mềm; padding
`--td-glass-pad`, bo góc `--td-glass-radius`, mục bo góc đồng tâm `--td-glass-radius-inner`. Mở ra bằng fade (không
phóng to). Bỏ blur toàn site bằng `<html data-td-glass="off">` (xem
[Theming](../customization/theming.md)).

```css
/* site.css — CSS không nằm trong layer luôn thắng @layer td.* */
:root {
  --td-menu-min-w: 15rem;
  --td-menu-danger-fg: #b42318;
}
```

JS chỉ ghi hình học (top/left, max-height) qua CSSOM. Menu cao tối đa `min(chiều cao viewport − 16px, 448px)`, dài hơn
thì tự cuộn bên trong.

## Cấu trúc DOM & class

Menu (tạo khi mở, gỡ khi đóng; `{m}` = `td-menu-{n}`):

```html
<div class="td-menu td-glass-surface td-glass-surface--strong" id="{m}" role="menu"
     aria-labelledby="{id trigger}" data-state="open" data-placement="bottom" data-align="end">
  <button type="button" class="td-menu__item" role="menuitem" tabindex="-1"
          aria-labelledby="{m}-label-0" aria-describedby="{m}-hint-0" data-item="share">
    <span class="td-menu__label" id="{m}-label-0">Chia sẻ</span>
    <span class="td-menu__icon" data-td-icon="link" aria-hidden="true"><svg class="td-icon td-icon--m" data-icon="link" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span>
    <span class="td-menu__hint" id="{m}-hint-0">Sao chép liên kết</span>
  </button>
  <button type="button" class="td-menu__item td-menu__item--danger" role="menuitem" tabindex="-1">…</button>
  <div class="td-menu__separator" role="separator"></div>
  <button type="button" class="td-menu__item" role="menuitemcheckbox" tabindex="-1" aria-checked="true">
    <span class="td-menu__label">Chế độ tối</span>
    <span class="td-check td-check--sm td-menu__check" aria-hidden="true"><svg class="… td-check__svg" data-icon="check" …/></span>  <!-- 0.36.0 -->
  </button>
  <button type="button" class="td-menu__item" role="menuitemradio" tabindex="-1" aria-checked="false">
    <span class="td-menu__label">Dạng lưới</span>
    <span class="td-menu__check" data-td-icon="check" aria-hidden="true"><svg …/></span>                <!-- radio: ✓ trần -->
  </button>
  <a class="td-menu__item" role="menuitem" tabindex="-1" href="https://example.com/"
     target="_blank" rel="noopener noreferrer"><span class="td-menu__label">Mở trang</span></a>
  <a class="td-menu__item" role="menuitem" tabindex="-1" href="/media/42/original.jpg"
     download="anh-goc.jpg"><span class="td-menu__label">Ảnh gốc</span></a>
</div>
```

Menu panel (0.53.0 — khi có ít nhất một hàng `type: 'custom'`):

```html
<div class="td-menu td-menu--panel td-glass-surface td-glass-surface--strong" id="{m}" role="dialog" tabindex="-1"
     aria-labelledby="{id trigger}" data-state="open" data-placement="bottom" data-align="end">
  <div class="td-menu__section" role="menu">            <!-- dãy mục thường liền nhau; markup mục như trên -->
    <button type="button" class="td-menu__item" role="menuitem" tabindex="-1">…</button>
  </div>
  <div class="td-menu__separator" role="separator"></div>   <!-- separator giáp hàng custom: ở cấp panel -->
  <div class="td-menu__custom" role="group" aria-labelledby="{m}-c{i}-label" data-item="theme">
    <div class="td-menu__custom-label" id="{m}-c{i}-label">Giao diện</div>   <!-- chỉ khi có label -->
    <!-- Element của bạn, nguyên trạng -->
  </div>
  <div class="td-menu__section" role="menu">…</div>
</div>
```

Hàng không có `label`: `<div class="td-menu__custom">` (không `role`, không caption). Trigger: `aria-haspopup="dialog"` sau
lần mở dựng được hàng custom.

| Selector / attribute | Ý nghĩa |
|---|---|
| `.td-menu[data-placement="bottom\|top"]` | Phía thực tế sau khi tự lật |
| `.td-menu[data-align="start\|center\|end"]` | Căn lề |
| `.td-menu__item[aria-disabled="true"]` | Mục disabled |
| `.td-menu__item[aria-checked="true"] .td-menu__check` | Radio: dấu ✓ hiện |
| `.td-menu__check.td-check` | 0.36.0: mục checkbox — ô tick chung, luôn hiện; trạng thái từ `aria-checked` (`check.css`) |
| `.td-menu__item--danger` | Mục nguy hiểm |
| Trigger `[aria-expanded="true"]` | Menu của trigger đang mở (`.td-menu-btn` tô nền) |
| `.td-menu--panel` | 0.53.0: menu panel (có hàng custom) |
| `.td-menu__section` / `.td-menu__custom` / `.td-menu__custom-label` | 0.53.0: khúc mục thường / hàng custom (padding = mục, không nền, không hover) / caption (`--td-color-text-label`) |

Nút do `TdMenu.button()` tạo (site render server-side có thể in đúng markup này rồi `bind()` hoặc dùng `data-td-menu`):

```html
<button type="button" class="td-menu-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Tùy chọn">
  <span class="td-menu-btn__icon" data-td-icon="more" aria-hidden="true"><svg class="td-icon td-icon--m" data-icon="more" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg></span>
  <span class="td-menu-btn__label">Thêm</span>  <!-- chỉ khi có label -->
</button>
```

Trên server (nút mở menu có sẵn trong HTML, dùng với `bind()` hoặc `data-td-menu`), in nút như trên nhưng để **slot
rỗng** `<span class="td-menu-btn__icon" data-td-icon="more" aria-hidden="true"></span>` rồi gọi `fillIconSlots(root)`
(từ `@dazzxq/td-components/icons` hoặc barrel) khi DOM sẵn sàng; hoặc in thẳng icon bằng `<?= td_icon('more') ?>` của
[adapter PHP](../guides/php-adapter.md) bên trong `.td-menu-btn__icon` (xem
[Icons › markup render sẵn](icons.md#icon-trong-markup-render-sẵn)). Phần `.td-menu` luôn do JS tạo khi mở — server không
in nó. Menu không có helper PHP; markup chuẩn là các khối ở trên. Fixture `test/contracts/menu.html` trong repo kit chỉ
dùng cho test (không nằm trong gói npm, icon trong đó viết tắt).

### Trigger dùng chung (ownership)

Một trigger có thể được cả `bind()` lẫn một hay nhiều `bindAll()` root "sở hữu" cùng lúc. Kit chụp **một** bản sao
các attribute gốc (`id`, `aria-haspopup`, `aria-expanded`, `aria-controls`) khi chủ sở hữu đầu tiên nhận trigger, và
chỉ khôi phục khi **chủ sở hữu cuối cùng** buông. Nhờ vậy gỡ một binding không làm mất ARIA mà binding khác còn dùng.
Về sự kiện: trigger đã `bind()` thì `bindAll()` bỏ qua click/phím của nó; root lồng nhau không bao giờ xử lý cùng một
click hai lần. `bindAll()` gắn ARIA cho trigger có sẵn ngay khi gọi, và cho trigger thêm sau khi chúng nhận focus / bị
rê chuột / được bấm.

## Bàn phím & trợ năng

| Ở đâu | Phím | Hành vi |
|---|---|---|
| Trigger (`bind` / `bindAll`) | `Enter` / `Space` (nút `<button>` thật), click | Mở/đóng, focus mục đầu |
| Trigger | `ArrowDown` / `ArrowUp` | Mở, focus mục đầu / mục cuối |
| Trong menu | `ArrowDown` / `ArrowUp` | Mục sau / trước (vòng lại), kể cả mục disabled |
| Trong menu | `Home` / `PageUp`, `End` / `PageDown` | Mục đầu / cuối |
| Trong menu | Gõ chữ | Type-ahead: nhảy tới mục bắt đầu bằng chuỗi vừa gõ (reset sau 500 ms), không phân biệt dấu (`đ` = `d`, `ồ` = `o`); gõ lặp một chữ thì vòng qua các mục |
| Trong menu | `Enter` / `Space` | Kích hoạt mục. Mục link: `Enter` theo link tự nhiên, `Space` bấm link |
| Trong menu | `Escape` | Đóng, focus về trigger (phím được "tiêu thụ", không lọt xuống modal bên dưới) |
| Trong menu | `Tab` / `Shift+Tab` | Đóng và đi tiếp: focus rơi vào phần tử **sau / trước** trigger (không quay lại trigger). Trong modal, focus trap của modal tiếp tục |

- Menu panel (có hàng `type: 'custom'`, 0.53.0): bảng phím riêng ở [mục 7](#menu-panel-ngữ-nghĩa-và-bàn-phím) — Tab đi qua
  các điểm dừng thay vì đóng ngay, phím trong nội dung thuộc về nội dung.
- Focus thật di chuyển giữa các mục (roving focus, `tabindex="-1"`).
- Chọn một mục thường/radio: đóng menu, **focus trigger trước** rồi mới gọi `onSelect` — nên nếu `onSelect` mở một
  `TdModal`, modal đóng sẽ trả focus về trigger.
- Tên truy cập của mục = label; `hint` là mô tả (`aria-describedby`), không bị đọc lặp.
- Bấm chuột ra ngoài (`pointerdown`) đóng menu và **cú bấm vẫn có tác dụng** (không bị nuốt).
- Anchor bị cuộn khuất hoặc bị gỡ khỏi DOM → menu đóng (lý do `'hidden'`). Cuộn **bên trong** menu dài không đóng menu.
- Menu nằm ở lớp `--td-z-popover` (450): dùng được **trên** `TdModal` và trên lightbox. Menu mở trên modal giữ
  bề mặt của nó; dialog luôn nền đặc.
- `prefers-reduced-motion`: fade nhanh tuyến tính. `forced-colors`: viền và focus theo màu hệ thống. Thiết bị cảm ứng:
  mục cao tối thiểu `--td-touch-min` (44px).

## Bảo mật

- `label`, `hint`, giá trị `data-td-menu-*`: **luôn là text**, không bao giờ qua `innerHTML`. Có thể truyền thẳng dữ
  liệu người dùng.
- `href` qua `safeMenuHref()`: chuỗi được chuẩn hoá như trình duyệt (bỏ ký tự điều khiển, tab/xuống dòng) rồi resolve;
  chỉ nhận `https:`, hoặc `http:` khi chính trang đang là `http:` (không hạ cấp từ HTTPS). `javascript:`, `data:`,
  `mailto:`, `tel:`, chuỗi không parse được → mục **disabled** + `console.warn`. Cần gửi mail / gọi điện → dùng
  `onSelect`:

  ```js
  { label: 'Gửi email', onSelect: () => { location.href = 'mailto:' + encodeURIComponent(email); } }
  ```

- Option `isAllowedUrl` **thay** `safeMenuHref` cho menu đó: chính sách lỏng (ví dụ trả `true` cho mọi URL) là lỗ
  hổng của bạn. Ghép với `safeMenuHref` và chỉ mở thêm đúng scheme cần (`blob:`). Kit vẫn luôn chặn `javascript:`;
  chính sách ném lỗi → URL bị chặn.
- Tên file `download` luôn được lọc (không có ký tự đường dẫn / điều khiển), kể cả khi lấy từ dữ liệu người dùng.

- `iconNode` là **DOM tin cậy**: chỉ truyền SVG do code của bạn dựng; kit clone nó nguyên trạng.
- Mục `type: 'custom'` (0.53.0): `render(ctx)` trả **Element** — DOM tin cậy của bạn, kit đặt nguyên trạng, không
  sanitize. **Chuỗi bị từ chối** (không có đường HTML). Dữ liệu người dùng vào nội dung qua `textContent` / attribute như
  mọi Node hook; nội dung phải sạch CSP (không `style="…"`, không `<style>`). `label` của item custom là text.
- `when()` chỉ ẩn mục trên giao diện, **không phải phân quyền**. Server vẫn phải kiểm tra quyền khi xử lý hành động.

Xem thêm [Hướng dẫn bảo mật](../guides/security.md).

## Cảm ứng

- Mục menu và nút mở menu có hình nhấn (`--td-option-pressed-bg`); hover chỉ trên con trỏ mịn. Mục disabled không có hình nhấn.

Chuẩn chung: [Cảm ứng](../guides/touch.md).

## Lưu ý & lỗi thường gặp

- **Menu đi theo "chủ" của nó (0.21.1).** Popup tự đóng khi trigger bị khung cuộn cắt, bị ẩn mà không cần
  cuộn (chuyển tab, accordion đóng, `display: none`), bị gỡ khỏi DOM, hoặc khi một modal / lightbox **mới** mở đè lên
  bằng code (timer, hết phiên…) — focus đi vào lớp mới, popup không còn bấm xuyên được. Modal / lightbox chứa trigger
  đóng → popup đóng ngay (không đợi hiệu ứng thoát). Mở popup lúc modal đang chạy hiệu ứng vào (vd. trong `onShow`)
  → vị trí được đặt lại khi hiệu ứng kết thúc.
- **Escape thuộc về popup, không thuộc tooltip hover (0.21.1).** Đang trỏ chuột lên một nút có tooltip rồi mở popup
  bằng bàn phím: Escape đầu tiên đóng popup, lần sau mới đóng tooltip.
- **Mở từ nút trong hovercard (0.21.1):** hovercard giữ mở khi menu con đang mở; chọn mục → focus về nút trong
  card. Hovercard đóng → menu con đóng trước. `onClose(reason)` có thêm `'covered'` (modal / lightbox mới phủ lên,
  hoặc dialog / hovercard chứa anchor đóng); anchor bị gỡ / ẩn → `'hidden'`, focus không rơi về `<body>`.
- **Checkbox "không nhớ" trạng thái**: đúng thiết kế — kit không sửa item của bạn. Lưu `ctx.checked` vào model và
  dựng lại item từ model (dùng `() => items`).
- **`open()` trả `null`** khi: tên menu chưa đăng ký (xem console), mọi mục bị `when` ẩn, mục nào cũng thiếu `label`,
  anchor chưa gắn vào DOM, hoặc bạn vừa gọi lại `open()` trên anchor đang mở (toggle đóng).
- **Trigger khai báo không mở**: bạn chưa gọi `TdMenu.bindAll()` (không có gì chạy khi import), trigger nằm ngoài
  `root`, trigger `disabled`, hoặc giá trị `data-td-menu` rỗng.
- **Trigger không phải `<button>`**: `bindAll()` không tự thêm `tabindex` hay xử lý `Enter`; hãy dùng `<button>` thật.
- **`ctx.postId` là chuỗi**, không phải số, khi lấy từ `data-td-menu-post-id`.
- `onSelect` async: kit không chờ promise; lỗi reject chỉ được log. Tự hiển thị lỗi (ví dụ `TdToast`) trong hàm.
- Link `mailto:` / `tel:` bị disabled là **cố ý** (fail closed).
- **Mục custom (0.53.0):**
  - **`aria-haspopup` trước lần mở đầu:** `bind()` / `bindAll()` đặt `"menu"`; chỉ sau khi một lần mở dựng được hàng
    custom thì trigger mới báo `"dialog"` (kit không đoán trước — `when` / `render` có thể bỏ hàng). Cần đúng ngay từ
    đầu: tự đặt `aria-haspopup="dialog"` trên trigger và mở bằng `TdMenu.open()` (kit không đổi attribute do bạn đặt).
  - **Escape luôn đóng menu**, kể cả khi focus đang ở ô nhập trong nội dung (widget không nhận được Escape để xoá ô).
  - **Shadow DOM:** control trong shadow root **mở** (kể cả `delegatesFocus`, slot) đi được bằng ↑ ↓ / Tab của menu.
    Shadow root **đóng**: kit chỉ thấy host — host có `tabindex` thì là một điểm dừng, không thì control bên trong
    **không** vào được bằng phím của menu (chuột vẫn được). Tránh shadow root đóng trong nội dung menu.
  - Không có `type: 'segmented'`: dùng `type: 'custom'` + `td-choice-group` (công thức ở mục 7).
  - Form dài / nhiều bước, ô nhập chữ trên điện thoại (bàn phím ảo làm co khung nhìn) → dùng [`TdModal`](modal.md) /
    [drawer](drawer.md), không nhồi vào menu.

## Xem thêm

- [Hook & tuỳ chọn theo component](../customization/hooks.md) · [Mở rộng: menu registry, icon](../customization/extending.md)
- [Icons](icons.md) (tên dùng cho `icon`) · [Modal](modal.md) · [Hovercard](hovercard.md) · [Lightbox](lightbox.md)
  (mở menu từ nút toolbar)
- [Trợ năng](../guides/accessibility.md) · [Bảo mật](../guides/security.md) · [Theming](../customization/theming.md)
