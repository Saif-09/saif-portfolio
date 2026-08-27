import type { APIRoute } from 'astro';
import { guard, json } from '../../../lib/studio/guard';
import {
  editResume,
  MAX_INSTRUCTION_CHARS,
  MAX_TEX_CHARS,
} from '../../../lib/studio/edit';
import { isVariantId } from '../../../lib/studio/variants';

export const prerender = false;

/**
 * Turn a plain-English instruction into a proposed new resume.tex.
 *
 * Nothing is committed here. The caller gets the resulting text back and
 * decides whether to save it, so an edit is always reviewable first.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const blocked = guard(request, clientAddress);
  if (blocked) return blocked;

  let body: { tex?: unknown; instruction?: unknown; variant?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send JSON.' }, 400);
  }

  const tex = typeof body.tex === 'string' ? body.tex : '';
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
  const variant = isVariantId(body.variant) ? body.variant : undefined;

  if (!tex) return json({ error: 'No resume source was sent.' }, 400);
  if (tex.length > MAX_TEX_CHARS) return json({ error: 'That resume source is too large.' }, 413);
  if (!instruction) return json({ error: 'Say what you want changed.' }, 400);
  if (instruction.length > MAX_INSTRUCTION_CHARS) {
    return json({ error: `Keep the instruction under ${MAX_INSTRUCTION_CHARS} characters.` }, 413);
  }

  try {
    const outcome = await editResume(tex, instruction, variant);
    return json({
      tex: outcome.tex,
      changed: outcome.changed,
      note: outcome.note,
      provider: outcome.provider,
      retried: outcome.retried,
      problems: outcome.problems,
      applied: outcome.applied.map((e) => ({
        why: e.why ?? '',
        find: e.find,
        replace: e.replace,
      })),
      rejected: outcome.rejected,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'The AI edit failed.' }, 502);
  }
};
