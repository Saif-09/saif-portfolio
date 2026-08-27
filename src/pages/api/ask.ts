/**
 * "Ask this site": a retrieval-augmented agent, streamed as a visible trace.
 *
 * The response is Server-Sent Events rather than a finished string, because the
 * feature is as much about showing the pipeline as about the answer. Each
 * event is one thing that actually happened: the routing verdict, the retrieval
 * with its real similarity scores, each tool the model chose to call and what
 * came back, then the answer token by token.
 *
 * Nothing here is decorative. If a stage did not run, it says so.
 */
import type { APIRoute } from 'astro';
import { runAgent, agentAvailable, MAX_QUESTION_CHARS, type TraceEvent } from '../../lib/ask/agent';

export const prerender = false;

/* Sliding-window per-IP rate limit. In-memory is fine on Fluid Compute
   (warm instances); worst case a cold instance resets the window. An agent
   turn costs several model calls, so this stays tight. */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const stamps = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (stamps.length >= MAX_PER_WINDOW) {
    hits.set(ip, stamps);
    return true;
  }
  stamps.push(now);
  hits.set(ip, stamps);
  if (hits.size > 5000) hits.clear(); // memory backstop
  return false;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let ip = 'unknown';
  try {
    ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || clientAddress;
  } catch {
    /* clientAddress can throw in some local contexts */
  }

  if (rateLimited(ip)) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'Retry-After': '60' },
    });
  }

  let question: string;
  try {
    const body = await request.json();
    question = String(body?.question ?? '').trim();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!question || question.length > MAX_QUESTION_CHARS) {
    return json({ error: 'bad_request' }, 400);
  }
  if (!agentAvailable()) {
    return json({ error: 'unconfigured' }, 503);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: TraceEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      try {
        await runAgent(question, send, request.signal);
      } catch (err) {
        send({
          type: 'error',
          message: err instanceof Error ? err.message : 'The agent failed.',
        });
      } finally {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode('event: end\ndata: {}\n\n'));
          } catch {
            /* client already gone */
          }
          closed = true;
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      /* Proxies that buffer would defeat the entire point of streaming. */
      'x-accel-buffering': 'no',
    },
  });
};

export const GET: APIRoute = () => json({ error: 'method_not_allowed' }, 405);
