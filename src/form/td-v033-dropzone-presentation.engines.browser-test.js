import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdDropzone } from './td-dropzone.js';

// v0.33.0 — td-dropzone presentation API (plan docs/internal/plans/v0.33.0-media-picker-dcms-parity.md, decision 21):
// prompt-title / prompt-text (stacked zone) + hint-style="badges". Additive: without them the markup is v0.32's.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.innerHTML = html.trim(); return host.firstElementChild; };
const labelsBackup = { ...TdDropzone.labels };
afterEach(() => {
  host.innerHTML = '';
  Object.assign(TdDropzone.labels, labelsBackup);
});

/** Count picker opens: the component opens the native picker through the inner input's click(). */
function spyPicker(dz) {
  const input = dz.querySelector('.td-dropzone__input');
  const spy = { n: 0 };
  input.click = () => { spy.n++; };
  return spy;
}
const badges = (dz) => [...dz.querySelectorAll('.td-dropzone__badge')].map((b) => b.textContent);

// innerHTML captured from the v0.32.0 code path (td-dropzone.js on main, identical in Chromium / Firefox / WebKit).
const V032 = {
  "bare": "<div class=\"td-dropzone\" role=\"group\" data-state=\"idle\"><input type=\"file\" class=\"td-dropzone__input\" tabindex=\"-1\" aria-hidden=\"true\"><div class=\"td-dropzone__zone\"><span class=\"td-dropzone__icon\" data-td-icon=\"upload\" aria-hidden=\"true\"><svg class=\"td-icon td-icon--m\" data-icon=\"upload\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M12 3v12\"></path><path d=\"m17 8-5-5-5 5\"></path><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"></path></svg></span><p class=\"td-dropzone__prompt\"><span class=\"td-dropzone__text\">Kéo thả file vào đây hoặc</span> <button type=\"button\" class=\"td-dropzone__browse td-btn td-btn--secondary td-btn--sm\">Chọn file</button></p><p class=\"td-dropzone__hint\" id=\"dzA-hint\" hidden=\"\"></p></div><ul class=\"td-dropzone__rejected\" hidden=\"\"></ul><ul class=\"td-dropzone__list\" aria-label=\"File đã chọn\" hidden=\"\"></ul><span class=\"td-sr-only td-dropzone__live\" aria-live=\"polite\"></span></div>",
  "full": "<div class=\"td-dropzone\" role=\"group\" aria-labelledby=\"dzB-label\" data-state=\"idle\"><span class=\"td-dropzone__label\" id=\"dzB-label\">Tệp<span class=\"td-field__required\" aria-hidden=\"true\"> *</span></span><input type=\"file\" class=\"td-dropzone__input\" tabindex=\"-1\" aria-hidden=\"true\" accept=\".pdf,image/*\" multiple=\"\"><div class=\"td-dropzone__zone\"><span class=\"td-dropzone__icon\" data-td-icon=\"upload\" aria-hidden=\"true\"><svg class=\"td-icon td-icon--m\" data-icon=\"upload\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M12 3v12\"></path><path d=\"m17 8-5-5-5 5\"></path><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"></path></svg></span><p class=\"td-dropzone__prompt\"><span class=\"td-dropzone__text\">Kéo thả file vào đây hoặc</span> <button type=\"button\" class=\"td-dropzone__browse td-btn td-btn--secondary td-btn--sm\" aria-describedby=\"dzB-hint\">Chọn file</button></p><p class=\"td-dropzone__hint\" id=\"dzB-hint\">Định dạng: .pdf, image/* · Tối đa 5 MB mỗi file · Tối đa 3 file</p></div><ul class=\"td-dropzone__rejected\" hidden=\"\"></ul><ul class=\"td-dropzone__list\" aria-label=\"File đã chọn\" hidden=\"\"></ul><span class=\"td-sr-only td-dropzone__live\" aria-live=\"polite\"></span></div>",
  "friendly": "<div class=\"td-dropzone\" role=\"group\" aria-labelledby=\"dzC-label\" data-state=\"idle\" data-disabled=\"\"><span class=\"td-dropzone__label\" id=\"dzC-label\">Ảnh</span><input type=\"file\" class=\"td-dropzone__input\" tabindex=\"-1\" aria-hidden=\"true\" accept=\"image/jpeg\" disabled=\"\"><div class=\"td-dropzone__zone\"><span class=\"td-dropzone__icon\" data-td-icon=\"upload\" aria-hidden=\"true\"><svg class=\"td-icon td-icon--m\" data-icon=\"upload\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M12 3v12\"></path><path d=\"m17 8-5-5-5 5\"></path><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"></path></svg></span><p class=\"td-dropzone__prompt\"><span class=\"td-dropzone__text\">Kéo thả file vào đây hoặc</span> <button type=\"button\" class=\"td-dropzone__browse td-btn td-btn--secondary td-btn--sm\" disabled=\"\" aria-describedby=\"dzC-hint\">Chọn file</button></p><p class=\"td-dropzone__hint\" id=\"dzC-hint\">Định dạng: Ảnh JPEG · Tối đa 1 MB mỗi file</p></div><ul class=\"td-dropzone__rejected\" hidden=\"\"></ul><ul class=\"td-dropzone__list\" aria-label=\"File đã chọn\" hidden=\"\"></ul><span class=\"td-sr-only td-dropzone__live\" aria-live=\"polite\"></span></div>"
};

