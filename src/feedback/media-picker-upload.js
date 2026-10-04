/**
 * Upload dialog of td-media-picker — v0.33.0 (plan v0.33.0-media-picker-dcms-parity, decisions 20-23). A nested dialog
 * ("Tải lên media") on top of the picker: optional uploadFields (shared by both sources), `<td-tabs size="sm">` "Tải file"
 * (td-dropzone multiple, presentation API) / "Tải từ URL" (adapter.uploadFromUrl), footer "Đóng".
 *
 * INTERFACE CONTRACT (fixed — the picker lane codes against it; the upload lane implements it):
 *
 *   import { openUploadDialog, UPLOAD_LABELS } from './media-picker-upload.js';
 *
 *   UPLOAD_LABELS — default Vietnamese texts of this dialog; the picker spreads them into TdMediaPicker.labels, so
 *   `o.t(key, params)` resolves them (with options.messages overrides) exactly like every other picker label.
 *
 *   const handle = openUploadDialog({
 *     t,            // (key: string, params?: object) => string — the picker's label resolver
 *     adapter,      // the resolved adapter (upload / uploadFromUrl are called on it)
 *     context,      // OpenMediaPickerOptions.context (passed through to the adapter)
 *     sources,      // { file: boolean, url: boolean } — which sources the picker allows (caps + methods resolved)
 *     upload,       // resolved OpenMediaPickerOptions.upload { accept?, maxSize?, multiple?, acceptLabel? }
 *     uploadFields, // normalizeFields() output (may be [])
 *     metaKeys,     // string[] — metadata keys kept on normalized assets
 *     idPrefix,     // unique id prefix (picker id + '-up')
 *     onUploaded,   // (asset, deduplication, operation: 'upload' | 'upload-url') => void — one VALIDATED result
 *                   //   (normalizeUploadResult ok); the picker invalidates caches, reloads page 1, selects, opens detail,
 *                   //   emits asset-change.
 *     onError,      // ({ operation: 'upload' | 'upload-url', code, retryable }) => void — picker emits operation-error
 *     announce,     // (text: string) => void — picker live region
 *     onClosed,     // () => void — after the dialog fully closed (picker returns focus to its "Tải lên" button)
 *   });
 *
 *   handle.root      HTMLElement — the dialog root (.td-modal…td-media-picker-upload)
 *   handle.busy()    boolean — a file or URL upload is in flight
 *   handle.close()   Promise<boolean> — user-style close: asks "Huỷ các tệp đang tải?" when busy; true when closed
 *   handle.destroy() void — immediate teardown, aborts everything, no confirmation (picker teardown)
 *
 * Text-only rendering, CSP-strict, every error through normalizeError (userMessage / labels only).
 */

/** Default texts (merged into TdMediaPicker.labels by the picker). */
export const UPLOAD_LABELS = {};

/**
 * @param {object} o see the contract above
 * @returns {{ root: HTMLElement, busy(): boolean, close(): Promise<boolean>, destroy(): void }}
 */
export function openUploadDialog(o) {
  void o;
  throw new Error('td-media-picker: upload dialog not implemented yet (v0.33.0 lane D)');
}
