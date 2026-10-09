// v0.62.0 (plan D, ADR 0033): the media picker opens / closes with the SAME motion as td-modal — it already shares the
// modal's DOM, fade, scrim and reduced-motion block; the only difference was `--td-modal-enter-from: none` for full-viewport
// dialogs (modal.css). This file pins the CSS-only fix: the picker only sets the enter-from custom property (and, on phones,
// the sheet curve) — no keyframes, no transition of its own — so every duration / curve / reduced-motion rule stays modal's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const picker = strip(readFileSync(new URL('./components/media-picker.css', import.meta.url), 'utf8'));
const modal = strip(readFileSync(new URL('./components/modal.css', import.meta.url), 'utf8'));

test('modal.css: a full-viewport dialog only fades by default (the thing the picker overrides)', () => {
  assert.match(modal, /\.td-modal--viewport \.td-modal__dialog\s*\{[^}]*--td-modal-enter-from:\s*none/);
});

test('desktop: the picker dialog enters scale(0.95) -> none through the modal token chain; a site can turn it off', () => {
  assert.match(picker, /\.td-media-picker\.td-modal--viewport \.td-media-picker__dialog\s*\{[^}]*--td-modal-enter-from:\s*var\(--td-media-picker-enter-from,\s*scale\(0\.95\)\)/);
});

test('phones (< 720): it slides up like the modal sheet, with the no-overshoot sheet curve', () => {
  const m = picker.match(/@media \(max-width: 719\.98px\)\s*\{\s*\.td-media-picker\.td-modal--viewport \.td-media-picker__dialog\s*\{([^}]*)\}/);
  assert.ok(m, 'phone block');
  assert.match(m[1], /--td-modal-enter-from:\s*var\(--td-media-picker-sheet-from,\s*translateY\(100%\)\)/);
  assert.match(m[1], /--td-modal-enter-ease:\s*var\(--td-modal-sheet-ease\)/);
});

test('no motion of its own on the dialog: no transition / animation / transform declaration, no keyframes for it', () => {
  const rules = [...picker.matchAll(/([^{}]*\.td-media-picker__dialog[^{}]*)\{([^}]*)\}/g)];
  assert.ok(rules.length >= 2);
  for (const [, sel, body] of rules) {
    assert.doesNotMatch(body, /(^|;|\s)(transition|animation|transform)\s*:/, sel);
  }
  assert.doesNotMatch(picker, /@keyframes td-media-picker-(open|enter|dialog)/);
});

test('reduced motion stays modal.css: it resets transform on every dialog state', () => {
  const rm = modal.slice(modal.indexOf('@media (prefers-reduced-motion: reduce) {'));
  assert.match(rm, /\.td-modal\[data-state="open"\] \.td-modal__dialog[\s\S]*?transform:\s*none/);
});
