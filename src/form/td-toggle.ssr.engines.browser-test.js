import { expect } from '@esm-bundle/chai';
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
// NO static import of the component: <td-toggle> is defined LATE (dynamic import below), after the pre-upgrade checks.

// v0.52.0 (plan docs/internal/plans/v0.52.0-toggle-tone-segmented.md M5, QĐ 10, Codex plan-review r1 #2) — td_toggle()
// with tone / status_text / locked / locked_reason (contract toggle@1, additive parts) hydrated in place in Chromium,
// Firefox AND WebKit. The markup is EXACTLY what php/td.php prints for test/ssr/toggle.fixtures.json:
// test/ssr/fixtures/toggle.html (`node test/ssr/build-toggle-fixture.mjs`, kept fresh by test/php/td-v052-php.test.js).
//
// Documented limitation, VERIFIED here (not a bug): before the module upgrades (and forever without JS) the control is a
// native checkbox — an external <label for> (and Space) still flips a LOCKED switch; only the mouse / touch on the switch
// itself is stopped (`pointer-events: none` under `@media (scripting: enabled)`). The server must ignore changes of a
// locked field. After the upgrade the same click does nothing.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const SPEC = await (await fetch('/test/ssr/toggle.fixtures.json')).json();
const FIXTURE = await (await fetch('/test/ssr/fixtures/toggle.html')).text();
const root = document.createElement('div');
root.innerHTML = FIXTURE;
document.body.appendChild(root);

const formOf = (id) => document.querySelector(`form[data-case="${id}"]`);
const hostOf = (id) => formOf(id).querySelector('td-toggle');
const inputOf = (id) => hostOf(id).querySelector('input[type="checkbox"]');
const entries = (id) => [...new FormData(formOf(id)).entries()].map(([k, v]) => `${k}=${v}`);
const describedText = (id) => (inputOf(id).getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
  .map((x) => document.getElementById(x)?.textContent ?? `#${x}?`).join(' ');
const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
const near = (a, b) => ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) < 0.01);
const settle = (el) => { for (const a of el.getAnimations({ subtree: true })) if (a instanceof CSSTransition) a.finish(); };
function tokenColor(name) {
  const p = document.createElement('span');
  p.style.color = `var(${name})`; // test-only CSSOM probe
  document.body.appendChild(p);
  const c = getComputedStyle(p).color;
  p.remove();
  return c;
}
const colours = (id) => {
  settle(hostOf(id));
  const h = hostOf(id);
  return { track: getComputedStyle(h.querySelector('.td-switch__track')).backgroundColor,
    thumb: getComputedStyle(h.querySelector('.td-switch__thumb')).backgroundColor };
};

// ------------------------------------------------------------------ BEFORE define --------------------------------------
expect(customElements.get('td-toggle')).to.equal(undefined);
const B = {};
for (const c of SPEC.cases) {
  const host = hostOf(c.id);
  B[c.id] = {
    input: inputOf(c.id),
    host: rect(host),
    control: rect(host.querySelector('.td-switch')),
    colours: colours(c.id),
    description: describedText(c.id),
    readonly: inputOf(c.id).getAttribute('aria-readonly'),
    pointer: getComputedStyle(host.querySelector('.td-switch')).pointerEvents,
    lockShown: host.querySelector('.td-switch__icon--lock') ? getComputedStyle(host.querySelector('.td-switch__icon--lock')).opacity : null,
    formData: entries(c.id),
  };
}
// the documented limitation: an external <label for> flips the native checkbox of a LOCKED switch before the upgrade
const ext = formOf('t-locked-off').querySelector('.ext-label');
ext.click();
const preUpgradeFlip = inputOf('t-locked-off').checked;
ext.click(); // put back
const preUpgradeBack = inputOf('t-locked-off').checked;

// ------------------------------------------------------------------ define ---------------------------------------------
await import('./td-toggle.js');
await customElements.whenDefined('td-toggle');
await new Promise((r) => setTimeout(r, 30));

