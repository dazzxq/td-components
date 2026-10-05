[Tài liệu](../README.md) › [Components](README.md) › Diff

# So sánh trước / sau theo trường — `<td-diff>`

Bảng "**Trường · Trước · Sau**" cho màn chi tiết audit log / lịch sử thay đổi: đánh dấu **Thêm / Xoá / Đổi** bằng chữ (màu
nền chỉ là lớp phụ), trường bị che hiện `[ĐÃ ẨN]`, mảng quyền / nhãn so như **tập** (+ / −), giá trị dài thu gọn, xem JSON
(tuỳ chọn). Khung hẹp (host dưới 480px) tự chuyển sang bố cục **inline** (mỗi trường một khối "Trước → Sau") — cùng một DOM,
chỉ CSS đổi. Chỉ để **hiển thị**: không form, không event.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/diff'` (class: `import { TdDiff } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | không |
| PHP | `td_diff(array $items, array $o = [])`, `td_diff_snapshots($before, $after, array $o = [])` — markup đầy đủ, chạy không cần JS |
| Từ phiên bản | 0.46.0 (cần `td.css`) |

> **Kit không che dữ liệu.** Server phải bỏ / che bí mật **trước khi gửi** (dsuite: redactor theo `diffPolicy`).
> `masked: true` chỉ điều khiển cách hiển thị và nhãn "Đã che" — xem [Bảo mật](#bảo-mật).

## Ví dụ nhanh

```html
<td-diff id="diff" label="Thay đổi đơn DH10240"></td-diff>

<script type="module">
  import '@dazzxq/td-components/diff';

  document.querySelector('#diff').items = [
    { key: 'total', label: 'Tổng tiền', type: 'money', before: 32990000, after: 31490000 },
    { key: 'status', label: 'Trạng thái', type: 'enum', options: { new: 'Chờ xác nhận', ship: 'Đang giao' },
      before: 'new', after: 'ship' },
    { key: 'roles', label: 'Quyền', before: ['admin', 'editor'], after: ['editor', 'viewer'] }, // + viewer, − admin
    { key: 'phone', label: 'SĐT khách', masked: true, before: '***678', after: '***901' },       // server đã che
    { key: 'password', label: 'Mật khẩu', masked: true },                                         // chỉ tên trường
  ];
</script>
```

## Cách dùng

### 1. Hai cách đưa dữ liệu

| Cách | Hợp với (dsuite `diffPolicy`) | Property |
|---|---|---|
| **Hàng đã phẳng** | `fields` (giá trị cũ / mới đã che), `keys` (chỉ tên trường đổi), `hash_version` (chuỗi do server định dạng) | `items` |
| **Hai snapshot** | `snapshot` (trạng thái ngữ nghĩa cũ / mới do server chọn) | `before` + `after` (+ `fields`) |

- Gán `items` (khác `null`) ⇒ `before` / `after` bị bỏ qua (một cảnh báo nếu có cả hai).
- Mọi property gán **im lặng**; gán liền nhiều property trong cùng một tác vụ chỉ render **một lần** (microtask). Gán trước
  khi phần tử được define / gắn vào trang vẫn được.

Ví dụ ánh xạ từ cột `changes JSON` của dsuite:

```js
// policy fields / keys: [{ key, label?, before?, after?, masked?, kind? }] — dùng thẳng
diff.items = event.changes;

// policy snapshot: { before: {...}, after: {...} }
diff.fields = [{ path: 'status', label: 'Trạng thái', type: 'enum', options: STATUS_LABELS },
  { path: 'lines', label: 'Dòng hàng' }, { path: ['lines', 0, 'qty'], label: 'SL dòng 1' }];
diff.before = event.changes.before;
diff.after = event.changes.after;
```

### 2. Item (`items`)

| Khoá | Kiểu | Mô tả |
|---|---|---|
| `key` | string \| number | **Bắt buộc**, không rỗng. Định danh hàng (nguyên văn, cắt ở 200 ký tự). Thiếu / sai → item bị bỏ + một cảnh báo. |
| `label` | string | Nhãn hiển thị; thiếu → `key`. |
| `before`, `after` | bất kỳ | **Thiếu ≠ `null`** trong JSON view, nhưng cả hai đều là *rỗng* khi so (mục 4). Object / mảng có object → JSON gọn một dòng (`type: 'json'`). |
| `kind` | `'added'` \| `'removed'` \| `'changed'` \| `'unchanged'` | Có → kit **tin** (policy `keys`). Giá trị lạ → kit tự tính + một cảnh báo. |
| `masked` | `true` | Xem mục 5. |
| `type` | `'text'` \| `'number'` \| `'money'` \| `'boolean'` \| `'date'` \| `'enum'` \| `'list'` \| `'json'` | Gợi ý định dạng (mục 3); thiếu → suy từ giá trị. |
| `options` | object | Cho `enum`: mã → nhãn (`{ pending: 'Chờ xử lý' }`). Chỉ khoá **riêng** của object (không đọc prototype). |
| `decimals` | number | Cho `number` / `money`: số chữ số thập phân tối đa (kẹp 0–6), làm tròn half-up **trên chuỗi** (`1.005` → `1,01`). |
| `unit` | string | Cho `number` / `money` (mặc định `₫` với `money`). |

### 3. Định dạng theo `type`

| `type` | Hiển thị |
|---|---|
| `text` (mặc định cho chuỗi) | nguyên văn, giữ xuống dòng; số → chữ số chuẩn không phân cách (hợp cho mã / ID) |
| `number` (mặc định cho số) | `12.990.000`, `1.234,5` (vi-VN); chuỗi thập phân chuẩn (`"12990000"`) cũng được định dạng; dạng mũ (`1e-7`) hiện nguyên |
| `money` | như `number` + ` ₫` (hoặc `unit`) |
| `boolean` (mặc định cho boolean) | "Có" / "Không" |
| `date` | chỉ `YYYY-MM-DD` hợp lệ → `DD/MM/YYYY`; khác → nguyên văn. **Không đổi múi giờ**: ngày giờ có múi giờ → server định dạng sẵn thành chuỗi `text` |
| `enum` | `options[giá trị]` → nhãn; không có → mã gốc. Áp cả cho từng phần tử của mảng (quyền: mã → tên) |
| `list` (mặc định cho mảng toàn giá trị đơn) | từng phần tử; khi **Đổi**: phần tử mới "+", phần tử bị bỏ "−" (so như **tập**) |
| `json` (mặc định cho object sâu) | JSON gọn một dòng; đầy đủ trong JSON view |

Không có hook định dạng tuỳ ý (giữ JS = PHP và text-only): cần gì khác thì app định dạng sẵn thành chuỗi `text`.

**Số lớn:** số nguyên vượt ±(2⁵³ − 1) (`9007199254740993`, `1e21`…) hiện **`[số quá lớn]`** (không bao giờ hiện một con số sai),
số không hữu hạn (`1e309` trong JSON) hiện `[không hỗ trợ]`; hàng đó luôn là **Đổi** + "không so sánh được" (trừ khi bên kia
rỗng) và có ghi chú "server nên gửi dạng chuỗi". **ID, mã, số tiền có thể vượt 2⁵³ − 1 phải gửi dạng chuỗi** (chuỗi luôn hiện
đúng từng chữ). Tiền đồng < 2⁵³ gửi dạng số bình thường.

### 4. Loại thay đổi (kit tính khi không có `kind`)

*Rỗng* = thiếu, `undefined`, `null`, chuỗi chỉ có khoảng trắng, `[]`, `{}`.

| Trước | Sau | Kết quả |
|---|---|---|
| rỗng | có | **Thêm** |
| có | rỗng | **Xoá** |
| có | có, khác | **Đổi** |
| bằng nhau / cả hai rỗng | | không đổi (gom vào "n trường không đổi") |

"Bằng nhau" so theo dạng chuẩn: `1` khác `"1"` (đổi kiểu là thay đổi thật), `1` = `1.0`, object so theo **tập khoá** (thứ tự
khoá không quan trọng), mảng so theo thứ tự.

### 5. Trường bị che (`masked`)

- **Item** `masked: true`: `before` / `after` là **chuỗi** → hiện **nguyên văn** (server đã che sẵn: `***678`, `[ĐÃ ĐỔI]`);
  thiếu / không phải chuỗi → `[ĐÃ ẨN]` (`TdDiff.labels.masked`). Kit **không** chuyển giá trị không-phải-chuỗi thành chữ, không
  đi vào bên trong nó. Không có `kind`: hai bên đều là chuỗi → so như chuỗi (bằng nhau → không đổi); còn lại → **Đổi**.
  Hàng có nhãn phụ "Đã che".
- **Snapshot**: `fields: [{ path: 'card', masked: true }]` che **cả nhánh** (theo đoạn đường dẫn): kit không đọc nhánh đó (kể cả
  getter), hai ô hiện `[ĐÃ ẨN]`, JSON view in `"[ĐÃ ẨN]"` đúng chỗ.
- Giá trị đã che một phần do server gửi (`"***123"`) **không cần** `masked` — đó là chuỗi thường.

### 6. Snapshot: đường dẫn, nhãn, thứ tự

- Kit phẳng hoá **plain object** và mảng tới **6 cấp** (sâu hơn → một ô JSON). Mảng toàn giá trị đơn là **một** hàng `list`;
  mảng có object phẳng theo **chỉ số** (`lines › #2 › qty`) — kit không khớp phần tử theo id: muốn diff ổn định thì server gửi
  object theo khoá (`{ "line:123": {...} }`).
- **Đường dẫn có kiểu** (`FieldDef.path`): mảng đoạn — chuỗi = khoá object (nguyên văn, **không** tách theo `.`), số = chỉ số
  mảng. `'status'` ≡ `['status']`; `'a.b'` là **một** khoá gốc có dấu chấm, khác `['a', 'b']` (a lồng b). `['lines', 0]` (phần
  tử đầu của mảng) khác `['lines', '0']` (khoá `"0"` của object). Đường dẫn sai hình (rỗng, > 7 đoạn, đoạn không phải chuỗi /
  số nguyên ≥ 0) → bỏ + một cảnh báo (chỉ số của nó).
- `FieldDef`: `{ path, label?, type?, options?, decimals?, unit?, masked? }`. Nhãn: `FieldDef` khớp chính xác; không thì nhãn
  của `FieldDef` khớp tiền tố dài nhất + các đoạn còn lại ("Dòng hàng › #2 › qty").
- Thứ tự hàng: theo `fields` trước, rồi các khoá còn lại theo thứ tự trong `after`, rồi `before` (không sort chữ cái). Thứ tự
  khoá = thứ tự của JavaScript (khoá dạng chỉ số mảng `"1"`, `"10"` đứng trước, tăng dần; còn lại theo thứ tự chèn) — PHP làm
  y hệt.

### 7. Giới hạn

| Giới hạn | Giá trị | Vượt thì |
|---|---|---|
| Hàng hiển thị | 500 (hàng thay đổi ưu tiên trước hàng không đổi) | ghi chú "Còn {n} trường không hiện." |
| Nút duyệt mỗi bên / khoá mỗi object / phần tử mỗi mảng / item | 10 000 / 1 000 / 1 000 / 1 000 | dừng + ghi chú "Dữ liệu quá lớn…"; object / mảng quá lớn → "Mảng 1200 phần tử" |
| Giá trị | xem trước 300 ký tự (rồi "Xem đầy đủ"), tối đa 10 000 ký tự ("… đã cắt") | |
| Tổng chữ của một diff | 300 000 ký tự | các giá trị sau chỉ còn bản xem trước + ghi chú |
| JSON view mỗi bên | 100 000 ký tự (cắt ở ranh giới dòng) | "… đã cắt" |
| `list` mỗi bên | 200 phần tử | "+{n} phần tử" |

## Attribute

| Attribute | Mặc định | Mô tả |
|---|---|---|
| `view` | `auto` | `auto`: bảng khi host ≥ 480px, inline khi hẹp hơn · `table`: luôn bảng (cuộn ngang **trong** khung, không bao giờ cuộn trang) · `inline`: luôn inline. Chỉ CSS — đổi không render lại. |
| `unchanged` | `collapse` | `collapse`: hàng không đổi gom vào `<details>` "n trường không đổi" sau bảng · `show`: giữ tại chỗ · `hide`: bỏ |
| `json` | — | Thêm khối `<details>` "Xem JSON" (dữ liệu đã chuẩn hoá, nhánh che = `"[ĐÃ ẨN]"`) |
| `label` | "So sánh thay đổi" | Tên trợ năng của bảng (không có caption hiển thị — đặt heading ngoài) |

## Property

| Property | Mô tả |
|---|---|
| `items` | Mảng item (mục 2) |
| `before`, `after` | Snapshot (object / mảng / giá trị) |
| `fields` | Mảng `FieldDef` cho snapshot |
| `counts` | Chỉ đọc: `{ added, removed, changed, unchanged, hidden, truncated }` — ví dụ "3 trường đổi" trong tiêu đề drawer. `null` khi chưa render từ dữ liệu (kể cả markup PHP đã nhận mà chưa gán dữ liệu) |
| `TdDiff.labels` | Chữ tiếng Việt ghi đè được theo site (static): `table`, `field`, `before`, `after`, `added`, `removed`, `changed`, `masked`, `maskedBadge`, `empty`, `yes`, `no`, `showFull`, `unchanged`, `json`, `jsonBefore`, `jsonAfter`, `more`, `tooLarge`, `textBudget`, `truncated`, `none`, `unsupported`, `unreadable`, `cycle`, `unsafeNumber`, `uncertain`, `unsafeNote`, `invalidJson`, `listAdded`, `listRemoved`, `listMore`, `arraySummary`, `objectSummary`, `root`. `{n}` là con số. PHP: `$o['labels']` cùng khoá |

Không có event, không có method công khai khác.

## Tuỳ biến giao diện

| Token | Mặc định | Dùng cho |
|---|---|---|
| `--td-diff-added-bg` | light `#eef6f1` · dark `#1d3026` | ô "Sau" của Thêm / Đổi |
| `--td-diff-removed-bg` | light `#fbf2f2` · dark `#362628` | ô "Trước" của Xoá / Đổi |
| `--td-diff-added-fg` / `-removed-fg` / `-changed-fg` | `--td-color-success` / `-error` / `-warning` | chữ "Thêm" / "Xoá" / "Đổi" (dấu + / − của mảng dùng màu chữ: đọc được trên nền ô) |
| `--td-diff-muted-fg` | `--td-color-text-muted` | `[ĐÃ ẨN]`, `—`, `⟨U+…⟩`, ghi chú |
| `--td-diff-border` / `--td-diff-head-bg` | `--td-color-border` / `--td-color-surface-muted` | hairline / đầu bảng |
| `--td-diff-label-w` | `30%` | cột "Trường" |
| `--td-diff-json-max-h` | `24rem` | chiều cao tối đa mỗi khung JSON |
| `--td-diff-font-mono` | `--td-font-mono` | JSON, `⟨U+…⟩` |

Hai màu nền ô là token phụ thuộc sáng / tối: chữ, nhãn phụ và chữ muted đọc ≥ 4.7:1 trên chúng (gate `test:contrast` +
`test:page-contrast`). Palette sinh bởi [`td-theme`](../customization/theming.md#palette-tuỳ-biến-td-theme-0420) tự tính hai
màu này cho nền của site. Ghi đè thì site tự kiểm tương phản.

## Cấu trúc DOM & class

```html
<td-diff [view] [unchanged] [json] [label]>
  <div class="td-diff__scroll">
    <table class="td-diff__table" role="table" aria-label="So sánh thay đổi">
      <thead class="td-diff__head" role="rowgroup"><tr role="row">
        <th class="td-diff__th" role="columnheader" scope="col">Trường</th> … Trước … Sau</tr></thead>
      <tbody role="rowgroup">
        <tr class="td-diff__row" role="row" data-kind="changed" data-type="money" [data-masked]>
          <th class="td-diff__field" role="rowheader" scope="row"><span class="td-diff__label">Giá bán</span>
            <span class="td-diff__kind" data-kind="changed">Đổi</span> [<span class="td-diff__uncertain">…</span>] [<span class="td-diff__badge">Đã che</span>]</th>
          <td class="td-diff__cell td-diff__cell--before" role="cell"><span class="td-diff__side" aria-hidden="true">Trước</span>
            <span class="td-diff__value" dir="auto">12.990.000 ₫</span></td>
          <td class="td-diff__cell td-diff__cell--after" role="cell"><span class="td-diff__arrow" aria-hidden="true">→</span>
            <span class="td-diff__side" aria-hidden="true">Sau</span>…</td>
        </tr>
      </tbody></table></div>
  [<p class="td-diff__note">…</p>]
  [<details class="td-diff__unchanged"><summary class="td-diff__summary">4 trường không đổi</summary><div class="td-diff__scroll">…</div></details>]
  [<details class="td-diff__json"><summary class="td-diff__summary">Xem JSON</summary>
     <figure class="td-diff__figure"><figcaption class="td-diff__caption">Trước</figcaption><pre class="td-diff__pre" tabindex="0" aria-label="JSON trước">…</pre></figure>…</details>]
  [<p class="td-diff__empty">Không có thay đổi.</p>]   <!-- thay cho bảng khi không có hàng thay đổi -->
</td-diff>
```

Ô rỗng: `<span class="td-diff__value td-diff__value--empty"><span aria-hidden="true">—</span><span class="td-sr-only">trống</span></span>`.
Giá trị dài: bản xem trước + `<details class="td-diff__more">`. Mảng: `ul.td-diff__list > li.td-diff__item[data-mark="add|del"]`.

## Bàn phím & trợ năng

- Bảng mang role **tường minh** (`table` / `rowgroup` / `row` / `columnheader` / `rowheader` / `cell`): bố cục inline dùng
  `display: block` mà vẫn giữ ngữ nghĩa bảng (WebKit).
- Loại thay đổi là **chữ thật** ("Thêm" / "Xoá" / "Đổi"), không chỉ màu; chế độ tương phản cao (forced colors) mất màu nền
  nhưng giữ chữ. Dấu + / − của mảng là `aria-hidden` + chữ ẩn "thêm" / "bỏ".
- Các `<summary>` ("n trường không đổi", "Xem đầy đủ", "Xem JSON") là control duy nhất: mở bằng Enter / Space, vòng focus của
  kit, vùng chạm ≥ 44px trên màn cảm ứng (≥ 24px với chuột). Khung JSON `tabindex="0"` (cuộn được bằng bàn phím).
- Ghi chú (cắt bớt, số lớn…) là chữ tĩnh, không live region.

## Bảo mật

- **Kit không che gì.** Dữ liệu đã nằm trong trình duyệt khi app gán vào: server phải bỏ / che bí mật **trước khi gửi**
  (dsuite: redactor theo `diffPolicy` — `keys` cho credential / secret, hậu tố 3–4 số cho PII). `masked: true` chỉ là chỉ thị
  hiển thị + nhãn "Đã che"; giá trị không-phải-chuỗi của item che không bao giờ được in (không chuyển thành chữ, không đi vào
  bên trong), nhưng **chuỗi** thì hiện nguyên văn (đã che sẵn ở server).
- Mọi khoá / nhãn / giá trị / option là **chữ** (template đã escape, PHP `htmlspecialchars`): không có cửa HTML thô, không
  link hoá URL / email, không markdown. Ký tự điều khiển C0 / C1 bị bỏ; ký tự định hướng / vô hình (U+202E, U+200B, U+FEFF…)
  **hiện ra** dạng `⟨U+202E⟩` — trang audit cho thấy đúng thứ đã lưu (chống Trojan Source); mỗi giá trị nằm trong phần tử
  `unicode-bidi: isolate` + `dir="auto"`.
- Dữ liệu là **không tin cậy** (giá trị do người dùng khác nhập, khoá JSON tuỳ ý): chỉ duyệt plain object / mảng, khoá riêng
  (`__proto__` từ `JSON.parse` là một hàng bình thường, prototype bị "đầu độc" không thành hàng), getter ném / Proxy →
  `[không đọc được]`, vòng lặp → `[vòng lặp]`; mọi giới hạn (mục 7) chạy **trước** việc tốn kém, chuỗi thô bị cắt trước mọi regex,
  JSON view dùng serializer có ngân sách (không `JSON.stringify` trên input).
- Chi tiết: [security-model §6h](../internal/security-model.md#6h-td-diff-v0460) · [guides/security.md](../guides/security.md#td-diff-che-dữ-liệu-ở-server).

## PHP (không cần JS)

```php
<?= td_diff($event['changes'], ['label' => 'Thay đổi đơn DH10240']) ?>

<?= td_diff_snapshots($row['before_json'], $row['after_json'], [
    'fields' => [['path' => 'status', 'label' => 'Trạng thái', 'type' => 'enum', 'options' => $statusLabels],
                 ['path' => ['lines', 0, 'qty'], 'label' => 'SL dòng 1'],
                 ['path' => 'card', 'masked' => true]],
    'json' => true,
]) ?>
```

- In **markup cuối cùng** (giống hệt `render()` của JS — test parity), host `<td-diff data-td-ssr="diff@1">`; hàng không đổi /
  JSON / "Xem đầy đủ" là `<details>` native nên trang chạy đầy đủ không cần JS. Nạp module `diff` → nhận **tại chỗ** (không
  render lại, không đọc dữ liệu ngược từ DOM); gán `items` / `before` / `after` sau đó → render lại từ dữ liệu.
- Snapshot nên truyền **chuỗi JSON** (cột `changes JSON`): object giữ là object (kể cả `{"0": …}`). `stdClass` cũng được.
  **Mảng PHP** theo quy tắc hẹp: `array_is_list()` → mảng, còn lại → object (mảng kết hợp có khoá đúng `0..n-1` bị hiểu là
  mảng; `[]` = `{}` — cả hai rỗng). JSON sai / sâu hơn 64 cấp / lớn hơn 2 MB → ghi chú, không có hàng, không ném lỗi.
- Options: `fields` (snapshot), `view`, `unchanged`, `json`, `label`, `labels`, `id`, `class`, `attrs` (allowlist; `on*`,
  `style`, `data-td-*` và tên của component bị chặn). Lỗi dữ liệu → **một** `E_USER_WARNING` mỗi lần gọi (chỉ mã, không giá trị).
- Xem [PHP adapter](../guides/php-adapter.md#td_diff--td_diff_snapshots-0460).

## Lưu ý & lỗi thường gặp

- Số tiền / ID lớn gửi dạng **số** JSON → `[số quá lớn]`: gửi dạng chuỗi.
- `FieldDef.path: 'lines.0.qty'` là **một** khoá có dấu chấm, không phải đường dẫn — dùng `['lines', 0, 'qty']`.
- Mảng object bị chèn ở đầu → mọi chỉ số sau lệch (diff theo chỉ số). Gửi object theo khoá nếu cần ổn định.
- Markup PHP đã nhận mà chưa gán dữ liệu: đổi `json` / `unchanged` không có gì để render lại (một cảnh báo, giữ markup);
  `view` và `label` vẫn đổi được.
- Không có diff mức từ / mức dòng (chuỗi dài so cả giá trị) — có thể thêm sau (`granularity`), không phá vỡ.

## Xem thêm

- [Masked value](masked-value.md) — nút "Hiện" giá trị bị che (có audit riêng), đặt ngoài diff nếu cần.
- [Table](table.md) / [Drawer](drawer.md) — danh sách sự kiện audit và khung chi tiết chứa `td-diff`.
- [Theming](../customization/theming.md) · [Responsive](../concepts/responsive.md) · [PHP adapter](../guides/php-adapter.md)
