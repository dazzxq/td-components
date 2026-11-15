// Build id of the embed artifact (ADR 0045 QĐ4): `${version}+${hash}` in dist/embed/td-embed.js, where
// scripts/build-embed.mjs replaces the placeholder below. From source it stays the placeholder (a development build).
// Diagnostics only: nothing compares it.
export const TD_EMBED_BUILD = '__TD_EMBED_BUILD__';

/** true when running from source (the placeholder was not replaced): enables the development warnings. */
export const isDevBuild = () => TD_EMBED_BUILD.startsWith('__TD_');
