/**
 * Redis backing for the job-application log.
 *
 * Postgres is the better home for this and stays the first choice, but it is
 * not always reachable (the Supabase project behind POSTGRES_URL is currently
 * refusing connections, which is also why the analytics dashboard reads empty).
 * A job log that stops accepting entries the moment one dependency wobbles is a
 * log that quietly stops being kept, so this exists as the fallback.
 *
 * The whole list lives under one key as JSON. That is fine at this size, and
 * read-modify-write races do not exist for one person applying to jobs.
 */
import type { Application, NewApplication } from './store';

const ANSWERS_KEY = 'job:answers';
const LOG_KEY = 'job:applications';

type RedisClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
};

let client: RedisClient | null | undefined;

async function getRedis(): Promise<RedisClient | null> {
  if (client !== undefined) return client;
  const url = import.meta.env.REDIS_URL ?? process.env.REDIS_URL;
  if (!url) {
    client = null;
    return client;
  }
  try {
    const { default: Redis } = await import('ioredis');
    client = new Redis(url, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
      enableOfflineQueue: false,
    }) as unknown as RedisClient;
  } catch {
    client = null;
  }
  return client;
}

export async function redisAvailable(): Promise<boolean> {
  return (await getRedis()) !== null;
}

async function readList(): Promise<Application[]> {
  const redis = await getRedis();
  if (!redis) return [];
  const raw = await redis.get(LOG_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeList(rows: Application[]): Promise<void> {
  const redis = await getRedis();
  if (!redis) throw new Error('Redis is not configured.');
  await redis.set(LOG_KEY, JSON.stringify(rows));
}

const today = () => new Date().toISOString().slice(0, 10);

const plusDays = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export async function redisList(): Promise<Application[]> {
  const rows = await readList();
  return [...rows].sort((a, b) =>
    a.appliedOn === b.appliedOn ? b.id - a.id : b.appliedOn.localeCompare(a.appliedOn),
  );
}

export async function redisLog(
  input: NewApplication,
): Promise<{ application: Application; duplicate: boolean }> {
  const rows = await readList();
  const existing = rows.find(
    (row) =>
      row.company.toLowerCase() === input.company.toLowerCase() &&
      row.role.toLowerCase() === input.role.toLowerCase(),
  );
  if (existing) return { application: existing, duplicate: true };

  const application: Application = {
    id: rows.reduce((max, row) => Math.max(max, row.id), 0) + 1,
    appliedOn: today(),
    company: input.company,
    role: input.role,
    source: input.source ?? null,
    howToApply: input.howToApply ?? null,
    contact: input.contact ?? null,
    variant: input.variant ?? null,
    status: input.status ?? 'drafted',
    /* Sent already? Then the follow-up clock starts now, same as Postgres. */
    followUpOn: (input.status ?? 'drafted') === 'sent' ? plusDays(7) : null,
    notes: input.notes ?? null,
  };
  await writeList([...rows, application]);
  return { application, duplicate: false };
}

export async function redisUpdate(id: number, status: string): Promise<Application | null> {
  const rows = await readList();
  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) return null;
  const updated: Application = {
    ...rows[index],
    status,
    appliedOn: status === 'sent' ? today() : rows[index].appliedOn,
    followUpOn: status === 'sent' ? plusDays(7) : rows[index].followUpOn,
  };
  rows[index] = updated;
  await writeList(rows);
  return updated;
}

export async function redisDelete(id: number): Promise<boolean> {
  const rows = await readList();
  const remaining = rows.filter((row) => row.id !== id);
  if (remaining.length === rows.length) return false;
  await writeList(remaining);
  return true;
}

export async function redisReadAnswers(): Promise<Record<string, unknown> | null> {
  const redis = await getRedis();
  if (!redis) return null;
  const raw = await redis.get(ANSWERS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function redisWriteAnswers(data: Record<string, unknown>): Promise<void> {
  const redis = await getRedis();
  if (!redis) throw new Error('Redis is not configured.');
  await redis.set(ANSWERS_KEY, JSON.stringify(data));
}
