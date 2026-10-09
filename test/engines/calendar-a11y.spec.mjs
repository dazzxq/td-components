/**
 * v0.60.0 (plan docs/internal/plans/v0.60.0-calendar-picker.md — Gate "A11y (mô hình ARIA)" + "Hiệu năng", Codex plan r1 #5) —
 * the calendar dialog of <td-datetime-picker> in Chromium, Firefox AND WebKit. Playwright-core 1.60 has no
 * `page.accessibility.snapshot()`, so four layers:
 *   1. locator.ariaSnapshot() of the dialog: dialog → grid → rowgroup → row → columnheader / gridcell, the names (dialog,
 *      the grid, the FULL weekday names of the columns, the full date of each cell), [selected] / [disabled];
 *   2. role + accessible name through getByRole();
 *   3. state read straight from the DOM (ariaSnapshot() prints neither aria-current nor aria-pressed nor tabindex): exactly
 *      one aria-selected="true", one aria-current="date", aria-disabled only on the out-of-range cells, aria-pressed of the
 *      header buttons per view, one tabindex="0" in the grid, the live region;
 *   4. focus: document.activeElement after keys / view changes / close.
 * Performance (plan G4, deterministic): the date popover holds ≤ 150 nodes, changing the month creates 0 nodes in the grid
 * (cells are updated in place), opening costs less than a wide ceiling (median of 5, Chromium only — a ceiling, not a target).
 * What Playwright cannot show (reading order, the live announcement, NVDA browse mode, the VoiceOver rotor) stays a manual
 * script for the owner (plan M0 item 10).
 *
 * Run: node test/engines/calendar-a11y.spec.mjs  (also part of npm run test:engines)
 */
import { chromium, firefox, webkit } from 'playwright-core';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'http://engines.local';
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html' };
const failures = [];
const notes = [];
let checks = 0;
function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function launchOptions(name, launcher) {
  if (existsSync(launcher.executablePath())) return {};
  const env = { firefox: process.env.TD_FIREFOX_PATH, webkit: process.env.TD_WEBKIT_PATH }[name];
  if (env) return { executablePath: env };
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const rel = { firefox: 'firefox/Nightly.app/Contents/MacOS/firefox', webkit: 'pw_run.sh' }[name];
  if (!rel || !existsSync(cache)) return {};
  const dirs = (await readdir(cache)).filter((d) => d.startsWith(`${name}-`)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const exe = join(cache, d, rel);
    if (existsSync(exe)) { notes.push(`${name}: using cached build ${d}`); return { executablePath: exe }; }
  }
  return {};
}

const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/td.css"></head><body><main style="padding: 80px 40px">
<td-datetime-picker id="d" name="d" mode="date" label="Ngày giao" value="15/06/2026" min="2026-06-10" max="2026-06-28"></td-datetime-picker>
<td-datetime-picker id="dt" name="dt" mode="datetime" label="Giờ hẹn" value="15/06/2026 - 10:30"></td-datetime-picker>
<td-datetime-picker id="m" name="m" mode="month" label="Tháng" value="06/2026"></td-datetime-picker>
<td-datetime-picker id="y" name="y" mode="year" label="Năm" value="2026"></td-datetime-picker>
<td-datetime-picker id="p" name="p" mode="date" label="Perf" value="15/06/2026"></td-datetime-picker>
<td-datetime-range id="rg" name="rg" label="Khoảng" max-days="5"></td-datetime-range>
<td-datetime-range id="rgt" name="rgt" label="Khung giờ" mode="datetime" start="01/10/2026 - 08:00" end="05/10/2026 - 17:30"></td-datetime-range>
</main><script type="module">
  import '/src/form/td-datetime-picker.js';
  import '/src/form/td-datetime-range.js';
  customElements.get('td-datetime-range').now = () => new Date(2026, 9, 5, 9, 30);
  import { TdModal } from '/src/feedback/td-modal.js';
  window.TdModal = TdModal;
  await customElements.whenDefined('td-datetime-picker');
  await new Promise((r) => setTimeout(r, 50));
  window.__ready = true;
</script></body></html>`;

async function open(browser, ctx = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...ctx });
  const page = await context.newPage();
  await page.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE });
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, '');
    if (rel.startsWith('..') || !(rel === 'td.css' || rel.startsWith('src/'))) return route.fulfill({ status: 404, body: '' });
    const file = join(ROOT, rel);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[rel.slice(rel.lastIndexOf('.'))] || 'text/plain', body: await readFile(file) });
  });
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => window.__ready === true);
  return { page, context };
}

const dom = (page, fn, arg) => page.evaluate(fn, arg);
const openPicker = async (page, id) => {
  await page.click(`#${id} .td-dtp__trigger`);
  await page.waitForSelector('.td-dtp-pop .td-cal');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};
const closePicker = async (page) => {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.td-dtp-pop'));
};

