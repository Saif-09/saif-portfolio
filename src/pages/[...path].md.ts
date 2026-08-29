import type { APIRoute } from 'astro';
import { PAGES } from '../lib/markdown/pages';
import { mdParamForPage } from '../lib/markdown/render.mjs';

/**
 * The markdown twin of every canonical page, at a stable .md URL:
 * /work/ueue/ -> /work/ueue.md, / -> /index.md.
 *
 * Content negotiation (/api/markdown) serves the same bytes from the page's
 * own URL, but plenty of agents never send Accept: text/markdown and simply
 * guess at a .md suffix. Both doors lead to the same room.
 */
export const prerender = true;

export function getStaticPaths() {
  return PAGES.map((page) => ({
    params: { path: mdParamForPage(page.path) },
    props: { markdown: page.markdown },
  }));
}

export const GET: APIRoute = ({ props }) =>
  new Response((props as { markdown: string }).markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      /* Same resource, two representations: keep caches honest even on the
         suffixed URL, which a CDN could otherwise pair with the wrong one. */
      Vary: 'Accept',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
