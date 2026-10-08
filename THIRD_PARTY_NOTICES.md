# Third-party notices

## Lucide (icon geometry in `src/icons/icons.json` → `src/icons/registry.js`)

A curated subset of path data from Lucide (https://lucide.dev), mapped to td-owned names
(the upstream name is recorded per icon in `icons.json` → `lucide`). Icons added in 0.17.0 (`trash` ← trash-2,
`pencil`, `copy`, `log-out`, `menu`, `rotate-cw`, `zoom-out`) were checked against lucide-static 1.48.0; `<line>`
elements are stored as the equivalent `path` data (as for `zoom-in`).
Icons added in 0.35.0 (`crop`, `crosshair`, `rotate-ccw`) follow the same rule.
Icons added in 0.36.0 for `<td-action-button>` (`send`, `arrow-down-to-line`, `rewind`, `undo-2`, `history`, `layers`,
`key-round`, `arrow-up`, `arrow-down`, `hand`, `reply`, `user-x`) follow the same rule (`key-round`'s filled dot is a
stroked `r=".5"` circle — the registry has no per-node `fill`).
Icons added in 0.56.0 (`archive`, `restore` ← archive-restore, `category` ← folder-tree, `brand` ← tag, `product` ←
package, `ban`) were checked against lucide-static 1.52.0 and follow the same rules (`tag`'s filled dot is a stroked
`r=".5"` circle).
The icon added in 0.59.0 (`price` ← banknote) was checked against lucide-static 1.53.0 and follows the same rules.

ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee
is hereby granted, provided that the above copyright notice and this permission notice appear in all
copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE
INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE
FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING
OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

### Feather (portions of Lucide)

The MIT License (MIT)

Copyright (c) 2013-2022 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR
THE USE OR OTHER DEALINGS IN THE SOFTWARE.
