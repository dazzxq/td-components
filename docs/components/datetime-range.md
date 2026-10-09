[Tài liệu](../README.md) › [Components](README.md) › Datetime range

# Khoảng ngày giờ — `<td-datetime-range>`

Chọn một **khoảng** "Từ – Đến" (chỉ ngày hoặc ngày-giờ) trong một hộp thoại, có **chọn nhanh** (Hôm nay · 7 ngày qua ·
30 ngày qua · Tháng này). Dùng cho thanh lọc danh sách / báo cáo / nhật ký, khung giờ khuyến mãi. Form-associated: form
nhận **hai mục** `name[start]` / `name[end]`.

**Vì sao là element riêng, không phải thuộc tính `range` của `<td-datetime-picker>`?** Giá trị là một **cặp**
(`getValue()` → `{ start, end }`), form gửi hai mục thay vì một, và picker đơn đang chạy ở mọi site — một cờ đổi kiểu trả
về sẽ làm hỏng luật / `required` đang có. **Từ 0.61.0 hộp thoại dùng đúng lịch của [Datetime picker](datetime-picker.md)**:
**một lưới** cho cả hai mốc (bấm 1 = Từ, bấm 2 = Đến, tô khoảng; ngày thứ hai sớm hơn = bắt đầu khoảng mới), không còn ô gõ
ngày / tháng / năm. `mode="datetime"` là **hai màn** cho mỗi mốc: màn ngày (lịch) → bấm ngày → màn giờ (bánh xe).

**Ngoài phạm vi:** hai tháng cạnh nhau, khoảng theo tháng / năm (`mode="month|year"` → cảnh báo, dùng `date`), preset theo tuần
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
  Esc / "Đóng" huỷ thay đổi đang sửa. ≥ 720px: hộp giữa màn hình (cột **Chọn nhanh** bên trái); < 720px: bottom sheet.
- Hàng **Chọn nhanh** (`role="group"`): bấm preset **điền cả hai mốc, chưa đóng** — vẫn bấm "Chọn" (một luồng xác nhận
  như picker đơn). Preset đang khớp với khoảng đang sửa có `aria-pressed="true"`; chọn lại ngày thì tự bỏ. Chọn preset
  được đọc qua `role="status"`: "Đã chọn 7 ngày qua: 29/09/2026 – 05/10/2026".
- Công tắc **"Từ | Đến"** (hai nút `aria-pressed`, mỗi nút tóm tắt giá trị của mốc) ở **mọi** bề rộng: mốc nào đang được sửa.
- **`mode="date"`: MỘT lưới.** Bấm ngày đầu = **Từ**, bấm ngày thứ hai = **Đến** (cùng ngày = khoảng một ngày) và tô khoảng
  (ô đầu / cuối `aria-selected`, ô giữa "…, trong khoảng"). Bấm ngày thứ hai **sớm hơn** Từ → bắt đầu một khoảng mới (không
  báo lỗi). Di chuột / di focus bàn phím trên ô sau Từ → xem trước khoảng. Bấm tab "Đến" trước → chỉ chọn ngày kết thúc.
  `max-days`: ô vượt giới hạn **mờ nhưng vẫn bấm được** (bấm = bắt đầu khoảng mới), ghi chú "Tối đa N ngày".
- **`mode="datetime"`: hai màn cho mỗi mốc** (0.61.0). Màn 1 = lịch; **bấm một ngày không ghi giá trị** mà chuyển sang màn 2 =
  giờ của mốc đó (tiêu đề "Từ · Thứ Năm, 15/10/2026", nút **"‹"** / phím **Backspace** quay lại, bánh xe giờ / phút theo
  `minute-step`, "Bây giờ" đặt mốc đó = hiện tại và ở lại màn giờ). Luồng chuẩn: Từ (ngày → giờ) → **"Tiếp: Đến"** → Đến (ngày →
  giờ) → **"Chọn"**. Công tắc "Từ | Đến" nhảy mốc và giữ loại màn nếu mốc đích đã có ngày. Preset → màn giờ của Từ.
- Footer: **Đóng** · **Xoá** (xoá cả hai mốc, hộp vẫn mở) · **Chọn** (một sự kiện `change`). Ở `datetime`, **"Chọn" chỉ có ở màn
  giờ** — ngoại lệ duy nhất: khi bản nháp **hoàn toàn rỗng** (sau "Xoá") "Chọn" hiện ngay ở màn ngày và ghi khoảng rỗng
  (bỏ bộ lọc). Chọn một ngày thì luật chung trở lại.
