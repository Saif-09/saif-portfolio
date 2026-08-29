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
import { skills, employers } from '../../data/profile';
/* The resume itself, inlined at build time. It is the authority on what he can
   claim, and without it the check called CI/CD a fabrication when it is printed
   on his resume. */
import resumeTex from '/resume/resume.tex?raw';

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
  /** Requirements the draft claims that his own material never mentions. */
  suspect: string[];
}

/**
 * Who to greet, decided in code.
 *
 * Told to "greet without a name", a model handed a contact address will still
 * write "Hi arun@scalingtheory.com,". Names are not a judgement call, so this
 * does not ask.
 */
export function greeting(extraction: Extraction): string {
  const posted = (extraction.postedBy ?? '').trim();
  const looksLikeName = /^[A-Za-z][A-Za-z.'-]+(\s+[A-Za-z][A-Za-z.'-]+)*$/.test(posted);
  if (posted && looksLikeName && !posted.includes('@')) {
    return `Hi ${posted.split(/\s+/)[0]},`;
  }
  /* An address like arun@ usually is the person's name, and using it is what a
     human would do. Only when it reads like one, never the whole address. */
  const local = (extraction.contactEmail ?? '').split('@')[0] ?? '';
  if (/^[a-z]{3,14}$/i.test(local) && !/^(jobs|careers|hiring|hr|info|hello|apply|talent|recruit|team|contact|admin|no-?reply)$/i.test(local)) {
    return `Hi ${local[0].toUpperCase()}${local.slice(1).toLowerCase()},`;
  }
  return 'Hello,';
}

/**
 * Requirements from the post that the draft claims but his material never
 * mentions.
 *
 * This is the failure mode that matters: told to use the employer's
 * vocabulary, a model turns their requirement list into his experience. It
 * wrote "I use Expo and EAS for CI/CD" when his material says Expo and has
 * never said EAS. Caught here and shown, rather than sent.
 */
