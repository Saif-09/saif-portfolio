import type { APIRoute } from 'astro';
import {
  PRODUCES,
  selectRepresentation,
  notAcceptableBody,
  varyAccept,
} from '../../lib/http/accept.mjs';
import { pageMarkdownFor, SITE } from '../../lib/markdown/pages';
import { notFoundMarkdown } from '../../lib/markdown/not-found';

/**
 * The Accept negotiation endpoint (acceptmarkdown.com).
 *
 * Pages stay prerendered, which is what keeps the sitemap complete and the
 * CDN fast, so negotiation cannot happen inside them. Instead the routing
 * layer (scripts/vercel-routes.mjs) rewrites the two request shapes that
 * static hosting gets wrong, and only those, to this endpoint:
 *
 *   - Accept mentions markdown  -> may want the markdown representation
 *   - Accept excludes everything we can produce -> owed a 406
 *
 * Everything else never touches a function. `?p=` carries the original path,
 * because the rewrite has already replaced it in the URL.
 */
export const prerender = false;

/** Guards the HTML fall-back fetch below against ever calling itself. */
const LOOP_HEADER = 'x-markdown-negotiation';

const CACHE = 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400';

export const GET: APIRoute = async ({ request, url }) => {
  const accept = request.headers.get('accept');
  const path = url.searchParams.get('p') || '/';
  const chosen = selectRepresentation(accept);

  if (chosen === null) {
    /* Nothing we can produce is acceptable. RFC 9110 asks for a body that
       lists the alternatives so the client can retry knowing what exists. */
    return new Response(notAcceptableBody(accept, PRODUCES), {
      status: 406,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        Vary: 'Accept',
        'Cache-Control': 'no-store',
        Link: `<${SITE}/llms.txt>; rel="alternate"; type="text/plain"`,
      },
    });
  }

  if (chosen === 'text/markdown') {
    const page = pageMarkdownFor(path);
    const body = page?.markdown ?? notFoundMarkdown();
    return new Response(body, {
      status: page ? 200 : 404,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        Vary: 'Accept',
        'Cache-Control': page ? CACHE : 'public, max-age=0, s-maxage=60',
        Link: `<${SITE}${page?.path ?? path}>; rel="canonical"`,
      },
    });
  }

  /* Markdown was named but ranked below HTML (`text/markdown;q=0.1,
     text/html`), so the routing rule sent us a request that wants the static
     page after all. Fetch it back with an Accept the rule cannot match. */
  if (request.headers.get(LOOP_HEADER) === null) {
    const origin = originFor(request, url);
    try {
      const upstream = await fetch(new URL(path, origin), {
        headers: { accept: 'text/html', [LOOP_HEADER]: '1' },
      });
      const headers = new Headers(upstream.headers);
      headers.set('Vary', varyAccept(headers.get('Vary')));
      headers.delete('content-encoding');
      headers.delete('content-length');
      return new Response(await upstream.arrayBuffer(), {
        status: upstream.status,
        headers,
      });
    } catch {
      /* Fall through: markdown is a worse answer than HTML here, but it is a
         far better one than a 502. */
    }
  }

  const page = pageMarkdownFor(path);
  return new Response(page?.markdown ?? notFoundMarkdown(), {
    status: page ? 200 : 404,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      Vary: 'Accept',
      'Cache-Control': 'no-store',
    },
  });
};

function originFor(request: Request, url: URL): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) return url.origin;
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}
