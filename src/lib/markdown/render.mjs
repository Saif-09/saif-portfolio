/**
 * Pure helpers behind the .md twin of every page.
 *
 * Plain .mjs for the same reason as chunk.mjs and accept.mjs: `node --test`
 * imports these directly, while Astro bundles them into both the prerendered
 * /[...path].md endpoint and the /api/markdown serverless function. One copy,
 * so what the tests check is what the site serves.
 */
import { slugify } from '../ask/chunk.mjs';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Frontmatter reader for the three shapes the vault and the case studies use:
 * `key: value`, `tags: [a, b]`, and a block list of `  - item` lines.
 * Deliberately not gray-matter, which would drag js-yaml into the serverless
 * bundle for five fields.
 */
export function readFrontmatter(raw) {
  const match = raw.match(FRONTMATTER);
  if (!match) return { data: {}, body: raw };
  const data = {};
  const lines = match[1].split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s/.test(line)) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    if (!key) continue;
    const value = line.slice(colon + 1).trim();

    if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = splitInline(value.slice(1, -1));
      continue;
    }
    if (value) {
      data[key] = unquote(value);
      continue;
    }

    // Bare `key:` opens a block list; consume the indented `- item` lines.
    const items = [];
    while (i + 1 < lines.length && /^\s+-\s*/.test(lines[i + 1])) {
      items.push(unquote(lines[++i].replace(/^\s+-\s*/, '').trim()));
    }
    if (items.length) data[key] = items;
  }
  return { data, body: raw.slice(match[0].length) };
}

function unquote(value) {
  return value.replace(/^['"]|['"]$/g, '');
}

function splitInline(value) {
  return value
    .split(',')
    .map((v) => unquote(v.trim()))
    .filter(Boolean);
}

const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/**
 * Obsidian [[wikilinks]] are not markdown. Rewrite them to real links so the
 * .md twin is as navigable as the rendered page, matching what brain.ts does
 * for the HTML. Unresolved targets degrade to plain text, never a dead link.
 */
export function wikilinksToMarkdown(body, slugByName) {
  return body.replace(WIKILINK, (whole, target, alias) => {
    const label = (alias ?? target).trim();
    const slug = slugByName.get(target.trim().toLowerCase()) ?? null;
    return slug ? `[${label}](/brain/${slug}/)` : label;
  });
}

/** The .md twin of a page path: "/" is /index.md, "/about/" is /about.md. */
export function mdPathForPage(pagePath) {
  const trimmed = pagePath.replace(/\/+$/, '');
  return trimmed === '' ? '/index.md' : `${trimmed}.md`;
}

/** Inverse of mdPathForPage, for turning built .md files back into routes. */
export function pagePathForMd(mdPath) {
  const withoutExt = mdPath.replace(/\.md$/, '');
  return withoutExt === '/index' ? '/' : withoutExt;
}

/** Astro's getStaticPaths param for a .md twin: "/work/ueue.md" -> "work/ueue". */
export function mdParamForPage(pagePath) {
  return mdPathForPage(pagePath).slice(1).replace(/\.md$/, '');
}

/** A markdown link, with the label escaped so titles with brackets survive. */
export function link(label, href) {
  return `[${String(label).replace(/([[\]])/g, '\\$1')}](${href})`;
}

/** Join document parts, collapsing the blank-line runs joining creates. */
export function joinBlocks(blocks) {
  return `${blocks
    .filter((block) => block !== null && block !== undefined && block !== '')
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}

export { slugify };
