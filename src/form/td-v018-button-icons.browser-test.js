import { expect } from '@esm-bundle/chai';
import { sendMouse, resetMouse } from '@web/test-runner-commands';
import './td-button.js';
import { tdIcon, hasIcon, listIcons, registerIcons, resolveIconName } from '../icons/td-icon.js';

// v0.18.0 (135 feedback round 2): F1 td-button name/value on the real submitter, F6 icon aliases + unknown-icon warning.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const container = document.createElement('div');
document.body.appendChild(container);
function mount(html) {
  container.insertAdjacentHTML('beforeend', html.trim());
  return container.lastElementChild;
}
afterEach(async () => {
  container.innerHTML = '';
  await resetMouse();
});

/** Capture console.warn calls while `fn` runs. */
function captureWarn(fn) {
  const calls = [];
  const orig = console.warn;
  console.warn = (...a) => calls.push(a);
  try { fn(); } finally { console.warn = orig; }
  return calls;
}

/** Resolve with [FormData of the submission, submitter] on the next submit (default prevented). */
function nextSubmit(form) {
  return new Promise((resolve) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      resolve([new FormData(form, e.submitter), e.submitter]);
    }, { once: true });
  });
}

async function realClick(el) {
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  await sendMouse({ type: 'click', position: [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)] });
}

describe('F1 td-button: name / value on the inner <button> (real submitter)', () => {
  it('forwards name + value; form.requestSubmit(button) → FormData has the pair', async () => {
    const form = mount('<form><input name="q" value="a"><td-button type="submit" name="action" value="save">Lưu</td-button></form>');
    const btn = form.querySelector('td-button > button');
    expect(btn.getAttribute('name')).to.equal('action');
    expect(btn.getAttribute('value')).to.equal('save');
    const p = nextSubmit(form);
    form.requestSubmit(btn);
    const [fd, submitter] = await p;
    expect(submitter).to.equal(btn);
    expect(fd.getAll('action')).to.deep.equal(['save']);
    expect(fd.get('q')).to.equal('a');
  });

  it('a real click submits the pair (native form submission, formdata event)', async () => {
    const frame = document.createElement('iframe');
    frame.name = 'td-v018-sink';
    container.appendChild(frame);
    const form = mount('<form action="about:blank" target="td-v018-sink"><td-button type="submit" name="action" value="send">Gửi</td-button></form>');
    const got = new Promise((resolve) => form.addEventListener('formdata', (e) => resolve([...e.formData.entries()]), { once: true }));
    await realClick(form.querySelector('td-button > button'));
    expect(await got).to.deep.equal([['action', 'send']]);
  });

  it('two buttons with the same name → only the clicked one is sent', async () => {
    const form = mount('<form>'
      + '<td-button id="a" type="submit" name="op" value="approve">Duyệt</td-button>'
      + '<td-button id="r" type="submit" name="op" value="reject" variant="danger">Từ chối</td-button></form>');
    let p = nextSubmit(form);
    await realClick(form.querySelector('#r > button'));
    let [fd] = await p;
    expect(fd.getAll('op')).to.deep.equal(['reject']);
    p = nextSubmit(form);
    await realClick(form.querySelector('#a > button'));
    [fd] = await p;
    expect(fd.getAll('op')).to.deep.equal(['approve']);
  });

  it('updates in place (same <button>), removing name stops sending; properties mirror the attributes', async () => {
    const form = mount('<form><td-button type="submit" name="action" value="save">Lưu</td-button></form>');
    const host = form.querySelector('td-button');
    const btn = host.querySelector('button');
    host.setAttribute('value', 'draft');
    expect(host.querySelector('button')).to.equal(btn);
    expect(btn.value).to.equal('draft');
    host.value = 'publish';
    expect(btn.getAttribute('value')).to.equal('publish');
    host.name = 'cmd';
    expect(btn.name).to.equal('cmd');
    let p = nextSubmit(form);
    form.requestSubmit(btn);
    let [fd] = await p;
    expect(fd.getAll('cmd')).to.deep.equal(['publish']);
    host.removeAttribute('name');
    expect(btn.hasAttribute('name')).to.equal(false);
    p = nextSubmit(form);
    form.requestSubmit(btn);
    [fd] = await p;
    expect([...fd.keys()]).to.deep.equal([]);
    host.removeAttribute('value');
    expect(btn.hasAttribute('value')).to.equal(false);
  });

  it('survives a re-render (variant change) and a disabled toggle', () => {
    const host = mount('<td-button type="submit" name="a" value="1">X</td-button>');
    host.setAttribute('variant', 'danger');
    host.setDisabled(true);
    host.setDisabled(false);
    const btn = host.querySelector('button');
    expect(btn.name).to.equal('a');
    expect(btn.value).to.equal('1');
  });

  it('link button: name / value are NOT forwarded to the <a>', () => {
    const host = mount('<td-button href="/x" name="a" value="1">Link</td-button>');
    const a = host.querySelector('a.td-btn');
    expect(a.hasAttribute('name')).to.equal(false);
    expect(a.hasAttribute('value')).to.equal(false);
  });

  it('form is not forwarded (form owner stays the ancestor form)', () => {
    const host = mount('<td-button type="submit" form="other" name="a" value="1">X</td-button>');
    expect(host.querySelector('button').hasAttribute('form')).to.equal(false);
  });
});

