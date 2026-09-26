import { expect } from '@esm-bundle/chai';
import { TdModal } from './td-modal.js';
import { TdModalStackManager } from './td-modal-stack.js';
import { tdTooltip } from './td-tooltip.js';
import '../form/td-dropdown.js';

// v0.9.0 impl-review round 1 regressions. td.css only.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

afterEach(async () => { TdModal.closeAll(); tdTooltip.hide(); await wait(50); });

describe('confirm: onConfirm that closes the dialog itself', () => {
  for (const how of ['closeById', 'closeAll']) {
    it(`resolves true when onConfirm calls ${how}`, async () => {
      let cancelled = 0;
      const p = TdModal.confirm({
        message: 'x',
        onConfirm: () => { if (how === 'closeAll') TdModal.closeAll(); else TdModal.closeById(TdModalStackManager.getTop().id); },
        onCancel: () => { cancelled++; },
      });
      await wait(30);
      const btns = [...document.querySelectorAll('.td-modal__footer .td-btn')];
      btns[btns.length - 1].click();
      expect(await p).to.equal(true);
      expect(cancelled).to.equal(0);
    });
  }
});

describe('tooltip custom colour must be recognised and opaque', () => {
  for (const c of ['notacolor', 'transparent', 'rgba(0, 0, 255, 0.4)']) {
    it(`"${c}" falls back to the glass chip`, () => {
      tdTooltip.init();
      const b = document.createElement('button');
      b.textContent = 'x';
      b.setAttribute('data-tooltip', 'Gợi ý');
      b.setAttribute('data-tooltip-color', c);
      document.body.appendChild(b);
      tdTooltip.show(b);
      expect(tdTooltip.tooltip.hasAttribute('data-custom')).to.equal(false);
      b.remove();
    });
  }
  it('an opaque colour still makes a custom chip', () => {
    tdTooltip.init();
    const b = document.createElement('button');
    b.textContent = 'x';
    b.setAttribute('data-tooltip', 'Gợi ý');
    b.setAttribute('data-tooltip-color', '#1d4ed8');
    document.body.appendChild(b);
    tdTooltip.show(b);
    expect(tdTooltip.tooltip.hasAttribute('data-custom')).to.equal(true);
    b.remove();
  });
});

describe('dropdown ignores IME composition keys', () => {
  it('composing Enter in the search box does not select', async () => {
    const d = document.createElement('td-dropdown');
    d.setAttribute('aria-label', 'x');
    document.body.appendChild(d);
    d.options = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }];
    d.open();
    await wait(150);
    const search = d._menuElement.querySelector('.td-dropdown__search');
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    expect(d.getValue()).to.equal(null);
    expect(d._menuElement.hidden).to.equal(false);
    d.remove();
  });
});
