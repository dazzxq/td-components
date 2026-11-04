// v0.96.0 (plan v0.96.0-modal-wp §6.5, ADR 0042) — compat/td-wp-admin.css. A SYNTHETIC unlayered sheet mimics the
// wp-admin rules measured on WordPress 7.1 (written from the measured properties, not copied from WP's GPL files).
// Three states per control: td only (baseline) → + wp (must leak: proves the fixture breaks something) → + wp +
// compat (must equal the baseline). Also: checkbox / radio padding stays 0 (accepted !important leak), a site token
// override still applies, a site rule of higher specificity still wins, focus ring = td's.
import { expect } from '@esm-bundle/chai';

function loadCss(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
  return new Promise((r) => { link.onload = () => r(link); link.onerror = () => r(link); });
}
await loadCss('/td.css');
const compat = await loadCss('/compat/td-wp-admin.css');

const sheet = (text) => { const s = new CSSStyleSheet(); s.replaceSync(text); return s; };
// Page context present in every state (wp-admin body text size; no transitions so reads are final).
const PAGE = sheet(`body { font-size: 13px; }
*, *::before, *::after { transition: none !important; animation: none !important; }`);
const WP = sheet(`
input[type=text], input[type=email], input[type=number], input[type=search], select, textarea {
  box-shadow: 0 0 0 transparent; border-radius: 2px; border: 1px solid #949494; background-color: #fff; color: #1e1e1e; }
input[type=text], input[type=email], input[type=number], input[type=search] { padding: 0 12px; min-height: 40px; line-height: 2; }
input[type=text]:focus, select:focus, textarea:focus { border-color: #3858e9; box-shadow: 0 0 0 2px #3858e9; outline: 2px solid transparent; }
textarea { padding: 8px 12px; line-height: 1.42857143; resize: vertical; overflow: auto; }
input, select { margin: 0 1px; }
button, input, select, textarea { box-sizing: border-box; font-family: inherit; font-size: inherit; font-weight: inherit; }
.wp-core-ui select { font-size: 14px; line-height: 2.71428571; padding: 0 24px 0 12px; min-height: 40px; max-width: 25rem;
  appearance: none; background: #fff linear-gradient(#1e1e1e, #1e1e1e) no-repeat right 8px top 55%; background-size: 16px 16px; cursor: pointer; }
input[type=checkbox], input[type=radio] { border: 1px solid #1e1e1e; border-radius: 2px; background: #fff; color: #1e1e1e; clear: none;
  cursor: pointer; display: inline-block; line-height: 0; height: 1rem; margin: -.25rem .25rem 0 0; outline: 0; padding: 0 !important;
  text-align: center; vertical-align: middle; width: 1rem; min-width: 1rem; appearance: none; box-shadow: none; }
input[type=radio] { border-radius: 50%; }
input[type=checkbox]:checked, input[type=radio]:checked { background: #3858e9; border-color: #3858e9; }
input[type=checkbox]:checked::before { content: ""; float: left; width: 1.875rem; height: 1.875rem; margin: -.1875rem -.3125rem; }
input[type=radio]:checked::before { content: ""; border-radius: 50%; width: .5rem; height: .5rem; margin: auto; background-color: #fff; }
.wp-admin p input[type=checkbox] { margin-top: -.1875rem; }
a { color: #3858e9; outline: 0; }
a:focus { box-shadow: 0 0 0 2px #3858e9; }
`);

const host = document.createElement('div');
document.body.appendChild(host);
// Static SSR-shaped markup (no component module imported: td-dropdown stays undefined like before the upgrade).
host.innerHTML = `
<div class="td-field td-field--md"><input type="text" class="td-field__control" id="c-text" value="x"></div>
<div class="td-field td-field--md td-field--textarea"><textarea class="td-field__control" id="c-area" rows="3"></textarea></div>
<div class="td-field td-field--md"><td-dropdown><select id="c-select"><option>A</option></select></td-dropdown></div>
<input type="text" class="td-otp__input" id="c-otp" maxlength="1">
<p><label class="td-checkbox td-checkbox--md"><input type="checkbox" class="td-checkbox__input" id="c-check" checked><span class="td-checkbox__mark" aria-hidden="true"></span></label></p>
<label class="td-switch td-switch--md"><input type="checkbox" role="switch" class="td-switch__input" id="c-switch" checked><span class="td-switch__track" aria-hidden="true"><span class="td-switch__thumb"></span></span></label>
<div class="td-choice-group"><label class="td-choice"><input type="radio" class="td-choice__input" id="c-radio" name="r" checked><span class="td-choice__face">A</span></label></div>
<button type="button" class="td-btn td-btn--primary td-btn--md" id="c-btn"><span class="td-btn__label">Lưu lại</span></button>
<a href="#x" class="td-btn td-btn--primary td-btn--md" id="c-link"><span class="td-btn__label">Mở</span></a>`;
document.body.classList.add('wp-core-ui', 'wp-admin');

const TEXT_PROPS = ['border-top-color', 'border-top-width', 'border-top-left-radius', 'box-shadow', 'padding-top', 'padding-left',
  'min-height', 'line-height', 'color', 'background-color', 'background-image', 'margin-left', 'max-width', 'font-size', 'box-sizing'];
