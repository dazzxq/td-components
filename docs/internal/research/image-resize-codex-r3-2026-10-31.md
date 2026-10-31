completed
### Key Insights

- “All scenarios handled” should mean every input reaches one of four explicit outcomes: unchanged passthrough, supported transformation, policy rejection, or site-supplied processor. Supporting every image encoding natively is neither realistic nor desirable. — Source: analysis
- `createImageBitmap()` exposes orientation and resize controls, but color conversion remains implementation-specific; runtime probes and post-decode dimension checks remain necessary. — Source: https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html
- Canvas serialization is asynchronous, PNG is the mandatory fallback for unsupported output types, and quality values are interpreted differently by implementations. The output MIME must therefore be verified. — Source: https://html.spec.whatwg.org/multipage/canvas.html
- Default 2D canvas storage is sRGB/unorm8. Wide-gamut and high-bit-depth inputs can be clipped or quantized during the native pipeline. — Source: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext
- Ultra HDR/Adaptive HDR files contain an SDR base plus a gain map. Ordinary decoding remains compatible, but canvas re-encoding generally preserves only the rendered SDR result and discards the gain map. — Source: https://developer.android.com/media/platform/hdr-image-format
- Client-side limits are UX and bandwidth controls, not a security boundary. The server must sniff, decode safely, enforce dimensions/bytes, sanitize metadata, and reject malicious content independently. — Source: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- The owner’s “90%, 5 MB, 12 MP” example is underspecified: browser JPEG quality is not a standardized percentage, MB versus MiB matters, 12 MP says nothing about extreme sides, and quality `0.9` cannot guarantee 5 MiB. — Source: analysis

### Considerations

- **A1 — Progressive JPEG:** accept SOF2, resize and encode like baseline JPEG; progressive encoding is not promised for output. — Source: analysis
- **A2 — CMYK/YCCK/Adobe-inverted JPEG:** let the browser decoder convert to the canvas color space; reject on decode failure, and document that print-faithful CMYK preservation requires the custom processor/server. — Source: https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html
- **A3 — Grayscale JPEG:** accept; transformed output will normally be an RGB JPEG, not necessarily grayscale-coded. — Source: analysis
- **A4 — 12-bit or arithmetic JPEG:** unsupported SOF/coding mode is rejected as `decode-unsupported`; do not attempt a risky full decode after the bounded inspector identifies it. — Source: analysis
- **A5 — SOF beyond the scan bound:** reject as `header-limit`, never silently full-decode; **OWNER DECISION:** 256 KiB versus 1 MiB, with 1 MiB recommended to accommodate metadata-heavy camera files. — Source: analysis
- **A6 — MPO/multi-picture JPEG:** detect MPF in APP2 and classify as special JPEG; passthrough when compliant, otherwise reject/custom-process rather than discard secondary images. — Source: analysis
- **A7 — Ultra HDR/gain-map JPEG:** recognized gain-map/MPF files follow the special-JPEG policy; default passthrough preserves HDR, while explicit `flatten-sdr` permits resize with documented HDR loss. — Source: https://developer.android.com/media/grow/ultra-hdr
- **A8 — 16-bit PNG:** classify as special/high-bit-depth; passthrough if compliant, otherwise reject/custom-process because the ordinary unorm8 canvas path may quantize it. — Source: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext
- **A9 — PNG iCCP/gAMA:** unchanged files retain chunks; resized files are rendered through browser color management and re-encoded without promising the original profile or tone metadata. — Source: https://html.spec.whatwg.org/multipage/canvas.html
- **A10 — Interlaced PNG:** accept and process as an 8-bit static PNG; output need not remain interlaced. — Source: analysis
- **A11 — APNG:** detect `acTL` before `IDAT`; passthrough when compliant, otherwise reject/custom-process to avoid retaining only the first frame. — Source: https://www.w3.org/TR/png-3/
- **A12 — Animated WebP:** all WebP is passthrough in v1, so animation is preserved; an over-limit file is rejected. — Source: analysis
- **A13 — Static WebP/AVIF over limits:** reject as `format-not-transformable` or delegate to `imageProcessor`; do not depend on uneven canvas encoder support. — Source: analysis
- **A14 — HEIC/HEIF:** passthrough regardless of whether the current browser happens to decode it; over-limit input is rejected/custom-processed, giving consistent Safari/Chrome behavior. — Source: analysis
- **A15 — JPEG XL:** passthrough if allowed and compliant; otherwise reject/custom-process. — Source: analysis
- **A16 — TIFF, ARW, CR3, DNG and other RAW:** passthrough only when the site accepts them and applicable byte limits pass; otherwise reject/custom-process. — Source: analysis
- **A17 — BMP:** v1 treats it as passthrough rather than expanding the native transformation matrix; reject if required limits cannot be verified or met. — Source: analysis
- **A18 — SVG:** never rasterize in the optimizer; apply input/output byte rules only, while server-side SVG sanitization remains mandatory. Raster `maxPixels` is not applicable to vectors. — Source: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- **A19 — Zero-byte input:** reject immediately as `empty-file`. — Source: analysis
- **A20 — Truncated/corrupt input:** reject as `invalid-image` or `decode-failed`; never upload after a required ceiling becomes unverifiable. — Source: https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html
- **A21 — Extension/MIME mismatch:** inspect magic bytes and structure; use the canonical sniffed type for policy, while retaining the original name in diagnostic metadata. — Source: analysis
- **A22 — Empty `file.type`:** identify supported formats from signatures; an unknown signature follows the passthrough/allowed-format policy. — Source: analysis
- **A23 — Huge EXIF thumbnail/MakerNote:** skip JPEG segments by validated length and inspect only bounded IFD0 orientation offsets; never recursively parse thumbnails or MakerNotes. — Source: analysis
- **A24 — GIF, including animation:** passthrough only; reject when over a mandatory byte limit. — Source: analysis
- **A25 — Lossless JPEG/SOF3:** reject/custom-process; SOF0–2 are the native v1 support boundary. — Source: analysis
- **A26 — Palette PNG and `tRNS`:** accept as static PNG and preserve alpha during canvas processing. — Source: analysis
- **A27 — Animated AVIF/HEIF sequences, depth maps and Live Photo companions:** passthrough; the optimizer must not silently select one frame or one companion file. — Source: analysis
- **A28 — ICO, PDF-disguised-as-image, and polyglots:** reject unless explicitly accepted as a generic passthrough file; never send them through image decoding based only on extension. — Source: analysis
- **A29 — C2PA/Content Credentials, IPTC, XMP and signatures:** any re-encode may remove or invalidate them; a provenance-sensitive site must use `metadataPolicy: "require-preserve"` or a specialized processor. — Source: analysis

