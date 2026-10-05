[Tài liệu](../README.md) › Components

# Danh sách component

Mỗi component có một trang riêng theo cùng một khuôn: ví dụ nhanh → cách dùng → attribute → property & method →
event → hook → token CSS → cấu trúc DOM → bàn phím & trợ năng → bảo mật → lưu ý.

Có hai kiểu component:

- **Custom element** (thẻ HTML, ví dụ `<td-button>`): import module là thẻ được đăng ký, sau đó dùng thẳng trong HTML.
- **API JS tĩnh** (ví dụ `TdToast.success(…)`, `TdModal.show(…)`): gọi từ JavaScript, kit tự tạo DOM khi cần. Không
  có thẻ HTML riêng.

"Form-associated" = gửi được trong `<form>` như control gốc của trình duyệt (có `name`, vào `FormData`, hỗ trợ
`required`, reset theo form…). Xem [hướng dẫn Form](../guides/forms.md).

Mọi import đều theo dạng `@dazzxq/td-components/<tên>` (xem [Cài đặt](../getting-started/installation.md)). Luôn
nạp `td.css` một lần cho cả trang.

**Render phía server (SSR) từ PHP:** dùng [adapter PHP](../guides/php-adapter.md) `php/td.php` ship kèm gói —
`td_button`, `td_link`, `td_action_button`, `td_field`, `td_dropdown`, `td_toggle`, `td_checkbox`, `td_icon`, `td_badge`, `td_alert`, `td_otp_input`, `td_copy`, `td_multiselect`, `td_tree_select`, `td_number_input`, `td_masked_value`, `td_media_field`, `td_media_gallery`, `td_scan_input`, `td_filter_chips`, `td_datetime_range` in đúng markup của component
(control native, chạy không cần JS). Component không có helper PHP (menu, table, tabs, pagination, empty-state, trigger
lightbox, hovercard, drawer, repeater, sortable…) có mẫu markup ngay trong trang của nó (mục cấu trúc DOM / SSR).

## Form

