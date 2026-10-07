[Tài liệu](../README.md) › [Components](README.md) › Datetime range

# Khoảng ngày giờ — `<td-datetime-range>`

Chọn một **khoảng** "Từ – Đến" (chỉ ngày hoặc ngày-giờ) trong một hộp thoại, có **chọn nhanh** (Hôm nay · 7 ngày qua ·
30 ngày qua · Tháng này). Dùng cho thanh lọc danh sách / báo cáo / nhật ký, khung giờ khuyến mãi. Form-associated: form
nhận **hai mục** `name[start]` / `name[end]`.

**Vì sao là element riêng, không phải thuộc tính `range` của `<td-datetime-picker>`?** Giá trị là một **cặp**
(`getValue()` → `{ start, end }`), form gửi hai mục thay vì một, và picker đơn đang chạy ở mọi site — một cờ đổi kiểu trả
về sẽ làm hỏng luật / `required` đang có. Hai component dùng chung **một bộ sửa mốc** (ô ngày / tháng / năm + bánh xe giờ /
phút), nên cách gõ, kiểm tra và bàn phím giống hệt [Datetime picker](datetime-picker.md).

**Ngoài phạm vi:** lưới lịch, khoảng theo tháng / năm (`mode="month|year"` → cảnh báo, dùng `date`), preset theo tuần
(tuần bắt đầu thứ mấy — app tự thêm), đồng bộ URL (việc của app).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/datetime-range'` (class: `import { TdDatetimeRange } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | có — hai mục `{name}[start]` / `{name}[end]` (hoặc `start-name` / `end-name`) |
| Từ phiên bản | 0.40.0 (token-native: cần `td.css`) |

## Ví dụ nhanh

```html
<form method="get" action="/nhat-ky">
  <td-datetime-range name="range" label="Thời gian" max-days="92"></td-datetime-range>
  <button type="submit" class="td-btn td-btn--primary">Lọc</button>
</form>

<script type="module">
  import '@dazzxq/td-components/datetime-range';

  document.querySelector('td-datetime-range').addEventListener('change', (e) => {
    console.log(e.detail.value);   // { start: '29/09/2026', end: '05/10/2026' }
    console.log(e.detail.dbValue); // { start: '2026-09-29', end: '2026-10-05' }
    console.log(e.detail.preset);  // 'last7' | null (sửa tay)
  });
</script>
```

Form gửi `range[start]=2026-09-29&range[end]=2026-10-05`. Mốc trống gửi **chuỗi rỗng** (`range[end]=`) — server phân
biệt "không lọc tới ngày nào" với "thiếu field".

Khung giờ khuyến mãi (ngày-giờ, bánh xe phút bước 15):

```html
<td-datetime-range name="promo" label="Khung giờ" mode="datetime" minute-step="15"
                   start="01/10/2026 - 08:00" end="05/10/2026 - 22:00"></td-datetime-range>
```

Giữ tên field cũ của dcms2 (`date_from` / `date_to`):

```html
<td-datetime-range name="filter" start-name="date_from" end-name="date_to"></td-datetime-range>
```

## Hộp thoại

- Mở bằng chuột / chạm, **Enter**, **Space** hoặc **↓** trên trigger (`role="combobox"`, `aria-haspopup="dialog"`).
  Esc / "Đóng" huỷ thay đổi đang sửa.
- Hàng **Chọn nhanh** (`role="group"`): bấm preset **điền cả hai mốc, chưa đóng** — vẫn bấm "Chọn" (một luồng xác nhận
  như picker đơn). Preset đang khớp với khoảng đang sửa có `aria-pressed="true"`; sửa tay một ô thì tự bỏ. Chọn preset
  được đọc qua `role="status"`: "Đã chọn 7 ngày qua: 29/09/2026 – 05/10/2026".
- Hai nhóm `fieldset` có `legend` "Từ" / "Đến". **≥ 720px**: hai nhóm cạnh nhau. **< 720px** (sheet điện thoại): công tắc
  **"Từ | Đến"** (hai nút `aria-pressed`, mỗi nút tóm tắt giá trị của mốc) hiện một nhóm mỗi lần — hai cặp bánh xe giờ
  chồng nhau sẽ quá cao. "Tiếp: Đến" (dưới nhóm Từ) hoặc chạm "Đến" chuyển nhóm và focus vào ô ngày của nhóm.
  **< 480px** và màn ngang thấp (≤ 500px cao): preset một hàng cuộn ngang.
