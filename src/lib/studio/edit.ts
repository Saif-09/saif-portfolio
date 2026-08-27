/**
 * Plain-English resume edits.
 *
 * The model never rewrites the whole file. It returns a list of find/replace
 * pairs, each of which must match exactly once, and anything that does not
 * match is reported rather than guessed at. That matters here: this file is a
 * LaTeX document whose structure (the variant macros) is the whole point, and a
 * model handed 17KB to "return modified" will quietly drop a macro or a bullet.
 * Small, verifiable edits fail loudly instead.
 *
 * Two things keep that strictness from becoming useless in practice, because
 * models do paraphrase what they claim to be quoting:
 *   1. a whitespace-tolerant second pass, which still demands a unique match;
 *   2. one automatic retry that shows the model exactly which of its `find`
 *      strings missed, and asks it to re-copy them.
 */
import Anthropic from '@anthropic-ai/sdk';
import { generateObject, jsonSchema } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { VARIANTS, type VariantId } from './variants';
import { env } from './env';

export const MAX_INSTRUCTION_CHARS = 2000;
export const MAX_TEX_CHARS = 120_000;

/** Below this length a whitespace-tolerant match is too likely to be an accident. */
const MIN_FUZZY_LENGTH = 12;

export interface ProposedEdit {
  find: string;
  replace: string;
  why?: string;
}

export interface RejectedEdit {
  find: string;
  reason: string;
}

export interface EditOutcome {
  tex: string;
  changed: boolean;
  note: string;
  applied: ProposedEdit[];
  rejected: RejectedEdit[];
  problems: string[];
  provider: string;
  retried: boolean;
}

const SYSTEM = `You edit a LaTeX resume for Mohd Saif. It is one file that builds FOUR variants of the same resume, and it must stay compiling and stay one page per variant.

HOW THE FILE WORKS
- A preamble block defines five macros with the fullstack defaults, then one \\ifdefstring{\\variant}{...} block per variant (mobile, ai, product) overrides only what differs.
- The five swappable macros: \\summaryBody (opening paragraph), \\roleTitle (the job title shown for Zenzop and Infinite Locus), \\skillsOrder (which skill line comes first), \\shoppinOrder (order of the four Shoppin' bullet groups), \\shoppinIntro (Shoppin's first bullet).
- Shoppin' bullets live in groups: \\shoppinAI, \\shoppinBackend, \\shoppinOps, \\shoppinApp. A new Shoppin' bullet goes inside the group it belongs to, never inline in the body.
- Every other employer's bullets are written once in the body and are shared by all four variants.

WHERE TO PUT AN EDIT
- Change applies to every variant (new job, reworded bullet, new skill, fixed typo): edit the body, or the default macro definition.
- Change applies to one role only: edit inside that variant's \\ifdefstring block. If the macro is not yet overridden there, add a \\renewcommand for it inside that block.

RULES
- Escape LaTeX specials in prose: \\% \\& \\_ \\# \\$. Write --- never an em dash character, and -- for a date range.
- Never invent employment, dates, titles, metrics or numbers. If the instruction needs a fact you were not given, say so in the note and make no edit for it.
- Resumes are one page. If you add substantial text, say in the note what could be cut.
- A macro used mid-sentence needs empty braces (\\summaryBody{}) or TeX eats the following space.

OUTPUT
Reply with JSON only, no prose outside it, no markdown fences:
{"edits":[{"find":"<exact text from the file>","replace":"<replacement>","why":"<short reason>"}],"note":"<what you changed, what you did not, and anything the user should check>"}

Each "find" MUST be copied byte for byte from the file and MUST appear EXACTLY ONCE in it. Do not retype it from memory and do not tidy its whitespace: copy the characters. Keep each "find" as short as it can be while still being unique, and prefer several small edits over one large one. To delete, use an empty "replace". If you cannot do the request safely, return {"edits":[],"note":"<why>"}.`;

function buildPrompt(
  tex: string,
  instruction: string,
  variant?: VariantId,
  retry?: { rejected: RejectedEdit[] },
): string {
  const scope = variant
    ? `The user is currently looking at the "${variant}" variant (${
        VARIANTS.find((v) => v.id === variant)?.leads ?? ''
      }). If the request sounds role-specific, apply it to that variant only. If it sounds general, apply it everywhere.`
    : 'Decide from the request whether it is general or role-specific.';

  const correction = retry
    ? `
YOUR PREVIOUS ATTEMPT PARTLY FAILED. These "find" strings were rejected, so those edits did not happen:
${retry.rejected
  .map((r, i) => `${i + 1}. rejected because ${r.reason}\n   you sent: ${JSON.stringify(r.find)}`)
  .join('\n')}

Locate the real text in the file below and copy it character for character this time, including its exact indentation, line breaks and trailing characters. Return ONLY the edits that still need to be made.
`
    : '';

  return `${scope}

REQUEST FROM THE USER:
${instruction}
${correction}
THE COMPLETE CURRENT FILE (resume/resume.tex):
<file>
${tex}
</file>`;
}

