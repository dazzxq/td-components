# 0008. Bỏ Tailwind khỏi component → CSS token phân lớp (`td.css`)

- **Status:** Accepted 2026-09-27 — **Done**: mọi component token-native ở 0.10.0, peer Tailwind bỏ ở 0.11.0
- **Date:** 2026-09-27
- **Supersedes:** [0002](0002-tailwind-v4-peer.md). Thu hẹp [0005](0005-csp-strict-cssom-adopted-sheets.md) (adopted sheet chỉ còn cho component legacy).
- Chốt sau debate Claude ↔ Codex 2026-09-27.

## Context

td trở thành UI kit duy nhất cho dwp (WordPress), 135 (PHP thuần) và site sau này. Hai site đầu **không dùng Tailwind**.
135 đã fork một bộ kit `td-` không Tailwind (td-tokens/td-ui/td-glass/td-lightbox css, gốc từ dwp). CSS nằm trong
JS (adopted sheet) khó override theo site, và kit cần ngôn ngữ Liquid Glass có fallback a11y ([liquid-glass.md](../design/liquid-glass.md)).

## Decision

1. **Bỏ host-Tailwind khỏi bên trong component.** Token `--td-*`; layer khai báo một lần, đứng đầu:
   `@layer td.tokens, td.component, td.utilities;`. Site override token bằng CSS **không layer** (thắng mọi layer),
   không sửa lõi.
2. **Một file `td.css` chuẩn**, build bằng script node concat tất định từ `src/styles/*.css` theo manifest:
   prelude layer → tokens → foundations → components → utilities. Artifact được commit; CI build lại và diff.
   - Vite: `import '@dazzxq/td-components/td.css'`. PHP: `<link rel="stylesheet" nonce>`.
   - **Không** fallback `adoptedStyleSheets`, **không** CSS-in-JS theo component, **không** dò sentinel.
     Lý do: race khi component connect trước khi `<link>` tải xong → rule trùng lặp nằm sau trong thứ tự đè lên.
3. **Từ vựng class:** BEM của kit 135 thắng (`.td-x__el--mod`). State qua `aria-*` / `:checked` / `data-state`;
   JS không bật tắt class hiển thị. Một bộ từ vựng trong lõi, công bố bảng mapping cũ → mới, **không** alias legacy.
4. **SSR:** td sở hữu markup contract trung lập ngôn ngữ + golden HTML fixture. PHP helper (`td_ui_*` ở 135,
   `dwp_ui_*` ở dwp) ở lại repo site, là adapter mỏng.
5. **Glass a11y fallback:** component đọc `var(--_td-glass-X, var(--td-glass-X))`. **Không bao giờ** khai báo alias
   private trên `:root` (`var()` resolve tại nơi khai báo → đóng băng override ở cây con). Các query fallback
   (`@supports not (backdrop-filter)`, `prefers-reduced-transparency`, `prefers-contrast: more`,
   `html[data-td-glass="off"]`, và `forced-colors` **cuối cùng** với cặp màu hệ thống) gán biến private trên marker
   chung `.td-glass-surface` kèm `!important`. Không lồng kính (Backdrop Root).
6. **Giai đoạn trộn:** `td.css` không reset. Mỗi export gắn nhãn token-native hoặc legacy (Tailwind). CSP harness
   chạy **hai profile** (fixture Tailwind legacy + `td.css` token-native) và thêm gate **nonce-only** (Chromium/Firefox/WebKit)
   trước khi tuyên bố hỗ trợ nonce. Peer Tailwind chỉ bị bỏ khi component cuối cùng migrate xong.

## Consequences

- **Breaking từ v0.5+**: class, markup và cách nạp CSS đổi; consumer phải nạp `td.css`.
- 70 baseline visual chụp lại theo từng component khi migrate.
- Khoảng 1.070 token Tailwind phải viết lại, chia batch ([roadmap](../roadmap.md)).
- Thêm một bước build nhỏ phía repo (không phía consumer) và một check CI.
- Site không Tailwind dùng được kit; theming theo site chỉ bằng override token.
