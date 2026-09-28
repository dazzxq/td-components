[Tài liệu](../README.md) › Components

# Danh sách component

Mỗi component có một trang riêng theo cùng một khuôn: ví dụ nhanh → cách dùng → attribute → property & method →
event → hook → token CSS → cấu trúc DOM → bàn phím & trợ năng → bảo mật → lưu ý.

Có hai kiểu component:

- **Custom element** (thẻ HTML, ví dụ `<td-button>`): import module là thẻ được đăng ký, sau đó dùng thẳng trong HTML.
- **API JS tĩnh** (ví dụ `TdToast.success(…)`, `TdModal.open(…)`): gọi từ JavaScript, kit tự tạo DOM khi cần. Không
  có thẻ HTML riêng.

"Form-associated" = gửi được trong `<form>` như control gốc của trình duyệt (có `name`, vào `FormData`, hỗ trợ
`required`, reset theo form…). Xem [hướng dẫn Form](../guides/forms.md).

Mọi import đều theo dạng `@dazzxq/td-components/<tên>` (xem [Cài đặt](../getting-started/installation.md)). Luôn
nạp `td.css` một lần cho cả trang.

## Form

| Component | Dạng | Import | Form-associated | Dùng để |
|---|---|---|---|---|
| [Button](button.md) | `<td-button>` | `/button` | không (nhưng `type="submit"` gửi form cha) | Nút bấm: 6 biến thể kính, loading, icon, `run(asyncFn)` chống bấm đúp |
| [Input field](input-field.md) | `<td-input-field>` | `/input-field` | có | Ô nhập text/số/email/mật khẩu/textarea, label, ghi chú, lỗi, đếm ký tự, tự giãn |
| [Checkbox](checkbox.md) | `<td-checkbox>` | `/checkbox` | có | Ô chọn (tròn), trạng thái lỗi |
| [Toggle](toggle.md) | `<td-toggle>` | `/toggle` | có | Công tắc bật/tắt, `commit()` lạc quan có trạng thái chờ |
| [Slider](slider.md) | `<td-slider>` | `/slider` | có | Thanh kéo chọn giá trị số |
| [Dropdown](dropdown.md) | `<td-dropdown>` | `/dropdown` | có | Chọn một/nhiều giá trị, tìm kiếm (combobox) |
| [Datetime picker](datetime-picker.md) | `<td-datetime-picker>` | `/datetime-picker` | có | Chọn ngày/giờ với bánh xe, `min`/`max` |
| [Chip input](chip-input.md) | `<td-chip-input>` | `/chip-input` | có | Nhập nhiều thẻ (tag), gợi ý từ server, tạo mới |
| [Password meter](password-meter.md) | `<td-password-meter>` | `/password-meter` | không | Đo độ mạnh mật khẩu tại chỗ: thanh 4 mức, nhãn đọc được, checklist điều kiện, hook `score` |
| [Form validation](form-validation.md) | `TdFormValidation` | `/form-validation` | — | Kiểm tra form: ràng buộc gốc + rule riêng + lỗi từ server, tóm tắt lỗi |

## Lớp nổi & phản hồi

| Component | Dạng | Import | Dùng để |
|---|---|---|---|
| [Modal](modal.md) | `TdModal` (+ `TdModalStackManager`) | `/modal`, `/modal-stack` | Hộp thoại, xác nhận, footer có hành động bất đồng bộ, nhiều modal chồng nhau |
| [Toast](toast.md) | `TdToast` | `/toast` | Thông báo ngắn góc màn hình (thành công/lỗi/cảnh báo/thông tin) |
| [Tooltip](tooltip.md) | `data-tooltip` + `TdTooltip` | `/tooltip` | Chú thích khi rê chuột/focus (giao diện + hành vi dwp) |
| [Loading](loading.md) | `TdLoading`, `TdLoadingSpinner` | `/loading` | Màn chờ toàn trang, spinner nội tuyến |
| [Menu](menu.md) | `TdMenu` | `/menu` | Menu thả xuống (menu button), registry option cho plugin |
| [Hovercard](hovercard.md) | `TdHovercard` | `/hovercard` | Thẻ thông tin khi rê/focus (HTML tự do, template, URL cùng origin) |
| [Lightbox](lightbox.md) | `TdLightbox` | `/lightbox` | Xem ảnh/video toàn màn hình, gallery, panel thông tin, cử chỉ |
| [Scroll to top](scroll-top.md) | `<td-scroll-top>` | `/scroll-top` | Nút kính tròn "lên đầu trang" cố định góc, hiện khi cuộn quá ngưỡng, trả focus về nội dung chính |

## Hiển thị

| Component | Dạng | Import | Dùng để |
|---|---|---|---|
| [Table](table.md) | `<td-table>` | `/table` | Bảng dữ liệu: sắp xếp, header dính, cập nhật tại chỗ |
| [Tabs](tabs.md) | `<td-tabs>` | `/tabs` | Tab (chuẩn APG, kích hoạt thủ công) |
| [Pagination](pagination.md) | `<td-pagination>` | `/pagination` | Phân trang |
| [Empty state](empty-state.md) | `<td-empty-state>` | `/empty-state` | Màn "chưa có dữ liệu" có hành động |
| [Icons](icons.md) | `<td-icon>`, `tdIcon()` | `/icons`, `/icon-element` | Bộ icon (Lucide) + đăng ký icon riêng |

## Nền tảng

| Trang | Import | Dùng để |
|---|---|---|
| [Base element](base-element.md) | `/base`, `/form-element`, `/sample` | Tự viết component mới theo cùng chuẩn (vòng đời, escape, form, lỗi) |
| [Tiện ích](utilities.md) | `/dom-utils`, `/datetime` | Hàm tiện ích dùng chung được export |

## Import tất cả một lần

```js
import '@dazzxq/td-components';   // đăng ký mọi custom element + export mọi API (TdToast, TdModal…)
```

Tiện khi thử nhanh, nhưng tải toàn bộ kit. Ở site thật nên import từng component cần dùng — xem
[Cài đặt](../getting-started/installation.md).
