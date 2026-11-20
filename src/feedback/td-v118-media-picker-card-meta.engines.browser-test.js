import { expect } from '@esm-bundle/chai';

// v0.118.0 (plan docs/internal/plans/v0.118.0-media-picker-card-meta.md) — `cardMeta` + `nameLines` of <td-media-picker>
// in Chromium, Firefox AND WebKit.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { TdMediaPicker } = await import('./td-media-picker.js');
const { TdModal } = await import('./td-modal.js');
const { _resetCoreWarnings } = await import('../utils/media-picker-core.js');
const { createMockAdapter } = await import('../../test/fixtures/media-adapter.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000, what = 'condition') {
  const t0 = performance.now();
  for (;;) {
    let v;
    try { v = fn(); } catch { v = false; }
    if (v) return v;
    if (performance.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await wait(10);
  }
}
const live = (sel) => [...document.body.querySelectorAll(`:scope > ${sel}`)].find((r) => r.getAttribute('data-state') !== 'closing') || null;
const pickerRoot = () => live('.td-media-picker');
const items = () => [...(pickerRoot()?.querySelectorAll('[data-td-media-item]') || [])];
const item = (id) => items().find((i) => i.getAttribute('data-id') === id) || null;
const opener = (id) => item(id)?.querySelector('[data-td-media-open]') || null;
const metaEl = (id) => item(id)?.querySelector('.td-media-picker__meta') || null;
const nameEl = (id) => item(id)?.querySelector('.td-media-picker__name') || null;
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0 }));
const L = TdMediaPicker.labels;
const MIN5 = () => new Date(Date.now() - 5 * 60 * 1000 - 5000).toISOString();

/** Open with the mock adapter; `patch(db)` edits the raw assets first. Resolves once the first page is shown. */
async function openReady(opts = {}, patch = null) {
  const ad = createMockAdapter();
  if (patch) patch(ad.db);
  const promise = TdMediaPicker.open({ autoSelectFirst: false, ...opts, adapter: ad });
  promise.catch(() => {});
  await until(() => items().length > 0, 4000, 'first page');
  return { ad, promise };
}
const edit = (db, id, patch) => Object.assign(db.get(id), patch);

async function closeAll() {
  for (const h of document.querySelectorAll('td-media-picker')) if (h.isOpen) h.close('programmatic');
  TdModal.closeAll();
  TdMediaPicker.cancelUploads();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-modal'), 4000, 'all closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
}
afterEach(async () => {
  await closeAll();
  TdMediaPicker.configureDefaults({});
  _resetCoreWarnings();
});

const ABS = /^\d+(\.\d+)? (Bytes|KB|MB|GB|TB) • \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/;
const longName = 'một-cái-tên-rất-dài-rất-dài-rất-dài-rất-dài-rất-dài-rất-dài-rất-dài-rất-dài-rất-dài-rất-dài-rất-dài-rất-dài.jpg';

