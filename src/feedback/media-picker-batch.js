/**
 * media-picker-batch.js — what one upload batch did, told apart by dedupe (v0.106.0), shared by the three toast sites
 * of the picker (closed-view store, grid drop, upload dialog).
 *
 *   const tally = createBatchTally();
 *   tally.set(key, name, asset, dedup);   // one finished file (the same key again replaces it: a retry)
 *   tally.delete(key);                    // a file that left the batch
 *   r = tally.extend({ ok, fail, total }); // → + { created, reused, reusedInBatch, reusedNames }; resets the tally
 *   batchDoneText(r, t);                  // the success sentence of a batch (t(key, params) = the picker's labels)
 *
 * A reused file is "in batch" iff the asset it matched was created by the same batch (decided when the batch ends: a
 * reused file can finish before the created one); otherwise it matched an asset that already existed.
 * `ok = created + reused` keeps its old meaning; `reusedNames` holds at most NAMES_MAX names, in finishing order.
 */

export const NAMES_MAX = 5;

/** @returns {{ set: Function, delete: Function, reset: Function, extend: (r: object) => object }} */
export function createBatchTally() {
  /** @type {Map<*, { name: string, id: string, reused: boolean }>} */
  let files = new Map();
  return {
    set(key, name, asset, dedup) {
      const reused = !!dedup && dedup.outcome === 'exact-reused';
      const raw = reused && dedup.matchedAssetId != null ? dedup.matchedAssetId : asset && asset.id;
      files.set(key, { name: String(name ?? ''), id: raw == null ? '' : String(raw), reused });
    },
    delete(key) { files.delete(key); },
    reset() { files = new Map(); },
    extend(r) {
      const list = [...files.values()];
      files = new Map();
      const createdIds = new Set(list.filter((f) => !f.reused).map((f) => f.id));
      const reused = list.filter((f) => f.reused);
      return {
        ...r,
        created: list.length - reused.length,
        reused: reused.length,
        reusedInBatch: reused.filter((f) => createdIds.has(f.id)).length,
        reusedNames: reused.slice(0, NAMES_MAX).map((f) => f.name),
      };
    },
  };
}

/** @returns {string} the success toast text of a batch (`uploadDone` unchanged when nothing was reused) */
export function batchDoneText(r, t) {
  const reused = Number(r && r.reused) || 0;
  const created = Number(r && r.created) || 0;
  if (!reused) return t('uploadDone', { ok: r.ok, total: r.total });
  const parts = [created > 0 ? t('uploadDoneReused', { created, reused }) : t('uploadAllReused', { reused })];
  if (r.reusedInBatch > 0) parts.push(t('uploadReusedInBatch', { n: r.reusedInBatch }));
  const names = Array.isArray(r.reusedNames) ? r.reusedNames : [];
  if (names.length) {
    let s = t('uploadReusedNames', { names: names.join(', ') });
    if (reused > names.length) s += t('uploadReusedMore', { n: reused - names.length });
    parts.push(s);
  }
  return parts.filter(Boolean).join(' ');
}
