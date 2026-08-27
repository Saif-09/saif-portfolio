/**
 * The routing step: what kind of question is this?
 *
 * When ROUTER_URL is set this runs on a Qwen2.5-0.5B I host myself on Cloud Run
 * (see router-service/). Classification is exactly the job a tiny model is
 * genuinely good at, and it makes one line of the trace honestly read "a model
 * I host did this" without letting a 0.5B model near any factual claim about
 * Saif, which it would get wrong.
 *
 * It is strictly best-effort. It is time-boxed, and every failure path falls
 * through to a keyword heuristic, because a classification label is a nice
 * thing to show and never worth making someone wait for.
 */
import { env } from '../env';

export type RouteLabel =
  | 'project'
  | 'decision'
  | 'profile'
  | 'contact'
  | 'off-topic'
  | 'unknown';

export interface Route {
  label: RouteLabel;
  /** Which mechanism produced the label, so the trace can say so. */
  by: 'own-model' | 'heuristic' | 'unavailable';
  model?: string;
  note?: string;
}

const LABELS: RouteLabel[] = ['project', 'decision', 'profile', 'contact', 'off-topic'];

/* Short enough that the answer never waits on it. The router runs on a
   scale-to-zero service, so a cold start would otherwise cost seconds. */
const TIMEOUT_MS = 1500;

const PATTERNS: [RouteLabel, RegExp][] = [
  ['contact', /\b(hire|hiring|contact|email|reach|available|freelance|resume|cv)\b/i],
  ['decision', /\b(why|decide|decision|instead of|trade[- ]?off|choose|chose|approach|architecture)\b/i],
  ['project', /\b(project|built|build|app|ueue|slate|codevouch|shoppin|zenzop|gurucool|wellbeing|prism|work)\b/i],
  ['profile', /\b(skill|stack|experience|years|who is|about|background|employer|worked)\b/i],
];

function heuristic(question: string): RouteLabel {
  for (const [label, pattern] of PATTERNS) {
    if (pattern.test(question)) return label;
  }
  return 'unknown';
}

export function routerConfigured(): boolean {
  return Boolean(env('ROUTER_URL'));
}

export async function classify(question: string, signal?: AbortSignal): Promise<Route> {
  const url = env('ROUTER_URL').replace(/\/$/, '');

  if (url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    /* Give up on the router if the whole request is cancelled too. */
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const res = await fetch(`${url}/route`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          ...(env('ROUTER_SECRET') ? { 'x-router-secret': env('ROUTER_SECRET') } : {}),
        },
        body: JSON.stringify({ question, labels: LABELS }),
      });
      if (res.ok) {
        const data = (await res.json()) as { label?: string; model?: string; ms?: number };
        const label = LABELS.includes(data.label as RouteLabel)
          ? (data.label as RouteLabel)
          : 'unknown';
        return { label, by: 'own-model', model: data.model ?? 'qwen2.5-0.5b-instruct' };
      }
      return {
        label: heuristic(question),
        by: 'heuristic',
        note: `router returned ${res.status}`,
      };
    } catch (err) {
      return {
        label: heuristic(question),
        by: 'heuristic',
        note:
          (err as Error)?.name === 'AbortError'
            ? `own model did not answer within ${TIMEOUT_MS}ms, probably cold`
            : 'own model unreachable',
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  return { label: heuristic(question), by: 'heuristic', note: 'no router configured' };
}
