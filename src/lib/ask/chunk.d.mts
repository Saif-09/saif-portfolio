/** Types for chunk.mjs, which is plain JS so node and Vite can both load it. */

export interface RawSource {
  kind: 'brain' | 'work';
  path: string;
  raw: string;
}

export interface DocChunk {
  id: string;
  title: string;
  url: string;
  text: string;
  source: string;
}

export function slugify(basename: string): string;
export function parseFrontmatter(raw: string): { title: string | null; body: string };
export function stripMarkdown(md: string): string;
export function buildDocChunks(sources: RawSource[]): DocChunk[];
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number;
