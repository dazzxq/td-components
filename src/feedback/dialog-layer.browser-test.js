import { expect } from '@esm-bundle/chai';
import { openDialogLayer } from './dialog-layer.js';
import { TdModal } from './td-modal.js';
import { LAYERS } from '../utils/layers.js';
import { isScrollLocked } from '../utils/scroll-lock.js';

// v0.27.0 (plan v0.27.0-dsuite-p0a §A) — the dialog-layer controller extracted from TdModal. Two explicit close phases:
// `onClosing(reason)` runs BEFORE the exit transition (TdModal's onClose timing, unchanged); the Promise returned by
// `close()` resolves AFTER the transition, once the root is removed (td-drawer gives its nodes back + emits `close` then).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function makeRoot() {
  const root = document.createElement('div');
  root.className = 'td-modal td-modal--md';
  root.setAttribute('data-state', 'opening');
  const dialog = document.createElement('div');
  dialog.className = 'td-modal__dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.tabIndex = -1;
  const btn = document.createElement('button');
  btn.textContent = 'Trong';
  dialog.appendChild(btn);
  root.appendChild(dialog);
  return { root, dialog, btn };
}

afterEach(() => { TdModal.closeAll(); });

describe('dialog-layer controller (v0.27.0 §A)', () => {
  it('mounts the root under <body>, inerts the page, moves focus into the dialog, locks scroll when asked', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { root, dialog } = makeRoot();
    const h = openDialogLayer({ root, dialog, layer: LAYERS.modal, scrollLock: true });
    expect(root.parentNode === document.body).to.equal(true);
    expect(opener.closest('[inert]') !== null, 'page inert').to.equal(true);
    expect(dialog.contains(document.activeElement), 'focus inside').to.equal(true);
    expect(isScrollLocked()).to.equal(true);
    await h.close('test');
    expect(isScrollLocked()).to.equal(false);
    expect(document.activeElement === opener, 'focus back on the opener').to.equal(true);
    opener.remove();
  });

  it('two close phases: onClosing before the transition (root still connected), the Promise after removal', async () => {
    const { root, dialog } = makeRoot();
    const log = [];
    const h = openDialogLayer({
      root, dialog, layer: LAYERS.modal,
      onClosing: (reason) => log.push(['closing', reason, root.isConnected, root.getAttribute('data-state')]),
      exitMs: () => 120,
    });
    const p = h.close('escape');
    expect(log.length).to.equal(1);
    expect(log[0]).to.deep.equal(['closing', 'escape', true, 'closing']);
    expect(dialog.hasAttribute('inert')).to.equal(true);
    let resolved = false;
    p.then(() => { resolved = true; });
    await wait(40);
    expect(resolved, 'not before the exit time').to.equal(false);
    expect(root.isConnected).to.equal(true);
    const reason = await p;
    expect(reason).to.equal('escape');
    expect(root.isConnected, 'root removed before the Promise resolves').to.equal(false);
  });

  it('close() is idempotent (same Promise, onClosing once); release() finishes a pending close at once', async () => {
    const { root, dialog } = makeRoot();
    let n = 0;
    const h = openDialogLayer({ root, dialog, onClosing: () => { n++; }, exitMs: () => 5000 });
    const p1 = h.close('a');
    const p2 = h.close('b');
    expect(p1 === p2).to.equal(true);
    expect(n).to.equal(1);
    h.release();
    expect(await p1).to.equal('a');
    expect(root.isConnected).to.equal(false);
  });

  it('Escape goes to onEscape of the top layer; returning true consumes it', async () => {
    const { root, dialog } = makeRoot();
    let esc = 0;
    const h = openDialogLayer({ root, dialog, onEscape: () => { esc++; return true; } });
    let reached = 0;
    const on = (e) => { if (e.key === 'Escape') reached++; };
    document.addEventListener('keydown', on);
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    document.removeEventListener('keydown', on);
    expect(esc).to.equal(1);
    expect(reached).to.equal(0);
    h.release();
  });

  it('TdModal keeps its onClose timing: called before the exit transition, after focus is restored', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    let seen = null;
    const id = TdModal.show({
      title: 'T',
      onClose: () => { seen = { connected: !!document.getElementById(id), focus: document.activeElement === opener }; },
    });
    await wait(50);
    TdModal.closeById(id);
    expect(seen).to.deep.equal({ connected: true, focus: true });
    await wait(400);
    expect(document.getElementById(id)).to.equal(null);
    opener.remove();
  });
});
