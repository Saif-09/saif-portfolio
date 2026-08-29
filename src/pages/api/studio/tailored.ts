import type { APIRoute } from 'astro';
import { guard, json } from '../../../lib/studio/guard';
import {
  saveTailored, listTailored, deleteTailored, tailoredAvailable,
} from '../../../lib/studio/tailored';
import { fastCompile, fastCompileConfigured, CompileServiceError } from '../../../lib/studio/compileService';
import { sanityCheck, MAX_TEX_CHARS } from '../../../lib/studio/edit';

export const prerender = false;

/**
 * Save the editor's current source as a one-off, without touching resume.tex.
 *
 * This is the "keep the original four" half of saving: the tailored wording
 * gets its own slug and its own URL, and the canonical resume is untouched.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const blocked = guard(request, clientAddress);
  if (blocked) return blocked;

  let body: { tex?: unknown; label?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send JSON.' }, 400);
  }

  const tex = typeof body.tex === 'string' ? body.tex : '';
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 80) : '';
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : undefined;

  if (!tex) return json({ error: 'Nothing to save.' }, 400);
  if (tex.length > MAX_TEX_CHARS) return json({ error: 'That source is too large.' }, 413);
  if (!label) return json({ error: 'Give it a name, usually the company.' }, 400);
  if (!(await tailoredAvailable())) {
    return json({ error: 'No storage configured for tailored resumes.' }, 503);
  }

  const problems = sanityCheck(tex);
  if (problems.length > 0) {
    return json({ error: `Will not compile: ${problems.join('; ')}.`, problems }, 422);
  }
  if (!fastCompileConfigured()) {
    return json({ error: 'The compile service is not configured, so this cannot be built.' }, 503);
  }

  try {
    /* Compiled here and stored as PDFs: a tailored resume must not depend on
       the source still being around, or on anything recompiling it later. */
    const { pdfs } = await fastCompile(tex);
    const meta = await saveTailored({ label, tex, pdfs, note });
    return json({ ...meta, url: `/resume/for/${meta.slug}` });
  } catch (err) {
    if (err instanceof CompileServiceError) return json({ error: err.message }, 422);
    return json({ error: err instanceof Error ? err.message : 'Could not save it.' }, 500);
  }
};

export const GET: APIRoute = async ({ request, clientAddress }) => {
  const blocked = guard(request, clientAddress);
  if (blocked) return blocked;
  try {
    const tailored = await listTailored();
    return json({ tailored: tailored.map((row) => ({ ...row, url: `/resume/for/${row.slug}` })) });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Could not list them.' }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, clientAddress }) => {
  const blocked = guard(request, clientAddress);
  if (blocked) return blocked;
  const slug = new URL(request.url).searchParams.get('slug') ?? '';
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return json({ error: 'Bad slug.' }, 400);
  await deleteTailored(slug);
  return json({ removed: true });
};
