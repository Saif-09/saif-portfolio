import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Case studies live at src/content/work/<locale>/<slug>.mdx.
 * Only English is authored by hand; other locales are produced later by
 * the build-time translation script and simply fall back to English
 * until they exist (see getWorkEntry in src/lib/work.ts).
 */
const work = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/work' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** Matches Project.id in src/data/projects.ts. */
    project: z.string(),
    role: z.enum(['built-0-1', 'contributed']),
    stack: z.array(z.string()),
    order: z.number().default(99),
    /**
     * D006 review gate: machine translations ship as "machine" and only
     * render once flipped to "reviewed". English sources default to
     * reviewed (they are the source of truth).
     */
    translationStatus: z.enum(['machine', 'reviewed']).default('reviewed'),
  }),
});

export const collections = { work };
