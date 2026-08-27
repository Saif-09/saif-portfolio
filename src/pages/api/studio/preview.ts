import type { APIRoute } from 'astro';
import { guard, json } from '../../../lib/studio/guard';
import { readPreviewPdf, GithubError } from '../../../lib/studio/github';
import { VARIANTS, isVariantId } from '../../../lib/studio/variants';

export const prerender = false;

/**
 * The freshly compiled draft PDF for one variant, as raw bytes.
 *
 * Returned as a body rather than a URL the iframe loads directly, so the studio
 * key travels in a header instead of a query string that would sit in browser
 * history. The client turns this into a blob URL.
 */
export const GET: APIRoute = async ({ request, clientAddress }) => {
  const blocked = guard(request, clientAddress);
  if (blocked) return blocked;

  const variant = new URL(request.url).searchParams.get('variant') ?? '';
  if (!isVariantId(variant)) {
    return json({ error: 'Unknown variant.' }, 400);
  }

  /* The published path is /Mohd_Saif_Resume*.pdf; the draft is the same
     filename inside resume/preview/ on the preview branch. */
  const filename = (VARIANTS.find((v) => v.id === variant)?.pdf ?? '').replace(/^\//, '');
  if (!filename) return json({ error: 'Unknown variant.' }, 400);

  try {
    const pdf = await readPreviewPdf(filename);
    return new Response(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(pdf.byteLength),
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
      },
    });
  } catch (err) {
    if (err instanceof GithubError) {
      if (err.status === 404) {
        return json({ error: 'No draft has been compiled yet.', code: 'no_draft' }, 404);
      }
      return json({ error: err.message }, err.status);
    }
    return json({ error: err instanceof Error ? err.message : 'Could not read the draft.' }, 500);
  }
};
