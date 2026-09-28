[Tài liệu](../README.md) › Tuỳ biến › Hook, callback và option

# Danh mục hook, callback và option

Triết lý của kit: **lõi nhỏ + hook**. Chỗ nào mỗi site làm khác nhau (tải file qua proxy, lọc HTML, thêm mục menu từ
plugin, gọi API tìm kiếm, dịch nhãn…) thì kit không đoán, mà mở một hook để site tự cắm code vào. Trang này liệt kê
**mọi** hook / callback / option / object nhãn của từng component, kèm chữ ký, giá trị trả về, thời điểm được gọi và
**điều gì xảy ra khi hook ném lỗi** — rồi đến 8 công thức dùng thực tế.

Nguồn sự thật là source code (`src/**`); mỗi dòng dưới đây đối chiếu với file JS tương ứng; nếu tài liệu và source lệch nhau, tin source.

## Mục lục

- [Bốn loại điểm tuỳ biến](#bốn-loại-điểm-tuỳ-biến)
- [Quy ước chung](#quy-ước-chung)
- Danh mục theo component
  - [TdLightbox](#tdlightbox)
  - [TdHovercard](#tdhovercard)
  - [TdMenu](#tdmenu)
  - [TdModal và TdModalStackManager](#tdmodal-và-tdmodalstackmanager)
  - [TdToast](#tdtoast)
  - [TdLoading và TdLoadingSpinner](#tdloading-và-tdloadingspinner)
  - [Tooltip](#tooltip)
  - [td-dropdown](#td-dropdown)
  - [td-chip-input](#td-chip-input)
  - [td-datetime-picker](#td-datetime-picker)
  - [Hợp đồng lỗi của mọi form control](#hợp-đồng-lỗi-của-mọi-form-control)
  - [TdFormValidation](#tdformvalidation)
  - [td-table](#td-table)
  - [td-tabs](#td-tabs)
  - [td-empty-state](#td-empty-state)
  - [Component không có hook JS](#component-không-có-hook-js)
  - [Icon](#icon)
- [Công thức (recipes)](#công-thức-recipes)
  1. [Lightbox: tải ảnh qua proxy cùng origin](#1-lightbox-tải-ảnh-qua-proxy-cùng-origin)
  2. [Hovercard: lọc HTML bằng sanitize + xoá cache khi đăng xuất](#2-hovercard-lọc-html-bằng-sanitize--xoá-cache-khi-đăng-xuất)
  3. [Menu: plugin thêm mục vào menu của lõi](#3-menu-plugin-thêm-mục-vào-menu-của-lõi)
  4. [Toast: thời lượng riêng, toast dính, vị trí](#4-toast-thời-lượng-riêng-toast-dính-vị-trí)
  5. [Form: lỗi từ server (Laravel 422)](#5-form-lỗi-từ-server-laravel-422)
  6. [Chip-input: gợi ý từ API + tạo mục mới](#6-chip-input-gợi-ý-từ-api--tạo-mục-mới)
  7. [Table: server mode (sắp xếp và phân trang ở server)](#7-table-server-mode-sắp-xếp-và-phân-trang-ở-server)
  8. [Nhãn tiếng Anh cho một site](#8-nhãn-tiếng-anh-cho-một-site)

## Bốn loại điểm tuỳ biến

| Loại | Trông như | Phạm vi | Ví dụ |
|---|---|---|---|
| **Option của API tĩnh** | object truyền vào hàm | một lần gọi | `TdLightbox.open(items, { download })`, `TdModal.show({ onClose })` |
| **Property callback của element** | gán hàm vào property | một element | `dropdown.onChange = fn`, `chip.search = fn` |
| **Cấu hình tĩnh toàn cục** | gán vào `static` của class | cả trang, mọi instance | `TdMenu.labels.trigger = 'Options'`, `TdHovercard.sanitize = fn`, `TdToast.MAX_VISIBLE = 3` |
| **Event DOM** | `addEventListener` | một element / document | `change`, `sort-change`, `td-lightbox-change` |

Event không phải hook (bạn không thay đổi được hành vi), nhưng thường là cách sạch nhất để "nghe" component. Bảng
event đầy đủ ở mục **Event** của từng trang component.

## Quy ước chung

- **Nội dung là Node hay chuỗi?** Hook trả về nội dung hiển thị luôn chấp nhận **Node** (bạn tự dựng bằng DOM API) —
  đây là cách được khuyên dùng. Chuỗi được xử lý khác nhau theo component: **text** (an toàn) ở menu, chip-input,
  toast, lightbox caption; **HTML tin cậy** (`innerHTML`) ở `TdHovercard` content / URL fragment, `TdModal` `body`,
  `messageHtml`, cột `render` của `td-table`. Chuỗi HTML tin cậy **chỉ** dành cho markup do developer viết, không bao
  giờ chứa dữ liệu người dùng chưa escape. Chi tiết: [../guides/security.md](../guides/security.md).
- **URL** mà hook trả về (lightbox download, href của menu) luôn đi qua bộ lọc: `https:` luôn được; `http:` chỉ khi
  chính trang là `http:`; scheme khác bị từ chối (lightbox và menu — option `isAllowedUrl` — cho phép mở rộng).
- **Lỗi trong hook**: phần lớn hook được bọc `try/catch` và "fail closed" (ẩn nút, bỏ nội dung, hiện trạng thái lỗi).
  Callback của element dropdown, tabs, table (từ 0.16.0) được bọc: lỗi ghi `console.error`, luồng và event phía sau
  vẫn chạy. Cột "Lỗi thì sao" cho biết chính xác.
- **Hook bất đồng bộ**: chỉ những hook ghi rõ "Promise" mới được `await`. Promise trả về từ hook khác bị bỏ qua.

---

## TdLightbox

`import { TdLightbox } from '@dazzxq/td-components/lightbox';` · Trang: [lightbox.md](../components/lightbox.md)

API: `TdLightbox.open(items, options) → handle | null`, `TdLightbox.bind(root = document, options) → unbind`,
`TdLightbox.close()`, `TdLightbox.isOpen`.

`ctx` dùng chung cho `panel`, `download`, `downloads`, nút toolbar:
`{ index, count, item, token, handle, itemEl, groupEl }` (`itemEl` = phần tử nguồn khi mở bằng `bind()`, `groupEl` =
phần tử nhóm `[data-td-lightbox-group]` hoặc `options.groupEl`; cả hai `null` khi không có).

### Option của `open()` (và của `bind()`, áp cho mọi gallery nó mở)

| Option | Chữ ký / kiểu | Trả về | Khi nào gọi | Lỗi thì sao |
|---|---|---|---|---|
| `index` | `number` | — | Lúc mở: ảnh bắt đầu (kẹp vào khoảng hợp lệ, mặc định 0) | — |
| `download` | `(item, ctx) => string` | URL tải, hoặc `''` để ẩn nút | Mỗi lần đổi slide | Ném lỗi → coi như `''` (ẩn nút). URL trả về còn phải qua `isAllowedUrl` |
| `downloads` | `(item, ctx) => Array<{ label, url, filename? }>` | Các biến thể tải | Mỗi lần đổi slide (0.17.0). Có cả `download` → `downloads` thắng | Ném lỗi / không phải mảng → rỗng. Từng `url` lọc qua `isAllowedUrl(url, item)` **trước**, rồi: 0 → ẩn nút; 1 → link tải thường; ≥ 2 → nút mở `TdMenu` các `<a download>` (`filename` đã lọc, thiếu → `download` không tên). Menu đóng khi đổi ảnh / đóng lightbox |
| `video` | `(item, mount, { signal }) => player \| null \| Promise<player \| null>` với `player = { destroy() }` | Đối tượng player có `destroy()` | Slide `type: 'video'` | Ném / reject → `console.error`, hiện `poster` như ảnh. Trả `null` hoặc thiếu `destroy` → cũng về poster. `signal` bị abort khi đổi slide / đóng |
| `panel` | `true` \| `false` \| `(ctx) => Element \| null` | Element hiển thị ở panel thông tin | Mỗi lần đổi slide và khi `handle.refreshPanel()` | Ném lỗi hoặc trả chuỗi → không có panel. `true` = hiện `caption` làm text |
| `toolbar` | `Array<ToolbarSpec>` | — | Lúc mở (thay toàn bộ nút thêm của lần mở trước) | Spec thiếu `id` / `onClick` bị bỏ qua. Trùng `id` trong cùng danh sách: cái đầu thắng |
| `isAllowedUrl` | `(url, item) => boolean` | `true` = cho phép | Với `src`, `poster` của mọi item lúc mở, và URL tải | Ném lỗi → URL bị từ chối. Mặc định: `defaultIsAllowedUrl` (https; http chỉ khi trang là http) |
| `isForeignLayerOpen` | `() => boolean` | `true` = có lớp của site đang nằm trên lightbox | Mỗi phím bấm | Ném lỗi → `false`. Mặc định: có lớp td cao hơn hoặc có modal đang mở |
| `closeOnBackdrop` | `boolean` | — | Click nền | Mặc định `true`; `false` = click nền không đóng |
| `history` | `true` \| `{ push(token), back(), onPop(cb) => unsubscribe }` | `push` / `back` có thể trả Promise | Mở (push), đóng (back), nút Back của trình duyệt (onPop) | `push` ném / reject → lần mở này chạy không có history. `back` ném → bỏ qua. `true` = adapter có sẵn dùng `history.pushState` |
| `labels` | object, xem dưới | — | Lúc mở | Khoá không phải chuỗi bị bỏ qua (dùng mặc định) |
| `groupEl` | `Element` | — | Lúc mở: đưa vào `ctx.groupEl` và detail của event | Không phải Element → `null` |

`labels` của lightbox (theo từng lần `open` / `bind`, không có object tĩnh):

| Khoá | Mặc định |
|---|---|
| `dialog` | `Trình xem ảnh` |
| `prev` | `Ảnh trước` |
| `next` | `Ảnh sau` |
| `close` | `Đóng` |
| `back` | `Quay lại` |
| `fullscreen` | `Toàn màn hình` |
| `download` | `Tải xuống` |
| `info` | `Thông tin ảnh` |
| `counter` | `(i, n) => \`${i} / ${n}\`` (hàm; `i` bắt đầu từ 1) |

### Option chỉ có ở `bind()`

| Option | Kiểu | Ý nghĩa | Lỗi thì sao |
|---|---|---|---|
| `attrPrefix` | `string` (mặc định `'td'`) | Đọc `data-{prefix}-lightbox-*`, ví dụ `'dwp'` cho markup dwp. Phải khớp `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` | Sai định dạng → `console.warn`, dùng `'td'` |
| `filter` | `(el, event) => boolean` | Trả `false` để để yên click đó (không mở lightbox) | Ném lỗi → `console.warn`, click bị bỏ qua (coi như `false`) |

### ToolbarSpec (option `toolbar` và `handle.addToolbarButton`)

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id` | `string` (bắt buộc) | Khoá duy nhất |
| `onClick` | `(ctx, button) => void` (bắt buộc) | Ném lỗi → `console.error`, lightbox vẫn chạy |
| `label` | `string` | `aria-label` + `title`; thiếu thì dùng `id` |
| `icon` | `string` | Tên icon trong registry (core hoặc `registerIcons()`) |
| `iconNode` | `SVGElement` | SVG tin cậy do site dựng (được clone). Không bao giờ nhận chuỗi markup |
| `visible` | `(ctx) => boolean` | Gọi mỗi lần đổi slide; `false` → ẩn nút. Ném lỗi → ẩn |

Không có `icon` lẫn `iconNode` → nút hiện chữ `label`. Nút thêm luôn đứng trước nút Đóng.

### Handle trả về từ `open()`

| Thành viên | Ghi chú |
|---|---|
| `token`, `isOpen`, `index`, `count` | Chỉ đọc; sau khi đóng: `isOpen` false, `index` -1, `count` 0 |
| `next()`, `prev()`, `goTo(i)`, `close()` | Không làm gì nếu handle đã "chết" (lightbox đóng hoặc bị mở lại) |
| `setPanel(false \| true \| renderer)` | Đổi chế độ panel khi đang mở |
| `refreshPanel()` | Gọi lại renderer panel (dữ liệu của bạn đổi) |
| `addToolbarButton(spec) → remove()` | Thêm nút khi đang mở; trùng `id` thì thay thế |
| `removeToolbarButton(id)` | Gỡ nút theo id |

Event (trên `document`, không bubble qua cây vì dispatch thẳng lên `document`): `td-lightbox-open`,
`td-lightbox-change`, `td-lightbox-close`, `detail = { index, count, token, item, itemEl, groupEl }`.

---

## TdHovercard

`import { TdHovercard } from '@dazzxq/td-components/hovercard';` · Trang: [hovercard.md](../components/hovercard.md)

### Option của `TdHovercard.bind(trigger, opts) → unbind`

Nguồn nội dung, cái đầu tiên có giá trị thắng: `content` → `template` → `url` → `data-td-hovercard-template` của
trigger → `data-td-hovercard` của trigger.

| Option | Chữ ký / kiểu | Trả về | Khi nào gọi | Lỗi thì sao |
|---|---|---|---|---|
| `content` | `(trigger) => Node \| string \| null \| Promise<…>` | Node (được **chuyển** vào thẻ — trả node mới hoặc bản clone), chuỗi (HTML tin cậy), `null` / `''` = không hiện | Mỗi lần mở | Ném / reject → trạng thái lỗi (`labels.error`). Kiểu khác Node/chuỗi → trạng thái lỗi. Promise đang chờ → trạng thái loading |
| `template` | `HTMLTemplateElement \| string` (id, chấp nhận `#` đầu) | — | Mỗi lần mở (nội dung được clone) | Không tìm thấy / không phải `<template>` → `console.warn`, không mở |
| `url` | `string` | — | Mỗi lần mở (có cache) | Không phải http(s) cùng origin → `console.warn`, không mở. Non-2xx, sai content-type, > 256 KB, > 10 s → trạng thái lỗi (không cache lỗi) |
| `cache` | `boolean` (mặc định `true`) | — | — | `false` = luôn tải lại với trigger này |
| `label` | `string` | — | — | Tên truy cập của thẻ; mặc định lấy `data-td-hovercard-label` → `aria-label` → text trigger → `labels.dialog` |

Phản hồi URL hợp lệ: `application/json` dạng `{ "html": "…" }` hoặc fragment `text/html`.

### Cấu hình tĩnh

| Thành viên | Kiểu | Ý nghĩa | Lỗi thì sao |
|---|---|---|---|
| `TdHovercard.sanitize` | `null` \| `(html: string) => string \| Node \| TrustedHTML` | Áp cho **mọi chuỗi** (kết quả `content` là chuỗi và mọi fragment URL) trước khi vào `innerHTML`. `null` (mặc định) = chuỗi được tin | Ném lỗi → trạng thái lỗi |
| `TdHovercard.labels` | `{ loading: 'Đang tải…', error: 'Không tải được nội dung.', dialog: 'Thông tin thêm' }` | Nhãn toàn trang | — |
| `TdHovercard.clearCache()` | hàm | Xoá cache fragment, huỷ request đang chạy, đóng thẻ đang mở. **Gọi khi đăng nhập / đăng xuất / đổi quyền** | — |
| `TdHovercard.bindAll(root = document) → unbind` | hàm | Kích hoạt trigger khai báo trong `root` (idempotent theo root) | — |
| `TdHovercard.close()` | hàm | Đóng thẻ | — |

Dưới Trusted Types enforcement, một chuỗi thường sẽ bị trình duyệt từ chối → trạng thái lỗi; hãy để `sanitize` trả
`TrustedHTML`.

---

## TdMenu

`import { TdMenu } from '@dazzxq/td-components/menu';` · Trang: [menu.md](../components/menu.md)

### Option của `TdMenu.open(anchor, items, opts)` (dùng chung cho `bind()` và `button()`)

`items` là: tên menu đã đăng ký (chuỗi), mảng item, hoặc hàm `(ctx) => item[]` (gọi mỗi lần mở).

| Option | Kiểu | Mặc định | Ý nghĩa / Lỗi thì sao |
|---|---|---|---|
| `align` | `'start' \| 'center' \| 'end'` | `'end'` | Căn menu theo anchor |
| `side` | `'bottom' \| 'top'` | `'bottom'` | Phía ưu tiên (tự lật nếu không đủ chỗ) |
| `label` | `string` | — | `aria-label` của menu; không có → `aria-labelledby` = id của anchor |
| `focus` | `'first' \| 'last'` | `'first'` | Mục được focus khi mở |
| `onClose` | `(reason) => void` | — | `reason` ∈ `'select' \| 'escape' \| 'tab' \| 'outside' \| 'hidden' \| 'api'`. Ném lỗi → `console.error` |
| `ctx` | `object` | — | Dữ liệu thêm cho `ctx` (khoá dành riêng `anchor`, `name`, `item`, `checked`, `__proto__`… bị bỏ) |
| `isAllowedUrl` | `(url) => boolean` | — | Chính sách `href` của menu này (0.17.0): **thay** bộ lọc mặc định `safeMenuHref`. `false` / ném lỗi → mục disabled + `console.warn`. `javascript:` luôn bị chặn |

`open()` trả `{ element, close(), isOpen }` hoặc `null` (anchor đang mở → đóng nó; tên chưa đăng ký → `console.warn`;
không còn mục hiển thị nào; builder ném lỗi → `console.error`).

`ctx` = `{ ...opts.ctx, ...data-td-menu-* của anchor (camelCase, giá trị chuỗi), anchor, name }`. `name` = tên menu
đã đăng ký (hoặc `''` khi truyền mảng / hàm).

### Trường của một item

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `label` | `string` | Bắt buộc (item không có label bị bỏ). Hiển thị dạng **text** |
| `onSelect` (bí danh `onClick`) | `(ctx) => void \| Promise` | `ctx = { ...ctx menu, item, anchor, checked }`. Gọi **sau** khi menu đóng (item / radio) hoặc tại chỗ (checkbox). Ném / reject → `console.error`; Promise không được await |
| `href` | `string` | Chỉ http(s) hoặc tương đối (hoặc theo option `isAllowedUrl`). URL khác (`mailto:`, `javascript:`…) → item bị vô hiệu + `console.warn` |
| `newTab` | `boolean` | Mở tab mới (`rel="noopener noreferrer"`) |
| `download` | `true \| string` | Chỉ với `href` được chấp nhận: `<a download>`; chuỗi = tên file (lọc `/ \ : * ? " < > \|` + ký tự điều khiển, tối đa 200 ký tự) |
| `icon` | `string` | Tên icon registry |
| `iconNode` | `SVGElement` | SVG tin cậy (clone) |
| `hint` | `string` | Chữ phụ bên phải (text) |
| `danger` | `boolean` | Kiểu nguy hiểm |
| `disabled` | `boolean` | Focus được nhưng không kích hoạt |
| `type` | `'item' \| 'radio' \| 'checkbox'` | `checked` mà không có `type` → radio (tương thích dwp) |
| `checked` | `boolean` | Trạng thái ban đầu. Kit **không** sửa object của bạn; trạng thái mới nằm ở `ctx.checked` |
| `group` | `string` | Nhóm radio |
| `id` | `string` | Ghi ra `data-item` |
| `when` | `(ctx) => boolean` | `false` → ẩn. Ném lỗi → ẩn + `console.warn` |
| `order` | `number` | Chỉ với menu đăng ký: thứ tự sắp xếp |
| `separator` | `true` | Đường phân cách (tự gộp đầu / cuối / đôi) |

### Registry (plugin thêm mục mà không sửa lõi)

| Hàm | Chữ ký | Trả về | Ghi chú |
|---|---|---|---|
| `TdMenu.define(name, items)` | `items`: mảng hoặc `(ctx) => item[]` | `undefine()` | Danh sách gốc; gọi lại thì **thay**. Item gốc có `order` mặc định = chỉ số × 10 |
| `TdMenu.register(name, item \| item[], { order, group })` | | `unregister()` | Gọi trước hay sau `define` đều được. `order` mặc định 1000 (cuối). `group` khác nhau → tự chèn separator |
| `TdMenu.has(name)` | | `boolean` | |
| `TdMenu.bindAll(root = document)` | | `unbind()` | Kích hoạt `[data-td-menu="name"]` (delegation, idempotent theo root) |
| `TdMenu.bind(trigger, items, opts)` | | `unbind()` | Nối một trigger của bạn |
| `TdMenu.button({ icon, label, ariaLabel, items \| getItems, …opts })` | | `HTMLButtonElement` | Tạo nút `.td-menu-btn` đã bind (icon mặc định `more`) |
| `TdMenu.labels` | `{ trigger: 'Tùy chọn' }` | | `aria-label` của `TdMenu.button()` không có nhãn |

Hàm tiện ích export kèm: `safeMenuHref(href) → string | null` (bộ lọc URL của menu).

---

## TdModal và TdModalStackManager

`import { TdModal } from '@dazzxq/td-components/modal';` · Trang: [modal.md](../components/modal.md)

### Option của `TdModal.show(options) → id`

| Option | Kiểu | Mặc định | Ghi chú / Lỗi thì sao |
|---|---|---|---|
| `title` | `string` | `'Modal'` | Text |
| `body` | `Node \| string` | `''` | Chuỗi = **HTML tin cậy** |
| `footer` | `HTMLElement \| HTMLElement[]` | `null` | Gắn nguyên trạng |
| `actions` | `Array<Action>` | — | Thắng `footer`. Xem dưới |
| `size` | `xs sm md lg xl 2xl 3xl 4xl 5xl full` | `'md'` | |
| `width`, `height` | `string` | `null` | CSS hợp lệ, không `url()` / `var()`; sai → `console.warn`, bỏ qua |
| `fullViewport` | `boolean` | `false` | Không thành bottom sheet |
| `closable` | `boolean` | `true` | Hiện nút X. Modal **không bao giờ** đóng khi click nền |
| `escapeCloses` | `boolean` | `false` | Escape đóng (trừ khi đang bận). Chỉ cho dialog không mất dữ liệu |
| `showHeader`, `showFooter` | `boolean` | `true` | |
| `onClose` | `(value) => void` | `null` | Gọi **một lần** trên mọi đường đóng, **sau** khi focus đã trả về. `value` = `value` của action (nếu có). Ném lỗi → `console.error` |
| `onShow` | `(root, payload) => void` | — | Sau khi `data-state="open"` (frame thứ hai), trừ khi đã đóng trước đó. Ném lỗi → `console.warn` |
| `onShowPayload` | bất kỳ | — | Tham số thứ hai của `onShow` |
| `autoFocus` | `boolean` | `true` | `false` → focus chính dialog |
| `focusTarget` | `HTMLElement` | `null` | Chỉ dùng nếu nằm trong dialog |
| `bodyPadding` | `string \| number` | — | CSS padding hợp lệ |
| `bodyOverflow` | `visible hidden auto scroll clip` | — | |

**Action**: `{ label, variant?, value?, close?, disabled?, onClick? }`.
`onClick({ id, value, button })`:

| Trả về | Kết quả |
|---|---|
| không trả / giá trị khác `false` | Đóng (trừ khi `close: false`), `onClose(value)` |
| `false` | Giữ dialog mở |
| Promise | Nút đó bận (`aria-busy`), nút khác + X bị vô hiệu cho tới khi settle; resolve `false` → giữ mở; resolve khác → đóng |
| Ném lỗi (đồng bộ) | `console.error`, **giữ mở** |
| Promise reject | `console.warn`, hết bận, giữ mở |

### Dialog Promise

| Hàm | Option | Resolve |
|---|---|---|
| `TdModal.confirm(opts)` | `title` (`labels.confirmTitle`), `message` (`labels.confirmMessage`), `messageHtml` (HTML tin cậy, thắng `message`), `confirmText`, `cancelText`, `confirmVariant` (`primary danger success warning`), `onConfirm`, `onCancel` | `true` khi xác nhận; `false` khi huỷ / X / `closeAll` |
| `TdModal.success(opts)` / `.error(opts)` / `.info(opts)` | `title` (`labels.successTitle` / `errorTitle` / `infoTitle`), `message`, `messageHtml`, `okText` | `true` khi bấm OK, `false` khi đóng cách khác |

`onConfirm()`: đồng bộ trả `false` hoặc ném lỗi (`console.error`) → giữ mở (**đổi hành vi 0.16.0**, giống `actions`);
giá trị đồng bộ khác → resolve `true` và đóng. Trả Promise → nút xác nhận bận; settle khác `false` → `true` + đóng;
resolve `false` hoặc reject → giữ mở (reject có `console.warn`). `onCancel()` ném lỗi bị nuốt.

### Cấu hình tĩnh

| Thành viên | Mặc định | Ghi chú |
|---|---|---|
| `TdModal.labels` | `{ close: 'Đóng', confirm: 'Xác nhận', cancel: 'Hủy', ok: 'OK', confirmTitle: 'Xác nhận', confirmMessage: 'Bạn có chắc chắn?', successTitle: 'Thành công', errorTitle: 'Lỗi', infoTitle: 'Thông tin' }` | `close` = `aria-label` nút X (đọc khi tạo dialog); `confirm` / `cancel` / `ok` = chữ nút mặc định; `*Title` / `confirmMessage` (0.16.0) = tiêu đề / nội dung mặc định của các hộp thoại Promise. `message` mặc định của `success` / `error` không lấy từ đây |
| `TdModalStackManager.BASE_Z_INDEX` | `null` | **Deprecated**. Gán số → mỗi modal nhận z-index inline `BASE + i × Z_INDEX_INCREMENT` (+ một cảnh báo). Nên dịch bộ `--td-z-*` thay vì dùng |
| `TdModalStackManager.Z_INDEX_INCREMENT` | `100` | Chỉ dùng khi có `BASE_Z_INDEX` |

---

## TdToast

`import { TdToast } from '@dazzxq/td-components/toast';` · Trang: [toast.md](../components/toast.md)

| API / cấu hình | Chữ ký | Ghi chú |
|---|---|---|
| `TdToast.show(message, type = 'info', duration = 4000)` | `type` ∈ `success error warning info` (khác → info) | `message` luôn là **text**. `duration` ms; `0` = dính (đóng bằng nút X, click hoặc `handle.close()`). `message` rỗng → không hiện. Trả handle `{ close() }` (0.16.0; mọi hàm dưới cũng vậy) |
| `handle.close()` | | (0.16.0) Đóng **yêu cầu**: còn trong hàng đợi 50 ms → bỏ; chờ lượt 80 ms → huỷ; đã hiện → đóng như nút X. Gọi lại → no-op |
| `TdToast.clear()` | | (0.16.0) Xoá hàng đợi, huỷ lượt chờ, đóng mọi toast đang hiện |
| `TdToast.labels` | `{ close: 'Đóng' }` | (0.16.0) `aria-label` nút đóng, đọc khi tạo mỗi toast |
| `TdToast.success(msg, duration = 4000)` | | |
| `TdToast.error(msg, duration = 5000)` | | Lỗi có `role="alert"` |
| `TdToast.warning(msg, duration = 4000)` / `.info(msg, duration = 4000)` | | |
| `TdToast.MAX_VISIBLE` | `5` | Vượt quá → toast cũ nhất bị đẩy ra (FIFO) |

Không có callback đóng và không có action button.
Vị trí / màu qua token `--td-toast-*` (xem [công thức 4](#4-toast-thời-lượng-riêng-toast-dính-vị-trí)).

---

## TdLoading và TdLoadingSpinner

`import { TdLoading, TdLoadingSpinner } from '@dazzxq/td-components/loading';` · Trang: [loading.md](../components/loading.md)

| API | Chữ ký | Ghi chú |
|---|---|---|
| `TdLoading.show(messageOrOptions)` | `string` hoặc `{ message?, maxDuration? }` | `message` mặc định `TdLoading.labels.loading` (`'Đang tải...'`, cấu hình được từ 0.16.0). Truyền thẳng chuỗi `''` = không chữ; trong dạng object, `message` rỗng → dùng mặc định. `maxDuration` mặc định `30000` ms: quá hạn tự ẩn + `console.warn`; `false` / `0` tắt |
| `TdLoading.wrap(asyncFn, messageOrOptions)` | `() => Promise<T>`; tham số 2 như `show()` (object từ 0.16.0) | Trả về kết quả của `asyncFn` (reject lan ra ngoài). Đếm tham chiếu: nhiều `wrap` song song giữ overlay tới khi cái cuối settle |
| `TdLoading.hide()` | | Kết thúc mọi `wrap` đang chờ |
| `TdLoadingSpinner.create({ size, color, trackColor, className, label })` | `size`: `sm md lg` | `color` / `trackColor` qua `safeColor` rồi CSSOM. `label` có → `role="status"`; không → trang trí (`aria-hidden`) |

---

## Tooltip

`import '@dazzxq/td-components/tooltip';` · Trang: [tooltip.md](../components/tooltip.md)

Không có hook JS. Tooltip hoàn toàn khai báo bằng attribute trên trigger: `data-tooltip`, `data-tooltip-position`,
`data-tooltip-color`, `data-tooltip-text-color` (và bí danh dwp). Lưu ý: khác menu / hovercard, **import module này là
tự khởi tạo** singleton `tdTooltip` (lắng nghe toàn trang). Singleton có `show(el)`, `hide()`, `disconnect()` cho các
trường hợp đặc biệt.

---

## td-dropdown

`import '@dazzxq/td-components/dropdown';` · Trang: [dropdown.md](../components/dropdown.md)

| Property | Chữ ký / kiểu | Khi nào gọi | Lỗi thì sao |
|---|---|---|---|
| `options` | `Array<object>` (khoá theo `value-key` / `label-key`, mặc định `value` / `label`) | — | Không phải mảng → rỗng |
| `onSelect` | `(item) => void` (`null` khi bỏ chọn) | Người dùng chọn / bỏ chọn, **trước** `onChange` và event `change` | Bắt lỗi: `console.error`, `onChange` và event `change` vẫn chạy |
| `onChange` | `(value) => void` (`null` khi bỏ chọn) | Sau `onSelect`, **trước** event `change` | Như trên |

Từ 0.16.0 **cả hai** callback đều chạy khi cùng đặt (trước đó có `onChange` thì `onSelect` bị bỏ qua). Có thể gán
`options` / `onChange` / `onSelect` trước khi element được nâng cấp.

`TdDropdown.labels` (toàn trang):

| Khoá | Mặc định |
|---|---|
| `search` | `Tìm kiếm` (`aria-label` ô tìm; placeholder = chữ này + `...`) |
| `none` | `Không chọn` |
| `noResults` | `Không tìm thấy kết quả` |
| `required` | `Vui lòng chọn một tùy chọn` |

Placeholder của trigger đổi bằng attribute `placeholder`.

---

## td-chip-input

`import '@dazzxq/td-components/chip-input';` · Trang: [chip-input.md](../components/chip-input.md)

Có thể gán các property này **trước** khi element được nâng cấp (upgrade); chúng được áp lại qua setter.

| Property | Chữ ký | Trả về | Khi nào gọi | Lỗi thì sao |
|---|---|---|---|---|
| `search` | `(query, { signal }) => Array \| Promise<Array>` | Mảng chuỗi / số / object `{ value, label, description? }` | Sau debounce `search-delay` (250 ms) khi gõ đủ `min-chars`, hoặc query rỗng với `show-on-focus` | Ném / reject → popup báo lỗi (`labels.error`), event `search-error` `{ query, error }`. `AbortError` hoặc phản hồi cũ bị bỏ im lặng |
| `create` | `(text) => item \| null \| Promise<item \| null>` | Item mới; `null` = từ chối (có thể tự gọi `setError`) | Enter / chọn dòng "Thêm …" khi có `allow-create` | Ném / reject → `console.error`, coi như `null`. Không có `create` → item `{ value: text, label: text }` |
| `renderOption` | `(item, { query }) => Node \| string` | Node, hoặc chuỗi hiển thị dạng **text** | Mỗi lần vẽ danh sách gợi ý | Ném lỗi / trả `null` / `''` → `console.error` (khi ném) và dùng label |
| `renderChip` | `(item) => Node \| string` | Như trên | Mỗi lần vẽ chip | Như trên |
| `options` | `Array` | — | Gợi ý tĩnh (lọc tại chỗ, không phân biệt dấu) khi không có `search` | — |
| `messages` | `object` (một phần của `labels`) | — | Nhãn **riêng** instance này, ghi đè `TdChipInput.labels` | — |

`TdChipInput.labels` (toàn trang; `{…}` được điền giá trị):

| Khoá | Mặc định | Khoá | Mặc định |
|---|---|---|---|
| `remove` | `Xóa {label}` | `results` | `{n} gợi ý` |
| `create` | `Thêm “{text}”` | `noResults` | `Không có gợi ý` |
| `chips` | `Đã chọn` | `loading` | `Đang tìm…` |
| `added` | `Đã thêm {label}` | `error` | `Không tải được gợi ý` |
| `removed` | `Đã xóa {label}` | `max` | `Đã đạt tối đa {max} mục` |
| `duplicate` | `Đã có {label}` | `required` | `Vui lòng thêm ít nhất một mục` |

(Tên property là `messages`, không phải `labels`, vì `labels` của form control là danh sách `<label>` gắn với nó.)

---

## td-datetime-picker

`import '@dazzxq/td-components/datetime-picker';` · Trang: [datetime-picker.md](../components/datetime-picker.md)

Không có callback; nghe event `change` (`detail = { value, dbValue }`). Hai object cấu hình tĩnh:

`TdDatetimePicker.labels`:

| Khoá | Mặc định | Dùng ở |
|---|---|---|
| `title` | `Chọn ngày giờ` | Tiêu đề dialog |
| `placeholder` | `dd/mm/yyyy - hh:mm` | Khi không có attribute `placeholder` |
| `date`, `time` | `Ngày`, `Giờ` | Tiêu đề nhóm ngày / giờ |
| `day`, `month`, `year` | `Ngày`, `Tháng`, `Năm` | Nhãn ba ô ngày |
| `hour`, `minute` | `Giờ`, `Phút` | Tên hai bánh xe |
| `close`, `now`, `confirm` | `Đóng`, `Bây giờ`, `Chọn` | Ba nút footer |

`TdDatetimePicker.messages` (`{min}` / `{max}` được điền):

| Khoá | Mặc định |
|---|---|
| `required` | `Vui lòng chọn ngày giờ` |
| `format` | `Định dạng ngày giờ không hợp lệ` |
| `incomplete` | `Vui lòng nhập đầy đủ ngày, tháng, năm` |
| `day` | `Ngày phải từ 1 đến 31` |
| `month` | `Tháng phải từ 1 đến 12` |
| `year` | `Năm phải từ {min} đến {max}` |
| `hour` | `Giờ phải từ 0 đến 23` |
| `minute` | `Phút phải từ 0 đến 59` |
| `date` | `Ngày không hợp lệ` |
| `min` | `Không được trước {min}` |
| `max` | `Không được sau {max}` |

---

## Hợp đồng lỗi của mọi form control

td-input-field, td-dropdown, td-chip-input, td-datetime-picker, td-slider, td-checkbox, td-toggle (lớp
`TdFormElement` có `errorContract`) có chung API hiển thị lỗi — đây là "hook" mà TdFormValidation và code của bạn dùng:

| Thành viên | Ghi chú |
|---|---|
| `setError(message)` | Hiện lỗi: `aria-invalid`, `aria-errormessage`, dòng `.td-field-error`. `''` = xoá. **Không** đổi constraint validity |
| `clearError()` | Xoá lỗi (kể cả lỗi từ attribute `error-text`) |
| `errorMessage` | Lỗi đang hiện (`''` = không có) |
| `setCustomValidity(message)` | Như input native: thêm / xoá `customError` (chặn submit) |
| `checkValidity()`, `reportValidity()`, `validity`, `validationMessage` | Như input native |

td-button **không** có hợp đồng lỗi (không form-associated). Thông báo validation mặc định (tiếng Việt) của
td-input-field, td-slider, td-checkbox, td-toggle nằm trong object tĩnh `messages` của từng class (0.16.0, bảng dưới);
đổi cho cả trang bằng `Object.assign(TdInputField.messages, { … })`. Theo từng field: `messages` của TdFormValidation
hoặc `setError`. Chi tiết: [../guides/forms.md](../guides/forms.md).

`TdInputField.messages` (`@dazzxq/td-components/input-field`):

| Khoá | Mặc định |
|---|---|
| `valueMissing` | `Trường này là bắt buộc` |
| `tooLong` | `Vượt quá giới hạn {maxLength} {unit}` |
| `tooShort` | `Tối thiểu {minLength} ký tự` |
| `patternMismatch` | `Giá trị không đúng định dạng` |
| `badInput` | `Giá trị không hợp lệ` (cũng dùng cho `number` sai cú pháp) |
| `typeMismatchEmail`, `typeMismatchUrl` | `Email không hợp lệ`, `URL không hợp lệ` |
| `rangeUnderflow`, `rangeOverflow` | `Giá trị tối thiểu là {min}`, `Giá trị tối đa là {max}` |
| `stepMismatch` | `Giá trị không đúng bước nhảy` |
| `dateInvalid`, `dateUnderflow`, `dateOverflow` | `Ngày không hợp lệ`, `Ngày tối thiểu là {min}`, `Ngày tối đa là {max}` |
| `unitChar`, `unitWord` | `ký tự`, `từ` — `{unit}` của `tooLong` và chữ của bộ đếm |

`TdSlider.messages` (`{min}` `{max}` `{step}`): `rangeUnderflow` = `Giá trị tối thiểu là {min}.`, `rangeOverflow` =
`Giá trị tối đa là {max}.`, `stepMismatch` = `Giá trị phải là bội số của {step}.`

`TdCheckbox.messages.valueMissing` = `Vui lòng chọn ô này.`; `TdToggle.messages.valueMissing` =
`Vui lòng bật tùy chọn này.`

Được đọc mỗi lần control tính lại validity (đổi giá trị / attribute); control đã render giữ thông báo cũ tới lần tính
lại kế tiếp — nên nạp bản dịch trước khi component render.

---

## TdFormValidation

`import { TdFormValidation } from '@dazzxq/td-components/form-validation';` · Trang: [form-validation.md](../components/form-validation.md)

### Option

| Option | Dùng ở | Chữ ký / kiểu | Ghi chú / Lỗi thì sao |
|---|---|---|---|
| `rules` | `validate`, `attach` | `{ [name]: (value, control, root) => string }` | Trả thông điệp lỗi hoặc `''`. Được đẩy vào `setCustomValidity`. **Ném lỗi → field bị coi là không hợp lệ** với `messages.ruleError` (fail closed) + `console.warn` |
| `messages` | `validate`, `attach` | `{ [name]: string \| { valueMissing?, typeMismatch?, … } }` | Thông điệp riêng từng field (áp cho cả control td lẫn native) |
| `summary` | `validate`, `apply`, `attach` | `true \| false \| 'auto'` | `'auto'`: hiện khi ≥ 2 lỗi hoặc có lỗi không map được |
| `summaryTarget` | như trên | `HTMLElement \| null` | Chỗ gắn summary (append, không xoá nội dung cũ) |
| `focus` | như trên | `boolean` (mặc định `true`) | Focus control lỗi đầu tiên theo thứ tự DOM |
| `fieldMap` | `apply` | `{ [key]: id \| Element }` | Map khoá lỗi server → control (id tìm **trong** root) |
| `live` | `attach` | `boolean` (mặc định `true`) | Sau lần submit lỗi đầu, kiểm tra lại khi người dùng sửa |
| `onValid` | `attach` | `(event, form) => void` | Có → submit **luôn** bị `preventDefault`, gọi `onValid` khi hợp lệ (SPA / modal). Ném lỗi đồng bộ → bắt + `console.error` (0.16.0); Promise reject thì bạn tự xử lý |

`attach(form)` ném `TypeError` nếu `form` không phải `<form>`. `validate()` ném lỗi bên trong `attach` → submit bị chặn
(fail closed) + `console.error`. Form `reset` → như `clear(form)` + tắt kiểm tra lại khi sửa tới lần submit lỗi kế tiếp
(0.16.0).

### Cấu hình tĩnh

| Thành viên | Mặc định |
|---|---|
| `TdFormValidation.labels.summaryTitle` | `Vui lòng kiểm tra lại các trường sau:` |
| `TdFormValidation.messages` | `ruleError`, `valueMissing`, `typeMismatch`, `typeMismatchEmail`, `typeMismatchUrl`, `badInput`, `patternMismatch`, `tooShort` (`Tối thiểu {minLength} ký tự`), `tooLong` (`Tối đa {maxLength} ký tự`), `rangeUnderflow` (`Giá trị tối thiểu là {min}`), `rangeOverflow` (`Giá trị tối đa là {max}`), `stepMismatch` |

`TdFormValidation.messages` chỉ áp cho control **native** (`<input>`, `<select>`…); control td giữ thông điệp riêng
trừ khi có `messages` theo từng lần gọi. `patternMismatch` ưu tiên `title` của control.

---

## td-table

`import '@dazzxq/td-components/table';` · Trang: [table.md](../components/table.md)

| Property / option | Chữ ký | Khi nào gọi | Lỗi thì sao |
|---|---|---|---|
| `columns[].render` | `(row, rowIdxInPage) => Node \| string \| any` | Mỗi lần vẽ hàng | Node → append; **chuỗi → HTML tin cậy (`innerHTML`)**; khác → text. Ném lỗi → ô đó trống + `console.error`, các ô khác vẫn vẽ |
| `onSort` | `({ key, direction }) => void` (`direction`: `'asc' \| 'desc' \| null`) | Sau event `sort-change`, **chỉ ở `server-mode`** | Bắt lỗi: `console.error` |
| `onPageChange` | `(page) => void` | Khi đổi trang, **chỉ ở `server-mode`** | Bắt lỗi: `console.error` (hai thanh phân trang vẫn đồng bộ) |
| `update({ columns, data, page, onSort, onPageChange })` | | Gộp nhiều thay đổi một lần | Mảng không hợp lệ bị bỏ qua |

Ở chế độ client, sắp xếp / phân trang làm tại chỗ; muốn biết người dùng sắp xếp gì, nghe event `sort-change`.

`TdTable.labels`:

| Khoá | Mặc định |
|---|---|
| `table` | `Bảng dữ liệu` |
| `loading` | `Đang tải dữ liệu…` |
| `paginationTop` / `paginationBottom` | `Phân trang (trên)` / `Phân trang (dưới)` |
| `itemLabel` | `mục` |
| `emptyTitle` / `emptyText` | `Không có dữ liệu` / `Chưa có dữ liệu để hiển thị.` (attribute `empty-title` / `empty-text` thắng) |

---

## td-tabs

`import '@dazzxq/td-components/tabs';` · Trang: [tabs.md](../components/tabs.md)

| Property | Chữ ký | Khi nào gọi | Lỗi thì sao |
|---|---|---|---|
| `tabs` | `Array<{ id, label, icon?, panel? }>` | — | Mục thiếu `id` bị bỏ |
| `onChange` | `(tabId) => void` | Người dùng (hoặc `setActiveTab`) đổi tab, **trước** event `tab-change` | Bắt lỗi: `console.error`, `tab-change` vẫn phát |

Tên tablist mặc định `Các thẻ`; đổi bằng attribute `aria-label` / `aria-labelledby`.

---

## td-empty-state

`import '@dazzxq/td-components/empty-state';` · Trang: [empty-state.md](../components/empty-state.md)

| Property | Kiểu | Ghi chú |
|---|---|---|
| `actions` | `Array<{ label, variant?: 'primary' \| 'secondary' \| 'danger', onClick?: (event) => void }>` | Mỗi action thành một `.td-btn--sm`; `onClick` là listener `click` thường. Gán lại → listener cũ được gỡ |
| `iconNode` | `SVGElement \| null` | Icon tuỳ biến tin cậy (clone), thắng attribute `icon` |
| `TdEmptyState.labels` | `{ action: 'Thực hiện' }` | Chữ nút của action thiếu `label` (toàn trang) |

---

## Component không có hook JS

td-button, td-input-field, td-checkbox, td-toggle, td-slider, td-pagination: tuỳ biến bằng attribute, token và event
(`click`, `input`, `change`, `page-change`). Các control form có [hợp đồng lỗi](#hợp-đồng-lỗi-của-mọi-form-control)
và object tĩnh `messages` cho thông báo validation.
Chữ của td-pagination đổi qua `TdPagination.labels` (toàn trang): `prev` (`Trang trước`), `next` (`Trang sau`),
`page` (`Trang {n}`), `info` (`Hiển thị {from}-{to} / {total} {item}`), `item` (`mục`); attribute `item-label` thắng
`labels.item`, tên landmark đổi bằng `aria-label`.

## Icon

`registerIcons(defs)` thêm icon riêng của site vào registry dùng chung (menu, lightbox toolbar, button, empty-state đều
đọc từ đây). Xem [extending.md › Đăng ký icon](extending.md#đăng-ký-icon) và [icons.md](../components/icons.md).

---

## Công thức (recipes)

### 1. Lightbox: tải ảnh qua proxy cùng origin

Vấn đề: ảnh nằm trên CDN khác origin. Trình duyệt **bỏ qua** attribute `download` với link khác origin (nó mở ảnh thay
vì tải), nên mặc định kit chỉ hiện nút Tải cho ảnh cùng origin. Giải pháp: trả về URL proxy cùng origin.

```js
import { TdLightbox } from '@dazzxq/td-components/lightbox';

const unbind = TdLightbox.bind(document, {
  download: (item, ctx) => {
    if (item.type !== 'image') return '';                    // video: không có nút tải
    const name = ctx.itemEl?.dataset.filename || 'anh.jpg';
    return `/media/download/${encodeURIComponent(name)}?src=${encodeURIComponent(item.src)}`;
  },
});
```

- URL tương đối cùng origin tự qua bộ lọc mặc định (trang https → URL https).
- Tên file của nút lấy từ phần cuối đường dẫn (`anh.jpg` ở trên); server nên gửi thêm
  `Content-Disposition: attachment; filename="…"`.
- **Bảo mật**: proxy ở server phải kiểm tra `src` thuộc danh sách host được phép (chống SSRF), không tải bất kỳ URL nào.

### 2. Hovercard: lọc HTML bằng sanitize + xoá cache khi đăng xuất

Fragment hovercard có thể chứa nội dung người dùng (bio, tên hiển thị). Cắm một sanitizer (thư viện của site, ví dụ
DOMPurify) một lần cho cả trang:

```js
import { TdHovercard } from '@dazzxq/td-components/hovercard';
import DOMPurify from 'dompurify';   // dependency của site, không phải của kit

TdHovercard.sanitize = (html) => DOMPurify.sanitize(html, { RETURN_TRUSTED_TYPE: true });
TdHovercard.bindAll();              // kích hoạt <a data-td-hovercard="/api/users/7/card">

// Đăng xuất / đổi tài khoản: fragment trong cache có thể thuộc người dùng trước
document.querySelector('#logout').addEventListener('click', () => TdHovercard.clearCache());
```

Nếu sanitizer ném lỗi, thẻ hiện trạng thái lỗi (không bao giờ chèn HTML chưa lọc). Server cũng nên gửi
`Cache-Control: no-store` cho dữ liệu riêng từng người: kit tôn trọng header đó.

### 3. Menu: plugin thêm mục vào menu của lõi

Lõi định nghĩa menu "post-actions"; plugin SEO thêm mục mà không sửa code lõi.

```html
<button type="button" class="td-menu-btn" aria-label="Tuỳ chọn bài viết"
        data-td-menu="post-actions" data-td-menu-post-id="7" data-td-menu-status="published">
  <span class="td-menu-btn__icon" data-td-icon="more" aria-hidden="true"></span>
</button>
```

```js
import { TdMenu } from '@dazzxq/td-components/menu';
import { fillIconSlots } from '@dazzxq/td-components/icons';

// Lõi (module core): order mặc định = chỉ số × 10 → 0, 10, 20, 30
TdMenu.define('post-actions', (ctx) => [
  { label: 'Xem bài', icon: 'external', href: `/p/${encodeURIComponent(ctx.postId)}`, newTab: true },
  { label: 'Sửa', onSelect: (c) => openEditor(c.postId) },
  { separator: true },
  { label: 'Xoá', danger: true, onSelect: (c) => deletePost(c.postId) },
]);

// Plugin SEO (module khác, nạp trước hay sau đều được)
const unregister = TdMenu.register('post-actions', [
  {
    label: 'Kiểm tra SEO',
    icon: 'search',
    when: (c) => c.status === 'published',          // chỉ hiện với bài đã xuất bản
    onSelect: (c) => runSeoCheck(c.postId),
  },
], { order: 15, group: 'seo' });                   // 15: nằm giữa "Sửa" và separator; group khác → tự thêm separator

fillIconSlots(document);                           // vẽ icon cho slot data-td-icon trong HTML tĩnh
TdMenu.bindAll();                                  // một lần cho cả trang
```

`ctx.postId` là **chuỗi** `'7'` (lấy từ `data-td-menu-post-id`). Khi plugin bị tắt, gọi `unregister()`.

### 4. Toast: thời lượng riêng, toast dính, vị trí

```js
import { TdToast } from '@dazzxq/td-components/toast';

TdToast.success('Đã lưu bản nháp', 2000);                  // 2 giây
TdToast.error('Mất kết nối. Đang thử lại…', 0);           // dính: chỉ đóng bằng X hoặc click
TdToast.MAX_VISIBLE = 3;                                   // tối đa 3 toast cùng lúc
```

Đưa stack xuống giữa đáy màn hình (chỉ bằng token, không JS):

```css
:root {
  --td-toast-top: auto;
  --td-toast-bottom: 1.5rem;
  --td-toast-inline-end: auto;
  --td-toast-inline-start: 50%;
  --td-toast-shift: -50%;
  --td-toast-align: center;
}
```

Bộ đếm giờ tự tạm dừng khi chuột ở trên stack, focus ở trong, hoặc tab bị ẩn (WCAG 2.2.1), nên đừng đặt thời lượng
quá ngắn cho thông điệp dài.

### 5. Form: lỗi từ server (Laravel 422)

```html
<form id="post-form" action="/api/posts" method="post">
  <td-input-field name="title" label="Tiêu đề" required></td-input-field>
  <td-input-field name="slug" label="Đường dẫn" required></td-input-field>
  <td-input-field id="seo-title" name="seo_title" label="Tiêu đề SEO"></td-input-field>
  <td-button type="submit" variant="primary">Lưu</td-button>
</form>
```

```js
import '@dazzxq/td-components/input-field';
import '@dazzxq/td-components/button';
import { TdFormValidation } from '@dazzxq/td-components/form-validation';
import { TdToast } from '@dazzxq/td-components/toast';

const form = document.querySelector('#post-form');

TdFormValidation.attach(form, {
  rules: {
    slug: (v) => (/^[a-z0-9-]+$/.test(v) ? '' : 'Chỉ dùng chữ thường, số và dấu gạch ngang'),
  },
  onValid: async (event, f) => {
    try {
      const res = await fetch(f.action, { method: 'POST', body: new FormData(f), headers: { Accept: 'application/json' } });
      if (res.status === 422) {
        const { errors } = await res.json();       // { "title": ["…"], "meta.title": ["…"] }
        const r = TdFormValidation.apply(f, errors, { fieldMap: { 'meta.title': 'seo-title' } });
        if (r.unmapped.length) console.warn('Lỗi không gắn được vào field:', r.unmapped);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      TdToast.success('Đã lưu');
    } catch (err) {
      TdToast.error('Không lưu được. Vui lòng thử lại.');
    }
  },
});
```

- `apply()` không đổi validity: lỗi server biến mất ngay khi người dùng sửa field đó.
- Khoá có dấu chấm (`meta.title`) cũng tự được thử dưới dạng tên ngoặc (`meta[title]`); `fieldMap` chỉ cần khi tên
  field khác hẳn. Lỗi không map được hiện trong summary.
- `onValid` không được kit bọc lỗi → luôn `try/catch` như trên.

### 6. Chip-input: gợi ý từ API + tạo mục mới

```html
<td-chip-input id="tags" name="tags[]" label="Thẻ" allow-create min-chars="2" max-items="10"></td-chip-input>
```

```js
import '@dazzxq/td-components/chip-input';

const tags = document.querySelector('#tags');

tags.search = async (query, { signal }) => {
  const res = await fetch(`/api/tags?q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();                                  // [{ value: 12, label: 'Công nghệ', description: '248 bài' }]
};

tags.create = async (text) => {
  const res = await fetch('/api/tags', { method: 'POST', body: JSON.stringify({ name: text }),
    headers: { 'Content-Type': 'application/json' } });
  if (res.status === 422) { tags.setError('Tên thẻ không hợp lệ'); return null; }   // từ chối
  const tag = await res.json();
  return { value: tag.id, label: tag.name };
};

tags.addEventListener('search-error', (e) => console.warn('Tìm thẻ lỗi', e.detail.query, e.detail.error));
```

Luôn truyền `signal` vào `fetch`: kit huỷ request cũ khi người dùng gõ tiếp, và tự bỏ phản hồi lỗi thời kể cả khi bạn
quên.

### 7. Table: server mode (sắp xếp và phân trang ở server)

```html
<td-table id="orders" server-mode per-page="20" title="Đơn hàng"></td-table>
```

```js
import '@dazzxq/td-components/table';

const table = document.querySelector('#orders');
const state = { page: 1, sort: null, dir: null };

async function load() {
  table.setLoading(true);
  try {
    const q = new URLSearchParams({ page: state.page, sort: state.sort ?? '', dir: state.dir ?? '' });
    const { rows, total } = await (await fetch(`/api/orders?${q}`)).json();
    table.setAttribute('total-items', String(total));   // bắt buộc ở server mode
    table.data = rows;                                    // server mode: giữ trang hiện tại
  } finally {
    table.setLoading(false);
  }
}

table.update({
  columns: [
    { key: 'code', label: 'Mã', sortable: true },
    { key: 'customer', label: 'Khách hàng', ellipsis: true },
    { key: 'total', label: 'Tổng', align: 'right', sortable: true },
  ],
  onSort: ({ key, direction }) => { Object.assign(state, { sort: key, dir: direction, page: 1 }); table.setPage(1); load(); },
  onPageChange: (page) => { state.page = page; load(); },
});
load();
```

Callback không được bọc lỗi: lỗi trong `load()` là Promise reject (không phá bảng), nhưng code đồng bộ ném lỗi trong
`onSort` sẽ lan ra.

### 8. Nhãn tiếng Anh cho một site

Nhãn mặc định là tiếng Việt. Một module `i18n-en.js` nạp **một lần**, trước khi component đầu tiên render:

```js
import { TdMenu } from '@dazzxq/td-components/menu';
import { TdModal } from '@dazzxq/td-components/modal';
import { TdHovercard } from '@dazzxq/td-components/hovercard';
import { TdTable } from '@dazzxq/td-components/table';
import { TdDropdown } from '@dazzxq/td-components/dropdown';
import { TdPagination } from '@dazzxq/td-components/pagination';
import { TdEmptyState } from '@dazzxq/td-components/empty-state';

Object.assign(TdMenu.labels, { trigger: 'Options' });
Object.assign(TdModal.labels, { close: 'Close', confirm: 'Confirm', cancel: 'Cancel', ok: 'OK',
  confirmTitle: 'Confirm', confirmMessage: 'Are you sure?', successTitle: 'Success', errorTitle: 'Error',
  infoTitle: 'Information' });
Object.assign(TdHovercard.labels, { loading: 'Loading…', error: 'Could not load content.', dialog: 'More info' });
Object.assign(TdTable.labels, { table: 'Data table', loading: 'Loading data…', itemLabel: 'items',
  paginationTop: 'Pagination (top)', paginationBottom: 'Pagination (bottom)',
  emptyTitle: 'No data', emptyText: 'Nothing to show yet.' });
Object.assign(TdDropdown.labels, { search: 'Search', none: 'None', noResults: 'No results',
  required: 'Please choose an option' });
Object.assign(TdPagination.labels, { prev: 'Previous page', next: 'Next page', page: 'Page {n}',
  info: 'Showing {from}-{to} of {total} {item}', item: 'items' });
TdEmptyState.labels.action = 'Do it';
```

Danh sách đầy đủ mọi object nhãn (và những chữ **không** dịch được) ở
[extending.md › Dịch nhãn](extending.md#dịch-nhãn-sang-ngôn-ngữ-khác).

## Xem thêm

- [extending.md](extending.md): tự viết component, đăng ký icon, registry menu, dịch nhãn.
- [theming.md](theming.md) · [styling.md](styling.md): tuỳ biến bằng CSS.
- [../guides/security.md](../guides/security.md): escaping, cửa HTML tin cậy, allowlist URL.
- [../guides/forms.md](../guides/forms.md): form-associated, validation, lỗi server.
