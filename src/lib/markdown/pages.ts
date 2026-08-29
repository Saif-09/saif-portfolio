/**
 * The markdown representation of every canonical (English) page.
 *
 * Built at build time from the same data the .astro pages render, so the two
 * representations of a URL cannot drift: src/data/* for identity, work, and
 * the About prose, the i18n catalog for section copy, the case-study MDX
 * bodies, and the Obsidian vault. Everything is inlined via import.meta.glob,
 * so nothing here touches the filesystem at request time.
 *
 * Consumed by two routes:
 *   - /[...path].md   the prerendered twin, fetchable directly
 *   - /api/markdown   the Accept: text/markdown negotiation endpoint
 */
import { profile, employers, skills } from '../../data/profile';
import { projects, homeProjects, byTrack, type Project } from '../../data/projects';
import {
  story,
  skillGroups,
  principles,
  foundingHeading,
  foundingLead,
  foundingReasons,
  faqs,
} from '../../data/about';
import en from '../../i18n/en.json';
import { NOTE_TYPES } from '../brain-types';
import {
  readFrontmatter,
  wikilinksToMarkdown,
  joinBlocks,
  link,
  slugify,
} from './render.mjs';

export const SITE = 'https://saifsiddiqui.in';

export interface PageMarkdown {
  /** Canonical page path, trailing slash, exactly as in the sitemap. */
  path: string;
  title: string;
  description: string;
  markdown: string;
}

const brainRaw = import.meta.glob('/brain/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const workRaw = import.meta.glob('/src/content/work/en/*.mdx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/* --- shared furniture --- */

/** Every page ends the same way: who this is, and where an agent goes next. */
const FOOTER = joinBlocks([
  '---',
  [
    `${profile.name}, ${profile.role}. ${profile.positioning}`,
    `Email: ${profile.email} · GitHub: ${profile.github} · LinkedIn: ${profile.linkedin} · Résumé (PDF): ${SITE}/resume`,
  ].join('\n'),
  [
    'More for agents:',
    `- ${link('/llms.txt', '/llms.txt')}: short summary of this site`,
    `- ${link('/llms-full.txt', '/llms-full.txt')}: the complete text of every page in one fetch`,
    `- ${link('/agents.md', '/agents.md')}: when to use this site, and how to query it`,
    `- ${link('/sitemap-index.xml', '/sitemap-index.xml')}: every URL, in seven languages`,
  ].join('\n'),
]).trim();

function head(path: string, title: string, description: string): string {
  return [
    `# ${title}`,
    '',
    `> ${description}`,
    '',
    `Canonical URL: ${SITE}${path} (this is its markdown representation; the same URL serves HTML to browsers)`,
  ].join('\n');
}

function page(
  path: string,
  title: string,
  description: string,
  blocks: (string | null)[],
): PageMarkdown {
  return {
    path,
    title,
    description,
    markdown: joinBlocks([head(path, title, description), ...blocks, FOOTER]),
  };
}

function projectLine(project: Project, index: number): string {
  const role = project.role === 'built-0-1' ? en.work.built01 : en.work.contributed;
  const links = project.links.map((l) => `${l.label}: ${l.href}`).join(', ');
  const caseStudy = project.featured
    ? `Case study: ${link(`/work/${project.id}/`, `/work/${project.id}/`)}`
    : null;
  return [
    `${String(index + 1).padStart(2, '0')}. **${project.name}** (${role} · ${project.scope})`,
    `   ${project.summary}`,
    links ? `   Links: ${links}` : null,
    caseStudy ? `   ${caseStudy}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

/* --- brain vault --- */

interface VaultNote {
  slug: string;
  title: string;
  type: string;
  status?: string;
  created?: string;
  tags: string[];
  body: string;
  outgoing: string[];
}

function buildVault(): VaultNote[] {
  const parsed = Object.entries(brainRaw)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, raw]) => {
      const basename = path.split('/').pop()!.replace(/\.md$/, '');
      const { data, body } = readFrontmatter(raw);
      return {
        basename,
        slug: slugify(basename),
        title: (data.title as string) ?? basename,
        type: (data.type as string) ?? 'note',
        status: data.status as string | undefined,
        created: data.created as string | undefined,
        tags: (data.tags as string[]) ?? [],
        body,
      };
    });

  /* Obsidian resolves [[wikilinks]] by note name, not by slug. */
  const slugByName = new Map<string, string>();
  for (const note of parsed) {
    slugByName.set(note.basename.toLowerCase(), note.slug);
    slugByName.set(note.title.toLowerCase(), note.slug);
  }

  return parsed.map((note) => {
    const outgoing = new Set<string>();
    const body = wikilinksToMarkdown(note.body, slugByName).replace(
      /\]\(\/brain\/([a-z0-9-]+)\/\)/g,
      (whole, slug: string) => {
        if (slug !== note.slug) outgoing.add(slug);
        return whole;
      },
    );
    return { ...note, body: body.trim(), outgoing: [...outgoing] };
  });
}

const vault = buildVault();
const noteBySlug = new Map(vault.map((n) => [n.slug, n]));

const backlinks = new Map<string, string[]>();
for (const note of vault) {
  for (const target of note.outgoing) {
    if (!backlinks.has(target)) backlinks.set(target, []);
    backlinks.get(target)!.push(note.slug);
  }
}

/* --- case studies --- */

interface CaseStudy {
  slug: string;
  title: string;
  description: string;
  role: string;
  stack: string[];
  order: number;
  body: string;
}

const caseStudies: CaseStudy[] = Object.entries(workRaw)
  .map(([path, raw]) => {
    const slug = path.split('/').pop()!.replace(/\.mdx$/, '');
    const { data, body } = readFrontmatter(raw);
    return {
      slug,
      title: (data.title as string) ?? slug,
      description: (data.description as string) ?? '',
      role: (data.role as string) === 'built-0-1' ? en.work.built01 : en.work.contributed,
      stack: (data.stack as string[]) ?? [],
      order: Number(data.order ?? 99),
      body: body.trim(),
    };
  })
  .sort((a, b) => a.order - b.order);

/* --- the pages --- */

function homePage(): PageMarkdown {
  return page('/', `${profile.name}: ${profile.role}`, en.site.description, [
    [
      `**${en.hero.positioning}**`,
      '',
      en.hero.intro,
      '',
      en.hero.eyebrow,
    ].join('\n'),
    `## ${en.work.heading}\n\n${homeProjects.map(projectLine).join('\n\n')}\n\nAll ${projects.length} projects: ${link('/work/', '/work/')}`,
    `## ${en.aboutTeaser.statement}\n\n${en.aboutTeaser.sub}\n\nFull story: ${link('/about/', '/about/')}`,
    [
      `## ${en.ask.heading}`,
      '',
      en.ask.lead,
      '',
      'It is a real retrieval agent over this site\'s own notes, not a canned FAQ. Agents can call it directly:',
      '',
      '```',
      `POST ${SITE}/api/ask`,
      'Content-Type: application/json',
      '',
      '{"question": "Has Saif built anything 0 to 1?"}',
      '```',
      '',
      'The response is a Server-Sent Events stream: one event per retrieval and',
      'tool step, then the answer with citations back to pages on this site.',
    ].join('\n'),
    `## ${en.open.heading}\n\n${en.open.lead}\n\nEvery decision behind this site is a note in a real Obsidian vault, rendered at ${link('/brain/', '/brain/')}.`,
    [
      `## ${en.contactBand.title}`,
      '',
      `${en.contactBand.availability}.`,
      '',
      `- Email: ${profile.email}`,
      `- Contact form: ${link('/contact/', '/contact/')}`,
      `- Résumé (PDF): ${SITE}/resume`,
    ].join('\n'),
  ]);
}

