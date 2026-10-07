[Tài liệu](../README.md) › [Components](README.md) › OTP input

# Ô nhập mã xác thực — `<td-otp-input>`

Ô nhập mã một lần (OTP) — mặc định **6 chữ số**, từ 0.36.0 cấu hình được **độ dài 1–10** và **bộ ký tự** (số / chữ-số /
chữ, ví dụ Steam Guard 5 ký tự `WMX7Q`) — cho đăng nhập 2 bước (2FA), xác thực lại trước thao tác nhạy cảm (step-up),
xác nhận email/điện thoại. Bên trong chỉ có **một** `<input type="text" autocomplete="one-time-code">` thật — gõ, dán,
tự điền từ SMS / trình quản lý mật khẩu, IME đều là của trình duyệt — phủ trong suốt lên N ô vẽ trang trí. Form-associated:
gửi **một** giá trị dưới `name`. Component **chỉ nhận mã**: không tự submit, không gọi API, không đếm ngược, không có nút
"gửi lại" — đó là việc của trang. **Không** dùng cho mật khẩu, mã dài hơn 10 ký tự, mã có ký tự đặc biệt / phân nhóm
hiển thị (`ABCD-1234`) hay số điện thoại — dùng [input field](input-field.md).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/otp-input'` (class: `import { TdOtpInput } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | có |
| Từ phiên bản | 0.27.0 (token-native: cần `td.css`); `length` / `charset` / `case` + ô giữ hình từ 0.36.0 |

## Ví dụ nhanh

```html
<form id="otp-form" method="post" action="/login/2fa">
  <td-otp-input id="otp" name="code" label="Mã xác thực" required></td-otp-input>
  <button type="submit" class="td-btn td-btn--primary td-btn--md">Xác nhận</button>
</form>

<script type="module">
  import '@dazzxq/td-components/otp-input';

  const otp = document.getElementById('otp');
  otp.addEventListener('complete', (e) => {
    // đủ 6 số — trang tự quyết: submit luôn, hay gọi API
    document.getElementById('otp-form').requestSubmit();
  });
</script>
```

Form gửi `code=123456` (đúng một mục). `required` + rỗng → form không submit (`valueMissing`); gõ 1–5 số → `tooShort`.

## Cách dùng

### 1. Nhập, dán, tự điền

- Chỉ giữ **chữ số ASCII**. Chữ số full-width (`１２３`) và Ả Rập – Ấn (`١٢٣`, `۱۲۳`) được đổi sang `123`; mọi ký tự khác
  (khoảng trắng, gạch ngang, chữ cái) bị bỏ — áp cho cả gõ, dán, kéo thả và tự điền.
- Dán `123 456`, `12-34-56` hay `Mã của bạn: 123456` đều ra `123456`. Dài hơn 6 số → lấy 6 số đầu.
- Gõ ở **giữa** một mã đã đủ 6 số → **ghi đè** số ngay sau con trỏ (không đẩy số cuối ra ngoài). Gõ ở cuối mã đủ → bị bỏ.
- Bấm vào ô thứ N → con trỏ nhảy tới đó (không vượt quá số đã gõ). Ô hiện tại có vòng focus.
- `autocomplete="one-time-code"`: iOS / Android gợi ý mã từ SMS; trình quản lý mật khẩu điền mã TOTP. Mã điền vào một
  lần → `complete` phát một lần.

### 1b. Độ dài và bộ ký tự (0.36.0)

```html
<td-otp-input name="code" label="Mã 8 số" length="8"></td-otp-input>
<td-otp-input name="steam" label="Mã Steam Guard" length="5" charset="alphanumeric"></td-otp-input>
<td-otp-input name="word" label="Mã chữ" length="4" charset="alpha" case="lower"></td-otp-input>
```

- `length`: số nguyên **1–10** (mặc định 6). Giá trị khác (`0`, `11`, `"abc"`, `8.5`) → **dùng 6** + một cảnh báo console
  cho mỗi phần tử (không kẹp: kẹp 12 → 10 sẽ tạo mã sai âm thầm). Đổi `length` sau khi chạy → render lại, giá trị bị cắt
  theo độ dài mới.
