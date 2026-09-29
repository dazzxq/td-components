import { expect } from '@esm-bundle/chai';
import { TdDropzone } from './td-dropzone.js';

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

const file = (name, size = 10, type = 'text/plain') => new File([new Uint8Array(size)], name, { type });
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const statusOf = (item) => item.querySelector('.td-dropzone__status');

/** Mount a dropzone whose hook never settles on its own; returns the per-call controls. */
function withHook(html = '<td-dropzone multiple></td-dropzone>') {
  const dz = mount(html);
  const calls = [];
  dz.upload = (f, ctx) => new Promise((resolve, reject) => {
    calls.push({ f, ctx, resolve, reject });
    ctx.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  return { dz, calls };
}

describe('v0.19.0 G2 — td-dropzone upload error reason', () => {
  it('reject(new Error(msg)) → the row shows the message as text', async () => {
    const { dz, calls } = withHook();
    dz.addFiles([file('a.txt')]);
    calls[0].reject(new Error('Máy chủ từ chối: quá lớn'));
    await tick();
    const item = dz.querySelector('.td-dropzone__item');
    expect(item.getAttribute('data-status')).to.equal('error');
    expect(statusOf(item).textContent).to.equal('Máy chủ từ chối: quá lớn');
    expect(statusOf(item).hidden).to.equal(false);
    expect(item.querySelector('td-progress').getAttribute('variant')).to.equal('danger');
  });

  it('an <img onerror> message is rendered as text, never markup', async () => {
    window.__dzErrXss = 0;
    const evil = '<img src=x onerror="window.__dzErrXss=1">Lỗi';
    const { dz, calls } = withHook();
    dz.addFiles([file('a.txt')]);
    calls[0].reject(new Error(evil));
    await tick(50);
    const status = statusOf(dz.querySelector('.td-dropzone__item'));
    expect(status.textContent).to.equal(evil);
    expect(status.children).to.have.length(0);
    expect(dz.querySelector('img')).to.equal(null);
    expect(window.__dzErrXss).to.equal(0);
  });

  it('an object with a string message counts; the text is trimmed and capped at 200 characters', async () => {
    const { dz, calls } = withHook();
    dz.addFiles([file('a.txt'), file('b.txt')]);
    calls[0].reject({ message: '  Hết hạn phiên  ' });
    calls[1].reject(new Error('x'.repeat(500)));
    await tick();
    const items = dz.querySelectorAll('.td-dropzone__item');
    expect(statusOf(items[0]).textContent).to.equal('Hết hạn phiên');
    const long = statusOf(items[1]).textContent;
    expect([...long]).to.have.length(200);
    expect(long.endsWith('…')).to.equal(true);
  });

  it('a huge message is capped without breaking (bounded work)', async () => {
    const { dz, calls } = withHook();
    dz.addFiles([file('a.txt')]);
    calls[0].reject(new Error('   ' + 'ä'.repeat(2_000_000)));
    await tick();
    const text = statusOf(dz.querySelector('.td-dropzone__item')).textContent;
    expect([...text]).to.have.length(200);
    expect(text.startsWith('ä')).to.equal(true);
  });

  it('no usable message → the generic (translatable) label', async () => {
    TdDropzone.labels.uploadError = 'Upload failed';
    const { dz, calls } = withHook();
    dz.addFiles([file('a.txt'), file('b.txt'), file('c.txt'), file('d.txt'), file('e.txt')]);
    calls[0].reject(new Error(''));
    calls[1].reject({ message: { html: '<b>x</b>' } }); // non-string message
    calls[2].reject({ code: 500 }); // object without message
    calls[3].reject(undefined);
    calls[4].reject('   ');
    await tick();
    const texts = [...dz.querySelectorAll('.td-dropzone__item')].map((i) => statusOf(i).textContent);
    expect(texts).to.deep.equal(Array(5).fill('Upload failed'));
  });

  it('a hook that throws synchronously shows its message too', async () => {
    const dz = mount('<td-dropzone></td-dropzone>');
    dz.upload = () => { throw new Error('Chưa đăng nhập'); };
    dz.addFiles([file('a.txt')]);
    await tick();
    expect(statusOf(dz.querySelector('.td-dropzone__item')).textContent).to.equal('Chưa đăng nhập');
  });

  it('abort (remove / reset) shows no error', async () => {
    const form = mount('<form><td-dropzone name="f" multiple></td-dropzone></form>');
    const dz = form.querySelector('td-dropzone');
    const calls = [];
    dz.upload = (f, ctx) => new Promise((resolve, reject) => {
      calls.push(ctx);
      ctx.signal.addEventListener('abort', () => reject(new Error('Đã huỷ')));
    });
    dz.addFiles([file('a.txt'), file('b.txt')]);
    dz.removeFile(0);
    await tick();
    expect(calls[0].signal.aborted).to.equal(true);
    const item = dz.querySelector('.td-dropzone__item');
    expect(item.getAttribute('data-status')).to.equal('uploading');
    expect(dz.textContent).to.not.contain('Đã huỷ');
    form.reset();
    await tick();
    expect(dz.querySelectorAll('.td-dropzone__item')).to.have.length(0);
    expect(dz.textContent).to.not.contain('Đã huỷ');
  });

  it('a new upload after an error starts clean (no old message)', async () => {
    const { dz, calls } = withHook('<td-dropzone></td-dropzone>');
    dz.addFiles([file('a.txt')]);
    calls[0].reject(new Error('Lỗi mạng'));
    await tick();
    dz.setValue([file('a.txt')]);
    const item = dz.querySelector('.td-dropzone__item');
    expect(statusOf(item).textContent).to.equal('Đang chờ…');
  });
});

describe('v0.19.0 G2 — td-dropzone waiting state', () => {
  it('a queued file without onProgress yet → indeterminate progress + "Đang chờ…"; onProgress(30) → 30%', () => {
    const { dz, calls } = withHook();
    dz.addFiles([file('a.txt')]);
    const item = dz.querySelector('.td-dropzone__item');
    const bar = item.querySelector('td-progress');
    expect(item.getAttribute('data-status')).to.equal('uploading');
    expect(item.hasAttribute('data-waiting')).to.equal(true);
    expect(bar.hidden).to.equal(false);
    expect(bar.hasAttribute('value')).to.equal(false);
    expect(bar.indeterminate).to.equal(true);
    expect(bar.getAttribute('aria-busy')).to.equal('true');
    expect(bar.hasAttribute('aria-valuenow')).to.equal(false);
    expect(statusOf(item).textContent).to.equal('Đang chờ…');
    expect(dz.uploading).to.equal(true);
    calls[0].ctx.onProgress(30); // one argument = percent 0–100
    expect(item.hasAttribute('data-waiting')).to.equal(false);
    expect(bar.indeterminate).to.equal(false);
    expect(bar.getAttribute('aria-valuenow')).to.equal('30');
    expect(bar.percent).to.equal(30);
    expect(statusOf(item).textContent).to.equal('Đang tải lên…');
  });

  it('onProgress(loaded, total) also leaves the waiting state', () => {
    const { dz, calls } = withHook();
    dz.addFiles([file('a.txt')]);
    const item = dz.querySelector('.td-dropzone__item');
    calls[0].ctx.onProgress(1, 4);
    expect(item.hasAttribute('data-waiting')).to.equal(false);
    expect(item.querySelector('td-progress').getAttribute('aria-valuenow')).to.equal('25');
  });

  it('an invalid onProgress call keeps waiting; onProgress(0) is a real 0%', () => {
    const { dz, calls } = withHook();
    dz.addFiles([file('a.txt')]);
    const item = dz.querySelector('.td-dropzone__item');
    calls[0].ctx.onProgress(5, 0); // total 0 → ignored
    calls[0].ctx.onProgress('abc');
    expect(item.hasAttribute('data-waiting')).to.equal(true);
    calls[0].ctx.onProgress(0);
    expect(item.hasAttribute('data-waiting')).to.equal(false);
    expect(item.querySelector('td-progress').getAttribute('aria-valuenow')).to.equal('0');
  });

  it('site-side concurrency: queued files wait until their slot starts reporting', async () => {
    const dz = mount('<td-dropzone multiple></td-dropzone>');
    let running = Promise.resolve();
    const starters = [];
    dz.upload = (f, { onProgress }) => {
      running = running.then(() => new Promise((resolve) => { starters.push({ onProgress, resolve }); }));
      return running;
    };
    dz.addFiles([file('a.txt'), file('b.txt')]);
    await tick();
    const [a, b] = dz.querySelectorAll('.td-dropzone__item');
    starters[0].onProgress(50);
    expect(a.hasAttribute('data-waiting')).to.equal(false);
    expect(b.hasAttribute('data-waiting')).to.equal(true);
    expect(statusOf(b).textContent).to.equal('Đang chờ…');
    starters[0].resolve();
    await tick();
    expect(starters).to.have.length(2);
    starters[1].onProgress(10);
    expect(b.hasAttribute('data-waiting')).to.equal(false);
    expect(b.querySelector('td-progress').getAttribute('aria-valuenow')).to.equal('10');
  });

  it('uploadWaiting is translatable; a resolve without progress → done at 100%', async () => {
    TdDropzone.labels.uploadWaiting = 'Queued…';
    const { dz, calls } = withHook();
    dz.addFiles([file('a.txt')]);
    const item = dz.querySelector('.td-dropzone__item');
    expect(statusOf(item).textContent).to.equal('Queued…');
    calls[0].resolve();
    await tick();
    expect(item.hasAttribute('data-waiting')).to.equal(false);
    expect(item.getAttribute('data-status')).to.equal('done');
    expect(item.querySelector('td-progress').getAttribute('aria-valuenow')).to.equal('100');
  });
});

describe('v0.19.0 G3 — td-dropzone accept-label', () => {
  const hintOf = (dz) => dz.querySelector('.td-dropzone__hint');
  const describedBy = (dz) => (dz.querySelector('.td-dropzone__browse').getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);

  it('absent → the accept list as before', () => {
    const dz = mount('<td-dropzone accept=".jpg,.jpeg,image/jpeg" max-size="5MB"></td-dropzone>');
    expect(hintOf(dz).textContent).to.equal('Định dạng: .jpg, .jpeg, image/jpeg · Tối đa 5 MB mỗi file');
  });

  it('non-empty → replaces {accept}; filtering still follows accept', () => {
    const dz = mount('<td-dropzone multiple accept=".jpg,image/jpeg" accept-label="Ảnh JPEG" max-size="5MB"></td-dropzone>');
    expect(hintOf(dz).textContent).to.equal('Định dạng: Ảnh JPEG · Tối đa 5 MB mỗi file');
    const res = dz.addFiles([file('a.jpg', 10, 'image/jpeg'), file('b.png', 10, 'image/png')]);
    expect(res.accepted.map((f) => f.name)).to.deep.equal(['a.jpg']);
    expect(res.rejected[0].reason).to.equal('type');
    expect(dz.querySelector('input[type="file"]').accept).to.equal('.jpg,image/jpeg');
  });

  it('non-empty uses the translatable hintAccept template', () => {
    TdDropzone.labels.hintAccept = 'Formats: {accept}';
    const dz = mount('<td-dropzone accept="image/*" accept-label="Images"></td-dropzone>');
    expect(hintOf(dz).textContent).to.equal('Formats: Images');
  });

  it('empty → only the format part is dropped; size / count stay', () => {
    const dz = mount('<td-dropzone multiple accept=".pdf" accept-label="" max-size="5MB" max-files="3"></td-dropzone>');
    expect(hintOf(dz).textContent).to.equal('Tối đa 5 MB mỗi file · Tối đa 3 file');
    expect(hintOf(dz).hidden).to.equal(false);
    expect(describedBy(dz)).to.include(hintOf(dz).id);
    expect(dz.addFiles([file('a.txt')]).rejected[0].reason).to.equal('type');
  });

  it('empty and nothing else → the hint is hidden and aria-describedby does not point at it', () => {
    const dz = mount('<td-dropzone accept=".pdf" accept-label=""></td-dropzone>');
    expect(hintOf(dz).hidden).to.equal(true);
    expect(hintOf(dz).textContent).to.equal('');
    expect(describedBy(dz)).to.not.include(hintOf(dz).id);
  });

  it('whitespace-only counts as empty; the hint + aria-describedby follow attribute changes', () => {
    const dz = mount('<td-dropzone accept=".pdf" accept-label="   "></td-dropzone>');
    expect(hintOf(dz).hidden).to.equal(true);
    dz.setAttribute('accept-label', 'Tài liệu PDF');
    expect(hintOf(dz).textContent).to.equal('Định dạng: Tài liệu PDF');
    expect(describedBy(dz)).to.include(hintOf(dz).id);
    dz.setAttribute('accept-label', '');
    expect(hintOf(dz).hidden).to.equal(true);
    expect(describedBy(dz)).to.not.include(hintOf(dz).id);
    dz.removeAttribute('accept-label');
    expect(hintOf(dz).textContent).to.equal('Định dạng: .pdf');
    expect(describedBy(dz)).to.include(hintOf(dz).id);
  });

  it('with error-text, aria-describedby keeps the error note but not a hidden hint', () => {
    const dz = mount('<td-dropzone accept=".pdf" accept-label="" error-text="Bắt buộc"></td-dropzone>');
    const ids = describedBy(dz);
    expect(ids).to.not.include(hintOf(dz).id);
    expect(ids.map((id) => document.getElementById(id)?.textContent)).to.include('Bắt buộc');
  });

  it('the friendly label is text (no markup)', () => {
    const dz = mount('<td-dropzone accept=".pdf" accept-label="<b>PDF</b>"></td-dropzone>');
    expect(hintOf(dz).textContent).to.equal('Định dạng: <b>PDF</b>');
    expect(hintOf(dz).querySelector('b')).to.equal(null);
  });
});
