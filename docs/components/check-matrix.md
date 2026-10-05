[Tài liệu](../README.md) › [Components](README.md) › Check matrix

# Lưới checkbox hàng × cột — `<td-check-matrix>`

Lưới tick **hàng × cột** cho màn sửa quyền: quyền × vai trò, sự kiện × kênh thông báo, tính năng × gói. Chọn / bỏ cả
hàng, cả cột, cả nhóm × cột, tất cả (ba trạng thái, **không bao giờ lật ô khoá**); nhóm hàng thu gọn; ô khoá (đã tick /
chưa tick), ô không áp dụng; ghi chú theo ô, mô tả theo hàng / cột; bàn phím kiểu lưới (một tab stop); điện thoại sửa
**một cột một lúc**; PHP render được form chạy **không cần JS** rồi component nhận tại chỗ. Form-associated.

Kit **không biết quyền là gì**: role mặc định, override, admin bypass, chống leo quyền là việc của app và **server**. Kit
chỉ là lưới tick + ô khoá. **Ngoài phạm vi (0.47):** kéo để tô nhiều ô, Shift chọn dải, undo, ô tìm / lọc hàng, nhóm lồng
nhiều cấp, ảo hoá DOM, tải hàng lười, sắp xếp, nội dung tự do trong ô, `required` / `min` / `max` số ô.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/check-matrix'` (class: `import { TdCheckMatrix } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | có — **đủ tập, nhóm theo cột**, xem [FormData](#formdata-hợp-đồng-công-khai) |
| PHP | `td_check_matrix()` ([adapter PHP](../guides/php-adapter.md)) |
| Từ phiên bản | 0.47.0 (token-native: cần `td.css`) |

## Ví dụ nhanh

```html
<form method="post" action="/admin/roles/permissions">
  <td-check-matrix id="perms" name="perms" label="Quyền theo vai trò"></td-check-matrix>
  <button type="submit" class="td-btn td-btn--primary">Lưu quyền</button>
</form>

<script type="module">
  import '@dazzxq/td-components/check-matrix';

  const m = document.getElementById('perms');
  m.setData({
    columns: [
      { key: 'owner', label: 'Chủ cửa hàng', description: 'Toàn quyền', locked: true },
      { key: 'manager', label: 'Quản lý' },
      { key: 'sales', label: 'Bán hàng' },
    ],
    rows: [
      { key: 'dashboard.view', label: 'Xem tổng quan' },
      { key: 'catalog', label: 'Sản phẩm', rows: [            // nhóm (một cấp)
        { key: 'catalog.products.view', label: 'Xem sản phẩm' },
        { key: 'catalog.products.delete', label: 'Xoá sản phẩm' },
      ] },
      { key: 'orders', label: 'Đơn hàng', collapsed: true, rows: [
        { key: 'orders.refund', label: 'Hoàn tiền' },
      ] },
    ],
    cells: {                                                    // chỉ ô đặc biệt
      'catalog.products.delete': {
        manager: { locked: true, note: 'Không tự sửa vai trò của mình' },
        sales: { na: true, note: 'Bán hàng không bao giờ xoá sản phẩm' },
      },
    },
    value: {                                                    // ô đang tick, theo cột
      owner: ['dashboard.view', 'catalog.products.view', 'catalog.products.delete', 'orders.refund'],
      manager: ['dashboard.view', 'catalog.products.view'],
    },
  });
  m.addEventListener('change', (e) => console.log(e.detail.trigger, e.detail.added, e.detail.removed, m.changedCount));
</script>
```

Form gửi (PHP đọc thành mảng):

```text
perms[owner]=  perms[manager]=  perms[sales]=          ← một marker rỗng mỗi cột, luôn đứng đầu
perms[owner][]=dashboard.view  perms[manager][]=dashboard.view
perms[owner][]=catalog.products.view  perms[manager][]=catalog.products.view
perms[owner][]=catalog.products.delete  perms[owner][]=orders.refund
perms[_v]=1                                            ← sentinel, luôn cuối cùng
```

```php
$_POST['perms'] === [
  'owner'   => ['dashboard.view', 'catalog.products.view', 'catalog.products.delete', 'orders.refund'],
  'manager' => ['dashboard.view', 'catalog.products.view'],
  'sales'   => '',      // chuỗi rỗng = cột không tick ô nào
  '_v'      => '1',
];
```

