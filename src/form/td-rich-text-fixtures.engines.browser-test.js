import { expect } from '@esm-bundle/chai';
import * as PM from '../vendor/td-rich-text-engine.js';
import './td-rich-text.js';
import { resolveFeatures } from './rich-text/rich-text-policy.js';
import { buildSchema } from './rich-text/rich-text-schema.js';
import { RICH_TEXT_MAX_HTML, parseHtml, serializeHtml } from './rich-text/rich-text-html.js';

// v0.88.0 td-rich-text (plan docs/internal/plans/v0.88.0-rich-text.md): the shared client/server fixtures
// (test/fixtures/rich-text/*.json) run through the CLIENT — schema parse + serialize, and the real element — and must
// produce each case's `expected` canonical HTML. The server side runs the same files (test/php/td-rich-text-policy.test.js).
// Chromium + Firefox + WebKit.
const load = async (name) => (await fetch(`/test/fixtures/rich-text/${name}.json`)).json();
const SETS = { malicious: await load('malicious'), canonical: await load('canonical') };

/** `features` absent → the default preset (comment), same as the server test. */
const featuresOf = (c) => (Array.isArray(c.features) ? c.features : resolveFeatures({}).features);

const host = document.createElement('div');
document.body.appendChild(host);
afterEach(() => { host.innerHTML = ''; });

for (const [set, cases] of Object.entries(SETS)) {
  describe(`td-rich-text fixtures: ${set}.json`, () => {
    it('has cases', () => { expect(cases.length).to.be.greaterThan(0); });

    for (const c of cases) {
      const opts = { allowHttp: !!c.allowHttp, linkTarget: c.linkTarget ?? 'none' };

      it(`schema: ${c.name}`, () => {
        const schema = buildSchema(PM, featuresOf(c), opts);
        expect(serializeHtml(PM, schema, parseHtml(PM, schema, c.input))).to.equal(c.expected);
      });

      // The element cannot express "no features" (an empty `features` attribute falls back to the preset), so a case
      // with `features: []` is covered by the schema run only.
      const elementCan = !Array.isArray(c.features) || c.features.length > 0;
      (elementCan ? it : it.skip)(`element: ${c.name}`, () => {
        const el = document.createElement('td-rich-text');
        el.setAttribute('label', 'Comment');
        if (Array.isArray(c.features)) el.setAttribute('features', c.features.join(' '));
        if (c.allowHttp) el.setAttribute('allow-http', '');
        if (c.linkTarget) el.setAttribute('link-target', c.linkTarget);
        host.appendChild(el);
        el.value = c.input;
        expect(el.value).to.equal(c.expected);
        // the live editor never carries active content from the input
        expect(el.querySelector('.td-rich-text__editor').querySelector('script, style, iframe, object, embed, svg, math, img, [onclick], [onerror]')).to.equal(null);
        // and its value is stable (round-trip)
        el.value = el.value;
        expect(el.value).to.equal(c.expected);
      });
    }
  });
}

// Codex security r1 #1/#3: parsing `value` / a paste never fetches what the HTML references (the DOMParser document has
// no browsing context), and oversized HTML is ignored before parsing.
describe('td-rich-text: parsing is inert and bounded', () => {
  const probes = () => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('__rt_probe'));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const html = (id) => `<p style="background:url(/__rt_probe_${id}_bg.png)">x</p>` + ['img src', 'iframe src', 'video poster', 'audio src', 'embed src', 'object data', 'input type=image src']
    .map((a, i) => `<${a.split(' ')[0]} ${a.split(' ').slice(1).join(' ')}="/__rt_probe_${id}_${i}.png">`).join('')
    + `<link rel="stylesheet" href="/__rt_probe_${id}_css.css"><video><source src="/__rt_probe_${id}_src.mp4"></video>`
    + `<picture><source srcset="/__rt_probe_${id}_set.png"><img srcset="/__rt_probe_${id}_set2.png"></picture>`;

  it('control: the probe sees a request from a live <img>', async () => {
    const img = new Image();
    img.src = '/__rt_probe_control.png';
    await new Promise((r) => { img.onload = r; img.onerror = r; });
    expect(probes().some((n) => n.includes('control'))).to.equal(true);
  });

  it('value / parseHtml: no request for img, iframe, media, link, srcset, inline style url', async () => {
    const el = document.createElement('td-rich-text');
    host.appendChild(el);
    el.value = html('value');
    parseHtml(PM, buildSchema(PM, resolveFeatures({}).features), html('parse'));
    await wait(500);
    expect(probes().filter((n) => !n.includes('control'))).to.deep.equal([]);
    expect(el.value).to.equal('<p>x</p>');
  });

  it(`HTML over ${RICH_TEXT_MAX_HTML} characters is ignored (empty document)`, () => {
    const schema = buildSchema(PM, resolveFeatures({}).features);
    const warn = console.warn;
    const msgs = [];
    console.warn = (m) => msgs.push(String(m));
    try {
      const big = `<p>${'a'.repeat(RICH_TEXT_MAX_HTML)}</p>`;
      expect(serializeHtml(PM, schema, parseHtml(PM, schema, big))).to.equal('');
      expect(serializeHtml(PM, schema, parseHtml(PM, schema, `<p>${'a'.repeat(1000)}</p>`)).length).to.equal(1007);
    } finally {
      console.warn = warn;
    }
    expect(msgs.length).to.equal(1);
    expect(msgs[0].includes('aaaa')).to.equal(false);
  });

  it('an oversized paste is ignored with one warning (same bound); a normal paste goes in', () => {
    const el = document.createElement('td-rich-text');
    host.appendChild(el);
    const view = /** @type {any} */ (el)._view;
    const warn = console.warn;
    const msgs = [];
    console.warn = (m) => msgs.push(String(m));
    try {
      view.pasteHTML(`<p>${'b'.repeat(RICH_TEXT_MAX_HTML)}</p>`);
      view.pasteText('c'.repeat(RICH_TEXT_MAX_HTML + 1));
      expect(el.value).to.equal('');
      view.pasteHTML('<p><strong>ok</strong></p>');
    } finally {
      console.warn = warn;
    }
    expect(msgs.length).to.equal(2);
    expect(msgs.some((m) => m.includes('bbbb') || m.includes('cccc'))).to.equal(false);
    expect(el.value).to.equal('<p><strong>ok</strong></p>');
  });
});