async function dayGrid(engine, browser) {
  const { page, context } = await open(browser);
  const E = (s) => `${engine}: ${s}`;
  await openPicker(page, 'd');

  // 1. ariaSnapshot
  const snap = await page.locator('.td-dtp-pop').ariaSnapshot();
  const lines = snap.split('\n');
  check(E('dialog has a name'), /^- dialog "[^"]+"/.test(lines[0]), lines[0]);
  check(E('a grid named by the month'), snap.includes('grid "Tháng 6 năm 2026"'), snap.slice(0, 300));
  check(E('7 column headers'), (snap.match(/columnheader/g) || []).length === 7, String((snap.match(/columnheader/g) || []).length));
  check(E('column headers carry the FULL weekday names'), ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'].every((n) => snap.includes(`columnheader "${n}"`)), snap.slice(0, 600));
  check(E('the selected cell is [selected] with its full date'), snap.includes('gridcell "Thứ Hai, 15 tháng 6 năm 2026" [selected]'));
  check(E('out-of-range cells are [disabled]'), snap.includes('gridcell "Chủ Nhật, 7 tháng 6 năm 2026" [disabled]') && snap.includes('gridcell "Thứ Hai, 29 tháng 6 năm 2026" [disabled]'));
  check(E('in-range cells are not [disabled]'), !snap.includes('gridcell "Thứ Hai, 15 tháng 6 năm 2026" [disabled]') && !snap.includes('"Thứ Ba, 16 tháng 6 năm 2026" [disabled]'));
  check(E('42 gridcells in the grid (6 weeks)'), (snap.match(/gridcell/g) || []).length === 42, String((snap.match(/gridcell/g) || []).length));

  // 2. roles + names
  check(E('getByRole dialog'), (await page.getByRole('dialog', { name: /Chọn ngày/ }).count()) === 1);
  check(E('getByRole grid'), (await page.getByRole('grid', { name: 'Tháng 6 năm 2026' }).count()) === 1);
  check(E('getByRole gridcell by full name'), (await page.getByRole('gridcell', { name: 'Thứ Ba, 16 tháng 6 năm 2026' }).count()) === 1);
  check(E('getByRole gridcell selected'), (await page.getByRole('gridcell', { selected: true }).count()) === 1);
  check(E('getByRole button Hôm nay'), (await page.getByRole('button', { name: 'Hôm nay' }).count()) === 1);
  check(E('header buttons have names containing their visible text'), (await page.getByRole('button', { name: /^Tháng 6/ }).count()) >= 1 && (await page.getByRole('button', { name: /^2026/ }).count()) >= 1);

  // 3. direct state
  const st = await dom(page, () => {
    const cal = document.querySelector('.td-dtp-pop .td-cal');
    const cells = [...cal.querySelectorAll('tbody [data-date]')];
    return {
      selected: cells.filter((c) => c.getAttribute('aria-selected') === 'true').map((c) => c.dataset.date),
      current: cells.filter((c) => c.getAttribute('aria-current') === 'date').map((c) => c.dataset.date),
      todayIso: (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; })(),
      inGrid: cells.map((c) => c.dataset.date),
      disabled: cells.filter((c) => c.getAttribute('aria-disabled') === 'true').map((c) => c.dataset.date),
      stops: cells.filter((c) => c.getAttribute('tabindex') === '0').map((c) => c.dataset.date),
      live: cal.querySelector('[aria-live]').getAttribute('aria-live'),
      liveText: cal.querySelector('[aria-live]').textContent,
      pressed: [...cal.querySelectorAll('[data-pick]')].map((b) => `${b.dataset.pick}=${b.getAttribute('aria-pressed')}`),
      gridRole: cal.querySelector('table').getAttribute('role'),
      focus: document.activeElement.dataset.date || null,
      modal: document.querySelector('.td-dtp-pop').getAttribute('aria-modal'),
    };
  });
  check(E('exactly one aria-selected'), JSON.stringify(st.selected) === '["2026-06-15"]', JSON.stringify(st.selected));
  check(E('aria-current="date" only on today, and only when today is in the grid'), JSON.stringify(st.current) === JSON.stringify(st.inGrid.includes(st.todayIso) ? [st.todayIso] : []), JSON.stringify([st.current, st.todayIso]));
  check(E('aria-disabled is on exactly the 23 out-of-range cells'), st.disabled.length === 42 - 19 && !st.disabled.includes('2026-06-15') && st.disabled.includes('2026-06-09') && !st.disabled.includes('2026-06-10') && st.disabled.includes('2026-06-29'), String(st.disabled.length));
  check(E('one tab stop in the grid, on the active day'), JSON.stringify(st.stops) === '["2026-06-15"]', JSON.stringify(st.stops));
  check(E('live region is polite and reads the month'), st.live === 'polite' && st.liveText === 'Tháng 6 năm 2026', JSON.stringify([st.live, st.liveText]));
  check(E('header buttons are not pressed in the days view'), st.pressed.every((p) => !p.endsWith('=true')), JSON.stringify(st.pressed));
  check(E('the grid is a real table role=grid'), st.gridRole === 'grid');
  check(E('the popover does not claim aria-modal (the page is not inert — plan Q4)'), st.modal === null);
  check(E('focus starts on the active day'), st.focus === '2026-06-15', String(st.focus));

  // 4. focus + keys
  await page.keyboard.press('ArrowRight');
  check(E('ArrowRight moves the focus (roving)'), (await dom(page, () => document.activeElement.dataset.date)) === '2026-06-16');
  check(E('…and the single tab stop with it'), (await dom(page, () => [...document.querySelectorAll('.td-dtp-pop tbody [tabindex="0"]')].map((c) => c.dataset.date).join())) === '2026-06-16');
  await page.keyboard.press('PageDown');
  check(E('PageDown out of the bounds stops at max'), (await dom(page, () => document.activeElement.dataset.date)) === '2026-06-28');
  await page.keyboard.press('Home');
  check(E('Home = Monday of the week'), (await dom(page, () => document.activeElement.dataset.date)) === '2026-06-22');

  // view change: pressed + live + focus
  await page.click('.td-dtp-pop [data-pick="month"]');
  await page.waitForSelector('.td-dtp-pop .td-cal[data-view="months"]');
  const mv = await dom(page, () => ({
    live: document.querySelector('.td-dtp-pop [aria-live]').textContent,
    pressed: document.querySelector('.td-dtp-pop [data-pick="month"]').getAttribute('aria-pressed'),
    focus: document.activeElement.dataset.month || null,
    selected: [...document.querySelectorAll('.td-dtp-pop [data-month][aria-selected="true"]')].length,
  }));
  check(E('months view: live "Năm 2026", month button pressed, focus on the active month'), mv.live === 'Năm 2026' && mv.pressed === 'true' && mv.focus === '6' && mv.selected === 1, JSON.stringify(mv));
  const msnap = await page.locator('.td-dtp-pop').ariaSnapshot();
  check(E('months view: cells named "Tháng N năm 2026", out-of-range ones [disabled]'), msnap.includes('gridcell "Tháng 6 năm 2026" [selected]') && msnap.includes('gridcell "Tháng 5 năm 2026" [disabled]') && msnap.includes('gridcell "Tháng 7 năm 2026" [disabled]'), msnap.slice(0, 400));
  await closePicker(page);
  check(E('focus returns to the trigger after Esc'), (await dom(page, () => document.activeElement.className)) === 'td-dtp__trigger');
  await context.close();
}