const LEGACY = {
  bare: '<td-dropzone id="dzA"></td-dropzone>',
  full: '<td-dropzone id="dzB" name="f[]" label="Tệp" required accept=".pdf,image/*" multiple max-size="5MB" max-files="3"></td-dropzone>',
  friendly: '<td-dropzone id="dzC" label="Ảnh" accept="image/jpeg" accept-label="Ảnh JPEG" max-size="1MB" disabled></td-dropzone>',
};

describe('v0.33.0 td-dropzone — legacy render unchanged', () => {
  for (const [k, html] of Object.entries(LEGACY)) {
    it(`no new attribute → innerHTML byte-for-byte v0.32 (${k})`, () => {
      expect(mount(html).innerHTML).to.equal(V032[k]);
    });
  }

  it('empty prompt-title / prompt-text and a non-"badges" hint-style → still the v0.32 markup', () => {
    const dz = mount('<td-dropzone id="dzA" prompt-title="" prompt-text="   " hint-style="inline"></td-dropzone>');
    expect(dz.innerHTML).to.equal(V032.bare);
  });

  it('removing the new attributes goes back to the v0.32 markup', () => {
    const dz = mount('<td-dropzone id="dzB" name="f[]" label="Tệp" required accept=".pdf,image/*" multiple max-size="5MB" max-files="3" prompt-title="T" hint-style="badges"></td-dropzone>');
    expect(dz.innerHTML).to.not.equal(V032.full);
    dz.removeAttribute('prompt-title');
    dz.removeAttribute('hint-style');
    expect(dz.innerHTML).to.equal(V032.full);
  });
});