- **B1 — Already compliant:** return the exact original `File`, preserving bytes and hashes, unless `metadataPolicy: "strip-always"` explicitly requires re-encoding. — Source: analysis
- **B2 — Exactly at a limit:** limits are inclusive (`<=`); no transform occurs. — Source: analysis
- **B3 — Tiny file with huge declared pixels:** enforce `maxInputPixels` and `maxInputSide` from bounded headers before decode. — Source: analysis
- **B4 — 12416×1856 panorama:** passes a 16384-side guard if it also passes `maxInputPixels`; resize-in-decode applies normally. — Source: analysis
- **B5 — 20000×3000 panorama:** **OWNER DECISION:** reject under the recommended 16384/50 MP safety defaults, or raise both caps for panorama-heavy sites; safety defaults are recommended. — Source: analysis
- **B6 — Quality floor still exceeds bytes:** shrink dimensions, retry within the total encode budget, and reject `cannot-satisfy-limits` if no candidate succeeds. — Source: analysis
- **B7 — Encoded result larger than original:** use the original only if it satisfies every limit; otherwise a larger transformed result may be used only if it is compliant and necessary for a dimension limit. — Source: analysis
- **B8 — Opaque 8 MB screenshot PNG:** **OWNER DECISION:** default `pngPolicy: "preserve"` and shrink dimensions; optional `jpeg-if-opaque` costs a full alpha readback and may blur text, so it should not be the generic default. — Source: analysis
- **B9 — Transparent PNG:** never flatten to JPEG unless the site explicitly supplies a background/format-conversion policy. — Source: analysis
- **B10 — One-pixel image:** dimensions never fall below 1×1; if 1×1 still exceeds the byte ceiling, reject. — Source: analysis
- **B11 — Extreme aspect ratio rounding:** floor scaled dimensions, clamp each to at least one, then recompute the other dimension so side and pixel constraints remain conjunctive. — Source: analysis
- **B12 — Below bytes but over pixels:** resize; byte compliance alone does not permit passthrough. — Source: analysis
- **B13 — Below pixels but over bytes:** JPEG may re-encode at the same dimensions; PNG may re-encode once and then shrink if still too large. — Source: analysis
- **B14 — Non-monotonic encoder sizes:** verify every candidate and retain compliant candidates rather than assuming quality or dimensions always produce monotonic byte sizes. — Source: analysis
- **B15 — Odd JPEG dimensions:** allow them; do not round to chroma-block multiples unless a replacement encoder requires that. — Source: analysis

