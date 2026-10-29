[Tài liệu](../README.md) › [Components](README.md) › Rich text

# Ô soạn văn bản có định dạng — `<td-rich-text>`

Ô soạn văn bản **nhỏ** có định dạng: preset `comment` gồm **đậm, nghiêng, gạch chân, gạch ngang, liên kết** — cho bình
luận, ghi chú, mô tả ngắn. Chạy trên engine ProseMirror đóng gói sẵn trong kit (không cần cài thêm gì). Form-associated:
gửi **một** chuỗi HTML chuẩn dưới `name`, đã lọc theo allowlist (chỉ `<p>`, `<br>` và thẻ của định dạng đang bật; liên
kết chỉ giữ `href` an toàn). **Server vẫn phải lọc lại** — xem [Bảo mật](#bảo-mật).

Không dùng khi: chỉ cần chữ thuần → [input field](input-field.md) `type="textarea"`; cần tiêu đề / danh sách / trích dẫn /
ảnh / bảng (chưa có trong kit — preset `comment` cố ý nhỏ).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/rich-text'` (class: `import { TdRichText } from '@dazzxq/td-components/rich-text'`) |
| Loại | Custom element |
| Form-associated | có (`ElementInternals`) |
| Barrel gốc | **không** — engine ~68 KiB gzip chỉ tải khi trang import `/rich-text` |
| Từ phiên bản | 0.88.0 |

## Ví dụ nhanh

```html
<form method="post" action="/comments">
  <td-rich-text name="body" label="Bình luận" placeholder="Viết bình luận…" required maxlength="2000"></td-rich-text>
  <button type="submit" class="td-btn td-btn--primary td-btn--md">Gửi</button>
</form>

<script type="module">
  import '@dazzxq/td-components/rich-text';
</script>
```

Form gửi `body=<p>Xin <strong>chào</strong></p>`. `required` + rỗng → form không submit (`valueMissing`); quá 2000 ký tự
→ `tooLong`.

## Cách dùng

### 1. Giá trị ban đầu và đọc / ghi giá trị

```html
<td-rich-text name="note" label="Ghi chú" value="<p>Đã gọi <strong>2 lần</strong></p>"></td-rich-text>
```

- Attribute `value` = giá trị ban đầu **và** giá trị khi `form.reset()`. Đổi attribute khi đang chạy cũng đổi giá trị hiện tại.
- `el.value` (get) = HTML chuẩn hiện tại; rỗng → `''` (không phải `<p></p>`).
- `el.value = html` (set) = parse + lọc, **không** phát event, xoá lịch sử undo.

### 2. Chọn định dạng (`preset` / `features`)

```html
<td-rich-text features="bold italic"></td-rich-text>        <!-- chỉ đậm + nghiêng -->
<td-rich-text features="bold, link"></td-rich-text>         <!-- dấu phẩy hoặc khoảng trắng -->
```

- `features` (token: `bold`, `italic`, `underline`, `strike`, `link`) thắng `preset`. Thứ tự nút luôn cố định (đậm →
  liên kết), không theo thứ tự viết. Token lạ bị bỏ, cảnh báo console **một lần**.
- `preset` lạ → `comment`.
- Định dạng tắt thì HTML đầu vào có thẻ đó bị **bỏ thẻ, giữ chữ** (`<em>a</em>` → `a`).
- Đổi `preset` / `features` / `allow-http` / `link-target` khi đang chạy: dựng lại từ HTML hiện tại, xoá lịch sử undo,
  dựng lại toolbar.
- Gỡ khỏi DOM rồi gắn lại (di chuyển phần tử): giữ nguyên nội dung, vùng soạn **và lịch sử undo**.

### 3. Liên kết

```html
<td-rich-text link-target="_blank" allow-http></td-rich-text>
```

- Nút liên kết hoặc **Ctrl/⌘ + K** mở hộp nhập địa chỉ ngay dưới toolbar.
  - Có vùng chọn → gắn liên kết cho vùng chọn.
  - Con trỏ trong một liên kết → sửa **cả** liên kết đó (ô nhập điền sẵn địa chỉ cũ); nút "Gỡ liên kết" bỏ liên kết.
  - Con trỏ ngoài liên kết, không chọn gì → chèn chính địa chỉ đó thành chữ có liên kết.
  - Địa chỉ không hợp lệ → báo "Địa chỉ không hợp lệ" trong hộp, hộp không đóng.
  - Enter = Áp dụng, Esc / Huỷ = đóng không đổi gì. Mọi cách đóng đều trả focus + vùng chọn về ô soạn.
- Địa chỉ nhận: `https:`, `mailto:`, `tel:`, đường dẫn tương đối (`/a`, `a/b`, `?q`), `#đoạn`; `http:` chỉ khi có
  `allow-http`. Bị bỏ: `javascript:`, `data:`, `vbscript:`, `//host` (rời site), ký tự điều khiển…
- Mọi liên kết luôn có `rel="nofollow noopener"`; `link-target="_blank"` / `"_self"` thêm `target`, `none` (mặc định)
  không có `target`. `rel` / `target` từ đầu vào luôn bị thay.

### 4. Khoá, chỉ đọc, lỗi, gợi ý

```html
<td-rich-text label="Ghi chú" readonly value="<p>…</p>"></td-rich-text>
<td-rich-text label="Ghi chú" disabled></td-rich-text>
<td-rich-text label="Ghi chú" helper-text="Shift + Enter để xuống dòng." error-text="Nội dung bị từ chối."></td-rich-text>
```

- `readonly`: vẫn focus, chọn, copy được; không sửa được; toolbar tắt; vẫn gửi form.
- `disabled` (hoặc nằm trong `<fieldset disabled>`): không focus, không gửi form.
  Liên kết bên trong mang màu chữ khoá và không mở được (chuột hay Enter); nội dung vẫn đọc được bằng trình đọc màn
  hình (không dùng `inert`). `readonly` thì liên kết vẫn bấm được.
- `helper-text` / `error-text` / `setHelper()` / `setError()` như mọi form control (xem [hint](hint.md)).

## Attribute

| Attribute | Kiểu | Mặc định | Ý nghĩa |
|---|---|---|---|
| `preset` | string | `comment` | Bộ định dạng; lạ → `comment` |
| `features` | token | — | `bold italic underline strike link` (khoảng trắng / dấu phẩy); thắng `preset` |
| `link-target` | `none` \| `_self` \| `_blank` | `none` | `target` ép lên mọi liên kết |
| `allow-http` | boolean | — | Nhận liên kết `http:` |
| `name` | string | — | Tên trường form |
| `value` | string (HTML) | `''` | Giá trị đầu = giá trị reset |
| `label` | string | — | Nhãn hiển thị (đặt tên cho ô soạn) |
| `placeholder` | string | — | Chữ mờ khi rỗng (không bao giờ thành giá trị) |
| `required` | boolean | — | Rỗng (sau khi bỏ khoảng trắng) → `valueMissing` |
| `maxlength` | số nguyên > 0 | — | Giới hạn **ký tự hiển thị**, đếm theo code point (emoji = 1); hết đoạn / xuống dòng = 1 |
| `disabled` | boolean | — | Khoá, không gửi |
| `readonly` | boolean | — | Chỉ đọc, vẫn gửi |
| `helper-text` | string | — | Gợi ý dưới ô |
| `error-text` | string | — | Lỗi hiển thị (`aria-invalid`) |

Không có ô nhãn → ô soạn lấy tên từ `aria-label` của host hoặc `<label for="id-host">` bên ngoài.

## Property & method

| Tên | Kiểu | Ghi chú |
|---|---|---|
| `value` | string | get = HTML chuẩn; set = parse + lọc, không event |
| `features` | string[] | get = định dạng đang bật (đã resolve); set = ghi attribute `features` (mảng hoặc chuỗi; rỗng → bỏ) |
| `form`, `validity`, `validationMessage`, `willValidate`, `checkValidity()`, `reportValidity()`, `setCustomValidity()` | | như control gốc |
| `setError(msg)` / `clearError()` / `setHelper(msg)` | | xem [hint](hint.md) |
| `focus()` | | focus vào ô soạn |

### `TdRichText.labels`

Chữ giao diện (tiếng Việt), đổi một lần cho cả site:

```js
import { TdRichText } from '@dazzxq/td-components/rich-text';
Object.assign(TdRichText.labels, { bold: 'Bold', link: 'Link', apply: 'Apply' });
```

| Key | Mặc định |
|---|---|
| `bold` / `italic` / `underline` / `strike` / `link` | Đậm / Nghiêng / Gạch chân / Gạch ngang / Liên kết |
| `linkUrl` | Địa chỉ liên kết |
| `apply` / `remove` / `cancel` | Áp dụng / Gỡ liên kết / Huỷ |
| `invalidUrl` | Địa chỉ không hợp lệ |
| `toolbar` | Định dạng (tên của toolbar) |

`TdRichText.messages`: `valueMissing` ("Trường này là bắt buộc"), `tooLong` ("Vượt quá giới hạn {maxLength} ký tự").

## Event

| Event | Khi nào | `detail` |
|---|---|---|
| `input` | Mỗi lần người dùng đổi nội dung (gõ, dán, định dạng, liên kết, undo) — bubbles, composed | `{ value }` |
| `change` | Khi rời **cả component** (focus ra ngoài host) mà giá trị khác lúc vào. Chuyển qua lại ô soạn ↔ toolbar ↔ hộp liên kết **không** tính | `{ value }` |

Event `input` gốc của vùng `contenteditable` / ô địa chỉ không lọt ra ngoài — trang chỉ nhận một event của host.
Ghi `value` bằng code không phát event.

## Form

- Gửi `setFormValue(html)`: đúng một mục `name=html`; rỗng → `name=` (chuỗi rỗng).
- Validity: `valueMissing` (`required` + chữ hiển thị rỗng), `tooLong` (`maxlength`, đếm code point).
- `form.reset()` → giá trị của attribute `value` lúc đầu; khôi phục form (bfcache / autofill) → parse + lọc lại.

## Bảo mật

- Đầu vào (attribute `value`, `el.value`, dán, kéo thả) được parse trong document **tách rời** (không chạy script, không
  tải ảnh), bỏ `script / style / template / iframe / object / embed / svg / math` cùng nội dung, rồi chỉ giữ thẻ có trong
  schema. Không attribute nào sống sót ngoài `href` đã qua kiểm tra; `style` không bao giờ được đọc (không có "đậm theo
  `font-weight`").
- **Server phải lọc lại** — HTML gửi lên là dữ liệu người dùng, ai cũng gửi thẳng được. Dùng
  `php/td-rich-text-policy.php` (đọc cùng allowlist JSON `rich-text-policy.json` với client) để dựng cấu hình
  `symfony/html-sanitizer`:

  ```php
  use TdComponents\RichTextPolicy;
  use Symfony\Component\HtmlSanitizer\HtmlSanitizer;

  $policy = RichTextPolicy::load(__DIR__ . '/vendor/dazzxq/td-components/src/form/rich-text/rich-text-policy.json');
  // features / allowHttp / linkTarget của CHÍNH trường đó ở server — không lấy từ request
  $config = RichTextPolicy::symfonyConfig($policy, ['bold', 'italic', 'underline', 'strike', 'link'], false, 'none');
  $clean = (new HtmlSanitizer($config))->sanitize($_POST['body'] ?? '');
  ```

- **Trusted Types**: site bật `require-trusted-types-for 'script'` phải cho phép HAI policy có tên:
  `trusted-types td-rich-text ProseMirrorClipboard`. `td-rich-text` bọc HTML của `value` trước khi `DOMParser` đọc
  vào document trơ (sau đó lọc + schema), `ProseMirrorClipboard` là của engine khi đọc HTML dán vào. Không cần (và đừng
  thêm) policy `default`.
- **Giới hạn kích thước**: HTML dài quá 1.000.000 ký tự (qua `value`, dán hoặc kéo thả) bị bỏ qua (một cảnh báo
  console, không in giá trị). Server vẫn phải tự giới hạn kích thước request trước khi sanitize.
- CSP: không `style="…"`, không `<style>` chèn vào; engine chỉ đổi style qua CSSOM.

## Bàn phím & trợ năng

| Phím | Tác dụng |
|---|---|
| Ctrl/⌘ + B / I / U | Đậm / nghiêng / gạch chân |
| Ctrl/⌘ + Shift + X | Gạch ngang |
| Ctrl/⌘ + K | Mở hộp liên kết |
| Enter / Shift + Enter | Đoạn mới / xuống dòng trong đoạn (`<br>`) |
| Ctrl/⌘ + Z / Ctrl/⌘ + Shift + Z (hoặc Ctrl/⌘ + Y) | Hoàn tác / làm lại |
| ← / → / Home / End (trên toolbar) | Di chuyển giữa các nút (roving tabindex — toolbar là **một** điểm Tab) |
| Tab (từ toolbar) | Vào ô soạn |
| Enter / Esc (trong hộp liên kết) | Áp dụng / huỷ |

- Ô soạn: `role="textbox"`, `aria-multiline="true"`, `aria-labelledby` (nhãn), `aria-required`, `aria-readonly`,
  `aria-invalid` + `aria-describedby` (gợi ý / lỗi), `aria-placeholder`.
- Nút toolbar: `aria-pressed` theo định dạng ở vị trí con trỏ / vùng chọn, `aria-label` = `labels.*`. Nút liên kết thêm
  `aria-haspopup="dialog"` + `aria-expanded`. Hộp liên kết: `role="dialog"` (không modal), ô địa chỉ có nhãn, lỗi qua
  `aria-invalid` + `aria-describedby`.

## Cấu trúc DOM & class

```html
<td-rich-text>
  <div class="td-rich-text td-field">
    <label class="td-field__label" id="{id}-label">…<span class="td-field__required" aria-hidden="true"> *</span></label>
    <div class="td-rich-text__toolbar" role="toolbar" aria-label="Định dạng">
      <button type="button" class="td-btn td-btn--action td-btn--action-sm td-rich-text__tool" data-feature="bold" aria-pressed="false" aria-label="Đậm">…</button>
      …
    </div>
    <div class="td-rich-text__link" role="dialog" hidden> ô địa chỉ + Áp dụng / Gỡ liên kết / Huỷ </div>
    <div class="td-rich-text__editor ProseMirror" role="textbox" contenteditable="true" [data-empty] [data-placeholder]>
      <p>…</p>
    </div>
    <div class="td-field__note">gợi ý</div>
    <span class="td-field-error">lỗi</span>
  </div>
</td-rich-text>
```

Node `.td-rich-text__editor` **bền**: đổi nhãn / required / disabled / gợi ý / lỗi không dựng lại nó (giữ vùng chọn và
undo). Gỡ khỏi DOM rồi gắn lại giữ nguyên giá trị.

## Tuỳ biến giao diện

Ô soạn dùng token field chung (`--td-field-bg`, `--td-field-border`, `--td-field-focus`, `--td-field-radius-md`…) như
[input field](input-field.md). Token riêng:

| Token | Mặc định | Ý nghĩa |
|---|---|---|
| `--td-rich-text-min-height` | `6rem` | Chiều cao tối thiểu ô soạn |
| `--td-rich-text-max-height` | `20rem` | Cao hơn thì cuộn |
| `--td-rich-text-tool-on-bg` | `--td-color-hover-strong` | Nền nút đang bật |
| `--td-rich-text-tool-on-fg` | `--td-color-text` | Chữ / icon nút đang bật |
| `--td-rich-text-link` | `--td-color-info` | Màu liên kết trong ô soạn |

Icon nút lấy từ registry theo tên `bold`, `italic`, `underline`, `strikethrough`, `link` — cả năm đều có sẵn trong
registry lõi (Lucide). Site muốn icon riêng thì `registerIcons({ bold: … })` trước khi component render; nếu một tên bị
thiếu (registry tuỳ biến), nút hiện chữ cái **B / I / U / S** thay thế.

## Cảm ứng

- Nút toolbar là `td-btn--action`: vùng chạm `--td-touch-min` trên `pointer: coarse`, hiệu ứng nhấn chung của kit.
- Ô soạn và ô địa chỉ có cỡ chữ ≥ 16px trên `pointer: coarse` (bàn phím ảo không phóng to trang).

## Kích thước

Engine ProseMirror (`src/vendor/td-rich-text-engine.js`) khoảng **68 KiB gzip** sau minify; chỉ tải khi import
`/rich-text`, không nằm trong barrel gốc `@dazzxq/td-components`.

## Xem thêm

- [Input field](input-field.md) — chữ thuần, `type="textarea"`
- [Hint](hint.md) — gợi ý / lỗi dưới mọi form control
- [Form validation](form-validation.md)
