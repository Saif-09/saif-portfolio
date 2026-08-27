/**
 * RAG-lite corpus for /api/ask.
 *
 * All content is inlined into the function bundle AT BUILD TIME via
 * import.meta.glob(..., '?raw') - the serverless function never touches the
 * filesystem. Documents are cut into sections by chunk.mjs, the same function
 * scripts/embed-corpus.mjs uses, so chunk ids line up with the vector index.
 *
 * Keyword scoring lives on below as the fallback for when no embedding key is
 * configured; retrieve.ts prefers the vectors.
 */
import { profile, skills, employers } from '../../data/profile';
import { projects } from '../../data/projects';
import { buildDocChunks, stripMarkdown } from './chunk.mjs';

export interface Chunk {
  id: string;
  title: string;
  /** Site path the model can cite, e.g. /work/ueue or /brain/d002-tech-stack */
  url: string;
  text: string;
}

const brainRaw = import.meta.glob('/brain/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const workRaw = import.meta.glob('/src/content/work/en/*.mdx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

import llmsTxt from '/public/llms.txt?raw';

function buildChunks(): Chunk[] {
  const chunks: Chunk[] = [];

  /* Identity only, and deliberately small.
     This block is prepended to every request, so anything in it is context the
     visitor pays for on every question. It used to carry the full project list
     and every skill category (6.5k characters), which had two costs: ~1600
     wasted tokens per turn, and an agent that never called a tool because the
     answer was always already in front of it. Details now live behind
     list_projects and get_profile, which is what tools are for. */
  chunks.push({
    id: 'facts',
    title: 'Core facts about Mohd Saif',
    url: '/',
    text: [
      `Mohd Saif is a Product Engineer with ${profile.yearsExperience} years of experience. Positioning: "${profile.positioning}"`,
      `He has built and shipped products at: ${employers.join(', ')}.`,
      `Contact: email ${profile.email}, GitHub ${profile.github}, LinkedIn ${profile.linkedin}, résumé ${profile.resumeUrl}. There is also a contact form on the homepage (#contact).`,
      `The full decision log is at /brain and the case studies at /work. For the project list use the list_projects tool; for skills, employers or experience use get_profile; for anything about how something was built or why, use search_corpus.`,
    ].join('\n\n'),
  });

  chunks.push({
    id: 'llms',
    title: 'Site overview (llms.txt)',
    url: '/llms.txt',
    text: stripMarkdown(llmsTxt),
  });

  /* Section-level chunks, from the same function scripts/embed-corpus.mjs uses,
     so every id here has a vector there. Sorted to match the script's ordering. */
  const sources = [
    ...Object.entries(brainRaw).map(([path, raw]) => ({ kind: 'brain' as const, path, raw })),
    ...Object.entries(workRaw).map(([path, raw]) => ({ kind: 'work' as const, path, raw })),
  ].sort((a, b) => a.path.localeCompare(b.path));

  chunks.push(...buildDocChunks(sources));

  return chunks;
}

export const CHUNKS: Chunk[] = buildChunks();

/* --- retrieval --- */

const STOPWORDS = new Set(
  'a an and are as at be but by can did do does for from had has have he her him his how i if in is it its me my of on or s so t that the their them they this to was we what when where which who why will with you your'.split(
    ' ',
  ),
);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => !STOPWORDS.has(t) && t.length > 1,
  );
}

/** Top chunks for a question. Always includes the core-facts chunk. */
export function retrieve(question: string, maxChunks = 6, maxChars = 7000): Chunk[] {
  const terms = new Set(tokenize(question));
  const scored = CHUNKS.filter((c) => c.id !== 'facts')
    .map((chunk) => {
      const titleTokens = new Set(tokenize(chunk.title));
      const bodyTokens = tokenize(chunk.text);
      const counts = new Map<string, number>();
      for (const token of bodyTokens) counts.set(token, (counts.get(token) ?? 0) + 1);
      let score = 0;
      for (const term of terms) {
        score += Math.min(counts.get(term) ?? 0, 5);
        if (titleTokens.has(term)) score += 4;
      }
      return { chunk, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const picked: Chunk[] = [CHUNKS.find((c) => c.id === 'facts')!];
  /* Budget the retrieved chunks only; facts is mandatory and larger than any
     sensible allowance, so charging it here would starve the results. */
  let total = 0;
  for (const { chunk } of scored) {
    if (picked.length >= maxChunks) break;
    if (total + chunk.text.length > maxChars) continue;
    picked.push(chunk);
    total += chunk.text.length;
  }
  return picked;
}
