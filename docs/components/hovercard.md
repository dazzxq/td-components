[Tài liệu](../README.md) › [Components](README.md) › Hovercard

# Hovercard — `TdHovercard`

`TdHovercard` là thẻ thông tin nổi (popup nhỏ, không modal) hiện khi **rê chuột có chủ đích** hoặc khi **focus bằng bàn
phím** vào một trigger: ví dụ rê lên tên tác giả thì hiện avatar, chức danh, số bài viết, link hồ sơ. Nội dung tự do
(ảnh, link, nút). Dùng khi cần xem nhanh thông tin phụ mà không rời trang. **Không** dùng cho chú thích một dòng
(dùng [`TdTooltip`](tooltip.md)), cho danh sách hành động (dùng [`TdMenu`](menu.md)), hay cho nội dung bắt buộc phải
thấy / thao tác chính (dùng [`TdModal`](modal.md)) — người dùng cảm ứng không rê chuột được.

| | |
|---|---|
| Import | `import { TdHovercard } from '@dazzxq/td-components/hovercard'` |
| Loại | API JS tĩnh (static class), không có tag |
| Form-associated | không |
| Từ phiên bản | 0.14.0 (port từ `hovercard.js` của dwp + biến thể của kit 135) |
| CSS | cần `td.css` (`src/styles/components/hovercard.css` + công thức `.td-glass-surface`) |

Import không có side effect: không có gì chạy cho tới khi bạn gọi `bind()` hoặc `bindAll()`.

## Ví dụ nhanh

Cách an toàn nhất: nội dung là **Node** bạn tự dựng.

```html
<a href="/tac-gia/lan" id="author-lan">Nguyễn Lan</a>
```

```js
import { TdHovercard } from '@dazzxq/td-components/hovercard';

const link = document.getElementById('author-lan');

TdHovercard.bind(link, {
  label: 'Hồ sơ Nguyễn Lan',
  content: () => {
    const box = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = 'Nguyễn Lan';
    const role = document.createElement('p');
    role.textContent = 'Biên tập viên · 128 bài viết';
    box.append(name, role);
    return box;
  },
});
```

## Cách dùng

Có ba nguồn nội dung. Thứ tự ưu tiên: tuỳ chọn `content` → `template` → `url` của `bind()`, sau đó mới tới attribute
`data-td-hovercard-template`, rồi `data-td-hovercard` trên trigger.

### 1. `content(trigger)` — hook JS

```js
TdHovercard.bind(trigger, { content: (t) => buildCard(t.dataset.userId) });
```

`content` nhận chính trigger và có thể trả:

| Giá trị trả về | Kết quả |
|---|---|
| `Node` / `DocumentFragment` | Được **chuyển** (move) vào card. Hãy trả node mới hoặc bản clone, đừng trả node đang nằm trên trang |
| `string` | Render bằng `innerHTML` — **HTML tin cậy** (xem [Bảo mật](#bảo-mật)) |
| `TrustedHTML` | Render nguyên trạng (Trusted Types) |
| `Promise<Node \| string>` | Card hiện **skeleton** (0.62.0; trước đó spinner) rồi thay bằng kết quả; reject → trạng thái lỗi |
| `null`, `''`, fragment rỗng | Không có gì để hiện: card đóng / không mở |
| Hàm throw | Trạng thái lỗi |

Ví dụ dữ liệu từ API JSON, dựng bằng DOM (không cần tin chuỗi HTML):

```js
TdHovercard.bind(trigger, {
  content: async (t) => {
    const res = await fetch(`/api/users/${encodeURIComponent(t.dataset.userId)}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const user = await res.json();
    const box = document.createElement('div');
    const h = document.createElement('strong');
    h.textContent = user.name;               // text: an toàn với dữ liệu người dùng
    const bio = document.createElement('p');
    bio.textContent = user.bio;
    box.append(h, bio);
    return box;
  },
});
```

Lưu ý: fetch trong `content()` là của bạn — kit không cache, không giới hạn kích thước hay timeout cho nó (các giới hạn
ở mục 3 chỉ áp cho nguồn `url`). Kit vẫn đảm bảo kết quả trễ không đè lên card mới (render token, xem
[Lưu ý](#lưu-ý--lỗi-thường-gặp)).

### 2. `<template>` — markup render sẵn (hợp với PHP/WordPress)

```html
<a href="/u/7" data-td-hovercard-template="hc-user-7" data-td-hovercard-label="Hồ sơ Lan">Lan</a>

