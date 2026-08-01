/**
 * Env-driven Postgres layer. POSTGRES_URL (or DATABASE_URL) points at local
 * Postgres in dev and Neon in production - connection string only, no code
 * change. When unset, writes are dropped and reads return empty aggregates
 * so an unwired preview shows the designed empty state instead of erroring.
 *
 * Privacy by construction: the schema has no column for IP, user agent, or
 * any identifier beyond the rotating anonymized session id.
 */
import type { Pool } from 'pg';

export interface IncomingEvent {
  type: string;
  path: string;
  locale: string | null;
  section: string | null;
  device: string | null;
  meta: Record<string, unknown>;
}

export interface InsightsPayload {
  range: string;
  generatedAt: string;
  empty: boolean;
  pageviews: number;
  uniques: number;
  /** Daily pageviews for the sparkline (last 14 days, oldest first). */
  daily: { day: string; pageviews: number }[];
  topSections: { section: string; ms: number }[];
  scrollDepth: { depth: number; sessions: number }[];
  clickMap: { x: number; y: number; section: string | null }[];
  devices: { device: string; count: number }[];
  os: { os: string; count: number }[];
  browsers: { browser: string; count: number }[];
  referrers: { ref: string; count: number }[];
  locales: { locale: string; count: number }[];
  funnel: { step: string; sessions: number }[];
}

let pool: Pool | null | undefined;
let schemaReady: Promise<void> | undefined;

async function getPool(): Promise<Pool | null> {
  if (pool !== undefined) return pool;
  const url =
    import.meta.env.POSTGRES_URL ??
    process.env.POSTGRES_URL ??
    import.meta.env.DATABASE_URL ??
    process.env.DATABASE_URL;
  if (!url) {
    pool = null;
    return pool;
  }
  const { default: pg } = await import('pg');
  // Supabase (and most hosted Postgres) require TLS; local dev does not.
  // Detect it from the URL so the same code path works in both places.
  const needsSsl = /supabase\.(co|com)|sslmode=require|sslmode=verify/i.test(url);
  pool = new pg.Pool({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 30_000,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  return pool;
}

/** Distinct sessions active within the last `windowMinutes` (live count). */
export async function liveSessions(windowMinutes = 5): Promise<number> {
  const db = await getPool();
  if (!db) return 0;
  await ensureSchema(db);
  const { rows } = await db.query(
    `SELECT count(DISTINCT session)::int AS n
     FROM events WHERE ts > now() - make_interval(mins => $1::int)`,
    [windowMinutes],
  );
  return rows[0]?.n ?? 0;
}

/** Pageview count for a given UTC day (key format YYYY-MM-DD). */
export async function pageviewsForUtcDay(day: string): Promise<number> {
  const db = await getPool();
  if (!db) return 0;
  await ensureSchema(db);
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM events
     WHERE type = 'pageview' AND (ts AT TIME ZONE 'UTC')::date = $1::date`,
    [day],
  );
  return rows[0]?.n ?? 0;
}

async function ensureSchema(db: Pool): Promise<void> {
  schemaReady ??= (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS events (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        ts TIMESTAMPTZ NOT NULL DEFAULT now(),
        type TEXT NOT NULL,
        session TEXT NOT NULL,
        path TEXT NOT NULL,
        locale TEXT,
        section TEXT,
        country TEXT,
        device TEXT,
        meta JSONB NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE INDEX IF NOT EXISTS events_ts_idx ON events (ts DESC);
      CREATE INDEX IF NOT EXISTS events_type_ts_idx ON events (type, ts DESC);
      CREATE INDEX IF NOT EXISTS events_session_ts_idx ON events (session, ts DESC);
    `);
  })();
  return schemaReady;
}