- Mốc trống mở **trống**. Có `open-at` (`today` / `min` / `max` / một ngày) → lịch mở ở tháng đó (Từ 00:00, Đến 23:59).
  Giá trị có sẵn: mở ở **màn ngày**, ngày của mốc Từ có focus (bấm Enter trên ngày = sang màn giờ).
- Chạm (ADR 0019): ô ≥ 44px, bánh xe vuốt có quán tính + khớp giá trị (`touch-action: pan-y`, không dây chuyền cuộn ra trang),
  nút "‹" / "Bây giờ" / "Chọn" ≥ 44px, không có ô nhập nên bàn phím ảo không mở. Mỗi màn vừa màn hình không cuộn trên điện
  thoại; riêng hộp range ở 320 × 568 với preset + "Không hạn" + dòng lỗi có thể cuộn bằng **một** vùng (thân hộp), chân
  hộp (Đóng / Xoá / Chọn) luôn thấy.
- Bàn phím trên lưới: APG (← → ↑ ↓, Home / End, PageUp / PageDown, Shift+PageUp / PageDown; Enter / Space chọn). Màn giờ: ↑ ↓
  ±1, PageUp / PageDown ±6 giờ / ±15 phút, Home / End; Backspace = về màn ngày; Esc đóng hộp.

### Kiểm tra

| Lỗi | Khi nào | Ở đâu |
|---|---|---|
| Từng mốc | ngày không đọc được, ngoài `min` / `max` (0.61.0: lịch không cho chọn ngày không có; giá trị gán qua attribute vẫn được kiểm; không có `min` / `max` thì năm 1–9999 đều hợp lệ) | dòng lỗi của hộp, gắn `aria-describedby` vào tab của mốc đó |
| Thứ tự | Từ > Đến (bằng nhau được; so ở độ chi tiết của `mode`) — "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc". `mode="date"` chọn bằng lưới không bao giờ gây lỗi này (ngày sớm hơn = khoảng mới); còn ở `datetime` (giờ cùng ngày) và giá trị gán qua attribute | dòng `role="alert"` của hộp; `aria-describedby` vào tab "Đến" |
| `max-days` | khoảng dài hơn n ngày lịch (tính cả hai đầu: 29/09 – 05/10 = 7) — "Khoảng tối đa {n} ngày"; `datetime`, preset và giá trị gán qua attribute (lưới `date` làm mờ ô vượt thay vì báo lỗi) | như trên |
| `required` | bấm "Chọn" khi mốc bắt buộc còn trống — "Vui lòng chọn ngày bắt đầu" / "… kết thúc" / "Vui lòng chọn khoảng ngày" | như trên, trên tab của mốc thiếu |

Còn lỗi → "Chọn" **không đóng**, hộp chuyển sang mốc (và màn — ngày hoặc giờ) chứa lỗi và focus vào **tab của mốc đó**.

### Không hạn (`allow-open-end`, 0.59.0)

Hiệu lực khuyến mãi, hợp đồng, bảo hành… thường "từ ngày X, **không hạn**". Bật `allow-open-end`:

```html
<td-datetime-range name="hl" label="Hiệu lực" start="01/10/2026" required allow-open-end></td-datetime-range>
```

- Ngày kết thúc trống hiện là **"Không hạn"**: trigger "01/10/2026 – Không hạn", tab "Đến" ghi "Không hạn".
- Cạnh công tắc "Từ | Đến" có nút **"Không hạn"** (kiểu nút preset, `aria-pressed`): đang nhấn khi ngày kết thúc đang sửa trống.
  Bấm → xoá ngày kết thúc (`datetime`: hộp sang **màn giờ của Từ** để "Chọn" ngay); đang nhấn mà bấm → sang lịch của "Đến" để
  chọn ngày. Chọn ngày "Đến" / preset → tự bỏ nhấn.
- **Ngày kết thúc không bao giờ bắt buộc**: `required` / `both` → chỉ bắt buộc Từ (im lặng); `required="end"` mâu thuẫn →
  một cảnh báo, không mốc nào bắt buộc.
