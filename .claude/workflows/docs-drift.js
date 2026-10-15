export const meta = {
  name: 'docs-drift',
  description: 'Soát docs lệch code theo vùng (attribute / property / method / event / hook / token --td-* / class BEM / export / helper PHP / lệnh npm) + lệch hub-spoke (một sự thật một chỗ): mỗi vùng một agent tìm + một agent phản biện; fix: true thì một agent sửa docs (không commit)',
  whenToUse: 'Trước một bản phát hành hoặc sau khi gộp nhiều nhánh. args = {targets: ["tabs", "media-picker", "theming"]} (tên trang docs/components/<tên>.md, hoặc vùng dựng sẵn: theming | hooks | php | install | concepts | internal | hub; hoặc object {name, docs: [...], code: [...]}; tối đa 3) hoặc {since: "<ref>"} để tự chọn vùng có code đổi; thêm fix: true để sửa luôn. Chỉ đọc, không chạy trình duyệt.',
  phases: [
    { title: 'Chọn', detail: 'vùng có code đổi (khi dùng since)' },
    { title: 'Tìm', detail: 'một agent / vùng' },
    { title: 'Phản biện', detail: 'loại phát hiện sai' },
    { title: 'Sửa', detail: 'một agent, chỉ docs, không commit (fix: true)' },
  ],
}

const CAP = 3
const REPO = '~/Documents/Code/components'
const PRESETS = {
  theming: { docs: ['docs/customization/theming.md', 'docs/customization/styling.md'], code: ['src/styles/tokens.css', 'src/styles/theme-dark.css', 'src/styles/glass.css', 'src/styles/layers.css', 'src/theme/', 'bin/td-theme.mjs', 'test/tokens/golden.json'] },
  hooks: { docs: ['docs/customization/hooks.md', 'docs/customization/extending.md'], code: ['src/ (grep tên hook / option được nhắc tới)', 'src/base/', 'src/icons/'] },
  php: { docs: ['docs/guides/php-adapter.md', 'docs/guides/wordpress-php.md', 'php/README.md'], code: ['php/td.php', 'test/php/'] },
  install: { docs: ['docs/getting-started/', 'docs/upgrading/README.md', 'README.md'], code: ['package.json (exports, files, engines, scripts)', 'index.js', 'dist/', 'module-graph.json'] },
  concepts: { docs: ['docs/concepts/', 'docs/guides/forms.md', 'docs/guides/accessibility.md', 'docs/guides/touch.md', 'docs/guides/security.md', 'docs/guides/csp.md'], code: ['src/base/', 'src/utils/', 'src/styles/'] },
  internal: { docs: ['docs/internal/architecture.md', 'docs/internal/conventions.md', 'docs/internal/security-model.md', 'docs/internal/design/', 'CLAUDE.md'], code: ['src/base/', 'src/utils/', 'scripts/', 'package.json (scripts)', '.github/workflows/', 'web-test-runner.config.js', 'test/'] },
  hub: { docs: ['docs/README.md', 'docs/components/README.md', 'docs/internal/README.md', 'docs/internal/decisions/README.md'], code: ['docs/ (mọi file .md: hub phải liệt kê đủ nan hoa)', 'package.json (exports = danh sách component thật)', 'php/td.php (danh sách helper)'] },
}
const resolve = (t) => {
  const strs = (a) => Array.isArray(a) && a.length > 0 && a.every((s) => typeof s === 'string' && s.trim())
  if (t && typeof t === 'object') return typeof t.name === 'string' && t.name.trim() && strs(t.docs) && strs(t.code) ? t : null
  if (typeof t !== 'string') return null
  if (PRESETS[t]) return { name: t, ...PRESETS[t] }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(t || '')) return null
  return { name: t, docs: [`docs/components/${t}.md`], code: [`src/**/td-${t}*.js (cả *.stories.js; tìm bằng \`ls src/*/ | grep ${t}\`, component là API tĩnh hoặc helper thì grep tên trong index.js / package.json exports)`, `src/styles/components/${t}.css`, 'các module src/utils/ mà component import'] }
}

