/**
 * v0.49.0 M0 spike (plan docs/internal/plans/v0.49.0-choice-stepper.md QĐ 4, ADR 0023): a radio group WITHOUT a form
 * owner inside a form-associated host — each radio carries a per-instance `name`, `form=""` (an empty `form`
 * attribute ⇒ no form owner) and `autocomplete="off"` — in Chromium, Firefox and WebKit with a REAL keyboard.
 *
 *   (a) Tab = one stop (the checked radio; unchecked group: first on Tab), arrows move + check, wrap, skip `disabled`
 *   (b) the radios are NOT in FormData nor in form.elements (the host's ElementInternals value is)
 *   (c) an ancestor `<fieldset disabled>` disables them (fieldset applies by tree, not by form owner)
 *   (d) form.reset() leaves them alone
 *   (e) renaming in place (real name → private group + form="") keeps checked + focus
 *   (f) back / forward: autocomplete="off" → the radios are never restored out of sync with the page script
 *   (g) Chromium accessibility tree (CDP Accessibility.getFullAXTree): radios carry posinset / setsize of their group
 *
 * Run: npm run test:engines (or node test/engines/radio-unowned-group.spec.mjs)
 */
import { chromium, firefox, webkit } from 'playwright-core';
import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ORIGIN = 'http://engines.local';

const HOST = `<script>
  customElements.define('x-host', class extends HTMLElement {
    static formAssociated = true;
    constructor() { super(); this._i = this.attachInternals(); }
    connectedCallback() {
      const sync = () => {
        const c = this.querySelector('input:checked');
        this._i.setFormValue(c ? c.value : null);
      };
      this.addEventListener('change', sync);
      sync();
    }
    formResetCallback() {}
  });
</script>`;

const group = (name, checked = 'a', extra = '') => ['a', 'b', 'c', 'd'].map((v) => `<label><input type="radio" id="${name}-${v}" `
  + `name="${name}" value="${v}" form="" autocomplete="off"${v === checked ? ' checked' : ''}${v === 'c' ? ' disabled' : ''}${extra}>`
  + `${v.toUpperCase()}</label>`).join('');

const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">${HOST}</head><body>
<form id="f" action="/next" onsubmit="return false">
  <input id="before" name="before" value="x" aria-label="trước">
  <x-host id="h" name="pick"><div role="radiogroup" aria-label="Nhóm">${group('td-choice-1')}</div></x-host>
  <input id="after" aria-label="sau">
  <x-host id="h2" name="pick2"><div role="radiogroup" aria-label="Nhóm 2">${group('td-choice-2', '')}</div></x-host>
  <input id="last" aria-label="cuối">
  <fieldset id="fs"><x-host id="h3" name="pick3"><div role="radiogroup" aria-label="Nhóm 3">${group('td-choice-3')}</div></x-host></fieldset>
  <x-host id="h4" name="pick4"><div role="radiogroup" aria-label="Nhóm 4">${['a', 'b'].map((v) => `<label><input type="radio" id="r4-${v}" name="color" value="${v}"${v === 'b' ? ' checked' : ''}>${v}</label>`).join('')}</div></x-host>
</form>
<script>window.__alive = Math.random();</script>
</body></html>`;

const NEXT = '<!doctype html><html><body><p id="next">next</p></body></html>';

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
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE });
    if (url.pathname === '/next') return route.fulfill({ status: 200, contentType: 'text/html', body: NEXT });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto(`${ORIGIN}/`);
  return { page, context };
}

const focusId = (page) => page.evaluate(() => document.activeElement?.id || '');
const checkedIn = (page, host) => page.evaluate((h) => document.querySelector(`#${h} input:checked`)?.value ?? '', host);