## Dữ liệu

Dữ liệu phức tạp đi qua **property JS** (hoặc attribute `data` JSON — xem [SSR](#ssr-php-và-không-js)).

| Property | Kiểu | Ý nghĩa |
|---|---|---|
| `columns` | `[{ key, label, description?, locked? }]` | Các cột (≤ 32). `locked: true` = cả cột khoá |
| `rows` | `[{ key, label, description?, locked? } \| { key, label, collapsed?, locked?, rows: […] }]` | Hàng và nhóm (một cấp; ≤ 500 hàng, ≤ 64 nhóm). Phần tử có mảng `rows` là **nhóm**: thu gọn được, không bao giờ vào FormData. `locked` của nhóm khoá mọi hàng con |
| `cells` | `{ [hàng]: { [cột]: { locked?, na?, note? } } }` | Chỉ ô đặc biệt. Thiếu = mọi ô thường |
| `value` | `{ [cột]: [hàng, …] }` | Ô đang tick (trạng thái **ban đầu / hiện tại**, gồm cả ô khoá đang tick) |

- **Khoá (`key`)**: chuỗi khớp `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$`, hoặc số nguyên ≥ 0 (thành chuỗi). **Không** `[` `]`
  (PHP tách ngoặc sai), **không** bắt đầu bằng `_` (dành cho `_v`), không dấu cách. Khoá hàng duy nhất trong mọi hàng (kể
  cả khác nhóm); khoá cột duy nhất; khoá nhóm duy nhất trong các nhóm. Khoá chỉ đi vào `name` / `value` của form, không
  bao giờ vào id / selector.
- **Trần cứng:** 500 hàng, 32 cột, 10 000 ô, 64 nhóm. Nhãn cắt ở 200 ký tự, mô tả / ghi chú ở 300 (cắt, không từ chối;
  ký tự điều khiển bị bỏ, khoảng trắng thừa gộp lại). Nhãn trống = dùng khoá.
- **Năm trạng thái ô** (suy ra, không có enum riêng): *tick*, *trống*, *khoá-tick*, *khoá-trống* (khoá = ô `locked` **hoặc**
  hàng `locked` **hoặc** cột `locked`), *không áp dụng* (`na: true` — không có checkbox, không bao giờ gửi; `na` + `locked`
  → n/a thắng). `note` gắn được vào mọi ô, kể cả n/a.
- `locked` / `na` / `collapsed` phải là **boolean thật** (`"true"`, `1` bị từ chối: nghĩa của khoá không được đoán). `note`
  phải là chuỗi.

### Một đường validate — sai là fail closed

Mọi lối vào (property, `setData()`, attribute `data`, khôi phục form, hydrate PHP) đi qua **một** hàm kiểm tra. Lỗi cấu
trúc → **fail closed toàn bộ**: lưới hiện "Không đọc được dữ liệu ma trận" (`data-state="broken"`), không control nào,
**không có mục FormData nào** (server thấy "không có key" nên giữ nguyên), một `console.warn` chỉ nêu loại lỗi (không in
giá trị). Kit **không bao giờ bỏ riêng một hàng sai**: hàng vắng khỏi lưới = vắng khỏi mọi danh sách cột = **thu hồi** nó.

Lỗi cấu trúc: không phải mảng / rỗng, quá trần, khoá sai / trùng, nhóm lồng, `value` có cột / hàng lạ, `value` tick một ô
n/a, `value[cột]` không phải mảng, `cells` sai dạng (gốc không phải object thường, hàng / cột lạ, khoá nhóm, ô không phải
object, cờ không phải boolean, `note` không phải chuỗi). Trường lạ trong một ô bị bỏ qua.

| Lối vào | Dữ liệu hợp lệ | Lỗi cấu trúc |
|---|---|---|
| Gán `columns` / `rows` / `cells` / `value` lần đầu, `setData()`, attribute `data` | áp | fail closed |
| Gán lại dữ liệu khi đã có (`rows` mới…) | áp; tick hiện tại được giữ cho các ô **còn tồn tại** (trừ khi gán `value` mới trong cùng tick) | fail closed |
| `value =` / `setValue()` khi đã có dữ liệu | áp, im lặng, không event | **từ chối**, giữ nguyên trạng thái, một cảnh báo |
| Khôi phục form (bfcache / autofill) | áp | bỏ state khôi phục, giữ trạng thái hiện tại |
| Hydrate markup PHP | nhận tại chỗ | render an toàn từ `data` (xem SSR) |

**Gộp theo microtask:** các setter chỉ đánh dấu; validate + render chạy **một lần** ở microtask sau lần gán cuối. Đọc
`value` / `changedCount` / `getValue()` sẽ áp ngay phần đang chờ. Muốn gán nguyên tử, dùng `setData({ columns, rows, cells,
value })`. Đổi `rows` mà `cells` cũ còn nhắc tới hàng đã bỏ → fail closed: gán `cells` mới cùng lúc.

## Hàng loạt và ba trạng thái

| Ô hàng loạt | Ở đâu | Tập ô |
|---|---|---|
| Chọn tất cả | góc trên trái | mọi ô |
| Chọn cả cột | hàng thứ hai của header | một cột |
| Chọn cả hàng | cột đầu | một hàng |
| Chọn cả nhóm | cột đầu của hàng nhóm | mọi hàng của nhóm × mọi cột |
| Chọn cả nhóm, cột X | hàng nhóm, dưới cột X | hàng của nhóm × cột X |

Tập chỉ gồm ô **áp dụng được** (bỏ n/a). Luật (giống `td-tree cascade`):

- **Hiển thị:** mọi ô trong tập (kể cả ô khoá) đã tick → ✓; không ô nào → trống; còn lại → lưng chừng (`indeterminate`).
  Header **không bao giờ** hiện "đủ" khi còn ô khoá chưa tick.
- **Bấm:** mọi ô **không khoá** của tập đã tick → bỏ tick chúng; ngược lại → tick hết chúng. Ô khoá không bao giờ đổi
  → không bao giờ kẹt.
- Tập không còn ô không khoá → ô hàng loạt `disabled` (vẫn hiện trạng thái).
- Một `change` mỗi thao tác; sau thao tác hàng loạt trình đọc màn hình đọc "Đã đổi n ô".

## FormData (hợp đồng công khai)

Quyết định: [ADR 0022](../internal/decisions/0022-check-matrix-grid-form-shape.md). Không cần `name` (dùng lưới chỉ qua
event) → không gửi gì.

| Mục | Khi nào | Thứ tự |
|---|---|---|
| `name[<cột>]=` (chuỗi rỗng) | **mọi** cột, luôn luôn | đầu tiên, theo thứ tự cột |
| `name[<cột>][]=<hàng>` | mỗi ô đang tick, **gồm ô khoá-tick** (đúng một lần) | theo hàng (thứ tự hiển thị), trong hàng theo cột |
| `name[_v]=1` | luôn luôn | cuối cùng |

PHP đọc ra **ba trạng thái** mỗi cột: **mảng** = danh sách thay thế toàn bộ, **chuỗi rỗng** = cột không tick ô nào,
**không có key `name`** = không đụng (lưới disabled / fail closed / không có trong form).

- **Gửi đủ tập, không gửi phần thay đổi:** gửi lại hai lần cùng kết quả; server đã có trạng thái hiện tại (+
  `lock_version`) nên tự tính diff được.
- **Ô khoá-tick vẫn được gửi** (đúng như hiện có) — server "đồng bộ theo danh sách" không thu hồi nhầm, server so sánh
  "trường không có quyền sửa → 403" thấy không đổi. Ô khoá-trống, ô n/a không bao giờ gửi.
- `name` lồng được: `role[perms]` → `role[perms][owner][]=…`. `name` rỗng hoặc kết thúc bằng `[]` → **fail closed**.
- Chỉ cam kết parser **PHP** (`$_POST`, `parse_str`). Rails (Rack) / Node (`qs`) báo lỗi kiểu khi một key vừa là chuỗi
  vừa là mảng — site đó đọc `request.getAll()` / body thô.

### Sentinel `_v` và `max_input_vars` (bắt buộc đọc)

PHP **cắt im lặng** mọi biến vượt `max_input_vars` (mặc định 1 000; chỉ một `E_WARNING` trong log). 200 hàng × 12 cột =
2 400 ô. Mục bị cắt là quyền bị **thu hồi** nếu server đồng bộ theo danh sách. `_v` luôn là mục **cuối cùng** nên mất
trước tiên:

- Server **bắt buộc từ chối (422) khi thiếu `_v`**, và **gỡ `_v`** trước khi validate từng cột (mỗi cột đúng `''` hoặc list chuỗi khoá có thật — sai là 422, không lọc).
- Đặt `max_input_vars ≥ số ô + số cột + số field khác của form + 1` (php.ini, `.user.ini` hoặc cấu hình pool FPM).
- `_v` cũng là phiên bản định dạng (đổi định dạng → `2`).

Cả hai ví dụ **kiểm chặt từng cột, không bao giờ lọc im lặng**: khoá cột phải là role có thật; giá trị phải đúng `''`
hoặc một **list** (khoá `0..n-1`) gồm toàn **chuỗi** là khoá quyền có thật — sai bất kỳ (mảng có khoá chữ, phần tử không
phải chuỗi, quyền lạ) → 422. Lọc bỏ phần tử lạ rồi lưu phần còn lại = lưu một danh sách người dùng không hề gửi.

**Laravel:**

```php
/** array_is_list() có từ PHP 8.1 — PHP 8.0 dùng hàm này */
function is_list_array(array $a): bool
{
    $i = 0;
    foreach ($a as $k => $_) {
        if ($k !== $i++) return false;
    }
    return true;
}

public function update(Request $request, Shop $shop)
{
    $perms = $request->input('perms');
    abort_unless(is_array($perms) && ($perms['_v'] ?? null) === '1', 422, 'Thiếu dữ liệu quyền (form bị cắt?)');
    unset($perms['_v']);
    $roleKeys = $shop->roles()->pluck('key')->map(fn ($k) => (string) $k)->all();
    $permKeys = array_flip($shop->permissionKeys());            // khoá quyền hợp lệ (danh sách hàng của ma trận)
    $clean = [];
    foreach ($perms as $roleKey => $list) {                     // khoá số (cột `0`) → PHP cho ra int: so bằng chuỗi
        $roleKey = (string) $roleKey;
        abort_unless(in_array($roleKey, $roleKeys, true), 422, 'Vai trò không hợp lệ');
        if ($list === '') { $clean[$roleKey] = []; continue; }  // cột không tick ô nào
        abort_unless(is_array($list) && is_list_array($list), 422, 'Dữ liệu quyền sai dạng');
        foreach ($list as $key) {
            abort_unless(is_string($key) && isset($permKeys[$key]), 422, 'Quyền không hợp lệ');
        }
        $clean[$roleKey] = array_values(array_unique($list));
    }

    DB::transaction(function () use ($shop, $clean, $request) {
        // khoá ĐÚNG bản ghi của route theo khoá chính + lock_version, trong transaction; dùng chính bản ghi đã khoá
        $locked = Shop::query()
            ->whereKey($shop->getKey())
            ->where('lock_version', $request->integer('lock_version'))
            ->lockForUpdate()
            ->first();
        abort_if($locked === null, 409, 'Quyền vừa được người khác sửa — tải lại trang');
        foreach ($clean as $roleKey => $wanted) {
            $role = $locked->roles()->where('key', $roleKey)->firstOrFail();
            $current = $role->permissionKeys();
            // hiệu đối xứng: mọi ô thêm + mọi ô bỏ (array_merge, KHÔNG dùng `+` — `+` hợp theo khoá số và làm rơi phần tử)
            $changed = array_unique(array_merge(array_diff($wanted, $current), array_diff($current, $wanted)));
            // chỉ áp những ô người sửa CÓ quyền sửa; ô khoá gửi lên phải đúng như hiện có → khác là 403
            foreach ($changed as $key) {
                abort_unless($request->user()->canGrant($locked, $role, $key), 403);
            }
            $role->syncPermissionKeys($wanted);
        }
        $locked->increment('lock_version');
    });
}
```

**PHP thuần** (PDO; `$pdo`, `$shopId`, `$roleKeys`, `$permKeys` = khoá quyền hợp lệ dạng `array_flip`, `$canGrant` của site):

```php
function is_list_array(array $a): bool { $i = 0; foreach ($a as $k => $_) { if ($k !== $i++) return false; } return true; }
function fail(int $code, string $msg = '') { http_response_code($code); exit($msg); }

$perms = $_POST['perms'] ?? null;
if (!is_array($perms) || ($perms['_v'] ?? null) !== '1') fail(422, 'Form bị cắt — tăng max_input_vars');
unset($perms['_v']);
$clean = [];
foreach ($perms as $role => $list) {
    $role = (string) $role;
    if (!in_array($role, $roleKeys, true)) fail(422);
    if ($list === '') { $clean[$role] = []; continue; }
    if (!is_array($list) || !is_list_array($list)) fail(422);                    // không bao giờ lọc im lặng
    foreach ($list as $key) if (!is_string($key) || !isset($permKeys[$key])) fail(422);
    $clean[$role] = array_values(array_unique($list));
}
$pdo->beginTransaction();
$st = $pdo->prepare('SELECT id FROM shops WHERE id = ? AND lock_version = ? FOR UPDATE');
$st->execute([$shopId, (int) ($_POST['lock_version'] ?? -1)]);
if ($st->fetchColumn() === false) { $pdo->rollBack(); fail(409, 'Quyền vừa được người khác sửa'); }
foreach ($clean as $role => $wanted) {
    $current = current_permission_keys($pdo, $shopId, $role);                       // hàm của site
    $changed = array_unique(array_merge(array_diff($wanted, $current), array_diff($current, $wanted)));
    foreach ($changed as $key) if (!$canGrant($role, $key)) { $pdo->rollBack(); fail(403); }
    sync_permission_keys($pdo, $shopId, $role, $wanted);                            // hàm của site
}
$pdo->prepare('UPDATE shops SET lock_version = lock_version + 1 WHERE id = ?')->execute([$shopId]);
$pdo->commit();
```

**Server tự cưỡng chế khoá.** Ô khoá ở UI chỉ là gợi ý: sửa DOM / tự POST là gửi được mọi cặp. Luật "không gán được quyền
mình không có", "không tự sửa role của chính mình", CSRF, `lock_version` đều ở server.

## Attribute

| Attribute | Kiểu | Mặc định | Ý nghĩa |
|---|---|---|---|
| `name` | string | — | Tên FormData (rỗng / kết thúc `[]` → fail closed). Không có → không gửi |
| `label` | string | — | Nhãn hiển thị, đặt tên cho lưới |
| `layout` | `auto` \| `grid` \| `column` | `auto` | Chế độ hẹp "một cột một lúc": `auto` khi host < 720px, `grid` luôn lưới đầy đủ, `column` luôn một cột |
| `max-height` | `none` \| số + `px`/`rem`/`em`/`vh`/`svh`/`dvh`/`lvh`/`%` | token `70vh` | Chiều cao khung cuộn. Sai (vd. `calc()`, `var()`) → bỏ qua + một cảnh báo |
| `data` | JSON | — | `{"v":1,"columns":[…],"rows":[…],"cells":{…},"value":{…}}` (≤ 512 KiB) — cùng đường validate |
| `disabled` | boolean | — | Khoá mọi ô, không gửi gì. `<fieldset disabled>` cũng vậy |
| `aria-label` | string | — | Tên lưới khi không có `label` |

**Vì sao mặc định cuộn trong khung 70vh:** lưới rộng phải cuộn ngang, mà `overflow-x` biến khung thành vùng sticky cho
**cả** trục dọc — header không thể dính theo cuộn trang. Lưới tự cuộn dọc thì header + cột nhãn luôn thấy. `max-height="none"`
→ trang cuộn, header không dính (chấp nhận được cho lưới ít hàng).

## Property & method

| | Ý nghĩa |
|---|---|
| `columns`, `rows`, `cells` | Dữ liệu (gán gộp theo microtask) |
| `value` / `getValue()` | `{ [cột]: [hàng…] }` với **khoá gốc** của app (số vẫn là số), mọi cột |
| `setValue(v)` | Gán giá trị (im lặng; sai → từ chối) |
| `setData({ columns, rows, cells?, value? })` | Gán nguyên tử |
| `changedCount` | Số ô khác mặc định |
| `expand(key)` / `collapse(key)` / `expandAll()` / `collapseAll()` | Mở / thu gọn nhóm (không event) |
| `TdCheckMatrix.labels` | Chữ mặc định (tiếng Việt), đổi theo site |

Mặc định (đích của `form.reset()`) = giá trị của **lần dữ liệu hợp lệ đầu tiên** (attribute `data` hoặc lần gán đầu), chụp
một lần như mọi control; gán dữ liệu mới về sau giữ mặc định cho các ô còn tồn tại.

## Event

| Event | `detail` | Khi nào |
|---|---|---|
| `change` | `{ added: [[hàng, cột]…], removed: [[hàng, cột]…], trigger }` | Người dùng đổi ô (một lần mỗi thao tác) hoặc `form.reset()`. `trigger`: `cell` / `row` / `column` / `group` / `group-column` / `all` / `reset`. Khoá gốc của app |
| `expanded-change` | `{ group, expanded }` | Người dùng mở / thu gọn nhóm |

Gán bằng code không phát event. `change` native của checkbox bên trong **không** lọt ra host.

## Nhãn (`TdCheckMatrix.labels`)

| Khoá | Mặc định |
|---|---|
| `grid` | `Ma trận chọn` (tên dự phòng của lưới) |
| `rows` | `Mục` (tiêu đề cột nhãn — đặt `Quyền` cho màn phân quyền) |
| `all` / `row` / `column` / `group` / `groupColumn` | `Chọn tất cả` / `Chọn cả hàng {row}` / `Chọn cả cột {col}` / `Chọn cả nhóm {group}` / `Chọn cả nhóm {group}, cột {col}` |
| `columnPick` | `Đang sửa cột` |
| `na` | `Không áp dụng` |
| `broken` | `Không đọc được dữ liệu ma trận` |
| `changed` | `Đã đổi {n} ô` |

PHP dùng cùng bộ chữ (`Td::CHECK_MATRIX_LABELS`, option `labels`). Đổi chữ ở JS mà không đổi ở PHP → hydrate thấy lệch và
render lại (an toàn, chỉ mất "nhận tại chỗ").

## Token CSS

| Token | Mặc định | Dùng cho |
|---|---|---|
| `--td-check-matrix-cell-size` | `2.25rem` (con trỏ thô `2.75rem`) | Chiều cao ô |
| `--td-check-matrix-label-w` | `clamp(10rem, 28cqi, 18rem)` | Cột nhãn sticky |
| `--td-check-matrix-col-w` | `5.5rem` | Cột dữ liệu (nhãn cột xuống dòng đủ chữ, không cắt) |
| `--td-check-matrix-max-height` | `70vh` | Chiều cao khung cuộn (attribute `max-height` ghi đè qua CSSOM) |
| `--td-check-matrix-head-bg` | `var(--td-color-surface-muted)` | Header + cột sticky (nền đặc) |
| `--td-check-matrix-group-bg` | `var(--td-color-surface-muted)` | Hàng nhóm |
| `--td-check-matrix-row-active` | `var(--td-color-hover)` | Hàng đang focus + header cột đang focus |
| `--td-check-matrix-changed` | `var(--td-accent)` | Tam giác "đã đổi" ở góc ô |
| `--td-check-matrix-note-mark` | `var(--td-color-text-muted)` | Chấm "có ghi chú" ở góc ô |

Mark ✓ theo `--td-checkbox-color` / `--td-checkbox-border` (mark dùng chung, [ADR 0017](../internal/decisions/0017-shared-check-mark.md)).
Màu đều suy ra từ token theme → theo dark / theme có tên tự động. Xem [Theming](../customization/theming.md).

## Cấu trúc DOM

```text
<td-check-matrix name="perms" label="…">
  <div class="td-check-matrix" data-state="ready|broken|empty" data-layout="auto|grid|column" data-layout-js>
    <p class="td-field__label" id="{h}-label">…</p>  (hoặc span.td-sr-only#{h}-label — tên lưới luôn tồn tại)
    <div class="td-check-matrix__bar">  label + select.td-check-matrix__colpick + span.td-check-matrix__bulk[data-kind="column-active"]
    <div class="td-check-matrix__scroll">
      <table class="td-check-matrix__grid" role="grid" aria-labelledby="{h}-label">
        <thead> tr.__head (td.__corner, th.__rowtitle, th.__colhead#{h}-c{j}[data-c]) · tr.__bulkrow (td.__bulk[data-kind=all|column]) </thead>
        <tbody class="td-check-matrix__body"> tr.__row[data-r] … </tbody>
        <tbody class="td-check-matrix__group" id="{h}-g{i}" data-g [data-collapsed]>
          tr.__grouprow (td.__bulk[data-kind=group], th.__grouphead > button.__group-toggle[aria-expanded][aria-controls], td.__bulk[data-kind=group-column])
          tr.__row[data-r] (td.__bulk[data-kind=row], th.__rowhead#{h}-r{i}, td.__cell[data-c][data-locked][data-na][data-note][data-changed])
        </tbody>
      </table>
    </div>
    <p class="td-check-matrix__note" aria-hidden="true"></p>   dòng ghi chú của ô đang focus / vừa chạm / đang rê chuột
    <p class="td-sr-only" role="status"></p>
  </div>
</td-check-matrix>
```

Ô dữ liệu: `<input type="checkbox" class="td-check-matrix__input" aria-labelledby="{h}-r{i} {h}-c{j}">` phủ cả ô (vùng chạm
= ô) + `span.td-check.td-check--drawn` (✓ vẽ bằng CSS). Id luôn từ id của host + chỉ số, **không bao giờ từ dữ liệu**.
Host là **container** `inline-size`: nó phải lấy bề rộng từ cột chứa nó (trong flex / grid co theo nội dung → đặt
`width` / `align-self: stretch`).

## Bàn phím & trợ năng

`<table role="grid">`, checkbox native, **một tab stop** (roving tabindex — kể cả nút nhóm):

| Phím | Hành vi |
|---|---|
| Tab / Shift+Tab | Vào lưới ở ô active gần nhất (lần đầu: ô dữ liệu đầu tiên); Tab tiếp rời lưới |
| ← → ↑ ↓ | Sang ô kế, không vòng; bỏ qua hàng của nhóm đang thu gọn và cột đang ẩn. RTL đổi ← → |
| Home / End | Ô đầu / cuối của hàng |
| Ctrl+Home / Ctrl+End | Ô đầu / cuối của lưới |
| PageUp / PageDown | Lên / xuống 10 hàng đang hiện |
| Space | Lật checkbox của ô (ô dữ liệu, ô hàng loạt). Ô khoá / n/a: không gì (dòng ghi chú hiện lý do) |
| Enter / Space trên nút nhóm | Thu gọn / mở nhóm, focus ở lại trên nút |

- Ô khoá / n/a / ô nhãn **tới được bằng phím** (focus vào chính `td` / `th`): trình đọc đọc "checkbox đã tick, bị làm mờ" +
  ghi chú. Ô dữ liệu có tên tường minh = nhãn hàng + nhãn cột.
- Header là chữ thuần; ô "chọn cả cột / hàng" là ô riêng (header không bị đọc thành "Chọn cả cột Bán hàng Bán hàng"). Mô
  tả hàng / cột gắn `aria-describedby` vào ô hàng loạt; ghi chú ô gắn vào checkbox của ô.
- Tên lưới luôn tồn tại: `label` → `<label for>` ngoài → `aria-label` của host → "Ma trận chọn" + một cảnh báo.
- Ô được focus bằng phím không bao giờ nằm dưới header / cột sticky. Hàng đang focus tô nền, header cột đang focus có
  `data-active` (không lạc ở ô thứ 9 của hàng 140).
- Dấu "đã đổi" (tam giác) và chấm ghi chú là **hình**, không chỉ màu; `forced-colors` vẽ viền thật.

## Điện thoại, cảm ứng

- **Một cột một lúc** (`layout="auto"` dưới 720px, hoặc `layout="column"`): thanh trên lưới có `<select>` "Đang sửa cột"
  (picker native của iOS / Android, là tab stop riêng trước lưới) + ô "Chọn cả cột" của cột đó. Lưới chỉ còn cột nhãn +
  cột đang chọn; cột "chọn cả hàng" và ô "tất cả" ẩn vì chúng sẽ lật cả ô người dùng **không nhìn thấy** — ô hàng loạt
  đang ẩn không bao giờ lật được bằng bất kỳ đường nào. Ít cột (thông báo × 3 kênh) → `layout="grid"`.
- Cuộn lưới hai trục bằng ngón là cuộn native: trình duyệt tự huỷ cú chạm khi ngón đã cuộn (không lật nhầm). Không kéo
  để tô, không nhấn giữ. Ô ≥ 44px trên con trỏ thô; hình nhấn chỉ đổi màu ([ADR 0019](../internal/decisions/0019-touch-standard.md)).
- Chạm ô khoá → dòng ghi chú hiện lý do (tooltip không dùng được khi chạm).

## SSR: PHP và không JS

```php
echo td_check_matrix('perms', $roles, $permissionTree, $current, [
    'label' => 'Quyền theo vai trò',
    'cells' => $special,                 // ['row' => ['col' => ['locked' => true, 'note' => '…']]]
    'layout' => 'auto', 'max_height' => '32rem', 'labels' => ['rows' => 'Quyền'],
]);
```

`td_check_matrix()` luôn in `<td-check-matrix data-td-ssr="check-matrix@1" data="{JSON}">` + **form không JS đầy đủ**:
một `<input type=hidden name="perms[col]" value="">` mỗi cột ở đầu, một checkbox `name="perms[col][]" value="row"` mỗi ô
áp dụng được (ô khoá-tick: checkbox `disabled` + một hidden input ngay sau nó), `perms[_v]=1` ở cuối → **FormData giống
từng byte** với bản JS. Không JS: ô hàng loạt / nút nhóm / select chọn cột in sẵn nhưng `disabled` (không bao giờ có
`name`), nhóm `collapsed` vẫn mở, chưa có dòng ghi chú (ghi chú vẫn đọc được qua trình đọc màn hình).

Khi module tải, component so **từng node** với markup kỳ vọng sinh từ `data` (allowlist attribute, đúng số marker / hidden /
sentinel, `name` / `value` của mỗi checkbox khớp ô của nó, id + `aria-controls` của nhóm, không phần tử form lạ). Khớp →
nhận tại chỗ (giữ ô người dùng tick trước khi JS tải, FormData chuyển sang component, form không JS bị gỡ). Lệch bất kỳ →
**không lấy giá trị nào từ markup**, render an toàn từ `data` + một cảnh báo, focus về ô tương ứng. Lỗi dữ liệu ở PHP → in
trạng thái fail closed (không input nào) + một `E_USER_WARNING` chỉ nêu loại lỗi.

## Bảo mật

- Nhãn / mô tả / ghi chú luôn là **chữ** (escape theo ngữ cảnh ở JS và PHP); không có lối HTML. Mẫu nhãn thay bằng hàm
  (`$&` trong dữ liệu giữ nguyên chữ).
- CSP strict: không `style=""`; chỉ một giá trị theo instance qua CSSOM (`--td-check-matrix-max-height`, regex chặt +
  `CSS.supports`).
- Server **không tin client**: ô khoá chỉ là UI. Xem [security model](../internal/security-model.md) §6i.

## Lỗi thường gặp

- **Đừng bỏ hàng khỏi `rows` để lọc / ẩn** — hàng vắng = vắng khỏi mọi danh sách cột = **thu hồi** quyền đó khi lưu.
- **Đừng đặt khoá có `[` / `]`** (PHP đọc sai tên field) hay bắt đầu bằng `_`.
- Quên kiểm `_v` ở server → form 2 400 ô trên PHP mặc định thu hồi quyền **im lặng**.
- Quên gỡ `_v` trước khi validate `perms.*` → lỗi validate ở lần lưu đầu.
- Đổi `rows` mà giữ `cells` cũ nhắc tới hàng đã bỏ → fail closed (gán `cells` mới cùng lúc, hoặc `setData`).
- Input không tên ở chế độ JS vẫn là phần tử form native (`form.elements` dài thêm ~2 400) — không ảnh hưởng FormData.
- Host trong flex / grid co theo nội dung → bề rộng 0 (host là container `inline-size`): cho nó `width` / `align-self: stretch`.
