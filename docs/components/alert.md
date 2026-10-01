[Tài liệu](../README.md) › [Components](README.md) › Alert

# Khối thông báo — `<td-alert>`

Khối thông báo **tĩnh** nằm trong dòng nội dung (flash sau khi lưu form, cảnh báo đầu trang, lỗi máy chủ…): nền màu
nhạt theo loại, icon trạng thái, tiêu đề tuỳ chọn, nút đóng tuỳ chọn. Khác [Toast](toast.md) (nổi ở góc, tự biến mất):
alert đứng yên trong trang cho tới khi người dùng đóng hoặc trang đổi.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/alert'` (class: `import { TdAlert } from '@dazzxq/td-components'`) |
| Loại | Custom element + khối CSS `.td-alert` (chạy không cần JS) |
| Form-associated | không |
| PHP | [`td_alert()`](../guides/php-adapter.md#td_badge-và-td_alert) |
| Từ phiên bản | 0.18.0 |

## Ví dụ nhanh

```html
<td-alert variant="success" heading="Thành công" dismissible>Đã lưu thay đổi.</td-alert>

<script type="module">
  import '@dazzxq/td-components/alert';
</script>
```

Từ PHP (flash message) — hiện đúng dáng **ngay cả khi JS chưa nạp / không nạp**:

```php
<?= td_alert('Đã lưu thay đổi.', ['variant' => 'success', 'heading' => 'Thành công', 'dismissible' => true]) ?>
```

## Cách dùng

### 1. Một hợp đồng SSR duy nhất

`td_alert()` luôn in thẻ host `<td-alert>` **chứa sẵn markup đầy đủ** (`div.td-alert` + icon + tiêu đề + nội dung).
`td.css` tạo dáng cho markup đó mà không cần JS. Khi module `alert` được nạp, `<td-alert>` **nâng cấp tại chỗ**:

- giữ nguyên các node chữ (không render lại, không `innerHTML`);
- đồng bộ class biến thể, `role`, icon;
- gắn nút đóng nếu có `dismissible`.

Không có JS thì **không có nút đóng** (tránh nút bấm không làm gì). Muốn đóng được khi không có JS thì để server bỏ
thông báo ở lần tải sau.

### 2. Viết tay trong HTML

Nội dung con của thẻ trở thành phần thông báo (các node được **di chuyển** vào `.td-alert__message`, không phân tích
lại), nên chèn được link, `<strong>`… của chính trang:

```html
<td-alert variant="warning">Ảnh lớn hơn <strong>5 MB</strong> sẽ bị nén. <a href="/help/upload">Chi tiết</a></td-alert>
```

> Nội dung con là HTML **của trang** (tin cậy). Dữ liệu người dùng phải được escape phía server như mọi HTML khác —
> hoặc dùng `td_alert()` (luôn escape) / `heading` (luôn là chữ).

### 3. Đóng

Bấm nút đóng (hoặc gọi `el.dismiss()`) → event `dismiss` (bubbles, **cancelable**). Không ai `preventDefault()` thì
phần tử bị gỡ khỏi DOM.

```js
document.addEventListener('dismiss', (e) => {
  if (e.target.id === 'cookie-note') fetch('/api/dismiss-cookie-note', { method: 'POST' });
});
```

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `variant` | `info` \| `success` \| `warning` \| `danger` | `info` | Màu nền + icon. `danger` → `role="alert"` (đọc ngay), còn lại `role="status"`. Giá trị lạ → `info`. |
| `heading` | string | — | Tiêu đề (chữ thuần). Đổi / gỡ attribute → cập nhật tại chỗ. |
| `dismissible` | boolean | — | Thêm nút đóng (chỉ khi có JS). |

## Property & method

| Property / method | Kiểu | Mô tả |
|---|---|---|
| `variant`, `heading`, `dismissible` | property | Phản chiếu attribute. |
| `alertElement` | `HTMLElement \| null` (chỉ đọc) | Khối `.td-alert` bên trong. |
| `dismiss()` | method → `boolean` | Phát `dismiss`; không bị huỷ thì gỡ phần tử và trả `true`. |
| `TdAlert.labels` | static object | `{ close: 'Đóng' }` — nhãn trợ năng của nút đóng (`TdAlert.labels.close = 'Close'`, áp cho lần đồng bộ sau). |

## Event

| Event | `detail` | Khi nào |
|---|---|---|
| `dismiss` | — (cancelable) | Bấm nút đóng / gọi `dismiss()`. `preventDefault()` → giữ phần tử. |

## Tuỳ biến giao diện

| Token | Mặc định (light) | Tác dụng |
|---|---|---|
| `--td-alert-radius` | `var(--td-radius-lg)` | Bo góc |
| `--td-alert-fg` | `var(--td-color-text)` | Màu chữ nội dung |
| `--td-alert-close-fg`, `--td-alert-close-hover` | chữ / `--td-color-hover-strong` | Nút đóng |
| `--td-alert-{info,success,warning,danger}-bg` | `#eff6ff` · `#f0fdf4` · `#fffbeb` · `#fef2f2` | Nền |
| `--td-alert-{…}-border` | `#bfdbfe` · `#bbf7d0` · `#fde68a` · `#fecaca` | Viền 1px |
| `--td-alert-{…}-heading` | tông đậm của loại | Màu tiêu đề |
| `--td-alert-{…}-icon` | tông của loại | Màu icon |

Theme tối (`data-td-theme="dark"`) có bộ giá trị riêng. Alert thuộc **tầng nội dung** → nền đặc, không kính
([minimal surfaces](../internal/design/liquid-glass.md)). Chữ ≥ 4.7:1, icon / nút đóng ≥ 3.2:1 trên nền của nó ở
cả light và dark (gate `npm run test:contrast`). Đổi token thì tự kiểm lại tương phản.

## Cấu trúc DOM & class

```html
<td-alert variant="success" heading="Thành công" dismissible>
  <div class="td-alert td-alert--success" role="status">
    <span class="td-alert__icon" aria-hidden="true"><svg class="td-icon td-icon--m" data-icon="success">…</svg></span>
    <div class="td-alert__body">
      <p class="td-alert__heading">Thành công</p>
      <div class="td-alert__message">Đã lưu thay đổi.</div>
    </div>
    <button type="button" class="td-alert__close" aria-label="Đóng">…</button> <!-- JS + dismissible -->
  </div>
</td-alert>
```

Icon theo loại: `info` → `info`, `success` → `success`, `warning` → `warning`, `danger` → `error`. Khối
`div.td-alert…` dùng được **một mình** (không host, không JS) — ví dụ flash cũ `p.td-alert` của 135 chuyển sang
markup trên.

## Bàn phím & trợ năng

- `role="status"` (lịch sự) cho info / success / warning; `role="alert"` cho danger. Alert có sẵn khi tải trang thì
  trình đọc màn hình đọc theo dòng nội dung như bình thường.
- Icon chỉ trang trí (`aria-hidden`); màu **không** phải tín hiệu duy nhất (icon khác nhau theo loại + tiêu đề).
- Nút đóng là `<button>` thật: Tab tới, Enter / Space để đóng; tên trợ năng từ `TdAlert.labels.close`. Vùng bấm 32px
  (44px trên màn hình cảm ứng).
- Đóng thì focus không tự chuyển: nếu alert chứa focus quan trọng, bắt `dismiss` và tự đặt focus.

## Bảo mật

- `heading` luôn là chữ (`textContent`). `td_alert()` escape message + heading.
- Nội dung con viết tay là HTML của trang — không chèn dữ liệu người dùng chưa escape.
- Không có `style="…"`, không chèn `<style>` (CSP strict).
