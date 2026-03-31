# Stack Research

**Domain:** Shared Web Components UI Library
**Researched:** 2026-03-31
**Confidence:** HIGH

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

```json
{
  "name": "@dazzxq/td-components",
  "type": "module",
  "main": "index.js",
  "peerDependencies": {
    "tailwindcss": ">=3.0.0"
  }
}
```

Consumers install qua GitHub, bundler của họ resolve trực tiếp source files.