- **C1 — Orientation:** explicitly request `imageOrientation: "from-image"` and never manually rotate until the runtime adapter has established that orientation was ignored. — Source: https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap
- **C2 — Axis swap:** EXIF orientations 5–8 swap logical width/height before scale calculation; all eight orientations, including mirrored variants, need tests. — Source: analysis
- **C3 — Behavioral probe:** lazily decode a tiny vendored asymmetric orientation-6 JPEG, request a distinct resized shape, and verify dimensions plus corner pixels; cache the result per realm. — Source: analysis
- **C4 — Failed probe:** use the verified `<img>` fallback only below `fallbackMaxPixels`; otherwise reject `resize-unsupported` rather than risking a full large decode or double rotation. — Source: analysis
- **C5 — CSP fallback:** `<img>` plus object URL requires `img-src blob:`; sites without it receive `resize-unsupported` on engines needing that fallback. No worker CSP change is needed in v1. — Source: analysis

- **D1 — Older iOS ignoring resize options:** never attempt the 33 MP `<img>` fallback; reject above `fallbackMaxPixels`. Even a successful small probe cannot prove that the decoder avoids all full-resolution intermediate memory. — Source: analysis
- **D2 — Historical iOS canvas-area limit:** the 12 MP output target stays below the commonly reported 16,777,216-pixel limit, but process termination from decoder memory remains uncatchable. — Source: https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/
- **D3 — Low-memory Android:** do not infer safety from `navigator.deviceMemory`; use fixed raw caps, resize-in-decode, single-job execution, and documented site overrides. — Source: analysis
- **D4 — Many queued files:** cap batch file count and total raw bytes, hold only `File` references until each job runs, and admit jobs FIFO. — Source: analysis
- **D5 — Picker closes mid-decode/encode:** mark the job cancelled immediately; suppress all late results and upload calls when the uncancellable browser promise settles. — Source: analysis
- **D6 — Cleanup:** call `ImageBitmap.close()`, revoke object URLs, clear canvas dimensions, release candidate blobs, and remove abort listeners in `finally`. — Source: https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html
- **D7 — Long tasks:** `toBlob()` serialization is specified to run in parallel, but draw/decode behavior can still produce jank; profile the 33 MP fixture before introducing a Worker. — Source: https://html.spec.whatwg.org/multipage/canvas.html
- **D8 — Backgrounding/BFCache:** cancellation or teardown invalidates the job token; a restored page must not resume an obsolete upload implicitly. — Source: analysis

- **E1 — Filename/extension:** preserve names when MIME stays the same; if a custom processor changes MIME, replace only a recognized final image extension and report both names in optimization metadata. — Source: analysis
- **E2 — HEIC and other passthrough names:** remain untouched. — Source: analysis
- **E3 — `lastModified`:** preserve the original value for adapter compatibility; `optimization.changed` states that the bytes are new. — Source: analysis
- **E4 — MIME:** construct the transformed `File` from the verified blob type; reject `output-type-mismatch` when an encoder silently returns PNG. — Source: https://html.spec.whatwg.org/multipage/canvas.html
- **E5 — Determinism:** do not promise byte-identical results across engines or versions; quality interpretation and encoders differ. — Source: https://html.spec.whatwg.org/multipage/canvas.html
- **E6 — Deduplication:** unchanged passthrough retains exact-hash reuse; transformed files generally do not, and the server should use semantic/perceptual dedup if needed. — Source: analysis
- **E7 — Adapter metadata:** retain the existing first `file` argument and add `optimization` to the existing second options object; extra object fields are backward-compatible with current adapters. — Source: local project analysis
- **E8 — Suggested metadata envelope:** include `changed`, `reasons`, original/output name, MIME, bytes, oriented dimensions, `metadataPreserved`, and `specialContentPreserved`; do not mutate the `File` with custom properties. — Source: analysis

- **F1 — Default metadata:** `preserve-when-unchanged` means exact passthrough retains GPS/EXIF, while a necessary canvas transform loses metadata. — Source: analysis
- **F2 — Privacy mode:** `strip-always` forces a supported re-encode even when already compliant; unsupported/special formats are rejected rather than falsely claiming metadata removal. — Source: analysis
- **F3 — News/copyright mode:** `require-preserve` permits unchanged passthrough but rejects transformations unless the custom processor can retain required metadata. — Source: analysis
- **F4 — Selective GPS removal:** not provided by the native v1 pipeline because it would require reliable EXIF/XMP rewriting; use the processor hook or server. — Source: analysis
- **F5 — Server privacy:** the server must still remove prohibited GPS/device identifiers because the client can be bypassed. — Source: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html

