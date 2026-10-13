/**
 * v0.73.0 (plan docs/internal/plans/v0.73.0-cropper-pan-mode.md, section "a11y"): the accessibility TREE of
 * `<td-cropper mode="pan">` (the frame stays, the image moves under it) in Chromium, Firefox and WebKit. The unit /
 * browser tests only read DOM attributes and `display`; this gate checks what assistive technology is actually given.
 * Playwright has no accessibility-snapshot API of its own, so per engine (same approach as the other *-a11y specs):
 *
 *   Chromium  CDP Accessibility.getFullAXTree (the browser's real tree; `ignored` nodes are dropped): role + name +
 *             description of the frame, role + name + valuemin / valuemax / valuenow of the zoom slider, names of the
 *             buttons, the radiogroup + checked radio, and the ABSENCE of the 4 corner handles and the focal point.
 *   Firefox / WebKit  Playwright's ARIA model (`locator.ariaSnapshot()`, computed from the DOM by Playwright itself,
 *             not from the engine's native tree — the engines expose no tree to Playwright) for roles + names + the
 *             absence of the handles, plus DOM reads for what the snapshot does not print (aria-describedby text, the
 *             slider's min / max / value, aria-checked). The native Firefox / WebKit trees are NOT inspected here.
 *   Every engine  the same cropper in `mode="box"` is the control: there the 4 corner handles and the focal point ARE
 *             in the tree, so "absent in pan" cannot pass by accident. `shape="circle"` is checked the same way (a circle
 *             is only how the frame is drawn).
 *   Every engine  axe-core when installed (it is NOT a dependency of the kit): no ARIA-structure / name violation on the
 *             cropper; otherwise a "skipped" note.
 *
 * Run: npm run test:engines (or node test/engines/cropper-pan-a11y.spec.mjs)
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
const AXE_RULES = ['aria-required-children', 'aria-required-parent', 'aria-allowed-role', 'aria-allowed-attr',
  'aria-valid-attr-value', 'aria-command-name', 'aria-input-field-name', 'button-name', 'label'];

// Texts are read from the component (TdCropper.labels), never typed twice.
const SHOTS = [
  { id: 'pan', attrs: 'mode="pan"' },
  { id: 'circle', attrs: 'mode="pan" shape="circle"' },
  // control: box mode, focal tool on and a focal point set ⇒ the handles AND the focal point are in the tree
  { id: 'box', attrs: 'mode="box" focal-point focal=\'{"v":1,"x":0.5,"y":0.5}\'' },
];

const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><link rel="stylesheet" href="/td.css"></head><body>
<main style="width:720px">
${SHOTS.map((s) => `<td-cropper id="${s.id}" ${s.attrs} src="/test/fixtures/crop-16x9.svg" alt="Ảnh thử" natural-width="1600" natural-height="900"></td-cropper>`).join('\n')}
</main>
<script type="module">
  import '/src/form/td-cropper.js';
  await customElements.whenDefined('td-cropper');
  await Promise.all([...document.querySelectorAll('td-cropper')].map((el) => el.querySelector('[data-state="ready"]') || el.getAttribute('data-state') === 'ready'
    ? 0 : new Promise((r) => el.addEventListener('image-ready', r, { once: true }))));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__ready = true;
</script></body></html>`;

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

async function freshPage(browser) {
  const context = await browser.newContext({ viewport: { width: 900, height: 900 } });
  const page = await context.newPage();
  await page.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE });
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, '');
    if (rel.startsWith('..') || !(rel === 'td.css' || rel.startsWith('src/') || rel === 'test/fixtures/crop-16x9.svg')) {
      return route.fulfill({ status: 404, body: '' });
    }
    const file = join(ROOT, rel);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[rel.slice(rel.lastIndexOf('.'))] || 'text/plain', body: await readFile(file) });
  });
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => window.__ready === true);
  return { page, context };
}

/** DOM facts the ARIA snapshot does not print (all engines). */
const domFacts = (page, id) => page.evaluate((cid) => {
  const el = document.getElementById(cid);
  const L = customElements.get('td-cropper').labels;
  const text = (ids) => (ids || '').split(/\s+/).filter(Boolean).map((x) => document.getElementById(x)?.textContent ?? '\u0000missing').join(' ');
  const box = el.querySelector('.td-cropper__box');
  const input = el.querySelector('.td-cropper__zoom input[type="range"]');
  const radios = [...el.querySelectorAll('.td-cropper__ratios [role="radio"]')];
  return {
    L,
    state: el.getAttribute('data-state'),
    boxLabel: box.getAttribute('aria-label'),
    boxDesc: text(box.getAttribute('aria-describedby')),
    sliderLabel: input?.getAttribute('aria-label') ?? null,
    sliderBetween: (() => {
      const z = el.querySelector('.td-cropper__zoom');
      return z && z.previousElementSibling?.classList.contains('td-cropper__zoom-out')
        && z.nextElementSibling?.classList.contains('td-cropper__zoom-in');
    })(),
    sliderMin: input?.min, sliderMax: input?.max, sliderNow: input?.value,
    radios: radios.map((r) => `${r.getAttribute('aria-label') || r.textContent.trim()}:${r.getAttribute('aria-checked')}`),
    groupLabel: el.querySelector('[role="radiogroup"]').getAttribute('aria-label'),
  };
}, id);

