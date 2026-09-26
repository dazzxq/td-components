## Project

**td-components**

UI kit duy nhất (single source of truth) cho mọi site: dwp (WordPress), 135 (PHP thuần) và site sau này.
Web Components (Custom Elements v1) không Shadow DOM, CSP-strict, vanilla JS. Triết lý: **lõi nhỏ + hook/param**,
site tuỳ biến qua token `--td-*`, hook và attribute/property, không sửa lõi. dcms2 đứng độc lập (không sync).

**Core Value:** Drop vào bất kỳ project nào, import component cần dùng, chạy ngay — không cần config, không cần copy code, không global namespace pollution.

**Docs hub: [docs/README.md](docs/README.md)** (vision, roadmap, architecture, conventions, ADR).

### Constraints

- **No Shadow DOM**: CSS của host (token CSS; Tailwind với component legacy) phải chạm được component
- **CSP strict**: không `style="…"`, không chèn `<style>`; chỉ file CSS ship kèm + CSSOM
- **No build step phía consumer**: Vite import source; PHP dùng `<link>` tới `td.css`
- **Backward compatible concept**: cover cùng functionality như DCMS gốc
- **Solo dev**: Không over-engineer, giữ simple

## Technology Stack

| Layer | Choice | Ghi chú |
|-------|--------|---------|
| Components | Web Components (Custom Elements v1) + ElementInternals | Browser native |
| Styling (mục tiêu) | CSS token `--td-*` + `@layer td.tokens, td.component, td.utilities`, một file `td.css`; CSSOM cho giá trị per-instance | [ADR 0008](docs/decisions/0008-drop-tailwind-token-css.md) |
| Styling (legacy) | Tailwind v4 từ host (peerDependency) + CSSOM + `adoptStyles` | Còn cần cho tới khi component cuối migrate xong |
| Module system | ES Modules, ship source | Không bundle |
| Dev | Vite, Storybook 8.6 (`@storybook/web-components-vite`, story bằng chuỗi HTML thường) | |
| Test | `node --test` + DOM shim, `@web/test-runner` + Playwright, CSP gate Playwright | |

**Không dùng:** Lit, Shadow DOM, SASS/LESS, TypeScript, bundle output.

## Conventions & Architecture

- [docs/conventions.md](docs/conventions.md): cấu trúc file, đặt tên, escaping, test, release
- [docs/architecture.md](docs/architecture.md): base class, mô hình style, kiến trúc style mục tiêu
- [docs/design/liquid-glass.md](docs/design/liquid-glass.md): **UI mới bắt buộc theo bộ luật này**
- [docs/security.md](docs/security.md): XSS theo ngữ cảnh, CSP

## Workflow

Roadmap: [docs/roadmap.md](docs/roadmap.md) — update status + CHANGELOG with every change. Không dùng GSD.
Quyết định kiến trúc mới → thêm ADR trong `docs/decisions/`.
