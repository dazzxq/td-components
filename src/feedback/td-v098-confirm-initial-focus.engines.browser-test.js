// v0.98.0 (plan docs/internal/plans/v0.98.0-confirm-initial-focus.md) — TdModal.confirm({ initialFocus }) in Chromium,
// Firefox AND WebKit with real keys (sendKeys). DOM nodes are compared as booleans (a failing chai assertion carrying
// DOM nodes hangs the runner). Waits are signals (state / focus / promise), never fixed sleeps.
import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdModal } from './td-modal.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const frames = (n = 2) => new Promise((r) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); });
const until = async (fn, ms = 5000) => {
  const t0 = performance.now();
  while (!fn()) { if (performance.now() - t0 > ms) throw new Error('timeout'); await frames(1); }
};
const top = () => [...document.querySelectorAll('body > .td-modal:not([data-state="closing"])')].pop() || null;
const track = (p) => {
  const s = { done: false, value: undefined };
  p.then((v) => { s.done = true; s.value = v; });
  return s;
};
async function opened(p) {
  const root = top();
  await until(() => root.getAttribute('data-state') === 'open');
  await frames(3);
  const [cancel, confirm] = root.querySelectorAll('.td-modal__footer button');
  return { root, cancel, confirm, state: track(p) };
}
const focused = (el) => document.activeElement === el;

let opener = null;
afterEach(async () => {
  TdModal.closeAll();
  if (opener) { opener.remove(); opener = null; }
  await frames(2);
});

describe('v0.98.0 TdModal.confirm initialFocus', () => {
  it('default → Cancel has the first focus', async () => {
    const { cancel } = await opened(TdModal.confirm({ message: 'x' }));
    await until(() => focused(cancel));
    expect(focused(cancel)).to.equal(true);
  });

  it("'confirm' → Confirm has the first focus; a fresh Enter confirms", async () => {
    const p = TdModal.confirm({ message: 'x', initialFocus: 'confirm' });
    const { confirm, state } = await opened(p);
    await until(() => focused(confirm));
    await sendKeys({ press: 'Enter' });
    await until(() => state.done);
    expect(state.value).to.equal(true);
  });

  it("typeToConfirm beats 'confirm' (and the default): the field has the first focus", async () => {
    const { root } = await opened(TdModal.confirm({ message: 'x', typeToConfirm: 'XOA', initialFocus: 'confirm' }));
    const input = root.querySelector('.td-modal__confirm-field input');
    await until(() => focused(input));
    expect(focused(input)).to.equal(true);
  });

  for (const bad of ['Confirm', 'CONFIRM', 1, null, true, '']) {
    it(`invalid initialFocus ${JSON.stringify(bad)} → Cancel`, async () => {
      const { cancel } = await opened(TdModal.confirm({ message: 'x', initialFocus: bad }));
      await until(() => focused(cancel));
      expect(focused(cancel)).to.equal(true);
    });
  }

  it('a held Enter that opened the dialog does not confirm (auto-repeat on Confirm ignored); a fresh press does', async () => {
    opener = document.createElement('button');
    opener.textContent = 'Next step';
    document.body.append(opener);
    let p = null;
    opener.addEventListener('click', () => { p = TdModal.confirm({ message: 'x', initialFocus: 'confirm' }); });
    opener.focus();
    await sendKeys({ down: 'Enter' }); // keydown → click on the opener → the dialog opens
    await until(() => p !== null);
    const { confirm, state } = await opened(p);
    await until(() => focused(confirm));
    await sendKeys({ down: 'Enter' }); // still held: repeat keydown, now on Confirm
    await sendKeys({ down: 'Enter' });
    await sendKeys({ up: 'Enter' });
    await frames(3);
    expect(state.done).to.equal(false);
    await sendKeys({ press: 'Enter' });
    await until(() => state.done);
    expect(state.value).to.equal(true);
  });

  it('a Space pressed on an opener that opens on keydown, released on Confirm, does not confirm', async () => {
    opener = document.createElement('button');
    opener.textContent = 'Next step';
    document.body.append(opener);
    let p = null;
    opener.addEventListener('keydown', (e) => {
      if (e.key !== ' ') return;
      e.preventDefault();
      p = TdModal.confirm({ message: 'x', initialFocus: 'confirm' });
    });
    opener.focus();
    await sendKeys({ down: ' ' });
    await until(() => p !== null);
    const { confirm, state } = await opened(p);
    await until(() => focused(confirm));
    await sendKeys({ up: ' ' });
    await frames(3);
    expect(state.done).to.equal(false);
    await sendKeys({ press: ' ' });
    await until(() => state.done);
    expect(state.value).to.equal(true);
  });

  it("'confirm': Esc does not close, mouse click confirms, focus returns to the opener", async () => {
    opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.append(opener);
    opener.focus();
    const p = TdModal.confirm({ message: 'x', initialFocus: 'confirm' });
    const { root, confirm, state } = await opened(p);
    await until(() => focused(confirm));
    await sendKeys({ press: 'Escape' });
    await frames(3);
    expect(state.done).to.equal(false);
    expect(root.isConnected).to.equal(true);
    confirm.click();
    await until(() => state.done);
    expect(state.value).to.equal(true);
    await until(() => focused(opener));
    expect(focused(opener)).to.equal(true);
  });
});
