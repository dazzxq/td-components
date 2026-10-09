import base from './web-test-runner.config.js';
const eng = base.groups.find((g) => g.name === 'engines');
export default { ...base, groups: undefined, files: process.env.WTR_FILES.split(','), browsers: process.env.WTR_CHROMIUM ? [eng.browsers[0]] : eng.browsers };