- Footer: **Đóng** · **Xoá** (xoá cả hai mốc, hộp vẫn mở) · **Chọn** (một sự kiện `change`).
- Mốc trống mở **trống** (gõ ngày / tháng / năm, hoặc bấm preset). Có `open-at` (`today` / `min` / `max` / một ngày) →
  mốc trống mở sẵn ở vị trí đó (Từ 00:00, Đến 23:59).

### Kiểm tra

| Lỗi | Khi nào | Ở đâu |
|---|---|---|
| Từng mốc | ngày không có (31/02), thiếu ô, năm ngoài 2000–2099 khi không có `min` / `max`, ngoài `min` / `max` | dòng lỗi của mốc đó (như picker đơn) |
| Thứ tự | Từ > Đến (bằng nhau được; so ở độ chi tiết của `mode`) — "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc" | dòng `role="alert"` của hộp; gắn `aria-describedby` + `aria-invalid` vào ô ngày "Đến" |
| `max-days` | khoảng dài hơn n ngày lịch (tính cả hai đầu: 29/09 – 05/10 = 7) — "Khoảng tối đa {n} ngày" | như trên |
| `required` | bấm "Chọn" khi mốc bắt buộc còn trống — "Vui lòng chọn ngày bắt đầu" / "… kết thúc" / "Vui lòng chọn khoảng ngày" | như trên, trên ô ngày của mốc thiếu |

Còn lỗi → "Chọn" **không đóng**, focus về ô lỗi (trên điện thoại chuyển sang nhóm chứa lỗi trước).

## Preset (callback) và múi giờ

```js
import { TdDatetimeRange } from '@dazzxq/td-components/datetime-range';

// thêm "Quý này" cho cả trang (giữ 4 preset mặc định)
TdDatetimeRange.presets = [...TdDatetimeRange.presets, {
  id: 'quarter', label: 'Quý này',
  resolve: (now) => ({ start: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1), end: now }),
}];

// riêng một ô: chỉ hai preset; [] ẩn cả hàng
el.presets = [TdDatetimeRange.presets[0], TdDatetimeRange.presets[1]];
```

- `resolve(now, { mode })` trả `{ start, end }`: mỗi mốc là `Date` (giờ **địa phương**) **hoặc** chuỗi hiển thị / ISO
  của `mode`. `now` là bản sao — sửa nó không ảnh hưởng gì.
- Mặc định: **Hôm nay**; **7 ngày qua** = hôm nay − 6 … hôm nay; **30 ngày qua** = − 29 … hôm nay; **Tháng này** = ngày 1
  … hôm nay — đều **tính cả hôm nay** (như dcms2). `id`: `today` / `last7` / `last30` / `thisMonth`.
- `mode="datetime"`: mốc đầu 00:00, mốc cuối **23:59** khi `minute-step` = 1, ngược lại ô bước cuối (bước 15 → 23:45).
  **Lọc cả ngày nên dùng `mode="date"`** và để server so `< end + 1 ngày` (không mất các bản ghi 23:59:30).
- Kết quả ngoài `min` / `max` → **kẹp**; không còn gì trong khoảng cho phép → nút preset `aria-disabled`. `resolve` throw
  hoặc trả mốc sai → preset `aria-disabled` + **một** `console.error`.
- `now` = `TdDatetimeRange.now()` (mặc định `new Date()` — đồng hồ của **trình duyệt**, theo giờ địa phương, không bao giờ
  `toISOString()`: lỗi "00:00–07:00 giờ VN ra hôm qua" của dcms2 không xảy ra). Site có giờ server khác giờ máy người
  dùng → ghi đè:

  ```js
  TdDatetimeRange.now = () => new Date(window.SERVER_NOW_MS + (performance.now() - window.PAGE_T0));
  ```

## Thuộc tính

