/**
 * HTTP proactive content negotiation, RFC 9110 section 12.5.1.
 *
 * Plain .mjs on purpose, the same reason chunk.mjs is: this runs in two places
 * that cannot share a TypeScript build. Astro compiles it into the serverless
 * bundle for /api/markdown and the 404 route, and `node --test` imports it
 * directly. One copy means the tests exercise the code that actually ships.
 *
 * Substring-matching "text/markdown" is the obvious implementation and it is
 * wrong: it serves markdown to `Accept: text/html, text/markdown;q=0.1` and to
 * `Accept: text/markdown;q=0`. Both are real headers, and both mean HTML.
 */

/** The representations this site can produce, best default first. */
export const PRODUCES = ['text/html', 'text/markdown'];

/**
 * Split an Accept header into ranges, keeping the client's ordering.
 * Position is a legitimate tie-break: `text/markdown, text/html` and
 * `text/html, text/markdown` carry different intent at equal q.
 */
export function parseAccept(header) {
  return String(header)
    .split(',')
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw, index) => {
      const parts = raw.split(';').map((s) => s.trim());
      const type = parts[0].toLowerCase();
      if (!/^[^\s/]+\/[^\s/]+$/.test(type)) return null;
      let q = 1;
      for (const param of parts.slice(1)) {
        const eq = param.indexOf('=');
        if (eq === -1) continue;
        const name = param.slice(0, eq).trim().toLowerCase();
        if (name !== 'q') continue;
        const parsed = Number(param.slice(eq + 1).trim());
        if (!Number.isNaN(parsed)) q = Math.max(0, Math.min(1, parsed));
      }
      const specificity = type === '*/*' ? 0 : type.endsWith('/*') ? 1 : 2;
      return { type, q, specificity, index };
    })
    .filter((entry) => entry !== null);
}

function matches(entry, candidate) {
  if (entry.type === '*/*') return true;
  if (entry.type.endsWith('/*')) return candidate.startsWith(entry.type.slice(0, -1));
  return entry.type === candidate;
}

/**
 * The representation to serve, or null when none of them is acceptable
 * (the only case that earns a 406).
 *
 * A missing or empty Accept header means "no constraint", not "nothing works",
 * so it takes the default. Returning 406 there is the classic over-eager bug.
 */
export function selectRepresentation(header, produces = PRODUCES) {
  if (header === null || header === undefined || String(header).trim() === '') {
    return produces[0];
  }
  const entries = parseAccept(header);
  if (entries.length === 0) return produces[0];

  let best = null;
  let bestQ = -1;
  let bestPosition = Infinity;

  for (const candidate of produces) {
    // Per RFC 9110: the most specific matching range decides, whatever its q.
    // That is what makes "text/markdown;q=0" plus a wildcard a rejection of
    // markdown rather than a wildcard acceptance of it.
    let matched = null;
    for (const entry of entries) {
      if (!matches(entry, candidate)) continue;
      if (
        matched === null ||
        entry.specificity > matched.specificity ||
        (entry.specificity === matched.specificity && entry.index < matched.index)
      ) {
        matched = entry;
      }
    }
    if (matched === null || matched.q <= 0) continue;

    if (matched.q > bestQ || (matched.q === bestQ && matched.index < bestPosition)) {
      bestQ = matched.q;
      bestPosition = matched.index;
      best = candidate;
    }
  }

  return best;
}

/** True when the client would rather have markdown than HTML. */
export function prefersMarkdown(header) {
  return selectRepresentation(header) === 'text/markdown';
}

/**
 * Add Accept to a Vary header without clobbering what is already there.
 * Without it a CDN hands the first-cached representation to everyone after,
 * which is how an agent ends up with HTML it explicitly did not ask for.
 */
export function varyAccept(existing) {
  if (!existing) return 'Accept';
  const tokens = existing
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (tokens.some((t) => t.toLowerCase() === 'accept')) return existing;
  return [...tokens, 'Accept'].join(', ');
}

/** RFC 9110 recommends a 406 body that lists what the resource can produce. */
export function notAcceptableBody(header, produces = PRODUCES) {
  return [
    'This resource is available in:',
    ...produces.map((type) => `- ${type}`),
    '',
    `You requested: ${String(header ?? '').trim() || '(no Accept header)'}`,
    '',
  ].join('\n');
}
