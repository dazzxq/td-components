[Tài liệu](../README.md) › [Nâng cấp](README.md) › Thay đổi phá vỡ theo phiên bản

# Thay đổi phá vỡ theo phiên bản (0.4 → 0.55)

Trang này liệt kê, cho từng bản từ bản mới nhất ngược về **0.4.0**, những gì có thể làm site của bạn chạy
khác hoặc nhìn khác sau khi nâng cấp, và **chính xác site phải sửa gì**. Nguồn sự thật là
[CHANGELOG.md](../../CHANGELOG.md); trang này chỉ gom lại theo góc nhìn "tôi phải làm gì" và thêm ví dụ trước/sau.
Quy trình nâng cấp chung nằm ở [README.md](README.md).

Nhãn dùng trong trang:

- **Phá vỡ** — code / CSS / cấu hình của site sẽ hỏng hoặc mất tác dụng nếu không sửa.
- **Đổi hành vi** — API giữ nguyên nhưng component phản ứng khác (bàn phím, sự kiện, giá trị trả về).
- **Đổi giao diện** — không phải sửa code, nhưng site sẽ nhìn khác; có token để chỉnh lại nếu cần.
- **Không có thay đổi phá vỡ** — chỉ bổ sung (additive) và sửa lỗi.

## Tóm tắt