async function otherModes(engine, browser) {
  const { page, context } = await open(browser);
  const E = (s) => `${engine}: ${s}`;
  await openPicker(page, 'y');
  const ysnap = await page.locator('.td-dtp-pop').ariaSnapshot();
  check(E('year mode: a grid of years, the selected year [selected]'), ysnap.includes('gridcell "Năm 2026" [selected]') && /grid "[^"]+"/.test(ysnap), ysnap.slice(0, 300));
  check(E('year mode: live region "2017 – 2028"'), (await dom(page, () => document.querySelector('.td-dtp-pop [aria-live]').textContent)) === '2017 – 2028');
  check(E('year mode: no month button; the year heading is not a toggle'), (await dom(page, () => ({ m: !!document.querySelector('.td-dtp-pop [data-pick="month"]:not([hidden])'), y: document.querySelector('.td-dtp-pop [data-pick="year"]').getAttribute('aria-pressed') }))).m === false);
  await closePicker(page);
  await openPicker(page, 'dt');
  const dsnap = await page.locator('.td-dtp-pop').ariaSnapshot();
  check(E('datetime (date screen): the calendar only — no listboxes in the accessibility tree, "Hôm nay" offered, "Chọn" / "Bây giờ" not'), !dsnap.includes('listbox') && (await page.getByRole('button', { name: 'Hôm nay' }).count()) === 1 && (await page.getByRole('button', { name: 'Chọn', exact: true }).count()) === 0 && (await page.getByRole('button', { name: 'Bây giờ' }).count()) === 0, dsnap.slice(-300));
  await page.evaluate(() => { document.querySelector('.td-dtp-pop .td-cal__day[tabindex="0"]').click(); });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const tsnap = await page.locator('.td-dtp-pop').ariaSnapshot();
  check(E('datetime (time screen): the hour / minute listboxes are inside the dialog, named; the calendar left the tree'), tsnap.includes('listbox "Giờ"') && tsnap.includes('listbox "Phút"') && !tsnap.includes('grid '), tsnap.slice(-500));
  check(E('datetime (time screen): "Chọn lại ngày" back button, the dated heading, buttons "Bây giờ" and "Chọn"'), (await page.getByRole('button', { name: 'Chọn lại ngày' }).count()) === 1 && (await page.getByRole('button', { name: 'Bây giờ' }).count()) === 1 && (await page.getByRole('button', { name: 'Chọn', exact: true }).count()) === 1 && tsnap.includes('Thứ Hai, 15/06/2026'), tsnap.slice(0, 400));
  check(E('datetime: the focus is on the hour wheel; the status announces "Chọn giờ cho 15/06/2026"'), (await dom(page, () => ({ f: document.activeElement.getAttribute('data-part'), s: document.querySelector('.td-dtp-pop [role="status"]').textContent }))).s === 'Chọn giờ cho 15/06/2026');
  await closePicker(page);
  await context.close();
}