/** Playwright ARIA model of one cropper (every engine). */
const snapshot = (page, id) => page.locator(`#${id}`).ariaSnapshot();

async function axe(page, id) {
  if (!existsSync(AXE)) return null;
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: await readFile(AXE, 'utf8') });
  return page.evaluate(async ([cid, rules]) => {
    const r = await window.axe.run(document.getElementById(cid), { runOnly: { type: 'rule', values: rules } });
    return r.violations.map((v) => `${v.id} (${v.nodes.length})`);
  }, [id, AXE_RULES]);
}

/** Chromium: the browser's own accessibility tree, ignored nodes dropped. */
async function axTree(context, page, id) {
  const cdp = await context.newCDPSession(page);
  const root = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.root.nodeId, selector: `#${id}` });
  const { node } = await cdp.send('DOM.describeNode', { nodeId });
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { backendNodeId: node.backendNodeId, fetchRelatives: false });
  // getPartialAXTree without relatives returns only the node itself; take the full tree and keep the cropper's subtree.
  const full = (await cdp.send('Accessibility.getFullAXTree')).nodes;
  const byId = new Map(full.map((n) => [n.nodeId, n]));
  const self = nodes[0];
  const start = full.find((n) => n.backendDOMNodeId === node.backendNodeId) || self;
  const out = [];
  const walk = (n) => {
    for (const cid of n.childIds || []) {
      const c = byId.get(cid);
      if (!c) continue;
      out.push(c);
      walk(c);
    }
  };
  if (start && byId.has(start.nodeId)) walk(start);
  const live = out.filter((n) => !n.ignored);
  const role = (n) => n.role?.value;
  const name = (n) => n.name?.value ?? '';
  const prop = (n, k) => n.properties?.find((p) => p.name === k)?.value?.value;
  return {
    live,
    role, name, prop,
    desc: (n) => n.description?.value ?? '',
    value: (n) => n.value?.value,
    byName: (r, nm) => live.filter((n) => role(n) === r && name(n) === nm),
    byRole: (r) => live.filter((n) => role(n) === r),
    size: live.length,
  };
}

const has = (snap, line) => snap.split('\n').some((l) => l.includes(line));