let raw = (args && (args.targets || args.areas)) || []
if (!Array.isArray(raw)) throw new Error('docs-drift: targets phải là mảng')
const since = args && args.since
// `since` được chép vào lệnh git trong prompt: chỉ nhận tên ref đơn (tag / nhánh / SHA), không toán tử revision, không ký tự shell.
if (since !== undefined && (typeof since !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(since) || since.includes('..'))) throw new Error(`docs-drift: since không hợp lệ: ${since}`)
const SINCE = since ? `Trước hết \`SINCE_SHA=$(git rev-parse --verify '${since}^{commit}')\` phải ra SHA (không ra: DỪNG, báo lại); mọi lệnh dưới dùng "$SINCE_SHA".` : ''
let deleted = []

if (!raw.length && since) {
  phase('Chọn')
  const picked = await agent(
    `Trong ${REPO} ${SINCE} Rồi chạy \`git diff --name-status "$SINCE_SHA"..HEAD -- src php bin scripts package.json index.js\`. Đổi đường dẫn thành vùng docs (tính CẢ file đã xoá / đổi tên, trạng thái D / R: code biến mất là lúc docs dễ cũ nhất):
- src/<nhóm>/td-<tên>*.js hoặc src/styles/components/<tên>.css → <tên>, CHỈ giữ nếu có file docs/components/<tên>.md (kiểm bằng ls; file kiểu td-v067-… / td-batch… là test theo bản phát hành: mở ra xem nó test component nào rồi tính cho component đó).
- src/styles/tokens.css, theme-dark.css, glass.css, src/theme/, bin/ → theming
- php/ → php
- package.json, index.js → install
- src/base/, src/utils/, scripts/ → concepts
Trả về \`targets\` = tên vùng theo số file đổi giảm dần, không lặp; \`deleted\` = mọi đường dẫn code đã xoá hoặc là tên CŨ của file đổi tên (rỗng nếu không có).`,
    { label: 'chọn vùng', phase: 'Chọn', model: 'haiku', effort: 'low', schema: { type: 'object', properties: { targets: { type: 'array', items: { type: 'string' } }, deleted: { type: 'array', items: { type: 'string' } } }, required: ['targets', 'deleted'] } },
  )
  raw = (picked && picked.targets) || []
  deleted = (picked && picked.deleted) || []
}
if (!raw.length) throw new Error('docs-drift: cần args.targets hoặc args.since')
const bad = raw.filter((t) => !resolve(t))
if (bad.length) log(`bỏ vùng không hợp lệ: ${bad.map((t) => (typeof t === 'string' ? t : JSON.stringify(t))).join(', ')}`)
let areas = raw.map(resolve).filter(Boolean)
if (!areas.length) throw new Error('docs-drift: không còn vùng hợp lệ nào')
if (areas.length > CAP) log(`chỉ soát ${CAP} vùng đầu; bỏ: ${areas.slice(CAP).map((a) => a.name).join(', ')}`)
areas = areas.slice(0, CAP)

const FINDINGS = {
  type: 'object',
  properties: { findings: { type: 'array', items: { type: 'object', properties: {
    doc: { type: 'string', description: 'file:dòng trong docs (chỗ cần sửa)' },
    claim: { type: 'string', description: 'docs nói gì' },
    code: { type: 'string', description: 'file:dòng trong code + code thật làm gì; với "lặp": file:dòng của chỗ GỐC nên giữ' },
    severity: { type: 'string', enum: ['sai', 'thiếu', 'cũ', 'lặp', 'link'] },
  }, required: ['doc', 'claim', 'code', 'severity'] } } },
  required: ['findings'],
}
const CHECKED = {
  type: 'object',
  properties: { kept: { type: 'array', items: { type: 'object', properties: {
    doc: { type: 'string' }, claim: { type: 'string' }, code: { type: 'string' }, severity: { type: 'string' }, why: { type: 'string' },
  }, required: ['doc', 'claim', 'code', 'severity', 'why'] } }, dropped: { type: 'number' } },
  required: ['kept', 'dropped'],
}

