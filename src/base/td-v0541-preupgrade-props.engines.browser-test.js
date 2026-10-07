import { expect } from '@esm-bundle/chai';
import * as KIT from '../../index.js';

// v0.54.1 (plan docs/internal/plans/v0.54.1-preupgrade-props.md) — a property assigned while the element is NOT yet
// upgraded (clone of <template> content, createElement before define, a DOMParser document) is an own data property
// that shadows the class accessor. It must reach the setter when the element upgrades + connects — for EVERY public
// setter of EVERY kit element, in Chromium, Firefox and WebKit. DOM nodes are compared as booleans (a failing chai
// assertion carrying DOM nodes hangs the runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const tick = () => new Promise((r) => setTimeout(r, 0));
const cleanup = [];
afterEach(() => cleanup.splice(0).forEach((f) => f()));

const fn = () => () => {};
const iconNode = () => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', 'pp-icon');
  return s;
};

/**
 * One case = a tag, its markup attributes, a factory of property values (assigned in this order before the upgrade),
 * optional readback overrides (`read`), props whose getter cannot echo the value (`skip`), and an optional behaviour
 * check on the real tag (`check`, not run for the late-defined subclass tag).
 */
const CASES = [
  {
    tag: 'td-table', attrs: { selectable: 'multiple' },
    props: () => ({
      columns: [{ key: 'a', label: 'Cột A' }, { key: 'b', label: 'Cột B' }],
      data: [{ id: '1', a: 'x1', b: 'y1' }, { id: '2', a: 'x2', b: 'y2' }],
      onSort: fn(), onPageChange: fn(), onRowAction: fn(), hiddenColumns: ['b'], rowKey: 'id', rowSelectable: fn(),
      onSelectChange: fn(), selectedKeys: ['2'], layout: 'cards', cardBelow: 'lg', cellPaddingClass: 'px-2', zebra: false,
    }),
    check(el) {
      const text = el.textContent;
      expect(text.includes('Cột A'), 'header rendered').to.equal(true);
      expect(text.includes('x1') && text.includes('x2'), 'rows rendered').to.equal(true);
      expect(el.getAttribute('layout')).to.equal('cards');
      expect(el.getAttribute('zebra')).to.equal('false');
    },
  },
  {
    tag: 'td-tabs',
    props: () => ({ tabs: [{ id: 'a', label: 'Một' }, { id: 'b', label: 'Hai' }], onChange: fn() }),
    check(el) {
      expect(el.querySelectorAll('[role="tab"]').length).to.equal(2);
      expect(el.textContent.includes('Hai')).to.equal(true);
    },
  },
  { tag: 'td-media-grid', props: () => ({ onSelectChange: fn() }) },
  {
    tag: 'td-hint', attrs: { id: 'pp-hint-$' }, before: '<input id="pp-ctl-$">',
    props: (n) => ({ htmlFor: `pp-ctl-${n}` }),
    check(el, n) {
      expect(el.getAttribute('for')).to.equal(`pp-ctl-${n}`);
      expect(el.control === document.getElementById(`pp-ctl-${n}`), 'linked to the control').to.equal(true);
    },
  },
  {
    tag: 'td-drawer', attrs: { label: 'Ngăn kéo' }, inner: '<p>Nội dung</p>',
    props: () => ({ beforeClose: fn(), open: true }),
    check(el) { expect(el.open).to.equal(true); },
    done(el) { el.open = false; },
  },
  { tag: 'td-copy', props: () => ({ value: 'sao chép' }) },
  { tag: 'td-rating', props: () => ({ max: 10, value: 3.5, count: 12 }) },
  { tag: 'td-diff', props: () => ({ fields: [{ path: 'name', label: 'Tên' }], before: { name: 'A' }, after: { name: 'B' } }),
    check(el) { expect(el.textContent.includes('Tên')).to.equal(true); } },
  { tag: 'td-diff', props: () => ({ items: [{ key: 'x', label: 'X', before: 1, after: 2 }] }) },
  { tag: 'td-empty-state', props: () => ({ actions: [{ label: 'Tạo mới', onClick: fn() }], iconNode: iconNode() }),
    check(el) { expect(el.textContent.includes('Tạo mới')).to.equal(true); } },
  { tag: 'td-filter-chips', props: () => ({ items: [{ key: 'q', label: 'Tìm', value: 'a' }] }),
    check(el) { expect(el.textContent.includes('Tìm')).to.equal(true); } },
  { tag: 'td-masked-value', props: () => ({ reveal: fn() }) },
  { tag: 'td-steps', props: () => ({ steps: [{ label: 'Bước một' }, { label: 'Bước hai' }] }),
    check(el) { expect(el.textContent.includes('Bước hai')).to.equal(true); } },
  {
    tag: 'td-timeline',
    props: () => ({ items: [{ id: 'a', time: '2026-10-05T01:00:00Z', title: 'Sự kiện A' }], loadMore: fn(), renderDetails: fn(),
      now: new Date('2026-10-06T00:00:00Z') }),
    read: { items: [{ id: 'a', title: 'Sự kiện A' }] }, // time comes back as a normalised ISO string
    check(el) { expect(el.textContent.includes('Sự kiện A')).to.equal(true); },
  },
  { tag: 'td-checkbox', attrs: { label: 'Ô' }, props: () => ({ indeterminate: true }) },
  { tag: 'td-input-field', attrs: { label: 'Tên' }, props: () => ({ value: 'xin chào' }) },
  { tag: 'td-number-input', attrs: { label: 'Số' }, props: () => ({ value: '12' }) },
  { tag: 'td-otp-input', attrs: { label: 'OTP' }, props: () => ({ length: 4, charset: 'numeric', value: '1234' }) },
  {
    tag: 'td-color-picker', attrs: { label: 'Màu' },
    props: () => ({ value: '#112233', custom: false, eyedropper: false, presets: [{ value: '#ffffff', label: 'Trắng' }] }),
  },
  {
    tag: 'td-dropdown', attrs: { label: 'Chọn' },
    props: () => ({ options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], value: 'b', searchable: false,
      allowClear: false, onChange: fn(), onSelect: fn(), onCreate: fn(), createLabel: 'Tạo "{query}"' }),
    check(el) { expect(el.textContent.includes('B')).to.equal(true); },
  },
  {
    tag: 'td-chip-input', attrs: { label: 'Thẻ' },
    props: () => ({ options: [{ value: 'php', label: 'PHP' }], value: [{ value: 'php', label: 'PHP' }], search: fn(), create: fn(),
      renderOption: fn(), renderChip: fn(), messages: { empty: 'Trống' } }),
    skip: ['renderChip'],
  },
  {
    tag: 'td-choice-group', attrs: { label: 'Nhóm' },
    props: () => ({ options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], value: 'b' }),
  },
  {
    tag: 'td-cropper', props: () => ({ presets: [{ label: 'Vuông', ratio: 1 }], crop: { normalized: { x: 0, y: 0, width: 0.5, height: 0.5 } },
      focalPoint: { x: 0.4, y: 0.6 } }),
    skip: ['crop'], // the getter needs a loaded image
  },
  { tag: 'td-datetime-range', attrs: { label: 'Khoảng' }, props: () => ({ presets: [{ label: 'Một ngày', days: 1 }] }) },
  { tag: 'td-dropzone', attrs: { label: 'Tệp' }, props: () => ({ upload: fn() }) },
  {
    tag: 'td-media-field', attrs: { label: 'Ảnh' },
    props: () => ({ adapter: { get: async () => null }, pickerOptions: { title: 'Chọn ảnh' }, value: 'img-1' }),
  },
  {
    tag: 'td-media-gallery', attrs: { label: 'Bộ ảnh' },
    props: () => ({ adapter: { get: async () => null }, pickerOptions: { title: 'Chọn ảnh' }, value: ['a', 'b'] }),
  },
  { tag: 'td-password-meter', props: () => ({ score: fn() }) },
  { tag: 'td-scan-input', attrs: { label: 'Quét' }, props: () => ({ validate: fn(), value: 'ABC1', muted: true }) },
  { tag: 'td-scan-input', attrs: { label: 'Quét', multiple: '' }, props: () => ({ values: ['X1', 'X2'] }) },
  {
    tag: 'td-tree', attrs: { label: 'Cây' },
    props: () => ({ data: [{ value: 'p', label: 'Cha', children: [{ value: 'a', label: 'Con A' }] }], loadChildren: fn(), value: 'a' }),
  },
  {
    tag: 'td-tree-select', attrs: { label: 'Cây' },
    props: () => ({ data: [{ value: 'p', label: 'Cha', children: [{ value: 'a', label: 'Con A' }] }], loadChildren: fn(),
      searchable: false, value: 'a' }),
  },
  {
    tag: 'td-check-matrix', attrs: { label: 'Quyền' },
    props: () => ({ columns: [{ key: 'r', label: 'Đọc' }], rows: [{ key: 'u', label: 'User' }], cells: {}, value: { r: ['u'] } }),
    check(el) { expect(el.textContent.includes('Đọc') && el.textContent.includes('User')).to.equal(true); },
  },
];

