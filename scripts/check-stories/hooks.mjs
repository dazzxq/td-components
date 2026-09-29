// Node module hooks for scripts/check-stories.mjs: stories import CSS and custom-element modules that need a DOM;
// neither is needed to render a story's HTML string, so both load as empty modules.
export async function load(url, ctx, next) {
  if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
  if (/\/src\/(form|display|base\/sample)\/td-[a-z-]+\.js$/.test(url) || /\/src\/feedback\/td-(scroll-top|alert)\.js$/.test(url) || /\/src\/icons\/td-icon-element\.js$/.test(url)) {
    return { format: 'module', source: 'export {};', shortCircuit: true };
  }
  return next(url, ctx);
}
