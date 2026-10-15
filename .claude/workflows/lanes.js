export const meta = {
  name: 'lanes',
  description: 'Làm song song 1-3 việc độc lập của một lô: mỗi việc một agent trong worktree riêng (code + test node lọc + cổng tĩnh + commit trên nhánh riêng), rồi một agent soát diff với brief',
  whenToUse: 'Owner nói "chạy workflow lanes cho ...". args = {base?: "main", lanes: [{name, goal, files?, tests, browser?, notes?, kind?, model?}]}. Không push, không CI, không bump version, không gộp main, không cổng trình duyệt nặng: phiên chính nghiệm thu, chạy cổng trình duyệt TUẦN TỰ, chạy Codex, đánh version, gộp.',
  phases: [
    { title: 'Làm', detail: 'một agent / việc, worktree riêng, nhánh = tên việc' },
    { title: 'Soát', detail: 'đối chiếu diff với brief, chạy lại test lọc' },
  ],
}

// args.lanes[i]:
//   name    chữ thường, số, gạch ngang = tên nhánh
//   goal    mục tiêu + lý do + quyết định đã chốt: brief đủ ý, agent không thấy hội thoại
//   files   phạm vi được sửa (hai việc trùng file → từ chối)
//   tests   đối số của `node --test`, vd "src/form/td-button.test.js" (bắt buộc với kind 'code')
//   browser file *.browser-test.js chạy MỘT lần trên Chromium (tuỳ chọn, cách nhau bằng dấu phẩy)
//   notes, model ('sonnet' mặc định | 'opus' cho việc khó theo CLAUDE.md global),
//   kind    'code' (mặc định) | 'plan' (chỉ viết plan ở docs/internal/plans/, phiên chính chạy /codex-plan-review)
//
// KHÔNG có cổng trình duyệt nặng trong lane (test:browser đủ 3 engine, test:csp, test:engines, test:responsive, test:touch,
// test:theme, contrast): hai bộ Playwright chạy cùng lúc trên máy này cho đỏ giả (load ~25, 09/10/2026). Phiên chính chạy
// chúng tuần tự sau khi gộp các nhánh, hoặc đẩy lên CI. File dùng chung của bản phát hành (version, CHANGELOG, roadmap,
// dist/) cũng là việc của phiên chính: nhiều lane cùng sửa = xung đột chắc chắn.
const lanes = args && args.lanes
if (!Array.isArray(lanes)) throw new Error("lanes: cần args.lanes là mảng")
const base = (args && args.base) || 'main'
if (typeof base !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(base) || base.includes('..')) throw new Error(`base không hợp lệ: ${base}`)
if (lanes.length < 1 || lanes.length > 3) throw new Error('lanes: cần 1-3 việc (2 agent / việc; ngân sách tuần)')
// Mọi giá trị dưới đây được chép vào LỆNH SHELL trong prompt của agent: chỉ nhận đúng ngữ pháp đường dẫn, không khoảng trắng lạ,
// không ký tự shell. `tests` = các đường dẫn / glob cách nhau một dấu cách; `browser` = các đường dẫn cách nhau dấu phẩy.
const PATH = '[A-Za-z0-9_@.][A-Za-z0-9_@./-]*'
const GLOB = '[A-Za-z0-9_@.*][A-Za-z0-9_@.*/-]*'
// Chuẩn hoá: bỏ đoạn rỗng và '.' ("./src//a/" = "src/a"). Rỗng sau chuẩn hoá = gốc repo (".", "./"): không nhận làm phạm vi.
const norm = (f) => f.split('/').filter((s) => s && s !== '.').join('/')
const okPath = (f) => typeof f === 'string' && new RegExp(`^${PATH}$`).test(f) && !f.startsWith('/') && !f.split('/').includes('..') && norm(f) !== ''
for (const l of lanes) {
  if (!l || typeof l !== 'object') throw new Error('mỗi việc phải là object')
  if (typeof l.name !== 'string' || !/^[a-z0-9][a-z0-9-]{1,30}$/.test(l.name)) throw new Error(`tên việc không hợp lệ: ${l.name}`)
  if (l.kind !== undefined && !['code', 'plan'].includes(l.kind)) throw new Error(`việc ${l.name}: kind chỉ code | plan`)
  if (typeof l.goal !== 'string' || !l.goal.trim() || (l.kind !== 'plan' && !l.tests)) throw new Error(`việc ${l.name} thiếu goal hoặc tests`)
  if (l.notes !== undefined && typeof l.notes !== 'string') throw new Error(`việc ${l.name}: notes phải là chuỗi`)
  if (l.tests !== undefined && (typeof l.tests !== 'string' || !new RegExp(`^${GLOB}( ${GLOB})*$`).test(l.tests) || l.tests.split(/[ /]/).includes('..'))) throw new Error(`việc ${l.name}: tests chỉ gồm đường dẫn / glob cách nhau một dấu cách`)
  if (l.browser !== undefined && (typeof l.browser !== 'string' || !l.browser.split(',').every(okPath))) throw new Error(`việc ${l.name}: browser chỉ gồm đường dẫn tương đối cách nhau dấu phẩy`)
  if (l.files !== undefined && (!Array.isArray(l.files) || !l.files.every(okPath))) throw new Error(`việc ${l.name}: files phải là mảng đường dẫn tương đối (không '..', không tuyệt đối)`)
  // Chạy song song mà không khai phạm vi thì phép kiểm trùng file bên dưới vô nghĩa.
  if (lanes.length > 1 && l.kind !== 'plan' && !(l.files || []).length) throw new Error(`việc ${l.name}: chạy nhiều việc code cùng lúc thì mỗi việc phải khai files`)
  if (l.model && !['sonnet', 'opus'].includes(l.model)) throw new Error(`việc ${l.name}: model chỉ sonnet | opus`)
}
const dup = lanes.map((l) => l.name).filter((n, i, a) => a.indexOf(n) !== i)
if (dup.length) throw new Error(`trùng tên việc (tên = tên nhánh): ${dup.join(', ')}`)
// Trùng phạm vi: bằng nhau HOẶC cha / con ("src/form" đè "src/form/td-button.js"; "src/form" KHÔNG đè "src/form-x").
const clash = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)
const overlap = lanes.flatMap((l, i) => (l.files || []).map(norm).filter((f) => lanes.some((o, j) => j > i && (o.files || []).map(norm).some((g) => clash(f, g)))))
if (overlap.length) throw new Error(`hai việc cùng sửa: ${overlap.join(', ')} - gộp lại thành một việc`)

