// v0.95.0 (K7, dwp request) — TdModal.setActionDisabled(id, index, disabled): the runtime BASE disabled state of an
// `actions` button. It survives the busy cycles of other actions (a cycle used to restore the initial
// `actions[i].disabled`), the busy button takes it when its own cycle ends, and a focused button that becomes disabled
// hands focus to the dialog (never to <body>, outside the trap). Chromium + Firefox + WebKit; no real mouse (btn.click()).
import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdModal } from './td-modal.js';
import { TdModalStackManager } from './td-modal-stack.js';

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
const isOpen = (id) => !!document.getElementById(id) && TdModal._isOpen(id);
const btns = (id) => [...document.getElementById(id).querySelectorAll('.td-modal__footer .td-btn')];
const dialogOf = (id) => document.getElementById(id).querySelector('.td-modal__dialog');

/** A thenable the test settles by hand. */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function open(opts = {}) {
  let shown = false;
  const id = TdModal.show({ title: 'Xoá album', body: '<p>Album</p>', onShow: () => { shown = true; }, ...opts });
  await until(() => shown);
  await raf();
  return id;
}

/** the dwp dialog: Hủy · Xem trước (async, close:false) · Xoá (danger) */
function dwpActions(preview, extra = {}) {
  return [
    { label: 'Hủy' },
    { label: 'Xem trước', close: false, onClick: () => preview() },
    { label: 'Xoá', variant: 'danger', onClick: () => {}, ...extra },
  ];
}

afterEach(async () => {
  const roots = [...document.querySelectorAll('body > .td-modal')];
  TdModal.closeAll();
  await until(() => roots.every((r) => !r.isConnected));
});

