/**
 * Phase 6 - build-time translation of the finished English content into the
 * six non-English locales. English is the single source of truth; output is
 * static committed files behind the D006 review gate (translationStatus:
 * machine → the site keeps English fallback until flipped to reviewed).
 *
 * Usage:
 *   npm run translate -- [--dry-run] [--only=hi] [--sample] [--brain] [--mock]
 *
 *   --dry-run   report what would translate, no API calls, no writes
 *   --only=xx   restrict to one locale (hi|kn|te|ur|ar|hi-latn)
 *   --sample    tiny subset (3 catalog keys, 1 case study, 2 brain notes)
 *   --brain     include /brain note bodies (large; off by default)
 *   --mock      exercise the full pipeline without API calls (identity
 *               "translations") - for testing the tooling itself
 *
 * Re-runs are incremental: a manifest of source hashes means unchanged
 * English is never re-translated. Reviewed entries whose source changed
 * are re-translated and reset to "machine".
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MACHINE_DIR = join(ROOT, 'src/i18n/machine');
const MANIFEST_PATH = join(MACHINE_DIR, 'manifest.json');
/* Provider: a free Google AI Studio key (GEMINI_API_KEY) when present,
   else the Vercel AI Gateway. */
const GATEWAY_MODEL = 'anthropic/claude-sonnet-4.5';
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
/* TRANSLATE_PROVIDER=groq|openrouter forces that provider even when a
   Gemini key exists. Both speak the OpenAI chat-completions shape. */
const USE_GROQ =
  process.env.TRANSLATE_PROVIDER === 'groq' && Boolean(process.env.GROQ_API_KEY);
const USE_OPENROUTER =
  process.env.TRANSLATE_PROVIDER === 'openrouter' &&
  Boolean(process.env.OPENROUTER_API_KEY);
const USE_GEMINI = !USE_GROQ && !USE_OPENROUTER && Boolean(GEMINI_KEY);
const OPENAI_COMPAT = USE_GROQ
  ? {
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
    }
  : USE_OPENROUTER
    ? {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: process.env.OPENROUTER_API_KEY,
        model: process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.3-70b-instruct:free',
      }
    : null;

/* --- CLI --- */
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const SAMPLE = args.includes('--sample');
const MOCK = args.includes('--mock');
const WITH_BRAIN = args.includes('--brain');
const ONLY = args.find((a) => a.startsWith('--only='))?.slice(7) ?? null;

const LOCALES = {
  hi: { name: 'Hindi', script: 'Devanagari', dir: 'ltr' },
  kn: { name: 'Kannada', script: 'Kannada', dir: 'ltr' },
  te: { name: 'Telugu', script: 'Telugu', dir: 'ltr' },
  ur: { name: 'Urdu', script: 'Arabic (Nastaliq)', dir: 'rtl' },
  ar: { name: 'Arabic', script: 'Arabic', dir: 'rtl' },
  'hi-latn': { name: 'Hinglish', script: 'Latin', dir: 'ltr' },
};
const targetLocales = ONLY ? [ONLY] : Object.keys(LOCALES);
if (ONLY && !LOCALES[ONLY]) {
  console.error(`Unknown locale "${ONLY}". Valid: ${Object.keys(LOCALES).join(', ')}`);
  process.exit(1);
}

const PROPER_NOUNS = [
  'Mohd Saif', 'Ueue', 'Prism', "Shoppin'", 'Zenzop', 'Wellbeing Nutrition',
  'Supertails', 'Gurucool', 'Zazz', 'Insomniac', 'Cat Mode',
  'React Native', 'React', 'TypeScript', 'Node.js', 'MongoDB', 'Postgres',
  'Next.js', 'Python', 'Razorpay', 'Stripe', 'Apple Pay', 'Google Pay',
  'WhatsApp', 'Qonversion', 'PostHog', 'WebEngage', 'Google Search Console',
  'Claude Code', 'Shopify', 'GraphQL', 'App Maker', 'Storefront API',
  'Infinite Locus', 'metaobjects', 'GoKwik', 'CleverTap',
  'Shloka', 'Gurucool', 'Agora',
  'Zenzop', 'Insomniac', 'Cat Mode', 'Ueue', 'Prism',
  'Google Maps', 'Live Activities', 'Dynamic Island', 'Swift', 'CodePush',
  'Swagger', 'macOS', 'IOKit', 'pmset', 'Gatekeeper', 'Open-Meteo', 'Chrome',
  'Face ID', 'YouTube', 'Xcode', 'Android Studio',
  'Astro', 'Obsidian', 'GitHub', 'LinkedIn',
];

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);

