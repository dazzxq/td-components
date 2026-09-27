/**
 * TdMenu Tab / Shift+Tab (plan v0.12.0 D4, review ISSUE-6) in Chromium, Firefox and WebKit.
 *
 * The menu's layer onTab closes the menu, re-focuses the trigger and returns 'pass' WITHOUT preventDefault: the
 * browser's native Tab (or a lower TdModal focus trap) must then continue from the trigger. Whether a native Tab
 * moves on from an element focused inside the same keydown is engine behaviour, hence this script.
 *
 * Cases per engine (real keyboard via Playwright):
 *   standalone  Tab → the focusable after the trigger; Shift+Tab → the one before; menu closed.
 *   modal       trigger inside a TdModal: Tab / Shift+Tab → the neighbours inside the dialog;
 *               trigger = last focusable of the dialog → Tab wraps INSIDE the dialog (trap), never to the page.
 *   activation  Space / Enter activate exactly once (checkbox item toggles once and stays open; an item selects
 *               once, closes, focus on the trigger) — no second keyup/click activation in any engine.
 *
 * Run: npm run test:engines   (launch/cache logic: test/tokens/tokens.spec.mjs)
 */
import { chromium, firefox, webkit } from 'playwright-core';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'http://engines.local';
const MIME = { '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.css': 'text/css' };

const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<link rel="stylesheet" href="${ORIGIN}/td.css">
<script type="module">
  import { TdMenu } from '${ORIGIN}/src/feedback/td-menu.js';
  import { TdModal } from '${ORIGIN}/src/feedback/td-modal.js';
  window.TdMenu = TdMenu;
  window.TdModal = TdModal;
  window.__ready = true;
</script>
</head><body>
<input id="before" aria-label="trước">
<button type="button" id="trig">Mở menu</button>
<input id="after" aria-label="sau">
</body></html>`;

const failures = [];
const notes = [];
let checks = 0;
function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Launch options: the bundled revision if installed, else the newest cached build of that engine
 * (Playwright's cache often holds a newer Firefox/WebKit than this playwright-core pins).
 * Override with TD_FIREFOX_PATH / TD_WEBKIT_PATH.
 */
async function launchOptions(name, launcher) {
  if (existsSync(launcher.executablePath())) return {};
  const env = { firefox: process.env.TD_FIREFOX_PATH, webkit: process.env.TD_WEBKIT_PATH }[name];
  if (env) return { executablePath: env };
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const rel = { firefox: 'firefox/Nightly.app/Contents/MacOS/firefox', webkit: 'pw_run.sh' }[name];
  if (!rel || !existsSync(cache)) return {};
  const dirs = (await readdir(cache)).filter((d) => d.startsWith(`${name}-`))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const exe = join(cache, d, rel);
    if (existsSync(exe)) { notes.push(`${name}: using cached build ${d}`); return { executablePath: exe }; }
  }
  return {};
}

async function freshPage(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE });
    if (url.pathname === '/td.css' || (/^\/src\//.test(url.pathname) && !url.pathname.includes('..'))) {
      const ext = url.pathname.slice(url.pathname.lastIndexOf('.'));
      return readFile(join(ROOT, url.pathname))
        .then((body) => route.fulfill({ status: 200, contentType: MIME[ext] || 'application/octet-stream', body }))
        .catch(() => route.fulfill({ status: 404, body: '' }));
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => window.__ready === true);
  return { page, context };
}

/** Open the menu on `#id` (focus moves to its first item) and report where focus is. */
async function openOn(page, id) {
  return page.evaluate((tid) => {
    const t = document.getElementById(tid);
    t.focus();
    window.TdMenu.open(t, [{ label: 'Sao chép' }, { label: 'Chia sẻ' }, { separator: true }, { label: 'Xoá', danger: true }]);
    const a = document.activeElement;
    return { open: window.TdMenu.isOpen(t), inMenu: !!a && !!a.closest('.td-menu') };
  }, id);
}

const state = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return {
    id: a ? a.id : '',
    tag: a ? a.localName : '',
    open: window.TdMenu.isOpen(),
    menus: document.querySelectorAll('.td-menu').length,
    inDialog: !!(a && a.closest('.td-modal__dialog')),
  };
});