describe('td-toggle SSR v0.52 — before the upgrade (toggle@1 + tone / lock parts)', () => {
  it('the server markup already carries the colours, icons, descriptions and aria-readonly', () => {
    for (const c of SPEC.cases) {
      const b = B[c.id];
      expect(b.description, c.id).to.equal(c.expect.description);
      expect(b.readonly, c.id).to.equal(c.expect.locked ? 'true' : null);
      if (c.expect.track) expect(b.colours.track, c.id).to.equal(tokenColor(c.expect.track));
      if (c.expect.locked) expect(b.lockShown, c.id).to.equal('1');
    }
  });

  it('locked before the upgrade: pointer-events none on the switch (scripting: enabled) — but the external label still flips it', () => {
    for (const c of SPEC.cases) expect(B[c.id].pointer, c.id).to.equal(c.expect.locked ? 'none' : 'auto');
    expect(preUpgradeFlip).to.equal(true); // documented limitation (server must ignore changes of a locked field)
    expect(preUpgradeBack).to.equal(false);
  });

  it('FormData before the upgrade = the native form', () => {
    for (const c of SPEC.cases) if (c.expect.formData) expect(B[c.id].formData, c.id).to.deep.equal(c.expect.formData);
  });
});

describe('td-toggle SSR v0.52 — adopted in place', () => {
  it('same input node, marker consumed, no layout shift, same colours', () => {
    for (const c of SPEC.cases) {
      const host = hostOf(c.id);
      expect(inputOf(c.id) === B[c.id].input, `${c.id} same node`).to.equal(true);
      expect(host.hasAttribute('data-td-ssr'), c.id).to.equal(false);
      expect(near(rect(host), B[c.id].host), `${c.id} host`).to.equal(true);
      expect(near(rect(host.querySelector('.td-switch')), B[c.id].control), `${c.id} control`).to.equal(true);
      expect(colours(c.id), c.id).to.deep.equal(B[c.id].colours);
    }
  });

  it('state: checked, icon, description text exact, aria-readonly; texts are text', () => {
    for (const c of SPEC.cases) {
      const host = hostOf(c.id);
      expect(host.checked, c.id).to.equal(c.expect.checked);
      expect(host.querySelector('.td-switch__icon--on').getAttribute('data-td-icon'), c.id).to.equal(c.expect.icon);
      expect(host.querySelector('.td-switch__icon--on svg')?.getAttribute('data-icon'), c.id).to.equal(c.expect.icon);
      expect(describedText(c.id), c.id).to.equal(c.expect.description);
      expect(inputOf(c.id).getAttribute('aria-readonly'), c.id).to.equal(c.expect.locked ? 'true' : null);
      for (const s of host.querySelectorAll(':scope > .td-sr-only')) expect(s.children.length, c.id).to.equal(0);
    }
    expect(document.querySelector('script:not([src])[data-x], img[src="x"]')).to.equal(null);
  });

  it('after the upgrade the external label no longer flips the locked switch; FormData keeps the locked value', () => {
    ext.click();
    expect(inputOf('t-locked-off').checked).to.equal(false);
    expect(hostOf('t-locked-off').checked).to.equal(false);
    expect(entries('t-locked')).to.deep.equal(['tfa4=1']);
    inputOf('t-locked').click();
    expect(hostOf('t-locked').checked).to.equal(true);
    for (const c of SPEC.cases) {
      if (c.expect.locked) expect(getComputedStyle(hostOf(c.id).querySelector('.td-switch')).pointerEvents, c.id).to.equal('auto');
    }
  });

  it('a hydrated tone switch turned OFF then ON by code: the status description follows (server ids are the component\'s)', async () => {
    const h = hostOf('t-warn');
    h.checked = false;
    await new Promise((r) => setTimeout(r));
    expect(inputOf('t-warn').hasAttribute('aria-describedby')).to.equal(false);
    h.checked = true;
    await new Promise((r) => setTimeout(r));
    expect(describedText('t-warn')).to.equal('Chờ người dùng quét mã QR khi đăng nhập');
  });
});
