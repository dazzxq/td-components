[Tài liệu](../README.md) › [Components](README.md) › Masked value

# Giá trị bị che — `<td-masked-value>`

Hiện một giá trị nhạy cảm **đã bị che** (`09xx xxx 123`) kèm nút "Hiện". Bấm → kit gọi **hàm async của app**
(`reveal()`); app lo quyền, 2FA, mã mục đích, ghi audit rồi trả về giá trị thật; kit hiện nó và **tự che lại sau N giây**.
Dùng cho SĐT / email khách, IMEI, giá vốn, số tài khoản.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/masked-value'` (class: `import { TdMaskedValue } from '@dazzxq/td-components'`; nạp kèm [copy](copy.md)) |
| Loại | Custom element |
| Form-associated | không |
| Từ phiên bản | 0.31.0 (cần `td.css`) |

## Ranh giới app / kit

| App | Kit |
|---|---|
| Tính chuỗi che **phía server** (trình duyệt không bao giờ thấy giá trị thật trước khi `reveal()`) | Hiện chuỗi che, nút toggle, trạng thái chờ |
| Endpoint trả giá trị thật: kiểm quyền, 2FA / mã mục đích, **audit mỗi lần gọi** | Gọi `reveal()` đúng **một** lần cho một lần bấm, bỏ mọi kết quả về muộn |
| Thông báo lỗi chi tiết (toast, modal) nếu muốn | Thông báo trung tính, che lại sau `duration` giây, khi rời trang, khi bấm lại |

Kit **không** có hàm che (che phía trình duyệt nghĩa là giá trị thật đã ở trình duyệt).

## Ví dụ nhanh

```html
<td-masked-value label="SĐT khách" masked="09xx xxx 123" data-id="c-1024"></td-masked-value>

<script type="module">
  import '@dazzxq/td-components/masked-value';

  document.querySelector('td-masked-value').reveal = async ({ element, signal }) => {
    const res = await fetch(`/admin/customers/${element.dataset.id}/phone`, {
      method: 'POST', signal, headers: { 'X-CSRF-Token': csrf },
    });
    if (res.status === 403) throw new Error('forbidden');   // → reveal-error { kind: 'rejected' }
    return (await res.json()).phone;                          // chuỗi → hiện
  };
</script>
```

## Cách dùng

### 1. Hợp đồng `reveal()`

```ts
reveal({ element, signal }): Promise<string | null>
```

| Kết quả | Kit làm |
|---|---|
| chuỗi **không rỗng** | hiện, `aria-pressed="true"`, icon `eye-off`, hẹn giờ che lại, event `revealed { duration }` |
| `null` / `undefined` | người dùng huỷ trong app (đóng modal 2FA) → về trạng thái che, **im lặng** |
| `''` / không phải chuỗi | về che, thông báo "Không hiện được {label}.", `reveal-error { kind: 'invalid' }` |
| reject `AbortError` | im lặng |
| reject lỗi khác (kể cả `throw` đồng bộ) | về che, thông báo lỗi, `reveal-error { kind: 'rejected' }` |

- `element`: chính phần tử (đọc `element.dataset.id`…). `signal`: bị **abort** khi phần tử rời trang, trang bị ẩn /
  `pagehide`, `masked` đổi, `disabled`, `mask()` — truyền cho `fetch`.
- Kết quả về **sau** các trường hợp đó bị **bỏ** (không ghi DOM, không event), kể cả khi app phớt lờ `signal` (kit đếm
  thế hệ).
- **Khoá khi đang chờ:** bấm thêm khi đang chờ bị bỏ qua — **không** gọi `reveal()` lần hai (mỗi lần gọi là một lần audit
  / có thể bật 2FA ở app). Bấm khi đang hiện = che ngay.
- `detail` của `reveal-error` do kit tự sinh: **không** chuyển tiếp đối tượng lỗi của app (message / field của nó có thể
  chứa giá trị), và kit **không** `console.*` lỗi đó — app đã có lỗi trong chính hook của mình.

### 2. Hook theo phần tử hoặc cho cả trang

```js
el.reveal = fn;                              // property (chỉ nhận hàm; khác → null + một cảnh báo)
TdMaskedValue.reveal = ({ element }) => …;   // dùng khi phần tử không có property (trang PHP: gán một lần)
```