describe('v0.33.0 td-dropzone — stacked prompt', () => {
  it('DOM order: icon → title → sub-line → choose button; root gets td-dropzone--stacked', () => {
    const dz = mount('<td-dropzone prompt-title="Kéo thả file vào đây" prompt-text="hoặc bấm để chọn file"></td-dropzone>');
    const root = dz.querySelector('.td-dropzone');
    expect(root.classList.contains('td-dropzone--stacked')).to.equal(true);
    const zone = dz.querySelector('.td-dropzone__zone');
    const kids = [...zone.children].map((c) => c.className);
    expect(kids.slice(0, 4)).to.deep.equal(['td-dropzone__icon', 'td-dropzone__title', 'td-dropzone__subtext', 'td-dropzone__prompt']);
    expect(zone.querySelector('.td-dropzone__title').textContent).to.equal('Kéo thả file vào đây');
    expect(zone.querySelector('.td-dropzone__subtext').textContent).to.equal('hoặc bấm để chọn file');
    expect(zone.querySelector('.td-dropzone__text')).to.equal(null); // the legacy prompt line is replaced
    expect(zone.querySelector('.td-dropzone__prompt .td-dropzone__browse')).to.not.equal(null);
  });

  it('large icon: 64 px upload svg, decorative', () => {
    const dz = mount('<td-dropzone prompt-title="T"></td-dropzone>');
    const icon = dz.querySelector('.td-dropzone__icon');
    expect(icon.getAttribute('aria-hidden')).to.equal('true');
    const r = icon.querySelector('svg[data-icon="upload"]').getBoundingClientRect();
    expect(Math.round(r.width)).to.equal(64);
    expect(Math.round(r.height)).to.equal(64);
  });

  it('only one of the two → only that line', () => {
    const dz = mount('<td-dropzone prompt-text="chỉ dòng phụ"></td-dropzone>');
    expect(dz.querySelector('.td-dropzone__title')).to.equal(null);
    expect(dz.querySelector('.td-dropzone__subtext').textContent).to.equal('chỉ dòng phụ');
    expect(dz.querySelector('.td-dropzone--stacked')).to.not.equal(null);
  });

  it('dcms2 look: 2px dashed, larger radius, title 1.25rem / 600, muted sub-line', () => {
    const dz = mount('<td-dropzone prompt-title="T" prompt-text="S"></td-dropzone>');
    const zone = getComputedStyle(dz.querySelector('.td-dropzone__zone'));
    expect(zone.borderTopStyle).to.equal('dashed');
    expect(zone.borderTopWidth).to.equal('2px');
    expect(zone.borderTopLeftRadius).to.equal('20px');
    expect(zone.paddingTop).to.equal('64px');
    expect(zone.paddingLeft).to.equal('32px');
    const title = getComputedStyle(dz.querySelector('.td-dropzone__title'));
    expect(title.fontSize).to.equal('20px');
    expect(title.fontWeight).to.equal('600');
    const subColor = getComputedStyle(dz.querySelector('.td-dropzone__subtext')).color; // read before re-mounting
    const hintProbe = mount('<td-dropzone accept=".pdf"></td-dropzone>');
    expect(subColor).to.equal(getComputedStyle(hintProbe.querySelector('.td-dropzone__hint')).color);
  });

  it('HTML in the strings is shown literally (text only, no element created)', () => {
    const evil = '<img src=x onerror="window.__tdDzPwn=1">';
    const dz = mount('<td-dropzone></td-dropzone>');
    dz.setAttribute('prompt-title', evil);
    dz.setAttribute('prompt-text', `${evil}<b>x</b>`);
    dz.setAttribute('accept', '.png');
    dz.setAttribute('accept-label', evil);
    dz.setAttribute('hint-style', 'badges');
    expect(dz.querySelector('img')).to.equal(null);
    expect(dz.querySelector('b')).to.equal(null);
    expect(dz.querySelector('.td-dropzone__title').textContent).to.equal(evil);
    expect(dz.querySelector('.td-dropzone__subtext').textContent).to.equal(`${evil}<b>x</b>`);
    expect(badges(dz)).to.deep.equal([evil]);
    expect(window.__tdDzPwn).to.equal(undefined);
  });

  it('clicking the zone (title, icon, padding) and the "Chọn file" button each open the picker once', async () => {
    const dz = mount('<td-dropzone prompt-title="Kéo thả file vào đây" prompt-text="hoặc bấm để chọn file" hint-style="badges" accept=".pdf"></td-dropzone>');
    const spy = spyPicker(dz);
    dz.querySelector('.td-dropzone__zone').click();
    expect(spy.n).to.equal(1);
    dz.querySelector('.td-dropzone__title').click();
    expect(spy.n).to.equal(2);
    dz.querySelector('.td-dropzone__icon').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(spy.n).to.equal(3);
    dz.querySelector('.td-dropzone__badge').click();
    expect(spy.n).to.equal(4);
    dz.querySelector('.td-dropzone__browse').click();
    expect(spy.n).to.equal(5);
  });

  it('keyboard: the "Chọn file" button is reachable and Enter opens the picker', async () => {
    const dz = mount('<td-dropzone prompt-title="T" prompt-text="S"></td-dropzone>');
    const spy = spyPicker(dz);
    const btn = dz.querySelector('.td-dropzone__browse');
    btn.focus();
    expect(document.activeElement).to.equal(btn);
    await sendKeys({ press: 'Enter' });
    expect(spy.n).to.equal(1);
  });

  it('disabled: zone click does not open the picker', () => {
    const dz = mount('<td-dropzone prompt-title="T" disabled></td-dropzone>');
    const spy = spyPicker(dz);
    dz.querySelector('.td-dropzone__zone').click();
    expect(spy.n).to.equal(0);
    expect(dz.querySelector('.td-dropzone__browse').disabled).to.equal(true);
  });
});

