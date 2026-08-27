import type { APIRoute } from 'astro';
import { guard, json } from '../../../lib/studio/guard';
import { readTex, GithubError, latestRun } from '../../../lib/studio/github';
import { VARIANTS } from '../../../lib/studio/variants';
import { hasAiProvider } from '../../../lib/studio/edit';
import { env } from '../../../lib/studio/env';

export const prerender = false;

/** The current resume source plus everything the studio needs to render once. */
export const GET: APIRoute = async ({ request, clientAddress }) => {
  const blocked = guard(request, clientAddress);
  if (blocked) return blocked;

  try {
    /* Both in one round trip so opening the studio is a single request. */
    const [file, run] = await Promise.all([readTex(), latestRun().catch(() => null)]);
    return json({
      tex: file.tex,
      sha: file.sha,
      variants: VARIANTS,
      run,
      ai: {
        provider: hasAiProvider()
          ? env('ANTHROPIC_API_KEY')
            ? 'claude'
            : 'gemini'
          : null,
      },
    });
  } catch (err) {
    if (err instanceof GithubError) return json({ error: err.message }, err.status);
    return json({ error: err instanceof Error ? err.message : 'Could not read resume.tex' }, 500);
  }
};
