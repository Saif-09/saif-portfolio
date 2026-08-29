import type { APIRoute } from 'astro';
import { readTailored } from '../../../lib/studio/tailored';
import { VARIANTS } from '../../../lib/studio/variants';

export const prerender = false;

/**
 * A tailored resume, at its own URL, so it can be sent like any other link.
 *
 * Public by design: it is a resume, meant to be handed to one company. The slug
 * carries a random tail so the URLs cannot be walked by guessing company names,
 * and it is noindexed so a version written for one employer never turns up in a
 * search for him.
 */
export const GET: APIRoute = async ({ params, request }) => {
  const slug = String(params.slug ?? '');
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) {
    return new Response('Not found', { status: 404 });
  }

  const record = await readTailored(slug);
  if (!record) {
    return new Response('That tailored resume has expired or never existed.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const wanted = new URL(request.url).searchParams.get('v') ?? '';
  const variant = VARIANTS.find((v) => v.id === wanted) ?? VARIANTS[0];
  const filename = variant.pdf.replace(/^\//, '');
  const base64 = record.pdfs[filename] ?? Object.values(record.pdfs)[0];
  if (!base64) return new Response('Not found', { status: 404 });

  const pdf = Buffer.from(base64, 'base64');
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(pdf.byteLength),
      'content-disposition': `inline; filename="Mohd_Saif_Resume.pdf"`,
      'cache-control': 'public, max-age=0, must-revalidate',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
};
