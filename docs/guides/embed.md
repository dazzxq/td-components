[Tài liệu](../README.md) › Hướng dẫn › Nhúng vào trang lạ (td embed)

# Nhúng kit vào trang của bên thứ ba (td embed)

Từ **0.116.0** kit có thêm một bản đóng gói riêng, `dist/embed/td-embed.js`, để đặt vài component của kit vào một
trang **mình không sở hữu** (ví dụ panel của một userscript Tampermonkey chạy trong CMS của bên khác). Quyết định thiết
kế: [ADR 0045](../internal/decisions/0045-td-embed.md).

Khác với cách dùng thường (light DOM, `td.css` nạp cho cả trang), bản embed:

- dựng một **shadow root mở** trên một phần tử `host` do bạn chọn, CSS của CMS không chạm được vào bên trong, CSS của kit
  không lọt ra trang;
- đăng ký `td-button`, `td-input-field`, `td-alert` vào một **custom element registry riêng (scoped registry)** của
  shadow root đó. Registry toàn cục của trang không bị đụng tới: trang có `td-button` của riêng nó cũng không sao;
- mang CSS bên trong JS (một constructed stylesheet dùng chung cho mọi lần mount trong cùng document), không chèn
  `<style>`, không dùng `style="…"`, chạy được dưới CSP nghiêm ngặt;
- là **một file ES module tự chứa**: không import gì thêm, không cần `td.css`.

## Khi nào dùng

| Tình huống | Dùng |
|---|---|
| Site của mình (dwp, 135, site mới): mình kiểm soát CSS và registry của trang | Cách thường: [Cài đặt](../getting-started/installation.md) |
| Panel / widget chèn vào trang **của người khác** (userscript, extension, CMS bên thứ ba), CSS trang không lường trước được | td embed (trang này) |

Đừng dùng embed cho site của mình chỉ để "cô lập CSS": light DOM mới là chuẩn của kit (token, hook, class BEM của
site chạm được component).

## Trình duyệt hỗ trợ và phương án dự phòng

Embed cần scoped custom element registry: **Chrome / Edge 146+, Safari 26.4+, Firefox 159+**. Trình duyệt cũ hơn
vẫn **nạp được** module (không lỗi lúc import), nhưng `mountTdEmbed()` ném `TdEmbedError` với `code: 'unsupported'`
và **không đụng gì** vào `host`. Bắt lỗi đó và giữ cách tích hợp cũ của bạn:

```js
import { mountTdEmbed, TdEmbedError } from '@dazzxq/td-components/embed';

let ui;
try {
  ui = mountTdEmbed(host);
} catch (e) {
  if (e instanceof TdEmbedError && e.code === 'unsupported') return renderOldPanel(host); // code của bạn
  throw e;
}
```

## Lấy file và đóng gói vào userscript

Subpath `@dazzxq/td-components/embed` trỏ tới `dist/embed/td-embed.js` (file sinh ra, đã minify, có sẵn trong
package). `dist/embed/td-embed.css` chỉ để đọc / review, **không** dùng lúc chạy.

Userscript thường là một file duy nhất, nên bundle với esbuild:

```js
// build.mjs (phía consumer)
import * as esbuild from 'esbuild';
await esbuild.build({
  entryPoints: ['src/panel.js'], // import { mountTdEmbed } from '@dazzxq/td-components/embed'
  bundle: true,
  format: 'iife',
  outfile: 'dist/panel.user.js',
  banner: { js: readFileSync('src/meta.txt', 'utf8') }, // khối // ==UserScript== của bạn
});
```

**Tampermonkey:** cấu hình được hỗ trợ và đã kiểm tra là sandbox mặc định của script (`@grant GM_*` như cũ, **không**
cần `@sandbox` hay `@inject-into`). Embed chỉ dùng các constructor DOM lấy qua `host.ownerDocument.defaultView`
(`CustomElementRegistry`, `CSSStyleSheet`), tức là "realm của trang" theo nghĩa đó; bạn không phải chuyển script sang
một world khác.

`TD_EMBED_BUILD` (ví dụ `0.116.0+9ba6110434`) cho biết bản kit và mã băm nội dung. Ghi nó vào log lỗi của bạn để biết
panel đang chạy bản nào.

## Mount và handle