- `charset`: `numeric` (mặc định) · `alphanumeric` · `alpha`. `case` (chỉ bộ có chữ): `upper` (mặc định) · `lower` ·
  `preserve`.
- Chuẩn hoá từng ký tự: chữ số full-width / Ả Rập → ASCII; chữ: chuẩn hoá NFKC từng ký tự (full-width `Ａ` → `A`) rồi chỉ
  nhận `A–Z` / `a–z`, đổi hoa / thường theo `case`; mọi ký tự khác (khoảng trắng, `-`, chữ có dấu `â`, emoji) bị bỏ. Dán
  `ab-12 34` vào bộ `alphanumeric` → `AB1234`.
- Bàn phím điện thoại: `numeric` → bàn phím số (`inputmode="numeric"`); bộ có chữ → `inputmode="text"`,
  `autocapitalize="characters"` (khi `upper`; khác → `none`), `autocorrect="off"`, `spellcheck="false"`.
- **Bộ gõ tiếng Việt (Telex / VNI)**: kit không chuẩn hoá giữa lúc đang gõ dấu (composition), chỉ chuẩn hoá một lần khi
  kết thúc — nhưng Telex có thể biến `aa` thành `â` (bị bỏ). Hãy hướng dẫn người dùng **tắt bộ gõ** khi nhập mã có chữ.
- Câu báo thiếu ký tự: số → `messages.tooShort` (`Mã gồm {length} chữ số.`), có chữ → `messages.tooShortChars`
  (`Mã gồm {length} ký tự.`).

### 2. Event `complete` — và vì sao component không tự submit

`complete` (`detail: { value }`) phát **một lần cho mỗi "lượt"**: khi ký tự thứ `length` (mặc định 6) vào với một giá trị chưa phát. Xoá một số
(hoặc gọi `reset()`) thì "lượt" mới bắt đầu, đủ 6 số lại phát. Gán `value` bằng code **không bao giờ** phát.

Component cố ý **không** submit, không gọi API, không đếm ngược: mỗi app có luồng riêng (submit form, gọi `fetch`,
khoá tài khoản, giới hạn tần suất, gửi lại mã). Ví dụ app gọi API khi đủ mã và tự xử lý lỗi:

```html
<td-otp-input id="otp" name="code" label="Mã từ ứng dụng xác thực"></td-otp-input>
<button type="button" id="resend" class="td-btn td-btn--ghost td-btn--sm">Gửi lại mã</button>

<script type="module">
  import '@dazzxq/td-components/otp-input';
  import { TdToast } from '@dazzxq/td-components/toast';

  const otp = document.getElementById('otp');
  let busy = false;

  otp.addEventListener('complete', async (e) => {
    if (busy) return;
    busy = true;
    otp.clearError();
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: e.detail.value }),
      });
      if (res.ok) { location.assign('/'); return; }
      const message = {
        412: 'Mã không đúng hoặc đã hết hạn.',
        423: 'Tài khoản tạm khoá do nhập sai quá nhiều lần.',
        429: 'Bạn thử quá nhanh, vui lòng đợi một chút.',
      }[res.status] || 'Không xác thực được, thử lại.';
      otp.setError(message);
      otp.reset();          // xoá mã + mở lại `complete` cho lần nhập sau
      otp.focus();
    } catch {
      otp.setError('Mất kết nối, thử lại.');
    } finally {
      busy = false;
    }
  });

  document.getElementById('resend').addEventListener('click', async () => {
    const res = await fetch('/api/auth/2fa/resend', { method: 'POST' });
    if (res.ok) TdToast.success('Đã gửi mã mới.');
    // đếm ngược / khoá nút "Gửi lại" là việc của app
  });
</script>
```

Mã HTTP (412 / 423 / 429…) là ví dụ — đặt theo API của bạn. Server **luôn** phải tự kiểm mã, giới hạn số lần thử và hết
hạn mã; component chỉ là ô nhập.

### 3. Trong form thường

