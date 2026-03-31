<!-- GSD:project-start source:PROJECT.md -->
## Project

**td-components**

Shared UI Web Components library dùng chung cho nhiều project. Migrate từ 22 DCMS components (window.DCMS global, JS thuần render HTML + Tailwind) sang Web Components chuẩn với lifecycle management, không Shadow DOM, giữ nguyên Tailwind CSS. Storybook để dev/test components trong isolation.

**Core Value:** Drop vào bất kỳ project nào, import component cần dùng, chạy ngay — không cần config, không cần copy code, không global namespace pollution.

### Constraints

- **No Shadow DOM**: Components phải dùng được Tailwind classes từ host page
- **No build step bắt buộc**: Project import vào chỉ cần có Vite (hoặc bundler tương đương) và Tailwind
- **Backward compatible concept**: Các component mới phải cover cùng functionality như DCMS components gốc
- **Solo dev**: Không over-engineer, giữ simple
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core
| Layer | Choice | Version | Rationale | Confidence |
|-------|--------|---------|-----------|------------|
| Components | Web Components (Custom Elements v1) | Browser native | No framework dependency, lifecycle do browser quản lý, works everywhere | HIGH |
| Styling | Tailwind CSS (peerDependency) | 3.x / 4.x | Components hiện tại đã dùng Tailwind, host page cung cấp | HIGH |
| Custom CSS | Vanilla CSS + BEM `td-` prefix | N/A | Cho animations, keyframes, styles không có trong Tailwind | HIGH |
| Module system | ES Modules | Native | Tree-shaking, no global namespace, Vite support native | HIGH |
| Bundler (dev) | Vite | 6.x | Fast HMR, ES Module native, Storybook cũng dùng Vite | HIGH |
### Development
| Tool | Choice | Version | Rationale | Confidence |
|------|--------|---------|-----------|------------|
| Component dev/test | Storybook | 8.x | Visual testing, controls panel, composition testing, a11y addon | HIGH |
| Storybook renderer | @storybook/web-components-vite | 8.x | Native Web Components support + Vite builder | HIGH |
| Lit HTML (Storybook only) | lit-html | 3.x | Template literals cho Storybook stories, KHÔNG dùng trong components | MEDIUM |
### NOT Recommended
| Tool | Why NOT |
|------|--------|
| Lit framework | Thêm dependency 5kb, components đủ đơn giản không cần reactive properties system |
| Shadow DOM | Chặn Tailwind CSS từ host page |
| SASS/LESS | Overhead build step, Tailwind + vanilla CSS đủ |
| TypeScript | Solo dev, 22 components, JS + JSDoc đủ, không cần compile step |
| Bundling library output | Consumers dùng bundler riêng (Vite), ship source ES Modules |
## Package Structure
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
