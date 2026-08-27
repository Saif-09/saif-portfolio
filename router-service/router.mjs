/**
 * Thin front door for the local llama.cpp server.
 *
 * Two reasons this exists rather than exposing llama.cpp directly:
 *
 * 1. Auth. llama.cpp's --api-key expects `Authorization: Bearer <key>`, and
 *    Cloud Run intercepts that header to validate it as a Google IAM token,
 *    so the request is rejected at the edge before the container sees it.
 *    A different header name is the whole fix.
 * 2. Contract. The site wants one label, not a chat completion, and the label
 *    has to be one of a known set. Deciding that here means a 0.5B model
 *    producing something unexpected degrades to "unknown" instead of leaking
 *    improvised text into the site's UI.
 */
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 8080);
const UPSTREAM = `http://127.0.0.1:${process.env.LLAMA_PORT ?? 8081}`;
const SECRET = process.env.ROUTER_SECRET ?? '';
const MODEL_NAME = process.env.ROUTER_MODEL_NAME ?? "qwen2.5-1.5b-instruct";

const DEFAULT_LABELS = ['project', 'decision', 'profile', 'contact', 'off-topic'];

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function authorized(req) {
  if (!SECRET) return false;
  const given = req.headers['x-router-secret'];
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(SECRET);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

async function upstreamReady() {
  try {
    const res = await fetch(`${UPSTREAM}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    return json(res, 200, { ok: true, model: MODEL_NAME, ready: await upstreamReady() });
  }

  if (req.method !== 'POST' || !req.url?.startsWith('/route')) {
    return json(res, 404, { error: 'Not found.' });
  }
  if (!authorized(req)) {
    return json(res, 401, { error: 'Bad or missing router secret.' });
  }

  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 8000) return json(res, 413, { error: 'Too large.' });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(res, 400, { error: 'Send JSON.' });
  }

  const question = typeof body.question === 'string' ? body.question.slice(0, 500).trim() : '';
  if (!question) return json(res, 400, { error: 'No question.' });

  const labels = (Array.isArray(body.labels) ? body.labels : DEFAULT_LABELS)
    .filter((l) => typeof l === 'string' && /^[a-z-]{2,20}$/.test(l))
    .slice(0, 10);
  const allowed = labels.length > 0 ? labels : DEFAULT_LABELS;

  const started = Date.now();
  try {
    const upstream = await fetch(`${UPSTREAM}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      /* The caller has already given up by ~1.5s, so there is no point holding
         a request open longer than that. */
      signal: AbortSignal.timeout(Number(process.env.ROUTER_TIMEOUT_MS ?? 4000)),
      body: JSON.stringify({
        /* Definitions AND worked examples. A bare "classify into these labels"
           instruction is enough for a large model and not remotely enough for
           a 0.5B one: without these it answered "contact" to both "tell me
           about Ueue" and "what is the capital of France". Few-shot turns are
           what make a model this size usable for the job. */
        messages: [
          {
            role: 'system',
            content: [
              `You label questions asked on a software engineer's portfolio site.`,
              `Reply with exactly one word from this list and nothing else: ${allowed.join(', ')}.`,
              '',
              'project = about a specific product, app or piece of work he built',
              'decision = why something was chosen, a trade-off, or how something was built',
              'profile = his skills, stack, experience, background or employers',
              'contact = hiring, availability, resume, or how to reach him',
              'off-topic = anything not about this engineer or his work',
            ].join('\n'),
          },
          { role: 'user', content: 'What is Ueue?' },
          { role: 'assistant', content: 'project' },
          { role: 'user', content: 'Why did he pick Astro over Next.js?' },
          { role: 'assistant', content: 'decision' },
          { role: 'user', content: 'Which languages does he know?' },
          { role: 'assistant', content: 'profile' },
          { role: 'user', content: 'Is he available for freelance work?' },
          { role: 'assistant', content: 'contact' },
          { role: 'user', content: 'What is the capital of France?' },
          { role: 'assistant', content: 'off-topic' },
          { role: 'user', content: question },
        ],
        max_tokens: 8,
        temperature: 0,
        /* Constrained decoding: the model is not free to emit anything but a
           label. Removes the "unknown" outcomes entirely, and stops a small
           model wandering into a sentence. */
        grammar: `root ::= ${allowed.map((l) => JSON.stringify(l)).join(' | ')}`,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return json(res, 503, {
        error: 'Model unavailable.',
        detail: detail.slice(0, 200),
        ms: Date.now() - started,
      });
    }

    const data = await upstream.json();
    const text = String(data?.choices?.[0]?.message?.content ?? '')
      .toLowerCase()
      .trim();

    /* Match rather than trust: a small model will occasionally answer with a
       sentence, and the site should show "unknown" before it shows that. */
    const label = allowed.find((l) => text === l) ?? allowed.find((l) => text.includes(l));

    return json(res, 200, {
      label: label ?? 'unknown',
      model: MODEL_NAME,
      ms: Date.now() - started,
      ...(label ? {} : { raw: text.slice(0, 60) }),
    });
  } catch (err) {
    return json(res, 503, {
      error: err?.name === 'TimeoutError' ? 'Model timed out.' : 'Model unreachable.',
      ms: Date.now() - started,
    });
  }
});

server.listen(PORT, () => {
  console.log(`router front door on ${PORT}, upstream ${UPSTREAM}`);
  if (!SECRET) console.warn('ROUTER_SECRET is unset: every request will be rejected.');
});
