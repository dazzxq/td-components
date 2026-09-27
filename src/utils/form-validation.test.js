import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// The module imports TdFormElement (extends HTMLElement); the pure helpers need no DOM, so a bare shim suffices.
globalThis.HTMLElement ??= class {};
const { nameCandidates, formatMessage, firstMessage, TdFormValidation } = await import('./form-validation.js');

describe('TdFormValidation pure helpers', () => {
  it('nameCandidates: key, dotted → bracket, PHP array forms', () => {
    assert.deepEqual(nameCandidates('email'), ['email', 'email[]']);
    assert.deepEqual(nameCandidates('items.0.name'), ['items.0.name', 'items[0][name]', 'items.0.name[]']);
    assert.deepEqual(nameCandidates('tags.0'), ['tags.0', 'tags[0]', 'tags[]', 'tags.0[]']);
    assert.deepEqual(nameCandidates('meta.title'), ['meta.title', 'meta[title]', 'meta.title[]']);
    assert.deepEqual(nameCandidates('tags[]'), ['tags[]']);
    assert.deepEqual(nameCandidates('a..b'), ['a..b', 'a..b[]']); // empty segment → no bracket form
  });

  it('formatMessage fills placeholders as text, missing → empty', () => {
    assert.equal(formatMessage('Tối thiểu {minLength} ký tự', { minLength: 3 }), 'Tối thiểu 3 ký tự');
    assert.equal(formatMessage('{min}–{max}', { min: 1 }), '1–');
    assert.equal(formatMessage('<b>{x}</b>', { x: '<img>' }), '<b><img></b>'); // plain text; the DOM writes textContent
    assert.equal(formatMessage(null), '');
  });

  it('firstMessage: Laravel string | array, first non-empty', () => {
    assert.equal(firstMessage('Sai'), 'Sai');
    assert.equal(firstMessage(['', 'Một', 'Hai']), 'Một');
    assert.equal(firstMessage([]), '');
    assert.equal(firstMessage(null), '');
    assert.equal(firstMessage(false), '');
    assert.equal(firstMessage(42), '42');
  });

  it('Vietnamese defaults are site-overridable statics', () => {
    assert.equal(TdFormValidation.labels.summaryTitle, 'Vui lòng kiểm tra lại các trường sau:');
    assert.equal(TdFormValidation.messages.valueMissing, 'Trường này là bắt buộc');
    assert.match(TdFormValidation.messages.tooLong, /\{maxLength\}/);
  });
});