```js
const host = document.createElement('div');
shell.append(host); // shell: vỏ ngoài do bạn định vị, xem mục "Vỏ ngoài"
const ui = mountTdEmbed(host, { theme: 'auto' }); // 'auto' | 'light' | 'dark', mặc định 'auto'

ui.root.innerHTML = `
  <td-input-field label="Từ khoá" name="q"></td-input-field>
  <td-button variant="primary" label="Lấy bài"></td-button>`;
```

Handle trả về:

| Thành phần | Ý nghĩa |
|---|---|
| `root` | `<div class="td-embed-root" data-td-theme="…">` trong shadow root. Đặt mọi phần tử của kit **bên trong** nó. |
| `shadowRoot` | Shadow root mở trên `host` (để thêm stylesheet riêng của bạn, xem dưới). |
| `registry` | Scoped registry chứa `td-button`, `td-input-field`, `td-alert`. |
| `create(tag)` | Tạo phần tử gắn với registry của embed: `ui.create('td-alert')` trả về alert đã upgrade; `ui.create('div')` là một khung mà `innerHTML` gán vào sau sẽ upgrade đúng. |
| `setTheme(mode)` | `'auto'` \| `'light'` \| `'dark'`; giá trị khác ném `TypeError`. |
| `unmount()` | Làm rỗng shadow root (mỗi phần tử tự chạy `disconnectedCallback`), bỏ stylesheet. Gọi lại lần hai không làm gì. Sau đó mount lại được trên cùng `host` (cùng module). |

**Tạo phần tử đúng cách:** gán `innerHTML` trên `ui.root` (hoặc trên một khung tạo bằng `ui.create('div')`), hoặc
`ui.create('td-button')`. **Sai:** `document.createElement('td-button')`, vì nó dùng registry của trang (ra class của
trang, hoặc một thẻ lạ). Cũng vậy với khung: `document.createElement('div')` rồi `innerHTML = '<td-button>'` không
upgrade trên Safari, hãy dùng `ui.create('div')`.

### Mã lỗi

Mọi lỗi được kiểm tra **trước** khi gọi `attachShadow`, nên `host` giữ nguyên khi có lỗi.

| `e.code` | Khi nào |
|---|---|
| `bad-host` | `host` không phải phần tử HTML mang được shadow root (dùng `<div>`, `<span>`, `<section>`… hoặc custom element tự định nghĩa). |
| `bad-theme` | `opts.theme` không thuộc `auto` / `light` / `dark`. |
| `already-mounted` | `host` đang được mount (gọi `unmount()` trước). |
| `host-has-shadow` | `host` đã có shadow root không do module này tạo (của trang, root đóng, hoặc của một bản script nạp lại). Script được chèn lại phải dùng `host` mới. |
| `unsupported` | Trình duyệt chưa có scoped registry / constructed stylesheet (xem mục trình duyệt). |

## Bộ thành phần được bảo đảm

Chỉ những phần tử và attribute dưới đây được kiểm tra trong embed (Chromium, Firefox, WebKit, trên một trang cố tình
"phá" CSS). Cách dùng chi tiết giống light DOM, xem trang của từng component.