/** Does `got` carry `want`? Functions / nodes by identity, dates by time, arrays element-wise, objects key subset. */
function carries(got, want) {
  if (typeof want === 'function' || (typeof Node !== 'undefined' && want instanceof Node)) return got === want;
  if (want instanceof Date) return got instanceof Date && got.getTime() === want.getTime();
  if (Array.isArray(want)) return Array.isArray(got) && got.length === want.length && want.every((w, i) => carries(got[i], w));
  if (want && typeof want === 'object') return !!got && typeof got === 'object' && Object.keys(want).every((k) => carries(got[k], want[k]));
  return got === want;
}

/** Every public setter on the class prototype chain below HTMLElement. */
function setterNames(C) {
  const out = new Set();
  for (let p = C.prototype; p && p !== HTMLElement.prototype; p = Object.getPrototypeOf(p)) {
    for (const k of Object.getOwnPropertyNames(p)) {
      if (k.startsWith('_')) continue;
      if (Object.getOwnPropertyDescriptor(p, k).set) out.add(k);
    }
  }
  return out;
}

let seq = 0;
const markup = (tag, c, n) => {
  const attrs = Object.entries(c.attrs || {}).map(([k, v]) => ` ${k}="${String(v).replace('$', n)}"`).join('');
  return `${(c.before || '').replaceAll('$', n)}<${tag}${attrs}>${c.inner || ''}</${tag}>`;
};
const mount = () => {
  const host = document.createElement('div');
  document.body.append(host);
  cleanup.push(() => host.remove());
  return host;
};

