# Responsive — breakpoint, container query, vùng chạm

Từ 0.34.0 cả kit theo một bộ breakpoint ([ADR 0014](../internal/decisions/0014-breakpoints-container-queries.md)).
Trang này nói site cần biết gì để component hiển thị đúng từ điện thoại 360px tới desktop 1440px.

## Bộ breakpoint

| Tên | Khoảng (px CSS) | Thiết bị điển hình |
|---|---|---|
| `xs` | < 480 | điện thoại dọc 360–430 |
| `sm` | 480 – 719 | điện thoại lớn, máy gập khi gập (~600) |
| `md` | 720 – 1023 | iPad mini dọc 744, iPad dọc 810–834, máy gập mở 840–884 |
| `lg` | 1024 – 1279 | iPad ngang, laptop nhỏ |
| `xl` | ≥ 1280 | desktop |
| `short` | chiều cao ≤ 500 | điện thoại xoay ngang |

Site đặt bố cục **trang** theo cùng số để khớp component:

```css
@media (max-width: 719.98px) { .page-sidebar { display: none; } }   /* < md */
@media (min-width: 1024px) { .page { grid-template-columns: 16rem 1fr; } }
```

Trong JS dùng `@dazzxq/td-components/breakpoints` thay vì viết số tay:

```js
import { mqBelow, isCoarsePointer, matchesBelow } from '@dazzxq/td-components/breakpoints';
matchMedia(mqBelow('md')).addEventListener('change', relayout); // '(max-width: 719.98px)'
if (!isCoarsePointer()) searchInput.focus();                    // không bật bàn phím ảo trên máy cảm ứng
```

Đúng sáu tên: `BREAKPOINTS = { sm: 480, md: 720, lg: 1024, xl: 1280 }`, `SHORT_MAX = 500`, `mqBelow(name)`,
`matchesBelow(name)`, `isCoarsePointer()` (`(hover: none) and (pointer: coarse)`), `isShort()`.

## Component theo chỗ đặt (container query) và theo màn hình (media query)

- **Theo chỗ đặt** — component nằm trong nội dung trang đổi bố cục theo **bề rộng của chính nó**, nên đặt trong cột hẹp
  của trang desktop cũng gọn như trên điện thoại: `td-table` (dạng card khi khung < 720px), `td-pagination` (gọn khi
  < 480px), Σ dòng của `td-media-grid layout="justified"`, `td-cropper` (0.35: toolbar hai hàng, nút − / + chỉ icon khi
  < 480px), `td-scan-input` (0.38: chỉ báo / nút loa xuống dưới ô, dòng danh sách xếp dọc khi < 480px). `td-tabs` tự đo: tab không vừa thì hàng tab cuộn ngang, nhãn không bao giờ bị cắt. `td-filter-chips`
  (0.39): ≥ 480px chip xuống dòng, < 480px **một hàng** cuộn ngang với "Xoá tất cả" ghim cuối.
- **Theo màn hình** — lớp phủ (modal, drawer, toast, lightbox, loading, popup) và điều kiện thiết bị (`pointer`,
  `hover`, chiều cao).

**Component theo chỗ đặt cần bề rộng do cha quyết định.** Container query dùng *size containment* theo chiều ngang:
bề rộng của host không còn phụ thuộc nội dung. Host `display: block` trong luồng bình thường, trong lưới (`1fr`) hay
flex có `flex: 1` đều đúng. **Đừng** đặt chúng trong phần tử co theo nội dung (`display: inline-block`, `float`, flex
item `flex: 0 0 auto` không có `width`) — host sẽ sụp về 0.

Trình duyệt chưa có container query (Chrome / Edge 102–104 — kit vẫn hỗ trợ từ 102) nhận **bản dự phòng theo màn hình**
do `td.css` sinh sẵn: cùng luật, nhưng theo bề rộng viewport. Trên trang một cột ở điện thoại kết quả như nhau; trong
cột hẹp desktop thì giống bản cũ.

Form control (`td-input-field`, `td-dropdown`, `td-datetime-picker`, `td-chip-input`, `td-tree-select`, `td-tree`,
`td-number-input`, `td-otp-input`…) co được tới bề rộng cột (`min-inline-size: 0`): lưới hai cột `1fr 1fr` ở 360px
không còn tràn; chữ giá trị dài cắt `…`. `td-button` nhãn dài **xuống dòng** (không cắt, không đẩy rộng trang).

## Vùng chạm

Trên máy cảm ứng (`pointer: coarse`) mọi phần tử bấm được có vùng chạm **≥ 44 × 44px** (có thể nhỏ hơn về hình nếu
vùng bấm được mở rộng); chuột ≥ 24 × 24px. Tay nắm góc / điểm trọng tâm của `td-cropper` cũng vậy, kể cả khi nằm sát mép
ảnh (vùng cắt có đệm trong để vùng chạm không bị cắt). Ô nhập có chữ ≥ 16px để iOS không tự phóng to. Trên máy cảm ứng, dropdown /
tree-select **không tự focus ô tìm** khi mở (bàn phím ảo sẽ che danh sách); popup neo đặt trong vùng nhìn thấy còn lại
khi bàn phím ảo đang mở (`visualViewport`).

## Lớp phủ theo breakpoint

| Lớp phủ | < 480 | 480–719 | ≥ 720 | `short` |
|---|---|---|---|---|
| Modal thường / datetime | bottom sheet | bottom sheet | hộp giữa | bánh xe datetime 3 dòng |
| Media picker (luôn phủ kín màn hình) | toolbar 2 hàng, chi tiết là pane trượt | như < 480 | toolbar 1 hàng, lưới + cột chi tiết | chrome gọn, ≥ 1 hàng card |
| Hộp cắt ảnh (`TdCropper.openDialog`, bước cắt của picker, 0.35) | toàn màn hình | toàn màn hình | hộp lớn giữa | header / footer gọn, vùng cắt ≥ 200px, footer trong màn hình |
| Drawer | toàn màn hình | rộng tối đa `100% − 3rem` | theo `size` | — |
| Toast | một cột rộng hết (trừ lề) | góc phải như cũ | góc phải | chỉ 2 toast mới nhất hiện |
| Lightbox | panel là sheet dưới | sheet | sheet; ≥ 1024 panel bên phải | — |
| Datetime picker | — | — | — | bánh xe 3 dòng |

Mọi lớp phủ chạm mép màn hình cộng `env(safe-area-inset-*)` (tai thỏ, thanh home — cần
`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` để giá trị khác 0).

## Kiểm tra tự động

`npm run test:responsive` mở `test/fixtures/responsive-page.js` (cũng là mục "Responsive" của `demo.html`) ở 360 / 393 /
430 / 768 / 884 / 1024 / 1280 / 1440px (+ 744, 600, xoay ngang) trên Chromium, WebKit, Firefox, chuột và cảm ứng, và
đo: không cuộn ngang trang, không gì lọt ra ngoài màn hình, vùng chạm, chữ không chồng, nhãn tab không cắt, bảng đúng
chế độ, mọi lớp phủ nằm trong màn hình. Ảnh chụp ở `test/responsive/__out__/` (chỉ để xem, không so pixel).
