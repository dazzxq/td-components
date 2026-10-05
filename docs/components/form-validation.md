[Tài liệu](../README.md) › [Components](README.md) › Form validation

# Form validation — `TdFormValidation`

Bộ hàm tĩnh giúp **kiểm tra form phía trình duyệt** và **hiển thị lỗi từ server** (định dạng Laravel) lên đúng field, cho
cả control gốc (`<input>`, `<select>`, `<textarea>`) lẫn control td (`td-input-field`, `td-dropdown`,
`td-datetime-picker`, `td-chip-input`…). Nó không phải thư viện luật: **luật chính là các attribute ràng buộc gốc**
(`required`, `min`, `maxlength`, `pattern`, `type="email"`…), cộng thêm hàm JS cho những gì attribute không diễn tả được.

Không cần nó khi form chỉ có vài field và bạn chấp nhận bong bóng lỗi mặc định của trình duyệt, hoặc khi một
`td-input-field` đơn lẻ đã đủ với attribute `validate-on` (xem [input-field](input-field.md)). Đừng dùng **cả**
`attach()` **và** `validate-on` cho cùng một field — hai cơ chế sẽ cùng hiển thị lỗi.

| | |
|---|---|
| Import | `import { TdFormValidation } from '@dazzxq/td-components/form-validation'` |
| Loại | API JS tĩnh (không phải element) |
| Form-associated | không áp dụng |
| Từ phiên bản | 0.12.0 |

Cần `td.css` cho hai class `.td-field-error` (dòng lỗi) và `.td-form-summary` (khung tổng hợp).

## Ví dụ nhanh

```html
<form id="post-form" action="/posts" method="post">
  <label for="title">Tiêu đề</label>
  <input id="title" name="title" required maxlength="120">

  <td-dropdown name="category" label="Danh mục" required></td-dropdown>

  <label for="email">Email liên hệ</label>
  <input id="email" name="email" type="email">

  <button type="submit">Lưu</button>
</form>
```

```js
import '@dazzxq/td-components/dropdown';
import { TdFormValidation } from '@dazzxq/td-components/form-validation';

const form = document.getElementById('post-form');
form.querySelector('td-dropdown').options = [{ value: 'news', label: 'Tin tức' }, { value: 'blog', label: 'Blog' }];

// Kiểm tra khi submit + kiểm tra lại "sống" sau lần submit lỗi đầu tiên.
TdFormValidation.attach(form);
```

Form hợp lệ thì submit bình thường; không hợp lệ thì bị chặn, lỗi hiện dưới từng field (tiếng Việt), field lỗi đầu tiên
được focus, và nếu có từ 2 lỗi trở lên thì một khung tổng hợp xuất hiện ở đầu form.

## Cách dùng

### 1. `validate()` — kiểm tra một lần

```js
const result = TdFormValidation.validate(form);
if (!result.valid) {
  console.log(result.errors); // [{ element, name, message }, …] theo thứ tự trong trang
  return;
}
```

`root` có thể là `<form>` hoặc **bất kỳ phần tử chứa** nào (ví dụ thân của một modal). Mỗi lần gọi sẽ **thay thế** mọi
lỗi mà lần `validate()`/`apply()` trước đã hiện trên root đó.

Control được xét:

- control td (mọi phần tử kế thừa `TdFormElement`, hoặc custom element có method `setError()`) và control gốc;
- chỉ những control có `willValidate === true` → bỏ qua control bị `disabled` (kể cả trong `<fieldset disabled>`),
  `readonly`, `type="hidden"`, nút bấm;
- `<input>` bên trong một control td (ví dụ ô nhập của `td-input-field`) không bị xét riêng — xét qua host;
- nhóm radio cùng `name` tính **một lần**, mọi radio trong nhóm được đánh dấu lỗi.

### 2. Luật JS (`rules`)

```js
const rules = {
  slug: (value) => (/^[a-z0-9-]+$/.test(value) ? '' : 'Chỉ dùng chữ thường, số và dấu gạch ngang'),
  password_confirmation: (value, control, root) =>
    value === root.querySelector('[name="password"]').value ? '' : 'Mật khẩu không khớp',
  'tags[]': (items) => (items.length <= 5 ? '' : 'Tối đa 5 thẻ'),
};
TdFormValidation.validate(form, { rules });
```