| Thuộc tính | Mặc định | Ý nghĩa |
|---|---|---|
| `name` | — | Tên form → `{name}[start]` / `{name}[end]`. Thiếu `name` và thiếu một trong hai tên ghi đè → **không gửi** + một cảnh báo |
| `start-name`, `end-name` | — | Ghi đè tên từng mục (ví dụ `date_from` / `date_to`) |
| `start`, `end` | — | Giá trị: định dạng hiển thị (`dd/mm/yyyy`, `dd/mm/yyyy - hh:mm`) hoặc ISO (`yyyy-mm-dd`, `yyyy-mm-ddThh:mm`) |
| `mode` | `date` | `date` \| `datetime` (`month` / `year` → `date` + cảnh báo) |
| `label` | — | Nhãn hiện (đặt tên cho trigger); không có → `aria-label` của host → `<label for>` ngoài |
| `placeholder` | `dd/mm/yyyy – dd/mm/yyyy` | Chữ khi cả hai mốc trống |
| `min`, `max` | — | Áp cho **cả hai** mốc, cùng định dạng / nghĩa với picker đơn (`max` chỉ ngày = 23:59) |
| `max-days` | — | Khoảng dài nhất (ngày lịch, tính cả hai đầu) |
| `minute-step` | `1` | Bước bánh xe phút (`datetime`) |
| `form-value-format` | `iso` | `iso` (`yyyy-mm-dd` / `yyyy-mm-ddThh:mm:00`) \| `display` \| `db` (`yyyy-mm-dd hh:mm:00`) |
| `open-at` | — | Mốc trống mở ở đâu: `today` \| `min` \| `max` \| một ngày |
| `required` | — | Bảng dưới |
| `disabled` | tắt | Khoá (cả qua `<fieldset disabled>`) |
| `error-text` | — | Lỗi của app (hợp đồng lỗi chung; `setError()` / `clearError()`) |
| `helper-text` | — | **0.54.0** Gợi ý dưới control (chữ, 1–2 câu): ẩn và rời khỏi mô tả khi có lỗi. Nội dung giàu (link, `<code>`): `<td-hint>` con — xem [Hint](hint.md). Property `helperText`, `setHelper(msg)`, `helperMessage`. |

**`required`** — một hàm dùng chung cho kiểm tra, PHP và SSR:

| Thuộc tính | Mốc bắt buộc |
|---|---|
| không có | không mốc nào (lọc "từ ngày X" mở là hợp lệ) |
| `required` / `required=""` / `"required"` / `"true"` / `"both"` | cả hai |
| `required="start"` | chỉ Từ |
| `required="end"` | chỉ Đến |
| giá trị khác | cả hai (an toàn hơn) + một cảnh báo |

## Property, method, sự kiện

| | |
|---|---|
| `start`, `end` | Phản chiếu thuộc tính (gán = im lặng) |
| `presets` | Preset của **phần tử này** (`[]` ẩn hàng; `null` → `TdDatetimeRange.presets`). Gán trước khi module tải cũng được |
| `getValue()` | `{ start, end }` định dạng hiển thị; `''` cho mốc trống / sai / ngoài `min`–`max` |
| `getDBValue()` | `{ start, end }` định dạng DB (`yyyy-mm-dd` / `yyyy-mm-dd hh:mm:00`) |
| `setValue({ start, end })` | Đặt cả hai (hiển thị hoặc ISO), **im lặng**; mốc thiếu / `''` / `null` = trống; `setValue(null)` xoá cả hai; chuỗi sai được giữ + `badInput` |
| `setDBValue({ start, end })` | Từ định dạng DB; một mốc sai định dạng → bỏ qua cả lần gọi |
| `TdDatetimeRange.labels` / `.messages` | Chữ giao diện / thông báo (tiếng Việt), ghi đè theo site |
| `TdDatetimeRange.presets`, `TdDatetimeRange.now()` | Preset mặc định toàn trang / đồng hồ của preset |
| `validity`, `checkValidity()`, `reportValidity()`, `setCustomValidity()` | Như control native (bong bóng lỗi neo vào trigger) |

| Sự kiện | `detail` | Khi nào |
|---|---|---|
| `change` | `{ value: { start, end }, dbValue: { start, end }, preset: id \| null }` | Bấm "Chọn" (một lần). `preset` = id của preset đang khớp, `null` khi sửa tay |

