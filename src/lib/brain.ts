/**
 * Build-time parser for the Obsidian vault at ./brain.
 *
 * Reads every .md file, resolves [[wikilinks]] (including [[Note|alias]])
 * to /brain/[slug] anchors, collects backlinks, and renders the body to
 * HTML. Wikilinks are rewritten on the mdast - only `text` nodes are
 * visited, so [[...]] inside code spans and fenced blocks is left alone.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { unified, type Plugin } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { visit, SKIP } from 'unist-util-visit';
import type { Root, Text, PhrasingContent } from 'mdast';

export interface BrainNote {
  slug: string;
  title: string;
  type: string;
  status?: string;
  created?: string;
  tags: string[];
  html: string;
  /** Slugs of notes this note links to. */
  outgoing: string[];
  /** Slugs of notes that link to this one. */
  backlinks: string[];
  /** First non-heading paragraph, plain text, for descriptions. */
  excerpt: string;
}

const VAULT_DIR = path.resolve('brain');
const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function slugifyNote(basename: string): string {
  return basename
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export { NOTE_TYPES } from './brain-types';

async function listVaultFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listVaultFiles(full)));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(full);
  }
  return files;
}

/** Rewrite [[wikilinks]] in text nodes to links (or plain text if unresolved). */
function remarkWikilinks(options: {
  slugByName: Map<string, string>;
  titleBySlug: Map<string, string>;
  onLink: (slug: string) => void;
}): ReturnType<Plugin<[], Root>> {
  const { slugByName, titleBySlug, onLink } = options;
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined) return;
      const value = node.value;
      if (!value.includes('[[')) return;

      const parts: PhrasingContent[] = [];
      let last = 0;
      for (const match of value.matchAll(WIKILINK)) {
        const [full, target, alias] = match;
        const start = match.index;
        if (start > last) parts.push({ type: 'text', value: value.slice(last, start) });
        const slug = slugByName.get(target.trim().toLowerCase());
        const label = alias?.trim() || target.trim();
        if (slug) {
          onLink(slug);
          parts.push({
            type: 'link',
            url: `/brain/${slug}/`,
            title: titleBySlug.get(slug) ?? null,
            children: [{ type: 'text', value: label }],
          });
        } else {
          parts.push({ type: 'text', value: label });
        }
        last = start + full.length;
      }
      if (last < value.length) parts.push({ type: 'text', value: value.slice(last) });
      parent.children.splice(index, 1, ...parts);
      return [SKIP, index + parts.length];
    });
  };
}

