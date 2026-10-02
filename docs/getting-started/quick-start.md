[Tài liệu](../README.md) › Bắt đầu › Trang đầu tiên trong 5 phút

# Trang đầu tiên trong 5 phút

Mục tiêu: dựng một trang có form đăng ký chạy thật, dùng sáu thứ quan trọng nhất của kit:

- `<td-input-field>`: ô nhập họ tên và email, có kiểm tra bắt buộc / định dạng.
- `<td-dropdown>`: chọn gói, dữ liệu nạp bằng JS.
- `<td-toggle>`: công tắc "nhận bản tin".
- `<td-button>` + `run()`: nút Lưu tự hiện trạng thái đang xử lý và chống bấm hai lần.
- `TdToast`: thông báo khi lưu xong hoặc lỗi.
- `TdModal.confirm()`: hộp xác nhận trước khi xoá dữ liệu đã nhập.

Bạn cần Node.js + npm (chỉ để tải kit và chạy server dev). Xem [Yêu cầu hệ thống](requirements.md).

## Bước 1: tạo project và cài kit

```bash
mkdir td-quickstart && cd td-quickstart
npm init -y
npm install github:dazzxq/td-components#v0.22.1
npm install -D vite
```

Tạo ba file dưới đây trong thư mục `td-quickstart/`.

## Bước 2: `index.html`

```html
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>td-components: form đầu tiên</title>
  <script type="module" src="/main.js"></script>
</head>
<body class="page">
  <main class="card">
    <h1 class="card__title">Đăng ký tài khoản</h1>

    <form id="signup" class="stack" novalidate>
      <td-input-field
        name="fullname"
        label="Họ và tên"
        placeholder="Nguyễn Văn A"
        required
        validate-on="blur"></td-input-field>

      <td-input-field
        name="email"
        type="email"
        label="Email"
        placeholder="ban@example.com"
        helper-text="Thử nhập da-ton-tai@example.com để xem lỗi từ server."
        required></td-input-field>

      <td-dropdown
        name="plan"
        label="Gói dịch vụ"
        placeholder="Chọn gói"
        required></td-dropdown>

      <td-toggle name="newsletter" label="Nhận bản tin hằng tháng" checked></td-toggle>

      <div class="actions">
        <td-button id="clear" variant="secondary">Xoá dữ liệu đã nhập</td-button>
        <td-button id="save" type="submit" variant="primary">Lưu</td-button>
      </div>
    </form>
  </main>
</body>
</html>
```

Ghi chú:

- `novalidate` tắt bong bóng lỗi tự động khi submit; ta gọi `form.reportValidity()` trong JS để quyết định lúc nào hiện.
- Mọi dữ liệu đơn giản (nhãn, placeholder, `required`, `checked`) là **attribute** trong HTML. Dữ liệu phức tạp (danh
  sách lựa chọn của dropdown) là **property** gán bằng JS ở bước 3. Xem
  [Attribute và property](../concepts/how-it-works.md#attribute-và-property).
- Không có `style="…"` nào: kit chạy được dưới CSP nghiêm ngặt, trang của bạn cũng nên giữ thói quen này.

## Bước 3: `main.js`

```js
// 1. Style của kit (một lần cho cả trang) + CSS riêng của trang
import '@dazzxq/td-components/td.css';
import './app.css';

// 2. Đăng ký các thẻ dùng trong index.html
import '@dazzxq/td-components/input-field';
import '@dazzxq/td-components/dropdown';
import '@dazzxq/td-components/toggle';
import '@dazzxq/td-components/button';

// 3. API tĩnh (không phải thẻ)
import { TdToast } from '@dazzxq/td-components/toast';
import { TdModal } from '@dazzxq/td-components/modal';

const form = document.getElementById('signup');
const email = form.querySelector('td-input-field[name="email"]');
const plan = form.querySelector('td-dropdown[name="plan"]');
const saveButton = document.getElementById('save');
const clearButton = document.getElementById('clear');

// Dữ liệu cho dropdown: mảng object { value, label } gán qua property `options`.
plan.options = [
  { value: 'free', label: 'Miễn phí' },
  { value: 'pro', label: 'Pro (99.000đ/tháng)' },
  { value: 'team', label: 'Nhóm (499.000đ/tháng)' },
];

// Giả lập gọi API mất 1,2 giây. Email "da-ton-tai@example.com" giả làm lỗi trùng email từ server.
function fakeSave(data) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (data.email === 'da-ton-tai@example.com') reject(new Error('email-taken'));
      else resolve({ id: 42 });
    }, 1200);
  });
}

form.addEventListener('submit', (event) => {
  event.preventDefault();

  // Kiểm tra ràng buộc (required, định dạng email…) của cả control td-* lẫn control thường.
  if (!form.reportValidity()) return;

  // Control td-* nằm trong FormData như <input> thường. Toggle tắt thì không có key "newsletter".
  const data = Object.fromEntries(new FormData(form));
  console.log('Gửi lên server:', data); // { fullname, email, plan, newsletter?: 'on' }

  // run(): bật trạng thái loading cho nút, chạy hàm, luôn tắt loading khi xong (kể cả khi lỗi).
  // Bấm thêm lần nữa trong lúc đang chạy sẽ không gửi lần hai.
  saveButton.run(async () => {
    try {
      await fakeSave(data);
      TdToast.success(`Đã lưu tài khoản của ${data.fullname}.`);
    } catch (err) {
      // Lỗi từ server gắn vào đúng ô: viền đỏ + dòng lỗi + aria-invalid cho trình đọc màn hình.
      email.setError('Email này đã được dùng cho một tài khoản khác.');
      email.focus();
      TdToast.error('Chưa lưu được. Kiểm tra lại các ô báo lỗi.');
    }
  });
});

// Người dùng sửa email thì bỏ lỗi server cũ.
email.addEventListener('input', () => email.clearError());

// Sự kiện của component là CustomEvent, dữ liệu nằm trong event.detail.
plan.addEventListener('change', (event) => {
  console.log('Đã chọn gói:', event.detail.value, event.detail.item);
});

// Xoá dữ liệu: hỏi xác nhận trước. confirm() trả Promise<boolean>.
clearButton.addEventListener('click', async () => {
  const ok = await TdModal.confirm({
    title: 'Xoá dữ liệu đã nhập?',
    message: 'Mọi ô trong form sẽ trở về giá trị ban đầu.',
    confirmText: 'Xoá',
    confirmVariant: 'danger',
  });
  if (!ok) return;
  form.reset(); // control td-* cũng reset về giá trị ban đầu và bỏ lỗi đang hiện
  TdToast.info('Đã xoá dữ liệu đã nhập.');
});
```

## Bước 4: `app.css`

CSS của trang, chỉ lo bố cục. Dùng lại token của kit (`--td-*`) để đồng bộ khoảng cách, font, màu.

```css
.page {
  margin: 0;
  min-height: 100vh;
  font-family: var(--td-font-sans);
  color: var(--td-color-text);
  background: var(--td-color-bg);
}

.card {
  max-width: 480px;
  margin: var(--td-space-xl) auto;
  padding: var(--td-space-lg);
  border: 1px solid var(--td-color-border);
  border-radius: var(--td-radius-lg);
  background: var(--td-color-surface);
  box-shadow: var(--td-shadow-2);
}

.card__title {
  margin: 0 0 var(--td-space-md);
  font-size: var(--td-text-xl);
}

.stack {
  display: grid;
  gap: var(--td-space-md);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--td-space-sm);
}
```

Muốn đổi màu chủ đạo của cả kit, thêm vào `app.css` (không bọc trong `@layer`):

```css
:root { --td-accent: #b3261e; }
```

`--td-accent` đổi checkbox, slider, pagination, nút ghost, viền focus ô nhập… Nút **primary** mặc định **đen** (0.22.1)
và **không** đi theo accent; muốn primary cùng màu thương hiệu, map thêm ba token:

```css
:root {
  --td-btn-primary-bg: var(--td-accent-fill);
  --td-btn-primary-fg: var(--td-accent-contrast);
  --td-btn-primary-hover: color-mix(in srgb, var(--td-accent-fill) 92%, #000);
}
```

Chi tiết: [Theming](../customization/theming.md).

## Bước 5: chạy

```bash
npx vite
```

Mở địa chỉ Vite in ra (thường là `http://localhost:5173/`). Đừng mở `index.html` bằng cách nhấp đúp: trình duyệt chặn
ES module từ `file://`, trang sẽ trắng.

Thử lần lượt:

1. Bấm **Lưu** khi form trống: trình duyệt báo lỗi ở ô bắt buộc đầu tiên.
2. Gõ họ tên rồi rời ô (`validate-on="blur"`): lỗi dưới ô tự hiện / tự mất.
3. Điền đủ, chọn gói, bấm **Lưu**: nút quay spinner khoảng 1 giây, sau đó toast loại `success` (viên nền xanh lá pastel, không icon) hiện ở góc trên bên phải; bấm vào toast để đóng sớm.
4. Nhập `da-ton-tai@example.com` rồi Lưu: ô email báo lỗi, toast lỗi hiện ra, focus nhảy về ô email.
5. Bấm **Xoá dữ liệu đã nhập**: modal xác nhận hiện, trang phía sau bị khoá. Thử Tab: focus chỉ chạy trong modal. Bấm
   Xoá: form về trạng thái ban đầu (toggle bật lại vì có `checked` trong HTML).
6. Dùng hoàn toàn bằng bàn phím: Tab qua các ô, mũi tên xuống để mở dropdown, Space để bật/tắt toggle.

## Không dùng Vite? (PHP / HTML thuần)

Cùng `index.html` và `app.js` (đổi tên từ `main.js`), chỉ khác phần `<head>`: nạp CSS bằng `<link>` và khai báo import map
để trình duyệt hiểu tên `@dazzxq/td-components/...`. Giả sử bạn đã copy kit vào `/vendor/td-components-0.22.1/` theo
[Cài đặt, mục 3](installation.md#3-php-thuần--html-không-bundler):

```html
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>td-components: form đầu tiên</title>
  <link rel="stylesheet" href="/vendor/td-components-0.22.1/td.css">
  <link rel="stylesheet" href="/app.css">
  <script type="importmap">
  {
    "imports": {
      "@dazzxq/td-components/input-field": "/vendor/td-components-0.22.1/src/form/td-input-field.js",
      "@dazzxq/td-components/dropdown": "/vendor/td-components-0.22.1/src/form/td-dropdown.js",
      "@dazzxq/td-components/toggle": "/vendor/td-components-0.22.1/src/form/td-toggle.js",
      "@dazzxq/td-components/button": "/vendor/td-components-0.22.1/src/form/td-button.js",
      "@dazzxq/td-components/toast": "/vendor/td-components-0.22.1/src/feedback/td-toast.js",
      "@dazzxq/td-components/modal": "/vendor/td-components-0.22.1/src/feedback/td-modal.js"
    }
  }
  </script>
  <script type="module" src="/app.js"></script>
</head>
```

Trong `app.js`, **xoá** hai dòng import CSS đầu tiên (`td.css` và `app.css` đã nạp bằng `<link>`; trình duyệt không import
được file CSS như Vite). Phần còn lại giữ nguyên. Chạy bằng `php -S localhost:8000` trong thư mục gốc web.

Site PHP không cần gõ tay import map: adapter `php/td.php` của kit in sẵn `<link>` và import map đầy đủ
(`td_stylesheet_tag()`, `td_import_map_tag()`), xem [Adapter PHP](../guides/php-adapter.md#css-và-import-map).

Dưới CSP nghiêm ngặt, import map (là script inline) cần `nonce`: xem [Cài đặt, mục CSP với nonce](installation.md#csp-với-nonce).

## Bạn vừa dùng những gì

| Thứ | Vai trò trong trang | Đọc thêm |
|---|---|---|
| `td.css` | Toàn bộ giao diện, token `--td-*` | [Theming](../customization/theming.md), [Styling](../customization/styling.md) |
| `<td-input-field>` | Ô nhập, submit trong `FormData`, kiểm tra `required`/`type="email"`, `setError()` cho lỗi server | [input-field](../components/input-field.md) |
| `<td-dropdown>` | Chọn một, có ô tìm kiếm, dữ liệu qua property `options`, event `change` `{ value, item }` | [dropdown](../components/dropdown.md) |
| `<td-toggle>` | Công tắc, submit `"on"` khi bật | [toggle](../components/toggle.md) |
| `<td-button>` + `run()` | Nút có trạng thái loading, chống double submit | [button](../components/button.md) |
| `TdToast` | Thông báo ngắn, tự ẩn, lỗi đọc ngay cho trình đọc màn hình | [toast](../components/toast.md) |
| `TdModal.confirm()` | Hộp xác nhận, trả `Promise<boolean>`, khoá trang phía sau | [modal](../components/modal.md) |

Bước tiếp theo:

- Hiểu vì sao mọi thứ chạy như vậy: [Cách kit hoạt động](../concepts/how-it-works.md).
- Form nâng cao (lỗi server hàng loạt, tóm tắt lỗi, `<fieldset disabled>`): [Hướng dẫn form](../guides/forms.md).
- Toàn bộ component: [Danh mục component](../components/README.md).
