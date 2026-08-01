/**
 * Env-driven key-value layer for the analytics product.
 *
 * REDIS_URL set (e.g. Upstash rediss://…) → ioredis.
 * REDIS_URL absent → in-memory fallback with the same semantics, so local
 * dev and an unwired preview keep working (empty/seed state, never a crash).
 * Switching to production is env vars only - no code change.
 */

export interface KV {
  /** Mark a session as live now (sorted-set semantics, pruned by window). */
  touchLive(session: string): Promise<void>;
  /** Number of sessions seen within the live window. */
  liveCount(): Promise<number>;
  incrCounter(key: string): Promise<void>;
  getCounter(key: string): Promise<number>;
  getCache(key: string): Promise<string | null>;
  setCache(key: string, value: string, ttlSeconds: number): Promise<void>;
}

const LIVE_WINDOW_MS = 5 * 60_000;
const LIVE_KEY = 'sa:live';

class MemoryKV implements KV {
  private live = new Map<string, number>();
  private counters = new Map<string, number>();
  private cache = new Map<string, { value: string; expires: number }>();

  async touchLive(session: string) {
    this.live.set(session, Date.now());
  }

  async liveCount() {
    const cutoff = Date.now() - LIVE_WINDOW_MS;
    for (const [key, ts] of this.live) if (ts < cutoff) this.live.delete(key);
    return this.live.size;
  }

  async incrCounter(key: string) {
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  async getCounter(key: string) {
    return this.counters.get(key) ?? 0;
  }

  async getCache(key: string) {
    const hit = this.cache.get(key);
    if (!hit || hit.expires < Date.now()) return null;
    return hit.value;
  }

  async setCache(key: string, value: string, ttlSeconds: number) {
    this.cache.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  }
}

class RedisKV implements KV {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(client: any) {
    this.client = client;
  }

  async touchLive(session: string) {
    await this.client.zadd(LIVE_KEY, Date.now(), session);
    await this.client.expire(LIVE_KEY, 600);
  }

  async liveCount() {
    const cutoff = Date.now() - LIVE_WINDOW_MS;
    await this.client.zremrangebyscore(LIVE_KEY, 0, cutoff);
    return this.client.zcard(LIVE_KEY);
  }

  async incrCounter(key: string) {
    await this.client.incr(`sa:c:${key}`);
    await this.client.expire(`sa:c:${key}`, 60 * 60 * 48);
  }

  async getCounter(key: string) {
    const value = await this.client.get(`sa:c:${key}`);
    return value ? Number(value) : 0;
  }

  async getCache(key: string) {
    return this.client.get(`sa:cache:${key}`);
  }

  async setCache(key: string, value: string, ttlSeconds: number) {
    await this.client.set(`sa:cache:${key}`, value, 'EX', ttlSeconds);
  }
}

/**
 * Postgres-backed KV. When Supabase (or any Postgres) is wired but no Redis
 * is, the live count and daily pageviews are derived directly from the events
 * table - no separate KV store needed. touchLive/incrCounter are no-ops
 * because the events insert in track.ts already records the activity they'd
 * track. The insights cache stays per-instance in-memory (the response also
 * carries s-maxage=60, so the CDN absorbs most repeat reads).
 */
class PgKV implements KV {
  private cache = new Map<string, { value: string; expires: number }>();

  async touchLive() {
    /* activity is recorded by insertEvents; liveCount reads from events */
  }

  async liveCount() {
    const { liveSessions } = await import('./db');
    return liveSessions(LIVE_WINDOW_MS / 60_000);
  }

  async incrCounter() {
    /* derived from events, not a separate counter */
  }

  async getCounter(key: string) {
    const day = key.split(':')[1];
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return 0;
    const { pageviewsForUtcDay } = await import('./db');
    return pageviewsForUtcDay(day);
  }

  async getCache(key: string) {
    const hit = this.cache.get(key);
    if (!hit || hit.expires < Date.now()) return null;
    return hit.value;
  }

  async setCache(key: string, value: string, ttlSeconds: number) {
    this.cache.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  }
}

let instance: KV | undefined;

export async function getKV(): Promise<KV> {
  if (instance) return instance;
  const redisUrl = import.meta.env.REDIS_URL ?? process.env.REDIS_URL;
  const pgUrl =
    import.meta.env.POSTGRES_URL ??
    process.env.POSTGRES_URL ??
    import.meta.env.DATABASE_URL ??
    process.env.DATABASE_URL;
  if (redisUrl) {
    const { default: Redis } = await import('ioredis');
    instance = new RedisKV(new Redis(redisUrl, { maxRetriesPerRequest: 2, lazyConnect: false }));
  } else if (pgUrl) {
    instance = new PgKV();
  } else {
    instance = new MemoryKV();
  }
  return instance;
}