Gán `el.reveal` **trước** khi module được define (module tải muộn) vẫn được nhận. Không có hook → một cảnh báo, bấm không
làm gì. **Không** có getter giá trị.

### 3. Ví dụ: 2FA / mã mục đích

```js
import { TdModal } from '@dazzxq/td-components/modal';

TdMaskedValue.reveal = async ({ element, signal }) => {
  const purpose = await askPurpose();                 // modal của app: chọn "Gọi xác nhận đơn", "Bảo hành"…
  if (!purpose) return null;                          // người dùng đóng → im lặng
  const res = await fetch('/admin/reveal', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify({ field: element.dataset.field, id: element.dataset.id, purpose }),
  });
  if (res.status === 401) { await openTwoFactor(); return null; }  // app tự lo 2FA rồi để người dùng bấm lại
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()).value;
};
```

### 4. Che lại

| Lý do (`remasked.detail.reason`) | Khi nào |
|---|---|
| `timeout` | hết `duration` giây (mặc định 30) — thông báo "Đã che {label}." |
| `user` | bấm lại nút |
| `hidden` | trang bị ẩn (`visibilitychange`) hoặc `pagehide` (trước khi vào bfcache — bấm Back quay lại không còn giá trị) |
| `api` | `mask()`, đổi `masked`, bật `disabled` |
| (không event) | phần tử rời trang |

Che lại = ghi lại chữ che vào `.td-masked__text`, xoá biến riêng, **gỡ hẳn** `td-copy` con, xoá timer và listener trang.

### 5. Copy

`copyable` → khi đang hiện, kit thêm `<td-copy sensitive size="sm" label="Copy {label}">` (giá trị qua **property**,
không attribute); event của td-copy không mang giá trị. Che lại → gỡ cả node (kèm ô copy tay của nó khi clipboard bị
từ chối).

### 6. Server (PHP) và chuỗi che

```php
// che theo loại dữ liệu là logic của app — ví dụ SĐT: giữ 2 số đầu + 3 số cuối
$masked = mb_substr($phone, 0, 2) . str_repeat('x', max(0, mb_strlen($phone) - 5)) . mb_substr($phone, -3);
echo td_masked_value($masked, ['label' => 'SĐT khách', 'attrs' => ['data-id' => (string) $customer->id]]);
```

