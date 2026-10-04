[Tài liệu](../README.md) › [Components](README.md) › Copy

# Nút copy — `<td-copy>`

**Một nút icon** (kiểu ghost) chép một giá trị vào clipboard: mã khôi phục 2FA, request ID, ID sự kiện audit, khoá API
công khai, đường dẫn chia sẻ. Bấm → icon `copy` đổi thành `check` + màu success trong `duration` ms rồi trở lại; trình
đọc màn hình nghe "Đã copy". Trình duyệt từ chối clipboard → giá trị được **chọn sẵn** để người dùng tự Ctrl/⌘+C.
**Không** dùng khi cần một nút có chữ ("Sao chép liên kết") — dùng [button](button.md) + `navigator.clipboard` của
bạn; không dùng để copy nội dung lớn / định dạng (HTML, ảnh) — component chỉ chép **chữ thuần**.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/copy'` (class: `import { TdCopy } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | không |
| Từ phiên bản | 0.27.0 (token-native: cần `td.css`; `for` nhận field của kit từ 0.36.0) |

## Ví dụ nhanh

```html
<p>
  Request ID: <code>req_01HZX9K2</code>
  <td-copy label="Copy request ID"><code class="td-copy__source">req_01HZX9K2</code></td-copy>
</p>

<script type="module">
  import '@dazzxq/td-components/copy';
</script>
```

Giá trị nằm trong `<code class="td-copy__source">` do server viết: khi chưa có JS nó hiện ra (người dùng tự bôi đen
được, không có nút chết); khi module đã nạp nó bị ẩn và chỉ còn nút icon.

## Cách dùng

### 1. Nguồn giá trị

Lúc bấm, td-copy lấy chữ theo thứ tự ưu tiên:

1. Property `value` (`el.value = '…'`; gán `null` / `undefined` → bỏ, quay về nguồn sau).
2. Attribute `value`.
3. `for="id"`: phần tử cùng document / shadow root — `input` / `textarea` / `select` → `.value`; **field của kit** (phần
   tử `td-*` có property `value` kiểu chuỗi: `<td-input-field>`, `<td-number-input>`…, 0.36.0) → `host.value`; phần tử
   khác → `textContent`. Đọc **lúc bấm** (giá trị luôn mới). Có `for` mà không tìm thấy phần tử → **không có nguồn**.
4. **Đúng một** con trực tiếp `<code class="td-copy__source">` — chụp lại thành state ở lần gắn đầu tiên (trước mọi
   render), render lại vẫn giữ. Hai nguồn, hoặc một `.td-copy__source` lồng sâu hơn → **không có nguồn**.

Không có nguồn → bấm phát `copy-error` (icon lỗi), không chép gì.

```html
<!-- giá trị cố định trong attribute -->
<td-copy label="Copy ID sự kiện" value="evt_7f3a91"></td-copy>

<!-- lấy từ ô nhập của kit (0.36.0) hoặc ô native / phần tử trên trang -->
<td-input-field id="api-key" label="Khoá API" value="pk_live_51H…" readonly></td-input-field>
<td-copy for="api-key" label="Copy khoá API"></td-copy>

<input id="api-key-raw" value="pk_live_51H…" readonly>
<td-copy for="api-key-raw" label="Copy khoá API"></td-copy>

<span id="audit-id">aud_2026_000913</span>
<td-copy for="audit-id" size="sm" label="Copy audit ID"></td-copy>
```

```js
// giá trị tính bằng code (thắng mọi nguồn khác)
document.querySelector('#share-copy').value = `${location.origin}/s/${shareId}`;
```

### 2. Mã khôi phục 2FA

```html
<ul class="recovery-codes">
  <li><code>7KQ2-9XHM</code></li>
  …
</ul>
<td-copy id="copy-codes" label="Copy tất cả mã khôi phục" sensitive></td-copy>

<script type="module">
  import '@dazzxq/td-components/copy';
  const codes = [...document.querySelectorAll('.recovery-codes code')].map((c) => c.textContent);
  document.getElementById('copy-codes').value = codes.join('\n');
</script>
```

