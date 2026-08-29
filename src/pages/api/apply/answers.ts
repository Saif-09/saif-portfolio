import type { APIRoute } from 'astro';
import { guard, json } from '../../../lib/studio/guard';
import { readAnswers, writeAnswers, NoDatabase } from '../../../lib/apply/store';

export const prerender = false;

/**
 * The canonical answers blob, mirrored up from ~/job-search/answers.yml so the
 * phone drafts from the same facts the Mac does.
 */
export const GET: APIRoute = async ({ request, clientAddress }) => {
  const blocked = guard(request, clientAddress);
  if (blocked) return blocked;
  try {
    const answers = await readAnswers();
    return json({ answers, present: Boolean(answers) });
  } catch (err) {
    if (err instanceof NoDatabase) return json({ error: err.message }, 503);
    return json({ error: err instanceof Error ? err.message : 'Could not read answers.' }, 500);
  }
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const blocked = guard(request, clientAddress);
  if (blocked) return blocked;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send JSON.' }, 400);
  }
  const answers = (body as { answers?: unknown })?.answers;
  if (!answers || typeof answers !== 'object') {
    return json({ error: 'Send { answers: { ... } }.' }, 400);
  }
  try {
    await writeAnswers(answers as Record<string, unknown>);
    return json({ saved: true });
  } catch (err) {
    if (err instanceof NoDatabase) return json({ error: err.message }, 503);
    return json({ error: err instanceof Error ? err.message : 'Could not save answers.' }, 500);
  }
};
