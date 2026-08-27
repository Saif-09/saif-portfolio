import type { APIRoute } from 'astro';
import { guard, json } from '../../../lib/studio/guard';
import { pushDraft, latestPreviewRun, GithubError } from '../../../lib/studio/github';
import { sanityCheck, MAX_TEX_CHARS } from '../../../lib/studio/edit';
import {
  fastCompile,
  fastCompileConfigured,
  CompileServiceError,
} from '../../../lib/studio/compileService';
import { isVariantId } from '../../../lib/studio/variants';

export const prerender = false;

/**
 * Draft compile: build the current editor contents without publishing them.
 *
 * Two paths, picked by whether COMPILE_URL is configured:
 *   - instant: compile-service/ on Cloud Run answers in this request, warm in a
 *     few hundred milliseconds, and POST returns the PDFs directly.
 *   - ci: push the draft to the resume-preview branch and let GitHub Actions
 *     build it, which works everywhere but costs about a minute, nearly all of
 *     it pulling the TeX image. POST returns a commit; GET polls it.
 *
 * Either way it is the same compiler and the same one-page gate that decide
 * what gets published, and either way nothing is published.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const blocked = guard(request, clientAddress);
  if (blocked) return blocked;

  let body: { tex?: unknown; variants?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send JSON.' }, 400);
  }

  const tex = typeof body.tex === 'string' ? body.tex : '';
  /* The studio asks for the variant on screen first and the rest right after,
     so the preview it is actually looking at arrives in about a second instead
     of waiting on all four. */
  const only = Array.isArray(body.variants)
    ? body.variants.filter(isVariantId)
    : undefined;
  if (!tex) return json({ error: 'Nothing to compile.' }, 400);
  if (tex.length > MAX_TEX_CHARS) return json({ error: 'That resume source is too large.' }, 413);

  /* Cheaper to reject here than to spend a minute of CI proving it. */
  const problems = sanityCheck(tex);
  if (problems.length > 0) {
    return json({ error: `Will not compile: ${problems.join('; ')}.`, problems }, 422);
  }

  /* Fast path: the compile service answers in the same request. */
  if (fastCompileConfigured()) {
    try {
      const { pdfs, ms } = await fastCompile(tex, only);
      return json({ mode: 'instant', pdfs, ms });
    } catch (err) {
      if (err instanceof CompileServiceError) {
        /* A LaTeX problem. CI would reach the same verdict in a minute, so
           report it now rather than falling back. */
        return json({ error: err.message, mode: 'instant' }, 422);
      }
      /* The service is down or slow. CI still works, so use it. */
      console.warn('compile service unavailable, falling back to CI:', err);
    }
  }

  try {
    const { commitSha } = await pushDraft(tex);
    return json({ mode: 'ci', started: true, commitSha });
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
      state: !run.status
        ? 'idle'
        : !isOurs
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