const TOGGLE_PROPS = ['border-top-width', 'border-top-left-radius', 'background-color', 'height', 'width', 'min-width', 'margin-top',
  'margin-right', 'appearance', 'box-shadow', 'line-height', 'color', 'cursor', 'display', 'vertical-align', 'text-align'];
const CONTROLS = [
  { id: 'c-text', props: TEXT_PROPS, leak: 'border-top-left-radius' },
  { id: 'c-area', props: [...TEXT_PROPS, 'resize', 'overflow-y'], leak: 'border-top-left-radius' },
  { id: 'c-select', props: [...TEXT_PROPS, 'appearance', 'cursor'], leak: 'background-image' },
  { id: 'c-otp', props: TEXT_PROPS, leak: 'border-top-left-radius' },
  { id: 'c-check', props: TOGGLE_PROPS, leak: 'height', before: true },
  { id: 'c-switch', props: TOGGLE_PROPS, leak: 'height', before: true },
  { id: 'c-radio', props: TOGGLE_PROPS, leak: 'height', before: true },
  { id: 'c-btn', props: ['font-size', 'font-family', 'font-weight', 'line-height', 'box-sizing', 'color', 'box-shadow', 'width'], leak: 'font-size' },
  { id: 'c-link', props: ['color', 'outline-style', 'outline-width', 'box-shadow', 'font-size'], leak: 'color' },
];

function setState({ wp, compat: withCompat, extra = [] }) {
  document.adoptedStyleSheets = [PAGE, ...(wp ? [WP] : []), ...extra];
  compat.disabled = !withCompat;
}
function snap(c) {
  const el = document.getElementById(c.id);
  const cs = getComputedStyle(el);
  const out = Object.fromEntries(c.props.map((p) => [p, cs.getPropertyValue(p)]));
  if (c.before) out['::before content'] = getComputedStyle(el, '::before').getPropertyValue('content');
  return out;
}
const blurAll = () => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); };

afterEach(() => {
  blurAll();
  setState({ wp: false, compat: true });
  document.documentElement.style.removeProperty('--td-field-border');
});

describe('v0.96.0 compat/td-wp-admin.css', () => {
  it('the compat sheet loaded (served from the package root, not dist/)', () => {
    expect(compat.sheet, 'link loaded').to.be.ok;
    expect([...compat.sheet.cssRules].length).to.be.greaterThan(4);
  });

  for (const c of CONTROLS) {
    it(`#${c.id}: wp-admin leaks without compat, compat restores the td-only values`, () => {
      setState({ wp: false, compat: false });
      const base = snap(c);
      setState({ wp: true, compat: false });
      const leaked = snap(c);
      expect(leaked[c.leak], `fixture leaks ${c.leak} (not a vacuous test)`).to.not.equal(base[c.leak]);
      setState({ wp: true, compat: true });
      expect(snap(c)).to.deep.equal(base);
    });
  }

  it('checkbox / switch / radio padding is 0 in every state (wp !important leak accepted, harmless)', () => {
    for (const state of [{ wp: false, compat: false }, { wp: true, compat: false }, { wp: true, compat: true }]) {
      setState(state);
      for (const id of ['c-check', 'c-switch', 'c-radio']) {
        const cs = getComputedStyle(document.getElementById(id));
        expect([cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft], `${id} ${JSON.stringify(state)}`).to.deep.equal(['0px', '0px', '0px', '0px']);
      }
    }
  });

  it('focus: text field and select keep td\'s focus ring, not the wp-admin one', () => {
    for (const id of ['c-text', 'c-select']) {
      const el = document.getElementById(id);
      setState({ wp: false, compat: false });
      el.focus();
      const base = getComputedStyle(el);
      const want = { bs: base.boxShadow, bc: base.borderTopColor };
      setState({ wp: true, compat: false });
      expect(getComputedStyle(el).boxShadow, `${id} wp ring leaks`).to.not.equal(want.bs);
      setState({ wp: true, compat: true });
      const got = getComputedStyle(el);
      expect({ bs: got.boxShadow, bc: got.borderTopColor }, id).to.deep.equal(want);
      el.blur();
    }
  });

  it('a site token override (--td-field-border) still applies under compat', () => {
    setState({ wp: true, compat: true });
    document.documentElement.style.setProperty('--td-field-border', 'rgb(255, 0, 0)');
    expect(getComputedStyle(document.getElementById('c-text')).borderTopColor).to.equal('rgb(255, 0, 0)');
  });

  it('a site rule of higher specificity than compat (0,3,0) still wins; a lower one does not (documented edge)', () => {
    const strong = sheet('.td-field .td-field__control.td-field__control.td-field__control { border-top-left-radius: 5px; }');
    const weak = sheet('.td-field__control { border-top-right-radius: 7px; }');
    setState({ wp: true, compat: true, extra: [strong, weak] });
    const cs = getComputedStyle(document.getElementById('c-text'));
    expect(cs.borderTopLeftRadius).to.equal('5px');
    expect(cs.borderTopRightRadius).to.not.equal('7px');
  });
});