describe('F6 icon aliases (JS registry, same table as PHP)', () => {
  it('tdIcon(alias) renders the target SVG with data-icon = the core name', () => {
    const pairs = [['x', 'close'], ['chevron-left', 'prev'], ['chevron-right', 'next'], ['chevron-up', 'up'],
      ['chevron-down', 'down'], ['ellipsis', 'more'], ['external-link', 'external'], ['expand', 'fullscreen'],
      ['pen', 'pencil']];
    for (const [alias, target] of pairs) {
      const a = tdIcon(alias);
      const t = tdIcon(target);
      expect(a, alias).to.not.equal(null);
      expect(a.getAttribute('data-icon')).to.equal(target);
      expect(a.outerHTML).to.equal(t.outerHTML);
      expect(hasIcon(alias)).to.equal(true);
    }
    expect(listIcons()).to.not.include('x');
  });

  it('a registered site icon with an alias name wins over the alias (same rule as PHP)', () => {
    registerIcons({ ellipsis: { viewBox: '0 0 24 24', paint: 'fill', nodes: [['circle', { cx: 12, cy: 12, r: 2 }]] } });
    expect(resolveIconName('ellipsis')).to.equal('ellipsis');
    expect(tdIcon('ellipsis').getAttribute('data-icon')).to.equal('ellipsis');
  });

  it('td-button icon="external-link" renders the registry SVG (no warning, no <i>)', () => {
    let host;
    const warns = captureWarn(() => { host = mount('<td-button icon="external-link">Mở</td-button>'); });
    expect(warns).to.have.length(0);
    const svg = host.querySelector('.td-btn__icon svg.td-icon');
    expect(svg.getAttribute('data-icon')).to.equal('external');
    expect(host.querySelector('.td-btn__icon i')).to.equal(null);
  });

  it('an unknown registry-style name warns ONCE (per name), not silently', () => {
    const warns = captureWarn(() => {
      mount('<td-button icon="donwload-v018">A</td-button>');
      mount('<td-button icon="donwload-v018">B</td-button>');
      container.lastElementChild.setAttribute('variant', 'secondary'); // re-render
    });
    expect(warns).to.have.length(1);
    expect(String(warns[0][0])).to.contain('donwload-v018');
  });

  it('Font Awesome class lists keep the legacy <i> path without a warning', () => {
    let host;
    const warns = captureWarn(() => { host = mount('<td-button icon="fas fa-edit">Sửa</td-button>'); });
    expect(warns).to.have.length(0);
    expect(host.querySelector('.td-btn__icon i').className).to.equal('fas fa-edit');
  });
});