const LANE = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    sha: { type: 'string', description: 'SHA commit cuối trên nhánh, rỗng nếu không commit' },
    files: { type: 'array', items: { type: 'string' } },
    checks: { type: 'array', items: { type: 'object', properties: { cmd: { type: 'string' }, result: { type: 'string', description: 'dòng kết quả THẬT (tóm tắt cuối + MÃ THOÁT)' } }, required: ['cmd', 'result'] } },
    gates: { type: 'array', items: { type: 'string', enum: ['codex-impl', 'codex-security', 'codex-plan', 'browser', 'csp', 'responsive', 'touch', 'theme', 'none'] }, description: 'cổng phiên chính còn phải chạy: codex-impl luôn với code; codex-security khi đụng input người dùng / escaping / URL / upload / CSP; browser khi có *.browser-test.js mới hoặc đổi hành vi DOM; csp khi đổi CSS của phần tử có trong test/csp/matrix.json; responsive / touch / theme khi đổi bố cục, control nhấn được, token màu' },
    shared: { type: 'array', items: { type: 'string' }, description: 'file dùng chung kiểu "nối thêm" đã sửa (td.css sinh lại, test/tokens/golden.json, test/fixtures/*, src/utils/press.js PRESS_TARGETS, index.js, package.json exports, docs/customization/hooks.md…) để phiên chính gộp cẩn thận' },
    deviations: { type: 'array', items: { type: 'string' } },
    blocked: { type: 'string', description: 'rỗng nếu xong; nếu dừng vì mơ hồ / mâu thuẫn thì ghi lý do' },
  },
  required: ['branch', 'sha', 'files', 'checks', 'gates', 'shared', 'deviations', 'blocked'],
}
const VERDICT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    problems: { type: 'array', items: { type: 'string', description: 'file:dòng + vì sao' } },
    rerun: { type: 'string', description: 'kết quả thật của lần chạy lại test lọc + mã thoát' },
  },
  required: ['ok', 'problems', 'rerun'],
}