async function evidence(engine, page, context) {
  for (const { id } of SHOTS) {
    const tag = `${engine} [${id}]`;
    const pan = id !== 'box';
    const f = await domFacts(page, id);
    const L = f.L;
    const snap = await snapshot(page, id);
    if (process.env.TD_A11Y_DEBUG) console.log(`--- ${tag} ariaSnapshot\n${snap}`);
    const handleNames = [L.nw, L.ne, L.se, L.sw];

    check(`${tag} ready`, f.state === 'ready', String(f.state));
    // 1. frame
    check(`${tag} frame has a non-empty name`, !!f.boxLabel && f.boxLabel === L.box, String(f.boxLabel));
    check(`${tag} frame description holds the ${pan ? 'panHelp' : 'boxHelp'} sentence`,
      f.boxDesc.includes(pan ? L.panHelp : L.boxHelp) && (!pan || !f.boxDesc.includes(L.boxHelp)), f.boxDesc);
    check(`${tag} ARIA model: frame "${L.box}" is in the tree`, has(snap, `"${L.box}"`), snap);
    // 2. slider
    if (!pan) check(`${tag} control: box mode has no zoom slider`, f.sliderLabel === null && !snap.includes('slider'), snap);
    else check(`${tag} zoom slider: label + min/max/now, between − and +`,
      f.sliderLabel === L.zoom && f.sliderBetween && f.sliderMin !== '' && f.sliderMax !== '' && f.sliderNow !== ''
        && Number(f.sliderMax) > Number(f.sliderMin) && Number(f.sliderNow) >= Number(f.sliderMin) && Number(f.sliderNow) <= Number(f.sliderMax),
      JSON.stringify([f.sliderLabel, f.sliderBetween, f.sliderMin, f.sliderMax, f.sliderNow]));
    if (pan) check(`${tag} ARIA model: slider "${L.zoom}"`, has(snap, `slider "${L.zoom}"`), snap);
    // 3. handles + focal point: absent in pan, present in the box control
    for (const n of handleNames) {
      if (pan) check(`${tag} ARIA model: no handle "${n}"`, !has(snap, `"${n}"`), snap);
      else check(`${tag} ARIA model: handle "${n}" IS in the tree (control)`, has(snap, `"${n}"`), snap);
    }
    if (pan) check(`${tag} ARIA model: no focal-point group`, !has(snap, `group "${L.focalPoint}"`), snap);
    else check(`${tag} ARIA model: focal point IS in the tree (control)`, has(snap, `group "${L.focalPoint}"`), snap);
    // 4. buttons + ratios
    for (const n of [L.zoomOut, L.zoomIn, L.reset]) check(`${tag} ARIA model: button "${n}"`, has(snap, `button "${n}"`), snap);
    check(`${tag} ARIA model: radiogroup "${L.ratios}"`, has(snap, `radiogroup "${L.ratios}"`), snap);
    const want = pan ? '1:1' : 'free';
    const wantDom = pan ? '1:1' : 'Tự do';
    check(`${tag} ARIA model: exactly one radio checked (${wantDom})`,
      snap.split('\n').filter((l) => /radio "/.test(l) && /\[checked\]/.test(l)).length === 1
        && snap.split('\n').some((l) => l.includes(`radio "${wantDom}"`) && /\[checked\]/.test(l)), want + '\n' + snap);
    check(`${tag} DOM: ratio group named, only ${wantDom} checked`,
      f.groupLabel === L.ratios && f.radios.filter((r) => r.endsWith(':true')).length === 1 && f.radios.includes(`${wantDom}:true`),
      f.radios.join('|'));

    const v = await axe(page, id);
    if (v) check(`${tag} axe: no ARIA / name violation`, v.length === 0, v.join(', '));
    else if (id === 'pan') notes.push(`${engine}: axe-core not installed — skipped`);

    if (engine !== 'chromium') continue;
    const t = await axTree(context, page, id);
    notes.push(`${tag} AX: ${t.size} nodes exposed under the cropper`);
    // 1. frame in the real tree
    const frames = t.byName('group', L.box);
    check(`${tag} AX: one frame node "${L.box}" with a role`, frames.length === 1, JSON.stringify(t.live.map((n) => `${t.role(n)}:${t.name(n)}`)));
    if (frames[0]) {
      const fr = frames[0];
      const d = t.desc(fr);
      check(`${tag} AX: frame description holds ${pan ? 'panHelp' : 'boxHelp'}`, d.includes(pan ? L.panHelp : L.boxHelp), d);
      notes.push(`${tag} AX frame: role=${t.role(fr)} description=${JSON.stringify(d)}`);
    }
    // 2. slider
    const sl = t.byRole('slider');
    if (!pan) check(`${tag} AX: control has no slider`, sl.length === 0, String(sl.length));
    else check(`${tag} AX: exactly one slider named "${L.zoom}"`, sl.length === 1 && t.name(sl[0]) === L.zoom, JSON.stringify(sl.map((n) => t.name(n))));
    if (pan && sl[0]) {
      const mn = t.prop(sl[0], 'valuemin'); const mx = t.prop(sl[0], 'valuemax'); const now = t.value(sl[0]);
      check(`${tag} AX: slider has valuemin / valuemax / value`,
        mn !== undefined && mx !== undefined && now !== undefined && Number(mx) > Number(mn) && Number(now) >= Number(mn) && Number(now) <= Number(mx),
        JSON.stringify([mn, mx, now]));
    }
    // 3. handles + focal point
    const present = (nm) => t.live.filter((n) => t.name(n) === nm).length;
    for (const n of handleNames) {
      if (pan) check(`${tag} AX: no handle "${n}"`, present(n) === 0, String(present(n)));
      else check(`${tag} AX: handle "${n}" IS in the tree (control)`, present(n) === 1, String(present(n)));
    }
    const focalNodes = t.live.filter((n) => t.name(n) === L.focalPoint && t.role(n) === 'group');
    if (pan) check(`${tag} AX: no focal-point group`, focalNodes.length === 0, String(focalNodes.length));
    else check(`${tag} AX: focal-point group IS in the tree (control)`, focalNodes.length === 1, String(focalNodes.length));
    // 4. buttons + radios
    for (const n of [L.zoomOut, L.zoomIn, L.reset]) check(`${tag} AX: button "${n}"`, t.byName('button', n).length === 1, String(t.byName('button', n).length));
    check(`${tag} AX: radiogroup "${L.ratios}"`, t.byName('radiogroup', L.ratios).length === 1, '');
    const radios = t.byRole('radio');
    const checked = radios.filter((n) => t.prop(n, 'checked') === 'true');
    check(`${tag} AX: radios named, exactly one checked`,
      radios.length > 1 && radios.every((n) => t.name(n).length > 0) && checked.length === 1 && t.name(checked[0]) === (pan ? '1:1' : 'Tự do'),
      JSON.stringify(radios.map((n) => `${t.name(n)}:${t.prop(n, 'checked')}`)));
  }
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
    const { page, context } = await freshPage(browser);
    await evidence(name, page, context);
    await context.close();
  } catch (e) {
    failures.push(`${name}: ${e.message.split('\n').slice(0, 3).join(' | ')}`);
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
console.log(`Cropper pan accessibility: all ${checks} checks passed (chromium, firefox, webkit; pan + pan circle + box control).`);