function aboutPage(): PageMarkdown {
  return page('/about/', `About ${profile.name}`, en.site.description, [
    story.join('\n\n'),
    `## ${en.how.stackNote}\n\n${skillGroups
      .map((group) => `**${group.label}.** ${group.items.join(', ')}.`)
      .join('\n\n')}`,
    `## ${en.how.heading}\n\n${principles
      .map((p, i) => `${String(i + 1).padStart(2, '0')}. **${p.title}.** ${p.body}`)
      .join('\n')}`,
    `## ${foundingHeading}\n\n${foundingLead}\n\n${foundingReasons
      .map((r) => `- **${r.lead}** ${r.body}`)
      .join('\n')}`,
    `## FAQ\n\n${faqs.map((f) => `### ${f.q}\n\n${f.a}`).join('\n\n')}`,
    `## Where he has shipped\n\n${employers.map((e) => `- ${e}`).join('\n')}`,
    `Get in touch: ${link('/contact/', '/contact/')}`,
  ]);
}

function workIndexPage(): PageMarkdown {
  const professional = byTrack('professional');
  const personal = byTrack('personal');
  return page('/work/', `${en.workIndex.title}: ${profile.name}`, en.workIndex.description, [
    en.workIndex.lead,
    `## ${en.work.professional}\n\n${professional.map(projectLine).join('\n\n')}`,
    `## ${en.work.personal}\n\n${personal
      .map((p, i) => projectLine(p, i + professional.length))
      .join('\n\n')}`,
  ]);
}