<template id="hc-user-7">
  <strong>Nguyễn Lan</strong>
  <p>Biên tập viên</p>
  <a href="/u/7">Xem hồ sơ</a>
</template>
```

```js
TdHovercard.bindAll(); // một lần cho cả trang
// hoặc: TdHovercard.bind(link, { template: 'hc-user-7' })   // id, '#id' hoặc chính HTMLTemplateElement
```

Nội dung `<template>` được **clone** (không parse chuỗi). Id không tồn tại hoặc không phải `<template>` →
`console.warn`, card không mở. Template được tìm trong cùng root node với trigger, sau đó trong `document`.

### 3. URL cùng origin — fragment do server trả

```html
<a href="/u/7" data-td-hovercard="/api/users/7/card">Lan</a>
```

```js
TdHovercard.bindAll();
// hoặc: TdHovercard.bind(link, { url: '/api/users/7/card', cache: true })
```

Server trả **một trong hai** dạng:

- `Content-Type: application/json` (hoặc `…+json`) với body `{ "html": "<p>…</p>" }` — `html` phải là chuỗi;
- `Content-Type: text/html` với body là fragment HTML.

Mọi kiểu khác, status không 2xx, JSON sai → trạng thái lỗi.

Ví dụ endpoint PHP (escape mọi dữ liệu người dùng **trên server**):

```php
<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store'); // dữ liệu theo phiên đăng nhập → không cache
$u = find_user((int) $_GET['id']);
$e = fn($s) => htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
echo json_encode([
  'html' => '<strong>' . $e($u['name']) . '</strong><p>' . $e($u['title']) . '</p>',
]);
```

Quy tắc fetch (cố định trong lõi):

| Quy tắc | Giá trị |
|---|---|
| URL hợp lệ | Chỉ `http(s)` **cùng origin** với trang (URL tương đối được resolve theo trang). Khác origin, `javascript:`, `data:`… → `console.warn`, không fetch, không mở |
| Request | `credentials: 'same-origin'`, `mode: 'same-origin'` (redirect sang origin khác cũng thất bại), `cache: 'no-store'`, header `Accept: application/json, text/html;q=0.9` |
| Cache | Trong bộ nhớ, **LRU 50 mục**, khoá = URL tuyệt đối **bỏ `#fragment`** (`/card#1` và `/card#2` là một request). Chỉ cache kết quả **thành công**; lỗi không cache nên lần hover sau thử lại |
| Kích thước | Body > **256 KB** → lỗi (đọc theo stream, không buffer cả khối lớn; `Content-Length` khai quá giới hạn → từ chối mà không đọc) |
| Thời gian | Quá **10 giây** → huỷ, lỗi |
| Đồng thời | **Một request tại một thời điểm**; request cũ bị huỷ khi card đóng hoặc chuyển sang trigger khác (request bị huỷ không vào cache) |
| `Cache-Control: no-store` | Response có header này **không bao giờ** được cache |
| Tắt cache theo trigger | `cache: false` (tuỳ chọn `bind`) hoặc `data-td-hovercard-cache="false"` |
| `TdHovercard.clearCache()` | Xoá toàn bộ cache, huỷ request đang chạy **và đóng card** đang mở |

`cache: 'no-store'` nghĩa là HTTP cache của trình duyệt bị bỏ qua: LRU của component là **lớp cache duy nhất**, nên
`clearCache()` và `cache: false` luôn có hiệu lực thật.

**Bắt buộc** gọi `clearCache()` khi phiên thay đổi trong SPA (logout, login, đổi tenant, đổi quyền) — nếu không, người
dùng sau có thể thấy fragment của người dùng trước:

```js
async function logout() {
  await fetch('/logout', { method: 'POST' });
  TdHovercard.clearCache();
}
```

Trang reload toàn bộ (PHP truyền thống) thì cache tự mất theo trang.

### 4. Trigger khai báo + `bindAll()`

