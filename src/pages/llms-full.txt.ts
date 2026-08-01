import type { APIRoute } from 'astro';
import { CHUNKS } from '../lib/ask/corpus';

/**
 * /llms-full.txt — the COMPLETE plain-text content of the site for LLMs and
 * AI crawlers: core facts + the overview + every case study + every brain
 * note, in one fetch. Reuses the same CHUNKS as /api/ask so it can never
 * drift from the live site. (/llms.txt stays the short, curated summary.)
 */
export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const base = (site?.href ?? 'https://saifsiddiqui.in/').replace(/\/+$/, '');

  const header = [
    '# Mohd Saif — Product Engineer — full site content',
    '',
    '> I build solutions, not dead software.',
    `> This file is the complete plain-text content of ${base} for LLMs and AI crawlers.`,
    `> Human-facing site: ${base}  ·  Short summary: ${base}/llms.txt`,
    '',
  ].join('\n');

  const sections = CHUNKS.map((chunk) => {
    const url = chunk.url.startsWith('http') ? chunk.url : base + chunk.url;
    return `## ${chunk.title}\nSource: ${url}\n\n${chunk.text.trim()}\n`;
  }).join('\n---\n\n');

  return new Response(`${header}\n---\n\n${sections}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
