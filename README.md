# td-components

Bộ UI kit Web Components dùng chung cho mọi site (dwp — WordPress, 135 — PHP thuần, và site sau này).
Không Shadow DOM, CSP-strict, vanilla ES modules, một file CSS `td.css`, giao diện minimal surfaces (nền + viền mảnh + bóng mềm), nhãn tiếng
Việt. Lõi nhỏ; site tuỳ biến qua token `--td-*`, hook và attribute/property — không sửa lõi.

```bash
npm install github:dazzxq/td-components#v0.28.0
```

(Cài từ GitHub cần nhánh + tag đã được push lên remote.)

```js
import '@dazzxq/td-components/td.css';
import '@dazzxq/td-components/button';
```

```html
<td-button variant="primary">Lưu</td-button>
```

**Tài liệu đầy đủ: [docs/README.md](docs/README.md)** — yêu cầu, cài đặt (Vite · PHP · WordPress), từng component,
tuỳ biến + hook, bảo mật, nâng cấp.

## Demo & phát triển

```bash
npm run demo             # demo.html qua Vite (mở file:// trực tiếp sẽ trống: trình duyệt chặn ES module)
npm run storybook        # Storybook tại http://localhost:6006
npm test                 # toàn bộ: node + trình duyệt + CSP + token + tương phản + bàn phím 3 engine
```

Tài liệu cho người phát triển kit: [docs/internal/](docs/internal/README.md). Thay đổi: [CHANGELOG.md](CHANGELOG.md).

## License

MIT — icon Lucide theo ISC, xem [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
