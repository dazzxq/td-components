# ADR 0035 — Số đếm có màu của `td-tabs` (K9): dùng lại token badge, tên từ nội dung, cập nhật tại chỗ

Trạng thái: **chấp nhận** — 2026-10-12 (v0.70.0). Plan [v0.70.0-tabs-counts](../plans/v0.70.0-tabs-counts.md); yêu cầu K9 của dsuite, owner kit duyệt.
Liên quan: [ADR 0011](0011-minimal-surfaces.md) (minimal surfaces), [0014](0014-breakpoints-container-queries.md) (responsive), [0019](0019-touch-standard.md).

## Bối cảnh

dsuite lọc đơn hàng theo trạng thái bằng một dải ~8 mục, mỗi mục kèm số đơn; số đến bất đồng bộ sau mỗi lần tải dữ liệu (lúc đầu chưa biết) và owner muốn
nhìn thấy nổi bật theo màu. Đó là lọc tại chỗ MỘT bảng nên hợp `td-tabs` không panel. `td-tabs` chưa có chỗ cho số đếm, và gán lại `tabs` dựng lại cả thanh
(mất focus ở thẻ không chọn, giật thanh).

## Quyết định

1. **Dữ liệu:** mỗi mục `tabs` có `count` (số hữu hạn hoặc chuỗi; `null` / `undefined` / trống / `NaN` = không vẽ; `0` vẽ "0") và `tone` (cùng 5 tone của badge; lạ → `neutral`).
   Chuỗi hiển thị **nguyên văn**: không cắt, không bó độ dài (site định dạng "1.234", "99+" và chịu trách nhiệm); số dài làm thẻ rộng ra và có thể bật chế độ cuộn
   như một nhãn dài. Phương án bác: cắt ở N ký tự (làm sai dữ liệu một cách im lặng).
2. **Màu = token của badge, không token mới.** Viên số đếm đọc cặp đặc `--td-badge-{tone}-bg` / `-fg` / `-border` qua thuộc tính riêng `--_td-tabs-count-*` đặt theo
   `[data-tone]`. Lợi: đúng vùng theme sáng / tối, cổng tương phản của badge đã đo cặp màu, `golden.json` và theme không đổi, site đổi màu bằng chính token badge.
   Phương án bác: token công khai `--td-tabs-count-*` (thêm bề mặt hợp đồng, buộc cập nhật golden và theme của từng site).
3. **Tên truy cập "Nhãn, 12" từ nội dung**, không `aria-label`: dấu phẩy là chữ trong `span.td-tabs__count-sep` ẩn bằng cắt (`clip-path`), không `display: none` /
   `aria-hidden` (cái đó loại nó khỏi tên). Không có chuỗi nào phải đồng bộ khi nhãn hay số đổi. Màu không là tín hiệu duy nhất. Không live region: số đếm đến bất đồng
   bộ không được làm trình đọc màn hình đọc lại cả thanh. Phương án bác: `aria-label` ghép ("Hoàn tất, 12": phải đồng bộ, và ghi đè tên-từ-nội-dung).
4. **`setTabCount(id, count, tone?)` cập nhật tại chỗ**, không diff `tabs`. Thanh và nút giữ nguyên là cùng phần tử (focus, thẻ đang chọn, roving tabindex không đổi), không
   phát `tab-change`. `count` rỗng xoá viên thuốc và quên tone; `tone` bỏ trống giữ tone hiện có. Gán lại `tabs` vẫn dựng lại cả thanh và thắng. Phương án bác: diff khi gán
   `tabs` (đổi hành vi của API đã có, rủi ro hồi quy cho mọi site).
5. **Đo lại một lần, handle riêng.** Bề rộng thẻ rộng nhất được cache (`_maxOuter`) và `ResizeObserver` không đo lại nó khi chỉ một thẻ đổi bề rộng, nên đổi số phải gọi `_remeasure()`.
   Một handle rAF riêng (`_countRaf`), không dùng chung `_raf` (chỉ báo) hay `_modeRaf` (chế độ tràn), gộp mọi `setTabCount` của một tick; cờ `_countDirty` đảm bảo việc đo
   không mất khi phần tử đang bị gỡ khỏi DOM (đặt bởi `setTabCount` lúc ngắt kết nối hoặc bởi `disconnectedCallback` khi khung chưa chạy; `connectedCallback` trả nợ bằng `_remeasure()`).
6. **Không làm thẻ cao hơn.** Viên thuốc 20px (sm: 18px) có `margin-block: -0.25rem`: hộp lề của nó thấp hơn mọi dòng nhãn nên nhãn quyết định chiều cao dòng và viên thuốc, căn giữa, chồng lên
   padding của thẻ. Nếu không, dải lọc cao thêm vài px mỗi khi số đếm đến muộn (CLS). Test engines bắt được điều này (bản đầu cao 20px làm thẻ cao thêm 5px).

## Hệ quả

- Không có `count` thì DOM, CSS hiệu lực và hành vi giống từng byte 0.69; không token mới, không đổi `THEME_TOKENS_VERSION`; không có helper PHP cho tabs (không đổi PHP).
- Site cần gán `tabs` mỗi khi danh sách thẻ đổi và dùng `setTabCount` cho số đếm; số hiện hành nằm trong component, getter `tabs` trả mảng đã gán.
- Mở rộng sau này (chưa làm): đặt `count` qua attribute khai báo, hoặc diff khi gán `tabs`, cần ADR riêng.