| Bản | Mức | Việc chính site phải làm |
|---|---|---|
| [0.55.0](#0550) | Đổi hành vi rất nhỏ (`td-number-input`, phím `.` / `,`) + thêm tính năng (tiền tố / hậu tố cho `td-input-field`, icon / slot affix, `locale`, `--td-field-note-size`) | Không bắt buộc. Ô số có `decimals > 0`: gõ `.` **hoặc** `,` khi chưa có dấu thập phân giờ ra dấu thập phân của ô (trước: dấu nhóm bị chặn). Luật CSS hộp số chuyển sang `field.css` (cùng giá trị). |
| [0.54.0](#0540) | Đổi hành vi + đổi giao diện nhỏ (hint / lỗi) + thêm tính năng (`helper-text` mọi control, `<td-hint>`, toggle `on-text` / `off-text`) | Không bắt buộc, nhưng xem lại: đang hiện lỗi thì hint **ẩn** (trước 5 control hiện cả hai) — câu lỗi nên tự đủ nghĩa; lỗi checkbox / toggle thụt dưới nhãn; PHP giờ giữ `attrs['aria-describedby']` của site ở chế độ element. Import map: thêm `hint`. Thay các dòng hint tự viết bằng `helper-text` / `<td-hint for>`. |
| [0.53.1](#0531) | Đổi giao diện nhỏ (`td-choice-group variant="segmented" size="sm"`) | Không bắt buộc. `sm` gọn hơn (đệm ngang 6 px, icon 16 px, khoảng icon 4 px, chữ nhỏ hơn); muốn giữ cũ: đặt lại `--td-choice-seg-px` / `--td-choice-seg-icon` / `--td-choice-seg-icon-gap` / `--td-choice-seg-font` trên `.td-choice--sm`. Thanh segmented giờ cuộn ngang bên trong khi quá hẹp (trước: tràn ra ngoài). |
| [0.52.0](#0520) | Thêm tính năng (`td-toggle` `tone` / `locked`, `td-choice-group variant="segmented"`) + palette `td-theme` algorithm 4 | Không bắt buộc. File `td-theme` sinh ra: header `palette algorithm 4`, chỉ `--td-btn-disabled-fg` đổi (tối hơn chút để đạt 2.2:1 trên nền hover) — file cũ vẫn đúng, sinh lại khi tiện (site có gate so từng byte: nâng kit và sinh lại trong cùng một thay đổi). PHP `td_toggle`: có khoá `tone` / `status_text` / `locked` / `locked_reason` → luôn in chế độ element. |
| [0.49.0](#0490) | Thêm tính năng (`<td-choice-group>`, `td-number-input stepper`) + đổi hành vi rất nhỏ | Không bắt buộc. `safeColor()` (và `color` của checkbox / toggle / button…) từ chối chuỗi màu **> 64 ký tự** (trước nhận `rgb(…)` dài bất kỳ). `TdFormElement` có hook `_ariaTarget()` / `_ssrVerifiedParts()` (mặc định giữ hành vi cũ). Import map: thêm `choice-group`. |
| [0.46.0](#0460) | Thêm tính năng (`<td-diff>`, PHP `td_diff` / `td_diff_snapshots`) | Không bắt buộc. Import map: thêm `diff`. File `td-theme` sinh ra: header `palette algorithm 3` (thêm hai dòng `--td-diff-*-bg`, mọi giá trị khác như cũ) — file cũ vẫn đúng, sinh lại khi tiện. |
| [0.42.1](#0421) | Đổi giao diện **chỉ ở dark**, hai trạng thái nhấn | Không bắt buộc. Light giống từng pixel. Dark: link trong khung tóm tắt lỗi form khi nhấn làm tối nền (trước phủ trắng, chữ 3.30:1 → 6.34:1); nút × của chip-input hover / nhấn nhạt hơn một chút (16 % → 13 %, chữ khi nhấn 4.22 → 4.88). Site ghi đè giá trị dark cũ: xem dưới. |
| [0.42.0](#0420) | Thêm tính năng (palette `td-theme`, builder, theme theo vùng, popup theo vùng) + đổi hành vi **chỉ khi site dùng vùng** | Không bắt buộc. Trang không đặt `data-td-theme` trên phần tử con: không đổi gì (golden light / dark 0 khác biệt). Site **chủ động** đặt `data-td-theme` trên một vùng: override **màu** không layer trên `:root` không còn chảy vào trong vùng — ghi đè thêm trên `[data-td-theme="…"]`. Popup mở từ trong vùng nay theo vùng (trước theo trang). |
| [0.41.0](#0410) | Đổi giao diện **chỉ ở dark** + thêm tính năng (`light` / `auto`, hợp đồng theme) | Không bắt buộc. Không đặt `data-td-theme` = light **giống từng pixel**, trừ viền ô chọn dòng `td-table` (sửa hồi quy 0.37) và **vòng focus bàn phím** (rõ hơn, ≥ 3:1 — chỉ thấy khi focus bằng bàn phím). Dark đổi một số giá trị (viền control ≥ 3:1, chữ phụ, accent, tooltip, bóng — danh sách dưới); site ghi đè giá trị dark cũ thì xem lại. Site **đổi** `--td-color-surface` / `-text` / `-text-muted` / `-border-strong` / `--td-color-{success,warning,error}` / `--td-pastel-*-fg` ở light: ô nhập, modal, chữ control, placeholder, badge outline, nút thao tác, tiêu đề alert giờ **đi theo** (trước giữ màu cứng). Script `matchMedia` tự bật dark → thay bằng `data-td-theme="auto"`. |
| [0.39.0](#0390) | Thêm tính năng (bộ lọc ngoài, ẩn / hiện cột, `<td-filter-chips>`) + đổi hành vi nhỏ | Không bắt buộc. Cột có sẵn khoá `hidden: true` trong `columns` giờ **bị ẩn** (trước bị bỏ qua). `getState()` thêm `filters` / `totalItems` / `requestId`. `onPageChange` chạy khi lượt bấm đổi trang kết thúc (vẫn đồng bộ). Import map: thêm `filter-chips`. |
| [0.37.0](#0370) | Thêm tính năng (chọn dòng `td-table`) + đổi hành vi nhỏ | Không bắt buộc. `<td-table>` giờ **form-associated**: có trong `form.elements`; `disabled` trên chính `td-table` (trước vô nghĩa) giờ làm trình duyệt chặn mọi cú bấm chuột trong bảng. Chọn dòng là opt-in (`selectable` + `row-key`). |
| [0.36.2](#0362) | Đổi hành vi + đổi giao diện trên cảm ứng | Không bắt buộc. Hover chỉ còn trên con trỏ mịn; hình nhấn mới (token `--td-*-pressed`); tooltip không bật khi chạm (nhãn bắt buộc → chữ / menu); kéo bằng ngón cần 10 px; lớp phủ co theo bàn phím ảo — site override `height: 100dvh` trên con của modal / drawer đổi thành `100%`. Thêm `enterkeyhint` cho `<td-number-input>`. |
| [0.36.1](#0361) | Đổi giao diện card của `td-table` (mật độ) | Không bắt buộc. Cột đầu không khai báo `card` thành `lead` khi cột khác khai báo `card: 'primary'` (giữ cũ: `card: 'secondary'` trên cột đầu); cặp xếp theo nội dung (giữ cũ: `--td-table-card-pair-min: 100%`); action có `icon` chỉ hiện icon ở card; card / khoảng cách gọn hơn (token `--td-table-card-*`). |
| [0.36.0](#0360) | Đổi giao diện + **DOM toast** (màu ngữ nghĩa, badge, alert, toast, lightbox điện thoại; xem dưới) | CSS / script nhắm `#td-toast-container > .td-toast` phải đổi (toast nằm trong lane > chồng). Còn lại không bắt buộc. Nút / badge ngữ nghĩa thành màu đặc (warning chữ tối), badge viền + bóng, alert vạch mép; muốn pastel cũ: đoạn CSS khôi phục. Thêm `<td-action-button>` / `td_action_button()`. |
| [0.35.0](#0350) | Đổi hành vi (nhỏ, chỉ khi đã bật `crop` / `focal-point`) | Không bắt buộc. Thêm `<td-cropper>` (`./cropper`), `TdCropper.openDialog()`, field `croppable` / `focal-point` / `name[focal]` (opt-in), PHP `croppable` / `crop_ratio` / `focal_point` / `focal`. Site đã truyền `crop: { enabled: true }` cho picker: "Chèn" giờ mở **bước cắt**, `urls.preview` phải là ảnh nguyên, `aspectRatio` trong [0.01, 100]. Field không `croppable` không đổi; `selection.focalPoint` thật khi có `focal-point`. Import map: thêm `cropper`. |
| [0.34.0](#0340) | Đổi giao diện + đổi DOM (nhỏ) | Responsive: modal sheet < 720 (trước ≤ 640), `td-table` tự thành card khi hẹp (`layout="table"` để giữ cũ), `textContent` của ô bảng có thêm nhãn cột ẩn, site chỉ đè `--td-media-grid-row-ratio` giờ chỉ áp lưới ≥ 1024px. |
| [0.33.0](#0330) | Đổi giao diện + đổi văn bản (không breaking API) | Không bắt buộc sửa code. Media picker full viewport giống dcms2: nhãn mặc định đổi ("Chọn ({n})" → "Chèn ({n})", "Huỷ" → "Đóng", "Thư viện media" → tiêu đề theo `selection.kinds`), `pageSize` 40 → 30, "Tải thêm" → phân trang, bỏ khay thumb. `td-media-grid`: ô đã chọn hết thu nhỏ / nền, thành vòng inset; grid tự đặt kích thước `img` (CSS site trên `img` không còn thắng — dùng token). |
| [0.32.0](#0320) | Không có thay đổi phá vỡ | Không. Thêm `<td-media-picker>` / `TdMediaPicker`, `<td-media-field>`, `td_media_field()`. Import map tự liệt kê: thêm `media-picker`, `media-field`. |
| [0.31.0](#0310) | Đổi văn bản (nhỏ) | Không bắt buộc. Thêm `<td-sortable>`, `<td-masked-value>`, `td_masked_value()`, `<td-repeater sortable>`. Câu thông báo di chuyển dòng của repeater đổi chữ (test so đúng chữ phải cập nhật). Import map: thêm `sortable`, `masked-value`. |
| [0.30.0](#0300) | Không có thay đổi phá vỡ | Không. Sửa `<td-otp-input>` co hẹp trong flex row. Thêm `<td-repeater>`, `<td-number-input>`, `td_number_input()`. Import map tự liệt kê: thêm `repeater`, `number-input`. |
| [0.29.0](#0290) | Không có thay đổi phá vỡ | Không. Thêm `<td-tree>`, `<td-tree-select>`, `td_tree_select()`. Import map tự liệt kê: thêm `tree`, `tree-select`. |
| [0.28.0](#0280) | Không có thay đổi phá vỡ | Không. `<td-chip-input>` thêm `selection-only` / `select-all` / nhóm / nâng cấp `<select multiple>`; PHP `td_multiselect()`. |
| [0.27.0](#0270) | Không có thay đổi phá vỡ | Không. Thêm otp-input, drawer, copy, skeleton CSS. Import map tự liệt kê: thêm `otp-input`, `drawer`, `copy`. |
| [0.26.1](#0261) | Không có thay đổi phá vỡ | Không. Sửa password-meter `for` trỏ id ô của field. |
| [0.26.0](#0260) | Không phá vỡ (opt-in) | Site đã bật `ssr_elements`: field / toggle / checkbox / dropdown cũng in element mode — kiểm CSS / JS bám ô native, id. Thêm `td_empty()`. |
| [0.25.0](#0250) | Không có thay đổi phá vỡ | Không bắt buộc. Muốn hết flash: bật element mode PHP (`ssr_elements`); khi bật, `id` / `class` của `td_button` nằm trên host. |
| [0.24.0](#0240) | Đổi giao diện + đổi hành vi (nhỏ) | Lightbox: nút trước / sau ra hai bên trên máy chuột; URL item trả ra là tuyệt đối; tải sẵn ảnh kề chỉ cùng origin mặc định. |
| [0.23.0](#0230) | Không có thay đổi phá vỡ | Không. Thêm `<td-media-grid>`. |
| [0.22.1](#0221) | Không có thay đổi phá vỡ | Không. Modal đổi chuyển động (giống dcms); site đặt `--td-modal-ease` riêng: giờ là đường cong fade. |
| [0.22.0](#0220) | Đổi DOM (nhỏ) | CSS / code site cuộn hoặc đo `.td-dropdown__options` → `.td-dropdown__scroller`; "Không có kết quả" nằm trên listbox. |
| [0.21.1](#0211) | Không có thay đổi phá vỡ | Không. Sửa lỗi popup / modal / lightbox khi kết hợp; `TdMenu` `onClose` thêm reason `'covered'`. |
| [0.21.0](#0210) | Đổi giao diện + đổi DOM toast | Primary đen (về accent bằng token); nút ngữ nghĩa pastel; tooltip đen; toast bỏ icon (code query `.td-toast__icon` phải bỏ); modal có animation. |
| [0.20.0](#0200) | Đổi giao diện lớn | Kiểm bằng mắt nút / popup / toast / modal; override token kính cũ hết tác dụng → đổi sang token mới (bảng dưới). |
| [0.19.0](#0190) | Đổi hành vi (nhỏ) + đổi giao diện (nhỏ) | datetime-picker mặc định mở tại hôm nay (cần đầu khoảng → `open-at="min"`); stamp dùng font mono; `td-button` chuyển ARIA trạng thái xuống; dropzone hiện `err.message`. |
| [0.18.0](#0180) | Đổi hành vi (nhỏ) | `searchable="false"` (PHP) giờ tắt thật; `hasIcon()` hiểu alias; datetime-picker nhận ISO; `td-button` truyền `name`/`value`. |
| [0.17.0](#0170) | Đổi hành vi (nhỏ) | `dropdown.value` trả giá trị đang chọn; `<td-dropdown>` chứa `<select>` giờ được nâng cấp. |
| [0.16.0](#0160) | Đổi hành vi | `input-field.value`, slider `required`/`step`/mặc định, dropdown giữ/bỏ lựa chọn + `onSelect`+`onChange`, `confirm` giữ mở khi `onConfirm` trả `false`, định dạng `toAbsolute`, token `:root`, dark accent. |
| [0.15.1](#0151) | Không có thay đổi phá vỡ | Không. Tài liệu viết lại; sửa con trỏ trigger video lightbox. |
| [0.15.0](#0150) | Không có thay đổi phá vỡ | Không bắt buộc. Con trỏ trên trigger lightbox đổi. |
| [0.14.4](#0144) | Đổi giao diện (nhỏ) | Không bắt buộc. |
| [0.14.3](#0143) | Đổi giao diện + gỡ 1 token | Bỏ override `--td-glass-secondary-film`; kiểm tra nút secondary / disabled. |
| [0.14.2](#0142) | Đổi giao diện | Site cần tương phản chặt: ghi đè `--td-control-border-hover`. |
| [0.14.1](#0141) | Đổi giao diện | Site cần viền 3:1 lúc nghỉ: ghi đè `--td-control-border-soft`. |
| [0.14.0](#0140) | Đổi giao diện lớn + đổi hành vi | Kiểm tra glass, nút, checkbox tròn, toast, tooltip; tooltip dwp chạy trùng. |
| [0.13.0](#0130) | Không có thay đổi phá vỡ | Không. |
| [0.12.0](#0120) | Đổi hành vi (nhỏ) | Test so khớp thông báo lỗi tiếng Anh của checkbox/toggle/slider. |
| [0.11.0](#0110) | Phá vỡ | Site dùng Tailwind phải tự khai báo `tailwindcss`; `td-sample` đổi markup. |
| [0.10.0](#0100) | Phá vỡ + đổi hành vi | Class BEM của datetime-picker / table; `getValue()` trả `''`; server-mode cần `total-items`. |
| [0.9.0](#090) | Phá vỡ + đổi hành vi | Class BEM của modal / toast / tooltip / dropdown; z-index theo token; `getTheme()` đổi kiểu trả về. |
| [0.8.0](#080) | Phá vỡ + đổi hành vi | Class BEM của input-field / slider / pagination / tabs / empty-state; một sự kiện mỗi loại; tabs kích hoạt thủ công. |
| [0.7.0](#070) | Phá vỡ + đổi hành vi | Bắt buộc tải `td.css`; class BEM của button / checkbox / toggle / loading; `--td-cb-color` → `--td-checkbox-color`. |
| [0.6.0](#060) | Không có thay đổi phá vỡ | Không. |
| [0.5.0](#050) | Không có thay đổi phá vỡ | Không. |
| [0.4.1](#041) | Đổi hành vi (sửa lỗi) | Code đọc `body.style.overflow` của modal; role của toast. |
| [0.4.0](#040) | Đổi hành vi | Modal không còn đóng khi bấm nền; `searchable="false"` / `allow-clear="false"` giờ có tác dụng. |

Nhảy nhiều bản một lúc (ví dụ 0.6 → 0.15)? Làm theo thứ tự cũ → mới: tải `td.css` (0.7) trước, rồi đổi selector
theo [class-map.md](class-map.md) (0.7–0.10), rồi xử lý hành vi và giao diện.

---

## 0.55.0

**Mức: đổi hành vi rất nhỏ; thêm tính năng.**

- **Đổi hành vi — phím thập phân của `td-number-input`:** khi `decimals > 0` và ô **chưa** có dấu thập phân (ngoài vùng chọn),
  gõ `.` hoặc `,` — kể cả khi đó là **dấu nhóm** của ô (`.` ở ô tiếng Việt) — chèn **dấu thập phân của ô**. Trước 0.55 phím
  dấu nhóm bị chặn. Lý do: bàn phím `decimal` của iOS / Android hiện dấu theo **máy** (máy tiếng Anh chỉ có `.`), và dấu nhóm
  do kit tự thêm nên người dùng không bao giờ cần gõ nó. `decimals = 0` hoặc đã có dấu thập phân: như cũ (bị chặn). Dán / tự
  điền không đổi. Test site gõ `.` mong bị chặn trong ô có số lẻ → cập nhật.
- **Thêm:** `td-input-field` `prefix` / `suffix` / `prefix-icon` / `suffix-icon` / `unit-label` + con `[slot="prefix"|"suffix"]`
  (type `text` · `search` · `email` · `url` · `tel` · `password` · `number`); `td-number-input` `prefix-icon` / `suffix-icon`,
  slot, `locale`; PHP `td_field` (`prefix`, `suffix`, `prefix_icon`, `suffix_icon`, `unit_label`), `td_number_input`
  (`prefix_icon`, `suffix_icon`, `locale`). Không dùng option mới → markup PHP và `render()` giống từng byte 0.54 (hợp đồng
  SSR vẫn `@1`).
- **CSS:** luật hộp của `td-number-input` chuyển từ `number-input.css` sang `field.css` dưới `:is(.td-number__box,
  .td-field__box)` với cùng độ ưu tiên — giá trị tính không đổi (baseline CSP giống từng byte). `--td-number-affix-fg` /
  `--td-number-affix-gap` mặc định thành `var(--td-field-affix-fg)` / `var(--td-field-affix-gap)` (cùng giá trị); site đặt
  token cũ vẫn thắng.
- **Token mới** `--td-field-note-size` (cỡ chữ mọi gợi ý; mặc định như cũ — `--td-text-xs`, cảm ứng `--td-text-sm`): site
  muốn gợi ý to hơn đặt token này thay vì đổi `--td-text-xs` của cả kit.

## 0.54.0

**Mức: đổi hành vi + đổi giao diện nhỏ; thêm tính năng.**

- **Hint và lỗi:** khi control đang hiện lỗi, hint ẩn và rời `aria-describedby`. Trước đây `td-input-field` (luật D17),
  `td-number-input`, `td-choice-group`, `td-media-field`, `td-media-gallery` hiện cả hai. PHP in note `hidden` khi có cả hint và lỗi.
  Viết câu lỗi tự đủ nghĩa (đừng dựa vào hint đứng cạnh).
- **Checkbox / toggle:** hint và lỗi nằm dưới nhãn, thụt thẳng mép nhãn; khi có hint / lỗi host xếp dạng cột.
- **`helper-text` đổi lúc chạy** cập nhật tại chỗ (không vẽ lại, giữ focus) — code dựa vào việc vẽ lại sau khi đổi `helper-text`
  cần đổi sang attribute khác.
- **PHP:** `td_toggle` / `td_checkbox` có `helper_text` / `on_text` / `off_text` luôn in chế độ element; các helper chế độ element
  giữ `attrs['aria-describedby']` của site (trước bị bỏ). Không dùng option mới và không truyền `aria-describedby` → output giống
  từng byte 0.53.x.
- **Thêm `helper_text` cho `td_checkbox` / `td_toggle` = đổi sang chế độ element:** host `<td-checkbox>` / `<td-toggle>` mới là
  control của form (gửi `value` qua ElementInternals); `<input>` bên trong chỉ để hiển thị, sau nâng cấp không còn `name` / `value`
  — JS của site đọc `querySelector('input[name=…]').value` sẽ không tìm thấy ô (hoặc đọc ra `"on"`). Đọc `el.checked` / `el.value`
  trên host hoặc `new FormData(form)` ([checkbox.md](../components/checkbox.md#trong-form), [toggle.md](../components/toggle.md#trong-form)).
- **Import map:** thêm `"@dazzxq/td-components/hint"`.

## 0.53.1

**Mức: đổi giao diện nhỏ (segmented `sm`).**

- `td-choice-group variant="segmented" size="sm"`: đệm ngang 10 → 6 px, icon 20 → 16 px, khoảng icon 6 → 4 px, chữ `text-xs`.
  Giữ cũ: đặt lại các token `--td-choice-seg-px` / `--td-choice-seg-icon` / `--td-choice-seg-icon-gap` / `--td-choice-seg-font`.
- Bố cục cả thanh (`data-layout`) thay cho việc từng ô tự xuống dòng; thanh quá hẹp cuộn ngang bên trong.

## 0.52.0

**Mức: thêm tính năng; palette `td-theme` lên algorithm 4.**

- `<td-toggle>`: `tone="success|warning"` (màu rãnh khi bật + icon trên núm + chữ trạng thái cho trình đọc màn hình),
  `status-text`, `locked` / `locked-reason` (giữ nguyên trạng thái, vẫn gửi form, không phát `change`, mô tả "Không thể
  thay đổi: …"). Khoá chỉ là giao diện: trước khi JS nạp / không JS, Space hoặc `<label for>` ngoài vẫn đổi được checkbox
  native — **server phải bỏ qua / từ chối thay đổi field bị khoá**.
- `<td-choice-group variant="segmented">` (+ `size`, `icon-only`, option `icon`); icon mới `lock`, `clock`, `sun`, `moon`,
  `monitor`.
- Bộ sinh palette (`bin/td-theme.mjs`): `ALGORITHM_VERSION` 3 → 4. Chỉ `--td-btn-disabled-fg` đổi (nay cũng đạt ≥ 2.2:1 trên
  nền hover). File đã commit vẫn dùng được; sinh lại thì header và đúng dòng đó khác.

## 0.49.0

**Mức: thêm tính năng; một thay đổi hành vi rất nhỏ.**

- Mới: `<td-choice-group>` (`./choice-group`, PHP `td_choice_group`, hợp đồng SSR `choice-group@1`) và chế độ `stepper` của
  `<td-number-input>` (PHP `'stepper' => true`, chỉ chế độ element; schema SSR vẫn `number-input@1` — markup không có
  `stepper` giữ nguyên từng byte, chỉ id tự sinh của các ô in sau trong cùng request tăng thêm khi có ca mới).
- `safeColor()` thêm giới hạn **64 ký tự** sau khi cắt khoảng trắng (cùng bảng ca với `Td::safeColor` mới của PHP). Màu
  hợp lệ thật không bao giờ dài thế; một `rgb(…)` dài bất thường giờ về giá trị dự phòng.
- `TdFormElement` (cho component tự viết kế thừa nó): `_ariaTarget()` — phần tử nhận `aria-invalid` / `aria-errormessage` /
  `aria-describedby` (mặc định = `_focusTarget()`, như cũ); `_ssrVerifiedParts()` — phần tử đã so khớp đúng `render()` được
  miễn luật "đúng một control" khi nhận SSR (mặc định rỗng, như cũ).
- Đổi cấu trúc (`stepper` bật / tắt, `label`, `size`…) của `<td-number-input>` đang focus giờ **giữ focus** trên ô mới (trước
  mất focus).

## 0.46.0

**Mức: thêm tính năng, không phá vỡ.** Thêm `<td-diff>` ([diff.md](../components/diff.md)) — so sánh trước / sau theo
trường cho màn audit log — và PHP `td_diff()` / `td_diff_snapshots()` / `Td::diffModel()` (hợp đồng SSR `diff@1`).

- Import map tự liệt kê: thêm `@dazzxq/td-components/diff`.
- Palette `td-theme`: thuật toán **3** — chỉ thêm `--td-diff-added-bg` / `--td-diff-removed-bg` (nền ô, tính cho nền của
  palette), mọi giá trị khác như thuật toán 2. File cũ vẫn chạy (thiếu token → giá trị light / dark của kit); sinh lại khi
  tiện để nền ô khớp palette. `--preset light|dark` = giá trị kit.
- Không đổi gì ở component khác.

## 0.42.1

**Mức: đổi giao diện chỉ ở dark, chỉ hai trạng thái nhấn.** Không đặt `data-td-theme` / light: giống từng pixel 0.42.0
(golden light 0 khác biệt). Dark (`data-td-theme="dark"` / `auto` ở OS tối): hai cặp chữ / nền khi nhấn dưới ngưỡng 4.7
của kit, nay đạt (gate cặp render chặn cả dark built-in):

| Chỗ | 0.42.0 | 0.42.1 |
|---|---|---|
| Link trong `.td-form-summary` khi nhấn | phủ `--td-color-pressed` (trắng 14 %) — chữ lỗi 3.30:1 | token mới `--td-form-summary-pressed-bg` (mặc định `var(--td-color-pressed)`; dark `rgb(0 0 0 / 40%)`): nền tint **tối đi** khi nhấn — 6.34:1 |
| Nút × của `td-chip-input` (hover; nhấn = lớp đó hai lần) | `--td-chip-remove-hover` dark `rgb(255 255 255 / 16%)` — chữ khi nhấn 4.22:1 | `rgb(255 255 255 / 13%)` — 4.88:1 (hover 6.83:1) |

Muốn giữ cũ (không khuyến nghị, dưới AA): `:root[data-td-theme="dark"] { --td-form-summary-pressed-bg: rgb(255 255 255 / 14%);
--td-chip-remove-hover: rgb(255 255 255 / 16%); }`. File `td-theme` sinh ra: header ghi `palette algorithm 2` (thêm dòng
`--td-form-summary-pressed-bg`, mọi giá trị khác như cũ); file thuật toán 1 vẫn đúng, sinh lại khi tiện. `--preset dark`
ra đúng giá trị dark mới của kit.

## 0.42.0

**Mức: thêm tính năng; đổi hành vi chỉ khi site đặt `data-td-theme` lên một phần tử con của trang.** Không đặt hoặc
chỉ đặt trên `<html>`: giá trị computed của mọi token như 0.41 (golden light + dark 0 khác biệt, CSP parity không chụp
lại). Chi tiết: [theming.md › Palette tuỳ biến](../customization/theming.md#palette-tuỳ-biến-td-theme-0420) và
[Theme theo vùng](../customization/theming.md#theme-theo-vùng); quyết định: [ADR 0020](../internal/decisions/0020-theme-scope-portal.md).

**Thêm:**

- CLI `npx td-theme` (`package.json#bin`) + module `@dazzxq/td-components/theme` (`generatePalette`, `toCss`, …) + trang
  `src/theme/builder/theme-builder.html`: sinh file CSS tĩnh (bọc `@layer td.tokens`) từ `bg` + `accent` (+ surface,
  trạng thái), tự cân WCAG AA, mã chẩn đoán ổn định. Nạp **sau** `td.css`, trước CSS site.
- Theme theo vùng: `data-td-theme="dark" | "light" | "auto" | "<tên>"` trên bất kỳ phần tử nào.
- Popup ra `<body>` (dropdown, chip-input, tree-select, menu, hovercard, tooltip, modal, drawer, toast, loading, media
  picker, crop dialog) mở từ trong vùng theo vùng. Overlay gọi bằng code nhận option `themeRoot` (`TdModal.show/confirm/…`,
  `TdToast.*`, `TdLoading.show`, `TdMenu.open`, `TdDrawer.open`, `TdMediaPicker.open`, `TdCropper.openDialog`).

**Đổi hành vi (chỉ site dùng vùng):**

| Trước (0.41) | Từ 0.42.0 |
|---|---|
| `<section data-td-theme="dark">` không có tác dụng | vùng tối thật (token màu giải lại trên vùng) |
| `:root { --td-accent: red }` (CSS không layer) tô cả phần tử bên trong mọi `<section data-td-theme>` | **không** tới được bên trong vùng: vùng khai báo lại token **màu** của theme đó. Muốn: thêm `[data-td-theme] { --td-accent: red }` (mọi vùng) hoặc `[data-td-theme="dark"] { … }` |
| Popup mở từ vùng ra theme của `<html>` | ra theme của vùng: token **ngữ nghĩa** (hợp đồng theme, + `color-scheme`) đặt trên phần tử có attribute đi theo; token **riêng của component** đặt trên vùng (`.promo[data-td-theme] { --td-checkbox-color }`) và override cục bộ không đánh dấu (`.card { --td-accent }`) thì **không** — trừ rule chọn theo giá trị attribute (`[data-td-theme="dark"] { … }`), vì attribute được chép sang popup |

Token **hình học** (độ rộng, chữ, khoảng cách, bo góc, z-index, chuyển động, thang xám) vẫn chỉ trên `:root`: override
của site tới được mọi vùng như cũ.

**Selector trong `td.css` đổi (không đổi giá trị):** khối token màu `:root` → `:root, [data-td-theme]`; khối dark
`:root[data-td-theme="dark"]` → `:root[data-td-theme="dark"], [data-td-theme][data-td-theme="dark"]` (nhánh `auto` tương
tự); light tường minh → `[data-td-theme="light"], [data-td-theme="auto"]`. Rule `:root[data-td-theme="dark"] { … }` của site
(không layer) vẫn thắng như trước. CSS / test của site **đọc text** của `td.css` theo selector cũ thì cập nhật.

`dom-utils` (`contrastRatio`, `getAccessibleTextColor`, `relativeLuminance`): API + kết quả không đổi (nay dùng chung
`src/theme/color.js`).

## 0.41.0

**Mức: đổi giao diện chỉ ở dark + thêm tính năng + một sửa lỗi light.** Không đặt `data-td-theme` → light giống từng
pixel 0.40 (khoá bằng test golden: mọi token `--td-*` đều giải ra đúng giá trị cũ), **trừ** viền ô chọn dòng của
`td-table` (dưới, `lightDeltas` trong golden). Chi tiết: [theming.md › Light / dark / auto](../customization/theming.md#light--dark--auto)
và [Hợp đồng theme](../customization/theming.md#hợp-đồng-theme-và-công-thức-nền-giấy-0410).

**Thêm:**

- `data-td-theme="light"` (light tường minh + `color-scheme: light`) và `data-td-theme="auto"` (theo hệ điều hành bằng
  CSS thuần, không JS, không chớp). Không đặt attribute: như cũ, không bao giờ tự lật, không `color-scheme`.
- Token hợp đồng mới (mặc định = đúng màu cũ ở cả hai theme): `--td-color-surface-raised` (= surface), `--td-color-text-label`,
  `--td-color-fill`, `--td-color-fill-strong`, `--td-color-on-fill`. Token component mới: `--td-btn-ghost-hover-fg-fallback`,
  `--td-table-check-border`.

**Đổi hành vi của override (light, chỉ khi site đã đổi token gốc):** các token component dưới đây trước là màu cứng,
nay trỏ vào token ngữ nghĩa — giá trị mặc định không đổi, nhưng nếu site **ghi đè token gốc** thì chúng đi theo:

| Site ghi đè | Giờ cũng đổi theo |
|---|---|
| `--td-color-surface` | `--td-color-surface-raised` → `--td-control-bg` (mọi ô nhập, trigger dropdown / datetime, OTP, chip-input…), `--td-glass-solid` (modal, thẻ loading, scroll-top, nền fallback khi tắt blur) |
| `--td-color-text` | `--td-control-fg`, `--td-btn-secondary-fg` |
| `--td-color-text-muted` | `--td-field-placeholder` |
| `--td-color-border-strong` | `--td-control-border` (viền nút phân trang, nút tỉ lệ cropper) |
| `--td-color-success` / `-warning` / `-error` | mực badge outline / stamp, icon nút thao tác warning / danger, icon alert warning |
| `--td-pastel-{v}-fg` | tiêu đề alert cùng loại |
| `--td-gray-100` / `--td-gray-700` | (vẫn như cũ, qua `--td-color-fill` / `--td-color-text-label`) |

Site muốn giữ ô nhập / modal **trắng** trong khi đổi `--td-color-surface`: đặt `--td-color-surface-raised: #fff`. Site
đã tự đặt `--td-control-bg` / `--td-glass-solid` vẫn thắng như cũ.

**Đổi giao diện — chỉ dark (`data-td-theme="dark"` và nhánh tối của `auto`):** dark hết nhãn thử nghiệm; giá trị đổi
(cột "Trước" là 0.40):

| Token | Trước | 0.41.0 | Vì sao |
|---|---|---|---|
| `--td-control-border-soft` | `#3a3a3c` (1.50:1) | `#76767c` | Viền ô nhập / trigger / checkbox chưa chọn / switch ≥ 3:1 với mọi nền kề (quyết định owner). Theo sau: `--td-field-border`, `--td-checkbox-border`, `--td-switch-edge`, `--td-dropdown-search-border`, `--td-dtr-preset-border` |
| `--td-control-border-hover` | `#636366` | `#8e8e93` | Bậc trên viền mềm (≥ 4.7:1). Theo sau: `--td-field-border-hover`, viền option active (dropdown, tree), `--td-dtp-band-border` |
| `--td-color-text-muted` | `#a1a1aa` | `#acacb4` | ≥ 4.7:1 cả trên nền hover (trước 4.42). Theo sau: mọi chữ phụ (placeholder, ghi chú field, đầu bảng, nhãn tab…) |
| `--td-accent` | `#3b82f6` | `#4b8df8` | Accent làm chữ (nút ghost) ≥ 4.7:1 trên surface (trước 4.63). Theo sau: `--td-accent-fill` (≈ `#3c71c6`, chữ trắng 4.8), checkbox / slider / pagination / viền focus ô nhập / vòng chọn media |
| `--td-color-border` | `#2c2c30` | `#333338` | Đường phân cách thấy được (1.35:1, trước 1.22). Theo sau: viền bảng, đường kẻ dropdown / repeater / scan, rãnh progress / password meter |
| `--td-tooltip-bg` / `-border` | `#18181b` / 12 % trắng | `#3a3a3e` / 16 % trắng | Chip đen chìm vào trang đen (1.06:1) → chip xám nổi |
| `--td-shadow-1` / `-2` / `-3` | (giá trị light, gần như vô hình) | 30 % / 40 % / 50 % đen | Bóng thật trên nền tối (bảng, tab, slider, thẻ media) |
| `--td-glass-border` | 10 % trắng | 14 % trắng | Popup / modal / scroll-top tách khỏi nền |
| `--td-glass-shadow` / `-lg` | 12+24 % / 16+36 % | 24+40 % / 32+56 % | như trên |
| `--td-btn-ghost-hover-fg-fallback` (mới) | `#1d4ed8` cứng (2.5:1) | `#93c5fd` | Chỉ trình duyệt không có `color-mix()` |
| `--td-table-check-border` (mới) | `#2c2c30` (luật `.td-table *`) | `#76767c` (= `--td-checkbox-border`) | Ô chọn dòng của `td-table` ≥ 3:1 |

Danh sách máy đọc được (80 token, gồm token dẫn xuất): `test/tokens/golden.json` → `darkDeltas`.

**Đổi giao diện — vòng focus bàn phím (light + dark, owner duyệt):** `--td-focus-ring` từ `0 0 0 3px rgb(37 99 235 / 35%)`
(dark `rgb(96 165 250 / 45%)`) — vòng mờ chỉ ≈ 1.7:1 trên trắng — thành `0 0 0 1px var(--td-color-surface), 0 0 0 3px
var(--td-focus)`: vòng **đặc** 2px sau một khe 1px cùng màu bề mặt, cùng bề dày 3px. Đo thật (gate toàn trang, Tab rồi
Shift+Tab): light ≥ 4.6:1 với nền ngoài / khe (nút, checkbox, switch, tab, phân trang, ô chọn dòng), dark ≥ 5.6:1, cả khi
control có nền đen / accent (khe tách vòng khỏi nền control). Ô nhập / trigger dropdown giữ cách cũ (viền
`--td-field-focus` ≥ 3:1 + quầng nhạt). Chỉ hiện khi focus bằng bàn phím (`:focus-visible`). Muốn vòng cũ:
`:root { --td-focus-ring: 0 0 0 3px rgb(37 99 235 / 35%); }` (và giá trị dark cũ trong `:root[data-td-theme="dark"]`) —
không đạt WCAG 2.4.11 / 1.4.11.

**Site phải làm gì:**

- Không gì bắt buộc. Site đã ghi đè các giá trị dark ở trên (`:root[data-td-theme="dark"] { … }`) thì đối chiếu lại: giá
  trị của site vẫn thắng.
- Site có script `matchMedia('(prefers-color-scheme: dark)')` tự đặt / gỡ `data-td-theme="dark"`: thay bằng
  `<html data-td-theme="auto">` (render từ server) — không JS, không chớp trắng. Rule dark riêng của site cũng cần nhánh
  `@media (prefers-color-scheme: dark) { :root[data-td-theme="auto"] { … } }` (bẫy số 1 trong theming.md).
- Site nền màu (vd. 135 giấy be): dùng [công thức nền giấy](../customization/theming.md#công-thức-135-trang-giấy-be-bảng--menu--ô-nhập-trắng)
  (`--td-color-bg` + `--td-color-surface` + `--td-color-surface-raised` + mực muted ấm) thay cho việc đè từng token
  `--td-glass-solid` / `--td-control-bg`.
- **Sửa lỗi (light + dark):** ô chọn dòng của `td-table` (0.37.0) bị luật `.td-table * { border-color }` vẽ đè viền
  thành `--td-color-border` (`#e4e4e7`, 1.27:1 trên trắng — gần như vô hình). Từ 0.41.0 viền theo token mới
  `--td-table-check-border` = `var(--td-checkbox-border)`, giống mọi ô tick khác của kit (light `#d1d1d6`, viền mềm
  ~1.5:1 theo lựa chọn v0.14.1; dark `#76767c` ≥ 3:1). Site cần WCAG 1.4.11 nghiêm ngặt ở light: map viền mềm sang
  `--td-control-border-strong` ([theming](../customization/theming.md#viền-control-mềm-và-override-chuẩn-wcag-nghiêm-ngặt)).
  Muốn giữ nét cũ: `:root { --td-table-check-border: var(--td-color-border); }`.

## 0.39.0

**Thêm** (opt-in): `<td-table>` event `request-change`, `controlled`, `setState()`, `setFilters()` (bộ lọc ngoài + đồng bộ
URL — [table.md mục 11](../components/table.md#11-bộ-lọc-ngoài--url-request-change-controlled--từ-0390)); ẩn / hiện cột
(`hideable` / `hidden` trong `columns`, `hiddenColumns`, `columns-change`, `column-menu`, `min-visible` — mục 12);
`<td-filter-chips>` (`./filter-chips`) + PHP `td_filter_chips()`; TdMenu `ctx.setDisabled(id, disabled, hint?)` cho mục
checkbox; icon `columns`. Bảng không dùng tính năng mới có markup **giữ nguyên**.

- **Đổi hành vi — `hidden` trong `ColumnDef`.** Trước 0.39 khoá `hidden` của cột không có tác dụng; giờ `hidden: true` ẩn
  cột lúc đầu (thuộc tính `hidden` trên `th` / `td`). Site lỡ để `hidden` trong định nghĩa cột: bỏ khoá đó.
- **Đổi hành vi — thời điểm `onPageChange`** (server mode): trước được gọi ngay trong lúc `page-change` còn nổi bọt; giờ
  gọi khi lượt bấm đổi trang **kết thúc** (sau mọi listener `page-change`, sau `request-change`) — vẫn đồng bộ với cú
  bấm. Đổi trang bằng `setPage()` của chính `td-pagination` bên trong → `onPageChange` chạy ở microtask kế tiếp.
- `getState()` thêm `filters`, `totalItems`, `requestId` (test so sánh **toàn bộ** object `getState()` phải cập nhật).
- Import map tự liệt kê: thêm `filter-chips`. Token mới `--td-filter-chip-*`.

---

## 0.37.0

**Thêm chọn dòng cho `<td-table>`** (opt-in: `selectable` + `row-key` / `rowKey`; xem
[table.md mục 10](../components/table.md#10-chọn-dòng-selectable--rowkey--từ-0370)). Bảng không bật `selectable` có
markup **giữ nguyên**. Thay đổi đáng chú ý:

- **`td-table` là form-associated** (để gửi khoá đã chọn khi có `name`). Không `name` thì không gửi gì, nhưng phần tử
  giờ nằm trong `form.elements` của form chứa nó và nhận `<fieldset disabled>`.
- **`<td-table disabled>`**: trước đây attribute này không có tác dụng; giờ trình duyệt coi bảng là control form bị khoá
  → **mọi cú bấm chuột bên trong bị chặn** (sort, phân trang, nút thao tác; đo ở Chromium / Firefox / WebKit), ô tick bị
  khoá. Site lỡ đặt `disabled` trên bảng: bỏ attribute. Chỉ muốn khoá việc chọn: `rowSelectable = () => false`.
- Nhãn mới trong `TdTable.labels` (`selectRow`, `rowFallback`, `selectAll`, `selectColumn`, `selectedCount`,
  `selectedRow`, `deselected`, `selectLimit`), token mới `--td-table-select-w`, `--td-table-row-selected`,
  `--td-table-card-selected-border`. Event mới `select-change` / `select-limit`.

---

## 0.36.2

**Chuẩn cảm ứng toàn kit** ([ADR 0019](../internal/decisions/0019-touch-standard.md), hướng dẫn
[Cảm ứng](../guides/touch.md)). Không đổi DOM, không đổi API công khai ngoài phần "Thêm" dưới đây.

- **Đổi giao diện — hover chỉ còn trên con trỏ mịn.** Mọi hiệu ứng hover của kit nằm trong
  `@media (hover: hover) and (pointer: fine)`. Thiết bị có con trỏ chính là cảm ứng (điện thoại, iPad — kể cả iPad có
  trackpad) không còn kiểu hover nào; hết "hover dính" sau khi chạm. Site muốn hover trên máy lai: tự thêm luật ở layer
  của site.
- **Đổi giao diện — hình nhấn mới** (`:active` + `[data-td-pressed]`) trên mọi control tương tác: chỉ đổi màu, không chuyển
  động. Site có `:active` riêng: luật không layer của site vẫn thắng (kit ở `@layer td.component`). Đổi màu bằng token
  `--td-color-pressed`, `--td-option-pressed-bg`, `--td-btn-{primary,secondary,success,danger,info,warning}-pressed`,
  `--td-btn-ghost-pressed`, `--td-action-btn-{standard,warning,danger}-pressed-bg`, `--td-action-btn-warning-pressed-fg`,
  `--td-dropzone-bg-pressed` (vùng thả), `--td-toast-{success,error,warning,info}-pressed-bg` (thân toast, chạm = đóng).
  Site đã đổi `--td-btn-{v}-bg` nên đặt cả `-pressed`. Trong DOM có thể thấy thuộc tính `data-td-pressed` trong lúc ngón
  tay đang chạm (đừng dùng nó làm API).
- **Đổi hành vi — tooltip không bật khi chạm** (cả trường hợp focus sinh ra từ cú chạm trên Android / Chromium), khác dwp
  v0.14. Bàn phím, chuột, bút và trình đọc màn hình không đổi. Site đang dựa vào tooltip để hiện nhãn trên điện thoại (nút
  chỉ icon, `td-action-button`): dùng nút có chữ hoặc menu trên điện thoại.
- **Đổi hành vi — ngưỡng kéo theo loại con trỏ** ở `<td-sortable>`, `<td-repeater sortable>`, `<td-media-grid>` sắp xếp:
  chạm 10 px (trước 4), bút 8 px, chuột 4 px như cũ. Chạm nhẹ vẫn là "chạm để nhấc".
- **Đổi hành vi — lớp phủ co theo bàn phím ảo**: khi bàn phím mở, gốc `.td-modal` / `.td-drawer-root` nhận
  `top` / `height` theo vùng nhìn thấy (biến nội bộ `--td-vv-top` / `--td-vv-height` — không phải API) và thân dialog cuộn
  tới ô đang nhập. Con của modal dùng `100%` thay `100dvh`. **Site override `height: 100dvh` / `max-height: …dvh` trên
  `.td-modal__dialog` / panel drawer: đổi thành `100%`** để không bị bàn phím che.
- **Đổi hành vi — lightbox vuốt theo ngón**: ảnh đi theo ngón; chuyển khi kéo qua 1/4 bề rộng hoặc vuốt nhanh (trước:
  50 px khi nhả tay), không thì bật về; một ảnh = dây chun. Reduced motion: không theo ngón, đổi ngay.
- **Thêm**: thuộc tính `enterkeyhint` cho `<td-number-input>` (`enter|done|go|next|previous|search|send`, giá trị khác bị
  bỏ). PHP `td_number_input()` truyền qua `attrs` như trước.

Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.36.2.

---

## 0.36.1

**Đổi giao diện dạng card của `<td-table>`** (mật độ) — không đổi DOM ngoài giá trị `data-card` và class
`td-table__action--icon`; dạng bảng không đổi.

- **Cột đầu thành `lead`**: cột đầu **không khai báo `card`** giờ thành `lead` (ID nhỏ, màu nhạt, trước tiêu đề trên dòng
  đầu) khi một cột khác khai báo `card: 'primary'` — trước đây thành cặp "ID: 1" một dòng. Giữ cũ: `card: 'secondary'`
  trên cột đầu. Bảng không khai báo `card` nào không đổi. CSS / test nhắm `td[data-col="0"][data-card="secondary"]` cần
  sửa.
- **Cặp `secondary` xếp theo nội dung** (cặp ngắn chung dòng, dài chiếm cả dòng), bỏ mốc 480px. Giữ một cặp mỗi dòng:
  `td-table { --td-table-card-pair-min: 100%; }`.
- **Chân card**: thao tác nằm cuối dòng meta; action có `icon` hợp lệ (và nút "Thao tác") **chỉ hiện icon** ở card (tên
  đọc không đổi). Icon không rõ nghĩa → bỏ `icon` để giữ chữ.
- **Thanh sắp xếp một hàng**, cuộn ngang khi nhiều chip.
- **Khoảng cách gọn hơn**: `--td-table-card-gap` `sm` → `xs`, `--td-table-card-px` `md` → `sm`, `--td-table-card-py`
  `sm` → `xs`, ô card 2px (`--td-table-card-cell-py`), tiêu đề primary `line-height` 1.25. Giữ cũ: đặt lại các token đó.

Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.36.1.

---

## 0.36.0

### Màu ngữ nghĩa đặc, badge viền, alert vạch mép, tab, nút thao tác

**Đổi giao diện** — không phải sửa code. Nút / badge ngữ nghĩa từ pastel sang **màu đặc** (`--td-solid-*`, như dcms2);
**warning chữ tối** trên nền vàng hổ phách (vàng + chữ trắng không bao giờ đạt tương phản); badge có nền thêm **viền 1px
+ bóng nhẹ**; badge `--outline` / `--stamp` dùng mực `--td-badge-{v}-ink`; alert giữ nền nhạt nhưng có **vạch 4px màu
đặc ở mép đầu dòng**, icon màu đặc, viền đậm lên một bậc. Tab: nhãn giữ chỗ bề rộng chữ đậm (đổi tab không xê dịch chữ);
phân trang: trang hiện tại không còn rộng hơn khi in đậm. Thêm `<td-action-button>` (`./action-button`) + PHP
`td_action_button()` (import map tự liệt kê; gõ tay thì thêm `"@dazzxq/td-components/action-button"`).

- Token pastel `--td-pastel-*` **vẫn khai báo** (deprecated) nhưng không còn là nền mặc định của component nào. Site đã
  đổi `--td-pastel-*` để chỉnh màu nút / badge: chuyển sang `--td-solid-*` (hoặc `--td-btn-{v}-*` / `--td-badge-{v}-*`).
- Site muốn **giữ giao diện pastel** của 0.21–0.35 (nút + badge; toast xem mục toast của bản này), dán vào CSS không
  layer của site:

```css
:root {
  --td-btn-success-bg: var(--td-pastel-success-bg); --td-btn-success-fg: var(--td-pastel-success-fg); --td-btn-success-border: var(--td-pastel-success-border); --td-btn-success-hover: var(--td-pastel-success-border);
  --td-btn-danger-bg: var(--td-pastel-danger-bg); --td-btn-danger-fg: var(--td-pastel-danger-fg); --td-btn-danger-border: var(--td-pastel-danger-border); --td-btn-danger-hover: var(--td-pastel-danger-border);
  --td-btn-warning-bg: var(--td-pastel-warning-bg); --td-btn-warning-fg: var(--td-pastel-warning-fg); --td-btn-warning-border: var(--td-pastel-warning-border); --td-btn-warning-hover: var(--td-pastel-warning-border);
  --td-btn-info-bg: var(--td-pastel-info-bg); --td-btn-info-fg: var(--td-pastel-info-fg); --td-btn-info-border: var(--td-pastel-info-border); --td-btn-info-hover: var(--td-pastel-info-border);
  --td-badge-success-bg: var(--td-pastel-success-bg); --td-badge-success-fg: var(--td-pastel-success-fg); --td-badge-success-ink: var(--td-pastel-success-fg);
  --td-badge-danger-bg: var(--td-pastel-danger-bg); --td-badge-danger-fg: var(--td-pastel-danger-fg); --td-badge-danger-ink: var(--td-pastel-danger-fg);
  --td-badge-warning-bg: var(--td-pastel-warning-bg); --td-badge-warning-fg: var(--td-pastel-warning-fg); --td-badge-warning-ink: var(--td-pastel-warning-fg);
  --td-badge-info-bg: var(--td-pastel-info-bg); --td-badge-info-fg: var(--td-pastel-info-fg); --td-badge-info-ink: var(--td-pastel-info-fg);
  --td-badge-shadow: none; /* badge không viền: thêm --td-badge-{neutral,accent,success,danger,warning,info}-border: transparent */
  --td-alert-accent-width: 1px; /* alert không vạch: kèm --td-alert-{v}-accent bằng --td-alert-{v}-border */
}
```

- Theme tối (opt-in): nút ngữ nghĩa giờ dùng **cùng màu đặc** như theme sáng (trước: pastel tối trộn sẵn).
- Visual baseline / ảnh chụp so sánh của site có nút / badge / alert ngữ nghĩa sẽ đổi — có chủ đích.

### Toast: 6 vị trí, DOM root > lane > chồng

**Phá vỡ (DOM)** + **đổi giao diện** ([ADR 0016](../internal/decisions/0016-toast-placement.md),
[Toast](../components/toast.md)). API cũ chạy y nguyên (`show(msg, type, 3000)`); thêm `TdToast.configure({ placement })`
và tham số thứ ba `{ duration?, placement? }`.

- `#td-toast-container` giữ id nhưng giờ là **portal root** `div.td-toast-root` (không còn class `.td-toasts`). Toast nằm
  trong root > `div.td-toast-lane[data-edge]` > `div.td-toasts[data-placement]` > `div.td-toast` — **không còn là con trực
  tiếp** của `#td-toast-container`. CSS / script site viết `#td-toast-container > .td-toast` hoặc
  `#td-toast-container.td-toasts` phải đổi sang `.td-toasts > .td-toast` / `#td-toast-container .td-toast`. CSS nhắm
  `.td-toasts` vẫn trúng (nay là từng chồng).
- **Mới nhất sát mép**: chồng `top-*` chèn toast mới **lên đầu**, `bottom-*` xuống cuối. Site mặc định (trên-phải) thấy
  toast mới nằm **trên cùng** (trước: dưới cùng).
- Site đã đổi 6 token neo cũ (`--td-toast-top/-bottom/-inline-start/-inline-end/-shift/-align`): toast không có
  `placement` vào **chồng legacy** (`div.td-toasts` không `data-placement`, con trực tiếp của root) — vị trí và thứ tự
  `append` y như 0.35, không phải sửa gì. Muốn chuyển: `TdToast.configure({ placement: 'bottom-center' })` rồi bỏ token.
- Màn thấp (≤ 500px): chỉ 2 toast mới nhất **toàn cục** hiện (đánh dấu `[data-td-toast-older]`), thay luật
  `:nth-last-child` cũ. `MAX_VISIBLE`, FIFO, `clear()`, pause vẫn toàn cục.

### OTP: ô giữ hình, `--td-otp-cell-h` hết tác dụng ở chế độ element

**Đổi giao diện** (sửa lỗi ô bị ép thành viên thuốc trên điện thoại). Ở chế độ element / JS, mỗi ô giữ tỉ lệ
`aspect-ratio: var(--td-otp-cell-aspect)` (mặc định `44 / 52` = tỉ lệ cũ) và co theo bề rộng — **`--td-otp-cell-h` không
còn tác dụng** ở chế độ này (chỉ còn cho ô native PHP không JS). Site đã đổi `--td-otp-cell-h` để ô cao / thấp hơn: đặt
`--td-otp-cell-aspect` (ví dụ `--td-otp-cell-aspect: 44 / 60`). Thêm `length` (1–10) / `charset` / `case` (mặc định giữ
6 số); SSR `otp-input@1` mở rộng thêm, markup 6 số giữ từng byte — PHP và JS phải **cùng phiên bản** khi dùng `length`
≠ 6. [OTP input](../components/otp-input.md).

### Ô tick chung (`.td-check`)

**Đổi giao diện** + **đổi DOM bên trong** ([ADR 0017](../internal/decisions/0017-shared-check-mark.md), [bảng
class](class-map.md#ô-tick-chung-và-media-picker-0360)). Mọi "tick để chọn" giờ là đúng hình `td-checkbox` (hộp tròn, ✓ trên
`--td-checkbox-color`): tick của media grid / media picker, ô check của `td-tree` chọn nhiều, mục của `td-chip-input`
`selection-only`, mục checkbox của `TdMenu`. Đổi màu / bo / viền bằng `--td-checkbox-color` / `--td-checkbox-border` /
`--td-checkbox-radius`.

- `--td-media-grid-tick-{bg,border,ring,on-bg,on-fg}` **chỉ còn style tick do site in** (`[data-td-media-tick]`); tick do
  kit tạo không đọc chúng. `--td-media-grid-selected-ring` mặc định `var(--td-checkbox-color)`.
- `--td-media-picker-card-checked` **không còn tô tick** (vẫn là màu viền card đã chọn).
- `--td-tree-check-radius` **deprecated, không tác dụng** (alias `--td-checkbox-radius`) — ô check của tree **tròn** theo
  mặc định (trước: vuông 4px). Muốn vuông: `--td-checkbox-radius: 4px` (đổi cả checkbox và mọi ô tick).
- Mục checkbox của menu và mục của multiselect **luôn hiện hộp** (rỗng khi chưa chọn); trước chỉ hiện ✓ khi chọn. Radio
  (menu `menuitemradio`, dropdown chọn một) giữ ✓.
- CSS site nhắm `.td-tree__check-on` / `.td-tree__check-mixed` / `svg` trực tiếp trong `.td-media-grid__tick` không còn
  trúng.
- `td-checkbox` thêm `indeterminate` (additive). Không ảnh hưởng FormData / SSR `checkbox@1`.

### Media picker dưới 1024px, modal gọn dưới 720px, phím tắt lưới

**Đổi giao diện** + **đổi hành vi** (nhỏ):

- **Picker < 1024px**: facet rời toolbar vào **sheet "Bộ lọc"** (nút + badge số bộ lọc đang áp); "Tải lên" chỉ icon.
  **< 720px**: toolbar một hàng (nút "Bộ lọc" chỉ icon), phân trang **dưới lưới**, footer một hàng (chữ "Đã chọn …" chỉ
  cho trình đọc màn hình, "Bỏ chọn tất cả" thành nút icon ×), dialog tải lên là bottom sheet cao theo nội dung và **bỏ
  footer "Đóng"** (× ở header). Test / CSS site nhắm vị trí `.td-media-picker__pager` trong toolbar ở màn hẹp, hoặc nút
  `.td-media-picker-upload__footer` dưới 720px, phải cập nhật. Nhãn mới `filters*` trong `TdMediaPicker.labels`.
- **Picker ≥ 720px tự xem trước** asset đầu sau mỗi lần tải danh sách (không chọn — "Chèn" vẫn khoá). Test dựa vào panel
  chi tiết rỗng lúc mở phải cập nhật.
- **Modal < 720px**: header ≤ 56px (padding nhỏ, bỏ đường kẻ dưới), footer ≤ 64px; modal thường xếp nút footer một hàng
  chia đều bề rộng. Áp cho mọi modal, kể cả `fullViewport` và hộp thoại lồng của picker. Từ 720px không đổi.
- **`td-media-grid` mặc định**: Ctrl+click (Cmd trên macOS) trên phần tử mở là `<button>` giờ **bắt đầu chọn** (trước:
  `activate`); phần tử mở `<a href>` giữ "mở tab mới".
- **`td-cropper`**: lăn trackpad được giảm chấn (một bước ≤ 10 % mỗi frame); nấc chuột không đổi.

---

### Hàng option trong popup kiểu dcms2 (đổi hình)

Dropdown, multi-select, popup tree-select và menu: hàng tràn mép (popup không còn lề ngang, hàng không bo, không viền
khung khi active); mục đã chọn của danh sách chọn một in đậm (600) + ✓ ở cuối; hàng active bằng bàn phím có vạch nhấn đầu
dòng (`--td-option-active-bar`) thay vòng viền trong (`--td-dropdown-option-active-line` hết tác dụng; menu: vạch thay vòng
focus 2px). Token chung mới `--td-option-*` (xem theming). Muốn bo góc lại: `.td-dropdown__option { border-radius: 6px; }`
(CSS site, không layer).

### Lightbox trên điện thoại, drawer, datetime sheet

**Đổi giao diện** + **đổi hành vi** (nhỏ), xem [Lightbox](../components/lightbox.md):

- **Lightbox < 480px**: toolbar chỉ giữ tải xuống, **một** nút riêng có `pinned: true`, nút **"Thêm"** (fullscreen + các
  nút riêng còn lại) và đóng. Nút trước / sau **và** bộ đếm chuyển xuống **thanh đáy** "‹ 3 / 12 ›" (không bao giờ vào
  "Thêm"). Màn cảm ứng từ 480px và màn ngang thấp: trước / sau là đĩa 48px hai bên ảnh (trước: nằm trên toolbar). Nút
  riêng tự mở popup neo vào `button` nên đặt `pinned: true`. CSS / test site nhắm `.td-lightbox__toolbar > [data-action="prev"]`
  trên màn hẹp hoặc cảm ứng phải cập nhật.
- **Lightbox — cử chỉ**: RTL đảo chiều vuốt ngang; vuốt bắt đầu trong 24px sát mép trái / phải để trình duyệt xử lý (vuốt
  quay lại); sheet panel chỉ kéo được từ thanh nắm.
- **Lightbox — menu**: khi menu tải về / "Thêm" đang mở, **bấm chuột** ra ngoài chỉ đóng menu (không zoom / kéo / đóng
  lightbox), focus về nút mở; bấm nút mở popup khác vẫn mở ngay. Cảm ứng và menu của các component khác không đổi.
- **Lightbox — mở lại** không còn loé ảnh của lần xem trước.
- **Drawer < 480px** không còn phủ kín màn: chừa một dải trang bên cạnh.
- **Datetime < 720px**: sheet gọn, bánh xe 3 dòng, bỏ nhãn trùng.

## 0.35.0

**Đổi hành vi (nhỏ)** — cắt ảnh chỉ bằng toạ độ ([ADR 0015](../internal/decisions/0015-td-cropper.md),
[ADR 0013 › Bổ sung v0.35](../internal/decisions/0013-media-picker-boundary.md#bổ-sung-v035)). Không có thay đổi phá vỡ
API: mọi phần thêm đều opt-in, FormData mặc định giữ nguyên từng byte.

- **Picker: `crop.enabled` giờ có tác dụng.** 0.32–0.34 option này chỉ cảnh báo console và trả `usage.crop = null`. Từ
  0.35, `TdMediaPicker.open({ crop: { enabled: true, … } })` (hoặc `configureDefaults({ crop })`) + chọn **một ảnh** ⇒
  "Chèn" mở **bước cắt** trước khi kết thúc, `usage.crop` / `usage.focalPoint` có giá trị thật (toàn ảnh vẫn `null`).
  Site đã bật sẵn `crop` "cho tương lai" mà chưa muốn bước cắt → bỏ option đó. Cảnh báo "crop UI ships in v0.35" không
  còn; thay bằng cảnh báo một lần khi chọn nhiều + crop (bỏ crop) hoặc `aspectRatio` sai / ngoài **[0.01, 100]** (bị từ
  chối, cắt tự do) — cùng khoảng cho field `crop-ratio`, PHP `crop_ratio`, `<td-cropper aspect-ratio>`.
- **Adapter khi bật crop:** `urls.preview` phải là **ảnh nguyên, không cắt sẵn** (bất kỳ cỡ). Preview lệch tỉ lệ so với
  `width/height` > 1 % ⇒ bước cắt báo lỗi, "Chèn" khoá. Adapter trả thumbnail vuông làm `preview` phải đổi trước khi bật
  crop.
- **Media field không `croppable`: không đổi** — "Chèn" vẫn kết thúc ngay, cùng ảnh không event, FormData ba mục như cũ.
  Field luôn gửi `crop: { enabled: false }` cho picker, nên `configureDefaults({ crop: { enabled: true } })` **không** làm
  field cũ hiện bước cắt.
- **Getter `field.selection`**: `usage.focalPoint` trả **giá trị thật** khi field có `focal-point` (0.34 luôn `null`).
  Field không `focal-point` vẫn `null`.
- `name[focal]` chỉ xuất hiện khi bật `focal-point` — server cũ không đổi gì vẫn nhận đúng ba mục.
- Import map PHP tự liệt kê từ `package.json` (thêm `cropper`); site gõ import map tay thêm
  `"@dazzxq/td-components/cropper"` nếu dùng.

Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.35.0.

---

## 0.34.0

**Đổi giao diện + đổi DOM (nhỏ)** — responsive toàn kit:

- `<td-table>` **tự thành card khi bảng < 720px**. Muốn giữ bảng cuộn ngang như cũ: `layout="table"`.
- `textContent` của một ô bảng giờ **bắt đầu bằng nhãn cột ẩn** (dùng cho card / trình đọc màn hình) — code đọc chữ ô
  bằng `textContent` cần đọc phần giá trị (xem `docs/components/table.md`).
- Modal thường thành bottom sheet khi < 720px (trước ≤ 640); drawer toàn màn hình < 480; lightbox đổi mốc 767/900 → 720/1024.
- `td-media-grid` justified: site chỉ đè `--td-media-grid-row-ratio` giờ chỉ ảnh hưởng lưới ≥ 1024px; lưới hẹp dùng
  `--td-media-grid-row-ratio-md` / `-sm`.
- Dropdown / tree-select không tự focus ô tìm trên thiết bị cảm ứng.

Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.34.0.

---

## 0.33.0

**Đổi giao diện + đổi văn bản — không breaking API.** Hợp đồng adapter chỉ thêm phần tuỳ chọn (`uploadFromUrl`,
`capabilities.uploadFromUrl` / `copyLink`, `pagination: 'pages'` + `MediaListRequest.page`, `upload.acceptLabel`, xem
[ADR 0013 › Bổ sung v0.33](../internal/decisions/0013-media-picker-boundary.md#bổ-sung-v033)); adapter v0.32 chạy y nguyên.
Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.33.0.

**`td-media-picker` — chữ hiển thị đổi.** Test so đúng chữ phải cập nhật. Site đã ghi đè nhãn (`TdMediaPicker.labels` / `messages`) cần soát ba điểm:

- Tiêu đề giờ lấy theo `selection.kinds` từ các key mới `titleImage` / `titleVideo` / `titleFile`; `title` chỉ còn dùng khi `kinds` khác ba trường hợp đó. Site muốn một tiêu đề cố định thì truyền `title` cho `open()` hoặc ghi đè cả bốn key.
- Nút xác nhận có hai key: `confirm` ("Chèn", chưa chọn / chế độ đơn) và `confirmCount` ("Chèn ({n})", chế độ nhiều).
- Các key bị bỏ cùng UI cũ: `filters`, `filtersCount`, `loadMore`, `loadedMore`, `count`, `emptyFiltered`, `edit`, `cancelEdit`, `deselect` (ghi đè chúng giờ không có tác dụng, không lỗi).

| Chỗ | Trước (0.32) | Sau (0.33) |
|---|---|---|
| Nút xác nhận (`confirm`) | "Chọn ({n})" | "Chèn" / "Chèn ({n})" |
| Nút huỷ ở footer (`cancel`) | "Huỷ" | "Đóng" |
| Tiêu đề mặc định (`title`) | "Thư viện media" | theo `selection.kinds`: `['image']` "Chọn ảnh", `['video']` "Chọn video", `['file']` "Chọn tài liệu", khác "Chọn media" (`title` của `open()` vẫn thắng) |

**`td-media-picker` — hành vi / giao diện đổi:**

- **Full viewport ở mọi kích thước** (`.td-modal--viewport`), bỏ bottom sheet; breakpoint 768px (trước 640px).
- **`pageSize` mặc định 40 → 30.** Muốn giữ 40 thì truyền `pageSize: 40` cho `open()` / `configureDefaults`.
- **"Tải thêm" → phân trang**: mỗi trang **thay** nội dung lưới (lựa chọn vẫn giữ qua các trang). Mặc định `‹` / `›`
  theo cursor; adapter trả `total` thì có thể bật `pagination: 'pages'` để có `td-pagination` số trang.
- **Bỏ khay thumb 40px** ở footer; giữ số đếm "Đã chọn {n}/{max}" + "Bỏ chọn tất cả".
- Không tự chọn mục đầu (như 0.32); click card ở chế độ nhiều = **xem chi tiết**, bật / tắt chọn qua tick (góc trên-phải),
  Space hoặc Ctrl/Cmd+click. Form chi tiết luôn mở inline (bỏ nút "Sửa thông tin"). Tải lên chuyển sang dialog lồng.
- Bỏ nút "Bộ lọc (n)" trên màn hẹp: facet hiện inline. Toolbar một hàng từ 768px (facet nhiều thì cuộn ngang trong
  hàng), chỉ xuống dòng dưới 768px.
- CSS / test site nhắm vào DOM bên trong picker (`.td-media-picker__*`) phải kiểm lại: vỏ, toolbar, card và footer đã dựng
  lại bằng component kit (`td-button`, `td-input-field`, `td-dropdown`, …); DOM mới xem
  [media-picker.md](../components/media-picker.md).

**`td-media-grid` — đổi giao diện ô:**

- **Ô đã chọn**: bỏ phép thu 0.88 (`--td-media-grid-selected-scale` mặc định thành `1`) và bỏ nền; đánh dấu bằng **vòng
  inset** vẽ trên opener (`--td-media-grid-selected-ring`). Muốn hiệu ứng thu nhỏ kiểu cũ: `:root
  { --td-media-grid-selected-scale: 0.88; }`.
- **Grid sở hữu kích thước ảnh**: `<img>` / `<video>` đầu tiên trong opener được đặt `width` / `height: 100%`,
  `max-width: none`, `object-fit` bằng CSSOM inline `!important`. Hệ quả: **CSS của site đặt lên `img` trong grid
  (`width`, `height`, `object-fit`) không còn tác dụng**, kể cả `!important`. Muốn khác thì dùng token:
  `--td-media-grid-fit` (`cover` / `contain`), `--td-media-grid-ratio` (tỉ lệ khung ô; mặc định `auto`, chiều cao ô theo
  ảnh như trước). Giá trị inline gốc của site được khôi phục khi item rời grid.
- Thêm (tuỳ chọn): `layout="justified"`, `select-mode="tick"`, `--td-media-grid-tick-inline`. Không đặt thì bố cục lưới
  giữ như cũ.

Xem [theming.md › Token riêng của từng component](../customization/theming.md#token-riêng-của-từng-component) cho danh sách
token mới.

---

## 0.32.0

**Không có thay đổi phá vỡ** — chỉ bổ sung. Site tự viết import map: thêm `@dazzxq/td-components/media-picker`,
`/media-field`. Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.32.0.

---

## 0.31.0

**Đổi văn bản (nhỏ)** — `TdRepeater.labels.moved` giờ là "Đã chuyển tới vị trí {n} trên {count}." (trước "{n} / {count}");
site tự đặt `TdRepeater.labels.moved` không bị ảnh hưởng. Còn lại chỉ bổ sung. Import map tự viết: thêm
`@dazzxq/td-components/sortable`, `/masked-value`. Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.31.0.

---

## 0.30.0

**Không có thay đổi phá vỡ** — chỉ bổ sung. Site tự viết import map: thêm `@dazzxq/td-components/repeater`,
`/number-input`. Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.30.0.

---

## 0.29.0

**Không có thay đổi phá vỡ** — chỉ bổ sung. Site tự viết import map: thêm `@dazzxq/td-components/tree`,
`/tree-select`. Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.29.0.

---

## 0.28.0

**Không có thay đổi phá vỡ** — chỉ bổ sung (chip-input không đặt `selection-only` chạy như cũ). Nguồn:
[CHANGELOG.md](../../CHANGELOG.md) 0.28.0.

---

## 0.27.0

**Không có thay đổi phá vỡ** — chỉ bổ sung. Site tự viết import map: thêm `@dazzxq/td-components/otp-input`,
`/drawer`, `/copy`. Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.27.0.

---

## 0.26.1

**Không có thay đổi phá vỡ** — sửa lỗi. Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.26.1.

---

## 0.26.0

**Không phá vỡ với site chưa bật element mode.** Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.26.0.

Site **đã bật** `Td::configure(…, ['ssr_elements' => true])` từ 0.25: từ 0.26 cờ này áp thêm cho `td_field`, `td_toggle`,
`td_checkbox`, `td_dropdown` (`<select>` thêm class `td-dropdown__native`, có hộp giống nút chọn). Kiểm:

1. `id` truyền vào là id của **ô native** (như trước); host nhận `{id}-host`. CSS / JS bám `#id` vẫn trúng ô.
2. `td_toggle` / `td_checkbox`: `class` / `attrs` lên **host** `<td-toggle>` / `<td-checkbox>` (trước: lên `<label>`);
   `input_attrs` vẫn xuống ô. `aria-label` qua `input_attrs` bị bỏ — dùng option `aria_label`.
3. Không muốn cho helper nào: truyền `['element' => false]` cho lần gọi đó.

---

## 0.25.0

**Không có thay đổi phá vỡ** — element mode là **opt-in**, mặc định `td_button()` / `td_link()` vẫn in nút native như cũ.
Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.25.0.

Khi **bật** element mode (`['element' => true]` hoặc `Td::configure(…, ['ssr_elements' => true])`):

1. `id` và `class` truyền vào helper nằm trên **host** `<td-button>`, không còn trên `<button>` bên trong. CSS / JS site
   nhắm `#id` / `.class` vào nút bên trong → đổi sang `#id > .td-btn` hoặc dùng API component.
2. `attrs` vẫn đi xuống nút native; `aria-*` trạng thái + `aria-label` được nâng lên host (JS chuyển xuống như 0.19).
3. Nên thêm `Td::modulePreloads([...])` sau import map để JS nạp sớm hơn (không bắt buộc).

---

## 0.24.0

**Đổi giao diện nhỏ ở lightbox + bổ sung.** Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.24.0.

1. Trên máy dùng chuột, nút **trước / sau** của lightbox chuyển từ toolbar ra **hai bên** ảnh (cùng phần tử, cùng
   `data-action`). CSS / test của site định vị hoặc đếm nút trong `.td-lightbox__toolbar` cần cập nhật; trên cảm ứng
   nút vẫn ở toolbar.
2. Bấm nền để đóng chỉ khi cú bấm bắt đầu trên nền.
3. Filmstrip mặc định **tắt** — bật bằng `filmstrip: true` hoặc `'auto'`.
4. `item.src` / `poster` / `thumb` trong `ctx.item`, `detail` sự kiện, `href` tải xuống giờ là **URL tuyệt đối** (đã
   chuẩn hoá theo `document.baseURI`). Code site so sánh với chuỗi tương đối cần so theo URL tuyệt đối.
5. Tải sẵn ảnh kề mặc định chỉ cho ảnh **cùng origin**; ảnh trên CDN tin cậy khác origin: `preload: 'all'`.

---

## 0.23.0

**Không có thay đổi phá vỡ** — chỉ thêm component `<td-media-grid>`. Site dùng import map tự liệt kê subpath: thêm
`@dazzxq/td-components/media-grid`. Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.23.0.

---

## 0.22.1

**Không có thay đổi phá vỡ.** Modal mở / đóng theo kiểu dcms; khoá cuộn không còn làm trang nhảy ngang. Site đã đặt
`--td-modal-ease` riêng: từ bản này token đó là đường cong **fade** (đường cong phóng là `--td-modal-enter-ease`);
`--td-modal-enter-dur` là thời lượng phóng (300ms). Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.22.1.

---

## 0.22.0

**Bổ sung + đổi DOM nhỏ của menu dropdown.** Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.22.0.

1. Vùng cuộn của menu là `.td-dropdown__scroller` (trong `.td-dropdown__options`, vẫn là `role="listbox"`). CSS / code
   site từng đặt `max-height` / `overflow` / `scrollTop` trên `.td-dropdown__options` → chuyển sang
   `.td-dropdown__scroller`.
2. `.td-dropdown__empty` ("Không có kết quả") giờ đứng **trước** listbox.
3. Site đang tự làm option giả kiểu `value="__new__"` để thêm mục: chuyển sang `create-label` + sự kiện `create`
   (xem [dropdown](../components/dropdown.md)).

---

## 0.21.1

**Không có thay đổi phá vỡ** — sửa lỗi khi kết hợp component. Popup giờ tự đóng khi trigger bị cuộn khuất / ẩn / gỡ
hoặc bị modal mở sau phủ; lightbox mở từ modal nằm trên. Code site nào dựa vào việc popup **còn mở** trong các tình huống
đó (hiếm) cần mở lại sau. `TdMenu` `onClose(reason)` có thể nhận `'covered'`. Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.21.1.

---

## 0.21.0

**Đổi giao diện + đổi DOM toast.** Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.21.0.

1. **Nút primary mặc định đen.** Site muốn primary theo màu thương hiệu:

   ```css
   :root {
     --td-btn-primary-bg: var(--td-accent-fill);
     --td-btn-primary-fg: var(--td-accent-contrast);
     --td-btn-primary-hover: color-mix(in srgb, var(--td-accent-fill) 92%, #000);
   }
   ```

   Đặt đủ ba token (chữ `-fg` mặc định ở dark là `#18181b`, phải map về `--td-accent-contrast`). Đổi `--td-accent` một
   mình **không** còn đổi nút primary hay `.td-glass-tint`.

2. **Nút success / danger / warning / info thành pastel** (chữ đậm trên nền nhạt). Site đặt `--td-btn-{v}-bg` riêng thì
   đặt kèm `--td-btn-{v}-hover` (và `-fg` nếu nền đậm, ví dụ `#fff`). Alias `-tint` của 0.20 vẫn chạy (hover tự đậm hơn),
   nhưng chữ giờ là màu đậm pastel → nền tint đậm thì đặt thêm `--td-btn-{v}-fg: #fff`.
3. **Tooltip đen.** Muốn chip sáng như 0.20: `--td-tooltip-bg` / `--td-tooltip-fg`.
4. **Toast đổi DOM:** không còn `.td-toast__icon`, không còn class `td-glass-surface` trên toast; có
   `.td-sr-only` tiền tố loại. Code / test / CSS của site bám vào icon toast phải bỏ. Màu toast:
   `--td-toast-{type}-bg/-fg/-border` (pastel đặc, không blur). `--td-toast-error-border` có tác dụng trở lại;
   `--td-toast-fg`, `-close-fg`, `-glass-bg`, `--td-toast-{type}-icon` hết tác dụng.
5. **Modal có animation** (260ms vào). Test E2E của site chờ modal mở cần chờ `data-state="open"` hoặc tắt bằng
   `--td-modal-enter-from: none` + `--td-modal-enter-dur: 0s` (từ 0.22.1 thêm `--td-modal-fade-dur: 0s`,
   `--td-modal-scrim-dur: 0s`; enter giờ là 300ms).
6. **Viền focus ô nhập nhạt hơn.** Site cần viền focus đậm như cũ: `--td-field-focus: var(--td-focus)`,
   `--td-field-focus-ring: var(--td-focus-ring)`.

---

## 0.20.0

**Đổi giao diện lớn — không đổi markup / class / API JS.** Liquid Glass giả bằng CSS được thay bằng "Minimal surfaces":
nền + một viền mảnh + một shadow mềm; chỉ popup nhỏ (menu, dropdown, gợi ý chip-input, hovercard, toast) còn blur 12px
trên nền 94%. Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.20.0.

1. **Nút đặc.** Không còn kính, bóng loáng, phát sáng, lún khi bấm. Màu primary vẫn theo `--td-accent`.
2. **Modal, tooltip, loading, scroll-top đặc** (không blur). Site từng tự ép modal / menu đặc (ví dụ override
   `--td-glass-bg-strong` thành gần 100%) có thể bỏ override cho modal; popup nhỏ muốn đặc hẳn thì đặt
   `--td-glass-bg-strong: var(--td-glass-solid)`.
3. **Toast trung tính**, màu trạng thái ở icon. `--td-toast-*-wash` / `--td-toast-error-border` hết tác dụng.
4. **Token kính cũ hết tác dụng** (vẫn khai báo, không lỗi). Đổi sang:

   | Token cũ | Thay bằng |
   |---|---|
   | `--td-btn-{primary,success,danger,info,warning}-tint` | `--td-btn-{…}-bg` (tên cũ vẫn chạy như alias tới bản lớn sau) |
   | `--td-btn-secondary-glass` | `--td-btn-secondary-bg` |
   | `--td-btn-secondary-edge` | `--td-btn-secondary-border` |
   | `--td-btn-*-alpha`, `--td-btn-*-film`, `--td-btn-sheen` | — (nút đặc) |
   | `--td-glass-edge`, `-side-edge`, `-bottom`, `-outline`, `-sheen`, `-glow*`, `-*-scale`, `-dim*`, `-tint*`, `-clear-edge`, `-clear-glyph-shadow` | — (bỏ hiệu ứng) |

5. **Site cần viền 3:1 cho nút secondary** (từng map `--td-control-border-soft` sang viền đậm): giờ đặt thêm
   `--td-btn-secondary-border`.
6. **Nút `color` tuỳ biến** hover luôn **đậm** hơn (trước có lúc sáng hơn khi chữ tối) — màu rất sáng + chữ tối thì
   kiểm lại tương phản khi hover.

---

## 0.19.0

**Đổi hành vi nhỏ + đổi giao diện nhỏ + bổ sung** (ARIA của nút, lý do lỗi / trạng thái chờ của dropzone, `accept-label`,
token font badge, `setDBValue('')`). Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.19.0.

1. **`<td-datetime-picker>` mặc định mở tại hôm nay** (kẹp vào `[min, max]`). 0.18.0 mở tại `min` khi năm của `min`
   trước 2000. Site cần mở ở đầu khoảng thì thêm `open-at="min"`:

   ```html
   <!-- trước (0.18.0): tự mở năm 1950 -->
   <td-datetime-picker min="1950-01-01"></td-datetime-picker>
   <!-- sau (0.19.0): giữ hành vi cũ -->
   <td-datetime-picker min="1950-01-01" open-at="min"></td-datetime-picker>
   ```

2. **`setDBValue('' | null | undefined)` giờ xoá giá trị** (trước bị bỏ qua). Code nào gọi `setDBValue('')` để "không
   làm gì" thì bỏ lời gọi đó.
3. **Badge `stamp` dùng font mono** (đổi giao diện, dấu hẹp hơn). Giữ sans:
   `:root { --td-badge-stamp-font-family: var(--td-font-sans); }`. Ghi đè màu `--td-badge-*-fg` / `-bg` → site tự kiểm
   tương phản.
4. **`<td-button>` chuyển `aria-pressed` / `aria-expanded` / `aria-haspopup` / `aria-controls` xuống control bên
   trong.** Site từng tự đặt các attribute này lên `querySelector('button')` bên trong thì bỏ code đó, đặt trên
   `<td-button>`.
5. **`<td-dropzone>` hiện `err.message` khi hook `upload` reject** — message phải an toàn để người dùng đọc (không lộ
   stack / chi tiết nội bộ). Không muốn hiện: reject với giá trị không có `message` chuỗi (ví dụ `reject()` hoặc `reject('lỗi')`) → nhãn chung. File chưa có tiến độ không còn
   `aria-valuenow="0"`.

---

## 0.18.0

**Đổi hành vi nhỏ + bổ sung** (progress, dropzone, alert, badge, chế độ ngày/tháng/năm, type month/datetime-local/time,
submitter name/value). Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.18.0.

1. **PHP `td_dropdown` `searchable`**: chuỗi `'false'` / `'0'` / `'off'` / `'no'` / `''` giờ **tắt** tìm kiếm (trước là
   bật do PHP coi chuỗi khác rỗng là true). Không truyền / `null` vẫn tự động (> 8 mục).
2. **`hasIcon()` / `tdIcon()` hiểu alias**: `hasIcon('pen')`, `hasIcon('external-link')`… giờ trả `true`. Code kiểu
   `if (!hasIcon(x)) registerIcons({ [x]: … })` với tên trùng alias sẽ không đăng ký nữa (icon đích được dùng); icon
   site đã đăng ký trùng tên alias vẫn thắng alias.
3. **`<td-button>` có `name` / `value`**: giờ được chuyển xuống `<button>` bên trong → nút submit gửi cặp `name=value`.
   Site từng đặt `name` trên `<td-button>` mà không muốn gửi thì gỡ attribute.
4. **`<td-datetime-picker>`**: attribute `value` / `setValue()` nhận thêm ISO (`2026-06-15T10:30`), trước bị `badInput`.
   Mode mặc định `datetime` và giá trị form `yyyy-mm-ddThh:mm:00` **không đổi**.
5. **`php/td.php`** chạy được trên PHP 8.0 (trước ghi ≥ 8.1).

Site phải sửa: chỉ khi dựa vào các hành vi cũ ở mục 1–4.

---

## 0.17.0

**Đổi hành vi nhỏ + nhiều bổ sung** (adapter PHP chính thức, ghost/link button, password meter, scroll-top…). Nguồn:
[CHANGELOG.md](../../CHANGELOG.md) 0.17.0.

1. **`td-dropdown.value` trả giá trị đang chọn** (giống `td-input-field.value` từ 0.16.0); gán `.value` = `setValue()`.
   Code đọc `.value` để lấy giá trị ban đầu phải đọc `getAttribute('value')`.
2. **`<td-dropdown>` chứa `<select>` con giờ được nâng cấp:** kit đọc các `<option>` thành `options`, lấy `name` /
   `required` / `disabled` từ select, rồi **gỡ** select (component submit thay). Trước 0.17.0 select con bị bỏ qua. Site
   từng tự đặt `<select>` bên trong làm fallback và tự gán `options` bằng JS: `options` gán bằng JS trước khi gắn vẫn
   thắng; nếu không muốn nâng cấp, đưa select ra ngoài host. `<select multiple>` không được nâng cấp (giữ native).
3. **Site đã tự viết adapter PHP** (ví dụ `135/src/Ui/*`): thay bằng `php/td.php` của kit — tên hàm và option tương
   thích; xem [Adapter PHP](../guides/php-adapter.md) mục chuyển từ adapter riêng. Khác biệt: `td_link` in `a.td-btn`
   dạng ghost (giữ kiểu cũ bằng `'class' => '…'`), `td_toggle` không có `value` mặc định (gửi `on`).

Site phải sửa: chỉ khi dựa vào các hành vi cũ ở mục 1–3.

---

## 0.16.0

**Đổi hành vi** (không đổi tên API nào). Nguồn: [CHANGELOG.md](../../CHANGELOG.md) 0.16.0.

1. **`td-input-field.value` trả giá trị đang nhập.** Trước đây trả attribute `value` ban đầu (chỉ `getValue()` đúng).
   Code nào dựa vào `.value` = giá trị ban đầu phải đọc `getAttribute('value')`.

   ```js
   // trước (sai nhưng có người dựa vào): field.value === giá trị server render
   const initial = field.getAttribute('value'); // sau: đọc attribute nếu cần giá trị ban đầu
   const current = field.value;                // = field.getValue()
   ```

2. **`td-slider`**: `required` bị bỏ (range không bao giờ "trống"); `setValue(7)` với `step="5"` → `5` (snap như
   `<input type=range>`); không có `value` → giá trị là `min` (trước là `0` và báo lỗi underflow khi `min > 0`).
3. **`td-dropdown`**:
   - Gán lại `options` **giữ** lựa chọn hiện tại nếu giá trị còn trong danh sách mới; nếu không còn thì **bỏ**
     (trước: kéo về attribute `value`, hoặc — với `updateData()` — giữ và vẫn submit giá trị không còn tồn tại).
   - Có cả `onSelect` và `onChange` → **cả hai** chạy (`onSelect` trước). Trước đây `onChange` chặn `onSelect`; nếu
     bạn đặt cả hai mà chỉ muốn một, gỡ cái kia.
4. **`TdModal.confirm`**: `onConfirm` đồng bộ trả `false` hoặc throw → hộp thoại **giữ nguyên** (như `actions`).
   Trước đây vẫn đóng và resolve `true`.
5. **`TdDateTime.toAbsolute`**: chỉ thay cụm chữ **toàn token** (`DD/MM/YYYY`, `YYYYMMDD`…), không thay trong từ
   (`'Ngay DD thang MM'` giữ "Ngay", "thang"); `[…]` in nguyên văn. Timestamp `0` giờ là 01/01/1970 (trước: chuỗi rỗng).
   `toRelative` tương lai: `Trong N phút|giờ|ngày|tháng|năm` (dưới 1 phút vẫn `Vừa xong`).
6. **Token mặc định lên `:root`**: `--td-lb-*`, `--td-checkbox-box`, kích thước switch mặc định, `--td-spinner-size`,
   `--td-empty-state-pad/-gap`, `--td-pagination-item-size`. Override `:root` của site trước đây **không** ăn, giờ ăn —
   nếu site từng để sẵn các override này (vô tác dụng), kiểm tra lại hình. Trên màn cảm ứng, override
   `--td-pagination-item-size` / `--td-lb-btn` giờ thắng mức 44px kit ép trước đây.
7. **Dark theme**: nút primary + trang active theo `--td-accent` (qua `--td-accent-fill`). Site dark đã đổi
   `--td-accent` sẽ thấy nút primary đổi màu theo; muốn giữ #2563eb: `:root[data-td-theme="dark"] { --td-accent-fill: #2563eb; }`.

Bổ sung (không phá vỡ): nhãn/thông báo dịch được (`messages`/`labels` của input-field, slider, checkbox, toggle,
dropdown, pagination, empty-state, toast, loading, modal), `TdToast` handle `close()` + `TdToast.clear()`,
`TdLoading.wrap(fn, { message, maxDuration })`, `pattern`/`minlength` cho input-field, property gán sớm không mất.

Đóng gói: package không còn chứa test/stories; `engines.node >= 20`; `./icons` không còn export
`_validateIconDefinition` (hàm nội bộ).

Site phải sửa: chỉ khi dựa vào các hành vi cũ ở mục 1–7.

---

## 0.15.1

**Không có thay đổi phá vỡ.** Bản tài liệu + một sửa lỗi nhỏ.

- Tài liệu người dùng viết lại dạng hub-spoke (`docs/README.md`); tài liệu nội bộ chuyển vào `docs/internal/`. Link
  cũ `docs/components.md` → `docs/components/README.md` (mỗi component một trang), `docs/migration/class-map.md` →
  [class-map.md](class-map.md).
- Sửa: trigger video của lightbox dùng prefix `td` (đơn lẻ hoặc trong `[data-td-lightbox-group]`) giờ hiện con trỏ
  `pointer` như 0.15.0 đã định (trước đó một rule cũ vẫn ép `zoom-in`). Site nào đã tự thêm
  `[data-td-lightbox-type="video"] { cursor: pointer; }` để né lỗi có thể bỏ dòng đó.

Site phải sửa: không có.

---

## 0.15.0

**Không có thay đổi phá vỡ.** TdLightbox bổ sung API cho ngang bằng lightbox của dwp.

Bổ sung:

- Handle trả về từ `TdLightbox.open()` có thêm `setPanel(false | true | renderer)`, `refreshPanel()`,
  `addToolbarButton(spec)` (trả về đối tượng có `remove()`; cùng `id` thì thay thế) và `removeToolbarButton(id)`.
- `itemEl` / `groupEl` có trong ctx của hook panel / toolbar / download và trong `detail` của các sự kiện
  `td-lightbox-open`, `td-lightbox-change`, `td-lightbox-close`; `TdLightbox.open(items, { groupEl })`.
- `TdLightbox.bind(root, { attrPrefix: 'dwp' })` đọc markup `data-dwp-lightbox-*`; `filter(el, event)` trả `false`
  để bỏ qua một cú click.

Có thể khiến site nhìn khác:

- **Con trỏ trên trigger:** phần tử ảnh có `data-td-lightbox` / `data-td-lightbox-item` (và bản `data-dwp-…`) giờ có
  con trỏ `zoom-in`; trigger video (`data-…-lightbox-type="video"`) có con trỏ `pointer`. Chỉ áp dụng cho hai tiền
  tố dựng sẵn `td` và `dwp`; tiền tố khác qua `attrPrefix` không có con trỏ này. Muốn giữ con trỏ cũ, ghi đè trong
  CSS không layer của site:

  ```css
  [data-td-lightbox],
  [data-td-lightbox-item] {
    cursor: default;
  }
  ```

- **Vuốt bottom sheet trên điện thoại** dùng touch event thay vì Pointer Events (sửa lỗi bị `pointercancel` khi
  panel cuộn được). Không có API nào đổi.

Cần làm: không có gì bắt buộc.

## 0.14.4

**Đổi giao diện (nhỏ).** Dải chọn (band) của bánh xe giờ/phút trong `td-datetime-picker` trước chỉ có viền trên/dưới
nên hai đầu bo tròn trông như bị cắt. Giờ là viền 1px đủ 4 phía, tông mềm `--td-control-border-hover` qua token
`--td-dtp-band-border`.

Cần làm: không bắt buộc. Nếu site muốn dải chọn đậm như trước (viền trước đây dùng `--td-control-border-strong`):

```css
:root {
  --td-dtp-band-border: var(--td-control-border-strong);
}
```

## 0.14.3

**Đổi giao diện + gỡ một token.** "Sáng hơn, bớt xám" theo phản hồi của chủ dự án.

Thay đổi:

- **Nút secondary** thành kính trắng có viền rõ: token mới `--td-btn-secondary-glass` (trắng 80 %; dark 84 %) và
  viền `--td-btn-secondary-edge` (mặc định `--td-control-border-soft`).
  **Sửa lỗi:** trước đây `.td-btn:not(.td-btn--custom)` thắng `.td-btn--secondary` nên nút secondary luôn hiện màu
  xám đặc `#f0f0f2` thay vì kính. Nếu site đã quen với nút xám đó, sau bản này nó thành trắng.
- **Token `--td-glass-secondary-film` bị gỡ** (lớp phim xám 4 % của nút secondary). Override của site với token này
  không còn tác dụng.
- **Nút màu sáng hơn:** alpha tint 90 → 94 %, lớp phim làm tối 16–18 % → 6–13 % (vẫn ≥ 4.7:1 trên mọi nền trong
  contrast gate).
- **Bóng nâng nhẹ hơn:** token mới `--td-btn-lift`.
- **Nút disabled trông rõ là bị tắt:** nền `#f4f4f5`, chữ `#a1a1aa`, viền `#e4e4e7` (dark `#202024` / `#6b6b73`).
  Tương phản chữ disabled chỉ đảm bảo ≥ 2.2:1 (WCAG 1.4.3 / 1.4.11 miễn cho control không hoạt động).

Cần làm:

1. Tìm và bỏ `--td-glass-secondary-film` trong CSS của site. Muốn chỉnh nút secondary thì dùng token mới:

   ```css
   /* Trước (≤ 0.14.2) */
   :root {
     --td-glass-secondary-film: rgb(0 0 0 / 8%);
   }

   /* Sau (0.14.3+) */
   :root {
     --td-btn-secondary-glass: rgb(245 245 247 / 85%);
     --td-btn-secondary-edge: var(--td-control-border-strong);
   }
   ```

2. Nếu muốn giữ nút secondary xám đặc như trước (vốn là do lỗi):

   ```css
   :root {
     --td-btn-secondary-glass: #f0f0f2;
   }
   ```

3. Nếu site cần chữ disabled đậm hơn: ghi đè `--td-btn-disabled-bg`, `--td-btn-disabled-fg`,
   `--td-btn-disabled-border`.

## 0.14.2

**Đổi giao diện.** Viền khi hover của input-field, dropdown, datetime-picker, chip-input, checkbox chưa tích, toggle
đang tắt, và viền của option đang được chọn bằng bàn phím trong dropdown / chip-input giờ dùng
`--td-control-border-hover` (`#aeaeb2` light / `#636366` dark) thay cho gray-500 / gray-600. Nền highlight của
option giữ nguyên.

Cần làm: không bắt buộc. Site cần tương phản chặt (≥ 3:1 cả lúc nghỉ lẫn hover):

```css
:root {
  --td-control-border-soft: var(--td-control-border-strong);
  --td-control-border-hover: var(--td-control-border-strong);
}
```

## 0.14.1

**Đổi giao diện.** Viền lúc nghỉ của input-field, textarea, dropdown (trigger + ô tìm), datetime-picker, chip-input,
toggle và checkbox dùng `--td-control-border-soft` (`#d1d1d6` light / `#3a3a3c` dark) thay cho gray-500. Focus bằng
bàn phím vẫn có vòng focus.

Đánh đổi có chủ đích: viền lúc nghỉ chỉ khoảng 1.5:1, **dưới** mức 3:1 của WCAG 1.4.11.

Điều dễ bị bỏ sót: trước 0.14.1, site muốn đổi màu viền ô nhập thường ghi đè `--td-control-border-strong`. Từ 0.14.1
token đó **không còn là viền lúc nghỉ** (và từ 0.14.2 cũng không còn là viền hover) của các control trên. Override cũ
vẫn hợp lệ nhưng gần như không thấy tác dụng.

Cần làm:

```css
/* Trước (≤ 0.14.0): đổi viền ô nhập */
:root {
  --td-control-border-strong: #8a8f98;
}

/* Sau (0.14.1+): viền lúc nghỉ và hover là hai token riêng */
:root {
  --td-control-border-soft: #c7cad1;   /* lúc nghỉ */
  --td-control-border-hover: #8a8f98;  /* khi hover (0.14.2+) */
}

/* Hoặc: site cần viền 3:1 lúc nghỉ như trước */
:root {
  --td-control-border-soft: var(--td-control-border-strong);
}
```

## 0.14.0

**Đổi giao diện lớn + đổi hành vi.** "Liquid Glass thật": luật glass viết lại (v2), mọi giá trị đi qua contrast gate
render thật.

Đổi giao diện:

- **Chất liệu kính mỏng hơn:** nền kính 40 % / 52 % (light), 44 % / 60 % (dark) thay cho 72 % / 86 %; blur 16px +
  saturate + brightness, sheen 135°, viền hai tông, hairline ngoài tối, bóng sâu hơn. Tên token giữ nguyên
  (`--td-glass-bg`, `--td-glass-bg-strong`, …) nhưng **giá trị mặc định đổi**; site đã ghi đè các token này giữ giá
  trị của mình.
- **Nút là kính:** variant nổi bật (primary, success, danger, warning, info) = kính tint màu; secondary = kính trung
  tính. `warning` thành vàng hổ phách, chữ tối. Disabled dùng màu trạng thái đặc thay cho `opacity: .55`. Hover =
  quầng sáng bên ngoài (màu nền sau chữ không đổi); nhấn dùng `--td-glass-press-scale`. Nút trong bảng / vùng dày
  đặc / trên bề mặt kính giữ vẻ kính nhưng không tự blur. Màu tuỳ chỉnh (`color`) luôn được vẽ đặc.
- **Checkbox tròn** mặc định (`--td-checkbox-radius: 50%`; trước là 6px).
- **Toast là kính tint theo loại** (`--td-toast-glass-bg`, `--td-toast-{success|error|warning|info}-wash`,
  `--td-toast-{…}-icon`).
- **Kính phía trước thắng:** dropdown / menu / gợi ý chip-input / tooltip / hovercard mở trên modal giữ kính, còn
  dialog bị che chuyển sang đặc (trước: popover chuyển đặc).
- Nút X của modal và nút đóng toast dùng màu chữ của kính (xám nhạt cũ không đạt 3:1 trên kính).

Đổi hành vi:

- **Tooltip theo dwp:** có mũi tên, chữ 14px, **hiện khi chạm** (trước 0.14.0 bỏ qua chạm), hiện khi focus bất kỳ,
  **ẩn khi cuộn / resize / chạm chỗ khác** (0.9.0 định vị lại khi cuộn), hiệu ứng mờ dần. Chấp nhận alias của dwp:
  `data-dwp-tooltip`, `data-tooltip-pos`, `data-dwp-tooltip-pos`. Khi có cả hai cách viết, bản `data-tooltip` /
  `data-tooltip-position` thắng.
- **Hovercard** (mới) mở ngay chỉ khi focus bằng bàn phím (`:focus-visible`); click chuột đi qua hover-intent.
  Trigger `tabindex="-1"` được cho vào thứ tự Tab trong lúc bind.

Bổ sung: `TdMenu.define()`, `TdMenu.register()`, `TdMenu.has()`, `TdMenu.bindAll()`, `TdMenu.open(anchor, 'tên')`,
markup `data-td-menu="tên"`; `TdHovercard` (`@dazzxq/td-components/hovercard`).

Cần làm:

1. Mở các trang có nút, modal, toast, menu và xem lại bằng mắt. Nếu site không muốn kính (hoặc trình duyệt yếu):

   ```html
   <html lang="vi" data-td-glass="off">
   ```

2. Muốn checkbox vuông như trước:

   ```css
   :root {
     --td-checkbox-radius: 6px;
   }
   ```

3. **Trang dwp đang nạp script tooltip riêng của dwp:** từ 0.14.0 `td-tooltip` cũng nhận `data-dwp-tooltip`, nên
   nạp cả hai sẽ ra **hai tooltip chồng nhau**. Chỉ giữ một: bỏ script tooltip của dwp và để td xử lý (markup dwp
   chạy nguyên vẹn), hoặc không import `@dazzxq/td-components/tooltip` trên trang đó.
4. Site có code dựa vào "tooltip không hiện trên cảm ứng" hoặc "tooltip định vị lại khi cuộn": xem lại theo hành vi
   mới ([tooltip.md](../components/tooltip.md)).
5. Site đã tự vẽ nút bằng `.td-btn` trong markup server-side: không phải đổi class, nhưng nền phía sau nút giờ lộ qua
   lớp kính; kiểm tra nút đặt trên ảnh / nền nhiều màu.

## 0.13.0

**Không có thay đổi phá vỡ.** Chỉ bổ sung, tất cả là opt-in:

- `TdButton.run(asyncFn)` — nút ở trạng thái `loading` trong lúc chạy, gọi lại khi đang chạy dùng chung promise.
- `td-toggle` `commit(asyncFn, next?)` — lưu lạc quan, trạng thái pending (`aria-busy`, `.td-switch[data-pending]`),
  thất bại thì quay lại và phát `commit-error`.
- `td-input-field` thuộc tính `autoresize` cho textarea.

Cần làm: không có.

## 0.12.0

**Đổi hành vi (nhỏ).** Ba component mới: `TdMenu` (`./menu`), `<td-chip-input>` (`./chip-input`),
`TdFormValidation` (`./form-validation`).

Thay đổi có thể ảnh hưởng:

- Thông báo lỗi ràng buộc (constraint message, `validationMessage`) của `td-checkbox`, `td-toggle`, `td-slider` giờ
  là **tiếng Việt** (trước là tiếng Anh), ví dụ toggle bắt buộc: `Please turn this on.` → `Vui lòng bật tùy chọn này.`
- `td-dropdown` dùng chung bộ type-ahead mới (`utils/typeahead.js`).

Cần làm: nếu test của site so khớp chuỗi thông báo tiếng Anh, đổi sang so khớp trạng thái thay vì chuỗi:

```js
// Trước
expect(toggle.validationMessage).toBe('Please turn this on.');

// Sau: kiểm tra trạng thái, không phụ thuộc ngôn ngữ
expect(toggle.validity.valueMissing).toBe(true);
```

## 0.11.0

**Phá vỡ.** Kit không còn cần Tailwind.

- **Peer dependency `tailwindcss` bị gỡ.** Site chỉ cần `td.css`. Site vẫn dùng Tailwind cho giao diện riêng vẫn chạy
  bình thường (`td.css` nằm trong `@layer td.*` và component tự đặt font / line-height / box-sizing / viền).
- `td-sample` (`./sample`) in markup BEM `.td-sample` với nút `.td-btn` thay vì class Tailwind (attribute và sự kiện
  `count-change` giữ nguyên).

Cần làm:

1. Site **tự dùng** Tailwind: đảm bảo `tailwindcss` nằm trong `dependencies` / `devDependencies` của chính site.
   npm 7+ tự cài peer dependency, nên có site chỉ có Tailwind "nhờ" kit; sau 0.11.0 gói đó biến mất.

   ```bash
   npm install -D tailwindcss@^4
   ```

2. Bỏ dòng `@source` trỏ vào kit trong CSS Tailwind của site (không còn class Tailwind nào trong kit để quét):

   ```css
   /* Trước (≤ 0.10) */
   @import "tailwindcss";
   @source "../node_modules/@dazzxq/td-components/src";

   /* Sau (0.11.0+) */
   @import "tailwindcss";
   ```

3. Tải `td.css` nếu chưa (bắt buộc từ 0.7.0).
4. Site có CSS / test dựa vào markup Tailwind của `td-sample`: đổi theo [class-map.md](class-map.md#td-sample).

## 0.10.0

**Phá vỡ + đổi hành vi.** Đợt migrate cuối: `td-datetime-picker` và `td-table` chuyển sang token-native. Từ bản này
mọi component chỉ cần `td.css`.

Phá vỡ:

- Class nội bộ đổi sang BEM: `.td-dtp-wheel-*` → `.td-dtp-wheel__*`, thân modal của picker → `.td-dtp-panel__*`,
  `.td-table-*` → `.td-table__*`. Xem [class-map.md](class-map.md#td-datetime-picker) và
  [class-map.md](class-map.md#td-table).
- `src/utils/adopt-styles.js` bị xoá (chưa bao giờ là export công khai; ai import thẳng file này sẽ lỗi).

Đổi hành vi — datetime-picker:

- Trigger là `button[role=combobox][aria-haspopup=dialog]` (trước là `input[readonly]`).
- **Escape đóng dialog** và bỏ thay đổi (TdModal `escapeCloses`), giống nút X và "Đóng".
- Giờ / phút được kiểm tra (không còn 25:99).
- **`getValue()` / `getDBValue()` trả `''`** khi rỗng, sai định dạng hoặc ngoài `min`/`max` (trước trả thời điểm
  "bây giờ").
- Phút làm tròn xuống theo `minute-step` khi mở dialog; `setDBValue()` bỏ qua giá trị rác và nhận thêm ISO-local.

Đổi hành vi — table:

- Sort / phân trang / data / loading cập nhật tại chỗ (giữ focus).
- `zebra="false"` giờ tắt được sọc (trước luôn bật).
- **Server mode giữ trang hiện tại** khi `data` đổi (trước quay về trang 1) và **bắt buộc `total-items`**; thiếu thì
  ẩn cả hai thanh phân trang và in cảnh báo.
- Trang bị kẹp trong khoảng hợp lệ; `render` được gọi theo **chỉ số cột** với `(row, rowIdxInPage)` và có thể trả về
  Node; mặc định `empty-text` là "Chưa có dữ liệu để hiển thị."

Cần làm:

1. Đổi selector CSS theo [class-map.md](class-map.md).
2. Code gọi `getValue()` để lấy "bây giờ" khi picker rỗng phải tự xử lý chuỗi rỗng:

   ```js
   // Trước (≤ 0.9): picker rỗng vẫn trả thời điểm hiện tại
   const when = picker.getDBValue();

   // Sau (0.10.0+)
   const when = picker.getDBValue();
   if (!when) {
     picker.setError('Vui lòng chọn ngày giờ.');
     return;
   }
   ```

3. Bảng server mode phải có `total-items`:

   ```html
   <!-- Trước -->
   <td-table server-mode></td-table>

   <!-- Sau -->
   <td-table server-mode total-items="0"></td-table>
   ```

   ```js
   table.onPageChange = async (page) => {
     const res = await fetch(`/api/posts?page=${page}`).then((r) => r.json());
     table.setAttribute('total-items', String(res.total));
     table.data = res.rows; // server mode: giữ nguyên trang hiện tại
   };
   ```

4. Cột có `render` dùng tham số thứ hai hoặc dựa vào `key` để tìm cột: kiểm tra lại với chữ ký
   `render(row, rowIdxInPage)`.
5. Test bấm Escape để giữ picker mở: hành vi đã đổi.

## 0.9.0

**Phá vỡ + đổi hành vi.** Lớp nổi (floating layer): `TdModal` / `TdModalStackManager`, `TdToast`, `TdTooltip`,
`td-dropdown` chuyển sang token-native.

Phá vỡ:

- Class nội bộ đổi sang BEM: `.td-modal-*` → `.td-modal__*`, `.toast-item` → `.td-toast`,
  `.td-tooltip-content` → `.td-tooltip__content` (mũi tên cũ bị bỏ), `.td-dropdown-*` → `.td-dropdown__*`. Xem
  [class-map.md](class-map.md).
- **z-index lấy từ token:** modal `--td-z-modal` 400, menu dropdown `--td-z-popover` 450 (trước 10010), toast
  `--td-z-toast` 500 (trước 99999), tooltip `--td-z-tooltip` 510 (mới). Header / chat widget cố định của site có
  z-index lớn hơn sẽ **đè lên modal và toast**.
- `TdModalStackManager.BASE_Z_INDEX` (`@dazzxq/td-components/modal-stack`) giờ mặc định `null`; đặt số vào sẽ vẫn
  chạy nhưng in cảnh báo deprecated. `TdToast.TOAST_Z_INDEX_BASE` là 500, `TdToast.getToastZIndex()` trả giá trị token
  (cả hai deprecated).
- **`TdToast.getTheme(type)` trả `{ type, icon }`** (trước trả class Tailwind + chuỗi SVG).

Đổi hành vi:

- **Một chủ bàn phím cho mọi lớp nổi:** Escape chỉ tới lớp trên cùng; Tab bị giữ trong lớp chặn trên cùng. Overlay
  loading giữ focus.
- **Modal:** `role=dialog` + `aria-modal`; focus luôn vào trong dialog khi mở (`autoFocus: false` giờ focus chính
  dialog thay vì không focus gì; `focusTarget` chỉ dùng nếu nằm trong dialog) và trả về phần tử mở **trước** khi gọi
  `onClose`; trang phía sau `inert`; chỉ phần thân cuộn (bỏ giới hạn 60/70 vh); `onConfirm` trả promise giữ dialog
  mở tới khi promise xong; `onClose(value)` nhận `value` của nút footer. Vẫn không đóng bằng Escape / bấm nền.
- **Toast:** kính + icon trạng thái (không còn nền màu đặc); mọi toast có nút đóng; hẹn giờ tạm dừng khi hover / focus
  / tab bị ẩn.
- **Tooltip:** `role=tooltip` + `aria-describedby`; mở khi focus bàn phím; hover được; Escape tắt; xử lý `title` theo
  chính sách đặt tên (có thể chuyển `title` thành `aria-label`); `data-tooltip-text-color` chỉ có tác dụng khi có
  `data-tooltip-color`. (Hành vi chạm và cuộn đổi tiếp ở 0.14.0.)
- **Dropdown:** combobox APG — option **không còn là điểm dừng Tab** (dùng `aria-activedescendant`), type-ahead, Tab
  đóng menu, click ngoài đóng ở `pointerdown`, **đúng một** sự kiện `change` mỗi lần chọn, `open()` không làm gì khi
  disabled.

Cần làm:

1. Đổi selector CSS theo [class-map.md](class-map.md). Các component này bắt buộc có `td.css`.
2. Nếu header cố định của site có z-index cao, ghi đè **cả bộ** token và giữ đúng thứ tự
   (lightbox < modal < popover < loading < toast < tooltip):

   ```css
   /* Trước (≤ 0.8): toast 99999 luôn nằm trên header z-index 1000 */

   /* Sau (0.9.0+) */
   :root {
     --td-z-lightbox: 1350;
     --td-z-modal: 1400;
     --td-z-popover: 1450;
     --td-z-loading: 1480;
     --td-z-toast: 1500;
     --td-z-tooltip: 1510;
   }
   ```

3. Bỏ `TdModalStackManager.BASE_Z_INDEX = …` trong code site, dùng token `--td-z-modal` ở trên.
4. Code dùng `TdToast.getTheme()`:

   ```js
   // Trước (≤ 0.8): { bg: 'bg-green-500/85', hover: 'hover:bg-green-500/90', icon: '<path …>' }
   // Sau:
   const { type, icon } = TdToast.getTheme('success');
   ```

5. Code dựa vào `autoFocus: false` để "không focus gì" hoặc test Tab đi qua từng option của dropdown: cập nhật theo
   hành vi mới.
6. Test đếm số sự kiện `change` của dropdown: giờ đúng một lần mỗi lần chọn.

## 0.8.0

**Phá vỡ + đổi hành vi.** `td-input-field`, `td-slider`, `td-pagination`, `td-tabs`, `td-empty-state` chuyển sang
token-native.

Phá vỡ:

- Class nội bộ đổi sang BEM: `.td-input*` → `.td-field*`, `.td-slider-*` → `.td-slider__*`,
  `.td-pagination-*` → `.td-pagination__*`, `.td-tab-btn` → `.td-tabs__tab`, `.td-empty-*` → `.td-empty-state__*`.
  Xem [class-map.md](class-map.md). Các component này bắt buộc có `td.css`.

Đổi hành vi:

- **Một sự kiện mỗi loại** cho input-field và slider: `input` / `change` gốc của control bên trong **không còn nổi
  bọt** lên; chỉ còn CustomEvent của host với `detail: { value }`. `change` của input-field chỉ phát khi giá trị khác
  lúc focus.
- **Tabs:** vai trò APG, roving tabindex; ← → Home End chỉ **di chuyển focus**, **Enter / Space mới chọn** (kích hoạt
  thủ công). Muốn mũi tên chọn luôn: `activation="auto"`. Tên mặc định của tablist là "Các thẻ".
- **Pagination:** số trang là `<button>` (`aria-current`); `max-pages` giờ là **kích thước cửa sổ** số trang liên tiếp
  (trước chỉ là ngưỡng — lỗi), kẹp tối đa 25; trang hiện tại là viên màu accent đặc (trước là chữ đỏ).
- **Input-field:** lỗi và helper hiện cùng lúc; reset form xoá lỗi; nhãn luôn được gắn (`field-id` giữ nguyên, nếu
  không thì `{host-id}-control`).
- **Slider:** màu mặc định là token accent; `track-color` giờ có tác dụng; chỉ vẽ vạch khi ≤ 50 bước.
- **Empty-state:** `icon` dạng chuỗi `<svg>` thô bị deprecated và được kiểm tra chặt; tên icon không tồn tại → `inbox`
  + cảnh báo; `actions` vẽ nút `.td-btn`.

Cần làm:

1. Đổi selector CSS theo [class-map.md](class-map.md).
2. Listener gắn vào control bên trong phải chuyển lên host:

   ```js
   // Trước (≤ 0.7): nghe sự kiện gốc từ <input> bên trong
   field.querySelector('input').addEventListener('input', (e) => preview(e.target.value));

   // Sau (0.8.0+): nghe trên host, đọc detail
   field.addEventListener('input', (e) => preview(e.detail.value));
   ```

3. Muốn tabs đổi ngay khi bấm mũi tên như trước:

   ```html
   <td-tabs activation="auto"></td-tabs>
   ```

4. Kiểm tra `max-pages` của pagination: giá trị giờ là số nút trang liên tiếp hiển thị (mặc định 5).
5. `td-empty-state` đang truyền `icon="<svg …>"`: chuyển sang tên icon trong registry hoặc property `iconNode`:

   ```js
   // Trước
   empty.setAttribute('icon', svgMarkupString);  // chuỗi SVG thô (kiểu cũ, không còn được khuyến khích)

   // Sau
   empty.setAttribute('icon', 'inbox');          // tên trong registry
   // hoặc
   empty.iconNode = mySvgElement;                 // SVGElement do site tự dựng (tin cậy)
   ```

## 0.7.0

**Phá vỡ + đổi hành vi.** `td-button`, `td-checkbox`, `td-toggle`, `TdLoading` chuyển sang token-native — lần đầu
component **cần `td.css`**.

Phá vỡ:

- **Bốn component này bắt buộc tải `td.css`**; thiếu thì chúng mất style.
- Class nội bộ đổi sang BEM (xem [class-map.md](class-map.md)).
- **Custom property `--td-cb-color` của `td-checkbox` đổi thành `--td-checkbox-color`.**

Đổi hành vi:

- **Một sự kiện `change`** cho checkbox / toggle (`change` / `input` gốc của input bên trong không còn nổi bọt).
- **`td-toggle`** là `<input type="checkbox" role="switch">` gốc; **Enter không còn bật/tắt** (chỉ Space, theo APG).
- **`td-button` loading** giữ focus: dùng `aria-busy` + `aria-disabled` + chặn click, **không** đặt `disabled` gốc
  lên `<button>` bên trong nữa.
- `td-button` thuộc tính `icon` nhận tên icon trong registry; giá trị khác (ví dụ class Font Awesome) là đường cũ,
  deprecated.
- Màu mặc định: checkbox dùng accent (trước `#2196F3`); toggle bật `#16a34a` (trước `#4ADE80`).
- **`TdLoading.wrap()` đếm tham chiếu**; overlay `role="status"`, giữ focus, làm trang `inert`, khoá cuộn; z-index
  `--td-z-loading: 480` (trước 99999, giờ nằm dưới toast).
- (Giao diện nút ở bản này là màu đặc; tới 0.14.0 nút lại thành kính.)

Cần làm:

1. Tải `td.css` một lần cho cả site:

   ```js
   // Vite / bundler
   import '@dazzxq/td-components/td.css';
   ```

   ```html
   <!-- PHP / HTML -->
   <link rel="stylesheet" href="/vendor/td-components-0.15.0/td.css">
   ```

2. Đổi custom property của checkbox (hoặc dùng thuộc tính `color`):

   ```css
   /* Trước */
   td-checkbox.brand { --td-cb-color: #e11d48; }

   /* Sau */
   td-checkbox.brand { --td-checkbox-color: #e11d48; }
   ```

   ```html
   <td-checkbox color="#e11d48" label="Đồng ý"></td-checkbox>
   ```

3. Code kiểm tra `button.disabled` để biết nút đang loading: đổi sang `aria-busy`:

   ```js
   // Trước
   const busy = tdButton.querySelector('button').disabled;

   // Sau
   const busy = tdButton.querySelector('button').getAttribute('aria-busy') === 'true';
   ```

4. Nút dùng icon Font Awesome: đổi sang tên icon trong registry (`close`, `check`, `plus`, `download`, `search`, …;
   danh sách ở [icons.md](../components/icons.md)):

   ```html
   <!-- Trước -->
   <td-button icon="fa fa-download" label="Tải về"></td-button>

   <!-- Sau -->
   <td-button icon="download" label="Tải về"></td-button>
   ```

5. Test / phím tắt dựa vào Enter để bật toggle: dùng Space.

## 0.6.0

**Không có thay đổi phá vỡ.** Thêm `TdLightbox` (`@dazzxq/td-components/lightbox`) — component token-native đầu
tiên — và icon registry (`@dazzxq/td-components/icons`, `<td-icon>` qua `./icon-element`, `icons.json`). Component
có sẵn không đổi.

Cần làm: không có. Muốn dùng lightbox thì phải tải `td.css`.

## 0.5.0

**Không có thay đổi phá vỡ.** Ra mắt `td.css` (export `@dazzxq/td-components/td.css`): token `--td-*`, thứ tự layer
`@layer td.tokens, td.component, td.utilities`, dark theme opt-in `<html data-td-theme="dark">`, recipe kính
`.td-glass-surface` và công tắc `<html data-td-glass="off">`. Component cũ (Tailwind) không đổi giao diện.

Cần làm: không có. Tải `td.css` từ bản này là bước chuẩn bị tốt cho 0.7.0.

## 0.4.1

**Đổi hành vi (sửa lỗi).** Không gỡ API nào.

- `TdToast`: không còn treo tab ở toast thứ 6; toast thành công / thông tin / cảnh báo là `role="status"`, chỉ lỗi là
  `role="alert"` (trước mọi toast là `alert`).
- `TdModal` đóng ngay trong khung hình mở không còn rò focus trap; `TdModal.closeAll()` gỡ mọi listener focus trap.
- **Khoá cuộn của modal chuyển từ `<body>` sang `<html>`** (khoá dùng chung, đếm tham chiếu, trả lại đúng giá trị cũ).
  Trước đó modal ghi `document.body.style.overflow = 'hidden'` / `''`.
- `td-input-field`: lỗi và helper là hai trạng thái riêng; `setError('')` không còn xoá helper; viền đỏ giữ qua
  focus / blur; control bên trong có `aria-invalid="true"` khi lỗi.
- `td-dropdown`: menu mở về phía còn nhiều chỗ, kẹp trong viewport, đóng khi trigger bị khuất; đóng khi focus đang ở
  trong menu thì focus về trigger.

Cần làm:

- Code / CSS của site kiểm tra `body.style.overflow === 'hidden'` để biết modal đang mở: đổi cách kiểm tra (ví dụ
  kiểm tra có phần tử `.td-modal` đang hiện), vì khoá giờ đặt trên `<html>`.
- Test tìm `[role="alert"]` cho toast thành công: đổi sang `[role="status"]`.

## 0.4.0

**Đổi hành vi.** Không đổi tên attribute / property / event nào.

- **Modal không còn đóng khi bấm nền (backdrop)** — có chủ đích để tránh đóng nhầm (ADR 0006). Modal chỉ đóng bằng
  nút X, nút footer, hoặc bằng code (`closeById` / `closeAll`). `closable: false` giờ chỉ ẩn nút X.
- **`td-dropdown` `searchable` và `allow-clear` giờ tắt được.** Trước đây kiểm tra nội bộ luôn trả `true`, nên
  `searchable="false"` không có tác dụng. Mặc định vẫn BẬT; tắt bằng `"false"` / `"0"` / `"off"` hoặc
  `el.searchable = false`. Site nào đã (vô tình) viết `searchable="false"` sẽ thấy ô tìm kiếm biến mất.
- `TdModal.confirm()` (và `success` / `error` / `info`) luôn resolve đúng một lần: xác nhận → `true`; huỷ / X /
  `closeAll()` → `false` (trước đó đóng bằng X làm promise treo mãi).
- Bổ sung: `td-input-field type="date"`, `role="switch"` cho toggle, export `@dazzxq/td-components/dom-utils`.

Cần làm:

1. Nếu UX của site cần đóng modal khi bấm ra ngoài: không còn hỗ trợ; thêm nút đóng rõ ràng trong footer.
2. Tìm `searchable="false"` / `allow-clear="false"` trong markup và quyết định có thật muốn tắt không.
3. Code `await TdModal.confirm(...)` từng phải tự đặt timeout vì sợ treo: có thể bỏ.

---

## Trước 0.4 (tham khảo)

Chi tiết trong [CHANGELOG.md](../../CHANGELOG.md):

- **0.3.0** — CSP-strict: bỏ `style="…"` inline, dùng CSSOM + `adoptedStyleSheets` (cơ chế này bị gỡ ở 0.10.0).
- **0.2.0** — `td-toggle` mặc định **không controlled** (tự bật/tắt; thêm `controlled` để giữ cách cũ); control bên
  trong `td-input-field` không còn mang `name` (form gửi qua `name` của host).

## Xem thêm

- [README.md](README.md) — quy trình nâng cấp, rollback, checklist.
- [class-map.md](class-map.md) — class cũ → class BEM hiện tại.
- [theming.md](../customization/theming.md) — token `--td-*` và cách ghi đè.
- [accessibility.md](../guides/accessibility.md) — lý do của các đánh đổi tương phản (viền mềm, nút disabled).
