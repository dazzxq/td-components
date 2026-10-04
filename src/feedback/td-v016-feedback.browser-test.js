import { expect } from '@esm-bundle/chai';
import { TdToast } from './td-toast.js';
import { TdLoading } from './td-loading.js';
import { TdModal } from './td-modal.js';

// v0.16.0 group C (plan docs/internal/plans/v0.16.0-backlog.md C1–C4). td.css only.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const toasts = () => [...document.querySelectorAll('#td-toast-container .td-toast')];
const liveToasts = () => toasts().filter((t) => t.getAttribute('data-state') !== 'closing');

function topModal() {
  const all = document.body.querySelectorAll(':scope > .td-modal[id^="td-modal-"]:not([data-state="closing"])');
  return all[all.length - 1];
}
const confirmBtn = (m) => { const b = m.querySelectorAll('.td-modal__footer button'); return b[b.length - 1]; };

/** Run fn with console.error captured; returns the logged calls. */
function captureError(fn) {
  const orig = console.error;
  const logged = [];
  console.error = (...args) => { logged.push(args); };
  try { fn(); } finally { console.error = orig; }
  return logged;
}

afterEach(async () => {
  TdToast.clear();
  await wait(260);
  TdLoading.hide();
  TdModal.closeAll();
  TdToast.labels.close = 'Đóng';
  TdLoading.labels.loading = 'Đang tải...';
  Object.assign(TdModal.labels, {
    confirmTitle: 'Xác nhận', confirmMessage: 'Bạn có chắc chắn?', successTitle: 'Thành công', errorTitle: 'Lỗi',
    infoTitle: 'Thông tin',
  });
});

describe('C1 — TdToast handle + clear() + labels.close', () => {
  it('show()/success()/… return a handle with close()', () => {
    for (const h of [TdToast.show('a'), TdToast.success('b'), TdToast.error('c'), TdToast.warning('d'),
      TdToast.info('e'), TdToast.show('')]) {
      expect(typeof h.close).to.equal('function');
    }
  });

  it('close() right after show (still in the 50 ms queue) → the toast never appears', async () => {
    const h = TdToast.show('một', 'info', 0);
    h.close();
    h.close(); // idempotent
    await wait(300);
    expect(toasts().length).to.equal(0);
  });

  it('close() during the stagger wait → that toast never appears, the others do', async () => {
    TdToast.show('một', 'info', 0);
    TdToast.show('hai', 'info', 0);
    const third = TdToast.show('ba', 'info', 0);
    await wait(70); // flushed (50 ms): #1 shown, #2 at +80, #3 at +160 → #3 is waiting on its stagger timer
    expect(TdToast._scheduled.size).to.be.greaterThan(0);
    third.close();
    third.close();
    await wait(400);
    const texts = toasts().map((t) => t.querySelector('.td-toast__message').textContent);
    expect(texts).to.deep.equal(['hai', 'một']); // v0.36.0: top stacks put the newest nearest the edge (first)
    expect(TdToast._scheduled.size).to.equal(0);
  });

  it('clear() right after 5 show() calls → no toast appears', async () => {
    for (let i = 0; i < 5; i++) TdToast.show(`t${i}`, 'info', 0);
    TdToast.clear();
    await wait(600);
    expect(toasts().length).to.equal(0);
  });

  it('clear() during the stagger → pending timers cancelled, shown toasts dismissed', async () => {
    for (let i = 0; i < 5; i++) TdToast.show(`t${i}`, 'info', 0);
    await wait(150); // some shown, some still staggered
    expect(toasts().length).to.be.greaterThan(0);
    TdToast.clear();
    expect(liveToasts().length).to.equal(0);
    await wait(600);
    expect(toasts().length).to.equal(0);
  });

  it('close() on a shown toast dismisses it like its close button; a second close() is a no-op', async () => {
    const h = TdToast.show('một', 'info', 0);
    const other = TdToast.show('hai', 'info', 0);
    await wait(250);
    expect(liveToasts().length).to.equal(2);
    h.close();
    expect(liveToasts().length).to.equal(1);
    h.close();
    await wait(260);
    expect(toasts().length).to.equal(1);
    expect(toasts()[0].querySelector('.td-toast__message').textContent).to.equal('hai');
    other.close();
    await wait(260);
    expect(toasts().length).to.equal(0);
  });

  it('close() after the toast already went away (click) does nothing', async () => {
    const h = TdToast.show('một', 'info', 0);
    await wait(100);
    toasts()[0].click();
    await wait(260);
    expect(() => h.close()).to.not.throw();
    expect(toasts().length).to.equal(0);
  });

  it('TdToast.labels.close sets the close button aria-label', async () => {
    TdToast.labels.close = 'Close';
    TdToast.show('x', 'info', 0);
    await wait(100);
    expect(toasts()[0].querySelector('.td-toast__close').getAttribute('aria-label')).to.equal('Close');
  });
});

