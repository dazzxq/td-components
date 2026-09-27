import { expect } from '@esm-bundle/chai';
import './td-sample.js';

// v0.11.0: td-sample is token-native — td.css only, NO Tailwind on this page.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const mount = (attrs = '') => {
  const d = document.createElement('div');
  d.innerHTML = `<td-sample ${attrs}></td-sample>`;
  document.body.appendChild(d);
  return d.firstElementChild;
};
afterEach(() => { document.querySelectorAll('td-sample').forEach((el) => el.parentElement.remove()); });

describe('td-sample (token-native)', () => {
  it('renders the BEM tree with td-* classes only', () => {
    const el = mount('label="Mẫu" count="2"');
    expect(el.querySelector('.td-sample .td-sample__title').textContent).to.equal('Mẫu');
    expect(el.querySelector('.td-sample__count').textContent).to.equal('Count: 2');
    const classes = [...el.querySelectorAll('[class]')].flatMap((n) => [...n.classList]);
    expect(classes.every((c) => c.startsWith('td-'))).to.equal(true);
  });

  it('escapes the label', () => {
    const el = mount();
    el.setAttribute('label', '<img src=x onerror="window.__x=1">');
    expect(el.querySelector('img')).to.equal(null);
    expect(el.querySelector('.td-sample__title').textContent).to.include('<img');
  });

  it('increments and emits count-change; disabled blocks it', () => {
    const el = mount('count="0"');
    let detail = null;
    el.addEventListener('count-change', (e) => { detail = e.detail; });
    el.querySelector('button').click();
    expect(el.getAttribute('count')).to.equal('1');
    expect(detail && detail.count).to.equal(1);
    el.setAttribute('disabled', '');
    el.querySelector('button').click();
    expect(el.getAttribute('count')).to.equal('1');
    expect(el.querySelector('button').disabled).to.equal(true);
  });

  it('gets its look from td.css (card + .td-btn primary)', () => {
    const el = mount();
    const card = getComputedStyle(el.querySelector('.td-sample'));
    expect(card.borderTopStyle).to.equal('solid');
    expect(parseFloat(card.paddingTop)).to.be.greaterThan(0);
    const btn = getComputedStyle(el.querySelector('button'));
    expect(btn.backgroundColor).to.not.equal('rgba(0, 0, 0, 0)');
    expect(btn.color).to.equal('rgb(255, 255, 255)');
  });
});
