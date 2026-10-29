// v0.88.0 (plan v0.88.0-rich-text, lane A): the ONLY ProseMirror API td-rich-text uses. Bundled by
// scripts/build-rich-text-engine.mjs into src/vendor/td-rich-text-engine.js — add an export here, then rebuild.
export { Schema, DOMParser as PMDOMParser, DOMSerializer, Fragment, Slice } from 'prosemirror-model';
export { EditorState, TextSelection, Plugin, PluginKey } from 'prosemirror-state';
export { EditorView } from 'prosemirror-view';
export { toggleMark, baseKeymap, chainCommands, exitCode } from 'prosemirror-commands';
export { keymap } from 'prosemirror-keymap';
export { history, undo, redo } from 'prosemirror-history';