- Giá trị, FormData, `change` **không đổi**: end trống gửi `hl[end]=` (chuỗi rỗng) như trước; server hiểu rỗng = không hạn.
- Bật / tắt lúc chạy: tại chỗ (chữ trigger, `aria-required` / dấu `*`, validity — không phát `change`). Hộp thoại đang mở:
  nút được thêm / gỡ tại chỗ; gỡ nút đang có focus → focus vào lưới; ngày đang sửa giữ nguyên.
- Nhãn: `TdDatetimeRange.labels.openEnd` (`'Không hạn'`; PHP `Td::RANGE_LABELS['openEnd']` phải đổi cùng).

## Gõ tay (`editable`, 0.63.0)

Bộ lọc "Chụp từ / Chụp đến" cho cuộn phim thập niên 1990: gõ nhanh hơn đi qua lưới năm. `editable` biến ô thành **hai ô
gõ (Từ – Đến) + nút lịch**; hộp thoại y như trên. **Opt-in** — không đặt → giống hệt 0.62:

```html
<td-datetime-range name="chup" mode="date" label="Chụp" editable></td-datetime-range>
```

- **Chỉ máy tính gõ được**; thiết bị cảm ứng (`(hover: none) and (pointer: coarse)`, theo dõi trực tiếp): hai ô `readonly` +
  `inputmode="none"`, chạm = mở hộp thoại như 0.62, không bàn phím ảo.
