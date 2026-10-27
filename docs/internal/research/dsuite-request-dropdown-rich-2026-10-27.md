# Yêu cầu nâng cấp td-components: `td-dropdown` dòng giàu thông tin + chế độ "chọn để thêm"

> Gửi nhóm kit (`@dazzxq/td-components`), từ dsuite, 27/10/2026. Bản kit đang ghim: **0.83.0** (commit `8c6e65ae`, `td-components.lock.json`). dsuite **không** vá kit; khi kit có bản mới, dsuite nâng ghim theo `02-ARCHITECTURE §2.2`. Mong muốn: một bản **minor tương thích ngược** (vd 0.84.0): option không dùng trường mới phải ra DOM / hành vi y như 0.83.0.
> Người dùng đầu tiên: thẻ "Khuyến mãi" ở trang sửa sản phẩm và màn "Khuyến mãi áp dụng chung" ([MKT-global-promo](MKT-global-promo.md) §4.3-4.4). Nhu cầu chung, không riêng một màn: mọi ô kiểu "+ Thêm …" chọn từ một danh mục có sẵn (mẫu khuyến mãi, gói bảo hành, nhãn, màu).

## 1. Hiện trạng 0.83.0 (đã đọc mã nguồn)

| Có sẵn | Chỗ |
|---|---|
| Dòng tạo ghim cuối menu `create-label`, sự kiện `create` `{ query }`, `onCreate`, `labels.createWithQuery` | `src/form/td-dropdown.js:107-111`, `:796-805`, `:926-938` |
| Option `disabled` (mờ, bỏ qua khi điều hướng) | `:90-92`, `:787` |
| Chấm màu `swatch` (an toàn CSP, tô qua `fill`) | `:12-13`, `:613-635` |
| Icon slot qua registry (`data-td-icon` + `fillIconSlots`) - đang dùng cho mũi tên / dấu tích / dấu cộng | `:7`, `:803-806` |
| Bàn phím APG select-only combobox, lớp popover dùng được trong modal | `:61-69` |

| Thiếu | Chỗ |
|---|---|
| Dòng option **chỉ in nhãn** (+ swatch + dấu tích): không icon, không dòng mô tả, không huy hiệu / trạng thái, không chữ phụ bên phải | `:783-793` |
| **Không nhóm**: `<optgroup>` bị làm phẳng, nhãn nhóm bị bỏ | `:76` |
| Tìm **chỉ theo nhãn** | `:1131-1135` |
| Luôn là ô chọn **một giá trị** của form: chọn xong giữ giá trị, ghi vào form, hiện ở trigger. Không có chế độ "chọn để thêm" (chọn → báo sự kiện → ô về trống) | `:670-682` |
| Không có trạng thái "đang tải" / lỗi tải trong menu | - |
| `td-chip-input selection-only` có `renderOption` nhưng **bỏ qua** `allow-create` (không có dòng hành động) | `src/form/td-chip-input.js:727-731` |

## 2. Yêu cầu

Mức: **P1** = cần cho dsuite lô này; **P2** = nên có; **P3** = tùy kit.

### R1 (P1) - Dòng option giàu thông tin

Trường mới trên mỗi object option (đều tùy chọn; thiếu = như 0.83.0):

| Trường | Kiểu | Hiển thị |
|---|---|---|
| `icon` | string | Tên icon trong **registry của kit** (core hoặc icon site đã `registerIcons`). Vẽ trong ô vuông bo tròn đầu dòng qua `data-td-icon` + `fillIconSlots`. Tên không có trong registry → không vẽ ô, `console.warn` một lần mỗi tên. Không bao giờ nhận SVG / HTML. |
| `iconTone` | `'neutral' \| 'accent' \| 'success' \| 'warning' \| 'danger' \| 'info'` | Màu nền nhạt + màu nét của ô icon theo token kit (class, không `style` inline). Mặc định `neutral`. |
| `description` | string | Dòng thứ hai, chữ nhỏ, màu phụ, một dòng cắt `…`. |
| `status` | `{ tone, text }` (tone như `iconTone`) | Chấm màu + chữ ngắn, nằm cuối dòng mô tả (vd "Đang hiện", "Chờ tới lịch 01/11", "Đang tắt"). |
| `meta` | string | Chữ phụ căn phải của dòng (vd "Đã thêm"). Thường đi cùng `disabled: true`. |
| `keywords` | string \| string[] | Chỉ dùng để tìm (R4), không hiển thị. |

