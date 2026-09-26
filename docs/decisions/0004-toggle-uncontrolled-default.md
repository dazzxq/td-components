# 0004. td-toggle mặc định uncontrolled

- **Status:** Accepted
- **Date:** 2026-06-09 (v0.2.0, breaking)

## Context

Toggle v0.1 chỉ phát `change`, consumer phải tự lật `checked`. Khác với checkbox native, và sai khi toggle nằm trong
`<form>` (giá trị submit không đổi nếu consumer quên lật).

## Decision

- Click tự lật trạng thái như checkbox native, vẫn phát `change`.
- Attribute boolean `controlled` khôi phục hành vi cũ (chỉ phát event).

## Consequences

- Breaking cho consumer dựa vào hành vi cũ; ghi trong CHANGELOG 0.2.0.
- Backlog: `commit()`/trạng thái pending cho kiểu optimistic (dcms `ec08c81d`/`b4647dd2`) sẽ xây trên chế độ `controlled`.
