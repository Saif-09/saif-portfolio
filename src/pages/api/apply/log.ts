import type { APIRoute } from 'astro';
import { guard, json } from '../../../lib/studio/guard';
import {
  listApplications,
  logApplication,
  updateStatus,
  deleteApplication,
  NoDatabase,
} from '../../../lib/apply/store';

export const prerender = false;

const STATUSES = ['drafted', 'sent', 'replied', 'interviewing', 'rejected', 'ghosted'];

const fail = (err: unknown) =>
  err instanceof NoDatabase
    ? json({ error: err.message }, 503)
    : json({ error: err instanceof Error ? err.message : 'Log operation failed.' }, 500);

export const GET: APIRoute = async ({ request, clientAddress }) => {
  const blocked = guard(request, clientAddress);
  if (blocked) return blocked;
  try {
    const applications = await listApplications();
    const today = new Date().toISOString().slice(0, 10);
    return json({
      applications,
      /* Computed here so the phone and the Mac agree on what is overdue
         without either re-deriving the rule. */
      overdue: applications.filter(
        (a) => a.status === 'sent' && a.followUpOn && a.followUpOn <= today,
      ),
      undrafted: applications.filter((a) => a.status === 'drafted'),
    });
  } catch (err) {
    return fail(err);
  }
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const blocked = guard(request, clientAddress);
  if (blocked) return blocked;
  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send JSON.' }, 400);
  }
  if (!body.company || !body.role) {
    return json({ error: 'company and role are required.' }, 400);
  }
  try {
    const result = await logApplication({
      company: String(body.company).slice(0, 200),
      role: String(body.role).slice(0, 200),
      source: body.source,
      howToApply: body.howToApply,
      contact: body.contact,
      variant: body.variant,
      notes: body.notes,
      draft: body.draft,
      status: STATUSES.includes(body.status) ? body.status : 'drafted',
    });
    return json(result, result.duplicate ? 409 : 200);
  } catch (err) {
    return fail(err);
  }
};

export const PATCH: APIRoute = async ({ request, clientAddress }) => {
  const blocked = guard(request, clientAddress);
  if (blocked) return blocked;
  let body: { id?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send JSON.' }, 400);
  }
  const id = Number(body.id);
  const status = String(body.status ?? '');
  if (!Number.isFinite(id)) return json({ error: 'A numeric id is required.' }, 400);
  if (!STATUSES.includes(status)) {
    return json({ error: `status must be one of: ${STATUSES.join(', ')}` }, 400);
  }
  try {
    const application = await updateStatus(id, status);
    return application ? json({ application }) : json({ error: 'No such application.' }, 404);
  } catch (err) {
    return fail(err);
  }
};

export const DELETE: APIRoute = async ({ request, clientAddress }) => {
  const blocked = guard(request, clientAddress);
  if (blocked) return blocked;
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isFinite(id)) return json({ error: 'A numeric id is required.' }, 400);
  try {
    const removed = await deleteApplication(id);
    return removed ? json({ removed: true }) : json({ error: 'No such application.' }, 404);
  } catch (err) {
    return fail(err);
  }
};