export function suspectClaims(body: string, extraction: Extraction, corpus: string): string[] {
  const haystack = corpus.toLowerCase();
  const draft = body.toLowerCase();
  const suspects = new Set<string>();

  const terms = extraction.mustHaves
    .join(' ')
    .split(/[^A-Za-z0-9+#./-]+/)
    .filter((term) => term.length >= 3 && !/^\d+$/.test(term));

  for (const term of terms) {
    const lower = term.toLowerCase();
    if (COMMON.has(lower)) continue;
    if (draft.includes(lower) && !haystack.includes(lower)) suspects.add(term);
  }
  return [...suspects];
}

/* Ordinary English that happens to appear in requirement lists. Flagging these
   would bury the real ones. */
const COMMON = new Set([
  'and', 'the', 'for', 'with', 'you', 'your', 'our', 'are', 'not', 'has', 'have', 'will',
  'years', 'year', 'experience', 'strong', 'deep', 'good', 'great', 'work', 'working',
  'build', 'building', 'built', 'ship', 'shipping', 'shipped', 'own', 'owning', 'end',
  'production', 'apps', 'app', 'mobile', 'engineering', 'engineer', 'understanding',
  'fundamentals', 'skills', 'mindset', 'about', 'across', 'from', 'into', 'that', 'this',
  'complete', 'complex', 'high', 'real', 'time', 'data', 'code', 'test', 'testing',
  'reliability', 'performance', 'optimisation', 'optimization', 'debugging', 'scale',
  'expertise', 'pipelines', 'pipeline', 'lifecycle', 'release', 'releases', 'monitoring',
  'interfaces', 'animations', 'workflows', 'systems', 'polished', 'heavy', 'flows',
  'offline', 'first', 'native', 'serious', 'expert', 'ability', 'mindset', 'around',
  'design', 'designing', 'take', 'takes', 'using', 'use', 'uses', 'strong', 'solid',
]);

export async function draftEmail(
  extraction: Extraction,
  answers: Record<string, any> | null,
): Promise<Draft> {
  const key = apiKey();
  if (!key) throw new Error('No model key is configured on the server.');

  const { variant, why } = pickVariant(extraction);
  const resumeUrl = VARIANT_URL[variant];
  const greet = greeting(extraction);

  const paragraphs = (answers?.paragraphs ?? {}) as Record<string, string>;
  const identity = (answers?.identity ?? {}) as Record<string, string>;

  const system = `You draft short cold application emails for Mohd Saif, a product engineer in Delhi. Everything factual must come from the material below. Never invent an employer, a metric, a date or a technology he has not used.

SHAPE
Three short paragraphs, five to seven sentences total.
1. The single most relevant thing he has built, stated as a fact, with a specific in it. No greeting beyond "Hi <name>," and no throat-clearing.
2. One or two sentences of evidence against what they actually asked for, in their words.
3. The links, then stop.

WRITE LIKE A PERSON, NOT LIKE A MODEL
These are the tells that make an email read as generated. Avoid every one:
- Never an em dash. Use a comma, a colon or a full stop.
- Never open with "I am writing to", "I would like to express my interest", "I hope this email finds you well", or the job title read back formally.
- Banned words: passionate, excited, thrilled, delighted, eager, leverage, utilise, spearhead, orchestrate, delve, robust, seamless, seamlessly, cutting-edge, fast-paced, dynamic, synergy, holistic.
- Banned phrases: "great fit", "perfect fit", "strong fit", "resonated with me", "aligns with", "proven track record", "wealth of experience", "hit the ground running", "in today's".
- No "Furthermore", "Moreover", "Additionally", "In conclusion".
- No closing summary sentence. Do not end with "With my background in X and my passion for Y, I am confident...". End on the links or a short plain line.
- No rule-of-three lists in prose ("scoping, building and measuring"). Two things, or four, or one.
- No "not just X, but Y".
- Do not stack adverbs. One "efficiently" is one too many.

- Vary sentence length, and this is not optional: at least ONE sentence must be under ten words. Three thirty-word sentences in a row is the single clearest sign a machine wrote it. A short line like "I ship, then I measure." or "That one took four months." earns its place.
- Do not write "I bring", "I offer", "I would bring". Say what he did, in the past tense.
- Where he falls short of a requirement, state it flat and move on. Do not pivot off it with "While you asked for X, I...". That construction is a tell and it draws attention to the gap.
- Contractions are good: I've, I'm, it's, doesn't.
- Include at least two checkable specifics: a product name, a real number from the material, a named technology he actually used. Vague competence is what a model writes; a specific is what a person writes.
- Do not open the same way every time. If the post gives you something concrete to react to, react to it.

MATCHING THE POST
- Use their vocabulary ONLY for things he has actually done. Rewording his real work in their words is the job. Claiming their requirement because they listed it is not.
- If they name a tool that does not appear in the material above, do not mention that tool at all. Not to claim it, not to dodge it. It simply does not appear. Listing "Expo and EAS" when the material says only Expo is the exact error to avoid.
- Never write "at scale", "in production at scale" or similar unless those words are in the material.
- Answer their listed requirements in roughly their order of emphasis.
- If they ask for something he does not have, either leave it alone or name it once, plainly, in half a sentence. Never apologise for it, never pad around it, never explain it away.

RULES
- At most one proof link besides the resume, on its own line, and only if it fits the role. A live product beats a repo.
- Never overstate: 3.5+ years, never more.
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

Do NOT write a greeting line. Start at the first sentence: the greeting is added afterwards.`;

  const google = createGoogleGenerativeAI({ apiKey: key });
  let lastError = '';
  for (const model of MODELS) {
    const started = Date.now();
    try {
      const result = await generateText({ model: google(model), system, prompt });
      /* The model was handed the exact greeting and still rewrote it, lowercasing
         the name. So it is stripped and prepended instead of asked for. */
      let body = result.text.trim().replace(/—/g, ',');
      body = body.replace(/^\s*(hi|hello|hey|dear)\b[^\n]*\n+/i, '');
      body = `${greet}\n\n${body}`;
      /* Everything he can legitimately claim, in one blob to check against. */
      const corpus = [
        resumeTex,
        JSON.stringify(answers ?? {}),
        Object.values(skills).flat().join(' '),
        employers.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return {
        suspect: suspectClaims(body, extraction, corpus),
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
