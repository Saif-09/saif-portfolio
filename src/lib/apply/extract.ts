/**
 * Screenshot of a job post in, ready-to-send application out.
 *
 * Two steps on purpose. Reading the post is a perception job and belongs to a
 * vision model; deciding which resume to send is a rule, and rules do not
 * hallucinate. Keeping them apart means the variant choice is explainable and
 * identical every time, and the model is never asked to be sure about
 * something it cannot see.
 */
import { generateObject, generateText, jsonSchema } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { env } from '../env';

/* Lite first: extraction is reading, not reasoning, and it was as accurate as
   the larger model at half the latency on a real post. */
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];

export type ApplyRoute = 'email' | 'form' | 'dm' | 'unclear';
export type Variant = 'product' | 'mobile' | 'ai' | 'fullstack';

export interface Extraction {
  company: string;
  role: string;
  location: string;
  employmentType: string;
  yearsAsked: string;
  howToApply: ApplyRoute;
  contactEmail: string;
  formUrl: string;
  requiredSubject: string;
  mustHaves: string[];
  postedBy: string;
  deadline: string;
  salary: string;
  /** Field names the post genuinely does not show. Never filled with a guess. */
  notVisible: string[];
  /** Set when the post looks like a scam or a payment-up-front listing. */
  suspicious: boolean;
  suspiciousReason: string;
}

const EXTRACTION_SCHEMA = jsonSchema<Extraction>({
  type: 'object',
  properties: {
    company: { type: 'string' },
    role: { type: 'string' },
    location: { type: 'string' },
    employmentType: { type: 'string', description: 'full-time, contract, internship' },
    yearsAsked: { type: 'string', description: 'e.g. "4+" or "" if not stated' },
    howToApply: { type: 'string', enum: ['email', 'form', 'dm', 'unclear'] },
    contactEmail: { type: 'string' },
    formUrl: { type: 'string' },
    requiredSubject: {
      type: 'string',
      description: 'An exact subject line or reference code the post demands',
    },
    mustHaves: { type: 'array', items: { type: 'string' } },
    postedBy: { type: 'string' },
    deadline: { type: 'string' },
    salary: { type: 'string' },
    notVisible: { type: 'array', items: { type: 'string' } },
    suspicious: { type: 'boolean' },
    suspiciousReason: { type: 'string' },
  },
  required: [
    'company', 'role', 'location', 'employmentType', 'yearsAsked', 'howToApply',
    'contactEmail', 'formUrl', 'requiredSubject', 'mustHaves', 'postedBy',
    'deadline', 'salary', 'notVisible', 'suspicious', 'suspiciousReason',
  ],
  additionalProperties: false,
});

const EXTRACT_PROMPT = `Read this job post and pull out the facts.

Rules:
- Use an empty string for anything the post does not show, and put that field's name in notVisible. NEVER infer a company from a logo, a person's employer, or a domain in an email address. A wrong company name in a cold email cannot be taken back.
- requiredSubject is only for a subject line or reference code the post explicitly demands. Otherwise leave it empty.
- mustHaves: only requirements actually listed. Do not invent standard ones.
- suspicious: true if it asks for payment, for documents up front, promises daily earnings, or otherwise reads like a scam.`;

function apiKey(): string {
  return env('GEMINI_API_KEY') || env('GOOGLE_GENERATIVE_AI_API_KEY');
}

export function applyAvailable(): boolean {
  return Boolean(apiKey());
}

/** Strip a fetched page down to the text a job post actually consists of. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Fetch a job posting by URL.
 *
 * Plenty of boards will not serve this: LinkedIn, Indeed and Workday put job
 * pages behind a login or a bot check. That is not a bug to work around, it is
 * a fact to report, so the error says to screenshot it instead rather than
 * leaving someone staring at a spinner.
 */
export async function fetchPost(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('That does not look like a URL.');
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error('Only http and https links work here.');
  }

  let res: Response;
  try {
    res = await fetch(parsed.toString(), {
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
      headers: {
        /* Asking as a browser: many career pages serve an empty shell to
           anything that does not look like one. */
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en',
      },
    });
  } catch {
    throw new Error('That page did not respond. Screenshot it instead.');
  }

  if (!res.ok) {
    throw new Error(
      res.status === 403 || res.status === 401
        ? 'That site blocks reading the page directly, which LinkedIn and Workday both do. Screenshot it instead.'
        : `That page returned ${res.status}. Screenshot it instead.`,
    );
  }

  const text = htmlToText(await res.text());
  if (text.length < 200) {
    throw new Error(
      'That page came back nearly empty, usually because it renders with JavaScript or wants a login. Screenshot it instead.',
    );
  }
  return text.slice(0, 20_000);
}

/** Same extraction, from text rather than pixels. */
export async function extractText(
  text: string,
): Promise<{ extraction: Extraction; model: string; ms: number }> {
  const key = apiKey();
  if (!key) throw new Error('No model key is configured on the server.');
  const google = createGoogleGenerativeAI({ apiKey: key });

  let lastError = '';
  for (const model of MODELS) {
    const started = Date.now();
    try {
      const result = await generateObject({
        model: google(model),
        schema: EXTRACTION_SCHEMA,
        prompt: `${EXTRACT_PROMPT}\n\nTHE POST:\n\n${text}`,
      });
      return { extraction: result.object, model, ms: Date.now() - started };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(lastError || 'Could not read that post.');
}

export async function extractPost(
  image: Buffer,
  hint?: string,
): Promise<{ extraction: Extraction; model: string; ms: number }> {
  const key = apiKey();
  if (!key) throw new Error('No model key is configured on the server.');
  const google = createGoogleGenerativeAI({ apiKey: key });

  let lastError = '';
  for (const model of MODELS) {
    const started = Date.now();
    try {
      const result = await generateObject({
        model: google(model),
        schema: EXTRACTION_SCHEMA,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: hint ? `${EXTRACT_PROMPT}\n\nExtra context from me: ${hint}` : EXTRACT_PROMPT },
              { type: 'image', image: new Uint8Array(image) },
            ],
          },
        ],
      });
      return { extraction: result.object, model, ms: Date.now() - started };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(lastError || 'Could not read the screenshot.');
}

