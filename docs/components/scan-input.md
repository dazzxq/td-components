[Tài liệu](../README.md) › [Components](README.md) › Scan input

# Ô quét mã vạch — `<td-scan-input>`

Ô nhập tối ưu cho **máy quét mã vạch kiểu bàn phím** (HID keyboard-wedge: USB / Bluetooth, máy Android công nghiệp cấu
hình gửi từng ký tự). Máy quét "gõ" rất nhanh rồi nhấn Enter — component nhận ra đó là **một lần quét**, phân biệt với
người gõ tay, chống quét trùng, gọi hàm kiểm tra của app (`validate`), có âm báo tuỳ chọn và hai chế độ: **một mã** (mã
đơn hàng) hoặc **nhiều mã** (nhập kho từng máy theo IMEI / serial, gửi form `imei[]`). Form-associated.

Kit **không biết IMEI / EAN là gì**: kiểm Luhn, kiểm trùng trong phiếu, kiểm tồn tại trên server là việc của app qua
`validate`. **Ngoài phạm vi:** quét bằng camera điện thoại, bắt phím toàn trang khi ô không focus, phân tích GS1
(`(01)…(21)`), lưu trạng thái tắt tiếng.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/scan-input'` (class: `import { TdScanInput } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | có (đơn: một mục; nhiều: một mục mỗi mã hợp lệ) |
| Từ phiên bản | 0.38.0 (token-native: cần `td.css`) |

## Ví dụ nhanh

```html
<!-- một mã: mã đơn hàng -->
<td-scan-input name="order" label="Mã đơn hàng" required></td-scan-input>

<!-- nhiều mã: nhập kho theo IMEI -->
<form method="post" action="/kho/nhap">
  <td-scan-input id="imei" name="imei[]" label="IMEI nhập kho" multiple inputmode="numeric" max="50" beep></td-scan-input>
  <button type="submit" class="td-btn td-btn--primary">Lưu phiếu</button>
</form>

<script type="module">
  import '@dazzxq/td-components/scan-input';

  const el = document.getElementById('imei');
  el.validate = async (value, { signal }) => {
    if (!luhnImei(value)) return 'IMEI không hợp lệ';            // chuỗi = thông báo lỗi
    const r = await fetch(`/api/imei/${encodeURIComponent(value)}`, { signal });
    if (!r.ok) throw new Error('server');                         // → "Không kiểm tra được mã…"
    const { exists } = await r.json();
    return exists ? 'Máy này đã nhập kho' : true;
  };
  el.addEventListener('scan', (e) => console.log('đã nhận', e.detail.value, e.detail.source));
</script>
```

Form gửi `imei[]=356938035643809&imei[]=490154203237518…` — chỉ các mã **hợp lệ**; mã đang kiểm tra hoặc lỗi không gửi.

## Máy quét hoạt động thế nào

Máy quét kiểu bàn phím gửi mã như một chuỗi phím rất nhanh, rồi một **hậu tố** (thường là Enter). Cấu hình máy quét:

- **Hậu tố Enter** (mặc định của hầu hết máy) — hoặc Tab, đặt `terminator="tab"`; máy không gửi hậu tố → `terminator="none"`.
- Máy Android công nghiệp (Zebra DataWedge, Honeywell…): bật **gửi từng phím** ("Keystroke output", không "send as
  string"). Máy / bộ gõ gửi **cả chuỗi trong một lần** vẫn dùng được nhưng **không phân biệt được với dán** (xem dưới).
- Ô phải đang **focus** (kit không bắt phím toàn trang). Chỉ báo cạnh ô: "Sẵn sàng quét" khi focus, "Bấm vào đây để quét"
  khi không — bấm vào chỉ báo để focus.

### Phân loại một lần quét (`source`)

Mỗi lần kết thúc (Enter / Tab / im lặng) được gắn `source`:

| `source` | Khi nào |
|---|---|
| `scanner` | ≥ `min-length` ký tự (mặc định 4), **trung bình** khoảng cách giữa các ký tự ≤ `key-interval` (mặc định 40 ms, phạm vi 5–500) và **không** khoảng nào > 4 × `key-interval` |
| `manual` | còn lại (gõ tay, sửa bằng Backspace, sau một lần dùng bộ gõ IME). Gõ dở rồi bóp cò (khoảng > 4 × `key-interval` trước một chuỗi nhanh) → `manual` + `mixed: true` |
| `paste` | dán / kéo thả, hoặc **một lần chèn nhiều ký tự** chiếm ≥ 50 % mã (IME / "send as string" / tự điền) — một sự kiện chỉ có một dấu thời gian nên **không bao giờ** là `scanner` |

Nhịp đo trên sự kiện `beforeinput` (không dựa vào `keydown.key` — Android trả keyCode 229). Máy Bluetooth chậm (mỗi ký
tự 40–80 ms) → tăng `key-interval="80"`. Người gõ tay **được phép** mặc định (máy hỏng, tem mờ); `manual="reject"` → từ
chối gõ tay / dán, hiện "Vui lòng dùng máy quét".

- **Enter không bao giờ submit form ngầm** (luôn bị chặn trong ô). Tab chỉ bị chặn khi nó là hậu tố **và** chuỗi vừa gõ
  là nhịp máy — Tab của người vẫn rời ô bình thường.
- Giá trị được **chuẩn hoá**: bỏ ký tự điều khiển C0 / C1 (kể cả ký tự phân tách GS1 `\x1D` — GS1 ngoài phạm vi), bỏ
  khoảng trắng đầu / cuối, cắt ở `maxlength` (mặc định 128, đếm code point). Rỗng sau chuẩn hoá → bỏ qua im lặng.

### Bộ gõ tiếng Việt

Bộ gõ chạy trên hệ điều hành (Unikey / EVKey kiểu Telex) có thể **biến đổi chữ** do máy quét gửi (`dd` → `đ`) — web không
chặn được. **Tắt bộ gõ trên máy nhập kho.** Mã chỉ có chữ số (IMEI) không bị ảnh hưởng. Trong lúc đang ghép chữ (IME
composition), Enter xác nhận chữ của bộ gõ **không** là hậu tố quét; chuỗi sau đó tính là `manual`. Máy có đầu quét tích
hợp: đặt `inputmode="none"` để không bật bàn phím ảo.

## Kiểm tra (`validate`) và chống trùng

```js
el.validate = (value, { source, signal }) => true | false | 'thông báo lỗi' | { valid, message, value } | Promise<…>;
```

- `true` / `{ valid: true }` hợp lệ; `false` → "Mã không hợp lệ."; **chuỗi = thông báo lỗi** (hiện dưới dạng chữ, cắt 300
  ký tự); `{ valid: true, value: 'X' }` thay giá trị đã chuẩn hoá (ví dụ mã rút gọn → mã chuẩn). Giá trị khác (`undefined`,
  số…) → không hợp lệ.
- Throw / Promise reject → "Không kiểm tra được mã, vui lòng quét lại." + **một** `console.error` với chữ cố định — kit
  không bao giờ log lỗi gốc (có thể chứa chữ của server, token, dữ liệu cá nhân); app tự `try / catch` trong `validate`
  và log chẩn đoán đã lược bỏ thông tin nhạy cảm. Quá `validate-timeout` ms
  (mặc định 10 000, `0` = không giới hạn) → `signal` bị abort + "Kiểm tra mã quá lâu…".
- Các lần kiểm tra chạy **song song** (máy quét nhanh hơn server), kết quả **áp theo thứ tự quét** — danh sách, sự kiện,
  âm báo luôn đúng thứ tự. Tối đa 16 lần đang chờ; thêm nữa → "Đang kiểm tra quá nhiều mã, vui lòng chờ."
- Đang có mã chờ kiểm tra → form **không submit được** (`customError` "Đang kiểm tra mã…").
- `reset()`, `form.reset()`, gán `value` / `values`, `clear()`, gỡ phần tử khỏi trang → mọi kết quả đang chờ **bị bỏ**
  (kể cả khi `validate` phớt lờ `signal`). Di chuyển phần tử trong DOM cũng vậy — quét lại.
- **Chống quét trùng liên tiếp:** cùng mã với lần quét được nhận / đang chờ gần nhất trong `dedupe-window` ms (mặc định
  1500, `0` = tắt) → không gọi `validate`, phát `scan-duplicate`, báo "Đã quét mã này". Trùng **không liền kề** (đã có
  trong phiếu từ trước) là việc của app — trừ chế độ `multiple`, nơi kit tự từ chối mã đã có trong danh sách ("Mã đã có
  trong danh sách") hoặc đang chờ kiểm tra ("Mã đang được kiểm tra").

Ví dụ Luhn IMEI (phía **app**, không có trong kit):

```js
function luhnImei(v) {
  if (!/^\d{15}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(v[14 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}
```

## Hai chế độ

**Đơn (mặc định).** Mã hợp lệ **ở lại trong ô và được bôi đen** — lần quét kế ghi đè. Giá trị form = mã hợp lệ cuối cùng
(chữ đang gõ dở chưa kết thúc **không** được gửi). Mã lỗi: ô giữ chữ, viền đỏ + dòng lỗi dưới ô, giá trị form giữ mã hợp
lệ trước đó, form bị chặn submit tới lần quét hợp lệ kế tiếp. Kết quả của một lần quét **cũ hơn** (đang chờ `validate`) về
sau không bao giờ xoá / thay lỗi của lần quét **mới hơn** — form vẫn bị chặn tới khi một lần quét mới hơn hợp lệ, hoặc
`clear()` / `reset()`. Kết quả cũ đó vẫn phát sự kiện (`scan` / `scan-invalid`) cho app và cập nhật dòng của nó, nhưng
**không** đọc qua trình đọc màn hình và **không** phát âm báo (tránh mâu thuẫn với phản hồi của lần quét mới hơn).

**Nhiều (`multiple`).** Ô **xoá trắng** sau mỗi lần quét; mỗi lần quét thành một dòng (mới nhất ở trên): mã (chữ đơn cách)
+ trạng thái (đang kiểm tra / hợp lệ / lỗi kèm thông báo) + nút "Bỏ". Đầu danh sách: "Đã quét: n" + "Xoá tất cả" (hỏi lại
khi ≥ 5 mã). Dòng lỗi không gửi form; giữ tối đa 20 dòng lỗi mới nhất. `max` = số mã hợp lệ tối đa — **tính cả mã đang
chờ** (quét thêm khi đã đủ → "Đã đủ {max} mã"). Trần cứng **1000** mã (hợp lệ + đang chờ) kể cả khi không đặt `max`;
`max` lớn hơn bị kẹp về 1000. `readonly`: không quét được, nút "Bỏ" / "Xoá tất cả" bị khoá (nút loa vẫn dùng được). Danh sách dài cuộn trong khung `--td-scan-list-max` (50vh).

## Âm báo, tắt tiếng, focus

- `beep` bật âm báo (tắt mặc định; Web Audio được mở khoá ngay trong phím đầu của lần quét — kể cả `terminator="none"`): Web Audio, **không file âm thanh**, không cần thêm nguồn CSP. Hợp lệ: 1 tiếng cao;
  lỗi: 2 tiếng trầm; trùng: 2 tiếng ngắn. Ghi đè: `TdScanInput.sounds = { ok: { freq: 1500, ms: 80, count: 1 } }` (kẹp
  100–4000 Hz, ≤ 400 ms, 1–3 tiếng).
- Có `beep` → nút loa cạnh ô ("Tắt âm báo" / "Bật âm báo", `aria-pressed`) → thuộc tính `muted` + sự kiện `mute-change`.
  **App tự lưu** lựa chọn (kit không ghi localStorage):

  ```js
  el.muted = localStorage.getItem('scan-muted') === '1';
  el.addEventListener('mute-change', (e) => localStorage.setItem('scan-muted', e.detail.muted ? '1' : '0'));
  ```

  `TdScanInput.muted = true` tắt tiếng toàn trang.
- `refocus`: `scan` (mặc định) — giữ focus trong ô qua mỗi lần quét, kể cả khi `validate` trả về muộn; "Bỏ" trả focus về
  ô. `always` — thêm: khi focus rơi về `body` (bấm vào vùng trống), sau 120 ms đưa focus lại ô; **không bao giờ** giành
  focus từ control khác, khi đang mở modal / drawer / menu / lightbox, hay khi tab trình duyệt bị ẩn. `off` — không can thiệp.

## Thuộc tính

| Thuộc tính | Mặc định | Ý nghĩa |
|---|---|---|
| `name` | — | Tên trường form (`multiple`: dùng `imei[]`) |
| `label` | — | Nhãn hiện (`<label>` thật); không có → `aria-label` của host → "Mã quét" |
| `placeholder`, `inputmode` | — | Truyền vào input (`inputmode`: `none` / `text` / `numeric` / `decimal` / `tel` / `search` / `email` / `url`) |
| `value` | `''` | Mã mặc định (chế độ đơn; cũng là giá trị `form.reset()`) |
| `multiple` | tắt | Chế độ nhiều mã |
| `max` | — | Số mã hợp lệ tối đa (`multiple`) |
| `required`, `disabled`, `readonly` | tắt | Như control native (`required`: đơn cần một mã, nhiều cần ≥ 1 mã) |
| `min-length` | `4` | Số ký tự tối thiểu để là `scanner` (1–64) |
| `maxlength` | `128` | Cắt cứng (code point, 1–1024) |
| `key-interval` | `40` | ms — ngưỡng nhịp máy (5–500) |
| `terminator` | `enter` | `enter` / `tab` / `enter tab` / `none` |
| `manual` | `allow` | `reject` = chỉ nhận máy quét |
| `dedupe-window` | `1500` | ms; `0` tắt |
| `validate-timeout` | `10000` | ms; `0` không giới hạn |
| `refocus` | `scan` | `off` / `scan` / `always` |
| `beep`, `muted` | tắt | Âm báo / tắt tiếng |
| `error-text` | — | Lỗi của app (hợp đồng lỗi chung; `setError()` / `clearError()`) |
| `helper-text` | — | **0.54.0** Gợi ý dưới control (chữ, 1–2 câu): ẩn và rời khỏi mô tả khi có lỗi. Nội dung giàu (link, `<code>`): `<td-hint>` con — xem [Hint](hint.md). Property `helperText`, `setHelper(msg)`, `helperMessage`. |

## Property, method, sự kiện

| | |
|---|---|
| `validate` | Hàm kiểm tra (xem trên) |
| `value` | Đơn: mã hợp lệ cuối; nhiều: mã hợp lệ mới nhất. Gán = **im lặng** (nhiều: thay cả danh sách bằng `[v]`) |
| `values` | Mảng mã hợp lệ (cũ → mới). Gán = im lặng, chuẩn hoá, bỏ rỗng / trùng; bỏ dòng lỗi + mã đang chờ |
| `muted` | Phản chiếu thuộc tính `muted` |
| `TdScanInput.labels` / `.messages` | Chữ giao diện / thông báo (tiếng Việt), ghi đè theo site |
| `TdScanInput.sounds`, `TdScanInput.muted` | Âm báo / tắt tiếng toàn trang |
| `clear()`, `removeValue(v)`, `reset()` | Xoá hết / bỏ một mã / về mặc định — đều **im lặng** |
| `focus()` | Focus ô nhập |

| Sự kiện | `detail` | Khi nào |
|---|---|---|
| `scan` | `{ value, source, seq, mixed }` | Một lần quét **hợp lệ** (sau `validate`) |
| `scan-invalid` | `{ value, source, seq, message }` | Lỗi: `validate` từ chối / lỗi / quá giờ, gõ tay bị từ chối, đủ `max`, đã có, đang chờ, quá tải |
| `scan-duplicate` | `{ value, source }` | Trùng trong `dedupe-window` |
| `change` | `{ value }` (đơn) / `{ values }` (nhiều) | Giá trị form đổi do **người dùng** (quét, "Bỏ", "Xoá tất cả") |
| `mute-change` | `{ muted }` | Bấm nút loa |

`input` native của ô vẫn nổi bọt như thường.

## Trình đọc màn hình

Kết quả hợp lệ / trùng đọc qua vùng `role="status"`; **quét dồn** trong 1 giây chỉ đọc một câu ("Đã quét 3 mã, mã cuối
3567… hợp lệ"). Lỗi đọc ngay qua vùng `aria-live="assertive"`. Danh sách là `<ul>` có tên "Mã đã quét", mỗi dòng đọc mã +
trạng thái; nút "Bỏ" có tên "Bỏ {mã}".

## PHP (SSR)

```php
<?= td_scan_input('order', ['label' => 'Mã đơn hàng', 'required' => true]) ?>
<?= td_scan_input('order', ['label' => 'Mã đơn hàng', 'element' => true, 'value' => $order->code]) ?>
<?= td_scan_input('imei[]', ['multiple' => true, 'label' => 'IMEI nhập kho', 'values' => $receipt->imeis, 'max' => 50]) ?>
```

- **Đơn, mặc định**: ô nhập native (`div.td-scan` > nhãn + `input.td-scan__input[name]`). Không JS: Enter submit form
  (chấp nhận khi không có JS). `element => true`: host `<td-scan-input data-td-ssr="scan-input@1">` + cùng ô — module
  nhận **tại chỗ** (giữ chữ đang gõ + focus).
  Trước khi JS tải (0.51.1, [ADR 0025](../internal/decisions/0025-pre-upgrade-parity.md)): trong container < 480 px
  module thêm dòng trạng thái "Bấm vào đây để quét" dưới ô — khi trình duyệt chạy JS, `td.css` giữ sẵn chỗ dòng đó (cao 2rem,
  44 px trên cảm ứng) nên nâng cấp không xô lệch; tắt JS thì không có dòng trống.
- **Nhiều (`multiple`)**: luôn là element. Không JS: `textarea` "Nhập tay, mỗi dòng một mã" + danh sách + một
  `input type="hidden"` mỗi mã. Khi module tải: mã in sẵn = **trạng thái hợp lệ đã có** (không gọi lại `validate`, cũng là
  mặc định của `form.reset()`); các dòng đã gõ vào textarea được đưa qua `validate` theo thứ tự (`source: 'manual'`) —
  **gán `validate` trước khi / ngay khi import module** để các dòng đó được kiểm. Markup bị sửa (hidden lệch danh sách,
  thuộc tính lạ) → danh sách bắt đầu **rỗng** + một cảnh báo console — server vẫn là nguồn sự thật khi lưu.
- **Server phải tách dòng** mục textarea khi không có JS (một mục `imei[]` có thể chứa nhiều dòng):

  ```php
  $codes = [];
  foreach ((array) ($_POST['imei'] ?? []) as $entry) {
      foreach (preg_split('/\R/', (string) $entry) as $line) {
          $line = trim((string) preg_replace('/[\x{0}-\x{1F}\x{7F}-\x{9F}]/u', '', $line)); // bỏ ký tự điều khiển như component
          if ($line !== '') $codes[$line] = true; // bỏ trùng
      }
  }
  $codes = array_keys($codes);                     // rồi kiểm Luhn / trùng phiếu / quyền như mọi input
  ```

  Laravel: `collect($request->input('imei', []))->flatMap(fn ($e) => preg_split('/\R/', (string) $e))->map(fn ($l) => trim((string) preg_replace('/[\x{0}-\x{1F}\x{7F}-\x{9F}]/u', '', $l)))->filter()->unique()->values()`.

Chi tiết tuỳ chọn: [PHP adapter › td_scan_input](../guides/php-adapter.md#td_scan_input-0380).

## Tuỳ biến

Token: `--td-scan-list-max` (chiều cao tối đa danh sách, `50vh`), `--td-scan-ready` (màu chỉ báo "Sẵn sàng quét",
`--td-color-success`), `--td-scan-idle`, `--td-scan-font-size` (≥ 16px — iOS không phóng to khi focus),
`--td-scan-list-bg` / `-border`, `--td-scan-valid` / `--td-scan-invalid`. Container `td-scan-input`: dưới 480px chỉ báo
xuống dưới ô, dòng danh sách xếp dọc. Cảm ứng: nút loa / "Bỏ" / "Xoá tất cả" / ô nhập ≥ 44px.

## Bảo mật

Mã quét là **input người dùng**: kit hiển thị bằng `textContent` / `setAttribute` (không bao giờ HTML), thông báo từ
`validate` cũng là chữ. `validate` chạy trong trình duyệt nên **không phải lớp bảo mật** — server phải chuẩn hoá + kiểm lại
mọi mã khi lưu (định dạng, Luhn, trùng, quyền). Xem [security model](../internal/security-model.md).