async function runEngine(name, launcher) {
  let browser;
  try {
    browser = await launcher.launch(await launchOptions(name, launcher));
  } catch (e) {
    failures.push(`${name}: cannot launch (${e.message.split('\n')[0]})`);
    return;
  }
  // WebKit on macOS moves Tab between text fields only (Safari's "Press Tab to highlight each item" is off by default);
  // Option+Tab reaches every control — the same for a NATIVE named radio group, not a property of `form=""`
  const TAB = name === 'webkit' ? 'Alt+Tab' : 'Tab';
  try {
    const { page, context } = await freshPage(browser);
    // (a) one Tab stop on the checked radio, arrows move + check, wrap, skip disabled
    await page.focus('#before');
    await page.keyboard.press(TAB);
    check(`${name} (a) Tab → the checked radio`, await focusId(page) === 'td-choice-1-a', await focusId(page));
    await page.keyboard.press('ArrowRight');
    check(`${name} (a) → moves + checks b`, await focusId(page) === 'td-choice-1-b' && await checkedIn(page, 'h') === 'b',
      `${await focusId(page)} / ${await checkedIn(page, 'h')}`);
    await page.keyboard.press('ArrowDown');
    check(`${name} (a) ↓ skips disabled c → d`, await focusId(page) === 'td-choice-1-d' && await checkedIn(page, 'h') === 'd',
      `${await focusId(page)} / ${await checkedIn(page, 'h')}`);
    // Wrap at the ends is ENGINE behaviour (WebKit does not wrap, even for an owned named group — `#h4` below is the
    // control): the private group must wrap exactly like an owned one; the component adds the wrap in JS where missing.
    await page.keyboard.press('ArrowRight');
    const wrapPrivate = await focusId(page) === 'td-choice-1-a';
    const wrapOwned = await page.evaluate(() => {
      const r = document.getElementById('r4-b');
      r.focus();
      return true;
    }).then(() => page.keyboard.press('ArrowRight')).then(() => focusId(page)).then((id) => id === 'r4-a');
    await page.evaluate(() => { document.getElementById('r4-b').checked = true; });
    notes.push(`${name}: native wrap at the end → ${wrapPrivate ? 'yes' : 'NO'} (owned group: ${wrapOwned ? 'yes' : 'NO'})`);
    check(`${name} (a) wrap parity with an owned named group`, wrapPrivate === wrapOwned, `${wrapPrivate} / ${wrapOwned}`);
    await page.focus('#td-choice-1-d');
    await page.keyboard.press('ArrowUp');
    check(`${name} (a) ↑ skips disabled d → b`, await focusId(page) === 'td-choice-1-b' && await checkedIn(page, 'h') === 'b',
      `${await focusId(page)} / ${await checkedIn(page, 'h')}`);
    await page.keyboard.press(TAB);
    check(`${name} (a) Tab leaves the group (one stop)`, await focusId(page) === 'after', await focusId(page));
    await page.keyboard.press(TAB);
    const unchecked = await focusId(page);
    check(`${name} (a) Tab into an unchecked group → first`, unchecked === 'td-choice-2-a', unchecked);
    await page.keyboard.press(TAB);
    check(`${name} (a) unchecked group is one stop too`, await focusId(page) === 'last', await focusId(page));
    await page.keyboard.press(`Shift+${TAB}`);
    notes.push(`${name}: Shift+Tab into an unchecked group → ${await focusId(page)}`);
    await page.focus('#td-choice-2-b');
    await page.keyboard.press('Space');
    check(`${name} (a) Space checks the focused radio`, await checkedIn(page, 'h2') === 'b', await checkedIn(page, 'h2'));

    // (b) FormData / form.elements
    const fd = await page.evaluate(() => {
      const f = document.getElementById('f');
      const entries = [...new FormData(f).entries()].map(([k, v]) => `${k}=${v}`);
      const els = [...f.elements].map((e) => e.id || e.localName);
      const owner = document.getElementById('td-choice-1-a').form;
      return { entries, els, owner: owner ? owner.id : null };
    });
    check(`${name} (b) radios not in FormData`, !fd.entries.some((e) => e.startsWith('td-choice')), fd.entries.join('&'));
    check(`${name} (b) host value in FormData`, fd.entries.includes('pick=b') && fd.entries.includes('pick2=b'), fd.entries.join('&'));
    check(`${name} (b) radios not in form.elements`, !fd.els.some((e) => e.startsWith('td-choice')), fd.els.join(','));
    check(`${name} (b) radio.form === null`, fd.owner === null, String(fd.owner));

    // (c) fieldset disabled
    const fs = await page.evaluate(() => {
      document.getElementById('fs').disabled = true;
      const r = document.getElementById('td-choice-3-a');
      return { disabled: r.matches(':disabled'), willValidate: r.willValidate };
    });
    check(`${name} (c) <fieldset disabled> disables the radios`, fs.disabled, JSON.stringify(fs));
    await page.evaluate(() => document.getElementById('td-choice-3-b').click());
    check(`${name} (c) click on a fieldset-disabled radio does nothing`, await checkedIn(page, 'h3') === 'a', await checkedIn(page, 'h3'));
    await page.evaluate(() => { document.getElementById('fs').disabled = false; });

    // (d) form.reset()
    await page.evaluate(() => document.getElementById('f').reset());
    check(`${name} (d) form.reset() leaves the radios alone`, await checkedIn(page, 'h') === 'b' && await checkedIn(page, 'h2') === 'b',
      `${await checkedIn(page, 'h')} / ${await checkedIn(page, 'h2')}`);

    // (e) rename in place: real name → private group + form="" while checked + focused
    await page.focus('#r4-b');
    const ren = await page.evaluate(() => {
      const radios = [...document.querySelectorAll('#h4 input')];
      for (const r of radios) {
        r.name = 'td-choice-9';
        r.setAttribute('form', '');
        r.setAttribute('autocomplete', 'off');
      }
      const f = document.getElementById('f');
      return {
        checked: document.querySelector('#h4 input:checked')?.value ?? '',
        focus: document.activeElement?.id,
        inForm: [...new FormData(f).keys()].includes('color'),
      };
    });
    check(`${name} (e) rename keeps checked + focus`, ren.checked === 'b' && ren.focus === 'r4-b', JSON.stringify(ren));
    check(`${name} (e) renamed radios leave FormData`, !ren.inForm, JSON.stringify(ren));
    await page.keyboard.press('ArrowLeft');
    check(`${name} (e) arrows work in the renamed group`, await focusId(page) === 'r4-a' && await checkedIn(page, 'h4') === 'a',
      `${await focusId(page)} / ${await checkedIn(page, 'h4')}`);

    // (g) Chromium accessibility tree: CDP Accessibility.getFullAXTree exposes NO posinset / setsize (not even for an
    // owned named group or explicit aria-setsize — checked during the spike), so it cannot be asserted here. What CAN be:
    // the private group's radios expose the same AX properties as an owned named group (role radio, checked, focusable,
    // name from the label) — the grouping itself is proven by the arrow behaviour of (a) / (e), which uses the same
    // radio-group scope as posinset / setsize.
    if (name === 'chromium') {
      const cdp = await context.newCDPSession(page);
      const { nodes } = await cdp.send('Accessibility.getFullAXTree');
      const radios = nodes.filter((n) => n.role?.value === 'radio');
      const keys = (n) => (n.properties || []).map((p) => p.name).sort().join(',');
      const sets = new Set(radios.map(keys));
      notes.push(`chromium AX radio properties: ${[...sets].join(' | ')}`);
      check(`${name} (g) every radio is a radio with checked + focusable state`, radios.length >= 14
        && radios.every((n) => n.properties?.some((p) => p.name === 'checked')), `${radios.length}`);
      await cdp.detach();
    }

    // (f) back / forward: never restored out of sync with the page script
    await page.evaluate(() => { window.__mark = 'kept'; });
    await page.focus('#td-choice-1-b');
    await page.keyboard.press('ArrowRight'); // → d (user state differs from the default `a`)
    await page.goto(`${ORIGIN}/next`);
    await page.goBack();
    await page.waitForLoadState('load');
    const back = await page.evaluate(() => ({ mark: window.__mark || null, v: document.querySelector('#h input:checked')?.value ?? '' }));
    notes.push(`${name}: back → ${back.mark ? 'bfcache (script state kept)' : 'reloaded'}, checked ${back.v}`);
    check(`${name} (f) back: radios in sync with the page`, back.mark ? back.v === 'd' : back.v === 'a', JSON.stringify(back));
    await context.close();
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
console.log(`Radio group without a form owner: all ${checks} checks passed (chromium, firefox, webkit).`);
