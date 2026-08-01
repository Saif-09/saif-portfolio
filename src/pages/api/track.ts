import type { APIRoute } from 'astro';
import { insertEvents, type IncomingEvent } from '../../lib/analytics/db';
import { getKV } from '../../lib/analytics/kv';

export const prerender = false;

const EVENT_TYPES = new Set([
  'pageview',
  'scroll_depth',
  'section_time',
  'section_view',
  'click',
  'cta_click',
  'work_card_click',
  'lang_change',
  'theme_change',
  'demo_used',
  'graph_node_click',
  'contact',
]);

const BOT_UA =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|pingdom|monitor|scrape|python-requests|curl|wget/i;

const MAX_BATCH = 40;
const MAX_STR = 200;
const MAX_META_BYTES = 2000;

/* per-IP batch rate limit (the IP is compared, never stored) */
const WINDOW_MS = 60_000;
const MAX_BATCHES = 60;
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const stamps = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (stamps.length >= MAX_BATCHES) return true;
  stamps.push(now);
  hits.set(ip, stamps);
  if (hits.size > 5000) hits.clear();
  return false;
}

const clean = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value.slice(0, MAX_STR) : null;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const noContent = new Response(null, { status: 204 });

  /* bot filter */
  const ua = request.headers.get('user-agent') ?? '';
  if (!ua || BOT_UA.test(ua)) return noContent;

  let ip = 'unknown';
  try {
    ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || clientAddress;
  } catch {
    /* local static contexts */
  }
  if (rateLimited(ip)) return new Response(null, { status: 429 });

  /* country comes from Vercel's edge header - the IP itself is never stored */
  const country = request.headers.get('x-vercel-ip-country');

  let body: { session?: unknown; events?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const session = clean(body.session);
  if (!session || !/^[a-z0-9-]{8,64}$/.test(session)) return new Response(null, { status: 400 });
  if (!Array.isArray(body.events) || body.events.length === 0) return noContent;

  const events: IncomingEvent[] = [];
  for (const raw of (body.events as Record<string, unknown>[]).slice(0, MAX_BATCH)) {
    const type = clean(raw.type);
    const path = clean(raw.path) ?? '/';
    if (!type || !EVENT_TYPES.has(type)) continue;
    let meta: Record<string, unknown> = {};
    if (raw.meta && typeof raw.meta === 'object') {
      const json = JSON.stringify(raw.meta);
      if (json.length <= MAX_META_BYTES) meta = raw.meta as Record<string, unknown>;
    }
    events.push({
      type,
      path,
      locale: clean(raw.locale),
      section: clean(raw.section),
      device: clean(raw.device),
      meta,
    });
  }
  if (events.length === 0) return noContent;

  try {
    const kv = await getKV();
    await kv.touchLive(session);
    if (events.some((e) => e.type === 'pageview')) {
      await kv.incrCounter(`pv:${new Date().toISOString().slice(0, 10)}`);
    }
    await insertEvents(session, country, events);
  } catch (error) {
    console.error('track insert failed:', (error as Error).message);
  }
  return noContent;
};
