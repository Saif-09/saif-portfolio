/**
 * Embed the corpus at build time.
 *
 *   npm run embed          rebuild the index
 *   npm run embed -- --dry report what would change, call nothing
 *
 * Every vector is computed here and committed, so the serverless function does
 * no embedding work for the documents: at request time it embeds only the
 * question, one small call. The index is content-hashed, so a re-run only pays
 * for chunks whose text actually changed.
 *
 * Writes src/lib/ask/embeddings.json, which is imported (and therefore inlined)
 * by the function bundle.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { embedMany } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { buildDocChunks } from '../src/lib/ask/chunk.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/lib/ask/embeddings.json');
const MODEL = process.env.EMBED_MODEL ?? 'gemini-embedding-001';
/* 3072 is this model's native width and would put ~1.5MB of vectors in the
   function bundle. It is a Matryoshka model, so 768 is a real truncation, not
   a different model, and it keeps the index at a few hundred KB. */
const DIMS = Number(process.env.EMBED_DIMS ?? 768);
/* The free tier allows 100 embed requests a minute and the SDK issues one per
   value, so this paces itself rather than discovering the limit at request 101. */
const BATCH = 20;
const PACE_MS = 14_000;
/* Vectors are cached here between runs, so a rate-limit stop resumes instead
   of paying for everything again. Gitignored; embeddings.json is the artifact. */
const CACHE = join(ROOT, 'scripts/.embed-cache.json');

const dry = process.argv.includes('--dry');

function loadEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

function walk(dir, ext) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, ext));
    else if (entry.endsWith(ext)) out.push(full);
  }
  return out;
}

/* The same inputs corpus.ts collects with import.meta.glob, read from disk. */
function collectSources() {
  const sources = [];
  for (const file of walk(join(ROOT, 'brain'), '.md')) {
    sources.push({ kind: 'brain', path: `/${relative(ROOT, file)}`, raw: readFileSync(file, 'utf8') });
  }
  for (const file of walk(join(ROOT, 'src/content/work/en'), '.mdx')) {
    sources.push({ kind: 'work', path: `/${relative(ROOT, file)}`, raw: readFileSync(file, 'utf8') });
  }
  return sources.sort((a, b) => a.path.localeCompare(b.path));
}

const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

const chunks = buildDocChunks(collectSources());
console.log(`${chunks.length} chunks from ${collectSources().length} documents`);

const cached = new Map();
if (existsSync(CACHE)) {
  const disk = JSON.parse(readFileSync(CACHE, 'utf8'));
  if (disk.model === MODEL && disk.dims === DIMS) {
    for (const [hash, vector] of Object.entries(disk.vectors)) cached.set(hash, vector);
  }
}

const saveCache = () =>
  writeFileSync(
    CACHE,
    JSON.stringify({ model: MODEL, dims: DIMS, vectors: Object.fromEntries(cached) }),
  );

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const wanted = chunks.map((chunk) => ({ ...chunk, hash: hash(chunk.text) }));
const missing = wanted.filter((chunk) => !cached.has(chunk.hash));

console.log(
  `${wanted.length - missing.length} reused from the existing index, ${missing.length} to embed`,
);

if (dry) {
  for (const chunk of missing.slice(0, 20)) console.log(`  would embed: ${chunk.id}`);
  if (missing.length > 20) console.log(`  ...and ${missing.length - 20} more`);
  process.exit(0);
}

if (missing.length > 0) {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) {
    console.error('GEMINI_API_KEY is not set (put it in .env), so nothing can be embedded.');
    process.exit(1);
  }
  const embedder = createGoogleGenerativeAI({ apiKey: key }).textEmbeddingModel(MODEL);

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    process.stdout.write(`  embedding ${i + 1}-${i + batch.length} of ${missing.length}... `);
    if (i > 0) await sleep(PACE_MS);
    const { embeddings } = await embedMany({
      model: embedder,
      values: batch.map((chunk) => chunk.text),
      /* RETRIEVAL_DOCUMENT here, RETRIEVAL_QUERY for the question at request
         time: Gemini embeds the two asymmetrically and pairing them wrongly
         measurably degrades recall. */
      providerOptions: {
        google: { outputDimensionality: DIMS, taskType: 'RETRIEVAL_DOCUMENT' },
      },
    });
    batch.forEach((chunk, index) => cached.set(chunk.hash, embeddings[index]));
    saveCache();
    console.log('ok');
  }
}

const stillMissing = wanted.filter((chunk) => !cached.has(chunk.hash));
if (stillMissing.length > 0) {
  console.error(
    `\n${stillMissing.length} chunks still have no vector. Re-run to continue; finished ones are cached.`,
  );
  process.exit(1);
}

const dims = cached.size > 0 ? [...cached.values()][0].length : 0;

/* Vectors as base64 float32: JSON arrays of 768 floats each would triple the
   file for no benefit, and this is inlined into the function bundle. */
function packVector(vector) {
  /* Normalised on the way in, so retrieval is a plain dot product and a
     truncated Matryoshka vector behaves. */
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  const floats = Float32Array.from(vector, (value) => value / norm);
  return Buffer.from(floats.buffer).toString('base64');
}

const index = {
  model: MODEL,
  dims,
  builtFrom: `${chunks.length} chunks`,
  /* id + hash + vector only. Title, url and text already reach the bundle
     through corpus.ts, which builds its chunks from the same function; storing
     them twice would just inflate the function. The hash is what lets the
     retriever notice the index has gone stale against the corpus. */
  entries: wanted.map((chunk) => ({
    id: chunk.id,
    hash: chunk.hash,
    vector: packVector(cached.get(chunk.hash)),
  })),
};

writeFileSync(OUT, `${JSON.stringify(index)}\n`);

const bytes = statSync(OUT).size;
console.log(
  `\nwrote ${relative(ROOT, OUT)}: ${index.entries.length} vectors, ${dims} dims, ${(bytes / 1024).toFixed(0)} KB`,
);
