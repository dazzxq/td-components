import { expect } from '@esm-bundle/chai';

// v0.19.0 G4 — .td-badge font tokens: --td-badge-font-family (sans) + --td-badge-stamp-font-family (mono).
// Plan: docs/internal/plans/v0.19.0-135-feedback-3.md.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const font = (el) => getComputedStyle(el).fontFamily;
/** the computed font-family of a probe using `value` */
function resolved(value) {
  const probe = document.createElement('span');
  probe.style.setProperty('font-family', value);
  host.appendChild(probe);
  const f = font(probe);
  probe.remove();
  return f;
}
afterEach(() => {
  host.innerHTML = '';
  document.documentElement.style.removeProperty('--td-badge-font-family');
  document.documentElement.style.removeProperty('--td-badge-stamp-font-family');
});

describe('v0.19.0 G4 — badge font tokens', () => {
  it('defaults: a badge uses the sans stack, a stamp the mono stack', () => {
    const b = mount('<span class="td-badge td-badge--success">Đã duyệt</span>');
    const s = mount('<span class="td-badge td-badge--danger td-badge--stamp">Huỷ</span>');
    const sans = resolved('var(--td-font-sans)');
    const mono = resolved('var(--td-font-mono)');
    expect(sans).to.not.equal(mono);
    expect(font(b)).to.equal(sans);
    expect(font(s)).to.equal(mono);
    expect(font(s)).to.contain('monospace');
    const o = mount('<span class="td-badge td-badge--info td-badge--outline">i</span>');
    expect(font(o)).to.equal(sans);
  });

  it('each token overrides its own badge kind only', () => {
    const b = mount('<span class="td-badge">A</span>');
    const s = mount('<span class="td-badge td-badge--stamp">B</span>');
    const mono = resolved('var(--td-font-mono)');
    document.documentElement.style.setProperty('--td-badge-font-family', 'Georgia, serif');
    expect(font(b)).to.equal(resolved('Georgia, serif'));
    expect(font(s)).to.equal(mono); // stamp keeps its own token
    document.documentElement.style.setProperty('--td-badge-stamp-font-family', '"Courier New", serif');
    expect(font(s)).to.equal(resolved('"Courier New", serif'));
    expect(font(b)).to.equal(resolved('Georgia, serif'));
  });

  it('tokens can be scoped to a container', () => {
    const wrap = mount('<div><span class="td-badge td-badge--stamp">C</span></div>');
    wrap.style.setProperty('--td-badge-stamp-font-family', 'fantasy');
    expect(font(wrap.firstElementChild)).to.equal('fantasy');
  });
});