function caseStudyPage(study: CaseStudy): PageMarkdown {
  const project = projects.find((p) => p.id === study.slug);
  const links = project?.links.map((l) => `- ${l.label}: ${l.href}`).join('\n');
  return page(`/work/${study.slug}/`, study.title, study.description, [
    [
      `**${en.work.role}:** ${study.role}`,
      study.stack.length ? `**${en.work.stack}:** ${study.stack.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join('  \n'),
    links ? `**${en.work.links}**\n\n${links}` : null,
    study.body,
    `All work: ${link('/work/', '/work/')}`,
  ]);
}

function brainIndexPage(): PageMarkdown {
  const groups = NOTE_TYPES.map(({ type }) => ({
    type,
    label: en.brain.types[type as keyof typeof en.brain.types] ?? type,
    notes: vault
      .filter((n) => n.type === type)
      .sort((a, b) => a.title.localeCompare(b.title)),
  })).filter((g) => g.notes.length > 0);

  return page('/brain/', `${en.brain.title}: ${profile.name}`, en.brain.description, [
    en.brain.lead,
    ...groups.map(
      (group) =>
        `## ${group.label} (${group.notes.length})\n\n${group.notes
          .map((n) => `- ${link(n.title, `/brain/${n.slug}/`)}`)
          .join('\n')}`,
    ),
  ]);
}

function brainNotePage(note: VaultNote): PageMarkdown {
  const incoming = (backlinks.get(note.slug) ?? [])
    .map((slug) => noteBySlug.get(slug))
    .filter((n): n is VaultNote => Boolean(n))
    .sort((a, b) => a.title.localeCompare(b.title));

  const meta = [
    `**Type:** ${note.type}`,
    note.status ? `**Status:** ${note.status}` : null,
    note.created ? `**Created:** ${note.created}` : null,
    note.tags.length ? `**Tags:** ${note.tags.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('  \n');

  return page(
    `/brain/${note.slug}/`,
    note.title,
    `${note.title}: a note from the Obsidian vault behind ${SITE}.`,
    [
      meta,
      note.body,
      incoming.length
        ? `## ${en.brain.backlinks}\n\n${incoming
            .map((n) => `- ${link(n.title, `/brain/${n.slug}/`)}`)
            .join('\n')}`
        : null,
      `All notes: ${link('/brain/', '/brain/')}`,
    ],
  );
}

function contactPage(): PageMarkdown {
  return page('/contact/', `${en.contact.heading} ${profile.name}`, en.contact.lead, [
    en.contact.lead,
    [
      `## ${en.contact.directLead}`,
      '',
      `- Email: ${profile.email}`,
      `- GitHub: ${profile.github}`,
      `- LinkedIn: ${profile.linkedin}`,
      `- Résumé (PDF): ${SITE}/resume`,
    ].join('\n'),
    [
      '## Sending a message programmatically',
      '',
      'The contact form on the HTML page posts to a public endpoint. An agent',
      'acting on someone\'s behalf can post the same JSON:',
      '',
      '```',
      `POST ${SITE}/api/contact`,
      'Content-Type: application/json',
      '',
      '{"name": "...", "email": "...", "message": "..."}',
      '```',
      '',
      'It is rate limited. Email works just as well and needs no ceremony.',
    ].join('\n'),
  ]);
}

function analyticsPage(): PageMarkdown {
  const a = en.analytics;
  return page('/analytics/', `${a.title}: ${profile.name}`, a.description, [
    a.lead,
    'The dashboard itself is live and client-rendered: the numbers below the fold change as people visit, so this markdown describes the product rather than freezing a snapshot of it.',
    `## ${a.privacyHeading}\n\n### ${a.privacyMeasureHeading}\n\n${a.privacyMeasure
      .map((item) => `- ${item}`)
      .join('\n')}\n\n### ${a.privacyNotHeading}\n\n${a.privacyNot
      .map((item) => `- ${item}`)
      .join('\n')}`,
    `## What it is built from\n\n- A first-party tracker on this site, no third-party script\n- A Postgres events table\n- A Redis cache for the live counters\n\nThe decision behind it: ${link('/brain/d008-fully-custom-analytics/', '/brain/d008-fully-custom-analytics/')}`,
  ]);
}

function buildPages(): PageMarkdown[] {
  return [
    homePage(),
    aboutPage(),
    workIndexPage(),
    ...caseStudies.map(caseStudyPage),
    brainIndexPage(),
    ...vault.map(brainNotePage),
    contactPage(),
    analyticsPage(),
  ];
}

export const PAGES: PageMarkdown[] = buildPages();

/** Lookup key: no trailing slash, so "/about" and "/about/" agree. */
export function normalizePath(path: string): string {
  const [withoutQuery] = path.split(/[?#]/);
  const trimmed = withoutQuery.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

const byPath = new Map(PAGES.map((p) => [normalizePath(p.path), p]));

/** The markdown twin of a page path, or undefined if that page has none. */
export function pageMarkdownFor(path: string): PageMarkdown | undefined {
  return byPath.get(normalizePath(path));
}