`td_masked_value()` **chỉ** in chuỗi che — chữ ký không có tham số giá trị thật nên helper không thể làm lộ. Không bao giờ
in giá trị thật vào HTML (kể cả `hidden` / `data-*`): nó lộ qua mã nguồn trang, cache, bfcache, extension, log và vô
hiệu audit. Chi tiết: [Adapter PHP › td_masked_value](../guides/php-adapter.md#td_masked_value-0310).

### 7. Không JS

Chỉ thấy chuỗi che. Nút toggle giữ chỗ nhưng ẩn (`td-masked-value:not(:defined) .td-masked__toggle { visibility:
hidden }`) → không có nút chết, không xô lệch khi JS chạy (markup PHP được nhận **tại chỗ**, hợp đồng `masked-value@1`).

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `masked` | string | — | Chuỗi che (text, do server tính). Đổi → che lại + hiện chuỗi mới. |
| `label` | string | `labels.value` ("giá trị") | Đây là gì; nút đọc "Hiện {label}" ở **mọi** trạng thái. |
| `duration` | số nguyên (giây) | `30` | Kẹp [2, 600]; sai → 30. |
| `copyable` | boolean | — | Nút copy khi đang hiện. |
| `disabled` | boolean | — | Nút `aria-disabled`; đang hiện / đang chờ → che lại. |

## Property & method

| Thành viên | Kiểu / chữ ký | Mô tả |
|---|---|---|
| `reveal` | `Function \| null` | Hook (mục 1–2). |
| `revealed` | `boolean` (chỉ đọc) | Đang hiện giá trị thật. |
| `mask()` | `→ void` | Che ngay (bỏ cả lần chờ đang chạy). |
| `TdMaskedValue.reveal` | static hook | Dùng khi phần tử không có property. |
| `TdMaskedValue.labels` | static | Văn bản. |

Mặc định `labels`: `value` "giá trị", `show` "Hiện {label}", `copy` "Copy {label}", `loading` "Đang tải {label}…" (chỉ
live region; nhãn nút giữ nguyên), `revealed` "Đã hiện {label}. Tự che lại sau {s} giây.", `remasked` "Đã che {label}.",
`error` "Không hiện được {label}.".

## Event

Nổi bọt, **không bao giờ mang giá trị**:

| Event | detail | Khi nào |
|---|---|---|
| `revealed` | `{ duration }` | Giá trị vừa hiện |
| `remasked` | `{ reason }` | Che lại sau khi đã hiện (mục 4; không phát khi rời trang) |
| `reveal-error` | `{ kind: 'rejected' \| 'invalid' }` | Hook reject / trả kết quả sai |

## Tuỳ biến giao diện

Không có token mới (theming không đổi). Host `inline-flex`; chữ `tabular-nums`, xuống dòng được (`overflow-wrap:
anywhere`); che = `--td-color-text-muted`, hiện = `--td-color-text` + đậm 500. Nút ghost 28px (44px trên cảm ứng); lúc chờ
icon được thay bằng spinner nhỏ dùng chung (`.td-spinner--sm`, theo reduced motion của spinner).

## Cấu trúc DOM & class

```html
<td-masked-value label="SĐT khách" masked="09xx xxx 123" class="td-masked" [aria-busy="true"]>
  <span class="td-masked__text" translate="no" [data-state="revealed"]>09xx xxx 123</span>
  <button type="button" class="td-masked__toggle" aria-pressed="false" aria-label="Hiện SĐT khách"
          data-tooltip="Hiện SĐT khách" [aria-disabled="true"] [data-state="loading"]>
    <span class="td-masked__icon" data-td-icon="eye|eye-off" aria-hidden="true">svg</span></button>
  [<td-copy sensitive size="sm" label="Copy SĐT khách"></td-copy>]
  <span class="td-sr-only" role="status"></span>
</td-masked-value>
```

## Bàn phím & trợ năng

- Nút toggle (`aria-pressed`) — Enter / Space như bấm chuột; **tên không đổi** theo trạng thái (mẫu APG toggle button).
- Live region **không đọc giá trị** ("Đã hiện SĐT khách. Tự che lại sau 30 giây.") — tránh loa đọc to PII; người dùng
  trình đọc màn hình đọc chữ ngay trước nút như mọi chữ khác.
- Chữ có `translate="no"` (không bị dịch máy làm sai số). `data-tooltip` hiện tooltip khi site nạp [tooltip](tooltip.md).

## Bảo mật

Kit **bảo đảm**: giá trị thật chỉ nằm trong **một** text node (`.td-masked__text`) và một biến riêng khi đang hiện; không
bao giờ vào attribute, `aria-*`, `title` / `data-tooltip`, live region, `detail` của event, `console`; che lại = ghi đè
text, xoá biến, gỡ `td-copy`.

Kit **không** bảo đảm: xoá giá trị khỏi bộ nhớ JS (chuỗi bất biến, do GC), xoá clipboard sau khi copy, chống chụp màn
hình / quay phim, chống extension đọc DOM **trong lúc** đang hiện. Quyền / 2FA / audit là việc của endpoint. Xem
[security model](../internal/security-model.md#5-bí-mật-của-td-masked-value-v0310).

## Cảm ứng

- Nút hiện / ẩn có hình nhấn (trừ khi đang tải / disabled); hover chỉ trên con trỏ mịn.

Chuẩn chung: [Cảm ứng](../guides/touch.md).

## Lưu ý & lỗi thường gặp

- **Bấm không làm gì** → chưa có hook (xem console) hoặc `disabled`.
- **Hiện rồi tắt ngay** → `duration` quá nhỏ bị kẹp lên 2 giây; hoặc tab bị ẩn.
- Không có đồng hồ đếm ngược hiển thị, `requestReveal()` bằng code (chỉ người dùng bấm), cache giá trị giữa các lần hiện
  (mỗi lần hiện = một `reveal()`), kit tự che theo loại dữ liệu.

## Xem thêm

- [Copy](copy.md) · [Adapter PHP](../guides/php-adapter.md) · [Hook](../customization/hooks.md)
