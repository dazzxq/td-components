/**
 * v0.32.0 — mock `MediaPickerAdapter` shared by the media picker / media field tests, stories and the demo (no network).
 * 60 assets (images from `${base}{1..4}.svg`; videos m4, m14, … (i % 10 = 4); files m11, m26, m41, m56 (i % 15 = 11); m7
 * `processing`; m5 per-asset `editMetadata: false`; images are named `anh-{i}.jpg`), facets
 * album / scope / tags, dsuite-like asset + upload field descriptors (`visibleWhen`), upload with fake progress +
 * dedup by file name, update with `version` conflicts.
 *
 * Two modes:
 * - auto (default): every call settles by itself after `latency` ms (0 → next macrotask); an aborted signal rejects
 *   with an AbortError.
 * - manual (`manual: true`): every call stays pending; the test settles it through its record:
 *   `ad.calls.list[0].resolve()` (default result) / `.resolve(value)` / `.reject(err)`.
 * Every call is recorded in `ad.calls.{list|get|facets|upload|update|uploadFromUrl|delete|download}` as `{ args, signal,
 * result, promise, resolve, reject, settled }`. `ad.ignoreSignal = true` → aborts are ignored (an adapter that does not
 * honour the signal).
 *
 * v0.33.0 additions (plan v0.33.0-media-picker-dcms-parity M1) — all on by default, each can be turned off:
 * - `uploadFromUrl(url, o)`: fake progress like upload (auto mode); a URL containing `?fail=` → rejects with a
 *   `validation` error (`userMessage` + `fieldErrors.url`); a URL already imported (or the seeded
 *   `https://example.com/anh-1.jpg` → m1) → `exact-reused` with that asset's id; else a new image asset (`created`).
 * - `delete(id, o)`: numeric id % 7 === 3 (m3, m10, m17, …) → `blocked` (`usageCount: 3`, 3 usages: a safe relative
 *   href, a `javascript:alert(1)` href, an HTML-looking label without href); else `deleted` + removed from `db`;
 *   unknown id → `not-found`.
 * - `download(id, o)`: `{ url, filename }` / `{ blob, filename }` alternating per call (1st url, 2nd blob, …);
 *   `unsafeDownloadId` (default 'm2') always answers `{ url: 'javascript:alert(1)', … }`.
 * - `pagination: 'pages'`: list honours `request.page` (1-based, `limit` per page), `nextCursor: null`, `total`
 *   (omitted with `total: false` → the picker's warn + cursor-UI fallback). Cursor mode is unchanged.
 *
 * @param {object} [o]
 * @param {number} [o.count=60]
 * @param {number} [o.latency=0]
 * @param {boolean} [o.manual=false]
 * @param {string} [o.base='/test/fixtures/'] image base URL (stories: '/lightbox/')
 * @param {boolean} [o.facets=true] provide facets()
 * @param {boolean} [o.upload=true] provide upload()
 * @param {boolean} [o.update=true] provide update()
 * @param {number} [o.uploadSteps=4] progress callbacks per upload (auto mode)
 * @param {number} [o.uploadStepMs=20]
 * @param {boolean} [o.uploadFromUrl=true] provide uploadFromUrl() (v0.33)
 * @param {boolean} [o.delete=true] provide delete() (v0.33)
 * @param {boolean} [o.download=true] provide download() (v0.33)
 * @param {'cursor'|'pages'} [o.pagination='cursor'] v0.33: 'pages' → list honours `request.page`
 * @param {boolean} [o.total=true] v0.33: false → list never returns `total`
 * @param {string} [o.unsafeDownloadId='m2'] v0.33: this asset's download answers a `javascript:` URL
 */