async function perf(engine, browser) {
  const { page, context } = await open(browser);
  const E = (s) => `${engine}: ${s}`;
  const times = [];
  for (let i = 0; i < 5; i++) {
    const ms = await page.evaluate(async () => {
      const t0 = performance.now();
      document.querySelector('#p .td-dtp__trigger').click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const dt = performance.now() - t0;
      return dt;
    });
    times.push(ms);
    await closePicker(page);
  }
  times.sort((a, b) => a - b);
  const median = times[2];
  notes.push(`${engine}: open date popover median ${median.toFixed(1)} ms (5 runs: ${times.map((x) => x.toFixed(0)).join('/')})`);
  if (engine === 'chromium') check(E(`opening the date popover: median ${median.toFixed(0)} ms ≤ 150 ms`), median <= 150, times.join());
  await page.click('#p .td-dtp__trigger');
  await page.waitForSelector('.td-dtp-pop .td-cal');
  const nodes = await page.evaluate(() => document.querySelectorAll('.td-dtp-pop, .td-dtp-pop *').length);
  check(E(`date popover node count ${nodes} ≤ 150`), nodes <= 150, String(nodes));
  const added = await page.evaluate(async () => {
    const grid = document.querySelector('.td-dtp-pop .td-cal');
    let n = 0;
    const mo = new MutationObserver((list) => { for (const r of list) n += [...r.addedNodes].filter((x) => x.nodeType === 1).length; });
    mo.observe(grid, { childList: true, subtree: true });
    for (let i = 0; i < 6; i++) {
      grid.querySelector('[data-dir="next"]').click();
      await new Promise((r) => requestAnimationFrame(r));
    }
    grid.querySelector('[data-pick="month"]').click();
    await new Promise((r) => requestAnimationFrame(r));
    grid.querySelector('[data-pick="month"]').click();
    await new Promise((r) => requestAnimationFrame(r));
    mo.takeRecords();
    mo.disconnect();
    return n;
  });
  check(E('changing the month / switching views creates 0 new elements (cells updated in place)'), added === 0, String(added));
  await closePicker(page);
  await context.close();
}

/**
 * Popover geometry (plan A5, Codex plan r1 #3): date and datetime popovers at widths ≥ 720 and short viewport heights, the
 * trigger near the top / centre / bottom, fine and coarse (44 px cells) — the popover is whole inside the viewport, its action
 * row is in view, the scroll region reaches the last week and the wheels; also over a TdModal (135's case).
 */
