[Tài liệu](../README.md) › [Components](README.md) › Password meter

# Đo độ mạnh mật khẩu — `<td-password-meter>`

Thanh 4 đoạn + một dòng "Độ mạnh mật khẩu: …" + (tuỳ chọn) danh sách điều kiện (độ dài, chữ thường, chữ hoa, chữ số,
ký tự đặc biệt), cập nhật ngay khi người dùng gõ. Dùng ở form **đặt / đổi mật khẩu**. Điểm được tính **ngay trên
trình duyệt**: không gửi request nào, không dependency, không event nào mang mật khẩu. Site thay thuật toán bằng hook
`score` (ví dụ zxcvbn của site).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/password-meter'` (class: `import { TdPasswordMeter } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | không (không gửi gì trong form; ô mật khẩu vẫn là control của bạn) |
| Từ phiên bản | 0.17.0 |

## Ví dụ nhanh

```html
<td-input-field id="new-pw" type="password" name="password" autocomplete="new-password" label="Mật khẩu mới"></td-input-field>
<td-password-meter for="new-pw" checklist></td-password-meter>

<script type="module">
  import '@dazzxq/td-components/input-field';
  import '@dazzxq/td-components/password-meter';
</script>
```

Hoặc **bọc** quanh một `<input>` native (hợp với HTML do PHP in ra — ô nhập vẫn hoạt động khi chưa có JS):

```html
<td-password-meter checklist="length upper number">
  <input type="password" name="password" autocomplete="new-password" minlength="10" aria-label="Mật khẩu mới">
</td-password-meter>
```

Thẻ con được giữ nguyên; khối đo được thêm vào **sau** nó.

## Cách dùng

### 1. Nguồn mật khẩu

- `for="id"`: id của một `<input>` / `<textarea>` hoặc một `<td-input-field>` (component đọc `.value` sống của nó).
- Không có `for`: phần tử `td-input-field, input, textarea` đầu tiên **bên trong** `<td-password-meter>`.

Component nghe `input` / `change` (uỷ quyền trên `document`, nên ô nhập thêm sau vẫn được nhận) và `reset` của form.
Gán giá trị bằng JS không phát event → gọi `meter.refresh()`.

### 2. Danh sách điều kiện

```html
<td-password-meter for="pw" checklist></td-password-meter>               <!-- đủ 5 điều kiện -->
<td-password-meter for="pw" checklist="length symbol"></td-password-meter> <!-- chỉ 2 -->
```

Điều kiện (thứ tự hiển thị cố định): `length` (≥ `min-length` ký tự, đếm theo code point — emoji tính 1, khớp
`mb_strlen` của PHP), `lower` (`a–z`), `upper` (`A–Z`), `number` (`0–9`), `symbol` (ký tự khác chữ/số ASCII — kể
cả khoảng trắng và chữ có dấu). Các lớp ký tự là **ASCII** có chủ đích, để khớp chính sách mật khẩu thường gặp phía
server (dwp, 135). Danh sách chỉ để **hướng dẫn**; chặn submit là việc của form (ví dụ `pattern`, `minlength`, hoặc
kiểm tra server).

`min-length`: attribute → `minlength` của ô nhập → `8`.

### 3. Thay thuật toán — hook `score`

```js
import { zxcvbn } from './vendor/zxcvbn.js'; // thư viện của site, không phải của kit

const meter = document.querySelector('td-password-meter');
meter.score = (value, { minLength, estimate }) => {
  if (value.length < minLength) return Math.min(1, estimate(value, { minLength }));
  return zxcvbn(value).score; // 0..4
};
```

- Trả về số `0..4` (làm tròn, kẹp vào khoảng) hoặc một `Promise` của nó (chỉ kết quả của lần gõ **mới nhất** được áp).
- Hook ném lỗi / trả giá trị không phải số → dùng thuật toán sẵn có + `console.warn` (không in mật khẩu).
- `TdPasswordMeter.estimate(value, { minLength })` là thuật toán sẵn có, gọi được độc lập.