### Validity

| Cờ | Khi nào |
|---|---|
| `valueMissing` | mốc thuộc `required` còn trống |
| `badInput` | mốc sai định dạng / ngày không có (form gửi nguyên chuỗi, như picker đơn) |
| `rangeUnderflow` / `rangeOverflow` | mốc trước `min` / sau `max` |
| `customError` | Từ > Đến; vượt `max-days`; hoặc `setCustomValidity()` của site |

`form.reset()` → giá trị lúc tải (`start` / `end` ban đầu); bfcache / back của trình duyệt khôi phục cặp giá trị qua
`formStateRestoreCallback` (state JSON `{"v":1,"start","end"}`).

[TdFormValidation](form-validation.md): luật tự viết nhận `getValue()` = **object** `{ start, end }`; `required` đi qua
`validity` của component (không cần cấu hình thêm):

```js
TdFormValidation.attach(form, {
  rules: { range: ({ start, end }) => (start && !end ? 'Chọn cả ngày kết thúc' : '') },
});
```

## Server

Laravel:

```php
$request->validate([
    'range.start' => 'nullable|date',
    'range.end'   => 'nullable|date|after_or_equal:range.start',
]);
$q = Log::query();
if ($s = $request->input('range.start')) $q->where('created_at', '>=', $s);
if ($e = $request->input('range.end'))   $q->where('created_at', '<', Carbon::parse($e)->addDay()); // mode="date": cả ngày cuối
```

PHP thuần (135):

```php
$r = $_GET['range'] ?? [];
$from = is_string($r['start'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $r['start']) ? $r['start'] : null;
$to   = is_string($r['end'] ?? null)   && preg_match('/^\d{4}-\d{2}-\d{2}$/', $r['end'])   ? $r['end']   : null;
if ($from && $to && $from > $to) [$from, $to] = [$to, $from]; // hoặc báo lỗi
// … WHERE created_at >= :from AND created_at < DATE_ADD(:to, INTERVAL 1 DAY)   (prepared statement)
```

Kiểm tra trong trình duyệt **không phải lớp bảo mật**: server luôn kiểm định dạng, thứ tự, `max-days`.

## PHP (SSR)

```php
<?= td_datetime_range('range', $_GET['range']['start'] ?? null, $_GET['range']['end'] ?? null, [
    'label' => 'Thời gian', 'max_days' => 92,
]) ?>
<?= td_datetime_range('promo', $promo->starts_at, $promo->ends_at, ['mode' => 'datetime', 'minute_step' => 15, 'required' => true]) ?>
```