/* --- prompts --- */
function systemPrompt(locale) {
  const spec = LOCALES[locale];
  const base = `You are translating the portfolio of Mohd Saif, a product engineer. Tone: confident, plain, senior - never flowery, never marketing-speak.

Hard rules:
- Preserve ALL structure exactly: markdown/MDX syntax, frontmatter KEYS (translate only human-readable VALUES like title and description - never keys, slugs, enum values like "built-0-1", numbers, or booleans), [[wikilink]] targets (translate ONLY the alias after | in [[Target|alias]]; leave bare [[Target]] completely untouched), code spans/blocks, URLs, email addresses, and paths.
- Never translate these proper nouns (keep exactly as written): ${PROPER_NOUNS.join(', ')}.
- Keep widely-used English tech terms where natural for the audience.
- Output ONLY the translated artifact - no commentary, no fences around the whole answer.`;
  if (locale === 'hi-latn') {
    return `${base}

Target: Hinglish (hi-Latn) - natural ROMANIZED Hindi in Latin script, the casual register a young Indian engineer actually uses when texting or writing online. This is NOT a transliteration of formal Hindi and NOT English: mix everyday Hindi grammar with English tech vocabulary naturally ("maine ye app scratch se banaya", "products ship karta hoon"). Keep it relaxed but competent.`;
  }
  return `${base}

Target: ${spec.name}, written in ${spec.script} script${spec.dir === 'rtl' ? ' (right-to-left)' : ''}. Use natural, contemporary ${spec.name} - not stiff textbook register.`;
}

/* --- model call --- */
let generateText;
let geminiModel;
async function translate(locale, prompt, maxOutputTokens = 4000) {
  if (MOCK) {
    const body = prompt.slice(prompt.indexOf('---SOURCE---') + 13);
    return body; // identity: pipeline test without API spend
  }
  if (OPENAI_COMPAT) {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(OPENAI_COMPAT.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_COMPAT.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OPENAI_COMPAT.model,
          messages: [
            { role: 'system', content: systemPrompt(locale) },
            { role: 'user', content: prompt },
          ],
          max_tokens: maxOutputTokens,
          temperature: 0.2,
        }),
      });
      if (res.status === 429 && attempt <= 6) {
        const body = await res.text();
        const wait = Number(body.match(/try again in ([\d.]+)s/)?.[1] ?? 30) + 2;
        console.log(`  429, waiting ${Math.ceil(wait)}s (attempt ${attempt})`);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      return data.choices[0].message.content.trim();
    }
  }
  if (!generateText) ({ generateText } = await import('ai'));
  if (USE_GEMINI && !geminiModel) {
    const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
    geminiModel = createGoogleGenerativeAI({ apiKey: GEMINI_KEY })(GEMINI_MODEL);
  }
  const result = await generateText({
    model: USE_GEMINI ? geminiModel : GATEWAY_MODEL,
    system: systemPrompt(locale),
    prompt,
    maxOutputTokens,
    temperature: 0.2,
  });
  return result.text.trim();
}

/* --- catalog helpers --- */
function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else if (Array.isArray(value)) value.forEach((v, i) => flatten({ [i]: v }, path, out));
    else if (value && typeof value === 'object') flatten(value, path, out);
  }
  return out;
}

function setPath(obj, path, value) {
  const parts = path.split('.');
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const nextIsIndex = /^\d+$/.test(parts[i + 1]);
    if (!(key in node)) node[key] = nextIsIndex ? [] : {};
    node = node[key];
  }
  node[parts.at(-1)] = value;
}