### 4. Thuật toán sẵn có

Cộng điểm theo độ dài (≥ `min-length`: 1, ≥ 12: 2, ≥ 16: 3, ≥ 20: 4) và độ đa dạng (3 lớp ký tự +1, đủ 4 lớp +1); trừ 1
cho chuỗi lặp (`aaa`) và chuỗi tuần tự (`abc`, `321`, hàng phím `qwer`). Chặn trên: ngắn hơn `min-length`, ≤ 3 ký tự
khác nhau, hoặc mật khẩu phổ biến + đuôi số/ký tự (`Password123!`) → tối đa 1; dưới 12 ký tự → tối đa 3. Mật khẩu
nằm trong danh sách phổ biến nhúng sẵn (kể cả dạng leet `P@ssw0rd`, và vài mật khẩu Việt như `matkhau`, `anhyeuem`)
→ 0. Đây là **ước lượng**, không phải entropy thật.

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `for` | string | — | id của ô mật khẩu (`input`, `textarea`, `td-input-field`). Vắng → ô nhập bên trong. |
| `min-length` | number | `minlength` của ô, else `8` | Độ dài tối thiểu (1–128) cho điều kiện `length` và thuật toán sẵn có. |
| `checklist` | string | vắng (không hiện) | Rỗng / `all` = đủ 5 điều kiện; hoặc danh sách `length lower upper number symbol` (cách nhau bởi khoảng trắng hoặc dấu phẩy). |

Đổi attribute → cập nhật tại chỗ.

## Property & method

| Property / method | Kiểu | Mô tả |
|---|---|---|
| `score` | `(value, { minLength, estimate }) => number \| Promise<number>` \| `null` | Hook thay thuật toán (xem trên). Gán trước khi gắn vào trang cũng được. |
| `strength` | `{ score: 0-4, label: string }` (chỉ đọc) | Mức hiện tại. Ô trống → `{ score: 0, label: '' }`. |
| `refresh()` | method | Tính lại từ giá trị hiện tại của ô (sau khi gán `.value` bằng JS). |
| `TdPasswordMeter.estimate(value, { minLength })` | static method | Thuật toán sẵn có → `0..4`. |
| `TdPasswordMeter.labels` | static object | Nhãn (xem dưới). |

### Nhãn (`TdPasswordMeter.labels`)

| Khoá | Mặc định |
|---|---|
| `levels` | `['Rất yếu', 'Yếu', 'Trung bình', 'Mạnh', 'Rất mạnh']` (theo điểm 0–4) |
| `status` | `'Độ mạnh mật khẩu: {label}'` |
| `length` | `'Tối thiểu {n} ký tự'` |
| `lower` / `upper` / `number` / `symbol` | `'Chữ thường (a–z)'` / `'Chữ hoa (A–Z)'` / `'Chữ số (0–9)'` / `'Ký tự đặc biệt'` |
| `met` / `unmet` | `'đạt'` / `'chưa đạt'` (chỉ trình đọc màn hình nghe) |

```js
Object.assign(TdPasswordMeter.labels, { levels: ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'], status: 'Strength: {label}' });
```

Đổi nhãn có hiệu lực ở lần cập nhật kế tiếp (gõ phím hoặc `refresh()`).

## Event

| Event | `detail` | Khi nào |
|---|---|---|
| `strength-change` | `{ score: 0-4, label }` | Mức đổi (không phát lại khi gõ mà mức giữ nguyên). Về ô trống → `{ score: 0, label: '' }`. **Không** chứa mật khẩu. |