/* --------------------------------------------------------------- variant */

const RULES: { variant: Variant; pattern: RegExp }[] = [
  { variant: 'ai', pattern: /\b(llm|rag|genai|gen ai|machine learning|ml engineer|ai engineer|prompt|embedding|agent)\b/i },
  { variant: 'mobile', pattern: /\b(react native|ios|android|mobile|swift|kotlin|flutter|app store|play store)\b/i },
  { variant: 'product', pattern: /\b(product engineer|founding engineer|technical product|product manager|0 ?to ?1|zero to one)\b/i },
  { variant: 'fullstack', pattern: /\b(full ?stack|backend|node|next\.?js|api|platform engineer)\b/i },
];

export const VARIANT_URL: Record<Variant, string> = {
  product: 'https://saifsiddiqui.in/resume',
  mobile: 'https://saifsiddiqui.in/resume/mobile',
  ai: 'https://saifsiddiqui.in/resume/ai',
  fullstack: 'https://saifsiddiqui.in/resume/fullstack',
};

/**
 * Deterministic, and it explains itself. AI leans strongest because an AI role
 * that also says React Native still wants the AI resume; mobile beats generic
 * full stack for the same reason.
 */
export function pickVariant(extraction: Extraction): { variant: Variant; why: string } {
  const haystack = [extraction.role, extraction.mustHaves.join(' '), extraction.company].join(' ');

  for (const rule of RULES) {
    const hit = haystack.match(rule.pattern);
    if (hit) {
      return { variant: rule.variant, why: `the post says "${hit[0]}"` };
    }
  }
  return {
    variant: 'product',
    why: 'nothing in the post pointed anywhere specific, so this is the site default',
  };
}

/* ----------------------------------------------------------------- draft */

export interface Draft {
  subject: string;
  body: string;
  to: string;
  variant: Variant;
  variantWhy: string;
  model: string;
  ms: number;
}

export async function draftEmail(
  extraction: Extraction,
  answers: Record<string, any> | null,
): Promise<Draft> {
  const key = apiKey();
  if (!key) throw new Error('No model key is configured on the server.');

  const { variant, why } = pickVariant(extraction);
  const resumeUrl = VARIANT_URL[variant];

  const paragraphs = (answers?.paragraphs ?? {}) as Record<string, string>;
  const identity = (answers?.identity ?? {}) as Record<string, string>;

  const system = `You draft short cold application emails for Mohd Saif, a product engineer in Delhi. Everything factual must come from the material below. Never invent an employer, a metric, a date or a technology he has not used.

Rules:
- Five to eight sentences, broken into two or three short paragraphs. A wall of text does not get read, and a recruiter reads the first two sentences.
- Open with the specific thing he built that matches what they asked for. Never "I am writing to apply".
- Include exactly one proof link besides the resume when one genuinely fits the role, on its own line. A live product beats a repo. Skip it only if none fit.
- Reference something the post actually said. If the post is vague, write less rather than padding.
- Cut "passionate", "excited to", "great fit", "fast-paced". If a sentence could appear in anyone's email, delete it.
- Never use an em dash. Use a colon, a comma or a full stop.
- Do not overstate: 3.5+ years, never more. If they asked for more years, do not mention the gap and do not apologise.
- Plain text. No markdown. End with the signature exactly as given.
- Output the body only, with no subject line and no preamble.`;

  const prompt = `THE POST:
company: ${extraction.company || '(not visible)'}
role: ${extraction.role}
location: ${extraction.location}
they asked for: ${extraction.yearsAsked || 'unstated'} years
requirements they listed: ${extraction.mustHaves.join('; ') || '(none listed)'}
posted by: ${extraction.postedBy || '(unknown)'}

ABOUT MOHD SAIF:
${paragraphs.positioning ?? ''}

Relevant experience to draw on, pick only what fits:
- product angle: ${paragraphs.why_me_product ?? ''}
- mobile angle: ${paragraphs.why_me_mobile ?? ''}
- AI angle: ${paragraphs.why_me_ai ?? ''}
- biggest project: ${paragraphs.biggest_project ?? ''}
- side projects: ${paragraphs.side_projects ?? ''}

The resume link to include, exactly: ${resumeUrl}
Possible proof links: https://saifsiddiqui.in/work/ueue (solo product on both stores), https://saifsiddiqui.in/work/shoppin (AI shopping platform), https://www.npmjs.com/package/codevouch (CLI on npm)

Sign off with exactly:
${answers?.signature ?? `Mohd Saif\n${identity.phone ?? ''}\n${identity.portfolio ?? ''}`}

Greet ${extraction.postedBy ? `"${extraction.postedBy.split(' ')[0]}"` : 'without a name ("Hello,")'}.`;

  const google = createGoogleGenerativeAI({ apiKey: key });
  let lastError = '';
  for (const model of MODELS) {
    const started = Date.now();
    try {
      const result = await generateText({ model: google(model), system, prompt });
      const body = result.text.trim().replace(/—/g, ',');
      return {
        /* Their format wins when they specify one: a filter is probably
           looking for it. */
        subject: extraction.requiredSubject || `${extraction.role} : Mohd Saif`,
        body,
        to: extraction.contactEmail,
        variant,
        variantWhy: why,
        model,
        ms: Date.now() - started,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(lastError || 'Could not draft the email.');
}
