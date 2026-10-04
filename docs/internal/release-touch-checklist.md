# Checklist iPhone thật (bản có đụng cảm ứng)

Khoảng 10 phút, chạy sau khi phát hành một bản đụng hành vi chạm ([ADR 0019](decisions/0019-touch-standard.md), plan
v0.36.2 QĐ 25). Trang: `npm run demo` → `demo.html`, khu **"Cảm ứng"** (truy cập từ iPhone qua IP máy dev, Safari). Ghi
kết quả (máy, iOS, Safari, đạt / lỗi) vào mục CHANGELOG của bản đó. Lỗi tìm thấy → bản vá (không đổi yêu cầu thành ghi
docs).

| # | Bước | Đạt khi |
|---|---|---|
| 1 | Chạm giữ một nút primary, một nút ghost, một hàng option trong dropdown, một tab, một nút trang | Thấy nền đổi màu ngay khi ngón chạm (không chớp xám của WebKit); nhả tay về nền nghỉ |
| 2 | Chạm rồi nhấc tay khỏi các control ở bước 1, đợi 2 giây | Không control nào giữ màu "hover" |
| 3 | Chạm nút có tooltip (khu "Nút") | Tooltip **không** hiện; hành động của nút chạy một lần |
| 4 | Mở sheet modal có form dài ("Cảm ứng" → "Form trong sheet"), chạm ô cuối (có lỗi) | Bàn phím mở; ô, nhãn và dòng lỗi nhìn thấy được; nút Huỷ / Lưu ở trên bàn phím; trang phía sau không nhảy |
| 5 | Như bước 4 với media picker (ô tìm) và drawer (ô từ khoá) | Ô và footer nằm trên bàn phím |
| 6 | Trong sheet, pinch zoom trang rồi chạm ô | Kit không giật / không đổi kích thước dialog trong lúc zoom |
| 7 | Lightbox nhiều ảnh: vuốt chậm 1/3 màn hình rồi thả; vuốt ngắn rồi thả; flick nhanh | Ảnh theo ngón; 1/3 → sang ảnh kế; ngắn → lò xo về; flick → sang ảnh |
| 8 | Lightbox: vuốt từ mép trái màn hình | Safari xử lý cử chỉ back (kit không bắt) |
| 9 | Lightbox: pinch zoom ảnh, double-tap, kéo khi đang zoom | Zoom / pan như cũ; kéo khi zoom không chuyển ảnh |
| 10 | Lightbox 1 ảnh: vuốt ngang | Ảnh nhích ít (dây chun) rồi về; không chuyển |
| 11 | Sortable: chạm-kéo tay nắm thật chậm 1–2 px rồi nhả; kéo hẳn tay nắm; vuốt dọc trên thân item | Run nhẹ → nhấc (tap-to-move); kéo hẳn → sắp xếp; vuốt thân → trang cuộn |
| 12 | Xoay ngang máy với modal / lightbox đang mở | Bố cục đúng, nút với tới được, safe-area không che |
| 13 | VoiceOver: đi qua lightbox (nút trước / sau / đóng) và modal (tiêu đề, ô, nút) | Đọc đúng tên, thứ tự hợp lý, double-tap kích hoạt |
| 14 | Bật Reduce Motion (Cài đặt › Trợ năng) rồi vuốt lightbox | Ảnh không theo ngón, thả qua 1/3 → đổi ngay |
