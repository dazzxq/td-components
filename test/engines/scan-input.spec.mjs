/**
 * <td-scan-input> with REAL input in Chromium, Firefox and WebKit (v0.38.0, plan v0.38.0-scan-input M2, review R1-5).
 * The web-test-runner engines test (src/form/td-v038-scan-input.engines.browser-test.js) covers the behaviour; this
 * spec covers what only Playwright's page API can produce:
 *
 *   batch      `keyboard.insertText(IMEI)` = ONE beforeinput / input carrying all characters (IME / DataWedge "send
 *              as string") + Enter → exactly one result, source `paste`, never `scanner` (QĐ 5a); manual="reject" →
 *              refused; `keyboard.type(IMEI, { delay: 0 })` → `scanner`. Firefox delivers insertText as an IME
 *              composition commit (compositionstart → insertCompositionText → compositionend): a commit of several
 *              characters counts as one batch insert, so the result is `paste` in every engine.
 *   ime        CHROMIUM ONLY: a real IME composition through CDP (`Input.imeSetComposition` + `Input.insertText`) — the
 *              Enter pressed while composing confirms nothing for the kit (no scan). Firefox / WebKit have no automated
 *              IME API: the synthetic composition contract runs in all three engines in the WTR test instead.
 *   beep       spy on AudioContext.prototype.createOscillator / OscillatorNode.start (no sound is measured): `beep` →
 *              ok 1 tone, error 2; `muted` / TdScanInput.muted → 0; the speaker button (aria-pressed, mute-change).
 *   refocus    refocus="always": a click on the page body → the focus comes back; a click on another <button> → never
 *              taken back; an open TdModal → never taken back.
 *   a11y       the polite region gets ONE batched message for 5 scans within 1 s; errors go to the assertive region;
 *              single mode aria-invalid.
 *   xss        a scanned `<b>` + a validate message `<img onerror>` → text only, no new element, no style attribute.
 *
 * Run: npm run test:engines   (test/engines/run.mjs runs every *.spec.mjs of this directory)
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
const IMEI = '356938035643809';

const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<link rel="stylesheet" href="${ORIGIN}/td.css">
<script type="module">
  import { TdScanInput } from '${ORIGIN}/src/form/td-scan-input.js';
  import { TdModal } from '${ORIGIN}/src/feedback/td-modal.js';
  window.TdScanInput = TdScanInput;
  window.TdModal = TdModal;
  window.__ready = true;
</script>
</head><body style="min-height: 100vh; margin: 0; padding: 24px">
<div id="mount"></div>
<p id="text">Văn bản trang</p>
<button type="button" id="other">Nút khác</button>
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

/** Mount one scan input (attributes) and record its events into window.__ev. */
async function mount(page, attrs) {
  await page.evaluate((a) => {
    window.__ev = [];
    const m = document.getElementById('mount');
    m.innerHTML = `<td-scan-input ${a}></td-scan-input>`;
    const el = m.firstElementChild;
    for (const t of ['scan', 'scan-invalid', 'scan-duplicate', 'mute-change']) {
      el.addEventListener(t, (e) => window.__ev.push({ type: t, ...e.detail }));
    }
    window.__el = el;
  }, attrs);
  await page.focus('td-scan-input input.td-scan__input');
}
const events = (page) => page.evaluate(() => window.__ev);
const waitEvents = (page, n) => page.waitForFunction((k) => window.__ev.length >= k, n, { timeout: 5000 });

