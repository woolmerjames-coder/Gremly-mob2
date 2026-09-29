// Worker files are ES modules with no package.json "type", and a few imports
// leave off ".js". Wrangler handles both; these hooks let Node do the same.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (specifier.startsWith('.') && !/\.[cm]?js$/.test(specifier)) return next(`${specifier}.js`, context);
    throw err;
  }
}
export async function load(url, context, next) {
  if (url.includes('/workers/') && url.endsWith('.js')) return next(url, { ...context, format: 'module' });
  return next(url, context);
}
