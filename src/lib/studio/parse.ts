/**
 * Reading resume.tex as fields, without ever rewriting the file.
 *
 * The form edits text; the file keeps its comments, its spacing and its macro
 * definitions exactly as they are. That is why this returns character RANGES
 * rather than a parsed document: applying an edit replaces one span and leaves
 * every other byte untouched, so nothing can be lost in a round trip. A parser
 * that re-serialises the whole file would eventually drop something, and the
 * thing it drops would be a comment explaining why some \vspace is negative.
 *
 * The one hard part is that arguments nest: \resumeItem{... \texttt{device\_id}
 * ...} cannot be found by matching to the first closing brace, and some run
 * across lines. Hence a real brace scanner rather than a regex.
 */

export interface Field {
  id: string;
  /** What to call it in the form. */
  label: string;
  /** Which section of the form it belongs to. */
  group: string;
  value: string;
  /** Character range of the VALUE in the source, exclusive of the braces. */
  start: number;
  end: number;
  /** Long values get a textarea, short ones an input. */
  multiline?: boolean;
}

export interface ParsedResume {
  fields: Field[];
  /** Groups in the order they should appear. */
  groups: string[];
}

/**
 * Given the index of an opening brace, return the index just past its match.
 * Counts nesting and skips escaped braces, which is the whole reason this
 * exists rather than a regex.
 */