- Chữ đều escape (như hiện nay). Không HTML từ option, không `style` inline (CSP).
- Chiều cao dòng: dòng có `description` cao hơn dòng một nhãn; `max-height` (tính theo số dòng) và PageUp / PageDown phải vẫn đúng khi trộn hai loại dòng (đo thật, không nhân `OPTION_PX` cố định).
- Trigger (chế độ chọn giá trị thường): hiện `icon` + nhãn của option đã chọn (không mô tả). Có thuộc tính tắt được nếu muốn trigger chỉ chữ.
- Tùy chọn mở rộng (P3): `renderOption(item, { query }) => Node` như `td-chip-input`, cho ca đặc biệt; R1 vẫn cần có sẵn để site không phải tự dựng DOM.

### R2 (P1) - Nhóm có tiêu đề

- Option có `group: string` (khóa nhóm) + thuộc tính / property `groups: [{ key, label }]` quyết định **thứ tự và nhãn** nhóm; option có `group` lạ hoặc thiếu → nhóm cuối không tiêu đề.
- Khởi tạo từ `<select>`: giữ `<optgroup label>` thành nhóm (thay vì làm phẳng). PHP `td_dropdown` (chế độ element) in được `<optgroup>`.
- Tìm kiếm lọc trong từng nhóm; nhóm rỗng sau lọc thì ẩn cả tiêu đề.
- Tiêu đề nhóm **không** nằm trong mô hình điều hướng (↑↓ / Home / End / PageUp / PageDown / type-ahead bỏ qua), không chọn được.

### R3 (P1) - Chế độ "chọn để thêm" (`mode="action"`)

- Thuộc tính `mode`: `select` (mặc định, như 0.83.0) | `action`.
- `action`: chọn một option (chuột / Enter / Space) → đóng menu, focus về trigger, phát sự kiện **`pick`** `detail: { value, item }` (+ callback `onPick`). **Không** giữ lựa chọn, **không** ghi giá trị vào form (không `name` submit, không `required`), **không** phát `change`, không dòng "Không chọn" (`allow-clear` vô hiệu), không dấu tích.
- Trigger hiện `placeholder` cố định (vd "+ Thêm mẫu khuyến mãi") và icon đầu tùy chọn qua `trigger-icon` (mặc định `plus` trong mode action); chữ phụ bên phải trigger qua `trigger-meta` (vd "4/10").
- Thuộc tính `keep-open` (P2): chọn xong không đóng menu (thêm nhiều mục liền); active row nhảy sang dòng kế còn chọn được; ô tìm giữ chữ.
- Dòng tạo (`create-label`, `create`) chạy y như hiện nay ở cả hai mode.
- `disabled` trên host vẫn tắt cả ô (dùng khi đã đủ trần).

### R4 (P1) - Tìm theo nhãn + mô tả + từ khóa

- Tìm (đã `fold` dấu như hiện nay) trên `label`, `description`, `keywords`. Có thể tắt về hành vi cũ bằng `search-fields="label"`.
- Vùng `.td-dropdown__empty` (role=status) báo số kết quả khi lọc ("12 kết quả") bên cạnh "Không tìm thấy kết quả" - chữ lấy từ `TdDropdown.labels.resultCount` (`{count}`).

### R5 (P2) - Nạp danh sách bất đồng bộ

- Property `load: () => Promise<options[]>`: gọi **một lần** ở lần mở đầu tiên (hoặc khi `reload()`); trong lúc chờ menu hiện dòng trạng thái "Đang tải…" (role=status, `labels.loading`); lỗi → "Không tải được" + nút "Thử lại" (`labels.loadError`, `labels.retry`) trong menu, focus không bị mất.
- Gán `options` khi menu đang mở: giữ chữ ở ô tìm, giữ dòng active theo `value` nếu còn, không nhảy cuộn.
- Hiệu năng: 2000 option có R1 + R2 mở menu < 100 ms trên máy văn phòng (Chromium, không throttle) và gõ tìm không giật; nếu cần thì dựng lười theo cuộn, nhưng `aria-activedescendant` / điều hướng vẫn đúng với mọi dòng.