const HUBSPOKE = `Luật hub-spoke của repo: mỗi sự thật (attribute, mặc định, con số, luật, danh sách, chữ ký hook) chỉ ghi ĐẦY ĐỦ ở MỘT chỗ - trang component / trang chuyên đề; chỗ khác chỉ tóm một câu + dẫn link. Hub = docs/README.md, hub con = docs/components/README.md và docs/internal/README.md: là mục lục (link + mô tả ngắn), không chép lại chi tiết. docs/customization/hooks.md là DANH MỤC hook: một dòng / hook + link về trang component là đúng luật; chép lại cả chữ ký + hành vi chi tiết thì là lặp. Mỗi nan hoa phải được hub liệt kê và có dòng breadcrumb đầu trang (\`[Tài liệu](../README.md) › …\`) quay về hub.`
const HISTORY = 'CHANGELOG.md, docs/upgrading/breaking-changes.md, docs/internal/plans/, docs/internal/decisions/ (ADR), docs/internal/history/, docs/internal/research/, docs/internal/roadmap.md là NHẬT KÝ theo thời điểm, không phải as-built: không soát, không sửa'

const find = (a) => `Soát docs của vùng "${a.name}" trong ${REPO} so với code hiện tại. Chỉ đọc, không sửa gì, không chạy trình duyệt / Playwright / storybook.
Docs: ${a.docs.join(', ')}. Code: ${a.code.join(', ')}.
${since ? `Ưu tiên phần code đổi từ ${since}. ${SINCE} \`git diff --stat "$SINCE_SHA"..HEAD\`.\n` : ''}1. Lệch code (severity sai / thiếu / cũ): kiểm những khẳng định KIỂM ĐƯỢC BẰNG ĐỌC CODE:
   - attribute (\`observedAttributes\`, \`getAttribute\` / \`hasAttribute\`), giá trị hợp lệ và MẶC ĐỊNH; property / method công khai và chữ ký; method tĩnh (\`TdX.show(…)\`) và option của nó;
   - event (\`this.emit('…')\`, tên + \`detail\` + có huỷ được không); hook / callback (tên, tham số, giá trị trả về, lúc gọi);
   - token \`--td-*\` (còn tồn tại không, giá trị mặc định trong src/styles), class BEM / \`data-*\` / \`aria-*\` trong mục cấu trúc DOM, slot;
   - subpath import (\`package.json\` exports), tên export trong index.js, helper trong src/utils, hàm + tham số của php/td.php, tên lệnh npm, đường dẫn file được nhắc tới (còn tồn tại không);
   - con số (breakpoint, vùng chạm, timeout, trần, số phần tử), nhãn mặc định tiếng Việt, phím tắt;
   - API công khai có trong code mà trang docs chưa nhắc (severity "thiếu"; bỏ qua thứ đánh dấu private / \`_gạch-dưới\` / \`@internal\`).
2. Lệch hub-spoke. ${HUBSPOKE}
   - severity "lặp": cùng một sự thật ghi đầy đủ ở từ hai chỗ trở lên (kể cả trong cùng file). \`doc\` = chỗ nên thay bằng link, \`code\` = chỗ gốc nên giữ. Hai chỗ đang lệch nhau thì ghi rõ.
   - severity "link": nan hoa không được hub liệt kê, thiếu breadcrumb về hub, link / anchor trỏ sai chỗ (anchor GitHub của heading tiếng Việt: kiểm heading có thật).
Bỏ qua: văn phong, phần ghi rõ "chưa làm" / "dự kiến", số version đang ghim (phiên chính đổi khi phát hành), ảnh chụp số test / số state; ${HISTORY}.
${deleted.length ? `File code đã XOÁ / đổi tên từ ${since} (docs còn nhắc tới chúng hoặc tới API chỉ chúng có = "cũ"): ${deleted.join(', ')}.\n` : ''}Mỗi phát hiện phải có bằng chứng file:dòng ở CẢ hai phía; riêng thứ đã bị xoá khỏi code thì phía code = bản ghi git (\`git log --diff-filter=DR --oneline -- <đường dẫn>\` hoặc grep không còn kết quả, ghi lệnh + kết quả). Không chắc thì không ghi. Tối đa 25 phát hiện, ưu tiên "sai".`

const refute = (a, f) => `Phản biện các phát hiện về docs vùng "${a.name}" trong ${REPO}. Chỉ đọc.
Với từng phát hiện, mở đúng file:dòng ở cả hai phía (thứ đã bị xoá khỏi code: tự chạy lại lệnh git / grep trong bằng chứng, không đòi file:dòng phía code). Loại nếu: docs thật ra đúng (đọc sai, hành vi đến từ base class src/base / helper src/utils / một component lồng bên trong, mặc định được đặt ở CSS chứ không ở JS hoặc ngược lại, attribute được đọc qua helper chung); docs ghi rõ là kế hoạch / chưa làm / lịch sử; API "thiếu" thật ra là nội bộ; hoặc "lặp" mà chỗ bị báo chỉ là một câu tóm có dẫn link / một dòng danh mục trong hooks.md (được phép). Giữ lại kèm \`why\` nếu đúng là lệch. Nghi ngờ thì loại.
${HUBSPOKE}
Phát hiện: ${JSON.stringify(f.findings)}`

const results = await pipeline(
  areas,
  (a) => agent(find(a), { label: `tìm:${a.name}`, phase: 'Tìm', schema: FINDINGS, model: 'sonnet' }),
  (f, a) => (!f || !f.findings.length ? { kept: [], dropped: 0 } : agent(refute(a, f), { label: `phản biện:${a.name}`, phase: 'Phản biện', schema: CHECKED, model: 'sonnet' })),
  (c, a) => ({ area: a.name, kept: (c && c.kept) || [], dropped: (c && c.dropped) || 0 }),
)
const out = results.filter(Boolean)
if (out.length < areas.length) log(`mất ${areas.length - out.length} vùng (agent lỗi): ${areas.filter((a) => !out.some((r) => r.area === a.name)).map((a) => a.name).join(', ')}`)
log(out.map((r) => `${r.area}: ${r.kept.length} lệch thật, ${r.dropped} bị loại`).join(' · '))

// Sửa: một agent cho TẤT CẢ phát hiện (barrier có chủ ý: các vùng hay cùng đụng hub / hooks.md / theming.md, sửa song song sẽ đè nhau).
const all = out.flatMap((r) => r.kept.map((k) => ({ ...k, area: r.area })))
if (!(args && args.fix) || !all.length) return out
phase('Sửa')
const fixed = await agent(`Sửa docs trong ${REPO} (working tree đang checkout) theo các phát hiện đã phản biện dưới đây. CHỈ sửa file .md trong docs/ (phát hiện nằm ở README.md gốc, php/README.md, CLAUDE.md: KHÔNG sửa, liệt kê lại cho phiên chính); không sửa code / test / story, không chạy trình duyệt, KHÔNG commit, không push. ${HISTORY}.
${HUBSPOKE}
Cách sửa:
- "sai" / "cũ" / "thiếu": sửa ở chỗ GỐC của sự thật đó (trang component / trang chuyên đề), theo khuôn sẵn có của trang (ví dụ nhanh → cách dùng → attribute → property & method → event → hook → token CSS → cấu trúc DOM → …). Nếu chỗ bị báo chỉ là bản chép, thay bằng câu tóm + link về chỗ gốc thay vì sửa song song hai nơi.
- "lặp": giữ chỗ gốc (\`code\`), chỗ \`doc\` thay bằng câu tóm + link (kèm anchor heading nếu cần, kiểm heading có thật).
- "link": thêm dòng vào bảng / danh sách của hub (docs/README.md VÀ docs/components/README.md với component), thêm breadcrumb, sửa link.
- Không bịa: chỗ nào cần đọc code để viết đúng thì đọc code. Giữ tiếng Việt + văn phong của trang; không đổi số version đang ghim.
- Docs nói đúng ý định còn CODE mới sai (lỗi thật của kit): KHÔNG sửa docs cho khớp lỗi, ghi lại để phiên chính xử lý.
Xong chạy \`git diff --stat\`, dán kết quả thật. Phát hiện nào không sửa được, thấy sai, hoặc là lỗi code thì ghi lý do.
Phát hiện: ${JSON.stringify(all)}`, { label: 'sửa docs', phase: 'Sửa', model: 'sonnet' })
return { findings: out, fix: fixed }