function extractExcerpt(markdown: string): string {
  const lines = markdown.split('\n');
  const paragraph: string[] = [];
  let inFence = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('>') || trimmed.startsWith('-')) {
      if (paragraph.length) break;
      continue;
    }
    paragraph.push(trimmed);
  }
  return paragraph
    .join(' ')
    .replace(WIKILINK, (_full, target, alias) => (alias ?? target).trim())
    .replace(/[*_`]/g, '')
    .slice(0, 240);
}

let cache: Promise<BrainNote[]> | undefined;

export function getBrainNotes(): Promise<BrainNote[]> {
  cache ??= loadBrainNotes();
  return cache;
}

async function loadBrainNotes(): Promise<BrainNote[]> {
  const files = await listVaultFiles(VAULT_DIR);

  const raw = await Promise.all(
    files.map(async (file) => {
      const basename = path.basename(file, '.md');
      const { data, content } = matter(await fs.readFile(file, 'utf-8'));
      return {
        basename,
        slug: slugifyNote(basename),
        frontmatter: data as Record<string, unknown>,
        content,
      };
    }),
  );

  const slugByName = new Map<string, string>();
  const titleBySlug = new Map<string, string>();
  for (const note of raw) {
    slugByName.set(note.basename.toLowerCase(), note.slug);
    const title = (note.frontmatter.title as string) ?? note.basename;
    slugByName.set(title.toLowerCase(), note.slug);
    titleBySlug.set(note.slug, title);
  }

  const backlinkMap = new Map<string, Set<string>>();

  const notes = await Promise.all(
    raw.map(async (note) => {
      const outgoing = new Set<string>();
      const processor = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkWikilinks, {
          slugByName,
          titleBySlug,
          onLink: (slug: string) => {
            if (slug !== note.slug) outgoing.add(slug);
          },
        })
        .use(remarkRehype)
        .use(rehypeStringify);

      const html = String(await processor.process(note.content));

      for (const target of outgoing) {
        if (!backlinkMap.has(target)) backlinkMap.set(target, new Set());
        backlinkMap.get(target)!.add(note.slug);
      }

      return {
        slug: note.slug,
        title: titleBySlug.get(note.slug)!,
        type: (note.frontmatter.type as string) ?? 'meta',
        status: note.frontmatter.status as string | undefined,
        created:
          note.frontmatter.created instanceof Date
            ? note.frontmatter.created.toISOString().slice(0, 10)
            : note.frontmatter.created
              ? String(note.frontmatter.created)
              : undefined,
        tags: Array.isArray(note.frontmatter.tags) ? note.frontmatter.tags.map(String) : [],
        html,
        outgoing: [...outgoing],
        excerpt: extractExcerpt(note.content),
        backlinks: [] as string[],
      };
    }),
  );

  for (const note of notes) {
    note.backlinks = [...(backlinkMap.get(note.slug) ?? [])].sort();
  }

  return notes.sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function getBrainNote(slug: string): Promise<BrainNote | undefined> {
  return (await getBrainNotes()).find((n) => n.slug === slug);
}

/* --- Localized note bodies (Phase 6, D006 review gate) ---
   scripts/translate.mjs writes machine translations to
   src/i18n/machine/brain/<locale>/<slug>.md; a note only renders localized
   once its manifest entry is flipped to "reviewed". */

const MACHINE_BRAIN_DIR = path.resolve('src/i18n/machine/brain');
const MANIFEST_PATH = path.resolve('src/i18n/machine/manifest.json');

let localizedCache: Promise<Map<string, string>> | undefined;

/** Map of "<locale>/<slug>" → rendered HTML for reviewed translations. */
function getLocalizedNotes(): Promise<Map<string, string>> {
  localizedCache ??= (async () => {
    const map = new Map<string, string>();
    let manifest: Record<string, { status?: string }> = {};
    try {
      manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf-8'));
    } catch {
      return map;
    }

    let files: string[] = [];
    try {
      files = await listVaultFiles(MACHINE_BRAIN_DIR);
    } catch {
      return map;
    }
    if (files.length === 0) return map;

    /* Reuse the English notes' slug/title maps - wikilink targets stay
       English in translations, so links keep resolving. */
    const notes = await getBrainNotes();
    const slugByName = new Map<string, string>();
    const titleBySlug = new Map<string, string>();
    for (const note of notes) {
      slugByName.set(note.title.toLowerCase(), note.slug);
      slugByName.set(note.slug, note.slug);
      titleBySlug.set(note.slug, note.title);
    }

    for (const file of files) {
      const rel = path.relative(MACHINE_BRAIN_DIR, file);
      const [locale, ...rest] = rel.split(path.sep);
      const slug = rest.join('/').replace(/\.md$/, '');
      if (manifest[`brain:${locale}:${slug}`]?.status !== 'reviewed') continue;

      const { content } = matter(await fs.readFile(file, 'utf-8'));
      const processor = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkWikilinks, { slugByName, titleBySlug, onLink: () => {} })
        .use(remarkRehype)
        .use(rehypeStringify);
      map.set(`${locale}/${slug}`, String(await processor.process(content)));
    }
    return map;
  })();
  return localizedCache;
}

/** Reviewed localized HTML for a note, or undefined → English fallback. */
export async function getLocalizedNoteHtml(
  locale: string,
  slug: string,
): Promise<string | undefined> {
  return (await getLocalizedNotes()).get(`${locale}/${slug}`);
}