export async function insertEvents(
  session: string,
  country: string | null,
  events: IncomingEvent[],
): Promise<boolean> {
  const db = await getPool();
  if (!db) return false;
  await ensureSchema(db);

  const values: unknown[] = [];
  const rows = events
    .map((e, i) => {
      const base = i * 8;
      values.push(
        e.type,
        session,
        e.path,
        e.locale,
        e.section,
        country,
        e.device,
        JSON.stringify(e.meta ?? {}),
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}::jsonb)`;
    })
    .join(', ');

  await db.query(
    `INSERT INTO events (type, session, path, locale, section, country, device, meta) VALUES ${rows}`,
    values,
  );
  return true;
}

const RANGES: Record<string, string> = {
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
};

export function emptyInsights(range: string): InsightsPayload {
  return {
    range,
    generatedAt: new Date().toISOString(),
    empty: true,
    pageviews: 0,
    uniques: 0,
    daily: [],
    topSections: [],
    scrollDepth: [],
    clickMap: [],
    devices: [],
    os: [],
    browsers: [],
    referrers: [],
    locales: [],
    funnel: [
      { step: 'landed', sessions: 0 },
      { step: 'viewedWork', sessions: 0 },
      { step: 'usedDemo', sessions: 0 },
      { step: 'contacted', sessions: 0 },
    ],
  };
}

export async function computeInsights(range: string): Promise<InsightsPayload> {
  const db = await getPool();
  if (!db) return emptyInsights(range);
  await ensureSchema(db);
  const interval = RANGES[range] ?? RANGES['7d'];

  const q = async <T>(sql: string): Promise<T[]> =>
    (await db.query(sql.replaceAll('$INTERVAL', `'${interval}'`))).rows as T[];

  const [totals] = await q<{ pageviews: string; uniques: string }>(`
    SELECT count(*) AS pageviews, count(DISTINCT session) AS uniques
    FROM events WHERE type = 'pageview' AND ts > now() - $INTERVAL::interval
  `);

  const daily = await q<{ day: string; pageviews: string }>(`
    SELECT to_char(date_trunc('day', ts), 'YYYY-MM-DD') AS day, count(*) AS pageviews
    FROM events WHERE type = 'pageview' AND ts > now() - interval '14 days'
    GROUP BY 1 ORDER BY 1
  `);

  const topSections = await q<{ section: string; ms: string }>(`
    SELECT section, sum((meta->>'ms')::bigint) AS ms
    FROM events
    WHERE type = 'section_time' AND section IS NOT NULL AND ts > now() - $INTERVAL::interval
    GROUP BY section ORDER BY ms DESC LIMIT 8
  `);

  const scrollDepth = await q<{ depth: string; sessions: string }>(`
    SELECT (meta->>'depth')::int AS depth, count(DISTINCT session) AS sessions
    FROM events
    WHERE type = 'scroll_depth' AND ts > now() - $INTERVAL::interval
    GROUP BY 1 ORDER BY 1
  `);

  const clickMap = await q<{ x: number; y: number; section: string | null }>(`
    SELECT (meta->>'x')::float AS x, (meta->>'y')::float AS y, section
    FROM events
    WHERE type = 'click' AND path = '/' AND meta ? 'x' AND ts > now() - $INTERVAL::interval
    ORDER BY ts DESC LIMIT 500
  `);

  const devices = await q<{ device: string; count: string }>(`
    SELECT coalesce(device, 'unknown') AS device, count(DISTINCT session) AS count
    FROM events WHERE type = 'pageview' AND ts > now() - $INTERVAL::interval
    GROUP BY 1 ORDER BY 2 DESC
  `);

  const os = await q<{ os: string; count: string }>(`
    SELECT coalesce(meta->>'os', 'unknown') AS os, count(DISTINCT session) AS count
    FROM events WHERE type = 'pageview' AND ts > now() - $INTERVAL::interval
    GROUP BY 1 ORDER BY 2 DESC LIMIT 6
  `);

  const browsers = await q<{ browser: string; count: string }>(`
    SELECT coalesce(meta->>'browser', 'unknown') AS browser, count(DISTINCT session) AS count
    FROM events WHERE type = 'pageview' AND ts > now() - $INTERVAL::interval
    GROUP BY 1 ORDER BY 2 DESC LIMIT 6
  `);

  const referrers = await q<{ ref: string; count: string }>(`
    SELECT meta->>'ref' AS ref, count(DISTINCT session) AS count
    FROM events
    WHERE type = 'pageview' AND coalesce(meta->>'ref', '') <> '' AND ts > now() - $INTERVAL::interval
    GROUP BY 1 ORDER BY 2 DESC LIMIT 8
  `);

  const locales = await q<{ locale: string; count: string }>(`
    SELECT coalesce(locale, 'unknown') AS locale, count(DISTINCT session) AS count
    FROM events WHERE type = 'pageview' AND ts > now() - $INTERVAL::interval
    GROUP BY 1 ORDER BY 2 DESC LIMIT 8
  `);

  const [funnelRow] = await q<{
    landed: string;
    viewed_work: string;
    used_demo: string;
    contacted: string;
  }>(`
    SELECT
      count(DISTINCT session) FILTER (WHERE type = 'pageview') AS landed,
      count(DISTINCT session) FILTER (
        WHERE (type IN ('section_view', 'section_time') AND section = 'work')
           OR type = 'work_card_click'
      ) AS viewed_work,
      count(DISTINCT session) FILTER (WHERE type = 'demo_used') AS used_demo,
      count(DISTINCT session) FILTER (WHERE type = 'contact') AS contacted
    FROM events WHERE ts > now() - $INTERVAL::interval
  `);

  const pageviews = Number(totals?.pageviews ?? 0);
  return {
    range,
    generatedAt: new Date().toISOString(),
    empty: pageviews === 0,
    pageviews,
    uniques: Number(totals?.uniques ?? 0),
    daily: daily.map((r) => ({ day: r.day, pageviews: Number(r.pageviews) })),
    topSections: topSections.map((r) => ({ section: r.section, ms: Number(r.ms) })),
    scrollDepth: scrollDepth.map((r) => ({ depth: Number(r.depth), sessions: Number(r.sessions) })),
    clickMap,
    devices: devices.map((r) => ({ device: r.device, count: Number(r.count) })),
    os: os.map((r) => ({ os: r.os, count: Number(r.count) })),
    browsers: browsers.map((r) => ({ browser: r.browser, count: Number(r.count) })),
    referrers: referrers.map((r) => ({ ref: r.ref, count: Number(r.count) })),
    locales: locales.map((r) => ({ locale: r.locale, count: Number(r.count) })),
    funnel: [
      { step: 'landed', sessions: Number(funnelRow?.landed ?? 0) },
      { step: 'viewedWork', sessions: Number(funnelRow?.viewed_work ?? 0) },
      { step: 'usedDemo', sessions: Number(funnelRow?.used_demo ?? 0) },
      { step: 'contacted', sessions: Number(funnelRow?.contacted ?? 0) },
    ],
  };
}