describe('C2 — TdLoading.labels.loading + wrap(fn, opts)', () => {
  const msg = () => document.querySelector('#td-loading-message').textContent;

  it('default message comes from TdLoading.labels.loading', () => {
    expect(TdLoading.labels.loading).to.equal('Đang tải...');
    TdLoading.labels.loading = 'Loading…';
    TdLoading.show();
    expect(msg()).to.equal('Loading…');
    TdLoading.show({ maxDuration: false });
    expect(msg()).to.equal('Loading…');
    TdLoading.show('Riêng');
    expect(msg()).to.equal('Riêng');
  });

  it('wrap() accepts { message, maxDuration } and still a string', async () => {
    let seen = '';
    await TdLoading.wrap(async () => { seen = msg(); }, { message: 'Đang lưu', maxDuration: false });
    expect(seen).to.equal('Đang lưu');
    expect(TdLoading._maxDurationTimer).to.equal(null);
    await TdLoading.wrap(async () => { seen = msg(); }, 'Chuỗi');
    expect(seen).to.equal('Chuỗi');
    TdLoading.labels.loading = 'Loading…';
    await TdLoading.wrap(async () => { seen = msg(); });
    expect(seen).to.equal('Loading…');
  });

  it('wrap() maxDuration option arms the auto-hide timer', async () => {
    let timerDuringWrap = null;
    await TdLoading.wrap(async () => { timerDuringWrap = TdLoading._maxDurationTimer; }, { maxDuration: 5000 });
    expect(timerDuringWrap).to.not.equal(null);
    expect(TdLoading._maxDurationTimer).to.equal(null);
  });
});

describe('C3 — TdModal.labels default titles/messages', () => {
  it('confirm uses labels.confirmTitle / confirmMessage when none is passed', async () => {
    TdModal.labels.confirmTitle = 'Confirm';
    TdModal.labels.confirmMessage = 'Are you sure?';
    const p = TdModal.confirm();
    const m = topModal();
    expect(m.querySelector('.td-modal__title').textContent).to.equal('Confirm');
    expect(m.querySelector('.td-modal__text').textContent).to.equal('Are you sure?');
    confirmBtn(m).click();
    expect(await p).to.equal(true);
  });

  it('success / error / info use their *Title label; an explicit title still wins', async () => {
    Object.assign(TdModal.labels, { successTitle: 'Done', errorTitle: 'Oops', infoTitle: 'FYI' });
    for (const [kind, want] of [['success', 'Done'], ['error', 'Oops'], ['info', 'FYI']]) {
      const p = TdModal[kind]();
      expect(topModal().querySelector('.td-modal__title').textContent).to.equal(want);
      confirmBtn(topModal()).click();
      expect(await p).to.equal(true);
    }
    const p = TdModal.success({ title: 'Riêng' });
    expect(topModal().querySelector('.td-modal__title').textContent).to.equal('Riêng');
    confirmBtn(topModal()).click();
    await p;
  });

  it('defaults are the previous Vietnamese strings', () => {
    expect(TdModal.labels).to.include({
      confirmTitle: 'Xác nhận', confirmMessage: 'Bạn có chắc chắn?', successTitle: 'Thành công', errorTitle: 'Lỗi',
      infoTitle: 'Thông tin',
    });
  });
});

describe('C4 — TdModal.confirm: sync onConfirm false / throw keeps the dialog open', () => {
  it('sync false → stays open, not resolved; a later confirm that passes closes it', async () => {
    let allow = false;
    let settled = false;
    const p = TdModal.confirm({ onConfirm: () => allow }).then((v) => { settled = true; return v; });
    const m = topModal();
    confirmBtn(m).click();
    await wait(0);
    expect(settled).to.equal(false);
    expect(m.getAttribute('data-state')).to.not.equal('closing');
    allow = true;
    confirmBtn(m).click();
    expect(await p).to.equal(true);
    expect(m.getAttribute('data-state')).to.equal('closing');
  });

  it('sync throw → stays open + console.error; cancel still resolves false', async () => {
    let settled = false;
    const p = TdModal.confirm({ onConfirm: () => { throw new Error('boom'); } }).then((v) => { settled = true; return v; });
    const m = topModal();
    const logged = captureError(() => confirmBtn(m).click());
    await wait(0);
    expect(logged.length).to.equal(1);
    expect(settled).to.equal(false);
    expect(m.getAttribute('data-state')).to.not.equal('closing');
    m.querySelectorAll('.td-modal__footer button')[0].click(); // cancel
    expect(await p).to.equal(false);
  });

  it('sync undefined / truthy → resolves true and closes (unchanged)', async () => {
    for (const ret of [undefined, true, 0, '']) {
      const p = TdModal.confirm({ onConfirm: () => ret });
      const m = topModal();
      confirmBtn(m).click();
      expect(await p).to.equal(true);
      expect(m.getAttribute('data-state')).to.equal('closing');
      await frame();
    }
  });
});