function matchBrace(source: string, open: number): number {
  if (source[open] !== '{') return -1;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (char === '\\') {
      i += 1; // an escaped character, including \{ and \}, never counts
      continue;
    }
    if (char === '%') {
      /* A comment runs to end of line and its braces are not real. */
      const nl = source.indexOf('\n', i);
      if (nl === -1) return -1;
      i = nl;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Every `{...}` group that immediately follows `at`, with their inner ranges. */
function readArgs(source: string, at: number, count: number): { start: number; end: number }[] {
  const args: { start: number; end: number }[] = [];
  let i = at;
  while (args.length < count) {
    while (i < source.length && /\s/.test(source[i])) i += 1;
    if (source[i] !== '{') break;
    const close = matchBrace(source, i);
    if (close === -1) break;
    args.push({ start: i + 1, end: close });
    i = close + 1;
  }
  return args;
}

/** Occurrences of a macro that are USES, not the \newcommand that defines it. */
function findUses(source: string, macro: string): number[] {
  const uses: number[] = [];
  const pattern = new RegExp(`\\\\${macro}(?![A-Za-z])`, 'g');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const before = source.slice(Math.max(0, match.index - 40), match.index);
    if (/\\(new|renew|provide)command\{\s*$/.test(before)) continue;
    /* A commented-out line is not a use. */
    const lineStart = source.lastIndexOf('\n', match.index) + 1;
    if (source.slice(lineStart, match.index).includes('%')) continue;
    uses.push(match.index + match[0].length);
  }
  return uses;
}

/** The body of a \newcommand or \renewcommand for one macro, if present. */
function findDefinition(
  source: string,
  macro: string,
  from = 0,
  to = source.length,
): { start: number; end: number } | null {
  const pattern = new RegExp(`\\\\(?:new|renew|provide)command\\{\\\\${macro}\\}`, 'g');
  pattern.lastIndex = from;
  const match = pattern.exec(source);
  if (!match || match.index > to) return null;
  const args = readArgs(source, match.index + match[0].length, 1);
  return args[0] ?? null;
}

const VARIANT_MACROS: [string, string][] = [
  ['summaryBody', 'Summary'],
  ['roleTitle', 'Job title at Zenzop and Infinite Locus'],
  ['skillsOrder', 'Order of the skill lines'],
  ['shoppinOrder', "Order of Shoppin' bullet groups"],
  ['shoppinIntro', "Shoppin' opening bullet"],
];

const SKILL_MACROS: [string, string][] = [
  ['skillMobile', 'Frontend and mobile'],
  ['skillBackend', 'Backend and APIs'],
  ['skillAI', 'AI and analytics'],
];

const SHOPPIN_GROUPS: [string, string][] = [
  ['shoppinAI', "Shoppin': AI work"],
  ['shoppinBackend', "Shoppin': backend"],
  ['shoppinOps', "Shoppin': ops and product"],
  ['shoppinApp', "Shoppin': app work"],
];

export function parseResume(source: string): ParsedResume {
  const fields: Field[] = [];
  const groups: string[] = [];
  const add = (field: Field) => {
    fields.push(field);
    if (!groups.includes(field.group)) groups.push(field.group);
  };

  /* --- the variant switches, base plus each override --- */
  for (const [macro, label] of VARIANT_MACROS) {
    const base = findDefinition(source, macro);
    if (base) {
      add({
        id: `base.${macro}`,
        label,
        group: 'Base (full stack)',
        value: source.slice(base.start, base.end),
        start: base.start,
        end: base.end,
        multiline: macro === 'summaryBody' || macro === 'shoppinIntro',
      });
    }
  }

  for (const variant of ['mobile', 'ai', 'product']) {
    const blockStart = source.indexOf(`\\ifdefstring{\\variant}{${variant}}`);
    if (blockStart === -1) continue;
    const nextBlock = source.indexOf('\\ifdefstring{\\variant}', blockStart + 10);
    const blockEnd = nextBlock === -1 ? source.indexOf('\\pagestyle', blockStart) : nextBlock;

    for (const [macro, label] of VARIANT_MACROS) {
      const found = findDefinition(source, macro, blockStart, blockEnd);
      if (!found || found.start > blockEnd) continue;
      add({
        id: `${variant}.${macro}`,
        label,
        group: `Variant: ${variant}`,
        value: source.slice(found.start, found.end),
        start: found.start,
        end: found.end,
        multiline: macro === 'summaryBody' || macro === 'shoppinIntro',
      });
    }
  }

  /* --- the skill lines --- */
  for (const [macro, label] of SKILL_MACROS) {
    const found = findDefinition(source, macro);
    if (!found) continue;
    add({
      id: `skill.${macro}`,
      label,
      group: 'Skills',
      value: source.slice(found.start, found.end),
      start: found.start,
      end: found.end,
      multiline: true,
    });
  }

  /* --- Shoppin' bullet groups: each holds several \resumeItem --- */
  for (const [macro, label] of SHOPPIN_GROUPS) {
    const found = findDefinition(source, macro);
    if (!found) continue;
    const bullets = findUses(source.slice(0, found.end), 'resumeItem').filter(
      (at) => at > found.start,
    );
    bullets.forEach((at, index) => {
      const args = readArgs(source, at, 1);
      if (!args[0]) return;
      add({
        id: `${macro}.${index}`,
        label: `${label}, bullet ${index + 1}`,
        group: "Shoppin' bullets",
        value: source.slice(args[0].start, args[0].end),
        start: args[0].start,
        end: args[0].end,
        multiline: true,
      });
    });
  }

  /* --- the other employers: heading plus its bullets --- */
  const headings = findUses(source, 'resumeSubheading');
  headings.forEach((at, index) => {
    const args = readArgs(source, at, 4);
    if (args.length < 4) return;
    const company = source.slice(args[0].start, args[0].end);
    const group = `Experience: ${company.replace(/\\/g, '').trim() || `entry ${index + 1}`}`;
    const labels = ['Company', 'Dates', 'Title', 'Location'];
    args.forEach((arg, argIndex) => {
      add({
        id: `job${index}.${labels[argIndex].toLowerCase()}`,
        label: labels[argIndex],
        group,
        value: source.slice(arg.start, arg.end),
        start: arg.start,
        end: arg.end,
      });
    });

    /* Bullets run until this entry's list ends. */
    const listEnd = source.indexOf('\\resumeItemListEnd', args[3].end);
    const stop = listEnd === -1 ? source.length : listEnd;
    findUses(source.slice(0, stop), 'resumeItem')
      .filter((bulletAt) => bulletAt > args[3].end)
      .forEach((bulletAt, bulletIndex) => {
        const bullet = readArgs(source, bulletAt, 1)[0];
        if (!bullet) return;
        add({
          id: `job${index}.bullet${bulletIndex}`,
          label: `Bullet ${bulletIndex + 1}`,
          group,
          value: source.slice(bullet.start, bullet.end),
          start: bullet.start,
          end: bullet.end,
          multiline: true,
        });
      });
  });

  /* --- projects --- */
  const projects = findUses(source, 'resumeProjectHeading');
  projects.forEach((at, index) => {
    const args = readArgs(source, at, 2);
    if (args.length < 2) return;
    const raw = source.slice(args[0].start, args[0].end);
    const name = raw.match(/\\textbf\{([^}]+)\}/)?.[1] ?? `Project ${index + 1}`;
    /* Education is laid out with the same macro as a project, so it would
       otherwise be labelled "Project: AKTU, Lucknow". */
    const isEducation = /Bachelor|B\.?Tech|University|College|AKTU|Coding Ninjas/i.test(raw);
    const group = isEducation ? 'Education' : `Project: ${name}`;
    add({
      id: `project${index}.heading`,
      label: 'Heading',
      group,
      value: raw,
      start: args[0].start,
      end: args[0].end,
      multiline: true,
    });
    add({
      id: `project${index}.links`,
      label: 'Links',
      group,
      value: source.slice(args[1].start, args[1].end),
      start: args[1].start,
      end: args[1].end,
      multiline: true,
    });

    const listEnd = source.indexOf('\\resumeItemListEnd', args[1].end);
    const stop = listEnd === -1 ? source.length : listEnd;
    findUses(source.slice(0, stop), 'resumeItem')
      .filter((bulletAt) => bulletAt > args[1].end)
      .forEach((bulletAt, bulletIndex) => {
        const bullet = readArgs(source, bulletAt, 1)[0];
        if (!bullet) return;
        add({
          id: `project${index}.bullet${bulletIndex}`,
          label: `Bullet ${bulletIndex + 1}`,
          group,
          value: source.slice(bullet.start, bullet.end),
          start: bullet.start,
          end: bullet.end,
          multiline: true,
        });
      });
  });

  return { fields, groups };
}

/**
 * Apply edited values back into the source.
 *
 * Right to left, so that replacing one span never shifts the offsets of the
 * spans not yet written. Everything outside the edited ranges is byte-identical
 * to what came in.
 */
export function applyFieldEdits(
  source: string,
  edits: { start: number; end: number; value: string }[],
): string {
  const ordered = [...edits].sort((a, b) => b.start - a.start);
  let out = source;
  for (const edit of ordered) {
    if (edit.start < 0 || edit.end > out.length || edit.start > edit.end) continue;
    out = out.slice(0, edit.start) + edit.value + out.slice(edit.end);
  }
  return out;
}