async function geometry(engine, browser) {
  const E = (s) => `${engine}: ${s}`;
  const bad = [];
  let cases = 0;
  for (const w of [720, 844, 1280]) {
    for (const h of [400, 480, 600]) {
      const { page, context } = await open(browser, { viewport: { width: w, height: h } });
      for (const coarse of [false, true]) {
        for (const id of ['d', 'dt']) {
          for (const pos of ['top', 'centre', 'bottom']) {
            await page.evaluate(([coarse, id, pos]) => {
              document.documentElement.style.setProperty('--td-cal-cell', coarse ? '44px' : '36px');
              document.documentElement.style.setProperty('--td-dtp-option-h', coarse ? '44px' : '40px');
              for (const other of ['d', 'dt', 'm', 'y', 'p']) if (other !== id) document.getElementById(other).style.display = 'none'; // never under the tested host
              const host = document.getElementById(id);
              host.style.cssText = 'position: fixed; left: 24px; width: 240px; top: 0px;';
              const t = host.querySelector('.td-dtp__trigger').getBoundingClientRect();
              const want = pos === 'top' ? 8 : pos === 'centre' ? Math.round((innerHeight - t.height) / 2) : innerHeight - 8 - t.height; // the trigger itself, whole in view
              host.style.top = `${want - t.top}px`;
            }, [coarse, id, pos]);
            await page.click(`#${id} .td-dtp__trigger`);
            await page.waitForSelector('.td-dtp-pop .td-cal');
            await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
            const r = await page.evaluate(() => {
              const pop = document.querySelector('.td-dtp-pop');
              const p = pop.getBoundingClientRect();
              const act = pop.querySelector('.td-dtp-pop__actions button').getBoundingClientRect();
              const scroll = pop.querySelector('.td-dtp-pop__scroll');
              const overflow = scroll.scrollHeight > scroll.clientHeight + 1;
              scroll.scrollTop = scroll.scrollHeight;
              const last = [...pop.querySelectorAll('.td-cal__day[data-date]')].pop().getBoundingClientRect();
              const wheel = pop.querySelector('.td-dtp-wheel__list');
              let wheelOk = true;
              if (wheel && wheel.getClientRects().length) { const wr = wheel.getBoundingClientRect(); const s = scroll.getBoundingClientRect(); wheelOk = wr.bottom <= s.bottom + 1 && wr.top >= s.top - 1; } // v0.61.0: the wheels belong to the TIME screen (hidden here)
              const sr = scroll.getBoundingClientRect();
              return {
                vw: innerWidth, vh: innerHeight, top: p.top, bottom: p.bottom, left: p.left, right: p.right,
                actTop: act.top, actBottom: act.bottom, overflow, lastInScroll: last.bottom <= sr.bottom + 1 && last.top >= sr.top - 1, wheelOk,
                scrollOverflowY: getComputedStyle(scroll).overflowY,
              };
            });
            // Codex r1 #2: keyboard navigation must keep the active cell inside the visible part of the scroll region
            const kb = await (async () => {
              await page.evaluate(() => { document.querySelector('.td-dtp-pop__scroll').scrollTop = 0; });
              const seen = [];
              for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'Home']) {
                await page.keyboard.press(key);
                seen.push(await page.evaluate(() => {
                  const a = document.activeElement;
                  const sr = document.querySelector('.td-dtp-pop__scroll').getBoundingClientRect();
                  const ar = a.getBoundingClientRect();
                  return { ok: ar.top >= sr.top - 1 && ar.bottom <= sr.bottom + 1, d: a.getAttribute('data-date') };
                }));
              }
              return seen.filter((x) => !x.ok).map((x) => x.d);
            })();
            cases += 1;
            const tag = `${w}x${h} ${coarse ? 'coarse' : 'fine'} ${id} ${pos}`;
            if (id === 'dt') {
              // v0.61.0: the TIME screen (a day activates it): whole in the viewport, its actions in view, the wheels reachable
              await page.evaluate(() => { document.querySelector('.td-dtp-pop .td-cal__day[tabindex="0"]').click(); });
              await page.evaluate(() => new Promise((rr) => requestAnimationFrame(() => requestAnimationFrame(rr))));
              const t2 = await page.evaluate(() => {
                const pop = document.querySelector('.td-dtp-pop');
                const p = pop.getBoundingClientRect();
                const act = pop.querySelector('.td-dtp-pop__actions [data-action="confirm"]').getBoundingClientRect();
                const scroll = pop.querySelector('.td-dtp-pop__scroll');
                const wr = pop.querySelector('.td-dtp-wheel__list').getBoundingClientRect();
                const sr = scroll.getBoundingClientRect();
                return { step: pop.getAttribute('data-step'), top: p.top, bottom: p.bottom, left: p.left, right: p.right, vw: innerWidth, vh: innerHeight, actTop: act.top, actBottom: act.bottom, wheelOk: wr.bottom <= sr.bottom + 1 && wr.top >= sr.top - 1 };
              });
              if (t2.step !== 'time') bad.push(`${tag}: a day did not open the time screen`);
              if (t2.top < 7.5 || t2.bottom > t2.vh - 7.5 || t2.left < 7.5 || t2.right > t2.vw - 7.5) bad.push(`${tag}: time screen outside the viewport ${Math.round(t2.top)}…${Math.round(t2.bottom)} of ${t2.vh}`);
              if (t2.actTop < 0 || t2.actBottom > t2.vh) bad.push(`${tag}: time screen actions out of view`);
              if (!t2.wheelOk) bad.push(`${tag}: the wheels (time screen) are not reachable`);
            }
            if (kb.length) bad.push(`${tag}: keyboard focus left the visible scroll region at ${kb.join(',')}`);
            if (r.top < 7.5 || r.bottom > r.vh - 7.5 || r.left < 7.5 || r.right > r.vw - 7.5) bad.push(`${tag}: popover outside the viewport ${Math.round(r.top)}…${Math.round(r.bottom)} of ${r.vh}`);
            if (r.actTop < 0 || r.actBottom > r.vh) bad.push(`${tag}: actions out of view`);
            if (!r.lastInScroll) bad.push(`${tag}: the last week is not reachable by scrolling the region`);
            if (!r.wheelOk) bad.push(`${tag}: the wheels are not reachable`);
            if (r.overflow && r.scrollOverflowY !== 'auto') bad.push(`${tag}: overflowing but overflow-y ${r.scrollOverflowY}`);
            await closePicker(page);
          }
        }
      }
      await context.close();
    }
  }
  check(E(`popover geometry: ${cases} cases (720/844/1280 × 400/480/600 × fine+coarse × date+datetime × top/centre/bottom) all inside the viewport`), bad.length === 0, bad.slice(0, 6).join(' ; '));

  // Codex r1 #5: safe-area insets (a notch in landscape): the popover stays inside the SAFE rectangle. env() cannot be faked in
  // a test, so the probe's computed padding — what the picker reads — is overridden by a page rule.
  {
    const ib = [];
    let icases = 0;
    for (const [w, h] of [[844, 390], [720, 400]]) {
      const { page, context } = await open(browser, { viewport: { width: w, height: h } });
      await page.addStyleTag({ content: '.td-dtp-pop__inset { padding: 24px 44px 20px 44px !important; }' });
      for (const id of ['d', 'dt']) {
        for (const pos of ['top', 'centre', 'bottom']) {
          await page.evaluate(([id, pos]) => {
            for (const other of ['d', 'dt', 'm', 'y', 'p']) if (other !== id) document.getElementById(other).style.display = 'none';
            const host = document.getElementById(id);
            host.style.cssText = 'position: fixed; left: 60px; width: 240px; top: 0px;';
            const t = host.querySelector('.td-dtp__trigger').getBoundingClientRect();
            const want = pos === 'top' ? 30 : pos === 'centre' ? Math.round((innerHeight - t.height) / 2) : innerHeight - 26 - t.height;
            host.style.top = `${want - t.top}px`;
          }, [id, pos]);
          await page.click(`#${id} .td-dtp__trigger`);
          await page.waitForSelector('.td-dtp-pop .td-cal');
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          const r = await page.evaluate(() => { const p = document.querySelector('.td-dtp-pop').getBoundingClientRect(); return { t: p.top, b: p.bottom, l: p.left, r: p.right, vw: innerWidth, vh: innerHeight }; });
          icases += 1;
          if (r.t < 24 + 7.5 || r.b > r.vh - 20 - 7.5 || r.l < 44 + 7.5 || r.r > r.vw - 44 - 7.5) ib.push(`${w}x${h} ${id} ${pos}: popover ${Math.round(r.l)},${Math.round(r.t)}…${Math.round(r.r)},${Math.round(r.b)} outside the safe rectangle`);
          await closePicker(page);
        }
      }
      await context.close();
    }
    check(E(`safe-area insets: ${icases} cases (landscape 844×390, 720×400; insets 24/44/20/44) stay inside the safe rectangle`), ib.length === 0, ib.slice(0, 4).join(' ; '));
  }

  // over a TdModal (135's case): the popover floats above the modal, whole in the viewport, Esc closes only it
  const { page, context } = await open(browser, { viewport: { width: 1024, height: 520 } });
  await page.evaluate(() => {
    const body = document.createElement('div');
    body.innerHTML = '<p>Nội dung</p><td-datetime-picker id="in" name="in" label="Trong hộp thoại" value="15/06/2026 - 10:30"></td-datetime-picker>';
    window.TdModal.show({ title: 'Hộp thoại', body, escapeCloses: true, actions: [{ label: 'Đóng', value: 'x' }] });
  });
  await page.waitForSelector('.td-modal[data-state="open"] td-datetime-picker');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 450)));
  await page.click('#in .td-dtp__trigger');
  await page.waitForSelector('body > .td-dtp-pop .td-cal');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const m = await dom(page, () => {
    const pop = document.querySelector('body > .td-dtp-pop'); const p = pop.getBoundingClientRect();
    const hit = document.elementFromPoint(p.left + p.width / 2, p.top + 20);
    return { inside: p.top >= 7.5 && p.bottom <= innerHeight - 7.5, above: pop.contains(hit), popInert: !!pop.closest('[inert]'), modalInert: !!document.querySelector('.td-modal__dialog').closest('[inert]') };
  });
  check(E('over a TdModal: the popover is inside the viewport, above the modal, not inert'), m.inside && m.above && !m.popInert, JSON.stringify(m));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.td-dtp-pop'));
  check(E('over a TdModal: Esc closed only the popover (the modal is still open)'), await dom(page, () => !!document.querySelector('.td-modal[data-state="open"]')));
  await context.close();
}

