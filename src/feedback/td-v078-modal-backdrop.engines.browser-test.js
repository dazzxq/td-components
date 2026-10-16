// v0.78.0 (dwp request) — TdModal.show({ backdropCloses }): opt-in, default off (ADR 0006). A press that STARTS and ENDS
// on the dialog's own scrim closes it through the guard (`reason: 'backdrop'`); a selection dragged out of the dialog,
// a busy action, a refusing guard or a dialog that is not on top never closes. The Promise dialogs ignore the option.
// Chromium + Firefox + WebKit, real mouse (sendMouse); waits on real signals.
import { expect } from '@esm-bundle/chai';
import { sendMouse, resetMouse } from '@web/test-runner-commands';
import { TdModal } from './td-modal.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(r));
async function until(cond, n = 180) {
  for (let i = 0; i < n && !cond(); i++) await raf();
  return cond();
}
const mid = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
/** a scrim point: the viewport's top-left corner (the md dialog is centred) */
const SCRIM = [6, 6];
const isOpen = (id) => !!document.getElementById(id) && TdModal._isOpen(id);

async function open(opts = {}) {
  let shown = false;
  const id = TdModal.show({ title: 'Ảnh', body: '<p class="txt">Một đoạn chữ để bôi đen</p>', onShow: () => { shown = true; }, ...opts });
  await until(() => shown);
  await raf();
  return id;
}
async function clickAt([x, y]) {
  await sendMouse({ type: 'move', position: [x, y] });
  await sendMouse({ type: 'down' });
  await sendMouse({ type: 'up' });
  await raf();
}

afterEach(async () => {
  const roots = [...document.querySelectorAll('body > .td-modal')];
  TdModal.closeAll();
  await resetMouse();
  await until(() => roots.every((r) => !r.isConnected));
});

describe('v0.78.0 TdModal backdropCloses', () => {
  it('default (no option, even with escapeCloses): a scrim click keeps the dialog open', async () => {
    const id = await open({ escapeCloses: true });
    await clickAt(SCRIM);
    expect(isOpen(id)).to.equal(true);
  });

  it('a press that starts and ends on the scrim closes it once, focus back on the opener', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Mở';
    document.body.appendChild(opener);
    opener.focus();
    let closes = 0;
    const id = await open({ backdropCloses: true, onClose: () => { closes += 1; } });
    await clickAt(SCRIM);
    expect(await until(() => !isOpen(id))).to.equal(true);
    expect(await until(() => document.activeElement === opener)).to.equal(true);
    expect(closes).to.equal(1);
    opener.remove();
  });

  it('a selection dragged from inside the dialog onto the scrim does not close it', async () => {
    const id = await open({ backdropCloses: true });
    const root = document.getElementById(id);
    await sendMouse({ type: 'move', position: mid(root.querySelector('.txt')) });
    await sendMouse({ type: 'down' });
    await sendMouse({ type: 'move', position: [40, 40] });
    await sendMouse({ type: 'move', position: SCRIM });
    await sendMouse({ type: 'up' });
    await raf();
    expect(isOpen(id)).to.equal(true);
  });

  it('a press that starts on the scrim and ends in the dialog does not close it', async () => {
    const id = await open({ backdropCloses: true });
    const root = document.getElementById(id);
    await sendMouse({ type: 'move', position: SCRIM });
    await sendMouse({ type: 'down' });
    await sendMouse({ type: 'move', position: mid(root.querySelector('.txt')) });
    await sendMouse({ type: 'up' });
    await raf();
    expect(isOpen(id)).to.equal(true);
  });

  it('not while an action is busy', async () => {
    let finish;
    const id = await open({ backdropCloses: true, actions: [{ label: 'Lưu', value: 1, onClick: () => new Promise((r) => { finish = r; }) }] });
    const root = document.getElementById(id);
    root.querySelector('.td-modal__footer .td-btn').click();
    await raf();
    await clickAt(SCRIM);
    expect(isOpen(id)).to.equal(true);
    finish(false);
  });

  it('beforeClose gets reason "backdrop": false keeps it open, true closes', async () => {
    const reasons = [];
    let allow = false;
    const id = await open({ backdropCloses: true, beforeClose: ({ reason }) => { reasons.push(reason); return allow; } });
    await clickAt(SCRIM);
    expect(isOpen(id)).to.equal(true);
    allow = true;
    await clickAt(SCRIM);
    expect(await until(() => !isOpen(id))).to.equal(true);
    expect(reasons).to.deep.equal(['backdrop', 'backdrop']);
  });

  it('stack: only the top dialog reacts', async () => {
    const lower = await open({ backdropCloses: true, title: 'Dưới' });
    const upper = await open({ title: 'Trên' });
    await clickAt(SCRIM);
    expect([isOpen(lower), isOpen(upper)]).to.deep.equal([true, true]);
    TdModal.closeById(upper);
    await until(() => !isOpen(upper));
    const upper2 = await open({ backdropCloses: true, title: 'Trên 2' });
    await clickAt(SCRIM);
    expect(await until(() => !isOpen(upper2))).to.equal(true);
    expect(isOpen(lower)).to.equal(true);
  });

  it('touch: a primary touch press on the scrim closes it', async () => {
    const id = await open({ backdropCloses: true });
    const backdrop = document.getElementById(id).querySelector('.td-modal__backdrop');
    backdrop.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, button: 0, pointerType: 'touch' }));
    backdrop.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, isPrimary: true, button: 0, pointerType: 'touch' }));
    backdrop.click();
    expect(await until(() => !isOpen(id))).to.equal(true);
  });

  it('a Promise dialog ignores backdropCloses', async () => {
    let settled = false;
    const p = TdModal.confirm({ title: 'Xoá?', message: 'M', backdropCloses: true }).then((v) => { settled = true; return v; });
    await until(() => document.querySelector('body > .td-modal[data-state="open"]'));
    await clickAt(SCRIM);
    expect(settled).to.equal(false);
    expect(!!document.querySelector('body > .td-modal[data-state="open"]')).to.equal(true);
    TdModal.closeAll();
    await p;
  });
});
