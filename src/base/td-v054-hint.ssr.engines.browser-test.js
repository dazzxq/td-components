import { expect } from '@esm-bundle/chai';
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
// NO static import of the components: they are defined LATE (dynamic imports below), after the pre-upgrade checks.

// v0.54.0 (plan docs/internal/plans/v0.54.0-hint.md QĐ 3, 10–12, Codex plan-review r2 #13) — helper_text printed by every
// td_* form helper is adopted IN PLACE (the server note node is kept) in Chromium, Firefox AND WebKit; the description
// follows the component's rules after the upgrade (note in / out with the error, the toggle's current state text);
// td_hint links itself to the site's control without duplicating the id the site printed. The markup is EXACTLY what
// php/td.php prints for test/ssr/hint.fixtures.json: test/ssr/fixtures/hint.html (`node test/ssr/build-hint-fixture.mjs`).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
document.addEventListener('submit', (e) => e.preventDefault(), true);

const SPEC = await (await fetch('/test/ssr/hint.fixtures.json')).json();
const FIXTURE = await (await fetch('/test/ssr/fixtures/hint.html')).text();
const root = document.createElement('div');
root.innerHTML = FIXTURE;
document.body.appendChild(root);

const caseEl = (id) => document.querySelector(`.ssr-case[data-case="${id}"]`);
const hostOf = (c) => document.getElementById(c.host);
const noteId = (c) => c.note ?? `${c.host}-note`;
const tokens = (el) => (el?.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
const rel = (el, host) => {
  const r = el.getBoundingClientRect();
  const h = host.getBoundingClientRect();
  return { x: r.x - h.x, y: r.y - h.y, w: r.width, h: r.height };
};

// ------------------------------------------------------------------ BEFORE define --------------------------------------
for (const c of SPEC.cases) expect(customElements.get(c.tag), c.tag).to.equal(undefined);
const B = {};
for (const c of SPEC.cases) {
  const note = c.noHelp ? null : document.getElementById(noteId(c));
  B[c.id] = { note, noteBox: note && !note.hidden ? rel(note, hostOf(c)) : null };
}
// Codex r2 #13: before the upgrade (and without JS) the state text is never wired — a click flips the native switch, the
// CSS shows the other text, the description has no stale state id
const tgInput = document.getElementById('h-tg');
const tgBefore = tokens(tgInput);
tgInput.click();
const tgAfterClick = { checked: tgInput.checked, tokens: tokens(tgInput),
  on: getComputedStyle(document.getElementById('h-tg-host-on')).visibility,
  off: getComputedStyle(document.getElementById('h-tg-host-off')).visibility };
const hintsBefore = SPEC.hints.map((h) => tokens(caseEl(h.id).querySelector(`#${h.args[0]}`)));

// ------------------------------------------------------------------ upgrade --------------------------------------------
await Promise.all([
  import('../form/td-input-field.js'), import('../form/td-number-input.js'), import('../form/td-choice-group.js'),
  import('../form/td-media-field.js'), import('../form/td-media-gallery.js'), import('../form/td-dropdown.js'),
  import('../form/td-chip-input.js'), import('../form/td-tree-select.js'), import('../form/td-toggle.js'),
  import('../form/td-checkbox.js'), import('../form/td-otp-input.js'), import('../form/td-scan-input.js'),
  import('../form/td-color-picker.js'), import('../form/td-datetime-range.js'), import('../form/td-check-matrix.js'),
  import('../form/td-hint.js'),
]);
await new Promise((r) => setTimeout(r, 50));

describe('v0.54.0 SSR — helper_text adopted in place, every form helper', () => {
  for (const c of SPEC.cases) {
    it(`${c.id} (${c.tag})`, () => {
      const el = hostOf(c);
      expect(!!el && el.matches(':defined'), 'upgraded').to.equal(true);
      if (c.hydrated) expect(el._hydrated === true, `${c.id}: adopted in place (no safe render)`).to.equal(true);
      if (c.noHelp) return;
      const note = document.getElementById(noteId(c));
      expect(!!note, 'note').to.equal(true);
      if (c.hydrated) expect(note === B[c.id].note, `${c.id}: the server note node is kept`).to.equal(true);
      expect(note.textContent).to.equal(c.text ?? c.args[c.args.length - 1].helper_text);
      const t = tokens(el._ariaTarget());
      if (c.siteDesc) expect(t[0], `${c.id}: the caller's id kept first`).to.equal(c.siteDesc);
      if (c.error) {
        expect(note.hidden, 'hidden with the error').to.equal(true);
        expect(t).to.not.include(noteId(c));
        expect(t).to.include(`${c.host}-error`);
      } else {
        expect(note.hidden).to.equal(false);
        expect(t.filter((x) => x === noteId(c)).length, `${c.id}: the note once in the description`).to.equal(1);
        if (c.hydrated && !c.boxChanges) {
          const now = rel(note, el); // relative to the host: an earlier case may change height on upgrade (ADR 0025 exceptions)
          expect(['x', 'y', 'w', 'h'].every((k) => Math.abs(now[k] - B[c.id].noteBox[k]) <= 1), `${c.id}: note box kept ${JSON.stringify(now)} vs ${JSON.stringify(B[c.id].noteBox)}`).to.equal(true);
        }
      }
      const ids = [...el.querySelectorAll('[id]')].map((x) => x.id);
      expect(ids.length).to.equal(new Set(ids).size);
    });
  }

  it('td_toggle on_text / off_text: no state id before the upgrade; after it, the CURRENT state id (the pre-upgrade click)', () => {
    expect(tgBefore.some((x) => /-(on|off)$/.test(x))).to.equal(false);
    expect(tgAfterClick.checked).to.equal(true);
    expect(tgAfterClick.tokens.some((x) => /-(on|off)$/.test(x)), 'no stale state id after a no-JS click').to.equal(false);
    expect(tgAfterClick.on).to.equal('visible');
    expect(tgAfterClick.off).to.equal('hidden');
    const el = document.getElementById('h-tg-host');
    expect(el.checked, 'the live state (clicked before the upgrade)').to.equal(true);
    expect(tokens(el._ariaTarget())).to.deep.equal(['h-tg-host-on', 'h-tg-host-note']);
    const cell = document.getElementById('h-tc-host');
    expect(tokens(cell._ariaTarget())).to.deep.equal(['h-tc-host-on']);
    el._ariaTarget().click();
    expect(tokens(el._ariaTarget())).to.deep.equal(['h-tg-host-off', 'h-tg-host-note']);
  });

  it('td_hint: the id the site printed is not duplicated; text / trusted markup kept as nodes', () => {
    SPEC.hints.forEach((h, i) => {
      const control = caseEl(h.id).querySelector(`#${h.args[0]}`);
      expect(hintsBefore[i]).to.deep.equal([`${h.args[0]}-hint`]);
      expect(tokens(control)).to.deep.equal([`${h.args[0]}-hint`]);
      expect(caseEl(h.id).querySelector('td-hint').control === control, 'linked').to.equal(true);
    });
    expect(caseEl('hint-text').querySelector('td-hint b')).to.equal(null);
    expect(caseEl('hint-text').querySelector('td-hint').textContent).to.equal('Xem <b>quy định</b> & điều khoản');
    expect(caseEl('hint-html').querySelector('td-hint a')?.getAttribute('href')).to.equal('/quy-dinh');
  });
});