export function createMockAdapter(o = {}) {
  const count = o.count ?? 60;
  const latency = o.latency ?? 0;
  const base = o.base ?? '/test/fixtures/';
  const albums = ['Sản phẩm', 'Tin tức', 'Thương hiệu'];
  /** @type {Map<string, any>} */
  const db = new Map();
  for (let i = 1; i <= count; i++) {
    const kind = i % 15 === 11 ? 'file' : (i % 10 === 4 ? 'video' : 'image');
    const img = `${base}${((i - 1) % 4) + 1}.svg`;
    db.set(`m${i}`, {
      id: `m${i}`,
      version: 1,
      kind,
      status: i === 7 ? 'processing' : 'ready',
      name: kind === 'file' ? `tai-lieu-${i}.pdf` : `${kind === 'video' ? 'video' : 'anh'}-${i}.${kind === 'video' ? 'mp4' : 'jpg'}`,
      mimeType: kind === 'file' ? 'application/pdf' : (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
      byteSize: 120000 + i * 3171,
      width: kind === 'file' ? undefined : 1200,
      height: kind === 'file' ? undefined : 800,
      createdAt: `2026-09-${String((i % 28) + 1).padStart(2, '0')}T08:30:00Z`,
      uploadedByLabel: i % 2 ? 'Biên tập viên A' : 'Biên tập viên B',
      urls: { thumbnail: img, preview: img },
      defaultAltText: `Ảnh mẫu ${i}`,
      metadata: { album: (i % 3) + 1, license: i % 2 ? 'cc-by' : 'owned', title: `Ảnh mẫu ${i}`, tags: [] },
      badges: i % 9 === 0 ? [{ key: 'new', label: 'Mới', tone: 'success' }] : [],
      capabilities: i === 5 ? { editMetadata: false } : undefined,
    });
  }
  let seq = count;

  const calls = { list: [], get: [], facets: [], upload: [], update: [], uploadFromUrl: [], delete: [], download: [] };
  /** v0.33: imported URL → asset id (dedup of uploadFromUrl). */
  const byUrl = new Map(count >= 1 ? [['https://example.com/anh-1.jpg', 'm1']] : []);
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const abortError = () => {
    const e = new Error('aborted');
    e.name = 'AbortError';
    return e;
  };

  const ad = {
    calls,
    db,
    manual: !!o.manual,
    ignoreSignal: false,
    /** Every pending manual call resolved with its default result (in call order). */
    resolveAll() {
      for (const list of Object.values(calls)) for (const r of list) if (!r.settled) r.resolve();
    },
    /** Total number of calls. */
    get callCount() { return Object.values(calls).reduce((n, l) => n + l.length, 0); },
  };

  /**
   * @param {string} kind
   * @param {unknown[]} args
   * @param {AbortSignal|undefined} signal
   * @param {() => unknown} compute default result (may throw → rejection)
   * @param {boolean} [holdAuto] auto mode: the caller settles it (upload progress)
   */
  function record(kind, args, signal, compute, holdAuto = false) {
    const rec = { args, signal, settled: false, result: undefined, promise: null, resolve: null, reject: null };
    rec.promise = new Promise((res, rej) => {
      rec.resolve = (v) => {
        if (rec.settled) return;
        rec.settled = true;
        if (v !== undefined) { res(v); return; }
        try { res(compute()); } catch (err) { rej(err); }
      };
      rec.reject = (err) => {
        if (rec.settled) return;
        rec.settled = true;
        rej(err);
      };
    });
    calls[kind].push(rec);
    if (signal) {
      signal.addEventListener('abort', () => { if (!ad.ignoreSignal) rec.reject(abortError()); }, { once: true });
    }
    if (!ad.manual && !holdAuto) setTimeout(() => rec.resolve(), latency);
    return rec;
  }

  function matches(a, req) {
    const q = (req.query || '').toLowerCase();
    if (q && !a.name.toLowerCase().includes(q) && !(a.metadata.title || '').toLowerCase().includes(q)) return false;
    if (req.kinds && req.kinds.length && !req.kinds.includes(a.kind)) return false;
    const f = req.filters || {};
    if (f.album !== undefined && f.album !== null && a.metadata.album !== f.album) return false;
    if (f.scope === 'mine' && Number(a.id.slice(1)) % 2 === 0) return false;
    if (Array.isArray(f.tags) && f.tags.length && !f.tags.some((t) => (a.metadata.tags || []).includes(t))) return false;
    return true;
  }

  ad.list = (req) => {
    const rec = record('list', [req], req.signal, () => {
      const all = [...db.values()].reverse().filter((a) => matches(a, req)); // newest first
      if (o.pagination === 'pages') {
        const page = Number.isInteger(req.page) && req.page >= 1 ? req.page : 1;
        const start = (page - 1) * req.limit;
        const out = { items: all.slice(start, start + req.limit).map(clone), nextCursor: null };
        if (o.total !== false) out.total = all.length;
        return out;
      }
      const start = req.cursor ? Number(req.cursor) : 0;
      const items = all.slice(start, start + req.limit).map(clone);
      const next = start + req.limit < all.length ? String(start + req.limit) : null;
      const out = { items, nextCursor: next };
      if (o.total !== false) out.total = all.length;
      return out;
    });
    return rec.promise;
  };

  ad.get = (id, opts = {}) => {
    const rec = record('get', [id, opts], opts.signal, () => {
      const a = db.get(id);
      if (!a) throw Object.assign(new Error(`asset ${id} missing (raw)`), { code: 'not-found', userMessage: 'Không tìm thấy media.' });
      return clone(a);
    });
    return rec.promise;
  };

  if (o.facets !== false) {
    ad.facets = (req) => {
      const rec = record('facets', [req], req.signal, () => {
        const inQuery = [...db.values()].filter((a) => matches(a, { ...req, filters: {} }));
        return [
          { key: 'album', label: 'Album', type: 'single',
            options: albums.map((label, i) => ({ value: i + 1, label, count: inQuery.filter((a) => a.metadata.album === i + 1).length })) },
          { key: 'scope', label: 'Chỉ của tôi', type: 'toggle', options: [{ value: 'mine', label: 'Của tôi' }] },
          { key: 'tags', label: 'Thẻ', type: 'multiple', options: [{ value: 'hero', label: 'Hero' }, { value: 'banner', label: 'Banner' }] },
        ];
      });
      return rec.promise;
    };
  }

  if (o.upload !== false) {
    ad.upload = (file, opts) => {
      const steps = o.uploadSteps ?? 4;
      const stepMs = o.uploadStepMs ?? 20;
      const rec = record('upload', [file, opts], opts.signal, () => {
        const dup = [...db.values()].find((a) => a.name === file.name);
        if (dup) return { asset: clone(dup), deduplication: { outcome: 'exact-reused', matchedAssetId: dup.id } };
        seq += 1;
        const id = `m${seq}`;
        const asset = {
          id, version: 1, kind: 'image', status: 'ready', name: file.name, mimeType: file.type || 'image/png',
          byteSize: file.size, width: 800, height: 600, createdAt: '2026-10-04T09:00:00Z', uploadedByLabel: 'Bạn',
          urls: { thumbnail: `${base}1.svg`, preview: `${base}1.svg` }, defaultAltText: '',
          metadata: { album: Number(opts.fields?.album) || 1, license: 'owned', title: file.name, tags: [] }, badges: [],
        };
        db.set(id, asset);
        return { asset: clone(asset), deduplication: { outcome: 'created' } };
      }, true);
      fakeProgress(rec, opts);
      return rec.promise;
    };
  }

  /** Auto mode: `uploadSteps` progress callbacks every `uploadStepMs`, then settle (manual mode: the test settles). */
  function fakeProgress(rec, opts) {
    if (ad.manual) return;
    const steps = o.uploadSteps ?? 4;
    const stepMs = o.uploadStepMs ?? 20;
    let n = 0;
    const tick = () => {
      if (rec.settled || (opts.signal?.aborted && !ad.ignoreSignal)) return;
      n += 1;
      try { opts.onProgress?.({ loaded: n * 25, total: steps * 25, percent: Math.round((n / steps) * 100) }); } catch { /* ignore */ }
      if (n < steps) { setTimeout(tick, stepMs); return; }
      rec.resolve();
    };
    setTimeout(tick, stepMs);
  }

  if (o.uploadFromUrl !== false) {
    ad.uploadFromUrl = (url, opts = {}) => {
      const rec = record('uploadFromUrl', [url, opts], opts.signal, () => {
        if (String(url).includes('?fail=')) {
          throw Object.assign(new Error('remote fetch failed: 500 from upstream (raw)'), {
            code: 'validation', userMessage: 'Không tải được ảnh từ URL này.',
            fieldErrors: { url: ['URL không trỏ tới một ảnh hợp lệ.'] },
          });
        }
        const dupId = byUrl.get(url);
        if (dupId && db.has(dupId)) {
          return { asset: clone(db.get(dupId)), deduplication: { outcome: 'exact-reused', matchedAssetId: dupId } };
        }
        seq += 1;
        const id = `m${seq}`;
        let name = String(url).split(/[?#]/)[0].split('/').pop() || '';
        try { name = decodeURIComponent(name); } catch { /* keep it encoded */ }
        name = name || `anh-url-${seq}.jpg`;
        const asset = {
          id, version: 1, kind: 'image', status: 'ready', name, mimeType: 'image/jpeg',
          byteSize: 98765, width: 1024, height: 768, createdAt: '2026-10-04T09:30:00Z', uploadedByLabel: 'Bạn',
          urls: { thumbnail: `${base}2.svg`, preview: `${base}2.svg` }, defaultAltText: '',
          metadata: { album: Number(opts.fields?.album) || 1, license: 'owned', title: name, tags: [] }, badges: [],
        };
        db.set(id, asset);
        byUrl.set(url, id);
        return { asset: clone(asset), deduplication: { outcome: 'created' } };
      }, true);
      fakeProgress(rec, opts);
      return rec.promise;
    };
  }

  if (o.delete !== false) {
    ad.delete = (id, opts = {}) => {
      const rec = record('delete', [id, opts], opts.signal, () => {
        const a = db.get(id);
        if (!a) throw Object.assign(new Error(`asset ${id} missing (raw)`), { code: 'not-found', userMessage: 'Không tìm thấy media.' });
        if (Number(String(id).slice(1)) % 7 === 3) {
          return {
            status: 'blocked', reason: 'in-use', usageCount: 3,
            usages: [
              { id: 'post-12', label: 'Bài viết: Ra mắt sản phẩm mới', kind: 'Bài viết', href: '/admin/posts/12' },
              { id: 'product-7', label: 'Sản phẩm: Tai nghe X', kind: 'Sản phẩm', href: 'javascript:alert(1)' },
              { id: 'banner-3', label: '<img src=x onerror=alert(1)> Banner trang chủ', kind: 'Banner' },
            ],
          };
        }
        db.delete(id);
        return { status: 'deleted', id };
      });
      return rec.promise;
    };
  }

  if (o.download !== false) {
    let nDownload = 0;
    ad.download = (id, opts = {}) => {
      const rec = record('download', [id, opts], opts.signal, () => {
        const a = db.get(id);
        if (!a) throw Object.assign(new Error(`asset ${id} missing (raw)`), { code: 'not-found', userMessage: 'Không tìm thấy media.' });
        if (id === (o.unsafeDownloadId ?? 'm2')) return { url: 'javascript:alert(1)', filename: a.name };
        nDownload += 1;
        if (nDownload % 2 === 1) return { url: a.urls.preview, filename: a.name };
        return { blob: new Blob([`fake original of ${a.name}`], { type: a.mimeType }), filename: a.name };
      });
      return rec.promise;
    };
  }

  if (o.update !== false) {
    ad.update = (id, patch, opts = {}) => {
      const rec = record('update', [id, patch, opts], opts.signal, () => {
        const a = db.get(id);
        if (!a) throw Object.assign(new Error('missing'), { code: 'not-found' });
        if (patch.version !== undefined && patch.version !== a.version) {
          throw Object.assign(new Error('version mismatch (raw)'), { code: 'conflict', userMessage: 'Media đã bị người khác sửa.' });
        }
        const next = { ...a, version: a.version + 1, metadata: { ...a.metadata, ...patch.fields } };
        if (typeof patch.fields?.title === 'string' && patch.fields.title) next.name = patch.fields.title;
        db.set(id, next);
        return clone(next);
      });
      return rec.promise;
    };
  }

  return ad;
}

/** dsuite-like asset field descriptors (all 7 controls; `visibleWhen` on the licence fields). */
export function assetFields() {
  return [
    { key: 'title', label: 'Tiêu đề', scope: 'asset', control: 'text', required: true, helpText: 'Hiện trong thư viện.' },
    { key: 'caption', label: 'Chú thích', scope: 'asset', control: 'textarea' },
    { key: 'source', label: 'Nguồn (URL)', scope: 'asset', control: 'url' },
    { key: 'license', label: 'Giấy phép', scope: 'asset', control: 'select',
      options: [{ value: 'owned', label: 'Sở hữu' }, { value: 'cc-by', label: 'CC BY' }, { value: 'licensed', label: 'Mua bản quyền' }] },
    { key: 'licenseExpiry', label: 'Hết hạn bản quyền', scope: 'asset', control: 'date',
      visibleWhen: (values) => values.license === 'licensed' },
    { key: 'tags', label: 'Thẻ', scope: 'asset', control: 'multiselect',
      options: [{ value: 'hero', label: 'Hero' }, { value: 'banner', label: 'Banner' }] },
    { key: 'checksum', label: 'Mã kiểm', scope: 'asset', control: 'readonly' },
  ];
}

/** Upload field descriptors (a required album select). */
export function uploadFields() {
  return [
    { key: 'album', label: 'Album', scope: 'upload', control: 'select', required: true,
      options: [{ value: 1, label: 'Sản phẩm' }, { value: 2, label: 'Tin tức' }, { value: 3, label: 'Thương hiệu' }] },
  ];
}