`sensitive`: event `copy-success` / `copy-error` **không** mang `value` — đoạn code nghe event để ghi log / analytics
không vô tình chép bí mật đi chỗ khác.

### 3. Thông báo bằng toast (tuỳ chọn)

Mặc định không có toast (chỉ đổi icon + live region). Muốn có thì nghe event:

```js
import { TdToast } from '@dazzxq/td-components/toast';

document.addEventListener('copy-success', () => TdToast.success('Đã copy vào clipboard'));
document.addEventListener('copy-error', () => TdToast.warning('Không copy tự động được — nhấn Ctrl/⌘+C'));
```

Event nổi bọt nên một listener trên `document` bắt được mọi td-copy trên trang.

### 4. Tooltip

`label` được ghi vào cả `aria-label` lẫn `data-tooltip` của nút. Site đã nạp [tooltip](tooltip.md)
(`@dazzxq/td-components/tooltip`) thì rê chuột / focus vào nút là hiện tooltip; không nạp thì chỉ có tên truy cập.

### 5. Khi clipboard bị từ chối

`navigator.clipboard.writeText` được gọi ngay trong click (có user activation). Bị từ chối (quyền, iframe không có
`allow="clipboard-write"`) hoặc không có API (trang `http:` không phải secure context, trình duyệt cũ):

- nguồn là `for` trỏ tới `input` / `textarea` → focus + chọn hết chữ trong ô đó; trỏ tới field của kit → chọn chữ trong
  `input` / `textarea` **bên trong chính host đó** (0.36.0);
- nguồn là `for` trỏ tới phần tử khác (không phải `select`) → bôi đen chữ của phần tử;
- còn lại → chèn tạm một `input.td-copy__manual` (read-only) chứa giá trị, focus + chọn sẵn; ô tự gỡ khi blur hoặc sau
  khi người dùng copy;
- nút chuyển icon `error` + màu lỗi trong `duration` ms, live region đọc `TdCopy.labels.manual` (`Nhấn Ctrl/⌘+C để copy`);
- phát `copy-error`.

### 6. Kích thước và thời gian phản hồi

```html
<td-copy size="sm" duration="1200" value="…"></td-copy>
```

Trong lúc "đã copy", `aria-label` của nút là `TdCopy.labels.copied` (trình đọc màn hình đọc đúng trạng thái khi focus
vào nút). Hết `duration`, nút về trạng thái gốc **dựng lại từ cấu hình** (icon `copy`, `aria-label` lấy lại từ `label`,
bỏ `data-state`, xoá live region) — bấm
liên tục nhiều lần không bao giờ "kẹt" ở dấu tích (khác dcms2, vốn chụp `innerHTML` làm trạng thái gốc nên bấm hai lần
liền là chụp nhầm trạng thái "đã copy").

### 7. Render phía server (PHP)

```php
<?= td_copy($requestId, ['label' => 'Copy request ID', 'size' => 'sm']) ?>
<?= td_copy(implode("\n", $recoveryCodes), ['label' => 'Copy mã khôi phục', 'sensitive' => true]) ?>
```