const who = (l) => `Co-Authored-By: Claude ${l.model === 'opus' ? 'Opus' : 'Sonnet'} 5.5 <noreply@anthropic.com>`
const HANDS_OFF = 'package.json `version`, package-lock.json, CHANGELOG.md, docs/internal/roadmap.md, docs/upgrading/breaking-changes.md, dòng "Phiên bản hiện tại" và các chỗ ghim version trong docs, dist/, module-graph.json, test/csp/baseline/ (không `capture:baseline`)'

const setup = (l) => `Chuẩn bị worktree (bắt buộc):
- Bạn đang ở một git worktree riêng.
- Nhánh đi từ \`${base}\` (KHÔNG từ HEAD của worktree): \`BASE_SHA=$(git rev-parse --verify '${base}^{commit}')\` phải ra SHA, rồi tạo nhánh từ ĐÚNG SHA đó: \`git switch -c ${l.name} "$BASE_SHA"\`. Nhánh \`${l.name}\` đã tồn tại hoặc base không có: DỪNG, ghi \`blocked\`, không xoá / ghi đè nhánh.
- Kiểm nhánh gốc TRƯỚC khi tin bất cứ phép "không tìm thấy": \`git log --oneline -3\` phải khớp ${base}.
- \`npm ci\` để worktree có node_modules THẬT của riêng nó. KHÔNG symlink, KHÔNG chép từ repo chính. Trình duyệt Playwright dùng cache chung của máy, không cài lại.`

const planWork = (l) => `Bạn viết PLAN (không code) cho một việc của lô "${l.name}", trong worktree riêng. Không cần npm.
- Nhánh đi từ \`${base}\` (KHÔNG từ HEAD của worktree): \`BASE_SHA=$(git rev-parse --verify '${base}^{commit}')\` phải ra SHA, rồi tạo nhánh từ ĐÚNG SHA đó: \`git switch -c ${l.name} "$BASE_SHA"\`. Nhánh \`${l.name}\` đã tồn tại hoặc base không có: DỪNG, ghi \`blocked\`, không xoá / ghi đè nhánh.
- Bắt đầu từ docs/internal/README.md, đọc luật liên quan (conventions.md, design/liquid-glass.md, design/touch.md, security-model.md) + code để plan khớp code THẬT (đường dẫn, class, attribute / property / event / hook, token \`--td-*\` hiện có). Mẫu định dạng: plan mới nhất trong docs/internal/plans/ (\`ls -t\`). Con số trong docs (số test, số state) là ảnh chụp: đo lại, đừng chép.
- Ghi plan vào docs/internal/plans/${l.name}.md (phiên chính đổi tên thành vX.Y.Z-… khi đánh version). Plan có: tóm tắt, phạm vi / không làm, thay đổi theo file, API công khai (attribute / property / event / hook / token) và tương thích ngược, bảo mật (escaping theo ngữ cảnh, CSP), trợ năng + cảm ứng, test (node / browser / cổng nào đổi baseline), docs sẽ sửa, rủi ro, ước lượng.
- Lựa chọn UX người dùng nhìn thấy và mọi câu hỏi cần owner quyết: ghi mục "Câu hỏi mở" kèm mặc định đề xuất (không chôn vào "không làm"), KHÔNG dừng vì nó.

Mục tiêu và ngữ cảnh:
${l.goal}
${l.notes ? `Ghi chú: ${l.notes}\n` : ''}Commit trên nhánh (message tiếng Anh như git log: \`docs(plan): …\`, kết bằng dòng \`${who(l)}\`). KHÔNG push, KHÔNG code ngoài docs/internal/plans/. Mâu thuẫn lớn với docs / code: ghi vào \`blocked\`.`