async function verify(el, c, n, values, { behaviour }) {
  await tick();
  expect(el instanceof customElements.get(el.localName), 'upgraded').to.equal(true);
  for (const p of Object.keys(values)) {
    const d = Object.getOwnPropertyDescriptor(el, p);
    expect(!d || !('value' in d), `${c.tag}.${p}: no own data property left`).to.equal(true);
    if ((c.skip || []).includes(p)) continue;
    const want = c.read && p in c.read ? c.read[p] : values[p];
    expect(carries(el[p], want), `${c.tag}.${p} reached the setter`).to.equal(true);
  }
  if (behaviour && c.check) c.check(el, n);
  c.done?.(el);
}

describe('v0.54.1 — properties assigned before the upgrade reach the setters', () => {
  it('the case table covers every public setter of every kit element', () => {
    const covered = new Map();
    for (const c of CASES) {
      const set = covered.get(c.tag) || new Set();
      Object.keys(c.props(0)).forEach((p) => set.add(p));
      covered.set(c.tag, set);
    }
    const missing = [];
    let tags = 0;
    for (const C of Object.values(KIT)) {
      if (typeof C !== 'function' || !(C.prototype instanceof HTMLElement)) continue;
      const tag = customElements.getName ? customElements.getName(C) : null;
      if (!tag) continue;
      tags += 1;
      for (const p of setterNames(C)) if (!covered.get(tag)?.has(p)) missing.push(`${tag}.${p}`);
    }
    expect(tags, 'kit elements found').to.be.at.least(45);
    expect(missing).to.deep.equal([]);
  });

  for (const [i, c] of CASES.entries()) {
    it(`${c.tag}#${i}: <template> clone → assign → append`, async () => {
      const n = ++seq;
      const tpl = document.createElement('template');
      tpl.innerHTML = markup(c.tag, c, n);
      const frag = tpl.content.cloneNode(true);
      const el = frag.querySelector(c.tag);
      expect(el instanceof customElements.get(c.tag), 'not upgraded yet (inert document)').to.equal(false);
      const values = c.props(n);
      for (const [k, v] of Object.entries(values)) el[k] = v;
      mount().append(frag);
      await verify(el, c, n, values, { behaviour: true });
    });

    it(`${c.tag}#${i}: DOMParser document → assign → adoptNode + append`, async () => {
      const n = ++seq;
      const doc = new DOMParser().parseFromString(`<!doctype html><body>${markup(c.tag, c, n)}`, 'text/html');
      const el = doc.querySelector(c.tag);
      expect(el instanceof customElements.get(c.tag)).to.equal(false);
      const values = c.props(n);
      for (const [k, v] of Object.entries(values)) el[k] = v;
      const host = mount();
      for (const node of [...doc.body.childNodes]) host.append(document.adoptNode(node));
      await verify(el, c, n, values, { behaviour: true });
    });

    for (const order of ['append-then-define', 'define-then-append']) {
      it(`${c.tag}#${i}: createElement before define → assign → ${order}`, async () => {
        const n = ++seq;
        const tag = `${c.tag}-pp${n}`;
        const host = mount();
        host.innerHTML = markup(tag, c, n);
        const el = host.querySelector(tag);
        el.remove(); // disconnected, undefined: exactly a createElement before define
        const values = c.props(n);
        for (const [k, v] of Object.entries(values)) el[k] = v;
        const Base = customElements.get(c.tag);
        if (order === 'append-then-define') {
          host.append(el);
          customElements.define(tag, class extends Base {});
        } else {
          customElements.define(tag, class extends Base {});
          expect(el instanceof Base, 'a disconnected element is not upgraded by define').to.equal(false);
          host.append(el);
        }
        await verify(el, c, n, values, { behaviour: false });
      });
    }
  }

  it('td-table: assignment order is kept (rowKey + data before selectedKeys) and one render shows the final state', async () => {
    const tpl = document.createElement('template');
    tpl.innerHTML = '<td-table selectable="multiple"></td-table>';
    const el = tpl.content.cloneNode(true).querySelector('td-table');
    el.columns = [{ key: 'a', label: 'A' }];
    el.rowKey = 'id';
    el.data = [{ id: 'k1', a: 'one' }, { id: 'k2', a: 'two' }];
    el.selectedKeys = ['k2'];
    mount().append(el);
    await tick();
    expect(el.selectedKeys).to.deep.equal(['k2']);
    expect(el.selectedRows.map((r) => r.a)).to.deep.equal(['two']);
    expect(el.textContent.includes('one') && el.textContent.includes('two')).to.equal(true);
  });

  it('td-drawer: <td-drawer open> + pre-upgrade open = false stays closed (Codex impl r1)', async () => {
    const tpl = document.createElement('template');
    tpl.innerHTML = '<td-drawer open label="Ngăn kéo"><p>Nội dung</p></td-drawer>';
    const el = tpl.content.cloneNode(true).querySelector('td-drawer');
    el.open = false;
    mount().append(el);
    await tick();
    expect(el.open).to.equal(false);
    expect(el.hasAttribute('open')).to.equal(false);
  });
});
