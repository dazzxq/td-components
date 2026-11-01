import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import './td-rich-text.js';
import { TdRichText } from './td-rich-text.js';
import { TdModal } from '../feedback/td-modal.js';
import { TdDrawer } from '../feedback/td-drawer.js';

// v0.88.0 td-rich-text (plan docs/internal/plans/v0.88.0-rich-text.md, lane C). td.css only.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const MOD = /Mac|iP(hone|[oa]d)/.test(navigator.platform) ? 'Meta' : 'Control';
const REL = 'rel="nofollow noopener"';

document.addEventListener('submit', (e) => e.preventDefault(), true);
const host = document.createElement('div');
document.body.appendChild(host);
const outside = document.createElement('button');
outside.type = 'button';
outside.textContent = 'outside';
document.body.appendChild(outside);

const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const editor = (el) => el.querySelector('.td-rich-text__editor');
const tool = (el, f) => el.querySelector(`.td-rich-text__tool[data-feature="${f}"]`);
const tick = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, what, ms = 3000) => {
  const t0 = performance.now();
  while (!fn()) {
    if (performance.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await wait(10);
  }
};
// v0.91.0: the link dialog is a TdModal on <body> (a closing one stays in the DOM during its exit transition)
const modal = () => document.querySelector('.td-modal:not([data-state="closing"])');
const body = () => modal()?.querySelector('.td-rich-text-link') || null;
const urlInput = () => body()?.querySelector('.td-rich-text-link__url') || null;
const textInput = () => body()?.querySelector('.td-rich-text-link__text') || null;
const checks = () => [...(body()?.querySelectorAll('.td-checkbox__input') || [])]; // [new tab, noreferrer]
const action = (label) => [...(modal()?.querySelectorAll('.td-modal__footer .td-btn') || [])]
  .find((b) => b.querySelector('.td-btn__label').textContent === label) || null;
const opened = async () => {
  await waitFor(() => urlInput() && document.activeElement === urlInput(), 'link dialog open + URL focused');
};
const closed = async () => {
  // wait out td-modal's exit transition too: it also outlasts ProseMirror's 200 ms "just focused" guard,
  // which puts the state selection back over a collapsed DOM selection (Mod-a + ArrowLeft right after focus)
  await waitFor(() => !document.querySelector('.td-modal'), 'link dialog closed + removed');
};
const setText = (input, v) => {
  input.value = v;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
// caret at the end set through the view, not Mod-a + ArrowRight: for ~200 ms after the editor gains focus ProseMirror
// may reset a keyboard-made selection (prosemirror-view focus guard), which made that pair flaky
const focusEnd = async (el) => {
  editor(el).focus();
  await tick();
  const view = /** @type {any} */ (el)._view;
  const { TextSelection } = await import('../vendor/td-rich-text-engine.js');
  view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
};

afterEach(async () => {
  TdModal.closeAll();
  host.innerHTML = '';
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
});

describe('td-rich-text: value + sanitization', () => {
  it('keeps the allowed marks, maps b/i/strike/del, drops script / img / javascript: links, forces rel', () => {
    const el = mount('<td-rich-text label="X"></td-rich-text>');
    el.value = '<p><b>a</b> <i>b</i> <strike>c</strike> <del>d</del> <u>e</u><script>alert(1)</script><img src="x" onerror="alert(1)">'
      + ' <a href="javascript:alert(1)">bad</a> <a href="https://e.com" target="_top" rel="opener" onclick="x()">ok</a></p>';
    expect(el.value).to.equal(`<p><strong>a</strong> <em>b</em> <s>c</s> <s>d</s> <u>e</u> bad <a href="https://e.com" ${REL}>ok</a></p>`);
    expect(el.querySelector('script, img, [onerror], [onclick]')).to.equal(null);
  });

  it('style / svg / iframe content never becomes text; attributes on allowed tags are dropped', () => {
    const el = mount('<td-rich-text></td-rich-text>');
    el.value = '<p style="color:red" class="x"><strong style="font-weight:400">a</strong><style>p{}</style><svg><text>s</text></svg><iframe>i</iframe></p><span style="font-weight:700">b</span>';
    expect(el.value).to.equal('<p><strong>a</strong></p><p>b</p>');
  });

  it('round-trips its own output; empty document → ""; initial `value` attribute is parsed', () => {
    const el = mount('<td-rich-text value="<p>x<br>y</p><p><em>z</em></p>"></td-rich-text>');
    expect(el.value).to.equal('<p>x<br>y</p><p><em>z</em></p>');
    el.value = el.value;
    expect(el.value).to.equal('<p>x<br>y</p><p><em>z</em></p>');
    el.value = '';
    expect(el.value).to.equal('');
    el.value = '<p></p>';
    expect(el.value).to.equal('');
  });

  it('target / noreferrer are per link; link-target does not touch parsed links; allow-http / features shape the output', () => {
    const el = mount('<td-rich-text link-target="_blank"></td-rich-text>');
    el.value = '<p><a href="http://a.b">h</a> <a href="https://a.b" target="_self">s</a> <a href="https://a.b" target="_blank" rel="NoReferrer x">n</a></p>';
    expect(el.value).to.equal(`<p>h <a href="https://a.b" ${REL}>s</a> <a href="https://a.b" rel="nofollow noopener noreferrer" target="_blank">n</a></p>`);
    el.setAttribute('allow-http', '');
    el.value = '<p><a href="http://a.b">h</a></p>';
    expect(el.value).to.equal(`<p><a href="http://a.b" ${REL}>h</a></p>`);
    el.setAttribute('features', 'bold');
    expect(el.value).to.equal('<p>h</p>');
    expect(el.features).to.deep.equal(['bold']);
    el.value = '<p><strong>a</strong><em>b</em></p>';
    expect(el.value).to.equal('<p><strong>a</strong>b</p>');
  });

  it('changing link-target at runtime keeps the document, the schema and the undo history', async () => {
    const el = mount('<td-rich-text value="<p>ab</p>"></td-rich-text>');
    await focusEnd(el);
    await sendKeys({ type: 'c' });
    expect(el.value).to.equal('<p>abc</p>');
    const schema = /** @type {any} */ (el)._schema;
    el.setAttribute('link-target', '_blank');
    el.setAttribute('link-target', '_self');
    el.removeAttribute('link-target');
    expect(/** @type {any} */ (el)._schema).to.equal(schema);
    editor(el).focus();
    await sendKeys({ press: `${MOD}+z` });
    expect(el.value).to.equal('<p>ab</p>');
  });

  it('a pasted link keeps its own target _blank / noreferrer; other targets and rel tokens are dropped', () => {
    const el = mount('<td-rich-text></td-rich-text>');
    /** @type {any} */ (el)._view.pasteHTML('<p><a href="https://a.b" target="_blank" rel="noopener noreferrer" class="x">p</a> <a href="https://a.b" target="_top" rel="opener">q</a></p>');
    expect(el.value).to.equal(`<p><a href="https://a.b" rel="nofollow noopener noreferrer" target="_blank">p</a> <a href="https://a.b" ${REL}>q</a></p>`);
  });

  it('a value set before connect is parsed with the final config', () => {
    const el = document.createElement('td-rich-text');
    el.value = '<p><a href="http://a.b">h</a></p>';
    el.setAttribute('allow-http', '');
    host.appendChild(el);
    expect(el.value).to.equal(`<p><a href="http://a.b" ${REL}>h</a></p>`);
  });

  it('unknown feature tokens warn once and are ignored', () => {
    const warn = console.warn;
    const calls = [];
    console.warn = (...a) => calls.push(a.join(' '));
    try {
      const el = mount('<td-rich-text features="bold heading"></td-rich-text>');
      el.setAttribute('label', 'x');
      el.setAttribute('features', 'bold heading italic');
      expect(el.features).to.deep.equal(['bold', 'italic']);
    } finally {
      console.warn = warn;
    }
    expect(calls.filter((c) => c.includes('"heading"')).length).to.equal(1);
  });
});

describe('td-rich-text: form', () => {
  it('submits the canonical HTML under `name`; reset restores the initial value', () => {
    const form = mount('<form><td-rich-text name="c" value="<p>hi</p>"></td-rich-text></form>');
    const el = form.querySelector('td-rich-text');
    expect(new FormData(form).get('c')).to.equal('<p>hi</p>');
    el.value = '<p><strong>x</strong></p>';
    expect(new FormData(form).get('c')).to.equal('<p><strong>x</strong></p>');
    form.reset();
    expect(el.value).to.equal('<p>hi</p>');
    expect(new FormData(form).get('c')).to.equal('<p>hi</p>');
  });

  it('required → valueMissing on empty / whitespace-only text', () => {
    const el = mount('<td-rich-text required></td-rich-text>');
    expect(el.checkValidity()).to.equal(false);
    expect(el.validity.valueMissing).to.equal(true);
    expect(editor(el).getAttribute('aria-required')).to.equal('true');
    el.value = '<p>   </p><p><br></p>';
    expect(el.validity.valueMissing).to.equal(true);
    el.value = '<p>a</p>';
    expect(el.checkValidity()).to.equal(true);
  });

  it('maxlength counts code points of the visible text (paragraph / line break = 1)', () => {
    const el = mount('<td-rich-text maxlength="3"></td-rich-text>');
    el.value = '<p>😀😀😀</p>';
    expect(el.validity.tooLong).to.equal(false);
    el.value = '<p>ab</p><p>c</p>';
    expect(el.validity.tooLong).to.equal(true);
    el.value = '<p>a<br>b</p>';
    expect(el.validity.tooLong).to.equal(false);
    el.value = '<p><strong>abcd</strong></p>';
    expect(el.validity.tooLong).to.equal(true);
    expect(el.validationMessage).to.contain('3');
  });

  it('disabled (own or fieldset) is not submitted and not editable', () => {
    const form = mount('<form><fieldset><td-rich-text name="c" value="<p>a</p>"></td-rich-text></fieldset></form>');
    const el = form.querySelector('td-rich-text');
    form.querySelector('fieldset').disabled = true;
    expect(new FormData(form).has('c')).to.equal(false);
    expect(editor(el).getAttribute('contenteditable')).to.equal('false');
    expect(editor(el).getAttribute('aria-disabled')).to.equal('true');
    expect(tool(el, 'bold').disabled).to.equal(true);
    form.querySelector('fieldset').disabled = false;
    expect(editor(el).getAttribute('contenteditable')).to.equal('true');
    expect(tool(el, 'bold').disabled).to.equal(false);
  });
});

describe('td-rich-text: input / change', () => {
  it('typing fires input per change; change fires once on blur; a value set by code fires nothing', async () => {
    const el = mount('<td-rich-text></td-rich-text>');
    const inputs = [];
    let changes = 0;
    el.addEventListener('input', (e) => inputs.push(e.detail.value));
    el.addEventListener('change', () => { changes += 1; });
    el.value = '<p>code</p>';
    expect(inputs.length).to.equal(0);
    await focusEnd(el);
    await sendKeys({ type: 'ab' });
    expect(inputs.length).to.equal(2);
    expect(inputs[1]).to.equal('<p>codeab</p>');
    // into the toolbar and back: not a blur
    tool(el, 'bold').focus();
    editor(el).focus();
    expect(changes).to.equal(0);
    outside.focus();
    expect(changes).to.equal(1);
    editor(el).focus();
    outside.focus();
    expect(changes).to.equal(1); // unchanged session
  });

  it('the native input event of the contenteditable never reaches the page', async () => {
    const el = mount('<td-rich-text></td-rich-text>');
    const seen = [];
    el.addEventListener('input', (e) => seen.push(e instanceof CustomEvent));
    editor(el).focus();
    await sendKeys({ type: 'x' });
    expect(seen).to.deep.equal([true]);
  });
});

describe('td-rich-text: toolbar + keys', () => {
  it('Mod-b / Mod-i / Mod-u / Mod-Shift-x toggle the marks; aria-pressed follows', async () => {
    const el = mount('<td-rich-text></td-rich-text>');
    editor(el).focus();
    await sendKeys({ press: `${MOD}+b` });
    expect(tool(el, 'bold').getAttribute('aria-pressed')).to.equal('true');
    await sendKeys({ type: 'a' });
    await sendKeys({ press: `${MOD}+b` });
    await sendKeys({ press: `${MOD}+i` });
    await sendKeys({ type: 'b' });
    await sendKeys({ press: `${MOD}+i` });
    await sendKeys({ press: `${MOD}+u` });
    await sendKeys({ type: 'c' });
    await sendKeys({ press: `${MOD}+u` });
    await sendKeys({ press: `${MOD}+Shift+x` });
    await sendKeys({ type: 'd' });
    expect(el.value).to.equal('<p><strong>a</strong><em>b</em><u>c</u><s>d</s></p>');
    expect(tool(el, 'strike').getAttribute('aria-pressed')).to.equal('true');
    expect(tool(el, 'bold').getAttribute('aria-pressed')).to.equal('false');
  });

  it('Shift-Enter = hard break, Enter = new paragraph; undo / redo', async () => {
    const el = mount('<td-rich-text></td-rich-text>');
    editor(el).focus();
    await sendKeys({ type: 'a' });
    await sendKeys({ press: 'Shift+Enter' });
    await sendKeys({ type: 'b' });
    await sendKeys({ press: 'Enter' });
    await sendKeys({ type: 'c' });
    expect(el.value).to.equal('<p>a<br>b</p><p>c</p>');
    await sendKeys({ press: `${MOD}+z` });
    expect(el.value).to.not.equal('<p>a<br>b</p><p>c</p>');
    await sendKeys({ press: `${MOD}+Shift+z` });
    expect(el.value).to.equal('<p>a<br>b</p><p>c</p>');
  });

  it('a toolbar button toggles the mark on the selection', async () => {
    const el = mount('<td-rich-text value="<p>abc</p>"></td-rich-text>');
    editor(el).focus();
    await sendKeys({ press: `${MOD}+a` });
    tool(el, 'italic').click();
    expect(el.value).to.equal('<p><em>abc</em></p>');
    expect(tool(el, 'italic').getAttribute('aria-pressed')).to.equal('true');
    tool(el, 'italic').click();
    expect(el.value).to.equal('<p>abc</p>');
  });

  it('roving tabindex: ←/→/Home/End; Tab leaves the toolbar into the editor', async () => {
    const el = mount('<td-rich-text></td-rich-text>');
    const tools = [...el.querySelectorAll('.td-rich-text__tool')];
    expect(tools.map((b) => b.dataset.feature)).to.deep.equal(['bold', 'italic', 'underline', 'strike', 'link']);
    expect(tools.map((b) => b.tabIndex)).to.deep.equal([0, -1, -1, -1, -1]);
    expect(el.querySelector('.td-rich-text__toolbar').getAttribute('role')).to.equal('toolbar');
    tools[0].focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(document.activeElement === tools[1]).to.equal(true);
    expect(tools[1].tabIndex).to.equal(0);
    expect(tools[0].tabIndex).to.equal(-1);
    await sendKeys({ press: 'End' });
    expect(document.activeElement === tools[4]).to.equal(true);
    await sendKeys({ press: 'ArrowRight' });
    expect(document.activeElement === tools[0]).to.equal(true);
    await sendKeys({ press: 'ArrowLeft' });
    expect(document.activeElement === tools[4]).to.equal(true);
    await sendKeys({ press: 'Home' });
    expect(document.activeElement === tools[0]).to.equal(true);
    await sendKeys({ press: 'Tab' });
    expect(document.activeElement === editor(el)).to.equal(true);
  });

  it('editor a11y: role textbox, multiline, labelled by the visible label, placeholder', () => {
    const el = mount('<td-rich-text label="Bình luận" placeholder="Viết…"></td-rich-text>');
    const ed = editor(el);
    expect(ed.getAttribute('role')).to.equal('textbox');
    expect(ed.getAttribute('aria-multiline')).to.equal('true');
    const label = document.getElementById(ed.getAttribute('aria-labelledby'));
    expect(label.textContent).to.equal('Bình luận');
    expect(ed.hasAttribute('data-empty')).to.equal(true);
    expect(ed.getAttribute('data-placeholder')).to.equal('Viết…');
    el.value = '<p>a</p>';
    expect(ed.hasAttribute('data-empty')).to.equal(false);
    expect(tool(el, 'bold').getAttribute('aria-label')).to.equal(TdRichText.labels.bold);
  });

  it('readonly: focusable, not editable, toolbar off, aria-readonly', () => {
    const el = mount('<td-rich-text readonly value="<p>a</p>"></td-rich-text>');
    const ed = editor(el);
    expect(ed.getAttribute('contenteditable')).to.equal('false');
    expect(ed.getAttribute('aria-readonly')).to.equal('true');
    expect(ed.tabIndex).to.equal(0);
    expect(tool(el, 'bold').disabled).to.equal(true);
  });
});

describe('td-rich-text: link dialog', () => {
  it('Mod-k on a selection: a TdModal (title, prefilled text, no Gỡ); an unsafe URL keeps it open with the error; a safe one links', async () => {
    const el = mount('<td-rich-text value="<p>hello</p>"></td-rich-text>');
    let changes = 0;
    el.addEventListener('change', () => { changes += 1; });
    expect(el.querySelector('.td-rich-text__link, [role="dialog"]')).to.equal(null); // no inline panel any more
    expect(tool(el, 'link').getAttribute('aria-haspopup')).to.equal('dialog');
    expect(tool(el, 'link').hasAttribute('aria-controls')).to.equal(false);
    editor(el).focus();
    await sendKeys({ press: `${MOD}+a` });
    await sendKeys({ press: `${MOD}+k` });
    await opened();
    expect(modal().querySelector('.td-modal__title').textContent).to.equal(TdRichText.labels.linkTitle);
    expect(tool(el, 'link').getAttribute('aria-expanded')).to.equal('true');
    expect(urlInput().value).to.equal('');
    expect(textInput().value).to.equal('hello');
    expect(checks().map((c) => c.checked)).to.deep.equal([false, false]);
    expect(action(TdRichText.labels.remove)).to.equal(null); // absent, not disabled
    expect(body().querySelectorAll('[name]').length).to.equal(0);
    expect([...body().querySelectorAll('label')].map((l) => l.textContent)).to.deep.equal([
      TdRichText.labels.linkUrl, TdRichText.labels.linkText, TdRichText.labels.newTab, TdRichText.labels.noReferrer]);
    expect(document.querySelector(`label[for="${urlInput().id}"]`).textContent).to.equal(TdRichText.labels.linkUrl);
    await sendKeys({ type: 'javascript:alert(1)' });
    await sendKeys({ press: 'Enter' });
    expect(modal()).to.not.equal(null);
    expect(urlInput().getAttribute('aria-invalid')).to.equal('true');
    const err = document.getElementById(urlInput().getAttribute('aria-describedby'));
    expect(err.textContent).to.equal(TdRichText.labels.invalidUrl);
    expect(err.hidden).to.equal(false);
    action(TdRichText.labels.apply).click(); // the button too
    expect(modal()).to.not.equal(null);
    expect(document.activeElement === urlInput()).to.equal(true);
    expect(el.value).to.equal('<p>hello</p>');
    setText(urlInput(), '');
    expect(urlInput().hasAttribute('aria-invalid')).to.equal(false);
    await sendKeys({ type: 'https://a.b' });
    await sendKeys({ press: 'Enter' });
    await closed();
    expect(el.value).to.equal(`<p><a href="https://a.b" ${REL}>hello</a></p>`);
    expect(document.activeElement === editor(el)).to.equal(true);
    expect(tool(el, 'link').getAttribute('aria-expanded')).to.equal('false');
    expect(changes).to.equal(0); // moving into the dialog and back is not a blur
  });

  it('empty selection outside a link: inserts the display text as a link (caret after it); empty text → the URL', async () => {
    const el = mount('<td-rich-text value="<p>ab</p>"></td-rich-text>');
    await focusEnd(el);
    await sendKeys({ press: `${MOD}+b` }); // a stored mark carries onto the inserted text
    await sendKeys({ press: `${MOD}+k` });
    await opened();
    expect(textInput().value).to.equal('');
    await sendKeys({ type: 'https://x.y' });
    setText(textInput(), 'Trang');
    action(TdRichText.labels.apply).click();
    await closed();
    expect(el.value).to.equal(`<p>ab<a href="https://x.y" ${REL}><strong>Trang</strong></a></p>`);
    await sendKeys({ press: `${MOD}+b` });
    await sendKeys({ type: 'c' });
    expect(el.value).to.equal(`<p>ab<a href="https://x.y" ${REL}><strong>Trang</strong></a>c</p>`);
    await sendKeys({ press: `${MOD}+k` });
    await opened();
    await sendKeys({ type: 'https://z.w' });
    await sendKeys({ press: 'Enter' });
    await closed();
    expect(el.value).to.equal(`<p>ab<a href="https://x.y" ${REL}><strong>Trang</strong></a>c<a href="https://z.w" ${REL}>https://z.w</a></p>`);
  });

  it('cursor inside a link: edits the whole link (prefilled); a new text + URL is ONE undo step; Gỡ liên kết unlinks', async () => {
    const el = mount(`<td-rich-text value='<p>x <a href="https://a.b">hello</a> y</p>'></td-rich-text>`);
    editor(el).focus();
    await sendKeys({ press: `${MOD}+a` });
    await sendKeys({ press: 'ArrowLeft' });
    for (let i = 0; i < 4; i += 1) await sendKeys({ press: 'ArrowRight' }); // inside "hello"
    tool(el, 'link').click();
    await opened();
    expect(modal().querySelector('.td-modal__title').textContent).to.equal(TdRichText.labels.linkEditTitle);
    expect(urlInput().value).to.equal('https://a.b');
    expect(textInput().value).to.equal('hello');
    expect(action(TdRichText.labels.remove)).to.not.equal(null);
    setText(urlInput(), 'https://c.d');
    setText(textInput(), 'world');
    action(TdRichText.labels.apply).click();
    await closed();
    expect(el.value).to.equal(`<p>x <a href="https://c.d" ${REL}>world</a> y</p>`);
    expect(document.activeElement === editor(el)).to.equal(true);
    const sel = /** @type {any} */ (el)._view.state.selection;
    expect([sel.empty, sel.from]).to.deep.equal([true, 8]); // caret right after the link ("x " = 1–3, "world" = 3–8)
    await sendKeys({ press: `${MOD}+z` }); // one step back to the old link
    expect(el.value).to.equal(`<p>x <a href="https://a.b" ${REL}>hello</a> y</p>`);
    await sendKeys({ press: `${MOD}+Shift+z` });
    expect(el.value).to.equal(`<p>x <a href="https://c.d" ${REL}>world</a> y</p>`);
    await sendKeys({ press: `${MOD}+a` });
    await sendKeys({ press: 'ArrowLeft' });
    for (let i = 0; i < 4; i += 1) await sendKeys({ press: 'ArrowRight' }); // inside "world"
    await sendKeys({ press: `${MOD}+k` });
    await opened();
    action(TdRichText.labels.remove).click();
    await closed();
    expect(el.value).to.equal('<p>x world y</p>');
    expect(document.activeElement === editor(el)).to.equal(true);
  });

  it('a selection overlapping a link edits that link (its span, its settings); unchanged text only re-marks it', async () => {
    const el = mount(`<td-rich-text value='<p>ab <a href="https://a.b" target="_blank" rel="noreferrer">cd</a> ef</p>'></td-rich-text>`);
    editor(el).focus();
    const view = /** @type {any} */ (el)._view;
    const { TextSelection } = await import('../vendor/td-rich-text-engine.js');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, 6))); // "b c" — into the link
    await sendKeys({ press: `${MOD}+k` });
    await opened();
    expect(modal().querySelector('.td-modal__title').textContent).to.equal(TdRichText.labels.linkEditTitle);
    expect(urlInput().value).to.equal('https://a.b');
    expect(textInput().value).to.equal('cd');
    expect(checks().map((c) => c.checked)).to.deep.equal([true, true]);
    checks()[1].click(); // noreferrer off
    setText(urlInput(), 'https://c.d');
    await sendKeys({ press: 'Enter' });
    await closed();
    expect(el.value).to.equal(`<p>ab <a href="https://c.d" ${REL} target="_blank">cd</a> ef</p>`);
  });

  it('Gỡ liên kết with a selection touching two links unlinks only the edited one (impl review r1)', async () => {
    const el = mount(`<td-rich-text value='<p><a href="https://a.b">ab</a> <a href="https://c.d">cd</a></p>'></td-rich-text>`);
    editor(el).focus();
    const view = /** @type {any} */ (el)._view;
    const { TextSelection } = await import('../vendor/td-rich-text-engine.js');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, 5))); // "b c" — both links
    await sendKeys({ press: `${MOD}+k` });
    await opened();
    expect(urlInput().value).to.equal('https://a.b');
    action(TdRichText.labels.remove).click();
    await closed();
    expect(el.value).to.equal(`<p>ab <a href="https://c.d" ${REL}>cd</a></p>`);
  });

  it('new tab / noreferrer ticks → per-link HTML; link-target only pre-ticks "new tab" of a NEW link', async () => {
    const el = mount('<td-rich-text link-target="_blank" value="<p>ab</p>"></td-rich-text>');
    editor(el).focus();
    await sendKeys({ press: `${MOD}+a` });
    await sendKeys({ press: `${MOD}+k` });
    await opened();
    expect(checks().map((c) => c.checked)).to.deep.equal([true, false]);
    checks()[1].click();
    await sendKeys({ type: 'https://a.b' });
    await sendKeys({ press: 'Enter' });
    await closed();
    expect(el.value).to.equal('<p><a href="https://a.b" rel="nofollow noopener noreferrer" target="_blank">ab</a></p>');
    el.setAttribute('link-target', '_self');
    await focusEnd(el);
    await sendKeys({ press: `${MOD}+k` });
    await opened();
    expect(checks().map((c) => c.checked)).to.deep.equal([false, false]);
    await sendKeys({ type: 'https://c.d' });
    setText(textInput(), 'c');
    await sendKeys({ press: 'Enter' });
    await closed();
    expect(el.value).to.equal(`<p><a href="https://a.b" rel="nofollow noopener noreferrer" target="_blank">ab</a><a href="https://c.d" ${REL}>c</a></p>`);
    // editing keeps the link's own settings whatever link-target says, and can untick them
    await sendKeys({ press: `${MOD}+a` });
    await sendKeys({ press: 'ArrowLeft' });
    await sendKeys({ press: 'ArrowRight' }); // inside "ab"
    await sendKeys({ press: `${MOD}+k` });
    await opened();
    expect(checks().map((c) => c.checked)).to.deep.equal([true, true]);
    checks()[0].click();
    await sendKeys({ press: 'Enter' });
    await closed();
    expect(el.value).to.equal(`<p><a href="https://a.b" rel="nofollow noopener noreferrer">ab</a><a href="https://c.d" ${REL}>c</a></p>`);
  });

  it('Esc / Huỷ close without a change and give the focus + selection back', async () => {
    const el = mount('<td-rich-text value="<p>abc</p>"></td-rich-text>');
    editor(el).focus();
    await sendKeys({ press: `${MOD}+a` });
    await sendKeys({ press: `${MOD}+k` });
    await opened();
    await sendKeys({ type: 'https://a.b' });
    await sendKeys({ press: 'Escape' });
    await closed();
    expect(el.value).to.equal('<p>abc</p>');
    expect(document.activeElement === editor(el)).to.equal(true);
    expect(tool(el, 'link').getAttribute('aria-expanded')).to.equal('false');
    await sendKeys({ press: `${MOD}+b` }); // the selection came back: Mod-b bolds all of it
    expect(el.value).to.equal('<p><strong>abc</strong></p>');
    tool(el, 'link').click(); // pointer path: the opener is not the editor
    await opened();
    action(TdRichText.labels.cancel).click();
    await closed();
    expect(el.value).to.equal('<p><strong>abc</strong></p>');
    expect(document.activeElement === editor(el)).to.equal(true);
    await sendKeys({ press: `${MOD}+i` });
    expect(el.value).to.equal('<p><strong><em>abc</em></strong></p>');
  });

  it('change: none when the focus moves into the dialog, exactly one at the real blur after it', async () => {
    const el = mount('<td-rich-text value="<p>a</p>"></td-rich-text>');
    let changes = 0;
    el.addEventListener('change', () => { changes += 1; });
    await focusEnd(el);
    await sendKeys({ type: 'b' });
    await sendKeys({ press: `${MOD}+k` });
    await opened();
    expect(changes).to.equal(0);
    await sendKeys({ press: 'Escape' });
    await closed();
    expect(changes).to.equal(0);
    expect(document.activeElement === editor(el)).to.equal(true);
    outside.focus();
    expect(changes).to.equal(1);
    editor(el).focus();
    outside.focus();
    expect(changes).to.equal(1);
  });

  it('disabled / readonly / value set while open → the dialog closes, nothing applied; the old dialog cannot apply', async () => {
    const el = mount('<td-rich-text value="<p>abc</p>"></td-rich-text>');
    editor(el).focus();
    await sendKeys({ press: `${MOD}+a` });
    await sendKeys({ press: `${MOD}+k` });
    await opened();
    await sendKeys({ type: 'https://a.b' });
    const stale = action(TdRichText.labels.apply);
    el.setAttribute('disabled', '');
    expect(modal()).to.equal(null);
    expect(tool(el, 'link').getAttribute('aria-expanded')).to.equal('false');
    stale.click(); // the closing dialog's button: nothing
    await sendKeys({ press: 'Enter' });
    expect(el.value).to.equal('<p>abc</p>');
    el.removeAttribute('disabled');
    editor(el).focus();
    await sendKeys({ press: `${MOD}+a` });
    await sendKeys({ press: `${MOD}+k` });
    await opened();
    el.setAttribute('readonly', '');
    expect(modal()).to.equal(null);
    el.removeAttribute('readonly');
    editor(el).focus();
    await sendKeys({ press: `${MOD}+k` });
    await opened();
    el.value = '<p>new</p>';
    expect(modal()).to.equal(null);
    expect(el.value).to.equal('<p>new</p>');
    // a new generation opens and applies normally
    editor(el).focus();
    await sendKeys({ press: `${MOD}+a` });
    await sendKeys({ press: `${MOD}+k` });
    await opened();
    await sendKeys({ type: 'https://n.w' });
    await sendKeys({ press: 'Enter' });
    await closed();
    expect(el.value).to.equal(`<p><a href="https://n.w" ${REL}>new</a></p>`);
  });

  it('cancelled while td-modal is loading (disconnect / disabled / value set / real blur) → no dialog', async () => {
    for (const cancel of [
      (el) => el.remove(),
      (el) => el.setAttribute('disabled', ''),
      (el) => { el.value = '<p>z</p>'; },
      () => outside.focus(),
    ]) {
      const el = mount('<td-rich-text value="<p>abc</p>"></td-rich-text>');
      editor(el).focus();
      tool(el, 'link').click(); // synchronous: the import is still pending
      cancel(el);
      await wait(150);
      expect(modal(), String(cancel)).to.equal(null);
      expect(/** @type {any} */ (el)._linkDialog, String(cancel)).to.equal(null);
      expect(tool(el, 'link').getAttribute('aria-expanded')).to.equal('false');
      el.remove();
    }
    // a press while loading is ignored (one dialog)
    const el = mount('<td-rich-text value="<p>abc</p>"></td-rich-text>');
    editor(el).focus();
    tool(el, 'link').click();
    tool(el, 'link').click();
    await opened();
    expect(document.querySelectorAll('.td-modal:not([data-state="closing"])').length).to.equal(1);
  });

  it('Enter in the URL / text field applies and never submits an enclosing form', async () => {
    const form = mount('<form><td-rich-text name="c" value="<p>ab</p>"></td-rich-text><button>Gửi</button></form>');
    const el = form.querySelector('td-rich-text');
    let submits = 0;
    form.addEventListener('submit', () => { submits += 1; });
    editor(el).focus();
    await sendKeys({ press: `${MOD}+a` });
    await sendKeys({ press: `${MOD}+k` });
    await opened();
    await sendKeys({ type: 'https://a.b' });
    textInput().focus();
    await sendKeys({ press: 'Enter' });
    await closed();
    expect(submits).to.equal(0);
    expect(new FormData(form).get('c')).to.equal(`<p><a href="https://a.b" ${REL}>ab</a></p>`);
  });

  it('inside a <td-drawer>: the dialog stacks on top; Esc closes only it, focus back in the editor', async () => {
    const el = document.createElement('td-rich-text');
    el.setAttribute('value', '<p>ab</p>');
    const h = TdDrawer.open({ title: 'Sửa', body: el });
    try {
      await waitFor(() => el._view, 'editor mounted');
      editor(el).focus();
      await sendKeys({ press: `${MOD}+a` });
      await sendKeys({ press: `${MOD}+k` });
      await opened();
      const dlg = modal().querySelector('.td-modal__dialog');
      const r = dlg.getBoundingClientRect();
      expect(dlg.contains(document.elementFromPoint(r.left + r.width / 2, r.top + 8))).to.equal(true);
      await sendKeys({ press: 'Escape' });
      await closed();
      expect(h.element.open).to.equal(true);
      expect(document.activeElement === editor(el)).to.equal(true);
    } finally {
      await h.close();
    }
  });
});