`td_copy()` luôn in phần tử đầy đủ (hợp đồng `copy@1`): host + `<code class="td-copy__source">` + nút + live region —
không JS thì thấy mã, có JS thì nhận markup **tại chỗ**. Chi tiết: [Adapter PHP › td_copy](../guides/php-adapter.md#td_copy-0270).

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `label` | string | `TdCopy.labels.copy` (`Copy`) | Tên nút (`aria-label`) + `data-tooltip`. Đổi → render lại. |
| `value` | string | — | Chữ cần copy (đọc lúc bấm). Có attribute (kể cả rỗng) là thắng `for` và `<code>`. |
| `for` | id | — | Id phần tử nguồn (đọc lúc bấm). |
| `size` | `'sm'` \| `'md'` | `md` | Nút 28 / 36 px (thiết bị cảm ứng: `--td-touch-min`). Giá trị khác → `md`. Đổi → render lại. |
| `sensitive` | boolean | — | Event không mang `value`. |
| `duration` | số (ms) | `2000` | Thời gian giữ icon `check` / `error`. Số nguyên ≥ 0; sai → 2000. |

## Property & method

| Thành viên | Kiểu / chữ ký | Mô tả |
|---|---|---|
| `value` | `string` | Đọc: chữ một lần bấm **bây giờ** sẽ chép (`''` khi không có nguồn). Gán: chữ cần copy, thắng mọi nguồn khác; `null` / `undefined` → bỏ. |
| `TdCopy.labels` | static | `copy: 'Copy'` (tên mặc định), `copied: 'Đã copy'` (live region khi thành công), `manual: 'Nhấn Ctrl/⌘+C để copy'` (live region + tên ô dự phòng). |

```js
import { TdCopy } from '@dazzxq/td-components/copy';
TdCopy.labels.copied = 'Copied';
TdCopy.labels.manual = 'Press Ctrl/⌘+C to copy';
```

## Event

| Event | detail | Khi nào | bubbles? |
|---|---|---|---|
| `copy-success` | `{ value }` (`{}` khi `sensitive`) | `writeText` thành công. | có (composed) |
| `copy-error` | `{ error, value }` (không có `value` khi `sensitive` hoặc không có nguồn) | Không có nguồn, không có Clipboard API, hoặc `writeText` bị từ chối. `error` là `Error` / `DOMException` gốc. | có (composed) |

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-copy-size-sm` | `1.75rem` | Cạnh nút `sm` |
| `--td-copy-size-md` | `2.25rem` | Cạnh nút `md` (và cao ô dự phòng) |
| `--td-copy-fg` | `var(--td-color-text-muted)` | Màu icon lúc nghỉ |
| `--td-copy-fg-hover` | `var(--td-color-text)` | Màu icon khi hover |
| `--td-copy-bg-hover` | `var(--td-color-hover-strong)` | Nền khi hover |
| `--td-copy-success` | `var(--td-color-success)` | Màu icon sau khi copy (`data-state="copied"`) |
| `--td-copy-error` | `var(--td-color-error)` | Màu icon lỗi + viền ô dự phòng |
| `--td-copy-radius` | `var(--td-radius-md)` | Bo góc nút / ô dự phòng |
| `--td-copy-source-bg` | `var(--td-color-surface-muted)` | Nền `<code>` nguồn khi chưa có JS |

```css
.data-table td-copy { --td-copy-size-md: 1.75rem; }
```

Nút trong suốt lúc nghỉ (luật ghost: không bóng), nền đặc khi hover, vòng focus khi focus bằng bàn phím.

## Cấu trúc DOM & class

```html
<td-copy label="Copy request ID">
  <code class="td-copy__source">req_01HZX9K2</code>             <!-- chỉ khi nguồn là <code>; ẩn khi đã định nghĩa -->
  <button type="button" class="td-copy td-copy--md" aria-label="Copy request ID" data-tooltip="Copy request ID"
          data-state="copied">                                   <!-- data-state chỉ trong lúc phản hồi -->
    <span class="td-copy__icon" data-td-icon="check" aria-hidden="true"><svg class="td-icon …">…</svg></span>
  </button>
  <input class="td-copy__manual" readonly>                       <!-- chỉ khi copy bị từ chối, tạm thời -->
  <span class="td-copy__status" role="status">Đã copy</span>      <!-- live region ẩn thị giác -->
</td-copy>
```

- Trạng thái (do JS đặt): `button[data-state="copied|error"]`; icon `data-td-icon="copy|check|error"` (một icon tại một
  thời điểm, từ registry).
- **Chưa định nghĩa** (`td-copy:not(:defined)`): nút và live region ẩn, `<code>` nguồn hiện (chọn được bằng tay).
  **Đã định nghĩa**: `<code>` ẩn, nút hiện.
- Viết markup tay cho trang không JS: **bắt buộc** có `<code class="td-copy__source">` do server viết bên trong; chỉ có
  `value` / `for` thì không JS sẽ không thấy gì.

### Hợp đồng SSR `copy@1`

[ADR 0012](../internal/decisions/0012-ssr-hydration.md). `td_copy()` in `<td-copy data-td-ssr="copy@1" …>` + đúng các
con `render()` sinh ra (nguồn `<code>`, nút có SVG sẵn, live region). Module nạp: dấu `copy@1` và các con khớp từng phần
(ô icon so theo attribute) → **nhận tại chỗ** (cùng node nút, không nháy); không khớp (markup bị sửa, attribute lạ, dấu
sai schema) → render lại sạch — nguồn `<code>` đã chụp vẫn được copy. Gỡ ra rồi gắn lại → render lại (không có state
ngoài nguồn đã chụp).

## Bàn phím & trợ năng

| Phím | Tác dụng |
|---|---|
| Tab | Focus nút |
| Enter / Space | Copy (nút native) |
| Ctrl/⌘+C | Trong ô dự phòng / phần tử đã được chọn sẵn khi clipboard bị từ chối |

- Nút có tên từ `label`; icon `aria-hidden`. Kết quả đọc qua live region `role="status"` (polite), không chuyển focus
  khi thành công.
- Khi bị từ chối, focus **chuyển** vào ô dự phòng (hoặc ô `for`) để Ctrl/⌘+C dùng được ngay.
- Vùng bấm ≥ 28 px, ≥ `--td-touch-min` trên thiết bị cảm ứng. Forced colors: nút đang phản hồi có viền `Highlight`.
- `prefers-reduced-motion`: bỏ chuyển màu.

## Bảo mật

- `label`, nguồn `<code>` được escape khi render; giá trị copy chỉ đi qua `writeText` / `input.value` (chữ thuần),
  không bao giờ thành HTML.
- `sensitive` chỉ bỏ `value` khỏi **event** — giá trị vẫn nằm trong DOM (`<code>`, attribute `value`) và trong
  clipboard. Bí mật thật sự (mật khẩu, khoá bí mật) không nên in ra trang chỉ để có nút copy.
- Clipboard là của hệ điều hành: ứng dụng khác đọc được. Với mã khôi phục, nhắc người dùng lưu vào trình quản lý mật khẩu.

## Lưu ý & lỗi thường gặp

- **Bấm luôn báo lỗi trên `http://` (không phải localhost)**: Clipboard API chỉ có ở secure context. Dùng HTTPS; trong
  lúc đó đường dự phòng chọn sẵn giá trị.
- **Nhúng trong iframe**: iframe cần `allow="clipboard-write"`, nếu không sẽ luôn đi đường dự phòng.
- **`for` trỏ tới `<select>`**: copy được `value` của option đang chọn (không phải chữ hiển thị); khi bị từ chối thì
  dùng ô dự phòng (select không bôi đen được).
- **Hai `<code class="td-copy__source">`** hoặc `<code>` bọc trong `<span>` → không có nguồn, bấm báo lỗi. Đúng một con
  trực tiếp.
- **Không có chế độ chữ / không có toast sẵn** — cố ý (một nút icon, giữ lõi nhỏ). Toast: xem mục 3.
- Đổi `value` / `for` / `sensitive` / `duration` không render lại (đọc lúc bấm); đổi `label` / `size` thì render lại.

## Xem thêm

- [Tooltip](tooltip.md) · [Toast](toast.md) · [Icons](icons.md) · [Button](button.md)
- [Adapter PHP](../guides/php-adapter.md#td_copy-0270) · [Trợ năng](../guides/accessibility.md)
- [Theming](../customization/theming.md) · [Cách component hoạt động](../concepts/how-it-works.md)