- **G1 — Display-P3/wide-gamut input:** the v1 output contract is sRGB-oriented; out-of-gamut colors may clip, so color-critical sites use passthrough or a specialized processor. — Source: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext
- **G2 — CMYK:** browser conversion is acceptable for ordinary web delivery but not a press-production guarantee. — Source: https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html
- **G3 — Wide-gamut/high-bit-depth PNG:** compliant files pass unchanged; transformations do not promise gamut or precision preservation. — Source: analysis
- **G4 — Display-P3 canvas option:** do not make it the v1 default because support and encoder behavior remain less uniform than sRGB. — Source: https://developer.mozilla.org/en-US/docs/Web/API/ImageData/colorSpace

- **H1 — Units:** define `maxBytes` in bytes and use `5 * 1024 * 1024`; define `maxPixels: 12_000_000` as decimal pixels. Document both explicitly. — Source: analysis
- **H2 — Invalid configuration:** unknown keys warn or are ignored according to kit convention; non-finite/non-positive limits, quality outside `[0,1]`, floor above start, or invalid attempt counts throw during normalization. — Source: analysis
- **H3 — Impossibly tiny valid ceiling:** accept any positive `maxBytes`, but report `cannot-satisfy-limits` at runtime. — Source: analysis
- **H4 — Per-open override:** merge only recognized resize-policy keys over normalized site defaults, then freeze the resolved policy. — Source: analysis
- **H5 — Video/file picker:** only sniffed raster-image candidates enter the optimizer; video and generic files bypass it. — Source: analysis
- **H6 — Accept list:** `accept` is selection UX, while canonical sniffing and allowed-format validation are enforcement; both must pass. — Source: analysis
- **H7 — Server stricter than client:** surface the server’s normalized validation error; do not silently recompress again. Deployments should generate both limits from one site configuration. — Source: analysis
- **H8 — Custom processor result:** validate returned type, bytes, dimensions and policy compliance before calling the upload adapter; a hook cannot silently bypass mandatory ceilings. — Source: analysis
- **H9 — Configuration pollution:** copy own, recognized scalar keys only; never deep-spread arbitrary objects into shared defaults. — Source: analysis

- **I1 — Phases:** expose `queued → optimising → uploading → done|error|cancelled`; header inspection remains part of `optimising`. — Source: analysis
- **I2 — Progress:** optimization is indeterminate; upload percentage begins only once the adapter reports network progress. — Source: analysis
- **I3 — Announcement:** recommend one polite announcement after success, such as “Đã giảm từ 30 MB xuống 4,2 MB,” localized with `Intl.NumberFormat`; do not announce encode attempts. — Source: analysis
- **I4 — Errors:** map stable internal codes to a small set of localized messages and never expose decoder exceptions or filenames as HTML. — Source: analysis
- **I5 — Retry:** retain a successfully optimized `File` after an upload failure so retry repeats only the upload; retrying an optimization failure starts a fresh bounded job. — Source: analysis
- **I6 — Cancellation:** provide per-row cancel during queued, optimizing, and uploading states; cancellation is silent except when user confirmation is already part of dialog close. — Source: analysis
- **I7 — Reduced motion:** indeterminate progress must obey `prefers-reduced-motion`; its text/status remains available without animation. — Source: analysis
- **I8 — Accessibility:** mark the active row busy, give cancel/retry buttons file-specific accessible names, and debounce live-region changes. — Source: analysis

- **J1 — Existing crop step:** optimization occurs before upload; the current crop dialog operates later on the uploaded asset and normalized coordinates, so it remains independent. — Source: local project analysis
- **J2 — Future local pixel crop:** crop first, then resize/recompress, since cropping reduces decoded output and changes final dimensions. — Source: analysis
- **J3 — `td-dropzone`:** expose an opt-in `processor` property; generic dropzones must not inherit `TdMediaPicker` site defaults implicitly. The picker supplies its resolved processor to its internal dropzone. — Source: analysis
- **J4 — Clipboard images:** once normalized to a `File` with a safe synthetic name, route through the same sniffing, limits, queue and processor. — Source: analysis
- **J5 — Queue scope:** **OWNER DECISION:** module-global FIFO versus per-instance; one global optimization slot is recommended to prevent independent dropzones from decoding large files simultaneously. — Source: analysis
- **J6 — URL uploads:** `uploadFromUrl` is not fetched or resized by the browser; the server owns remote-file inspection and transformation. — Source: local project analysis
- **J7 — SSR/PHP:** nothing executes server-side in the kit; Symfony/PHP adapters receive either the original or processed `File` plus optional optimization metadata. — Source: analysis
- **J8 — CSP:** main-thread v1 adds no `worker-src` requirement; only an enabled legacy `<img>` fallback may require `img-src blob:`. — Source: analysis

