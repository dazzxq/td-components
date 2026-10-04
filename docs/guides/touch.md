[Tài liệu](../README.md) › Hướng dẫn › Cảm ứng

# Cảm ứng (touch)

Từ **0.36.2** mọi component theo một chuẩn hành vi chạm chung ([ADR 0019](../internal/decisions/0019-touch-standard.md)).
Site không phải bật gì: import component như cũ là có. Trang này nói site được gì, chỉnh ở đâu và tránh gì.

## Site được gì

| Hành vi | Chi tiết |
|---|---|
| **Không còn "hover dính"** | Mọi hiệu ứng hover của kit chỉ áp khi thiết bị có con trỏ mịn (`(hover: hover) and (pointer: fine)`). Điện thoại / iPad (kể cả iPad có trackpad, vì con trỏ chính là cảm ứng) không còn màu hover sau khi chạm. Trạng thái mang thông tin (đang chọn, đang mở, lỗi, focus) không đổi. |
| **Hình nhấn** | Nút, nút thao tác, hàng option / menu / tree, tab, phân trang, nút đóng, nút icon, card media, checkbox / switch… đổi màu ngay khi ngón chạm (chỉ đổi màu, không phóng to). Chạy cả trên iPhone, không phụ thuộc quirk `:active` của WebKit. |
| **Tooltip không bật khi chạm** | Chạm một nút có `data-tooltip` chỉ chạy hành động. Tooltip vẫn mở bằng chuột, bút, bàn phím. |
| **Kéo đúng ngưỡng** | Sortable / repeater / media grid: ngón tay phải di 10 px mới thành kéo (chuột 4 px như cũ, bút 8 px). Chạm nhẹ vẫn là "chạm để nhấc" (tap-to-move). |
| **Dialog nằm trên bàn phím ảo** | Modal, sheet điện thoại, drawer, media picker co theo vùng nhìn thấy khi bàn phím mở; ô đang nhập (cả dòng lỗi) và nút ở footer luôn nhìn thấy được. |
| **Lightbox vuốt theo ngón** | Ảnh đi theo ngón; thả qua 1/4 bề rộng (hoặc vuốt nhanh) thì sang ảnh, không thì bật về; một ảnh thì "dây chun". Vuốt từ mép màn hình vẫn là cử chỉ back của trình duyệt. |
| **`enterkeyhint` cho ô số** | `<td-number-input enterkeyhint="next">` đổi nhãn phím Enter trên bàn phím ảo (như `td-input-field`). |

## Chỉnh lại

**Màu nhấn** — token (đặt ở `:root` của site, không cần layer):

```css
:root {
  --td-color-pressed: rgb(0 0 0 / 10%);          /* nút icon, tab, trang, card */
  --td-option-pressed-bg: rgb(0 0 0 / 10%);      /* hàng option / menu / tree */
  --td-btn-primary-pressed: #27272a;             /* đổi --td-btn-primary-bg thì đổi luôn -hover và -pressed */
  --td-btn-ghost-pressed: rgb(37 99 235 / 12%);
}
```

Đủ bộ: `--td-btn-{primary,secondary,success,danger,info,warning}-pressed`, `--td-btn-ghost-pressed`,
`--td-action-btn-{standard,warning,danger}-pressed-bg`, `--td-action-btn-warning-pressed-fg`. Giá trị mặc định ở
[design/touch.md](../internal/design/touch.md#token-nhấn).
Đổi màu nhấn → giữ chữ / icon ≥ 4.5:1 trên nền nhấn.

**`:active` riêng của site**: luật của kit nằm trong `@layer td.component`; luật không layer của site luôn thắng, không cần
`!important`.

**Hover trên máy lai** (laptop cảm ứng có chuột, iPad + trackpad): kit chủ đích bỏ hover khi con trỏ chính là cảm ứng. Site
cần hover ở đó thì tự thêm luật ở layer của site.

## Bàn phím ảo và `interactive-widget`

Mặc định (iOS Safari, Android Chrome ≥ 108) bàn phím **không** thu nhỏ layout viewport; kit tự đọc `visualViewport` và
co lớp phủ. Site đặt `<meta name="viewport" content="…, interactive-widget=resizes-content">` thì trình duyệt tự thu nhỏ
layout viewport — kit nhận ra và **không** áp lần hai. Không cần làm gì thêm.

- Site override `height: 100dvh` trên con của modal / drawer → đổi thành `100%` (gốc lớp phủ giờ là vùng nhìn thấy).
- Không đặt `user-scalable=no` / `maximum-scale=1`: kit không cần và người dùng mất pinch zoom.

## Tránh

- **Đừng nhét thông tin bắt buộc vào tooltip.** Trên cảm ứng nó không bao giờ hiện. Nút chỉ có icon (`td-action-button`)
  vẫn có tên cho trình đọc màn hình, nhưng người nhìn trên điện thoại không thấy nhãn: dùng nút có chữ, hoặc gom thao tác
  vào menu ("Thêm") trên điện thoại.
- **Đừng đặt `touch-action` lên `html` / `body`** hoặc `touch-action: manipulation` diện rộng (viewport
  `width=device-width` đã bỏ trễ 300 ms).
- **Slider**: vuốt dọc bắt đầu trên thanh slider không cuộn trang (để kéo thumb chắc tay). Đặt slider sao cho còn chỗ cuộn
  quanh nó trên điện thoại.
- **Cắt ảnh** (`td-cropper`) là thao tác kéo thiết yếu (WCAG 2.5.7 "essential"); bàn phím (tay nắm + phím mũi tên) và ô tỉ
  lệ là cách thay thế.

## Xem thêm

[Trợ năng](accessibility.md) · [Tuỳ biến token](../customization/theming.md) ·
[Thay đổi 0.36.2](../upgrading/breaking-changes.md#0362)
