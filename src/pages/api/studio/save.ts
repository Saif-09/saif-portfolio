import type { APIRoute } from 'astro';
import { guard, json } from '../../../lib/studio/guard';
import { writeTex, GithubError } from '../../../lib/studio/github';
import { sanityCheck, MAX_TEX_CHARS } from '../../../lib/studio/edit';

export const prerender = false;

/**
 * Commit resume.tex. That commit is the publish step: it fires the build
 * workflow, which compiles all four variants, refuses to publish anything that
 * is not one page, and its commit deploys the PDFs.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const blocked = guard(request, clientAddress);
  if (blocked) return blocked;

  let body: { tex?: unknown; sha?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send JSON.' }, 400);
  }

  const tex = typeof body.tex === 'string' ? body.tex : '';
  const sha = typeof body.sha === 'string' ? body.sha : '';
  const message =
    typeof body.message === 'string' && body.message.trim()
      ? body.message.trim().slice(0, 200)
      : 'Update resume from the studio';

  if (!tex) return json({ error: 'Nothing to save.' }, 400);
  if (tex.length > MAX_TEX_CHARS) return json({ error: 'That resume source is too large.' }, 413);
  if (!sha) {
    return json({ error: 'Missing the base revision. Reload the studio and try again.' }, 400);
  }

  /* Last line of defence before a commit. The build's one-page gate catches
     layout regressions; this catches the file being structurally broken, which
     would just fail the build a minute later. */
  const problems = sanityCheck(tex);
  if (problems.length > 0) {
    return json({ error: `Not saved: ${problems.join('; ')}.`, problems }, 422);
  }

  try {
    const result = await writeTex(tex, sha, message);
    return json({ ...result, saved: true });
  } catch (err) {
    if (err instanceof GithubError) {
      /* 409 means main moved since this editor loaded: someone (or a phone
         edit) got there first. Saving anyway would silently drop their work. */
      if (err.status === 409) {
        return json(
          {
            error:
              'resume.tex changed on GitHub since you opened this. Reload to pull the current version, then reapply your edit.',
            code: 'conflict',
          },
          409,
        );
      }
      return json({ error: err.message }, err.status);
    }
    return json({ error: err instanceof Error ? err.message : 'The save failed.' }, 500);
  }
};
