[Tài liệu](../README.md) › [Components](README.md) › Action button

# Nút thao tác — `<td-action-button>`

Nút **vuông chỉ có icon** cho thao tác trên một dòng / một mục (sửa, xem, xoá, gửi bài, nhả bài…) — bản kit của dcms2
`ActionButtons`. Mỗi `action` là một **preset** (icon + nhãn tiếng Việt + tone); nhãn là **tên truy cập + tooltip**,
không bao giờ là chữ hiển thị. Nền trong suốt, icon theo tone, hover nền nhạt, focus ring của kit.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/action-button';` (class: `import { TdActionButton } from '@dazzxq/td-components';`) |
| Loại | Custom element (lớp con mỏng của [`<td-button>`](button.md)) |
| Form-associated | không (như `td-button`: `type="submit"` vẫn gửi form cha) |
| PHP | `td_action_button()` (`php/td.php`) |
| Từ phiên bản | 0.36.0 |

Cần `td.css`. Module tự nạp [`td-tooltip`](tooltip.md) (singleton tự khởi tạo) để nhãn hiện khi hover / focus.

## Ví dụ nhanh

```html
<div class="td-action-group">
  <td-action-button action="view" href="/bai-viet/12"></td-action-button>
  <td-action-button action="edit"></td-action-button>
  <td-action-button action="versions"></td-action-button>
  <td-action-button action="delete"></td-action-button>
</div>

<script type="module">
  import '@dazzxq/td-components/action-button';
  document.querySelector('td-action-button[action="delete"]').addEventListener('click', () => { /* … */ });
</script>
```

```php
<div class="td-action-group">
  <?= td_action_button('view', ['href' => '/bai-viet/12']) ?>
  <?= td_action_button('edit', ['element' => true]) ?>
  <?= td_action_button('delete', ['disabled' => !$canDelete]) ?>
</div>
```

## So với dcms2 `ActionButtons.generate`

| dcms2 | Kit |
|---|---|
| `ActionButtons.generate([{ action: 'edit', onClick }])` → chuỗi HTML + `onclick` | `<td-action-button action="edit">` + `addEventListener('click', …)` (CSP strict: không `onclick`) |
| khoá camelCase `sendToPublish`, `forceRelease` | tên kebab `send-to-publish`, `force-release` (alias camelCase vẫn nhận) |
| `type: standard / warning / danger` + màu riêng từng preset (xanh / tím / teal…) | `tone` 3 giá trị, **không** màu riêng (Minimal surfaces) |
| cỡ `small` / `default` / `large` = 32 / 36 / 40 | `size="sm|md|lg"` = 32 / 36 / 40 px (**khác** `td-button` 32 / 40 / 48); cảm ứng 44 × 44 |
| `title` | `aria-label` + `data-tooltip` (đọc một lần, không hai) |
| preset lạ → `''` + `console.warn` | như vậy: không render gì + cảnh báo **một lần** mỗi tên |

## Preset (23, từ dcms2)

| `action` | Icon | Nhãn | Tone |
|---|---|---|---|
| `edit` | `pencil` | Chỉnh sửa | standard |
| `view` | `eye` | Xem chi tiết | standard |
| `review` | `send` | Gửi bài | standard |
| `remove` | `arrow-down-to-line` | Gỡ bài viết | warning |
| `unpublish` | `arrow-down-to-line` | Gỡ xuống | danger |
| `withdraw` | `rewind` | Rút bài | warning |
| `return` | `undo-2` | Trả lại | warning |
| `log` | `history` | Xem log | standard |
| `versions` | `layers` | Lịch sử phiên bản | standard |
| `password` | `rotate-cw` | Reset mật khẩu | warning |
| `reset` | `key-round` | Reset mật khẩu | warning |
| `open` | `external` | Mở trong tab mới | standard |
| `copy` | `copy` | Sao chép | standard |
| `delete` | `trash` | Xoá | danger |
| `download` | `download` | Tải về | standard |
| `moveup` | `arrow-up` | Di chuyển lên | standard |
| `movedown` | `arrow-down` | Di chuyển xuống | standard |
| `publish` | `success` | Xuất bản | standard |
| `send-to-publish` | `send` | Gửi chờ xuất bản | standard |
| `submit` | `send` | Gửi bài | standard |
| `claim` | `hand` | Nhận bài | standard |
| `release` | `reply` | Nhả bài | warning |
| `force-release` | `user-x` | Nhả bài cho người khác | danger |

`copy` chỉ là **nút** (phát `click`) — muốn copy thật dùng [`<td-copy>`](copy.md). 12 icon mới cho bảng này (Lucide,
ISC): `send`, `arrow-down-to-line`, `rewind`, `undo-2`, `history`, `layers`, `key-round`, `arrow-up`, `arrow-down`,
`hand`, `reply`, `user-x` — dùng được ở mọi nơi nhận tên icon.

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `action` | string | — | Khoá preset (kebab-case; alias camelCase dcms). Tra `Object.hasOwn` — không đi prototype. |
| `label` | string | nhãn preset | Ghi đè nhãn (tên truy cập + tooltip). |
| `icon` | string | icon preset | Ghi đè icon (tên registry / alias). Tên lạ → dùng icon preset. |
| `tone` | `standard` \| `warning` \| `danger` | tone preset | Giá trị khác → tone preset (`standard` nếu không có). |
| `size` | `sm` \| `md` \| `lg` | `md` | 32 / 36 / 40 px vuông; icon 16 / 18 / 20. |
| `disabled`, `loading` | boolean | | Như `td-button` (disabled native → **không có tooltip**: trình duyệt không phát sự kiện chuột trên nút disabled). |
| `href`, `target`, `download` | string | | Chế độ link (`<a>`), cùng allowlist URL với `td-button`. |
| `type`, `name`, `value` | | | Như `td-button`. |
| `aria-label` | string | | **Ưu tiên cao nhất** cho tên: host `aria-label` > `label` > nhãn preset (tooltip dùng cùng chuỗi). |
| `aria-pressed` / `aria-expanded` / `aria-controls` / `aria-haspopup` | | | Chuyển xuống control như `td-button`. `aria-labelledby` **không** chuyển (tên luôn là chuỗi trên). |