const work = (l) => `Bạn làm MỘT việc của lô "${l.name}" trong worktree riêng của td-components (Web Components không Shadow DOM, CSP strict, vanilla JS, ship source).

${setup(l)}

Mục tiêu và ngữ cảnh (brief của phiên chính, đã chốt, không tự đổi hướng):
${l.goal}

Phạm vi được sửa: ${(l.files || []).length ? l.files.join(', ') : 'chỉ những file cần cho mục tiêu trên; không refactor ngoài phạm vi, không thêm dependency, không đổi API công khai ngoài brief'}.
${l.notes ? `Ghi chú: ${l.notes}\n` : ''}
KHÔNG đụng (việc của phiên chính khi phát hành, nhiều lane cùng sửa sẽ xung đột): ${HANDS_OFF}.

Cách xong:
1. Code + test theo docs/internal/conventions.md (đọc một file kề bên làm mẫu). UI mới theo design/liquid-glass.md và design/touch.md. Trang docs/components/<tên>.md liên quan + story cập nhật CÙNG commit; site xin gì thì làm thành slot / hook / token tổng quát, không viết cứng cho một site.
2. Đổi CSS trong src/styles/: chạy \`npm run build:css\` và commit \`td.css\` sinh lại (ghi vào \`shared\`). Token mới: thêm vào test/tokens/golden.json (ghi vào \`shared\`). Không thêm \`max-*\` / \`min-*\` mới lên phần tử có trong test/csp/matrix.json nếu diễn đạt được bằng chính thuộc tính kích thước (\`inline-size: min(…)\`): giá trị computed đổi là đỏ baseline CSP.
3. Chạy và DÁN KẾT QUẢ THẬT kèm MÃ THOÁT (đọc TOÀN BỘ đầu ra, KHÔNG \`| tail\` / \`| grep\`: exit của pipe là exit của lệnh cuối):
   - \`node --test --test-force-exit ${l.tests}\`
   - \`npm run check:css && npm run check:icons && npm run check:stories && npm run test:node && npm run test:golden\` (cổng tĩnh; KHÔNG chạy \`check:dist\`, dist do phiên chính sinh lại).
${l.browser ? `   - Trình duyệt, MỘT lần, chỉ Chromium: tạo file tạm \`.wtr-lane.mjs\` (KHÔNG commit) với nội dung \`import base from './web-test-runner.config.js'; export default { ...base, files: (process.env.WTR_FILES || '').split(','), groups: [] };\` rồi \`WTR_FILES=${l.browser} npx web-test-runner --config .wtr-lane.mjs\`.\n` : ''}   - CẤM trong lane: \`npm test\`, \`test:browser\`, \`test:csp*\`, \`test:engines\`, \`test:responsive\`, \`test:touch\`, \`test:theme\`, \`test:contrast\`, \`test:page-contrast\`, \`test:tokens\`, \`test:visual\` (lane khác đang chạy song song; cổng trình duyệt chỉ chạy tuần tự ở phiên chính). Cần thì ghi vào \`gates\`.
4. Commit trên nhánh \`${l.name}\`: message tiếng Anh như git log (\`feat(<scope>): …\` / \`fix(<scope>): …\`, KHÔNG ghi số version), kết bằng dòng \`${who(l)}\`. KHÔNG push, KHÔNG chạy CI (gh workflow), KHÔNG gộp main, KHÔNG tag, KHÔNG chạy Codex (phiên chính làm).
5. Trường \`gates\`: cổng phiên chính còn phải chạy. Trường \`shared\`: file dùng chung kiểu "nối thêm" bạn đã sửa.
6. Gặp chỗ mơ hồ, mâu thuẫn với brief, hoặc lựa chọn UX người dùng nhìn thấy mà brief chưa chốt: DỪNG, ghi vào \`blocked\`, không đoán.
Không bao giờ: rm -rf, git clean -x, git reset --hard, git worktree remove --force, sửa file ngoài worktree của bạn.`

const planReview = (l, r) => `Soát plan vừa viết trên nhánh \`${l.name}\` (SHA ${r.sha}). Chỉ đọc, KHÔNG sửa.
Brief: ${l.goal}
1. \`git -C ~/Documents/Code/components diff ${base}...${l.name}\`.
2. Kiểm: mọi đường dẫn / class / attribute / event / hook / token plan nhắc tới có thật trong code (grep); plan không mâu thuẫn conventions.md, design/liquid-glass.md, design/touch.md, security-model.md và ADR liên quan; có đủ tương thích ngược + bảo mật + test + docs sẽ sửa; lựa chọn UX nằm ở "Câu hỏi mở" chứ không chôn trong "không làm"; phạm vi vừa một bản phát hành nhỏ.
Ghi \`rerun\` = lệnh bạn kiểm + kết quả thật. ok = true chỉ khi không cần sửa gì.`

