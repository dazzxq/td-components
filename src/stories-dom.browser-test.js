import { expect } from '@esm-bundle/chai';
import files from '/__stories.js';

// Story XSS gate, DOM half (v0.12.0 review ISSUE-3): scripts/check-stories.mjs renders string stories in node; this
// renders EVERY story in a real browser (Node-returning ones included) with a payload in every arg and fails when the
// payload became markup. Stories that throw fail too (an unexplained skip is a failure).
const PAYLOAD = '"><img src=x data-xss onerror="window.__storyXss=1">';
const COMMON = ['label', 'placeholder', 'size', 'variant', 'icon', 'title', 'message', 'text', 'hint'];
const box = document.createElement('div');
document.body.appendChild(box);

describe('stories render payloads as text (DOM)', () => {
  it('lists the story files', () => { expect(files.length).to.be.greaterThan(15); });
  for (const file of files) {
    it(file, async () => {
      const m = await import(file);
      const meta = m.default || {};
      let rendered = 0;
      for (const [name, story] of Object.entries(m)) {
        if (!story || typeof story.render !== 'function') continue;
        const args = { ...(meta.args || {}), ...(story.args || {}) };
        const keys = new Set([...Object.keys(meta.argTypes || {}), ...Object.keys(meta.args || {}),
          ...Object.keys(story.args || {}), ...COMMON]);
        for (const k of keys) if (typeof args[k] !== 'boolean') args[k] = PAYLOAD;
        box.replaceChildren();
        window.__storyXss = 0;
        const out = story.render(args, { args }); // a throw fails the test (no silent skip)
        if (typeof out === 'string') box.innerHTML = out;
        else if (out instanceof Node) box.appendChild(out);
        else throw new Error(`${name}: render returned ${typeof out}`);
        await new Promise((r) => setTimeout(r, 20)); // stories fill content in a timeout / rAF
        rendered++;
        expect(box.querySelector('[data-xss]') === null, `${name} leaked`).to.equal(true); // boolean: chai hangs inspecting DOM nodes
        expect(window.__storyXss, `${name} executed`).to.equal(0);
      }
      box.replaceChildren();
      expect(rendered, 'renders at least one story').to.be.greaterThan(0);
    });
  }
});