/** The shape both providers must end up producing. */
const PROPOSAL_SCHEMA = jsonSchema<{
  edits: { find: string; replace: string; why?: string }[];
  note: string;
}>({
  type: 'object',
  properties: {
    edits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          find: { type: 'string', description: 'Text copied byte for byte from the file' },
          replace: { type: 'string', description: 'What to put in its place; empty to delete' },
          why: { type: 'string', description: 'Short reason for this edit' },
        },
        required: ['find', 'replace', 'why'],
        additionalProperties: false,
      },
    },
    note: { type: 'string' },
  },
  required: ['edits', 'note'],
  additionalProperties: false,
});

/** Drop anything malformed rather than trusting the model's own shape. */
function normalizeProposal(value: unknown): { edits: ProposedEdit[]; note: string } {
  const obj = (value ?? {}) as { edits?: unknown; note?: unknown };
  const rawEdits = Array.isArray(obj.edits) ? obj.edits : [];
  const edits: ProposedEdit[] = [];

  for (const e of rawEdits) {
    const edit = (e ?? {}) as Record<string, unknown>;
    if (typeof edit.find !== 'string' || typeof edit.replace !== 'string') continue;
    if (edit.find.length === 0) continue;
    edits.push({
      find: edit.find,
      replace: edit.replace,
      why: typeof edit.why === 'string' && edit.why ? edit.why : undefined,
    });
  }

  return { edits, note: typeof obj.note === 'string' ? obj.note : '' };
}

/** Models wrap JSON in fences or prose no matter how firmly you ask them not to. */
function parseProposal(raw: string): { edits: ProposedEdit[]; note: string } {
  let text = raw.trim();

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('The model did not return JSON.');
  }

  try {
    return normalizeProposal(JSON.parse(text.slice(start, end + 1)));
  } catch {
    /* Quote the tail: a truncated reply and a chatty one look identical
       otherwise, and this is a private tool where that detail is worth having. */
    throw new Error(
      `The model returned malformed JSON. It ended with: ${JSON.stringify(text.slice(-160))}`,
    );
  }
}

/**
 * Locate `find` in `text`, tolerating whitespace differences but still
 * insisting on exactly one match. Returns null when absent or ambiguous.
 */