| Phần tử | Attribute / API trong embed |
|---|---|
| [`<td-button>`](../components/button.md) | `variant`, `size`, `label`, `icon` (trong bộ icon dưới), `icon-position`, `disabled`, `loading`, `full-width`, `type`, `aria-label`; `run(fn)`, `setLoading()`, `setDisabled()` |
| [`<td-input-field>`](../components/input-field.md) | ô chữ (`type` mặc định `text`) và `type="textarea"`; `label`, `label-mode`, `name`, `value`, `placeholder`, `required`, `disabled`, `readonly`, `helper-text`, `error-text`, `max-length`, `rows`, `autoresize`; `value`, `setError()` / `clearError()`; event `input` / `change` |
| [`<td-alert>`](../components/alert.md) | `variant` (`info`, `success`, `warning`, `danger`), `heading`, `dismissible` |
| [`select.td-native-select`](../components/dropdown.md#select-gốc-có-style-td-native-select-01160) | `<select>` gốc có style của kit (không cần `td-dropdown`) |

Event của kit có `composed: true`, nên nghe được từ ngoài `host` (target bị đổi thành `host`); nghe trên phần tử bên
trong `ui.root` thì có target thật.

**Đổi nhãn nút bằng `label`**, không gán `textContent`: `btn.setAttribute('label', 'Đang lấy…')`. `textContent` xoá
cấu trúc bên trong (icon, spinner).

## Theme

`'auto'` theo cài đặt sáng / tối của hệ điều hành. Muốn đổi theo giờ, viết ở phía bạn rồi gọi `setTheme`:

```js
// code của consumer, không thuộc kit: tối từ 18:00 tới 6:00
const byClock = () => { const h = new Date().getHours(); return h >= 18 || h < 6 ? 'dark' : 'light'; };
ui.setTheme(byClock());
setInterval(() => ui.setTheme(byClock()), 10 * 60 * 1000);
```

## Cỡ chữ gốc `--td-embed-rem`

Trong embed mọi kích thước `rem` của kit được tính theo `var(--td-embed-rem, 16px)`, **không** theo cỡ chữ `<html>`
của trang (CMS hay đặt `html { font-size: 10px }`). Muốn panel to / nhỏ hơn, đặt biến này trên `host` hoặc vỏ ngoài:

```css
/* CSS của bạn cho vỏ ngoài (ngoài shadow root) */
.my-panel-shell { --td-embed-rem: 15px; }
```

Đây là **biến duy nhất** đi từ ngoài vào. Mọi `--td-*` / `--_td-*` khác của trang bị chặn ở `.td-embed-root` (đặt về
`initial` rồi khai báo lại token của kit), nên token và hook site như `--td-accent`, `--td-btn-bg` đặt trên trang
**không** có tác dụng trong embed.

## Tuỳ biến: stylesheet riêng của consumer

Muốn đổi màu, khoảng cách, hoặc style phần tử của chính panel, thêm một constructed stylesheet **sau** sheet của kit:

```js
const view = host.ownerDocument.defaultView;
const mine = new view.CSSStyleSheet();
mine.replaceSync(`
  .td-embed-root { --td-accent: #0a66c2; }      /* token của kit, viết trong embed */
  .panel { display: grid; gap: var(--td-space-sm); }
`);
ui.shadowRoot.adoptedStyleSheets = [...ui.shadowRoot.adoptedStyleSheets, mine];
```

Token `--td-*` (màu, viền, bo góc, khoảng cách, chữ) đều khai báo trên `.td-embed-root`, cho sáng và tối, nên CSS của
bạn bên trong dùng được trực tiếp. Lưu ý `unmount()` đặt `adoptedStyleSheets = []`: mount lại thì thêm sheet của bạn lần
nữa.

## Vỏ ngoài để định vị

`:host` bị đặt lại hết (`all: initial`, `display: block`), nên **không** đặt `position`, `inset`, kích thước hay
`z-index` lên `host`. Bọc `host` trong một phần tử của bạn và định vị phần tử đó:

```js
const shell = document.createElement('div');
shell.className = 'my-panel-shell'; // position: fixed; inset-block-start: 80px; inset-inline-end: 16px; z-index: …
const host = document.createElement('div');
shell.append(host);
document.body.append(shell);
```

## Bộ icon

Embed chỉ mang bảy icon: `info`, `success`, `warning`, `error`, `close`, `eye`, `eye-off` (và alias `x` → `close`).
Tên khác không vẽ gì (như light DOM với tên lạ). Cần thêm icon thì gọi `registerIcons({ ten: { viewBox, nodes } })`
(export từ embed, cùng định dạng như light DOM, xem [Icon](../components/icons.md)) trước khi tạo element dùng nó.
Icon dùng chung nhiều nơi thì nên xin thêm vào bộ của kit (`scripts/embed-manifest.json`).

## Giới hạn

- **Cô lập CSS của CMS, không phải sandbox bảo mật.** Script của trang vẫn đọc / sửa được shadow root mở. Đừng đưa dữ
  liệu nhạy cảm vào panel với giả định trang không thấy.
- **Không liên kết form xuyên shadow root:** `<form>` hay `<label for>` của trang **ngoài** `host` không thấy ô nhập
  bên trong, và ngược lại. Đọc giá trị qua property `value` hoặc event.
- **Không hứa Trusted Types.** Trang bật `require-trusted-types-for 'script'` thì `innerHTML` của bạn cần policy riêng.
- **Không hỗ trợ:** markup SSR (`data-td-ssr`), affix (`prefix`, `suffix`, `*-icon`, slot), hiện / ẩn mật khẩu
  (`revealable`), toast, lớp nổi (modal, tooltip, popover), `td-dropdown`, cùng mọi component khác ngoài bảng trên.
- Không có bản fallback khi thiếu scoped registry: trình duyệt cũ nhận `unsupported`.

## Xem thêm

- [ADR 0045: td embed](../internal/decisions/0045-td-embed.md)
- [CSP](csp.md) · [Theming](../customization/theming.md)
