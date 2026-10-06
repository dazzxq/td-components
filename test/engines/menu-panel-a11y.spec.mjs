/**
 * v0.53.0 M0 (plan docs/internal/plans/v0.53.0-menu-custom-item.md QĐ 1 / QĐ 2, ADR 0026): the accessibility of the
 * TdMenu "panel" — a menu that hosts a custom row — in Chromium, Firefox and WebKit. Playwright has no accessibility
 * snapshot API, so (same approach as toggle-locked-a11y.spec.mjs):
 *
 *   Chromium  CDP Accessibility.getFullAXTree: the popup is a dialog named after the trigger; the item sections are
 *             menus whose items are menuitem / menuitemcheckbox (checked kept); the custom row is a group named by its
 *             caption; the radios of the td-choice-group inside it are radios with their names and checked state, and
 *             NO menu is among their ancestors.
 *   Firefox / WebKit  DOM-level semantics of the same tree (roles, every aria-labelledby resolves to the expected text,
 *             nothing focusable inside a role="menu" that is not a menu item, no radio under a role="menu").
 *   Every engine  axe-core (when installed — it is not a dependency of the kit) on the popup: no violation of
 *             aria-required-children / aria-required-parent / aria-allowed-role / aria-dialog-name /
 *             aria-command-name / aria-input-field-name.
 *
 * Fixtures: `proto` = the M0 prototype markup of QĐ 1 (hand-written), `real` = the shipped TdMenu.open() with a
 * `type: 'custom'` item, `alt` = the REJECTED option (a) (role="menu" hosting the widget) — notes only, so the record
 * shows why (b) was chosen. A manual VoiceOver / NVDA checklist completes the evidence (plan, "Kết quả M0").
 *
 * Run: npm run test:engines (or node test/engines/menu-panel-a11y.spec.mjs; TD_PANEL_FIXTURES=proto,alt,real)
 */
import { chromium, firefox, webkit } from 'playwright-core';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'http://engines.local';
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const AXE = join(ROOT, 'node_modules', 'axe-core', 'axe.min.js');
const AXE_RULES = ['aria-required-children', 'aria-required-parent', 'aria-allowed-role', 'aria-dialog-name',
  'aria-command-name', 'aria-input-field-name'];

const THEMES = `[{ value: 'auto', label: 'Tự động', icon: 'monitor' }, { value: 'light', label: 'Sáng', icon: 'sun' },
  { value: 'dark', label: 'Tối', icon: 'moon' }]`;

const item = (label, extra = '') => `<button type="button" class="td-menu__item" role="menuitem" tabindex="-1"${extra}>`
  + `<span class="td-menu__label">${label}</span></button>`;

/** QĐ 1 markup, hand-written (the design). */
const PROTO = `<div class="td-menu td-menu--panel td-glass-surface td-glass-surface--strong" id="td-menu-p" role="dialog"
    tabindex="-1" aria-labelledby="trig" data-state="open" data-placement="bottom" data-align="start">
  <div class="td-menu__section" role="menu">
    ${item('Hồ sơ')}
    <button type="button" class="td-menu__item" role="menuitemcheckbox" tabindex="-1" aria-checked="true"><span class="td-menu__label">Thông báo</span></button>
  </div>
  <div class="td-menu__separator" role="separator"></div>
  <div class="td-menu__custom" role="group" aria-labelledby="td-menu-p-c0-label" data-item="theme">
    <div class="td-menu__custom-label" id="td-menu-p-c0-label">Giao diện</div>
    <td-choice-group id="seg" variant="segmented" size="sm" value="light"></td-choice-group>
  </div>
  <div class="td-menu__separator" role="separator"></div>
  <div class="td-menu__section" role="menu">${item('Đăng xuất')}</div>
</div>`;

/** Option (a), rejected: the widget inside role="menu". */
const ALT = `<div class="td-menu td-glass-surface td-glass-surface--strong" id="td-menu-p" role="menu" aria-labelledby="trig"
    data-state="open">
  ${item('Hồ sơ')}
  <button type="button" class="td-menu__item" role="menuitemcheckbox" tabindex="-1" aria-checked="true"><span class="td-menu__label">Thông báo</span></button>
  <div class="td-menu__separator" role="separator"></div>
  <div class="td-menu__custom" role="group" aria-labelledby="td-menu-p-c0-label">
    <div class="td-menu__custom-label" id="td-menu-p-c0-label">Giao diện</div>
    <td-choice-group id="seg" variant="segmented" size="sm" value="light"></td-choice-group>
  </div>
  <div class="td-menu__separator" role="separator"></div>
  ${item('Đăng xuất')}
</div>`;