| Component | Dạng | Import | Form-associated | Dùng để |
|---|---|---|---|---|
| [Button](button.md) | `<td-button>` | `/button` | không (nhưng `type="submit"` gửi form cha) | Nút bấm: 6 biến thể màu đặc + ghost, loading, icon, `run(asyncFn)` chống bấm đúp |
| [Action button](action-button.md) | `<td-action-button>` | `/action-button` | không | (0.36.0) Nút thao tác vuông chỉ icon như dcms2 `ActionButtons`: 23 preset (sửa / xem / xoá / gửi…), tooltip = nhãn, 3 tone × 3 cỡ, `registerPreset()`, PHP `td_action_button` |
| [Input field](input-field.md) | `<td-input-field>` | `/input-field` | có | Ô nhập text/số/email/mật khẩu/textarea, label, ghi chú, lỗi, đếm ký tự, tự giãn |
| [Checkbox](checkbox.md) | `<td-checkbox>` | `/checkbox` | có | Ô chọn (tròn), trạng thái lỗi |
| [Toggle](toggle.md) | `<td-toggle>` | `/toggle` | có | Công tắc bật/tắt, `commit()` lạc quan có trạng thái chờ |
| [Slider](slider.md) | `<td-slider>` | `/slider` | có | Thanh kéo chọn giá trị số |
| [Dropdown](dropdown.md) | `<td-dropdown>` | `/dropdown` | có | Chọn **một** giá trị, tìm kiếm (combobox); nâng cấp tại chỗ `<select>` con (progressive enhancement, `<select multiple>` giữ native) |
| [Datetime picker](datetime-picker.md) | `<td-datetime-picker>` | `/datetime-picker` | có | Chọn ngày/giờ với bánh xe, `min`/`max` |
| [Datetime range](datetime-range.md) | `<td-datetime-range>` | `/datetime-range` | có (hai mục `name[start]` / `name[end]`) | Khoảng "Từ – Đến" (ngày hoặc ngày-giờ) + chọn nhanh Hôm nay / 7 ngày / 30 ngày / Tháng này (callback), kiểm thứ tự / `max-days` / `required` theo mốc; PHP `td_datetime_range` (0.40.0) |
| [Chip input](chip-input.md) | `<td-chip-input>` | `/chip-input` | có | Nhập nhiều thẻ (tag), gợi ý từ server, tạo mới |
| [Tree](tree.md) | `<td-tree>` | `/tree` | có | Cây phân cấp (WAI-ARIA tree): không chọn / chọn một / chọn nhiều (độc lập hoặc `cascade` ba trạng thái), nút khoá vẫn gửi, nhánh tải chậm, lọc |
| [Tree select](tree-select.md) | `<td-tree-select>` | `/tree-select` | có | Chọn một / nhiều nút của cây trong ô gọn (combobox + popup cây): danh mục cha, chuyên mục; nâng cấp `<select>` con; PHP `td_tree_select` |
| [Number input](number-input.md) | `<td-number-input>` | `/number-input` | có | Ô nhập số / tiền: hiện `12.990.000`, gửi số sạch (BigInt, 30 chữ số), hậu tố `₫` / `%`, `min` / `max` / `step`, dán số có dấu chấm phẩy, `clamp` tuỳ chọn; PHP `td_number_input` |
| [Repeater](repeater.md) | `<td-repeater>` | `/repeater` | không (field trong dòng tự gửi) | Danh sách dòng động (thêm / xoá / sắp xếp bằng nút ↑ ↓ ×, `sortable`: kéo thả + bàn phím) từ `<template>` của app: "Hộp gồm", FAQ, quyền lợi; `min-rows` / `max-rows`; app tự đặt `name` qua `rows-change` |
| [Password meter](password-meter.md) | `<td-password-meter>` | `/password-meter` | không | Đo độ mạnh mật khẩu tại chỗ: thanh 4 mức, nhãn đọc được, checklist điều kiện, hook `score` |
| [OTP input](otp-input.md) | `<td-otp-input>` | `/otp-input` | có | Nhập mã một lần 6 chữ số (2FA, xác thực lại): một input thật, dán / tự điền từ SMS; PHP `td_otp_input` |
| [Scan input](scan-input.md) | `<td-scan-input>` | `/scan-input` | có (đơn: một mục; `multiple`: một mục mỗi mã hợp lệ, `imei[]`) | Ô cho máy quét mã vạch kiểu bàn phím: nhận ra một lần quét (nhịp máy + Enter), phân biệt gõ tay / dán, `validate` của app chạy song song áp theo thứ tự, chống quét trùng, danh sách nhiều mã, âm báo Web Audio tuỳ chọn; PHP `td_scan_input` (0.38.0) |
| [Media field](media-field.md) | `<td-media-field>` | `/media-field` | có (gửi `assetId`; dạng usage gửi `[id]` / `[alt]` / `[crop]`, `[focal]` khi bật `focal-point`) | Ô chọn **một** ảnh / video / file từ thư viện media: khung theo tỉ lệ, xem trước, Đổi / Gỡ, mở media picker, "Cắt ảnh" (`croppable`, 0.35); PHP `td_media_field` |
| [Media gallery](media-gallery.md) | `<td-media-gallery>` | `/media-gallery` | có (reference `name[]=id`; usage `name[i][id\|alt\|crop\|focal]`; rỗng `name=`) | (0.43.0) **Danh sách** ảnh có thứ tự: thêm nhiều qua picker, gỡ, sắp lại (kéo / chạm-để-chuyển / bàn phím), alt + cắt theo từng ảnh, `min` / `max` (≤ 100), ảnh bìa = ảnh đầu; fail closed không xoá; PHP `td_media_gallery` |
| [Cropper](cropper.md) | `<td-cropper>` + `TdCropper.openDialog()` | `/cropper` | không (giá trị form ở media field) | Khung cắt ảnh theo preset / tỉ lệ khoá + điểm trọng tâm; **chỉ xuất toạ độ** (chuẩn hoá 0..1 + pixel khi biết kích thước gốc), không tạo file, không canvas; zoom bàn phím / lăn chuột / pinch (0.35.0) |
| [Dropzone](dropzone.md) | `<td-dropzone>` | `/dropzone` | có (gửi file qua `FormData`) | Chọn / kéo thả file: lọc `accept` / `max-size` / `max-files`, danh sách + xoá, hook `upload` có tiến độ từng file, thumbnail ảnh |
| [Form validation](form-validation.md) | `TdFormValidation` | `/form-validation` | — | Kiểm tra form: ràng buộc gốc + rule riêng + lỗi từ server, tóm tắt lỗi |

## Lớp nổi & phản hồi

| Component | Dạng | Import | Dùng để |
|---|---|---|---|
| [Modal](modal.md) | `TdModal` (+ `TdModalStackManager`) | `/modal`, `/modal-stack` | Hộp thoại, xác nhận, footer có hành động bất đồng bộ, nhiều modal chồng nhau |
| [Drawer](drawer.md) | `<td-drawer>` + `TdDrawer.open()` | `/drawer` | Panel trượt từ cạnh màn hình (bộ lọc, sửa nhanh, chi tiết), chặn trang như modal; khai báo trong HTML hoặc mở từ JS |
| [Media picker](media-picker.md) | `TdMediaPicker.open()` + `<td-media-picker>` | `/media-picker` | Thư viện media full viewport kiểu dcms2: tìm, facet gọn, phân trang (cursor / số trang), card, chi tiết inline (sửa thông tin, tải về, copy link, xoá có kiểm usage ở server), dialog tải lên file / URL — dữ liệu qua **adapter** của site |
| [Toast](toast.md) | `TdToast` | `/toast` | Thông báo ngắn góc màn hình (thành công/lỗi/cảnh báo/thông tin) |
| [Tooltip](tooltip.md) | `data-tooltip` + `TdTooltip` | `/tooltip` | Chú thích khi rê chuột/focus (giao diện + hành vi dwp) |
| [Loading](loading.md) | `TdLoading`, `TdLoadingSpinner` | `/loading` | Màn chờ toàn trang, spinner nội tuyến |
| [Menu](menu.md) | `TdMenu` | `/menu` | Menu thả xuống (menu button), registry option cho plugin |
| [Hovercard](hovercard.md) | `TdHovercard` | `/hovercard` | Thẻ thông tin khi rê/focus (HTML tự do, template, URL cùng origin) |
| [Lightbox](lightbox.md) | `TdLightbox` | `/lightbox` | Xem ảnh/video toàn màn hình, gallery, panel thông tin, cử chỉ |
| [Progress](progress.md) | `<td-progress>` | `/progress` | Thanh tiến độ (có/không xác định), 4 màu, 2 cỡ, `role="progressbar"` |
| [Scroll to top](scroll-top.md) | `<td-scroll-top>` | `/scroll-top` | Nút tròn nền đặc "lên đầu trang" cố định góc, hiện khi cuộn quá ngưỡng, trả focus về nội dung chính |
| [Alert](alert.md) | `<td-alert>` + khối CSS `.td-alert` | `/alert` | Khối thông báo tĩnh trong trang (info/success/warning/danger), tiêu đề, nút đóng; markup SSR (`td_alert`) có dáng không cần JS, JS nâng cấp tại chỗ |

