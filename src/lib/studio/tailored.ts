/**
 * One-off resumes, tailored to a single job, kept apart from the canonical four.
 *
 * Tailoring the source to one posting and saving it would quietly replace every
 * variant for every future application: the wording written for one company
 * becomes the wording everyone gets. That is a bad trade to make by accident,
 * so a tailored resume is stored under its own slug and `resume.tex` is left
 * alone. Replacing the base four stays possible, but it has to be chosen.
 *
 * Redis, because these are per-application artefacts rather than the record of
 * record: the canonical resume lives in git, where it belongs.
 */
const KEY_PREFIX = 'resume:tailored:';
const INDEX_KEY = 'resume:tailored:index';

/** A month is longer than any application takes to hear back. */
const TTL_SECONDS = 60 * 60 * 24 * 90;

export interface TailoredMeta {
  slug: string;
  label: string;
  createdAt: string;
  variants: string[];
  note?: string;
}

interface TailoredRecord extends TailoredMeta {
  tex: string;
  /** published filename -> base64 PDF */
  pdfs: Record<string, string>;
}

type RedisClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, ttl?: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

let client: RedisClient | null | undefined;

async function redis(): Promise<RedisClient | null> {
  if (client !== undefined) return client;
  const url = import.meta.env.REDIS_URL ?? process.env.REDIS_URL;
  if (!url) {
    client = null;
    return client;
  }
  try {
    const { default: Redis } = await import('ioredis');
    client = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,
      connectTimeout: 8000,
    }) as unknown as RedisClient;
  } catch {
    client = null;
  }
  return client;
}

export async function tailoredAvailable(): Promise<boolean> {
  return (await redis()) !== null;
}

/**
 * Company name to a URL slug, plus four random characters.
 *
 * The random tail is not security, it just stops the URLs being guessable by
 * walking company names: a recruiter given one link should not be able to see
 * what was written for someone else.
 */
export function slugify(label: string): string {
  const base =
    label
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'role';
  const tail = Math.random().toString(36).slice(2, 6);
  return `${base}-${tail}`;
}

async function readIndex(): Promise<TailoredMeta[]> {
  const db = await redis();
  if (!db) return [];
  const raw = await db.get(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(rows: TailoredMeta[]): Promise<void> {
  const db = await redis();
  if (!db) throw new Error('Redis is not configured.');
  await db.set(INDEX_KEY, JSON.stringify(rows));
}

export async function saveTailored(input: {
  label: string;
  tex: string;
  pdfs: Record<string, string>;
  note?: string;
}): Promise<TailoredMeta> {
  const db = await redis();
  if (!db) throw new Error('No Redis configured, so a tailored resume cannot be stored.');

  const slug = slugify(input.label);
  const meta: TailoredMeta = {
    slug,
    label: input.label,
    createdAt: new Date().toISOString(),
    variants: Object.keys(input.pdfs),
    note: input.note,
  };
  const record: TailoredRecord = { ...meta, tex: input.tex, pdfs: input.pdfs };

  await db.set(`${KEY_PREFIX}${slug}`, JSON.stringify(record), 'EX', TTL_SECONDS);
  await writeIndex([meta, ...(await readIndex())].slice(0, 100));
  return meta;
}

export async function listTailored(): Promise<TailoredMeta[]> {
  return readIndex();
}

export async function readTailored(slug: string): Promise<TailoredRecord | null> {
  const db = await redis();
  if (!db) return null;
  const raw = await db.get(`${KEY_PREFIX}${slug}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function deleteTailored(slug: string): Promise<boolean> {
  const db = await redis();
  if (!db) return false;
  await db.del(`${KEY_PREFIX}${slug}`);
  await writeIndex((await readIndex()).filter((row) => row.slug !== slug));
  return true;
}