/* --- validation --- */
const extract = (text) => ({
  urls: (text.match(/https?:\/\/[^\s)"'\]]+/g) ?? []).sort(),
  wikiTargets: [...text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((m) => m[1].trim()).sort(),
  fences: (text.match(/```/g) ?? []).length,
});

function validateFile(source, translated) {
  const a = extract(source);
  const b = extract(translated);
  const problems = [];
  if (JSON.stringify(a.urls) !== JSON.stringify(b.urls)) problems.push('URLs changed');
  if (JSON.stringify(a.wikiTargets) !== JSON.stringify(b.wikiTargets)) problems.push('wikilink targets changed');
  if (a.fences !== b.fences) problems.push('code fences changed');
  for (const noun of PROPER_NOUNS) {
    if (source.includes(noun) && !translated.includes(noun)) problems.push(`proper noun lost: ${noun}`);
  }
  const srcKeys = source.match(/^---\n([\s\S]*?)\n---/)?.[1].match(/^[a-zA-Z]+:/gm)?.sort() ?? [];
  const dstKeys = translated.match(/^---\n([\s\S]*?)\n---/)?.[1].match(/^[a-zA-Z]+:/gm)?.sort() ?? [];
  if (srcKeys.join() !== dstKeys.join()) problems.push('frontmatter keys changed');
  return problems;
}

/* --- manifest --- */
const manifest = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) : {};
const saveManifest = () => {
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MANIFEST_PATH, JSON.stringify(sorted, null, 2) + '\n');
};

/* --- work plan --- */
const plan = [];
const report = { translated: 0, skipped: 0, failed: 0 };

/* 1. UI catalogs */
const en = JSON.parse(readFileSync(join(ROOT, 'src/i18n/en.json'), 'utf8'));
const enFlat = flatten(en);
for (const locale of targetLocales) {
  const authored = flatten(JSON.parse(readFileSync(join(ROOT, `src/i18n/${locale}.json`), 'utf8')));
  const machinePath = join(MACHINE_DIR, `${locale}.json`);
  const machine = existsSync(machinePath) ? JSON.parse(readFileSync(machinePath, 'utf8')) : {};
  const entry = (manifest[`catalog:${locale}`] ??= { status: 'machine', keys: {} });
  let pending = Object.entries(enFlat).filter(
    ([key, value]) => !(key in authored) && entry.keys[key] !== hash(value),
  );
  if (SAMPLE) pending = pending.slice(0, 3);
  if (pending.length > 0) {
    plan.push({ kind: 'catalog', locale, pending, machinePath, machine, entry });
  }
}

/* 2. Case-study MDX */
const workDir = join(ROOT, 'src/content/work/en');
let workFiles = readdirSync(workDir).filter((f) => f.endsWith('.mdx'));
if (SAMPLE) workFiles = workFiles.slice(0, 1);
for (const locale of targetLocales) {
  for (const file of workFiles) {
    const slug = file.replace('.mdx', '');
    const source = readFileSync(join(workDir, file), 'utf8');
    const sourceHash = hash(source);
    const key = `work:${locale}:${slug}`;
    if (manifest[key]?.sourceHash === sourceHash) {
      report.skipped++;
      continue;
    }
    plan.push({ kind: 'work', locale, slug, source, sourceHash, key });
  }
}

/* 3. Brain notes (opt-in) */
if (WITH_BRAIN) {
  const brainFiles = [];
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) brainFiles.push(p);
    }
  })(join(ROOT, 'brain'));
  const slugify = (s) =>
    s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  let notes = brainFiles;
  if (SAMPLE) notes = notes.slice(0, 2);
  for (const locale of targetLocales) {
    for (const file of notes) {
      const slug = slugify(file.split('/').pop().replace('.md', ''));
      const source = readFileSync(file, 'utf8');
      const sourceHash = hash(source);
      const key = `brain:${locale}:${slug}`;
      if (manifest[key]?.sourceHash === sourceHash) {
        report.skipped++;
        continue;
      }
      plan.push({ kind: 'brain', locale, slug, source, sourceHash, key });
    }
  }
}

/* --- dry run --- */
const catalogKeyCount = plan.filter((p) => p.kind === 'catalog').reduce((n, p) => n + p.pending.length, 0);
console.log(
  `plan: ${plan.filter((p) => p.kind === 'catalog').length} catalog batches (${catalogKeyCount} keys), ` +
  `${plan.filter((p) => p.kind === 'work').length} case studies, ` +
  `${plan.filter((p) => p.kind === 'brain').length} brain notes` +
  `${WITH_BRAIN ? '' : ' (brain skipped - pass --brain)'} · ${report.skipped} unchanged skipped`,
);
if (DRY) {
  for (const item of plan) {
    if (item.kind === 'catalog')
      console.log(`  would translate catalog:${item.locale} - ${item.pending.length} keys (e.g. ${item.pending.slice(0, 3).map(([k]) => k).join(', ')})`);
    else console.log(`  would translate ${item.key}`);
  }
  console.log('dry run - no API calls, nothing written.');
  process.exit(0);
}

/* --- key gate --- */
if (!MOCK && !USE_GEMINI && !OPENAI_COMPAT && !process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
  console.log(
    '\nNo model provider configured. Set ONE of:\n' +
    '  GEMINI_API_KEY  (free: https://aistudio.google.com/apikey)\n' +
    '  AI_GATEWAY_API_KEY / VERCEL_OIDC_TOKEN  (Vercel AI Gateway)\n' +
    'and re-run. Nothing was translated; nothing was written. Exiting cleanly.',
  );
  process.exit(0);
}
if (USE_GEMINI) console.log(`provider: Google AI Studio (${GEMINI_MODEL})`);
if (OPENAI_COMPAT) console.log(`provider: ${USE_GROQ ? 'Groq' : 'OpenRouter'} (${OPENAI_COMPAT.model})`);

/* --- execute --- */
mkdirSync(MACHINE_DIR, { recursive: true });
for (const item of plan) {
  try {
    if (item.kind === 'catalog') {
      /* Chunk large catalogs: keeps each request inside free-tier output
         limits (Indic scripts are token-heavy). */
      const CHUNK = 30;
      const parsed = {};
      for (let i = 0; i < item.pending.length; i += CHUNK) {
        const payload = Object.fromEntries(item.pending.slice(i, i + CHUNK));
        const raw = await translate(
          item.locale,
          `Translate the VALUES of this JSON object. Return ONLY a JSON object with exactly the same keys. Keys are dot-paths - do not change them.\n\n---SOURCE---\n${JSON.stringify(payload, null, 2)}`,
          8000,
        );
        const part = JSON.parse(raw.replace(/^```(json)?\n?|```$/g, ''));
        const missing = Object.keys(payload).filter((k) => !(k in part));
        if (missing.length) throw new Error(`missing keys: ${missing.slice(0, 3).join(', ')}`);
        Object.assign(parsed, part);
      }
      const source = Object.fromEntries(item.pending);
      for (const [key, value] of Object.entries(parsed)) {
        setPath(item.machine, key, value);
        item.entry.keys[key] = hash(source[key]);
      }
      /* source changed or new keys → back to machine until re-reviewed */
      item.entry.status = 'machine';
      item.entry.updated = new Date().toISOString();
      writeFileSync(item.machinePath, JSON.stringify(item.machine, null, 2) + '\n');
      console.log(`✓ catalog:${item.locale} - ${item.pending.length} keys`);
      report.translated++;
    } else {
      const raw = await translate(
        item.locale,
        `Translate this ${item.kind === 'work' ? 'MDX case study' : 'markdown note'} file in full. Return the complete file.\n\n---SOURCE---\n${item.source}`,
        8000,
      );
      /* Some models wrap the whole file in a ```mdx fence despite the
         instruction. Strip a single outer wrapper before validating so it
         doesn't read as a spurious fence / frontmatter mismatch. */
      const translated = raw
        .replace(/^```(?:mdx|markdown|md)?\s*\n/, '')
        .replace(/\n```\s*$/, '');
      const problems = validateFile(item.source, translated);
      if (problems.length) throw new Error(problems.join('; '));

      let output = translated;
      if (item.kind === 'work') {
        /* enforce the gate marker regardless of what the model returned */
        output = output.replace(/^translationStatus:.*$/m, '').replace(
          /^---\n/,
          '---\ntranslationStatus: machine\n',
        );
        const dir = join(ROOT, `src/content/work/${item.locale}`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${item.slug}.mdx`), output);
      } else {
        const dir = join(MACHINE_DIR, 'brain', item.locale);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${item.slug}.md`), output);
      }
      manifest[item.key] = {
        status: 'machine',
        sourceHash: item.sourceHash,
        updated: new Date().toISOString(),
      };
      console.log(`✓ ${item.key}`);
      report.translated++;
    }
    saveManifest();
  } catch (error) {
    report.failed++;
    console.error(`✗ ${item.kind}:${item.locale}${item.slug ? ':' + item.slug : ''} - ${error.message}`);
  }
}

console.log(
  `\ndone: ${report.translated} translated, ${report.skipped} skipped (unchanged), ${report.failed} failed.` +
  `\nAll new output is translationStatus:"machine" - flip entries to "reviewed" in` +
  `\nsrc/i18n/machine/manifest.json (and work MDX frontmatter) to make them live (D006).`,
);