describe('td-rich-text: lifecycle', () => {
  it('label / required / disabled / helper-text / error-text keep the editor node and its history', async () => {
    const el = mount('<td-rich-text label="A"></td-rich-text>');
    const ed = editor(el);
    ed.focus();
    await sendKeys({ type: 'abc' });
    el.setAttribute('label', 'B');
    el.setAttribute('required', '');
    el.setAttribute('helper-text', 'Gợi ý');
    el.setAttribute('error-text', 'Lỗi');
    el.setAttribute('disabled', '');
    el.removeAttribute('disabled');
    el.setAttribute('placeholder', 'p');
    el.setAttribute('maxlength', '10');
    expect(editor(el) === ed).to.equal(true);
    expect(el.querySelector('.td-field__label').textContent).to.contain('B');
    expect(el.querySelector('.td-field__note').textContent).to.equal('Gợi ý');
    expect(ed.getAttribute('aria-invalid')).to.equal('true');
    expect(ed.getAttribute('aria-describedby')).to.contain(`${el.id}-error`);
    expect(el.value).to.equal('<p>abc</p>');
    ed.focus();
    await sendKeys({ press: `${MOD}+z` });
    expect(el.value).to.not.equal('<p>abc</p>');
  });

  it('a features change rebuilds toolbar + schema from the current HTML and clears the history', async () => {
    const el = mount('<td-rich-text></td-rich-text>');
    const ed = editor(el);
    ed.focus();
    await sendKeys({ type: 'abc' });
    el.setAttribute('features', 'bold italic');
    expect(editor(el) === ed).to.equal(true);
    expect([...el.querySelectorAll('.td-rich-text__tool')].map((b) => b.dataset.feature)).to.deep.equal(['bold', 'italic']);
    ed.focus();
    await sendKeys({ press: `${MOD}+z` });
    expect(el.value).to.equal('<p>abc</p>');
  });

  it('disabled: a link is not activated (click / Enter), readonly keeps it; link takes the disabled text colour', () => {
    const el = mount('<td-rich-text disabled value=\'<p><a href="#x">go</a></p>\'></td-rich-text>');
    const a = editor(el).querySelector('a');
    a.addEventListener('click', (e) => e.stopPropagation(), { once: true }); // cannot skip the capture-phase guard
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    expect(ev.defaultPrevented).to.equal(true);
    expect(getComputedStyle(a).color).to.equal(getComputedStyle(editor(el)).color);
    el.removeAttribute('disabled');
    el.setAttribute('readonly', '');
    const ev3 = new MouseEvent('click', { bubbles: true, cancelable: true });
    editor(el).querySelector('a').dispatchEvent(ev3);
    expect(ev3.defaultPrevented).to.equal(false);
  });

  it('disconnect / reconnect keeps the value and the editor node, and it stays editable', async () => {
    const el = mount('<td-rich-text></td-rich-text>');
    const ed = editor(el);
    ed.focus();
    await sendKeys({ type: 'ab' });
    el.remove();
    expect(el.value).to.equal('<p>ab</p>');
    host.appendChild(el);
    expect(editor(el) === ed).to.equal(true);
    expect(el.value).to.equal('<p>ab</p>');
    expect(ed.getAttribute('contenteditable')).to.equal('true');
    await focusEnd(el);
    await sendKeys({ type: 'c' });
    expect(el.value).to.equal('<p>abc</p>');
  });
});