Bỏ qua: `variant`, `color`, `text-color`, `icon-position`, `full-width` (control luôn trong suốt, vuông, chỉ icon).
Property `action` / `tone` / `size` / `label` / `icon` phản chiếu thuộc tính. Đổi `action` / `tone` / `size` / `icon` =
render lại; đổi `label` / `aria-label` = **tại chỗ** (cùng node, focus giữ; tooltip đang hiện thì ẩn).

## Static API

- `TdActionButton.presets` — object `{ name: { icon, label, tone } }`, site sửa được.
- `TdActionButton.registerPreset(name, { icon, label, tone? })` — `name` kebab-case, `label` chuỗi khác rỗng, `tone`
  thuộc 3 giá trị, `icon` có trong registry; sai → `TypeError`.

**Đăng ký trước khi in host** (hoặc trước khi `define`): registry không giữ danh sách instance, nên host đã render giữ
markup cũ tới khi đổi `action`. Preset chỉ đăng ký ở JS thì PHP phải truyền `icon` + `label`.

```js
import { TdActionButton } from '@dazzxq/td-components/action-button';
TdActionButton.registerPreset('archive', { icon: 'inbox', label: 'Lưu trữ', tone: 'warning' });
```

## Nhóm `.td-action-group`

Class CSS (không JS): `inline-flex`, xuống dòng khi hẹp, khoảng cách 4 px (cảm ứng 8 px). Trên `pointer: coarse` mỗi nút
**to thật 44 × 44** — không dùng vùng chạm `::before` mở rộng vì nút sát nhau sẽ chồng vùng chạm (ADR 0014 §5).

## PHP — `td_action_button(string $action, array $o = [])`

Option: `label`, `icon`, `tone`, `size`, `disabled`, `href`, `target`, `aria_label`, `id`, `class`, `attrs` (allowlist
`Td::ALLOWED_ATTRS` + `aria-*` / `data-*`; tên kit sở hữu và `data-td-*` bị bỏ), `element` (mặc định theo
`Td::configure(…, ['ssr_elements' => …])`). Bảng preset chép trong `Td::ACTION_PRESETS` (parity với JS bằng test).

- **Element mode**: `<td-action-button data-td-ssr="action-button@1" action="…">` + control y hệt `render()` (SVG icon
  in sẵn) → module nhận **tại chỗ** (cùng `<button>`, không nháy). Markup lệch (nhãn / icon khác, thuộc tính lạ như
  `onclick` / `formaction`, có `td-btn__label`, sai thẻ so với `href`) → render lại an toàn.
- **Native mode**: chỉ control `button.td-btn.td-btn--action…` (chạy không cần JS; tooltip khi trang có `td-tooltip`).
- Tên = `aria_label` > `label` > preset (cùng luật JS). Action lạ không có `icon` + `label` → `''` + một
  `E_USER_WARNING`.

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-action-btn-size-sm` / `-md` / `-lg` | `2rem` / `2.25rem` / `2.5rem` | Cạnh nút (chuột) |
| `--td-action-btn-radius` | `var(--td-radius-md)` | Bo góc |
| `--td-action-btn-standard-fg` / `-hover-bg` | `var(--td-gray-700)` / `var(--td-color-hover)` | Tone standard |
| `--td-action-btn-warning-fg` / `-hover-bg` | `#b45309` / `#fffbeb` | Tone warning |
| `--td-action-btn-danger-fg` / `-hover-bg` | `#b91c1c` / `var(--td-pastel-danger-bg)` | Tone danger |

Icon ≥ 4.7:1 trên trắng **và** trên nền hover của nó (gate `npm run test:contrast`). Warning hover dùng amber-50
`#fffbeb` thay pastel `#fef3c7` (trên đó `#b45309` chỉ 4.5:1).

## Cảm ứng

- Hover chỉ áp trên con trỏ mịn (chuột / trackpad); trên điện thoại không có màu hover sau khi chạm. Hình nhấn: `--td-action-btn-{standard,warning,danger}-pressed-bg` (warning: icon đậm thêm `--td-action-btn-warning-pressed-fg`).
- **Nút chỉ có icon không có nhãn nhìn thấy trên cảm ứng** (tooltip không bật khi chạm). Trên điện thoại, dùng nút có chữ hoặc gom thao tác vào menu "Thêm"; tên cho trình đọc màn hình vẫn đúng.

Chuẩn chung: [Cảm ứng](../guides/touch.md).

## Trợ năng & bảo mật

- Tên luôn có (`aria-label` = nhãn); tooltip không lặp lại tên (td-tooltip bỏ mô tả trùng tên).
- Nhãn là **text** trong thuộc tính (escape theo ngữ cảnh ở cả JS và PHP) — không bao giờ là HTML.
- CSP strict: không `style="…"`, không `onclick`; mọi giá trị qua class + token.
