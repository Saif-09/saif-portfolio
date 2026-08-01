import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Contact form backend (Phase 5, D005/D017).
 * Env-driven: RESEND_API_KEY absent → simulated success (dev/preview keep
 * working, no build break). Real key + verified sender land at launch.
 */

const TO = process.env.CONTACT_TO ?? 'saifmd238@gmail.com';
const FROM = process.env.CONTACT_FROM ?? 'Portfolio Contact <onboarding@resend.dev>';

const LIMITS = { name: 100, email: 200, message: 5000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* per-IP rate limit: 5/min */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const stamps = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (stamps.length >= MAX_PER_WINDOW) return true;
  stamps.push(now);
  hits.set(ip, stamps);
  if (hits.size > 5000) hits.clear();
  return false;
}

/** Cheap spam heuristics - links-heavy or shouting messages get dropped. */
function looksLikeSpam(message: string): boolean {
  const links = (message.match(/https?:\/\//g) ?? []).length;
  if (links > 3) return true;
  const letters = message.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 40) {
    const upper = letters.replace(/[^A-Z]/g, '').length;
    if (upper / letters.length > 0.7) return true;
  }
  return /\b(viagra|casino|crypto pump|seo backlinks|guest post)\b/i.test(message);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let ip = 'unknown';
  try {
    ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || clientAddress;
  } catch {
    /* local */
  }
  if (rateLimited(ip)) return json(429, { error: 'rate_limited' });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'bad_request' });
  }

  /* honeypot: real users never fill "company" - bots do. Pretend success. */
  if (typeof body.company === 'string' && body.company.trim() !== '') {
    return json(200, { ok: true });
  }

  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim();
  const message = String(body.message ?? '').trim();

  if (
    !name ||
    !email ||
    !message ||
    name.length > LIMITS.name ||
    email.length > LIMITS.email ||
    message.length > LIMITS.message ||
    message.length < 12 ||
    !EMAIL_RE.test(email)
  ) {
    return json(400, { error: 'invalid_fields' });
  }

  if (looksLikeSpam(message)) return json(200, { ok: true }); // silent drop

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('contact: RESEND_API_KEY not set - simulating success (D017)');
    return json(200, { ok: true, simulated: true });
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: email,
        subject: `Portfolio contact: ${name}`,
        text: `From: ${name} <${email}>\n\n${message}`,
        html: `
          <div style="font-family:ui-sans-serif,system-ui,sans-serif;color:#201e1b;background:#f7f5f1;padding:32px">
            <p style="margin:0 0 4px;font-size:13px;color:#6d6961">New message via the portfolio contact form</p>
            <p style="margin:0 0 24px;font-size:16px"><strong>${escapeHtml(name)}</strong> &lt;${escapeHtml(email)}&gt;</p>
            <div style="border-top:1px solid #dad5cc;padding-top:24px;font-size:15px;line-height:1.6;white-space:pre-wrap">${escapeHtml(message)}</div>
          </div>`,
      }),
    });
    if (!res.ok) {
      console.error('contact: resend failed', res.status, await res.text());
      return json(502, { error: 'send_failed' });
    }
    return json(200, { ok: true });
  } catch (error) {
    console.error('contact: resend error', (error as Error).message);
    return json(502, { error: 'send_failed' });
  }
};
