// v0.38.0 (plan v0.38.0-scan-input QĐ 15, M1) — Web Audio beeps of <td-scan-input>: no AudioContext → silent no-op,
// parameters clamped, one oscillator per tone, the context created lazily once and resumed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playBeep, prepareBeep, clampSound, DEFAULT_SOUNDS, _resetBeep } from './beep.js';

test('no Web Audio → playBeep is a silent no-op (false)', () => {
  _resetBeep();
  assert.equal(globalThis.AudioContext, undefined);
  assert.equal(playBeep('ok'), false);
});

test('clampSound: frequency 100–4000 Hz, duration ≤ 400 ms (≥ 10), count 1–3; junk → the fallback', () => {
  assert.deepEqual(clampSound({ freq: 50, ms: 9999, count: 9 }, DEFAULT_SOUNDS.ok), { freq: 100, ms: 400, count: 3 });
  assert.deepEqual(clampSound({ freq: 99999, ms: 1, count: 0 }, DEFAULT_SOUNDS.ok), { freq: 4000, ms: 10, count: 1 });
  assert.deepEqual(clampSound({ freq: 'x', ms: NaN }, DEFAULT_SOUNDS.error), DEFAULT_SOUNDS.error);
  assert.deepEqual(clampSound(null, DEFAULT_SOUNDS.duplicate), DEFAULT_SOUNDS.duplicate);
  assert.deepEqual(DEFAULT_SOUNDS.ok, { freq: 1760, ms: 70, count: 1 });
  assert.deepEqual(DEFAULT_SOUNDS.error, { freq: 330, ms: 120, count: 2 });
  assert.deepEqual(DEFAULT_SOUNDS.duplicate, { freq: 880, ms: 50, count: 2 });
});

test('fake AudioContext: lazy single context, resume() each time, one started oscillator per tone', () => {
  _resetBeep();
  const log = { ctx: 0, osc: 0, start: 0, resume: 0 };
  const param = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, value: 0 });
  class FakeCtx {
    constructor() { log.ctx++; this.currentTime = 1; this.state = 'suspended'; this.destination = {}; }
    resume() { log.resume++; return Promise.resolve(); }
    createOscillator() {
      log.osc++;
      return { frequency: param(), type: '', connect() {}, start() { log.start++; }, stop() {} };
    }
    createGain() { return { gain: param(), connect() {} }; }
  }
  globalThis.AudioContext = FakeCtx;
  try {
    assert.equal(log.ctx, 0, 'nothing created before the first beep');
    assert.equal(playBeep('ok'), true);
    assert.equal(playBeep('error'), true);
    assert.equal(playBeep('duplicate', { duplicate: { freq: 500, ms: 30, count: 3 } }), true);
    assert.equal(log.ctx, 1);
    assert.equal(log.resume, 3);
    assert.equal(log.start, 1 + 2 + 3);
    assert.equal(playBeep('nope'), false);
  } finally {
    delete globalThis.AudioContext;
    _resetBeep();
  }
});

test('a context that throws → silent, false', () => {
  _resetBeep();
  globalThis.AudioContext = class { constructor() { throw new Error('blocked'); } };
  try {
    assert.equal(playBeep('ok'), false);
  } finally {
    delete globalThis.AudioContext;
    _resetBeep();
  }
});

test('ISSUE-5: prepareBeep() creates + resumes the context without playing (called in the trusted keystroke)', () => {
  _resetBeep();
  const log = { ctx: 0, osc: 0, resume: 0 };
  class FakeCtx {
    constructor() { log.ctx++; this.currentTime = 0; this.destination = {}; }
    resume() { log.resume++; return Promise.resolve(); }
    createOscillator() { log.osc++; return {}; }
    createGain() { return {}; }
  }
  globalThis.AudioContext = FakeCtx;
  try {
    assert.equal(prepareBeep(), true);
    assert.equal(prepareBeep(), true);
    assert.deepEqual(log, { ctx: 1, osc: 0, resume: 2 });
  } finally {
    delete globalThis.AudioContext;
    _resetBeep();
  }
  assert.equal(prepareBeep(), false, 'no Web Audio → false');
});
