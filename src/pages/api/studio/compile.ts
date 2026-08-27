import type { APIRoute } from 'astro';
import { guard, json } from '../../../lib/studio/guard';
import { pushDraft, latestPreviewRun, GithubError } from '../../../lib/studio/github';
import { sanityCheck, MAX_TEX_CHARS } from '../../../lib/studio/edit';

export const prerender = false;

/**
 * Draft compile: build the current editor contents without publishing them.
 *
 * POST starts one, GET reports on it. The compile runs in CI (there is no LaTeX
 * runtime on Vercel), so this takes about a minute rather than the couple of
 * seconds a local engine would. In exchange it is the same compiler, with the
 * same one-page gate, that decides what actually gets published.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const blocked = guard(request, clientAddress);
  if (blocked) return blocked;

  let body: { tex?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send JSON.' }, 400);
  }

  const tex = typeof body.tex === 'string' ? body.tex : '';
  if (!tex) return json({ error: 'Nothing to compile.' }, 400);
  if (tex.length > MAX_TEX_CHARS) return json({ error: 'That resume source is too large.' }, 413);

  /* Cheaper to reject here than to spend a minute of CI proving it. */
  const problems = sanityCheck(tex);
  if (problems.length > 0) {
    return json({ error: `Will not compile: ${problems.join('; ')}.`, problems }, 422);
  }

  try {
    const { commitSha } = await pushDraft(tex);
    return json({ started: true, commitSha });
  } catch (err) {
    if (err instanceof GithubError) return json({ error: err.message }, err.status);
    return json({ error: err instanceof Error ? err.message : 'Could not start the compile.' }, 500);
  }
};

export const GET: APIRoute = async ({ request, clientAddress }) => {
  const blocked = guard(request, clientAddress);
  if (blocked) return blocked;

  const wanted = new URL(request.url).searchParams.get('commit') ?? '';

  try {
    const run = await latestPreviewRun();

    /* Until CI picks the push up, the newest run is still the previous draft's.
       Saying "queued" rather than reporting that stale run as this one's result
       is the difference between a correct progress display and a lying one. */
    const isOurs = !wanted || run.headSha === wanted;

    return json({
      run,
      state: !isOurs
        ? 'queued'
        : run.status === 'completed'
          ? run.conclusion === 'success'
            ? 'ready'
            : 'failed'
          : 'building',
    });
  } catch (err) {
    if (err instanceof GithubError) return json({ error: err.message }, err.status);
    return json({ error: err instanceof Error ? err.message : 'Could not read the compile.' }, 500);
  }
};
