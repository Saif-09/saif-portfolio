/**
 * RAG-lite corpus for /api/ask.
 *
 * All content is inlined into the function bundle AT BUILD TIME via
 * import.meta.glob(..., '?raw') - the serverless function never touches
 * the filesystem. ~35 chunks at this scale; retrieval is keyword-overlap
 * scoring, which is plenty for 30 notes.
 */
import { profile, skills, employers } from '../../data/profile';
import { projects } from '../../data/projects';

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

function slugify(basename: string): string {
  return basename
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseFrontmatter(raw: string): { title: string | null; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { title: null, body: raw };
  const titleMatch = match[1].match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
  return { title: titleMatch?.[1] ?? null, body: raw.slice(match[0].length) };
}

/** Markdown → readable plain text (rough is fine for retrieval + context). */
function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1 ($2)')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildChunks(): Chunk[] {
  const chunks: Chunk[] = [];

  /* Core facts - always included in context, whatever the question. */
  const roleLabel = (role: string) =>
    role === 'built-0-1' ? 'built 0→1 (from scratch)' : 'contributed';
  const projectLines = projects
    .map(
      (p) =>
        `- ${p.name} (${p.track}, ${roleLabel(p.role)}${p.featured ? `, full case study at /work/${p.id}` : ''}): ${p.summary} Scope: ${p.scope}. Links: ${p.links.map((l) => `${l.label} ${l.href}`).join(', ')}`,
    )
    .join('\n');
  chunks.push({
    id: 'facts',
    title: 'Core facts about Mohd Saif',
    url: '/',
    text: [
      `Mohd Saif is a Product Engineer with ${profile.yearsExperience} years of experience. Positioning: "${profile.positioning}"`,
      `He has built and shipped products at: ${employers.join(', ')}.`,
      `Founding-engineer fit: Mohd is a strong fit for a founding engineer role. He defaults to 0→1 (multiple products taken from empty repo to the App Store and Play Store), covers the whole stack (design, iOS, Android, web, and backends), makes product decisions alongside the code, ships fast using AI as leverage, wires up the essentials a young product needs (payments, subscriptions, analytics, deep linking), and biases to production: ship, measure, iterate.`,
      `Core stack: ${skills.coreStack.join(', ')}. He is tool-agnostic and outcome-first, with strong applied-AI skills, and ships mobile apps, web products, and the backends behind them, end to end.`,
      `Payments and monetization: ${skills.payments.join(', ')}.`,
      `Named performance and delivery techniques: ${skills.performance.join(', ')}.`,
      `Analytics, growth, and tooling: ${skills.analyticsAndTooling.join(', ')}.`,
      `Contact: email ${profile.email}, GitHub ${profile.github}, LinkedIn ${profile.linkedin}, résumé ${profile.resume}. There is also a contact form on the homepage (#contact).`,
      `Projects that were built 0→1 (from zero): ${projects.filter((p) => p.role === 'built-0-1').map((p) => p.name).join(', ')}.`,
      `Projects he contributed to: ${projects.filter((p) => p.role === 'contributed').map((p) => p.name).join(', ')}.`,
      `All projects:\n${projectLines}`,
    ].join('\n\n'),
  });

  chunks.push({
    id: 'llms',
    title: 'Site overview (llms.txt)',
    url: '/llms.txt',
    text: stripMarkdown(llmsTxt),
  });

  for (const [path, raw] of Object.entries(workRaw)) {
    const slug = path.split('/').pop()!.replace('.mdx', '');
    const { title, body } = parseFrontmatter(raw);
    chunks.push({
      id: `work-${slug}`,
      title: title ?? slug,
      url: `/work/${slug}`,
      text: stripMarkdown(body),
    });
  }

  for (const [path, raw] of Object.entries(brainRaw)) {
    const basename = path.split('/').pop()!.replace('.md', '');
    const slug = slugify(basename);
    const { title, body } = parseFrontmatter(raw);
    chunks.push({
      id: `brain-${slug}`,
      title: title ?? basename,
      url: `/brain/${slug}`,
      text: stripMarkdown(body),
    });
  }

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
  let total = picked[0].text.length;
  for (const { chunk } of scored) {
    if (picked.length >= maxChunks) break;
    if (total + chunk.text.length > maxChars) continue;
    picked.push(chunk);
    total += chunk.text.length;
  }
  return picked;
}