const review = (l, r) => `Soát một việc vừa làm xong của lô, trên nhánh \`${l.name}\` (SHA ${r.sha}). Chỉ đọc + chạy test node, KHÔNG sửa, KHÔNG commit, KHÔNG chạy trình duyệt.

Brief gốc:
${l.goal}
Phạm vi được sửa: ${(l.files || []).join(', ') || '(không giới hạn cứng)'}.
Agent làm báo: file ${r.files.join(', ')}; file dùng chung: ${r.shared.join(', ') || 'không'}; lệch brief: ${r.deviations.join('; ') || 'không'}.

Việc:
1. \`git -C ~/Documents/Code/components diff ${base}...${l.name}\` - đọc diff THẬT, không tin bản tóm tắt.
2. Đối chiếu brief: làm thừa, làm thiếu, tự đổi hướng, sửa ngoài phạm vi, thêm dependency, đổi API công khai ngoài brief, thiếu test, thiếu trang docs/components / story, viết cứng cho một site, file không được commit (.wtr-lane.mjs, node_modules, storybook-static, test/responsive/__out__) hoặc file của phiên chính (${HANDS_OFF}).
3. Luật của kit trong diff: không \`style="…"\` / chèn \`<style>\` / \`innerHTML\` với dữ liệu chưa \`escapeHtml\`; \`:hover\` trong cổng \`(hover: hover) and (pointer: fine)\` và control có luật nhấn; không Shadow DOM; nhãn mặc định tiếng Việt; \`td.css\` khớp nguồn (đã sinh lại nếu đổi src/styles).
4. Test có THỂ ĐỎ không: với mỗi test mới, nhẩm hoặc thử hoàn nguyên dòng mã chính trong một bản sao tạm rồi xem test có đỏ. Test xanh khi mã sai là test vô dụng.
5. Chạy lại trong worktree của nhánh (\`git worktree list\` để tìm): \`node --test --test-force-exit ${l.tests}\` và \`npm run check:css\`. Đọc TOÀN BỘ đầu ra + mã thoát, KHÔNG \`| tail\`. Dán kết quả thật vào \`rerun\`.
ok = true chỉ khi không có vấn đề nào cần sửa.`

const results = await pipeline(
  lanes,
  (l) => agent(l.kind === 'plan' ? planWork(l) : work(l), { label: `${l.kind === 'plan' ? 'plan' : 'làm'}:${l.name}`, phase: 'Làm', schema: LANE, isolation: 'worktree', model: l.model || 'sonnet' }),
  (r, l) => {
    if (!r || r.blocked || !r.sha) return { lane: l.name, work: r, review: null }
    // Kết quả của agent làm cũng là dữ liệu chưa tin: nhánh phải đúng tên việc, SHA phải là hex, trước khi chép vào lệnh của agent soát.
    if (r.branch !== l.name || !/^[0-9a-f]{7,40}$/.test(r.sha)) return { lane: l.name, work: { ...r, blocked: `agent báo nhánh / SHA lạ (${r.branch} @ ${r.sha}); không soát` }, review: null }
    return agent(l.kind === 'plan' ? planReview(l, r) : review(l, r), { label: `soát:${l.name}`, phase: 'Soát', schema: VERDICT, model: l.model || 'sonnet' })
      .then((v) => ({ lane: l.name, work: r, review: v }))
  },
)

const done = results.filter(Boolean)
for (const x of done) {
  const state = !x.work ? 'agent chết' : x.work.blocked ? `DỪNG: ${x.work.blocked}` : x.review && x.review.ok ? 'xong, soát ok' : 'soát ra vấn đề'
  log(`${x.lane}: ${state}`)
}
if (done.length < lanes.length) log(`mất ${lanes.length - done.length} việc (agent lỗi): ${lanes.filter((l) => !done.some((x) => x.lane === l.name)).map((l) => l.name).join(', ')}`)
return done