describe('v0.95.0 TdModal.setActionDisabled', () => {
  it('idle dialog: lock and unlock apply at once and return true', async () => {
    const id = await open({ actions: dwpActions(() => {}) });
    const del = btns(id)[2];
    expect(del.disabled).to.equal(false);
    expect(TdModal.setActionDisabled(id, 2, true)).to.equal(true);
    expect(del.disabled).to.equal(true);
    expect(TdModal.setActionDisabled(id, 2, 0)).to.equal(true); // coerced to boolean
    expect(del.disabled).to.equal(false);
  });

  it('dwp case: a locked Xoá stays locked after the busy cycle of Xem trước; unlocked → enabled after the next cycle', async () => {
    let d = deferred();
    const id = await open({ actions: dwpActions(() => d.promise, { disabled: true }) });
    const [cancel, preview, del] = btns(id);
    expect(TdModal.setActionDisabled(id, 2, true)).to.equal(true);
    preview.click();
    expect(preview.getAttribute('aria-busy')).to.equal('true');
    expect(cancel.disabled).to.equal(true);
    expect(del.disabled).to.equal(true);
    d.resolve();
    expect(await until(() => preview.getAttribute('aria-busy') !== 'true')).to.equal(true);
    await raf();
    expect(isOpen(id)).to.equal(true);
    expect(cancel.disabled).to.equal(false);
    expect(del.disabled, 'Xoá keeps its base state').to.equal(true);

    TdModal.setActionDisabled(id, 2, false);
    expect(del.disabled).to.equal(false);
    d = deferred();
    preview.click();
    expect(del.disabled).to.equal(true); // busy cycle
    d.resolve();
    expect(await until(() => preview.getAttribute('aria-busy') !== 'true')).to.equal(true);
    await raf();
    expect(del.disabled).to.equal(false);
  });

  it('changes during a busy cycle apply when it ends (another button and the busy one); the busy one keeps focus meanwhile', async () => {
    const d = deferred();
    const id = await open({ actions: dwpActions(() => d.promise) });
    const [, preview, del] = btns(id);
    preview.focus();
    preview.click();
    expect(TdModal.setActionDisabled(id, 2, true)).to.equal(true);
    expect(TdModal.setActionDisabled(id, 1, true)).to.equal(true);
    expect(del.disabled).to.equal(true);
    expect(preview.disabled, 'the busy button is not disabled mid-cycle').to.equal(false);
    expect(document.activeElement).to.equal(preview);
    TdModal.setActionDisabled(id, 2, false); // last write wins
    d.resolve();
    expect(await until(() => preview.getAttribute('aria-busy') !== 'true')).to.equal(true);
    await raf();
    expect(del.disabled).to.equal(false);
    expect(preview.disabled).to.equal(true);
  });

  for (const [name, result] of [['close: false', undefined], ['resolved false', false]]) {
    it(`locking the busy button mid-cycle (${name}) → on release it is disabled and focus is on the dialog, Tab stays inside`, async () => {
      const d = deferred();
      const actions = [
        { label: 'Hủy' },
        { label: 'Xem trước', ...(name === 'close: false' ? { close: false } : {}), onClick: () => d.promise },
        { label: 'Xoá', variant: 'danger' },
      ];
      const id = await open({ actions });
      const root = document.getElementById(id);
      const preview = btns(id)[1];
      preview.focus();
      preview.click();
      expect(TdModal.setActionDisabled(id, 1, true)).to.equal(true);
      expect(document.activeElement).to.equal(preview);
      d.resolve(result);
      expect(await until(() => preview.getAttribute('aria-busy') !== 'true')).to.equal(true);
      await raf();
      expect(isOpen(id)).to.equal(true);
      expect(preview.disabled).to.equal(true);
      expect(document.activeElement).to.equal(dialogOf(id));
      await sendKeys({ press: 'Tab' });
      expect(root.contains(document.activeElement), 'Tab stays inside').to.equal(true);
    });
  }

  it('locking the focused button of an idle dialog moves focus to the dialog; Tab stays inside', async () => {
    const id = await open({ actions: dwpActions(() => {}) });
    const root = document.getElementById(id);
    const del = btns(id)[2];
    del.focus();
    expect(document.activeElement).to.equal(del);
    TdModal.setActionDisabled(id, 2, true);
    expect(del.disabled).to.equal(true);
    expect(document.activeElement).to.equal(dialogOf(id));
    await sendKeys({ press: 'Tab' });
    expect(root.contains(document.activeElement), 'Tab stays inside').to.equal(true);
  });

  it('indices follow the ORIGINAL actions array (a non-object entry keeps its index)', async () => {
    const id = await open({ actions: [{ label: 'A' }, null, { label: 'C' }] });
    const [, c] = btns(id);
    expect(TdModal.setActionDisabled(id, 1, true), 'the null entry is no button').to.equal(false);
    expect(TdModal.setActionDisabled(id, 2, true)).to.equal(true);
    expect(c.disabled).to.equal(true);
  });

  it('returns false and never throws for unknown ids, bad indices, a closed dialog, an own footer, a Promise dialog', async () => {
    const id = await open({ actions: dwpActions(() => {}) });
    expect(TdModal.setActionDisabled('td-modal-nope', 0, true)).to.equal(false);
    for (const bad of [-1, 1.5, '2', 3, 99, NaN, null, undefined]) {
      expect(TdModal.setActionDisabled(id, bad, true), String(bad)).to.equal(false);
    }
    expect(btns(id).every((b) => !b.disabled)).to.equal(true);

    const footer = document.createElement('button');
    footer.textContent = 'Riêng';
    const own = await open({ footer });
    expect(TdModal.setActionDisabled(own, 0, true)).to.equal(false);
    expect(footer.disabled).to.equal(false);

    const pending = TdModal.confirm({ title: 'Chắc chưa?' });
    await until(() => TdModalStackManager.getTop() && TdModalStackManager.getTop().id !== own);
    const confirmId = TdModalStackManager.getTop().id;
    expect(TdModal.setActionDisabled(confirmId, 0, true)).to.equal(false);
    expect(TdModal.setActionDisabled(confirmId, 1, true)).to.equal(false);
    TdModal.closeById(confirmId);
    await pending;

    TdModal.closeById(id);
    expect(TdModal.setActionDisabled(id, 2, true)).to.equal(false);
  });

  it('regression: an initial disabled action stays disabled, its click never runs onClick; site data untouched', async () => {
    let runs = 0;
    const actions = [{ label: 'Hủy' }, { label: 'Xoá', disabled: true, onClick: () => { runs += 1; } }];
    const id = await open({ actions });
    const del = btns(id)[1];
    expect(del.disabled).to.equal(true);
    del.click();
    expect(runs).to.equal(0);
    TdModal.setActionDisabled(id, 1, false);
    expect(actions[1].disabled, 'the kit never writes site data').to.equal(true);
    del.click();
    expect(runs).to.equal(1);
  });
});
