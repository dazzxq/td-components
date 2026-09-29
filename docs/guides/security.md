[Tài liệu](../README.md) › Hướng dẫn › Bảo mật

# Bảo mật: site phải làm gì

Trang này dành cho **người viết site** dùng td-components (dwp, 135…). Nó trả lời: chuỗi nào kit coi là **text** (tự
escape), chuỗi nào là **HTML thô** (bạn chịu trách nhiệm), URL nào kit chấp nhận, kit tin tưởng những gì, và checklist
trước khi lên production.

Quy tắc cốt lõi của kit: **mặc định mọi chuỗi là text**. HTML thô chỉ đi qua vài "cửa hậu" (hatch) được đặt tên rõ
ràng, và mỗi cửa đều có phương án an toàn hơn (truyền `Node`).

Tài liệu nội bộ cho người viết component: [security-model](../internal/security-model.md).

## Mục lục

- [Text hay HTML: bảng theo API](#text-hay-html-bảng-theo-api)
- [Các cửa HTML thô (raw-HTML hatch)](#các-cửa-html-thô-raw-html-hatch)
- [TdHovercard: sanitize, cache và đổi phiên](#tdhovercard-sanitize-cache-và-đổi-phiên)
- [td-dropzone: upload file](#td-dropzone-upload-file)
- [Chính sách URL](#chính-sách-url)
- [Những thứ kit tin tưởng (trust assumptions)](#những-thứ-kit-tin-tưởng-trust-assumptions)
- [CSS injection](#css-injection)
- [Escaping ở phía server (PHP)](#escaping-ở-phía-server-php)
- [Trusted Types](#trusted-types)
- [Checklist trước khi lên production](#checklist-trước-khi-lên-production)

## Text hay HTML: bảng theo API

"Text" nghĩa là kit tự escape (hoặc gán bằng `textContent`): `<b>` sẽ hiện nguyên chữ `<b>`, không bao giờ thành thẻ.
Bạn **không cần** escape trước (escape trước sẽ hiện `&amp;lt;` lên màn hình).

| API | Loại | Ghi chú |
|---|---|---|
| Attribute `label`, `placeholder`, `helper-text`, `error-text`, `title`, `message` của mọi element | text | |
| `setError(msg)`, `setHelper(msg)`, `setCustomValidity(msg)` | text | |
| `TdToast.show/success/error/warning/info(message)` | text | |
| `TdModal.show({ title })`, nhãn nút `actions[].label` | text | |
| `TdModal.show({ body: Node })` | Node (tin cậy) | cách khuyên dùng |
| `TdModal.show({ body: '<string>' })` | **HTML thô** | hatch — xem dưới |
| `TdModal.confirm/success/error/info({ message })` | text | |
| `TdModal.confirm/…({ messageHtml })` | **HTML thô** | hatch |
| `TdModal.show({ footer })` | Element (tin cậy) | gắn nguyên |
| `data-tooltip` / `data-dwp-tooltip` | text | |
| `TdMenu` item `label`, `hint` | text | |
| `TdMenu` item `icon` (tên registry) / `iconNode` | tên / SVGElement tin cậy (được clone) | không nhận chuỗi SVG |
| `td-dropdown` option label (`label-key`) | text | |
| `td-chip-input` label, description, chữ gõ, kết quả `search()` | text | |
| `td-chip-input` `renderOption()` / `renderChip()` | Node hoặc text | **không** có hatch HTML |
| `td-table` ô không có `render` | text | |
| `td-table` column `render(row, i)` trả về Node | Node (tin cậy) | khuyên dùng |
| `td-table` column `render(row, i)` trả về chuỗi | **HTML thô** | hatch |
| `td-tabs` `label`, `td-empty-state` `title`/`message`, `td-pagination` | text | |
| `td-empty-state` `icon` là chuỗi SVG (deprecated) | chuỗi SVG **được lọc** | chỉ giữ hình học trong allowlist; `script`, `foreignObject`, `use`, `on*`, `style`, `url()` → bị từ chối, hiện icon `inbox` |
| `td-empty-state` `iconNode` | SVGElement tin cậy | |
| `registerIcons()` | dữ liệu (tag + thuộc tính hình học trong allowlist) | chuỗi markup SVG bị từ chối |
| `TdHovercard` `content()` trả về Node / `template` | Node / `<template>` (clone) | khuyên dùng |
| `TdHovercard` `content()` trả về chuỗi, fragment tải từ `url` | **HTML thô** | hatch — xem [bên dưới](#tdhovercard-sanitize-cache-và-đổi-phiên) |
| `TdLightbox` item `caption`, `alt`, `labels.*` | text | |
| `TdLightbox` `panel(ctx)` | Element (tin cậy) | chuỗi bị **bỏ qua** |
| `TdLightbox` toolbar `label` / `icon` / `iconNode` | text / tên / SVGElement tin cậy | |
| `TdFormValidation` mọi thông báo, `labels.summaryTitle` | text | |
| `td-dropzone` tên file (danh sách, dòng bị loại, `aria-label` nút xoá), `TdDropzone.labels.*`, `accept-label` | text | tên file do người dùng đặt — chỉ gán bằng `textContent` / `setAttribute` |
| `td-dropzone` lý do lỗi upload (`message` của giá trị hook `upload` reject) | text, chỉ chuỗi, ≤ 200 ký tự | kiểu khác → nhãn chung; nội dung phải an toàn cho người dùng (xem [td-dropzone](#td-dropzone-upload-file)) |
| `td-progress` `label` | text | |

## Các cửa HTML thô (raw-HTML hatch)

Chỉ có bốn cửa. Qua chúng, chuỗi được gán thẳng vào `innerHTML`:

| Cửa | Ở đâu | Phương án an toàn hơn |
|---|---|---|
| `TdModal.show({ body: string })` | thân modal | truyền `Node` (dựng bằng DOM API hoặc clone `<template>`) |
| `messageHtml` của `confirm/success/error/info` | đoạn thông báo | dùng `message` (text) |
| `td-table` `render()` trả chuỗi | ô bảng | trả `Node` |
| `TdHovercard` chuỗi từ `content()` và fragment từ `url` | card | `Node`/`template`, hoặc bật `TdHovercard.sanitize` |

Luật dùng:

1. **Chỉ markup do developer viết**, không bao giờ nối chuỗi với dữ liệu người dùng chưa escape.
2. Nếu buộc phải chèn dữ liệu, escape theo ngữ cảnh (text HTML / attribute có ngoặc kép) — hoặc tốt hơn, dựng Node và
   gán `textContent`.
3. Dưới CSP strict, markup đi qua các cửa này cũng phải "sạch CSP": **không `style="…"`, không `<style>`, không
   `onclick="…"`** — chúng sẽ bị trình duyệt chặn (xem [CSP](csp.md)).

Sai và đúng với bảng:

```js
// SAI: tên người dùng có thể chứa <img src=x onerror=…>
{ key: 'name', label: 'Tên', render: (row) => `<strong>${row.name}</strong>` }

// ĐÚNG: trả Node, dữ liệu vào bằng textContent
{
  key: 'name',
  label: 'Tên',
  render: (row) => {
    const b = document.createElement('strong');
    b.textContent = row.name;
    return b;
  },
}
```

Modal với nội dung động:

```js
import { TdModal } from '@dazzxq/td-components/modal';

const body = document.createElement('div');
const p = document.createElement('p');
p.textContent = `Xoá bài "${post.title}"?`; // text, an toàn
body.append(p);
TdModal.show({ title: 'Xác nhận', body });
// hoặc đơn giản: TdModal.confirm({ title: 'Xác nhận', message: `Xoá bài "${post.title}"?` })
```

## TdHovercard: sanitize, cache và đổi phiên

`TdHovercard` là component duy nhất **tải HTML từ server** và render nó. Các lớp bảo vệ có sẵn:

- URL phải là `http(s)` **cùng origin** với trang; khác origin → từ chối + `console.warn`. Fetch dùng
  `mode: 'same-origin'` (redirect sang origin khác cũng thất bại), `credentials: 'same-origin'`.
- Chỉ nhận `application/json` dạng `{ "html": "…" }` hoặc `text/html`; loại khác / HTTP lỗi → trạng thái lỗi.
- Body > 256 KB hoặc request > 10 giây → lỗi. Một request tại một thời điểm, huỷ khi card đóng/đổi.
- Cache trong bộ nhớ: LRU 50 mục, khoá là URL tuyệt đối bỏ `#hash`; chỉ cache kết quả thành công; response có
  `Cache-Control: no-store` **không bao giờ** được cache; fetch dùng `cache: 'no-store'` (bỏ qua HTTP cache của trình
  duyệt, nên cache của component là lớp cache duy nhất).

### 1. Bật sanitize khi fragment có nội dung do người dùng tạo

Fragment chứa bio, tên hiển thị, nội dung bài viết… thì **phải** gắn sanitizer. Hook nhận **mọi chuỗi** (từ
`content()` và từ URL) trước khi vào `innerHTML`; nó có thể trả chuỗi, `Node`, hoặc `TrustedHTML`; nếu nó throw, card
hiện trạng thái lỗi.

```js
import DOMPurify from 'dompurify'; // site tự cài, kit không phụ thuộc DOMPurify
import { TdHovercard } from '@dazzxq/td-components/hovercard';

TdHovercard.sanitize = (html) => DOMPurify.sanitize(html, {
  FORBID_ATTR: ['style'],      // style="" bị CSP strict chặn đằng nào cũng vậy
  RETURN_TRUSTED_TYPE: true,   // trả TrustedHTML khi trình duyệt hỗ trợ Trusted Types
});
TdHovercard.bindAll(document);
```

`RETURN_TRUSTED_TYPE: true` giúp trang **đang bật** Trusted Types (chuỗi thường sẽ bị từ chối — card hiện lỗi thay vì
chèn). Trên trình duyệt không có Trusted Types, DOMPurify trả chuỗi đã lọc như thường.

Server-side vẫn phải escape: sanitizer là lớp thứ hai, không thay thế việc escape khi render fragment.

### 2. Xoá cache khi đổi phiên

Fragment được tải **kèm cookie**, nên nội dung có thể riêng cho người đang đăng nhập. Trong SPA (không tải lại trang),
**bắt buộc** gọi:

```js
TdHovercard.clearCache(); // xoá cache, huỷ request đang chạy, đóng card đang mở
```

khi: đăng xuất, đăng nhập, đổi tài khoản, đổi tenant/site, đổi quyền. Không gọi → người dùng sau có thể thấy fragment của
người trước. (Trang tải lại hoàn toàn thì cache mất theo, không cần.)

### 3. Tắt cache cho dữ liệu nhạy cảm

- Server trả `Cache-Control: no-store` cho endpoint fragment theo người dùng — component sẽ không cache.
- Hoặc theo trigger: `TdHovercard.bind(el, { url, cache: false })` / `data-td-hovercard-cache="false"`.

### 4. Endpoint fragment

- Chỉ `GET`, **không đổi trạng thái** (hover là tự động — không được có "tác dụng phụ").
- Tự kiểm tra quyền như mọi endpoint khác; đừng giả định "chỉ card mới gọi".
- Nên trả `X-Content-Type-Options: nosniff` và `Content-Type` chính xác.

## td-dropzone: upload file

`<td-dropzone>` ([trang component](../components/dropzone.md)) lọc file theo `accept`, `max-size`, `max-files` **ngay
trên trình duyệt**. Việc lọc này chỉ là **gợi ý UX**, không phải lớp bảo vệ:

- Người dùng bỏ qua được dễ dàng: đổi đuôi file (`virus.exe` → `anh.png`), sửa `accept` bằng DevTools, gửi request
  thẳng không qua form. `File.type` là do trình duyệt **đoán theo đuôi**, không đọc nội dung.
- **Server phải kiểm lại** mọi thứ: loại file theo **nội dung** (magic bytes / `finfo_file()` của PHP, không tin
  `$_FILES[…]['type']` hay đuôi), kích thước (cấu hình `upload_max_filesize` / `post_max_size` + kiểm tra riêng), số
  file, quyền của người dùng.
- Lưu file ngoài web root (hoặc thư mục không cho thực thi script), đặt **tên mới** do server sinh; không dùng tên
  gốc làm đường dẫn (path traversal `../`), chỉ hiển thị lại tên gốc sau khi escape.
- Ảnh do người dùng tải lên: trả về kèm `Content-Type` đúng + `X-Content-Type-Options: nosniff`; SVG người dùng tải
  lên có thể chứa script — không phục vụ SVG đó cùng origin, hoặc chuyển sang ảnh raster.

Kit không đọc nội dung file. Chỉ khi site bật `preview`, kit tạo object URL (`blob:`) cho **ảnh** để hiện thumbnail
(thu hồi khi xoá / reset / rời trang) → CSP cần `img-src 'self' blob:`. Hook `upload(file, { onProgress, signal })`
là **code của site**: endpoint upload phải có CSRF token / kiểm tra phiên như mọi request thay đổi dữ liệu.

**Thông báo lỗi của hook (0.19.0).** Hook reject bằng `Error` có `message` chuỗi → kit hiện chuỗi đó ở dòng file
(chỉ `textContent`, cắt 200 ký tự; `message` không phải chuỗi hoặc không có → nhãn chung "Tải lên thất bại"). Không có
nguy cơ XSS, nhưng người dùng **đọc nguyên văn**: đừng chuyển thẳng body lỗi của server (stack trace, đường dẫn file,
câu SQL, tên bảng, mã nội bộ). Server trả một chuỗi đã soạn cho người dùng (ví dụ `{"message": "File quá 5 MB"}`), còn
chi tiết kỹ thuật ghi vào log phía server.

## Chính sách URL

| Nơi | Chính sách mặc định | Đổi thế nào |
|---|---|---|
| `TdLightbox` `src`, `poster`, link tải (`download`) | `https:` luôn được; `http:` **chỉ khi trang cũng là http** (không hạ cấp từ HTTPS); scheme khác (`data:`, `blob:`, `file:`, `javascript:`…) bị từ chối. Item không còn `src` hợp lệ bị bỏ | option `isAllowedUrl(url, item) => boolean` (throw = từ chối) |
| `TdLightbox` nút tải mặc định | chỉ hiện cho **ảnh cùng origin** | hook `download(item, ctx) => url` (URL trả về vẫn qua `isAllowedUrl`) |
| `TdMenu` item `href` | `https:` luôn được; `http:` chỉ trên trang http; link tương đối xét theo protocol **sau khi resolve**; `mailto:`, `tel:`, `javascript:`, `data:`, chuỗi không parse được → item thành **nút disabled** + `console.warn` | option `isAllowedUrl(url) => boolean` của `open`/`bind` (0.17.0) **thay hoàn toàn** chính sách mặc định (chỉ `javascript:` luôn bị chặn) — mọi bảo vệ khác (`data:`, `blob:`, `file:`, hạ cấp HTTP) do hàm của bạn quyết. Nên **ghép** với chính sách mặc định và chỉ mở thêm đúng scheme cần (ví dụ `blob:` của chính trang); dùng `onSelect` cho mail/điện thoại nếu không muốn mở rộng |
| `<td-button href>` / PHP `td_button`, `td_link` | `https:`, `mailto:`, `tel:`, tương đối, `#`; `http:` chỉ trên trang http (JS) / khi site bật `Td::allowHttpLinks()` (PHP); khác → link thành **disabled** (không `href`) | JS: không đổi được; PHP: `Td::allowHttpLinks(true)` cho host HTTP cũ |
| `TdMenu` item `newTab: true` | `target="_blank" rel="noopener noreferrer"` | — |
| `TdHovercard` `url` / `data-td-hovercard` | chỉ http(s) **cùng origin** | không đổi được (thiết kế) |

Chuẩn hoá trước khi kiểm tra: `TdMenu` bỏ ký tự điều khiển và tab/xuống dòng (`"java\tscript:"` không lọt được).

### Lightbox: thu hẹp về allowlist host của bạn

Mặc định lightbox **chấp nhận mọi ảnh HTTPS khác origin**. Nếu `src` có thể đến từ dữ liệu người dùng (link trong bài
viết, markup do người dùng soạn), hãy giới hạn về CDN của bạn:

```js
import { TdLightbox } from '@dazzxq/td-components/lightbox';

const MEDIA_HOSTS = new Set([location.host, 'cdn.aetv.vn']);
const isAllowedUrl = (url) => {
  try {
    const u = new URL(url, location.href);
    return u.protocol === 'https:' && MEDIA_HOSTS.has(u.host);
  } catch {
    return false;
  }
};

TdLightbox.bind(document, { isAllowedUrl });
```

Cùng danh sách host nên có trong `img-src` / `media-src` của CSP (xem [CSP](csp.md#nguồn-ảnh-video-và-fetch)).

## Những thứ kit tin tưởng (trust assumptions)

Kit **không kiểm tra** những thứ sau — chúng là code/DOM của chính bạn:

- **Node/Element bạn truyền vào**: `TdModal` `body`/`footer`, `TdLightbox` `panel(ctx)`, `iconNode` (menu, lightbox
  toolbar, empty-state), `renderOption`/`renderChip`/`render()` trả Node, hovercard `content()` trả Node và `<template>`.
  Kit gắn (hoặc clone) nguyên. Nếu bạn dựng Node bằng `innerHTML` từ dữ liệu người dùng, lỗ hổng là của Node đó.
- **Hook video của lightbox** `video(item, mount, { signal })`: code của bạn ghi vào `mount` (ví dụ tạo iframe
  YouTube, Plyr). `item.src` đã qua `isAllowedUrl`, nhưng việc dựng player an toàn là việc của hook.
- **Callback**: `onSelect`, `onClick`, `when(ctx)`, `filter(el, event)`, `search()`, `create()`, `rules`… chạy với toàn
  quyền của trang.

Và những thứ **không phải cơ chế phân quyền**:

- `TdLightbox.bind(root, { filter })` chỉ quyết định **click nào được mở viewer** (UX). Người dùng vẫn mở được URL ảnh
  trực tiếp. Quyền xem ảnh phải kiểm tra ở server/CDN.
- `TdMenu` `when(ctx)` ẩn mục menu — **không** chặn hành động. Endpoint mà `onSelect` gọi phải tự kiểm tra quyền.
- `ctx` của menu lấy từ `data-td-menu-*` (chuỗi) trên trigger — người dùng sửa được bằng DevTools. Ví dụ
  `data-td-menu-post-id="7"` → `ctx.postId === '7'`; server phải xác minh người dùng được thao tác trên bài 7.
- Validation phía client (`required`, `rules` của TdFormValidation) là UX. **Server luôn validate lại.**
- `disabled` / `aria-disabled` / mục menu disabled chỉ là giao diện.

## CSS injection

Giá trị đi vào ngữ cảnh CSS **không** an toàn chỉ nhờ `escapeHtml`. Kit xử lý như sau:

| Attribute / option | Bộ lọc | Nhận |
|---|---|---|
| `color` (button, checkbox, toggle, slider), `text-color` (button), `track-color` (slider), `active-color` (table, pagination), `data-tooltip-color` / `data-tooltip-text-color`, `color`/`trackColor` của `TdLoadingSpinner.create()` | `safeColor()` | hex 3/4/6/8 ký tự, tên màu chỉ gồm chữ (≤ 24), `rgb()/rgba()/hsl()/hsla()` với tham số số. Còn lại → bỏ, dùng token mặc định |
| `td-table` cột `width` / `minWidth` / `maxWidth` | `safeCssDimension()` | số + đơn vị `px em rem % vh vw ch fr` |
| `td-table` `max-height`, `TdModal` `width` / `height` | từ chối `url()`, `var()`, `image-set()`, `; { }`, rồi `CSS.supports()` | giá trị CSS hợp lệ đơn |
| `size`, `variant`, `type`, `align`… | whitelist | giá trị ngoài danh sách → mặc định |
| `attrPrefix` của `TdLightbox.bind` | regex `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` | sai → `console.warn`, dùng `td` |

Thêm một lớp nữa: kit ghi style bằng CSSOM (`el.style.setProperty(prop, value)`), vốn parse `value` như **một** giá trị,
nên `;` hay `}` không thể chèn khai báo thứ hai.

Với CSS riêng của site: đừng dựng chuỗi CSS từ dữ liệu người dùng. Nếu cần màu theo dữ liệu, tự kiểm tra trước rồi mới
ghi bằng CSSOM (`safeColor` của kit là module nội bộ, **không** nằm trong `package.json#exports` — chỉ dùng được như
method của `TdBaseElement` khi bạn tự viết component, xem [Base element](../components/base-element.md)):

```js
function applyUserColor(el, value) {
  const v = String(value ?? '').trim();
  // chỉ nhận màu hợp lệ theo trình duyệt, chặn url()/var()/expression và mọi thứ có ; { }
  if (!v || /[;{}]|url\(|var\(|expression/i.test(v) || !CSS.supports('color', v)) return false;
  el.style.setProperty('--my-color', v); // CSSOM: một giá trị, không chèn được khai báo khác
  return true;
}
```

## Escaping ở phía server (PHP)

Khi PHP render markup mà kit sẽ đọc, escape theo **ngữ cảnh HTML** như bình thường. Trình duyệt decode entity khi đọc
attribute, rồi kit coi giá trị là text — không bị escape hai lần trên màn hình.

```php
<?php
// 135 có h(); dwp (WordPress) dùng esc_attr() / esc_html() / esc_url()
function h(mixed $v): string {
    return htmlspecialchars((string) $v, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
}
?>
<td-input-field name="display_name" label="Tên hiển thị" value="<?= h($user['display_name']) ?>"
  error-text="<?= h($errors['display_name'] ?? '') ?>"></td-input-field>

<td-chip-input name="tags[]" label="Thẻ" value="<?= h(json_encode($tags, JSON_UNESCAPED_UNICODE)) ?>"></td-chip-input>

<button type="button" data-tooltip="<?= h($hint) ?>">?</button>

<a href="<?= h($photoUrl) ?>" data-td-lightbox data-td-lightbox-caption="<?= h($caption) ?>">
  <img src="<?= h($thumbUrl) ?>" alt="<?= h($alt) ?>">
</a>
```

Luôn **đặt attribute trong ngoặc kép**. Với `href`/`src` từ dữ liệu người dùng, lọc scheme trước khi in (dwp:
`esc_url()`; 135: `td_esc_url()` trong `src/Ui/escape.php`) — kit chỉ lọc URL mà **nó** dùng (lightbox, menu), không lọc
link thường của trang.

JSON đặt trong `<script>` (ví dụ dữ liệu cho `td-dropdown`): dùng `json_encode($data, JSON_HEX_TAG | JSON_HEX_AMP |
JSON_HEX_APOS | JSON_HEX_QUOT)` để `</script>` trong dữ liệu không đóng thẻ sớm. Xem
[WordPress & PHP](wordpress-php.md).

## Trusted Types

Trusted Types (`Content-Security-Policy: require-trusted-types-for 'script'`) chặn mọi phép gán chuỗi vào `innerHTML`.

- **Kit nói chung chưa tương thích**: các element render template bằng `this.innerHTML = this.render()` (chuỗi đã escape),
  và một số utility cũng dùng `innerHTML` với markup hằng. Dưới chế độ enforce, các chỗ đó sẽ bị trình duyệt chặn.
- **`TdHovercard` là ngoại lệ đã được test** dưới Trusted Types: spinner dựng bằng DOM API, `TrustedHTML` được nhận
  nguyên, chuỗi thường thất bại **an toàn** (hiện trạng thái lỗi, không có lỗi uncaught).
- Một policy `default` "cho qua mọi chuỗi" sẽ làm kit chạy được nhưng vô hiệu hoá luôn lợi ích của Trusted Types — không
  khuyên dùng. Nếu muốn thử, dùng `Content-Security-Policy-Report-Only` để thu báo cáo trước.

## Checklist trước khi lên production

**Nội dung**

- [ ] Không có chuỗi dữ liệu người dùng nào đi vào `TdModal body` (chuỗi), `messageHtml`, `td-table render()` (chuỗi),
      hovercard `content()` (chuỗi) mà chưa escape. Ưu tiên truyền Node.
- [ ] Fragment hovercard có nội dung người dùng → đã gắn `TdHovercard.sanitize` (DOMPurify, `RETURN_TRUSTED_TYPE: true`).
- [ ] Markup trong các hatch không có `style="…"`, `<style>`, `on*="…"`.
- [ ] PHP escape mọi giá trị động trong attribute (`h()` / `esc_attr()`), attribute có ngoặc kép.

**Phiên và cache**

- [ ] SPA gọi `TdHovercard.clearCache()` khi đăng nhập/đăng xuất/đổi tenant/đổi quyền.
- [ ] Endpoint fragment theo người dùng trả `Cache-Control: no-store`; chỉ GET, không tác dụng phụ, có kiểm tra quyền.

**URL**

- [ ] `TdLightbox` có `isAllowedUrl` giới hạn về host của bạn nếu `src` có thể đến từ người dùng.
- [ ] CSP `img-src` / `media-src` khớp danh sách host đó.
- [ ] Link thường của trang (không qua kit) được lọc scheme ở server.

**Upload file**

- [ ] Server kiểm lại loại (theo nội dung), kích thước và số file của mọi upload — không tin `accept` / `max-size` /
      `max-files` của `td-dropzone`; file lưu với tên do server sinh, ngoài web root.
- [ ] Lỗi mà hook `upload` của dropzone reject (hiện nguyên văn cho người dùng) là thông báo đã soạn cho người dùng —
      không stack trace, đường dẫn, SQL hay mã nội bộ.

**Phân quyền**

- [ ] Mọi hành động từ `TdMenu onSelect`, toolbar lightbox, form AJAX, hook `upload` của dropzone đều được server
      kiểm tra quyền; không dựa vào `when(ctx)`, `filter()`, `disabled`, validation client.
- [ ] Giá trị `ctx` từ `data-td-menu-*` được server xác minh.

**CSP**

- [ ] Header CSP không có `'unsafe-inline'` cho `style-src` (xem [CSP](csp.md)).
- [ ] Không bật `require-trusted-types-for 'script'` trên trang dùng kit (trừ khi chỉ dùng hovercard và đã test).

## Xem thêm

- [CSP](csp.md) — header khuyên dùng, nonce, xử lý sự cố
- [Hovercard](../components/hovercard.md), [Lightbox](../components/lightbox.md), [Menu](../components/menu.md),
  [Modal](../components/modal.md), [Table](../components/table.md), [Dropzone](../components/dropzone.md)
- [Hook & tuỳ chọn](../customization/hooks.md) — danh mục mọi hook
- [WordPress & PHP](wordpress-php.md) — escaping trong template
- Tài liệu nội bộ: [security-model](../internal/security-model.md), [ADR 0009 lightbox hooks](../internal/decisions/0009-td-lightbox-hooks.md)
