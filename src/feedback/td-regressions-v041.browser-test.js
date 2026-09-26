import { expect } from '@esm-bundle/chai';
import { TdToast } from './td-toast.js';
import { TdModal } from './td-modal.js';
import { TdModalStackManager } from './td-modal-stack.js';
import { lockScroll, isScrollLocked } from '../utils/scroll-lock.js';
import '../form/td-input-field.js';
import '../form/td-dropdown.js';

// Regression suite for the v0.4.1 bugfix release (B1–B6).

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

const container = document.createElement('div');
document.body.appendChild(container);
function mount(html) {
  container.insertAdjacentHTML('beforeend', html.trim());
  return container.lastElementChild;
}

afterEach(async () => {
  container.innerHTML = '';
  TdModal.closeAll();
  await wait(250);
});

describe('B1 — toast FIFO eviction', () => {
  it('rendering more than MAX_VISIBLE toasts at once does not hang and caps the list', async () => {
    TdToast._activeToasts = [];
    for (let i = 0; i < TdToast.MAX_VISIBLE + 3; i++) {
      TdToast._showSingle(`t${i}`, 'info', 0); // used to spin forever on the 6th
    }
    expect(TdToast._activeToasts.length).to.equal(TdToast.MAX_VISIBLE);
    await new Promise((r) => requestAnimationFrame(r)); // text is set one frame after insertion (D12)
    expect(TdToast._activeToasts[0].textContent.trim()).to.equal('t3');
    TdToast._activeToasts.slice().forEach((t) => t._removeToast());
    expect(TdToast._activeToasts.length).to.equal(0);
  });
});

describe('B6 — toast roles', () => {
  it('uses role=status for non-errors and role=alert only for errors', () => {
    TdToast._showSingle('ok', 'success', 0);
    TdToast._showSingle('bad', 'error', 0);
    const [ok, bad] = TdToast._activeToasts.slice(-2);
    expect(ok.getAttribute('role')).to.equal('status');
    expect(bad.getAttribute('role')).to.equal('alert');
    ok._removeToast();
    bad._removeToast();
  });
});

describe('B2 — modal closed in the same frame it opened', () => {
  it('does not install a focus trap or un-hide the modal', async () => {
    const id = TdModal.show({ title: 'x', body: '<input>' });
    const el = document.getElementById(id);
    TdModal.closeById(id);
    await frames();
    await wait(80);
    expect(TdModal._focusTrapHandlers.has(id)).to.equal(false);
    expect(!el.isConnected || el.getAttribute('data-state') === 'closing').to.equal(true);
    expect(el.contains(document.activeElement)).to.equal(false);
  });

  it('closeAll removes focus traps of open modals', async () => {
    TdModal.show({ title: 'a' });
    TdModal.show({ title: 'b' });
    await frames();
    expect(TdModal._focusTrapHandlers.size).to.equal(2);
    TdModal.closeAll();
    expect(TdModal._focusTrapHandlers.size).to.equal(0);
  });
});

describe('B3 — scroll lock', () => {
  it('locks <html> (not body) and restores the host\'s previous inline overflow', () => {
    const root = document.documentElement;
    root.style.overflow = 'clip';
    document.body.style.overflow = 'auto';
    const id = TdModal.show({ title: 'x' });
    expect(root.style.overflow).to.equal('hidden');
    expect(document.body.style.overflow).to.equal('auto');
    TdModal.closeById(id);
    expect(root.style.overflow).to.equal('clip');
    expect(document.body.style.overflow).to.equal('auto');
    root.style.overflow = '';
    document.body.style.overflow = '';
  });

  it('is ref-counted across independent overlays', () => {
    const releaseA = lockScroll();
    const id = TdModal.show({ title: 'x' });
    TdModal.closeById(id);
    expect(isScrollLocked()).to.equal(true); // A still holds a lease
    releaseA();
    releaseA(); // idempotent
    expect(isScrollLocked()).to.equal(false);
    expect(TdModalStackManager.stack.length).to.equal(0);
  });
});