```html
<form method="post" action="/account/verify-email">
  <td-otp-input name="code" label="Mã gồm 6 số đã gửi tới email" required></td-otp-input>
  <button type="submit" class="td-btn td-btn--primary td-btn--md">Xác nhận</button>
</form>
```

- Gửi một mục `code` (ElementInternals). `required` + rỗng → `valueMissing`; 1–5 số → `tooShort`; đủ 6 → hợp lệ.
- `disabled` (hoặc nằm trong `<fieldset disabled>`) → input bị khoá, không gửi. `readonly` → xem được, không sửa.
- `form.reset()` → về attribute `value` mặc định (thường rỗng), xoá lỗi đang hiện và mở lại `complete`.
- Câu báo lỗi lấy từ `TdOtpInput.messages` (xem [Property & method](#property--method)).

### 4. Nhãn và tên truy cập

Thứ tự ưu tiên đặt tên cho input:

1. Attribute `label` → `<label class="td-otp__label" for="…">` hiển thị bên trong.
2. `aria-label` trên host → chép xuống input.
3. `<label for="id-của-host">` **ngoài** host → input được `aria-labelledby` tới nhãn đó.
4. Không có gì → `aria-label` = `TdOtpInput.labels.input` (mặc định `Mã xác thực`).

```html
<label for="otp-step-up">Nhập mã để xác nhận xoá dự án</label>
<td-otp-input id="otp-step-up" name="code"></td-otp-input>
```

### 5. Lỗi từ server (error contract)

```js
otp.setError('Mã không đúng.');   // viền đỏ ở cả 6 ô + aria-invalid + dòng lỗi dưới ô
otp.clearError();                  // hoặc otp.setError('')
otp.errorMessage;                  // lỗi đang hiện ('' = không có)
```

```html
<td-otp-input name="code" label="Mã xác thực" error-text="Mã đã hết hạn."></td-otp-input>
```

Như [input field](input-field.md#hiện-lỗi-từ-server-error-contract): `setError()` và `error-text` cùng điều khiển một
dòng lỗi (cái đặt sau thắng); error contract chỉ là hiển thị + trợ năng, **không** chặn submit.

### 6. Xác thực lại trong modal (step-up)

Trước thao tác nhạy cảm (xoá dữ liệu, đổi email, xem khoá API), hỏi lại mã trong [modal](modal.md). Tạo phần tử bằng
DOM API rồi truyền làm `body` (Node, không phải chuỗi HTML). Modal tự focus ô nhập đầu tiên trong body — chính input
của td-otp-input:

```js
import '@dazzxq/td-components/otp-input';
import { TdModal } from '@dazzxq/td-components/modal';

function askStepUpCode() {
  return new Promise((resolve) => {
    const otp = document.createElement('td-otp-input');
    otp.setAttribute('label', 'Nhập mã từ ứng dụng xác thực');
    let done = false;

    const id = TdModal.show({
      title: 'Xác nhận danh tính',
      body: otp,
      size: 'sm',
      actions: [{ label: 'Huỷ', variant: 'secondary', value: null }],
      onClose: () => { if (!done) resolve(null); },
    });

    otp.addEventListener('complete', async (e) => {
      const res = await fetch('/api/auth/step-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: e.detail.value }),
      });
      if (!res.ok) { otp.setError('Mã không đúng.'); otp.reset(); otp.focus(); return; }
      done = true;
      resolve(await res.json());   // ví dụ token step-up
      TdModal.closeById(id);
    });
  });
}
```

### 7. Render phía server (PHP)

```php
<?= td_otp_input('code', ['label' => 'Mã xác thực', 'required' => true]) ?>                     <!-- native, chạy không JS -->
<?= td_otp_input('code', ['label' => 'Mã xác thực', 'required' => true, 'element' => true]) ?>  <!-- element: hydrate tại chỗ -->
```

Mặc định helper in một **ô nhập native** chạy đủ khi không có JS (`maxlength="6"`, `pattern="[0-9]{6}"`, `required`,
`autocomplete="one-time-code"`), cùng hộp với bản có JS. 0.36.0: option `length` (1–10; sai → 6 + `E_USER_WARNING`),
`charset`, `case` — cùng luật chuẩn hoá với JS (`td__otp_value`, kiểm parity bằng bảng `OTP_CASES`); `maxlength` = N,
`pattern` = `[0-9]{N}` · `[A-Za-z0-9]{N}` · `[A-Za-z]{N}` (pattern native nhận cả chữ thường — server tự chuẩn hoá hoa /
thường). Chuẩn hoá chữ full-width ở PHP dùng `Normalizer` (ext intl); thiếu intl chỉ chữ full-width được gấp.

```php
<?= td_otp_input('steam', ['label' => 'Mã Steam Guard', 'length' => 5, 'charset' => 'alphanumeric', 'element' => true]) ?>
``` `'element' => true` (hoặc `Td::configure(…, ['ssr_elements'
=> true])`) in host `<td-otp-input data-td-ssr="otp-input@1">` + input + 6 ô — module nạp thì nhận **tại chỗ**. Chi tiết
option và id: [Adapter PHP › td_otp_input](../guides/php-adapter.md#td_otp_input-0270).

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `name` | string | — | Tên field khi submit form. |
| `value` | string | `''` | Giá trị **mặc định** (chuẩn hoá theo bộ ký tự, tối đa `length`). Đổi sau khi render → đặt luôn giá trị sống (không phát event). `form.reset()` về giá trị này. |
| `length` | number | `6` | (0.36.0) Số ký tự, 1–10. Sai → 6 + một cảnh báo. Đổi → render lại. |
| `charset` | string | `numeric` | (0.36.0) `numeric` · `alphanumeric` · `alpha`. Đổi → render lại. |
| `case` | string | `upper` | (0.36.0) `upper` · `lower` · `preserve` (chỉ áp cho chữ). |
| `label` | string | — | Nhãn hiển thị (`<label for>` nội bộ). Đổi → render lại. |
| `required` | boolean | — | Rỗng → `valueMissing`. |
| `disabled` | boolean | — | Khoá input, không gửi giá trị. |
| `readonly` | boolean | — | Xem được, không sửa; ô có nền read-only. |
| `error-text` | string | — | Lỗi hiển thị (error contract). |
| `aria-label` | string | — | Tên truy cập khi không có `label`. |
| `helper-text` | string | — | **0.54.0** Gợi ý dưới control (chữ, 1–2 câu): ẩn và rời khỏi mô tả khi có lỗi. Nội dung giàu (link, `<code>`): `<td-hint>` con — xem [Hint](hint.md). Property `helperText`, `setHelper(msg)`, `helperMessage`. |

## Property & method

| Thành viên | Kiểu / chữ ký | Mô tả |
|---|---|---|
| `value` | `string` | Các ký tự đã nhập (0…`length`). Gán → chuẩn hoá (theo bộ ký tự, cắt `length`), **không** phát `input` / `complete`; gán đủ coi như "lượt" đó đã hoàn tất. |
| `length` / `charset` | `number` / `string` | (0.36.0) Giá trị đã resolve (sai → mặc định); gán → đặt attribute. |
| `reset()` | `() => void` | Xoá mã và mở lại `complete`. |
| `setError(msg)` / `clearError()` | `(string) => void` | Error contract. |
| `errorMessage` | `string` (chỉ đọc) | Lỗi đang hiện. |
| `form`, `validity`, `validationMessage`, `willValidate` | — | Như control native. |
| `checkValidity()` / `reportValidity()` | `() => boolean` | Như control native. |
| `focus()` | `() => void` | Focus input bên trong. |
| `TdOtpInput.LENGTH` | `6` (static) | **Deprecated** (0.36.0): độ dài **mặc định**; độ dài thật là property `length`. |
| `TdOtpInput.labels.input` | static | Tên mặc định khi không có nhãn nào: `'Mã xác thực'`. |
| `TdOtpInput.messages` | static | `valueMissing: 'Vui lòng nhập mã xác thực.'`, `tooShort: 'Mã gồm {length} chữ số.'`, `tooShortChars: 'Mã gồm {length} ký tự.'` (0.36.0, bộ có chữ). |

Dịch cho site (gán một lần trong file boot):

```js
import { TdOtpInput } from '@dazzxq/td-components/otp-input';
TdOtpInput.labels.input = 'Verification code';
TdOtpInput.messages.valueMissing = 'Please enter the code.';
TdOtpInput.messages.tooShort = 'Enter all {length} digits.';
```

## Event

| Event | detail | Khi nào | bubbles? |
|---|---|---|---|
| `input` | — (event native) | Mỗi lần người dùng gõ / dán / xoá / tự điền. Phát từ input bên trong; lúc trang nhận, `otp.value` đã được chuẩn hoá. | có |
| `complete` | `{ value }` | Ký tự thứ `length` vào với giá trị chưa phát trong "lượt" này. Đúng **một lần** mỗi lượt; xoá một số hoặc `reset()` mở lượt mới. Gán `value` bằng code và `form.reset()` **không** phát. | có (composed) |

Không có event `change` riêng (input bên trong vẫn phát `change` native khi blur).

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-otp-cell-w` | `2.75rem` | Rộng một ô (hộp co lại trên màn hẹp) |
| `--td-otp-cell-aspect` | `44 / 52` | (0.36.0) Tỉ lệ rộng / cao của ô — ô **giữ hình** khi hộp co (chiều cao theo bề rộng thật). |
| `--td-otp-cell-h` | `3.25rem` | Cao của ô nhập **native** (PHP không JS). **Deprecated** cho element mode từ 0.36.0 (không còn tác dụng — đặt `--td-otp-cell-aspect`). |
| `--td-otp-gap` | `0.5rem` | Khoảng cách giữa các ô (tối đa 3 % bề rộng hộp) |
| `--td-otp-radius` | `var(--td-field-radius-md)` | Bo góc ô |
| `--td-otp-bg` | `var(--td-control-bg)` | Nền ô |
| `--td-otp-fg` | `var(--td-control-fg)` | Chữ số |
| `--td-otp-border` | `var(--td-control-border-strong)` | Viền ô lúc nghỉ (≥ 3:1 — mỗi ô là một ranh giới) |
| `--td-otp-border-active` | `var(--td-field-focus)` | Viền ô đang có con trỏ |
| `--td-otp-ring` | `var(--td-field-focus-ring)` | Vòng focus ô đang có con trỏ |
| `--td-otp-error` | `var(--td-field-error)` | Viền ô khi có lỗi |
| `--td-otp-bg-disabled` | `var(--td-field-bg-disabled)` | Nền khi `disabled` |
| `--td-otp-bg-readonly` | `var(--td-field-bg-readonly)` | Nền khi `readonly` |
| `--td-otp-fg-disabled` | `var(--td-field-fg-disabled)` | Chữ khi `disabled` |
| `--td-otp-font-size` | `var(--td-text-xl)` | Cỡ chữ số |

```css
:root { --td-otp-cell-w: 3rem; --td-otp-gap: 0.75rem; }
.compact-form td-otp-input { --td-otp-cell-aspect: 1; --td-otp-font-size: var(--td-text-lg); }
```

Ô là lớp nội dung: nền đặc, không glass. **Hình ô (0.36.0):** các ô luôn nằm trong luồng (lưới N cột bằng nhau) và giữ tỉ
lệ `--td-otp-cell-aspect` → trên điện thoại hộp co lại thì ô **nhỏ đi cả hai chiều**, không còn bị kéo thành "viên thuốc"
cao. Trên màn cảm ứng ô không thấp hơn `--td-touch-min` (44px) — nên ô chỉ cao hơn tỉ lệ khi ô hẹp hơn ~37px (cột hẹp
hơn ~262px với 6 ô). Hộp có cùng kích thước trước và sau khi module nạp (SSR element mode: ô ẩn nhưng vẫn chiếm chỗ,
input phủ lên hiện như ô nhập thường); ký tự luôn đọc trái → phải kể cả trang `dir="rtl"`.

## Cấu trúc DOM & class

```html
<td-otp-input id="otp" name="code" label="Mã xác thực">
  <div class="td-otp">  <!-- length ≠ 6: data-length="N" -->
    <label class="td-otp__label" for="otp-input">Mã xác thực</label>
    <div class="td-otp__box">
      <input type="text" class="td-otp__input" id="otp-input" inputmode="numeric" autocomplete="one-time-code">
      <!-- bộ có chữ: inputmode="text" autocapitalize="characters|none" autocorrect="off" spellcheck="false" -->
      <span class="td-otp__cells" aria-hidden="true">
        <span class="td-otp__cell" data-state="filled">1</span>
        <span class="td-otp__cell" data-state="filled">2</span>
        <span class="td-otp__cell" data-state="empty" data-active></span>
        … (đủ length ô)
      </span>
    </div>
  </div>
  <span class="td-field-error" id="otp-error" data-for="otp">Mã không đúng.</span>  <!-- chỉ khi có lỗi -->
</td-otp-input>
```

- Id input: `{id host}-input`; host không có id thì được gán `td-td-otp-input-{n}`. Markup SSR có thể mang id input
  riêng (option `id` của PHP) — component giữ id đó.
- Trạng thái ô (do JS đặt, không phải class): `data-state="empty|filled"`, `data-active` (ô có con trỏ, hoặc các ô đang
  được chọn, khi input focus). Trạng thái input: `:disabled`, `[readonly]`, `[aria-invalid="true"]`.
- Trước khi phần tử được định nghĩa (module đang tải): ô bị ẩn (`visibility: hidden`, vẫn chiếm chỗ → hộp đúng cỡ),
  **chính input** phủ lên là ô nhập nhìn thấy được. Sau khi định nghĩa: input trong suốt phủ lên N ô, vẫn là control thật
  (focus, con trỏ, dán, tự điền). Ô nhập native của PHP (không host) giữ chiều cao cố định `--td-otp-cell-h`.

### Hợp đồng SSR `otp-input@1` — hydrate tại chỗ

[ADR 0012](../internal/decisions/0012-ssr-hydration.md). `td_otp_input(…, ['element' => true])` in host
`<td-otp-input data-td-ssr="otp-input@1">` + đúng cây trên, với input còn mang thêm `name`, `value`, `required`,
`maxlength="6"`, `pattern="[0-9]{6}"` để form chạy khi chưa có JS.

- **Nhận tại chỗ** khi: dấu `otp-input@1`; cấu trúc đúng `render()` (wrapper, nhãn chỉ có chữ, hộp, input `type=text`
  + `inputmode` / thuộc tính chữ đúng bộ ký tự + `autocomplete=one-time-code` + id đúng, N ô mỗi ô tối đa một ký tự của bộ,
  dòng lỗi đúng khi có lỗi); **0.36.0 (thêm, vẫn `@1`)**: số ô == `length` của host == `data-length` của wrapper (chỉ có
  khi N ≠ 6), `maxlength` / `pattern` lần đầu khớp `length` + `charset`; attribute chỉ nằm trong allowlist (`aria-*` / `data-*`, không `on*` / `style` / `form`…); `name` / `required` /
  `disabled` / `readonly` của input khớp host.
- **Giữ nguyên:** node input (giá trị người dùng gõ trước khi module tải — chuẩn hoá —, vùng chọn, focus), kích thước.
  Property `value` gán trước khi define thắng chữ đã gõ. Không phát `input` / `complete`.
- **Thứ tự:** ElementInternals (giá trị + validity) **trước**, rồi gỡ `name` / `value` / `required` / `maxlength` /
  `pattern` khỏi input → FormData đúng **một** mục. `<label for="{id input}">` ngoài host được chuyển sang host.
- `form.reset()` → `value` PHP in ra.
- **Không khớp** (markup bị sửa, attribute lạ, script đổi `label` / `name`… trước khi module tải, dấu `@2`) → **render
  an toàn ngay**, trả lại giá trị, vùng chọn và focus cho input mới.
- Gỡ ra rồi gắn lại phần tử đã hydrate: kiểm lại markup rồi gắn listener tại chỗ; bị sửa lúc tách → render lại.
- **PHP và JS phải cùng phiên bản**: JS cũ (cache) gặp markup 8 ô sẽ render an toàn thành 6 ô (không biết `length`).

## Bàn phím & trợ năng

| Phím | Tác dụng |
|---|---|
| Tab | Vào / ra ô (một điểm dừng duy nhất — chỉ có một input) |
| 0–9 / A–Z | Nhập ký tự của bộ (bàn phím số trên điện thoại khi `numeric`) |
| Backspace / Delete | Xoá số (như ô text thường); mở lại `complete` |
| ← / → / Home / End | Di con trỏ; ô tương ứng có vòng focus |
| Ctrl/⌘+V | Dán (chuẩn hoá) |
| Enter | Hành vi native: submit form chứa ô (component không chặn, không tự thêm) |

- Trình đọc màn hình chỉ thấy **một** ô nhập có tên (6 ô vẽ là `aria-hidden`), đọc giá trị như ô text bình thường.
- Lỗi: `aria-invalid` + `aria-errormessage` trỏ tới dòng lỗi.
- Ô nghỉ có viền ≥ 3:1. Forced colors: viền `CanvasText`, ô có con trỏ viền `Highlight`, lỗi viền dày 2px.
- `prefers-reduced-motion`: bỏ chuyển màu viền.

## Bảo mật

- `label`, `aria-label`, `error-text`, id đều được escape; ô chỉ chứa chữ số (`textContent`). Không có cửa HTML.
- Component **không** gửi mã đi đâu, không lưu, không log. Mã OTP vẫn là bí mật trong vài phút: đừng ghi nó vào
  analytics / log lỗi phía client.
- Kiểm tra thật nằm ở **server**: so mã, hết hạn, giới hạn số lần sai (khoá / 423), giới hạn tần suất (429), một mã chỉ
  dùng một lần. `pattern` / `required` chỉ là UX.
- Markup SSR chỉ được nhận khi đúng hợp đồng và qua allowlist attribute; đừng tự dựng `data-td-ssr` từ dữ liệu người
  dùng — dùng helper PHP.

## Lưu ý & lỗi thường gặp

- **Từ 0.36.0 có `length` / `charset`.** Mã 4 / 8 số, mã chữ-số 5 ký tự → `length` + `charset`. Mã > 10 ký tự, ký tự đặc
  biệt hoặc phân nhóm `123-456` hiển thị → dùng input field.
- **`complete` không phát khi gán `value`** — cố ý (khôi phục state không được kích hoạt lại luồng xác thực). Muốn xử
  lý ngay mã đã có, gọi trực tiếp hàm xác thực của bạn.
- **Sai mã mà gõ lại y hệt không thấy `complete`**: mã cũ còn đủ 6 số nên "lượt" đó đã phát. Gọi `reset()` sau khi
  server báo sai (như ví dụ ở mục 2).
- **`complete` phát hai lần cho cùng mã?** Không: dán rồi xoá ngay, hay tự điền SMS, đều đúng một lần mỗi lượt. Nếu
  luồng của bạn vẫn có thể gọi API song song, tự chặn bằng cờ `busy`.
- **Enter submit form trước khi đủ 6 số** → form bị chặn bởi `tooShort` (khi có `required` hoặc đã nhập 1–5 số). Muốn
  chặn hẳn, xử lý `submit` của form.
- **CSS của site nhắm `input` trong form** (`form input { … }`) có thể làm lộ input trong suốt; giới hạn selector hoặc
  loại `.td-otp__input`.
- Quên `td.css` → chỉ thấy một ô text trơn (vẫn dùng được).

## Xem thêm

- [Input field](input-field.md) · [Modal](modal.md) · [Toast](toast.md) · [Form validation](form-validation.md)
- [Adapter PHP](../guides/php-adapter.md#td_otp_input-0270) · [Form](../guides/forms.md) · [Trợ năng](../guides/accessibility.md)
- [Theming](../customization/theming.md) · [Cách component hoạt động](../concepts/how-it-works.md)