- **K1 — Repository fixtures:** do not commit a private 30 MB camera photo; commit small licensed/synthetic fixtures for orientation, progressive/grayscale/CMYK JPEG, APNG, MPF/gain-map markers, corrupt headers and PNG bit depths. — Source: analysis
- **K2 — Large stress fixture:** generate a 7008×4672 image in test temporary storage for memory/geometry smoke tests, but keep a real Sony/phone camera file in a private manual test corpus because generated canvas JPEGs do not reproduce camera metadata or compression. — Source: analysis
- **K3 — CI:** run property tests in Chromium, Firefox and Playwright WebKit; assert dimensions, type, ceilings and cancellation—not byte snapshots. — Source: analysis
- **K4 — Real devices:** manually test current and oldest-supported iPhone/iPad, a low-memory Android device, desktop Safari/Firefox/Chrome, a P3 image, 33 MP JPEG, 20k panorama, HEIC, Ultra HDR and CMYK. — Source: analysis
- **K5 — Parser tests:** fuzz marker/chunk lengths, offset overflow, cyclic EXIF IFDs, truncated segments, excessive chunk counts and MIME/extension mismatch. — Source: analysis
- **K6 — Race tests:** close/cancel at every await boundary, retry upload without re-optimizing, and verify late decode/encode results cannot call the adapter. — Source: analysis
- **K7 — Performance gate:** record main-thread long tasks and peak process memory on real devices; a Worker becomes justified only by measured failures, not assumption. — Source: analysis

### Recommendations

- Ship the feature opt-in. Recommended enabled site profile:

```js
upload: {
  imageResize: {
    maxBytes: 5 * 1024 * 1024,
    maxPixels: 12_000_000,
    maxWidth: null,
    maxHeight: null,

    jpegQuality: 0.90,
    minJpegQuality: 0.65,
    resizeQuality: 'high',
    maxEncodes: 8,

    maxInputBytes: 64 * 1024 * 1024,
    maxInputPixels: 50_000_000,
    maxInputSide: 16_384,
    fallbackMaxPixels: 16_000_000,
    maxHeaderBytes: 1024 * 1024,

    metadataPolicy: 'preserve-when-unchanged',
    specialJpegPolicy: 'passthrough',
    pngPolicy: 'preserve',
    failurePolicy: 'reject'
  },

  imageProcessor: null
}
```

- Normalize and freeze the policy at `configureDefaults()`/open time. `imageResize: false` is the library default; per-open recognized keys override site defaults.

- Put the execution-neutral core in `src/utils/image-resize.js`, exporting an optimizer usable by the picker, future grid drop and opt-in dropzones. Inject decoding/surface/encoding adapters; do not add a Worker in v1.

- Inspect before decode: magic type, bounded JPEG/PNG structure, raw bytes, raw dimensions, JPEG components/SOF, EXIF orientation, APNG, MPF/gain-map indicators, and PNG bit depth.

- Use the conjunctive scale:

```text
min(1, maxWidth/w, maxHeight/h, sqrt(maxPixels/(w*h)))
```

Omit unset terms, use oriented dimensions, round down, and clamp sides to at least one.

- JPEG processing: encode first at `jpegQuality`; search downward to `minJpegQuality`; if still too large, shrink dimensions and retry, never exceeding `maxEncodes`. Verify each blob and retain the smallest compliant candidate.

- PNG processing: preserve alpha and format, try same-dimension recompression when only bytes fail, then shrink dimensions. Do not automatically convert screenshots to JPEG.

- Recognized animation, multipicture, gain-map HDR, high-bit-depth PNG and unsupported formats pass unchanged only when applicable limits are satisfied; otherwise reject or invoke the custom processor.

- Validate processor results exactly as native results. Recommended hook contract:

```js
imageProcessor(file, { policy, signal, onPhase })
// returns File or { file, info }
```

