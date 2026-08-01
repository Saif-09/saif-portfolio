import type { APIRoute } from 'astro';
import { computeInsights, emptyInsights } from '../../lib/analytics/db';
import { getKV } from '../../lib/analytics/kv';

export const prerender = false;

const CACHE_TTL_SECONDS = 60;
const RANGES = new Set(['24h', '7d', '30d']);

export const GET: APIRoute = async ({ url }) => {
  const range = url.searchParams.get('range') ?? '7d';
  if (!RANGES.has(range)) {
    return new Response(JSON.stringify({ error: 'bad_range' }), { status: 400 });
  }

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=30, s-maxage=60',
  };

  try {
    const kv = await getKV();
    const cached = await kv.getCache(`insights:${range}`);
    if (cached) return new Response(cached, { headers });

    const insights = await computeInsights(range);
    const json = JSON.stringify(insights);
    await kv.setCache(`insights:${range}`, json, CACHE_TTL_SECONDS);
    return new Response(json, { headers });
  } catch (error) {
    console.error('insights failed:', (error as Error).message);
    return new Response(JSON.stringify(emptyInsights(range)), { headers });
  }
};
