[Tài liệu](../README.md) › Hướng dẫn › Biến thể ảnh đã cắt

# Biến thể ảnh đã cắt: site phải làm gì

> **⚠ Site phải tự xử lý.** `td-cropper`, media picker và media field **chỉ xuất toạ độ** (`name[crop]`,
> `name[focal]`) — kit không bao giờ tạo pixel, không có endpoint, không có CDN ([ADR 0015](../internal/decisions/0015-td-cropper.md)).
> Việc biến toạ độ thành ảnh (cắt, đổi cỡ, đổi định dạng) là của **server / CDN của site**, và endpoint đó là một
> **máy xử lý ảnh công khai**: làm sai thì ai cũng có thể bắt server của bạn cắt ảnh tuỳ ý (DoS, hoá đơn CDN, đầy đĩa
> cache, lộ ảnh riêng tư). Checklist dưới đây là **bắt buộc**.

Trang này dành cho người viết site (dsuite, dwp, 135…). Mọi đoạn mã ở đây là **minh hoạ, không phải thư viện** — kit không
ship helper ký URL hay endpoint mẫu; chép thì phải đọc, sửa theo hạ tầng của bạn và review bảo mật.

## Mục lục

- [Luồng](#luồng)
- [Checklist bắt buộc](#checklist-bắt-buộc)
- [Ký URL (phía trang)](#ký-url-phía-trang)
- [Ví dụ 1: Cloudflare Image Transformations + Worker](#ví-dụ-1-cloudflare-image-transformations--worker)
- [Ví dụ 2: endpoint PHP tự host (GD / Imagick)](#ví-dụ-2-endpoint-php-tự-host-gd--imagick)
- [Xoay khoá](#xoay-khoá)
- [Ảnh riêng tư](#ảnh-riêng-tư)

## Luồng

1. Người dùng cắt trong kit → form gửi `name[crop]` = `{"v":1,"x":…,"y":…,"width":…,"height":…}` (0..1 theo ảnh gốc) hoặc
   `null` (nguyên ảnh). Server **validate lại** (đúng khoá, số hữu hạn, `x + width ≤ 1`, `y + height ≤ 1`) rồi lưu theo
   **chỗ dùng** (bài viết, sản phẩm…), không theo asset.
2. Khi render trang, server dựng URL biến thể từ **giá trị đã lưu** + một bề rộng / định dạng trong allowlist, và **ký**
   URL đó. Client không bao giờ tự ghép tham số crop.
3. Trình duyệt tải URL → Cloudflare edge: **hit** → trả ngay (không chạm origin); **miss** → tới endpoint biến đổi.
4. Endpoint: kiểm chữ ký (**sai → 403, chưa đọc file nào**) → cache đĩa (hit → trả file) → đọc ảnh gốc, cắt, đổi cỡ, đổi
   định dạng → ghi cache đĩa → trả với `Cache-Control: public, max-age=31536000, immutable`.
5. Cloudflare giữ bản đó ở edge; lần sau không chạm origin. Ảnh gốc đổi → tăng `v` (phiên bản asset) → URL mới, không
   cần purge.

## Checklist bắt buộc

**1. URL ký HMAC-SHA256**

- [ ] Chữ ký = `HMAC-SHA256(secret, chuỗi chuẩn hoá)` trên **đúng** các tham số quyết định ảnh ra:
      `asset id | crop | w | fmt | v` (+ `| exp` cho ảnh riêng tư). `crop` = `x,y,width,height` **làm tròn 4 chữ số**,
      in cố định (`%.4F`), hoặc `full`. Nên thêm một tiền tố mục đích cố định (vd. `rendition-v1|`) nếu cùng secret có
      thể bị dùng chỗ khác — tốt hơn: mỗi mục đích một secret.
- [ ] Secret ≥ 32 byte ngẫu nhiên, nằm trong **biến môi trường / secret store** — không trong repo, không trong HTML, không
      trong JS phía client.
- [ ] So sánh chữ ký bằng hàm **hằng thời gian**: PHP `hash_equals($expected, $given)`, Worker
      `crypto.subtle.verify()`. **Không bao giờ** `==`, `===`, `strcmp`.
- [ ] Chữ ký sai / thiếu / `kid` lạ → **403 trước khi đọc file hay biến đổi gì**. Tham số sai dạng → 400 (cũng trước khi
      đọc file).
- [ ] Xoay khoá được: `kid` trong URL, hai khoá cùng hợp lệ trong thời gian chuyển ([Xoay khoá](#xoay-khoá)).

**2. Giới hạn biến thể** (chữ ký chặn người lạ; allowlist chặn chính trang của bạn sinh vô hạn biến thể)

- [ ] Allowlist bề rộng, ví dụ `320, 640, 960, 1280, 1600, 2048` — không nhận số tuỳ ý.
- [ ] Allowlist định dạng: `webp`, `avif`, `jpeg`. Chọn định dạng bằng `<picture>` / `srcset` trong HTML, không theo
      header `Accept` (thương lượng theo `Accept` cần `Vary` và làm vỡ cache).
- [ ] Crop làm tròn **4 chữ số** trước khi ký (chặn vô số biến thể gần như trùng nhau).
- [ ] Ảnh ra **≤ vùng cắt của ảnh gốc** (không phóng to) và **≤ trần cứng** mỗi cạnh (ví dụ 4096 px); ảnh gốc quá nhiều
      điểm ảnh (ví dụ > 50 MP) → từ chối (bom giải nén).

**3. Cache hai tầng**

- [ ] Tầng 1: Cloudflare edge (`Cache-Control: public, max-age=31536000, immutable`).
- [ ] Tầng 2: cache đĩa ở origin, **khoá = hash (SHA-256) của chuỗi tham số đã ký** — không dựng đường dẫn từ input. Ghi
      file tạm rồi `rename` (nguyên tử). Có giới hạn dung lượng / dọn theo tuổi.
- [ ] URL công khai không nhận query string thừa (hoặc cache key của CDN bỏ chúng) — `?x=1` tuỳ ý không được thành một
      bản cache mới.

**4. Chống lạm dụng**

- [ ] Cloudflare WAF / rate limiting trên đường biến thể, **đếm request tới origin (cache miss) theo IP** — bản đã cache
      không tốn gì, miss mới tốn CPU.
- [ ] Server giới hạn **số tác vụ biến đổi đồng thời** (hết chỗ → 503 + `Retry-After`) và **timeout / giới hạn bộ nhớ**
      cho mỗi tác vụ.
- [ ] Ảnh gốc **riêng tư**: URL ký **không thay cho phân quyền** — kiểm phiên + quyền ở mỗi request, `exp` ngắn,
      không cache công khai ([Ảnh riêng tư](#ảnh-riêng-tư)).
- [ ] Không phục vụ ảnh từ origin có cookie phiên quản trị; `X-Content-Type-Options: nosniff`; `Content-Type` theo
      định dạng đã chọn, không theo file.

## Ký URL (phía trang)

Dạng URL minh hoạ (mọi tham số trong **path**, không query string):

```text
/r/{kid}/{sig}/{asset}/{v}/{crop}/{w}.{fmt}
/r/k2/Zk3…43 ký tự…/a81f2c/7/0.1000,0.2000,0.5000,0.2617/960.webp
```

```php
<?php
// MINH HOẠ — dựng URL biến thể từ crop ĐÃ LƯU (đã validate khi nhận form), không phải thư viện.
const RENDITION_WIDTHS = [320, 640, 960, 1280, 1600, 2048];
const RENDITION_FORMATS = ['webp', 'avif', 'jpeg'];

function rendition_url(string $asset, int $v, ?array $crop, int $w, string $fmt): string
{
    if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/D', $asset) || !in_array($w, RENDITION_WIDTHS, true)
        || !in_array($fmt, RENDITION_FORMATS, true)) {
        throw new InvalidArgumentException('rendition variant');
    }
    $c = 'full';
    if ($crop !== null) { // {x, y, width, height} 0..1
        $x = round($crop['x'], 4);
        $y = round($crop['y'], 4);
        $cw = min(round($crop['width'], 4), round(1 - $x, 4)); // làm tròn không được đẩy x + width quá 1
        $ch = min(round($crop['height'], 4), round(1 - $y, 4));
        if ($cw <= 0 || $ch <= 0) throw new InvalidArgumentException('crop');
        $c = sprintf('%.4F,%.4F,%.4F,%.4F', $x, $y, $cw, $ch); // %F: không phụ thuộc locale
    }
    $kid = getenv('RENDITION_KID') ?: 'k2';                          // khoá đang dùng để KÝ
    $secret = (string) getenv('RENDITION_KEY_' . strtoupper($kid));  // secret trong env, không trong repo
    if (strlen($secret) < 32) throw new RuntimeException('rendition key');
    $canonical = "{$asset}|{$c}|{$w}|{$fmt}|{$v}";
    $sig = rtrim(strtr(base64_encode(hash_hmac('sha256', $canonical, $secret, true)), '+/', '-_'), '=');
    return "/r/{$kid}/{$sig}/{$asset}/{$v}/{$c}/{$w}.{$fmt}";
}
```

```html
<!-- srcset chỉ gồm bề rộng trong allowlist; định dạng chọn bằng <picture> -->
<picture>
  <source type="image/avif" srcset="/r/…/640.avif 640w, /r/…/1280.avif 1280w" sizes="(min-width: 1024px) 50vw, 100vw">
  <img src="/r/…/1280.jpeg" srcset="/r/…/640.jpeg 640w, /r/…/1280.jpeg 1280w" sizes="(min-width: 1024px) 50vw, 100vw"
       width="1280" height="670" alt="…">
</picture>
```

`v` = phiên bản ảnh gốc (số nguyên tăng khi thay file). Focal point (`name[focal]`) không cần ký vào URL nếu chỉ dùng
cho `object-position` trong CSS; nếu endpoint dùng nó để cắt tự động thì nó là tham số ảnh ra → **phải** vào chuỗi ký.

## Ví dụ 1: Cloudflare Image Transformations + Worker

Biến đổi ảnh do Cloudflare làm (`cf.image` trong Worker); Worker chỉ **kiểm chữ ký + allowlist** rồi xin biến thể. Đừng
để đường URL `/cdn-cgi/image/…` công khai nhận tham số tuỳ ý: bật Image Transformations chỉ cho dùng qua Worker, tắt
"resize from any origin", và chặn truy cập trực tiếp `/cdn-cgi/image/` nếu zone của bạn cho phép (kiểm lại với tài liệu
Cloudflare hiện hành — tên tuỳ chọn thay đổi theo thời gian).

```js
// MINH HOẠ — Worker trên route /r/*. Secret: `wrangler secret put RENDITION_KEY_K2` (không để trong wrangler.toml).
const WIDTHS = new Set([320, 640, 960, 1280, 1600, 2048]);
const PATH = /^\/r\/([a-z0-9]{1,8})\/([A-Za-z0-9_-]{43})\/([A-Za-z0-9_-]{1,64})\/(\d{1,10})\/(full|\d\.\d{4}(?:,\d\.\d{4}){3})\/(\d{3,4})\.(webp|avif|jpeg)$/;
const enc = new TextEncoder();

async function verify(secret, data, sigB64u) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const sig = Uint8Array.from(atob(sigB64u.replace(/-/g, '+').replace(/_/g, '/') + '='), (c) => c.charCodeAt(0));
  return crypto.subtle.verify('HMAC', key, sig, enc.encode(data)); // hằng thời gian — không so chuỗi bằng ===
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method !== 'GET' || url.search) return new Response(null, { status: 400 });
    const m = PATH.exec(url.pathname);
    if (!m || !WIDTHS.has(Number(m[6]))) return new Response(null, { status: 400 });
    const [, kid, sig, asset, v, crop, w, fmt] = m;
    const secret = env[`RENDITION_KEY_${kid.toUpperCase()}`];
    if (!secret || !(await verify(secret, `${asset}|${crop}|${w}|${fmt}|${v}`, sig))) {
      return new Response(null, { status: 403 }); // trước mọi fetch ảnh gốc
    }
    // Site tự tra: đường dẫn ảnh gốc + kích thước gốc theo (asset, v) — KV / D1 / API nội bộ. Không có → 404.
    const src = await lookupOriginal(env, asset, Number(v)); // { url, width, height } | null
    if (!src) return new Response(null, { status: 404 });
    const image = { width: Number(w), fit: 'scale-down', format: fmt, metadata: 'none' }; // scale-down: không phóng to
    if (crop !== 'full') {
      const [x, y, cw, ch] = crop.split(',').map(Number);
      if (cw <= 0 || ch <= 0 || x + cw > 1 + 1e-9 || y + ch > 1 + 1e-9) return new Response(null, { status: 400 });
      const left = Math.round(x * src.width);
      const top = Math.round(y * src.height);
      image.trim = { left, top, right: src.width - Math.round((x + cw) * src.width), bottom: src.height - Math.round((y + ch) * src.height) };
    }
    const res = await fetch(src.url, { cf: { image } });
    if (!res.ok) return new Response(null, { status: 502 });
    const out = new Response(res.body, res);
    out.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    out.headers.set('X-Content-Type-Options', 'nosniff');
    return out;
  },
};
```

Kèm theo: rate limiting rule trên `/r/*` đếm request tới origin theo IP; ảnh gốc ở origin / bucket **không** công khai
trực tiếp (chỉ Worker đọc được), nếu không chữ ký vô nghĩa.

## Ví dụ 2: endpoint PHP tự host (GD / Imagick)

Thứ tự trong endpoint là phần quan trọng nhất: **parse chặt → chữ ký → (exp, quyền) → cache đĩa → giới hạn đồng thời →
đọc + biến đổi**.

```php
<?php
// MINH HOẠ — render.php cho route /r/{kid}/{sig}/{asset}/{v}/{crop}/{w}.{fmt}. Không phải thư viện. PHP ≥ 8.1, Imagick.
declare(strict_types=1);

const WIDTHS = [320, 640, 960, 1280, 1600, 2048];
const MIME = ['webp' => 'image/webp', 'avif' => 'image/avif', 'jpeg' => 'image/jpeg'];
const MAX_EDGE = 4096;          // trần cứng mỗi cạnh ảnh ra
const MAX_SRC_PIXELS = 50e6;    // ảnh gốc lớn hơn → từ chối
const SLOTS = 4;                // số tác vụ biến đổi đồng thời
const CACHE_DIR = '/var/cache/renditions';

function fail(int $code): never
{
    http_response_code($code);
    header('Cache-Control: no-store');
    exit;
}

function send(string $file, string $fmt): never
{
    header('Content-Type: ' . MIME[$fmt]);
    header('Content-Length: ' . filesize($file));
    header('Cache-Control: public, max-age=31536000, immutable');
    header('X-Content-Type-Options: nosniff');
    readfile($file);
    exit;
}

// 1) Parse chặt: cả đường dẫn khớp một regex, không query string.
if ($_SERVER['REQUEST_METHOD'] !== 'GET' || ($_SERVER['QUERY_STRING'] ?? '') !== '') fail(400);
$path = (string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (!preg_match('~^/r/([a-z0-9]{1,8})/([A-Za-z0-9_-]{43})/([A-Za-z0-9_-]{1,64})/(\d{1,10})/(full|\d\.\d{4}(?:,\d\.\d{4}){3})/(\d{3,4})\.(webp|avif|jpeg)$~D', $path, $m)) fail(400);
[, $kid, $sig, $asset, $v, $crop, $w, $fmt] = $m;
if (!in_array((int) $w, WIDTHS, true)) fail(400);

// 2) Chữ ký — TRƯỚC mọi đọc file / biến đổi. Hai khoá hợp lệ trong lúc xoay.
$secret = match ($kid) {
    'k1' => (string) getenv('RENDITION_KEY_K1'),
    'k2' => (string) getenv('RENDITION_KEY_K2'),
    default => '',
};
if (strlen($secret) < 32) fail(403);
$canonical = "{$asset}|{$crop}|{$w}|{$fmt}|{$v}";
$expected = rtrim(strtr(base64_encode(hash_hmac('sha256', $canonical, $secret, true)), '+/', '-_'), '=');
if (!hash_equals($expected, $sig)) fail(403); // hằng thời gian; KHÔNG ==, ===, strcmp

$box = null;
if ($crop !== 'full') {
    [$x, $y, $cw, $ch] = array_map('floatval', explode(',', $crop));
    if ($cw <= 0 || $ch <= 0 || $x + $cw > 1 + 1e-9 || $y + $ch > 1 + 1e-9) fail(400);
    $box = [$x, $y, $cw, $ch];
}

// 3) Cache đĩa: khoá = hash của chuỗi đã ký (không bao giờ dựng đường dẫn từ input).
$hash = hash('sha256', $canonical);
$file = CACHE_DIR . '/' . substr($hash, 0, 2) . '/' . $hash . '.' . $fmt;
if (is_file($file)) send($file, $fmt);

// 4) Ảnh gốc: tra theo (asset, v) trong DB của site — không nối chuỗi đường dẫn từ $asset.
$src = site_original_path($asset, (int) $v); // ?string, đường dẫn tuyệt đối trong kho ảnh gốc
if ($src === null) fail(404);

// 5) Giới hạn đồng thời (giữ handle tới hết request) + giới hạn tài nguyên.
$slot = null;
for ($i = 0; $i < SLOTS && !$slot; $i++) {
    $h = fopen(sys_get_temp_dir() . "/rendition-slot-{$i}.lock", 'c');
    if ($h && flock($h, LOCK_EX | LOCK_NB)) $slot = $h; elseif ($h) fclose($h);
}
if (!$slot) { header('Retry-After: 5'); fail(503); }
Imagick::setResourceLimit(Imagick::RESOURCETYPE_MEMORY, 256 * 1024 * 1024);
Imagick::setResourceLimit(Imagick::RESOURCETYPE_TIME, 10); // giây
set_time_limit(20);

// 6) Biến đổi.
$probe = new Imagick();
$probe->pingImage($src); // chỉ đọc header
if ($probe->getImageWidth() * $probe->getImageHeight() > MAX_SRC_PIXELS) fail(422);
$im = new Imagick($src);
$ow = $im->getImageWidth();
$oh = $im->getImageHeight();
if ($box) {
    $px = (int) round($box[0] * $ow);
    $py = (int) round($box[1] * $oh);
    $pw = max(1, min($ow - $px, (int) round($box[2] * $ow)));
    $ph = max(1, min($oh - $py, (int) round($box[3] * $oh)));
    $im->cropImage($pw, $ph, $px, $py);
    $im->setImagePage(0, 0, 0, 0);
}
$iw = $im->getImageWidth();  // vùng đã cắt
$ih = $im->getImageHeight();
$outW = min((int) $w, $iw, MAX_EDGE);                       // không phóng to, không vượt trần
$outH = max(1, (int) round($ih * $outW / $iw));
if ($outH > MAX_EDGE) { $outH = MAX_EDGE; $outW = max(1, (int) round($iw * $outH / $ih)); }
$im->thumbnailImage($outW, $outH);                           // thumbnail* bỏ metadata / profile
$im->setImageFormat($fmt);
$im->setImageCompressionQuality($fmt === 'avif' ? 50 : 80);

if (!is_dir(dirname($file))) mkdir(dirname($file), 0750, true);
$tmp = $file . '.' . bin2hex(random_bytes(6)) . '.tmp';
$im->writeImage($tmp);
rename($tmp, $file); // nguyên tử: request song song không bao giờ đọc file dở
send($file, $fmt);
```

Dùng **GD** thay Imagick: `getimagesize()` để kiểm số điểm ảnh **trước** `imagecreatefrom*()`, `imagecrop()` +
`imagescale()`, ghi bằng `imagewebp()` / `imageavif()` (PHP ≥ 8.1, tuỳ bản build) / `imagejpeg()`; GD không có giới hạn
thời gian nội bộ → càng cần `set_time_limit` + giới hạn đồng thời. Có thể tách endpoint ra một pool PHP-FPM riêng
(`pm.max_children` nhỏ) để tác vụ ảnh không giành worker của trang.

## Xoay khoá

1. Thêm khoá mới (`k3`) vào env của **mọi** nơi kiểm (Worker, endpoint) — lúc này `k2` và `k3` cùng hợp lệ.
2. Đổi nơi **ký** sang `k3` (`RENDITION_KID=k3`).
3. Đợi lâu hơn TTL dài nhất của HTML đã cache có chứa URL `k2` (page cache, CDN cho HTML), rồi gỡ `k2`.
4. Lộ khoá: gỡ ngay khoá đó + purge cache CDN của đường biến thể (bản do kẻ có khoá ký có thể đã nằm ở edge).

## Ảnh riêng tư

URL ký chỉ chứng minh "server đã từng sinh URL này", **không** chứng minh "người đang xem có quyền". Với ảnh gốc riêng tư
(nháp, tài liệu nội bộ, ảnh của từng người dùng):

- Thêm `exp` (Unix time, ngắn: vài phút) vào **cả** URL lẫn chuỗi ký (`…|{v}|{exp}`); hết hạn → 403.
- Endpoint kiểm **phiên + quyền** của người xem ở **mỗi** request (sau chữ ký, trước cache đĩa / đọc file).
- `Cache-Control: private, max-age=…` (≤ thời gian còn lại của `exp`) — CDN không giữ bản công khai; tách đường
  (`/p/…`) để rule cache / rate limit khác `/r/…`.
- Cache đĩa vẫn dùng được nhưng khoá **bỏ `exp`** (quyền kiểm mỗi request) — không thì mỗi lần ký lại là một file mới.

## Xem thêm

- [Cropper](../components/cropper.md), [Media field](../components/media-field.md), [Media gallery](../components/media-gallery.md) (0.43.0: mỗi ảnh của gallery theo đúng checklist này — crop / focal theo **chỗ dùng**, render bằng URL ký), [Media picker](../components/media-picker.md)
- [Bảo mật](security.md) — checklist trước khi lên production
- Nội bộ: [ADR 0015 td-cropper](../internal/decisions/0015-td-cropper.md),
  [security-model › Trách nhiệm của site](../internal/security-model.md#7-trách-nhiệm-của-site)