```js
meter.addEventListener('strength-change', (e) => {
  submitBtn.toggleAttribute('disabled', e.detail.score < 2);
});
```

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-password-meter-weak` | `var(--td-color-error)` | Màu đoạn khi điểm 0–1 |
| `--td-password-meter-fair` | `var(--td-color-warning)` | Màu đoạn khi điểm 2 |
| `--td-password-meter-strong` | `var(--td-color-success)` | Màu đoạn khi điểm 3–4 |
| `--td-password-meter-track` | `var(--td-color-border)` | Đoạn chưa sáng |
| `--td-password-meter-seg-h` / `--td-password-meter-seg-gap` | `4px` / `4px` | Độ dày đoạn / khe giữa các đoạn |
| `--td-password-meter-gap` | `0.4rem` | Khoảng cách ô nhập → thanh → dòng trạng thái |
| `--td-password-meter-fg` | `var(--td-color-text-muted)` | Màu chữ trạng thái + điều kiện chưa đạt |
| `--td-password-meter-met` | `var(--td-color-success)` | Màu điều kiện đã đạt (chữ + dấu tích) |
| `--td-password-meter-font-size` | `var(--td-text-xs)` | Cỡ chữ |

Số đoạn sáng = `max(1, điểm)` khi ô có giá trị (điểm 0 vẫn sáng một đoạn đỏ). Khối thuộc lớp nội dung (cạnh form) →
fill đặc, không kính.

## Cấu trúc DOM & class

```html
<td-password-meter for="new-pw" checklist>
  <div class="td-password-meter" data-level="empty|weak|fair|strong" data-score="0-4|" data-lit="0-4">
    <div class="td-password-meter__bar" aria-hidden="true">
      <span class="td-password-meter__seg"></span> <!-- ×4 -->
    </div>
    <p class="td-password-meter__status" id="td-password-meter-1-status" aria-live="polite">Độ mạnh mật khẩu: Mạnh</p>
    <ul class="td-password-meter__checklist" [hidden]>
      <li class="td-password-meter__rule" data-rule="length" data-met="true">
        <span class="td-password-meter__mark" aria-hidden="true"><!-- tdIcon('check') --></span>
        <span class="td-password-meter__text">Tối thiểu 8 ký tự</span><span class="td-sr-only">: đạt</span>
      </li>
      <!-- lower, upper, number, symbol -->
    </ul>
  </div>
</td-password-meter>
```

Khối được dựng bằng DOM API (không `innerHTML`), thêm vào **cuối** host; thẻ con có sẵn được giữ.

## Bàn phím & trợ năng

- Không có phần tử nhận focus riêng. Id của dòng trạng thái được **thêm** vào `aria-describedby` của ô mật khẩu (giữ
  các id sẵn có; gỡ khi component rời trang hoặc đổi `for`) → focus vào ô là nghe mức hiện tại.
- Dòng trạng thái là `aria-live="polite"`: chỉ đọc **mức** ("Độ mạnh mật khẩu: Yếu"), chỉ khi mức đổi — không bao giờ
  đọc mật khẩu.
- Thanh là trang trí (`aria-hidden`); màu không phải tín hiệu duy nhất (có chữ). Mỗi điều kiện có chữ "đạt / chưa
  đạt" cho trình đọc màn hình.
- Forced colors: đoạn sáng + dấu tích dùng `Highlight`. `prefers-reduced-motion`: tắt transition.

## Bảo mật

- Không request, không `console` log mật khẩu, không lưu giá trị trên element; `strength-change` và `strength` chỉ có
  điểm + nhãn. Hook `score` nhận mật khẩu — đó là code **của site**; đừng gửi nó lên mạng.
- Nhãn được đặt bằng `textContent` (không HTML).

## Lưu ý & lỗi thường gặp

- **Gán `input.value = …` bằng JS mà thanh không đổi**: không có event → gọi `meter.refresh()`.
- **Không thấy danh sách điều kiện**: cần attribute `checklist` (vắng = không hiện).
- **Ô nhập nằm trong khung khác (Shadow DOM của thư viện ngoài)**: `for` tìm trong cùng root với meter; đặt meter
  cùng root với ô nhập.
- Meter không chặn submit; dùng `strength-change` hoặc kiểm tra server nếu cần bắt buộc độ mạnh.

## Xem thêm

- [Input field](input-field.md) (`autocomplete="new-password"`) · [Form validation](form-validation.md) ·
  [Hướng dẫn Form](../guides/forms.md) · [Bảo mật](../guides/security.md)
