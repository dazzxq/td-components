import { expect } from '@esm-bundle/chai';
import { TdLoading } from '../feedback/td-loading.js';
import { TdLightbox } from '../feedback/td-lightbox.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const page = document.createElement('main');
page.innerHTML = '<button id="bg">background</button>';
document.body.appendChild(page);
const lb = () => document.querySelector('.td-lightbox');
afterEach(async () => { TdLightbox.close(); TdLoading.hide(); await wait(10); });

describe('shared inert lease (security review: overlapping overlays)', () => {
  it('lightbox then loading; lightbox closes first → page stays inert until loading ends', () => {
    TdLightbox.open(['/test/fixtures/1.svg']);
    TdLoading.show('x');
    expect(page.hasAttribute('inert')).to.equal(true);
    expect(lb().hasAttribute('inert')).to.equal(true);            // lower layer under the loading overlay
    expect(TdLoading.element.hasAttribute('inert')).to.equal(false);
    TdLightbox.close();
    expect(page.hasAttribute('inert')).to.equal(true);            // loading still blocks
    TdLoading.hide();
    expect(page.hasAttribute('inert')).to.equal(false);
  });

  it('loading then lightbox (reverse order): loading overlay stays usable on top; release in any order', () => {
    TdLoading.show('x');
    TdLightbox.open(['/test/fixtures/1.svg']);
    expect(TdLoading.element.hasAttribute('inert')).to.equal(false); // higher layer is exempt
    expect(page.hasAttribute('inert')).to.equal(true);
    TdLoading.hide();
    expect(page.hasAttribute('inert')).to.equal(true);            // lightbox still open
    expect(lb().hasAttribute('inert')).to.equal(false);
    TdLightbox.close();
    expect(page.hasAttribute('inert')).to.equal(false);
  });

  it('body children appended while blocked become inert and are released', async () => {
    TdLoading.show('x');
    const late = document.createElement('button');
    document.body.appendChild(late);
    await wait(0);
    expect(late.hasAttribute('inert')).to.equal(true);
    TdLoading.hide();
    expect(late.hasAttribute('inert')).to.equal(false);
    late.remove();
  });

  it('never removes an inert the site set itself', () => {
    const site = document.createElement('div');
    site.setAttribute('inert', '');
    document.body.appendChild(site);
    TdLoading.show('x');
    TdLoading.hide();
    expect(site.hasAttribute('inert')).to.equal(true);
    site.remove();
  });
});
