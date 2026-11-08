// v0.105.0: shared first-letter cases of PHP Td::avatarInitial() and JS avatarInitial() (plan v0.105.0-avatar, test §2).
// [name, expected] — test/php/td-avatar.test.js and src/display/td-v105-avatar.engines.browser-test.js both assert them.
export const AVATAR_INITIAL_CASES = [
  ['An', 'A'],
  ['  an', 'A'],
  [' \tbình', 'B'],
  ['Đức', 'Đ'],
  ['đức', 'Đ'],
  ['ấn', 'Ấ'],
  ['ưng', 'Ư'],
  ['Ẽm', 'Ẽ'],
  ['👩‍💻 Dev', '👩‍💻'],
  ['123', '1'],
  ['', '?'],
  ['   ', '?'],
  ['\u0085alice', 'A'], // NEL: PCRE \s strips it, JS trimStart does not (impl review)
  ['\u00a0\u3000 hà', 'H'],
];