## Hiển thị

| Component | Dạng | Import | Dùng để |
|---|---|---|---|
| [Table](table.md) | `<td-table>` | `/table` | Bảng dữ liệu: sắp xếp, header dính, cập nhật tại chỗ; chọn dòng (0.37); bộ lọc ngoài + `controlled` + `setState` cho đồng bộ URL, ẩn / hiện cột (0.39) |
| [Filter chips](filter-chips.md) | `<td-filter-chips>` | `/filter-chips` | Chip bộ lọc đang áp dụng ("Trạng thái: Đang bán ×"), "Xoá tất cả", chip cố định, × là link cho trang PHP / không JS, một hàng cuộn khi hẹp; `filter-remove` / `filter-clear` huỷ được; PHP `td_filter_chips` (0.39) |
| [Tabs](tabs.md) | `<td-tabs>` | `/tabs` | Tab (chuẩn APG, kích hoạt thủ công) |
| [Pagination](pagination.md) | `<td-pagination>` | `/pagination` | Phân trang |
| [Empty state](empty-state.md) | `<td-empty-state>` | `/empty-state` | Màn "chưa có dữ liệu" có hành động |
| [Media grid](media-grid.md) | `<td-media-grid>` | `/media-grid` | Lưới ảnh chọn được: nâng cấp markup site/PHP, tick khi rê/focus, chế độ chọn, Shift chọn dải, Space/Enter/Esc, `select-change` / `activate` |
| [Badge](badge.md) | class CSS `.td-badge` | — (chỉ `td.css`) | Nhãn trạng thái dạng viên thuốc, viền, con dấu (`--stamp`); thuần CSS, PHP `td_badge` |
| [Sortable](sortable.md) | `<td-sortable>` | `/sortable` | Sắp thứ tự danh sách / lưới của app bằng kéo tay nắm **và** bàn phím (Space nhấc, mũi tên, Space thả, Escape huỷ), chạm-để-chuyển, thông báo cho trình đọc màn hình, `order-change` khi thả; công thức lưới ảnh với media grid |
| [Masked value](masked-value.md) | `<td-masked-value>` | `/masked-value` | Giá trị nhạy cảm bị che (`09xx xxx 123`) + nút "Hiện": gọi hook async của app (quyền / 2FA / audit), tự che lại sau N giây, không giữ giá trị trong DOM / event; PHP `td_masked_value` |
| [Copy](copy.md) | `<td-copy>` | `/copy` | Nút icon chép một giá trị (mã, ID, đường dẫn) vào clipboard, phản hồi bằng icon + thông báo cho trình đọc màn hình; PHP `td_copy` |
| [Skeleton](loading.md#skeleton-khối-giữ-chỗ-thuần-css) | class CSS `.td-skeleton` | — (chỉ `td.css`) | Khối giữ chỗ có ánh sáng lướt (dòng chữ, avatar, khung ảnh) trong lúc tải; thuần CSS |
| [Icons](icons.md) | `<td-icon>`, `tdIcon()`, `fillIconSlots()` | `/icons`, `/icon-element` (hoặc barrel) | Bộ icon (Lucide) + đăng ký icon riêng; PHP: `td_icon()` |

## Nền tảng

| Trang | Import | Dùng để |
|---|---|---|
| [Base element](base-element.md) | `/base`, `/form-element`, `/sample` | Tự viết component mới theo cùng chuẩn (vòng đời, escape, form, lỗi) |
| [Tiện ích](utilities.md) | `/dom-utils`, `/datetime` (hàm dom-utils cũng có trong barrel) | Hàm tiện ích dùng chung được export |

## Import tất cả một lần

```js
import '@dazzxq/td-components';   // đăng ký mọi custom element + export mọi API (TdToast, TdModal…)
import { TdToast, tdIcon, fillIconSlots, debounce } from '@dazzxq/td-components'; // class, hàm icon, dom-utils
```

Tiện khi thử nhanh, nhưng tải toàn bộ kit. Ở site thật nên import từng component cần dùng — xem
[Cài đặt](../getting-started/installation.md).