**Không JS:** hai `<input type="date">` (hoặc `datetime-local`) native tên `{name}[start]` / `{name}[end]`, nhãn "Từ" /
"Đến", `min` / `max`, `required` **theo từng mốc** (`'start'` → chỉ input Từ…) — form chạy được, trình duyệt kiểm `required`
đúng từng mốc. **Có JS:** element nhận markup **tại chỗ**: giá trị người dùng đã sửa trong ô native được giữ, FormData còn
đúng một cặp (của host), ô native bị gỡ, focus đang ở ô native chuyển sang trigger. Markup bị sửa (input thừa, `formaction`,
`required` lệch mốc…) → render an toàn, chỉ giữ giá trị sống khi mỗi mốc có **đúng một** ô. Chi tiết tuỳ chọn:
[PHP adapter › td_datetime_range](../guides/php-adapter.md#td_datetime_range-0400).

**Trước khi JS tải (0.51.1, [ADR 0025](../internal/decisions/0025-pre-upgrade-parity.md)):** khi trình duyệt chạy JS
(`@media (scripting: enabled)`), hai ô native nằm trong **một hộp field giống trigger đóng** (viền, bo góc, cao, padding,
vòng focus khi một ô đang focus, nền / chữ disabled khi host `disabled`, forced colors = màu hệ thống + viền Highlight),
"Từ" chỉ còn là tên cho trình đọc màn hình, "Đến" hiện thành dấu "–" → nâng cấp không xô lệch. **Khác biệt chấp nhận:**
chữ ngày trong hộp là định dạng của trình duyệt (và icon lịch của nó), không phải chuỗi `01/10/2026 – 05/10/2026` của
trigger. **Ngoại lệ:** `mode="datetime"` trong container hẹp — hai ô `datetime-local` bị co (chữ có thể bị cắt) trong ~1 s
trước nâng cấp; lệch hộp nếu có được ghi lại, không bảo đảm ≤ 1 px. Tắt JS: hai ô hai dòng có nhãn như trên.

## Kết hợp với bộ lọc bảng (v0.39.0)

Dùng API của 0.39.0: `td-table` `setFilters()` / `request-change` ([table.md § 11](table.md#11-bộ-lọc-ngoài--url-request-change-controlled--từ-0390))
và [`<td-filter-chips>`](filter-chips.md). Khoảng ngày là một ô của thanh lọc; chip "Ngày: 29/09 – 05/10":

```js
range.addEventListener('change', (e) => {
  const { start, end } = e.detail.dbValue;
  table.setFilters({ ...table.getState().filters, from: start || null, to: end || null });
  chips.items = [...chips.items.filter((c) => c.key !== 'date'),
    ...(start || end ? [{ key: 'date', label: 'Ngày', value: `${e.detail.value.start || '…'} – ${e.detail.value.end || '…'}` }] : [])];
});
chips.addEventListener('filter-remove', (e) => {
  if (e.detail.item.key === 'date') { range.setValue(null); table.setFilters({ ...table.getState().filters, from: null, to: null }); }
});
```

## Tuỳ biến

Token (`:root` hoặc trên từng host): `--td-dtr-preset-h` (chiều cao chip preset, 44px trên cảm ứng),
`--td-dtr-preset-bg` / `-fg` / `-border` / `-hover-bg`, `--td-dtr-preset-on-bg` / `-on-fg` (preset đang khớp = màu nút
primary) / `-on-pressed`, `--td-dtr-switch-bg` (nền công tắc "Từ | Đến"), `--td-dtr-tab-on-bg`, `--td-dtr-tab-fg`,
`--td-dtr-tab-note`. Trigger và ô nhập dùng chung `--td-field-*`; bánh xe dùng `--td-dtp-*` của picker đơn. Chữ preset /
công tắc / dòng lỗi qua gate `test:contrast` ≥ 4.7. Host co tới 160px: chữ trigger bị cắt `…` có `title` đầy đủ.

## Cấu trúc DOM

```html
<td-datetime-range id="{id}">
  <div class="td-dtr" data-state="closed|open">
    <span class="td-field__label td-dtr__label" id="{id}-label">{label}[<span class="td-field__required" aria-hidden="true"> *</span>]</span>
    <button type="button" class="td-dtr__trigger" id="{id}-trigger" role="combobox" aria-haspopup="dialog"
            aria-expanded="false" aria-labelledby="{id}-label" [aria-required="true"]>
      <span class="td-dtr__value" [data-placeholder]>29/09/2026 – 05/10/2026 | Từ … | Đến … | placeholder</span>
      <span class="td-dtr__icon" data-td-icon="calendar" aria-hidden="true"></span>
    </button>
  </div>
  [<span class="td-field-error" id="{id}-error" data-for="{id}">…</span>]
</td-datetime-range>
```

Hộp thoại (thân TdModal): `div.td-dtr-panel[data-mode][data-side]` > `div.td-dtr-panel__presets[role=group]` >
`button.td-dtr-panel__preset[aria-pressed][data-id]` · `div.td-dtr-panel__switch` > `button.td-dtr-panel__tab[aria-pressed]`
× 2 · `div.td-dtr-panel__sides` > `fieldset.td-dtr-panel__side[data-side]` (legend + bộ sửa `.td-dtp-panel` của picker
đơn) × 2 · `p.td-dtr-panel__error[role=alert]` · `p.td-sr-only[role=status]`.

## Bảo mật

Nhãn preset, thông báo, giá trị đều là **chữ** (`textContent`), không có đường HTML. Giá trị form là input người dùng —
server kiểm lại. Markup SSR đi qua cổng riêng của component (cấu trúc + thuộc tính so khớp chặt, đúng hai ô native + một
trigger; lệch → render an toàn) — xem [security model](../internal/security-model.md).