### R6 (P1) - Truy cập (a11y) cho R1-R3

- Nhóm: `role="group"` + `aria-labelledby` tiêu đề nhóm, bên trong `role="listbox"` (mẫu APG "listbox with grouped options").
- Tên truy cập của option = nhãn; `description` + `status.text` + `meta` nối vào `aria-describedby` (id riêng mỗi dòng), không lặp vào tên.
- Ô icon, chấm trạng thái: `aria-hidden="true"`.
- `mode="action"`: trigger vẫn `role="combobox"`, có `aria-label` / nhãn; sau `pick` có thông báo lịch sự (live region của kit) "Đã chọn {nhãn}" tắt được bằng `labels.picked = ''`.
- Dòng tạo vẫn là dòng cuối của mô hình điều hướng, nhận được bằng End.
- Chế độ tối + `prefers-reduced-motion` + con trỏ thô (`isCoarsePointer`) như các dòng hiện có; vùng chạm ≥ 40 px.

### R7 (P3) - `td-choice-group` biến thể ô icon lớn

- `variant="tiles"`: lưới ô vuông (icon trên, nhãn dưới), cùng hành vi radio / bàn phím của `segmented`. Dùng cho ô "Biểu tượng" (6 icon) trong modal tạo mẫu. dsuite tạm dùng `segmented` có icon nếu chưa có.

### R8 (P3) - `td-chip-input selection-only` có dòng hành động

- Cho phép `create-label` + sự kiện `create` `{ query }` ở `selection-only` (dòng ghim cuối như `td-dropdown`), thay cho cảnh báo "allow-create is ignored". Không bắt buộc nếu có R1-R3.

## 3. Phác thảo API

```html
<td-dropdown id="ds-campaign-add" mode="action" placeholder="Thêm mẫu khuyến mãi" trigger-meta="4/10"
             create-label="Tạo mẫu khuyến mãi mới" max-height="8" aria-label="Thêm mẫu khuyến mãi"></td-dropdown>
```

```js
const dd = document.getElementById('ds-campaign-add');
dd.groups = [
  { key: 'public', label: 'Đang hiện' },
  { key: 'scheduled', label: 'Chờ tới lịch' },
  { key: 'hidden', label: 'Đang tắt / hết hạn' },
];
dd.options = [
  { value: '01k…a', label: 'Tặng ốp lưng + dán màn hình', group: 'public', icon: 'ds-gift', iconTone: 'danger',
    description: 'Quà tặng', status: { tone: 'success', text: 'Đang hiện' } },
  { value: '01k…b', label: 'Trả góp 0% qua thẻ tín dụng', group: 'public', icon: 'ds-credit-card', iconTone: 'info',
    description: 'Trả góp', status: { tone: 'success', text: 'Đang hiện' }, disabled: true, meta: 'Đã thêm' },
];
// hoặc: dd.load = () => fetch('/marketing/campaigns/options/data').then((r) => r.json()).then(toOptions);
dd.addEventListener('pick', (e) => addCampaign(e.detail.value));          // không có `change`, ô về placeholder
dd.addEventListener('create', (e) => openCreateModal(e.detail.query));    // như 0.22.0
dd.setAttribute('trigger-meta', '5/10');                                   // cập nhật bộ đếm
```

DOM gợi ý cho một dòng (tên class theo BEM của kit, tùy kit chốt):