/** Spy: count started oscillators. */
async function spyAudio(page) {
  await page.evaluate(() => {
    window.__osc = 0;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) { window.__noAudio = true; return; }
    const orig = Ctor.prototype.createOscillator;
    Ctor.prototype.createOscillator = function createOscillator(...a) {
      const o = orig.apply(this, a);
      const start = o.start.bind(o);
      o.start = (...s) => { window.__osc++; return start(...s); };
      return o;
    };
  });
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

    // --- batch (QĐ 5a) ---
    await mount(page, 'name="c"');
    await page.keyboard.insertText(IMEI);
    await page.keyboard.press('Enter');
    await waitEvents(page, 1);
    await page.waitForTimeout(50);
    let ev = await events(page);
    check(`${name} batch insertText + Enter: one result, source paste`, ev.length === 1 && ev[0].type === 'scan' && ev[0].source === 'paste', JSON.stringify(ev));

    await mount(page, 'name="c" manual="reject"');
    await page.keyboard.insertText(IMEI);
    await page.keyboard.press('Enter');
    await waitEvents(page, 1);
    ev = await events(page);
    check(`${name} batch + manual=reject: refused (pasteRejected)`, ev.length === 1 && ev[0].type === 'scan-invalid'
      && ev[0].source === 'paste', JSON.stringify(ev));

    await mount(page, 'name="c"');
    await page.keyboard.type(IMEI, { delay: 0 });
    await page.keyboard.press('Enter');
    await waitEvents(page, 1);
    ev = await events(page);
    check(`${name} keyboard.type delay 0: source scanner`, ev.length === 1 && ev[0].source === 'scanner', JSON.stringify(ev));

    // --- real IME (Chromium only) ---
    if (name === 'chromium') {
      await mount(page, 'name="c"');
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.imeSetComposition', { text: 'đ', selectionStart: 1, selectionEnd: 1 });
      const composing = await page.evaluate(() => window.__el._composing === true);
      await page.keyboard.press('Enter');
      await cdp.send('Input.insertText', { text: 'đ' });
      await page.waitForTimeout(80);
      ev = await events(page);
      check(`${name} IME: composition seen by the element`, composing);
      check(`${name} IME: Enter while composing → no scan`, ev.length === 0, JSON.stringify(ev));
      await page.keyboard.type('D12345', { delay: 0 });
      await page.keyboard.press('Enter');
      await waitEvents(page, 1);
      ev = await events(page);
      check(`${name} IME: the run after a composition is manual`, ev.length === 1 && ev[0].source === 'manual', JSON.stringify(ev));
      await cdp.detach();
    } else {
      notes.push(`${name}: no automated IME API — composition covered by the synthetic contract (WTR)`);
    }

    // --- beeps ---
    await spyAudio(page);
    const noAudio = await page.evaluate(() => !!window.__noAudio);
    if (noAudio) {
      notes.push(`${name}: no AudioContext — beep checks skipped`);
    } else {
      await mount(page, 'beep');
      await page.evaluate(() => { window.__el.validate = (v) => v !== 'BAD0001'; });
      await page.keyboard.type('OK00001', { delay: 0 });
      await page.keyboard.press('Enter');
      await waitEvents(page, 1);
      const okTones = await page.evaluate(() => window.__osc);
      await page.keyboard.type('BAD0001', { delay: 0 });
      await page.keyboard.press('Enter');
      await waitEvents(page, 2);
      const errTones = await page.evaluate(() => window.__osc) - okTones;
      check(`${name} beep: ok = 1 tone`, okTones === 1, String(okTones));
      check(`${name} beep: error = 2 tones`, errTones === 2, String(errTones));

      await mount(page, 'beep muted');
      await page.evaluate(() => { window.__osc = 0; });
      await page.keyboard.type('OK00002', { delay: 0 });
      await page.keyboard.press('Enter');
      await waitEvents(page, 1);
      check(`${name} beep muted → 0 tones`, await page.evaluate(() => window.__osc) === 0);

      await mount(page, 'beep');
      await page.evaluate(() => { window.__osc = 0; window.TdScanInput.muted = true; });
      await page.keyboard.type('OK00003', { delay: 0 });
      await page.keyboard.press('Enter');
      await waitEvents(page, 1);
      check(`${name} TdScanInput.muted → 0 tones`, await page.evaluate(() => window.__osc) === 0);
      await page.evaluate(() => { window.TdScanInput.muted = false; });

      await page.click('td-scan-input .td-scan__mute');
      const m = await page.evaluate(() => ({
        pressed: document.querySelector('.td-scan__mute').getAttribute('aria-pressed'),
        muted: window.__el.muted,
        ev: window.__ev.filter((e) => e.type === 'mute-change'),
      }));
      check(`${name} speaker button: aria-pressed + mute-change`, m.pressed === 'true' && m.muted && m.ev.length === 1 && m.ev[0].muted === true, JSON.stringify(m));
    }

    // --- refocus="always" ---
    await mount(page, 'refocus="always"');
    await page.mouse.click(600, 500); // empty page body
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => document.activeElement === window.__el.querySelector('input'));
    check(`${name} refocus always: a click on the body → focus back in the input`, back);
    await page.focus('td-scan-input input.td-scan__input');
    await page.click('#other');
    await page.waitForTimeout(300);
    const kept = await page.evaluate(() => document.activeElement !== window.__el.querySelector('input'));
    check(`${name} refocus always: a click on another button → never taken back`, kept);
    await page.focus('td-scan-input input.td-scan__input');
    await page.evaluate(() => {
      const b = document.createElement('p');
      b.textContent = 'Hộp thoại';
      window.TdModal.show({ title: 'Hộp thoại', body: b, showFooter: false });
    });
    await page.waitForFunction(() => document.querySelector('.td-modal')?.getAttribute('data-state') === 'open');
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(300);
    const underModal = await page.evaluate(() => document.activeElement !== window.__el.querySelector('input'));
    check(`${name} refocus always: modal open → never taken back`, underModal);
    await page.evaluate(() => window.TdModal.closeAll?.());
    await page.waitForTimeout(100);
    await context.close();

    // --- a11y: one batched polite message for 5 scans; errors assertive ---
    {
      const { page: p2, context: c2 } = await freshPage(browser);
      await mount(p2, 'multiple name="c[]"');
      await p2.evaluate(() => {
        window.__polite = [];
        const live = window.__el.querySelector('[role="status"]');
        new MutationObserver(() => { if (live.textContent) window.__polite.push(live.textContent); })
          .observe(live, { childList: true, characterData: true, subtree: true });
      });
      for (let i = 1; i <= 5; i++) {
        await p2.keyboard.type(`CODE000${i}`, { delay: 0 });
        await p2.keyboard.press('Enter');
      }
      await waitEvents(p2, 5);
      await p2.waitForTimeout(1200);
      const polite = await p2.evaluate(() => window.__polite);
      check(`${name} a11y: one batched polite message for 5 scans`, polite.length === 1 && /5/.test(polite[0]), JSON.stringify(polite));
      await mount(p2, 'name="c" manual="reject"');
      await p2.keyboard.type('A', { delay: 0 });
      await p2.waitForTimeout(200);
      await p2.keyboard.type('BCD', { delay: 200 });
      await p2.keyboard.press('Enter');
      await waitEvents(p2, 1);
      const a = await p2.evaluate(() => ({
        alert: window.__el.querySelector('[aria-live="assertive"]').textContent,
        invalid: window.__el.querySelector('input').getAttribute('aria-invalid'),
      }));
      check(`${name} a11y: the error goes to the assertive region; aria-invalid`, a.alert.includes('máy quét') && a.invalid === 'true', JSON.stringify(a));

      // --- XSS ---
      await mount(p2, 'multiple name="c[]"');
      await p2.evaluate(() => {
        window.__pwned = undefined;
        window.__el.validate = () => '<img src=x onerror="window.__pwned=1">';
      });
      await p2.keyboard.type('<b>x</b>', { delay: 0 });
      await p2.keyboard.press('Enter');
      await waitEvents(p2, 1);
      await p2.waitForTimeout(50);
      const x = await p2.evaluate(() => ({
        el: !!window.__el.querySelector('img, b'),
        style: !!window.__el.querySelector('[style]'),
        pwned: window.__pwned,
        value: window.__el.querySelector('.td-scan__value').textContent,
        state: window.__el.querySelector('.td-scan__state').textContent,
      }));
      check(`${name} xss: text only, no element, no style`, !x.el && !x.style && x.pwned === undefined && x.value === '<b>x</b>'
        && x.state.includes('<img'), JSON.stringify(x));
      await c2.close();
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
console.log(`Scan input engines: all ${checks} checks passed (chromium, firefox, webkit).`);
