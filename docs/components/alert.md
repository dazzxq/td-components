[Tài liệu](../README.md) › [Components](README.md) › Alert

# Khối thông báo — `<td-alert>`

Khối thông báo **tĩnh** nằm trong dòng nội dung (flash sau khi lưu form, cảnh báo đầu trang, lỗi máy chủ…): nền màu
nhạt theo loại, icon trong **ô** tông đậm hơn nền (0.62.0; trước đó vạch màu ở mép), tiêu đề tuỳ chọn, nút đóng tuỳ chọn. Khác [Toast](toast.md) (nổi ở góc, tự biến mất):
alert đứng yên trong trang cho tới khi người dùng đóng hoặc trang đổi.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/alert'` (class: `import { TdAlert } from '@dazzxq/td-components'`) |
| Loại | Custom element + khối CSS `.td-alert` (chạy không cần JS) |
| Form-associated | không |
| PHP | [`td_alert()`](../guides/php-adapter.md#td_badge-và-td_alert) |
| Từ phiên bản | 0.18.0 (vạch mép + icon màu đặc 0.36.0; bỏ vạch, thêm ô icon 0.62.0) |

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

## Responsive (0.34.0)

Host `<td-alert>` là **container** (`container: td-alert / inline-size`). Hàng nút tuỳ chọn `div.td-alert__actions` (site tự
viết, là phần tử con cuối của nội dung) hiện cạnh nhau; khi alert **hẹp hơn 480px** các nút **xếp dọc, mỗi nút rộng
100%**:

```html
<td-alert variant="warning" heading="Chưa lưu">
  Bài viết còn thay đổi chưa lưu.
  <div class="td-alert__actions">
    <button type="button" class="td-btn td-btn--primary td-btn--sm">Lưu</button>
    <button type="button" class="td-btn td-btn--secondary td-btn--sm">Bỏ</button>
  </div>
</td-alert>
```

`td_alert()` luôn escape nội dung nên không chèn được nút — cần nút thì viết markup tay như trên (HTML của trang). Cần
bề rộng từ cha (`display: block` — mặc định). Không có container query (Chrome / Edge 102–104): dự phòng theo viewport
< 480px.

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
| `--td-alert-{…}-border` | `#93c5fd` · `#86efac` · `#fcd34d` · `#fca5a5` (0.36.0: đậm lên một bậc, ~300) | Viền 1px |
| `--td-alert-{…}-heading` | `var(--td-pastel-{v}-fg)` (tông đậm của loại; 0.41.0: trỏ vào token pastel, cùng giá trị) | Màu tiêu đề |
| `--td-alert-{…}-icon` | `var(--td-solid-{v}-bg)`; warning `var(--td-color-warning)` `#b45309` (0.36.0) | Màu icon (warning dùng sắc đậm hơn để ≥ 3:1 trên nền nhạt) |
| `--td-alert-{…}-tile` | `color-mix(in srgb, var(--td-alert-{v}-icon) var(--td-alert-tile-mix), var(--td-alert-{v}-bg))` | 0.62.0: nền ô icon (tông đậm hơn nền một bậc). Đặt `transparent` để bỏ ô. Trình duyệt không có `color-mix()`: không ô, icon vẫn trên nền |
| `--td-alert-tile-mix` | `12%` | 0.62.0: phần màu icon trộn vào nền ô |
| `--td-alert-icon-box` | `1.75rem` | 0.62.0: cạnh ô icon (dòng chữ đầu và nút đóng căn theo ô này) |
| `--td-alert-icon-radius` | `var(--td-radius-md)` | 0.62.0: bo góc ô icon |
| `--td-alert-pad-y`, `--td-alert-pad-x` | `var(--td-space-sm)`, `var(--td-space-md)` | 0.62.0: padding (gọn: `0.5rem` + `--td-alert-icon-box: 1.25rem`) |
| `--td-alert-{…}-accent`, `--td-alert-accent-width` | — | **Deprecated 0.62.0, không còn tác dụng**: vạch mép 4px (0.36.0) đã bỏ. Token vẫn khai báo để site đặt chúng không lỗi |

Theme tối (`data-td-theme="dark"` / nhánh tối của `auto`) có bộ giá trị riêng. `-bg` / `-border` / `-icon` thuộc
[hợp đồng theme](../customization/theming.md#hợp-đồng-theme-và-công-thức-nền-giấy-0410) (0.41.0): site nền tối không
bật dark đặt chúng cùng các token ngữ nghĩa. Alert thuộc **tầng nội dung** → nền đặc, không kính
([minimal surfaces](../internal/design/liquid-glass.md)). Chữ ≥ 4.7:1, icon / nút đóng ≥ 3.2:1 (icon trên ô ≥ 3:1) trên nền
của nó ở cả light và dark (gate `npm run test:contrast`). Đổi token thì tự kiểm lại tương phản.

**Giao diện (0.62.0, không còn vạch mép).** Nền nhạt đặc + viền mảnh 1px **bốn cạnh** + **ô icon** vuông bo: nhận diện loại nằm
ở hình icon (khác nhau theo loại), tông của ô, màu tiêu đề và màu viền — không phải một cạnh dày. Ranh giới ngoài của khối
(nền nhạt và viền ~1.4–1.9:1 với trang trắng) là trang trí, không mang nghĩa; nghĩa nằm ở icon (≥ 3:1), tiêu đề và nội dung
(≥ 4.7:1). Chế độ tương phản cao: viền thành màu chữ, ô icon bỏ; forced colors: `CanvasText`, không ô.

**Vì sao không tô đặc cả khối (0.36.0)?** Nút / toast / badge ngữ nghĩa đã thành màu đặc, nhưng alert chứa đoạn văn,
liên kết và nút hành động — tô đặc cả khung buộc đổi màu mọi control con. Nên alert giữ nền nhạt cho thân chữ, phần
**nhận diện** (icon, ô icon, viền, tiêu đề) dùng màu của loại. Site muốn alert đặc hẳn (chỉ nên làm khi nội dung là chữ
trơn, không liên kết / nút) đặt một khối mỗi loại:

```css
:root {
  --td-alert-danger-bg: var(--td-solid-danger-bg);
  --td-alert-danger-border: var(--td-solid-danger-border);
  --td-alert-danger-heading: var(--td-solid-danger-fg);
  --td-alert-danger-icon: var(--td-solid-danger-fg);
  --td-alert-danger-tile: transparent;
}
.td-alert--danger { --td-alert-fg: var(--td-solid-danger-fg); --td-alert-close-fg: var(--td-solid-danger-fg); }
```

(warning: `-fg` là chữ tối `#18181b`.)

## Cấu trúc DOM & class

```html
<td-alert variant="success" heading="Thành công" dismissible>
  <div class="td-alert td-alert--success" role="status">
    <span class="td-alert__icon" aria-hidden="true"><svg class="td-icon td-icon--m" data-icon="success">…</svg></span>
    <div class="td-alert__body">
      <p class="td-alert__heading">Thành công</p>
      <div class="td-alert__message">Đã lưu thay đổi.
        [<div class="td-alert__actions">…nút .td-btn…</div>]   <!-- tuỳ chọn, 0.34.0 -->
      </div>
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
