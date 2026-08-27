/**
 * Shared gate for every /api/studio/* route.
 *
 * The studio can edit and publish the resume, so it is closed by default: with
 * no STUDIO_KEY set on the server every route answers 503 and nothing is
 * reachable. That way deploying this code does not, on its own, expose a write
 * surface.
 */
import { timingSafeEqual } from 'node:crypto';
import { env } from '../env';

const KEY = () => env('STUDIO_KEY');

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      /* Never cached and never indexed, whatever sits in front of it. */
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}

/** Constant-time compare that does not leak length through an early return. */
function keyMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    /* Still burn a comparison so a wrong length is not measurably faster. */
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/* Brute-force brake. Per-IP, in memory: a serverless instance holds this only
   as long as it lives, which is enough to make guessing the key impractical
   without adding a store. */
const WINDOW_MS = 60_000;
const MAX_FAILURES = 10;
const failures = new Map<string, number[]>();

function tooManyFailures(ip: string): boolean {
  const now = Date.now();
  const recent = (failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(ip, recent);
  return recent.length >= MAX_FAILURES;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const recent = (failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  failures.set(ip, recent);
  if (failures.size > 2000) failures.clear();
}

/**
 * Returns a Response to send back when the request should be rejected, or null
 * when it may proceed. Call it first in every studio route.
 */
export function guard(request: Request, clientAddress?: string): Response | null {
  const expected = KEY();
  if (!expected) {
    return json(
      {
        error:
          'The studio is switched off. Set STUDIO_KEY in the Vercel project env to turn it on.',
        code: 'no_key_configured',
      },
      503,
    );
  }

  let ip = 'unknown';
  try {
    ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || clientAddress || 'unknown';
  } catch {
    /* local static contexts have no client address */
  }

  if (tooManyFailures(ip)) {
    return json({ error: 'Too many attempts. Wait a minute.', code: 'rate_limited' }, 429);
  }

  const given = request.headers.get('x-studio-key') ?? '';
  if (!given || !keyMatches(given, expected)) {
    recordFailure(ip);
    return json({ error: 'Wrong studio key.', code: 'unauthorized' }, 401);
  }

  return null;
}
