import type { APIRoute } from 'astro';
import { guard, json } from '../../../lib/studio/guard';
import { latestRun, GithubError } from '../../../lib/studio/github';

export const prerender = false;

/** Polled by the studio after a save, to say when the new PDFs are live. */
export const GET: APIRoute = async ({ request, clientAddress }) => {
  const blocked = guard(request, clientAddress);
  if (blocked) return blocked;

  try {
    return json({ run: await latestRun() });
  } catch (err) {
    if (err instanceof GithubError) return json({ error: err.message }, err.status);
    return json({ error: err instanceof Error ? err.message : 'Could not read the build status' }, 500);
  }
};
