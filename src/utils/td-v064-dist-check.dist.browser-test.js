import { expect } from '@esm-bundle/chai';

// v0.64.0 (plan v0.64.0-dist M3, Codex plan r1 #3): only run with TD_DIST=1 (web-test-runner.config.js). The rewrite is
// server-side, so the browser cannot see it through import.meta.url — this proves the committed dist/ bytes are what the
// suite actually ran on (a broken hook fails here instead of passing on the source).
describe('v0.64.0 TD_DIST=1 serves dist/', () => {
  it('a kit module and td.css come from dist/ (header + exact bytes), test files do not', async () => {
    for (const [url, distUrl] of [['/src/form/td-button.js', '/dist/src/form/td-button.js'], ['/index.js', '/dist/index.js'],
      ['/td.css', '/dist/td.css']]) {
      const a = await fetch(url);
      expect(a.headers.get('x-td-variant'), url).to.equal('dist');
      const body = await a.text();
      expect(body, url).to.equal(await (await fetch(distUrl)).text());
      expect(body.includes('/**'), url).to.equal(false); // minified: the source's doc comments are gone
    }
    const test = await fetch('/src/utils/td-v064-dist.browser-test.js');
    expect(test.headers.get('x-td-variant')).to.equal(null);
  });
});