describe('v0.33.0 td-dropzone — hint-style="badges"', () => {
  it('one span per part with BOTH td-badge and td-dropzone__badge, inside the described-by hint', () => {
    const dz = mount('<td-dropzone id="dzX" accept=".jpg,.png" multiple max-size="20MB" max-files="5" hint-style="badges"></td-dropzone>');
    const hint = dz.querySelector('.td-dropzone__hint');
    expect(hint.tagName).to.equal('DIV');
    expect(hint.classList.contains('td-dropzone__hint--badges')).to.equal(true);
    expect(hint.hidden).to.equal(false);
    const spans = [...hint.querySelectorAll('span')];
    expect(spans.length).to.equal(3);
    for (const s of spans) {
      expect(s.classList.contains('td-badge')).to.equal(true);
      expect(s.classList.contains('td-dropzone__badge')).to.equal(true);
    }
    expect(badges(dz)).to.deep.equal(['JPG, PNG', 'Tối đa 20 MB', 'Tối đa 5 file']);
    expect(dz.querySelector('.td-dropzone__browse').getAttribute('aria-describedby')).to.equal('dzX-hint');
    // badge look comes from .td-badge (semibold); the row wraps
    expect(getComputedStyle(spans[0]).fontWeight).to.equal('600');
    expect(getComputedStyle(hint).flexWrap).to.equal('wrap');
  });

  it('formats: accept-label wins; empty accept-label drops the format badge; derived from MIME / wildcards', () => {
    const dz = mount('<td-dropzone accept="image/jpeg,image/png" accept-label="JPG, JPEG, PNG, GIF, WEBP" max-size="20MB" hint-style="badges"></td-dropzone>');
    expect(badges(dz)).to.deep.equal(['JPG, JPEG, PNG, GIF, WEBP', 'Tối đa 20 MB']);
    dz.setAttribute('accept-label', '');
    expect(badges(dz)).to.deep.equal(['Tối đa 20 MB']);
    dz.removeAttribute('accept-label');
    expect(badges(dz)).to.deep.equal(['JPEG, PNG', 'Tối đa 20 MB']);
    dz.setAttribute('accept', 'image/*,.pdf,image/svg+xml,.PDF');
    expect(badges(dz)).to.deep.equal(['image/*, PDF, SVG', 'Tối đa 20 MB']);
  });

  it('max-files only counts with multiple; nothing to show → hint hidden', () => {
    const dz = mount('<td-dropzone max-files="4" hint-style="badges"></td-dropzone>');
    expect(badges(dz)).to.deep.equal([]);
    expect(dz.querySelector('.td-dropzone__hint').hidden).to.equal(true);
    expect(dz.querySelector('.td-dropzone__browse').hasAttribute('aria-describedby')).to.equal(false);
    dz.setAttribute('multiple', '');
    expect(badges(dz)).to.deep.equal(['Tối đa 4 file']);
  });

  it('badge texts follow TdDropzone.labels (site override)', () => {
    TdDropzone.labels.badgeSize = 'Max {size}';
    TdDropzone.labels.badgeCount = '{n} files';
    const dz = mount('<td-dropzone multiple max-size="1MB" max-files="2" hint-style="badges"></td-dropzone>');
    expect(badges(dz)).to.deep.equal(['Max 1 MB', '2 files']);
  });
});

describe('v0.33.0 td-dropzone — attribute changes re-render', () => {
  it('setting / changing / removing prompt-title, prompt-text, hint-style updates the markup and keeps the files', () => {
    const dz = mount('<td-dropzone multiple max-size="5MB"></td-dropzone>');
    dz.addFiles([new File(['a'], 'a.txt', { type: 'text/plain' })]);
    expect(dz.querySelector('.td-dropzone--stacked')).to.equal(null);
    dz.setAttribute('prompt-title', 'Một');
    expect(dz.querySelector('.td-dropzone__title').textContent).to.equal('Một');
    dz.setAttribute('prompt-title', 'Hai');
    expect(dz.querySelector('.td-dropzone__title').textContent).to.equal('Hai');
    dz.setAttribute('prompt-text', 'Phụ');
    expect(dz.querySelector('.td-dropzone__subtext').textContent).to.equal('Phụ');
    expect(dz.querySelector('p.td-dropzone__hint').textContent).to.equal('Tối đa 5 MB mỗi file');
    dz.setAttribute('hint-style', 'badges');
    expect(dz.querySelector('p.td-dropzone__hint')).to.equal(null);
    expect(badges(dz)).to.deep.equal(['Tối đa 5 MB']);
    dz.setAttribute('max-size', '2MB');
    expect(badges(dz)).to.deep.equal(['Tối đa 2 MB']);
    dz.removeAttribute('prompt-title');
    dz.removeAttribute('prompt-text');
    expect(dz.querySelector('.td-dropzone--stacked')).to.equal(null);
    expect(dz.querySelector('.td-dropzone__text')).to.not.equal(null);
    expect(dz.files.map((f) => f.name)).to.deep.equal(['a.txt']);
    expect(dz.querySelectorAll('.td-dropzone__item').length).to.equal(1);
  });
});
