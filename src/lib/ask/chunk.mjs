/**
 * Turning the vault and the case studies into retrievable chunks.
 *
 * Plain .mjs on purpose: this runs in two places that cannot share TypeScript.
 * `corpus.ts` feeds it files collected by import.meta.glob at build time, and
 * `scripts/embed-corpus.mjs` feeds it the same files read from disk in plain
 * node. Splitting the logic in two would let the embeddings drift out of step
 * with what the retriever actually searches, which is the one bug in a RAG
 * pipeline that produces confident nonsense.
 */

/** Sections shorter than this are folded into the next one. */
const MIN_SECTION_CHARS = 220;
/** Sections longer than this are split again on paragraph boundaries. */
const MAX_SECTION_CHARS = 1400;

export function slugify(basename) {
  return basename
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { title: null, body: raw };
  const titleMatch = match[1].match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
  return { title: titleMatch?.[1] ?? null, body: raw.slice(match[0].length) };
}

/** Markdown to readable plain text. Rough is fine for retrieval and context. */
export function stripMarkdown(md) {
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

/**
 * Split a markdown body on its headings.
 *
 * Whole-document chunks are what made the old keyword retrieval blunt: a note
 * about six things matches every one of them weakly and answers none of them
 * well. Sections give the retriever something specific to point at.
 */
function splitSections(body) {
  const lines = body.split('\n');
  const sections = [];
  let heading = null;
  let buffer = [];

  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) sections.push({ heading, text });
    buffer = [];
  };

  for (const line of lines) {
    const match = line.match(/^(#{1,4})\s+(.*)$/);
    if (match) {
      flush();
      heading = match[2].trim();
    } else {
      buffer.push(line);
    }
  }
  flush();

  /* Fold runts forward: a two-line section under its own heading is a label,
     not a passage, and on its own it retrieves badly. */
  const merged = [];
  for (const section of sections) {
    const previous = merged[merged.length - 1];
    if (previous && previous.text.length < MIN_SECTION_CHARS) {
      previous.text = `${previous.text}\n\n${section.heading ? `${section.heading}\n` : ''}${section.text}`;
    } else {
      merged.push({ ...section });
    }
  }

  /* Then split anything still oversized, on paragraph boundaries. */
  const sized = [];
  for (const section of merged) {
    if (section.text.length <= MAX_SECTION_CHARS) {
      sized.push(section);
      continue;
    }
    let current = [];
    let length = 0;
    for (const paragraph of section.text.split(/\n{2,}/)) {
      if (length + paragraph.length > MAX_SECTION_CHARS && current.length > 0) {
        sized.push({ heading: section.heading, text: current.join('\n\n') });
        current = [];
        length = 0;
      }
      current.push(paragraph);
      length += paragraph.length;
    }
    if (current.length > 0) sized.push({ heading: section.heading, text: current.join('\n\n') });
  }

  return sized.filter((s) => s.text.trim().length > 0);
}

/**
 * @param {{kind: 'brain'|'work', path: string, raw: string}[]} sources
 * @returns {{id: string, title: string, url: string, text: string, source: string}[]}
 */
export function buildDocChunks(sources) {
  const chunks = [];

  for (const { kind, path, raw } of sources) {
    const basename = path
      .split('/')
      .pop()
      .replace(/\.(md|mdx)$/, '');
    const slug = kind === 'work' ? basename : slugify(basename);
    const { title, body } = parseFrontmatter(raw);
    const docTitle = title ?? basename;
    const url = kind === 'work' ? `/work/${slug}` : `/brain/${slug}`;

    const sections = splitSections(body);

    /* A short note is one chunk; there is nothing to gain by cutting it up. */
    if (sections.length <= 1) {
      const text = stripMarkdown(body);
      if (text) {
        chunks.push({ id: `${kind}-${slug}`, title: docTitle, url, text, source: kind });
      }
      continue;
    }

    sections.forEach((section, index) => {
      const text = stripMarkdown(section.text);
      if (!text) return;
      chunks.push({
        id: `${kind}-${slug}#${index}`,
        title: section.heading ? `${docTitle} · ${section.heading}` : docTitle,
        url,
        /* The document title rides along in the text so an embedding of a
           section still carries what it is a section OF. */
        text: `${docTitle}${section.heading ? ` — ${section.heading}` : ''}\n\n${text}`,
        source: kind,
      });
    });
  }

  return chunks;
}

/** Cosine similarity of two equal-length vectors. */
export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