describe('B4 — input-field error/helper', () => {
  it('error and helper coexist; setError(\'\') leaves the helper', () => {
    const el = mount('<td-input-field helper-text="Gợi ý"></td-input-field>');
    const control = () => el.querySelector('.td-field__control');
    el.setError('Sai rồi');
    expect(el.querySelector('.td-field-error').textContent).to.equal('Sai rồi');
    expect(el.querySelector('.td-field__note').textContent).to.equal('Gợi ý');
    expect(control().getAttribute('aria-invalid')).to.equal('true');
    el.setError('');
    expect(el.querySelector('.td-field-error')).to.equal(null);
    expect(el.querySelector('.td-field__note').textContent).to.equal('Gợi ý');
    expect(control().hasAttribute('aria-invalid')).to.equal(false);
  });

  it('keeps the error state across focus/blur', () => {
    const el = mount('<td-input-field></td-input-field>');
    const input = el.querySelector('.td-field__control');
    el.setError('Sai');
    input.focus();
    input.blur();
    expect(input.getAttribute('aria-invalid')).to.equal('true'); // computed red border: td-batch2-input-field
    expect(el.querySelector('.td-field-error').textContent).to.equal('Sai');
  });

  it('a new error-text attribute value wins over an earlier runtime setError', () => {
    const el = mount('<td-input-field></td-input-field>');
    el.setError('');
    el.setAttribute('error-text', 'Từ server');
    expect(el.querySelector('.td-field-error').textContent).to.equal('Từ server');
  });
});

describe('B5 — dropdown placement + focus', () => {
  function makeDropdown(n = 30) {
    const el = mount('<td-dropdown searchable="false" max-height="20"></td-dropdown>');
    el.options = Array.from({ length: n }, (_, i) => ({ value: String(i), label: `Opt ${i}` }));
    return el;
  }

  it('never overlaps the trigger and fits inside the viewport', () => {
    const el = makeDropdown();
    container.style.paddingTop = `${Math.round(window.innerHeight / 2) - 20}px`;
    el.open();
    // The harness has no Tailwind (`fixed` is inert), so assert the computed placement
    // (style.top + rendered height) rather than the static-flow layout box.
    const btn = el.querySelector('.td-dropdown-button').getBoundingClientRect();
    const top = parseFloat(el._menuElement.style.top);
    const menu = { top, bottom: top + el._menuElement.offsetHeight };
    const overlaps = menu.top < btn.bottom && menu.bottom > btn.top;
    expect(overlaps).to.equal(false);
    expect(menu.top).to.be.at.least(0);
    expect(menu.bottom).to.be.at.most(window.innerHeight);
    el.close();
    container.style.paddingTop = '';
  });

  it('returns focus to the trigger when closing with focus inside the menu', () => {
    const el = makeDropdown(3);
    el.open();
    const opt = el._menuElement.querySelector('.td-dropdown-option');
    opt.setAttribute('tabindex', '-1');
    opt.focus();
    el.close();
    expect(document.activeElement).to.equal(el.querySelector('.td-dropdown-button'));
  });

  it('cancels the pending search-focus timer on close', async () => {
    const el = mount('<td-dropdown></td-dropdown>');
    el.options = [{ value: 'a', label: 'A' }];
    el.open();
    el.close();
    await wait(150);
    const search = el._menuElement.querySelector('.td-dropdown-search');
    expect(document.activeElement).to.not.equal(search);
  });
});

describe('B4/B5 — review follow-ups', () => {
  it('an error-text attribute sets aria-invalid on the inner control', () => {
    const el = mount('<td-input-field error-text="Lỗi"></td-input-field>');
    expect(el.querySelector('.td-field__control').getAttribute('aria-invalid')).to.equal('true');
    el.removeAttribute('error-text');
    expect(el.querySelector('.td-field__control').hasAttribute('aria-invalid')).to.equal(false);
  });

  it('caps the menu width to the viewport', () => {
    const el = mount(`<td-dropdown searchable="false" class="block" ></td-dropdown>`);
    el.options = [{ value: 'a', label: 'A' }];
    const btn = el.querySelector('.td-dropdown-button');
    btn.style.width = `${window.innerWidth + 400}px`;
    el.open();
    expect(parseFloat(el._menuElement.style.width)).to.be.at.most(window.innerWidth);
    const left = parseFloat(el._menuElement.style.left);
    expect(left).to.be.at.least(0);
    expect(left + parseFloat(el._menuElement.style.width)).to.be.at.most(window.innerWidth);
    el.close();
  });
});
