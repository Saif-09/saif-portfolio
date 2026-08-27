/**
 * Retrieval for /api/ask.
 *
 * Semantic first: every chunk was embedded at build time by
 * scripts/embed-corpus.mjs, so a request embeds only the question and then does
 * 128 dot products, which is microseconds. Keyword overlap stays as the
 * fallback for when no embedding key is configured, or when the committed index
 * has gone stale against the corpus.
 *
 * The scores this returns are shown to the user in the pipeline panel, so they
 * have to be the real ones.
 */
import { embed } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { CHUNKS, retrieve as keywordRetrieve, type Chunk } from './corpus';
import { env } from '../env';
import index from './embeddings.json';

export interface Hit {
  chunk: Chunk;
  /** Cosine similarity for semantic hits, term overlap for keyword hits. */
  score: number;
}

export interface RetrievalResult {
  hits: Hit[];
  /** How the hits were found, for the trace. */
  method: 'semantic' | 'keyword';
  /** Total candidates considered. */
  considered: number;
  reason?: string;
}

const BY_ID = new Map(CHUNKS.map((chunk) => [chunk.id, chunk]));

/** Unpack the base64 float32 vectors once per cold start, not per request. */
const VECTORS: { id: string; vector: Float32Array }[] = (() => {
  try {
    return (index.entries as { id: string; vector: string }[])
      .map((entry) => {
        const bytes = Buffer.from(entry.vector, 'base64');
        return {
          id: entry.id,
          vector: new Float32Array(
            bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          ),
        };
      })
      .filter((entry) => BY_ID.has(entry.id));
  } catch {
    return [];
  }
})();

/** How much of the committed index still matches the corpus in this build. */
export const indexCoverage = {
  vectors: VECTORS.length,
  chunks: CHUNKS.length,
  model: index.model as string,
  dims: index.dims as number,
};

function apiKey(): string {
  return env('GEMINI_API_KEY') || env('GOOGLE_GENERATIVE_AI_API_KEY');
}

export function semanticAvailable(): boolean {
  return VECTORS.length > 0 && Boolean(apiKey());
}

/** Vectors are stored normalised, so a dot product IS the cosine. */
function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) sum += a[i] * b[i];
  return sum;
}

export async function embedQuestion(question: string): Promise<Float32Array | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const { embedding } = await embed({
      model: createGoogleGenerativeAI({ apiKey: key }).textEmbeddingModel(indexCoverage.model),
      value: question,
      /* RETRIEVAL_QUERY against RETRIEVAL_DOCUMENT vectors: Gemini embeds
         questions and passages asymmetrically on purpose. */
      providerOptions: {
        google: { outputDimensionality: indexCoverage.dims, taskType: 'RETRIEVAL_QUERY' },
      },
    });
    let norm = 0;
    for (const value of embedding) norm += value * value;
    norm = Math.sqrt(norm) || 1;
    return Float32Array.from(embedding, (value) => value / norm);
  } catch {
    return null;
  }
}

/**
 * Top matches for a question. `facts` is always prepended: it is the identity
 * block, and an answer that omits it can get the basics wrong however good the
 * semantic match was.
 */
export async function search(
  question: string,
  topK = 6,
  maxChars = 9000,
): Promise<RetrievalResult> {
  const facts = BY_ID.get('facts');

  if (semanticAvailable()) {
    const query = await embedQuestion(question);
    if (query) {
      const scored = VECTORS.map((entry) => ({
        chunk: BY_ID.get(entry.id)!,
        score: dot(query, entry.vector),
      }))
        .filter((hit) => hit.chunk && hit.chunk.id !== 'facts')
        .sort((a, b) => b.score - a.score);

      const hits: Hit[] = facts ? [{ chunk: facts, score: 1 }] : [];
      /* The budget covers RETRIEVED chunks only. Counting the mandatory facts
         block against it made it self-defeating: facts is 6.5k characters, so
         it consumed the whole allowance and every actual search result was
         skipped, leaving the agent to answer from the identity block alone. */
      let total = 0;
      for (const hit of scored) {
        if (hits.length >= topK) break;
        if (total + hit.chunk.text.length > maxChars) continue;
        hits.push(hit);
        total += hit.chunk.text.length;
      }

      return { hits, method: 'semantic', considered: VECTORS.length };
    }
  }

  const picked = keywordRetrieve(question, topK, maxChars);
  return {
    hits: picked.map((chunk) => ({ chunk, score: 0 })),
    method: 'keyword',
    considered: CHUNKS.length,
    reason:
      VECTORS.length === 0
        ? 'no vector index in this build'
        : !apiKey()
          ? 'no embedding key configured'
          : 'could not embed the question',
  };
}

/** Fetch one chunk by id, for the agent's read tool. */
export function chunkById(id: string): Chunk | undefined {
  return BY_ID.get(id);
}

/** Every chunk belonging to one page, joined, for reading a whole note. */
export function chunksForUrl(url: string): Chunk[] {
  return CHUNKS.filter((chunk) => chunk.url === url);
}
