import { expect } from '@esm-bundle/chai';
import { emulateMedia } from '@web/test-runner-commands';
import { TdProgress } from './td-progress.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
host.style.setProperty('width', '400px');
document.body.appendChild(host);
const mount = (html) => { host.innerHTML = html.trim(); return host.firstElementChild; };
const labelsBackup = { ...TdProgress.labels };
afterEach(async () => {
  host.innerHTML = '';
  Object.assign(TdProgress.labels, labelsBackup);
  await emulateMedia({ reducedMotion: 'no-preference' });
});
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

describe('v0.18.0 F4 — td-progress', () => {
  it('determinate: role=progressbar + aria values + "N%" text on the host', () => {
    const p = mount('<td-progress value="40" label="Đang tải lên"></td-progress>');
    expect(p.getAttribute('role')).to.equal('progressbar');
    expect(p.getAttribute('aria-valuemin')).to.equal('0');
    expect(p.getAttribute('aria-valuemax')).to.equal('100');
    expect(p.getAttribute('aria-valuenow')).to.equal('40');
    expect(p.getAttribute('aria-valuetext')).to.equal('40%');
    expect(p.getAttribute('aria-label')).to.equal('Đang tải lên');
    expect(p.hasAttribute('aria-busy')).to.equal(false);
    expect(p.indeterminate).to.equal(false);
    expect(p.percent).to.equal(40);
  });

  it('custom max, clamping and live updates without re-render', () => {
    const p = mount('<td-progress value="3" max="8"></td-progress>');
    const bar = p.querySelector('.td-progress__bar');
    expect(p.getAttribute('aria-valuemax')).to.equal('8');
    expect(p.getAttribute('aria-valuetext')).to.equal('38%');
    p.value = 20; // > max → clamped
    expect(p.getAttribute('aria-valuenow')).to.equal('8');
    expect(p.getAttribute('aria-valuetext')).to.equal('100%');
    p.setAttribute('value', '-5');
    expect(p.getAttribute('aria-valuenow')).to.equal('0');
    expect(p.querySelector('.td-progress__bar')).to.equal(bar); // updated in place
    p.setAttribute('max', 'abc'); // invalid → 100
    expect(p.getAttribute('aria-valuemax')).to.equal('100');
  });

  it('bar width via CSSOM (no style attribute in the rendered markup)', async () => {
    const p = mount('<td-progress value="25"></td-progress>');
    const bar = p.querySelector('.td-progress__bar');
    expect(bar.style.getPropertyValue('width')).to.equal('25%');
    p.value = 50;
    expect(bar.style.getPropertyValue('width')).to.equal('50%');
    expect(p.render()).to.not.contain('style=');
    await new Promise((r) => setTimeout(r, 300)); // past the width transition
    expect(Math.round(bar.getBoundingClientRect().width)).to.equal(200);
  });

  it('indeterminate: no aria-valuenow/text, aria-busy, animated bar', async () => {
    const p = mount('<td-progress label="Đang xử lý"></td-progress>');
    const root = p.querySelector('.td-progress');
    expect(p.indeterminate).to.equal(true);
    expect(p.percent).to.equal(null);
    expect(root.getAttribute('data-state')).to.equal('indeterminate');
    expect(p.hasAttribute('aria-valuenow')).to.equal(false);
    expect(p.hasAttribute('aria-valuetext')).to.equal(false);
    expect(p.getAttribute('aria-busy')).to.equal('true');
    await frame();
    expect(getComputedStyle(p.querySelector('.td-progress__bar')).animationName).to.equal('td-progress-slide');
    // Becomes determinate once a value arrives (and back when it is removed).
    p.setAttribute('value', '10');
    expect(root.getAttribute('data-state')).to.equal('determinate');
    expect(p.hasAttribute('aria-busy')).to.equal(false);
    p.removeAttribute('value');
    expect(root.getAttribute('data-state')).to.equal('indeterminate');
    p.setAttribute('value', 'abc'); // not a number → indeterminate
    expect(p.indeterminate).to.equal(true);
  });

  it('prefers-reduced-motion: the indeterminate bar does not animate', async () => {
    await emulateMedia({ reducedMotion: 'reduce' });
    const p = mount('<td-progress></td-progress>');
    await frame();
    const cs = getComputedStyle(p.querySelector('.td-progress__bar'));
    expect(cs.animationName).to.equal('none');
    expect(cs.width).to.equal(`${p.querySelector('.td-progress').getBoundingClientRect().width}px`);
  });

  it('variants + sizes are whitelisted; colours come from tokens', () => {
    const p = mount('<td-progress value="50" variant="danger" size="sm"></td-progress>');
    const root = p.querySelector('.td-progress');
    expect(root.classList.contains('td-progress--danger')).to.equal(true);
    expect(root.classList.contains('td-progress--sm')).to.equal(true);
    expect(getComputedStyle(root).height).to.equal('4px');
    const danger = getComputedStyle(p.querySelector('.td-progress__bar')).backgroundColor;
    p.setAttribute('variant', 'success');
    const success = getComputedStyle(p.querySelector('.td-progress__bar')).backgroundColor;
    expect(success).to.not.equal(danger);
    p.setAttribute('variant', 'x" onmouseover="alert(1)');
    p.setAttribute('size', 'huge');
    expect(root.className).to.equal('td-progress td-progress--md td-progress--primary');
    expect(getComputedStyle(root).height).to.equal('8px');
  });

  it('label: removing it drops only the aria-label the component set; a page aria-label is kept', () => {
    const p = mount('<td-progress value="5" label="A"></td-progress>');
    p.removeAttribute('label');
    expect(p.hasAttribute('aria-label')).to.equal(false);
    const q = mount('<td-progress value="5" aria-label="Trang"></td-progress>');
    expect(q.getAttribute('aria-label')).to.equal('Trang');
  });

  it('labels.valueText is translatable', () => {
    TdProgress.labels.valueText = '{n} percent';
    const p = mount('<td-progress value="7"></td-progress>');
    expect(p.getAttribute('aria-valuetext')).to.equal('7 percent');
  });

  it('[hidden] hides the host', () => {
    const p = mount('<td-progress value="5" hidden></td-progress>');
    expect(getComputedStyle(p).display).to.equal('none');
  });
});