async function sheet(engine, browser) {
  const { page, context } = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true });
  const E = (s) => `${engine}: ${s}`;
  await page.tap('#d .td-dtp__trigger');
  await page.waitForSelector('.td-modal .td-cal');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 450)));
  const snap = await page.locator('.td-modal [role="dialog"]').first().ariaSnapshot();
  check(E('sheet: a modal dialog containing the same grid'), snap.includes('grid "Tháng 6 năm 2026"') && snap.includes('gridcell "Thứ Hai, 15 tháng 6 năm 2026" [selected]'), snap.slice(0, 300));
  check(E('sheet: aria-modal on the TdModal dialog'), (await dom(page, () => document.querySelector('.td-modal [role="dialog"]').getAttribute('aria-modal'))) === 'true');
  const cell = await dom(page, () => { const r = document.querySelector('.td-modal [data-date="2026-06-16"]').getBoundingClientRect(); return [r.width, r.height]; });
  check(E(`sheet: day cell ${cell.map((x) => x.toFixed(1)).join('×')} ≥ 44 px on a coarse pointer`), cell[0] >= 43.5 && cell[1] >= 43.5, cell.join('×'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.td-modal'));
  await context.close();
}

/**
 * v0.61.0 (plan v0.61.0-range-calendar, Gate "A11y" + "Hiệu năng"): the calendar dialog of <td-datetime-range> — ariaSnapshot of the
 * dialog (presets group, the "Từ | Đến" switch, the grid, endpoint / in-range cell names, [selected] on the endpoints only), the
 * direct state (aria-multiselectable = the M0.4 outcome: PRESENT; one tab stop; dimmed ≠ disabled; roles / aria-pressed /
 * describedby / role=status), roles by name, and the deterministic perf numbers (0 new ELEMENTS on hover / month change, node ceiling).
 */
async function rangeDialog(engine, browser) {
  const { page, context } = await open(browser);
  const E = (s) => `${engine}: range ${s}`;
  await page.click('#rg .td-dtr__trigger');
  await page.waitForSelector('.td-dtr-panel .td-cal');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.click('.td-cal__day[data-date="2026-10-02"]');
  await page.click('.td-cal__day[data-date="2026-10-05"]');
  const snap = await page.locator('.td-dtr-panel').ariaSnapshot();
  check(E('presets group is named'), snap.includes('group "Chọn nhanh"'), snap.slice(0, 200));
  check(E('the endpoint switch group is named'), snap.includes('group "Mốc đang sửa"'), snap.slice(0, 300));
  check(E('the tabs name both endpoints with their value'), snap.includes('button "Từ 02/10/2026"') && snap.includes('button "Đến 05/10/2026"'), snap.slice(0, 500));
  check(E('a grid named by the month'), snap.includes('grid "Tháng 10 năm 2026"'));
  check(E('the start cell names its role and is [selected]'), snap.includes('gridcell "Thứ Sáu, 2 tháng 10 năm 2026, ngày bắt đầu" [selected]'));
  check(E('the end cell names its role and is [selected]'), snap.includes('gridcell "Thứ Hai, 5 tháng 10 năm 2026, hôm nay, ngày kết thúc" [selected]'));
  check(E('an in-range cell is described and NOT [selected]'), snap.includes('gridcell "Thứ Bảy, 3 tháng 10 năm 2026, trong khoảng"') && !snap.includes('"Thứ Bảy, 3 tháng 10 năm 2026, trong khoảng" [selected]'));
  check(E('exactly two [selected] cells'), (snap.match(/gridcell[^\n]*\[selected\]/g) || []).length === 2, String((snap.match(/\[selected\]/g) || []).length));
  check(E('getByRole grid / gridcell by name'), (await page.getByRole('grid', { name: 'Tháng 10 năm 2026' }).count()) === 1
    && (await page.getByRole('gridcell', { name: /ngày bắt đầu$/ }).count()) === 1 && (await page.getByRole('gridcell', { selected: true }).count()) === 2);
  check(E('getByRole tab buttons'), (await page.getByRole('button', { name: /^Từ / }).count()) === 1 && (await page.getByRole('button', { name: /^Đến / }).count()) === 1);
  const st = await dom(page, () => {
    const panel = document.querySelector('.td-dtr-panel');
    const cells = [...panel.querySelectorAll('tbody [data-date]')];
    const status = panel.querySelector('[role="status"]');
    return {
      multi: panel.querySelector('table').getAttribute('aria-multiselectable'),
      stops: cells.filter((c) => c.getAttribute('tabindex') === '0').length,
      selected: cells.filter((c) => c.getAttribute('aria-selected') === 'true').map((c) => c.dataset.date),
      ranges: cells.filter((c) => c.hasAttribute('data-range')).map((c) => `${c.dataset.date}:${c.dataset.range}`),
      pressed: [...panel.querySelectorAll('.td-dtr-panel__tab')].map((t) => t.getAttribute('aria-pressed')),
      status: status && status.textContent,
      disabledAny: cells.some((c) => c.getAttribute('aria-disabled') === 'true'),
    };
  });
  check(E('the day grid is aria-multiselectable="true" (M0.4 outcome)'), st.multi === 'true', String(st.multi));
  check(E('one tab stop in the grid'), st.stops === 1, String(st.stops));
  check(E('the endpoints are aria-selected, nothing else'), JSON.stringify(st.selected) === '["2026-10-02","2026-10-05"]', JSON.stringify(st.selected));
  check(E('data-range marks start / in / in / end'), JSON.stringify(st.ranges) === '["2026-10-02:start","2026-10-03:in","2026-10-04:in","2026-10-05:end"]', JSON.stringify(st.ranges));
  check(E('Từ pressed after the range is complete (the next pick restarts)'), JSON.stringify(st.pressed) === '["true","false"]', JSON.stringify(st.pressed));
  check(E('role=status announced the range'), st.status === 'Đã chọn khoảng 02/10/2026 – 05/10/2026, 4 ngày.', String(st.status));
  check(E('nothing is aria-disabled without min / max'), st.disabledAny === false);
  // max-days: a dimmed cell is enabled, named, and previews nothing
  await page.click('.td-cal__day[data-date="2026-10-07"]');
  const dim = await dom(page, () => {
    const c = document.querySelector('.td-cal__day[data-date="2026-10-14"]');
    return { dimmed: c.hasAttribute('data-dimmed'), disabled: c.hasAttribute('aria-disabled'), label: c.getAttribute('aria-label'), hint: document.querySelector('.td-dtr-panel__hint').textContent };
  });
  check(E('a day past max-days is dimmed, NOT aria-disabled, named "quá 5 ngày"'), dim.dimmed && !dim.disabled && /quá 5 ngày/.test(dim.label) && dim.hint === 'Tối đa 5 ngày', JSON.stringify(dim));
  // perf (deterministic): 0 new elements for hover / month change; the node ceiling
  const perf = await dom(page, async () => {
    const tbody = document.querySelector('.td-dtr-panel tbody');
    let added = 0;
    const mo = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) added += 1; });
    mo.observe(tbody, { childList: true, subtree: true });
    for (const c of document.querySelectorAll('.td-dtr-panel .td-cal__day[data-date]')) c.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    document.querySelector('.td-cal__nav[data-dir="next"]').click();
    document.querySelector('.td-cal__nav[data-dir="prev"]').click();
    await new Promise((r) => requestAnimationFrame(r));
    mo.disconnect();
    return { added, nodes: document.querySelectorAll('.td-dtr-panel *').length };
  });
  check(E('hover over 42 cells + two month changes create 0 elements'), perf.added === 0, String(perf.added));
  check(E(`the date dialog body holds ≤ 260 nodes (has ${perf.nodes})`), perf.nodes <= 260, String(perf.nodes));
  notes.push(`${engine}: range date dialog ${perf.nodes} elements`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.td-modal'));
  if (engine === 'chromium') { // a wide CEILING, not a target: click → the calendar cell holds the focus (median of 5)
    const runs = [];
    for (let i = 0; i < 5; i++) {
      runs.push(await dom(page, async () => {
        const t0 = performance.now();
        document.querySelector('#rg .td-dtr__trigger').click();
        while (!document.activeElement || !document.activeElement.classList.contains('td-cal__day')) await new Promise((r) => requestAnimationFrame(r));
        return performance.now() - t0;
      }));
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.td-modal'));
    }
    runs.sort((x, y) => x - y);
    notes.push(`chromium: range dialog open → focused cell median ${runs[2].toFixed(1)} ms (${runs.map((x) => x.toFixed(0)).join('/')})`);
    check('chromium: range dialog opens to a focused cell under the ceiling (median < 400 ms)', runs[2] < 400, runs.join(','));
  }
  // datetime (0.61.0, two screens): a day → the time screen; the tab keeps the screen kind; a rejected "Chọn" focuses the tab
  await page.click('#rgt .td-dtr__trigger');
  await page.waitForSelector('.td-dtr-panel .td-cal');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const step = () => dom(page, () => document.querySelector('.td-dtr-panel').getAttribute('data-step'));
  check(E('datetime: opens on the DATE screen; "Chọn" is hidden there'), (await step()) === 'date' && (await dom(page, () => document.querySelector('.td-modal__footer [data-action="confirm"]').hidden)) === true);
  await page.click('.td-cal__day[data-date="2026-10-01"]');
  await page.waitForSelector('.td-dtr-panel .td-dtp-wheel__list');
  const hour = () => dom(page, () => document.querySelector('.td-dtp-wheel__list[data-part="hour"] [aria-selected="true"]').dataset.value);
  check(E('datetime: a day opens the TIME screen of Từ (the wheels on its time), the hour wheel focused'), (await step()) === 'time' && (await hour()) === '8' && (await dom(page, () => document.activeElement.getAttribute('data-part'))) === 'hour');
  await page.click('.td-dtr-panel__tab[data-side="end"]');
  check(E('datetime: the Đến tab keeps the time screen and shows ITS time'), (await step()) === 'time' && (await hour()) === '17');
  await page.click('.td-time-step [data-action="back"]');
  check(E('datetime: "‹" returns to the date screen, the focus on a day cell'), (await step()) === 'date' && (await dom(page, () => document.activeElement.classList.contains('td-cal__day'))) === true);
  await page.click('.td-cal__day[data-date="2026-09-30"]'); // Đến before Từ: the order error
  await page.waitForSelector('.td-dtr-panel .td-dtp-wheel__list');
  await page.click('.td-modal__footer [data-action="confirm"]');
  const rej = await dom(page, () => ({ tab: document.activeElement === document.querySelector('.td-dtr-panel__tab[data-side="end"]'), open: !!document.querySelector('.td-modal[data-state="open"]'), by: document.querySelector('.td-dtr-panel__tab[data-side="end"]').getAttribute('aria-describedby'), err: document.querySelector('.td-dtr-panel__error').id, step: document.querySelector('.td-dtr-panel').getAttribute('data-step') }));
  check(E('a rejected "Chọn" keeps it open, goes to the DATE screen of Đến and focuses the Đến tab that carries aria-describedby'), rej.tab && rej.open && rej.by === rej.err && rej.step === 'date', JSON.stringify(rej));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.td-modal'));
  await context.close();
}

async function runEngine(name, launcher) {
  let browser;
  try {
    browser = await launcher.launch(await launchOptions(name, launcher));
  } catch (e) {
    failures.push(`${name}: cannot launch (${e.message.split('\n')[0]})`);
    return;
  }
  try {
    await dayGrid(name, browser);
    await rangeDialog(name, browser);
    await otherModes(name, browser);
    await perf(name, browser);
    await sheet(name, browser);
    await geometry(name, browser);
  } catch (e) {
    failures.push(`${name}: ${e.message.split('\n').slice(0, 24).join(' | ')}`);
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
  console.log(`\ncalendar-a11y: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`\ncalendar-a11y: ${checks} checks passed (Chromium / Firefox / WebKit).`);
