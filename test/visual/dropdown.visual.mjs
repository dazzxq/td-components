#!/usr/bin/env node
/**
 * Visual gate — td-dropdown rich rows (v0.84.0): the menu OPEN with groups, rich rows (icon tiles in several tones,
 * description, status, meta), a selected row, a disabled row with meta "Đã thêm" and a create row, in three shots:
 *   dropdown-rich-light    1280 wide, fine pointer, light
 *   dropdown-rich-dark     1280 wide, fine pointer, data-td-theme="dark" (+ OS colour-scheme dark)
 *   dropdown-rich-coarse   390×844, hasTouch + isMobile (pointer: coarse), light
 * Same contract as media-picker.visual.mjs (read its header): Chromium only, Linux + the pinned build, baselines in
 * test/visual/baseline/linux-chromium/, SKIP off the reference platform (exit 0; 1 with TD_VISUAL_STRICT=1 / --update),
 * TD_VISUAL_FORCE=1, TD_VISUAL_OUT=<dir>. Plumbing lives in ./lib.mjs. Run both gates with `npm run test:visual`.
 */
import { ORIGIN, FREEZE_CSS, startGate, newPage, settle, check, failures, finish } from './lib.mjs';

const { browser, version } = await startGate('test/visual/dropdown.visual.mjs');

const PAGE = (theme) => `<!doctype html><html lang="vi"${theme ? ` data-td-theme="${theme}"` : ''}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${ORIGIN}/td.css">
<style>${FREEZE_CSS} body { background: var(--td-color-bg); color: var(--td-color-text, inherit); font-family: system-ui, sans-serif; }
main { padding: 16px; max-width: 420px; }</style>
<script type="module">
  await import('${ORIGIN}/src/form/td-dropdown.js');
  await customElements.whenDefined('td-dropdown');
  const d = document.getElementById('dd');
  d.groups = [{ key: 'kho', label: 'Kho hàng' }, { key: 'shop', label: 'Cửa hàng' }];
  d.options = [
    { value: 'hn', label: 'Kho Hà Nội', icon: 'archive', iconTone: 'accent', description: 'Cầu Giấy', status: { tone: 'success', text: 'Đang mở' }, meta: '128 SP', group: 'kho' },
    { value: 'hcm', label: 'Kho Sài Gòn', icon: 'inbox', iconTone: 'warning', description: 'Quận 7', status: { tone: 'warning', text: 'Sắp đầy' }, meta: '96 SP', group: 'kho' },
    { value: 'dn', label: 'Kho Đà Nẵng', icon: 'lock', iconTone: 'danger', description: 'Tạm ngưng nhập', status: { tone: 'danger', text: 'Đóng' }, meta: 'Đã thêm', disabled: true, group: 'kho' },
    { value: 'lang', label: 'Cửa hàng Láng', icon: 'info', iconTone: 'info', description: '1 Láng Hạ', meta: '24 SP', group: 'shop' },
    { value: 'online', label: 'Bán online', icon: 'star', iconTone: 'success', description: 'Website và sàn', group: 'shop' },
    { value: 'khac', label: 'Khác' },
  ];
  d.value = 'hn';
  d.open();
  window.__ready = true;
</script>
</head><body><main><td-dropdown id="dd" label="Nơi xuất" create-label="Thêm kho mới" max-height="10"></td-dropdown></main></body></html>`;

const SHOTS = [
  { name: 'dropdown-rich-light', viewport: { width: 1280, height: 900 }, theme: null, ctx: { colorScheme: 'light' } },
  { name: 'dropdown-rich-dark', viewport: { width: 1280, height: 900 }, theme: 'dark', ctx: { colorScheme: 'dark' } },
  { name: 'dropdown-rich-coarse', viewport: { width: 390, height: 844 }, theme: null, ctx: { colorScheme: 'light', hasTouch: true, isMobile: true } },
];
const PAD = 16;

try {
  for (const { name, viewport, theme, ctx } of SHOTS) {
    const { page, context } = await newPage(browser, viewport, PAGE(theme), ctx);
    try {
      await page.locator('body > .td-dropdown__menu').waitFor({ state: 'visible' });
      await page.locator('.td-dropdown__menu .td-dropdown__option--create').waitFor({ state: 'visible' });
      if (name.endsWith('coarse')) {
        const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
        if (!coarse) throw new Error('(pointer: coarse) does not match — the shot would not show the coarse layout');
      }
      await settle(page);
      // trigger + body-portal menu: union of both rects, padded, clamped to the viewport
      const clip = await page.evaluate((pad) => {
        const rs = [document.getElementById('dd'), document.querySelector('.td-dropdown__menu')].map((e) => e.getBoundingClientRect());
        const x = Math.max(0, Math.min(...rs.map((r) => r.left)) - pad);
        const y = Math.max(0, Math.min(...rs.map((r) => r.top)) - pad);
        const right = Math.min(innerWidth, Math.max(...rs.map((r) => r.right)) + pad);
        const bottom = Math.min(innerHeight, Math.max(...rs.map((r) => r.bottom)) + pad);
        return { x: Math.floor(x), y: Math.floor(y), width: Math.ceil(right - x), height: Math.ceil(bottom - y) };
      }, PAD);
      await check(name, await page.screenshot({ clip, animations: 'disabled', caret: 'hide' }));
    } catch (e) {
      failures.push(`${name}: could not render — ${e.message.split('\n')[0]}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

finish(version);
