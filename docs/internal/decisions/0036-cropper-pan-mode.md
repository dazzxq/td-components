# ADR 0036 — `td-cropper` kiểu `pan`: một model rect, hai cách hiển thị; trần hiển thị 8×; tròn chỉ ở `pan`; thanh trượt dùng lại `td-slider`

Trạng thái: **chấp nhận** — 2026-10-14 (v0.73.0, mốc M1). Plan [v0.73.0-cropper-pan-mode](../plans/v0.73.0-cropper-pan-mode.md); Codex plan-review APPROVE (4 vòng); owner chốt hai bản phát hành, trần 8×, tròn chỉ ở `pan`, có thanh trượt zoom.
Liên quan: [ADR 0015](0015-td-cropper.md) (bổ sung bởi ADR này, không sửa), [0011](0011-minimal-surfaces.md), [0014](0014-breakpoints-container-queries.md), [0019](0019-touch-standard.md).

## Bối cảnh

Kiểu cũ của `td-cropper` (nay gọi `box`) để ảnh đứng yên và kéo / đổi cỡ **khung** trên ảnh. Với avatar, ảnh lớn làm khung nhỏ tí, mặt người bé và khó căn.
Owner muốn thêm kiểu khung cố định, ảnh di chuyển bên dưới, chọn bằng param; kiểu cũ giữ nguyên.

## Quyết định

1. **Một model, hai cách hiển thị.** `this._rect` (px ảnh gốc) vẫn là nguồn sự thật duy nhất và `toOutput` là đường ra duy nhất; kiểu `pan` chỉ là **một cách tính `_fit` khác** (`panFit`: ảnh vẽ to hơn
   vùng cắt, toạ độ âm, khung nằm trong ảnh ở vị trí bù lại nên trên màn hình khung đứng yên) cộng ánh xạ input đảo dấu. Ghi **đúng 8 biến CSSOM sẵn có** (`--_tdc-img-*`, `--_tdc-box-*`); không
   node DOM mới trong `SHELL`, không biến CSSOM mới, không event mới, không đổi `CropValue`. Kiểu `box` không đổi một dòng hành vi.
   Phương án bác: **`translate + scale` trên `<img>`** trong `.area` hữu hạn (đổi `_clientToModel`, thêm biến CSSOM và prop vào snapshot CSP, đụng luật cũ); **element riêng** `td-avatar-cropper`
   (hai bộ hình học / a11y / test cho cùng một output; lệch nhau về sau). Lùi về phương án `translate + scale` chỉ khi đo thấy giật ở ảnh lớn.
2. **Selector theo attribute trạng thái do JS đặt.** `data-mode="pan"` / `data-shape="circle"` là hằng sau khi attribute khớp danh sách trắng (`trim().toLowerCase()`); kiểu `box` không có attribute
   nào mới. Mọi luật CSS mới nằm dưới hai selector đó nên computed style của mọi state CSP cũ không đổi; giá trị người dùng không bao giờ vào DOM / CSS. Giá trị lạ = mặc định, im lặng.
3. **Trần hiển thị `PAN_MAX_UPSCALE = 8`, chỉ ở `pan`, chỉ chặn chiều phóng to.** Không trần thì ảnh 4000 px thành phần tử 108 000 px CSS (2 700 000 px khi `natural-width` = 100 000): đây là trần
   **kích thước phần tử**, không phải trần chất lượng ("kích thước cắt tối thiểu theo px gốc" vẫn hoãn). Rect đang nhỏ hơn trần (crop ban đầu, stage vừa to ra) được giữ nguyên; đổi cỡ stage không
   đổi output. Chặn bằng khẳng định hình học trong test node, không đo thời gian.
4. **`shape="circle"` chỉ ở `pan` và chỉ khi tỉ lệ đang áp dụng là 1:1; chỉ vẽ.** Output vẫn là hình vuông bao. Không cho `box` vì bốn tay nắm góc nằm ở góc hình vuông bao và sẽ lơ lửng ngoài
   đường tròn (và baseline CSP sẽ đóng băng hình đó). Cảnh báo một lần chỉ khi **cấu hình tĩnh** sai; người dùng tự đổi sang 16:9 thì khung về chữ nhật, im lặng.
5. **`pan` luôn có tỉ lệ, không tay nắm, không công cụ trọng tâm.** Tỉ lệ hiệu lực: `aspect-ratio` → preset đang chọn (bỏ `ratio: null`) → 1. Đổi tỉ lệ giữ tâm + zoom tương đối (`panRatio`, không phải
   `applyPreset`). Giá trị `focal` có sẵn được giữ và trả ra. 1:1 ra pixel vuông tuyệt đối (`toOutput` cờ `square`, chỉ `pan`), `box` giữ output cũ từng byte.
6. **Thanh trượt zoom dùng lại `td-slider`**, tạo bằng JS chỉ ở `pan`, cùng hàng giữa nút − và + (đổi so với dự kiến "xuống hàng riêng": co theo toolbar 4rem–10rem là đủ, không tràn). Thang logarit
   (`panZoomToT` / `panTToWidth`), zoom quanh tâm khung, thang đóng băng trong một cử chỉ; rect dưới trần thì cận dưới hiệu lực là chính rect đó. Event của slider bị chặn và đổi thành `crop-input` /
   `crop-change` với `source: 'button'` (không thêm giá trị `source`). Phương án bác: control mới tự viết (lặp lại bàn phím, vùng chạm, hình nhấn, theme đã có ở `td-slider`).
7. **Hai bản phát hành.** v0.73.0 = M1 (`<td-cropper mode="pan">`); v0.74.0 = M2 (option ở hộp thoại, media field / gallery / picker, helper PHP). M2 chạm input người dùng nên cần security review riêng.

## Hệ quả

- `td-cropper.js` import `td-slider.js` (đổi `module-graph.json`); site dùng `td.css` đã có CSS slider. Một token công khai mới `--td-cropper-pan-inset` (`24px`), hai nhãn mới (`zoom`, `panHelp`), hai attribute (`mode`, `shape`).
- Đánh đổi trợ năng ghi thẳng: dịch ảnh (và dịch khung ở `box`) chỉ bằng kéo hoặc bàn phím — chưa đạt WCAG 2.5.7 cho phần dịch ([accessibility](../../guides/accessibility.md)). Nút dịch ảnh là bản riêng nếu cần.
- Kiểu `pan` không có ngưỡng kéo (stage không có hành động chạm), ghi ngoại lệ ở [touch.md](../design/touch.md).
- Chưa làm: double-tap zoom, quán tính, làm tròn ảnh xem trước ở field / gallery, trần chất lượng theo px gốc.
