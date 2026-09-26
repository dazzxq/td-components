import { expect } from '@esm-bundle/chai';
import { TdModal } from './td-modal.js';

// Ensure a clean stack between tests (modals portal to document.body).
afterEach(() => {
  TdModal.closeAll();
});

/** Helper: the latest modal root element appended to <body>. */
function topModal() {
  const all = document.body.querySelectorAll(':scope > .td-modal[id^="td-modal-"]:not([data-state="closing"])');
  return all[all.length - 1];
}

describe('TdModal.confirm (resolve-on-dismiss)', () => {
  it('resolves true when the confirm button is clicked', async () => {
    const p = TdModal.confirm({ title: 'T', message: 'M' });
    const modal = topModal();
    const buttons = modal.querySelectorAll('.td-modal__footer button');
    buttons[buttons.length - 1].click(); // confirm is last
    expect(await p).to.equal(true);
  });

  it('resolves false when the cancel button is clicked', async () => {
    const p = TdModal.confirm({});
    const modal = topModal();
    modal.querySelector('.td-modal__footer button').click(); // cancel is first
    expect(await p).to.equal(false);
  });

  it('resolves false when dismissed via the X button (was a hang bug)', async () => {
    const p = TdModal.confirm({});
    const modal = topModal();
    modal.querySelector('.td-modal__close').click();
    expect(await p).to.equal(false);
  });

  it('does NOT close on backdrop click (deliberate — prevents accidental dismissal)', async () => {
    let settled = false;
    const p = TdModal.confirm({}).then((v) => { settled = true; return v; });
    const modal = topModal();
    modal.querySelector('.td-modal__backdrop').click();
    await Promise.resolve(); // let any (unwanted) resolution flush
    expect(settled).to.equal(false);                 // backdrop did nothing
    expect(document.body.contains(modal)).to.equal(true); // still open
    // Clean up: close via the X so the promise resolves and afterEach stays clean.
    modal.querySelector('.td-modal__close').click();
    expect(await p).to.equal(false);
  });

  it('resolves false when closed via closeAll', async () => {
    const p = TdModal.confirm({});
    TdModal.closeAll();
    expect(await p).to.equal(false);
  });

  it('resolves exactly once (confirm wins, later dismiss is a no-op)', async () => {
    let resolveCount = 0;
    const p = TdModal.confirm({}).then((v) => { resolveCount += 1; return v; });
    const modal = topModal();
    const buttons = modal.querySelectorAll('.td-modal__footer button');
    buttons[buttons.length - 1].click(); // confirm → true
    // The confirm path also closes the modal; firing onClose again must NOT re-resolve.
    expect(await p).to.equal(true);
    await Promise.resolve();
    expect(resolveCount).to.equal(1);
  });

  it('still resolves even if onConfirm throws', async () => {
    const p = TdModal.confirm({ onConfirm: () => { throw new Error('boom'); } });
    const modal = topModal();
    const buttons = modal.querySelectorAll('.td-modal__footer button');
    buttons[buttons.length - 1].click();
    expect(await p).to.equal(true); // resolve happened before the throwing callback
  });

  it('runs onCancel exactly once on dismiss', async () => {
    let cancels = 0;
    const p = TdModal.confirm({ onCancel: () => { cancels += 1; } });
    const modal = topModal();
    modal.querySelector('.td-modal__close').click();
    expect(await p).to.equal(false);
    expect(cancels).to.equal(1);
  });
});

describe('TdModal.success/error/info (resolve-on-dismiss)', () => {
  for (const kind of ['success', 'error', 'info']) {
    it(`${kind}: OK resolves true`, async () => {
      const p = TdModal[kind]({ message: 'hi' });
      const modal = topModal();
      modal.querySelector('.td-modal__footer button').click();
      expect(await p).to.equal(true);
    });

    it(`${kind}: dismiss via X resolves false`, async () => {
      const p = TdModal[kind]({ message: 'hi' });
      const modal = topModal();
      modal.querySelector('.td-modal__close').click();
      expect(await p).to.equal(false);
    });
  }
});
