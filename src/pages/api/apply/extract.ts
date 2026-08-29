import type { APIRoute } from 'astro';
import { guard, json } from '../../../lib/studio/guard';
import { extractPost, draftEmail, applyAvailable } from '../../../lib/apply/extract';
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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Send the screenshot as multipart form data.' }, 400);
  }

  const file = form.get('image');
  const hint = typeof form.get('hint') === 'string' ? (form.get('hint') as string) : '';
  if (!(file instanceof File)) return json({ error: 'No screenshot attached.' }, 400);
  if (file.size > MAX_BYTES) return json({ error: 'That image is too large.' }, 413);
  if (!file.type.startsWith('image/')) return json({ error: 'That is not an image.' }, 415);

  try {
    const image = Buffer.from(await file.arrayBuffer());
    const { extraction, model, ms } = await extractPost(image, hint || undefined);

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
      answersLoaded: Boolean(answers),
      timing: { extractMs: ms, draftMs: draft.ms, model },
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Could not read that post.' }, 502);
  }
};
