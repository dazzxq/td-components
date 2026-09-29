import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdDropzone, parseFileSize } from './td-dropzone.js';

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

/** Pick files through the real inner <input type=file> (what the browser does after the picker closes). */
function pick(dz, files) {
  const input = dz.querySelector('input[type="file"]');
  const dt = new DataTransfer();
  files.forEach((f) => dt.items.add(f));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Drop files with a real DataTransfer; returns the drop event (defaultPrevented tells if the page kept it). */
function drop(dz, files, target = dz.querySelector('.td-dropzone__zone')) {
  const dt = new DataTransfer();
  files.forEach((f) => dt.items.add(f));
  target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
  target.dispatchEvent(ev);
  return ev;
}

const names = (dz) => [...dz.querySelectorAll('.td-dropzone__name')].map((n) => n.textContent);
const formFiles = (form, name) => new FormData(form).getAll(name);

describe('v0.18.0 F4 — td-dropzone', () => {
  it('parseFileSize: bytes and KB/MB/GB (1024-based); invalid → null', () => {
    expect(parseFileSize('2048')).to.equal(2048);
    expect(parseFileSize('5MB')).to.equal(5 * 1024 * 1024);
    expect(parseFileSize('1.5 kb')).to.equal(1536);
    expect(parseFileSize('1G')).to.equal(1024 ** 3);
    expect(parseFileSize('')).to.equal(null);
    expect(parseFileSize('abc')).to.equal(null);
    expect(parseFileSize('0')).to.equal(null);
  });

  it('renders a real file input (no name, not tabbable), a choose button, hint and a labelled group', () => {
    const dz = mount('<td-dropzone name="doc" label="Tệp" accept=".pdf,image/*" multiple max-size="5MB" max-files="3" required></td-dropzone>');
    const input = dz.querySelector('input[type="file"]');
    expect(input.hasAttribute('name')).to.equal(false);
    expect(input.getAttribute('tabindex')).to.equal('-1');
    expect(input.accept).to.equal('.pdf,image/*');
    expect(input.multiple).to.equal(true);
    const root = dz.querySelector('.td-dropzone');
    expect(root.getAttribute('role')).to.equal('group');
    expect(document.getElementById(root.getAttribute('aria-labelledby')).textContent).to.contain('Tệp');
    expect(dz.querySelector('.td-field__required')).to.not.equal(null);
    const btn = dz.querySelector('.td-dropzone__browse');
    expect(btn.textContent).to.equal('Chọn file');
    const hint = dz.querySelector('.td-dropzone__hint');
    expect(hint.hidden).to.equal(false);
    expect(hint.textContent).to.equal('Định dạng: .pdf, image/* · Tối đa 5 MB mỗi file · Tối đa 3 file');
    expect(btn.getAttribute('aria-describedby')).to.contain(hint.id);
  });

  it('choosing files through the input lists them (name as text, size) and emits files-change', () => {
    const dz = mount('<td-dropzone name="f" multiple></td-dropzone>');
    const events = [];
    dz.addEventListener('files-change', (e) => events.push(e.detail));
    let inner = 0;
    host.addEventListener('change', () => inner++);
    pick(dz, [file('a.txt', 1536), file('b.txt')]);
    expect(names(dz)).to.deep.equal(['a.txt', 'b.txt']);
    expect(dz.querySelector('.td-dropzone__size').textContent).to.equal('1.5 KB');
    expect(dz.files.map((f) => f.name)).to.deep.equal(['a.txt', 'b.txt']);
    expect(events).to.have.length(1);
    expect(events[0].files.map((f) => f.name)).to.deep.equal(['a.txt', 'b.txt']);
    expect(events[0].rejected).to.deep.equal([]);
    expect(dz.querySelector('input[type="file"]').value).to.equal(''); // same file can be picked again
    expect(inner).to.equal(0); // the inner input's change stays inside
    expect(dz.querySelector('.td-dropzone__live').textContent).to.equal('Đã thêm 2 file');
  });

  it('drop with a DataTransfer adds files; dragover marks the zone; the drop default is prevented', () => {
    const dz = mount('<td-dropzone multiple></td-dropzone>');
    const root = dz.querySelector('.td-dropzone');
    const dt = new DataTransfer();
    dt.items.add(file('x.txt'));
    const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
    dz.querySelector('.td-dropzone__zone').dispatchEvent(over);
    expect(over.defaultPrevented).to.equal(true);
    expect(root.getAttribute('data-state')).to.equal('dragover');
    dz.dispatchEvent(new DragEvent('dragleave', { bubbles: true, relatedTarget: document.body }));
    expect(root.getAttribute('data-state')).to.equal('idle');
    const ev = drop(dz, [file('c.txt'), file('d.txt')]);
    expect(ev.defaultPrevented).to.equal(true);
    expect(root.getAttribute('data-state')).to.equal('idle');
    expect(names(dz)).to.deep.equal(['c.txt', 'd.txt']);
  });

  it('filters by accept (MIME, type/*, .ext), max-size and max-files; rejected files are listed + in the event', () => {
    const dz = mount('<td-dropzone multiple accept="image/*,.pdf,text/csv" max-size="1KB" max-files="2"></td-dropzone>');
    let detail = null;
    dz.addEventListener('files-change', (e) => { detail = e.detail; });
    drop(dz, [
      file('photo.PNG', 100, 'image/png'),
      file('doc.PDF', 100, ''),
      file('data.csv', 100, 'text/csv'),
      file('notes.txt', 100, 'text/plain'),
      file('big.jpg', 2048, 'image/jpeg'),
    ]);
    expect(names(dz)).to.deep.equal(['photo.PNG', 'doc.PDF']);
    expect(detail.rejected.map((r) => [r.file.name, r.reason])).to.deep.equal([
      ['data.csv', 'count'], ['notes.txt', 'type'], ['big.jpg', 'size'],
    ]);
    const rej = [...dz.querySelectorAll('.td-dropzone__reject')];
    expect(rej.map((li) => li.getAttribute('data-reason'))).to.deep.equal(['count', 'type', 'size']);
    expect(rej[2].textContent).to.equal('big.jpg: lớn hơn 1 KB');
    expect(rej[0].textContent).to.equal('data.csv: vượt quá số file cho phép (2)');
    // Existing files count toward max-files.
    drop(dz, [file('more.png', 10, 'image/png')]);
    expect(names(dz)).to.have.length(2);
    expect(detail.rejected[0].reason).to.equal('count');
  });

  it('without multiple: one file, a new pick replaces it', () => {
    const dz = mount('<td-dropzone name="avatar"></td-dropzone>');
    drop(dz, [file('1.txt'), file('2.txt')]);
    expect(names(dz)).to.deep.equal(['1.txt']);
    expect(dz.querySelector('.td-dropzone__reject').getAttribute('data-reason')).to.equal('count');
    pick(dz, [file('3.txt')]);
    expect(names(dz)).to.deep.equal(['3.txt']);
    expect(dz.querySelector('.td-dropzone__rejected').hidden).to.equal(true);
  });

  it('remove button: removes the file, announces, moves focus, emits files-change', () => {
    const dz = mount('<td-dropzone name="f" multiple></td-dropzone>');
    pick(dz, [file('a.txt'), file('b.txt'), file('c.txt')]);
    const events = [];
    dz.addEventListener('files-change', (e) => events.push(e.detail));
    const btn = dz.querySelectorAll('.td-dropzone__remove')[1];
    expect(btn.getAttribute('aria-label')).to.equal('Xoá b.txt');
    btn.click();
    expect(names(dz)).to.deep.equal(['a.txt', 'c.txt']);
    expect(events).to.have.length(1);
    expect(events[0].files.map((f) => f.name)).to.deep.equal(['a.txt', 'c.txt']);
    expect(document.activeElement).to.equal(dz.querySelectorAll('.td-dropzone__remove')[1]);
    expect(dz.querySelector('.td-dropzone__live').textContent).to.equal('Đã xoá b.txt');
    dz.querySelectorAll('.td-dropzone__remove')[1].click();
    dz.querySelectorAll('.td-dropzone__remove')[0].click();
    expect(dz.files).to.have.length(0);
    expect(dz.querySelector('.td-dropzone__list').hidden).to.equal(true);
    expect(document.activeElement).to.equal(dz.querySelector('.td-dropzone__browse'));
  });

  it('file names are text: <img onerror> in a name never becomes markup', async () => {
    window.__dzXss = 0;
    const dz = mount('<td-dropzone multiple max-size="1B"></td-dropzone>');
    const evil = '<img src=x onerror="window.__dzXss=1">.txt';
    dz.removeAttribute('max-size');
    pick(dz, [file(evil)]);
    dz.setAttribute('max-size', '1B');
    pick(dz, [file(`big${evil}`)]); // rejected row too
    await tick(50);
    expect(dz.querySelector('img')).to.equal(null);
    expect(dz.querySelector('.td-dropzone__name').textContent).to.equal(evil);
    expect(dz.querySelector('.td-dropzone__reject').textContent).to.contain(evil);
    expect(dz.querySelector('.td-dropzone__remove').getAttribute('aria-label')).to.equal(`Xoá ${evil}`);
    expect(window.__dzXss).to.equal(0);
  });

  it('form-associated: FormData carries the Files under name (one entry per file)', () => {
    const form = mount('<form><td-dropzone name="docs[]" multiple></td-dropzone></form>');
    const dz = form.querySelector('td-dropzone');
    expect(formFiles(form, 'docs[]')).to.deep.equal([]);
    const a = file('a.txt', 3);
    const b = file('b.txt', 4);
    pick(dz, [a, b]);
    const got = formFiles(form, 'docs[]');
    expect(got).to.have.length(2);
    expect(got[0]).to.be.instanceOf(File);
    expect(got.map((f) => [f.name, f.size])).to.deep.equal([['a.txt', 3], ['b.txt', 4]]);
    expect(dz.form).to.equal(form);
    expect(dz.getValue()).to.deep.equal([a, b]);
  });

  it('required: valueMissing until a file is chosen (message translatable)', () => {
    TdDropzone.labels.required = 'Pick a file';
    const form = mount('<form><td-dropzone name="f" required></td-dropzone></form>');
    const dz = form.querySelector('td-dropzone');
    expect(dz.validity.valueMissing).to.equal(true);
    expect(dz.validationMessage).to.equal('Pick a file');
    expect(form.checkValidity()).to.equal(false);
    pick(dz, [file('a.txt')]);
    expect(dz.validity.valid).to.equal(true);
    expect(form.checkValidity()).to.equal(true);
    dz.querySelector('.td-dropzone__remove').click();
    expect(dz.validity.valueMissing).to.equal(true);
  });

  it('form reset clears the list, the FormData and aborts running uploads', async () => {
    const form = mount('<form><td-dropzone name="f" multiple></td-dropzone></form>');
    const dz = form.querySelector('td-dropzone');
    const signals = [];
    dz.upload = (f, { signal }) => { signals.push(signal); return new Promise(() => {}); };
    pick(dz, [file('a.txt'), file('b.txt')]);
    expect(formFiles(form, 'f')).to.have.length(2);
    form.reset();
    expect(dz.files).to.have.length(0);
    expect(dz.querySelectorAll('.td-dropzone__item')).to.have.length(0);
    expect(formFiles(form, 'f')).to.deep.equal([]);
    expect(signals.map((s) => s.aborted)).to.deep.equal([true, true]);
  });

  it('changing name rebuilds the FormData under the new name (no re-render)', () => {
    const form = mount('<form><td-dropzone name="old" multiple></td-dropzone></form>');
    const dz = form.querySelector('td-dropzone');
    pick(dz, [file('a.txt')]);
    const list = dz.querySelector('.td-dropzone__list');
    dz.setAttribute('name', 'new');
    expect(formFiles(form, 'old')).to.deep.equal([]);
    expect(formFiles(form, 'new').map((f) => f.name)).to.deep.equal(['a.txt']);
    expect(dz.querySelector('.td-dropzone__list')).to.equal(list);
    dz.removeAttribute('name');
    expect([...new FormData(form).keys()]).to.deep.equal([]);
  });

  it('disabled: no picker, drop ignored, remove locked, not submitted', () => {
    const form = mount('<form><td-dropzone name="f" multiple></td-dropzone></form>');
    const dz = form.querySelector('td-dropzone');
    pick(dz, [file('a.txt')]);
    dz.setAttribute('disabled', '');
    const input = dz.querySelector('input[type="file"]');
    let opened = 0;
    input.click = () => { opened++; };
    expect(input.disabled).to.equal(true);
    expect(dz.querySelector('.td-dropzone__browse').disabled).to.equal(true);
    expect(dz.querySelector('.td-dropzone').hasAttribute('data-disabled')).to.equal(true);
    dz.querySelector('.td-dropzone__zone').click();
    dz.openPicker();
    expect(opened).to.equal(0);
    const ev = drop(dz, [file('b.txt')]);
    expect(ev.defaultPrevented).to.equal(true); // the browser must not open the file instead
    expect(names(dz)).to.deep.equal(['a.txt']);
    const rm = dz.querySelector('.td-dropzone__remove');
    expect(rm.disabled).to.equal(true);
    rm.dispatchEvent(new MouseEvent('click', { bubbles: true })); // even a synthetic click on the disabled button
    expect(names(dz)).to.deep.equal(['a.txt']);
    expect(formFiles(form, 'f')).to.deep.equal([]);
    dz.removeAttribute('disabled');
    expect(formFiles(form, 'f').map((f) => f.name)).to.deep.equal(['a.txt']);
  });

  it('<fieldset disabled> works like disabled (effective-disabled), without touching the attribute', async () => {
    const form = mount('<form><fieldset><td-dropzone name="f" multiple></td-dropzone></fieldset></form>');
    const fs = form.querySelector('fieldset');
    const dz = form.querySelector('td-dropzone');
    pick(dz, [file('a.txt')]);
    fs.disabled = true;
    await tick();
    expect(dz.hasAttribute('disabled')).to.equal(false);
    let opened = 0;
    dz.querySelector('input[type="file"]').click = () => { opened++; };
    dz.querySelector('.td-dropzone__zone').click();
    expect(opened).to.equal(0);
    drop(dz, [file('b.txt')]);
    pick(dz, [file('c.txt')]);
    expect(names(dz)).to.deep.equal(['a.txt']);
    expect(dz.querySelector('.td-dropzone__remove').disabled).to.equal(true);
    dz.querySelector('.td-dropzone__remove').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(names(dz)).to.deep.equal(['a.txt']);
    expect(formFiles(form, 'f')).to.deep.equal([]);
    fs.disabled = false;
    await tick();
    expect(formFiles(form, 'f').map((f) => f.name)).to.deep.equal(['a.txt']);
  });

  it('keyboard: Enter / Space on the choose button open the picker; a zone click does too', async () => {
    const dz = mount('<td-dropzone></td-dropzone>');
    let opened = 0;
    dz.querySelector('input[type="file"]').click = () => { opened++; };
    dz.querySelector('.td-dropzone__browse').focus();
    await sendKeys({ press: 'Enter' });
    expect(opened).to.equal(1);
    await sendKeys({ press: 'Space' });
    expect(opened).to.equal(2);
    dz.querySelector('.td-dropzone__hint').click(); // anywhere in the zone
    expect(opened).to.equal(3);
  });

  it('external <label for> focuses the choose button', () => {
    mount('<div><label for="dz-l">Hồ sơ</label><td-dropzone id="dz-l"></td-dropzone></div>');
    host.querySelector('label').click();
    expect(document.activeElement).to.equal(host.querySelector('.td-dropzone__browse'));
    expect(host.querySelector('.td-dropzone').getAttribute('aria-labelledby')).to.equal(host.querySelector('label').id);
  });

  it('upload hook: per-file td-progress follows onProgress, done → success', async () => {
    const dz = mount('<td-dropzone multiple></td-dropzone>');
    const calls = [];
    dz.upload = (f, ctx) => new Promise((resolve) => { calls.push({ f, ctx, resolve }); });
    pick(dz, [file('a.txt'), file('b.txt')]);
    expect(calls.map((c) => c.f.name)).to.deep.equal(['a.txt', 'b.txt']);
    expect(dz.uploading).to.equal(true);
    const item = dz.querySelector('.td-dropzone__item');
    const bar = item.querySelector('td-progress');
    expect(item.getAttribute('data-status')).to.equal('uploading');
    expect(bar.hidden).to.equal(false);
    expect(bar.hasAttribute('aria-valuenow')).to.equal(false); // v0.19.0 G2: waiting (indeterminate) until onProgress
    expect(bar.getAttribute('aria-label')).to.equal('Tải lên a.txt');
    calls[0].ctx.onProgress(42);
    expect(bar.getAttribute('aria-valuenow')).to.equal('42');
    calls[0].ctx.onProgress(3, 4); // (loaded, total)
    expect(bar.getAttribute('aria-valuenow')).to.equal('75');
    calls[0].resolve({ id: 7 });
    await tick();
    expect(item.getAttribute('data-status')).to.equal('done');
    expect(bar.getAttribute('aria-valuenow')).to.equal('100');
    expect(bar.getAttribute('variant')).to.equal('success');
    expect(item.querySelector('.td-dropzone__status').textContent).to.equal('Đã tải lên');
    expect(dz.uploading).to.equal(true); // b.txt still running
  });

  it('upload hook: remove aborts the signal; a rejection shows the error state', async () => {
    const dz = mount('<td-dropzone multiple></td-dropzone>');
    const calls = [];
    dz.upload = (f, ctx) => new Promise((resolve, reject) => {
      calls.push({ f, ctx, resolve, reject });
      ctx.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    pick(dz, [file('a.txt'), file('b.txt')]);
    dz.querySelector('.td-dropzone__remove').click(); // a.txt
    expect(calls[0].ctx.signal.aborted).to.equal(true);
    expect(calls[1].ctx.signal.aborted).to.equal(false);
    calls[0].ctx.onProgress(50); // late progress of a removed file: ignored, no throw
    calls[1].reject(new Error('500'));
    await tick();
    const item = dz.querySelector('.td-dropzone__item');
    expect(item.getAttribute('data-status')).to.equal('error');
    expect(item.querySelector('td-progress').getAttribute('variant')).to.equal('danger');
    expect(item.querySelector('.td-dropzone__status').textContent).to.equal('500'); // v0.19.0 G2: err.message shown
    expect(dz.uploading).to.equal(false);
  });

  it('no hook → no upload, no progress shown', () => {
    const dz = mount('<td-dropzone></td-dropzone>');
    pick(dz, [file('a.txt')]);
    const item = dz.querySelector('.td-dropzone__item');
    expect(item.getAttribute('data-status')).to.equal('selected');
    expect(item.querySelector('td-progress').hidden).to.equal(true);
  });

  it('preview: object URL only for images when enabled, revoked on remove / reset', () => {
    const created = [];
    const revoked = [];
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = (f) => { const u = origCreate(f); created.push(u); return u; };
    URL.revokeObjectURL = (u) => { revoked.push(u); origRevoke(u); };
    try {
      const plain = mount('<td-dropzone multiple></td-dropzone>');
      pick(plain, [file('p.png', 10, 'image/png')]);
      expect(created).to.have.length(0); // no preview attribute → never an object URL
      expect(plain.querySelector('img')).to.equal(null);

      const form = mount('<form><td-dropzone multiple preview></td-dropzone></form>');
      const dz = form.querySelector('td-dropzone');
      pick(dz, [file('a.png', 10, 'image/png'), file('b.txt'), file('c.jpg', 10, 'image/jpeg')]);
      expect(created).to.have.length(2); // not for the text file
      const thumb = dz.querySelector('.td-dropzone__thumb');
      expect(thumb.getAttribute('src')).to.equal(created[0]);
      expect(thumb.alt).to.equal('');
      dz.querySelector('.td-dropzone__remove').click(); // a.png
      expect(revoked).to.deep.equal([created[0]]);
      form.reset();
      expect(revoked).to.deep.equal([created[0], created[1]]);
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });

  it('programmatic API: addFiles / removeFile / clear / setValue are silent', () => {
    const dz = mount('<td-dropzone multiple accept=".txt"></td-dropzone>');
    let events = 0;
    dz.addEventListener('files-change', () => events++);
    const a = file('a.txt');
    const res = dz.addFiles([a, file('b.png', 1, 'image/png')]);
    expect(res.accepted).to.deep.equal([a]);
    expect(res.rejected[0].reason).to.equal('type');
    dz.setValue([file('c.txt'), file('d.txt')]);
    expect(names(dz)).to.deep.equal(['c.txt', 'd.txt']);
    dz.removeFile(0);
    expect(names(dz)).to.deep.equal(['d.txt']);
    dz.clear();
    expect(dz.files).to.have.length(0);
    expect(events).to.equal(0);
  });

  it('labels are translatable (prompt, browse, remove, hint)', () => {
    Object.assign(TdDropzone.labels, { prompt: 'Drop files or', browse: 'Browse', remove: 'Remove {name}', hintCount: 'Up to {n} files' });
    const dz = mount('<td-dropzone multiple max-files="4"></td-dropzone>');
    expect(dz.querySelector('.td-dropzone__text').textContent).to.equal('Drop files or');
    expect(dz.querySelector('.td-dropzone__browse').textContent).to.equal('Browse');
    expect(dz.querySelector('.td-dropzone__hint').textContent).to.equal('Up to 4 files');
    pick(dz, [file('a.txt')]);
    expect(dz.querySelector('.td-dropzone__remove').getAttribute('aria-label')).to.equal('Remove a.txt');
  });

  it('error contract: error-text shows a note and marks the button invalid', () => {
    const dz = mount('<td-dropzone error-text="File bắt buộc"></td-dropzone>');
    const note = dz.querySelector('.td-field-error');
    expect(note.textContent).to.equal('File bắt buộc');
    expect(dz.querySelector('.td-dropzone__browse').getAttribute('aria-invalid')).to.equal('true');
    dz.clearError();
    expect(dz.querySelector('.td-field-error')).to.equal(null);
  });

  it('files survive a re-render (attribute change) and a move in the DOM', () => {
    const dz = mount('<td-dropzone multiple></td-dropzone>');
    pick(dz, [file('a.txt')]);
    dz.setAttribute('label', 'Mới');
    expect(names(dz)).to.deep.equal(['a.txt']);
    const other = document.createElement('div');
    host.appendChild(other);
    other.appendChild(dz);
    expect(names(dz)).to.deep.equal(['a.txt']);
    drop(dz, [file('b.txt')]); // listeners re-bound after the move
    expect(names(dz)).to.deep.equal(['a.txt', 'b.txt']);
  });
});
