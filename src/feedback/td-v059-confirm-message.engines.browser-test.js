import { expect } from '@esm-bundle/chai';
import { TdModal } from './td-modal.js';

// v0.59.0 (plan v0.59.0-dsuite-small §B, QĐ B1–B3) — the `message` of TdModal.confirm / success / error / info: a string
// (unchanged — td-v059-baseline covers the markup), a Node (inserted as is) or an array (strings → one <p> each as TEXT,
// Nodes as is, null / undefined skipped). Never parsed as HTML. The new spacing CSS sits on `.td-modal__text--blocks`
// only (messageHtml keeps its look). Chromium, Firefox AND WebKit. DOM nodes compared as booleans.
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
async function open(fn, opts) {
  TdModal[fn](opts);
  const root = top();
  await until(() => root.getAttribute('data-state') === 'open');
  return { root, text: root.querySelector('.td-modal__text'), dialog: root.querySelector('[role="alertdialog"]') };
}
afterEach(async () => {
  TdModal.closeAll();
  await frames(2);
  delete window.__pwn;
});

describe('v0.59.0 TdModal message — array / Node', () => {
  it('array: one <p> per string in order, numbers as text, null / undefined skipped, Node items as is', async () => {
    const ul = document.createElement('ul');
    ul.className = 'site-list';
    ul.innerHTML = '<li>Áo</li><li>Quần</li>';
    const { text, dialog } = await open('confirm', { message: ['Xoá 2 sản phẩm:', null, ul, 42, undefined, 'Không hoàn tác.'] });
    expect(text.localName).to.equal('div');
    expect(text.classList.contains('td-modal__text--blocks')).to.equal(true);
    const kids = [...text.children].map((n) => `${n.localName}:${n.textContent}`);
    expect(kids).to.deep.equal(['p:Xoá 2 sản phẩm:', 'ul:ÁoQuần', 'p:42', 'p:Không hoàn tác.']);
    expect(text.querySelector('ul') === ul).to.equal(true);
    expect(dialog.getAttribute('aria-describedby')).to.equal(text.id);
  });

  it('strings are TEXT: markup in a string / an array item never becomes elements', async () => {
    const evil = '<img src=x onerror="window.__pwn=1"><b>x</b>';
    const a = await open('confirm', { message: evil });
    expect(a.text.querySelector('img, b') === null).to.equal(true);
    expect(a.text.textContent).to.equal(evil);
    TdModal.closeAll();
    await frames(2);
    const b = await open('confirm', { message: [evil, 'ok'] });
    expect(b.text.querySelector('img, b') === null).to.equal(true);
    expect(b.text.firstElementChild.textContent).to.equal(evil);
    await frames(3);
    expect(window.__pwn === undefined).to.equal(true);
  });

  it('Element and DocumentFragment are moved in (the fragment ends empty)', async () => {
    const el = document.createElement('div');
    el.textContent = 'Nút bên trong';
    const a = await open('confirm', { message: el });
    expect(a.text.firstChild === el).to.equal(true);
    expect(a.text.classList.contains('td-modal__text--blocks')).to.equal(true);
    TdModal.closeAll();
    await frames(2);
    const frag = document.createDocumentFragment();
    const p1 = document.createElement('p'); p1.textContent = 'Một';
    const p2 = document.createElement('p'); p2.textContent = 'Hai';
    frag.append(p1, p2);
    const b = await open('confirm', { message: frag });
    expect(frag.childNodes.length).to.equal(0);
    expect([...b.text.children].map((n) => n.textContent)).to.deep.equal(['Một', 'Hai']);
  });

  it('empty array → an empty block container (like message: "")', async () => {
    const { text } = await open('confirm', { message: [] });
    expect(text.localName).to.equal('div');
    expect(text.childNodes.length).to.equal(0);
  });

  it('messageHtml still wins and gets NO blocks modifier', async () => {
    const { text } = await open('confirm', { message: ['a'], messageHtml: '<p>X</p><p>Y</p>' });
    expect(text.classList.contains('td-modal__text--blocks')).to.equal(false);
    expect(text.innerHTML).to.equal('<p>X</p><p>Y</p>');
  });

  it('blocks spacing: paragraphs have no UA margin, the 2nd is spaced from the 1st; messageHtml paragraphs keep the UA margin', async () => {
    const a = await open('confirm', { message: ['Một', 'Hai'] });
    const [p1, p2] = a.text.children;
    expect(getComputedStyle(p1).marginTop).to.equal('0px');
    expect(parseFloat(getComputedStyle(p2).marginTop) > 0).to.equal(true);
    expect(getComputedStyle(p2).marginBottom).to.equal('0px');
    TdModal.closeAll();
    await frames(2);
    const b = await open('confirm', { messageHtml: '<p>Một</p><p>Hai</p>' });
    expect(parseFloat(getComputedStyle(b.text.firstElementChild).marginBottom) > 0).to.equal(true);
  });

  it('typeToConfirm + array: the field is still described by the message container', async () => {
    const { text, root } = await open('confirm', { message: ['Một', 'Hai'], typeToConfirm: 'XOA' });
    const input = root.querySelector('.td-modal__confirm-field input');
    expect(input.getAttribute('aria-describedby').split(' ').includes(text.id)).to.equal(true);
  });

  for (const fn of ['success', 'error', 'info']) {
    it(`${fn}(): array + icon`, async () => {
      const { text, root } = await open(fn, { message: ['Dòng 1', 'Dòng 2'] });
      expect(root.querySelector('.td-modal__icon') !== null).to.equal(true);
      expect(text.classList.contains('td-modal__text--blocks')).to.equal(true);
      expect([...text.children].map((n) => n.textContent)).to.deep.equal(['Dòng 1', 'Dòng 2']);
    });
  }

  it('the resolve contract is unchanged (confirm → true)', async () => {
    const p = TdModal.confirm({ message: ['a', 'b'] });
    const root = top();
    await until(() => root.getAttribute('data-state') === 'open');
    root.querySelectorAll('.td-modal__footer button')[1].click();
    expect(await p).to.equal(true);
  });
});