function locate(text: string, find: string): { start: number; end: number } | null {
  const exact = text.indexOf(find);
  if (exact !== -1) {
    return text.indexOf(find, exact + 1) === -1
      ? { start: exact, end: exact + find.length }
      : null; /* ambiguous: bail rather than pick one */
  }

  if (find.trim().length < MIN_FUZZY_LENGTH) return null;

  /* Same characters, any run of whitespace standing in for any other. This is
     the failure that actually happens: the model re-indents what it quotes. */
  const pattern = find
    .trim()
    .split(/\s+/)
    .map((chunk) => chunk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');

  let match: RegExpExecArray | null;
  let found: { start: number; end: number } | null = null;
  const re = new RegExp(pattern, 'g');
  while ((match = re.exec(text)) !== null) {
    if (found) return null; /* more than one: ambiguous */
    found = { start: match.index, end: match.index + match[0].length };
  }
  return found;
}

/**
 * Apply edits in order, re-checking uniqueness against the text as it stands.
 * An edit that no longer matches uniquely is rejected, not forced.
 */
export function applyEdits(
  tex: string,
  edits: ProposedEdit[],
): { tex: string; applied: ProposedEdit[]; rejected: RejectedEdit[] } {
  let out = tex;
  const applied: ProposedEdit[] = [];
  const rejected: RejectedEdit[] = [];

  for (const edit of edits) {
    const at = locate(out, edit.find);
    if (!at) {
      rejected.push({
        find: edit.find,
        reason: out.includes(edit.find)
          ? 'that text appears more than once, so the target is ambiguous'
          : 'that text is not in the file (the model paraphrased instead of copying)',
      });
      continue;
    }
    out = out.slice(0, at.start) + edit.replace + out.slice(at.end);
    applied.push(edit);
  }

  return { tex: out, applied, rejected };
}

/** Cheap structural check so an obviously broken file never reaches a commit. */
export function sanityCheck(tex: string): string[] {
  const problems: string[] = [];

  if (!tex.includes('\\begin{document}') || !tex.includes('\\end{document}')) {
    problems.push('the document begin/end pair is missing');
  }
  for (const macro of [
    '\\summaryBody',
    '\\roleTitle',
    '\\skillsOrder',
    '\\shoppinOrder',
    '\\shoppinIntro',
  ]) {
    if (!tex.includes(macro)) problems.push(`${macro} is gone`);
  }
  for (const v of ['mobile', 'ai', 'product']) {
    if (!tex.includes(`\\ifdefstring{\\variant}{${v}}`)) {
      problems.push(`the ${v} variant block is gone`);
    }
  }
  if (tex.includes('—')) {
    problems.push('an em dash character crept in (use --- or -- instead)');
  }

  const braces = (tex.match(/(?<!\\)\{/g) ?? []).length - (tex.match(/(?<!\\)\}/g) ?? []).length;
  if (braces !== 0) {
    problems.push(`braces are unbalanced by ${braces} (this will not compile)`);
  }

  return problems;
}

/* ---------------------------------------------------------------- providers */

type Proposal = { edits: ProposedEdit[]; note: string };

async function viaAnthropic(prompt: string, key: string): Promise<Proposal> {
  const client = new Anthropic({ apiKey: key });
  const response = await client.messages.create({
    model: env('STUDIO_ANTHROPIC_MODEL') || 'claude-opus-5',
    max_tokens: 16000,
    /* Effort medium: these are small, well-specified surgical edits and the
       studio is interactive, so latency is part of the product. */
    output_config: { effort: 'medium' },
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined this request.');
  }

  return parseProposal(
    response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim(),
  );
}

async function viaGemini(prompt: string, key: string): Promise<Proposal> {
  const model = createGoogleGenerativeAI({ apiKey: key })(
    /* Not GEMINI_MODEL: that is set to a small chat model for the site's Ask
       widget, which is not good enough at LaTeX surgery. */
    env('STUDIO_GEMINI_MODEL') || 'gemini-2.5-flash',
  );

  /* Schema-constrained, not "please reply with JSON". Gemini 2.5 is a thinking
     model, so free-text JSON gets truncated or prefaced often enough to matter:
     asking for JSON in the prompt produced a malformed reply in production
     while the same call worked locally. generateObject removes that class. */
  const r = await generateObject({
    model,
    schema: PROPOSAL_SCHEMA,
    system: SYSTEM,
    prompt,
    maxOutputTokens: 16000,
    temperature: 0.2,
  });
  return normalizeProposal(r.object);
}

/**
 * Anthropic when a key is present (materially better at editing LaTeX without
 * collateral damage), Gemini otherwise so the studio works with the free key
 * this project already has.
 */
function providerChain(): { name: string; run: (prompt: string) => Promise<Proposal> }[] {
  const chain: { name: string; run: (prompt: string) => Promise<Proposal> }[] = [];

  const anthropicKey = env('ANTHROPIC_API_KEY');
  if (anthropicKey) {
    chain.push({ name: 'claude', run: (p) => viaAnthropic(p, anthropicKey) });
  }

  const geminiKey = env('GEMINI_API_KEY') || env('GOOGLE_GENERATIVE_AI_API_KEY');
  if (geminiKey) {
    chain.push({ name: 'gemini', run: (p) => viaGemini(p, geminiKey) });
  }

  return chain;
}

async function ask(prompt: string): Promise<{ proposal: Proposal; provider: string }> {
  const chain = providerChain();
  if (chain.length === 0) {
    throw new Error(
      'No AI key configured. Set ANTHROPIC_API_KEY (preferred) or GEMINI_API_KEY in the Vercel project env.',
    );
  }

  let lastError = '';
  for (const provider of chain) {
    try {
      return { proposal: await provider.run(prompt), provider: provider.name };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(lastError || 'Every AI provider failed.');
}

export function hasAiProvider(): boolean {
  return providerChain().length > 0;
}

/* ------------------------------------------------------------------ the job */

/**
 * One instruction in, one reviewable new resume.tex out. Nothing is committed
 * here; the caller decides whether to save, so every edit is reviewable.
 */
export async function editResume(
  tex: string,
  instruction: string,
  variant?: VariantId,
): Promise<EditOutcome> {
  const first = await ask(buildPrompt(tex, instruction, variant));
  const proposal = first.proposal;

  const base = {
    provider: first.provider,
    applied: [] as ProposedEdit[],
    rejected: [] as RejectedEdit[],
    problems: [] as string[],
    retried: false,
  };

  if (proposal.edits.length === 0) {
    return {
      ...base,
      tex,
      changed: false,
      note: proposal.note || 'The model proposed no changes.',
    };
  }

  let run = applyEdits(tex, proposal.edits);
  let note = proposal.note;
  let retried = false;

  /* One correction round. A rejected edit means the model quoted the file
     wrongly, which it can usually fix when shown its own miss. */
  if (run.rejected.length > 0) {
    retried = true;
    try {
      const second = await ask(
        buildPrompt(run.tex, instruction, variant, { rejected: run.rejected }),
      );
      const retryProposal = second.proposal;
      if (retryProposal.edits.length > 0) {
        const again = applyEdits(run.tex, retryProposal.edits);
        run = {
          tex: again.tex,
          applied: [...run.applied, ...again.applied],
          rejected: again.rejected,
        };
        if (retryProposal.note) note = note ? `${note} ${retryProposal.note}` : retryProposal.note;
      }
    } catch {
      /* The retry is a bonus. Keep whatever the first pass achieved. */
    }
  }

  const problems = run.applied.length > 0 ? sanityCheck(run.tex) : [];

  return {
    provider: first.provider,
    retried,
    applied: run.applied,
    rejected: run.rejected,
    problems,
    /* A file that will not compile must never become the editor's contents. */
    tex: problems.length > 0 ? tex : run.tex,
    changed: problems.length === 0 && run.applied.length > 0,
    note,
  };
}
