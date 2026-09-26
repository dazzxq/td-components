# 0003. Form association bằng ElementInternals

- **Status:** Accepted
- **Date:** 2026-06-09 (v0.2.0)

## Context

Form control v0.1 không submit trong `<form>` native, không tham gia validation/reset/`<fieldset disabled>`.
Cách tắt "forward `name` xuống input bên trong" gây submit trùng khi thêm internals và hỏng nếu sau này có Shadow DOM.

## Decision

- Base `TdFormElement`: `static formAssociated = true` + `attachInternals()`; host sở hữu giá trị submit và validity.
- Default value chụp lúc connect, tách khỏi state sống (reset đúng sau khi user tương tác).
- `_effectiveDisabled` = attr `disabled` OR fieldset tổ tiên, không phản chiếu ra attribute.
- `<label for>` trỏ vào host. Input bên trong **không** mang `name` (breaking 0.2.0).
- Input-field tự tính lại ValidityState bằng input probe tách rời, để control native bên trong không chặn form.

## Consequences

- Cần trình duyệt có ElementInternals (Chrome 77+, Firefox 98+, Safari 16.4+) hoặc polyfill.
- Cần test trình duyệt thật (`@web/test-runner` + Playwright); DOM shim của Node không đủ.
- `td-button` cố ý không form-associated (dùng `<button>` light-DOM).
- Nơi sẽ đặt error contract chung (`setError` + `aria-invalid` + `aria-errormessage`) ở v0.5.x.