async function runEngine(name, launcher) {
  let browser;
  try {
    browser = await launcher.launch(await launchOptions(name, launcher));
  } catch (e) {
    failures.push(`${name}: cannot launch (${e.message.split('\n')[0]})`);
    return;
  }
  try {
    // --- standalone ---
    {
      const { page, context } = await freshPage(browser);
      for (const [key, want] of [['Tab', 'after'], ['Shift+Tab', 'before']]) {
        const o = await openOn(page, 'trig');
        check(`${name} standalone ${key}: menu open with focus inside`, o.open && o.inMenu, JSON.stringify(o));
        await page.keyboard.press(key);
        const s = await state(page);
        check(`${name} standalone ${key}: menu closed`, !s.open && s.menus === 0, JSON.stringify(s));
        check(`${name} standalone ${key}: focus on #${want}`, s.id === want, JSON.stringify(s));
      }
      // Space / Enter activate exactly once (keydown handled + default prevented → no second, keyup/click activation):
      // a checkbox item toggles once and stays open; a plain item selects once and does not reopen via the trigger.
      for (const key of ['Space', 'Enter']) {
        await page.evaluate(() => {
          window.__log = [];
          const t = document.getElementById('trig');
          t.focus();
          window.TdMenu.open(t, [
            { label: 'Bật tắt', type: 'checkbox', checked: false, onSelect: (c) => window.__log.push(`chk:${c.checked}`) },
            { label: 'Chọn', onSelect: () => window.__log.push('sel') },
          ]);
        });
        await page.keyboard.press(key);
        await page.waitForTimeout(50);
        const a = await page.evaluate(() => ({ log: window.__log.join(','), open: window.TdMenu.isOpen(),
          checked: document.querySelector('.td-menu [role="menuitemcheckbox"]')?.getAttribute('aria-checked') }));
        check(`${name} ${key} on a checkbox item: toggled once, still open`, a.log === 'chk:true' && a.open && a.checked === 'true', JSON.stringify(a));
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press(key);
        await page.waitForTimeout(50);
        const b = await page.evaluate(() => ({ log: window.__log.join(','), open: window.TdMenu.isOpen(),
          id: document.activeElement?.id }));
        check(`${name} ${key} on an item: selected once, closed, focus on the trigger`, b.log === 'chk:true,sel' && !b.open && b.id === 'trig', JSON.stringify(b));
      }
      await context.close();
    }

    // --- inside a TdModal (focus trap below the menu) ---
    {
      const { page, context } = await freshPage(browser);
      await page.evaluate(() => {
        const body = document.createElement('div');
        body.innerHTML = '<input id="mm-a" aria-label="a"><button type="button" id="mm-trig">Mở menu</button>'
          + '<input id="mm-b" aria-label="b"><button type="button" id="mm-last">Cuối</button>';
        window.TdModal.show({ title: 'Hộp thoại', body, showFooter: false });
      });
      await page.waitForFunction(() => document.querySelector('.td-modal')?.getAttribute('data-state') === 'open');
      for (const [key, want] of [['Tab', 'mm-b'], ['Shift+Tab', 'mm-a']]) {
        const o = await openOn(page, 'mm-trig');
        check(`${name} modal ${key}: menu open with focus inside`, o.open && o.inMenu, JSON.stringify(o));
        await page.keyboard.press(key);
        const s = await state(page);
        check(`${name} modal ${key}: menu closed`, !s.open && s.menus === 0, JSON.stringify(s));
        check(`${name} modal ${key}: focus on #${want}`, s.id === want && s.inDialog, JSON.stringify(s));
      }
      // trigger = last focusable in the dialog → Tab wraps inside the dialog (explicit trap move)
      {
        const o = await openOn(page, 'mm-last');
        check(`${name} modal edge: menu open with focus inside`, o.open && o.inMenu, JSON.stringify(o));
        await page.keyboard.press('Tab');
        const s = await state(page);
        check(`${name} modal edge Tab: menu closed`, !s.open && s.menus === 0, JSON.stringify(s));
        check(`${name} modal edge Tab: focus stays in the dialog`, s.inDialog && s.id !== 'mm-last', JSON.stringify(s));
        const modalOpen = await page.evaluate(() => !!document.querySelector('.td-modal[data-state="open"]'));
        check(`${name} modal edge Tab: modal still open`, modalOpen);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

await runEngine('chromium', chromium);
await runEngine('firefox', firefox);
await runEngine('webkit', webkit);

console.log('--- notes ---');
for (const n of notes) console.log(`  ${n}`);
if (failures.length) {
  console.log(`--- ${failures.length} FAILURE(S) ---`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`Menu Tab engines: all ${checks} checks passed (chromium, firefox, webkit).`);