```
<div class="td-dropdown__option td-dropdown__option--rich" role="option" id="{host}-opt-{i}" aria-selected="false"
     aria-describedby="{host}-opt-{i}-desc" [aria-disabled="true"] data-value data-index data-nav>
  <span class="td-dropdown__icon td-dropdown__icon--{tone}" data-td-icon="{icon}" aria-hidden="true"></span>
  <span class="td-dropdown__text">
    <span class="td-dropdown__option-label">{label}</span>
    <span class="td-dropdown__desc" id="{host}-opt-{i}-desc">{description}<span class="td-dropdown__status td-dropdown__status--{tone}">{status.text}</span></span>
  </span>
  <span class="td-dropdown__meta">{meta}</span>
</div>
```

Sự kiện / property mới: `pick` `{ value, item }`, `onPick`, `groups`, `load`, `reload()`. Thuộc tính mới: `mode`, `trigger-icon`, `trigger-meta`, `keep-open`, `search-fields`. Nhãn mới: `labels.resultCount`, `labels.loading`, `labels.loadError`, `labels.retry`, `labels.picked`.

## 4. Tiêu chí nghiệm thu (test của kit)

1. Tương thích ngược: option chỉ có `value` / `label` (+ `disabled`, `swatch`) ra DOM y hệt 0.83.0 (snapshot), mọi test 0.83.0 của `td-dropdown` xanh.
2. R1: `icon` có trong registry → một `span[data-td-icon]` đã được điền SVG; tên lạ → không ô icon + đúng một `console.warn`; `description` / `status` / `meta` hiện đúng, chữ có `<script>` bị escape; không phần tử nào có thuộc tính `style` (trừ hình học menu như hiện nay).
3. R1: menu trộn dòng một nhãn và dòng có mô tả: `max-height="5"` cho đúng 5 dòng nhìn thấy với từng loại; PageDown nhảy đúng.
4. R2: thứ tự nhóm theo `groups`; tìm làm rỗng một nhóm → tiêu đề nhóm ẩn; ↑↓ / Home / End không bao giờ dừng ở tiêu đề; `<select>` có `<optgroup>` → nhóm được giữ.
5. R3: `mode="action"`: chọn bằng chuột, Enter, Space → `pick` đúng một lần với `{ value, item }`, **không** `change`, `FormData` của form chứa host không có khóa `name`, trigger vẫn là placeholder, focus ở trigger; option `disabled` không phát `pick`; `create` vẫn phát như 0.22.0; host `disabled` → không mở được.
6. R3 `keep-open`: chọn 3 mục liền không đóng menu, ô tìm giữ chữ, active chuyển sang dòng kế còn chọn được.
7. R4: gõ chữ có trong `description` / `keywords` (không dấu, hoa thường) tìm ra; `search-fields="label"` trở lại hành vi cũ; vùng status báo đúng số kết quả.
8. R5: `load` gọi đúng một lần cho nhiều lần mở; trạng thái "Đang tải…" có role=status; lỗi → nút "Thử lại" gọi lại `load`; gán `options` khi đang mở giữ chữ tìm + active.
9. R5 hiệu năng: 2000 option R1 + R2: mở menu < 100 ms, gõ một ký tự lọc < 50 ms (đo trong test Playwright của kit, Chromium).
10. R6: axe không lỗi ở menu mở (có nhóm, có dòng tắt, có dòng tạo); trình đọc màn hình (kiểm tay VoiceOver Safari + NVDA Firefox) đọc "nhãn, mô tả, trạng thái", nhóm có tên; dòng tạo nhận được bằng End; trong `td-modal` Escape đóng menu trước, modal sau.
11. Chế độ tối + con trỏ thô: ảnh mốc trực quan cho dòng R1 ở cả sáng / tối.

## 5. Ngoài yêu cầu (dsuite tự làm, kit không cần đổi)

- Icon site (`ds-*`) ở phía JS: dsuite in `Td::siteIcons()` (tập con) dạng JSON rồi gọi `registerIcons()`, đúng hướng dẫn ở `php/td.php:894-896`. Chỉ cần kit giữ `registerIcons` idempotent-an-toàn như hiện nay (đăng ký trùng tên site → throw ở PHP; JS phía dsuite tự lọc bằng `hasIcon`).
- Danh sách sắp kéo thả (`td-sortable`), modal (`td-modal`), thanh thẻ link (`td-tabs`) đủ dùng ở 0.83.0.
