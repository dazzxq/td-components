import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readingProgress } from './reading-progress.js';

test('v0.97.0 readingProgress: start, middle, end (dwp formula)', () => {
  // target 2000px tall, viewport 800px: scrollable distance = 1200
  assert.equal(readingProgress({ top: 100, bottom: 2100 }, 800), 0);
  assert.equal(readingProgress({ top: 0, bottom: 2000 }, 800), 0);
  assert.equal(readingProgress({ top: -600, bottom: 1400 }, 800), 0.5);
  assert.equal(readingProgress({ top: -1200, bottom: 800 }, 800), 1);
  assert.equal(readingProgress({ top: -1500, bottom: 500 }, 800), 1);
});

test('v0.97.0 readingProgress: a target shorter than the viewport, fully in view, is read', () => {
  assert.equal(readingProgress({ top: 50, bottom: 400 }, 800), 1);
});

test('v0.97.0 readingProgress: bad input → 0', () => {
  assert.equal(readingProgress(null, 800), 0);
  assert.equal(readingProgress({ top: NaN, bottom: 10 }, 800), 0);
  assert.equal(readingProgress({ top: -10, bottom: 1000 }, undefined), 0);
});

test('v0.97.0 readingProgress: an empty box (height 0, content not mounted yet) is not read', () => {
  assert.equal(readingProgress({ top: 300, bottom: 300 }, 800), 0);
  assert.equal(readingProgress({ top: -10, bottom: -10 }, 800), 0);
});
