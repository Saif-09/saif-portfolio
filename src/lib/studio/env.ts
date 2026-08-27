/**
 * Read a server-side secret from wherever it actually lives.
 *
 * On Vercel these are real runtime env vars, so process.env has them. Under
 * `astro dev` they come from .env, which Astro exposes on import.meta.env and
 * does NOT copy into process.env. Checking process.env first keeps production
 * authoritative (a var set in the Vercel dashboard is not in the build-time
 * import.meta.env at all); the second lookup is what makes local dev work.
 *
 * The dynamic key is deliberate: Vite only string-replaces literal
 * `import.meta.env.NAME` accesses, so indexing keeps this a real runtime lookup
 * against the populated object.
 */
export function env(name: string): string {
  const runtime = process.env[name];
  if (typeof runtime === 'string' && runtime.length > 0) return runtime;

  const build = (import.meta.env as unknown as Record<string, unknown>)[name];
  return typeof build === 'string' ? build : '';
}
