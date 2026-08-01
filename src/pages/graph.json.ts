import type { APIRoute } from 'astro';
import { getBrainNotes } from '../lib/brain';

/**
 * Build-time graph of the brain vault, consumed by the graph canvases.
 * nodes: {id, title, slug, type, degree, tags} · links: {source, target}
 */
export const GET: APIRoute = async () => {
  const notes = await getBrainNotes();
  const ids = new Set(notes.map((n) => n.slug));

  const links: { source: string; target: string }[] = [];
  const seen = new Set<string>();
  for (const note of notes) {
    for (const target of note.outgoing) {
      if (!ids.has(target)) continue;
      const key = [note.slug, target].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ source: note.slug, target });
    }
  }

  const degree = new Map<string, number>();
  for (const link of links) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
  }

  const nodes = notes.map((note) => ({
    id: note.slug,
    title: note.title,
    slug: note.slug,
    type: note.type,
    degree: degree.get(note.slug) ?? 0,
    tags: note.tags,
  }));

  return new Response(JSON.stringify({ nodes, links }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
