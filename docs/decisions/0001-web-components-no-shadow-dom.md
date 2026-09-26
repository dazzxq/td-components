# 0001. Web Components, không Shadow DOM

- **Status:** Accepted
- **Date:** 2026-03-31

## Context

22 component DCMS là factory JS gắn vào `window.DCMS`: làm bẩn global, listener không được dọn (rò rỉ bộ nhớ),
khó dùng lại giữa các project. Cần thứ dùng được như thẻ HTML trong Blade/PHP mà không cần framework.

## Decision

- Custom Elements v1, vanilla JS + JSDoc, ship source ES Modules (không bundle, không TypeScript, không Lit).
- **Không Shadow DOM**: render vào light DOM để CSS của host (lúc đầu là Tailwind, sau là token CSS) chạm được.
- Base class `TdBaseElement` lo lifecycle, sync attribute/property, cleanup tự động, `emit()`.
- Mỗi component một subpath export, import riêng lẻ được.

## Consequences

- Browser lo lifecycle; `disconnectedCallback` dọn listener/timer.
- Không có style encapsulation: class tiền tố `td-` để tránh đụng CSS host; host có thể vô tình đè style.
- Form participation không có sẵn → [0003](0003-elementinternals-form-association.md).
- Loại mọi thư viện bên thứ ba dùng Shadow DOM (vd. `@ozcanyldzhn/liquid-glass-js`).