describe('td-media-picker — cardMeta (v0.118.0 QĐ1)', () => {
  it('absent = today: the absolute text, wrapping CSS, no data attributes', async () => {
    await openReady({});
    const root = pickerRoot();
    expect(root.hasAttribute('data-card-meta')).to.equal(false);
    expect(root.hasAttribute('data-name-lines')).to.equal(false);
    expect(metaEl('m60').textContent).to.match(ABS);
    expect(getComputedStyle(metaEl('m60')).whiteSpace).to.equal('normal');
    expect(getComputedStyle(nameEl('m60')).whiteSpace).to.equal('nowrap');
    expect(metaEl('m60').hasAttribute('title')).to.equal(false);
  });

  it("'absolute' is the same as absent", async () => {
    await openReady({});
    const a = metaEl('m60').textContent;
    await closeAll();
    await openReady({ cardMeta: 'absolute' });
    expect(metaEl('m60').textContent).to.equal(a);
    expect(pickerRoot().hasAttribute('data-card-meta')).to.equal(false);
  });

  it("'relative': short size · relative time, one line, no tooltip, aria-label uses it", async () => {
    await openReady({ cardMeta: 'relative' }, (db) => edit(db, 'm60', { byteSize: 174 * 1024 + 300, createdAt: MIN5() }));
    expect(pickerRoot().getAttribute('data-card-meta')).to.equal('single');
    expect(metaEl('m60').textContent).to.equal('174 KB · 5m trước');
    const cs = getComputedStyle(metaEl('m60'));
    expect(cs.whiteSpace).to.equal('nowrap');
    expect(cs.textOverflow).to.equal('ellipsis');
    expect(metaEl('m60').hasAttribute('title')).to.equal(false);
    expect(opener('m60').getAttribute('aria-label')).to.contain('174 KB · 5m trước');
  });

  it('byteSize 0 → only the relative time, no separator; an invalid date → only the size', async () => {
    await openReady({ cardMeta: 'relative' }, (db) => {
      edit(db, 'm60', { byteSize: 0, createdAt: MIN5() });
      edit(db, 'm59', { byteSize: 2048, createdAt: 'nope' });
    });
    expect(metaEl('m60').textContent).to.equal('5m trước');
    expect(metaEl('m59').textContent).to.equal('2 KB');
  });

  it('the detail pane keeps the absolute date', async () => {
    await openReady({ cardMeta: 'relative' }, (db) => edit(db, 'm60', { createdAt: '2026-11-17T02:02:00Z' }));
    click(opener('m60'));
    await until(() => item('m60').hasAttribute('data-viewing'), 4000, 'detail');
    const det = () => pickerRoot().querySelector('.td-media-picker__detail')?.textContent || '';
    await until(() => /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(det()), 4000, 'absolute date in detail');
    expect(det()).to.not.match(/trước/);
  });

  it('labels override: relativeTime template and per-unit messages, and the labels object', async () => {
    await openReady({ cardMeta: 'relative', messages: { relativeTime: '{n} {unit} ago', 'relativeUnits.m': 'min' } },
      (db) => edit(db, 'm60', { byteSize: 1024, createdAt: MIN5() }));
    expect(metaEl('m60').textContent).to.equal('1 KB · 5 min ago');
    await closeAll();
    const saved = L.relativeUnits;
    try {
      TdMediaPicker.labels.relativeUnits = { ...saved, m: 'ph' };
      await openReady({ cardMeta: 'relative' }, (db) => edit(db, 'm60', { byteSize: 1024, createdAt: MIN5() }));
      expect(metaEl('m60').textContent).to.equal('1 KB · 5ph trước');
    } finally {
      TdMediaPicker.labels.relativeUnits = saved;
    }
  });

  it('function: its text, ctx helpers, textContent only', async () => {
    let ctx = null;
    await openReady({
      cardMeta: (a, c) => { if (a.id === 'm60') ctx = c; return `<b>${c.formatShortSize(a.byteSize)}</b>`; },
    }, (db) => edit(db, 'm60', { byteSize: 5 * 1024, createdAt: MIN5() }));
    expect(metaEl('m60').textContent).to.equal('<b>5 KB</b>');
    expect(metaEl('m60').querySelector('b')).to.equal(null);
    expect(pickerRoot().getAttribute('data-card-meta')).to.equal('single');
    expect(Object.keys(ctx).sort()).to.deep.equal(['formatDate', 'formatRelative', 'formatShortSize', 'formatSize', 'now']);
    expect(ctx.formatSize(1536)).to.equal('1.5 KB');
    expect(ctx.formatRelative(MIN5())).to.equal('5m trước');
    expect(ctx.formatDate('2026-11-17T02:02:00Z')).to.match(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    expect(typeof ctx.now).to.equal('number');
  });

  it('function that throws / returns a non-string or empty → the absolute text; throw logged once per open', async () => {
    const errs = [];
    const orig = console.error;
    console.error = (...a) => errs.push(a);
    try {
      await openReady({ cardMeta: () => { throw new Error('boom'); } });
      expect(metaEl('m60').textContent).to.match(ABS);
      expect(errs.length).to.equal(1);
      await closeAll();
      await openReady({ cardMeta: (a) => (a.id === 'm60' ? 5 : a.id === 'm59' ? '' : 'ok') });
      expect(metaEl('m60').textContent).to.match(ABS);
      expect(metaEl('m59').textContent).to.match(ABS);
      expect(metaEl('m58').textContent).to.equal('ok');
    } finally {
      console.error = orig;
    }
  });

  it('a bad value warns once through the static open() and acts as absent', async () => {
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => warns.push(a);
    try {
      await openReady({ cardMeta: 'bogus', nameLines: 7 });
    } finally {
      console.warn = orig;
    }
    expect(warns.filter((w) => String(w[0]).includes('cardMeta')).length).to.equal(1);
    expect(warns.filter((w) => String(w[0]).includes('nameLines')).length).to.equal(1);
    expect(pickerRoot().hasAttribute('data-card-meta')).to.equal(false);
    expect(pickerRoot().hasAttribute('data-name-lines')).to.equal(false);
    expect(metaEl('m60').textContent).to.match(ABS);
  });

  it('configureDefaults applies and open overrides', async () => {
    TdMediaPicker.configureDefaults({ cardMeta: 'relative', nameLines: 2 });
    await openReady({}, (db) => edit(db, 'm60', { byteSize: 1024, createdAt: MIN5() }));
    expect(metaEl('m60').textContent).to.equal('1 KB · 5m trước');
    expect(pickerRoot().getAttribute('data-name-lines')).to.equal('2');
    await closeAll();
    await openReady({ cardMeta: 'absolute', nameLines: 1 });
    expect(metaEl('m60').textContent).to.match(ABS);
    expect(pickerRoot().hasAttribute('data-name-lines')).to.equal(false);
  });
});

describe('td-media-picker — nameLines (v0.118.0 QĐ2)', () => {
  const lineClamp = (el) => {
    const cs = getComputedStyle(el);
    return cs.webkitLineClamp || cs.getPropertyValue('-webkit-line-clamp') || cs.getPropertyValue('line-clamp');
  };

  it('2 and 3 clamp the name (computed line clamp, wrapping, full name kept)', async () => {
    for (const n of [2, 3]) {
      await openReady({ nameLines: n }, (db) => edit(db, 'm60', { name: longName }));
      expect(pickerRoot().getAttribute('data-name-lines')).to.equal(String(n));
      const el = nameEl('m60');
      expect(String(lineClamp(el))).to.equal(String(n));
      expect(getComputedStyle(el).whiteSpace).to.equal('normal');
      expect(el.textContent).to.equal(longName);
      await closeAll();
    }
  });

  it('absent / 1 stays a single ellipsis line', async () => {
    await openReady({ nameLines: 1 }, (db) => edit(db, 'm60', { name: longName }));
    const cs = getComputedStyle(nameEl('m60'));
    expect(cs.whiteSpace).to.equal('nowrap');
    expect(cs.textOverflow).to.equal('ellipsis');
    expect(pickerRoot().hasAttribute('data-name-lines')).to.equal(false);
  });
});
