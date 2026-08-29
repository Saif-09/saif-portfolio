import type { APIRoute } from 'astro';
import { guard, json } from '../../../lib/studio/guard';
import {
  extractPost, extractText, fetchPost, draftEmail, applyAvailable,
  type Extraction,
} from '../../../lib/apply/extract';
import { readAnswers, NoDatabase } from '../../../lib/apply/store';

export const prerender = false;

/** Phone screenshots are a few MB; anything past this is not a job post. */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Screenshot in, drafted application out. Reads but never writes: logging is a
 * separate, deliberate action, so a draft you decide against leaves no trace.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const blocked = guard(request, clientAddress);
  if (blocked) return blocked;
  if (!applyAvailable()) return json({ error: 'No model key configured.' }, 503);

  const contentType = request.headers.get('content-type') ?? '';
  const hint = request.headers.get('x-apply-hint') ?? '';

  /* Three ways in, because a job post arrives in three shapes: a screenshot
     from a phone, a link to a careers page, or text pasted out of one. */
  if (contentType.includes('application/json')) {
    let body: { url?: unknown; text?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Send JSON.' }, 400);
    }

    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const pasted = typeof body.text === 'string' ? body.text.trim() : '';
    if (!url && !pasted) return json({ error: 'Send a url or some text.' }, 400);

    try {
      const source = url ? await fetchPost(url) : pasted.slice(0, 20_000);
      const { extraction, model, ms } = await extractText(
        hint ? `${source}\n\nExtra context: ${hint}` : source,
      );
      return finish(extraction, model, ms, url || undefined);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : 'Could not read that.' }, 502);
    }
  }

  if (!contentType.startsWith('image/')) {
    return json({ error: 'Send an image body, or JSON with a url or text.' }, 415);
  }

  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0) return json({ error: 'No screenshot attached.' }, 400);
    if (bytes.byteLength > MAX_BYTES) return json({ error: 'That image is too large.' }, 413);
    const { extraction, model, ms } = await extractPost(Buffer.from(bytes), hint || undefined);
    return finish(extraction, model, ms);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Could not read that post.' }, 502);
  }
};

/** Shared by all three inputs: refuse scams, load answers, draft. */
async function finish(extraction: Extraction, model: string, ms: number, sourceUrl?: string) {
  /* Say so and stop. Drafting a polite reply to a scam wastes his time. */
  if (extraction.suspicious) {
    return json({
      extraction,
      draft: null,
      refused: extraction.suspiciousReason || 'This looks like a scam posting.',
      timing: { extractMs: ms, model },
    });
  }

  /* Answers are optional: without them the draft is thinner but still real. */
  let answers: Record<string, unknown> | null = null;
  try {
    answers = await readAnswers();
  } catch (err) {
    if (!(err instanceof NoDatabase)) throw err;
  }

  const draft = await draftEmail(extraction, answers);
  return json({
    extraction,
    draft,
    sourceUrl,
    answersLoaded: Boolean(answers),
    timing: { extractMs: ms, draftMs: draft.ms, model },
  });
}
