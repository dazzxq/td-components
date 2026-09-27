import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdModal } from './td-modal.js';
import '../display/td-pagination.js';

// v0.10.0 batch 4 shared step 0: TdModal `escapeCloses` (D4, ADR 0006 addendum) + td-pagination `quiet` (D17).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const open = (id) => { const el = document.getElementById(id); return !!el && el.getAttribute('data-state') === 'open'; };

afterEach(async () => { TdModal.closeAll(); await wait(300); });

describe('TdModal escapeCloses', () => {
  it('default modal: Escape does not close', async () => {
    const id = TdModal.show({ title: 'x', body: '<input>' });
    await wait(60);
    await sendKeys({ press: 'Escape' });
    expect(open(id)).to.equal(true);
  });

  it('escapeCloses: Escape closes and focus returns to the opener', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'o';
    document.body.appendChild(opener);
    opener.focus();
    let closed = 0;
    const id = TdModal.show({ title: 'x', body: '<input>', escapeCloses: true, onClose: () => { closed++; } });
    await wait(60);
    await sendKeys({ press: 'Escape' });
    expect(open(id)).to.equal(false);
    expect(closed).to.equal(1);
    expect(document.activeElement === opener).to.equal(true);
    opener.remove();
  });

  it('escapeCloses: not while an async action is busy', async () => {
    let finish;
    const id = TdModal.show({
      title: 'x',
      escapeCloses: true,
      actions: [{ label: 'Lưu', variant: 'primary', onClick: () => new Promise((r) => { finish = r; }) }],
    });
    await wait(60);
    document.querySelector(`#${id} .td-modal__footer .td-btn`).click();
    await sendKeys({ press: 'Escape' });
    expect(open(id)).to.equal(true);
    finish(false);
    await wait(20);
    await sendKeys({ press: 'Escape' });
    expect(open(id)).to.equal(false);
  });
});

describe('td-pagination quiet', () => {
  it('quiet drops the live region, in place and on first render', () => {
    const el = document.createElement('td-pagination');
    el.setAttribute('total-items', '50');
    el.setAttribute('quiet', '');
    document.body.appendChild(el);
    const info = () => el.querySelector('.td-pagination__info');
    expect(info().hasAttribute('aria-live')).to.equal(false);
    el.removeAttribute('quiet');
    expect(info().getAttribute('aria-live')).to.equal('polite');
    el.setAttribute('quiet', '');
    expect(info().hasAttribute('aria-live')).to.equal(false);
    el.remove();
  });
});

describe('shared CSS fixes found in batch 4', () => {
  it('an idle (hidden) button spinner is not displayed', () => {
    const s = document.createElement('span');
    s.className = 'td-spinner td-btn__spinner';
    s.hidden = true;
    document.body.appendChild(s);
    expect(getComputedStyle(s).display).to.equal('none');
    s.remove();
  });

  it('the error note uses the kit font, not the host font', () => {
    document.body.style.setProperty('font-family', 'serif');
    const n = document.createElement('span');
    n.className = 'td-field-error';
    document.body.appendChild(n);
    expect(getComputedStyle(n).fontFamily.includes('serif') && !getComputedStyle(n).fontFamily.includes('sans')).to.equal(false);
    n.remove();
    document.body.style.removeProperty('font-family');
  });
});

describe('td-pagination quiet as a boolean property (impl-review round 2 ISSUE-8)', () => {
  it('quiet = true / false toggles the attribute and the live region', () => {
    const el = document.createElement('td-pagination');
    el.setAttribute('total-items', '50');
    document.body.appendChild(el);
    el.quiet = true;
    expect(el.hasAttribute('quiet')).to.equal(true);
    expect(el.querySelector('.td-pagination__info').hasAttribute('aria-live')).to.equal(false);
    el.quiet = false;
    expect(el.hasAttribute('quiet')).to.equal(false);
    expect(el.querySelector('.td-pagination__info').getAttribute('aria-live')).to.equal('polite');
    el.remove();
  });
});
