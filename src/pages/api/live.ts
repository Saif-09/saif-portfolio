import type { APIRoute } from 'astro';
import { getKV } from '../../lib/analytics/kv';

export const prerender = false;

export const GET: APIRoute = async () => {
  let live = 0;
  let pvToday = 0;
  try {
    const kv = await getKV();
    live = await kv.liveCount();
    pvToday = await kv.getCounter(`pv:${new Date().toISOString().slice(0, 10)}`);
  } catch {
    /* unwired storage → zeros */
  }
  return new Response(JSON.stringify({ live, pvToday }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
