/**
 * Scan beeps with Web Audio (v0.38.0, plan v0.38.0-scan-input QĐ 15). Internal module (no package subpath).
 * No audio file (no `media-src`, no asset, CSP clean): an OscillatorNode through a GainNode with a 5 ms envelope (no
 * click). The AudioContext is created LAZILY at the first beep (a scanner keystroke is a valid user activation) and
 * resumed every time; no Web Audio / blocked / throwing → silent, never an error.
 */

/** @typedef {{ freq: number, ms: number, count: number }} TdSound */

/** Default tones: ok 1 × 1760 Hz 70 ms; error 2 × 330 Hz 120 ms; duplicate 2 × 880 Hz 50 ms. */
export const DEFAULT_SOUNDS = Object.freeze({
  ok: Object.freeze({ freq: 1760, ms: 70, count: 1 }),
  error: Object.freeze({ freq: 330, ms: 120, count: 2 }),
  duplicate: Object.freeze({ freq: 880, ms: 50, count: 2 }),
});

const ENVELOPE = 0.005;
const GAP = 0.06;
const GAIN = 0.2;

/** @type {AudioContext | null} */
let ctx = null;
let failed = false;

const num = (v, min, max, def) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : def);

/**
 * Clamp a site-provided tone: frequency 100–4000 Hz, duration 10–400 ms, 1–3 tones; a missing / junk field → fallback's.
 * @param {unknown} s
 * @param {TdSound} fallback
 * @returns {TdSound}
 */
export function clampSound(s, fallback) {
  if (!s || typeof s !== 'object') return { ...fallback };
  return {
    freq: num(/** @type {any} */ (s).freq, 100, 4000, fallback.freq),
    ms: num(/** @type {any} */ (s).ms, 10, 400, fallback.ms),
    count: num(/** @type {any} */ (s).count, 1, 3, fallback.count),
  };
}

function context() {
  if (ctx || failed) return ctx;
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (typeof Ctor !== 'function') return null;
  try {
    ctx = new Ctor();
  } catch {
    failed = true;
    ctx = null;
  }
  return ctx;
}

/**
 * Play one of the tones (`ok` | `error` | `duplicate`), `sounds` overriding the defaults per kind.
 * @param {string} kind
 * @param {Record<string, unknown>} [sounds]
 * @returns {boolean} whether tones were scheduled
 */
export function playBeep(kind, sounds) {
  if (!Object.hasOwn(DEFAULT_SOUNDS, kind)) return false;
  const c = context();
  if (!c) return false;
  try {
    const s = clampSound(sounds && Object.hasOwn(sounds, kind) ? sounds[kind] : null, DEFAULT_SOUNDS[kind]);
    const p = c.resume?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
    const dur = s.ms / 1000;
    let t = c.currentTime + 0.01;
    for (let i = 0; i < s.count; i++) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(s.freq, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(GAIN, t + ENVELOPE);
      gain.gain.setValueAtTime(GAIN, t + dur - ENVELOPE);
      gain.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t);
      osc.stop(t + dur + 0.01);
      t += dur + GAP;
    }
    return true;
  } catch {
    return false;
  }
}

/** @internal tests: forget the cached context. */
export function _resetBeep() {
  ctx = null;
  failed = false;
}