- Key là **đúng** attribute `name` của control (kể cả `[]`).
- Hàm nhận `(value, control, root)`, trả **chuỗi lỗi** hoặc `''` (hợp lệ).
- `value` là: `getValue()` nếu control có method này (td-dropdown → giá trị, td-chip-input → mảng mục,
  td-datetime-picker → chuỗi display hoặc `''`; td-datetime-range → object `{ start, end }`, mỗi mốc chuỗi display hoặc
  `''` — `required` của nó đi qua `validity` như mọi control, xem [datetime-range](datetime-range.md#validity)); checkbox → `true/false`; radio → value của radio đang chọn hoặc `''`;
  `<select multiple>` → mảng; còn lại → `.value`.
- Kết quả được đẩy vào `setCustomValidity()` của control, nên `form.checkValidity()` gốc cũng thấy. Luật chỉ chạy bên
  trong `validate()` và phần kiểm tra lại của `attach()`; `clear()` gỡ lại.
- Luật **ném lỗi** → field bị coi là **không hợp lệ** với thông báo `messages.ruleError` (`Không thể kiểm tra giá trị
  này`) và một cảnh báo console. Đây là chủ đích (fail closed): dữ liệu lạ làm luật crash không được lọt qua.
- Luật chạy đồng bộ; không hỗ trợ luật async (kiểm tra trùng trên server hãy để server trả lỗi rồi dùng `apply()`).

### 3. `attach()` — gắn vào form

```js
const detach = TdFormValidation.attach(form, {
  rules,
  onValid: async (event, f) => {
    const res = await fetch(f.action, { method: 'POST', body: new FormData(f) });
    if (res.status === 422) TdFormValidation.apply(f, (await res.json()).errors);
  },
});
// detach(); // gỡ listener, trả lại novalidate như cũ (lỗi đang hiện vẫn giữ — gọi clear() nếu cần)
```

`attach(form, opts)`:

- đặt `form.noValidate = true` (tắt bong bóng lỗi của trình duyệt; lỗi inline của td là cách hiển thị duy nhất);
- khi `submit`: chạy `validate(form, opts)`; lỗi → `preventDefault()`;
- có `onValid` → submit **luôn** bị chặn và `onValid(event, form)` được gọi khi hợp lệ (SPA / AJAX / modal); không có →
  form hợp lệ submit bình thường. `onValid` ném lỗi đồng bộ → lỗi được bắt và `console.error` (từ 0.16.0), submit vẫn
  bị chặn;
- nếu chính `validate()` bị crash → submit bị chặn (fail closed) và lỗi được `console.error`;
- **sau lần submit lỗi đầu tiên** (không trước đó), kiểm tra lại field đang sửa theo nguyên tắc "khen sớm, phạt muộn":
  - `input` (đang gõ): field hết lỗi → lỗi biến mất; field đang hiện lỗi mà vẫn sai → cập nhật chữ; **không** tạo lỗi
    mới khi đang gõ;
  - `change` / `focusout`: hiện lỗi hiện tại của field;
  - tắt bằng `live: false`;
- lỗi **server** trên một field bị gỡ ngay lần đầu người dùng sửa field đó (`input`/`change`).
- form `reset` (từ 0.16.0) → xoá hết như `clear(form)` (summary, note lỗi, `aria-invalid`, custom validity của `rules`)
  và tắt kiểm tra lại khi sửa cho tới lần submit lỗi kế tiếp. `detach()` gỡ cả listener này.
- `form` không phải `<form>` → ném `TypeError`.

### 4. `apply()` — hiển thị lỗi server (Laravel)

Laravel trả lỗi 422 dạng `{ message, errors: { field: ['msg', …] } }`. Đưa phần `errors` vào `apply()`:

```js
const res = await fetch('/posts', { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
if (res.status === 422) {
  const { errors } = await res.json();
  const r = TdFormValidation.apply(form, errors);
  // r.applied   = [{ field, element, message }]  lỗi đã gắn vào field
  // r.unmapped  = [{ field, message }]           key không tìm thấy field (r.unmatched là tên khác của mảng này)
}
```

- Giá trị mỗi key là chuỗi hoặc mảng chuỗi; lấy **thông báo đầu tiên** không rỗng.
- Nhiều key trỏ cùng một control → giữ thông báo của key đầu tiên.
- Lỗi server **không thay đổi validity** của control (không chặn submit lần sau); nó chỉ hiển thị.
- Field lỗi đầu tiên **theo thứ tự trong trang** (không theo thứ tự key) được focus.
- Key không khớp field nào được liệt kê dạng văn bản trong khung tổng hợp (và khung tự hiện khi có key như vậy).
- Key lạ/độc hại không bao giờ làm `apply()` ném lỗi.

PHP thuần (không Laravel) chỉ cần trả JSON cùng dạng: `{"errors": {"email": ["Email đã tồn tại"]}}`.

### 5. Key lỗi → field nào? (`fieldMap`, tên có dấu chấm, `data-field`)

Với mỗi key, helper tìm **bên trong root** theo thứ tự:

1. `fieldMap[key]` — một `Element` (phải nằm trong root) hoặc **id** của phần tử;
2. theo `name`, thử lần lượt: chính key → dạng ngoặc của key có dấu chấm (`items.0.name` → `items[0][name]`) → dạng mảng
   PHP (`tags` → `tags[]`, `tags.0` → `tags[]`);
3. `[data-field="key"]`.

Phần tử tìm được sau đó được quy về **control thật**: ô `<input>` bên trong control td → host td; phần tử bọc ngoài
(ví dụ `div[data-field]`) → control td hoặc control gốc đầu tiên bên trong.

```html
<!-- Key "meta.title" tự khớp name="meta[title]" -->
<input name="meta[title]" aria-label="Tiêu đề SEO">

<!-- Key "cover" không có name tương ứng: dùng data-field trên phần tử bọc -->
<div data-field="cover">
  <input type="file" name="cover_file" aria-label="Ảnh bìa">
</div>
```

```js
// Key server khác hẳn tên field: dùng fieldMap
TdFormValidation.apply(form, errors, { fieldMap: { author_id: 'author-picker', 'publish.at': form.querySelector('#pub') } });
```

### 6. Khung tổng hợp lỗi (`summary`)

| Giá trị | Hành vi |
|---|---|
| `'auto'` (mặc định) | Hiện khi có **≥ 2** lỗi field, hoặc có bất kỳ lỗi server không khớp field |
| `true` | Luôn hiện khi có lỗi |
| `false` | Không bao giờ hiện |

Khung là `div.td-form-summary[role=alert]`: tiêu đề `TdFormValidation.labels.summaryTitle` + danh sách; mỗi lỗi field là
một nút `Nhãn: thông báo` — bấm vào sẽ focus field đó. Nhãn lấy từ attribute `label` của control td, `aria-label`,
`<label>` liên kết, hoặc `aria-labelledby`. Mặc định khung được **chèn vào đầu root**; muốn đặt chỗ khác:

```js
TdFormValidation.validate(form, { summaryTarget: document.getElementById('form-errors') }); // được append, không xoá nội dung cũ
```

Khi `attach()` đang kiểm tra lại, khung tự cập nhật: field hết lỗi thì dòng của nó biến mất, hết dòng thì khung biến mất.

### 7. Xoá lỗi

```js
TdFormValidation.clear(form);   // gỡ dòng lỗi, aria, khung tổng hợp và custom validity do rules đặt
```

`clear()` chỉ gỡ những gì helper đã đặt: `aria-describedby` / `aria-invalid` / `aria-errormessage` do trang tự viết được
giữ/khôi phục.

### 8. Dùng trong modal (TdModal)

```js
import { TdModal } from '@dazzxq/td-components/modal';

TdModal.show({
  title: 'Sửa bài',
  body,                                        // một <div> chứa các field
  actions: [
    { label: 'Hủy', value: false },
    {
      label: 'Lưu', variant: 'primary', value: true,
      onClick: async () => {
        if (!TdFormValidation.validate(body, { rules }).valid) return false;   // giữ modal mở, focus field lỗi
        const res = await fetch('/posts/1', { method: 'POST', body: collect(body) });
        if (res.status === 422) {
          TdFormValidation.apply(body, (await res.json()).errors);
          return false;
        }
        return true;                           // đóng modal
      },
    },
  ],
});
```

Action trả `false` giữ modal mở; trong lúc Promise chạy nút ở trạng thái bận (xem [Modal](modal.md)).

### 9. Theo dõi thay đổi chưa lưu (`trackFormDirty`, 0.44.0)

```js
import { TdFormValidation, trackFormDirty } from '@dazzxq/td-components/form-validation';

const tracker = trackFormDirty(form, { ignore: ['_token', 'q'] });
form.addEventListener('dirty-change', (e) => { badge.hidden = !e.detail.dirty; });   // huy hiệu "Chưa lưu"

TdFormValidation.attach(form, {
  onValid: async () => {
    const res = await save(new FormData(form));
    if (res.ok) tracker.markClean();         // CHỈ khi server lưu thành công; 422 → vẫn bẩn
  },
});
```

**"Bẩn" nghĩa là gì.** Lúc gọi `trackFormDirty(form)` kit chụp **ảnh chụp** (snapshot) = danh sách `[name, value]`
theo thứ tự của `new FormData(form)`. Form bẩn khi **người dùng đã thao tác** và ảnh chụp hiện tại khác ảnh chụp gốc —
gõ rồi xoá về giá trị cũ là **sạch** lại. Cụ thể:

- Tính mọi control native (`input`, `textarea`, `select`, checkbox, radio, file) **và** mọi control td form-associated
  (`td-input-field`, `td-dropdown`, `td-chip-input`, `td-table` có cột chọn, `td-dropzone`, `td-media-field`, `td-media-gallery` — thêm / gỡ / sắp lại / alt / crop…), kể cả
  control ở ngoài form gắn `form="id"`. Control `disabled`, không có `name`, nút submit không tính.
- Chuỗi so **nguyên văn** (không trim); file so theo **đối tượng** (chọn lại một file khác cùng tên / cỡ vẫn là đổi);
  **thứ tự** có ý nghĩa (sắp lại gallery / repeater = đổi).
- Chỉ **sự kiện của người dùng** mới bật trạng thái bẩn: `input`, `change` và các event td đổi FormData mà không phát
  `change` — `select-change` (td-table), `files-change` (td-dropzone), `rows-change` (td-repeater), `order-change`
  (td-sortable), `crop-change` / `focal-change` (td-cropper). Event có `detail.trigger === 'api'` hoặc
  `detail.source === 'api'` không tính. Danh sách ở `trackFormDirty.events`; thêm cho một form bằng `opts.events`.
- **Giá trị gán bằng code không làm form bẩn** (quy ước "gán im lặng" của kit): component nâng cấp / hydrate SSR /
  dropdown remote nạp xong sau khi tạo tracker không bao giờ tạo "bẩn giả" — ảnh chụp gốc được chụp lại khi người dùng
  lần đầu chạm / focus vào form. App tự đổi giá trị cần được tính → `tracker.markDirty()` hoặc `tracker.check()`.
- State **ngoài FormData** (tab đang mở, cây đang mở rộng…) không được theo dõi → `markDirty()`.

**API**

| Thành viên | Mô tả |
|---|---|
| `trackFormDirty(form, opts?)` | Tạo tracker. Chỉ nhận `<form>` (khác → `TypeError`). Gọi lại trên cùng form → trả **tracker cũ** (tuỳ chọn mới bị bỏ + `console.warn`). |
| `opts.ignore` | `string[]` hoặc `(name) => boolean` — field không bao giờ tính (`_token`, ô tìm kiếm). |
| `opts.events` | `string[]` — event "người dùng đổi giá trị" thêm cho form này. |
| `opts.beforeUnload` | `boolean`, mặc định `true` — cảnh báo khi rời trang lúc bẩn. |
| `tracker.isDirty()` | Tính tươi, không phát event. |
| `tracker.check()` | Tính lại ngay; phát `dirty-change` nếu đổi; trả `boolean`. |
| `tracker.markClean()` | Gọi **sau khi lưu thành công**: ảnh chụp gốc = hiện tại, sạch. |
| `tracker.markDirty()` | Bẩn cho tới `markClean()`. |
| `tracker.confirmDiscard(opts?)` | `Promise<boolean>`. Sạch → `true` ngay. Bẩn → hộp `TdModal.confirm` màu danger (`Thay đổi chưa lưu` / `Bạn có thay đổi chưa lưu. Bỏ các thay đổi này?` / `Bỏ thay đổi` / `Ở lại`, theo theme của form); `opts` ghi đè tuỳ chọn của `confirm()`; `opts.confirm: (dialogOptions) => Promise<boolean>` thay hộp thoại (site có dialog riêng). **Không** tự `markClean()`. TdModal được nạp lười (`import()`) — trang chỉ validate không kéo modal vào. |
| `tracker.destroy()` | Gỡ mọi listener. |
| `trackFormDirty.labels` | `{ discardTitle, discardMessage, discardConfirm, discardCancel }` — đổi cho cả site. |
| `trackFormDirty.events` | Danh sách event mặc định (mảng, sửa được cho cả site). |
| event `dirty-change` | Trên form, `detail: { dirty }`, bubbles, không huỷ được. Phát khi trạng thái đổi (sự kiện gõ được gom theo khung hình). |

**Chặn đóng modal / drawer / đổi route** — một dòng:

```js
TdModal.show({ title: 'Sửa', body: form, beforeClose: () => tracker.confirmDiscard(), actions });  // xem Modal § 8
drawer.beforeClose = () => tracker.confirmDiscard();                                            // xem Drawer § 6
router.beforeEach(async () => tracker.confirmDiscard());                                       // SPA
```

Trong modal: bọc thân modal trong `<form>` (FormData + `reset` chuẩn). Guard chạy cho **mọi** action đóng, kể cả "Lưu"
→ lưu thành công thì `markClean()` **trước khi** `onClick` trả về, nếu không sẽ bị hỏi "Bỏ thay đổi?" ngay sau khi lưu
(cố ý: quên `markClean` thì `beforeunload` cũng cảnh báo sai).

**Rời trang (`beforeunload`).** Listener chỉ được đăng ký từ thao tác đầu tiên (và gỡ khi form sạch lại) — trang
không tương tác vẫn vào bfcache. Khi trang sắp rời đi, kit tính lại ngay: form sạch hoặc đã bị gỡ khỏi DOM → không
hỏi. **Submit native** của form được miễn **một lần** khi nó thật sự điều hướng chính cửa sổ này: cuối cùng không bị
`preventDefault()` (kể cả handler `window` đăng ký sau kit), không phải `method="dialog"`, và `target` (của nút submit
`formtarget`, rồi của form, rồi `<base target>`) rỗng hoặc `_self` — `_blank`, tên iframe… không được miễn. Thao tác
tiếp theo, `markDirty()`, `reset`, `check()` thấy bẩn mới đều huỷ lần miễn đó. Giới hạn của trình duyệt:

- Chữ trong hộp thoại là của trình duyệt (thông điệp tuỳ biến bị bỏ qua từ lâu).
- Chrome / Firefox chỉ hiện hộp khi trang **đã có tương tác người dùng**.
- **Safari iOS và nhiều trình duyệt di động không hiện** (tab bị huỷ / chuyển app không có `beforeunload`) — đừng coi
  đây là lớp bảo vệ duy nhất; guard modal / drawer vẫn hoạt động.
- Không chạy cho điều hướng trong SPA → gọi `confirmDiscard()` trong router. Nút Back của trình duyệt trong SPA không
  chặn được (`popstate` không huỷ được).

**Lưu bằng AJAX / native.** AJAX (`attach({ onValid })`, action modal) → `markClean()` khi server OK; 422 → giữ bẩn.
Form submit native → không cần gì (trang mới tải lại). `form.reset()` được tính như một thao tác: sau `markClean()`
với giá trị khác mặc định, reset làm form **bẩn** (đúng — giá trị khác cái đã lưu).

## API

Tất cả là method tĩnh; không cần tạo instance.

| Method | Chữ ký | Trả về |
|---|---|---|
| `validate(root, opts?)` | `root: HTMLElement` | `{ valid: boolean, errors: Array<{ element, name, message }>, invalid }` — `invalid` là tên khác của `errors`. `root` không phải `HTMLElement` → `{ valid: true, errors: [], invalid: [] }`. |
| `apply(root, serverErrors, opts?)` | `serverErrors: { [key]: string \| string[] }` | `{ applied: Array<{ field, element, message }>, unmapped: Array<{ field, message }>, unmatched }` — `unmatched` là tên khác của `unmapped`. |
| `clear(root)` | | `void` |
| `attach(form, opts?)` | `form: HTMLFormElement` | `() => void` (hàm detach). Ném `TypeError` nếu không phải `<form>`. |
| `trackFormDirty(form, opts?)` | named export (0.44.0) | Tracker thay đổi chưa lưu — xem [mục 9](#9-theo-dõi-thay-đổi-chưa-lưu-trackformdirty-0440). |

**Tuỳ chọn**

| Tuỳ chọn | Dùng ở | Kiểu | Mặc định | Mô tả |
|---|---|---|---|---|
| `rules` | validate, attach | `{ [name]: (value, control, root) => string }` | — | Luật JS (mục 2). |
| `messages` | validate, attach | `{ [name]: string \| { [flag]: string } }` | — | Ghi đè thông báo cho từng field (mục [Thông báo](#thông-báo-tiếng-việt-và-cách-đổi)). |
| `summary` | validate, apply, attach | `'auto' \| true \| false` | `'auto'` | Khung tổng hợp. |
| `summaryTarget` | validate, apply, attach | `HTMLElement \| null` | `null` | Nơi đặt khung (append). `null` → đầu root. |
| `focus` | validate, apply, attach | `boolean` | `true` | Focus field lỗi đầu tiên (chỉ `focus()`, trình duyệt tự cuộn tới; không cuộn mượt). |
| `fieldMap` | apply | `{ [key]: string \| Element }` | — | Key → id hoặc phần tử trong root. |
| `live` | attach | `boolean` | `true` | Kiểm tra lại khi sửa sau lần submit lỗi đầu. |
| `onValid` | attach | `(event, form) => void` | — | Có → luôn chặn submit, gọi hàm khi hợp lệ. Ném lỗi đồng bộ → `console.error` (0.16.0). |

**Hàm thuần xuất kèm** (cùng module, dùng được riêng):

| Hàm | Mô tả |
|---|---|
| `nameCandidates(key)` | Danh sách tên thử cho một key, theo thứ tự: `nameCandidates('items.0.name')` → `['items.0.name', 'items[0][name]', 'items.0.name[]']`; `nameCandidates('tags.0')` → `['tags.0', 'tags[0]', 'tags[]', 'tags.0[]']`. |
| `formatMessage(template, values)` | Điền `{tên}` bằng giá trị (thiếu → chuỗi rỗng); văn bản thuần. |
| `firstMessage(value)` | Thông báo đầu tiên không rỗng của một giá trị lỗi Laravel (chuỗi hoặc mảng lồng). |

```js
import { nameCandidates, formatMessage, firstMessage } from '@dazzxq/td-components/form-validation';
```

## Thông báo tiếng Việt và cách đổi

**Control gốc**: `validationMessage` của trình duyệt theo ngôn ngữ trình duyệt, nên helper dùng bảng
`TdFormValidation.messages` (tiếng Việt). Mỗi control chỉ hiện **một** thông báo, chọn theo thứ tự cờ: `valueMissing`,
`typeMismatch`, `badInput`, `patternMismatch`, `tooShort`, `tooLong`, `rangeUnderflow`, `rangeOverflow`, `stepMismatch`,
`customError`.

| Key | Mặc định | Ghi chú |
|---|---|---|
| `valueMissing` | `Trường này là bắt buộc` | |
| `typeMismatch` | `Giá trị không hợp lệ` | |
| `typeMismatchEmail` | `Email không hợp lệ` | `type="email"` |
| `typeMismatchUrl` | `URL không hợp lệ` | `type="url"` |
| `badInput` | `Giá trị không hợp lệ` | Cũng là thông báo dự phòng chung |
| `patternMismatch` | `Giá trị không đúng định dạng` | Nếu control có `title` → dùng `title` |
| `tooShort` | `Tối thiểu {minLength} ký tự` | Từ attribute `minlength` |
| `tooLong` | `Tối đa {maxLength} ký tự` | Từ attribute `maxlength` |
| `rangeUnderflow` | `Giá trị tối thiểu là {min}` | Từ attribute `min` |
| `rangeOverflow` | `Giá trị tối đa là {max}` | Từ attribute `max` |
| `stepMismatch` | `Giá trị không đúng bước nhảy` | `{step}` có sẵn nếu muốn dùng |
| `ruleError` | `Không thể kiểm tra giá trị này` | Luật JS bị ném lỗi |

`customError` (từ `rules` hoặc `setCustomValidity`) hiện đúng chuỗi bạn trả về.

**Control td**: dùng `validationMessage` tiếng Việt **của chính nó** (ví dụ td-dropdown `Vui lòng chọn một tùy chọn`,
td-datetime-picker `TdDatetimePicker.messages`, td-chip-input `TdChipInput.labels.required`). Bảng
`TdFormValidation.messages` chỉ là dự phòng khi control td không có thông báo.

**Đổi cho cả trang** (một lần lúc khởi động):

```js
TdFormValidation.messages.valueMissing = 'Vui lòng nhập trường này';
TdFormValidation.messages.tooLong = 'Không quá {maxLength} ký tự';
TdFormValidation.labels.summaryTitle = 'Có lỗi, vui lòng kiểm tra:';
```

**Đổi cho từng field** (áp dụng cho cả control gốc lẫn control td, ưu tiên cao nhất):

```js
TdFormValidation.validate(form, {
  messages: {
    title: 'Vui lòng nhập tiêu đề',                        // một câu cho mọi lỗi ràng buộc của field này
    email: { valueMissing: 'Nhập email', typeMismatch: 'Email sai định dạng' },   // theo từng cờ
    category: { valueMissing: 'Hãy chọn danh mục' },       // td-dropdown name="category"
  },
});
```

Thông báo từ `rules` không bị `messages` ghi đè. Muốn chuyển sang ngôn ngữ khác, thay toàn bộ các key trên (cùng với
bảng `labels`/`messages` của từng component) — xem [Extending](../customization/extending.md).

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-form-summary-bg` | `color-mix(in srgb, var(--td-color-error) 8%, var(--td-color-surface))` (dark: 12%) | Nền khung tổng hợp |
| `--td-form-summary-border` | `color-mix(in srgb, var(--td-color-error) 75%, var(--td-color-surface))` | Viền khung |
| `--td-form-summary-fg` | `var(--td-color-error)` | Màu chữ khung |
| `--td-form-summary-pressed-bg` | `var(--td-color-pressed)` (dark: `rgb(0 0 0 / 40%)`) | Nền link khi nhấn (0.42.1: dark làm tối nền thay vì phủ trắng — chữ lỗi 6.3:1, trước 3.30) |
| `--td-form-summary-radius` | `var(--td-radius-md)` | Bo góc khung |

Dòng lỗi dưới field là `.td-field-error` (màu `--td-field-error`, chữ `--td-text-xs`).

**td.css không style control gốc khi lỗi.** Site tự viết rule, ví dụ:

```css
input[aria-invalid="true"],
select[aria-invalid="true"],
textarea[aria-invalid="true"] {
  border-color: var(--td-field-error);
}
```

Control td tự có viền đỏ qua error contract của chúng.

## Cấu trúc DOM & class

Helper chỉ ghi những thứ sau:

```html
<!-- Control gốc có lỗi -->
<input id="title" name="title" required aria-invalid="true" aria-errormessage="title-error"
       aria-describedby="title-hint title-error">
<span class="td-field-error" id="title-error" data-for="title" data-td-fv="">Trường này là bắt buộc</span>

<!-- Khung tổng hợp (đầu root, hoặc cuối summaryTarget) -->
<div class="td-form-summary" role="alert" data-td-fv="">
  <p class="td-form-summary__title">Vui lòng kiểm tra lại các trường sau:</p>
  <ul class="td-form-summary__list">
    <li class="td-form-summary__item"><button type="button" class="td-form-summary__link">Tiêu đề: Trường này là bắt buộc</button></li>
    <li class="td-form-summary__item">Máy chủ bận</li>   <!-- lỗi server không khớp field: chỉ là chữ -->
  </ul>
</div>
```

- Control gốc không có `id` sẽ được gán `td-fv-N`. Dòng lỗi có id `{control-id}-error`.
- Dòng lỗi được chèn **ngay sau** control; nếu control nằm trong một `<label>` bọc ngoài thì chèn sau `<label>` đó. Với
  nhóm radio: sau radio cuối.
- `aria-describedby` được **gộp** với id có sẵn; khi gỡ chỉ bỏ id của helper.
- Control td (có error contract) nhận `setError(message)` và tự vẽ dòng lỗi theo DOM của nó; custom element khác có
  method `setError()` cũng được gọi như vậy.
- `data-td-fv` đánh dấu phần tử do helper tạo.

Render lỗi phía server (PHP, không JS) chỉ cần in đúng markup trên để có cùng giao diện và trợ năng — xem
[WordPress & PHP](../guides/wordpress-php.md).

## Bàn phím & trợ năng

- Focus field lỗi đầu tiên theo **thứ tự trong trang**; với control td, focus được chuyển vào control bên trong.
- `aria-invalid` + `aria-errormessage` + `aria-describedby` trên control → trình đọc màn hình đọc lỗi khi focus.
- Khung tổng hợp là `role="alert"` (được đọc ngay), mỗi lần tạo là một phần tử mới để chắc chắn được đọc lại. Mỗi mục là
  một `<button>` nên dùng được bằng bàn phím; khi `pointer: coarse` nút cao ≥ 44px.
- Không có hiệu ứng cuộn mượt.

## Bảo mật

- Mọi thông báo (kể cả từ server), nhãn và tiêu đề được đưa vào DOM bằng `textContent` — HTML trong thông báo lỗi hiển
  thị thành chữ.
- Key từ server được escape (`CSS.escape`) trước khi dùng trong selector, và chỉ tìm **trong root** — một key không thể
  trỏ tới phần tử ngoài form. `fieldMap` là id cũng chỉ tìm trong root.
- Luật ném lỗi → field không hợp lệ (fail closed); `attach()` crash → chặn submit.
- Kiểm tra phía trình duyệt chỉ để trải nghiệm người dùng; **server luôn phải kiểm tra lại**.

## Lưu ý & lỗi thường gặp

- **Quên style `[aria-invalid="true"]`** cho control gốc → chỉ thấy dòng chữ đỏ, không thấy viền đỏ.
- **Dùng `validate-on` của td-input-field cùng lúc với `attach()`** → lỗi bị xử lý hai lần.
- **`tooShort` / `tooLong` không báo khi giá trị được gán bằng code**: theo chuẩn HTML, trình duyệt chỉ kiểm tra
  `minlength` / `maxlength` với giá trị người dùng đã sửa. Cần kiểm tra chắc chắn → thêm một `rules`.
- **`apply()` thay thế lỗi cũ**, kể cả lỗi của `validate()`. Muốn gộp, tự ghép object lỗi trước khi gọi.
- **Key rules theo `name`**, không theo id: control không có `name` thì không có luật.
- **Field bị disabled / readonly / hidden không được kiểm tra** (`willValidate` là `false`), nhưng `apply()` vẫn gắn được
  lỗi server lên chúng nếu tìm thấy.
- `detach()` không xoá lỗi đang hiện — gọi `TdFormValidation.clear(form)` nếu cần.
- **Quên `tracker.markClean()` sau khi lưu** → modal / drawer hỏi "Bỏ thay đổi?" ngay sau khi lưu, `beforeunload`
  cảnh báo sai. Gọi nó ngay khi server báo thành công.
- **App gán giá trị bằng code mà muốn tính là thay đổi** → `markDirty()` (gán bằng code không phát event).
- Khung tổng hợp chèn vào **đầu root**; nếu root là `<form>` có layout grid/flex, cân nhắc `summaryTarget`.

## Xem thêm

- [Hướng dẫn form](../guides/forms.md) — FormData, reset, fieldset disabled, luồng đầy đủ với lỗi server
- [Input field](input-field.md) · [Dropdown](dropdown.md) · [Datetime picker](datetime-picker.md) ·
  [Chip input](chip-input.md) · [Modal](modal.md)
- [Extending (đổi ngôn ngữ)](../customization/extending.md) · [Bảo mật](../guides/security.md) ·
  [Trợ năng](../guides/accessibility.md)
