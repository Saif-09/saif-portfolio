/**
 * Storage for the job-application workflow.
 *
 * Postgres rather than the repo, because this is the one place the phone and
 * the Mac have to agree. Applying happens on a phone, in the minute the post is
 * seen; logging and follow-ups happen at a desk. A file in a git repo would
 * make that a merge problem, and a merge problem is how a log stops being kept.
 *
 * Nothing here is public: every route that touches it is behind the studio key.
 */
import type { Pool } from 'pg';
import { getPool } from '../analytics/db';
import {
  redisAvailable, redisList, redisLog, redisUpdate, redisDelete,
  redisReadAnswers, redisWriteAnswers,
} from './redis-store';

export interface Application {
  id: number;
  appliedOn: string;
  company: string;
  role: string;
  source: string | null;
  howToApply: string | null;
  contact: string | null;
  variant: string | null;
  status: string;
  followUpOn: string | null;
  notes: string | null;
}

export class NoDatabase extends Error {
  constructor(detail?: string) {
    super(
      detail
        ? `No storage available: ${detail}`
        : 'Neither POSTGRES_URL nor REDIS_URL is configured, so nothing can be stored.',
    );
  }
}

/**
 * Postgres first, Redis second.
 *
 * Postgres is the right home for this, but "the database was unreachable" must
 * not mean "the application you just drafted is gone". The check runs once per
 * instance and is cached, so a dead Postgres costs one failed connection per
 * cold start rather than one per request.
 */
type Backend = 'pg' | 'redis' | 'none';
let backendChoice: Promise<Backend> | undefined;

async function backend(): Promise<Backend> {
  backendChoice ??= (async () => {
    try {
      const db = await getPool();
      if (db) {
        await db.query('SELECT 1');
        return 'pg' as const;
      }
    } catch (err) {
      console.warn('apply: Postgres unavailable, falling back to Redis:', (err as Error).message);
    }
    return (await redisAvailable()) ? ('redis' as const) : ('none' as const);
  })();
  return backendChoice;
}

/** Which store answered, so the UI can say so rather than looking broken. */
export async function activeBackend(): Promise<Backend> {
  return backend();
}

let schemaReady: Promise<void> | undefined;

async function ready(): Promise<Pool> {
  if ((await backend()) === 'none') throw new NoDatabase();
  const db = await getPool();
  if (!db) throw new NoDatabase();

  schemaReady ??= (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS job_answers (
        id integer PRIMARY KEY DEFAULT 1,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT job_answers_single_row CHECK (id = 1)
      );
      CREATE TABLE IF NOT EXISTS job_applications (
        id bigserial PRIMARY KEY,
        applied_on date NOT NULL DEFAULT current_date,
        company text NOT NULL,
        role text NOT NULL,
        source text,
        how_to_apply text,
        contact text,
        variant text,
        status text NOT NULL DEFAULT 'drafted',
        follow_up_on date,
        notes text,
        draft text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    /* Applying twice to the same posting reads as careless, so the database
       refuses rather than relying on whoever is writing to remember. */
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS job_applications_unique
        ON job_applications (lower(company), lower(role));
    `);
  })();

  await schemaReady;
  return db;
}

/* ------------------------------------------------------------------ answers */

/** The canonical answers blob, mirrored from ~/job-search/answers.yml. */
export async function readAnswers(): Promise<Record<string, unknown> | null> {
  if ((await backend()) === 'redis') return redisReadAnswers();
  const db = await ready();
  const { rows } = await db.query('SELECT data FROM job_answers WHERE id = 1');
  return rows[0]?.data ?? null;
}

export async function writeAnswers(data: Record<string, unknown>): Promise<void> {
  if ((await backend()) === 'redis') return redisWriteAnswers(data);
  const db = await ready();
  await db.query(
    `INSERT INTO job_answers (id, data, updated_at) VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [JSON.stringify(data)],
  );
}

/* ------------------------------------------------------------------- log */

const toApplication = (row: Record<string, any>): Application => ({
  id: Number(row.id),
  appliedOn: row.applied_on instanceof Date
    ? row.applied_on.toISOString().slice(0, 10)
    : String(row.applied_on),
  company: row.company,
  role: row.role,
  source: row.source,
  howToApply: row.how_to_apply,
  contact: row.contact,
  variant: row.variant,
  status: row.status,
  followUpOn: row.follow_up_on
    ? row.follow_up_on instanceof Date
      ? row.follow_up_on.toISOString().slice(0, 10)
      : String(row.follow_up_on)
    : null,
  notes: row.notes,
});

export async function listApplications(limit = 200): Promise<Application[]> {
  if ((await backend()) === 'redis') return (await redisList()).slice(0, limit);
  const db = await ready();
  const { rows } = await db.query(
    `SELECT id, applied_on, company, role, source, how_to_apply, contact,
            variant, status, follow_up_on, notes
       FROM job_applications
      ORDER BY applied_on DESC, id DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map(toApplication);
}

export interface NewApplication {
  company: string;
  role: string;
  source?: string;
  howToApply?: string;
  contact?: string;
  variant?: string;
  notes?: string;
  draft?: string;
  status?: string;
}

/**
 * Log an application. Returns `duplicate` with the existing row rather than
 * writing a second one, so the caller can say so instead of silently doing
 * nothing.
 */
export async function logApplication(
  input: NewApplication,
): Promise<{ application: Application; duplicate: boolean }> {
  if ((await backend()) === 'redis') return redisLog(input);
  const db = await ready();

  const existing = await db.query(
    `SELECT id, applied_on, company, role, source, how_to_apply, contact,
            variant, status, follow_up_on, notes
       FROM job_applications
      WHERE lower(company) = lower($1) AND lower(role) = lower($2)`,
    [input.company, input.role],
  );
  if (existing.rows[0]) {
    return { application: toApplication(existing.rows[0]), duplicate: true };
  }

  const { rows } = await db.query(
    `INSERT INTO job_applications
       (company, role, source, how_to_apply, contact, variant, status, notes, draft)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, applied_on, company, role, source, how_to_apply, contact,
               variant, status, follow_up_on, notes`,
    [
      input.company,
      input.role,
      input.source ?? null,
      input.howToApply ?? null,
      input.contact ?? null,
      input.variant ?? null,
      input.status ?? 'drafted',
      input.notes ?? null,
      input.draft ?? null,
    ],
  );
  return { application: toApplication(rows[0]), duplicate: false };
}

/**
 * Move an application along. Marking it `sent` sets the follow-up seven days
 * out, which is the whole reason the reminder has anything to read.
 */
export async function updateStatus(
  id: number,
  status: string,
): Promise<Application | null> {
  if ((await backend()) === 'redis') return redisUpdate(id, status);
  const db = await ready();
  const { rows } = await db.query(
    `UPDATE job_applications
        SET status = $2,
            applied_on = CASE WHEN $2 = 'sent' THEN current_date ELSE applied_on END,
            follow_up_on = CASE WHEN $2 = 'sent'
                                THEN current_date + interval '7 days'
                                ELSE follow_up_on END
      WHERE id = $1
      RETURNING id, applied_on, company, role, source, how_to_apply, contact,
                variant, status, follow_up_on, notes`,
    [id, status],
  );
  return rows[0] ? toApplication(rows[0]) : null;
}

/** Remove a row. Mis-read screenshots happen, and a log you cannot correct
 *  stops being trusted, which is the same as not having one. */
export async function deleteApplication(id: number): Promise<boolean> {
  if ((await backend()) === 'redis') return redisDelete(id);
  const db = await ready();
  const { rowCount } = await db.query('DELETE FROM job_applications WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}
