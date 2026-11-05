[Tài liệu](../README.md) › [Components](README.md) › Icon picker

# Ô chọn icon — `<td-icon-picker>`

Ô chọn **một icon** đã đăng ký trong [registry icon](icons.md) (icon core của kit và icon riêng của site) cho form cài
đặt (icon của mục menu, của danh mục, của khối…). Ô hiện icon đang chọn + **tên** của nó; bấm mở một popup có ô tìm
kiếm, nhóm **Gợi ý** (tuỳ chọn, do trang truyền) và lưới ô vuông icon xếp A–Z. Tìm được **có hoặc không dấu**, bằng
tên, nhãn tiếng Việt hoặc từ khoá tiếng Anh / tiếng Việt.

Form-associated: form gửi `name=<tên icon>` (hoặc rỗng). Có helper PHP `td_icon_picker()` (in sẵn khung, nhận **tại chỗ**
khi JS tải xong) và **`td_icon_value()` để chuẩn hoá phía server — bắt buộc gọi khi nhận POST** (xem
[Phía server](#phía-server-bắt-buộc)).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/icon-picker'` (class và hàm: `import { TdIconPicker, registerIconSearchData } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | có (một mục: tên icon canonical hoặc `''`) |
| Từ phiên bản | 0.94.0 (token-native: cần `td.css`) |

**Ngoài phạm vi:** chọn nhiều icon, tải icon từ URL hoặc chuỗi
SVG, bản không-JS (không có JS thì ô chỉ là nút + input ẩn mang giá trị, không mở được lưới), nhãn tiếng Anh cho giao
diện của picker (đổi chữ qua `TdIconPicker.labels`, đổi dữ liệu tìm kiếm qua hook `loadSearchData`).

## Ví dụ nhanh

```html
<form method="post" action="/cai-dat">
  <td-icon-picker name="menu_icon" label="Icon mục menu" value="settings"
                  suggestions="home user settings folder file-text bell"></td-icon-picker>
  <button type="submit" class="td-btn td-btn--primary">Lưu</button>
</form>

<script type="module">
  import '@dazzxq/td-components/icon-picker';

  const el = document.querySelector('[name="menu_icon"]');
  el.addEventListener('change', (e) => console.log('đã chọn', e.detail.value)); // "folder"
</script>
```

Icon riêng của site (đặt tiền tố `site-`, xem [Icon của site](#icon-của-site-và-dữ-liệu-tìm-kiếm)):

```js
import { registerIcons } from '@dazzxq/td-components/icons';
import { registerIconSearchData } from '@dazzxq/td-components/icon-picker';

registerIcons({ 'site-film': { nodes: [['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }]] } });
registerIconSearchData({
  'site-film': { label: 'Phim', keywords: { en: ['film', 'movie'], vi: ['phim', 'video clip'] } },
});
```

## Giá trị

- **Giá trị** là **tên icon đã đăng ký**, lưu dạng **canonical**: đặt `value="x"` (alias của `close`) thì `value`,
  `getValue()`, FormData và `detail.value` đều là `close`. Rỗng = chưa chọn.
- Tên đúng định dạng (`^[a-z][a-z0-9-]{0,63}$`) nhưng **chưa đăng ký** (icon site đăng ký muộn, hoặc server lưu icon mà
  trang này chưa nạp): **giữ nguyên** làm giá trị form (không mất dữ liệu), ô hiện tên đó không kèm hình
  (`data-state="unknown"`); đăng ký xong thì hình hiện ở lần vẽ lại / mở sau.
- Sai định dạng hoặc dài hơn 64 ký tự → coi như rỗng + một `console.warn`.
- Mặc định chữ trên ô là **tên canonical** (JS và PHP giống nhau, không chờ dữ liệu tìm kiếm, không nháy chữ); nhãn tiếng
  Việt chỉ hiện trong popup (dòng chú thích dưới lưới và tên đọc của từng ô). Ngoại lệ opt-in: `trigger-text="label"`
  (0.96.1, xem [dưới](#chữ-trên-ô-là-nhãn-trigger-textlabel)) cho ô hiện nhãn.

## Tuỳ chọn thêm (0.96.1)

Mọi thứ dưới đây là **opt-in**: không bật thì popup, ô và markup SSR giống hệt 0.94.0.

### Chữ trên ô là nhãn (`trigger-text="label"`)

Mặc định ô hiện **tên canonical** (`trash`). `trigger-text="label"` đổi thành **nhãn tiếng Việt** (`Thùng rác`). Thứ tự chọn
chữ: `value-label` (chỉ khi giá trị vẫn là giá trị server đã in) → nhãn trong dữ liệu tìm kiếm (kit + site) → tên canonical.

- Từ PHP: `td_icon_picker()` in nhãn + `value-label` nên JS nhận **tại chỗ**, không nháy chữ.
- Chỉ có JS: lúc đầu ô hiện tên; kit **không** tải dữ liệu tìm kiếm chỉ để vẽ ô, nên nhãn xuất hiện sau lần mở popup đầu
  (hoặc khi site đã nạp dữ liệu). Đổi `value` bằng code thì `value-label` hết tác dụng, nhãn lấy từ dữ liệu tìm kiếm.
- `value-label` / nhãn luôn vào DOM bằng `textContent`.

### Ô "Không icon" (`none-option`, `none-value`)

`none-option` thêm một ô rộng "Không icon" (biểu tượng `ban`) **trên cùng** popup. Chọn nó thì giá trị là `''`, phát `input` +
`change` một lần; chọn khi đang rỗng chỉ đóng popup. Ô này **ẩn** khi đang gõ tìm, khi đang lọc một nhóm, và khi `required`
(mà không có `none-value`).

`none-value="none"` cho ô này một **giá trị riêng** thay cho `''` (hợp với cột DB cần phân biệt "chưa chọn" và "cố ý không
icon"): chọn ô thì `value === 'none'`, FormData gửi `none`, ô hiện `ban` + "Không icon" (`data-state="none"`), nút xoá đưa về
`''`. `none-value` phải khớp `^[a-z][a-z0-9-]{0,47}$` và **không** được là tên icon đã đăng ký (hoặc alias); sai thì bỏ như
`''` + một `console.warn`. Có `none-value` thì `required` vẫn cho ô hiện (vì nó là một giá trị hợp lệ). Phía server dùng
`td_icon_value($v, ['none_value' => 'none'])`.

### Nhóm và hàng lọc (`groups`)

Property `groups` (hoặc `TdIconPicker.groups` cho cả site; **instance thắng**, `null` thì dùng static):

```js
picker.groups = [
  { key: 'actions', label: 'Thao tác', icons: ['trash', 'search', 'check'] },
  { key: 'places', label: 'Điều hướng', icons: ['home', 'settings'] },
];
```

- Thứ tự popup: Không icon (nếu có), Gợi ý, **các nhóm theo thứ tự đưa vào**, "Tất cả". Icon nằm ở nhiều nhóm thì hiện ở mỗi nhóm.
  Icon không thuộc nhóm nào vào nhóm **Khác** (hoặc gộp vào nhóm có `key: 'other'` nếu site khai); nhóm rỗng bị ẩn.
  `icons` của host vẫn giới hạn tập hiện ra.
- `key`: `^[a-z][a-z0-9-]{0,31}$`, không trùng; `label`: 1–48 ký tự (NFC, không ký tự điều khiển); tối đa 50 nhóm, tổng 2000 tên.
  Danh sách sai thì **bỏ cả danh sách** + một cảnh báo, popup quay về lưới phẳng.
- Có từ 2 nhóm trở lên (tính cả "Khác") thì có **hàng lọc**: "Tất cả" + một nút mỗi nhóm đang hiện, kể cả "Khác" (`role="toolbar"`,
  `aria-pressed`, một điểm Tab, ←/→/Home/End đổi nút). Hàng lọc luôn **một hàng**, nhiều nhóm thì cuộn ngang bên trong popup. Bấm nhóm thì chỉ còn nhóm đó. Gõ tìm thì về "Tất cả" và kết quả là **một danh sách phẳng** trên mọi nhóm.
- Tên nhóm chưa đăng ký lúc đặt vẫn được giữ (xem nạp lười).

### Nạp lười icon của site

Hook `TdIconPicker.loadSearchData` (xem [trên](#tìm-kiếm-và-dữ-liệu-tìm-kiếm)) vốn chỉ trả metadata, nay cũng là chỗ **nạp thêm bộ icon**:
trong hook, site có thể `registerIcons(...)` và/hoặc gán `TdIconPicker.groups` rồi trả metadata. Kit chỉ tính lại danh sách,
nhóm và chữ trên ô **sau khi** hook xong; trong lúc đang tải, cảnh báo "chưa đăng ký" của `icons` / `suggestions` / `groups`
được hoãn (tên site đặt trước vẫn được giữ). Mục metadata sai bị bỏ riêng từng mục + một cảnh báo; hook lỗi thì có "Thử lại"
(dùng `hasIcon()` để không đăng ký trùng).

**Công thức: bộ icon lớn của site, nạp khi mở.** Bọc hook gốc, chỉ đăng ký tên chưa có, trả metadata site **cùng** metadata
kit (đi đường kiểm từng mục: mục sai chỉ bị bỏ, không hỏng cả lô như `registerIconSearchData`), và gán nhóm ngay trong hook:

```js
import { TdIconPicker } from '@dazzxq/td-components/icon-picker';
import { registerIcons, hasIcon } from '@dazzxq/td-components/icons';

const kitLoader = TdIconPicker.loadSearchData; // giữ hook gốc (metadata của 188 icon core)
TdIconPicker.loadSearchData = async () => {
  const [kit, site] = await Promise.all([kitLoader(), import('/assets/site-icons.js')]); // site: { icons, search, groups }
  const missing = Object.fromEntries(Object.entries(site.icons).filter(([name]) => !hasIcon(name)));
  if (Object.keys(missing).length) registerIcons(missing); // "Thử lại" gọi lại hook: không đăng ký trùng
  TdIconPicker.groups = site.groups; // [{ key, label, icons }]
  return { ...kit, ...site.search }; // metadata kit + site, kiểm từng mục
};
```

- Kit tự nhớ kết quả hook (một lần cho mọi picker); hook lỗi thì lần mở sau / "Thử lại" gọi lại.
- Icon của **giá trị đang lưu** nên được đăng ký sớm (trước lần mở đầu, ví dụ một module nhỏ chỉ chứa các icon đang dùng
  trên trang) để ô có hình ngay; không thì ô hiện tên (`data-state="unknown"`) cho tới khi hook xong.

**Công thức: icon site trùng nghĩa với icon kit.** Kit không biết hai icon nào "cùng nghĩa". Muốn ẩn bản thừa: loại nó khỏi
danh sách `icons` (allowlist) **và** không để nó trong `suggestions`. Chỉ bỏ nó khỏi `groups` thì **không** ẩn được: mọi icon
đã đăng ký mà không thuộc nhóm nào sẽ vào "Khác".

### Thuộc tính và property mới

| Thuộc tính | Property | Ý nghĩa |
|---|---|---|
| `trigger-text="label"` | — | Ô hiện nhãn thay cho tên |
| `value-label` | — | Nhãn server in cho giá trị hiện tại (PHP tự in) |
| `none-option` | `noneOption` | Có ô "Không icon" |
| `none-value` | `noneValue` | Giá trị của ô đó (mặc định `''`) |
| — | `groups` | Mảng nhóm; static: `TdIconPicker.groups` |

Chữ mới trong `TdIconPicker.labels`: `none` ("Không icon"), `noneGroup` ("Bỏ chọn icon", tên đọc của lưới một ô), `filter`
("Lọc theo nhóm"), `filterAll` ("Tất cả"), `ungrouped` ("Khác"). Class mới: `td-icon-picker-panel__filters`, `td-icon-picker-panel__filter`,
`td-icon-picker-panel__cell--none`.

## Phía server (bắt buộc)

Client **không phải** ranh giới tin cậy: client bất kỳ POST được chuỗi tuỳ ý. **Mọi** giá trị icon nhận được phải qua
`td_icon_value()` **trước** khi kiểm / lưu:

```php
$v = td_icon_value($_POST['menu_icon'] ?? null);   // 'x' → 'close', '' → '', null → ''
if ($v === null) { http_response_code(422); exit; } // tên lạ, sai định dạng, mảng, số… → null
// lưu $v: một tên icon đã đăng ký phía PHP, hoặc ''
```

Laravel (dsuite):

```php
$v = td_icon_value($request->input('menu_icon'));
if ($v === null) abort(422);
$menu->icon = $v;
```

`td_icon_value()` chỉ nhận chuỗi khớp `^[a-z][a-z0-9-]{0,63}$` **và** được `Td::hasIcon()` biết (core hoặc
`Td::registerIcons()`); alias được đổi sang tên đích. Icon site chỉ đăng ký bên JS thì PHP không biết → `null`: đăng ký
cùng dữ liệu icon ở cả hai phía (xem [adapter PHP](../guides/php-adapter.md#td_icon-và-icon-riêng-của-site)).

## Popup

Bấm ô, hoặc Enter / Space / ↓ / Alt+↓ trên ô để mở. Popup dựng **mỗi lần mở** (icon site đăng ký sau sẽ có ở lần mở
sau), đưa ra `<body>`, nổi trên modal / drawer, theo theme của vùng chứa ([Theme theo
vùng](../customization/theming.md#theme-theo-vùng)).

- **Focus khi mở:** con trỏ chuột → ô tìm kiếm. Màn hình cảm ứng → ô đang chọn (hoặc ô đầu), **không** bật bàn phím ảo.
- **Ô tìm kiếm:** lọc ngay khi gõ. Rỗng → nhóm "Gợi ý" (nếu trang truyền) + "Tất cả icon". Có chữ → ẩn "Gợi ý", nhóm
  còn lại thành "Kết quả" xếp theo độ khớp. Không có kết quả → "Không tìm thấy icon phù hợp". Dòng trạng thái
  (`role="status"`) báo "{n} icon" sau 300 ms ngừng gõ.
- **Enter** trong ô tìm (đang có chữ và có kết quả) chọn kết quả đầu. **↓** đưa focus vào lưới.
- **Chọn:** bấm / Enter / Space trên ô → đặt giá trị, phát `input` + `change` (nếu khác), đóng, focus về ô. Chọn lại icon
  đang chọn → chỉ đóng. **Nút xoá** (×) → giá trị `''`.
- **Đóng:** Escape (focus về ô, không đổi giá trị), bấm ra ngoài, cuộn làm ô khuất, host `disabled` / `readonly` / bị
  gỡ. Tab / Shift+Tab xoay vòng trong popup: ô tìm → lưới Gợi ý → lưới chính → "Thử lại".
- **Tên icon:** rê chuột hoặc focus một ô → dòng chú thích dưới lưới hiện "{nhãn} · {tên}" (ví dụ "Thùng rác ·
  trash"); rời ra → về icon đang chọn. Không có tooltip trên từng ô. Cảm ứng không có rê: chạm hoặc focus ô để xem
  dòng đó trước khi chọn.
- Số cột: tối đa `--td-icon-picker-columns`, bớt dần (tối thiểu 4) khi màn hình hẹp; bề rộng popup tính theo số cột.

### Bàn phím của lưới

Mỗi lưới là `role="grid"` với **một** điểm Tab (roving tabindex: ô đang chọn, không có thì ô đầu).

| Phím | Tác dụng |
|---|---|
| ← / → | ô trước / sau trong hàng (dừng ở đầu / cuối hàng, không vòng) |
| ↑ / ↓ | hàng trên / dưới cùng cột (hàng cuối ngắn → ô cuối); ↑ ở hàng đầu lưới đầu → về ô tìm |
| Home / End | đầu / cuối hàng |
| Ctrl+Home / Ctrl+End | ô đầu / cuối lưới |
| PageUp / PageDown | lùi / tiến số hàng vừa khung nhìn |
| Enter / Space | chọn |
| Escape | đóng |

## Tìm kiếm và dữ liệu tìm kiếm

- **Chuẩn hoá:** bỏ dấu (`thung rac` = `thùng rác`, `đ` = `d`), không phân biệt hoa thường, `-` / `_` = khoảng trắng
  (`arrow left` = `arrow-left`). Query tối đa 64 ký tự và 8 từ.
- **Thứ tự khớp** (tốt nhất trước, hoà thì theo tên): (0) đúng tên hoặc alias, (1) đúng nhãn hoặc một từ khoá, (2) tên /
  alias bắt đầu bằng query, (3) nhãn / từ khoá có đầu từ bắt đầu bằng query, (4) mọi từ của query là chuỗi con của
  tên ∪ alias ∪ nhãn ∪ từ khoá (từ query dài ≥ 2 ký tự). Ví dụ `x` ra `close` (alias) đầu tiên.
- **Dữ liệu** (nhãn tiếng Việt + từ khoá tiếng Anh và tiếng Việt cho **cả 188 icon core**) nằm trong file riêng
  `src/icons/icons-search.js`, **chỉ tải ở lần mở popup đầu tiên** (một lần cho mọi picker trên trang; trang chỉ dùng
  `tdIcon()` không tải nó). Trong lúc chờ, tìm theo **tên + alias** vẫn chạy và dòng trạng thái báo "Đang tải từ khoá tìm
  kiếm…". Tải lỗi → dòng trạng thái "Không tải được từ khoá — đang tìm theo tên" + nút **Thử lại**; lần mở sau cũng tự
  thử lại.
- **Hook `TdIconPicker.loadSearchData`** (`() => Promise<object>`): mặc định `import('../icons/icons-search.js')`. Site
  thay để dùng bản dịch khác hoặc nguồn khác; mọi mục đi qua cùng validator (mục sai bị bỏ + một cảnh báo).

### Icon của site và dữ liệu tìm kiếm

Icon site (đăng ký bằng [`registerIcons()`](icons.md#đăng-ký-icon-của-site--registericons)) tự có trong lưới ở lần mở
sau, tìm được theo **tên**. Muốn tìm bằng nhãn / từ khoá, đăng ký thêm metadata:

```js
registerIconSearchData({
  'site-film': { label: 'Phim', keywords: { en: ['film', 'movie'], vi: ['phim', 'video clip'] } },
});
```

Luật mỗi mục: đúng hai khoá `label` + `keywords` (`keywords` đúng `en` + `vi`); mọi chuỗi NFC, đã trim, 1–48 ký tự,
không ký tự điều khiển; mỗi ngôn ngữ 1–12 từ khoá, không trùng nhau sau khi bỏ dấu / hoa thường. Tên **không được** là
icon core (metadata core là của kit) hoặc đã có metadata; sai bất kỳ mục nào → ném lỗi và **không mục nào** của lần gọi
đó được đăng ký; tối đa 2000 mục mỗi lần. Gọi trước hay sau `registerIcons()` đều được.

**Đặt tiền tố `site-` cho icon site.** Kit ngày càng thêm tên mới (0.94.0 thêm 113 tên như `user`, `home`, `box`); một
`registerIcons({ home: … })` không tiền tố sẽ **ném lỗi lúc khởi động** khi kit thêm đúng tên đó.

## Gợi ý (`suggestions`) và giới hạn tập icon (`icons`)

- **`suggestions`** (nhóm "Gợi ý" đầu popup): thuộc tính là tên cách nhau bởi khoảng trắng / dấu phẩy
  (`suggestions="home user settings"`, in được từ PHP); **property** `suggestions` là `string[]` và **thắng** thuộc tính.
  Mỗi instance một danh sách riêng. Tên chưa đăng ký / sai định dạng bị bỏ (một `console.warn` mỗi tên), khử trùng, tối
  đa **24**. Icon vừa ở "Gợi ý" vừa ở lưới chính thì hai ô đều `aria-selected`.
- **`icons`** (giới hạn tập trong lưới chính): thuộc tính tên cách nhau bởi khoảng trắng / dấu phẩy, property `icons` là
  `string[]` (thắng). **Rỗng = mọi icon đã đăng ký** (core + site). Tên lạ bị bỏ (warn một lần). Dùng khi site có cả
  trăm icon không dành cho ô này (ví dụ ẩn nhóm `ds-fa-*`). "Gợi ý" ngoài tập vẫn hiện; giá trị hiện tại ngoài tập vẫn
  giữ.
- Chuỗi dài hơn 2 KB (2048 byte) bị bỏ cả chuỗi trước khi tách; chỉ 2000 mục đầu được xem. PHP cùng giới hạn.

## Thuộc tính

| Thuộc tính | Mặc định | Ý nghĩa |
|---|---|---|
| `name` | — | Tên trong form |
| `value` | `''` | Tên icon (alias → canonical); là đích của `form.reset()`; đổi sau đó đặt luôn giá trị sống |
| `label` | — | Nhãn hiện trên ô; không có → `aria-label` của host → chỉ chữ giá trị (+ cảnh báo dev một lần) |
| `placeholder` | `Chọn icon` | Chữ khi chưa chọn |
| `suggestions` | — | Xem trên |
| `icons` | mọi icon | Xem trên |
| `required` | — | Rỗng → `valueMissing` ("Vui lòng chọn icon"); ẩn nút xoá |
| `allow-clear` | bật | `"false"` / `"0"` / `"off"` → không có nút xoá; luôn ẩn khi `required` |
| `disabled` / `readonly` | — | Không mở popup, không xoá (`<fieldset disabled>` cũng vậy; popup đang mở thì đóng). `readonly` vẫn gửi giá trị, `disabled` không gửi |
| `error-text` | — | Lỗi hiển thị (error contract chung) |
| `helper-text` | — | Gợi ý dưới control (chữ); ẩn khi có lỗi. Xem [Hint](hint.md) |
| `aria-label` | — | Tên đọc khi không có `label` |

## Property, method, sự kiện

| | |
|---|---|
| `value` | đọc / ghi, **im lặng** (không phát sự kiện) |
| `suggestions`, `icons` | `string[]` đã chuẩn hoá khi đọc; ghi `string[]` (thắng thuộc tính) |
| `allowClear` | boolean |
| `getValue()` / `setValue(v)` | như `value` |
| `open()` / `close({ focus })` | mở / đóng popup bằng code (`focus: false` không trả focus về ô) |
| `focus()`, `checkValidity()`, `reportValidity()`, `setError(msg)`, `clearError()` | như các control form khác |
| `TdIconPicker.labels` / `.messages` | chữ tiếng Việt, ghi đè được (`{n}`, `{label}`, `{name}`) |
| `TdIconPicker.loadSearchData` | hook nạp dữ liệu tìm kiếm (xem trên) |
| `registerIconSearchData(defs)` | hàm export, metadata cho icon site |

| Sự kiện | `detail` | Khi nào |
|---|---|---|
| `input` | `{ value }` | người dùng đổi giá trị (chọn ô, Enter ở ô tìm, xoá) |
| `change` | `{ value }` | cùng lúc với `input`; không phát khi giá trị cuối bằng giá trị trước |

`input` / `change` **native** của ô tìm kiếm không ra khỏi component. `value` / `setValue()` không phát sự kiện. Không có
sự kiện `open` / `close` (dùng `aria-expanded` của nút).

## Trình đọc màn hình

- Ô là một `button` có `aria-haspopup="dialog"`, `aria-expanded` (và `aria-controls` khi mở); tên truy cập ghép nhãn
  (hoặc `aria-label` của host) với chữ giá trị: "Icon mục menu, settings".
- Popup `role="dialog"` có `aria-label` "Chọn icon". Mỗi nhóm là một `role="grid"` (`aria-labelledby` tiêu đề nhóm) >
  `role="row"` > `button[role="gridcell"]` có `aria-selected` và `aria-label` = **nhãn tiếng Việt** (chưa có dữ liệu thì
  là tên icon). Mọi hàng đều nằm trong DOM nên không cần `aria-rowcount`.
- Lỗi: `aria-invalid` + `aria-errormessage` trên ô.
- Chọn **grid** thay vì listbox vì icon xếp hai chiều: listbox một chiều khiến trình đọc báo ↑ ↓ là "trước / sau" lệch
  với hình thấy được. Hạn chế đã biết: `button[role=gridcell]` đọc hơi khác nhau giữa các trình đọc màn hình.

## Không JS (SSR)

`td_icon_picker()` **luôn** in element `<td-icon-picker data-td-ssr="icon-picker@1">` chứa sẵn cây của component (nút ô
với icon + tên, nút xoá, nhãn) và một `input type="hidden"` mang `name` / `value` để form vẫn gửi được khi chưa có
JS. Có JS: component nhận markup **tại chỗ** (giữ node của ô, focus nếu đang ở ô), gỡ input ẩn (giá trị đi qua
`ElementInternals`, FormData **không** trùng trước / sau nâng cấp). Markup bị sửa (thêm input thứ hai, đổi cấu trúc…) →
render lại an toàn. `name` cũng in trên host (form tách / clone tìm `td-icon-picker[name]` trước khi nâng cấp).

```php
<?= td_icon_picker('menu_icon', [
    'label' => 'Icon mục menu',
    'value' => $menu->icon,                    // 'x' in ra 'close'
    'suggestions' => ['home', 'user', 'settings'],
    'icons' => 'home user settings folder file-text bell',
    'required' => true,
]) ?>
```

Option: `label`, `aria_label`, `value`, `placeholder`, `suggestions` (mảng hoặc chuỗi tên; tối đa 24), `icons` (mảng hoặc
chuỗi tên), `required`, `disabled`, `readonly`, `allow_clear` (`false` = không nút xoá), `helper_text` (hoặc `hint`),
`error`, `class` (trên host), `id` (id của host; ô = `{id}-trigger`), và từ 0.96.1 (opt-in, xem [Tuỳ chọn thêm](#tuỳ-chọn-thêm-0961)) `trigger_text` (`'label'`), `value_label`, `none_option`, `none_value`. Tên lạ trong `suggestions` / `icons` bị bỏ + một
`E_USER_WARNING`; `value` là alias → in tên canonical; tên đúng định dạng nhưng PHP chưa đăng ký → giữ nguyên + một
warning; sai định dạng → in rỗng + warning. Cần `label` hoặc `aria_label`, không có → warning. Chữ trên ô là **tên
canonical** — `td_icon_picker()` và `Td::icon()` **không** đọc dữ liệu tìm kiếm, trừ khi bật `trigger_text => 'label'` (khi đó chữ là `value_label`, hoặc nhãn trong `Td::iconSearchData()`, hoặc tên). Chi tiết:
[PHP adapter](../guides/php-adapter.md#td_icon_picker-và-td_icon_value-0940).

## Tuỳ biến

| Token | Mặc định | |
|---|---|---|
| `--td-icon-picker-cell` | `2.5rem` (cảm ứng: `max(2.75rem, var(--td-touch-min))`) | cạnh một ô trong lưới |
| `--td-icon-picker-columns` | `8` | số cột tối đa (bớt khi hẹp, tối thiểu 4) |
| `--td-icon-picker-max-height` | `20rem` | trần chiều cao vùng cuộn của popup (hết chỗ thì thu theo khung nhìn) |

Ô kích hoạt dùng token `--td-field-*` như các ô khác; popup là bề mặt "popup nhỏ" (nền đặc 94 % + blur + một viền).
Hover chỉ áp trên thiết bị có chuột; ô đang chọn có nền chọn + viền nhấn 2px (và `outline: 2px solid Highlight` ở
forced-colors). Chuyển động chỉ là fade, tắt khi `prefers-reduced-motion`. CSS dùng thuộc tính logic, không có phần
riêng cho RTL.

### Class BEM và trạng thái

`.td-icon-picker` (+ `__label`, `__box`, `__trigger`, `__glyph`, `__text`, `__chevron`, `__clear`) và popup
`.td-icon-picker-panel` (+ `__search`, `__input`, `__body`, `__group`, `__heading`, `__grid`, `__row`, `__cell`,
`__empty`, `__footer`, `__caption`, `__status`, `__retry`). Trạng thái là thuộc tính, không phải class: ô
`:disabled` / `[aria-expanded]` / `[aria-invalid="true"]`, chữ `[data-state="value|empty|unknown"]`, nút xoá `[hidden]`,
popup `[data-state]` / `[data-placement]`, ô lưới `[aria-selected]`.

## Bảo mật và CSP

- Tên, nhãn và từ khoá đi vào DOM bằng `textContent` / `setAttribute` (không `innerHTML` ở đâu trong component). Nhãn site
  chứa `<img onerror=…>` hiện nguyên văn, không tạo phần tử. Hình icon chỉ qua `tdIcon()` (allowlist của registry).
- Dữ liệu tìm kiếm (từ file kit, hook `loadSearchData` hoặc `registerIconSearchData`) đều qua một validator (kiểu, độ
  dài, số phần tử, NFC, không ký tự điều khiển, khoá lạ → lỗi); giới hạn công việc: 2000 mục mỗi lần, query ≤ 64 ký tự.
- Giá trị form chỉ là tên đã kiểm định dạng; **server luôn gọi `td_icon_value()`**.
- CSP strict: không `style="…"`, không `<style>`, không `blob:` / `data:`. Bề rộng popup và `max-height` của vùng cuộn
  ghi qua CSSOM. Tải dữ liệu tìm kiếm là `import()` cùng origin (`script-src 'self'` đủ).
