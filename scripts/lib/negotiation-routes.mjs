/**
 * The routing rules that make Accept negotiation work on a prerendered site.
 *
 * Astro pages here are prerendered, deliberately: that is what keeps the
 * sitemap complete and the CDN doing the serving. Prerendered pages cannot
 * read a request header, so negotiation has to happen one layer down, at
 * Vercel's router, which is the only thing that sees Accept before a static
 * file is handed over.
 *
 * These rules do the least possible: they add `Vary: Accept` to the page URLs
 * that genuinely have two representations, and they divert exactly two request
 * shapes to /api/markdown, which does the real RFC 9110 parsing. A regex
 * cannot compare q-values, so it is not asked to.
 *
 * They must be spliced in BEFORE the `handle: filesystem` entry. Routes after
 * it only run when the filesystem missed (verified against production: the
 * adapter's own `_astro` cache-control route sits after it and never applies).
 */

/** The endpoint that performs the negotiation. */
export const NEGOTIATION_ENDPOINT = '/api/markdown';

/** Case-insensitive literal, spelled out: Vercel compiles these with JS
    RegExp, which has no inline (?i) flag. */
export function ciPattern(literal) {
  return literal
    .split('')
    .map((char) => {
      const lower = char.toLowerCase();
      const upper = char.toUpperCase();
      if (lower === upper) return escapeRegex(char);
      return `[${lower}${upper}]`;
    })
    .join('');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * One anchored alternation over every page that has a markdown twin, with or
 * without its trailing slash. An empty first branch matches the home page.
 * Longest first so `/work/ueue` cannot be claimed by the `work` branch.
 */
export function pagePathsPattern(pagePaths) {
  const branches = [...new Set(pagePaths.map((p) => p.replace(/^\/+|\/+$/g, '')))]
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .map(escapeRegex);
  return `^/(${['', ...branches].join('|')})/?$`;
}

const MARKDOWN = ciPattern('text/markdown');

/** Media ranges that one of our two representations can satisfy. */
const SATISFIABLE = [
  ciPattern('text/html'),
  MARKDOWN,
  ciPattern('text/*'),
  '\\*/\\*',
].join('|');

export function negotiationRoutes(pagePaths) {
  const src = pagePathsPattern(pagePaths);
  const dest = `${NEGOTIATION_ENDPOINT}?p=/$1`;

  return [
    {
      /* Two representations live at this URL, so caches must key on Accept.
         Scoped to page URLs on purpose: putting Vary on hashed assets would
         fragment the CDN cache for nothing. */
      src,
      headers: { vary: 'Accept' },
      continue: true,
    },
    {
      // The client named markdown. Whether it actually wins is /api/markdown's
      // call, not this regex's.
      src,
      has: [{ type: 'header', key: 'accept', value: `.*${MARKDOWN}.*` }],
      methods: ['GET', 'HEAD'],
      dest,
    },
    {
      // An Accept header that names nothing we can produce: owed a 406, which
      // static hosting would answer with a cheerful 200 of HTML.
      src,
      has: [{ type: 'header', key: 'accept' }],
      missing: [{ type: 'header', key: 'accept', value: `.*(${SATISFIABLE}).*` }],
      methods: ['GET', 'HEAD'],
      dest,
    },
  ];
}

/** True for a route this module added on an earlier run. */
function isNegotiationRoute(route) {
  if (!route || typeof route !== 'object') return false;
  if (typeof route.dest === 'string' && route.dest.startsWith(`${NEGOTIATION_ENDPOINT}?p=`)) {
    return true;
  }
  return route.continue === true && route.headers?.vary === 'Accept';
}

/**
 * Splice the rules into a Build Output API config, immediately before the
 * filesystem phase. Throws rather than degrading quietly: a config without a
 * filesystem handler is not one this build produced, and shipping it without
 * negotiation would look exactly like success.
 */
export function patchVercelConfig(config, pagePaths) {
  if (!config || typeof config !== 'object' || !Array.isArray(config.routes)) {
    throw new Error('Vercel config has no routes array; refusing to patch it blindly.');
  }
  if (pagePaths.length === 0) {
    throw new Error('No markdown twins were built, so there is nothing to negotiate.');
  }

  const routes = config.routes.filter((route) => !isNegotiationRoute(route));
  const filesystem = routes.findIndex((route) => route.handle === 'filesystem');
  if (filesystem === -1) {
    throw new Error('Vercel config has no `handle: filesystem` phase to insert before.');
  }

  return {
    ...config,
    routes: [
      ...routes.slice(0, filesystem),
      ...negotiationRoutes(pagePaths),
      ...routes.slice(filesystem),
    ],
  };
}