```js
const unbindAll = TdHovercard.bindAll();             // root = document
TdHovercard.bindAll(document.querySelector('#feed')); // hoặc một vùng
```

- Event delegation: trigger thêm vào sau vẫn hoạt động. Gọi lại `bindAll(root)` trên cùng root → **làm mới ARIA**
  cho trigger mới và trả về cùng hàm unbind (idempotent).
- Trigger đã `bind()` riêng thì `bind()` thắng (bindAll bỏ qua sự kiện của nó).
- Trigger nằm **bên trong** card bị bỏ qua (không có hovercard lồng nhau).

### 5. Hovercard trong modal

Card nằm ở lớp `--td-z-popover` (450), trên `TdModal`, và hợp đồng bàn phím (mục
[Bàn phím](#bàn-phím--trợ-năng)) hoạt động cả bên trong focus trap của modal: Tab vào card, Tab ra khỏi phần tử cuối
thì đi tiếp sau trigger trong modal, Escape chỉ đóng card chứ không đóng modal.

## Attribute (trên trigger)

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `data-td-hovercard` | URL | — | Nguồn URL cùng origin (dùng với `bindAll()`) |
| `data-td-hovercard-template` | id | — | Id của `<template>` (có thể có `#` đầu). Thắng `data-td-hovercard` nếu có cả hai |
| `data-td-hovercard-label` | string | — | Tên truy cập (`aria-label`) của card |
| `data-td-hovercard-cache` | `"false"` | (cache bật) | `"false"` → không cache fragment của trigger này |

Kit tự đặt trên trigger khi bind: `aria-haspopup="dialog"`, `aria-expanded="false|true"`, `aria-controls="td-hovercard"`
(khi đang mở), và `tabindex="0"` nếu trigger không Tab tới được (kể cả `tabindex="-1"`). Unbind khôi phục đúng giá trị
cũ của bốn attribute này.

## Property & method

| Chữ ký | Trả về | Mô tả |
|---|---|---|
| `TdHovercard.bind(trigger, opts?)` | `() => void` | Gắn một trigger. Bind lại cùng trigger → thay binding cũ. Unbind: gỡ listener, khôi phục ARIA/`tabindex`, đóng card nếu nó thuộc binding này |
| `TdHovercard.bindAll(root = document)` | `() => void` | Trigger khai báo trong `root` (delegation, idempotent) |
| `TdHovercard.close()` | `void` | Đóng card đang mở; focus về trigger chỉ khi focus đang ở trong card |
| `TdHovercard.clearCache()` | `void` | Xoá cache URL, huỷ request, đóng card |
| `TdHovercard.sanitize` | `null \| (html) => string \| Node \| TrustedHTML` | Hook lọc mọi nguồn **chuỗi** trước `innerHTML` (mặc định `null`) |
| `TdHovercard.labels` | `{ loading, error, dialog }` | Nhãn tiếng Việt, ghi đè theo site |

Không có `open()` công khai: card chỉ mở theo hover / focus của trigger.

Named export phụ: `hovercardUrl(raw)` → URL tuyệt đối nếu `raw` là http(s) cùng origin, ngược lại `null` (đúng hàm kit
dùng để kiểm URL).

### Tuỳ chọn của `bind()`

| Tuỳ chọn | Kiểu | Mô tả |
|---|---|---|
| `content` | `(trigger) => Node \| string \| TrustedHTML \| null \| Promise<…>` | Nguồn JS |
| `template` | `HTMLTemplateElement \| string` | Template hoặc id |
| `url` | `string` | URL cùng origin |
| `cache` | `boolean` | `false` → không cache fragment của URL này (mặc định bật) |
| `label` | `string` | Tên truy cập của card |

Tên truy cập của card lấy theo thứ tự: `label` → `data-td-hovercard-label` → `aria-label` của trigger → text của trigger
(gộp khoảng trắng, cắt ở 80 ký tự kèm `…`) → `TdHovercard.labels.dialog`.

### Nhãn (`TdHovercard.labels`)

| Khoá | Mặc định | Dùng ở |
|---|---|---|
| `loading` | `Đang tải…` | Trạng thái đang tải |
| `error` | `Không tải được nội dung.` | Trạng thái lỗi |
| `dialog` | `Thông tin thêm` | Tên card khi không tìm được tên nào khác |

```js
TdHovercard.labels.loading = 'Loading…';
TdHovercard.labels.error = 'Could not load.';
```

## Hook & tuỳ chọn

### `TdHovercard.sanitize` — lọc HTML

Mặc định (`null`) mọi **chuỗi** (chuỗi từ `content()` và mọi fragment URL) được coi là HTML tin cậy. Nếu fragment có
thể chứa nội dung do người dùng tạo (bio, chữ ký, mô tả hồ sơ…), **bắt buộc** gắn sanitizer:

```js
import DOMPurify from 'dompurify';
import { TdHovercard } from '@dazzxq/td-components/hovercard';

TdHovercard.sanitize = (html) => DOMPurify.sanitize(html);
```

- Hook nhận chuỗi, trả chuỗi, `Node` hoặc `TrustedHTML`. Nguồn `Node` / `<template>` **không** đi qua hook.
- Hook throw → trạng thái lỗi (fail closed).
- Có thể dùng Sanitizer API của trình duyệt hoặc `createHTML` của một policy Trusted Types.

### Trusted Types

Site bật `Content-Security-Policy: require-trusted-types-for 'script'`: gán chuỗi thường vào `innerHTML` sẽ bị trình
duyệt chặn → card hiện **trạng thái lỗi** (fail closed, không vỡ trang). Hãy để hook trả `TrustedHTML`:

```js
TdHovercard.sanitize = (html) => DOMPurify.sanitize(html, { RETURN_TRUSTED_TYPE: true });
```

hoặc dùng policy của riêng bạn:

```js
const policy = trustedTypes.createPolicy('td-hovercard', {
  createHTML: (s) => DOMPurify.sanitize(s),
});
TdHovercard.sanitize = (html) => policy.createHTML(html);
```

`content()` cũng có thể trả thẳng `TrustedHTML`. Spinner của trạng thái tải được dựng bằng DOM API nên không cần policy.

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-hovercard-max-w` | `20rem` | Chiều rộng tối đa (luôn ≤ `100vw - 16px`; tối thiểu `10rem`) |
| `--td-hovercard-pad-y` | `0.75rem` | Padding dọc |
| `--td-hovercard-pad-x` | `0.9rem` | Padding ngang |
| `--td-hovercard-skeleton-w` | `16rem` | 0.62.0: chiều rộng card khi đang tải (≤ `100vw - 16px`). Nội dung tới sau đó **không làm card nhỏ đi** (min-size = kích thước lúc tải) |
| `--td-hovercard-skeleton-h` | `5rem` | 0.62.0: chiều cao tối thiểu card khi đang tải |
| `--td-hovercard-skeleton-avatar` | `2.5rem` | 0.62.0: đường kính đĩa avatar giả |
| `--td-hovercard-status-fg` | `var(--td-color-text-muted)` | Màu dòng trạng thái (chữ "Đang tải…" chỉ dành cho trình đọc màn hình từ 0.62.0) |
| `--td-hovercard-error-fg` | `var(--td-color-error)` (dark: `#fca5a5`) | Màu dòng lỗi |
| `--td-hovercard-link-fg` | `var(--td-accent)` (dark: `#93c5fd`) | Màu link trong card |

```css
:root {
  --td-hovercard-max-w: 24rem;
}
/* style nội dung của bạn bằng class — style="" trong fragment bị CSP strict chặn */
.td-hovercard .author-card__avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
}
```

Card là popup nhỏ (`.td-glass-surface--strong`, 0.20.0: nền 94 % + `blur(12px)` + viền mảnh + một bóng mềm, mở bằng
fade), bo góc `--td-glass-radius`, cao tối đa `min(viewport − 16px, 480px)`
rồi tự cuộn. Kit chỉ chuẩn hoá lề đầu/cuối, màu link và vòng focus bên trong card; phần còn lại là CSS của bạn.

## Cấu trúc DOM & class

Một card **duy nhất** (singleton) cho cả trang, là con của `<body>`, tạo lần đầu mở, sau đó được ẩn (không gỡ) khi đóng:

```html
<div class="td-hovercard td-glass-surface td-glass-surface--strong" id="td-hovercard" role="dialog"
     tabindex="-1" aria-label="Hồ sơ Lan" data-state="open" data-placement="bottom">
  … nội dung của bạn …
</div>

<!-- trạng thái tải (0.62.0): skeleton + aria-busy; nhãn chỉ cho trình đọc màn hình -->
<div class="td-hovercard …" data-state="loading" aria-busy="true">
  <p class="td-hovercard__status td-hovercard__status--skeleton" role="status">
    <span class="td-hovercard__skeleton" aria-hidden="true">
      <span class="td-skeleton td-skeleton--circle td-hovercard__sk-avatar"></span>
      <span class="td-hovercard__sk-lines">
        <span class="td-skeleton td-hovercard__sk-title"></span>
        <span class="td-skeleton td-skeleton--text td-skeleton--lines-2"></span>
      </span>
    </span>
    <span class="td-hovercard__text td-sr-only">Đang tải…</span>
  </p>
</div>

<!-- trạng thái lỗi -->
<div class="td-hovercard …" data-state="error">
  <p class="td-hovercard__status" role="status">
    <span class="td-hovercard__text">Không tải được nội dung.</span>
  </p>
</div>
```

| Attribute | Giá trị |
|---|---|
| `data-state` | `loading`, `open`, `error`, `closed` |
| `data-placement` | `bottom` (ưu tiên, căn trái theo trigger) hoặc `top` (khi lật) |
| `hidden` | Có khi card đóng |

Site render server-side (dwp/135) chỉ cần in **trigger** (`<a>`/`<button>` với `data-td-hovercard` hoặc
`data-td-hovercard-template`) và `<template>`; card luôn do JS tạo. Markup trigger: xem ví dụ ở đầu trang và
[WordPress & PHP › Hovercard](../guides/wordpress-php.md#hovercard-tdhovercardbindallroot) (không có helper PHP; fixture
`test/contracts/hovercard.html` trong repo kit chỉ dùng cho test, không nằm trong gói npm).

## Bàn phím & trợ năng

**Chuột**: chỉ trên thiết bị `(hover: hover) and (pointer: fine)`. Rê lên trigger **350 ms** thì hiện; rời đi thì ẩn
sau **250 ms** (thời gian ân hạn để di chuột sang card). Card vẫn mở khi chuột **hoặc** focus còn ở trigger hay card.
Lướt qua nhanh hơn 350 ms không mở. Click chuột (focus do chuột) vẫn phải chờ 350 ms như hover.

**Cảm ứng**: con trỏ touch bị bỏ qua — chạm vào trigger đi theo `href` / click của chính nó. Focus sinh ra do chạm
(trong 1 giây sau khi chạm) không mở card.

**Bàn phím** (mọi thiết bị): focus thấy được (`:focus-visible`) vào trigger → card mở **ngay**.

| Focus ở | Phím | Hành vi |
|---|---|---|
| Trigger | `Tab` | Vào phần tử focus được đầu tiên trong card; card chưa có (đang tải) → Tab đi tiếp bình thường |
| Trigger | `Shift+Tab` | Đi lùi bình thường |
| Phần tử đầu trong card | `Shift+Tab` | Về trigger |
| Phần tử cuối trong card | `Tab` | Đóng card, focus trigger rồi đi tiếp tới phần tử sau trigger (hoặc tiếp tục trong focus trap của modal) |
| Trigger hoặc card | `Escape` | Đóng; focus về trigger |
| Chỉ rê chuột | `Escape` | Đóng **không cướp focus**; card không mở lại cho tới khi chuột rời trigger (WCAG 1.4.13) |

Khác: card là `role="dialog"` có tên (`aria-label`); bấm ra ngoài đóng card; trigger cuộn khuất hoặc bị gỡ → đóng;
cuộn / resize → định vị lại (tự lật, kẹp trong viewport). Card trên modal giữ bề mặt của nó.
`prefers-reduced-motion`: chỉ fade. `forced-colors`: có viền. Trên thiết bị cảm ứng, nút/input trong card cao tối
thiểu `--td-touch-min`.

## Bảo mật

Đây là một trong số ít **raw-HTML hatch** của kit:

1. **Chuỗi = HTML tin cậy.** Chuỗi từ `content()` và mọi fragment URL đi vào `innerHTML`. Chỉ dùng cho markup do dev
   viết hoặc fragment cùng origin mà **server đã escape**. Không bao giờ nối input thô của người dùng vào chuỗi.
2. **Ưu tiên Node hoặc `<template>`** — không có bước parse chuỗi.
3. **Fragment có nội dung người dùng** → gắn `TdHovercard.sanitize` (DOMPurify / Sanitizer API / Trusted Types).
4. **URL chỉ cùng origin**, request `mode: 'same-origin'`; không thể dùng hovercard để kéo HTML từ domain khác.
5. **Dữ liệu theo phiên**: trả `Cache-Control: no-store` từ server hoặc `data-td-hovercard-cache="false"`, và gọi
   `TdHovercard.clearCache()` khi logout/login/đổi tenant hoặc quyền.
6. **CSP strict**: `style="…"` trong fragment bị chặn — dùng class. `<script>` trong fragment không chạy (hành vi của
   `innerHTML`), nhưng handler kiểu `onerror=` thì có — đó là lý do phải sanitize nội dung người dùng.
7. Nhãn, tên truy cập, trạng thái tải/lỗi luôn là text.

Xem [Hướng dẫn bảo mật](../guides/security.md) và [CSP](../guides/csp.md).

## Lưu ý & lỗi thường gặp

- **Card đi theo "chủ" của nó (0.21.1).** Popup tự đóng khi trigger bị khung cuộn cắt, bị ẩn mà không cần
  cuộn (chuyển tab, accordion đóng, `display: none`), bị gỡ khỏi DOM, hoặc khi một modal / lightbox **mới** mở đè lên
  bằng code (timer, hết phiên…) — focus đi vào lớp mới, popup không còn bấm xuyên được. Modal / lightbox chứa trigger
  đóng → popup đóng ngay (không đợi hiệu ứng thoát). Mở popup lúc modal đang chạy hiệu ứng vào (vd. trong `onShow`)
  → vị trí được đặt lại khi hiệu ứng kết thúc.
- **Menu mở từ nút trong card (0.21.1):** card giữ mở khi menu con (TdMenu) đang mở — kể cả khi chuột rời card
  sang menu; bấm vào menu không tính là "bấm ra ngoài". Card đóng → menu con đóng trước.
- **Không có gì xảy ra với `data-td-hovercard`**: chưa gọi `TdHovercard.bindAll()`.
- **Card không mở với URL**: URL khác origin (xem console: `refused … only http(s) URLs of this origin`), hoặc server
  trả sai `Content-Type` (phải là JSON có `html` chuỗi, hoặc `text/html`).
- **Node biến mất khỏi trang sau khi hover**: `content()` trả node đang nằm trên trang → nó bị **chuyển** vào card.
  Trả `node.cloneNode(true)`.
- **Người dùng mới thấy dữ liệu người cũ**: quên `clearCache()` khi đổi phiên.
- **Trên điện thoại không thấy card**: đúng thiết kế (không có hover). Đảm bảo trigger là link/nút dẫn tới trang đầy
  đủ.
- **Race khi dữ liệu về chậm**: không cần tự xử lý. Mọi nguồn bất đồng bộ (Promise của `content()`, fetch) được gác
  bởi **một render token**, tăng khi mở, đổi trigger, đóng, unbind. Kết quả (hay lỗi) mang token cũ không bao giờ chạm
  vào card — ví dụ hover A rồi B, A về sau B thì B vẫn thắng.
- **Style nội dung không ăn**: nội dung có `style="…"` dưới CSP strict → chuyển sang class.

## Xem thêm

- [Tooltip](tooltip.md) · [Menu](menu.md) · [Modal](modal.md)
- [Hook & tuỳ chọn theo component](../customization/hooks.md)
- [Bảo mật](../guides/security.md) · [CSP](../guides/csp.md) · [Trợ năng](../guides/accessibility.md)
- [Tích hợp WordPress / PHP](../guides/wordpress-php.md) (render `<template>` và endpoint fragment)
