/**
 * The recovery map served on a 404, in both representations.
 *
 * A 404 that is only a status code tells an agent it took a wrong turn but
 * not where the right one was; it either gives up or starts guessing URLs.
 * These are the four machine-readable entry points plus the four sections,
 * so one failed fetch is enough to re-orient.
 */
import { profile } from '../../data/profile';

export interface RecoveryLink {
  href: string;
  note: string;
}

/** Machine-readable entry points first: an agent should not need the HTML. */
export const AGENT_ENTRY_POINTS: RecoveryLink[] = [
  { href: '/sitemap-index.xml', note: 'every URL on this site, in seven languages' },
  { href: '/llms.txt', note: 'short summary of who this is and what is here' },
  { href: '/llms-full.txt', note: 'the complete text of every page, in one fetch' },
  { href: '/agents.md', note: 'when to use this site, and how to query it' },
];

export const SECTIONS: RecoveryLink[] = [
  { href: '/', note: 'home' },
  { href: '/work/', note: 'case studies for every shipped product' },
  { href: '/about/', note: 'background, principles, skills, and an FAQ' },
  { href: '/brain/', note: 'the decision log behind this site' },
  { href: '/contact/', note: `contact form, or email ${profile.email}` },
];

export const NOT_FOUND_TITLE = 'Page not found';

export const NOT_FOUND_LEAD =
  'There is no page at this URL. This response is a real HTTP 404, not an app shell pretending the path exists.';

/** The markdown body of a 404, for agents that asked for text/markdown. */
export function notFoundMarkdown(): string {
  const list = (links: RecoveryLink[]) =>
    links.map((l) => `- [${l.href}](${l.href}): ${l.note}`).join('\n');

  return [
    `# 404: ${NOT_FOUND_TITLE}`,
    '',
    `> ${NOT_FOUND_LEAD}`,
    '',
    '## Start here instead',
    '',
    list(AGENT_ENTRY_POINTS),
    '',
    '## Pages on this site',
    '',
    list(SECTIONS),
    '',
    '## Or just ask',
    '',
    'POST a question to /api/ask and get an answer with citations back to pages',
    'on this site, retrieved from its own notes:',
    '',
    '```',
    'POST https://saifsiddiqui.in/api/ask',
    'Content-Type: application/json',
    '',
    '{"question": "What has Mohd Saif shipped?"}',
    '```',
    '',
  ].join('\n');
}