const PAGE = (which) => `<!doctype html><html lang="vi"><head><meta charset="utf-8"><link rel="stylesheet" href="/td.css">
<script type="module">
  import '/src/form/td-choice-group.js';
  import { TdMenu } from '/src/feedback/td-menu.js';
  const themes = ${THEMES};
  const which = ${JSON.stringify(which)};
  if (which === 'real') {
    const t = document.getElementById('trig');
    TdMenu.open(t, [
      { label: 'Hồ sơ' },
      { label: 'Thông báo', type: 'checkbox', checked: true },
      { separator: true },
      { type: 'custom', id: 'theme', label: 'Giao diện', render: () => {
        const g = document.createElement('td-choice-group');
        g.id = 'seg';
        g.setAttribute('variant', 'segmented');
        g.setAttribute('size', 'sm');
        g.setAttribute('value', 'light');
        g.options = themes;
        return g;
      } },
      { separator: true },
      { label: 'Đăng xuất' },
    ], { align: 'start' });
  } else {
    document.getElementById('seg').options = themes;
  }
  await customElements.whenDefined('td-choice-group');
  window.__ready = true;
</script></head><body>
<main><button type="button" id="trig">Tài khoản</button></main>
${which === 'proto' ? PROTO : which === 'alt' ? ALT : ''}
</body></html>`;

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
  const dirs = (await readdir(cache)).filter((d) => d.startsWith(`${name}-`))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const exe = join(cache, d, rel);
    if (existsSync(exe)) { notes.push(`${name}: using cached build ${d}`); return { executablePath: exe }; }
  }
  return {};
}

async function freshPage(browser, which) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE(which) });
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, '');
    if (rel.startsWith('..') || !(rel === 'td.css' || rel.startsWith('src/'))) return route.fulfill({ status: 404, body: '' });
    const file = join(ROOT, rel);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[rel.slice(rel.lastIndexOf('.'))] || 'text/plain', body: await readFile(file) });
  });
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => window.__ready === true && document.querySelectorAll('#seg input[type="radio"]').length === 3);
  return { page, context };
}

/** DOM-level semantics of the open popup (every engine). */
const domFacts = (page) => page.evaluate(() => {
  const text = (ids) => (ids || '').split(/\s+/).filter(Boolean)
    .map((x) => document.getElementById(x)?.textContent.trim() ?? '\u0000missing').join(' ');
  const panel = document.querySelector('body > .td-menu');
  const sections = [...panel.querySelectorAll('[role="menu"]')];
  const ITEM = /^(menuitem|menuitemcheckbox|menuitemradio|separator|group)$/;
  const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';
  const group = panel.querySelector('.td-menu__custom');
  const radios = [...panel.querySelectorAll('input[type="radio"]')];
  return {
    role: panel.getAttribute('role'),
    modal: panel.getAttribute('aria-modal'),
    name: panel.getAttribute('aria-label') || text(panel.getAttribute('aria-labelledby')),
    sections: sections.length,
    sectionParents: sections.every((s) => s.parentElement === panel),
    sectionNames: sections.map((s) => s.getAttribute('aria-label') || text(s.getAttribute('aria-labelledby'))),
    sectionChildrenOk: sections.every((s) => [...s.children].every((c) => ITEM.test(c.getAttribute('role') || ''))),
    strayFocusable: sections.flatMap((s) => [...s.querySelectorAll(FOCUSABLE)])
      .filter((n) => !/^menuitem/.test(n.getAttribute('role') || '')).length,
    items: sections.flatMap((s) => [...s.querySelectorAll('[role^="menuitem"]')])
      .map((n) => `${n.getAttribute('role')}:${n.textContent.trim()}${n.hasAttribute('aria-checked') ? `:${n.getAttribute('aria-checked')}` : ''}`),
    groupRole: group?.getAttribute('role'),
    groupName: group ? text(group.getAttribute('aria-labelledby')) : '',
    groupInMenu: !!group?.parentElement?.closest('[role="menu"]'),
    radios: radios.map((r) => `${text(r.getAttribute('aria-labelledby')) || r.labels?.[0]?.textContent.trim()}:${r.checked}`),
    radioInMenu: radios.some((r) => !!r.closest('[role="menu"]')),
    radiogroup: !!panel.querySelector('[role="radiogroup"]'),
  };
});

async function axe(page) {
  if (!existsSync(AXE)) return null;
  await page.addScriptTag({ content: await readFile(AXE, 'utf8') });
  return page.evaluate(async (rules) => {
    const r = await window.axe.run(document.querySelector('body > .td-menu'), { runOnly: { type: 'rule', values: rules } });
    return r.violations.map((v) => `${v.id} (${v.nodes.length})`);
  }, AXE_RULES);
}

/** Chromium accessibility tree. */
async function axTree(context, page) {
  const cdp = await context.newCDPSession(page);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const role = (n) => n?.role?.value;
  const name = (n) => n?.name?.value ?? '';
  const prop = (n, k) => n?.properties?.find((p) => p.name === k)?.value?.value;
  const ancestors = (n) => {
    const out = [];
    for (let p = byId.get(n.parentId); p; p = byId.get(p.parentId)) out.push(p);
    return out;
  };
  const dialog = nodes.find((n) => role(n) === 'dialog');
  const menus = nodes.filter((n) => role(n) === 'menu');
  const items = nodes.filter((n) => /^menuitem/.test(role(n) || ''));
  const groups = nodes.filter((n) => role(n) === 'group' && name(n) === 'Giao diện');
  const radios = nodes.filter((n) => role(n) === 'radio');
  return {
    dialog: dialog ? { name: name(dialog), modal: prop(dialog, 'modal') } : null,
    menus: menus.map((m) => ({ name: name(m), inDialog: !!dialog && ancestors(m).includes(dialog) })),
    items: items.map((n) => ({ role: role(n), name: name(n), checked: prop(n, 'checked'),
      menu: ancestors(n).some((a) => role(a) === 'menu') })),
    group: groups.length === 1 ? { inDialog: !!dialog && ancestors(groups[0]).includes(dialog),
      inMenu: ancestors(groups[0]).some((a) => role(a) === 'menu') } : null,
    radios: radios.map((n) => ({ name: name(n), checked: prop(n, 'checked'),
      inGroup: groups.length === 1 && ancestors(n).includes(groups[0]),
      inMenu: ancestors(n).some((a) => role(a) === 'menu') })),
  };
}