- **Đọc chữ gõ** như picker đơn ([bảng](datetime-picker.md#11-gõ-tay-editable-0630)): `20031994`, `20/3/1994`, `20.3.1994`,
  `1994-03-20` → `20/03/1994`; `datetime` thêm giờ `8:30` / `0830` (thiếu giờ → lỗi "Vui lòng nhập đầy đủ…"); năm luôn 4 chữ số.
- **Mỗi ô chốt bên của nó** — `Enter` (không chặn: form submit ngầm thấy giá trị mới), rời ô, trước khi hộp thoại mở; chữ không
  đổi → không làm gì. Bên đó được ghi như bảng của picker (rỗng → xoá; hợp lệ → dạng chuẩn; ngoài `min` / `max` → ghi, không
  kẹp; không đọc được / ngày không có → chữ thô, `badInput`).
- **`change`** (detail như "Chọn", `preset: null`): **một** event sau mỗi lần chốt mà **cả khoảng** hợp lệ hoàn toàn (validity
  sạch: `required` theo bảng, thứ tự, `max-days`, `min` / `max`, `badInput`, cả `setCustomValidity()` của site) và **khác** khoảng trước. Không gom hai bên —
  giống hai ô native:

| Kịch bản (không `required`, đếm `change` trên host) | Sau đó | Đếm |
|---|---|---|
| ban đầu `start=""` `end=""` | — | 0 |
| gõ Từ `20/03/1994`, rời ô | khoảng mở hợp lệ: `{ start: '20/03/1994', end: '' }` | 1 |
| gõ Đến `10/03/1994`, rời ô | lỗi thứ tự hiện ở **ô Đến** | 1 |
| sửa Đến `25/03/1994` | `{ start: '20/03/1994', end: '25/03/1994' }` | 2 |
| cùng kịch bản với `required` (cả hai) | Từ một mình thiếu Đến → chưa hợp lệ | 0, 0, 1 |

  `allow-open-end`: Đến trống là hợp lệ (placeholder ô Đến = "Không hạn"). Vượt `max-days` → "Khoảng tối đa N ngày", 0 `change`.
- **Lỗi gõ** hiện dưới ô (ghi chú `.td-field-error`), `aria-invalid` chỉ trên **ô đang sai**: lỗi riêng của bên vừa chốt (định
  dạng / ngày không có / `min` / `max` / bắt buộc của bên đó khi xoá trắng), nếu không thì lỗi thứ tự / `max-days` gắn vào **bên
  vừa chốt**, nếu không thì lỗi riêng còn lại của bên kia. Lỗi của site (`error-text` / `setError()`) **thắng**. Lỗi gõ mất khi
  khoảng hợp lệ, "Chọn" trong hộp thoại, `setValue()` / `setDBValue()` / attribute `start` / `end` đổi từ ngoài, reset, tắt
  `editable`. Đổi `min` / `max` / `max-days` / `required` / `allow-open-end` / `mode` khi đang có lỗi gõ → tính lại (message, ô
  sai) theo trạng thái mới, hoặc mất. Message dùng lại `TdDatetimeRange.messages`. Hộp thoại mở từ một mốc sai định dạng
  (`31/02/1994`) coi mốc đó như trống (mở ở mốc kia / `open-at` / hôm nay).
- `Escape`: trả chữ của ô về giá trị đã chốt. `ArrowDown` / `Alt+ArrowDown` trên ô hoặc nút lịch → chốt rồi mở hộp thoại ở
  khoảng vừa gõ; đóng hộp → focus về **ô gõ**: ô đã mở nó (`ArrowDown`), mở từ nút lịch → ô có focus gần nhất (mặc định ô Từ).
- `input` / `change` gốc của hai ô **không lọt ra** host; ô không có `name` — FormData vẫn hai mục của host như trước.
- Nhãn mới (đổi được): `TdDatetimeRange.labels.openCalendar` 'Mở lịch' (tên nút), `startInput` / `endInput` 'Từ ngày' / 'Đến
  ngày' (tên ẩn của hai ô; `datetime`: `startInputDatetime` / `endInputDatetime` 'Từ' / 'Đến'), `sidePlaceholder` 'dd/mm/yyyy'
  / `sidePlaceholderDatetime` 'dd/mm/yyyy - hh:mm' (placeholder từng ô; attribute `placeholder` của host không dùng ở chế độ này).
- **PHP**: `td_datetime_range('chup', $from, $to, ['editable' => true])` chỉ in attribute `editable` trên host; markup SSR (hai
  ô native + trigger) không đổi — element không nhận markup đó (khác cấu trúc) mà render an toàn, **giữ giá trị native** người
  dùng đã sửa trước khi JS chạy.
- **Selector cho test**: `.td-dtr--editable`, `.td-dtr__input[data-side="start|end"]`, `.td-dtr__sep`, `.td-dtr__trigger` (mở hộp
  thoại như 0.62), `.td-dtr__trigger--icon`. Ví dụ: `page.fill('#chup .td-dtr__input[data-side="start"]', '20031994')` rồi
  `press('Tab')`.

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
| `allow-open-end` | tắt | **0.59.0** Ngày kết thúc có thể trống = "Không hạn" (không bao giờ bắt buộc) — [Không hạn](#không-hạn-allow-open-end-0590). Property `allowOpenEnd`. |
| `editable` | tắt | **0.63.0** Gõ hai mốc bằng tay trên máy tính (cảm ứng vẫn chạm để mở) — [Gõ tay](#gõ-tay-editable-0630). Bật / tắt lúc chạy → render lại phần ô. Property `editable`. |
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

Có `allow-open-end` (0.59.0): bỏ "Đến" khỏi bảng trên (cả hai → chỉ Từ; `"end"` → không mốc nào + một cảnh báo).

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
| `change` | `{ value: { start, end }, dbValue: { start, end }, preset: id \| null }` | Bấm "Chọn" (một lần). `preset` = id của preset đang khớp, `null` khi sửa tay. 0.63.0 `editable`: chốt một ô gõ khi cả khoảng hợp lệ và khác trước (`preset: null`) |

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
<?= td_datetime_range('hl', $contract->starts_on, $contract->ends_on, ['label' => 'Hiệu lực', 'required' => true, 'allow_open_end' => true]) ?>
```

0.59.0 `allow_open_end`: host `allow-open-end`, ô native "Đến" không bao giờ `required`, chỉ có Từ → trigger "{Từ} – Không hạn".
0.63.0 `editable`: host `editable` (gõ tay — [Gõ tay](#gõ-tay-editable-0630)); markup SSR không đổi, element render an toàn
(giữ giá trị native).

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
`--td-dtr-tab-note`. Trigger và ô nhập dùng chung `--td-field-*`; bánh xe dùng `--td-dtp-*` của picker đơn (`.td-dtp-wheel*`, dùng chung). Chữ preset /
công tắc / dòng lỗi qua gate `test:contrast` ≥ 4.7. Host co tới 160px: chữ trigger bị cắt `…` có `title` đầy đủ.

## Cấu trúc DOM

```html
<td-datetime-range id="{id}">
  <div class="td-dtr" data-state="closed|open">
    <span class="td-field__label td-dtr__label" id="{id}-label">{label}[<span class="td-field__required" aria-hidden="true"> *</span>]</span>
    <button type="button" class="td-dtr__trigger" id="{id}-trigger" role="combobox" aria-haspopup="dialog"
            aria-expanded="false" aria-labelledby="{id}-label" [aria-required="true"]>
      <span class="td-dtr__value" [data-placeholder]>29/09/2026 – 05/10/2026 | Từ … | Đến … | … – Không hạn (0.59.0) | placeholder</span>
      <span class="td-dtr__icon" data-td-icon="calendar" aria-hidden="true"></span>
    </button>
  </div>
  [<span class="td-field-error" id="{id}-error" data-for="{id}">…</span>]
</td-datetime-range>
```

0.63.0 `editable` (cảm ứng: hai ô `readonly inputmode="none"`):

```html
<div class="td-dtr td-dtr--editable" data-state="closed|open">
  [<span class="td-field__label td-dtr__label" id="{id}-label">…</span>]
  <span id="{id}-start-name" hidden>Từ ngày</span>
  <input type="text" class="td-dtr__input" data-side="start" id="{id}-start-input" aria-labelledby="{id}-label {id}-start-name"
         autocomplete="off" spellcheck="false" placeholder="dd/mm/yyyy" [aria-required] [aria-invalid] [disabled]>
  <span class="td-dtr__sep" aria-hidden="true">–</span>
  <span id="{id}-end-name" hidden>Đến ngày</span>
  <input type="text" class="td-dtr__input" data-side="end" id="{id}-end-input" … placeholder="dd/mm/yyyy | Không hạn">
  <button type="button" class="td-dtr__trigger td-dtr__trigger--icon" id="{id}-trigger" aria-label="Mở lịch" aria-haspopup="dialog"
          aria-expanded="false"><span class="td-dtr__icon" data-td-icon="calendar" aria-hidden="true"></span></button>
</div>
```

Hộp vẽ bằng `::before` của `.td-dtr--editable` (cùng hình trigger 0.62), trạng thái: `:focus-within` (vòng focus), mở, lỗi trên
một ô (viền đỏ), disabled; tương phản cao: viền `CanvasText`, focus `Highlight`, lỗi gạch đứt.

Hộp thoại (thân TdModal): `div.td-dtr-panel[data-mode][data-side][data-step=date|time]` > `div.td-dtr-panel__presets[role=group]` >
`button.td-dtr-panel__preset[aria-pressed][data-id]` · `div.td-dtr-panel__main` > (`div.td-dtr-panel__switch` > `button.td-dtr-panel__tab[aria-pressed][data-side]`
× 2 · [`button.td-dtr-panel__preset.td-dtr-panel__open-end[aria-pressed]` "Không hạn", 0.59.0] · `div.td-cal` (lưới; ô ngày có
`data-date`, `data-range=start|end|single|in`, `data-preview`, `data-dimmed`) · [datetime: `div.td-time-step[hidden]` > `button.td-cal__nav.td-time-step__back[data-action=back]`
+ `p.td-time-step__heading` + bánh xe (`.td-dtp-wheel__list[data-part=hour|minute]`) + `button[data-action=now]`; và `button.td-dtr-panel__next[data-action=next]`]) ·
`p.td-dtr-panel__hint` · `p.td-dtr-panel__error[role=alert]` · `p.td-sr-only[role=status]`. Chân modal: `button[data-action=close|clear|confirm]`.

### Test tự động (hợp đồng selector)

Ổn định: `.td-cal [data-date]`, `data-range`, `[data-pick]` / `[data-dir]`, `.td-dtr-panel[data-step]`, `.td-dtr-panel__tab[data-side]`,
`.td-dtr-panel__preset[data-id]`, `.td-dtr-panel__open-end`, `[data-action="close|clear|confirm|next|now|back"]`. Đã **gỡ** từ 0.61.0:
`.td-dtp-panel*`, `.td-dtr-panel__side|sides|legend`, `[data-part="day|month|year"]` trong hộp. Để chọn khoảng: bấm hai `[data-date]`
rồi `[data-action="confirm"]`; ở `datetime`: ngày → (màn giờ) → … → `[data-action="confirm"]` (ẩn ở màn ngày khi bản nháp không rỗng).

## Bảo mật

Nhãn preset, thông báo, giá trị đều là **chữ** (`textContent`), không có đường HTML. Giá trị form là input người dùng —
server kiểm lại. Markup SSR đi qua cổng riêng của component (cấu trúc + thuộc tính so khớp chặt, đúng hai ô native + một
trigger; lệch → render an toàn) — xem [security model](../internal/security-model.md).