- Extend the existing upload options object without breaking the adapter:

```js
adapter.upload(processedFile, {
  fields,
  context,
  signal,
  onProgress,
  optimization: {
    changed,
    reasons,
    original: { name, type, size, width, height, lastModified },
    output: { name, type, size, width, height },
    metadataPreserved,
    specialContentPreserved
  }
})
```

- Stable job phases: `queued`, `optimising`, `uploading`, `done`, `error`, `cancelled`. Only `uploading` has numeric progress.

- Stable optimizer error codes:

  - `empty-file`
  - `type-not-allowed`
  - `input-too-large`
  - `input-dimensions-too-large`
  - `header-limit`
  - `invalid-image`
  - `decode-unsupported`
  - `decode-failed`
  - `resize-unsupported`
  - `canvas-limit`
  - `encode-failed`
  - `output-type-mismatch`
  - `format-not-transformable`
  - `cannot-satisfy-limits`
  - `processor-failed`
  - `processor-invalid-result`
  - `aborted`

- Map those to fewer user messages: invalid image, too large to process safely, format cannot be optimized, cannot meet required limit, optimization failed, and cancelled.

- Use a module-global FIFO with one optimization active at a time. Upload concurrency may remain independently configurable; a successful processed blob is reused for upload retry.

- Release v0.90.0 with the shared job model, phases and resize in the existing upload dialog; release grid-drop placeholders in v0.91.0. Shipping both together adds cancellation, placeholder and queue integration risk without validating the optimizer first.

- The Sony example scales from 7008×4672 to approximately 4242×2828 for 12 MP. Quality `0.90` is only the first encode; if it exceeds 5 MiB, the bounded quality/dimension policy continues. The existing raw `maxSize` check must not reject the 30 MB original before optimization.

### Sources

| # | URL | Description |
|---|-----|-------------|
| 1 | https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html | HTML specification for `createImageBitmap`, orientation, resizing, format sniffing and color conversion |
| 2 | https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap | Browser-facing documentation for image bitmap options |
| 3 | https://html.spec.whatwg.org/multipage/canvas.html | Canvas serialization, asynchronous `toBlob`, MIME fallback and quality semantics |
| 4 | https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext | Default sRGB/unorm8 canvas and Display-P3/float16 options |
| 5 | https://developer.mozilla.org/en-US/docs/Web/API/ImageData/colorSpace | Availability and behavior of canvas color spaces |
| 6 | https://developer.android.com/media/platform/hdr-image-format | Android Ultra HDR gain-map format |
| 7 | https://developer.android.com/media/grow/ultra-hdr | Ultra HDR compatibility and SDR fallback |
| 8 | https://developer.apple.com/videos/play/wwdc2024/10177/ | Apple Adaptive HDR, SDR base and gain-map model |
| 9 | https://www.w3.org/TR/png-3/ | PNG/APNG structure and chunks |
| 10 | https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html | Server-side file-upload security requirements |
| 11 | https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/ | Field report on historical iOS canvas-area limits |

### Open Questions

- **OWNER DECISION:** `maxHeaderBytes`: retain 256 KiB or adopt the recommended 1 MiB to reduce false rejection of metadata-heavy camera JPEGs.
- **OWNER DECISION:** retain `maxInputSide: 16384` and `maxInputPixels: 50 MP`, knowingly rejecting 20k/60 MP panoramas, or raise them for panorama-heavy deployments.
- **OWNER DECISION:** special JPEG default: recommended `passthrough`, or permit explicit `flatten-sdr` that loses gain maps/multipicture content.
- **OWNER DECISION:** site metadata policy: generic `preserve-when-unchanged`, privacy-oriented `strip-always`, or newsroom/provenance-oriented `require-preserve`.
- **OWNER DECISION:** whether to offer opt-in `jpeg-if-opaque` for screenshot PNGs; recommendation is to defer it until evidence shows PNG byte failures are common.
- **OWNER DECISION:** approve the module-global one-job optimizer queue rather than per-instance queues.
- **OWNER DECISION:** permit the legacy `<img>` fallback and document `img-src blob:`, or reject unsupported browsers without expanding CSP.
- **OWNER DECISION:** approve v0.90 queue/resize followed by v0.91 grid drop, changing the previously announced v0.90 scope.
- Literal immunity from browser-process termination is impossible. The design handles that class through pre-decode caps, fallback rejection, concurrency one and server fallback—not through a catchable JavaScript error.

### Confidence Level

- high

### Suggested Status (advisory)

- CONSENSUS