async function evidence(engine, page, context, which) {
  const tag = `${engine} [${which}]`;
  const f = await domFacts(page);
  const v = await axe(page);
  if (which === 'alt') {
    notes.push(`${tag} option (a): radio under role=menu → ${f.radioInMenu}; axe → ${v ? (v.join(', ') || 'none') : 'not installed'}`);
    if (engine === 'chromium') {
      const t = await axTree(context, page);
      notes.push(`${tag} option (a) AX radios: ${JSON.stringify(t.radios)}`);
    }
    return;
  }
  check(`${tag} popup role=dialog, non-modal`, f.role === 'dialog' && f.modal === null, JSON.stringify(f));
  check(`${tag} popup named after the trigger`, f.name === 'Tài khoản', f.name);
  check(`${tag} two role=menu sections, direct children of the panel`, f.sections === 2 && f.sectionParents, JSON.stringify(f));
  check(`${tag} sections own menu items / separators only`, f.sectionChildrenOk && f.strayFocusable === 0, JSON.stringify(f));
  check(`${tag} menu items keep their roles + state`,
    f.items.join('|') === 'menuitem:Hồ sơ|menuitemcheckbox:Thông báo:true|menuitem:Đăng xuất', f.items.join('|'));
  check(`${tag} custom row = group named by its caption, outside every menu`,
    f.groupRole === 'group' && f.groupName === 'Giao diện' && !f.groupInMenu, JSON.stringify(f));
  check(`${tag} radios named, one checked, never under a role=menu`,
    f.radios.join('|') === 'Tự động:false|Sáng:true|Tối:false' && !f.radioInMenu && f.radiogroup, f.radios.join('|'));
  notes.push(`${tag} section names: ${JSON.stringify(f.sectionNames)}`);
  if (v) check(`${tag} axe: no ARIA structure violation`, v.length === 0, v.join(', '));
  else notes.push(`${tag} axe-core not installed — skipped`);
  if (engine !== 'chromium') return;
  const t = await axTree(context, page);
  check(`${tag} AX dialog named "Tài khoản"`, t.dialog?.name === 'Tài khoản', JSON.stringify(t.dialog));
  check(`${tag} AX two menus inside the dialog`, t.menus.length === 2 && t.menus.every((m) => m.inDialog), JSON.stringify(t.menus));
  check(`${tag} AX menu items under a menu`, t.items.length === 3 && t.items.every((i) => i.menu)
    && t.items[1].role === 'menuitemcheckbox' && t.items[1].checked === 'true', JSON.stringify(t.items));
  check(`${tag} AX group "Giao diện" in the dialog, not in a menu`, !!t.group && t.group.inDialog && !t.group.inMenu,
    JSON.stringify(t.group));
  check(`${tag} AX radios named + checked, inside the group, never inside a menu`,
    t.radios.map((r) => `${r.name}:${r.checked}`).join('|') === 'Tự động:false|Sáng:true|Tối:false'
      && t.radios.every((r) => r.inGroup && !r.inMenu), JSON.stringify(t.radios));
  notes.push(`${tag} AX menu names: ${JSON.stringify(t.menus.map((m) => m.name))}`);
}

async function runEngine(name, launcher, which) {
  let browser;
  try {
    browser = await launcher.launch(await launchOptions(name, launcher));
  } catch (e) {
    failures.push(`${name}: cannot launch (${e.message.split('\n')[0]})`);
    return;
  }
  try {
    const { page, context } = await freshPage(browser, which);
    await evidence(name, page, context, which);
    await context.close();
  } catch (e) {
    failures.push(`${name} [${which}]: ${e.message.split('\n')[0]}`);
  } finally {
    await browser.close();
  }
}

const FIXTURES = (process.env.TD_PANEL_FIXTURES || 'proto,alt').split(',');
for (const which of FIXTURES) {
  await runEngine('chromium', chromium, which);
  await runEngine('firefox', firefox, which);
  await runEngine('webkit', webkit, which);
}

console.log('--- notes ---');
for (const n of notes) console.log(`  ${n}`);
if (failures.length) {
  console.log(`--- ${failures.length} FAILURE(S) ---`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`Menu panel accessibility: all ${checks} checks passed (chromium, firefox, webkit; ${FIXTURES.join(' + ')}).`);
