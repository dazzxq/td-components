import { expect } from '@esm-bundle/chai';
import '../form/td-input-field.js';
import '../form/td-dropdown.js';

// v0.57.1 (dsuite) — --td-field-error-size: the font size of EVERY error-contract note (.td-field-error: the input-field
// footer error, the block error under the other controls). Unset by default → follows --td-field-note-size (so a site
// that enlarges the hints gets errors as big, at :root or in a subtree); set → wins. Chromium / Firefox / WebKit.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const extra = [];
afterEach(() => { extra.splice(0).forEach((f) => f()); });
const html = document.documentElement;

function mount(markup) {
  const wrap = document.createElement('div');
  wrap.innerHTML = markup;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  return wrap;
}
function setRoot(name, value) {
  html.style.setProperty(name, value);
  extra.push(() => html.style.removeProperty(name));
}
const FIELDS = '<td-input-field label="A" helper-text="Gợi ý" error-text="Sai rồi"></td-input-field>'
  + '<td-dropdown label="B" error-text="Chọn một mục"></td-dropdown>'
  + '<div class="td-field-error" id="raw">Lỗi tự viết</div>';
const px = (el) => getComputedStyle(el).fontSize;
function errors(wrap) {
  const list = [
    wrap.querySelector('td-input-field .td-field__footer .td-field-error'),
    wrap.querySelector('td-dropdown .td-field-error'),
    wrap.querySelector('#raw'),
  ];
  expect(list.every(Boolean), 'every error note rendered').to.equal(true);
  return list;
}

describe('v0.57.1 --td-field-error-size', () => {
  it('default: every error note keeps --td-text-xs (= the note size); the footer note too', async () => {
    const wrap = mount(FIELDS);
    await wait(20);
    const probe = document.createElement('div');
    probe.style.setProperty('font-size', 'var(--td-text-xs)');
    wrap.appendChild(probe);
    const want = px(probe);
    for (const el of errors(wrap)) expect(px(el)).to.equal(want);
  });

  it(':root { --td-field-note-size: 0.875rem } → the errors follow (14px), like the notes', async () => {
    setRoot('--td-field-note-size', '0.875rem');
    const wrap = mount(FIELDS);
    await wait(20);
    for (const el of errors(wrap)) expect(px(el)).to.equal('14px');
    expect(px(wrap.querySelector('td-input-field .td-field__note'))).to.equal('14px');
  });

  it('a subtree --td-field-note-size reaches the errors of that subtree only', async () => {
    const wrap = mount(`<div class="np">${FIELDS}</div><div class="other"><div class="td-field-error" id="out">x</div></div>`);
    wrap.querySelector('.np').style.setProperty('--td-field-note-size', '0.875rem');
    await wait(20);
    for (const el of errors(wrap)) expect(px(el)).to.equal('14px');
    expect(px(wrap.querySelector('#out'))).to.not.equal('14px');
  });

  it('--td-field-error-size set separately wins over the note size (root and subtree)', async () => {
    setRoot('--td-field-note-size', '0.875rem');
    setRoot('--td-field-error-size', '1rem');
    const wrap = mount(`${FIELDS}<div class="sub"><div class="td-field-error" id="sub">x</div></div>`);
    wrap.querySelector('.sub').style.setProperty('--td-field-error-size', '1.25rem');
    await wait(20);
    for (const el of errors(wrap)) expect(px(el)).to.equal('16px');
    expect(px(wrap.querySelector('td-input-field .td-field__note')), 'the note keeps its own token').to.equal('14px');
    expect(px(wrap.querySelector('#sub'))).to.equal('20px');
  });
});
