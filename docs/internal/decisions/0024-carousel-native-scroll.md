# ADR 0024 — td-carousel: cuộn native, không autoplay, không lặp, không kéo chuột

Trạng thái: chấp nhận (2026-10-06). Nguồn: plan [v0.50.0-rating-carousel](../plans/v0.50.0-rating-carousel.md) (Codex
plan-review APPROVE vòng 3, owner chốt D1–D7). Số ADR: 0021 = v0.43 (gallery), 0022 = v0.47 (check-matrix), 0023 = v0.49
(choice-group radio).

## Bối cảnh

dsuite (#25) cần dải ảnh / sản phẩm "dùng CSS scroll-snap + nút trước / sau + chấm; nội dung hiển thị được khi không có
JS"; lộ trình đã chốt "carousel **không autoplay**". Site sẽ hỏi lại các tính năng carousel quen thuộc của thư viện khác
(tự chạy, lặp vô hạn, kéo bằng chuột, ẩn slide khuất, chấm kiểu tab). Ghi lại một lần các từ chối và lý do.

## Quyết định

1. **Không autoplay, không hẹn giờ — kể cả opt-in** (không có attribute `autoplay`). WCAG 2.2.2 + APG: nội dung tự chuyển
   cần nút dừng, gây xao nhãng, đọc màn hình bị cắt ngang; hiệu quả bán hàng thấp. Banner tự chạy là việc của site (và site
   chịu trách nhiệm nút dừng). Component không đặt `setInterval` / `setTimeout` định kỳ (test khoá).
2. **Không lặp vô hạn.** Lặp cần clone slide: nhân đôi nội dung cho SEO / trình đọc màn hình, ID trùng, phá SSR (slide
   clone không có trong markup server). Hai đầu là hai đầu: nút ở đầu / cuối `aria-disabled`.
3. **Chỉ cuộn native + CSS scroll-snap.** Không kéo bằng chuột (drag-to-scroll), không cử chỉ tự viết (Pointer Events),
   không chuyển bánh xe dọc thành cuộn ngang, không `touch-action` mới (viewport giữ `auto`: vuốt dọc bắt đầu trên dải vẫn
   cuộn trang — lỗi kinh điển "kẹt cuộn" của `pan-x`). ADR 0019: control tường minh (nút / chấm) là chính, vuốt là native.
   Nút / chấm chỉ gọi `scrollTo()`; không bao giờ `scrollIntoView()` (có thể cuộn cả trang dọc).
4. **Không `inert` / `aria-hidden` slide khuất.** Người dùng trình đọc màn hình đọc tuần tự phải đọc được mọi sản phẩm,
   giống khi không có JS; Tab vào link của slide khuất thì trình duyệt tự cuộn tới (`scroll-padding-inline`).
5. **Chấm là nút, không phải tab.** Biến thể "tabbed" của APG (tablist + tabpanel) không hợp dải nhiều slide mỗi khung
   (một tab không ứng một panel), tabpanel ẩn panel không chọn (trái với "mọi nội dung nằm sẵn"), và đọc "tab 2 trên 3" sai
   nghĩa. Chấm = `button` "Trang n / P" trong `div[role=group]`, chấm hiện tại `aria-current="true"` + dài hơn (không chỉ màu).
6. **Slide là con light DOM của site, không bao giờ render lại.** Lần nâng cấp đầu chỉ dựng **khung** quanh chúng (di
   chuyển node một lần, không clone, không `innerHTML`); markup PHP (`carousel@1`) được nhận tại chỗ, phần khung lệch được
   sửa riêng. Kit không đọc / ghi thuộc tính ảnh (`loading`, `src`, `srcset`…).
7. **Số trang từ hình học đo thật**, số slide mỗi khung do CSS (container query + token) quyết định; PHP **dự đoán** số
   trang để giữ chỗ thanh điều khiển (không dịch layout khi JS tới) theo một luật số hàng dùng chung PHP / JS / CSS (C21).

## Hệ quả

- Hành vi giống nhau có / không JS: không JS là một dải cuộn snap dùng được (thanh cuộn mảnh, Tab, vuốt), có JS thêm nút /
  chấm / bộ đếm / vùng thông báo.
- Không có API `play()` / `pause()` / `loop` / `autoplay`; yêu cầu như vậy trả lời bằng ADR này.
- Carousel lồng carousel không hỗ trợ chính thức (không chặn).
- Mở lại một quyết định = ADR mới thay thế.
