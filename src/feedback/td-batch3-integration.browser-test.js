import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdModal } from './td-modal.js';
import { TdToast } from './td-toast.js';
import { TdLoading } from './td-loading.js';
import { TdLightbox } from './td-lightbox.js';
import { tdTooltip } from './td-tooltip.js';
import '../form/td-dropdown.js';

// v0.9.0 batch 3 — z-layer integration with the REAL components (plan "Layer ownership" tests). td.css only.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); };
const same = (a, b) => expect(a === b, 'same element').to.equal(true);
const isOpen = (id) => { const el = document.getElementById(id); return !!el && el.getAttribute('data-state') === 'open'; };
const lb = () => document.querySelector('.td-lightbox');
const lbOpen = () => !!lb() && lb().getAttribute('data-state') === 'open';

afterEach(async () => {
  TdLoading.hide();
  TdModal.closeAll();
  TdLightbox.close();
  tdTooltip.hide();
  TdToast._activeToasts.slice().forEach((t) => t._removeToast());
  document.querySelectorAll('td-dropdown').forEach((d) => d.remove());
  await wait(400);
});

function dropdownIn(parent) {
  const d = document.createElement('td-dropdown');
  d.setAttribute('aria-label', 'Chọn');
  parent.appendChild(d);
  d.options = [{ value: 'a', label: 'Apple' }, { value: 'b', label: 'Banana' }];
  return d;
}

describe('batch 3 layer integration', () => {
  it('loading shown over an open modal holds focus; the modal is inert', async () => {
    const id = TdModal.show({ title: 'M', body: '<input id="mi">' });
    await frames();
    TdLoading.show('x');
    const modalRoot = document.getElementById(id);
    expect(modalRoot.closest('[inert]') !== null).to.equal(true);
    await sendKeys({ press: 'Tab' });
    expect(TdLoading.element.contains(document.activeElement)).to.equal(true);
    TdLoading.hide();
    expect(modalRoot.closest('[inert]')).to.equal(null);
  });

  it('Escape with a modal over a lightbox closes nothing', async () => {
    TdLightbox.open(['/test/fixtures/1.svg']);
    await frames();
    const id = TdModal.show({ title: 'M', body: '<p>x</p>' });
    await frames();
    await sendKeys({ press: 'Escape' });
    await wait(50);
    expect(isOpen(id)).to.equal(true);
    expect(lbOpen()).to.equal(true);
  });

  it('Escape on an open dropdown menu over a lightbox closes only the menu', async () => {
    TdLightbox.open(['/test/fixtures/1.svg']);
    await frames();
    const d = dropdownIn(lb());
    d.open();
    await wait(150);
    expect(d._menuElement.hidden).to.equal(false);
    await sendKeys({ press: 'Escape' });
    expect(d._menuElement.hidden).to.equal(true);
    expect(lbOpen()).to.equal(true);
  });

  it('a dropdown menu inside stacked modals is interactive and not inert', async () => {
    TdModal.show({ title: 'A', body: '<p>a</p>' });
    const id = TdModal.show({ title: 'B', body: '<div id="slot"></div>' });
    await frames();
    const d = dropdownIn(document.getElementById(id).querySelector('#slot'));
    d.open();
    await wait(150);
    expect(d._menuElement.closest('[inert]')).to.equal(null);
    d._menuElement.querySelector('[role="option"][data-value="b"]').click();
    expect(d.getValue()).to.equal('b');
  });

  it('Escape with a tooltip over a modal hides only the tooltip', async () => {
    const id = TdModal.show({ title: 'M', body: '<button id="tb" data-tooltip="Gợi ý">Nút</button>' });
    await frames();
    tdTooltip.show(document.getElementById('tb'));
    expect(tdTooltip.isVisible).to.equal(true);
    await sendKeys({ press: 'Escape' });
    expect(tdTooltip.isVisible).to.equal(false);
    expect(isOpen(id)).to.equal(true);
  });

  it('a toast close button is reachable by Tab while a modal is open', async () => {
    TdModal.show({ title: 'M', body: '<button id="only">x</button>', closable: false, showFooter: false });
    await frames(4);
    TdToast._showSingle('Đã lưu', 'success', 0);
    await frames();
    const close = document.querySelector('#td-toast-container .td-toast__close');
    const seen = [];
    for (let i = 0; i < 4; i++) {
      await sendKeys({ press: 'Tab' });
      seen.push(document.activeElement);
    }
    expect(seen.includes(close)).to.equal(true);
  });

  it('tooltip over a toast: tooltip sits above (z 510 > 500)', async () => {
    TdToast._showSingle('Đã lưu', 'success', 0);
    await frames();
    const btn = document.createElement('button');
    btn.textContent = 'x';
    btn.setAttribute('data-tooltip', 'Gợi ý');
    document.body.appendChild(btn);
    tdTooltip.show(btn);
    const zt = Number(getComputedStyle(tdTooltip.tooltip).zIndex);
    const zc = Number(getComputedStyle(document.getElementById('td-toast-container')).zIndex);
    expect(zt).to.equal(510);
    expect(zc).to.equal(500);
    same(document.getElementById('td-toast-container').closest('[inert]'), null);
    btn.remove();
  });
});
