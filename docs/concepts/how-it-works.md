[Tài liệu](../README.md) › Khái niệm › Cách kit hoạt động

# Cách kit hoạt động

Trang này giải thích "bên trong" td-components ở mức đủ để bạn dùng đúng và gỡ lỗi được: component là gì, dữ liệu
đi vào bằng đường nào, event đi ra thế nào, form làm việc ra sao, các lớp nổi (modal, menu, toast…) chia bàn phím và
focus thế nào, và vì sao kit chạy được dưới CSP nghiêm ngặt. Chưa cài thì đọc [Cài đặt](../getting-started/installation.md)
và [Trang đầu tiên](../getting-started/quick-start.md) trước.

Mục lục:

- [Hai loại API: thẻ và lớp tĩnh](#hai-loại-api-thẻ-và-lớp-tĩnh)
- [Light DOM + td.css (không Shadow DOM)](#light-dom--tdcss-không-shadow-dom)
- [Attribute và property](#attribute-và-property)
- [Event](#event)
- [Vòng đời: gắn, gỡ, render lại](#vòng-đời-gắn-gỡ-render-lại)
- [Control nằm trong form (form-associated)](#control-nằm-trong-form-form-associated)
- [Lớp nổi: modal, menu, toast… chia bàn phím và focus](#lớp-nổi-modal-menu-toast-chia-bàn-phím-và-focus)
- [Mô hình CSP](#mô-hình-csp)
- [Mô hình bảo mật (tóm tắt)](#mô-hình-bảo-mật-tóm-tắt)
- [Nhãn và ngôn ngữ](#nhãn-và-ngôn-ngữ)
- [Ngôn ngữ thiết kế Liquid Glass (tóm tắt)](#ngôn-ngữ-thiết-kế-liquid-glass-tóm-tắt)

## Hai loại API: thẻ và lớp tĩnh

Kit có hai kiểu component, cách dùng khác nhau:

| Kiểu | Component | Cách dùng |
|---|---|---|
| **Custom element** (thẻ HTML) | `td-button`, `td-input-field`, `td-checkbox`, `td-toggle`, `td-slider`, `td-dropdown`, `td-chip-input`, `td-datetime-picker`, `td-table`, `td-tabs`, `td-pagination`, `td-empty-state`, `td-icon` | Viết thẻ trong HTML, import module để đăng ký |
| **Lớp tĩnh** (gọi hàm JS) | `TdModal`, `TdToast`, `TdLoading`, `TdMenu`, `TdHovercard`, `TdLightbox`, `TdFormValidation`, tooltip (`data-tooltip`) | `TdToast.success('…')`, `await TdModal.confirm({…})`; kit tự tạo phần tử và gắn vào `<body>` khi cần |

Import một module custom element là đủ để thẻ hoạt động: module gọi `customElements.define('td-…', …)` (có kiểm tra
`customElements.get` trước, nên import hai lần không lỗi). Module tooltip tự khởi tạo một singleton khi import: mọi phần
tử có `data-tooltip="…"` trên trang tự có tooltip. Các lớp tĩnh khác chỉ làm việc khi bạn gọi chúng.

## Light DOM + td.css (không Shadow DOM)

Nhiều thư viện Web Components giấu giao diện trong **Shadow DOM**: CSS của trang không chạm được vào bên trong. td
**cố ý không dùng Shadow DOM** ([ADR 0001](../internal/decisions/0001-web-components-no-shadow-dom.md)). Mỗi
component tự vẽ HTML thường (light DOM) ngay bên trong thẻ của nó:

```html
<!-- Bạn viết -->
<td-button variant="primary">Lưu</td-button>

<!-- Sau khi component chạy, DOM thật là (rút gọn) -->
<td-button variant="primary">
  <button class="td-btn td-btn--primary td-btn--md" type="button">
    <span class="td-btn__label">Lưu</span>
    <span class="td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true" hidden>…</span>
  </button>
</td-button>
```

Hệ quả:

- **Giao diện đến từ `td.css`**, một file duy nhất. Class theo kiểu BEM `.td-khối__phần--biến-thể`; trạng thái nằm ở
  `aria-*`, `[hidden]`, `data-state`, `:checked`… chứ JS không bật/tắt class hiển thị.
- **CSS của site chạm được vào component**: bạn đổi token (`--td-accent`, `--td-glass-bg`…) hoặc viết rule cho class
  của kit. `td.css` nằm trong `@layer td.tokens, td.component, td.utilities`, nên **CSS không bọc `@layer` của site luôn
  thắng**, không cần `!important`. Xem [Styling](../customization/styling.md) và [Theming](../customization/theming.md).
- **Nội dung bên trong thẻ bị component thay thế.** Component render bằng `innerHTML`; chữ bạn đặt giữa thẻ (ví dụ
  `Lưu` của `td-button`) chỉ được đọc một lần làm giá trị ban đầu. Đừng lồng HTML tuỳ ý vào trong thẻ `td-*` và đừng giữ
  tham chiếu tới phần tử con bên trong: chúng có thể bị thay khi component render lại.
- **Một số phần tử được "portal" ra `<body>`**: menu của dropdown, `TdMenu`, toast, tooltip, hovercard, modal, lightbox,
  loading. Chúng không nằm trong DOM của thẻ gốc, nên selector kiểu `.form-dang-ky .td-dropdown__menu` sẽ **không**
  khớp. Muốn tuỳ biến các phần này, dùng token hoặc class của chính chúng.
- `td.css` không reset CSS toàn cục, và mỗi component tự đặt font, line-height, box-sizing, border, nên CSS reset/
  preflight của site (kể cả Tailwind) không làm hỏng component.

## Attribute và property

Dữ liệu đi vào component bằng hai đường:

| | Attribute (HTML) | Property (JS) |
|---|---|---|
| Dùng cho | Giá trị **đơn giản**: chuỗi, số, bật/tắt | Dữ liệu **phức tạp**: mảng, object, hàm callback, Node |
| Ví dụ | `label="Email"`, `size="sm"`, `required`, `max-length="100"` | `dropdown.options = [...]`, `table.columns = [...]`, `dropdown.onChange = fn` |
| Viết ở đâu | Trong HTML (PHP render sẵn được) hoặc `el.setAttribute()` | Chỉ trong JS |

Quy ước chung:

- **Attribute được theo dõi có property tương ứng**, tên camelCase (trừ khi lớp tự định nghĩa property cùng tên): `max-length` ↔ `el.maxLength`,
  `helper-text` ↔ `el.helperText`. Gán property sẽ ghi lại attribute (và ngược lại đọc property là đọc attribute).
- **Attribute boolean** (`disabled`, `required`, `checked`, `loading`…) tính theo **có mặt hay không**: có là bật, kể
  cả `disabled="false"` vẫn là bật. Tắt thì gỡ attribute: `el.removeAttribute('disabled')` hoặc `el.disabled = false`.
- Ngoại lệ có chủ đích: một vài cờ "mặc định bật" của `td-dropdown` (`searchable`, `allow-clear`) chỉ tắt khi ghi
  `="false"`, `"0"` hoặc `"off"`. Trang của từng component ghi rõ điều này.
- Giá trị attribute không hợp lệ không làm hỏng component: kit dùng whitelist và quay về mặc định (ví dụ
  `variant="abc"` → `primary`, `color="red;}"` → bỏ qua).
- Đổi attribute lúc đang chạy là cách chính để cập nhật component; component tự vẽ lại phần cần thiết.

Hai bẫy hay gặp với property:

```js
// SAI: gán property cho thẻ khi module của nó CHƯA được nạp/đăng ký.
// Lúc đó <td-dropdown> còn là thẻ lạ, `options` thành thuộc tính thường và bị bỏ qua sau khi nâng cấp.
document.querySelector('td-dropdown').options = [...];
import('@dazzxq/td-components/dropdown');

// ĐÚNG: import (tĩnh) ở đầu module chạy trước, hoặc chờ thẻ được định nghĩa.
await customElements.whenDefined('td-dropdown');
document.querySelector('td-dropdown').options = [{ value: 'a', label: 'A' }];
```

```js
// Với thẻ tạo bằng JS: đặt attribute trước khi gắn vào trang (property dạng attribute chỉ sẵn sàng sau khi gắn).
const field = document.createElement('td-input-field');
field.setAttribute('label', 'Email');
field.setAttribute('type', 'email');
form.append(field);
field.helperText = 'Dùng email công việc'; // sau khi đã gắn: property dùng bình thường
```

Danh sách đầy đủ attribute/property của từng component: [Danh mục component](../components/README.md). Mọi callback
và tuỳ chọn gom lại một chỗ: [Hook](../customization/hooks.md).

## Event

Component báo cho trang biết điều gì xảy ra bằng **`CustomEvent`**, dữ liệu nằm trong `event.detail`:

```js
dropdown.addEventListener('change', (e) => {
  console.log(e.detail.value, e.detail.item);
});
```

Quy ước:

- Event của custom element phát bằng `emit()` của lớp nền: **`bubbles: true, composed: true`**. Vì vậy bạn nghe được ở
  form hay ở `document` (event delegation):

  ```js
  document.addEventListener('change', (e) => {
    if (e.target.matches('td-toggle[name="newsletter"]')) console.log(e.detail.checked);
  });
  ```

- **Tên event giống native khi ý nghĩa giống native** (`input`, `change`), khác khi là khái niệm riêng (`tab-change`,
  `page-change`, `sort-change`, `commit-error`, `search-error`).
- **Mỗi hành động người dùng ra đúng một event.** Các `input`/`change` native của `<input>` bên trong bị chặn tại thẻ
  host, thay bằng CustomEvent của component. Bạn không nhận event trùng.
- **Thay đổi bằng code thường không phát event.** Ví dụ `setValue()`, gán `checked`, đổi `active-tab` qua attribute là
  im lặng; event chỉ phản ánh thao tác của người dùng (trang từng component ghi rõ trường hợp ngoại lệ, ví dụ
  `setActiveTab()` của tabs có phát `tab-change`).

Event chính theo component:

| Component | Event | `detail` |
|---|---|---|
| `td-input-field` | `input` (mỗi lần gõ), `change` (khi rời ô, nếu giá trị đổi) | `{ value }` |
| `td-checkbox`, `td-toggle` | `change` | `{ checked }` |
| `td-toggle` | `commit-error` (khi `commit()` thất bại, đã hoàn lại) | `{ checked, error }` |
| `td-slider` | `input` (khi kéo), `change` (khi thả) | `{ value }` (số) |
| `td-dropdown` | `change` | `{ value, item }` (bỏ chọn: `null`, `null`) |
| `td-chip-input` | `change` (chỉ khi người dùng thêm/xoá) | `{ value, items, added?, removed? }` |
| `td-chip-input` | `search-error` | `{ query, error }` |
| `td-datetime-picker` | `change` (khi bấm xác nhận) | `{ value, dbValue }` |
| `td-tabs` | `tab-change` | `{ tabId }` |
| `td-pagination` | `page-change` | `{ page }` |
| `td-table` | `sort-change`, `page-change` | `{ key, direction }`, `{ page }` |
| `TdLightbox` | `td-lightbox-open`, `td-lightbox-change`, `td-lightbox-close` (phát trên `document`, không bubble) | `{ index, count, token, item, itemEl, groupEl }` |

Các lớp tĩnh (modal, toast, menu…) dùng **Promise và callback** thay cho event, ví dụ
`const ok = await TdModal.confirm(...)`, `onSelect` của item `TdMenu`.

## Vòng đời: gắn, gỡ, render lại

Mọi custom element kế thừa `TdBaseElement` ([Tự viết component](../components/base-element.md)):

1. **Gắn vào trang lần đầu** (`connectedCallback`): tạo property cho các attribute, gọi `render()` để lấy chuỗi HTML,
   gán vào `innerHTML`, rồi `afterRender()` để gắn listener, rồi `_applyStyles()` để ghi style per-instance bằng CSSOM.
2. **Đổi attribute được theo dõi**: mặc định render lại toàn bộ (`innerHTML` mới). Nhưng các component tương tác nhiều
   **cập nhật tại chỗ** cho các thay đổi thường gặp để **không mất focus, con trỏ gõ và animation**: ví dụ `checked` của
   checkbox/toggle, `value`/`placeholder`/`error-text` của input-field, `loading`/`disabled`/`label` của button. Chỉ
   thay đổi "cấu trúc" (ví dụ `type` của input-field) mới vẽ lại hết.
3. **Gỡ khỏi trang** (`disconnectedCallback`): mọi listener gắn bằng `listen()` và timer tạo bằng `setTimeout()`/
   `setInterval()` của lớp nền được dọn tự động. Phần tử portal (menu của dropdown…) được dọn theo.
4. **Di chuyển / gắn lại** (gỡ rồi gắn vào chỗ khác): component render lại một lần để gắn lại listener; trạng thái (giá
   trị, lựa chọn) được giữ.

Với site render phía server (PHP), điều này nghĩa là: in thẻ `td-*` kèm attribute trong HTML, component tự "sống dậy"
khi module JS nạp xong. Trước lúc đó, trình duyệt hiển thị thẻ lạ (chữ trần). Xem
[WordPress & PHP](../guides/wordpress-php.md) về cách giảm hiện tượng nháy này.

## Control nằm trong form (form-associated)

Từ 0.2.0, các control nhập liệu là **form-associated custom element** thật, dùng `ElementInternals`
([ADR 0003](../internal/decisions/0003-elementinternals-form-association.md)). Lớp nền là `TdFormElement`.

Áp dụng cho: `td-input-field`, `td-checkbox`, `td-toggle`, `td-slider`, `td-dropdown`, `td-chip-input`,
`td-datetime-picker`. **Không** áp dụng cho `td-button`: nó không phải control form, nhưng `type="submit"`/`"reset"`
vẫn chạy vì bên trong là một `<button>` thật nằm trong form.

Nghĩa là các control này cư xử y như `<input>`:

| Tính năng | Chi tiết |
|---|---|
| Gửi giá trị | Có `name` + nằm trong `<form>` → có mặt trong `new FormData(form)` và khi POST. Giá trị do **thẻ host** gửi; `<input>` bên trong không có `name` |
| Ràng buộc | `required`, và với input-field: `type="email"/"url"/"number"`, `min`/`max`/`step`, `max-length` → `form.checkValidity()`, `form.reportValidity()`, `:invalid` |
| Đọc trạng thái | `el.form`, `el.validity`, `el.validationMessage`, `el.willValidate`, `el.labels`, `el.checkValidity()`, `el.reportValidity()` |
| Lỗi tuỳ biến | `el.setCustomValidity('…')` (chặn submit, như native) |
| Hiện lỗi | `el.setError('…')` / `el.clearError()` / attribute `error-text`: dòng lỗi + `aria-invalid` + `aria-errormessage`. Chỉ là **hiển thị**, không chặn submit |
| Reset | `form.reset()` đưa về giá trị/`checked` ban đầu (chụp một lần lúc gắn), bỏ lỗi đang hiện |
| Disabled | Attribute `disabled` **hoặc** nằm trong `<fieldset disabled>`; fieldset không ghi đè attribute của bạn |
| Nhãn ngoài | `<label for="id-của-thẻ">` hoạt động: bấm nhãn sẽ focus control bên trong; thẻ tự có `id` nếu bạn không đặt |
| Khôi phục | Back/forward (bfcache) và autofill khôi phục giá trị qua `formStateRestoreCallback` |
| Focus | `el.focus()` chuyển focus vào control thật bên trong |

Phân biệt hai loại lỗi rất quan trọng:

- `setCustomValidity(msg)`: **luật** (form không hợp lệ, không submit được).
- `setError(msg)`: **hiển thị** (người dùng thấy lỗi, ví dụ lỗi server trả về). Kết hợp cả hai nếu cần.

`TdFormValidation` là helper nhẹ gom việc hiện lỗi, focus ô lỗi đầu tiên, tóm tắt lỗi và nhận lỗi từ server. Kit không
có thư viện luật validation riêng: luật là constraint gốc của trình duyệt. Chi tiết: [Hướng dẫn form](../guides/forms.md).

## Lớp nổi: modal, menu, toast… chia bàn phím và focus

Khi nhiều thứ nổi lên cùng lúc (menu dropdown mở trong modal, toast hiện khi đang loading…), phải có luật rõ ràng: phím
Escape đóng cái nào, Tab chạy trong đâu, phần nào của trang bị khoá. Kit giải quyết bằng một **registry lớp nổi dùng
chung** (`src/utils/layers.js`, nội bộ, không export).

### Thứ tự lớp

Mỗi loại lớp nổi có một tầng, trùng với token `z-index` trong `td.css`:

| Tầng | Token | Giá trị | Ai dùng | Loại |
|---|---|---|---|---|
| dropdown | `--td-z-dropdown` | 100 | Không component nào dùng ở 0.15.0 (menu dropdown dùng tầng popover) | |
| overlay | `--td-z-overlay` | 300 | Không component nào dùng ở 0.15.0 | |
| lightbox | `--td-z-lightbox` | 350 | `TdLightbox` | chặn (blocking) |
| modal | `--td-z-modal` | 400 | `TdModal` (mọi dialog) | chặn |
| popover | `--td-z-popover` | 450 | menu của `td-dropdown`, gợi ý `td-chip-input`, `TdMenu`, `TdHovercard` | nổi (floating) |
| loading | `--td-z-loading` | 480 | `TdLoading` (overlay toàn trang) | chặn |
| toast | `--td-z-toast` | 500 | `TdToast` | nổi, không nhận bàn phím |
| tooltip | `--td-z-tooltip` | 510 | tooltip | nổi |

Nhờ vậy menu dropdown mở **bên trên** modal, loading phủ **bên trên** modal, toast luôn nhìn thấy.

### Khoá phần bên dưới (`inert`)

Lớp **chặn** (modal, lightbox, loading) khi mở sẽ đặt attribute `inert` lên mọi con trực tiếp của `<body>` nằm bên
dưới nó: chuột, bàn phím, trình đọc màn hình đều không chạm được. Lớp **nổi** ở tầng cao hơn (menu, tooltip, toast) được
miễn, nên menu mở trong modal vẫn dùng được. `inert` do site tự đặt không bao giờ bị kit gỡ. Phần tử mới thêm vào
`<body>` khi modal đang mở cũng bị khoá (kit theo dõi bằng `MutationObserver`).

Hệ quả cho site: widget của bên thứ ba gắn ở `<body>` (chat, cookie banner) sẽ không bấm được khi modal đang mở. Đó là
hành vi đúng của dialog modal.

### Bàn phím: Escape và Tab

Kit có **một** listener `keydown` duy nhất (capture) cho cả trang; component không tự bắt Escape/Tab trên `document`.

- **Escape** đi tới lớp nổi **cao nhất** đang mở và bị "nuốt" ở đó, lớp dưới không nhận. Ví dụ menu dropdown mở trong
  modal: Escape đóng menu, modal vẫn mở.
  - Tooltip, menu, hovercard, dropdown, lightbox: Escape đóng chúng (lightbox nhường Escape cho trình phát video khi focus đang ở trong player).
  - **Modal: Escape không đóng** (và cũng không lọt xuống lớp dưới). Bấm vào nền mờ cũng không đóng. Đây là quyết định có
    chủ đích để người dùng không mất dữ liệu đang nhập ([ADR 0006](../internal/decisions/0006-modal-no-backdrop-close.md));
    modal đóng bằng nút của nó.
  - Loading: Escape bị nuốt (người dùng không huỷ được overlay đang xử lý).
  - Khi đang gõ tiếng Việt bằng bộ gõ (IME đang ghép chữ), Escape để cho bộ gõ, không đóng gì.
- **Tab**: lớp chặn giữ Tab trong nó (focus trap): Tab/Shift+Tab vòng quanh các phần tử trong dialog, không ra được
  trang phía sau. Nút đóng của toast được đưa vào vòng Tab của modal/loading, để người dùng bàn phím vẫn đóng được toast.
  Menu/dropdown: Tab đóng menu rồi để focus đi tiếp tự nhiên.

### Focus khi mở và đóng

- Mở modal: focus vào ô nhập đầu tiên trong nội dung, không có thì nút đầu tiên, rồi nút X, cuối cùng là chính dialog
  (tuỳ chọn `focusTarget`, `autoFocus` của `TdModal.show` đổi được điều này).
- Đóng: focus **quay về phần tử đã mở nó** (nút bạn vừa bấm). Nếu phần tử đó đã biến mất hoặc đang bị khoá dưới một lớp
  khác, focus đi tới dialog đang ở trên cùng.
- Menu/dropdown đóng bằng Escape: focus về nút kích hoạt.

### Khoá cuộn trang

Modal, lightbox và loading khoá cuộn trang bằng cách đặt `overflow: hidden` lên `<html>` (qua CSSOM), có đếm số lượt: mở hai
modal chồng nhau rồi đóng một cái, trang vẫn khoá; đóng hết mới mở lại. Giá trị `overflow` cũ của `<html>` (nếu site có
đặt) được trả lại đúng như trước. Khoá trên `<html>` chứ không phải `<body>` để không làm hỏng `position: sticky` của
site.

Chi tiết bàn phím và ARIA: [Hướng dẫn trợ năng](../guides/accessibility.md).

## Mô hình CSP

Cam kết từ 0.3.0: mọi thứ kit tự sinh ra chạy được dưới `Content-Security-Policy` **không có**
`style-src 'unsafe-inline'`.

| Cách áp style | Dưới CSP strict | Kit dùng? |
|---|---|---|
| Attribute `style="…"` trong HTML (kể cả qua `innerHTML`) | Bị chặn | **Không bao giờ** |
| Chèn thẻ `<style>` bằng JS | Bị chặn | **Không bao giờ** |
| File CSS ngoài (`<link rel="stylesheet">`) | Cho phép (`'self'` hoặc nonce) | Có: `td.css` |
| CSSOM: `el.style.setProperty('--x', …)`, `el.style.x = …` | Cho phép (kể cả với `style-src-attr 'none'`) | Có: giá trị riêng từng phần tử |

Cách kit chia việc:

- **Mọi rule CSS** (layout, màu, `:hover`, `:focus-visible`, `@keyframes`, `@media`) nằm trong `td.css`.
- **Giá trị riêng từng phần tử** (màu `color="…"` của một nút, toạ độ menu, độ rộng cột bảng, % của slider) được ghi
  qua CSSOM, thường là một custom property trên chính phần tử, ví dụ `--td-btn-bg`. Rule trong `td.css` đọc biến đó.
- Giá trị lấy từ attribute được kiểm tra trước khi ghi (màu qua `safeColor`, kích thước qua whitelist).

Kiểm chứng tự động: `npm run test:csp` (mọi component × mọi trạng thái, 0 vi phạm, style khớp baseline) và
`npm run test:tokens` (Chromium, Firefox, WebKit × hồ sơ `'self'` và nonce-only).

Khi tự viết code, giữ cùng luật: dùng class hoặc `el.style.setProperty(...)`, không viết `style="…"`. Nội dung HTML bạn
đưa vào kit qua các cửa "HTML tin cậy" (mục sau) cũng phải sạch CSP. Cấu hình header cho site:
[Hướng dẫn CSP](../guides/csp.md).

## Mô hình bảo mật (tóm tắt)

Component render bằng `innerHTML`, nên kit tự escape mọi giá trị theo **đúng ngữ cảnh** nó rơi vào:

| Ngữ cảnh | Ví dụ | Cách kit xử lý |
|---|---|---|
| Chữ | `label`, message, nhãn option, giá trị ô bảng | Escape HTML (`escapeHtml`) |
| Attribute | `placeholder`, `value`, `data-*` | Escape HTML trong ngoặc kép |
| Màu CSS | `color`, `text-color` | `safeColor()`: chỉ nhận hex, tên màu, `rgb()`, `hsl()`; sai thì bỏ |
| Class | `size`, `variant`, `type` | Whitelist |
| Số | `rows`, `max-length`, `min`/`max` | Ép kiểu số, giới hạn |
| URL | link của `TdMenu`, nguồn của `TdLightbox`, fragment của `TdHovercard` | Allowlist scheme / cùng origin |

**Mặc định mọi chuỗi là text.** Truyền `<b>` vào `label` sẽ hiện nguyên chữ `<b>`. HTML thô chỉ đi qua một số **cửa
tin cậy** bạn phải chủ động dùng, và chỉ được đưa vào đó **markup của lập trình viên**, không bao giờ dữ liệu người
dùng nhập:

- `TdModal.show({ body: '<chuỗi HTML>' })` (nên truyền Node thay vì chuỗi) và `messageHtml` của
  `TdModal.confirm/success/error/info`.
- Hàm `render(row)` của cột `td-table` khi trả về chuỗi (nên trả về Node).
- `TdHovercard`: chuỗi trả về từ `content()` và fragment tải từ URL. Nếu fragment có thể chứa nội dung người dùng, site
  **phải** gắn `TdHovercard.sanitize` (ví dụ DOMPurify), và gọi `TdHovercard.clearCache()` khi đăng xuất / đổi tài khoản.
- Node tin cậy: `iconNode` của `td-empty-state` và item `TdMenu`, `panel(ctx)` của `TdLightbox` (nhận Element).

Việc site cần làm và danh sách đầy đủ: [Hướng dẫn bảo mật](../guides/security.md).

## Nhãn và ngôn ngữ

Kit **mặc định tiếng Việt** (nút "Đóng", "Xác nhận", "Hủy", thông báo "Trường này là bắt buộc"…) và **không có hệ i18n
riêng**. Muốn đổi chữ có ba đường:

1. **Attribute / tham số khi gọi**: `placeholder`, `label`, `confirmText`, `cancelText`, `okText`, `aria-label`…
2. **`static labels` / `static messages` của lớp**: ghi đè một lần cho cả site, ngay sau khi import:

   ```js
   import { TdModal } from '@dazzxq/td-components/modal';
   import { TdDatetimePicker } from '@dazzxq/td-components/datetime-picker';

   TdModal.labels.close = 'Close';
   TdModal.labels.confirm = 'Confirm';
   TdModal.labels.cancel = 'Cancel';
   TdDatetimePicker.labels.confirm = 'OK';
   ```

   Có ở: `TdModal`, `TdDatetimePicker` (`labels`, `messages`), `TdChipInput` (`labels`, cộng property `messages` theo
   từng thẻ), `TdFormValidation` (`labels`, `messages`), `TdTable`, `TdMenu`, `TdHovercard`.
3. **Tuỳ chọn khi mở**: `TdLightbox.open(items, { labels: {…} })` / `TdLightbox.bind(root, { labels: {…} })`.

Một số chuỗi hiện **chưa** đổi được qua `labels` (ví dụ `aria-label` "Đóng" của nút đóng toast, thông báo lỗi ràng buộc
mặc định của `td-input-field`). Với thông báo ràng buộc, dùng `setCustomValidity()` / `setError()` hoặc `messages` của
`TdFormValidation`. Chi tiết chuyển sang ngôn ngữ khác: [Mở rộng kit](../customization/extending.md).

## Ngôn ngữ thiết kế Liquid Glass (tóm tắt)

Giao diện kit theo bộ luật **Liquid Glass** (lấy cảm hứng từ Apple, phiên bản v2 từ 0.14.0). Những điều nên biết khi
dùng:

- **Kính chỉ dành cho tầng điều khiển nổi**: menu, modal, toast, tooltip, hovercard, button đứng riêng. Card, bảng, ô
  nhập, checkbox, nền trang **không bao giờ** là kính.
- **Không lồng kính**: control nằm trong một bề mặt kính (ví dụ button trong modal) dùng nền thường, không làm mờ lần
  hai. Lớp kính trên cùng thắng: menu mở trên modal giữ kính, modal bên dưới chuyển nền đặc.
- **Vật liệu tinh chỉnh bằng token**: `--td-glass-bg`, `--td-glass-solid`… Site đổi token trong CSS không `@layer`.
  Không bao giờ ghi đè biến riêng tư `--_td-*`.
- **Tự xuống cấp an toàn**: trình duyệt không có `backdrop-filter`, người dùng bật "giảm trong suốt"
  (`prefers-reduced-transparency`), "tăng tương phản" (`prefers-contrast: more`) hoặc chế độ màu cưỡng bức
  (`forced-colors`) → kính chuyển nền đặc, viền rõ. Safari/Firefox chưa báo "giảm trong suốt", nên site có thể tắt kính
  thủ công: `<html data-td-glass="off">`.
- **Dark theme chỉ bật khi site yêu cầu**: `<html data-td-theme="dark">`. Kit **không** tự theo chế độ tối của hệ điều
  hành.
- **Tương phản được đo thật**: `npm run test:contrast` chụp button và toast trên nền đen, trắng, caro, ảnh, trên ba
  engine, đòi chữ ≥ 4.7:1, icon ≥ 3.2:1.
- Vùng dày đặc (bảng, `[data-td-density="dense"]`) bỏ hiệu ứng làm mờ của button để đỡ tốn tài nguyên.

Tuỳ biến: [Theming](../customization/theming.md). Luật đầy đủ (cho người viết component):
[liquid-glass.md](../internal/design/liquid-glass.md).

## Xem thêm

- [Cài đặt](../getting-started/installation.md) · [Trang đầu tiên](../getting-started/quick-start.md)
- [Danh mục component](../components/README.md)
- [Hook và tuỳ chọn](../customization/hooks.md) · [Tự viết component](../components/base-element.md)
- [Form](../guides/forms.md) · [Trợ năng](../guides/accessibility.md) · [Bảo mật](../guides/security.md) ·
  [CSP](../guides/csp.md)
