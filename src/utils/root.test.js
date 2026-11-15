// v0.116.0 (ADR 0045 QĐ3): activeIn(node) reads focus from the node's root (Document / ShadowRoot), and falls back to
// the owner document for a detached node (its root is its own top ancestor, which has no activeElement).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeIn } from './root.js';

const doc = { activeElement: 'doc-focus' };
doc.getRootNode = () => doc;
const shadow = { activeElement: 'shadow-focus' };
const node = (root, ownerDocument = doc) => ({ ownerDocument, getRootNode: () => root });

test('light DOM: the root is the Document → its activeElement (= ownerDocument.activeElement)', () => {
  assert.equal(activeIn(node(doc)), 'doc-focus');
});

test('shadow DOM: the root is the ShadowRoot → its activeElement, not the document one', () => {
  assert.equal(activeIn(node(shadow)), 'shadow-focus');
  assert.equal(activeIn(node({ activeElement: null })), null); // focus outside the root
});

test('detached node: its root is an element without activeElement → ownerDocument.activeElement', () => {
  const top = { tagName: 'DIV' };
  assert.equal(activeIn(node(top)), 'doc-focus');
  const self = { ownerDocument: doc };
  self.getRootNode = () => self;
  assert.equal(activeIn(self), 'doc-focus');
});

test('no getRootNode → ownerDocument; the Document itself → its activeElement; null / undefined → null', () => {
  assert.equal(activeIn({ ownerDocument: doc }), 'doc-focus');
  assert.equal(activeIn(doc), 'doc-focus');
  assert.equal(activeIn(null), null);
  assert.equal(activeIn(undefined), null);
  assert.equal(activeIn({}), null);
  assert.equal(activeIn(node({ activeElement: undefined }, { activeElement: undefined })), null);
});
